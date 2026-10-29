// Gerencia · Ventas: subir los Excel de Núcleo IT de un local y un día, asociar sus códigos a productos y confirmar la importación.
import { mount, h, norm, tokens, coincide, fmtNum, fmtMoney, porTexto, hoyISO, sumarDias, fechaLarga } from './util.js';
import { cargarAliasNucleo, asociarNucleo, crearPlato, importacionDelDia, importarVentas, importacionesRecientes, borrarImportacion, buscarServidor, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { leerReporte, armarImportacion, claveItem } from './nucleo.js';
import { esqueleto, vacio, banner, toast, hoja, campo, subnav, icon, SUBNAV_VENTAS } from './ui.js';

const TIPOS = { detalle: 'Detalle por pedido', pagos: 'Formas de pago', simple: 'Pedidos por producto' };

// Estado de la importación en curso (se conserva al cambiar de pantalla).
const E = { localId: null, fecha: null, fechaManual: false, archivos: [], detalle: null, pagos: null, simple: null, imp: null,
  aliases: new Map(), nd: new Set(), sugerencias: new Map(), existente: null, resultado: null, cargandoAliases: false, recientes: [] };

function cargarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX);
    s.onerror = () => mal(new Error('No se pudo cargar el lector de Excel. Revisá la conexión.'));
    document.head.append(s);
  });
}

async function leerArchivo(file) {
  const X = await cargarXLSX();
  const wb = X.read(await file.arrayBuffer(), { type: 'array' });
  for (const nombre of wb.SheetNames) {
    const filas = X.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null });
    const rep = leerReporte(filas);
    if (rep) return rep;
  }
  return null;
}

const claveNorm = (it) => norm(claveItem(it));

// Renglones únicos por código (o nombre) con lo vendido en el archivo.
function renglones() {
  const m = new Map();
  for (const it of (E.imp ? E.imp.items : [])) {
    const k = claveNorm(it);
    const r = m.get(k) || { k, clave: claveItem(it), codigo: it.codigo, nombre: it.nombre, rubro: it.rubro, cantidad: 0, importe: 0 };
    r.cantidad += it.cantidad; r.importe += it.importe; m.set(k, r);
  }
  return [...m.values()];
}
const estadoDe = (r) => (E.nd.has(r.k) ? 'nd' : (E.aliases.has(r.k) ? 'ok' : 'falta'));

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Ventas' }), h('p', { class: 'sub', text: 'Importar el Excel de Núcleo IT' }));
  mount(root, cab, subnav(SUBNAV_VENTAS, 'ventas'), esqueleto(3));
  await cargarG(['prods', 'locales'], () => {});
  if (!ctx.alive()) return;

  const chips = chipsLocal(async (id) => { await cambiarLocal(id); });
  if (E.localId !== chips.get()) { E.localId = chips.get(); E.aliases = new Map(); E.nd = new Set(); E.sugerencias = new Map(); }
  if (!E.fecha) E.fecha = sumarDias(hoyISO(), -1);

  async function cambiarLocal(id) {
    E.localId = id; E.aliases = new Map(); E.nd = new Set(); E.sugerencias = new Map();
    await prepararLocal(); pintar();
  }

  async function prepararLocal() {
    if (!E.localId) return;
    try {
      const al = await cargarAliasNucleo(E.localId);
      E.aliases = new Map(al.map(a => [norm(a.alias), { producto_id: a.producto_id, cpv: Number(a.cantidad_por_venta) || 1 }]));
    } catch (e) { toast(mensajeError(e), 'error'); }
    await refrescarExistente();
    sugerir();
  }
  async function refrescarExistente() {
    E.existente = null;
    if (E.localId) { try { E.recientes = await importacionesRecientes(E.localId); } catch (_e) { E.recientes = []; } }
    if (!E.localId || !E.fecha) return;
    try { const r = await importacionDelDia(E.localId, E.fecha); E.existente = r[0] || null; } catch (_e) { /* sin aviso */ }
  }

  // Sugiere el producto más parecido (buscar_productos) para los renglones sin asociar, de a uno.
  let corriendo = false;
  async function sugerir() {
    if (corriendo) return; corriendo = true;
    try {
      for (const r of renglones()) {
        if (!ctx.alive()) break;
        if (estadoDe(r) !== 'falta' || E.sugerencias.has(r.k)) continue;
        let top = null;
        try { const res = await buscarServidor(r.nombre.replace(/[^\p{L}\p{N}]+/gu, ' ').trim() || r.nombre, E.localId); top = res.slice().sort((a, b) => b.score - a.score)[0] || null; } catch (_e) { top = null; }
        E.sugerencias.set(r.k, top && top.score >= 0.3 ? { id: top.id, nombre: top.nombre } : null);
        pintarLista();
      }
    } finally { corriendo = false; }
  }

  async function recalcular() {
    E.imp = (E.detalle || E.pagos || E.simple) ? armarImportacion({ detalle: E.detalle, pagos: E.pagos, simple: E.simple }) : null;
    if (E.imp && E.imp.resumen.fecha && !E.fechaManual) E.fecha = E.imp.resumen.fecha;
    await refrescarExistente();
  }

  async function alElegirArchivos(files) {
    for (const f of files) {
      const entrada = { nombre: f.name, tipo: null, error: null, filas: 0 };
      try {
        const rep = await leerArchivo(f);
        if (!rep) entrada.error = 'No reconozco este Excel. Tiene que ser un reporte de Núcleo IT.';
        else {
          entrada.tipo = rep.tipo; entrada.filas = (rep.items || rep.pagos).length;
          E.archivos = E.archivos.filter(a => a.tipo !== rep.tipo);
          if (rep.tipo === 'detalle') E.detalle = rep; else if (rep.tipo === 'pagos') E.pagos = rep; else E.simple = rep;
        }
      } catch (e) { entrada.error = mensajeError(e); }
      E.archivos.push(entrada);
    }
    E.sugerencias = new Map(); E.resultado = null;
    await recalcular(); pintar(); sugerir();
  }

  function quitar(a) {
    E.archivos = E.archivos.filter(x => x !== a);
    if (a.tipo === 'detalle') E.detalle = null; else if (a.tipo === 'pagos') E.pagos = null; else if (a.tipo === 'simple') E.simple = null;
    E.sugerencias = new Map();
    recalcular().then(() => { pintar(); sugerir(); });
  }

  // ---------- asociar ----------
  function setAlias(r, productoId, cpv) { E.aliases.set(r.k, { producto_id: productoId, cpv }); E.nd.delete(r.k); }

  async function asociarA(r, productoId, cpv) {
    await asociarNucleo(productoId, r.clave, cpv);
    setAlias(r, productoId, cpv);
  }

  function elegirProducto(r) {
    let sel = null; let q = r.nombre;
    const lista = h('div', { class: 'lista lista-sheet' });
    const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', value: q, autocomplete: 'off', on: { input: (e) => { q = e.target.value; pintarOpc(); } } });
    const cuerpo = h('div', { class: 'form' });
    const { cerrar } = hoja(`Asociar · ${r.nombre}`, cuerpo);
    const pintarOpc = () => {
      const t = tokens(q);
      const vis = [...G.prods.values()].filter(p => p.local_id === E.localId && p.activo !== false && coincide(p.nombre + ' ' + p.codigo, t)).sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 40);
      lista.replaceChildren(...(vis.length ? vis.map(p => h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Elegir ${p.nombre}`, on: { click: () => paso2(p) } },
        h('span', { class: 'prod-n', text: p.nombre }), h('span', { class: 'prod-m' }, h('span', { class: 'num', text: p.codigo }), h('span', { text: p.unidad_uso || '' })))) : [vacio('No encontramos ese producto', 'Probá con otra palabra.')]));
    };
    function paso1() { cuerpo.replaceChildren(buscador, lista); pintarOpc(); setTimeout(() => buscador.focus(), 50); }
    function paso2(p) {
      sel = p;
      const cpv = h('input', { class: 'input num', id: 'f-cpv', type: 'text', inputmode: 'decimal', value: '1', 'aria-label': 'Cantidad que descuenta por venta' });
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Asociar' });
      cuerpo.replaceChildren(
        h('p', { class: 'sub', text: `${r.nombre} → ${sel.nombre}` }),
        campo(`Cantidad que descuenta cada venta${sel.unidad_uso ? ' (' + sel.unidad_uso + ')' : ''}`, cpv, 'Casi siempre es 1. Si vendés una copa y el producto es la botella, poné 0,2.'),
        btn, h('button', { class: 'btn btn-text', type: 'button', text: 'Elegir otro producto', on: { click: paso1 } }));
      btn.addEventListener('click', async () => {
        const n = Number(String(cpv.value).replace(',', '.'));
        if (!(n > 0)) return toast('La cantidad tiene que ser mayor a cero.', 'error');
        btn.disabled = true; btn.textContent = 'Guardando…';
        try { await asociarA(r, sel.id, n); toast('Asociado', 'ok'); cerrar(); pintar(); }
        catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Asociar'; }
      });
    }
    paso1();
  }

  async function nuevoPlato(r, btn) {
    btn.disabled = true;
    try {
      const id = await crearPlato(E.localId, r.codigo || '', r.nombre);
      if (!G.prods.has(id)) G.prods.set(id, { id, codigo: 'PLA-' + (r.codigo || r.nombre).toUpperCase(), nombre: r.nombre, local_id: E.localId, categoria: 'Carta', unidad_uso: 'porción', factor_conversion: 1, es_elaborado: true, activo: true });
      setAlias(r, id, 1);
      toast(`Plato creado: ${r.nombre}`, 'ok'); pintar();
    } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; }
  }

  function filaAsoc(r) {
    const est = estadoDe(r);
    const al = E.aliases.get(r.k);
    const prod = al ? G.prods.get(al.producto_id) : null;
    const sug = E.sugerencias.get(r.k);
    const meta = h('p', { class: 'prod-m' }, r.codigo ? h('span', { class: 'num', text: r.codigo }) : null, r.rubro ? h('span', { text: r.rubro.toLowerCase() }) : null,
      h('span', { text: `${fmtNum(r.cantidad, 3)} vendidos` }));
    let cuerpo;
    if (est === 'ok') {
      cuerpo = [h('p', { class: 'asoc-a' }, icon('check', 16), h('span', { text: prod ? prod.nombre : 'Producto' }), al.cpv !== 1 ? h('span', { class: 'mute', text: ` · ${fmtNum(al.cpv, 3)} por venta` }) : null),
        h('div', { class: 'asoc-b' }, h('button', { class: 'btn btn-text', type: 'button', text: 'Cambiar', 'aria-label': `Cambiar ${r.nombre}`, on: { click: () => elegirProducto(r) } }))];
    } else if (est === 'nd') {
      cuerpo = [h('p', { class: 'asoc-a mute', text: 'No se descuenta del stock' }),
        h('div', { class: 'asoc-b' }, h('button', { class: 'btn btn-text', type: 'button', text: 'Descontar', 'aria-label': `Descontar ${r.nombre}`, on: { click: () => { E.nd.delete(r.k); pintar(); } } }))];
    } else {
      // Si la sugerencia es un producto del stock (pulseras, aguas…), lo más probable es que se venda tal cual: no es un plato.
      const sugStock = sug && G.prods.get(sug.id) && !G.prods.get(sug.id).es_elaborado;
      const esPlato = !sugStock && !/^bebida/i.test(r.rubro || '');
      const btnPlato = h('button', { class: 'btn ' + (esPlato ? 'btn-primary' : 'btn-ghost'), type: 'button', text: 'Crear plato', 'aria-label': `Crear plato ${r.nombre}` });
      btnPlato.addEventListener('click', () => nuevoPlato(r, btnPlato));
      cuerpo = [
        sug ? h('p', { class: 'asoc-s' }, h('span', { text: `¿Es ${sug.nombre}?` }),
          h('button', { class: 'btn ' + (sugStock ? 'btn-primary' : 'btn-ghost') + ' btn-sm', type: 'button', text: 'Sí', 'aria-label': `Usar ${sug.nombre} para ${r.nombre}`, on: { click: async (e) => {
            e.currentTarget.disabled = true;
            try { await asociarA(r, sug.id, 1); pintar(); } catch (x) { toast(mensajeError(x), 'error'); e.currentTarget.disabled = false; }
          } } })) : null,
        h('div', { class: 'asoc-b' },
          h('button', { class: 'btn ' + (esPlato ? 'btn-ghost' : 'btn-primary'), type: 'button', text: 'Producto del stock', 'aria-label': `Elegir producto del stock para ${r.nombre}`, on: { click: () => elegirProducto(r) } }),
          btnPlato,
          h('button', { class: 'btn btn-text', type: 'button', text: 'No descontar', 'aria-label': `No descontar ${r.nombre}`, on: { click: () => { E.nd.add(r.k); pintar(); } } }))];
    }
    return h('article', { class: 'prod asoc asoc-' + est, 'data-clave': r.k },
      h('h3', { class: 'prod-n', text: r.nombre }), meta, cuerpo);
  }

  // ---------- confirmar ----------
  async function confirmar(btn) {
    const imp = E.imp;
    const items = imp.items.map(i => {
      const k = claveNorm(i); const nd = E.nd.has(k); const al = E.aliases.get(k);
      return { codigo: i.codigo, nombre: i.nombre, cantidad: i.cantidad, importe: i.importe, producto_id: nd || !al ? null : al.producto_id, no_descontar: nd,
        pedido_numero: i.pedido_numero, fecha_hora: i.fecha_hora, rubro: i.rubro, subrubro: i.subrubro, tipo_pedido: i.tipo_pedido, sector: i.sector };
    });
    const archivo = E.archivos.filter(a => a.tipo).map(a => a.nombre).join(' + ');
    btn.disabled = true; btn.textContent = 'Importando…';
    try {
      const r = await importarVentas(E.localId, E.fecha, imp.pedidos, items, imp.pagos, archivo);
      E.resultado = { ...r, resumen: imp.resumen, fecha: E.fecha, local: E.localId };
      E.archivos = []; E.detalle = E.pagos = E.simple = E.imp = null; E.nd = new Set(); E.sugerencias = new Map(); E.fechaManual = false;
      toast('Ventas importadas', 'ok'); await refrescarExistente(); pintar();
    } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = 'Confirmar importación'; }
  }

  // ---------- borrar una importación subida por error ----------
  function pedirBorrar(i) {
    const nl = (G.locales.find(l => l.id === E.localId) || {}).nombre || '';
    const si = h('button', { class: 'btn btn-primary btn-peligro btn-block', type: 'button', text: 'Sí, borrar estas ventas' });
    const { cerrar } = hoja('Borrar ventas', h('div', { class: 'borrar-imp' },
      h('p', { text: `Vas a borrar las ventas de ${nl} del ${fechaLarga(i.fecha_desde)}${i.archivo ? ' (' + i.archivo + ')' : ''}.` }),
      banner('Lo que esa importación descontó del stock vuelve a sumarse. Después podés subir el Excel correcto.', 'info'),
      h('div', { class: 'acciones' }, si, h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'No, dejarlas', on: { click: () => cerrar() } }))));
    si.addEventListener('click', async () => {
      si.disabled = true; si.textContent = 'Borrando…';
      try {
        const r = await borrarImportacion(i.id);
        cerrar(); toast(`Ventas borradas · ${r.movimientos} movimientos de stock devueltos`, 'ok');
        if (E.resultado && E.resultado.import_id === i.id) E.resultado = null;
        await refrescarExistente(); pintar();
      } catch (e) { toast(mensajeError(e), 'error'); si.disabled = false; si.textContent = 'Sí, borrar estas ventas'; }
    });
  }

  function listaRecientes() {
    if (!E.recientes.length) return null;
    return h('section', { class: 'imp-subidas', 'aria-label': 'Ventas ya subidas' },
      h('h2', { class: 'cat-t', text: 'Ventas ya subidas' }),
      h('p', { class: 'sub', text: '¿Subiste un Excel dos veces o en el día equivocado? Borralo y el stock vuelve.' }),
      h('ul', { class: 'imp-lista' }, E.recientes.map(i => h('li', { class: 'imp-fila' },
        h('div', { class: 'imp-info' },
          h('b', { text: fechaLarga(i.fecha_desde) }),
          h('span', { class: 'mute', text: [i.n_pedidos ? `${i.n_pedidos} pedidos` : null, i.total_productos !== null && i.total_productos !== undefined ? fmtMoney(i.total_productos) : null, i.archivo].filter(Boolean).join(' · ') })),
        h('button', { class: 'btn btn-text btn-danger', type: 'button', text: 'Borrar', 'aria-label': `Borrar ventas del ${fechaLarga(i.fecha_desde)}`, on: { click: () => pedirBorrar(i) } })))));
  }

  // ---------- pantalla ----------
  const zonaLista = h('div', { class: 'asoc-lista' });
  function pintarLista() {
    if (!zonaLista.isConnected) return;
    if (!E.imp) { zonaLista.replaceChildren(); return; }
    const rs = renglones().sort((a, b) => porTexto(a.nombre, b.nombre));
    const faltan = rs.filter(r => estadoDe(r) === 'falta'); const hechos = rs.filter(r => estadoDe(r) !== 'falta');
    zonaLista.replaceChildren(
      h('h2', { class: 'cat-t', text: faltan.length ? `Faltan asociar · ${faltan.length}` : 'Todo asociado' }),
      ...(faltan.length ? [h('p', { class: 'sub', text: '¿Se vende tal cual (pulseras, aguas, gaseosas)? Tocá «Producto del stock» y elegilo: cada venta descuenta 1. ¿Se cocina? «Crear plato» y después cargale la receta.' }),
        h('div', { class: 'lista' }, faltan.map(filaAsoc))] : []),
      ...(hechos.length ? [h('details', { class: 'asoc-hechos', open: !faltan.length }, h('summary', { text: `Asociados · ${hechos.length}` }), h('div', { class: 'lista' }, hechos.map(filaAsoc)))] : []));
  }

  function kpi(titulo, valor, nota, tono) {
    return h('div', { class: 'kpi' + (tono ? ' kpi-' + tono : '') }, h('span', { class: 'kpi-t', text: titulo }), h('b', { class: 'kpi-v num', text: valor }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
  }

  function pintar() {
    if (!ctx.alive()) return;
    if (E.resultado) return pintarResultado();
    const imp = E.imp; const res = imp ? imp.resumen : null;
    const inpFecha = h('input', { class: 'input', type: 'date', id: 'f-fecha', value: E.fecha || '', 'aria-label': 'Fecha de las ventas', on: { change: async (e) => { E.fecha = e.target.value; E.fechaManual = true; await refrescarExistente(); pintar(); } } });
    const inpArchivo = h('input', { type: 'file', id: 'f-archivo', accept: '.xlsx,.xls', multiple: true, class: 'file-oculto', on: { change: async (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await alElegirArchivos(fs); } } });
    const archivos = E.archivos.length ? h('ul', { class: 'arch-lista' }, E.archivos.map(a => h('li', { class: 'arch' + (a.error ? ' arch-err' : '') },
      h('span', { class: 'arch-n', text: a.error ? a.nombre : `${TIPOS[a.tipo]} · ${a.filas} renglones` }), a.error ? h('span', { class: 'arch-e', text: a.error }) : h('span', { class: 'mute', text: a.nombre }),
      h('button', { class: 'btn btn-text', type: 'button', text: 'Quitar', 'aria-label': `Quitar ${a.nombre}`, on: { click: () => quitar(a) } })))) : null;

    const fechaDif = res && res.fecha && E.fecha && res.fecha !== E.fecha;
    const pendientes = imp ? renglones().filter(r => estadoDe(r) === 'falta').length : 0;
    const puede = imp && E.fecha && E.localId && (imp.items.length || imp.pagos.length) && pendientes === 0;
    const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', text: pendientes ? `Faltan ${pendientes} por asociar` : 'Confirmar importación', disabled: !puede });
    btn.addEventListener('click', () => confirmar(btn));

    const prev = res ? h('section', { class: 'kpis', 'aria-label': 'Vista previa' },
      kpi('Productos', fmtMoney(res.totalProductos), `${res.nItems} renglones`),
      kpi('Cobrado', res.totalCobrado === null ? '—' : fmtMoney(res.totalCobrado), res.totalCobrado === null ? 'Sin formas de pago' : null),
      kpi('Pedidos', fmtNum(res.nPedidos, 0), res.modo === 'simple' ? 'Este archivo no trae pedidos' : null),
      kpi('Diferencia', res.diferencia === null ? '—' : fmtMoney(res.diferencia), res.diferencia === null ? null : 'cobrado − productos', res.diferencia ? 'warn' : null),
      kpi('Pedidos a $0', fmtNum(res.pedidosCero.length, 0), res.pedidosCero.length ? 'N.º ' + res.pedidosCero.slice(0, 6).join(', ') + (res.pedidosCero.length > 6 ? '…' : '') : null, res.pedidosCero.length ? 'warn' : null)) : null;

    mount(root, cab, subnav(SUBNAV_VENTAS, 'ventas'),
      h('div', { class: 'toolbar' }, chips.el, campo('Fecha de las ventas', inpFecha, E.fecha ? fechaLarga(E.fecha) : null)),
      E.existente ? h('div', { class: 'existe' }, banner(`Ya hay ventas importadas de este día${E.existente.n_pedidos ? ' (' + E.existente.n_pedidos + ' pedidos)' : ''}. Al confirmar se reemplazan.`, 'warn'),
        h('button', { class: 'btn btn-text btn-danger', type: 'button', text: 'Borrar las de este día', on: { click: () => pedirBorrar({ ...E.existente, fecha_desde: E.fecha }) } })) : null,
      h('div', { class: 'subida' }, h('label', { class: 'btn ' + (imp ? 'btn-ghost' : 'btn-primary'), for: 'f-archivo' }, h('span', { text: imp ? 'Sumar otro Excel' : 'Elegir Excel de Núcleo' })), inpArchivo,
        h('p', { class: 'sub', text: 'Subí el detalle por pedido y las formas de pago del mismo día. También sirve "Pedidos por producto".' })),
      archivos, fechaDif ? banner(`Los archivos son del ${res.fecha.split('-').reverse().join('/')} pero elegiste otra fecha.`, 'warn') : null,
      res && res.ignoraSimple ? banner('Se usa el detalle por pedido; "Pedidos por producto" se ignora.', 'info') : null,
      prev, zonaLista,
      imp ? h('div', { class: 'confirmar' }, btn) : (listaRecientes() || vacio('Todavía no subiste nada', 'Elegí el local, la fecha y el Excel que baja de Núcleo.')));
    pintarLista();
  }

  function pintarResultado() {
    const r = E.resultado;
    const nl = (G.locales.find(l => l.id === r.local) || {}).nombre || '';
    mount(root, cab, subnav(SUBNAV_VENTAS, 'ventas'),
      h('section', { class: 'resultado', 'aria-live': 'polite' },
        h('div', { class: 'res-ico' }, icon('check', 30)),
        h('h2', { class: 'res-t', text: 'Ventas importadas' }),
        h('p', { class: 'sub', text: `${nl} · ${fechaLarga(r.fecha)}${r.reemplazo ? ' · reemplazó la importación anterior' : ''}` }),
        h('section', { class: 'kpis' },
          kpi('Productos', fmtMoney(r.resumen.totalProductos), `${r.items} renglones`), kpi('Pedidos', fmtNum(r.pedidos, 0)),
          kpi('Movimientos de stock', fmtNum(r.movimientos, 0)), kpi('Sin descontar', fmtNum(r.no_descontados, 0))),
        r.sin_receta && r.sin_receta.length ? h('div', { class: 'res-sr' },
          banner(`${r.sin_receta.length} ${r.sin_receta.length === 1 ? 'plato vendido no tiene' : 'platos vendidos no tienen'} receta: no descontaron insumos. Si alguno se vende tal cual (pulseras, aguas), abrilo en Recetas y tocá «Se vende tal cual».`, 'warn'),
          h('ul', { class: 'barras' }, r.sin_receta.slice(0, 8).map(p => h('li', { class: 'bfila' }, h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: p.nombre }), h('b', { class: 'num', text: fmtNum(p.cantidad, 3) }))))),
          h('a', { class: 'btn btn-primary', href: '#/recetas', text: 'Cargar recetas' })) : banner('Todos los platos vendidos tienen receta.', 'info'),
        h('div', { class: 'acciones' }, h('a', { class: 'btn btn-ghost', href: '#/analisis', text: 'Ver análisis' }),
          h('button', { class: 'btn btn-ghost', type: 'button', text: 'Importar otro día', on: { click: () => { E.resultado = null; pintar(); } } }),
          h('button', { class: 'btn btn-text btn-danger', type: 'button', text: 'Me equivoqué: borrar esta importación', on: { click: () => pedirBorrar({ id: r.import_id, fecha_desde: r.fecha, archivo: null }) } }))));
  }

  await prepararLocal();
  pintar();
}
