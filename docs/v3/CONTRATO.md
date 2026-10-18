# CONTRATO V3 · fuente de verdad para los agentes

Derivado de `PLAN-V3.md` el 18 de octubre de 2026 (Fase 0). Si este archivo y
`PLAN-V3.md` difieren, vale este archivo. Cambios al contrato: sólo el coordinador,
en un commit propio, avisando a los agentes activos.

## 0. Decisiones adoptadas (respuestas asumidas de PLAN-V3.md §5)

| # | Decisión |
| --- | --- |
| 1 | Compra centralizada: gerencia consolida y compra para todos los locales. |
| 2 | Los proveedores reciben el pedido por WhatsApp. El sistema genera el texto; una persona lo envía. Sin API de WhatsApp. |
| 3 | Existe un depósito central. Se modela como local `Depósito` en CONFIG y CATALOGO. |
| 4 | Producción y Elaborados sólo para Trento Café. En los demás locales no aparecen; el backend se conserva. |
| 5 | Planilla nueva con migración. La actual queda como histórico de sólo lectura. |
| 6 | Precio y costo se guardan en cada fila desde el inicio. Reportes en pesos: después del corte. |
| 7 | Sin exportación a Excel en esta etapa. |
| 8 | Locales activos: Umo Grill, Trento Café, Brooklyn, Puerto Gelato, GreenFresh, Shopping, Eventos, Depósito. Pizzería se migra como inactivo. |

Cualquiera de estas decisiones puede cambiar si el usuario responde distinto; el
coordinador actualiza esta tabla y avisa.

### 0.1 Planillas de la Fase 0

| Rol | Nombre en Drive | ID |
| --- | --- | --- |
| Producción actual (no tocar hasta el corte) | Sistema_Pedidos_Polo_Gastronomico_COMPLETO | `1XYqcWbJzMLL3kRcbYnRUi_UVqRVbZpqSFYGLBov3wtE` |
| Respaldo congelado y origen de migración | RESPALDO 2026-10-18 · Sistema_Pedidos_Polo_Gastronomico (no editar) | `1Ln1nmvjTO7yBQLTIK-HAucAc3aXkxv8aCKlhXcfXA1c` |
| Destino V3 de pruebas (vacío) | Docks · Abastecimiento V3 (pruebas) | `1Jro4Ynb6n7otyaNsFWAi3QznYsWHuHf8EBPazY-_BpE` |

El respaldo se verificó con las 38 pestañas originales. `migrateV3()` lee sólo del
respaldo y escribe sólo en el destino de pruebas. Producción no se toca antes de la Fase 6.

## 1. Reglas transversales

- Una fila por hecho. Encabezados en fila 1, congelados, sin filas decorativas.
- Nombres de local canónicos en todas las pestañas. Alias viejos sólo en la migración.
- Toda escritura devuelve un ID; el cliente confirma leyendo ese ID.
- Escrituras de stock bajo `withStockMutationLock_`.
- Nunca convertir unidades. Nunca inventar un conteo cero.
- Propiedad de archivos por agente (PLAN-V3.md §3.2). Nadie edita archivos ajenos.

## 2. Nueva planilla: 9 pestañas

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

## 3. Migración (histórico → V3)

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

## 4. Contrato de API (Apps Script)

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

