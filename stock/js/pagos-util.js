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

// Imputación automática: las facturas más viejas primero (por fecha y número) hasta agotar el monto.
// facturas: [{id, fecha, numero, pendiente}] → { [id]: monto }
export function imputarAutomatico(monto, facturas) {
  let resto = redondear(monto);
  const out = {};
  const orden = [...facturas].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
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
