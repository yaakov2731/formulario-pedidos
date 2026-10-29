-- 0020 · Recibir: corregir el pedido con lo que realmente trajo el proveedor.
--   * orden_items.agregado: producto que no estaba en el pedido y llegó igual (se agrega al recibir, pedido 0).
--   * orden_items.no_vino:  producto pedido que no va a venir. Lo pedido queda registrado; el faltante es
--                           cantidad_pedida - cantidad_recibida. El pedido ya no espera ese producto.
--   * recibir_orden(p_orden, p_items, p_cerrar):
--       p_items: [{orden_item_id | producto_id, cantidad_recibida, precio_unitario, no_vino}]
--                con producto_id (sin orden_item_id) es un producto agregado al recibir: tiene que ser del mismo local.
--       p_cerrar: true = lo que llegó de menos no va a venir (se marca no_vino y el pedido queda recibido).
--     Sigue funcionando la llamada vieja (solo orden_item_id, sin p_cerrar).
--   * Solo gerencia. Idempotente: se puede pegar más de una vez.

alter table public.orden_items add column if not exists agregado boolean not null default false;
alter table public.orden_items add column if not exists no_vino  boolean not null default false;

-- La versión anterior tenía dos parámetros: se borra para que no queden dos funciones con el mismo nombre.
drop function if exists public.recibir_orden(uuid, jsonb);

create or replace function public.recibir_orden(p_orden uuid, p_items jsonb, p_cerrar boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_compra%rowtype;
  it jsonb; oi public.orden_items%rowtype; v_prod public.productos%rowtype;
  qty numeric; pr numeric; previo numeric; completa boolean; est text;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para recibir órdenes' using errcode = '42501';
  end if;
  select * into o from public.ordenes_compra where id = p_orden for update;
  if not found then raise exception 'La orden no existe'; end if;
  if o.estado not in ('enviada', 'parcial') then raise exception 'La orden no está esperando mercadería (estado %)', o.estado; end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    qty := coalesce(nullif(it->>'cantidad_recibida', '')::numeric, 0);
    if qty < 0 then raise exception 'Cantidad negativa'; end if;
    pr := nullif(it->>'precio_unitario', '')::numeric;
    if pr is not null and pr < 0 then raise exception 'Precio negativo'; end if;

    oi := null;
    if nullif(it->>'orden_item_id', '') is not null then
      select * into oi from public.orden_items where id = (it->>'orden_item_id')::uuid and orden_id = p_orden;
      if not found then raise exception 'Ítem % no pertenece a la orden', it->>'orden_item_id'; end if;
    else
      -- Producto que no estaba en el pedido.
      select * into v_prod from public.productos where id = nullif(it->>'producto_id', '')::uuid;
      if not found then raise exception 'Producto % no existe', it->>'producto_id'; end if;
      if v_prod.local_id <> o.local_id then raise exception 'El producto % es de otro local', v_prod.nombre; end if;
      select * into oi from public.orden_items where orden_id = p_orden and producto_id = v_prod.id;
      if not found then
        if qty = 0 then continue; end if;
        insert into public.orden_items(orden_id, producto_id, cantidad_pedida, cantidad_recibida, agregado)
          values (p_orden, v_prod.id, 0, 0, true) returning * into oi;
      end if;
    end if;

    if coalesce((it->>'no_vino')::boolean, false) then
      update public.orden_items set no_vino = true where id = oi.id;
    end if;

    if qty > 0 then
      select * into v_prod from public.productos where id = oi.producto_id;
      insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
        values (o.local_id, oi.producto_id, 'recepcion', round(qty * v_prod.factor_conversion, 3), 'orden', p_orden::text,
                case when oi.agregado then 'Recepción de orden (no estaba en el pedido)' else 'Recepción de orden' end);
      update public.orden_items set cantidad_recibida = coalesce(cantidad_recibida, 0) + qty where id = oi.id;
      if pr is not null then
        insert into public.orden_item_precios(orden_item_id, precio_unitario) values (oi.id, pr)
          on conflict (orden_item_id) do update set precio_unitario = excluded.precio_unitario;
        select precio into previo from public.precios where producto_id = oi.producto_id order by fecha desc, creado_en desc, id limit 1;
        if previo is distinct from pr then
          insert into public.precios(producto_id, proveedor_id, precio, origen) values (oi.producto_id, o.proveedor_id, pr, 'recepcion');
        end if;
      end if;
    end if;
  end loop;

  if coalesce(p_cerrar, false) then
    update public.orden_items set no_vino = true
     where orden_id = p_orden and coalesce(cantidad_recibida, 0) < cantidad_pedida;
  end if;

  select coalesce(bool_and(no_vino or coalesce(cantidad_recibida, 0) >= cantidad_pedida), true) into completa
    from public.orden_items where orden_id = p_orden;
  est := case when completa then 'recibida' else 'parcial' end;
  update public.ordenes_compra set estado = est where id = p_orden;
  return est;
end $$;
revoke execute on function public.recibir_orden(uuid, jsonb, boolean) from public, anon;
grant execute on function public.recibir_orden(uuid, jsonb, boolean) to authenticated;

-- Control: debería mostrar las dos columnas nuevas y la función con 3 parámetros.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'orden_items' and column_name in ('agregado', 'no_vino');
select pg_get_function_identity_arguments(p.oid) as parametros
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'recibir_orden';
