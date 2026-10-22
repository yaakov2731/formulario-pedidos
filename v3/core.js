/* Docks V3 · núcleo compartido (window.Docks). Contrato: docs/v3/CONTRATO.md §5.1 */
(function (global) {
  'use strict';

  var UNIDADES = ['kg', 'g', 'litro', 'ml', 'unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];
  var CONTABLES = ['unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var STORE_PREFIX = 'docksv3:';

  /* ---------- almacenamiento local ---------- */
  var store = {
    get: function (k, def) {
      try {
        var raw = global.localStorage.getItem(STORE_PREFIX + k);
        return raw === null ? def : JSON.parse(raw);
      } catch (_e) { return def; }
    },
    set: function (k, v) {
      try { global.localStorage.setItem(STORE_PREFIX + k, JSON.stringify(v)); return true; } catch (_e) { return false; }
    },
    del: function (k) {
      try { global.localStorage.removeItem(STORE_PREFIX + k); } catch (_e) { /* sin almacenamiento */ }
    }
  };

  /* ---------- texto ---------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- números ---------- */
  function parseNum(texto) {
    if (typeof texto === 'number') return isFinite(texto) ? texto : null;
    var s = String(texto == null ? '' : texto).replace(/\s/g, '');
    if (!s) return null;
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function inputNum(n) {
    if (n === null || n === undefined || n === '' || !isFinite(Number(n))) return '';
    return String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');
  }
  function fmtNum(n, unidad) {
    if (n === null || n === undefined || n === '' || !isFinite(Number(n))) return '—';
    var txt = Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    return unidad ? txt + ' ' + unidad : txt;
  }

  /* ---------- fechas ---------- */
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function semanaDe(fecha) {
    var d = fecha ? new Date(fecha) : new Date();
    var dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (dia.getDay() + 6) % 7; // lunes = 0
    var inicio = new Date(dia); inicio.setDate(dia.getDate() - dow);
    var fin = new Date(inicio); fin.setDate(inicio.getDate() + 6);
    var jueves = new Date(inicio); jueves.setDate(inicio.getDate() + 3);
    var anio = jueves.getFullYear();
    var primero = new Date(anio, 0, 4);
    var inicioPrimera = new Date(primero); inicioPrimera.setDate(primero.getDate() - ((primero.getDay() + 6) % 7));
    var num = 1 + Math.round((inicio - inicioPrimera) / (7 * 864e5));
    var label = 'Semana ' + num + ' · ' + inicio.getDate() +
      (inicio.getMonth() !== fin.getMonth() ? ' ' + MESES[inicio.getMonth()] : '') +
      ' al ' + fin.getDate() + ' ' + MESES[fin.getMonth()];
    function iso(x) { return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
    return { id: anio + '-W' + pad(num), label: label, inicio: iso(inicio), fin: iso(fin) };
  }
  function parseFecha(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    var d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function fechaCorta(v) {
    var d = parseFecha(v);
    if (!d) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function haceDias(v) {
    var d = parseFecha(v);
    if (!d) return null;
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var x = new Date(d); x.setHours(0, 0, 0, 0);
    return Math.round((hoy - x) / 864e5);
  }

  /* ---------- ids ---------- */
  function nuevoId(prefijo) {
    var d = new Date();
    var rnd = '';
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 4; i++) rnd += abc.charAt(Math.floor(Math.random() * abc.length));
    return String(prefijo || 'OP').toUpperCase() + '-' +
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '-' + rnd;
  }

  /* ---------- sugerido (CONTRATO §3.5) ---------- */
  function sugerido(p) {
    p = p || {};
    var par = parseNum(p.par);
    var stock = parseNum(p.stock_actual);
    var abierto = parseNum(p.pedido_abierto) || 0;
    if (par === null) return { cantidad: null, motivo: 'SIN_PAR' };
    if (stock === null) return { cantidad: null, motivo: 'SIN_CONTEO' };
    var q = Math.max(0, par - stock - abierto);
    if (CONTABLES.indexOf(String(p.unidad || '').toLowerCase()) > -1) q = Math.ceil(q - 1e-9);
    else q = Math.ceil(q * 10 - 1e-9) / 10;
    return { cantidad: Math.max(0, q), motivo: 'OK' };
  }

  /* ---------- api ---------- */
  function apiUrl() {
    var cfg = (global.DOCKS_V3_CONFIG && global.DOCKS_V3_CONFIG.API_URL) || '';
    try {
      var qs = new URLSearchParams(global.location.search);
      if (qs.has('api')) {
        var v = qs.get('api').trim();
        if (v) { store.set('api_url', v); store.set('api_url_cfg', cfg); } else { store.del('api_url'); store.del('api_url_cfg'); }
      }
    } catch (_e) { /* sin location */ }
    var fijada = store.get('api_url', '');
    if (!fijada) return cfg;
    // Una URL fijada con ?api= sólo vale mientras config.js siga igual que cuando se fijó.
    // Si gerencia publicó otro backend (API_URL nueva), la fijada queda vieja y se descarta.
    if (store.get('api_url_cfg', '') !== cfg) { store.del('api_url'); store.del('api_url_cfg'); return cfg; }
    return fijada;
  }
  function absUrl(u) {
    try { return new URL(u, global.location.href); } catch (_e) { return new URL(u); }
  }
  function serverError(msg) {
    var e = new Error(msg || 'La planilla rechazó la operación');
    e.server = true;
    return e;
  }
  var jsonpSeq = 0;
  function jsonp(url, timeout) {
    return new Promise(function (resolve, reject) {
      var cb = '__docksV3_' + Date.now() + '_' + (jsonpSeq++);
      var script = global.document.createElement('script');
      var done = false;
      function cleanup(late) {
        if (script.parentNode) script.parentNode.removeChild(script);
        if (late) {
          global[cb] = function () {};
          setTimeout(function () { try { delete global[cb]; } catch (_e) { global[cb] = undefined; } }, 60000);
        } else {
          try { delete global[cb]; } catch (_e) { global[cb] = undefined; }
        }
      }
      var timer = setTimeout(function () {
        if (done) return;
        done = true; cleanup(true);
        reject(new Error('La planilla tardó demasiado en responder. Revisá la conexión y probá de nuevo.'));
      }, timeout);
      global[cb] = function (data) {
        if (done) return;
        done = true; clearTimeout(timer); cleanup(false);
        resolve(data);
      };
      url.searchParams.set('callback', cb);
      script.async = true;
      script.src = url.toString();
      script.onerror = function () {
        if (done) return;
        done = true; clearTimeout(timer); cleanup(false);
        reject(new Error('No se pudo conectar con la planilla.'));
      };
      global.document.head.appendChild(script);
    });
  }
  var api = {
    configured: function () { return !!apiUrl(); },
    url: apiUrl,
    get: function (action, params, opts) {
      var base = apiUrl();
      if (!base) return Promise.reject(new Error('Falta configurar la URL del backend V3.'));
      var url = absUrl(base);
      url.searchParams.set('action', action);
      Object.keys(params || {}).forEach(function (k) {
        if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
      });
      url.searchParams.set('_', String(Date.now()));
      return jsonp(url, (opts && opts.timeout) || 20000).then(function (data) {
        if (!data || data.ok === false) throw serverError(data && data.error);
        return data;
      });
    },
    post: function (payload, opts) {
      var base = apiUrl();
      if (!base) return Promise.reject(new Error('Falta configurar la URL del backend V3.'));
      if (global.navigator && global.navigator.onLine === false) return Promise.reject(new Error('Sin conexión. No se envió nada.'));
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, (opts && opts.timeout) || 45000);
      return global.fetch(absUrl(base).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) { return res.json(); })
        .then(function (data) {
          clearTimeout(timer);
          if (data && data.ok === false) throw serverError(data.error);
          return data || null;
        }, function () { clearTimeout(timer); return null; });
    },
    confirm: function (action, id, opts) {
      var intentos = (opts && opts.intentos) || 4;
      var espera = (opts && opts.espera) || 1500;
      function intento(n) {
        return api.get(action, { id: id }).then(function (r) {
          if (r && r.found !== false) return r;
          throw new Error('no encontrado');
        }).catch(function (e) {
          if (e && e.server) throw e;
          if (n + 1 >= intentos) return null;
          return new Promise(function (ok) { setTimeout(ok, espera); }).then(function () { return intento(n + 1); });
        });
      }
      return intento(0);
    }
  };

  /* ---------- toast ---------- */
  function toast(msg, tipo) {
    var doc = global.document;
    if (!doc) return;
    var box = doc.getElementById('docks-toast');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'docks-toast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      doc.body.appendChild(box);
    }
    var el = doc.createElement('div');
    el.className = 'toast toast-' + (tipo || 'info');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add('toast-out'); }, tipo === 'error' ? 6000 : 3200);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, tipo === 'error' ? 6500 : 3700);
  }

  global.Docks = {
    version: 'v3',
    UNIDADES: UNIDADES,
    CONTABLES: CONTABLES,
    api: api,
    ids: { nuevo: nuevoId },
    semana: { de: semanaDe },
    num: { parse: parseNum, fmt: fmtNum, input: inputNum },
    sugerido: sugerido,
    store: store,
    norm: norm,
    esc: esc,
    toast: toast,
    fechaCorta: fechaCorta,
    haceDias: haceDias
  };
})(typeof window !== 'undefined' ? window : globalThis);
