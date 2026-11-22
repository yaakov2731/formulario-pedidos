// Encargado · Hoja del día.
// Locales que elaboran (todos menos el Shopping): una sola hoja para todo el local con dos momentos, Apertura | Cierre.
//   Apertura: viene cargada con el último cierre + lo que llegó después; si está todo igual se confirma con un toque.
//   Cierre: una lista por lugar ("N de M"), a ciegas (no muestra la apertura); lo que no se contó va en 0 (con confirmación).
//   Al terminar, el resultado: qué hace falta para la próxima apertura (rojo), qué va en el pedido de la semana (amarillo),
//   qué alcanza (verde) y qué no tiene historial (sin número inventado). Se guarda con una sola llamada a hoja_guardar (0032;
//   sin 0032 se guarda por sector con hoja_contar). El encargado nunca ve plata.
// Shopping (no elabora): la hoja por sector de antes (Apertura → Durante el día → Cierre), sin cambios.
// Los sectores son los lugares del local (0025_lugares.sql); si no hay, la hoja es una sola para todo el local.
import { mount, h, tokens, fmtNum, parseNum, porTexto, lsGet, lsSet, lsDel, esCarta, esBulto, factorDe, plural, fechaLarga, porLugar, SIN_LUGAR, jornadaISO, elabora, textoBulto, norm, enBultos, sumarDias, hoyISO, esFlorida, entregaHoy } from './util.js';
import { swr, cargarCatalogo, cargarLocales, hojaDelDia, hojaContar, hojaAnotar, hojaBorrar, hojaGuardar, sinHojaSQL, mensajeError, datosReposicion, misOrdenes, cargarProveedoresBasico } from './api.js';
import { buscar as buscarProds, frecuencia, anotarUso } from './busqueda.js';
import { esqueleto, vacio, banner, toast, icon, hoja as hojaModal, stepper, tituloGrande, botonFijo } from './ui.js';
import { planLocal, aperturaSugerida, textoAlcanza, textoCuando } from './reposicion.js';

export const TODO_EL_LOCAL = 'Todo el local';
const PASOS = [['apertura', 'Apertura'], ['durante', 'Durante el día'], ['cierre', 'Cierre']];
const TIPOS = [['entro', '+ Entró'], ['devolvi', '↩ Devolví'], ['merma', '✕ Merma']];
export const PROVEEDOR = 'Proveedor', ELABORE = 'Lo elaboré';

// Sectores del local en el orden del recorrido. Sin lugares cargados, uno solo: "Todo el local".
export function sectoresDe(prods) {
  const m = porLugar(prods);
  if (m.size === 1 && m.has(SIN_LUGAR)) return new Map([[TODO_EL_LOCAL, m.get(SIN_LUGAR)]]);
  return m;
}
const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const cant = (n) => fmtNum(n, 3) || '0';
const uni = (p, n) => (p.unidad_uso ? ' ' + plural(p.unidad_uso, n) : '');

async function renderSector(root, ctx) {
  const lid = ctx.perfil.local_id;
  const fecha = jornadaISO();
  const quien = () => lsGet('nombre') || ctx.nombreGuardado || '';
  const claveSector = 'hoja-sector:' + lid + ':' + fecha;
  let prods = [], nombreLocal = '', movs = [], sinSQL = false, sector = lsGet(claveSector), paso = null, q = '', guardando = false;

  const vista = h('div', { class: 'hj' });
  mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Hoja del día' })), esqueleto(4));
  await Promise.allSettled([
    swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = d; }),
    swr('locales', cargarLocales, (d) => { const l = (d || []).find(x => x.id === lid); nombreLocal = l ? l.nombre : ''; }),
    hojaDelDia(lid, fecha).then(r => { movs = r || []; }).catch(e => { if (sinHojaSQL(e)) sinSQL = true; else toast('No pude cargar la hoja: ' + mensajeError(e), 'error'); })
  ]);
  if (!ctx.alive()) return;
  const activos = prods.filter(p => p.activo !== false && !esCarta(p) && !p.oculto).sort((a, b) => porTexto(a.nombre, b.nombre));
  if (!activos.length) { mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Hoja del día' })), vacio('No hay productos', 'El catálogo del local está vacío.')); return; }
  const sectores = sectoresDe(activos);
  const nombres = [...sectores.keys()];
  if (!sectores.has(sector)) sector = null;
  const porId = new Map(activos.map(p => [p.id, p]));
  const otrosSectores = () => nombres.filter(s => s !== sector && s !== TODO_EL_LOCAL && s !== SIN_LUGAR);

  const de = (s, tipo, pid) => movs.filter(m => m.sector === s && (!tipo || m.tipo === tipo) && (!pid || m.producto_id === pid));
  const estado = (s) => {
    const ap = de(s, 'apertura'), ci = de(s, 'cierre');
    const anot = movs.filter(m => m.sector === s && ['entro', 'devolvi', 'merma'].includes(m.tipo));
    return { ap, ci, anot, paso: ci.length ? 'listo' : ap.length ? 'durante' : 'apertura' };
  };

  // ---------- Lista de sectores ----------
  function pintarLista() {
    sector = null; lsDel(claveSector);
    const cards = nombres.map(s => {
      const e = estado(s);
      const sub = e.ci.length ? `Cerrada ${hora(e.ci[e.ci.length - 1].creado_en)}`
        : e.ap.length ? `Abierta ${hora(e.ap[0].creado_en)} · ${e.anot.length} ${e.anot.length === 1 ? 'anotado' : 'anotados'}` : 'Sin abrir';
      const pasoCls = (id) => {
        const orden = ['apertura', 'durante', 'cierre'];
        const hecho = e.paso === 'listo' || orden.indexOf(id) < orden.indexOf(e.paso);
        return 'hj-paso' + (hecho ? ' is-ok' : id === e.paso ? ' is-now' : '');
      };
      return h('button', { class: 'hj-sector', type: 'button', 'data-sector': s, on: { click: () => abrir(s) } },
        h('div', { class: 'hj-sector-top' },
          h('span', { class: 'hj-ic', 'aria-hidden': 'true', text: s.slice(0, 1).toUpperCase() }),
          h('span', { class: 'hj-sector-t' }, h('b', { text: s }), h('small', { text: `${sub} · ${sectores.get(s).length} ${sectores.get(s).length === 1 ? 'producto' : 'productos'}` })),
          icon('flecha', 20)),
        h('div', { class: 'hj-pasos' }, PASOS.map(([id, t]) => h('span', { class: pasoCls(id) }, pasoCls(id).includes('is-ok') ? icon('check', 14) : null, t))));
    });
    const sinSectores = nombres.length === 1 && nombres[0] === TODO_EL_LOCAL;
    mount(root,
      h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Hoja del día' }),
        h('p', { class: 'sub', text: `${nombreLocal ? nombreLocal + ' · ' : ''}${fechaLarga(fecha)}` })),
      sinSQL ? banner('Falta activar la hoja por sector: hay que pegar el SQL 0031_hoja_sector.sql en Supabase.', 'warn') : null,
      sinSectores ? banner('Todavía no hay sectores: la hoja es una sola para todo el local. Armá los sectores (Barra, Cocina, Cámara…) para dividirla.', 'info')
        : h('p', { class: 'hj-hint', text: 'Elegí tu sector.' }),
      h('div', { class: 'hj-lista' }, cards),
      h('div', { class: 'hj-armar' }, h('a', { class: 'btn btn-ghost', href: '#/lugares' }, icon(sinSectores ? 'mas' : 'pin', 18),
        h('span', { text: sinSectores ? 'Armar los sectores del local' : 'Cambiar los sectores' }))));
  }

  function abrir(s) {
    sector = s; lsSet(claveSector, s); q = '';
    const e = estado(s);
    paso = e.paso === 'listo' ? 'cierre' : e.paso;
    pintarSector();
  }

  // ---------- Hoja de un sector ----------
  const claveBorr = (tipo) => `hoja:${lid}:${fecha}:${sector}:${tipo}`;
  let vals = {}, sus = {};
  function cargarValores(tipo) {
    const b = lsGet(claveBorr(tipo));
    if (b && b.v) { vals = b.v; sus = b.s || {}; return; }
    vals = {}; sus = {};
    for (const m of de(sector, tipo)) {
      const p = porId.get(m.producto_id); if (!p) continue;
      if (esBulto(p)) { const f = factorDe(p); const bu = Math.floor(Number(m.cantidad) / f + 1e-9); vals[p.id] = bu ? cant(bu) : ''; const r = Math.round((Number(m.cantidad) - bu * f) * 1000) / 1000; sus[p.id] = r ? cant(r) : (bu ? '' : '0'); }
      else vals[p.id] = cant(m.cantidad);
    }
  }
  const lleno = (mp, p) => mp[p.id] != null && mp[p.id] !== '';
  const hecho = (p) => lleno(vals, p) || lleno(sus, p);
  const total = (p) => (lleno(vals, p) ? parseNum(vals[p.id]) * (esBulto(p) ? factorDe(p) : 1) : 0) + (esBulto(p) && lleno(sus, p) ? parseNum(sus[p.id]) : 0);
  const valido = (p) => [vals, sus].every(mp => !lleno(mp, p) || (parseNum(mp[p.id]) !== null && parseNum(mp[p.id]) >= 0));

  function pintarSector() {
    const lista = sectores.get(sector) || [];
    if (paso !== 'durante') cargarValores(paso);
    const e = estado(sector);
    const seg = h('div', { class: 'seg hj-seg', role: 'tablist', 'aria-label': 'Paso' }, PASOS.map(([id, t]) => {
      const ok = id === 'apertura' ? e.ap.length > 0 : id === 'cierre' ? e.ci.length > 0 : e.anot.length > 0;
      return h('button', { class: 'seg-b' + (paso === id ? ' is-on' : '') + (ok && paso !== id ? ' is-ok' : ''), type: 'button', role: 'tab', 'aria-selected': paso === id ? 'true' : 'false', 'data-paso': id,
        on: { click: () => { paso = id; pintarSector(); } } }, ok && paso !== id ? icon('check', 16) : null, t);
    }));
    const hint = h('p', { class: 'hj-hint', text: paso === 'apertura' ? 'Contá lo que hay al abrir. Vacío = no lo contaste. Si no hay nada, poné 0.'
      : paso === 'cierre' ? 'Contá lo que queda al cerrar. No mostramos la apertura para que cuentes lo que ves.'
        : 'Anotá lo que entra, lo que devolvés y lo que se tira.' });
    const filas = h('div', { class: 'hj-filas' });
    const pill = h('button', { class: 'pill hj-pill', type: 'button' });
    const buscador = lista.length > 12 ? h('input', { class: 'input input-search hj-buscar', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off', value: q,
      on: { input: (ev) => { q = ev.target.value; pintarFilas(); } } }) : null;

    function actualizarPill() {
      if (paso === 'durante') { pill.textContent = 'Pasar al cierre'; pill.classList.add('is-ghost'); pill.onclick = () => { paso = 'cierre'; pintarSector(); }; return; }
      pill.classList.remove('is-ghost');
      const n = lista.filter(hecho).length;
      pill.textContent = guardando ? 'Guardando…' : `${paso === 'apertura' ? 'Guardar apertura' : 'Cerrar ' + sector.toLowerCase()} · ${n} de ${lista.length}`;
      pill.disabled = guardando || (!n && !de(sector, paso).length);
      pill.onclick = guardar;
    }

    function filaConteo(p) {
      const guardar = () => lsSet(claveBorr(paso), { t: Date.now(), v: vals, s: sus });
      const totalEl = h('span', { class: 'hj-total num' });
      const fila = h('div', { class: 'hj-fila', 'data-id': p.id });
      const refrescar = () => {
        fila.classList.toggle('is-on', hecho(p)); fila.classList.toggle('is-mal', !valido(p));
        totalEl.textContent = esBulto(p) && hecho(p) && valido(p) ? `= ${cant(total(p))}${uni(p, total(p))}` : '';
        actualizarPill();
      };
      const entrada = (mp, etiqueta) => h('input', { class: 'input num hj-in', type: 'text', inputmode: 'decimal', placeholder: '—', 'aria-label': `${etiqueta} de ${p.nombre}`, value: mp[p.id] ?? '',
        on: { input: (ev) => { mp[p.id] = ev.target.value.trim(); guardar(); refrescar(); }, focus: (ev) => ev.target.select() } });
      const unidad = esBulto(p) ? `${plural(p.unidad_compra, 2)} de ${fmtNum(factorDe(p), 3)} ${plural(p.unidad_uso, factorDe(p))} + ${plural(p.unidad_uso, 2)} sueltas` : plural(p.unidad_uso || 'unidad', 2);
      mount(fila, h('div', { class: 'hj-n' }, h('b', { text: p.nombre }), h('small', { text: unidad }), totalEl),
        h('div', { class: 'hj-ins' }, entrada(vals, esBulto(p) ? plural(p.unidad_compra, 2) : 'Cantidad'), esBulto(p) ? entrada(sus, 'Sueltas') : null));
      refrescar();
      return fila;
    }

    function filaDia(p) {
      const ap = de(sector, 'apertura', p.id)[0];
      const tags = [h('span', { class: 'hj-tag is-ab', text: ap ? `Abrió ${cant(ap.cantidad)}${uni(p, Number(ap.cantidad))}` : 'No contado' })];
      for (const m of movs.filter(x => x.sector === sector && x.producto_id === p.id && ['entro', 'devolvi', 'merma'].includes(x.tipo))) {
        const t = m.tipo === 'entro' ? `+${cant(m.cantidad)}${m.otro ? ' ' + (m.otro === ELABORE ? 'elaborado' : 'de ' + m.otro) : ''}`
          : m.tipo === 'devolvi' ? `↩ ${cant(m.cantidad)}${m.otro ? ' a ' + m.otro : ''}` : `✕ ${cant(m.cantidad)} merma`;
        tags.push(h('span', { class: 'hj-tag is-' + m.tipo, text: t }));
      }
      return h('div', { class: 'hj-fila hj-fila-dia', 'data-id': p.id },
        h('div', { class: 'hj-n' }, h('b', { text: p.nombre }), h('div', { class: 'hj-tags' }, tags)),
        h('div', { class: 'hj-acc' },
          h('button', { class: 'hj-mini is-in', type: 'button', 'aria-label': 'Entró · ' + p.nombre, on: { click: () => anotar(p, 'entro') } }, '+ Entró'),
          h('button', { class: 'hj-mini', type: 'button', 'aria-label': 'Devolví o merma · ' + p.nombre, on: { click: () => anotar(p, 'devolvi') } }, '⋯')));
    }

    function pintarFilas() {
      const toks = tokens(q);
      const vis = toks.length ? buscarProds(lista, q, { frec: frecuencia(lid), texto: (p) => p.nombre }).map(r => r.p) : lista;
      mount(filas, vis.length ? vis.map(p => (paso === 'durante' ? filaDia(p) : filaConteo(p))) : h('p', { class: 'hj-hint', text: 'No hay productos con ese nombre en este sector.' }));
      actualizarPill();
    }

    async function guardar() {
      if (guardando) return;
      const malos = lista.filter(p => !valido(p));
      if (malos.length) { toast(`Revisá ${malos[0].nombre}: el número no se entiende.`, 'error'); return; }
      const items = lista.map(p => ({ producto_id: p.id, cantidad: hecho(p) ? total(p) : '' }));
      guardando = true; actualizarPill();
      try {
        const n = await hojaContar(lid, sector, fecha, paso, items, quien());
        lsDel(claveBorr(paso));
        movs = await hojaDelDia(lid, fecha);
        if (!ctx.alive()) return;
        if (paso === 'apertura') { toast(`Apertura guardada · ${n} ${n === 1 ? 'producto' : 'productos'}`, 'ok'); paso = 'durante'; guardando = false; pintarSector(); }
        else { toast(`${sector} cerrada · ${n} ${n === 1 ? 'producto' : 'productos'}`, 'ok'); guardando = false; pintarLista(); }
      } catch (err) {
        guardando = false; actualizarPill();
        toast(sinHojaSQL(err) ? 'Falta pegar el SQL 0031_hoja_sector.sql en Supabase.' : 'No se pudo guardar: ' + mensajeError(err), 'error');
      }
    }

    mount(root,
      h('header', { class: 'vista-head hj-head' },
        h('button', { class: 'btn btn-text hj-volver', type: 'button', on: { click: pintarLista } }, icon('atras', 18), h('span', { text: 'Sectores' })),
        h('h1', { class: 'titulo', text: sector }), h('p', { class: 'sub', text: `${nombreLocal ? nombreLocal + ' · ' : ''}${fechaLarga(fecha)}` })),
      sinSQL ? banner('Falta activar la hoja por sector: hay que pegar el SQL 0031_hoja_sector.sql en Supabase.', 'warn') : null,
      seg, hint, buscador, filas, pill);
    pintarFilas();
  }

  // ---------- Anotar: entró, devolví, merma ----------
  function anotar(p, tipoIni) {
    anotarUso(lid, p.id);
    let tipo = tipoIni, otro = null, cuanto = 0, enviando = false;
    const st = stepper({ value: 0, label: 'Cantidad', onChange: (n) => { cuanto = n; } });
    const segT = h('div', { class: 'seg seg-form hj-tipos', role: 'tablist', 'aria-label': 'Qué pasó' });
    const lblCant = h('p', { class: 'hj-lbl' });
    const lblOtro = h('p', { class: 'hj-lbl' });
    const chips = h('div', { class: 'chips hj-chips', role: 'group' });
    const hechos = h('div', { class: 'hj-hechos' });
    const opciones = () => tipo === 'merma' ? [] : tipo === 'entro' ? [...otrosSectores(), PROVEEDOR, ...(elabora(ctx.codigoLocal) ? [ELABORE] : [])] : [...otrosSectores(), PROVEEDOR];
    function pintar() {
      segT.replaceChildren(...TIPOS.map(([id, t]) => h('button', { class: 'seg-b' + (tipo === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': tipo === id ? 'true' : 'false', 'data-tipo': id, text: t,
        on: { click: () => { tipo = id; otro = null; pintar(); } } })));
      lblCant.textContent = `Cantidad en ${plural(p.unidad_uso || 'unidad', 2)}${esBulto(p) ? ' (' + textoBulto(p) + ')' : ''}`;
      const ops = opciones();
      if (otro && !ops.includes(otro)) otro = null;
      if (!otro && ops.length === 1) otro = ops[0];
      lblOtro.textContent = tipo === 'entro' ? '¿De dónde vino?' : tipo === 'devolvi' ? '¿A dónde lo devolviste?' : '';
      lblOtro.hidden = !ops.length;
      chips.replaceChildren(...ops.map(o => h('button', { class: 'chip' + (otro === o ? ' is-on' : ''), type: 'button', 'aria-pressed': otro === o ? 'true' : 'false', 'data-otro': o, text: o,
        on: { click: () => { otro = o; pintar(); } } })));
      const ya = movs.filter(m => m.sector === sector && m.producto_id === p.id && ['entro', 'devolvi', 'merma'].includes(m.tipo));
      hechos.replaceChildren(...(ya.length ? [h('p', { class: 'hj-lbl', text: 'Anotado hoy' }), ...ya.map(m => h('div', { class: 'hj-hecho' },
        h('span', { text: `${TIPOS.find(t => t[0] === m.tipo)[1]} ${cant(m.cantidad)}${uni(p, Number(m.cantidad))}${m.otro ? ' · ' + m.otro : ''} · ${hora(m.creado_en)}` }),
        h('button', { class: 'btn btn-text btn-danger btn-sm', type: 'button', text: 'Sacar', on: { click: () => sacar(m) } })))] : []));
    }
    async function sacar(m) {
      try { await hojaBorrar(m.id); movs = movs.filter(x => x.id !== m.id); toast('Listo, lo saqué de la hoja', 'ok'); pintar(); pintarSector(); }
      catch (err) { toast('No se pudo sacar: ' + mensajeError(err), 'error'); }
    }
    const btn = h('button', { class: 'btn btn-primary btn-block btn-lg hj-anotar', type: 'button', text: 'Anotar', on: { click: async () => {
      if (enviando) return;
      if (!(cuanto > 0)) { toast('Poné cuánto.', 'error'); return; }
      if (opciones().length && !otro) { toast(tipo === 'entro' ? 'Elegí de dónde vino.' : 'Elegí a dónde lo devolviste.', 'error'); return; }
      enviando = true; btn.disabled = true;
      try {
        await hojaAnotar(lid, sector, fecha, p.id, tipo, cuanto, otro, quien());
        movs = await hojaDelDia(lid, fecha);
        modal.cerrar(); toast('Anotado', 'ok');
        if (ctx.alive()) pintarSector();
      } catch (err) {
        enviando = false; btn.disabled = false;
        toast(sinHojaSQL(err) ? 'Falta pegar el SQL 0031_hoja_sector.sql en Supabase.' : 'No se pudo anotar: ' + mensajeError(err), 'error');
      }
    } } });
    pintar();
    const modal = hojaModal(p.nombre, h('div', { class: 'hj-form' }, h('p', { class: 'hj-lbl', text: '¿Qué pasó?' }), segT, lblCant, st.el, lblOtro, chips, btn, hechos));
  }

  vista.remove();
  if (sector) abrir(sector); else pintarLista();
  return () => {};
}

// ===================== Hoja de los locales que elaboran: Apertura | Cierre =====================
export async function render(root, ctx) {
  if (!elabora(ctx.codigoLocal)) return renderSector(root, ctx);
  return renderDia(root, ctx);
}

// Clave del último cierre guardado en este equipo: Pedir arma el pedido con las mismas cantidades del resultado.
export const claveCierre = (lid) => 'cierre:' + lid;
export const CLAVE_DESDE_CIERRE = 'stock:pedir-desde-cierre';
const pasoDe = (p) => (/^(kg|kilo|kilos|l|lt|litro|litros)$/.test(norm(p.unidad_uso || p.unidad_compra || '')) ? 0.5 : 1);
const uDe = (p, n = 2) => plural(p.unidad_uso || p.unidad_compra || 'unidad', n);
const uPedido = (p, n) => plural(esBulto(p) ? p.unidad_compra : (p.unidad_compra || p.unidad_uso || 'unidad'), n);
export const textoPedir = (p, n) => `${fmtNum(n, 3)} ${uPedido(p, n)}`;
const numTx = (n) => (n === null || n === undefined || n === '' ? '' : fmtNum(n, 3));

async function renderDia(root, ctx) {
  const lid = ctx.perfil.local_id;
  const fecha = jornadaISO();
  const quien = () => lsGet('nombre') || ctx.nombreGuardado || '';
  let prods = [], local = null, movs = [], rep = null, sinSQL = false, provs = new Map(), ordenes = null;
  mount(root, tituloGrande('Hoja del día'), esqueleto(5));
  await Promise.allSettled([
    swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = d || []; }),
    swr('locales', cargarLocales, (d) => { local = (d || []).find(x => x.id === lid) || null; }),
    hojaDelDia(lid, fecha).then(r => { movs = r || []; }).catch(e => { if (sinHojaSQL(e)) sinSQL = true; else toast('No pude cargar la hoja: ' + mensajeError(e), 'error'); }),
    swr('rep:' + lid, () => datosReposicion(lid, fecha), (d) => { if (d && d.hoy === fecha) rep = d; })
  ]);
  if (!ctx.alive()) return;
  const activos = prods.filter(p => p.activo !== false && !esCarta(p) && !p.oculto).sort((a, b) => porTexto(a.nombre, b.nombre));
  if (!activos.length) { mount(root, tituloGrande('Hoja del día'), vacio('No hay productos', 'El catálogo del local está vacío.')); return; }
  const sectores = sectoresDe(activos);
  const sectorDe = new Map();
  for (const [s, ps] of sectores) for (const p of ps) sectorDe.set(p.id, s);
  const total = activos.length;
  const guardado = (tipo) => { const m = new Map(); for (const x of movs) if (x.tipo === tipo) m.set(x.producto_id, (m.get(x.producto_id) || 0) + Number(x.cantidad)); return m; };
  const horaDe = (tipo) => { const xs = movs.filter(x => x.tipo === tipo); return xs.length ? hora(xs[xs.length - 1].creado_en) : null; };

  // Apertura precargada: último cierre (anterior a hoy) + lo que llegó después.
  const precarga = (() => {
    if (!rep || !rep.ultimo) return null;
    const ult = new Map();
    let fechaCierre = null;
    for (const [id, xs] of rep.cierres || []) {
      const ant = xs.filter(([f]) => f < fecha);
      if (!ant.length) continue;
      const [f, q] = ant[ant.length - 1];
      if (!fechaCierre || f > fechaCierre) fechaCierre = f;
      ult.set(id, { f, q });
    }
    if (!fechaCierre) return null;
    const delUltimo = new Map([...ult].filter(([, v]) => v.f === fechaCierre).map(([id, v]) => [id, v.q]));
    const conRecep = rep.ultimo === fechaCierre ? aperturaSugerida(delUltimo, new Map(rep.recep || [])) : delUltimo;
    return { fecha: fechaCierre, q: conRecep, anoche: delUltimo, recep: rep.ultimo === fechaCierre && (rep.recep || []).length > 0 };
  })();

  const ahora = new Date();
  const hayAp = movs.some(x => x.tipo === 'apertura'), hayCi = movs.some(x => x.tipo === 'cierre');
  let modo = hayCi ? 'listo' : (!hayAp && ahora.getHours() >= 6 && ahora.getHours() < 18 ? 'apertura' : 'cierre');
  let guardando = false, confirmar = false;
  const claveBorr = (tipo) => `hoja-dia:${lid}:${fecha}:${tipo}`;
  let vals = new Map();

  function cargarValores(tipo) {
    const b = lsGet(claveBorr(tipo));
    vals = new Map();
    if (b && b.v) { for (const [k, v] of Object.entries(b.v)) vals.set(k, v); return; }
    const g = guardado(tipo);
    if (g.size) { for (const [k, v] of g) vals.set(k, numTx(v)); return; }
    if (tipo === 'apertura' && precarga) for (const p of activos) vals.set(p.id, numTx(precarga.q.has(p.id) ? precarga.q.get(p.id) : 0));
  }
  const guardarBorr = (tipo) => lsSet(claveBorr(tipo), { t: Date.now(), v: Object.fromEntries(vals) });
  const lleno = (p) => vals.has(p.id) && vals.get(p.id) !== '';
  const valor = (p) => (lleno(p) ? parseNum(vals.get(p.id)) : null);
  const valido = (p) => !lleno(p) || (valor(p) !== null && valor(p) >= 0);
  const base = (p) => (precarga ? (precarga.q.has(p.id) ? precarga.q.get(p.id) : 0) : null);
  const corregido = (p) => precarga && lleno(p) && valido(p) && Math.abs(valor(p) - base(p)) > 1e-9;

  // Avisos del encargado (antes en Hoy): una línea arriba de la hoja. No frena la pantalla.
  const avisos = h('div', { class: 'cd-avisos' });
  Promise.allSettled([
    misOrdenes(lid).then(r => { ordenes = r || []; }),
    swr('provb', cargarProveedoresBasico, (d) => { provs = new Map((d || []).map(p => [p.id, p])); })
  ]).then(() => { if (ctx.alive() && ordenes) pintarAvisos(); });
  function pintarAvisos() {
    const dow = new Date().getDay();
    const lunes = sumarDias(hoyISO(), -((dow + 6) % 7));
    const semana = ordenes.filter(o => o.estado !== 'cancelada' && String(o.creado_en).slice(0, 10) >= lunes);
    const items = [];
    if (dow >= 1 && dow <= 3 && !semana.length) items.push(['pedir', dow === 3 ? 'El pedido de la semana cierra hoy' : 'El pedido de la semana cierra el miércoles', '#/pedir']);
    if (dow === 5) {
      const fl = [...provs.values()].find(p => esFlorida(p.nombre));
      if (fl && !semana.some(o => o.proveedor_id === fl.id)) items.push(['pedir', 'Hoy se pide a ' + fl.nombre + ' para el sábado', '#/pedir']);
    }
    const llega = ordenes.some(o => o.estado === 'enviada' && (!o.proveedor_id || entregaHoy((provs.get(o.proveedor_id) || {}).dias_entrega, dow)));
    if (llega && !lsGet('factura-subida:' + lid + ':' + fecha)) items.push(['recibir', '¿Llegó mercadería? Subí la factura', '#/subir-factura']);
    avisos.replaceChildren(...items.map(([ic, t, href]) => h('a', { class: 'cd-aviso', href }, icon(ic, 16), h('span', { text: t }), icon('flecha', 14))));
  }

  // ---------- pantalla ----------
  function seg() {
    const hA = horaDe('apertura'), hC = horaDe('cierre');
    const b = (id, t) => h('button', { class: 'seg-b' + ((modo === id || (id === 'cierre' && modo === 'listo')) ? ' is-on' : ''), type: 'button', role: 'tab', 'data-modo': id,
      'aria-selected': (modo === id || (id === 'cierre' && modo === 'listo')) ? 'true' : 'false', on: { click: () => { modo = id === 'cierre' && hayCierre() ? 'listo' : id; confirmar = false; pintar(); } } },
    t, (id === 'apertura' ? hA : hC) ? h('span', { class: 'cd-seg-h' }, ' · ' + (id === 'apertura' ? hA : hC), icon('check', 14)) : null);
    return h('div', { class: 'seg cd-seg', role: 'tablist', 'aria-label': 'Momento' }, b('apertura', 'Apertura'), b('cierre', 'Cierre'));
  }
  const hayCierre = () => movs.some(x => x.tipo === 'cierre');
  const cabeza = () => [tituloGrande('Hoja del día', `${local ? local.nombre + ' · ' : ''}${fechaLarga(fecha)}`), avisos,
    sinSQL ? banner('Falta activar la hoja en el servidor (SQL 0031_hoja_sector.sql).', 'warn') : null, seg()];

  function pintar() {
    if (modo === 'listo') return pintarResultado();
    cargarValores(modo);
    const esAp = modo === 'apertura';
    const filasPorId = new Map();
    const cont = h('span', { class: 'cd-cont' });
    const pct = h('span', { class: 'cd-cont' });
    const barra = h('i');
    const boton = botonFijo('', null, { clase: 'cd-btn' });
    const panel = h('div', { class: 'cd-confirma', hidden: true });
    const cuentas = new Map();
    const actualizar = () => {
      const n = activos.filter(lleno).length;
      cont.textContent = `${n} de ${total} contados`; pct.textContent = Math.round(n / total * 100) + '%'; barra.style.width = (n / total * 100) + '%';
      for (const [s, el] of cuentas) { const ps = sectores.get(s); el.textContent = `${ps.filter(lleno).length} de ${ps.length}`; }
      const corr = activos.filter(corregido).length;
      const tx = guardando ? 'Guardando…' : esAp ? (precarga ? (corr ? `Guardar apertura (${corr} ${corr === 1 ? 'corregido' : 'corregidos'})` : 'Todo igual, confirmar apertura') : `Guardar apertura · ${n} de ${total}`)
        : (n < total ? `Terminar cierre (${total - n} sin contar van en 0)` : 'Terminar cierre');
      boton.querySelector('span').textContent = tx;
      boton.disabled = guardando || (esAp && !precarga && !n);
    };
    const fila = (p) => {
      const inp = h('input', { class: 'input num cd-in', type: 'text', inputmode: 'decimal', placeholder: '–', 'aria-label': p.nombre, value: vals.get(p.id) ?? '', autocomplete: 'off' });
      const sub = h('small', {});
      const el = h('div', { class: 'cd-fila', 'data-id': p.id });
      const refrescar = () => {
        el.classList.toggle('is-on', lleno(p)); el.classList.toggle('is-mal', !valido(p)); el.classList.toggle('is-cambio', !!corregido(p));
        const bul = lleno(p) && valido(p) ? enBultos(p, valor(p)) : '';
        sub.textContent = esAp && corregido(p) ? `${precarga.recep ? 'Quedó + llegó' : 'Quedaron'} ${numTx(base(p))} ${uDe(p, base(p))}` : (bul ? '= ' + bul : (esBulto(p) ? textoBulto(p) : ''));
        actualizar();
      };
      const poner = (v) => { vals.set(p.id, v); inp.value = v; guardarBorr(modo); refrescar(); };
      inp.addEventListener('input', () => { vals.set(p.id, inp.value.trim()); guardarBorr(modo); refrescar(); });
      inp.addEventListener('focus', () => inp.select());
      const paso = pasoDe(p);
      const menos = h('button', { class: 'cd-pm', type: 'button', 'aria-label': 'Menos · ' + p.nombre, on: { click: () => poner(numTx(Math.max(0, (valor(p) || 0) - paso))) } }, icon('menos', 16));
      const mas = h('button', { class: 'cd-pm', type: 'button', 'aria-label': 'Más · ' + p.nombre, on: { click: () => poner(numTx((valor(p) || 0) + paso)) } }, icon('mas', 16));
      mount(el, h('div', { class: 'cd-n' }, h('b', { text: p.nombre }), sub),
        h('div', { class: 'cd-num' }, menos, inp, mas), h('span', { class: 'cd-u', text: uDe(p) }));
      filasPorId.set(p.id, refrescar);
      return el;
    };
    const grupos = [...sectores].map(([s, ps]) => {
      const c = h('span', { class: 'cd-gc' }); cuentas.set(s, c);
      return h('section', { class: 'cd-grupo', 'data-sector': s }, h('div', { class: 'cd-gh' }, h('span', { text: s }), c), h('div', { class: 'cd-lista' }, ps.map(fila)));
    });
    async function guardar(forzar = false) {
      if (guardando) return;
      const malos = activos.filter(p => !valido(p));
      if (malos.length) { toast(`Revisá ${malos[0].nombre}: el número no se entiende.`, 'error'); return; }
      const faltan = activos.filter(p => !lleno(p)).length;
      if (!esAp && faltan && !forzar) { confirmar = true; panel.hidden = false; panel.scrollIntoView({ block: 'center' }); return; }
      const items = activos.map(p => ({ producto_id: p.id, sector: sectorDe.get(p.id), cantidad: lleno(p) ? valor(p) : (esAp ? '' : 0) }));
      guardando = true; actualizar();
      try {
        await hojaGuardar(lid, fecha, modo, items, quien());
        lsDel(claveBorr(modo));
        movs = await hojaDelDia(lid, fecha).catch(() => movs);
        if (!ctx.alive()) return;
        guardando = false; confirmar = false;
        if (esAp) { toast('Apertura guardada', 'ok'); modo = 'cierre'; pintar(); }
        else {
          lsSet(claveCierre(lid), { fecha, t: Date.now(), q: Object.fromEntries(items.map(i => [i.producto_id, Number(i.cantidad) || 0])) });
          modo = 'listo'; pintar();
        }
        window.scrollTo(0, 0);
      } catch (err) {
        guardando = false; actualizar();
        toast(sinHojaSQL(err) ? 'Falta activar la hoja en el servidor.' : 'No se pudo guardar: ' + mensajeError(err), 'error');
      }
    }
    boton.addEventListener('click', () => guardar(false));
    mount(panel, h('p', {}, h('b', { text: 'Hay productos sin contar.' }), ' Van en 0: quiere decir que no quedó nada.'),
      h('div', { class: 'cd-confirma-b' },
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Sí, terminar el cierre', on: { click: () => guardar(true) } }),
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'Seguir contando', on: { click: () => { confirmar = false; panel.hidden = true; const f = activos.find(p => !lleno(p)); const el = f && root.querySelector(`.cd-fila[data-id="${f.id}"] input`); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } } } })));
    panel.hidden = !confirmar;
    const prox = planLocal({ prods: [], local, hoy: fecha }).prox;
    const nota = esAp
      ? h('p', { class: 'cd-nota', text: precarga ? `Viene cargada con el cierre del ${fechaLarga(precarga.fecha)}${precarga.recep ? ' y lo que llegó después' : ''}. Si algo no coincide, corregilo; si está todo igual, confirmá de una.` : 'Contá lo que hay al abrir. Vacío = no lo contaste.' })
      : h('div', { class: 'cd-prox' }, h('div', {}, h('span', { class: 'cd-k', text: '¿Qué sobró hoy? · Próxima apertura' }), h('b', { text: prox ? fechaLarga(prox.fecha) : 'Sin días cargados' })),
        prox ? h('span', { class: 'cd-pill p-gris', text: textoCuando(prox) }) : null);
    mount(root, ...cabeza(), nota,
      esAp ? null : h('div', { class: 'cd-avance' }, h('div', { class: 'cd-avance-t' }, cont, pct), h('div', { class: 'cd-barra' }, barra)),
      grupos, panel, boton);
    for (const f of filasPorId.values()) f();
    actualizar();
  }

  // ---------- resultado del cierre ----------
  function pintarResultado() {
    const q = guardado('cierre');
    const plan = planLocal({ prods: activos, quedan: q, cons: new Map(rep ? rep.cons : []), pend: new Map(rep ? rep.pend : []), local, hoy: fecha });
    const filas = activos.filter(p => plan.items.has(p.id)).map(p => ({ p, e: plan.items.get(p.id) }));
    const rojo = filas.filter(x => x.e.c === 'rojo' && x.e.pedir > 0), amar = filas.filter(x => x.e.c === 'amar' && x.e.pedir > 0);
    const gris = filas.filter(x => x.e.c === 'gris');
    const verde = filas.length - rojo.length - amar.length - gris.length;
    const manana = plan.prox && plan.prox.dias === 1;
    const tRojo = manana ? 'Comprar para mañana' : 'Comprar antes de abrir';
    const lista = (tit, arr, cls) => h('section', { class: 'cd-grupo cd-res-' + cls }, h('div', { class: 'cd-gh' }, h('span', { text: tit }), h('span', { class: 'cd-gc', text: String(arr.length) })),
      h('div', { class: 'cd-lista' }, arr.map(({ p, e }) => h('div', { class: 'cd-fila cd-fila-res', 'data-id': p.id },
        h('div', { class: 'cd-n' }, h('b', { text: p.nombre }), h('small', { text: `Quedan ${numTx(e.quedan) || '0'} ${uDe(p, e.quedan)} · alcanza ${textoAlcanza(e.dias)}${e.pendiente ? ` · ya pedido ${textoPedir(p, e.pendiente)}` : ''}` })),
        h('div', { class: 'cd-pedir' }, h('b', { class: 'num', text: 'Pedir ' + fmtNum(e.pedir, 3) }), h('small', { text: uPedido(p, e.pedir) }))))));
    const hC = horaDe('cierre');
    mount(root, ...cabeza(),
      h('div', { class: 'cd-ok' }, h('span', { class: 'cd-k', text: `Cierre guardado${hC ? ' · ' + hC : ''}` }), h('h2', { text: 'Listo, gracias.' }),
        h('p', { class: 'sub', text: plan.prox ? `Con lo que sobró, esto hace falta para abrir el ${fechaLarga(plan.prox.fecha)}:` : 'No hay días de apertura cargados: avisale a gerencia.' })),
      h('div', { class: 'cd-res' },
        h('div', { class: 'cd-r is-rojo' }, h('b', { text: String(rojo.length) }), h('small', { text: tRojo })),
        h('div', { class: 'cd-r is-amar' }, h('b', { text: String(amar.length) }), h('small', { text: 'Van en el pedido de la semana' })),
        h('div', { class: 'cd-r is-verde' }, h('b', { text: String(verde) }), h('small', { text: 'Alcanzan' }))),
      gris.length ? h('p', { class: 'cd-nota cd-sinhist' }, h('b', { text: `${gris.length} sin historial. ` }), 'Todavía no hay suficientes días contados para calcularlos: pedilos a mano si hace falta.') : null,
      rojo.length ? lista(tRojo, rojo, 'rojo') : null,
      amar.length ? lista('Pedido de la semana', amar, 'amar') : null,
      h('div', { class: 'cd-acciones' },
        h('button', { class: 'btn btn-primary btn-block btn-lg cd-armar', type: 'button', text: `Armar el pedido con esto (${rojo.length + amar.length})`, disabled: !(rojo.length + amar.length),
          on: { click: () => { try { sessionStorage.setItem(CLAVE_DESDE_CIERRE, fecha); } catch (_e) { /* nada */ } ctx.ir('pedir'); } } }),
        h('button', { class: 'btn btn-ghost btn-block cd-corregir', type: 'button', text: 'Corregir el cierre', on: { click: () => { modo = 'cierre'; pintar(); window.scrollTo(0, 0); } } })));
  }

  pintar();
  return () => {};
}
