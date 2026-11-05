// Gerencia · Stock → Lugares: dónde está cada producto en el local (Cámara, Freezer, Depósito, Barra…) y en qué orden se
// cuenta. El encargado, en Contar, elige un lugar y ve solo lo de ahí, en este orden (0025_lugares.sql).
// Se arma en memoria (mover a otro lugar, subir/bajar, toda una categoría de una vez) y se guarda junto con un botón.
import { mount, h, tokens, coincide, norm, porTexto, esCarta, porLugar, lugarDe, SIN_LUGAR } from './util.js';
import { ubicarProductos, hayColumnaLugar, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, banner, icon, campo, subnav, SUBNAV_STOCK } from './ui.js';

const SUGERIDOS = ['Cámara', 'Freezer', 'Heladera', 'Depósito', 'Barra', 'Cocina'];

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Lugares' }),
    h('p', { class: 'sub', text: 'Dónde está cada cosa y en qué orden se cuenta' }));
  const nav = subnav(SUBNAV_STOCK, 'lugares');
  mount(root, cab, nav, esqueleto(5));
  try { await cargarG(['prods', 'locales', 'stock']); } catch (e) { toast('No se pudo cargar: ' + mensajeError(e), 'error'); }
  if (!ctx.alive()) return;
  if (!hayColumnaLugar()) {
    mount(root, cab, nav, banner('Falta activar Lugares: hay que pegar el SQL 0025_lugares.sql en Supabase.', 'warn'));
    return;
  }

  let localId = null, q = '', orden = [], en = new Map(), sucio = false, guardando = false;
  const lista = h('div', { class: 'lista lug-g' });
  const btn = h('button', { class: 'pill', type: 'button', hidden: true, on: { click: guardar } });
  const prodsLocal = () => [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && !esCarta(p)
    && (!p.oculto || (G.stock.get(p.local_id + '|' + p.id) || 0) > 0 || p.lugar));
  const nombre = new Map();

  // Copia de trabajo: orden de los lugares y, por lugar, la lista de ids en orden. SIN_LUGAR siempre existe y va al final.
  function armar() {
    const g = porLugar(prodsLocal());
    nombre.clear(); for (const ps of g.values()) for (const p of ps) nombre.set(p.id, p);
    en = new Map([...g].map(([l, ps]) => [l, ps.map(p => p.id)]));
    if (!en.has(SIN_LUGAR)) en.set(SIN_LUGAR, []);
    orden = [...en.keys()].filter(l => l !== SIN_LUGAR);
    sucio = false;
  }
  const marcar = () => { sucio = true; pintar(); };
  const sacar = (id) => { for (const ids of en.values()) { const i = ids.indexOf(id); if (i >= 0) ids.splice(i, 1); } };
  const mover = (id, destino) => { sacar(id); if (!en.has(destino)) { en.set(destino, []); orden.push(destino); } en.get(destino).push(id); marcar(); };
  // Borrar un lugar: sus productos pasan a "Sin lugar" (no se borra ningún producto). Se aplica al tocar Guardar.
  const borrarLugar = (l) => {
    const ids = en.get(l) || [];
    if (ids.length && !confirm(`¿Borrar el lugar ${l}? Sus ${ids.length} ${ids.length === 1 ? 'producto queda' : 'productos quedan'} sin lugar (no se borra ningún producto).`)) return;
    en.get(SIN_LUGAR).push(...ids); en.delete(l); orden = orden.filter(x => x !== l); marcar();
  };
  const correr = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; marcar(); };

  // Agregar un lugar (con sugerencias) y pasar toda una categoría a un lugar.
  const nuevo = h('input', { class: 'input', id: 'lug-nuevo', list: 'dl-lug', placeholder: 'Ej.: Cámara', autocomplete: 'off' });
  const agregar = () => {
    const l = nuevo.value.trim().replace(/\s+/g, ' ');
    if (!l) return;
    if (norm(l) === norm(SIN_LUGAR)) return toast('Elegí otro nombre.', 'error');
    if (orden.some(x => norm(x) === norm(l))) return toast(`${l} ya está.`, 'error');
    orden.push(l); en.set(l, []); nuevo.value = ''; marcar();
  };
  nuevo.addEventListener('keydown', (e) => { if (e.key === 'Enter') agregar(); });
  const selCat = h('select', { class: 'input', id: 'lug-cat' });
  const selDest = h('select', { class: 'input', id: 'lug-dest' });
  const pasarCat = () => {
    const c = selCat.value, l = selDest.value;
    if (!c || !l) return toast('Elegí la categoría y el lugar.', 'error');
    const ids = [...nombre.values()].filter(p => (p.categoria || 'Sin categoría') === c).map(p => p.id);
    for (const id of ids) sacar(id);
    en.get(l).push(...ids.sort((a, b) => porTexto(nombre.get(a).nombre, nombre.get(b).nombre)));
    toast(`${ids.length} ${ids.length === 1 ? 'producto' : 'productos'} de ${c} a ${l === SIN_LUGAR ? 'sin lugar' : l}`, 'ok');
    marcar();
  };
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off',
    on: { input: (e) => { q = e.target.value; pintar(); } } });
  const herramientas = h('div', { class: 'lug-tools' },
    h('datalist', { id: 'dl-lug' }, SUGERIDOS.map(s => h('option', { value: s }))),
    h('div', { class: 'lug-tool' }, campo('Agregar un lugar', nuevo),
      h('button', { class: 'btn btn-ghost', type: 'button', on: { click: agregar } }, icon('mas', 18), h('span', { text: 'Agregar' }))),
    h('div', { class: 'lug-tool lug-tool-cat' }, campo('Toda una categoría', selCat), campo('a', selDest),
      h('button', { class: 'btn btn-ghost', type: 'button', on: { click: pasarCat } }, h('span', { text: 'Pasar' }))));

  const opcionesLugar = (actual) => [...orden, SIN_LUGAR].map(l => h('option', { value: l, text: l, selected: l === actual }));
  function fila(id, l, i, ids) {
    const p = nombre.get(id);
    const sel = h('select', { class: 'input lug-sel', 'aria-label': `Lugar de ${p.nombre}`, on: { change: (e) => mover(id, e.target.value) } }, opcionesLugar(l));
    return h('li', { class: 'lug-fila', 'data-id': id },
      l !== SIN_LUGAR ? h('span', { class: 'lug-pos num', text: String(i + 1) }) : null,
      h('div', { class: 'lug-fila-t' }, h('b', { text: p.nombre }), h('span', { text: p.categoria || 'Sin categoría' })),
      sel,
      l !== SIN_LUGAR ? h('div', { class: 'lug-flechas' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Subir ${p.nombre}`, disabled: i === 0, on: { click: () => correr(ids, i, -1) } }, h('span', { 'aria-hidden': 'true', text: '↑' })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Bajar ${p.nombre}`, disabled: i === ids.length - 1, on: { click: () => correr(ids, i, 1) } }, h('span', { 'aria-hidden': 'true', text: '↓' }))) : null);
  }
  function seccion(l, k) {
    const ids = en.get(l) || [];
    const tk = tokens(norm(q));
    const vis = ids.map((id, i) => [id, i]).filter(([id]) => !tk.length || coincide(nombre.get(id).nombre + ' ' + (nombre.get(id).codigo || ''), tk));
    if (tk.length && !vis.length) return null;
    const esSin = l === SIN_LUGAR;
    return h('section', { class: 'lug-sec' + (esSin ? ' is-sin' : ''), 'data-lugar': l },
      h('header', { class: 'lug-sec-h' },
        h('div', { class: 'lug-sec-t' }, h('h2', { class: 'cat-t', text: esSin ? 'Sin lugar' : `${k + 1}. ${l}` }), h('span', { class: 'lug-sec-c', text: `${ids.length} ${ids.length === 1 ? 'producto' : 'productos'}` })),
        esSin ? null : h('div', { class: 'lug-flechas' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Contar ${l} antes`, disabled: k === 0, on: { click: () => correr(orden, k, -1) } }, h('span', { 'aria-hidden': 'true', text: '↑' })),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Contar ${l} después`, disabled: k === orden.length - 1, on: { click: () => correr(orden, k, 1) } }, h('span', { 'aria-hidden': 'true', text: '↓' })),
          h('button', { class: 'icon-btn lug-borrar', type: 'button', 'aria-label': `Borrar el lugar ${l}`, title: 'Borrar lugar', on: { click: () => borrarLugar(l) } }, icon('basura', 18)))),
      ids.length
        ? h('ol', { class: 'lug-filas' }, vis.map(([id, i]) => fila(id, l, i, ids)))
        : h('p', { class: 'lug-vacio', text: esSin ? 'Todo tiene lugar.' : 'Pasá productos acá con el selector de cada uno o con "Toda una categoría". Si lo agregaste por error, borralo con el tacho.' }));
  }

  function pintar() {
    const cats = [...new Set([...nombre.values()].map(p => p.categoria || 'Sin categoría'))].sort(porTexto);
    const cv = selCat.value, dv = selDest.value;
    selCat.replaceChildren(h('option', { value: '', text: 'Categoría…' }), ...cats.map(c => h('option', { value: c, text: c })));
    selDest.replaceChildren(h('option', { value: '', text: 'Lugar…' }), ...opcionesLugar(null));
    selCat.value = cats.includes(cv) ? cv : ''; selDest.value = [...orden, SIN_LUGAR].includes(dv) ? dv : '';
    const secs = [...orden.map((l, k) => seccion(l, k)), seccion(SIN_LUGAR, orden.length)].filter(Boolean);
    lista.replaceChildren(...(nombre.size ? (secs.length ? secs : [vacio('No hay productos', 'Probá con otra palabra.')]) : [vacio('No hay productos', 'El catálogo del local está vacío.')]));
    btn.hidden = !sucio;
    btn.replaceChildren(icon('check', 20), h('span', { text: guardando ? 'Guardando…' : 'Guardar lugares' }));
  }

  async function guardar() {
    if (guardando) return;
    const items = [];
    orden.forEach((l, k) => (en.get(l) || []).forEach((id, i) => items.push({ id, lugar: l, orden: (k + 1) * 1000 + i })));
    for (const id of en.get(SIN_LUGAR) || []) items.push({ id, lugar: null, orden: null });
    const cambia = items.filter(it => { const p = G.prods.get(it.id); return (p.lugar || null) !== it.lugar || (p.orden_lugar ?? null) !== it.orden; });
    if (!cambia.length) { sucio = false; return pintar(); }
    guardando = true; pintar();
    try {
      await ubicarProductos(cambia);
      for (const it of cambia) { const p = G.prods.get(it.id); if (p) { p.lugar = it.lugar; p.orden_lugar = it.orden; } }
      toast(`Lugares guardados · ${cambia.length} ${cambia.length === 1 ? 'producto' : 'productos'}`, 'ok');
      guardando = false; armar();
    } catch (e) { guardando = false; toast('No se pudo guardar: ' + mensajeError(e), 'error'); }
    pintar();
  }

  let volviendo = false;
  const locales = chipsLocal((id) => {
    if (volviendo) { volviendo = false; return; }
    if (sucio && !confirm('Hay cambios sin guardar en este local. ¿Cambiar de local igual?')) {
      const atras = locales.el.querySelector(`[data-local="${localId}"]`);
      if (atras) { volviendo = true; atras.click(); }
      return;
    }
    localId = id; q = ''; buscador.value = ''; armar(); pintar();
  });
  localId = locales.get();
  armar();
  mount(root, cab, nav, locales.el,
    h('p', { class: 'lug-ayuda', text: 'Ordená los lugares como se camina el local y, en cada uno, los productos como están en los estantes. El encargado los cuenta en ese orden.' }),
    herramientas, h('div', { class: 'toolbar-fija' }, buscador), lista, btn);
  pintar();
  const avisar = (e) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', avisar);
  return () => window.removeEventListener('beforeunload', avisar);
}
