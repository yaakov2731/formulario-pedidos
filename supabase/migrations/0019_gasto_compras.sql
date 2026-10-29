-- 0019 · Cuánto se lleva gastado en compras + Recibo X.
--   * facturas_proveedor: tipo de comprobante (Factura A/B/C, Recibo X, Otro), local que compró y categoría del gasto.
--     El Recibo X (comprobante no fiscal, compra sin factura) se carga igual que una factura: suma al gasto y a la cuenta del proveedor.
--   * La categoría se completa sola si no se pone: la de los productos recibidos con esa factura o, si no, la más común
--     de los productos de ese proveedor. El local se completa solo cuando la factura entra por "Recibir con factura".
--   * gastos_compras: vista para el tablero de gasto (por período, local, razón social, proveedor, categoría, tipo, pagado/pendiente).
--   * recibir_con_factura(): igual que en 0018, más tipo, local y categoría de la factura que crea.
--   * Idempotente: se puede pegar más de una vez.

-- ============ 1) Columnas nuevas ============
alter table public.facturas_proveedor add column if not exists tipo text;
alter table public.facturas_proveedor add column if not exists local_id uuid references public.locales(id) on delete set null;
alter table public.facturas_proveedor add column if not exists categoria text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_proveedor_tipo_chk') then
    alter table public.facturas_proveedor add constraint facturas_proveedor_tipo_chk
      check (tipo is null or tipo in ('Factura A', 'Factura B', 'Factura C', 'Recibo X', 'Otro'));
  end if;
end $$;
create index if not exists facturas_prov_fecha_idx on public.facturas_proveedor(fecha);

-- ============ 2) Categoría automática ============
-- La categoría más común de los productos activos de un proveedor (sin los platos de la carta).
create or replace function public.categoria_de_proveedor(p_proveedor uuid)
returns text language sql stable security definer set search_path = public as $$
  select categoria from public.productos
  where proveedor_id = p_proveedor and activo and categoria is not null and categoria <> 'Carta'
  group by categoria order by count(*) desc, categoria limit 1
$$;
revoke execute on function public.categoria_de_proveedor(uuid) from public, anon;
grant execute on function public.categoria_de_proveedor(uuid) to authenticated;

create or replace function public.facturas_completar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.categoria := nullif(btrim(coalesce(new.categoria, '')), '');
  if new.categoria is null then new.categoria := public.categoria_de_proveedor(new.proveedor_id); end if;
  return new;
end $$;
drop trigger if exists facturas_completar on public.facturas_proveedor;
create trigger facturas_completar before insert on public.facturas_proveedor
  for each row execute function public.facturas_completar();

-- ============ 3) Datos que ya estaban ============
-- Local: el de la recepción con la que entró la factura.
update public.facturas_proveedor f set local_id = r.local_id
  from public.recepciones r where r.factura_id = f.id and f.local_id is null;
-- Categoría: la de los productos recibidos con esa factura; si no hay, la del proveedor.
update public.facturas_proveedor f set categoria = x.categoria
  from (select r.factura_id, (select p.categoria from public.movimientos m join public.productos p on p.id = m.producto_id
                               where m.ref_tipo = 'recepcion' and m.ref_id = r.id::text and p.categoria is not null and p.categoria <> 'Carta'
                               group by p.categoria order by count(*) desc, p.categoria limit 1) as categoria
        from public.recepciones r where r.factura_id is not null) x
  where x.factura_id = f.id and f.categoria is null and x.categoria is not null;
update public.facturas_proveedor set categoria = public.categoria_de_proveedor(proveedor_id) where categoria is null;

-- ============ 4) Vista del gasto ============
create or replace view public.gastos_compras with (security_invoker = true) as
  select f.id, f.proveedor_id, pr.nombre as proveedor, f.numero, coalesce(f.tipo, 'Factura') as tipo,
         (f.tipo = 'Recibo X') as es_x, f.fecha, f.vencimiento, f.total, f.archivo, f.creado_en,
         f.local_id, l.nombre as local, coalesce(l.razon_social, 'Sin razón social') as razon_social,
         coalesce(f.categoria, 'Sin categoría') as categoria,
         coalesce(i.imputado, 0) as imputado,
         greatest(f.total - coalesce(i.imputado, 0), 0) as pendiente,
         (f.total - coalesce(i.imputado, 0) < 1) as pagada,
         (f.vencimiento is not null and f.vencimiento < current_date and f.total - coalesce(i.imputado, 0) >= 1) as vencida
  from public.facturas_proveedor f
  join public.proveedores pr on pr.id = f.proveedor_id
  left join public.locales l on l.id = f.local_id
  left join (select factura_id, sum(monto) as imputado from public.pago_facturas group by factura_id) i on i.factura_id = f.id;
revoke all on public.gastos_compras from anon;
grant select on public.gastos_compras to authenticated;

-- ============ 5) Recibir con factura: guarda tipo, local y categoría ============
-- p_factura: {numero, tipo, fecha, vencimiento, total, archivo, guardar}  (resto igual que 0018)
create or replace function public.recibir_con_factura(p_local uuid, p_proveedor uuid, p_items jsonb,
  p_factura jsonb default null, p_orden uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v_prod public.productos%rowtype; o public.ordenes_compra%rowtype; oi public.orden_items%rowtype;
  v_qty numeric; v_pr numeric; v_previo numeric; v_alias text; v_num text; v_fac uuid; v_rec uuid;
  v_n int := 0; v_est text; v_completa boolean; v_tipo text; v_cat text; v_nueva boolean := false;
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
  v_tipo := nullif(btrim(coalesce(p_factura->>'tipo', '')), '');
  if v_tipo is not null and v_tipo not in ('Factura A', 'Factura B', 'Factura C', 'Recibo X', 'Otro') then v_tipo := 'Otro'; end if;
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
      update public.facturas_proveedor set archivo = coalesce(archivo, nullif(p_factura->>'archivo', '')),
             tipo = coalesce(tipo, v_tipo), local_id = coalesce(local_id, p_local) where id = v_fac;
    elsif coalesce((p_factura->>'guardar')::boolean, true) and nullif(p_factura->>'total', '') is not null then
      insert into public.facturas_proveedor(proveedor_id, numero, tipo, local_id, fecha, vencimiento, total, archivo)
        values (p_proveedor, v_num, v_tipo, p_local, coalesce(nullif(p_factura->>'fecha', '')::date, current_date),
                nullif(p_factura->>'vencimiento', '')::date, (p_factura->>'total')::numeric, nullif(p_factura->>'archivo', ''))
        returning id into v_fac;
      v_nueva := true;
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

  -- Categoría del gasto de una factura nueva: la que más se repite entre los productos recibidos.
  if v_nueva then
    select p.categoria into v_cat from jsonb_array_elements(p_items) e join public.productos p on p.id = nullif(e->>'producto_id', '')::uuid
      where coalesce(nullif(e->>'cantidad', '')::numeric, 0) > 0 and p.categoria is not null and p.categoria <> 'Carta'
      group by p.categoria order by count(*) desc, p.categoria limit 1;
    if v_cat is not null then update public.facturas_proveedor set categoria = v_cat where id = v_fac; end if;
  end if;

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

notify pgrst, 'reload schema';
