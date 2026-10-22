# Docks app · guía de uso y desarrollo

App nueva para encargados y gerencia sobre la planilla **Docks · Abastecimiento V3**. Vive en `app/` y se publica en
`https://yaakov2731.github.io/formulario-pedidos/app/`. Usa el backend Apps Script V3 (`v3/gas/`, contrato en
`docs/v3/CONTRATO.md`) sin cambios. El plan y las decisiones de diseño están en `PLAN.md`.

## Instalar en el celular o la tablet

1. Abrir el link en Safari (iPhone/iPad) o Chrome (Android).
2. **Compartir → Agregar a inicio** (iPhone) o **Instalar app** (Android). Queda como una app más, a pantalla completa.
3. Entrar: elegir el local y escribir el nombre. Queda guardado; no hay que volver a hacerlo.

Gerencia entra desde **¿Sos de gerencia? Entrar con clave** con la clave `ADMIN_KEY` del Apps Script. En una PC o
tablet aparece la barra lateral con Compras, Órdenes, Faltantes, Stock, Catálogo, Proveedores, Locales y Elaborados.

## Qué hace cada pantalla

| Rol | Pantalla | Qué hace |
| --- | --- | --- |
| Encargado | Hoy | Ritmo de la semana (contar → pedir → recibir), bajo par, órdenes por recibir, historial. |
| | Pedir | Catálogo del local con sugerido, stepper, productos sueltos, prioridad, fecha, notas. Confirma por ID. |
| | Contar | Stock por producto; “No queda” en cero; lo que no se toca no cambia. |
| | Recibir | Órdenes por recibir; “Llegó todo”, parciales, extras sin pedido, observaciones. |
| | Elaborados | Listo / marcado / crudo por producto; alta desde el celular. |
| Gerencia | Compras | Pendientes por proveedor, selección de líneas, crear orden con texto de WhatsApp, cancelar. |
| | Órdenes | Lista por estado, detalle con texto y link de WhatsApp. |
| | Faltantes | Líneas incompletas por proveedor con texto de reclamo. |
| | Stock | Panel por local: stock, par, en camino, sugerido, último conteo, estado. |
| | Catálogo | Alta/edición, baja lógica, pegar desde Excel. |
| | Proveedores | Alta/edición, pegar desde Excel. |
| | Locales | Activo, día de pedido, hora de corte, encargados. |
| | Elaborados | Alta/edición por local. |
| Ambos | Ajustes | Cambiar rol, apariencia, envíos pendientes, conexión; gerencia: empezar de cero. |

## Cómo funciona por dentro

- **Sin conexión**: lo que se envía queda en cola en el equipo y se manda solo al volver la señal; Ajustes lo muestra.
  Los borradores (pedido, conteo, recepción, elaborados) se guardan por local al escribir.
- **Nunca duplica**: cada escritura lleva un ID generado en el cliente; si la respuesta no se pudo leer, la app
  confirma leyendo ese ID antes de decir “enviado”.
- **Rápida**: catálogo y lecturas se guardan en el equipo y se muestran al instante mientras se refrescan.
- **Backend**: `app/config.js` tiene la misma `API_URL` que `v3/config.js`. En un equipo se puede fijar otra con
  `?api=URL` (se borra con `?api=` vacío o desde Ajustes → Conexión).

## Acceso directo por URL

- `…/app/?local=Umo%20Grill&nombre=Ayelén` entra como encargado de ese local (sirve para compartir un link a un local).
- `…/app/?local=Umo%20Grill` deja el local preseleccionado y pide el nombre.
- `…/app/?clave=…` entra como gerencia sólo para esa visita (la clave no se guarda y se borra de la dirección).

## Auditoría de diseño (taste-skill)

El skill `design-taste-frontend` (en `.claude/skills/`) se usa como auditor manteniendo el lenguaje iOS. Con el dev
server corriendo y Chromium disponible:

```
CHROME_PATH=<chromium> node .claude/skills/design-taste-frontend/scripts/lint.mjs --app app
CHROME_PATH=<chromium> node .claude/skills/design-taste-frontend/scripts/inspect.mjs \
  "http://localhost:8787/app/?api=/api&local=Umo%20Grill&nombre=Ayelén#hoy" --app --allow glass,shadow,blur,button-fx,app-title-size
```

Permisos declarados por el estilo iOS: barras translúcidas (`glass`, `blur`), sombras en lo que flota y en el
control segmentado (`shadow`, `button-fx`) y título grande de 34 px en el celular (`app-title-size`). Lo demás se
corrige. Las salidas quedan en `.taste-skill/` (ignorado por git).

## Desarrollo y verificación

```
node scripts/v3-dev-server.js --seed          # http://localhost:8787/app/?api=/api  (clave de gerencia: dev)
node scripts/verify-app.js                    # estructura, módulos, lógica pura (corre en CI)
node scripts/e2e-app.js capturas [--dark]     # recorrido completo en Chromium con capturas (manual)
node scripts/app-icons.js                     # regenera los PNG de app/icons desde icon.svg
```

Archivos: `app/index.html` (shell), `css/app.css` (tokens y componentes), `js/main.js` (sesión y ruteo),
`js/api.js` (transporte, caché, cola), `js/ui.js` (piezas), `js/flujo.js` y `js/gerencia.js` (helpers de cada rol),
`js/screens/*.js` (una pantalla por archivo), `sw.js` (service worker, red primero), `manifest.webmanifest`.
