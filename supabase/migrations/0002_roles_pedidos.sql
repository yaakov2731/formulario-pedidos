-- 0002_roles_pedidos.sql · Roles definitivos: único administrador = gerencia (Jacobo).
-- El encargado solo puede crear/editar órdenes en borrador de su local (y sus ítems), ver el catálogo
-- y el stock de su local. No escribe movimientos (recepciones, mermas, conteos) ni nada más. Idempotente.

-- 1) Encargado sin escritura de movimientos (registrar_conteo también queda bloqueado por RLS).
drop policy if exists mov_enc_ins on public.movimientos;

-- 2) Órdenes: quién cargó el pedido y una nota opcional.
alter table public.ordenes_compra add column if not exists cargado_por_nombre text;
alter table public.ordenes_compra add column if not exists nota text;

-- 3) Ítems de orden: el encargado solo agrega productos de su propio local, en borradores de su local.
drop policy if exists oi_enc_mod on public.orden_items;
create policy oi_enc_mod on public.orden_items for all to authenticated
  using (public.mi_rol() = 'encargado'
         and exists (select 1 from public.ordenes_compra o
                     where o.id = orden_id and o.local_id = public.mi_local() and o.estado = 'borrador'))
  with check (public.mi_rol() = 'encargado'
         and exists (select 1 from public.ordenes_compra o
                     where o.id = orden_id and o.local_id = public.mi_local() and o.estado = 'borrador')
         and exists (select 1 from public.productos p
                     where p.id = producto_id and p.local_id = public.mi_local()));

-- 4) Proveedores sin datos sensibles ni el monto del pedido mínimo (solo si tiene o no).
drop view if exists public.proveedores_basico;
create view public.proveedores_basico as
  select id, nombre, dias_entrega, corte,
         (coalesce(pedido_minimo, 0) > 0) as tiene_minimo, activo
  from public.proveedores
  where public.mi_rol() is not null;
revoke all on public.proveedores_basico from anon;
grant select on public.proveedores_basico to authenticated;

-- 5) Funciones de rol: no ejecutables por anon.
revoke execute on function public.mi_rol(), public.mi_local() from public, anon;
grant execute on function public.mi_rol(), public.mi_local() to authenticated;

-- 6) Lista de locales para la pantalla "Entrar" (antes de iniciar sesión): solo código, nombre y encargados.
create or replace function public.locales_login()
returns table (codigo text, nombre text, encargados text[])
language sql stable security definer set search_path = public as $$
  select l.codigo, l.nombre, l.encargados from public.locales l where l.activo order by l.nombre
$$;
revoke execute on function public.locales_login() from public;
grant execute on function public.locales_login() to anon, authenticated;

-- 7) Pedidos sin proveedor llegan a gerencia, que asigna el proveedor antes de aprobar.
alter table public.ordenes_compra alter column proveedor_id drop not null;

-- 7b) Desempate del "último precio" cuando hay varios el mismo día: por hora de carga.
alter table public.precios add column if not exists creado_en timestamptz not null default now();
create or replace view public.precio_actual with (security_invoker = true) as
  select distinct on (producto_id) producto_id, proveedor_id, precio, fecha, origen
  from public.precios
  order by producto_id, fecha desc, creado_en desc, id;

-- 8) Recepción transaccional (todo o nada). p_items: [{orden_item_id, cantidad_recibida, precio_unitario}]
--    cantidad_recibida = lo que llegó ahora (se suma a lo recibido antes). Devuelve el estado final.
create or replace function public.recibir_orden(p_orden uuid, p_items jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_compra%rowtype;
  it jsonb; oi public.orden_items%rowtype; fac numeric; qty numeric; pr numeric; previo numeric; completa boolean; est text;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para recibir órdenes' using errcode = '42501';
  end if;
  select * into o from public.ordenes_compra where id = p_orden for update;
  if not found then raise exception 'La orden no existe'; end if;
  if o.estado not in ('enviada', 'parcial') then raise exception 'La orden no está esperando mercadería (estado %)', o.estado; end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into oi from public.orden_items where id = (it->>'orden_item_id')::uuid and orden_id = p_orden;
    if not found then raise exception 'Ítem % no pertenece a la orden', it->>'orden_item_id'; end if;
    qty := coalesce(nullif(it->>'cantidad_recibida', '')::numeric, 0);
    if qty < 0 then raise exception 'Cantidad negativa'; end if;
    pr := nullif(it->>'precio_unitario', '')::numeric;
    if qty > 0 then
      select factor_conversion into fac from public.productos where id = oi.producto_id;
      insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
        values (o.local_id, oi.producto_id, 'recepcion', round(qty * fac, 3), 'orden', p_orden::text, 'Recepción de orden');
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

  select coalesce(bool_and(coalesce(cantidad_recibida, 0) >= cantidad_pedida), true) into completa
    from public.orden_items where orden_id = p_orden;
  est := case when completa then 'recibida' else 'parcial' end;
  update public.ordenes_compra set estado = est where id = p_orden;
  return est;
end $$;
revoke execute on function public.recibir_orden(uuid, jsonb) from public, anon;
grant execute on function public.recibir_orden(uuid, jsonb) to authenticated;
