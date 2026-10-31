// Pagos · Gasto: cuánto se lleva gastado en compras a medida que se suben facturas y recibos X
// (total del período contra el anterior, con factura vs. recibo X, pagado vs. a pagar, por razón social, local, proveedor y categoría).
import { mount, h, fmtNum, fmtMoney, hoyISO, sumarDias, lsGet, lsSet } from './util.js';
import { gastosCompras, mensajeError } from './api.js';
import { periodoAnterior } from './ventas-global.js';
import { resumenGasto, fechaDMA } from './pagos-util.js';
import { esqueleto, vacio, banner, subnav, campo, icon, SUBNAV_PAGOS, SUBNAV_COMPRAS } from './ui.js';

// Facturas abre directo el formulario de carga.
const abrirNueva = () => { try { sessionStorage.setItem('stock:fac-nueva', '1'); } catch (_e) { /* nada */ } };
const pct = (f) => `${Math.round(f * 100)}%`;
const DIA = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const corto = (iso) => DIA(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
const rangoTexto = (a, b) => a === b ? corto(a) : `${corto(a)} al ${corto(b)}`;

const RANGOS = [['mes', 'Este mes'], ['mes-1', 'Mes pasado'], ['7', '7 días'], ['30', '30 días']];
function fechasDe(clave) {
  const hoy = hoyISO();
  if (clave === 'mes') return { desde: hoy.slice(0, 8) + '01', hasta: hoy };
  if (clave === 'mes-1') { const fin = sumarDias(hoy.slice(0, 8) + '01', -1); return { desde: fin.slice(0, 8) + '01', hasta: fin }; }
  const n = Number(clave) || 30; return { desde: sumarDias(hoy, -(n - 1)), hasta: hoy };
}
// "Este mes" se compara con los mismos días del mes pasado (1 al 29 contra 1 al 29), no con los 29 días anteriores.
function anteriorDe(clave, desde, hasta) {
  if (clave === 'mes') {
    const fin0 = sumarDias(desde, -1), ini0 = fin0.slice(0, 8) + '01';
    const h0 = sumarDias(ini0, Number(hasta.slice(8)) - 1);
    return { desde: ini0, hasta: h0 > fin0 ? fin0 : h0, texto: 'los mismos días del mes pasado' };
  }
  if (clave === 'mes-1') {
    const fin0 = sumarDias(desde, -1);
    return { desde: fin0.slice(0, 8) + '01', hasta: fin0, texto: 'el mes anterior' };
  }
  const a = periodoAnterior(desde, hasta);
  return { ...a, texto: `los ${a.dias} días anteriores` };
}

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Gasto en compras' }), h('p', { class: 'sub', text: 'Lo que suman las facturas y recibos X que vas cargando' }));
  mount(root, cab, subnav(ctx.rol === 'gerencia' ? SUBNAV_COMPRAS : SUBNAV_PAGOS, 'gasto'), esqueleto(3));

  let clave = lsGet('gc:rango', 'mes'); if (clave !== 'manual' && !RANGOS.some(r => r[0] === clave)) clave = 'mes';
  let { desde, hasta } = clave === 'manual' ? fechasDe('mes') : fechasDe(clave);
  let tipo = lsGet('gc:tipo', 'todo'); if (!['todo', 'factura', 'x'].includes(tipo)) tipo = 'todo';
  let gastos = [], ant = null, R = null, error = null, cargando = true, vez = 0, verTodosProv = false;
  const zona = h('div', { class: 'vg gc' });

  const inpDesde = h('input', { class: 'input', type: 'date', id: 'gc-desde', value: desde, 'aria-label': 'Desde', on: { change: (e) => { desde = e.target.value; elegirRango('manual'); } } });
  const inpHasta = h('input', { class: 'input', type: 'date', id: 'gc-hasta', value: hasta, 'aria-label': 'Hasta', on: { change: (e) => { hasta = e.target.value; elegirRango('manual'); } } });
  const atajos = h('div', { class: 'chips', role: 'group', 'aria-label': 'Período' }, RANGOS.map(([k, t]) =>
    h('button', { class: 'chip' + (k === clave ? ' is-on' : ''), type: 'button', text: t, 'data-rango': k, 'aria-pressed': k === clave ? 'true' : 'false', on: { click: () => elegirRango(k) } })));

  function elegirRango(k) {
    clave = k; lsSet('gc:rango', k);
    if (k !== 'manual') { ({ desde, hasta } = fechasDe(k)); inpDesde.value = desde; inpHasta.value = hasta; }
    atajos.querySelectorAll('.chip').forEach(b => { const on = b.getAttribute('data-rango') === k; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    cargar();
  }

  async function cargar() {
    const mi = ++vez; cargando = true; error = null; pintar();
    try {
      if (!desde || !hasta || desde > hasta) throw new Error('Revisá las fechas: "desde" no puede ser posterior a "hasta".');
      ant = anteriorDe(clave, desde, hasta);
      const d = await gastosCompras(ant.desde, hasta);
      if (mi !== vez) return;
      gastos = d;
    } catch (e) {
      if (mi !== vez) return;
      const m = mensajeError(e);
      error = /gastos_compras|schema cache|does not exist|no existe/i.test(String(e && e.message) + m)
        ? 'Falta activar el resumen de gasto: hay que pegar el SQL 0019 en Supabase (te lo pasé en el chat).' : m;
    }
    cargando = false; pintar();
  }

  const kpi = (t, v, n, extra) => h('div', { class: 'kpi' + (extra || '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), n ? h('span', { class: 'kpi-n', text: n }) : null);
  const bloque = (titulo, sub, ...kids) => h('section', { class: 'bloque vg-b' }, h('h2', { class: 'bloque-t', text: titulo }), sub ? h('p', { class: 'vg-sub', text: sub }) : null, ...kids);

  function hero() {
    const v = R.variacion;
    const varEl = v === null ? h('span', { class: 'vg-var', text: R.totalPrev > 0 ? '' : `Sin compras cargadas en ${ant.texto}` })
      // En gasto, subir es malo: ▲ en rojo, ▼ en verde.
      : h('span', { class: 'vg-var ' + (v > 0 ? 'vg-baja' : 'vg-sube') }, h('b', { text: `${v >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(v) * 100, 0)} %` }), h('span', { text: ` contra ${fmtMoney(R.totalPrev)} de ${ant.texto}` }));
    const que = tipo === 'x' ? 'Gastado con recibo X' : tipo === 'factura' ? 'Gastado con factura' : 'Gastado en compras';
    return h('section', { class: 'vg-hero', 'aria-label': que },
      h('span', { class: 'vg-hero-t', text: que }),
      h('b', { class: 'vg-hero-v num', text: fmtMoney(R.total) }),
      varEl,
      h('span', { class: 'vg-hero-r', text: `${rangoTexto(desde, hasta)} · ${R.n} ${R.n === 1 ? 'comprobante' : 'comprobantes'}` }));
  }

  // Con factura vs. recibo X: barra partida (siempre sobre todo el período, sin el filtro de tipo).
  function mezcla() {
    if (!R.totalAmbos) return null;
    const fx = R.reciboX / R.totalAmbos;
    return h('section', { class: 'bloque vg-b gc-mix', 'aria-label': 'Con factura y con recibo X' },
      h('div', { class: 'vg-share gc-share', role: 'img', 'aria-label': `Con factura ${pct(1 - fx)}, recibo X ${pct(fx)}` },
        R.conFactura ? h('span', { class: 'gc-fac', style: `width:${((1 - fx) * 100).toFixed(2)}%` }) : null,
        R.reciboX ? h('span', { class: 'gc-x', style: `width:${(fx * 100).toFixed(2)}%` }) : null),
      h('ul', { class: 'gc-mix-l' },
        h('li', {}, h('i', { class: 'vg-dot gc-fac' }), h('span', { text: 'Con factura' }), h('b', { class: 'num', text: fmtMoney(R.conFactura) }), h('span', { class: 'gc-p num', text: pct(1 - fx) })),
        h('li', {}, h('i', { class: 'vg-dot gc-x' }), h('span', { text: 'Recibo X (sin factura)' }), h('b', { class: 'num', text: fmtMoney(R.reciboX) }), h('span', { class: 'gc-p num', text: pct(fx) }))));
  }

  function kpis() {
    return h('section', { class: 'kpis vg-kpis' },
      kpi('Pagado', fmtMoney(R.pagado), R.total ? pct(R.pagado / R.total) + ' del gasto' : ''),
      kpi('Falta pagar', fmtMoney(R.pendiente), R.nVencidas ? `${fmtMoney(R.vencido)} vencido` : 'Nada vencido', R.nVencidas ? ' kpi-mal' : ''),
      kpi('Proveedores', fmtNum(R.porProveedor.length, 0)),
      kpi('Promedio por comprobante', R.n ? fmtMoney(Math.round(R.total / R.n)) : '—'));
  }

  // Filas con barra (mismo estilo que Ventas · Por local).
  function filas(grupos, max, detalle) {
    const tope = Math.max(...grupos.map(g => g.total), 1);
    return h('ul', { class: 'vg-locs gc-l' }, grupos.slice(0, max).map(g => h('li', {},
      h('div', { class: 'vg-loc gc-f' },
        h('span', { class: 'vg-loc-t' }, h('span', { class: 'vg-loc-n', text: g.clave }), h('b', { class: 'num', text: fmtMoney(g.total) }), h('span', { class: 'vg-loc-p num', text: pct(g.pct) })),
        h('span', { class: 'vg-loc-bar', 'aria-hidden': 'true' }, h('span', { class: 'gc-bar', style: `width:${Math.max(2, (g.total / tope) * 100).toFixed(1)}%` })),
        detalle ? h('span', { class: 'vg-loc-d', text: detalle(g) }) : null))));
  }
  const nComp = (g) => `${g.n} ${g.n === 1 ? 'comprobante' : 'comprobantes'}`;

  function porRazon() {
    const sinLocal = R.porLocal.find(g => g.clave === 'Sin local asignado');
    return bloque('Por razón social', 'SPMAR (Shopping) y SUMA ACTIVA (gastronomía)', filas(R.porRazon, 10, nComp),
      R.porLocal.length > 1 || (R.porLocal.length && !sinLocal) ? h('details', { class: 'vg-tabla gc-det' }, h('summary', { text: 'Ver por local' }), filas(R.porLocal, 20, nComp)) : null,
      sinLocal ? h('p', { class: 'vg-sub gc-nota', text: 'Las facturas sin local son las cargadas a mano sin elegir local. Al cargar una nueva elegí el local.' }) : null);
  }
  function porProveedor() {
    const n = verTodosProv ? 60 : 8;
    return bloque('Por proveedor', null, filas(R.porProveedor, n, nComp),
      R.porProveedor.length > 8 ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: verTodosProv ? 'Ver solo los 8 primeros' : `Ver los ${R.porProveedor.length}`, on: { click: () => { verTodosProv = !verTodosProv; pintar(); } } }) : null);
  }
  function porCategoria() {
    return bloque('Por categoría', 'Según los productos que trae cada factura', filas(R.porCategoria, 20, nComp));
  }
  function ultimos() {
    return bloque('Últimos cargados', null, h('ul', { class: 'gc-ult' }, R.ultimos.map(g => h('li', { class: 'gc-u' },
      h('div', { class: 'gc-u-t' }, h('span', { class: 'gc-u-n', text: g.proveedor }), h('b', { class: 'num', text: fmtMoney(g.total) })),
      h('div', { class: 'gc-u-d' },
        h('span', { class: 'estado ' + (g.es_x ? 'gc-tipo-x' : 'gc-tipo-f'), text: g.tipo }),
        h('span', { class: 'num', text: `N° ${g.numero}` }), h('span', { text: fechaDMA(g.fecha) }), g.local ? h('span', { text: g.local }) : null,
        h('span', { class: 'estado ' + (g.pagada ? 'estado-recibida' : g.vencida ? 'estado-vencida' : 'estado-borrador'), text: g.pagada ? 'Pagada' : g.vencida ? 'Vencida' : 'A pagar' }))))),
      h('a', { class: 'btn btn-ghost btn-block', href: '#/facturas', text: 'Ver todas las facturas' }));
  }

  const segTipo = () => h('div', { class: 'seg gc-seg', role: 'group', 'aria-label': 'Tipo de comprobante' }, [['todo', 'Todo'], ['factura', 'Con factura'], ['x', 'Recibo X']].map(([k, t]) =>
    h('button', { class: 'seg-b' + (tipo === k ? ' is-on' : ''), type: 'button', text: t, 'data-tipo': k, 'aria-pressed': tipo === k ? 'true' : 'false', on: { click: () => { tipo = k; lsSet('gc:tipo', k); pintar(); } } })));

  function pintar() {
    if (!ctx.alive()) return;
    if (cargando) return zona.replaceChildren(esqueleto(3));
    if (error) return zona.replaceChildren(banner(error, 'error'));
    R = resumenGasto(gastos, desde, hasta, ant, tipo);
    if (!R.totalAmbos) return zona.replaceChildren(vacio('No hay compras cargadas en esas fechas', 'Cargá facturas o recibos X en Pagos → Facturas, o recibí mercadería leyendo la factura.'),
      h('div', { class: 'centro acciones' }, h('a', { class: 'btn btn-primary', href: '#/facturas', text: 'Cargar factura o recibo X', on: { click: abrirNueva } })));
    const y = zona.closest('.main') ? zona.closest('.main').scrollTop : 0;
    zona.replaceChildren(segTipo(), hero(), tipo === 'todo' ? mezcla() : null,
      R.hay ? kpis() : null,
      R.hay ? h('div', { class: 'vg-dos gc-dos' }, h('div', {}, porRazon(), porCategoria()), h('div', {}, porProveedor(), ultimos()))
        : vacio(tipo === 'x' ? 'No hay recibos X en esas fechas' : 'No hay facturas en esas fechas', 'Tocá "Todo" para ver el resto.'));
    if (zona.closest('.main')) zona.closest('.main').scrollTop = y;
  }

  mount(root, cab, subnav(ctx.rol === 'gerencia' ? SUBNAV_COMPRAS : SUBNAV_PAGOS, 'gasto'),
    h('div', { class: 'toolbar' }, atajos,
      h('a', { class: 'btn btn-primary', href: '#/facturas', on: { click: abrirNueva } }, icon('mas', 18), h('span', { text: 'Cargar factura o recibo X' }))),
    h('div', { class: 'dos gc-fechas' }, campo('Desde', inpDesde), campo('Hasta', inpHasta)), zona);
  cargar();
}
