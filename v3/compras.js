/* Docks V3 · compras (gerencia). Contrato: docs/v3/CONTRATO.md §4 y §5. Depende de window.Docks (core.js). */
(function (global) {
  'use strict';

  var Docks = global.Docks;
  var doc = global.document;

  /* =====================================================================
   * Lógica pura (expuesta en window.DocksCompras para verificación)
   * ===================================================================== */

  var GRAVEDAD = { SIN_STOCK: 0, BAJO: 1, SIN_CONTEO: 2, SIN_PAR: 3, OK: 4 };
  var ESTADO_STOCK = {
    SIN_STOCK: { texto: 'Sin stock', clase: 'bad' },
    BAJO: { texto: 'Bajo par', clase: 'warn' },
    SIN_CONTEO: { texto: 'Sin conteo', clase: 'muted' },
    SIN_PAR: { texto: 'Sin par', clase: 'info' },
    OK: { texto: 'OK', clase: 'ok' }
  };
  var ESTADO_OC = {
    'Enviada': 'info',
    'Recibida parcial': 'warn',
    'Recibida': 'ok',
    'Cancelada': 'muted'
  };

  var COLUMNAS = {
    productos: [
      { k: 'producto', titulo: 'Producto', req: true, alias: ['producto', 'productos', 'articulo', 'nombre', 'descripcion', 'item'] },
      { k: 'categoria', titulo: 'Categoría', alias: ['categoria', 'categorias', 'rubro', 'familia'] },
      { k: 'unidad', titulo: 'Unidad', alias: ['unidad', 'unidades', 'unidad de medida', 'um', 'u medida', 'medida'] },
      { k: 'proveedor', titulo: 'Proveedor', alias: ['proveedor', 'proveedores'] },
      { k: 'precio', titulo: 'Precio', alias: ['precio', 'precios', 'precio ref', 'precio referencia', 'precio de referencia', 'precio unitario', 'costo', '$'] },
      { k: 'par', titulo: 'Par', alias: ['par', 'stock par', 'par de stock', 'stock ideal', 'stock objetivo'] }
    ],
    proveedores: [
      { k: 'proveedor', titulo: 'Proveedor', req: true, alias: ['proveedor', 'proveedores', 'nombre', 'razon social', 'empresa'] },
      { k: 'contacto', titulo: 'Contacto', alias: ['contacto', 'persona', 'vendedor'] },
      { k: 'whatsapp', titulo: 'WhatsApp', alias: ['whatsapp', 'wsp', 'wa', 'telefono', 'celular', 'tel'] },
      { k: 'email', titulo: 'Email', alias: ['email', 'e-mail', 'mail', 'correo'] },
      { k: 'dias_entrega', titulo: 'Días de entrega', alias: ['dias de entrega', 'dias entrega', 'entrega', 'dias'] },
      { k: 'pedido_minimo', titulo: 'Pedido mínimo', alias: ['pedido minimo', 'minimo', 'monto minimo', 'compra minima'] }
    ]
  };

  function num(v) { return Docks.num.parse(v); }
  function redondear(n, dec) { var f = Math.pow(10, dec == null ? 3 : dec); return Math.round(n * f) / f; }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function cmpEs(a, b) { return String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base', numeric: true }); }

  var pesosFmt = null;
  function formatoPesos(n) {
    var v = num(n);
    if (v === null) return '—';
    if (!pesosFmt) {
      try {
        pesosFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
      } catch (_e) { pesosFmt = false; }
    }
    if (pesosFmt) return pesosFmt.format(v);
    return '$ ' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function claveProducto(producto, unidad) { return Docks.norm(producto) + '|' + Docks.norm(unidad); }

  // "Umo Grill" → "Umo"; si dos locales comparten la primera palabra, se usa el nombre completo.
  function nombresCortos(locales) {
    var primeras = {};
    var unicos = [];
    locales.forEach(function (l) { l = texto(l); if (unicos.indexOf(l) < 0) unicos.push(l); });
    unicos.forEach(function (l) {
      var p = Docks.norm(l.split(/\s+/)[0]);
      primeras[p] = (primeras[p] || 0) + 1;
    });
    var out = {};
    unicos.forEach(function (l) {
      var w = l.split(/\s+/)[0];
      out[l] = primeras[Docks.norm(w)] > 1 ? l : w;
    });
    return out;
  }

  function porLocal(lineas) {
    var map = {};
    var orden = [];
    lineas.forEach(function (l) {
      var loc = texto(l.local) || 'Sin local';
      if (!(loc in map)) { map[loc] = 0; orden.push(loc); }
      var c = num(l.cantidad);
      if (c !== null) map[loc] = redondear(map[loc] + c);
    });
    orden.sort(cmpEs);
    return orden.map(function (loc) { return { local: loc, cantidad: map[loc] }; });
  }

  // "Umo 5 · Trento 10" (cantidades por local, misma unidad).
  function resumenLocales(lineas, todosLosLocales) {
    var filas = porLocal(lineas || []);
    var cortos = nombresCortos(todosLosLocales && todosLosLocales.length ? todosLosLocales.concat(filas.map(function (f) { return f.local; })) : filas.map(function (f) { return f.local; }));
    return filas.map(function (f) { return (cortos[f.local] || f.local) + ' ' + Docks.num.fmt(f.cantidad); }).join(' · ');
  }

  // Agrupa por Producto + Unidad (nunca suma unidades distintas).
  function agregarPorProducto(lineas, todosLosLocales) {
    var map = {};
    var orden = [];
    (lineas || []).forEach(function (l) {
      var k = claveProducto(l.producto, l.unidad);
      var g = map[k];
      if (!g) {
        g = map[k] = {
          clave: k, producto: texto(l.producto), unidad: texto(l.unidad), codigos: [],
          total: 0, subtotal: 0, sin_precio: 0, precios: [], urgente: false, lineas: [], id_lineas: []
        };
        orden.push(g);
      }
      g.lineas.push(l);
      g.id_lineas.push(l.id_linea);
      if (l.codigo && g.codigos.indexOf(l.codigo) < 0) g.codigos.push(l.codigo);
      var c = num(l.cantidad);
      var p = num(l.precio_ref);
      if (c !== null) g.total += c;
      if (p !== null) {
        if (g.precios.indexOf(p) < 0) g.precios.push(p);
        if (c !== null) g.subtotal += c * p;
      } else {
        g.sin_precio++;
      }
      if (Docks.norm(l.prioridad) === 'urgente') g.urgente = true;
    });
    orden.forEach(function (g) {
      g.total = redondear(g.total);
      g.subtotal = redondear(g.subtotal, 2);
      g.precio_ref = g.precios.length ? g.precios[g.precios.length - 1] : null;
      g.precio_varia = g.precios.length > 1;
      g.locales = porLocal(g.lineas);
      g.detalle = resumenLocales(g.lineas, todosLosLocales);
    });
    orden.sort(function (a, b) { return cmpEs(a.producto, b.producto) || cmpEs(a.unidad, b.unidad); });
    return orden;
  }

  // Suma cantidad × precio de referencia; las líneas sin precio no suman.
  function totalEstimado(lineas) {
    var t = 0;
    (lineas || []).forEach(function (l) {
      var c = num(l.cantidad);
      var p = num(l.precio_ref);
      if (c !== null && p !== null) t += c * p;
    });
    return redondear(t, 2);
  }

  // true si no hay mínimo o el total estimado lo alcanza.
  function alcanzaMinimo(grupo) {
    grupo = grupo || {};
    var min = num(grupo.pedido_minimo);
    if (min === null || min <= 0) return true;
    var total = grupo.lineas ? totalEstimado(grupo.lineas) : (num(grupo.total_estimado) || 0);
    return total >= min;
  }

  function normalizarUnidad(u) {
    var n = Docks.norm(u).replace(/\.$/, '');
    if (!n) return '';
    var ALIAS = { 'kgs': 'kg', 'kilo': 'kg', 'kilos': 'kg', 'gr': 'g', 'grs': 'g', 'gramo': 'g', 'gramos': 'g', 'l': 'litro', 'lt': 'litro', 'lts': 'litro', 'u': 'unidad', 'un': 'unidad', 'uni': 'unidad', 'unid': 'unidad', 'paq': 'paquete', 'doc': 'docena' };
    if (ALIAS[n]) return ALIAS[n];
    if (Docks.UNIDADES.indexOf(n) > -1) return n;
    if (/es$/.test(n) && Docks.UNIDADES.indexOf(n.slice(0, -2)) > -1) return n.slice(0, -2);
    if (/s$/.test(n) && Docks.UNIDADES.indexOf(n.slice(0, -1)) > -1) return n.slice(0, -1);
    return null;
  }

  // Montos en pesos: "$ 1.234", "1.234,50", "1500". Un punto seguido de 3 dígitos es separador de miles.
  function parsearMonto(s) {
    var t = String(s == null ? '' : s).replace(/ars/i, '').replace(/\$/g, '').replace(/\s/g, '');
    if (!t) return null;
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(t)) t = t.replace(/,/g, '');
    return num(t);
  }

  function limpiarCelda(c) {
    var t = String(c == null ? '' : c).trim();
    if (t.length >= 2 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') t = t.slice(1, -1).replace(/""/g, '"').trim();
    return t;
  }
  function normEncabezado(c) { return Docks.norm(c).replace(/[_]/g, ' ').replace(/[.:()]/g, '').replace(/\s+/g, ' ').trim(); }

  function validoEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

  /*
   * Parsea un rango pegado desde Excel / Google Sheets (separado por tabulaciones).
   * tipo: 'productos' (Producto, Categoría, Unidad, Proveedor, Precio, Par)
   *       'proveedores' (Proveedor, Contacto, WhatsApp, Email, Días de entrega, Pedido mínimo)
   * Devuelve { tipo, encabezado, filas:[{fila, datos, errores, avisos}], validas:[datos], conErrores, aviso }.
   * `fila` es el número de renglón dentro del texto pegado (1 = primer renglón).
   */
  function parsearPegado(textoPegado, tipo) {
    tipo = tipo === 'proveedores' ? 'proveedores' : 'productos';
    var cols = COLUMNAS[tipo];
    var res = { tipo: tipo, encabezado: false, filas: [], validas: [], conErrores: 0, aviso: null };
    var renglones = String(textoPegado == null ? '' : textoPegado).split(/\r\n|\n|\r/);
    var datosRenglones = [];
    renglones.forEach(function (r, i) {
      var celdas = r.split('\t').map(limpiarCelda);
      if (celdas.every(function (c) { return !c; })) return;
      datosRenglones.push({ fila: i + 1, celdas: celdas, crudo: r });
    });
    if (!datosRenglones.length) return res;

    // Encabezado: la primera fila trae nombres de columna conocidos.
    var mapa = cols.map(function (_c, i) { return i; });
    var primera = datosRenglones[0].celdas.map(normEncabezado);
    var detectado = {};
    primera.forEach(function (celda, idx) {
      cols.forEach(function (c) {
        if (!(c.k in detectado) && c.alias.map(normEncabezado).indexOf(celda) > -1) detectado[c.k] = idx;
      });
    });
    var reconocidas = Object.keys(detectado).length;
    var requerida = cols[0].k;
    if ((requerida in detectado) || reconocidas >= 2) {
      res.encabezado = true;
      mapa = cols.map(function (c) { return c.k in detectado ? detectado[c.k] : -1; });
      datosRenglones.shift();
      if (!(requerida in detectado)) res.aviso = 'No encontré la columna «' + cols[0].titulo + '» en el encabezado.';
    }
    if (!datosRenglones.some(function (r) { return r.crudo.indexOf('\t') > -1; }) && datosRenglones.length && !res.aviso) {
      res.aviso = 'No encontré tabulaciones: copiá las celdas directo desde la planilla (no desde un texto).';
    }

    var vistos = {};
    datosRenglones.forEach(function (r) {
      var crudo = {};
      cols.forEach(function (c, i) { crudo[c.k] = mapa[i] > -1 ? (r.celdas[mapa[i]] || '') : ''; });
      var item = tipo === 'productos' ? validarProducto(crudo) : validarProveedor(crudo);
      var clave = tipo === 'productos' ? claveProducto(item.datos.producto, item.datos.unidad) : Docks.norm(item.datos.proveedor);
      if (item.datos[requerida] && clave in vistos) item.errores.push('Repetido (igual que la fila ' + vistos[clave] + ')');
      else if (item.datos[requerida]) vistos[clave] = r.fila;
      var fila = { fila: r.fila, datos: item.datos, errores: item.errores, avisos: [] };
      res.filas.push(fila);
      if (fila.errores.length) res.conErrores++;
      else res.validas.push(fila.datos);
    });
    return res;
  }

  function validarProducto(c) {
    var errores = [];
    var unidad = normalizarUnidad(c.unidad);
    var precio = parsearMonto(c.precio);
    var par = num(c.par);
    if (!c.producto) errores.push('Falta el producto');
    if (!texto(c.unidad)) errores.push('Falta la unidad');
    else if (unidad === null) errores.push('Unidad no válida: «' + c.unidad + '»');
    if (texto(c.precio) && (precio === null || precio < 0)) errores.push('Precio no válido: «' + c.precio + '»');
    if (texto(c.par) && (par === null || par < 0)) errores.push('Par no válido: «' + c.par + '»');
    return {
      errores: errores,
      datos: {
        producto: texto(c.producto), categoria: texto(c.categoria), unidad: unidad || texto(c.unidad),
        proveedor: texto(c.proveedor), precio: precio, par: par
      }
    };
  }

  function validarProveedor(c) {
    var errores = [];
    var wa = String(c.whatsapp || '').replace(/\D/g, '');
    var minimo = parsearMonto(c.pedido_minimo);
    if (!c.proveedor) errores.push('Falta el nombre del proveedor');
    if (texto(c.whatsapp) && (wa.length < 10 || wa.length > 15)) errores.push('WhatsApp no válido: usá código de país, ej. 5491112345678');
    if (texto(c.email) && !validoEmail(texto(c.email))) errores.push('Email no válido');
    if (texto(c.pedido_minimo) && (minimo === null || minimo < 0)) errores.push('Pedido mínimo no válido');
    return {
      errores: errores,
      datos: {
        proveedor: texto(c.proveedor), contacto: texto(c.contacto), whatsapp: wa, email: texto(c.email),
        dias_entrega: texto(c.dias_entrega), pedido_minimo: minimo
      }
    };
  }

  // Orden de stock: SIN_STOCK, BAJO, SIN_CONTEO, SIN_PAR, OK; después producto y local.
  function ordenarStock(filas) {
    return (filas || []).slice().sort(function (a, b) {
      var ga = a.estado in GRAVEDAD ? GRAVEDAD[a.estado] : 9;
      var gb = b.estado in GRAVEDAD ? GRAVEDAD[b.estado] : 9;
      return (ga - gb) || cmpEs(a.producto, b.producto) || cmpEs(a.local, b.local);
    });
  }

  // Líneas tildadas: todas salvo las marcadas en `desel` (id_linea → true).
  function lineasTildadas(lineas, desel) {
    desel = desel || {};
    return (lineas || []).filter(function (l) { return !desel[l.id_linea]; });
  }

  /*
   * Arma el cuerpo de crearOrden. El id_oc se genera una vez por intento: si se reintenta la
   * misma orden (mismo proveedor y mismas líneas) se reusa; si cambia la selección, es otra orden.
   * `intentos` es un objeto que el llamador conserva entre clics.
   */
  function prepararOrden(intentos, datos) {
    datos = datos || {};
    var ids = (datos.id_lineas || []).filter(Boolean);
    if (!ids.length) throw new Error('Tildá al menos una línea para armar la orden.');
    if (!texto(datos.proveedor)) throw new Error('Elegí el proveedor de la orden.');
    if (!texto(datos.responsable)) throw new Error('Escribí quién compra.');
    var clave = datos.clave || texto(datos.proveedor);
    var firma = Docks.norm(datos.proveedor) + '|' + ids.slice().sort().join(',');
    var previo = intentos[clave];
    var id_oc = previo && previo.firma === firma ? previo.id_oc : Docks.ids.nuevo('OC');
    intentos[clave] = { id_oc: id_oc, firma: firma };
    return {
      action: 'crearOrden',
      admin_key: datos.admin_key,
      id_oc: id_oc,
      id_lineas: ids.slice(),
      proveedor: texto(datos.proveedor),
      responsable: texto(datos.responsable)
    };
  }
  function cerrarIntento(intentos, clave) { delete intentos[clave]; }

  function idCorto(id) {
    var m = String(id || '').match(/^([A-Z]{2,4})-\d{8}-\d{6}-([a-z0-9]{4})/);
    return m ? m[1] + '-' + m[2] : String(id || '');
  }

  function esActivo(v) {
    if (v === true) return true;
    if (v === false || v == null) return false;
    return ['si', 'true', '1', 'activo', 'yes'].indexOf(Docks.norm(v)) > -1;
  }

  function haceTexto(dias) {
    if (dias === null || dias === undefined || dias === '' || !isFinite(Number(dias))) return 'Nunca';
    dias = Number(dias);
    if (dias <= 0) return 'Hoy';
    if (dias === 1) return 'Hace 1 día';
    return 'Hace ' + dias + ' días';
  }

  // Texto para reclamar faltantes, agrupado por proveedor.
  function textoReclamo(lineas) {
    var porProv = {};
    var orden = [];
    (lineas || []).forEach(function (l) {
      var p = texto(l.proveedor) || 'Sin proveedor';
      if (!porProv[p]) { porProv[p] = []; orden.push(p); }
      porProv[p].push(l);
    });
    orden.sort(cmpEs);
    var out = ['*Faltantes · Docks del Puerto*', ''];
    orden.forEach(function (p) {
      out.push('*' + p + '*');
      porProv[p].forEach(function (l) {
        var ped = num(l.cantidad);
        var rec = num(l.cantidad_recibida) || 0;
        var dif = ped === null ? null : redondear(ped - rec);
        out.push('• ' + texto(l.producto) + ' — pedido ' + Docks.num.fmt(ped, l.unidad) + ', llegó ' + Docks.num.fmt(rec, l.unidad) +
          (dif !== null ? ' (faltan ' + Docks.num.fmt(dif, l.unidad) + ')' : '') + ' · ' + texto(l.local) + (l.id_oc ? ' · ' + idCorto(l.id_oc) : ''));
      });
      out.push('');
    });
    return out.join('\n').trim();
  }

  function listaEncargados(v) {
    if (Array.isArray(v)) return v.map(texto).filter(Boolean);
    return String(v || '').split(/[,;\n]/).map(texto).filter(Boolean);
  }

  function horaHHMM(v) {
    var m = String(v || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return '';
    return (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2];
  }

  global.DocksCompras = {
    agregarPorProducto: agregarPorProducto,
    totalEstimado: totalEstimado,
    alcanzaMinimo: alcanzaMinimo,
    parsearPegado: parsearPegado,
    parsearMonto: parsearMonto,
    normalizarUnidad: normalizarUnidad,
    ordenarStock: ordenarStock,
    formatoPesos: formatoPesos,
    resumenLocales: resumenLocales,
    lineasTildadas: lineasTildadas,
    prepararOrden: prepararOrden,
    cerrarIntento: cerrarIntento,
    idCorto: idCorto,
    esActivo: esActivo,
    haceTexto: haceTexto,
    textoReclamo: textoReclamo,
    listaEncargados: listaEncargados,
    horaHHMM: horaHHMM,
    COLUMNAS: COLUMNAS
  };

  /* =====================================================================
   * Interfaz
   * ===================================================================== */

  var esc = Docks.esc;
  var KEY_SESION = 'docksv3:admin_key';
  var SECCIONES = ['compras', 'ordenes', 'faltantes', 'stock', 'catalogo', 'proveedores', 'locales'];
  var NECESITA = {
    compras: ['boot', 'consolidado'], ordenes: ['ordenes'], faltantes: ['faltantes'], stock: ['boot', 'stock'],
    catalogo: ['boot', 'catalogo'], proveedores: ['boot'], locales: ['boot']
  };
  var VIGENCIA_MS = 60000;

  var S = {
    key: '',
    sec: 'compras',
    data: {}, ts: {}, cargando: {}, errores: {},
    cont: {},
    semanaFiltro: '',
    grupos: [],
    desel: {}, abiertos: {}, asignar: {}, intentos: {}, errGrupo: {},
    ordenesEstado: '',
    faltDias: 14,
    stockLocal: '', stockEstado: '', stockQ: '',
    catLocal: '', catFiltro: '', catQ: '',
    provQ: '',
    wa: { cola: [], idx: 0 },
    cancelar: null,
    editProducto: null, editProveedor: null, editLocal: null, encargados: [],
    pegar: { tipo: 'productos', res: null },
    volverFoco: null
  };

  function $(id) { return doc.getElementById(id); }
  function mensaje(e) { return (e && e.message) || 'Algo salió mal. Probá de nuevo.'; }

  /* ---------- sesión ---------- */
  function sesionGet() { try { return global.sessionStorage.getItem(KEY_SESION) || ''; } catch (_e) { return ''; } }
  function sesionSet(v) { try { global.sessionStorage.setItem(KEY_SESION, v); } catch (_e) { /* sin sessionStorage: la clave queda sólo en memoria */ } }
  function sesionDel() { try { global.sessionStorage.removeItem(KEY_SESION); } catch (_e) { /* nada */ } }

  /* ---------- utilidades de interfaz ---------- */
  function ocupado(btn, textoOcupado, fn) {
    if (!btn || btn.dataset.busy) return Promise.resolve();
    var previo = btn.textContent;
    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (textoOcupado) btn.textContent = textoOcupado;
    return Promise.resolve().then(fn).then(function (r) { soltar(); return r; }, function (e) { soltar(); throw e; });
    function soltar() {
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = previo;
    }
  }

  function setError(el, msg) {
    if (!el) return;
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function abrirDialogo(d, foco) {
    S.volverFoco = doc.activeElement;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    if (foco) setTimeout(function () { try { foco.focus(); } catch (_e) { /* nada */ } }, 0);
  }
  function cerrarDialogo(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }

  function cargandoHtml(txt) { return '<div class="cx-cargando"><div class="spinner" aria-hidden="true"></div><span>' + esc(txt || 'Cargando…') + '</span></div>'; }
  function vacioHtml(titulo, sub) { return '<div class="panel empty"><p><strong>' + esc(titulo) + '</strong></p>' + (sub ? '<p class="small">' + esc(sub) + '</p>' : '') + '</div>'; }
  function errorHtml(msg, keys) {
    return '<div class="banner banner-bad cx-error-box" role="alert"><div><strong>No se pudo cargar.</strong> ' + esc(msg) + '</div>' +
      '<button class="btn btn-sm" type="button" data-act="reintentar" data-keys="' + esc(keys.join(',')) + '">Reintentar</button></div>';
  }
  function badge(textoBadge, clase) { return '<span class="badge badge-' + esc(clase) + '">' + esc(textoBadge) + '</span>'; }
  function fmtN(n, u) { return esc(Docks.num.fmt(n, u)); }

  function copiarTexto(txt, area) {
    function fallback() {
      try {
        if (area) { area.focus(); area.select(); }
        var okCopy = doc.execCommand && doc.execCommand('copy');
        if (okCopy) return true;
      } catch (_e) { /* nada */ }
      return false;
    }
    var p;
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText && global.isSecureContext !== false) {
      p = global.navigator.clipboard.writeText(txt).then(function () { return true; }, fallback);
    } else {
      p = Promise.resolve(fallback());
    }
    return p.then(function (ok) {
      if (ok) Docks.toast('Texto copiado', 'ok');
      else Docks.toast('No se pudo copiar: seleccioná el texto y copialo a mano.', 'error');
      return ok;
    });
  }

  function proveedores() { return (S.data.boot && S.data.boot.proveedores) || []; }
  function locales() { return (S.data.boot && S.data.boot.locales) || []; }
  function nombresLocales() { return locales().map(function (l) { return l.local; }); }
  function buscarProveedor(nombre) {
    var n = Docks.norm(nombre);
    if (!n) return null;
    var lista = proveedores();
    for (var i = 0; i < lista.length; i++) if (Docks.norm(lista[i].proveedor) === n) return lista[i];
    return null;
  }

  /* ---------- carga de datos ---------- */
  var LOADERS = {
    boot: function () { return Docks.api.get('getBootstrap'); },
    consolidado: function () { return Docks.api.get('getConsolidado', S.semanaFiltro ? { semana: S.semanaFiltro } : {}); },
    ordenes: function () { return Docks.api.get('getOrdenes', S.ordenesEstado ? { estado: S.ordenesEstado } : {}); },
    faltantes: function () { return Docks.api.get('getFaltantes', { dias: S.faltDias }); },
    stock: function () { return Docks.api.get('getStockPanel'); },
    catalogo: function () { return Docks.api.get('getCatalogo'); }
  };

  function cargar(key) {
    if (S.cargando[key]) return S.cargando[key];
    S.errores[key] = null;
    var p = LOADERS[key]().then(function (r) {
      S.data[key] = r;
      S.ts[key] = Date.now();
      alCargar(key);
    }, function (e) {
      S.errores[key] = mensaje(e);
    }).then(function () {
      S.cargando[key] = null;
      actualizarContadores();
      if (NECESITA[S.sec].indexOf(key) > -1 || (key === 'catalogo' && S.sec === 'proveedores')) render(S.sec);
    });
    S.cargando[key] = p;
    return p;
  }

  function alCargar(key) {
    var d = S.data[key];
    if (key === 'boot') llenarSelectoresLocales();
    if (key === 'consolidado' && !S.semanaFiltro) {
      S.cont.compras = (d.grupos || []).reduce(function (n, g) { return n + (g.lineas || []).length; }, 0);
    }
    if (key === 'ordenes' && (!S.ordenesEstado || S.ordenesEstado === 'Enviada')) {
      S.cont.ordenes = (d.ordenes || []).filter(function (o) { return o.estado === 'Enviada'; }).length;
    }
    if (key === 'faltantes') S.cont.faltantes = (d.lineas || []).length;
    if (key === 'stock') S.cont.stock = (d.filas || []).filter(function (f) { return f.estado === 'SIN_STOCK' || f.estado === 'BAJO'; }).length;
    if (key === 'catalogo') S.cont.catalogo = (d.productos || []).length;
    if (key === 'boot') {
      S.cont.proveedores = (d.proveedores || []).filter(function (p) { return esActivo(p.activo); }).length;
      S.cont.locales = (d.locales || []).filter(function (l) { return esActivo(l.activo); }).length;
    }
  }

  function actualizarContadores() {
    var alerta = { compras: true, faltantes: true, stock: true };
    SECCIONES.forEach(function (s) {
      var el = doc.querySelector('[data-count="' + s + '"]');
      if (!el) return;
      var v = S.cont[s];
      el.textContent = v === undefined ? '' : String(v);
      el.classList.toggle('is-alert', !!(alerta[s] && v > 0));
    });
  }

  function asegurar(sec, forzar) {
    NECESITA[sec].forEach(function (k) {
      var viejo = !S.ts[k] || Date.now() - S.ts[k] > VIGENCIA_MS;
      if (forzar || (!S.data[k] && !S.errores[k]) || viejo) cargar(k);
    });
    if (sec === 'proveedores' && !S.data.catalogo) cargar('catalogo');
  }

  // Devuelve html de carga/error si faltan datos; si no, '' (y un banner si hubo error al refrescar).
  function estadoCarga(sec) {
    var keys = NECESITA[sec];
    for (var i = 0; i < keys.length; i++) {
      if (!S.data[keys[i]]) {
        if (S.errores[keys[i]]) return errorHtml(S.errores[keys[i]], [keys[i]]);
        return cargandoHtml();
      }
    }
    return '';
  }
  function bannerRefresco(sec) {
    var errs = NECESITA[sec].filter(function (k) { return S.errores[k]; });
    if (!errs.length) return '';
    return errorHtml('Se muestran los últimos datos cargados. ' + S.errores[errs[0]], errs);
  }

  /* ---------- ruteo ---------- */
  function leerHash() {
    var h = String(global.location.hash || '').replace(/^#/, '');
    var partes = h.split('?');
    var sec = SECCIONES.indexOf(partes[0]) > -1 ? partes[0] : 'compras';
    var params = {};
    if (partes[1]) {
      partes[1].split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) { try { params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')); } catch (_e) { /* nada */ } }
      });
    }
    return { sec: sec, params: params };
  }

  function rutear(enfocar) {
    var r = leerHash();
    S.sec = r.sec;
    if (r.sec === 'catalogo' && r.params.q !== undefined) {
      S.catQ = r.params.q; S.catLocal = ''; S.catFiltro = '';
      $('cx-cat-buscar').value = S.catQ; $('cx-cat-local').value = ''; $('cx-cat-filtro').value = '';
    }
    SECCIONES.forEach(function (s) { $('sec-' + s).hidden = s !== r.sec; });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-nav]'), function (a) {
      if (a.getAttribute('data-nav') === r.sec) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    asegurar(r.sec);
    render(r.sec);
    if (enfocar) { var h = $('h-' + r.sec); if (h) h.focus(); }
  }

  function render(sec) {
    if ($('cx-app').hidden) return;
    ({
      compras: renderCompras, ordenes: renderOrdenes, faltantes: renderFaltantes, stock: renderStock,
      catalogo: renderCatalogo, proveedores: renderProveedores, locales: renderLocales
    })[sec]();
  }

  /* =====================================================================
   * COMPRAS
   * ===================================================================== */
  function llenarSemanas() {
    var sel = $('cx-semana');
    var actual = Docks.semana.de();
    var anterior = Docks.semana.de(new Date(Date.now() - 7 * 864e5));
    sel.innerHTML = '<option value="">Todo lo pendiente</option>' +
      '<option value="' + esc(actual.id) + '">Esta semana · ' + esc(actual.label) + '</option>' +
      '<option value="' + esc(anterior.id) + '">Semana anterior · ' + esc(anterior.label) + '</option>';
    sel.value = S.semanaFiltro;
  }

  function opcionesProveedores(elegido) {
    var lista = proveedores().filter(function (p) { return esActivo(p.activo); }).slice().sort(function (a, b) { return cmpEs(a.proveedor, b.proveedor); });
    return '<option value="">Elegir proveedor…</option>' + lista.map(function (p) {
      return '<option' + (p.proveedor === elegido ? ' selected' : '') + '>' + esc(p.proveedor) + '</option>';
    }).join('');
  }

  function renderCompras() {
    var body = $('cx-compras-body');
    var carga = estadoCarga('compras');
    if (carga) { body.innerHTML = carga; return; }
    var grupos = (S.data.consolidado.grupos || []).filter(function (g) { return g.lineas && g.lineas.length; });
    grupos.sort(function (a, b) {
      var sa = texto(a.proveedor) ? 1 : 0;
      var sb = texto(b.proveedor) ? 1 : 0;
      return (sa - sb) || cmpEs(a.proveedor, b.proveedor);
    });
    S.grupos = grupos;

    var ids = {};
    var locs = {};
    var nLineas = 0;
    grupos.forEach(function (g) { g.lineas.forEach(function (l) { ids[l.id_linea] = true; locs[l.local] = true; nLineas++; }); });
    Object.keys(S.desel).forEach(function (id) { if (!ids[id]) delete S.desel[id]; });

    var resumen = $('cx-cons-resumen');
    if (!grupos.length) {
      resumen.textContent = 'Lo que pidieron los locales, agrupado por proveedor.';
      body.innerHTML = bannerRefresco('compras') + vacioHtml('No hay pedidos pendientes',
        S.semanaFiltro ? 'No quedan líneas pendientes en la semana elegida. Probá con «Todo lo pendiente».' : 'Cuando un local mande su pedido, aparece acá agrupado por proveedor.');
      return;
    }
    var nProv = grupos.filter(function (g) { return texto(g.proveedor); }).length;
    resumen.textContent = nLineas + (nLineas === 1 ? ' línea pendiente' : ' líneas pendientes') + ' de ' +
      Object.keys(locs).length + (Object.keys(locs).length === 1 ? ' local' : ' locales') + ' · ' +
      nProv + (nProv === 1 ? ' proveedor' : ' proveedores');

    body.innerHTML = bannerRefresco('compras') + grupos.map(renderGrupo).join('');
    grupos.forEach(function (_g, gi) { actualizarGrupo(gi); });
  }

  function renderGrupo(g, gi) {
    var sin = !texto(g.proveedor);
    var prods = agregarPorProducto(g.lineas, nombresLocales());
    g._prods = prods;
    var info = buscarProveedor(g.proveedor) || {};
    var wa = texto(g.whatsapp || info.whatsapp);
    var minimo = num(g.pedido_minimo != null ? g.pedido_minimo : info.pedido_minimo);
    var claveErr = texto(g.proveedor);

    var meta = [];
    if (!sin) {
      meta.push(wa ? '<span>WhatsApp <a href="https://wa.me/' + esc(wa.replace(/\D/g, '')) + '" target="_blank" rel="noopener">' + esc(wa) + '</a></span>'
        : '<span class="cx-amb">Sin WhatsApp cargado</span>');
      meta.push('<span>Pedido mínimo: <strong class="num">' + (minimo ? esc(formatoPesos(minimo)) : 'sin mínimo') + '</strong></span>');
      if (info.dias_entrega) meta.push('<span>Entrega: ' + esc(info.dias_entrega) + '</span>');
      if (info.contacto) meta.push('<span>Contacto: ' + esc(info.contacto) + '</span>');
    } else {
      meta.push('<span>Productos sin proveedor en el catálogo</span>');
    }

    var filas = prods.map(function (p, pi) {
      var nombre = p.producto + ' (' + p.unidad + ')';
      var precio = p.precio_ref === null ? '<span class="muted">Sin precio</span>' :
        esc(formatoPesos(p.precio_ref)) + (p.precio_varia ? ' <span class="muted small">(varía)</span>' : '');
      var abierto = !!S.abiertos[claveErr + '|' + p.clave];
      var html = '<tr data-pi="' + pi + '">' +
        '<td class="cx-col-cb"><label class="cx-cb-cell"><input class="cx-cb" type="checkbox" data-chk="prod" data-g="' + gi + '" data-pi="' + pi + '" aria-label="Incluir ' + esc(nombre) + '"></label></td>' +
        '<td><span class="cx-prod">' + esc(p.producto) + '</span>' + (p.urgente ? ' ' + badge('Urgente', 'bad') : '') +
        '<br><button class="cx-toggle" type="button" data-act="toggle-lineas" data-g="' + gi + '" data-pi="' + pi + '" aria-expanded="' + abierto + '">' +
        (abierto ? 'Ocultar líneas' : 'Ver líneas (' + p.lineas.length + ')') + '</button></td>' +
        '<td>' + esc(p.unidad) + '</td>' +
        '<td class="r" data-cell="total"></td>' +
        '<td class="cx-detalle" data-cell="detalle"></td>' +
        '<td class="r">' + precio + '</td>' +
        '<td class="r" data-cell="subtotal"></td>' +
        (sin ? '<td><label class="sr-only" for="asg-' + gi + '-' + pi + '">Proveedor para ' + esc(nombre) + '</label>' +
          '<select id="asg-' + gi + '-' + pi + '" class="input cx-sel-prov" data-asignar="' + esc(p.clave) + '">' + opcionesProveedores(S.asignar[p.clave]) + '</select>' +
          '<br><a class="small" href="#catalogo?q=' + esc(encodeURIComponent(p.producto)) + '">Asignar en catálogo</a></td>' : '') +
        '</tr>';
      html += p.lineas.map(function (l) {
        var c = num(l.cantidad);
        var pr = num(l.precio_ref);
        return '<tr class="cx-sub" data-sub="' + gi + '-' + pi + '"' + (abierto ? '' : ' hidden') + '>' +
          '<td class="cx-col-cb"><label class="cx-cb-cell"><input class="cx-cb" type="checkbox" data-chk="linea" data-g="' + gi + '" data-id="' + esc(l.id_linea) + '" aria-label="Incluir línea de ' + esc(l.local) + ': ' + fmtN(c, l.unidad) + '"></label></td>' +
          '<td colspan="2">' + esc(l.local) + ' <span class="muted">· ' + esc(idCorto(l.id_pedido)) + ' · ' + esc(Docks.fechaCorta(l.fecha_hora)) + '</span>' +
          (Docks.norm(l.prioridad) === 'urgente' ? ' ' + badge('Urgente', 'bad') : '') + '</td>' +
          '<td class="r">' + fmtN(c) + '</td>' +
          '<td></td>' +
          '<td class="r">' + (pr === null ? '<span class="muted">—</span>' : esc(formatoPesos(pr))) + '</td>' +
          '<td class="r">' + (pr === null || c === null ? '<span class="muted">—</span>' : esc(formatoPesos(c * pr))) + '</td>' +
          (sin ? '<td></td>' : '') + '</tr>';
      }).join('');
      return html;
    }).join('');

    return '<article class="cx-grupo' + (sin ? ' is-sin' : '') + '" data-grupo="' + gi + '" aria-labelledby="g-tit-' + gi + '">' +
      '<div class="cx-grupo-head"><div><h2 id="g-tit-' + gi + '">' + (sin ? 'Sin proveedor' : esc(g.proveedor)) + '</h2>' +
      '<div class="cx-grupo-meta">' + meta.join('') + '</div></div>' +
      '<div class="cx-total"><span class="small muted">Total estimado de lo tildado</span><span class="cx-total-num" data-g-total></span>' +
      '<span class="small muted" data-g-sinprecio></span></div></div>' +
      (sin ? '<div class="banner banner-warn small">Estos productos no tienen proveedor en el catálogo. Elegí uno en cada fila para armar la orden, o asignalo en el catálogo para las próximas semanas.</div>' :
        '<div class="banner banner-warn small" data-g-min hidden></div>') +
      '<div class="table-wrap"><table class="table"><thead><tr>' +
      '<th class="cx-col-cb"><label class="cx-cb-cell"><input class="cx-cb" type="checkbox" data-chk="grupo" data-g="' + gi + '" aria-label="Incluir todo ' + esc(sin ? 'lo que no tiene proveedor' : g.proveedor) + '"></label></th>' +
      '<th>Producto</th><th>Unidad</th><th class="r">Total</th><th>Detalle por local</th><th class="r">Precio ref.</th><th class="r">Subtotal</th>' +
      (sin ? '<th>Proveedor</th>' : '') + '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      '<div class="cx-grupo-foot"><p class="cx-act-error" role="alert" data-g-error>' + esc(S.errGrupo[claveErr] || '') + '</p>' +
      '<button class="btn btn-danger" type="button" data-act="cancelar-lineas" data-g="' + gi + '">Cancelar líneas</button>' +
      '<button class="btn btn-primary" type="button" data-act="armar" data-g="' + gi + '" data-g-armar>Armar orden</button></div>' +
      '</article>';
  }

  function grupoEl(gi) { return doc.querySelector('#cx-compras-body [data-grupo="' + gi + '"]'); }

  function actualizarGrupo(gi) {
    var g = S.grupos[gi];
    var el = grupoEl(gi);
    if (!g || !el) return;
    var sin = !texto(g.proveedor);
    var sel = lineasTildadas(g.lineas, S.desel);
    var agg = {};
    agregarPorProducto(sel, nombresLocales()).forEach(function (p) { agg[p.clave] = p; });
    var sinPrecio = 0;
    g._prods.forEach(function (p, pi) {
      var row = el.querySelector('tr[data-pi="' + pi + '"]');
      if (!row) return;
      var a = agg[p.clave];
      var n = a ? a.lineas.length : 0;
      var cb = row.querySelector('[data-chk="prod"]');
      cb.checked = n === p.lineas.length;
      cb.indeterminate = n > 0 && n < p.lineas.length;
      row.classList.toggle('is-off', n === 0);
      row.querySelector('[data-cell="total"]').textContent = a ? Docks.num.fmt(a.total) : '0';
      row.querySelector('[data-cell="detalle"]').textContent = a ? a.detalle : 'No se incluye';
      row.querySelector('[data-cell="subtotal"]').textContent = a && a.precio_ref !== null ? formatoPesos(a.subtotal) : '—';
      if (a && a.sin_precio) sinPrecio++;
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-chk="linea"]'), function (cb) {
      cb.checked = !S.desel[cb.getAttribute('data-id')];
      var tr = cb.closest('tr');
      if (tr) tr.classList.toggle('is-off', !cb.checked);
    });
    var todo = el.querySelector('[data-chk="grupo"]');
    todo.checked = sel.length === g.lineas.length;
    todo.indeterminate = sel.length > 0 && sel.length < g.lineas.length;

    el.querySelector('[data-g-total]').textContent = formatoPesos(totalEstimado(sel));
    el.querySelector('[data-g-sinprecio]').textContent = sinPrecio ? (sinPrecio === 1 ? '1 producto sin precio' : sinPrecio + ' productos sin precio') : '';
    var minEl = el.querySelector('[data-g-min]');
    if (minEl && !sin) {
      var info = buscarProveedor(g.proveedor) || {};
      var minimo = num(g.pedido_minimo != null ? g.pedido_minimo : info.pedido_minimo);
      var alcanza = alcanzaMinimo({ pedido_minimo: minimo, lineas: sel });
      minEl.hidden = alcanza || !sel.length;
      if (!alcanza) {
        minEl.textContent = 'No llega al pedido mínimo de ' + formatoPesos(minimo) + ': faltan ' + formatoPesos(minimo - totalEstimado(sel)) +
          ' (estimado con precios de referencia).';
      }
    }
    var armar = el.querySelector('[data-g-armar]');
    if (!armar.dataset.busy) {
      armar.textContent = sel.length ? 'Armar orden · ' + sel.length + (sel.length === 1 ? ' línea' : ' líneas') : 'Armar orden';
      armar.disabled = !sel.length;
    }
    var canc = el.querySelector('[data-act="cancelar-lineas"]');
    if (!canc.dataset.busy) canc.disabled = !sel.length;
  }

  function tildar(ids, valor) { ids.forEach(function (id) { if (valor) delete S.desel[id]; else S.desel[id] = true; }); }

  function onCambioCompras(e) {
    var t = e.target;
    var chk = t.getAttribute('data-chk');
    if (chk) {
      var gi = Number(t.getAttribute('data-g'));
      var g = S.grupos[gi];
      if (!g) return;
      if (chk === 'linea') tildar([t.getAttribute('data-id')], t.checked);
      if (chk === 'prod') tildar(g._prods[Number(t.getAttribute('data-pi'))].id_lineas, t.checked);
      if (chk === 'grupo') tildar(g.lineas.map(function (l) { return l.id_linea; }), t.checked);
      actualizarGrupo(gi);
      return;
    }
    if (t.hasAttribute('data-asignar')) S.asignar[t.getAttribute('data-asignar')] = t.value;
  }

  function toggleLineas(btn) {
    var gi = btn.getAttribute('data-g');
    var pi = btn.getAttribute('data-pi');
    var g = S.grupos[Number(gi)];
    var p = g && g._prods[Number(pi)];
    if (!p) return;
    var k = texto(g.proveedor) + '|' + p.clave;
    var abrir = !S.abiertos[k];
    if (abrir) S.abiertos[k] = true; else delete S.abiertos[k];
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? 'Ocultar líneas' : 'Ver líneas (' + p.lineas.length + ')';
    Array.prototype.forEach.call(grupoEl(gi).querySelectorAll('tr[data-sub="' + gi + '-' + pi + '"]'), function (tr) { tr.hidden = !abrir; });
  }

  function crearOrdenRemota(pedido, responsable) {
    var payload = prepararOrden(S.intentos, {
      clave: pedido.clave, proveedor: pedido.proveedor, id_lineas: pedido.id_lineas, responsable: responsable, admin_key: S.key
    });
    return Docks.api.post(payload).then(function (r) {
      if (r && r.id_oc) return r;
      return Docks.api.confirm('getOperacion', payload.id_oc).then(function (c) {
        if (!c) {
          throw new Error('No pudimos confirmar si la orden ' + idCorto(payload.id_oc) + ' se creó. Tocá «Armar orden» de nuevo: se reintenta con el mismo número y no se duplica.');
        }
        return Docks.api.get('getOrdenes').then(function (r2) {
          var o = (r2.ordenes || []).filter(function (x) { return x.id_oc === payload.id_oc; })[0];
          return o || { id_oc: payload.id_oc, proveedor: payload.proveedor, texto_whatsapp: '', whatsapp_url: '' };
        }, function () {
          return { id_oc: payload.id_oc, proveedor: payload.proveedor, texto_whatsapp: '', whatsapp_url: '' };
        });
      });
    }).then(function (o) {
      cerrarIntento(S.intentos, pedido.clave);
      o.proveedor = o.proveedor || payload.proveedor;
      if (o.lineas === undefined) o.lineas = payload.id_lineas.length;
      return o;
    });
  }

  function armarOrden(btn) {
    var gi = Number(btn.getAttribute('data-g'));
    var g = S.grupos[gi];
    if (!g) return;
    var el = grupoEl(gi);
    var errEl = el.querySelector('[data-g-error]');
    var claveErr = texto(g.proveedor);
    function error(msg) { S.errGrupo[claveErr] = msg; errEl.textContent = msg; }
    error('');
    var respInput = $('cx-responsable');
    var responsable = texto(respInput.value);
    if (!responsable) {
      error('Escribí quién compra (arriba, en «Quién compra»).');
      respInput.focus();
      return;
    }
    Docks.store.set('responsable', responsable);
    var sel = lineasTildadas(g.lineas, S.desel);
    if (!sel.length) { error('Tildá al menos una línea.'); return; }

    var pedidos = [];
    if (!claveErr) {
      var porProv = {};
      var faltan = [];
      agregarPorProducto(sel).forEach(function (p) {
        var prov = S.asignar[p.clave];
        if (!prov) { faltan.push(p.producto + ' (' + p.unidad + ')'); return; }
        (porProv[prov] = porProv[prov] || []).push.apply(porProv[prov], p.id_lineas);
      });
      if (faltan.length) { error('Elegí proveedor para: ' + faltan.join(', ') + '. O destildá esos productos.'); return; }
      Object.keys(porProv).sort(cmpEs).forEach(function (prov) {
        pedidos.push({ clave: '\u0000sin|' + prov, proveedor: prov, id_lineas: porProv[prov] });
      });
    } else {
      pedidos.push({ clave: claveErr, proveedor: g.proveedor, id_lineas: sel.map(function (l) { return l.id_linea; }) });
    }

    ocupado(btn, pedidos.length > 1 ? 'Armando órdenes…' : 'Armando orden…', function () {
      var hechas = [];
      var fallas = [];
      return pedidos.reduce(function (p, ped) {
        return p.then(function () {
          return crearOrdenRemota(ped, responsable).then(function (o) { hechas.push(o); }, function (e) {
            fallas.push((pedidos.length > 1 ? ped.proveedor + ': ' : '') + mensaje(e));
          });
        });
      }, Promise.resolve()).then(function () {
        if (fallas.length) error(fallas.join(' '));
        if (hechas.length) {
          if (!fallas.length) delete S.errGrupo[claveErr];
          // Lo que queda del grupo vuelve a estar tildado por defecto.
          g.lineas.forEach(function (l) { delete S.desel[l.id_linea]; });
          abrirWA(hechas);
          S.ts.ordenes = 0;
          cargar('consolidado');
          cargar('ordenes');
        }
      });
    });
  }

  /* ---------- diálogo WhatsApp ---------- */
  function abrirWA(ordenes) {
    S.wa.cola = ordenes.slice();
    S.wa.idx = 0;
    mostrarWA();
    abrirDialogo($('dlg-wa'), $('dlg-wa-copiar'));
  }

  function mostrarWA() {
    var o = S.wa.cola[S.wa.idx];
    if (!o) return;
    var n = S.wa.cola.length;
    var cola = $('dlg-wa-cola');
    cola.hidden = n < 2;
    cola.textContent = 'Orden ' + (S.wa.idx + 1) + ' de ' + n;
    $('dlg-wa-titulo').textContent = 'Orden ' + idCorto(o.id_oc) + ' · ' + (o.proveedor || 'Proveedor');
    var sub = [o.id_oc];
    if (o.lineas !== undefined && o.lineas !== null) sub.push(o.lineas + (Number(o.lineas) === 1 ? ' línea' : ' líneas'));
    if (o.fecha_hora) sub.push(Docks.fechaCorta(o.fecha_hora));
    if (o.estado) sub.push(o.estado);
    $('dlg-wa-sub').textContent = sub.join(' · ');
    var txt = o.texto_whatsapp || '';
    var area = $('dlg-wa-texto');
    area.value = txt;
    var url = o.whatsapp_url || '';
    var abrir = $('dlg-wa-abrir');
    var aviso = $('dlg-wa-aviso');
    var avisoTxt = '';
    if (!txt) avisoTxt = 'La orden quedó registrada, pero no pudimos traer el mensaje. Abrilo después desde Órdenes → «Ver mensaje».';
    else if (!/wa\.me\/\d/.test(url)) avisoTxt = 'El proveedor no tiene WhatsApp cargado: al abrir WhatsApp, elegí el contacto a mano.';
    aviso.textContent = avisoTxt;
    aviso.hidden = !avisoTxt;
    $('dlg-wa-copiar').disabled = !txt;
    if (url) { abrir.href = url; abrir.removeAttribute('aria-disabled'); }
    else { abrir.removeAttribute('href'); abrir.setAttribute('aria-disabled', 'true'); }
    $('dlg-wa-listo').textContent = S.wa.idx < n - 1 ? 'Siguiente orden' : 'Listo';
  }

  function waListo() {
    if (S.wa.idx < S.wa.cola.length - 1) {
      S.wa.idx++;
      mostrarWA();
      $('dlg-wa-copiar').focus();
      return;
    }
    cerrarDialogo($('dlg-wa'));
  }

  /* ---------- cancelar líneas ---------- */
  function abrirCancelar(btn) {
    var gi = Number(btn.getAttribute('data-g'));
    var g = S.grupos[gi];
    if (!g) return;
    var sel = lineasTildadas(g.lineas, S.desel);
    if (!sel.length) return;
    S.cancelar = { ids: sel.map(function (l) { return l.id_linea; }), proveedor: g.proveedor };
    $('dlg-cancelar-resumen').textContent = 'Vas a cancelar ' + sel.length + (sel.length === 1 ? ' línea' : ' líneas') + ' de ' +
      (texto(g.proveedor) || 'productos sin proveedor') + '. Los locales las van a ver como canceladas.';
    $('dlg-cancelar-lista').innerHTML = sel.map(function (l) {
      return '<li>' + esc(l.producto) + ' — ' + fmtN(num(l.cantidad), l.unidad) + ' · ' + esc(l.local) + '</li>';
    }).join('');
    $('dlg-cancelar-motivo').value = '';
    setError($('dlg-cancelar-error'), '');
    abrirDialogo($('dlg-cancelar'), $('dlg-cancelar-motivo'));
  }

  function enviarCancelar(e) {
    e.preventDefault();
    var motivo = texto($('dlg-cancelar-motivo').value);
    var errEl = $('dlg-cancelar-error');
    if (!motivo) { setError(errEl, 'Escribí el motivo de la cancelación.'); $('dlg-cancelar-motivo').focus(); return; }
    setError(errEl, '');
    var c = S.cancelar;
    if (!c) return;
    ocupado($('dlg-cancelar-ok'), 'Cancelando…', function () {
      return Docks.api.post({ action: 'cancelarLineas', admin_key: S.key, id_lineas: c.ids, motivo: motivo }).then(function (r) {
        cerrarDialogo($('dlg-cancelar'));
        if (r) {
          var n = r.canceladas !== undefined ? Number(r.canceladas) : c.ids.length;
          Docks.toast(n === 1 ? 'Se canceló 1 línea' : 'Se cancelaron ' + n + ' líneas', 'ok');
        } else {
          Docks.toast('No pudimos confirmar la cancelación. Revisá la lista actualizada.', 'info');
        }
        c.ids.forEach(function (id) { delete S.desel[id]; });
        S.cancelar = null;
        cargar('consolidado');
      }, function (err) { setError(errEl, mensaje(err)); });
    });
  }

  /* =====================================================================
   * ÓRDENES
   * ===================================================================== */
  function renderOrdenes() {
    var body = $('cx-ordenes-body');
    var carga = estadoCarga('ordenes');
    if (carga) { body.innerHTML = carga; return; }
    var lista = (S.data.ordenes.ordenes || []).filter(function (o) { return !S.ordenesEstado || o.estado === S.ordenesEstado; });
    if (!lista.length) {
      body.innerHTML = bannerRefresco('ordenes') + vacioHtml(S.ordenesEstado ? 'No hay órdenes en estado «' + S.ordenesEstado + '»' : 'Todavía no hay órdenes',
        S.ordenesEstado ? '' : 'Las órdenes se arman desde Compras.');
      return;
    }
    body.innerHTML = bannerRefresco('ordenes') + '<div class="table-wrap cx-scroll"><table class="table"><thead><tr>' +
      '<th>Orden</th><th>Fecha</th><th>Proveedor</th><th>Locales</th><th>Estado</th><th class="r">Líneas</th><th class="r">Total estimado</th><th><span class="sr-only">Acciones</span></th>' +
      '</tr></thead><tbody>' + lista.map(function (o) {
        var locs = Array.isArray(o.locales) ? o.locales.join(', ') : texto(o.locales);
        return '<tr><td><span class="cx-id" title="' + esc(o.id_oc) + '">' + esc(idCorto(o.id_oc)) + '</span></td>' +
          '<td class="nowrap num">' + esc(Docks.fechaCorta(o.fecha_hora)) + '</td>' +
          '<td>' + esc(o.proveedor) + '</td>' +
          '<td class="small">' + esc(locs || '—') + '</td>' +
          '<td>' + badge(o.estado || 'Sin estado', ESTADO_OC[o.estado] || 'muted') + '</td>' +
          '<td class="r">' + fmtN(o.lineas) + '</td>' +
          '<td class="r">' + esc(formatoPesos(o.total_estimado)) + '</td>' +
          '<td class="nowrap"><button class="btn btn-sm" type="button" data-act="ver-mensaje" data-id="' + esc(o.id_oc) + '">Ver mensaje</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function verMensaje(btn) {
    var id = btn.getAttribute('data-id');
    var o = ((S.data.ordenes && S.data.ordenes.ordenes) || []).filter(function (x) { return x.id_oc === id; })[0];
    if (o) abrirWA([o]);
  }

  /* =====================================================================
   * FALTANTES
   * ===================================================================== */
  function renderFaltantes() {
    var body = $('cx-faltantes-body');
    var carga = estadoCarga('faltantes');
    if (carga) { body.innerHTML = carga; return; }
    var lista = (S.data.faltantes.lineas || []).slice().sort(function (a, b) {
      return cmpEs(b.fecha_recepcion, a.fecha_recepcion) || cmpEs(a.proveedor, b.proveedor);
    });
    if (!lista.length) {
      body.innerHTML = bannerRefresco('faltantes') + vacioHtml('No hubo faltantes en los últimos ' + S.faltDias + ' días', 'Cuando un local reciba menos de lo pedido, la línea aparece acá.');
      return;
    }
    body.innerHTML = bannerRefresco('faltantes') + '<div class="table-wrap cx-scroll"><table class="table"><thead><tr>' +
      '<th>Local</th><th>Proveedor</th><th>Producto</th><th class="r">Pedido</th><th class="r">Recibido</th><th class="r">Diferencia</th><th>Recepción</th><th>Orden</th>' +
      '</tr></thead><tbody>' + lista.map(function (l) {
        var ped = num(l.cantidad);
        var rec = num(l.cantidad_recibida);
        var dif = ped === null ? null : redondear(ped - (rec || 0));
        return '<tr><td>' + esc(l.local) + '</td><td>' + esc(l.proveedor || '—') + '</td><td class="cx-prod">' + esc(l.producto) + '</td>' +
          '<td class="r">' + fmtN(ped, l.unidad) + '</td><td class="r">' + fmtN(rec === null ? 0 : rec, l.unidad) + '</td>' +
          '<td class="r cx-dif">' + (dif === null ? '—' : '−' + fmtN(dif, l.unidad)) + '</td>' +
          '<td class="nowrap num">' + esc(Docks.fechaCorta(l.fecha_recepcion)) + '</td>' +
          '<td><span class="cx-id" title="' + esc(l.id_oc) + '">' + esc(idCorto(l.id_oc) || '—') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* =====================================================================
   * STOCK
   * ===================================================================== */
  function renderStock() {
    var body = $('cx-stock-body');
    var carga = estadoCarga('stock');
    if (carga) { body.innerHTML = carga; return; }
    var todas = S.data.stock.filas || [];
    var q = Docks.norm(S.stockQ);
    var base = todas.filter(function (f) {
      return (!S.stockLocal || f.local === S.stockLocal) &&
        (!q || Docks.norm(f.producto + ' ' + (f.categoria || '') + ' ' + (f.codigo || '')).indexOf(q) > -1);
    });
    var conteo = {};
    base.forEach(function (f) { conteo[f.estado] = (conteo[f.estado] || 0) + 1; });
    var filas = ordenarStock(base.filter(function (f) { return !S.stockEstado || f.estado === S.stockEstado; }));
    var resumen = '<div class="cx-resumen" aria-label="Resumen por estado">' + Object.keys(GRAVEDAD).map(function (k) {
      return conteo[k] ? badge(ESTADO_STOCK[k].texto + ': ' + conteo[k], ESTADO_STOCK[k].clase) : '';
    }).join('') + '</div>';
    if (!filas.length) {
      body.innerHTML = bannerRefresco('stock') + resumen + vacioHtml(todas.length ? 'No hay productos con estos filtros' : 'Todavía no hay productos en el catálogo',
        todas.length ? '' : 'Cargá el catálogo para ver el stock contra el par.');
      return;
    }
    body.innerHTML = bannerRefresco('stock') + resumen + '<div class="table-wrap cx-scroll"><table class="table"><thead><tr>' +
      '<th>Local</th><th>Producto</th><th>Categoría</th><th class="r">Stock</th><th class="r">Par</th><th class="r">Pedido abierto</th><th class="r">Sugerido</th><th>Último conteo</th><th>Estado</th>' +
      '</tr></thead><tbody>' + filas.map(function (f) {
        var dias = f.dias_sin_contar !== undefined && f.dias_sin_contar !== null ? num(f.dias_sin_contar) : Docks.haceDias(f.ultimo_conteo);
        var viejo = dias === null || dias > 7;
        var est = ESTADO_STOCK[f.estado] || { texto: f.estado || '—', clase: 'muted' };
        var sug = f.estado === 'SIN_PAR' || f.estado === 'SIN_CONTEO' ? null : f.sugerido;
        return '<tr><td>' + esc(f.local) + '</td><td class="cx-prod">' + esc(f.producto) + '</td><td>' + esc(f.categoria || '—') + '</td>' +
          '<td class="r">' + fmtN(f.stock_actual, f.stock_actual === null ? '' : f.unidad) + '</td>' +
          '<td class="r">' + fmtN(f.par, f.par === null ? '' : f.unidad) + '</td>' +
          '<td class="r">' + (num(f.pedido_abierto) ? fmtN(f.pedido_abierto, f.unidad) : '<span class="muted">0</span>') + '</td>' +
          '<td class="r"><strong>' + fmtN(sug, sug === null || sug === undefined ? '' : f.unidad) + '</strong></td>' +
          '<td class="nowrap' + (viejo ? ' cx-amb' : '') + '" title="' + esc(f.ultimo_conteo ? Docks.fechaCorta(f.ultimo_conteo) : 'Sin conteo') + '">' + esc(haceTexto(dias)) + '</td>' +
          '<td>' + badge(est.texto, est.clase) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* =====================================================================
   * CATÁLOGO
   * ===================================================================== */
  function llenarSelectoresLocales() {
    var locs = locales();
    var ops = locs.map(function (l) { return '<option value="' + esc(l.local) + '">' + esc(l.local) + (esActivo(l.activo) ? '' : ' (inactivo)') + '</option>'; }).join('');
    $('cx-stock-local').innerHTML = '<option value="">Todos los locales</option>' + ops;
    $('cx-stock-local').value = S.stockLocal;
    $('cx-cat-local').innerHTML = '<option value="">Todos los locales</option>' + ops;
    $('cx-cat-local').value = S.catLocal;
    $('dl-proveedores').innerHTML = proveedores().map(function (p) { return '<option value="' + esc(p.proveedor) + '"></option>'; }).join('');
  }

  function productos() { return (S.data.catalogo && S.data.catalogo.productos) || []; }

  function renderCatalogo() {
    var body = $('cx-catalogo-body');
    var carga = estadoCarga('catalogo');
    if (carga) { body.innerHTML = carga; return; }
    var todos = productos();
    var q = Docks.norm(S.catQ);
    var lista = todos.filter(function (p) {
      if (S.catLocal && p.local !== S.catLocal) return false;
      if (S.catFiltro === 'sin_proveedor' && texto(p.proveedor)) return false;
      if ((S.catFiltro === 'Activo' || S.catFiltro === 'Inactivo') && (p.estado || 'Activo') !== S.catFiltro) return false;
      if (q && Docks.norm([p.codigo, p.producto, p.categoria, p.proveedor].join(' ')).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return cmpEs(a.producto, b.producto) || cmpEs(a.local, b.local); });
    var conLocal = !S.catLocal;
    if (!todos.length) {
      body.innerHTML = bannerRefresco('catalogo') + vacioHtml('El catálogo está vacío', 'Cargá productos con «Nuevo producto» o pegá un rango con «Pegar desde Excel».');
      return;
    }
    if (!lista.length) {
      body.innerHTML = bannerRefresco('catalogo') + vacioHtml('No hay productos con estos filtros', 'Probá con otra búsqueda o con «Todos los locales».');
      return;
    }
    body.innerHTML = bannerRefresco('catalogo') + '<p class="small muted">' + lista.length + (lista.length === 1 ? ' producto' : ' productos') +
      (lista.length !== todos.length ? ' de ' + todos.length : '') + '</p>' +
      '<div class="table-wrap cx-scroll"><table class="table"><thead><tr>' +
      '<th>Código</th><th>Producto</th>' + (conLocal ? '<th>Local</th>' : '') + '<th>Categoría</th><th>Unidad</th><th>Proveedor</th><th class="r">Precio</th><th class="r">Par</th><th>Estado</th>' +
      '</tr></thead><tbody>' + lista.map(function (p) {
        var activo = (p.estado || 'Activo') === 'Activo';
        return '<tr class="cx-click' + (activo ? '' : ' is-off') + '" tabindex="0" data-act="editar-producto" data-i="' + todos.indexOf(p) + '" aria-label="Editar ' + esc(p.producto) + ' de ' + esc(p.local) + '">' +
          '<td class="cx-id">' + esc(p.codigo || '—') + '</td><td class="cx-prod">' + esc(p.producto) + '</td>' +
          (conLocal ? '<td>' + esc(p.local) + '</td>' : '') +
          '<td>' + esc(p.categoria || '—') + '</td><td>' + esc(p.unidad) + '</td>' +
          '<td>' + (texto(p.proveedor) ? esc(p.proveedor) : badge('Sin proveedor', 'warn')) + '</td>' +
          '<td class="r">' + esc(formatoPesos(p.precio)) + '</td><td class="r">' + fmtN(p.par) + '</td>' +
          '<td>' + badge(activo ? 'Activo' : 'Inactivo', activo ? 'ok' : 'muted') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function llenarDatalistCategorias() {
    var vistas = {};
    var cats = [];
    productos().forEach(function (p) { var c = texto(p.categoria); if (c && !vistas[Docks.norm(c)]) { vistas[Docks.norm(c)] = true; cats.push(c); } });
    cats.sort(cmpEs);
    $('dl-categorias').innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('');
  }

  function opcionesLocales(elegido, soloActivos) {
    return locales().filter(function (l) { return !soloActivos || esActivo(l.activo) || l.local === elegido; }).map(function (l) {
      return '<option value="' + esc(l.local) + '"' + (l.local === elegido ? ' selected' : '') + '>' + esc(l.local) + '</option>';
    }).join('');
  }

  function abrirProducto(p) {
    S.editProducto = p || null;
    llenarDatalistCategorias();
    var localDef = p ? p.local : (S.catLocal || ((locales().filter(function (l) { return esActivo(l.activo); })[0] || {}).local || ''));
    var selLocal = $('fp-local');
    selLocal.innerHTML = opcionesLocales(localDef, !p);
    selLocal.value = localDef;
    selLocal.disabled = !!p;
    var unidades = Docks.UNIDADES.slice();
    if (p && p.unidad && unidades.indexOf(p.unidad) < 0) unidades.push(p.unidad);
    $('fp-unidad').innerHTML = (p ? '' : '<option value="">Elegir…</option>') + unidades.map(function (u) { return '<option>' + esc(u) + '</option>'; }).join('');
    $('fp-unidad').value = p ? p.unidad : '';
    $('dlg-producto-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
    var cod = $('dlg-producto-codigo');
    cod.hidden = !p;
    cod.textContent = p ? 'Código ' + (p.codigo || '—') + ' · ' + p.local + '. El stock no se modifica desde acá.' : '';
    $('fp-producto').value = p ? p.producto : '';
    $('fp-categoria').value = p ? (p.categoria || '') : '';
    $('fp-proveedor').value = p ? (p.proveedor || '') : '';
    $('fp-precio').value = p && p.precio !== null && p.precio !== undefined ? String(p.precio).replace('.', ',') : '';
    $('fp-par').value = p && p.par !== null && p.par !== undefined ? String(p.par).replace('.', ',') : '';
    $('fp-estado').value = p ? (p.estado || 'Activo') : 'Activo';
    avisoProveedor();
    setError($('fp-error'), '');
    abrirDialogo($('dlg-producto'), $('fp-producto'));
  }

  function avisoProveedor() {
    var v = texto($('fp-proveedor').value);
    $('fp-proveedor-aviso').hidden = !v || !!buscarProveedor(v) || !S.data.boot;
  }

  function upsertProducto(p) {
    if (!S.data.catalogo || !p) return;
    var lista = S.data.catalogo.productos = S.data.catalogo.productos || [];
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].local === p.local && lista[i].codigo === p.codigo) { lista[i] = p; return; }
    }
    lista.push(p);
    S.cont.catalogo = lista.length;
    actualizarContadores();
  }

  function enviarProducto(e) {
    e.preventDefault();
    var errEl = $('fp-error');
    var orig = S.editProducto;
    var local = $('fp-local').value;
    var producto = texto($('fp-producto').value);
    var unidad = $('fp-unidad').value;
    var precioTxt = texto($('fp-precio').value);
    var parTxt = texto($('fp-par').value);
    var precio = parsearMonto(precioTxt);
    var par = num(parTxt);
    var falta = !local ? ['Elegí el local.', 'fp-local'] : !producto ? ['Escribí el nombre del producto.', 'fp-producto'] :
      !unidad ? ['Elegí la unidad.', 'fp-unidad'] : (precioTxt && (precio === null || precio < 0)) ? ['El precio no es un número válido.', 'fp-precio'] :
        (parTxt && (par === null || par < 0)) ? ['El par no es un número válido.', 'fp-par'] : null;
    if (falta) { setError(errEl, falta[0]); $(falta[1]).focus(); return; }
    setError(errEl, '');
    var provTxt = texto($('fp-proveedor').value);
    var prov = buscarProveedor(provTxt);
    var payload = {
      action: 'saveProducto', admin_key: S.key, local: local, producto: producto,
      categoria: texto($('fp-categoria').value), unidad: unidad, proveedor: prov ? prov.proveedor : provTxt,
      precio: precioTxt ? precio : null, par: parTxt ? par : null, estado: $('fp-estado').value
    };
    if (orig && orig.codigo) payload.codigo = orig.codigo;
    ocupado($('fp-guardar'), 'Guardando…', function () {
      return Docks.api.post(payload).then(function (r) {
        if (r && r.producto && typeof r.producto === 'object') {
          upsertProducto(r.producto);
          return true;
        }
        // Sin respuesta legible: se confirma releyendo el catálogo.
        S.ts.catalogo = 0;
        return cargar('catalogo').then(function () {
          return productos().some(function (p) {
            return p.local === local && (payload.codigo ? p.codigo === payload.codigo : claveProducto(p.producto, p.unidad) === claveProducto(producto, unidad));
          });
        });
      }).then(function (ok) {
        if (!ok) { setError(errEl, 'No pudimos confirmar el guardado. Revisá la conexión y probá de nuevo.'); return; }
        cerrarDialogo($('dlg-producto'));
        Docks.toast(orig ? 'Producto actualizado' : 'Producto creado', 'ok');
        renderCatalogo();
        S.ts.stock = 0;
      }, function (err) { setError(errEl, mensaje(err)); });
    });
  }

  /* ---------- pegar desde Excel ---------- */
  function ejemploHtml(tipo) {
    var cols = COLUMNAS[tipo];
    var ej = tipo === 'productos' ?
      [['Asado', 'Carnes', 'kg', 'Distribuidora Florida', '8500', '12'], ['Tomate', 'Verdulería', 'kg', '', '1200,50', '5,5']] :
      [['Distribuidora Florida', 'Marcela', '5491112345678', 'ventas@ejemplo.com', 'martes y viernes', '50000']];
    return '<div><strong>Formato esperado:</strong> columnas en este orden, separadas por tabulación (es lo que sale al copiar celdas de Excel o Google Sheets). ' +
      'La fila de encabezado es opcional; si está, las columnas pueden venir en cualquier orden. Se acepta coma decimal.' +
      (tipo === 'productos' ? ' Unidades válidas: ' + esc(Docks.UNIDADES.join(', ')) + '.' : ' WhatsApp con código de país.') +
      '<div class="cx-ejemplo" aria-label="Ejemplo"><table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c.titulo) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + ej.map(function (f) { return '<tr>' + f.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></div>';
  }

  function abrirPegar(tipo) {
    S.pegar = { tipo: tipo, res: null };
    $('dlg-pegar-titulo').textContent = tipo === 'productos' ? 'Pegar productos desde Excel' : 'Pegar proveedores desde Excel';
    $('dlg-pegar-ayuda').innerHTML = ejemploHtml(tipo);
    var lf = $('dlg-pegar-local-field');
    lf.hidden = tipo !== 'productos';
    if (tipo === 'productos') {
      var def = S.catLocal || ((locales().filter(function (l) { return esActivo(l.activo); })[0] || {}).local || '');
      $('dlg-pegar-local').innerHTML = opcionesLocales(def, true);
      $('dlg-pegar-local').value = def;
    }
    $('dlg-pegar-texto').value = '';
    $('dlg-pegar-preview').innerHTML = '';
    $('dlg-pegar-resultado').innerHTML = '';
    setError($('dlg-pegar-error'), '');
    actualizarBotonPegar();
    abrirDialogo($('dlg-pegar'), $('dlg-pegar-texto'));
  }

  function existentesPegado() {
    var set = {};
    if (S.pegar.tipo === 'productos') {
      var local = $('dlg-pegar-local').value;
      productos().forEach(function (p) { if (p.local === local) set[claveProducto(p.producto, p.unidad)] = true; });
    } else {
      proveedores().forEach(function (p) { set[Docks.norm(p.proveedor)] = true; });
    }
    return set;
  }

  function previsualizar() {
    var tipo = S.pegar.tipo;
    var res = parsearPegado($('dlg-pegar-texto').value, tipo);
    S.pegar.res = res;
    var prev = $('dlg-pegar-preview');
    if (!res.filas.length) {
      prev.innerHTML = res.aviso ? '<p class="cx-aviso-warn">' + esc(res.aviso) + '</p>' : '';
      actualizarBotonPegar();
      return;
    }
    var existe = existentesPegado();
    var cols = COLUMNAS[tipo];
    var nuevas = 0;
    var act = 0;
    res.filas.forEach(function (f) {
      f.avisos = [];
      if (f.errores.length) return;
      var k = tipo === 'productos' ? claveProducto(f.datos.producto, f.datos.unidad) : Docks.norm(f.datos.proveedor);
      if (existe[k]) { f.avisos.push('Ya existe: se actualiza'); act++; } else nuevas++;
      if (tipo === 'productos' && f.datos.proveedor && S.data.boot && !buscarProveedor(f.datos.proveedor)) f.avisos.push('Proveedor no cargado');
    });
    var celda = function (f, c) {
      var v = f.datos[c.k];
      if (c.k === 'precio' || c.k === 'pedido_minimo') return '<td class="r">' + (v === null ? '' : esc(formatoPesos(v))) + '</td>';
      if (c.k === 'par') return '<td class="r">' + (v === null ? '' : fmtN(v)) + '</td>';
      return '<td>' + esc(v) + '</td>';
    };
    prev.innerHTML = '<div class="cx-prev">' +
      (res.aviso ? '<p class="cx-aviso-warn">' + esc(res.aviso) + '</p>' : '') +
      '<div class="cx-prev-resumen">' + badge(res.filas.length + (res.filas.length === 1 ? ' fila' : ' filas'), 'muted') +
      (nuevas ? badge(nuevas + (nuevas === 1 ? ' nueva' : ' nuevas'), 'ok') : '') +
      (act ? badge(act + ' a actualizar', 'info') : '') +
      (res.conErrores ? badge(res.conErrores + (res.conErrores === 1 ? ' con error' : ' con errores'), 'bad') : '') +
      badge(res.encabezado ? 'Con encabezado' : 'Sin encabezado', 'muted') + '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th class="r">Fila</th>' +
      cols.map(function (c) { return '<th' + (c.k === 'precio' || c.k === 'par' || c.k === 'pedido_minimo' ? ' class="r"' : '') + '>' + esc(c.titulo) + '</th>'; }).join('') +
      '<th>Estado</th></tr></thead><tbody>' + res.filas.map(function (f) {
        var bad = f.errores.length > 0;
        return '<tr' + (bad ? ' class="is-bad"' : '') + '><td class="r">' + f.fila + '</td>' + cols.map(function (c) { return celda(f, c); }).join('') +
          '<td>' + (bad ? '<strong class="cx-act-error">Error: ' + esc(f.errores.join('. ')) + '</strong>' :
            badge('OK', 'ok') + (f.avisos.length ? ' <span class="small muted">' + esc(f.avisos.join(' · ')) + '</span>' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    actualizarBotonPegar();
  }

  function actualizarBotonPegar() {
    var btn = $('dlg-pegar-ok');
    if (btn.dataset.busy) return;
    var n = S.pegar.res ? S.pegar.res.validas.length : 0;
    var nombre = S.pegar.tipo === 'productos' ? (n === 1 ? 'producto' : 'productos') : (n === 1 ? 'proveedor' : 'proveedores');
    btn.textContent = n ? 'Cargar ' + n + ' ' + nombre : 'Cargar';
    btn.disabled = !n;
  }

  function enviarPegar(e) {
    e.preventDefault();
    var res = S.pegar.res;
    if (!res || !res.validas.length) return;
    setError($('dlg-pegar-error'), '');
    var btn = $('dlg-pegar-ok');
    var p = S.pegar.tipo === 'productos' ? cargarProductosLote(btn, res) : cargarProveedoresSerie(btn, res);
    p.then(actualizarBotonPegar);
  }

  function cargarProductosLote(btn, res) {
    var local = $('dlg-pegar-local').value;
    if (!local) { setError($('dlg-pegar-error'), 'Elegí el local donde se cargan los productos.'); return Promise.resolve(); }
    var filas = res.validas.map(function (d) {
      var prov = buscarProveedor(d.proveedor);
      return { producto: d.producto, categoria: d.categoria, unidad: d.unidad, proveedor: prov ? prov.proveedor : d.proveedor, precio: d.precio, par: d.par };
    });
    return ocupado(btn, 'Cargando ' + filas.length + '…', function () {
      return Docks.api.post({ action: 'saveProductosLote', admin_key: S.key, local: local, filas: filas }).then(function (r) {
        var out = $('dlg-pegar-resultado');
        if (!r) {
          out.innerHTML = '<div class="banner banner-warn">No pudimos confirmar la carga. Revisá el catálogo: si faltan productos, volvé a cargarlos (los que ya existen se actualizan, no se duplican).</div>';
        } else {
          var errs = r.errores || [];
          out.innerHTML = '<div class="banner ' + (errs.length ? 'banner-warn' : 'banner-ok') + '"><div><strong>Carga terminada en ' + esc(local) + ':</strong> ' +
            Number(r.creados || 0) + ' creados, ' + Number(r.actualizados || 0) + ' actualizados' + (errs.length ? ', ' + errs.length + ' con error' : '') + '.' +
            (errs.length ? '<ul class="cx-res-lista">' + errs.map(function (er) {
              var d = filas[Number(er.fila) - 1];
              return '<li>Fila ' + esc(er.fila) + (d ? ' (' + esc(d.producto) + ')' : '') + ': ' + esc(er.error) + '</li>';
            }).join('') + '</ul>' : '') + '</div></div>';
          $('dlg-pegar-texto').value = '';
          $('dlg-pegar-preview').innerHTML = '';
          S.pegar.res = null;
        }
        S.ts.catalogo = 0; S.ts.stock = 0;
        cargar('catalogo');
      }, function (err) { setError($('dlg-pegar-error'), mensaje(err)); });
    });
  }

  function cargarProveedoresSerie(btn, res) {
    var lista = res.validas.slice();
    var out = $('dlg-pegar-resultado');
    var ok = 0;
    var sinConfirmar = [];
    var errores = [];
    var cortado = false;
    function progreso(i) {
      out.innerHTML = '<p class="small">Cargando ' + Math.min(i + 1, lista.length) + ' de ' + lista.length + '…</p>' +
        '<progress class="cx-progreso" max="' + lista.length + '" value="' + i + '">' + i + ' de ' + lista.length + '</progress>';
    }
    return ocupado(btn, 'Cargando…', function () {
      return lista.reduce(function (p, d, i) {
        return p.then(function () {
          if (cortado) return null;
          progreso(i);
          var ex = buscarProveedor(d.proveedor);
          var payload = {
            action: 'saveProveedor', admin_key: S.key, proveedor: ex ? ex.proveedor : d.proveedor, contacto: d.contacto, whatsapp: d.whatsapp,
            email: d.email, dias_entrega: d.dias_entrega, pedido_minimo: d.pedido_minimo, activo: ex ? (esActivo(ex.activo) ? 'SÍ' : 'NO') : 'SÍ'
          };
          return Docks.api.post(payload).then(function (r) {
            if (r) ok++; else sinConfirmar.push(d.proveedor);
          }, function (err) {
            errores.push(d.proveedor + ': ' + mensaje(err));
            if (/clave|admin/i.test(mensaje(err))) cortado = true;
          });
        });
      }, Promise.resolve()).then(function () {
        var hayProblemas = errores.length || sinConfirmar.length;
        out.innerHTML = '<div class="banner ' + (hayProblemas ? 'banner-warn' : 'banner-ok') + '"><div><strong>Carga terminada:</strong> ' + ok + ' de ' + lista.length + ' proveedores guardados.' +
          (sinConfirmar.length ? '<p class="small">Sin confirmar (revisá la lista y, si faltan, volvé a cargarlos): ' + esc(sinConfirmar.join(', ')) + '</p>' : '') +
          (errores.length ? '<ul class="cx-res-lista">' + errores.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
          (cortado ? '<p class="small">Se frenó la carga por un problema con la clave.</p>' : '') + '</div></div>';
        if (!hayProblemas) {
          $('dlg-pegar-texto').value = '';
          $('dlg-pegar-preview').innerHTML = '';
          S.pegar.res = null;
        }
        cargar('boot');
      });
    });
  }

  /* =====================================================================
   * PROVEEDORES
   * ===================================================================== */
  function renderProveedores() {
    var body = $('cx-proveedores-body');
    var carga = estadoCarga('proveedores');
    if (carga) { body.innerHTML = carga; return; }
    var todos = proveedores();
    var q = Docks.norm(S.provQ);
    var lista = todos.filter(function (p) { return !q || Docks.norm([p.proveedor, p.contacto, p.email, p.whatsapp].join(' ')).indexOf(q) > -1; })
      .slice().sort(function (a, b) { return (esActivo(b.activo) - esActivo(a.activo)) || cmpEs(a.proveedor, b.proveedor); });
    if (!todos.length) {
      body.innerHTML = bannerRefresco('proveedores') + vacioHtml('Todavía no hay proveedores', 'Cargalos con «Nuevo proveedor» o pegá un rango con «Pegar desde Excel».');
      return;
    }
    if (!lista.length) { body.innerHTML = vacioHtml('No hay proveedores que coincidan con la búsqueda'); return; }
    var cuenta = {};
    var hayCat = !!S.data.catalogo;
    productos().forEach(function (p) { var k = Docks.norm(p.proveedor); if (k) cuenta[k] = (cuenta[k] || 0) + 1; });
    body.innerHTML = bannerRefresco('proveedores') + '<div class="table-wrap cx-scroll"><table class="table"><thead><tr>' +
      '<th>Proveedor</th><th>Contacto</th><th>WhatsApp</th><th>Email</th><th>Días de entrega</th><th class="r">Pedido mínimo</th>' +
      (hayCat ? '<th class="r">Productos</th>' : '') + '<th>Estado</th></tr></thead><tbody>' +
      lista.map(function (p) {
        var activo = esActivo(p.activo);
        return '<tr class="cx-click' + (activo ? '' : ' is-off') + '" tabindex="0" data-act="editar-proveedor" data-i="' + todos.indexOf(p) + '" aria-label="Editar ' + esc(p.proveedor) + '">' +
          '<td class="cx-prod">' + esc(p.proveedor) + '</td><td>' + esc(p.contacto || '—') + '</td>' +
          '<td class="num nowrap">' + (texto(p.whatsapp) ? esc(p.whatsapp) : '<span class="cx-amb">Sin WhatsApp</span>') + '</td>' +
          '<td>' + esc(p.email || '—') + '</td><td>' + esc(p.dias_entrega || '—') + '</td>' +
          '<td class="r">' + (num(p.pedido_minimo) ? esc(formatoPesos(p.pedido_minimo)) : '<span class="muted">Sin mínimo</span>') + '</td>' +
          (hayCat ? '<td class="r">' + (cuenta[Docks.norm(p.proveedor)] || 0) + '</td>' : '') +
          '<td>' + badge(activo ? 'Activo' : 'Inactivo', activo ? 'ok' : 'muted') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function abrirProveedor(p) {
    S.editProveedor = p || null;
    $('dlg-proveedor-titulo').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
    var nombre = $('fv-proveedor');
    nombre.value = p ? p.proveedor : '';
    nombre.readOnly = !!p;
    nombre.title = p ? 'Para cambiar el nombre, creá un proveedor nuevo y desactivá este.' : '';
    $('fv-contacto').value = p ? (p.contacto || '') : '';
    $('fv-whatsapp').value = p ? (p.whatsapp || '') : '';
    $('fv-email').value = p ? (p.email || '') : '';
    $('fv-dias').value = p ? (p.dias_entrega || '') : '';
    $('fv-minimo').value = p && num(p.pedido_minimo) !== null ? String(p.pedido_minimo) : '';
    $('fv-activo').checked = p ? esActivo(p.activo) : true;
    $('fv-obs').value = p ? (p.observaciones || '') : '';
    setError($('fv-error'), '');
    abrirDialogo($('dlg-proveedor'), p ? $('fv-contacto') : nombre);
  }

  function enviarProveedor(e) {
    e.preventDefault();
    var errEl = $('fv-error');
    var orig = S.editProveedor;
    var nombre = texto($('fv-proveedor').value);
    var waTxt = texto($('fv-whatsapp').value);
    var wa = waTxt.replace(/\D/g, '');
    var email = texto($('fv-email').value);
    var minTxt = texto($('fv-minimo').value);
    var minimo = parsearMonto(minTxt);
    var falta = !nombre ? ['Escribí el nombre del proveedor.', 'fv-proveedor'] :
      (!orig && buscarProveedor(nombre)) ? ['Ya existe un proveedor con ese nombre. Editalo desde la lista.', 'fv-proveedor'] :
        (waTxt && (wa.length < 10 || wa.length > 15)) ? ['El WhatsApp tiene que tener código de país, ej. 5491112345678.', 'fv-whatsapp'] :
          (email && !validoEmail(email)) ? ['El email no es válido.', 'fv-email'] :
            (minTxt && (minimo === null || minimo < 0)) ? ['El pedido mínimo no es un número válido.', 'fv-minimo'] : null;
    if (falta) { setError(errEl, falta[0]); $(falta[1]).focus(); return; }
    setError(errEl, '');
    var payload = {
      action: 'saveProveedor', admin_key: S.key, proveedor: nombre, contacto: texto($('fv-contacto').value), whatsapp: wa, email: email,
      dias_entrega: texto($('fv-dias').value), pedido_minimo: minTxt ? minimo : null, activo: $('fv-activo').checked ? 'SÍ' : 'NO'
    };
    // getBootstrap no devuelve observaciones: se envían sólo si se conocen o se escribieron, para no borrarlas.
    var obs = texto($('fv-obs').value);
    if (obs || (orig && orig.observaciones !== undefined)) payload.observaciones = obs;
    ocupado($('fv-guardar'), 'Guardando…', function () {
      return Docks.api.post(payload).then(function (r) {
        S.ts.boot = 0;
        return cargar('boot').then(function () { return !!r || !!buscarProveedor(nombre); });
      }).then(function (ok) {
        if (!ok) { setError(errEl, 'No pudimos confirmar el guardado. Revisá la conexión y probá de nuevo.'); return; }
        cerrarDialogo($('dlg-proveedor'));
        Docks.toast(orig ? 'Proveedor actualizado' : 'Proveedor creado', 'ok');
      }, function (err) { setError(errEl, mensaje(err)); });
    });
  }

  /* =====================================================================
   * LOCALES
   * ===================================================================== */
  function renderLocales() {
    var body = $('cx-locales-body');
    var carga = estadoCarga('locales');
    if (carga) { body.innerHTML = carga; return; }
    var lista = locales();
    if (!lista.length) { body.innerHTML = vacioHtml('No hay locales', 'Los locales se crean al preparar la planilla V3 (setupV3).'); return; }
    body.innerHTML = bannerRefresco('locales') + '<div class="table-wrap cx-scroll"><table class="table"><thead><tr>' +
      '<th>Local</th><th>Estado</th><th>Encargados</th><th>Día de pedido</th><th>Hora de corte</th><th>Prefijo</th></tr></thead><tbody>' +
      lista.map(function (l, i) {
        var activo = esActivo(l.activo);
        var enc = listaEncargados(l.encargados);
        return '<tr class="cx-click' + (activo ? '' : ' is-off') + '" tabindex="0" data-act="editar-local" data-i="' + i + '" aria-label="Editar ' + esc(l.local) + '">' +
          '<td class="cx-prod">' + esc(l.local) + '</td><td>' + badge(activo ? 'Activo' : 'Inactivo', activo ? 'ok' : 'muted') + '</td>' +
          '<td>' + (enc.length ? '<span class="cx-tags">' + enc.map(function (n) { return badge(n, 'muted'); }).join('') + '</span>' : '<span class="muted">Sin encargados</span>') + '</td>' +
          '<td>' + esc(l.dia_pedido || '—') + '</td><td class="num">' + esc(horaHHMM(l.hora_corte) || '—') + '</td>' +
          '<td class="cx-id">' + esc(l.prefijo || '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderChips() {
    var ul = $('fl-encargados');
    if (!S.encargados.length) { ul.innerHTML = '<li class="is-vacio">Sin encargados</li>'; return; }
    ul.innerHTML = S.encargados.map(function (n, i) {
      return '<li>' + esc(n) + '<button type="button" data-quitar="' + i + '" aria-label="Quitar a ' + esc(n) + '">×</button></li>';
    }).join('');
  }

  function abrirLocal(l) {
    S.editLocal = l;
    S.encargados = listaEncargados(l.encargados);
    $('dlg-local-titulo').textContent = l.local;
    $('fl-activo').checked = esActivo(l.activo);
    $('fl-dia').value = l.dia_pedido || 'Lunes';
    $('fl-hora').value = horaHHMM(l.hora_corte);
    $('fl-enc-nuevo').value = '';
    renderChips();
    setError($('fl-error'), '');
    abrirDialogo($('dlg-local'), $('fl-activo'));
  }

  function agregarEncargado() {
    var inp = $('fl-enc-nuevo');
    var n = texto(inp.value).replace(/\s+/g, ' ');
    if (!n) { inp.focus(); return; }
    if (!S.encargados.some(function (x) { return Docks.norm(x) === Docks.norm(n); })) S.encargados.push(n);
    inp.value = '';
    renderChips();
    inp.focus();
  }

  function enviarLocal(e) {
    e.preventDefault();
    var l = S.editLocal;
    if (!l) return;
    var errEl = $('fl-error');
    var pendiente = texto($('fl-enc-nuevo').value);
    if (pendiente) agregarEncargado();
    var hora = $('fl-hora').value;
    if (!/^\d{2}:\d{2}$/.test(hora)) { setError(errEl, 'Elegí la hora de corte.'); $('fl-hora').focus(); return; }
    setError(errEl, '');
    var payload = {
      action: 'saveLocal', admin_key: S.key, local: l.local, activo: $('fl-activo').checked ? 'SÍ' : 'NO',
      encargados: S.encargados.slice(), dia_pedido: $('fl-dia').value, hora_corte: hora
    };
    ocupado($('fl-guardar'), 'Guardando…', function () {
      return Docks.api.post(payload).then(function (r) {
        S.ts.boot = 0;
        return cargar('boot').then(function () {
          if (r) return true;
          var nuevo = locales().filter(function (x) { return x.local === l.local; })[0];
          return !!nuevo && horaHHMM(nuevo.hora_corte) === hora && nuevo.dia_pedido === payload.dia_pedido &&
            esActivo(nuevo.activo) === (payload.activo === 'SÍ');
        });
      }).then(function (ok) {
        if (!ok) { setError(errEl, 'No pudimos confirmar el guardado. Revisá la conexión y probá de nuevo.'); return; }
        cerrarDialogo($('dlg-local'));
        Docks.toast('Local actualizado', 'ok');
      }, function (err) { setError(errEl, mensaje(err)); });
    });
  }

  /* =====================================================================
   * Acceso, eventos e inicio
   * ===================================================================== */
  function mostrarLogin() {
    $('cx-app').hidden = true;
    $('cx-acceso').hidden = false;
    var sinApi = !Docks.api.configured();
    $('cx-sin-api').hidden = !sinApi;
    $('cx-clave').disabled = sinApi;
    $('cx-entrar').disabled = sinApi;
    if (!sinApi) setTimeout(function () { $('cx-clave').focus(); }, 0);
  }

  function entrarApp() {
    $('cx-acceso').hidden = true;
    $('cx-app').hidden = false;
    llenarSemanas();
    $('cx-responsable').value = Docks.store.get('responsable', '') || '';
    rutear(false);
    // Contadores de las demás secciones, de a una para no saturar la planilla.
    ['boot', 'consolidado', 'ordenes', 'faltantes', 'stock', 'catalogo'].reduce(function (p, k) {
      return p.then(function () { return S.data[k] || S.cargando[k] ? S.cargando[k] : cargar(k); });
    }, Promise.resolve());
  }

  function login(e) {
    e.preventDefault();
    var clave = $('cx-clave').value;
    var errEl = $('cx-login-error');
    if (!clave) { setError(errEl, 'Escribí la clave de administración.'); $('cx-clave').focus(); return; }
    setError(errEl, '');
    ocupado($('cx-entrar'), 'Verificando…', function () {
      return Docks.api.post({ action: 'checkAdmin', admin_key: clave }).then(function (r) {
        if (!r) { setError(errEl, 'No pudimos verificar la clave: la planilla no respondió. Probá de nuevo.'); return; }
        S.key = clave;
        sesionSet(clave);
        $('cx-clave').value = '';
        entrarApp();
      }, function (err) { setError(errEl, mensaje(err)); $('cx-clave').select(); });
    });
  }

  function salir() {
    sesionDel();
    S.key = '';
    S.data = {}; S.ts = {}; S.errores = {}; S.cont = {}; S.desel = {}; S.intentos = {}; S.errGrupo = {}; S.asignar = {};
    actualizarContadores();
    mostrarLogin();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t) return;
    var act = t.getAttribute('data-act');
    switch (act) {
      case 'recargar': recargarSeccion(t.getAttribute('data-sec')); break;
      case 'reintentar': t.getAttribute('data-keys').split(',').forEach(function (k) { if (LOADERS[k]) cargar(k); }); render(S.sec); break;
      case 'toggle-lineas': toggleLineas(t); break;
      case 'armar': armarOrden(t); break;
      case 'cancelar-lineas': abrirCancelar(t); break;
      case 'ver-mensaje': verMensaje(t); break;
      case 'copiar-reclamo': copiarReclamo(); break;
      case 'nuevo-producto': if (S.data.boot) abrirProducto(null); else Docks.toast('Esperá a que carguen los locales.', 'info'); break;
      case 'editar-producto': abrirProducto(productos()[Number(t.getAttribute('data-i'))]); break;
      case 'nuevo-proveedor': abrirProveedor(null); break;
      case 'editar-proveedor': abrirProveedor(proveedores()[Number(t.getAttribute('data-i'))]); break;
      case 'editar-local': abrirLocal(locales()[Number(t.getAttribute('data-i'))]); break;
      case 'pegar':
        if (!S.data.boot) { Docks.toast('Esperá a que carguen los locales.', 'info'); break; }
        abrirPegar(t.getAttribute('data-tipo'));
        break;
      default: break;
    }
  }

  function recargarSeccion(sec) {
    var keys = NECESITA[sec] || [];
    if (sec !== 'proveedores' && sec !== 'locales') keys = keys.filter(function (k) { return k !== 'boot'; });
    keys.forEach(function (k) { S.ts[k] = 0; cargar(k); });
    render(sec);
  }

  function copiarReclamo() {
    var lineas = (S.data.faltantes && S.data.faltantes.lineas) || [];
    if (!lineas.length) { Docks.toast('No hay faltantes para copiar.', 'info'); return; }
    copiarTexto(textoReclamo(lineas), null);
  }

  function init() {
    if (!doc || !doc.getElementById || !$('cx-app')) return;

    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', function (e) {
      var t = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('cx-click')) {
        e.preventDefault();
        onClick({ target: t });
      }
    });
    $('cx-compras-body').addEventListener('change', onCambioCompras);
    global.addEventListener('hashchange', function () { if (!$('cx-app').hidden) rutear(true); });

    $('cx-login').addEventListener('submit', login);
    $('cx-salir').addEventListener('click', salir);

    $('cx-semana').addEventListener('change', function () { S.semanaFiltro = this.value; S.data.consolidado = null; S.desel = {}; cargar('consolidado'); renderCompras(); });
    $('cx-responsable').addEventListener('change', function () { Docks.store.set('responsable', texto(this.value)); });
    $('cx-ord-estado').addEventListener('change', function () { S.ordenesEstado = this.value; S.data.ordenes = null; cargar('ordenes'); renderOrdenes(); });
    $('cx-falt-dias').addEventListener('change', function () { S.faltDias = Number(this.value) || 14; S.data.faltantes = null; cargar('faltantes'); renderFaltantes(); });
    $('cx-stock-local').addEventListener('change', function () { S.stockLocal = this.value; renderStock(); });
    $('cx-stock-estado').addEventListener('change', function () { S.stockEstado = this.value; renderStock(); });
    $('cx-stock-buscar').addEventListener('input', function () { S.stockQ = this.value; renderStock(); });
    $('cx-cat-local').addEventListener('change', function () { S.catLocal = this.value; renderCatalogo(); });
    $('cx-cat-filtro').addEventListener('change', function () { S.catFiltro = this.value; renderCatalogo(); });
    $('cx-cat-buscar').addEventListener('input', function () { S.catQ = this.value; renderCatalogo(); });
    $('cx-prov-buscar').addEventListener('input', function () { S.provQ = this.value; renderProveedores(); });

    // diálogos
    Array.prototype.forEach.call(doc.querySelectorAll('dialog'), function (d) {
      d.addEventListener('close', function () {
        var f = S.volverFoco;
        S.volverFoco = null;
        if (f && f.focus && doc.body.contains(f)) { try { f.focus(); } catch (_e) { /* nada */ } }
      });
    });
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cerrar]'), function (b) {
      b.addEventListener('click', function () { cerrarDialogo(b.closest('dialog')); });
    });
    $('dlg-wa-copiar').addEventListener('click', function () { copiarTexto($('dlg-wa-texto').value, $('dlg-wa-texto')); });
    $('dlg-wa-abrir').addEventListener('click', function (e) { if (this.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
    $('dlg-wa-listo').addEventListener('click', waListo);
    $('form-cancelar').addEventListener('submit', enviarCancelar);
    $('form-producto').addEventListener('submit', enviarProducto);
    $('fp-proveedor').addEventListener('input', avisoProveedor);
    $('form-proveedor').addEventListener('submit', enviarProveedor);
    $('form-local').addEventListener('submit', enviarLocal);
    $('fl-enc-agregar').addEventListener('click', agregarEncargado);
    $('fl-enc-nuevo').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); agregarEncargado(); } });
    $('fl-encargados').addEventListener('click', function (e) {
      var b = e.target.closest('[data-quitar]');
      if (!b) return;
      S.encargados.splice(Number(b.getAttribute('data-quitar')), 1);
      renderChips();
      $('fl-enc-nuevo').focus();
    });
    var tPegar = null;
    $('dlg-pegar-texto').addEventListener('input', function () { clearTimeout(tPegar); tPegar = setTimeout(previsualizar, 150); });
    $('dlg-pegar-local').addEventListener('change', function () { if (S.pegar.res) previsualizar(); });
    $('form-pegar').addEventListener('submit', enviarPegar);

    var guardada = sesionGet();
    if (guardada && Docks.api.configured()) { S.key = guardada; entrarApp(); }
    else mostrarLogin();
  }

  if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
