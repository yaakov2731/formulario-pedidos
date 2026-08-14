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
