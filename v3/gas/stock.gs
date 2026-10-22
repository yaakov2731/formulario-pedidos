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
    ultimoConteo = { id_operacion: idc, fecha_hora: tstr_(tMov, conteo, 'Fecha_Hora'), encargado: tstr_(tMov, conteo, 'Encargado'), productos: tfind_(tMov, 'ID_Operacion', idc).length };
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
      encargado: tstr_(tPed, ultimo, 'Encargado'),
      lineas: tnum_(tPed, ultimo, 'Lineas')
    },
    pedidos_semana: deSemana.length,
    ultimo_conteo: ultimoConteo,
    por_recibir: porRecibir_(loc.local).length,
    bajo_par: bajo,
    ultimo_elaborados: ultimoConteoElaborados_(loc.local),
    elaborados_activos: elaboradosActivos_(loc.local)
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
  var opElab = operacionElaborados_(id);
  if (opElab) return opElab;
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
