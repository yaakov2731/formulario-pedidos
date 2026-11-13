// Gerencia · Stock → Por sector: lo que anotó el encargado en la hoja del día (apertura, entró, devolvió, merma, cierre)
// y lo que calcula la app, que solo ve gerencia (0031_hoja_sector.sql):
//   Consumo del sector = Apertura + Entró − Salió − Merma − Cierre.
//     Entró incluye lo que otro sector le devolvió; Salió = lo que devolvió + lo que otro sector anotó que sacó de acá.
//   Todos los sectores: los pases entre sectores se cancelan; solo cuenta lo que vino de afuera (proveedor, elaborado).
//     Vendido = lo que descontaron las ventas por receta y la producción en la jornada. Diferencia = Vendido − Consumo
//     (negativa = se usó más de lo vendido: faltante o merma sin anotar). En pesos, a costo de compra.
import { mount, h, fmtNum, fmtMoney, jornadaISO, sumarDias, fechaLarga } from './util.js';
import { hojaDelDia, movimientosDesde, sinHojaSQL, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, banner, subnav, SUBNAV_STOCK } from './ui.js';
import { sectoresDe, TODO_EL_LOCAL } from './hoja.js';
import { TODOS, calcularSector } from './perdida.js'; // la cuenta del día vive en perdida.js (también la usan Hoy y Pérdida)

export { TODOS, calcularSector };
// "Falta apertura y cierre en Cocina", "Falta cierre en Barra".
export function faltaTexto(r) {
  const porSec = new Map();
  for (const f of r.faltan) { const [tipo, sec] = f.split(' en '); if (!porSec.has(sec || '')) porSec.set(sec || '', []); porSec.get(sec || '').push(tipo); }
  return 'Falta ' + [...porSec].map(([sec, ts]) => ts.join(' y ') + (sec ? ' en ' + sec : '')).join(' · ');
}

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Control del día' }),
    h('p', { class: 'sub', text: 'La hoja del día y lo que calcula la app' }));
  const nav = subnav(SUBNAV_STOCK, 'sector');
  mount(root, cab, nav, esqueleto(4));
  try { await cargarG(['prods', 'locales', 'precios']); } catch (e) { toast('No se pudo cargar: ' + mensajeError(e), 'error'); }
  if (!ctx.alive()) return;

  let localId = null, fecha = jornadaISO(), sector = TODOS, movs = [], ventas = [], pidiendo = 0;
  const zonaFecha = h('div', { class: 'chips gs-fechas', role: 'group', 'aria-label': 'Día' });
  const zonaSector = h('div', { class: 'chips chips-scroll gs-sectores', role: 'group', 'aria-label': 'Sector' });
  const cuerpo = h('div', { class: 'gs' });
  const n = (x) => (x == null ? '—' : fmtNum(x, 2) || '0');

  function pintarFechas() {
    const hoy = jornadaISO();
    const inp = h('input', { class: 'input gs-dia', type: 'date', value: fecha, max: hoy, 'aria-label': 'Elegir día', on: { change: (e) => { if (e.target.value) { fecha = e.target.value; cargar(); } } } });
    zonaFecha.replaceChildren(...[[sumarDias(hoy, -1), 'Ayer'], [hoy, 'Hoy']].map(([f, t]) => h('button', { class: 'chip' + (f === fecha ? ' is-on' : ''), type: 'button', 'data-fecha': f, text: t,
      on: { click: () => { fecha = f; cargar(); } } })), inp);
  }

  function pintar() {
    const prodsLocal = [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && p.categoria !== 'Carta');
    const nombres = [...new Set([...sectoresDe(prodsLocal).keys(), ...movs.map(m => m.sector)])].filter(s => s !== TODO_EL_LOCAL || movs.some(m => m.sector === s));
    if (sector !== TODOS && !nombres.includes(sector)) sector = TODOS;
    zonaSector.replaceChildren(...[TODOS, ...nombres].map(s => h('button', { class: 'chip' + (s === sector ? ' is-on' : ''), type: 'button', 'data-sector': s, text: s,
      on: { click: () => { sector = s; pintar(); } } })));
    if (!movs.length) {
      mount(cuerpo, vacio('Sin hoja para este día', `El ${fechaLarga(fecha)} nadie anotó apertura, movimientos ni cierre en este local.`));
      return;
    }
    const todos = sector === TODOS;
    const filas = calcularSector(sector, movs, ventas, G.prods, G.precios);
    const conDif = filas.filter(r => r.dif != null && r.dif < 0);
    const faltan = filas.filter(r => !r.completo);
    const plataDif = conDif.reduce((s, r) => s + (r.valorDif || 0), 0);
    const plataMerma = filas.reduce((s, r) => s + (r.valorMerma || 0), 0);
    const kpi = (t, v, nota, warn) => h('div', { class: 'kpi' + (warn ? ' kpi-warn' : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
    const kpis = h('section', { class: 'kpis gs-kpis' },
      todos ? kpi('Con diferencia', String(conDif.length), 'se usó más de lo vendido', conDif.length > 0) : kpi('Productos', String(filas.length), 'anotados en el sector'),
      todos ? kpi('Faltante', plataDif ? fmtMoney(-plataDif) : '$ 0', 'a costo de compra', plataDif < 0) : kpi('Consumo', String(filas.filter(r => r.consumo > 0).length), 'productos usados'),
      kpi('Merma anotada', plataMerma ? fmtMoney(plataMerma) : '$ 0', ((c) => `${c} ${c === 1 ? 'producto' : 'productos'}`)(filas.filter(r => r.merma > 0).length)),
      kpi('Sin contar', String(faltan.length), 'falta apertura o cierre', faltan.length > 0));
    const th = (t, calc) => h('th', { class: calc ? 'is-calc' : null, scope: 'col', text: t });
    const tabla = h('div', { class: 'gs-tabla-w' }, h('table', { class: 'gs-tabla' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Producto' }), th('Apertura'), th(todos ? 'Entró de afuera' : 'Entró'), th(todos ? 'Salió afuera' : 'Salió'), th('Merma'), th('Cierre'),
        th('Consumo', true), todos ? th('Vendido (recetas)', true) : null, todos ? th('Diferencia', true) : null, todos ? th('$', true) : null)),
      h('tbody', {}, filas.map(r => h('tr', { 'data-prod': r.p.id, class: r.dif != null && r.dif < 0 ? 'is-mal' : null },
        h('td', {}, h('b', { text: r.p.nombre }), h('small', { text: ' ' + (r.p.unidad_uso || '') })),
        h('td', { class: 'num', text: n(r.ap) }), h('td', { class: 'num', text: n(r.entro) }), h('td', { class: 'num', text: n(r.salio) }), h('td', { class: 'num', text: n(r.merma) }), h('td', { class: 'num', text: n(r.ci) }),
        r.completo
          ? [h('td', { class: 'num is-calc', text: n(r.consumo) }),
            todos ? h('td', { class: 'num is-calc', text: n(r.vendido) }) : null,
            todos ? h('td', { class: 'num is-calc' + (r.dif < 0 ? ' is-neg' : r.dif === 0 ? ' is-ok' : ''), text: n(r.dif) }) : null,
            todos ? h('td', { class: 'num is-calc' + (r.valorDif < 0 ? ' is-neg' : ''), text: r.valorDif != null ? fmtMoney(r.valorDif) : '—' }) : null]
          : h('td', { class: 'is-calc gs-falta', colspan: todos ? 4 : 1, text: faltaTexto(r) }))))));
    mount(cuerpo, kpis, tabla,
      h('p', { class: 'kpi-n gs-pie', text: todos
        ? 'Consumo = Apertura + Entró − Salió − Merma − Cierre, de todos los sectores. Diferencia = Vendido − Consumo.'
        : 'Consumo = Apertura + Entró − Salió − Merma − Cierre.' }));
  }

  async function cargar() {
    const yo = ++pidiendo; pintarFechas(); cuerpo.replaceChildren(esqueleto(3));
    const [y, m, d] = fecha.split('-').map(Number);
    const desde = new Date(y, m - 1, d, 6), hasta = new Date(y, m - 1, d + 1, 6);
    try {
      const [hm, mv] = await Promise.all([hojaDelDia(localId, fecha), movimientosDesde(localId, desde.toISOString())]);
      if (yo !== pidiendo || !ctx.alive()) return;
      movs = hm || []; ventas = (mv || []).filter(x => Date.parse(x.creado_en) < hasta.getTime());
      pintar();
    } catch (e) {
      if (yo !== pidiendo) return;
      cuerpo.replaceChildren(banner(sinHojaSQL(e) ? 'Falta activar la hoja por sector: hay que pegar el SQL 0031_hoja_sector.sql en Supabase.' : 'No se pudo cargar: ' + mensajeError(e), sinHojaSQL(e) ? 'warn' : 'error'));
    }
  }

  const locales = chipsLocal((id) => { localId = id; sector = TODOS; cargar(); });
  localId = locales.get();
  mount(root, cab, nav, locales.el, zonaFecha, zonaSector, cuerpo);
  await cargar();
}
