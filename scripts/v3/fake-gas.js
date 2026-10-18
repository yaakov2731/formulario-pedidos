// Docks V3 · Apps Script simulado en memoria para pruebas y servidor de desarrollo.
// Contrato: docs/v3/CONTRATO.md §5.3. Sin dependencias de npm.
//
//   const { createGasRuntime } = require('./fake-gas');
//   const rt = createGasRuntime({ dir: 'v3/gas', properties: { ADMIN_KEY: 'test' } });
//   rt.call('setupV3');
//   rt.doGet({ parameter: { action: 'ping', callback: 'cb' } })   // -> { text, mimeType }
//   rt.doPost({ postData: { contents: JSON.stringify({ action: 'savePedido' }) } })
//   rt.sheet('CATALOGO')                                          // -> filas (incluye encabezado)
//
// Extras para pruebas: rt.spreadsheet, rt.context, rt.setProperty(k, v), rt.deleteProperty(k),
// rt.getProperty(k), rt.urlFetchCalls, rt.setUrlFetchHandler(fn), rt.setLockBusy(bool), rt.logs.
//
// Escritura de celdas como en Sheets: un texto que empieza con "=" es fórmula (no se evalúa);
// con "'" queda como texto; en celdas sin formato de texto ('@') los números y fechas escritos
// como texto se convierten a número y a fecha (zona de la planilla), igual que en la planilla real.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const FIXED_OFFSETS = {
  'America/Argentina/Buenos_Aires': -180,
  'America/Buenos_Aires': -180,
  'America/Argentina/Cordoba': -180,
  UTC: 0, GMT: 0, 'Etc/UTC': 0, 'Etc/GMT': 0
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function pad(n, w) {
  let s = String(Math.abs(n));
  while (s.length < w) s = '0' + s;
  return (n < 0 ? '-' : '') + s;
}

/* ---------- zona horaria y Utilities.formatDate ---------- */
const intlCache = new Map();
function tzOffsetMinutes(date, tz) {
  if (Object.prototype.hasOwnProperty.call(FIXED_OFFSETS, tz)) return FIXED_OFFSETS[tz];
  const m = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(tz);
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  let dtf = intlCache.get(tz);
  if (!dtf) {
    try {
      dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch (_e) {
      throw new Error('Zona horaria inválida: ' + tz);
    }
    intlCache.set(tz, dtf);
  }
  const p = {};
  dtf.formatToParts(date).forEach(x => { p[x.type] = x.value; });
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function formatDate(date, tz, fmt) {
  if (!isDate(date) || isNaN(date.getTime())) throw new Error('Utilities.formatDate: la fecha es inválida.');
  if (typeof fmt !== 'string') throw new Error('Utilities.formatDate: falta el formato.');
  const off = tzOffsetMinutes(date, String(tz || 'UTC'));
  const d = new Date(date.getTime() + off * 60000);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), H = d.getUTCHours();
  const mi = d.getUTCMinutes(), s = d.getUTCSeconds(), ms = d.getUTCMilliseconds(), dow = d.getUTCDay();
  const sign = off < 0 ? '-' : '+';
  const oh = pad(Math.floor(Math.abs(off) / 60), 2), om = pad(Math.abs(off) % 60, 2);
  function token(ch, n) {
    switch (ch) {
      case 'y': case 'Y': return n === 2 ? pad(Y % 100, 2) : pad(Y, n);
      case 'M': case 'L': return n >= 4 ? MONTHS[M] : n === 3 ? MONTHS[M].slice(0, 3) : pad(M + 1, n);
      case 'd': return pad(D, n);
      case 'H': return pad(H, n);
      case 'k': return pad(H === 0 ? 24 : H, n);
      case 'K': return pad(H % 12, n);
      case 'h': return pad(H % 12 === 0 ? 12 : H % 12, n);
      case 'm': return pad(mi, n);
      case 's': return pad(s, n);
      case 'S': return pad(ms, 3).slice(0, Math.max(n, 3)).padEnd(n, '0').slice(0, n);
      case 'E': return n >= 4 ? DAYS[dow] : DAYS[dow].slice(0, 3);
      case 'u': return String(dow === 0 ? 7 : dow);
      case 'a': return H < 12 ? 'AM' : 'PM';
      case 'z': return 'GMT' + sign + oh + ':' + om;
      case 'Z': return sign + oh + om;
      case 'X': return off === 0 ? 'Z' : n === 1 ? sign + oh : n === 2 ? sign + oh + om : sign + oh + ':' + om;
      case 'D': {
        const start = Date.UTC(Y, 0, 1);
        return pad(Math.floor((Date.UTC(Y, M, D) - start) / 864e5) + 1, n);
      }
      default: throw new Error('Utilities.formatDate: patrón no soportado "' + ch + '".');
    }
  }
  let out = '';
  let i = 0;
  while (i < fmt.length) {
    const ch = fmt[i];
    if (ch === "'") {
      if (fmt[i + 1] === "'") { out += "'"; i += 2; continue; }
      let j = i + 1;
      while (j < fmt.length) {
        if (fmt[j] === "'") {
          if (fmt[j + 1] === "'") { out += "'"; j += 2; continue; }
          break;
        }
        out += fmt[j];
        j++;
      }
      i = j + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < fmt.length && fmt[j] === ch) j++;
      out += token(ch, j - i);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/* Fecha local de la zona → instante. */
function zonedToDate(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let off = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - off * 60000;
  const off2 = tzOffsetMinutes(new Date(t), tz);
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
}

/* ---------- A1 ---------- */
function colToNum(letters) {
  let n = 0;
  for (const c of letters.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}
function numToCol(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function parseA1(a1, maxRows, maxCols) {
  const ref = String(a1).replace(/^.*!/, '').replace(/\$/g, '').trim();
  const parts = ref.split(':');
  function cell(p) {
    const m = /^([A-Za-z]*)(\d*)$/.exec(p);
    if (!m || (!m[1] && !m[2])) throw new Error('Rango inválido: ' + a1);
    return { col: m[1] ? colToNum(m[1]) : null, row: m[2] ? Number(m[2]) : null };
  }
  const a = cell(parts[0]);
  const b = parts[1] !== undefined ? cell(parts[1]) : a;
  const r1 = a.row || 1, c1 = a.col || 1;
  const r2 = b.row || (parts[1] !== undefined || a.row === null ? maxRows : r1);
  const c2 = b.col || (parts[1] !== undefined || a.col === null ? maxCols : c1);
  return { row: Math.min(r1, r2), col: Math.min(c1, c2), numRows: Math.abs(r2 - r1) + 1, numCols: Math.abs(c2 - c1) + 1 };
}

/* ---------- celdas ---------- */
function displayValue(v, tz) {
  if (v === null || v === undefined) return '';
  if (isDate(v)) return formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss');
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

/* ---------- Range ---------- */
class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    if (![row, col, numRows, numCols].every(n => Number.isInteger(n))) throw new Error('getRange: coordenadas inválidas.');
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) throw new Error('getRange: las coordenadas o dimensiones del rango no son válidas.');
    if (row + numRows - 1 > sheet._maxRows || col + numCols - 1 > sheet._maxCols) {
      throw new Error('Las coordenadas del rango están fuera de las dimensiones de la hoja ' + sheet._name + '.');
    }
    this._s = sheet; this._r = row; this._c = col; this._nr = numRows; this._nc = numCols;
  }
  getSheet() { return this._s; }
  getRow() { return this._r; }
  getRowIndex() { return this._r; }
  getColumn() { return this._c; }
  getColumnIndex() { return this._c; }
  getNumRows() { return this._nr; }
  getNumColumns() { return this._nc; }
  getLastRow() { return this._r + this._nr - 1; }
  getLastColumn() { return this._c + this._nc - 1; }
  getHeight() { return this._nr; }
  getWidth() { return this._nc; }
  getA1Notation() {
    const a = numToCol(this._c) + this._r;
    return this._nr === 1 && this._nc === 1 ? a : a + ':' + numToCol(this.getLastColumn()) + this.getLastRow();
  }
  _each(fn) {
    for (let i = 0; i < this._nr; i++) for (let j = 0; j < this._nc; j++) fn(this._r + i, this._c + j, i, j);
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this._nr; i++) {
      const row = this._s._data[this._r - 1 + i];
      const line = new Array(this._nc);
      for (let j = 0; j < this._nc; j++) {
        const v = row ? row[this._c - 1 + j] : undefined;
        line[j] = v === undefined || v === null ? '' : isDate(v) ? new Date(v.getTime()) : v;
      }
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() {
    const tz = this._s._ss._tz;
    return this.getValues().map(r => r.map(v => displayValue(v, tz)));
  }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this._nr) {
      throw new Error('La cantidad de filas de los datos (' + (Array.isArray(values) ? values.length : 0) + ') no coincide con el rango (' + this._nr + ').');
    }
    values.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== this._nc) {
        throw new Error('La cantidad de columnas de los datos (' + (Array.isArray(row) ? row.length : 0) + ') no coincide con el rango (' + this._nc + ').');
      }
    });
    for (let i = 0; i < this._nr; i++) for (let j = 0; j < this._nc; j++) this._s._write(this._r + i, this._c + j, values[i][j]);
    return this;
  }
  setValue(v) { this._each((r, c) => this._s._write(r, c, v)); return this; }
  getFormula() { return this._s._formulas.get(this._r + ',' + this._c) || ''; }
  getFormulas() {
    const out = [];
    for (let i = 0; i < this._nr; i++) {
      const line = [];
      for (let j = 0; j < this._nc; j++) line.push(this._s._formulas.get((this._r + i) + ',' + (this._c + j)) || '');
      out.push(line);
    }
    return out;
  }
  setFormula(f) { this._each((r, c) => this._s._setFormula(r, c, String(f))); return this; }
  setFormulas(fs2) { this._each((r, c, i, j) => this._s._setFormula(r, c, String(fs2[i][j]))); return this; }
  clearContent() { this._each((r, c) => this._s._clearCell(r, c)); return this; }
  clear() { this.clearContent(); return this; }
  clearFormat() { return this; }
  clearDataValidations() { this._s._validations = this._s._validations.filter(v => !this._covers(v)); return this; }
  _covers(v) {
    return v.row === this._r && v.col === this._c && v.numRows === this._nr && v.numCols === this._nc;
  }
  _contains(r, c) {
    return r >= this._r && r <= this.getLastRow() && c >= this._c && c <= this.getLastColumn();
  }
  setNumberFormat(f) {
    this._s._formats.push({ row: this._r, col: this._c, numRows: this._nr, numCols: this._nc, format: String(f) });
    return this;
  }
  setNumberFormats(m) { this.setNumberFormat(m && m[0] ? m[0][0] : ''); return this; }
  getNumberFormat() { return this._s._formatAt(this._r, this._c) || 'General'; }
  setDataValidation(rule) {
    this._s._validations = this._s._validations.filter(v => !this._covers(v));
    if (rule) this._s._validations.push({ row: this._r, col: this._c, numRows: this._nr, numCols: this._nc, rule });
    return this;
  }
  setDataValidations(rules) { this.setDataValidation(rules && rules[0] ? rules[0][0] : null); return this; }
  getDataValidation() {
    for (let k = this._s._validations.length - 1; k >= 0; k--) {
      const v = this._s._validations[k];
      if (this._r >= v.row && this._r < v.row + v.numRows && this._c >= v.col && this._c < v.col + v.numCols) return v.rule;
    }
    return null;
  }
  getDataValidations() {
    const out = [];
    for (let i = 0; i < this._nr; i++) {
      const line = [];
      for (let j = 0; j < this._nc; j++) line.push(this.offset(i, j, 1, 1).getDataValidation());
      out.push(line);
    }
    return out;
  }
  _style(prop, value) {
    this._s._styles.push({ row: this._r, col: this._c, numRows: this._nr, numCols: this._nc, prop, value });
    return this;
  }
  _styleAt(prop) {
    for (let k = this._s._styles.length - 1; k >= 0; k--) {
      const st = this._s._styles[k];
      if (st.prop === prop && this._r >= st.row && this._r < st.row + st.numRows && this._c >= st.col && this._c < st.col + st.numCols) return st.value;
    }
    return null;
  }
  setFontWeight(v) { return this._style('fontWeight', v); }
  getFontWeight() { return this._styleAt('fontWeight') || 'normal'; }
  setFontWeights() { return this; }
  setBackground(v) { return this._style('background', v); }
  getBackground() { return this._styleAt('background') || '#ffffff'; }
  setFontColor(v) { return this._style('fontColor', v); }
  setFontSize(v) { return this._style('fontSize', v); }
  setFontFamily(v) { return this._style('fontFamily', v); }
  setFontStyle(v) { return this._style('fontStyle', v); }
  setHorizontalAlignment(v) { return this._style('hAlign', v); }
  setVerticalAlignment(v) { return this._style('vAlign', v); }
  setWrap(v) { return this._style('wrap', v); }
  setWrapStrategy(v) { return this._style('wrapStrategy', v); }
  setNote(v) { return this._style('note', v); }
  getNote() { return this._styleAt('note') || ''; }
  setBorder() { return this; }
  setBackgrounds() { return this; }
  setFontColors() { return this; }
  setNotes() { return this; }
  merge() { return this; }
  breakApart() { return this; }
  activate() { return this; }
  protect() { return this._s._addProtection('RANGE', this); }
  offset(r, c, nr, nc) {
    return new FakeRange(this._s, this._r + r, this._c + c, nr === undefined ? this._nr : nr, nc === undefined ? this._nc : nc);
  }
  isBlank() {
    let blank = true;
    this._each((r, c) => {
      const row = this._s._data[r - 1];
      const v = row ? row[c - 1] : undefined;
      if ((v !== undefined && v !== null && v !== '') || this._s._formulas.has(r + ',' + c)) blank = false;
    });
    return blank;
  }
}

/* ---------- Protection ---------- */
class FakeProtection {
  constructor(type, range) {
    this._type = type; this._range = range; this._desc = ''; this._warning = false; this._removed = false;
  }
  getProtectionType() { return this._type; }
  getRange() { return this._range; }
  setDescription(d) { this._desc = String(d); return this; }
  getDescription() { return this._desc; }
  setWarningOnly(b) { this._warning = !!b; return this; }
  isWarningOnly() { return this._warning; }
  remove() { this._removed = true; }
  addEditor() { return this; }
  addEditors() { return this; }
  removeEditor() { return this; }
  removeEditors() { return this; }
  getEditors() { return []; }
  canEdit() { return true; }
  canDomainEdit() { return false; }
  setDomainEdit() { return this; }
}

/* ---------- Sheet ---------- */
let sheetSeq = 1;
class FakeSheet {
  constructor(ss, name) {
    this._ss = ss; this._name = name; this._id = sheetSeq++;
    this._data = []; this._formulas = new Map(); this._formats = []; this._validations = [];
    this._styles = []; this._protections = []; this._maxRows = 1000; this._maxCols = 26;
    this._frozenRows = 0; this._frozenCols = 0; this._hiddenCols = new Set(); this._hidden = false;
  }
  _formatAt(r, c) {
    for (let k = this._formats.length - 1; k >= 0; k--) {
      const f = this._formats[k];
      if (r >= f.row && r < f.row + f.numRows && c >= f.col && c < f.col + f.numCols) return f.format;
    }
    return null;
  }
  _coerce(r, c, v) {
    if (v === null || v === undefined) return '';
    if (isDate(v)) return new Date(v.getTime());
    if (typeof v === 'number') {
      if (!isFinite(v)) throw new Error('No se puede escribir un número no finito en ' + this._name + '.');
      return v;
    }
    if (typeof v === 'boolean') return v;
    if (typeof v === 'object') return String(v);
    const s = String(v);
    if (s.charAt(0) === "'") return s.slice(1);
    if (this._formatAt(r, c) === '@') return s;
    const t = s.trim();
    if (/^-?\d+(\.\d+)?$/.test(t) && t.replace(/^-/, '').length < 16) return Number(t);
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
    if (m) return zonedToDate(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), this._ss._tz);
    m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    if (m && +m[1] < 24 && +m[2] < 60) return zonedToDate(1899, 11, 30, +m[1], +m[2], +(m[3] || 0), this._ss._tz);
    return s;
  }
  _write(r, c, v) {
    const key = r + ',' + c;
    if (typeof v === 'string' && v.charAt(0) === '=' && v.length > 1) { this._setFormula(r, c, v); return; }
    this._formulas.delete(key);
    const row = this._data[r - 1] || (this._data[r - 1] = []);
    row[c - 1] = this._coerce(r, c, v);
  }
  _setFormula(r, c, f) {
    const row = this._data[r - 1] || (this._data[r - 1] = []);
    row[c - 1] = '';
    if (f) this._formulas.set(r + ',' + c, f.charAt(0) === '=' ? f : '=' + f);
    else this._formulas.delete(r + ',' + c);
  }
  _clearCell(r, c) {
    const row = this._data[r - 1];
    if (row) row[c - 1] = '';
    this._formulas.delete(r + ',' + c);
  }
  _rowHasContent(i) {
    const row = this._data[i];
    if (row) for (let j = 0; j < row.length; j++) { const v = row[j]; if (v !== undefined && v !== null && v !== '') return true; }
    return false;
  }
  _addProtection(type, range) {
    const p = new FakeProtection(type, range || this.getDataRange());
    this._protections.push(p);
    return p;
  }
  getName() { return this._name; }
  setName(n) {
    if (this._ss._sheets.some(s => s !== this && s._name === n)) throw new Error('Ya existe una hoja con el nombre "' + n + '".');
    this._name = String(n); return this;
  }
  getSheetName() { return this._name; }
  getSheetId() { return this._id; }
  getIndex() { return this._ss._sheets.indexOf(this) + 1; }
  getParent() { return this._ss; }
  getMaxRows() { return this._maxRows; }
  getMaxColumns() { return this._maxCols; }
  getLastRow() {
    let last = 0;
    for (let i = this._data.length - 1; i >= 0; i--) if (this._rowHasContent(i)) { last = i + 1; break; }
    for (const k of this._formulas.keys()) { const r = Number(k.split(',')[0]); if (r > last) last = r; }
    return last;
  }
  getLastColumn() {
    let last = 0;
    for (let i = 0; i < this._data.length; i++) {
      const row = this._data[i];
      if (!row) continue;
      for (let j = row.length - 1; j >= last; j--) {
        const v = row[j];
        if (v !== undefined && v !== null && v !== '') { last = j + 1; break; }
      }
    }
    for (const k of this._formulas.keys()) { const c = Number(k.split(',')[1]); if (c > last) last = c; }
    return last;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const p = parseA1(a, this._maxRows, this._maxCols);
      return new FakeRange(this, p.row, p.col, p.numRows, p.numCols);
    }
    return new FakeRange(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  getRangeList(list) {
    const ranges = list.map(x => this.getRange(x));
    const api = {
      getRanges: () => ranges,
      setValue: v => { ranges.forEach(r => r.setValue(v)); return api; },
      setFontWeight: () => api, setBackground: () => api, setNumberFormat: f => { ranges.forEach(r => r.setNumberFormat(f)); return api; }
    };
    return api;
  }
  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }
  appendRow(values) {
    if (!Array.isArray(values)) throw new Error('appendRow: se esperaba un array.');
    const r = this.getLastRow() + 1;
    if (r > this._maxRows) this._maxRows = r;
    if (values.length > this._maxCols) this._maxCols = values.length;
    values.forEach((v, j) => this._write(r, j + 1, v));
    return this;
  }
  _shiftRows(at, n) {
    // inserta n filas vacías antes de la fila "at" (1-based)
    if (at - 1 < this._data.length) this._data.splice(at - 1, 0, ...new Array(n).fill(undefined));
    const nf = new Map();
    for (const [k, f] of this._formulas) {
      const [r, c] = k.split(',').map(Number);
      nf.set((r >= at ? r + n : r) + ',' + c, f);
    }
    this._formulas = nf;
    // las filas nuevas heredan formato y validación de la fila anterior, como en Sheets
    [this._formats, this._validations, this._styles].forEach(list => list.forEach(e => {
      if (e.row >= at) e.row += n;
      else if (e.row + e.numRows - 1 >= at - 1) e.numRows += n;
    }));
    this._maxRows += n;
  }
  insertRowsAfter(after, n) { this._shiftRows(after + 1, n || 1); return this; }
  insertRowsBefore(before, n) { this._shiftRows(before, n || 1); return this; }
  insertRowAfter(after) { return this.insertRowsAfter(after, 1); }
  insertRowBefore(before) { return this.insertRowsBefore(before, 1); }
  insertRows(before, n) { return this.insertRowsBefore(before, n || 1); }
  deleteRows(start, n) {
    n = n || 1;
    if (start < 1 || start + n - 1 > this._maxRows) throw new Error('deleteRows: fuera de rango.');
    this._data.splice(start - 1, n);
    const nf = new Map();
    for (const [k, f] of this._formulas) {
      const [r, c] = k.split(',').map(Number);
      if (r >= start && r < start + n) continue;
      nf.set((r >= start + n ? r - n : r) + ',' + c, f);
    }
    this._formulas = nf;
    this._maxRows -= n;
    return this;
  }
  deleteRow(r) { return this.deleteRows(r, 1); }
  insertColumnsAfter(after, n) {
    n = n || 1;
    this._data.forEach(row => { if (row && after < row.length) row.splice(after, 0, ...new Array(n).fill('')); });
    this._maxCols += n;
    return this;
  }
  insertColumnsBefore(before, n) { return this.insertColumnsAfter(before - 1, n); }
  insertColumnAfter(after) { return this.insertColumnsAfter(after, 1); }
  deleteColumns(start, n) {
    n = n || 1;
    this._data.forEach(row => { if (row) row.splice(start - 1, n); });
    this._maxCols -= n;
    return this;
  }
  setFrozenRows(n) { this._frozenRows = n; return this; }
  getFrozenRows() { return this._frozenRows; }
  setFrozenColumns(n) { this._frozenCols = n; return this; }
  getFrozenColumns() { return this._frozenCols; }
  hideColumns(c, n) { for (let k = 0; k < (n || 1); k++) this._hiddenCols.add(c + k); return this; }
  showColumns(c, n) { for (let k = 0; k < (n || 1); k++) this._hiddenCols.delete(c + k); return this; }
  isColumnHiddenByUser(c) { return this._hiddenCols.has(c); }
  hideSheet() { this._hidden = true; return this; }
  showSheet() { this._hidden = false; return this; }
  isSheetHidden() { return this._hidden; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  setRowHeight() { return this; }
  autoResizeColumns() { return this; }
  autoResizeColumn() { return this; }
  setTabColor() { return this; }
  activate() { this._ss._active = this; return this; }
  clear() { this._data = []; this._formulas.clear(); return this; }
  clearContents() { return this.clear(); }
  clearFormats() { this._formats = []; this._styles = []; return this; }
  protect() { return this._addProtection('SHEET', null); }
  getProtections(type) { return this._protections.filter(p => !p._removed && (!type || p._type === type)); }
  getDataValidations() { return this._validations.slice(); }
  toast() { return this; }
}

/* ---------- Spreadsheet ---------- */
class FakeSpreadsheet {
  constructor(id, name, tz) {
    this._id = id; this._name = name; this._tz = tz || DEFAULT_TZ;
    this._sheets = [new FakeSheet(this, 'Hoja 1')];
    this._active = this._sheets[0];
  }
  getId() { return this._id; }
  getName() { return this._name; }
  rename(n) { this._name = String(n); }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this._id + '/edit'; }
  getSpreadsheetTimeZone() { return this._tz; }
  setSpreadsheetTimeZone(tz) { this._tz = tz; }
  getSpreadsheetLocale() { return 'es_AR'; }
  getSheets() { return this._sheets.slice(); }
  getNumSheets() { return this._sheets.length; }
  getSheetByName(n) { return this._sheets.find(s => s._name === n) || null; }
  getSheetById(id) { return this._sheets.find(s => s._id === id) || null; }
  insertSheet(a, b) {
    let name = null;
    let index = this._sheets.length;
    if (typeof a === 'string') { name = a; if (typeof b === 'number') index = b; }
    else if (typeof a === 'number') index = a;
    if (!name) { let k = this._sheets.length + 1; while (this.getSheetByName('Hoja ' + k)) k++; name = 'Hoja ' + k; }
    if (this.getSheetByName(name)) throw new Error('Ya existe una hoja con el nombre "' + name + '". Ingresá otro nombre.');
    index = Math.max(0, Math.min(index, this._sheets.length));
    const sh = new FakeSheet(this, name);
    this._sheets.splice(index, 0, sh);
    this._active = sh;
    return sh;
  }
  deleteSheet(sh) {
    if (this._sheets.length <= 1) throw new Error('No se pueden eliminar todas las hojas de un documento.');
    const i = this._sheets.indexOf(sh);
    if (i < 0) throw new Error('La hoja no pertenece a esta planilla.');
    this._sheets.splice(i, 1);
    if (this._active === sh) this._active = this._sheets[0];
  }
  getActiveSheet() { return this._active; }
  setActiveSheet(sh) { if (this._sheets.indexOf(sh) < 0) throw new Error('Hoja inválida.'); this._active = sh; return sh; }
  moveActiveSheet(pos) {
    const sh = this._active;
    const i = this._sheets.indexOf(sh);
    this._sheets.splice(i, 1);
    this._sheets.splice(Math.max(0, Math.min(pos - 1, this._sheets.length)), 0, sh);
  }
  getRange(a1) {
    const m = /^'?(.+?)'?!(.+)$/.exec(String(a1));
    const sh = m ? this.getSheetByName(m[1]) : this._active;
    if (!sh) throw new Error('Rango inválido: ' + a1);
    return sh.getRange(m ? m[2] : a1);
  }
  toast() { return this; }
  getOwner() { return null; }
  getEditors() { return []; }
}

/* ---------- validación de datos ---------- */
const CRITERIA = [
  'VALUE_IN_LIST', 'VALUE_IN_RANGE', 'NUMBER_BETWEEN', 'NUMBER_NOT_BETWEEN', 'NUMBER_EQUAL_TO', 'NUMBER_NOT_EQUAL_TO',
  'NUMBER_GREATER_THAN', 'NUMBER_GREATER_THAN_OR_EQUAL_TO', 'NUMBER_LESS_THAN', 'NUMBER_LESS_THAN_OR_EQUAL_TO',
  'DATE_AFTER', 'DATE_BEFORE', 'DATE_IS_VALID_DATE', 'TEXT_CONTAINS', 'TEXT_DOES_NOT_CONTAIN', 'TEXT_EQUAL_TO',
  'TEXT_IS_VALID_EMAIL', 'TEXT_IS_VALID_URL', 'CHECKBOX', 'CUSTOM_FORMULA'
];
function newDataValidation() {
  const st = { criteria: null, values: [], allowInvalid: true, helpText: '' };
  const b = {
    requireValueInList(values, showDropdown) { st.criteria = 'VALUE_IN_LIST'; st.values = [Array.from(values || []), showDropdown !== false]; return b; },
    requireValueInRange(range, showDropdown) { st.criteria = 'VALUE_IN_RANGE'; st.values = [range, showDropdown !== false]; return b; },
    requireNumberBetween(a, z) { st.criteria = 'NUMBER_BETWEEN'; st.values = [a, z]; return b; },
    requireNumberGreaterThan(a) { st.criteria = 'NUMBER_GREATER_THAN'; st.values = [a]; return b; },
    requireNumberGreaterThanOrEqualTo(a) { st.criteria = 'NUMBER_GREATER_THAN_OR_EQUAL_TO'; st.values = [a]; return b; },
    requireNumberLessThan(a) { st.criteria = 'NUMBER_LESS_THAN'; st.values = [a]; return b; },
    requireNumberLessThanOrEqualTo(a) { st.criteria = 'NUMBER_LESS_THAN_OR_EQUAL_TO'; st.values = [a]; return b; },
    requireDate() { st.criteria = 'DATE_IS_VALID_DATE'; st.values = []; return b; },
    requireTextIsEmail() { st.criteria = 'TEXT_IS_VALID_EMAIL'; st.values = []; return b; },
    requireTextIsUrl() { st.criteria = 'TEXT_IS_VALID_URL'; st.values = []; return b; },
    requireTextContains(t) { st.criteria = 'TEXT_CONTAINS'; st.values = [t]; return b; },
    requireCheckbox(...v) { st.criteria = 'CHECKBOX'; st.values = v; return b; },
    requireFormulaSatisfied(f) { st.criteria = 'CUSTOM_FORMULA'; st.values = [f]; return b; },
    withCriteria(c, v) { st.criteria = c; st.values = v || []; return b; },
    setAllowInvalid(x) { st.allowInvalid = !!x; return b; },
    setHelpText(t) { st.helpText = String(t); return b; },
    build() {
      if (!st.criteria) throw new Error('La validación de datos no tiene criterio.');
      const rule = {
        getCriteriaType: () => st.criteria,
        getCriteriaValues: () => st.values.slice(),
        getAllowInvalid: () => st.allowInvalid,
        getHelpText: () => st.helpText,
        copy: () => newDataValidation().withCriteria(st.criteria, st.values.slice()).setAllowInvalid(st.allowInvalid).setHelpText(st.helpText)
      };
      return rule;
    }
  };
  return b;
}

/* ---------- runtime ---------- */
function createGasRuntime(opts) {
  opts = opts || {};
  const dir = path.resolve(opts.dir || path.join(__dirname, '..', '..', 'v3', 'gas'));
  const props = new Map();
  Object.entries(opts.properties || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) props.set(k, String(v)); });
  const tz = opts.timeZone || DEFAULT_TZ;
  const ssId = opts.spreadsheetId || props.get('SHEET_ID') || 'fake-spreadsheet-v3';
  const ss = new FakeSpreadsheet(ssId, opts.spreadsheetName || 'Docks · Abastecimiento V3 (memoria)', tz);
  const standalone = !!opts.standalone;
  const logs = [];
  const urlFetchCalls = [];
  let urlFetchHandler = null;
  let lockBusy = false;
  const verbose = !!opts.verbose;

  function pushLog(kind, args) {
    const line = args.map(a => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch (_e) { return String(a); } })())).join(' ');
    logs.push({ kind, line });
    if (logs.length > 2000) logs.shift();
    if (verbose) process.stdout.write('[gas ' + kind + '] ' + line + '\n');
  }

  function makeProperties(store) {
    const api = {
      getProperty: k => (store.has(String(k)) ? store.get(String(k)) : null),
      setProperty: (k, v) => { store.set(String(k), String(v)); return api; },
      deleteProperty: k => { store.delete(String(k)); return api; },
      getProperties: () => Object.fromEntries(store),
      setProperties: (obj, deleteAllOthers) => {
        if (deleteAllOthers) store.clear();
        Object.entries(obj || {}).forEach(([k, v]) => store.set(k, String(v)));
        return api;
      },
      deleteAllProperties: () => { store.clear(); return api; },
      getKeys: () => Array.from(store.keys())
    };
    return api;
  }
  const scriptProps = makeProperties(props);
  const userProps = makeProperties(new Map());
  const docProps = makeProperties(new Map());

  function makeLock() {
    let held = false;
    return {
      waitLock(ms) {
        if (lockBusy) throw new Error('Lock timeout: another process was holding the lock for too long.');
        held = true;
      },
      tryLock() { if (lockBusy) return false; held = true; return true; },
      releaseLock() { held = false; },
      hasLock() { return held; }
    };
  }

  const MimeType = {
    JSON: 'application/json', JAVASCRIPT: 'application/javascript', TEXT: 'text/plain', CSV: 'text/csv',
    XML: 'application/xml', RSS: 'application/rss+xml', ATOM: 'application/atom+xml', ICAL: 'text/calendar', VCARD: 'text/vcard'
  };
  function createTextOutput(content) {
    let text = content === undefined || content === null ? '' : String(content);
    let mime = MimeType.TEXT;
    const out = {
      getContent: () => text,
      setContent: c => { text = String(c); return out; },
      append: c => { text += String(c); return out; },
      getMimeType: () => mime,
      setMimeType: m => { mime = m; return out; },
      downloadAsFile: () => out,
      getFileName: () => null
    };
    return out;
  }

  function httpResponse(r) {
    if (r && typeof r.getResponseCode === 'function') return r;
    const code = r && r.code !== undefined ? r.code : 200;
    const body = r && r.body !== undefined ? (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) : '{"ok":true}';
    return {
      getResponseCode: () => code,
      getContentText: () => body,
      getHeaders: () => (r && r.headers) || {},
      getAllHeaders: () => (r && r.headers) || {},
      getBlob: () => ({ getDataAsString: () => body })
    };
  }
  const UrlFetchApp = {
    fetch(url, params) {
      const call = { url: String(url), params: params || {} };
      urlFetchCalls.push(call);
      const r = urlFetchHandler ? urlFetchHandler(call.url, call.params) : null;
      const res = httpResponse(r);
      if (res.getResponseCode() >= 400 && !(params && params.muteHttpExceptions)) {
        throw new Error('Request failed for ' + url + ' returned code ' + res.getResponseCode());
      }
      return res;
    },
    fetchAll(requests) {
      return (requests || []).map(rq => (typeof rq === 'string' ? UrlFetchApp.fetch(rq) : UrlFetchApp.fetch(rq.url, rq)));
    }
  };

  const SpreadsheetApp = {
    getActiveSpreadsheet: () => (standalone ? null : ss),
    getActive: () => (standalone ? null : ss),
    openById: id => {
      if (String(id) !== ss.getId()) throw new Error('No se encontró la planilla con ID ' + id + '.');
      return ss;
    },
    openByUrl: () => ss,
    getActiveSheet: () => ss.getActiveSheet(),
    setActiveSheet: sh => ss.setActiveSheet(sh),
    flush: () => {},
    newDataValidation,
    getUi: () => { throw new Error('No se puede llamar a SpreadsheetApp.getUi() desde este contexto.'); },
    DataValidationCriteria: Object.fromEntries(CRITERIA.map(c => [c, c])),
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    BorderStyle: { SOLID: 'SOLID', DOTTED: 'DOTTED', DASHED: 'DASHED', SOLID_MEDIUM: 'SOLID_MEDIUM', SOLID_THICK: 'SOLID_THICK', DOUBLE: 'DOUBLE' },
    WrapStrategy: { WRAP: 'WRAP', OVERFLOW: 'OVERFLOW', CLIP: 'CLIP' }
  };

  const Utilities = {
    formatDate,
    getUuid: () => crypto.randomUUID(),
    sleep: () => {},
    base64Encode: s => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64'),
    base64Decode: s => Array.from(Buffer.from(String(s), 'base64')),
    base64EncodeWebSafe: s => Buffer.from(String(s)).toString('base64url'),
    formatString: (fmt, ...args) => { let k = 0; return String(fmt).replace(/%[sd]/g, () => String(args[k++])); },
    Charset: { UTF_8: 'UTF-8', US_ASCII: 'US-ASCII' }
  };

  const loggerApi = { log: (...a) => { pushLog('log', a); return loggerApi; }, clear: () => {}, getLog: () => logs.map(l => l.line).join('\n') };
  const consoleApi = {
    log: (...a) => pushLog('log', a), info: (...a) => pushLog('info', a), warn: (...a) => pushLog('warn', a),
    error: (...a) => pushLog('error', a), time: () => {}, timeEnd: () => {}
  };

  const sandbox = {
    SpreadsheetApp,
    LockService: { getScriptLock: makeLock, getDocumentLock: makeLock, getUserLock: makeLock },
    PropertiesService: { getScriptProperties: () => scriptProps, getUserProperties: () => userProps, getDocumentProperties: () => docProps },
    CacheService: (() => {
      const mk = () => { const m = new Map(); return { get: k => (m.has(k) ? m.get(k) : null), put: (k, v) => { m.set(k, String(v)); }, remove: k => { m.delete(k); }, getAll: ks => Object.fromEntries(ks.filter(k => m.has(k)).map(k => [k, m.get(k)])), putAll: o => Object.entries(o).forEach(([k, v]) => m.set(k, String(v))), removeAll: ks => ks.forEach(k => m.delete(k)) }; };
      const script = mk(), user = mk(), doc = mk();
      return { getScriptCache: () => script, getUserCache: () => user, getDocumentCache: () => doc };
    })(),
    Utilities,
    ContentService: { createTextOutput, MimeType },
    UrlFetchApp,
    Session: {
      getScriptTimeZone: () => tz,
      getActiveUser: () => ({ getEmail: () => '' }),
      getEffectiveUser: () => ({ getEmail: () => 'fake@localhost' }),
      getTemporaryActiveUserKey: () => 'fake-user-key'
    },
    Logger: loggerApi,
    console: consoleApi
  };
  const context = vm.createContext(sandbox, { name: 'fake-gas' });

  if (!fs.existsSync(dir)) throw new Error('No existe el directorio de Apps Script: ' + dir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort();
  if (!files.length) throw new Error('No hay archivos .gs en ' + dir);
  files.forEach(f => {
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext(code, context, { filename: path.join(dir, f) });
  });

  function toEvent(e) {
    e = e || {};
    const parameter = Object.assign({}, e.parameter || {});
    Object.keys(parameter).forEach(k => { if (parameter[k] !== undefined && parameter[k] !== null) parameter[k] = String(parameter[k]); });
    const parameters = e.parameters || Object.fromEntries(Object.entries(parameter).map(([k, v]) => [k, [v]]));
    return Object.assign({}, e, { parameter, parameters, queryString: e.queryString || new URLSearchParams(parameter).toString(), contextPath: '', contentLength: -1 });
  }
  function output(out) {
    if (!out || typeof out.getContent !== 'function') return { text: out === undefined ? '' : String(out), mimeType: MimeType.TEXT };
    return { text: out.getContent(), mimeType: out.getMimeType() };
  }

  return {
    call(name, ...args) {
      const fn = context[name];
      if (typeof fn !== 'function') throw new Error('No existe la función global ' + name + ' en ' + dir);
      return fn.apply(context, args);
    },
    doGet(e) {
      if (typeof context.doGet !== 'function') throw new Error('No hay doGet en ' + dir);
      return output(context.doGet(toEvent(e)));
    },
    doPost(e) {
      if (typeof context.doPost !== 'function') throw new Error('No hay doPost en ' + dir);
      e = toEvent(e);
      const contents = e.postData && e.postData.contents !== undefined ? String(e.postData.contents) : '';
      e.postData = Object.assign({ type: 'text/plain', name: 'postData', length: contents.length }, e.postData || {}, { contents });
      return output(context.doPost(e));
    },
    sheet(name) {
      const sh = ss.getSheetByName(name);
      if (!sh) return null;
      return sh.getDataRange().getValues();
    },
    spreadsheet: ss,
    context,
    logs,
    urlFetchCalls,
    setUrlFetchHandler(fn) { urlFetchHandler = typeof fn === 'function' ? fn : null; },
    setLockBusy(b) { lockBusy = !!b; },
    setProperty(k, v) { scriptProps.setProperty(k, v); },
    getProperty(k) { return scriptProps.getProperty(k); },
    deleteProperty(k) { scriptProps.deleteProperty(k); },
    formatDate
  };
}

module.exports = { createGasRuntime, formatDate };
