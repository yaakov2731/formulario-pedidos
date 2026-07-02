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
var SHEET_STOCK_DASH = 'DASHBOARD STOCK';
var SHEET_HOME     = 'INICIO OPERATIVO';
var SHEET_VIEW_PED = 'VISTA PEDIDOS';
var SHEET_VIEW_STK = 'VISTA STOCK';
var SHEET_VIEW_BUY = 'VISTA COMPRAS';
var SHEET_VIEW_REC = 'VISTA RECEPCION';
var SHEET_VIEW_PROD = 'VISTA PRODUCCION';
var SHEET_LOCAL_PED_PREFIX = 'LOCAL PEDIDO · ';
var SHEET_LOCAL_STK_PREFIX = 'LOCAL STOCK · ';
var SHEET_TELEGRAM_LOG = 'LOG TELEGRAM';
var APP_VERSION = '2.2.0';

var DETALLE_HEADERS = ['ID_Pedido','Fecha_Hora','Semana','Local','Encargado','Urgencia',
  'Código','Producto','Categoría','Cantidad','Unidad','Proveedor','Estado','Comprado','Entregado'];
var STOCK_HEADERS = ['ID_Conteo','Fecha_Hora','Local','Encargado','Tipo_Conteo','Código','Producto','Categoría',
  'Unidad','Stock_Real','Estado_Stock','Observaciones'];
var RECEPCION_HEADERS = ['ID_Recepcion','Fecha_Hora','Local','Encargado','Proveedor','Código','Producto','Categoría',
  'Unidad','Cantidad_Recibida','Estado','Observaciones'];
var PRODUCCION_HEADERS = ['ID_Produccion','Fecha_Hora','Local','Encargado','Producto_Elaborado','Lote','Código_Insumo',
  'Insumo','Categoría','Unidad','Cantidad_Usada','Cantidad_Producida','Estado','Observaciones'];

/* ============================== WEB API ============================== */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'getBootstrap') {
      return json({
        ok: true,
        version: APP_VERSION,
        capabilities: appCapabilities_(),
        config: readConfig_(),
        responsables: readResponsables_(),
        catalog: readCatalog_(),
        recepciones: readRecepcionResumen_(),
        produccion: readProduccionResumen_(),
        snapshot: buildFrontendOperationalSnapshot_()
      });
    }
    if (action === 'getPedidoStatus') {
      return json(getPedidoStatus_((e && e.parameter && e.parameter.id_pedido) || ''));
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
    if (data.action === 'addResponsable'){ return json(addResponsableConfig_(data)); }
    if (data.action === 'saveStock')     { return json(saveStockConteo_(data)); }
    if (data.action === 'saveReception') { return json(saveRecepcion_(data)); }
    if (data.action === 'saveProduction'){ return json(saveProduccion_(data)); }
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
  var prefix = prefixFor_(d.local);
  var maxNum = 0;
  for (var r = 1; r < values.length; r++) {
    var cod = String(values[r][0] || '').trim();
    if (cod.indexOf(prefix) === 0) {
      var num = parseInt(cod.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  var codigo = prefix + ('000' + (maxNum + 1)).slice(-3);
  var hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
  // Código,Producto,Descripción,Local_Aplicable,Categoría,Unidad_Medida,Precio_Unitario,Proveedor,Stock_Actual,Stock_Mínimo,Estado,Fecha,Notas
  sh.appendRow([
    codigo, d.nombre, d.descripcion || '', d.local, d.categoria || 'General',
    d.unidad || 'unidad', '', d.proveedor || '', '', '', 'Disponible', hoy, ''
  ]);
  return { ok: true, codigo: codigo };
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
  return { ok: true };
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function appCapabilities_() {
  var telegram = getTelegramSettings_();
  return {
    pedido: true,
    stock: true,
    recepcion: true,
    produccion: true,
    dashboard_v2: true,
    local_alias_normalization: true,
    movement_views: true,
    bootstrap_v2: true,
    pedido_status: true,
    telegram_notify: telegram.enabled
  };
}

function savePedido_(data) {
  appendPedido_(data);
  appendDetalle_(data, { skipRefresh: true });   // capa normalizada: 1 fila por producto
  var telegram = notifyTelegramForPedido_(data);
  refreshOperationalViews_();
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
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return {};
  var values = sh.getDataRange().getValues();
  var out = {};
  var start = -1, cLocal = 0, cEnc = 1, cEmail = 2, cAct = -1;
  for (var r = 0; r < values.length; r++) {
    var rowLower = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (rowLower.indexOf('local') > -1 && rowLower.indexOf('encargado') > -1) {
      start = r + 1;
      cLocal = rowLower.indexOf('local');
      cEnc   = rowLower.indexOf('encargado');
      cEmail = rowLower.indexOf('email');
      cAct   = rowLower.indexOf('activo');
      break;
    }
  }
  if (start === -1) return {};
  for (var i = start; i < values.length; i++) {
    var local = normalizeLocalName_(values[i][cLocal]);
    if (!local) break;                 // fin del bloque de encargados
    if (local.charAt(0) === '🔧' || local.charAt(0) === '🔗') break;
    if (cAct > -1 && !isActiveFlag_(values[i][cAct])) continue;
    if (!out[local]) out[local] = {    // primero gana = encargado oficial (default del form)
      enc:   cEnc   > -1 ? String(values[i][cEnc]   || '').trim() : '',
      email: cEmail > -1 ? String(values[i][cEmail] || '').trim() : ''
    };
  }
  return out;
}

/* Todos los responsables por local (para la pantalla de Configuración). */
function readResponsables_() {
  var sh = ss_().getSheetByName(SHEET_CONFIG);
  if (!sh) return {};
  var values = sh.getDataRange().getValues();
  var out = {}, start = -1, cLocal = 0, cEnc = 1, cEmail = 2, cAct = -1;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) {
      start = r + 1; cLocal = low.indexOf('local'); cEnc = low.indexOf('encargado'); cEmail = low.indexOf('email'); cAct = low.indexOf('activo'); break;
    }
  }
  if (start === -1) return {};
  for (var i = start; i < values.length; i++) {
    var local = normalizeLocalName_(values[i][cLocal]);
    if (!local) break;
    if (local.charAt(0) === '🔧' || local.charAt(0) === '🔗') break;
    if (cAct > -1 && !isActiveFlag_(values[i][cAct])) continue;
    if (!out[local]) out[local] = [];
    out[local].push({
      nombre: cEnc   > -1 ? String(values[i][cEnc]   || '').trim() : '',
      email:  cEmail > -1 ? String(values[i][cEmail] || '').trim() : ''
    });
  }
  return out;
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
  if (!sh || sh.getLastRow() < 2) return null;
  var values = sh.getDataRange().getValues();
  for (var r = values.length - 1; r >= 1; r--) {
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
  return { ok: true, id_stock: conteoId, rows: rows.length };
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
  return { ok: true, id_produccion: produccionId, rows: rows.length };
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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Docks V2')
    .addItem('Aplicar interfaz corporativa', 'setupVersion2UI')
    .addItem('Reconstruir vistas operativas', 'refreshOperationalViews_')
    .addItem('Reconstruir stock, recepción y producción', 'refreshMovementViews_')
    .addItem('Setup plantilla pro', 'setupPlantillaPro')
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

function ensureVersion2Sheets_() {
  createStockSheet_();
  createRecepcionSheet_();
  createProduccionSheet_();
  ensureSheet_(SHEET_HOME);
  ensureSheet_(SHEET_STOCK_DASH);
  ensureSheet_(SHEET_VIEW_PED);
  ensureSheet_(SHEET_VIEW_STK);
  ensureSheet_(SHEET_VIEW_REC);
  ensureSheet_(SHEET_VIEW_PROD);
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
    ['Producción', snap.totalProduccionMovimientos, 'partes productivos']
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

  sh.getRange('A26:L26').merge().setValue('Accesos recomendados: VISTA PEDIDOS · VISTA STOCK · VISTA RECEPCION · VISTA PRODUCCION · VISTA COMPRAS · DASHBOARD STOCK')
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
    ['Producción', snap.totalProduccionCantidad, 'Salida productiva registrada']
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
    return [local, s.productos, s.conStock, s.sinStock, s.pedidos, s.faltantes, rl.movimientos, rl.cantidad, pl.movimientos, pl.cantidad_producida];
  });
  dash.getRange('A10:J10').setValues([['Local', 'Productos', 'Con stock', 'Sin stock', 'Pedidos abiertos', 'Faltantes', 'Recepciones', 'Cant. recibida', 'Producción', 'Cant. producida']])
    .setBackground('#103f59').setFontColor('#ffffff').setFontWeight('bold');
  if (localRows.length) {
    dash.getRange(11, 1, localRows.length, 10).setValues(localRows);
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
  var props = PropertiesService.getScriptProperties().getProperties();
  var enabledFlag = String(props.TELEGRAM_ENABLED || '').trim().toLowerCase();
  var token = String(props.TELEGRAM_BOT_TOKEN || '').trim();
  var chatId = String(props.TELEGRAM_CHAT_ID || '').trim();
  var enabled = !!token && !!chatId && enabledFlag !== 'false' && enabledFlag !== '0' && enabledFlag !== 'no';
  return {
    enabled: enabled,
    token: token,
    chat_id: chatId
  };
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
  var settings = getTelegramSettings_();
  if (!settings.enabled) {
    var skipped = { ok: false, skipped: true, reason: 'telegram_disabled' };
    appendTelegramLog_(pedido, skipped);
    return skipped;
  }
  var response;
  try {
    response = UrlFetchApp.fetch('https://api.telegram.org/bot' + settings.token + '/sendMessage', {
      method: 'post',
      payload: {
        chat_id: settings.chat_id,
        text: buildTelegramPedidoMessage_(pedido),
        parse_mode: 'HTML',
        disable_web_page_preview: 'true'
      },
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var raw = response.getContentText() || '';
    var parsed = parseJsonSafe_(raw);
    var ok = code >= 200 && code < 300 && parsed && parsed.ok === true;
    var result = {
      ok: ok,
      skipped: false,
      status_code: code,
      body: raw.slice(0, 500)
    };
    appendTelegramLog_(pedido, result);
    return result;
  } catch (err) {
    var failed = { ok: false, skipped: false, error: String(err) };
    appendTelegramLog_(pedido, failed);
    return failed;
  }
}

function buildTelegramPedidoMessage_(pedido) {
  var items = (pedido.items || []).map(function (it) {
    var qty = it.cantidad || '';
    var unidad = it.unidad || '';
    return '- ' + safeTelegramText_(it.producto || 'Producto sin nombre') + ' - ' + safeTelegramText_(String(qty) + ' ' + unidad).trim();
  }).slice(0, 20);
  if ((pedido.items || []).length > 20) {
    items.push('- +' + ((pedido.items || []).length - 20) + ' producto(s) mas');
  }
  return [
    '<b>Nuevo pedido recibido</b>',
    '<b>ID:</b> ' + safeTelegramText_(pedido.id_pedido || ''),
    '<b>Local:</b> ' + safeTelegramText_(normalizeLocalName_(pedido.local || '')),
    '<b>Encargado:</b> ' + safeTelegramText_(pedido.encargado || ''),
    '<b>Semana:</b> ' + safeTelegramText_(pedido.semana_pedido || ''),
    '<b>Entrega:</b> ' + safeTelegramText_(pedido.fecha_entrega || ''),
    '<b>Urgencia:</b> ' + safeTelegramText_(pedido.urgencia || 'Normal'),
    '<b>Total productos:</b> ' + safeTelegramText_(String(pedido.total_productos || (pedido.items || []).length || 0)),
    pedido.observaciones ? '<b>Observaciones:</b> ' + safeTelegramText_(pedido.observaciones) : '',
    '',
    '<b>Detalle</b>',
    items.join('\n')
  ].filter(function (line) { return line !== ''; }).join('\n');
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
  sh.appendRow([
    Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'),
    pedido.id_pedido || '',
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
  var sh = ss_().getSheetByName(SHEET_DETALLE);
  if (!sh || sh.getLastRow() < 2) return {};
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var estado = String(row[12] || '').trim().toLowerCase();
    if (estado === 'entregado' || estado === 'cancelado') continue;
    var key = keyFor_(row[3], row[6], row[7]);
    if (!out[key]) out[key] = { cantidad: 0, pedidos: 0 };
    out[key].cantidad += numberOrZero_(row[9], 0);
    out[key].pedidos += 1;
  }
  return out;
}

function computeOperationalSnapshot_() {
  var catalog = readCatalog_();
  var stockMap = latestStockMap_();
  var demandMap = pendingDemandMap_();
  var recepcion = readRecepcionResumen_();
  var produccion = readProduccionResumen_();
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
    totalPedidosAbiertos: activePedidoRows_().length,
    localesConRiesgo: localesConRiesgo
    ,
    totalRecepcionMovimientos: recepcion.total_movimientos || 0,
    totalRecepcionCantidad: Object.keys(recepcion.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(recepcion.byLocal[local].cantidad, 0);
    }, 0),
    totalProduccionMovimientos: produccion.total_movimientos || 0,
    totalProduccionCantidad: Object.keys(produccion.byLocal).reduce(function (sum, local) {
      return sum + numberOrZero_(produccion.byLocal[local].cantidad_producida, 0);
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
      produccion: snap.totalProduccionMovimientos
    },
    byLocal: snap.localSummary,
    openItemsByLocal: buildOpenItemsByLocal_()
  };
}

function buildOpenItemsByLocal_() {
  var rows = activePedidoRows_();
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
  var sh = ss_().getSheetByName(SHEET_DETALLE);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var estado = String(values[r][12] || '').trim().toLowerCase();
    if (estado === 'entregado' || estado === 'cancelado') continue;
    out.push(values[r].slice(0, DETALLE_HEADERS.length));
  }
  return out;
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
  return recep.concat(prod)
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
  var map = {};

  Object.keys(catalog).forEach(function (local) { map[local] = true; });
  Object.keys(config).forEach(function (local) { map[local] = true; });
  Object.keys(recep).forEach(function (local) { map[local] = true; });
  Object.keys(prod).forEach(function (local) { map[local] = true; });
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
    { name: SHEET_PRODUCCION, headers: ['local'] }
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
  tabColors[SHEET_STOCK_DASH] = '#355C7D';
  tabColors[SHEET_RESUMEN] = '#4F6D7A';
  tabColors[SHEET_DETALLE] = '#7A8B99';
  tabColors[SHEET_STOCK] = '#7A8B99';
  tabColors[SHEET_RECEPCION] = '#7A8B99';
  tabColors[SHEET_PRODUCCION] = '#7A8B99';
  tabColors[SHEET_PEDIDOS] = '#95A5A6';
  tabColors[SHEET_CATALOGO] = '#95A5A6';
  tabColors[SHEET_CONFIG] = '#95A5A6';

  var order = [
    SHEET_HOME, SHEET_STOCK_DASH, SHEET_VIEW_PED, SHEET_VIEW_STK, SHEET_VIEW_REC, SHEET_VIEW_PROD, SHEET_VIEW_BUY,
    SHEET_RESUMEN, SHEET_DETALLE, SHEET_STOCK, SHEET_RECEPCION, SHEET_PRODUCCION, SHEET_PEDIDOS, SHEET_CATALOGO, SHEET_CONFIG
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
