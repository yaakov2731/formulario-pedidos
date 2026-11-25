# Estado de continuidad · Pedidos Semanales

Actualizado: 25 de noviembre de 2026 (rediseño v2). Coordinador: Claude Code. Rama: `claude/upbeat-faraday-v6k36x`.

## Rediseño v2: el turno (encargado) y módulos de color (gerencia) (25/11/2026, rama `claude/project-thread-t8l4r7`, sin push ni PR)
- Referencia: opciones A y C de `/mnt/project-files/rediseno-v2/opciones.html`. Capturas en `/mnt/project-files/rediseno-v2/app/` (01–15, 390/1300 px, escala 2, con las fuentes reales).
- Tema (`stock.css`, mismos tokens): encargado y Entrar negro/dorado fijo (#0D0C0A, #D4A852, Barlow Condensed en mayúscula); gerencia/contadora claro #F6F7F9 con oscuro por el teléfono (Sora + Manrope). Colores de módulo `--mod-*`; `:root[data-modulo]` redefine `--accent`. Único degradé: encabezado dorado de las cajas (`--caja-head`).
- Navegación (`main.js`): gerencia Inicio · Stock (`#/hay`) · Pedidos · Costos · Más, chip de color y miga "MÓDULO · pantalla"; `MODULOS` ruta→módulo; `#/hoy` de gerencia → `#/inicio`; `#/decidir` sigue (título "Problemas", en Más y en la tarjeta roja). Encargado: "Mis pedidos" → "Pedidos".
- Inicio (`g-inicio.js`, `tarjetaModulo` en ui.js): Stock (días que alcanza lo más justo), Pedidos (borradores), Costos (% global), Recetas (platos con receta), Problemas (cierres + subas no aceptadas). Cada uno por su lado; sin dato → "Falta dato".
- Costos (`costos.js` puro + `g-costos.js`): `#/costos` y `#/costos/<id>`; 28 días de ventas de Núcleo (`ventasItemsTodos` ahora trae `producto_id`); meta 30 %, sugerido = costo ÷ 0,30 redondeado a $100 hacia arriba; elaborado sin precio usa su receta; sin packaging.
- Hoy del encargado (`hoy.js`): misma lógica de tareas; pinta línea Apertura → Servicio → Cierre, una caja por momento (n / n, checklist con tilde), accesos Elaborados y Notas dentro de Servicio (no se tildan) y botón grande (`data-principal`) con la primera tarea del momento actual. Antes de las 18 h el cierre queda anotado sin enlace.
- FIFO (`fifo.js` + `entradasRecientes` en api.js + `pintarGuiada`): "Primero · entró dd/mm" / "Después · entró dd/mm" con las dos últimas entradas (recepciones y producciones, 45 días), "Sin fecha de entrada" si no hay; solo fechas. Encabezado de lugar con "n de m acá".
- Pruebas: verify-stock, verify-costos (nuevo, en CI), verify-v2, verify-reposicion OK; e2e-hoy, guiado, cierre, decidir, inicio (nuevo), comprar, por-producto OK. e2e-shopping 4 fallas y e2e-stock 72 OK cortando en `.ped-tabla` (línea 677): igual que en main.
- Pendiente: revisar en el teléfono; decidir si el sugerido redondea hacia arriba (hoy sí); push y PR los hace el dueño.

## Compras → Armar: Por producto, Por proveedor e impresión A4 (25/11/2026, rama `claude/project-thread-t8l4r7`)
- Subpestaña Compras: Pedidos · **Armar** (Por proveedor `#/compras` · Por producto `#/por-producto`) · Recibir · Gasto.
- Por producto (`g-por-producto.js`, solo lee): pedidos para aprobar y aprobados sumados por producto, columnas por local + total, agrupado por proveedor, filtro Todos / Para aprobar / Aprobados; celular en tarjetas. Lo destildado no cuenta.
- Por proveedor (`g-pedidos.js`): misma lógica de aprobar/destildar/mover/enviar; ahora tabla con una columna por local en PC y tarjeta en celular ("Otro proveedor" a un toque).
- Impresión (`compras-impresion.js`): hoja de armado y orden de compra, A4 horizontal, encabezado en el thead (se repite en cada hoja), "Página N de M", un proveedor por hoja. Responsable: quién cargó (`cargado_por_nombre`); quién aprobó no se guarda → línea para firmar. Numeración continua en "Imprimir todos".
- Pruebas: verify-stock, verify-v2, e2e-por-producto (nuevo), e2e-comprar, e2e-decidir, e2e-razon, e2e-gasto, e2e-sugerido OK. e2e-stock y e2e-recibir cortan donde ya cortaban. PDF en `/mnt/project-files/rediseno-cero/impresion/`, capturas en `/mnt/project-files/rediseno-cero/por-producto/`.

## Avisos de cierre por WhatsApp para Ara (25/11/2026, rama `claude/project-thread-nt7yrx`)
- SQL `supabase/migrations/0033_avisos_whatsapp.sql` (idempotente, lo pega Jacobo): `locales.avisos_whatsapp text[]`, tabla `avisos_token` (sin políticas), rpc `cierres_pendientes(p_token, p_fecha)` para anon con token, `aviso_token()` / `aviso_token_nuevo()` solo gerencia.
- Ara (agente en Railway) hace POST a `/rest/v1/rpc/cierres_pendientes` con `apikey` (clave pública) y `{"p_token": ...}`; recibe `faltan` (locales que abrieron y no cerraron, con WhatsApp y link), `cerraron`, `no_abria`. Ara manda el WhatsApp; la app no envía mensajes.
- UI: Más → Ajustes, campo WhatsApp por local (no Shopping) y sección "Avisos por WhatsApp (Ara)" con dirección, token y ejemplo curl.
- Pruebas: `node scripts/verify-avisos.js` (pglite, 17 OK), `node scripts/e2e-comprar.js` (con y sin 0033), verify-stock, verify-v2.

## Rediseño de cero (25/11/2026, rama `claude/project-thread-t8l4r7`, sin push ni PR)

- Decisiones: opciones A (encargado) y C (gerencia) del mockup `/mnt/project-files/rediseno-cero/opciones.html`; criterios por defecto en `/mnt/project-files/rediseno-cero/DECISIONES.md` (semáforo % = $ sin explicar / ventas, rojo ≥3 %, ámbar ≥1 % o falta cierre; Aprobar abre Compras en el proveedor; Aceptar suba en localStorage; Avisar = enlace de WhatsApp sin número; cierre a ciegas).
- Hecho: tema claro/oscuro por rol (`:root[data-rol]`, sin naranja, sin degradados, sin Geist; contraste ≥5:1); encargado `Hoy · Mis pedidos · Más` con botones grandes ("Hola, <nombre>"); contar guiado uno por uno en `#/apertura` y `#/cierre` (hoja.js, mismo estado y una sola llamada a `hoja_guardar`, borrador con posición); pedir por proveedor `#/pedir-prov` (crea orden borrador con `enviarGrupo`); gerencia `Decidir · Locales · Compras · Más` (g-decidir.js, g-semaforo.js, g-local.js con ficha de producto y 6 semanas; `perdida.js` suma `detalleSemana`); el tablero viejo queda en Más → Tablero; `#/hoy` de gerencia → `#/decidir`.
- Pruebas: verify-stock/perdida/reposicion/sugerido/v2 OK; e2e-hoy, cierre, hoja, sugerido, comprar, perdida, guiado (nuevo) y decidir (nuevo) OK. e2e-shopping: 4 fallas que ya estaban antes (conteo de lavandina/`contar`). e2e-stock: 72 OK y corta en la tabla de Pedidos de PC (`.ped-tabla`), que en main ya es tablero en columnas (antes del cambio cortaba antes, en la línea 448).
- Capturas: `/mnt/project-files/rediseno-cero/app/` (7 pantallas × 390/1300 × claro/oscuro).
- Pendiente: actualizar el resto de e2e-stock a Pedidos en columnas; revisar en el teléfono con las fuentes reales (en las capturas Google Fonts está bloqueado); push y PR los hace el dueño.

## Rediseño "lo que sobró" (22/11/2026, rama `claude/project-thread-nt7yrx`, sin push ni PR)

Plan: `/mnt/project-files/rediseno-sobrante/PLAN.md` (pasos 1–11). Capturas 390/1300 px en
`/mnt/project-files/rediseno-sobrante/app/` (01 apertura … 09 ajustes).

- SQL `supabase/migrations/0032_dias_abre_cierre_stock.sql`: `locales.dias_abre` (def. `{5,6,0}`), `abre_feriados`
  (def. true), rpc `hoja_guardar` (una llamada por apertura/cierre; el cierre ajusta stock con `ajuste_conteo`).
  Validado solo con pglite (`verify-hoja.js`). **NO aplicado en Supabase**: lo decide el dueño. Sin 0032 la app cae
  al camino viejo (`hoja_contar` por lugar; locales sin días → vie · sáb · dom y feriados; Ajustes avisa y no guarda).
- Lógica: `stock/js/reposicion.js` (uso por día abierto, próxima apertura con feriados, pedir al bulto descontando lo
  pedido sin recibir; si el cierre es de ayer y hoy abre, "para hoy"), `stock/js/feriados.js` (2026–2027; revisar cada
  año contra el calendario oficial).
- Encargado (locales que elaboran): Hoja nueva Apertura (precargada con el cierre + lo que llegó) | Cierre (a ciegas,
  lo no contado va en 0) → resultado (para mañana / pedido de la semana / sin historial) → "Armar el pedido" abre Pedir
  con las mismas cantidades. Shopping sigue con la hoja por sector y Retiros. Pestañas: Hoja · Pedir · Mis pedidos · Más.
- Gerencia: Comprar · Lo que hay (matriz + ficha) · Pedidos (columnas ≥980 px) · Más (Tablero en `#/tablero`, Ajustes).
- Pruebas: verify-stock, verify-reposicion (nuevo), verify-sugerido, verify-v2, verify-hoja OK; e2e-hoja, e2e-hoy,
  e2e-sugerido, e2e-cierre (nuevo), e2e-comprar (nuevo) OK. e2e-shopping: 5 fallas que ya fallaban en main (466fd2a).
  CI suma verify-sugerido y verify-reposicion.
- Pendiente: aplicar 0032 (dueño), revisar en el teléfono real, decidir si el "Durante el día" (entró/devolví/merma)
  vuelve a la Hoja de Umo, arreglar las 5 fallas viejas de e2e-shopping, plural "packes" de `util.plural`.

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

## Diseño "Comanda" en la app (rama `claude/project-thread-qxoi6l`)

- Jacobo eligió la dirección A del mockup https://claude.ai/artifact/De5orrXuCDpjiBqExrkLDK: la misma identidad que la app vieja.
- `app/css/app.css`: tokens nuevos (porcelana #F2F4F6, tinta #0E1A2B, pimentón #C9441F; oscuro con #E8603A), Familjen Grotesk
  (títulos), Public Sans (texto), IBM Plex Mono (cantidades). Todo centrado: títulos, filas de producto, pasos de Hoy, KPIs,
  Entrar. Stepper con pedido en pimentón; píldora "Revisar" como barra tinta a lo ancho sobre la tab bar.
- Textos sin "par" para el encargado: "Quedan N", "Sin contar · unidad", sugerido como "Pedir N", KPI "por agotarse". Gerencia
  conserva la columna Par (es donde se configura) pero "Bajo par" pasa a "Por agotarse".
- Ícono: fondo tinta, muelle blanco, agua pimentón (`node scripts/app-icons.js`).
- Checks: verify-app 15/15, verify-v2 y e2e-app en verde; capturas en /mnt/project-files/app-docks/comanda/.

## Encargado por local (rama `claude/project-thread-33mr9g`)

- Entrar: al elegir local muestra los encargados del local (hoja LOCALES, columna Encargados, editable en gerencia → Locales)
  como botones + "Otro" para escribir; preselecciona el último que cargó en ese equipo.
- Cambiar de local abre "¿Quién carga en …?". El nombre se cambia también desde "Hola, X" en Hoy, la barra lateral y
  la línea "Lo carga X · Cambiar" en cada hoja Revisar (pedido, conteo, recepción, elaborados).
- Backend V3: `getConsolidado` devuelve `encargado` por línea (Compras lo muestra) y `getHoy` en `pedido_semana` y
  `ultimo_conteo`. Requiere publicar el Apps Script V3 (workflow con secretos V3, o pegar `v3/apps-script/DocksV3.gs`).
- Verificado: verify-app, verify-v2, verify-v3-backend y e2e-app claro/oscuro (paso nuevo: conteo firmado por el encargado elegido).

- PR siguiente: local y encargado salen de la barra de arriba (y de la barra lateral) y pasan al encabezado de la tarjeta de Hoy (`.hero-sel`, dos casillas LOCAL / ENCARGADO). Las demás pantallas muestran el local en el subtítulo.

## Rediseño estilo Apple · Fase 1 (rama `claude/project-thread-0g5hew`, PR #83)

- Plan: `docs/plan-rediseno-apple.md`. Fase 1 hecha: tokens "Noche" en `:root` de `stock/css/stock.css` (negro liso, #1C1C1E, naranja #FF8A1F,
  letra del sistema, radio 12, táctil 44, botón 50), texto a la izquierda y rótulos sin mayúsculas, brillo sólo en Entrar. Poppins fuera;
  Public Sans sigue cargada porque la usan la impresión A4 y la imagen de WhatsApp (sin cambios).
- `stock/js/ui.js`: `listaGrupo`, `filaLista`, `hoja` (sube desde abajo, se cierra tocando fuera o deslizando), `botonFijo`, `tituloGrande`,
  `activarTituloGrande`, `toast(..., { accion })` / `avisoDeshacer`, `selectorLocal`. En uso: Más (lista agrupada), Tablero (selector de local),
  Pedir (título grande y botón fijo).
- Checks: verify-stock verde; e2e-hoja 33/33, e2e-control 23/23; e2e-stock 309 OK con un 404 de consola previo (rpc `contar_local` sin mock,
  igual en main). Capturas en /mnt/project-files/app-stock/rediseno-apple/fase1/.
- Próximo paso: Jacobo revisa capturas y dice "mergear"; después Fase 2 (navegación de 4 pestañas).

## Rediseño Apple · Fase 6 + reclamo + subas de precio (rama `claude/project-thread-wj2w6l`, 13/11/2026)

- `stock/js/compras-estado.js` (nuevo, en el SW): un solo estado por orden (Para aprobar, Para enviar, Enviado, Llegó incompleto, Recibido), faltantes, texto de reclamo, suba > 5 %.
- Recibir (`g-recibir.js`): abre con lo pedido, «Llegó todo» / «Confirmar recepción», «Volver a lo pedido», «Reclamar faltante» (WhatsApp con razón social del local), lista «Llegó incompleto» de 7 días. Aviso de suba por fila; también en `g-recibir-factura.js`. Hoy de gerencia: «Subas de precio» (7 días; sin historial no aparece).
- Sin SQL: la tabla `precios` ya guarda cada cambio de precio.
- Pruebas: `scripts/e2e-recibir.js` (nuevo, capturas en `/mnt/project-files/app-stock/recibir-precios/`), verify-stock, e2e-recibir-factura, e2e-hoy verdes; e2e-stock igual que main (1 error 404 de consola).
- Próximo paso: Jacobo revisa capturas y dice "mergear".

## Tanda Apple: Fases 2–4, 6, pérdida y revisión general (rama `claude/project-thread-wj2w6l`, PR #85, 13/11/2026)

- Hecho en la tanda: Fase 2 (4 pestañas + Más tipo Ajustes, rutas viejas redirigen), Fase 3 (Hoy de encargado, Shopping y gerencia),
  Fase 4 (pedido sugerido con redondeo al bulto, Mis pedidos dentro de Pedir), Fase 6 (un estado por compra, recibir contra lo pedido,
  reclamo, subas de precio) y Pérdida de la semana por local con productos clave (gerencia).
- Revisión general (solo presentación, sin tocar consultas ni base): elegido en chips/locales neutro (el naranja queda para la acción),
  botón principal deshabilitado en gris, estados como texto (rojo solo incompleto/vencido/cancelado), barras sin vidrio (el título chico ya
  no deja ver el contenido detrás), KPIs como lista agrupada en el celular, Notas con el tema Noche (sin post-its ni degradés), flechas y
  tildes de texto cambiadas por íconos SVG, "volver" como enlace, textos explicativos acortados, plural de Merma, Retiros como lista.
  Escritorio: el body ya no se desplaza con scrollIntoView (en Mis pedidos se cortaba la barra lateral).
- Capturas antes/después (390 px y 1366 px, por rol): `/mnt/project-files/app-stock/revision-general/{antes,despues}/`.
- Pendiente de diseño (no hecho): tarjetas de Pagos/Cuentas y de Facturas siguen siendo tarjetas; tabla de Control del día ancha en el
  celular; Hoja y Retiros de Fase 5 sin rehacer.
- Próximo paso: Jacobo revisa capturas y dice "mergear"; después Fase 5 (hoja más simple y avisos).
