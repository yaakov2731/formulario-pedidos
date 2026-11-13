// Gerencia · Stock por local. Vista "Productos": qué hay, dónde está (lugar) y qué entró hoy, con la lista compartida de
// inventario.js (la misma que ve el encargado). Al tocar un producto: lugar, movimientos y Ajuste (Conté / Se perdió / Entró).
// Impresión: planilla por lugar con lo que figura y una columna vacía para contar a mano.
// Vista "Métricas": valor del stock, consumo con días de cobertura, producción disponible y platos que se pueden servir.
import { mount, h, fmtNum, fmtMoney, parseNum, lsGet, lsSet, esCarta, fechaCorta, fechaLarga, hoyISO, porTexto, esBulto, factorDe, plural, textoBulto, elabora } from './util.js';
import { contarProducto, contarLocal, registrarAjuste, movimientosDesde, listarConteos, ordenesLocalDesde, ultimaVentaSubida, cargarRecetas, mensajeError } from './api.js';
import { G, cargarG, nombreLocal, codigoLocal, chipsLocal } from './datos.js';
import { esqueleto, toast, hoja, campo, icon, subnav, SUBNAV_STOCK } from './ui.js';
import { inventario, planillaConteo, DIAS_MOV } from './inventario.js';

const MOTIVOS = ['Vencido', 'Roto o derramado', 'Mal hecho o se quemó', 'Comida del personal', 'Otro'];
const ENTRADAS = ['Compra al paso', 'Traído de otro local', 'Devolución', 'Otro'];

export async function render(root, ctx) {
  let localId = lsGet('g:local');
  let vista = lsGet('g:stk-vista', 'productos') === 'metricas' ? 'metricas' : 'productos';
  let movs = [], conteos = [], movsLocal = null, recetas = null, pedido = 0, inv = null, invLocal = null;
  const provDeOrden = new Map();
  const resumen = h('div', { class: 'stk-resumen', 'aria-live': 'polite' });
  const zonaProd = h('div', { class: 'stk-prod' }, esqueleto(5));
  const sub = h('p', { class: 'sub', text: 'Lo que hay en cada local' });
  const btnPrint = h('button', { class: 'icon-btn stk-print', type: 'button', 'aria-label': 'Imprimir planilla para contar', title: 'Imprimir planilla para contar', on: { click: () => imprimir() } }, icon('imprimir', 20));
  const cab = h('header', { class: 'vista-head stk-head' }, h('div', { class: 'stk-head-t' }, h('h1', { class: 'titulo', text: 'Stock' }), sub), btnPrint);
  const nav = subnav(SUBNAV_STOCK, 'stock');
  mount(root, cab, nav, esqueleto(5));

  const quedan = (p) => G.stock.get(p.local_id + '|' + p.id) || 0;
  const u = (p) => p.unidad_uso ? ' ' + p.unidad_uso : '';
  const n2 = (n) => fmtNum(n, 2) || '0';
  const enBultos = (p, n) => { const b = Math.round(n / factorDe(p) * 10) / 10; return `${fmtNum(b, 1) || '0'} ${plural(p.unidad_compra, b)}`; };
  const prodsLocal = () => [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && !esCarta(p) && (!p.oculto || quedan(p) !== 0));
  const hace7 = () => new Date(Date.now() - 7 * 864e5).toISOString();
  // Consumo real de 7 días para saber cuánto alcanza: ventas por receta, producción, merma, uso del día y la diferencia
  // de los conteos (lo que faltó suma, lo que sobró resta). En el Shopping, que no vende por receta, es solo el conteo.
  function consumo7() {
    const c = new Map(); const tipos = ['venta', 'produccion_consumo', 'merma', 'uso_dia', 'ajuste_conteo']; const d = hace7();
    for (const x of movs) if (x.creado_en >= d && tipos.includes(x.tipo)) c.set(x.producto_id, (c.get(x.producto_id) || 0) - Number(x.cantidad));
    return c;
  }

  // Movimientos de 30 días, últimos conteos y de qué proveedor vino cada recepción.
  async function cargarMovs() {
    const n = ++pedido; const lid = localId;
    if (movsLocal === lid) return;
    const desde = new Date(Date.now() - DIAS_MOV * 864e5).toISOString();
    try {
      const [r, cs, os] = await Promise.all([movimientosDesde(lid, desde), listarConteos(lid, 12).catch(() => []), ordenesLocalDesde(lid, desde).catch(() => [])]);
      if (n !== pedido || !ctx.alive()) return;
      movs = r; conteos = cs || []; movsLocal = lid;
      for (const o of os || []) { const pv = o.proveedor_id && G.provs.get(o.proveedor_id); if (pv) provDeOrden.set(o.id, pv.nombre); }
    } catch (e) { if (n === pedido) toast('No pude cargar los movimientos: ' + mensajeError(e), 'error'); }
  }

  function ajustar(p, modo = 'contar') {
    const seg = h('div', { class: 'seg seg-form', role: 'tablist', 'aria-label': 'Tipo de ajuste' });
    const zona = h('div', { class: 'form' });
    const { cerrar } = hoja(`Ajuste · ${p.nombre}`, h('div', { class: 'form' },
      h('p', { class: 'sub stk-ahora' }, 'Ahora figuran ', h('b', { class: 'num', text: n2(quedan(p)) + u(p) }), esBulto(p) ? ` · ${enBultos(p, quedan(p))}` : null), seg, zona));
    const pintar = () => {
      seg.replaceChildren(...[['contar', 'Conté'], ['merma', 'Se perdió'], ['entrada', 'Entró']].map(([id, t]) => h('button', {
        class: 'seg-b' + (modo === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': modo === id ? 'true' : 'false', text: t, 'data-modo': id,
        on: { click: () => { modo = id; pintar(); } } })));
      const inp = h('input', { class: 'input num inp-big', type: 'text', inputmode: 'decimal', value: modo === 'contar' ? n2(quedan(p)) : '', placeholder: '0', 'aria-label': modo === 'contar' ? 'Cantidad contada' : 'Cantidad' });
      const opciones = modo === 'merma' ? MOTIVOS : ENTRADAS;
      let motivo = '';
      const chipsM = modo === 'contar' ? null : h('div', { class: 'chips stk-motivos', role: 'group', 'aria-label': 'Motivo' }, opciones.map(t => h('button', {
        class: 'chip', type: 'button', text: t, 'aria-pressed': 'false',
        on: { click: (e) => { motivo = t; chipsM.querySelectorAll('.chip').forEach(b => { const on = b === e.currentTarget; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); } } })));
      const nota = modo === 'contar' ? null : h('input', { class: 'input', type: 'text', placeholder: 'Detalle (opcional)', 'aria-label': 'Detalle', maxlength: '120' });
      const texto = { contar: 'Guardar conteo', merma: 'Descontar del stock', entrada: 'Sumar al stock' }[modo];
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: texto });
      zona.replaceChildren(
        campo(modo === 'contar' ? `Cuánto hay${u(p) ? ' (' + p.unidad_uso + ')' : ''}` : `Cantidad${u(p) ? ' (' + p.unidad_uso + ')' : ''}`, inp,
          [modo === 'contar' ? 'La diferencia con lo que figura queda registrada.' : '', textoBulto(p)].filter(Boolean).join(' · ') || null),
        chipsM ? h('div', { class: 'field' }, h('span', { class: 'field-l', text: 'Motivo' }), chipsM) : null, nota, btn);
      setTimeout(() => inp.select(), 50);
      btn.addEventListener('click', async () => {
        const n = parseNum(inp.value);
        if (n === null || n < 0 || (modo !== 'contar' && n === 0)) return toast('Poné una cantidad válida.', 'error');
        if (modo !== 'contar' && !motivo) return toast('Elegí el motivo.', 'error');
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          const ahora = new Date().toISOString();
          if (modo === 'contar') {
            // Queda en Stock → Conteos (se puede borrar si estuvo mal). Sin el SQL 0024, como antes.
            let dif;
            try { const antes = quedan(p); await contarLocal(p.local_id, [{ producto_id: p.id, contado: n }], 'Gerencia'); dif = Math.round((n - antes) * 1000) / 1000; }
            catch (e) { if (!(e && (e.code === 'PGRST202' || /contar_local|could not find the function/i.test(e.message || '')))) throw e; dif = Number(await contarProducto(p.local_id, p.id, n)); }
            G.stock.set(p.local_id + '|' + p.id, n);
            if (dif) movs.push({ producto_id: p.id, tipo: 'ajuste_conteo', cantidad: dif, nota: 'Conteo', creado_en: ahora });
            toast(dif === 0 ? 'Sin diferencias.' : `Diferencia ${dif > 0 ? '+' : ''}${fmtNum(dif, 3)}`, 'ok');
          } else {
            const cant = modo === 'merma' ? -n : n;
            const txt = (modo === 'merma' ? 'Merma: ' : 'Entrada: ') + motivo + (nota.value.trim() ? ' · ' + nota.value.trim() : '');
            await registrarAjuste({ local_id: p.local_id, producto_id: p.id, tipo: modo === 'merma' ? 'merma' : 'recepcion', cantidad: cant, ref_tipo: 'ajuste', nota: txt });
            G.stock.set(p.local_id + '|' + p.id, quedan(p) + cant);
            movs.push({ producto_id: p.id, tipo: modo === 'merma' ? 'merma' : 'recepcion', cantidad: cant, nota: txt, creado_en: ahora });
            toast(modo === 'merma' ? `Se descontó ${fmtNum(n, 3)}${u(p)}.` : `Se sumó ${fmtNum(n, 3)}${u(p)}.`, 'ok');
          }
          cerrar(); pintarProductos(true);
        } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = texto; }
      });
    };
    pintar();
  }

  // Lista de productos (la misma del encargado) con el Ajuste de gerencia dentro de la hoja del producto.
  function pintarProductos() {
    if (vista !== 'productos' || !localId) return;
    if (!inv || invLocal !== localId) {
      invLocal = localId;
      inv = inventario({ localId, prods: [...G.prods.values()].filter(p => p.local_id === localId), stockDe: quedan, movs, conteos, provDeOrden, clave: 'inv-ger',
        acciones: (p, cerrar) => h('div', { class: 'inv-ajuste' },
          h('span', { class: 'field-l', text: 'Ajustar' }),
          h('div', { class: 'inv-ajuste-b' }, ...[['contar', 'Conté'], ['merma', 'Se perdió'], ['entrada', 'Entró']].map(([m, t]) =>
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t, 'data-ajuste': m, on: { click: () => { cerrar(); ajustar(p, m); } } })))) });
      zonaProd.replaceChildren(inv.el);
    }
    inv.pintar();
  }
  // Los movimientos llegan después: se rearma la lista con ellos.
  const conMovs = () => { inv = null; pintarProductos(); };

  // Planilla A4 por lugar con lo que figura y una columna vacía para contar a mano. Desde el diálogo se guarda como PDF.
  function imprimir() {
    const vis = inv ? inv.visibles() : [];
    if (!vis.length) return;
    document.querySelectorAll('.print-area').forEach(el => el.remove());
    const area = planillaConteo(nombreLocal(localId), fechaLarga(hoyISO()), vis, quedan, true);
    document.body.append(area);
    document.body.classList.add('imprimiendo');
    const limpiar = () => { document.body.classList.remove('imprimiendo'); area.remove(); window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    window.print();
    setTimeout(limpiar, 1000);
  }

  // Métricas del local elegido. Consumo = ventas + insumos usados en producción + merma de los últimos 7 días.
  async function pintarResumen() {
    const n = ++pedido; const lid = localId;
    if (!lid || vista !== 'metricas') return;
    let ultima = null;
    try { [ultima, recetas] = await Promise.all([ultimaVentaSubida(lid), recetas ? Promise.resolve(recetas) : cargarRecetas(), cargarMovs()]); }
    catch (e) { if (n === pedido) resumen.replaceChildren(h('p', { class: 'sub', text: 'No pude cargar las métricas: ' + mensajeError(e) })); return; }
    if (!ctx.alive() || lid !== localId || vista !== 'metricas') return;

    const prods = prodsLocal();
    let valor = 0, sinPrecio = 0, conStock = 0, enCero = 0;
    for (const p of prods) {
      const s = quedan(p);
      if (s > 0) { conStock++; const pr = G.precios.get(p.id); if (pr) valor += s / Number(p.factor_conversion || 1) * pr; else sinPrecio++; }
      else enCero++;
    }
    const consumo = consumo7(); const porVentas = movs.filter(m => m.tipo === 'venta').length;
    const top = [...consumo].map(([id, c]) => ({ p: G.prods.get(id), c })).filter(x => x.p && x.c > 0)
      .map(x => ({ ...x, dias: quedan(x.p) / (x.c / 7) })).sort((a, b) => a.dias - b.dias).slice(0, 8);

    const elab = (recetas || []).filter(r => r.receta_items.length).map(r => ({ r, p: G.prods.get(r.producto_id) })).filter(x => x.p && x.p.local_id === lid && x.p.activo !== false)
      .map(({ r, p }) => {
        const veces = Math.min(...r.receta_items.map(it => Math.max(0, G.stock.get(lid + '|' + it.insumo_id) || 0) / Number(it.cantidad)));
        const falta = r.receta_items.map(it => ({ it, v: Math.max(0, G.stock.get(lid + '|' + it.insumo_id) || 0) / Number(it.cantidad) })).sort((a, b) => a.v - b.v)[0];
        return { p, estimada: !!r.estimada, hechos: quedan(p), sePuede: Math.floor(veces * Number(r.rinde)), limita: falta && G.prods.get(falta.it.insumo_id) };
      }).sort((a, b) => porTexto(a.p.nombre, b.p.nombre));
    const elaborados = elab.filter(x => !esCarta(x.p));
    const platos = elab.filter(x => esCarta(x.p)).sort((a, b) => a.sePuede - b.sePuede || porTexto(a.p.nombre, b.p.nombre));
    const conCocina = elabora(codigoLocal(lid));
    const conteo = movs.filter(m => m.tipo === 'ajuste_conteo').sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))[0];

    const kpi = (t, v, nota, warn) => h('div', { class: 'kpi' + (warn ? ' kpi-warn' : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
    resumen.replaceChildren(
      h('section', { class: 'kpis', 'data-metricas': '' },
        kpi('Valor del stock', fmtMoney(valor), sinPrecio ? `${sinPrecio} sin costo cargado` : 'a costo de compra'),
        kpi('Con stock', String(conStock), `de ${prods.length} productos`),
        kpi('En cero', String(enCero), 'sin unidades', enCero > 0),
        conCocina ? kpi('Última venta subida', ultima ? fechaCorta((ultima.fecha_desde || ultima.creado_en.slice(0, 10)) + 'T12:00:00').split(' · ')[0] : '—', ultima ? `${porVentas} descuentos en 7 días` : 'todavía no se subió', !ultima)
          : kpi('Último conteo', conteo ? fechaCorta(conteo.creado_en).split(' · ')[0] : '—', conteo ? 'lo que faltó es lo que se usó' : 'contá en Productos → Contar', !conteo)),
      h('div', { class: 'tb-grid' },
        h('section', { class: 'bloque', 'data-bloque': 'consumo' }, h('h2', { class: 'bloque-t', text: 'Lo que más se usa (7 días)' }),
          top.length ? h('ul', { class: 'barras' }, top.map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre }), h('b', { class: 'num', text: `Quedan ${n2(quedan(x.p))}${u(x.p)}` })),
            h('span', { class: 'bfila-d' + (x.dias < 2 ? ' bfila-mal' : ''), text: `Usó ${fmtNum(x.c, 2)}${u(x.p)} · ` + (x.dias < 0.5 ? 'no alcanza para hoy' : `alcanza para ${fmtNum(Math.floor(x.dias), 0)} ${Math.floor(x.dias) === 1 ? 'día' : 'días'}`) }))))
            : h('p', { class: 'sub', text: conCocina ? 'Todavía no hay ventas ni producción de esta semana. Al subir las ventas de Núcleo se descuentan solas del stock.' : 'Todavía no hay conteos esta semana. Contá en Productos → Contar: lo que falta contra lo que había más lo que entró es lo que se usó.' })),
        conCocina ? h('section', { class: 'bloque', 'data-bloque': 'produccion' }, h('h2', { class: 'bloque-t', text: 'Producción disponible' }),
          elaborados.length ? h('ul', { class: 'barras' }, elaborados.map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre }), h('b', { class: 'num', text: `Hechos ${n2(x.hechos)}${u(x.p)}` })),
            h('span', { class: 'bfila-d' + (x.sePuede <= 0 ? ' bfila-mal' : ''), text: x.sePuede > 0 ? `Se pueden hacer ${fmtNum(x.sePuede, 0)}${u(x.p)} más${x.limita ? ' · limita ' + x.limita.nombre : ''}` : `No alcanza para hacer más${x.limita ? ': falta ' + x.limita.nombre : ''}` }))))
            : h('p', { class: 'sub', text: 'No hay elaborados con receta en este local (salsas, masas, postres de la casa). Se cargan en Catálogo y Cocina → Recetas.' })) : null,
        conCocina ? h('section', { class: 'bloque', 'data-bloque': 'platos' }, h('h2', { class: 'bloque-t', text: 'Platos que se pueden servir' }),
          platos.length ? h('ul', { class: 'barras' }, platos.slice(0, 10).map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre + (x.estimada ? ' *' : '') }), h('b', { class: 'num', text: x.sePuede > 0 ? `${fmtNum(x.sePuede, 0)}` : 'Ninguno' })),
            h('span', { class: 'bfila-d' + (x.sePuede <= 2 ? ' bfila-mal' : ''), text: x.limita ? `Limita ${x.limita.nombre} (quedan ${n2(Math.max(0, quedan(x.limita)))}${u(x.limita)})` : '' }))))
            : h('p', { class: 'sub', text: 'Cargá las recetas en Cocina → Recetas para ver cuántos platos alcanzan con el stock.' }),
          platos.some(x => x.estimada) ? h('p', { class: 'kpi-n', text: '* receta estimada: revisala en Cocina → Recetas' }) : null) : null));
  }

  await cargarG(['prods', 'locales', 'stock', 'precios', 'provs'], () => { if (ctx.alive() && inv) { inv = null; pintarProductos(); } });
  if (!ctx.alive()) return;
  const locales = G.locales.filter(l => l.activo);
  if (!locales.some(l => l.id === localId)) localId = (locales[0] || {}).id;
  const ponerSub = () => { sub.textContent = nombreLocal(localId); };
  const chips = chipsLocal(async (id) => {
    localId = id; movs = []; conteos = []; movsLocal = null; inv = null; ponerSub();
    await refrescar();
  }).el;
  const segVista = h('div', { class: 'seg seg-ped', role: 'tablist', 'aria-label': 'Vista de stock' });
  const cuerpo = h('div', {});
  const pintarVista = () => {
    segVista.replaceChildren(...[['productos', 'Productos'], ['metricas', 'Métricas']].map(([id, t]) => h('button', {
      class: 'seg-b' + (vista === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': vista === id ? 'true' : 'false', text: t, 'data-vista': id,
      on: { click: () => { if (vista === id) return; vista = id; lsSet('g:stk-vista', id); pintarVista(); refrescar(); } } })));
    btnPrint.hidden = vista !== 'productos';
    cuerpo.replaceChildren(vista === 'productos' ? zonaProd : resumen);
  };
  async function refrescar() {
    if (vista === 'productos') { pintarProductos(); const antes = movsLocal; await cargarMovs(); if (ctx.alive() && movsLocal !== antes) conMovs(); }
    else { resumen.replaceChildren(esqueleto(3)); await pintarResumen(); }
  }
  ponerSub(); pintarVista();
  mount(root, cab, nav, h('div', { class: 'toolbar' }, chips), segVista, cuerpo);
  await refrescar();
}
