// Contar: stock actual por producto. Cero es un valor válido; lo que no se toca no cambia.
import { h, icon, largeTitle, buscador, chip, stepper, btn, sheet, empty, skeleton, banner, haptic, fill } from '../ui.js';
import { norm, fmtNum, nuevoId, agrupar, ordenarTexto, plural, fechaRelativa, haceDias, conteoSospechoso } from '../util.js';
import { catalogoLocal, borrador, pill, pantallaFinal, errorEnvio, invalidarLecturasLocal, quienCarga } from '../flujo.js';
import { verOperacion } from '../detalles.js';
import * as api from '../api.js';

export default async function contar(ctx) {
  const { S } = ctx;
  const local = S.sesion.local;
  const root = h('div');
  const draft = borrador('conteo', local);
  const b = draft.leer({ items: {} });
  b.items = b.items || {};

  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Contar', sub: local, topbar: ctx.topbar }));

  let productos = null;
  const filtro = { q: '', cat: 'todos' };
  const search = buscador({ placeholder: 'Buscar producto', onInput: (v) => { filtro.q = v; pintarLista(); } });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const lista = h('div', { class: 'mt8' });
  root.append(h('div', { class: 'mt8' }, search), chips, lista);

  const p = pill({ label: 'Revisar', onClick: revisar });
  ctx.onLeave(() => p.remove());

  const valor = c => (b.items[c] === undefined ? null : b.items[c]);
  const contados = () => Object.keys(b.items).filter(k => b.items[k] !== null && b.items[k] !== undefined);
  function guardar() { draft.guardar(b); actualizarPill(); }
  function actualizarPill() {
    const n = contados().length;
    p.set(`${n} ${plural(n, 'contado', 'contados')}`, productos ? `de ${productos.length}` : '');
    p.show(n > 0);
  }

  function pintarChips() {
    fill(chips);
    const cats = [...new Set(productos.map(x => x.categoria || 'Sin categoría'))].sort(ordenarTexto);
    const viejos = productos.filter(x => { const d = haceDias(x.ultimo_conteo); return d === null || d >= 7; }).length;
    const mk = (id, label, ic) => chip(label, { on: filtro.cat === id, icon: ic, onClick: () => { filtro.cat = id; pintarChips(); pintarLista(); } });
    chips.append(mk('todos', 'Todos'));
    if (viejos) chips.append(mk('viejos', `Sin contar hace 7 días (${viejos})`, 'clock'));
    chips.append(mk('faltan', 'Faltan contar'));
    for (const c of cats) chips.append(mk('cat:' + c, c));
  }

  function fila(pr) {
    const v = valor(pr.codigo);
    let cero;
    const st = stepper({ value: v, unidad: pr.unidad, min: 0, label: `${pr.producto} en ${pr.unidad}`, onChange: (x) => { if (x === null) delete b.items[pr.codigo]; else b.items[pr.codigo] = x; cero.classList.toggle('is-on', x === 0); guardar(); } });
    cero = h('button', { class: `prod-zero${v === 0 ? ' is-on' : ''}`, type: 'button', 'aria-label': `No queda ${pr.producto}`, text: 'No queda' });
    cero.addEventListener('click', () => { haptic(); if (valor(pr.codigo) === 0) { st.setValue(null); } else { st.setValue(0); } });
    const meta = [];
    if (pr.stock_actual !== null && pr.stock_actual !== undefined) meta.push(h('span', { class: 'num', text: `Quedaban ${fmtNum(pr.stock_actual, pr.unidad)} · ${fechaRelativa(pr.ultimo_conteo)}` }));
    else meta.push(h('span', { text: `Sin contar · ${pr.unidad}` }));
    return h('div', { class: 'prod' },
      h('div', { class: 'prod-body' }, h('div', { class: 'prod-name', text: pr.producto }), h('div', { class: 'prod-meta' }, ...meta)),
      h('div', { class: 'prod-control' }, cero, st));
  }

  function pintarLista() {
    fill(lista);
    if (!productos) { lista.append(skeleton(6)); return; }
    if (!productos.length) { lista.append(empty({ icon: 'book', title: 'Este local no tiene catálogo', text: 'Gerencia lo carga en Catálogo.' })); return; }
    const q = norm(filtro.q);
    let vis = productos;
    if (filtro.cat === 'viejos') vis = vis.filter(x => { const d = haceDias(x.ultimo_conteo); return d === null || d >= 7; });
    else if (filtro.cat === 'faltan') vis = vis.filter(x => valor(x.codigo) === null);
    else if (filtro.cat.startsWith('cat:')) vis = vis.filter(x => (x.categoria || 'Sin categoría') === filtro.cat.slice(4));
    if (q) vis = vis.filter(x => norm(x.producto).includes(q) || norm(x.codigo).includes(q));
    if (!vis.length) { lista.append(empty({ icon: 'search', title: q ? `Nada con “${filtro.q}”` : 'Todo contado', text: q ? 'Probá con otra palabra.' : 'Revisá y guardá el conteo.' })); return; }
    const grupos = agrupar(vis, x => x.categoria || 'Sin categoría');
    for (const g of [...grupos.keys()].sort(ordenarTexto)) {
      const items = grupos.get(g).slice().sort((a, c) => ordenarTexto(a.producto, c.producto));
      lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: g }), h('div', { class: 'list' }, ...items.map(fila))));
    }
  }

  function revisar() {
    const ids = contados();
    if (!ids.length) return;
    let raros = 0;
    const lineas = h('div', { class: 'list' }, ...ids.map(c => {
      const pr = productos.find(x => x.codigo === c) || { producto: c, unidad: '' };
      const raro = conteoSospechoso(valor(c), pr);
      if (raro) raros++;
      return h('div', { class: `cell${raro ? ' is-suspect' : ''}` }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: pr.producto }), pr.stock_actual !== null && pr.stock_actual !== undefined ? h('div', { class: 'cell-sub small num', text: `Antes ${fmtNum(pr.stock_actual, pr.unidad)}` }) : null, raro ? h('div', { class: 'cell-sub small suspect-note', text: `Revisá: ${raro}` }) : null), h('div', { class: `cell-value strong num${valor(c) === 0 ? ' danger' : ''}`, text: valor(c) === 0 ? 'No queda' : fmtNum(valor(c), pr.unidad) }));
    }));
    const alerta = raros ? banner(`${raros} ${plural(raros, 'cantidad parece', 'cantidades parecen')} mal cargada${raros === 1 ? '' : 's'}. Revisá la unidad antes de guardar.`, 'warn', { icon: 'alert' }) : null;
    const err = h('div');
    const enviarBtn = btn(raros ? 'Guardar igual' : 'Guardar conteo', { kind: 'primary', icon: 'check', onClick: enviar });
    const s = sheet({ title: `Revisar conteo`, body: [alerta, lineas, h('p', { class: 'note mt8', text: `${ids.length} ${plural(ids.length, 'producto', 'productos')}. Lo que no contaste no cambia.` }), quienCarga(ctx), err], actions: [enviarBtn] });
    async function enviar() {
      const id = b.id && /^CNT-/.test(b.id) ? b.id : nuevoId('CNT');
      b.id = id; guardar();
      const items = ids.map(c => ({ codigo: c, cantidad: valor(c) }));
      enviarBtn.disabled = true; fill(err);
      try {
        const r = await api.enviar({ payload: { action: 'saveConteo', id_operacion: id, local, encargado: S.sesion.encargado, items }, id, confirmAction: 'getOperacion', titulo: `Conteo de ${local} (${items.length})` });
        draft.borrar(); invalidarLecturasLocal(local); s.close(); p.show(false);
        pantallaFinal(ctx, { estado: r.estado, id, title: 'Conteo guardado', text: `${items.length} ${plural(items.length, 'producto actualizado', 'productos actualizados')}. Ya podés pedir con sugerido.`,
          acciones: [btn('Ver el conteo', { kind: 'tinted', onClick: () => verOperacion(id) }), btn('Ir a Pedir', { kind: 'primary', onClick: () => ctx.go('pedir') })] });
      } catch (e) {
        enviarBtn.disabled = false; haptic('error');
        if (e.server) { delete b.id; guardar(); }
        fill(err, errorEnvio(e, { reintentar: enviar }));
      }
    }
  }

  let aviso = null;
  function cargar(force) {
    const c = catalogoLocal(local, { force });
    if (c.productos) { productos = c.productos; pintarChips(); pintarLista(); } else { productos = null; pintarLista(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(pr => { productos = pr; pintarChips(); pintarLista(); if (aviso) { aviso.remove(); aviso = null; } actualizarPill(); })
      .catch(e => {
        if (!productos) { productos = []; pintarChips(); pintarLista(); }
        if (aviso) aviso.remove();
        aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) });
        root.insertBefore(aviso, lista);
      }).finally(() => refresh.classList.remove('is-busy'));
    actualizarPill();
  }
  cargar(false);
  return root;
}
