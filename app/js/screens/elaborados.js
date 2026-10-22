// Elaborados: qué queda de lo que produce el local (listo, marcado, crudo). Alta desde el celular.
import { h, icon, largeTitle, btn, sheet, empty, skeleton, banner, haptic, input, select, field, toast, fill } from '../ui.js';
import { fmtNum, nuevoId, plural, fechaRelativa, parseNum, inputNum, texto, UNIDADES, ordenarTexto } from '../util.js';
import { borrador, pill, pantallaFinal, errorEnvio, invalidarLecturasLocal, quienCarga } from '../flujo.js';
import { verOperacion } from '../detalles.js';
import * as api from '../api.js';

const ESTADOS = [['listo', 'Listo'], ['marcado', 'Marcado'], ['crudo', 'Crudo']];

export default async function elaborados(ctx) {
  const { S } = ctx;
  const local = S.sesion.local;
  const root = h('div');
  const draft = borrador('elab', local);
  const b = draft.leer({ items: {} });
  b.items = b.items || {};

  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  const agregar = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Agregar elaborado', onClick: alta }, icon('plus', 24));
  ctx.topbarSet({ right: [refresh, agregar] });
  root.append(largeTitle({ title: 'Elaborados', sub: `Qué queda en ${local}`, topbar: ctx.topbar }));
  const lista = h('div');
  root.append(lista);

  const p = pill({ label: 'Revisar', onClick: revisar });
  ctx.onLeave(() => p.remove());

  let productos = null;
  const tocados = () => Object.keys(b.items).filter(c => b.items[c] && ESTADOS.some(([k]) => b.items[c][k] !== null && b.items[c][k] !== undefined));
  function guardar() { draft.guardar(b); actualizarPill(); }
  function actualizarPill() { const n = tocados().length; p.set(`${n} ${plural(n, 'contado', 'contados')}`, productos ? `de ${productos.length}` : ''); p.show(n > 0); }

  function fila(pr) {
    const it = b.items[pr.codigo] || {};
    const inputs = {};
    const tri = h('div', { class: 'tri' }, ...ESTADOS.map(([k, label]) => {
      const inp = h('input', { type: 'text', inputmode: 'decimal', value: inputNum(it[k]), class: it[k] !== null && it[k] !== undefined ? 'is-on' : '', 'aria-label': `${label} de ${pr.producto} en ${pr.unidad}`, placeholder: pr[k] !== null && pr[k] !== undefined ? inputNum(pr[k]) : '—' });
      inp.addEventListener('input', () => { const v = parseNum(inp.value); setVal(k, v); inp.classList.toggle('is-on', v !== null); });
      inp.addEventListener('focus', () => { try { inp.select(); } catch (_e) { /* nada */ } });
      inputs[k] = inp;
      return h('label', null, h('span', { text: label }), inp);
    }));
    function setVal(k, v) {
      if (!b.items[pr.codigo]) b.items[pr.codigo] = {};
      if (v === null) delete b.items[pr.codigo][k]; else b.items[pr.codigo][k] = Math.max(0, v);
      if (!Object.keys(b.items[pr.codigo]).length) delete b.items[pr.codigo];
      guardar(); cero.classList.toggle('is-on', esCero());
    }
    const esCero = () => { const x = b.items[pr.codigo]; return !!x && ESTADOS.every(([k]) => x[k] === 0); };
    const cero = h('button', { class: `prod-zero${esCero() ? ' is-on' : ''}`, type: 'button', 'aria-label': `No queda nada de ${pr.producto}`, text: 'No queda nada' });
    cero.addEventListener('click', () => { haptic(); const v = esCero() ? null : 0; for (const [k] of ESTADOS) { setVal(k, v); inputs[k].value = inputNum(v); inputs[k].classList.toggle('is-on', v !== null); } });
    const ultimo = pr.total !== null && pr.total !== undefined ? `Último: ${fmtNum(pr.listo)} / ${fmtNum(pr.marcado)} / ${fmtNum(pr.crudo)} · ${fechaRelativa(pr.ultimo_conteo)}` : 'Nunca contado';
    return h('div', { class: 'prod block' },
      h('div', { class: 'prod-head' }, h('div', { class: 'prod-body' }, h('div', { class: 'prod-name', text: `${pr.producto} · ${pr.unidad}` }), h('div', { class: 'prod-meta' }, h('span', { class: 'num', text: ultimo }))), cero),
      tri);
  }

  function pintar() {
    fill(lista);
    if (!productos) { lista.append(skeleton(4)); return; }
    if (!productos.length) { lista.append(empty({ icon: 'flame', title: 'Sin elaborados cargados', text: 'Agregá lo que produce el local (bondiola, pollo deshuesado, salsas) y contá qué queda listo, marcado o crudo.', action: btn('Agregar elaborado', { kind: 'tinted', icon: 'plus', onClick: alta }) })); return; }
    lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Listo para vender · Marcado (sellado) · Crudo' }), h('div', { class: 'list' }, ...productos.slice().sort((a, c) => ordenarTexto(a.producto, c.producto)).map(fila))));
    lista.append(h('div', { style: 'padding:16px 0 8px' }, btn('Agregar un elaborado', { kind: 'tinted', full: true, icon: 'plus', onClick: alta })));
  }

  function alta() {
    const nombre = input({ placeholder: 'Ej.: Bondiola', maxlength: 80, autocapitalize: 'sentences' });
    const uni = select(UNIDADES, 'unidad');
    const cat = input({ placeholder: 'Ej.: Parrilla (opcional)', maxlength: 40 });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const ok = btn('Agregar', { kind: 'primary', onClick: async () => {
      const n = texto(nombre.value, 80);
      if (!n) { err.textContent = 'Escribí el nombre.'; nombre.focus(); return; }
      ok.disabled = true; err.textContent = '';
      try {
        const r = await api.post({ action: 'agregarElaborado', local, encargado: S.sesion.encargado, producto: n, unidad: uni.value, categoria: texto(cat.value, 40) });
        if (!r) throw new Error('No se pudo confirmar. Actualizá la lista.');
        toast(r.existia ? `${n} ya estaba en la lista` : `${n} agregado`, 'ok'); s.close();
        api.invalidar('getElaborados'); cargar(true);
      } catch (e) { err.textContent = e.message; ok.disabled = false; }
    } });
    const s = sheet({ title: 'Agregar un elaborado', body: [field('Nombre', nombre), h('div', { class: 'field-row mt12' }, field('Unidad', uni), field('Categoría', cat)), err], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
    setTimeout(() => nombre.focus(), 350);
  }

  function revisar() {
    const ids = tocados();
    if (!ids.length) return;
    const filas = ids.map(c => { const pr = productos.find(x => x.codigo === c) || { producto: c, unidad: '' }; const it = b.items[c]; const tot = ESTADOS.reduce((a, [k]) => a + (it[k] || 0), 0); return h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: pr.producto }), h('div', { class: 'cell-sub small num', text: ESTADOS.map(([k, l]) => `${l} ${fmtNum(it[k] || 0)}`).join(' · ') })), h('div', { class: 'cell-value strong num', text: fmtNum(tot, pr.unidad) })); });
    const err = h('div');
    const enviarBtn = btn('Guardar conteo', { kind: 'primary', icon: 'check', onClick: enviar });
    const s = sheet({ title: 'Revisar elaborados', body: [h('div', { class: 'list' }, ...filas), h('p', { class: 'note mt8', text: 'En cada producto incluido, un estado vacío cuenta como 0. Lo que no tocaste no cambia.' }), quienCarga(ctx), err], actions: [enviarBtn] });
    async function enviar() {
      const id = b.id && /^ELB-/.test(b.id) ? b.id : nuevoId('ELB');
      b.id = id; guardar();
      const items = ids.map(c => ({ codigo: c, listo: b.items[c].listo || 0, marcado: b.items[c].marcado || 0, crudo: b.items[c].crudo || 0 }));
      enviarBtn.disabled = true; fill(err);
      try {
        const r = await api.enviar({ payload: { action: 'saveConteoElaborados', id_conteo: id, local, encargado: S.sesion.encargado, items }, id, confirmAction: 'getOperacion', titulo: `Elaborados de ${local}` });
        draft.borrar(); invalidarLecturasLocal(local); s.close(); p.show(false);
        pantallaFinal(ctx, { estado: r.estado, id, title: 'Elaborados guardados', text: `${items.length} ${plural(items.length, 'producto', 'productos')}. Gerencia lo ve en el tablero.`, acciones: [btn('Ver detalle', { kind: 'tinted', onClick: () => verOperacion(id) }), btn('Volver a Hoy', { kind: 'primary', onClick: () => ctx.go('hoy') })] });
      } catch (e) { enviarBtn.disabled = false; haptic('error'); if (e.server) { delete b.id; guardar(); } fill(err, errorEnvio(e, { reintentar: enviar })); }
    }
  }

  let aviso = null;
  function cargar(force) {
    const c = api.cached('getElaborados', { local }, { maxAge: force ? 0 : 60000 });
    if (c.data) { productos = c.data.productos || []; pintar(); } else { productos = null; pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { productos = d.productos || []; pintar(); actualizarPill(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!productos) { productos = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
    actualizarPill();
  }
  cargar(false);
  return root;
}
