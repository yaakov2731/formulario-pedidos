// Gerencia · Stock por local: métricas del local (valor, faltantes, consumo, producción disponible), "Quedan N" y conteo.
import { mount, h, norm, fmtNum, fmtMoney, parseNum, groupBy, porTexto, lsGet, lsSet, esCarta, fechaCorta } from './util.js';
import { contarProducto, movimientosLocal, ultimaVentaSubida, cargarRecetas, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo } from './ui.js';

export async function render(root, ctx) {
  let localId = lsGet('g:local');
  let q = '';
  const lista = h('div', { class: 'lista' });
  const resumen = h('div', { class: 'stk-resumen', 'aria-live': 'polite' });
  let recetas = null; let pedidoResumen = 0;
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
        cerrar(); pintarLista(); pintarResumen();
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Guardar conteo'; }
    });
  }

  function pintarLista() {
    const t = norm(q).split(' ').filter(Boolean);
    const vis = [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && !esCarta(p) && t.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)));
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

  // Métricas del local elegido. Consumo = ventas + insumos usados en producción + merma de los últimos 7 días.
  async function pintarResumen() {
    const n = ++pedidoResumen; const lid = localId;
    if (!lid) { resumen.replaceChildren(); return; }
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    let movs = [], ultima = null;
    try { [movs, ultima, recetas] = await Promise.all([movimientosLocal(lid, desde), ultimaVentaSubida(lid), recetas ? Promise.resolve(recetas) : cargarRecetas()]); }
    catch (e) { if (n === pedidoResumen) resumen.replaceChildren(h('p', { class: 'sub', text: 'No pude cargar las métricas: ' + mensajeError(e) })); return; }
    if (n !== pedidoResumen || !ctx.alive()) return;

    const prods = [...G.prods.values()].filter(p => p.local_id === lid && p.activo !== false && !esCarta(p));
    let valor = 0, sinPrecio = 0, conStock = 0, enCero = 0;
    for (const p of prods) {
      const q = quedan(p);
      if (q > 0) { conStock++; const pr = G.precios.get(p.id); if (pr) valor += q / Number(p.factor_conversion || 1) * pr; else sinPrecio++; }
      else enCero++;
    }
    const consumo = new Map(); let porVentas = 0;
    for (const m of movs) if (m.tipo !== 'produccion_alta') { consumo.set(m.producto_id, (consumo.get(m.producto_id) || 0) - Number(m.cantidad)); if (m.tipo === 'venta') porVentas++; }
    const top = [...consumo].map(([id, c]) => ({ p: G.prods.get(id), c })).filter(x => x.p && x.c > 0)
      .map(x => ({ ...x, dias: quedan(x.p) / (x.c / 7) })).sort((a, b) => a.dias - b.dias).slice(0, 8);

    const elab = (recetas || []).filter(r => r.receta_items.length).map(r => ({ r, p: G.prods.get(r.producto_id) })).filter(x => x.p && x.p.local_id === lid && x.p.activo !== false)
      .map(({ r, p }) => {
        const veces = Math.min(...r.receta_items.map(it => Math.max(0, G.stock.get(lid + '|' + it.insumo_id) || 0) / Number(it.cantidad)));
        const falta = r.receta_items.map(it => ({ it, v: Math.max(0, G.stock.get(lid + '|' + it.insumo_id) || 0) / Number(it.cantidad) })).sort((a, b) => a.v - b.v)[0];
        return { p, estimada: !!r.estimada, hechos: quedan(p), sePuede: Math.floor(veces * Number(r.rinde)), limita: falta && G.prods.get(falta.it.insumo_id) };
      }).sort((a, b) => porTexto(a.p.nombre, b.p.nombre));
    const elaborados = elab.filter(x => !esCarta(x.p));
    const platos = elab.filter(x => esCarta(x.p)).sort((a, b) => a.sePuede - b.sePuede || porTexto(a.p.nombre, b.p.nombre));

    const kpi = (t, v, nota, warn) => h('div', { class: 'kpi' + (warn ? ' kpi-warn' : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
    const u = (p) => p.unidad_uso ? ' ' + p.unidad_uso : '';
    resumen.replaceChildren(
      h('section', { class: 'kpis', 'data-metricas': '' },
        kpi('Valor del stock', fmtMoney(valor), sinPrecio ? `${sinPrecio} sin costo cargado` : 'a costo de compra'),
        kpi('Con stock', String(conStock), `de ${prods.length} productos`),
        kpi('En cero', String(enCero), 'sin unidades', enCero > 0),
        kpi('Última venta subida', ultima ? fechaCorta((ultima.fecha_desde || ultima.creado_en.slice(0, 10)) + 'T12:00:00').split(' · ')[0] : '—', ultima ? `${porVentas} descuentos en 7 días` : 'todavía no se subió', !ultima)),
      h('div', { class: 'tb-grid' },
        h('section', { class: 'bloque', 'data-bloque': 'consumo' }, h('h2', { class: 'bloque-t', text: 'Lo que más se usa (7 días)' }),
          top.length ? h('ul', { class: 'barras' }, top.map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre }), h('b', { class: 'num', text: `Quedan ${fmtNum(quedan(x.p), 2) || 0}${u(x.p)}` })),
            h('span', { class: 'bfila-d' + (x.dias < 2 ? ' bfila-mal' : ''), text: `Usó ${fmtNum(x.c, 2)}${u(x.p)} · ` + (x.dias < 0.5 ? 'no alcanza para hoy' : `alcanza para ${fmtNum(Math.floor(x.dias), 0)} ${Math.floor(x.dias) === 1 ? 'día' : 'días'}`) }))))
            : h('p', { class: 'sub', text: 'Todavía no hay ventas ni producción de esta semana. Al subir las ventas de Núcleo se descuentan solas del stock.' })),
        h('section', { class: 'bloque', 'data-bloque': 'produccion' }, h('h2', { class: 'bloque-t', text: 'Producción disponible' }),
          elaborados.length ? h('ul', { class: 'barras' }, elaborados.map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre }), h('b', { class: 'num', text: `Hechos ${fmtNum(x.hechos, 2) || 0}${u(x.p)}` })),
            h('span', { class: 'bfila-d' + (x.sePuede <= 0 ? ' bfila-mal' : ''), text: x.sePuede > 0 ? `Se pueden hacer ${fmtNum(x.sePuede, 0)}${u(x.p)} más${x.limita ? ' · limita ' + x.limita.nombre : ''}` : `No alcanza para hacer más${x.limita ? ': falta ' + x.limita.nombre : ''}` }))))
            : h('p', { class: 'sub', text: 'No hay elaborados con receta en este local (salsas, masas, postres de la casa). Se cargan en Catálogo y Cocina → Recetas.' })),
        h('section', { class: 'bloque', 'data-bloque': 'platos' }, h('h2', { class: 'bloque-t', text: 'Platos que se pueden servir' }),
          platos.length ? h('ul', { class: 'barras' }, platos.slice(0, 10).map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre + (x.estimada ? ' *' : '') }), h('b', { class: 'num', text: x.sePuede > 0 ? `${fmtNum(x.sePuede, 0)}` : 'Ninguno' })),
            h('span', { class: 'bfila-d' + (x.sePuede <= 2 ? ' bfila-mal' : ''), text: x.limita ? `Limita ${x.limita.nombre} (quedan ${fmtNum(Math.max(0, quedan(x.limita)), 2) || 0}${u(x.limita)})` : '' }))))
            : h('p', { class: 'sub', text: 'Cargá las recetas en Cocina → Recetas para ver cuántos platos alcanzan con el stock.' }),
          platos.some(x => x.estimada) ? h('p', { class: 'kpi-n', text: '* receta estimada: revisala en Cocina → Recetas' }) : null)));
  }

  await cargarG(['prods', 'locales', 'stock', 'precios'], () => { if (ctx.alive() && lista.isConnected) pintarLista(); });
  if (!ctx.alive()) return;
  const locales = G.locales.filter(l => l.activo);
  if (!locales.some(l => l.id === localId)) localId = (locales[0] || {}).id;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Local' }, locales.map(l => h('button', {
    class: 'chip' + (l.id === localId ? ' is-on' : ''), type: 'button', text: l.nombre, 'aria-pressed': l.id === localId ? 'true' : 'false',
    on: { click: () => { localId = l.id; lsSet('g:local', localId); chips.querySelectorAll('.chip').forEach(b => { const on = b.textContent === l.nombre; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); pintarLista(); pintarResumen(); } }
  })));
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off', on: { input: (e) => { q = e.target.value; pintarLista(); } } });
  mount(root, cab, h('div', { class: 'toolbar' }, chips), resumen, h('h2', { class: 'grupo-t stk-lista-t', text: 'Productos' }), h('div', { class: 'toolbar' }, buscador), lista);
  pintarLista(); pintarResumen();
}
