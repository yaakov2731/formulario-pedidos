# CONTRATO V3 · sistema nuevo · fuente de verdad para los agentes

Versión 2 · 18 de octubre de 2026. Reemplaza la versión con migración.
Si este archivo y `PLAN-V3.md` difieren, vale este archivo. Sólo el coordinador lo cambia.

## 0. Decisiones

| # | Decisión |
| --- | --- |
| D1 | **Sistema nuevo desde cero. No se migra nada.** Catálogo, proveedores y encargados se cargan de cero en la planilla nueva. |
| D2 | La app actual (`index.html`, `gas/`) y su planilla siguen funcionando sin cambios hasta el corte. V3 vive aparte: `v3/` y `v3/gas/`. |
| D3 | Compra centralizada por gerencia. Proveedores reciben la orden por WhatsApp: el sistema arma el texto y el link `wa.me`; una persona lo envía. |
| D4 | Locales: Umo Grill, Trento Café, Brooklyn, Puerto Gelato, GreenFresh, Shopping, Eventos, Depósito (activos) y Pizzería (inactivo). Depósito es un local más. |
| D5 | MVP sin Producción ni Transferencias. **Elaborados** (qué queda de lo producido: listo, marcado, crudo) se agregó el 18/10/2026 como etapa 2 (§3.6, §4). |
| D6 | Precio de referencia en catálogo y en cada línea desde el inicio. Sin facturas en el MVP. |
| D7 | Encargados escriben sin clave (como hoy). Gerencia escribe con `admin_key` validada en el servidor contra la propiedad de script `ADMIN_KEY`. |

### 0.1 Planillas

| Rol | Nombre en Drive | ID |
| --- | --- | --- |
| Producción actual (no tocar) | Sistema_Pedidos_Polo_Gastronomico_COMPLETO | `1XYqcWbJzMLL3kRcbYnRUi_UVqRVbZpqSFYGLBov3wtE` |
| Respaldo de seguridad (no se usa en V3) | RESPALDO 2026-10-18 · Sistema_Pedidos_Polo_Gastronomico (no editar) | `1Ln1nmvjTO7yBQLTIK-HAucAc3aXkxv8aCKlhXcfXA1c` |
| **Planilla V3** (vacía hoy) | Docks · Abastecimiento V3 (pruebas) | `1Jro4Ynb6n7otyaNsFWAi3QznYsWHuHf8EBPazY-_BpE` |

## 1. Propiedad de archivos (nadie edita archivos ajenos ni hace commits)

| Dueño | Archivos |
| --- | --- |
| Coordinador | `docs/v3/*`, `v3/config.js`, `v3/core.js`, `v3/base.css`, `scripts/verify-v3-core.js`, `scripts/v3-dev-server.js`, `scripts/v3-bundle-gas.js`, `v3/apps-script/*` (generado), `.github/workflows/deploy.yml`, `ESTADO.md`, `PLAN-V3.md`, `README.md` |
| Agente A · backend | `v3/gas/*`, `scripts/v3/fake-gas.js`, `scripts/verify-v3-backend.js` |
| Agente B · encargado | `v3/index.html`, `v3/encargado.js`, `v3/encargado.css`, `scripts/verify-v3-encargado.js` |
| Agente C · compras | `v3/compras.html`, `v3/compras.js`, `v3/compras.css`, `scripts/verify-v3-compras.js` |

Prohibido para todos: `index.html`, `admin.js`, `gas/`, los `scripts/verify-*.js` existentes, la planilla de producción.
Si un agente necesita un cambio en un archivo ajeno, lo pide en su reporte final.

## 2. Reglas transversales

- Una fila por hecho. Encabezados en fila 1, congelados, sin filas decorativas.
- Toda escritura devuelve un ID. El cliente confirma leyendo ese ID; una respuesta ilegible no es error ni éxito.
- IDs de operación los genera el cliente con `Docks.ids.nuevo(prefijo)`; el servidor los valida
  (`^[A-Z]{2,4}-\d{8}-\d{6}-[a-z0-9]{4}$`) y es idempotente: el mismo ID no se escribe dos veces.
- Todas las escrituras bajo `LockService.getScriptLock()` (espera máxima 20 s).
- Nunca convertir unidades. Cantidad vacía o no numérica ≠ 0. Cero es un valor válido.
- Fechas en `America/Argentina/Buenos_Aires`, formato de celda `yyyy-MM-dd HH:mm:ss`.
- Semana ISO, lunes a domingo. ID `2026-W42`; etiqueta `Semana 42 · 12 al 18 oct`.
- Textos en español rioplatense. Sin datos de ejemplo inventados en la planilla.

## 3. Planilla V3: 11 pestañas

`setupV3()` las crea en este orden, idempotente (si existen, sólo corrige encabezados y validaciones; nunca borra filas).

| # | Pestaña | Columnas (fila 1, en este orden) |
| --- | --- | --- |
| 1 | `CATALOGO` | Código · Producto · Local · Categoría · Unidad · Proveedor · Precio · Par · Stock_Actual · Ultimo_Conteo · Estado · Actualizado |
| 2 | `PROVEEDORES` | Proveedor · Contacto · WhatsApp · Email · Dias_Entrega · Pedido_Minimo · Activo · Observaciones |
| 3 | `LOCALES` | Local · Activo · Encargados · Dia_Pedido · Hora_Corte · Prefijo_Codigo · Observaciones |
| 4 | `PEDIDOS` | ID_Pedido · Fecha_Hora · Semana · Local · Encargado · Prioridad · Fecha_Entrega · Notas · Lineas · Estado |
| 5 | `PEDIDO_LINEAS` | ID_Linea · ID_Pedido · Fecha_Hora · Semana · Local · Código · Producto · Categoría · Unidad · Cantidad · Proveedor · Precio_Ref · Estado · ID_OC · Cantidad_Recibida · Fecha_Recepcion · ID_Recepcion · Observaciones |
| 6 | `MOVIMIENTOS` | Fecha_Hora · ID_Operacion · Tipo · Local · Encargado · Código · Producto · Unidad · Cantidad · Saldo_Anterior · Saldo_Resultante · Costo_Unitario · Referencia · Observaciones |
| 7 | `COMPRAS` | ID_OC · Fecha_Hora · Semana · Proveedor · Locales · Estado · Lineas · Total_Estimado · Responsable · Texto_WhatsApp · Observaciones |
| 8 | `ELABORADOS` | Código · Producto · Local · Categoría · Unidad · Listo · Marcado · Crudo · Ultimo_Conteo · Activo · Observaciones · Actualizado |
| 9 | `CONTEO_ELABORADOS` | Fecha_Hora · ID_Conteo · Local · Encargado · Código · Producto · Unidad · Listo · Marcado · Crudo · Total · Observaciones |
| 10 | `TABLERO` | Sin encabezado de datos: bloques con `QUERY` (ver 3.3). Protegida. |
| 11 | `LOG` | Fecha_Hora · Tipo · Referencia · Local · OK · Detalle. Protegida. |

### 3.1 Valores controlados

| Campo | Valores |
| --- | --- |
| Unidad | kg, g, litro, ml, unidad, paquete, caja, bolsa, docena, atado, bandeja, lata, botella, horma, balde |
| Unidades contables (se redondean a entero) | unidad, paquete, caja, bolsa, docena, atado, bandeja, lata, botella, horma, balde |
| CATALOGO.Estado | Activo, Inactivo |
| Activo (PROVEEDORES, LOCALES, ELABORADOS) | SÍ, NO |
| PEDIDOS.Prioridad | Normal, Urgente |
| PEDIDOS.Estado | Pendiente (alguna línea Pendiente), En compra (ninguna Pendiente, alguna Comprado), Cerrado (todas Entregado/Incompleto/Cancelado) |
| PEDIDO_LINEAS.Estado | Pendiente, Comprado, Entregado, Incompleto, Cancelado |
| MOVIMIENTOS.Tipo | CONTEO, RECEPCION, AJUSTE |
| COMPRAS.Estado | Enviada, Recibida parcial, Recibida, Cancelada |
| Dia_Pedido | Lunes … Domingo |

Validación de datos en la planilla: Local (desde LOCALES), Unidad, Proveedor (desde PROVEEDORES, con aviso, no rechazo), los estados, Tipo y Activo.

### 3.2 Semilla de `setupV3()`

Sólo LOCALES, y sólo si está vacía: los 9 locales de D4 con Prefijo_Codigo
UMO, TRE, BRK, GEL, GRF, SHP, EVT, DEP, PIZ; Activo SÍ salvo Pizzería NO; Dia_Pedido Lunes;
Hora_Corte 14:00; Encargados vacío. CATALOGO y PROVEEDORES quedan vacíos.

### 3.3 TABLERO

Celda B1: selector de local (validación desde LOCALES más "Todos"). Bloques con `QUERY` sobre las pestañas,
sin valores pegados: (1) pendientes de compra por proveedor, producto y unidad (suma de Cantidad); (2) órdenes
por recibir por local y proveedor; (3) productos bajo par (Stock_Actual < Par); (4) productos sin conteo en 7 días;
(5) líneas Incompleto de los últimos 14 días; (6) elaborados activos con su último
conteo (Listo, Marcado, Crudo). La columna 32 (oculta) es la lista auxiliar del selector; el bloque 6 empieza en la 33.

### 3.4 Ciclo de una línea de pedido

```
Pendiente --crearOrden--> Comprado --saveRecepcion(recibida >= pedida)--> Entregado
    |                         \-----saveRecepcion(recibida <  pedida)--> Incompleto (cerrada; gerencia ve el faltante)
    \--cancelarLineas--> Cancelado
```

Al cerrar líneas, el servidor recalcula PEDIDOS.Estado y COMPRAS.Estado.

### 3.5 Stock y sugerido

- `Stock_Actual` vive en CATALOGO. CONTEO lo fija (Saldo_Resultante = contado). RECEPCION lo suma.
  Si Stock_Actual está vacío y llega una recepción, el saldo queda vacío (desconocido) y el movimiento
  guarda Saldo_Resultante vacío: no se inventa un conteo.
- `pedido_abierto` = suma de Cantidad de líneas Pendiente o Comprado del mismo local y código.
- `sugerido` = `max(0, Par − Stock_Actual − pedido_abierto)`. Contables: redondeo hacia arriba a entero.
  Peso y volumen: hacia arriba a 0,1. Sin Par → motivo `SIN_PAR`. Sin Stock_Actual → motivo `SIN_CONTEO`.
- Estado de stock (panel): `SIN_CONTEO`, `SIN_PAR`, `SIN_STOCK` (≤ 0), `BAJO` (< Par), `OK`.

### 3.6 Elaborados: qué queda

- `ELABORADOS` es la lista de lo que produce cada local (bondiola, pollo deshuesado, salsas…) con códigos
  `UMO-E001`, `UMO-E002`… independientes del catálogo. La crea gerencia en Compras o el propio encargado desde el
  celular (sin clave, sólo alta; gerencia edita y desactiva). Producto + Unidad no se repite en un local.
- Tres estados fijos por producto: **Listo** (para vender), **Marcado** (sellado, falta terminar) y **Crudo** (sin cocinar).
- Un conteo (`saveConteoElaborados`, ID con prefijo `ELB`) fija los tres valores de cada producto incluido y escribe
  una fila por producto en `CONTEO_ELABORADOS` con el `Total`. En un producto incluido, un estado vacío vale 0;
  un producto que no se toca no cambia. Columnas Listo/Marcado/Crudo/Ultimo_Conteo de `ELABORADOS` = último conteo.
- Planillas instaladas antes de esta etapa: las dos pestañas se crean solas la primera vez que se usan
  (`getElaborados`, `agregarElaborado`, `saveElaborado`, `saveConteoElaborados`) o al correr `setupV3()`.
  `getHoy` y `getOperacion` no las crean y no fallan si faltan.
- `reiniciarDatos` vacía `CONTEO_ELABORADOS` y deja Listo/Marcado/Crudo/Ultimo_Conteo vacíos; conserva la lista.

## 4. API (Apps Script web app)

Transporte: GET por JSONP (`?action=...&callback=fn`), POST con `fetch` y `Content-Type: text/plain;charset=utf-8`,
cuerpo JSON con `action`. Toda respuesta: `{ok:true, ...}` o `{ok:false, error:"mensaje para mostrar"}`.
`semana` es siempre el objeto `{id,label,inicio,fin}`. En respuestas de escritura, `lineas`, `items`,
`entregadas`, `incompletas`, `extras`, `creados`, `actualizados` y `canceladas` son números (cantidades), no arreglos.
`version` = `"v3"`.

### 4.1 Lecturas (GET)

| Acción | Parámetros | Respuesta (además de `ok`) |
| --- | --- | --- |
| `ping` | — | `version`, `hora` |
| `getBootstrap` | — | `version`, `semana:{id,label,inicio,fin}`, `locales:[{local,activo,encargados:[],dia_pedido,hora_corte,prefijo}]`, `proveedores:[{proveedor,contacto,whatsapp,email,dias_entrega,pedido_minimo,activo,observaciones}]` |
| `getCatalogo` | `local` (opcional; sin él, todos) | `productos:[{codigo,producto,local,categoria,unidad,proveedor,precio,par,stock_actual,ultimo_conteo,estado,pedido_abierto,sugerido,motivo}]`. Números como number o `null` si vacío. Con `local`, sólo Estado Activo. |
| `getHoy` | `local` | `semana`, `pedido_semana:{id_pedido,fecha_hora,estado,encargado,lineas}` o `null` (el último de la semana), `pedidos_semana` (cantidad), `ultimo_conteo:{id_operacion,fecha_hora,encargado,productos}` o `null`, `por_recibir` (órdenes con líneas Comprado del local), `bajo_par` (cantidad), `ultimo_elaborados:{id_conteo,fecha_hora,encargado,productos}` o `null`, `elaborados_activos` (cantidad) |
| `getPedido` | `id` | `pedido:{id_pedido,fecha_hora,semana,local,encargado,prioridad,fecha_entrega,notas,lineas,estado}`, `lineas:[{id_linea,codigo,producto,unidad,cantidad,proveedor,estado,id_oc}]`; si no existe: `ok:true, found:false` |
| `getOperacion` | `id` | `found`, `tipo` (CONTEO / RECEPCION / OC / PEDIDO / ELABORADOS), `local`, `fecha_hora`, `items`; si es OC, además `proveedor`, `texto_whatsapp`, `whatsapp_url`; si es ELABORADOS, `encargado` y `detalle:[{codigo,producto,unidad,listo,marcado,crudo,total}]` |
| `getPorRecibir` | `local` | `ordenes:[{id_oc,proveedor,fecha_hora,lineas:[{id_linea,id_pedido,codigo,producto,unidad,cantidad,precio_ref}]}]` (líneas Comprado del local, agrupadas por ID_OC) |
| `getConsolidado` | `semana` (opcional; sin ella, todas las Pendiente) | `grupos:[{proveedor, whatsapp, pedido_minimo, total_estimado, lineas:[{id_linea,id_pedido,fecha_hora,local,codigo,producto,unidad,cantidad,precio_ref,prioridad,encargado}]}]`. Las líneas sin proveedor van en un grupo con `proveedor:""`. |
| `getOrdenes` | `estado` (opcional) | `ordenes:[{id_oc,fecha_hora,semana,proveedor,locales,estado,lineas,total_estimado,texto_whatsapp,whatsapp_url}]`, más recientes primero, máximo 200 |
| `getFaltantes` | `dias` (opcional, 14) | `lineas:[{id_linea,id_oc,local,proveedor,producto,unidad,cantidad,cantidad_recibida,fecha_recepcion}]` (Estado Incompleto) |
| `getStockPanel` | `local` (opcional) | `filas:[{local,codigo,producto,categoria,unidad,proveedor,par,stock_actual,pedido_abierto,sugerido,ultimo_conteo,dias_sin_contar,estado}]` |
| `getElaborados` | `local` (opcional) | `productos:[{codigo,producto,local,categoria,unidad,listo,marcado,crudo,total,ultimo_conteo,dias_sin_contar,activo,observaciones}]`. Con `local`, sólo Activo SÍ; sin él, todos. `total` es `null` si nunca se contó. Crea las pestañas si faltan. |

### 4.2 Escrituras (POST)

| Acción | Cuerpo | Efecto | Respuesta |
| --- | --- | --- | --- |
| `savePedido` | `id_pedido, local, encargado, prioridad, fecha_entrega?, notas?, items:[{codigo, cantidad}` o `{producto, unidad, cantidad}` (línea libre)`]` | Valida local activo, cantidades > 0 finitas, códigos del catálogo del local. Escribe PEDIDOS y una fila por línea (ID_Linea = `id_pedido + "-" + n`, Estado Pendiente, proveedor y precio desde catálogo). Suma el encargado a LOCALES si es nuevo. | `id_pedido, lineas` |
| `saveConteo` | `id_operacion, local, encargado, items:[{codigo, cantidad}]` | Cantidad ≥ 0. Por ítem: MOVIMIENTOS CONTEO, CATALOGO.Stock_Actual y Ultimo_Conteo. | `id_operacion, items` |
| `saveRecepcion` | `id_operacion, local, encargado, items:[{id_linea, cantidad_recibida}], extras?:[{codigo, cantidad}], observaciones?` | Sólo líneas Comprado del local. Por línea: MOVIMIENTOS RECEPCION (si > 0, Referencia = ID_OC), stock, Estado Entregado o Incompleto, Cantidad_Recibida, Fecha_Recepcion, ID_Recepcion. Extras: RECEPCION con Referencia `SIN PEDIDO`. Recalcula estados. | `id_operacion, entregadas, incompletas, extras` |
| `crearOrden` | `admin_key, id_oc, id_lineas[], proveedor, responsable` | Líneas en Pendiente; si una línea no tiene proveedor toma el indicado. Escribe COMPRAS (Estado Enviada), marca líneas Comprado con ID_OC, arma texto WhatsApp (4.3). | `id_oc, texto_whatsapp, whatsapp_url, lineas` |
| `cancelarLineas` | `admin_key, id_lineas[], motivo` | Sólo Pendiente o Comprado. Estado Cancelado, motivo en Observaciones. Recalcula estados. | `canceladas` |
| `saveProducto` | `admin_key, local, codigo?, producto, categoria, unidad, proveedor, precio, par, estado` | Alta o edición por Local + Código. Sin código: `Prefijo_Codigo` + número correlativo de 3 dígitos. No toca Stock_Actual. | `producto` (como en `getCatalogo`) |
| `saveProductosLote` | `admin_key, local, filas:[{producto, categoria, unidad, proveedor, precio, par}]` | Alta masiva; si existe el mismo Producto + Unidad en el local, actualiza. Devuelve errores por fila sin cortar el lote. | `creados, actualizados, errores:[{fila, error}]` |
| `saveProveedor` | `admin_key, proveedor, contacto, whatsapp, email, dias_entrega, pedido_minimo, activo, observaciones` | Alta o edición por nombre (sin distinguir mayúsculas ni acentos). | `proveedor` |
| `saveLocal` | `admin_key, local, activo, encargados (array), dia_pedido, hora_corte` | Edición de un local existente. | `local` |
| `saveConteoElaborados` | `id_conteo, local, encargado, items:[{codigo, listo?, marcado?, crudo?, observaciones?}]` | Cantidades ≥ 0; en cada ítem al menos un estado presente (vacío = 0). Rechaza inactivos y repetidos. Por ítem: fila en CONTEO_ELABORADOS y Listo/Marcado/Crudo/Ultimo_Conteo en ELABORADOS. Idempotente por `id_conteo`. | `id_conteo, items` |
| `agregarElaborado` | `local, encargado, producto, unidad, categoria?` | Alta sin clave desde el celular. Si ya existe Producto + Unidad en el local, lo devuelve (y lo reactiva) con `existia:true`. Suma el encargado a LOCALES. | `producto` (como en `getElaborados`), `existia` |
| `saveElaborado` | `admin_key, local, codigo?, producto, categoria?, unidad, activo?, observaciones?` | Alta o edición por Local + Código. Sin código: `Prefijo_Codigo` + `-E` + correlativo de 3 dígitos. No toca Listo/Marcado/Crudo. | `producto` |
| `checkAdmin` | `admin_key` | Valida la clave. | — |
| `reiniciarDatos` | `admin_key, confirmacion` (= `EMPEZAR DE CERO`, sin distinguir mayúsculas) | Copia completa de la planilla (`Spreadsheet.copy`); si falla, no borra nada. Vacía PEDIDOS, PEDIDO_LINEAS, MOVIMIENTOS, COMPRAS y CONTEO_ELABORADOS (conserva encabezados, formato y validaciones) y deja vacíos `Stock_Actual` y `Ultimo_Conteo` del catálogo y Listo/Marcado/Crudo/Ultimo_Conteo de los elaborados (sin contar, no cero). Conserva catálogo, elaborados, proveedores, locales, encargados, TABLERO y LOG; registra REINICIO en LOG. | `respaldo_nombre, respaldo_url, pedidos, lineas, movimientos, ordenes, productos_sin_contar, conteos_elaborados, elaborados_sin_contar` |

`admin_key` inválida o `ADMIN_KEY` sin configurar → `ok:false` con mensaje claro.

Reglas de edición: en `saveProducto`, `saveProveedor`, `saveLocal` y `saveElaborado`, un campo ausente no modifica lo guardado y un
texto vacío lo vacía. `activo` acepta `SÍ`/`NO`/`SI`/booleano y se guarda como `SÍ`/`NO`.
`saveProductosLote.errores[].fila` es la posición en `filas`, empezando en 1.

### 4.5 Decisiones de implementación (Agente A, aceptadas por el coordinador)

- En la API `activo` es booleano; en la planilla queda `SÍ`/`NO`.
- Códigos autogenerados con guion: `UMO-001`, `UMO-002`…
- `getOrdenes.locales` es un arreglo. `getHoy.por_recibir` es la cantidad de órdenes.
- COMPRAS.Estado: Enviada (nada recibido), Recibida (todas las líneas no canceladas Entregado),
  Recibida parcial (llegó algo y queda alguna Comprado o Incompleto), Cancelada (todas canceladas).
- Un código repetido en un pedido se suma en una línea; en un conteo se rechaza. Producto Inactivo se rechaza.
- Recibir 0 deja la línea Incompleto y no genera movimiento.
- Producto + Unidad repetido en el mismo local se rechaza en `saveProducto` sin código, indicando el código existente.
- Fechas, IDs, semana, WhatsApp y hora de corte se guardan con formato texto. Un texto que empieza con `=`, `+` o `-`
  se guarda con apóstrofo para que la planilla no lo interprete como fórmula.

### 4.3 Texto de WhatsApp de una orden

```
*Pedido Docks del Puerto* · OC-20261018-143000-ab12
Proveedor: Distribuidora Florida
Semana 42 · 12 al 18 oct

• Asado — 12 kg
• Chorizo — 8 kg
• Tomate — 15 kg

Entrega por local:
Umo Grill: Asado 12 kg, Chorizo 8 kg, Tomate 5 kg
Trento Café: Tomate 10 kg

Gracias.
```

Productos sumados por Producto + Unidad (nunca se suman unidades distintas). `whatsapp_url` = `https://wa.me/<solo dígitos>?text=<texto codificado>`; si el proveedor no tiene WhatsApp, `whatsapp_url` = `https://wa.me/?text=...`.

### 4.4 Notificaciones Telegram (opcional)

Propiedades `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. Mensajes: pedido nuevo, orden creada, recepción con
incompletas. Un fallo de Telegram se registra en LOG y nunca hace fallar la escritura.

## 5. Frontend

- Dos páginas: `v3/index.html` (encargado, celular: Hoy, Pedir, Contar, Elaborados, Recibir) y `v3/compras.html`
  (gerencia, escritorio: Compras, Órdenes, Faltantes, Stock, Elaborados, Catálogo, Proveedores, Locales).
- Ambas cargan, en este orden: Google Fonts (Public Sans 400–700, Familjen Grotesk 600–700), `base.css`,
  su CSS propio, `config.js`, `core.js`, su JS propio. Sin dependencias externas de JS ni bundler.
- `core.js` expone `window.Docks` (ver 5.1). Ninguna página habla con el backend sin `Docks.api`.
- Controles de 44 px o más. Colores sólo con los tokens de `base.css`. Estados siempre con texto, no sólo color.

### 5.1 `window.Docks` (core.js, del coordinador)

| Miembro | Uso |
| --- | --- |
| `Docks.version` | `"v3"` |
| `Docks.api.configured()` | `true` si hay URL de backend |
| `Docks.api.get(action, params?, {timeout?})` | Promesa con el JSON; rechaza con `Error` legible en timeout o error de red. Si `ok:false`, rechaza con `error.message` = mensaje del servidor y `error.server = true`. |
| `Docks.api.post(payload, {timeout?})` | Promesa: JSON si se pudo leer, `null` si no (el llamador confirma por ID). Rechaza sólo si `ok:false` legible (`error.server = true`). |
| `Docks.api.confirm(action, id, {intentos?, espera?})` | Reintenta `get(action,{id})` hasta `found !== false`; devuelve la respuesta o `null`. |
| `Docks.ids.nuevo(prefijo)` | `PED-20261018-143000-ab12`. Prefijos: PED (pedido), CNT (conteo), ELB (conteo de elaborados), REC (recepción), OC (orden). |
| `Docks.semana.de(fecha?)` | `{id, label, inicio, fin}` con la misma regla que el servidor |
| `Docks.num.parse(texto)` | Acepta `1,5` y `1.5`; vacío o inválido → `null` |
| `Docks.num.fmt(n, unidad?)` | Para mostrar: `1,5 kg`, `1.234 kg`; `null` → `—` |
| `Docks.num.input(n)` | Para el `value` de un input: `1234,5` sin separador de miles; `null` → `''`. Ida y vuelta exacta con `parse`. |
| `Docks.sugerido({par, stock_actual, pedido_abierto, unidad})` | `{cantidad, motivo}` con la regla 3.5 |
| `Docks.UNIDADES`, `Docks.CONTABLES` | Listas de 3.1 |
| `Docks.store.get(k, def)` / `set(k, v)` / `del(k)` | localStorage con prefijo `docksv3:` y try/catch |
| `Docks.norm(s)` | Minúsculas sin acentos ni espacios dobles, para buscar |
| `Docks.esc(s)` | Escape HTML |
| `Docks.toast(msg, tipo?)` | `tipo`: `ok`, `error`, `info` |
| `Docks.fechaCorta(iso)` / `Docks.haceDias(iso)` | Formato `18/10 14:30` y días enteros desde la fecha |

### 5.2 Desarrollo local

`node scripts/v3-dev-server.js` sirve `v3/` en `http://localhost:8787/` y responde la API en `/api` ejecutando
`v3/gas/*.gs` sobre la planilla en memoria de `scripts/v3/fake-gas.js`. Abrir `http://localhost:8787/?api=/api`.
`?api=` se guarda en el equipo junto con la `API_URL` de `config.js` vigente en ese momento; `?api=` vacío lo borra. Si después `config.js` cambia de `API_URL`, la URL fijada se descarta sola y vuelve a mandar `config.js` (así un celular que probó un backend viejo no queda pegado a él).

### 5.3 Interfaz de `scripts/v3/fake-gas.js` (del Agente A, la usa el coordinador)

```js
const { createGasRuntime } = require('./fake-gas');
const rt = createGasRuntime({ dir: 'v3/gas', properties: { ADMIN_KEY: 'test' } });
rt.call('setupV3');                       // ejecuta una función global
rt.doGet({ parameter: { action: 'ping', callback: 'cb' } }) // -> { text, mimeType }
rt.doPost({ postData: { contents: JSON.stringify({ action: 'savePedido', ... }) } }) // -> { text, mimeType }
rt.sheet('CATALOGO')                      // -> array de filas (incluye encabezado)
```

`createGasRuntime` simula `SpreadsheetApp` (con `getActiveSpreadsheet` y `openById`), `LockService`,
`PropertiesService`, `Utilities.formatDate`, `ContentService`, `UrlFetchApp` (registra llamadas, no sale a la red)
y `Session.getScriptTimeZone`. Sin dependencias de npm.
