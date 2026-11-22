// Vista del encargado: Pedir (con el pedido sugerido cargado), Revisar pedido y, abajo de Pedir, Mis pedidos.
// El sugerido sale de reposicion.js (lo mismo que el resultado del cierre): uso por día abierto × días que abre la semana
// − lo que quedó en el último cierre − lo pedido sin recibir, al bulto. Cada fila sugerida lleva "urgente" (no alcanza para
// la próxima apertura) o "semana". Sin historial: el campo vacío y "Sin historial todavía", nunca un número inventado.
import { mount, h, norm, fmtNum, groupBy, porTexto, porTandas, lsGet, lsSet, debounce, esCarta, avisoCierre, esFlorida, esMartin, fechaCorta, ESTADOS, esBulto, factorDe, textoStock, plural, jornadaISO, sumarDias } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarProveedoresBasico, cargarLocales, buscarServidor, misOrdenes, crearOrdenSolo, agregarItems, mensajeError, datosReposicion } from './api.js';
import { icon, stepper, esqueleto, vacio, banner, toast, campo, tituloGrande, botonFijo } from './ui.js';
import { entregaDe } from './sugerido.js';
import { planLocal } from './reposicion.js';
import { buscar, frecuencia, masUsados, anotarUso, textoUso } from './busqueda.js';

const S = { lid: null, uid: null, local: null, prods: [], stock: new Map(), provs: new Map(), draft: {}, guardado: null, listo: false, offline: false,
  cons: new Map(), pend: new Map(), sug: new Map(), mis: null, misErr: null, rep: null, quedan: new Map(), plan: null };
const SIN_PROV = '__sin__';

// Cada encargado arma su propio pedido del local, que queda guardado en el celular hasta que lo envía. Arranca con el sugerido:
// en el borrador queda solo lo que el encargado tocó (también un 0, que quiere decir "esto no"). Los 0 valen para la semana
// de pedido en curso (de jueves a miércoles); las cantidades cargadas, 21 días como antes.
const claveBorrador = () => 'pedido:' + S.lid + ':' + (S.uid || '');
const semanaPedido = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 3) % 7)); return x.getTime(); };
function cargarBorrador() {
  const d = lsGet(claveBorrador());
  const vigente = d && d.t && Date.now() - d.t < 21 * 864e5;
  const mismaSemana = vigente && d.sem === semanaPedido();
  S.draft = vigente ? Object.fromEntries(Object.entries(d.q || {}).filter(([, v]) => v > 0 || (v === 0 && mismaSemana))) : {};
  S.guardado = vigente && Object.keys(S.draft).length ? d.t : null;
}
function guardarBorrador() {
  for (const k of Object.keys(S.draft)) if (!(S.draft[k] >= 0)) delete S.draft[k];
  S.guardado = Object.keys(S.draft).length ? Date.now() : null;
  lsSet(claveBorrador(), { t: Date.now(), sem: semanaPedido(), q: S.draft });
}
const tocado = (p) => Object.prototype.hasOwnProperty.call(S.draft, p.id);
const cantidad = (p) => (tocado(p) ? S.draft[p.id] : (S.sug.get(p.id) || 0));
const sinHistorial = (p) => S.sug.has(p.id) && S.sug.get(p.id) === null;
// Lo que queda: lo contado en el último cierre (de los últimos 7 días) + lo que llegó después; sin cierre, el stock del sistema.
// El cierre recién guardado en este equipo (hoja.js) manda: así Pedir arma las mismas cantidades que mostró el resultado.
function quedanDe() {
  const hoy = jornadaISO();
  const m = new Map(S.stock);
  const desde = sumarDias(hoy, -7);
  let fecha = null, q = null, recep = new Map();
  if (S.rep && S.rep.ultimo && S.rep.ultimo >= desde) {
    fecha = S.rep.ultimo; q = new Map();
    for (const [id, xs] of S.rep.cierres || []) { const x = xs.find(([f]) => f === fecha); if (x) q.set(id, x[1]); }
    recep = new Map(S.rep.recep || []);
  }
  const loc = lsGet('cierre:' + S.lid);
  if (loc && loc.fecha && loc.fecha >= desde && (!fecha || loc.fecha >= fecha) && loc.q) {
    if (loc.fecha !== fecha) recep = new Map();
    fecha = loc.fecha; q = new Map(Object.entries(loc.q).map(([k, v]) => [k, Number(v) || 0]));
  }
  if (q) for (const [id, v] of q) m.set(id, Math.round((v + (recep.get(id) || 0)) * 1000) / 1000);
  S.cierreFecha = fecha;
  return m;
}
const recalcular = () => {
  S.quedan = quedanDe();
  S.plan = planLocal({ prods: S.prods, quedan: S.quedan, cons: S.cons, pend: S.pend, local: S.local, hoy: jornadaISO(), cierre: S.cierreFecha || null });
  S.sug = new Map([...S.plan.items].map(([id, e]) => [id, e.pedir]));
};
const quedan = (p) => S.quedan.get(p.id) || 0;
const marca = (p) => { const e = S.plan && S.plan.items.get(p.id); return e && e.pedir > 0 ? (e.c === 'rojo' ? 'rojo' : e.c === 'amar' ? 'amar' : null) : null; };

// Comprar (gerencia) y el resultado del cierre dejan el pedido armado: q = { producto_id: cantidad } (0 = "esto no").
export function precargarPedido(lid, uid, q) {
  const k = 'pedido:' + lid + ':' + (uid || '');
  const prev = lsGet(k);
  const base = prev && prev.t && Date.now() - prev.t < 21 * 864e5 ? (prev.q || {}) : {};
  const nuevo = { ...base, ...q };
  lsSet(k, { t: Date.now(), sem: semanaPedido(), q: nuevo });
  if (S.lid === lid && S.uid === (uid || null)) { S.draft = { ...nuevo }; S.guardado = Date.now(); }
}
const pedidoActual = () => S.prods.filter(p => p.activo !== false && !esCarta(p) && cantidad(p) > 0);

async function cargar(ctx, alActualizar) {
  const lid = ctx.perfil.local_id, uid = ctx.perfil.id || null;
  if (S.lid !== lid || S.uid !== uid) {
    Object.assign(S, { lid, uid, prods: [], stock: new Map(), provs: new Map(), local: null, listo: false, cons: new Map(), pend: new Map(), sug: new Map(), mis: null, misErr: null,
      rep: null, quedan: new Map(), plan: null, jcat: null, jstk: null, jprv: null, jloc: null, jsug: null, jmis: null });
    cargarBorrador();
  }
  const pon = (clave, fn) => (d, _cache, err) => { const j = JSON.stringify(d); if (j === (S['j' + clave])) return; S['j' + clave] = j; fn(d); S.offline = !!err; recalcular(); alActualizar(); };
  const tareas = [
    swr('cat:' + lid, () => cargarCatalogo(lid), pon('cat', d => { S.prods = d; })),
    swr('stk:' + lid, () => cargarStock(lid), pon('stk', d => { S.stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); })),
    swr('provb', cargarProveedoresBasico, pon('prv', d => { S.provs = new Map(d.map(p => [p.id, p])); })),
    swr('locales', cargarLocales, pon('loc', d => { S.local = d.find(l => l.id === lid) || d[0] || null; }))
  ];
  // El sugerido y Mis pedidos no frenan la pantalla: si fallan, Pedir anda igual (sin sugerido: "Sin historial todavía").
  const hoy = jornadaISO();
  swr('rep:' + lid, () => datosReposicion(lid, hoy), pon('sug', d => { if (d && d.hoy === hoy) { S.rep = d; S.cons = new Map(d.cons); S.pend = new Map(d.pend); } })).catch(() => {});
  // Los pedidos enviados alimentan también "Lo de siempre" y el orden del buscador (gerencia los usa sin la sección).
  swr('ord:' + lid, () => misOrdenes(lid), (d, _c, e) => {
    S.misErr = e ? 'Sin conexión: mostrando lo último que guardamos.' : null;
    const j = JSON.stringify(d); if (j === S.jmis) return; S.jmis = j; S.mis = d; alActualizar();
  })
    .catch((e) => { if (!S.mis) { S.mis = []; S.misErr = mensajeError(e); alActualizar(); } });
  const res = await Promise.allSettled(tareas);
  S.listo = true;
  const fallo = res.find(r => r.status === 'rejected');
  if (fallo && !S.prods.length) throw fallo.reason;
  if (fallo) S.offline = true;
  alActualizar();
}

// ---------- render principal ----------
export async function render(root, ctx, id) {
  let pinta;
  const act = rafOnce(() => pinta && pinta());
  if (S.lid !== ctx.perfil.local_id) { S.lid = null; }
  // #/mis-pedidos (ruta vieja y destino después de enviar) abre Pedir con Mis pedidos a la vista.
  const opc = { aMis: id === 'mis-pedidos' && !ctx.gerencia };
  // Desde "Armar el pedido con esto" (cierre) o "Armar orden" (Comprar): se abre con el pedido a la vista.
  let desde = null;
  try { desde = sessionStorage.getItem('stock:pedir-desde-cierre'); sessionStorage.removeItem('stock:pedir-desde-cierre'); } catch (_e) { /* nada */ }
  if (desde && id !== 'revisar') { filtro.cat = MI_PEDIDO; filtro.q = ''; opc.armado = true; }
  if (id === 'revisar') pinta = () => pintarRevisar(root, ctx);
  else if (opc.aMis) pinta = () => pintarMis(root);
  else pinta = () => pintarPedir(root, ctx, opc);
  const p = cargar(ctx, () => { if (ctx.alive()) act(); });
  try { await p; } catch (e) { if (!S.prods.length) throw e; }
  recalcular(); // el cierre recién guardado (o lo que dejó Comprar) puede haber cambiado sin datos nuevos del servidor
  if (ctx.alive()) pinta();
  return () => {};
}

function rafOnce(fn) { let q = false; return () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(); }); }; }

function cabecera(titulo, sub) {
  return tituloGrande(titulo, sub);
}

// ---------- Pedir ----------
let filtro = { q: '', cat: 'todas' };
const MI_PEDIDO = '__mio__';
const FRECUENTES = '__frec__';
let extraIds = null; // ids que devolvió la búsqueda del servidor
let listaPrevia = null; // al repintar con datos frescos se mantiene lo que ya se veía

function pintarPedir(root, ctx, opc = {}) {
  const nombreLocal = S.local ? S.local.nombre : '';
  const aviso = avisoCierre();
  const activos = S.prods.filter(p => p.activo !== false && !esCarta(p));
  // Lo oculto (lo que casi no se pide, como el resto de la lista de un mayorista) solo aparece al buscar o si ya está en el pedido.
  const aLaVista = (p) => !p.oculto || cantidad(p) > 0;
  const nOcultos = activos.filter(p => p.oculto).length;
  const cats = [...new Set(activos.filter(aLaVista).map(p => p.categoria || 'Sin categoría'))].sort(porTexto);

  const frec = frecuencia(S.lid, S.mis || []);
  const top = masUsados(activos, frec, 24);
  const lista = h('div', { class: 'lista', id: 'lista-prod' });
  const pill = botonFijo('', () => ctx.ir('revisar'), { clase: 'pill', hidden: true });
  const conSug = [...S.sug.values()].some(v => v > 0);

  const estado = h('div', { class: 'borrador', 'aria-live': 'polite' });
  const chipMio = h('button', { class: 'chip chip-mio', type: 'button' });
  const actualizarPill = () => {
    const n = pedidoActual().length;
    pill.hidden = n === 0;
    pill.replaceChildren(icon('pedir', 20), h('span', { text: `Confirmar pedido · ${n} ${n === 1 ? 'ítem' : 'ítems'}` }));
    chipMio.textContent = n ? `En mi pedido · ${n}` : 'En mi pedido';
    // El aviso de "guardado" aparece cuando el encargado tocó algo (lo sugerido no hace falta guardarlo).
    const tocados = Object.keys(S.draft).length;
    estado.hidden = !tocados || (n === 0 && !conSug);
    if (!estado.hidden) {
      const hora = S.guardado ? new Date(S.guardado).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
      estado.replaceChildren(icon('check', 16), h('span', { text: n ? `Tu pedido de ${nombreLocal || 'este local'} está guardado${hora ? ' (' + hora + ')' : ''}. Seguí cuando quieras.` : 'Pedido vacío.' }),
        conSug ? h('button', { class: 'btn btn-text', type: 'button', text: 'Volver al sugerido', on: { click: alSugerido } }) : null,
        n ? h('button', { class: 'btn btn-text', type: 'button', text: 'Vaciar', on: { click: vaciar } }) : null);
    }
  };
  function vaciar() {
    if (!confirm('¿Vaciar el pedido? Se borran todas las cantidades, también las sugeridas.')) return;
    S.draft = {};
    for (const [id, v] of S.sug) if (v > 0) S.draft[id] = 0;
    guardarBorrador();
    if (filtro.cat === MI_PEDIDO) filtro.cat = 'todas';
    pintarPedir(root, ctx);
  }
  function alSugerido() {
    if (!confirm('¿Volver al pedido sugerido? Se borran los cambios que hiciste.')) return;
    S.draft = {}; guardarBorrador();
    pintarPedir(root, ctx);
  }

  let aprox = null; // ids encontrados con algún error de tipeo
  const fila = (p) => {
    const q = cantidad(p);
    // Sin historial suficiente: campo vacío y el aviso; nunca un número inventado.
    const vacioSinHist = sinHistorial(p) && !tocado(p);
    const st = stepper({ value: q, label: `Pedir ${p.nombre}`, onChange: (v) => {
      S.draft[p.id] = v; guardarBorrador(); actualizarPill();
      if (v > 0) anotarUso(S.lid, p.id);
      row.classList.toggle('is-on', v > 0);
    } });
    if (vacioSinHist) st.el.querySelector('input').value = '';
    const row = h('article', { class: 'prod prod-fila' + (q > 0 ? ' is-on' : ''), 'data-id': p.id, 'data-sug': S.sug.has(p.id) ? String(S.sug.get(p.id)) : null },
      h('h3', { class: 'prod-n', text: p.nombre }),
      h('p', { class: 'prod-m' }, p.unidad_compra ? h('span', { class: 'prod-u', text: esBulto(p) ? `${p.unidad_compra} de ${fmtNum(factorDe(p), 3)} ${plural(p.unidad_uso, factorDe(p))}` : p.unidad_compra }) : null,
        h('span', { class: 'quedan' }, 'Quedan ', h('b', { class: 'num', text: esBulto(p) ? textoStock(p, quedan(p)) : fmtNum(quedan(p), 2) || '0' })),
        marca(p) ? h('span', { class: 'cd-pill p-' + marca(p), text: marca(p) === 'rojo' ? 'urgente' : 'semana' }) : null,
        sinHistorial(p) ? h('span', { class: 'sin-hist', text: 'Sin historial todavía' }) : null,
        frec.get(p.id) && frec.get(p.id).veces ? h('span', { class: 'prod-uso', text: textoUso(frec.get(p.id), p.unidad_compra ? plural(p.unidad_compra, frec.get(p.id).ultCant || 1) : '') }) : null,
        aprox && aprox.has(p.id) ? h('span', { class: 'tag-aprox', text: 'Parecido' }) : null),
      h('div', { class: 'prod-p' }, h('span', { class: 'prod-pl', text: 'Pedir' }), st.el));
    return row;
  };

  const pintarLista = (inicial = 0) => {
    const q = norm(filtro.q);
    let vis = activos;
    // Con una categoría elegida (ej.: Verdulería) la búsqueda queda dentro de esa categoría: "tomate" no trae "puré de tomate".
    // Con "Todas" o "En mi pedido" se busca en todo el catálogo del local.
    const enCat = filtro.cat !== 'todas' && filtro.cat !== MI_PEDIDO && filtro.cat !== FRECUENTES;
    if (!q) vis = vis.filter(aLaVista);
    if (filtro.cat === MI_PEDIDO && !q) vis = vis.filter(p => cantidad(p) > 0);
    else if (filtro.cat === FRECUENTES && !q) vis = top;
    else if (enCat) vis = vis.filter(p => (p.categoria || 'Sin categoría') === filtro.cat);
    aprox = null;
    if (q) {
      // Tolerante a errores ("chorzio", "muzarela", "cocacola") y con lo que más usa el local primero.
      const res = buscar(vis, filtro.q, { frec });
      aprox = new Set(res.filter(r => r.aprox).map(r => r.p.id));
      const local = res.map(r => r.p);
      const ids = new Set(local.map(p => p.id));
      const extra = extraIds ? vis.filter(p => extraIds.has(p.id) && !ids.has(p.id)) : [];
      vis = [...local, ...extra];
    }
    if (!S.listo && !activos.length) { lista.replaceChildren(esqueleto(6)); return; }
    cuenta.textContent = q ? (vis.length ? `${vis.length} ${vis.length === 1 ? 'producto' : 'productos'}${enCat ? ' en ' + filtro.cat : ''}` : '') : '';
    if (!vis.length) {
      if (filtro.cat === MI_PEDIDO && !q) { lista.replaceChildren(vacio('Tu pedido está vacío', 'Buscá un producto o elegí una categoría y sumá con +.')); return; }
      if (filtro.cat === FRECUENTES && !q) { lista.replaceChildren(vacio('Todavía no hay historial', 'Cuando el local envíe pedidos, acá aparece lo que más se pide.')); return; }
      if (q && enCat) {
        lista.replaceChildren(vacio(`No hay "${filtro.q.trim()}" en ${filtro.cat}`, 'Probá con otra palabra o buscalo en todas las categorías.'),
          h('p', { class: 'mas-buscar' }, h('button', { class: 'btn btn-text', type: 'button', text: 'Buscar en todas las categorías', on: { click: () => elegir('todas') } })));
        return;
      }
      lista.replaceChildren(vacio(q ? 'No encontramos ese producto' : 'Sin productos', q ? 'Probá con otra palabra.' : 'Todavía no hay productos cargados para este local.')); return;
    }
    if (q || filtro.cat === FRECUENTES) {
      // Ya viene ordenado: lo que mejor y entre parecidos lo que más pide el local.
      const soloAprox = q && vis.length && vis.every(p => aprox.has(p.id));
      const cab = soloAprox ? [() => h('p', { class: 'quisiste', text: `No hay "${filtro.q.trim()}" exacto. ¿Quisiste decir…?` })]
        : filtro.cat === FRECUENTES && !q ? [() => h('p', { class: 'quisiste', text: `Lo que más pide ${nombreLocal || 'el local'}, de más a menos.` })] : [];
      porTandas(lista, [...cab, ...vis.map(p => () => fila(p))], 60, inicial); return;
    }
    if (filtro.cat === MI_PEDIDO) {
      porTandas(lista, vis.sort((a, b) => porTexto(a.nombre, b.nombre)).map(p => () => fila(p)), 60, inicial); return;
    }
    // Agrupado por proveedor (como se manda el pedido), con el corte de cada uno a la derecha. Sin proveedor, al final.
    const g = groupBy(vis, p => (p.proveedor_id && S.provs.has(p.proveedor_id)) ? p.proveedor_id : SIN_PROV);
    const nombreDe = (k) => (k === SIN_PROV ? 'Sin proveedor' : S.provs.get(k).nombre);
    const frag = [];
    for (const k of [...g.keys()].sort((a, b) => (a === SIN_PROV) - (b === SIN_PROV) || porTexto(nombreDe(a), nombreDe(b)))) {
      const corte = k === SIN_PROV ? '' : entregaDe(nombreDe(k)).corte;
      frag.push(() => h('h2', { class: 'cat-t pv-t', 'data-prov': nombreDe(k) }, h('span', { class: 'pv-n', text: nombreDe(k) }), corte ? h('span', { class: 'pv-c', text: corte }) : null),
        ...g.get(k).sort((a, b) => porTexto(a.nombre, b.nombre)).map(p => () => fila(p)));
    }
    if (nOcultos) frag.push(() => h('p', { class: 'mas-buscar' }, icon('buscar', 16), h('span', { text: `Hay ${nOcultos} productos más que se piden poco. Buscalos por nombre arriba.` })));
    porTandas(lista, frag, 60, opc.aMis ? frag.length : inicial);
  };

  const buscarRemoto = debounce(async (q) => {
    if (norm(q).length < 3) { extraIds = null; return; }
    try {
      const r = await buscarServidor(q, ctx.perfil.local_id);
      if (norm(filtro.q) !== norm(q)) return;
      extraIds = new Set(r.map(x => x.id)); pintarLista(lista._n);
    } catch (_e) { /* la búsqueda local alcanza */ }
  }, 300);

  const ph = (c) => c !== 'todas' && c !== MI_PEDIDO && c !== FRECUENTES ? `Buscar en ${c}` : 'Buscar producto (ej.: queso, coca, servilleta)';
  const cuenta = h('span', { class: 'busca-n', 'aria-live': 'polite' });
  const limpiar = h('button', { class: 'busca-x', type: 'button', 'aria-label': 'Borrar búsqueda', hidden: !filtro.q, on: { click: () => { buscador.value = ''; alBuscar(''); buscador.focus(); } } }, icon('cerrar', 18));
  const alBuscar = (v) => { filtro.q = v; limpiar.hidden = !v; extraIds = null; pintarLista(); buscarRemoto(v); };
  const buscador = h('input', { class: 'input input-search', type: 'search', id: 'buscar', placeholder: ph(filtro.cat), autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Buscar producto', value: filtro.q,
    on: { input: (e) => alBuscar(e.target.value) } });
  const caja = h('div', { class: 'busca' }, icon('buscar', 20), buscador, limpiar, cuenta);
  // Al tocar el buscador vacío aparecen los atajos: lo que más pide el local, a un toque.
  const atajos = h('div', { class: 'atajos', hidden: true, role: 'group', 'aria-label': 'Lo que más pedís' },
    h('span', { class: 'atajos-t', text: 'Lo que más pedís' }),
    h('div', { class: 'atajos-l' }, top.slice(0, 8).map(p => h('button', { class: 'atajo', type: 'button', 'data-id': p.id, text: p.nombre,
      on: { pointerdown: (e) => e.preventDefault(), click: () => { buscador.value = p.nombre; alBuscar(p.nombre); atajos.hidden = true; buscador.blur(); } } }))));
  const verAtajos = () => { atajos.hidden = !(top.length && !buscador.value && document.activeElement === buscador); };
  buscador.addEventListener('focus', verAtajos);
  buscador.addEventListener('input', verAtajos);
  buscador.addEventListener('blur', () => { atajos.hidden = true; });

  const marcar = (c) => chips.querySelectorAll('.chip').forEach(b => { const on = b.dataset.cat === c; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  // Al cambiar de categoría se mantiene lo que se está buscando, ahora dentro de la categoría nueva.
  const elegir = (c) => { filtro.cat = c; buscador.placeholder = ph(c); marcar(c); pintarLista(); };
  chipMio.dataset.cat = MI_PEDIDO; chipMio.addEventListener('click', () => elegir(MI_PEDIDO));
  if (filtro.cat === FRECUENTES && !top.length) filtro.cat = 'todas';
  const chipFrec = top.length ? h('button', { class: 'chip chip-frec', type: 'button', 'data-cat': FRECUENTES, on: { click: () => elegir(FRECUENTES) } }, icon('estrella', 15), h('span', { text: 'Lo de siempre' })) : null;
  const chips = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Categorías' }, chipFrec, chipMio,
    ['todas', ...cats].map(c => h('button', { class: 'chip', type: 'button', 'data-cat': c, text: c === 'todas' ? 'Todas' : c, on: { click: () => elegir(c) } })));
  marcar(filtro.cat);

  const previo = listaPrevia && listaPrevia.isConnected ? listaPrevia._n : 0;
  listaPrevia = lista;
  const mis = null; // Mis pedidos tiene su pestaña (pintarMis)
  mount(root,
    cabecera('Pedir', nombreLocal),
    S.offline ? banner('Sin conexión: mostrando lo último que guardamos.', 'warn') : null,
    opc.armado ? h('p', { class: 'aviso-ok', text: S.cierreFecha ? 'Armado con el cierre. Cambiá lo que quieras y enviá.' : 'Armado con lo que queda. Cambiá lo que quieras y enviá.' }) : null,
    aviso.tipo === 'ok' ? h('p', { class: 'aviso-ok', text: aviso.texto }) : banner(aviso.texto, aviso.tipo === 'warn' ? 'warn' : 'info'),
    h('div', { class: 'toolbar toolbar-fija' }, caja, atajos, chips),
    estado, lista, mis, pill);
  pintarLista(previo); actualizarPill();
  // Se busca la sección al momento de scrollear: si otro repintado llega antes, la de este ya no está en la página.
  if (opc.aMis && mis && S.mis) requestAnimationFrame(() => { const m = root.querySelector('#mis-pedidos'); if (m && opc.aMis) { opc.aMis = false; m.scrollIntoView({ block: 'start' }); } });
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
        return h('article', { class: 'prod prod-fila is-on prod-rev' },
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
        // Lo enviado pasa a "pedido sin recibir" (el sugerido lo descuenta) y queda en 0 hasta la semana de pedido siguiente:
        // si el encargado pidió menos de lo sugerido, la app no vuelve a insistir con la diferencia.
        g.items.forEach(p => { S.pend.set(p.id, (S.pend.get(p.id) || 0) + cantidad(p)); S.draft[p.id] = 0; });
        enviado.hechos.add(g.key); ok++;
      } catch (e) { fallos++; err.append(banner(`${g.nombre}: ${mensajeError(e)}`, 'error')); }
    }
    recalcular(); guardarBorrador();
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

// ---------- Mis pedidos (pestaña propia del encargado) ----------
function pintarMis(root) {
  mount(root, cabecera('Mis pedidos', S.local ? S.local.nombre : ''), S.offline ? banner('Sin conexión: mostrando lo último que guardamos.', 'warn') : null, seccionMis(true));
}
const MAX_MIS = 20;
function seccionMis(solo = false) {
  const sec = h('section', { class: 'mis' + (solo ? ' mis-solo' : ''), id: 'mis-pedidos', 'aria-label': 'Mis pedidos' }, solo ? null : h('h2', { class: 'cat-t mis-t', text: 'Mis pedidos' }));
  if (S.mis === null) { sec.append(esqueleto(2)); return sec; }
  if (S.misErr) sec.append(banner(S.misErr, 'warn'));
  if (!S.mis.length) { sec.append(h('p', { class: 'mis-vacio', text: 'Todavía no enviaste pedidos.' })); return sec; }
  const prods = new Map(S.prods.map(p => [p.id, p]));
  sec.append(h('div', { class: 'ped-lista' }, S.mis.slice(0, MAX_MIS).map(o => {
    const items = (o.orden_items || []).filter(i => Number(i.cantidad_pedida) > 0); // sin lo que gerencia agregó al recibir
    const det = h('ul', { class: 'ped-items', hidden: true }, items.map(i => { const p = prods.get(i.producto_id); return h('li', {}, h('span', { text: p ? p.nombre : 'Producto' }), h('b', { class: 'num', text: fmtNum(i.cantidad_pedida, 3) + (p && p.unidad_compra ? ' ' + plural(p.unidad_compra, Number(i.cantidad_pedida)) : '') })); }));
    const prov = S.provs.get(o.proveedor_id);
    return h('article', { class: 'ped' },
      h('button', { class: 'ped-b', type: 'button', 'aria-expanded': 'false', on: { click: (e) => { const b = e.currentTarget; det.hidden = !det.hidden; b.setAttribute('aria-expanded', String(!det.hidden)); } } },
        h('span', { class: 'ped-prov', text: prov ? prov.nombre : (o.proveedor_id ? 'Proveedor' : 'Sin proveedor') }),
        h('span', { class: 'estado estado-' + o.estado, text: ESTADOS[o.estado] || o.estado }),
        h('span', { class: 'ped-meta', text: `${fechaCorta(o.creado_en)} · ${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}${o.cargado_por_nombre ? ' · ' + o.cargado_por_nombre : ''}` })),
      det, o.nota ? h('p', { class: 'ped-nota', text: 'Nota: ' + o.nota }) : null);
  })));
  return sec;
}
