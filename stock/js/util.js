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

const normar = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Memoriza: con miles de productos, el buscador normaliza los mismos nombres en cada tecla.
const NORM = new Map();
export const norm = (t) => {
  if (typeof t !== 'string') return normar(t);
  let v = NORM.get(t);
  if (v === undefined) { if (NORM.size > 50000) NORM.clear(); v = normar(t); NORM.set(t, v); }
  return v;
};

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

// Montos en pesos: "480.000" son 480 mil (punto de miles sin coma decimal); el resto como parseNum.
export const parseMonto = (s) => (/^\$?\s*\d{1,3}(\.\d{3})+$/.test(String(s == null ? '' : s).trim()) ? Number(String(s).replace(/[^\d]/g, '')) : parseNum(String(s == null ? '' : s).replace(/^\$\s*/, '')));
export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
// Un solo Intl.Collator: localeCompare con idioma arma uno nuevo en cada comparación y ordenar miles de nombres se traba.
const COLL = new Intl.Collator('es', { sensitivity: 'base' });
export const porTexto = (a, b) => COLL.compare(String(a), String(b));

// Pinta una lista larga por tandas: los primeros `tanda` nodos ya, y el resto a medida que se acerca el final al scrollear.
// `nodos` son funciones que crean cada nodo (se crean solo cuando se muestran). `inicial`: cuántos mostrar de entrada como mínimo
// (al repintar en el lugar se pasa lista._n, lo que ya se veía, para no perder la posición del scroll).
export function porTandas(lista, nodos, tanda = 60, inicial = 0) {
  if (lista._tandas) lista._tandas.disconnect();
  lista._tandas = null;
  let i = 0;
  const sig = (n = tanda) => { const out = []; const fin = Math.min(nodos.length, i + n); for (; i < fin; i++) out.push(nodos[i]()); lista._n = i; return out; };
  const primera = sig(Math.max(tanda, inicial || 0));
  if (i >= nodos.length) { lista.replaceChildren(...primera); return; }
  const mas = h('button', { class: 'btn btn-ghost btn-block tandas-mas', type: 'button', text: 'Ver más' });
  const centinela = h('div', { class: 'tandas' }, mas);
  const seguir = () => {
    centinela.before(...sig());
    const io = lista._tandas;
    if (i >= nodos.length) { centinela.remove(); if (io) io.disconnect(); return; }
    if (io) { io.unobserve(centinela); io.observe(centinela); } // si el final sigue a la vista, vuelve a avisar
  };
  mas.addEventListener('click', seguir);
  lista.replaceChildren(...primera, centinela);
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) seguir(); }, { rootMargin: '800px 0px' });
    io.observe(centinela);
    lista._tandas = io;
  }
}

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

// ---- presentación: se compra por bulto (unidad_compra) y se usa en unidad_uso; cada bulto trae factor_conversion ----
// Ej. bolsa de papas de 5 kg: unidad_compra 'bolsa', unidad_uso 'kg', factor 5. Stock y recetas van en kg.
const BASE_U = { kg: ['kg', 1000], kilo: ['kg', 1000], kilos: ['kg', 1000], g: ['kg', 1], gr: ['kg', 1], gramos: ['kg', 1],
  litro: ['l', 1000], litros: ['l', 1000], l: ['l', 1000], lt: ['l', 1000], cc: ['l', 1], ml: ['l', 1] };
const baseU = (u) => BASE_U[norm(u || '')] || null;
export const factorDe = (p) => Number(p && p.factor_conversion) || 1;
export const esBulto = (p) => !!(p && p.unidad_compra && p.unidad_uso && norm(p.unidad_compra) !== norm(p.unidad_uso));
// bolsa → bolsas, unidad → unidades, bidón → bidones; abreviaturas y medidas con números quedan igual.
export function plural(u, n) {
  const t = String(u || '');
  if (!t || Number(n) === 1 || !/^[a-záéíóúñ]{3,}$/i.test(t) || baseU(t)) return t;
  if (/ón$/i.test(t)) return t.slice(0, -2) + 'ones';
  return /[aeiou]$/i.test(t) ? t + 's' : t + 'es';
}
export const cantU = (n, u) => `${fmtNum(n, 2) || '0'}${u ? ' ' + plural(u, n) : ''}`;
// "2,3 bolsas (11,5 kg)" si se compra por bulto; si no, "11,5 kg".
export function textoStock(p, s) {
  const uso = cantU(s, p && p.unidad_uso);
  return esBulto(p) ? `${cantU(Math.round(s / factorDe(p) * 10) / 10, p.unidad_compra)} (${uso})` : uso;
}
// "1 bolsa = 5 kg" o '' si se compra y se usa igual.
export const textoBulto = (p) => esBulto(p) ? `1 ${p.unidad_compra} = ${fmtNum(factorDe(p), 3)} ${p.unidad_uso}` : '';
// En recetas lo que se mide en kilos o litros se carga en gramos o cc.
export function medidaReceta(p) {
  const u = p && p.unidad_uso;
  const b = baseU(u);
  if (b && b[1] === 1000) return { u: b[0] === 'kg' ? 'g' : 'cc', mult: 1000 };
  return { u: u || 'unidad', mult: 1 };
}
// Cuánto multiplicar lo ya cargado al pasar de una unidad de uso a otra. Si las dos son peso o volumen se sabe solo
// (kg → g = 1000); si no, se toma que el bulto es el mismo (paquete de 5 kg → kg: lo de antes × factor nuevo ÷ viejo).
export function escalaPresentacion(antes, despues) {
  if (norm(antes.unidad_uso || '') === norm(despues.unidad_uso || '')) return 1;
  const a = baseU(antes.unidad_uso), d = baseU(despues.unidad_uso);
  if (a && d && a[0] === d[0]) return a[1] / d[1];
  return factorDe(despues) / factorDe(antes);
}

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
