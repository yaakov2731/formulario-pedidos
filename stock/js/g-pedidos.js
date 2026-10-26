// Gerencia · Pedidos, en dos vistas separadas:
// "De los locales": tabla de lo que mandó cada local (cuándo, local, quién, qué productos, a qué proveedor, estado);
//   se abre una fila para ver y corregir cantidades y proveedor de cada producto.
// "Por proveedor": arma el envío de cada proveedor sumando todos los locales; cada producto se puede pasar a otro
//   proveedor (con proveedor sugerido) y se aprueba y manda por WhatsApp.
import { mount, h, norm, fmtNum, fmtMoney, parseNum, groupBy, porTexto, fechaCorta, lsGet, lsSet, hoyISO, sumarDias, ESTADOS } from './util.js';
import { swr, ordenesPorEstado, ordenesHistorial, actualizarOrden, actualizarItem, borrarItem, moverItem, crearOrdenSolo, guardarProducto, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, banner, toast, icon, hoja } from './ui.js';
import { imagenOrden } from './orden-imagen.js';
import { puedeCompartirArchivos } from './aviso.js';

const SIN = '__sin__';
const VIVAS = ['borrador', 'aprobada'];
const RANGO = ['borrador', 'aprobada', 'enviada', 'parcial', 'recibida'];
const JUNTOS_MS = 5 * 60 * 1000; // órdenes del mismo local y encargado con menos de 5 min = un mismo envío

export async function render(root, ctx) {
  let ordenes = [];
  let vista = lsGet('g:ped:vista', 'locales') === 'proveedor' ? 'proveedor' : 'locales';
  let filtro = 'revisar';
  let filtroLocal = '';
  let recordar = lsGet('g:ped:recordar', true) !== false;
  const abiertos = new Set();
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

  const prodDe = (it) => G.prods.get(it.producto_id);
  const unidad = (it) => { const p = prodDe(it); return p ? p.unidad_compra : ''; };
  const nombreProd = (it) => { const p = prodDe(it); return p ? p.nombre : 'Producto'; };
  const nombreProv = (id) => (id && G.provs.get(id) ? G.provs.get(id).nombre : 'Sin proveedor');
  const provsActivos = () => [...G.provs.values()].filter(p => p.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));
  const vivas = () => ordenes.filter(o => VIVAS.includes(o.estado) && o.orden_items.length);
  const editable = (o) => VIVAS.includes(o.estado);
  const cantTxt = (it) => `${fmtNum(it.cantidad_pedida, 3)} ${unidad(it) || ''}`.trim();

  // ---------- proveedor sugerido ----------
  // 1) el del catálogo; 2) el que tiene el mismo producto en otro local; 3) el del último pedido enviado con ese producto.
  function sugerir(productoId) {
    const p = G.prods.get(productoId);
    if (!p) return null;
    if (p.proveedor_id && G.provs.has(p.proveedor_id)) return { id: p.proveedor_id, motivo: 'del catálogo' };
    const n = norm(p.nombre);
    const cuenta = new Map();
    for (const x of G.prods.values()) if (x.id !== p.id && x.proveedor_id && G.provs.has(x.proveedor_id) && norm(x.nombre) === n) {
      const c = cuenta.get(x.proveedor_id) || { n: 0, local: x.local_id }; c.n++; cuenta.set(x.proveedor_id, c);
    }
    if (cuenta.size) {
      const [id, c] = [...cuenta].sort((a, b) => b[1].n - a[1].n)[0];
      return { id, motivo: `como en ${nombreLocal(c.local)}` };
    }
    const hist = ordenes.filter(o => o.proveedor_id && !VIVAS.includes(o.estado) && o.orden_items.some(i => i.producto_id === productoId))
      .sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    if (hist && G.provs.has(hist.proveedor_id)) return { id: hist.proveedor_id, motivo: 'último pedido' };
    return null;
  }

  // ---------- mover productos a otro proveedor ----------
  // pares: [{ o, it }]. Si se mueve la orden entera, solo cambia su proveedor; si no, los ítems pasan a una orden del
  // mismo local y encargado para ese proveedor (se crea si no existe, con la misma fecha para que siga en el mismo envío).
  async function mover(pares, provId) {
    await flush();
    for (const [, ps] of groupBy(pares, p => p.o.id)) {
      const o = ps[0].o;
      if (ps.length === o.orden_items.length) {
        await actualizarOrden(o.id, { proveedor_id: provId });
        o.proveedor_id = provId;
        continue;
      }
      let t = ordenes.find(x => x !== o && x.local_id === o.local_id && x.proveedor_id === provId && x.estado === 'borrador'
        && (x.cargado_por_nombre || '') === (o.cargado_por_nombre || '') && Math.abs(new Date(x.creado_en) - new Date(o.creado_en)) < JUNTOS_MS);
      if (!t) {
        const nueva = { local_id: o.local_id, proveedor_id: provId, estado: 'borrador', cargado_por_nombre: o.cargado_por_nombre || null, nota: o.nota || null, creado_en: o.creado_en };
        const id = await crearOrdenSolo(nueva);
        t = { ...nueva, id, orden_items: [] };
        ordenes.push(t);
      }
      for (const { it } of ps) {
        const ya = t.orden_items.find(i => i.producto_id === it.producto_id);
        if (ya) {
          ya.cantidad_pedida = Number(ya.cantidad_pedida) + Number(it.cantidad_pedida);
          await actualizarItem(ya.id, ya.cantidad_pedida);
          await borrarItem(it.id);
        } else {
          await moverItem(it.id, t.id);
          t.orden_items.push(it);
        }
        o.orden_items = o.orden_items.filter(i => i.id !== it.id);
      }
    }
    if (recordar) {
      const ids = [...new Set(pares.map(p => p.it.producto_id))].filter(id => { const p = G.prods.get(id); return p && p.proveedor_id !== provId; });
      await Promise.all(ids.map(async id => { await guardarProducto(id, { proveedor_id: provId }); G.prods.get(id).proveedor_id = provId; }));
    }
  }
  async function moverYAvisar(pares, provId, ctl) {
    if (ctl) ctl.disabled = true;
    try {
      await mover(pares, provId);
      const n = new Set(pares.map(p => p.it.producto_id)).size;
      toast(`${n === 1 ? nombreProd(pares[0].it) : n + ' productos'} → ${nombreProv(provId)}`, 'ok');
    } catch (x) { toast(mensajeError(x), 'error'); }
    pintar();
  }

  const selectorProv = (actual, alElegir, etiqueta) => h('select', { class: 'input input-sm sel-prov' + (actual ? '' : ' is-sin'), 'aria-label': etiqueta, on: { change: (e) => {
    const v = e.target.value; if (!v || v === actual) return; alElegir(v, e.target);
  } } }, actual ? null : h('option', { value: '', text: 'Elegir proveedor…' }),
  provsActivos().map(p => h('option', { value: p.id, text: p.nombre, selected: p.id === actual })));

  const botonSugerido = (sug, alUsar) => sug ? h('button', { class: 'sug', type: 'button', title: 'Proveedor sugerido ' + sug.motivo, on: { click: (e) => alUsar(sug.id, e.currentTarget) } },
    h('span', { class: 'sug-k', text: 'Sugerido' }), h('b', { text: nombreProv(sug.id) }), h('span', { class: 'sug-m', text: sug.motivo })) : null;

  // ---------- envíos de cada local (una fila de la tabla) ----------
  function envios(os) {
    const out = [];
    for (const o of os.slice().sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
      const t = new Date(o.creado_en).getTime();
      const e = out.find(x => x.local_id === o.local_id && x.quien === (o.cargado_por_nombre || '') && t - x.t < JUNTOS_MS);
      if (e) e.ordenes.push(o);
      else out.push({ key: o.id, local_id: o.local_id, quien: o.cargado_por_nombre || '', t, creado_en: o.creado_en, nota: o.nota, ordenes: [o] });
    }
    for (const e of out) {
      e.ordenes = e.ordenes.filter(o => o.orden_items.length);
      e.items = e.ordenes.flatMap(o => o.orden_items.map(it => ({ o, it }))).sort((a, b) => porTexto(nombreProd(a.it), nombreProd(b.it)));
      e.estado = RANGO.find(s => e.ordenes.some(o => o.estado === s)) || 'borrador';
      e.nota = e.nota || (e.ordenes.find(o => o.nota) || {}).nota || '';
    }
    return out.filter(e => e.items.length).reverse();
  }
  const pasaFiltro = (e) => (filtroLocal ? e.local_id === filtroLocal : true) && (
    filtro === 'todos' ? true
      : filtro === 'revisar' ? e.ordenes.some(o => o.estado === 'borrador')
        : filtro === 'aprobados' ? e.estado === 'aprobada'
          : ['enviada', 'parcial', 'recibida'].includes(e.estado));

  function detalleEnvio(e) {
    const filas = e.items.map(({ o, it }) => {
      const ed = editable(o);
      const sug = !o.proveedor_id && ed ? sugerir(it.producto_id) : null;
      const inp = ed ? h('input', { class: 'input input-sm num inp-cant', type: 'text', inputmode: 'decimal', value: fmtNum(it.cantidad_pedida, 3), 'aria-label': `Cantidad de ${nombreProd(it)}`,
        on: { focus: (ev) => ev.target.select(), change: (ev) => {
          const n = parseNum(ev.target.value);
          if (n === null || n < 0) { ev.target.value = fmtNum(it.cantidad_pedida, 3); return toast('Poné una cantidad válida.', 'error'); }
          if (n === 0 && !confirm(`¿Sacar ${nombreProd(it)} del pedido?`)) { ev.target.value = fmtNum(it.cantidad_pedida, 3); return; }
          cambiarQty(o, it, n);
        } } }) : null;
      return h('div', { class: 'det-fila', 'data-item': it.id },
        h('div', { class: 'det-prod' }, h('b', { text: nombreProd(it) }), h('span', { class: 'mute', text: unidad(it) || '' })),
        h('div', { class: 'det-cant' }, inp || h('span', { class: 'num', text: cantTxt(it) })),
        h('div', { class: 'det-prov' },
          ed ? selectorProv(o.proveedor_id, (v, sel) => moverYAvisar([{ o, it }], v, sel), `Proveedor de ${nombreProd(it)}`)
            : h('span', { text: nombreProv(o.proveedor_id) }),
          botonSugerido(sug, (v, b) => moverYAvisar([{ o, it }], v, b))),
        h('div', { class: 'det-est' }, h('span', { class: 'estado estado-' + o.estado, text: ESTADOS[o.estado] })));
    });
    const borradores = e.ordenes.filter(o => o.estado === 'borrador');
    const conProv = borradores.filter(o => o.proveedor_id);
    const sinProv = e.ordenes.filter(o => editable(o) && !o.proveedor_id).reduce((a, o) => a + o.orden_items.length, 0);
    return h('div', { class: 'pt-det' },
      e.nota ? h('p', { class: 'pt-nota', text: 'Nota del local: ' + e.nota }) : null,
      h('div', { class: 'det-tabla' },
        h('div', { class: 'det-fila det-h', 'aria-hidden': 'true' }, h('span', { text: 'Producto' }), h('span', { text: 'Cantidad' }), h('span', { text: 'Proveedor' }), h('span', { text: 'Estado' })),
        filas),
      sinProv ? h('p', { class: 'gp-nota gp-warn', text: `${sinProv} ${sinProv === 1 ? 'producto' : 'productos'} sin proveedor: elegilo o tocá el sugerido.` }) : null,
      h('div', { class: 'acciones pt-acc' },
        conProv.length ? h('button', { class: 'btn btn-primary', type: 'button', text: conProv.length === borradores.length ? 'Aprobar pedido' : `Aprobar lo que tiene proveedor`, on: { click: async (ev) => {
          const b = ev.currentTarget; b.disabled = true;
          try { await flush(); await cambiarEstado(conProv, 'aprobada'); toast(`${nombreLocal(e.local_id)}: aprobado`, 'ok'); pintar(); }
          catch (x) { toast(mensajeError(x), 'error'); b.disabled = false; }
        } } }) : null,
        e.ordenes.some(o => o.estado === 'aprobada') ? h('button', { class: 'btn btn-ghost', type: 'button', text: 'Armar envío por proveedor', on: { click: () => { cambiarVista('proveedor'); } } }) : null,
        e.ordenes.some(editable) ? h('button', { class: 'btn btn-text btn-danger', type: 'button', text: 'Cancelar pedido', on: { click: async (ev) => {
          if (!confirm(`¿Cancelar el pedido de ${nombreLocal(e.local_id)}${e.quien ? ' (' + e.quien + ')' : ''}?`)) return;
          const b = ev.currentTarget; b.disabled = true;
          try { await flush(); const os = e.ordenes.filter(editable); await cambiarEstado(os, 'cancelada'); toast('Pedido cancelado', 'ok'); pintar(); }
          catch (x) { toast(mensajeError(x), 'error'); b.disabled = false; }
        } } }) : null));
  }

  function vistaLocales() {
    const todos = envios(ordenes);
    const cuenta = { revisar: 0, aprobados: 0, enviados: 0, todos: 0 };
    for (const e of todos) {
      if (filtroLocal && e.local_id !== filtroLocal) continue;
      cuenta.todos++;
      if (e.ordenes.some(o => o.estado === 'borrador')) cuenta.revisar++;
      if (e.estado === 'aprobada') cuenta.aprobados++;
      if (['enviada', 'parcial', 'recibida'].includes(e.estado)) cuenta.enviados++;
    }
    const lista = todos.filter(pasaFiltro);
    const chipsEstado = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Estado' },
      [['revisar', 'Por revisar'], ['aprobados', 'Aprobados'], ['enviados', 'Enviados'], ['todos', 'Todos']].map(([k, t]) => h('button', {
        class: 'chip' + (filtro === k ? ' is-on' : ''), type: 'button', 'aria-pressed': filtro === k ? 'true' : 'false', 'data-filtro': k,
        on: { click: () => { filtro = k; pintar(); } } }, t, h('span', { class: 'chip-n num', text: String(cuenta[k]) }))));
    const locales = G.locales.filter(l => l.activo !== false);
    const selLocal = h('select', { class: 'input input-sm', 'aria-label': 'Local', on: { change: (ev) => { filtroLocal = ev.target.value; pintar(); } } },
      h('option', { value: '', text: 'Todos los locales' }), locales.map(l => h('option', { value: l.id, text: l.nombre, selected: l.id === filtroLocal })));

    const filas = lista.map(e => {
      const abierto = abiertos.has(e.key);
      const provs = [...new Set(e.ordenes.map(o => o.proveedor_id || SIN))];
      const muestra = e.items.slice(0, 3).map(({ it }) => `${nombreProd(it)} ${cantTxt(it)}`).join(' · ') + (e.items.length > 3 ? ` · +${e.items.length - 3}` : '');
      const fila = h('button', { class: 'pt-fila' + (abierto ? ' is-open' : ''), type: 'button', 'aria-expanded': abierto ? 'true' : 'false', 'data-envio': e.key,
        on: { click: () => { if (abierto) abiertos.delete(e.key); else abiertos.add(e.key); pintar(); } } },
        h('span', { class: 'pt-c pt-fecha num' }, ...fechaCorta(e.creado_en).split(' · ').map(t => h('span', { text: t }))),
        h('span', { class: 'pt-c pt-local' }, h('b', { text: nombreLocal(e.local_id) })),
        h('span', { class: 'pt-c pt-quien', text: e.quien || '—' }),
        h('span', { class: 'pt-c pt-prods' }, h('b', { text: `${e.items.length} ${e.items.length === 1 ? 'producto' : 'productos'}` }), h('span', { class: 'pt-muestra', text: muestra })),
        h('span', { class: 'pt-c pt-provs' }, provs.map(p => h('span', { class: 'tag-prov' + (p === SIN ? ' is-sin' : ''), text: p === SIN ? 'Sin proveedor' : nombreProv(p) }))),
        h('span', { class: 'pt-c pt-est' }, h('span', { class: 'estado estado-' + e.estado, text: ESTADOS[e.estado] }), e.nota ? h('span', { class: 'pt-tiene-nota', title: 'Tiene nota', text: 'Nota' }) : null),
        h('span', { class: 'pt-c pt-chev', 'aria-hidden': 'true', text: abierto ? '▴' : '▾' }));
      return h('div', { class: 'pt-envio' + (abierto ? ' is-open' : '') }, fila, abierto ? detalleEnvio(e) : null);
    });

    return [
      h('div', { class: 'pt-filtros' }, chipsEstado, selLocal),
      lista.length ? h('div', { class: 'ped-tabla', role: 'list' },
        h('div', { class: 'pt-fila pt-h', 'aria-hidden': 'true' }, ['Fecha', 'Local', 'Encargado', 'Productos', 'Proveedor', 'Estado', ''].map(t => h('span', { class: 'pt-c', text: t }))),
        filas)
        : vacio(filtro === 'revisar' ? 'No hay pedidos por revisar' : 'No hay pedidos acá', filtro === 'revisar' ? 'Cuando un local mande un pedido aparece en esta tabla.' : 'Probá con otro filtro.')
    ];
  }

  // ---------- armado por proveedor ----------
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
    const vistaImg = h('div', { class: 'orden-img', 'aria-live': 'polite' }, h('p', { class: 'sub', text: 'Armando la copia del pedido…' }));
    const txt = h('div', { class: 'aviso-txt', 'data-aviso': '' });
    const acciones = h('div', { class: 'form' });
    const cuerpo = h('div', { class: 'form' },
      h('p', { class: 'sub', text: `Para ${prov.nombre}${prov.whatsapp ? ' · ' + prov.whatsapp : ''}` }), seg, vistaImg, txt, acciones);
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
        vistaImg.replaceChildren(h('img', { src: urlImg, alt: `Copia del pedido para ${prov.nombre}` }));
      } catch (_e) { if (v === version) vistaImg.replaceChildren(banner('No se pudo armar la imagen. Podés mandar solo el mensaje.', 'warn')); }

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
    const estados = [...new Set(os.map(o => o.estado))];

    // productos sumados entre locales; cada uno recuerda sus ítems para poder moverlos juntos
    const m = new Map();
    for (const o of os) for (const it of o.orden_items) {
      const x = m.get(it.producto_id) || { producto_id: it.producto_id, cant: 0, pares: [], porLocal: new Map() };
      x.cant += Number(it.cantidad_pedida); x.pares.push({ o, it });
      x.porLocal.set(o.local_id, (x.porLocal.get(o.local_id) || 0) + Number(it.cantidad_pedida));
      m.set(it.producto_id, x);
    }
    const prods = [...m.values()].sort((a, b) => porTexto(nombreProd(a), nombreProd(b)));
    const sugs = sinProv ? prods.map(x => ({ x, s: sugerir(x.producto_id) })).filter(y => y.s) : [];

    const filas = prods.map(x => {
      const sug = sinProv ? sugerir(x.producto_id) : null;
      return h('div', { class: 'pp-fila', 'data-prod': x.producto_id },
        h('div', { class: 'pp-prod' }, h('b', { text: nombreProd(x) }),
          h('span', { class: 'pp-locales', text: [...x.porLocal].map(([lid, c]) => `${nombreLocal(lid)} ${fmtNum(c, 3)}`).join(' · ') })),
        h('div', { class: 'pp-cant num' }, h('b', { text: fmtNum(x.cant, 3) }), h('span', { class: 'mute', text: ' ' + (unidad(x) || '') })),
        h('div', { class: 'pp-prov' },
          selectorProv(sinProv ? null : provId, (v, sel) => moverYAvisar(x.pares, v, sel), sinProv ? `Proveedor de ${nombreProd(x)}` : `Pasar ${nombreProd(x)} a otro proveedor`),
          botonSugerido(sug, (v, b) => moverYAvisar(x.pares, v, b))));
    });

    const btnSugeridos = sugs.length ? h('button', { class: 'btn btn-primary', type: 'button', 'data-accion': 'sugeridos', on: { click: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { for (const [pid, ys] of groupBy(sugs, y => y.s.id)) await mover(ys.flatMap(y => y.x.pares), pid); toast(`${sugs.length} ${sugs.length === 1 ? 'producto asignado' : 'productos asignados'} al proveedor sugerido`, 'ok'); }
      catch (x) { toast(mensajeError(x), 'error'); }
      pintar();
    } } }, h('span', { text: `Usar los sugeridos (${sugs.length})` })) : null;
    const btnAprobar = !sinProv && hayBorrador ? h('button', { class: 'btn btn-ghost', type: 'button', text: 'Aprobar', on: { click: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await flush(); await cambiarEstado(os.filter(o => o.estado === 'borrador'), 'aprobada'); toast(`${nombre}: aprobado`, 'ok'); pintar(); }
      catch (x) { toast(mensajeError(x), 'error'); b.disabled = false; }
    } } }) : null;
    const btnWA = !sinProv ? h('button', { class: 'btn btn-primary', type: 'button', on: { click: async () => {
      try { await flush(); } catch (x) { return toast(mensajeError(x), 'error'); }
      abrirEnvio(prov || { nombre }, os.filter(o => o.orden_items.length), async () => { await cambiarEstado(os, 'enviada'); toast(`${nombre}: marcado como enviado`, 'ok'); pintar(); });
    } } }, icon('whatsapp', 18), h('span', { text: 'Enviar por WhatsApp' })) : null;

    const locales = [...groupBy(os, o => o.local_id)].map(([lid, l]) => `${nombreLocal(lid)}${[...new Set(l.map(o => o.cargado_por_nombre).filter(Boolean))].length ? ' (' + [...new Set(l.map(o => o.cargado_por_nombre).filter(Boolean))].join(', ') + ')' : ''}`);
    return h('section', { class: 'grupo-prov pp' + (sinProv ? ' sin-prov' : ''), 'data-prov': nombre },
      h('header', { class: 'pp-head' },
        h('div', { class: 'pp-tit' }, h('h2', { class: 'gp-t', text: nombre }),
          h('p', { class: 'pp-sub', text: `${prods.length} ${prods.length === 1 ? 'producto' : 'productos'} · ${locales.join(' · ')}` })),
        h('div', { class: 'pp-meta' },
          tot ? h('span', { class: 'gp-c', text: `≈ ${fmtMoney(tot)}` }) : null,
          estados.map(s => h('span', { class: 'estado estado-' + s, text: ESTADOS[s] })))),
      min && tot < min ? h('p', { class: 'gp-nota gp-warn', text: `Pedido mínimo ${fmtMoney(min)}: faltan ${fmtMoney(min - tot)}.` }) : null,
      sinProv ? h('p', { class: 'gp-nota gp-warn', text: sugs.length ? 'Elegí el proveedor de cada producto o usá los sugeridos.' : 'Elegí el proveedor de cada producto.' }) : null,
      prov && !prov.whatsapp ? h('p', { class: 'gp-nota gp-warn', text: 'Sin WhatsApp cargado.' }) : null,
      h('div', { class: 'pp-tabla' },
        h('div', { class: 'pp-fila pp-h', 'aria-hidden': 'true' }, h('span', { text: 'Producto · locales' }), h('span', { class: 'pp-h-tot', text: 'Total' }), h('span', { text: sinProv ? 'Proveedor' : 'Pasar a otro proveedor' })),
        filas),
      h('div', { class: 'acciones' }, btnSugeridos, btnAprobar, btnWA));
  }

  function vistaProveedor() {
    const vs = vivas();
    const g = groupBy(vs, o => o.proveedor_id || SIN);
    const provs = [...g.keys()].sort((a, b) => (b === SIN) - (a === SIN) || porTexto(nombreProv(a), nombreProv(b)));
    const chkRecordar = h('input', { type: 'checkbox', checked: recordar, on: { change: (e) => { recordar = e.target.checked; lsSet('g:ped:recordar', recordar); } } });
    return [
      provs.length ? h('label', { class: 'check pp-recordar' }, chkRecordar, h('span', { text: 'Al cambiar el proveedor de un producto, guardarlo para los próximos pedidos' })) : null,
      ...(provs.length ? provs.map(p => tarjeta(p, g.get(p))) : [vacio('No hay pedidos para armar', 'Lo que manden los locales y esté en revisión o aprobado aparece acá, agrupado por proveedor.')])
    ];
  }

  // ---------- pantalla ----------
  function cambiarVista(v) { vista = v; lsSet('g:ped:vista', v); window.scrollTo(0, 0); pintar(); }

  function pintar() {
    if (!ctx.alive()) return;
    const nRevisar = envios(ordenes).filter(e => e.ordenes.some(o => o.estado === 'borrador')).length;
    const nProv = new Set(vivas().map(o => o.proveedor_id || SIN)).size;
    const seg = h('div', { class: 'seg seg-ped', role: 'tablist', 'aria-label': 'Vista de pedidos' },
      [['locales', 'De los locales', nRevisar], ['proveedor', 'Por proveedor', nProv]].map(([k, t, n]) => h('button', {
        class: 'seg-b' + (vista === k ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': vista === k ? 'true' : 'false', 'data-vista': k,
        on: { click: () => { if (vista !== k) cambiarVista(k); } } }, t, n ? h('span', { class: 'seg-n num', text: String(n) }) : null)));
    mount(root,
      h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pedidos' }),
        h('p', { class: 'sub', text: vista === 'locales' ? 'Qué pidió cada local, quién y cuándo' : 'Lo pendiente de todos los locales, sumado por proveedor para mandar' }),
        h('a', { class: 'btn btn-ghost btn-cargar', href: '#/cargar', 'data-accion': 'cargar' }, icon('mas', 18), h('span', { text: 'Cargar pedido para un local' }))),
      seg,
      ...(vista === 'locales' ? vistaLocales() : vistaProveedor()));
  }

  mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pedidos' })), esqueleto(3));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  const desde = sumarDias(hoyISO(), -30);
  await swr('g:ord:tabla', async () => {
    const [vs, hist] = await Promise.all([ordenesPorEstado(VIVAS), ordenesHistorial(desde)]);
    return [...vs, ...hist];
  }, (d) => { if (!pend.size) { ordenes = d.map(o => ({ ...o, orden_items: o.orden_items || [] })); pintar(); } });
  return () => { flush().catch(() => {}); };
}
