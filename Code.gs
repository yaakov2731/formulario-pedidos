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

/* ============================== WEB API ============================== */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'getBootstrap') {
      return json(getBootstrapPayload_((e && e.parameter && e.parameter.scope) || 'full'));
    }
    if (action === 'parseReceiptTextAi') {
      return json(parseReceiptTextAi_(
        (e && e.parameter && e.parameter.local) || '',
        (e && e.parameter && e.parameter.text) || ''
      ));
    }
    if (action === 'getPedidoStatus') {
      return json(getPedidoStatus_((e && e.parameter && e.parameter.id_pedido) || ''));
    }
    if (action === 'getOperationStatus') {
      return json(getOperationStatus_(
        (e && e.parameter && e.parameter.type) || '',
        (e && e.parameter && e.parameter.id) || ''
      ));
    }
    if (action === 'getTelegramStatus') {
      return json(getTelegramStatus_());
    }
    if (action === 'getElaboradosReport') {
      return json(getElaboradosReport_(
        (e && e.parameter && e.parameter.local) || '',
        (e && e.parameter && e.parameter.desde) || '',
        (e && e.parameter && e.parameter.hasta) || ''
      ));
    }
    if (action === 'getCatalogProductStatus') {
      return json(getCatalogProductStatus_(
        (e && e.parameter && e.parameter.local) || '',
        (e && e.parameter && e.parameter.codigo) || '',
        (e && e.parameter && e.parameter.nombre) || ''
      ));
    }
    if (action === 'refreshElaboradosReportSheet') {
      return json(refreshElaboradosReportSheet());
    }
    return json({ ok: true, status: 'online', version: APP_VERSION, capabilities: appCapabilities_() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'addProducto')   { return json(addProductoCatalogo_(data)); }
    if (data.action === 'updateProducto'){ return json(updateProductoCatalogo_(data)); }
    if (data.action === 'addResponsable'){ return json(addResponsableConfig_(data)); }
    if (data.action === 'saveStock')     { return json(saveStockConteo_(data)); }
    if (data.action === 'saveReception') { return json(saveRecepcion_(data)); }
    if (data.action === 'saveProduction'){ return json(saveProduccion_(data)); }
    if (data.action === 'saveElaborados'){ return json(saveElaboradosConteo_(data)); }
    return json(savePedido_(data));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* Prefijo de código por local (para autogenerar Código en el catálogo). */
var LOCAL_PREFIX = {
  'Parrilla': 'PAR', 'Umo Grill': 'PAR', 'GreenFresh': 'GRE',
  'Heladería': 'HEL', 'Heladeria': 'HEL', 'Puerto Gelato': 'HEL',
  'Cafetería': 'CAF', 'Cafeteria': 'CAF', 'Trento Café': 'CAF', 'Trento Cafe': 'CAF',
  'Brooklyn': 'HAM', 'Hamburguesería': 'HAM',
  'Eventos': 'EVE', 'Shopping': 'SHO'
};
function prefixFor_(local) {
  local = normalizeLocalName_(local);
  if (LOCAL_PREFIX[local]) return LOCAL_PREFIX[local];
  return (String(local).replace(/[^A-Za-zÁÉÍÓÚÑ]/g, '').toUpperCase() + 'XXX').slice(0, 3);
}

/* Agrega un producto al CATÁLOGO con código autogenerado. */
function addProductoCatalogo_(d) {
  if (!d.local || !d.nombre) return { ok: false, error: 'Faltan local o nombre' };
  d.local = normalizeLocalName_(d.local);
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) return { ok: false, error: 'Falta hoja ' + SHEET_CATALOGO };
  var values = sh.getDataRange().getValues();
  if (!values.length) return { ok: false, error: 'El catálogo no tiene encabezados' };
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod = idx_(head, ['código', 'codigo']);
  var iNom = idx_(head, ['producto', 'nombre']);
  var iDesc = idx_(head, ['descripción', 'descripcion']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  var iCat = idx_(head, ['categoría', 'categoria']);
  var iUni = idx_(head, ['unidad_medida', 'unidad']);
  var iProv = idx_(head, ['proveedor']);
  var iEstado = idx_(head, ['estado']);
  var iFecha = idx_(head, ['fecha', 'fecha_alta']);
  if (iCod < 0 || iNom < 0 || iLocal < 0) {
    return { ok: false, error: 'No encuentro las columnas Código, Producto y Local en el catálogo' };
  }

  var prefix = prefixFor_(d.local);
  var maxNum = 0;
  for (var r = 1; r < values.length; r++) {
    var rowLocal = normalizeLocalName_(values[r][iLocal]);
    var rowName = String(values[r][iNom] || '').trim();
    if (rowLocal === d.local && normalizeLooseText_(rowName) === normalizeLooseText_(d.nombre)) {
      return { ok: true, codigo: String(values[r][iCod] || ''), existing: true, nombre: rowName };
    }
    var cod = String(values[r][iCod] || '').trim();
    if (cod.indexOf(prefix) === 0) {
      var num = parseInt(cod.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  var codigo = prefix + ('000' + (maxNum + 1)).slice(-3);
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  var newRow = new Array(values[0].length).fill('');
  newRow[iCod] = codigo;
  newRow[iNom] = String(d.nombre).trim();
  newRow[iLocal] = d.local;
  if (iDesc > -1) newRow[iDesc] = d.descripcion || '';
  if (iCat > -1) newRow[iCat] = d.categoria || 'General';
  if (iUni > -1) newRow[iUni] = d.unidad || 'unidad';
  if (iProv > -1) newRow[iProv] = d.proveedor || '';
  if (iEstado > -1) newRow[iEstado] = 'Disponible';
  if (iFecha > -1) newRow[iFecha] = hoy;
  sh.getRange(sh.getLastRow() + 1, 1, 1, newRow.length).setValues([newRow]);
  invalidateBootstrapCaches_();
  return { ok: true, codigo: codigo, nombre: String(d.nombre).trim(), local: d.local };
}

function getCatalogProductStatus_(local, codigo, nombre) {
  local = normalizeLocalName_(local);
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) return { ok: false, error: 'Falta hoja ' + SHEET_CATALOGO, found: false };
  var values = sh.getDataRange().getValues();
  if (!values.length) return { ok: false, error: 'El catálogo no tiene encabezados', found: false };
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod = idx_(head, ['código', 'codigo']);
  var iNom = idx_(head, ['producto', 'nombre']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  var iCat = idx_(head, ['categoría', 'categoria']);
  var iUni = idx_(head, ['unidad_medida', 'unidad']);
  var iProv = idx_(head, ['proveedor']);
  if (iCod < 0 || iNom < 0 || iLocal < 0) {
    return { ok: false, error: 'No encuentro las columnas principales del catálogo', found: false };
  }
  var wantedCode = String(codigo || '').trim();
  var wantedName = normalizeLooseText_(nombre);
  var localCount = 0;
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (normalizeLocalName_(row[iLocal]) !== local) continue;
    localCount++;
    var rowCode = String(row[iCod] || '').trim();
    var rowName = String(row[iNom] || '').trim();
    if ((wantedCode && rowCode === wantedCode) || (wantedName && normalizeLooseText_(rowName) === wantedName)) {
      return {
        ok: true,
        found: true,
        local: local,
        local_count: localCount,
        product: {
          codigo: rowCode,
          nombre: rowName,
          categoria: iCat > -1 ? String(row[iCat] || '') : '',
          unidad: iUni > -1 ? String(row[iUni] || 'unidad') : 'unidad',
          proveedor: iProv > -1 ? String(row[iProv] || '') : ''
        }
      };
    }
  }
  return { ok: true, found: false, local: local, local_count: localCount };
}

/* Corrige el nombre de un producto ya existente en el catálogo. */
function updateProductoCatalogo_(d) {
  if (!d.codigo || !d.nombre) return { ok: false, error: 'Faltan código o nombre' };
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) return { ok: false, error: 'Falta hoja ' + SHEET_CATALOGO };
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: false, error: 'El catálogo está vacío' };

  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod = idx_(head, ['código', 'codigo']);
  var iNom = idx_(head, ['producto', 'nombre']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  if (iCod < 0 || iNom < 0) return { ok: false, error: 'No encuentro columnas de código y producto' };

  var wantedCode = String(d.codigo).trim();
  var wantedLocal = normalizeLocalName_(d.local || '');
  var newName = String(d.nombre).trim();

  for (var r = 1; r < values.length; r++) {
    var rowCode = String(values[r][iCod] || '').trim();
    var rowLocal = iLocal > -1 ? normalizeLocalName_(values[r][iLocal]) : '';
    if (rowCode !== wantedCode) continue;
    if (wantedLocal && rowLocal && rowLocal !== wantedLocal) continue;
    sh.getRange(r + 1, iNom + 1).setValue(newName);
    invalidateBootstrapCaches_();
    return { ok: true, codigo: wantedCode, nombre: newName };
  }

  return { ok: false, error: 'No encontré el producto a actualizar' };
}

/* Agrega un responsable/encargado a CONFIGURACIÓN. */
function addResponsableConfig_(d) {
  if (!d.local || !d.nombre) return { ok: false, error: 'Faltan local o nombre' };
  d.local = normalizeLocalName_(d.local);
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return { ok: false, error: 'Falta hoja ' + SHEET_CONFIG };
  var values = sh.getDataRange().getValues();
  var headerRow = -1, cLocal = 0;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) { headerRow = r; cLocal = low.indexOf('local'); break; }
  }
  if (headerRow === -1) return { ok: false, error: 'No encuentro el bloque de encargados' };
  // encontrar dónde termina el bloque (primera fila vacía en columna Local)
  var insertAt = headerRow + 2;
  for (var k = headerRow + 1; k < values.length; k++) {
    if (!String(values[k][cLocal] || '').trim()) { insertAt = k + 1; break; }
    insertAt = k + 2;
  }
  sh.insertRowBefore(insertAt);
  sh.getRange(insertAt, 1, 1, 6).setValues([[d.local, d.nombre, d.email || '', d.telefono || '', d.horario || '', 'SÍ']]);
  invalidateBootstrapCaches_();
  return { ok: true };
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBootstrapPayload_(scope) {
  scope = String(scope || 'full').trim().toLowerCase() === 'ops' ? 'ops' : 'full';
  var cache = CacheService.getScriptCache();
  var cacheKey = 'bootstrap:' + scope;
  try {
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {}

  var payload = {
    ok: true,
    version: APP_VERSION,
    capabilities: appCapabilities_(),
    recepciones: readRecepcionResumen_(),
    produccion: readProduccionResumen_(),
    elaborados: readElaboradosResumen_(),
    snapshot: buildFrontendOperationalSnapshot_()
  };

  if (scope !== 'ops') {
    var configBundle = readConfigBundle_();
    payload.config = configBundle.config;
    payload.responsables = configBundle.responsables;
    payload.catalog = readCatalog_();
  }

  try {
    cache.put(cacheKey, JSON.stringify(payload), scope === 'ops' ? 20 : 45);
  } catch (err) {}
  return payload;
}

function invalidateBootstrapCaches_() {
  try {
    CacheService.getScriptCache().removeAll(['bootstrap:full', 'bootstrap:ops']);
  } catch (err) {}
}

function appCapabilities_() {
  var telegram = getTelegramSettings_();
  var openai = getOpenAiSettings_();
  return {
    pedido: true,
    stock: true,
    recepcion: true,
    produccion: true,
    elaborados: true,
    elaborados_report: true,
    catalog_product_status: true,
    sheet_report_elaborados: true,
    dashboard_v2: true,
    local_alias_normalization: true,
    movement_views: true,
    bootstrap_v2: true,
    pedido_status: true,
    operation_status: true,
    telegram_notify: telegram.enabled,
    receipt_ai_parse: openai.enabled
  };
}

function savePedido_(data) {
  appendPedido_(data);
  appendDetalle_(data, { skipRefresh: true });   // capa normalizada: 1 fila por producto
  var telegram = notifyTelegramForPedido_(data);
  refreshOperationalViews_();
  invalidateBootstrapCaches_();
  return {
    ok: true,
    id_pedido: data.id_pedido || '',
    telegram: telegram
  };
}

function getPedidoStatus_(pedidoId) {
  pedidoId = String(pedidoId || '').trim();
  if (!pedidoId) return { ok: false, error: 'Falta id_pedido' };
  var pedido = findPedidoRowById_(pedidoId);
  var detalle = findDetalleRowsByPedidoId_(pedidoId);
  var telegram = readTelegramLogByPedido_(pedidoId);
  return {
    ok: true,
    found: !!pedido,
    id_pedido: pedidoId,
    pedido: pedido ? {
      fecha_hora: pedido[1] || '',
      local: pedido[2] || '',
      encargado: pedido[3] || '',
      semana: pedido[4] || '',
      estado: pedido[6] || ''
    } : null,
    detalle_count: detalle.length,
    telegram: telegram
  };
}

function getOperationStatus_(type, operationId) {
  type = String(type || '').trim().toLowerCase();
  operationId = String(operationId || '').trim();
  if (!operationId) return { ok: false, error: 'Falta id de operación' };

  var sheetName = '';
  if (type === 'stock') sheetName = SHEET_STOCK;
  if (type === 'reception' || type === 'recepcion') sheetName = SHEET_RECEPCION;
  if (type === 'production' || type === 'produccion') sheetName = SHEET_PRODUCCION;
  if (type === 'elaborados') sheetName = SHEET_ELABORADOS;
  if (!sheetName) return { ok: false, error: 'Tipo de operación inválido' };

  var sh = ss_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) {
    return { ok: true, found: false, type: type, id: operationId, rows: 0 };
  }
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
  var rows = 0;
  for (var r = 0; r < ids.length; r++) {
    if (String(ids[r][0] || '').trim() === operationId) rows++;
  }
  return {
    ok: true,
    found: rows > 0,
    type: type,
    id: operationId,
    rows: rows,
    telegram: readTelegramLogByPedido_(operationId)
  };
}

/* ============================== READ CATALOG ============================== */

function readCatalog_() {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) return {};
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return {};
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod   = idx_(head, ['código', 'codigo']);
  var iNom   = idx_(head, ['producto', 'nombre']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  var iCat   = idx_(head, ['categoría', 'categoria']);
  var iUni   = idx_(head, ['unidad_medida', 'unidad']);
  var iPre   = idx_(head, ['precio_unitario', 'precio']);
  var iProv  = idx_(head, ['proveedor']);
  var iStock = idx_(head, ['stock_actual', 'stock actual']);
  var iMin   = idx_(head, ['stock_mínimo', 'stock_minimo', 'stock mínimo', 'stock minimo']);
  var iEstado = idx_(head, ['estado']);

  var out = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var local = normalizeLocalName_(row[iLocal]);
    var nombre = String(row[iNom] || '').trim();
    if (!local || !nombre) continue;
    var estado = iEstado > -1 ? String(row[iEstado] || '').toLowerCase() : '';
    if (estado.indexOf('inactiv') > -1 || estado.indexOf('baja') > -1) continue; // omitir desactivados
    if (!out[local]) out[local] = [];
    out[local].push({
      codigo:    iCod  > -1 ? String(row[iCod]  || '').trim() : '',
      nombre:    nombre,
      unidad:    iUni  > -1 ? String(row[iUni]  || 'unidad').trim() : 'unidad',
      proveedor: iProv > -1 ? String(row[iProv] || '').trim() : '',
      precio:    iPre  > -1 ? (parseFloat(row[iPre]) || 0) : 0,
      categoria: iCat  > -1 ? String(row[iCat]  || '').trim() : '',
      stock_actual: iStock > -1 ? numberOrBlank_(row[iStock]) : '',
      stock_minimo: iMin > -1 ? numberOrBlank_(row[iMin]) : ''
    });
  }
  return out;
}

/* ============================== READ CONFIG (encargados) ============================== */

function readConfig_() {
  return readConfigBundle_().config;
}

/* Todos los responsables por local (para la pantalla de Configuración). */
function readResponsables_() {
  return readConfigBundle_().responsables;
}

function readConfigBundle_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return { config: {}, responsables: {} };
  var values = sh.getDataRange().getValues();
  var config = {}, responsables = {}, start = -1, cLocal = 0, cEnc = 1, cEmail = 2, cAct = -1;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) {
      start = r + 1; cLocal = low.indexOf('local'); cEnc = low.indexOf('encargado'); cEmail = low.indexOf('email'); cAct = low.indexOf('activo'); break;
    }
  }
  if (start === -1) return { config: {}, responsables: {} };
  for (var i = start; i < values.length; i++) {
    var local = normalizeLocalName_(values[i][cLocal]);
    if (!local) break;
    if (local.charAt(0) === '🔧' || local.charAt(0) === '🔗') break;
    if (cAct > -1 && !isActiveFlag_(values[i][cAct])) continue;
    var responsable = {
      nombre: cEnc   > -1 ? String(values[i][cEnc]   || '').trim() : '',
      email:  cEmail > -1 ? String(values[i][cEmail] || '').trim() : ''
    };
    if (!config[local]) config[local] = { enc: responsable.nombre, email: responsable.email };
    if (!responsables[local]) responsables[local] = [];
    responsables[local].push(responsable);
  }
  return { config: config, responsables: responsables };
}

/* ============================== WRITE PEDIDO ============================== */

function appendPedido_(d) {
  var sh = ss_().getSheetByName(SHEET_PEDIDOS);
  if (!sh) throw new Error('No existe la hoja "' + SHEET_PEDIDOS + '"');
  d.local = normalizeLocalName_(d.local);
  // Mismo orden de 17 columnas que ya usa la hoja.
  var row = [
    d.id_pedido || '',
    d.fecha_hora || new Date().toLocaleString('es-AR'),
    d.local || '',
    d.encargado || '',
    d.semana_pedido || '',
    d.email_encargado || '',
    d.estado || 'Recibido',
    d.urgencia || 'Normal',
    d.productos_solicitados || '',
    d.total_productos || 0,
    d.total_estimado || '',
    d.fecha_entrega || '',
    d.observaciones || '',
    d.proveedor_asignado || '',
    d.comprado || 'NO',
    d.entregado || 'NO',
    d.notas_gerencia || ''
  ];
  sh.appendRow(row);
}

/* ============================== DETALLE NORMALIZADO ============================== */

/** Escribe 1 fila por producto en PEDIDOS_DETALLE. La crea si no existe. */
function appendDetalle_(d, opts) {
  if (!d.items || !d.items.length) return;
  opts = opts || {};
  var sh = ss_().getSheetByName(SHEET_DETALLE) || createDetalleSheet_();
  d.local = normalizeLocalName_(d.local);
  var hoy = d.fecha_hora || new Date().toLocaleString('es-AR');
  var rows = d.items.map(function (it) {
    return [
      d.id_pedido || '', hoy, d.semana_pedido || '', d.local || '', d.encargado || '', d.urgencia || 'Normal',
      it.codigo || '', it.producto || '', it.categoria || (it.libre ? 'Sin categoría' : ''),
      Number(it.cantidad) || it.cantidad || '', it.unidad || '', it.proveedor || '',
      'Pendiente', 'NO', 'NO'
    ];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, DETALLE_HEADERS.length).setValues(rows);
  if (!opts.skipRefresh) refreshOperationalViews_();
}

function findPedidoRowById_(pedidoId) {
  var sh = ss_().getSheetByName(SHEET_PEDIDOS);
  if (!sh || sh.getLastRow() < 1) return null;
  var values = sh.getDataRange().getValues();
  var firstDataRow = 0;
  if (values.length) {
    var firstCell = String(values[0][0] || '').trim().toUpperCase();
    if (firstCell === 'ID_PEDIDO') firstDataRow = 1;
  }
  for (var r = values.length - 1; r >= firstDataRow; r--) {
    if (String(values[r][0] || '').trim() === pedidoId) return values[r];
  }
  return null;
}

function findDetalleRowsByPedidoId_(pedidoId) {
  var sh = ss_().getSheetByName(SHEET_DETALLE);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][0] || '').trim() === pedidoId) out.push(values[r]);
  }
  return out;
}

function createDetalleSheet_() {
  var ss = ss_();
  var sh = ss.insertSheet(SHEET_DETALLE);
  formatDetalleSheet_(sh);
  return sh;
}

function formatDetalleSheet_(sh) {
  sh.getRange(1, 1, 1, DETALLE_HEADERS.length).setValues([DETALLE_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f5e7a').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);
  var widths = [90, 140, 150, 110, 120, 90, 80, 200, 120, 80, 90, 160, 100, 90, 90];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
  // Validación: Estado, Comprado, Entregado
  applyList_(sh, 13, ['Pendiente', 'Comprado', 'Entregado', 'Cancelado']);
  applyList_(sh, 14, ['NO', 'SÍ']);
  applyList_(sh, 15, ['NO', 'SÍ']);
  // Formato condicional por urgencia (col F=6) y comprado (N=14)
  var rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Urgente').setBackground('#fde1e1').setFontColor('#a01b1b')
    .setRanges([sh.getRange('F2:F')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('SÍ').setBackground('#d9f2e3').setFontColor('#1b6b3a')
    .setRanges([sh.getRange('N2:N'), sh.getRange('O2:O')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Comprado').setBackground('#d9f2e3').setFontColor('#1b6b3a')
    .setRanges([sh.getRange('M2:M')]).build());
  sh.setConditionalFormatRules(rules);
}

function applyList_(sh, col, vals) {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(vals, true).setAllowInvalid(false).build();
  sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(rule);
}

/* ============================== CONTROL STOCK ============================== */

function saveStockConteo_(d) {
  if (!d.local) return { ok: false, error: 'Falta local' };
  if (!d.items || !d.items.length) return { ok: false, error: 'Faltan productos de stock' };
  d.local = normalizeLocalName_(d.local);

  var rows = [];
  var conteoId = d.id_stock || ('STK' + new Date().getTime().toString().slice(-6));
  var fechaHora = d.fecha_hora || new Date().toLocaleString('es-AR');
  var tipoConteo = d.tipo_conteo || 'Conteo parcial';

  d.items.forEach(function (it) {
    var actual = numberOrNull_(it.stock_actual);
    if (actual === null) return;
    rows.push([
      conteoId,
      fechaHora,
      d.local,
      d.encargado || '',
      tipoConteo,
      it.codigo || '',
      it.producto || '',
      it.categoria || '',
      it.unidad || '',
      actual,
      estadoStock_(actual),
      d.observaciones || it.observaciones || ''
    ]);
  });

  if (!rows.length) return { ok: false, error: 'No hay valores de stock para guardar' };

  var sh = ss_().getSheetByName(SHEET_STOCK) || createStockSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, STOCK_HEADERS.length).setValues(rows);
  updateCatalogStock_(d.local, d.items, fechaHora, tipoConteo);
  if (d.rebuild_views) refreshStockViews_();
  var telegram = notifyTelegramForStock_({
    id_stock: conteoId,
    fecha_hora: fechaHora,
    local: d.local,
    encargado: d.encargado || '',
    tipo_conteo: tipoConteo,
    observaciones: d.observaciones || '',
    items: d.items
  });
  invalidateBootstrapCaches_();
  return { ok: true, id_stock: conteoId, rows: rows.length, telegram: telegram };
}

function createStockSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_STOCK) || ss.insertSheet(SHEET_STOCK);
  formatStockSheet_(sh);
  return sh;
}

function formatStockSheet_(sh) {
  sh.clear();
  sh.getRange(1, 1, 1, STOCK_HEADERS.length).setValues([STOCK_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0f5e7a').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);
  var widths = [100, 145, 120, 160, 110, 90, 220, 120, 90, 95, 110, 240];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
  var rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Sin stock').setBackground('#fde1e1').setFontColor('#a01b1b')
    .setRanges([sh.getRange('K2:K')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Disponible').setBackground('#d9f2e3').setFontColor('#1b6b3a')
    .setRanges([sh.getRange('K2:K')]).build());
  sh.setConditionalFormatRules(rules);
}

function updateCatalogStock_(local, items, fechaHora, tipoConteo) {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) return;

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod   = idx_(head, ['código', 'codigo']);
  var iNom   = idx_(head, ['producto', 'nombre']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  var iStock = idx_(head, ['stock_actual', 'stock actual']);
  var iFecha = idx_(head, ['fecha']);
  var iNotas = idx_(head, ['notas']);

  if (iLocal === -1 || iStock === -1) return;

  var itemMap = {};
  items.forEach(function (it) {
    var actual = numberOrNull_(it.stock_actual);
    if (actual === null) return;
    var keyByCode = String(local).trim().toLowerCase() + '||' + String(it.codigo || '').trim().toLowerCase();
    var keyByName = String(local).trim().toLowerCase() + '||' + String(it.producto || '').trim().toLowerCase();
    itemMap[keyByCode] = { stock: actual, fecha: fechaHora, notas: tipoConteo + ' desde formulario' };
    itemMap[keyByName] = { stock: actual, fecha: fechaHora, notas: tipoConteo + ' desde formulario' };
  });

  var changedStock = false;
  var changedFecha = false;
  var changedNotas = false;
  var changedRows = [];
  for (var r = 1; r < values.length; r++) {
    var rowLocal = String(values[r][iLocal] || '').trim().toLowerCase();
    var rowCode = iCod > -1 ? String(values[r][iCod] || '').trim().toLowerCase() : '';
    var rowName = iNom > -1 ? String(values[r][iNom] || '').trim().toLowerCase() : '';
    var rec = itemMap[rowLocal + '||' + rowCode] || itemMap[rowLocal + '||' + rowName];
    if (!rec) continue;
    changedRows.push(r + 1);
    values[r][iStock] = rec.stock;
    changedStock = true;
    if (iFecha > -1) {
      values[r][iFecha] = rec.fecha;
      changedFecha = true;
    }
    if (iNotas > -1) {
      values[r][iNotas] = rec.notas;
      changedNotas = true;
    }
  }
  applyCatalogColumnUpdates_(sh, values, changedRows, iStock, iFecha, iNotas, changedStock, changedFecha, changedNotas);
}

function saveRecepcion_(d) {
  if (!d.local) return { ok: false, error: 'Falta local' };
  if (!d.items || !d.items.length) return { ok: false, error: 'Faltan productos recibidos' };
  d.local = normalizeLocalName_(d.local);

  var recepcionId = d.id_recepcion || ('REC' + new Date().getTime().toString().slice(-6));
  var fechaHora = d.fecha_hora || new Date().toLocaleString('es-AR');
  var rows = [];

  d.items.forEach(function (it) {
    var cantidad = numberOrNull_(it.cantidad_recibida);
    if (cantidad === null || cantidad <= 0) return;
    rows.push([
      recepcionId,
      fechaHora,
      d.local,
      d.encargado || '',
      it.proveedor || d.proveedor || '',
      it.codigo || '',
      it.producto || '',
      it.categoria || '',
      it.unidad || 'unidad',
      cantidad,
      'Recepcionado',
      d.observaciones || it.observaciones || ''
    ]);
  });

  if (!rows.length) return { ok: false, error: 'No hay cantidades recibidas para guardar' };

  var sh = ss_().getSheetByName(SHEET_RECEPCION) || createRecepcionSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, RECEPCION_HEADERS.length).setValues(rows);
  if (d.update_catalog_stock !== false) addReceivedStockToCatalog_(d.local, d.items, fechaHora);
  if (d.rebuild_views !== false) refreshMovementViews_();
  invalidateBootstrapCaches_();
  return { ok: true, id_recepcion: recepcionId, rows: rows.length };
}

function saveProduccion_(d) {
  if (!d.local) return { ok: false, error: 'Falta local' };
  if (!d.items || !d.items.length) return { ok: false, error: 'Faltan insumos de producción' };
  d.local = normalizeLocalName_(d.local);

  var produccionId = d.id_produccion || ('PROD' + new Date().getTime().toString().slice(-6));
  var fechaHora = d.fecha_hora || new Date().toLocaleString('es-AR');
  var rows = [];

  d.items.forEach(function (it) {
    var cantidadUsada = numberOrNull_(it.cantidad_usada);
    if (cantidadUsada === null || cantidadUsada <= 0) return;
    rows.push([
      produccionId,
      fechaHora,
      d.local,
      d.encargado || '',
      d.producto_elaborado || it.producto_elaborado || '',
      d.lote || '',
      it.codigo || '',
      it.insumo || it.producto || '',
      it.categoria || '',
      it.unidad || 'unidad',
      cantidadUsada,
      numberOrZero_(d.cantidad_producida, 0),
      'Producido',
      d.observaciones || it.observaciones || ''
    ]);
  });

  if (!rows.length) return { ok: false, error: 'No hay cantidades usadas para guardar' };

  var sh = ss_().getSheetByName(SHEET_PRODUCCION) || createProduccionSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, PRODUCCION_HEADERS.length).setValues(rows);
  descontarProduccionDelCatalogo_(d.local, d.items, fechaHora, d.producto_elaborado || '');
  if (d.rebuild_views !== false) refreshMovementViews_();
  invalidateBootstrapCaches_();
  return { ok: true, id_produccion: produccionId, rows: rows.length };
}

function saveElaboradosConteo_(d) {
  if (!d.local) return { ok: false, error: 'Falta local' };
  if (!d.items || !d.items.length) return { ok: false, error: 'Faltan elaborados para guardar' };
  d.local = normalizeLocalName_(d.local);

  var conteoId = d.id_conteo || ('ELA' + new Date().getTime().toString().slice(-6));
  var fechaHora = d.fecha_hora || new Date().toLocaleString('es-AR');
  var rows = [];

  d.items.forEach(function (it) {
    var cantidad = numberOrNull_(it.cantidad);
    if (cantidad === null || cantidad <= 0) return;
    rows.push([
      conteoId,
      fechaHora,
      d.local,
      d.encargado || '',
      d.turno || '',
      it.codigo || '',
      it.producto_elaborado || it.producto || '',
      it.categoria || '',
      it.unidad || 'unidad',
      cantidad,
      it.estado || d.estado || 'Sobrante',
      it.destino || d.destino || 'Revisar',
      d.observaciones || it.observaciones || ''
    ]);
  });

  if (!rows.length) return { ok: false, error: 'No hay cantidades de elaborados para guardar' };

  var sh = ss_().getSheetByName(SHEET_ELABORADOS) || createElaboradosSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ELABORADOS_HEADERS.length).setValues(rows);
  try { buildReporteSobrantes_(); } catch (reportErr) {}
  if (d.rebuild_views !== false) refreshMovementViews_();
  var telegram = notifyTelegramForElaborados_({
    id_conteo: conteoId,
    fecha_hora: fechaHora,
    local: d.local,
    encargado: d.encargado || '',
    turno: d.turno || '',
    estado: d.estado || 'Sobrante',
    destino: d.destino || 'Revisar',
    observaciones: d.observaciones || '',
    items: d.items
  });
  invalidateBootstrapCaches_();
  return { ok: true, id_conteo: conteoId, rows: rows.length, telegram: telegram };
}

function createRecepcionSheet_() {
  var sh = ss_().getSheetByName(SHEET_RECEPCION) || ss_().insertSheet(SHEET_RECEPCION);
  formatRecepcionSheet_(sh);
  return sh;
}

function createProduccionSheet_() {
  var sh = ss_().getSheetByName(SHEET_PRODUCCION) || ss_().insertSheet(SHEET_PRODUCCION);
  formatProduccionSheet_(sh);
  return sh;
}

function createElaboradosSheet_() {
  var sh = ss_().getSheetByName(SHEET_ELABORADOS) || ss_().insertSheet(SHEET_ELABORADOS);
  formatElaboradosSheet_(sh);
  return sh;
}

function formatRecepcionSheet_(sh) {
  sh.clear();
  sh.getRange(1, 1, 1, RECEPCION_HEADERS.length).setValues([RECEPCION_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0F5E7A').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);
  var widths = [100, 145, 120, 150, 160, 90, 220, 120, 90, 110, 110, 240];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
}

function formatProduccionSheet_(sh) {
  sh.clear();
  sh.getRange(1, 1, 1, PRODUCCION_HEADERS.length).setValues([PRODUCCION_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#1F6E5A').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);
  var widths = [105, 145, 120, 150, 180, 100, 90, 200, 120, 90, 110, 120, 110, 240];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
}

function formatElaboradosSheet_(sh) {
  sh.clear();
  sh.getRange(1, 1, 1, ELABORADOS_HEADERS.length).setValues([ELABORADOS_HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#7A4A22').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 30);
  var widths = [105, 145, 120, 150, 100, 90, 220, 120, 90, 95, 110, 120, 240];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
}

function addReceivedStockToCatalog_(local, items, fechaHora) {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh || sh.getLastRow() < 2) return;
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod = idx_(head, ['código', 'codigo']);
  var iNom = idx_(head, ['producto', 'nombre']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  var iStock = idx_(head, ['stock_actual', 'stock actual']);
  var iFecha = idx_(head, ['fecha']);
  var iNotas = idx_(head, ['notas']);
  if (iLocal === -1 || iStock === -1) return;

  var map = {};
  items.forEach(function (it) {
    var qty = numberOrNull_(it.cantidad_recibida);
    if (qty === null || qty <= 0) return;
    map[keyFor_(local, it.codigo, it.producto)] = qty;
  });

  var changedStock = false;
  var changedFecha = false;
  var changedNotas = false;
  var changedRows = [];
  for (var r = 1; r < values.length; r++) {
    var key = keyFor_(values[r][iLocal], iCod > -1 ? values[r][iCod] : '', iNom > -1 ? values[r][iNom] : '');
    var add = map[key];
    if (!add) continue;
    changedRows.push(r + 1);
    values[r][iStock] = round2_(numberOrZero_(values[r][iStock], 0) + add);
    changedStock = true;
    if (iFecha > -1) {
      values[r][iFecha] = fechaHora;
      changedFecha = true;
    }
    if (iNotas > -1) {
      values[r][iNotas] = 'Recepción desde app';
      changedNotas = true;
    }
  }
  applyCatalogColumnUpdates_(sh, values, changedRows, iStock, iFecha, iNotas, changedStock, changedFecha, changedNotas);
}

function descontarProduccionDelCatalogo_(local, items, fechaHora, productoElaborado) {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh || sh.getLastRow() < 2) return;
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iCod = idx_(head, ['código', 'codigo']);
  var iNom = idx_(head, ['producto', 'nombre']);
  var iLocal = idx_(head, ['local_aplicable', 'local']);
  var iStock = idx_(head, ['stock_actual', 'stock actual']);
  var iFecha = idx_(head, ['fecha']);
  var iNotas = idx_(head, ['notas']);
  if (iLocal === -1 || iStock === -1) return;

  var map = {};
  items.forEach(function (it) {
    var qty = numberOrNull_(it.cantidad_usada);
    if (qty === null || qty <= 0) return;
    map[keyFor_(local, it.codigo, it.insumo || it.producto)] = qty;
  });

  var changedStock = false;
  var changedFecha = false;
  var changedNotas = false;
  var changedRows = [];
  for (var r = 1; r < values.length; r++) {
    var key = keyFor_(values[r][iLocal], iCod > -1 ? values[r][iCod] : '', iNom > -1 ? values[r][iNom] : '');
    var useQty = map[key];
    if (!useQty) continue;
    changedRows.push(r + 1);
    values[r][iStock] = round2_(numberOrZero_(values[r][iStock], 0) - useQty);
    changedStock = true;
    if (iFecha > -1) {
      values[r][iFecha] = fechaHora;
      changedFecha = true;
    }
    if (iNotas > -1) {
      values[r][iNotas] = 'Producción: ' + (productoElaborado || 'consumo de insumo');
      changedNotas = true;
    }
  }
  applyCatalogColumnUpdates_(sh, values, changedRows, iStock, iFecha, iNotas, changedStock, changedFecha, changedNotas);
}

function readRecepcionResumen_() {
  var sh = ss_().getSheetByName(SHEET_RECEPCION);
  if (!sh || sh.getLastRow() < 2) return { latest: [], byLocal: {}, total_movimientos: 0 };
  var values = sh.getDataRange().getValues();
  var events = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    if (!id) continue;
    if (!events[id]) {
      events[id] = {
        id: id,
        fecha_hora: row[1],
        local: normalizeLocalName_(row[2]),
        encargado: row[3],
        proveedor: row[4],
        producto: row[6],
        categoria: row[7],
        unidad: row[8],
        cantidad_recibida: 0,
        estado: row[10],
        observaciones: row[11],
        items: 0
      };
    }
    events[id].cantidad_recibida += numberOrZero_(row[9], 0);
    events[id].items += 1;
    if (events[id].items > 1) {
      events[id].producto = events[id].items + ' productos';
      events[id].unidad = 'unidades';
    }
  }
  var allEvents = Object.keys(events).map(function (id) { return events[id]; });
  var latest = allEvents
    .sort(function (a, b) { return comparableDateTime_(b.fecha_hora) - comparableDateTime_(a.fecha_hora); })
    .slice(0, 60);
  var byLocal = {};
  allEvents.forEach(function (event) {
    if (!byLocal[event.local]) byLocal[event.local] = { movimientos: 0, cantidad: 0 };
    byLocal[event.local].movimientos += 1;
    byLocal[event.local].cantidad += numberOrZero_(event.cantidad_recibida, 0);
  });
  return { latest: latest, byLocal: byLocal, total_movimientos: allEvents.length };
}

function readProduccionResumen_() {
  var sh = ss_().getSheetByName(SHEET_PRODUCCION);
  if (!sh || sh.getLastRow() < 2) return { latest: [], byLocal: {}, total_movimientos: 0 };
  var values = sh.getDataRange().getValues();
  var events = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    if (!id) continue;
    if (!events[id]) {
      events[id] = {
        id: id,
        fecha_hora: row[1],
        local: normalizeLocalName_(row[2]),
        encargado: row[3],
        producto_elaborado: row[4],
        lote: row[5],
        insumo: row[7],
        categoria: row[8],
        unidad: row[9],
        cantidad_usada: 0,
        cantidad_producida: numberOrZero_(row[11], 0),
        estado: row[12],
        observaciones: row[13],
        items: 0
      };
    }
    events[id].cantidad_usada += numberOrZero_(row[10], 0);
    events[id].items += 1;
    if (events[id].items > 1) {
      events[id].insumo = events[id].items + ' insumos';
    }
  }
  var allEvents = Object.keys(events).map(function (id) { return events[id]; });
  var latest = allEvents
    .sort(function (a, b) { return comparableDateTime_(b.fecha_hora) - comparableDateTime_(a.fecha_hora); })
    .slice(0, 60);
  var byLocal = {};
  allEvents.forEach(function (event) {
    if (!byLocal[event.local]) byLocal[event.local] = { movimientos: 0, cantidad_usada: 0, cantidad_producida: 0 };
    byLocal[event.local].movimientos += 1;
    byLocal[event.local].cantidad_usada += numberOrZero_(event.cantidad_usada, 0);
    byLocal[event.local].cantidad_producida += numberOrZero_(event.cantidad_producida, 0);
  });
  return { latest: latest, byLocal: byLocal, total_movimientos: allEvents.length };
}

function readElaboradosResumen_() {
  var sh = ss_().getSheetByName(SHEET_ELABORADOS);
  if (!sh || sh.getLastRow() < 2) return { latest: [], byLocal: {}, total_movimientos: 0 };
  var values = sh.getDataRange().getValues();
  var events = {};
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    if (!id) continue;
    if (!events[id]) {
      events[id] = {
        id: id,
        fecha_hora: row[1],
        local: normalizeLocalName_(row[2]),
        encargado: row[3],
        turno: row[4],
        codigo: row[5],
        producto_elaborado: row[6],
        categoria: row[7],
        unidad: row[8],
        cantidad: 0,
        estado: row[10],
        destino: row[11],
        observaciones: row[12],
        items: 0
      };
    }
    events[id].cantidad += numberOrZero_(row[9], 0);
    events[id].items += 1;
    if (events[id].items > 1) {
      events[id].producto_elaborado = events[id].items + ' elaborados';
    }
  }
  var allEvents = Object.keys(events).map(function (id) { return events[id]; });
  var latest = allEvents
    .sort(function (a, b) { return comparableDateTime_(b.fecha_hora) - comparableDateTime_(a.fecha_hora); })
    .slice(0, 60);
  var byLocal = {};
  allEvents.forEach(function (event) {
    if (!byLocal[event.local]) byLocal[event.local] = { movimientos: 0, cantidad: 0 };
    byLocal[event.local].movimientos += 1;
    byLocal[event.local].cantidad += numberOrZero_(event.cantidad, 0);
  });
  return { latest: latest, byLocal: byLocal, total_movimientos: allEvents.length };
}

function getElaboradosReport_(local, desde, hasta) {
  local = normalizeLocalName_(local);
  if (!local) return { ok: false, error: 'Falta local', rows: [] };
  var sh = ss_().getSheetByName(SHEET_ELABORADOS);
  if (!sh || sh.getLastRow() < 2) {
    return { ok: true, local: local, desde: desde || '', hasta: hasta || '', rows: [], total: 0 };
  }

  var start = reportDateBoundary_(desde, false);
  var end = reportDateBoundary_(hasta, true);
  var rows = sh.getDataRange().getValues().slice(1).filter(function (row) {
    if (normalizeLocalName_(row[2]) !== local) return false;
    var estado = normalizeLooseText_(row[10]);
    if (estado !== 'marcado' && estado !== 'crudo') return false;
    var stamp = comparableDateTime_(row[1]);
    if (start && stamp < start) return false;
    if (end && stamp > end) return false;
    return true;
  }).map(function (row) {
    return {
      id_conteo: String(row[0] || ''),
      fecha_hora: formatReportDateTime_(row[1]),
      timestamp: comparableDateTime_(row[1]),
      local: normalizeLocalName_(row[2]),
      encargado: String(row[3] || ''),
      turno: String(row[4] || ''),
      codigo: String(row[5] || ''),
      producto_elaborado: String(row[6] || ''),
      categoria: String(row[7] || ''),
      unidad: String(row[8] || 'unidad'),
      cantidad: numberOrZero_(row[9], 0),
      estado: String(row[10] || ''),
      destino: String(row[11] || 'Revisar'),
      observaciones: String(row[12] || '')
    };
  }).sort(function (a, b) { return b.timestamp - a.timestamp; });

  return {
    ok: true,
    local: local,
    desde: desde || '',
    hasta: hasta || '',
    generated_at: Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm'),
    rows: rows,
    total: rows.length
  };
}

function reportDateBoundary_(value, endOfDay) {
  var match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  ).getTime();
}

function formatReportDateTime_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
  }
  return String(value || '');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Docks V2')
    .addItem('Aplicar interfaz corporativa', 'setupVersion2UI')
    .addItem('Actualizar REPORTE SOBRANTES', 'refreshElaboradosReportSheet')
    .addItem('Preparar hojas para imprimir (14 pt)', 'prepareOperationalSheetsForPrint')
    .addItem('Reconstruir vistas operativas', 'refreshOperationalViews_')
    .addItem('Reconstruir stock, recepción, producción y elaborados', 'refreshMovementViews_')
    .addItem('Setup plantilla pro', 'setupPlantillaPro')
    .addSeparator()
    .addItem('Resetear datos operativos', 'resetOperationalData')
    .addToUi();
}

function estadoStock_(actual) {
  if (actual <= 0) return 'Sin stock';
  return 'Disponible';
}

/* ============================== SETUP PLANTILLA PRO ============================== */

/**
 * Corré esta función UNA vez. Crea/formatea:
 *  - PEDIDOS_DETALLE (1 fila por producto, validaciones, colores)
 *  - RESUMEN POR PROVEEDOR (consolida cantidades por proveedor+producto para una semana)
 * Además migra a DETALLE los pedidos viejos parseando el texto de PEDIDOS RECIBIDOS.
 */
function setupPlantillaPro() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_DETALLE);
  if (!sh) { sh = ss.insertSheet(SHEET_DETALLE); }
  if (sh.getLastRow() === 0) formatDetalleSheet_(sh); else formatDetalleSheet_(sh);
  migrarPedidosViejos_();
  ensureVersion2Sheets_();
  setupVersion2UI();
  ss.toast('Plantilla pro lista: interfaz v2 operativa aplicada', 'Setup OK', 6);
}

function resetOperationalData() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert(
    'Resetear datos operativos',
    'Se van a borrar pedidos, detalle, stock, recepción, producción, elaborados y log de Telegram. ' +
    'No se toca catálogo, configuración ni fórmulas. ¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) {
    ui.alert('Reset cancelado');
    return;
  }

  var sheetNames = [
    SHEET_PEDIDOS,
    SHEET_DETALLE,
    SHEET_STOCK,
    SHEET_RECEPCION,
    SHEET_PRODUCCION,
    SHEET_ELABORADOS,
    SHEET_TELEGRAM_LOG
  ];
  sheetNames.forEach(function (sheetName) {
    clearSheetDataRows_(sheetName);
  });

  setupPlantillaPro();
  refreshMovementViews_();
  refreshOperationalViews_();
  ui.alert('Reset completo', 'Se limpiaron los datos operativos y se reconstruyeron las vistas.', ui.ButtonSet.OK);
}

function clearSheetDataRows_(sheetName) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh) return;
  var lastRow = sh.getLastRow();
  var lastColumn = sh.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return;
  sh.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
}

function ensureVersion2Sheets_() {
  createStockSheet_();
  createRecepcionSheet_();
  createProduccionSheet_();
  createElaboradosSheet_();
  ensureSheet_(SHEET_HOME);
  ensureSheet_(SHEET_STOCK_DASH);
  ensureSheet_(SHEET_VIEW_PED);
  ensureSheet_(SHEET_VIEW_STK);
  ensureSheet_(SHEET_VIEW_REC);
  ensureSheet_(SHEET_VIEW_PROD);
  ensureSheet_(SHEET_VIEW_ELAB);
  ensureSheet_(SHEET_REPORT_ELAB);
  ensureSheet_(SHEET_VIEW_BUY);
  ensureSheet_(SHEET_RESUMEN);
}

/** Parsea PEDIDOS RECIBIDOS (texto) y vuelca a DETALLE los que falten. */
function migrarPedidosViejos_() {
  var ped = ss_().getSheetByName(SHEET_PEDIDOS);
  var det = ss_().getSheetByName(SHEET_DETALLE);
  if (!ped || !det) return;
  // IDs ya presentes en DETALLE
  var existing = {};
  var dv = det.getDataRange().getValues();
  for (var i = 1; i < dv.length; i++) existing[String(dv[i][0]).trim()] = true;

  var pv = ped.getDataRange().getValues();
  var out = [];
  for (var r = 0; r < pv.length; r++) {
    var id = String(pv[r][0] || '').trim();
    if (!id || id.indexOf('PED') !== 0) continue;       // saltar encabezados
    if (existing[id]) continue;
    var fecha = pv[r][1], local = pv[r][2], enc = pv[r][3], semana = pv[r][4], urg = pv[r][7], texto = String(pv[r][8] || '');
    parseProductos_(texto).forEach(function (p) {
      out.push([id, fecha, semana, local, enc, urg, '', p.nombre, '', p.cantidad, p.unidad, '', 'Pendiente', 'NO', 'NO']);
    });
  }
  if (out.length) det.getRange(det.getLastRow() + 1, 1, out.length, DETALLE_HEADERS.length).setValues(out);
}

/** "muzarella - 10 kg, jamon - 5 kg" -> [{nombre, cantidad, unidad}] */
function parseProductos_(texto) {
  if (!texto) return [];
  return texto.split(',').map(function (part) {
    var seg = part.trim();
    var m = seg.match(/^(.*?)[\-–]\s*([\d.,]+)\s*([A-Za-zÁÉÍÓÚáéíóúñ]+)?\s*$/);
    if (m) return { nombre: m[1].trim(), cantidad: parseFloat(String(m[2]).replace(',', '.')) || m[2], unidad: (m[3] || '').trim() };
    return { nombre: seg, cantidad: '', unidad: '' };
  }).filter(function (p) { return p.nombre; });
}

/** Hoja con consolidado por proveedor para la semana elegida en B1. */
function buildResumenProveedor_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_RESUMEN) || ss.insertSheet(SHEET_RESUMEN);
  sh.clear();
  sh.getRange('A1').setValue('Semana:').setFontWeight('bold');
  // por defecto, la semana más reciente del detalle
  sh.getRange('B1').setFormula(
    "=IFERROR(INDEX('" + SHEET_DETALLE + "'!C2:C, MATCH(MAX('" + SHEET_DETALLE + "'!B2:B), '" + SHEET_DETALLE + "'!B2:B, 0)), \"\")");
  sh.getRange('A1:B1').setBackground('#eef4f7');
  sh.getRange('A3').setFormula(
    "=IFERROR(QUERY('" + SHEET_DETALLE + "'!A2:O, " +
    "\"select L, I, H, K, sum(J) where L is not null and C = '\"&B1&\"' group by L, I, H, K order by L, H label L 'Proveedor', I 'Categoría', H 'Producto', K 'Unidad', sum(J) 'Cantidad total'\"), " +
    "\"Sin datos para esa semana\")");
  sh.getRange('A3').setFontWeight('bold');
  sh.setColumnWidths(1, 5, 160);
  sh.setFrozenRows(3);
}

function setupVersion2UI() {
  normalizeLegacyLocalNames_();
  refreshOperationalViews_();
  SpreadsheetApp.getActive().toast('Interfaz corporativa v2 aplicada', 'Docks V2', 5);
}

function refreshOperationalViews_() {
  buildResumenProveedor_();
  buildStockDashboard_();
  buildInicioOperativo_();
  buildVistaPedidos_();
  buildVistaStock_();
  buildVistaCompras_();
  buildVistaRecepcion_();
  buildVistaProduccion_();
  buildVistaElaborados_();
  buildReporteSobrantes_();
  buildLocalPedidoViews_();
  buildLocalStockViews_();
  applyCorporateTabTheme_();
}

function refreshMovementViews_() {
  buildStockDashboard_();
  buildInicioOperativo_();
  buildVistaStock_();
  buildVistaRecepcion_();
  buildVistaProduccion_();
  buildVistaElaborados_();
  buildReporteSobrantes_();
  buildLocalStockViews_();
  applyCorporateTabTheme_();
}

function refreshStockViews_() {
  buildStockDashboard_();
  buildInicioOperativo_();
  buildVistaStock_();
  buildLocalStockViews_();
  applyCorporateTabTheme_();
}

function buildInicioOperativo_() {
  var sh = ensureSheet_(SHEET_HOME);
  var snap = computeOperationalSnapshot_();
  clearPresentationSheet_(sh, 12);

  sh.getRange('A1:H1').merge().setValue('Docks del Puerto · Abastecimiento')
    .setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold').setFontSize(18)
    .setHorizontalAlignment('left');
  sh.getRange('A2:H2').merge().setValue('Pedidos, stock y compras semanales · Vista operativa consolidada')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);
  sh.getRange('A3:H3').merge().setValue('Actualizado: ' + Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm'))
    .setFontColor('#5B7082').setFontSize(9);

  var cards = [
    ['Pedidos abiertos', snap.totalPedidosAbiertos, 'lineas activas en pedidos'],
    ['Unidades pedidas', snap.totalPedidoCantidad, 'cantidad pendiente total'],
    ['Productos sin stock', snap.totalSinStock, 'catalogo con stock real en cero'],
    ['Locales con riesgo', snap.localesConRiesgo, 'faltantes o sin stock'],
    ['Conteos cargados', snap.totalConConteo, 'productos con stock actualizado'],
    ['Faltantes operativos', snap.totalFaltantes, 'pedido supera stock disponible'],
    ['Recepciones', snap.totalRecepcionMovimientos, 'movimientos registrados'],
    ['Producción', snap.totalProduccionMovimientos, 'partes productivos'],
    ['Elaborados', snap.totalElaboradosMovimientos, 'sobrantes no vendidos']
  ];
  paintCards_(sh, 5, 1, 3, cards);

  sh.getRange('A14:D14').merge().setValue('Pedidos urgentes').setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange('E14:H14').merge().setValue('Ultimos conteos').setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange('I14:L14').merge().setValue('Recepción y producción').setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange('A15:D15').setValues([['Local', 'Producto', 'Cantidad', 'Urgencia']]).setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');
  sh.getRange('E15:H15').setValues([['Fecha', 'Local', 'Producto', 'Tipo']]).setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');
  sh.getRange('I15:L15').setValues([['Fecha', 'Local', 'Movimiento', 'Detalle']]).setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');

  var urgentes = topUrgentRows_(8);
  var conteos = latestStockRows_(8);
  var movs = latestOpsRows_(8);
  if (urgentes.length) sh.getRange(16, 1, urgentes.length, 4).setValues(urgentes);
  if (conteos.length) sh.getRange(16, 5, conteos.length, 4).setValues(conteos);
  if (movs.length) sh.getRange(16, 9, movs.length, 4).setValues(movs);

  sh.getRange('A26:L26').merge().setValue('Accesos recomendados: REPORTE SOBRANTES · VISTA PEDIDOS · VISTA STOCK · VISTA RECEPCION · VISTA PRODUCCION · VISTA ELABORADOS · VISTA COMPRAS')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontWeight('bold');
  sh.setColumnWidths(1, 12, 145);
  sh.setFrozenRows(3);
}

function buildVistaPedidos_() {
  var sh = ensureSheet_(SHEET_VIEW_PED);
  clearPresentationSheet_(sh, DETALLE_HEADERS.length);

  sh.getRange('A1:O1').merge().setValue('Pedidos Abiertos · Detalle Operativo')
    .setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange('A2:O2').merge().setValue('Vista limpia para operar compras, seguimiento y entrega sin tocar la base tecnica.')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

  var rows = activePedidoRows_();
  sh.getRange(4, 1, 1, DETALLE_HEADERS.length).setValues([DETALLE_HEADERS]).setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold');
  if (rows.length) sh.getRange(5, 1, rows.length, DETALLE_HEADERS.length).setValues(rows);
  applyBanding_(sh, 4, Math.max(rows.length + 1, 2), DETALLE_HEADERS.length);
  sh.setFrozenRows(4);
  var widths = [90, 140, 150, 110, 120, 90, 80, 220, 120, 90, 90, 160, 110, 90, 90];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
}

function buildVistaStock_() {
  var sh = ensureSheet_(SHEET_VIEW_STK);
  var snap = computeOperationalSnapshot_();
  clearPresentationSheet_(sh, 12);

  sh.getRange('A1:L1').merge().setValue('Vista Stock · Operacion de Conteo y Cobertura')
    .setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange('A2:L2').merge().setValue('Cruce directo entre stock real cargado y demanda pendiente por producto.')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

  var cards = [
    ['Productos activos', snap.totalProductos, 'catalogo total'],
    ['Con stock real', snap.totalConConteo, 'conteos disponibles'],
    ['Sin stock', snap.totalSinStock, 'stock real en cero'],
    ['Faltantes', snap.totalFaltantes, 'pedido mayor al stock']
  ];
  paintCards_(sh, 4, 1, 3, cards);

  sh.getRange('A9:L9').setValues([['Local', 'Codigo', 'Producto', 'Categoria', 'Unidad', 'Stock real', 'Pedidos', 'Cantidad pedida', 'Saldo', 'Estado', 'Ultimo conteo', 'Fecha']])
    .setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold');
  if (snap.records.length) sh.getRange(10, 1, snap.records.length, 12).setValues(snap.records);
  applyBanding_(sh, 9, Math.max(snap.records.length + 1, 2), 12);
  sh.setFrozenRows(9);
  var widths = [120, 90, 220, 120, 90, 90, 80, 100, 90, 110, 110, 145];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
}

function buildVistaCompras_() {
  var sh = ensureSheet_(SHEET_VIEW_BUY);
  clearPresentationSheet_(sh, 6);

  sh.getRange('A1:F1').merge().setValue('Vista Compras · Consolidado por Proveedor')
    .setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange('A2:F2').merge().setValue('Lista operativa para comprar sin navegar hojas base.')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

  var rows = comprasRows_();
  sh.getRange('A4:F4').setValues([['Proveedor', 'Categoria', 'Producto', 'Unidad', 'Cantidad total', 'Locales involucrados']])
    .setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold');
  if (rows.length) sh.getRange(5, 1, rows.length, 6).setValues(rows);
  applyBanding_(sh, 4, Math.max(rows.length + 1, 2), 6);
  sh.setFrozenRows(4);
  sh.setColumnWidths(1, 6, 170);
}

function buildVistaRecepcion_() {
  var sh = ensureSheet_(SHEET_VIEW_REC);
  clearPresentationSheet_(sh, RECEPCION_HEADERS.length);

  sh.getRange(1, 1, 1, RECEPCION_HEADERS.length).merge().setValue('Vista Recepción · Ingreso Operativo')
    .setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange(2, 1, 1, RECEPCION_HEADERS.length).merge().setValue('Recepciones registradas desde la app, listas para control por local y proveedor.')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

  var rows = recepcionRows_();
  sh.getRange(4, 1, 1, RECEPCION_HEADERS.length).setValues([RECEPCION_HEADERS]).setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold');
  if (rows.length) sh.getRange(5, 1, rows.length, RECEPCION_HEADERS.length).setValues(rows);
  applyBanding_(sh, 4, Math.max(rows.length + 1, 2), RECEPCION_HEADERS.length);
  sh.setFrozenRows(4);
}

function buildVistaProduccion_() {
  var sh = ensureSheet_(SHEET_VIEW_PROD);
  clearPresentationSheet_(sh, PRODUCCION_HEADERS.length);

  sh.getRange(1, 1, 1, PRODUCCION_HEADERS.length).merge().setValue('Vista Producción · Consumo de Insumos')
    .setBackground('#1F6E5A').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange(2, 1, 1, PRODUCCION_HEADERS.length).merge().setValue('Partes productivos registrados desde la app con trazabilidad de insumos usados.')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

  var rows = produccionRows_();
  sh.getRange(4, 1, 1, PRODUCCION_HEADERS.length).setValues([PRODUCCION_HEADERS]).setBackground('#1F6E5A').setFontColor('#ffffff').setFontWeight('bold');
  if (rows.length) sh.getRange(5, 1, rows.length, PRODUCCION_HEADERS.length).setValues(rows);
  applyBanding_(sh, 4, Math.max(rows.length + 1, 2), PRODUCCION_HEADERS.length);
  sh.setFrozenRows(4);
}

function buildVistaElaborados_() {
  var sh = ensureSheet_(SHEET_VIEW_ELAB);
  clearPresentationSheet_(sh, ELABORADOS_HEADERS.length);

  sh.getRange(1, 1, 1, ELABORADOS_HEADERS.length).merge().setValue('Vista Elaborados · Sobrantes No Vendidos')
    .setBackground('#7A4A22').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange(2, 1, 1, ELABORADOS_HEADERS.length).merge().setValue('Conteos de elaborados o sobrantes por local, turno y destino operativo.')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

  var rows = elaboradosRows_();
  sh.getRange(4, 1, 1, ELABORADOS_HEADERS.length).setValues([ELABORADOS_HEADERS]).setBackground('#7A4A22').setFontColor('#ffffff').setFontWeight('bold');
  if (rows.length) sh.getRange(5, 1, rows.length, ELABORADOS_HEADERS.length).setValues(rows);
  applyBanding_(sh, 4, Math.max(rows.length + 1, 2), ELABORADOS_HEADERS.length);
  sh.setFrozenRows(4);
}

function refreshElaboradosReportSheet() {
  var result = buildReporteSobrantes_();
  applyCorporateTabTheme_();
  return result;
}

function buildReporteSobrantes_() {
  var ss = ss_();
  var existing = ss.getSheetByName(SHEET_REPORT_ELAB);
  var previousActive = ss.getActiveSheet();
  var sh = existing || ss.insertSheet(SHEET_REPORT_ELAB);
  if (!existing) {
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(Math.min(2, ss.getSheets().length));
    if (previousActive) ss.setActiveSheet(previousActive);
  }
  clearPresentationSheet_(sh, 9);
  sh.setTabColor('#D05A08');

  var rows = elaboradosRows_().filter(function (row) {
    var estado = normalizeLooseText_(row[10]);
    return estado === 'marcado' || estado === 'crudo';
  });
  var marked = rows.filter(function (row) { return normalizeLooseText_(row[10]) === 'marcado'; });
  var raw = rows.filter(function (row) { return normalizeLooseText_(row[10]) === 'crudo'; });
  var headers = ['Local', 'Ingreso', 'Encargado', 'Código', 'Producto', 'Cantidad', 'Unidad', 'Destino', 'Observaciones'];

  sh.getRange('A1:I1').merge().setValue('CONTROL DE SOBRANTES · MARCADO Y CRUDO')
    .setBackground('#1D416B').setFontColor('#ffffff').setFontWeight('bold').setFontSize(20)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 42);
  sh.getRange('A2:I2').merge().setValue(
    'Reporte automático desde CONTEO ELABORADOS · Actualizado ' +
    Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm')
  ).setBackground('#EAF2F6').setFontColor('#41576B').setHorizontalAlignment('center');

  sh.getRange('A4:C4').setValues([['Indicador', 'Resultado', 'Uso operativo']])
    .setBackground('#1D416B').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A5:C7').setValues([
    ['Sobrantes Marcados', reportSheetQuantity_(marked), 'Producto elaborado; revisar destino'],
    ['Sobrantes Crudos', reportSheetQuantity_(raw), 'Validar antes de descontar compras'],
    ['Registros incluidos', rows.length, 'Solo estados Marcado y Crudo']
  ]).setBorder(true, true, true, true, true, true).setWrap(true);

  var nextRow = 9;
  nextRow = writeSobrantesSection_(sh, nextRow, 'SOBRANTES MARCADOS', '#D05A08', headers, marked);
  nextRow += 2;
  nextRow = writeSobrantesSection_(sh, nextRow, 'SOBRANTES CRUDOS', '#4D8334', headers, raw);
  nextRow += 2;
  writeCompraNetaSection_(sh, nextRow, raw);

  var widths = [120, 155, 155, 95, 230, 105, 90, 135, 260];
  for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
  var lastRow = Math.max(sh.getLastRow(), 7);
  sh.getRange(1, 1, lastRow, 9).setFontSize(14).setVerticalAlignment('middle').setWrap(true);
  sh.getRange('A1:I1').setFontSize(20);
  sh.setFrozenRows(2);
  sh.autoResizeRows(1, lastRow);
  return {
    ok: true,
    sheet: SHEET_REPORT_ELAB,
    sheet_index: sh.getIndex(),
    hidden: sh.isSheetHidden(),
    total: rows.length,
    marked: marked.length,
    raw: raw.length
  };
}

function writeSobrantesSection_(sh, startRow, title, color, headers, rows) {
  sh.getRange(startRow, 1, 1, 9).merge().setValue(title)
    .setBackground(color).setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  sh.getRange(startRow + 1, 1, 1, 9).setValues([headers])
    .setBackground('#1D416B').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  if (!rows.length) {
    sh.getRange(startRow + 2, 1, 1, 9).merge().setValue('Sin registros para esta condición.')
      .setFontColor('#667788').setHorizontalAlignment('center').setBorder(true, true, true, true, false, false);
    return startRow + 3;
  }
  var values = rows.map(function (row) {
    return [
      normalizeLocalName_(row[2]),
      formatReportDateTime_(row[1]),
      row[3] || '',
      row[5] || '',
      row[6] || '',
      numberOrZero_(row[9], 0),
      row[8] || 'unidad',
      row[11] || 'Revisar',
      row[12] || ''
    ];
  });
  sh.getRange(startRow + 2, 1, values.length, 9).setValues(values)
    .setBorder(true, true, true, true, true, true);
  applyBanding_(sh, startRow + 1, values.length + 1, 9);
  return startRow + 2 + values.length;
}

function writeCompraNetaSection_(sh, startRow, rawRows) {
  sh.getRange(startRow, 1, 1, 9).merge().setValue('HOJA DE COMPRA NETA · VALIDAR SOBRANTE CRUDO')
    .setBackground('#1D416B').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
  var headers = ['Local', 'Código', 'Producto', 'Unidad', 'Pedido bruto', 'Crudo a validar', 'Compra neta', 'Control', 'Último ingreso'];
  sh.getRange(startRow + 1, 1, 1, 9).setValues([headers])
    .setBackground('#1D416B').setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
  var grouped = {};
  rawRows.forEach(function (row) {
    var key = [normalizeLocalName_(row[2]), row[5] || '', row[6] || '', row[8] || 'unidad'].join('||');
    if (!grouped[key]) grouped[key] = {
      local: normalizeLocalName_(row[2]), codigo: row[5] || '', producto: row[6] || '', unidad: row[8] || 'unidad',
      cantidad: 0, ingreso: formatReportDateTime_(row[1])
    };
    grouped[key].cantidad += numberOrZero_(row[9], 0);
  });
  var items = Object.keys(grouped).map(function (key) { return grouped[key]; });
  if (!items.length) {
    sh.getRange(startRow + 2, 1, 1, 9).merge().setValue('Sin sobrantes Crudos para cruzar con compras.')
      .setFontColor('#667788').setHorizontalAlignment('center').setBorder(true, true, true, true, false, false);
    return;
  }
  var values = items.map(function (item) {
    return [item.local, item.codigo, item.producto, item.unidad, '', round2_(item.cantidad), '', false, item.ingreso];
  });
  var firstDataRow = startRow + 2;
  sh.getRange(firstDataRow, 1, values.length, 9).setValues(values).setBorder(true, true, true, true, true, true);
  for (var i = 0; i < values.length; i++) {
    var rowNumber = firstDataRow + i;
    sh.getRange(rowNumber, 7).setFormula('=IF(E' + rowNumber + '="","",MAX(0,E' + rowNumber + '-F' + rowNumber + '))');
  }
  sh.getRange(firstDataRow, 8, values.length, 1).insertCheckboxes();
}

function reportSheetQuantity_(rows) {
  if (!rows.length) return '0';
  var totals = {};
  rows.forEach(function (row) {
    var unit = String(row[8] || 'unidad').trim() || 'unidad';
    totals[unit] = (totals[unit] || 0) + numberOrZero_(row[9], 0);
  });
  return Object.keys(totals).map(function (unit) { return round2_(totals[unit]) + ' ' + unit; }).join(' + ');
}

function buildLocalPedidoViews_() {
  var rows = activePedidoRows_();
  operationalLocals_().forEach(function (local) {
    var sh = ensureSheet_(localSheetName_(SHEET_LOCAL_PED_PREFIX, local));
    var localRows = rows.filter(function (row) { return normalizeLocalName_(row[3]) === local; });
    clearPresentationSheet_(sh, DETALLE_HEADERS.length);

    sh.getRange(1, 1, 1, DETALLE_HEADERS.length).merge().setValue(local + ' · Pedido Semanal')
      .setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
    sh.getRange(2, 1, 1, DETALLE_HEADERS.length).merge().setValue('Vista automática del pedido abierto del local. Se reconstruye desde la base técnica sin edición manual.')
      .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

    var totalCantidad = 0;
    var urgentes = 0;
    var proveedores = {};
    localRows.forEach(function (row) {
      totalCantidad += numberOrZero_(row[9], 0);
      if (String(row[5] || '').trim().toLowerCase() === 'urgente') urgentes += 1;
      var proveedor = String(row[11] || '').trim();
      if (proveedor) proveedores[proveedor] = true;
    });
    paintCards_(sh, 4, 1, 3, [
      ['Líneas abiertas', localRows.length, 'productos activos del pedido'],
      ['Unidades pedidas', round2_(totalCantidad), 'cantidad total pendiente'],
      ['Urgentes', urgentes, 'urgencia alta dentro del local'],
      ['Proveedores', Object.keys(proveedores).length, 'proveedores involucrados']
    ]);

    sh.getRange(9, 1, 1, DETALLE_HEADERS.length).setValues([DETALLE_HEADERS]).setBackground('#0F5E7A').setFontColor('#ffffff').setFontWeight('bold');
    if (localRows.length) {
      sh.getRange(10, 1, localRows.length, DETALLE_HEADERS.length).setValues(localRows);
      applyBanding_(sh, 9, localRows.length + 1, DETALLE_HEADERS.length);
    } else {
      sh.getRange(10, 1, 1, DETALLE_HEADERS.length).merge().setValue('Este local no tiene líneas de pedido abiertas en este momento.')
        .setHorizontalAlignment('center').setBackground('#F8FBFD').setFontColor('#5B7082');
    }
    sh.setFrozenRows(9);
    var widths = [90, 140, 150, 110, 120, 90, 80, 220, 120, 90, 90, 160, 110, 90, 90];
    for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
  });
}

function buildLocalStockViews_() {
  var snap = computeOperationalSnapshot_();
  var recepLatest = readRecepcionResumen_().latest || [];
  var prodLatest = readProduccionResumen_().latest || [];
  operationalLocals_().forEach(function (local) {
    var sh = ensureSheet_(localSheetName_(SHEET_LOCAL_STK_PREFIX, local));
    var records = snap.records.filter(function (row) { return row[0] === local; });
    var summary = snap.localSummary[local] || { productos: 0, conStock: 0, sinStock: 0, faltantes: 0 };
    clearPresentationSheet_(sh, 12);

    sh.getRange('A1:L1').merge().setValue(local + ' · Stock y Operación')
      .setBackground('#1F6E5A').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16);
    sh.getRange('A2:L2').merge().setValue('Lectura automática del stock real, cobertura del pedido y últimos movimientos del local.')
      .setBackground('#EAF2F6').setFontColor('#41576B').setFontSize(10);

    paintCards_(sh, 4, 1, 3, [
      ['Productos activos', summary.productos, 'catálogo visible del local'],
      ['Con stock', summary.conStock, 'productos con stock real positivo'],
      ['Sin stock', summary.sinStock, 'productos agotados o sin saldo'],
      ['Faltantes', summary.faltantes, 'pedido por encima del stock real']
    ]);

    sh.getRange('A9:L9').setValues([['Local', 'Codigo', 'Producto', 'Categoria', 'Unidad', 'Stock real', 'Pedidos', 'Cantidad pedida', 'Saldo', 'Estado', 'Ultimo conteo', 'Fecha']])
      .setBackground('#1F6E5A').setFontColor('#ffffff').setFontWeight('bold');
    if (records.length) {
      sh.getRange(10, 1, records.length, 12).setValues(records);
      applyBanding_(sh, 9, records.length + 1, 12);
    } else {
      sh.getRange('A10:L10').merge().setValue('Este local todavía no tiene catálogo operativo para cruzar stock y pedido.')
        .setHorizontalAlignment('center').setBackground('#F8FBFD').setFontColor('#5B7082');
    }

    var recepRows = recepLatest.filter(function (row) { return row.local === local; }).slice(0, 5).map(function (row) {
      return [row.fecha_hora, row.proveedor || 'Sin proveedor', row.producto, row.cantidad_recibida, row.unidad, row.estado || 'Recepcionado'];
    });
    var recepStart = Math.max(records.length ? 12 + records.length : 13, 14);
    sh.getRange(recepStart, 1, 1, 6).setValues([['Fecha', 'Proveedor', 'Producto', 'Cantidad', 'Unidad', 'Estado']])
      .setBackground('#2D7D9A').setFontColor('#ffffff').setFontWeight('bold');
    if (recepRows.length) {
      sh.getRange(recepStart + 1, 1, recepRows.length, 6).setValues(recepRows);
      applyBanding_(sh, recepStart, recepRows.length + 1, 6);
    } else {
      sh.getRange(recepStart + 1, 1, 1, 6).merge().setValue('Sin recepciones registradas para este local.')
        .setHorizontalAlignment('center').setBackground('#F8FBFD').setFontColor('#5B7082');
    }

    var prodRows = prodLatest.filter(function (row) { return row.local === local; }).slice(0, 5).map(function (row) {
      return [row.fecha_hora, row.producto_elaborado || '', row.insumo, row.cantidad_usada, row.cantidad_producida, row.lote || ''];
    });
    var prodStart = recepStart + Math.max(recepRows.length, 1) + 4;
    sh.getRange(prodStart, 1, 1, 6).setValues([['Fecha', 'Producto elaborado', 'Insumo', 'Cantidad usada', 'Cantidad producida', 'Lote']])
      .setBackground('#2B7A68').setFontColor('#ffffff').setFontWeight('bold');
    if (prodRows.length) {
      sh.getRange(prodStart + 1, 1, prodRows.length, 6).setValues(prodRows);
      applyBanding_(sh, prodStart, prodRows.length + 1, 6);
    } else {
      sh.getRange(prodStart + 1, 1, 1, 6).merge().setValue('Sin partes productivos registrados para este local.')
        .setHorizontalAlignment('center').setBackground('#F8FBFD').setFontColor('#5B7082');
    }

    var widths = [120, 90, 220, 120, 90, 90, 80, 100, 90, 110, 110, 145];
    for (var c = 0; c < widths.length; c++) sh.setColumnWidth(c + 1, widths[c]);
    sh.setFrozenRows(9);
  });
}

function buildStockDashboard_() {
  var ss = ss_();
  var dash = ss.getSheetByName(SHEET_STOCK_DASH) || ss.insertSheet(SHEET_STOCK_DASH);
  var snap = computeOperationalSnapshot_();
  var records = snap.records;
  var localSummary = snap.localSummary;
  var recep = readRecepcionResumen_();
  var prod = readProduccionResumen_();
  var elab = readElaboradosResumen_();

  dash.clear();
  dash.setHiddenGridlines(true);
  dash.getRange('A1:L1').merge().setValue('DASHBOARD STOCK · OPERACIÓN DE PEDIDOS')
    .setFontWeight('bold').setFontSize(16).setFontColor('#ffffff')
    .setBackground('#0f5e7a').setHorizontalAlignment('left').setVerticalAlignment('middle');
  dash.setRowHeight(1, 34);
  dash.getRange('A2:L2').merge().setValue('Vista combinada de stock real cargado y pedidos pendientes por producto y local.')
    .setBackground('#eaf2f6').setFontColor('#41576b').setFontSize(10);

  var cards = [
    ['Productos activos', snap.totalProductos, 'Catalogo del sistema'],
    ['Con stock cargado', snap.totalConConteo, 'Conteo real disponible'],
    ['Faltantes operativos', snap.totalFaltantes, 'Pedido supera stock'],
    ['Pedido pendiente', snap.totalPedidoCantidad, 'Unidades solicitadas'],
    ['Recepciones', snap.totalRecepcionCantidad, 'Ingreso real acumulado'],
    ['Producción', snap.totalProduccionCantidad, 'Salida productiva registrada'],
    ['Elaborados', snap.totalElaboradosCantidad, 'Sobrante no vendido registrado']
  ];
  for (var i = 0; i < cards.length; i++) {
    var col = 1 + ((i % 4) * 3);
    var row = i < 4 ? 4 : 7;
    dash.getRange(row, col, 1, 3).merge().setValue(cards[i][0]).setBackground('#dfeaf1').setFontWeight('bold').setFontColor('#365165');
    dash.getRange(row + 1, col, 1, 2).merge().setValue(cards[i][1]).setFontWeight('bold').setFontSize(20).setBackground('#ffffff').setFontColor('#1c3448');
    dash.getRange(row + 1, col + 2).setValue(cards[i][2]).setWrap(true).setBackground('#ffffff').setFontColor('#5b7082').setFontSize(10);
    dash.getRange(row, col, 2, 3).setBorder(true, true, true, true, false, false, '#cbd9e4', SpreadsheetApp.BorderStyle.SOLID);
  }

  var localRows = Object.keys(localSummary).sort().map(function (local) {
    var s = localSummary[local];
    var rl = recep.byLocal[local] || { movimientos: 0, cantidad: 0 };
    var pl = prod.byLocal[local] || { movimientos: 0, cantidad_producida: 0 };
    var el = elab.byLocal[local] || { movimientos: 0, cantidad: 0 };
    return [local, s.productos, s.conStock, s.sinStock, s.pedidos, s.faltantes, rl.movimientos, rl.cantidad, pl.movimientos, pl.cantidad_producida, el.movimientos, el.cantidad];
  });
  dash.getRange('A10:L10').setValues([['Local', 'Productos', 'Con stock', 'Sin stock', 'Pedidos abiertos', 'Faltantes', 'Recepciones', 'Cant. recibida', 'Producción', 'Cant. producida', 'Elaborados', 'Cant. sobrante']])
    .setBackground('#103f59').setFontColor('#ffffff').setFontWeight('bold');
  if (localRows.length) {
    dash.getRange(11, 1, localRows.length, 12).setValues(localRows);
  }

  dash.getRange('A' + (12 + localRows.length) + ':L' + (12 + localRows.length)).setValues([[
    'Local', 'Código', 'Producto', 'Categoría', 'Unidad', 'Stock real',
    'Pedidos', 'Cantidad pedida', 'Saldo', 'Estado', 'Último conteo', 'Fecha'
  ]]).setBackground('#103f59').setFontColor('#ffffff').setFontWeight('bold');
  if (records.length) {
    dash.getRange(13 + localRows.length, 1, records.length, 12).setValues(records);
  }

  var lastRow = dash.getLastRow();
  if (lastRow >= 10) {
    dash.getRange(10, 1, lastRow - 9, 12).setBorder(true, true, true, true, false, false, '#d7e1e8', SpreadsheetApp.BorderStyle.SOLID);
  }
  if (records.length) {
    var detailStart = 13 + localRows.length;
    var detailEnd = detailStart + records.length - 1;
    dash.getRange('J' + detailStart + ':J' + detailEnd).setFontWeight('bold');
    var rules = dash.getConditionalFormatRules();
    rules = rules.filter(function (rule) {
      var ranges = rule.getRanges();
      for (var k = 0; k < ranges.length; k++) {
        if (ranges[k].getSheet().getName() === SHEET_STOCK_DASH) return false;
      }
      return true;
    });
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Faltante').setBackground('#fde1e1').setFontColor('#a01b1b')
      .setRanges([dash.getRange('J' + detailStart + ':J' + detailEnd)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Cubierto').setBackground('#fff1d6').setFontColor('#8a5b00')
      .setRanges([dash.getRange('J' + detailStart + ':J' + detailEnd)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Disponible').setBackground('#d9f2e3').setFontColor('#1b6b3a')
      .setRanges([dash.getRange('J' + detailStart + ':J' + detailEnd)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Sin stock').setBackground('#fde1e1').setFontColor('#a01b1b')
      .setRanges([dash.getRange('J' + detailStart + ':J' + detailEnd)]).build());
    dash.setConditionalFormatRules(rules);
  }

  var widths = [120, 90, 220, 120, 90, 90, 80, 100, 90, 110, 110, 145];
  for (var c = 0; c < widths.length; c++) dash.setColumnWidth(c + 1, widths[c]);
  dash.setFrozenRows(10);
}

/* ============================== SETUP GREENFRESH ============================== */

/**
 * Corré esta función UNA vez desde el editor de Apps Script.
 * - Agrega los productos de GreenFresh al catálogo (si no existen).
 * - Agrega el encargado GreenFresh a CONFIGURACIÓN (si no existe).
 * - Desactiva Pizzería: marca sus productos como "Inactivo" y su encargado Activo=NO.
 */
function setupGreenFresh() {
  addGreenFreshCatalog_();
  addGreenFreshConfig_();
  deactivatePizzeria_();
  // Nombres reales de los locales
  renameLocal_('Hamburguesería', 'Brooklyn');
  renameLocal_('Parrilla', 'Umo Grill');
  renameLocal_('Heladería', 'Puerto Gelato');
  renameLocal_('Cafetería', 'Trento Café');
  SpreadsheetApp.getActive().toast('Locales renombrados, GreenFresh agregado, Pizzería desactivada', 'Setup OK', 6);
}

/** Renombra un local en CATÁLOGO (Local_Aplicable) y CONFIGURACIÓN (Local). */
function renameLocal_(from, to) {
  var cat = ss_().getSheetByName(SHEET_CATALOGO);
  if (cat) {
    var cv = cat.getDataRange().getValues();
    var head = cv[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iLocal = idx_(head, ['local_aplicable', 'local']);
    if (iLocal > -1) {
      for (var r = 1; r < cv.length; r++) {
        if (String(cv[r][iLocal] || '').trim().toLowerCase() === from.toLowerCase()) {
          cat.getRange(r + 1, iLocal + 1).setValue(to);
        }
      }
    }
  }
  var cfg = ss_().getSheetByName(SHEET_CONFIG);
  if (cfg) {
    var gv = cfg.getDataRange().getValues();
    for (var i = 0; i < gv.length; i++) {
      var low = gv[i].map(function (c) { return String(c).trim().toLowerCase(); });
      var cL = low.indexOf('local'), cE = low.indexOf('encargado');
      if (cL > -1 && cE > -1) {
        for (var j = i + 1; j < gv.length; j++) {
          var loc = String(gv[j][cL] || '').trim();
          if (!loc) break;
          if (loc.toLowerCase() === from.toLowerCase()) cfg.getRange(j + 1, cL + 1).setValue(to);
        }
        break;
      }
    }
  }
}

function addGreenFreshCatalog_() {
  var sh = ss_().getSheetByName(SHEET_CATALOGO);
  if (!sh) throw new Error('Falta hoja ' + SHEET_CATALOGO);
  var values = sh.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < values.length; r++) existing[String(values[r][0]).trim()] = true; // por Código
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  var items = [
    ['GRE001','Pechuga de Pollo','Pechuga fresca','GreenFresh','Proteínas','kg',7000,'Distribuidora Milano',30,15],
    ['GRE002','Mix de Hojas Verdes','Lechuga, rúcula, espinaca','GreenFresh','Vegetales','kg',2200,'Vegetales Frescos',20,10],
    ['GRE003','Quinoa','Quinoa seca','GreenFresh','Granos','kg',5400,'Almacén Natural',15,8],
    ['GRE004','Palta','Palta hass','GreenFresh','Frutas','unidad',900,'Vegetales Frescos',60,30],
    ['GRE005','Tomate Cherry','Tomate cherry','GreenFresh','Vegetales','kg',2600,'Vegetales Frescos',18,9],
    ['GRE006','Huevos','Huevos frescos','GreenFresh','Proteínas','docena',3200,'Granja del Sol',40,20],
    ['GRE007','Arroz Integral','Arroz integral','GreenFresh','Granos','kg',1900,'Almacén Natural',25,12],
    ['GRE008','Batata','Batata','GreenFresh','Vegetales','kg',1500,'Vegetales Frescos',30,15],
    ['GRE009','Garbanzos','Garbanzos secos','GreenFresh','Legumbres','kg',2100,'Almacén Natural',20,10],
    ['GRE010','Salmón','Salmón fresco','GreenFresh','Proteínas','kg',16000,'Pescadería del Puerto',12,6],
    ['GRE011','Aceite de Oliva','Aceite de oliva extra virgen','GreenFresh','Aderezos','litro',8200,'Almacén Natural',15,8],
    ['GRE012','Yogur Natural','Yogur natural sin azúcar','GreenFresh','Lácteos','litro',2400,'Lácteos Premium',24,12]
  ];
  items.forEach(function (it) {
    if (existing[it[0]]) return;
    // Código,Producto,Descripción,Local_Aplicable,Categoría,Unidad_Medida,Precio_Unitario,Proveedor,Stock_Actual,Stock_Mínimo,Estado,Fecha,Notas
    sh.appendRow(it.concat(['Disponible', hoy, '']));
  });
}

function addGreenFreshConfig_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return;
  var values = sh.getDataRange().getValues();
  var headerRow = -1, cLocal = 0;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) { headerRow = r; cLocal = low.indexOf('local'); break; }
  }
  if (headerRow === -1) return;
  // ¿ya existe GreenFresh?
  for (var i = headerRow + 1; i < values.length; i++) {
    var local = String(values[i][cLocal] || '').trim();
    if (!local) break;
    if (local.toLowerCase() === 'greenfresh') return;
  }
  // insertar fila luego del último encargado
  var insertAt = headerRow + 2;
  for (var k = headerRow + 1; k < values.length; k++) {
    if (!String(values[k][cLocal] || '').trim()) { insertAt = k + 1; break; }
    insertAt = k + 2;
  }
  sh.insertRowBefore(insertAt);
  sh.getRange(insertAt, 1, 1, 6).setValues([['GreenFresh', 'Por asignar', 'greenfresh@pologastronomico.com', '', '10:00-20:00', 'SÍ']]);
}

function deactivatePizzeria_() {
  // Catálogo: marcar productos de Pizzería como Inactivo
  var cat = ss_().getSheetByName(SHEET_CATALOGO);
  if (cat) {
    var cv = cat.getDataRange().getValues();
    var head = cv[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iLocal = idx_(head, ['local_aplicable', 'local']);
    var iEstado = idx_(head, ['estado']);
    for (var r = 1; r < cv.length; r++) {
      if (String(cv[r][iLocal] || '').trim().toLowerCase() === 'pizzería' && iEstado > -1) {
        cat.getRange(r + 1, iEstado + 1).setValue('Inactivo');
      }
    }
  }
  // Config: encargado Pizzería Activo = NO
  var cfg = ss_().getSheetByName(SHEET_CONFIG);
  if (cfg) {
    var gv = cfg.getDataRange().getValues();
    for (var i = 0; i < gv.length; i++) {
      var low = gv[i].map(function (c) { return String(c).trim().toLowerCase(); });
      var cL = low.indexOf('local'), cE = low.indexOf('encargado');
      if (cL > -1 && cE > -1) {
        var cAct = low.indexOf('activo');
        for (var j = i + 1; j < gv.length; j++) {
          var loc = String(gv[j][cL] || '').trim();
          if (!loc) break;
          if (loc.toLowerCase() === 'pizzería' && cAct > -1) cfg.getRange(j + 1, cAct + 1).setValue('NO');
        }
        break;
      }
    }
  }
}

/* ============================== UTILS ============================== */

function ss_() {
  // Funciona enlazado (getActive) o standalone (openById con el ID de arriba).
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.openById(SHEET_ID);
}

function getTelegramSettings_() {
  var stores = readTelegramPropertyStores_();
  var flagMatch = findTelegramPropertyValue_(stores, ['TELEGRAM_ENABLED', 'TG_ENABLED']);
  var tokenMatch = findTelegramPropertyValue_(stores, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN', 'BOT_TOKEN']);
  var chatMatch = findTelegramPropertyValue_(stores, ['TELEGRAM_CHAT_ID', 'TELEGRAM_GROUP_ID', 'TELEGRAM_TARGET_CHAT_ID', 'CHAT_ID']);
  var enabledFlag = normalizeTelegramFlag_(flagMatch.value);
  var token = tokenMatch.value;
  var chatId = chatMatch.value;
  var enabled = !!token && !!chatId && enabledFlag !== false;
  var sourceParts = [];
  if (tokenMatch.source) sourceParts.push('token:' + tokenMatch.source + '/' + tokenMatch.key);
  if (chatMatch.source) sourceParts.push('chat:' + chatMatch.source + '/' + chatMatch.key);
  if (flagMatch.source) sourceParts.push('flag:' + flagMatch.source + '/' + flagMatch.key);
  var reason = 'ready';
  if (!token && !chatId) reason = 'missing_token_and_chat_id';
  else if (!token) reason = 'missing_token';
  else if (!chatId) reason = 'missing_chat_id';
  else if (enabledFlag === false) reason = 'telegram_disabled_flag';
  return {
    enabled: enabled,
    token: token,
    chat_id: chatId,
    flag: flagMatch.value,
    source: sourceParts.join(', '),
    reason: reason
  };
}

function readTelegramPropertyStores_() {
  return [
    { name: 'script', values: safePropertyValues_(PropertiesService.getScriptProperties()) },
    { name: 'document', values: safePropertyValues_(PropertiesService.getDocumentProperties()) },
    { name: 'user', values: safePropertyValues_(PropertiesService.getUserProperties()) }
  ];
}

function safePropertyValues_(store) {
  try {
    return store && store.getProperties ? (store.getProperties() || {}) : {};
  } catch (err) {
    return {};
  }
}

function findTelegramPropertyValue_(stores, keys) {
  for (var s = 0; s < stores.length; s++) {
    var store = stores[s];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var value = String((store.values && store.values[key]) || '').trim();
      if (!value) continue;
      return {
        value: value,
        key: key,
        source: store.name
      };
    }
  }
  return { value: '', key: '', source: '' };
}

function normalizeTelegramFlag_(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off' || raw === 'disabled') return false;
  if (raw === 'true' || raw === '1' || raw === 'si' || raw === 'sí' || raw === 'yes' || raw === 'on' || raw === 'enabled') return true;
  return null;
}

function getTelegramStatus_() {
  var settings = getTelegramSettings_();
  var probe = settings.enabled ? probeTelegramTarget_(settings) : { bot_ok: false, chat_ok: false, reason: settings.reason || 'telegram_disabled' };
  return {
    ok: true,
    enabled: settings.enabled,
    has_token: !!settings.token,
    has_chat_id: !!settings.chat_id,
    flag: settings.flag || '',
    source: settings.source || '',
    reason: settings.reason || '',
    bot_ok: probe.bot_ok === true,
    chat_ok: probe.chat_ok === true,
    probe_status: probe.status_code || '',
    probe_reason: probe.reason || ''
  };
}

function probeTelegramTarget_(settings) {
  try {
    var botResponse = UrlFetchApp.fetch('https://api.telegram.org/bot' + settings.token + '/getMe', {
      muteHttpExceptions: true
    });
    var botCode = botResponse.getResponseCode();
    var botBody = parseJsonSafe_(botResponse.getContentText() || '');
    if (botCode < 200 || botCode >= 300 || !botBody || botBody.ok !== true) {
      return { bot_ok: false, chat_ok: false, status_code: botCode, reason: 'bot_probe_failed' };
    }
    var chatResponse = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + settings.token + '/getChat?chat_id=' + encodeURIComponent(settings.chat_id),
      { muteHttpExceptions: true }
    );
    var chatCode = chatResponse.getResponseCode();
    var chatBody = parseJsonSafe_(chatResponse.getContentText() || '');
    return {
      bot_ok: true,
      chat_ok: chatCode >= 200 && chatCode < 300 && chatBody && chatBody.ok === true,
      status_code: chatCode,
      reason: chatCode >= 200 && chatCode < 300 && chatBody && chatBody.ok === true ? 'ready' : 'chat_probe_failed'
    };
  } catch (err) {
    return { bot_ok: false, chat_ok: false, reason: String(err) };
  }
}

function getOpenAiSettings_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var enabledFlag = String(props.OPENAI_RECEIPT_AI_ENABLED || '').trim().toLowerCase();
  var apiKey = String(props.OPENAI_API_KEY || '').trim();
  var model = String(props.OPENAI_MODEL || '').trim() || 'gpt-5.4-mini';
  var enabled = !!apiKey && enabledFlag !== 'false' && enabledFlag !== '0' && enabledFlag !== 'no';
  return {
    enabled: enabled,
    api_key: apiKey,
    model: model
  };
}

function setOpenAiConfig(apiKey, model) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    OPENAI_API_KEY: String(apiKey || '').trim(),
    OPENAI_MODEL: String(model || '').trim() || 'gpt-5.4-mini',
    OPENAI_RECEIPT_AI_ENABLED: 'true'
  }, true);
}

function disableOpenAiReceiptParsing() {
  PropertiesService.getScriptProperties().setProperty('OPENAI_RECEIPT_AI_ENABLED', 'false');
}

function setTelegramConfig(botToken, chatId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    TELEGRAM_BOT_TOKEN: String(botToken || '').trim(),
    TELEGRAM_CHAT_ID: String(chatId || '').trim(),
    TELEGRAM_ENABLED: 'true'
  }, true);
}

function disableTelegramNotifications() {
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_ENABLED', 'false');
}

function notifyTelegramForPedido_(pedido) {
  return notifyTelegramMessage_(pedido, buildTelegramPedidoMessage_(pedido));
}

function notifyTelegramForStock_(stock) {
  return notifyTelegramMessage_(stock, buildTelegramStockMessage_(stock));
}

function notifyTelegramForElaborados_(conteo) {
  return notifyTelegramMessage_(conteo, buildTelegramElaboradosMessage_(conteo));
}

function notifyTelegramMessage_(eventData, messageText) {
  var settings = getTelegramSettings_();
  if (!settings.enabled) {
    var skipped = { ok: false, skipped: true, reason: settings.reason || 'telegram_disabled' };
    appendTelegramLog_(eventData, skipped);
    return skipped;
  }
  try {
    var chunks = splitTelegramMessage_(messageText, 3500);
    var sent = [];
    var ok = true;
    for (var i = 0; i < chunks.length; i++) {
      var part = chunks.length > 1 ? chunks[i] + '\n\n<i>Parte ' + (i + 1) + ' de ' + chunks.length + '</i>' : chunks[i];
      var partResult = sendTelegramChunk_(settings, part);
      sent.push(partResult);
      if (!partResult.ok) {
        ok = false;
        break;
      }
      if (i < chunks.length - 1) Utilities.sleep(120);
    }
    var last = sent.length ? sent[sent.length - 1] : { status_code: '', body: '' };
    var result = {
      ok: ok,
      skipped: false,
      status_code: last.status_code || '',
      body: JSON.stringify({ chunks: chunks.length, sent: sent.length, last: String(last.body || '').slice(0, 300) }).slice(0, 500)
    };
    appendTelegramLog_(eventData, result);
    return result;
  } catch (err) {
    var failed = { ok: false, skipped: false, error: String(err) };
    appendTelegramLog_(eventData, failed);
    return failed;
  }
}

function splitTelegramMessage_(messageText, maxLength) {
  var lines = String(messageText || '').split('\n');
  var chunks = [];
  var current = '';
  lines.forEach(function (line) {
    var candidate = current ? current + '\n' + line : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      return;
    }
    if (current) chunks.push(current);
    current = line.length <= maxLength ? line : line.slice(0, maxLength - 1) + '…';
  });
  if (current) chunks.push(current);
  return chunks.length ? chunks : ['Sin detalle'];
}

function sendTelegramChunk_(settings, text) {
  var url = 'https://api.telegram.org/bot' + settings.token + '/sendMessage';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: {
      chat_id: settings.chat_id,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true'
    },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var raw = response.getContentText() || '';
  var parsed = parseJsonSafe_(raw);
  if (code >= 200 && code < 300 && parsed && parsed.ok === true) {
    return { ok: true, status_code: code, body: raw };
  }
  if (code === 400) {
    var fallback = UrlFetchApp.fetch(url, {
      method: 'post',
      payload: {
        chat_id: settings.chat_id,
        text: stripTelegramHtml_(text),
        disable_web_page_preview: 'true'
      },
      muteHttpExceptions: true
    });
    var fallbackCode = fallback.getResponseCode();
    var fallbackRaw = fallback.getContentText() || '';
    var fallbackParsed = parseJsonSafe_(fallbackRaw);
    return {
      ok: fallbackCode >= 200 && fallbackCode < 300 && fallbackParsed && fallbackParsed.ok === true,
      status_code: fallbackCode,
      body: fallbackRaw
    };
  }
  return { ok: false, status_code: code, body: raw };
}

function stripTelegramHtml_(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function testTelegramDelivery() {
  return notifyTelegramMessage_({
    id_pedido: 'TEST-' + Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyyMMdd-HHmmss'),
    local: 'Sistema'
  }, '✅ <b>Telegram operativo</b>\nPrueba automática de Pedidos Semanales.');
}

function buildTelegramPedidoMessage_(pedido) {
  var local = normalizeLocalName_(pedido.local || '');
  var urgencia = normalizeUrgenciaLabel_(pedido.urgencia || 'Normal');
  var entrega = safeTelegramText_(pedido.fecha_entrega || 'Sin definir');
  var semana = safeTelegramText_(pedido.semana_pedido || 'Sin definir');
  var encargado = safeTelegramText_(pedido.encargado || 'Sin asignar');
  var pedidoId = safeTelegramText_(pedido.id_pedido || '');
  var observaciones = safeTelegramText_(pedido.observaciones || '');
  var totalProductos = String(pedido.total_productos || (pedido.items || []).length || 0);
  var groupedItems = buildTelegramGroupedItems_(pedido.items || []);
  return [
    '🧾 <b>NUEVO PEDIDO — Docks del Puerto</b>',
    '━━━━━━━━━━━━━━━━━━',
    '🏪 <b>Local:</b> ' + safeTelegramText_(local),
    '👤 <b>Encargado:</b> ' + encargado,
    '🆔 <b>ID Pedido:</b> <code>' + pedidoId + '</code>',
    '📅 <b>Semana:</b> ' + semana,
    '🚚 <b>Entrega deseada:</b> ' + entrega,
    '🔴 <b>Urgencia:</b> ' + safeTelegramText_(urgencia),
    '📦 <b>Total items:</b> ' + safeTelegramText_(totalProductos),
    observaciones ? '📝 <b>Observaciones:</b> ' + observaciones : '',
    '',
    '🛒 <b>PRODUCTOS SOLICITADOS</b>',
    '━━━━━━━━━━━━━━━━━━',
    groupedItems
  ].filter(function (line) { return line !== ''; }).join('\n');
}

function buildTelegramStockMessage_(stock) {
  var local = normalizeLocalName_(stock.local || '');
  var encargado = safeTelegramText_(stock.encargado || 'Sin asignar');
  var stockId = safeTelegramText_(stock.id_stock || '');
  var tipoConteo = safeTelegramText_(stock.tipo_conteo || 'Conteo parcial');
  var observaciones = safeTelegramText_(stock.observaciones || '');
  var totalItems = (stock.items || []).filter(function (it) {
    return numberOrNull_(it.stock_actual) !== null;
  }).length;
  var totalCantidad = round2_((stock.items || []).reduce(function (sum, it) {
    return sum + numberOrZero_(it.stock_actual, 0);
  }, 0));
  var lines = (stock.items || []).filter(function (it) {
    return numberOrNull_(it.stock_actual) !== null;
  }).slice(0, 20).map(function (it) {
    return '• ' + safeTelegramText_(it.producto || 'Producto sin nombre') + ' — ' +
      safeTelegramText_(String(numberOrZero_(it.stock_actual, 0)) + ' ' + (it.unidad || 'unidad'));
  });
  return [
    '📦 <b>STOCK ACTUALIZADO — Docks del Puerto</b>',
    '━━━━━━━━━━━━━━━━━━',
    '🏪 <b>Local:</b> ' + safeTelegramText_(local),
    '👤 <b>Encargado:</b> ' + encargado,
    '🆔 <b>ID Stock:</b> <code>' + stockId + '</code>',
    '🧮 <b>Tipo de conteo:</b> ' + tipoConteo,
    '📋 <b>Productos cargados:</b> ' + safeTelegramText_(String(totalItems)),
    '📐 <b>Total relevado:</b> ' + safeTelegramText_(String(totalCantidad)),
    observaciones ? '📝 <b>Observaciones:</b> ' + observaciones : '',
    '',
    '📍 <b>DETALLE</b>',
    '━━━━━━━━━━━━━━━━━━',
    lines.join('\n')
  ].filter(function (line) { return line !== ''; }).join('\n');
}

function buildTelegramElaboradosMessage_(conteo) {
  var local = normalizeLocalName_(conteo.local || '');
  var encargado = safeTelegramText_(conteo.encargado || 'Sin asignar');
  var conteoId = safeTelegramText_(conteo.id_conteo || '');
  var turno = safeTelegramText_(conteo.turno || 'Sin turno');
  var estado = safeTelegramText_(conteo.estado || 'Sobrante');
  var destino = safeTelegramText_(conteo.destino || 'Revisar');
  var observaciones = safeTelegramText_(conteo.observaciones || '');
  var totalItems = (conteo.items || []).filter(function (it) {
    return numberOrNull_(it.cantidad) !== null && numberOrZero_(it.cantidad, 0) > 0;
  }).length;
  var totalCantidad = round2_((conteo.items || []).reduce(function (sum, it) {
    return sum + numberOrZero_(it.cantidad, 0);
  }, 0));
  var lines = (conteo.items || []).filter(function (it) {
    return numberOrNull_(it.cantidad) !== null && numberOrZero_(it.cantidad, 0) > 0;
  }).slice(0, 20).map(function (it) {
    return '• ' + safeTelegramText_(it.producto_elaborado || it.producto || 'Elaborado sin nombre') + ' — ' +
      safeTelegramText_(String(numberOrZero_(it.cantidad, 0)) + ' ' + (it.unidad || 'unidad'));
  });
  return [
    '🍽️ <b>ELABORADOS / SOBRANTE — Docks del Puerto</b>',
    '━━━━━━━━━━━━━━━━━━',
    '🏪 <b>Local:</b> ' + safeTelegramText_(local),
    '👤 <b>Encargado:</b> ' + encargado,
    '🆔 <b>ID Conteo:</b> <code>' + conteoId + '</code>',
    '🕒 <b>Turno:</b> ' + turno,
    '🏷️ <b>Estado:</b> ' + estado,
    '📦 <b>Destino:</b> ' + destino,
    '📋 <b>Productos cargados:</b> ' + safeTelegramText_(String(totalItems)),
    '📐 <b>Total marcado:</b> ' + safeTelegramText_(String(totalCantidad)),
    observaciones ? '📝 <b>Observaciones:</b> ' + observaciones : '',
    '',
    '📍 <b>DETALLE</b>',
    '━━━━━━━━━━━━━━━━━━',
    lines.join('\n')
  ].filter(function (line) { return line !== ''; }).join('\n');
}

function buildTelegramGroupedItems_(items) {
  var maxItems = 20;
  var limitedItems = items.slice(0, maxItems);
  var grouped = {};
  var categoryOrder = [];
  limitedItems.forEach(function (it) {
    var categoriaRaw = String(it.categoria || '').trim();
    var proveedorRaw = String(it.proveedor || '').trim();
    var categoriaKey = categoriaRaw || 'Sin categoria';
    var proveedorKey = proveedorRaw || 'Sin proveedor asignado';
    if (!grouped[categoriaKey]) {
      grouped[categoriaKey] = { providers: {}, providerOrder: [] };
      categoryOrder.push(categoriaKey);
    }
    if (!grouped[categoriaKey].providers[proveedorKey]) {
      grouped[categoriaKey].providers[proveedorKey] = [];
      grouped[categoriaKey].providerOrder.push(proveedorKey);
    }
    grouped[categoriaKey].providers[proveedorKey].push(it);
  });

  var lines = [];
  categoryOrder.forEach(function (categoriaKey, categoryIndex) {
    if (categoryIndex > 0) lines.push('');
    lines.push('📁 <b>' + safeTelegramText_(categoriaKey) + '</b>');
    grouped[categoriaKey].providerOrder.forEach(function (proveedorKey) {
      lines.push('▪️ <b>' + safeTelegramText_(proveedorKey) + '</b>');
      grouped[categoriaKey].providers[proveedorKey].forEach(function (it) {
        var qty = it.cantidad || '';
        var unidad = it.unidad || '';
        var producto = safeTelegramText_(it.producto || 'Producto sin nombre');
        var cantidad = safeTelegramText_(String(qty) + ' ' + unidad).trim();
        lines.push('• ' + producto + ' — ' + cantidad);
      });
    });
  });

  if (items.length > maxItems) {
    if (lines.length) lines.push('');
    lines.push('• +' + (items.length - maxItems) + ' producto(s) adicionales');
  }

  return lines.join('\n').replace(/\n+$/, '');
}

function normalizeUrgenciaLabel_(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'NORMAL';
  if (raw === 'urgente') return 'URGENTE';
  if (raw === 'alta') return 'ALTA';
  if (raw === 'media') return 'MEDIA';
  if (raw === 'baja') return 'BAJA';
  return String(value || '').trim().toUpperCase();
}

function safeTelegramText_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseJsonSafe_(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function extractJsonObjectText_(raw) {
  var text = String(raw || '').trim();
  if (!text) return '';
  if (text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') return text;
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return '';
  return text.slice(start, end + 1);
}

function ensureTelegramLogSheet_() {
  var sh = ss_().getSheetByName(SHEET_TELEGRAM_LOG);
  if (sh) return sh;
  sh = ss_().insertSheet(SHEET_TELEGRAM_LOG);
  sh.getRange(1, 1, 1, 8).setValues([[
    'Fecha_Hora', 'ID_Pedido', 'Local', 'Telegram_OK', 'Skipped', 'Status_Code', 'Mensaje', 'Detalle'
  ]]).setFontWeight('bold').setBackground('#355c7d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

function appendTelegramLog_(pedido, result) {
  var sh = ensureTelegramLogSheet_();
  var refId = pedido.id_pedido || pedido.id_stock || pedido.id_conteo || pedido.id_produccion || pedido.id_recepcion || '';
  sh.appendRow([
    Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'),
    refId,
    normalizeLocalName_(pedido.local || ''),
    result.ok ? 'SÍ' : 'NO',
    result.skipped ? 'SÍ' : 'NO',
    result.status_code || '',
    result.reason || result.error || '',
    result.body || ''
  ]);
}

function readTelegramLogByPedido_(pedidoId) {
  var sh = ss_().getSheetByName(SHEET_TELEGRAM_LOG);
  if (!sh || sh.getLastRow() < 2) return { configured: getTelegramSettings_().enabled, found: false };
  var values = sh.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
    if (String(values[r][1] || '').trim() !== pedidoId) continue;
    return {
      configured: getTelegramSettings_().enabled,
      found: true,
      fecha_hora: values[r][0] || '',
      ok: String(values[r][3] || '').trim().toUpperCase() === 'SÍ',
      skipped: String(values[r][4] || '').trim().toUpperCase() === 'SÍ',
      status_code: values[r][5] || '',
      message: values[r][6] || '',
      detail: values[r][7] || ''
    };
  }
  return { configured: getTelegramSettings_().enabled, found: false };
}

function buildPedidoPayloadFromSheets_(pedidoId) {
  pedidoId = String(pedidoId || '').trim();
  if (!pedidoId) return null;
  var pedido = findPedidoRowById_(pedidoId);
  if (!pedido) return null;
  var detalle = findDetalleRowsByPedidoId_(pedidoId);
  return {
    id_pedido: pedido[0] || '',
    fecha_hora: pedido[1] || '',
    local: pedido[2] || '',
    encargado: pedido[3] || '',
    semana_pedido: pedido[4] || '',
    email_encargado: pedido[5] || '',
    estado: pedido[6] || '',
    urgencia: pedido[7] || 'Normal',
    productos_solicitados: pedido[8] || '',
    total_productos: pedido[9] || detalle.length || 0,
    total_estimado: pedido[10] || '',
    fecha_entrega: pedido[11] || '',
    observaciones: pedido[12] || '',
    proveedor_asignado: pedido[13] || '',
    comprado: pedido[14] || 'NO',
    entregado: pedido[15] || 'NO',
    notas_gerencia: pedido[16] || '',
    items: detalle.map(function (row) {
      return {
        codigo: row[6] || '',
        producto: row[7] || '',
        categoria: row[8] || '',
        cantidad: row[9] || '',
        unidad: row[10] || '',
        proveedor: row[11] || ''
      };
    })
  };
}

function buildPedidoPayloadFromDetalle_(pedidoId) {
  pedidoId = String(pedidoId || '').trim();
  if (!pedidoId) return null;
  var detalle = findDetalleRowsByPedidoId_(pedidoId);
  if (!detalle.length) return null;
  var first = detalle[0];
  var proveedores = {};
  var productosTexto = [];
  detalle.forEach(function (row) {
    var producto = String(row[7] || '').trim();
    var cantidad = String(row[9] || '').trim();
    var unidad = String(row[10] || '').trim();
    var proveedor = String(row[11] || '').trim();
    if (producto) {
      productosTexto.push(producto + (cantidad ? ' - ' + cantidad + (unidad ? ' ' + unidad : '') : ''));
    }
    if (proveedor) proveedores[proveedor] = true;
  });
  return {
    id_pedido: pedidoId,
    fecha_hora: first[1] || '',
    local: first[3] || '',
    encargado: first[4] || '',
    semana_pedido: first[2] || '',
    email_encargado: '',
    estado: 'Recibido',
    urgencia: first[5] || 'Normal',
    productos_solicitados: productosTexto.join(', '),
    total_productos: detalle.length,
    total_estimado: '',
    fecha_entrega: '',
    observaciones: 'Pedido reconstruido desde PEDIDOS_DETALLE para reenvio Telegram',
    proveedor_asignado: Object.keys(proveedores).join(', '),
    comprado: 'NO',
    entregado: 'NO',
    notas_gerencia: '',
    items: detalle.map(function (row) {
      return {
        codigo: row[6] || '',
        producto: row[7] || '',
        categoria: row[8] || '',
        cantidad: row[9] || '',
        unidad: row[10] || '',
        proveedor: row[11] || ''
      };
    })
  };
}

function resendTelegramForPedido_(pedidoId) {
  var pedido = buildPedidoPayloadFromSheets_(pedidoId) || buildPedidoPayloadFromDetalle_(pedidoId);
  if (!pedido) return { ok: false, error: 'No encontré el pedido ' + pedidoId };
  return notifyTelegramForPedido_(pedido);
}

function idx_(headerLower, names) {
  for (var i = 0; i < names.length; i++) {
    var p = headerLower.indexOf(names[i]);
    if (p > -1) return p;
  }
  return -1;
}

function isActiveFlag_(value) {
  var normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized === 'sí' || normalized === 'si' || normalized === 's' ||
    normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1';
}

function keyFor_(local, codigo, nombre) {
  return normalizeLocalName_(local).toLowerCase() + '||' +
    (String(codigo || '').trim().toLowerCase() || String(nombre || '').trim().toLowerCase());
}

function normalizeLocalName_(local) {
  var value = String(local || '').trim();
  if (!value) return '';
  var low = value.toLowerCase();
  if (low === 'hamburguesería' || low === 'hamburgueseria') return 'Brooklyn';
  if (low === 'parrilla') return 'Umo Grill';
  if (low === 'heladería' || low === 'heladeria') return 'Puerto Gelato';
  if (low === 'cafetería' || low === 'cafeteria') return 'Trento Café';
  return value;
}

function normalizeLooseText_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function catalogForLocal_(local) {
  var catalog = readCatalog_();
  return catalog[normalizeLocalName_(local)] || [];
}

function scoreReceiptCatalogMatch_(candidate, item) {
  var lineNorm = normalizeLooseText_(candidate);
  var itemNorm = normalizeLooseText_(item.nombre || '');
  if (!lineNorm || !itemNorm) return 0;
  var score = 0;
  if (lineNorm.indexOf(itemNorm) > -1) score += 12;
  var itemTokens = itemNorm.split(' ').filter(function (token) { return token.length > 2; });
  var lineTokens = {};
  lineNorm.split(' ').forEach(function (token) {
    if (token.length > 2) lineTokens[token] = true;
  });
  itemTokens.forEach(function (token) {
    if (lineTokens[token]) score += 3;
  });
  var provNorm = normalizeLooseText_(item.proveedor || '');
  if (provNorm && lineNorm.indexOf(provNorm) > -1) score += 2;
  return score;
}

function resolveCatalogItemForAi_(match, catalog) {
  var code = String(match && match.codigo || '').trim().toLowerCase();
  var product = String(match && (match.producto || match.nombre) || '').trim();
  var productNorm = normalizeLooseText_(product);
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < catalog.length; i++) {
    var item = catalog[i];
    if (code && String(item.codigo || '').trim().toLowerCase() === code) return item;
    var score = 0;
    if (productNorm) score = scoreReceiptCatalogMatch_(product, item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 6 ? best : null;
}

function sanitizeAiReceiptMatches_(parsed, local) {
  var catalog = catalogForLocal_(local);
  var grouped = {};
  var unknownGrouped = {};
  var list = parsed && parsed.matches instanceof Array ? parsed.matches : [];
  for (var i = 0; i < list.length; i++) {
    var raw = list[i] || {};
    var item = resolveCatalogItemForAi_(raw, catalog);
    var qty = numberOrNull_(raw.cantidad_recibida);
    if (!(qty > 0)) continue;
    if (!item) {
      var unknownName = String(raw.producto || raw.nombre || raw.detalle || raw.sourceLine || raw.linea || '').trim();
      if (!unknownName) continue;
      var unknownKey = normalizeLooseText_(unknownName);
      if (!unknownGrouped[unknownKey]) {
        unknownGrouped[unknownKey] = {
          producto: unknownName,
          unidad: String(raw.unidad || 'unidad').trim() || 'unidad',
          categoria: String(raw.categoria || '').trim(),
          proveedor: String(raw.proveedor || parsed.proveedor || '').trim(),
          cantidad_recibida: 0,
          score: numberOrZero_(raw.score, 0),
          sourceLine: String(raw.sourceLine || raw.linea || raw.detalle || unknownName).trim()
        };
      }
      unknownGrouped[unknownKey].cantidad_recibida += qty;
      if (numberOrZero_(raw.score, 0) > numberOrZero_(unknownGrouped[unknownKey].score, 0)) {
        unknownGrouped[unknownKey].score = numberOrZero_(raw.score, 0);
      }
      continue;
    }
    var key = keyFor_(local, item.codigo || '', item.nombre || '');
    if (!grouped[key]) {
      grouped[key] = {
        key: key,
        codigo: item.codigo || '',
        producto: item.nombre || '',
        categoria: item.categoria || '',
        unidad: item.unidad || 'unidad',
        proveedor: item.proveedor || '',
        cantidad_recibida: 0,
        score: numberOrZero_(raw.score, 12),
        sourceLine: String(raw.sourceLine || raw.linea || raw.detalle || item.nombre || '').trim()
      };
    }
    grouped[key].cantidad_recibida += qty;
    if (raw.sourceLine || raw.linea || raw.detalle) {
      grouped[key].sourceLine = String(raw.sourceLine || raw.linea || raw.detalle || '').trim();
    }
  }
  var matches = Object.keys(grouped).map(function (key) {
    var row = grouped[key];
    row.cantidad_recibida = numberOrBlank_(row.cantidad_recibida);
    return row;
  }).sort(function (a, b) { return numberOrZero_(b.score) - numberOrZero_(a.score); });
  var unknown_items = Object.keys(unknownGrouped).map(function (key) {
    var row = unknownGrouped[key];
    row.cantidad_recibida = numberOrBlank_(row.cantidad_recibida);
    return row;
  }).sort(function (a, b) { return numberOrZero_(b.score) - numberOrZero_(a.score); });
  var proveedor = String(parsed && parsed.proveedor || '').trim();
  return {
    rawText: String(parsed && parsed.rawText || '').trim(),
    matches: matches,
    unknown_items: unknown_items,
    proveedor: proveedor
  };
}

function openAiResponseText_(payload, settings) {
  var response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + settings.api_key
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var raw = response.getContentText() || '';
  if (code < 200 || code >= 300) {
    throw new Error('OpenAI HTTP ' + code + ': ' + raw.slice(0, 400));
  }
  var parsed = parseJsonSafe_(raw);
  if (!parsed) throw new Error('OpenAI devolvió JSON inválido');
  if (parsed.output_text) return String(parsed.output_text);
  if (parsed.output instanceof Array) {
    for (var i = 0; i < parsed.output.length; i++) {
      var item = parsed.output[i];
      if (!item || !(item.content instanceof Array)) continue;
      for (var j = 0; j < item.content.length; j++) {
        var content = item.content[j];
        if (content && typeof content.text === 'string' && content.text.trim()) {
          return content.text;
        }
      }
    }
  }
  throw new Error('OpenAI no devolvió texto utilizable');
}

function isReceiptNoiseLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower) return true;
  if (lower.length < 4) return true;
  if (/\b(total|subtotal|iva|descuento|recargo|cambio|efectivo|tarjeta|debito|credito|transferencia|pago|abonado|saldo|vuelto|cajero|cliente|mesa|pedido|comprobante|factura|ticket|remito|fecha|hora|cuit|cuil|direccion|domicilio|telefono|tel|gracias|pagina)\b/.test(lower)) return true;
  if (/^\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?$/.test(lower)) return true;
  return false;
}

function isReceiptStopLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower) return false;
  return /\b(subtotal|total final|total|saldo|neto|per iva|per iibb|vencimientos|observaciones|cae|son pesos|firma|aclaracion|dni|importe total en letras)\b/.test(lower);
}

function looksLikeReceiptHeaderLine_(line) {
  var lower = String(line || '').toLowerCase();
  return /\b(articulo|articulos|producto|productos|descripcion|detalle|cant|cantidad|precio|p unit|punit|unitario|importe)\b/.test(lower);
}

function looksLikeReceiptContinuationLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower || isReceiptNoiseLine_(lower) || isReceiptStopLine_(lower)) return false;
  if (/\d/.test(lower)) return false;
  return /[a-z]/.test(lower) && lower.length >= 6;
}

function looksLikeReceiptItemLine_(line) {
  var lower = String(line || '').toLowerCase();
  if (!lower || isReceiptNoiseLine_(lower) || isReceiptStopLine_(lower)) return false;
  if (!/[a-z]/.test(lower)) return false;
  var nums = lower.match(/\d+(?:[.,]\d+)?/g) || [];
  var hasMoneyHint = /\$\s*\d|\b\d+(?:[.,]\d+)?\s*(?:c\/u|cu)\b/.test(lower);
  var hasQtyOrAmountHint = /\b\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilos|gr|g|lt|lts|l|un|u|unidad|unidades|doc|pack|paq|bolsa|caja)\b/.test(lower);
  if (nums.length >= 3) return true;
  if (nums.length >= 2 && (hasMoneyHint || hasQtyOrAmountHint)) return true;
  return false;
}

function extractReceiptTableLines_(text) {
  var lines = String(text || '').split(/\r?\n/).map(function (line) {
    return String(line || '').trim();
  }).filter(Boolean);
  var out = [];
  var inTable = false;
  lines.forEach(function (line) {
    if (looksLikeReceiptHeaderLine_(line)) {
      inTable = true;
      return;
    }
    if (!inTable) return;
    if (isReceiptStopLine_(line)) {
      inTable = false;
      return;
    }
    if (looksLikeReceiptItemLine_(line) || looksLikeReceiptContinuationLine_(line)) out.push(line);
  });
  return out;
}

function filterReceiptOcrText_(text) {
  var tableLines = extractReceiptTableLines_(text);
  var fallback = String(text || '').split(/\r?\n/).map(function (line) {
    return String(line || '').trim();
  }).filter(function (line) {
    return looksLikeReceiptHeaderLine_(line) || looksLikeReceiptItemLine_(line);
  });
  var filtered = tableLines.length ? tableLines : fallback;
  return filtered.join('\n');
}

function parseReceiptTextAi_(local, text) {
  local = normalizeLocalName_(local);
  text = String(text || '').trim();
  if (!local) return { ok: false, error: 'Falta local' };
  if (!text) return { ok: false, error: 'Falta texto OCR' };
  text = filterReceiptOcrText_(text) || text;
  var settings = getOpenAiSettings_();
  if (!settings.enabled) return { ok: false, disabled: true, error: 'openai_disabled' };
  var catalog = catalogForLocal_(local);
  if (!catalog.length) return { ok: false, error: 'Catálogo vacío para ' + local };
  var compactCatalog = catalog.map(function (item) {
    return {
      codigo: item.codigo || '',
      producto: item.nombre || '',
      unidad: item.unidad || 'unidad',
      categoria: item.categoria || '',
      proveedor: item.proveedor || ''
    };
  });
  var prompt = [
    'Local: ' + local,
    'Catalogo permitido (usar solo estos productos): ' + JSON.stringify(compactCatalog),
    'Texto OCR de la boleta/remito:',
    text,
    'Devolve solo JSON valido con esta forma exacta:',
    '{"proveedor":"","matches":[{"codigo":"","producto":"","cantidad_recibida":0,"sourceLine":"","score":0}],"unknown_items":[{"producto":"","cantidad_recibida":0,"unidad":"unidad","categoria":"","proveedor":"","sourceLine":"","score":0}]}',
    'Reglas:',
    '- trabajar solo con lineas de items que parezcan articulo/producto + precio + cantidad + importe',
    '- ignorar encabezados, totales, subtotales, iva, fechas, cuit, medios de pago, observaciones y cualquier texto administrativo',
    '- usar solo productos del catalogo entregado dentro de matches',
    '- si detectas productos de la foto que no estan en el catalogo, ponerlos en unknown_items',
    '- si una linea tiene cantidad pero no podes mapearla con confianza alta al catalogo, debe ir a unknown_items',
    '- no omitas productos legibles solo porque no estan en el catalogo',
    '- consolidar duplicados',
    '- cantidad_recibida debe ser numerica y mayor a 0',
    '- si no estas seguro, no inventes coincidencias',
    '- score es 0 a 100 segun confianza',
    '- solo usar matches cuando la coincidencia sea profesionalmente defendible; si no, preferir unknown_items'
  ].join('\n');
  var rawText = openAiResponseText_({
    model: settings.model,
    reasoning: { effort: 'low' },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'Sos un extractor operativo de recepciones de mercaderia. Solo tenes que leer lineas de items con estructura articulo o producto, precio, cantidad e importe. Ignora por completo totales, subtotales, IVA, fechas, CUIT, medios de pago y cualquier texto fuera del detalle de items. Tu trabajo es mapear OCR ruidoso a un catalogo fijo y devolver solo JSON. Si detectas un producto legible que no coincide con suficiente confianza con el catalogo, no lo descartes: devolvelo en unknown_items.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt
          }
        ]
      }
    ]
  }, settings);
  var parsed = parseJsonSafe_(extractJsonObjectText_(rawText));
  if (!parsed) throw new Error('No pude parsear la respuesta JSON de OpenAI');
  var sanitized = sanitizeAiReceiptMatches_(parsed, local);
  sanitized.rawText = text;
  return {
    ok: true,
    model: settings.model,
    proveedor: sanitized.proveedor,
    matches: sanitized.matches,
    unknown_items: sanitized.unknown_items,
    rawText: sanitized.rawText
  };
}

function latestStockMap_() {
  var sh = ss_().getSheetByName(SHEET_STOCK);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var local = row[2], codigo = row[5], producto = row[6];
    out[keyFor_(local, codigo, producto)] = {
      fecha_hora: row[1],
      tipo_conteo: row[4],
      stock_real: numberOrZero_(row[9], 0)
    };
  }
  return out;
}

function pendingDemandMap_() {
  return pendingDemandSummary_().demandMap;
}

function pendingDemandSummary_() {
  var sh = ss_().getSheetByName(SHEET_DETALLE);
  if (!sh || sh.getLastRow() < 2) return { demandMap: {}, activeRows: [] };
  var values = sh.getDataRange().getValues();
  var out = {};
  var activeRows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var estado = String(row[12] || '').trim().toLowerCase();
    if (estado === 'entregado' || estado === 'cancelado') continue;
    activeRows.push(row.slice(0, DETALLE_HEADERS.length));
    var key = keyFor_(row[3], row[6], row[7]);
    if (!out[key]) out[key] = { cantidad: 0, pedidos: 0 };
    out[key].cantidad += numberOrZero_(row[9], 0);
    out[key].pedidos += 1;
  }
  return { demandMap: out, activeRows: activeRows };
}

function computeOperationalSnapshot_() {
  var catalog = readCatalog_();
  var stockMap = latestStockMap_();
  var demandSummary = pendingDemandSummary_();
  var demandMap = demandSummary.demandMap;
  var recepcion = readRecepcionResumen_();
  var produccion = readProduccionResumen_();
  var elaborados = readElaboradosResumen_();
  var records = [];
  var localSummary = {};
  var totalProductos = 0;
  var totalConConteo = 0;
  var totalSinStock = 0;
  var totalFaltantes = 0;
  var totalPedidoCantidad = 0;
  var localesConRiesgo = 0;

  Object.keys(catalog).forEach(function (local) {
    var localRisk = false;
    (catalog[local] || []).forEach(function (item) {
      var key = keyFor_(local, item.codigo, item.nombre);
      var stockRec = stockMap[key] || {};
      var demandRec = demandMap[key] || { cantidad: 0, pedidos: 0 };
      var stockReal = numberOrZero_(stockRec.stock_real, item.stock_actual);
      var pedidosPend = numberOrZero_(demandRec.cantidad, 0);
      var saldo = round2_(stockReal - pedidosPend);
      var status = saldo < 0 ? 'Faltante' : (stockReal <= 0 ? 'Sin stock' : (pedidosPend > 0 ? 'Cubierto' : 'Disponible'));
      records.push([
        local,
        item.codigo || '',
        item.nombre || '',
        item.categoria || '',
        item.unidad || '',
        stockReal,
        demandRec.pedidos || 0,
        pedidosPend,
        saldo,
        status,
        stockRec.tipo_conteo || '',
        stockRec.fecha_hora || ''
      ]);

      totalProductos += 1;
      totalPedidoCantidad += pedidosPend;
      if (stockReal > 0) totalConConteo += 1;
      if (stockReal <= 0) totalSinStock += 1;
      if (saldo < 0) {
        totalFaltantes += 1;
        localRisk = true;
      }

      if (!localSummary[local]) localSummary[local] = { productos: 0, conStock: 0, sinStock: 0, pedidos: 0, faltantes: 0 };
      localSummary[local].productos += 1;
      if (stockReal > 0) localSummary[local].conStock += 1; else localSummary[local].sinStock += 1;
      localSummary[local].pedidos += demandRec.pedidos || 0;
      if (saldo < 0) localSummary[local].faltantes += 1;
    });
    if (localRisk) localesConRiesgo += 1;
  });

  return {
    catalog: catalog,
    records: records,
    localSummary: localSummary,
    totalProductos: totalProductos,
    totalConConteo: totalConConteo,
    totalSinStock: totalSinStock,
    totalFaltantes: totalFaltantes,
    totalPedidoCantidad: round2_(totalPedidoCantidad),
    totalPedidosAbiertos: demandSummary.activeRows.length,
    activeRows: demandSummary.activeRows,
    localesConRiesgo: localesConRiesgo
    ,
    totalRecepcionMovimientos: recepcion.total_movimientos || 0,
    totalRecepcionCantidad: Object.keys(recepcion.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(recepcion.byLocal[local].cantidad, 0);
    }, 0),
    totalProduccionMovimientos: produccion.total_movimientos || 0,
    totalProduccionCantidad: Object.keys(produccion.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(produccion.byLocal[local].cantidad_producida, 0);
    }, 0),
    totalElaboradosMovimientos: elaborados.total_movimientos || 0,
    totalElaboradosCantidad: Object.keys(elaborados.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(elaborados.byLocal[local].cantidad, 0);
    }, 0)
  };
}

function buildFrontendOperationalSnapshot_() {
  var snap = computeOperationalSnapshot_();
  return {
    generated_at: Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'),
    totals: {
      productos: snap.totalProductos,
      con_stock: snap.totalConConteo,
      sin_stock: snap.totalSinStock,
      faltantes: snap.totalFaltantes,
      pedidos_abiertos: snap.totalPedidosAbiertos,
      cantidad_pedida: snap.totalPedidoCantidad,
      locales_con_riesgo: snap.localesConRiesgo,
      recepciones: snap.totalRecepcionMovimientos,
      produccion: snap.totalProduccionMovimientos,
      elaborados: snap.totalElaboradosMovimientos
    },
    byLocal: snap.localSummary,
    openItemsByLocal: buildOpenItemsByLocalFromRows_(snap.activeRows || [])
  };
}

function buildOpenItemsByLocal_() {
  return buildOpenItemsByLocalFromRows_(activePedidoRows_());
}

function buildOpenItemsByLocalFromRows_(rows) {
  var out = {};
  rows.forEach(function (row) {
    var local = normalizeLocalName_(row[3]);
    if (local === 'Pizzería') return;
    if (!local) return;
    if (!out[local]) out[local] = [];
    out[local].push({
      fecha_hora: row[1],
      semana: row[2],
      producto: row[7],
      cantidad: numberOrZero_(row[9], 0),
      unidad: row[10] || '',
      proveedor: row[11] || '',
      urgencia: row[5] || 'Normal',
      estado: row[12] || 'Pendiente'
    });
  });
  Object.keys(out).forEach(function (local) {
    out[local] = out[local]
      .sort(function (a, b) { return comparableDateTime_(b.fecha_hora) - comparableDateTime_(a.fecha_hora); })
      .slice(0, 8);
  });
  return out;
}

function activePedidoRows_() {
  return pendingDemandSummary_().activeRows;
}

function recepcionRows_() {
  var sh = ss_().getSheetByName(SHEET_RECEPCION);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).reverse();
}

function produccionRows_() {
  var sh = ss_().getSheetByName(SHEET_PRODUCCION);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).reverse();
}

function elaboradosRows_() {
  var sh = ss_().getSheetByName(SHEET_ELABORADOS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).reverse();
}

function comprasRows_() {
  var catalog = readCatalog_();
  var demandMap = pendingDemandMap_();
  var bucket = {};
  Object.keys(catalog).forEach(function (local) {
    (catalog[local] || []).forEach(function (item) {
      var demand = demandMap[keyFor_(local, item.codigo, item.nombre)];
      if (!demand || !demand.cantidad) return;
      var key = [item.proveedor || 'Sin proveedor', item.categoria || '', item.nombre || '', item.unidad || ''].join('||');
      if (!bucket[key]) {
        bucket[key] = {
          proveedor: item.proveedor || 'Sin proveedor',
          categoria: item.categoria || '',
          producto: item.nombre || '',
          unidad: item.unidad || '',
          cantidad: 0,
          locales: {}
        };
      }
      bucket[key].cantidad += numberOrZero_(demand.cantidad, 0);
      bucket[key].locales[local] = true;
    });
  });
  return Object.keys(bucket).sort().map(function (key) {
    var rec = bucket[key];
    return [rec.proveedor, rec.categoria, rec.producto, rec.unidad, round2_(rec.cantidad), Object.keys(rec.locales).sort().join(', ')];
  });
}

function topUrgentRows_(limit) {
  var rows = activePedidoRows_().filter(function (row) {
    return String(row[5] || '').trim().toLowerCase() === 'urgente';
  }).slice(0, limit || 8);
  return rows.map(function (row) {
    return [row[3], row[7], row[9], row[5]];
  });
}

function latestStockRows_(limit) {
  var sh = ss_().getSheetByName(SHEET_STOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var rows = values.slice(1).reverse().slice(0, limit || 8);
  return rows.map(function (row) {
    return [row[1], row[2], row[6], row[4]];
  });
}

function latestOpsRows_(limit) {
  var recep = readRecepcionResumen_().latest.map(function (row) {
    return {
      stamp: comparableDateTime_(row.fecha_hora),
      values: [row.fecha_hora, row.local, 'Recepción', row.producto + ' · ' + row.cantidad_recibida + ' ' + row.unidad]
    };
  });
  var prod = readProduccionResumen_().latest.map(function (row) {
    return {
      stamp: comparableDateTime_(row.fecha_hora),
      values: [row.fecha_hora, row.local, 'Producción', (row.producto_elaborado || row.insumo) + ' · lote ' + (row.lote || '—')]
    };
  });
  var elab = readElaboradosResumen_().latest.map(function (row) {
    return {
      stamp: comparableDateTime_(row.fecha_hora),
      values: [row.fecha_hora, row.local, 'Elaborados', row.producto_elaborado + ' · ' + row.cantidad + ' ' + row.unidad]
    };
  });
  return recep.concat(prod).concat(elab)
    .sort(function (a, b) { return b.stamp - a.stamp; })
    .slice(0, limit || 8)
    .map(function (row) { return row.values; });
}

function operationalLocals_() {
  var catalog = readCatalog_();
  var config = readConfig_();
  var demandRows = activePedidoRows_();
  var recep = readRecepcionResumen_().byLocal || {};
  var prod = readProduccionResumen_().byLocal || {};
  var elab = readElaboradosResumen_().byLocal || {};
  var map = {};

  Object.keys(catalog).forEach(function (local) { map[local] = true; });
  Object.keys(config).forEach(function (local) { map[local] = true; });
  Object.keys(recep).forEach(function (local) { map[local] = true; });
  Object.keys(prod).forEach(function (local) { map[local] = true; });
  Object.keys(elab).forEach(function (local) { map[local] = true; });
  demandRows.forEach(function (row) {
    var local = normalizeLocalName_(row[3]);
    if (local) map[local] = true;
  });

  return Object.keys(map).sort();
}

function localSheetName_(prefix, local) {
  return sanitizeSheetName_(prefix + local);
}

function sanitizeSheetName_(value) {
  return String(value || '')
    .replace(/[\\\/\?\*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 99);
}

function ensureSheet_(name) {
  return ss_().getSheetByName(name) || ss_().insertSheet(name);
}

function applyCatalogColumnUpdates_(sh, values, changedRows, iStock, iFecha, iNotas, changedStock, changedFecha, changedNotas) {
  if (!values || values.length < 2 || !changedRows || !changedRows.length) return;
  var rowGroups = contiguousRowGroups_(changedRows);
  rowGroups.forEach(function (group) {
    if (changedStock && iStock > -1) {
      sh.getRange(group.start, iStock + 1, group.length, 1).setValues(values.slice(group.start - 1, group.start - 1 + group.length).map(function (row) { return [row[iStock]]; }));
    }
    if (changedFecha && iFecha > -1) {
      sh.getRange(group.start, iFecha + 1, group.length, 1).setValues(values.slice(group.start - 1, group.start - 1 + group.length).map(function (row) { return [row[iFecha]]; }));
    }
    if (changedNotas && iNotas > -1) {
      sh.getRange(group.start, iNotas + 1, group.length, 1).setValues(values.slice(group.start - 1, group.start - 1 + group.length).map(function (row) { return [row[iNotas]]; }));
    }
  });
}

function contiguousRowGroups_(rows) {
  if (!rows || !rows.length) return [];
  var sorted = rows.slice().sort(function (a, b) { return a - b; });
  var groups = [];
  var start = sorted[0];
  var prev = sorted[0];
  for (var i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev || sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    groups.push({ start: start, length: prev - start + 1 });
    start = sorted[i];
    prev = sorted[i];
  }
  groups.push({ start: start, length: prev - start + 1 });
  return groups;
}

function clearPresentationSheet_(sh, cols) {
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.clearNotes();
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(0);
  sh.setFrozenColumns(0);
  if (cols && cols > 0) {
    for (var c = 1; c <= cols; c++) sh.setColumnWidth(c, 140);
  }
}

/**
 * Deja todas las hojas operativas listas para imprimir con texto legible.
 * Google Sheets calcula los cortes entre filas; el ajuste de texto y la altura
 * automática evitan que un registro quede recortado al cambiar de página.
 */
function prepareOperationalSheetsForPrint() {
  applyPrintLayoutToOperationalSheets_();
  SpreadsheetApp.getActive().toast(
    'Hojas operativas preparadas en 14 pt con filas completas y encabezados congelados',
    'Impresión lista',
    6
  );
}

function applyPrintLayoutToOperationalSheets_() {
  var ss = ss_();
  ss.getSheets().forEach(function (sh) {
    if (!isPrintableOperationalSheet_(sh.getName())) return;
    applyPrintLayoutToSheet_(sh);
  });
}

function isPrintableOperationalSheet_(sheetName) {
  var printableNames = [
    SHEET_HOME,
    SHEET_STOCK_DASH,
    SHEET_VIEW_PED,
    SHEET_VIEW_STK,
    SHEET_VIEW_BUY,
    SHEET_VIEW_REC,
    SHEET_VIEW_PROD,
    SHEET_VIEW_ELAB,
    SHEET_REPORT_ELAB,
    SHEET_RESUMEN,
    SHEET_PEDIDOS,
    SHEET_DETALLE,
    SHEET_STOCK,
    SHEET_RECEPCION,
    SHEET_PRODUCCION,
    SHEET_ELABORADOS
  ];
  return printableNames.indexOf(sheetName) !== -1 ||
    sheetName.indexOf(SHEET_LOCAL_PED_PREFIX) === 0 ||
    sheetName.indexOf(SHEET_LOCAL_STK_PREFIX) === 0;
}

function applyPrintLayoutToSheet_(sh) {
  var lastRow = sh.getLastRow();
  var lastColumn = sh.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return;

  var usedRange = sh.getRange(1, 1, lastRow, lastColumn);
  usedRange
    .setFontSize(PRINT_FONT_SIZE)
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  // Los títulos conservan jerarquía visual, pero ningún texto baja de 14 pt.
  sh.getRange(1, 1, 1, lastColumn).setFontSize(18).setFontWeight('bold');
  if (lastRow >= 2) sh.getRange(2, 1, 1, lastColumn).setFontSize(PRINT_FONT_SIZE);

  // Al imprimir con "Repetir filas congeladas", el encabezado acompaña cada página.
  if (sh.getFrozenRows() === 0) sh.setFrozenRows(1);
  sh.autoResizeRows(1, lastRow);
}

function normalizeLegacyLocalNames_() {
  var renameSpecs = [
    { from: 'Hamburguesería', to: 'Brooklyn' },
    { from: 'Hamburgueseria', to: 'Brooklyn' },
    { from: 'Parrilla', to: 'Umo Grill' },
    { from: 'Heladería', to: 'Puerto Gelato' },
    { from: 'Heladeria', to: 'Puerto Gelato' },
    { from: 'Cafetería', to: 'Trento Café' },
    { from: 'Cafeteria', to: 'Trento Café' }
  ];
  var sheetSpecs = [
    { name: SHEET_CATALOGO, headers: ['local_aplicable', 'local'] },
    { name: SHEET_CONFIG, headers: ['local'] },
    { name: SHEET_PEDIDOS, headers: ['local'] },
    { name: SHEET_DETALLE, headers: ['local'] },
    { name: SHEET_STOCK, headers: ['local'] },
    { name: SHEET_RECEPCION, headers: ['local'] },
    { name: SHEET_PRODUCCION, headers: ['local'] },
    { name: SHEET_ELABORADOS, headers: ['local'] }
  ];
  sheetSpecs.forEach(function (sheetSpec) {
    renameSpecs.forEach(function (renameSpec) {
      renameLocalAcrossSheet_(sheetSpec.name, sheetSpec.headers, renameSpec.from, renameSpec.to);
    });
  });
}

function renameLocalAcrossSheet_(sheetName, headerNames, from, to) {
  var sh = ss_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var col = idx_(head, headerNames);
  if (col === -1) return;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][col] || '').trim().toLowerCase() === String(from).trim().toLowerCase()) {
      sh.getRange(r + 1, col + 1).setValue(to);
    }
  }
}

function paintCards_(sh, rowStart, colStart, width, cards) {
  for (var i = 0; i < cards.length; i++) {
    var blockCol = colStart + (i % 2) * 4;
    var blockRow = rowStart + Math.floor(i / 2) * 2;
    sh.getRange(blockRow, blockCol, 1, width).merge().setValue(cards[i][0])
      .setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');
    sh.getRange(blockRow + 1, blockCol, 1, 2).merge().setValue(cards[i][1])
      .setBackground('#FFFFFF').setFontWeight('bold').setFontSize(18).setFontColor('#1C3448');
    sh.getRange(blockRow + 1, blockCol + 2, 1, 1).setValue(cards[i][2])
      .setBackground('#FFFFFF').setFontColor('#5B7082').setFontSize(10).setWrap(true);
    sh.getRange(blockRow, blockCol, 2, width).setBorder(true, true, true, true, false, false, '#CBD9E4', SpreadsheetApp.BorderStyle.SOLID);
  }
}

function applyBanding_(sh, headerRow, numRows, numCols) {
  var range = sh.getRange(headerRow, 1, numRows, numCols);
  var bandings = sh.getBandings();
  for (var i = 0; i < bandings.length; i++) bandings[i].remove();
  range.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
}

function applyCorporateTabTheme_() {
  var ss = ss_();
  var tabColors = {};
  tabColors[SHEET_HOME] = '#103F59';
  tabColors[SHEET_VIEW_PED] = '#0F5E7A';
  tabColors[SHEET_VIEW_STK] = '#1F6E5A';
  tabColors[SHEET_VIEW_BUY] = '#8A5B00';
  tabColors[SHEET_VIEW_REC] = '#2D7D9A';
  tabColors[SHEET_VIEW_PROD] = '#2B7A68';
  tabColors[SHEET_VIEW_ELAB] = '#7A4A22';
  tabColors[SHEET_REPORT_ELAB] = '#D05A08';
  tabColors[SHEET_STOCK_DASH] = '#355C7D';
  tabColors[SHEET_RESUMEN] = '#4F6D7A';
  tabColors[SHEET_DETALLE] = '#7A8B99';
  tabColors[SHEET_STOCK] = '#7A8B99';
  tabColors[SHEET_RECEPCION] = '#7A8B99';
  tabColors[SHEET_PRODUCCION] = '#7A8B99';
  tabColors[SHEET_ELABORADOS] = '#7A8B99';
  tabColors[SHEET_PEDIDOS] = '#95A5A6';
  tabColors[SHEET_CATALOGO] = '#95A5A6';
  tabColors[SHEET_CONFIG] = '#95A5A6';

  var order = [
    SHEET_HOME, SHEET_REPORT_ELAB, SHEET_STOCK_DASH, SHEET_VIEW_PED, SHEET_VIEW_STK, SHEET_VIEW_REC, SHEET_VIEW_PROD, SHEET_VIEW_ELAB, SHEET_VIEW_BUY,
    SHEET_RESUMEN, SHEET_DETALLE, SHEET_STOCK, SHEET_RECEPCION, SHEET_PRODUCCION, SHEET_ELABORADOS, SHEET_PEDIDOS, SHEET_CATALOGO, SHEET_CONFIG
  ];
  for (var i = 0; i < order.length; i++) {
    var sh = ss.getSheetByName(order[i]);
    if (!sh) continue;
    sh.setTabColor(tabColors[order[i]] || '#95A5A6');
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  }
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name.indexOf(SHEET_LOCAL_PED_PREFIX) === 0) sheet.setTabColor('#2D7D9A');
    if (name.indexOf(SHEET_LOCAL_STK_PREFIX) === 0) sheet.setTabColor('#2B7A68');
  });
  var home = ss.getSheetByName(SHEET_HOME);
  if (home) ss.setActiveSheet(home);
}

function numberOrNull_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  var num = parseFloat(String(value).replace(',', '.'));
  return isNaN(num) ? null : num;
}

function numberOrZero_(value, fallback) {
  var num = numberOrNull_(value);
  if (num === null) return typeof fallback === 'number' ? fallback : 0;
  return num;
}

function numberOrBlank_(value) {
  var num = numberOrNull_(value);
  return num === null ? '' : num;
}

function comparableDateTime_(value) {
  var txt = String(value || '').trim();
  if (!txt) return 0;
  var iso = Date.parse(txt);
  if (!isNaN(iso)) return iso;
  var m = txt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  return 0;
}

function round2_(num) {
  return Math.round(num * 100) / 100;
}
