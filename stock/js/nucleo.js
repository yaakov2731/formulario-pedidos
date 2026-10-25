// Lectura de los Excel de Núcleo IT (sin dependencias: recibe las filas ya leídas con SheetJS, `header: 1`).
// Reconoce por los encabezados: "Detalle de productos vendidos por pedido", "Formas de pago de pedidos" y "Pedidos por producto".

const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[°º]/g, '').replace(/\$/g, '').replace(/\s+/g, ' ').trim();

export function aNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v == null ? '' : v).trim().replace(/[\s$]/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}

const p2 = (n) => String(n).padStart(2, '0');

// Fecha de Excel (número de serie) o texto "dd/mm/aaaa hh:mm" -> { fecha: 'aaaa-mm-dd', hora, iso (hora argentina) } sin usar la zona del navegador.
export function aFechaHora(v) {
  let y, mo, d, hh = 0, mi = 0, ss = 0;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate(); hh = dt.getUTCHours(); mi = dt.getUTCMinutes(); ss = dt.getUTCSeconds();
  } else if (v instanceof Date && !Number.isNaN(v.getTime())) {
    y = v.getFullYear(); mo = v.getMonth() + 1; d = v.getDate(); hh = v.getHours(); mi = v.getMinutes(); ss = v.getSeconds();
  } else {
    const m = String(v == null ? '' : v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3]; hh = +(m[4] || 0); mi = +(m[5] || 0); ss = +(m[6] || 0);
  }
  const fecha = `${y}-${p2(mo)}-${p2(d)}`;
  return { fecha, hora: hh, iso: `${fecha}T${p2(hh)}:${p2(mi)}:${p2(ss)}-03:00` };
}

const vacia = (r) => !r || r.every(c => c === null || c === undefined || String(c).trim() === '');

// Busca la fila de encabezados (en las primeras 20) y devuelve el tipo de reporte con el índice de cada columna.
export function detectarTipo(filas) {
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const hs = (filas[i] || []).map(norm);
    const col = (...nombres) => hs.findIndex(x => nombres.includes(x));
    const has = (n) => hs.includes(n);
    if (has('cantidad de productos') && has('rubro') && (has('n pedido') || has('n de pedido'))) {
      return { tipo: 'detalle', fila: i, cols: {
        fecha: col('fecha'), pedido: col('n pedido', 'n de pedido'), codigo: col('codigo'), nombre: col('nombre'), cantidad: col('cantidad de productos'),
        total: col('total'), rubro: col('rubro'), subrubro: col('subrubro'), tipo: col('tipo de pedido'), sector: col('sector'),
        mozo: col('mozo', 'camarero', 'mesero'), mesa: col('mesa') } };
    }
    if (has('forma de pago') && has('monto') && (has('n de pedido') || has('n pedido'))) {
      return { tipo: 'pagos', fila: i, cols: {
        pedido: col('n de pedido', 'n pedido'), fecha: col('fecha'), cliente: col('cliente'), total: col('total'), forma: col('forma de pago'), monto: col('monto'),
        mozo: col('mozo', 'camarero', 'mesero'), mesa: col('mesa') } };
    }
    if (has('codigo') && has('nombre') && has('cantidad') && has('total')) {
      return { tipo: 'simple', fila: i, cols: { codigo: col('codigo'), nombre: col('nombre'), cantidad: col('cantidad'), total: col('total') } };
    }
  }
  return null;
}

const celda = (r, i) => (i >= 0 && r ? r[i] : null);
const texto = (v) => { const t = String(v == null ? '' : v).trim(); return t || null; };

// Filas de datos: desde la fila siguiente al encabezado hasta la primera fila vacía.
function datos(filas, det) {
  const out = [];
  for (let i = det.fila + 1; i < filas.length; i++) { if (vacia(filas[i])) break; out.push(filas[i]); }
  return out;
}

export function parsearDetalle(filas, det = detectarTipo(filas)) {
  const c = det.cols;
  const items = [];
  for (const r of datos(filas, det)) {
    const f = aFechaHora(celda(r, c.fecha));
    const cantidad = aNumero(celda(r, c.cantidad));
    items.push({
      codigo: texto(celda(r, c.codigo)), nombre: texto(celda(r, c.nombre)) || texto(celda(r, c.codigo)) || 'Sin nombre',
      cantidad: cantidad === null ? 0 : cantidad, importe: aNumero(celda(r, c.total)) || 0,
      pedido_numero: aNumero(celda(r, c.pedido)), fecha: f ? f.fecha : null, fecha_hora: f ? f.iso : null, hora: f ? f.hora : null,
      rubro: texto(celda(r, c.rubro)), subrubro: texto(celda(r, c.subrubro)), tipo_pedido: texto(celda(r, c.tipo)), sector: texto(celda(r, c.sector)),
      mozo: texto(celda(r, c.mozo)), mesa: texto(celda(r, c.mesa))
    });
  }
  return items;
}

export function parsearPagos(filas, det = detectarTipo(filas)) {
  const c = det.cols;
  return datos(filas, det).map(r => {
    const f = aFechaHora(celda(r, c.fecha));
    return { pedido_numero: aNumero(celda(r, c.pedido)), fecha: f ? f.fecha : null, fecha_hora: f ? f.iso : null, cliente: texto(celda(r, c.cliente)),
      total: aNumero(celda(r, c.total)) || 0, forma_pago: texto(celda(r, c.forma)) || 'Sin especificar', monto: aNumero(celda(r, c.monto)) || 0,
      mozo: texto(celda(r, c.mozo)), mesa: texto(celda(r, c.mesa)) };
  }).filter(p => p.pedido_numero !== null);
}

export function parsearSimple(filas, det = detectarTipo(filas)) {
  const c = det.cols;
  return datos(filas, det).map(r => ({
    codigo: texto(celda(r, c.codigo)), nombre: texto(celda(r, c.nombre)) || texto(celda(r, c.codigo)) || 'Sin nombre',
    cantidad: aNumero(celda(r, c.cantidad)) || 0, importe: aNumero(celda(r, c.total)) || 0, pedido_numero: null
  }));
}

// Lee las filas de una hoja: { tipo, items | pagos, filas } o null si no se reconoce.
export function leerReporte(filas) {
  const det = detectarTipo(filas);
  if (!det) return null;
  if (det.tipo === 'detalle') return { tipo: 'detalle', items: parsearDetalle(filas, det) };
  if (det.tipo === 'pagos') return { tipo: 'pagos', pagos: parsearPagos(filas, det) };
  return { tipo: 'simple', items: parsearSimple(filas, det) };
}

// Clave con la que se asocia un renglón de Núcleo a un producto: el código, o el nombre si no trae código.
export const claveItem = (it) => it.codigo || it.nombre;

const redondear = (n) => Math.round(n * 100) / 100;

// Une los reportes leídos en una importación: { pedidos, items, pagos, resumen }. Si hay detalle, "Pedidos por producto" se ignora.
export function armarImportacion({ detalle, pagos, simple } = {}) {
  const usaSimple = !detalle && simple;
  const items = detalle ? detalle.items : (usaSimple ? simple.items : []);
  const filasPago = pagos ? pagos.pagos : [];

  const pedidos = new Map();
  const pedido = (n) => { if (!pedidos.has(n)) pedidos.set(n, { numero: n, fecha_hora: null, cliente: null, mozo: null, mesa: null, tipo_pedido: null, sector: null, productos: 0, nItems: 0, cobrado: 0, conPago: false }); return pedidos.get(n); };
  for (const it of items) {
    if (it.pedido_numero === null || it.pedido_numero === undefined) continue;
    const p = pedido(it.pedido_numero);
    if (it.fecha_hora && (!p.fecha_hora || it.fecha_hora < p.fecha_hora)) p.fecha_hora = it.fecha_hora;
    p.tipo_pedido = p.tipo_pedido || it.tipo_pedido; p.sector = p.sector || it.sector; p.mozo = p.mozo || it.mozo; p.mesa = p.mesa || it.mesa;
    p.productos += it.importe; p.nItems++;
  }
  const pagosFilas = [];
  for (const g of filasPago) {
    const p = pedido(g.pedido_numero);
    p.fecha_hora = p.fecha_hora || g.fecha_hora; p.cliente = p.cliente || g.cliente; p.mozo = p.mozo || g.mozo; p.mesa = p.mesa || g.mesa;
    p.cobrado += g.monto; p.conPago = true;
    pagosFilas.push({ pedido_numero: g.pedido_numero, forma_pago: g.forma_pago, monto: g.monto });
  }
  const hayPagos = filasPago.length > 0;
  const lista = [...pedidos.values()].sort((a, b) => a.numero - b.numero);

  const totalProductos = redondear(items.reduce((s, i) => s + i.importe, 0));
  const totalCobrado = hayPagos ? redondear(filasPago.reduce((s, g) => s + g.monto, 0)) : null;
  const cero = lista.filter(p => (p.nItems > 0 && redondear(p.productos) === 0) || (hayPagos && p.nItems > 0 && !p.conPago)).map(p => p.numero);
  // fecha de venta que dicen los archivos (la más frecuente)
  const cuenta = new Map();
  for (const x of [...items, ...filasPago]) if (x.fecha) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
  const fechaArchivo = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    items,
    pedidos: lista.map(p => ({ numero: p.numero, fecha_hora: p.fecha_hora, cliente: p.cliente, mozo: p.mozo, mesa: p.mesa, tipo_pedido: p.tipo_pedido, sector: p.sector,
      total: hayPagos ? redondear(p.cobrado) : redondear(p.productos) })),
    pagos: pagosFilas,
    resumen: {
      modo: detalle ? 'detalle' : (usaSimple ? 'simple' : 'pagos'),
      ignoraSimple: !!(detalle && simple),
      totalProductos, totalCobrado, nPedidos: lista.length, nItems: items.length,
      diferencia: totalCobrado === null || !items.length ? null : redondear(totalCobrado - totalProductos),
      pedidosCero: cero, fecha: fechaArchivo ? fechaArchivo[0] : null
    }
  };
}
