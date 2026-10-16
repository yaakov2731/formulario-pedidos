# Repository Guidelines

## Project Structure & Module Organization
This repository is intentionally small and operational:

- `index.html`: single-file frontend served by GitHub Pages.
- `gas/*.gs`: current modular Google Apps Script backend bound to the master spreadsheet; `Code.gs` is the legacy layout.
- `scripts/verify-v2.js`: local structural verification.
- `scripts/verify-live-v2.js`: verifies the published `/exec` backend.
- `README.md`, `DEPLOY-V2.md`, `PRODUCT.md`, `DESIGN.md`: product, deploy, and design references.

Keep UI logic in `index.html` and spreadsheet-facing logic in `gas/*.gs`. Avoid introducing extra build tooling unless strictly necessary.

## Build, Test, and Development Commands
There is no bundler or local dev server in this repo. Use the verification scripts before publishing:

```powershell
node .\scripts\verify-v2.js
node .\scripts\verify-live-v2.js
```

- `verify-v2.js`: checks that required V2 modules, endpoints, and data structures still exist locally.
- `verify-live-v2.js`: checks the live Apps Script URL referenced by `SCRIPT_URL` in `index.html`.

## Coding Style & Naming Conventions
Use 2-space indentation in `index.html` and keep the file readable by grouping related sections clearly. Prefer plain, explicit JavaScript over abstractions. Use `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants such as `SCRIPT_URL`, and preserve Spanish UI copy exactly when requested.

In `gas/*.gs`, keep backend actions narrowly scoped and aligned with sheet names already in use, such as `PEDIDOS RECIBIDOS`, `PEDIDOS_DETALLE`, and `CONTROL STOCK`.

## Testing Guidelines
This repo uses verification scripts instead of a formal test framework. Run both scripts before deploys that touch frontend/backend contracts. After publishing, complete a manual smoke test covering `Pedido`, `Stock`, `Recepción`, `Producción`, and `Dashboard`.

## Commit & Pull Request Guidelines
Follow short, imperative commit subjects like the existing history:

- `Update pedidos wording`
- `Redesign stock workflow and quiet visual system`
- `Switch GitHub Pages to workflow deploy`

Prefer one focused change per commit. PRs should include a clear summary, impacted flows, spreadsheet or Apps Script implications, and screenshots when the visible UI changes.

## Deployment Notes
Publishing has two destinations: Apps Script and GitHub Pages. Follow `DEPLOY-V2.md`: the current workflow publishes both after updating `main`. If the Apps Script web app URL changes, update `SCRIPT_URL` in `index.html` before closing the task.

## Continuidad y consumo de IA

- Al comenzar, leer `ESTADO.md` y revisar `git status --short`; verificar lo que haya cambiado desde el resumen.
- Buscar primero archivos y símbolos relevantes con `rg`; no cargar el repositorio, catálogos de herramientas ni logs completos sin necesidad.
- Una herramienta implementa cada tarea; la otra sólo interviene por bloqueo o revisión de riesgo. No editar simultáneamente los mismos archivos.
- El usuario autorizó enrutamiento automático: para implementación, usar los roles de abajo; máximo un subagente activo, secuencialmente, sin duplicar trabajo.
- Elegir Luna para cambios mecánicos, Sol para implementación habitual y Astra para análisis complejo, si están disponibles. Velocidad Standard; razonamiento proporcional a la dificultad.
- Estas son preferencias: no afirmar que se cambió el modelo o la velocidad sin confirmación de la aplicación.
- Tras dos intentos fallidos con el mismo enfoque, resumir evidencia y cambiar la estrategia; no repetir sin información nueva.
- Ejecutar los checks necesarios para el cambio. No repetir verificaciones exitosas sin cambios o dudas nuevas; no sacrificar controles obligatorios por cuota.
- Antes de transferir la tarea o cerrar una etapa, actualizar `ESTADO.md`: decisiones, archivos propios, pruebas, pendientes y próximo paso concreto.
- Registrar la tarea en `.uso-ia/REGISTRO.csv` si existe; datos desconocidos vacíos, nunca cero inventado. No leer todo el registro en cada turno.
- Consultar cuota al inicio de jornada, a mitad y antes de tareas grandes cuando haya acceso. Usar la menor cuota restante entre ventanas; no convertir porcentajes a tokens.
- Con más de 40% trabajar normalmente; entre 20% y 40% priorizar entregas; por debajo de 20% reservar capacidad para cierre y verificación.
- No comprar créditos, activar cobros ni modificar suscripciones automáticamente. Si ambas herramientas se agotan, guardar el estado y esperar el reinicio.
- `USO-IA.md` contiene la guía bajo demanda. Mantener estas instrucciones breves y `ESTADO.md` en unas 300–500 palabras, sin secretos ni información operativa privada.

## Planificar y delegar automáticamente

- El coordinador clasifica el encargo con una inspección breve; no cambia su propio modelo por afirmar que lo hizo.
- Cambio mecánico claro de texto/estilo/documentación: plan de una frase y `ejecutor_simple_ia` (Luna).
- Función o corrección con alcance claro: plan breve y `ejecutor_ia` (Sol).
- Arquitectura, ambigüedad material, contratos/datos/autorización o error difícil: consultar `planificador_ia` (Astra), esperar su plan, cerrar ese agente y delegar a `ejecutor_ia` (Sol).
- Preguntas sin implementación: responder directamente; no crear ejecutor innecesario. Si el usuario sólo pide un plan, no ejecutar.
- Roles en `.codex/agents/`; si el cliente no expone roles personalizados, usar sus modelos e instrucciones explícitos al delegar con contexto mínimo. No transmitir todo el historial por defecto.
- Antes de delegar, pasar objetivo, restricciones, archivos relevantes, plan y aceptación. Mientras el ejecutor escribe, el coordinador no edita esos archivos.
- El coordinador revisa el resultado, completa verificaciones faltantes y actualiza estado/registro. No repite tests aprobados sin una razón nueva.
- Una vez fallida la selección de un modelo por acceso/cuota, no reintentar en bucle ni activar API/cobros. Usar un modelo disponible si conserva la calidad necesaria e informar la sustitución; si no, conservar estado y reportar el bloqueo.
- Son reglas de decisión para el agente, no un clasificador determinista. La selección efectiva se confirma en la actividad del subagente; cambios de config pueden requerir sesión nueva.
