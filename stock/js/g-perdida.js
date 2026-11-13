// Gerencia · Stock → Control → Pérdida: cuánto se perdió en $ esta semana en el local (perdida.js), qué productos lo
// explican y la semana anterior; abajo, los productos clave (~80 % del costo consumido en 4 semanas, máximo 15).
// Es una propuesta: no cambia la hoja del encargado ni qué cuenta. Sin cierres o sin costos dice "Falta cargar".
import { mount, h, fmtMoney, cantU, jornadaISO, sumarDias } from './util.js';
import { hojaRango, movimientosDesde, sinHojaSQL, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, toast, banner, subnav, SUBNAV_STOCK, listaGrupo, filaLista } from './ui.js';
import { perdidaSemana, hayPerdida, lunesDe, consumo4Semanas, productosClave, CLAVE_TOPE } from './perdida.js';
import { VENTANA } from './sugerido.js';

const TOP = 5;
const dm = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d}/${m}`; };
const cant = (q, p) => cantU(q, p.unidad_uso);
const nProd = (n) => (n === 1 ? '1 producto' : `${n} productos`);
const listaNombres = (xs, n = 4) => xs.slice(0, n).map(x => x.p.nombre).join(', ') + (xs.length > n ? ` y ${xs.length - n} más` : '');

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Pérdida de la semana' }),
    h('p', { class: 'sub', text: 'A costo de compra' }));
  const nav = subnav(SUBNAV_STOCK, 'perdida');
  mount(root, cab, nav, esqueleto(4));
  try { await cargarG(['prods', 'locales', 'precios']); } catch (e) { toast('No se pudo cargar: ' + mensajeError(e), 'error'); }
  if (!ctx.alive()) return;

  const cuerpo = h('div', { class: 'perd' });
  let localId = null, pidiendo = 0;

  function pintar(hoja, movs) {
    const hoy = jornadaISO(), lunes = lunesDe(hoy), lunesAnt = sumarDias(lunes, -7);
    const base = { hoja, movs, prods: G.prods, precios: G.precios };
    const esta = perdidaSemana({ ...base, desde: lunes, hasta: hoy });
    const ant = perdidaSemana({ ...base, desde: lunesAnt, hasta: sumarDias(lunes, -1) });
    const con = hayPerdida(esta);

    // ---- el número de la semana ----
    const nSin = esta.productos.filter(x => x.falta > 0).length, nMer = esta.productos.filter(x => x.merma > 0).length;
    const filasSemana = [
      filaLista({ texto: 'Pérdida', sub: con ? null : 'Sin cierres esta semana', valor: con ? fmtMoney(esta.total) : 'Falta cargar', clase: 'perd-total' + (!con ? ' is-falta' : esta.total > 0 ? ' is-perdida' : ''), attrs: { 'data-perdida': 'total' } }),
      con ? filaLista({ texto: 'Sin explicar', sub: esta.diasConCierre ? `Faltante no anotado · ${nProd(nSin)}` : 'Faltan cierres para calcularlo',
        valor: esta.diasConCierre ? fmtMoney(esta.sinExplicar) : 'Falta cargar', attrs: { 'data-perdida': 'sin-explicar' } }) : null,
      con ? filaLista({ texto: 'Merma anotada', sub: `Se tiró y se anotó · ${nProd(nMer)}`, valor: fmtMoney(esta.merma), attrs: { 'data-perdida': 'merma' } }) : null,
      filaLista({ texto: 'Semana anterior', sub: `${dm(lunesAnt)} al ${dm(sumarDias(lunes, -1))}`, valor: hayPerdida(ant) ? fmtMoney(ant.total) : 'Sin historial todavía', attrs: { 'data-perdida': 'anterior' } })
    ];
    const pieSemana = [con ? `Del lunes ${dm(lunes)} a hoy · ${esta.diasConCierre === 1 ? '1 día' : esta.diasConCierre + ' días'} con cierre.` : `Del lunes ${dm(lunes)} a hoy.`,
      esta.sinCosto.length ? `Falta cargar costos: ${listaNombres(esta.sinCosto)}.` : ''].filter(Boolean).join(' ');
    const gSemana = listaGrupo('Esta semana', filasSemana, { clase: 'perd-semana', pie: pieSemana });

    // ---- los productos que más pesan ----
    const top = esta.productos.filter(x => x.valor > 0).slice(0, TOP);
    const gTop = top.length ? listaGrupo('Lo que más pesa', top.map(x => filaLista({ texto: x.p.nombre,
      sub: [x.falta > 0 ? `Faltan ${cant(x.falta, x.p)}` : null, x.merma > 0 ? `Merma ${cant(x.merma, x.p)}` : null].filter(Boolean).join(' · '),
      valor: fmtMoney(x.valor), clase: 'perd-prod', attrs: { 'data-prod': x.p.id } })), { clase: 'perd-top' }) : null;

    // ---- productos clave: ~80 % del costo consumido en 4 semanas ----
    const cons = consumo4Semanas({ movs, hoja, hoy, prods: G.prods, precios: G.precios });
    const pk = productosClave({ cons, prods: G.prods, precios: G.precios, localId });
    const perdidaDe = new Map(esta.productos.map(x => [x.p.id, x.valor]));
    let gClave;
    if (!pk.hayHistorial) gClave = listaGrupo('Productos clave', [filaLista({ texto: 'Sin historial todavía', sub: `Se calcula con lo consumido en ${VENTANA / 7} semanas.`, attrs: { 'data-clave': 'sin-historial' } })], { clase: 'perd-clave' });
    else {
      const filas = pk.clave.map(x => filaLista({ texto: x.p.nombre,
        sub: perdidaDe.get(x.p.id) > 0 ? `Pérdida esta semana ${fmtMoney(perdidaDe.get(x.p.id))}` : 'Sin pérdida esta semana',
        valor: fmtMoney(x.valor), clase: 'perd-prod', attrs: { 'data-clave': x.p.id } }));
      if (pk.sinCosto.length) filas.push(filaLista({ texto: 'Falta cargar costos', sub: listaNombres(pk.sinCosto), valor: nProd(pk.sinCosto.length), clase: 'perd-sincosto', attrs: { 'data-clave': 'falta-costo' } }));
      const pct = pk.total > 0 ? Math.round(pk.acum / pk.total * 100) : 0;
      gClave = listaGrupo('Productos clave', filas, { clase: 'perd-clave',
        pie: pk.clave.length ? `${nProd(pk.clave.length)} = ${pct} % del costo consumido en ${VENTANA / 7} semanas${pk.clave.length >= CLAVE_TOPE ? ' (máximo ' + CLAVE_TOPE + ')' : ''}.` : null });
    }
    mount(cuerpo, gSemana, gTop, gClave);
  }

  async function cargar() {
    const yo = ++pidiendo;
    cuerpo.replaceChildren(esqueleto(3));
    const hoy = jornadaISO(), desde = sumarDias(hoy, -VENTANA);
    const [y, m, d] = desde.split('-').map(Number);
    try {
      const [hoja, movs] = await Promise.all([hojaRango(localId, desde, hoy), movimientosDesde(localId, new Date(y, m - 1, d, 6).toISOString())]);
      if (yo !== pidiendo || !ctx.alive()) return;
      pintar(hoja || [], movs || []);
    } catch (e) {
      if (yo !== pidiendo) return;
      cuerpo.replaceChildren(banner(sinHojaSQL(e) ? 'Falta activar la hoja por sector: hay que pegar el SQL 0031_hoja_sector.sql en Supabase.' : 'No se pudo cargar: ' + mensajeError(e), sinHojaSQL(e) ? 'warn' : 'error'));
    }
  }

  const locales = chipsLocal((id) => { localId = id; cargar(); });
  localId = locales.get();
  mount(root, cab, nav, locales.el, cuerpo);
  await cargar();
}
