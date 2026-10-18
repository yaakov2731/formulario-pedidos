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

## Verificaciones

Pasan las 5 verificaciones V3 (core, backend, encargado, compras, paquete) y las 10 del V2.
`scripts/e2e-v3.js` en Chromium contra la planilla en memoria: login, conteo, pedido con
sugeridos, segundo local, clave incorrecta, orden por proveedor con texto WhatsApp, recepción
con faltante, faltantes y stock; sin errores de JS ni scroll horizontal. Saldos coherentes.

## Límites

No se probó contra Google Sheets real: fórmulas QUERY de TABLERO, validaciones, protecciones,
formato texto, LockService y Telegram reales quedan para la primera instalación. No se publicó
nada. `AGENTS.md`/`CLAUDE.md` no se cambiaron (edición bloqueada por permisos; texto en
`docs/v3/FASE-0.md`).

## Próximo paso

Usuario: seguir `docs/v3/DESPLIEGUE.md` §1 (pegar backend, `ADMIN_KEY`, `setupV3`, publicar)
y pasar la URL `/exec`. Coordinador: ponerla en `v3/config.js`, revisar TABLERO en la planilla
real y hacer un recorrido con datos reales antes del merge a `main`.
