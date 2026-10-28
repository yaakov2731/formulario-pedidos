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
  if (/email not confirmed/i.test(m)) return 'La cuenta todavía no está confirmada. Avisale a gerencia.';
  if (/too many requests|rate limit/i.test(m)) return 'Demasiados intentos. Esperá un minuto.';
  return m || 'Algo salió mal. Probá de nuevo.';
}

async function ok(res) {
  if (res.error) throw res.error;
  return res.data;
}

// Trae todas las filas de a 1000 (límite de PostgREST).
export async function todo(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await ok(await build().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// SWR: entrega primero lo cacheado (onData(datos, true)) y después lo fresco (onData(datos, false)).
export async function swr(clave, fetcher, onData) {
  const hit = lsGet('c:' + clave);
  if (hit && hit.d !== undefined) onData(hit.d, true);
  try {
    const d = await fetcher();
    lsSet('c:' + clave, { t: Date.now(), d });
    onData(d, false);
    return d;
  } catch (e) {
    if (hit && hit.d !== undefined) { onData(hit.d, false, e); return hit.d; }
    throw e;
  }
}
export function limpiarCache() {
  try { Object.keys(localStorage).filter(k => k.startsWith('stock:c:')).forEach(k => localStorage.removeItem(k)); } catch (_e) { /* nada */ }
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
const catalogo = (localId) => todo(() => {
  let q = sb.from('productos').select(COLS_PROD + (hayOculto ? ',oculto' : '')).order('nombre');
  if (localId) q = q.eq('local_id', localId).eq('activo', true);
  return q;
});
export const hayColumnaOculto = () => hayOculto;
export async function cargarCatalogo(localId) {
  try { return await catalogo(localId); } catch (e) {
    if (!hayOculto || !(e && (e.code === '42703' || /oculto/.test(e.message || '')))) throw e;
    hayOculto = false;
    return catalogo(localId);
  }
}
export const cargarStock = (localId) => todo(() => {
  let q = sb.from('stock_actual').select('local_id,producto_id,stock').order('producto_id');
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
export const cargarPrecios = async () => ok(await sb.from('precio_actual').select('producto_id,precio'));
export const buscarServidor = async (q, localId) => ok(await sb.rpc('buscar_productos', { q, p_local: localId || null }));

export async function misOrdenes(localId) {
  return ok(await sb.from('ordenes_compra')
    .select('id,estado,creado_en,cargado_por_nombre,nota,proveedor_id,orden_items(producto_id,cantidad_pedida)')
    .eq('local_id', localId).order('creado_en', { ascending: false }).limit(60));
}
// orden_items.excluido (migración 0009): producto destildado por gerencia. Si la columna todavía no existe, se lee sin ella.
const COLS_ORD = 'id,local_id,proveedor_id,estado,creado_en,cargado_por_nombre,nota,orden_items(id,producto_id,cantidad_pedida,cantidad_recibida,excluido)';
let hayExcluido = true;
const faltaColumna = (e) => e && (e.code === '42703' || /excluido/.test(e.message || ''));
async function selOrdenes(armar) {
  if (hayExcluido) {
    const r = await armar(COLS_ORD);
    if (!r.error) return r.data;
    if (!faltaColumna(r.error)) throw r.error;
    hayExcluido = false;
  }
  return ok(await armar(COLS_ORD.replace(',excluido', '')));
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
export async function registrarRecepcion(orden, lineas) {
  return ok(await sb.rpc('recibir_orden', {
    p_orden: orden.id,
    p_items: lineas.map(l => ({ orden_item_id: l.item.id, cantidad_recibida: l.qty, precio_unitario: l.precio }))
  }));
}

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
export const crearPlato = async (localId, codigo, nombre) => ok(await sb.rpc('crear_plato', { p_local: localId, p_codigo: codigo || '', p_nombre: nombre }));
export const importacionDelDia = async (localId, fecha) =>
  ok(await sb.from('ventas_import').select('id,archivo,n_pedidos,total_productos,creado_en').eq('local_id', localId).eq('fecha_desde', fecha).eq('fecha_hasta', fecha).limit(1));
export const importacionesRecientes = async (localId) =>
  ok(await sb.from('ventas_import').select('id,fecha_desde,archivo,n_pedidos,total_productos,creado_en').eq('local_id', localId).order('fecha_desde', { ascending: false }).order('creado_en', { ascending: false }).limit(15));
export const borrarImportacion = async (id) => ok(await sb.rpc('borrar_importacion', { p_import: id }));
export const importarVentas = async (localId, fecha, pedidos, items, pagos, archivo) =>
  ok(await sb.rpc('importar_ventas', { p_local: localId, p_fecha: fecha, p_pedidos: pedidos, p_items: items, p_pagos: pagos, p_archivo: archivo || null }));
export const ventasPedidosRango = (localId, desde, hasta) => todo(() => sb.from('ventas_pedidos')
  .select('numero,fecha,fecha_hora,tipo_pedido,sector,mozo,mesa,total,ventas_pedido_pagos(forma_pago,monto)')
  .eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta).order('numero'));
export const ventasItemsRango = (localId, desde, hasta) => todo(() => sb.from('ventas_items')
  .select('id,pedido_numero,fecha,fecha_hora,codigo_origen,nombre_origen,cantidad,importe,rubro,subrubro,tipo_pedido,sector,producto_id')
  .eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta).order('id'));
// Salidas de stock de un local desde una fecha (ventas, producción y merma), para las métricas de Stock.
export const movimientosLocal = (localId, desde) => todo(() => sb.from('movimientos').select('producto_id,tipo,cantidad,creado_en')
  .eq('local_id', localId).gte('creado_en', desde).in('tipo', ['venta', 'produccion_consumo', 'produccion_alta', 'merma', 'uso_dia']).order('creado_en'));
// Todos los movimientos de un local desde una fecha (para Inicio / Ahora / Dif. y los últimos ajustes en Stock).
export const movimientosDesde = (localId, desde) => todo(() => sb.from('movimientos').select('producto_id,tipo,cantidad,nota,creado_en')
  .eq('local_id', localId).gte('creado_en', desde).order('creado_en'));
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
  let q = sb.from('facturas_pendientes').select(COLS_FAC).order('fecha', { ascending: true }).order('numero', { ascending: true });
  if (soloPendientes) q = q.gt('pendiente', 0);
  return q;
});
export const facturasPendientesDe = async (proveedorId) =>
  ok(await sb.from('facturas_pendientes').select(COLS_FAC).eq('proveedor_id', proveedorId).gt('pendiente', 0).order('fecha', { ascending: true }).order('numero', { ascending: true }));
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
