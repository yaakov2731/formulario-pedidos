// Órdenes de compra: lista con estado, detalle con texto de WhatsApp.
import { h, icon, largeTitle, buscador, chip, cell, empty, skeleton, banner, btn, fill } from '../ui.js';
import { fmtMoney, fechaRelativa, norm, plural } from '../util.js';
import { verOperacion, badgeEstado } from '../detalles.js';
import * as api from '../api.js';

export default async function ordenes(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  const hdr = largeTitle({ title: 'Órdenes', sub: 'Lo que ya se mandó a comprar', topbar: ctx.topbar });
  root.append(hdr);
  const filtro = { q: '', estado: '' };
  const search = buscador({ placeholder: 'Buscar proveedor o local', onInput: (v) => { filtro.q = v; pintar(); } });
  const chips = h('div', { class: 'chips' });
  const lista = h('div');
  root.append(h('div', { class: 'mt8' }, search), chips, lista);
  let ordenes = null;

  function pintarChips() {
    fill(chips);
    for (const [v, l] of [['', 'Todas'], ['Enviada', 'Enviadas'], ['Recibida parcial', 'Parciales'], ['Recibida', 'Recibidas'], ['Cancelada', 'Canceladas']]) {
      const n = ordenes ? ordenes.filter(o => !v || o.estado === v).length : 0;
      chips.append(chip(n && v ? `${l} (${n})` : l, { on: filtro.estado === v, onClick: () => { filtro.estado = v; pintarChips(); pintar(); } }));
    }
  }
  function pintar() {
    fill(lista);
    if (!ordenes) { lista.append(skeleton(5)); return; }
    const q = norm(filtro.q);
    const vis = ordenes.filter(o => (!filtro.estado || o.estado === filtro.estado) && (!q || norm(o.proveedor).includes(q) || norm((o.locales || []).join(' ')).includes(q) || norm(o.id_oc).includes(q)));
    if (!vis.length) { lista.append(empty({ icon: 'send', title: q || filtro.estado ? 'Sin órdenes con ese filtro' : 'Todavía no hay órdenes', text: q || filtro.estado ? '' : 'Se crean desde Compras, proveedor por proveedor.' })); return; }
    lista.append(h('section', { class: 'group' }, h('div', { class: 'list' }, ...vis.map(o => cell({
      title: o.proveedor || 'Sin proveedor', sub: `${fechaRelativa(o.fecha_hora)} · ${(o.locales || []).join(', ')} · ${o.lineas} ${plural(o.lineas, 'línea', 'líneas')}`,
      lead: 'send', leadKind: o.estado === 'Recibida' ? 'ok' : o.estado === 'Cancelada' ? 'plain' : o.estado === 'Recibida parcial' ? 'warn' : '',
      right: h('div', { class: 'cell-stack' }, h('span', { class: 'strong num', text: fmtMoney(o.total_estimado) }), badgeEstado(o.estado)), chevron: true,
      onClick: () => verOperacion(o.id_oc, { titulo: 'Orden de compra' })
    })))));
  }
  let aviso = null;
  function cargar(force) {
    const c = api.cached('getOrdenes', {}, { maxAge: force ? 0 : 30000 });
    if (c.data) { ordenes = c.data.ordenes || []; pintarChips(); pintar(); } else { ordenes = null; pintarChips(); pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { ordenes = d.ordenes || []; pintarChips(); pintar(); hdr.stampNow(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!ordenes) { ordenes = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  cargar(false);
  return root;
}
