# PLAN V3 · Pedidos, Stock y Compras · Docks del Puerto

Fecha: 18 de octubre de 2026. Autor del plan: Fable 5.1 (planificación).
Ejecutor previsto: Opus 5.5 como coordinador, con agentes paralelos por área.
Estado: **plan, sin implementar**. Nada de lo descrito está hecho todavía.

---

## 0. Conclusión anticipada

La estructura actual es correcta en la base (catálogo por local, pedido con
borrador y confirmación por ID, backend modular en Apps Script), pero falla en
tres cosas que confunden a los empleados y a gerencia: **demasiadas pantallas
al mismo nivel**, **38 pestañas en la planilla** y **un ciclo de pedido que
nunca se cierra**. El plan V3 reduce la app a **3 acciones para el encargado**
(Pedir · Contar · Recibir) y **1 módulo de Compras para gerencia**, y reemplaza
la planilla de 38 pestañas por **una nueva de 9 pestañas** con un solo libro
de movimientos de stock. Se construye en paralelo, se corre una semana en
espejo y recién después se corta.

---

## 1. Diagnóstico (verificado el 18/10/2026)

### 1.1 Planilla `Sistema_Pedidos_Polo_Gastronomico_COMPLETO` (ID termina en `...Bov3wtE`)

| Grupo | Pestañas | Problema |
| --- | --- | --- |
| Transaccionales | PEDIDOS RECIBIDOS, PEDIDOS_DETALLE, CONTROL STOCK, CONTROL RECEPCION, CONTROL PRODUCCION, CONTEO ELABORADOS, MOVIMIENTOS STOCK, FACTURAS COMPRAS, TRANSFERENCIAS INTERNAS (9) | Seis libros distintos para el mismo concepto: "algo entró o salió del stock". Nadie puede reconstruir el saldo de un producto sin mirar cuatro pestañas. |
| Maestros | CATÁLOGO PRODUCTOS, CONFIGURACIÓN (2) | CONFIGURACIÓN mezcla URL, encargados y flags; los locales aparecen con nombres viejos (Parrilla, Heladería, Cafetería) que el backend traduce a mano. No existe tabla de proveedores. |
| Vistas por local | LOCAL PEDIDO · x8, LOCAL STOCK · x8 (16) | Copias filtradas de PEDIDOS_DETALLE y CONTROL STOCK. Son el 42 % de las pestañas y no agregan información. |
| Vistas/Dashboards | INICIO OPERATIVO, DASHBOARD STOCK, VISTA PEDIDOS, VISTA STOCK, VISTA RECEPCION, VISTA PRODUCCION, VISTA ELABORADOS, VISTA COMPRAS, RESUMEN POR PROVEEDOR, REPORTE SOBRANTES (10) | RESUMEN POR PROVEEDOR muestra `#ERROR!`. INICIO OPERATIVO informa 1.303 líneas de pedido "abiertas" porque nunca se marcan compradas ni entregadas. |
| Log | LOG TELEGRAM (1) | Correcto. |

Total: **38 pestañas**. Objetivo V3: **9**.

### 1.2 Datos que muestran cómo se usa de verdad

| Indicador (planilla, 16–18/10/2026) | Valor | Lectura |
| --- | --- | --- |
| Pedidos cargados (PEDIDOS RECIBIDOS) | ≈ 930 | El único flujo que funciona: se usa todas las semanas. |
| Líneas de pedido abiertas | 1.303 | `Comprado` y `Entregado` quedan en NO para siempre. El ciclo no cierra. |
| Conteos de stock cargados | 245 | Se usa, pero sin ritmo fijo. |
| Recepciones registradas | 37 | Casi no se usa: el flujo exige recargar todo a mano. |
| Partes de producción | 0 | Módulo sin uso real. |
| Productos con stock en cero | 137 | Mezcla productos sin contar con productos agotados. |

### 1.3 App (`index.html`, 288 KB, 7 pestañas + Administración)

- Siete módulos al mismo nivel (Inicio, Pedido, Stock real, Recepción, Producción,
  Elaborados, Reportes) más una capa Administración en `admin.js`. El encargado
  necesita dos; el resto le estorba.
- Recepción no está vinculada al pedido: el encargado vuelve a buscar producto por
  producto en lugar de tildar lo que llegó.
- Reportes está pensado para gerencia pero vive en la misma navegación móvil.
- Lo que hay que **conservar tal cual**: carga de pedido con catálogo del local,
  borrador por local, confirmación por ID, encargados escritos a mano, sistema
  visual "cocina de servicio" (DESIGN.md), verificaciones en `scripts/`.

---

## 2. Diseño objetivo V3

### 2.1 Roles y pantallas

**Encargado de local (celular).** Barra inferior con tres acciones y un inicio:

| Pantalla | Qué hace | Base actual |
| --- | --- | --- |
| Hoy | Estado de la semana: pedido enviado o pendiente, última fecha de conteo, entregas esperadas (líneas Compradas sin recibir). Un solo botón grande por lo que falta. | Inicio (simplificado) |
| Pedir | Idéntico al flujo actual. Se agrega la sugerencia por par ya existente como "Sugerido" al inicio de la lista. | Pedido (se conserva) |
| Contar | Conteo semanal por sección. Lista precargada con los productos del local, cantidad anterior visible, se escribe la nueva. Sin filtros avanzados. | Stock real (simplificado) |
| Recibir | Muestra las líneas en estado Comprado para el local; el encargado tilda "llegó" o corrige la cantidad. Cada tilde genera el movimiento de stock y marca la línea Entregada. La foto/OCR queda como camino secundario. | Recepción (rediseñado) |

Producción y Elaborados pasan a un menú "Más" y sólo aparecen si el local los tiene
habilitados en CONFIG (hoy: sólo Trento Café). El backend se conserva.

**Compras / gerencia (escritorio).** Navegación lateral con cuatro módulos:

| Módulo | Qué hace |
| --- | --- |
| Compras | Consolidado de la semana por proveedor y local. Botón "Armar orden" agrupa líneas Pendientes en una Orden de Compra (OC) por proveedor, genera el texto para WhatsApp/email y marca las líneas como Compradas. Es lo que cierra el ciclo. |
| Stock | Par vs. stock real por local, faltantes, productos sin contar hace más de N días. |
| Catálogo | Alta y edición de productos, par y proveedor (hoy existe dentro de Configuración). |
| Config | Locales, encargados, proveedores, parámetros (Telegram, OCR). |

`admin.js` (compras con factura y transferencias) se integra dentro de Compras; no
sigue como capa aparte.

### 2.2 Ciclo de vida del pedido (la regla central)

```
Pendiente ──(gerencia arma OC)──> Comprado ──(encargado tilda en Recibir)──> Entregado
    │                                                   │
    └──(gerencia cancela)──> Cancelado        parcial: Cantidad_Recibida < Cantidad → sigue Comprado
```

Cada transición escribe en `PEDIDO_LINEAS` (estado, OC, cantidad recibida, fecha) y la
recepción escribe además una fila en `MOVIMIENTOS`. Con esto, "pedidos abiertos" vuelve
a significar algo y la sugerencia por par deja de contar pedidos viejos.

### 2.3 Ritmo semanal propuesto (parametrizable en CONFIG)

| Día | Quién | Acción | Pantalla |
| --- | --- | --- | --- |
| Lunes antes de las 11 | Encargado | Conteo de stock | Contar |
| Lunes antes de las 14 | Encargado | Pedido de la semana (con sugerido por par) | Pedir |
| Lunes 14–17 | Compras | Consolidar y enviar OC por proveedor | Compras |
| Martes a jueves | Encargado | Tildar lo que llega | Recibir |
| Viernes | Gerencia | Revisar faltantes y pedidos sin recibir | Stock / Tablero |

### 2.4 Nueva planilla: 9 pestañas

Se crea un **archivo nuevo** (`Docks · Abastecimiento V3`); el actual queda como
archivo histórico de sólo lectura. Motivo: migrar sin tocar producción, poder correr
una semana en paralelo y volver atrás cambiando una sola constante (`SHEET_ID`).

| # | Pestaña | Reemplaza a | Columnas |
| --- | --- | --- | --- |
| 1 | `CATALOGO` | CATÁLOGO PRODUCTOS | Código, Producto, Local, Categoría, Unidad, Proveedor, Precio, Par, Stock_Actual, Ultimo_Conteo, Estado, Actualizado |
| 2 | `PROVEEDORES` | (no existía) | Proveedor, Contacto, WhatsApp, Email, Dias_Entrega, Pedido_Minimo, Locales_Que_Atiende, Observaciones |
| 3 | `CONFIG` | CONFIGURACIÓN | Tres bloques con encabezado propio: **Locales** (Local, Activo, Modulos_Habilitados, Dia_Pedido, Hora_Corte), **Encargados** (Local, Encargado, Activo), **Parametros** (Clave, Valor) |
| 4 | `PEDIDOS` | PEDIDOS RECIBIDOS | ID_Pedido, Fecha_Hora, Semana, Local, Encargado, Email, Prioridad, Fecha_Entrega, Notas, Lineas, Estado |
| 5 | `PEDIDO_LINEAS` | PEDIDOS_DETALLE + LOCAL PEDIDO ×8 | ID_Pedido, ID_Linea, Fecha_Hora, Semana, Local, Código, Producto, Categoría, Unidad, Cantidad, Proveedor, Precio_Ref, **Estado, ID_OC, Cantidad_Recibida, Fecha_Recepcion, ID_Recepcion**, Observaciones |
| 6 | `MOVIMIENTOS` | CONTROL STOCK, CONTROL RECEPCION, CONTROL PRODUCCION, CONTEO ELABORADOS, MOVIMIENTOS STOCK, TRANSFERENCIAS INTERNAS, LOCAL STOCK ×8 | Fecha_Hora, ID_Operacion, Tipo (CONTEO / RECEPCION / PRODUCCION / ELABORADO / COMPRA / TRANSFERENCIA / AJUSTE), Local, Destino, Encargado, Código, Producto, Unidad, Cantidad (con signo), Saldo_Resultante, Costo_Unitario, Referencia (ID pedido, OC o comprobante), Observaciones |
| 7 | `COMPRAS` | FACTURAS COMPRAS + VISTA COMPRAS + RESUMEN POR PROVEEDOR | ID_OC, Semana, Fecha, Proveedor, Locales, Estado (Borrador / Enviada / Recibida / Facturada), Lineas, Total_Estimado, Comprobante, Neto, IVA, Total_Factura, Responsable, Observaciones |
| 8 | `TABLERO` | INICIO OPERATIVO, DASHBOARD STOCK, VISTA PEDIDOS/STOCK/RECEPCION/PRODUCCION/ELABORADOS, REPORTE SOBRANTES | Una celda selector de local y semana; bloques con `QUERY` sobre PEDIDO_LINEAS y MOVIMIENTOS: pedidos abiertos, faltantes vs par, compras por proveedor, productos sin contar. Sin valores pegados. |
| 9 | `LOG` | LOG TELEGRAM | Fecha_Hora, Tipo (telegram / error / migracion), Referencia, Local, OK, Detalle |

Reglas de la planilla:

- Una fila por hecho. Nunca una celda con "Nalga - 1 unidad, Picada - 2 kg".
  `PEDIDOS.Lineas` guarda sólo el número de líneas.
- Los saldos viven en `CATALOGO.Stock_Actual` y se recalculan desde `MOVIMIENTOS`;
  cada movimiento guarda `Saldo_Resultante` para auditoría.
- Nombres de local canónicos en todas partes (Umo Grill, Trento Café, Brooklyn,
  Puerto Gelato, GreenFresh, Shopping, Eventos, Pizzería, Depósito). La traducción de
  nombres viejos ocurre sólo en la migración.
- Validación de datos en Local, Unidad, Proveedor, Estado y Tipo (listas desplegables
  tomadas de CONFIG, PROVEEDORES y constantes).
- Encabezados en fila 1, congelados, sin filas de título decorativas. Las pestañas de
  TABLERO y LOG se protegen contra edición manual.

### 2.5 Migración (histórico → V3)

| Origen | Destino | Regla |
| --- | --- | --- |
| PEDIDOS RECIBIDOS | PEDIDOS | 1:1. `Lineas` = cuenta en PEDIDOS_DETALLE. Estado = Entregado si la fecha tiene más de 14 días, si no Pendiente. |
| PEDIDOS_DETALLE | PEDIDO_LINEAS | 1:1. `ID_Linea` = ID_Pedido + índice. Estado según la regla anterior (cierra las 1.303 líneas viejas sin inventar recepciones). |
| CONTROL STOCK | MOVIMIENTOS tipo CONTEO | Cantidad = Stock_Real; Saldo_Resultante = Stock_Real. |
| CONTROL RECEPCION | MOVIMIENTOS tipo RECEPCION | Cantidad positiva. |
| CONTROL PRODUCCION | MOVIMIENTOS tipo PRODUCCION | Cantidad negativa. |
| CONTEO ELABORADOS | MOVIMIENTOS tipo ELABORADO | Cantidad = conteo. |
| MOVIMIENTOS STOCK + TRANSFERENCIAS INTERNAS | MOVIMIENTOS tipo COMPRA / TRANSFERENCIA | Conservar costo y comprobante. |
| FACTURAS COMPRAS | COMPRAS | Estado = Facturada. |
| CATÁLOGO PRODUCTOS | CATALOGO | Par = Stock_Mínimo. Precio numérico (hoy hay "44,68" como texto). |
| CONFIGURACIÓN | CONFIG + PROVEEDORES | Encargados con local canónico; proveedores se extraen de los distintos de CATÁLOGO y PEDIDOS_DETALLE. |
| LOCAL * / VISTA * / DASHBOARD / INICIO / RESUMEN / REPORTE | (nada) | Se descartan: son derivadas. |

La migración corre una sola vez, escribe un resumen en `LOG` (filas por tabla) y es
idempotente: si se vuelve a ejecutar sobre un destino ya cargado, no duplica.

### 2.6 Contrato de API (Apps Script)

Se mantienen todas las acciones actuales durante la transición. Nuevas:

| Acción | Método | Entrada | Salida | Uso |
| --- | --- | --- | --- | --- |
| `getHoy` | GET | local | semana, pedido de la semana (id, estado), ultimo conteo, lineas Compradas sin recibir | Pantalla Hoy |
| `getLineasParaRecibir` | GET | local | lineas con Estado=Comprado agrupadas por OC y proveedor | Recibir |
| `confirmRecepcion` | POST | local, encargado, items[{id_linea, cantidad_recibida}] | id_recepcion, lineas actualizadas | Recibir |
| `getConsolidado` | GET | semana | lineas Pendientes agrupadas por proveedor y local, totales estimados | Compras |
| `crearOrdenCompra` | POST | semana, proveedor, id_lineas[], responsable | id_oc, texto para WhatsApp | Compras |
| `cancelarLineas` | POST | id_lineas[], motivo | lineas actualizadas | Compras |
| `getStockPanel` | GET | local (opcional) | por producto: par, stock, faltante, dias sin contar | Stock |
| `getProveedores` / `saveProveedor` | GET / POST | — | lista / fila guardada | Config |

Reglas que no cambian: toda escritura devuelve un ID y el cliente confirma leyendo
ese ID; bloqueo con `LockService` en escrituras de stock; nombres canónicos; nunca
convertir unidades.

---

## 3. Plan de ejecución para Opus 5.5

### 3.1 Organización del trabajo

- Opus 5.5 actúa como **coordinador**: crea el contrato, lanza agentes, integra,
  corre verificaciones y actualiza `ESTADO.md`.
- Se lanzan **hasta 3 agentes en paralelo**, cada uno dueño de archivos distintos.
  Esto requiere actualizar la regla "máximo un subagente activo" de `AGENTS.md` y
  `CLAUDE.md` para este proyecto (Fase 0). La regla "no editar simultáneamente los
  mismos archivos" se mantiene y es la que permite el paralelismo.
- Cada agente recibe: objetivo, archivos propios, archivos prohibidos, contrato de
  datos/API, aceptación, comando de verificación. No recibe el historial completo.
- El código nuevo del frontend va en archivos separados (`hoy.js`, `recibir.js`,
  `compras.js`) para no pisar `index.html`, igual que hoy `admin.js`. `index.html`
  sólo cambia la navegación y los contenedores.

### 3.2 Fases, agentes y tiempos

| Fase | Entregable | Agente | Archivos propios | Depende de | Tiempo agente | Tiempo usuario |
| --- | --- | --- | --- | --- | --- | --- |
| 0 · Preparación | Copia de seguridad de la planilla, rama `v3`, reglas de paralelismo, `docs/v3/CONTRATO.md` con tablas 2.4 y 2.6 | Coordinador | AGENTS.md, CLAUDE.md, docs/v3/ | — | 1 h | 30 min (hacer la copia en Drive, responder preguntas de §5) |
| 1 · Esquema y backend | `gas/schema_v3.gs` (constantes y encabezados), `gas/setup_v3.gs` (`setupV3()` crea las 9 pestañas con validaciones y TABLERO), `gas/migrate_v3.gs` (`migrateV3()`), adaptadores de lectura/escritura para que las acciones actuales funcionen contra V3 | **Agente A (backend)** | gas/* | 0 | 4–5 h | 15 min (ejecutar `setupV3()` y `migrateV3()` desde el editor de Apps Script sobre la copia) |
| 2 · Encargado | Navegación móvil de 3 acciones + Más, pantalla Hoy, Contar simplificado, Recibir por líneas con tilde y cantidad | **Agente B (frontend encargado)** | index.html (sólo nav y contenedores), hoy.js, recibir.js | contrato de 0; endpoints reales de 1 para probar | 5–6 h | — |
| 3 · Compras | Módulo escritorio: consolidado, OC por proveedor, texto WhatsApp, marcar Comprado, cancelar; integra lo de admin.js | **Agente C (frontend compras)** | compras.js, admin.js | contrato de 0; endpoints de 1 | 4–5 h | — |
| 4 · API nueva | Acciones de la tabla 2.6 en `gas/web_api_v3.gs` y `gas/compras.gs`, Telegram con texto de OC | **Agente A** (segunda tanda, después de la fase 1) | gas/* | 1 | 3 h | — |
| 5 · Verificación | `scripts/verify-v3-schema.js`, `verify-recepcion.js`, `verify-compras.js`, actualización de `verify-live-v2.js` a V3; workflow de deploy | **Agente D (tests)** | scripts/*, .github/workflows/deploy.yml | 1, 2, 3, 4 | 3 h | — |
| 6 · Espejo y corte | Una semana real con los encargados cargando en V3 (la app apunta a la copia V3); comparación de saldos; corte de `SHEET_ID`; ocultar (no borrar) pestañas viejas; README/PRODUCT/DESIGN actualizados | Coordinador + usuario | ESTADO.md, README.md, PRODUCT.md | 5 | 2 h | 1 semana de uso + 1 h de revisión |

Paralelismo real: A corre solo en fase 1 (todos dependen del esquema). Después, **A
(fase 4), B y C corren en paralelo**; D arranca cuando cualquiera de los tres entrega.
Calendario estimado: 2 días de desarrollo con agentes + 1 semana de espejo.

### 3.3 Aceptación por fase

- **Fase 1:** `setupV3()` sobre una planilla vacía crea exactamente 9 pestañas con los
  encabezados de 2.4; `migrateV3()` sobre la copia deja en `LOG` una fila por tabla
  con filas origen = filas destino; `node scripts/verify-v2.js` sigue pasando;
  `getBootstrap` contra V3 devuelve el mismo catálogo por local que contra la planilla
  vieja (comparación por código y unidad).
- **Fase 2:** en celular, un encargado llega a enviar un pedido en tres toques desde
  Hoy; Recibir muestra sólo líneas Compradas de su local; tildar una línea crea un
  movimiento RECEPCION con ID confirmado y la línea pasa a Entregado; Producción no
  aparece para un local que no lo tiene habilitado.
- **Fase 3:** desde Compras, armar una OC para un proveedor marca sus líneas Comprado,
  genera un ID_OC confirmado y un texto de WhatsApp con producto, cantidad, unidad y
  local; el consolidado no muestra líneas Entregadas ni Canceladas.
- **Fase 5:** los verificadores corren en memoria sin escribir en producción; el
  workflow ejecuta los V3 y los V2 que sigan vigentes.
- **Fase 6:** para 5 productos por local, `CATALOGO.Stock_Actual` coincide con el último
  `Saldo_Resultante` de `MOVIMIENTOS`; pedidos abiertos en TABLERO = líneas en estado
  Pendiente o Comprado de la semana; el usuario confirma con los encargados que no
  necesitan explicación para usar Pedir, Contar y Recibir.

### 3.4 Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Romper la carga de pedidos, lo único que hoy funciona | Fase 1 no toca el flujo de pedido; la app vieja sigue apuntando a la planilla vieja hasta el corte; el corte es una constante y se revierte igual. |
| Migración con datos inconsistentes (locales con nombres viejos, precios con coma) | Tabla de equivalencias única en `schema_v3.gs`; la migración registra en LOG cada fila que no pudo mapear, no la descarta en silencio. |
| Agentes pisándose archivos | Propiedad de archivos explícita por agente; frontend nuevo en archivos separados; sólo el coordinador integra en `index.html`. |
| Encargados que no adoptan Recibir | Recibir arranca con las líneas ya cargadas: tildar es más rápido que no hacerlo. Telegram avisa "tenés N líneas por recibir". |
| Fórmulas de TABLERO lentas con 5.000+ movimientos | TABLERO usa `QUERY` acotadas a la semana seleccionada; si supera 2 s, pasar a una función `refreshTablero()` que pegue valores una vez por hora. |
| Cuota de Apps Script en migración | `migrateV3()` procesa por lotes de 500 filas y es reanudable. |

### 3.5 Métricas para saber si funcionó (medir 4 semanas después del corte)

| Métrica | Hoy | Objetivo |
| --- | --- | --- |
| Pestañas en la planilla operativa | 38 | 9 |
| Líneas de pedido en estado abierto de semanas anteriores | 1.303 | < 50 |
| Recepciones registradas por semana (todos los locales) | ≈ 1 | ≥ 1 por local por entrega |
| Productos con stock en cero sin conteo en 14 días | 137 | < 20 |
| Tiempo de gerencia para consolidar compras de la semana | sin medir | < 20 min, medido en Compras |
| Órdenes de compra con proveedor y total estimado | 0 | 100 % de lo comprado |

---

## 4. Prompts listos para Opus 5.5

Copiar cada bloque tal cual. Reemplazar `<ID_COPIA>` por el ID de la copia de la
planilla hecha en la Fase 0.

### 4.1 Coordinador

```
Actuá como coordinador del proyecto V3 descrito en PLAN-V3.md de este repositorio.
Leé PLAN-V3.md completo, AGENTS.md, CLAUDE.md y ESTADO.md. No leas index.html entero.

Fase 0, hacelo vos:
1. Creá docs/v3/CONTRATO.md con las tablas 2.4 (pestañas y columnas), 2.5 (migración)
   y 2.6 (API) copiadas de PLAN-V3.md. Ese archivo es la única fuente de verdad para
   los agentes.
2. Editá AGENTS.md y CLAUDE.md: permitir hasta 3 subagentes en paralelo cuando cada uno
   sea dueño de archivos distintos. Mantener la regla de no editar el mismo archivo.
3. Trabajá en la rama v3. Commits cortos e imperativos.

Luego lanzá el Agente A (prompt 4.2). Cuando termine la fase 1 y pase su aceptación,
lanzá en paralelo A (fase 4, prompt 4.5), B (4.3) y C (4.4). Cuando cualquiera
entregue, lanzá D (4.6). Integrá vos los cambios de navegación en index.html.
Después de cada fase: corré las verificaciones, actualizá ESTADO.md (300–500
palabras) y reportá qué pasó, qué falló y qué falta. No declares una fase cerrada
sin su aceptación de PLAN-V3.md §3.3.
```

### 4.2 Agente A · Backend, fase 1

```
Sos el agente de backend. Archivos propios: gas/*. Prohibido: index.html, *.js del
frontend, scripts/. Leé docs/v3/CONTRATO.md y gas/utils.gs sólo en las funciones que
necesites (grep primero).

Entregá:
1. gas/schema_v3.gs: constantes SHEET_V3_* para las 9 pestañas, arrays de encabezados
   exactos según CONTRATO.md, tabla LOCAL_ALIASES (Parrilla→Umo Grill, Heladería→
   Puerto Gelato, Cafetería→Trento Café y los demás ya presentes en utils.gs),
   constantes de estados y tipos de movimiento.
2. gas/setup_v3.gs: setupV3(spreadsheetId) crea las 9 pestañas si no existen, escribe
   encabezados en fila 1, congela fila 1, aplica validaciones de datos (Local, Unidad,
   Proveedor, Estado, Tipo), protege TABLERO y LOG, y escribe las fórmulas QUERY de
   TABLERO con un selector de local y semana en B1 y B2. Idempotente.
3. gas/migrate_v3.gs: migrateV3(origenId, destinoId) con las reglas de CONTRATO.md §2.5,
   por lotes de 500 filas, reanudable, idempotente (no duplica por ID), y escribe en
   LOG una fila por tabla con filas origen, filas destino y filas no mapeadas.
4. Adaptadores: readCatalog_, readConfig_, savePedido_/appendPedido_, saveStockConteo_,
   saveRecepcion_, saveProduccion_, saveElaboradosConteo_ deben funcionar contra V3
   cuando la propiedad de script USE_V3=true, escribiendo en PEDIDOS, PEDIDO_LINEAS y
   MOVIMIENTOS. Con USE_V3 ausente, todo sigue igual que hoy.

Aceptación: node scripts/verify-v2.js pasa; una prueba en memoria en
scripts/verify-v3-schema.js (podés crearla, es el único archivo de scripts/ permitido
para vos) comprueba que setupV3 produce exactamente los encabezados del contrato y que
migrateV3 mapea una fila de ejemplo de cada tabla origen. Reportá qué no pudiste probar
sin acceso a la planilla real.
```

### 4.3 Agente B · Frontend encargado

```
Sos el agente de frontend para encargados. Archivos propios: hoy.js, recibir.js y, en
index.html, SOLO la barra de navegación (grep "shell-nav-btn" y "data-tab") y los
contenedores <section> nuevos. Prohibido: gas/, compras.js, admin.js, scripts/.
Leé DESIGN.md (sección vigente), docs/v3/CONTRATO.md y PRODUCT.md §"Borradores por
local". Nunca leas index.html completo: grep y Read con offset/limit.

Entregá:
1. Navegación móvil con cuatro entradas: Hoy, Pedir, Contar, Recibir, y un botón Más
   que muestra Producción/Elaborados/Reportes sólo si CONFIG los habilita para el local
   (campo Modulos_Habilitados del bootstrap; si falta, ocultar).
2. hoy.js: pantalla Hoy que consume getHoy (mientras no exista, usar getBootstrap y
   calcular en cliente) y muestra: pedido de la semana enviado o no, último conteo,
   líneas por recibir. Un botón principal que lleva a la acción pendiente.
3. recibir.js: lista de líneas Compradas del local agrupadas por proveedor, con tilde
   "Llegó" y cantidad editable (por defecto la pedida). Enviar llama a confirmRecepcion
   y confirma por ID leyendo getOperationStatus&type=recepcion. Conservar el camino de
   foto/OCR actual como botón secundario, sin cambios.
4. Contar: reutilizar la pantalla Stock actual eliminando filtros avanzados del flujo
   principal; mostrar cantidad anterior al lado del campo nuevo.

Reglas: no cambiar el flujo Pedir, ni borradores, ni confirmaciones por ID; copy en
español rioplatense; controles de 44 px o más; sin nuevas dependencias.
Aceptación: PLAN-V3.md §3.3 fase 2. Verificación: node scripts/verify-v2.js y
node scripts/verify-local-drafts.js deben seguir pasando.
```

### 4.4 Agente C · Frontend compras

```
Sos el agente del módulo Compras para gerencia (escritorio). Archivos propios:
compras.js y admin.js. Prohibido: index.html, gas/, hoy.js, recibir.js, scripts/.
Leé docs/v3/CONTRATO.md, admin.js completo (84 líneas) y DESIGN.md sección vigente.

Entregá compras.js como capa que se abre desde el botón Administración (igual que
admin.js hoy) con cuatro pestañas: Compras, Stock, Catálogo, Config.
- Compras: consolidado de la semana (getConsolidado) agrupado por proveedor y dentro
  por local; checkbox por línea; botón "Armar orden" llama crearOrdenCompra, muestra el
  ID_OC confirmado y un cuadro con el texto para WhatsApp (producto · cantidad · unidad
  · local) con botón copiar; botón "Cancelar líneas" con motivo obligatorio.
- Stock: tabla getStockPanel con filtro por local: producto, par, stock, faltante,
  días sin contar; ordenable por faltante.
- Catálogo: reusar el formulario existente de alta/edición (addProducto / updateProducto).
- Config: proveedores (getProveedores / saveProveedor) y encargados (addResponsable).
Integrá las funciones de admin.js (compra con factura y transferencia) dentro de
Compras y Stock; admin.js queda como módulo requerido por compras.js o se vacía.
Mientras los endpoints nuevos no existan, implementá un adaptador local que construya
el consolidado desde getBootstrap y marque claramente "modo lectura".
Aceptación: PLAN-V3.md §3.3 fase 3.
```

### 4.5 Agente A · Backend, fase 4

```
Continuás como agente de backend. Archivos propios: gas/*. Implementá en
gas/web_api_v3.gs y gas/compras.gs las acciones de docs/v3/CONTRATO.md §2.6:
getHoy, getLineasParaRecibir, confirmRecepcion, getConsolidado, crearOrdenCompra,
cancelarLineas, getStockPanel, getProveedores, saveProveedor. Registralas en doGet /
doPost de web_api.gs sin alterar las existentes. Toda escritura devuelve ID y se puede
confirmar con getOperationStatus (agregar type=oc). confirmRecepcion escribe en
MOVIMIENTOS (tipo RECEPCION, Referencia = ID_OC), actualiza PEDIDO_LINEAS (Estado,
Cantidad_Recibida, Fecha_Recepcion, ID_Recepcion) y CATALOGO.Stock_Actual, bajo
withStockMutationLock_. crearOrdenCompra agrupa por proveedor, escribe COMPRAS,
marca líneas Comprado y devuelve el texto de WhatsApp. Telegram: mensaje nuevo
"OC enviada" y "líneas por recibir" reutilizando notifyTelegramMessage_.
Aceptación: verify-v2.js pasa; pruebas en memoria de cada acción en
scripts/verify-v3-api.js (único archivo de scripts/ permitido para vos).
```

### 4.6 Agente D · Verificación y despliegue

```
Sos el agente de verificación. Archivos propios: scripts/*, .github/workflows/deploy.yml.
Prohibido: gas/, index.html, *.js del frontend.
Leé README.md, DEPLOY-V2.md, scripts/verify-v2.js y scripts/verify-order-send.js como
modelo de pruebas en memoria.
Entregá: scripts/verify-recepcion.js (tildar líneas Compradas crea movimiento y cambia
estado, parcial mantiene Comprado), scripts/verify-compras.js (armar OC marca Comprado,
consolidado excluye Entregado/Cancelado, texto WhatsApp contiene producto, cantidad,
unidad y local), scripts/verify-live-v3.js (como verify-live-v2 pero comprobando
capacidades V3 y las 9 pestañas vía getBootstrap), y el workflow ejecutando los
verificadores nuevos antes del deploy. Ninguna prueba escribe en producción.
Reportá qué cobertura falta y qué prueba manual queda para el usuario.
```

---

## 5. Preguntas abiertas (con la respuesta asumida si no se contesta)

| # | Pregunta | Asumido en este plan |
| --- | --- | --- |
| 1 | ¿Compra una sola persona para todos los locales o cada local compra lo suyo? | Compra centralizada por gerencia (así lo describe PRODUCT.md). |
| 2 | ¿Cómo reciben los proveedores el pedido hoy: WhatsApp, email, teléfono? | WhatsApp. El sistema genera el texto; el envío lo hace una persona. Sin API de WhatsApp en esta etapa. |
| 3 | ¿Existe un depósito central que recibe y luego transfiere a los locales? | Sí (hay TRANSFERENCIAS INTERNAS y "central" en admin.js). Se modela como local "Depósito". |
| 4 | ¿Producción y Elaborados se usan en algún local? | Sólo Trento Café (pastelería). Se ocultan en los demás; el backend se conserva. |
| 5 | ¿Planilla nueva (recomendado) o limpiar la actual en el lugar? | Planilla nueva con migración y archivo viejo como histórico. |
| 6 | ¿Hace falta valorizar stock y compras en pesos desde el día uno? | Se guardan precio y costo en cada fila desde el inicio; los reportes en pesos se agregan después del corte. |
| 7 | ¿Alguien necesita un Excel descargable (contador, dueño)? | No en esta etapa. Si hace falta, se agrega `exportSemana()` que genera un XLSX desde COMPRAS y MOVIMIENTOS. |
| 8 | ¿Qué locales están activos hoy? (la planilla tiene 9: Umo Grill, Trento Café, Brooklyn, Puerto Gelato, GreenFresh, Shopping, Eventos, Pizzería y Depósito) | Todos activos salvo Pizzería (encargado marcado NO en CONFIGURACIÓN). |

Responder estas ocho preguntas antes de la Fase 1 evita retrabajo en el esquema.

---

## 6. Siguiente paso inmediato

1. El usuario responde las preguntas de §5 (10 minutos) y hace una **copia de la
   planilla en Drive** (Archivo → Hacer una copia) con nombre
   `Docks · Abastecimiento V3 (pruebas)`; anota el ID.
2. Abrir una sesión nueva de Claude Code con Opus 5.5 en la rama `v3` y pegar el
   prompt 4.1.
