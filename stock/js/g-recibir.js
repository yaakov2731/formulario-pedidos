// Gerencia · Recibir: órdenes enviadas; cantidad recibida y precio por ítem; genera movimientos de recepción.
// Se corrige el pedido con lo que trajo el proveedor: «No vino» deja lo pedido como faltante y «Agregar producto» suma
// algo que no estaba en el pedido (migración 0020).
// Arriba, las facturas que subieron los locales (migración 0022): se leen con «Recibir con factura» o se descartan.
// Cada orden abre con lo pedido cargado: si llegó todo, un toque («Llegó todo»); si no, se corrigen las filas y queda
// «Llegó incompleto» con el faltante registrado, que se reclama al proveedor por WhatsApp («Reclamar faltante»).
// Al cargar el costo, si sube más de 5 % contra el último precio pagado al mismo proveedor, la fila lo avisa.
import { mount, h, fmtNum, parseNum, porTexto, fechaCorta, tokens, coincide, esCarta, plural, lsGet, lsSet, hoyISO, sumarDias } from './util.js';
import { swr, ordenesPorEstado, ordenesHistorial, registrarRecepcion, facturasLocales, marcarFacturaLocal, urlComprobante, historialPrecios, mensajeError } from './api.js';
import { G, cargarG, nombreLocal, razonLocal, refrescarPrecio } from './datos.js';
import { esqueleto, vacio, toast, icon, hoja, subnav, banner, listaGrupo, filaLista, SUBNAV_COMPRAS } from './ui.js';
import { estadoCompra, textoEstado, claseEstado, faltantesDe, textoReclamo, subaPrecio, textoSuba, ultimoPrecio } from './compras-estado.js';
import { whatsappAR } from './pagos-util.js';

const ESPERA = ['enviada', 'parcial'];
const DIAS_INCOMPLETAS = 7;
const nombreProd = (id) => (G.prods.get(id) || {}).nombre || 'Producto';

// Hoja con el texto para reclamar lo que faltó: se abre el chat del proveedor con el mensaje o se copia.
export function abrirReclamo(o, alReclamar) {
  const prov = G.provs.get(o.proveedor_id) || { nombre: 'Proveedor' };
  const filas = faltantesDe(o).map(x => { const p = G.prods.get(x.producto_id) || {}; return { ...x, nombre: p.nombre || 'Producto', unidad: p.unidad_compra || '' }; })
    .sort((a, b) => porTexto(a.nombre, b.nombre));
  const texto = textoReclamo({ proveedor: prov.nombre, contacto: prov.contacto, local: nombreLocal(o.local_id), razon: razonLocal(o.local_id), fecha: o.creado_en, filas });
  const digitos = whatsappAR(prov.whatsapp);
  const u = (x, n) => (x.unidad ? ' ' + plural(x.unidad, n) : '');
  const listo = (msg) => { if (alReclamar) alReclamar(o); toast(msg, 'info'); cerrar(); };
  const { cerrar } = hoja('Reclamar faltante', h('div', { class: 'form rec-reclamo' },
    h('p', { class: 'sub', 'data-destino': '', text: `Para ${prov.nombre}${prov.contacto ? ' (' + prov.contacto + ')' : ''}${prov.whatsapp ? ' · WhatsApp ' + prov.whatsapp : ''}` }),
    listaGrupo(null, filas.map(x => filaLista({ texto: x.nombre, sub: `Pedido ${fmtNum(x.pedido, 3)} · llegó ${fmtNum(x.llego, 3)}`, valor: `Falta ${fmtNum(x.falta, 3)}${u(x, x.falta)}`, clase: 'rec-rf' })), { clase: 'rec-reclamo-lista' }),
    h('div', { class: 'aviso-txt', 'data-reclamo': '', text: texto }),
    digitos ? h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', 'data-accion': 'reclamo-wa', on: { click: () => {
      window.open(`https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      listo('Se abrió WhatsApp con el reclamo.');
    } } }, icon('whatsapp', 20), h('span', { text: 'Abrir WhatsApp con el mensaje' })) : banner(`${prov.nombre} no tiene WhatsApp cargado: copiá el texto o cargalo en Proveedores.`, 'warn'),
    h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-accion': 'reclamo-copiar', on: { click: async () => {
      try { await navigator.clipboard.writeText(texto); listo('Texto copiado.'); } catch (_e) { toast('No se pudo copiar: seleccioná el texto.', 'error'); }
    } } }, h('span', { text: 'Copiar texto' }))));
}

export async function render(root, ctx) {
  let ordenes = [];
  let subidas = [];
  let incompletas = [];   // recibidas en los últimos días con algo que no llegó
  let precios = null;     // historial de precios (null = todavía no o no se pudo leer: se compara con el precio actual)
  let reclamados = new Set(lsGet('g:rec:reclamados', []));
  const marcarReclamado = (o) => { reclamados.add(o.id); lsSet('g:rec:reclamados', [...reclamados].slice(-200)); pintar(); };
  // Misma cabecera que Compras (título y pestañas arriba) para que no salte al cambiar entre Enviar, Recibir y Gasto.
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Recibir' }), h('p', { class: 'sub', text: 'Pedidos enviados que esperan mercadería' }));
  const nav = [subnav(SUBNAV_COMPRAS, 'recibir'), h('div', { class: 'vista-head rec-factura-box' },
    h('a', { class: 'btn btn-ghost rec-factura', href: '#/recibir-factura' }, icon('recibir', 18), h('span', { text: 'Recibir con factura' })))];

  function tarjeta(o) {
    const prov = G.provs.get(o.proveedor_id);
    const nombre = (id) => (G.prods.get(id) || {}).nombre || '';
    const precioDe = (id) => (G.precios.has(id) ? G.precios.get(id) : null);
    const filas = o.orden_items.slice().sort((a, b) => porTexto(nombre(a.producto_id), nombre(b.producto_id))).map(it => nuevaFila(it, false));
    const lista = h('div', { class: 'rec-lista' });
    const resumen = h('p', { class: 'rec-resumen', 'aria-live': 'polite' });
    const chkCerrar = h('input', { type: 'checkbox', 'aria-label': 'Lo que llegó de menos no va a venir', on: { change: actualizar } });
    const cerrarBox = h('label', { class: 'rf-check rec-cerrar', hidden: true }, chkCerrar,
      h('span', {}, h('b', { text: 'Lo que llegó de menos no va a venir. ' }), 'Queda como faltante y el pedido se da por recibido. Si no lo marcás, el pedido queda abierto esperando el resto.'));

    function nuevaFila(it, extra) {
      const p = G.prods.get(it.producto_id) || {};
      const falta = extra ? 0 : Math.max(0, Number(it.cantidad_pedida) - (Number(it.cantidad_recibida) || 0));
      const precioPrevio = precioDe(it.producto_id);
      const f = { it, p, extra, falta, precioPrevio, noVino: !extra && !!it.no_vino };
      f.suba = h('p', { class: 'rec-suba', 'aria-live': 'polite', hidden: true });
      f.inQty = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: extra ? '1' : (f.noVino ? '0' : fmtNum(falta, 3) || '0'), 'aria-label': `Cantidad recibida de ${p.nombre}`,
        on: { focus: (e) => e.target.select(), input: actualizar } });
      f.inPrecio = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: precioPrevio === null ? '' : String(precioPrevio).replace('.', ','), placeholder: 'Falta cargar', 'aria-label': `Costo unitario de ${p.nombre}`,
        on: { input: () => avisoSuba(f) } });
      return f;
    }
    // Último precio pagado a este proveedor (historial); sin historial, el precio actual del producto.
    function avisoSuba(f) {
      const previo = precios ? ultimoPrecio(precios, f.it.producto_id, o.proveedor_id) : f.precioPrevio;
      const s = subaPrecio(parseNum(f.inPrecio.value), previo);
      f.suba.hidden = !s;
      f.suba.textContent = s ? textoSuba(s) : '';
    }
    const qtyDe = (f) => { if (f.noVino) return 0; const q = parseNum(f.inQty.value); return q === null || q < 0 ? 0 : q; };
    const uc = (f, n) => (f.p.unidad_compra ? ' ' + plural(f.p.unidad_compra, n) : '');

    function filaEl(f) {
      const ya = Number(f.it.cantidad_recibida) || 0;
      const meta = f.extra || f.it.agregado ? `No estaba en el pedido${ya ? ` · ya llegó ${fmtNum(ya, 3)}` : ''}`
        : `Pedido ${fmtNum(f.it.cantidad_pedida, 3)}${uc(f, f.it.cantidad_pedida)}${ya ? ` · ya llegó ${fmtNum(ya, 3)}` : ''}`;
      f.inQty.disabled = f.noVino;
      const accion = f.extra
        ? h('button', { class: 'btn btn-ghost btn-sm rec-acc', type: 'button', 'aria-label': `Quitar ${f.p.nombre}`, on: { click: () => { filas.splice(filas.indexOf(f), 1); pintarFilas(); } } }, icon('cerrar', 16), h('span', { text: 'Quitar' }))
        : f.it.agregado || !f.falta ? null : h('button', { class: 'btn btn-ghost btn-sm rec-acc', type: 'button', 'aria-pressed': String(f.noVino), 'aria-label': f.noVino ? `Sí vino ${f.p.nombre}` : `No vino ${f.p.nombre}`,
          on: { click: () => { f.noVino = !f.noVino; if (!f.noVino && !parseNum(f.inQty.value)) f.inQty.value = fmtNum(f.falta, 3) || '0'; if (f.noVino) f.inQty.value = '0'; pintarFilas(); } } },
        h('span', { text: f.noVino ? 'Sí vino' : 'No vino' }));
      return h('article', { class: 'prod prod-rec' + (f.noVino ? ' is-off' : '') + (f.extra ? ' rec-extra' : ''), 'data-producto': f.it.producto_id },
        h('h3', { class: 'prod-n', text: f.p.nombre || 'Producto' }),
        h('p', { class: 'prod-m' }, meta, f.extra || f.it.agregado ? h('span', { class: 'estado estado-aprobada', text: 'Agregado' }) : null),
        f.noVino ? h('p', { class: 'rec-falta', text: `No vino: quedan ${fmtNum(f.falta, 3)}${uc(f, f.falta)} como faltante` }) : h('div', { class: 'rec-campos' },
          h('label', { class: 'rec-c' }, h('span', { text: 'Llegó' }), f.inQty),
          h('label', { class: 'rec-c' }, h('span', { text: 'Costo unitario' }), f.inPrecio)),
        f.noVino ? null : f.suba,
        accion);
    }

    function actualizar() {
      const deMenos = filas.filter(f => !f.extra && !f.noVino && f.falta > 0 && qtyDe(f) < f.falta);
      const noVino = filas.filter(f => f.noVino && !f.it.no_vino && f.falta > 0); // lo marcado en una recepción anterior ya quedó registrado
      const extras = filas.filter(f => f.extra && qtyDe(f) > 0);
      cerrarBox.hidden = !deMenos.length;
      const partes = [];
      if (noVino.length) partes.push(`${noVino.length} ${noVino.length === 1 ? 'producto no vino' : 'productos no vinieron'}`);
      if (deMenos.length) partes.push(`${deMenos.length} ${deMenos.length === 1 ? 'llegó' : 'llegaron'} de menos`);
      if (extras.length) partes.push(`${extras.length} ${extras.length === 1 ? 'agregado que no estaba' : 'agregados que no estaban'} en el pedido`);
      const incompleto = !!(noVino.length || deMenos.length);
      // Con lo pedido tal cual, un toque: «Llegó todo». Con algo corregido, se confirma lo que llegó.
      const tal = !partes.length && filas.every(f => f.extra || f.it.no_vino || !f.falta || Math.abs(qtyDe(f) - f.falta) < 1e-9);
      resumen.textContent = incompleto ? 'Llegó incompleto · ' + partes.join(' · ') : partes.length ? partes.join(' · ') : tal ? (filas.some(f => f.it.no_vino || Number(f.it.cantidad_recibida)) ? 'Llegó lo que faltaba' : 'Llegó todo lo pedido') : 'Llegó más de lo pedido';
      resumen.classList.toggle('rf-alerta', incompleto);
      if (!btn.disabled) btn.textContent = tal ? 'Llegó todo' : 'Confirmar recepción';
      btn.dataset.accion = tal ? 'llego-todo' : 'confirmar';
      btnVolver.hidden = tal;
    }

    function pintarFilas() { lista.replaceChildren(...filas.map(filaEl)); filas.forEach(avisoSuba); actualizar(); }
    // Vuelve a lo pedido: saca los agregados y deja cada fila con lo que falta recibir.
    const btnVolver = h('button', { class: 'btn btn-text btn-sm rec-volver', type: 'button', text: 'Volver a lo pedido', hidden: true, on: { click: () => {
      for (let i = filas.length - 1; i >= 0; i--) if (filas[i].extra) filas.splice(i, 1);
      filas.forEach(f => { if (f.it.no_vino) return; f.noVino = false; f.inQty.value = fmtNum(f.falta, 3) || '0'; });
      chkCerrar.checked = false; pintarFilas();
    } } });

    function agregar() {
      const prodsLocal = [...G.prods.values()].filter(p => p.local_id === o.local_id && p.activo !== false && !p.es_elaborado && !esCarta(p));
      const delProv = prodsLocal.filter(p => p.proveedor_id === o.proveedor_id).sort((a, b) => porTexto(a.nombre, b.nombre));
      let t = '';
      const opciones = h('div', { class: 'lista lista-sheet' });
      const elegir = (p) => {
        cerrar();
        const ya = filas.find(f => f.it.producto_id === p.id);
        if (ya) {
          if (ya.noVino) { ya.noVino = false; ya.inQty.value = fmtNum(ya.falta, 3) || '0'; pintarFilas(); }
          toast(`${p.nombre} ya está en el pedido: corregí cuánto llegó.`, 'info'); ya.inQty.focus(); return;
        }
        const f = nuevaFila({ producto_id: p.id, cantidad_pedida: 0, cantidad_recibida: 0 }, true);
        filas.push(f); pintarFilas(); f.inQty.focus();
      };
      const pintarOpc = () => {
        const tk = tokens(t);
        const base = t.trim() ? prodsLocal.filter(p => coincide(p.nombre + ' ' + (p.codigo || ''), tk)).sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 40) : delProv.slice(0, 40);
        opciones.replaceChildren(...(base.length ? base.map(p => h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Agregar ${p.nombre}`, on: { click: () => elegir(p) } },
          h('span', { class: 'prod-n', text: p.nombre }), h('span', { class: 'prod-m' }, h('span', { class: 'num', text: p.codigo || '' }), h('span', { text: p.unidad_compra || p.unidad_uso || '' }), h('span', { text: (G.provs.get(p.proveedor_id) || {}).nombre || '' })))) :
          [vacio(t.trim() ? `No está en el catálogo de ${nombreLocal(o.local_id)}` : 'Buscá el producto', t.trim() ? 'Probá con otra palabra o cargalo en Catálogo.' : 'Escribí el nombre o el código.')]));
      };
      const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto para agregar', autocomplete: 'off', on: { input: (e) => { t = e.target.value; pintarOpc(); } } });
      const { cerrar } = hoja('Agregar producto', h('div', { class: 'rf-elegir' },
        h('p', { class: 'sub', text: `Algo que trajo ${prov ? prov.nombre : 'el proveedor'} y no estaba en el pedido de ${nombreLocal(o.local_id)}.` }), buscador, opciones));
      pintarOpc(); setTimeout(() => buscador.focus(), 50);
    }

    const btnAgregar = h('button', { class: 'btn btn-ghost btn-block rec-agregar', type: 'button', on: { click: agregar }, 'aria-label': 'Agregar producto que no estaba en el pedido' }, icon('mas', 18), h('span', { text: 'Agregar producto' }));
    const btn = h('button', { class: 'btn btn-primary btn-block rec-ok', type: 'button', text: 'Llegó todo', on: { click: async () => {
      const lineas = filas.map(f => {
        const pr = parseNum(f.inPrecio.value);
        return { item: f.extra ? { producto_id: f.it.producto_id } : f.it, qty: qtyDe(f), precio: pr === null ? null : pr, precioPrevio: f.precioPrevio, factor: f.p.factor_conversion, noVino: f.noVino && !f.it.no_vino };
      }).filter(l => l.item.id || l.qty > 0);
      if (!lineas.some(l => l.qty > 0) && !confirm('No cargaste ninguna cantidad. ¿Cerrar la orden igual?')) return;
      const cerrarFalt = !cerrarBox.hidden && chkCerrar.checked;
      const texto = btn.textContent;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await registrarRecepcion(o, lineas, cerrarFalt);
        lineas.forEach(l => { if (l.qty > 0 && l.precio !== null) refrescarPrecio(l.item.producto_id, l.precio); });
        await recargar();
        const nueva = [...ordenes, ...incompletas].find(x => x.id === o.id);
        const incompleto = nueva && estadoCompra(nueva) === 'incompleto';
        if (incompleto) toast('Recepción guardada: llegó incompleto. El faltante quedó registrado.', 'ok', { accion: 'Reclamar', onAccion: () => abrirReclamo(nueva, marcarReclamado), ms: 8000 });
        else toast('Recepción guardada: llegó todo. Stock actualizado.', 'ok');
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = texto; }
    } } });
    pintarFilas();
    const k = estadoCompra(o);
    const falt = faltantesDe(o);
    return h('section', { class: 'grupo-prov', 'data-orden': o.id, 'data-estado': k },
      h('header', { class: 'gp-head rec-head' }, h('h2', { class: 'gp-t', text: prov ? prov.nombre : 'Proveedor' }), h('span', { class: claseEstado(k), text: textoEstado(k) })),
      h('p', { class: 'orden-m', text: `${nombreLocal(o.local_id)} · ${fechaCorta(o.creado_en)}` }),
      falt.length ? h('div', { class: 'rec-falt-box' },
        h('p', { class: 'rec-falt-t', text: `Falta llegar: ${falt.map(x => nombreProd(x.producto_id)).join(', ')}` }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-accion': 'reclamar', on: { click: () => abrirReclamo(o, marcarReclamado) } }, icon('whatsapp', 16), h('span', { text: 'Reclamar faltante' }))) : null,
      lista, btnAgregar, resumen, cerrarBox, btn, btnVolver);
  }

  // Recibidas en los últimos días con faltante: una fila por orden, tocarla abre el reclamo.
  function incompletasEl() {
    if (!incompletas.length) return null;
    const filas = incompletas.map(o => {
      const prov = G.provs.get(o.proveedor_id);
      const n = faltantesDe(o).length;
      return filaLista({ texto: prov ? prov.nombre : 'Proveedor', sub: `${nombreLocal(o.local_id)} · ${fechaCorta(o.creado_en).split(' · ')[0]}${reclamados.has(o.id) ? ' · Reclamado' : ''}`,
        valor: n === 1 ? 'Falta 1' : `Faltan ${n}`, chevron: true, onClick: () => abrirReclamo(o, marcarReclamado), clase: 'rec-inc', attrs: { 'data-incompleta': o.id, 'aria-label': `Reclamar faltante a ${prov ? prov.nombre : 'proveedor'}` } });
    });
    return listaGrupo('Llegó incompleto', filas, { clase: 'rec-incompletas', pie: 'Tocá una para reclamar el faltante.' });
  }
  async function recargar() {
    const [esp, hist] = await Promise.all([ordenesPorEstado(ESPERA), ordenesHistorial(sumarDias(hoyISO(), -DIAS_INCOMPLETAS)).catch(() => null)]);
    ordenes = esp;
    if (hist) incompletas = hist.filter(o => o.estado === 'recibida' && faltantesDe(o).length);
    pintar();
  }

  // Facturas que subieron los encargados: ver el archivo, leerla y recibir, o descartarla (repetida, no es factura).
  function subidasEl() {
    if (!subidas.length) return null;
    const tarj = (s) => {
      const prov = G.provs.get(s.proveedor_id);
      const archivos = s.archivos || [];
      const ver = archivos.map((a, i) => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: /\.pdf$/i.test(a) ? 'Ver PDF' : (archivos.length > 1 ? `Foto ${i + 1}` : 'Ver foto'),
        on: { click: async () => { try { window.open(await urlComprobante(a), '_blank', 'noopener'); } catch (e) { toast(mensajeError(e), 'error'); } } } }));
      const descartar = h('button', { class: 'btn btn-text btn-sm', type: 'button', text: 'Descartar', on: { click: async () => {
        if (!confirm('¿Descartar esta factura? (por ejemplo si está repetida o ya la cargaste)')) return;
        descartar.disabled = true;
        try { await marcarFacturaLocal(s.id, 'descartada'); subidas = subidas.filter(x => x.id !== s.id); pintar(); toast('Factura descartada', 'ok'); }
        catch (e) { descartar.disabled = false; toast(mensajeError(e), 'error'); }
      } } });
      return h('article', { class: 'prod fl-item', 'data-subida': s.id },
        h('h3', { class: 'prod-n', text: `${nombreLocal(s.local_id)} · ${prov ? prov.nombre : 'Proveedor sin indicar'}` }),
        h('p', { class: 'prod-m' }, h('span', { text: fechaCorta(s.creado_en) }), s.subida_por_nombre ? h('span', { text: 'Subió ' + s.subida_por_nombre }) : null),
        s.nota ? h('p', { class: 'sf-nota', text: s.nota }) : null,
        h('div', { class: 'fl-acc' }, h('a', { class: 'btn btn-primary btn-sm', href: '#/recibir-factura/' + s.id }, icon('recibir', 16), h('span', { text: 'Leer y recibir' })), ...ver, descartar));
    };
    return h('section', { class: 'grupo-prov fl-grupo' },
      h('header', { class: 'gp-head rec-head' }, h('h2', { class: 'gp-t', text: 'Facturas de los locales' }), h('span', { class: 'estado', text: String(subidas.length) })),
      ...subidas.map(tarj));
  }

  function pintar() {
    if (!ctx.alive()) return;
    mount(root, cab, ...nav, subidasEl(), ...(ordenes.length ? ordenes.map(tarjeta) : [vacio('Nada para recibir', 'Los pedidos enviados por WhatsApp aparecen acá. Si llegó algo pedido por fuera, usá «Recibir con factura».')]), incompletasEl());
  }
  mount(root, cab, ...nav, esqueleto(3));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  facturasLocales({ estado: 'pendiente', limite: 50 }).then((d) => { subidas = d; pintar(); }).catch(() => { /* sin SQL 0022 todavía */ });
  ordenesHistorial(sumarDias(hoyISO(), -DIAS_INCOMPLETAS)).then((d) => { incompletas = d.filter(o => o.estado === 'recibida' && faltantesDe(o).length); pintar(); }).catch(() => { /* sin historial: no hay lista de incompletas */ });
  await swr('g:ord:env', () => ordenesPorEstado(ESPERA), (d) => {
    ordenes = d; pintar();
    // Historial de precios de lo que se espera, para avisar subas (sin él se compara con el precio actual).
    historialPrecios(d.flatMap(o => o.orden_items.map(i => i.producto_id))).then((r) => { precios = r; pintar(); }).catch(() => { /* sin permiso o sin red */ });
  });
}
