// Gerencia · Stock → Retiros (Shopping): qué salió del depósito, a dónde fue y quién lo retiró (0031_hoja_sector.sql).
// En el Shopping no se compara contra ventas: el control es por retiro y destino.
//   Por destino: cuánto se llevó cada destino y cuánto cuesta (a costo de compra).
//   Por producto: total retirado y a qué destinos fue.
//   Control del depósito: Apertura + Entró (recepciones) − Retiros − Merma − Cierre = Sin retiro anotado
//     (lo que falta en el depósito y nadie anotó). Usa la primera apertura y el último cierre del período.
import { mount, h, fmtNum, fmtMoney, porTexto, factorDe, plural, jornadaISO, sumarDias, elabora } from './util.js';
import { hojaRango, movimientosDesde, sinHojaSQL, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, banner, subnav, SUBNAV_STOCK } from './ui.js';

const r3 = (x) => Math.round(x * 1000) / 1000;
const VISTAS = [['destino', 'Por destino'], ['producto', 'Por producto'], ['deposito', 'Control del depósito']];

export function periodos(hoy = jornadaISO()) {
  const [y, m] = hoy.split('-').map(Number);
  const pad = (x) => String(x).padStart(2, '0');
  const ini = `${y}-${pad(m)}-01`;
  const antIni = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
  return [['semana', 'Últimos 7 días', sumarDias(hoy, -6), hoy], ['mes', 'Este mes', ini, hoy], ['anterior', 'Mes anterior', antIni, sumarDias(ini, -1)]];
}

// Control del depósito por producto. movs: hoja_movs del período; recs: movimientos (recepciones) desde el inicio.
export function controlDeposito(movs, recs, prods, precios) {
  const porProd = new Map();
  for (const m of movs) { if (!porProd.has(m.producto_id)) porProd.set(m.producto_id, []); porProd.get(m.producto_id).push(m); }
  const out = [];
  for (const [pid, ms] of porProd) {
    const p = prods.get(pid); if (!p) continue;
    const aps = ms.filter(m => m.tipo === 'apertura'), cis = ms.filter(m => m.tipo === 'cierre');
    const ret = (desde, hasta) => ms.filter(m => m.tipo === 'retiro' && m.fecha >= desde && m.fecha <= hasta).reduce((s, m) => s + Number(m.cantidad), 0);
    if (!aps.length || !cis.length) { out.push({ p, completo: false, retiros: ret('0000', '9999'), falta: aps.length ? 'cierre' : 'apertura' }); continue; }
    const fAp = aps.map(m => m.fecha).sort()[0];
    const fCi = cis.map(m => m.fecha).sort().reverse()[0];
    if (fCi < fAp) { out.push({ p, completo: false, retiros: ret('0000', '9999'), falta: 'cierre' }); continue; }
    const ap = aps.filter(m => m.fecha === fAp).reduce((s, m) => s + Number(m.cantidad), 0);
    const ci = cis.filter(m => m.fecha === fCi).reduce((s, m) => s + Number(m.cantidad), 0);
    const tAp = Math.min(...aps.filter(m => m.fecha === fAp).map(m => Date.parse(m.creado_en)));
    const tCi = Math.max(...cis.filter(m => m.fecha === fCi).map(m => Date.parse(m.creado_en)));
    const entro = recs.filter(m => m.producto_id === pid && m.tipo === 'recepcion' && Date.parse(m.creado_en) > tAp && Date.parse(m.creado_en) < tCi).reduce((s, m) => s + Number(m.cantidad), 0);
    const merma = ms.filter(m => m.tipo === 'merma' && m.fecha >= fAp && m.fecha <= fCi).reduce((s, m) => s + Number(m.cantidad), 0);
    const retiros = ret(fAp, fCi);
    const sinAnotar = r3(ap + entro - retiros - merma - ci);
    const pu = precios.get(pid) ? precios.get(pid) / factorDe(p) : null;
    out.push({ p, completo: true, ap, entro, retiros, merma, ci, sinAnotar, valor: pu != null && sinAnotar > 0 ? sinAnotar * pu : null, fAp, fCi });
  }
  return out.sort((a, b) => (b.valor || 0) - (a.valor || 0) || porTexto(a.p.nombre, b.p.nombre));
}

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Retiros' }),
    h('p', { class: 'sub', text: 'Qué salió del depósito, a dónde fue y quién lo retiró. Sin comparar contra ventas.' }));
  const nav = subnav(SUBNAV_STOCK, 'g-retiros');
  mount(root, cab, nav, esqueleto(4));
  try { await cargarG(['prods', 'locales', 'precios']); } catch (e) { toast('No se pudo cargar: ' + mensajeError(e), 'error'); }
  if (!ctx.alive()) return;

  const hayShopping = G.locales.some(l => l.activo && !elabora(l.codigo));
  let localId = null, per = 'mes', vista = 'destino', movs = [], recs = [], pidiendo = 0;
  const zonaPer = h('div', { class: 'chips gs-fechas', role: 'group', 'aria-label': 'Período' });
  const zonaVista = h('div', { class: 'seg seg-form gr-vistas', role: 'tablist', 'aria-label': 'Cómo verlo' });
  const cuerpo = h('div', { class: 'gs' });
  const n = (x) => fmtNum(x, 2) || '0';
  const cantP = (p, x) => `${n(x)}${p && p.unidad_uso ? ' ' + plural(p.unidad_uso, x) : ''}`;
  const precioU = (p) => (G.precios.get(p.id) ? G.precios.get(p.id) / factorDe(p) : null);

  function pintar() {
    zonaPer.replaceChildren(...periodos().map(([id, t]) => h('button', { class: 'chip' + (per === id ? ' is-on' : ''), type: 'button', 'data-per': id, text: t, on: { click: () => { per = id; cargar(); } } })));
    zonaVista.replaceChildren(...VISTAS.map(([id, t]) => h('button', { class: 'seg-b' + (vista === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': vista === id ? 'true' : 'false', 'data-vista': id, text: t,
      on: { click: () => { vista = id; pintar(); } } })));
    const ret = movs.filter(m => m.tipo === 'retiro' && G.prods.get(m.producto_id));
    const total = ret.reduce((s, m) => s + Number(m.cantidad) * (precioU(G.prods.get(m.producto_id)) || 0), 0);
    const ctrl = controlDeposito(movs, recs, G.prods, G.precios);
    const sinAnotar = ctrl.reduce((s, r) => s + (r.valor || 0), 0);
    const porDest = new Map();
    for (const m of ret) { const d = m.otro || 'Sin destino'; if (!porDest.has(d)) porDest.set(d, []); porDest.get(d).push(m); }
    const valorDe = (ms) => ms.reduce((s, m) => s + Number(m.cantidad) * (precioU(G.prods.get(m.producto_id)) || 0), 0);
    const destinos = [...porDest].map(([d, ms]) => ({ d, ms, valor: valorDe(ms) })).sort((a, b) => b.valor - a.valor || porTexto(a.d, b.d));
    const kpi = (t, v, nota, warn) => h('div', { class: 'kpi' + (warn ? ' kpi-warn' : '') }, h('span', { class: 'kpi-t', text: t }), h('b', { class: 'kpi-v num', text: v }), nota ? h('span', { class: 'kpi-n', text: nota }) : null);
    const kpis = h('section', { class: 'kpis gs-kpis' },
      kpi('Retirado', total ? fmtMoney(total) : '$ 0', 'a costo de compra'),
      kpi('Destino que más gasta', destinos[0] ? destinos[0].d : '—', destinos[0] && destinos[0].valor ? fmtMoney(destinos[0].valor) : null),
      kpi('Sin retiro anotado', sinAnotar ? fmtMoney(sinAnotar) : '$ 0', 'falta en el depósito', sinAnotar > 0),
      kpi('Retiros anotados', String(ret.length), null));

    let tabla;
    if (!movs.length) tabla = vacio('Sin retiros en el período', 'Cuando el encargado anote retiros en su celular (Retiros → Nuevo retiro), aparecen acá.');
    else if (vista === 'destino') {
      tabla = h('div', { class: 'gs-tabla-w' }, h('table', { class: 'gs-tabla gr-tabla' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Destino' }), h('th', { scope: 'col', text: 'Qué se llevó' }), h('th', { scope: 'col', class: 'is-calc', text: 'Total $' }), h('th', { scope: 'col', class: 'is-calc', text: '% del total' }))),
        h('tbody', {}, destinos.map(x => {
          const pp = new Map(); for (const m of x.ms) pp.set(m.producto_id, (pp.get(m.producto_id) || 0) + Number(m.cantidad));
          const txt = [...pp].map(([pid, c]) => ({ p: G.prods.get(pid), c })).sort((a, b) => porTexto(a.p.nombre, b.p.nombre)).map(({ p, c }) => `${p.nombre} ${cantP(p, c)}`).join(' · ');
          return h('tr', { 'data-destino': x.d }, h('td', {}, h('b', { text: x.d })), h('td', { class: 'gr-que', text: txt }),
            h('td', { class: 'num is-calc', text: x.valor ? fmtMoney(x.valor) : '—' }), h('td', { class: 'num is-calc', text: total ? Math.round(x.valor / total * 100) + ' %' : '—' }));
        }))));
    } else if (vista === 'producto') {
      const pp = new Map(); for (const m of ret) { if (!pp.has(m.producto_id)) pp.set(m.producto_id, []); pp.get(m.producto_id).push(m); }
      const rows = [...pp].map(([pid, ms]) => ({ p: G.prods.get(pid), ms, c: ms.reduce((s, m) => s + Number(m.cantidad), 0), valor: valorDe(ms) })).sort((a, b) => b.valor - a.valor || porTexto(a.p.nombre, b.p.nombre));
      tabla = h('div', { class: 'gs-tabla-w' }, h('table', { class: 'gs-tabla gr-tabla' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Producto' }), h('th', { scope: 'col', text: 'Retirado' }), h('th', { scope: 'col', text: 'A dónde fue' }), h('th', { scope: 'col', class: 'is-calc', text: 'Total $' }))),
        h('tbody', {}, rows.map(r => {
          const dd = new Map(); for (const m of r.ms) dd.set(m.otro || 'Sin destino', (dd.get(m.otro || 'Sin destino') || 0) + Number(m.cantidad));
          return h('tr', { 'data-prod': r.p.id }, h('td', {}, h('b', { text: r.p.nombre })), h('td', { class: 'num', text: cantP(r.p, r.c) }),
            h('td', { class: 'gr-que', text: [...dd].map(([d, c]) => `${d} ${n(c)}`).join(' · ') }), h('td', { class: 'num is-calc', text: r.valor ? fmtMoney(r.valor) : '—' }));
        }))));
    } else {
      tabla = h('div', { class: 'gs-tabla-w' }, h('table', { class: 'gs-tabla' },
        h('thead', {}, h('tr', {}, ['Producto', 'Apertura', '+ Entró', '− Retiros', '✕ Merma', 'Cierre'].map(t => h('th', { scope: 'col', text: t })), h('th', { scope: 'col', class: 'is-calc', text: 'Sin retiro anotado' }), h('th', { scope: 'col', class: 'is-calc', text: '$' }))),
        h('tbody', {}, ctrl.map(r => h('tr', { 'data-prod': r.p.id, class: r.sinAnotar > 0 ? 'is-mal' : null }, h('td', {}, h('b', { text: r.p.nombre }), h('small', { text: ' ' + (r.p.unidad_uso || '') })),
          r.completo ? [h('td', { class: 'num', text: n(r.ap) }), h('td', { class: 'num', text: n(r.entro) }), h('td', { class: 'num', text: n(r.retiros) }), h('td', { class: 'num', text: n(r.merma) }), h('td', { class: 'num', text: n(r.ci) }),
            h('td', { class: 'num is-calc' + (r.sinAnotar > 0 ? ' is-neg' : ' is-ok'), text: n(r.sinAnotar) }), h('td', { class: 'num is-calc' + (r.valor ? ' is-neg' : ''), text: r.valor ? fmtMoney(r.valor) : '—' })]
            : [h('td', { class: 'num', text: '—' }), h('td', { class: 'num', text: '—' }), h('td', { class: 'num', text: n(r.retiros) }), h('td', { class: 'num', text: '—' }), h('td', { class: 'num', text: '—' }),
              h('td', { class: 'is-calc gs-falta', colspan: 2, text: `Falta contar la ${r.falta} del depósito` })])))));
    }
    mount(cuerpo, kpis, zonaVista, tabla,
      h('p', { class: 'kpi-n gs-pie', text: vista === 'deposito'
        ? 'Sin retiro anotado = Apertura + Entró (recepciones) − Retiros − Merma − Cierre, entre la primera apertura y el último cierre del período. No se compara contra ventas.'
        : 'Lo anota el encargado del Shopping en Retiros. El costo sale del último precio de compra.' }));
  }

  async function cargar() {
    const yo = ++pidiendo; cuerpo.replaceChildren(esqueleto(3));
    const [, , desde, hasta] = periodos().find(p => p[0] === per);
    try {
      const [hm, mv] = await Promise.all([hojaRango(localId, desde, hasta), movimientosDesde(localId, new Date(sumarDias(desde, -1) + 'T00:00:00').toISOString())]);
      if (yo !== pidiendo || !ctx.alive()) return;
      movs = hm || []; recs = (mv || []).filter(m => m.tipo === 'recepcion');
      pintar();
    } catch (e) {
      if (yo !== pidiendo) return;
      cuerpo.replaceChildren(banner(sinHojaSQL(e) ? 'Falta activar los retiros: hay que pegar el SQL 0031_hoja_sector.sql en Supabase.' : 'No se pudo cargar: ' + mensajeError(e), sinHojaSQL(e) ? 'warn' : 'error'));
    }
  }

  const locales = chipsLocal((id) => { localId = id; cargar(); }, hayShopping ? (l) => !elabora(l.codigo) : null);
  localId = locales.get();
  mount(root, cab, nav, locales.el, zonaPer, cuerpo);
  pintar();
  await cargar();
}
