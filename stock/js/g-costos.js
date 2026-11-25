// Gerencia · Costos (módulo amarillo). #/costos: lista de platos con su costo % y la cobertura ("12 de 28 platos");
// #/costos/<id>: ficha del plato numerada (1 ingredientes con su costo, 2 costo total, 3 ganancia por plato, 4 costo %
// contra la meta del 30 % y, si se pasa, el precio sugerido). La cuenta está en costos.js (puro).
// Precio de venta = promedio de lo cobrado en Núcleo en los últimos 28 días (puede incluir IVA). Sin precio de un insumo,
// sin receta o sin ventas: "Falta dato" con lo que falta, fuera del % global y sin sugerencia. Packaging no entra.
import { mount, h, fmtMoney, fmtNum, porTexto, esCarta, jornadaISO, sumarDias, medidaReceta } from './util.js';
import { cargarRecetas, ventasItemsTodos, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, banner, tituloGrande, vacio, pasoFicha, icon } from './ui.js';
import { resumenCostos, fichaPlato, ventasPorPlato, textoPct, META } from './costos.js';

export const DIAS_VENTAS = 28;
const NOTA = 'Precio de venta = promedio de Núcleo (puede incluir IVA)';
const plata = (x) => fmtMoney(Math.round(x));

// Datos de Costos (también los usa el Inicio). Se reusan 60 s para no bajar las ventas dos veces seguidas.
let cache = null;
export function cargarCostos() {
  if (cache && Date.now() - cache.t < 60e3) return cache.p;
  const hoy = jornadaISO();
  const p = (async () => {
    await cargarG(['prods', 'locales', 'precios'], () => {});
    const [recetas, items] = await Promise.all([cargarRecetas(), ventasItemsTodos(sumarDias(hoy, -DIAS_VENTAS), sumarDias(hoy, -1))]);
    const cat = { prods: G.prods, precios: G.precios, recetas: new Map((recetas || []).map(r => [r.producto_id, r])) };
    const platos = [...G.prods.values()].filter(p => esCarta(p) && p.activo !== false);
    return { cat, platos, ventas: ventasPorPlato(items), hoy };
  })();
  cache = { t: Date.now(), p };
  p.catch(() => { cache = null; });
  return p;
}

export async function render(root, ctx) {
  const id = decodeURIComponent((location.hash.split('/')[2] || '').trim());
  mount(root, tituloGrande(id ? 'Plato' : 'Costos'), esqueleto(5));
  let d;
  try { d = await cargarCostos(); } catch (e) { return mount(root, tituloGrande('Costos'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  if (id) return ficha(root, d, id);
  lista(root, d);
}

function lista(root, d) {
  const res = resumenCostos(d.platos, d.cat, d.ventas);
  if (!res.total) return mount(root, tituloGrande('Costos'), vacio('Sin platos', 'Cuando haya platos de la carta con receta, acá ves cuánto cuesta cada uno.'));
  const pct = textoPct(res.pct);
  const kpi = h('section', { class: 'cs-kpi' },
    h('div', { class: 'cs-kpi-v' }, h('small', { text: 'Costo comida' }), pct ? h('b', { class: 'num', 'data-pct': 'global', text: pct }) : h('b', { class: 'cs-falta', 'data-pct': 'global', text: 'Falta dato' })),
    h('div', { class: 'cs-kpi-s' }, h('span', { 'data-cobertura': '', text: `${res.cubiertos} de ${res.total} platos con todos los datos` }), h('span', { text: `Meta ${Math.round(META * 100)} % · últimos ${DIAS_VENTAS} días` })));
  const porLocal = new Map();
  for (const f of res.fichas) { const k = f.plato.local_id || ''; if (!porLocal.has(k)) porLocal.set(k, []); porLocal.get(k).push(f); }
  const grupos = [...porLocal].sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0]))).map(([lid, fs]) => {
    fs.sort((a, b) => (b.completo - a.completo) || ((b.pct || 0) - (a.pct || 0)) || porTexto(a.plato.nombre, b.plato.nombre));
    return h('section', { class: 'cs-grupo' }, h('h2', { class: 'lg-t', text: nombreLocal(lid) || 'Sin local' }),
      h('div', { class: 'cs-lista' }, fs.map(f => h('a', { class: 'cs-fila', href: '#/costos/' + encodeURIComponent(f.plato.id), 'data-plato': f.plato.id },
        h('span', { class: 'cs-fila-tx' }, h('b', { text: f.plato.nombre }),
          h('small', { text: f.completo ? `Costo ${plata(f.costo)} · venta ${plata(f.precio)}` : 'Falta ' + f.faltan.slice(0, 2).join(', ') + (f.faltan.length > 2 ? '…' : '') })),
        f.completo ? h('span', { class: 'cs-pct num' + (f.pct > META ? ' is-alto' : ''), text: textoPct(f.pct) }) : h('span', { class: 'cs-pct is-falta', text: 'Falta dato' }),
        icon('flecha', 18)))));
  });
  mount(root, tituloGrande('Costos', 'Cuánto cuesta cada plato'), kpi, ...grupos, h('p', { class: 'cs-nota', text: NOTA }));
}

function ficha(root, d, id) {
  const plato = d.cat.prods.get(id);
  if (!plato || !esCarta(plato)) return mount(root, tituloGrande('Plato'), vacio('No encontramos ese plato', 'Volvé a la lista de Costos.'), h('p', {}, h('a', { href: '#/costos', text: '‹ Costos' })));
  const f = fichaPlato(plato, d.cat, d.ventas);
  const cant = (it) => {
    const p = d.cat.prods.get(it.insumo_id);
    const m = p ? medidaReceta(p) : null;
    return m ? `${fmtNum(it.cantidad * m.mult, 1)} ${m.u}` : `${fmtNum(it.cantidad, 3)} ${it.unidad}`;
  };
  const tabla = f.ingredientes.length
    ? h('table', { class: 'pf-tabla' }, h('tbody', {}, f.ingredientes.map(it => h('tr', { 'data-insumo': it.insumo_id },
      h('td', {}, h('span', { text: it.nombre }), h('small', { text: cant(it) })),
      h('td', { class: 'num' + (it.costo == null ? ' is-falta' : ''), text: it.costo == null ? 'Falta precio' : plata(it.costo) })))))
    : h('p', { class: 'pf-s', text: 'Este plato no tiene receta cargada.' });
  const sub = f.precio != null ? `Precio de venta ${plata(f.precio)} · ${fmtNum(f.vendidos, 0)} vendidos en ${DIAS_VENTAS} días` : `Sin ventas en los últimos ${DIAS_VENTAS} días`;
  const faltan = f.faltan.length ? banner('Falta dato: ' + f.faltan.join(', ') + '. Este plato no entra en el % global.', 'warn') : null;
  const metaTxt = `Meta ${Math.round(META * 100)} %`;
  const cuatro = f.completo
    ? pasoFicha(4, `Costo comida ${textoPct(f.pct)}`, h('span', { class: 'pf-s', 'data-sugerido': f.sugerido || '' },
      f.sugerido ? `${metaTxt}: para llegar, el precio sería ${plata(f.sugerido)}.` : `${metaTxt}: está dentro de la meta.`))
    : pasoFicha(4, 'Costo comida', h('span', { class: 'pf-s', text: `Falta dato · ${metaTxt}` }));
  mount(root,
    tituloGrande(plato.nombre, `${nombreLocal(plato.local_id)} · ${sub}`, { volver: h('a', { class: 'volver-hoy', href: '#/costos' }, icon('atras', 20), h('span', { text: 'Costos' })) }),
    faltan,
    h('div', { class: 'pf-lista' },
      pasoFicha(1, 'Ingredientes', tabla),
      h('div', { class: 'pf-res' },
        pasoFicha(2, 'Costo total', h('b', { class: 'pf-v num', 'data-costo': '', text: f.costo != null ? plata(f.costo) : 'Falta dato' })),
        pasoFicha(3, 'Ganancia por plato', h('b', { class: 'pf-v num', 'data-ganancia': '', text: f.ganancia != null ? plata(f.ganancia) : 'Falta dato' }))),
      cuatro),
    h('p', { class: 'cs-nota', text: NOTA }));
}
