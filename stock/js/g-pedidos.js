// Gerencia · Pedidos: borradores de todos los locales por proveedor; editar, aprobar, enviar por WhatsApp, cancelar.
import { mount, h, fmtNum, fmtMoney, groupBy, porTexto, fechaCorta, ESTADOS } from './util.js';
import { swr, ordenesPorEstado, actualizarOrden, actualizarItem, borrarItem, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, banner, toast, stepper, icon } from './ui.js';

const SIN = '__sin__';

export async function render(root, ctx) {
  let ordenes = [];
  const pend = new Map(); // item.id -> { qty, timer }

  const flush = async () => {
    const jobs = [];
    for (const [id, p] of pend) { clearTimeout(p.timer); jobs.push(p.qty > 0 ? actualizarItem(id, p.qty) : borrarItem(id)); }
    pend.clear();
    await Promise.all(jobs);
  };
  const cambiarQty = (o, item, v) => {
    item.cantidad_pedida = v;
    if (v === 0) o.orden_items = o.orden_items.filter(i => i.id !== item.id);
    const prev = pend.get(item.id); if (prev) clearTimeout(prev.timer);
    const t = setTimeout(async () => { pend.delete(item.id); try { if (v > 0) await actualizarItem(item.id, v); else await borrarItem(item.id); } catch (e) { toast(mensajeError(e), 'error'); } }, 400);
    pend.set(item.id, { qty: v, timer: t });
    if (v === 0) pintar();
  };

  const unidad = (it) => { const p = G.prods.get(it.producto_id); return p ? p.unidad_compra : ''; };
  const nombreProd = (it) => { const p = G.prods.get(it.producto_id); return p ? p.nombre : 'Producto'; };

  const textoWA = (prov, os) => {
    const porLocal = groupBy(os, o => o.local_id);
    const bloques = [...porLocal].map(([lid, lista]) => {
      const lineas = lista.flatMap(o => o.orden_items).map(i => `- ${fmtNum(i.cantidad_pedida, 3)} ${unidad(i) || ''} ${nombreProd(i)}`.replace(/\s+/g, ' '));
      return `*${nombreLocal(lid)}*\n${lineas.join('\n')}`;
    });
    return `Hola ${prov.nombre}! Pedido de Docks del Puerto:\n\n${bloques.join('\n\n')}\n\nGracias!`;
  };

  const cambiarEstado = async (os, estado) => { await Promise.all(os.map(o => actualizarOrden(o.id, { estado }))); os.forEach(o => { o.estado = estado; }); };

  const total = (os) => os.flatMap(o => o.orden_items).reduce((s, i) => s + i.cantidad_pedida * (G.precios.get(i.producto_id) || 0), 0);

  function tarjeta(provId, os) {
    const sinProv = provId === SIN;
    const prov = sinProv ? null : G.provs.get(provId);
    const nombre = sinProv ? 'Sin proveedor' : (prov ? prov.nombre : 'Proveedor');
    const tot = total(os);
    const min = prov && prov.pedido_minimo ? Number(prov.pedido_minimo) : 0;
    const hayBorrador = os.some(o => o.estado === 'borrador');
    const selProv = sinProv ? h('select', { class: 'input', 'aria-label': 'Asignar proveedor', on: { change: async (e) => {
      const v = e.target.value; if (!v) return;
      e.target.disabled = true;
      try { await flush(); await Promise.all(os.map(o => actualizarOrden(o.id, { proveedor_id: v }))); os.forEach(o => { o.proveedor_id = v; }); toast('Proveedor asignado', 'ok'); pintar(); }
      catch (x) { toast(mensajeError(x), 'error'); e.target.disabled = false; }
    } } }, h('option', { value: '', text: 'Asignar proveedor…' }), [...G.provs.values()].filter(p => p.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre)).map(p => h('option', { value: p.id, text: p.nombre }))) : null;
    const btnAprobar = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Aprobar', disabled: sinProv, on: { click: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await flush(); await cambiarEstado(os.filter(o => o.estado === 'borrador'), 'aprobada'); toast(`${nombre}: aprobado`, 'ok'); pintar(); }
      catch (x) { toast(mensajeError(x), 'error'); b.disabled = false; }
    } } });
    const btnWA = h('button', { class: 'btn btn-primary', type: 'button', disabled: sinProv, on: { click: async (e) => {
      const b = e.currentTarget;
      const digitos = String((prov && prov.whatsapp) || '').replace(/\D/g, '');
      if (!digitos) return toast(`${nombre} no tiene WhatsApp cargado.`, 'error');
      try { await flush(); } catch (x) { return toast(mensajeError(x), 'error'); }
      const url = `https://wa.me/${digitos}?text=${encodeURIComponent(textoWA(prov, os))}`;
      window.open(url, '_blank', 'noopener');
      b.disabled = true;
      try { await cambiarEstado(os, 'enviada'); toast(`${nombre}: marcado como enviado`, 'ok'); pintar(); }
      catch (x) { toast(mensajeError(x), 'error'); b.disabled = false; }
    } } }, icon('whatsapp', 18), h('span', { text: 'Enviar por WhatsApp' }));
    return h('section', { class: 'grupo-prov', 'data-prov': nombre },
      h('header', { class: 'gp-head' }, h('h2', { class: 'gp-t', text: nombre }),
        h('span', { class: 'gp-c', text: tot ? `≈ ${fmtMoney(tot)}` : (() => { const n = os.reduce((a, o) => a + o.orden_items.length, 0); return `${n} ${n === 1 ? 'ítem' : 'ítems'}`; })() })),
      min && tot < min ? h('p', { class: 'gp-nota gp-warn', text: `Pedido mínimo ${fmtMoney(min)}: faltan ${fmtMoney(min - tot)}.` }) : null,
      sinProv ? h('p', { class: 'gp-nota gp-warn', text: 'Asigná el proveedor para poder aprobar y enviar.' }) : null,
      selProv,
      prov && !prov.whatsapp ? h('p', { class: 'gp-nota gp-warn', text: 'Sin WhatsApp cargado.' }) : null,
      os.map(o => h('div', { class: 'orden', 'data-orden': o.id },
        h('div', { class: 'orden-h' },
          h('b', { text: nombreLocal(o.local_id) }),
          h('span', { class: 'estado estado-' + o.estado, text: ESTADOS[o.estado] }),
          h('span', { class: 'orden-m', text: `${o.cargado_por_nombre ? 'Cargó ' + o.cargado_por_nombre + ' · ' : ''}${fechaCorta(o.creado_en)}` }),
          o.nota ? h('span', { class: 'orden-nota', text: 'Nota: ' + o.nota }) : null),
        o.orden_items.slice().sort((a, b) => porTexto(nombreProd(a), nombreProd(b))).map(it => h('article', { class: 'prod is-on prod-rev' },
          h('h3', { class: 'prod-n', text: nombreProd(it) }),
          h('p', { class: 'prod-m' }, h('span', { class: 'prod-u', text: unidad(it) || '' })),
          h('div', { class: 'prod-p' }, h('span', { class: 'prod-pl', text: 'Pedir' }), stepper({ value: it.cantidad_pedida, label: `Cantidad de ${nombreProd(it)}`, onChange: (v) => cambiarQty(o, it, v) }).el))),
        h('button', { class: 'btn btn-text btn-danger', type: 'button', text: 'Cancelar este pedido', on: { click: async (e) => {
          if (!confirm(`¿Cancelar el pedido de ${nombreLocal(o.local_id)} a ${nombre}?`)) return;
          e.currentTarget.disabled = true;
          try { await actualizarOrden(o.id, { estado: 'cancelada' }); ordenes = ordenes.filter(x => x.id !== o.id); toast('Pedido cancelado', 'ok'); pintar(); }
          catch (x) { toast(mensajeError(x), 'error'); e.currentTarget.disabled = false; }
        } } }))),
      h('div', { class: 'acciones' }, hayBorrador ? btnAprobar : null, btnWA));
  }

  function pintar() {
    if (!ctx.alive()) return;
    const vivas = ordenes.filter(o => o.orden_items.length);
    const g = groupBy(vivas, o => o.proveedor_id || SIN);
    const provs = [...g.keys()].sort((a, b) => (b === SIN) - (a === SIN) || porTexto((G.provs.get(a) || {}).nombre || '', (G.provs.get(b) || {}).nombre || ''));
    mount(root, 
      h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pedidos' }), h('p', { class: 'sub', text: 'Lo que cargaron los locales, por proveedor' })),
      ...(provs.length ? provs.map(p => tarjeta(p, g.get(p))) : [vacio('No hay pedidos pendientes', 'Cuando un local envíe un pedido aparece acá.')]));
  }

  mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pedidos' })), esqueleto(3));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  await swr('g:ord:pend', () => ordenesPorEstado(['borrador', 'aprobada']), (d) => { if (!pend.size) { ordenes = d; pintar(); } });
  return () => { flush().catch(() => {}); };
}
