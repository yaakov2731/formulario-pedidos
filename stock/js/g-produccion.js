// Gerencia · Cocina · Producción: registra la elaboración de un producto (descuenta insumos según su receta y suma lo elaborado).
import { mount, h, norm, fmtNum, parseNum, porTexto, fechaCorta, esCarta, elabora } from './util.js';
import { cargarRecetas, registrarProduccion, produccionesRecientes, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, SUBNAV_COCINA } from './ui.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Producción' }), h('p', { class: 'sub', text: 'Lo que se elabora en el local' }));
  mount(root, cab, subnav(SUBNAV_COCINA, 'produccion'), esqueleto(4));
  await cargarG(['prods', 'locales', 'stock'], () => {});
  if (!ctx.alive()) return;

  let recetas = new Map(); let historial = [];
  const chips = chipsLocal(() => cargarLocal(), l => elabora(l.codigo));
  const zona = h('div', {});
  const quedan = (p) => G.stock.get(p.local_id + '|' + p.id) || 0;

  async function cargarLocal() {
    try { recetas = new Map((await cargarRecetas()).filter(r => r.receta_items.length).map(r => [r.producto_id, r])); } catch (e) { toast(mensajeError(e), 'error'); }
    try { historial = await produccionesRecientes(chips.get()); } catch (_e) { historial = []; }
    pintar();
  }

  function producir(p) {
    const rec = recetas.get(p.id);
    const inCant = h('input', { class: 'input num inp-big', id: 'p-cant', type: 'text', inputmode: 'decimal', value: fmtNum(rec.rinde, 3), 'aria-label': 'Cantidad producida' });
    const inNota = h('input', { class: 'input', id: 'p-nota', type: 'text', placeholder: 'Ej.: tanda de la mañana', 'aria-label': 'Nota', autocomplete: 'off' });
    const detalle = h('ul', { class: 'barras prod-ins' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Registrar producción' });
    const pintarIns = () => {
      const n = parseNum(inCant.value) || 0; const f = n / Number(rec.rinde);
      detalle.replaceChildren(...rec.receta_items.map(it => {
        const ins = G.prods.get(it.insumo_id) || { nombre: 'Insumo' }; const usa = Number(it.cantidad) * f; const hay = G.stock.get(p.local_id + '|' + it.insumo_id) || 0;
        return h('li', { class: 'bfila' }, h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: ins.nombre }), h('b', { class: 'num', text: `${fmtNum(usa, 3)} ${ins.unidad_uso || ''}`.trim() })),
          h('span', { class: 'bfila-d' + (hay < usa ? ' bfila-mal' : ''), text: `Quedan ${fmtNum(hay, 2) || 0}` + (hay < usa ? ' · no alcanza según el sistema' : '') }));
      }));
    };
    inCant.addEventListener('input', pintarIns);
    const { cerrar } = hoja(`Producir · ${p.nombre}`, h('div', { class: 'form' },
      campo(`Cantidad producida${p.unidad_uso ? ' (' + p.unidad_uso + ')' : ''}`, inCant), h('p', { class: 'grupo-t', text: 'Se descuenta' }), detalle, campo('Nota (opcional)', inNota), btn));
    pintarIns(); setTimeout(() => inCant.select(), 50);
    btn.addEventListener('click', async () => {
      const n = parseNum(inCant.value);
      if (n === null || n <= 0) return toast('Poné una cantidad mayor a cero.', 'error');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await registrarProduccion(p.local_id, p.id, n, inNota.value.trim());
        const f = n / Number(rec.rinde);
        G.stock.set(p.local_id + '|' + p.id, quedan(p) + n);
        rec.receta_items.forEach(it => G.stock.set(p.local_id + '|' + it.insumo_id, (G.stock.get(p.local_id + '|' + it.insumo_id) || 0) - Number(it.cantidad) * f));
        historial = [{ id: 'nuevo-' + Date.now(), producto_id: p.id, cantidad: n, nota: inNota.value.trim() || null, creado_en: new Date().toISOString() }, ...historial].slice(0, 12);
        toast(`Producción registrada: ${fmtNum(n, 3)} ${p.unidad_uso || ''}`.trim(), 'ok'); cerrar(); pintar();
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Registrar producción'; }
    });
  }

  function pintar() {
    if (!ctx.alive()) return;
    const vis = [...G.prods.values()].filter(p => p.local_id === chips.get() && p.es_elaborado && !esCarta(p) && p.activo !== false && recetas.has(p.id)).sort((a, b) => porTexto(a.nombre, b.nombre));
    mount(zona,
      h('div', { class: 'lista' }, ...(vis.length ? vis.map(p => h('article', { class: 'prod prod-stk', 'data-id': p.id },
        h('h3', { class: 'prod-n', text: p.nombre }),
        h('p', { class: 'prod-m' }, h('span', { class: 'quedan' }, 'Quedan ', h('b', { class: 'num', text: `${fmtNum(quedan(p), 2) || 0}${p.unidad_uso ? ' ' + p.unidad_uso : ''}` }))),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Producir', 'aria-label': `Producir ${p.nombre}`, on: { click: () => producir(p) } }))) : [vacio('No hay elaborados con receta', 'Marcá un producto como elaborado en Catálogo y cargale la receta en Recetas.')])),
      historial.length ? h('section', { class: 'bloque' }, h('h2', { class: 'bloque-t', text: 'Últimas producciones' }),
        h('ul', { class: 'barras' }, historial.map(x => { const p = G.prods.get(x.producto_id) || { nombre: 'Producto' };
          return h('li', { class: 'bfila' }, h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: p.nombre }), h('b', { class: 'num', text: `${fmtNum(x.cantidad, 3)} ${p.unidad_uso || ''}`.trim() })),
            h('span', { class: 'bfila-d', text: fechaCorta(x.creado_en) + (x.nota ? ' · ' + x.nota : '') })); }))) : null);
  }

  mount(root, cab, subnav(SUBNAV_COCINA, 'produccion'), h('div', { class: 'toolbar' }, chips.el), zona);
  await cargarLocal();
}
