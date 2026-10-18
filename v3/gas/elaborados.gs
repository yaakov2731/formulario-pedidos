/* Docks V3 · elaborados: qué queda de lo producido en cada local (listo para vender, marcado o crudo).
 * Pestañas ELABORADOS (lista y último estado por producto) y CONTEO_ELABORADOS (una fila por producto
 * y conteo). Contrato §3 y §4 (Elaborados). */

function hojaExiste_(name) {
  return !!ss_().getSheetByName(name);
}

/* Crea las pestañas de elaborados si faltan (planillas instaladas antes de esta etapa). */
function asegurarHojasElaborados_() {
  var ss = ss_();
  var creadas = [];
  [SH_ELABORADOS, SH_CONTEO_ELAB].forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    var pos = V3_SHEET_ORDER.indexOf(name);
    var sh = ss.insertSheet(name, Math.min(pos, ss.getSheets().length));
    setupHeaders_(sh, V3_HEADERS[name]);
    formatoTexto_(sh, V3_TEXT_COLUMNS[name] || []);
    creadas.push(name);
  });
  if (creadas.length) {
    setupValidaciones_(ss);
    SpreadsheetApp.flush();
    log_('setupV3', '', '', true, 'Pestañas creadas al usarlas: ' + creadas.join(', '));
  }
  return creadas;
}

function elaboradoObj_(t, i) {
  var o = {
    codigo: tstr_(t, i, 'Código'),
    producto: tstr_(t, i, 'Producto'),
    local: tstr_(t, i, 'Local'),
    categoria: tstr_(t, i, 'Categoría'),
    unidad: tstr_(t, i, 'Unidad')
  };
  var total = null;
  ESTADOS_ELAB.forEach(function (e) {
    var n = tnum_(t, i, e[0]);
    o[e[1]] = n;
    if (n !== null) total = (total || 0) + n;
  });
  o.total = total === null ? null : round_(total);
  o.ultimo_conteo = tstr_(t, i, 'Ultimo_Conteo');
  o.dias_sin_contar = diasDesde_(o.ultimo_conteo);
  o.activo = esSi_(tget_(t, i, 'Activo'));
  o.observaciones = tstr_(t, i, 'Observaciones');
  return o;
}

/* Lista de elaborados. Con `local`, sólo los activos de ese local; sin él, todos. */
function getElaborados_(p) {
  asegurarHojasElaborados_();
  var t = table_(SH_ELABORADOS);
  var local = str_(p.local);
  var loc = local ? resolverLocal_(local) : null;
  var filas = loc ? tfind_(t, 'Local', loc.local, true) : tfilas_(t);
  var productos = [];
  filas.forEach(function (i) {
    if (!tstr_(t, i, 'Producto')) return;
    var o = elaboradoObj_(t, i);
    if (loc && !o.activo) return;
    productos.push(o);
  });
  return { ok: true, local: loc ? loc.local : '', productos: productos };
}

function buscarElaborado_(local, codigo, opts) {
  var t = table_(SH_ELABORADOS);
  var cod = str_(codigo).toUpperCase();
  var filas = tfind_(t, 'Código', cod, true).filter(function (i) { return tstr_(t, i, 'Código').toUpperCase() === cod; });
  for (var k = 0; k < filas.length; k++) {
    if (norm_(tget_(t, filas[k], 'Local')) === norm_(local)) return filas[k];
  }
  if (opts && opts.opcional) return -1;
  if (filas.length) fail_('El elaborado ' + tstr_(t, filas[0], 'Producto') + ' (' + cod + ') no pertenece a ' + local + '.');
  fail_('El código ' + cod + ' no existe en los elaborados de ' + local + '.');
}

function buscarElaboradoNombre_(local, producto, unidad, excepto) {
  var t = table_(SH_ELABORADOS);
  var filas = tfind_(t, 'Local', local, true);
  var np = norm_(producto);
  var nu = norm_(unidad);
  for (var k = 0; k < filas.length; k++) {
    var i = filas[k];
    if (i === excepto) continue;
    if (norm_(tget_(t, i, 'Producto')) === np && norm_(tget_(t, i, 'Unidad')) === nu) return i;
  }
  return -1;
}

/* Códigos UMO-E001, UMO-E002… independientes de los del catálogo. */
function siguienteCodigoElab_(prefijo) {
  var req = req_();
  req.codigosElab = req.codigosElab || {};
  var pre = prefijo.replace(/[^A-Z0-9]/g, '');
  if (req.codigosElab[pre] === undefined) {
    var t = table_(SH_ELABORADOS);
    var re = new RegExp('^' + pre + '-?E(\\d+)$');
    var max = 0;
    var c = t.idx['Código'];
    for (var i = 0; i < t.rows.length; i++) {
      var m = str_(t.rows[i][c]).toUpperCase().match(re);
      if (m && Number(m[1]) > max) max = Number(m[1]);
    }
    req.codigosElab[pre] = max;
  }
  req.codigosElab[pre]++;
  var n = String(req.codigosElab[pre]);
  while (n.length < 3) n = '0' + n;
  return pre + '-E' + n;
}

/* Valida y normaliza los campos editables de un elaborado. parcial = true: sólo los presentes. */
function camposElaborado_(f, parcial, nombreRef) {
  var out = {};
  var nombre = str_(f.producto) || nombreRef || 'el elaborado';
  if (!parcial || f.producto !== undefined) {
    if (!str_(f.producto)) fail_('Falta el nombre del elaborado.');
    out['Producto'] = str_(f.producto).slice(0, 80);
  }
  if (!parcial || f.unidad !== undefined) {
    var u = normUnidad_(f.unidad);
    if (!u) fail_(str_(f.unidad) ? 'Unidad inválida en ' + nombre + ': ' + str_(f.unidad) + '.' : 'Falta la unidad de ' + nombre + '.');
    out['Unidad'] = u;
  }
  if (f.categoria !== undefined) out['Categoría'] = str_(f.categoria);
  if (f.observaciones !== undefined) out['Observaciones'] = str_(f.observaciones);
  if (f.activo !== undefined) {
    var a = siNo_(f.activo, 'SÍ');
    if (a === null) fail_('Activo inválido en ' + nombre + ': usá SÍ o NO.');
    out['Activo'] = a;
  }
  return out;
}

function altaElaborado_(loc, campos) {
  var t = table_(SH_ELABORADOS);
  var fila = {
    'Código': siguienteCodigoElab_(loc.prefijo), 'Producto': campos['Producto'], 'Local': loc.local,
    'Categoría': campos['Categoría'] || '', 'Unidad': campos['Unidad'],
    'Listo': '', 'Marcado': '', 'Crudo': '', 'Ultimo_Conteo': '',
    'Activo': campos['Activo'] || 'SÍ', 'Observaciones': campos['Observaciones'] || '', 'Actualizado': nowStr_()
  };
  return tadd_(t, fila);
}

/* Gerencia: alta o edición por Local + Código. No toca Listo/Marcado/Crudo. */
function saveElaborado_(b) {
  checkAdminKey_(b.admin_key);
  return withLock_(function () {
    asegurarHojasElaborados_();
    var loc = resolverLocal_(b.local);
    var t = table_(SH_ELABORADOS);
    var i;
    if (str_(b.codigo)) {
      i = buscarElaborado_(loc.local, b.codigo);
      var campos = camposElaborado_(b, true, tstr_(t, i, 'Producto'));
      var prod = campos['Producto'] !== undefined ? campos['Producto'] : tstr_(t, i, 'Producto');
      var uni = campos['Unidad'] !== undefined ? campos['Unidad'] : tstr_(t, i, 'Unidad');
      var otro = buscarElaboradoNombre_(loc.local, prod, uni, i);
      if (otro > -1) fail_('Ya existe ' + prod + ' (' + uni + ') en ' + loc.local + ' con el código ' + tstr_(t, otro, 'Código') + '.');
      Object.keys(campos).forEach(function (h) { tset_(t, i, h, campos[h]); });
      tset_(t, i, 'Actualizado', nowStr_());
    } else {
      var nuevos = camposElaborado_(b, false);
      var ya = buscarElaboradoNombre_(loc.local, nuevos['Producto'], nuevos['Unidad'], -1);
      if (ya > -1) fail_('Ya existe ' + nuevos['Producto'] + ' (' + nuevos['Unidad'] + ') en ' + loc.local + ' con el código ' + tstr_(t, ya, 'Código') + '.');
      i = altaElaborado_(loc, nuevos);
    }
    var obj = elaboradoObj_(t, i);
    log_('saveElaborado', obj.codigo, loc.local, true, obj.producto + ' (' + obj.unidad + ')');
    return { ok: true, producto: obj };
  });
}

/* Encargado (sin clave): agrega un elaborado al local. Si ya existe el mismo Producto + Unidad, lo devuelve
 * (y lo reactiva si estaba inactivo) en vez de duplicarlo. */
function agregarElaborado_(b) {
  return withLock_(function () {
    asegurarHojasElaborados_();
    var loc = resolverLocal_(b.local, { activo: true });
    var encargado = str_(b.encargado);
    if (!encargado) fail_('Falta el nombre de quien agrega el elaborado.');
    var campos = camposElaborado_({ producto: b.producto, unidad: b.unidad, categoria: b.categoria }, false);
    var t = table_(SH_ELABORADOS);
    var i = buscarElaboradoNombre_(loc.local, campos['Producto'], campos['Unidad'], -1);
    var existia = i > -1;
    if (existia) {
      if (!esSi_(tget_(t, i, 'Activo'))) { tset_(t, i, 'Activo', 'SÍ'); tset_(t, i, 'Actualizado', nowStr_()); }
    } else {
      i = altaElaborado_(loc, campos);
    }
    agregarEncargado_(loc.i, encargado);
    var obj = elaboradoObj_(t, i);
    log_('agregarElaborado', obj.codigo, loc.local, true, obj.producto + ' (' + obj.unidad + ') · ' + encargado + (existia ? ' · ya existía' : ''));
    return { ok: true, producto: obj, existia: existia };
  });
}

/* Cantidad de un estado: vacío = 0 (no quedó nada en ese estado); número >= 0. */
function cantidadEstado_(v, nombre, estado) {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return null;
  var n = num_(v);
  if (n === null) fail_('Cantidad inválida en ' + nombre + ' (' + estado + ').');
  if (n < 0) fail_('Cantidad inválida en ' + nombre + ' (' + estado + '): no puede ser negativa.');
  return n;
}

/* Conteo de elaborados: fija Listo/Marcado/Crudo de cada producto incluido y deja una fila por producto en CONTEO_ELABORADOS. */
function saveConteoElaborados_(b) {
  var id = checkId_(b.id_conteo, 'conteo de elaborados');
  return withLock_(function () {
    asegurarHojasElaborados_();
    var tCnt = table_(SH_CONTEO_ELAB);
    var ya = tfind_(tCnt, 'ID_Conteo', id);
    if (ya.length) return { ok: true, id_conteo: id, items: ya.length, duplicado: true };
    var loc = resolverLocal_(b.local, { activo: true });
    var encargado = str_(b.encargado);
    if (!encargado) fail_('Falta el nombre de quien hace el conteo.');
    if (!esArray_(b.items) || !b.items.length) fail_('El conteo no tiene productos.');
    var t = table_(SH_ELABORADOS);
    var vistos = {};
    var items = b.items.map(function (it) {
      it = it || {};
      if (!str_(it.codigo)) fail_('Hay un elaborado sin código en el conteo.');
      var i = buscarElaborado_(loc.local, it.codigo);
      var nombre = tstr_(t, i, 'Producto');
      if (!esSi_(tget_(t, i, 'Activo'))) fail_(nombre + ' está inactivo: pedile a gerencia que lo active.');
      if (vistos[i]) fail_(nombre + ' está repetido en el conteo.');
      vistos[i] = true;
      var vals = {};
      var alguno = false;
      ESTADOS_ELAB.forEach(function (e) {
        var n = cantidadEstado_(it[e[1]], nombre, e[0].toLowerCase());
        if (n !== null) alguno = true;
        vals[e[0]] = n === null ? 0 : n;
      });
      if (!alguno) fail_('Falta la cantidad de ' + nombre + ': cargá al menos un estado (puede ser 0).');
      return { i: i, nombre: nombre, vals: vals, observaciones: str_(it.observaciones) };
    });
    var now = nowStr_();
    items.forEach(function (x) {
      var total = 0;
      ESTADOS_ELAB.forEach(function (e) { total += x.vals[e[0]]; });
      tadd_(tCnt, {
        'Fecha_Hora': now, 'ID_Conteo': id, 'Local': loc.local, 'Encargado': encargado,
        'Código': tstr_(t, x.i, 'Código'), 'Producto': x.nombre, 'Unidad': tstr_(t, x.i, 'Unidad'),
        'Listo': x.vals['Listo'], 'Marcado': x.vals['Marcado'], 'Crudo': x.vals['Crudo'],
        'Total': round_(total), 'Observaciones': x.observaciones
      });
      ESTADOS_ELAB.forEach(function (e) { tset_(t, x.i, e[0], x.vals[e[0]]); });
      tset_(t, x.i, 'Ultimo_Conteo', now);
    });
    agregarEncargado_(loc.i, encargado);
    log_('saveConteoElaborados', id, loc.local, true, items.length + ' elaborados · ' + encargado);
    return { ok: true, id_conteo: id, items: items.length };
  });
}

/* Último conteo de elaborados del local: {id_conteo, fecha_hora, encargado, productos} o null. */
function ultimoConteoElaborados_(local) {
  if (!hojaExiste_(SH_CONTEO_ELAB)) return null;
  var t = table_(SH_CONTEO_ELAB);
  var cL = t.idx['Local'];
  var cId = t.idx['ID_Conteo'];
  var fila = -1;
  for (var i = t.rows.length - 1; i >= 0; i--) {
    if (str_(t.rows[i][cId]) && norm_(t.rows[i][cL]) === norm_(local)) { fila = i; break; }
  }
  if (fila < 0) return null;
  var id = tstr_(t, fila, 'ID_Conteo');
  return { id_conteo: id, fecha_hora: tstr_(t, fila, 'Fecha_Hora'), encargado: tstr_(t, fila, 'Encargado'), productos: tfind_(t, 'ID_Conteo', id).length };
}

function elaboradosActivos_(local) {
  if (!hojaExiste_(SH_ELABORADOS)) return 0;
  var t = table_(SH_ELABORADOS);
  return tfind_(t, 'Local', local, true).filter(function (i) { return tstr_(t, i, 'Producto') && esSi_(tget_(t, i, 'Activo')); }).length;
}

/* Operación de tipo ELABORADOS para getOperacion (confirmación por ID). null si no es un conteo de elaborados. */
function operacionElaborados_(id) {
  if (!hojaExiste_(SH_CONTEO_ELAB)) return null;
  var t = table_(SH_CONTEO_ELAB);
  var filas = tfind_(t, 'ID_Conteo', id);
  if (!filas.length) return null;
  return {
    ok: true, found: true, id: id, tipo: 'ELABORADOS',
    local: tstr_(t, filas[0], 'Local'), fecha_hora: tstr_(t, filas[0], 'Fecha_Hora'),
    encargado: tstr_(t, filas[0], 'Encargado'),
    items: filas.length,
    detalle: filas.map(function (i) {
      return {
        codigo: tstr_(t, i, 'Código'), producto: tstr_(t, i, 'Producto'), unidad: tstr_(t, i, 'Unidad'),
        listo: tnum_(t, i, 'Listo'), marcado: tnum_(t, i, 'Marcado'), crudo: tnum_(t, i, 'Crudo'), total: tnum_(t, i, 'Total')
      };
    })
  };
}
