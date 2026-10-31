// Gerencia · Pedidos y Compras, dos pestañas sobre los mismos datos:
// Pedidos ("De los locales": tabla de lo que mandó cada local (cuándo, local, quién, qué productos, a qué proveedor, estado);
//   se abre una fila para ver y corregir cantidades y proveedor de cada producto.
// Compras ("Por proveedor"): arma el envío de cada proveedor sumando todos los locales; cada producto se puede pasar a otro
//   proveedor (con proveedor sugerido), se corrige la cantidad de cada local y se aprueba; recién aprobado se manda
//   por WhatsApp o se imprime.
import { mount, h, norm, fmtNum, fmtMoney, parseNum, groupBy, porTexto, fechaCorta, lsGet, lsSet, hoyISO, sumarDias, ESTADOS, tokens, coincide, esCarta, plural } from './util.js';
import { swr, guardaExcluidos, marcarExcluidos, ordenesPorEstado, ordenesHistorial, actualizarOrden, actualizarItem, agregarItem, borrarItem, moverItem, crearOrdenSolo, guardarProducto, borrarTodosLosPedidos, limpiarCache, mensajeError } from './api.js';
import { G, cargarG, nombreLocal, razonLocal } from './datos.js';
import { esqueleto, vacio, banner, toast, icon, hoja, campo, subnav, SUBNAV_COMPRAS } from './ui.js';
import { imagenOrden } from './orden-imagen.js';
import { puedeCompartirArchivos } from './aviso.js';
import { urlMail } from './pagos-util.js';

const SIN = '__sin__';
const VIVAS = ['borrador', 'aprobada'];
const RANGO = ['borrador', 'aprobada', 'enviada', 'parcial', 'recibida'];
const JUNTOS_MS = 5 * 60 * 1000; // órdenes del mismo local y encargado con menos de 5 min = un mismo envío

export async function render(root, ctx, id) {
  let ordenes = [];
  const vista = id === 'compras' ? 'proveedor' : 'locales';
  let filtro = 'revisar';
  let filtroLocal = '';
  let recordar = lsGet('g:ped:recordar', true) !== false;
  const abiertos = new Set();
  // Ítems destildados en "Por proveedor": no se mandan ni se imprimen. Se guardan en el servidor (orden_items.excluido)
  // para verse igual en el celular y la PC; si la base todavía no tiene la columna, quedan en este dispositivo.
  let fuera = new Set(lsGet('g:ped:fuera', []));
  const guardarFuera = () => { if (!guardaExcluidos()) lsSet('g:ped:fuera', [...fuera]); };
  async function cambiarFuera(ids, sacar) {
    ids.forEach(id => { if (sacar) fuera.add(id); else fuera.delete(id); });
    for (const o of ordenes) for (const i of o.orden_items) if (ids.includes(i.id)) i.excluido = sacar;
    if (!guardaExcluidos()) return guardarFuera();
    try { await marcarExcluidos(ids, sacar); } catch (x) { toast('No se pudo guardar: ' + mensajeError(x), 'error'); }
  }
  // Al leer del servidor: lo destildado viene en cada ítem; lo que había quedado guardado solo en este dispositivo se sube una vez.
  async function leerFuera() {
    if (!guardaExcluidos()) return;
    const locales = lsGet('g:ped:fuera', []);
    const vivos = new Set(ordenes.filter(o => VIVAS.includes(o.estado)).flatMap(o => o.orden_items.map(i => i.id)));
    const subir = locales.filter(id => vivos.has(id) && !ordenes.some(o => o.orden_items.some(i => i.id === id && i.excluido)));
    fuera = new Set(ordenes.flatMap(o => o.orden_items.filter(i => i.excluido).map(i => i.id)));
    if (subir.length) { await cambiarFuera(subir, true).catch(() => {}); }
    if (locales.length) lsSet('g:ped:fuera', []);
  }
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
  // Código del proveedor: productos.codigo_proveedor (0021) o, en el mayorista, LOCAL-DS-<código de su lista> (-B si se repetía).
  const codProv = (it) => { const p = prodDe(it) || {}; if (p.codigo_proveedor) return p.codigo_proveedor; const m = /^[A-Z]{3}-DS-(.+?)(-B)?$/.exec(p.codigo || ''); return m ? m[1] : ''; };
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

  // ---------- agregar un producto que el local no pidió ----------
  // Antes de aprobar, gerencia suma algo del catálogo del local. Si el local ya lo pidió, se suma a esa cantidad; si no,
  // va a la orden del local con ese proveedor (el del producto, o el de la tarjeta en "Por proveedor"). Si no hay orden,
  // se crea una con la misma fecha y encargado para que siga en el mismo envío.
  async function agregarProducto(base, localId, p, qty, provId) {
    await flush();
    const deLocal = base.filter(o => o.local_id === localId && editable(o));
    const ya = deLocal.flatMap(o => o.orden_items.map(it => ({ o, it }))).find(x => x.it.producto_id === p.id);
    if (ya) {
      const n = Number(ya.it.cantidad_pedida) + qty;
      await actualizarItem(ya.it.id, n); ya.it.cantidad_pedida = n;
      if (fuera.has(ya.it.id)) await cambiarFuera([ya.it.id], false);
      return { sumado: n };
    }
    const prov = provId || (p.proveedor_id && G.provs.has(p.proveedor_id) ? p.proveedor_id : null);
    const mismos = deLocal.filter(o => (o.proveedor_id || null) === prov);
    let o = mismos.find(x => x.estado === 'borrador') || mismos[0];
    if (!o) {
      const ref = deLocal[0] || vivas().find(x => x.local_id === localId);
      const nueva = { local_id: localId, proveedor_id: prov, estado: ref ? ref.estado : 'borrador', cargado_por_nombre: ref ? ref.cargado_por_nombre || null : null, nota: ref ? ref.nota || null : null };
      if (ref) nueva.creado_en = ref.creado_en;
      const id = await crearOrdenSolo(nueva);
      o = { creado_en: new Date().toISOString(), ...nueva, id, orden_items: [] };
      ordenes.push(o);
    }
    const id = await agregarItem(o.id, p.id, qty);
    o.orden_items.push({ id, producto_id: p.id, cantidad_pedida: qty, cantidad_recibida: null, excluido: false });
    return { orden: o };
  }

  // Hoja: elegir el local (si hay más de uno), buscar el producto en su catálogo y poner cuánto.
  // locales: ids para elegir; provId: en "Por proveedor", sus productos se muestran primero y el producto va a ese proveedor.
  function hojaAgregar({ base, locales, provId = null, alListo }) {
    let localId = locales[0];
    let t = '';
    const cuerpo = h('div', { class: 'rf-elegir ag-hoja' });
    const { cerrar } = hoja('Agregar producto', cuerpo);
    const yaPedido = (pid) => base.filter(o => o.local_id === localId && editable(o)).flatMap(o => o.orden_items).find(i => i.producto_id === pid);

    function buscar() {
      const prodsLocal = [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && !p.es_elaborado && !esCarta(p));
      const opciones = h('div', { class: 'lista lista-sheet' });
      const pintarOpc = () => {
        const tk = tokens(t);
        const cand = t.trim() ? prodsLocal.filter(p => coincide(p.nombre + ' ' + (p.codigo || '') + ' ' + (p.codigo_proveedor || ''), tk))
          : provId ? prodsLocal.filter(p => p.proveedor_id === provId) : [];
        const lista = cand.sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 40);
        opciones.replaceChildren(...(lista.length ? lista.map(p => {
          const ya = yaPedido(p.id);
          return h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Agregar ${p.nombre}`, on: { click: () => cantidad(p) } },
            h('span', { class: 'prod-n', text: p.nombre }),
            h('span', { class: 'prod-m' }, h('span', { class: 'num', text: p.codigo || '' }), h('span', { text: p.unidad_compra || p.unidad_uso || '' }), h('span', { text: nombreProv(p.proveedor_id) }),
              ya ? h('span', { class: 'ag-ya', text: `Ya pidió ${fmtNum(ya.cantidad_pedida, 3)}` }) : null));
        }) : [vacio(t.trim() ? `No está en el catálogo de ${nombreLocal(localId)}` : 'Buscá el producto', t.trim() ? 'Probá con otra palabra o cargalo en Catálogo.' : 'Escribí el nombre o el código.')]));
      };
      const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', value: t, 'aria-label': 'Buscar producto para agregar', autocomplete: 'off', on: { input: (e) => { t = e.target.value; pintarOpc(); } } });
      const selLocal = locales.length > 1 ? h('select', { class: 'input', 'aria-label': 'Local', on: { change: (e) => { localId = e.target.value; buscar(); } } },
        locales.map(id => h('option', { value: id, text: nombreLocal(id), selected: id === localId }))) : null;
      cuerpo.replaceChildren(
        h('p', { class: 'sub', text: provId ? `Algo más que necesita el local, para pedirle a ${nombreProv(provId)}.` : `Algo que creés que necesita ${nombreLocal(localId)} y no pidió.` }),
        ...(selLocal ? [selLocal] : []), buscador, opciones);
      pintarOpc(); setTimeout(() => buscador.focus(), 50);
    }

    function cantidad(p) {
      const ya = yaPedido(p.id);
      const u = p.unidad_compra || '';
      const inp = h('input', { class: 'input num ag-cant', type: 'text', inputmode: 'decimal', value: '1', 'aria-label': `Cantidad de ${p.nombre}`, on: { focus: (e) => e.target.select(), keydown: (e) => { if (e.key === 'Enter') listo(); } } });
      const uTxt = h('span', { class: 'mute', text: u ? plural(u, 1) : '' });
      inp.addEventListener('input', () => { const n = parseNum(inp.value); uTxt.textContent = u ? plural(u, n || 0) : ''; });
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-accion': 'agregar-confirmar', text: ya ? 'Sumar al pedido' : 'Agregar al pedido', on: { click: () => listo() } });
      async function listo() {
        const n = parseNum(inp.value);
        if (n === null || n <= 0) { toast('Poné una cantidad mayor a 0.', 'error'); return inp.focus(); }
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const r = await agregarProducto(base, localId, p, n, provId);
          cerrar();
          toast(r.sumado ? `${p.nombre}: ${nombreLocal(localId)} ya lo pedía, ahora ${fmtNum(r.sumado, 3)}` : `${p.nombre} agregado a ${nombreLocal(localId)}`, 'ok');
          alListo();
        } catch (x) { toast(mensajeError(x), 'error'); btn.disabled = false; btn.textContent = ya ? 'Sumar al pedido' : 'Agregar al pedido'; }
      }
      const destino = provId ? nombreProv(provId) : nombreProv(p.proveedor_id && G.provs.has(p.proveedor_id) ? p.proveedor_id : null);
      cuerpo.replaceChildren(...[
        h('div', { class: 'ag-elegido' }, h('b', { text: p.nombre }), h('span', { class: 'mute', text: `${nombreLocal(localId)} · ${destino}` })),
        ya ? h('p', { class: 'gp-nota gp-info', text: `Ya pidió ${fmtNum(ya.cantidad_pedida, 3)}${u ? ' ' + plural(u, ya.cantidad_pedida) : ''}: lo que pongas se suma.` }) : null,
        h('label', { class: 'ag-fila' }, h('span', { text: 'Cantidad' }), inp, uTxt),
        btn,
        h('button', { class: 'btn btn-text btn-block', type: 'button', text: 'Elegir otro producto', on: { click: buscar } })].filter(Boolean));
      setTimeout(() => inp.focus(), 50);
    }
    buscar();
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

  // Lo corregido al recibir (migración 0020): faltante de lo pedido o producto que llegó sin estar pedido.
  const notaRecepcion = (it) => {
    const falta = Number(it.cantidad_pedida) - (Number(it.cantidad_recibida) || 0);
    if (it.agregado) return h('span', { class: 'det-rec det-rec-extra', text: `No estaba en el pedido · llegó ${fmtNum(it.cantidad_recibida, 3)}` });
    if (it.no_vino && falta > 0) return h('span', { class: 'det-rec', text: `Faltó ${fmtNum(falta, 3)}${Number(it.cantidad_recibida) ? ` · llegó ${fmtNum(it.cantidad_recibida, 3)}` : ''}` });
    return null;
  };
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
        h('div', { class: 'det-prod' }, h('b', { text: nombreProd(it) }), h('span', { class: 'mute', text: unidad(it) || '' }), notaRecepcion(it)),
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
        e.ordenes.some(editable) ? h('button', { class: 'btn btn-ghost', type: 'button', 'data-accion': 'agregar', on: { click: () => hojaAgregar({ base: e.ordenes, locales: [e.local_id], alListo: pintar }) } },
          icon('mas', 18), h('span', { text: 'Agregar producto' })) : null,
        e.ordenes.some(o => o.estado === 'aprobada') ? h('button', { class: 'btn btn-ghost', type: 'button', text: 'Armar envío por proveedor', on: { click: () => ctx.ir('compras') } }) : null,
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
        // Todo junto: el mismo producto de distintos locales (cada local tiene su ficha) va en una sola línea.
        const k = junto ? (codProv(i) || norm(nombreProd(i))) + '|' + norm(unidad(i) || '') : i.producto_id;
        const x = m.get(k) || { producto_id: i.producto_id, cant: 0, porLocal: new Map() };
        x.cant += Number(i.cantidad_pedida);
        x.porLocal.set(o.local_id, (x.porLocal.get(o.local_id) || 0) + Number(i.cantidad_pedida));
        m.set(k, x);
      }
      return [...m.values()].sort((a, b) => porTexto(nombreProd(a), nombreProd(b))).map(x => ({
        cant: fmtNum(x.cant, 3), unidad: unidad(x), nombre: nombreProd(x), codigo: codProv(x),
        detalle: junto && x.porLocal.size > 1 ? [...x.porLocal].map(([lid, c]) => `${nombreLocal(lid)} ${fmtNum(c, 3)}`).sort(porTexto).join(' · ') : '',
      }));
    };
    // "Todo junto" suma por razón social: cada empresa recibe su propia factura.
    if (junto) {
      const grupos = [...groupBy(os, o => razonLocal(o.local_id))].sort((a, b) => porTexto(a[0], b[0]));
      const nombres = (lista) => [...new Set(lista.map(o => nombreLocal(o.local_id)))].sort(porTexto).join(' + ');
      return grupos.map(([razon, lista]) => ({ titulo: grupos.length > 1 ? nombres(lista) : 'Pedido total', factura: facturaDe(razon), lineas: sumar(lista) }));
    }
    return [...groupBy(os, o => o.local_id)].sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0])))
      .map(([lid, lista]) => ({ titulo: nombreLocal(lid), factura: facturaDe(razonLocal(lid)), lineas: sumar(lista) }));
  };
  // "Facturar a SUMA ACTIVA S.A. · CUIT …" (vacío si el local no tiene razón social).
  const facturaDe = (razon) => {
    if (!razon) return '';
    const l = G.locales.find(x => x.razon_social === razon && x.cuit);
    return 'Facturar a ' + razon + (l ? ' · CUIT ' + l.cuit : '');
  };

  const textoWA = (prov, bloques, fecha) => {
    const partes = bloques.map(b => `*${b.titulo}*${b.factura ? `\n_${b.factura}_` : ''}\n${b.lineas.map(l => `• ${l.cant} ${l.unidad || ''} ${l.nombre}`.replace(/\s+/g, ' ') + (l.codigo ? ` · Cód. ${l.codigo}` : '') + (l.detalle ? ` (${l.detalle})` : '')).join('\n')}`);
    const n = bloques.reduce((a, b) => a + b.lineas.length, 0);
    return `Hola ${prov.contacto || prov.nombre}! Te paso el pedido de *Docks del Puerto* del ${fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}:\n\n${partes.join('\n\n')}\n\nTotal: ${n} ${n === 1 ? 'producto' : 'productos'}. ¡Gracias!`;
  };

  // Con la imagen alcanza: el mensaje es solo un saludo con los locales (el detalle y la factura van en la imagen).
  const textoCorto = (prov, os, fecha) =>
    `Hola ${prov.contacto || prov.nombre}! Te paso el pedido de *Docks del Puerto* del ${fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} (${[...new Set(os.map(o => nombreLocal(o.local_id)))].sort(porTexto).join(', ')}). Va todo en la imagen. ¡Gracias!`;
  const bajar = (url, nombre) => { const a = h('a', { href: url, download: nombre }); document.body.append(a); a.click(); a.remove(); };

  // Hoja para mandar el pedido al proveedor: imagen con el logo + saludo corto (el texto completo solo si falla la imagen). Lo envía siempre una persona.
  function abrirEnvio(prov, os, alEnviar, sacados = 0) {
    const locales = new Set(os.map(o => o.local_id)).size;
    const fecha = new Date();
    let junto = false, file = null, urlImg = null, version = 0;
    const seg = locales > 1 ? h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Cómo mandar el pedido' }) : null;
    const vistaImg = h('div', { class: 'orden-img', 'aria-live': 'polite' }, h('p', { class: 'sub', text: 'Armando la copia del pedido…' }));
    const txt = h('div', { class: 'aviso-txt', 'data-aviso': '' });
    const acciones = h('div', { class: 'form' });
    const cuerpo = h('div', { class: 'form' },
      h('p', { class: 'sub', 'data-destino': '', text: `Para ${prov.nombre}${prov.contacto ? ' (' + prov.contacto + ')' : ''}${prov.whatsapp ? ' · WhatsApp ' + prov.whatsapp : ''}${prov.email ? ' · ' + prov.email : ''}` }),
      sacados ? banner(`${sacados} ${sacados === 1 ? 'producto destildado no va en el pedido y sale' : 'productos destildados no van en el pedido y salen'} al marcarlo como enviado.`, 'info') : null,
      seg, vistaImg, txt, acciones);
    const { cerrar } = hoja(prov.whatsapp || !prov.email ? 'Enviar pedido por WhatsApp' : 'Enviar pedido', cuerpo, { onClose: () => { if (urlImg) URL.revokeObjectURL(urlImg); } });
    const nombreArchivo = `pedido-${prov.nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${fecha.toISOString().slice(0, 10)}.png`;

    async function enviado() { try { await alEnviar(); } catch (x) { toast('Se envió, pero no pude marcarlo como enviado: ' + mensajeError(x), 'error'); } cerrar(); }

    async function armar() {
      const v = ++version;
      if (seg) seg.replaceChildren(...[[false, 'Separado por local'], [true, 'Todo junto']].map(([j, t]) => h('button', {
        class: 'seg-b' + (junto === j ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': junto === j ? 'true' : 'false', text: t,
        on: { click: () => { if (junto !== j) { junto = j; armar(); } } } })));
      const bloques = armarBloques(os, junto);
      txt.textContent = textoCorto(prov, os, fecha);
      // El pedido escrito queda como texto alternativo de la imagen y como mensaje si la imagen falla.
      const completo = textoWA(prov, bloques, fecha);
      file = null;
      try {
        const blob = await imagenOrden({ proveedor: prov.nombre, fecha, bloques });
        if (v !== version) return;
        file = new File([blob], nombreArchivo, { type: 'image/png' });
        if (urlImg) URL.revokeObjectURL(urlImg);
        urlImg = URL.createObjectURL(file);
        vistaImg.replaceChildren(h('img', { src: urlImg, alt: completo.replace(/[*_]/g, '') }));
      } catch (_e) { if (v === version) vistaImg.replaceChildren(banner('No se pudo armar la imagen: va el pedido escrito en el mensaje.', 'warn')); }
      if (v !== version) return;
      const texto = file ? textoCorto(prov, os, fecha) : completo;
      txt.textContent = texto;
      vistaImg.dataset.lista = file ? 'imagen' : 'texto';

      const lista = [];
      if (puedeCompartirArchivos(file)) {
        lista.push(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', 'data-accion': 'compartir', on: { click: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { await navigator.share({ files: [file], text: texto }); await enviado(); }
          catch (x) { b.disabled = false; if (x && x.name === 'AbortError') toast('Se canceló el envío.', 'info'); else toast('No se pudo compartir: ' + mensajeError(x), 'error'); }
        } } }, icon('whatsapp', 20), h('span', { text: 'Compartir por WhatsApp con la imagen' })));
      } else {
        const digitos = String(prov.whatsapp || '').replace(/\D/g, '');
        if (!digitos) lista.push(banner(`${prov.nombre} no tiene WhatsApp cargado.${prov.email ? ' Podés mandarlo por email.' : ' Cargalo en Proveedores.'}`, 'warn'));
        // En la computadora la imagen va al portapapeles: en el chat del proveedor alcanza con Ctrl+V y Enter. Si no se puede, se descarga.
        const copiable = !!(file && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
        lista.push(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', disabled: !digitos, 'data-accion': 'wa', on: { click: async () => {
          let copiada = false;
          if (copiable) { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]); copiada = true; } catch (_e) { copiada = false; } }
          if (file && !copiada) bajar(urlImg, nombreArchivo);
          window.open(`https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
          toast(copiada ? 'Imagen copiada: en el chat de WhatsApp pegala con Ctrl+V y mandá con Enter.' : file ? 'Se descargó la imagen: adjuntala en el chat de WhatsApp.' : 'Se abrió WhatsApp con el mensaje.', 'info');
          await enviado();
        } } }, icon('whatsapp', 20), h('span', { text: !file ? 'Abrir WhatsApp con el mensaje' : copiable ? `Abrir el chat de ${prov.nombre} con la imagen` : 'Bajar la imagen y abrir WhatsApp' })));
        if (file) lista.push(banner(copiable
          ? 'Se abre el chat del proveedor con el saludo escrito y la imagen copiada: pegala con Ctrl+V y apretá Enter.'
          : 'En la computadora WhatsApp no recibe la imagen sola: se descarga y la adjuntás en el chat (arrastrala o clip → Fotos).', 'info'));
      }
      const urlM = urlMail(prov.email, `Pedido de Docks del Puerto · ${fecha.toLocaleDateString('es-AR')}`,
        (file ? texto.replace('Va todo en la imagen.', 'Te adjunto la imagen con el pedido.') : texto).replace(/\*/g, ''));
      if (urlM) lista.push(h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-accion': 'mail', on: { click: async () => {
        if (file) { bajar(urlImg, nombreArchivo); toast('Adjuntá la imagen que se descargó al email.', 'info'); }
        window.location.href = urlM;
        await enviado();
      } } }, icon('mail', 20), h('span', { text: `Mandar por email a ${prov.email}` })));
      if (urlImg && file) lista.push(h('a', { class: 'btn btn-ghost btn-block', href: urlImg, download: nombreArchivo, 'data-accion': 'descargar' }, h('span', { text: 'Descargar la imagen' })));
      if (v === version) acciones.replaceChildren(...lista);
    }
    armar();
  }

  const cambiarEstado = async (os, estado) => { await Promise.all(os.map(o => actualizarOrden(o.id, { estado }))); os.forEach(o => { o.estado = estado; }); };
  const total = (os) => os.flatMap(o => o.orden_items).reduce((s, i) => s + i.cantidad_pedida * (G.precios.get(i.producto_id) || 0), 0);
  // Copia de las órdenes solo con los productos tildados (lo que se manda o se imprime).
  const incluidos = (os) => os.map(o => ({ ...o, orden_items: o.orden_items.filter(i => !fuera.has(i.id)) })).filter(o => o.orden_items.length);
  const nFuera = (os) => new Set(os.flatMap(o => o.orden_items.filter(i => fuera.has(i.id)).map(i => i.producto_id))).size;
  // Al marcar como enviado, lo destildado sale del pedido (la orden que queda vacía se cancela).
  async function marcarEnviado(os) {
    await flush();
    for (const o of os) {
      const sacar = o.orden_items.filter(i => fuera.has(i.id));
      await Promise.all(sacar.map(i => borrarItem(i.id)));
      o.orden_items = o.orden_items.filter(i => !fuera.has(i.id));
      sacar.forEach(i => fuera.delete(i.id));
    }
    guardarFuera();
    const vacias = os.filter(o => !o.orden_items.length);
    await cambiarEstado(os.filter(o => o.orden_items.length), 'enviada');
    if (vacias.length) await cambiarEstado(vacias, 'cancelada');
  }

  // ---------- impresión: A4 horizontal, 13 pt, páginas numeradas ----------
  function hojaImpresion(prov, os) {
    const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const n = new Set(os.flatMap(o => o.orden_items.map(i => i.producto_id))).size;
    const porLocal = [...groupBy(os, o => o.local_id)].sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0])));
    return h('section', { class: 'pr-prov' },
      h('header', { class: 'pr-head' },
        h('div', {}, h('p', { class: 'pr-marca', text: 'Docks del Puerto · Pedido de compra' }), h('h1', { class: 'pr-t', text: prov.nombre })),
        h('div', { class: 'pr-datos' }, h('p', { text: fecha }), prov.contacto ? h('p', { text: 'Contacto ' + prov.contacto }) : null,
          prov.whatsapp ? h('p', { text: 'WhatsApp ' + prov.whatsapp }) : null, prov.telefono ? h('p', { text: 'Tel. ' + prov.telefono }) : null, prov.email ? h('p', { text: prov.email }) : null,
          h('p', { text: `${n} ${n === 1 ? 'producto' : 'productos'} · ${porLocal.length} ${porLocal.length === 1 ? 'local' : 'locales'}` }))),
      porLocal.map(([lid, lista]) => {
        const m = new Map();
        for (const o of lista) for (const i of o.orden_items) { const x = m.get(i.producto_id) || { producto_id: i.producto_id, cant: 0 }; x.cant += Number(i.cantidad_pedida); m.set(i.producto_id, x); }
        const filas = [...m.values()].sort((a, b) => porTexto(nombreProd(a), nombreProd(b)));
        const quien = [...new Set(lista.map(o => o.cargado_por_nombre).filter(Boolean))].join(', ');
        const notas = [...new Set(lista.map(o => o.nota).filter(Boolean))].join(' · ');
        return h('table', { class: 'pr-tabla' + (filas.length <= 12 ? ' pr-junta' : '') },
          h('thead', {},
            h('tr', {}, h('th', { class: 'pr-local', colspan: '4' }, h('b', { text: nombreLocal(lid) }), quien ? h('span', { text: ' · pidió ' + quien }) : null, notas ? h('span', { class: 'pr-nota', text: ' · Nota: ' + notas }) : null, razonLocal(lid) ? h('span', { class: 'pr-factura', text: facturaDe(razonLocal(lid)) }) : null, h('span', { class: 'pr-para', text: 'Pedido a ' + prov.nombre }))),
            h('tr', {}, h('th', { text: 'Producto' }), h('th', { class: 'pr-num', text: 'Cantidad' }), h('th', { text: 'Unidad' }), h('th', { class: 'pr-ok', text: 'Recibido' }))),
          h('tbody', {}, filas.map(x => h('tr', {}, h('td', {}, codProv(x) ? h('span', { class: 'pr-cod', text: codProv(x) }) : null, nombreProd(x)), h('td', { class: 'pr-num', text: fmtNum(x.cant, 3) }), h('td', { text: unidad(x) || '' }), h('td', { class: 'pr-ok' })))));
      }));
  }
  function imprimir(lista) {
    document.querySelectorAll('.print-area').forEach(el => el.remove());
    const area = h('div', { class: 'print-area' }, lista.map(({ prov, os }) => hojaImpresion(prov, os)));
    document.body.append(area);
    document.body.classList.add('imprimiendo');
    const limpiar = () => { document.body.classList.remove('imprimiendo'); area.remove(); window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    window.print();
    setTimeout(limpiar, 1000);
  }

  // Cantidad de cada local dentro del total del proveedor; mientras el pedido no se envió, se corrige ahí mismo.
  function cantLocales(x, alCambiar) {
    const pares = x.pares.slice().sort((a, b) => porTexto(nombreLocal(a.o.local_id), nombreLocal(b.o.local_id)));
    const veces = groupBy(pares, p => p.o.local_id);
    return h('span', { class: 'pp-locales' }, pares.map(({ o, it }) => {
      // si el mismo local lo pidió dos veces (dos encargados), se aclara quién
      const loc = nombreLocal(o.local_id) + (veces.get(o.local_id).length > 1 && o.cargado_por_nombre ? ' · ' + o.cargado_por_nombre : '');
      const ok = o.estado === 'aprobada' ? h('span', { class: 'pp-loc-ok', title: 'Aprobado', 'aria-label': 'aprobado', text: '✓' }) : null;
      if (!editable(o) || fuera.has(it.id)) return h('span', { class: 'pp-loc' }, h('span', { text: loc }), h('b', { class: 'num', text: fmtNum(it.cantidad_pedida, 3) }), ok);
      const inp = h('input', { class: 'input input-sm num pp-loc-inp', type: 'text', inputmode: 'decimal', value: fmtNum(it.cantidad_pedida, 3), 'aria-label': `Cantidad de ${nombreProd(it)} para ${loc}`,
        on: { focus: (ev) => ev.target.select(), change: (ev) => {
          const n = parseNum(ev.target.value);
          if (n === null || n < 0) { ev.target.value = fmtNum(it.cantidad_pedida, 3); return toast('Poné una cantidad válida.', 'error'); }
          if (n === 0 && !confirm(`¿Sacar ${nombreProd(it)} del pedido de ${loc}?`)) { ev.target.value = fmtNum(it.cantidad_pedida, 3); return; }
          x.cant += n - Number(it.cantidad_pedida);
          cambiarQty(o, it, n);
          if (n > 0) alCambiar();
        } } });
      return h('label', { class: 'pp-loc is-edit' }, h('span', { text: loc }), inp, ok);
    }));
  }
  // "Facturar a SUMA ACTIVA S.A.: Umo Grill, Brooklyn · SPMAR S.A.: Shopping"
  const facturasDe = (os) => [...groupBy(os, o => razonLocal(o.local_id) || '')].filter(([r]) => r)
    .map(([r, l]) => `${r}: ${[...new Set(l.map(o => nombreLocal(o.local_id)))].sort(porTexto).join(', ')}`).sort(porTexto).join(' · ');

  function tarjeta(provId, os) {
    const sinProv = provId === SIN;
    const prov = sinProv ? null : G.provs.get(provId);
    const nombre = sinProv ? 'Sin proveedor' : (prov ? prov.nombre : 'Proveedor');
    const tot = total(os.map(o => ({ ...o, orden_items: o.orden_items.filter(i => !fuera.has(i.id)) })));
    const min = prov && prov.pedido_minimo ? Number(prov.pedido_minimo) : 0;
    const hayBorrador = os.some(o => o.estado === 'borrador');
    const estados = [...new Set(os.map(o => o.estado))];
    const pendLocales = [...new Set(os.filter(o => o.estado === 'borrador').map(o => nombreLocal(o.local_id)))].sort(porTexto);

    // productos sumados entre locales (cada local tiene su ficha: se juntan por código del proveedor o por nombre y
    // unidad, como en "Todo junto"); cada uno recuerda sus ítems para poder moverlos o destildarlos juntos
    const m = new Map();
    for (const o of os) for (const it of o.orden_items) {
      const k = (codProv(it) || norm(nombreProd(it))) + '|' + norm(unidad(it) || '');
      const x = m.get(k) || { producto_id: it.producto_id, cant: 0, pares: [], porLocal: new Map() };
      x.cant += Number(it.cantidad_pedida); x.pares.push({ o, it });
      x.porLocal.set(o.local_id, (x.porLocal.get(o.local_id) || 0) + Number(it.cantidad_pedida));
      m.set(k, x);
    }
    const prods = [...m.values()].sort((a, b) => porTexto(nombreProd(a), nombreProd(b)));
    const sugs = sinProv ? prods.map(x => ({ x, s: sugerir(x.producto_id) })).filter(y => y.s) : [];

    const estaFuera = (x) => x.pares.every(p => fuera.has(p.it.id));
    const filas = prods.map(x => {
      const sug = sinProv ? sugerir(x.producto_id) : null;
      const off = !sinProv && estaFuera(x);
      const tot = h('b', { text: fmtNum(x.cant, 3) });
      const chk = sinProv ? null : h('input', { type: 'checkbox', class: 'pp-chk', checked: !off, 'aria-label': `Pedir ${nombreProd(x)}`, on: { change: (e) => {
        cambiarFuera(x.pares.map(p => p.it.id), !e.target.checked);
        pintar();
      } } });
      return h('div', { class: 'pp-fila' + (chk ? ' con-chk' : '') + (off ? ' is-fuera' : ''), 'data-prod': x.producto_id },
        chk ? h('label', { class: 'pp-sel', title: off ? 'No se pide' : 'Se pide' }, chk) : null,
        h('div', { class: 'pp-prod' }, h('b', { text: nombreProd(x) }), cantLocales(x, () => { tot.textContent = fmtNum(x.cant, 3); })),
        h('div', { class: 'pp-cant num' }, tot, h('span', { class: 'mute', text: ' ' + (unidad(x) || '') })),
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
    const btnAprobar = !sinProv && hayBorrador ? h('button', { class: 'btn btn-primary', type: 'button', 'data-accion': 'aprobar', text: 'Aprobar cantidades', on: { click: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await flush(); await cambiarEstado(os.filter(o => o.estado === 'borrador'), 'aprobada'); toast(`${nombre}: aprobado`, 'ok'); pintar(); }
      catch (x) { toast(mensajeError(x), 'error'); b.disabled = false; }
    } } }) : null;
    // Sumar algo que un local no pidió: primero los locales que ya están en esta tarjeta, después el resto.
    const enTarjeta = [...new Set(os.map(o => o.local_id))].sort((a, b) => porTexto(nombreLocal(a), nombreLocal(b)));
    const otrosLocales = G.locales.filter(l => l.activo !== false && !enTarjeta.includes(l.id)).map(l => l.id).sort((a, b) => porTexto(nombreLocal(a), nombreLocal(b)));
    const btnAgregar = !sinProv && os.some(editable) ? h('button', { class: 'btn btn-ghost', type: 'button', 'data-accion': 'agregar', on: { click: () => hojaAgregar({ base: os, locales: [...enTarjeta, ...otrosLocales], provId, alListo: pintar }) } },
      icon('mas', 18), h('span', { text: 'Agregar producto' })) : null;
    const quedan = incluidos(os);
    const sacados = nFuera(os);
    // Primero se aprueba: mientras quede algún local por aprobar no se manda ni se imprime.
    const listo = quedan.length && !hayBorrador;
    const btnWA = !sinProv ? h('button', { class: 'btn ' + (hayBorrador ? 'btn-ghost' : 'btn-primary'), type: 'button', 'data-accion': 'enviar', disabled: !listo, on: { click: async () => {
      try { await flush(); } catch (x) { return toast(mensajeError(x), 'error'); }
      abrirEnvio(prov || { nombre }, incluidos(os), async () => { await marcarEnviado(os); toast(`${nombre}: marcado como enviado`, 'ok'); pintar(); }, sacados);
    } } }, icon(prov && !prov.whatsapp && prov.email ? 'mail' : 'whatsapp', 18), h('span', { text: prov && !prov.whatsapp && prov.email ? 'Enviar por email' : 'Enviar por WhatsApp' })) : null;
    const btnPrint = !sinProv ? h('button', { class: 'btn btn-ghost', type: 'button', 'data-accion': 'imprimir', disabled: !listo, on: { click: async () => {
      try { await flush(); } catch (x) { return toast(mensajeError(x), 'error'); }
      imprimir([{ prov: prov || { nombre }, os: incluidos(os) }]);
      if (!confirm(`¿Marcar el pedido a ${nombre} como enviado?${sacados ? `\n${sacados} ${sacados === 1 ? 'producto destildado sale' : 'productos destildados salen'} del pedido.` : ''}`)) return;
      try { await marcarEnviado(os); toast(`${nombre}: marcado como enviado`, 'ok'); } catch (x) { toast(mensajeError(x), 'error'); }
      pintar();
    } } }, icon('imprimir', 18), h('span', { text: 'Imprimir' })) : null;

    const locales = [...groupBy(os, o => o.local_id)].map(([lid, l]) => `${nombreLocal(lid)}${[...new Set(l.map(o => o.cargado_por_nombre).filter(Boolean))].length ? ' (' + [...new Set(l.map(o => o.cargado_por_nombre).filter(Boolean))].join(', ') + ')' : ''}`);
    return h('section', { class: 'grupo-prov pp' + (sinProv ? ' sin-prov' : ''), 'data-prov': nombre },
      h('header', { class: 'pp-head' },
        h('div', { class: 'pp-tit' }, h('h2', { class: 'gp-t', text: nombre }),
          h('p', { class: 'pp-sub', text: `${sacados ? (prods.filter(x => !estaFuera(x)).length + ' de ') : ''}${prods.length} ${prods.length === 1 ? 'producto' : 'productos'} · ${locales.join(' · ')}` })),
        h('div', { class: 'pp-meta' },
          tot ? h('span', { class: 'gp-c', text: `≈ ${fmtMoney(tot)}` }) : null,
          estados.map(s => h('span', { class: 'estado estado-' + s, text: ESTADOS[s] })))),
      min && tot < min ? h('p', { class: 'gp-nota gp-warn', text: `Pedido mínimo ${fmtMoney(min)}: faltan ${fmtMoney(min - tot)}.` }) : null,
      sacados ? h('p', { class: 'gp-nota gp-info', text: `${sacados} ${sacados === 1 ? 'producto destildado: no se manda ni se imprime' : 'productos destildados: no se mandan ni se imprimen'}. Al marcarlo como enviado sale del pedido.` }) : null,
      !sinProv && hayBorrador ? h('p', { class: 'gp-nota gp-warn pp-falta-aprobar', text: `Revisá las cantidades de cada local y aprobá para poder enviarlo${pendLocales.length ? ' · falta aprobar: ' + pendLocales.join(', ') : ''}.` }) : null,
      !sinProv && facturasDe(os) ? h('p', { class: 'pp-facturar', text: 'Facturar a ' + facturasDe(os) }) : null,
      sinProv ? h('p', { class: 'gp-nota gp-warn', text: sugs.length ? 'Elegí el proveedor de cada producto o usá los sugeridos.' : 'Elegí el proveedor de cada producto.' }) : null,
      prov && !prov.whatsapp ? h('p', { class: 'gp-nota ' + (prov.email ? 'gp-info' : 'gp-warn'), text: prov.email ? `Sin WhatsApp: se manda por email a ${prov.email}.` : 'Sin WhatsApp ni email cargado: cargalo en Catálogo → Proveedores.' }) : null,
      h('div', { class: 'pp-tabla' },
        h('div', { class: 'pp-fila pp-h' + (sinProv ? '' : ' con-chk'), 'aria-hidden': 'true' }, sinProv ? null : h('span', { text: 'Pedir' }), h('span', { text: 'Producto · locales' }), h('span', { class: 'pp-h-tot', text: 'Total' }), h('span', { text: sinProv ? 'Proveedor' : 'Pasar a otro proveedor' })),
        filas),
      h('div', { class: 'acciones' }, btnSugeridos, btnAgregar, btnAprobar, btnPrint, btnWA));
  }

  function vistaProveedor() {
    const vs = vivas();
    const g = groupBy(vs, o => o.proveedor_id || SIN);
    const provs = [...g.keys()].sort((a, b) => (b === SIN) - (a === SIN) || porTexto(nombreProv(a), nombreProv(b)));
    const chkRecordar = h('input', { type: 'checkbox', checked: recordar, on: { change: (e) => { recordar = e.target.checked; lsSet('g:ped:recordar', recordar); } } });
    return [
      provs.length ? h('div', { class: 'pp-barra' },
        h('label', { class: 'check pp-recordar' }, chkRecordar, h('span', { text: 'Al cambiar el proveedor de un producto, guardarlo para los próximos pedidos' })),
        provs.filter(p => p !== SIN).length > 1 ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-accion': 'imprimir-todos', on: { click: async () => {
          try { await flush(); } catch (x) { return toast(mensajeError(x), 'error'); }
          // Solo los proveedores con todo aprobado.
          const lista = provs.filter(p => p !== SIN && !g.get(p).some(o => o.estado === 'borrador')).map(p => ({ prov: G.provs.get(p) || { nombre: nombreProv(p) }, os: incluidos(g.get(p)) })).filter(x => x.os.length);
          if (!lista.length) return toast('Aprobá primero los pedidos que quieras imprimir.', 'error');
          imprimir(lista);
        } } }, icon('imprimir', 18), h('span', { text: 'Imprimir todos (uno por hoja)' })) : null) : null,
      ...(provs.length ? provs.map(p => tarjeta(p, g.get(p))) : [vacio('No hay pedidos para armar', 'Lo que manden los locales y esté en revisión o aprobado aparece acá, agrupado por proveedor.')])
    ];
  }

  // ---------- borrar todos los pedidos (pruebas) ----------
  function pedirBorrarTodo() {
    const conf = h('input', { class: 'input', id: 'in-borrar', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'BORRAR' });
    const si = h('button', { class: 'btn btn-primary btn-peligro btn-block', type: 'button', 'data-accion': 'borrar-todo-si', disabled: true, text: 'Borrar todos los pedidos' });
    conf.addEventListener('input', () => { si.disabled = conf.value.trim().toUpperCase() !== 'BORRAR'; });
    const { cerrar } = hoja('Borrar todos los pedidos', h('div', { class: 'borrar-imp' },
      h('p', { text: 'Se borran todos los pedidos de todos los locales, en cualquier estado: por revisar, aprobados, enviados y recibidos.' }),
      banner('Lo que entró al stock al recibir esos pedidos se descuenta. El catálogo, los proveedores, las ventas, las recetas y los pagos no se tocan. No se puede deshacer.', 'error'),
      campo('Escribí BORRAR para confirmar', conf),
      h('div', { class: 'acciones' }, si, h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'No, dejarlos', on: { click: () => cerrar() } }))));
    conf.focus();
    si.addEventListener('click', async () => {
      si.disabled = true; si.textContent = 'Borrando…';
      for (const p of pend.values()) clearTimeout(p.timer);
      pend.clear();
      try {
        const r = await borrarTodosLosPedidos(conf.value.trim());
        cerrar();
        ordenes = []; fuera = new Set(); lsSet('g:ped:fuera', []); abiertos.clear();
        limpiarCache();   // el stock también cambió
        toast(`Pedidos borrados: ${r.pedidos}${r.movimientos ? ` · ${r.movimientos} entradas de stock descontadas` : ''}`, 'ok');
        pintar();
      } catch (e) { toast(mensajeError(e), 'error'); si.disabled = false; si.textContent = 'Borrar todos los pedidos'; }
    });
  }

  const zonaPruebas = () => h('section', { class: 'zona-pruebas', 'aria-label': 'Pruebas' },
    h('div', null, h('b', { text: 'Pruebas' }), h('span', { class: 'mute', text: 'Dejá la app limpia antes de empezar a usarla en serio.' })),
    h('button', { class: 'btn btn-text btn-danger', type: 'button', 'data-accion': 'borrar-todo', on: { click: pedirBorrarTodo } }, 'Borrar todos los pedidos'));

  // ---------- pantalla ----------
  const titulo = vista === 'locales' ? 'Pedidos' : 'Compras';
  const nav = vista === 'locales' ? null : subnav(SUBNAV_COMPRAS, 'compras');

  function pintar() {
    if (!ctx.alive()) return;
    if (vista === 'proveedor') {
      return mount(root,
        h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: titulo }),
          h('p', { class: 'sub', text: 'Lo pendiente de todos los locales, sumado por proveedor para aprobar y mandar' })),
        nav, ...vistaProveedor());
    }
    // En Pedidos, un acceso a Compras cuando hay proveedores esperando que se les mande el pedido.
    const nProv = new Set(vivas().map(o => o.proveedor_id || SIN)).size;
    mount(root,
      h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: titulo }),
        h('p', { class: 'sub', text: 'Qué pidió cada local, quién y cuándo' }),
        h('div', { class: 'ped-accesos' },
          h('a', { class: 'btn btn-ghost btn-cargar', href: '#/cargar', 'data-accion': 'cargar' }, icon('mas', 18), h('span', { text: 'Cargar pedido para un local' })),
          nProv ? h('a', { class: 'btn btn-ghost', href: '#/compras', 'data-accion': 'ir-compras' }, icon('pedir', 18), h('span', { text: `Mandar a proveedores · ${nProv}` })) : null)),
      ...vistaLocales(),
      zonaPruebas());
  }

  mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: titulo })), nav, esqueleto(3));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  const desde = sumarDias(hoyISO(), -30);
  await swr('g:ord:tabla', async () => {
    const [vs, hist] = await Promise.all([ordenesPorEstado(VIVAS), ordenesHistorial(desde)]);
    return [...vs, ...hist];
  }, async (d, deCache) => {
    if (pend.size) return;
    ordenes = d.map(o => ({ ...o, orden_items: o.orden_items || [] }));
    if (deCache) fuera = new Set([...lsGet('g:ped:fuera', []), ...ordenes.flatMap(o => o.orden_items.filter(i => i.excluido).map(i => i.id))]);
    else await leerFuera();
    pintar();
  });
  return () => { flush().catch(() => {}); };
}
