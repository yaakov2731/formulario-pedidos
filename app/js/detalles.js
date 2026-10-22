// Hojas de detalle compartidas: un pedido, una operación (conteo, recepción, orden, elaborados).
import { h, sheet, badge, btn, skeleton, banner, copiar, toast, icon, fill } from './ui.js';
import { fmtNum, fechaCorta, fechaRelativa, plural } from './util.js';
import * as api from './api.js';

export const ESTADO_KIND = { Pendiente: 'amber', Comprado: 'tint', Entregado: 'ok', Incompleto: 'warn', Cancelado: 'plain', 'En compra': 'tint', Cerrado: 'ok', Enviada: 'tint', 'Recibida parcial': 'warn', Recibida: 'ok', Cancelada: 'plain' };
export function badgeEstado(e) { return badge(e || '—', ESTADO_KIND[e] || 'plain'); }

export function verPedido(id, { acciones } = {}) {
  const body = h('div', null, skeleton(4));
  const s = sheet({ title: 'Pedido', body, actions: acciones || null });
  api.get('getPedido', { id }).then(r => {
    if (!r || r.found === false || !r.pedido) { fill(body, banner('Este pedido no está en la planilla.', 'warn', { icon: 'alert' })); return; }
    const p = r.pedido;
    fill(body, 
      h('div', { class: 'row between', style: 'padding:2px 0 10px' },
        h('div', null, h('div', { class: 'head', text: p.local }), h('div', { class: 'sub', text: `${p.encargado || ''} · ${fechaCorta(p.fecha_hora)}`.replace(/^ · /, '') })),
        badgeEstado(p.estado)),
      p.prioridad === 'Urgente' ? banner('Urgente', 'warn', { icon: 'bolt' }) : null,
      p.fecha_entrega ? h('p', { class: 'sub', text: `Entrega pedida: ${p.fecha_entrega}` }) : null,
      p.notas ? h('p', { class: 'sub mt8', style: 'white-space:pre-wrap', text: p.notas }) : null,
      h('section', { class: 'group' },
        h('h2', { class: 'group-title', text: `${r.lineas.length} ${plural(r.lineas.length, 'producto', 'productos')}` }),
        h('div', { class: 'list' }, ...r.lineas.map(l => h('div', { class: 'cell' },
          h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: l.producto }), h('div', { class: 'cell-sub small', text: [l.proveedor || 'Sin proveedor', l.id_oc ? `Orden ${l.id_oc.slice(-9)}` : ''].filter(Boolean).join(' · ') })),
          h('div', { class: 'cell-stack' }, h('span', { class: 'strong num', text: fmtNum(l.cantidad, l.unidad) }), badgeEstado(l.estado)))))),
      h('p', { class: 'note mt12 center', text: p.id_pedido })
    );
  }).catch(e => fill(body, banner(e.message, 'bad', { icon: 'alert' })));
  return s;
}

export function verOperacion(id, { titulo } = {}) {
  const body = h('div', null, skeleton(3));
  const s = sheet({ title: titulo || 'Detalle', body });
  api.get('getOperacion', { id }).then(r => {
    if (!r || r.found === false) { fill(body, banner('No está en la planilla.', 'warn', { icon: 'alert' })); return; }
    const nombre = { CONTEO: 'Conteo de stock', RECEPCION: 'Recepción', OC: 'Orden de compra', PEDIDO: 'Pedido', ELABORADOS: 'Conteo de elaborados' }[r.tipo] || r.tipo;
    s.setTitle(nombre);
    const partes = [
      h('div', { class: 'row between', style: 'padding:2px 0 10px' },
        h('div', null, h('div', { class: 'head', text: r.local || r.proveedor || '' }), h('div', { class: 'sub', text: `${r.encargado ? r.encargado + ' · ' : ''}${fechaRelativa(r.fecha_hora)}` })),
        h('span', { class: 'badge plain num', text: `${r.items} ${plural(r.items, 'ítem', 'ítems')}` }))
    ];
    if (r.tipo === 'OC' && r.texto_whatsapp) {
      partes.push(h('div', { class: 'wa-text', text: r.texto_whatsapp }));
      partes.push(h('div', { class: 'btn-row mt12' },
        btn('Copiar', { icon: 'copy', onClick: () => copiar(r.texto_whatsapp).then(ok => toast(ok ? 'Texto copiado' : 'No se pudo copiar', ok ? 'ok' : 'error')) }),
        h('a', { class: 'btn btn-ok', href: r.whatsapp_url, target: '_blank', rel: 'noopener' }, icon('whatsapp', 20), h('span', { text: 'WhatsApp' }))));
    }
    if (r.tipo === 'ELABORADOS' && Array.isArray(r.detalle)) {
      partes.push(h('div', { class: 'list' }, ...r.detalle.map(d => h('div', { class: 'cell' },
        h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: d.producto }), h('div', { class: 'cell-sub small num', text: `Listo ${fmtNum(d.listo)} · Marcado ${fmtNum(d.marcado)} · Crudo ${fmtNum(d.crudo)}` })),
        h('div', { class: 'cell-value strong num', text: fmtNum(d.total, d.unidad) })))));
    }
    partes.push(h('p', { class: 'note mt12 center', text: id }));
    fill(body, ...partes);
  }).catch(e => fill(body, banner(e.message, 'bad', { icon: 'alert' })));
  return s;
}
