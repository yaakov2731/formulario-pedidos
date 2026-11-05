// Gerencia · Stock → Conteos: los conteos guardados de cada local (del encargado y de gerencia), con lo que faltó o sobró.
// Tocando uno se ve el detalle y se corrige: sacar un producto mal contado o borrar todo el conteo (0026_borrar_conteo.sql).
import { mount, h, fechaCorta } from './util.js';
import { listarConteos, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, banner, subnav, SUBNAV_STOCK } from './ui.js';
import { abrirConteo, TIPO_CONTEO } from './conteo-detalle.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Conteos' }),
    h('p', { class: 'sub', text: 'Lo que se contó en cada local. Si algo quedó mal, sacalo o borrá el conteo.' }));
  const nav = subnav(SUBNAV_STOCK, 'conteos');
  mount(root, cab, nav, esqueleto(4));
  try { await cargarG(['prods', 'locales']); } catch (e) { toast('No se pudo cargar: ' + mensajeError(e), 'error'); }
  if (!ctx.alive()) return;

  const lista = h('div', { class: 'lista' });
  let localId = null, conteos = [], pidiendo = 0;

  function tarjeta(c) {
    const its = c.items || [];
    const faltan = its.filter(it => Number(it.dif) < 0).length;
    const sobran = its.filter(it => Number(it.dif) > 0).length;
    const detalle = [faltan ? `${faltan} con faltante` : '', sobran ? `${sobran} con sobrante` : ''].filter(Boolean).join(' · ') || 'Sin diferencias';
    return h('button', { class: 'prod cnd-card', type: 'button', 'data-conteo': c.id, on: { click: () => abrirConteo(c, { prods: G.prods, gerencia: true, alCambiar: (nuevo) => {
      conteos = nuevo ? conteos.map(x => (x.id === nuevo.id ? nuevo : x)) : conteos.filter(x => x.id !== c.id);
      pintar();
    } }) } },
      h('h3', { class: 'prod-n' }, c.tipo ? h('span', { class: 'cnd-badge is-' + c.tipo, text: TIPO_CONTEO[c.tipo] }) : null, h('span', { text: fechaCorta(c.creado_en) })),
      h('p', { class: 'prod-m' },
        h('span', { text: c.encargado || 'Sin nombre' }),
        h('span', { text: `${its.length} ${its.length === 1 ? 'producto' : 'productos'}` }),
        h('span', { text: detalle })));
  }

  function pintar() {
    lista.replaceChildren(...(conteos.length ? conteos.map(tarjeta) : [vacio('Todavía no hay conteos', 'Aparecen cuando el encargado cuenta en Contar.')]));
  }

  async function cargar() {
    const yo = ++pidiendo;
    lista.replaceChildren(esqueleto(3));
    try {
      const d = await listarConteos(localId);
      if (yo !== pidiendo || !ctx.alive()) return;
      conteos = d; pintar();
    } catch (e) {
      if (yo !== pidiendo) return;
      const sinSQL = e && (e.code === '42P01' || /conteos/.test(e.message || ''));
      lista.replaceChildren(banner(sinSQL ? 'Falta activar Contar: hay que pegar el SQL 0024_conteos.sql en Supabase.' : 'No se pudo cargar: ' + mensajeError(e), sinSQL ? 'warn' : 'error'));
    }
  }

  const locales = chipsLocal((id) => { localId = id; cargar(); });
  localId = locales.get();
  mount(root, cab, nav, locales.el, lista);
  await cargar();
}
