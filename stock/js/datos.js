// Datos compartidos de gerencia (catálogo completo, proveedores con WhatsApp, locales, costos, stock).
import { swr, cargarCatalogo, cargarStock, cargarProveedores, cargarLocales, cargarPrecios } from './api.js';

export const G = { prods: new Map(), provs: new Map(), locales: [], precios: new Map(), stock: new Map(), listo: false };
const jj = {};
const pon = (k, fn, aviso) => (d) => { const j = JSON.stringify(d); if (jj[k] === j) return; jj[k] = j; fn(d); if (aviso) aviso(); };

// quiere: subconjunto de ['prods','provs','locales','precios','stock']
export async function cargarG(quiere, alCambiar) {
  const t = [];
  if (quiere.includes('prods')) t.push(swr('g:cat', () => cargarCatalogo(null), pon('prods', d => { G.prods = new Map(d.map(p => [p.id, p])); }, alCambiar)));
  if (quiere.includes('provs')) t.push(swr('g:prov', cargarProveedores, pon('provs', d => { G.provs = new Map(d.map(p => [p.id, p])); }, alCambiar)));
  if (quiere.includes('locales')) t.push(swr('g:loc', cargarLocales, pon('locales', d => { G.locales = d; }, alCambiar)));
  if (quiere.includes('precios')) t.push(swr('g:prec', cargarPrecios, pon('precios', d => { G.precios = new Map(d.map(r => [r.producto_id, Number(r.precio)])); }, alCambiar)));
  if (quiere.includes('stock')) t.push(swr('g:stk', () => cargarStock(null), pon('stock', d => { G.stock = new Map(d.map(r => [r.local_id + '|' + r.producto_id, Number(r.stock)])); }, alCambiar)));
  const res = await Promise.allSettled(t);
  G.listo = true;
  const f = res.find(r => r.status === 'rejected');
  if (f) throw f.reason;
}
export const nombreLocal = (id) => { const l = G.locales.find(x => x.id === id); return l ? l.nombre : 'Local'; };
export const refrescarPrecio = (productoId, precio) => G.precios.set(productoId, precio);
