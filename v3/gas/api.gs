/* Docks V3 · web app: doGet (JSONP) y doPost (JSON en text/plain). Contrato §4. */

var V3_GET = {
  ping: function () { return { ok: true, version: V3_VERSION, hora: nowStr_() }; },
  getBootstrap: function () { return getBootstrap_(); },
  getCatalogo: function (p) { return getCatalogo_(p); },
  getHoy: function (p) { return getHoy_(p); },
  getPedido: function (p) { return getPedido_(p); },
  getOperacion: function (p) { return getOperacion_(p); },
  getPorRecibir: function (p) { return getPorRecibir_(p); },
  getConsolidado: function (p) { return getConsolidado_(p); },
  getOrdenes: function (p) { return getOrdenes_(p); },
  getFaltantes: function (p) { return getFaltantes_(p); },
  getStockPanel: function (p) { return getStockPanel_(p); }
};

var V3_POST = {
  savePedido: function (b) { return savePedido_(b); },
  saveConteo: function (b) { return saveConteo_(b); },
  saveRecepcion: function (b) { return saveRecepcion_(b); },
  crearOrden: function (b) { return crearOrden_(b); },
  cancelarLineas: function (b) { return cancelarLineas_(b); },
  saveProducto: function (b) { return saveProducto_(b); },
  saveProductosLote: function (b) { return saveProductosLote_(b); },
  saveProveedor: function (b) { return saveProveedor_(b); },
  saveLocal: function (b) { return saveLocal_(b); },
  checkAdmin: function (b) { checkAdminKey_(b.admin_key); return { ok: true }; },
  reiniciarDatos: function (b) { return reiniciarDatos_(b); }
};

function errorRespuesta_(err, accion, ref, local, escritura) {
  if (err && err.user) {
    if (escritura) log_(accion, ref, local, false, err.message);
    return { ok: false, error: err.message };
  }
  log_(accion || 'ERROR', ref, local, false, 'Error interno: ' + errMsg_(err));
  return { ok: false, error: 'Error en el servidor: ' + errMsg_(err) };
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || 'ping');
  var res;
  try {
    resetReq_();
    var fn = V3_GET[action];
    if (!fn) {
      res = V3_POST[action]
        ? { ok: false, error: 'La acción ' + action + ' se envía por POST.' }
        : { ok: false, error: 'Acción desconocida: ' + action + '.' };
    } else {
      res = fn(p);
    }
  } catch (err) {
    res = errorRespuesta_(err, action, p.id || '', p.local || '', false);
  }
  return webResponse_(res, e);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return jsonOut_({ ok: false, error: 'No se pudo leer el pedido enviado (JSON inválido).' });
  }
  if (!body || typeof body !== 'object') return jsonOut_({ ok: false, error: 'No se pudo leer el pedido enviado.' });
  var action = String(body.action || '');
  var ref = body.id_pedido || body.id_operacion || body.id_oc || body.codigo || body.proveedor || '';
  var res;
  try {
    resetReq_();
    if (V3_POST[action]) res = V3_POST[action](body);
    else if (V3_GET[action]) res = V3_GET[action](body);
    else res = { ok: false, error: action ? 'Acción desconocida: ' + action + '.' : 'Falta la acción.' };
  } catch (err) {
    res = errorRespuesta_(err, action, ref, body.local || '', !!V3_POST[action] && action !== 'checkAdmin');
  }
  return jsonOut_(res);
}
