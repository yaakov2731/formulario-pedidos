# Plan · Docks app (nueva, sobre la planilla V3)

Fecha: 22 de octubre de 2026. Autor del plan: Claude (Fable 5.1). Estado: en ejecución.

## 1. Conclusión anticipada

Se construye una **app nueva desde cero en `app/`** (frontend), publicada en
`https://yaakov2731.github.io/formulario-pedidos/app/`, que trabaja sobre la planilla
**Docks · Abastecimiento V3** a través del backend Apps Script V3 ya publicado (`v3/gas/`, contrato en
`docs/v3/CONTRATO.md`). El backend se reutiliza tal cual: está completo, verificado y en producción; rehacerlo
no agrega valor y sí riesgo. Todo lo que el usuario ve y toca es nuevo.

## 2. Decisiones

| # | Decisión | Por qué |
| --- | --- | --- |
| A1 | Una sola app, dos roles: **Encargado** (celular) y **Gerencia** (tablet/PC, con clave). | Un solo link para instalar; el rol se elige una vez y queda guardado. |
| A2 | Sin bundler ni dependencias de JS: ES modules nativos, CSS plano. | Regla del repo; carga rápida; GitHub Pages lo sirve directo. |
| A3 | **PWA instalable**: manifest, service worker, íconos, pantalla completa en iPhone (“Agregar a inicio”). | Es lo que hace que se sienta app y no página. |
| A4 | Lenguaje visual **Apple HIG**: títulos grandes que se compactan al scroll, listas agrupadas, barra de pestañas con desenfoque, hojas desde abajo, control segmentado, modo oscuro automático. | Pedido explícito del usuario (“como una app del App Store”). |
| A5 | Tipografía: SF Pro en Apple (`-apple-system`), **Inter** como equivalente en Android/Windows. Una sola familia. Números tabulares en cantidades. | Mismo aspecto en todos los equipos. |
| A6 | Velocidad: catálogo, bootstrap y “Hoy” se guardan en el equipo y se muestran al instante mientras se refrescan (stale‑while‑revalidate); esqueletos de carga; prefetch tras entrar. | GAS tarda 1–3 s; la app no debe esperar para mostrarse. |
| A7 | Escrituras con **ID generado en el cliente** y confirmación por lectura (`getPedido`/`getOperacion`), como exige el contrato; si no hay red, el envío queda **en cola** y se reintenta solo. | Idempotencia garantizada por el servidor: nunca se duplica. |
| A8 | Transporte: `fetch` para GET y POST (CORS de Apps Script) con **JSONP de respaldo** para GET si el navegador bloquea. | Más rápido y cancelable que JSONP; el respaldo cubre casos raros. |
| A9 | Borradores locales por local y pantalla (pedido, conteo, elaborados, recepción). | Un encargado puede cortar y seguir después sin perder nada. |

## 3. Diseño (tokens)

**Color (claro / oscuro)**

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#F2F2F7` | `#0B141F` | fondo agrupado (el oscuro es “puerto de noche”, azul profundo, no negro plano) |
| `--surface` | `#FFFFFF` | `#151F2C` | celdas, tarjetas, hojas |
| `--text` | `#000000` | `#F5F7FA` | texto principal |
| `--text-2` | `#6C6C70` | `#9AA4B2` | secundario |
| `--accent` | `#0C8F8A` | `#2BB3AD` | acción principal, “Marea”: verde‑azul de río |
| `--warn` | `#E8702A` | `#FF8A4C` | urgente, faltantes, “Grúa” |
| `--ok` | `#2E9E5B` | `#4CC57A` | hecho, stock OK |
| `--bad` | `#D63B3B` | `#FF5C5C` | error, sin stock |
| `--amber` | `#D9900B` | `#F2B33D` | bajo par, sin conteo |

Sin sombras en celdas (separación por contraste de fondo, como iOS). Radios con jerarquía: tarjetas 14,
botones 12, campos 10, chips 999.

**Tipo**: escala Apple: Título grande 34/41 bold · Título 2 22/28 · Encabezado 17/22 semibold · Cuerpo 17/22 ·
Subtítulo 15/20 · Nota 13/18 · Leyenda 12/16. Cantidades y precios con `tabular-nums`.

**Layout**

```
Celular (<820px)                         Tablet / PC (≥820px)
┌──────────────────────┐                 ┌──────────┬────────────────────────────┐
│ Título grande        │                 │ Docks    │ Título grande              │
│ ───────────────────  │                 │ ● Hoy    │                            │
│ ┌ grupo ───────────┐ │                 │   Pedir  │ ┌ grupo ──────────────┐    │
│ │ celda            │ │                 │   Contar │ │ celda               │    │
│ │ celda            │ │                 │   …      │ └─────────────────────┘    │
│ └──────────────────┘ │                 │          │ (ancho máx. 760; tablas de │
│  [píldora pedido]    │                 │ Gerencia │  gerencia hasta 1200)      │
├──────────────────────┤                 │ Ajustes  │                            │
│ Hoy Pedir Contar … │                 └──────────┴────────────────────────────┘
└──────────────────────┘
```

Alineación a la izquierda. Contenido con gutter 16 px y safe‑area.

**Principio / elemento memorable**: el flujo **Pedir**. Cada producto es una fila con stepper y un chip
“Sugerido 6 kg” que se aplica con un toque; una **píldora flotante** acumula “14 productos · $ 182.400” y
se despliega en la hoja de revisión. Todo lo demás queda quieto y disciplinado.

**Revisión contra los defaults genéricos**: sin etiquetas en mayúsculas, sin puntos medios en metadatos
(“Semana 43, 20 al 26 de octubre”), sin degradados ni sombras en tarjetas, sin animaciones de entrada por
sección: la única animación no pedida es la aparición de la píldora del pedido. El oscuro no es negro puro.

## 4. Pantallas

**Encargado**: Entrar (local + nombre) · **Hoy** (ritmo de la semana: contar → pedir → recibir, con estado
y accesos) · **Pedir** (categorías, búsqueda, sugerido, stepper, línea libre, prioridad, fecha de entrega,
notas, revisión, envío, pantalla de éxito con ID) · **Contar** (stock por categoría, “no queda” en cero, par
visible, revisión, guardado) · **Recibir** (órdenes por recibir, recibido = pedido con un toque, parcial,
extras sin pedido, observaciones) · **Elaborados** (listo / marcado / crudo, alta desde el celular).

**Gerencia** (clave): **Compras** (consolidado por proveedor, selección de líneas, crear orden, WhatsApp,
cancelar) · **Órdenes** (lista, detalle, copiar texto, reabrir WhatsApp) · **Faltantes** · **Stock**
(panel por local con estados) · **Catálogo** (ABM, pegar desde Excel) · **Proveedores** (ABM, pegar) ·
**Locales** (activo, día, hora de corte, encargados) · **Elaborados** (ABM) · **Ajustes** (cambiar rol,
backend, empezar de cero con confirmación).

## 5. Estructura de archivos

```
app/
  index.html  config.js  manifest.webmanifest  sw.js
  icons/  (icon.svg, 180, 192, 512, maskable)
  css/app.css
  js/util.js  js/api.js  js/ui.js  js/main.js
  js/screens/{entrar,hoy,pedir,contar,recibir,elaborados,
              compras,ordenes,faltantes,stock,catalogo,proveedores,locales,elaborados-admin,ajustes}.js
scripts/verify-app.js     (estructura + lógica pura en Node; corre en CI)
scripts/e2e-app.js        (Chromium contra el dev server con --seed; manual, capturas)
scripts/v3-dev-server.js  (sirve también /app/)
```

## 6. Verificación

1. `node scripts/verify-app.js`: archivos, referencias, sintaxis de cada módulo, pruebas de `util.js` y `api.js`.
2. `node scripts/v3-dev-server.js --seed` + `node scripts/e2e-app.js <capturas>`: recorrido completo de
   encargado (entrar, contar, pedir, elaborados) y gerencia (clave, crear orden, recibir en el local, faltantes,
   catálogo, proveedores, locales) en iPhone 390×844, iPad 1024×1366 y escritorio 1440×900, claro y oscuro.
3. Revisión visual de las capturas y corrección antes de publicar.
4. Tras el merge: abrir `…/app/` en el celular, “Agregar a inicio”, y hacer un pedido de prueba en la planilla V3.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| CORS de Apps Script en algún navegador | JSONP de respaldo automático para lecturas. |
| Respuesta POST ilegible (red móvil) | Confirmación por ID; la UI nunca dice “enviado” sin confirmar ni “error” sin verificar. |
| Service worker sirviendo versión vieja | Estrategia red‑primero para HTML/JS/CSS; caché sólo como respaldo offline. |
| Clave de gerencia en el equipo | Se guarda en el equipo sólo si el usuario lo elige; se puede borrar desde Ajustes. |
| Catálogo vacío en la planilla V3 | Pantallas vacías con la acción concreta (“Cargá el catálogo en Gerencia → Catálogo”). |

## 8. Métricas

- Primer render con datos en caché: < 300 ms. Primera carga en frío en 4G: < 2 s hasta la pantalla Entrar.
- Cero escrituras duplicadas (IDs únicos confirmados).
- Un pedido completo en el celular en menos de 90 s con catálogo cargado.
