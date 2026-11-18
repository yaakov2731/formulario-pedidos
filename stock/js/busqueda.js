// Catálogo inteligente: búsqueda que perdona errores de tipeo y ordena primero lo que más usa el local.
// Lo "más usado" sale de dos fuentes: los pedidos que el local envió (últimos 60, en el servidor) y lo que se tocó en este
// celular (pedir, contar, anotar en la hoja, retiros). Las dos pierden peso con el tiempo (vida media de 21 días),
// así un producto que se pidió mucho hace dos meses y ya no, baja solo. No inventa nada: sin historial, orden alfabético.
import { norm, tokens, lsGet, lsSet } from './util.js';

const DIA = 864e5;
const VIDA = 21 * DIA;
const peso = (t, ahora) => Math.pow(0.5, Math.max(0, ahora - t) / VIDA);

// ---------- uso en este celular ----------
const claveUso = (lid) => 'uso:' + (lid || '');
const MAX_USO = 400;
export function anotarUso(lid, id) {
  if (!lid || !id) return;
  const ahora = Date.now();
  const u = lsGet(claveUso(lid)) || {};
  const e = u[id];
  u[id] = { s: (e ? e.s * peso(e.t, ahora) : 0) + 1, t: ahora };
  const ks = Object.keys(u);
  if (ks.length > MAX_USO) ks.sort((a, b) => u[a].t - u[b].t).slice(0, ks.length - MAX_USO).forEach(k => delete u[k]);
  lsSet(claveUso(lid), u);
}

// Mapa id → { s: puntaje, veces, ult: fecha ms, ultCant: lo último que se pidió }.
export function frecuencia(lid, ordenes = [], ahora = Date.now()) {
  const m = new Map();
  const de = (id) => { let x = m.get(id); if (!x) { x = { s: 0, veces: 0, ult: 0, ultCant: null }; m.set(id, x); } return x; };
  for (const o of ordenes || []) {
    const t = Date.parse(o.creado_en) || 0;
    if (!t || ahora - t > 120 * DIA) continue;
    for (const i of o.orden_items || []) {
      const c = Number(i.cantidad_pedida);
      if (!(c > 0)) continue;
      const x = de(i.producto_id);
      x.s += peso(t, ahora); x.veces++;
      if (t > x.ult) { x.ult = t; x.ultCant = c; }
    }
  }
  const u = lsGet(claveUso(lid)) || {};
  for (const [id, e] of Object.entries(u)) {
    if (!e || !(e.s > 0)) continue;
    const x = de(id);
    x.s += 0.5 * e.s * peso(e.t, ahora); // lo tocado en el celular suma, pero menos que un pedido enviado
    if (e.t > x.ult) x.ult = e.t;
  }
  return m;
}

// Los más usados, de mayor a menor (solo los que tienen historial).
export function masUsados(prods, frec, n = 20) {
  return prods.filter(p => frec.has(p.id) && frec.get(p.id).s > 0.05)
    .sort((a, b) => frec.get(b.id).s - frec.get(a.id).s).slice(0, n);
}

// ---------- tolerancia a errores ----------
// Distancia de edición con trasposición ("chorzio" → "chorizo" es 1). Corta temprano si ya pasó el máximo.
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < minFila) minFila = v;
    }
    if (minFila > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
const tolerancia = (k) => (k.length >= 8 ? 2 : k.length >= 4 ? 1 : 0);

const IDX = new Map(); // texto → { t, palabras, junto }
function indice(texto) {
  let x = IDX.get(texto);
  if (!x) {
    if (IDX.size > 20000) IDX.clear();
    const t = norm(texto);
    x = { t, palabras: tokens(t), junto: t.replace(/[^a-z0-9]/g, '') };
    IDX.set(texto, x);
  }
  return x;
}

// Puntaje de un token contra un texto: 0 si no aparece.
function puntajeToken(k, ix) {
  let mejor = 0;
  for (const w of ix.palabras) {
    if (w === k) return 5;
    if (w.startsWith(k)) mejor = Math.max(mejor, 4);
  }
  if (mejor) return mejor;
  if (ix.t.includes(k)) return 2.5;
  if (k.length >= 4 && ix.junto.includes(k.replace(/[^a-z0-9]/g, ''))) return 2.2; // "cocacola" encuentra "Coca Cola"
  const tol = tolerancia(k);
  if (!tol) return 0;
  for (const w of ix.palabras) {
    // contra la palabra entera o contra su comienzo ("muzarela" → "muzzarella", "chorzo" → "chorizo parrillero")
    if (distancia(k, w, tol) <= tol || (w.length > k.length && distancia(k, w.slice(0, k.length), tol) <= tol)) return 1;
  }
  return 0;
}

// Busca y ordena: primero lo que coincide mejor; entre parecidos, lo que más usa el local; después alfabético.
// Devuelve [{ p, aprox }] donde aprox = encontrado por parecido (con algún error de tipeo).
export function buscar(prods, q, { frec = null, texto = (p) => p.nombre + ' ' + (p.codigo || ''), limite = 0 } = {}) {
  const toks = tokens(q);
  if (!toks.length) return prods.map(p => ({ p, aprox: false }));
  const primero = toks[0];
  const out = [];
  for (const p of prods) {
    const ix = indice(texto(p));
    let s = 0, aprox = false, ok = true;
    for (const k of toks) {
      const v = puntajeToken(k, ix);
      if (!v) { ok = false; break; }
      if (v === 1) aprox = true;
      s += v;
    }
    if (!ok) continue;
    if (norm(p.nombre).startsWith(primero)) s += 2;
    const f = frec && frec.get(p.id);
    if (f && f.s > 0) s += Math.min(4, 1.5 * Math.log2(1 + f.s));
    out.push({ p, aprox, s });
  }
  out.sort((a, b) => b.s - a.s || a.p.nombre.localeCompare(b.p.nombre, 'es'));
  return limite ? out.slice(0, limite) : out;
}

// Texto corto para mostrar el uso: "Última: 3 kg" (y cuántas veces, si se pide seguido).
export function textoUso(f, unidad = '') {
  if (!f || !f.veces || f.ultCant == null) return '';
  return `Última: ${String(f.ultCant).replace('.', ',')}${unidad ? ' ' + unidad : ''}` + (f.veces >= 3 ? ` · ${f.veces} pedidos` : '');
}
