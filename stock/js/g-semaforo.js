// Gerencia · Locales (semáforo): los locales en una lista con una luz y un solo número, cuánta plata se fue sin explicar
// esta semana (lunes a hoy), con la misma cuenta de Pérdida (perdida.js: Vendido − Consumo a costo, solo faltantes).
//   % = $ sin explicar / ventas de la semana (rpc tablero). Rojo ≥ 3 %, ámbar ≥ 1 % o si falta algún cierre, verde el resto.
//   Sin ventas, sin cierres o sin costos: "Falta dato" (nunca verde ni 0).
//   El Shopping no se compara contra ventas: "—" y "por retiros" (cuántos retiros, y cuántos sin destino si los hay).
// Tocar un local → su detalle (g-local.js: qué productos explican el número).
import { mount, h, fmtMoney, fmtNum, porTexto, sumarDias, jornadaISO, lsSet, elabora } from './util.js';
import { tablero, hojaRango, movimientosDesde, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, banner, tituloGrande, filaSemaforo } from './ui.js';
import { perdidaSemana, lunesDe } from './perdida.js';

const ROJO = 3, AMBAR = 1;
const pctTx = (x) => fmtNum(Math.round(x * 10) / 10, 1).replace('.', ',') + ' %';
const diaCorto = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };

// Luz de un local: { luz: 'rojo'|'ambar'|'verde'|null, motivo, monto, pct }. Pura (la prueba e2e-decidir la mira por la pantalla).
export function luzDe(r, ventas) {
  if (!r || !r.diasConHoja) return { luz: null, motivo: 'Falta dato: sin cierres esta semana', monto: null, pct: null };
  if (!r.diasConCierre) return { luz: null, motivo: 'Falta dato: no cerró ningún día', monto: null, pct: null };
  if (!r.productos.length && r.sinCosto.length) return { luz: null, motivo: 'Falta dato: cargar costos', monto: null, pct: null };
  if (!(ventas > 0)) return { luz: null, motivo: 'Falta dato: sin ventas cargadas', monto: r.sinExplicar, pct: null };
  const pct = r.sinExplicar / ventas * 100;
  const faltan = r.diasConHoja - r.diasConCierre;
  const luz = pct >= ROJO ? 'rojo' : (pct >= AMBAR || faltan > 0 ? 'ambar' : 'verde');
  const con = r.productos.filter(x => x.valorFalta > 0);
  let motivo = 'Todo al día';
  if (luz === 'rojo' || (luz === 'ambar' && pct >= AMBAR)) {
    const top = con.slice(0, 2);
    const parte = r.sinExplicar > 0 ? top.reduce((s, x) => s + x.valorFalta, 0) / r.sinExplicar * 100 : 0;
    motivo = top.length ? `${top.map(x => x.p.nombre).join(' y ')} ${top.length === 1 ? 'explica' : 'explican'} el ${Math.round(parte)} %` : 'Sin explicar';
  } else if (faltan > 0) motivo = `Falta ${faltan} ${faltan === 1 ? 'cierre' : 'cierres'}`;
  return { luz, motivo, monto: r.sinExplicar, pct };
}

export async function render(root, ctx) {
  const jornada = jornadaISO(), lunes = lunesDe(jornada);
  const sub = `Semana del ${diaCorto(lunes)} al ${diaCorto(sumarDias(lunes, 6))}`;
  mount(root, tituloGrande('Locales', sub), esqueleto(5));
  try { await cargarG(['locales', 'prods', 'precios'], () => {}); } catch (e) { return mount(root, tituloGrande('Locales', sub), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  const locales = G.locales.filter(l => l.activo !== false).sort((a, b) => elabora(b.codigo) - elabora(a.codigo) || porTexto(a.nombre, b.nombre));
  const [y, m, d] = lunes.split('-').map(Number);
  const desdeMovs = new Date(y, m - 1, d, 6).toISOString();
  const datos = await Promise.all(locales.map(async (l) => {
    try {
      const [hoja, movs, tab] = await Promise.all([hojaRango(l.id, lunes, jornada), elabora(l.codigo) ? movimientosDesde(l.id, desdeMovs) : [], elabora(l.codigo) ? tablero(l.id, lunes, jornada).catch(() => null) : null]);
      return { l, hoja: hoja || [], movs: movs || [], tab };
    } catch (e) { return { l, error: e }; }
  }));
  if (!ctx.alive()) return;
  const errores = datos.filter(x => x.error).map(x => mensajeError(x.error));
  const ORDEN = { rojo: 0, ambar: 1, null: 2, verde: 3 };
  const filas = [];
  for (const x of datos) {
    const ir = () => lsSet('g:local', x.l.id);
    if (x.error) { filas.push({ o: 2, el: filaSemaforo({ nombre: x.l.nombre, motivo: 'No cargó: ' + mensajeError(x.error), href: '#/local', onClick: ir, attrs: { 'data-local': x.l.id } }) }); continue; }
    if (!elabora(x.l.codigo)) {
      const ret = x.hoja.filter(r => r.tipo === 'retiro');
      const sinDest = ret.filter(r => !r.otro).length;
      const motivo = !ret.length ? 'Sin retiros anotados esta semana' : sinDest ? `${sinDest} ${sinDest === 1 ? 'retiro sin destino' : 'retiros sin destino'}` : `${ret.length} ${ret.length === 1 ? 'retiro' : 'retiros'}`;
      filas.push({ o: sinDest ? 1 : 2, el: filaSemaforo({ nombre: x.l.nombre, luz: sinDest ? 'ambar' : null, motivo, monto: '—', pie: 'por retiros', href: '#/g-retiros', onClick: ir, attrs: { 'data-local': x.l.id, 'data-luz': sinDest ? 'ambar' : 'retiros' } }) });
      continue;
    }
    const r = perdidaSemana({ hoja: x.hoja, movs: x.movs, desde: lunes, hasta: jornada, prods: G.prods, precios: G.precios });
    const ventas = x.tab && x.tab.actual ? Number(x.tab.actual.ventas) || 0 : 0;
    const s = luzDe(r, ventas);
    filas.push({ o: ORDEN[s.luz], m: s.monto || 0, el: filaSemaforo({ nombre: x.l.nombre, luz: s.luz, motivo: s.motivo, monto: s.monto != null && s.pct != null ? fmtMoney(Math.round(s.monto)) : 'Falta dato',
      pie: s.pct != null ? pctTx(s.pct) : null, href: '#/local', onClick: ir, attrs: { 'data-local': x.l.id, 'data-luz': s.luz || 'falta' } }) });
  }
  filas.sort((a, b) => a.o - b.o || (b.m || 0) - (a.m || 0));
  mount(root, tituloGrande('Locales', sub),
    errores.length ? banner('Parte de los datos no cargó: ' + errores[0], 'warn') : null,
    h('h2', { class: 'lg-t', text: 'Sin explicar esta semana' }),
    h('div', { class: 'sem-lista' }, filas.map(f => f.el)),
    h('p', { class: 'sem-pie', text: 'Sin explicar: lo que se usó de más contra lo vendido, a costo. Rojo desde 3 % de las ventas, ámbar desde 1 % o si falta un cierre.' }));
}
