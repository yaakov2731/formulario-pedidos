-- 0018 · Recibir mercadería con la factura del proveedor (también pedidos hechos fuera de la app).
--   * recepciones: una fila por factura recibida (local, proveedor, factura, pedido si había, archivo).
--   * recibir_con_factura(): en una sola transacción suma stock (movimientos 'recepcion'), guarda precios,
--     aprende cómo nombra el proveedor a cada producto (producto_alias origen 'proveedor', por local),
--     deja la factura cargada en Pagos y, si había un pedido abierto de ese proveedor y local, lo da por recibido.
--   * Solo gerencia. Idempotente: se puede pegar más de una vez.

create table if not exists public.recepciones (
  id             uuid primary key default gen_random_uuid(),
  local_id       uuid not null references public.locales(id),
  proveedor_id   uuid not null references public.proveedores(id),
  factura_id     uuid references public.facturas_proveedor(id) on delete set null,
  orden_id       uuid references public.ordenes_compra(id) on delete set null,
  numero_factura text,
  archivo        text,
  total          numeric(14,2),
  items          int not null default 0,
  creado_por     uuid default auth.uid(),
  creado_en      timestamptz not null default now()
);
create index if not exists recepciones_local_idx on public.recepciones(local_id, creado_en desc);
create unique index if not exists recepciones_factura_uq on public.recepciones(proveedor_id, local_id, numero_factura) where numero_factura is not null;

alter table public.recepciones enable row level security;
revoke all on public.recepciones from anon;
grant select on public.recepciones to authenticated;
drop policy if exists recepciones_ger on public.recepciones;
create policy recepciones_ger on public.recepciones for select to authenticated using (public.mi_rol() = 'gerencia');

-- p_items:   [{producto_id, cantidad, precio_unitario, alias}]   cantidad en unidad de compra; alias = cómo figura en la factura
-- p_factura: {numero, fecha, vencimiento, total, archivo, guardar}  (null = sin factura)
-- p_orden:   pedido abierto del mismo local y proveedor que esta factura cumple (null = pedido hecho fuera de la app)
create or replace function public.recibir_con_factura(p_local uuid, p_proveedor uuid, p_items jsonb,
  p_factura jsonb default null, p_orden uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v_prod public.productos%rowtype; o public.ordenes_compra%rowtype; oi public.orden_items%rowtype;
  v_qty numeric; v_pr numeric; v_previo numeric; v_alias text; v_num text; v_fac uuid; v_rec uuid;
  v_n int := 0; v_est text; v_completa boolean;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para recibir mercadería' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locales where id = p_local) then raise exception 'El local no existe'; end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor) then raise exception 'El proveedor no existe'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'No hay productos para recibir';
  end if;

  v_num := nullif(btrim(coalesce(p_factura->>'numero', '')), '');
  if v_num is not null and exists (select 1 from public.recepciones
       where proveedor_id = p_proveedor and local_id = p_local and numero_factura = v_num) then
    raise exception 'La factura % de este proveedor ya se recibió en este local', v_num;
  end if;

  if p_orden is not null then
    select * into o from public.ordenes_compra where id = p_orden for update;
    if not found then raise exception 'El pedido no existe'; end if;
    if o.local_id <> p_local or o.proveedor_id <> p_proveedor then raise exception 'El pedido es de otro local o proveedor'; end if;
    if o.estado not in ('enviada', 'parcial') then raise exception 'El pedido no está esperando mercadería (estado %)', o.estado; end if;
  end if;

  -- Factura en Pagos: si ya estaba cargada (mismo proveedor y número) se usa esa; si no, se crea cuando se pide guardarla.
  if v_num is not null then
    select id into v_fac from public.facturas_proveedor where proveedor_id = p_proveedor and numero = v_num;
    if v_fac is not null then
      update public.facturas_proveedor set archivo = coalesce(archivo, nullif(p_factura->>'archivo', '')) where id = v_fac;
    elsif coalesce((p_factura->>'guardar')::boolean, true) and nullif(p_factura->>'total', '') is not null then
      insert into public.facturas_proveedor(proveedor_id, numero, fecha, vencimiento, total, archivo)
        values (p_proveedor, v_num, coalesce(nullif(p_factura->>'fecha', '')::date, current_date),
                nullif(p_factura->>'vencimiento', '')::date, (p_factura->>'total')::numeric, nullif(p_factura->>'archivo', ''))
        returning id into v_fac;
    end if;
  end if;

  insert into public.recepciones(local_id, proveedor_id, factura_id, orden_id, numero_factura, archivo, total)
    values (p_local, p_proveedor, v_fac, p_orden, v_num, nullif(p_factura->>'archivo', ''), nullif(p_factura->>'total', '')::numeric)
    returning id into v_rec;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from public.productos where id = nullif(it->>'producto_id', '')::uuid;
    if not found then raise exception 'Producto % no existe', it->>'producto_id'; end if;
    if v_prod.local_id <> p_local then raise exception 'El producto % es de otro local', v_prod.nombre; end if;
    v_qty := coalesce(nullif(it->>'cantidad', '')::numeric, 0);
    if v_qty < 0 then raise exception 'Cantidad negativa en %', v_prod.nombre; end if;
    if v_qty = 0 then continue; end if;
    v_pr := nullif(it->>'precio_unitario', '')::numeric;
    if v_pr is not null and v_pr < 0 then raise exception 'Precio negativo en %', v_prod.nombre; end if;

    oi := null;
    if p_orden is not null then
      select * into oi from public.orden_items where orden_id = p_orden and producto_id = v_prod.id;
    end if;
    insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
      values (p_local, v_prod.id, 'recepcion', round(v_qty * v_prod.factor_conversion, 3),
              case when oi.id is not null then 'orden' else 'recepcion' end,
              case when oi.id is not null then p_orden::text else v_rec::text end,
              'Recepción con factura' || coalesce(' ' || v_num, ''));
    if oi.id is not null then
      update public.orden_items set cantidad_recibida = coalesce(cantidad_recibida, 0) + v_qty where id = oi.id;
      if v_pr is not null then
        insert into public.orden_item_precios(orden_item_id, precio_unitario) values (oi.id, v_pr)
          on conflict (orden_item_id) do update set precio_unitario = excluded.precio_unitario;
      end if;
    end if;
    if v_pr is not null then
      select precio into v_previo from public.precios where producto_id = v_prod.id order by fecha desc, id limit 1;
      if v_previo is distinct from v_pr then
        insert into public.precios(producto_id, proveedor_id, precio, origen) values (v_prod.id, p_proveedor, v_pr, 'factura');
      end if;
    end if;
    -- La próxima factura de este proveedor encuentra el producto sola.
    v_alias := nullif(btrim(coalesce(it->>'alias', '')), '');
    if v_alias is not null and public.norm(v_alias) <> public.norm(v_prod.nombre) then
      delete from public.producto_alias where origen = 'proveedor' and local_id = p_local and public.norm(alias) = public.norm(v_alias);
      insert into public.producto_alias(producto_id, alias, origen, local_id) values (v_prod.id, v_alias, 'proveedor', p_local);
    end if;
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'No hay productos para recibir'; end if;
  update public.recepciones set items = v_n where id = v_rec;

  if p_orden is not null then
    select coalesce(bool_and(coalesce(cantidad_recibida, 0) >= cantidad_pedida), true) into v_completa
      from public.orden_items where orden_id = p_orden;
    v_est := case when v_completa then 'recibida' else 'parcial' end;
    update public.ordenes_compra set estado = v_est where id = p_orden;
  end if;

  return jsonb_build_object('recepcion_id', v_rec, 'factura_id', v_fac, 'items', v_n, 'estado_orden', v_est);
end $$;
revoke execute on function public.recibir_con_factura(uuid, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.recibir_con_factura(uuid, uuid, jsonb, jsonb, uuid) to authenticated;

