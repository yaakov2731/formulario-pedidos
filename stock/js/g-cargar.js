// Gerencia · Cargar un pedido en nombre de un local: la misma pantalla Pedir del encargado, con selector de local.
// El pedido entra como cualquier otro (en revisión) y aparece en Pedidos.
import { h } from './util.js';
import { cargarG, chipsLocal } from './datos.js';
import * as pedir from './pedir.js';

export async function render(root, ctx, id) {
  await cargarG(['locales'], () => {});
  const cuerpo = h('div');
  let fin = null, ticket = 0;
  const abrir = async (lid) => {
    const mi = ++ticket;
    if (fin) { fin(); fin = null; }
    const c = {
      ...ctx, alive: () => ctx.alive() && mi === ticket, gerencia: true, rutaPedir: 'cargar',
      perfil: { ...ctx.perfil, local_id: lid, id: 'gerencia' },
      ir: (r) => ctx.ir(r === 'revisar' ? 'cargar-revisar' : (r === 'mis-pedidos' ? 'pedidos' : r))
    };
    const r = await pedir.render(cuerpo, c, id === 'cargar-revisar' ? 'revisar' : 'pedir');
    if (mi === ticket && typeof r === 'function') fin = r;
  };
  const sel = chipsLocal((lid) => abrir(lid));
  root.replaceChildren(
    h('a', { class: 'volver', href: '#/pedidos', text: '‹ Volver a Pedidos' }),
    h('div', { class: 'cargar-local' }, h('p', { class: 'cargar-k', text: 'Cargar pedido para' }), sel.el),
    cuerpo);
  await abrir(sel.get());
  return () => { ticket++; if (fin) fin(); };
}
