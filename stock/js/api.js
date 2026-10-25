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
export const cargarCatalogo = (localId) => todo(() => {
  let q = sb.from('productos').select(COLS_PROD).order('nombre');
  if (localId) q = q.eq('local_id', localId).eq('activo', true);
  return q;
});
export const cargarStock = (localId) => todo(() => {
  let q = sb.from('stock_actual').select('local_id,producto_id,stock').order('producto_id');
  if (localId) q = q.eq('local_id', localId);
  return q;
});
export const cargarProveedoresBasico = async () => ok(await sb.from('proveedores_basico').select('id,nombre,dias_entrega,corte,tiene_minimo,activo').order('nombre'));
export const cargarProveedores = async () => ok(await sb.from('proveedores').select('id,nombre,whatsapp,dias_entrega,corte,pedido_minimo,activo').order('nombre'));
export const cargarLocales = async () => ok(await sb.from('locales').select('id,codigo,nombre,encargados,activo').order('nombre'));
export const cargarPrecios = async () => ok(await sb.from('precio_actual').select('producto_id,precio'));
export const buscarServidor = async (q, localId) => ok(await sb.rpc('buscar_productos', { q, p_local: localId || null }));

export async function misOrdenes(localId) {
  return ok(await sb.from('ordenes_compra')
    .select('id,estado,creado_en,cargado_por_nombre,nota,proveedor_id,orden_items(producto_id,cantidad_pedida)')
    .eq('local_id', localId).order('creado_en', { ascending: false }).limit(60));
}
export async function ordenesPorEstado(estados) {
  return ok(await sb.from('ordenes_compra')
    .select('id,local_id,proveedor_id,estado,creado_en,cargado_por_nombre,nota,orden_items(id,producto_id,cantidad_pedida,cantidad_recibida)')
    .in('estado', estados).order('creado_en', { ascending: true }).limit(500));
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
export const importarVentas = async (localId, fecha, pedidos, items, pagos, archivo) =>
  ok(await sb.rpc('importar_ventas', { p_local: localId, p_fecha: fecha, p_pedidos: pedidos, p_items: items, p_pagos: pagos, p_archivo: archivo || null }));
export const ventasPedidosRango = (localId, desde, hasta) => todo(() => sb.from('ventas_pedidos')
  .select('numero,fecha,fecha_hora,tipo_pedido,sector,mozo,mesa,total,ventas_pedido_pagos(forma_pago,monto)')
  .eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta).order('numero'));
export const ventasItemsRango = (localId, desde, hasta) => todo(() => sb.from('ventas_items')
  .select('id,pedido_numero,fecha,fecha_hora,codigo_origen,nombre_origen,cantidad,importe,rubro,subrubro,tipo_pedido,sector,producto_id')
  .eq('local_id', localId).gte('fecha', desde).lte('fecha', hasta).order('id'));
export const cargarRecetas = () => todo(() => sb.from('recetas').select('id,producto_id,rinde,notas,receta_items(insumo_id,cantidad)').order('id'));
export const guardarReceta = async (productoId, rinde, items, notas) =>
  ok(await sb.rpc('guardar_receta', { p_producto: productoId, p_rinde: rinde, p_items: items, p_notas: notas || null }));
export const platosSinReceta = async (localId) => ok(await sb.from('platos_sin_receta').select('producto_id,codigo,nombre,vendidos,ultima_venta').eq('local_id', localId).order('vendidos', { ascending: false }));
export const registrarProduccion = async (localId, productoId, cantidad, nota) =>
  ok(await sb.rpc('registrar_produccion', { p_local: localId, p_producto: productoId, p_cantidad: cantidad, p_nota: nota || null }));
export const produccionesRecientes = async (localId) =>
  ok(await sb.from('producciones').select('id,producto_id,cantidad,nota,creado_en').eq('local_id', localId).order('creado_en', { ascending: false }).limit(12));
export const mermaControl = async (localId, desde, hasta) => ok(await sb.rpc('merma_control', { p_local: localId, p_desde: desde, p_hasta: hasta }));
