-- 0004_pagos_tablero.sql · Facturas, pagos con comprobante, avisos al proveedor y tablero de gerencia.
-- Se aplica después de 0001, 0002 y 0003. Idempotente (se puede volver a correr).
--   * Pagos y facturas: solo gerencia y contadora (el encargado nunca). La contadora no ve ventas ni el tablero.
--   * registrar_pago(): guarda el pago y sus imputaciones a facturas en una sola transacción.
--   * tablero(): una sola llamada con todo lo que muestra el inicio de gerencia.
--   * sugerido_pedido(): ajuste de la fase 2 (divide por las semanas con ventas importadas, mínimo 1 y máximo 4).

-- ============ 1) Ajuste de fase 2 · sugerido_pedido ============
-- consumo_semanal = (ventas + consumo de producción + mermas de los últimos 28 días) / semanas con datos de ventas del local.
-- Semanas con datos = semanas transcurridas desde la primera venta importada de los últimos 28 días (mínimo 1, máximo 4):
-- un local que recién empieza a importar ventas no queda con un sugerido bajo por dividir siempre por 4.
-- Sigue siendo security invoker: el encargado solo ve su local por RLS y la función no toca precios.
create or replace function public.sugerido_pedido(p_local uuid)
returns table (producto_id uuid, stock numeric, consumo_semanal numeric, pendiente numeric, sugerido numeric)
language sql stable security invoker set search_path = public as $$
  with sem as (
    select least(4, greatest(1, ceil(extract(epoch from (now() - min(m.creado_en))) / 86400.0 / 7.0)))::numeric as n
    from public.movimientos m
    where m.local_id = p_local and m.tipo = 'venta' and m.creado_en >= now() - interval '28 days'
  ), st as (
    select m.producto_id, sum(m.cantidad) as stock from public.movimientos m where m.local_id = p_local group by m.producto_id
  ), cons as (
    select m.producto_id, sum(-m.cantidad) / (select coalesce(n, 1) from sem) as semanal from public.movimientos m
    where m.local_id = p_local and m.tipo in ('venta', 'produccion_consumo', 'merma') and m.creado_en >= now() - interval '28 days'
    group by m.producto_id
  ), pend as (
    select oi.producto_id, sum(greatest(oi.cantidad_pedida - coalesce(oi.cantidad_recibida, 0), 0)) as cant
    from public.orden_items oi join public.ordenes_compra o on o.id = oi.orden_id
    where o.local_id = p_local and o.estado in ('aprobada', 'enviada', 'parcial') group by oi.producto_id
  ), base as (
    select p.id, p.par, p.factor_conversion as f, coalesce(st.stock, 0) as stock, cons.semanal,
           coalesce(pend.cant, 0) * p.factor_conversion as pend_uso
    from public.productos p
    left join st on st.producto_id = p.id left join cons on cons.producto_id = p.id left join pend on pend.producto_id = p.id
    where p.local_id = p_local and p.activo and p.categoria is distinct from 'Carta'
  )
  select b.id, b.stock, round(b.semanal, 3), round(b.pend_uso, 3),
         case when coalesce(b.semanal, 0) > 0 then greatest(0, ceil((b.semanal - b.stock - b.pend_uso) / b.f))
              when b.par is not null then round(greatest(0, (b.par - b.stock - b.pend_uso) / b.f), 3)
              else 0 end
  from base b
$$;

-- ============ 2) Índices y vista de facturas con saldo ============
create index if not exists facturas_prov_venc_idx on public.facturas_proveedor(proveedor_id, vencimiento);
create index if not exists pagos_prov_fecha_idx   on public.pagos(proveedor_id, fecha desc);
create index if not exists pago_facturas_fac_idx  on public.pago_facturas(factura_id);

-- Cada factura con lo imputado, lo pendiente y si está vencida. Respeta RLS (gerencia y contadora).
create or replace view public.facturas_pendientes with (security_invoker = true) as
  select f.id, f.proveedor_id, f.numero, f.fecha, f.vencimiento, f.total, f.archivo, f.creado_en,
         coalesce(i.imputado, 0) as imputado,
         f.total - coalesce(i.imputado, 0) as pendiente,
         (f.vencimiento is not null and f.vencimiento < current_date and f.total - coalesce(i.imputado, 0) > 0) as vencida
  from public.facturas_proveedor f
  left join (select factura_id, sum(monto) as imputado from public.pago_facturas group by factura_id) i on i.factura_id = f.id;
revoke all on public.facturas_pendientes from anon;
grant select on public.facturas_pendientes to authenticated;

-- ============ 3) registrar_pago ============
-- p_pago: {proveedor_id, monto, fecha, numero_operacion, cuenta_origen, banco, cuit_destino, banco_destino, cuenta_destino,
--          concepto, descripcion, comprobante_path, actualizar_cuit}
-- p_imputaciones: [{factura_id, monto}]  (la suma no puede superar el monto del pago; cada una, el pendiente de su factura)
-- Si actualizar_cuit es true, el CUIT del comprobante queda guardado en el proveedor (primera vez que se lo confirma).
-- La misma operación no se carga dos veces. Security definer con chequeo de rol: gerencia o contadora.
create or replace function public.registrar_pago(p_pago jsonb, p_imputaciones jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prov uuid; v_monto numeric; v_op text; v_pid uuid; it jsonb; fac public.facturas_proveedor%rowtype;
  v_im numeric; v_pend numeric; v_suma numeric := 0; v_cuit text;
begin
  if coalesce(public.mi_rol(), '') not in ('gerencia', 'contadora') then
    raise exception 'Sin permiso para registrar pagos' using errcode = '42501';
  end if;
  v_prov := nullif(p_pago->>'proveedor_id', '')::uuid;
  if v_prov is null or not exists (select 1 from public.proveedores pr where pr.id = v_prov) then raise exception 'Elegí el proveedor del pago'; end if;
  v_monto := nullif(p_pago->>'monto', '')::numeric;
  if v_monto is null or v_monto <= 0 then raise exception 'El monto del pago tiene que ser mayor a cero'; end if;
  v_op := nullif(btrim(coalesce(p_pago->>'numero_operacion', '')), '');
  if v_op is not null and exists (select 1 from public.pagos g where g.numero_operacion = v_op) then
    raise exception 'La operación % ya está cargada: no se registra dos veces', v_op using errcode = '23505';
  end if;

  insert into public.pagos(proveedor_id, monto, fecha, numero_operacion, cuenta_origen, banco, cuit_destino, banco_destino,
                           cuenta_destino, concepto, descripcion, comprobante_path)
  values (v_prov, v_monto, coalesce(nullif(p_pago->>'fecha', '')::date, current_date), v_op,
          nullif(p_pago->>'cuenta_origen', ''), nullif(p_pago->>'banco', ''), nullif(p_pago->>'cuit_destino', ''),
          nullif(p_pago->>'banco_destino', ''), nullif(p_pago->>'cuenta_destino', ''), nullif(p_pago->>'concepto', ''),
          nullif(p_pago->>'descripcion', ''), nullif(p_pago->>'comprobante_path', ''))
  returning id into v_pid;

  for it in select * from jsonb_array_elements(coalesce(p_imputaciones, '[]'::jsonb)) loop
    v_im := nullif(it->>'monto', '')::numeric;
    if v_im is null or v_im <= 0 then raise exception 'Cada imputación tiene que ser mayor a cero'; end if;
    select * into fac from public.facturas_proveedor where id = (it->>'factura_id')::uuid for update;
    if not found then raise exception 'La factura de la imputación no existe'; end if;
    if fac.proveedor_id <> v_prov then raise exception 'La factura % no es de este proveedor', fac.numero; end if;
    select fac.total - coalesce(sum(pf.monto), 0) into v_pend from public.pago_facturas pf where pf.factura_id = fac.id;
    if v_im > v_pend + 0.005 then
      raise exception 'La factura % solo tiene % pendiente', fac.numero, v_pend;
    end if;
    v_suma := v_suma + v_im;
    insert into public.pago_facturas(pago_id, factura_id, monto) values (v_pid, fac.id, v_im);
  end loop;
  if v_suma > v_monto + 0.005 then raise exception 'Lo imputado (%) supera el monto del pago (%)', v_suma, v_monto; end if;

  v_cuit := nullif(btrim(coalesce(p_pago->>'cuit_destino', '')), '');
  if v_cuit is not null and coalesce((p_pago->>'actualizar_cuit')::boolean, false) then
    update public.proveedores set cuit = v_cuit where id = v_prov;
  end if;
  return v_pid;
end $$;

-- ============ 4) Tablero de gerencia ============
-- Métricas de un período para un local (o todos). Auxiliar de tablero(); security invoker (RLS: solo gerencia ve estos datos).
--   ventas  = total cobrado de las importaciones del período (si traen formas de pago; si no, el total de productos).
--   compras = recepciones valorizadas: cantidad recibida / factor × precio de la recepción (o el precio actual).
--   cmv     = costo de mercadería vendida: consumo teórico (ventas + producción) / factor × precio actual.
--   margen  = ventas − cmv (estimado: los productos sin precio no suman costo).
create or replace function public.tablero_periodo(p_local uuid, p_desde date, p_hasta date)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with rol as (
    select 1 as ok where public.mi_rol() = 'gerencia'
  ), v as (
    select coalesce(sum(case when con_pagos then coalesce(total_cobrado, 0) else coalesce(total_productos, 0) end), 0) as ventas
    from public.ventas_import
    where estado = 'procesado' and (p_local is null or local_id = p_local) and fecha_desde >= p_desde and fecha_hasta <= p_hasta
  ), c as (
    select coalesce(sum(m.cantidad / p.factor_conversion * coalesce(oip.precio_unitario, pa.precio, 0)), 0) as compras
    from public.movimientos m
    join public.productos p on p.id = m.producto_id
    left join public.orden_items oi on m.ref_tipo = 'orden' and oi.orden_id::text = m.ref_id and oi.producto_id = m.producto_id
    left join public.orden_item_precios oip on oip.orden_item_id = oi.id
    left join public.precio_actual pa on pa.producto_id = m.producto_id
    where m.tipo = 'recepcion' and (p_local is null or m.local_id = p_local)
      and m.creado_en >= (p_desde::text || ' 00:00:00-03')::timestamptz and m.creado_en < ((p_hasta + 1)::text || ' 00:00:00-03')::timestamptz
  ), k as (
    select coalesce(sum(-m.cantidad / p.factor_conversion * pa.precio), 0) as cmv
    from public.movimientos m
    join public.productos p on p.id = m.producto_id
    join public.precio_actual pa on pa.producto_id = m.producto_id
    where m.tipo in ('venta', 'produccion_consumo') and (p_local is null or m.local_id = p_local)
      and m.creado_en >= (p_desde::text || ' 00:00:00-03')::timestamptz and m.creado_en < ((p_hasta + 1)::text || ' 00:00:00-03')::timestamptz
  )
  select jsonb_build_object(
    'ventas', round(v.ventas, 2), 'compras', round(c.compras, 2), 'cmv', round(k.cmv, 2),
    'margen', round(v.ventas - k.cmv, 2),
    'margen_pct', case when v.ventas > 0 then round((v.ventas - k.cmv) / v.ventas * 100, 1) else null end)
  from v, c, k, rol
$$;

-- tablero(local, desde, hasta): una sola llamada para el inicio de gerencia. Sin fechas usa la semana actual (lunes a hoy).
-- El período anterior es el de igual duración inmediatamente anterior (semana actual contra la anterior).
create or replace function public.tablero(p_local uuid default null, p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  d0 date := coalesce(p_desde, date_trunc('week', current_date)::date);
  d1 date := coalesce(p_hasta, current_date);
  dias integer; a0 date; a1 date; res jsonb;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para ver el tablero' using errcode = '42501';
  end if;
  if d1 < d0 then raise exception 'Revisá las fechas: "desde" no puede ser posterior a "hasta"'; end if;
  dias := d1 - d0 + 1; a1 := d0 - 1; a0 := d0 - dias;

  select jsonb_build_object(
    'periodo', jsonb_build_object('local_id', p_local, 'desde', d0, 'hasta', d1, 'anterior_desde', a0, 'anterior_hasta', a1),
    'actual', public.tablero_periodo(p_local, d0, d1),
    'anterior', public.tablero_periodo(p_local, a0, a1),

    -- Plata parada en stock: stock (unidad de uso) / factor × precio actual (por unidad de compra).
    'stock', (
      select jsonb_build_object(
        'total', coalesce(round(sum(x.valor), 2), 0),
        'por_local', coalesce(jsonb_agg(jsonb_build_object('local_id', x.local_id, 'nombre', x.nombre, 'valor', round(x.valor, 2), 'sin_precio', x.sin_precio) order by x.valor desc), '[]'::jsonb))
      from (
        select l.id as local_id, l.nombre,
               coalesce(sum(greatest(s.stock, 0) / p.factor_conversion * pa.precio), 0) as valor,
               count(*) filter (where pa.precio is null and s.stock > 0) as sin_precio
        from public.locales l
        left join public.productos p on p.local_id = l.id and p.activo
        left join public.stock_actual s on s.producto_id = p.id and s.local_id = l.id
        left join public.precio_actual pa on pa.producto_id = p.id
        where l.activo and (p_local is null or l.id = p_local)
        group by l.id, l.nombre
      ) x),

    -- Deuda con proveedores (saldo de la cuenta corriente) y facturas vencidas.
    'deuda', jsonb_build_object(
      'total', (select coalesce(round(sum(saldo), 2), 0) from public.cuenta_corriente where saldo > 0),
      'proveedores', (select coalesce(jsonb_agg(jsonb_build_object('proveedor_id', t.proveedor_id, 'nombre', t.nombre, 'saldo', t.saldo)), '[]'::jsonb)
                      from (select proveedor_id, nombre, saldo from public.cuenta_corriente where saldo > 0 order by saldo desc limit 5) t),
      'vencidas', jsonb_build_object(
        'n', (select count(*) from public.facturas_pendientes where vencida),
        'total', (select coalesce(round(sum(pendiente), 2), 0) from public.facturas_pendientes where vencida),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'proveedor', t.nombre, 'numero', t.numero, 'vencimiento', t.vencimiento, 'pendiente', t.pendiente)), '[]'::jsonb)
                  from (select f.id, pr.nombre, f.numero, f.vencimiento, f.pendiente
                        from public.facturas_pendientes f join public.proveedores pr on pr.id = f.proveedor_id
                        where f.vencida order by f.vencimiento limit 5) t))),

    'pagos_sin_avisar', jsonb_build_object(
      'n', (select count(*) from public.pagos where avisado_en is null),
      'total', (select coalesce(round(sum(monto), 2), 0) from public.pagos where avisado_en is null),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'proveedor', t.nombre, 'monto', t.monto, 'fecha', t.fecha)), '[]'::jsonb)
                from (select g.id, pr.nombre, g.monto, g.fecha from public.pagos g join public.proveedores pr on pr.id = g.proveedor_id
                      where g.avisado_en is null order by g.fecha desc, g.creado_en desc limit 5) t)),

    'pedidos_por_aprobar', jsonb_build_object(
      'n', (select count(*) from public.ordenes_compra where estado = 'borrador' and (p_local is null or local_id = p_local)),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'local', t.local, 'proveedor', t.proveedor, 'lineas', t.lineas, 'creado_en', t.creado_en)), '[]'::jsonb)
                from (select o.id, l.nombre as local, pr.nombre as proveedor, o.creado_en,
                             (select count(*) from public.orden_items oi where oi.orden_id = o.id) as lineas
                      from public.ordenes_compra o join public.locales l on l.id = o.local_id left join public.proveedores pr on pr.id = o.proveedor_id
                      where o.estado = 'borrador' and (p_local is null or o.local_id = p_local) order by o.creado_en limit 5) t)),

    -- Faltantes más caros del período (conteos contra lo esperado), de merma_control.
    'faltantes', (
      select coalesce(jsonb_agg(jsonb_build_object('local', t.local, 'producto_id', t.producto_id, 'nombre', t.nombre, 'unidad_uso', t.unidad_uso,
                                                   'faltante', -t.ajuste, 'valor', -t.valor_ajuste) order by t.valor_ajuste), '[]'::jsonb)
      from (select l.nombre as local, m.producto_id, m.nombre, m.unidad_uso, m.ajuste, m.valor_ajuste
            from public.locales l, lateral public.merma_control(l.id, d0, d1) m
            where l.activo and (p_local is null or l.id = p_local) and m.ajuste < 0 and m.valor_ajuste is not null
            order by m.valor_ajuste limit 5) t),

    -- Datos pendientes: productos que no se pueden valorizar o descontar bien.
    'pendientes', jsonb_build_object(
      'sin_precio', (select jsonb_build_object('n', count(*), 'ejemplos', coalesce(jsonb_agg(t.nombre) filter (where t.rn <= 5), '[]'::jsonb))
                     from (select p.nombre, row_number() over (order by p.nombre) rn from public.productos p
                           left join public.precio_actual pa on pa.producto_id = p.id
                           where p.activo and not p.es_elaborado and p.categoria is distinct from 'Carta' and pa.producto_id is null
                             and (p_local is null or p.local_id = p_local)) t),
      'sin_proveedor', (select jsonb_build_object('n', count(*), 'ejemplos', coalesce(jsonb_agg(t.nombre) filter (where t.rn <= 5), '[]'::jsonb))
                        from (select p.nombre, row_number() over (order by p.nombre) rn from public.productos p
                              where p.activo and not p.es_elaborado and p.categoria is distinct from 'Carta' and p.proveedor_id is null
                                and (p_local is null or p.local_id = p_local)) t),
      'sin_receta', (select jsonb_build_object('n', count(*), 'ejemplos', coalesce(jsonb_agg(t.nombre) filter (where t.rn <= 5), '[]'::jsonb))
                     from (select p.nombre, row_number() over (order by p.nombre) rn from public.productos p
                           where p.activo and p.es_elaborado and (p_local is null or p.local_id = p_local)
                             and not exists (select 1 from public.recetas r join public.receta_items ri on ri.receta_id = r.id where r.producto_id = p.id)) t))
  ) into res;
  return res;
end $$;

-- ============ 5) Privilegios ============
do $$
declare f text;
begin
  foreach f in array array[
    'public.sugerido_pedido(uuid)', 'public.registrar_pago(jsonb, jsonb)',
    'public.tablero_periodo(uuid, date, date)', 'public.tablero(uuid, date, date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
