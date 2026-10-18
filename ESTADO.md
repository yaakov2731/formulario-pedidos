# Estado de continuidad · Pedidos Semanales

Actualizado: 18 de octubre de 2026 (tarde). Coordinador: Claude Code. Rama: `claude/gallant-keller-fwqf4p`.
PRs #10 (Elaborados) y #11 (URL del backend nuevo) mergeados y publicados.

## Objetivo y aceptación

V3 (`v3/`, `v3/gas/`) es el sistema nuevo desde cero (PR #7 ya en `main`). La app actual (`index.html`, `gas/`)
sigue sin cambios hasta el corte. Esta etapa agrega **Elaborados: qué queda** (pedido del usuario):
una pestaña para anotar, por producto elaborado (p. ej. en la parrilla de Umo Grill), cuánto quedó
**listo para la venta**, **marcado** o **crudo**, en la app y en la planilla.

## Hecho en esta etapa

- Planilla: dos pestañas nuevas, `ELABORADOS` (lista por local con el último estado: Listo, Marcado, Crudo,
  Ultimo_Conteo, Activo) y `CONTEO_ELABORADOS` (una fila por producto y conteo, con Total). Van entre COMPRAS y
  TABLERO; `setupV3` las crea y, en planillas ya instaladas, se crean solas al primer uso. TABLERO suma el
  bloque 6 (columna 33) con el último conteo de elaborados. `reiniciarDatos` las vacía y conserva la lista.
- Backend `v3/gas/elaborados.gs`: `getElaborados`, `saveConteoElaborados` (ID `ELB-…`, idempotente, vacío = 0,
  al menos un estado por ítem), `agregarElaborado` (encargado, sin clave, no duplica Producto + Unidad),
  `saveElaborado` (gerencia). `getHoy` devuelve `ultimo_elaborados` y `elaborados_activos`; `getOperacion`
  reconoce tipo `ELABORADOS`. Códigos `UMO-E001`… Paquete `DocksV3.gs` regenerado.
- Encargado (`v3/index.html`, `encargado.js`, `encargado.css`): quinta pestaña **Elaborados** con tres campos
  por producto (Listo / Marcado / Crudo), botón «Nada», buscador y grupos, borrador por local, revisión,
  guardado con confirmación por ID, alta de un elaborado desde el celular, y fila «Elaborados que quedan» en Hoy.
- Gerencia (`v3/compras.html`, `compras.js`): sección **Elaborados** con tabla por local (Listo, Marcado,
  Crudo, Total, último conteo), filtros, alta y edición (nombre, grupo, unidad, activo, observaciones).
- Contrato `docs/v3/CONTRATO.md` (D5, §3, §3.6, §4, §5), `docs/v3/DESPLIEGUE.md`, `README.md`.
- Planilla real (con el conector de Sheets): creadas `ELABORADOS` y `CONTEO_ELABORADOS` con formatos, validaciones
  y bloque 6 del TABLERO (la URL nueva del usuario no corría el código nuevo al principio; el LOG ya muestra
  `agregarElaborado` y `saveConteoElaborados` funcionando). Cargados 69 elaborados desde el catálogo (Carnes y
  Verdulería de Umo Grill, Trento Café y Brooklyn; no existe categoría Tortas en el catálogo).
- Velocidad: copia local por local (`cache:*` en localStorage) de Hoy, catálogo, elaborados y por recibir, con
  pintado instantáneo y actualización en segundo plano; precarga de catálogo y elaborados tras Hoy; fuentes de
  Google sin bloquear el primer pintado.

## Verificaciones

Pasan `verify-v3-core`, `verify-v3-backend` (con bloque nuevo de elaborados y reinicio), `verify-v3-encargado`
(lógica y envío de elaborados, cinco pestañas), `verify-v3-compras` y `v3-bundle-gas.js --check`.
`scripts/e2e-v3.js` en Chromium contra la planilla en memoria (seed con elaborados en Umo Grill): carga de
Listo/Crudo, «Nada», alta de «Vacío» desde el celular, revisión, guardado, fila en Hoy, tabla y edición en
Compras; sin errores de JS ni scroll horizontal. Capturas revisadas en 390 px y 1366 px.

## Límites

La API en vivo no se probó desde aquí (sin acceso a `script.google.com`). `verify-live-v3.js` ahora comprueba
`getElaborados` y avisa si el backend publicado es anterior. Los tres estados son fijos (no configurables por
producto). No hay historial por turno en la app: la planilla `CONTEO_ELABORADOS` guarda todos los conteos.

## Próximo paso

Usuario: hacer merge del PR; pegar `v3/apps-script/DocksV3.gs` en el editor de Apps Script y publicar una
**versión nueva** de la implementación (la URL no cambia); abrir la pestaña Elaborados en el celular o correr
`setupV3` para que aparezcan las pestañas; cargar los elaborados de Umo Grill; correr `node scripts/verify-live-v3.js`.
Coordinador: ajustar textos o estados según el uso real del primer cierre.
