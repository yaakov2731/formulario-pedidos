// Gerencia · Merma y control: consumo teórico (ventas + producción) contra los ajustes por conteo, valuados al costo actual.
import { mount, h, fmtNum, fmtMoney, hoyISO, sumarDias } from './util.js';
import { mermaControl, mensajeError } from './api.js';
import { cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, banner, subnav, barraFila, campo, SUBNAV_VENTAS } from './ui.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Merma' }), h('p', { class: 'sub', text: 'Lo que debería haber contra lo que se contó' }));
  mount(root, cab, subnav(SUBNAV_VENTAS, 'merma'), esqueleto(3));
  await cargarG(['locales'], () => {});
  if (!ctx.alive()) return;

  const hoy = hoyISO();
  let desde = sumarDias(hoy, -6), hasta = hoy; let filas = null; let error = null; let cargando = false; let vez = 0;
  const chips = chipsLocal(() => cargar());
  const zona = h('div', {});
  const inpDesde = h('input', { class: 'input', type: 'date', id: 'm-desde', value: desde, 'aria-label': 'Desde', on: { change: (e) => { desde = e.target.value; cargar(); } } });
  const inpHasta = h('input', { class: 'input', type: 'date', id: 'm-hasta', value: hasta, 'aria-label': 'Hasta', on: { change: (e) => { hasta = e.target.value; cargar(); } } });
  const atajos = h('div', { class: 'chips', role: 'group', 'aria-label': 'Rango' }, [['7 días', 7], ['30 días', 30]].map(([t, n]) =>
    h('button', { class: 'chip', type: 'button', text: t, on: { click: () => { hasta = hoyISO(); desde = sumarDias(hasta, -(n - 1)); inpDesde.value = desde; inpHasta.value = hasta; cargar(); } } })));

  async function cargar() {
    const mi = ++vez; cargando = true; error = null; pintar();
    try {
      if (!desde || !hasta || desde > hasta) throw new Error('Revisá las fechas: "desde" no puede ser posterior a "hasta".');
      const r = await mermaControl(chips.get(), desde, hasta);
      if (mi !== vez) return;
      filas = r.map(x => ({ ...x, vendido: Number(x.vendido), producido: Number(x.producido), teorico: Number(x.teorico), merma: Number(x.merma), ajuste: Number(x.ajuste),
        precio_uso: x.precio_uso === null ? null : Number(x.precio_uso), valor_ajuste: x.valor_ajuste === null ? null : Number(x.valor_ajuste) }));
    } catch (e) { if (mi !== vez) return; error = mensajeError(e); filas = null; }
    cargando = false; pintar();
  }

  const kpi = (t, v, n, tono) => h('div', { class: 'kpi' + (tono ? ' kpi-' + tono : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), n ? h('span', { class: 'kpi-n', text: n }) : null);

  function pintarDatos() {
    if (!filas.length) return [vacio('Sin movimientos en esas fechas', 'Aparecen cuando hay ventas, producción, mermas o conteos.')];
    const faltantes = filas.filter(f => f.ajuste < 0).sort((a, b) => (a.valor_ajuste === null ? 1 : 0) - (b.valor_ajuste === null ? 1 : 0) || (a.valor_ajuste || 0) - (b.valor_ajuste || 0) || a.ajuste - b.ajuste);
    const sobrantes = filas.filter(f => f.ajuste > 0);
    const valorFalt = faltantes.reduce((s, f) => s + (f.valor_ajuste || 0), 0);
    const peor = Math.max(...faltantes.map(f => Math.abs(f.valor_ajuste || 0)), 1);
    const un = (f) => f.unidad_uso || '';
    return [
      h('section', { class: 'kpis' },
        kpi('Faltante valorizado', fmtMoney(Math.abs(valorFalt)), `${faltantes.length} ${faltantes.length === 1 ? 'producto' : 'productos'}`, faltantes.length ? 'warn' : null),
        kpi('Productos con conteo', fmtNum(filas.filter(f => f.ajuste !== 0).length, 0), `${sobrantes.length} con sobrante`)),
      h('section', { class: 'bloque' }, h('h2', { class: 'bloque-t', text: 'Faltantes más caros' }),
        faltantes.length ? h('ul', { class: 'barras' }, faltantes.slice(0, 10).map(f => barraFila(f.nombre, f.valor_ajuste === null ? 'sin costo' : fmtMoney(Math.abs(f.valor_ajuste)), Math.abs(f.valor_ajuste || 0) / peor,
          `Faltan ${fmtNum(Math.abs(f.ajuste), 3)} ${un(f)} · se esperaba usar ${fmtNum(f.teorico, 3)}`))) : h('p', { class: 'mute centro', text: 'Los conteos no dejaron faltantes.' })),
      h('section', { class: 'bloque' }, h('h2', { class: 'bloque-t', text: 'Consumo por producto' }),
        h('div', { class: 'tabla', role: 'table', 'aria-label': 'Consumo teórico contra conteo' },
          h('div', { class: 'tabla-h', role: 'row' }, h('span', { role: 'columnheader', text: 'Producto' }), h('span', { role: 'columnheader', text: 'Teórico' }), h('span', { role: 'columnheader', text: 'Conteo' })),
          ...filas.filter(f => f.teorico || f.ajuste || f.merma).map(f => h('div', { class: 'tabla-f', role: 'row' },
            h('span', { class: 'tabla-n', role: 'cell', text: f.nombre }), h('span', { class: 'num', role: 'cell', text: `${fmtNum(f.teorico, 2) || 0} ${un(f)}`.trim() }),
            h('span', { class: 'num' + (f.ajuste < 0 ? ' neg' : ''), role: 'cell', text: f.ajuste ? `${f.ajuste > 0 ? '+' : ''}${fmtNum(f.ajuste, 2)}` : '—' })))))
    ];
  }
  function pintar() { zona.replaceChildren(...(cargando ? [esqueleto(3)] : error ? [banner(error, 'error')] : filas ? pintarDatos() : [])); }

  mount(root, cab, subnav(SUBNAV_VENTAS, 'merma'), h('div', { class: 'toolbar' }, chips.el, h('div', { class: 'dos' }, campo('Desde', inpDesde), campo('Hasta', inpHasta)), atajos), zona);
  cargar();
}
