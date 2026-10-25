-- 0008: borrar una importación de ventas subida por error.
-- Saca sus movimientos de stock (el stock vuelve a como estaba) y borra la importación con sus pedidos, pagos e ítems.
-- Solo gerencia. Idempotente (se puede volver a correr).

create or replace function public.borrar_importacion(p_import uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare imp public.ventas_import%rowtype; n_mov int; n_items int; n_ped int;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para borrar ventas' using errcode = '42501';
  end if;
  select * into imp from public.ventas_import where id = p_import for update;
  if not found then raise exception 'Esa importación ya no existe'; end if;

  select count(*) into n_items from public.ventas_items where import_id = p_import;
  select count(*) into n_ped from public.ventas_pedidos where import_id = p_import;
  delete from public.movimientos where ref_tipo = 'venta_import' and ref_id = p_import::text;
  get diagnostics n_mov = row_count;
  delete from public.ventas_import where id = p_import;   -- ítems, pedidos y pagos se borran en cascada

  return jsonb_build_object('local_id', imp.local_id, 'fecha', imp.fecha_desde, 'archivo', imp.archivo,
                            'movimientos', n_mov, 'items', n_items, 'pedidos', n_ped);
end $$;
revoke execute on function public.borrar_importacion(uuid) from public, anon;
grant execute on function public.borrar_importacion(uuid) to authenticated;
