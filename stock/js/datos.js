// Datos compartidos de gerencia (catálogo completo, proveedores con WhatsApp, locales, costos, stock).
import { h, lsGet, lsSet } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarProveedores, cargarLocales, cargarPrecios } from './api.js';

export const G = { prods: new Map(), provs: new Map(), locales: [], precios: new Map(), stock: new Map(), listo: false };
const jj = {};
const pon = (k, fn, aviso) => (d) => { const j = JSON.stringify(d); if (jj[k] === j) return; jj[k] = j; fn(d); if (aviso) aviso(); };

// Lo bajado hace poco se reusa de memoria al cambiar de pantalla (antes cada pantalla volvía a bajar miles de productos y precios).
// Lo que gerencia edita se actualiza en G en el momento; el stock cambia por otros (ventas, recepciones) y se renueva más seguido.
const VIGENCIA = { prods: 120e3, provs: 120e3, locales: 120e3, precios: 120e3, stock: 30e3 };
const bajado = {};
const vigente = (k) => bajado[k] && Date.now() - bajado[k] < VIGENCIA[k];
window.addEventListener('stock:salir', () => { for (const k of Object.keys(bajado)) delete bajado[k]; });
const marca = (k, fn) => (d, cache, err) => { if (!cache && !err) bajado[k] = Date.now(); fn(d, cache, err); };

// quiere: subconjunto de ['prods','provs','locales','precios','stock']
export async function cargarG(quiere, alCambiar) {
  const t = [];
  const pide = (k) => quiere.includes(k) && !vigente(k);
  if (pide('prods')) t.push(swr('g:cat', () => cargarCatalogo(null), marca('prods', pon('prods', d => { G.prods = new Map(d.map(p => [p.id, p])); }, alCambiar))));
  if (pide('provs')) t.push(swr('g:prov', cargarProveedores, marca('provs', pon('provs', d => { G.provs = new Map(d.map(p => [p.id, p])); }, alCambiar))));
  if (pide('locales')) t.push(swr('g:loc', cargarLocales, marca('locales', pon('locales', d => { G.locales = d; }, alCambiar))));
  if (pide('precios')) t.push(swr('g:prec', cargarPrecios, marca('precios', pon('precios', d => { G.precios = new Map(d.map(r => [r.producto_id, Number(r.precio)])); }, alCambiar))));
  if (pide('stock')) t.push(swr('g:stk', () => cargarStock(null), marca('stock', pon('stock', d => { G.stock = new Map(d.map(r => [r.local_id + '|' + r.producto_id, Number(r.stock)])); }, alCambiar))));
  const res = await Promise.allSettled(t);
  G.listo = true;
  const f = res.find(r => r.status === 'rejected');
  if (f) throw f.reason;
}
// Razón social con la que compra el local (sale en las órdenes a los proveedores).
export const razonLocal = (id) => { const l = G.locales.find(x => x.id === id); return (l && l.razon_social) || ''; };
export const codigoLocal = (id) => { const l = G.locales.find(x => x.id === id); return l ? l.codigo : ''; };
export const nombreLocal = (id) => { const l = G.locales.find(x => x.id === id); return l ? l.nombre : 'Local'; };
export const refrescarPrecio = (productoId, precio) => G.precios.set(productoId, precio);

// Selector de local de gerencia (recuerda el último elegido). alCambiar(localId) se llama al tocar un local.
export function chipsLocal(alCambiar, filtro) {
  const locales = G.locales.filter(l => l.activo && (!filtro || filtro(l)));
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
