// Gerencia · Cocina · Recetas: insumos y rinde de cada plato y elaborado; platos vendidos sin receta.
import { mount, h, norm, fmtNum, fmtMoney, parseNum, porTexto, esCarta } from './util.js';
import { cargarRecetas, guardarReceta, platosSinReceta, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, icon, SUBNAV_COCINA } from './ui.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Recetas' }), h('p', { class: 'sub', text: 'Qué lleva cada plato y cada elaborado' }));
  mount(root, cab, subnav(SUBNAV_COCINA, 'recetas'), esqueleto(4));
  await cargarG(['prods', 'locales', 'precios'], () => {});
  if (!ctx.alive()) return;

  let recetas = new Map(); let sinReceta = []; let filtro = 'todos'; let q = '';
  const chips = chipsLocal(() => cargarLocal());
  const zona = h('div', {});

  async function cargarLocal() {
    try { recetas = new Map((await cargarRecetas()).map(r => [r.producto_id, r])); } catch (e) { toast(mensajeError(e), 'error'); }
    try { sinReceta = await platosSinReceta(chips.get()); } catch (_e) { sinReceta = []; }
    pintar();
  }

  const nItems = (p) => { const r = recetas.get(p.id); return r ? r.receta_items.length : 0; };
  const unidad = (p) => p.unidad_uso || 'unidad';

  function costo(r) {
    let t = 0, hay = false;
    for (const it of r.items) {
      const ins = G.prods.get(it.insumo_id);
      if (ins && G.precios.has(it.insumo_id)) { t += it.cantidad * G.precios.get(it.insumo_id) / (Number(ins.factor_conversion) || 1); hay = true; }
    }
    return hay ? t / r.rinde : null;
  }

  function editar(p) {
    const previa = recetas.get(p.id);
    const r = { rinde: previa ? Number(previa.rinde) : 1, items: previa ? previa.receta_items.map(i => ({ insumo_id: i.insumo_id, cantidad: Number(i.cantidad) })) : [] };
    const cuerpo = h('div', { class: 'form' });
    const { cerrar } = hoja(`Receta · ${p.nombre}`, cuerpo);

    function vistaEditor() {
      const inRinde = h('input', { class: 'input num', id: 'r-rinde', type: 'text', inputmode: 'decimal', value: fmtNum(r.rinde, 3), 'aria-label': 'Rinde', on: { change: (e) => { const n = parseNum(e.target.value); r.rinde = n && n > 0 ? n : r.rinde; e.target.value = fmtNum(r.rinde, 3); vistaEditor(); } } });
      const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
      const filas = r.items.map((it, i) => {
        const ins = G.prods.get(it.insumo_id) || { nombre: 'Insumo' };
        const inp = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: fmtNum(it.cantidad, 4), 'aria-label': `Cantidad de ${ins.nombre}`, on: { change: (e) => { const n = parseNum(e.target.value); if (n && n > 0) it.cantidad = n; e.target.value = fmtNum(it.cantidad, 4); } } });
        return h('div', { class: 'ins' }, h('span', { class: 'ins-n', text: ins.nombre }),
          h('div', { class: 'ins-c' }, inp, h('span', { class: 'mute', text: ins.unidad_uso || 'unidad' }),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Quitar ${ins.nombre}`, on: { click: () => { r.items.splice(i, 1); vistaEditor(); } } }, icon('cerrar', 18))));
      });
      const c = costo(r);
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar receta' });
      btn.addEventListener('click', async () => {
        err.replaceChildren();
        if (!r.items.length) return err.append(document.createTextNode('Agregá al menos un insumo.'));
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          await guardarReceta(p.id, r.rinde, r.items.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })), null);
          recetas.set(p.id, { ...(previa || {}), producto_id: p.id, rinde: r.rinde, receta_items: r.items.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })) });
          sinReceta = sinReceta.filter(x => x.producto_id !== p.id);
          toast('Receta guardada', 'ok'); cerrar(); pintar();
        } catch (e) { err.replaceChildren(document.createTextNode(mensajeError(e))); btn.disabled = false; btn.textContent = 'Guardar receta'; }
      });
      cuerpo.replaceChildren(
        campo(`Rinde (${unidad(p)})`, inRinde, 'Cuántas unidades salen con estas cantidades.'),
        h('div', { class: 'ins-lista' }, ...(filas.length ? filas : [h('p', { class: 'mute centro', text: 'Todavía no tiene insumos.' })])),
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'Agregar insumo', on: { click: vistaPicker } }),
        c !== null ? h('p', { class: 'sub', text: `Costo estimado por ${unidad(p)}: ${fmtMoney(c)}` }) : null, err, btn);
    }

    function vistaPicker() {
      let t = '';
      const lista = h('div', { class: 'lista lista-sheet' });
      const usados = new Set(r.items.map(i => i.insumo_id));
      const pintarOpc = () => {
        const tk = norm(t).split(' ').filter(Boolean);
        const vis = [...G.prods.values()].filter(x => x.local_id === p.local_id && x.id !== p.id && x.activo !== false && !esCarta(x) && !usados.has(x.id) && tk.every(k => norm(x.nombre + ' ' + x.codigo).includes(k)))
          .sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 40);
        lista.replaceChildren(...(vis.length ? vis.map(x => h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Agregar ${x.nombre}`, on: { click: () => { r.items.push({ insumo_id: x.id, cantidad: 1 }); vistaEditor(); } } },
          h('span', { class: 'prod-n', text: x.nombre }), h('span', { class: 'prod-m' }, h('span', { text: x.categoria || '' }), h('span', { text: x.unidad_uso || '' })))) : [vacio('No encontramos ese producto')]));
      };
      const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar insumo', 'aria-label': 'Buscar insumo', autocomplete: 'off', on: { input: (e) => { t = e.target.value; pintarOpc(); } } });
      cuerpo.replaceChildren(buscador, lista, h('button', { class: 'btn btn-text', type: 'button', text: 'Volver a la receta', on: { click: vistaEditor } }));
      pintarOpc(); setTimeout(() => buscador.focus(), 50);
    }
    vistaEditor();
  }

  function tarjeta(p) {
    const n = nItems(p); const r = recetas.get(p.id);
    return h('button', { class: 'prod prod-cat', type: 'button', 'data-id': p.id, 'aria-label': `Receta de ${p.nombre}`, on: { click: () => editar(p) } },
      h('span', { class: 'prod-n', text: p.nombre }),
      h('span', { class: 'prod-m' }, h('span', { text: esCarta(p) ? 'Plato' : 'Elaborado' }), n ? h('span', { text: `${n} ${n === 1 ? 'insumo' : 'insumos'} · rinde ${fmtNum(r.rinde, 3)}` }) : h('span', { class: 'chip-aviso', text: 'Sin receta' })));
  }

  function pintar() {
    if (!ctx.alive()) return;
    const tk = norm(q).split(' ').filter(Boolean);
    let vis = [...G.prods.values()].filter(p => p.local_id === chips.get() && p.es_elaborado && p.activo !== false && tk.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)));
    if (filtro === 'platos') vis = vis.filter(esCarta); else if (filtro === 'elaborados') vis = vis.filter(p => !esCarta(p)); else if (filtro === 'sin') vis = vis.filter(p => !nItems(p));
    vis.sort((a, b) => porTexto(a.nombre, b.nombre));
    const filtros = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar' }, [['todos', 'Todos'], ['platos', 'Platos'], ['elaborados', 'Elaborados'], ['sin', 'Sin receta']].map(([id, t]) =>
      h('button', { class: 'chip' + (filtro === id ? ' is-on' : ''), type: 'button', text: t, 'aria-pressed': filtro === id ? 'true' : 'false', on: { click: () => { filtro = id; pintar(); } } })));
    const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar plato o elaborado', 'aria-label': 'Buscar plato o elaborado', autocomplete: 'off', value: q, on: { input: (e) => { q = e.target.value; pintarLista(); } } });
    const lista = h('div', { class: 'lista', id: 'lista-rec' });
    const pintarLista = () => {
      const tk2 = norm(q).split(' ').filter(Boolean);
      const v2 = vis.filter(p => tk2.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)));
      lista.replaceChildren(...(v2.length ? v2.map(tarjeta) : [vacio('No hay platos ni elaborados', 'Los platos se crean al importar las ventas de Núcleo; los elaborados, en Catálogo.')]));
    };
    mount(zona,
      sinReceta.length ? h('section', { class: 'bloque' }, h('h2', { class: 'bloque-t', text: `Vendidos sin receta · ${sinReceta.length}` }),
        h('p', { class: 'sub', text: 'Mientras no tengan receta, sus ventas no descuentan insumos.' }),
        h('ul', { class: 'barras sr' }, sinReceta.slice(0, 12).map(s => h('li', { class: 'bfila' },
          h('button', { class: 'sr-b', type: 'button', 'aria-label': `Cargar receta de ${s.nombre}`, on: { click: () => { const p = G.prods.get(s.producto_id); if (p) editar(p); } } },
            h('span', { class: 'bfila-k', text: s.nombre }), h('b', { class: 'num', text: `${fmtNum(s.vendidos, 3)} vendidos` })))))) : null,
      h('div', { class: 'toolbar' }, filtros, buscador), lista);
    pintarLista();
  }

  mount(root, cab, subnav(SUBNAV_COCINA, 'recetas'), h('div', { class: 'toolbar' }, chips.el), zona);
  await cargarLocal();
}
