// Costo por plato (gerencia · Costos). Puro: sin DOM ni Supabase, se prueba con scripts/verify-costos.js.
// Costo de un plato = Σ (cantidad del insumo × precio de la última compra ÷ factor de conversión) ÷ rinde de la receta.
// Si el insumo es un elaborado sin precio propio, se usa el costo de su receta (hasta 4 niveles).
// Precio de venta = promedio de lo cobrado en Núcleo (importe ÷ cantidad) en la ventana elegida: puede incluir IVA.
// Nunca se inventa un número: si falta el precio de un insumo, la receta o las ventas, el plato queda "Falta dato",
// con la lista de lo que falta, fuera del % global y sin sugerencia de precio. Packaging no entra.
export const META = 0.30;
const PROF_MAX = 4;
const num = (x) => { const n = Number(x); return isFinite(n) ? n : 0; };

// receta: { producto_id, rinde, receta_items: [{ insumo_id, cantidad }] }
// cat: { prods: Map id → producto, precios: Map id → precio por unidad de compra, recetas: Map producto_id → receta }
// Devuelve { costo: número | null, ingredientes: [{ insumo_id, nombre, cantidad, unidad, costo | null }], faltan: [texto] }
// (cantidad y costo de cada ingrediente son por plato: ya divididos por el rinde).
export function costoReceta(receta, cat, prof = 0) {
  const faltan = [];
  const ingredientes = [];
  if (!receta || !(receta.receta_items || []).length) return { costo: null, ingredientes, faltan: ['la receta'] };
  const rinde = num(receta.rinde) > 0 ? num(receta.rinde) : 1;
  let total = 0;
  for (const it of receta.receta_items) {
    const ins = cat.prods.get(it.insumo_id);
    const cant = num(it.cantidad);
    const nombre = ins ? ins.nombre : 'Insumo borrado';
    let c = null;
    if (!ins) faltan.push(nombre);
    else if (cat.precios.has(ins.id) && num(cat.precios.get(ins.id)) > 0) c = cant * num(cat.precios.get(ins.id)) / (num(ins.factor_conversion) || 1);
    else if (ins.es_elaborado && cat.recetas.has(ins.id) && prof < PROF_MAX) {
      const sub = costoReceta(cat.recetas.get(ins.id), cat, prof + 1);
      if (sub.costo != null) c = cant * sub.costo; else faltan.push(...sub.faltan.map(f => `${f} (de ${nombre})`));
    } else faltan.push(`precio de ${nombre}`);
    ingredientes.push({ insumo_id: it.insumo_id, nombre, cantidad: cant / rinde, unidad: ins ? (ins.unidad_uso || ins.unidad_compra || '') : '', costo: c == null ? null : c / rinde });
    if (c != null) total += c;
  }
  return { costo: faltan.length ? null : total / rinde, ingredientes, faltan: [...new Set(faltan)] };
}

// Renglones de ventas (ventas_items) → Map producto_id → { cantidad, importe }. Los renglones sin producto o sin
// cantidad no cuentan (devoluciones con cantidad negativa sí restan).
export function ventasPorPlato(items) {
  const m = new Map();
  for (const r of items || []) {
    if (!r || !r.producto_id) continue;
    const q = num(r.cantidad), imp = num(r.importe);
    if (!q && !imp) continue;
    const x = m.get(r.producto_id) || { cantidad: 0, importe: 0 };
    x.cantidad += q; x.importe += imp;
    m.set(r.producto_id, x);
  }
  return m;
}

// Precio sugerido para llegar a la meta: costo ÷ meta, redondeado a $100 hacia arriba (así el % queda en la meta o abajo).
export const precioSugerido = (costo, meta = META) => (costo > 0 && meta > 0 ? Math.ceil(Math.round(costo / meta * 100) / 100 / 100) * 100 : null);

// Ficha de un plato: { costo, precio, ganancia, pct, sugerido, vendidos, ingredientes, faltan }. pct en fracción (0,31).
export function fichaPlato(plato, cat, ventas, meta = META) {
  const r = costoReceta(cat.recetas.get(plato.id), cat);
  const v = ventas && ventas.get(plato.id);
  const faltan = [...r.faltan];
  const precio = v && v.cantidad > 0 && v.importe > 0 ? v.importe / v.cantidad : null;
  if (precio == null) faltan.push('ventas de los últimos días');
  const completo = r.costo != null && precio != null;
  const pct = completo ? r.costo / precio : null;
  return {
    plato, costo: r.costo, precio, ingredientes: r.ingredientes, faltan, completo,
    ganancia: completo ? precio - r.costo : null,
    pct,
    sugerido: completo && pct > meta ? precioSugerido(r.costo, meta) : null,
    vendidos: v ? v.cantidad : 0, importe: v ? v.importe : 0
  };
}

// Resumen de varios platos: % global = Σ (costo × cantidad vendida) ÷ Σ importe, solo con los platos completos.
// { pct | null, cubiertos, total, fichas }.
export function resumenCostos(platos, cat, ventas, meta = META) {
  const fichas = (platos || []).map(p => fichaPlato(p, cat, ventas, meta));
  let costo = 0, importe = 0, cubiertos = 0;
  for (const f of fichas) {
    if (!f.completo) continue;
    cubiertos++;
    costo += f.costo * f.vendidos;
    importe += f.importe;
  }
  return { pct: cubiertos && importe > 0 ? costo / importe : null, cubiertos, total: fichas.length, fichas };
}

// "31 %" (sin decimales) o null.
export const textoPct = (pct) => (pct == null || !isFinite(pct) ? null : Math.round(pct * 100) + ' %');
