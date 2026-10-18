# Estado de continuidad · Pedidos Semanales

Actualizado: 18 de octubre de 2026. Coordinador: Opus 5.5. PR: yaakov2731/formulario-pedidos#7.

## Objetivo y aceptación

Rediseño profesional de la app y la planilla (38 pestañas, confusas para los encargados).
El usuario pidió **sistema nuevo desde cero, sin migración**; proveedores y catálogo se cargan
de cero. La app actual (`index.html`, `gas/`) y su planilla siguen en uso, sin cambios.

## Hecho

- Plan (`PLAN-V3.md`) y contrato vigente (`docs/v3/CONTRATO.md`, versión 2, prevalece).
- Drive: respaldo de producción y planilla V3 vacía (IDs en el contrato §0.1).
- V3 construida con tres agentes en paralelo, archivos disjuntos:
  backend `v3/gas/` (9 pestañas, `setupV3`, API completa, Telegram opcional),
  encargado `v3/index.html` (Hoy, Pedir, Contar, Recibir), gerencia `v3/compras.html`
  (Compras con orden por WhatsApp, Órdenes, Faltantes, Stock, Catálogo con pegado desde Excel,
  Proveedores, Locales). Base compartida `v3/core.js` y `v3/base.css` del coordinador.
- `v3/apps-script/DocksV3.gs`: backend en un archivo para pegar. Guía `docs/v3/DESPLIEGUE.md`.
- Workflow: corre los checks V3, publica `v3/` en Pages y tiene `deploy-gas-v3`, que se saltea
  sin los secretos `GAS_V3_SCRIPT_ID` y `GAS_V3_DEPLOYMENT_ID`.
- Corrección del coordinador: el contador del chip Sugeridos no se actualizaba al refrescar el catálogo.
- Skills "Replica" (Jakeschincariol/replica-skill v1.0.0, MIT) instalados en `.claude/skills/replica-*`
  a pedido del usuario; 57 tests del paquete pasan en Python 3.13. Sin uso aún en el producto.

## Verificaciones

Pasan las 5 verificaciones V3 (core, backend, encargado, compras, paquete) y las 10 del V2.
`scripts/e2e-v3.js` en Chromium contra la planilla en memoria: login, conteo, pedido con
sugeridos, segundo local, clave incorrecta, orden por proveedor con texto WhatsApp, recepción
con faltante, faltantes y stock; sin errores de JS ni scroll horizontal. Saldos coherentes.

## Instalación real (18/10/2026)

El usuario pegó el backend, corrió `instalarV3` y publicó la web app; la URL `/exec` está en
`v3/config.js`. Revisado en la planilla con el conector de Sheets: 9 pestañas, filas congeladas,
protecciones con advertencia, 9 locales, validaciones y formato texto correctos. Las fórmulas de
TABLERO daban error de sintaxis porque la planilla está en `es_AR` (separador `;`): corregidas en
vivo y en el código (`setFormulaLocal_` detecta el separador). Este entorno no llega a
`script.google.com`; la API en vivo se verifica con `node scripts/verify-live-v3.js` (sólo lectura).

## Límites

La API en vivo, LockService y Telegram reales siguen sin probar desde aquí. El frontend V3
sólo se publica en Pages al hacer merge a `main` (decisión del usuario). `AGENTS.md`/`CLAUDE.md`
no se cambiaron (edición bloqueada por permisos; texto en `docs/v3/FASE-0.md`).

## Próximo paso

Usuario: correr `verify-live-v3.js`; decidir el merge del PR para publicar `/v3/`; cargar
proveedores y el catálogo de un local piloto; cargar en GitHub los secretos `GAS_V3_SCRIPT_ID`
y `GAS_V3_DEPLOYMENT_ID` para que los cambios del backend se publiquen solos. Coordinador:
recorrido piloto con datos reales y ajustes.
