// Pérdida de la semana por local y productos clave (solo gerencia). Funciones puras, sin DOM ni Supabase
// (las prueba scripts/verify-perdida.js). La cuenta del día es la de Stock → Control → Hoy (hoja por sector):
//   Consumo = Apertura + Entró − Salió − Merma − Cierre, sumando todos los sectores (los pases entre sectores se cancelan).
//   Vendido = lo que descontaron las ventas por receta y la producción en la jornada (de 6 a 6).
//   Diferencia = Vendido − Consumo. Negativa = se usó más de lo vendido y no se anotó: "Sin explicar".
// Pérdida de la semana (lunes a domingo, como la línea de la semana de Hoy) =
//   Σ días Σ productos [ máx(0, −Diferencia) + Merma anotada en la hoja ] × costo por unidad de uso.
// Productos clave: los que suman ~80 % del costo consumido en las últimas 4 semanas (máximo 15).
// Sin costo cargado el producto no entra en la plata ni en el ranking: se lista aparte ("Falta cargar costos").
import { porTexto, factorDe, sumarDias } from './util.js';
import { consumoPorProducto, VENTANA } from './sugerido.js';

export const TODOS = 'Todos los sectores';
export const CLAVE_PCT = 0.8;
export const CLAVE_TOPE = 15;
const VENDIDO = ['venta', 'produccion_consumo'];
const r3 = (x) => Math.round(x * 1000) / 1000;

// Costo por unidad de uso: precio de compra (por bulto) dividido el factor. Sin precio cargado: null (nunca 0).
export const costoUnidad = (p, precios) => { const x = p && precios ? Number(precios.get(p.id)) : 0; return x > 0 ? x / factorDe(p) : null; };

// movs: hoja_movs de la jornada. ventas: movimientos de la jornada. Devuelve filas por producto.
export function calcularSector(sector, movs, ventas, prods, precios) {
  const sectores = new Set(movs.map(m => m.sector));
  const filas = new Map();
  const fila = (pid) => { if (!filas.has(pid)) filas.set(pid, { p: prods.get(pid), ap: null, ci: null, entro: 0, salio: 0, merma: 0, faltan: new Set() }); return filas.get(pid); };
  const suma = (r, k, c) => { r[k] = (r[k] || 0) + c; };
  const todos = sector === TODOS;
  const conAp = new Set(), conCi = new Set(), activos = new Set();
  for (const m of movs) {
    const c = Number(m.cantidad) || 0, k = m.producto_id + '|' + m.sector;
    activos.add(k);
    // Si pasó por otro sector (entró de ahí o se devolvió ahí), ese sector también tiene que estar contado.
    if ((m.tipo === 'entro' || m.tipo === 'devolvi') && sectores.has(m.otro)) activos.add(m.producto_id + '|' + m.otro);
    if (m.tipo === 'apertura') conAp.add(k);
    if (m.tipo === 'cierre') conCi.add(k);
    if (todos) {
      const r = fila(m.producto_id);
      if (m.tipo === 'apertura') suma(r, 'ap', c);
      else if (m.tipo === 'cierre') suma(r, 'ci', c);
      else if (m.tipo === 'merma') r.merma += c;
      else if (m.tipo === 'entro' && !sectores.has(m.otro)) r.entro += c;
      else if ((m.tipo === 'devolvi' || m.tipo === 'retiro') && !sectores.has(m.otro)) r.salio += c;
      continue;
    }
    if (m.sector === sector) {
      const r = fila(m.producto_id);
      if (m.tipo === 'apertura') suma(r, 'ap', c);
      else if (m.tipo === 'cierre') suma(r, 'ci', c);
      else if (m.tipo === 'merma') r.merma += c;
      else if (m.tipo === 'entro') r.entro += c;
      else if (m.tipo === 'devolvi' || m.tipo === 'retiro') r.salio += c;
    } else if (m.otro === sector && (m.tipo === 'entro' || m.tipo === 'devolvi')) {
      const r = fila(m.producto_id);
      if (m.tipo === 'entro') r.salio += c; else r.entro += c;
    }
  }
  const vend = new Map();
  for (const m of ventas) if (VENDIDO.includes(m.tipo)) vend.set(m.producto_id, (vend.get(m.producto_id) || 0) - (Number(m.cantidad) || 0));
  const out = [];
  for (const [pid, r] of filas) {
    if (!r.p) continue;
    for (const k of activos) {
      const [p2, s] = k.split('|');
      if (p2 !== pid || (!todos && s !== sector)) continue;
      const en = todos ? ' en ' + s : '';
      if (!conAp.has(k)) r.faltan.add('apertura' + en);
      if (!conCi.has(k)) r.faltan.add('cierre' + en);
    }
    if (!todos && r.ap == null) r.faltan.add('apertura');
    if (!todos && r.ci == null) r.faltan.add('cierre');
    if (!todos && r.faltan.has('apertura') && r.faltan.has('cierre') && r.ap == null && r.ci == null) { r.faltan.clear(); r.faltan.add('contar en este sector'); }
    r.completo = r.faltan.size === 0;
    r.consumo = r.completo ? r3((r.ap || 0) + r.entro - r.salio - r.merma - (r.ci || 0)) : null;
    const pu = costoUnidad(r.p, precios);
    r.valorMerma = pu != null ? r.merma * pu : null;
    if (todos) {
      r.vendido = r3(vend.get(pid) || 0);
      r.dif = r.completo ? r3(r.vendido - r.consumo) : null;
      r.valorDif = r.dif != null && pu != null ? r.dif * pu : null;
    }
    out.push(r);
  }
  return out.sort((a, b) => porTexto(a.p.nombre, b.p.nombre));
}

// ---- semanas y jornadas ----
const dowDe = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
export const lunesDe = (iso) => sumarDias(iso, -((dowDe(iso) + 6) % 7));
export function diasDe(desde, hasta) { const out = []; for (let f = desde; f <= hasta && out.length < 400; f = sumarDias(f, 1)) out.push(f); return out; }
// Movimientos de una jornada (de 6 a 6 del día siguiente), igual que la hoja del día.
export function deJornada(movs, fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const a = new Date(y, m - 1, d, 6).getTime(), b = new Date(y, m - 1, d + 1, 6).getTime();
  return movs.filter(x => { const t = Date.parse(x.creado_en); return t >= a && t < b; });
}
const porFecha = (hoja) => { const g = new Map(); for (const r of hoja) { const f = String(r.fecha || '').slice(0, 10); if (!g.has(f)) g.set(f, []); g.get(f).push(r); } return g; };

// Pérdida de un local entre dos fechas (inclusive). hoja: hoja_movs del local; movs: movimientos del local (ventas, producción).
// Devuelve { diasConHoja, diasConCierre, sinExplicar, merma, total, productos (con costo, de mayor a menor), sinCosto }.
export function perdidaSemana({ hoja = [], movs = [], desde, hasta, prods, precios }) {
  const dias = porFecha(hoja);
  const acc = new Map();
  let diasConHoja = 0, diasConCierre = 0;
  for (const f of diasDe(desde, hasta)) {
    const hd = dias.get(f);
    if (!hd || !hd.length) continue;
    diasConHoja++;
    const filas = calcularSector(TODOS, hd, deJornada(movs, f), prods, precios);
    if (filas.some(r => r.completo)) diasConCierre++;
    for (const r of filas) {
      const falta = r.dif != null && r.dif < 0 ? -r.dif : 0;
      const merma = r.merma > 0 ? r.merma : 0;
      if (!falta && !merma) continue;
      if (!acc.has(r.p.id)) acc.set(r.p.id, { p: r.p, falta: 0, merma: 0 });
      const x = acc.get(r.p.id); x.falta += falta; x.merma += merma;
    }
  }
  const productos = [], sinCosto = [];
  let sinExplicar = 0, merma = 0;
  for (const x of acc.values()) {
    x.falta = r3(x.falta); x.merma = r3(x.merma);
    const pu = costoUnidad(x.p, precios);
    if (pu == null) { sinCosto.push(x); continue; }
    x.valorFalta = x.falta * pu; x.valorMerma = x.merma * pu; x.valor = x.valorFalta + x.valorMerma;
    sinExplicar += x.valorFalta; merma += x.valorMerma;
    productos.push(x);
  }
  productos.sort((a, b) => b.valor - a.valor || porTexto(a.p.nombre, b.p.nombre));
  sinCosto.sort((a, b) => porTexto(a.p.nombre, b.p.nombre));
  return { diasConHoja, diasConCierre, sinExplicar, merma, total: sinExplicar + merma, productos, sinCosto };
}
// Hay número para mostrar: algún día con cierre (sin explicar) o merma anotada con costo.
export const hayPerdida = (r) => !!r && (r.diasConCierre > 0 || r.merma > 0 || r.sinCosto.length > 0);

// Lo consumido por producto en las 4 semanas anteriores a hoy (hoy no cuenta). De dos fuentes, la mayor:
//   salidas de stock (ventas por receta, producción, merma, "usé hoy"; misma cuenta que el pedido sugerido) y
//   hoja por sector (Consumo de los días con apertura y cierre, todos los sectores juntos: los pases no se cuentan dos veces).
export function consumo4Semanas({ movs = [], hoja = [], hoy, prods, precios }) {
  const desde = sumarDias(hoy, -VENTANA);
  const out = new Map();
  for (const [id, c] of consumoPorProducto({ movs, hoja: [], hoy })) if (c.mov) out.set(id, { mov: c.mov.total, hoja: 0 });
  const dias = porFecha(hoja);
  for (const f of diasDe(desde, sumarDias(hoy, -1))) {
    const hd = dias.get(f);
    if (!hd) continue;
    for (const r of calcularSector(TODOS, hd, [], prods, precios)) {
      if (!(r.consumo > 0)) continue;
      if (!out.has(r.p.id)) out.set(r.p.id, { mov: 0, hoja: 0 });
      out.get(r.p.id).hoja += r.consumo;
    }
  }
  const res = new Map();
  for (const [id, c] of out) { const q = r3(Math.max(c.mov, c.hoja)); if (q > 0) res.set(id, q); }
  return res;
}

// Ranking de productos clave de un local. cons: Map producto_id → cantidad consumida (unidad de uso).
// Ordena por costo consumido y toma hasta llegar al 80 % del total (tope 15). Sin costo: aparte, fuera del ranking.
export function productosClave({ cons, prods, precios, localId = null, pct = CLAVE_PCT, tope = CLAVE_TOPE }) {
  const conCosto = [], sinCosto = [];
  for (const [id, cant] of cons) {
    const p = prods.get(id);
    if (!p || (localId && p.local_id !== localId) || !(cant > 0)) continue;
    const pu = costoUnidad(p, precios);
    if (pu == null) sinCosto.push({ p, cant });
    else conCosto.push({ p, cant, valor: cant * pu });
  }
  conCosto.sort((a, b) => b.valor - a.valor || porTexto(a.p.nombre, b.p.nombre));
  sinCosto.sort((a, b) => porTexto(a.p.nombre, b.p.nombre));
  const total = conCosto.reduce((s, x) => s + x.valor, 0);
  const clave = [];
  let acum = 0;
  for (const x of conCosto) {
    if (clave.length >= tope || (total > 0 && acum >= total * pct)) break;
    clave.push(x); acum += x.valor;
  }
  return { clave, total, acum, sinCosto, hayHistorial: conCosto.length + sinCosto.length > 0 };
}
