// Gerencia · Locales → un local (#/local, el local elegido queda en g:local): cuánto se fue sin explicar esta semana y qué
// productos lo explican, de mayor a menor (perdida.js: detalleSemana, misma cuenta que Pérdida). Enlaces a Pérdida y Control.
// Tocar un producto abre su ficha (#/producto, g:producto): debió usarse (según lo vendido), se usó (había + entró − quedó),
// diferencia en $ y las últimas 6 semanas en barras (una semana sin cierres es un hueco, no un 0).
import { mount, h, fmtMoney, fmtNum, plural, sumarDias, jornadaISO, lsGet, lsSet } from './util.js';
import { hojaRango, movimientosDesde, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, banner, vacio, tituloGrande, barrasSemanas, hoja as hojaModal, icon } from './ui.js';
import { detalleSemana, perdidaSemana, lunesDe } from './perdida.js';

const SEMANAS = 6;
const diaCorto = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
const cant = (p, n) => `${fmtNum(n, 2) || '0'} ${plural(p.unidad_uso || p.unidad_compra || 'unidad', n)}`;

// Serie de 6 semanas de un producto: $ que faltó cada semana; null si esa semana no hubo ningún día con cierre.
export function serieProducto({ hoja, movs, hasta, pid, prods, precios }) {
  const lunes = lunesDe(hasta);
  const out = [];
  for (let i = SEMANAS - 1; i >= 0; i--) {
    const desde = sumarDias(lunes, -7 * i), fin = i === 0 ? hasta : sumarDias(desde, 6);
    const d = detalleSemana({ hoja, movs, desde, hasta: fin, prods, precios });
    const x = d.productos.get(pid);
    out.push({ etiqueta: diaCorto(desde), valor: !d.dias ? null : (x ? (x.valor == null ? 0 : Math.round(x.valor)) : 0) });
  }
  return out;
}

function ficha(p, x, serie) {
  const conCosto = x && x.costoUnidad != null;
  return h('div', { class: 'fp', 'data-ficha': p.id },
    !x ? vacio('Sin cierres esta semana', 'Cuando el local abra y cierre, aparece la cuenta.') : h('div', { class: 'fp-filas' },
      h('div', { class: 'fp-fila', 'data-fp': 'debio' }, h('div', {}, 'Debió usarse', h('small', { text: 'según lo vendido y producido' })), h('b', { text: cant(p, x.vendido) })),
      h('div', { class: 'fp-fila', 'data-fp': 'uso' }, h('div', {}, 'Se usó', h('small', { text: 'había + entró − quedó' })), h('b', { text: cant(p, x.consumo) })),
      h('div', { class: 'fp-fila' + (x.falta > 0 ? ' is-dif' : ''), 'data-fp': 'dif' }, h('div', {}, 'Diferencia',
        h('small', { text: conCosto ? `a ${fmtMoney(Math.round(x.costoUnidad))} ${p.unidad_uso ? 'el ' + p.unidad_uso : 'la unidad'}` : 'falta cargar el costo' })),
        h('b', { text: x.falta > 0 ? (conCosto ? fmtMoney(Math.round(x.valor)) : cant(p, x.falta)) : 'Sin diferencia' }))),
    h('h3', { class: 'lg-t fp-sec', text: `Últimas ${SEMANAS} semanas` }),
    barrasSemanas(serie, { formato: (v) => fmtMoney(v) }),
    serie.some(s => s.valor == null) ? h('p', { class: 'sem-pie', text: 'Las semanas sin cierres quedan vacías.' }) : null);
}

export async function render(root, ctx, id) {
  const jornada = jornadaISO(), lunes = lunesDe(jornada);
  mount(root, tituloGrande('Local'), esqueleto(4));
  try { await cargarG(['locales', 'prods', 'precios'], () => {}); } catch (e) { return mount(root, tituloGrande('Local'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  const lid = lsGet('g:local');
  const l = G.locales.find(x => x.id === lid);
  const volver = h('a', { class: 'volver', href: '#/semaforo', text: '‹ Locales' });
  if (!l) return mount(root, volver, tituloGrande('Local'), vacio('Elegí un local', 'Volvé a Locales y tocá uno.'));
  const desde6 = sumarDias(lunes, -7 * (SEMANAS - 1));
  const [y, m, d] = desde6.split('-').map(Number);
  let hojaL = [], movs = [];
  try { [hojaL, movs] = await Promise.all([hojaRango(l.id, desde6, jornada), movimientosDesde(l.id, new Date(y, m - 1, d, 6).toISOString())]); }
  catch (e) { return mount(root, volver, tituloGrande(l.nombre), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  hojaL = hojaL || []; movs = movs || [];
  const sem = detalleSemana({ hoja: hojaL, movs, desde: lunes, hasta: jornada, prods: G.prods, precios: G.precios });
  const per = perdidaSemana({ hoja: hojaL, movs, desde: lunes, hasta: jornada, prods: G.prods, precios: G.precios });
  const abrirFicha = (p) => {
    const serie = serieProducto({ hoja: hojaL, movs, hasta: jornada, pid: p.id, prods: G.prods, precios: G.precios });
    lsSet('g:producto', p.id);
    return { p, cont: ficha(p, sem.productos.get(p.id), serie) };
  };

  // #/producto: la ficha a pantalla completa (se llega por enlace o al recargar).
  if (id === 'producto') {
    const p = G.prods.get(lsGet('g:producto'));
    if (!p) return mount(root, h('a', { class: 'volver', href: '#/local', text: '‹ ' + l.nombre }), vacio('Elegí un producto', 'Volvé al local y tocá uno.'));
    const { cont } = abrirFicha(p);
    return mount(root, h('a', { class: 'volver', href: '#/local', text: '‹ ' + l.nombre }), tituloGrande(p.nombre, `${l.nombre} · producto`), cont);
  }

  const filas = [...sem.productos.values()].filter(x => x.falta > 0).sort((a, b) => (b.valor || 0) - (a.valor || 0) || b.falta - a.falta);
  const total = h('div', { class: 'lc-total', 'data-local-total': '' }, h('small', { text: `Sin explicar · semana del ${diaCorto(lunes)}` }),
    h('b', { text: per.diasConCierre ? fmtMoney(Math.round(per.sinExplicar)) : 'Falta dato' }),
    h('small', { text: per.diasConCierre ? `${plural('día', per.diasConCierre).replace(/^/, per.diasConCierre + ' ')} con cierre${per.diasConHoja > per.diasConCierre ? ` · falta${per.diasConHoja - per.diasConCierre === 1 ? '' : 'n'} ${per.diasConHoja - per.diasConCierre} ${per.diasConHoja - per.diasConCierre === 1 ? 'cierre' : 'cierres'}` : ''}` : 'Sin cierres esta semana' }));
  const lista = filas.length ? h('div', { class: 'sem-lista' }, filas.map(x => h('a', { class: 'sem', href: '#/producto', 'data-producto': x.p.id,
    on: { click: (e) => { e.preventDefault(); const { p, cont } = abrirFicha(x.p); hojaModal(p.nombre, cont); } } },
    h('i', { class: 'sem-luz is-rojo', 'aria-hidden': 'true' }),
    h('span', { class: 'sem-tx' }, h('b', { text: x.p.nombre }), h('small', { text: `Se usó ${cant(x.p, x.falta)} de más` })),
    h('span', { class: 'sem-m', text: x.valor != null ? fmtMoney(Math.round(x.valor)) : 'Sin costo' }))))
    : vacio(per.diasConCierre ? 'Nada sin explicar esta semana' : 'Sin cierres esta semana', per.diasConCierre ? 'Lo que se usó coincide con lo vendido.' : 'Cuando el local cierre, aparece la cuenta.');
  mount(root, volver, tituloGrande(l.nombre, 'Qué explica el número'), total,
    h('h2', { class: 'lg-t', text: 'Productos que explican el número' }), lista,
    h('div', { class: 'lc-enlaces' },
      h('a', { class: 'btn btn-ghost', href: '#/perdida', 'data-accion': 'perdida' }, icon('alerta', 18), h('span', { text: 'Pérdida de la semana' })),
      h('a', { class: 'btn btn-ghost', href: '#/control', 'data-accion': 'control' }, icon('stock', 18), h('span', { text: 'Control' }))));
}
