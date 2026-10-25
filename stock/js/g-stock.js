// Gerencia · Stock por local: "Quedan N" y conteo con registrar_conteo.
import { mount, h, norm, fmtNum, parseNum, groupBy, porTexto, lsGet, lsSet } from './util.js';
import { contarProducto, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo } from './ui.js';

export async function render(root, ctx) {
  let localId = lsGet('g:local');
  let q = '';
  const lista = h('div', { class: 'lista' });
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Stock' }), h('p', { class: 'sub', text: 'Lo que queda en cada local' }));
  mount(root, cab, esqueleto(5));

  const quedan = (p) => G.stock.get(p.local_id + '|' + p.id) || 0;

  function contar(p) {
    const inp = h('input', { class: 'input num inp-big', type: 'text', inputmode: 'decimal', value: fmtNum(quedan(p), 3) || '0', 'aria-label': 'Cantidad contada' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar conteo' });
    const { cerrar } = hoja(`Contar · ${p.nombre}`, h('div', { class: 'form' },
      h('p', { class: 'sub', text: `Ahora figura: ${fmtNum(quedan(p), 3) || 0} ${p.unidad_uso || ''}` }),
      campo(`Cantidad contada${p.unidad_uso ? ' (' + p.unidad_uso + ')' : ''}`, inp), btn));
    setTimeout(() => inp.select(), 50);
    btn.addEventListener('click', async () => {
      const n = parseNum(inp.value);
      if (n === null || n < 0) return toast('Poné una cantidad válida.', 'error');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const dif = await contarProducto(p.local_id, p.id, n);
        G.stock.set(p.local_id + '|' + p.id, n);
        toast(Number(dif) === 0 ? 'Sin diferencias.' : `Diferencia ${Number(dif) > 0 ? '+' : ''}${fmtNum(dif, 3)}`, 'ok');
        cerrar(); pintarLista();
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Guardar conteo'; }
    });
  }

  function pintarLista() {
    const t = norm(q).split(' ').filter(Boolean);
    const vis = [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && t.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)));
    if (!vis.length) { lista.replaceChildren(vacio('Sin productos', 'Cambiá el local o la búsqueda.')); return; }
    const g = groupBy(vis, p => p.categoria || 'Sin categoría');
    const out = [];
    for (const k of [...g.keys()].sort(porTexto)) {
      out.push(h('h2', { class: 'cat-t', text: k }));
      for (const p of g.get(k).sort((a, b) => porTexto(a.nombre, b.nombre))) {
        out.push(h('article', { class: 'prod prod-stk' },
          h('h3', { class: 'prod-n', text: p.nombre }),
          h('p', { class: 'prod-m' }, h('span', { class: 'prod-u', text: p.codigo }), h('span', { class: 'quedan' }, 'Quedan ', h('b', { class: 'num', text: `${fmtNum(quedan(p), 2) || 0}${p.unidad_uso ? ' ' + p.unidad_uso : ''}` }))),
          h('button', { class: 'btn btn-ghost', type: 'button', text: 'Contar', 'aria-label': `Contar ${p.nombre}`, on: { click: () => contar(p) } })));
      }
    }
    lista.replaceChildren(...out);
  }

  await cargarG(['prods', 'locales', 'stock'], () => { if (ctx.alive() && lista.isConnected) pintarLista(); });
  if (!ctx.alive()) return;
  const locales = G.locales.filter(l => l.activo);
  if (!locales.some(l => l.id === localId)) localId = (locales[0] || {}).id;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Local' }, locales.map(l => h('button', {
    class: 'chip' + (l.id === localId ? ' is-on' : ''), type: 'button', text: l.nombre, 'aria-pressed': l.id === localId ? 'true' : 'false',
    on: { click: () => { localId = l.id; lsSet('g:local', localId); chips.querySelectorAll('.chip').forEach(b => { const on = b.textContent === l.nombre; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); pintarLista(); } }
  })));
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off', on: { input: (e) => { q = e.target.value; pintarLista(); } } });
  mount(root, cab, h('div', { class: 'toolbar' }, chips, buscador), lista);
  pintarLista();
}
