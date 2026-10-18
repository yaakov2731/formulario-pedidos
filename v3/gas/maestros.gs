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
