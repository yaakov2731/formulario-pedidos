// Compras de gerencia · lógica sin pantalla (se prueba sola en scripts/e2e-recibir.js).
//   * Un solo estado visible por orden: Para aprobar → Para enviar → Enviado → Recibido / Llegó incompleto.
//     Mapea los estados de la base (borrador, aprobada, enviada, parcial, recibida) sin tocarla.
//   * Faltante de una orden recibida: lo pedido menos lo que llegó (lo que «No vino» y lo que llegó de menos).
//   * Texto corto para reclamar el faltante al proveedor por WhatsApp.
//   * Suba de precio: contra el último precio pagado del mismo producto y proveedor (tabla precios, que guarda cada cambio).
import { fmtNum, fmtMoney, plural } from './util.js';

export const ESTADO_COMPRA = {
  aprobar: { texto: 'Para aprobar', clase: 'estado-borrador' },
  enviar: { texto: 'Para enviar', clase: 'estado-aprobada' },
  enviado: { texto: 'Enviado', clase: 'estado-enviada' },
  incompleto: { texto: 'Llegó incompleto', clase: 'estado-incompleto' },
  recibido: { texto: 'Recibido', clase: 'estado-recibida' },
  cancelado: { texto: 'Cancelado', clase: 'estado-cancelada' }
};
// Orden de avance: un envío con órdenes en distintos estados muestra el más atrasado.
const AVANCE = ['aprobar', 'enviar', 'enviado', 'incompleto', 'recibido', 'cancelado'];

// Lo que faltó de cada ítem pedido. Solo cuenta lo ya recibido (parcial o recibida); lo agregado al recibir no falta.
export function faltantesDe(o) {
  if (!o || !['parcial', 'recibida'].includes(o.estado)) return [];
  return (o.orden_items || []).filter(i => !i.agregado && !i.excluido).map(i => {
    const pedido = Number(i.cantidad_pedida) || 0, llego = Number(i.cantidad_recibida) || 0;
    return { item: i, producto_id: i.producto_id, pedido, llego, falta: Math.round((pedido - llego) * 1000) / 1000 };
  }).filter(x => x.falta > 0);
}

export function estadoCompra(o) {
  const e = o && o.estado;
  if (e === 'borrador') return 'aprobar';
  if (e === 'aprobada') return 'enviar';
  if (e === 'enviada') return 'enviado';
  if (e === 'parcial') return 'incompleto';
  if (e === 'recibida') return faltantesDe(o).length ? 'incompleto' : 'recibido';
  return 'cancelado';
}
export function estadoDeVarias(os) {
  const ks = (os || []).map(estadoCompra);
  return AVANCE.find(k => ks.includes(k)) || 'aprobar';
}
export const textoEstado = (k) => (ESTADO_COMPRA[k] || ESTADO_COMPRA.aprobar).texto;
export const claseEstado = (k) => 'estado ' + (ESTADO_COMPRA[k] || ESTADO_COMPRA.aprobar).clase;

// "Hola Juan! Del pedido de *Docks del Puerto* del 27/10 para Umo Grill (factura SUMA ACTIVA S.A.) faltó: ..."
// filas: [{ nombre, unidad, pedido, llego, falta }]. Sin razón social cargada, no la nombra (no se inventa).
export function textoReclamo({ proveedor, contacto, local, razon, fecha, filas }) {
  const f = fecha ? new Date(fecha) : null;
  const dia = f && !Number.isNaN(f.getTime()) ? ` del ${f.getDate()}/${f.getMonth() + 1}` : '';
  const u = (x, n) => (x.unidad ? ' ' + plural(x.unidad, n) : '');
  const lineas = (filas || []).map(x => `- ${x.nombre}: pedido ${fmtNum(x.pedido, 3)}${u(x, x.pedido)}, llegó ${fmtNum(x.llego, 3)}, falta ${fmtNum(x.falta, 3)}${u(x, x.falta)}`);
  return [`Hola ${contacto || proveedor || ''}! Del pedido de *Docks del Puerto*${dia} para ${local}${razon ? ` (factura ${razon})` : ''} faltó:`,
    ...lineas, '¿Lo pueden mandar en la próxima entrega? Gracias.'].join('\n');
}

// Más de 5 % arriba del precio anterior → { pct, previo }. Sin precio anterior o sin precio nuevo → null.
export const UMBRAL_SUBA = 5;
export function subaPrecio(nuevo, previo) {
  const n = Number(nuevo), p = Number(previo);
  if (nuevo == null || previo == null || !(n > 0) || !(p > 0)) return null;
  const pct = (n / p - 1) * 100;
  return pct > UMBRAL_SUBA ? { pct: Math.round(pct), previo: p } : null;
}
export const textoSuba = (s) => `Subió ${s.pct} % (antes ${fmtMoney(s.previo)})`;

const clave = (r) => `${r.fecha || ''}|${r.creado_en || ''}`;
// Filas de precios de un producto: las del mismo proveedor y las cargadas sin proveedor (catálogo). Las de otro proveedor no se comparan.
const delProveedor = (rows, productoId, proveedorId) => rows.filter(r => r.producto_id === productoId && (!r.proveedor_id || !proveedorId || r.proveedor_id === proveedorId));
// Último precio anterior a `antes` (fila de precios) o el último de todos.
export function ultimoPrecio(rows, productoId, proveedorId, antes = null) {
  const lista = delProveedor(rows || [], productoId, proveedorId).filter(r => !antes || clave(r) < clave(antes)).sort((a, b) => clave(b).localeCompare(clave(a)));
  return lista.length ? Number(lista[0].precio) : null;
}
// Subas pagadas desde `desde` (aaaa-mm-dd): una por producto (la más reciente que subió), de mayor a menor.
export function subasRecientes(rows, desde) {
  const pagados = (rows || []).filter(r => String(r.fecha || '').slice(0, 10) >= desde && ['recepcion', 'factura'].includes(r.origen))
    .sort((a, b) => clave(b).localeCompare(clave(a)));
  const vistos = new Set(), out = [];
  for (const r of pagados) {
    if (vistos.has(r.producto_id)) continue;
    const s = subaPrecio(r.precio, ultimoPrecio(rows, r.producto_id, r.proveedor_id, r));
    if (s) vistos.add(r.producto_id);
    if (s) out.push({ producto_id: r.producto_id, proveedor_id: r.proveedor_id, fecha: String(r.fecha).slice(0, 10), precio: Number(r.precio), ...s });
  }
  return out.sort((a, b) => b.pct - a.pct);
}
