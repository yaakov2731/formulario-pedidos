// Datos pendientes: qué le falta al catálogo y a los proveedores para que la app calcule sola (precio, proveedor, conteo).
import { h, icon, largeTitle, buscador, chip, empty, skeleton, banner, btn, sheet, input, field, toast, haptic, fill } from '../ui.js';
import { norm, plural, ordenarTexto, parseNum, inputNum, fmtMoney, FALTAS, faltasProducto, resumenDatos } from '../util.js';
import { selectLocal, selectProveedor, tabla, postAdmin, manejarError, proveedoresDe } from '../gerencia.js';
import * as api from '../api.js';

export const wide = true;

export default async function datos(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  const hdr = largeTitle({ title: 'Datos pendientes', sub: 'Lo que falta cargar para que la app calcule sola', topbar: ctx.topbar });
  root.append(hdr);
  await ctx.bootstrap().fresh.catch(() => {});
  const filtro = { local: '', falta: 'precio', q: '' };
  const sel = selectLocal(ctx, '', { todos: 'Todos los locales', onChange: (v) => { filtro.local = v; pintar(); } });
  const search = buscador({ placeholder: 'Buscar producto o proveedor', onInput: (v) => { filtro.q = v; pintar(); } });
  const resumen = h('div', { class: 'datos-resumen' });
  const provs = h('div');
  const chips = h('div', { class: 'chips' });
  const lista = h('div', { class: 'mt12' });
  root.append(resumen, provs, h('div', { class: 'toolbar mt16' }, sel, search), chips, lista);
  let productos = null;
  let elegido = false;

  const activos = () => (productos || []).filter(p => (p.estado || 'Activo') === 'Activo' && (!filtro.local || p.local === filtro.local));

  function pintarResumen() {
    fill(resumen);
    if (!productos) return;
    const barra = (pct) => h('div', { class: 'datos-bar', role: 'img', 'aria-label': `${pct} %` }, h('span', { style: `width:${pct}%` }));
    for (const r of resumenDatos(productos).sort((a, b) => ordenarTexto(a.local, b.local))) {
      resumen.append(h('div', { class: 'datos-card' },
        h('div', { class: 'datos-local' }, h('strong', { text: r.local }), h('span', { class: 'note', text: `${r.total} ${plural(r.total, 'producto', 'productos')}` })),
        ...Object.keys(FALTAS).map(k => h('div', { class: 'datos-fila' }, h('span', { class: 'datos-k', text: k === 'conteo' ? 'Contados' : k === 'precio' ? 'Con precio' : 'Con proveedor' }), barra(r.pct[k]), h('span', { class: 'datos-pct num', text: `${r.pct[k]} %` })))));
    }
  }

  function pintarProveedores() {
    fill(provs);
    const ps = proveedoresDe(ctx);
    const sinWa = ps.filter(p => !p.whatsapp).map(p => p.proveedor);
    const sinDias = ps.filter(p => !p.dias_entrega).map(p => p.proveedor);
    if (!sinWa.length && !sinDias.length) return;
    const partes = [];
    if (sinWa.length) partes.push(`${sinWa.length} sin WhatsApp`);
    if (sinDias.length) partes.push(`${sinDias.length} sin días de entrega`);
    provs.append(banner(`Proveedores: ${partes.join(' y ')}.`, 'warn', { icon: 'people', action: btn('Completar', { kind: 'tinted', size: 'sm', onClick: () => ctx.go('proveedores') }) }));
  }

  function pintarChips() {
    fill(chips);
    const base = activos();
    if (!elegido && productos && productos.length) {
      elegido = true;
      const k = ['precio', 'proveedor', 'conteo'].find(x => base.some(p => faltasProducto(p).includes(x)));
      if (k) filtro.falta = k;
    }
    for (const k of Object.keys(FALTAS)) {
      const n = base.filter(p => faltasProducto(p).includes(k)).length;
      chips.append(chip(`${FALTAS[k]} (${n})`, { on: filtro.falta === k, onClick: () => { filtro.falta = k; pintar(); } }));
    }
  }

  function pintar() {
    pintarChips(); fill(lista);
    if (!productos) { lista.append(skeleton(6)); return; }
    const q = norm(filtro.q);
    const vis = activos().filter(p => faltasProducto(p).includes(filtro.falta) && (!q || norm(p.producto).includes(q) || norm(p.proveedor).includes(q)))
      .sort((a, b) => ordenarTexto(a.local, b.local) || ordenarTexto(a.proveedor, b.proveedor) || ordenarTexto(a.producto, b.producto));
    if (!vis.length) { lista.append(empty({ icon: 'check', title: 'Nada pendiente acá', text: 'Probá con otro filtro o local.' })); return; }
    if (filtro.falta === 'conteo') lista.append(banner('Los conteos los hacen los encargados desde Contar. Esta lista sirve para saber qué falta contar en cada local.', 'plain', { icon: 'info' }));
    lista.append(tabla({
      columns: [
        { key: 'producto', label: 'Producto', render: p => h('div', null, h('div', { text: p.producto }), h('div', { class: 'note', text: `${p.categoria || ''} · ${p.unidad}` })) },
        { key: 'local', label: 'Local' },
        { key: 'proveedor', label: 'Proveedor', render: p => p.proveedor || h('span', { class: 'muted', text: 'Sin proveedor' }) },
        { key: 'precio', label: 'Precio', num: true, render: p => p.precio === null || p.precio === undefined || p.precio === '' ? '—' : fmtMoney(p.precio) }
      ],
      rows: vis, onRow: filtro.falta === 'conteo' ? null : p => editar(p)
    }));
    lista.append(h('p', { class: 'note mt8', text: `${vis.length} ${plural(vis.length, 'producto', 'productos')}${filtro.falta === 'conteo' ? '' : '. Tocá una fila para completarla.'}` }));
  }

  function editar(p) {
    const precio = input({ value: inputNum(p.precio), inputmode: 'decimal', class: 'input input-num', placeholder: '0' });
    const prov = selectProveedor(ctx, p.proveedor || '', { vacio: 'Sin proveedor' });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const ok = btn('Guardar', { kind: 'primary', onClick: async () => {
      const pr = precio.value.trim() === '' ? '' : parseNum(precio.value);
      if (pr === null) { err.textContent = 'El precio tiene que ser un número.'; precio.focus(); return; }
      ok.disabled = true; err.textContent = '';
      try {
        await postAdmin(ctx, { action: 'saveProducto', local: p.local, codigo: p.codigo, precio: pr, proveedor: prov.value });
        p.precio = pr === '' ? null : pr; p.proveedor = prov.value;
        toast('Guardado', 'ok'); haptic('success'); s.close();
        api.invalidar('getCatalogo'); api.invalidar('getStockPanel');
        pintarResumen(); pintar();
      } catch (e) { if (!manejarError(ctx, e)) { err.textContent = e.message; ok.disabled = false; } }
    } });
    const s = sheet({ title: p.producto, body: [
      h('p', { class: 'note', text: `${p.local} · ${p.unidad} · ${p.codigo}` }),
      h('div', { class: 'field-row mt12' }, field(`Precio por ${p.unidad}`, precio), field('Proveedor', prov)),
      err
    ], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
    setTimeout(() => (filtro.falta === 'proveedor' ? prov : precio).focus(), 350);
  }

  let aviso = null;
  function cargar(force) {
    if (force) refresh.classList.add('is-busy');
    const c = api.cached('getCatalogo', {}, { maxAge: force ? 0 : 45000 });
    if (c.data) { productos = c.data.productos || []; pintarResumen(); pintar(); } else { productos = null; pintar(); }
    c.fresh.then(d => { productos = d.productos || []; pintarResumen(); pintar(); hdr.stampNow(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!productos) { productos = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, resumen); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  pintarProveedores();
  cargar(false);
  return root;
}
