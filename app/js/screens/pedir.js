// Pedir: catálogo del local con sugerido, stepper por producto, líneas libres, revisión y envío.
import { h, icon, largeTitle, buscador, chip, stepper, btn, sheet, empty, skeleton, banner, toast, segmented, input, select, field, haptic, cell, group, badge, fill } from '../ui.js';
import { norm, fmtNum, nuevoId, texto, parseNum, UNIDADES, agrupar, ordenarTexto, plural, isoDia, inputNum } from '../util.js';
import { catalogoLocal, borrador, pill, pantallaFinal, errorEnvio, invalidarLecturasLocal, quienCarga } from '../flujo.js';
import { verPedido } from '../detalles.js';
import * as api from '../api.js';

export default async function pedir(ctx) {
  const { S } = ctx;
  const local = S.sesion.local;
  const root = h('div');
  const draft = borrador('pedido', local);
  const b = draft.leer({ items: {}, libres: [], prioridad: 'Normal', fecha_entrega: '', notas: '' });
  b.items = b.items || {}; b.libres = b.libres || [];

  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar catálogo', onClick: () => cargar(true) }, icon('refresh', 24));
  ctx.topbarSet({ right: refresh });
  root.append(largeTitle({ title: 'Pedir', sub: local, topbar: ctx.topbar }));

  let productos = null;
  let filtro = { q: '', cat: 'todos' };
  const search = buscador({ placeholder: 'Buscar producto', onInput: (v) => { filtro.q = v; pintarLista(); } });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const lista = h('div', { class: 'mt8' });
  root.append(h('div', { class: 'mt8' }, search), chips, lista);

  const p = pill({ label: 'Revisar', onClick: revisar });
  ctx.onLeave(() => p.remove());

  function guardar() { draft.guardar(b); actualizarPill(); }
  function cantidadDe(codigo) { const v = b.items[codigo]; return v === undefined || v === null ? null : v; }
  function totalLineas() { return Object.values(b.items).filter(v => v !== null && v > 0).length + b.libres.length; }
  function actualizarPill() {
    const n = totalLineas();
    p.set(`${n} ${plural(n, 'producto', 'productos')}`, b.prioridad === 'Urgente' ? 'Urgente' : '');
    p.show(n > 0);
  }

  function pintarChips() {
    fill(chips);
    const cats = [...new Set(productos.map(x => x.categoria || 'Sin categoría'))].sort(ordenarTexto);
    const sug = productos.filter(x => x.sugerido > 0).length;
    const mk = (id, label, ic) => chip(label, { on: filtro.cat === id, icon: ic, onClick: () => { filtro.cat = id; pintarChips(); pintarLista(); } });
    chips.append(mk('todos', 'Todos'));
    if (sug) chips.append(mk('sugeridos', `Sugeridos (${sug})`, 'sparkle'));
    chips.append(mk('elegidos', 'En el pedido'));
    for (const c of cats) chips.append(mk('cat:' + c, c));
  }

  function filaProducto(pr) {
    const q = cantidadDe(pr.codigo);
    const st = stepper({ value: q, unidad: pr.unidad, label: `${pr.producto} en ${pr.unidad}`, onChange: (v) => { if (v === null || v <= 0) delete b.items[pr.codigo]; else b.items[pr.codigo] = v; guardar(); sugBtn && sugBtn.classList.toggle('is-applied', v !== null && v === pr.sugerido); } });
    const metaPartes = [];
    if (pr.stock_actual !== null && pr.stock_actual !== undefined) metaPartes.push(h('span', { class: 'num', text: `Quedan ${fmtNum(pr.stock_actual, pr.unidad)}` }));
    else metaPartes.push(h('span', { text: `Sin contar · ${pr.unidad}` }));
    if (pr.pedido_abierto > 0) metaPartes.push(h('span', { class: 'num', text: `${fmtNum(pr.pedido_abierto)} en camino` }));
    let sugBtn = null;
    if (pr.sugerido > 0) {
      sugBtn = h('button', { class: `prod-sug${q === pr.sugerido ? ' is-applied' : ''}`, type: 'button', 'aria-label': `Aplicar sugerido ${fmtNum(pr.sugerido, pr.unidad)} de ${pr.producto}` }, icon('sparkle', 14), h('span', { text: `Pedir ${fmtNum(pr.sugerido, pr.unidad)}` }));
      sugBtn.addEventListener('click', () => { haptic(); st.setValue(pr.sugerido); });
      metaPartes.unshift(sugBtn);
    }
    return h('div', { class: 'prod', dataset: { codigo: pr.codigo } },
      h('div', { class: 'prod-body' }, h('div', { class: 'prod-name', text: pr.producto }), h('div', { class: 'prod-meta' }, ...metaPartes)),
      h('div', { class: 'prod-control' }, st));
  }

  function pintarLista() {
    fill(lista);
    if (!productos) { lista.append(skeleton(6)); return; }
    if (!productos.length) {
      lista.append(empty({ icon: 'book', title: 'Este local no tiene catálogo', text: 'Gerencia lo carga en Catálogo. Mientras tanto podés pedir productos sueltos.', action: btn('Pedir un producto suelto', { kind: 'tinted', onClick: lineaLibre }) }));
      return;
    }
    const q = norm(filtro.q);
    let vis = productos;
    if (filtro.cat === 'sugeridos') vis = vis.filter(x => x.sugerido > 0);
    else if (filtro.cat === 'elegidos') vis = vis.filter(x => cantidadDe(x.codigo) > 0);
    else if (filtro.cat.startsWith('cat:')) vis = vis.filter(x => (x.categoria || 'Sin categoría') === filtro.cat.slice(4));
    if (q) vis = vis.filter(x => norm(x.producto).includes(q) || norm(x.codigo).includes(q) || norm(x.proveedor).includes(q));
    if (!vis.length && !b.libres.length) {
      lista.append(empty({ icon: 'search', title: q ? `Nada con “${filtro.q}”` : 'Nada por acá', text: q ? 'Probá con otra palabra o pedilo como producto suelto.' : '', action: q ? btn('Pedir producto suelto', { kind: 'tinted', onClick: () => lineaLibre(filtro.q) }) : null }));
    } else {
      const grupos = agrupar(vis, x => x.categoria || 'Sin categoría');
      const nombres = filtro.cat === 'todos' || filtro.cat === 'sugeridos' || filtro.cat === 'elegidos' ? [...grupos.keys()].sort(ordenarTexto) : [...grupos.keys()];
      for (const g of nombres) {
        const items = grupos.get(g).slice().sort((a, c) => ordenarTexto(a.producto, c.producto));
        lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: g }), h('div', { class: 'list' }, ...items.map(filaProducto))));
      }
    }
    if (b.libres.length && (filtro.cat === 'todos' || filtro.cat === 'elegidos') && !q) {
      lista.append(h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Productos sueltos (sin proveedor asignado)' }), h('div', { class: 'list' }, ...b.libres.map((l, i) => cell({
        title: l.producto, sub: 'Compras le asigna proveedor', value: fmtNum(l.cantidad, l.unidad), valueStrong: true,
        right: btn('', { icon: 'x', kind: 'plain', size: 'sm', attrs: { 'aria-label': `Quitar ${l.producto}` }, onClick: () => { b.libres.splice(i, 1); guardar(); pintarLista(); } })
      })))));
    }
    lista.append(h('div', { style: 'padding:16px 0 8px' }, btn('Pedir un producto que no está en la lista', { kind: 'tinted', full: true, icon: 'plus', onClick: () => lineaLibre() })));
  }

  function lineaLibre(nombreInicial = '') {
    const nombre = input({ value: nombreInicial, placeholder: 'Ej.: pan árabe', maxlength: 80, autocapitalize: 'sentences' });
    const uni = select(UNIDADES, 'unidad');
    const cant = input({ inputmode: 'decimal', class: 'input input-num', placeholder: '0' });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const s = sheet({
      title: 'Producto fuera de la lista',
      body: [field('Producto', nombre), h('div', { class: 'field-row mt12' }, field('Unidad', uni), field('Cantidad', cant)), err, h('p', { class: 'note mt8', text: 'Va al pedido sin proveedor. Compras se lo asigna.' })],
      actions: [btn('Cancelar', { onClick: () => s.close() }), btn('Agregar al pedido', { kind: 'primary', onClick: () => {
        const n = texto(nombre.value, 80); const c = parseNum(cant.value);
        if (!n) { err.textContent = 'Escribí el nombre del producto.'; nombre.focus(); return; }
        if (c === null || c <= 0) { err.textContent = 'Poné una cantidad mayor que cero.'; cant.focus(); return; }
        b.libres.push({ producto: n, unidad: uni.value, cantidad: c }); guardar(); s.close(); pintarLista(); toast(`${n} agregado`, 'ok');
      } })]
    });
    setTimeout(() => (nombreInicial ? cant : nombre).focus(), 350);
  }

  function revisar() {
    const elegidos = productos ? productos.filter(x => cantidadDe(x.codigo) > 0) : [];
    const n = elegidos.length + b.libres.length;
    if (!n) return;
    const lineas = h('div', { class: 'list' });
    const pintarLineas = () => {
      fill(lineas);
      for (const pr of productos.filter(x => cantidadDe(x.codigo) > 0)) {
        lineas.append(h('div', { class: 'prod' },
          h('div', { class: 'prod-body' }, h('div', { class: 'prod-name', text: pr.producto }), h('div', { class: 'prod-meta' }, h('span', { text: pr.proveedor || 'Sin proveedor' }))),
          h('div', { class: 'prod-control' }, h('span', { class: 'prod-unit', text: pr.unidad }), stepper({ value: cantidadDe(pr.codigo), unidad: pr.unidad, label: pr.producto, onChange: (v) => { if (v === null || v <= 0) { delete b.items[pr.codigo]; guardar(); pintarLineas(); pintarLista(); } else { b.items[pr.codigo] = v; guardar(); } actualizarTotales(); } }))));
      }
      for (const [i, l] of b.libres.entries()) {
        lineas.append(h('div', { class: 'prod' },
          h('div', { class: 'prod-body' }, h('div', { class: 'prod-name', text: l.producto }), h('div', { class: 'prod-meta' }, h('span', { text: 'Sin proveedor (lo asigna Compras)' }))),
          h('div', { class: 'prod-control' }, h('span', { class: 'strong num', text: fmtNum(l.cantidad, l.unidad) }), btn('', { icon: 'x', kind: 'plain', size: 'sm', attrs: { 'aria-label': `Quitar ${l.producto}` }, onClick: () => { b.libres.splice(i, 1); guardar(); pintarLineas(); pintarLista(); actualizarTotales(); } }))));
      }
      if (!lineas.children.length) s.close();
    };
    pintarLineas();
    const totalEl = h('p', { class: 'note right mt8' });
    const actualizarTotales = () => { const k = totalLineas(); totalEl.textContent = `${k} ${plural(k, 'producto', 'productos')}`; };
    actualizarTotales();
    const prio = segmented([{ value: 'Normal', label: 'Normal' }, { value: 'Urgente', label: 'Urgente' }], b.prioridad || 'Normal', (v) => { b.prioridad = v; guardar(); }, 'Prioridad');
    const fecha = input({ type: 'date', value: b.fecha_entrega || '', min: isoDia(new Date()) });
    fecha.addEventListener('change', () => { b.fecha_entrega = fecha.value; guardar(); });
    const notas = h('textarea', { class: 'input', placeholder: 'Ej.: no pedir pan árabe esta semana', maxlength: 500 });
    notas.value = b.notas || '';
    notas.addEventListener('input', () => { b.notas = notas.value; guardar(); });
    const err = h('div');
    const enviarBtn = btn('Enviar pedido', { kind: 'primary', icon: 'send', onClick: enviar });
    const s = sheet({
      title: 'Revisar pedido',
      body: [lineas, totalEl,
        h('section', { class: 'group' }, h('h2', { class: 'group-title', text: 'Prioridad' }), prio),
        h('div', { class: 'mt12' }, field('Fecha de entrega (opcional)', fecha)),
        h('div', { class: 'mt12' }, field('Notas para Compras (opcional)', notas)),
        quienCarga(ctx),
        err],
      actions: [enviarBtn]
    });
    async function enviar() {
      const id = b.id_pedido && /^PED-/.test(b.id_pedido) ? b.id_pedido : nuevoId('PED');
      b.id_pedido = id; guardar();
      const items = [
        ...productos.filter(x => cantidadDe(x.codigo) > 0).map(x => ({ codigo: x.codigo, cantidad: cantidadDe(x.codigo) })),
        ...b.libres.map(l => ({ producto: l.producto, unidad: l.unidad, cantidad: l.cantidad }))
      ];
      if (!items.length) { s.close(); return; }
      const payload = { action: 'savePedido', id_pedido: id, local, encargado: S.sesion.encargado, prioridad: b.prioridad || 'Normal', fecha_entrega: b.fecha_entrega || '', notas: texto(b.notas, 500), items };
      enviarBtn.disabled = true; fill(err);
      try {
        const r = await api.enviar({ payload, id, confirmAction: 'getPedido', titulo: `Pedido de ${local} (${items.length} ${plural(items.length, 'producto', 'productos')})` });
        draft.borrar(); invalidarLecturasLocal(local); s.close(); haptic('success');
        p.show(false);
        pantallaFinal(ctx, {
          estado: r.estado, id,
          title: 'Pedido enviado',
          text: `${items.length} ${plural(items.length, 'producto', 'productos')} para ${local}. Compras lo ve ahora mismo.`,
          acciones: [btn('Ver el pedido', { kind: 'tinted', onClick: () => verPedido(id) }), btn('Volver a Hoy', { kind: 'primary', onClick: () => ctx.go('hoy') })]
        });
      } catch (e) {
        enviarBtn.disabled = false; haptic('error');
        if (e.server) { delete b.id_pedido; guardar(); }
        fill(err, errorEnvio(e, { reintentar: enviar }));
        err.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  let aviso = null;
  function cargar(force) {
    const c = catalogoLocal(local, { force });
    if (c.productos) { productos = c.productos; pintarChips(); pintarLista(); } else { productos = null; pintarLista(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(pr => { productos = pr; pintarChips(); pintarLista(); if (aviso) { aviso.remove(); aviso = null; } })
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
