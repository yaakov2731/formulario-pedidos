// Compras: líneas pendientes agrupadas por proveedor → crear orden (WhatsApp) o cancelar.
import { h, icon, largeTitle, buscador, chip, btn, sheet, empty, skeleton, banner, toast, checkEl, badge, haptic, prompt, field, input, segmented, fill } from '../ui.js';
import { fmtNum, fmtMoney, nuevoId, plural, fechaRelativa, norm, semanaDe, store, texto, ordenarTexto } from '../util.js';
import { postAdmin, manejarError, selectProveedor, hojaWhatsApp } from '../gerencia.js';
import { verPedido } from '../detalles.js';
import * as api from '../api.js';

export const wide = true;

export default async function compras(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Compras', sub: 'Pendiente de comprar, por proveedor', topbar: ctx.topbar }));

  const filtro = { q: '', semana: '' , local: '' };
  const seg = segmented([{ value: '', label: 'Todo lo pendiente' }, { value: semanaDe().id, label: 'Esta semana' }], '', (v) => { filtro.semana = v; cargar(true); }, 'Semana');
  const search = buscador({ placeholder: 'Buscar producto o local', onInput: (v) => { filtro.q = v; pintar(); } });
  const resumen = h('div', { class: 'kpis' });
  const lista = h('div');
  root.append(h('div', { class: 'toolbar' }, h('div', { style: 'min-width:260px' }, seg), search), resumen, lista);

  let grupos = null;
  const sel = new Set();      // id_linea seleccionadas (por defecto todas)
  const desmarcadas = new Set();
  const seleccionada = id => !desmarcadas.has(id);

  function pintarResumen() {
    if (!grupos) { fill(resumen); return; }
    const lineas = grupos.reduce((a, g) => a + g.lineas.length, 0);
    const total = grupos.reduce((a, g) => a + (g.total_estimado || 0), 0);
    const urgentes = grupos.reduce((a, g) => a + g.lineas.filter(l => l.prioridad === 'Urgente').length, 0);
    const locales = new Set(grupos.flatMap(g => g.lineas.map(l => l.local))).size;
    const kpi = (n, l, k = '') => h('div', { class: `kpi${k ? ' ' + k : ''}` }, h('div', { class: 'kpi-n', text: n }), h('div', { class: 'kpi-l', text: l }));
    fill(resumen, kpi(String(grupos.filter(g => g.proveedor).length), 'proveedores'), kpi(String(lineas), plural(lineas, 'línea pendiente', 'líneas pendientes')), kpi(String(urgentes), 'urgentes', urgentes ? 'warn' : ''), kpi(fmtMoney(total), `estimado · ${locales} ${plural(locales, 'local', 'locales')}`));
  }

  function filaLinea(g, l) {
    const on = seleccionada(l.id_linea);
    const chk = checkEl(on, l.producto);
    const row = h('button', { class: `line${on ? '' : ' is-off'}`, type: 'button', 'aria-pressed': on ? 'true' : 'false' },
      chk,
      h('span', { class: 'line-body' }, h('span', { class: 'line-name', text: l.producto }), h('span', { class: 'line-meta', text: `${l.local} · ${fechaRelativa(l.fecha_hora)}${l.precio_ref ? ` · ${fmtMoney(l.precio_ref)} ${l.unidad}` : ''}` })),
      l.prioridad === 'Urgente' ? badge('Urgente', 'warn') : null,
      h('span', { class: 'line-qty', text: fmtNum(l.cantidad, l.unidad) }),
      h('button', { class: 'btn btn-plain btn-xs', type: 'button', 'aria-label': `Ver pedido de ${l.local}`, onClick: (e) => { e.stopPropagation(); verPedido(l.id_pedido); } }, icon('arrow', 16)));
    row.addEventListener('click', () => { haptic(); if (desmarcadas.has(l.id_linea)) desmarcadas.delete(l.id_linea); else desmarcadas.add(l.id_linea); pintar(); });
    return row;
  }

  function pintar() {
    fill(lista);
    pintarResumen();
    if (!grupos) { lista.append(skeleton(5)); return; }
    const q = norm(filtro.q);
    const vis = grupos.map(g => ({ ...g, lineas: g.lineas.filter(l => !q || norm(l.producto).includes(q) || norm(l.local).includes(q) || norm(g.proveedor).includes(q)) })).filter(g => g.lineas.length);
    if (!vis.length) { lista.append(empty({ icon: 'bag', title: q ? `Nada con “${filtro.q}”` : 'Nada pendiente de comprar', text: q ? '' : 'Cuando un local mande un pedido, sus líneas aparecen acá agrupadas por proveedor.' })); return; }
    for (const g of vis) {
      const ids = g.lineas.filter(l => seleccionada(l.id_linea)).map(l => l.id_linea);
      const totalSel = g.lineas.filter(l => seleccionada(l.id_linea)).reduce((a, l) => a + ((l.cantidad || 0) * (l.precio_ref || 0)), 0);
      const bajoMin = g.pedido_minimo && totalSel > 0 && totalSel < g.pedido_minimo;
      const sinProv = !g.proveedor;
      const crear = btn(sinProv ? `Asignar proveedor y crear orden (${ids.length})` : `Crear orden (${ids.length})`, { kind: 'primary', size: 'sm', icon: 'whatsapp', disabled: !ids.length, onClick: () => crearOrden(g, ids) });
      const cancelar = btn('Cancelar', { kind: 'danger', size: 'sm', disabled: !ids.length, onClick: () => cancelar_(g, ids) });
      lista.append(h('section', { class: 'prov' },
        h('div', { class: 'prov-head', style: 'cursor:default' },
          h('div', { class: 'grow' }, h('div', { class: 'prov-title', text: sinProv ? 'Sin proveedor asignado' : g.proveedor }),
            h('div', { class: 'prov-sub', text: `${g.lineas.length} ${plural(g.lineas.length, 'línea', 'líneas')}${g.whatsapp ? ' · WhatsApp' : (sinProv ? '' : ' · sin WhatsApp cargado')}${g.pedido_minimo ? ` · mínimo ${fmtMoney(g.pedido_minimo)}` : ''}` })),
          h('div', { class: 'prov-total' }, h('div', { text: fmtMoney(totalSel) }), bajoMin ? badge('Bajo el mínimo', 'warn') : null)),
        h('div', { class: 'prov-lines' }, ...g.lineas.map(l => filaLinea(g, l))),
        h('div', { class: 'row wrap', style: 'padding:10px 16px 14px;justify-content:flex-end' }, cancelar, crear)));
    }
  }

  async function crearOrden(g, ids) {
    let proveedor = g.proveedor;
    const responsable = input({ value: store.get('responsable', ''), placeholder: 'Quién compra', autocapitalize: 'words' });
    const provSel = !g.proveedor ? selectProveedor(ctx, '') : null;
    const err = h('p', { class: 'field-error', role: 'alert' });
    const lineasSel = g.lineas.filter(l => ids.includes(l.id_linea));
    const ok = btn('Crear orden', { kind: 'primary', icon: 'whatsapp', onClick: async () => {
      const resp = texto(responsable.value, 60);
      if (provSel) proveedor = provSel.value;
      if (!proveedor) { err.textContent = 'Elegí el proveedor.'; return; }
      if (!resp) { err.textContent = 'Escribí quién compra.'; responsable.focus(); return; }
      store.set('responsable', resp);
      ok.disabled = true; err.textContent = '';
      const id_oc = nuevoId('OC');
      try {
        const r = await postAdmin(ctx, { action: 'crearOrden', id_oc, id_lineas: ids, proveedor, responsable: resp });
        s.close(); haptic('success');
        api.invalidar('getOrdenes'); api.invalidar('getPorRecibir'); api.invalidar('getHoy');
        hojaWhatsApp({ titulo: `Orden a ${proveedor}`, texto: r.texto_whatsapp, url: r.whatsapp_url, extra: banner(`${r.lineas} ${plural(r.lineas, 'línea marcada', 'líneas marcadas')} como compradas. Mandá el texto por WhatsApp.`, 'ok', { icon: 'check' }) });
        cargar(true);
      } catch (e) { if (!manejarError(ctx, e)) { err.textContent = e.message; ok.disabled = false; } }
    } });
    const s = sheet({ title: g.proveedor ? `Orden a ${g.proveedor}` : 'Asignar proveedor', body: [
      provSel ? field('Proveedor para estas líneas', provSel) : null,
      h('div', { class: 'mt12' }, field('Responsable de la compra', responsable)),
      h('section', { class: 'group' }, h('h2', { class: 'group-title', text: `${lineasSel.length} ${plural(lineasSel.length, 'línea', 'líneas')}` }),
        h('div', { class: 'list' }, ...lineasSel.map(l => h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: l.producto }), h('div', { class: 'cell-sub small', text: l.local })), h('div', { class: 'cell-value strong num', text: fmtNum(l.cantidad, l.unidad) }))))),
      err], actions: [btn('Cancelar', { onClick: () => s.close() }), ok] });
  }

  async function cancelar_(g, ids) {
    const motivo = await prompt({ title: `Cancelar ${ids.length} ${plural(ids.length, 'línea', 'líneas')}`, text: 'El local lo ve en el detalle del pedido.', label: 'Motivo', placeholder: 'Ej.: no hay stock en el proveedor', ok: 'Cancelar líneas' });
    if (motivo === null) return;
    try {
      const r = await postAdmin(ctx, { action: 'cancelarLineas', id_lineas: ids, motivo });
      toast(`${r.canceladas} ${plural(r.canceladas, 'línea cancelada', 'líneas canceladas')}`, 'ok'); cargar(true);
    } catch (e) { if (!manejarError(ctx, e)) toast(e.message, 'error'); }
  }

  let aviso = null;
  function cargar(force) {
    const params = filtro.semana ? { semana: filtro.semana } : {};
    const c = api.cached('getConsolidado', params, { maxAge: force ? 0 : 30000 });
    if (c.data) { grupos = c.data.grupos || []; pintar(); } else { grupos = null; pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { grupos = d.grupos || []; pintar(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!grupos) { grupos = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, resumen); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  ctx.bootstrap().fresh.catch(() => {});
  cargar(false);
  return root;
}
