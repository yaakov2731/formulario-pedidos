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
