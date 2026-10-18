/* Docks V3 · app del encargado (v3/index.html). Contrato: docs/v3/CONTRATO.md §4 y §5.
   Usa sólo window.Docks (core.js). Lógica pura expuesta en window.DocksEncargado para las pruebas. */
(function (global) {
  'use strict';

  var D = global.Docks;
  var doc = global.document;

  /* =====================================================================
     Lógica pura (sin DOM)
     ===================================================================== */

  var CAT_SUGERIDOS = '__sugeridos';
  var SIN_CATEGORIA = 'Sin categoría';
  var SIN_PROVEEDOR = 'Sin proveedor';
  var DIAS_CONTEO = 7;

  function esContable(unidad) {
    return D.CONTABLES.indexOf(String(unidad || '').toLowerCase()) > -1;
  }

  // Paso del stepper: 1 para contables, 0,5 para kg y litro, 100 para g y ml.
  function pasoCantidad(unidad) {
    var u = String(unidad || '').toLowerCase();
    if (u === 'kg' || u === 'litro') return 0.5;
    if (u === 'g' || u === 'ml') return 100;
    return 1;
  }

  function redondear(n) { return Math.round(n * 1000) / 1000; }

  // Número para mostrar dentro de un input: 1.5 -> "1,5" (sin separador de miles).
  function numTexto(n) {
    if (n === null || n === undefined || n === '' || !isFinite(Number(n))) return '';
    return String(redondear(Number(n))).replace('.', ',');
  }

  // Suma o resta un paso al texto de un input. Devuelve "" si queda en cero o menos.
  function sumarPaso(texto, unidad, signo) {
    var actual = D.num.parse(texto);
    if (actual === null || actual < 0) actual = 0;
    var n = redondear(actual + (signo < 0 ? -1 : 1) * pasoCantidad(unidad));
    return n > 0 ? numTexto(n) : '';
  }

  function sugeridoDe(p) {
    if (!p) return null;
    if (typeof p.sugerido === 'number' && isFinite(p.sugerido)) return p.sugerido;
    if (p.sugerido === null) return null;
    return D.sugerido(p).cantidad;
  }

  function categoriaDe(p) {
    var c = String((p && p.categoria) || '').trim();
    return c || SIN_CATEGORIA;
  }

  function categorias(lista) {
    var vistas = {};
    var out = [];
    (lista || []).forEach(function (p) {
      var c = categoriaDe(p);
      if (!vistas[c]) { vistas[c] = true; out.push(c); }
    });
    return out.sort(function (a, b) {
      if (a === SIN_CATEGORIA) return 1;
      if (b === SIN_CATEGORIA) return -1;
      return a.localeCompare(b, 'es');
    });
  }

  function ordenarCatalogo(lista) {
    return (lista || []).slice().sort(function (a, b) {
      var ca = categoriaDe(a);
      var cb = categoriaDe(b);
      if (ca !== cb) {
        if (ca === SIN_CATEGORIA) return 1;
        if (cb === SIN_CATEGORIA) return -1;
        return ca.localeCompare(cb, 'es');
      }
      return String(a.producto || '').localeCompare(String(b.producto || ''), 'es');
    });
  }

  // Filtro de catálogo: texto sin acentos (todas las palabras), categoría o "Sugeridos" (sugerido > 0).
  function filtrarProductos(lista, texto, categoria) {
    var tokens = D.norm(texto).split(' ').filter(Boolean);
    var cat = categoria ? D.norm(categoria) : '';
    return (lista || []).filter(function (p) {
      if (categoria === CAT_SUGERIDOS) {
        var s = sugeridoDe(p);
        if (!(s > 0)) return false;
      } else if (cat && D.norm(categoriaDe(p)) !== cat) {
        return false;
      }
      if (!tokens.length) return true;
      var hay = D.norm([p.producto, p.codigo, p.categoria, p.proveedor].join(' '));
      return tokens.every(function (t) { return hay.indexOf(t) > -1; });
    });
  }

  function contarSugeridos(lista) {
    return (lista || []).filter(function (p) { return sugeridoDe(p) > 0; }).length;
  }

  /* ---------- borradores por local ---------- */

  function claveBorrador(tipo, local) { return 'borrador:' + tipo + ':' + String(local || ''); }

  function borradorVacio(tipo) {
    if (tipo === 'pedido') return { items: {}, libres: [], prioridad: 'Normal', notas: '', id: null };
    if (tipo === 'conteo') return { items: {}, id: null };
    return { marcas: {}, extras: [], observaciones: '', id: null };
  }

  function leerBorrador(tipo, local) {
    var base = borradorVacio(tipo);
    var b = D.store.get(claveBorrador(tipo, local), null);
    if (!b || typeof b !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (b[k] === undefined || b[k] === null && k !== 'id') b[k] = base[k];
    });
    return b;
  }

  function guardarBorrador(tipo, local, b) { return D.store.set(claveBorrador(tipo, local), b); }
  function borrarBorrador(tipo, local) { D.store.del(claveBorrador(tipo, local)); }

  // El ID se genera una vez por intento y queda en el borrador: un reintento usa el mismo (idempotente).
  function asegurarId(b, prefijo) {
    if (!b.id) b.id = D.ids.nuevo(prefijo);
    return b.id;
  }

  // Firma del contenido (sin el ID) para saber si el borrador cambió mientras se enviaba.
  function firmaBorrador(tipo, b) {
    if (!b) return '';
    var copia = {};
    Object.keys(borradorVacio(tipo)).forEach(function (k) { if (k !== 'id') copia[k] = b[k]; });
    return JSON.stringify(copia, function (k, v) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        var o = {};
        Object.keys(v).sort().forEach(function (kk) { o[kk] = v[kk]; });
        return o;
      }
      return v;
    });
  }

  /* ---------- pedido ---------- */

  function indexarCatalogo(catalogo) {
    var m = {};
    (catalogo || []).forEach(function (p) { if (p && p.codigo) m[p.codigo] = p; });
    return m;
  }

  // Líneas del pedido: productos del catálogo con cantidad > 0 (en orden de catálogo) y líneas libres válidas.
  function armarItemsPedido(b, catalogo) {
    b = b || borradorVacio('pedido');
    var items = b.items || {};
    var out = [];
    (catalogo || []).forEach(function (p) {
      var q = D.num.parse(items[p.codigo]);
      if (q !== null && q > 0) {
        out.push({
          codigo: p.codigo, producto: p.producto, unidad: p.unidad, categoria: p.categoria || '',
          proveedor: String(p.proveedor || '').trim(), precio: p.precio, cantidad: q
        });
      }
    });
    (b.libres || []).forEach(function (l) {
      var nombre = String((l && l.producto) || '').trim();
      var q = D.num.parse(l && l.cantidad);
      if (nombre && l.unidad && q !== null && q > 0) {
        out.push({ libre: true, key: l.key, producto: nombre, unidad: l.unidad, proveedor: '', cantidad: q });
      }
    });
    return out;
  }

  // Códigos con cantidad en el borrador que ya no están en el catálogo del local (no se envían).
  function fueraDeCatalogo(b, catalogo) {
    var idx = indexarCatalogo(catalogo);
    return Object.keys((b && b.items) || {}).filter(function (cod) {
      var q = D.num.parse(b.items[cod]);
      return q !== null && q > 0 && !idx[cod];
    });
  }

  function payloadPedido(b, items, sesion) {
    return {
      action: 'savePedido',
      id_pedido: b.id,
      local: sesion.local,
      encargado: sesion.encargado,
      prioridad: b.prioridad === 'Urgente' ? 'Urgente' : 'Normal',
      notas: String(b.notas || '').trim(),
      items: items.map(function (it) {
        return it.libre
          ? { producto: it.producto, unidad: it.unidad, cantidad: it.cantidad }
          : { codigo: it.codigo, cantidad: it.cantidad };
      })
    };
  }

  // Agrupa por proveedor (alfabético); líneas libres y sin proveedor van al final en "Sin proveedor".
  function agruparPorProveedor(items) {
    var mapa = {};
    var claves = [];
    (items || []).forEach(function (it) {
      var prov = it.libre ? '' : String(it.proveedor || '').trim();
      var k = D.norm(prov);
      if (!mapa[k]) { mapa[k] = { proveedor: prov || SIN_PROVEEDOR, sin_proveedor: !prov, items: [] }; claves.push(k); }
      mapa[k].items.push(it);
    });
    return claves.map(function (k) { return mapa[k]; }).sort(function (a, b) {
      if (a.sin_proveedor !== b.sin_proveedor) return a.sin_proveedor ? 1 : -1;
      return a.proveedor.localeCompare(b.proveedor, 'es');
    });
  }

  /* ---------- conteo ---------- */

  // Vacío = no contado (no se envía). Cero = valor válido. Negativos o texto inválido no se envían.
  function itemsConteo(b, catalogo) {
    var items = (b && b.items) || {};
    var codigos = catalogo ? (catalogo || []).map(function (p) { return p.codigo; }) : Object.keys(items);
    var out = [];
    codigos.forEach(function (cod) {
      if (!Object.prototype.hasOwnProperty.call(items, cod)) return;
      var q = D.num.parse(items[cod]);
      if (q !== null && q >= 0) out.push({ codigo: cod, cantidad: q });
    });
    return out;
  }

  function conteoInvalidos(b) {
    var items = (b && b.items) || {};
    return Object.keys(items).filter(function (cod) {
      var t = String(items[cod] == null ? '' : items[cod]).trim();
      if (!t) return false;
      var q = D.num.parse(t);
      return q === null || q < 0;
    });
  }

  /* ---------- recepción ---------- */

  function marcaDe(estado, linea) {
    var m = estado && estado.marcas && estado.marcas[linea.id_linea];
    return {
      llego: !!(m && m.llego),
      cantidad: m && m.cantidad !== undefined && m.cantidad !== null ? String(m.cantidad) : numTexto(linea.cantidad)
    };
  }

  // Sólo líneas tildadas; la cantidad es la editada (o la pedida si no se tocó). Extras con cantidad > 0.
  function itemsRecepcion(estado) {
    estado = estado || {};
    var items = [];
    var errores = [];
    (estado.ordenes || []).forEach(function (o) {
      (o.lineas || []).forEach(function (l) {
        var m = marcaDe(estado, l);
        if (!m.llego) return;
        var q = D.num.parse(m.cantidad);
        if (q === null || q < 0) errores.push(l.id_linea);
        else items.push({ id_linea: l.id_linea, cantidad_recibida: q });
      });
    });
    var extras = [];
    (estado.extras || []).forEach(function (e) {
      var q = D.num.parse(e && e.cantidad);
      if (e && e.codigo && q !== null && q > 0) extras.push({ codigo: e.codigo, cantidad: q });
    });
    return { items: items, extras: extras, errores: errores };
  }

  // Faltante de una línea: pedida − recibida (0 si llegó todo o de más, null si la cantidad no es válida).
  function faltante(pedida, recibidaTexto) {
    var q = D.num.parse(recibidaTexto);
    var p = D.num.parse(pedida);
    if (q === null || p === null) return null;
    var f = redondear(p - q);
    return f > 0 ? f : 0;
  }

  function llegoTodo(estado, orden) {
    estado.marcas = estado.marcas || {};
    (orden.lineas || []).forEach(function (l) {
      estado.marcas[l.id_linea] = { llego: true, cantidad: numTexto(l.cantidad) };
    });
    return estado;
  }

  function resumenRecepcion(estado) {
    var r = itemsRecepcion(estado);
    var pedida = {};
    (estado.ordenes || []).forEach(function (o) {
      (o.lineas || []).forEach(function (l) { pedida[l.id_linea] = D.num.parse(l.cantidad); });
    });
    var entregadas = 0;
    var incompletas = 0;
    r.items.forEach(function (it) {
      var p = pedida[it.id_linea];
      if (p !== null && p !== undefined && it.cantidad_recibida + 1e-9 < p) incompletas++;
      else entregadas++;
    });
    return { entregadas: entregadas, incompletas: incompletas, extras: r.extras.length };
  }

  function idCorto(id) {
    var s = String(id || '');
    var partes = s.split('-');
    return partes.length >= 4 ? partes[0] + ' ' + partes[partes.length - 1] : s;
  }

  /* ---------- hoy ---------- */

  function cantidadPorRecibir(hoy) {
    var v = hoy && hoy.por_recibir;
    if (Array.isArray(v)) return v.length;
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function diasDesdeConteo(hoy) {
    var u = hoy && hoy.ultimo_conteo;
    if (!u || !u.fecha_hora) return null;
    return D.haceDias(u.fecha_hora);
  }

  function textoHaceDias(d) {
    if (d === null || d === undefined) return 'Nunca';
    if (d <= 0) return 'Hoy';
    if (d === 1) return 'Ayer';
    return 'Hace ' + d + ' días';
  }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  // La acción pendiente más importante: contar (sin conteo en 7 días) > pedir > recibir > al día.
  function accionPrincipal(hoy) {
    hoy = hoy || {};
    var d = diasDesdeConteo(hoy);
    if (d === null || d >= DIAS_CONTEO) {
      return {
        clave: 'contar', texto: 'Contar stock', hash: '#contar',
        motivo: d === null ? 'Sin conteo no hay sugerido para pedir.' : 'El último conteo es de hace ' + d + ' días.'
      };
    }
    if (!hoy.pedido_semana) {
      return { clave: 'pedir', texto: 'Hacer el pedido', hash: '#pedir', motivo: 'Falta enviar el pedido de esta semana.' };
    }
    var n = cantidadPorRecibir(hoy);
    if (n > 0) {
      return { clave: 'recibir', texto: 'Recibir mercadería', hash: '#recibir', motivo: 'Hay ' + plural(n, 'orden', 'órdenes') + ' por recibir.' };
    }
    return { clave: 'al_dia', texto: 'Todo al día', hash: null, motivo: 'Pedido enviado, stock contado y nada por recibir.' };
  }

  /* ---------- confirmación de escrituras ---------- */

  function contar(x) {
    if (Array.isArray(x)) return x.length;
    if (x === null || x === undefined || x === '' || typeof x === 'boolean') return null;
    var n = Number(x);
    return isFinite(n) ? n : null;
  }

  function validarPedidoConfirmado(r, esperado) {
    if (!r || r.found === false || !r.pedido) return 'La planilla no tiene el pedido ' + esperado.id + '.';
    if (r.pedido.id_pedido && r.pedido.id_pedido !== esperado.id) return 'La planilla devolvió otro pedido (' + r.pedido.id_pedido + ').';
    if (D.norm(r.pedido.local) !== D.norm(esperado.local)) {
      return 'El pedido ' + esperado.id + ' figura en otro local (' + (r.pedido.local || 'sin local') + ').';
    }
    var n = contar(r.lineas);
    if (n === null) n = contar(r.pedido.lineas);
    if (n !== esperado.lineas) {
      return 'La planilla ya tiene el pedido ' + esperado.id + ' con ' + plural(n || 0, 'producto', 'productos') +
        ' y este borrador tiene ' + esperado.lineas + '. No se envió de nuevo.';
    }
    return null;
  }

  function validarOperacionConfirmada(r, esperado) {
    if (!r || r.found === false) return 'La planilla no tiene la operación ' + esperado.id + '.';
    if (r.tipo && esperado.tipo && String(r.tipo).toUpperCase() !== esperado.tipo) return 'El número ' + esperado.id + ' corresponde a otra operación.';
    if (r.local && D.norm(r.local) !== D.norm(esperado.local)) return 'La operación ' + esperado.id + ' figura en otro local (' + r.local + ').';
    if (esperado.items !== null && esperado.items !== undefined) {
      var n = contar(r.items);
      if (n !== null && n !== esperado.items) {
        return 'La planilla ya tiene ' + esperado.id + ' con ' + plural(n, 'producto', 'productos') +
          ' y acá hay ' + esperado.items + '. No se guardó de nuevo.';
      }
    }
    return null;
  }

  // Respuesta legible con ID: comprobar que es el nuestro y, si trae cantidad, que coincida.
  function validarRespuesta(resp, op) {
    if (resp[op.campoId] !== op.id) return 'La planilla respondió con otro número (' + resp[op.campoId] + ').';
    var esperado = op.esperado.lineas !== undefined ? op.esperado.lineas : op.esperado.items;
    if (esperado === null || esperado === undefined) return null;
    var n = contar(op.campoCantidad ? resp[op.campoCantidad] : null);
    if (n !== null && n !== esperado) {
      return 'La planilla ya tiene ' + op.id + ' con ' + plural(n, 'producto', 'productos') +
        ' y acá hay ' + esperado + '. No se guardó de nuevo.';
    }
    return null;
  }

  var MSG_SIN_CONFIRMAR = 'No pudimos confirmar que se guardó. Tu carga sigue acá: revisá la conexión y tocá de nuevo. No se duplica.';

  // Escritura con ID del cliente: POST; si la respuesta no trae el ID, se confirma leyendo ese ID.
  function guardarOperacion(op) {
    var envio;
    try { envio = D.api.post(op.payload); } catch (e) { envio = Promise.reject(e); }
    return Promise.resolve(envio).then(function (resp) {
      if (resp && resp[op.campoId]) {
        var err = validarRespuesta(resp, op);
        return err ? { ok: false, error: err, conflicto: true } : { ok: true, resp: resp, via: 'respuesta' };
      }
      return D.api.confirm(op.accionConfirmar, op.id).then(function (c) {
        if (!c) return { ok: false, error: MSG_SIN_CONFIRMAR };
        var e2 = op.validar(c, op.esperado);
        return e2 ? { ok: false, error: e2, conflicto: true } : { ok: true, resp: c, via: 'confirmacion' };
      });
    }).catch(function (e) {
      var msg = (e && e.message) || 'No se pudo guardar.';
      if (e && e.server) msg = 'La planilla no lo aceptó: ' + msg;
      return { ok: false, error: msg, servidor: !!(e && e.server) };
    });
  }

  // Al terminar bien: si el borrador no cambió mientras se enviaba, se borra; si cambió, se conserva sin ID.
  function cerrarBorrador(tipo, local, firmaEnviada) {
    var actual = leerBorrador(tipo, local);
    if (firmaBorrador(tipo, actual) === firmaEnviada) { borrarBorrador(tipo, local); return false; }
    actual.id = null;
    guardarBorrador(tipo, local, actual);
    return true;
  }

  function enviarPedido(sesion, catalogo) {
    var b = leerBorrador('pedido', sesion.local);
    var items = armarItemsPedido(b, catalogo);
    if (!items.length) return Promise.resolve({ ok: false, error: 'El pedido está vacío. Agregá al menos un producto.' });
    var id = asegurarId(b, 'PED');
    guardarBorrador('pedido', sesion.local, b);
    var firma = firmaBorrador('pedido', b);
    return guardarOperacion({
      payload: payloadPedido(b, items, sesion),
      id: id, campoId: 'id_pedido', campoCantidad: 'lineas', accionConfirmar: 'getPedido',
      esperado: { id: id, local: sesion.local, lineas: items.length },
      validar: validarPedidoConfirmado
    }).then(function (r) {
      r.id = id;
      r.lineas = items.length;
      if (r.ok) r.borradorConservado = cerrarBorrador('pedido', sesion.local, firma);
      return r;
    });
  }

  function enviarConteo(sesion, catalogo) {
    var b = leerBorrador('conteo', sesion.local);
    if (conteoInvalidos(b).length) return Promise.resolve({ ok: false, error: 'Hay cantidades que no son números. Corregilas antes de guardar.' });
    var items = itemsConteo(b, catalogo);
    if (!items.length) return Promise.resolve({ ok: false, error: 'No contaste ningún producto.' });
    var id = asegurarId(b, 'CNT');
    guardarBorrador('conteo', sesion.local, b);
    var firma = firmaBorrador('conteo', b);
    return guardarOperacion({
      payload: { action: 'saveConteo', id_operacion: id, local: sesion.local, encargado: sesion.encargado, items: items },
      id: id, campoId: 'id_operacion', campoCantidad: 'items', accionConfirmar: 'getOperacion',
      esperado: { id: id, local: sesion.local, tipo: 'CONTEO', items: items.length },
      validar: validarOperacionConfirmada
    }).then(function (r) {
      r.id = id;
      r.items = items.length;
      if (r.ok) r.borradorConservado = cerrarBorrador('conteo', sesion.local, firma);
      return r;
    });
  }

  function enviarRecepcion(sesion, ordenes) {
    var b = leerBorrador('recepcion', sesion.local);
    var estado = { ordenes: ordenes, marcas: b.marcas, extras: b.extras };
    var r = itemsRecepcion(estado);
    if (r.errores.length) return Promise.resolve({ ok: false, error: 'Hay cantidades que no son números. Corregilas antes de guardar.' });
    if (!r.items.length && !r.extras.length) return Promise.resolve({ ok: false, error: 'Tildá lo que llegó antes de guardar.' });
    var id = asegurarId(b, 'REC');
    guardarBorrador('recepcion', sesion.local, b);
    var firma = firmaBorrador('recepcion', b);
    var local = resumenRecepcion(estado);
    var payload = {
      action: 'saveRecepcion', id_operacion: id, local: sesion.local, encargado: sesion.encargado,
      items: r.items, extras: r.extras, observaciones: String(b.observaciones || '').trim()
    };
    return guardarOperacion({
      payload: payload,
      id: id, campoId: 'id_operacion', accionConfirmar: 'getOperacion',
      esperado: { id: id, local: sesion.local, tipo: 'RECEPCION', items: null },
      validar: validarOperacionConfirmada
    }).then(function (res) {
      res.id = id;
      if (res.ok) {
        var x = res.resp || {};
        res.resumen = {
          entregadas: contar(x.entregadas) !== null ? contar(x.entregadas) : local.entregadas,
          incompletas: contar(x.incompletas) !== null ? contar(x.incompletas) : local.incompletas,
          extras: contar(x.extras) !== null ? contar(x.extras) : local.extras
        };
        res.borradorConservado = cerrarBorrador('recepcion', sesion.local, firma);
      }
      return res;
    });
  }

  /* ---------- sesión ---------- */

  function esActivo(v) {
    if (v === true) return true;
    if (v === false || v === null || v === undefined) return false;
    var s = D.norm(v);
    return s === 'si' || s === 'true' || s === '1' || s === 'activo';
  }

  function localesActivos(boot) {
    return ((boot && boot.locales) || []).filter(function (l) { return l && l.local && esActivo(l.activo); });
  }

  function limpiarNombre(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40); }

  function encargadosDe(boot, local, extra) {
    var l = ((boot && boot.locales) || []).filter(function (x) { return x && D.norm(x.local) === D.norm(local); })[0];
    var lista = l ? l.encargados : [];
    if (typeof lista === 'string') lista = lista.split(/[,;\n]/);
    var vistos = {};
    var out = [];
    (lista || []).concat(extra || []).forEach(function (n) {
      var nombre = limpiarNombre(n);
      var k = D.norm(nombre);
      if (nombre && !vistos[k]) { vistos[k] = true; out.push(nombre); }
    });
    return out;
  }

  function ahoraTexto() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* =====================================================================
     Interfaz
     ===================================================================== */

  var esc = D.esc;
  var fmt = D.num.fmt;
  var CAT_TTL = 10 * 60 * 1000;

  var S = {
    sesion: null,           // {local, encargado}
    login: null,            // {paso:'local'|'encargado', local, aviso}
    boot: null, bootCargando: false, bootError: null,
    hoy: null, hoyLocal: null, hoyCargando: false, hoyError: null,
    cat: null, catLocal: null, catTs: 0, catCargando: false, catError: null,
    rec: null, recLocal: null, recCargando: false, recError: null,
    filtro: { pedir: { texto: '', cat: '' }, contar: { texto: '', cat: '' } },
    enviando: false,
    error: { pedir: null, contar: null, recibir: null },
    conflicto: { pedir: false, contar: false, recibir: false },
    exito: null,
    extraSel: null,
    rutaPrev: ''
  };

  function byId(id) { return doc.getElementById(id); }

  var ICON = {
    buscar: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    pedido: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/></svg>',
    conteo: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11l2 2 4-4"/><path d="M9 17h6"/></svg>',
    recibir: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    ok: '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    volver: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M15 6l-6 6 6 6"/></svg>',
    mas: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>'
  };

  /* ---------- ruteo ---------- */

  var TABS = ['hoy', 'pedir', 'contar', 'recibir'];

  function ruta() {
    var h = String(global.location.hash || '').replace(/^#\/?/, '');
    var partes = h.split('/');
    var tab = TABS.indexOf(partes[0]) > -1 ? partes[0] : 'hoy';
    return { tab: tab, sub: partes[1] || '' };
  }

  function ir(hash) {
    if (global.location.hash === hash) render();
    else global.location.hash = hash;
  }

  function onHashChange() {
    var r = ruta();
    if (r.sub !== 'listo') S.exito = null;
    var clave = r.tab + '/' + r.sub;
    var cambioTab = S.rutaPrev.split('/')[0] !== r.tab;
    S.rutaPrev = clave;
    if (cambioTab) {
      S.error.pedir = S.error.contar = S.error.recibir = null;
      S.conflicto.pedir = S.conflicto.contar = S.conflicto.recibir = false;
    }
    entrarA(r.tab);
    render();
    try { global.scrollTo(0, 0); } catch (_e) { /* sin scroll */ }
    enfocarTitulo();
  }

  function enfocarTitulo() {
    var t = doc.querySelector('#app .screen-title');
    if (t && t.focus) { try { t.focus({ preventScroll: true }); } catch (_e) { t.focus(); } }
  }

  // Carga lo que necesita cada pestaña al entrar.
  function entrarA(tab) {
    if (!sesionLista()) return;
    if (tab === 'hoy') cargarHoy();
    if (tab === 'pedir' || tab === 'contar') cargarCatalogo(false);
    if (tab === 'recibir') cargarPorRecibir();
  }

  /* ---------- carga de datos ---------- */

  function sesionLista() { return !!(S.sesion && S.sesion.local && S.sesion.encargado); }

  function cargarBoot() {
    if (!D.api.configured() || S.bootCargando) return;
    S.bootCargando = true; S.bootError = null;
    D.api.get('getBootstrap').then(function (r) {
      S.boot = r; S.bootCargando = false;
      if (S.sesion && S.sesion.local && localesActivos(r).length &&
          !localesActivos(r).some(function (l) { return D.norm(l.local) === D.norm(S.sesion.local); })) {
        S.login = { paso: 'local', aviso: 'El local ' + S.sesion.local + ' no está activo. Elegí otro.' };
      }
      if (!sesionLista() || S.login) render(); else actualizarHeader();
    }, function (e) {
      S.bootCargando = false; S.bootError = e.message || 'No se pudo conectar con la planilla.';
      if (!sesionLista() || S.login) render();
    });
  }

  function cargarHoy() {
    if (!sesionLista()) return;
    var local = S.sesion.local;
    if (S.hoyLocal !== local) { S.hoy = null; S.hoyLocal = local; }
    S.hoyCargando = true; S.hoyError = null;
    if (ruta().tab === 'hoy' && !S.hoy) render();
    D.api.get('getHoy', { local: local }).then(function (r) {
      if (!S.sesion || S.sesion.local !== local) return;
      S.hoy = r; S.hoyCargando = false;
      if (ruta().tab === 'hoy' && !S.login) render(); else { actualizarNav(); actualizarHeader(); }
    }, function (e) {
      if (!S.sesion || S.sesion.local !== local) return;
      S.hoyCargando = false; S.hoyError = e.message || 'No se pudo conectar con la planilla.';
      if (ruta().tab === 'hoy' && !S.login) render();
    });
  }

  function cargarCatalogo(forzar) {
    if (!sesionLista()) return;
    var local = S.sesion.local;
    if (S.catLocal !== local) { S.cat = null; S.catLocal = local; S.catTs = 0; }
    if (S.catCargando) return;
    if (!forzar && S.cat && Date.now() - S.catTs < CAT_TTL) return;
    var habia = !!S.cat;
    S.catCargando = true; S.catError = null;
    if (!habia && pantallaUsaCatalogo()) render();
    D.api.get('getCatalogo', { local: local }).then(function (r) {
      if (!S.sesion || S.sesion.local !== local) return;
      S.cat = ordenarCatalogo(r.productos || []); S.catTs = Date.now(); S.catCargando = false;
      if (dialogoExtraAbierto()) pintarExtraResultados();
      if (!pantallaUsaCatalogo()) return;
      if (habia) repintarListas(); else render();
    }, function (e) {
      if (!S.sesion || S.sesion.local !== local) return;
      S.catCargando = false;
      if (habia) { D.toast('No se pudo actualizar el catálogo. Seguís con el que tenías.', 'info'); return; }
      S.catError = e.message || 'No se pudo cargar el catálogo.';
      if (dialogoExtraAbierto()) pintarExtraResultados();
      if (pantallaUsaCatalogo()) render();
    });
  }

  function dialogoExtraAbierto() {
    var d = byId('dlg-extra');
    return !!(d && (d.open || d.hasAttribute('open')));
  }

  function pantallaUsaCatalogo() {
    var t = ruta().tab;
    return !S.login && (t === 'pedir' || t === 'contar');
  }

  function cargarPorRecibir() {
    if (!sesionLista()) return;
    var local = S.sesion.local;
    if (S.recLocal !== local) { S.rec = null; S.recLocal = local; }
    S.recCargando = true; S.recError = null;
    if (ruta().tab === 'recibir' && !S.rec) render();
    D.api.get('getPorRecibir', { local: local }).then(function (r) {
      if (!S.sesion || S.sesion.local !== local) return;
      var habia = !!S.rec;
      S.rec = r.ordenes || []; S.recCargando = false;
      if (S.hoy && S.hoyLocal === local) S.hoy.por_recibir = S.rec.length;
      actualizarNav();
      var rt = ruta();
      if (rt.tab === 'recibir' && rt.sub !== 'listo' && !S.login && !(habia && S.enviando)) render();
    }, function (e) {
      if (!S.sesion || S.sesion.local !== local) return;
      S.recCargando = false; S.recError = e.message || 'No se pudo conectar con la planilla.';
      if (ruta().tab === 'recibir' && !S.login) render();
    });
  }

  /* ---------- cabecera, navegación y barra ---------- */

  function semanaLabel() {
    var s = (S.hoy && S.hoy.semana && S.hoy.semana.label) || (S.boot && S.boot.semana && S.boot.semana.label);
    return s || D.semana.de().label;
  }

  function actualizarHeader() {
    var btn = byId('hdr-sesion');
    var marca = byId('hdr-marca');
    var sem = byId('hdr-semana');
    var conSesion = sesionLista() && D.api.configured();
    btn.hidden = !conSesion;
    marca.hidden = conSesion;
    if (conSesion) {
      byId('hdr-txt').innerHTML = '<strong>' + esc(S.sesion.local) + '</strong> <span class="hdr-enc">· ' + esc(S.sesion.encargado) + '</span>';
    }
    var partes = semanaLabel().split(' · ');
    sem.innerHTML = '<strong>' + esc(partes[0]) + '</strong>' + (partes[1] ? '<span>' + esc(partes[1]) + '</span>' : '');
  }

  function porRecibirN() {
    if (S.rec && S.recLocal === (S.sesion && S.sesion.local)) return S.rec.length;
    return S.hoy && S.hoyLocal === (S.sesion && S.sesion.local) ? cantidadPorRecibir(S.hoy) : 0;
  }

  function actualizarNav(r) {
    r = r || ruta();
    var nav = byId('nav');
    var visible = sesionLista() && !S.login && D.api.configured();
    nav.hidden = !visible;
    doc.body.classList.toggle('sin-nav', !visible);
    var links = nav.querySelectorAll('a[data-tab]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-tab') === r.tab) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
    var n = porRecibirN();
    var badge = byId('nav-badge');
    badge.hidden = !(n > 0);
    badge.textContent = n > 9 ? '9+' : String(n);
    byId('nav-badge-sr').textContent = n > 0 ? ' (' + plural(n, 'orden', 'órdenes') + ')' : '';
  }

  function setBarra(html) {
    var barra = byId('barra');
    if (html) {
      barra.innerHTML = '<div class="barra-in">' + html + '</div>';
      barra.hidden = false;
    } else {
      barra.innerHTML = '';
      barra.hidden = true;
    }
    doc.body.classList.toggle('con-barra', !!html);
  }

  /* ---------- piezas comunes ---------- */

  function tplCargando(texto) {
    return '<div class="cargando" role="status"><span class="spinner" aria-hidden="true"></span> ' + esc(texto || 'Cargando…') + '</div>';
  }

  function tplError(msg, act) {
    return '<div class="banner banner-bad" role="alert"><div>' +
      '<strong>No se pudo cargar.</strong><p>' + esc(msg) + '</p>' +
      '<button type="button" class="btn" data-act="' + esc(act) + '">Reintentar</button></div></div>';
  }

  function tplErrorEnvio(tipo, actNuevo, textoNuevo) {
    var msg = S.error[tipo];
    if (!msg) return '<div class="envio-error" id="error-' + tipo + '" role="alert"></div>';
    var extra = S.conflicto[tipo] && actNuevo
      ? '<p class="small">Revisá Hoy primero. Si es una carga distinta, mandala con un número nuevo.</p><button type="button" class="btn btn-sm" data-act="' + actNuevo + '">' + esc(textoNuevo) + '</button>'
      : '';
    return '<div class="envio-error" id="error-' + tipo + '" role="alert"><div class="banner banner-bad"><div><strong>No se guardó.</strong><p>' +
      esc(msg) + '</p>' + extra + '</div></div></div>';
  }

  function tplBtnEnviar(act, texto, textoEnviando, deshabilitado) {
    if (S.enviando) {
      return '<button type="button" class="btn btn-primary btn-lg btn-block" disabled aria-busy="true"><span class="spinner spinner-claro" aria-hidden="true"></span> ' + esc(textoEnviando) + '</button>';
    }
    return '<button type="button" class="btn btn-primary btn-lg btn-block" data-act="' + act + '"' + (deshabilitado ? ' disabled' : '') + '>' + esc(texto) + '</button>';
  }

  function tplToolbar(pantalla, conSugeridos) {
    var f = S.filtro[pantalla];
    var cats = categorias(S.cat);
    var chips = '<button type="button" class="chip" data-act="cat" data-cat="" aria-pressed="' + (!f.cat) + '">Todas</button>';
    if (conSugeridos) {
      var ns = contarSugeridos(S.cat);
      chips += '<button type="button" class="chip chip-sugeridos" data-act="cat" data-cat="' + CAT_SUGERIDOS + '" aria-pressed="' + (f.cat === CAT_SUGERIDOS) + '">Sugeridos <span class="chip-n">' + ns + '</span></button>';
    }
    cats.forEach(function (c) {
      chips += '<button type="button" class="chip" data-act="cat" data-cat="' + esc(c) + '" aria-pressed="' + (f.cat === c) + '">' + esc(c) + '</button>';
    });
    return '<div class="toolbar">' +
      '<div class="search">' + ICON.buscar +
      '<label class="sr-only" for="q-' + pantalla + '">Buscar producto</label>' +
      '<input id="q-' + pantalla + '" class="input" type="search" data-act="buscar" data-pantalla="' + pantalla + '" placeholder="Buscar producto" autocomplete="off" enterkeyhint="search" value="' + esc(f.texto) + '"></div>' +
      '<div class="chips" role="group" aria-label="Categorías">' + chips + '</div>' +
      '</div>' +
      '<p class="resultados small muted" id="res-' + pantalla + '" aria-live="polite"></p>';
  }

  function tplVacioFiltro(pantalla) {
    var f = S.filtro[pantalla];
    var txt = f.cat === CAT_SUGERIDOS ? 'No hay productos con sugerido. Para tenerlo, cada producto necesita par y un conteo.'
      : 'No encontramos productos' + (f.texto ? ' con “' + f.texto + '”' : '') + (f.cat ? ' en ' + f.cat : '') + '.';
    var btn = (f.cat || f.texto) ? '<button type="button" class="btn" data-act="limpiar-filtro" data-pantalla="' + pantalla + '">Ver todos los productos</button>' : '';
    return '<div class="empty"><p>' + esc(txt) + '</p>' + btn + '</div>';
  }

  function tplCatalogoVacio() {
    return '<div class="empty"><p><strong>Todavía no hay productos cargados para ' + esc(S.sesion.local) + '.</strong></p>' +
      '<p>Avisale a gerencia para que cargue el catálogo.</p></div>';
  }

  function metaStock(p) {
    var partes = [];
    partes.push(p.stock_actual === null || p.stock_actual === undefined || p.stock_actual === '' ? 'Sin contar' : 'Stock: ' + fmt(p.stock_actual, p.unidad));
    if (p.par !== null && p.par !== undefined && p.par !== '') partes.push('Par ' + fmt(p.par));
    var ab = D.num.parse(p.pedido_abierto);
    if (ab > 0) partes.push('Ya pedido ' + fmt(ab, p.unidad));
    return partes.join(' · ');
  }

  /* ---------- pantalla: sin backend ---------- */

  function renderSinBackend(app) {
    app.innerHTML = '<section class="screen">' +
      '<h1 class="screen-title" tabindex="-1">Falta conectar la app</h1>' +
      '<div class="banner banner-warn" role="alert"><div>' +
      '<strong>Todavía no está configurada la dirección de la planilla.</strong>' +
      '<p>Sin eso no se puede cargar ni enviar nada. Avisale a gerencia.</p>' +
      '<p class="small">Para gerencia: completar <code>API_URL</code> en <code>config.js</code> o abrir esta página con <code>?api=</code> y la URL del backend.</p>' +
      '</div></div></section>';
  }

  /* ---------- pantalla: inicio de sesión ---------- */

  function renderLogin(app) {
    var paso = (S.login && S.login.paso) || (S.sesion && S.sesion.local ? 'encargado' : 'local');
    var local = (S.login && S.login.local) || (S.sesion && S.sesion.local) || '';
    if (paso === 'encargado' && !local) paso = 'local';
    var cancelar = sesionLista() ? '<button type="button" class="btn btn-ghost" data-act="cancelar-login">Cancelar</button>' : '';

    if (paso === 'local') {
      var cuerpo;
      if (!S.boot) {
        cuerpo = S.bootError ? tplError(S.bootError, 'reintentar-boot') : tplCargando('Buscando los locales…');
        if (!S.boot && !S.bootCargando && !S.bootError) cargarBoot();
      } else {
        var locs = localesActivos(S.boot);
        cuerpo = locs.length
          ? '<div class="local-grid">' + locs.map(function (l) {
            var sel = S.sesion && D.norm(S.sesion.local) === D.norm(l.local);
            return '<button type="button" class="btn local-btn' + (sel ? ' is-sel' : '') + '" data-act="elegir-local" data-local="' + esc(l.local) + '"' + (sel ? ' aria-current="true"' : '') + '>' + esc(l.local) + '</button>';
          }).join('') + '</div>'
          : '<div class="empty"><p>No hay locales activos en la planilla. Avisale a gerencia.</p></div>';
      }
      app.innerHTML = '<section class="screen login">' +
        '<h1 class="screen-title" tabindex="-1">¿En qué local estás?</h1>' +
        (S.login && S.login.aviso ? '<div class="banner banner-warn" role="alert">' + esc(S.login.aviso) + '</div>' : '') +
        '<p class="muted">Lo elegís una vez. Después lo cambiás tocando el nombre arriba.</p>' +
        cuerpo + '<div class="login-pie">' + cancelar + '</div></section>';
      return;
    }

    var extra = D.store.get('encargados:' + local, []);
    var nombres = encargadosDe(S.boot, local, extra);
    var actual = S.sesion && D.norm(S.sesion.local) === D.norm(local) ? S.sesion.encargado : '';
    var chips = nombres.length
      ? '<div class="enc-chips" role="group" aria-label="Encargados de ' + esc(local) + '">' + nombres.map(function (n) {
        var sel = D.norm(n) === D.norm(actual);
        return '<button type="button" class="chip enc-chip" data-act="elegir-enc" data-nombre="' + esc(n) + '" aria-pressed="' + sel + '">' + esc(n) + '</button>';
      }).join('') + '</div>'
      : '';
    app.innerHTML = '<section class="screen login">' +
      '<h1 class="screen-title" tabindex="-1">¿Quién sos?</h1>' +
      '<p class="login-local">Local: <strong>' + esc(local) + '</strong> <button type="button" class="btn btn-ghost btn-sm" data-act="volver-local">Cambiar local</button></p>' +
      (!S.boot && S.bootCargando ? tplCargando('Buscando los encargados…') : '') +
      chips +
      '<form class="otro-nombre" data-form="otro-nombre" novalidate>' +
      '<div class="field"><label for="enc-otro">' + (nombres.length ? 'Otro nombre' : 'Tu nombre') + '</label>' +
      '<input id="enc-otro" class="input" type="text" maxlength="40" autocomplete="name" autocapitalize="words" enterkeyhint="go"></div>' +
      '<p class="field-error" id="enc-error" role="alert"></p>' +
      '<button type="submit" class="btn btn-primary btn-lg btn-block">Entrar</button>' +
      '</form>' +
      '<div class="login-pie">' + cancelar + '</div></section>';
  }

  function iniciarSesion(local, encargado) {
    var nombre = limpiarNombre(encargado);
    if (!local || !nombre) return;
    var cambioLocal = !S.sesion || S.sesion.local !== local;
    var conocidos = encargadosDe(S.boot, local, []);
    if (!conocidos.some(function (n) { return D.norm(n) === D.norm(nombre); })) {
      var extra = D.store.get('encargados:' + local, []);
      if (!extra.some(function (n) { return D.norm(n) === D.norm(nombre); })) {
        extra.push(nombre);
        D.store.set('encargados:' + local, extra.slice(-10));
      }
    }
    S.sesion = { local: local, encargado: nombre };
    D.store.set('sesion', S.sesion);
    S.login = null;
    if (cambioLocal) {
      S.error.pedir = S.error.contar = S.error.recibir = null;
      S.filtro.pedir = { texto: '', cat: '' };
      S.filtro.contar = { texto: '', cat: '' };
    }
    if (ruta().tab === 'hoy' && ruta().sub === '') { entrarA('hoy'); render(); enfocarTitulo(); }
    else ir('#hoy');
  }

  /* ---------- pantalla: hoy ---------- */

  function renderHoy(app) {
    var h = S.hoy;
    var cuerpo;
    if (!h) {
      cuerpo = S.hoyError ? tplError(S.hoyError, 'reintentar-hoy') : tplCargando('Buscando cómo está el local…');
    } else {
      var ped = h.pedido_semana;
      var nPed = Number(h.pedidos_semana) || 0;
      var dias = diasDesdeConteo(h);
      var nRec = cantidadPorRecibir(h);
      var filaPedido = ped
        ? fila('#pedir', ICON.pedido, 'Pedido de la semana',
          'ID ' + ped.id_pedido + ' · ' + plural(contar(ped.lineas) || 0, 'producto', 'productos') + (nPed > 1 ? ' · ' + nPed + ' pedidos esta semana' : ''),
          'Enviado', 'ok')
        : fila('#pedir', ICON.pedido, 'Pedido de la semana', '', 'Falta enviar', 'warn');
      var detConteo = h.ultimo_conteo
        ? D.fechaCorta(h.ultimo_conteo.fecha_hora) + (contar(h.ultimo_conteo.productos) !== null ? ' · ' + plural(contar(h.ultimo_conteo.productos), 'producto', 'productos') : '')
        : '';
      var filaConteo = fila('#contar', ICON.conteo, 'Último conteo', detConteo, textoHaceDias(dias),
        dias === null || dias >= DIAS_CONTEO ? 'warn' : 'ok');
      var filaRec = fila('#recibir', ICON.recibir, 'Por recibir',
        nRec ? 'Compras ya hizo la orden.' : '',
        nRec ? plural(nRec, 'orden', 'órdenes') : 'Nada', nRec ? 'info' : 'muted');
      var acc = accionPrincipal(h);
      var accion = acc.hash
        ? '<div class="accion"><p class="accion-motivo">' + esc(acc.motivo) + '</p><a class="btn btn-primary btn-lg btn-block" href="' + acc.hash + '">' + esc(acc.texto) + '</a></div>'
        : '<div class="accion"><div class="banner banner-ok" role="status"><div><strong>Todo al día.</strong><p>' + esc(acc.motivo) + '</p></div></div></div>';
      var bajo = Number(h.bajo_par) || 0;
      cuerpo = '<ul class="list estado-list">' + filaPedido + filaConteo + filaRec + '</ul>' +
        (bajo > 0 ? '<p class="info-line">' + esc(plural(bajo, 'producto está', 'productos están')) + ' por debajo del par.</p>' : '') +
        accion +
        (S.hoyError ? '<p class="small muted aviso-viejo">No se pudo actualizar: ' + esc(S.hoyError) + ' <button type="button" class="btn btn-ghost btn-sm" data-act="reintentar-hoy">Reintentar</button></p>' : '') +
        (S.hoyCargando ? '<p class="small muted aviso-viejo" role="status"><span class="spinner spinner-sm" aria-hidden="true"></span> Actualizando…</p>' : '');
    }
    app.innerHTML = '<section class="screen">' +
      '<h1 class="screen-title" tabindex="-1">Hola, ' + esc(S.sesion.encargado) + '</h1>' +
      cuerpo + '</section>';
  }

  function fila(href, icono, titulo, detalle, estado, tono) {
    return '<li><a class="estado-row" href="' + href + '">' +
      '<span class="estado-ico">' + icono + '</span>' +
      '<span class="estado-txt"><span class="estado-tit">' + esc(titulo) + '</span>' + (detalle ? '<span class="estado-det">' + esc(detalle) + '</span>' : '') + '</span>' +
      '<span class="badge badge-' + tono + '">' + esc(estado) + '</span></a></li>';
  }

  /* ---------- pantalla: pedir ---------- */

  function borradorPedido() { return leerBorrador('pedido', S.sesion.local); }

  function renderPedir(app, r) {
    if (r.sub === 'listo') { renderExitoPedido(app); return; }
    var titulo = '<h1 class="screen-title" tabindex="-1">' + (r.sub === 'revisar' ? 'Revisá el pedido' : 'Hacer el pedido') + '</h1>';
    if (!S.cat) {
      app.innerHTML = '<section class="screen">' + titulo + (S.catError ? tplError(S.catError, 'reintentar-cat') : tplCargando('Cargando productos…')) + '</section>';
      return;
    }
    if (r.sub === 'revisar') { renderRevisarPedido(app, titulo); return; }
    app.innerHTML = '<section class="screen">' + titulo +
      (S.cat.length ? tplToolbar('pedir', true) : '') +
      '<div id="lista-pedir"></div>' +
      '<button type="button" class="btn btn-block btn-libre" data-act="abrir-libre">' + ICON.mas + ' Agregar producto que no está en la lista</button>' +
      '</section>';
    pintarListaPedir();
  }

  function pintarListaPedir() {
    var cont = byId('lista-pedir');
    if (!cont) return;
    var f = S.filtro.pedir;
    var b = borradorPedido();
    var lista = filtrarProductos(S.cat, f.texto, f.cat);
    var html = '';
    var libres = (b.libres || []).filter(function (l) {
      if (f.cat) return false;
      if (!f.texto) return true;
      return D.norm(l.producto).indexOf(D.norm(f.texto)) > -1;
    });
    if (libres.length) {
      html += '<div class="prod-list"><div class="prod-group" role="heading" aria-level="2">Agregados a mano</div>' +
        libres.map(tplFilaLibre).join('') + '</div>';
    }
    if (!S.cat.length) {
      html += tplCatalogoVacio();
    } else if (!lista.length) {
      html += tplVacioFiltro('pedir');
    } else {
      var agrupar = !f.cat && !f.texto;
      var catActual = null;
      html += '<div class="prod-list">';
      lista.forEach(function (p) {
        if (agrupar && categoriaDe(p) !== catActual) {
          catActual = categoriaDe(p);
          html += '<div class="prod-group" role="heading" aria-level="2">' + esc(catActual) + '</div>';
        }
        html += tplFilaPedido(p, b.items[p.codigo]);
      });
      html += '</div>';
    }
    cont.innerHTML = html;
    var res = byId('res-pedir');
    if (res) res.textContent = S.cat.length ? (lista.length ? plural(lista.length, 'producto', 'productos') : 'Sin resultados') : '';
    barraPedir();
  }

  function tplStepper(nombre, unidad, valor) {
    var paso = numTexto(pasoCantidad(unidad));
    var q = D.num.parse(valor);
    var invalido = valor && (q === null || q < 0);
    return '<div class="stepper" role="group" aria-label="Cantidad de ' + esc(nombre) + '">' +
      '<button type="button" data-act="menos" aria-label="Restar ' + esc(paso + ' ' + unidad) + '">−</button>' +
      '<input type="text" inputmode="decimal" autocomplete="off" data-act="cant" aria-label="Cantidad de ' + esc(nombre) + ' en ' + esc(unidad) + '" value="' + esc(valor || '') + '"' + (invalido ? ' aria-invalid="true"' : '') + '>' +
      '<button type="button" data-act="mas" aria-label="Sumar ' + esc(paso + ' ' + unidad) + '">+</button></div>';
  }

  function tplFilaPedido(p, valor) {
    var q = D.num.parse(valor);
    var sug = sugeridoDe(p);
    var chip = sug > 0
      ? '<button type="button" class="chip chip-sug" data-act="sug" data-sug="' + esc(numTexto(sug)) + '" aria-label="Cargar sugerido: ' + esc(fmt(sug, p.unidad)) + '">Sugerido ' + esc(fmt(sug)) + '</button>'
      : '';
    return '<div class="prod-row' + (q > 0 ? ' is-on' : '') + '" data-codigo="' + esc(p.codigo) + '" data-unidad="' + esc(p.unidad) + '">' +
      '<div class="prod-info"><div class="prod-name">' + esc(p.producto) + ' <span class="prod-unit">' + esc(p.unidad) + '</span></div>' +
      '<div class="prod-meta">' + esc(metaStock(p)) + '</div>' + chip + '</div>' +
      tplStepper(p.producto, p.unidad, valor) + '</div>';
  }

  function tplFilaLibre(l) {
    var q = D.num.parse(l.cantidad);
    return '<div class="prod-row' + (q > 0 ? ' is-on' : '') + '" data-libre="' + esc(l.key) + '" data-unidad="' + esc(l.unidad) + '">' +
      '<div class="prod-info"><div class="prod-name">' + esc(l.producto) + ' <span class="prod-unit">' + esc(l.unidad) + '</span></div>' +
      '<div class="prod-meta">Sin proveedor · lo asigna compras</div>' +
      '<button type="button" class="btn btn-ghost btn-sm btn-quitar" data-act="quitar-libre">Quitar</button></div>' +
      tplStepper(l.producto, l.unidad, l.cantidad) + '</div>';
  }

  function barraPedir() {
    var n = armarItemsPedido(borradorPedido(), S.cat || []).length;
    setBarra(n
      ? '<a class="btn btn-primary btn-lg btn-block" href="#pedir/revisar"><span class="num">' + esc(plural(n, 'producto', 'productos')) + '</span> · Revisar pedido</a>'
      : '<p class="barra-vacia">Todavía no agregaste productos.</p>');
  }

  function onCantidadPedido(input) {
    var row = input.closest('.prod-row');
    if (!row) return;
    var v = String(input.value || '').trim();
    var b = borradorPedido();
    var key = row.getAttribute('data-libre');
    if (key) {
      (b.libres || []).forEach(function (l) { if (l.key === key) l.cantidad = v; });
    } else {
      var cod = row.getAttribute('data-codigo');
      if (v) b.items[cod] = v; else delete b.items[cod];
    }
    guardarBorrador('pedido', S.sesion.local, b);
    marcarFila(row, input, v, function (q) { return q > 0; });
    barraPedir();
  }

  function marcarFila(row, input, v, activo) {
    var q = D.num.parse(v);
    row.classList.toggle('is-on', q !== null && activo(q));
    if (v && (q === null || q < 0)) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function renderRevisarPedido(app, titulo) {
    var b = borradorPedido();
    var items = armarItemsPedido(b, S.cat);
    var volver = '<a class="btn btn-ghost volver" href="#pedir">' + ICON.volver + ' Seguir agregando</a>';
    if (!items.length) {
      app.innerHTML = '<section class="screen">' + volver + titulo +
        '<div class="empty"><p>El pedido está vacío.</p><a class="btn" href="#pedir">Elegir productos</a></div></section>';
      setBarra(null);
      return;
    }
    var fuera = fueraDeCatalogo(b, S.cat);
    var grupos = agruparPorProveedor(items);
    var html = '<section class="screen">' + volver + titulo +
      '<p class="subtitulo">' + esc(plural(items.length, 'producto', 'productos')) + ' para <strong>' + esc(S.sesion.local) + '</strong> · ' + esc(semanaLabel()) + '</p>';
    if (fuera.length) {
      html += '<div class="banner banner-warn"><div>' + esc(plural(fuera.length, 'producto del borrador ya no está', 'productos del borrador ya no están')) +
        ' en el catálogo y no se envían. <button type="button" class="btn btn-sm" data-act="limpiar-fuera">Sacarlos del borrador</button></div></div>';
    }
    grupos.forEach(function (g) {
      html += '<section class="grupo"><h2 class="grupo-tit">' + esc(g.proveedor) + ' <span class="muted grupo-n">' + esc(plural(g.items.length, 'producto', 'productos')) + '</span></h2>' +
        '<ul class="list">' + g.items.map(function (it) {
          return '<li class="list-row rev-row"><span class="rev-prod">' + esc(it.producto) + (it.libre ? ' <span class="badge badge-muted">Agregado a mano</span>' : '') + '</span>' +
            '<span class="rev-cant num">' + esc(fmt(it.cantidad, it.unidad)) + '</span></li>';
        }).join('') + '</ul></section>';
    });
    var prio = b.prioridad === 'Urgente' ? 'Urgente' : 'Normal';
    html += '<fieldset class="field seg-field"><legend class="label">Prioridad</legend><div class="seg">' +
      ['Normal', 'Urgente'].map(function (p) {
        return '<label class="seg-op' + (prio === p ? ' is-sel' : '') + (p === 'Urgente' ? ' seg-urgente' : '') + '">' +
          '<input type="radio" name="prioridad" value="' + p + '" data-act="prioridad"' + (prio === p ? ' checked' : '') + '><span>' + p + '</span></label>';
      }).join('') + '</div></fieldset>' +
      '<div class="field"><label for="notas-pedido">Notas para compras (opcional)</label>' +
      '<textarea id="notas-pedido" class="input" data-act="notas" maxlength="500" rows="3" placeholder="Ej.: el tomate, bien maduro">' + esc(b.notas || '') + '</textarea></div>' +
      tplErrorEnvio('pedir', 'enviar-pedido-nuevo', 'Enviar como pedido nuevo') +
      tplBtnEnviar('enviar-pedido', 'Enviar pedido', 'Enviando…') +
      '<p class="small muted nota-envio">Se manda a compras. Si se corta la señal, tu pedido queda guardado en el celular.</p>' +
      '</section>';
    app.innerHTML = html;
    setBarra(null);
  }

  function onEnviarPedido(nuevo) {
    if (S.enviando || !S.cat) return;
    if (nuevo) { var b = borradorPedido(); b.id = null; guardarBorrador('pedido', S.sesion.local, b); }
    S.enviando = true; S.error.pedir = null; S.conflicto.pedir = false;
    render();
    var sesion = { local: S.sesion.local, encargado: S.sesion.encargado };
    enviarPedido(sesion, S.cat).then(function (r) {
      S.enviando = false;
      if (r.ok) {
        S.exito = { tipo: 'pedido', id: r.id, lineas: r.lineas, conservado: r.borradorConservado };
        if (S.hoy && S.hoyLocal === sesion.local) {
          S.hoy.pedido_semana = { id_pedido: r.id, fecha_hora: ahoraTexto(), estado: 'Pendiente', lineas: r.lineas };
          S.hoy.pedidos_semana = (Number(S.hoy.pedidos_semana) || 0) + 1;
        }
        S.catTs = 0;
        if (ruta().tab === 'pedir') { D.toast('Pedido enviado.', 'ok'); ir('#pedir/listo'); }
        else { D.toast('Pedido enviado: ' + r.id + '.', 'ok'); render(); }
      } else {
        S.error.pedir = r.error; S.conflicto.pedir = !!r.conflicto;
        render();
        var e = byId('error-pedir');
        if (e && e.scrollIntoView) e.scrollIntoView({ block: 'center' });
      }
    });
  }

  function renderExitoPedido(app) {
    var x = S.exito;
    if (!x || x.tipo !== 'pedido') { ir('#pedir'); return; }
    app.innerHTML = '<section class="screen exito">' +
      '<div class="exito-ico">' + ICON.ok + '</div>' +
      '<h1 class="screen-title" tabindex="-1">Pedido enviado</h1>' +
      '<p>Compras ya lo tiene. ' + esc(plural(x.lineas, 'producto', 'productos')) + '.</p>' +
      '<p class="exito-id"><span class="small muted">Número de pedido</span><span class="num">' + esc(x.id) + '</span></p>' +
      (x.conservado ? '<p class="banner banner-info">Lo que cambiaste mientras se enviaba quedó en un borrador nuevo.</p>' : '') +
      '<a class="btn btn-primary btn-lg btn-block" href="#hoy">Volver a Hoy</a></section>';
  }

  /* ---------- diálogo: línea libre ---------- */

  function abrirDialogo(dlg) {
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }
  function cerrarDialogo(dlg) {
    if (typeof dlg.close === 'function' && dlg.open) dlg.close(); else dlg.removeAttribute('open');
  }

  function abrirLibre() {
    var sel = byId('libre-unidad');
    if (!sel.options.length) {
      sel.innerHTML = D.UNIDADES.map(function (u) { return '<option value="' + esc(u) + '">' + esc(u) + '</option>'; }).join('');
    }
    byId('libre-nombre').value = S.filtro.pedir.texto || '';
    byId('libre-cant').value = '';
    sel.value = 'unidad';
    byId('libre-error').textContent = '';
    abrirDialogo(byId('dlg-libre'));
    byId('libre-nombre').focus();
  }

  function onSubmitLibre(e) {
    e.preventDefault();
    var nombre = limpiarNombre(byId('libre-nombre').value).slice(0, 80);
    var unidad = byId('libre-unidad').value;
    var q = D.num.parse(byId('libre-cant').value);
    var err = !nombre ? 'Escribí el nombre del producto.'
      : D.UNIDADES.indexOf(unidad) < 0 ? 'Elegí una unidad.'
        : (q === null || q <= 0) ? 'Poné una cantidad mayor a cero.' : '';
    if (err) { byId('libre-error').textContent = err; return; }
    var b = borradorPedido();
    b.libres = b.libres || [];
    b.libres.push({ key: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), producto: nombre, unidad: unidad, cantidad: numTexto(q) });
    guardarBorrador('pedido', S.sesion.local, b);
    cerrarDialogo(byId('dlg-libre'));
    S.filtro.pedir = { texto: '', cat: '' };
    render();
    D.toast(nombre + ' agregado al pedido.', 'ok');
  }

  /* ---------- pantalla: contar ---------- */

  function borradorConteo() { return leerBorrador('conteo', S.sesion.local); }

  function renderContar(app, r) {
    var titulo = '<h1 class="screen-title" tabindex="-1">' + (r.sub === 'revisar' ? 'Revisá el conteo' : 'Contar stock') + '</h1>';
    if (!S.cat) {
      app.innerHTML = '<section class="screen">' + titulo + (S.catError ? tplError(S.catError, 'reintentar-cat') : tplCargando('Cargando productos…')) + '</section>';
      return;
    }
    if (r.sub === 'revisar') { renderRevisarConteo(app, titulo); return; }
    app.innerHTML = '<section class="screen">' + titulo +
      (S.cat.length ? '<p class="muted subtitulo">Anotá lo que hay. Lo que dejes vacío no se cuenta; si no queda nada, tocá 0.</p>' + tplToolbar('contar', false) : '') +
      '<div id="lista-contar"></div></section>';
    pintarListaContar();
  }

  function pintarListaContar() {
    var cont = byId('lista-contar');
    if (!cont) return;
    var f = S.filtro.contar;
    var b = borradorConteo();
    var lista = filtrarProductos(S.cat, f.texto, f.cat);
    var html;
    if (!S.cat.length) html = tplCatalogoVacio();
    else if (!lista.length) html = tplVacioFiltro('contar');
    else {
      var agrupar = !f.cat && !f.texto;
      var catActual = null;
      html = '<div class="prod-list">';
      lista.forEach(function (p) {
        if (agrupar && categoriaDe(p) !== catActual) {
          catActual = categoriaDe(p);
          html += '<div class="prod-group" role="heading" aria-level="2">' + esc(catActual) + '</div>';
        }
        html += tplFilaConteo(p, b.items[p.codigo]);
      });
      html += '</div>';
    }
    cont.innerHTML = html;
    var res = byId('res-contar');
    if (res) res.textContent = S.cat.length ? (lista.length ? plural(lista.length, 'producto', 'productos') : 'Sin resultados') : '';
    barraContar();
  }

  function antesTexto(p) {
    if (p.stock_actual === null || p.stock_actual === undefined || p.stock_actual === '') return 'Nunca contado';
    var d = D.haceDias(p.ultimo_conteo);
    var cuando = d === null ? '' : ' · ' + textoHaceDias(d).toLowerCase();
    return 'Antes: ' + fmt(p.stock_actual, p.unidad) + cuando;
  }

  function tplFilaConteo(p, valor) {
    var v = valor === undefined || valor === null ? '' : String(valor);
    var q = D.num.parse(v);
    var invalido = v && (q === null || q < 0);
    return '<div class="prod-row cnt-row' + (q !== null && q >= 0 ? ' is-on' : '') + '" data-codigo="' + esc(p.codigo) + '">' +
      '<div class="prod-info"><div class="prod-name">' + esc(p.producto) + ' <span class="prod-unit">' + esc(p.unidad) + '</span></div>' +
      '<div class="prod-meta">' + esc(antesTexto(p)) + '</div></div>' +
      '<div class="cnt-ctl">' +
      '<button type="button" class="btn cnt-cero" data-act="cero" aria-label="No queda: ' + esc(p.producto) + ' en cero">0</button>' +
      '<input type="text" inputmode="decimal" autocomplete="off" class="input input-num cnt-input" data-act="contar" placeholder="' + esc(p.unidad) + '" aria-label="Cantidad contada de ' + esc(p.producto) + ' en ' + esc(p.unidad) + '" value="' + esc(v) + '"' + (invalido ? ' aria-invalid="true"' : '') + '>' +
      '</div></div>';
  }

  function barraContar() {
    var n = itemsConteo(borradorConteo(), S.cat || []).length;
    setBarra('<div class="barra-fila"><span class="barra-cuenta" aria-live="polite">' + (n ? esc(plural(n, 'producto contado', 'productos contados')) : 'Ningún producto contado') + '</span>' +
      (n ? '<a class="btn btn-primary btn-lg" href="#contar/revisar">Revisar</a>' : '<button type="button" class="btn btn-primary btn-lg" disabled>Revisar</button>') + '</div>');
  }

  function onCantidadConteo(input) {
    var row = input.closest('.prod-row');
    if (!row) return;
    var cod = row.getAttribute('data-codigo');
    var v = String(input.value || '').trim();
    var b = borradorConteo();
    if (v) b.items[cod] = v; else delete b.items[cod];
    guardarBorrador('conteo', S.sesion.local, b);
    marcarFila(row, input, v, function (q) { return q >= 0; });
    barraContar();
  }

  function renderRevisarConteo(app, titulo) {
    var b = borradorConteo();
    var items = itemsConteo(b, S.cat);
    var idx = indexarCatalogo(S.cat);
    var volver = '<a class="btn btn-ghost volver" href="#contar">' + ICON.volver + ' Seguir contando</a>';
    setBarra(null);
    if (!items.length) {
      app.innerHTML = '<section class="screen">' + volver + titulo + '<div class="empty"><p>No contaste ningún producto todavía.</p><a class="btn" href="#contar">Empezar a contar</a></div></section>';
      return;
    }
    var invalidos = conteoInvalidos(b).filter(function (c) { return idx[c]; });
    app.innerHTML = '<section class="screen">' + volver + titulo +
      '<p class="lead">Vas a guardar <strong>' + esc(plural(items.length, 'producto', 'productos')) + '</strong>.</p>' +
      '<p class="small muted">Los que dejaste vacíos no se tocan.</p>' +
      (invalidos.length ? '<div class="banner banner-warn">' + esc(plural(invalidos.length, 'cantidad no es un número', 'cantidades no son números')) + '. Volvé y corregilas.</div>' : '') +
      '<ul class="list">' + items.map(function (it) {
        var p = idx[it.codigo] || {};
        return '<li class="list-row rev-row"><span class="rev-prod">' + esc(p.producto || it.codigo) + '</span>' +
          '<span class="rev-cant num">' + (it.cantidad === 0 ? '<span class="badge badge-warn">No queda</span> ' : '') + esc(fmt(it.cantidad, p.unidad)) + '</span></li>';
      }).join('') + '</ul>' +
      tplErrorEnvio('contar', 'guardar-conteo-nuevo', 'Guardar como conteo nuevo') +
      tplBtnEnviar('guardar-conteo', 'Guardar conteo', 'Guardando…', invalidos.length > 0) +
      '</section>';
  }

  function onGuardarConteo(nuevo) {
    if (S.enviando || !S.cat) return;
    if (nuevo) { var b = borradorConteo(); b.id = null; guardarBorrador('conteo', S.sesion.local, b); }
    S.enviando = true; S.error.contar = null; S.conflicto.contar = false;
    render();
    var sesion = { local: S.sesion.local, encargado: S.sesion.encargado };
    enviarConteo(sesion, S.cat).then(function (r) {
      S.enviando = false;
      if (r.ok) {
        if (S.hoy && S.hoyLocal === sesion.local) S.hoy.ultimo_conteo = { id_operacion: r.id, fecha_hora: ahoraTexto(), productos: r.items };
        S.catTs = 0;
        S.filtro.contar = { texto: '', cat: '' };
        D.toast('Conteo guardado: ' + plural(r.items, 'producto', 'productos') + '.', 'ok');
        if (r.borradorConservado) D.toast('Lo que cambiaste mientras se guardaba quedó en el borrador.', 'info');
        if (ruta().tab === 'contar') ir('#hoy'); else render();
      } else {
        S.error.contar = r.error; S.conflicto.contar = !!r.conflicto;
        render();
        var e = byId('error-contar');
        if (e && e.scrollIntoView) e.scrollIntoView({ block: 'center' });
      }
    });
  }

  /* ---------- pantalla: recibir ---------- */

  function borradorRecepcion() { return leerBorrador('recepcion', S.sesion.local); }

  function renderRecibir(app, r) {
    if (r.sub === 'listo') { renderExitoRecepcion(app); return; }
    var titulo = '<h1 class="screen-title" tabindex="-1">Recibir mercadería</h1>';
    if (!S.rec) {
      app.innerHTML = '<section class="screen">' + titulo + (S.recError ? tplError(S.recError, 'reintentar-rec') : tplCargando('Buscando órdenes…')) + '</section>';
      return;
    }
    var b = borradorRecepcion();
    var estado = { ordenes: S.rec, marcas: b.marcas, extras: b.extras };
    if (!S.rec.length && !(b.extras || []).length) {
      app.innerHTML = '<section class="screen">' + titulo +
        '<div class="empty vacio-amable"><div class="exito-ico">' + ICON.recibir + '</div>' +
        '<p><strong>No hay mercadería por recibir.</strong></p><p>Cuando compras haga una orden para ' + esc(S.sesion.local) + ', aparece acá.</p></div>' +
        '<button type="button" class="btn btn-block" data-act="abrir-extra">' + ICON.mas + ' Llegó algo que no estaba en una orden</button>' +
        (S.recError ? '<p class="small muted aviso-viejo">' + esc(S.recError) + '</p>' : '') +
        '</section>';
      return;
    }
    var html = '<section class="screen">' + titulo +
      '<p class="muted subtitulo">Tildá lo que llegó y corregí la cantidad si vino distinta.</p>';
    S.rec.forEach(function (o) {
      html += '<article class="orden" data-oc="' + esc(o.id_oc) + '">' +
        '<header class="orden-cab"><div><h2 class="orden-prov">' + esc(o.proveedor || 'Sin proveedor') + '</h2>' +
        '<p class="small muted"><span title="' + esc(o.id_oc) + '">Orden ' + esc(idCorto(o.id_oc)) + '</span> · ' + esc(D.fechaCorta(o.fecha_hora)) + ' · ' + esc(plural((o.lineas || []).length, 'producto', 'productos')) + '</p></div>' +
        '<button type="button" class="btn btn-sm btn-todo" data-act="llego-todo">Llegó todo</button></header>' +
        (o.lineas || []).map(function (l) { return tplLineaRecepcion(estado, l); }).join('') +
        '</article>';
    });
    html += '<section class="grupo extras"><h2 class="grupo-tit">Lo que llegó sin orden</h2>';
    if ((b.extras || []).length) {
      html += '<ul class="list">' + b.extras.map(function (x, i) {
        return '<li class="list-row rev-row"><span class="rev-prod">' + esc(x.producto) + '</span><span class="rev-cant num">' + esc(fmt(D.num.parse(x.cantidad), x.unidad)) + '</span>' +
          '<button type="button" class="btn btn-ghost btn-sm btn-quitar" data-act="quitar-extra" data-i="' + i + '" aria-label="Quitar ' + esc(x.producto) + '">Quitar</button></li>';
      }).join('') + '</ul>';
    }
    html += '<button type="button" class="btn btn-block" data-act="abrir-extra">' + ICON.mas + ' Llegó algo que no estaba en la orden</button></section>' +
      '<div class="field"><label for="obs-rec">Observaciones (opcional)</label>' +
      '<textarea id="obs-rec" class="input" data-act="obs" maxlength="500" rows="3" placeholder="Ej.: el tomate vino golpeado">' + esc(b.observaciones || '') + '</textarea></div>' +
      '</section>';
    app.innerHTML = html;
    barraRecibir();
  }

  function tplLineaRecepcion(estado, l) {
    var m = marcaDe(estado, l);
    var id = 'rc-' + String(l.id_linea).replace(/[^A-Za-z0-9_-]/g, '');
    return '<div class="rec-line' + (m.llego ? ' is-on' : '') + '" data-linea="' + esc(l.id_linea) + '" data-unidad="' + esc(l.unidad) + '" data-pedida="' + esc(l.cantidad) + '">' +
      '<label class="rec-check"><input type="checkbox" data-act="llego"' + (m.llego ? ' checked' : '') + ' aria-describedby="' + id + '-n"><span>Llegó</span></label>' +
      '<div class="rec-info"><div class="prod-name" id="' + id + '-n">' + esc(l.producto) + '</div>' +
      '<div class="prod-meta">Pedido: ' + esc(fmt(l.cantidad, l.unidad)) + '</div>' +
      '<div class="rec-estado" aria-live="polite">' + tplEstadoLinea(l, m) + '</div></div>' +
      '<div class="rec-cant"><input type="text" inputmode="decimal" autocomplete="off" class="input input-num" data-act="rec-cant" aria-label="Cantidad recibida de ' + esc(l.producto) + ' en ' + esc(l.unidad) + '" value="' + esc(m.cantidad) + '">' +
      '<span class="rec-unit">' + esc(l.unidad) + '</span></div></div>';
  }

  function tplEstadoLinea(l, m) {
    if (!m.llego) return '';
    var q = D.num.parse(m.cantidad);
    if (q === null || q < 0) return '<span class="badge badge-bad">Cantidad inválida</span>';
    var f = faltante(l.cantidad, m.cantidad);
    if (f > 0) return '<span class="badge badge-warn">Faltan ' + esc(fmt(f, l.unidad)) + '</span>';
    var p = D.num.parse(l.cantidad);
    if (p !== null && q > p) return '<span class="badge badge-info">Llegó ' + esc(fmt(redondear(q - p), l.unidad)) + ' de más</span>';
    return '<span class="badge badge-ok">Completo</span>';
  }

  function barraRecibir() {
    var b = borradorRecepcion();
    var r = itemsRecepcion({ ordenes: S.rec || [], marcas: b.marcas, extras: b.extras });
    var n = r.items.length + r.extras.length;
    var err = S.error.recibir
      ? '<div class="barra-error" id="error-recibir" role="alert"><strong>No se guardó.</strong> ' + esc(S.error.recibir) + '</div>'
      : '<div class="barra-error" id="error-recibir" role="alert" hidden></div>';
    var btn;
    if (S.enviando) btn = '<button type="button" class="btn btn-primary btn-lg btn-block" disabled aria-busy="true"><span class="spinner spinner-claro" aria-hidden="true"></span> Guardando…</button>';
    else if (!n) btn = '<button type="button" class="btn btn-primary btn-lg btn-block" disabled>Tildá lo que llegó</button>';
    else btn = '<button type="button" class="btn btn-primary btn-lg btn-block" data-act="guardar-recepcion">Guardar recepción · ' + esc(plural(n, 'producto', 'productos')) + '</button>';
    setBarra(err + btn);
  }

  function actualizarLineaRecepcion(row) {
    var b = borradorRecepcion();
    var l = { id_linea: row.getAttribute('data-linea'), unidad: row.getAttribute('data-unidad'), cantidad: D.num.parse(row.getAttribute('data-pedida')) };
    var m = marcaDe({ marcas: b.marcas }, l);
    row.classList.toggle('is-on', m.llego);
    var chk = row.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = m.llego;
    var inp = row.querySelector('input[data-act="rec-cant"]');
    if (inp && inp.value !== m.cantidad) inp.value = m.cantidad;
    var q = D.num.parse(m.cantidad);
    if (inp) { if (m.llego && (q === null || q < 0)) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
    row.querySelector('.rec-estado').innerHTML = tplEstadoLinea(l, m);
  }

  function onMarcaRecepcion(row, cambios) {
    var b = borradorRecepcion();
    var id = row.getAttribute('data-linea');
    var l = { id_linea: id, cantidad: D.num.parse(row.getAttribute('data-pedida')) };
    var m = marcaDe({ marcas: b.marcas }, l);
    Object.keys(cambios).forEach(function (k) { m[k] = cambios[k]; });
    b.marcas[id] = m;
    guardarBorrador('recepcion', S.sesion.local, b);
    actualizarLineaRecepcion(row);
    if (S.error.recibir) S.error.recibir = null;
    barraRecibir();
  }

  function onLlegoTodo(card) {
    var oc = card.getAttribute('data-oc');
    var orden = (S.rec || []).filter(function (o) { return String(o.id_oc) === oc; })[0];
    if (!orden) return;
    var b = borradorRecepcion();
    llegoTodo(b, orden);
    guardarBorrador('recepcion', S.sesion.local, b);
    var rows = card.querySelectorAll('.rec-line');
    for (var i = 0; i < rows.length; i++) actualizarLineaRecepcion(rows[i]);
    barraRecibir();
  }

  function onGuardarRecepcion() {
    if (S.enviando || !S.rec) return;
    S.enviando = true; S.error.recibir = null;
    barraRecibir();
    var sesion = { local: S.sesion.local, encargado: S.sesion.encargado };
    enviarRecepcion(sesion, S.rec).then(function (r) {
      S.enviando = false;
      if (r.ok) {
        S.exito = { tipo: 'recepcion', id: r.id, resumen: r.resumen, conservado: r.borradorConservado };
        S.rec = null;
        S.catTs = 0;
        D.toast('Recepción guardada.', 'ok');
        if (ruta().tab === 'recibir') ir('#recibir/listo'); else render();
        cargarPorRecibir();
      } else {
        S.error.recibir = r.error;
        barraRecibir();
        D.toast(r.error, 'error');
      }
    });
  }

  function renderExitoRecepcion(app) {
    var x = S.exito;
    if (!x || x.tipo !== 'recepcion') { ir('#recibir'); return; }
    var s = x.resumen || { entregadas: 0, incompletas: 0, extras: 0 };
    app.innerHTML = '<section class="screen exito">' +
      '<div class="exito-ico">' + ICON.ok + '</div>' +
      '<h1 class="screen-title" tabindex="-1">Recepción guardada</h1>' +
      '<ul class="list resumen">' +
      '<li class="list-row"><span>Entregadas completas</span><span class="badge badge-ok num">' + esc(s.entregadas) + '</span></li>' +
      '<li class="list-row"><span>Incompletas' + (s.incompletas ? ' <span class="small muted">(compras ve el faltante)</span>' : '') + '</span><span class="badge ' + (s.incompletas ? 'badge-warn' : 'badge-muted') + ' num">' + esc(s.incompletas) + '</span></li>' +
      (s.extras ? '<li class="list-row"><span>Sin orden</span><span class="badge badge-info num">' + esc(s.extras) + '</span></li>' : '') +
      '</ul>' +
      '<p class="exito-id"><span class="small muted">Número de recepción</span><span class="num">' + esc(x.id) + '</span></p>' +
      '<a class="btn btn-primary btn-lg btn-block" href="#hoy">Volver a Hoy</a>' +
      '<a class="btn btn-ghost btn-block" href="#recibir">Ver lo que falta recibir</a></section>';
  }

  /* ---------- diálogo: extra en recepción ---------- */

  function abrirExtra() {
    S.extraSel = null;
    byId('extra-buscar').value = '';
    byId('extra-cant').value = '';
    byId('extra-error').textContent = '';
    byId('extra-cant-label').textContent = 'Cantidad que llegó';
    pintarExtraResultados();
    abrirDialogo(byId('dlg-extra'));
    byId('extra-buscar').focus();
    if (!S.cat) cargarCatalogo(false);
  }

  function pintarExtraResultados() {
    var cont = byId('extra-res');
    var sr = byId('extra-res-sr');
    if (!cont) return;
    if (!S.cat) {
      cont.innerHTML = S.catError ? '<p class="field-error">' + esc(S.catError) + ' <button type="button" class="btn btn-sm" data-act="reintentar-cat">Reintentar</button></p>' : tplCargando('Cargando productos…');
      sr.textContent = '';
      return;
    }
    var texto = byId('extra-buscar').value;
    var lista = texto.trim() ? filtrarProductos(S.cat, texto, '') : [];
    if (S.extraSel && !lista.some(function (p) { return p.codigo === S.extraSel; })) {
      var sel = indexarCatalogo(S.cat)[S.extraSel];
      if (sel) lista.unshift(sel);
    }
    var mostrar = lista.slice(0, 8);
    cont.innerHTML = mostrar.map(function (p) {
      var on = p.codigo === S.extraSel;
      return '<button type="button" class="extra-op' + (on ? ' is-sel' : '') + '" data-act="extra-elegir" data-codigo="' + esc(p.codigo) + '" aria-pressed="' + on + '">' +
        '<span>' + esc(p.producto) + '</span><span class="muted small">' + esc(p.unidad) + '</span></button>';
    }).join('');
    sr.textContent = !texto.trim() ? 'Escribí para buscar en el catálogo.' : lista.length ? (lista.length > 8 ? 'Mostrando 8 de ' + lista.length + '. Escribí más para achicar.' : plural(lista.length, 'resultado', 'resultados')) : 'No está en el catálogo. Anotalo en Observaciones.';
  }

  function onSubmitExtra(e) {
    e.preventDefault();
    var p = S.cat && indexarCatalogo(S.cat)[S.extraSel];
    var q = D.num.parse(byId('extra-cant').value);
    var err = !p ? 'Elegí un producto de la lista.' : (q === null || q <= 0) ? 'Poné una cantidad mayor a cero.' : '';
    if (err) { byId('extra-error').textContent = err; return; }
    var b = borradorRecepcion();
    b.extras = b.extras || [];
    b.extras.push({ codigo: p.codigo, producto: p.producto, unidad: p.unidad, cantidad: numTexto(q) });
    guardarBorrador('recepcion', S.sesion.local, b);
    cerrarDialogo(byId('dlg-extra'));
    render();
    D.toast(p.producto + ' agregado a la recepción.', 'ok');
  }

  /* ---------- render principal ---------- */

  function render() {
    var app = byId('app');
    var r = ruta();
    actualizarHeader();
    actualizarNav(r);
    setBarra(null);
    if (!D.api.configured()) { renderSinBackend(app); return; }
    if (S.login || !sesionLista()) { renderLogin(app); actualizarNav(r); return; }
    if (r.tab === 'pedir') renderPedir(app, r);
    else if (r.tab === 'contar') renderContar(app, r);
    else if (r.tab === 'recibir') renderRecibir(app, r);
    else renderHoy(app);
  }

  function repintarListas() {
    var r = ruta();
    // La barra de filtros no se redibuja (conserva el foco del buscador): sólo se actualiza el contador.
    var nSug = document.querySelector('.chip-sugeridos .chip-n');
    if (nSug) nSug.textContent = String(contarSugeridos(S.cat));
    if (r.tab === 'pedir' && r.sub === '' && byId('lista-pedir')) pintarListaPedir();
    else if (r.tab === 'contar' && r.sub === '' && byId('lista-contar')) pintarListaContar();
    else render();
    if (dialogoExtraAbierto()) pintarExtraResultados();
  }

  /* ---------- eventos ---------- */

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var act = el.getAttribute('data-act');
    var row;
    switch (act) {
      case 'cambiar-sesion': S.login = { paso: 'local' }; render(); enfocarTitulo(); break;
      case 'cancelar-login': S.login = null; render(); enfocarTitulo(); break;
      case 'elegir-local':
        S.login = { paso: 'encargado', local: el.getAttribute('data-local') };
        render(); enfocarTitulo(); break;
      case 'volver-local': S.login = { paso: 'local' }; render(); enfocarTitulo(); break;
      case 'elegir-enc': iniciarSesion(S.login && S.login.local || S.sesion.local, el.getAttribute('data-nombre')); break;
      case 'reintentar-boot': S.bootError = null; cargarBoot(); render(); break;
      case 'reintentar-hoy': cargarHoy(); render(); break;
      case 'reintentar-cat': S.catError = null; cargarCatalogo(true); if (!dialogoExtraAbierto()) render(); else pintarExtraResultados(); break;
      case 'reintentar-rec': cargarPorRecibir(); render(); break;
      case 'cat': {
        var pant = ruta().tab;
        S.filtro[pant].cat = el.getAttribute('data-cat');
        var chips = el.parentNode.querySelectorAll('.chip');
        for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i] === el));
        if (pant === 'pedir') pintarListaPedir(); else pintarListaContar();
        break;
      }
      case 'limpiar-filtro': {
        var p2 = el.getAttribute('data-pantalla');
        S.filtro[p2] = { texto: '', cat: '' };
        render();
        break;
      }
      case 'mas':
      case 'menos': {
        row = el.closest('.prod-row');
        var inp = row.querySelector('input[data-act="cant"]');
        inp.value = sumarPaso(inp.value, row.getAttribute('data-unidad'), act === 'mas' ? 1 : -1);
        onCantidadPedido(inp);
        break;
      }
      case 'sug': {
        row = el.closest('.prod-row');
        var inp2 = row.querySelector('input[data-act="cant"]');
        inp2.value = el.getAttribute('data-sug');
        onCantidadPedido(inp2);
        break;
      }
      case 'quitar-libre': {
        row = el.closest('.prod-row');
        var key = row.getAttribute('data-libre');
        var b = borradorPedido();
        b.libres = (b.libres || []).filter(function (l) { return l.key !== key; });
        guardarBorrador('pedido', S.sesion.local, b);
        pintarListaPedir();
        break;
      }
      case 'abrir-libre': abrirLibre(); break;
      case 'cerrar-dlg': cerrarDialogo(el.closest('dialog')); break;
      case 'limpiar-fuera': {
        var bp = borradorPedido();
        fueraDeCatalogo(bp, S.cat).forEach(function (c) { delete bp.items[c]; });
        guardarBorrador('pedido', S.sesion.local, bp);
        render();
        break;
      }
      case 'enviar-pedido': onEnviarPedido(false); break;
      case 'enviar-pedido-nuevo': onEnviarPedido(true); break;
      case 'cero': {
        row = el.closest('.prod-row');
        var ic = row.querySelector('input[data-act="contar"]');
        ic.value = '0';
        onCantidadConteo(ic);
        break;
      }
      case 'guardar-conteo': onGuardarConteo(false); break;
      case 'guardar-conteo-nuevo': onGuardarConteo(true); break;
      case 'llego-todo': onLlegoTodo(el.closest('.orden')); break;
      case 'abrir-extra': abrirExtra(); break;
      case 'extra-elegir': {
        S.extraSel = el.getAttribute('data-codigo');
        var pe = indexarCatalogo(S.cat)[S.extraSel];
        byId('extra-cant-label').textContent = 'Cantidad que llegó' + (pe ? ' (' + pe.unidad + ')' : '');
        byId('extra-error').textContent = '';
        pintarExtraResultados();
        byId('extra-cant').focus();
        break;
      }
      case 'quitar-extra': {
        var br = borradorRecepcion();
        br.extras.splice(Number(el.getAttribute('data-i')), 1);
        guardarBorrador('recepcion', S.sesion.local, br);
        render();
        break;
      }
      case 'guardar-recepcion': onGuardarRecepcion(); break;
      default: break;
    }
  }

  function onInput(e) {
    var el = e.target;
    var act = el.getAttribute && el.getAttribute('data-act');
    if (el.id === 'extra-buscar') { pintarExtraResultados(); return; }
    if (!act || !S.sesion) return;
    if (act === 'buscar') {
      var pant = el.getAttribute('data-pantalla');
      S.filtro[pant].texto = el.value;
      if (pant === 'pedir') pintarListaPedir(); else pintarListaContar();
    } else if (act === 'cant') onCantidadPedido(el);
    else if (act === 'contar') onCantidadConteo(el);
    else if (act === 'rec-cant') {
      var row = el.closest('.rec-line');
      var b = borradorRecepcion();
      var m = b.marcas[row.getAttribute('data-linea')];
      onMarcaRecepcion(row, { cantidad: el.value, llego: m ? m.llego || el.value.trim() !== '' : el.value.trim() !== '' });
    } else if (act === 'notas') {
      var bp = borradorPedido(); bp.notas = el.value; guardarBorrador('pedido', S.sesion.local, bp);
    } else if (act === 'obs') {
      var br = borradorRecepcion(); br.observaciones = el.value; guardarBorrador('recepcion', S.sesion.local, br);
    }
  }

  function onChange(e) {
    var el = e.target;
    var act = el.getAttribute && el.getAttribute('data-act');
    if (!act || !S.sesion) return;
    if (act === 'llego') onMarcaRecepcion(el.closest('.rec-line'), { llego: el.checked });
    else if (act === 'prioridad') {
      var b = borradorPedido(); b.prioridad = el.value === 'Urgente' ? 'Urgente' : 'Normal';
      guardarBorrador('pedido', S.sesion.local, b);
      var ops = el.closest('.seg').querySelectorAll('.seg-op');
      for (var i = 0; i < ops.length; i++) ops[i].classList.toggle('is-sel', ops[i].querySelector('input').checked);
    }
  }

  function onSubmit(e) {
    var f = e.target;
    if (f.id === 'form-libre') { onSubmitLibre(e); return; }
    if (f.id === 'form-extra') { onSubmitExtra(e); return; }
    if (f.getAttribute('data-form') === 'otro-nombre') {
      e.preventDefault();
      var nombre = limpiarNombre(byId('enc-otro').value);
      if (nombre.length < 2) { byId('enc-error').textContent = 'Escribí tu nombre.'; byId('enc-otro').focus(); return; }
      iniciarSesion(S.login && S.login.local || S.sesion.local, nombre);
    }
  }

  function onKeydown(e) {
    // Enter en una cantidad: cerrar el teclado en vez de enviar nada.
    var act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (e.key === 'Enter' && (act === 'cant' || act === 'contar' || act === 'rec-cant' || act === 'buscar')) {
      e.preventDefault();
      e.target.blur();
    }
  }

  function iniciar() {
    var s = D.store.get('sesion', null);
    if (s && s.local && s.encargado) S.sesion = { local: String(s.local), encargado: String(s.encargado) };
    else if (s && s.local) S.sesion = { local: String(s.local), encargado: '' };
    doc.addEventListener('click', onClick);
    doc.addEventListener('input', onInput);
    doc.addEventListener('change', onChange);
    doc.addEventListener('submit', onSubmit);
    doc.addEventListener('keydown', onKeydown);
    global.addEventListener('hashchange', onHashChange);
    global.addEventListener('beforeunload', function (e) {
      if (S.enviando) { e.preventDefault(); e.returnValue = ''; }
    });
    S.rutaPrev = ruta().tab + '/' + ruta().sub;
    if (ruta().sub === 'listo') { global.location.replace('#' + ruta().tab); S.rutaPrev = ruta().tab + '/'; }
    if (D.api.configured()) {
      cargarBoot();
      if (sesionLista()) { entrarA(ruta().tab); if (ruta().tab !== 'hoy') cargarHoy(); }
    }
    render();
  }

  global.DocksEncargado = {
    CAT_SUGERIDOS: CAT_SUGERIDOS,
    SIN_PROVEEDOR: SIN_PROVEEDOR,
    esContable: esContable,
    pasoCantidad: pasoCantidad,
    numTexto: numTexto,
    sumarPaso: sumarPaso,
    sugeridoDe: sugeridoDe,
    categorias: categorias,
    ordenarCatalogo: ordenarCatalogo,
    filtrarProductos: filtrarProductos,
    claveBorrador: claveBorrador,
    leerBorrador: leerBorrador,
    guardarBorrador: guardarBorrador,
    borrarBorrador: borrarBorrador,
    asegurarId: asegurarId,
    firmaBorrador: firmaBorrador,
    armarItemsPedido: armarItemsPedido,
    fueraDeCatalogo: fueraDeCatalogo,
    payloadPedido: payloadPedido,
    agruparPorProveedor: agruparPorProveedor,
    itemsConteo: itemsConteo,
    conteoInvalidos: conteoInvalidos,
    itemsRecepcion: itemsRecepcion,
    faltante: faltante,
    llegoTodo: llegoTodo,
    resumenRecepcion: resumenRecepcion,
    idCorto: idCorto,
    cantidadPorRecibir: cantidadPorRecibir,
    textoHaceDias: textoHaceDias,
    accionPrincipal: accionPrincipal,
    validarPedidoConfirmado: validarPedidoConfirmado,
    validarOperacionConfirmada: validarOperacionConfirmada,
    guardarOperacion: guardarOperacion,
    enviarPedido: enviarPedido,
    enviarConteo: enviarConteo,
    enviarRecepcion: enviarRecepcion,
    localesActivos: localesActivos,
    encargadosDe: encargadosDe
  };

  if (doc && doc.getElementById && doc.getElementById('app')) iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
