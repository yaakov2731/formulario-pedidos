// Pagos · Cuentas: cuenta corriente por proveedor (facturado, pagado y saldo) con sus facturas pendientes.
import { mount, h, fmtMoney } from './util.js';
import { swr, cuentaCorriente, facturasLista, mensajeError } from './api.js';
import { cargarG } from './datos.js';
import { esqueleto, vacio, banner, subnav, SUBNAV_PAGOS } from './ui.js';
import { fechaDMA } from './pagos-util.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pagos' }), h('p', { class: 'sub', text: 'Lo que se debe a cada proveedor' }));
  mount(root, cab, subnav(SUBNAV_PAGOS, 'pagos'), esqueleto(4));
  let cuentas = [], facturas = [], error = null;
  const abiertos = new Set();

  const kpi = (t, v, n, tono) => h('div', { class: 'kpi' + (tono ? ' kpi-' + tono : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), n ? h('span', { class: 'kpi-n', text: n }) : null);

  function pintar() {
    if (!ctx.alive()) return;
    if (error) return mount(root, cab, subnav(SUBNAV_PAGOS, 'pagos'), banner(error, 'error'));
    const filas = cuentas.filter((c) => Number(c.facturado) > 0 || Number(c.pagado) > 0);
    const deuda = filas.reduce((s, c) => s + Math.max(0, Number(c.saldo)), 0);
    const venc = facturas.filter((f) => f.vencida);
    const vencTot = venc.reduce((s, f) => s + Number(f.pendiente), 0);
    const tarjeta = (c) => {
      const fs = facturas.filter((f) => f.proveedor_id === c.proveedor_id);
      const nVenc = fs.filter((f) => f.vencida).length;
      const abierto = abiertos.has(c.proveedor_id);
      const saldo = Number(c.saldo);
      return h('article', { class: 'prod cc-fila', 'data-prov': c.nombre },
        h('h3', { class: 'prod-n', text: c.nombre }),
        h('b', { class: 'cc-saldo num' + (saldo > 0 ? ' debe' : ''), text: saldo > 0 ? fmtMoney(saldo) : (saldo < 0 ? `${fmtMoney(-saldo)} a favor` : 'Al día') }),
        h('div', { class: 'cc-det' },
          h('span', {}, 'Facturado', h('b', { text: fmtMoney(c.facturado) })), h('span', {}, 'Pagado', h('b', { text: fmtMoney(c.pagado) })), h('span', {}, 'Saldo', h('b', { text: fmtMoney(saldo) }))),
        nVenc ? h('span', { class: 'estado estado-vencida', text: `${nVenc} ${nVenc === 1 ? 'factura vencida' : 'facturas vencidas'}` }) : null,
        fs.length ? h('button', { class: 'btn btn-text btn-sm', type: 'button', 'aria-expanded': abierto ? 'true' : 'false', text: abierto ? 'Ocultar facturas' : `Ver ${fs.length} ${fs.length === 1 ? 'factura pendiente' : 'facturas pendientes'}`,
          on: { click: () => { if (abiertos.has(c.proveedor_id)) abiertos.delete(c.proveedor_id); else abiertos.add(c.proveedor_id); pintar(); } } }) : null,
        abierto ? h('ul', { class: 'tb-lista', style: 'width:100%' }, fs.map((f) => h('li', { class: f.vencida ? 'var-baja' : '' },
          h('span', { text: `${f.numero} · vence ${f.vencimiento ? fechaDMA(f.vencimiento) : 'sin fecha'}${f.vencida ? ' · vencida' : ''}` }), h('b', { class: 'num', text: fmtMoney(f.pendiente) })))) : null);
    };
    mount(root, cab, subnav(SUBNAV_PAGOS, 'pagos'),
      h('section', { class: 'kpis' }, kpi('Deuda total', fmtMoney(deuda), `${filas.filter((c) => Number(c.saldo) > 0).length} proveedores`, deuda ? 'warn' : null),
        kpi('Vencido', fmtMoney(vencTot), `${venc.length} ${venc.length === 1 ? 'factura' : 'facturas'}`, venc.length ? 'warn' : null)),
      filas.length ? h('div', { class: 'lista' }, filas.sort((a, b) => Number(b.saldo) - Number(a.saldo)).map(tarjeta))
        : vacio('Todavía no hay facturas ni pagos', 'Cargá una factura o un comprobante de pago para empezar.'));
  }

  try {
    await cargarG(['provs'], () => {});
    await Promise.all([
      swr('p:cc', cuentaCorriente, (d) => { cuentas = d; pintar(); }),
      swr('p:fac', () => facturasLista(true), (d) => { facturas = d; pintar(); })]);
  } catch (e) { error = mensajeError(e); }
  pintar();
}
