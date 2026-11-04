-- 0025 · Contar por lugar: dónde está cada producto en el local (Cámara, Freezer, Depósito, Barra…) y en qué orden se cuenta.
--   * productos.lugar: nombre del lugar (texto libre; vacío = sin lugar).
--   * productos.orden_lugar: orden del recorrido dentro del local. Define el orden de los lugares (el primero que aparece)
--     y el orden de los productos dentro de cada lugar, como están en los estantes.
--   * ubicar_productos(): gerencia guarda lugar y orden de varios productos de una vez (Stock → Lugares).
--   * El encargado solo los lee: en Contar elige un lugar y ve lo que hay ahí, en orden, con su avance.
--   * Idempotente: se puede pegar más de una vez.

alter table public.productos add column if not exists lugar text;
alter table public.productos add column if not exists orden_lugar integer;
create index if not exists productos_lugar_idx on public.productos (local_id, orden_lugar);

-- p_items: [{id, lugar, orden}]. lugar vacío o null = sin lugar. Devuelve cuántos productos cambió.
create or replace function public.ubicar_productos(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb; n integer := 0; c integer;
begin
  if public.mi_rol() <> 'gerencia' then
    raise exception 'Solo gerencia ordena los lugares' using errcode = '42501';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update public.productos
       set lugar = nullif(btrim(e->>'lugar'), ''),
           orden_lugar = case when nullif(btrim(e->>'lugar'), '') is null then null else nullif(e->>'orden', '')::integer end
     where id = (e->>'id')::uuid;
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end $$;
revoke all on function public.ubicar_productos(jsonb) from public, anon;
grant execute on function public.ubicar_productos(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tienen que salir 2 columnas y la función.
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'productos' and column_name in ('lugar', 'orden_lugar')
union all
select 'funcion ' || proname from pg_proc where proname = 'ubicar_productos';
