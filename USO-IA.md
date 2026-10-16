# Trabajar con Codex y Claude Code

Protocolo del proyecto. La configuración local selecciona modelos por rol;
una selección explícita de sesión o una política administrada puede prevalecer.
No cambia los límites ni la facturación del proveedor.

## Encargar y retomar

Copiá este mensaje al comenzar una tarea:

```text
Objetivo: [resultado concreto].
Terminado cuando: [comprobación observable].
Alcance: [pantalla, módulo o flujo].
Restricciones: [datos y comportamientos a preservar].
Leé las instrucciones del proyecto y ESTADO.md. Comprobá los cambios existentes,
buscá primero los archivos relevantes, implementá y ejecutá los checks necesarios.
Cerrá actualizando ESTADO.md y el registro local de consumo si existe.
```

Una herramienta implementa; la segunda se usa por bloqueo o revisión justificada.
Transferí objetivo, restricciones, cambios, pruebas y próximo paso, no todo el chat.
Antes de cambiar, cerrá las ediciones en curso y verificá el diff.

## Selección y delegación preparadas

| Trabajo | Claude Code | Codex |
| --- | --- | --- |
| Textos, estilos, cambios mecánicos | Sonnet | Luna |
| Funciones y correcciones habituales | Sonnet | Sol |
| Arquitectura y errores difíciles | Opus durante el análisis | Astra durante el análisis |

Codex: `.codex/config.toml` configura Sol como coordinador y los roles de
`.codex/agents/`: Astra planifica lo complejo, Sol ejecuta planes y Luna resuelve
cambios mecánicos. El formato está adaptado al CLI instalado 0.144.4.
Las instrucciones seleccionan el rol según la tarea; no son un clasificador
determinista. Máximo un subagente activo a la vez, sin escrituras simultáneas.

Claude: `.claude/settings.json` usa `opusplan`, con Opus en modo Plan y Sonnet
en ejecución. Ese alias cambia el modelo según el modo, no cambia de modo por sí
solo. Para tareas complejas fuera de modo Plan, las instrucciones piden delegar
en `planificador-ia` (Opus, lectura) y luego `ejecutor-ia` (Sonnet). No combinar
ambas rutas de planificación. Cambios simples se resuelven directamente.

Abrí una sesión nueva en este proyecto para cargar las configuraciones. Comprobá
el modelo efectivo en actividad de agentes (Claude: `/tasks`). En este chat las
herramientas de delegación existentes permiten indicar el modelo explícitamente;
crear archivos no modifica el modelo del turno ya iniciado. Usá Standard donde
esté disponible. Si falta acceso/cuota, informar la sustitución o bloqueo sin
comprar créditos ni activar API. No hay transferencia automática entre proveedores.

## Rutina de jornada

1. Al comenzar: leer el estado y comprobar cuota y reinicios de ambas herramientas.
2. A mitad de jornada y antes de una tarea grande: consultar nuevamente el consumo.
3. Al cerrar cada tarea: guardar el estado y añadir una fila a `.uso-ia/REGISTRO.csv`.

Codex: panel de consumo o `/status` en CLI. Claude: `/usage`, `/context`,
`/compact` para continuidad y `/clear` para trabajo independiente con estado guardado.
Abrir otro chat no repone cuota. Compactar también procesa la conversación.

Tomá la menor cuota restante entre ventanas conocidas: más de 40%, trabajo normal;
20–40%, priorizar entregas; menos de 20%, reservar cierre y verificación.
Son reglas propias, no límites del proveedor. Si no hay medición, registrar
desconocido y no asumir disponibilidad. Un reinicio puede invalidar la resta
antes/después; las cuotas compartidas tampoco permiten atribuir todo a una tarea.

## Registro privado y presupuesto

`.uso-ia/` está excluida de Git. El registro es manual/asistido por el agente,
no un monitor automático. No contiene claves ni datos de clientes.

En `REGISTRO.csv`, usar fecha y hora argentina con offset, identificador de tarea,
herramienta, modelo observado, minutos aproximados, porcentajes restantes por
ventana antes/después, resultado, retrabajo, interrupciones y notas. Campos
numéricos desconocidos vacíos; cero sólo cuando está comprobado. El CSV se abre
en Excel mediante Datos > Desde texto/CSV, UTF-8, delimitador coma.

`PRESUPUESTO.md` contiene la conciliación pendiente. El límite de gasto acordado
incluye ambas herramientas; no se considera cumplido hasta comprobar facturas,
plazas, impuestos y cargos adicionales. No publicar facturas ni identificadores.
Primera semana sin compras de créditos ni activación de consumo adicional.

## Evaluación de siete días

El primer día de uso real es D1; al cerrar D7 completar `REVISION-7-DIAS.md`.
No crear recordatorios ni tareas automáticas salvo pedido del usuario.

- Continuidad: retomar en un chat nuevo con el estado y comprobar que identifica
  objetivo, cambios existentes, restricciones y próximo paso sin repetir la historia.
- Calidad: registrar al menos una tarea simple y una compleja reales, sus checks,
  resultado y retrabajo; no inventar cambios para completar la muestra.
- Costo: conciliar facturas y contar interrupciones; total mensual <= USD 150.
- Si hay bloqueos, ajustar primero contexto, modelos y duplicación. Proponer cambios
  de plan sólo con evidencia; no ejecutarlos automáticamente.

## Llevarlo a otro proyecto

Integrar estas reglas en los archivos existentes, sin sobrescribirlos. Adaptar
arquitectura y pruebas; crear su estado real y registro privado con exclusión Git.
No copiar el estado de Pedidos Semanales ni sus reglas de despliegue a otra app.
Este cambio sólo instala el protocolo y los roles en este repositorio.

## Fuentes

- [OpenAI: consumo, modelos y precios](https://learn.chatgpt.com/docs/pricing).
- [Claude Code: costos y contexto](https://code.claude.com/docs/en/costs).
- [Claude Max: modalidades y precio](https://support.claude.com/en/articles/11049741-what-is-the-max-plan).
- [Codex: agentes y modelos](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- [Claude: opusplan](https://code.claude.com/docs/en/model-config#opusplan-model-setting).
- [Claude: agentes personalizados](https://code.claude.com/docs/en/sub-agents).

Fuentes consultadas durante esta sesión, 15–16 de octubre de 2026. Volver a comprobar precios antes
de contratar. No hay promesa de uso ilimitado ni ahorro medido todavía.
