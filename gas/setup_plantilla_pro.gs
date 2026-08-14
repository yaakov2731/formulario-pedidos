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

function createPedidosSheet_() {
  var sh = ensureSheet_(SHEET_PEDIDOS);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, PEDIDOS_HEADERS.length).setValues([PEDIDOS_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function createCatalogoSheet_() {
  var sh = ensureSheet_(SHEET_CATALOGO);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CATALOGO_HEADERS.length).setValues([CATALOGO_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function createConfigSheet_() {
  var sh = ensureSheet_(SHEET_CONFIG);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CONFIG_HEADERS.length).setValues([CONFIG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Crea desde cero las 3 hojas base (PEDIDOS RECIBIDOS, CATÁLOGO PRODUCTOS,
 * CONFIGURACIÓN) con sus encabezados, y arma el resto de la plantilla v2
 * (DETALLE, STOCK, RECEPCIÓN, PRODUCCIÓN, ELABORADOS, vistas y dashboards).
 * Correr UNA VEZ desde el editor en un Google Sheet nuevo (vacío) para
 * empezar de cero. Idempotente: si una hoja ya tiene datos no la toca.
 */
function setupFreshTemplate() {
  createPedidosSheet_();
  createCatalogoSheet_();
  createConfigSheet_();
  setupPlantillaPro();
  SpreadsheetApp.getActive().toast('Plantilla nueva lista: todas las pestañas creadas', 'Setup OK', 6);
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
