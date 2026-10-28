// Gerencia · Stock por local. Vista "Productos": resumen por estado (tocable como filtro), categorías, una tarjeta por
// producto con Inicio / Ahora / Dif. del período, estado por color, Contar y Ajuste con motivo, e impresión A4 (o PDF).
// Vista "Métricas": valor del stock, consumo con días de cobertura, producción disponible y platos que se pueden servir.
import { mount, h, tokens, coincide, fmtNum, fmtMoney, parseNum, groupBy, porTexto, lsGet, lsSet, esCarta, fechaCorta, fechaLarga, hoyISO, sugerido } from './util.js';
import { contarProducto, registrarAjuste, movimientosDesde, ultimaVentaSubida, cargarRecetas, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, icon, subnav, SUBNAV_STOCK } from './ui.js';

const PERIODOS = { hoy: 'Hoy', semana: '7 días' };
const ESTADO = { agotado: 'Agotado', bajo: 'Por agotarse', ok: 'Ok' };
const MOTIVOS = ['Vencido', 'Roto o derramado', 'Mal hecho o se quemó', 'Comida del personal', 'Otro'];
const ENTRADAS = ['Compra al paso', 'Traído de otro local', 'Devolución', 'Otro'];

export async function render(root, ctx) {
  let localId = lsGet('g:local');
  let vista = lsGet('g:stk-vista', 'productos') === 'metricas' ? 'metricas' : 'productos';
  let periodo = lsGet('g:stk-periodo', 'semana') === 'hoy' ? 'hoy' : 'semana';
  let q = '', filtroEstado = 'todos', filtroCat = 'todas';
  let movs = [], movsLocal = null, recetas = null, pedido = 0;
  const lista = h('div', { class: 'lista stk-lista' });
  const resumen = h('div', { class: 'stk-resumen', 'aria-live': 'polite' });
  const estados = h('div', { class: 'stk-estados', role: 'group', 'aria-label': 'Filtrar por estado' });
  const cats = h('div', { class: 'chips chips-scroll stk-cats', role: 'group', 'aria-label': 'Categoría' });
  const sub = h('p', { class: 'sub', text: 'Lo que queda en cada local' });
  const btnPrint = h('button', { class: 'icon-btn stk-print', type: 'button', 'aria-label': 'Imprimir o guardar PDF', title: 'Imprimir o guardar PDF', on: { click: () => imprimir() } }, icon('imprimir', 20));
  const cab = h('header', { class: 'vista-head stk-head' }, h('div', { class: 'stk-head-t' }, h('h1', { class: 'titulo', text: 'Stock' }), sub), btnPrint);
  const nav = subnav(SUBNAV_STOCK, 'stock');
  mount(root, cab, nav, esqueleto(5));

  const quedan = (p) => G.stock.get(p.local_id + '|' + p.id) || 0;
  const u = (p) => p.unidad_uso ? ' ' + p.unidad_uso : '';
  const n2 = (n) => fmtNum(n, 2) || '0';
  const desdeISO = () => { if (periodo === 'hoy') { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); } return new Date(Date.now() - 7 * 864e5).toISOString(); };
  // Lo oculto (resto de la lista de un mayorista) solo se lista si hay stock.
  const prodsLocal = () => [...G.prods.values()].filter(p => p.local_id === localId && p.activo !== false && !esCarta(p) && (!p.oculto || quedan(p) !== 0));

  // Por producto, en el período: suma de movimientos (Dif.), entradas, salidas y el último ajuste a mano.
  function porProducto() {
    const desde = desdeISO(); const m = new Map();
    for (const x of movs) {
      if (x.creado_en < desde) continue;
      const c = Number(x.cantidad); const r = m.get(x.producto_id) || { dif: 0, entro: 0, salio: 0, ajuste: null };
      r.dif += c; if (c > 0) r.entro += c; else r.salio -= c;
      if (x.tipo === 'ajuste_conteo' || x.tipo === 'merma' || (x.tipo === 'recepcion' && /^Entrada/.test(x.nota || ''))) r.ajuste = x;
      m.set(x.producto_id, r);
    }
    return m;
  }
  // Consumo de 7 días (ventas, producción y merma) para saber cuánto alcanza.
  function consumo7() {
    const c = new Map();
    for (const x of movs) if (['venta', 'produccion_consumo', 'merma', 'uso_dia'].includes(x.tipo)) c.set(x.producto_id, (c.get(x.producto_id) || 0) - Number(x.cantidad));
    return c;
  }
  function estadoDe(p, cons) {
    const s = quedan(p);
    if (s <= 0) return 'agotado';
    const pedir = sugerido(p, s);
    const usa = (cons.get(p.id) || 0) / 7;
    if (pedir || (usa > 0 && s / usa < 2)) return 'bajo';
    return 'ok';
  }

  async function cargarMovs() {
    const n = ++pedido; const lid = localId;
    if (movsLocal === lid) return;
    try { const r = await movimientosDesde(lid, new Date(Date.now() - 7 * 864e5).toISOString()); if (n !== pedido || !ctx.alive()) return; movs = r; movsLocal = lid; }
    catch (e) { if (n === pedido) toast('No pude cargar los movimientos: ' + mensajeError(e), 'error'); }
  }

  function ajustar(p, modo = 'contar') {
    const seg = h('div', { class: 'seg seg-form', role: 'tablist', 'aria-label': 'Tipo de ajuste' });
    const zona = h('div', { class: 'form' });
    const { cerrar } = hoja(`Ajuste · ${p.nombre}`, h('div', { class: 'form' },
      h('p', { class: 'sub stk-ahora' }, 'Ahora figuran ', h('b', { class: 'num', text: n2(quedan(p)) + u(p) })), seg, zona));
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
          modo === 'contar' ? 'La diferencia con lo que figura queda registrada.' : null),
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
            const dif = Number(await contarProducto(p.local_id, p.id, n));
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
          cerrar(); pintarProductos();
        } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = texto; }
      });
    };
    pintar();
  }

  const fila = (k, v, clase, unidad) => h('div', { class: 'stk-c' + (clase ? ' ' + clase : '') }, h('span', { class: 'stk-ck', text: k }), h('b', { class: 'stk-cv num', text: v }), unidad ? h('span', { class: 'stk-cu', text: unidad }) : null);
  const signo = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + n2(Math.abs(n));
  function textoAjuste(a, p) {
    if (!a) return null;
    const c = Number(a.cantidad); const cuando = fechaCorta(a.creado_en);
    if (a.tipo === 'ajuste_conteo') return `Conteo ${cuando}: ${c > 0 ? 'sobraban' : 'faltaban'} ${n2(Math.abs(c))}${u(p)}`;
    return `${(a.nota || '').replace(/^(Merma|Entrada): /, '')} · ${signo(c)}${u(p)} · ${cuando}`;
  }

  function tarjeta(p, est, r) {
    const s = quedan(p); const dif = r ? r.dif : 0; const pedir = est !== 'ok' ? sugerido(p, s) : null;
    const aj = r && textoAjuste(r.ajuste, p);
    return h('article', { class: 'prod prod-stk stk-' + est, 'data-estado': est, 'data-prod': p.id },
      h('div', { class: 'stk-top' }, h('h3', { class: 'prod-n', text: p.nombre }), h('span', { class: 'stk-pill stk-pill-' + est, text: ESTADO[est] })),
      h('div', { class: 'stk-cols' },
        fila(periodo === 'hoy' ? 'Al abrir' : 'Hace 7 días', n2(s - dif)),
        fila('Quedan', n2(s), 'stk-c-ahora', p.unidad_uso),
        fila('Dif.', signo(dif), dif < 0 ? 'stk-c-menos' : dif > 0 ? 'stk-c-mas' : '')),
      r && (r.entro || r.salio) ? h('p', { class: 'stk-mov', text: [r.entro ? `Entró ${n2(r.entro)}` : '', r.salio ? `Salió ${n2(r.salio)}` : ''].filter(Boolean).join(' · ') }) : null,
      aj ? h('p', { class: 'stk-aj', text: aj }) : null,
      h('div', { class: 'stk-acc' },
        pedir ? h('span', { class: 'stk-pedir', text: `Pedir ${n2(pedir)}${u(p)}` }) : null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Contar', 'aria-label': `Contar ${p.nombre}`, on: { click: () => ajustar(p, 'contar') } }),
        h('button', { class: 'btn btn-ghost btn-sm stk-ajuste', type: 'button', 'aria-label': `Ajuste de ${p.nombre}`, on: { click: () => ajustar(p, s > 0 ? 'merma' : 'contar') } }, icon('ajuste', 18), h('span', { text: 'Ajuste' }))));
  }

  // Calcula todo una vez y pinta estados, categorías y lista. Devuelve lo visible (para imprimir).
  let visibles = [];
  function pintarProductos() {
    if (vista !== 'productos') return;
    const cons = consumo7(); const pp = porProducto(); const t = tokens(q);
    const todos = prodsLocal().map(p => ({ p, est: estadoDe(p, cons), r: pp.get(p.id) }));
    const conTexto = todos.filter(x => coincide(x.p.nombre + ' ' + x.p.codigo, t));
    const cuenta = { todos: conTexto.length, agotado: 0, bajo: 0 };
    for (const x of conTexto) if (x.est !== 'ok') cuenta[x.est]++;
    estados.replaceChildren(...[['todos', 'Productos'], ['agotado', 'Agotados'], ['bajo', 'Por agotarse']].map(([id, t2]) => h('button', {
      class: `stk-k stk-k-${id}` + (filtroEstado === id ? ' is-on' : ''), type: 'button', 'aria-pressed': filtroEstado === id ? 'true' : 'false', 'data-filtro': id,
      on: { click: () => { filtroEstado = filtroEstado === id && id !== 'todos' ? 'todos' : id; pintarProductos(); } }
    }, h('b', { class: 'stk-kv num', text: String(cuenta[id]) }), h('span', { class: 'stk-kt', text: t2 }))));
    const porEstado = conTexto.filter(x => filtroEstado === 'todos' || x.est === filtroEstado);
    const categorias = [...new Set(todos.map(x => x.p.categoria || 'Sin categoría'))].sort(porTexto);
    if (filtroCat !== 'todas' && !categorias.includes(filtroCat)) filtroCat = 'todas';
    cats.replaceChildren(...['todas', ...categorias].map(c => h('button', {
      class: 'chip' + (filtroCat === c ? ' is-on' : ''), type: 'button', 'aria-pressed': filtroCat === c ? 'true' : 'false', text: c === 'todas' ? 'Todas' : c,
      on: { click: () => { filtroCat = c; pintarProductos(); } } })));
    cats.hidden = categorias.length < 2;
    visibles = porEstado.filter(x => filtroCat === 'todas' || (x.p.categoria || 'Sin categoría') === filtroCat);
    btnPrint.disabled = !visibles.length;
    if (!visibles.length) {
      lista.replaceChildren(vacio(filtroEstado !== 'todos' ? `Nada ${filtroEstado === 'agotado' ? 'agotado' : 'por agotarse'}` : 'Sin productos',
        filtroEstado !== 'todos' ? 'Bien: en este filtro no hay nada para reponer.' : 'Cambiá el local, la categoría o la búsqueda.'));
      return;
    }
    const orden = { agotado: 0, bajo: 1, ok: 2 };
    const g = groupBy(visibles, x => x.p.categoria || 'Sin categoría');
    const out = [];
    for (const k of [...g.keys()].sort(porTexto)) {
      out.push(h('h2', { class: 'cat-t', text: k }));
      for (const x of g.get(k).sort((a, b) => orden[a.est] - orden[b.est] || porTexto(a.p.nombre, b.p.nombre))) out.push(tarjeta(x.p, x.est, x.r));
    }
    lista.replaceChildren(...out);
  }

  // Hoja A4 con lo que está en pantalla y una columna vacía para anotar el conteo a mano. Desde el diálogo se guarda como PDF.
  function imprimir() {
    if (!visibles.length) return;
    document.querySelectorAll('.print-area').forEach(el => el.remove());
    const g = groupBy(visibles, x => x.p.categoria || 'Sin categoría');
    const filtros = [filtroEstado !== 'todos' ? (filtroEstado === 'agotado' ? 'Agotados' : 'Por agotarse') : '', filtroCat !== 'todas' ? filtroCat : '', q ? `"${q}"` : ''].filter(Boolean).join(' · ');
    const area = h('div', { class: 'print-area' }, h('section', { class: 'pr-prov' },
      h('header', { class: 'pr-head' },
        h('div', {}, h('div', { class: 'pr-marca', text: 'Docks del Puerto · Stock' }), h('h1', { class: 'pr-t', text: nombreLocal(localId) })),
        h('div', { class: 'pr-datos' }, h('div', { text: fechaLarga(hoyISO()) }), h('div', { text: `Período: ${PERIODOS[periodo]}${filtros ? ' · ' + filtros : ''}` }), h('div', { text: `${visibles.length} productos` }))),
      h('table', { class: 'pr-tabla pr-stock' },
        h('thead', {}, h('tr', {}, ...['Producto', periodo === 'hoy' ? 'Al abrir' : 'Hace 7 días', 'Quedan', 'Dif.', 'Unidad', 'Estado', 'Contado'].map((t, i) => h('th', { class: i >= 1 && i <= 3 ? 'pr-num' : (i === 6 ? 'pr-ok' : null), text: t })))),
        h('tbody', {}, [...g.keys()].sort(porTexto).flatMap(k => [
          h('tr', {}, h('th', { class: 'pr-local', colspan: '7', text: k })),
          ...g.get(k).sort((a, b) => porTexto(a.p.nombre, b.p.nombre)).map(x => { const s = quedan(x.p), d = x.r ? x.r.dif : 0;
            return h('tr', {}, h('td', { text: x.p.nombre }), h('td', { class: 'pr-num', text: n2(s - d) }), h('td', { class: 'pr-num', text: n2(s) }), h('td', { class: 'pr-num', text: signo(d) }),
              h('td', { text: x.p.unidad_uso || '' }), h('td', { text: ESTADO[x.est] }), h('td', { class: 'pr-ok pr-blanco' })); })])))));
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

    const kpi = (t, v, nota, warn) => h('div', { class: 'kpi' + (warn ? ' kpi-warn' : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
    resumen.replaceChildren(
      h('section', { class: 'kpis', 'data-metricas': '' },
        kpi('Valor del stock', fmtMoney(valor), sinPrecio ? `${sinPrecio} sin costo cargado` : 'a costo de compra'),
        kpi('Con stock', String(conStock), `de ${prods.length} productos`),
        kpi('En cero', String(enCero), 'sin unidades', enCero > 0),
        kpi('Última venta subida', ultima ? fechaCorta((ultima.fecha_desde || ultima.creado_en.slice(0, 10)) + 'T12:00:00').split(' · ')[0] : '—', ultima ? `${porVentas} descuentos en 7 días` : 'todavía no se subió', !ultima)),
      h('div', { class: 'tb-grid' },
        h('section', { class: 'bloque', 'data-bloque': 'consumo' }, h('h2', { class: 'bloque-t', text: 'Lo que más se usa (7 días)' }),
          top.length ? h('ul', { class: 'barras' }, top.map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre }), h('b', { class: 'num', text: `Quedan ${n2(quedan(x.p))}${u(x.p)}` })),
            h('span', { class: 'bfila-d' + (x.dias < 2 ? ' bfila-mal' : ''), text: `Usó ${fmtNum(x.c, 2)}${u(x.p)} · ` + (x.dias < 0.5 ? 'no alcanza para hoy' : `alcanza para ${fmtNum(Math.floor(x.dias), 0)} ${Math.floor(x.dias) === 1 ? 'día' : 'días'}`) }))))
            : h('p', { class: 'sub', text: 'Todavía no hay ventas ni producción de esta semana. Al subir las ventas de Núcleo se descuentan solas del stock.' })),
        h('section', { class: 'bloque', 'data-bloque': 'produccion' }, h('h2', { class: 'bloque-t', text: 'Producción disponible' }),
          elaborados.length ? h('ul', { class: 'barras' }, elaborados.map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre }), h('b', { class: 'num', text: `Hechos ${n2(x.hechos)}${u(x.p)}` })),
            h('span', { class: 'bfila-d' + (x.sePuede <= 0 ? ' bfila-mal' : ''), text: x.sePuede > 0 ? `Se pueden hacer ${fmtNum(x.sePuede, 0)}${u(x.p)} más${x.limita ? ' · limita ' + x.limita.nombre : ''}` : `No alcanza para hacer más${x.limita ? ': falta ' + x.limita.nombre : ''}` }))))
            : h('p', { class: 'sub', text: 'No hay elaborados con receta en este local (salsas, masas, postres de la casa). Se cargan en Catálogo y Cocina → Recetas.' })),
        h('section', { class: 'bloque', 'data-bloque': 'platos' }, h('h2', { class: 'bloque-t', text: 'Platos que se pueden servir' }),
          platos.length ? h('ul', { class: 'barras' }, platos.slice(0, 10).map(x => h('li', { class: 'bfila' },
            h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: x.p.nombre + (x.estimada ? ' *' : '') }), h('b', { class: 'num', text: x.sePuede > 0 ? `${fmtNum(x.sePuede, 0)}` : 'Ninguno' })),
            h('span', { class: 'bfila-d' + (x.sePuede <= 2 ? ' bfila-mal' : ''), text: x.limita ? `Limita ${x.limita.nombre} (quedan ${n2(Math.max(0, quedan(x.limita)))}${u(x.limita)})` : '' }))))
            : h('p', { class: 'sub', text: 'Cargá las recetas en Cocina → Recetas para ver cuántos platos alcanzan con el stock.' }),
          platos.some(x => x.estimada) ? h('p', { class: 'kpi-n', text: '* receta estimada: revisala en Cocina → Recetas' }) : null)));
  }

  await cargarG(['prods', 'locales', 'stock', 'precios'], () => { if (ctx.alive() && lista.isConnected) pintarProductos(); });
  if (!ctx.alive()) return;
  const locales = G.locales.filter(l => l.activo);
  if (!locales.some(l => l.id === localId)) localId = (locales[0] || {}).id;
  const ponerSub = () => { sub.textContent = nombreLocal(localId); };
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Local' }, locales.map(l => h('button', {
    class: 'chip' + (l.id === localId ? ' is-on' : ''), type: 'button', text: l.nombre, 'aria-pressed': l.id === localId ? 'true' : 'false', 'data-local': l.id,
    on: { click: async () => {
      localId = l.id; lsSet('g:local', localId); filtroCat = 'todas'; movs = []; movsLocal = null; ponerSub();
      chips.querySelectorAll('.chip').forEach(b => { const on = b.getAttribute('data-local') === l.id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      await refrescar();
    } }
  })));
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off', on: { input: (e) => { q = e.target.value; pintarProductos(); } } });
  const segPer = h('div', { class: 'seg seg-per', role: 'tablist', 'aria-label': 'Período' });
  const pintarPer = () => segPer.replaceChildren(...Object.entries(PERIODOS).map(([id, t]) => h('button', {
    class: 'seg-b' + (periodo === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': periodo === id ? 'true' : 'false', text: t, 'data-periodo': id,
    on: { click: () => { periodo = id; lsSet('g:stk-periodo', id); pintarPer(); pintarProductos(); } } })));
  pintarPer();
  const segVista = h('div', { class: 'seg seg-ped', role: 'tablist', 'aria-label': 'Vista de stock' });
  const zonaProd = h('div', { class: 'stk-prod' },
    h('div', { class: 'toolbar stk-buscar' }, buscador), estados, cats, segPer, lista);
  const cuerpo = h('div', {});
  const pintarVista = () => {
    segVista.replaceChildren(...[['productos', 'Productos'], ['metricas', 'Métricas']].map(([id, t]) => h('button', {
      class: 'seg-b' + (vista === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': vista === id ? 'true' : 'false', text: t, 'data-vista': id,
      on: { click: () => { if (vista === id) return; vista = id; lsSet('g:stk-vista', id); pintarVista(); refrescar(); } } })));
    btnPrint.hidden = vista !== 'productos';
    cuerpo.replaceChildren(vista === 'productos' ? zonaProd : resumen);
  };
  async function refrescar() {
    if (vista === 'productos') { pintarProductos(); await cargarMovs(); if (ctx.alive()) pintarProductos(); }
    else { resumen.replaceChildren(esqueleto(3)); await pintarResumen(); }
  }
  ponerSub(); pintarVista();
  mount(root, cab, nav, h('div', { class: 'toolbar' }, chips), segVista, cuerpo);
  await refrescar();
}
