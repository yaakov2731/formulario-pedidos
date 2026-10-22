// Elaborados (gerencia): lista por local con el último conteo, alta y edición.
import { h, icon, largeTitle, buscador, cell, empty, skeleton, banner, btn, badge, sheet, input, select, field, switchEl, toast, haptic, fill } from '../ui.js';
import { fmtNum, fechaRelativa, norm, plural, ordenarTexto, UNIDADES, texto, store } from '../util.js';
import { selectLocal, postAdmin, manejarError, localesDe } from '../gerencia.js';
import * as api from '../api.js';

export default async function elaboradosAdmin(ctx) {
  const root = h('div');
  await ctx.bootstrap().fresh.catch(() => {});
  const locales = localesDe(ctx);
  const filtro = { local: store.get('elab_local', '') , q: '' };
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Elaborados', sub: 'Lo que produce cada local y cuánto queda', topbar: ctx.topbar, actions: [btn('Nuevo', { kind: 'primary', size: 'sm', icon: 'plus', onClick: () => editar(null) })] }));
  const sel = selectLocal(ctx, filtro.local, { todos: 'Todos los locales', onChange: (v) => { filtro.local = v; store.set('elab_local', v); cargar(true); } });
  const search = buscador({ placeholder: 'Buscar elaborado', onInput: (v) => { filtro.q = v; pintar(); } });
  const lista = h('div');
  root.append(h('div', { class: 'toolbar' }, sel, search), lista);
  let productos = null;

  function pintar() {
    fill(lista);
    if (!productos) { lista.append(skeleton(5)); return; }
    const q = norm(filtro.q);
    const vis = productos.filter(p => !q || norm(p.producto).includes(q) || norm(p.local).includes(q)).sort((a, b) => ordenarTexto(a.local, b.local) || ordenarTexto(a.producto, b.producto));
    if (!vis.length) { lista.append(empty({ icon: 'flame', title: productos.length ? 'Nada con ese filtro' : 'Sin elaborados', text: productos.length ? '' : 'Cargá lo que produce cada local: bondiola, pollo deshuesado, salsas…', action: productos.length ? null : btn('Nuevo elaborado', { kind: 'tinted', icon: 'plus', onClick: () => editar(null) }) })); return; }
    const porLocal = new Map();
    for (const p of vis) { if (!porLocal.has(p.local)) porLocal.set(p.local, []); porLocal.get(p.local).push(p); }
    for (const [loc, ps] of porLocal) {
      lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: loc }), h('div', { class: 'list' }, ...ps.map(p => cell({
        title: `${p.producto} · ${p.unidad}`, sub: p.total === null || p.total === undefined ? 'Nunca contado' : `Listo ${fmtNum(p.listo)} · Marcado ${fmtNum(p.marcado)} · Crudo ${fmtNum(p.crudo)} · ${fechaRelativa(p.ultimo_conteo)}${p.dias_sin_contar >= 7 ? ` (${p.dias_sin_contar} días)` : ''}`,
        lead: 'flame', leadKind: p.activo === false || p.activo === 'NO' ? 'plain' : 'warn', right: h('div', { class: 'cell-stack' }, p.total !== null && p.total !== undefined ? h('span', { class: 'strong num', text: fmtNum(p.total, p.unidad) }) : null, p.activo === false || p.activo === 'NO' ? badge('Inactivo', 'plain') : null), chevron: true, onClick: () => editar(p)
      })))));
    }
  }

  function editar(p) {
    const nuevo = !p;
    const loc = nuevo ? selectLocal(ctx, filtro.local || (locales[0] ? locales[0].local : '')) : null;
    const f = {
      producto: input({ value: p ? p.producto : '', placeholder: 'Ej.: Bondiola', maxlength: 80, autocapitalize: 'sentences' }),
      categoria: input({ value: p ? p.categoria || '' : '', placeholder: 'Ej.: Parrilla', maxlength: 40 }),
      unidad: select(UNIDADES, p ? p.unidad : 'unidad'),
      obs: input({ value: p ? p.observaciones || '' : '', placeholder: 'Observaciones', maxlength: 200 })
    };
    let activo = !p || !(p.activo === false || p.activo === 'NO');
    const err = h('p', { class: 'field-error', role: 'alert' });
    const ok = btn(nuevo ? 'Crear' : 'Guardar', { kind: 'primary', onClick: async () => {
      const nombre = texto(f.producto.value, 80);
      if (!nombre) { err.textContent = 'Escribí el nombre.'; f.producto.focus(); return; }
      ok.disabled = true; err.textContent = '';
      try {
        await postAdmin(ctx, { action: 'saveElaborado', local: nuevo ? loc.value : p.local, codigo: p ? p.codigo : undefined, producto: nombre, categoria: texto(f.categoria.value, 40), unidad: f.unidad.value, activo: activo ? 'SÍ' : 'NO', observaciones: texto(f.obs.value, 200) });
        toast(nuevo ? `${nombre} creado` : 'Guardado', 'ok'); haptic('success'); s.close(); api.invalidar('getElaborados'); cargar(true);
      } catch (e) { if (!manejarError(ctx, e)) { err.textContent = e.message; ok.disabled = false; } }
    } });
    const s = sheet({ title: nuevo ? 'Nuevo elaborado' : p.producto, body: [
      nuevo ? field('Local', loc) : null,
      h('div', { class: 'mt12' }, field('Producto', f.producto)),
      h('div', { class: 'field-row mt12' }, field('Categoría', f.categoria), field('Unidad', f.unidad)),
      h('div', { class: 'mt12' }, field('Observaciones', f.obs)),
      nuevo ? null : h('div', { class: 'list mt12' }, h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: 'Activo' }), h('div', { class: 'cell-sub small', text: 'Inactivo: el local no lo ve para contar.' })), switchEl(activo, v => { activo = v; }, 'Activo'))),
      p && p.codigo ? h('p', { class: 'note mt8', text: `Código ${p.codigo} · ${p.local}` }) : null,
      err
    ], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
    setTimeout(() => f.producto.focus(), 350);
  }

  let aviso = null;
  function cargar(force) {
    const params = filtro.local ? { local: filtro.local } : {};
    const c = api.cached('getElaborados', params, { maxAge: force ? 0 : 45000 });
    if (c.data) { productos = c.data.productos || []; pintar(); } else { productos = null; pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { productos = d.productos || []; pintar(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!productos) { productos = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  cargar(false);
  return root;
}
