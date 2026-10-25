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

// Recepción de una orden: movimientos (cantidad × factor), cantidades recibidas, precios y estado.
// El cliente no tiene transacciones: el orden de los pasos deja primero el stock y al final el estado.
export async function registrarRecepcion(orden, lineas, nuevoEstado) {
  const conQty = lineas.filter(l => l.qty > 0);
  if (conQty.length) {
    await ok(await sb.from('movimientos').insert(conQty.map(l => ({
      local_id: orden.local_id, producto_id: l.item.producto_id, tipo: 'recepcion',
      cantidad: Math.round(l.qty * Number(l.factor || 1) * 1000) / 1000, ref_tipo: 'orden', ref_id: orden.id, nota: 'Recepción de orden'
    }))));
  }
  for (const l of lineas) {
    if (l.qty > 0) await ok(await sb.from('orden_items').update({ cantidad_recibida: (Number(l.item.cantidad_recibida) || 0) + l.qty }).eq('id', l.item.id).select('id'));
    if (l.qty > 0 && l.precio !== null) await ok(await sb.from('orden_item_precios').upsert({ orden_item_id: l.item.id, precio_unitario: l.precio }).select('orden_item_id'));
  }
  const nuevos = conQty.filter(l => l.precio !== null && l.precio !== l.precioPrevio).map(l => ({ producto_id: l.item.producto_id, proveedor_id: orden.proveedor_id, precio: l.precio, origen: 'recepcion' }));
  if (nuevos.length) await ok(await sb.from('precios').insert(nuevos));
  await ok(await sb.from('ordenes_compra').update({ estado: nuevoEstado }).eq('id', orden.id).select('id'));
}

export async function guardarProducto(id, datos) {
  if (id) { await ok(await sb.from('productos').update(datos).eq('id', id).select('id')); return id; }
  const [r] = await ok(await sb.from('productos').insert(datos).select('id'));
  return r.id;
}
export const guardarPrecio = async (productoId, proveedorId, precio) =>
  ok(await sb.from('precios').insert({ producto_id: productoId, proveedor_id: proveedorId || null, precio, origen: 'manual' }).select('id'));
