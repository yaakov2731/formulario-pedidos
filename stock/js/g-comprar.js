// Gerencia · Comprar: qué hay que comprar con los cierres de anoche de cada local (reposicion.js).
// Arriba, el panel "Cierres de anoche": cuántos locales cerraron (N/M, barra y un renglón por local). Un local sin cierre
// queda fuera del cálculo. Si cerraron todos, el panel queda en un solo renglón. Después 3 números: compra de la semana ($),
// urgentes (no alcanzan para la próxima apertura) y mercadería en los locales ($, a precio de la última compra).
// Abajo, una tabla por proveedor (quedan, alcanza, estado, pedir, subtotal) y "Armar orden": abre Cargar pedido del local
// con esas cantidades (el mismo Pedir del encargado). Martín De Ridder: aviso si no llega al mínimo de $ 100.000.
import { mount, h, fmtNum, porTexto, esMartin, lsGet, lsSet, fechaLarga, plural } from './util.js';
import { G } from './datos.js';
import { esqueleto, vacio, banner, tituloGrande, hoja, listaGrupo, filaLista, selectorLocal } from './ui.js';
import { estadoReposicion, cargarReposicion, abrirFicha, prodsDe, plata, plataCorta, precioDe, valorDe, uPedido, vistaAncha } from './g-hay.js';
import { precargarPedido } from './pedir.js';
import { textoAlcanza } from './reposicion.js';

export const MINIMO_DE_RIDDER = 100000;
const n2 = (x) => fmtNum(Math.round((x || 0) * 10) / 10, 1) || '0';
const uDe = (p, n = 2) => plural(p.unidad_uso || p.unidad_compra || 'unidad', n);

export async function render(root, ctx) {
  const fin = vistaAncha();
  const R = estadoReposicion();
  let localSel = lsGet('g:comprar-local');
  mount(root, tituloGrande('Qué comprar'), esqueleto(6));
  let armado = false;
  let pend = false;
  const repintar = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; if (ctx.alive() && armado) pintar(); }); };
  try { await cargarReposicion(R, repintar); } catch (e) { if (!G.prods.size) throw e; }
  if (!ctx.alive()) return fin;

  function pintar() {
    if (localSel && !R.locs.some(l => l.id === localSel)) localSel = null;
    const locs = R.locs.filter(l => !localSel || l.id === localSel);
    const conCierre = locs.filter(l => (R.cierre.get(l.id) || {}).hecho);
    const filas = [];
    for (const l of conCierre) {
      const plan = R.planes.get(l.id);
      if (!plan) continue;
      for (const p of prodsDe(l.id)) {
        const e = plan.items.get(p.id);
        if (!e || !(e.pedir > 0)) continue;
        filas.push({ p, l, e, plata: e.pedir * precioDe(p), prov: p.proveedor_id || '' });
      }
    }
    const total = filas.reduce((s, x) => s + x.plata, 0);
    const rojos = filas.filter(x => x.e.c === 'rojo');
    let valor = 0;
    for (const l of locs) { const q = R.quedan.get(l.id) || new Map(); for (const p of prodsDe(l.id)) valor += valorDe(p, q.get(p.id) || 0); }
    const proxs = [...new Set(conCierre.map(l => (R.planes.get(l.id) || {}).prox).filter(Boolean).map(x => x.fecha))];
    const unaProx = proxs.length === 1 ? conCierre.map(l => R.planes.get(l.id).prox).find(Boolean) : null;
    const tRojo = unaProx ? (unaProx.dias === 0 ? 'Para hoy' : unaProx.dias === 1 ? 'Para mañana' : 'Antes de abrir') : 'Urgentes';
    const nombreProv = (k) => (k && G.provs.get(k) ? G.provs.get(k).nombre : 'Sin proveedor');
    const porProv = new Map();
    for (const x of filas) { if (!porProv.has(x.prov)) porProv.set(x.prov, []); porProv.get(x.prov).push(x); }
    const provs = [...porProv.keys()].sort((a, b) => porProv.get(b).reduce((s, x) => s + x.plata, 0) - porProv.get(a).reduce((s, x) => s + x.plata, 0) || porTexto(nombreProv(a), nombreProv(b)));

    const sel = selectorLocal({ locales: R.locs.map(l => ({ id: l.id, nombre: l.nombre })), valor: localSel, todos: 'Todos los locales', clave: 'g:comprar-local', onChange: (id) => { localSel = id; pintar(); } });
    // Panel "Cierres de anoche": con el local elegido muestra solo ese local.
    const panelCierres = () => {
      if (!locs.length) return null;
      const N = locs.length, hechos = conCierre.length, faltan = N - hechos;
      const hecho = (l) => !!(R.cierre.get(l.id) || {}).hecho;
      const barra = h('div', { class: 'cc-barra', role: 'img', 'aria-label': `${hechos} de ${N} ${N === 1 ? 'cierre hecho' : 'cierres hechos'}` },
        locs.map(l => h('i', { class: hecho(l) ? 'is-hecho' : null })));
      const cont = h('p', { class: 'cc-cont', 'aria-hidden': 'true' }, h('b', { text: String(hechos) }), h('span', { text: '/' + N }));
      const etiqueta = h('p', { class: 'cc-k', text: 'Cierres de anoche' });
      if (!faltan) {
        return h('section', { class: 'cc is-compacto', 'aria-label': 'Cierres de anoche' },
          h('div', { class: 'cc-tx' }, etiqueta, h('p', { class: 'cc-t', text: N === 1 ? `${locs[0].nombre} hizo el cierre` : 'Todos los locales hicieron el cierre' })),
          h('div', { class: 'cc-ct' }, cont, barra));
      }
      const titulo = !hechos ? 'Ningún local hizo el cierre' : faltan === 1 ? 'Falta 1 cierre' : `Faltan ${faltan} cierres`;
      const ayuda = !hechos ? 'Sin cierre no hay cálculo para ese local. Cuando los locales hagan el cierre, acá aparece qué comprar.'
        : 'Sin cierre no hay cálculo para ese local: no entra en lo de abajo.';
      return h('section', { class: 'cc', 'aria-label': 'Cierres de anoche' },
        h('div', { class: 'cc-tx' }, etiqueta, h('h2', { class: 'cc-t', text: titulo }), h('p', { class: 'cc-ayuda', text: ayuda })),
        h('div', { class: 'cc-ct' }, cont, barra),
        h('ul', { class: 'cc-locs' }, locs.map(l => h('li', { class: 'cc-loc', 'data-local': l.id },
          h('span', { class: 'cc-loc-n', text: l.nombre }),
          hecho(l) ? h('span', { class: 'cc-tag is-hecho', text: 'cierre hecho' }) : h('span', { class: 'cc-tag is-falta', text: 'sin cierre' })))));
    };
    const kpi = (t, v, n, cls = '', title) => h('div', { class: 'kpi cq-kpi' + (cls ? ' ' + cls : ''), title: title || null }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), h('span', { class: 'kpi-n', text: n }));
    const seccion = (k) => {
      const de = porProv.get(k).sort((a, b) => (a.e.c === 'rojo' ? 0 : 1) - (b.e.c === 'rojo' ? 0 : 1) || b.plata - a.plata || porTexto(a.p.nombre, b.p.nombre));
      const st = de.reduce((s, x) => s + x.plata, 0);
      const locsProv = [...new Set(de.map(x => x.l.id))];
      const minimo = esMartin(nombreProv(k)) && st < MINIMO_DE_RIDDER;
      return h('section', { class: 'cq-prov', 'data-prov': nombreProv(k) },
        h('div', { class: 'cq-prov-h' }, h('div', {}, h('h2', { text: nombreProv(k) }), h('p', { class: 'cq-k', text: `${de.length} ${de.length === 1 ? 'renglón' : 'renglones'} · ${plata(st)}` })),
          k ? h('button', { class: 'btn btn-primary cq-armar', type: 'button', text: 'Armar orden', on: { click: () => armar(k, locsProv) } }) : null),
        minimo ? banner(`${nombreProv(k)} tiene un mínimo de ${plata(MINIMO_DE_RIDDER)}: faltan ${plata(MINIMO_DE_RIDDER - st)}.`, 'warn') : null,
        !k ? banner('Estos productos no tienen proveedor: asignalo en Catálogo para armar la orden.', 'info') : null,
        h('div', { class: 'gs-tabla-w cq-tw' }, h('table', { class: 'gs-tabla cq-tabla' },
          h('thead', {}, h('tr', {}, ['Producto', 'Local', 'Quedan', 'Alcanza', 'Estado', 'Pedir', 'Subtotal'].map(t => h('th', { text: t })))),
          h('tbody', {}, de.map(x => h('tr', { class: 'is-toca', tabindex: '0', 'data-id': x.p.id, on: { click: () => abrirFicha(R, x.p), keydown: (ev) => { if (ev.key === 'Enter') abrirFicha(R, x.p); } } },
            h('td', { class: 'cq-prod' }, h('span', { text: x.p.nombre }), h('small', { text: x.p.categoria || 'Sin categoría' })),
            h('td', { class: 'cq-loc', text: x.l.nombre }),
            h('td', { class: 'num', text: `${n2(x.e.quedan)} ${uDe(x.p, x.e.quedan)}` }),
            h('td', { class: 'num cq-alc', text: textoAlcanza(x.e.dias) }),
            h('td', {}, h('span', { class: 'cd-pill p-' + x.e.c, text: x.e.c === 'rojo' ? 'urgente' : 'semana' })),
            h('td', { class: 'num cq-pedir', text: `${fmtNum(x.e.pedir, 3)} ${uPedido(x.p, x.e.pedir)}` }),
            h('td', { class: 'num', text: x.plata ? plata(x.plata) : 'sin precio' })))),
          h('tfoot', {}, h('tr', { class: 'cq-sub' }, h('td', { colspan: '6', text: 'Total ' + nombreProv(k) }), h('td', { class: 'num', text: plata(st) }))))));
    };
    mount(root,
      tituloGrande('Qué comprar', `${fechaLarga(R.jornada)} · con los cierres de anoche`, { accion: sel.el }),
      R.errores ? banner(`No se pudieron cargar los datos de ${R.errores} ${R.errores === 1 ? 'local' : 'locales'}.`, 'warn') : null,
      panelCierres(),
      h('div', { class: 'kpis cq-kpis' },
        kpi('Compra de la semana', plataCorta(total), `${filas.length} ${filas.length === 1 ? 'renglón' : 'renglones'} · ${provs.length} ${provs.length === 1 ? 'proveedor' : 'proveedores'}`, conCierre.length ? '' : 'is-sin', plata(total)),
        kpi(tRojo, String(rojos.length), unaProx ? `no alcanzan para el ${fechaLarga(unaProx.fecha)}` : 'no alcanzan para la próxima apertura', rojos.length ? 'is-rojo' : conCierre.length ? '' : 'is-sin'),
        kpi('Mercadería en los locales', plataCorta(valor), 'a precio de la última compra', '', plata(valor))),
      R.cargando ? esqueleto(3) : null,
      ...provs.map(seccion),
      !R.cargando && !filas.length && conCierre.length ? vacio('No hace falta comprar nada', 'Con lo que quedó anoche alcanza hasta la próxima compra.') : null);
  }

  // Armar orden: deja el pedido del local cargado con lo de este proveedor (lo de otros proveedores en 0) y abre Cargar.
  function armar(provId, lids) {
    const ir = (lid) => {
      const plan = R.planes.get(lid);
      const q = {};
      for (const p of prodsDe(lid)) { const e = plan && plan.items.get(p.id); if (e && e.pedir > 0) q[p.id] = (p.proveedor_id || '') === provId ? e.pedir : 0; }
      precargarPedido(lid, 'gerencia', q);
      lsSet('g:local', lid);
      try { sessionStorage.setItem('stock:pedir-desde-cierre', R.jornada); } catch (_e) { /* nada */ }
      ctx.ir('cargar');
    };
    if (lids.length === 1) return ir(lids[0]);
    const hj = hoja('¿Para qué local?', listaGrupo(null, lids.map(lid => filaLista({ texto: (R.locs.find(l => l.id === lid) || {}).nombre || 'Local', chevron: true, onClick: () => { hj.cerrar(); ir(lid); }, attrs: { 'data-local': lid } }))));
  }

  armado = true;
  pintar();
  return fin;
}
