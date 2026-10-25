// Gerencia · Recibir: órdenes enviadas; cantidad recibida y precio por ítem; genera movimientos de recepción.
import { mount, h, fmtNum, fmtMoney, parseNum, porTexto, fechaCorta, ESTADOS } from './util.js';
import { swr, ordenesPorEstado, registrarRecepcion, mensajeError } from './api.js';
import { G, cargarG, nombreLocal, refrescarPrecio } from './datos.js';
import { esqueleto, vacio, toast } from './ui.js';

export async function render(root, ctx) {
  let ordenes = [];
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Recibir' }), h('p', { class: 'sub', text: 'Pedidos enviados que esperan mercadería' }));

  function tarjeta(o) {
    const prov = G.provs.get(o.proveedor_id);
    const filas = o.orden_items.slice().sort((a, b) => porTexto((G.prods.get(a.producto_id) || {}).nombre || '', (G.prods.get(b.producto_id) || {}).nombre || '')).map(it => {
      const p = G.prods.get(it.producto_id) || {};
      const falta = Math.max(0, Number(it.cantidad_pedida) - (Number(it.cantidad_recibida) || 0));
      const precioPrevio = G.precios.has(it.producto_id) ? G.precios.get(it.producto_id) : null;
      const inQty = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: fmtNum(falta, 3) || '0', 'aria-label': `Cantidad recibida de ${p.nombre}` });
      const inPrecio = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: precioPrevio === null ? '' : String(precioPrevio).replace('.', ','), placeholder: '0', 'aria-label': `Costo unitario de ${p.nombre}` });
      return { it, p, precioPrevio, inQty, inPrecio, falta,
        el: h('article', { class: 'prod prod-rec' },
          h('h3', { class: 'prod-n', text: p.nombre || 'Producto' }),
          h('p', { class: 'prod-m' }, `Pedido ${fmtNum(it.cantidad_pedida, 3)} ${p.unidad_compra || ''}`, (Number(it.cantidad_recibida) ? ` · ya llegó ${fmtNum(it.cantidad_recibida, 3)}` : '')),
          h('div', { class: 'rec-campos' },
            h('label', { class: 'rec-c' }, h('span', { text: 'Llegó' }), inQty),
            h('label', { class: 'rec-c' }, h('span', { text: 'Costo unitario' }), inPrecio))) };
    });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Confirmar recepción', on: { click: async () => {
      const lineas = filas.map(f => {
        const qty = parseNum(f.inQty.value); const pr = parseNum(f.inPrecio.value);
        return { item: f.it, qty: qty === null || qty < 0 ? 0 : qty, precio: pr === null ? null : pr, precioPrevio: f.precioPrevio, factor: f.p.factor_conversion };
      });
      const total = lineas.map(l => (Number(l.item.cantidad_recibida) || 0) + l.qty);
      const completa = filas.every((f, i) => total[i] >= Number(f.it.cantidad_pedida));
      if (!lineas.some(l => l.qty > 0) && !confirm('No cargaste ninguna cantidad. ¿Cerrar la orden igual?')) return;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await registrarRecepcion(o, lineas, completa ? 'recibida' : 'parcial');
        lineas.forEach(l => { if (l.qty > 0 && l.precio !== null) refrescarPrecio(l.item.producto_id, l.precio); });
        toast(completa ? 'Recepción completa. Stock actualizado.' : 'Recepción parcial guardada.', 'ok');
        ordenes = completa ? ordenes.filter(x => x.id !== o.id) : (o.estado = 'parcial', lineas.forEach(l => { l.item.cantidad_recibida = (Number(l.item.cantidad_recibida) || 0) + l.qty; }), ordenes);
        pintar();
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Confirmar recepción'; }
    } } });
    return h('section', { class: 'grupo-prov', 'data-orden': o.id },
      h('header', { class: 'gp-head' }, h('h2', { class: 'gp-t', text: prov ? prov.nombre : 'Proveedor' }), h('span', { class: 'estado estado-' + o.estado, text: ESTADOS[o.estado] })),
      h('p', { class: 'orden-m', text: `${nombreLocal(o.local_id)} · ${fechaCorta(o.creado_en)}` }),
      filas.map(f => f.el), btn);
  }

  function pintar() {
    if (!ctx.alive()) return;
    mount(root, cab, ...(ordenes.length ? ordenes.map(tarjeta) : [vacio('Nada para recibir', 'Los pedidos enviados por WhatsApp aparecen acá.')]));
  }
  mount(root, cab, esqueleto(3));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  await swr('g:ord:env', () => ordenesPorEstado(['enviada', 'parcial']), (d) => { ordenes = d; pintar(); });
}
