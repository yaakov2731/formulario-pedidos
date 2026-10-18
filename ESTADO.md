# Estado de continuidad · Pedidos Semanales

Actualizado: 18 de octubre de 2026. Responsable de esta etapa: Fable 5.1 (plan).

## Objetivo y aceptación

El usuario pidió un rediseño profesional de la app y de la planilla: la app es
confusa para los empleados, la planilla tiene demasiadas pestañas y lo único que
funciona bien es la carga de pedidos por encargado. Pidió un plan estructurado,
con instrucciones y agentes, para que Opus 5.5 lo ejecute. Esta etapa entrega
sólo el plan: `PLAN-V3.md`. No se implementó código ni se tocó la planilla.

## Contexto comprobado

Planilla real (`SHEET_ID` de `gas/utils.gs`, leída con el conector de Sheets):
38 pestañas. 9 transaccionales, 2 maestras, 16 vistas por local, 10 vistas o
dashboards (RESUMEN POR PROVEEDOR muestra `#ERROR!`) y LOG TELEGRAM. INICIO
OPERATIVO informa 1.303 líneas de pedido abiertas, 245 conteos, 37 recepciones,
0 partes de producción y 137 productos con stock cero. `Comprado` y `Entregado`
en PEDIDOS_DETALLE nunca cambian de NO. CONFIGURACIÓN usa nombres viejos de
locales (Parrilla, Heladería, Cafetería) que `normalizeLocalName_` traduce.

App: `index.html` con 7 pestañas (Inicio, Pedido, Stock real, Recepción,
Producción, Elaborados, Reportes) más Administración en `admin.js`. Backend
`gas/web_api.gs` expone 9 acciones GET y 8 POST; `scripts/patch_admin_backend.py`
agrega las administrativas en el deploy.

## Decisiones del plan

- Encargado: tres acciones (Pedir, Contar, Recibir) más Hoy; Producción y
  Elaborados sólo si el local los tiene habilitados.
- Gerencia: módulo Compras en escritorio (consolidado, orden de compra por
  proveedor, texto para WhatsApp, marcar Comprado). Cierra el ciclo del pedido:
  Pendiente → Comprado → Entregado.
- Planilla nueva de 9 pestañas (CATALOGO, PROVEEDORES, CONFIG, PEDIDOS,
  PEDIDO_LINEAS, MOVIMIENTOS, COMPRAS, TABLERO, LOG) con migración idempotente
  y archivo viejo como histórico. Corte por constante `SHEET_ID`.
- Ejecución con Opus 5.5 coordinador y hasta 3 agentes en paralelo con
  propiedad de archivos disjunta. Requiere relajar en `AGENTS.md` y `CLAUDE.md`
  la regla de un solo subagente; eso queda para la Fase 0, no se hizo aquí.
- Prompts listos por agente en `PLAN-V3.md` §4. Ocho preguntas abiertas con
  respuesta asumida en §5.

## Verificaciones y límites

Sólo cambios de documentación (`PLAN-V3.md`, este archivo). `node
scripts/verify-v2.js` se corrió como control de que el repo sigue íntegro. No se
ejecutó nada en Apps Script ni se escribió en la planilla; las lecturas fueron
de encabezados y celdas de resumen. Los conteos citados salen de INICIO
OPERATIVO al 16/10/2026 y de las dimensiones de las pestañas; no se recontaron
filas una por una.

## Próximo paso

El usuario responde las preguntas de `PLAN-V3.md` §5 y hace una copia de la
planilla en Drive. Luego abre una sesión con Opus 5.5 en la rama `v3` y pega el
prompt del coordinador (§4.1). La Fase 0 crea `docs/v3/CONTRATO.md` y ajusta
las reglas de paralelismo antes de lanzar el Agente A.
