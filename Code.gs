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

var DETALLE_HEADERS = ['ID_Pedido','Fecha_Hora','Semana','Local','Encargado','Urgencia',
  'Código','Producto','Categoría','Cantidad','Unidad','Proveedor','Estado','Comprado','Entregado'];

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
    appendPedido_(data);
    appendDetalle_(data);   // capa normalizada: 1 fila por producto
    return json({ ok: true, id_pedido: data.id_pedido || '' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* Prefijo de código por local (para autogenerar Código en el catálogo). */
var LOCAL_PREFIX = {
  'Parrilla': 'PAR', 'GreenFresh': 'GRE', 'Heladería': 'HEL', 'Heladeria': 'HEL',
  'Cafetería': 'CAF', 'Cafeteria': 'CAF', 'Brooklyn': 'HAM', 'Hamburguesería': 'HAM',
  'Eventos': 'EVE', 'Shopping': 'SHO'
};
function prefixFor_(local) {
  if (LOCAL_PREFIX[local]) return LOCAL_PREFIX[local];
  return (String(local).replace(/[^A-Za-zÁÉÍÓÚÑ]/g, '').toUpperCase() + 'XXX').slice(0, 3);
}

/* Agrega un producto al CATÁLOGO con código autogenerado. */
function addProductoCatalogo_(d) {
  if (!d.local || !d.nombre) return { ok: false, error: 'Faltan local o nombre' };
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
  var iEstado = idx_(head, ['estado']);

  var out = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var local = String(row[iLocal] || '').trim();
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
      categoria: iCat  > -1 ? String(row[iCat]  || '').trim() : ''
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
    var local = String(values[i][cLocal] || '').trim();
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
    var local = String(values[i][cLocal] || '').trim();
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
  buildResumenProveedor_();
  ss.toast('Plantilla pro lista: PEDIDOS_DETALLE + RESUMEN POR PROVEEDOR', 'Setup OK', 6);
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
  renameLocal_('Hamburguesería', 'Brooklyn'); // la hamburguesería se llama Brooklyn
  SpreadsheetApp.getActive().toast('GreenFresh + Brooklyn configurados, Pizzería desactivada', 'Setup OK', 6);
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
