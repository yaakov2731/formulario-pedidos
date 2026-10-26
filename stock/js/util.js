// Utilidades sin dependencias: DOM, texto, números, caché local y reglas de pedido.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export function mount(el, ...kids) { el.replaceChildren(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); }

export const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Búsqueda tolerante: sin acentos ni mayúsculas y en singular (limones → limon, nueces → nuez, papas → papa).
const raiz = (w) => w.length > 4 && w.endsWith('ces') ? w.slice(0, -3) + 'z' : w.length > 4 && /[^aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
export const tokens = (q) => norm(q).split(' ').filter(Boolean).map(raiz);
export const coincide = (texto, toks) => { const t = norm(texto); return toks.every(k => t.includes(k)); };

export function fmtNum(n, dec = 2) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: dec });
}
// Sin centavos salvo que el monto los tenga (comprobantes y facturas pueden traerlos).
export const fmtMoney = (n) => {
  const v = Number(n || 0);
  const dec = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

export function parseNum(s) {
  if (typeof s === 'number') return s;
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (!t) return null;
  const v = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(v) ? v : null;
}

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
export const porTexto = (a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = () => { clearTimeout(t); };
  return d;
}

export function fechaCorta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dia = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${dia} · ${hora}`;
}

// ---- caché local (stale-while-revalidate) ----
export function lsGet(k, def = null) { try { const v = localStorage.getItem('stock:' + k); return v == null ? def : JSON.parse(v); } catch (_e) { return def; } }
export function lsSet(k, v) { try { localStorage.setItem('stock:' + k, JSON.stringify(v)); } catch (_e) { /* cuota o modo privado */ } }
export function lsDel(k) { try { localStorage.removeItem('stock:' + k); } catch (_e) { /* nada */ } }

// ---- reglas de pedido ----
// Respaldo del sugerido (cantidad ideal menos stock) para cuando el servidor todavía no tiene sugerido_pedido (migración 0003).
export function sugerido(prod, stock) {
  if (prod.par === null || prod.par === undefined || prod.par === '') return null;
  const s = Math.max(0, Number(prod.par) - Number(stock || 0));
  return s > 0 ? Math.round(s * 1000) / 1000 : null;
}

// Aviso de cierre según el día de la semana (0 domingo … 6 sábado).
export function avisoCierre(fecha = new Date()) {
  const d = fecha.getDay();
  if (d >= 1 && d <= 3) return { tipo: 'ok', texto: 'Pedidos abiertos hasta el miércoles.' };
  if (d === 4 || d === 5) return { tipo: 'warn', texto: 'Pasó el miércoles: hoy solo se pide a Distribuidora Florida (entrega el sábado). Lo demás espera a la semana próxima.', soloFlorida: true };
  return { tipo: 'info', texto: 'Los pedidos de la semana se hacen hasta el miércoles. Podés dejar cargado lo que necesitás.' };
}
export const esFlorida = (nombre) => /florida/i.test(nombre || '');
export const esMartin = (nombre) => /ridder/i.test(nombre || '');

export const ESTADOS = {
  borrador: 'En revisión', aprobada: 'Aprobado', enviada: 'Enviado al proveedor',
  recibida: 'Recibido', parcial: 'Recibido parcial', cancelada: 'Cancelado'
};

// ---- fechas (día calendario, en texto aaaa-mm-dd) ----
const pad = (n) => String(n).padStart(2, '0');
export const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoyISO = () => aISO(new Date());
export function sumarDias(iso, n) { const [y, m, d] = iso.split('-').map(Number); return aISO(new Date(y, m - 1, d + n)); }
export function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Los platos de la carta (productos elaborados que se venden, no se compran) no se piden ni se cuentan.
export const esCarta = (p) => p && p.categoria === 'Carta';

// ---- notas del equipo ----
// Etiquetas: minúsculas, sin # ni espacios, sin repetir.
export const limpiarEtiquetas = (arr) => [...new Set((arr || []).map(t => String(t).toLowerCase().replace(/^#+/, '').replace(/[^a-z0-9ñáéíóúü_-]/g, '')).filter(Boolean))].slice(0, 6);

// Carpetas del tablero. Las resueltas solo aparecen en su carpeta.
export const CARPETAS = [
  ['todas', 'Todas', 'bandeja'],
  ['gerencia', 'Para gerencia', 'persona'],
  ['equipo', 'Para el equipo', 'equipo'],
  ['de-gerencia', 'De gerencia', 'nota'],
  ['resueltas', 'Resueltas', 'check']
];
export function enCarpeta(n, c) {
  if (c === 'resueltas') return !!n.resuelta_en;
  if (n.resuelta_en) return false;
  if (c === 'gerencia') return n.autor_rol === 'encargado' && n.para === 'gerencia';
  if (c === 'equipo') return n.autor_rol === 'encargado' && n.para === 'equipo';
  if (c === 'de-gerencia') return n.autor_rol === 'gerencia';
  return true;
}
