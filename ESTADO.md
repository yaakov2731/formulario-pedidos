# Estado de continuidad · Pedidos Semanales

Actualizado: 16 de octubre de 2026. Responsable de esta etapa: Codex.

## Objetivo y aceptación

Instalar el protocolo aprobado de consumo, continuidad y selección de modelos.
El usuario agregó planificación con un modelo potente y ejecución delegada a
otro. El alcance sigue siendo este repositorio, sin despliegues de producto ni
compras. Las decisiones de enrutamiento son instrucciones del agente, no un
clasificador determinista ni una garantía de ahorro.

## Contexto comprobado

El frontend está en `index.html`, con administración en `admin.js`; el backend
actual es modular, en `gas/*.gs`, conectado a Google Sheets. No hay bundler.
`README.md` enumera nueve verificaciones locales. `DEPLOY-V2.md` describe la
publicación de Apps Script y Pages mediante el workflow al actualizar `main`.
El checkout estaba en `main`, último commit observado `417918e`.

Antes de esta tarea existían sin seguimiento `ACCEPTANCE.md`,
`PAGOS-PROVEEDORES.md`, `evidence/` y `graphify-out/`. Son trabajo previo:
no eliminarlos, publicarlos ni incorporarlos como parte de este cambio.

## Decisiones y archivos propios

`AGENTS.md` conserva las reglas existentes, corrige referencias al backend
antiguo y añade continuidad, búsquedas acotadas y manejo de cuota. `CLAUDE.md`
remite a esas reglas y define preferencias de Sonnet y conservación de contexto.
`USO-IA.md` contiene el procedimiento y la plantilla de encargo. `.gitignore`
excluye `.uso-ia/`, que contiene registro, presupuesto y revisión semanal privados.
`.codex/config.toml` añade coordinador Sol y roles Astra para planificar, Sol
para ejecutar y Luna para cambios mecánicos. Usa `agents.max_threads` y roles
con `config_file`, compatibles con CLI 0.144.4. Un subagente activo por vez.
`.claude/settings.json` usa `opusplan`; agentes Opus y Sonnet cubren delegación
secuencial. No duplicar planificador cuando ya está activo modo Plan nativo.
Los cambios se cargan en sesiones nuevas; no cambian el modelo del turno actual.

Una herramienta implementa cada tarea. No repetir el mismo enfoque fallido más
de dos veces sin nueva evidencia. Actualizar este estado al cerrar o transferir,
preservando restricciones y resultados reales. No saltar controles obligatorios.

## Verificaciones y límites

Se inspeccionaron estado Git, estructura, instrucciones y documentación local.
En la primera etapa pasaron `verify-v2.js`, lectura CSV y exclusión Git privada.
En esta etapa pasaron parseo de cuatro TOML, resolución de roles/modelos,
validación JSON, `claude plugin validate .claude/agents` y `git diff --check`.
`codex doctor` confirmó carga correcta de configuración; tiene avisos independientes
de PATH/npm y terminal no interactiva. No actualizar instalaciones por esta tarea.
Se delegó realmente la preparación de Claude a un agente Luna y terminó bien.
No se probó aún el circuito automático completo desde una sesión nueva de cada
cliente. No se publicó la app ni se ejecutaron pruebas live. Facturas, cuota
de Claude y ahorro semanal siguen pendientes. No se cambiaron suscripciones.

## Próximo paso

Abrir una sesión nueva aquí y dar un encargo real. Comprobar modelo efectivo
en actividad de agentes, aceptación y ausencia de edición simultánea. Registrar
cuota inicial/final y resultado, marcar D1 y evaluar al cerrar D7. Si el cliente
no carga roles, informar y usar delegación explícita disponible, sin inventar
éxitos. Conciliar facturas antes de compras. Ver `USO-IA.md` bajo demanda.
