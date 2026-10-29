// Funciones puras de Pagos (sin DOM ni red): se prueban en node desde scripts/verify-stock.js.
import { norm } from './util.js';
import { mensajeAviso } from './comprobante.js';

export const soloDigitos = (t) => String(t == null ? '' : t).replace(/\D/g, '');
export const redondear = (n) => Math.round(Number(n) * 100) / 100;

// Proveedor cuyo CUIT (con o sin guiones) coincide con el del comprobante.
export function proveedorPorCuit(provs, cuit) {
  const d = soloDigitos(cuit);
  if (d.length < 8) return null;
  return [...provs].find((p) => soloDigitos(p.cuit) === d) || null;
}

// Similitud 0..1 entre dos razones sociales (coeficiente de Dice sobre bigramas de palabras y de letras).
function bigramas(t) {
  const x = ` ${norm(t).replace(/\b(srl|sa|sas|s r l|s a|sociedad|distribuidora|distrib|de|del|la|el|los|las|y|e|cia|hnos|hermanos)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const out = new Map();
  for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); }
  return out;
}
export function similitud(a, b) {
  const A = bigramas(a), B = bigramas(b);
  let na = 0, nb = 0, comunes = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  if (!na || !nb) return 0;
  for (const [g, v] of A) if (B.has(g)) comunes += Math.min(v, B.get(g));
  return (2 * comunes) / (na + nb);
}
// Los proveedores más parecidos a la razón social del comprobante, del más al menos parecido (umbral 0,3).
export function sugerirProveedores(provs, razonSocial, max = 3) {
  const palabras = norm(razonSocial).split(' ').filter((w) => w.length > 3);
  return [...provs].map((p) => {
    let s = Math.max(similitud(p.nombre, razonSocial), p.razon_social ? similitud(p.razon_social, razonSocial) : 0);
    if (palabras.some((w) => norm(`${p.nombre} ${p.razon_social || ''}`).includes(w))) s = Math.max(s, 0.5); // comparten una palabra significativa
    return { proveedor: p, score: s };
  }).filter((x) => x.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, max);
}

// Una factura que debe menos de $1 cuenta como pagada (el banco transfiere sin centavos).
export const TOLERANCIA = 1;
export const estaPagada = (f) => Number(f.pendiente) < TOLERANCIA;

// Imputación automática: primero la factura cuyo saldo coincide con el pago (±$1), después las más viejas
// (por fecha y número) hasta agotar el monto. facturas: [{id, fecha, numero, pendiente}] → { [id]: monto }
export function imputarAutomatico(monto, facturas) {
  let resto = redondear(monto);
  const out = {};
  const igual = (f) => Math.abs(redondear(f.pendiente) - resto) < TOLERANCIA;
  const orden = [...facturas].filter((f) => !estaPagada(f)).sort((a, b) => (igual(b) - igual(a)) || String(a.fecha).localeCompare(String(b.fecha)) || String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
  for (const f of orden) {
    if (resto <= 0) break;
    const m = Math.min(resto, redondear(f.pendiente));
    if (m > 0) { out[f.id] = m; resto = redondear(resto - m); }
  }
  return out;
}

// Lo que se manda a registrar_pago: { pago, imputaciones, error }
export function validarImputacion(monto, facturas, imputado) {
  const total = redondear(Object.values(imputado).reduce((s, v) => s + (Number(v) || 0), 0));
  for (const f of facturas) {
    const v = Number(imputado[f.id]) || 0;
    if (v < 0) return { error: 'Las imputaciones no pueden ser negativas.', total };
    if (v > redondear(f.pendiente) + 0.005) return { error: `La factura ${f.numero} solo tiene pendiente ${redondear(f.pendiente)}.`, total };
  }
  if (total > redondear(monto) + 0.005) return { error: 'Lo imputado supera el monto del pago.', total };
  return { error: null, total, aCuenta: redondear(monto - total) };
}

export function estadoAviso(pago) { return pago && pago.avisado_en ? 'Avisado' : 'Sin avisar'; }

// Datos para el mensaje de WhatsApp: el pago guardado + la razón social del proveedor.
export function textoAviso(pago, proveedor) {
  return mensajeAviso({ ...pago, monto: pago.monto == null ? null : Number(pago.monto), proveedor_razon_social: proveedor && proveedor.nombre }, proveedor && proveedor.nombre);
}
export function urlWhatsApp(telefono, texto) {
  const d = soloDigitos(telefono);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null;
}
// WhatsApp listo para wa.me: solo dígitos y, si es un número argentino sin código de país (10 dígitos), con 549 adelante.
export function whatsappAR(t) {
  let d = soloDigitos(t).replace(/^0+/, '');
  if (d.length === 10) d = '549' + d;
  return d;
}
export const emailValido = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t || '').trim());
export function urlMail(email, asunto, texto) {
  const e = String(email || '').trim();
  return emailValido(e) ? `mailto:${e}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}` : null;
}
// A dónde va el aviso de pago: los datos de cobranzas y, si están vacíos, los de pedidos.
export const whatsappPagos = (prov) => (prov && (prov.whatsapp_pagos || prov.whatsapp)) || null;
export const emailPagos = (prov) => (prov && (prov.email_pagos || prov.email)) || null;

export const nombreArchivoSeguro = (n) => String(n || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'archivo';
export const rutaPago = (proveedorId, op) => `pagos/${proveedorId}/${nombreArchivoSeguro(op || String(Date.now()))}.pdf`;
export const rutaFactura = (proveedorId, nombre) => `facturas/${proveedorId}/${Date.now()}-${nombreArchivoSeguro(nombre)}`;

export const fechaDMA = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

// ===== Tipo de comprobante y gasto en compras =====
export const TIPOS_COMPROBANTE = ['Factura A', 'Factura B', 'Factura C', 'Recibo X', 'Otro'];
// Lo que leyó la IA ("FACTURA A", "X", "Remito X", "Documento no válido como factura"…) → uno de TIPOS_COMPROBANTE, o '' si no dice.
export function tipoComprobante(texto) {
  const t = norm(texto);
  if (!t) return '';
  if (/\bx\b|no valido como factura|recibo|presupuesto/.test(t)) return 'Recibo X';
  const m = t.match(/factura\s*([abc])\b|\b([abc])\b/);
  if (m) return 'Factura ' + (m[1] || m[2]).toUpperCase();
  return /factura/.test(t) ? '' : 'Otro';
}
// Número para un Recibo X que no trae número (la base pide uno por proveedor): X-AAAAMMDD-hhmmss.
export const numeroReciboX = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `X-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Agrupa y ordena de mayor a menor: [{ clave, total, n, pct }].
function agrupar(lista, clave, total) {
  const m = new Map();
  for (const g of lista) { const k = clave(g); const x = m.get(k) || { clave: k, total: 0, n: 0 }; x.total += Number(g.total) || 0; x.n++; m.set(k, x); }
  return [...m.values()].map((x) => ({ ...x, total: redondear(x.total), pct: total > 0 ? x.total / total : 0 })).sort((a, b) => b.total - a.total || String(a.clave).localeCompare(String(b.clave)));
}
// Resumen del gasto de un período. gastos: filas de la vista gastos_compras (pueden incluir el período anterior).
// tipo: 'todo' | 'factura' (todo menos Recibo X) | 'x' (solo Recibo X).
export function resumenGasto(gastos, desde, hasta, ant, tipo = 'todo') {
  const pasa = (g) => tipo === 'todo' || (tipo === 'x' ? g.es_x : !g.es_x);
  const del = (a, b) => gastos.filter((g) => pasa(g) && g.fecha >= a && g.fecha <= b);
  const lista = del(desde, hasta);
  const suma = (l, f = (g) => g.total) => redondear(l.reduce((s, g) => s + (Number(f(g)) || 0), 0));
  const total = suma(lista);
  const totalPrev = ant ? suma(del(ant.desde, ant.hasta)) : 0;
  const conX = gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta);
  const x = suma(conX.filter((g) => g.es_x));
  return {
    hay: lista.length > 0, n: lista.length, total, totalPrev,
    variacion: totalPrev > 0 ? (total - totalPrev) / totalPrev : null,
    conFactura: redondear(suma(conX) - x), reciboX: x, totalAmbos: suma(conX),
    pagado: suma(lista, (g) => Math.min(Number(g.imputado) || 0, Number(g.total) || 0)),
    pendiente: suma(lista, (g) => g.pendiente), vencido: suma(lista.filter((g) => g.vencida), (g) => g.pendiente),
    nVencidas: lista.filter((g) => g.vencida).length,
    porRazon: agrupar(lista, (g) => g.local_id ? g.razon_social : 'Sin local asignado', total),
    porLocal: agrupar(lista, (g) => g.local || 'Sin local asignado', total),
    porProveedor: agrupar(lista, (g) => g.proveedor || 'Proveedor', total),
    porCategoria: agrupar(lista, (g) => g.categoria || 'Sin categoría', total),
    ultimos: [...lista].sort((a, b) => String(b.creado_en || b.fecha).localeCompare(String(a.creado_en || a.fecha))).slice(0, 8)
  };
}
