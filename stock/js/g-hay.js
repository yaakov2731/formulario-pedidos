// Gerencia · Lo que hay: matriz producto × local con lo que quedó en el último cierre (o el stock del sistema si el local no
// cerró en la semana), coloreado por estado (rojo no alcanza para abrir, amarillo pedir esta semana, verde alcanza, gris sin
// historial), total, valor a precio de la última compra y tendencia (solo con 2 o más cierres reales). Al tocar una fila,
// la ficha del producto: últimos 8 cierres reales, uso por día abierto y sugerido. Los productos son por local: las filas
// juntan el mismo nombre y unidad (reposicion.js, clavePorNombre). El Shopping no entra (no elabora; tiene sus retiros).
// También exporta lo que usa Comprar (g-comprar.js): la carga de datos por local y la ficha.
import { mount, h, fmtNum, fmtMoney, esCarta, porTexto, esBulto, factorDe, plural, jornadaISO, sumarDias, elabora, tokens, coincide, debounce } from './util.js';
import { swr, datosReposicion } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, banner, tituloGrande, hoja, icon } from './ui.js';
import { planLocal, cierresDeAnoche, clavePorNombre, textoAlcanza } from './reposicion.js';

const n2 = (x) => (x === null || x === undefined ? '—' : fmtNum(Math.round(x * 10) / 10, 1) || '0');
export const plata = (x) => fmtMoney(Math.round(x || 0));
export const plataCorta = (x) => (x >= 1e6 ? '$ ' + (x / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' M' : plata(x));
const uDe = (p, n = 2) => plural(p.unidad_uso || p.unidad_compra || 'unidad', n);
export const uPedido = (p, n) => plural(esBulto(p) ? p.unidad_compra : (p.unidad_compra || p.unidad_uso || 'unidad'), n);
export const precioDe = (p) => G.precios.get(p.id) || 0;
// Valor de lo que queda (unidad de uso) a precio de la última compra (por unidad de compra).
export const valorDe = (p, q) => (q > 0 ? q / (Number(p.factor_conversion) || 1) * precioDe(p) : 0);
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const etiqueta = (iso) => { const [y, m, d] = iso.split('-').map(Number); return DIAS_C[new Date(y, m - 1, d).getDay()] + ' ' + d; };

// Cambia el ancho de la columna mientras la vista está abierta (tablas anchas en la PC). Devuelve con qué volver.
export function vistaAncha() {
  const app = document.getElementById('app');
  if (app) app.classList.add('vista-ancha');
  return () => { if (app) app.classList.remove('vista-ancha'); };
}

// ---- Datos por local (los usan Lo que hay y Comprar) ----
// R.locs: locales que elaboran y están activos. Por local: rep (datosReposicion), quedan (Map id → cantidad), plan
// (planLocal), cierre { esperada, hecho }. Se baja cada local por separado (swr por local) y se repinta al llegar.
export function estadoReposicion() { return { jornada: jornadaISO(), locs: [], reps: new Map(), quedan: new Map(), planes: new Map(), cierre: new Map(), cargando: true, errores: 0 }; }
export async function cargarReposicion(R, alCambiar) {
  await cargarG(['prods', 'provs', 'locales', 'precios', 'stock'], alCambiar);
  R.locs = G.locales.filter(l => l.activo !== false && elabora(l.codigo)).sort((a, b) => porTexto(a.nombre, b.nombre));
  calcular(R);
  await Promise.allSettled(R.locs.map(l => swr('rep:' + l.id, () => datosReposicion(l.id, R.jornada), (d) => {
    if (!d || d.hoy !== R.jornada) return;
    R.reps.set(l.id, d); calcular(R, l.id); if (alCambiar) alCambiar();
  }).catch(() => { R.errores++; })));
  R.cargando = false;
  calcular(R);
}
export const prodsDe = (lid) => [...G.prods.values()].filter(p => p.local_id === lid && p.activo !== false && !esCarta(p) && !p.es_elaborado);
// Lo que queda: lo contado en el último cierre de la semana + lo que llegó después; si no cerró en 7 días, el stock del sistema.
function quedanLocal(R, lid) {
  const m = new Map();
  for (const p of prodsDe(lid)) { const s = G.stock.get(lid + '|' + p.id); if (s !== undefined) m.set(p.id, s); }
  const rep = R.reps.get(lid);
  if (rep && rep.ultimo && rep.ultimo >= sumarDias(R.jornada, -7)) {
    const recep = new Map(rep.recep || []);
    for (const [id, xs] of rep.cierres || []) { const x = xs.find(([f]) => f === rep.ultimo); if (x) m.set(id, Math.round((x[1] + (recep.get(id) || 0)) * 1000) / 1000); }
  }
  return m;
}
function calcular(R, soloLid) {
  const hojaPorLocal = new Map([...R.reps].map(([lid, rep]) => [lid, rep.ultimo ? [{ tipo: 'cierre', fecha: rep.ultimo }] : []]));
  for (const c of cierresDeAnoche(hojaPorLocal, R.locs, R.jornada)) R.cierre.set(c.local.id, c);
  for (const l of R.locs) {
    if (soloLid && l.id !== soloLid && R.planes.has(l.id)) continue;
    const rep = R.reps.get(l.id);
    const q = quedanLocal(R, l.id);
    R.quedan.set(l.id, q);
    R.planes.set(l.id, planLocal({ prods: prodsDe(l.id), quedan: q, cons: new Map(rep ? rep.cons : []), pend: new Map(rep ? rep.pend : []), local: l, hoy: R.jornada, cierre: rep && rep.ultimo && rep.ultimo >= sumarDias(R.jornada, -7) ? rep.ultimo : null }));
  }
}
const cierresDe = (R, lid, pid) => { const rep = R.reps.get(lid); const x = rep && (rep.cierres || []).find(([id]) => id === pid); return x ? x[1] : []; };

// ---- Ficha de un producto (también se abre desde Comprar) ----
// p: producto de un local; R: estado de reposición. Si el mismo producto está en otros locales, se puede cambiar de local.
export function abrirFicha(R, p) {
  const clave = clavePorNombre(p);
  const hermanos = R.locs.map(l => prodsDe(l.id).find(x => clavePorNombre(x) === clave)).filter(Boolean);
  let actual = p;
  const cuerpo = h('div', { class: 'fi' });
  const prov = (x) => (x.proveedor_id && G.provs.get(x.proveedor_id) ? G.provs.get(x.proveedor_id).nombre : 'Sin proveedor');
  const nombreL = (lid) => (R.locs.find(l => l.id === lid) || {}).nombre || 'Local';
  function pintar() {
    const x = actual, lid = x.local_id;
    const e = (R.planes.get(lid) && R.planes.get(lid).items.get(x.id)) || { c: 'gris', uso: null, dias: null, pedir: null, quedan: 0 };
    const cs = cierresDe(R, lid, x.id);
    const pr = precioDe(x);
    const graf = cs.length ? grafico(cs, e.uso, x) : h('p', { class: 'cd-nota', text: 'Todavía no hay cierres de este producto en este local.' });
    mount(cuerpo,
      h('p', { class: 'fi-k', text: `${x.categoria || 'Sin categoría'} · ${prov(x)}${pr ? ` · ${plata(pr)} por ${x.unidad_compra || x.unidad_uso || 'unidad'}` : ''}` }),
      hermanos.length > 1 ? h('div', { class: 'chips chips-scroll fi-locales', role: 'group', 'aria-label': 'Local' }, hermanos.map(y => h('button', { class: 'chip' + (y.id === x.id ? ' is-on' : ''), type: 'button', 'aria-pressed': y.id === x.id ? 'true' : 'false', 'data-local': y.local_id, text: nombreL(y.local_id),
        on: { click: () => { actual = y; pintar(); } } }))) : h('p', { class: 'fi-k', text: nombreL(lid) }),
      h('div', { class: 'fi-stats' },
        h('div', {}, h('b', { class: 'num', text: `${n2(e.quedan)} ${uDe(x, e.quedan)}` }), h('small', { text: 'quedan' })),
        h('div', {}, h('b', { class: 'num', text: e.uso === null ? 'Sin historial' : `${n2(e.uso)} ${uDe(x, e.uso)}` }), h('small', { text: 'se usa por día abierto' })),
        h('div', { class: 'fi-' + e.c }, h('b', { class: 'num', text: textoAlcanza(e.dias) }), h('small', { text: 'alcanza' }))),
      h('h3', { class: 'fi-t', text: cs.length ? `Lo que quedó en los últimos ${cs.length === 1 ? 'cierre' : cs.length + ' cierres'}` : 'Últimos cierres' }), graf,
      cs.length ? h('div', { class: 'ley' }, h('span', {}, h('i', { class: 'ley-gris' }), 'sobró al cerrar'), h('span', {}, h('i', { class: 'ley-rojo' }), 'no alcanzaba para abrir'), e.uso !== null ? h('span', {}, h('i', { class: 'ley-amar' }), 'uso de un día') : null) : null,
      e.pedir === null ? h('p', { class: 'cd-nota', text: 'Sin historial suficiente para sugerir: no inventamos un número.' })
        : e.pedir > 0 ? h('div', { class: 'cd-prox' }, h('div', {}, h('span', { class: 'cd-k', text: 'Sugerido' }), h('b', { text: `Pedir ${fmtNum(e.pedir, 3)} ${uPedido(x, e.pedir)}${pr ? ' · ' + plata(e.pedir * pr) : ''}` })),
          h('span', { class: 'cd-pill p-' + e.c, text: e.c === 'rojo' ? 'urgente' : 'semana' }))
          : h('p', { class: 'cd-nota', text: e.pendiente ? 'Lo que falta ya está pedido.' : 'No hace falta pedir esta semana.' }));
  }
  pintar();
  hoja(p.nombre, cuerpo);
}
function grafico(cs, uso, p) {
  const W = 520, H = 170, pl = 34, pb = 26;
  const vals = cs.map(c => Number(c[1]) || 0);
  const mx = Math.max(...vals, (uso || 0) * 1.2, 1);
  const bw = (W - pl - 10) / Math.max(cs.length, 4);
  const y = (v) => H - pb - (v / mx) * (H - pb - 12);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img'); svg.setAttribute('class', 'fi-graf');
  svg.setAttribute('aria-label', `Lo que quedó en los últimos cierres de ${p.nombre}`);
  const el = (t, a, txt) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); if (txt !== undefined) e.textContent = txt; svg.append(e); return e; };
  for (const t of [0, mx / 2, mx]) { el('line', { x1: pl, x2: W - 6, y1: y(t), y2: y(t), class: 'g-linea' }); el('text', { x: pl - 6, y: y(t) + 4, 'text-anchor': 'end', class: 'g-tx' }, n2(t)); }
  cs.forEach(([f, v], i) => {
    const x = pl + i * bw + bw * 0.18;
    const cls = uso !== null && v < uso ? 'g-rojo' : i === cs.length - 1 ? 'g-ult' : 'g-barra';
    el('rect', { x, y: y(v), width: bw * 0.64, height: Math.max(1, H - pb - y(v)), rx: 3, class: cls });
    el('text', { x: x + bw * 0.32, y: H - 8, 'text-anchor': 'middle', class: 'g-tx' }, etiqueta(f));
  });
  if (uso !== null) el('line', { x1: pl, x2: W - 6, y1: y(uso), y2: y(uso), class: 'g-uso' });
  return h('div', { class: 'fi-graf-w' }, svg);
}
export function spark(v) {
  const mx = Math.max(...v, 1), w = 64, hh = 20;
  const pts = v.map((x, i) => [(i / (v.length - 1) * w), (hh - 2 - x / mx * (hh - 4))]);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hh}`); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
  const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')); pl.setAttribute('class', 's-l');
  const c = document.createElementNS(ns, 'circle'); const [lx, ly] = pts[pts.length - 1]; c.setAttribute('cx', lx.toFixed(1)); c.setAttribute('cy', ly.toFixed(1)); c.setAttribute('r', '2.2'); c.setAttribute('class', 's-c');
  svg.append(pl, c);
  return svg;
}

// ---- Pantalla ----
const TANDA = 150;
export async function render(root, ctx) {
  const fin = vistaAncha();
  const R = estadoReposicion();
  let q = '', cat = 'Todas', cuantos = TANDA;
  const cuerpo = h('div', {}, esqueleto(6));
  const cab = h('div', { class: 'cq-cab' });
  mount(root, tituloGrande('Lo que hay'), cuerpo);
  let armado = false;
  const repintar = debounce(() => { if (ctx.alive() && armado) pintarTabla(); }, 120);
  try { await cargarReposicion(R, repintar); } catch (e) { if (!G.prods.size) throw e; }
  if (!ctx.alive()) return fin;

  const total = h('b', { class: 'num' });
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: '', 'aria-label': 'Buscar producto', autocomplete: 'off', value: q,
    on: { input: (e) => { q = e.target.value; cuantos = TANDA; pintarTabla(); } } });
  const chips = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Categorías' });
  const zona = h('div', { class: 'cq-zona' });
  const pie = h('div', {});
  let filas = [];
  function armarFilas() {
    const m = new Map();
    for (const l of R.locs) for (const p of prodsDe(l.id)) {
      const k = clavePorNombre(p);
      if (!m.has(k)) m.set(k, { k, p, por: new Map() });
      m.get(k).por.set(l.id, p);
    }
    filas = [...m.values()].sort((a, b) => porTexto(a.p.nombre, b.p.nombre));
  }
  function pintarTabla() {
    armarFilas();
    const cats = ['Todas', ...[...new Set(filas.map(f => f.p.categoria || 'Sin categoría'))].sort(porTexto)];
    if (!cats.includes(cat)) cat = 'Todas';
    chips.replaceChildren(...cats.map(c => h('button', { class: 'chip' + (c === cat ? ' is-on' : ''), type: 'button', 'aria-pressed': c === cat ? 'true' : 'false', 'data-cat': c, text: c,
      on: { click: () => { cat = c; cuantos = TANDA; pintarTabla(); } } })));
    buscador.placeholder = `Buscar entre ${filas.length} productos`;
    const toks = tokens(q);
    const vis = filas.filter(f => (cat === 'Todas' || (f.p.categoria || 'Sin categoría') === cat) && (!toks.length || coincide(f.p.nombre, toks)));
    let valorTot = 0;
    const datos = vis.map(f => {
      let tot = 0, val = 0;
      const celdas = R.locs.map(l => {
        const p = f.por.get(l.id);
        if (!p) return null;
        const qq = (R.quedan.get(l.id) || new Map()).get(p.id) || 0;
        const e = R.planes.get(l.id) && R.planes.get(l.id).items.get(p.id);
        tot += qq; val += valorDe(p, qq);
        return { p, q: qq, c: e ? e.c : 'gris' };
      });
      valorTot += val;
      return { f, celdas, tot, val };
    });
    total.textContent = plata(valorTot);
    const fila = ({ f, celdas, tot, val }) => {
      // Tendencia: suma de los cierres reales de los locales, alineada por fecha; solo con 2 o más.
      const porFecha = new Map();
      for (const [lid, p] of f.por) for (const [fe, v] of cierresDe(R, lid, p.id)) porFecha.set(fe, (porFecha.get(fe) || 0) + Number(v));
      const serie = [...porFecha].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-8).map(x => x[1]);
      const prov = f.p.proveedor_id && G.provs.get(f.p.proveedor_id) ? G.provs.get(f.p.proveedor_id).nombre : 'Sin proveedor';
      return h('tr', { class: 'is-toca', 'data-clave': f.k, tabindex: '0', on: { click: () => abrirFicha(R, celdas.find(Boolean).p), keydown: (ev) => { if (ev.key === 'Enter') abrirFicha(R, celdas.find(Boolean).p); } } },
        h('td', { class: 'cq-prod' }, h('span', { text: f.p.nombre }), h('small', { text: `${f.p.categoria || 'Sin categoría'} · ${prov}` })),
        ...celdas.map(c => h('td', {}, c ? h('span', { class: 'cd-pill p-' + c.c, title: { rojo: 'No alcanza para abrir', amar: 'Pedir esta semana', verde: 'Alcanza', gris: 'Sin historial' }[c.c] }, n2(c.q)) : h('span', { class: 'cq-cero', text: '·' }))),
        h('td', { class: 'num' }, `${n2(tot)} ${uDe(f.p, tot)}`),
        h('td', { class: 'num' }, val ? plata(val) : '—'),
        h('td', {}, serie.length >= 2 ? spark(serie) : h('span', { class: 'cq-cero', text: '—' })));
    };
    if (!vis.length) { zona.replaceChildren(vacio(q ? 'No encontramos ese producto' : 'Sin productos', q ? 'Probá con otra palabra.' : 'Todavía no hay productos en los locales.')); pie.replaceChildren(); return; }
    zona.replaceChildren(h('div', { class: 'gs-tabla-w cq-tw' }, h('table', { class: 'gs-tabla cq-tabla cq-matriz' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Producto' }), ...R.locs.map(l => h('th', { text: l.nombre })), h('th', { text: 'Total' }), h('th', { text: 'Valor' }), h('th', { text: 'Tendencia' }))),
      h('tbody', {}, datos.slice(0, cuantos).map(fila)))));
    pie.replaceChildren(vis.length > cuantos ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: `Ver ${Math.min(TANDA, vis.length - cuantos)} más (${vis.length - cuantos} sin mostrar)`, on: { click: () => { cuantos += TANDA; pintarTabla(); } } }) : null);
  }
  const ultimo = [...R.reps.values()].map(r => r.ultimo).filter(Boolean).sort().pop();
  mount(cab, h('div', { class: 'kpi cq-total' }, h('span', { class: 'kpi-t', text: 'Valor total' }), total));
  mount(root, tituloGrande('Lo que hay', ultimo ? `Último cierre · ${fechaCortaISO(ultimo)}` : 'Todavía no hay cierres: se muestra el stock del sistema'), cab,
    R.errores ? banner(`No se pudieron cargar los cierres de ${R.errores} ${R.errores === 1 ? 'local' : 'locales'}: se muestra el stock del sistema.`, 'warn') : null,
    h('div', { class: 'cq-filtros' }, h('div', { class: 'busca' }, icon('buscar', 20), buscador), chips), zona, pie,
    h('div', { class: 'ley' }, h('span', {}, h('i', { class: 'ley-rojo' }), 'no alcanza para abrir'), h('span', {}, h('i', { class: 'ley-amar' }), 'pedir esta semana'), h('span', {}, h('i', { class: 'ley-verde' }), 'alcanza'), h('span', {}, h('i', { class: 'ley-gris' }), 'sin historial')));
  armado = true;
  pintarTabla();
  return fin;
}
export const fechaCortaISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' }); };
