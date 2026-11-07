// Encargado · Hoja: una sola hoja por sector (Barra, Cocina, Cámara, Depósito…) y por día, en 3 pasos:
//   Apertura (lo que hay al abrir) → Durante el día (+ Entró, ↩ Devolví, ✕ Merma) → Cierre (lo que queda, a ciegas).
// El encargado solo anota: no ve consumo, diferencias ni precios. Los cálculos los ve gerencia en Stock → Por sector.
// Los sectores son los lugares del local (0025_lugares.sql); si no hay, la hoja es una sola para todo el local.
// Lo que se elabora entra como "+ Entró · Lo elaboré". La merma también resta del stock del local (0031_hoja_sector.sql).
import { mount, h, tokens, coincide, fmtNum, parseNum, porTexto, lsGet, lsSet, lsDel, esCarta, esBulto, factorDe, plural, fechaLarga, porLugar, SIN_LUGAR, jornadaISO, elabora, textoBulto } from './util.js';
import { swr, cargarCatalogo, cargarLocales, hojaDelDia, hojaContar, hojaAnotar, hojaBorrar, sinHojaSQL, mensajeError } from './api.js';
import { esqueleto, vacio, banner, toast, icon, hoja as hojaModal, stepper } from './ui.js';

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

export async function render(root, ctx) {
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
        h('div', { class: 'hj-pasos' }, PASOS.map(([id, t]) => h('span', { class: pasoCls(id) }, pasoCls(id).includes('is-ok') ? '✓ ' : '', t))));
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
        on: { click: () => { paso = id; pintarSector(); } } }, ok && paso !== id ? '✓ ' : '', t);
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
      const vis = toks.length ? lista.filter(p => coincide(p.nombre, toks)) : lista;
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
