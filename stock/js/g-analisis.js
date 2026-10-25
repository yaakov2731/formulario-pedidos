// Gerencia · Análisis de ventas por local y rango de fechas: medios de pago, franjas, sectores, rubros, top, pedidos a $0 y diferencias.
import { mount, h, fmtNum, fmtMoney, hoyISO, sumarDias } from './util.js';
import { ventasPedidosRango, ventasItemsRango, mensajeError } from './api.js';
import { cargarG, chipsLocal } from './datos.js';
import { analizar } from './analisis.js';
import { esqueleto, vacio, banner, subnav, barraFila, campo, SUBNAV_VENTAS } from './ui.js';

const pct = (f) => `${Math.round(f * 100)}%`;
const hh = (n) => `${String(n).padStart(2, '0')}:00`;
const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Análisis' }), h('p', { class: 'sub', text: 'Cómo se vendió en el local' }));
  mount(root, cab, subnav(SUBNAV_VENTAS, 'analisis'), esqueleto(3));
  await cargarG(['locales'], () => {});
  if (!ctx.alive()) return;

  const hoy = hoyISO();
  let desde = sumarDias(hoy, -6), hasta = hoy; let datos = null; let error = null; let cargando = false; let vez = 0;
  const chips = chipsLocal(() => cargar());
  const zona = h('div', { class: 'analisis' });

  const rango = (dias) => { hasta = hoyISO(); desde = sumarDias(hasta, -(dias - 1)); };
  const inpDesde = h('input', { class: 'input', type: 'date', id: 'a-desde', value: desde, 'aria-label': 'Desde', on: { change: (e) => { desde = e.target.value; cargar(); } } });
  const inpHasta = h('input', { class: 'input', type: 'date', id: 'a-hasta', value: hasta, 'aria-label': 'Hasta', on: { change: (e) => { hasta = e.target.value; cargar(); } } });
  const atajos = h('div', { class: 'chips', role: 'group', 'aria-label': 'Rango' }, [['Hoy', 1], ['7 días', 7], ['30 días', 30]].map(([t, n]) =>
    h('button', { class: 'chip', type: 'button', text: t, on: { click: () => { rango(n); inpDesde.value = desde; inpHasta.value = hasta; cargar(); } } })));

  async function cargar() {
    const mi = ++vez; cargando = true; error = null; pintar();
    try {
      if (!desde || !hasta || desde > hasta) throw new Error('Revisá las fechas: "desde" no puede ser posterior a "hasta".');
      const [pedidos, items] = await Promise.all([ventasPedidosRango(chips.get(), desde, hasta), ventasItemsRango(chips.get(), desde, hasta)]);
      if (mi !== vez) return;
      datos = analizar(pedidos, items);
    } catch (e) { if (mi !== vez) return; error = mensajeError(e); datos = null; }
    cargando = false; pintar();
  }

  const kpi = (t, v, n, tono) => h('div', { class: 'kpi' + (tono ? ' kpi-' + tono : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), n ? h('span', { class: 'kpi-n', text: n }) : null);
  const bloque = (titulo, ...kids) => h('section', { class: 'bloque' }, h('h2', { class: 'bloque-t', text: titulo }), ...kids);
  const lista = (arr, base, fmt = (a) => fmtMoney(a.total), det) => h('ul', { class: 'barras' }, arr.map(a => barraFila(a.k, fmt(a), base > 0 ? a.total / base : 0, det ? det(a) : pct(a.pct || 0))));

  function franja(d) {
    if (!d.porHora.length) return h('p', { class: 'mute centro', text: 'Sin horarios: subí el detalle por pedido.' });
    const max = Math.max(...d.porHora.map(x => x.total), 1);
    const pico = d.porHora.reduce((a, b) => (b.total > a.total ? b : a));
    return h('div', {}, h('div', { class: 'franja', role: 'img', 'aria-label': `Ventas por hora. Pico a las ${hh(pico.hora)}` },
      d.porHora.map(x => h('div', { class: 'franja-c', title: `${hh(x.hora)} · ${fmtMoney(x.total)} · ${x.pedidos} pedidos` },
        h('span', { class: 'franja-b', style: `height:${Math.max(4, Math.round((x.total / max) * 100))}%` }), h('span', { class: 'franja-h num', text: String(x.hora) })))),
      h('p', { class: 'sub', text: `Hora pico: ${hh(pico.hora)} · ${fmtMoney(pico.total)} en ${pico.pedidos} ${pico.pedidos === 1 ? 'pedido' : 'pedidos'}` }));
  }

  function pintarDatos(d) {
    if (!d.hayPedidos && !d.hayItems) return [vacio('No hay ventas en esas fechas', 'Importá el Excel de Núcleo en Ventas.')];
    const out = [];
    out.push(h('section', { class: 'kpis' },
      kpi(d.totalCobrado !== null ? 'Cobrado' : 'Vendido', fmtMoney(d.total), d.totalCobrado !== null ? `productos ${fmtMoney(d.totalProductos)}` : 'según productos'),
      kpi('Pedidos', fmtNum(d.nPedidos, 0)), kpi('Ticket promedio', fmtMoney(d.ticket)), kpi('Unidades', fmtNum(d.unidades, 0))));
    if (d.porPago.length) out.push(bloque('Por medio de pago', lista(d.porPago, d.totalCobrado, undefined, (a) => `${pct(a.pct)} · ${a.cantidad} ${a.cantidad === 1 ? 'pedido' : 'pedidos'}`)));
    out.push(bloque('Por franja horaria', franja(d)));
    if (d.porSector.length || d.porTipo.length) out.push(bloque('Por sector y tipo de pedido',
      d.porTipo.length ? lista(d.porTipo, d.totalProductos) : null, d.porSector.length ? lista(d.porSector, d.totalProductos) : null));
    if (d.porMozo.length) out.push(bloque('Por mozo', lista(d.porMozo, d.total, undefined, (a) => `${a.cantidad} pedidos`)));
    if (d.porRubro.length) out.push(bloque('Por rubro', lista(d.porRubro, d.totalProductos)));
    if (d.top.length) out.push(bloque('Productos más vendidos', h('ol', { class: 'top' }, d.top.slice(0, 15).map((a, i) =>
      h('li', { class: 'top-f' }, h('span', { class: 'top-i num', text: String(i + 1) }), h('span', { class: 'top-n', text: a.nombre }), h('b', { class: 'num', text: fmtNum(a.cantidad, 3) }), h('span', { class: 'top-m num', text: fmtMoney(a.total) }))))));
    if (d.diferencia) {
      const f = d.diferencia;
      out.push(bloque('Cobrado contra productos',
        h('section', { class: 'kpis' }, kpi('Cobrado', fmtMoney(f.cobrado)), kpi('Productos', fmtMoney(f.productos)), kpi('Diferencia', fmtMoney(f.dif), f.dif ? (f.dif > 0 ? 'cobraron de más' : 'cobraron de menos') : 'cuadra', f.dif ? 'warn' : null),
          kpi('Pedidos con diferencia', fmtNum(f.pedidosConDif, 0), f.pedidosConDif ? `suman ${fmtMoney(f.sumaDif)}` : null)),
        f.mayores.length ? h('ul', { class: 'barras' }, f.mayores.map(m => barraFila(`Pedido ${m.numero}`, fmtMoney(m.dif), Math.abs(m.dif) / Math.max(...f.mayores.map(x => Math.abs(x.dif))), [m.tipo, m.sector].filter(Boolean).join(' · ') || null))) : null));
    }
    out.push(bloque(`Pedidos a $0 · ${d.ceros.length}`, d.ceros.length ? h('div', { class: 'ceros' }, d.ceros.map(c => h('details', { class: 'cero' },
      h('summary', {}, h('b', { text: `Pedido ${c.numero}` }), h('span', { class: 'mute', text: ` · ${c.minutos !== null ? hm(c.minutos) : ''}${c.sector ? ' · ' + c.sector : ''} · ${fmtNum(c.unidades, 0)} unidades` })),
      h('ul', { class: 'cero-l' }, c.productos.map(p => h('li', {}, h('span', { text: p.nombre }), h('b', { class: 'num', text: fmtNum(p.cantidad, 3) }))))))) : h('p', { class: 'mute centro', text: 'No hubo pedidos a $0.' })));
    return out;
  }

  function pintar() {
    zona.replaceChildren(...(cargando ? [esqueleto(3)] : error ? [banner(error, 'error')] : datos ? pintarDatos(datos) : []));
  }

  mount(root, cab, subnav(SUBNAV_VENTAS, 'analisis'),
    h('div', { class: 'toolbar' }, chips.el, h('div', { class: 'dos' }, campo('Desde', inpDesde), campo('Hasta', inpHasta)), atajos), zona);
  cargar();
}
