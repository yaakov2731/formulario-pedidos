// Locales: activo, día de pedido, hora de corte y encargados.
import { h, icon, largeTitle, cell, skeleton, banner, btn, badge, sheet, input, select, field, switchEl, toast, haptic, chip, fill } from '../ui.js';
import { plural, ordenarTexto, texto, DIAS } from '../util.js';
import { postAdmin, manejarError, localesDe } from '../gerencia.js';

export default async function locales(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Locales', sub: 'Quién pide, qué día y hasta qué hora', topbar: ctx.topbar }));
  const lista = h('div');
  root.append(lista);
  let cargado = false;

  function pintar() {
    fill(lista);
    if (!cargado) { lista.append(skeleton(6)); return; }
    const todos = localesDe(ctx, { soloActivos: false }).slice().sort((a, b) => ordenarTexto(a.local, b.local));
    const activos = todos.filter(l => !(l.activo === false || l.activo === 'NO'));
    const inactivos = todos.filter(l => l.activo === false || l.activo === 'NO');
    const fila = l => cell({ title: l.local, sub: `${(l.encargados || []).length ? (l.encargados || []).join(', ') : 'Sin encargados cargados'} · ${l.dia_pedido || 'Sin día'} ${l.hora_corte ? 'hasta ' + l.hora_corte : ''}`, lead: 'store', leadKind: l.activo === false || l.activo === 'NO' ? 'plain' : '', right: l.prefijo ? badge(l.prefijo, 'plain') : null, chevron: true, onClick: () => editar(l) });
    lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: `${activos.length} ${plural(activos.length, 'local activo', 'locales activos')}` }), h('div', { class: 'list' }, ...activos.map(fila))));
    if (inactivos.length) lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Inactivos' }), h('div', { class: 'list' }, ...inactivos.map(fila))));
  }

  function editar(l) {
    let activo = !(l.activo === false || l.activo === 'NO');
    const encargados = [...(l.encargados || [])];
    const dia = select(DIAS, l.dia_pedido || 'Lunes');
    const hora = input({ type: 'time', value: l.hora_corte || '14:00' });
    const nuevoEnc = input({ placeholder: 'Agregar encargado', autocapitalize: 'words', maxlength: 60 });
    const chipsEnc = h('div', { class: 'names mt8' });
    const pintarEnc = () => { fill(chipsEnc, ...encargados.map((n, i) => chip(n, { icon: 'x', onClick: () => { encargados.splice(i, 1); pintarEnc(); } }))); };
    pintarEnc();
    const agregar = () => { const n = texto(nuevoEnc.value, 60); if (!n) return; if (!encargados.includes(n)) encargados.push(n); nuevoEnc.value = ''; pintarEnc(); };
    nuevoEnc.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const ok = btn('Guardar', { kind: 'primary', onClick: async () => {
      agregar();
      ok.disabled = true; err.textContent = '';
      try {
        await postAdmin(ctx, { action: 'saveLocal', local: l.local, activo: activo ? 'SÍ' : 'NO', encargados, dia_pedido: dia.value, hora_corte: hora.value });
        toast('Guardado', 'ok'); haptic('success'); s.close(); cargar(true);
      } catch (e) { if (!manejarError(ctx, e)) { err.textContent = e.message; ok.disabled = false; } }
    } });
    const s = sheet({ title: l.local, body: [
      h('div', { class: 'list' }, h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: 'Activo' }), h('div', { class: 'cell-sub small', text: 'Inactivo: no aparece al entrar ni en Compras.' })), switchEl(activo, v => { activo = v; }, 'Activo'))),
      h('div', { class: 'field-row mt12' }, field('Día de pedido', dia), field('Hora de corte', hora)),
      h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Encargados' }), h('div', { class: 'row' }, nuevoEnc, btn('Agregar', { size: 'sm', kind: 'tinted', onClick: agregar })), chipsEnc, h('p', { class: 'note mt8', text: 'Aparecen como sugerencia al entrar. Tocá uno para quitarlo.' })),
      l.prefijo ? h('p', { class: 'note', text: `Prefijo de códigos: ${l.prefijo}` }) : null,
      err
    ], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
  }

  let aviso = null;
  function cargar(force) {
    const b = ctx.bootstrap({ force });
    if (b.data) { cargado = true; pintar(); } else { cargado = false; pintar(); }
    if (force) refresh.classList.add('is-busy');
    b.fresh.then(() => { cargado = true; pintar(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { cargado = true; pintar(); if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  cargar(false);
  return root;
}
