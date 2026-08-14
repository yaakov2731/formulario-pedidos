/**
 * Sistema de Pedidos · Polo Gastronómico Docks del Puerto
 * Apps Script v2 — backend del formulario inteligente.
 *
 * Pegar este código en el editor de Apps Script ENLAZADO al Google Sheet maestro
 * (Extensiones > Apps Script), guardar, e Implementar > Nueva implementación >
 * Aplicación web > Ejecutar como: yo · Acceso: Cualquiera. Copiar la URL /exec
 * y pegarla en SCRIPT_URL dentro de index.html (si cambió).
 *
 * Endpoints:
 *   GET  ?action=getBootstrap  -> { ok, config, catalog }  (alimenta el form)
 *   GET  ?action=ping          -> { ok, status, version }
 *   GET  ?action=getElaboradosReport&local=...&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *   POST {json del pedido}      -> agrega fila en "PEDIDOS RECIBIDOS"
 *
 * Funciones manuales (correr una vez desde el editor):
 *   setupGreenFresh()  -> agrega GreenFresh a CATÁLOGO + CONFIGURACIÓN y desactiva Pizzería
 */

// ID de tu Google Sheet maestro (la plantilla actual). No hace falta cambiarlo.
var SHEET_ID = '1XYqcWbJzMLL3kRcbYnRUi_UVqRVbZpqSFYGLBov3wtE';

var SHEET_CATALOGO = 'CATÁLOGO PRODUCTOS';
var SHEET_CONFIG   = 'CONFIGURACIÓN';
var SHEET_PEDIDOS  = 'PEDIDOS RECIBIDOS';
var SHEET_DETALLE  = 'PEDIDOS_DETALLE';
var SHEET_RESUMEN  = 'RESUMEN POR PROVEEDOR';
var SHEET_STOCK    = 'CONTROL STOCK';
var SHEET_RECEPCION = 'CONTROL RECEPCION';
var SHEET_PRODUCCION = 'CONTROL PRODUCCION';
var SHEET_ELABORADOS = 'CONTEO ELABORADOS';
var SHEET_STOCK_DASH = 'DASHBOARD STOCK';
var SHEET_HOME     = 'INICIO OPERATIVO';
var SHEET_VIEW_PED = 'VISTA PEDIDOS';
var SHEET_VIEW_STK = 'VISTA STOCK';
var SHEET_VIEW_BUY = 'VISTA COMPRAS';
var SHEET_VIEW_REC = 'VISTA RECEPCION';
var SHEET_VIEW_PROD = 'VISTA PRODUCCION';
var SHEET_VIEW_ELAB = 'VISTA ELABORADOS';
var SHEET_REPORT_ELAB = 'REPORTE SOBRANTES';
var SHEET_LOCAL_PED_PREFIX = 'LOCAL PEDIDO · ';
var SHEET_LOCAL_STK_PREFIX = 'LOCAL STOCK · ';
var SHEET_TELEGRAM_LOG = 'LOG TELEGRAM';
var APP_VERSION = '2.3.3';
var PRINT_FONT_SIZE = 14;

var DETALLE_HEADERS = ['ID_Pedido','Fecha_Hora','Semana','Local','Encargado','Urgencia',
  'Código','Producto','Categoría','Cantidad','Unidad','Proveedor','Estado','Comprado','Entregado'];
var STOCK_HEADERS = ['ID_Conteo','Fecha_Hora','Local','Encargado','Tipo_Conteo','Código','Producto','Categoría',
  'Unidad','Stock_Real','Estado_Stock','Observaciones'];
var RECEPCION_HEADERS = ['ID_Recepcion','Fecha_Hora','Local','Encargado','Proveedor','Código','Producto','Categoría',
  'Unidad','Cantidad_Recibida','Estado','Observaciones'];
var PRODUCCION_HEADERS = ['ID_Produccion','Fecha_Hora','Local','Encargado','Producto_Elaborado','Lote','Código_Insumo',
  'Insumo','Categoría','Unidad','Cantidad_Usada','Cantidad_Producida','Estado','Observaciones'];
var ELABORADOS_HEADERS = ['ID_Conteo','Fecha_Hora','Local','Encargado','Turno','Código','Producto_Elaborado','Categoría',
  'Unidad','Cantidad','Estado','Destino','Observaciones'];
var PEDIDOS_HEADERS = ['ID_Pedido','Fecha_Hora','Local','Encargado','Semana_Pedido','Email_Encargado','Estado','Urgencia',
  'Productos_Solicitados','Total_Productos','Total_Estimado','Fecha_Entrega','Observaciones','Proveedor_Asignado',
  'Comprado','Entregado','Notas_Gerencia'];
var CATALOGO_HEADERS = ['Código','Producto','Descripción','Local_Aplicable','Categoría','Unidad_Medida',
  'Precio_Unitario','Proveedor','Stock_Actual','Stock_Mínimo','Estado','Fecha_Alta'];
var CONFIG_HEADERS = ['Local','Encargado','Email','Telefono','Horario','Activo'];
