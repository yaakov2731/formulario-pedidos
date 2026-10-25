// Pagos · lista de pagos con su comprobante y si ya se avisó al proveedor. Desde acá se avisa por WhatsApp.
import { mount, h, fmtMoney } from './util.js';
import { swr, pagosLista, urlComprobante, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, banner, subnav, SUBNAV_PAGOS, toast, icon } from './ui.js';
import { fechaDMA, estadoAviso } from './pagos-util.js';
import { abrirAviso } from './aviso.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pagos' }), h('p', { class: 'sub', text: 'Pagos a proveedores y avisos' }));
  mount(root, cab, subnav(SUBNAV_PAGOS, 'historial'), esqueleto(4));
  let pagos = [], filtro = 'todos';
  const lista = h('div', { class: 'lista' });

  function pintarLista() {
    const vis = pagos.filter((p) => filtro === 'todos' || !p.avisado_en);
    if (!vis.length) return lista.replaceChildren(vacio(filtro === 'todos' ? 'Todavía no hay pagos' : 'No hay pagos sin avisar', filtro === 'todos' ? 'Subí un comprobante en "Cargar pago".' : 'Todos los proveedores ya están avisados.'));
    lista.replaceChildren(...vis.map((p) => {
      const prov = G.provs.get(p.proveedor_id);
      const avisado = !!p.avisado_en;
      return h('article', { class: 'prod', 'data-pago': p.numero_operacion || p.id },
        h('h3', { class: 'prod-n', text: prov ? prov.nombre : 'Proveedor' }),
        h('b', { class: 'cc-saldo num', text: fmtMoney(p.monto) }),
        h('p', { class: 'prod-m' }, h('span', { text: fechaDMA(p.fecha) }), p.numero_operacion ? h('span', { class: 'num', text: p.numero_operacion }) : null, p.concepto ? h('span', { text: p.concepto }) : null),
        h('span', { class: 'estado ' + (avisado ? 'estado-avisado' : 'estado-sinavisar'), text: estadoAviso(p) }),
        h('div', { class: 'pago-acc' },
          h('button', { class: 'btn ' + (avisado ? 'btn-ghost' : 'btn-primary'), type: 'button', 'data-accion': 'avisar', on: { click: () => abrirAviso(p, prov, { alAvisar: () => pintarLista() }) } },
            icon('whatsapp', 18), h('span', { text: avisado ? 'Volver a avisar' : 'Avisar por WhatsApp' })),
          p.comprobante_path ? h('button', { class: 'btn btn-ghost', type: 'button', text: 'Ver comprobante', on: { click: async () => {
            try { window.open(await urlComprobante(p.comprobante_path), '_blank', 'noopener'); } catch (e) { toast(mensajeError(e), 'error'); }
          } } }) : null));
    }));
  }

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtro' }, [['todos', 'Todos'], ['sin', 'Sin avisar']].map(([id, t]) =>
    h('button', { class: 'chip' + (id === filtro ? ' is-on' : ''), type: 'button', text: t, 'aria-pressed': id === filtro ? 'true' : 'false', 'data-filtro': id, on: { click: () => {
      filtro = id; chips.querySelectorAll('.chip').forEach((b) => { const on = b.getAttribute('data-filtro') === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      pintarLista();
    } } })));

  try {
    await cargarG(['provs'], () => {});
    if (!ctx.alive()) return;
    mount(root, cab, subnav(SUBNAV_PAGOS, 'historial'), h('div', { class: 'toolbar' }, chips), lista);
    await swr('p:pagos', () => pagosLista(80), (d) => { pagos = d; if (ctx.alive()) pintarLista(); });
  } catch (e) { mount(root, cab, subnav(SUBNAV_PAGOS, 'historial'), banner(mensajeError(e), 'error')); }
}
