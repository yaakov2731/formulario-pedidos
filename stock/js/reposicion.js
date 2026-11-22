// Reposición por días que abre el local (cierre y compras, 0032). Funciones puras, sin plata (el encargado nunca la ve): se prueban en Node con
// scripts/verify-reposicion.js y las usan la Hoja (resultado del cierre), Pedir, Comprar y Lo que hay.
//   Uso por día abierto = consumo (salidas de stock o la hoja: apertura + entró − devolví − cierre) ÷ días que abrió.
//   Rojo: lo que quedó no alcanza para la próxima apertura. Amarillo: alcanza para abrir pero no para los días que abre esa
//   semana. Verde: alcanza. Gris: sin historial suficiente (nunca se inventa un número).
//   Pedir = uso × días que abre la semana − lo que quedó − lo pedido sin recibir, redondeado hacia arriba al bulto.
import { sumarDias, norm, esBulto, factorDe } from './util.js';
import { FERIADOS_SET } from './feriados.js';
import { MIN_DIAS, MIN_DIAS_HOJA } from './sugerido.js';

export const DIAS_DEFECTO = [5, 6, 0]; // viernes, sábado y domingo (lo mismo que el default de 0032)
const dow = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
export const diasDe = (local) => (local && Array.isArray(local.dias_abre) ? local.dias_abre.map(Number) : DIAS_DEFECTO);
const feriadosOk = (f) => (f && typeof f.has === 'function' ? f : FERIADOS_SET);

// ¿El local abre ese día? Los feriados abren salvo que el local diga que no (abre_feriados = false).
export function abreEl(iso, local, feriados) {
  if (!(local && local.abre_feriados === false) && feriadosOk(feriados).has(String(iso).slice(0, 10))) return true;
  return diasDe(local).includes(dow(iso));
}

// La próxima vez que abre, contando desde mañana: { fecha, dias } (dias = 1 es mañana) o null si no abre en dos semanas.
export function proximaApertura(hoyISO, local, feriados) {
  for (let d = 1; d <= 14; d++) { const f = sumarDias(hoyISO, d); if (abreEl(f, local, feriados)) return { fecha: f, dias: d }; }
  return null;
}

// Cuántos días abre entre `desde` (incluido) y los n días siguientes.
export function diasAbiertos(desde, n = 7, local, feriados) {
  let c = 0;
  for (let i = 0; i < n; i++) if (abreEl(sumarDias(desde, i), local, feriados)) c++;
  return c;
}

// Último día que abrió antes de hoy (el cierre que se espera ver a la mañana).
export function ultimaApertura(hoyISO, local, feriados) {
  for (let d = 1; d <= 14; d++) { const f = sumarDias(hoyISO, -d); if (abreEl(f, local, feriados)) return f; }
  return null;
}

// Uso por día abierto de un producto o null sin historial suficiente. cons: salida de consumoPorProducto (sugerido.js).
// La hoja ya cuenta solo días con apertura y cierre (días abiertos). Las salidas de stock se reparten entre los días que
// abrió el local desde la primera salida. Con las dos fuentes se toma la mayor (como el sugerido).
export function usoPorDiaAbierto(cons, { hoy, local, feriados } = {}) {
  if (!cons) return null;
  const vals = [];
  const m = cons.mov;
  if (m && m.dias >= MIN_DIAS && hoy) {
    const desde = m.desde || sumarDias(hoy, -m.dias);
    let n = 0;
    for (let f = desde; f < hoy; f = sumarDias(f, 1)) if (abreEl(f, local, feriados)) n++;
    if (n > 0) vals.push(m.total / n);
  }
  const hj = cons.hoja;
  if (hj && hj.span >= MIN_DIAS && hj.dias >= MIN_DIAS_HOJA) vals.push(hj.total / hj.dias);
  return vals.length ? Math.max(...vals) : null;
}

// Estado de un producto: { c: 'rojo' | 'amar' | 'verde' | 'gris', dias } (dias: para cuántos días abiertos alcanza).
export function estadoProducto({ quedan, uso, diasSemana }) {
  if (uso === null || uso === undefined || !isFinite(uso)) return { c: 'gris', dias: null };
  const q = Math.max(0, Number(quedan) || 0);
  if (!(uso > 0)) return { c: 'verde', dias: null };
  const dias = q / uso;
  if (q < uso - 1e-9) return { c: 'rojo', dias };
  if (q < uso * Math.max(1, diasSemana || 0) - 1e-9) return { c: 'amar', dias };
  return { c: 'verde', dias };
}

// Cuánto pedir en la unidad del pedido (bultos si se compra por bulto), o null sin historial.
export function pedir({ uso, diasSemana, quedan = 0, pendiente = 0, factor = 1 }) {
  if (uso === null || uso === undefined || !isFinite(uso)) return null;
  const f = factor > 0 ? factor : 1;
  const falta = uso * Math.max(1, diasSemana || 0) - Math.max(0, Number(quedan) || 0) - (Number(pendiente) || 0) * f;
  if (!(falta > 1e-9)) return 0;
  return Math.ceil(falta / f - 1e-9);
}

// Plan de un local: para cada producto que se compra, estado y cuánto pedir. quedan: Map id → lo que hay (unidad de uso);
// cons: Map id → consumo (sugerido.js); pend: Map id → pedido sin recibir (bultos). Los elaborados y la carta no se compran.
export function planLocal({ prods, quedan, cons, pend, local, hoy, feriados }) {
  const prox = proximaApertura(hoy, local, feriados);
  const diasSemana = diasAbiertos(prox ? prox.fecha : sumarDias(hoy, 1), 7, local, feriados);
  const items = new Map();
  for (const p of prods || []) {
    if (p.es_elaborado || p.activo === false || p.categoria === 'Carta') continue;
    const uso = usoPorDiaAbierto(cons && cons.get(p.id), { hoy, local, feriados });
    const q = quedan && quedan.has(p.id) ? Number(quedan.get(p.id)) || 0 : 0;
    const pendiente = pend ? Number(pend.get(p.id)) || 0 : 0;
    const e = estadoProducto({ quedan: q, uso, diasSemana });
    const n = pedir({ uso, diasSemana, quedan: q, pendiente, factor: esBulto(p) ? factorDe(p) : 1 });
    items.set(p.id, { c: e.c, dias: e.dias, uso, pedir: n, quedan: q, pendiente });
  }
  return { prox, diasSemana, items };
}

// Apertura precargada: lo que quedó en el último cierre más lo que se recibió después. Map id → cantidad.
// ultimoCierre: Map id → cantidad; recepciones: [{producto_id, cantidad}] o Map id → cantidad.
export function aperturaSugerida(ultimoCierre, recepcionesPosteriores) {
  const out = new Map(ultimoCierre || []);
  const recs = recepcionesPosteriores instanceof Map ? [...recepcionesPosteriores].map(([producto_id, cantidad]) => ({ producto_id, cantidad })) : (recepcionesPosteriores || []);
  for (const r of recs) {
    const q = Number(r.cantidad) || 0;
    if (!(q > 0)) continue;
    out.set(r.producto_id, Math.round(((out.get(r.producto_id) || 0) + q) * 1000) / 1000);
  }
  return out;
}

// Los últimos n cierres reales de cada producto (sumando sectores del mismo día): Map id → [{fecha, cantidad}] del más viejo al último.
export function ultimosCierres(hoja, n = 8) {
  const m = new Map();
  for (const r of hoja || []) {
    if (r.tipo !== 'cierre') continue;
    const f = String(r.fecha).slice(0, 10);
    if (!m.has(r.producto_id)) m.set(r.producto_id, new Map());
    const x = m.get(r.producto_id);
    x.set(f, (x.get(f) || 0) + (Number(r.cantidad) || 0));
  }
  const out = new Map();
  for (const [id, x] of m) out.set(id, [...x].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-n).map(([fecha, cantidad]) => ({ fecha, cantidad: Math.round(cantidad * 1000) / 1000 })));
  return out;
}

// Fecha del último cierre de la hoja (o null) y lo contado ese día: Map id → cantidad.
export function ultimoCierreDe(hoja) {
  let fecha = null;
  for (const r of hoja || []) if (r.tipo === 'cierre' && (!fecha || String(r.fecha) > fecha)) fecha = String(r.fecha).slice(0, 10);
  const q = new Map();
  if (fecha) for (const r of hoja) if (r.tipo === 'cierre' && String(r.fecha).slice(0, 10) === fecha) q.set(r.producto_id, (q.get(r.producto_id) || 0) + (Number(r.cantidad) || 0));
  return { fecha, q };
}

// ¿Qué locales hicieron el cierre de su último día abierto? hojaPorLocal: Map local_id → filas de hoja_movs.
// Devuelve [{ local, esperada, hecho }] (sin los locales dados de baja).
export function cierresDeAnoche(hojaPorLocal, locales, jornada, feriados) {
  return (locales || []).filter(l => l.activo !== false).map(l => {
    const esperada = ultimaApertura(jornada, l, feriados);
    const filas = (hojaPorLocal && hojaPorLocal.get(l.id)) || [];
    const hecho = !!esperada && filas.some(r => r.tipo === 'cierre' && String(r.fecha).slice(0, 10) >= esperada);
    return { local: l, esperada, hecho };
  });
}

// Los productos son por local: para comparar entre locales se agrupan por nombre y unidad (sin acentos ni mayúsculas).
export const clavePorNombre = (p) => norm(p.nombre) + '|' + norm(p.unidad_uso || p.unidad_compra || '');

// "< 1 día", "1 día", "4 días" o '—'.
export const textoAlcanza = (dias) => (dias === null || dias === undefined || !isFinite(dias) ? '—' : dias < 1 ? '< 1 día' : Math.floor(dias) + (Math.floor(dias) === 1 ? ' día' : ' días'));
