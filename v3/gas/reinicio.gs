/* Docks V3 · reinicio de datos operativos (sólo gerencia). Contrato §4.2 reiniciarDatos. */

var V3_FRASE_REINICIO = 'EMPEZAR DE CERO';

/**
 * Deja la operación como nueva: borra pedidos, líneas, movimientos y órdenes, y deja el stock
 * del catálogo "sin contar" (vacío, no cero). Conserva catálogo, proveedores, locales, encargados,
 * TABLERO y LOG. Antes de borrar hace una copia completa de la planilla; si la copia falla, no borra nada.
 */
function reiniciarDatos_(b) {
  checkAdminKey_(b.admin_key);
  if (str_(b.confirmacion).toUpperCase() !== V3_FRASE_REINICIO) {
    fail_('Para reiniciar hay que escribir exactamente: ' + V3_FRASE_REINICIO + '.');
  }
  return withLock_(function () {
    var ss = ss_();
    var nombre = 'RESPALDO V3 antes de reiniciar ' + nowStr_();
    var copia;
    try {
      copia = ss.copy(nombre);
    } catch (e) {
      fail_('No se pudo crear el respaldo de la planilla, así que no se borró nada. Detalle: ' + errMsg_(e));
    }

    var borrados = {};
    [SH_PEDIDOS, SH_LINEAS, SH_MOVIMIENTOS, SH_COMPRAS].forEach(function (nombreHoja) {
      borrados[nombreHoja] = vaciarDatos_(ss.getSheetByName(nombreHoja));
    });

    var productos = 0;
    var cat = ss.getSheetByName(SH_CATALOGO);
    if (cat && cat.getLastRow() > 1) {
      var head = cat.getRange(1, 1, 1, cat.getLastColumn()).getValues()[0].map(function (h) { return str_(h); });
      var filas = cat.getLastRow() - 1;
      var codigos = cat.getRange(2, 1, filas, 1).getValues();
      codigos.forEach(function (r) { if (str_(r[0])) productos++; });
      ['Stock_Actual', 'Ultimo_Conteo'].forEach(function (h) {
        var c = head.indexOf(h);
        if (c > -1) cat.getRange(2, c + 1, filas, 1).clearContent();
      });
    }

    var res = {
      ok: true,
      respaldo_nombre: nombre,
      respaldo_url: copia.getUrl(),
      pedidos: borrados[SH_PEDIDOS],
      lineas: borrados[SH_LINEAS],
      movimientos: borrados[SH_MOVIMIENTOS],
      ordenes: borrados[SH_COMPRAS],
      productos_sin_contar: productos
    };
    log_('REINICIO', nombre, '', true, 'Pedidos ' + res.pedidos + ', líneas ' + res.lineas + ', movimientos ' +
      res.movimientos + ', órdenes ' + res.ordenes + ', stock sin contar en ' + productos + ' productos. Respaldo: ' + res.respaldo_url);
    return res;
  });
}

/* Borra el contenido de las filas de datos (conserva encabezado, formato y validaciones). Devuelve cuántas filas tenían datos. */
function vaciarDatos_(sh) {
  if (!sh || sh.getLastRow() < 2) return 0;
  var filas = sh.getLastRow() - 1;
  var cols = sh.getLastColumn();
  var conDatos = 0;
  sh.getRange(2, 1, filas, cols).getValues().forEach(function (r) { if (!rowEmpty_(r)) conDatos++; });
  sh.getRange(2, 1, filas, cols).clearContent();
  return conDatos;
}
