-- 0003_ventas_recetas.sql · Ventas de Núcleo IT, recetas, producción, control de merma y pedido sugerido por consumo.
-- Se aplica después de 0001 y 0002. Idempotente (se puede volver a correr).
-- Solo gerencia ve y escribe ventas, recetas, producción y reportes. El encargado solo lee su sugerido (sin precios).
--
-- Convención de unidades (la misma que la recepción de 0002):
--   * El stock y todos los movimientos están en unidad_uso del producto.
--   * La recepción suma  cantidad_comprada × factor_conversion  (caja x 6 => +6 unidades).
--   * La venta descuenta  cantidad_vendida × producto_alias.cantidad_por_venta  en unidad_uso (por defecto 1:
--     vender 1 lata descuenta 1 unidad = 1/6 de caja). Si Núcleo vende una copa y el producto es la botella,
--     cantidad_por_venta = 0.2 (una copa = 0,2 botella).
--   * Un plato de la carta es un producto es_elaborado = true, categoría 'Carta', con receta. Su venta no mueve su
--     propio stock: explota la receta (cantidad × vendidos / rinde) en movimientos de sus insumos, en unidad_uso de cada insumo.
--   * Los pedidos de compra (cantidad_pedida) están en unidad_compra; el sugerido se devuelve en unidad_compra.

-- ============ 1) Columnas nuevas ============
alter table public.ventas_import
  add column if not exists con_detalle     boolean not null default false,
  add column if not exists con_pagos       boolean not null default false,
  add column if not exists total_productos numeric(14,2),
  add column if not exists total_cobrado   numeric(14,2),
  add column if not exists n_pedidos       integer,
  add column if not exists pedidos_cero    integer,
  add column if not exists usuario         uuid default auth.uid();

alter table public.ventas_items
  add column if not exists local_id    uuid references public.locales(id),
  add column if not exists fecha       date,
  add column if not exists fecha_hora  timestamptz,
  add column if not exists tipo_pedido text,
  add column if not exists sector      text,
  add column if not exists factor      numeric(14,4) not null default 1,   -- cantidad_por_venta usada al importar
  add column if not exists no_descontar boolean not null default false;
create index if not exists ventas_items_local_fecha_idx on public.ventas_items(local_id, fecha);
create index if not exists ventas_items_prod_idx on public.ventas_items(producto_id);

alter table public.ventas_pedidos add column if not exists fecha date;
create index if not exists ventas_pedidos_local_fecha_idx on public.ventas_pedidos(local_id, fecha);

-- Un solo import por local y día (reimportar lo reemplaza).
create unique index if not exists ventas_import_dia_uq on public.ventas_import(local_id, fecha_desde) where fecha_desde = fecha_hasta;

-- Alias de Núcleo: el código es propio de cada local, y puede descontar más o menos de una unidad de uso por venta.
alter table public.producto_alias
  add column if not exists local_id uuid references public.locales(id),
  add column if not exists cantidad_por_venta numeric(14,4) not null default 1 check (cantidad_por_venta > 0);

create or replace function public.alias_set_local() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.origen = 'nucleo' and new.local_id is null then
    select local_id into new.local_id from public.productos where id = new.producto_id;
  end if;
  return new;
end $$;
drop trigger if exists producto_alias_local on public.producto_alias;
create trigger producto_alias_local before insert or update on public.producto_alias
  for each row execute function public.alias_set_local();
update public.producto_alias a set local_id = p.local_id
  from public.productos p where p.id = a.producto_id and a.origen = 'nucleo' and a.local_id is null;

drop index if exists public.producto_alias_uq;
create unique index if not exists producto_alias_uq
  on public.producto_alias(origen, coalesce(local_id, '00000000-0000-0000-0000-000000000000'::uuid), public.norm(alias));

-- Historial de producción de elaborados.
create table if not exists public.producciones (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references public.locales(id),
  producto_id uuid not null references public.productos(id),
  cantidad    numeric(14,3) not null check (cantidad > 0),   -- en unidad_uso del elaborado
  nota        text,
  usuario     uuid default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists producciones_local_idx on public.producciones(local_id, creado_en desc);

-- ============ 2) Permisos: solo gerencia ============
alter table public.producciones enable row level security;
drop policy if exists gerencia_todo on public.producciones;
create policy gerencia_todo on public.producciones for all to authenticated
  using (public.mi_rol() = 'gerencia') with check (public.mi_rol() = 'gerencia');

-- 0001 dejaba leer ventas a la contadora y las recetas al encargado y a la contadora: ya no.
drop policy if exists vi_contadora   on public.ventas_import;
drop policy if exists vit_contadora  on public.ventas_items;
drop policy if exists vp_contadora   on public.ventas_pedidos;
drop policy if exists vpp_contadora  on public.ventas_pedido_pagos;
drop policy if exists recetas_lectura      on public.recetas;
drop policy if exists receta_items_lectura on public.receta_items;

revoke all on public.producciones from anon;
grant select, insert, update, delete on public.producciones to authenticated;

-- ============ 3) Asociar códigos de Núcleo a productos ============
-- Crea (o reemplaza) el alias de Núcleo de un local. p_codigo es el código de Núcleo (o el nombre si no trae código).
create or replace function public.asociar_nucleo(p_producto uuid, p_codigo text, p_cantidad_por_venta numeric default 1)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare loc uuid; aid uuid;
begin
  if public.mi_rol() is distinct from 'gerencia' then raise exception 'Sin permiso' using errcode = '42501'; end if;
  if nullif(btrim(p_codigo), '') is null then raise exception 'Falta el código de Núcleo'; end if;
  if coalesce(p_cantidad_por_venta, 0) <= 0 then raise exception 'La cantidad por venta tiene que ser mayor a cero'; end if;
  select local_id into loc from public.productos where id = p_producto;
  if not found then raise exception 'El producto no existe'; end if;
  delete from public.producto_alias where origen = 'nucleo' and local_id = loc and public.norm(alias) = public.norm(p_codigo);
  insert into public.producto_alias(producto_id, alias, origen, local_id, cantidad_por_venta)
    values (p_producto, btrim(p_codigo), 'nucleo', loc, p_cantidad_por_venta) returning id into aid;
  return aid;
end $$;

-- Crea un plato de la carta (elaborado, categoría 'Carta') con su alias de Núcleo. Si ya existe el alias, devuelve ese producto.
create or replace function public.crear_plato(p_local uuid, p_codigo text, p_nombre text)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare clave text; pid uuid; cod text;
begin
  if public.mi_rol() is distinct from 'gerencia' then raise exception 'Sin permiso' using errcode = '42501'; end if;
  if not exists (select 1 from public.locales where id = p_local) then raise exception 'El local no existe'; end if;
  clave := coalesce(nullif(btrim(p_codigo), ''), nullif(btrim(p_nombre), ''));
  if clave is null then raise exception 'Falta el código o el nombre del plato'; end if;
  select producto_id into pid from public.producto_alias
    where origen = 'nucleo' and local_id = p_local and public.norm(alias) = public.norm(clave);
  if found then return pid; end if;
  cod := 'PLA-' || upper(clave);
  if exists (select 1 from public.productos where codigo = cod) then
    cod := cod || '-' || (select codigo from public.locales where id = p_local);
  end if;
  insert into public.productos(codigo, nombre, local_id, categoria, unidad_uso, es_elaborado, activo)
    values (cod, coalesce(nullif(btrim(p_nombre), ''), clave), p_local, 'Carta', 'porción', true, true) returning id into pid;
  insert into public.producto_alias(producto_id, alias, origen, local_id) values (pid, clave, 'nucleo', p_local);
  return pid;
end $$;

-- ============ 4) Recetas ============
-- Reemplaza la receta completa de un elaborado. p_items: [{insumo_id, cantidad}] (cantidad en unidad_uso del insumo).
create or replace function public.guardar_receta(p_producto uuid, p_rinde numeric, p_items jsonb, p_notas text default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare prod public.productos%rowtype; rid uuid; e jsonb; ins public.productos%rowtype;
begin
  if public.mi_rol() is distinct from 'gerencia' then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into prod from public.productos where id = p_producto;
  if not found then raise exception 'El producto no existe'; end if;
  if not prod.es_elaborado then raise exception 'Solo los elaborados y platos tienen receta'; end if;
  if coalesce(p_rinde, 0) <= 0 then raise exception 'El rinde tiene que ser mayor a cero'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'Los insumos deben ser una lista'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into ins from public.productos where id = (e->>'insumo_id')::uuid;
    if not found then raise exception 'Un insumo no existe'; end if;
    if ins.id = p_producto then raise exception 'Un plato no puede ser insumo de sí mismo'; end if;
    if ins.local_id <> prod.local_id then raise exception 'El insumo % es de otro local', ins.nombre; end if;
    if coalesce((e->>'cantidad')::numeric, 0) <= 0 then raise exception 'La cantidad de % tiene que ser mayor a cero', ins.nombre; end if;
  end loop;
  insert into public.recetas(producto_id, rinde, notas) values (p_producto, p_rinde, nullif(btrim(p_notas), ''))
    on conflict (producto_id) do update set rinde = excluded.rinde, notas = excluded.notas
    returning id into rid;
  delete from public.receta_items where receta_id = rid;
  insert into public.receta_items(receta_id, insumo_id, cantidad)
    select rid, (x->>'insumo_id')::uuid, sum((x->>'cantidad')::numeric)
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x group by (x->>'insumo_id')::uuid;
  return rid;
end $$;

-- Platos vendidos sin receta (o con receta vacía), del más vendido al menos vendido. Solo gerencia (RLS de ventas_items).
create or replace view public.platos_sin_receta with (security_invoker = true) as
  select i.local_id, i.producto_id, p.codigo, p.nombre, sum(i.cantidad * i.factor) as vendidos, max(i.fecha) as ultima_venta
  from public.ventas_items i
  join public.productos p on p.id = i.producto_id
  where p.es_elaborado and not i.no_descontar
    and not exists (select 1 from public.recetas r join public.receta_items ri on ri.receta_id = r.id where r.producto_id = p.id)
  group by i.local_id, i.producto_id, p.codigo, p.nombre
  order by vendidos desc;
revoke all on public.platos_sin_receta from anon;
grant select on public.platos_sin_receta to authenticated;

-- ============ 5) Importar ventas (transaccional e idempotente) ============
-- p_pedidos: [{numero, fecha_hora, cliente, mozo, mesa, tipo_pedido, sector, total}]
-- p_items:   [{codigo, nombre, cantidad, importe, producto_id, pedido_numero, fecha_hora, rubro, subrubro, tipo_pedido, sector, no_descontar}]
-- p_pagos:   [{pedido_numero, forma_pago, monto}]
-- Reimportar el mismo local + fecha reemplaza la importación anterior (borra sus movimientos y filas).
create or replace function public.importar_ventas(p_local uuid, p_fecha date, p_pedidos jsonb, p_items jsonb, p_pagos jsonb, p_archivo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  imp uuid; viejo uuid; reemplazo boolean := false; ts timestamptz; ts_def timestamptz;
  n int; n_items int; n_ped int; n_pag int; n_mov int := 0; n_nd int; sin_asoc int; sin_receta jsonb;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para importar ventas' using errcode = '42501';
  end if;
  if p_local is null or not exists (select 1 from public.locales where id = p_local) then raise exception 'El local no existe'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de las ventas'; end if;
  p_pedidos := coalesce(p_pedidos, '[]'::jsonb); p_items := coalesce(p_items, '[]'::jsonb); p_pagos := coalesce(p_pagos, '[]'::jsonb);
  if jsonb_typeof(p_pedidos) <> 'array' or jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_pagos) <> 'array' then
    raise exception 'Pedidos, ítems y pagos deben ser listas';
  end if;
  if jsonb_array_length(p_items) = 0 and jsonb_array_length(p_pagos) = 0 then raise exception 'No hay nada para importar'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where coalesce((e->>'cantidad')::numeric, -1) < 0) then
    raise exception 'Hay ítems con cantidad negativa o vacía';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_local::text || p_fecha::text));
  ts_def := (p_fecha::text || ' 12:00:00-03')::timestamptz;
  ts := least((p_fecha::text || ' 23:59:00-03')::timestamptz, now());   -- el consumo cuenta en el día de la venta

  -- Reemplazo de la importación anterior del mismo día.
  for viejo in select id from public.ventas_import where local_id = p_local and fecha_desde = p_fecha and fecha_hasta = p_fecha loop
    delete from public.movimientos where ref_tipo = 'venta_import' and ref_id = viejo::text;
    delete from public.ventas_import where id = viejo;
    reemplazo := true;
  end loop;

  -- Un pedido no puede estar ya importado en otro día.
  if exists (select 1 from public.ventas_pedidos vp
             where vp.local_id = p_local and vp.numero in (select (e->>'numero')::bigint from jsonb_array_elements(p_pedidos) e)) then
    raise exception 'Hay pedidos que ya fueron importados en otra fecha. Revisá la fecha elegida.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagos) e
             where not exists (select 1 from jsonb_array_elements(p_pedidos) q where (q->>'numero') = (e->>'pedido_numero'))) then
    raise exception 'Hay pagos de pedidos que no figuran en la lista de pedidos';
  end if;

  insert into public.ventas_import(local_id, fecha_desde, fecha_hasta, archivo, estado, con_detalle, con_pagos)
    values (p_local, p_fecha, p_fecha, p_archivo, 'pendiente',
            exists (select 1 from jsonb_array_elements(p_items) e where nullif(e->>'pedido_numero', '') is not null),
            jsonb_array_length(p_pagos) > 0)
    returning id into imp;

  insert into public.ventas_pedidos(import_id, local_id, fecha, numero, fecha_hora, cliente, mozo, mesa, tipo_pedido, sector, total)
    select imp, p_local, p_fecha, (e->>'numero')::bigint, coalesce(nullif(e->>'fecha_hora', '')::timestamptz, ts_def),
           nullif(e->>'cliente', ''), nullif(e->>'mozo', ''), nullif(e->>'mesa', ''), nullif(e->>'tipo_pedido', ''), nullif(e->>'sector', ''),
           coalesce(nullif(e->>'total', '')::numeric, 0)
    from jsonb_array_elements(p_pedidos) e;
  get diagnostics n_ped = row_count;

  insert into public.ventas_pedido_pagos(pedido_id, forma_pago, monto)
    select vp.id, e->>'forma_pago', sum((e->>'monto')::numeric)
    from jsonb_array_elements(p_pagos) e
    join public.ventas_pedidos vp on vp.import_id = imp and vp.numero = (e->>'pedido_numero')::bigint
    group by vp.id, e->>'forma_pago';
  get diagnostics n_pag = row_count;

  -- Ítems: el producto viene del cliente o, si no, del alias de Núcleo del local (clave = código, o el nombre si no hay código).
  insert into public.ventas_items(import_id, local_id, fecha, fecha_hora, nombre_origen, codigo_origen, cantidad, importe,
                                  producto_id, pedido_numero, rubro, subrubro, tipo_pedido, sector, factor, no_descontar)
    select imp, p_local, p_fecha, nullif(e->>'fecha_hora', '')::timestamptz, coalesce(nullif(e->>'nombre', ''), e->>'codigo', 'Sin nombre'),
           nullif(e->>'codigo', ''), (e->>'cantidad')::numeric, nullif(e->>'importe', '')::numeric,
           case when coalesce((e->>'no_descontar')::boolean, false) then null else coalesce(nullif(e->>'producto_id', '')::uuid, al.producto_id) end,
           nullif(e->>'pedido_numero', '')::bigint, nullif(e->>'rubro', ''), nullif(e->>'subrubro', ''),
           nullif(e->>'tipo_pedido', ''), nullif(e->>'sector', ''),
           case when al.producto_id is not null and al.producto_id = coalesce(nullif(e->>'producto_id', '')::uuid, al.producto_id)
                then al.cantidad_por_venta else 1 end,
           coalesce((e->>'no_descontar')::boolean, false)
    from jsonb_array_elements(p_items) e
    left join lateral (
      select a.producto_id, a.cantidad_por_venta from public.producto_alias a
      where a.origen = 'nucleo' and a.local_id = p_local
        and public.norm(a.alias) = public.norm(coalesce(nullif(e->>'codigo', ''), e->>'nombre'))
      limit 1) al on true;
  get diagnostics n_items = row_count;

  select count(*) into sin_asoc from public.ventas_items where import_id = imp and producto_id is null and not no_descontar;
  if sin_asoc > 0 then raise exception 'Hay % ítems sin asociar a un producto', sin_asoc; end if;
  if exists (select 1 from public.ventas_items i join public.productos p on p.id = i.producto_id
             where i.import_id = imp and p.local_id <> p_local) then
    raise exception 'Hay ítems asociados a productos de otro local';
  end if;
  select count(*) into n_nd from public.ventas_items where import_id = imp and no_descontar;

  -- Productos directos: descuentan lo vendido × cantidad_por_venta.
  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota, creado_en)
    select p_local, i.producto_id, 'venta', -round(sum(i.cantidad * i.factor), 3), 'venta_import', imp::text, 'Ventas ' || p_fecha, ts
    from public.ventas_items i join public.productos p on p.id = i.producto_id
    where i.import_id = imp and not i.no_descontar and not p.es_elaborado
    group by i.producto_id
    having round(sum(i.cantidad * i.factor), 3) > 0;
  get diagnostics n = row_count; n_mov := n_mov + n;

  -- Platos con receta: explotan sus insumos (cantidad × vendidos / rinde).
  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota, creado_en)
    select p_local, ri.insumo_id, 'venta', -round(sum(ri.cantidad * v.vendidos / r.rinde), 3), 'venta_import', imp::text,
           'Ventas ' || p_fecha || ' (platos)', ts
    from (select i.producto_id, sum(i.cantidad * i.factor) as vendidos
          from public.ventas_items i join public.productos p on p.id = i.producto_id
          where i.import_id = imp and not i.no_descontar and p.es_elaborado
          group by i.producto_id) v
    join public.recetas r on r.producto_id = v.producto_id
    join public.receta_items ri on ri.receta_id = r.id
    group by ri.insumo_id
    having round(sum(ri.cantidad * v.vendidos / r.rinde), 3) > 0;
  get diagnostics n = row_count; n_mov := n_mov + n;

  -- Platos sin receta: no descuentan, se informan.
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', x.producto_id, 'codigo', x.codigo, 'nombre', x.nombre, 'cantidad', x.vendidos) order by x.vendidos desc), '[]'::jsonb)
    into sin_receta
    from (select i.producto_id, p.codigo, p.nombre, sum(i.cantidad * i.factor) as vendidos
          from public.ventas_items i join public.productos p on p.id = i.producto_id
          where i.import_id = imp and not i.no_descontar and p.es_elaborado
            and not exists (select 1 from public.recetas r join public.receta_items ri on ri.receta_id = r.id where r.producto_id = p.id)
          group by i.producto_id, p.codigo, p.nombre) x;

  update public.ventas_import set estado = 'procesado',
      total_productos = (select sum(importe) from public.ventas_items where import_id = imp),
      total_cobrado = case when jsonb_array_length(p_pagos) > 0 then (select coalesce(sum(g.monto), 0) from public.ventas_pedido_pagos g join public.ventas_pedidos vp on vp.id = g.pedido_id where vp.import_id = imp) end,
      n_pedidos = n_ped,
      pedidos_cero = (select count(*) from (select pedido_numero from public.ventas_items where import_id = imp and pedido_numero is not null
                                            group by pedido_numero having coalesce(sum(importe), 0) = 0) z)
    where id = imp;

  return jsonb_build_object('import_id', imp, 'reemplazo', reemplazo, 'items', n_items, 'pedidos', n_ped, 'pagos', n_pag,
                            'movimientos', n_mov, 'no_descontados', n_nd, 'sin_receta', sin_receta);
end $$;

-- ============ 6) Producción de elaborados ============
-- p_cantidad en unidad_uso del elaborado (en unidades de "rinde" de su receta). Descuenta los insumos y suma el elaborado.
create or replace function public.registrar_produccion(p_local uuid, p_producto uuid, p_cantidad numeric, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare prod public.productos%rowtype; rec public.recetas%rowtype; pid uuid;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para registrar producción' using errcode = '42501';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then raise exception 'La cantidad tiene que ser mayor a cero'; end if;
  select * into prod from public.productos where id = p_producto;
  if not found then raise exception 'El producto no existe'; end if;
  if prod.local_id <> p_local then raise exception 'El producto es de otro local'; end if;
  if not prod.es_elaborado then raise exception '% no es un elaborado', prod.nombre; end if;
  select * into rec from public.recetas where producto_id = p_producto;
  if not found or not exists (select 1 from public.receta_items where receta_id = rec.id) then
    raise exception '% no tiene receta cargada', prod.nombre;
  end if;
  insert into public.producciones(local_id, producto_id, cantidad, nota) values (p_local, p_producto, p_cantidad, nullif(btrim(p_nota), ''))
    returning id into pid;
  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
    select p_local, ri.insumo_id, 'produccion_consumo', -round(ri.cantidad * p_cantidad / rec.rinde, 3), 'produccion', pid::text, 'Producción de ' || prod.nombre
    from public.receta_items ri where ri.receta_id = rec.id and round(ri.cantidad * p_cantidad / rec.rinde, 3) > 0;
  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
    values (p_local, p_producto, 'produccion_alta', round(p_cantidad, 3), 'produccion', pid::text, nullif(btrim(p_nota), ''));
  return pid;
end $$;

-- ============ 7) Control de merma (solo gerencia) ============
-- Por producto y rango: consumo teórico (ventas + producción) contra ajustes por conteo, valuados a precio_actual.
-- Los precios son por unidad de compra: el valor por unidad de uso es precio / factor_conversion.
create or replace function public.merma_control(p_local uuid, p_desde date, p_hasta date)
returns table (producto_id uuid, codigo text, nombre text, unidad_uso text, vendido numeric, producido numeric, teorico numeric,
               merma numeric, ajuste numeric, precio_uso numeric, valor_ajuste numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.codigo, p.nombre, p.unidad_uso,
         coalesce(sum(-m.cantidad) filter (where m.tipo = 'venta'), 0),
         coalesce(sum(-m.cantidad) filter (where m.tipo = 'produccion_consumo'), 0),
         coalesce(sum(-m.cantidad) filter (where m.tipo in ('venta', 'produccion_consumo')), 0),
         coalesce(sum(-m.cantidad) filter (where m.tipo = 'merma'), 0),
         coalesce(sum(m.cantidad) filter (where m.tipo = 'ajuste_conteo'), 0),
         round(pa.precio / p.factor_conversion, 4),
         round(coalesce(sum(m.cantidad) filter (where m.tipo = 'ajuste_conteo'), 0) * pa.precio / p.factor_conversion, 2)
  from public.movimientos m
  join public.productos p on p.id = m.producto_id
  left join public.precio_actual pa on pa.producto_id = p.id
  where public.mi_rol() = 'gerencia'
    and m.local_id = p_local
    and m.tipo in ('venta', 'produccion_consumo', 'merma', 'ajuste_conteo')
    and m.creado_en >= (p_desde::text || ' 00:00:00-03')::timestamptz
    and m.creado_en <  ((p_hasta + 1)::text || ' 00:00:00-03')::timestamptz
  group by p.id, p.codigo, p.nombre, p.unidad_uso, p.factor_conversion, pa.precio
  order by p.nombre
$$;

-- ============ 8) Pedido sugerido por consumo (también para el encargado, sin precios) ============
-- consumo_semanal = (ventas + consumo de producción + mermas de los últimos 28 días) / 4, en unidad_uso.
-- pendiente       = lo pedido y no recibido (órdenes aprobada / enviada / parcial), pasado a unidad_uso.
-- sugerido (en unidad_compra): con consumo, max(0, ceil((consumo_semanal − stock − pendiente) / factor));
--   sin consumo, la cantidad ideal del local (par) menos stock y pendiente, como antes. Los platos de la carta no se piden.
-- Security invoker: el encargado solo ve su local por RLS, y la función no toca precios.
create or replace function public.sugerido_pedido(p_local uuid)
returns table (producto_id uuid, stock numeric, consumo_semanal numeric, pendiente numeric, sugerido numeric)
language sql stable security invoker set search_path = public as $$
  with st as (
    select m.producto_id, sum(m.cantidad) as stock from public.movimientos m where m.local_id = p_local group by m.producto_id
  ), cons as (
    select m.producto_id, sum(-m.cantidad) / 4.0 as semanal from public.movimientos m
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

-- ============ 9) Privilegios de las funciones nuevas ============
do $$
declare f text;
begin
  foreach f in array array[
    'public.asociar_nucleo(uuid, text, numeric)', 'public.crear_plato(uuid, text, text)',
    'public.guardar_receta(uuid, numeric, jsonb, text)', 'public.importar_ventas(uuid, date, jsonb, jsonb, jsonb, text)',
    'public.registrar_produccion(uuid, uuid, numeric, text)', 'public.merma_control(uuid, date, date)',
    'public.sugerido_pedido(uuid)', 'public.alias_set_local()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
