# Reglas de trabajo para Claude en este repo

Ver también `AGENTS.md` (estructura, comandos y estilo del repo).

## Ahorro de contexto (obligatorio)
- NUNCA leas `index.html` completo (~286 KB, ~5.100 líneas). Usá Grep para ubicar
  y Read con offset/limit para leer solo 50–150 líneas alrededor.
- Mapa aproximado de `index.html` (verificá con grep, puede moverse):
  - líneas 1–668: CSS (`<style>`)
  - líneas 669–1285: HTML de las pantallas (Pedido ~792, Stock ~834,
    Resumen ~866, botón enviar ~1138, Configuración ~1155)
  - líneas 1286–5090: JavaScript (`SCRIPT_URL` ~1305)
- Backend en `gas/`: buscá la acción en `gas/web_api.gs` y seguí solo esa función.
  `gas/utils.gs` (70 KB) y `gas/setup_plantilla_pro.gs` (35 KB): leer por partes.
- No leas `PRODUCT.md` ni `DESIGN.md` enteros salvo que la tarea sea de producto o diseño.
- Para búsquedas amplias usá un subagente (Explore) y traé solo la conclusión.
- Cambios chicos (textos, colores): buscá la línea, editá, no releas el archivo.

## Verificación
- Antes de publicar: `node scripts/verify-v2.js`. Corré solo el `verify-*.js`
  relacionado con el cambio, no todos.

## Compact instructions
Al compactar, conservá: tarea actual, archivos y líneas tocadas, decisiones tomadas,
pendientes. Descartá salidas de comandos y contenido de archivos ya leídos.
