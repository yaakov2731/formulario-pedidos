// Pedido sugerido (fase 4 del rediseño). Funciones puras: se prueban en Node con scripts/verify-sugerido.js.
//   Pedir = consumo diario promedio (últimas 4 semanas) × (días hasta la próxima entrega + 1 de colchón)
//           − lo que queda − lo pedido sin recibir; redondeado hacia arriba al bulto (o a la unidad si no hay bulto).
// El consumo sale de lo que ya se anota: salidas de stock (ventas de Núcleo por receta, uso de cocina, retiros y pérdidas)
// y la hoja por sector (apertura + entró − devolví − cierre). Sin unas 2 semanas de datos del producto no se sugiere nada.
import { aISO, sumarDias, esBulto, factorDe, esFlorida, esMartin } from './util.js';

export const VENTANA = 28;        // últimas 4 semanas
export const MIN_DIAS = 14;       // menos de ~2 semanas de datos: "Sin historial todavía"
export const MIN_DIAS_HOJA = 7;   // y al menos 7 días con apertura y cierre contados
export const COLCHON = 1;         // un día de colchón
const SALIDAS = ['venta', 'produccion_consumo', 'merma', 'uso_dia'];
const ABIERTAS = ['borrador', 'aprobada', 'enviada', 'parcial'];
export const DIAS_PENDIENTE = 21; // lo pedido hace más de 3 semanas y nunca recibido no se cuenta

const dia = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const diasEntre = (desdeISO, hastaISO) => Math.round((dia(hastaISO) - dia(desdeISO)) / 864e5);
const diaLocal = (ts) => (/^\d{4}-\d{2}-\d{2}$/.test(String(ts)) ? String(ts) : aISO(new Date(ts)));

// Lo consumido por producto en las 4 semanas anteriores a hoy (hoy no cuenta: el día no terminó).
// movs: [{producto_id, tipo, cantidad, creado_en}]  hoja: [{fecha, sector, producto_id, tipo, cantidad}]
// Devuelve Map producto_id → { mov: {total, dias} | null, hoja: {total, dias, span} | null }
export function consumoPorProducto({ movs = [], hoja = [], hoy }) {
  const desde = sumarDias(hoy, -VENTANA);
  const out = new Map();
  const de = (id) => { if (!out.has(id)) out.set(id, { mov: null, hoja: null }); return out.get(id); };
  // 1) Salidas de stock: el período corre desde la primera salida del producto en la ventana.
  const primera = new Map(), total = new Map();
  for (const m of movs) {
    if (!SALIDAS.includes(m.tipo) || !(Number(m.cantidad) < 0)) continue;
    const d = diaLocal(m.creado_en);
    if (d < desde || d >= hoy) continue;
    total.set(m.producto_id, (total.get(m.producto_id) || 0) - Number(m.cantidad));
    if (!primera.has(m.producto_id) || d < primera.get(m.producto_id)) primera.set(m.producto_id, d);
  }
  for (const [id, t] of total) de(id).mov = { total: t, dias: diasEntre(primera.get(id), hoy) };
  // 2) Hoja por sector: solo los días con apertura y cierre del producto en ese sector.
  const celdas = new Map();
  for (const r of hoja) {
    const f = String(r.fecha || '').slice(0, 10);
    if (f < desde || f >= hoy) continue;
    const k = f + '|' + r.sector + '|' + r.producto_id;
    if (!celdas.has(k)) celdas.set(k, { f, id: r.producto_id, ap: null, ci: null, en: 0, dv: 0 });
    const c = celdas.get(k), q = Number(r.cantidad) || 0;
    if (r.tipo === 'apertura') c.ap = q; else if (r.tipo === 'cierre') c.ci = q;
    else if (r.tipo === 'entro') c.en += q; else if (r.tipo === 'devolvi') c.dv += q;
  }
  const porProd = new Map();
  for (const c of celdas.values()) {
    if (c.ap === null || c.ci === null) continue;
    if (!porProd.has(c.id)) porProd.set(c.id, { total: 0, fechas: new Set() });
    const x = porProd.get(c.id);
    x.total += Math.max(0, c.ap + c.en - c.dv - c.ci);
    x.fechas.add(c.f);
  }
  for (const [id, x] of porProd) {
    const fs = [...x.fechas].sort();
    de(id).hoja = { total: x.total, dias: fs.length, span: diasEntre(fs[0], hoy) };
  }
  return out;
}

// Consumo diario del producto o null si no hay historial suficiente. Con las dos fuentes se toma la mayor:
// miden lo mismo y una puede quedar corta (lo que no se vende por Núcleo no aparece en las salidas).
export function consumoDiario(c) {
  if (!c) return null;
  const vals = [];
  if (c.mov && c.mov.dias >= MIN_DIAS) vals.push(c.mov.total / c.mov.dias);
  if (c.hoja && c.hoja.span >= MIN_DIAS && c.hoja.dias >= MIN_DIAS_HOJA) vals.push(c.hoja.total / c.hoja.dias);
  return vals.length ? Math.max(...vals) : null;
}

// Lo pedido y todavía sin recibir, por producto, en la unidad del pedido (bultos). Sin lo excluido ni lo que "no vino".
export function pendientePorProducto(ordenes, hoy) {
  const desde = sumarDias(hoy, -DIAS_PENDIENTE);
  const out = new Map();
  for (const o of ordenes || []) {
    if (!ABIERTAS.includes(o.estado) || diaLocal(o.creado_en) < desde) continue;
    for (const i of o.orden_items || []) {
      if (i.excluido || i.no_vino) continue;
      const falta = Math.max(0, Number(i.cantidad_pedida || 0) - Number(i.cantidad_recibida || 0));
      if (falta > 0) out.set(i.producto_id, (out.get(i.producto_id) || 0) + falta);
    }
  }
  return out;
}

// ---- Entregas y cortes ----
// Todos entregan al día siguiente del corte del miércoles (llega el jueves). Florida además acepta jueves y viernes
// para el sábado. De Ridder cierra a las 12 h del día hábil anterior a la entrega (miércoles 12 h).
// Devuelve { esta, siguiente, dias, corte }: la entrega de este pedido, la del pedido siguiente, los días que el pedido
// tiene que cubrir (hasta la entrega siguiente) y el texto corto del corte.
const JUEVES = 4;
const proximoDow = (iso, dow) => { const n = (dow - dia(iso).getDay() + 7) % 7 || 7; return sumarDias(iso, n); }; // el próximo, nunca el mismo día
export function entregaDe(nombreProv, ahora = new Date()) {
  const hoy = aISO(ahora), dow = ahora.getDay(), hora = ahora.getHours();
  const deRidder = esMartin(nombreProv), florida = esFlorida(nombreProv);
  const abierta = dow >= 1 && dow <= 3 && !(deRidder && dow === 3 && hora >= 12);
  let esta, corte;
  if (abierta) {
    esta = proximoDow(hoy, JUEVES);
    corte = deRidder ? (dow === 3 ? 'Cierra hoy 12 h' : 'Cierra el miércoles 12 h') : (dow === 3 ? 'Cierra hoy' : 'Cierra el miércoles');
  } else if (florida && (dow === 4 || dow === 5)) {
    esta = proximoDow(hoy, 6);
    corte = dow === 5 ? 'Cierra hoy · llega el sábado' : 'Hasta el viernes · llega el sábado';
  } else {
    // Pasado el corte: entra en la tanda de la semana que viene (el miércoles a la tarde, el jueves de la otra semana).
    esta = proximoDow(dow === 3 ? sumarDias(hoy, 1) : hoy, JUEVES);
    corte = (dow === 0 || dow === 6) ? (deRidder ? 'Cierra el miércoles 12 h' : 'Cierra el miércoles') : 'Para la semana próxima';
  }
  // El pedido tiene que alcanzar hasta que llegue el pedido siguiente (el jueves después de esta entrega).
  const siguiente = proximoDow(esta, JUEVES);
  return { esta, siguiente, dias: diasEntre(hoy, siguiente), corte };
}

// ---- La cuenta ----
// Devuelve el número a pedir en la unidad del pedido, o null sin historial suficiente.
export function pedirSugerido({ diario, dias, quedan = 0, pendiente = 0, factor = 1 }) {
  if (diario === null || diario === undefined || !isFinite(diario)) return null;
  const f = factor > 0 ? factor : 1;
  const falta = diario * (dias + COLCHON) - Math.max(0, Number(quedan) || 0) - (Number(pendiente) || 0) * f;
  if (!(falta > 1e-9)) return 0;
  return Math.ceil(falta / f - 1e-9);
}

// Sugerido de cada producto del local. prods: catálogo; stock: Map id → lo que queda (unidad de uso);
// cons: salida de consumoPorProducto; pend: salida de pendientePorProducto; provs: Map id → {nombre}.
// Devuelve Map id → número (0 o más) o null (sin historial). Los elaborados no se sugieren (no se compran).
export function sugerencias({ prods, stock, cons, pend, provs, ahora = new Date() }) {
  const out = new Map(), porProv = new Map();
  for (const p of prods || []) {
    if (p.es_elaborado || p.activo === false) continue;
    const pv = p.proveedor_id && provs && provs.get(p.proveedor_id);
    const k = pv ? pv.nombre : '';
    if (!porProv.has(k)) porProv.set(k, entregaDe(k, ahora).dias);
    const factor = esBulto(p) ? factorDe(p) : 1;
    out.set(p.id, pedirSugerido({ diario: consumoDiario(cons && cons.get(p.id)), dias: porProv.get(k), quedan: stock ? stock.get(p.id) : 0, pendiente: pend ? pend.get(p.id) : 0, factor }));
  }
  return out;
}
