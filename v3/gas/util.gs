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
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
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
