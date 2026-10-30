// Vista del encargado: Pedir, Revisar pedido y Mis pedidos.
import { mount, h, norm, tokens, coincide, fmtNum, groupBy, porTexto, porTandas, lsGet, lsSet, debounce, esCarta, avisoCierre, esFlorida, esMartin, fechaCorta, ESTADOS, esBulto, factorDe, textoStock } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarProveedoresBasico, cargarLocales, buscarServidor, misOrdenes, crearOrdenSolo, agregarItems, mensajeError } from './api.js';
import { icon, stepper, esqueleto, vacio, banner, toast, campo } from './ui.js';

const S = { lid: null, uid: null, local: null, prods: [], stock: new Map(), provs: new Map(), draft: {}, guardado: null, listo: false, offline: false };
const SIN_PROV = '__sin__';

// Cada encargado arma su propio pedido del local, que queda guardado en el celular hasta que lo envía (no hay pedido precargado).
const claveBorrador = () => 'pedido:' + S.lid + ':' + (S.uid || '');
function cargarBorrador() {
  const d = lsGet(claveBorrador());
  const vigente = d && d.t && Date.now() - d.t < 21 * 864e5;
  S.draft = vigente ? Object.fromEntries(Object.entries(d.q || {}).filter(([, v]) => v > 0)) : {};
  S.guardado = vigente && Object.keys(S.draft).length ? d.t : null;
}
function guardarBorrador() {
  for (const k of Object.keys(S.draft)) if (!(S.draft[k] > 0)) delete S.draft[k];
  S.guardado = Object.keys(S.draft).length ? Date.now() : null;
  lsSet(claveBorrador(), { t: Date.now(), q: S.draft });
}
const cantidad = (p) => S.draft[p.id] || 0;
const quedan = (p) => S.stock.get(p.id) || 0;
const pedidoActual = () => S.prods.filter(p => p.activo !== false && !esCarta(p) && cantidad(p) > 0);

async function cargar(ctx, alActualizar) {
  const lid = ctx.perfil.local_id, uid = ctx.perfil.id || null;
  if (S.lid !== lid || S.uid !== uid) { Object.assign(S, { lid, uid, prods: [], stock: new Map(), provs: new Map(), local: null, listo: false, jcat: null, jstk: null, jprv: null, jloc: null }); cargarBorrador(); }
  const pon = (clave, fn) => (d, _cache, err) => { const j = JSON.stringify(d); if (j === (S['j' + clave])) return; S['j' + clave] = j; fn(d); S.offline = !!err; alActualizar(); };
  const tareas = [
    swr('cat:' + lid, () => cargarCatalogo(lid), pon('cat', d => { S.prods = d; })),
    swr('stk:' + lid, () => cargarStock(lid), pon('stk', d => { S.stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); })),
    swr('provb', cargarProveedoresBasico, pon('prv', d => { S.provs = new Map(d.map(p => [p.id, p])); })),
    swr('locales', cargarLocales, pon('loc', d => { S.local = d.find(l => l.id === lid) || d[0] || null; }))
  ];
  const res = await Promise.allSettled(tareas);
  S.listo = true;
  const fallo = res.find(r => r.status === 'rejected');
  if (fallo && !S.prods.length) throw fallo.reason;
  if (fallo) S.offline = true;
  alActualizar();
}

// ---------- render principal ----------
export async function render(root, ctx, id) {
  if (id === 'mis-pedidos') return renderMis(root, ctx);
  let pinta;
  const act = rafOnce(() => pinta && pinta());
  if (S.lid !== ctx.perfil.local_id) { S.lid = null; }
  if (id === 'revisar') pinta = () => pintarRevisar(root, ctx);
  else pinta = () => pintarPedir(root, ctx);
  const p = cargar(ctx, () => { if (ctx.alive()) act(); });
  try { await p; } catch (e) { if (!S.prods.length) throw e; }
  if (ctx.alive()) pinta();
  return () => {};
}

function rafOnce(fn) { let q = false; return () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(); }); }; }

function cabecera(titulo, sub) {
  return h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: titulo }), sub ? h('p', { class: 'sub', text: sub }) : null);
}

// ---------- Pedir ----------
let filtro = { q: '', cat: 'todas' };
const MI_PEDIDO = '__mio__';
let extraIds = null; // ids que devolvió la búsqueda del servidor
let listaPrevia = null; // al repintar con datos frescos se mantiene lo que ya se veía

function pintarPedir(root, ctx) {
  const nombreLocal = S.local ? S.local.nombre : '';
  const aviso = avisoCierre();
  const activos = S.prods.filter(p => p.activo !== false && !esCarta(p));
  // Lo oculto (lo que casi no se pide, como el resto de la lista de un mayorista) solo aparece al buscar o si ya está en el pedido.
  const aLaVista = (p) => !p.oculto || cantidad(p) > 0;
  const nOcultos = activos.filter(p => p.oculto).length;
  const cats = [...new Set(activos.filter(aLaVista).map(p => p.categoria || 'Sin categoría'))].sort(porTexto);

  const lista = h('div', { class: 'lista', id: 'lista-prod' });
  const pill = h('button', { class: 'pill', type: 'button', hidden: true, on: { click: () => ctx.ir('revisar') } });

  const estado = h('div', { class: 'borrador', 'aria-live': 'polite' });
  const chipMio = h('button', { class: 'chip chip-mio', type: 'button' });
  const actualizarPill = () => {
    const n = pedidoActual().length;
    pill.hidden = n === 0;
    pill.replaceChildren(icon('pedir', 20), h('span', { text: `Revisar pedido · ${n} ${n === 1 ? 'ítem' : 'ítems'}` }));
    chipMio.textContent = n ? `En mi pedido · ${n}` : 'En mi pedido';
    estado.hidden = n === 0;
    if (n) {
      const hora = S.guardado ? new Date(S.guardado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
      estado.replaceChildren(icon('check', 16), h('span', { text: `Tu pedido de ${nombreLocal || 'este local'} está guardado${hora ? ' (' + hora + ')' : ''}. Seguí cuando quieras.` }),
        h('button', { class: 'btn btn-text', type: 'button', text: 'Vaciar', on: { click: vaciar } }));
    }
  };
  function vaciar() {
    if (!confirm('¿Vaciar el pedido? Se borran todas las cantidades que cargaste.')) return;
    S.draft = {}; guardarBorrador();
    if (filtro.cat === MI_PEDIDO) filtro.cat = 'todas';
    pintarPedir(root, ctx);
  }

  const fila = (p) => {
    const q = cantidad(p);
    const st = stepper({ value: q, label: `Pedir ${p.nombre}`, onChange: (v) => {
      S.draft[p.id] = v; guardarBorrador(); actualizarPill();
      row.classList.toggle('is-on', v > 0);
    } });
    const row = h('article', { class: 'prod' + (q > 0 ? ' is-on' : ''), 'data-id': p.id },
      h('h3', { class: 'prod-n', text: p.nombre }),
      h('p', { class: 'prod-m' }, p.unidad_compra ? h('span', { class: 'prod-u', text: esBulto(p) ? `${p.unidad_compra} de ${fmtNum(factorDe(p), 3)} ${p.unidad_uso}` : p.unidad_compra }) : null,
        h('span', { class: 'quedan' }, 'Quedan ', h('b', { class: 'num', text: esBulto(p) ? textoStock(p, quedan(p)) : fmtNum(quedan(p), 2) || '0' }))),
      h('div', { class: 'prod-p' }, h('span', { class: 'prod-pl', text: 'Pedir' }), st.el));
    return row;
  };

  const pintarLista = (inicial = 0) => {
    const q = norm(filtro.q);
    let vis = activos;
    // Con una categoría elegida (ej.: Verdulería) la búsqueda queda dentro de esa categoría: "tomate" no trae "puré de tomate".
    // Con "Todas" o "En mi pedido" se busca en todo el catálogo del local.
    const enCat = filtro.cat !== 'todas' && filtro.cat !== MI_PEDIDO;
    if (!q) vis = vis.filter(aLaVista);
    if (filtro.cat === MI_PEDIDO && !q) vis = vis.filter(p => cantidad(p) > 0);
    else if (enCat) vis = vis.filter(p => (p.categoria || 'Sin categoría') === filtro.cat);
    if (q) {
      const toks = tokens(q);
      const local = vis.filter(p => coincide(p.nombre + ' ' + p.codigo, toks));
      const ids = new Set(local.map(p => p.id));
      const extra = extraIds ? vis.filter(p => extraIds.has(p.id) && !ids.has(p.id)) : [];
      vis = [...local, ...extra];
    }
    if (!S.listo && !activos.length) { lista.replaceChildren(esqueleto(6)); return; }
    cuenta.textContent = q ? (vis.length ? `${vis.length} ${vis.length === 1 ? 'producto' : 'productos'}${enCat ? ' en ' + filtro.cat : ''}` : '') : '';
    if (!vis.length) {
      if (filtro.cat === MI_PEDIDO && !q) { lista.replaceChildren(vacio('Tu pedido está vacío', 'Buscá un producto o elegí una categoría y sumá con +.')); return; }
      if (q && enCat) {
        lista.replaceChildren(vacio(`No hay "${filtro.q.trim()}" en ${filtro.cat}`, 'Probá con otra palabra o buscalo en todas las categorías.'),
          h('p', { class: 'mas-buscar' }, h('button', { class: 'btn btn-text', type: 'button', text: 'Buscar en todas las categorías', on: { click: () => elegir('todas') } })));
        return;
      }
      lista.replaceChildren(vacio(q ? 'No encontramos ese producto' : 'Sin productos', q ? 'Probá con otra palabra.' : 'Todavía no hay productos cargados para este local.')); return;
    }
    if (q || filtro.cat === MI_PEDIDO) {
      // Primero lo que empieza con lo buscado ("Tomate", "Tomate cherry") y después el resto ("Puré de tomate").
      const empieza = (p) => (q && norm(p.nombre).startsWith(tokens(q)[0]) ? 0 : 1);
      porTandas(lista, vis.sort((a, b) => empieza(a) - empieza(b) || porTexto(a.nombre, b.nombre)).map(p => () => fila(p)), 60, inicial); return;
    }
    const g = groupBy(vis, p => p.categoria || 'Sin categoría');
    const frag = [];
    for (const k of [...g.keys()].sort(porTexto)) {
      frag.push(() => h('h2', { class: 'cat-t', text: k }), ...g.get(k).map(p => () => fila(p)));
    }
    if (nOcultos) frag.push(() => h('p', { class: 'mas-buscar' }, icon('buscar', 16), h('span', { text: `Hay ${nOcultos} productos más que se piden poco. Buscalos por nombre arriba.` })));
    porTandas(lista, frag, 60, inicial);
  };

  const buscarRemoto = debounce(async (q) => {
    if (norm(q).length < 3) { extraIds = null; return; }
    try {
      const r = await buscarServidor(q, ctx.perfil.local_id);
      if (norm(filtro.q) !== norm(q)) return;
      extraIds = new Set(r.map(x => x.id)); pintarLista(lista._n);
    } catch (_e) { /* la búsqueda local alcanza */ }
  }, 300);

  const ph = (c) => c !== 'todas' && c !== MI_PEDIDO ? `Buscar en ${c}` : 'Buscar producto (ej.: queso, coca, servilleta)';
  const cuenta = h('span', { class: 'busca-n', 'aria-live': 'polite' });
  const limpiar = h('button', { class: 'busca-x', type: 'button', 'aria-label': 'Borrar búsqueda', hidden: !filtro.q, on: { click: () => { buscador.value = ''; alBuscar(''); buscador.focus(); } } }, icon('cerrar', 18));
  const alBuscar = (v) => { filtro.q = v; limpiar.hidden = !v; extraIds = null; pintarLista(); buscarRemoto(v); };
  const buscador = h('input', { class: 'input input-search', type: 'search', id: 'buscar', placeholder: ph(filtro.cat), autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Buscar producto', value: filtro.q,
    on: { input: (e) => alBuscar(e.target.value) } });
  const caja = h('div', { class: 'busca' }, icon('buscar', 20), buscador, limpiar, cuenta);

  const marcar = (c) => chips.querySelectorAll('.chip').forEach(b => { const on = b.dataset.cat === c; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  // Al cambiar de categoría se mantiene lo que se está buscando, ahora dentro de la categoría nueva.
  const elegir = (c) => { filtro.cat = c; buscador.placeholder = ph(c); marcar(c); pintarLista(); };
  chipMio.dataset.cat = MI_PEDIDO; chipMio.addEventListener('click', () => elegir(MI_PEDIDO));
  const chips = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Categorías' }, chipMio,
    ['todas', ...cats].map(c => h('button', { class: 'chip', type: 'button', 'data-cat': c, text: c === 'todas' ? 'Todas' : c, on: { click: () => elegir(c) } })));
  marcar(filtro.cat);

  const previo = listaPrevia && listaPrevia.isConnected ? listaPrevia._n : 0;
  listaPrevia = lista;
  mount(root,
    cabecera('Pedir', nombreLocal),
    S.offline ? banner('Sin conexión: mostrando lo último que guardamos.', 'warn') : null,
    aviso.tipo === 'ok' ? h('p', { class: 'aviso-ok', text: aviso.texto }) : banner(aviso.texto, aviso.tipo === 'warn' ? 'warn' : 'info'),
    h('div', { class: 'toolbar toolbar-fija' }, caja, chips),
    estado, lista, pill);
  pintarLista(previo); actualizarPill();
}

// ---------- Revisar ----------
function gruposDePedido() {
  const g = groupBy(pedidoActual(), p => p.proveedor_id || SIN_PROV);
  const out = [];
  for (const [k, items] of g) {
    const prov = k === SIN_PROV ? null : S.provs.get(k);
    out.push({ key: k, prov, nombre: k === SIN_PROV ? 'Sin proveedor' : (prov ? prov.nombre : 'Proveedor'), items: items.sort((a, b) => porTexto(a.nombre, b.nombre)) });
  }
  return out.sort((a, b) => (a.key === SIN_PROV) - (b.key === SIN_PROV) || porTexto(a.nombre, b.nombre));
}

let enviado = { ordenes: {}, hechos: new Set() };
function pintarRevisar(root, ctx) {
  const grupos = gruposDePedido();
  const aviso = avisoCierre();
  let nombre = lsGet('nombre') || ctx.perfil.nombre || '';
  let nota = '';
  const rPedir = '#/' + (ctx.rutaPedir || 'pedir');
  const volver = h('a', { class: 'volver', href: rPedir, text: '‹ Seguir pidiendo' });
  if (!grupos.length) {
    mount(root, volver, cabecera('Revisar pedido'), vacio('No hay nada para pedir', 'Volvé y sumá productos.'), h('a', { class: 'btn btn-primary', href: rPedir, text: 'Ir a pedir' }));
    return;
  }
  const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', text: 'Enviar pedido' });

  const cardGrupo = (g) => {
    const notas = [];
    if (g.key === SIN_PROV) notas.push(['warn', 'Estos productos no tienen proveedor: gerencia lo asigna antes de pedirlos.']);
    else {
      if (g.prov && g.prov.dias_entrega) notas.push(['info', 'Entrega: ' + g.prov.dias_entrega]);
      if (g.prov && g.prov.corte) notas.push(['info', 'Corte: ' + g.prov.corte]);
      if (g.prov && (g.prov.tiene_minimo || esMartin(g.nombre))) notas.push(['warn', 'Tiene pedido mínimo, gerencia lo revisa.']);
      if (esMartin(g.nombre)) notas.push(['info', 'Corte: 12 h del día hábil anterior a la entrega.']);
      if (aviso.soloFlorida && !esFlorida(g.nombre)) notas.push(['warn', 'Fuera de fecha: hoy solo se pide a Distribuidora Florida. Gerencia decide.']);
    }
    return h('section', { class: 'grupo-prov' + (g.key === SIN_PROV ? ' sin-prov' : '') , 'data-prov': g.nombre },
      h('header', { class: 'gp-head' }, h('h2', { class: 'gp-t', text: g.nombre }), h('span', { class: 'gp-c', text: `${g.items.length} ${g.items.length === 1 ? 'ítem' : 'ítems'}` })),
      notas.length ? h('ul', { class: 'gp-notas' }, notas.map(([t, x]) => h('li', { class: 'gp-nota gp-' + t, text: x }))) : null,
      g.items.map(p => {
        const st = stepper({ value: cantidad(p), label: `Pedir ${p.nombre}`, onChange: (v) => { S.draft[p.id] = v; guardarBorrador(); if (v === 0) pintarRevisar(root, ctx); } });
        return h('article', { class: 'prod is-on prod-rev' },
          h('h3', { class: 'prod-n', text: p.nombre }),
          h('p', { class: 'prod-m' }, p.unidad_compra ? h('span', { class: 'prod-u', text: p.unidad_compra }) : null),
          h('div', { class: 'prod-p' }, h('span', { class: 'prod-pl', text: 'Pedir' }), st.el));
      }));
  };

  const inpNombre = h('input', { class: 'input', type: 'text', id: 'rev-nombre', autocomplete: 'name', value: nombre, 'aria-label': 'Tu nombre', placeholder: 'Tu nombre', on: { input: (e) => { nombre = e.target.value; } } });
  const inpNota = h('textarea', { class: 'input', id: 'rev-nota', rows: 2, placeholder: 'Ej.: entregar antes de las 10', 'aria-label': 'Nota para gerencia', on: { input: (e) => { nota = e.target.value; } } });

  btn.addEventListener('click', async () => {
    err.replaceChildren();
    if (!nombre.trim()) return err.replaceChildren(banner('Poné tu nombre para enviar.', 'error'));
    const enviables = grupos;
    btn.disabled = true; btn.textContent = 'Enviando…';
    lsSet('nombre', nombre.trim());
    let fallos = 0, ok = 0;
    for (const g of enviables) {
      if (enviado.hechos.has(g.key)) continue;
      try {
        let oid = enviado.ordenes[g.key];
        if (!oid) {
          oid = await crearOrdenSolo({ local_id: S.lid, proveedor_id: g.key === SIN_PROV ? null : g.key, estado: 'borrador', cargado_por_nombre: nombre.trim(), nota: nota.trim() || null });
          enviado.ordenes[g.key] = oid;
        }
        await agregarItems(oid, g.items.map(p => ({ producto_id: p.id, cantidad: cantidad(p) })));
        g.items.forEach(p => { S.draft[p.id] = 0; });
        enviado.hechos.add(g.key); ok++;
      } catch (e) { fallos++; err.append(banner(`${g.nombre}: ${mensajeError(e)}`, 'error')); }
    }
    guardarBorrador();
    if (!fallos) {
      enviado = { ordenes: {}, hechos: new Set() };
      toast(ctx.gerencia ? `Pedido de ${S.local ? S.local.nombre : 'el local'} cargado: quedó en Pedidos para revisar.` : 'Pedido enviado. Gerencia lo revisa.', 'ok');
      ctx.ir('mis-pedidos');
    } else {
      btn.disabled = false; btn.textContent = ok ? 'Reintentar lo que falta' : 'Enviar pedido';
    }
  });

  mount(root, 
    volver, cabecera('Revisar pedido', S.local ? S.local.nombre : ''),
    aviso.tipo === 'warn' ? banner(aviso.texto, 'warn') : null,
    ...grupos.map(cardGrupo),
    h('div', { class: 'form form-rev' }, campo('Tu nombre', inpNombre), campo('Nota para gerencia (opcional)', inpNota)),
    err, btn);
}

// ---------- Mis pedidos ----------
async function renderMis(root, ctx) {
  const lid = ctx.perfil.local_id;
  mount(root, cabecera('Mis pedidos'), esqueleto(4));
  let provs = new Map(), prods = new Map();
  const pintar = (ordenes, err) => {
    if (!ctx.alive()) return;
    const cab = cabecera('Mis pedidos', S.local ? S.local.nombre : '');
    if (!ordenes.length) { mount(root, cab, err ? banner(err, 'warn') : null, vacio('Todavía no enviaste pedidos', 'Cuando envíes uno, lo ves acá.'), h('a', { class: 'btn btn-primary', href: '#/pedir', text: 'Hacer un pedido' })); return; }
    mount(root, cab, err ? banner(err, 'warn') : null, h('div', { class: 'ped-lista' }, ordenes.map(o => {
      const items = (o.orden_items || []).filter(i => Number(i.cantidad_pedida) > 0); // sin lo que gerencia agregó al recibir
      const det = h('ul', { class: 'ped-items', hidden: true }, items.map(i => { const p = prods.get(i.producto_id); return h('li', {}, h('span', { text: p ? p.nombre : 'Producto' }), h('b', { class: 'num', text: fmtNum(i.cantidad_pedida, 3) + (p && p.unidad_compra ? ' ' + p.unidad_compra : '') })); }));
      const prov = provs.get(o.proveedor_id);
      return h('article', { class: 'ped' },
        h('button', { class: 'ped-b', type: 'button', 'aria-expanded': 'false', on: { click: (e) => { const b = e.currentTarget; det.hidden = !det.hidden; b.setAttribute('aria-expanded', String(!det.hidden)); } } },
          h('span', { class: 'ped-prov', text: prov ? prov.nombre : (o.proveedor_id ? 'Proveedor' : 'Sin proveedor') }),
          h('span', { class: 'estado estado-' + o.estado, text: ESTADOS[o.estado] || o.estado }),
          h('span', { class: 'ped-meta', text: `${fechaCorta(o.creado_en)} · ${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}${o.cargado_por_nombre ? ' · ' + o.cargado_por_nombre : ''}` })),
        det, o.nota ? h('p', { class: 'ped-nota', text: 'Nota: ' + o.nota }) : null);
    })));
  };
  try {
    await Promise.allSettled([
      swr('provb', cargarProveedoresBasico, (d) => { provs = new Map(d.map(p => [p.id, p])); }),
      swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = new Map(d.map(p => [p.id, p])); }),
      swr('locales', cargarLocales, (d) => { S.local = d.find(l => l.id === lid) || d[0] || null; })
    ]);
    await swr('ord:' + lid, () => misOrdenes(lid), (d, esCache, e) => pintar(d, e ? 'Sin conexión: mostrando lo último que guardamos.' : null));
  } catch (e) { if (ctx.alive()) mount(root, cabecera('Mis pedidos'), banner(mensajeError(e), 'error')); }
}
