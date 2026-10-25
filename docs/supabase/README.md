# Supabase · Fase 0

Base de datos de stock, compras y pagos (reemplaza gradualmente las planillas de Google Sheets).

## Qué hay
- `supabase/migrations/0001_base.sql`: esquema, vistas (`precio_actual`, `stock_actual`, `cuenta_corriente`, `proveedores_basico`), `buscar_productos()`, `registrar_conteo()`, RLS y bucket privado `comprobantes`. Es idempotente.
- `scripts/supabase-seed-v3.js`: genera `supabase/seed/0002_seed_v3.sql` desde los CSV de la planilla V3.
- `scripts/verify-supabase.js`: aplica todo en un Postgres en memoria y chequea stock, búsqueda y permisos.
- `supabase/datos-v3-ejemplo/`: CSV chicos de ejemplo (sin datos reales).

## Roles
- `gerencia`: todo.
- `contadora`: lee catálogo, stock, precios y proveedores; escribe facturas, pagos e imputaciones; accede al bucket `comprobantes`.
- `encargado`: lee catálogo y stock de su local; inserta recepciones, mermas, conteos y órdenes en borrador de su local. Nunca ve precios, pagos, facturas ni CUIT/CBU/WhatsApp (solo `proveedores_basico`).
- Los usuarios se crean en Auth y se les asigna una fila en `perfiles` (id = `auth.users.id`, rol, local).

## Aplicar en Supabase
1. SQL Editor: pegar y correr `0001_base.sql`, después `0002_seed_v3.sql` (o usar el conector de Supabase).
2. Crear usuarios en Auth e insertar sus `perfiles`.

## Regenerar el seed
1. Exportar las hojas CATALOGO, PROVEEDORES y LOCALES a `supabase/datos-v3/*.csv` (solo lectura de la planilla).
2. `node scripts/supabase-seed-v3.js` (acepta `dirCSV` y `salida.sql` como argumentos).

`supabase/datos-v3/` y `supabase/seed/` están en `.gitignore`: contienen teléfonos de proveedores. No se versionan.

## Verificar
```
npm install --prefix /tmp/claude-0/pglite @electric-sql/pglite
node scripts/verify-supabase.js      # PGLITE_DIR cambia la ubicación
```
Sale con código distinto de 0 si falla algún chequeo.

## App stock (`stock/`, publicada en `/formulario-pedidos/stock/`)
PWA sin bundler que usa Supabase directo (`stock/config.js` con URL y publishable key; supabase-js vendorizado en `stock/vendor/`). Aplicar antes `0001_base.sql` y `0002_roles_pedidos.sql`.

**Roles (decisión del dueño)**
- `gerencia` (Jacobo): único administrador. Ve y hace todo: aprueba y envía pedidos por WhatsApp, recibe mercadería, cuenta stock, edita catálogo y costos.
- `encargado` (un usuario compartido por local): solo sube pedidos de su local (borrador). Ve el catálogo y "Quedan N", nunca costos. No registra conteos, recepciones ni movimientos (RLS lo impide: `0002` quita `mov_enc_ins`).

**Cómo se entra**
- Encargado: elige local + nombre (lista de `locales.encargados` u "Otro") + PIN del local. La app hace `signInWithPassword` con `local-<codigo en minúsculas>@docks-stock.app` y el PIN como contraseña. El nombre se guarda en `ordenes_compra.cargado_por_nombre`.
- Administración: email + contraseña de Jacobo.
- La lista de locales de la pantalla "Entrar" sale de `locales_login()` (código, nombre, encargados; ejecutable por anon).

**Crear usuarios**
1. Supabase → Authentication → Add user: email `local-<codigo>@docks-stock.app` (ej. `local-umo@docks-stock.app`), PIN como contraseña, marcar "Auto confirm". Igual para el email de Jacobo.
2. Insertar el perfil con `supabase/usuarios-ejemplo.sql` (parametrizado por email, sin contraseñas).

Productos sin proveedor: el encargado los pide igual (orden con `proveedor_id` nulo); gerencia asigna el proveedor en Pedidos y recién ahí puede aprobar y enviar. La recepción corre en la función transaccional `recibir_orden(orden, items)` (solo gerencia, todo o nada).

**Verificar**: `node scripts/verify-supabase.js` (RLS), `node scripts/verify-stock.js` (estático, CI) y `node scripts/e2e-stock.js` (manual, Playwright con API mockeada; capturas en `/mnt/project-files/app-stock/fase1/`).
