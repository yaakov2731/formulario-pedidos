// Datos compartidos de gerencia (catálogo completo, proveedores con WhatsApp, locales, costos, stock).
import { h, lsGet, lsSet } from './util.js';
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

// Selector de local de gerencia (recuerda el último elegido). alCambiar(localId) se llama al tocar un local.
export function chipsLocal(alCambiar) {
  const locales = G.locales.filter(l => l.activo);
  let localId = lsGet('g:local');
  if (!locales.some(l => l.id === localId)) localId = (locales[0] || {}).id;
  const el = h('div', { class: 'chips', role: 'group', 'aria-label': 'Local' }, locales.map(l => h('button', {
    class: 'chip' + (l.id === localId ? ' is-on' : ''), type: 'button', text: l.nombre, 'aria-pressed': l.id === localId ? 'true' : 'false', 'data-local': l.id,
    on: { click: () => {
      localId = l.id; lsSet('g:local', localId);
      el.querySelectorAll('.chip').forEach(b => { const on = b.getAttribute('data-local') === l.id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      alCambiar(localId);
    } }
  })));
  return { el, get: () => localId };
}
