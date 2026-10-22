# Estado de continuidad · Pedidos Semanales

Actualizado: 22 de octubre de 2026 (tarde, pase de diseño). Coordinador: Claude Code. Rama: `claude/upbeat-faraday-v6k36x`.

## Objetivo y aceptación

El usuario pidió una app totalmente nueva, de nivel App Store, rápida y fluida en iPhone, tablet y PC, para usar con
la planilla nueva (**Docks · Abastecimiento V3**). Aceptación: todas las pantallas de encargado y gerencia funcionando
contra el backend V3, verificadas de punta a punta, publicadas en GitHub Pages e instalables.

## Diagnóstico previo (misma sesión)

La app original `…/formulario-pedidos/` sí conecta: escribe en `Sistema_Pedidos_Polo_Gastronomico_COMPLETO`
(último pedido 22/10 08:29). La planilla que miraba el usuario era la V3, que sólo alimenta la app V3. No había falla.

## Hecho

- `docs/app/PLAN.md`: decisiones (frontend nuevo en `app/`, backend V3 reutilizado), tokens de diseño, pantallas,
  verificación, riesgos. `docs/app/README.md`: instalación, pantallas y desarrollo.
- `app/`: PWA sin bundler (ES modules). `index.html`, `manifest.webmanifest`, `sw.js` (red primero), íconos PNG
  generados con `scripts/app-icons.js`, `css/app.css` (tokens claro/oscuro, componentes iOS), `js/main.js` (sesión,
  ruteo por hash, tab bar en celular, barra lateral ≥820 px), `js/api.js` (fetch con JSONP de respaldo, caché
  stale‑while‑revalidate, cola sin conexión, confirmación por ID), `js/ui.js`, `js/flujo.js`, `js/gerencia.js`,
  `js/detalles.js` y 15 pantallas en `js/screens/`.
- Encargado: Entrar, Hoy, Pedir (sugerido, stepper, sueltos, prioridad, notas, píldora de revisión), Contar,
  Recibir (llegó todo, parcial, extras), Elaborados (listo/marcado/crudo, alta). Gerencia: Compras (crear orden →
  WhatsApp, asignar proveedor, cancelar), Órdenes, Faltantes (texto de reclamo), Stock, Catálogo (ABM + pegar
  desde Excel), Proveedores (ABM + pegar), Locales, Elaborados, Ajustes (rol, tema, cola, conexión, empezar de cero).
- `scripts/v3-dev-server.js` sirve también `/app/`. `scripts/verify-app.js` (CI) y `scripts/e2e-app.js` (manual).
- `.github/workflows/deploy.yml`: `verify-app` en el job verify; `app/` se copia a `site/app/` con versión del SW.
- `app/config.js` apunta al mismo `/exec` que `v3/config.js` (verificado por `verify-app`).

## Pase de diseño (PR 17, rama `claude/upbeat-faraday-v6k36x`)

- Skill `design-taste-frontend` instalado y versionado en `.claude/skills/` (`skills-lock.json`). Decisión del usuario:
  opción A, mantener el look iOS y aplicar lo compatible.
- Aplicado: sin degradados (flecha del select en SVG, esqueleto por pulso), contraste 4,5:1 en textos sobre tintes
  (tokens `--*-ink`), acento `#0A7C78`, naranja de aviso `#F28C0A` (no terracota), etiquetas de la tab bar 11 px,
  íconos neutros en Historial, sello "Actualizado HH:MM" en Hoy, Compras, Órdenes y Stock, inclinación 3D de la
  tarjeta de Hoy (transform, respeta reduced-motion), giro 3D de la tilde de éxito, botón **Reiniciar métricas** en
  Stock y en Ajustes (misma hoja, `reiniciarMetricas` en `gerencia.js`), acceso por URL `?local&nombre` / `?clave`.
- Inspector `--app` con permisos iOS (glass, shadow, blur, button-fx, app-title-size): Compras y Stock 0 FAIL;
  Hoy 0 FAIL tras neutralizar los íconos. Pendiente opcional: tabla de Stock como lista de dos líneas en el celular.

## Actualización de versión (PR 18)

- El usuario seguía viendo la versión anterior tras publicar: el service worker servía desde la caché HTTP de GitHub
  Pages (max-age 600) y iOS no busca actualizaciones del SW al abrir la app instalada.
- `app/sw.js`: `fetch(..., { cache: 'no-cache' })` (navegaciones por URL) para revalidar siempre con ETag.
  `app/js/main.js`: `reg.update()` al abrir, al volver al frente y cada 30 min; al cambiar el controlador recarga una
  vez con aviso. Ajustes → "Buscar actualización de la app" borra cachés, actualiza el SW y recarga. El workflow
  estampa el SHA también en `config.js` (`VERSION`), visible en Ajustes como `2026.10.22b · <sha>`.

## Verificaciones

- `node scripts/verify-app.js`: 15 checks en verde. `node scripts/verify-v2.js`: en verde.
- `node scripts/e2e-app.js` claro y oscuro: encargado en iPhone (conteo, pedido confirmado por ID en la planilla
  simulada, elaborados, recepción parcial) y gerencia en escritorio y tablet (orden, catálogo, pegado, proveedor,
  local, elaborado). Sin errores de consola. Capturas revisadas a mano.
- La API en vivo no se puede probar desde este entorno (proxy); el backend no cambió.

## Límites

- No se tocó `index.html`, `gas/`, `v3/` ni la planilla de producción.
- La app V3 anterior (`v3/`) sigue publicada; la nueva convive en `/app/`.

## Próximo paso

Usuario: tras el merge, abrir `https://yaakov2731.github.io/formulario-pedidos/app/` en el celular, “Agregar a
inicio”, entrar como encargado y mandar un pedido de prueba; en PC entrar como gerencia y crear la orden. Si algo
falla, Ajustes → Probar conexión y la pestaña `LOG` de la planilla V3. Coordinador: recibir feedback visual y ajustar.
