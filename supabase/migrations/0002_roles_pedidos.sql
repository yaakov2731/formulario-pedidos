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
