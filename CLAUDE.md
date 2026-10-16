# Claude Code · Pedidos Semanales

Leé `AGENTS.md` al iniciar: es la fuente común de reglas del repositorio,
verificaciones, publicación y consumo. Después leé `ESTADO.md` y comprobá
`git status --short` antes de continuar. No cargues documentación adicional
salvo que la tarea la requiera.

## Modelo y contexto

- `.claude/settings.json` selecciona `opusplan`: Claude Code usa Opus mientras está en modo Plan y Sonnet al ejecutar. El cambio de fase no es automático: el modo Plan se inicia y se termina explícitamente.
- Para tareas simples y habituales, trabajá directamente con el modelo de ejecución de `opusplan` (Sonnet), sin delegar.
- Para tareas complejas, delegá automáticamente primero en `planificador-ia` (Opus) y después en `ejecutor-ia` (Sonnet), pasando un plan breve con aceptación. Si el usuario ya activó modo Plan, usá la ruta nativa `opusplan` y no crees otro planificador. Si sólo pidió planificar, no ejecutes.
- La complejidad se evalúa según el contexto; estas pautas orientan la decisión y no son una detección automática ni determinista.
- Si delegás, ejecutá planificador y ejecutor secuencialmente, con un máximo de un subagente activo a la vez. `ejecutor-ia` implementa el plan y corre las verificaciones pertinentes; no inicia agentes anidados.
- La selección configurada es una preferencia del proyecto; las instrucciones por sí solas no fuerzan una selección en otros entornos o versiones.
- Consultá `/usage` al comenzar la jornada, a mitad y antes de trabajo grande.
- Usá `/context` si el chat crece o consume más de lo esperado.
- Conservá decisiones, evidencia y próximo paso en `ESTADO.md` antes de transferir o limpiar el chat.
- Usá `/compact` para mantener continuidad; resumir también consume y no repone cuota.
- Usá `/clear` para una tarea independiente después de guardar el estado.
- No abras una segunda implementación del mismo trabajo en Codex.
- El usuario autoriza esta delegación secuencial; no actives agentes adicionales, tareas periódicas ni consumo adicional por defecto.

## Compact instructions

Conservá objetivo y aceptación, restricciones del usuario, cambios propios y ajenos,
decisiones vigentes, errores concretos, checks ejecutados y su resultado, pendientes
y próximo paso. Omití logs completos, búsquedas agotadas y alternativas descartadas
que no expliquen un riesgo actual. No conviertas verificaciones pendientes en éxitos.
