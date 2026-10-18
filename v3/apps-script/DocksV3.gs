// Docks V3 · backend en un solo archivo. Generado por scripts/v3-bundle-gas.js; no editar a mano.
// Fuente: v3/gas/*.gs

// ===== api.gs =====
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
  checkAdmin: function (b) { checkAdminKey_(b.admin_key); return { ok: true }; }
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

// ===== compras.gs =====
/* Docks V3 · compras centralizadas: consolidado, órdenes, cancelaciones y faltantes. */

/* Estado de la orden según sus líneas.
 * Enviada: nada recibido todavía. Recibida: todas las no canceladas Entregado.
 * Recibida parcial: algo recibido y queda algo por recibir o algo llegó incompleto. Cancelada: todas canceladas. */
function estadoOrdenDe_(estados) {
  var activas = estados.filter(function (e) { return e !== 'Cancelado'; });
  if (!activas.length) return estados.length ? 'Cancelada' : 'Enviada';
  var recibidas = activas.filter(function (e) { return e === 'Entregado' || e === 'Incompleto'; });
  if (!recibidas.length) return 'Enviada';
  var entregadas = activas.filter(function (e) { return e === 'Entregado'; });
  if (entregadas.length === activas.length) return 'Recibida';
  return 'Recibida parcial';
}

function recalcCompras_(ids) {
  var tOc = table_(SH_COMPRAS);
  var tLin = table_(SH_LINEAS);
  var vistos = {};
  ids.forEach(function (id) {
    if (!id || vistos[id]) return;
    vistos[id] = true;
    var estados = tfind_(tLin, 'ID_OC', id).map(function (i) { return tstr_(tLin, i, 'Estado'); });
    tfind_(tOc, 'ID_OC', id).forEach(function (i) { tset_(tOc, i, 'Estado', estadoOrdenDe_(estados)); });
  });
}

function waDigitos_(whatsapp) {
  return str_(whatsapp).replace(/\D/g, '');
}

function waUrl_(whatsapp, texto) {
  return 'https://wa.me/' + waDigitos_(whatsapp) + '?text=' + encodeURIComponent(texto);
}

function whatsappProveedor_(nombre) {
  var i = buscarProveedor_(nombre);
  return i > -1 ? tstr_(table_(SH_PROVEEDORES), i, 'WhatsApp') : '';
}

function cmpTexto_(a, b) {
  var x = norm_(a);
  var y = norm_(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/* Texto de WhatsApp (§4.3). lineas: [{local, producto, unidad, cantidad}]. */
function textoWhatsApp_(idOc, proveedor, semanaLabel, lineas) {
  function sumar(lista) {
    var map = {};
    var orden = [];
    lista.forEach(function (l) {
      var k = norm_(l.producto) + '|' + l.unidad;
      if (!map[k]) { map[k] = { producto: l.producto, unidad: l.unidad, cantidad: 0 }; orden.push(k); }
      map[k].cantidad = round_(map[k].cantidad + (l.cantidad || 0));
    });
    return orden.map(function (k) { return map[k]; }).sort(function (a, b) {
      return cmpTexto_(a.producto, b.producto) || cmpTexto_(a.unidad, b.unidad);
    });
  }
  var total = sumar(lineas);
  var ordenLoc = ordenLocales_();
  var porLocal = {};
  var locales = [];
  lineas.forEach(function (l) {
    if (!porLocal[l.local]) { porLocal[l.local] = []; locales.push(l.local); }
    porLocal[l.local].push(l);
  });
  locales.sort(function (a, b) {
    var x = ordenLoc[norm_(a)];
    var y = ordenLoc[norm_(b)];
    if (x === undefined) x = 999;
    if (y === undefined) y = 999;
    return x - y || cmpTexto_(a, b);
  });
  var out = [];
  out.push('*Pedido Docks del Puerto* · ' + idOc);
  out.push('Proveedor: ' + proveedor);
  out.push(semanaLabel);
  out.push('');
  total.forEach(function (p) { out.push('• ' + p.producto + ' — ' + fmtNum_(p.cantidad) + ' ' + p.unidad); });
  out.push('');
  out.push('Entrega por local:');
  locales.forEach(function (loc) {
    out.push(loc + ': ' + sumar(porLocal[loc]).map(function (p) {
      return p.producto + ' ' + fmtNum_(p.cantidad) + ' ' + p.unidad;
    }).join(', '));
  });
  out.push('');
  out.push('Gracias.');
  return out.join('\n');
}

function ordenRespuesta_(tOc, i) {
  var texto = tstr_(tOc, i, 'Texto_WhatsApp');
  return {
    id_oc: tstr_(tOc, i, 'ID_OC'),
    fecha_hora: tstr_(tOc, i, 'Fecha_Hora'),
    semana: tstr_(tOc, i, 'Semana'),
    proveedor: tstr_(tOc, i, 'Proveedor'),
    locales: splitList_(tget_(tOc, i, 'Locales')),
    estado: tstr_(tOc, i, 'Estado'),
    lineas: tnum_(tOc, i, 'Lineas'),
    total_estimado: tnum_(tOc, i, 'Total_Estimado'),
    responsable: tstr_(tOc, i, 'Responsable'),
    texto_whatsapp: texto,
    whatsapp_url: waUrl_(whatsappProveedor_(tstr_(tOc, i, 'Proveedor')), texto)
  };
}

function crearOrden_(b) {
  checkAdminKey_(b.admin_key);
  var id = checkId_(b.id_oc, 'orden de compra');
  return withLock_(function () {
    var tOc = table_(SH_COMPRAS);
    var ya = tfind_(tOc, 'ID_OC', id);
    if (ya.length) {
      var o = ordenRespuesta_(tOc, ya[0]);
      return { ok: true, id_oc: id, texto_whatsapp: o.texto_whatsapp, whatsapp_url: o.whatsapp_url, lineas: o.lineas, duplicado: true };
    }
    if (!esArray_(b.id_lineas) || !b.id_lineas.length) fail_('No hay líneas seleccionadas para la orden.');
    var tLin = table_(SH_LINEAS);
    var proveedor = str_(b.proveedor) ? proveedorCanonico_(b.proveedor) : '';
    var vistos = {};
    var filas = b.id_lineas.map(function (idl) {
      idl = str_(idl);
      var f = tfind_(tLin, 'ID_Linea', idl);
      if (!f.length) fail_('La línea ' + idl + ' no existe.');
      var i = f[0];
      var nombre = tstr_(tLin, i, 'Producto');
      var est = tstr_(tLin, i, 'Estado');
      if (est !== 'Pendiente') fail_('La línea de ' + nombre + ' (' + tstr_(tLin, i, 'Local') + ') no está pendiente (estado: ' + (est || 'sin estado') + ').');
      if (vistos[i]) fail_('La línea de ' + nombre + ' está repetida.');
      vistos[i] = true;
      return i;
    });
    filas.forEach(function (i) {
      var p = tstr_(tLin, i, 'Proveedor');
      if (!p) return;
      if (!proveedor) proveedor = proveedorCanonico_(p);
      else if (norm_(p) !== norm_(proveedor)) {
        fail_('La línea de ' + tstr_(tLin, i, 'Producto') + ' (' + tstr_(tLin, i, 'Local') + ') es de ' + p + ', no de ' + proveedor + '.');
      }
    });
    if (!proveedor) fail_('Indicá el proveedor de la orden.');

    var semana = semanaDe_();
    var now = nowStr_();
    var total = 0;
    var conPrecio = false;
    var locales = [];
    var pedidos = [];
    var lineasTxt = filas.map(function (i) {
      if (!tstr_(tLin, i, 'Proveedor')) tset_(tLin, i, 'Proveedor', proveedor);
      tset_(tLin, i, 'Estado', 'Comprado');
      tset_(tLin, i, 'ID_OC', id);
      var q = tnum_(tLin, i, 'Cantidad');
      var pr = tnum_(tLin, i, 'Precio_Ref');
      if (q !== null && pr !== null) { total += q * pr; conPrecio = true; }
      var loc = tstr_(tLin, i, 'Local');
      if (locales.indexOf(loc) < 0) locales.push(loc);
      pedidos.push(tstr_(tLin, i, 'ID_Pedido'));
      return { local: loc, producto: tstr_(tLin, i, 'Producto'), unidad: tstr_(tLin, i, 'Unidad'), cantidad: q };
    });
    var ordenLoc = ordenLocales_();
    locales.sort(function (a, b) {
      var x = ordenLoc[norm_(a)];
      var y = ordenLoc[norm_(b)];
      return (x === undefined ? 999 : x) - (y === undefined ? 999 : y);
    });
    var texto = textoWhatsApp_(id, proveedor, semana.label, lineasTxt);
    var responsable = str_(b.responsable);
    tadd_(tOc, {
      'ID_OC': id, 'Fecha_Hora': now, 'Semana': semana.id, 'Proveedor': proveedor, 'Locales': locales.join(', '),
      'Estado': 'Enviada', 'Lineas': filas.length, 'Total_Estimado': conPrecio ? round_(total, 2) : '',
      'Responsable': responsable, 'Texto_WhatsApp': texto, 'Observaciones': str_(b.observaciones)
    });
    recalcPedidos_(pedidos);
    var url = waUrl_(whatsappProveedor_(proveedor), texto);
    log_('crearOrden', id, locales.join(', '), true, proveedor + ' · ' + filas.length + ' líneas' + (responsable ? ' · ' + responsable : ''));
    despues_(function () {
      telegram_('Orden creada · ' + proveedor + '\n' + filas.length + ' líneas · ' + locales.join(', ') +
        (conPrecio ? '\nTotal estimado: $' + fmtNum_(round_(total, 2)) : '') + '\n' + id, id, locales.join(', '));
    });
    return { ok: true, id_oc: id, texto_whatsapp: texto, whatsapp_url: url, lineas: filas.length, proveedor: proveedor };
  });
}

function cancelarLineas_(b) {
  checkAdminKey_(b.admin_key);
  if (!esArray_(b.id_lineas) || !b.id_lineas.length) fail_('No hay líneas seleccionadas para cancelar.');
  return withLock_(function () {
    var tLin = table_(SH_LINEAS);
    var motivo = str_(b.motivo);
    var aCancelar = [];
    var yaCanceladas = 0;
    b.id_lineas.forEach(function (idl) {
      idl = str_(idl);
      var f = tfind_(tLin, 'ID_Linea', idl);
      if (!f.length) fail_('La línea ' + idl + ' no existe.');
      var i = f[0];
      var est = tstr_(tLin, i, 'Estado');
      if (est === 'Cancelado') { yaCanceladas++; return; }
      if (est !== 'Pendiente' && est !== 'Comprado') {
        fail_('La línea de ' + tstr_(tLin, i, 'Producto') + ' (' + tstr_(tLin, i, 'Local') + ') no se puede cancelar: está ' + est + '.');
      }
      if (aCancelar.indexOf(i) < 0) aCancelar.push(i);
    });
    var pedidos = [];
    var ordenes = [];
    aCancelar.forEach(function (i) {
      tset_(tLin, i, 'Estado', 'Cancelado');
      var prev = tstr_(tLin, i, 'Observaciones');
      var nota = 'Cancelado ' + nowStr_().slice(0, 16) + (motivo ? ': ' + motivo : '');
      tset_(tLin, i, 'Observaciones', prev ? prev + ' · ' + nota : nota);
      pedidos.push(tstr_(tLin, i, 'ID_Pedido'));
      if (tstr_(tLin, i, 'ID_OC')) ordenes.push(tstr_(tLin, i, 'ID_OC'));
    });
    recalcPedidos_(pedidos);
    recalcCompras_(ordenes);
    log_('cancelarLineas', '', '', true, aCancelar.length + ' canceladas' + (motivo ? ' · ' + motivo : ''));
    return { ok: true, canceladas: aCancelar.length, ya_canceladas: yaCanceladas };
  });
}

function getConsolidado_(p) {
  var semana = str_(p.semana);
  var tLin = table_(SH_LINEAS);
  var tPed = table_(SH_PEDIDOS);
  var tProv = table_(SH_PROVEEDORES);
  var grupos = {};
  var claves = [];
  tfind_(tLin, 'Estado', 'Pendiente').forEach(function (i) {
    if (semana && tstr_(tLin, i, 'Semana') !== semana) return;
    var prov = tstr_(tLin, i, 'Proveedor');
    var k = norm_(prov);
    if (!grupos[k]) {
      var ip = buscarProveedor_(prov);
      grupos[k] = {
        proveedor: ip > -1 ? tstr_(tProv, ip, 'Proveedor') : prov,
        whatsapp: ip > -1 ? tstr_(tProv, ip, 'WhatsApp') : '',
        pedido_minimo: ip > -1 ? tnum_(tProv, ip, 'Pedido_Minimo') : null,
        total_estimado: 0,
        lineas: []
      };
      claves.push(k);
    }
    var idp = tstr_(tLin, i, 'ID_Pedido');
    var fp = tfind_(tPed, 'ID_Pedido', idp)[0];
    var q = tnum_(tLin, i, 'Cantidad');
    var pr = tnum_(tLin, i, 'Precio_Ref');
    if (q !== null && pr !== null) grupos[k].total_estimado += q * pr;
    grupos[k].lineas.push({
      id_linea: tstr_(tLin, i, 'ID_Linea'), id_pedido: idp, fecha_hora: tstr_(tLin, i, 'Fecha_Hora'),
      local: tstr_(tLin, i, 'Local'), codigo: tstr_(tLin, i, 'Código'), producto: tstr_(tLin, i, 'Producto'),
      unidad: tstr_(tLin, i, 'Unidad'), cantidad: q, precio_ref: pr,
      prioridad: fp !== undefined ? (tstr_(tPed, fp, 'Prioridad') || 'Normal') : 'Normal'
    });
  });
  var lista = claves.map(function (k) {
    var g = grupos[k];
    g.total_estimado = round_(g.total_estimado, 2);
    g.lineas.sort(function (a, b) { return cmpTexto_(a.producto, b.producto) || cmpTexto_(a.local, b.local); });
    return g;
  });
  lista.sort(function (a, b) {
    if (!a.proveedor) return 1;
    if (!b.proveedor) return -1;
    return cmpTexto_(a.proveedor, b.proveedor);
  });
  return { ok: true, semana: semana || null, grupos: lista };
}

function getOrdenes_(p) {
  var estado = str_(p.estado);
  var tOc = table_(SH_COMPRAS);
  var filas = tfilas_(tOc).filter(function (i) {
    if (!tstr_(tOc, i, 'ID_OC')) return false;
    return !estado || norm_(tget_(tOc, i, 'Estado')) === norm_(estado);
  });
  filas.sort(function (a, b) {
    var x = tstr_(tOc, a, 'Fecha_Hora');
    var y = tstr_(tOc, b, 'Fecha_Hora');
    return x < y ? 1 : x > y ? -1 : b - a;
  });
  return { ok: true, ordenes: filas.slice(0, 200).map(function (i) { return ordenRespuesta_(tOc, i); }) };
}

function getFaltantes_(p) {
  var dias = num_(p.dias);
  if (dias === null || dias < 0) dias = 14;
  var desde = sumarDias_(-Math.floor(dias));
  var tLin = table_(SH_LINEAS);
  var lineas = tfind_(tLin, 'Estado', 'Incompleto').filter(function (i) {
    var f = tstr_(tLin, i, 'Fecha_Recepcion');
    return !f || f.slice(0, 10) >= desde;
  }).map(function (i) {
    var q = tnum_(tLin, i, 'Cantidad');
    var r = tnum_(tLin, i, 'Cantidad_Recibida');
    return {
      id_linea: tstr_(tLin, i, 'ID_Linea'), id_pedido: tstr_(tLin, i, 'ID_Pedido'), id_oc: tstr_(tLin, i, 'ID_OC'),
      local: tstr_(tLin, i, 'Local'), proveedor: tstr_(tLin, i, 'Proveedor'), codigo: tstr_(tLin, i, 'Código'),
      producto: tstr_(tLin, i, 'Producto'), unidad: tstr_(tLin, i, 'Unidad'), cantidad: q,
      cantidad_recibida: r, faltante: q !== null ? round_(Math.max(0, q - (r || 0))) : null,
      fecha_recepcion: tstr_(tLin, i, 'Fecha_Recepcion')
    };
  });
  lineas.sort(function (a, b) { return a.fecha_recepcion < b.fecha_recepcion ? 1 : a.fecha_recepcion > b.fecha_recepcion ? -1 : 0; });
  return { ok: true, dias: dias, lineas: lineas };
}

// ===== config.gs =====
/* Docks V3 · constantes. Contrato: docs/v3/CONTRATO.md §3.
 * Sólo literales a nivel superior: los archivos se cargan en cualquier orden. */

var V3_VERSION = 'v3';
// Planilla V3 usada cuando el script no está vinculado a una planilla y no hay propiedad SHEET_ID.
var V3_SHEET_ID_DEFAULT = '1Jro4Ynb6n7otyaNsFWAi3QznYsWHuHf8EBPazY-_BpE';
var V3_TZ = 'America/Argentina/Buenos_Aires';
var V3_LOCK_MS = 20000;

var SH_CATALOGO = 'CATALOGO';
var SH_PROVEEDORES = 'PROVEEDORES';
var SH_LOCALES = 'LOCALES';
var SH_PEDIDOS = 'PEDIDOS';
var SH_LINEAS = 'PEDIDO_LINEAS';
var SH_MOVIMIENTOS = 'MOVIMIENTOS';
var SH_COMPRAS = 'COMPRAS';
var SH_TABLERO = 'TABLERO';
var SH_LOG = 'LOG';

var V3_SHEET_ORDER = ['CATALOGO', 'PROVEEDORES', 'LOCALES', 'PEDIDOS', 'PEDIDO_LINEAS', 'MOVIMIENTOS', 'COMPRAS', 'TABLERO', 'LOG'];

var V3_HEADERS = {
  CATALOGO: ['Código', 'Producto', 'Local', 'Categoría', 'Unidad', 'Proveedor', 'Precio', 'Par', 'Stock_Actual', 'Ultimo_Conteo', 'Estado', 'Actualizado'],
  PROVEEDORES: ['Proveedor', 'Contacto', 'WhatsApp', 'Email', 'Dias_Entrega', 'Pedido_Minimo', 'Activo', 'Observaciones'],
  LOCALES: ['Local', 'Activo', 'Encargados', 'Dia_Pedido', 'Hora_Corte', 'Prefijo_Codigo', 'Observaciones'],
  PEDIDOS: ['ID_Pedido', 'Fecha_Hora', 'Semana', 'Local', 'Encargado', 'Prioridad', 'Fecha_Entrega', 'Notas', 'Lineas', 'Estado'],
  PEDIDO_LINEAS: ['ID_Linea', 'ID_Pedido', 'Fecha_Hora', 'Semana', 'Local', 'Código', 'Producto', 'Categoría', 'Unidad', 'Cantidad', 'Proveedor', 'Precio_Ref', 'Estado', 'ID_OC', 'Cantidad_Recibida', 'Fecha_Recepcion', 'ID_Recepcion', 'Observaciones'],
  MOVIMIENTOS: ['Fecha_Hora', 'ID_Operacion', 'Tipo', 'Local', 'Encargado', 'Código', 'Producto', 'Unidad', 'Cantidad', 'Saldo_Anterior', 'Saldo_Resultante', 'Costo_Unitario', 'Referencia', 'Observaciones'],
  COMPRAS: ['ID_OC', 'Fecha_Hora', 'Semana', 'Proveedor', 'Locales', 'Estado', 'Lineas', 'Total_Estimado', 'Responsable', 'Texto_WhatsApp', 'Observaciones'],
  LOG: ['Fecha_Hora', 'Tipo', 'Referencia', 'Local', 'OK', 'Detalle']
};

/* Columnas que se guardan como texto plano (formato '@') para que la planilla no las convierta. */
var V3_TEXT_COLUMNS = {
  CATALOGO: ['Código', 'Ultimo_Conteo', 'Actualizado'],
  PROVEEDORES: ['WhatsApp', 'Dias_Entrega'],
  LOCALES: ['Hora_Corte', 'Prefijo_Codigo'],
  PEDIDOS: ['ID_Pedido', 'Fecha_Hora', 'Semana', 'Fecha_Entrega'],
  PEDIDO_LINEAS: ['ID_Linea', 'ID_Pedido', 'Fecha_Hora', 'Semana', 'Código', 'ID_OC', 'Fecha_Recepcion', 'ID_Recepcion'],
  MOVIMIENTOS: ['Fecha_Hora', 'ID_Operacion', 'Código', 'Referencia'],
  COMPRAS: ['ID_OC', 'Fecha_Hora', 'Semana'],
  LOG: ['Fecha_Hora', 'Referencia']
};

var V3_UNIDADES = ['kg', 'g', 'litro', 'ml', 'unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];
var V3_CONTABLES = ['unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];

var EST_PROD = ['Activo', 'Inactivo'];
var SI_NO = ['SÍ', 'NO'];
var PRIORIDADES = ['Normal', 'Urgente'];
var EST_PEDIDO = ['Pendiente', 'En compra', 'Cerrado'];
var EST_LINEA = ['Pendiente', 'Comprado', 'Entregado', 'Incompleto', 'Cancelado'];
var TIPOS_MOV = ['CONTEO', 'RECEPCION', 'AJUSTE'];
var EST_OC = ['Enviada', 'Recibida parcial', 'Recibida', 'Cancelada'];
var DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
var V3_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* Semilla de LOCALES (§3.2): [Local, Prefijo_Codigo, Activo]. */
var LOCALES_SEMILLA = [
  ['Umo Grill', 'UMO', 'SÍ'],
  ['Trento Café', 'TRE', 'SÍ'],
  ['Brooklyn', 'BRK', 'SÍ'],
  ['Puerto Gelato', 'GEL', 'SÍ'],
  ['GreenFresh', 'GRF', 'SÍ'],
  ['Shopping', 'SHP', 'SÍ'],
  ['Eventos', 'EVT', 'SÍ'],
  ['Depósito', 'DEP', 'SÍ'],
  ['Pizzería', 'PIZ', 'NO']
];

/* IDs de operación generados por el cliente (Docks.ids.nuevo). */
var V3_ID_RE = /^[A-Z]{2,4}-\d{8}-\d{6}-[a-z0-9]{4}$/;
var V3_SIN_PEDIDO = 'SIN PEDIDO';

// ===== maestros.gs =====
/* Docks V3 · maestros: locales, proveedores y catálogo. */

/* ---------- unidades ---------- */
var V3_UNIDAD_ALIAS = {
  kilo: 'kg', kilos: 'kg', kgs: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  l: 'litro', lt: 'litro', lts: 'litro', litros: 'litro',
  cc: 'ml', mililitro: 'ml', mililitros: 'ml',
  u: 'unidad', un: 'unidad', unid: 'unidad', unidades: 'unidad'
};

function normUnidad_(v) {
  var n = norm_(v);
  if (!n) return null;
  if (V3_UNIDADES.indexOf(n) > -1) return n;
  if (V3_UNIDAD_ALIAS[n]) return V3_UNIDAD_ALIAS[n];
  if (/es$/.test(n) && V3_UNIDADES.indexOf(n.slice(0, -2)) > -1) return n.slice(0, -2);
  if (/s$/.test(n) && V3_UNIDADES.indexOf(n.slice(0, -1)) > -1) return n.slice(0, -1);
  return null;
}

/* ---------- locales ---------- */
function localObj_(t, i) {
  return {
    local: tstr_(t, i, 'Local'),
    activo: esSi_(tget_(t, i, 'Activo')),
    encargados: splitList_(tget_(t, i, 'Encargados')),
    dia_pedido: tstr_(t, i, 'Dia_Pedido'),
    hora_corte: horaStr_(tget_(t, i, 'Hora_Corte')),
    prefijo: prefijoLocal_(t, i)
  };
}

function prefijoLocal_(t, i) {
  var p = tstr_(t, i, 'Prefijo_Codigo').toUpperCase();
  if (p) return p;
  return norm_(tstr_(t, i, 'Local')).replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'LOC';
}

function listarLocales_() {
  var t = table_(SH_LOCALES);
  return tfilas_(t).filter(function (i) { return tstr_(t, i, 'Local'); }).map(function (i) { return localObj_(t, i); });
}

/* Devuelve {i, local, prefijo, activo}. opts.activo = true exige local activo. */
function resolverLocal_(nombre, opts) {
  var n = str_(nombre);
  if (!n) fail_('Falta indicar el local.');
  var t = table_(SH_LOCALES);
  var filas = tfind_(t, 'Local', n, true);
  if (!filas.length) fail_('El local ' + n + ' no existe.');
  var i = filas[0];
  var obj = localObj_(t, i);
  if (opts && opts.activo && !obj.activo) fail_('El local ' + obj.local + ' está inactivo: no se pueden cargar operaciones.');
  return { i: i, local: obj.local, prefijo: obj.prefijo, activo: obj.activo };
}

/* Orden de los locales en la planilla, para ordenar textos. */
function ordenLocales_() {
  var orden = {};
  listarLocales_().forEach(function (l, k) { orden[norm_(l.local)] = k; });
  return orden;
}

function agregarEncargado_(localIdx, nombre) {
  var n = str_(nombre);
  if (!n) return false;
  var t = table_(SH_LOCALES);
  var lista = splitList_(tget_(t, localIdx, 'Encargados'));
  var ya = lista.some(function (x) { return norm_(x) === norm_(n); });
  if (ya) return false;
  lista.push(n);
  tset_(t, localIdx, 'Encargados', lista.join(', '));
  return true;
}

function saveLocal_(b) {
  checkAdminKey_(b.admin_key);
  return withLock_(function () {
    var loc = resolverLocal_(b.local);
    var t = table_(SH_LOCALES);
    var i = loc.i;
    if (b.activo !== undefined && b.activo !== null && b.activo !== '') {
      var a = siNo_(b.activo, null);
      if (!a) fail_('Valor de Activo inválido para ' + loc.local + ': usá SÍ o NO.');
      tset_(t, i, 'Activo', a);
    }
    if (b.encargados !== undefined) {
      var vistos = {};
      var lista = splitList_(b.encargados).filter(function (x) {
        var k = norm_(x);
        if (vistos[k]) return false;
        vistos[k] = true;
        return true;
      });
      tset_(t, i, 'Encargados', lista.join(', '));
    }
    if (b.dia_pedido !== undefined) {
      var d = str_(b.dia_pedido);
      if (d) {
        var dia = DIAS_SEMANA.filter(function (x) { return norm_(x) === norm_(d); })[0];
        if (!dia) fail_('Día de pedido inválido: ' + d + '. Usá Lunes a Domingo.');
        d = dia;
      }
      tset_(t, i, 'Dia_Pedido', d);
    }
    if (b.hora_corte !== undefined) {
      var h = str_(b.hora_corte);
      if (h) {
        var m = h.match(/^(\d{1,2})[:.](\d{2})$/);
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) fail_('Hora de corte inválida: ' + h + '. Usá el formato 14:00.');
        h = pad2_(Number(m[1])) + ':' + m[2];
      }
      tset_(t, i, 'Hora_Corte', h);
    }
    if (b.observaciones !== undefined) tset_(t, i, 'Observaciones', str_(b.observaciones));
    log_('saveLocal', loc.local, loc.local, true, 'Local actualizado');
    return { ok: true, local: localObj_(t, i) };
  });
}

/* ---------- proveedores ---------- */
function proveedorObj_(t, i) {
  return {
    proveedor: tstr_(t, i, 'Proveedor'),
    contacto: tstr_(t, i, 'Contacto'),
    whatsapp: tstr_(t, i, 'WhatsApp'),
    email: tstr_(t, i, 'Email'),
    dias_entrega: tstr_(t, i, 'Dias_Entrega'),
    pedido_minimo: tnum_(t, i, 'Pedido_Minimo'),
    activo: esSi_(tget_(t, i, 'Activo')),
    observaciones: tstr_(t, i, 'Observaciones')
  };
}

function listarProveedores_() {
  var t = table_(SH_PROVEEDORES);
  return tfilas_(t).filter(function (i) { return tstr_(t, i, 'Proveedor'); }).map(function (i) { return proveedorObj_(t, i); });
}

/* Índice de fila del proveedor por nombre (sin mayúsculas ni acentos) o -1. */
function buscarProveedor_(nombre) {
  if (!str_(nombre)) return -1;
  var filas = tfind_(table_(SH_PROVEEDORES), 'Proveedor', nombre, true);
  return filas.length ? filas[0] : -1;
}

function proveedorCanonico_(nombre) {
  var n = str_(nombre);
  var i = buscarProveedor_(n);
  return i > -1 ? tstr_(table_(SH_PROVEEDORES), i, 'Proveedor') : n;
}

function numOpcional_(v, etiqueta, nombre) {
  if (v === undefined || v === null || v === '') return '';
  var n = num_(v);
  if (n === null || n < 0) fail_(etiqueta + ' inválido en ' + nombre + '.');
  return n;
}

function saveProveedor_(b) {
  checkAdminKey_(b.admin_key);
  return withLock_(function () {
    var nombre = str_(b.proveedor);
    if (!nombre) fail_('Falta el nombre del proveedor.');
    var t = table_(SH_PROVEEDORES);
    var i = buscarProveedor_(nombre);
    var nuevo = i < 0;
    var activo = siNo_(b.activo, nuevo ? 'SÍ' : undefined);
    if (activo === null) fail_('Valor de Activo inválido para ' + nombre + ': usá SÍ o NO.');
    var minimo = b.pedido_minimo === undefined ? undefined : numOpcional_(b.pedido_minimo, 'Pedido mínimo', nombre);
    if (nuevo) {
      i = tadd_(t, { Proveedor: nombre, Activo: activo });
    } else {
      if (activo !== undefined) tset_(t, i, 'Activo', activo);
    }
    var campos = { contacto: 'Contacto', whatsapp: 'WhatsApp', email: 'Email', dias_entrega: 'Dias_Entrega', observaciones: 'Observaciones' };
    Object.keys(campos).forEach(function (k) {
      if (b[k] !== undefined) tset_(t, i, campos[k], str_(b[k]));
    });
    if (minimo !== undefined) tset_(t, i, 'Pedido_Minimo', minimo);
    log_('saveProveedor', nombre, '', true, nuevo ? 'Alta' : 'Edición');
    return { ok: true, proveedor: proveedorObj_(t, i), nuevo: nuevo };
  });
}

/* ---------- catálogo ---------- */
function claveLocalCodigo_(local, codigo) {
  return norm_(local) + '|' + str_(codigo).toUpperCase();
}

/* Suma de Cantidad de líneas Pendiente o Comprado por Local + Código (§3.5). */
function pedidoAbiertoMap_() {
  var t = table_(SH_LINEAS);
  var map = {};
  var cE = t.idx['Estado'];
  var cL = t.idx['Local'];
  var cC = t.idx['Código'];
  var cQ = t.idx['Cantidad'];
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    var est = str_(r[cE]);
    if (est !== 'Pendiente' && est !== 'Comprado') continue;
    var cod = str_(r[cC]);
    if (!cod) continue;
    var q = num_(r[cQ]);
    if (q === null) continue;
    var k = claveLocalCodigo_(r[cL], cod);
    map[k] = (map[k] || 0) + q;
  }
  return map;
}

function estadoProducto_(t, i) {
  return norm_(tget_(t, i, 'Estado')) === 'inactivo' ? 'Inactivo' : 'Activo';
}

function productoObj_(t, i, abiertos) {
  var local = tstr_(t, i, 'Local');
  var codigo = tstr_(t, i, 'Código');
  var unidad = tstr_(t, i, 'Unidad');
  var par = tnum_(t, i, 'Par');
  var stock = tnum_(t, i, 'Stock_Actual');
  var abierto = round_((abiertos || {})[claveLocalCodigo_(local, codigo)] || 0);
  var sug = sugerido_(par, stock, abierto, unidad);
  return {
    codigo: codigo,
    producto: tstr_(t, i, 'Producto'),
    local: local,
    categoria: tstr_(t, i, 'Categoría'),
    unidad: unidad,
    proveedor: tstr_(t, i, 'Proveedor'),
    precio: tnum_(t, i, 'Precio'),
    par: par,
    stock_actual: stock,
    ultimo_conteo: tstr_(t, i, 'Ultimo_Conteo') || null,
    estado: estadoProducto_(t, i),
    pedido_abierto: abierto,
    sugerido: sug.cantidad,
    motivo: sug.motivo
  };
}

/* Fila del catálogo para Local + Código. Si el código existe en otro local, error claro. */
function buscarProductoLocal_(local, codigo, opts) {
  var t = table_(SH_CATALOGO);
  var cod = str_(codigo).toUpperCase();
  var filas = tfind_(t, 'Código', cod, true).filter(function (i) { return tstr_(t, i, 'Código').toUpperCase() === cod; });
  for (var k = 0; k < filas.length; k++) {
    if (norm_(tget_(t, filas[k], 'Local')) === norm_(local)) return filas[k];
  }
  if (opts && opts.opcional) return -1;
  if (filas.length) {
    fail_('El producto ' + tstr_(t, filas[0], 'Producto') + ' (' + cod + ') no pertenece a ' + local + '.');
  }
  fail_('El código ' + cod + ' no existe en el catálogo de ' + local + '.');
}

function siguienteCodigo_(prefijo) {
  var req = req_();
  req.codigos = req.codigos || {};
  if (req.codigos[prefijo] === undefined) {
    var t = table_(SH_CATALOGO);
    var re = new RegExp('^' + prefijo.replace(/[^A-Z0-9]/g, '') + '-?(\\d+)$');
    var max = 0;
    var c = t.idx['Código'];
    for (var i = 0; i < t.rows.length; i++) {
      var m = str_(t.rows[i][c]).toUpperCase().match(re);
      if (m && Number(m[1]) > max) max = Number(m[1]);
    }
    req.codigos[prefijo] = max;
  }
  req.codigos[prefijo]++;
  var n = String(req.codigos[prefijo]);
  while (n.length < 3) n = '0' + n;
  return prefijo + '-' + n;
}

/* Valida y normaliza los campos de producto. parcial = true: sólo los presentes. */
function camposProducto_(f, parcial, nombreRef) {
  var out = {};
  var nombre = str_(f.producto) || nombreRef || 'el producto';
  if (!parcial || f.producto !== undefined) {
    if (!str_(f.producto)) fail_('Falta el nombre del producto.');
    out['Producto'] = str_(f.producto);
  }
  if (!parcial || f.unidad !== undefined) {
    var u = normUnidad_(f.unidad);
    if (!u) fail_(str_(f.unidad) ? 'Unidad inválida en ' + nombre + ': ' + str_(f.unidad) + '.' : 'Falta la unidad de ' + nombre + '.');
    out['Unidad'] = u;
  }
  if (f.categoria !== undefined) out['Categoría'] = str_(f.categoria);
  if (f.proveedor !== undefined) out['Proveedor'] = proveedorCanonico_(f.proveedor);
  if (f.precio !== undefined) out['Precio'] = numOpcional_(f.precio, 'Precio', nombre);
  if (f.par !== undefined) out['Par'] = numOpcional_(f.par, 'Par', nombre);
  if (f.estado !== undefined && str_(f.estado)) {
    var e = EST_PROD.filter(function (x) { return norm_(x) === norm_(f.estado); })[0];
    if (!e) fail_('Estado inválido en ' + nombre + ': usá Activo o Inactivo.');
    out['Estado'] = e;
  }
  return out;
}

function aplicarCampos_(t, i, campos) {
  Object.keys(campos).forEach(function (h) { tset_(t, i, h, campos[h]); });
  tset_(t, i, 'Actualizado', nowStr_());
}

function avisoProveedor_(nombre) {
  if (!str_(nombre) || buscarProveedor_(nombre) > -1) return null;
  return 'El proveedor ' + str_(nombre) + ' no está cargado en PROVEEDORES.';
}

function saveProducto_(b) {
  checkAdminKey_(b.admin_key);
  return withLock_(function () {
    var loc = resolverLocal_(b.local);
    var t = table_(SH_CATALOGO);
    var codigo = str_(b.codigo).toUpperCase();
    var i = -1;
    if (codigo) {
      if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(codigo)) fail_('Código inválido: ' + codigo + '.');
      i = buscarProductoLocal_(loc.local, codigo, { opcional: true });
      if (i < 0) {
        var otro = tfind_(t, 'Código', codigo, true)[0];
        if (otro !== undefined) fail_('El código ' + codigo + ' ya está usado en ' + tstr_(t, otro, 'Local') + '.');
      }
    }
    var campos;
    if (i > -1) {
      campos = camposProducto_(b, true, tstr_(t, i, 'Producto'));
      aplicarCampos_(t, i, campos);
    } else {
      campos = camposProducto_(b, false);
      if (!codigo) {
        var dup = buscarPorNombreUnidad_(loc.local, campos['Producto'], campos['Unidad']);
        if (dup > -1) {
          fail_('Ya existe ' + tstr_(t, dup, 'Producto') + ' (' + campos['Unidad'] + ') en ' + loc.local + ' con el código ' + tstr_(t, dup, 'Código') + '.');
        }
        codigo = siguienteCodigo_(loc.prefijo);
      }
      if (!campos['Estado']) campos['Estado'] = 'Activo';
      campos['Código'] = codigo;
      campos['Local'] = loc.local;
      i = tadd_(t, campos);
      tset_(t, i, 'Actualizado', nowStr_());
    }
    var res = { ok: true, producto: productoObj_(t, i, pedidoAbiertoMap_()) };
    var aviso = avisoProveedor_(res.producto.proveedor);
    if (aviso) res.aviso = aviso;
    log_('saveProducto', res.producto.codigo, loc.local, true, res.producto.producto);
    return res;
  });
}

function buscarPorNombreUnidad_(local, producto, unidad) {
  var t = table_(SH_CATALOGO);
  var filas = tfind_(t, 'Producto', producto, true);
  for (var k = 0; k < filas.length; k++) {
    var i = filas[k];
    if (norm_(tget_(t, i, 'Local')) === norm_(local) && normUnidad_(tget_(t, i, 'Unidad')) === unidad) return i;
  }
  return -1;
}

function saveProductosLote_(b) {
  checkAdminKey_(b.admin_key);
  if (Object.prototype.toString.call(b.filas) !== '[object Array]' || !b.filas.length) fail_('No hay filas para cargar.');
  if (b.filas.length > 2000) fail_('Demasiadas filas en un solo lote (máximo 2000).');
  return withLock_(function () {
    var loc = resolverLocal_(b.local);
    var t = table_(SH_CATALOGO);
    var creados = 0;
    var actualizados = 0;
    var errores = [];
    b.filas.forEach(function (f, k) {
      try {
        if (!f || typeof f !== 'object') fail_('Fila vacía.');
        var campos = camposProducto_(f, false);
        var i = buscarPorNombreUnidad_(loc.local, campos['Producto'], campos['Unidad']);
        if (i > -1) {
          delete campos['Producto'];
          aplicarCampos_(t, i, campos);
          actualizados++;
        } else {
          if (!campos['Estado']) campos['Estado'] = 'Activo';
          campos['Código'] = siguienteCodigo_(loc.prefijo);
          campos['Local'] = loc.local;
          campos['Actualizado'] = nowStr_();
          tadd_(t, campos);
          creados++;
        }
      } catch (e) {
        if (!e.user) throw e;
        errores.push({ fila: k + 1, error: e.message });
      }
    });
    log_('saveProductosLote', '', loc.local, true, 'Creados ' + creados + ', actualizados ' + actualizados + ', errores ' + errores.length);
    return { ok: true, creados: creados, actualizados: actualizados, errores: errores };
  });
}

/* ---------- lecturas ---------- */
function getBootstrap_() {
  return {
    ok: true,
    version: V3_VERSION,
    semana: semanaDe_(),
    locales: listarLocales_(),
    proveedores: listarProveedores_()
  };
}

function getCatalogo_(p) {
  var t = table_(SH_CATALOGO);
  var local = null;
  if (str_(p.local)) local = resolverLocal_(p.local).local;
  var abiertos = pedidoAbiertoMap_();
  var productos = [];
  tfilas_(t).forEach(function (i) {
    if (!tstr_(t, i, 'Código') && !tstr_(t, i, 'Producto')) return;
    if (local !== null) {
      if (norm_(tget_(t, i, 'Local')) !== norm_(local)) return;
      if (estadoProducto_(t, i) !== 'Activo') return;
    }
    productos.push(productoObj_(t, i, abiertos));
  });
  return { ok: true, productos: productos };
}

// ===== pedidos.gs =====
/* Docks V3 · pedidos de los locales. */

function esArray_(v) {
  return Object.prototype.toString.call(v) === '[object Array]';
}

/* Cantidad > 0 (o >= 0 con permitirCero). Vacío o texto no numérico → error, nunca 0. */
function cantidad_(v, nombre, permitirCero) {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) fail_('Falta la cantidad de ' + nombre + '.');
  var n = num_(v);
  if (n === null) fail_('Cantidad inválida en ' + nombre + '.');
  if (permitirCero ? n < 0 : n <= 0) fail_('Cantidad inválida en ' + nombre + (permitirCero ? ': no puede ser negativa.' : ': tiene que ser mayor que cero.'));
  return n;
}

function savePedido_(b) {
  var id = checkId_(b.id_pedido, 'pedido');
  return withLock_(function () {
    var tPed = table_(SH_PEDIDOS);
    var ya = tfind_(tPed, 'ID_Pedido', id);
    if (ya.length) {
      return { ok: true, id_pedido: id, lineas: tnum_(tPed, ya[0], 'Lineas') || tfind_(table_(SH_LINEAS), 'ID_Pedido', id).length, duplicado: true };
    }
    var loc = resolverLocal_(b.local, { activo: true });
    var encargado = str_(b.encargado);
    if (!encargado) fail_('Falta el nombre de quien hace el pedido.');
    var prioridad = 'Normal';
    if (str_(b.prioridad)) {
      prioridad = PRIORIDADES.filter(function (x) { return norm_(x) === norm_(b.prioridad); })[0];
      if (!prioridad) fail_('Prioridad inválida: ' + str_(b.prioridad) + '. Usá Normal o Urgente.');
    }
    var entrega = str_(b.fecha_entrega);
    if (entrega && !/^\d{4}-\d{2}-\d{2}$/.test(entrega)) fail_('Fecha de entrega inválida: ' + entrega + '. Usá el formato aaaa-mm-dd.');
    if (!esArray_(b.items) || !b.items.length) fail_('El pedido no tiene productos.');
    if (b.items.length > 500) fail_('El pedido tiene demasiadas líneas (máximo 500).');

    var tCat = table_(SH_CATALOGO);
    var lineas = [];
    var porClave = {};
    b.items.forEach(function (it) {
      it = it || {};
      var linea;
      if (str_(it.codigo)) {
        var i = buscarProductoLocal_(loc.local, it.codigo);
        var nombre = tstr_(tCat, i, 'Producto');
        if (estadoProducto_(tCat, i) !== 'Activo') fail_('El producto ' + nombre + ' está inactivo en el catálogo de ' + loc.local + '.');
        linea = {
          clave: 'c|' + tstr_(tCat, i, 'Código').toUpperCase(),
          codigo: tstr_(tCat, i, 'Código'),
          producto: nombre,
          categoria: tstr_(tCat, i, 'Categoría'),
          unidad: tstr_(tCat, i, 'Unidad'),
          proveedor: tstr_(tCat, i, 'Proveedor'),
          precio: tnum_(tCat, i, 'Precio'),
          cantidad: cantidad_(it.cantidad, nombre)
        };
      } else {
        var prod = str_(it.producto);
        if (!prod) fail_('Hay una línea sin producto.');
        var u = normUnidad_(it.unidad);
        if (!u) fail_(str_(it.unidad) ? 'Unidad inválida en ' + prod + ': ' + str_(it.unidad) + '.' : 'Falta la unidad de ' + prod + '.');
        linea = {
          clave: 'l|' + norm_(prod) + '|' + u,
          codigo: '', producto: prod, categoria: '', unidad: u, proveedor: '', precio: null,
          cantidad: cantidad_(it.cantidad, prod)
        };
      }
      linea.observaciones = str_(it.observaciones);
      if (porClave[linea.clave]) {
        porClave[linea.clave].cantidad = round_(porClave[linea.clave].cantidad + linea.cantidad);
        return;
      }
      porClave[linea.clave] = linea;
      lineas.push(linea);
    });

    var now = nowStr_();
    var semana = semanaDe_().id;
    var tLin = table_(SH_LINEAS);
    lineas.forEach(function (l, k) {
      tadd_(tLin, {
        'ID_Linea': id + '-' + (k + 1), 'ID_Pedido': id, 'Fecha_Hora': now, 'Semana': semana, 'Local': loc.local,
        'Código': l.codigo, 'Producto': l.producto, 'Categoría': l.categoria, 'Unidad': l.unidad, 'Cantidad': l.cantidad,
        'Proveedor': l.proveedor, 'Precio_Ref': l.precio === null ? '' : l.precio, 'Estado': 'Pendiente',
        'Observaciones': l.observaciones
      });
    });
    tadd_(tPed, {
      'ID_Pedido': id, 'Fecha_Hora': now, 'Semana': semana, 'Local': loc.local, 'Encargado': encargado,
      'Prioridad': prioridad, 'Fecha_Entrega': entrega, 'Notas': str_(b.notas), 'Lineas': lineas.length, 'Estado': 'Pendiente'
    });
    var encargadoNuevo = agregarEncargado_(loc.i, encargado);
    log_('savePedido', id, loc.local, true, lineas.length + ' líneas · ' + encargado + (prioridad === 'Urgente' ? ' · Urgente' : ''));
    despues_(function () {
      telegram_('Pedido nuevo · ' + loc.local + '\n' + encargado + ' · ' + lineas.length + ' líneas' +
        (prioridad === 'Urgente' ? ' · URGENTE' : '') + (entrega ? '\nEntrega: ' + entrega : '') + '\n' + id, id, loc.local);
    });
    return { ok: true, id_pedido: id, lineas: lineas.length, encargado_nuevo: encargadoNuevo };
  });
}

function pedidoObj_(t, i) {
  return {
    id_pedido: tstr_(t, i, 'ID_Pedido'),
    fecha_hora: tstr_(t, i, 'Fecha_Hora'),
    semana: tstr_(t, i, 'Semana'),
    local: tstr_(t, i, 'Local'),
    encargado: tstr_(t, i, 'Encargado'),
    prioridad: tstr_(t, i, 'Prioridad') || 'Normal',
    fecha_entrega: fechaStr_(tget_(t, i, 'Fecha_Entrega')),
    notas: tstr_(t, i, 'Notas'),
    lineas: tnum_(t, i, 'Lineas'),
    estado: tstr_(t, i, 'Estado')
  };
}

function getPedido_(p) {
  var id = str_(p.id || p.id_pedido);
  if (!id) fail_('Falta el identificador del pedido.');
  var tPed = table_(SH_PEDIDOS);
  var filas = tfind_(tPed, 'ID_Pedido', id);
  if (!filas.length) return { ok: true, found: false, id: id };
  var tLin = table_(SH_LINEAS);
  var lineas = tfind_(tLin, 'ID_Pedido', id).map(function (i) {
    return {
      id_linea: tstr_(tLin, i, 'ID_Linea'),
      codigo: tstr_(tLin, i, 'Código'),
      producto: tstr_(tLin, i, 'Producto'),
      unidad: tstr_(tLin, i, 'Unidad'),
      cantidad: tnum_(tLin, i, 'Cantidad'),
      proveedor: tstr_(tLin, i, 'Proveedor'),
      estado: tstr_(tLin, i, 'Estado'),
      id_oc: tstr_(tLin, i, 'ID_OC'),
      cantidad_recibida: tnum_(tLin, i, 'Cantidad_Recibida')
    };
  });
  return { ok: true, found: true, pedido: pedidoObj_(tPed, filas[0]), lineas: lineas };
}

/* Estado del pedido según sus líneas (§3.1). */
function estadoPedidoDe_(estados) {
  if (!estados.length) return 'Pendiente';
  if (estados.indexOf('Pendiente') > -1) return 'Pendiente';
  if (estados.indexOf('Comprado') > -1) return 'En compra';
  return 'Cerrado';
}

function recalcPedidos_(ids) {
  var tPed = table_(SH_PEDIDOS);
  var tLin = table_(SH_LINEAS);
  var vistos = {};
  ids.forEach(function (id) {
    if (!id || vistos[id]) return;
    vistos[id] = true;
    var estados = tfind_(tLin, 'ID_Pedido', id).map(function (i) { return tstr_(tLin, i, 'Estado'); });
    tfind_(tPed, 'ID_Pedido', id).forEach(function (i) { tset_(tPed, i, 'Estado', estadoPedidoDe_(estados)); });
  });
}

// ===== setup.gs =====
/* Docks V3 · preparación de la planilla (§3). Idempotente: crea lo que falta, corrige encabezados
 * y validaciones; nunca borra filas ni mueve datos de columna. */

function setupV3() {
  var lock = LockService.getScriptLock();
  lock.waitLock(V3_LOCK_MS);
  try {
    resetReq_();
    var ss = ss_();
    var res = { ok: true, version: V3_VERSION, creadas: [], corregidas: [], semilla: false };

    V3_SHEET_ORDER.forEach(function (name, pos) {
      var sh = ss.getSheetByName(name);
      if (!sh) {
        sh = ss.insertSheet(name, Math.min(pos, ss.getSheets().length));
        res.creadas.push(name);
      }
      if (sh.getIndex() !== pos + 1) {
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(pos + 1);
      }
      if (V3_HEADERS[name] && setupHeaders_(sh, V3_HEADERS[name])) res.corregidas.push(name);
    });

    borrarHojaVaciaInicial_(ss);
    res.semilla = sembrarLocales_(ss.getSheetByName(SH_LOCALES));
    Object.keys(V3_HEADERS).forEach(function (name) {
      var sh = ss.getSheetByName(name);
      formatoTexto_(sh, V3_TEXT_COLUMNS[name] || []);
    });
    setupValidaciones_(ss);
    setupTablero_(ss, ss.getSheetByName(SH_TABLERO));
    proteger_(ss.getSheetByName(SH_TABLERO), 'TABLERO se arma con fórmulas: no editar a mano.');
    proteger_(ss.getSheetByName(SH_LOG), 'LOG lo escribe el sistema: no editar a mano.');
    SpreadsheetApp.flush();
    log_('setupV3', '', '', true, 'Creadas: ' + (res.creadas.join(', ') || 'ninguna') +
      ' · Corregidas: ' + (res.corregidas.join(', ') || 'ninguna') + (res.semilla ? ' · Semilla LOCALES' : ''));
    return res;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Instalación en un paso: crea o corrige las pestañas y, si no existe, genera la clave de gerencia.
 * La clave se muestra sólo en el registro de ejecución de quien corre la función.
 */
function instalarV3() {
  setupV3();
  var props = PropertiesService.getScriptProperties();
  var clave = props.getProperty('ADMIN_KEY');
  if (!clave) {
    clave = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    props.setProperty('ADMIN_KEY', clave);
    Logger.log('Clave de administración creada: ' + clave);
    Logger.log('Guardala. Se cambia en Configuración del proyecto → Propiedades de la secuencia de comandos (ADMIN_KEY).');
  } else {
    Logger.log('Ya había una clave de administración (ADMIN_KEY). No se cambió.');
  }
  Logger.log('Planilla V3: ' + ss_().getUrl());
  return { ok: true, admin_key_nueva: !props.getProperty('ADMIN_KEY') ? false : true };
}

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Docks V3').addItem('Preparar o reparar planilla', 'setupV3').addToUi();
  } catch (e) { /* sin interfaz */ }
}

/* Escribe o corrige los encabezados de la fila 1. Devuelve true si cambió algo. */
function setupHeaders_(sh, headers) {
  var lastCol = sh.getLastColumn();
  var actual = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h == null ? '' : h).trim(); }) : [];
  var vacia = actual.every(function (h) { return !h; });
  var nuevos;
  var cambio = false;
  if (vacia) {
    nuevos = headers.slice();
    cambio = true;
  } else {
    nuevos = actual.slice();
    var compacto = function (s) { return norm_(s).replace(/[\s_]/g, ''); };
    headers.forEach(function (h) {
      if (nuevos.indexOf(h) > -1) return;
      var j = -1;
      for (var k = 0; k < nuevos.length; k++) {
        if (nuevos[k] && headers.indexOf(nuevos[k]) < 0 && compacto(nuevos[k]) === compacto(h)) { j = k; break; }
      }
      if (j > -1) nuevos[j] = h;
      else nuevos.push(h);
      cambio = true;
    });
  }
  if (nuevos.length > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), nuevos.length - sh.getMaxColumns());
  if (cambio) sh.getRange(1, 1, 1, nuevos.length).setValues([nuevos]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, nuevos.length).setFontWeight('bold');
  return cambio && !vacia;
}

function borrarHojaVaciaInicial_(ss) {
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (V3_SHEET_ORDER.indexOf(name) > -1) return;
    if (!/^(Hoja|Sheet)\s*\d+$/i.test(name)) return;
    if (sh.getLastRow() > 0 || sh.getLastColumn() > 0) return;
    if (ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

function sembrarLocales_(sh) {
  if (sh.getLastRow() > 1) return false;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var filas = LOCALES_SEMILLA.map(function (l) {
    var obj = { 'Local': l[0], 'Activo': l[2], 'Encargados': '', 'Dia_Pedido': 'Lunes', 'Hora_Corte': '14:00', 'Prefijo_Codigo': l[1], 'Observaciones': '' };
    return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  });
  formatoTexto_(sh, V3_TEXT_COLUMNS[SH_LOCALES]);
  sh.getRange(2, 1, filas.length, headers.length).setValues(filas);
  return true;
}

function colDe_(sh, header) {
  var lastCol = sh.getLastColumn();
  var hs = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var i = hs.indexOf(header);
  return i < 0 ? 0 : i + 1;
}

function letraCol_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rangoColumna_(sh, header) {
  var c = colDe_(sh, header);
  var filas = sh.getMaxRows() - 1;
  if (!c || filas < 1) return null;
  return sh.getRange(2, c, filas, 1);
}

function formatoTexto_(sh, headers) {
  headers.forEach(function (h) {
    var r = rangoColumna_(sh, h);
    if (r) r.setNumberFormat('@');
  });
}

function setupValidaciones_(ss) {
  var locales = ss.getSheetByName(SH_LOCALES);
  var proveedores = ss.getSheetByName(SH_PROVEEDORES);
  var rLocales = locales.getRange(2, colDe_(locales, 'Local') || 1, Math.max(locales.getMaxRows() - 1, 1), 1);
  var rProv = proveedores.getRange(2, colDe_(proveedores, 'Proveedor') || 1, Math.max(proveedores.getMaxRows() - 1, 1), 1);

  function lista(valores, aviso) {
    return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(!!aviso).build();
  }
  function rango(r, aviso, ayuda) {
    var b = SpreadsheetApp.newDataValidation().requireValueInRange(r, true).setAllowInvalid(!!aviso);
    if (ayuda) b = b.setHelpText(ayuda);
    return b.build();
  }
  var vLocal = rango(rLocales, false, 'Elegí un local de la pestaña LOCALES.');
  var vProv = rango(rProv, true, 'El proveedor no está en PROVEEDORES (aviso: se acepta igual).');
  var vUnidad = lista(V3_UNIDADES);
  var reglas = {
    CATALOGO: { 'Local': vLocal, 'Unidad': vUnidad, 'Proveedor': vProv, 'Estado': lista(EST_PROD) },
    PROVEEDORES: { 'Activo': lista(SI_NO) },
    LOCALES: { 'Activo': lista(SI_NO), 'Dia_Pedido': lista(DIAS_SEMANA) },
    PEDIDOS: { 'Local': vLocal, 'Prioridad': lista(PRIORIDADES), 'Estado': lista(EST_PEDIDO) },
    PEDIDO_LINEAS: { 'Local': vLocal, 'Unidad': vUnidad, 'Proveedor': vProv, 'Estado': lista(EST_LINEA) },
    MOVIMIENTOS: { 'Tipo': lista(TIPOS_MOV), 'Local': vLocal, 'Unidad': vUnidad },
    COMPRAS: { 'Proveedor': vProv, 'Estado': lista(EST_OC) }
  };
  Object.keys(reglas).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    Object.keys(reglas[name]).forEach(function (h) {
      var r = rangoColumna_(sh, h);
      if (r) r.setDataValidation(reglas[name][h]);
    });
  });
}

function proteger_(sh, descripcion) {
  var ya = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var p = ya.length ? ya[0] : sh.protect();
  p.setDescription(descripcion);
  p.setWarningOnly(true);
}

/* TABLERO (§3.3): B1 selector de local; cinco bloques QUERY lado a lado (no se pisan al crecer). */
function setupTablero_(ss, sh) {
  var cat = ss.getSheetByName(SH_CATALOGO);
  var lin = ss.getSheetByName(SH_LINEAS);
  function L(hoja, h) { return letraCol_(colDe_(hoja, h)); }
  function todo(hoja) { return hoja.getName() + '!A:' + letraCol_(hoja.getLastColumn()); }
  function cond(col) {
    return '"&IF(OR($B$1="",$B$1="Todos"),""," and ' + col + ' = \'"&$B$1&"\'")&"';
  }
  function fecha(dias) {
    var d = 'TODAY()-' + dias;
    return '"&YEAR(' + d + ')&"-"&TEXT(MONTH(' + d + '),"00")&"-"&TEXT(DAY(' + d + '),"00")&"';
  }
  function query(rango, q) {
    return '=IFERROR(QUERY(' + rango + ',"' + q + '",1),"Sin datos")';
  }
  var l = {
    loc: L(lin, 'Local'), prod: L(lin, 'Producto'), uni: L(lin, 'Unidad'), cant: L(lin, 'Cantidad'),
    prov: L(lin, 'Proveedor'), est: L(lin, 'Estado'), oc: L(lin, 'ID_OC'), rec: L(lin, 'Cantidad_Recibida'),
    frec: L(lin, 'Fecha_Recepcion'), id: L(lin, 'ID_Linea')
  };
  var c = {
    cod: L(cat, 'Código'), prod: L(cat, 'Producto'), loc: L(cat, 'Local'), uni: L(cat, 'Unidad'),
    prov: L(cat, 'Proveedor'), par: L(cat, 'Par'), stock: L(cat, 'Stock_Actual'), conteo: L(cat, 'Ultimo_Conteo'), est: L(cat, 'Estado')
  };
  var bloques = [
    { col: 1, titulo: 'Pendientes de compra por proveedor', f: query(todo(lin),
      'select ' + l.prov + ', ' + l.prod + ', ' + l.uni + ', sum(' + l.cant + ') where ' + l.est + " = 'Pendiente'" + cond(l.loc) +
      ' group by ' + l.prov + ', ' + l.prod + ', ' + l.uni + ' order by ' + l.prov + ', ' + l.prod +
      ' label ' + l.prov + " 'Proveedor', " + l.prod + " 'Producto', " + l.uni + " 'Unidad', sum(" + l.cant + ") 'Cantidad'") },
    { col: 6, titulo: 'Órdenes por recibir', f: query(todo(lin),
      'select ' + l.loc + ', ' + l.prov + ', ' + l.oc + ', count(' + l.id + ') where ' + l.est + " = 'Comprado'" + cond(l.loc) +
      ' group by ' + l.loc + ', ' + l.prov + ', ' + l.oc + ' order by ' + l.loc + ', ' + l.prov +
      ' label ' + l.loc + " 'Local', " + l.prov + " 'Proveedor', " + l.oc + " 'Orden', count(" + l.id + ") 'Líneas'") },
    { col: 11, titulo: 'Productos bajo par', f: query(todo(cat),
      'select ' + c.loc + ', ' + c.prod + ', ' + c.uni + ', ' + c.stock + ', ' + c.par + ', ' + c.prov +
      ' where ' + c.est + " = 'Activo' and " + c.par + ' is not null and ' + c.stock + ' is not null and ' + c.stock + ' < ' + c.par + cond(c.loc) +
      ' order by ' + c.loc + ', ' + c.prod +
      ' label ' + c.loc + " 'Local', " + c.prod + " 'Producto', " + c.uni + " 'Unidad', " + c.stock + " 'Stock', " + c.par + " 'Par', " + c.prov + " 'Proveedor'") },
    { col: 18, titulo: 'Sin conteo en 7 días', f: query(todo(cat),
      'select ' + c.loc + ', ' + c.cod + ', ' + c.prod + ', ' + c.conteo + ' where ' + c.est + " = 'Activo' and (" + c.conteo + ' is null or ' + c.conteo + " < '" + fecha(7) + "')" + cond(c.loc) +
      ' order by ' + c.loc + ', ' + c.prod +
      ' label ' + c.loc + " 'Local', " + c.cod + " 'Código', " + c.prod + " 'Producto', " + c.conteo + " 'Último conteo'") },
    { col: 23, titulo: 'Incompletos de los últimos 14 días', f: query(todo(lin),
      'select ' + l.frec + ', ' + l.loc + ', ' + l.prov + ', ' + l.prod + ', ' + l.uni + ', ' + l.cant + ', ' + l.rec + ', ' + l.oc +
      ' where ' + l.est + " = 'Incompleto' and " + l.frec + " >= '" + fecha(14) + "'" + cond(l.loc) +
      ' order by ' + l.frec + ' desc' +
      ' label ' + l.frec + " 'Recepción', " + l.loc + " 'Local', " + l.prov + " 'Proveedor', " + l.prod + " 'Producto', " +
      l.uni + " 'Unidad', " + l.cant + " 'Pedido', " + l.rec + " 'Recibido', " + l.oc + " 'Orden'") }
  ];
  var AYUDA = 32;
  if (sh.getMaxColumns() < AYUDA) sh.insertColumnsAfter(sh.getMaxColumns(), AYUDA - sh.getMaxColumns());

  sh.getRange(1, 1).setValue('Local');
  sh.getRange(1, 1).setFontWeight('bold');
  var sel = sh.getRange(1, 2);
  if (!str_(sel.getValue())) sel.setValue('Todos');
  sh.getRange(1, AYUDA).setValue('Todos');
  var colLoc = L(ss.getSheetByName(SH_LOCALES), 'Local') || 'A';
  var rLoc = SH_LOCALES + '!' + colLoc + '2:' + colLoc;
  sh.getRange(2, AYUDA).setFormula('=FILTER(' + rLoc + ',' + rLoc + '<>"")');
  sel.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sh.getRange(1, AYUDA, 60, 1), true).setAllowInvalid(false)
    .setHelpText('Elegí un local o Todos.').build());
  sh.hideColumns(AYUDA);
  bloques.forEach(function (b) {
    sh.getRange(3, b.col).setValue(b.titulo);
    sh.getRange(3, b.col).setFontWeight('bold');
    sh.getRange(4, b.col).setFormula(b.f);
  });
  sh.setFrozenRows(3);
}

// ===== stock.gs =====
/* Docks V3 · stock: conteos, recepciones, panel y pantalla Hoy. */

function movimiento_(o) {
  return tadd_(table_(SH_MOVIMIENTOS), {
    'Fecha_Hora': nowStr_(), 'ID_Operacion': o.id, 'Tipo': o.tipo, 'Local': o.local, 'Encargado': o.encargado,
    'Código': o.codigo, 'Producto': o.producto, 'Unidad': o.unidad, 'Cantidad': o.cantidad,
    'Saldo_Anterior': o.anterior === null ? '' : o.anterior,
    'Saldo_Resultante': o.resultante === null ? '' : o.resultante,
    'Costo_Unitario': o.costo === null || o.costo === undefined ? '' : o.costo,
    'Referencia': o.referencia || '', 'Observaciones': o.observaciones || ''
  });
}

/* Suma una recepción al stock del catálogo. Stock vacío queda vacío (§3.5). Devuelve {anterior, resultante}. */
function sumarStock_(iCat, cantidad) {
  if (iCat < 0) return { anterior: null, resultante: null };
  var t = table_(SH_CATALOGO);
  var anterior = tnum_(t, iCat, 'Stock_Actual');
  if (anterior === null) return { anterior: null, resultante: null };
  var resultante = round_(anterior + cantidad);
  tset_(t, iCat, 'Stock_Actual', resultante);
  return { anterior: anterior, resultante: resultante };
}

function saveConteo_(b) {
  var id = checkId_(b.id_operacion, 'conteo');
  return withLock_(function () {
    var tMov = table_(SH_MOVIMIENTOS);
    var ya = tfind_(tMov, 'ID_Operacion', id);
    if (ya.length) return { ok: true, id_operacion: id, items: ya.length, duplicado: true };
    var loc = resolverLocal_(b.local, { activo: true });
    var encargado = str_(b.encargado);
    if (!encargado) fail_('Falta el nombre de quien hace el conteo.');
    if (!esArray_(b.items) || !b.items.length) fail_('El conteo no tiene productos.');
    var tCat = table_(SH_CATALOGO);
    var vistos = {};
    var items = b.items.map(function (it) {
      it = it || {};
      if (!str_(it.codigo)) fail_('Hay un producto sin código en el conteo.');
      var i = buscarProductoLocal_(loc.local, it.codigo);
      var nombre = tstr_(tCat, i, 'Producto');
      if (vistos[i]) fail_(nombre + ' está repetido en el conteo.');
      vistos[i] = true;
      return { i: i, nombre: nombre, cantidad: cantidad_(it.cantidad, nombre, true), observaciones: str_(it.observaciones) };
    });
    var now = nowStr_();
    items.forEach(function (x) {
      var anterior = tnum_(tCat, x.i, 'Stock_Actual');
      movimiento_({
        id: id, tipo: 'CONTEO', local: loc.local, encargado: encargado,
        codigo: tstr_(tCat, x.i, 'Código'), producto: x.nombre, unidad: tstr_(tCat, x.i, 'Unidad'),
        cantidad: x.cantidad, anterior: anterior, resultante: x.cantidad, observaciones: x.observaciones
      });
      tset_(tCat, x.i, 'Stock_Actual', x.cantidad);
      tset_(tCat, x.i, 'Ultimo_Conteo', now);
    });
    agregarEncargado_(loc.i, encargado);
    log_('saveConteo', id, loc.local, true, items.length + ' productos · ' + encargado);
    return { ok: true, id_operacion: id, items: items.length };
  });
}

function resumenRecepcion_(id) {
  var tLin = table_(SH_LINEAS);
  var entregadas = 0;
  var incompletas = 0;
  tfind_(tLin, 'ID_Recepcion', id).forEach(function (i) {
    var e = tstr_(tLin, i, 'Estado');
    if (e === 'Entregado') entregadas++;
    else if (e === 'Incompleto') incompletas++;
  });
  var tMov = table_(SH_MOVIMIENTOS);
  var extras = tfind_(tMov, 'ID_Operacion', id).filter(function (i) { return tstr_(tMov, i, 'Referencia') === V3_SIN_PEDIDO; }).length;
  return { entregadas: entregadas, incompletas: incompletas, extras: extras, total: entregadas + incompletas + extras };
}

function saveRecepcion_(b) {
  var id = checkId_(b.id_operacion, 'recepción');
  return withLock_(function () {
    var previo = resumenRecepcion_(id);
    if (previo.total > 0 || tfind_(table_(SH_MOVIMIENTOS), 'ID_Operacion', id).length) {
      return { ok: true, id_operacion: id, entregadas: previo.entregadas, incompletas: previo.incompletas, extras: previo.extras, duplicado: true };
    }
    var loc = resolverLocal_(b.local);
    var encargado = str_(b.encargado);
    if (!encargado) fail_('Falta el nombre de quien recibe.');
    var items = esArray_(b.items) ? b.items : [];
    var extras = esArray_(b.extras) ? b.extras : [];
    if (!items.length && !extras.length) fail_('La recepción no tiene productos.');
    var obs = str_(b.observaciones);
    var tLin = table_(SH_LINEAS);
    var tCat = table_(SH_CATALOGO);
    var vistos = {};
    var lineas = items.map(function (it) {
      it = it || {};
      var idl = str_(it.id_linea);
      if (!idl) fail_('Hay una línea sin identificador en la recepción.');
      var filas = tfind_(tLin, 'ID_Linea', idl);
      if (!filas.length) fail_('La línea ' + idl + ' no existe.');
      var i = filas[0];
      var nombre = tstr_(tLin, i, 'Producto');
      if (norm_(tget_(tLin, i, 'Local')) !== norm_(loc.local)) fail_('La línea de ' + nombre + ' (' + idl + ') es de ' + tstr_(tLin, i, 'Local') + ', no de ' + loc.local + '.');
      var est = tstr_(tLin, i, 'Estado');
      if (est !== 'Comprado') fail_('La línea de ' + nombre + ' no está comprada (estado: ' + (est || 'sin estado') + ').');
      if (vistos[i]) fail_(nombre + ' está repetido en la recepción.');
      vistos[i] = true;
      return { i: i, nombre: nombre, recibida: cantidad_(it.cantidad_recibida, nombre, true) };
    });
    var extrasVal = extras.map(function (x) {
      x = x || {};
      if (!str_(x.codigo)) fail_('Hay un producto sin código entre los extras.');
      var i = buscarProductoLocal_(loc.local, x.codigo);
      var nombre = tstr_(tCat, i, 'Producto');
      return { i: i, nombre: nombre, cantidad: cantidad_(x.cantidad, nombre) };
    });

    var now = nowStr_();
    var entregadas = 0;
    var incompletas = 0;
    var faltantes = [];
    var pedidos = [];
    var ordenes = [];
    lineas.forEach(function (x) {
      var i = x.i;
      var pedida = tnum_(tLin, i, 'Cantidad') || 0;
      var codigo = tstr_(tLin, i, 'Código');
      var oc = tstr_(tLin, i, 'ID_OC');
      if (x.recibida > 0) {
        var iCat = codigo ? buscarProductoLocal_(loc.local, codigo, { opcional: true }) : -1;
        var s = sumarStock_(iCat, x.recibida);
        movimiento_({
          id: id, tipo: 'RECEPCION', local: loc.local, encargado: encargado, codigo: codigo, producto: x.nombre,
          unidad: tstr_(tLin, i, 'Unidad'), cantidad: x.recibida, anterior: s.anterior, resultante: s.resultante,
          costo: tnum_(tLin, i, 'Precio_Ref'), referencia: oc, observaciones: obs
        });
      }
      var completa = x.recibida >= pedida - 1e-9;
      tset_(tLin, i, 'Estado', completa ? 'Entregado' : 'Incompleto');
      tset_(tLin, i, 'Cantidad_Recibida', x.recibida);
      tset_(tLin, i, 'Fecha_Recepcion', now);
      tset_(tLin, i, 'ID_Recepcion', id);
      if (completa) entregadas++;
      else {
        incompletas++;
        faltantes.push(x.nombre + ' ' + fmtNum_(x.recibida) + ' de ' + fmtNum_(pedida) + ' ' + tstr_(tLin, i, 'Unidad'));
      }
      pedidos.push(tstr_(tLin, i, 'ID_Pedido'));
      if (oc) ordenes.push(oc);
    });
    extrasVal.forEach(function (x) {
      var s = sumarStock_(x.i, x.cantidad);
      movimiento_({
        id: id, tipo: 'RECEPCION', local: loc.local, encargado: encargado, codigo: tstr_(tCat, x.i, 'Código'),
        producto: x.nombre, unidad: tstr_(tCat, x.i, 'Unidad'), cantidad: x.cantidad,
        anterior: s.anterior, resultante: s.resultante, costo: tnum_(tCat, x.i, 'Precio'),
        referencia: V3_SIN_PEDIDO, observaciones: obs
      });
    });
    recalcPedidos_(pedidos);
    recalcCompras_(ordenes);
    agregarEncargado_(loc.i, encargado);
    log_('saveRecepcion', id, loc.local, true, entregadas + ' entregadas, ' + incompletas + ' incompletas, ' + extrasVal.length + ' extras');
    if (incompletas) {
      despues_(function () {
        telegram_('Recepción con faltantes · ' + loc.local + '\n' + faltantes.join('\n') + '\n' + id, id, loc.local);
      });
    }
    return { ok: true, id_operacion: id, entregadas: entregadas, incompletas: incompletas, extras: extrasVal.length };
  });
}

/* Órdenes con líneas Comprado del local, agrupadas por ID_OC. */
function porRecibir_(local) {
  var tLin = table_(SH_LINEAS);
  var tOc = table_(SH_COMPRAS);
  var grupos = {};
  var orden = [];
  tfind_(tLin, 'Estado', 'Comprado').forEach(function (i) {
    if (norm_(tget_(tLin, i, 'Local')) !== norm_(local)) return;
    var oc = tstr_(tLin, i, 'ID_OC');
    if (!grupos[oc]) {
      var f = oc ? tfind_(tOc, 'ID_OC', oc)[0] : undefined;
      grupos[oc] = {
        id_oc: oc,
        proveedor: f !== undefined ? tstr_(tOc, f, 'Proveedor') : tstr_(tLin, i, 'Proveedor'),
        fecha_hora: f !== undefined ? tstr_(tOc, f, 'Fecha_Hora') : '',
        lineas: []
      };
      orden.push(oc);
    }
    grupos[oc].lineas.push({
      id_linea: tstr_(tLin, i, 'ID_Linea'),
      id_pedido: tstr_(tLin, i, 'ID_Pedido'),
      codigo: tstr_(tLin, i, 'Código'),
      producto: tstr_(tLin, i, 'Producto'),
      unidad: tstr_(tLin, i, 'Unidad'),
      cantidad: tnum_(tLin, i, 'Cantidad'),
      precio_ref: tnum_(tLin, i, 'Precio_Ref')
    });
  });
  return orden.map(function (k) { return grupos[k]; }).sort(function (a, b) {
    return a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : 0;
  });
}

function getPorRecibir_(p) {
  var loc = resolverLocal_(p.local);
  return { ok: true, local: loc.local, ordenes: porRecibir_(loc.local) };
}

function estadoStock_(par, stock) {
  if (stock === null) return 'SIN_CONTEO';
  if (par === null) return 'SIN_PAR';
  if (stock <= 0) return 'SIN_STOCK';
  if (stock < par) return 'BAJO';
  return 'OK';
}

function getStockPanel_(p) {
  var local = str_(p.local) ? resolverLocal_(p.local).local : null;
  var t = table_(SH_CATALOGO);
  var abiertos = pedidoAbiertoMap_();
  var filas = [];
  tfilas_(t).forEach(function (i) {
    if (!tstr_(t, i, 'Código') && !tstr_(t, i, 'Producto')) return;
    if (estadoProducto_(t, i) !== 'Activo') return;
    if (local !== null && norm_(tget_(t, i, 'Local')) !== norm_(local)) return;
    var pr = productoObj_(t, i, abiertos);
    filas.push({
      local: pr.local, codigo: pr.codigo, producto: pr.producto, categoria: pr.categoria, unidad: pr.unidad,
      proveedor: pr.proveedor, par: pr.par, stock_actual: pr.stock_actual, pedido_abierto: pr.pedido_abierto,
      sugerido: pr.sugerido, ultimo_conteo: pr.ultimo_conteo,
      dias_sin_contar: pr.ultimo_conteo ? diasDesde_(pr.ultimo_conteo) : null,
      estado: estadoStock_(pr.par, pr.stock_actual)
    });
  });
  return { ok: true, filas: filas };
}

function getHoy_(p) {
  var loc = resolverLocal_(p.local);
  var semana = semanaDe_();
  var tPed = table_(SH_PEDIDOS);
  var delLocal = tfind_(tPed, 'Local', loc.local, true);
  var deSemana = delLocal.filter(function (i) { return tstr_(tPed, i, 'Semana') === semana.id; });
  var ultimo = null;
  deSemana.forEach(function (i) {
    if (ultimo === null || tstr_(tPed, i, 'Fecha_Hora') >= tstr_(tPed, ultimo, 'Fecha_Hora')) ultimo = i;
  });

  var tMov = table_(SH_MOVIMIENTOS);
  var conteo = null;
  var cT = tMov.idx['Tipo'];
  var cL = tMov.idx['Local'];
  for (var i = tMov.rows.length - 1; i >= 0; i--) {
    var r = tMov.rows[i];
    if (str_(r[cT]) === 'CONTEO' && norm_(r[cL]) === norm_(loc.local)) { conteo = i; break; }
  }
  var ultimoConteo = null;
  if (conteo !== null) {
    var idc = tstr_(tMov, conteo, 'ID_Operacion');
    ultimoConteo = { id_operacion: idc, fecha_hora: tstr_(tMov, conteo, 'Fecha_Hora'), productos: tfind_(tMov, 'ID_Operacion', idc).length };
  }

  var tCat = table_(SH_CATALOGO);
  var bajo = 0;
  tfind_(tCat, 'Local', loc.local, true).forEach(function (k) {
    if (estadoProducto_(tCat, k) !== 'Activo') return;
    var par = tnum_(tCat, k, 'Par');
    var st = tnum_(tCat, k, 'Stock_Actual');
    if (par !== null && st !== null && st < par) bajo++;
  });

  return {
    ok: true,
    local: loc.local,
    semana: semana,
    pedido_semana: ultimo === null ? null : {
      id_pedido: tstr_(tPed, ultimo, 'ID_Pedido'),
      fecha_hora: tstr_(tPed, ultimo, 'Fecha_Hora'),
      estado: tstr_(tPed, ultimo, 'Estado'),
      lineas: tnum_(tPed, ultimo, 'Lineas')
    },
    pedidos_semana: deSemana.length,
    ultimo_conteo: ultimoConteo,
    por_recibir: porRecibir_(loc.local).length,
    bajo_par: bajo
  };
}

/* Busca una operación por ID: CONTEO, RECEPCION (MOVIMIENTOS o líneas), OC (COMPRAS) o PEDIDO. */
function getOperacion_(p) {
  var id = str_(p.id || p.id_operacion);
  if (!id) fail_('Falta el identificador de la operación.');
  var tMov = table_(SH_MOVIMIENTOS);
  var tLin = table_(SH_LINEAS);
  var movs = tfind_(tMov, 'ID_Operacion', id);
  var lineasRec = tfind_(tLin, 'ID_Recepcion', id);

  if (movs.length && tstr_(tMov, movs[0], 'Tipo') === 'CONTEO') {
    return {
      ok: true, found: true, id: id, tipo: 'CONTEO',
      local: tstr_(tMov, movs[0], 'Local'), fecha_hora: tstr_(tMov, movs[0], 'Fecha_Hora'),
      encargado: tstr_(tMov, movs[0], 'Encargado'),
      items: movs.length,
      detalle: movs.map(function (i) {
        return {
          codigo: tstr_(tMov, i, 'Código'), producto: tstr_(tMov, i, 'Producto'), unidad: tstr_(tMov, i, 'Unidad'),
          cantidad: tnum_(tMov, i, 'Cantidad'), saldo_anterior: tnum_(tMov, i, 'Saldo_Anterior'),
          saldo_resultante: tnum_(tMov, i, 'Saldo_Resultante')
        };
      })
    };
  }
  if (movs.length || lineasRec.length) {
    var items = lineasRec.map(function (i) {
      return {
        id_linea: tstr_(tLin, i, 'ID_Linea'), id_oc: tstr_(tLin, i, 'ID_OC'), codigo: tstr_(tLin, i, 'Código'),
        producto: tstr_(tLin, i, 'Producto'), unidad: tstr_(tLin, i, 'Unidad'), cantidad: tnum_(tLin, i, 'Cantidad'),
        cantidad_recibida: tnum_(tLin, i, 'Cantidad_Recibida'), estado: tstr_(tLin, i, 'Estado')
      };
    });
    movs.forEach(function (i) {
      if (tstr_(tMov, i, 'Referencia') !== V3_SIN_PEDIDO) return;
      items.push({
        id_linea: '', id_oc: '', codigo: tstr_(tMov, i, 'Código'), producto: tstr_(tMov, i, 'Producto'),
        unidad: tstr_(tMov, i, 'Unidad'), cantidad: null, cantidad_recibida: tnum_(tMov, i, 'Cantidad'), estado: V3_SIN_PEDIDO
      });
    });
    var ref = movs.length ? { t: tMov, i: movs[0], f: 'Fecha_Hora' } : { t: tLin, i: lineasRec[0], f: 'Fecha_Recepcion' };
    var resumen = resumenRecepcion_(id);
    return {
      ok: true, found: true, id: id, tipo: 'RECEPCION',
      local: tstr_(ref.t, ref.i, 'Local'), fecha_hora: tstr_(ref.t, ref.i, ref.f),
      encargado: movs.length ? tstr_(tMov, movs[0], 'Encargado') : '',
      items: items.length,
      entregadas: resumen.entregadas, incompletas: resumen.incompletas, extras: resumen.extras,
      detalle: items
    };
  }
  var tOc = table_(SH_COMPRAS);
  var oc = tfind_(tOc, 'ID_OC', id);
  if (oc.length) {
    var j = oc[0];
    var orden = ordenRespuesta_(tOc, j);
    var lineasOc = tfind_(tLin, 'ID_OC', id);
    return {
      ok: true, found: true, id: id, tipo: 'OC',
      local: tstr_(tOc, j, 'Locales'), fecha_hora: orden.fecha_hora,
      proveedor: orden.proveedor, estado: orden.estado,
      texto_whatsapp: orden.texto_whatsapp, whatsapp_url: orden.whatsapp_url,
      items: lineasOc.length,
      detalle: lineasOc.map(function (i) {
        return {
          id_linea: tstr_(tLin, i, 'ID_Linea'), local: tstr_(tLin, i, 'Local'), codigo: tstr_(tLin, i, 'Código'),
          producto: tstr_(tLin, i, 'Producto'), unidad: tstr_(tLin, i, 'Unidad'), cantidad: tnum_(tLin, i, 'Cantidad'),
          estado: tstr_(tLin, i, 'Estado')
        };
      })
    };
  }
  var tPed = table_(SH_PEDIDOS);
  var ped = tfind_(tPed, 'ID_Pedido', id);
  if (ped.length) {
    var lineasPed = tfind_(tLin, 'ID_Pedido', id);
    return {
      ok: true, found: true, id: id, tipo: 'PEDIDO',
      local: tstr_(tPed, ped[0], 'Local'), fecha_hora: tstr_(tPed, ped[0], 'Fecha_Hora'),
      items: lineasPed.length,
      detalle: lineasPed.map(function (i) {
        return {
          id_linea: tstr_(tLin, i, 'ID_Linea'), codigo: tstr_(tLin, i, 'Código'), producto: tstr_(tLin, i, 'Producto'),
          unidad: tstr_(tLin, i, 'Unidad'), cantidad: tnum_(tLin, i, 'Cantidad'), estado: tstr_(tLin, i, 'Estado')
        };
      })
    };
  }
  return { ok: true, found: false, id: id };
}

// ===== telegram.gs =====
/* Docks V3 · notificaciones Telegram (§4.4). Opcional: sin propiedades no hace nada.
 * Un fallo se registra en LOG y nunca hace fallar la escritura. */

function telegram_(texto, ref, local) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chat = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) return false;
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: chat, text: String(texto).slice(0, 3900), disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    var code = res && res.getResponseCode ? res.getResponseCode() : 200;
    if (code < 200 || code >= 300) {
      log_('TELEGRAM', ref, local, false, 'Telegram respondió ' + code);
      return false;
    }
    return true;
  } catch (e) {
    log_('TELEGRAM', ref, local, false, 'No se pudo avisar por Telegram: ' + errMsg_(e));
    return false;
  }
}

/* Para probar desde el editor: envía un mensaje de prueba. */
function probarTelegramV3() {
  resetReq_();
  return telegram_('Docks V3 · prueba de notificaciones (' + nowStr_() + ')', 'prueba', '');
}

// ===== util.gs =====
/* Docks V3 · utilidades comunes: planilla, tablas por encabezado, fechas, números, lock, log y respuesta. */

/* ---------- estado por request ---------- */
var V3_REQ = null;

function resetReq_() {
  var now = new Date();
  V3_REQ = { tables: {}, now: now, nowStr: fmtDate_(now, 'yyyy-MM-dd HH:mm:ss'), after: [] };
  return V3_REQ;
}

function req_() {
  return V3_REQ || resetReq_();
}

/* ---------- planilla ---------- */
function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || V3_SHEET_ID_DEFAULT;
  if (!id) fail_('El script no está vinculado a una planilla y falta la propiedad SHEET_ID.');
  return SpreadsheetApp.openById(id);
}

/* ---------- errores ---------- */
function fail_(msg) {
  var e = new Error(msg);
  e.user = true;
  throw e;
}

/* ---------- texto ---------- */
function norm_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function str_(v) {
  if (v === null || v === undefined) return '';
  if (isDate_(v)) return fmtDate_(v, 'yyyy-MM-dd HH:mm:ss');
  return String(v).trim();
}

function horaStr_(v) {
  if (isDate_(v)) return fmtDate_(v, 'HH:mm');
  return str_(v);
}

function fechaStr_(v) {
  if (isDate_(v)) return fmtDate_(v, 'yyyy-MM-dd');
  return str_(v);
}

function splitList_(v) {
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return v.map(function (x) { return str_(x); }).filter(function (x) { return x; });
  }
  return str_(v).split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function siNo_(v, def) {
  if (v === true) return 'SÍ';
  if (v === false) return 'NO';
  var n = norm_(v);
  if (!n) return def;
  if (n === 'si' || n === 's' || n === 'true' || n === '1' || n === 'activo') return 'SÍ';
  if (n === 'no' || n === 'n' || n === 'false' || n === '0' || n === 'inactivo') return 'NO';
  return null;
}

function esSi_(v) {
  return siNo_(v, 'SÍ') === 'SÍ';
}

/* ---------- números ---------- */
function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v === null || v === undefined || typeof v === 'boolean' || isDate_(v)) return null;
  var s = String(v).replace(/\s/g, '');
  if (!s) return null;
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function round_(n, dec) {
  if (n === null || n === undefined) return null;
  var f = Math.pow(10, dec === undefined ? 6 : dec);
  return Math.round(n * f) / f;
}

/* Número para mostrar en textos (WhatsApp, Telegram): coma decimal, hasta 2 decimales, sin separador de miles. */
function fmtNum_(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function esContable_(unidad) {
  return V3_CONTABLES.indexOf(String(unidad || '').toLowerCase()) > -1;
}

/* Regla §3.5, idéntica a Docks.sugerido de core.js. */
function sugerido_(par, stock, abierto, unidad) {
  if (par === null || par === undefined) return { cantidad: null, motivo: 'SIN_PAR' };
  if (stock === null || stock === undefined) return { cantidad: null, motivo: 'SIN_CONTEO' };
  var q = Math.max(0, par - stock - (abierto || 0));
  if (esContable_(unidad)) q = Math.ceil(q - 1e-9);
  else q = Math.ceil(q * 10 - 1e-9) / 10;
  return { cantidad: Math.max(0, q), motivo: 'OK' };
}

/* ---------- fechas (zona AR) ---------- */
function isDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function fmtDate_(d, fmt) {
  return Utilities.formatDate(d, V3_TZ, fmt);
}

function nowStr_() {
  return req_().nowStr;
}

function hoyStr_() {
  return req_().nowStr.slice(0, 10);
}

function ymdParts_(v) {
  var s;
  if (v === null || v === undefined || v === '') s = hoyStr_();
  else if (isDate_(v)) s = fmtDate_(v, 'yyyy-MM-dd');
  else s = String(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function ymdUtc_(v) {
  var p = ymdParts_(v);
  return p ? Date.UTC(p[0], p[1] - 1, p[2]) : null;
}

function pad2_(n) {
  return n < 10 ? '0' + n : String(n);
}

function isoUtc_(t) {
  var d = new Date(t);
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/* 'yyyy-MM-dd' de hoy (AR) más n días. */
function sumarDias_(n) {
  return isoUtc_(ymdUtc_(null) + n * 864e5);
}

/* Días enteros entre una fecha guardada y hoy (AR). */
function diasDesde_(v) {
  var t = ymdUtc_(str_(v) ? v : 'x');
  if (t === null) return null;
  return Math.round((ymdUtc_(null) - t) / 864e5);
}

/* Semana ISO lunes a domingo, misma regla que Docks.semana.de (core.js). */
function semanaDe_(v) {
  var DAY = 864e5;
  var dia = ymdUtc_(v);
  if (dia === null) dia = ymdUtc_(null);
  var dow = (new Date(dia).getUTCDay() + 6) % 7;
  var inicio = dia - dow * DAY;
  var fin = inicio + 6 * DAY;
  var anio = new Date(inicio + 3 * DAY).getUTCFullYear();
  var primero = Date.UTC(anio, 0, 4);
  var inicioPrimera = primero - ((new Date(primero).getUTCDay() + 6) % 7) * DAY;
  var num = 1 + Math.round((inicio - inicioPrimera) / (7 * DAY));
  var di = new Date(inicio);
  var df = new Date(fin);
  var label = 'Semana ' + num + ' · ' + di.getUTCDate() +
    (di.getUTCMonth() !== df.getUTCMonth() ? ' ' + V3_MESES[di.getUTCMonth()] : '') +
    ' al ' + df.getUTCDate() + ' ' + V3_MESES[df.getUTCMonth()];
  return { id: anio + '-W' + pad2_(num), label: label, inicio: isoUtc_(inicio), fin: isoUtc_(fin) };
}

/* Etiqueta de una semana a partir de su ID '2026-W42'. */
function semanaLabelDeId_(id) {
  var m = String(id || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  var anio = Number(m[1]);
  var primero = Date.UTC(anio, 0, 4);
  var lunes = primero - ((new Date(primero).getUTCDay() + 6) % 7) * 864e5 + (Number(m[2]) - 1) * 7 * 864e5;
  return semanaDe_(isoUtc_(lunes));
}

/* ---------- IDs ---------- */
function checkId_(id, que) {
  var s = str_(id);
  if (!s) fail_('Falta el identificador de ' + que + '.');
  if (!V3_ID_RE.test(s)) fail_('Identificador de ' + que + ' inválido: ' + s + '.');
  return s;
}

/* ---------- tablas por encabezado ---------- */
function table_(name) {
  var req = req_();
  if (req.tables[name]) return req.tables[name];
  var sheet = ss_().getSheetByName(name);
  if (!sheet) fail_('Falta la pestaña ' + name + ' en la planilla. Ejecutá setupV3() desde el editor de Apps Script.');
  var values = sheet.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h == null ? '' : h).trim(); });
  var idx = {};
  headers.forEach(function (h, i) { if (h && !(h in idx)) idx[h] = i; });
  var faltan = (V3_HEADERS[name] || []).filter(function (h) { return !(h in idx); });
  if (faltan.length) fail_('Falta la columna ' + faltan.join(', ') + ' en ' + name + '. Ejecutá setupV3().');
  var t = {
    name: name, sheet: sheet, headers: headers, idx: idx,
    rows: values.slice(1), origLen: values.length - 1, width: headers.length,
    dirty: {}, changed: false, indexes: {}
  };
  req.tables[name] = t;
  return t;
}

function tget_(t, i, h) {
  return t.rows[i][t.idx[h]];
}

function tstr_(t, i, h) {
  return str_(t.rows[i][t.idx[h]]);
}

function tnum_(t, i, h) {
  return num_(t.rows[i][t.idx[h]]);
}

function tset_(t, i, h, v) {
  var c = t.idx[h];
  if (c === undefined) fail_('Falta la columna ' + h + ' en ' + t.name + '.');
  if (v === null || v === undefined) v = '';
  if (t.rows[i][c] === v) return;
  t.rows[i][c] = v;
  t.changed = true;
  if (t.indexes[h]) delete t.indexes[h];
  if (i < t.origLen) {
    if (!t.dirty[c]) t.dirty[c] = {};
    t.dirty[c][i] = true;
  }
}

function tadd_(t, obj) {
  var row = [];
  for (var c = 0; c < t.width; c++) row.push('');
  Object.keys(obj).forEach(function (k) {
    if (k in t.idx) row[t.idx[k]] = obj[k] === null || obj[k] === undefined ? '' : obj[k];
  });
  t.rows.push(row);
  t.changed = true;
  var i = t.rows.length - 1;
  Object.keys(t.indexes).forEach(function (h) {
    var ix = t.indexes[h];
    var k = ix.key(row[t.idx[h]]);
    if (!k) return;
    (ix.map[k] = ix.map[k] || []).push(i);
  });
  return i;
}

function rowEmpty_(row) {
  for (var c = 0; c < row.length; c++) {
    if (row[c] !== '' && row[c] !== null && row[c] !== undefined) return false;
  }
  return true;
}

/* Índices de filas no vacías. */
function tfilas_(t) {
  var out = [];
  for (var i = 0; i < t.rows.length; i++) if (!rowEmpty_(t.rows[i])) out.push(i);
  return out;
}

/* Índice por columna (clave exacta como texto, o normalizada si norm = true). */
function tindex_(t, h, normalizar) {
  var cacheKey = h;
  var ix = t.indexes[cacheKey];
  if (ix && ix.norm === !!normalizar) return ix.map;
  var key = normalizar ? function (v) { return norm_(str_(v)); } : function (v) { return str_(v); };
  var map = {};
  var c = t.idx[h];
  for (var i = 0; i < t.rows.length; i++) {
    var k = key(t.rows[i][c]);
    if (!k) continue;
    (map[k] = map[k] || []).push(i);
  }
  t.indexes[cacheKey] = { map: map, key: key, norm: !!normalizar };
  return map;
}

function tfind_(t, h, valor, normalizar) {
  var map = tindex_(t, h, normalizar);
  var k = normalizar ? norm_(valor) : str_(valor);
  return map[k] || [];
}

/* Texto que la planilla interpretaría como fórmula (=, +, -) se guarda como texto literal. */
function celdaSalida_(v) {
  if (typeof v === 'string' && /^[=+\-]/.test(v) && num_(v) === null) return "'" + v;
  return v;
}

/* Escribe en bloque: columnas modificadas por tramos contiguos y filas nuevas con un solo setValues. */
function flushTable_(t) {
  if (!t.changed) return;
  var sh = t.sheet;
  Object.keys(t.dirty).forEach(function (c) {
    var col = Number(c);
    var filas = Object.keys(t.dirty[c]).map(Number).sort(function (a, b) { return a - b; });
    var k = 0;
    while (k < filas.length) {
      var desde = filas[k];
      var hasta = desde;
      while (k + 1 < filas.length && filas[k + 1] - hasta <= 25) { k++; hasta = filas[k]; }
      var vals = [];
      for (var i = desde; i <= hasta; i++) vals.push([celdaSalida_(t.rows[i][col])]);
      sh.getRange(desde + 2, col + 1, vals.length, 1).setValues(vals);
      k++;
    }
  });
  var nuevos = t.rows.slice(t.origLen);
  if (nuevos.length) {
    var inicio = t.origLen + 2;
    var necesita = inicio + nuevos.length - 1;
    var max = sh.getMaxRows();
    if (necesita > max) sh.insertRowsAfter(max, necesita - max);
    sh.getRange(inicio, 1, nuevos.length, t.width).setValues(nuevos.map(function (r) { return r.map(celdaSalida_); }));
  }
  t.dirty = {};
  t.origLen = t.rows.length;
  t.changed = false;
}

function flushAll_() {
  var tables = req_().tables;
  Object.keys(tables).forEach(function (k) { flushTable_(tables[k]); });
}

/* ---------- lock ---------- */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(V3_LOCK_MS);
  } catch (e) {
    fail_('La planilla está ocupada con otra operación. Probá de nuevo en unos segundos.');
  }
  var out;
  var after;
  try {
    resetReq_();
    out = fn();
    flushAll_();
    SpreadsheetApp.flush();
    after = req_().after;
  } finally {
    lock.releaseLock();
  }
  (after || []).forEach(function (f) {
    try { f(); } catch (e) { log_('AVISO', '', '', false, 'Tarea posterior falló: ' + errMsg_(e)); }
  });
  return out;
}

/* Tarea a ejecutar después de escribir y liberar el lock (p. ej. Telegram). */
function despues_(fn) {
  req_().after.push(fn);
}

/* ---------- log ---------- */
function log_(tipo, ref, local, ok, detalle) {
  try {
    var sh = ss_().getSheetByName(SH_LOG);
    if (!sh) return;
    sh.appendRow([nowStr_(), String(tipo || ''), String(ref || ''), String(local || ''), ok ? 'SÍ' : 'NO', String(detalle || '').slice(0, 500)]);
  } catch (e) {
    /* el log nunca hace fallar una operación */
  }
}

function errMsg_(e) {
  return String((e && e.message) || e);
}

/* ---------- respuesta ---------- */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function webResponse_(obj, e) {
  var callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  if (!callback) return jsonOut_(obj);
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback) || callback.length > 120) {
    return jsonOut_({ ok: false, error: 'Callback inválido' });
  }
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ---------- admin ---------- */
function checkAdminKey_(key) {
  var esperada = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!esperada) fail_('La clave de gerencia no está configurada en el servidor (propiedad de script ADMIN_KEY).');
  var k = str_(key);
  if (!k) fail_('Falta la clave de gerencia.');
  if (k !== String(esperada)) fail_('Clave de gerencia incorrecta.');
  return true;
}
