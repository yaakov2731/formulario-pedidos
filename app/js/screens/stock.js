// Stock: panel por local con estado (sin stock, bajo par, sin conteo, sin par, ok).
import { h, icon, largeTitle, buscador, chip, empty, skeleton, banner, btn, badge, fill } from '../ui.js';
import { fmtNum, fechaRelativa, norm, plural, ordenarTexto } from '../util.js';
import { selectLocal, tabla, reiniciarMetricas } from '../gerencia.js';
import * as api from '../api.js';

export const wide = true;
const KIND = { SIN_STOCK: 'bad', BAJO: 'amber', SIN_CONTEO: 'plain', SIN_PAR: 'plain', OK: 'ok' };
const LABEL = { SIN_STOCK: 'Sin stock', BAJO: 'Bajo par', SIN_CONTEO: 'Sin conteo', SIN_PAR: 'Sin par', OK: 'OK' };

export default async function stock(ctx) {
  const root = h('div');
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  const hdr = largeTitle({ title: 'Stock', sub: 'Último conteo y sugerido por producto', topbar: ctx.topbar, actions: [btn('Reiniciar métricas', { kind: 'danger', size: 'sm', icon: 'trash', onClick: () => reiniciarMetricas(ctx) })] });
  root.append(hdr);
  await ctx.bootstrap().fresh.catch(() => {});
  const filtro = { local: '', estado: '', q: '' };
  const sel = selectLocal(ctx, '', { todos: 'Todos los locales', onChange: (v) => { filtro.local = v; cargar(true); } });
  const search = buscador({ placeholder: 'Buscar producto o proveedor', onInput: (v) => { filtro.q = v; pintar(); } });
  const chips = h('div', { class: 'chips' });
  const kpis = h('div', { class: 'kpis' });
  const lista = h('div', { class: 'mt12' });
  root.append(h('div', { class: 'toolbar' }, sel, search), chips, kpis, lista);
  let filas = null;

  function pintarChips() {
    fill(chips);
    const n = k => filas ? filas.filter(f => !k || f.estado === k).length : 0;
    for (const [v, l] of [['', 'Todos'], ['SIN_STOCK', 'Sin stock'], ['BAJO', 'Bajo par'], ['SIN_CONTEO', 'Sin conteo'], ['SIN_PAR', 'Sin par'], ['OK', 'OK']]) chips.append(chip(v ? `${l} (${n(v)})` : l, { on: filtro.estado === v, onClick: () => { filtro.estado = v; pintarChips(); pintar(); } }));
  }
  function pintar() {
    fill(lista); fill(kpis);
    if (!filas) { lista.append(skeleton(6)); return; }
    const kpi = (n, l, k = '') => h('div', { class: `kpi${k ? ' ' + k : ''}` }, h('div', { class: 'kpi-n', text: String(n) }), h('div', { class: 'kpi-l', text: l }));
    const c = k => filas.filter(f => f.estado === k).length;
    kpis.append(kpi(c('SIN_STOCK'), 'sin stock', c('SIN_STOCK') ? 'bad' : ''), kpi(c('BAJO'), 'bajo par', c('BAJO') ? 'warn' : ''), kpi(c('SIN_CONTEO'), 'sin conteo'), kpi(filas.filter(f => f.sugerido > 0).length, 'con sugerido'));
    const q = norm(filtro.q);
    const vis = filas.filter(f => (!filtro.estado || f.estado === filtro.estado) && (!q || norm(f.producto).includes(q) || norm(f.proveedor).includes(q) || norm(f.local).includes(q)))
      .sort((a, b) => ordenarTexto(a.local, b.local) || ordenarTexto(a.categoria, b.categoria) || ordenarTexto(a.producto, b.producto));
    if (!vis.length) { lista.append(empty({ icon: 'chart', title: filas.length ? 'Nada con ese filtro' : 'Sin productos', text: filas.length ? '' : 'Cargá el catálogo del local para ver su stock.' })); return; }
    lista.append(tabla({
      columns: [
        { key: 'producto', label: 'Producto', render: f => h('div', null, h('div', { text: f.producto }), h('div', { class: 'note', text: `${f.categoria || ''}${f.proveedor ? ' · ' + f.proveedor : ''}` })) },
        { key: 'local', label: 'Local' },
        { key: 'stock_actual', label: 'Stock', num: true, render: f => fmtNum(f.stock_actual, f.unidad) },
        { key: 'par', label: 'Par', num: true, render: f => fmtNum(f.par) },
        { key: 'pedido_abierto', label: 'En camino', num: true, render: f => f.pedido_abierto ? fmtNum(f.pedido_abierto) : '—' },
        { key: 'sugerido', label: 'Sugerido', num: true, render: f => f.sugerido > 0 ? h('span', { class: 'accent strong', text: fmtNum(f.sugerido) }) : '—' },
        { key: 'ultimo_conteo', label: 'Último conteo', render: f => f.ultimo_conteo ? `${fechaRelativa(f.ultimo_conteo)}${f.dias_sin_contar >= 7 ? ` (${f.dias_sin_contar} días)` : ''}` : 'Nunca' },
        { key: 'estado', label: 'Estado', render: f => badge(LABEL[f.estado] || f.estado, KIND[f.estado] || 'plain') }
      ],
      rows: vis
    }));
    lista.append(h('p', { class: 'note mt8', text: `${vis.length} ${plural(vis.length, 'producto', 'productos')}` }));
  }
  let aviso = null;
  function cargar(force) {
    const params = filtro.local ? { local: filtro.local } : {};
    const c = api.cached('getStockPanel', params, { maxAge: force ? 0 : 45000 });
    if (c.data) { filas = c.data.filas || []; pintarChips(); pintar(); } else { filas = null; pintarChips(); pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { filas = d.filas || []; pintarChips(); pintar(); hdr.stampNow(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!filas) { filas = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, kpis); })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  cargar(false);
  return root;
}
