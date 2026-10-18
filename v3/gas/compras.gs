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
