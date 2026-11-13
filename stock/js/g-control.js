// Gerencia · Stock → Control: la semana de cada local entre el conteo de apertura (primer día de servicio) y el de
// cierre (último), por lugar (Cámara, Freezer, Barra…), en el orden del recorrido (0025_lugares.sql, 0028_conteo_apertura_cierre.sql).
//   Se usó = había (apertura) + entró (recepciones y elaborados) − quedó (cierre).
//   Anotado = lo que el sistema descontó en la semana (ventas por receta, producción, merma, "usé hoy"). Si se usó más de
//   lo anotado, la diferencia es merma o faltante sin anotar. En el Shopping (sin ventas por receta) no hay anotado.
//   Pide = lo que el local pidió después del cierre (hasta la próxima apertura), comparado con lo que usó y lo que quedó.
// Sin mínimos ni par: solo lo contado, lo usado y lo pedido. Los pesos (costo) se ven solo acá, en gerencia.
import { mount, h, fmtNum, fmtMoney, porTexto, lsGet, lsSet, esBulto, factorDe, plural, fechaCorta, porLugar, lugarDe } from './util.js';
import { listarConteos, hayTipoConteo, movimientosDesde, ordenesLocalDesde, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, banner, subnav, SUBNAV_STOCK, icon } from './ui.js';
import { costoUnidad } from './perdida.js';

const ENTRA = ['recepcion', 'produccion_alta'];
const ANOTADO = ['venta', 'produccion_consumo', 'merma', 'uso_dia'];
const AVISO = {
  revisar: { t: 'Revisar conteo', d: 'Quedó más de lo que había más lo que entró: falta cargar una entrada o se contó mal.' },
  corto: { t: 'Se queda corto', d: 'Lo que quedó más lo que pidió no llega a lo que usó en la semana.' },
  demas: { t: 'Pide de más', d: 'Lo que quedó más lo que pidió es más del doble de lo que usó.' },
  sinUso: { t: 'Pide sin usar', d: 'Pidió, pero en la semana no usó nada.' },
  faltante: { t: 'Sin anotar', d: 'Se usó más de lo que descontaron las ventas, la producción y la merma.' }
};
const ORDEN_AVISO = ['revisar', 'faltante', 'corto', 'demas', 'sinUso'];
const t0 = (iso) => Date.parse(iso);
const dia = (iso) => fechaCorta(iso).split(' · ')[0];

// Semanas: cada cierre con la apertura anterior más cercana. La más nueva primero.
export function armarSemanas(conteos) {
  const asc = [...conteos].sort((a, b) => t0(a.creado_en) - t0(b.creado_en));
  const out = [];
  asc.forEach((c, i) => {
    if (c.tipo !== 'cierre') return;
    const ap = asc.slice(0, i).reverse().find(x => x.tipo === 'apertura');
    if (!ap) return;
    if (out.some(s => s.ap.id === ap.id)) out.find(s => s.ap.id === ap.id).ci = c; // dos cierres seguidos: vale el último
    else out.push({ ap, ci: c });
  });
  for (const s of out) s.sig = asc.find(x => x.tipo === 'apertura' && t0(x.creado_en) > t0(s.ci.creado_en)) || null;
  return out.reverse();
}

// Cuenta de la semana por producto. prods: Map id → producto. precios: Map id → precio por unidad de compra.
export function calcularSemana(sem, movs, ordenes, prods, precios) {
  const desde = t0(sem.ap.creado_en), hasta = t0(sem.ci.creado_en);
  const hastaPide = sem.sig ? t0(sem.sig.creado_en) : Infinity;
  const ap = new Map((sem.ap.items || []).map(it => [it.producto_id, Number(it.contado)]));
  const ci = new Map((sem.ci.items || []).map(it => [it.producto_id, Number(it.contado)]));
  const entro = new Map(), anot = new Map(), pide = new Map(), pideBultos = new Map();
  for (const m of movs) {
    const t = t0(m.creado_en); if (!(t > desde && t < hasta)) continue;
    const c = Number(m.cantidad) || 0;
    if (ENTRA.includes(m.tipo)) entro.set(m.producto_id, (entro.get(m.producto_id) || 0) + c);
    else if (ANOTADO.includes(m.tipo)) anot.set(m.producto_id, (anot.get(m.producto_id) || 0) - c);
  }
  for (const o of ordenes) {
    const t = t0(o.creado_en); if (!(t >= hasta && t < hastaPide)) continue;
    for (const it of o.orden_items || []) {
      if (it.excluido) continue;
      const p = prods.get(it.producto_id); const q = Number(it.cantidad_pedida) || 0;
      pide.set(it.producto_id, (pide.get(it.producto_id) || 0) + q * factorDe(p));
      pideBultos.set(it.producto_id, (pideBultos.get(it.producto_id) || 0) + q);
    }
  }
  const hayAnotado = [...anot.values()].some(v => v > 0);
  const hayPedido = pide.size > 0;
  const filas = [], soloUno = [];
  for (const id of new Set([...ap.keys(), ...ci.keys()])) {
    const p = prods.get(id); if (!p) continue;
    if (!ap.has(id) || !ci.has(id)) { soloUno.push({ p, en: ap.has(id) ? 'apertura' : 'cierre' }); continue; }
    const r = { p, habia: ap.get(id), entro: entro.get(id) || 0, quedo: ci.get(id), anotado: anot.get(id) || 0, pide: pide.get(id) || 0, pideBultos: pideBultos.get(id) || 0 };
    r.uso = Math.round((r.habia + r.entro - r.quedo) * 1000) / 1000;
    r.sinAnotar = hayAnotado ? Math.round((r.uso - r.anotado) * 1000) / 1000 : 0;
    const pu = costoUnidad(p, precios);
    r.valorUso = pu != null && r.uso > 0 ? r.uso * pu : null;
    r.valorFalta = pu != null && r.sinAnotar > 0 ? r.sinAnotar * pu : null;
    r.avisos = [];
    if (r.uso < 0) r.avisos.push('revisar');
    else {
      if (hayAnotado && r.sinAnotar > 0 && r.sinAnotar > r.uso * 0.1) r.avisos.push('faltante');
      if (hayPedido) {
        if (r.uso > 0 && r.quedo + r.pide < r.uso) r.avisos.push('corto');
        else if (r.pide > 0 && r.uso <= 0) r.avisos.push('sinUso');
        else if (r.pide > 0 && r.quedo + r.pide > 2 * r.uso) r.avisos.push('demas');
      }
    }
    filas.push(r);
  }
  return { filas, soloUno, hayAnotado, hayPedido };
}

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Control semanal' }),
    h('p', { class: 'sub', text: 'Lo que se usó entre el conteo de apertura y el de cierre, por lugar, y lo que piden.' }));
  const nav = subnav(SUBNAV_STOCK, 'control');
  mount(root, cab, nav, esqueleto(4));
  try { await cargarG(['prods', 'locales', 'precios']); } catch (e) { toast('No se pudo cargar: ' + mensajeError(e), 'error'); }
  if (!ctx.alive()) return;

  const zonaSem = h('div', { class: 'chips chips-scroll ctl-semanas', role: 'group', 'aria-label': 'Semana' });
  const cuerpo = h('div', { class: 'ctl' });
  let localId = null, semanas = [], semId = null, datos = null, filtro = lsGet('g:ctl-filtro', 'avisos') === 'todo' ? 'todo' : 'avisos', pidiendo = 0;

  const u = (p) => (p.unidad_uso ? ' ' + p.unidad_uso : '');
  const n = (x) => fmtNum(x, 2) || '0';
  const textoPide = (r) => (r.pide <= 0 ? '—' : esBulto(r.p) ? `${fmtNum(r.pideBultos, 2)} ${plural(r.p.unidad_compra, r.pideBultos)}` : n(r.pide));

  function fila(r, d) {
    const num = (k, v, clase) => h('div', { class: 'ctl-n' + (clase ? ' ' + clase : '') }, h('span', { class: 'ctl-k', text: k }), h('b', { class: 'num', text: v }));
    return h('article', { class: 'ctl-fila' + (r.avisos.length ? ' is-aviso' : ''), 'data-prod': r.p.id },
      h('div', { class: 'ctl-cab' }, h('h3', { class: 'ctl-p', text: r.p.nombre }), h('span', { class: 'ctl-u', text: (r.p.unidad_uso || '') }),
        h('div', { class: 'ctl-av' }, r.avisos.map(a => h('span', { class: 'ctl-badge is-' + a, title: AVISO[a].d, text: AVISO[a].t })))),
      h('div', { class: 'ctl-nums' + (d.hayAnotado ? ' con-anot' : '') },
        num('Había', n(r.habia)), num('Entró', n(r.entro)), num('Quedó', n(r.quedo)),
        num('Se usó', n(r.uso), 'is-uso' + (r.uso < 0 ? ' is-mal' : '')),
        d.hayAnotado ? num('Anotado', n(r.anotado), r.avisos.includes('faltante') ? 'is-mal' : '') : null,
        num('Pide', textoPide(r), r.avisos.some(a => a === 'corto' || a === 'demas' || a === 'sinUso') ? 'is-mal' : '')),
      r.valorFalta ? h('p', { class: 'ctl-plata', text: `Sin anotar: ${n(r.sinAnotar)}${u(r.p)} · ${fmtMoney(r.valorFalta)}` }) : null);
  }

  function pintar() {
    const sem = semanas.find(s => s.ap.id === semId);
    if (!sem || !datos) return;
    const d = datos;
    const conAviso = d.filas.filter(r => r.avisos.length);
    const valorUso = d.filas.reduce((s, r) => s + (r.valorUso || 0), 0);
    const valorFalta = d.filas.reduce((s, r) => s + (r.valorFalta || 0), 0);
    const cuenta = (a) => d.filas.filter(r => r.avisos.includes(a)).length;
    const kpi = (t, v, nota, warn) => h('div', { class: 'kpi' + (warn ? ' kpi-warn' : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
    const kpis = h('section', { class: 'kpis', 'data-control': '' },
      kpi('Contados', String(d.filas.length), 'en apertura y cierre'),
      kpi('Se usó', valorUso ? fmtMoney(valorUso) : '—', 'a costo de compra'),
      d.hayAnotado ? kpi('Sin anotar', valorFalta ? fmtMoney(valorFalta) : '$ 0', `${cuenta('faltante')} ${cuenta('faltante') === 1 ? 'producto' : 'productos'}`, cuenta('faltante') > 0)
        : kpi('Revisar conteo', String(cuenta('revisar')), 'quedó más de lo que había', cuenta('revisar') > 0),
      kpi('Pedido después del cierre', d.hayPedido ? `${cuenta('demas') + cuenta('sinUso')} de más` : '—', d.hayPedido ? `${cuenta('corto')} se quedan cortos` : 'todavía no pidió', d.hayPedido && cuenta('corto') > 0));

    // Lo primero para mirar: hasta 5 con aviso, primero los de más plata.
    const top = [...conAviso].sort((a, b) => ORDEN_AVISO.indexOf(a.avisos[0]) - ORDEN_AVISO.indexOf(b.avisos[0]) || (b.valorFalta || b.valorUso || 0) - (a.valorFalta || a.valorUso || 0)).slice(0, 5);
    const bloqueTop = h('section', { class: 'bloque', 'data-bloque': 'mirar' }, h('h2', { class: 'bloque-t', text: 'Para mirar primero' }),
      top.length ? h('ul', { class: 'barras' }, top.map(r => h('li', { class: 'bfila' },
        h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: `${r.p.nombre} · ${lugarDe(r.p)}` }), h('b', { class: 'num', text: `Usó ${n(r.uso)}${u(r.p)}` })),
        h('span', { class: 'bfila-d bfila-mal', text: r.avisos.map(a => AVISO[a].t).join(' · ') + (r.pide > 0 ? ` · pide ${textoPide(r)}` : '') + (r.valorFalta ? ` · ${fmtMoney(r.valorFalta)} sin anotar` : '') }))))
        : h('p', { class: 'sub', text: 'Sin avisos esta semana: lo usado, lo anotado y lo pedido cierran.' }));

    // Por lugar, en el orden del recorrido.
    const porId = new Map(d.filas.map(r => [r.p.id, r]));
    const lugares = porLugar(d.filas.map(r => r.p));
    const segFiltro = h('div', { class: 'seg seg-form ctl-filtro', role: 'tablist', 'aria-label': 'Qué mostrar' },
      [['avisos', `Con aviso · ${conAviso.length}`], ['todo', `Todo · ${d.filas.length}`]].map(([id, t]) => h('button', {
        class: 'seg-b' + (filtro === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': filtro === id ? 'true' : 'false', text: t, 'data-filtro': id,
        on: { click: () => { filtro = id; lsSet('g:ctl-filtro', id); pintar(); } } })));
    const secciones = [...lugares].map(([l, ps]) => {
      const rs = ps.map(p => porId.get(p.id));
      const vis = filtro === 'todo' ? rs : rs.filter(r => r.avisos.length);
      const av = rs.filter(r => r.avisos.length).length;
      const usoL = rs.reduce((s, r) => s + (r.valorUso || 0), 0);
      return h('section', { class: 'ctl-lugar', 'data-lugar': l },
        h('header', { class: 'ctl-lugar-h' }, h('h2', { class: 'ctl-lugar-n', text: l }),
          h('span', { class: 'ctl-lugar-d', text: `${rs.length} ${rs.length === 1 ? 'producto' : 'productos'}${usoL ? ' · usó ' + fmtMoney(usoL) : ''}` }),
          av ? h('span', { class: 'ctl-badge is-revisar', text: `${av} con aviso` }) : h('span', { class: 'ctl-ok' }, icon('check', 14), h('span', { text: 'Cierra' }))),
        vis.length ? vis.map(r => fila(r, d)) : h('p', { class: 'kpi-n ctl-nada', text: 'Todo cierra en este lugar.' }));
    });
    const notaPide = sem.sig ? `Pide = lo pedido entre el cierre (${dia(sem.ci.creado_en)}) y la apertura siguiente (${dia(sem.sig.creado_en)}).`
      : `Pide = lo pedido desde el cierre (${dia(sem.ci.creado_en)}).`;
    mount(cuerpo,
      h('p', { class: 'ctl-sem' }, h('b', { text: `Apertura ${fechaCorta(sem.ap.creado_en)}` }), h('span', { text: sem.ap.encargado ? ` · ${sem.ap.encargado}` : '' }),
        h('span', { 'aria-hidden': 'true', text: '  →  ' }), h('b', { text: `Cierre ${fechaCorta(sem.ci.creado_en)}` }), h('span', { text: sem.ci.encargado ? ` · ${sem.ci.encargado}` : '' })),
      kpis, bloqueTop, segFiltro, ...secciones,
      d.soloUno.length ? h('p', { class: 'kpi-n ctl-pie', text: `${d.soloUno.length} ${d.soloUno.length === 1 ? 'producto se contó' : 'productos se contaron'} solo en uno de los dos conteos y no entran en la cuenta: ${d.soloUno.slice(0, 6).map(x => x.p.nombre).join(', ')}${d.soloUno.length > 6 ? '…' : ''}.` }) : null,
      h('p', { class: 'kpi-n ctl-pie', text: `Se usó = Había + Entró − Quedó. ${d.hayAnotado ? 'Anotado = lo que descontaron las ventas por receta, la producción y la merma. ' : ''}${notaPide}` }));
  }

  async function cargarSemana() {
    const yo = ++pidiendo; const sem = semanas.find(s => s.ap.id === semId);
    zonaSem.querySelectorAll('.chip').forEach(b => b.classList.toggle('is-on', b.getAttribute('data-sem') === semId));
    cuerpo.replaceChildren(esqueleto(3)); datos = null;
    try {
      const [movs, ords] = await Promise.all([movimientosDesde(localId, sem.ap.creado_en), ordenesLocalDesde(localId, sem.ci.creado_en)]);
      if (yo !== pidiendo || !ctx.alive()) return;
      datos = calcularSemana(sem, movs, ords, G.prods, G.precios);
      pintar();
    } catch (e) { if (yo === pidiendo) cuerpo.replaceChildren(banner('No se pudo cargar la semana: ' + mensajeError(e), 'error')); }
  }

  async function cargar() {
    const yo = ++pidiendo;
    zonaSem.replaceChildren(); cuerpo.replaceChildren(esqueleto(3));
    let conteos;
    try { conteos = await listarConteos(localId, 80); } catch (e) {
      if (yo !== pidiendo) return;
      const sinSQL = e && (e.code === '42P01' || /conteos/.test(e.message || ''));
      return cuerpo.replaceChildren(banner(sinSQL ? 'Falta activar Contar: hay que pegar el SQL 0024_conteos.sql en Supabase.' : 'No se pudo cargar: ' + mensajeError(e), sinSQL ? 'warn' : 'error'));
    }
    if (yo !== pidiendo || !ctx.alive()) return;
    if (!hayTipoConteo()) return cuerpo.replaceChildren(banner('Para marcar apertura y cierre falta pegar el SQL 0028_conteo_apertura_cierre.sql en Supabase.', 'warn'));
    semanas = armarSemanas(conteos);
    if (!semanas.length) {
      const ap = [...conteos].find(c => c.tipo === 'apertura');
      return cuerpo.replaceChildren(ap
        ? vacio('Falta el conteo de cierre', `Hay apertura del ${dia(ap.creado_en)}. Cuando el encargado cuente el último día de servicio y marque Cierre, aparece la semana.`)
        : vacio('Todavía no hay una semana para controlar', 'El encargado cuenta el primer día de servicio (Apertura) y el último (Cierre) en Contar. También podés marcarlos en Stock → Conteos.'));
    }
    if (!semanas.some(s => s.ap.id === semId)) semId = semanas[0].ap.id;
    zonaSem.replaceChildren(...semanas.slice(0, 8).map(s => h('button', { class: 'chip' + (s.ap.id === semId ? ' is-on' : ''), type: 'button', 'data-sem': s.ap.id,
      text: `${dia(s.ap.creado_en)} → ${dia(s.ci.creado_en)}`, on: { click: () => { semId = s.ap.id; cargarSemana(); } } })));
    await cargarSemana();
  }

  const locales = chipsLocal((id) => { localId = id; semId = null; cargar(); });
  localId = locales.get();
  mount(root, cab, nav, locales.el, zonaSem, cuerpo);
  await cargar();
}
