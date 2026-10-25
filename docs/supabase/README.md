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

## Fase 3 y 2 · Ventas, recetas, producción y sugerido (`0003_ventas_recetas.sql`)
Aplicar después de 0001 y 0002 (es idempotente). Para pegar en el SQL Editor hay una copia en `/mnt/project-files/supabase/5-ventas-recetas.sql`. Solo gerencia ve y escribe ventas, recetas, producción y reportes: `0003` quita la lectura de la contadora sobre ventas y la del encargado/contadora sobre recetas.

**Ventas (gerencia → Ventas)**
1. Elegir local y fecha (se completa con la del archivo) y subir uno o varios Excel: "Detalle de productos vendidos por pedido" (principal), "Formas de pago de pedidos" y/o "Pedidos por producto" (modo simple, sin pedidos). El tipo se detecta por los encabezados. Lector: SheetJS vendorizado (`stock/vendor/xlsx.full.min.js`), se carga solo en esta pantalla.
2. Vista previa: total productos, total cobrado, pedidos, diferencia y pedidos a $0.
3. Asociar cada código de Núcleo una sola vez (`producto_alias`, origen `nucleo`, único por local): sugerencia automática con `buscar_productos`, "Elegir producto", "Crear plato" (producto elaborado, categoría `Carta`, código `PLA-<código Núcleo>`) o "No descontar" (solo para esa importación). Mientras falten asociaciones no se puede confirmar.
4. Confirmar llama a `importar_ventas(local, fecha, pedidos, items, pagos, archivo)`, transaccional e idempotente: reimportar el mismo local y día reemplaza la importación anterior (borra sus movimientos y filas). Un pedido ya importado en otra fecha se rechaza.

**Convención de unidades**: el stock está en `unidad_uso`; la recepción suma `cantidad × factor_conversion`. Una venta descuenta `cantidad vendida × cantidad_por_venta` (por defecto 1; caja x 6 que se vende por unidad: vender 1 lata descuenta 1 unidad = 1/6 de caja; una copa de una botella: 0,2). Un plato con receta explota `receta_items.cantidad × vendidos / rinde` en movimientos `venta` de sus insumos (unidad de uso de cada insumo, un nivel). Un plato sin receta no descuenta y se informa ("Vendidos sin receta", ordenado por cantidad). Los movimientos de una importación llevan la fecha de la venta (para el consumo semanal).

**Cocina**: Recetas (`guardar_receta`, insumos del local con cantidad en su unidad de uso y rinde; costo estimado) y Producción (`registrar_produccion(local, producto, cantidad, nota)`: `produccion_consumo` de los insumos y `produccion_alta` del elaborado, transaccional, con historial en `producciones`). Marcar un producto como elaborado se hace en Catálogo.

**Análisis y merma**: Análisis por local y rango (total, pedidos, ticket, medios de pago, franjas horarias en horario argentino, sector, tipo de pedido, rubro, top, pedidos a $0 y cobrado contra productos; la columna `mozo` está preparada y no se muestra si viene vacía). Merma (`merma_control`): consumo teórico (ventas + producción) contra ajustes por conteo, valuados a `precio_actual / factor_conversion`, con los faltantes más caros.

**Pedido sugerido (`sugerido_pedido(local)`, security invoker, sin precios)**: por producto devuelve stock, consumo semanal (ventas + consumo de producción + mermas de los últimos 28 días / 4), pendiente (órdenes aprobada/enviada/parcial no recibidas) y sugerido en unidad de compra = `max(0, ceil((consumo − stock − pendiente) / factor))`; sin consumo usa la cantidad ideal menos stock y pendiente como antes. La cantidad ideal se interpreta en unidad de uso, igual que el stock. Los platos (`Carta`) no se piden ni se cuentan. Pedir (encargado) lo usa y sigue mostrando solo "Quedan N" y "Pedir N"; si la función no existe todavía, vuelve al cálculo anterior. Nota: el encargado puede leer los movimientos de su local (necesario para "Quedan"), pero no las tablas de ventas, recetas ni producción.

**Verificar**: `node scripts/verify-supabase.js` (aplica 0001+0002+0003), `node scripts/verify-stock.js` (incluye el parser contra `scripts/fixtures/nucleo/`, generados con `generar.js`) y `node scripts/e2e-stock.js` (capturas en `/mnt/project-files/app-stock/fase3/`).

## Fase 4 y 5 · Pagos, WhatsApp y Tablero (`0004_pagos_tablero.sql`)
Aplicar después de 0001, 0002 y 0003 (idempotente). Copia para pegar en el SQL Editor: `/mnt/project-files/supabase/6-pagos-tablero.sql`. Sin comandos extra: el bucket `comprobantes` ya existe desde 0001. Para que la contadora entre a la app basta su usuario en Auth + una fila en `perfiles` con rol `contadora` (mismo login "Administración").

**Ajuste de fase 2**: `sugerido_pedido` divide el consumo de los últimos 28 días por las semanas con ventas importadas del local (desde la primera venta, mínimo 1 y máximo 4), no siempre por 4.

**Pagos (gerencia y contadora; el encargado nunca)** · pantalla "Pagos", con cuatro pestañas:
- *Cuentas*: cuenta corriente por proveedor (`cuenta_corriente`: facturado, pagado, saldo) y facturas pendientes.
- *Facturas*: alta (proveedor, número, fecha, vencimiento, total, PDF o foto opcional en `facturas/<proveedor>/<archivo>`); las vencidas se resaltan (vista `facturas_pendientes`).
- *Pagos*: lista con estado "Avisado" / "Sin avisar", ver comprobante y avisar.
- *Cargar*: se sube el PDF del comprobante; pdf.js (vendorizado, ver `stock/vendor/README.md`) lee el texto en el navegador, arma las líneas por coordenada Y/X y `leerComprobante` precarga el formulario (editable). El proveedor se busca por `proveedores.cuit`; si no está, se sugiere por razón social y, al confirmar, se guarda el CUIT. Se imputa a facturas pendientes (las más viejas primero, editable; lo no imputado queda a cuenta). Guarda `registrar_pago(p_pago, p_imputaciones)` (transaccional, solo gerencia/contadora, rechaza la misma operación dos veces y sobreimputaciones) y sube el PDF a `pagos/<proveedor>/<operación>.pdf`.
- `stock/js/comprobante.js` es una copia **generada** de `supabase/lib/comprobante.js` (única fuente): tras tocar el original, `node scripts/verify-stock.js --sync`.

**WhatsApp**: nunca envío automático ni bot; lo manda una persona. Botón "Avisar por WhatsApp" (en el pago recién guardado o en la lista): en el celular usa Compartir con el PDF adjunto (`navigator.share({files, text})`); en la PC abre `wa.me/<whatsapp del proveedor>?text=…` y ofrece descargar el PDF (URL firmada) para adjuntarlo a mano. Al enviar se marca `avisado_en`. El WhatsApp, CUIT y alias/CBU se editan en Catálogo → Proveedores (gerencia).

**Tablero (solo gerencia, inicio)** · `tablero(p_local, p_desde, p_hasta)` devuelve un jsonb (una sola llamada; sin fechas usa lunes a hoy; en la app, la semana contra el mismo tramo anterior):
- ventas (total cobrado de las importaciones), compras (recepciones valorizadas), costo de mercadería vendida (consumo teórico × precio / factor) y margen bruto estimado (ventas − costo; lo que no tiene precio no resta);
- plata parada en stock por local, deuda con proveedores y facturas vencidas, pagos sin avisar, pedidos por aprobar, faltantes más caros (merma_control) y datos pendientes (sin precio, sin proveedor, elaborados sin receta). Cada tarjeta lleva a su pantalla.
- Nota: Postgres no admite un parámetro obligatorio después de uno con valor por defecto, por eso los tres parámetros tienen default (`null`); se llama por nombre.

**Verificar**: `node scripts/verify-supabase.js` (0001–0004), `node scripts/verify-stock.js` (incluye el lector con texto de pdf.js de un fixture inventado) y `node scripts/e2e-stock.js` (capturas en `/mnt/project-files/app-stock/fase4/`).
