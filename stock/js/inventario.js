// Inventario: una sola lista para ver qué hay en el local, dónde está y qué fue lo último que le pasó.
// La usan el encargado (Stock) y gerencia (Stock → Stock). Como las planillas de conteo "shelf-to-sheet" de las apps
// de inventario gastronómico: se agrupa por lugar (Cámara, Freezer, Depósito…) en el orden del recorrido.
// Por producto: cuánto hay ahora (último conteo + lo que entró − lo que se usó), dónde está, cuándo entró y cuándo se contó.
// Al tocar un producto: cambiar dónde está (un toque) y ver sus movimientos de los últimos 30 días.
// La ven los encargados: solo cantidades, nada de plata ni umbrales.
import { h, sugerido, tokens, coincide, fmtNum, porTexto, esCarta, esBulto, factorDe, plural, fechaCorta, porLugar, lugarDe, SIN_LUGAR, norm, lsGet, lsSet } from './util.js';
import { ubicarProductos, mensajeError } from './api.js';
import { vacio, toast, hoja, icon } from './ui.js';

const SUGERIDOS = ['Cámara', 'Freezer', 'Heladera', 'Depósito', 'Barra', 'Cocina'];
export const DIAS_MOV = 30;

// Qué le pasó al producto, en palabras.
export function tipoMov(m) {
  const nota = m.nota || '';
  switch (m.tipo) {
    case 'recepcion': return /^Entrada/.test(nota) ? 'Entró (a mano)' : 'Entró';
    case 'ajuste_conteo': return 'Ajuste por conteo';
    case 'venta': return 'Vendido';
    case 'produccion_consumo': return 'Usado en cocina';
    case 'produccion_alta': return 'Elaborado';
    case 'merma': return 'Se perdió';
    case 'uso_dia': return 'Usado';
    case 'inicial': return 'Stock inicial';
    default: return m.tipo;
  }
}
const esEntrada = (m) => (m.tipo === 'recepcion' || m.tipo === 'produccion_alta') && Number(m.cantidad) > 0;
const mismoDia = (iso, d = new Date()) => new Date(iso).toDateString() === d.toDateString();
function cuando(iso) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (mismoDia(iso)) return 'hoy ' + hora;
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(iso, ayer)) return 'ayer ' + hora;
  return fechaCorta(iso).split(' · ')[0];
}

/**
 * Monta la vista. opts:
 *  - localId, prods (del local), stockDe(p) → número
 *  - movs: movimientos de los últimos 30 días ({producto_id,tipo,cantidad,nota,creado_en,ref_id})
 *  - conteos: últimos conteos ({creado_en, encargado, items:[{producto_id, contado}]})
 *  - provDeOrden: Map orden_id → nombre del proveedor (opcional)
 *  - acciones(p, cerrar): nodos extra en la hoja del producto (gerencia: Ajustar)
 *  - clave: prefijo para recordar filtro y agrupación en el celular
 * Devuelve { el, pintar(), visibles() }.
 */
export function inventario(opts) {
  const { localId, stockDe } = opts;
  const k = (x) => `${opts.clave || 'inv'}:${x}`;
  let filtro = ['hay', 'hoy', 'cero', 'todo'].includes(lsGet(k('filtro'))) ? lsGet(k('filtro')) : 'hay';
  let agrupar = lsGet(k('agrupar')) || null;
  let q = '';

  const u = (p) => p.unidad_uso || 'unidades';
  const n2 = (n) => fmtNum(n, 2) || '0';
  const cant = (p, n) => `${n2(n)} ${plural(u(p), n)}`;
  const enBultos = (p, n) => { const b = Math.round(n / factorDe(p) * 10) / 10; return `${fmtNum(b, 1) || '0'} ${plural(p.unidad_compra, b)}`; };

  // Por producto: última entrada y último conteo, y sus movimientos (nuevo → viejo).
  let info = new Map();
  function indexar() {
    info = new Map();
    const get = (id) => { let r = info.get(id); if (!r) { r = { entrada: null, entroHoy: 0, conteo: null, movs: [] }; info.set(id, r); } return r; };
    const movs = [...(opts.movs || [])].sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
    for (const m of movs) {
      const r = get(m.producto_id); r.movs.push(m);
      if (esEntrada(m)) { if (!r.entrada) r.entrada = m; if (mismoDia(m.creado_en)) r.entroHoy += Number(m.cantidad); }
    }
    const conteos = [...(opts.conteos || [])].sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
    for (const c of conteos) for (const it of c.items || []) { const r = get(it.producto_id); if (!r.conteo) r.conteo = { creado_en: c.creado_en, encargado: c.encargado, contado: Number(it.contado), tipo: c.tipo }; }
  }
  const de = (p) => info.get(p.id) || { entrada: null, entroHoy: 0, conteo: null, movs: [] };

  // Productos que se listan: no la carta, y lo oculto (resto de la lista de un mayorista) solo si tiene stock o algo hoy.
  const base = () => opts.prods.filter(p => p.activo !== false && !esCarta(p) && (!p.oculto || stockDe(p) !== 0 || de(p).entroHoy));
  const hayLugares = () => base().some(p => lugarDe(p) !== SIN_LUGAR);

  const el = h('div', { class: 'inv' });
  const filtros = h('div', { class: 'inv-filtros', role: 'group', 'aria-label': 'Qué mostrar' });
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off',
    on: { input: (e) => { q = e.target.value; pintar(); } } });
  const segAgr = h('div', { class: 'seg inv-agr', role: 'tablist', 'aria-label': 'Agrupar' });
  const lista = h('div', { class: 'inv-lista' });
  el.append(filtros, h('div', { class: 'inv-tool' }, buscador, segAgr), lista);

  const pasa = {
    hay: (p) => stockDe(p) > 0,
    hoy: (p) => de(p).entroHoy > 0,
    cero: (p) => stockDe(p) <= 0 && !p.oculto,
    todo: () => true
  };
  let vis = [];

  // Agrupado por lugar, el lugar ya está en el título del grupo: en la fila se muestra solo por categoría.
  let conPin = true;
  function fila(p) {
    const s = stockDe(p); const r = de(p); const l = lugarDe(p);
    const sug = sugerido(p, s);
    const pedir = sug ? (esBulto(p) ? `Pedir ${fmtNum(Math.ceil(sug / factorDe(p) - 1e-9), 0)} ${plural(p.unidad_compra, Math.ceil(sug / factorDe(p) - 1e-9))}` : `Pedir ${n2(sug)} ${plural(u(p), sug)}`) : null;
    const linea = [];
    if (r.entrada) {
      const prov = opts.provDeOrden && r.entrada.ref_id && opts.provDeOrden.get(r.entrada.ref_id);
      linea.push(h('span', { class: 'inv-ev inv-ev-in' + (mismoDia(r.entrada.creado_en) ? ' is-hoy' : '') },
        `${r.entrada.tipo === 'produccion_alta' ? 'Elaborado' : 'Entró'} +${n2(Number(r.entrada.cantidad))}${prov ? ' de ' + prov : ''} · ${cuando(r.entrada.creado_en)}`));
    }
    if (r.conteo) linea.push(h('span', { class: 'inv-ev' }, `Contado ${cuando(r.conteo.creado_en)}`));
    if (!linea.length) linea.push(h('span', { class: 'inv-ev mute' }, r.movs.length ? `${tipoMov(r.movs[0])} · ${cuando(r.movs[0].creado_en)}` : `Sin movimientos en ${DIAS_MOV} días`));
    return h('button', { class: 'inv-fila' + (s <= 0 ? ' is-cero' : '') + (r.entroHoy ? ' is-hoy' : ''), type: 'button', 'data-prod': p.id, on: { click: () => detalle(p) } },
      h('div', { class: 'inv-izq' },
        h('span', { class: 'inv-n', text: p.nombre }),
        h('span', { class: 'inv-meta' },
          !conPin ? null : h('span', { class: 'inv-lugar' + (l === SIN_LUGAR ? ' is-sin' : '') }, icon('pin', 13), h('span', { text: l })), ...linea)),
      h('div', { class: 'inv-der' },
        h('b', { class: 'inv-hay num', text: n2(s) }),
        h('span', { class: 'inv-u', text: plural(u(p), s) }),
        esBulto(p) && s > 0 ? h('span', { class: 'inv-b', text: enBultos(p, s) }) : null,
        pedir ? h('span', { class: 'inv-pedir', text: pedir }) : null));
  }

  function pintar() {
    indexar();
    const todos = base();
    const t = tokens(q);
    const conTexto = todos.filter(p => coincide(p.nombre + ' ' + (p.codigo || ''), t));
    const cuenta = Object.fromEntries(Object.entries(pasa).map(([id, f]) => [id, conTexto.filter(f).length]));
    filtros.replaceChildren(...[['hay', 'Hay'], ['hoy', 'Entró hoy'], ['cero', 'En cero'], ['todo', 'Todo']].map(([id, txt]) => h('button', {
      class: `inv-k inv-k-${id}` + (filtro === id ? ' is-on' : ''), type: 'button', 'aria-pressed': filtro === id ? 'true' : 'false', 'data-filtro': id,
      on: { click: () => { filtro = id; lsSet(k('filtro'), id); pintar(); } } },
    h('b', { class: 'inv-kv num', text: String(cuenta[id]) }), h('span', { class: 'inv-kt', text: txt }))));

    const conLug = hayLugares();
    const modo = agrupar === 'categoria' || !conLug ? 'categoria' : 'lugar';
    segAgr.hidden = !conLug;
    segAgr.replaceChildren(...[['lugar', 'Por lugar'], ['categoria', 'Por categoría']].map(([id, txt]) => h('button', {
      class: 'seg-b' + (modo === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': modo === id ? 'true' : 'false', text: txt, 'data-agr': id,
      on: { click: () => { agrupar = id; lsSet(k('agrupar'), id); pintar(); } } })));

    conPin = modo !== 'lugar';
    vis = conTexto.filter(pasa[filtro]);
    if (!vis.length) {
      const msg = { hay: ['No figura nada con stock', 'Contá el local o recibí un pedido para que aparezca.'], hoy: ['Hoy no entró nada', 'Lo que se recibe aparece acá en el momento.'], cero: ['Nada en cero', ''], todo: ['Sin productos', 'Probá con otra palabra.'] }[filtro];
      lista.replaceChildren(vacio(q ? 'No hay productos' : msg[0], q ? 'Probá con otra palabra.' : msg[1]));
      return;
    }
    const grupos = modo === 'lugar' ? porLugar(vis) : (() => {
      const g = new Map();
      for (const p of [...vis].sort((a, b) => porTexto(a.nombre, b.nombre))) { const c = p.categoria || 'Sin categoría'; if (!g.has(c)) g.set(c, []); g.get(c).push(p); }
      return new Map([...g].sort((a, b) => porTexto(a[0], b[0])));
    })();
    if (modo === 'categoria') for (const ps of grupos.values()) ps.sort((a, b) => porTexto(a.nombre, b.nombre));
    lista.replaceChildren(...[...grupos].map(([g, ps]) => h('section', { class: 'inv-g', 'data-grupo': g },
      h('h2', { class: 'inv-gt' }, modo === 'lugar' ? icon('pin', 15) : null, h('span', { text: g }), h('small', { class: 'num', text: String(ps.length) })),
      h('div', { class: 'inv-gl' }, ps.map(fila)))));
  }

  // Hoja del producto: cuánto hay, dónde está (se cambia con un toque) y sus movimientos.
  function detalle(p) {
    const s = stockDe(p); const r = de(p);
    const lugares = [...new Set([...porLugar(base()).keys()].filter(l => l !== SIN_LUGAR).concat(SUGERIDOS))];
    const chips = h('div', { class: 'chips inv-lugares', role: 'group', 'aria-label': 'Dónde está' });
    const otro = h('input', { class: 'input', type: 'text', placeholder: 'Otro lugar (ej.: Estante 2)', 'aria-label': 'Otro lugar', maxlength: '40' });
    let guardando = false;
    const ubicar = async (l) => {
      if (guardando) return;
      const nuevo = l ? l.trim().replace(/\s+/g, ' ') : null;
      if (nuevo && norm(nuevo) === norm(SIN_LUGAR)) return;
      if ((p.lugar || null) === nuevo) return;
      guardando = true;
      // Va al final del recorrido de ese lugar.
      const orden = nuevo ? Math.max(0, ...opts.prods.filter(x => x.lugar === nuevo && x.orden_lugar != null).map(x => Number(x.orden_lugar))) + 1 : null;
      const orden2 = nuevo && orden === 1 ? (lugares.indexOf(nuevo) + 1) * 1000 : orden;
      try {
        await ubicarProductos([{ id: p.id, lugar: nuevo, orden: orden2 }]);
        p.lugar = nuevo; p.orden_lugar = orden2;
        toast(nuevo ? `${p.nombre}: ${nuevo}` : `${p.nombre}: sin lugar`, 'ok');
        pintarChips(); pintar();
        if (opts.alCambiarLugar) opts.alCambiarLugar(p);
      } catch (e) { toast('No se pudo guardar el lugar: ' + mensajeError(e), 'error'); }
      guardando = false;
    };
    const pintarChips = () => chips.replaceChildren(...lugares.map(l => h('button', {
      class: 'chip' + (p.lugar === l ? ' is-on' : ''), type: 'button', text: l, 'aria-pressed': p.lugar === l ? 'true' : 'false', 'data-lugar': l,
      on: { click: () => ubicar(l) } })),
    ...(p.lugar ? [h('button', { class: 'chip chip-sin', type: 'button', text: 'Sacar lugar', on: { click: () => ubicar(null) } })] : []));
    pintarChips();
    otro.addEventListener('keydown', (e) => { if (e.key === 'Enter' && otro.value.trim()) { if (!lugares.includes(otro.value.trim())) lugares.push(otro.value.trim()); ubicar(otro.value); otro.value = ''; } });
    const okOtro = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Poner', on: { click: () => { if (!otro.value.trim()) return; if (!lugares.includes(otro.value.trim())) lugares.push(otro.value.trim()); ubicar(otro.value); otro.value = ''; } } });

    const movs = r.movs.slice(0, 25);
    const prov = (m) => opts.provDeOrden && m.ref_id && opts.provDeOrden.get(m.ref_id);
    let cerrar = () => {};
    ({ cerrar } = hoja(p.nombre, h('div', { class: 'form inv-det' },
      h('div', { class: 'inv-det-hay' + (s <= 0 ? ' is-cero' : '') },
        h('span', { class: 'inv-det-k', text: 'Quedan' }),
        h('b', { class: 'num', text: cant(p, s) }),
        esBulto(p) && s > 0 ? h('span', { class: 'inv-det-b', text: `${enBultos(p, s)} de ${n2(factorDe(p))} ${plural(u(p), factorDe(p))}` }) : null,
        h('span', { class: 'inv-det-n', text: r.conteo ? `Último conteo ${cuando(r.conteo.creado_en)}: ${cant(p, r.conteo.contado)}${r.conteo.encargado ? ' · ' + r.conteo.encargado : ''}` : 'Todavía no se contó' })),
      h('section', { class: 'field' }, h('span', { class: 'field-l', text: '¿Dónde está?' }), chips, h('div', { class: 'inv-otro' }, otro, okOtro)),
      opts.acciones ? opts.acciones(p, () => cerrar()) : null,
      h('section', { class: 'field' }, h('span', { class: 'field-l', text: `Movimientos (${DIAS_MOV} días)` }),
        movs.length ? h('ul', { class: 'inv-movs' }, movs.map(m => { const c = Number(m.cantidad); return h('li', { class: 'inv-mov' + (c > 0 ? ' is-mas' : c < 0 ? ' is-menos' : '') },
          h('span', { class: 'inv-mov-t' }, h('b', { text: tipoMov(m) + (prov(m) ? ' · ' + prov(m) : '') }), h('small', { text: [cuando(m.creado_en), (m.nota || '').replace(/^(Merma|Entrada): /, '')].filter(Boolean).join(' · ') })),
          h('b', { class: 'num inv-mov-c', text: (c > 0 ? '+' : c < 0 ? '−' : '') + n2(Math.abs(c)) })); }))
          : h('p', { class: 'sub', text: 'Sin movimientos.' }),
        r.movs.length > movs.length ? h('p', { class: 'sub', text: `y ${r.movs.length - movs.length} más` }) : null))));
  }

  return { el, pintar, visibles: () => vis, detalle };
}

// Planilla para imprimir y contar a mano, por lugar y en el orden del recorrido.
export function planillaConteo(titulo, subtitulo, prods, stockDe, conCantidad) {
  const g = porLugar(prods);
  return h('div', { class: 'print-area' }, h('section', { class: 'pr-prov' },
    h('header', { class: 'pr-head' },
      h('div', {}, h('div', { class: 'pr-marca', text: 'Docks del Puerto · Stock' }), h('h1', { class: 'pr-t', text: titulo })),
      h('div', { class: 'pr-datos' }, h('div', { text: subtitulo }), h('div', { text: `${prods.length} productos` }))),
    h('table', { class: 'pr-tabla pr-stock' },
      h('thead', {}, h('tr', {}, ...['Producto', conCantidad ? 'Figura' : null, 'Unidad', 'Contado'].filter(Boolean).map((t, i) => h('th', { class: t === 'Figura' ? 'pr-num' : (t === 'Contado' ? 'pr-ok' : null), text: t })))),
      h('tbody', {}, [...g].flatMap(([l, ps]) => [
        h('tr', {}, h('th', { class: 'pr-local', colspan: conCantidad ? '4' : '3', text: l })),
        ...ps.map(p => h('tr', {}, h('td', { text: p.nombre }), conCantidad ? h('td', { class: 'pr-num', text: fmtNum(stockDe(p), 2) || '0' }) : null,
          h('td', { text: p.unidad_uso || '' }), h('td', { class: 'pr-ok pr-blanco' })))])))));
}
