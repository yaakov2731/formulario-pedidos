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
