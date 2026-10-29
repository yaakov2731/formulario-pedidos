// Gerencia · Ventas · Resumen: todos los locales juntos (total, contra el período anterior, por local y por día) y los productos más vendidos.
import { mount, h, fmtNum, fmtMoney, hoyISO, sumarDias, fechaLarga, lsGet, lsSet } from './util.js';
import { ventasItemsTodos, ventasPedidosTodos, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { localesVenta, resumen, ranking, periodoAnterior } from './ventas-global.js';
import { esqueleto, vacio, banner, subnav, campo, SUBNAV_VENTAS } from './ui.js';

const pct = (f) => `${Math.round(f * 100)}%`;
const DIA = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const diaCorto = (iso) => DIA(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' }).replace('.', '');
const rangoTexto = (a, b) => a === b ? fechaLarga(a) : `${DIA(a).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} al ${DIA(b).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`.replace(/\./g, '');
// Montos cortos para ejes: $ 1,2 M · $ 850 mil.
export const compacto = (n) => (n >= 1e6 ? `$ ${fmtNum(n / 1e6, 1)} M` : n >= 1e3 ? `$ ${fmtNum(Math.round(n / 1e3), 0)} mil` : fmtMoney(n));
// Escala "linda" para el eje: 1, 2, 2,5 o 5 por potencia de 10.
function tope(max) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map(k => k * p).find(v => v >= max);
}

const RANGOS = [['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['mes-1', 'Mes pasado']];
function fechasDe(clave) {
  const hoy = hoyISO();
  if (clave === 'mes') return { desde: hoy.slice(0, 8) + '01', hasta: hoy };
  if (clave === 'mes-1') { const fin = sumarDias(hoy.slice(0, 8) + '01', -1); return { desde: fin.slice(0, 8) + '01', hasta: fin }; }
  const n = Number(clave) || 30; return { desde: sumarDias(hoy, -(n - 1)), hasta: hoy };
}

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Ventas' }), h('p', { class: 'sub', text: 'Todos los locales juntos' }));
  mount(root, cab, subnav(SUBNAV_VENTAS, 'resumen'), esqueleto(3));
  await cargarG(['locales'], () => {});
  if (!ctx.alive()) return;

  let clave = lsGet('vr:rango', '30'); if (clave !== 'manual' && !RANGOS.some(r => r[0] === clave)) clave = '30';
  let { desde, hasta } = clave === 'manual' ? fechasDe('30') : fechasDe(clave);
  let items = [], pedidos = [], locs = [], R = null, error = null, cargando = true, vez = 0;
  let porRank = lsGet('vr:por', 'cantidad'); let localRank = null; let verTodos = false; let diaSel = null;
  const zona = h('div', { class: 'vg' });

  const inpDesde = h('input', { class: 'input', type: 'date', id: 'vr-desde', value: desde, 'aria-label': 'Desde', on: { change: (e) => { desde = e.target.value; elegirRango('manual'); } } });
  const inpHasta = h('input', { class: 'input', type: 'date', id: 'vr-hasta', value: hasta, 'aria-label': 'Hasta', on: { change: (e) => { hasta = e.target.value; elegirRango('manual'); } } });
  const atajos = h('div', { class: 'chips', role: 'group', 'aria-label': 'Período' }, RANGOS.map(([k, t]) =>
    h('button', { class: 'chip' + (k === clave ? ' is-on' : ''), type: 'button', text: t, 'data-rango': k, 'aria-pressed': k === clave ? 'true' : 'false', on: { click: () => elegirRango(k) } })));

  function elegirRango(k) {
    clave = k; lsSet('vr:rango', k);
    if (k !== 'manual') { ({ desde, hasta } = fechasDe(k)); inpDesde.value = desde; inpHasta.value = hasta; }
    atajos.querySelectorAll('.chip').forEach(b => { const on = b.getAttribute('data-rango') === k; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    cargar();
  }

  async function cargar() {
    const mi = ++vez; cargando = true; error = null; pintar();
    try {
      if (!desde || !hasta || desde > hasta) throw new Error('Revisá las fechas: "desde" no puede ser posterior a "hasta".');
      const ant = periodoAnterior(desde, hasta);
      const [its, peds] = await Promise.all([ventasItemsTodos(ant.desde, hasta), ventasPedidosTodos(desde, hasta).catch(() => [])]);
      if (mi !== vez) return;
      items = its; pedidos = peds;
      locs = localesVenta(G.locales, items);
      R = resumen(items, pedidos, locs, desde, hasta);
      if (localRank && !locs.some(l => l.id === localRank)) localRank = null;
      diaSel = null;
    } catch (e) { if (mi !== vez) return; error = mensajeError(e); R = null; }
    cargando = false; pintar();
  }

  const colorDe = (id) => (locs.find(l => l.id === id) || {}).color || '#8a7f77';
  const nombreDe = (id) => (locs.find(l => l.id === id) || {}).nombre || '';
  const punto = (color) => h('i', { class: 'vg-dot', style: `background:${color}`, 'aria-hidden': 'true' });
  const kpi = (t, v, n, extra) => h('div', { class: 'kpi' + (extra || '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), n ? h('span', { class: 'kpi-n', text: n }) : null);
  const bloque = (titulo, sub, ...kids) => h('section', { class: 'bloque vg-b' }, h('h2', { class: 'bloque-t', text: titulo }), sub ? h('p', { class: 'vg-sub', text: sub }) : null, ...kids);

  function variacion(v, prev) {
    if (v === null) return h('span', { class: 'vg-var', text: prev > 0 ? '' : 'Sin ventas cargadas en el período anterior' });
    const sube = v >= 0;
    return h('span', { class: 'vg-var ' + (sube ? 'vg-sube' : 'vg-baja') }, h('b', { text: `${sube ? '▲' : '▼'} ${fmtNum(Math.abs(v) * 100, 0)} %` }), h('span', { text: ` contra ${fmtMoney(prev)} de los ${R.anterior.dias} días anteriores` }));
  }

  function hero() {
    return h('section', { class: 'vg-hero', 'aria-label': 'Total de todos los locales' },
      h('span', { class: 'vg-hero-t', text: 'Vendido en todos los locales' }),
      h('b', { class: 'vg-hero-v num', text: fmtMoney(R.total) }),
      variacion(R.variacion, R.totalPrev),
      h('span', { class: 'vg-hero-r', text: rangoTexto(R.desde, R.hasta) + ' · según los productos de Núcleo' }));
  }

  function kpis() {
    return h('section', { class: 'kpis vg-kpis' },
      kpi('Unidades', fmtNum(R.unidades, 0)),
      kpi('Días con ventas', fmtNum(R.diasConVentas, 0), `de ${R.porDia.length}`),
      kpi('Promedio por día', fmtMoney(Math.round(R.promDia)), 'días con ventas'),
      R.ticket !== null ? kpi('Ticket promedio', fmtMoney(Math.round(R.ticket)), `${fmtNum(R.nPedidos, 0)} pedidos`) : kpi('Ticket promedio', '—', 'Subí el detalle por pedido'));
  }

  // Participación de cada local: una barra 100 % partida + una fila por local.
  function porLocal() {
    const con = R.porLocal.filter(l => l.total > 0);
    const barra = h('div', { class: 'vg-share', role: 'img', 'aria-label': con.map(l => `${l.nombre} ${pct(l.pct)}`).join(', ') },
      con.map(l => h('span', { style: `width:${(l.pct * 100).toFixed(2)}%;background:${l.color}`, title: `${l.nombre} · ${fmtMoney(l.total)} · ${pct(l.pct)}` })));
    const max = Math.max(...con.map(l => l.total), 1);
    const filas = R.porLocal.map(l => {
      const v = l.prev > 0 ? (l.total - l.prev) / l.prev : null;
      const det = l.total ? [`${l.dias} ${l.dias === 1 ? 'día cargado' : 'días cargados'}`, `${fmtMoney(Math.round(l.promDia))} por día`, v === null ? null : `${v >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(v) * 100, 0)} %`].filter(Boolean).join(' · ') : 'Sin ventas importadas en estas fechas';
      return h('li', {},
        h('button', { class: 'vg-loc' + (l.total ? '' : ' vg-loc-0') + (localRank === l.id ? ' is-on' : ''), type: 'button', 'data-local': l.id, 'aria-label': `Ver lo más vendido en ${l.nombre}`, disabled: !l.total,
          on: { click: () => { localRank = l.id; verTodos = false; pintar(); const r = zona.querySelector('#vg-ranking'); if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } },
          h('span', { class: 'vg-loc-t' }, punto(l.color), h('span', { class: 'vg-loc-n', text: l.nombre }), h('b', { class: 'num', text: l.total ? fmtMoney(l.total) : '—' }), h('span', { class: 'vg-loc-p num', text: l.total ? pct(l.pct) : '' })),
          l.total ? h('span', { class: 'vg-loc-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.max(2, (l.total / max) * 100).toFixed(1)}%;background:${l.color}` })) : null,
          h('span', { class: 'vg-loc-d', text: det })));
    });
    return bloque('Por local', 'Tocá un local para ver lo que más vende.', barra, h('ul', { class: 'vg-locs' }, filas));
  }

  // Columnas apiladas por día (HTML, sin librerías): un color por local, 2 px de separación, tocar o pasar el mouse muestra el detalle.
  function porDia() {
    const dias = R.porDia;
    const top = tope(Math.max(...dias.map(d => d.total), 0));
    if (!diaSel || !dias.some(d => d.fecha === diaSel)) diaSel = (dias.slice().reverse().find(d => d.total) || dias[dias.length - 1]).fecha;
    const cada = dias.length > 20 ? 7 : dias.length > 10 ? 2 : 1;
    const detalle = h('div', { class: 'vg-det', 'aria-live': 'polite' });
    const pintarDet = () => {
      const d = dias.find(x => x.fecha === diaSel);
      detalle.replaceChildren(h('p', { class: 'vg-det-t' }, h('span', { text: fechaLarga(d.fecha) }), h('b', { class: 'num', text: d.total ? fmtMoney(d.total) : 'Sin ventas cargadas' })),
        d.partes.length ? h('ul', { class: 'vg-det-l' }, d.partes.map(p => h('li', {}, punto(colorDe(p.id)), h('span', { text: nombreDe(p.id) }), h('b', { class: 'num', text: fmtMoney(p.total) })))) : null);
      cols.querySelectorAll('.vg-col').forEach(c => c.classList.toggle('is-sel', c.getAttribute('data-fecha') === diaSel));
    };
    const elegir = (f) => { diaSel = f; pintarDet(); };
    const cols = h('div', { class: 'vg-cols', role: 'list', style: `--n:${dias.length}` }, dias.map((d, i) =>
      h('button', { class: 'vg-col', type: 'button', role: 'listitem', 'data-fecha': d.fecha, 'aria-label': `${fechaLarga(d.fecha)}: ${d.total ? fmtMoney(d.total) : 'sin ventas'}`,
        on: { click: () => elegir(d.fecha), pointerenter: (e) => { if (e.pointerType === 'mouse') elegir(d.fecha); } } },
        h('span', { class: 'vg-pila' }, d.partes.slice().reverse().map(p => h('span', { class: 'vg-seg', style: `height:${((p.total / top) * 100).toFixed(2)}%;background:${colorDe(p.id)}` }))),
        h('span', { class: 'vg-x num', text: i % cada === 0 ? String(DIA(d.fecha).getDate()) : '' }))));
    const ejes = h('div', { class: 'vg-y', 'aria-hidden': 'true' }, [1, 0.5, 0].map(f => h('span', { class: 'num', style: `bottom:${f * 100}%`, text: f ? compacto(top * f) : '0' })));
    const conVentas = locs.filter(l => R.porLocal.some(x => x.id === l.id && x.total));
    const leyenda = conVentas.length > 1 ? h('ul', { class: 'vg-ley', 'aria-label': 'Colores por local' }, conVentas.map(l => h('li', {}, punto(l.color), h('span', { text: l.nombre })))) : null;
    const tabla = h('details', { class: 'vg-tabla' }, h('summary', { text: 'Ver como tabla' }),
      h('div', { class: 'vg-tabla-w' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', { text: 'Día' }), ...conVentas.map(l => h('th', { text: l.nombre })), h('th', { text: 'Total' }))),
        h('tbody', {}, dias.filter(d => d.total).map(d => h('tr', {}, h('td', { text: diaCorto(d.fecha) }),
          ...conVentas.map(l => { const p = d.partes.find(x => x.id === l.id); return h('td', { class: 'num', text: p ? fmtMoney(p.total) : '—' }); }),
          h('td', { class: 'num', text: fmtMoney(d.total) })))))));
    pintarDet();
    return bloque('Por día', null, leyenda, h('div', { class: 'vg-chart' }, ejes, h('div', { class: 'vg-plot' }, h('div', { class: 'vg-grid', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), cols)), detalle, tabla);
  }

  function masVendidos() {
    const lista = ranking(items, desde, hasta, { localId: localRank, por: porRank });
    const n = verTodos ? 50 : 10;
    const vis = lista.slice(0, n);
    const val = (a) => (porRank === 'importe' ? a.total : a.cantidad);
    const max = Math.max(...vis.map(val), 1);
    const seg = h('div', { class: 'seg vg-seg-t', role: 'group', 'aria-label': 'Ordenar por' }, [['cantidad', 'Unidades'], ['importe', 'Importe']].map(([k, t]) =>
      h('button', { class: 'seg-b' + (porRank === k ? ' is-on' : ''), type: 'button', text: t, 'aria-pressed': porRank === k ? 'true' : 'false', on: { click: () => { porRank = k; lsSet('vr:por', k); pintar(); } } })));
    const conVentas = R.porLocal.filter(l => l.total);
    const chips = h('div', { class: 'chips chips-scroll vg-chips', role: 'group', 'aria-label': 'Local' },
      h('button', { class: 'chip' + (!localRank ? ' is-on' : ''), type: 'button', text: 'Todos', 'aria-pressed': !localRank ? 'true' : 'false', on: { click: () => { localRank = null; verTodos = false; pintar(); } } }),
      conVentas.map(l => h('button', { class: 'chip vg-chip' + (localRank === l.id ? ' is-on' : ''), type: 'button', 'aria-pressed': localRank === l.id ? 'true' : 'false', 'data-local': l.id, on: { click: () => { localRank = l.id; verTodos = false; pintar(); } } }, punto(l.color), h('span', { text: l.nombre }))));
    const filas = vis.map((a, i) => {
      const partes = [...a.locales.entries()].map(([id, x]) => ({ id, v: porRank === 'importe' ? x.total : x.cantidad })).filter(p => p.v > 0)
        .sort((p, q) => locs.findIndex(l => l.id === p.id) - locs.findIndex(l => l.id === q.id));
      const donde = !localRank && partes.length ? h('span', { class: 'vg-r-loc' }, partes.map(p => h('span', {}, punto(colorDe(p.id)), h('span', { text: nombreDe(p.id) })))) : null;
      return h('li', { class: 'vg-r' },
        h('span', { class: 'vg-r-i num', text: String(i + 1) }),
        h('div', { class: 'vg-r-c' },
          h('div', { class: 'vg-r-t' }, h('span', { class: 'vg-r-n', text: a.nombre }), h('b', { class: 'num', text: porRank === 'importe' ? fmtMoney(a.total) : fmtNum(a.cantidad, 2) + ' u.' })),
          h('span', { class: 'vg-r-bar', 'aria-hidden': 'true' }, partes.map(p => h('span', { style: `width:${((p.v / max) * 100).toFixed(2)}%;background:${colorDe(p.id)}` }))),
          h('span', { class: 'vg-r-d' }, h('span', { text: `${porRank === 'importe' ? fmtNum(a.cantidad, 2) + ' u.' : fmtMoney(a.total)} · ${pct(a.pct)}` }), donde)));
    });
    const nota = porRank === 'importe' ? 'El % es sobre el importe vendido del período.' : 'El % es sobre el total de unidades del período.';
    const titulo = localRank ? `Más vendidos · ${nombreDe(localRank)}` : 'Más vendidos · todos los locales';
    return h('section', { class: 'bloque vg-b', id: 'vg-ranking' }, h('h2', { class: 'bloque-t', text: titulo }), seg, chips, h('p', { class: 'vg-sub', text: nota }),
      vis.length ? h('ol', { class: 'vg-rank' }, filas) : h('p', { class: 'mute centro', text: 'No hay productos vendidos en estas fechas.' }),
      lista.length > 10 ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: verTodos ? 'Ver solo los 10 primeros' : (lista.length <= 50 ? `Ver los ${lista.length}` : `Ver los 50 primeros de ${lista.length}`), on: { click: () => { verTodos = !verTodos; pintar(); } } }) : null);
  }

  function pintar() {
    if (!ctx.alive()) return;
    if (cargando) return zona.replaceChildren(esqueleto(3));
    if (error) return zona.replaceChildren(banner(error, 'error'));
    if (!R || !R.hay) return zona.replaceChildren(vacio('No hay ventas en esas fechas', 'Importá el Excel de Núcleo de cada local en Ventas → Importar.'),
      h('div', { class: 'centro' }, h('a', { class: 'btn btn-primary', href: '#/ventas', text: 'Importar ventas' })));
    const y = zona.closest('.main') ? zona.closest('.main').scrollTop : 0;
    zona.replaceChildren(hero(), kpis(),
      R.sinVentas.length ? banner(`Sin ventas importadas en estas fechas: ${R.sinVentas.join(', ')}. El total no los incluye.`, 'warn') : null,
      h('div', { class: 'vg-dos' }, porLocal(), porDia()), masVendidos());
    if (zona.closest('.main')) zona.closest('.main').scrollTop = y;
  }

  mount(root, cab, subnav(SUBNAV_VENTAS, 'resumen'),
    h('div', { class: 'toolbar' }, atajos, h('div', { class: 'dos' }, campo('Desde', inpDesde), campo('Hasta', inpHasta))), zona);
  cargar();
}
