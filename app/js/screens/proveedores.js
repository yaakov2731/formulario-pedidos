// Proveedores: alta, edición y carga desde Excel.
import { h, icon, largeTitle, buscador, chip, cell, empty, skeleton, banner, btn, badge, sheet, input, field, switchEl, toast, haptic, fill } from '../ui.js';
import { norm, plural, ordenarTexto, texto, parseNum, inputNum, soloDigitos, fmtMoney } from '../util.js';
import { postAdmin, manejarError, pegarDesdeExcel, proveedoresDe } from '../gerencia.js';
import * as api from '../api.js';

export default async function proveedores(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Proveedores', sub: 'A quién se le compra y por dónde', topbar: ctx.topbar, actions: [btn('Pegar desde Excel', { size: 'sm', icon: 'copy', onClick: pegar }), btn('Nuevo', { kind: 'primary', size: 'sm', icon: 'plus', onClick: () => editar(null) })] }));
  const filtro = { q: '', activos: true };
  const search = buscador({ placeholder: 'Buscar proveedor', onInput: (v) => { filtro.q = v; pintar(); } });
  const chips = h('div', { class: 'chips' });
  const lista = h('div');
  root.append(h('div', { class: 'mt8' }, search), chips, lista);
  let cargado = false;

  function pintarChips() {
    fill(chips, chip('Activos', { on: filtro.activos, onClick: () => { filtro.activos = true; pintarChips(); pintar(); } }), chip('Todos', { on: !filtro.activos, onClick: () => { filtro.activos = false; pintarChips(); pintar(); } }));
  }
  function pintar() {
    fill(lista);
    if (!cargado) { lista.append(skeleton(5)); return; }
    const q = norm(filtro.q);
    const vis = proveedoresDe(ctx, { soloActivos: filtro.activos }).filter(p => !q || norm(p.proveedor).includes(q) || norm(p.contacto).includes(q)).sort((a, b) => ordenarTexto(a.proveedor, b.proveedor));
    if (!vis.length) { lista.append(empty({ icon: 'people', title: q ? 'Nada con ese nombre' : 'Sin proveedores', text: q ? '' : 'Cargalos uno por uno o pegá la lista desde Excel.', action: q ? null : btn('Pegar desde Excel', { kind: 'tinted', icon: 'copy', onClick: pegar }) })); return; }
    lista.append(h('section', { class: 'group' }, h('div', { class: 'list' }, ...vis.map(p => cell({
      title: p.proveedor, sub: [p.contacto, p.whatsapp ? `WhatsApp ${p.whatsapp}` : 'Sin WhatsApp', p.dias_entrega ? `Entrega: ${p.dias_entrega}` : '', p.pedido_minimo ? `Mínimo ${fmtMoney(p.pedido_minimo)}` : ''].filter(Boolean).join(' · '),
      lead: 'people', leadKind: p.activo === false || p.activo === 'NO' ? 'plain' : '', right: p.activo === false || p.activo === 'NO' ? badge('Inactivo', 'plain') : null, chevron: true, onClick: () => editar(p)
    })))));
  }

  function editar(p) {
    const nuevo = !p;
    const f = {
      proveedor: input({ value: p ? p.proveedor : '', placeholder: 'Nombre', maxlength: 80, autocapitalize: 'words', disabled: !nuevo }),
      contacto: input({ value: p ? p.contacto || '' : '', placeholder: 'Persona de contacto', maxlength: 80, autocapitalize: 'words' }),
      whatsapp: input({ value: p ? p.whatsapp || '' : '', placeholder: '549 11 1234 5678', inputmode: 'tel', type: 'tel' }),
      email: input({ value: p ? p.email || '' : '', placeholder: 'correo@proveedor.com', type: 'email', inputmode: 'email', autocapitalize: 'none' }),
      dias: input({ value: p ? p.dias_entrega || '' : '', placeholder: 'Ej.: martes y viernes', maxlength: 60 }),
      minimo: input({ value: p ? inputNum(p.pedido_minimo) : '', inputmode: 'decimal', class: 'input input-num', placeholder: '0' }),
      obs: h('textarea', { class: 'input', placeholder: 'Observaciones', maxlength: 300 })
    };
    f.obs.value = p ? p.observaciones || '' : '';
    let activo = !p || !(p.activo === false || p.activo === 'NO');
    const err = h('p', { class: 'field-error', role: 'alert' });
    const ok = btn(nuevo ? 'Crear proveedor' : 'Guardar', { kind: 'primary', onClick: async () => {
      const nombre = texto(f.proveedor.value, 80);
      if (!nombre) { err.textContent = 'Escribí el nombre.'; f.proveedor.focus(); return; }
      const minimo = f.minimo.value.trim() === '' ? '' : parseNum(f.minimo.value);
      if (minimo === null) { err.textContent = 'El pedido mínimo tiene que ser un número.'; return; }
      ok.disabled = true; err.textContent = '';
      try {
        await postAdmin(ctx, { action: 'saveProveedor', proveedor: nombre, contacto: texto(f.contacto.value, 80), whatsapp: soloDigitos(f.whatsapp.value), email: texto(f.email.value, 80), dias_entrega: texto(f.dias.value, 60), pedido_minimo: minimo, activo: activo ? 'SÍ' : 'NO', observaciones: texto(f.obs.value, 300) });
        toast(nuevo ? `${nombre} creado` : 'Guardado', 'ok'); haptic('success'); s.close(); cargar(true);
      } catch (e) { if (!manejarError(ctx, e)) { err.textContent = e.message; ok.disabled = false; } }
    } });
    const s = sheet({ title: nuevo ? 'Nuevo proveedor' : p.proveedor, body: [
      field('Proveedor', f.proveedor),
      h('div', { class: 'field-row mt12' }, field('Contacto', f.contacto), field('WhatsApp', f.whatsapp, { hint: 'Con código de país, sin + ni espacios' })),
      h('div', { class: 'mt12' }, field('Email', f.email)),
      h('div', { class: 'field-row mt12' }, field('Días de entrega', f.dias), field('Pedido mínimo', f.minimo)),
      h('div', { class: 'mt12' }, field('Observaciones', f.obs)),
      nuevo ? null : h('div', { class: 'list mt12' }, h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: 'Activo' })), switchEl(activo, v => { activo = v; }, 'Activo'))),
      err
    ], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
    setTimeout(() => (nuevo ? f.proveedor : f.contacto).focus(), 350);
  }

  function pegar() {
    pegarDesdeExcel({
      title: 'Pegar proveedores desde Excel',
      columnas: [
        { key: 'proveedor', label: 'Proveedor', req: true },
        { key: 'contacto', label: 'Contacto' },
        { key: 'whatsapp', label: 'WhatsApp', alias: ['telefono', 'teléfono', 'celular'] },
        { key: 'email', label: 'Email', alias: ['correo', 'mail'] },
        { key: 'dias_entrega', label: 'Días de entrega', alias: ['dias', 'entrega', 'dias_entrega'] },
        { key: 'pedido_minimo', label: 'Pedido mínimo', num: true, alias: ['minimo', 'mínimo', 'pedido_minimo'] }
      ],
      onEnviar: async (filas) => {
        let ok = 0; const errores = [];
        for (const [i, f] of filas.entries()) {
          try { await postAdmin(ctx, { action: 'saveProveedor', proveedor: f.proveedor, contacto: f.contacto, whatsapp: soloDigitos(f.whatsapp), email: f.email, dias_entrega: f.dias_entrega, pedido_minimo: f.pedido_minimo === null ? '' : f.pedido_minimo, activo: 'SÍ' }); ok++; }
          catch (e) { if (manejarError(ctx, e)) throw e; errores.push(`Fila ${i + 1}: ${e.message}`); }
        }
        cargar(true);
        return h('div', null, banner(`${ok} ${plural(ok, 'proveedor cargado', 'proveedores cargados')}${errores.length ? `, ${errores.length} con error` : ''}.`, errores.length ? 'warn' : 'ok', { icon: errores.length ? 'alert' : 'check' }), errores.length ? h('ul', { class: 'note mt8' }, ...errores.map(e => h('li', { text: e }))) : null);
      }
    });
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
  pintarChips();
  cargar(false);
  return root;
}
