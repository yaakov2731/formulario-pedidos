-- 0023 · La app vuelve a ser rápida con catálogos grandes (El Criollo, Servimar: ~8.900 productos y ~8.300 precios).
--   * Las políticas de seguridad (RLS) llamaban a mi_rol() / mi_local() / auth.uid() UNA VEZ POR FILA: cada página de
--     1000 productos evaluaba las ~8.900 filas varias veces (≈300 ms en la base y 2-4 s por página con el servidor ocupado).
--     Envolverlas en (select ...) hace que Postgres las calcule una sola vez por consulta (medido: 304 ms → 12 ms).
--     Las reglas no cambian: cada política dice exactamente lo mismo, solo se evalúa distinto.
--   * Índices para las claves foráneas que usan Stock, Recibir y Pedidos.
--   * Idempotente: se puede pegar más de una vez (lo ya envuelto no se vuelve a tocar).

do $$
declare
  r record;
  re constant text := '(?<!SELECT )(?<![.\w])((?:public\.)?(?:mi_rol|mi_local)|auth\.uid)\(\)';
  q text; c text; sql text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(r.qual, re, '(SELECT \1())', 'g');
    c := regexp_replace(r.with_check, re, '(SELECT \1())', 'g');
    if q is not distinct from r.qual and c is not distinct from r.with_check then continue; end if;
    sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if c is not null then sql := sql || format(' with check (%s)', c); end if;
    execute sql;
  end loop;
end $$;

create index if not exists movimientos_producto_idx   on public.movimientos (producto_id);
create index if not exists orden_items_producto_idx   on public.orden_items (producto_id);
create index if not exists ordenes_compra_local_idx   on public.ordenes_compra (local_id);
create index if not exists ordenes_compra_prov_idx    on public.ordenes_compra (proveedor_id);
create index if not exists precios_proveedor_idx      on public.precios (proveedor_id);
create index if not exists recepciones_orden_idx      on public.recepciones (orden_id);
create index if not exists recepciones_factura_idx    on public.recepciones (factura_id);
create index if not exists receta_items_insumo_idx    on public.receta_items (insumo_id);
create index if not exists facturas_locales_fact_idx  on public.facturas_locales (factura_id);
create index if not exists facturas_locales_prov_idx  on public.facturas_locales (proveedor_id);
create index if not exists facturas_proveedor_loc_idx on public.facturas_proveedor (local_id);
