/* Docks V3 · constantes. Contrato: docs/v3/CONTRATO.md §3.
 * Sólo literales a nivel superior: los archivos se cargan en cualquier orden. */

var V3_VERSION = 'v3';
// Planilla V3 usada cuando el script no está vinculado a una planilla y no hay propiedad SHEET_ID.
var V3_SHEET_ID_DEFAULT = '1Jro4Ynb6n7otyaNsFWAi3QznYsWHuHf8EBPazY-_BpE';
var V3_TZ = 'America/Argentina/Buenos_Aires';
var V3_LOCK_MS = 20000;

var SH_CATALOGO = 'CATALOGO';
var SH_PROVEEDORES = 'PROVEEDORES';
var SH_LOCALES = 'LOCALES';
var SH_PEDIDOS = 'PEDIDOS';
var SH_LINEAS = 'PEDIDO_LINEAS';
var SH_MOVIMIENTOS = 'MOVIMIENTOS';
var SH_COMPRAS = 'COMPRAS';
var SH_TABLERO = 'TABLERO';
var SH_LOG = 'LOG';

var V3_SHEET_ORDER = ['CATALOGO', 'PROVEEDORES', 'LOCALES', 'PEDIDOS', 'PEDIDO_LINEAS', 'MOVIMIENTOS', 'COMPRAS', 'TABLERO', 'LOG'];

var V3_HEADERS = {
  CATALOGO: ['Código', 'Producto', 'Local', 'Categoría', 'Unidad', 'Proveedor', 'Precio', 'Par', 'Stock_Actual', 'Ultimo_Conteo', 'Estado', 'Actualizado'],
  PROVEEDORES: ['Proveedor', 'Contacto', 'WhatsApp', 'Email', 'Dias_Entrega', 'Pedido_Minimo', 'Activo', 'Observaciones'],
  LOCALES: ['Local', 'Activo', 'Encargados', 'Dia_Pedido', 'Hora_Corte', 'Prefijo_Codigo', 'Observaciones'],
  PEDIDOS: ['ID_Pedido', 'Fecha_Hora', 'Semana', 'Local', 'Encargado', 'Prioridad', 'Fecha_Entrega', 'Notas', 'Lineas', 'Estado'],
  PEDIDO_LINEAS: ['ID_Linea', 'ID_Pedido', 'Fecha_Hora', 'Semana', 'Local', 'Código', 'Producto', 'Categoría', 'Unidad', 'Cantidad', 'Proveedor', 'Precio_Ref', 'Estado', 'ID_OC', 'Cantidad_Recibida', 'Fecha_Recepcion', 'ID_Recepcion', 'Observaciones'],
  MOVIMIENTOS: ['Fecha_Hora', 'ID_Operacion', 'Tipo', 'Local', 'Encargado', 'Código', 'Producto', 'Unidad', 'Cantidad', 'Saldo_Anterior', 'Saldo_Resultante', 'Costo_Unitario', 'Referencia', 'Observaciones'],
  COMPRAS: ['ID_OC', 'Fecha_Hora', 'Semana', 'Proveedor', 'Locales', 'Estado', 'Lineas', 'Total_Estimado', 'Responsable', 'Texto_WhatsApp', 'Observaciones'],
  LOG: ['Fecha_Hora', 'Tipo', 'Referencia', 'Local', 'OK', 'Detalle']
};

/* Columnas que se guardan como texto plano (formato '@') para que la planilla no las convierta. */
var V3_TEXT_COLUMNS = {
  CATALOGO: ['Código', 'Ultimo_Conteo', 'Actualizado'],
  PROVEEDORES: ['WhatsApp', 'Dias_Entrega'],
  LOCALES: ['Hora_Corte', 'Prefijo_Codigo'],
  PEDIDOS: ['ID_Pedido', 'Fecha_Hora', 'Semana', 'Fecha_Entrega'],
  PEDIDO_LINEAS: ['ID_Linea', 'ID_Pedido', 'Fecha_Hora', 'Semana', 'Código', 'ID_OC', 'Fecha_Recepcion', 'ID_Recepcion'],
  MOVIMIENTOS: ['Fecha_Hora', 'ID_Operacion', 'Código', 'Referencia'],
  COMPRAS: ['ID_OC', 'Fecha_Hora', 'Semana'],
  LOG: ['Fecha_Hora', 'Referencia']
};

var V3_UNIDADES = ['kg', 'g', 'litro', 'ml', 'unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];
var V3_CONTABLES = ['unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];

var EST_PROD = ['Activo', 'Inactivo'];
var SI_NO = ['SÍ', 'NO'];
var PRIORIDADES = ['Normal', 'Urgente'];
var EST_PEDIDO = ['Pendiente', 'En compra', 'Cerrado'];
var EST_LINEA = ['Pendiente', 'Comprado', 'Entregado', 'Incompleto', 'Cancelado'];
var TIPOS_MOV = ['CONTEO', 'RECEPCION', 'AJUSTE'];
var EST_OC = ['Enviada', 'Recibida parcial', 'Recibida', 'Cancelada'];
var DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
var V3_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* Semilla de LOCALES (§3.2): [Local, Prefijo_Codigo, Activo]. */
var LOCALES_SEMILLA = [
  ['Umo Grill', 'UMO', 'SÍ'],
  ['Trento Café', 'TRE', 'SÍ'],
  ['Brooklyn', 'BRK', 'SÍ'],
  ['Puerto Gelato', 'GEL', 'SÍ'],
  ['GreenFresh', 'GRF', 'SÍ'],
  ['Shopping', 'SHP', 'SÍ'],
  ['Eventos', 'EVT', 'SÍ'],
  ['Depósito', 'DEP', 'SÍ'],
  ['Pizzería', 'PIZ', 'NO']
];

/* IDs de operación generados por el cliente (Docks.ids.nuevo). */
var V3_ID_RE = /^[A-Z]{2,4}-\d{8}-\d{6}-[a-z0-9]{4}$/;
var V3_SIN_PEDIDO = 'SIN PEDIDO';
