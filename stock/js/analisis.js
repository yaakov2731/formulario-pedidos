// Cálculos del análisis de ventas (sin DOM, para poder probarlos). Los datos vienen de ventas_pedidos (con sus pagos) y ventas_items.

const r2 = (n) => Math.round(n * 100) / 100;

// Hora (0-23) en horario argentino (UTC-3, sin horario de verano) de un instante ISO.
export function horaAR(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t - 3 * 3600 * 1000).getUTCHours();
}
export function minutosAR(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const d = new Date(t - 3 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function agrupar(filas, clave, valor) {
  const m = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (k === null || k === undefined || k === '') continue;
    const a = m.get(k) || { k, total: 0, cantidad: 0 };
    a.total += valor(f); a.cantidad += Number(f.cantidad) || 0;
    m.set(k, a);
  }
  return [...m.values()].map(a => ({ ...a, total: r2(a.total) })).sort((a, b) => b.total - a.total);
}
const conPct = (lista, base) => lista.map(a => ({ ...a, pct: base > 0 ? a.total / base : 0 }));

export function analizar(pedidos = [], items = []) {
  const prodPorPedido = new Map(); const itemsPorPedido = new Map();
  for (const it of items) {
    if (it.pedido_numero === null || it.pedido_numero === undefined) continue;
    prodPorPedido.set(it.pedido_numero, (prodPorPedido.get(it.pedido_numero) || 0) + (Number(it.importe) || 0));
    if (!itemsPorPedido.has(it.pedido_numero)) itemsPorPedido.set(it.pedido_numero, []);
    itemsPorPedido.get(it.pedido_numero).push(it);
  }
  const totalProductos = r2(items.reduce((s, i) => s + (Number(i.importe) || 0), 0));
  const hayPagos = pedidos.some(p => (p.ventas_pedido_pagos || []).length > 0);
  const cobradoDe = (p) => (p.ventas_pedido_pagos || []).reduce((s, g) => s + Number(g.monto), 0);
  const totalCobrado = hayPagos ? r2(pedidos.reduce((s, p) => s + cobradoDe(p), 0)) : null;
  const total = totalCobrado !== null ? totalCobrado : totalProductos;
  const nPedidos = pedidos.length || prodPorPedido.size;
  const valorPedido = (p) => (prodPorPedido.has(p.numero) ? prodPorPedido.get(p.numero) : Number(p.total) || 0);

  // medios de pago
  const pagoMap = new Map();
  for (const p of pedidos) for (const g of (p.ventas_pedido_pagos || [])) {
    const a = pagoMap.get(g.forma_pago) || { k: g.forma_pago, total: 0, pedidos: new Set() };
    a.total += Number(g.monto); a.pedidos.add(p.numero); pagoMap.set(g.forma_pago, a);
  }
  const porPago = conPct([...pagoMap.values()].map(a => ({ k: a.k, total: r2(a.total), cantidad: a.pedidos.size })).sort((a, b) => b.total - a.total), totalCobrado || 0);

  // franja horaria (por pedido, a su hora)
  const horas = new Map();
  for (const p of pedidos) {
    const h = p.fecha_hora ? horaAR(p.fecha_hora) : null;
    if (h === null) continue;
    const a = horas.get(h) || { hora: h, total: 0, pedidos: 0 };
    a.total += valorPedido(p); a.pedidos++; horas.set(h, a);
  }
  const porHora = [...horas.values()].map(a => ({ ...a, total: r2(a.total) })).sort((a, b) => a.hora - b.hora);

  const porSector = conPct(agrupar(items.filter(i => i.sector), i => i.sector, i => Number(i.importe) || 0), totalProductos);
  const porTipo = conPct(agrupar(items.filter(i => i.tipo_pedido), i => i.tipo_pedido, i => Number(i.importe) || 0), totalProductos);
  const porRubro = conPct(agrupar(items, i => i.rubro, i => Number(i.importe) || 0), totalProductos);
  const top = agrupar(items, i => i.codigo_origen || i.nombre_origen, i => Number(i.importe) || 0)
    .map(a => ({ ...a, nombre: (items.find(i => (i.codigo_origen || i.nombre_origen) === a.k) || {}).nombre_origen || a.k }))
    .sort((a, b) => b.cantidad - a.cantidad || b.total - a.total);

  const mozos = pedidos.filter(p => p.mozo);
  const porMozo = mozos.length ? conPct(agrupar(mozos, p => p.mozo, p => valorPedido(p)).map(a => ({ ...a, cantidad: mozos.filter(p => p.mozo === a.k).length })), total) : [];

  // pedidos a $0 con sus productos
  const ceros = [];
  for (const p of pedidos) {
    const prods = itemsPorPedido.get(p.numero) || [];
    const sinCobro = hayPagos && !(p.ventas_pedido_pagos || []).length;
    if (prods.length && (r2(prodPorPedido.get(p.numero) || 0) === 0 || sinCobro)) {
      ceros.push({ numero: p.numero, hora: p.fecha_hora ? horaAR(p.fecha_hora) : null, minutos: p.fecha_hora ? minutosAR(p.fecha_hora) : null,
        sector: p.sector, tipo: p.tipo_pedido, fecha: p.fecha, productos: prods.map(i => ({ nombre: i.nombre_origen, cantidad: Number(i.cantidad) || 0, importe: Number(i.importe) || 0 })),
        unidades: prods.reduce((s, i) => s + (Number(i.cantidad) || 0), 0) });
    }
  }

  // cobrado contra productos, pedido por pedido
  let conDif = 0, sumaDif = 0; const difs = [];
  if (hayPagos) {
    for (const p of pedidos) {
      if (!prodPorPedido.has(p.numero)) continue;
      const c = cobradoDe(p); const d = r2(c - prodPorPedido.get(p.numero));
      if (d !== 0 && c > 0) { conDif++; sumaDif += d; difs.push({ numero: p.numero, dif: d, sector: p.sector, tipo: p.tipo_pedido }); }
    }
  }
  difs.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));

  return {
    hayPedidos: pedidos.length > 0, hayItems: items.length > 0, hayPagos,
    total, totalProductos, totalCobrado, nPedidos, ticket: nPedidos ? total / nPedidos : 0,
    unidades: items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0),
    porPago, porHora, porSector, porTipo, porRubro, porMozo, top, ceros,
    diferencia: totalCobrado === null || !items.length ? null : { cobrado: totalCobrado, productos: totalProductos, dif: r2(totalCobrado - totalProductos), pedidosConDif: conDif, sumaDif: r2(sumaDif), mayores: difs.slice(0, 5) }
  };
}
