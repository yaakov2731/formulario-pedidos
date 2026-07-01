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
var SHEET_STOCK_DASH = 'DASHBOARD STOCK';
var SHEET_HOME     = 'INICIO OPERATIVO';
var SHEET_VIEW_PED = 'VISTA PEDIDOS';
var SHEET_VIEW_STK = 'VISTA STOCK';
var SHEET_VIEW_BUY = 'VISTA COMPRAS';

var DETALLE_HEADERS = ['ID_Pedido','Fecha_Hora','Semana','Local','Encargado','Urgencia',
  'Código','Producto','Categoría','Cantidad','Unidad','Proveedor','Estado','Comprado','Entregado'];
var STOCK_HEADERS = ['ID_Conteo','Fecha_Hora','Local','Encargado','Tipo_Conteo','Código','Producto','Categoría',
  'Unidad','Stock_Real','Estado_Stock','Observaciones'];

/* ============================== WEB API ============================== */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'getBootstrap') {
      return json({ ok: true, config: readConfig_(), responsables: readResponsables_(), catalog: readCatalog_() });
    }
    return json({ ok: true, status: 'online', version: '2.0' });
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
    appendPedido_(data);
    appendDetalle_(data);   // capa normalizada: 1 fila por producto
    return json({ ok: true, id_pedido: data.id_pedido || '' });
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
  var start = -1, cLocal = 0, cEnc = 1, cEmail = 2;
  for (var r = 0; r < values.length; r++) {
    var rowLower = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (rowLower.indexOf('local') > -1 && rowLower.indexOf('encargado') > -1) {
      start = r + 1;
      cLocal = rowLower.indexOf('local');
      cEnc   = rowLower.indexOf('encargado');
      cEmail = rowLower.indexOf('email');
      break;
    }
  }
  if (start === -1) return {};
  for (var i = start; i < values.length; i++) {
    var local = normalizeLocalName_(values[i][cLocal]);
    if (!local) break;                 // fin del bloque de encargados
    if (local.charAt(0) === '🔧' || local.charAt(0) === '🔗') break;
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
  var out = {}, start = -1, cLocal = 0, cEnc = 1, cEmail = 2;
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) {
      start = r + 1; cLocal = low.indexOf('local'); cEnc = low.indexOf('encargado'); cEmail = low.indexOf('email'); break;
    }
  }
  if (start === -1) return {};
  for (var i = start; i < values.length; i++) {
    var local = normalizeLocalName_(values[i][cLocal]);
    if (!local) break;
    if (local.charAt(0) === '🔧' || local.charAt(0) === '🔗') break;
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
function appendDetalle_(d) {
  if (!d.items || !d.items.length) return;
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
  refreshOperationalViews_();
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
  refreshStockViews_();
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
    itemMap[keyByCode] = it;
    itemMap[keyByName] = it;
  });

  var changed = false;
  for (var r = 1; r < values.length; r++) {
    var rowLocal = String(values[r][iLocal] || '').trim().toLowerCase();
    var rowCode = iCod > -1 ? String(values[r][iCod] || '').trim().toLowerCase() : '';
    var rowName = iNom > -1 ? String(values[r][iNom] || '').trim().toLowerCase() : '';
    var rec = itemMap[rowLocal + '||' + rowCode] || itemMap[rowLocal + '||' + rowName];
    if (!rec) continue;

    var actual = numberOrNull_(rec.stock_actual);
    if (actual !== null) {
      values[r][iStock] = actual;
      changed = true;
    }
    if (iFecha > -1) values[r][iFecha] = fechaHora;
    if (iNotas > -1) values[r][iNotas] = tipoConteo + ' desde formulario';
  }
  if (changed) sh.getDataRange().setValues(values);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Docks V2')
    .addItem('Aplicar interfaz corporativa', 'setupVersion2UI')
    .addItem('Reconstruir vistas operativas', 'refreshOperationalViews_')
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
  createStockSheet_();
  setupVersion2UI();
  ss.toast('Plantilla pro lista: interfaz v2 operativa aplicada', 'Setup OK', 6);
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
  applyCorporateTabTheme_();
}

function refreshStockViews_() {
  buildStockDashboard_();
  buildInicioOperativo_();
  buildVistaStock_();
}

function buildInicioOperativo_() {
  var sh = ensureSheet_(SHEET_HOME);
  var snap = computeOperationalSnapshot_();
  clearPresentationSheet_(sh, 10);

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
    ['Faltantes operativos', snap.totalFaltantes, 'pedido supera stock disponible']
  ];
  paintCards_(sh, 5, 1, 3, cards);

  sh.getRange('A10:D10').merge().setValue('Pedidos urgentes').setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange('E10:H10').merge().setValue('Ultimos conteos').setBackground('#103F59').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange('A11:D11').setValues([['Local', 'Producto', 'Cantidad', 'Urgencia']]).setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');
  sh.getRange('E11:H11').setValues([['Fecha', 'Local', 'Producto', 'Tipo']]).setBackground('#DCE8EF').setFontWeight('bold').setFontColor('#365165');

  var urgentes = topUrgentRows_(8);
  var conteos = latestStockRows_(8);
  if (urgentes.length) sh.getRange(12, 1, urgentes.length, 4).setValues(urgentes);
  if (conteos.length) sh.getRange(12, 5, conteos.length, 4).setValues(conteos);

  sh.getRange('A22:H22').merge().setValue('Accesos recomendados: VISTA PEDIDOS · VISTA STOCK · VISTA COMPRAS · DASHBOARD STOCK')
    .setBackground('#EAF2F6').setFontColor('#41576B').setFontWeight('bold');
  sh.setColumnWidths(1, 8, 145);
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

function buildStockDashboard_() {
  var ss = ss_();
  var dash = ss.getSheetByName(SHEET_STOCK_DASH) || ss.insertSheet(SHEET_STOCK_DASH);
  var snap = computeOperationalSnapshot_();
  var records = snap.records;
  var localSummary = snap.localSummary;

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
    ['Pedido pendiente', snap.totalPedidoCantidad, 'Unidades solicitadas']
  ];
  for (var i = 0; i < cards.length; i++) {
    var col = 1 + (i * 3);
    dash.getRange(4, col, 1, 3).merge().setValue(cards[i][0]).setBackground('#dfeaf1').setFontWeight('bold').setFontColor('#365165');
    dash.getRange(5, col, 1, 2).merge().setValue(cards[i][1]).setFontWeight('bold').setFontSize(20).setBackground('#ffffff').setFontColor('#1c3448');
    dash.getRange(5, col + 2).setValue(cards[i][2]).setWrap(true).setBackground('#ffffff').setFontColor('#5b7082').setFontSize(10);
    dash.getRange(4, col, 2, 3).setBorder(true, true, true, true, false, false, '#cbd9e4', SpreadsheetApp.BorderStyle.SOLID);
  }

  var localRows = Object.keys(localSummary).sort().map(function (local) {
    var s = localSummary[local];
    return [local, s.productos, s.conStock, s.sinStock, s.pedidos, s.faltantes];
  });
  dash.getRange('A8:F8').setValues([['Local', 'Productos', 'Con stock', 'Sin stock', 'Pedidos abiertos', 'Faltantes']])
    .setBackground('#103f59').setFontColor('#ffffff').setFontWeight('bold');
  if (localRows.length) {
    dash.getRange(9, 1, localRows.length, 6).setValues(localRows);
  }

  dash.getRange('A' + (10 + localRows.length) + ':L' + (10 + localRows.length)).setValues([[
    'Local', 'Código', 'Producto', 'Categoría', 'Unidad', 'Stock real',
    'Pedidos', 'Cantidad pedida', 'Saldo', 'Estado', 'Último conteo', 'Fecha'
  ]]).setBackground('#103f59').setFontColor('#ffffff').setFontWeight('bold');
  if (records.length) {
    dash.getRange(11 + localRows.length, 1, records.length, 12).setValues(records);
  }

  var lastRow = dash.getLastRow();
  if (lastRow >= 9) {
    dash.getRange(9, 1, lastRow - 8, 12).setBorder(true, true, true, true, false, false, '#d7e1e8', SpreadsheetApp.BorderStyle.SOLID);
  }
  if (records.length) {
    var detailStart = 11 + localRows.length;
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
  dash.setFrozenRows(8);
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

function idx_(headerLower, names) {
  for (var i = 0; i < names.length; i++) {
    var p = headerLower.indexOf(names[i]);
    if (p > -1) return p;
  }
  return -1;
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
  };
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

function ensureSheet_(name) {
  return ss_().getSheetByName(name) || ss_().insertSheet(name);
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
  renameLocalAcrossSheet_(SHEET_CATALOGO, ['local_aplicable', 'local'], 'Hamburguesería', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_CATALOGO, ['local_aplicable', 'local'], 'Hamburgueseria', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_CONFIG, ['local'], 'Hamburguesería', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_CONFIG, ['local'], 'Hamburgueseria', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_PEDIDOS, ['local'], 'Hamburguesería', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_PEDIDOS, ['local'], 'Hamburgueseria', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_DETALLE, ['local'], 'Hamburguesería', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_DETALLE, ['local'], 'Hamburgueseria', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_STOCK, ['local'], 'Hamburguesería', 'Brooklyn');
  renameLocalAcrossSheet_(SHEET_STOCK, ['local'], 'Hamburgueseria', 'Brooklyn');
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
  tabColors[SHEET_STOCK_DASH] = '#355C7D';
  tabColors[SHEET_RESUMEN] = '#4F6D7A';
  tabColors[SHEET_DETALLE] = '#7A8B99';
  tabColors[SHEET_STOCK] = '#7A8B99';
  tabColors[SHEET_PEDIDOS] = '#95A5A6';
  tabColors[SHEET_CATALOGO] = '#95A5A6';
  tabColors[SHEET_CONFIG] = '#95A5A6';

  var order = [SHEET_HOME, SHEET_STOCK_DASH, SHEET_VIEW_PED, SHEET_VIEW_STK, SHEET_VIEW_BUY, SHEET_RESUMEN, SHEET_DETALLE, SHEET_STOCK, SHEET_PEDIDOS, SHEET_CATALOGO, SHEET_CONFIG];
  for (var i = 0; i < order.length; i++) {
    var sh = ss.getSheetByName(order[i]);
    if (!sh) continue;
    sh.setTabColor(tabColors[order[i]] || '#95A5A6');
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  }
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

function round2_(num) {
  return Math.round(num * 100) / 100;
}
