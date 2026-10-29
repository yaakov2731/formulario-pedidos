// Cálculos de Ventas · Resumen (sin DOM, para poder probarlos): todos los locales juntos, desglose por local, por día y ranking de productos.
// Los datos son renglones de ventas_items (local_id, fecha, codigo_origen, nombre_origen, cantidad, importe) y pedidos de ventas_pedidos.
import { norm, sumarDias } from './util.js';

const r2 = (n) => Math.round(n * 100) / 100;

// Locales que venden (gastronomía), en el orden fijo que define su color. Un local con ventas que no esté acá va después.
export const ORDEN_VENTA = ['UMO', 'TRE', 'BRK', 'GEL'];
// Paleta categórica para fondo oscuro (validada: banda de luminosidad, separación para daltonismo y contraste ≥ 3:1).
// Sin naranja para no confundir un local con el acento de la app. El color sigue al local, nunca al puesto en el ranking.
export const COLORES = ['#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9'];
export const COLOR_OTRO = '#8a7f77';

// Locales a mostrar, en orden fijo, con su color: los de venta activos y cualquier otro que tenga ventas en los datos.
export function localesVenta(locales, items = []) {
  const conVentas = new Set(items.map(i => i.local_id));
  const pos = (l) => { const i = ORDEN_VENTA.indexOf(l.codigo); return i < 0 ? 99 : i; };
  const lista = locales.filter(l => (l.activo && ORDEN_VENTA.includes(l.codigo)) || conVentas.has(l.id))
    .slice().sort((a, b) => pos(a) - pos(b) || String(a.nombre).localeCompare(String(b.nombre)));
  return lista.map((l, i) => ({ id: l.id, nombre: l.nombre, codigo: l.codigo, color: COLORES[i] || COLOR_OTRO }));
}

// Mismo largo inmediatamente antes: 1–30 oct → 1–30 sep (30 días antes).
export function periodoAnterior(desde, hasta) {
  const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5) + 1;
  return { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1), dias };
}

export function diasEntre(desde, hasta) {
  const out = [];
  for (let d = desde; d <= hasta && out.length < 400; d = sumarDias(d, 1)) out.push(d);
  return out;
}

const enRango = (f, desde, hasta) => f >= desde && f <= hasta;

// items: renglones de ventas_items de [anterior.desde, hasta]; pedidos: de [desde, hasta]. locales: salida de localesVenta.
export function resumen(items, pedidos, locales, desde, hasta) {
  const ant = periodoAnterior(desde, hasta);
  const act = items.filter(i => enRango(i.fecha, desde, hasta));
  const prev = items.filter(i => enRango(i.fecha, ant.desde, ant.hasta));
  const imp = (i) => Number(i.importe) || 0;
  const cant = (i) => Number(i.cantidad) || 0;

  const total = r2(act.reduce((s, i) => s + imp(i), 0));
  const totalPrev = r2(prev.reduce((s, i) => s + imp(i), 0));
  const unidades = act.reduce((s, i) => s + cant(i), 0);
  const peds = pedidos.filter(p => enRango(p.fecha, desde, hasta));

  const porLocal = locales.map(l => {
    const xs = act.filter(i => i.local_id === l.id);
    const t = r2(xs.reduce((s, i) => s + imp(i), 0));
    const dias = new Set(xs.map(i => i.fecha)).size;
    const pl = peds.filter(p => p.local_id === l.id).length;
    return { ...l, total: t, unidades: xs.reduce((s, i) => s + cant(i), 0), dias, promDia: dias ? t / dias : 0, pedidos: pl,
      prev: r2(prev.filter(i => i.local_id === l.id).reduce((s, i) => s + imp(i), 0)), pct: total > 0 ? t / total : 0 };
  });

  const porDia = diasEntre(desde, hasta).map(f => {
    const xs = act.filter(i => i.fecha === f);
    const partes = locales.map(l => ({ id: l.id, total: r2(xs.filter(i => i.local_id === l.id).reduce((s, i) => s + imp(i), 0)) })).filter(p => p.total);
    return { fecha: f, total: r2(partes.reduce((s, p) => s + p.total, 0)), partes };
  });
  const diasConVentas = porDia.filter(d => d.total).length;

  // Ticket promedio solo con los locales que subieron el detalle por pedido (el resto no trae pedidos).
  const locConPed = new Set(peds.map(p => p.local_id));
  const totalConPed = act.filter(i => locConPed.has(i.local_id)).reduce((s, i) => s + imp(i), 0);

  return { desde, hasta, anterior: ant, total, totalPrev, variacion: totalPrev > 0 ? (total - totalPrev) / totalPrev : null,
    unidades, diasConVentas, promDia: diasConVentas ? total / diasConVentas : 0,
    nPedidos: peds.length, ticket: peds.length ? totalConPed / peds.length : null,
    porLocal, porDia, sinVentas: porLocal.filter(l => !l.total).map(l => l.nombre), hay: act.length > 0 };
}

// Ranking de productos del período. Agrupa por nombre (sin acentos ni mayúsculas): el mismo producto en dos locales suma.
// por: 'cantidad' | 'importe'. localId null = todos los locales.
export function ranking(items, desde, hasta, { localId = null, por = 'cantidad' } = {}) {
  const m = new Map();
  for (const i of items) {
    if (!enRango(i.fecha, desde, hasta) || (localId && i.local_id !== localId)) continue;
    const nombre = String(i.nombre_origen || i.codigo_origen || '').trim();
    if (!nombre) continue;
    const k = norm(nombre);
    const a = m.get(k) || { k, nombre, cantidad: 0, total: 0, locales: new Map() };
    const c = Number(i.cantidad) || 0; const t = Number(i.importe) || 0;
    a.cantidad += c; a.total += t;
    const pl = a.locales.get(i.local_id) || { cantidad: 0, total: 0 };
    pl.cantidad += c; pl.total += t; a.locales.set(i.local_id, pl);
    m.set(k, a);
  }
  const lista = [...m.values()].map(a => ({ ...a, total: r2(a.total) }));
  const base = lista.reduce((s, a) => s + (por === 'importe' ? a.total : a.cantidad), 0);
  return lista
    .sort((a, b) => (por === 'importe' ? b.total - a.total || b.cantidad - a.cantidad : b.cantidad - a.cantidad || b.total - a.total) || a.nombre.localeCompare(b.nombre))
    .map(a => ({ ...a, pct: base > 0 ? (por === 'importe' ? a.total : a.cantidad) / base : 0 }));
}
