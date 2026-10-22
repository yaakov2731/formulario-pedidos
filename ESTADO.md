# Estado de continuidad · Pedidos Semanales

Actualizado: 22 de octubre de 2026. Coordinador: Claude Code. Rama: `claude/serene-meitner-7yry00`.

## Objetivo y aceptación

El usuario reportó que "la app no conecta con la planilla". Esta etapa diagnostica la conexión app ↔ Apps Script ↔
Google Sheets de la V3 (`v3/`, `v3/gas/`) y de la app actual (`index.html`, `gas/`), y blinda el único punto frágil
del lado del frontend que se encontró. La app actual no se tocó.

## Evidencia (leída con acceso directo a Drive/Sheets; sin salida a `script.google.com` desde este entorno)

- App actual: `PEDIDOS RECIBIDOS` de `Sistema_Pedidos_Polo_Gastronomico_COMPLETO` tiene pedidos hasta el 21/10/2026
  21:35 (Brooklyn). Esa app sí escribe en su planilla.
- V3: la planilla `Docks · Abastecimiento V3 (pruebas)` (ID en `v3/gas/config.gs`) está íntegra: 11 pestañas con
  cabeceras exactas a `V3_HEADERS`, 9 locales (Depósito agregado), catálogo, proveedores, 1 pedido, conteos y elaborados.
  Pero `LOG` no registra ninguna escritura después del 18/10/2026 21:35 (savePedido Trento Café).
- GitHub Actions: las corridas 69–73 (18/10) terminaron en verde; Pages publica `v3/` con `config.js` apuntando a la
  implementación nueva `AKfycbx9…` (PR #11). La anterior era `AKfycbx0…`. PR #12 (cache/prefetch) sigue abierto, no afecta.
- No se pudo ejecutar `ping` contra ninguna `/exec`: el proxy bloquea `script.google.com` y `github.io`, y `IMPORTDATA`
  en una planilla temporal exige un clic manual de "Permitir acceso" (planilla temporal enviada a la papelera).

## Hecho en esta etapa

- `v3/core.js` `apiUrl()`: una URL fijada con `?api=` se guarda junto con la `API_URL` de `config.js` vigente
  (`api_url_cfg`). Si `config.js` cambia de backend, la fijada se descarta sola. Antes, un celular que probó la V3 con
  `?api=<URL vieja>` quedaba pegado a esa URL para siempre, aun después de publicar la implementación nueva.
- `scripts/verify-v3-core.js`: casos nuevos para ese comportamiento.
- `docs/v3/DESPLIEGUE.md`: sección "Si la app dice No se pudo conectar" con el árbol de diagnóstico por respuesta del `ping`.
  `docs/v3/CONTRATO.md` §5.1 actualizado.

## Verificaciones

Pasan `verify-v3-core`, `verify-v3-encargado`, `verify-v3-compras` y `v3-bundle-gas.js --check`. La API en vivo no se probó.

## Próximo paso

Usuario: abrir `https://script.google.com/macros/s/AKfycbx9FtJnRF5rQVx23Deq0Atzng2OoCgZr4E3vf-4c6bgLk-TEL-QX58pSmWREwLPD9Az/exec?action=ping`
en el navegador y seguir la sección nueva de `DESPLIEGUE.md` según lo que responda; hacer merge del PR. Coordinador:
con la respuesta del `ping` (o la salida de `node scripts/verify-live-v3.js`), corregir la causa concreta.
