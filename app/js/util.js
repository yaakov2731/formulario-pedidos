// Docks app · utilidades puras (sin DOM). Reglas numéricas y de semana iguales al contrato V3 §2 y §3.5.

export const UNIDADES = ['kg', 'g', 'litro', 'ml', 'unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];
export const CONTABLES = ['unidad', 'paquete', 'caja', 'bolsa', 'docena', 'atado', 'bandeja', 'lata', 'botella', 'horma', 'balde'];
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- texto ---------- */
export function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function texto(v, max = 200) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function plural(n, uno, varios) {
  return Number(n) === 1 ? uno : varios;
}

export function esContable(unidad) {
  return CONTABLES.includes(String(unidad || '').toLowerCase());
}

/* ---------- números ---------- */
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v == null ? '' : v).replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function inputNum(n) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '';
  return String(Math.round(Number(n) * 1000) / 1000).replace('.', ',');
}

export function fmtNum(n, unidad) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
  const txt = Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  return unidad ? `${txt} ${unidad}` : txt;
}

export function fmtMoney(n) {
  if (n === null || n === undefined || n === '' || !Number.isFinite(Number(n))) return '—';
  return '$ ' + Math.round(Number(n)).toLocaleString('es-AR');
}

export function redondear(q, unidad) {
  if (q === null || q === undefined) return q;
  if (esContable(unidad)) return Math.ceil(q - 1e-9);
  return Math.ceil(q * 10 - 1e-9) / 10;
}

export function paso(unidad) {
  if (esContable(unidad)) return 1;
  if (unidad === 'g' || unidad === 'ml') return 100;
  return 0.5;
}

/* ---------- sugerido (contrato §3.5) ---------- */
export function sugerido(p = {}) {
  const par = parseNum(p.par);
  const stock = parseNum(p.stock_actual);
  const abierto = parseNum(p.pedido_abierto) || 0;
  if (par === null) return { cantidad: null, motivo: 'SIN_PAR' };
  if (stock === null) return { cantidad: null, motivo: 'SIN_CONTEO' };
  const q = Math.max(0, redondear(Math.max(0, par - stock - abierto), p.unidad));
  return { cantidad: q, motivo: 'OK' };
}

export function estadoStock(par, stock) {
  const p = parseNum(par);
  const s = parseNum(stock);
  if (s === null) return 'SIN_CONTEO';
  if (p === null) return 'SIN_PAR';
  if (s <= 0) return 'SIN_STOCK';
  if (s < p) return 'BAJO';
  return 'OK';
}

/* Conteo que parece mal cargado: 10 veces o más el último conteo o el par, o, sin referencia,
   200 o más en kg/litro (casi siempre son gramos o mililitros). Devuelve el motivo o null. */
export function conteoSospechoso(cantidad, p = {}) {
  const q = parseNum(cantidad);
  if (q === null || q <= 0) return null;
  const refs = [parseNum(p.stock_actual), parseNum(p.par)].filter(x => x !== null && x > 0);
  if (refs.length) {
    const ref = Math.max(...refs);
    return q >= ref * 10 && q - ref >= 20 ? `Es mucho más que lo habitual (${fmtNum(ref, p.unidad)}).` : null;
  }
  if ((p.unidad === 'kg' || p.unidad === 'litro') && q >= 200) return `¿No serán ${p.unidad === 'kg' ? 'gramos' : 'mililitros'}?`;
  return null;
}

/* Cierre semanal de pedidos: se pide antes del jueves; Distribuidora Florida acepta el viernes para el sábado. */
export const CIERRE_PEDIDOS = { dia: 4, excepcion: 'Distribuidora Florida', diaExcepcion: 5 };
export function avisoCierre(ahora = new Date(), { yaPidio = false } = {}) {
  const d = ahora.getDay();
  const { excepcion } = CIERRE_PEDIDOS;
  if (yaPidio) return null;
  if (d === CIERRE_PEDIDOS.dia - 1) return { kind: 'warn', texto: `Hoy es el último día para pedir. A ${excepcion} se le puede pedir hasta el viernes.` };
  if (d === CIERRE_PEDIDOS.dia || d === CIERRE_PEDIDOS.diaExcepcion) return { kind: 'plain', texto: `Los pedidos de la semana ya cerraron. Solo ${excepcion} recibe pedidos hasta el viernes para el sábado.` };
  return null;
}

/* ---------- fechas ---------- */
const pad =(n, w = 2) => String(n).padStart(w, '0');

export function parseFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isoDia(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fechaCorta(v) {
  const d = parseFecha(v);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fechaLarga(v) {
  const d = parseFecha(v);
  if (!d) return '—';
  return `${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
}

export function fechaRelativa(v, ahora = new Date()) {
  const d = parseFecha(v);
  if (!d) return '—';
  const dias = haceDias(d, ahora);
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  if (dias > 1 && dias < 7) return `hace ${dias} días`;
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

export function haceDias(v, ahora = new Date()) {
  const d = parseFecha(v);
  if (!d) return null;
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  return Math.round((hoy - x) / 864e5);
}

export function semanaDe(fecha) {
  const d = fecha ? new Date(fecha) : new Date();
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (dia.getDay() + 6) % 7;
  const inicio = new Date(dia); inicio.setDate(dia.getDate() - dow);
  const fin = new Date(inicio); fin.setDate(inicio.getDate() + 6);
  const jueves = new Date(inicio); jueves.setDate(inicio.getDate() + 3);
  const anio = jueves.getFullYear();
  const primero = new Date(anio, 0, 4);
  const inicioPrimera = new Date(primero); inicioPrimera.setDate(primero.getDate() - ((primero.getDay() + 6) % 7));
  const num = 1 + Math.round((inicio - inicioPrimera) / (7 * 864e5));
  const mismoMes = inicio.getMonth() === fin.getMonth();
  const label = mismoMes
    ? `Semana ${num}, ${inicio.getDate()} al ${fin.getDate()} de ${MESES_LARGO[fin.getMonth()]}`
    : `Semana ${num}, ${inicio.getDate()} de ${MESES_LARGO[inicio.getMonth()]} al ${fin.getDate()} de ${MESES_LARGO[fin.getMonth()]}`;
  return { id: `${anio}-W${pad(num)}`, num, label, inicio: isoDia(inicio), fin: isoDia(fin) };
}

/* ---------- ids (contrato §2) ---------- */
export function nuevoId(prefijo = 'OP') {
  const d = new Date();
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let rnd = '';
  const bytes = new Uint8Array(4);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < 4; i++) rnd += abc[bytes[i] % abc.length];
  return `${String(prefijo).toUpperCase()}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${rnd}`;
}

export const ID_RE = /^[A-Z]{2,4}-\d{8}-\d{6}-[a-z0-9]{4}$/;

/* ---------- almacenamiento ---------- */
const PREFIX = 'docksapp:';
export const store = {
  get(k, def) {
    try {
      const raw = globalThis.localStorage.getItem(PREFIX + k);
      return raw === null ? def : JSON.parse(raw);
    } catch (_e) { return def; }
  },
  set(k, v) {
    try { globalThis.localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch (_e) { return false; }
  },
  del(k) {
    try { globalThis.localStorage.removeItem(PREFIX + k); } catch (_e) { /* sin almacenamiento */ }
  },
  keys(prefijo = '') {
    const out = [];
    try {
      for (let i = 0; i < globalThis.localStorage.length; i++) {
        const k = globalThis.localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefijo)) out.push(k.slice(PREFIX.length));
      }
    } catch (_e) { /* sin almacenamiento */ }
    return out;
  }
};

/* ---------- varios ---------- */
export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function agrupar(lista, clave) {
  const map = new Map();
  for (const x of lista) {
    const k = typeof clave === 'function' ? clave(x) : x[clave];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }
  return map;
}

export function ordenarTexto(a, b) {
  return norm(a).localeCompare(norm(b), 'es');
}

export function soloDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}

export function waUrl(whatsapp, texto) {
  const d = soloDigitos(whatsapp);
  return `https://wa.me/${d}?text=${encodeURIComponent(texto || '')}`;
}

// Pegado desde Excel / Sheets: filas separadas por salto de línea, celdas por tabulación.
export function parsearTabla(textoPegado) {
  return String(textoPegado || '').replace(/\r/g, '').split('\n')
    .map(r => r.split('\t').map(c => texto(c, 500)))
    .filter(r => r.some(c => c !== ''));
}

/* ---------- datos pendientes del catálogo ---------- */
export const FALTAS = { proveedor: 'Sin proveedor', precio: 'Sin precio', conteo: 'Nunca contado' };
export function faltasProducto(p = {}) {
  const f = [];
  if (!String(p.proveedor || '').trim()) f.push('proveedor');
  if (parseNum(p.precio) === null) f.push('precio');
  if (parseNum(p.stock_actual) === null) f.push('conteo');
  return f;
}
/* Resumen por local: total y % completo de cada dato, sólo productos activos. */
export function resumenDatos(productos = []) {
  const por = new Map();
  for (const p of productos) {
    if ((p.estado || 'Activo') !== 'Activo') continue;
    const r = por.get(p.local) || { local: p.local, total: 0, proveedor: 0, precio: 0, conteo: 0 };
    r.total++;
    const f = faltasProducto(p);
    for (const k of Object.keys(FALTAS)) if (!f.includes(k)) r[k]++;
    por.set(p.local, r);
  }
  return [...por.values()].map(r => ({ ...r, pct: Object.fromEntries(Object.keys(FALTAS).map(k => [k, r.total ? Math.round(r[k] * 100 / r.total) : 0])) }));
}
