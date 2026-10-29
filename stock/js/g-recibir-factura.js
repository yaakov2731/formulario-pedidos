// Gerencia · Recibir con factura: foto(s) o PDF de la factura → la Edge Function leer-factura la lee → cada renglón se cruza
// con el catálogo del local (factura-match.js) → se revisa y corrige → recibir_con_factura suma stock, guarda precios,
// aprende los nombres del proveedor y deja la factura en Pagos. Sirve para pedidos hechos fuera de la app y,
// si hay un pedido abierto del mismo proveedor y local, lo da por recibido y muestra lo que faltó.
import { mount, h, fmtNum, fmtMoney, parseNum, porTexto, hoyISO, esCarta, tokens, coincide, lsGet, lsSet, plural } from './util.js';
import { leerFactura, aliasProveedor, recibirConFactura, ordenesPorEstado, subirComprobante, mensajeError } from './api.js';
import { G, cargarG, nombreLocal, refrescarPrecio } from './datos.js';
import { esqueleto, banner, campo, hoja, toast, icon, vacio } from './ui.js';
import { proveedorDe, cruzarRenglones, compararConPedido, facturaParcial } from './factura-match.js';
import { rutaFactura, fechaDMA, TIPOS_COMPROBANTE, tipoComprobante, numeroReciboX } from './pagos-util.js';

const LADO_MAX = 1568;           // px del lado largo: Claude achica a esto igual, más grande solo tarda más en subir
const PDF_MAX = 9 * 1024 * 1024;

// Foto del celular → JPEG más liviano (las de 12 MP pesan 4–6 MB). Devuelve { data (base64), tipo, img }.
async function achicarFoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo abrir la foto ' + file.name)); i.src = url; });
    const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.8);
    return { data: dataUrl.split(',')[1], tipo: 'image/jpeg', canvas: c };
  } finally { URL.revokeObjectURL(url); }
}
const aBase64 = (file) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => mal(r.error); r.readAsDataURL(file); });
const base64ABlob = (b64, tipo) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: tipo }); };
// Varias fotos → una sola imagen (una debajo de la otra) para guardar como archivo de la factura.
function unirFotos(canvases) {
  if (canvases.length === 1) return canvases[0];
  const w = Math.max(...canvases.map(c => c.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = canvases.reduce((s, x) => s + Math.round(x.height * w / x.width), 0);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  let y = 0; for (const x of canvases) { const hh = Math.round(x.height * w / x.width); g.drawImage(x, 0, y, w, hh); y += hh; }
  return c;
}
const isoValido = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : '';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Recibir con factura' }),
    h('p', { class: 'sub', text: 'Sacale una foto a la factura o subí el PDF: la app lee los productos y suma el stock' }));
  const volver = h('a', { class: 'btn btn-text', href: '#/recibir', text: '← Volver a Recibir' });
  mount(root, cab, esqueleto(3));
  try { await cargarG(['prods', 'provs', 'locales', 'precios'], () => {}); }
  catch (e) { if (ctx.alive()) mount(root, cab, banner(mensajeError(e), 'error')); return; }
  if (!ctx.alive()) return;

  const locales = G.locales.filter(l => l.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));
  const provs = [...G.provs.values()].filter(p => p.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));
  let localId = lsGet('g:rf:local') || lsGet('g:local') || (locales[0] || {}).id;
  if (!locales.some(l => l.id === localId)) localId = (locales[0] || {}).id;
  let fotos = [];        // [{ file, data, tipo, canvas }]
  let pdf = null;        // { file, data }

  // ===== Paso 1: elegir local y archivos =====
  function paso1(error) {
    const selLocal = h('select', { class: 'input', id: 'rf-local', 'aria-label': 'Local que recibe' },
      locales.map(l => h('option', { value: l.id, text: l.nombre, selected: l.id === localId })));
    selLocal.addEventListener('change', () => { localId = selLocal.value; lsSet('g:rf:local', localId); });
    const input = h('input', { type: 'file', id: 'rf-archivo', accept: 'image/*,application/pdf', multiple: true });
    const lista = h('div', { class: 'rf-fotos' });
    const leer = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Leer factura', disabled: true });
    const pintarFotos = () => {
      lista.replaceChildren(...(pdf ? [h('div', { class: 'rf-foto rf-pdf' }, icon('pagos', 26), h('span', { text: pdf.file.name }))] :
        fotos.map((f, i) => h('div', { class: 'rf-foto' }, h('img', { src: f.canvas.toDataURL('image/jpeg', 0.5), alt: `Foto ${i + 1}` }),
          h('button', { class: 'icon-btn rf-quitar', type: 'button', 'aria-label': `Quitar foto ${i + 1}`, on: { click: () => { fotos.splice(i, 1); pintarFotos(); } } }, icon('cerrar', 16))))));
      leer.disabled = !pdf && !fotos.length;
      drop.querySelector('.drop-t').textContent = pdf || fotos.length ? 'Agregar otra foto' : 'Sacar foto o elegir archivo';
    };
    const drop = h('label', { class: 'drop', for: 'rf-archivo' }, icon('recibir', 30), h('span', { class: 'drop-t', text: 'Sacar foto o elegir archivo' }),
      h('span', { class: 'sub', text: 'Foto de la factura o remito (si es larga, varias fotos en orden) o el PDF que mandó el proveedor.' }), input);
    input.addEventListener('change', async () => {
      const files = [...input.files]; input.value = '';
      try {
        for (const f of files) {
          if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
            if (f.size > PDF_MAX) throw new Error('El PDF es muy pesado (máximo 9 MB).');
            pdf = { file: f, data: await aBase64(f) }; fotos = [];
          } else if (/^image\//.test(f.type)) {
            if (pdf) pdf = null;
            if (fotos.length >= 6) throw new Error('Máximo 6 fotos por factura.');
            fotos.push({ file: f, ...(await achicarFoto(f)) });
          }
        }
      } catch (e) { toast(e.message || String(e), 'error'); }
      pintarFotos();
    });
    leer.addEventListener('click', () => leyendo());
    mount(root, cab, error ? banner(error, 'error') : null,
      h('section', { class: 'bloque rf-paso' }, campo('Local que recibe', selLocal), drop, lista, leer), volver);
    pintarFotos();
  }

  // ===== Paso 2: leer =====
  async function leyendo() {
    // Lectura en vivo: contador de segundos, el proveedor apenas se lee y cada renglón a medida que llega.
    const t0 = Date.now();
    const seg = h('span', { class: 'num', text: '0 s' });
    const quien = h('p', { class: 'rf-vivo-prov' });
    const vivos = h('ol', { class: 'rf-vivo' });
    const titulo = h('p', { class: 'rf-leyendo-t', text: 'Leyendo la factura…' });
    let leyendoAun = true;   // reloj de pantalla (solo muestra los segundos)
    const tic = () => { if (!leyendoAun) return; seg.textContent = Math.round((Date.now() - t0) / 1000) + ' s'; setTimeout(tic, 500); };
    tic();
    let vistos = 0;
    const alPedazo = (texto) => {
      const p = facturaParcial(texto);
      if (p.proveedor && !quien.textContent) quien.textContent = p.proveedor;
      if (p.renglones.length > vistos) {
        vivos.append(...p.renglones.slice(vistos).map(r => h('li', {}, h('span', { class: 'num', text: fmtNum(r.cantidad, 3) || '' }), ' ', r.descripcion || r.codigo || '')));
        vistos = p.renglones.length;
        titulo.textContent = `Leyendo… ${vistos} ${vistos === 1 ? 'producto' : 'productos'}`;
      }
    };
    mount(root, cab, h('section', { class: 'bloque rf-leyendo', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'rf-spin', 'aria-hidden': 'true' }), titulo, h('p', { class: 'sub' }, 'Van ', seg), quien, vivos));
    try {
      const archivos = pdf ? [{ data: pdf.data, tipo: 'application/pdf' }] : fotos.map(f => ({ data: f.data, tipo: f.tipo }));
      const [res, alias, ordenes] = await Promise.all([leerFactura(archivos, alPedazo), aliasProveedor(localId).catch(() => []), ordenesPorEstado(['enviada', 'parcial']).catch(() => [])]);
      leyendoAun = false;
      if (!ctx.alive()) return;
      if (!res || !res.factura) throw new Error('No se pudo leer la factura.');
      if (res.factura.es_factura === false) throw new Error('No parece una factura o remito. Probá con otra foto.');
      revisar(res.factura, alias, ordenes);
      toast(`Factura leída en ${Math.round((Date.now() - t0) / 1000)} s`, 'ok');
    } catch (e) { leyendoAun = false; if (ctx.alive()) paso1(e.message || mensajeError(e)); }
  }


  // ===== Paso 3: revisar y confirmar =====
  function revisar(fac, alias, ordenes) {
    const prodsLocal = [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && !p.es_elaborado && !esCarta(p));
    const pv = proveedorDe(fac, provs);
    const renglones = (fac.renglones || []).filter(r => r && (r.descripcion || r.codigo));
    const cruces = cruzarRenglones(renglones, prodsLocal, alias, pv.prov && pv.prov.id);
    const filas = renglones.map((r, i) => ({ r, producto: cruces[i].producto, por: cruces[i].por, sugeridos: cruces[i].sugeridos, incluir: true,
      cantidad: Number(r.cantidad) || 0, precio: r.precio_unitario != null ? Number(r.precio_unitario) : (r.importe && r.cantidad ? Number(r.importe) / Number(r.cantidad) : null) }));

    const f = {
      prov: h('select', { class: 'input', id: 'rf-prov', 'aria-label': 'Proveedor' }, h('option', { value: '', text: 'Elegí el proveedor' }),
        provs.map(p => h('option', { value: p.id, text: p.nombre, selected: pv.prov && p.id === pv.prov.id }))),
      numero: h('input', { class: 'input num', id: 'rf-numero', value: fac.numero || '', autocomplete: 'off' }),
      fecha: h('input', { class: 'input', id: 'rf-fecha', type: 'date', value: isoValido(fac.fecha) || hoyISO() }),
      venc: h('input', { class: 'input', id: 'rf-venc', type: 'date', value: isoValido(fac.vencimiento) }),
      total: h('input', { class: 'input num', id: 'rf-total', inputmode: 'decimal', value: fac.total != null ? String(fac.total).replace('.', ',') : '' }),
      guardar: h('input', { type: 'checkbox', id: 'rf-guardar', checked: true }),
      tipo: h('select', { class: 'input', id: 'rf-tipo', 'aria-label': 'Tipo de comprobante' }, h('option', { value: '', text: 'Sin indicar' }),
        TIPOS_COMPROBANTE.map(t => h('option', { value: t, text: t, selected: t === tipoComprobante(fac.tipo) })))
    };
    const avisoProv = h('p', { class: 'field-h rf-prov-h' });
    const pedidoBox = h('div', { class: 'rf-pedido' });
    const listaEl = h('div', { class: 'lista rf-lista' });
    const resumen = h('div', { class: 'rf-resumen' });
    const err = h('p', { class: 'form-err', role: 'alert' });
    let ordenSel = null;

    const textoProv = () => {
      const leido = [fac.proveedor, fac.cuit ? 'CUIT ' + fac.cuit : ''].filter(Boolean).join(' · ');
      avisoProv.textContent = !f.prov.value ? `En la factura dice: ${leido || 'sin nombre'}. Elegilo de la lista (si es nuevo, cargalo en Catálogo → Proveedores).`
        : pv.prov && f.prov.value === pv.prov.id ? `Reconocido por ${pv.por === 'cuit' ? 'CUIT' : 'nombre'}: ${leido}` : `En la factura dice: ${leido}`;
    };
    // Pedidos abiertos del local con este proveedor: por defecto el más reciente; o "fuera de la app".
    function pintarPedido() {
      const abiertos = ordenes.filter(o => o.local_id === localId && o.proveedor_id === f.prov.value).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
      ordenSel = abiertos[0] || null;
      if (!abiertos.length) return pedidoBox.replaceChildren(h('p', { class: 'sub', text: f.prov.value ? 'No hay pedido abierto de este proveedor para el local: se carga como pedido hecho fuera de la app.' : '' }));
      const sel = h('select', { class: 'input', id: 'rf-orden', 'aria-label': 'Pedido que llega' },
        abiertos.map(o => h('option', { value: o.id, text: `Pedido del ${fechaDMA(o.creado_en)} · ${o.orden_items.length} productos` })), h('option', { value: '', text: 'Ninguno: lo pedimos fuera de la app' }));
      sel.addEventListener('change', () => { ordenSel = abiertos.find(o => o.id === sel.value) || null; pintarResumen(); });
      pedidoBox.replaceChildren(campo('¿Es el pedido que se hizo en la app?', sel, 'Lo pedido queda recibido y te muestro lo que faltó.'));
    }

    function elegirProducto(fila) {
      let t = fila.producto ? '' : (fila.r.descripcion || '').split(/[^\p{L}]+/u).find(w => w.length >= 4) || '';
      const lista = h('div', { class: 'lista lista-sheet' });
      const pintarOpc = () => {
        const tk = tokens(t);
        const base = t.trim() ? prodsLocal.filter(p => coincide(p.nombre + ' ' + p.codigo, tk)).sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 40) : fila.sugeridos;
        lista.replaceChildren(...(base.length ? base.map(p => h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Elegir ${p.nombre}`, on: { click: () => { fila.producto = p; fila.por = 'manual'; fila.incluir = true; cerrar(); pintarLista(); } } },
          h('span', { class: 'prod-n', text: p.nombre }), h('span', { class: 'prod-m' }, h('span', { class: 'num', text: p.codigo }), h('span', { text: p.unidad_compra || p.unidad_uso || '' }), h('span', { text: (G.provs.get(p.proveedor_id) || {}).nombre || '' })))) :
          [vacio(`No está en el catálogo de ${nombreLocal(localId)}`, 'Probá con otra palabra o cargalo en Catálogo y volvé a leer la factura.')]));
      };
      const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto del catálogo', autocomplete: 'off', value: t, on: { input: (e) => { t = e.target.value; pintarOpc(); } } });
      const { cerrar } = hoja('Elegir producto', h('div', { class: 'rf-elegir' },
        h('p', { class: 'sub', text: `En la factura: «${fila.r.descripcion || fila.r.codigo}»` }), buscador, lista,
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'No recibir este renglón', on: { click: () => { fila.incluir = false; cerrar(); pintarLista(); } } })));
      pintarOpc(); setTimeout(() => buscador.focus(), 50);
    }

    function filaEl(fila, i) {
      const p = fila.producto;
      const inQty = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: fmtNum(fila.cantidad, 3), 'aria-label': `Cantidad de ${fila.r.descripcion}` });
      const inPr = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: fila.precio == null ? '' : String(Math.round(fila.precio * 100) / 100).replace('.', ','), placeholder: '0', 'aria-label': `Precio unitario de ${fila.r.descripcion}` });
      inQty.addEventListener('input', () => { const v = parseNum(inQty.value); fila.cantidad = v === null || v < 0 ? 0 : v; pintarResumen(); });
      inPr.addEventListener('input', () => { fila.precio = parseNum(inPr.value); pintarResumen(); });
      const chk = h('input', { type: 'checkbox', checked: fila.incluir, 'aria-label': `Recibir ${fila.r.descripcion}`, on: { change: (e) => { fila.incluir = e.target.checked; pintarLista(); } } });
      const unidadFac = [fmtNum(fila.r.cantidad, 3), fila.r.unidad].filter(Boolean).join(' ');
      const etiqueta = { alias: 'Como la última vez', codigo: 'Por código', nombre: 'Parecido', manual: 'Elegido' }[fila.por] || '';
      return h('article', { class: 'prod rf-fila' + (fila.incluir ? '' : ' is-off') + (fila.incluir && !p ? ' rf-falta' : ''), 'data-renglon': String(i) },
        h('label', { class: 'rf-chk' }, chk),
        h('div', { class: 'rf-cuerpo' },
          h('p', { class: 'rf-desc' }, fila.r.codigo ? h('span', { class: 'pr-cod', text: fila.r.codigo }) : null, h('span', { text: fila.r.descripcion || '' }),
            unidadFac ? h('span', { class: 'rf-fac-u', text: ` · ${unidadFac}` }) : null),
          fila.incluir ? h('button', { class: 'rf-prod' + (p ? '' : ' rf-prod-falta'), type: 'button', 'aria-label': p ? `Cambiar producto ${p.nombre}` : `Elegir producto para ${fila.r.descripcion}`, on: { click: () => elegirProducto(fila) } },
            h('span', { class: 'prod-n', text: p ? p.nombre : 'Elegí el producto del catálogo' }),
            p && etiqueta ? h('span', { class: 'estado estado-' + (fila.por === 'nombre' ? 'aprobada' : 'recibida'), text: etiqueta }) : null) : h('p', { class: 'sub', text: 'No se recibe' }),
          fila.incluir ? h('div', { class: 'rec-campos' },
            h('label', { class: 'rec-c' }, h('span', { text: p && p.unidad_compra ? `Llegó (${plural(p.unidad_compra, 2)})` : 'Llegó' }), inQty),
            h('label', { class: 'rec-c' }, h('span', { text: 'Precio unitario' }), inPr)) : null));
    }

    function pintarLista() {
      listaEl.replaceChildren(...(filas.length ? filas.map(filaEl) : [vacio('No se leyeron productos', 'Probá con una foto más clara o cargá la recepción a mano desde el pedido.')]));
      pintarResumen();
    }
    function pintarResumen() {
      err.textContent = '';
      const act = filas.filter(x => x.incluir);
      const sinProd = act.filter(x => !x.producto).length;
      const suma = act.reduce((s, x) => s + (x.precio || 0) * (x.cantidad || 0), 0);
      const total = parseNum(f.total.value);
      const partes = [h('p', {}, h('b', { text: `${act.length - sinProd} de ${filas.length} renglones listos` }), sinProd ? h('span', { class: 'rf-alerta', text: ` · faltan ${sinProd} por elegir` }) : null),
        h('p', { class: 'sub' }, `Suma de renglones ${fmtMoney(suma)}`, total ? ` · Total factura ${fmtMoney(total)}` : '',
          total && fac.subtotal && Math.abs(suma - fac.subtotal) < Math.abs(suma - total) ? ' (los precios son sin IVA)' : '')];
      if (fac.observaciones) partes.push(banner('Al leer: ' + fac.observaciones, 'info'));
      if (ordenSel) {
        const cmp = compararConPedido(ordenSel, act.filter(x => x.producto).map(x => ({ producto_id: x.producto.id, cantidad: x.cantidad })));
        const nom = (id) => (G.prods.get(id) || {}).nombre || 'Producto';
        if (cmp.faltan.length) partes.push(h('div', { class: 'rf-cmp' }, h('p', { class: 'rf-cmp-t', text: `Faltó contra el pedido (${cmp.faltan.length})` }),
          h('ul', {}, cmp.faltan.map(x => h('li', { text: `${nom(x.producto_id)}: pedido ${fmtNum(x.pedido, 3)}, llegó ${fmtNum(x.vino, 3)}` })))));
        else partes.push(h('p', { class: 'rf-ok', text: 'Llegó todo lo pedido.' }));
        if (cmp.deMas.length) partes.push(h('p', { class: 'sub', text: `No estaban en el pedido: ${cmp.deMas.map(nom).join(', ')}` }));
      }
      resumen.replaceChildren(...partes);
    }

    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Confirmar recepción' });
    btn.addEventListener('click', async () => {
      err.textContent = '';
      const act = filas.filter(x => x.incluir && x.cantidad > 0);
      if (!f.prov.value) return (err.textContent = 'Elegí el proveedor.');
      if (!act.length) return (err.textContent = 'No hay productos para recibir.');
      if (act.some(x => !x.producto)) return (err.textContent = 'Elegí el producto de cada renglón, o destildá los que no se reciben.');
      const total = parseNum(f.total.value);
      if (f.guardar.checked && (f.numero.value.trim() || f.tipo.value === 'Recibo X') && (total === null || total < 0)) return (err.textContent = 'Poné el total de la factura para guardarla en Pagos.');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        let archivo = null;
        try {
          const blob = pdf ? pdf.file : base64ABlob(unirFotos(fotos.map(x => x.canvas)).toDataURL('image/jpeg', 0.8).split(',')[1], 'image/jpeg');
          const nombre = pdf ? pdf.file.name : `factura-${(f.numero.value.trim() || 'sin-numero')}.jpg`;
          archivo = await subirComprobante(rutaFactura(f.prov.value, nombre), new File([blob], nombre, { type: blob.type }));
        } catch (_e) { /* sin archivo igual se recibe */ }
        const items = act.map(x => ({ producto_id: x.producto.id, cantidad: x.cantidad, precio_unitario: x.precio == null ? null : Math.round(x.precio * 100) / 100, alias: x.r.descripcion || x.r.codigo || null }));
        // Un recibo X sin número igual se guarda en Pagos (con un número armado) para que sume al gasto.
        const numero = f.numero.value.trim() || (f.tipo.value === 'Recibo X' && f.guardar.checked && total !== null ? numeroReciboX() : '');
        const factura = numero ? { numero, tipo: f.tipo.value || null, fecha: f.fecha.value || null, vencimiento: f.venc.value || null, total, archivo, guardar: f.guardar.checked } : (archivo ? { archivo } : null);
        const r = await recibirConFactura(localId, f.prov.value, items, factura, ordenSel && ordenSel.id);
        items.forEach(x => { if (x.precio_unitario !== null) refrescarPrecio(x.producto_id, x.precio_unitario); });
        toast(`Recepción guardada: ${r.items} productos sumados al stock de ${nombreLocal(localId)}` + (r.estado_orden === 'parcial' ? ' (el pedido quedó parcial)' : ''), 'ok');
        fotos = []; pdf = null;
        location.hash = '#/recibir';
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = 'Confirmar recepción'; }
    });

    f.prov.addEventListener('change', () => { textoProv(); pintarPedido(); pintarResumen(); });
    f.total.addEventListener('input', pintarResumen);
    textoProv(); pintarPedido();
    mount(root, cab,
      h('section', { class: 'bloque rf-cab' },
        h('p', { class: 'rf-local', text: `Recibe: ${nombreLocal(localId)}` }),
        campo('Proveedor', f.prov), avisoProv,
        h('div', { class: 'dos' }, campo('Tipo', f.tipo), campo('Número', f.numero)),
        campo('Total ($)', f.total),
        h('div', { class: 'dos' }, campo('Fecha', f.fecha), campo('Vencimiento', f.venc)),
        h('label', { class: 'rf-check' }, f.guardar, h('span', { text: 'Guardar también la factura en Pagos (si ya estaba cargada, se usa esa)' })),
        pedidoBox),
      h('h2', { class: 'rf-h2', text: 'Productos de la factura' }), listaEl, resumen, err, btn,
      h('button', { class: 'btn btn-text', type: 'button', text: 'Leer otra factura', on: { click: () => { fotos = []; pdf = null; paso1(); } } }), volver);
    pintarLista();
  }

  paso1();
}
