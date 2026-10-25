-- 0001_base.sql · Esquema base: stock, compras y pagos (Docks del Puerto)
-- Idempotente: se puede volver a correr. Precios, facturas y pagos: solo gerencia/contadora.

create extension if not exists pg_trgm  with schema public;
create extension if not exists unaccent with schema public;

-- Normaliza texto para comparar: sin tildes, minúsculas, sin espacios dobles.
create or replace function public.norm(t text) returns text
language sql immutable parallel safe set search_path = public as $$
  select btrim(regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, coalesce(t, ''))), '\s+', ' ', 'g'))
$$;

-- ============ Locales y usuarios ============
create table if not exists public.locales (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,           -- prefijo: TRE, UMO...
  nombre      text not null unique,
  encargados  text[] not null default '{}',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create table if not exists public.perfiles (
  id        uuid primary key,                 -- = auth.users.id
  nombre    text not null,
  rol       text not null check (rol in ('encargado','gerencia','contadora')),
  local_id  uuid references public.locales(id),
  creado_en timestamptz not null default now()
);

-- Rol y local del usuario actual (security definer: evita recursión de RLS).
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid()
$$;

create or replace function public.mi_local() returns uuid
language sql stable security definer set search_path = public as $$
  select local_id from public.perfiles where id = auth.uid()
$$;

-- ============ Catálogo ============
create table if not exists public.proveedores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique,
  whatsapp      text,
  cuit          text,
  alias_cbu     text,
  dias_entrega  text,
  pedido_minimo numeric(14,2),
  corte         text,
  notas         text,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create table if not exists public.productos (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,     -- ej. TRE-129
  nombre            text not null,
  local_id          uuid not null references public.locales(id),
  categoria         text,
  unidad_compra     text,
  unidad_uso        text,
  factor_conversion numeric(14,4) not null default 1 check (factor_conversion > 0),
  proveedor_id      uuid references public.proveedores(id),
  es_elaborado      boolean not null default false,
  activo            boolean not null default true,
  par               numeric(14,3),            -- stock par interno
  creado_en         timestamptz not null default now()
);
create index if not exists productos_local_idx on public.productos(local_id);
create index if not exists productos_prov_idx on public.productos(proveedor_id);
create index if not exists productos_nombre_trgm on public.productos using gin (public.norm(nombre) gin_trgm_ops);

create table if not exists public.producto_alias (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  alias       text not null,
  origen      text not null check (origen in ('nucleo','proveedor','manual'))
);
create unique index if not exists producto_alias_uq on public.producto_alias(origen, public.norm(alias));
create index if not exists producto_alias_prod_idx on public.producto_alias(producto_id);
create index if not exists producto_alias_trgm on public.producto_alias using gin (public.norm(alias) gin_trgm_ops);

-- Precios aparte del producto: el encargado nunca los ve (RLS).
create table if not exists public.precios (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.productos(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id),
  precio       numeric(14,2) not null check (precio >= 0),
  fecha        date not null default current_date,
  origen       text not null default 'manual'
);
create index if not exists precios_prod_fecha_idx on public.precios(producto_id, fecha desc);

-- Último precio por producto (respeta RLS del usuario que consulta).
create or replace view public.precio_actual with (security_invoker = true) as
  select distinct on (producto_id) producto_id, proveedor_id, precio, fecha, origen
  from public.precios
  order by producto_id, fecha desc, id;

-- ============ Recetas ============
create table if not exists public.recetas (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null unique references public.productos(id) on delete cascade, -- elaborado
  rinde       numeric(14,3) not null default 1 check (rinde > 0),
  notas       text
);
create table if not exists public.receta_items (
  id         uuid primary key default gen_random_uuid(),
  receta_id  uuid not null references public.recetas(id) on delete cascade,
  insumo_id  uuid not null references public.productos(id),
  cantidad   numeric(14,4) not null check (cantidad > 0),  -- en unidad_uso del insumo
  unique (receta_id, insumo_id)
);

-- ============ Stock por movimientos ============
create table if not exists public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references public.locales(id),
  producto_id uuid not null references public.productos(id),
  tipo        text not null check (tipo in ('recepcion','venta','produccion_consumo','produccion_alta','merma','ajuste_conteo','inicial')),
  cantidad    numeric(14,3) not null,         -- con signo, en unidad_uso
  ref_tipo    text,
  ref_id      text,
  usuario     uuid default auth.uid(),
  nota        text,
  creado_en   timestamptz not null default now(),
  check (
    (tipo in ('venta','produccion_consumo','merma') and cantidad <= 0) or
    (tipo in ('recepcion','produccion_alta') and cantidad >= 0) or
    tipo in ('ajuste_conteo','inicial')
  )
);
create index if not exists mov_local_prod_idx on public.movimientos(local_id, producto_id);

create or replace view public.stock_actual with (security_invoker = true) as
  select local_id, producto_id, sum(cantidad) as stock, max(creado_en) as ultimo_movimiento
  from public.movimientos
  group by local_id, producto_id;

-- Inserta un ajuste por la diferencia entre lo contado y el stock actual. Devuelve la diferencia.
create or replace function public.registrar_conteo(
  p_local uuid, p_producto uuid, p_cantidad_contada numeric, p_usuario uuid default auth.uid()
) returns numeric
language plpgsql set search_path = public as $$
declare actual numeric; dif numeric;
begin
  select coalesce(sum(cantidad), 0) into actual
    from movimientos where local_id = p_local and producto_id = p_producto;
  dif := p_cantidad_contada - actual;
  if dif <> 0 then
    insert into movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, usuario, nota)
    values (p_local, p_producto, 'ajuste_conteo', dif, 'conteo', p_usuario,
            'Conteo: ' || p_cantidad_contada || ' (sistema ' || actual || ')');
  end if;
  return dif;
end $$;

-- ============ Compras ============
create table if not exists public.ordenes_compra (
  id            uuid primary key default gen_random_uuid(),
  local_id      uuid not null references public.locales(id),
  proveedor_id  uuid not null references public.proveedores(id),
  estado        text not null default 'borrador' check (estado in ('borrador','aprobada','enviada','recibida','parcial','cancelada')),
  fecha_entrega date,
  creado_por    uuid default auth.uid(),
  creado_en     timestamptz not null default now()
);
create table if not exists public.orden_items (
  id               uuid primary key default gen_random_uuid(),
  orden_id         uuid not null references public.ordenes_compra(id) on delete cascade,
  producto_id      uuid not null references public.productos(id),
  cantidad_pedida  numeric(14,3) not null check (cantidad_pedida >= 0),
  cantidad_recibida numeric(14,3),
  unique (orden_id, producto_id)
);
-- Precio en tabla aparte (más simple de proteger que privilegios por columna).
create table if not exists public.orden_item_precios (
  orden_item_id   uuid primary key references public.orden_items(id) on delete cascade,
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0)
);

-- ============ Ventas (importación Excel Núcleo IT, formato genérico) ============
create table if not exists public.ventas_import (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references public.locales(id),
  fecha_desde date,
  fecha_hasta date,
  archivo     text,
  estado      text not null default 'pendiente' check (estado in ('pendiente','procesado','error')),
  creado_en   timestamptz not null default now()
);
create table if not exists public.ventas_items (
  id            uuid primary key default gen_random_uuid(),
  import_id     uuid not null references public.ventas_import(id) on delete cascade,
  nombre_origen text not null,
  codigo_origen text,
  cantidad      numeric(14,3) not null,
  importe       numeric(14,2),
  producto_id   uuid references public.productos(id)   -- null hasta asociar
);
create index if not exists ventas_items_import_idx on public.ventas_items(import_id);

-- ============ Facturas y pagos ============
create table if not exists public.facturas_proveedor (
  id           uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id),
  numero       text not null,
  fecha        date not null,
  vencimiento  date,
  total        numeric(14,2) not null check (total >= 0),
  archivo      text,
  creado_en    timestamptz not null default now(),
  unique (proveedor_id, numero)
);
create table if not exists public.pagos (
  id               uuid primary key default gen_random_uuid(),
  proveedor_id     uuid not null references public.proveedores(id),
  monto            numeric(14,2) not null check (monto > 0),
  fecha            date not null default current_date,
  numero_operacion text,                     -- "Identificador de la operación" del comprobante
  cuenta_origen    text,
  banco            text,
  cuit_destino     text,                     -- CUIT del destinatario: identifica al proveedor
  banco_destino    text,
  cuenta_destino   text,                     -- CBU o cuenta de destino
  concepto         text,                     -- p. ej. "Factura"
  descripcion      text,                     -- p. ej. "Almacen"
  comprobante_path text,                     -- ruta en bucket 'comprobantes'
  avisado_en       timestamptz,
  cargado_por      uuid default auth.uid(),
  creado_en        timestamptz not null default now()
);
-- Un mismo comprobante no se carga dos veces
create unique index if not exists pagos_numero_operacion_uq
  on public.pagos (numero_operacion) where numero_operacion is not null;
create table if not exists public.pago_facturas (
  pago_id    uuid not null references public.pagos(id) on delete cascade,
  factura_id uuid not null references public.facturas_proveedor(id) on delete cascade,
  monto      numeric(14,2) not null check (monto > 0),
  primary key (pago_id, factura_id)
);

-- Saldo por proveedor = facturado - pagado.
create or replace view public.cuenta_corriente with (security_invoker = true) as
  select p.id as proveedor_id, p.nombre,
         coalesce(f.total, 0) as facturado,
         coalesce(g.total, 0) as pagado,
         coalesce(f.total, 0) - coalesce(g.total, 0) as saldo
  from public.proveedores p
  left join (select proveedor_id, sum(total) total from public.facturas_proveedor group by 1) f on f.proveedor_id = p.id
  left join (select proveedor_id, sum(monto) total from public.pagos group by 1) g on g.proveedor_id = p.id;

-- Proveedores sin datos sensibles (CUIT, CBU, WhatsApp) para todos los roles logueados.
-- Sin security_invoker a propósito: filtra columnas y exige sesión con perfil.
create or replace view public.proveedores_basico as
  select id, nombre, dias_entrega, corte, pedido_minimo, activo
  from public.proveedores
  where public.mi_rol() is not null;

-- ============ Búsqueda ============
-- Similitud trigram sobre nombre + alias, sin tildes. Ordena por score.
create or replace function public.buscar_productos(q text, p_local uuid default null)
returns table (id uuid, codigo text, nombre text, local_id uuid, score real)
language sql stable set search_path = public as $$
  with nq as (select public.norm(q) as t)
  select p.id, p.codigo, p.nombre, p.local_id,
         greatest(
           similarity(public.norm(p.nombre), nq.t),
           word_similarity(nq.t, public.norm(p.nombre)),
           coalesce((select max(greatest(similarity(public.norm(a.alias), nq.t), word_similarity(nq.t, public.norm(a.alias))))
                     from public.producto_alias a where a.producto_id = p.id), 0)
         )::real as score
  from public.productos p, nq
  where p.activo and nq.t <> ''
    and (p_local is null or p.local_id = p_local)
    and (
      public.norm(p.nombre) % nq.t
      or nq.t <% public.norm(p.nombre)
      or exists (select 1 from public.producto_alias a
                 where a.producto_id = p.id
                   and (public.norm(a.alias) % nq.t or nq.t <% public.norm(a.alias)))
    )
  order by score desc, p.nombre
  limit 50
$$;

-- ============ RLS ============
alter table public.locales            enable row level security;
alter table public.perfiles           enable row level security;
alter table public.proveedores        enable row level security;
alter table public.productos          enable row level security;
alter table public.producto_alias     enable row level security;
alter table public.precios            enable row level security;
alter table public.recetas            enable row level security;
alter table public.receta_items       enable row level security;
alter table public.movimientos        enable row level security;
alter table public.ordenes_compra     enable row level security;
alter table public.orden_items        enable row level security;
alter table public.orden_item_precios enable row level security;
alter table public.ventas_import      enable row level security;
alter table public.ventas_items       enable row level security;
alter table public.facturas_proveedor enable row level security;
alter table public.pagos              enable row level security;
alter table public.pago_facturas      enable row level security;

-- Gerencia: todo, en todas las tablas.
do $$
declare t text;
begin
  foreach t in array array['locales','perfiles','proveedores','productos','producto_alias','precios','recetas','receta_items',
    'movimientos','ordenes_compra','orden_items','orden_item_precios','ventas_import','ventas_items',
    'facturas_proveedor','pagos','pago_facturas'] loop
    execute format('drop policy if exists gerencia_todo on public.%I', t);
    execute format('create policy gerencia_todo on public.%I for all to authenticated using (public.mi_rol() = ''gerencia'') with check (public.mi_rol() = ''gerencia'')', t);
  end loop;
end $$;

-- Perfiles: cada uno ve el suyo.
drop policy if exists perfiles_propio on public.perfiles;
create policy perfiles_propio on public.perfiles for select to authenticated using (id = auth.uid());

-- Locales: contadora ve todos; encargado el suyo.
drop policy if exists locales_contadora on public.locales;
create policy locales_contadora on public.locales for select to authenticated using (public.mi_rol() = 'contadora');
drop policy if exists locales_encargado on public.locales;
create policy locales_encargado on public.locales for select to authenticated
  using (public.mi_rol() = 'encargado' and id = public.mi_local());

-- Proveedores: contadora lee y escribe (CUIT/CBU son suyos). Encargado: solo vista proveedores_basico.
drop policy if exists prov_contadora on public.proveedores;
create policy prov_contadora on public.proveedores for select to authenticated using (public.mi_rol() = 'contadora');

-- Productos: contadora lee todo; encargado solo su local.
drop policy if exists prod_contadora on public.productos;
create policy prod_contadora on public.productos for select to authenticated using (public.mi_rol() = 'contadora');
drop policy if exists prod_encargado on public.productos;
create policy prod_encargado on public.productos for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());

drop policy if exists alias_lectura on public.producto_alias;
create policy alias_lectura on public.producto_alias for select to authenticated
  using (public.mi_rol() = 'contadora'
         or exists (select 1 from public.productos p where p.id = producto_id and p.local_id = public.mi_local()));

-- Precios: solo gerencia (todo) y contadora (lectura).
drop policy if exists precios_contadora on public.precios;
create policy precios_contadora on public.precios for select to authenticated using (public.mi_rol() = 'contadora');

-- Recetas: lectura contadora y encargado del local del elaborado.
drop policy if exists recetas_lectura on public.recetas;
create policy recetas_lectura on public.recetas for select to authenticated
  using (public.mi_rol() = 'contadora'
         or exists (select 1 from public.productos p where p.id = producto_id and p.local_id = public.mi_local()));
drop policy if exists receta_items_lectura on public.receta_items;
create policy receta_items_lectura on public.receta_items for select to authenticated
  using (public.mi_rol() = 'contadora'
         or exists (select 1 from public.recetas r join public.productos p on p.id = r.producto_id
                    where r.id = receta_id and p.local_id = public.mi_local()));

-- Movimientos: encargado lee e inserta en su local (no ventas ni stock inicial).
drop policy if exists mov_contadora on public.movimientos;
create policy mov_contadora on public.movimientos for select to authenticated using (public.mi_rol() = 'contadora');
drop policy if exists mov_enc_sel on public.movimientos;
create policy mov_enc_sel on public.movimientos for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());
drop policy if exists mov_enc_ins on public.movimientos;
create policy mov_enc_ins on public.movimientos for insert to authenticated
  with check (public.mi_rol() = 'encargado' and local_id = public.mi_local()
              and tipo in ('recepcion','merma','ajuste_conteo','produccion_consumo','produccion_alta'));

-- Órdenes: encargado lee las de su local, crea y edita borradores propios.
drop policy if exists oc_contadora on public.ordenes_compra;
create policy oc_contadora on public.ordenes_compra for select to authenticated using (public.mi_rol() = 'contadora');
drop policy if exists oc_enc_sel on public.ordenes_compra;
create policy oc_enc_sel on public.ordenes_compra for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());
drop policy if exists oc_enc_ins on public.ordenes_compra;
create policy oc_enc_ins on public.ordenes_compra for insert to authenticated
  with check (public.mi_rol() = 'encargado' and local_id = public.mi_local() and estado = 'borrador');
drop policy if exists oc_enc_upd on public.ordenes_compra;
create policy oc_enc_upd on public.ordenes_compra for update to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local() and estado = 'borrador')
  with check (public.mi_rol() = 'encargado' and local_id = public.mi_local() and estado = 'borrador');

drop policy if exists oi_contadora on public.orden_items;
create policy oi_contadora on public.orden_items for select to authenticated using (public.mi_rol() = 'contadora');
drop policy if exists oi_enc_sel on public.orden_items;
create policy oi_enc_sel on public.orden_items for select to authenticated
  using (public.mi_rol() = 'encargado'
         and exists (select 1 from public.ordenes_compra o where o.id = orden_id and o.local_id = public.mi_local()));
drop policy if exists oi_enc_mod on public.orden_items;
create policy oi_enc_mod on public.orden_items for all to authenticated
  using (public.mi_rol() = 'encargado'
         and exists (select 1 from public.ordenes_compra o where o.id = orden_id and o.local_id = public.mi_local() and o.estado = 'borrador'))
  with check (public.mi_rol() = 'encargado'
         and exists (select 1 from public.ordenes_compra o where o.id = orden_id and o.local_id = public.mi_local() and o.estado = 'borrador'));

-- Precios de ítems de orden: gerencia (todo) y contadora (lectura).
drop policy if exists oip_contadora on public.orden_item_precios;
create policy oip_contadora on public.orden_item_precios for select to authenticated using (public.mi_rol() = 'contadora');

-- Ventas: contadora lee; encargado nada.
drop policy if exists vi_contadora on public.ventas_import;
create policy vi_contadora on public.ventas_import for select to authenticated using (public.mi_rol() = 'contadora');
drop policy if exists vit_contadora on public.ventas_items;
create policy vit_contadora on public.ventas_items for select to authenticated using (public.mi_rol() = 'contadora');

-- Facturas y pagos: contadora lee y escribe; encargado nada.
do $$
declare t text;
begin
  foreach t in array array['facturas_proveedor','pagos','pago_facturas'] loop
    execute format('drop policy if exists contadora_todo on public.%I', t);
    execute format('create policy contadora_todo on public.%I for all to authenticated using (public.mi_rol() = ''contadora'') with check (public.mi_rol() = ''contadora'')', t);
  end loop;
end $$;

-- ============ Privilegios ============
-- anon no accede a nada; authenticated queda limitado por RLS.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ============ Storage: bucket privado de comprobantes ============
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false)
      on conflict (id) do nothing;
    drop policy if exists comprobantes_select on storage.objects;
    drop policy if exists comprobantes_insert on storage.objects;
    drop policy if exists comprobantes_update on storage.objects;
    drop policy if exists comprobantes_delete on storage.objects;
    create policy comprobantes_select on storage.objects for select to authenticated
      using (bucket_id = 'comprobantes' and public.mi_rol() in ('contadora','gerencia'));
    create policy comprobantes_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'comprobantes' and public.mi_rol() in ('contadora','gerencia'));
    create policy comprobantes_update on storage.objects for update to authenticated
      using (bucket_id = 'comprobantes' and public.mi_rol() in ('contadora','gerencia'));
    create policy comprobantes_delete on storage.objects for delete to authenticated
      using (bucket_id = 'comprobantes' and public.mi_rol() in ('contadora','gerencia'));
  end if;
end $$;
