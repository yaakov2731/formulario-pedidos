// Gerencia · Catálogo: búsqueda, alta y edición de productos y costo actual.
import { mount, h, norm, fmtMoney, parseNum, porTexto, debounce } from './util.js';
import { guardarProducto, guardarPrecio, mensajeError } from './api.js';
import { G, cargarG, refrescarPrecio } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, icon } from './ui.js';

export async function render(root, ctx) {
  let q = '', localF = 'todos';
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Catálogo' }), h('p', { class: 'sub', text: 'Productos, proveedores y costos' }));
  mount(root, cab, esqueleto(5));
  const lista = h('div', { class: 'lista' });

  function editar(p) {
    const nuevo = !p;
    const d = p || { codigo: '', nombre: '', local_id: localF !== 'todos' ? localF : (G.locales[0] || {}).id, categoria: '', unidad_compra: '', unidad_uso: '', factor_conversion: 1, proveedor_id: '', par: null, activo: true };
    const sel = (opts, val, id) => { const s = h('select', { class: 'input', id }, opts.map(([v, t]) => h('option', { value: v, text: t }))); s.value = val || ''; return s; };
    const f = {
      codigo: h('input', { class: 'input num', id: 'f-codigo', value: d.codigo, autocomplete: 'off' }),
      nombre: h('input', { class: 'input', id: 'f-nombre', value: d.nombre, autocomplete: 'off' }),
      local: sel(G.locales.map(l => [l.id, l.nombre]), d.local_id, 'f-local'),
      categoria: h('input', { class: 'input', id: 'f-cat', value: d.categoria || '', list: 'dl-cat', autocomplete: 'off' }),
      uc: h('input', { class: 'input', id: 'f-uc', value: d.unidad_compra || '', placeholder: 'kg, caja, bolsa…' }),
      uu: h('input', { class: 'input', id: 'f-uu', value: d.unidad_uso || '', placeholder: 'kg, unidad…' }),
      factor: h('input', { class: 'input num', id: 'f-factor', inputmode: 'decimal', value: String(d.factor_conversion ?? 1).replace('.', ',') }),
      prov: sel([['', 'Sin proveedor'], ...[...G.provs.values()].sort((a, b) => porTexto(a.nombre, b.nombre)).map(x => [x.id, x.nombre])], d.proveedor_id, 'f-prov'),
      ideal: h('input', { class: 'input num', id: 'f-ideal', inputmode: 'decimal', value: d.par === null || d.par === undefined ? '' : String(d.par).replace('.', ','), placeholder: 'Sin definir' }),
      costo: h('input', { class: 'input num', id: 'f-costo', inputmode: 'decimal', value: p && G.precios.has(p.id) ? String(G.precios.get(p.id)).replace('.', ',') : '', placeholder: '0' }),
      activo: h('input', { type: 'checkbox', id: 'f-activo', checked: d.activo !== false })
    };
    if (nuevo) f.local.addEventListener('change', () => { const l = G.locales.find(x => x.id === f.local.value); if (l && (!f.codigo.value || /^[A-Z]{3}-?$/.test(f.codigo.value))) f.codigo.value = l.codigo + '-'; });
    if (nuevo && !f.codigo.value) { const l = G.locales.find(x => x.id === f.local.value); if (l) f.codigo.value = l.codigo + '-'; }
    const cats = [...new Set([...G.prods.values()].map(x => x.categoria).filter(Boolean))].sort(porTexto);
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: nuevo ? 'Crear producto' : 'Guardar cambios' });
    const form = h('div', { class: 'form' },
      h('datalist', { id: 'dl-cat' }, cats.map(c => h('option', { value: c }))),
      campo('Código', f.codigo), campo('Nombre', f.nombre), campo('Local', f.local), campo('Categoría', f.categoria),
      h('div', { class: 'dos' }, campo('Unidad de compra', f.uc), campo('Unidad de uso', f.uu)),
      campo('Factor de conversión', f.factor, 'Cuántas unidades de uso trae una de compra.'),
      campo('Proveedor', f.prov), campo('Cantidad ideal en el local', f.ideal, 'Sirve para sugerir el pedido.'),
      campo('Costo actual ($)', f.costo),
      h('label', { class: 'check' }, f.activo, h('span', { text: 'Activo' })), err, btn);
    const { cerrar } = hoja(nuevo ? 'Nuevo producto' : 'Editar producto', form);
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const factor = parseNum(f.factor.value);
      if (!f.codigo.value.trim() || !f.nombre.value.trim()) return err.textContent = 'Completá código y nombre.';
      if (factor === null || factor <= 0) return err.textContent = 'El factor tiene que ser mayor a cero.';
      const datos = {
        codigo: f.codigo.value.trim().toUpperCase(), nombre: f.nombre.value.trim(), local_id: f.local.value, categoria: f.categoria.value.trim() || null,
        unidad_compra: f.uc.value.trim() || null, unidad_uso: f.uu.value.trim() || null, factor_conversion: factor,
        proveedor_id: f.prov.value || null, par: parseNum(f.ideal.value), activo: f.activo.checked
      };
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const id = await guardarProducto(p ? p.id : null, datos);
        const costo = parseNum(f.costo.value);
        const previo = p && G.precios.has(p.id) ? G.precios.get(p.id) : null;
        if (costo !== null && costo !== previo) { await guardarPrecio(id, datos.proveedor_id, costo); refrescarPrecio(id, costo); }
        G.prods.set(id, { ...(p || {}), ...datos, id });
        toast(nuevo ? 'Producto creado' : 'Cambios guardados', 'ok');
        cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = nuevo ? 'Crear producto' : 'Guardar cambios'; }
    });
    setTimeout(() => (nuevo ? f.nombre : f.nombre).focus(), 60);
  }

  function pintar() {
    const t = norm(q).split(' ').filter(Boolean);
    const vis = [...G.prods.values()].filter(p => (localF === 'todos' || p.local_id === localF) && t.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)))
      .sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 150);
    if (!vis.length) { lista.replaceChildren(vacio('No hay productos', 'Probá con otra búsqueda o creá uno nuevo.')); return; }
    lista.replaceChildren(...vis.map(p => {
      const prov = G.provs.get(p.proveedor_id);
      return h('button', { class: 'prod prod-cat' + (p.activo === false ? ' is-off' : ''), type: 'button', on: { click: () => editar(p) }, 'aria-label': `Editar ${p.nombre}` },
        h('span', { class: 'prod-n', text: p.nombre }),
        h('span', { class: 'prod-m' }, h('span', { class: 'prod-u num', text: p.codigo }), h('span', { text: prov ? prov.nombre : 'Sin proveedor' })),
        h('span', { class: 'prod-m' }, h('span', { text: p.unidad_compra || '—' }), G.precios.has(p.id) ? h('b', { class: 'num', text: fmtMoney(G.precios.get(p.id)) }) : h('span', { class: 'mute', text: 'Sin costo' })));
    }));
  }

  await cargarG(['prods', 'provs', 'locales', 'precios'], () => { if (ctx.alive() && lista.isConnected) pintar(); });
  if (!ctx.alive()) return;
  const locSel = h('select', { class: 'input', 'aria-label': 'Local', on: { change: (e) => { localF = e.target.value; pintar(); } } },
    h('option', { value: 'todos', text: 'Todos los locales' }), G.locales.map(l => h('option', { value: l.id, text: l.nombre })));
  const buscar = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar por nombre o código', 'aria-label': 'Buscar producto', autocomplete: 'off', on: { input: debounce((e) => { q = e.target.value; pintar(); }, 120) } });
  mount(root, cab,
    h('div', { class: 'toolbar toolbar-row' }, buscar, locSel, h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => editar(null) } }, icon('mas', 18), h('span', { text: 'Nuevo producto' }))),
    lista);
  pintar();
}
