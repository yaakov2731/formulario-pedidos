// Gerencia · Pedidos: borradores de todos los locales por proveedor; editar, aprobar, enviar por WhatsApp, cancelar.
import { mount, h, fmtNum, fmtMoney, groupBy, porTexto, fechaCorta, ESTADOS } from './util.js';
import { swr, ordenesPorEstado, actualizarOrden, actualizarItem, borrarItem, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, banner, toast, stepper, icon, hoja } from './ui.js';
import { imagenOrden } from './orden-imagen.js';
import { puedeCompartirArchivos } from './aviso.js';

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

  // Junta los productos de las órdenes: por local (separado) o sumados entre locales (junto).
  const armarBloques = (os, junto) => {
    const sumar = (lista) => {
      const m = new Map();
      for (const o of lista) for (const i of o.orden_items) {
        const x = m.get(i.producto_id) || { producto_id: i.producto_id, cant: 0, porLocal: new Map() };
        x.cant += Number(i.cantidad_pedida);
        x.porLocal.set(o.local_id, (x.porLocal.get(o.local_id) || 0) + Number(i.cantidad_pedida));
        m.set(i.producto_id, x);
      }
      return [...m.values()].sort((a, b) => porTexto(nombreProd(a), nombreProd(b))).map(x => ({
        cant: fmtNum(x.cant, 3), unidad: unidad(x), nombre: nombreProd(x),
        detalle: junto && x.porLocal.size > 1 ? [...x.porLocal].map(([lid, c]) => `${nombreLocal(lid)} ${fmtNum(c, 3)}`).join(' · ') : '',
      }));
    };
    if (junto) return [{ titulo: 'Pedido total', lineas: sumar(os) }];
    return [...groupBy(os, o => o.local_id)].sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0])))
      .map(([lid, lista]) => ({ titulo: nombreLocal(lid), lineas: sumar(lista) }));
  };

  const textoWA = (prov, bloques, fecha) => {
    const partes = bloques.map(b => `*${b.titulo}*\n${b.lineas.map(l => `• ${l.cant} ${l.unidad || ''} ${l.nombre}`.replace(/\s+/g, ' ') + (l.detalle ? ` (${l.detalle})` : '')).join('\n')}`);
    const n = bloques.reduce((a, b) => a + b.lineas.length, 0);
    return `Hola ${prov.nombre}! Te paso el pedido de *Docks del Puerto* del ${fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}:\n\n${partes.join('\n\n')}\n\nTotal: ${n} ${n === 1 ? 'producto' : 'productos'}. ¡Gracias!`;
  };

  // Hoja para mandar el pedido al proveedor: imagen con el logo + mensaje. Lo envía siempre una persona.
  function abrirEnvio(prov, os, alEnviar) {
    const locales = new Set(os.map(o => o.local_id)).size;
    const fecha = new Date();
    let junto = false, file = null, urlImg = null, version = 0;
    const seg = locales > 1 ? h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Cómo mandar el pedido' }) : null;
    const vista = h('div', { class: 'orden-img', 'aria-live': 'polite' }, h('p', { class: 'sub', text: 'Armando la copia del pedido…' }));
    const txt = h('div', { class: 'aviso-txt', 'data-aviso': '' });
    const acciones = h('div', { class: 'form' });
    const cuerpo = h('div', { class: 'form' },
      h('p', { class: 'sub', text: `Para ${prov.nombre}${prov.whatsapp ? ' · ' + prov.whatsapp : ''}` }), seg, vista, txt, acciones);
    const { cerrar } = hoja('Enviar pedido por WhatsApp', cuerpo, { onClose: () => { if (urlImg) URL.revokeObjectURL(urlImg); } });
    const nombreArchivo = `pedido-${prov.nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${fecha.toISOString().slice(0, 10)}.png`;

    async function enviado() { try { await alEnviar(); } catch (x) { toast('Se envió, pero no pude marcarlo como enviado: ' + mensajeError(x), 'error'); } cerrar(); }

    async function armar() {
      const v = ++version;
      if (seg) seg.replaceChildren(...[[false, 'Separado por local'], [true, 'Todo junto']].map(([j, t]) => h('button', {
        class: 'seg-b' + (junto === j ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': junto === j ? 'true' : 'false', text: t,
        on: { click: () => { if (junto !== j) { junto = j; armar(); } } } })));
      const bloques = armarBloques(os, junto);
      const texto = textoWA(prov, bloques, fecha);
      txt.textContent = texto;
      file = null;
      try {
        const blob = await imagenOrden({ proveedor: prov.nombre, fecha, bloques });
        if (v !== version) return;
        file = new File([blob], nombreArchivo, { type: 'image/png' });
        if (urlImg) URL.revokeObjectURL(urlImg);
        urlImg = URL.createObjectURL(file);
        vista.replaceChildren(h('img', { src: urlImg, alt: `Copia del pedido para ${prov.nombre}` }));
      } catch (_e) { if (v === version) vista.replaceChildren(banner('No se pudo armar la imagen. Podés mandar solo el mensaje.', 'warn')); }

      const lista = [];
      if (puedeCompartirArchivos(file)) {
        lista.push(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', 'data-accion': 'compartir', on: { click: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { await navigator.share({ files: [file], text: texto }); await enviado(); }
          catch (x) { b.disabled = false; if (x && x.name === 'AbortError') toast('Se canceló el envío.', 'info'); else toast('No se pudo compartir: ' + mensajeError(x), 'error'); }
        } } }, icon('whatsapp', 20), h('span', { text: 'Compartir por WhatsApp con la imagen' })));
      } else {
        const digitos = String(prov.whatsapp || '').replace(/\D/g, '');
        if (!digitos) lista.push(banner(`${prov.nombre} no tiene WhatsApp cargado. Cargalo en Proveedores.`, 'warn'));
        lista.push(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', disabled: !digitos, 'data-accion': 'wa', on: { click: async () => {
          window.open(`https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
          await enviado();
        } } }, icon('whatsapp', 20), h('span', { text: 'Abrir WhatsApp con el mensaje' })));
        if (file) lista.push(banner('En la computadora WhatsApp no recibe la imagen sola: descargala y adjuntala en el chat.', 'info'));
      }
      if (urlImg && file) lista.push(h('a', { class: 'btn btn-ghost btn-block', href: urlImg, download: nombreArchivo, 'data-accion': 'descargar' }, h('span', { text: 'Descargar la imagen' })));
      if (v === version) acciones.replaceChildren(...lista);
    }
    armar();
  }

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
    const btnWA = h('button', { class: 'btn btn-primary', type: 'button', disabled: sinProv, on: { click: async () => {
      try { await flush(); } catch (x) { return toast(mensajeError(x), 'error'); }
      abrirEnvio(prov || { nombre }, os.filter(o => o.orden_items.length), async () => { await cambiarEstado(os, 'enviada'); toast(`${nombre}: marcado como enviado`, 'ok'); pintar(); });
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
