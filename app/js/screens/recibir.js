// Recibir: órdenes con líneas Comprado del local. Recibido = pedido con un toque; parcial; extras sin pedido.
import { h, icon, largeTitle, stepper, btn, sheet, empty, skeleton, banner, haptic, buscador, badge, cell, fill } from '../ui.js';
import { fmtNum, nuevoId, plural, fechaRelativa, parseNum, norm, texto } from '../util.js';
import { catalogoLocal, borrador, pill, pantallaFinal, errorEnvio, invalidarLecturasLocal } from '../flujo.js';
import { verOperacion } from '../detalles.js';
import * as api from '../api.js';

export default async function recibir(ctx) {
  const { S } = ctx;
  const local = S.sesion.local;
  const root = h('div');
  const draft = borrador('recepcion', local);
  const b = draft.leer({ items: {}, extras: [], obs: '' });
  b.items = b.items || {}; b.extras = b.extras || [];

  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Recibir', sub: local, topbar: ctx.topbar }));
  const lista = h('div');
  root.append(lista);

  const p = pill({ label: 'Revisar', onClick: revisar });
  ctx.onLeave(() => p.remove());

  let ordenes = null;
  const recibido = id => (b.items[id] === undefined ? null : b.items[id]);
  const controladas = () => Object.keys(b.items).filter(k => b.items[k] !== null && b.items[k] !== undefined);
  function guardar() { draft.guardar(b); actualizarPill(); }
  function actualizarPill() {
    const n = controladas().length + b.extras.length;
    p.set(`${n} ${plural(n, 'línea controlada', 'líneas controladas')}`, '');
    p.show(n > 0);
  }

  function lineaFila(l) {
    const v = recibido(l.id_linea);
    const st = stepper({ value: v, unidad: l.unidad, min: 0, wide: true, label: `Recibido de ${l.producto} en ${l.unidad}`, onChange: (x) => { if (x === null) delete b.items[l.id_linea]; else b.items[l.id_linea] = x; guardar(); pintarEstado(); } });
    const est = h('span', { class: 'badge plain num' });
    const pintarEstado = () => {
      const r = recibido(l.id_linea);
      est.className = 'badge num ' + (r === null ? 'plain' : r >= l.cantidad ? 'ok' : r === 0 ? 'bad' : 'warn');
      est.textContent = r === null ? `Pedido ${fmtNum(l.cantidad)}` : r >= l.cantidad ? 'Completo' : r === 0 ? 'No llegó' : `Faltan ${fmtNum(l.cantidad - r)}`;
    };
    pintarEstado();
    return h('div', { class: 'prod' },
      h('div', { class: 'prod-body' }, h('div', { class: 'prod-name', text: l.producto }), h('div', { class: 'prod-meta' }, est, h('span', { class: 'num', text: `Pedido ${fmtNum(l.cantidad, l.unidad)}` }))),
      h('div', { class: 'prod-control' }, st));
  }

  function pintar() {
    fill(lista);
    if (!ordenes) { lista.append(skeleton(4)); return; }
    if (!ordenes.length && !b.extras.length) {
      lista.append(empty({ icon: 'truck', title: 'Nada por recibir', text: 'Cuando Compras mande una orden a un proveedor, aparece acá para controlar lo que llega.', action: btn('Llegó algo sin pedido', { kind: 'tinted', onClick: extra }) }));
      return;
    }
    for (const o of ordenes) {
      const todo = btn('Llegó todo', { kind: 'tinted', size: 'sm', icon: 'check', onClick: () => { haptic(); for (const l of o.lineas) b.items[l.id_linea] = l.cantidad; guardar(); pintar(); } });
      lista.append(h('section', { class: 'group' },
        h('div', { class: 'row between', style: 'padding:0 16px 8px' }, h('div', null, h('h2', { class: 'head', text: o.proveedor || 'Sin proveedor' }), h('p', { class: 'note', text: `Orden ${fechaRelativa(o.fecha_hora)} · ${o.lineas.length} ${plural(o.lineas.length, 'producto', 'productos')} · ${o.id_oc.slice(-9)}` })), todo),
        h('div', { class: 'list' }, ...o.lineas.map(lineaFila))));
    }
    if (b.extras.length) {
      lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Llegó sin pedido' }), h('div', { class: 'list' }, ...b.extras.map((x, i) => cell({ title: x.producto, sub: 'Suma al stock, sin orden', value: fmtNum(x.cantidad, x.unidad), valueStrong: true, right: btn('', { icon: 'x', kind: 'plain', size: 'sm', attrs: { 'aria-label': `Quitar ${x.producto}` }, onClick: () => { b.extras.splice(i, 1); guardar(); pintar(); } }) })))));
    }
    lista.append(h('div', { style: 'padding:16px 0 8px' }, btn('Llegó algo que no estaba en la orden', { kind: 'tinted', full: true, icon: 'plus', onClick: extra })));
  }

  function extra() {
    const c = catalogoLocal(local);
    let productos = c.productos || [];
    c.fresh.then(pr => { productos = pr; pintarRes(search.input.value); }).catch(() => {});
    let elegido = null;
    const res = h('div', { class: 'list mt8' });
    const cant = h('input', { class: 'input input-num', inputmode: 'decimal', placeholder: '0', 'aria-label': 'Cantidad que llegó' });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const unidadLbl = h('span', { class: 'note' });
    const search = buscador({ placeholder: 'Buscá el producto', onInput: pintarRes });
    function pintarRes(q) {
      fill(res);
      const n = norm(q);
      const vis = productos.filter(x => !n || norm(x.producto).includes(n)).slice(0, 8);
      if (!vis.length) { res.append(h('p', { class: 'note', style: 'padding:10px 16px', text: productos.length ? 'Sin resultados.' : 'Cargando catálogo…' })); return; }
      for (const x of vis) res.append(cell({ title: x.producto, sub: x.categoria, value: x.unidad, cls: elegido && elegido.codigo === x.codigo ? 'is-selected' : '', onClick: () => { elegido = x; unidadLbl.textContent = `Cantidad en ${x.unidad}`; pintarRes(search.input.value); cant.focus(); } }));
    }
    pintarRes('');
    const s = sheet({ title: 'Llegó sin pedido', body: [search, res, h('div', { class: 'field mt12' }, h('label', null, 'Cantidad que llegó ', unidadLbl), cant), err],
      actions: [btn('Cancelar', { onClick: () => s.close() }), btn('Agregar', { kind: 'primary', onClick: () => {
        const q = parseNum(cant.value);
        if (!elegido) { err.textContent = 'Elegí el producto de la lista.'; return; }
        if (q === null || q <= 0) { err.textContent = 'Poné una cantidad mayor que cero.'; cant.focus(); return; }
        b.extras.push({ codigo: elegido.codigo, producto: elegido.producto, unidad: elegido.unidad, cantidad: q }); guardar(); s.close(); pintar();
      } })] });
  }

  function revisar() {
    const ids = controladas();
    if (!ids.length && !b.extras.length) return;
    const todas = ordenes.flatMap(o => o.lineas);
    const filas = ids.map(id => { const l = todas.find(x => x.id_linea === id); if (!l) return null; const r = recibido(id); return h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: l.producto }), h('div', { class: 'cell-sub small num', text: `Pedido ${fmtNum(l.cantidad, l.unidad)}` })), h('div', { class: 'cell-stack' }, h('span', { class: 'strong num', text: fmtNum(r, l.unidad) }), badge(r >= l.cantidad ? 'Completo' : r === 0 ? 'No llegó' : 'Incompleto', r >= l.cantidad ? 'ok' : r === 0 ? 'bad' : 'warn'))); }).filter(Boolean);
    const extras = b.extras.map(x => h('div', { class: 'cell' }, h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: x.producto }), h('div', { class: 'cell-sub small', text: 'Sin pedido' })), h('div', { class: 'cell-value strong num', text: fmtNum(x.cantidad, x.unidad) })));
    const obs = h('textarea', { class: 'input', placeholder: 'Ej.: llegó en mal estado, lo rechazamos', maxlength: 300 });
    obs.value = b.obs || ''; obs.addEventListener('input', () => { b.obs = obs.value; guardar(); });
    const err = h('div');
    const enviarBtn = btn('Confirmar recepción', { kind: 'primary', icon: 'check', onClick: enviar });
    const incompletas = ids.filter(id => { const l = todas.find(x => x.id_linea === id); return l && recibido(id) < l.cantidad; }).length;
    const s = sheet({ title: 'Revisar recepción', body: [
      filas.length ? h('div', { class: 'list' }, ...filas) : null,
      extras.length ? h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Llegó sin pedido' }), h('div', { class: 'list' }, ...extras)) : null,
      incompletas ? banner(`${incompletas} ${plural(incompletas, 'línea incompleta', 'líneas incompletas')}: Compras ve el faltante. Lo que no controlaste sigue pendiente.`, 'warn', { icon: 'alert' }) : h('p', { class: 'note mt8', text: 'Lo que no controlaste sigue pendiente de recibir.' }),
      h('div', { class: 'field mt12' }, h('label', { text: 'Observaciones (opcional)' }), obs), err
    ], actions: [enviarBtn] });
    async function enviar() {
      const id = b.id && /^REC-/.test(b.id) ? b.id : nuevoId('REC');
      b.id = id; guardar();
      const items = ids.filter(x => todas.some(l => l.id_linea === x)).map(x => ({ id_linea: x, cantidad_recibida: recibido(x) }));
      const payload = { action: 'saveRecepcion', id_operacion: id, local, encargado: S.sesion.encargado, items, extras: b.extras.map(x => ({ codigo: x.codigo, cantidad: x.cantidad })), observaciones: texto(b.obs, 300) };
      enviarBtn.disabled = true; fill(err);
      try {
        const r = await api.enviar({ payload, id, confirmAction: 'getOperacion', titulo: `Recepción de ${local}` });
        draft.borrar(); invalidarLecturasLocal(local); s.close(); p.show(false);
        const resp = r.respuesta || {};
        const txt = r.estado === 'confirmado' && resp.entregadas !== undefined ? `${resp.entregadas} ${plural(resp.entregadas, 'línea completa', 'líneas completas')}, ${resp.incompletas} ${plural(resp.incompletas, 'incompleta', 'incompletas')}${resp.extras ? `, ${resp.extras} sin pedido` : ''}. El stock ya está actualizado.` : 'El stock se actualiza con lo recibido.';
        pantallaFinal(ctx, { estado: r.estado, id, title: 'Recepción confirmada', text: txt, acciones: [btn('Ver detalle', { kind: 'tinted', onClick: () => verOperacion(id) }), btn('Volver a Hoy', { kind: 'primary', onClick: () => ctx.go('hoy') })] });
      } catch (e) {
        enviarBtn.disabled = false; haptic('error');
        if (e.server) { delete b.id; guardar(); }
        fill(err, errorEnvio(e, { reintentar: enviar }));
      }
    }
  }

  let aviso = null;
  function cargar(force) {
    const c = api.cached('getPorRecibir', { local }, { maxAge: force ? 0 : 30000 });
    if (c.data) { ordenes = c.data.ordenes || []; pintar(); } else { ordenes = null; pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { ordenes = d.ordenes || []; limpiarBorrador(); pintar(); ctx.setBadge('recibir', ordenes.length); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => { if (!ordenes) { ordenes = []; pintar(); } if (aviso) aviso.remove(); aviso = banner(e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) }); root.insertBefore(aviso, lista); })
      .finally(() => refresh.classList.remove('is-busy'));
    actualizarPill();
  }
  function limpiarBorrador() {
    const vivas = new Set(ordenes.flatMap(o => o.lineas.map(l => l.id_linea)));
    let cambio = false;
    for (const k of Object.keys(b.items)) if (!vivas.has(k)) { delete b.items[k]; cambio = true; }
    if (cambio) guardar();
  }
  cargar(false);
  return root;
}
