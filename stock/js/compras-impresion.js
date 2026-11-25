// Compras de gerencia · consolidado de pedidos e impresión profesional (A4 horizontal).
//   * consolidar(): suma los pedidos de los locales por producto (mismo código del proveedor, o mismo nombre y unidad,
//     como en "Por proveedor"), con la cantidad de cada local. No inventa pesos ni bultos: la unidad va tal cual.
//   * documento(): una hoja imprimible. El encabezado (título, razón social, fecha del pedido, responsable, fecha de
//     impresión) va dentro del <thead> de la tabla, así el navegador lo repite arriba de cada hoja; el pie
//     "Página N de M" lo pone @page en stock.css. Cada documento arranca en hoja nueva.
//   * Responsable: solo lo que dicen las órdenes (ordenes_compra.cargado_por_nombre = quién cargó el pedido). Quién
//     aprobó no se guarda: queda una línea para firmar, nunca un nombre inventado.
import { h, norm, fmtNum, groupBy, porTexto } from './util.js';
import { G, nombreLocal, razonLocal } from './datos.js';

export const VIVAS = ['borrador', 'aprobada'];
export const SIN = '__sin__';

const prodDe = (id) => G.prods.get(id) || null;
export const nombreProd = (id) => { const p = prodDe(id); return p ? p.nombre : 'Producto'; };
export const unidadProd = (id) => { const p = prodDe(id); return (p && p.unidad_compra) || ''; };
// Código del proveedor: productos.codigo_proveedor o, en el mayorista, LOCAL-DS-<código de su lista> (-B si se repetía).
export const codProv = (id) => { const p = prodDe(id) || {}; if (p.codigo_proveedor) return p.codigo_proveedor; const m = /^[A-Z]{3}-DS-(.+?)(-B)?$/.exec(p.codigo || ''); return m ? m[1] : ''; };
export const nombreProv = (id) => (id && id !== SIN && G.provs.get(id) ? G.provs.get(id).nombre : 'Sin proveedor');
export const claveProd = (id) => (codProv(id) || norm(nombreProd(id))) + '|' + norm(unidadProd(id));
export const localesDe = (os) => [...new Set(os.map(o => o.local_id))].sort((a, b) => porTexto(nombreLocal(a), nombreLocal(b)));

// Filas por producto: { clave, producto_id, nombre, unidad, cod, total, porLocal: Map(local_id → cantidad), pares: [{ o, it }] }.
// fuera(it) → true deja el ítem afuera (destildado en "Por proveedor").
export function consolidar(os, fuera = () => false) {
  const m = new Map();
  for (const o of os) for (const it of o.orden_items || []) {
    if (fuera(it)) continue;
    const k = claveProd(it.producto_id);
    const x = m.get(k) || { clave: k, producto_id: it.producto_id, nombre: nombreProd(it.producto_id), unidad: unidadProd(it.producto_id), cod: codProv(it.producto_id), total: 0, porLocal: new Map(), pares: [] };
    const n = Number(it.cantidad_pedida) || 0;
    x.total += n;
    x.porLocal.set(o.local_id, (x.porLocal.get(o.local_id) || 0) + n);
    x.pares.push({ o, it });
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => porTexto(a.nombre, b.nombre));
}

// ---------- textos del encabezado ----------
const dd = (d) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
// Fecha del pedido: la de las órdenes ("21/11/2026" o "19/11/2026 al 21/11/2026").
export function rangoFechas(os) {
  const ds = os.map(o => new Date(o.creado_en)).filter(d => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
  if (!ds.length) return '';
  const a = dd(ds[0]), b = dd(ds[ds.length - 1]);
  return a === b ? a : `${a} al ${b}`;
}
// "Lucas (Umo Grill) · Angelica (Trento Café)". Vacío si ninguna orden dice quién la cargó.
export function quienesPidieron(os) {
  return [...groupBy(os.filter(o => o.cargado_por_nombre), o => o.local_id)]
    .sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0])))
    .map(([lid, l]) => `${[...new Set(l.map(o => o.cargado_por_nombre))].join(', ')} (${nombreLocal(lid)})`).join(' · ');
}
// "SUMA ACTIVA S.A. · CUIT … (Umo Grill, Trento Café) · SPMAR S.A. (Shopping)". Sin razón social cargada, no la nombra.
export function razonesDe(os) {
  return [...groupBy(os, o => razonLocal(o.local_id) || '')].filter(([r]) => r).sort((a, b) => porTexto(a[0], b[0])).map(([r, l]) => {
    const loc = G.locales.find(x => x.razon_social === r && x.cuit);
    return `${r}${loc ? ' · CUIT ' + loc.cuit : ''} (${[...new Set(l.map(o => nombreLocal(o.local_id)))].sort(porTexto).join(', ')})`;
  }).join(' · ');
}
export const facturaDe = (razon) => {
  if (!razon) return '';
  const l = G.locales.find(x => x.razon_social === razon && x.cuit);
  return 'Facturar a ' + razon + (l ? ' · CUIT ' + l.cuit : '');
};
const impreso = () => new Date().toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// ---------- una hoja imprimible ----------
// datos: [[rótulo, valor]]; valor vacío → línea para completar a mano. columnas: [{ t, clase }].
export function documento({ marca, titulo, sub, datos, columnas, filas, despues = [], clase = '' }) {
  const n = columnas.length;
  const cab = h('div', { class: 'pr-head' },
    h('div', { class: 'pr-head-t' },
      h('p', { class: 'pr-marca', text: marca }),
      h('h1', { class: 'pr-t', text: titulo }),
      sub ? h('p', { class: 'pr-sub', text: sub }) : null),
    h('dl', { class: 'pr-datos' }, datos.map(([k, v]) => h('div', { class: 'pr-dato' },
      h('dt', { text: k }), v ? h('dd', { text: v }) : h('dd', { class: 'pr-firma', 'aria-label': 'para completar' })))));
  return h('section', { class: 'pr-prov', 'data-doc': clase },
    h('table', { class: 'pr-tabla' },
      h('thead', {},
        h('tr', { class: 'pr-run' }, h('th', { colspan: String(n) }, cab)),
        h('tr', { class: 'pr-cols' }, columnas.map(c => h('th', { class: c.clase || '', text: c.t })))),
      h('tbody', {}, filas)),
    despues);
}
const celdaProd = (x) => h('td', { class: 'pr-prod' }, x.cod ? h('span', { class: 'pr-cod', text: x.cod }) : null, h('span', { text: x.nombre }));
const celdasLocales = (x, locs) => locs.map(lid => { const v = x.porLocal.get(lid); return h('td', { class: 'pr-num pr-loc' + (v ? '' : ' pr-cero'), text: v ? fmtNum(v, 3) : '—' }); });

// Hoja de armado por producto: una fila por producto con la cantidad de cada local y el total, agrupada por proveedor.
// grupos: [{ nombre, filas }] (filas de consolidar). Sin precios.
export function hojaArmado({ grupos, os, estadoTxt }) {
  const locs = localesDe(os);
  const columnas = [{ t: 'Producto', clase: 'pr-c-prod' }, { t: 'Unidad', clase: 'pr-c-u' }, ...locs.map(l => ({ t: nombreLocal(l), clase: 'pr-num pr-loc' })), { t: 'Total', clase: 'pr-num pr-tot' }, { t: 'Separado', clase: 'pr-ok' }];
  const filas = grupos.flatMap(g => [
    h('tr', { class: 'pr-grupo' }, h('th', { colspan: String(columnas.length) }, h('b', { text: g.nombre }), h('span', { text: ` · ${g.filas.length} ${g.filas.length === 1 ? 'producto' : 'productos'}` }))),
    ...g.filas.map(x => h('tr', {}, celdaProd(x), h('td', { class: 'pr-u', text: x.unidad || '' }), celdasLocales(x, locs), h('td', { class: 'pr-num pr-tot', text: fmtNum(x.total, 3) }), h('td', { class: 'pr-ok' })))
  ]);
  const nProd = grupos.reduce((s, g) => s + g.filas.length, 0);
  return documento({
    clase: 'armado', marca: 'Docks del Puerto · Depósito',
    titulo: 'Hoja de armado por producto',
    sub: `${estadoTxt} · ${nProd} ${nProd === 1 ? 'producto' : 'productos'} · ${locs.length} ${locs.length === 1 ? 'local' : 'locales'}`,
    datos: [['Razón social', razonesDe(os)], ['Fecha del pedido', rangoFechas(os)], ['Pidieron', quienesPidieron(os)], ['Responsable del armado', ''], ['Impreso', impreso()]],
    columnas, filas,
    despues: [h('div', { class: 'pr-firmas' }, ['Armó', 'Controló', 'Fecha y hora'].map(t => h('p', { class: 'pr-firma-l' }, h('span', { text: t }))))]
  });
}

// Orden de compra de un proveedor: productos con la cantidad de cada local, el total y la unidad; abajo, a qué local
// va cada parte y a qué razón social se factura. prov: { nombre, contacto, whatsapp, telefono, email }.
export function ordenProveedor(prov, os) {
  const locs = localesDe(os);
  const filasP = consolidar(os);
  const columnas = [{ t: 'Producto', clase: 'pr-c-prod' }, { t: 'Unidad', clase: 'pr-c-u' }, ...locs.map(l => ({ t: nombreLocal(l), clase: 'pr-num pr-loc' })), { t: 'Total', clase: 'pr-num pr-tot' }, { t: 'Recibido', clase: 'pr-ok' }];
  const filas = filasP.map(x => h('tr', {}, celdaProd(x), h('td', { class: 'pr-u', text: x.unidad || '' }), celdasLocales(x, locs), h('td', { class: 'pr-num pr-tot', text: fmtNum(x.total, 3) }), h('td', { class: 'pr-ok' })));
  const contacto = [prov.contacto, prov.whatsapp ? 'WhatsApp ' + prov.whatsapp : '', prov.telefono ? 'Tel. ' + prov.telefono : '', prov.email].filter(Boolean).join(' · ');
  const porLocal = [...groupBy(os, o => o.local_id)].sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0])));
  const entregas = h('div', { class: 'pr-locales' }, h('h2', { class: 'pr-h2', text: 'Entrega y facturación' }),
    porLocal.map(([lid, l]) => {
      const quien = [...new Set(l.map(o => o.cargado_por_nombre).filter(Boolean))].join(', ');
      const notas = [...new Set(l.map(o => o.nota).filter(Boolean))].join(' · ');
      return h('p', { class: 'pr-local' }, h('b', { text: nombreLocal(lid) }), quien ? h('span', { text: ' · pidió ' + quien }) : null,
        notas ? h('span', { class: 'pr-nota', text: ' · Nota: ' + notas }) : null,
        razonLocal(lid) ? h('span', { class: 'pr-factura', text: facturaDe(razonLocal(lid)) }) : null);
    }));
  return documento({
    clase: 'orden', marca: 'Docks del Puerto · Orden de compra',
    titulo: prov.nombre,
    sub: [contacto, `${filasP.length} ${filasP.length === 1 ? 'producto' : 'productos'} · ${locs.length} ${locs.length === 1 ? 'local' : 'locales'}`].filter(Boolean).join(' · '),
    datos: [['Razón social', razonesDe(os)], ['Fecha del pedido', rangoFechas(os)], ['Pidieron', quienesPidieron(os)], ['Aprobó', ''], ['Impreso', impreso()]],
    columnas, filas,
    despues: [entregas, h('div', { class: 'pr-firmas' }, ['Aprobó', 'Recibió', 'Fecha de recepción'].map(t => h('p', { class: 'pr-firma-l' }, h('span', { text: t }))))]
  });
}

// Manda a imprimir una o varias hojas (cada una arranca en hoja nueva).
export function imprimir(docs) {
  document.querySelectorAll('.print-area').forEach(el => el.remove());
  const area = h('div', { class: 'print-area' }, docs);
  document.body.append(area);
  document.body.classList.add('imprimiendo');
  const limpiar = () => { document.body.classList.remove('imprimiendo'); area.remove(); window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  window.print();
  setTimeout(limpiar, 1000);
}
