# Estado de continuidad · Pedidos Semanales

Actualizado: 22 de octubre de 2026 (noche). Coordinador: Claude Code. Rama: `claude/serene-meitner-7yry00`.

## Objetivo y aceptación

El usuario reportó que "la app no conecta con la planilla" y aclaró que usa la app original
`https://yaakov2731.github.io/formulario-pedidos/` (`index.html` + `gas/`), no la V3. Aceptación: confirmar la conexión,
corregir lo que falle y dejar la planilla con datos coherentes.

## Diagnóstico

- La app original **sí conecta**: `PEDIDOS RECIBIDOS`, `PEDIDOS_DETALLE`, `CONTROL STOCK` y `LOG TELEGRAM` de
  `Sistema_Pedidos_Polo_Gastronomico_COMPLETO` tenían registros hasta el 21/10/2026 21:35.
- Defecto real: `fecha_hora` salía de `toLocaleString("es-AR")`, que en Chrome actual da 12 h sin "p. m.". Los registros
  de la tarde quedaban como de la mañana y `comparableDateTime_` (`gas/utils.gs`) los ordenaba mal.
- V3: la planilla está íntegra y el usuario confirmó `ping` OK. Un `?api=` viejo guardado en el celular podía dejarlo
  pegado a una implementación anterior.

## Hecho

- PR #13 (merge): `fechaHoraAR()` en `index.html` guarda siempre "d/m/aaaa, H:mm:ss" en 24 h (pedido, recepción,
  producción, elaborados, stock). En V3, `apiUrl()` descarta el `?api=` guardado si cambia `config.js`; guía de
  diagnóstico en `docs/v3/DESPLIEGUE.md`.
- PR #14 (merge): `verify-unit-quantities.js` carga `fechaHoraAR`. El deploy de #13 se había cortado en `verify` por eso.
  Corrida 75 en verde: `deploy-gas` y Pages publicados.
- Datos: respaldo previo `RESPALDO 2026-10-22 antes de corregir horas · …` en la misma carpeta de Drive. Corregidas con
  `LOG TELEGRAM` (diferencia máxima 14 s): `PEDIDOS RECIBIDOS` 83 filas, `PEDIDOS_DETALLE` 1.106, `CONTEO ELABORADOS` 29,
  `CONTROL RECEPCION` 1 (texto "a. m." pasado a fecha). Escrito como fechas reales con el formato de la columna, con
  control de revisión. Releído después: coincide con el plan.

## Verificaciones

Las 14 verificaciones del job `verify` pasan con código de salida 0. Lección: revisar el código de salida de cada script,
no sólo la última línea; `verify-unit-quantities` imprime el error en el medio.

## Límites

- `PED081392` (5/7/2026) es anterior a `LOG TELEGRAM`: queda sin corregir.
- Las demás recepciones no pasan por Telegram: sin referencia para corregir su hora.
- Los respaldos `toLocaleString('es-AR')` de `gas/*.gs` siguen igual; sólo actúan si la app no manda la hora.
- La API en vivo no se puede probar desde este entorno (proxy bloquea `script.google.com` y `github.io`).

## Próximo paso

Usuario: enviar un pedido de prueba por la tarde y ver la hora en 24 h en `PEDIDOS RECIBIDOS`; revisar que las vistas
(`VISTA PEDIDOS`, `LOCAL PEDIDO · …`) ordenen bien tras su próxima reconstrucción. Coordinador: si se quiere, pasar los
respaldos de `gas/*.gs` a `Utilities.formatDate` con un stub de `Utilities` en los tests.
