// Catálogo: productos por local. Alta, edición, baja lógica y carga masiva desde Excel.
import { h, icon, largeTitle, buscador, chip, empty, skeleton, banner, btn, badge, sheet, input, select, field, switchEl, toast, haptic, fill } from '../ui.js';
import { fmtNum, fmtMoney, norm, plural, ordenarTexto, UNIDADES, texto, parseNum, inputNum, store } from '../util.js';
import { selectLocal, selectProveedor, tabla, postAdmin, manejarError, pegarDesdeExcel, localesDe } from '../gerencia.js';
import * as api from '../api.js';

export const wide = true;

export default async function catalogo(ctx) {
  const root = h('div');
  await ctx.bootstrap().fresh.catch(() => {});
  const locales = localesDe(ctx);
  const filtro = { local: store.get('cat_local', '') || (locales[0] ? locales[0].local : ''), estado: 'Activo', q: '' };
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Catálogo', sub: 'Qué puede pedir cada local', topbar: ctx.topbar, actions: [btn('Pegar desde Excel', { size: 'sm', icon: 'copy', onClick: pegar }), btn('Nuevo', { kind: 'primary', size: 'sm', icon: 'plus', onClick: () => editar(null) })] }));
  const sel = selectLocal(ctx, filtro.local, { onChange: (v) => { filtro.local = v; store.set('cat_local', v); cargar(true); } });
  const search = buscador({ placeholder: 'Buscar producto, código o proveedor', onInput: (v) => { filtro.q = v; pintar(); } });
  const chips = h('div', { class: 'chips' });
  const lista = h('div', { class: 'mt12' });
  root.append(h('div', { class: 'toolbar' }, sel, search), chips, lista);
  let productos = null;

  function pintarChips() {
    fill(chips);
    for (const [v, l] of [['Activo', 'Activos'], ['Inactivo', 'Inactivos'], ['', 'Todos']]) chips.append(chip(l, { on: filtro.estado === v, onClick: () => { filtro.estado = v; pintarChips(); pintar(); } }));
  }
  function pintar() {
    fill(lista);
    if (!locales.length) { lista.append(banner('No hay locales activos. Activalos en Locales.', 'warn', { icon: 'alert' })); return; }
    if (!productos) { lista.append(skeleton(6)); return; }
    const q = norm(filtro.q);
    const vis = productos.filter(p => (!filtro.estado || (p.estado || 'Activo') === filtro.estado) && (!q || norm(p.producto).includes(q) || norm(p.codigo).includes(q) || norm(p.proveedor).includes(q) || norm(p.categoria).includes(q)))
      .sort((a, b) => ordenarTexto(a.categoria, b.categoria) || ordenarTexto(a.producto, b.producto));
    if (!vis.length) { lista.append(empty({ icon: 'book', title: productos.length ? 'Nada con ese filtro' : `${filtro.local} no tiene productos`, text: productos.length ? '' : 'Cargalos uno por uno o pegá la lista desde Excel.', action: productos.length ? null : btn('Pegar desde Excel', { kind: 'tinted', icon: 'copy', onClick: pegar }) })); return; }
    lista.append(tabla({
      columns: [
        { key: 'codigo', label: 'Código' },
        { key: 'producto', label: 'Producto', render: p => h('div', null, h('div', { text: p.producto }), h('div', { class: 'note', text: p.categoria || '' })) },
        { key: 'unidad', label: 'Unidad' },
        { key: 'proveedor', label: 'Proveedor', render: p => p.proveedor || h('span', { class: 'muted', text: 'Sin proveedor' }) },
        { key: 'precio', label: 'Precio', num: true, render: p => fmtMoney(p.precio) },
        { key: 'par', label: 'Par', num: true, render: p => fmtNum(p.par) },
        { key: 'stock_actual', label: 'Stock', num: true, render: p => fmtNum(p.stock_actual) },
        { key: 'estado', label: 'Estado', render: p => badge(p.estado || 'Activo', (p.estado || 'Activo') === 'Activo' ? 'ok' : 'plain') }
      ],
      rows: vis, onRow: p => editar(p)
    }));
    lista.append(h('p', { class: 'note mt8', text: `${vis.length} ${plural(vis.length, 'producto', 'productos')}. Tocá una fila para editar.` }));
  }

  function editar(p) {
    const nuevo = !p;
    const f = {
      producto: input({ value: p ? p.producto : '', placeholder: 'Ej.: Tomate perita', maxlength: 80, autocapitalize: 'sentences' }),
      categoria: input({ value: p ? p.categoria || '' : '', placeholder: 'Ej.: Verduras', maxlength: 40, list: 'cat-list' }),
      unidad: select(UNIDADES, p ? p.unidad : 'kg'),
      proveedor: selectProveedor(ctx, p ? p.proveedor || '' : '', { vacio: 'Sin proveedor' }),
      precio: input({ value: p ? inputNum(p.precio) : '', inputmode: 'decimal', class: 'input input-num', placeholder: '0' }),
      par: input({ value: p ? inputNum(p.par) : '', inputmode: 'decimal', class: 'input input-num', placeholder: '0' })
    };
    const cats = [...new Set((productos || []).map(x => x.categoria).filter(Boolean))];
    const dl = h('datalist', { id: 'cat-list' }, ...cats.map(c => h('option', { value: c })));
    let activo = !p || (p.estado || 'Activo') === 'Activo';
    const err = h('p', { class: 'field-error', role: 'alert' });
    const ok = btn(nuevo ? 'Crear producto' : 'Guardar', { kind: 'primary', onClick: async () => {
      const nombre = texto(f.producto.value, 80);
      if (!nombre) { err.textContent = 'Escribí el nombre.'; f.producto.focus(); return; }
      const precio = f.precio.value.trim() === '' ? '' : parseNum(f.precio.value);
      const par = f.par.value.trim() === '' ? '' : parseNum(f.par.value);
      if (precio === null || par === null) { err.textContent = 'Precio y par tienen que ser números.'; return; }
      ok.disabled = true; err.textContent = '';
      try {
        await postAdmin(ctx, { action: 'saveProducto', local: filtro.local, codigo: p ? p.codigo : undefined, producto: nombre, categoria: texto(f.categoria.value, 40), unidad: f.unidad.value, proveedor: f.proveedor.value, precio, par, estado: activo ? 'Activo' : 'Inactivo' });
        toast(nuevo ? `${nombre} creado` : 'Guardado', 'ok'); haptic('success'); s.close();
        api.invalidar('getCatalogo'); api.invalidar('getStockPanel'); cargar(true);
      } catch (e) { if (!manejarError(ctx, e)) { err.textContent = e.message; ok.disabled = false; } }
    } });
    const s = sheet({ title: nuevo ? `Nuevo producto en ${filtro.local}` : p.producto, body: [
      dl,
      field('Producto', f.producto),
      h('div', { class: 'field-row mt12' }, field('Categoría', f.categoria), field('Unidad', f.unidad)),
      h('div', { class: 'mt12' }, field('Proveedor', f.proveedor)),
      h('div', { class: 'field-row mt12' }, field('Precio de referencia', f.precio), field('Par (stock ideal)', f.par)),
      nuevo ? null : h('div', { class: 'list mt12' }, h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: 'Activo' }), h('div', { class: 'cell-sub small', text: 'Inactivo: no aparece para pedir ni contar.' })), switchEl(activo, v => { activo = v; }, 'Activo'))),
      p && p.codigo ? h('p', { class: 'note mt8', text: `Código ${p.codigo}` }) : null,
      err
    ], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
    setTimeout(() => f.producto.focus(), 350);
  }

  function pegar() {
    const localSel = selectLocal(ctx, filtro.local);
    pegarDesdeExcel({
      title: 'Pegar productos desde Excel',
      extraTop: field('Local', localSel),
      columnas: [
        { key: 'producto', label: 'Producto', req: true },
        { key: 'categoria', label: 'Categoría', alias: ['categoria', 'rubro'] },
        { key: 'unidad', label: 'Unidad', req: true },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'precio', label: 'Precio', num: true, alias: ['precio ref', 'precio de referencia'] },
        { key: 'par', label: 'Par', num: true, alias: ['stock ideal', 'minimo', 'mínimo'] }
      ],
      ayuda: 'Columnas en este orden: Producto, Categoría, Unidad, Proveedor, Precio, Par. Si el producto ya existe (mismo nombre y unidad) se actualiza.',
      onEnviar: async (filas) => {
        const r = await postAdmin(ctx, { action: 'saveProductosLote', local: localSel.value, filas: filas.map(f => ({ producto: f.producto, categoria: f.categoria, unidad: f.unidad, proveedor: f.proveedor, precio: f.precio === null ? '' : f.precio, par: f.par === null ? '' : f.par })) });
        api.invalidar('getCatalogo'); api.invalidar('getStockPanel');
        if (localSel.value === filtro.local) cargar(true);
        return h('div', null, banner(`${r.creados} ${plural(r.creados, 'creado', 'creados')}, ${r.actualizados} ${plural(r.actualizados, 'actualizado', 'actualizados')}${r.errores.length ? `, ${r.errores.length} con error` : ''}.`, r.errores.length ? 'warn' : 'ok', { icon: r.errores.length ? 'alert' : 'check' }),
          r.errores.length ? h('ul', { class: 'note mt8' }, ...r.errores.map(e => h('li', { text: `Fila ${e.fila}: ${e.error}` }))) : null);
      }
    });
  }

  let aviso = null;
  function cargar(force) {
    if (!filtro.local) { productos = []; pintar(); return; }
    productos = null; pintar();
    if (force) refresh.classList.add('is-busy');
    api.get('getCatalogo', {}).then(d => {
      productos = (d.productos || []).filter(p => p.local === filtro.local); pintarChips(); pintar(); if (aviso) { aviso.remove(); aviso = null; }
    }).catch(e => { productos = []; pintar(); if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  pintarChips();
  cargar(false);
  return root;
}
