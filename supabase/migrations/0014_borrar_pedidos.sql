-- 0014: borrar todos los pedidos (para limpiar las pruebas antes de usar la app en serio).
-- Borra todas las órdenes de compra con sus productos y precios recibidos, y saca del stock lo que entró
-- por recepciones de esas órdenes (el stock vuelve a como estaba antes de recibirlas).
-- No toca catálogo, proveedores, precios de lista, ventas, recetas, producción ni pagos.
-- Solo gerencia y pidiendo la palabra BORRAR. Idempotente (se puede volver a correr).

create or replace function public.borrar_todos_los_pedidos(p_confirmacion text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_ord int; n_items int; n_mov int;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para borrar pedidos' using errcode = '42501';
  end if;
  if coalesce(upper(trim(p_confirmacion)), '') <> 'BORRAR' then
    raise exception 'Escribí BORRAR para confirmar';
  end if;

  lock table public.ordenes_compra in exclusive mode;
  select count(*) into n_items from public.orden_items;
  delete from public.movimientos where ref_tipo = 'orden';
  get diagnostics n_mov = row_count;
  delete from public.ordenes_compra where true;   -- productos y precios recibidos se borran en cascada
  get diagnostics n_ord = row_count;

  return jsonb_build_object('pedidos', n_ord, 'items', n_items, 'movimientos', n_mov);
end $$;
revoke execute on function public.borrar_todos_los_pedidos(text) from public, anon;
grant execute on function public.borrar_todos_los_pedidos(text) to authenticated;
