// Acceso a Supabase: cliente, sesión, caché stale-while-revalidate y errores en español.
import { lsGet, lsSet, lsDel } from './util.js';

const CFG = window.STOCK_CONFIG;
export const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'stock-auth' }
});

export function mensajeError(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  const code = e && e.code;
  if (/invalid login|invalid_credentials|Invalid login credentials/i.test(m)) return 'PIN o contraseña incorrectos.';
  if (/failed to fetch|networkerror|load failed|network request failed|fetch/i.test(m) && !code) return 'Sin conexión. Revisá internet e intentá de nuevo.';
  if (code === '42501' || /row-level security|permission denied|not authorized|JWT/i.test(m)) return 'No tenés permiso para hacer eso.';
  if (/operaci[oó]n .* ya est[aá] cargada|pagos_numero_operacion_uq/i.test(m)) return 'Esa operación ya está cargada: el pago no se registra dos veces.';
  if (/proveedores_nombre_key/i.test(m)) return 'Ya hay un proveedor con ese nombre.';
  if (/facturas_proveedor_proveedor_id_numero_key/i.test(m)) return 'Ya cargaste una factura con ese número para este proveedor.';
  if (code === '23505' || /duplicate key/i.test(m)) return 'Ya existe un registro igual (código repetido).';
  if (/cambiar_presentacion/i.test(m) && (code === 'PGRST202' || code === '42883')) return 'Falta activar el cambio de bulto: pegá el SQL 0015 en Supabase.';
  if (/recibir_con_factura/i.test(m) && (code === 'PGRST202' || code === '42883')) return 'Falta activar Recibir con factura: pegá el SQL 0018 en Supabase.';
  if (/email not confirmed/i.test(m)) return 'La cuenta todavía no está confirmada. Avisale a gerencia.';
  if (/too many requests|rate limit/i.test(m)) return 'Demasiados intentos. Esperá un minuto.';
  return m || 'Algo salió mal. Probá de nuevo.';
}

async function ok(res) {
  if (res.error) throw res.error;
  return res.data;
}

// Trae todas las filas de a 1000 (límite de PostgREST): la primera página sola y, si vino llena, las siguientes de a 4 en paralelo.
// El orden de `build` tiene que ser único (desempatar por id): si no, entre páginas se repiten filas y faltan otras.
const PAG = 1000, EN_PARALELO = 4;
export async function todo(build) {
  const pagina = async (from) => ok(await build().range(from, from + PAG - 1));
  const out = await pagina(0);
  if (out.length < PAG) return out;
  for (let from = PAG; ; from += PAG * EN_PARALELO) {
    const pags = await Promise.all(Array.from({ length: EN_PARALELO }, (_, i) => pagina(from + i * PAG)));
    for (const rows of pags) out.push(...rows);
    if (pags.some(rows => rows.length < PAG)) return out;
  }
}

// ---- caché del celular ----
// En IndexedDB: localStorage tiene ~5 MB y con miles de productos se llenaba (y entonces cada pantalla volvía a bajar todo).
// Si IndexedDB no está (modo privado viejo) o tarda, usa localStorage como antes.
let dbP = null;
function idb() {
  if (dbP) return dbP;
  dbP = new Promise((res) => {
    const t = setTimeout(() => res(null), 1500);
    const fin = (v) => { clearTimeout(t); res(v); };
    try {
      const r = indexedDB.open('stock-cache', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('c');
      r.onsuccess = () => fin(r.result);
      r.onerror = r.onblocked = () => fin(null);
    } catch (_e) { fin(null); }
  });
  return dbP;
}
function tx(db, modo, fn) {
  return new Promise((res) => {
    try {
      const t = db.transaction('c', modo);
      const r = fn(t.objectStore('c'));
      t.oncomplete = () => res(r && r.result);
      t.onerror = t.onabort = () => res(undefined);
    } catch (_e) { res(undefined); }
  });
}
async function cacheGet(clave) {
  const db = await idb();
  const v = db ? await tx(db, 'readonly', s => s.get(clave)) : undefined;
  return v !== undefined ? v : lsGet('c:' + clave); // lo guardado antes en localStorage sirve para el primer arranque
}
async function cacheSet(clave, v) {
  const db = await idb();
  if (db && await tx(db, 'readwrite', s => { s.put(v, clave); return null; }) !== undefined) { lsDel('c:' + clave); return; }
  lsSet('c:' + clave, v);
}

// SWR: entrega primero lo cacheado (onData(datos, true)) y después lo fresco (onData(datos, false)).
export async function swr(clave, fetcher, onData) {
  const fresco = fetcher(); // la red arranca ya, mientras se lee la caché
  fresco.catch(() => {});
  const hit = await cacheGet(clave);
  if (hit && hit.d !== undefined) onData(hit.d, true);
  try {
    const d = await fresco;
    cacheSet(clave, { t: Date.now(), d });
    onData(d, false);
    return d;
  } catch (e) {
    if (hit && hit.d !== undefined) { onData(hit.d, false, e); return hit.d; }
    throw e;
  }
}
export function limpiarCache() {
  try { Object.keys(localStorage).filter(k => k.startsWith('stock:c:')).forEach(k => localStorage.removeItem(k)); } catch (_e) { /* nada */ }
  idb().then(db => db && tx(db, 'readwrite', s => { s.clear(); return null; }));
}

// ---- sesión ----
export async function entrarEncargado(codigo, pin) {
  const email = `local-${String(codigo).toLowerCase()}@docks-stock.app`;
  const { error } = await sb.auth.signInWithPassword({ email, password: pin });
  if (error) throw error;
}
export async function entrarAdmin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
  if (error) throw error;
}
export async function salir() {
  limpiarCache(); lsDel('perfil');
  window.dispatchEvent(new Event('stock:salir'));
  try { await sb.auth.signOut(); } catch (_e) { /* sin red: igual limpiamos */ }
}
export async function perfilActual() {
  const { data } = await sb.auth.getSession();
  if (!data || !data.session) return null;
  const uid = data.session.user.id;
  const previo = lsGet('perfil');
  if (previo && previo.id === uid) { // arranque rápido: confía en el perfil guardado y lo refresca de fondo
    ok(await sb.from('perfiles').select('id,nombre,rol,local_id').eq('id', uid).limit(1)).then(r => { if (r[0]) lsSet('perfil', r[0]); }).catch(() => {});
    return previo;
  }
  try {
    const rows = await ok(await sb.from('perfiles').select('id,nombre,rol,local_id').eq('id', uid).limit(1));
    if (rows[0]) { lsSet('perfil', rows[0]); return rows[0]; }
    return { sinPerfil: true, id: uid };
  } catch (e) {
    const c = lsGet('perfil');
    if (c && c.id === uid) return c; // sin conexión: usa el último perfil conocido
    throw e;
  }
}
export async function localesLogin() {
  const rows = await ok(await sb.rpc('locales_login'));
  lsSet('locales_login', rows);
  return rows;
}

// ---- lecturas ----
const COLS_PROD = 'id,codigo,nombre,local_id,categoria,unidad_compra,unidad_uso,factor_conversion,proveedor_id,par,es_elaborado,activo';
// productos.oculto (migración 0012): no se muestra en Pedir salvo al buscar. Si la columna todavía no existe, se lee sin ella.
let hayOculto = true;
// productos.codigo_proveedor (migración 0021): código del artículo en la lista del proveedor. Si falta, se lee sin él.
let hayCodProv = true;
const catalogo = (localId) => todo(() => {
  let q = sb.from('productos').select(COLS_PROD + (hayOculto ? ',oculto' : '') + (hayCodProv ? ',codigo_proveedor' : '')).order('nombre').order('id');
  if (localId) q = q.eq('local_id', localId).eq('activo', true);
  return q;
});
export const hayColumnaOculto = () => hayOculto;
export async function cargarCatalogo(localId) {
  try { return await catalogo(localId); } catch (e) {
    if (hayCodProv && e && /codigo_proveedor/.test(e.message || '')) { hayCodProv = false; return cargarCatalogo(localId); }
    if (!hayOculto || !(e && (e.code === '42703' || /oculto/.test(e.message || '')))) throw e;
    hayOculto = false;
    return cargarCatalogo(localId);
  }
}
export const cargarStock = (localId) => todo(() => {
  let q = sb.from('stock_actual').select('local_id,producto_id,stock').order('producto_id').order('local_id');
  if (localId) q = q.eq('local_id', localId);
  return q;
});
export const cargarProveedoresBasico = async () => ok(await sb.from('proveedores_basico').select('id,nombre,dias_entrega,corte,tiene_minimo,activo').order('nombre'));
const COLS_PROV = 'id,nombre,whatsapp,cuit,alias_cbu,dias_entrega,corte,pedido_minimo,notas,activo';
const COLS_PROV_0011 = ',razon_social,contacto,telefono,email,whatsapp_pagos,email_pagos,banco';
// Si todavía no se corrió 0011_proveedores_datos.sql, trae solo las columnas de siempre (sin contacto, email ni datos de cobranza).
export async function cargarProveedores() {
  const r = await sb.from('proveedores').select(COLS_PROV + COLS_PROV_0011).order('nombre');
  if (r.error && (r.error.code === '42703' || /column .* does not exist/i.test(r.error.message || ''))) return ok(await sb.from('proveedores').select(COLS_PROV).order('nombre'));
  return ok(r);
}
// Sin 0013_locales_razon_social.sql trae los locales sin razón social ni CUIT.
export async function cargarLocales() {
  const r = await sb.from('locales').select('id,codigo,nombre,encargados,activo,razon_social,cuit').order('nombre');
  if (r.error && (r.error.code === '42703' || /column .* does not exist/i.test(r.error.message || ''))) return ok(await sb.from('locales').select('id,codigo,nombre,encargados,activo').order('nombre'));
  return ok(r);
}
export const guardarLocal = async (id, datos) => ok(await sb.from('locales').update(datos).eq('id', id).select('id'));
// De a 1000 como el catálogo: sin paginar, PostgREST cortaba en 1000 y con ~8.300 precios la mayoría de los productos figuraban sin precio.
export const cargarPrecios = () => todo(() => sb.from('precio_actual').select('producto_id,precio').order('producto_id'));
export const buscarServidor = async (q, localId) => ok(await sb.rpc('buscar_productos', { q, p_local: localId || null }));

export async function misOrdenes(localId) {
  return ok(await sb.from('ordenes_compra')
    .select('id,estado,creado_en,cargado_por_nombre,nota,proveedor_id,orden_items(producto_id,cantidad_pedida)')
    .eq('local_id', localId).order('creado_en', { ascending: false }).limit(60));
}
// orden_items.excluido (migración 0009): producto destildado por gerencia. agregado / no_vino (migración 0020): lo que llegó
// sin estar pedido y lo que no vino al recibir. Si esas columnas todavía no existen, se lee sin ellas.
const COLS_ORD = 'id,local_id,proveedor_id,estado,creado_en,cargado_por_nombre,nota,orden_items(id,producto_id,cantidad_pedida,cantidad_recibida,excluido,agregado,no_vino)';
const PRUEBAS_ORD = [COLS_ORD, COLS_ORD.replace(',agregado,no_vino', ''), COLS_ORD.replace(',excluido,agregado,no_vino', '')];
let desdeOrd = 0;
let hayExcluido = true;
const faltaColumna = (e) => e && (e.code === '42703' || /excluido|agregado|no_vino/.test(e.message || ''));
async function selOrdenes(armar) {
  for (let i = desdeOrd; i < PRUEBAS_ORD.length; i++) {
    const r = await armar(PRUEBAS_ORD[i]);
    if (!r.error) { desdeOrd = i; hayExcluido = PRUEBAS_ORD[i].includes('excluido'); return r.data; }
    if (!faltaColumna(r.error) || i === PRUEBAS_ORD.length - 1) throw r.error;
  }
}
export const guardaExcluidos = () => hayExcluido;
export async function ordenesPorEstado(estados) {
  return selOrdenes(cols => sb.from('ordenes_compra').select(cols).in('estado', estados).order('creado_en', { ascending: true }).limit(500));
}

// Pedidos ya enviados al proveedor (o recibidos) desde una fecha: para la tabla de gerencia y el proveedor habitual.
export async function ordenesHistorial(desde) {
  return selOrdenes(cols => sb.from('ordenes_compra').select(cols).in('estado', ['enviada', 'parcial', 'recibida']).gte('creado_en', desde).order('creado_en', { ascending: false }).limit(300));
}

// ---- escrituras ----
export async function crearOrden(o, items) {
  const [orden] = await ok(await sb.from('ordenes_compra').insert(o).select('id'));
  await agregarItems(orden.id, items);
  return orden.id;
}
export async function agregarItems(ordenId, items) {
  await ok(await sb.from('orden_items').insert(items.map(i => ({ orden_id: ordenId, producto_id: i.producto_id, cantidad_pedida: i.cantidad }))));
}
// Un producto que gerencia suma a un pedido antes de aprobarlo. Devuelve el id del ítem nuevo.
export async function agregarItem(ordenId, productoId, cantidad) {
  const [it] = await ok(await sb.from('orden_items').insert({ orden_id: ordenId, producto_id: productoId, cantidad_pedida: cantidad }).select('id'));
  return it.id;
}
export const actualizarOrden = async (id, cambios) => ok(await sb.from('ordenes_compra').update(cambios).eq('id', id).select('id'));
export const actualizarItem = async (id, cantidad) => ok(await sb.from('orden_items').update({ cantidad_pedida: cantidad }).eq('id', id).select('id'));
export const marcarExcluidos = async (ids, excluido) => ok(await sb.from('orden_items').update({ excluido }).in('id', ids).select('id'));
export const moverItem = async (id, ordenId) => ok(await sb.from('orden_items').update({ orden_id: ordenId }).eq('id', id).select('id'));
export const borrarItem = async (id) => ok(await sb.from('orden_items').delete().eq('id', id).select('id'));
export async function crearOrdenSolo(o) {
  const [orden] = await ok(await sb.from('ordenes_compra').insert(o).select('id'));
  return orden.id;
}

// ---- gerencia ----
export const contarProducto = async (localId, productoId, cantidad) =>
  ok(await sb.rpc('registrar_conteo', { p_local: localId, p_producto: productoId, p_cantidad_contada: cantidad }));

// Recepción de una orden: una sola función SQL transaccional (todo o nada). Devuelve el estado final.
// lineas: [{ item, qty, precio, noVino }]; item sin id = producto agregado al recibir ({ producto_id }).
// cerrar = lo que llegó de menos no va a venir. Con agregados, "no vino" o cerrar hace falta la migración 0020.
export async function registrarRecepcion(orden, lineas, cerrar = false) {
  const args = {
    p_orden: orden.id,
    p_items: lineas.map(l => ({ ...(l.item.id ? { orden_item_id: l.item.id } : { producto_id: l.item.producto_id }), cantidad_recibida: l.qty, precio_unitario: l.precio, ...(l.noVino ? { no_vino: true } : {}) }))
  };
  if (cerrar) args.p_cerrar = true;
  const r = await sb.rpc('recibir_orden', args);
  const sin0020 = r.error && (r.error.code === 'PGRST202' || /orden_item_id|p_cerrar|could not find the function/i.test(r.error.message || ''));
  if (sin0020 && (cerrar || lineas.some(l => !l.item.id || l.noVino))) {
    throw new Error('Para agregar o sacar productos al recibir falta pegar el SQL de 0020 en Supabase.');
  }
  return ok(r);
}

// ---- recibir con factura (0018_recibir_factura.sql + Edge Function leer-factura) ----
// archivos: [{ data: base64, tipo }]. La función responde de a pedazos (una línea JSON por pedazo): alPedazo(textoHastaAhora)
// se llama con todo lo leído, para mostrar los renglones a medida que llegan. Devuelve { factura, modelo, uso, ms }.
export async function leerFactura(archivos, alPedazo, modo) {
  const { data: { session } } = await sb.auth.getSession();
  let res;
  try {
    res = await fetch(CFG.SUPABASE_URL + '/functions/v1/leer-factura', {
      method: 'POST', body: JSON.stringify(modo ? { archivos, modo } : { archivos }),
      headers: { 'content-type': 'application/json', apikey: CFG.SUPABASE_KEY, authorization: 'Bearer ' + ((session && session.access_token) || CFG.SUPABASE_KEY) }
    });
  } catch (_e) { throw new Error('Sin conexión. Revisá internet e intentá de nuevo.'); }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error || ''; } catch (_e) { /* sin cuerpo */ }
    if (!msg && res.status === 404) msg = 'Falta publicar la función que lee facturas en Supabase.';
    throw new Error(msg || 'No se pudo leer la factura.');
  }
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', texto = '', fin = null;
  for (;;) {
    const { value, done } = await lector.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const linea = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!linea) continue;
      const o = JSON.parse(linea);
      if (o.error) throw new Error(o.error);
      if (o.t) { texto += o.t; if (alPedazo) alPedazo(texto); }
      if (o.fin) fin = o;
    }
    if (done) break;
  }
  if (!fin) throw new Error('Se cortó la lectura. Probá de nuevo.');
  return { factura: JSON.parse(texto), modelo: fin.modelo, uso: fin.uso, ms: fin.ms };
}
// Comprobante de pago en foto o PDF escaneado (sin texto): lo lee la misma función con modo "comprobante".
// Devuelve los mismos campos que leerComprobante (comprobante.js) + es_comprobante.
export const leerComprobanteIA = async (archivos) => (await leerFactura(archivos, null, 'comprobante')).factura;
export const aliasProveedor = (localId) => todo(() => sb.from('producto_alias').select('id,producto_id,alias').eq('origen', 'proveedor').eq('local_id', localId).order('id'));
export const recibirConFactura = async (localId, proveedorId, items, factura, ordenId) =>
  ok(await sb.rpc('recibir_con_factura', { p_local: localId, p_proveedor: proveedorId, p_items: items, p_factura: factura, p_orden: ordenId || null }));

export async function guardarProducto(id, datos) {
  if (id) { await ok(await sb.from('productos').update(datos).eq('id', id).select('id')); return id; }
  const [r] = await ok(await sb.from('productos').insert(datos).select('id'));
  return r.id;
}
export const guardarPrecio = async (productoId, proveedorId, precio) =>
  ok(await sb.from('precios').insert({ producto_id: productoId, proveedor_id: proveedorId || null, precio, origen: 'manual' }).select('id'));

// ---- pedido sugerido (consumo de las últimas 4 semanas) ----
export const cargarSugerido = async (localId) => ok(await sb.rpc('sugerido_pedido', { p_local: localId }));

// ---- ventas de Núcleo, recetas y producción (solo gerencia) ----
export const cargarAliasNucleo = (localId) => todo(() => sb.from('producto_alias').select('id,producto_id,alias,cantidad_por_venta').eq('origen', 'nucleo').eq('local_id', localId).order('id'));
export const asociarNucleo = async (productoId, codigo, cantidadPorVenta = 1) =>
  ok(await sb.rpc('asociar_nucleo', { p_producto: productoId, p_codigo: codigo, p_cantidad_por_venta: cantidadPorVenta }));
// Plato que en realidad se vende tal cual: su código de Núcleo pasa a descontar un producto del stock (sin producto: el plato pasa a tener stock).
export const venderTalCual = async (platoId, productoId = null, cantidad = 1) =>
  ok(await sb.rpc('vender_tal_cual', { p_plato: platoId, p_producto: productoId, p_cantidad: cantidad }));
export const crearPlato = async (localId, codigo, nombre) => ok(await sb.rpc('crear_plato', { p_local: localId, p_codigo: codigo || '', p_nombre: nombre }));
export const importacionDelDia = async (localId, fecha) =>
  ok(await sb.from('ventas_import').select('id,archivo,n_pedidos,total_productos,creado_en').eq('local_id', localId).eq('fecha_desde', fecha).eq('fecha_hasta', fecha).limit(1));
export const importacionesRecientes = async (localId) =>
  ok(await sb.from('ventas_import').select('id,fecha_desde,archivo,n_pedidos,total_productos,creado_en').eq('local_id', localId).order('fecha_desde', { ascending: false }).order('creado_en', { ascending: false }).limit(15));
export const borrarImportacion = async (id) => ok(await sb.rpc('borrar_importacion', { p_import: id }));
// Cambia cómo se compra y se mide un producto; p_escala convierte lo ya cargado (0015_presentacion.sql).
export const cambiarPresentacion = async (productoId, unidadCompra, unidadUso, factor, escala) =>
  ok(await sb.rpc('cambiar_presentacion', { p_producto: productoId, p_unidad_compra: unidadCompra, p_unidad_uso: unidadUso, p_factor: factor, p_escala: escala }));
export const borrarTodosLosPedidos = async (confirmacion) => ok(await sb.rpc('borrar_todos_los_pedidos', { p_confirmacion: confirmacion }));
export const importarVentas = async (localId, fecha, pedidos, items, pagos, archivo) =>
  ok(await sb.rpc('importar_ventas', { p_local: localId, p_fecha: fecha, p_pedidos: pedidos, p_items: items, p_pagos: pagos, p_archivo: archivo || null }));
export const ventasPedidosRango = (localId, desde, hasta) => todo(() => sb.from('ventas_pedidos')
  .select('numero,fecha,fecha_hora,tipo_pedido,sector,mozo,mesa,total,ventas_pedido_pagos(forma_pago,monto)')
  .eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta).order('numero'));
export const ventasItemsRango = (localId, desde, hasta) => todo(() => sb.from('ventas_items')
  .select('id,pedido_numero,fecha,fecha_hora,codigo_origen,nombre_origen,cantidad,importe,rubro,subrubro,tipo_pedido,sector,producto_id')
  .eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta).order('id'));
// Todos los locales juntos (Ventas · Resumen): renglones y pedidos de un rango, sin filtrar por local.
export const ventasItemsTodos = (desde, hasta) => todo(() => sb.from('ventas_items')
  .select('id,local_id,fecha,codigo_origen,nombre_origen,cantidad,importe')
  .gte('fecha', desde).lte('fecha', hasta).order('id'));
export const ventasPedidosTodos = (desde, hasta) => todo(() => sb.from('ventas_pedidos')
  .select('local_id,numero,fecha').gte('fecha', desde).lte('fecha', hasta).order('local_id').order('numero'));
// Salidas de stock de un local desde una fecha (ventas, producción y merma), para las métricas de Stock.
export const movimientosLocal = (localId, desde) => todo(() => sb.from('movimientos').select('producto_id,tipo,cantidad,creado_en')
  .eq('local_id', localId).gte('creado_en', desde).in('tipo', ['venta', 'produccion_consumo', 'produccion_alta', 'merma', 'uso_dia']).order('creado_en').order('id'));
// Todos los movimientos de un local desde una fecha (para Inicio / Ahora / Dif. y los últimos ajustes en Stock).
export const movimientosDesde = (localId, desde) => todo(() => sb.from('movimientos').select('producto_id,tipo,cantidad,nota,creado_en')
  .eq('local_id', localId).gte('creado_en', desde).order('creado_en').order('id'));
// Ajuste a mano de gerencia: merma con motivo (cantidad negativa) o entrada sin pedido (positiva).
export const registrarAjuste = async (m) => ok(await sb.from('movimientos').insert([m]));
export const ultimaVentaSubida = async (localId) => (await ok(await sb.from('ventas_import').select('fecha_desde,creado_en')
  .eq('local_id', localId).order('creado_en', { ascending: false }).limit(1)))[0] || null;
export const cargarRecetas = () => todo(() => sb.from('recetas').select('*,receta_items(insumo_id,cantidad)').order('id'));
export const guardarReceta = async (productoId, rinde, items, notas) =>
  ok(await sb.rpc('guardar_receta', { p_producto: productoId, p_rinde: rinde, p_items: items, p_notas: notas || null }));
export const platosSinReceta = async (localId) => ok(await sb.from('platos_sin_receta').select('producto_id,codigo,nombre,vendidos,ultima_venta').eq('local_id', localId).order('vendidos', { ascending: false }));
export const registrarProduccion = async (localId, productoId, cantidad, nota) =>
  ok(await sb.rpc('registrar_produccion', { p_local: localId, p_producto: productoId, p_cantidad: cantidad, p_nota: nota || null }));
export const produccionesRecientes = async (localId) =>
  ok(await sb.from('producciones').select('id,producto_id,cantidad,nota,creado_en').eq('local_id', localId).order('creado_en', { ascending: false }).limit(12));
// Elaborados del local (encargado y gerencia): lo que se elaboró con lo que se usó de verdad, y el uso del día (0014_elaborados.sql).
export const registrarElaboracion = async (localId, productoId, cantidad, items, nota, encargado) =>
  ok(await sb.rpc('registrar_elaboracion', { p_local: localId, p_producto: productoId, p_cantidad: cantidad, p_items: items, p_nota: nota || null, p_encargado: encargado || null }));
export const cerrarServicio = async (localId, items, nota, encargado) =>
  ok(await sb.rpc('cerrar_servicio', { p_local: localId, p_items: items, p_nota: nota || null, p_encargado: encargado || null }));
export const borrarElaboracion = async (id) => ok(await sb.rpc('borrar_elaboracion', { p_id: id }));
export const elaboracionesDesde = async (localId, desdeISO) =>
  ok(await sb.from('producciones').select('id,tipo,producto_id,cantidad,items,nota,encargado,creado_en').eq('local_id', localId).gte('creado_en', desdeISO).order('creado_en', { ascending: false }).limit(60));
export const mermaControl = async (localId, desde, hasta) => ok(await sb.rpc('merma_control', { p_local: localId, p_desde: desde, p_hasta: hasta }));

// ---- facturas, pagos y comprobantes (gerencia y contadora) ----
const COLS_FAC = 'id,proveedor_id,numero,fecha,vencimiento,total,archivo,imputado,pendiente,vencida';
const COLS_PAGO = 'id,proveedor_id,monto,fecha,numero_operacion,cuenta_origen,banco,cuit_destino,banco_destino,cuenta_destino,concepto,descripcion,comprobante_path,avisado_en,creado_en';
export const cuentaCorriente = async () => ok(await sb.from('cuenta_corriente').select('proveedor_id,nombre,facturado,pagado,saldo').order('saldo', { ascending: false }));
export const facturasLista = (soloPendientes) => todo(() => {
  let q = sb.from('facturas_pendientes').select(COLS_FAC).order('fecha', { ascending: true }).order('numero', { ascending: true }).order('id');
  if (soloPendientes) q = q.gte('pendiente', 1); // menos de $1 (centavos que el banco no transfiere) cuenta como pagada
  return q;
});
export const facturasPendientesDe = async (proveedorId) =>
  ok(await sb.from('facturas_pendientes').select(COLS_FAC).eq('proveedor_id', proveedorId).gte('pendiente', 1).order('fecha', { ascending: true }).order('numero', { ascending: true }));
// Gasto en compras (vista gastos_compras, SQL 0019): facturas y recibos X con tipo, local, razón social, categoría y saldo.
const COLS_GASTO = 'id,proveedor_id,proveedor,numero,tipo,es_x,fecha,vencimiento,total,archivo,creado_en,local_id,local,razon_social,categoria,imputado,pendiente,pagada,vencida';
export const gastosCompras = (desde, hasta) => todo(() => {
  let q = sb.from('gastos_compras').select(COLS_GASTO).order('fecha', { ascending: true }).order('id');
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  return q;
});
export const borrarFactura = async (id) => ok(await sb.rpc('borrar_factura', { p_id: id }));
export const crearFactura = async (f) => { const [r] = await ok(await sb.from('facturas_proveedor').insert(f).select('id')); return r.id; };
export const pagosLista = async (limite = 80) => ok(await sb.from('pagos').select(COLS_PAGO).order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(limite));
export const pagoPorOperacion = async (op) => ok(await sb.from('pagos').select('id,proveedor_id,monto,fecha,numero_operacion').eq('numero_operacion', op).limit(1));
export const registrarPago = async (pago, imputaciones) => ok(await sb.rpc('registrar_pago', { p_pago: pago, p_imputaciones: imputaciones }));
export const marcarAvisado = async (pagoId) => ok(await sb.from('pagos').update({ avisado_en: new Date().toISOString() }).eq('id', pagoId).select('id,avisado_en'));
export async function subirComprobante(ruta, archivo) {
  const { error } = await sb.storage.from('comprobantes').upload(ruta, archivo, { upsert: true, contentType: archivo.type || 'application/pdf' });
  if (error) throw error;
  return ruta;
}
// ---- facturas que suben los locales (SQL 0022): el encargado sube el archivo sin montos; gerencia la recibe ----
const COLS_FL = 'id,local_id,proveedor_id,archivos,nota,subida_por_nombre,estado,factura_id,procesada_en,creado_en';
export async function subirArchivoLocal(ruta, archivo) {
  const { error } = await sb.storage.from('comprobantes').upload(ruta, archivo, { upsert: false, contentType: archivo.type || 'application/pdf' });
  if (error) throw error;
  return ruta;
}
export const crearFacturaLocal = async (f) => (await ok(await sb.from('facturas_locales').insert(f).select(COLS_FL)))[0];
export const facturasLocales = async ({ estado, limite = 60 } = {}) => {
  let q = sb.from('facturas_locales').select(COLS_FL).order('creado_en', { ascending: false }).limit(limite);
  if (estado) q = q.eq('estado', estado);
  return ok(await q);
};
export const facturaLocal = async (id) => (await ok(await sb.from('facturas_locales').select(COLS_FL).eq('id', id).limit(1)))[0] || null;
export const marcarFacturaLocal = async (id, estado, facturaId) => ok(await sb.from('facturas_locales')
  .update({ estado, factura_id: facturaId || null, procesada_en: estado === 'pendiente' ? null : new Date().toISOString() }).eq('id', id).select('id'));
export const borrarFacturaLocal = async (id) => ok(await sb.from('facturas_locales').delete().eq('id', id).select('id'));
export async function bajarComprobante(ruta) {
  const { data, error } = await sb.storage.from('comprobantes').download(ruta);
  if (error) throw error;
  return data;
}
export async function urlComprobante(ruta, nombreDescarga) {
  const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(ruta, 600, nombreDescarga ? { download: nombreDescarga } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
export const guardarProveedor = async (id, datos) => ok(await sb.from('proveedores').update(datos).eq('id', id).select('id'));
export const crearProveedor = async (datos) => { const [r] = await ok(await sb.from('proveedores').insert(datos).select('id')); return r.id; };

// ---- tablero de gerencia (una sola llamada) ----
export const tablero = async (localId, desde, hasta) => ok(await sb.rpc('tablero', { p_local: localId || null, p_desde: desde, p_hasta: hasta }));

// ---- notas del equipo ----
const COLS_NOTA = 'id,local_id,para,titulo,texto,color,etiquetas,autor_nombre,autor_rol,fijada,resuelta_en,resuelta_por,leida_en,creado_en,nota_respuestas(id,texto,autor_nombre,autor_rol,creado_en)';
export const cargarNotas = async () => ok(await sb.from('notas').select(COLS_NOTA).order('creado_en', { ascending: false }).limit(400));
export const crearNota = async (n) => (await ok(await sb.from('notas').insert(n).select(COLS_NOTA)))[0];
export const actualizarNota = async (id, cambios) => ok(await sb.from('notas').update(cambios).eq('id', id).select('id'));
export const borrarNota = async (id) => ok(await sb.from('notas').delete().eq('id', id).select('id'));
export const responderNota = async (r) => (await ok(await sb.from('nota_respuestas').insert(r).select('id,texto,autor_nombre,autor_rol,creado_en')))[0];
