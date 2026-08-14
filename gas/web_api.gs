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
  var headerRow = -1;
  var cols = { cLocal: -1, cEnc: -1, cEmail: -1, cTel: -1, cHorario: -1, cAct: -1 };
  
  for (var r = 0; r < values.length; r++) {
    var low = values[r].map(function (c) { return String(c).trim().toLowerCase(); });
    if (low.indexOf('local') > -1 && low.indexOf('encargado') > -1) { 
      headerRow = r; 
      cols.cLocal = low.indexOf('local');
      cols.cEnc = low.indexOf('encargado');
      cols.cEmail = low.indexOf('email');
      cols.cTel = low.indexOf('teléfono');
      if (cols.cTel === -1) cols.cTel = low.indexOf('telefono');
      cols.cHorario = low.indexOf('horario');
      cols.cAct = low.indexOf('activo');
      break; 
    }
  }
  if (headerRow === -1) return { ok: false, error: 'No encuentro el bloque de encargados' };
  
  var insertAt = headerRow + 2;
  for (var k = headerRow + 1; k < values.length; k++) {
    if (!String(values[k][cols.cLocal] || '').trim()) { insertAt = k + 1; break; }
    insertAt = k + 2;
  }
  
  var newRow = new Array(Math.max(sh.getLastColumn(), 1)).fill('');
  if (cols.cLocal > -1) newRow[cols.cLocal] = d.local;
  if (cols.cEnc > -1) newRow[cols.cEnc] = d.nombre;
  if (cols.cEmail > -1) newRow[cols.cEmail] = d.email || '';
  if (cols.cTel > -1) newRow[cols.cTel] = d.telefono || '';
  if (cols.cHorario > -1) newRow[cols.cHorario] = d.horario || '';
  if (cols.cAct > -1) newRow[cols.cAct] = 'SÍ';

  sh.insertRowBefore(insertAt);
  sh.getRange(insertAt, 1, 1, newRow.length).setValues([newRow]);
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
  if (!data.local) return { ok: false, error: 'Falta local' };
  if (!data.encargado) return { ok: false, error: 'Falta encargado' };
  if (!data.email_encargado || !/^\S+@\S+\.\S+$/.test(data.email_encargado)) return { ok: false, error: 'Email inválido' };
  if (!data.semana_pedido) return { ok: false, error: 'Falta semana del pedido' };
  if (!data.fecha_entrega) return { ok: false, error: 'Falta fecha de entrega' };
  if (!data.items || !data.items.length) return { ok: false, error: 'El pedido no tiene productos' };
  for (var i = 0; i < data.items.length; i++) {
    var it = data.items[i];
    if (!it.producto) return { ok: false, error: 'Producto sin nombre en el pedido' };
    if (!(Number(it.cantidad) > 0)) return { ok: false, error: 'Cantidad inválida en "' + it.producto + '"' };
  }
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
