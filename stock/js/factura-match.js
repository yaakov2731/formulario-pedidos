// Cruce de una factura leída con el catálogo: proveedor por CUIT o nombre, y cada renglón con un producto del local.
// Orden de búsqueda por renglón: cómo se llamó la última vez (alias del proveedor) → código del mayorista → parecido del nombre.
import { norm } from './util.js';

const digitos = (t) => String(t || '').replace(/\D/g, '');
// Palabras que no ayudan a distinguir productos en una factura.
const RUIDO = new Set(['x', 'de', 'del', 'la', 'el', 'en', 'con', 'p', 'u', 'un', 'unid', 'unidad', 'kg', 'kgs', 'gr', 'grs', 'g', 'lt', 'lts', 'l', 'cc', 'ml', 'cj', 'caja', 'bolsa', 'bulto', 'pack', 'paq', 'x1', 'sa', 'srl']);
const raiz = (w) => w.length > 4 && w.endsWith('ces') ? w.slice(0, -3) + 'z' : w.length > 4 && /[^aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
export const palabras = (t) => norm(t).replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter(w => w && !RUIDO.has(w) && !/^\d+([.,]\d+)?$/.test(w)).map(raiz);

// 0..1: cuántas palabras del producto aparecen en el renglón (prefijos de 4+ letras cuentan: "ent" no, "entera"/"enter" sí).
export function parecido(renglon, nombre) {
  const a = palabras(renglon), b = palabras(nombre);
  if (!a.length || !b.length) return 0;
  const pega = (w, lista) => lista.some(x => x === w || (w.length >= 4 && x.startsWith(w)) || (x.length >= 4 && w.startsWith(x)));
  const enB = b.filter(w => pega(w, a)).length;
  const enA = a.filter(w => pega(w, b)).length;
  return (enB / b.length) * 0.7 + (enA / a.length) * 0.3;
}

export function proveedorDe(factura, provs) {
  const cuit = digitos(factura.cuit);
  if (cuit.length === 11) { const p = provs.find(x => digitos(x.cuit) === cuit); if (p) return { prov: p, por: 'cuit' }; }
  const nom = factura.proveedor || '';
  let mejor = null, pm = 0;
  for (const p of provs) {
    const s = Math.max(parecido(nom, p.nombre), parecido(nom, p.razon_social || ''));
    if (s > pm) { pm = s; mejor = p; }
  }
  return pm >= 0.6 ? { prov: mejor, por: 'nombre' } : { prov: null, por: null };
}

// Código del artículo en la lista del proveedor: productos.codigo_proveedor (0021) o LOCAL-DS-<código> del mayorista.
const codMayorista = (p) => { if (p.codigo_proveedor) return p.codigo_proveedor; const m = /^[A-Z]{3}-DS-(.+?)(-B)?$/.exec(p.codigo || ''); return m ? m[1] : ''; };

// prods: productos del local (sin elaborados ni platos); alias: [{producto_id, alias}] del proveedor en ese local.
// Devuelve, por renglón, { producto, por: 'alias'|'codigo'|'nombre'|null, sugeridos: [productos] }.
export function cruzarRenglones(renglones, prods, alias, proveedorId) {
  const porAlias = new Map(alias.map(a => [norm(a.alias), a.producto_id]));
  const porId = new Map(prods.map(p => [p.id, p]));
  const porCod = new Map();
  for (const p of prods) { const c = codMayorista(p); if (c) porCod.set(norm(c), p); }
  return renglones.map(r => {
    const desc = r.descripcion || '';
    const idA = porAlias.get(norm(desc)) || (r.codigo ? porAlias.get(norm(r.codigo)) : null);
    if (idA && porId.has(idA)) return { producto: porId.get(idA), por: 'alias', sugeridos: [] };
    if (r.codigo && porCod.has(norm(r.codigo))) return { producto: porCod.get(norm(r.codigo)), por: 'codigo', sugeridos: [] };
    const puntaje = prods.map(p => ({ p, s: parecido(desc, p.nombre) + (proveedorId && p.proveedor_id === proveedorId ? 0.08 : 0) }))
      .filter(x => x.s > 0.3).sort((a, b) => b.s - a.s);
    const sugeridos = puntaje.slice(0, 4).map(x => x.p);
    const top = puntaje[0];
    // Seguro solo si gana claro: buen parecido y sin un segundo casi igual.
    if (top && top.s >= 0.65 && (!puntaje[1] || top.s - puntaje[1].s >= 0.1)) return { producto: top.p, por: 'nombre', sugeridos };
    return { producto: null, por: null, sugeridos };
  });
}

// Lo pedido contra lo que vino: { faltan: [{producto, pedido, vino}], deMas: [producto_id] }.
export function compararConPedido(orden, recibido) {
  const vino = new Map();
  for (const x of recibido) vino.set(x.producto_id, (vino.get(x.producto_id) || 0) + x.cantidad);
  const faltan = [], enPedido = new Set();
  for (const it of orden.orden_items || []) {
    if (it.excluido) continue;
    enPedido.add(it.producto_id);
    const pend = Number(it.cantidad_pedida) - (Number(it.cantidad_recibida) || 0);
    const v = vino.get(it.producto_id) || 0;
    if (v + 1e-9 < pend) faltan.push({ producto_id: it.producto_id, pedido: pend, vino: v });
  }
  const deMas = [...vino.keys()].filter(id => !enPedido.has(id));
  return { faltan, deMas };
}

// Lectura en vivo: del JSON a medio llegar saca el proveedor y los renglones ya completos (para mostrarlos mientras se lee).
export function facturaParcial(texto) {
  const m = /"proveedor"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(texto);
  let proveedor = null;
  if (m) { try { proveedor = JSON.parse('"' + m[1] + '"'); } catch (_e) { proveedor = m[1]; } }
  const renglones = [];
  const k = texto.indexOf('"renglones"');
  if (k >= 0) {
    const ini = texto.indexOf('[', k);
    let prof = 0, enTexto = false, esc = false, desde = -1;
    for (let i = ini + 1; ini >= 0 && i < texto.length; i++) {
      const c = texto[i];
      if (enTexto) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enTexto = false; continue; }
      if (c === '"') enTexto = true;
      else if (c === '{') { if (prof++ === 0) desde = i; }
      else if (c === '}') { if (--prof === 0 && desde >= 0) { try { renglones.push(JSON.parse(texto.slice(desde, i + 1))); } catch (_e) { /* incompleto */ } desde = -1; } }
      else if (c === ']' && prof === 0) break;
    }
  }
  return { proveedor, renglones };
}
