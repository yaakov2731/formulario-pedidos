-- 0017: productos que se venden tal cual (pulseras del inflable, aguas, gaseosas…).
-- Al importar ventas, lo que no estaba asociado se podía crear como "plato" (elaborado, categoría Carta). Un plato
-- sin receta no descuenta nada y no aparece en Stock ni en Pedir: las 35 pulseras de Gelato del 23/10 no bajaron el stock.
--   * vender_tal_cual(plato, producto, cantidad): el código de Núcleo del plato pasa a descontar un producto del stock
--     (cantidad por venta, casi siempre 1). Las ventas ya importadas se pasan a ese producto y su stock se recalcula.
--     El plato queda inactivo (no se borra).
--     Sin producto: el plato mismo se convierte en producto con stock (deja de ser plato, unidad "unidad").
--   * Arreglo de datos: en Gelato, PULSERA-PASE (PROM-0027) pasa a descontar "Pulseras para inflables" (GEL-088).
-- Solo gerencia. Idempotente (se puede volver a correr).

-- ============ 1) Recalcular el stock que descontó una importación de ventas ============
-- Interna: borra los movimientos de la importación y los vuelve a generar con la misma regla de importar_ventas.
create or replace function public._recalcular_venta_import(p_import uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare imp public.ventas_import%rowtype; ts timestamptz; n int; n_mov int := 0;
begin
  select * into imp from public.ventas_import where id = p_import;
  if not found then return 0; end if;
  select min(creado_en) into ts from public.movimientos where ref_tipo = 'venta_import' and ref_id = p_import::text;
  ts := coalesce(ts, least((imp.fecha_desde::text || ' 23:59:00-03')::timestamptz, now()));
  delete from public.movimientos where ref_tipo = 'venta_import' and ref_id = p_import::text;

  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota, creado_en)
    select imp.local_id, i.producto_id, 'venta', -round(sum(i.cantidad * i.factor), 3), 'venta_import', p_import::text, 'Ventas ' || imp.fecha_desde, ts
    from public.ventas_items i join public.productos p on p.id = i.producto_id
    where i.import_id = p_import and not i.no_descontar and not p.es_elaborado
    group by i.producto_id
    having round(sum(i.cantidad * i.factor), 3) > 0;
  get diagnostics n = row_count; n_mov := n_mov + n;

  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota, creado_en)
    select imp.local_id, ri.insumo_id, 'venta', -round(sum(ri.cantidad * v.vendidos / r.rinde), 3), 'venta_import', p_import::text,
           'Ventas ' || imp.fecha_desde || ' (platos)', ts
    from (select i.producto_id, sum(i.cantidad * i.factor) as vendidos
          from public.ventas_items i join public.productos p on p.id = i.producto_id
          where i.import_id = p_import and not i.no_descontar and p.es_elaborado
          group by i.producto_id) v
    join public.recetas r on r.producto_id = v.producto_id
    join public.receta_items ri on ri.receta_id = r.id
    group by ri.insumo_id
    having round(sum(ri.cantidad * v.vendidos / r.rinde), 3) > 0;
  get diagnostics n = row_count; n_mov := n_mov + n;
  return n_mov;
end $$;
revoke execute on function public._recalcular_venta_import(uuid) from public, anon, authenticated;

-- ============ 2) Pasar un plato a "se vende tal cual" (interna, sin chequeo de rol) ============
create or replace function public._vender_tal_cual(p_plato uuid, p_producto uuid, p_cantidad numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare pla public.productos%rowtype; prod public.productos%rowtype; destino uuid; imps uuid[]; x uuid; n_items int;
begin
  select * into pla from public.productos where id = p_plato for update;
  if not found then raise exception 'El plato no existe'; end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad por venta tiene que ser mayor a cero'; end if;
  select array_agg(distinct import_id) into imps from public.ventas_items where producto_id = p_plato;

  if p_producto is null or p_producto = p_plato then
    -- El plato mismo pasa a ser un producto con stock.
    if not pla.es_elaborado then raise exception '% ya es un producto con stock', pla.nombre; end if;
    delete from public.recetas where producto_id = p_plato;
    update public.productos set es_elaborado = false,
           categoria = case when categoria = 'Carta' then 'Reventa' else categoria end,
           unidad_uso = case when unidad_uso = 'porción' then 'unidad' else unidad_uso end,
           unidad_compra = coalesce(nullif(unidad_compra, 'porción'), 'unidad'),
           activo = true
      where id = p_plato;
    update public.producto_alias set cantidad_por_venta = p_cantidad where producto_id = p_plato and origen = 'nucleo';
    update public.ventas_items set factor = p_cantidad where producto_id = p_plato;
    get diagnostics n_items = row_count;
    destino := p_plato;
  else
    select * into prod from public.productos where id = p_producto;
    if not found then raise exception 'El producto no existe'; end if;
    if prod.local_id <> pla.local_id then raise exception '% es de otro local', prod.nombre; end if;
    if prod.es_elaborado then raise exception '% es un plato o elaborado: elegí un producto que se cuenta en el stock', prod.nombre; end if;
    update public.producto_alias set producto_id = p_producto, cantidad_por_venta = p_cantidad where producto_id = p_plato and origen = 'nucleo';
    update public.ventas_items set producto_id = p_producto, factor = p_cantidad where producto_id = p_plato;
    get diagnostics n_items = row_count;
    update public.productos set activo = true where id = p_producto and not activo;
    update public.productos set activo = false where id = p_plato;
    destino := p_producto;
  end if;

  if imps is not null then
    foreach x in array imps loop perform public._recalcular_venta_import(x); end loop;
  end if;
  return jsonb_build_object('producto_id', destino, 'items', n_items, 'importaciones', coalesce(array_length(imps, 1), 0));
end $$;
revoke execute on function public._vender_tal_cual(uuid, uuid, numeric) from public, anon, authenticated;

-- ============ 3) RPC para la app (solo gerencia) ============
create or replace function public.vender_tal_cual(p_plato uuid, p_producto uuid default null, p_cantidad numeric default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.mi_rol() is distinct from 'gerencia' then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return public._vender_tal_cual(p_plato, p_producto, p_cantidad);
end $$;
revoke execute on function public.vender_tal_cual(uuid, uuid, numeric) from public, anon;
grant execute on function public.vender_tal_cual(uuid, uuid, numeric) to authenticated;

-- ============ 4) Arreglo de datos: pulseras del inflable de Gelato ============
-- PULSERA-PASE (código de Núcleo PROM-0027) se había creado como plato. Pasa a descontar "Pulseras para inflables" (GEL-088).
select public._vender_tal_cual(pla.id, ins.id, 1)
from public.productos pla
join public.locales l on l.id = pla.local_id and l.codigo = 'GEL'
join public.productos ins on ins.local_id = pla.local_id and ins.codigo = 'GEL-088' and not ins.es_elaborado
where pla.codigo = 'PLA-PROM-0027' and pla.es_elaborado and pla.activo;
