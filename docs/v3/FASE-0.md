# Fase 0 · Cierre

Fecha: 18 de octubre de 2026.

## Hecho

| Ítem | Estado | Evidencia |
| --- | --- | --- |
| Respaldo de la planilla de producción | Hecho | Copia en Drive con las 38 pestañas; ID en `CONTRATO.md` §0.1. Sin migración: queda sólo como respaldo |
| Planilla destino V3 de pruebas | Hecho, vacía | ID en `CONTRATO.md` §0.1 |
| Contrato de datos y API para agentes | Hecho | `docs/v3/CONTRATO.md` |
| Respuestas asumidas de `PLAN-V3.md` §5 | Adoptadas | `CONTRATO.md` §0 |
| Rama de trabajo | La de la sesión, con PR abierto | No se creó rama `v3`: la sesión sólo puede pushear a su rama asignada |

## Pendiente del usuario: habilitar agentes en paralelo

La edición automática de `AGENTS.md` y `CLAUDE.md` fue bloqueada por el control de
permisos, porque cambia las reglas que gobiernan al propio agente. Sin este cambio,
las fases 2 a 4 corren de a un agente por vez: funciona igual, pero tarda más.

Para habilitarlo, agregar estas líneas a mano.

En `AGENTS.md`, debajo de la línea que empieza con
"- El usuario autorizó enrutamiento automático":

```
- Excepción proyecto V3 (autorizada por el usuario el 18/10/2026): mientras se ejecute `PLAN-V3.md`, el coordinador puede tener hasta 3 subagentes activos en paralelo, siempre que cada uno sea dueño de archivos distintos según `PLAN-V3.md` §3.2 y `docs/v3/CONTRATO.md`. Sólo el coordinador integra en `index.html` y modifica el contrato. Fuera del proyecto V3 rige la regla de un subagente.
```

En `CLAUDE.md`, debajo de la línea que empieza con "- Si delegás, ejecutá planificador":

```
- Excepción proyecto V3: al ejecutar `PLAN-V3.md` se permiten hasta 3 subagentes en paralelo con propiedad de archivos disjunta (ver `AGENTS.md` y `docs/v3/CONTRATO.md`). Ningún agente edita archivos de otro; el coordinador integra `index.html`.
```

## Siguiente

El usuario pidió sistema nuevo sin migración. Construcción en curso con tres agentes en paralelo
(backend, encargado, compras) según `CONTRATO.md` versión 2. Despliegue: `docs/v3/DESPLIEGUE.md`.
