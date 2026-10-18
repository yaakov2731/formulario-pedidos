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
