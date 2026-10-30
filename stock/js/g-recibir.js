// Gerencia · Recibir: órdenes enviadas; cantidad recibida y precio por ítem; genera movimientos de recepción.
// Se corrige el pedido con lo que trajo el proveedor: «No vino» deja lo pedido como faltante y «Agregar producto» suma
// algo que no estaba en el pedido (migración 0020).
// Arriba, las facturas que subieron los locales (migración 0022): se leen con «Recibir con factura» o se descartan.
import { mount, h, fmtNum, parseNum, porTexto, fechaCorta, ESTADOS, tokens, coincide, esCarta, plural } from './util.js';
import { swr, ordenesPorEstado, registrarRecepcion, facturasLocales, marcarFacturaLocal, urlComprobante, mensajeError } from './api.js';
import { G, cargarG, nombreLocal, refrescarPrecio } from './datos.js';
import { esqueleto, vacio, toast, icon, hoja } from './ui.js';

const ESPERA = ['enviada', 'parcial'];

export async function render(root, ctx) {
  let ordenes = [];
  let subidas = [];
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Recibir' }), h('p', { class: 'sub', text: 'Pedidos enviados que esperan mercadería' }),
    h('a', { class: 'btn btn-primary rec-factura', href: '#/recibir-factura' }, icon('recibir', 18), h('span', { text: 'Recibir con factura' })),
    h('p', { class: 'sub rec-factura-h', text: 'Foto o PDF de la factura: sirve también para lo que se pidió fuera de la app.' }));

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
      f.inQty = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: extra ? '1' : (f.noVino ? '0' : fmtNum(falta, 3) || '0'), 'aria-label': `Cantidad recibida de ${p.nombre}`,
        on: { focus: (e) => e.target.select(), input: actualizar } });
      f.inPrecio = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: precioPrevio === null ? '' : String(precioPrevio).replace('.', ','), placeholder: '0', 'aria-label': `Costo unitario de ${p.nombre}` });
      return f;
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
        accion);
    }

    function actualizar() {
      const deMenos = filas.filter(f => !f.extra && !f.noVino && f.falta > 0 && qtyDe(f) < f.falta);
      const noVino = filas.filter(f => f.noVino && f.falta > 0);
      const extras = filas.filter(f => f.extra && qtyDe(f) > 0);
      cerrarBox.hidden = !deMenos.length;
      const partes = [];
      if (noVino.length) partes.push(`${noVino.length} ${noVino.length === 1 ? 'producto no vino' : 'productos no vinieron'}`);
      if (deMenos.length) partes.push(`${deMenos.length} ${deMenos.length === 1 ? 'llegó' : 'llegaron'} de menos`);
      if (extras.length) partes.push(`${extras.length} ${extras.length === 1 ? 'agregado que no estaba' : 'agregados que no estaban'} en el pedido`);
      resumen.textContent = partes.length ? partes.join(' · ') : 'Llegó todo lo pedido';
      resumen.classList.toggle('rf-alerta', !!(noVino.length || deMenos.length));
    }

    function pintarFilas() { lista.replaceChildren(...filas.map(filaEl)); actualizar(); }

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

    const btnAgregar = h('button', { class: 'btn btn-ghost btn-block rec-agregar', type: 'button', on: { click: agregar } }, icon('mas', 18), h('span', { text: 'Agregar producto que no estaba en el pedido' }));
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Confirmar recepción', on: { click: async () => {
      const lineas = filas.map(f => {
        const pr = parseNum(f.inPrecio.value);
        return { item: f.extra ? { producto_id: f.it.producto_id } : f.it, qty: qtyDe(f), precio: pr === null ? null : pr, precioPrevio: f.precioPrevio, factor: f.p.factor_conversion, noVino: f.noVino && !f.it.no_vino };
      }).filter(l => l.item.id || l.qty > 0);
      if (!lineas.some(l => l.qty > 0) && !confirm('No cargaste ninguna cantidad. ¿Cerrar la orden igual?')) return;
      const cerrarFalt = !cerrarBox.hidden && chkCerrar.checked;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const estado = await registrarRecepcion(o, lineas, cerrarFalt);
        const completa = estado === 'recibida';
        lineas.forEach(l => { if (l.qty > 0 && l.precio !== null) refrescarPrecio(l.item.producto_id, l.precio); });
        toast(completa ? 'Recepción completa. Stock actualizado.' : 'Recepción parcial guardada.', 'ok');
        if (completa) { ordenes = ordenes.filter(x => x.id !== o.id); pintar(); }
        else { ordenes = await ordenesPorEstado(ESPERA); pintar(); }
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Confirmar recepción'; }
    } } });
    pintarFilas();
    return h('section', { class: 'grupo-prov', 'data-orden': o.id },
      h('header', { class: 'gp-head' }, h('h2', { class: 'gp-t', text: prov ? prov.nombre : 'Proveedor' }), h('span', { class: 'estado estado-' + o.estado, text: ESTADOS[o.estado] })),
      h('p', { class: 'orden-m', text: `${nombreLocal(o.local_id)} · ${fechaCorta(o.creado_en)}` }),
      lista, btnAgregar, resumen, cerrarBox, btn);
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
      h('header', { class: 'gp-head' }, h('h2', { class: 'gp-t', text: 'Facturas que subieron los locales' }), h('span', { class: 'estado estado-borrador', text: String(subidas.length) })),
      h('p', { class: 'orden-m', text: 'Los encargados mandan la foto sin ver precios: leela acá para sumar el stock y cargar los montos.' }),
      ...subidas.map(tarj));
  }

  function pintar() {
    if (!ctx.alive()) return;
    mount(root, cab, subidasEl(), ...(ordenes.length ? ordenes.map(tarjeta) : [vacio('Nada para recibir', 'Los pedidos enviados por WhatsApp aparecen acá. Si llegó algo pedido por fuera, usá «Recibir con factura».')]));
  }
  mount(root, cab, esqueleto(3));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  facturasLocales({ estado: 'pendiente', limite: 50 }).then((d) => { subidas = d; pintar(); }).catch(() => { /* sin SQL 0022 todavía */ });
  await swr('g:ord:env', () => ordenesPorEstado(ESPERA), (d) => { ordenes = d; pintar(); });
}
