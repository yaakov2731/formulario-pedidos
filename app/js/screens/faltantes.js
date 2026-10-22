// Faltantes: líneas que llegaron incompletas, por proveedor, con texto de reclamo para WhatsApp.
import { h, icon, largeTitle, chip, empty, skeleton, banner, btn, copiar, toast, fill } from '../ui.js';
import { fmtNum, fechaRelativa, plural, agrupar, ordenarTexto, waUrl } from '../util.js';
import { proveedoresDe } from '../gerencia.js';
import * as api from '../api.js';

export default async function faltantes(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Faltantes', sub: 'Lo que el proveedor no entregó completo', topbar: ctx.topbar }));
  const filtro = { dias: 14 };
  const chips = h('div', { class: 'chips' });
  const lista = h('div');
  root.append(chips, lista);
  let lineas = null;

  function pintarChips() {
    fill(chips);
    for (const d of [7, 14, 30, 90]) chips.append(chip(`Últimos ${d} días`, { on: filtro.dias === d, onClick: () => { filtro.dias = d; pintarChips(); cargar(true); } }));
  }
  function textoReclamo(prov, ls) {
    return `Hola ${prov || ''}, de Docks del Puerto. Nos quedaron faltantes:\n` + ls.map(l => `• ${l.producto} — pedimos ${fmtNum(l.cantidad, l.unidad)}, llegó ${fmtNum(l.cantidad_recibida, l.unidad)} (${l.local})`).join('\n') + '\n¿Nos los completan en la próxima entrega? Gracias.';
  }
  function pintar() {
    fill(lista);
    if (!lineas) { lista.append(skeleton(4)); return; }
    if (!lineas.length) { lista.append(empty({ icon: 'check', title: 'Sin faltantes', text: `Nada llegó incompleto en los últimos ${filtro.dias} días.` })); return; }
    const grupos = agrupar(lineas, l => l.proveedor || 'Sin proveedor');
    for (const prov of [...grupos.keys()].sort(ordenarTexto)) {
      const ls = grupos.get(prov);
      const p = proveedoresDe(ctx, { soloActivos: false }).find(x => x.proveedor === prov);
      const txt = textoReclamo(prov, ls);
      lista.append(h('section', { class: 'prov' },
        h('div', { class: 'prov-head', style: 'cursor:default' }, h('div', { class: 'grow' }, h('div', { class: 'prov-title', text: prov }), h('div', { class: 'prov-sub', text: `${ls.length} ${plural(ls.length, 'faltante', 'faltantes')}` })),
          btn('Copiar reclamo', { size: 'sm', icon: 'copy', onClick: () => copiar(txt).then(ok => toast(ok ? 'Texto copiado' : 'No se pudo copiar', ok ? 'ok' : 'error')) }),
          h('a', { class: 'btn btn-ok btn-sm', href: waUrl(p && p.whatsapp, txt), target: '_blank', rel: 'noopener' }, icon('whatsapp', 18), h('span', { text: 'WhatsApp' }))),
        h('div', { class: 'prov-lines' }, ...ls.map(l => h('div', { class: 'line' },
          h('span', { class: 'line-body' }, h('span', { class: 'line-name', text: l.producto }), h('span', { class: 'line-meta', text: `${l.local} · recibido ${fechaRelativa(l.fecha_recepcion)} · orden ${String(l.id_oc || '').slice(-9)}` })),
          h('span', { class: 'cell-stack' }, h('span', { class: 'line-qty danger', text: `faltan ${fmtNum((l.cantidad || 0) - (l.cantidad_recibida || 0), l.unidad)}` }), h('span', { class: 'note num', text: `${fmtNum(l.cantidad_recibida)} de ${fmtNum(l.cantidad)}` })))))));
    }
  }
  let aviso = null;
  function cargar(force) {
    const c = api.cached('getFaltantes', { dias: filtro.dias }, { maxAge: force ? 0 : 60000 });
    if (c.data) { lineas = c.data.lineas || []; pintar(); } else { lineas = null; pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { lineas = d.lineas || []; pintar(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!lineas) { lineas = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  pintarChips();
  ctx.bootstrap().fresh.then(() => pintar()).catch(() => {});
  cargar(false);
  return root;
}
