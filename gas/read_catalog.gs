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
