#!/usr/bin/env node
// Prueba de punta a punta de stock/ (manual, no corre en CI). Levanta un servidor estático del repo y mockea con
// page.route toda la API de Supabase. Recorre encargado (login, pedir, revisar, enviar, mis pedidos) y gerencia
// (pedidos, aprobar, WhatsApp, recibir, stock, catálogo, ventas de Núcleo, análisis, recetas, producción y merma). Guarda capturas en OUT
// (por defecto /mnt/project-files/app-stock/fase3).
// Uso: node scripts/e2e-stock.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/fase3');
const SB = 'https://zunyzlpzofbyqplgiupl.supabase.co';
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function servidor() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve(s));
  });
}

// ---------- datos de ejemplo ----------
const L1 = 'loc-umo', L2 = 'loc-tre';
const PV = { barcena: 'prv-barcena', florida: 'prv-florida', martin: 'prv-martin' };
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const prod = (id, codigo, nombre, cat, uc, uu, factor, prov, par, local = L1) => ({ id, codigo, nombre, local_id: local, categoria: cat, unidad_compra: uc, unidad_uso: uu, factor_conversion: factor, proveedor_id: prov, par, es_elaborado: false, activo: true });
const db = {
  locales: [
    { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth Coronel', 'Maru', 'Ayelén'], activo: true },
    { id: L2, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true },
    { id: 'loc-brk', codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true },
    { id: 'loc-gel', codigo: 'GEL', nombre: 'Puerto Gelato', encargados: [], activo: true }
  ],
  proveedores: [
    { id: PV.barcena, nombre: 'Barcena', whatsapp: '5491155550003', dias_entrega: '1 día · pedir antes del jueves', corte: null, pedido_minimo: null, activo: true },
    { id: PV.florida, nombre: 'Distribuidora Florida', whatsapp: '+54 9 11 5555-0001', dias_entrega: 'Sábado', corte: 'Miércoles', pedido_minimo: null, activo: true },
    { id: PV.martin, nombre: 'Martín De Ridder', whatsapp: '5491155550002', dias_entrega: 'Martes y viernes', corte: null, pedido_minimo: 100000, activo: true }
  ],
  productos: [
    prod('p-chorizo', 'UMO-001', 'Chorizo parrillero', 'Carnes', 'kg', 'kg', 1, PV.barcena, 8),
    prod('p-bondiola', 'UMO-002', 'Bondiola de cerdo', 'Carnes', 'kg', 'kg', 1, PV.martin, null),
    prod('p-mozza', 'UMO-003', 'Mozzarella en barra', 'Lácteos', 'kg', 'kg', 1, PV.barcena, 10),
    prod('p-queso', 'UMO-004', 'Queso cremoso', 'Lácteos', 'kg', 'kg', 1, PV.barcena, null),
    prod('p-cerveza', 'UMO-005', 'Cerveza rubia lata 473 ml', 'Bebidas', 'caja x 6', 'unidad', 6, PV.florida, null),
    prod('p-gaseosa', 'UMO-006', 'Gaseosa cola 1,5 l', 'Bebidas', 'pack x 6', 'unidad', 6, PV.florida, null),
    prod('p-agua', 'UMO-007', 'Agua sin gas 500 ml', 'Bebidas', 'pack x 12', 'unidad', 12, PV.florida, null),
    prod('p-servilleta', 'UMO-008', 'Servilletas de papel', 'Descartables', 'paquete', 'paquete', 1, null, null),
    prod('p-trento', 'TRE-001', 'Café en grano', 'Café', 'kg', 'kg', 1, PV.barcena, null, L2)
  ],
  stock: [
    { local_id: L1, producto_id: 'p-chorizo', stock: 3 }, { local_id: L1, producto_id: 'p-mozza', stock: 4 },
    { local_id: L1, producto_id: 'p-cerveza', stock: 12 }, { local_id: L1, producto_id: 'p-gaseosa', stock: 6 },
    { local_id: L1, producto_id: 'p-bondiola', stock: 2 }, { local_id: L1, producto_id: 'p-queso', stock: 1.5 }
  ],
  precios: { 'p-chorizo': 6200, 'p-cerveza': 9800, 'p-gaseosa': 7400, 'p-bondiola': 8900, 'p-mozza': 9500 },
  ordenes: [], recepciones: [], items: [], movimientos: [], preciosNuevos: [], itemPrecios: [], conteos: [], log: [],
  // fase 3
  consumo: { 'p-chorizo': 9 },           // consumo semanal (unidad de uso) que usa el sugerido por consumo
  alias: [], recetas: [], importaciones: [], producciones: [], asociaciones: [], platosCreados: [], recetasGuardadas: [], produccionesReg: [], importaciones_rpc: []
};
let seq = 1;
const nid = (p) => p + '-' + (seq++);

function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub, email) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
const subDe = (req) => { try { return JSON.parse(Buffer.from((req.headers().authorization || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch (_e) { return null; } };
const eq = (v) => (v && v.startsWith('eq.') ? v.slice(3) : null);
const enLista = (v) => (v && v.startsWith('in.(') ? v.slice(4, -1).split(',') : null);

async function montarApi(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://wa.me/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>wa.me</p>' }));
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const sub = subDe(req);
    const rol = sub === U_GER ? 'gerencia' : (sub === U_ENC ? 'encargado' : null);
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(q), b: body(), rol });

    if (u.pathname === '/auth/v1/token') {
      const b = body() || {};
      if (u.searchParams.get('grant_type') === 'refresh_token') return json(sesion(String(b.refresh_token || '').slice(2), 'x@x'));
      if (b.email === 'local-umo@docks-stock.app' && b.password === '1234') return json(sesion(U_ENC, b.email));
      if (b.email === 'jacobo@ejemplo.com' && b.password === 'clave-segura') return json(sesion(U_GER, b.email));
      return json({ error: 'invalid_grant', error_code: 'invalid_credentials', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC, 'x@x').user);
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (!u.pathname.startsWith('/rest/v1/')) return json({}, 404);

    if (t === 'rpc/locales_login') return json(db.locales.map(l => ({ codigo: l.codigo, nombre: l.nombre, encargados: l.encargados })));
    if (!rol) return json({ code: '42501', message: 'permission denied' }, 401);
    const esGet = req.method() === 'GET';
    const ver = (arr) => arr;
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'Local Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(rol === 'gerencia' ? db.locales : db.locales.filter(l => l.id === L1));
    if (t === 'productos') {
      if (req.method() === 'POST') { const b = body(); const r = { ...b, id: nid('p'), es_elaborado: !!b.es_elaborado }; db.productos.push(r); return json([r], 201); }
      if (req.method() === 'PATCH') { const id = eq(q.get('id')); const p = db.productos.find(x => x.id === id); Object.assign(p, body()); return json([{ id }]); }
      let r = db.productos; if (rol === 'encargado') r = r.filter(p => p.local_id === L1);
      if (eq(q.get('local_id'))) r = r.filter(p => p.local_id === eq(q.get('local_id')));
      return json(r);
    }
    if (t === 'stock_actual') return json(rol === 'gerencia' ? db.stock : db.stock.filter(s => s.local_id === L1));
    if (t === 'proveedores_basico') return json(db.proveedores.map(p => ({ id: p.id, nombre: p.nombre, dias_entrega: p.dias_entrega, corte: p.corte, tiene_minimo: !!p.pedido_minimo, activo: true })));
    if (t === 'proveedores') return rol === 'gerencia' ? json(db.proveedores) : json([]);
    if (t === 'precio_actual') return rol === 'gerencia' ? json(Object.entries(db.precios).map(([producto_id, precio]) => ({ producto_id, precio }))) : json([]);
    if (t === 'rpc/buscar_productos') { const b = body(); const n = (b.q || '').toLowerCase(); return json(db.productos.filter(p => p.local_id === (b.p_local || p.local_id) && p.nombre.toLowerCase().includes(n)).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, local_id: p.local_id, score: 0.8 }))); }
    if (t === 'rpc/registrar_conteo') { const b = body(); if (rol !== 'gerencia') return json({ code: '42501', message: 'new row violates row-level security policy' }, 403); db.conteos.push(b); const s = db.stock.find(x => x.producto_id === b.p_producto && x.local_id === b.p_local); const dif = b.p_cantidad_contada - (s ? s.stock : 0); if (s) s.stock = b.p_cantidad_contada; else db.stock.push({ local_id: b.p_local, producto_id: b.p_producto, stock: b.p_cantidad_contada }); return json(dif); }


    // ---- fase 2: sugerido por consumo (el encargado lo lee de su local, sin precios) ----
    if (t === 'rpc/sugerido_pedido') {
      const b = body(); if (rol === 'encargado' && b.p_local !== L1) return json([]);
      return json(db.productos.filter(p => p.local_id === b.p_local && p.activo !== false && p.categoria !== 'Carta').map(p => {
        const st = (db.stock.find(x => x.producto_id === p.id && x.local_id === p.local_id) || { stock: 0 }).stock; const cons = db.consumo[p.id] || null;
        const sug = cons > 0 ? Math.max(0, Math.ceil((cons - st) / p.factor_conversion)) : (p.par !== null && p.par !== undefined ? Math.max(0, (p.par - st) / p.factor_conversion) : 0);
        return { producto_id: p.id, stock: st, consumo_semanal: cons, pendiente: 0, sugerido: sug };
      }));
    }
    // ---- fase 3: solo gerencia ----
    const soloGer = /^(producto_alias|ventas_|recetas|receta_items|platos_sin_receta|producciones|rpc\/(asociar_nucleo|crear_plato|importar_ventas|guardar_receta|registrar_produccion|merma_control))/;
    if (soloGer.test(t) && rol !== 'gerencia') return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
    if (t === 'producto_alias') { const l = eq(q.get('local_id')); return json(db.alias.filter(a => !l || a.local_id === l)); }
    if (t === 'rpc/asociar_nucleo') {
      const b = body(); const p = db.productos.find(x => x.id === b.p_producto);
      db.alias = db.alias.filter(a => !(a.local_id === p.local_id && a.alias.toLowerCase() === b.p_codigo.toLowerCase()));
      db.alias.push({ id: nid('al'), producto_id: p.id, alias: b.p_codigo, local_id: p.local_id, cantidad_por_venta: b.p_cantidad_por_venta });
      db.asociaciones.push(b); return json('al-ok');
    }
    if (t === 'rpc/crear_plato') {
      const b = body(); const clave = b.p_codigo || b.p_nombre; const id = nid('pla');
      db.productos.push({ id, codigo: 'PLA-' + clave.toUpperCase(), nombre: b.p_nombre, local_id: b.p_local, categoria: 'Carta', unidad_compra: null, unidad_uso: 'porción', factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: true, activo: true });
      db.alias.push({ id: nid('al'), producto_id: id, alias: clave, local_id: b.p_local, cantidad_por_venta: 1 });
      db.platosCreados.push(b); return json(id);
    }
    const imps = () => db.importaciones;
    if (t === 'ventas_import') { const l = eq(q.get('local_id')); const f = (q.getAll('fecha_desde')[0] || '').replace('eq.', ''); const x = imps().find(i => i.local_id === l && i.fecha === f); return json(x ? [{ id: x.id, archivo: x.archivo, n_pedidos: x.pedidos.length, total_productos: 0, creado_en: new Date().toISOString() }] : []); }
    if (t === 'rpc/importar_ventas') {
      const b = body(); db.importaciones_rpc.push(b);
      const prev = imps().findIndex(i => i.local_id === b.p_local && i.fecha === b.p_fecha); if (prev >= 0) imps().splice(prev, 1);
      imps().push({ id: nid('imp'), local_id: b.p_local, fecha: b.p_fecha, archivo: b.p_archivo, pedidos: b.p_pedidos, items: b.p_items, pagos: b.p_pagos });
      const sin = new Map();
      for (const it of b.p_items) { const p = db.productos.find(x => x.id === it.producto_id); if (p && p.es_elaborado && !it.no_descontar && !db.recetas.some(r => r.producto_id === p.id)) { const a = sin.get(p.id) || { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 0 }; a.cantidad += it.cantidad; sin.set(p.id, a); } }
      return json({ import_id: 'imp', reemplazo: prev >= 0, items: b.p_items.length, pedidos: b.p_pedidos.length, pagos: b.p_pagos.length, movimientos: 7, no_descontados: b.p_items.filter(i => i.no_descontar).length, sin_receta: [...sin.values()].sort((x, y) => y.cantidad - x.cantidad) });
    }
    const enRango = (i) => { const g = q.getAll('fecha'); const d = (g.find(x => x.startsWith('gte.')) || 'gte.0000').slice(4), h2 = (g.find(x => x.startsWith('lte.')) || 'lte.9999').slice(4); return i.local_id === eq(q.get('local_id')) && i.fecha >= d && i.fecha <= h2; };
    if (t === 'ventas_pedidos') return json(imps().filter(enRango).flatMap(i => i.pedidos.map(p => ({ numero: p.numero, fecha: i.fecha, fecha_hora: p.fecha_hora, tipo_pedido: p.tipo_pedido, sector: p.sector, mozo: p.mozo, mesa: p.mesa, total: p.total,
      ventas_pedido_pagos: i.pagos.filter(g => g.pedido_numero === p.numero).map(g => ({ forma_pago: g.forma_pago, monto: g.monto })) }))));
    if (t === 'ventas_items') return json(imps().filter(enRango).flatMap(i => i.items.map((it, n) => ({ id: i.id + n, pedido_numero: it.pedido_numero, fecha: i.fecha, fecha_hora: it.fecha_hora, codigo_origen: it.codigo, nombre_origen: it.nombre, cantidad: it.cantidad, importe: it.importe, rubro: it.rubro, subrubro: it.subrubro, tipo_pedido: it.tipo_pedido, sector: it.sector, producto_id: it.producto_id }))));
    if (t === 'recetas') return json(db.recetas);
    if (t === 'rpc/guardar_receta') {
      const b = body(); db.recetasGuardadas.push(b); db.recetas = db.recetas.filter(r => r.producto_id !== b.p_producto);
      db.recetas.push({ id: nid('rec'), producto_id: b.p_producto, rinde: b.p_rinde, notas: b.p_notas, receta_items: b.p_items.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })) }); return json('rec');
    }
    if (t === 'platos_sin_receta') {
      const m = new Map();
      for (const i of imps().filter(x => x.local_id === eq(q.get('local_id')))) for (const it of i.items) { const p = db.productos.find(x => x.id === it.producto_id); if (p && p.es_elaborado && !it.no_descontar && !db.recetas.some(r => r.producto_id === p.id && r.receta_items.length)) { const a = m.get(p.id) || { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, vendidos: 0, ultima_venta: i.fecha }; a.vendidos += it.cantidad; m.set(p.id, a); } }
      return json([...m.values()].sort((a, b) => b.vendidos - a.vendidos));
    }
    if (t === 'rpc/registrar_produccion') {
      const b = body(); db.produccionesReg.push(b);
      db.producciones.unshift({ id: nid('prd'), producto_id: b.p_producto, cantidad: b.p_cantidad, nota: b.p_nota, creado_en: new Date().toISOString() });
      const s = db.stock.find(x => x.producto_id === b.p_producto && x.local_id === b.p_local); if (s) s.stock += b.p_cantidad; else db.stock.push({ local_id: b.p_local, producto_id: b.p_producto, stock: b.p_cantidad });
      return json('prd');
    }
    if (t === 'producciones') return json(db.producciones);
    if (t === 'rpc/merma_control') {
      const b = body(); const f = (id, vendido, producido, ajuste, precioUso) => { const p = db.productos.find(x => x.id === id); return { producto_id: id, codigo: p.codigo, nombre: p.nombre, unidad_uso: p.unidad_uso, vendido, producido, teorico: vendido + producido, merma: 0, ajuste, precio_uso: precioUso, valor_ajuste: precioUso === null ? null : Math.round(ajuste * precioUso * 100) / 100 }; };
      return json(b.p_local === L1 ? [f('p-chorizo', 38.5, 0, -2.5, 6200), f('p-cerveza', 96, 0, -12, 1633.33), f('p-mozza', 21, 0, -1.2, 9500), f('p-queso', 14, 0, 0.8, null), f('p-gaseosa', 40, 0, 0, 1233.33)] : []);
    }

    if (t === 'ordenes_compra') {
      if (req.method() === 'POST') { const b = body(); const o = { ...b, id: nid('ord'), creado_en: new Date().toISOString(), creado_por: U_ENC }; db.ordenes.push(o); return json([{ id: o.id }], 201); }
      if (req.method() === 'PATCH') { const id = eq(q.get('id')); const o = db.ordenes.find(x => x.id === id); Object.assign(o, body()); return json([{ id }]); }
      let r = db.ordenes; const est = enLista(q.get('estado')); if (est) r = r.filter(o => est.includes(o.estado));
      if (eq(q.get('local_id'))) r = r.filter(o => o.local_id === eq(q.get('local_id')));
      if (rol === 'encargado') r = r.filter(o => o.local_id === L1);
      r = r.map(o => ({ ...o, orden_items: db.items.filter(i => i.orden_id === o.id).map(i => ({ id: i.id, producto_id: i.producto_id, cantidad_pedida: i.cantidad_pedida, cantidad_recibida: i.cantidad_recibida })) }));
      r.sort((a, b) => (q.get('order') || '').includes('desc') ? b.creado_en.localeCompare(a.creado_en) : a.creado_en.localeCompare(b.creado_en));
      return json(r);
    }
    if (t === 'orden_items') {
      if (req.method() === 'POST') { const b = body(); (Array.isArray(b) ? b : [b]).forEach(i => db.items.push({ ...i, id: nid('it'), cantidad_recibida: null })); return json((Array.isArray(b) ? b : [b]).map(i => ({ id: 'x' })), 201); }
      if (req.method() === 'PATCH') { const id = eq(q.get('id')); const i = db.items.find(x => x.id === id); Object.assign(i, body()); return json([{ id }]); }
      if (req.method() === 'DELETE') { const id = eq(q.get('id')); db.items = db.items.filter(x => x.id !== id); return json([{ id }]); }
    }
    if (t === 'movimientos' && req.method() === 'POST') { if (rol !== 'gerencia') return json({ code: '42501', message: 'row-level security' }, 403); const b = body(); db.movimientos.push(...b); return route.fulfill({ status: 201, headers: cors, body: '' }); }
    if (t === 'rpc/recibir_orden') {
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Sin permiso para recibir órdenes' }, 403);
      const b = body(); db.recepciones.push(b);
      const o = db.ordenes.find(x => x.id === b.p_orden);
      for (const it of b.p_items) {
        const item = db.items.find(i => i.id === it.orden_item_id); const p = db.productos.find(x => x.id === item.producto_id);
        if (it.cantidad_recibida > 0) {
          db.movimientos.push({ local_id: o.local_id, producto_id: item.producto_id, tipo: 'recepcion', cantidad: it.cantidad_recibida * p.factor_conversion, ref_id: o.id });
          item.cantidad_recibida = (item.cantidad_recibida || 0) + it.cantidad_recibida;
          if (it.precio_unitario !== null && it.precio_unitario !== db.precios[item.producto_id]) { db.preciosNuevos.push({ producto_id: item.producto_id, precio: it.precio_unitario, origen: 'recepcion' }); db.precios[item.producto_id] = it.precio_unitario; }
        }
      }
      o.estado = db.items.filter(i => i.orden_id === o.id).every(i => (i.cantidad_recibida || 0) >= i.cantidad_pedida) ? 'recibida' : 'parcial';
      return json(o.estado);
    }
    if (t === 'orden_item_precios') { const b = body(); db.itemPrecios.push(b); return json([b], 201); }
    if (t === 'precios' && req.method() === 'POST') { const b = body(); (Array.isArray(b) ? b : [b]).forEach(r => { db.preciosNuevos.push(r); db.precios[r.producto_id] = r.precio; }); return json([{ id: 'pr' }], 201); }
    return json({ message: 'mock: ruta no prevista ' + req.method() + ' ' + t }, 404);
  });
}

// ---------- recorrido ----------
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full });

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const nuevo = async (opts) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    return c;
  };
  const vigilar = (p, tag) => {
    p.on('pageerror', e => errores.push(`${tag} pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|ERR_BLOCKED|status of 40[01]|status of 400/i.test(m.text())) errores.push(`${tag} console: ${m.text()}`); });
  };
  const LUNES = new Date('2026-10-26T10:00:00-03:00'), JUEVES = new Date('2026-10-29T10:00:00-03:00');
  const nuevaPagina = async (ctx, tag, fecha = LUNES) => { const p = await ctx.newPage(); vigilar(p, tag); await p.clock.setFixedTime(fecha); return p; };

  // ===== Encargado · celular, claro =====
  const cEnc = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const e = await nuevaPagina(cEnc, 'encargado');
  await e.goto(BASE);
  await e.waitForSelector('.local-btn');
  await shot(e, '01-entrar-m');
  // PIN incorrecto: mensaje claro
  await e.getByRole('radio', { name: 'Umo Grill' }).click();
  await e.getByRole('radio', { name: 'Ruth Coronel' }).click();
  await e.locator('#in-pin').fill('9999');
  await e.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await e.waitForSelector('.banner-error');
  ok((await e.locator('.banner-error').innerText()).includes('PIN o contraseña incorrectos'), 'PIN incorrecto muestra mensaje claro');
  await shot(e, '02-entrar-error-m');
  await e.locator('#in-pin').fill('1234');
  await e.locator('form button[type=submit]').click();
  await e.waitForSelector('.prod');
  ok(await e.locator('h1').first().innerText() === 'Pedir', 'encargado cae en "Pedir"');
  ok((await e.locator('.vista-head .sub').innerText()).includes('Umo Grill'), 'muestra el local');
  ok(await e.locator('.prod').count() === 8, 'catálogo solo del local (8 productos, sin los de Trento)');
  const pedirChorizo = await e.locator('.prod[data-id="p-chorizo"] .step-val').inputValue();
  ok(pedirChorizo === '6', `Chorizo precargado con el sugerido por consumo (consumo semanal 9 − quedan 3 = 6, no la cantidad ideal 8 − 3): ${pedirChorizo}`);
  ok(db.log.some(l => l.t === 'rpc/sugerido_pedido' && l.rol === 'encargado' && l.b.p_local === L1), 'Pedir lee sugerido_pedido de su local');
  ok(await e.locator('.prod[data-id="p-mozza"] .step-val').inputValue() === '6', 'sin consumo, el sugerido sigue siendo la cantidad ideal menos lo que queda (10 − 4 = 6)');
  ok((await e.locator('.prod[data-id="p-chorizo"] .quedan').innerText()).replace(/\s+/g, ' ').includes('Quedan 3'), '"Quedan 3" visible');
  ok(await e.locator('.prod[data-id="p-bondiola"] .step-val').inputValue() === '0', 'sin par: Pedir arranca en 0');
  ok((await e.locator('.pill').innerText()).includes('2 ítems'), 'píldora arranca con los 2 sugeridos');
  await shot(e, '03-pedir-m');
  // buscador
  await e.locator('#buscar').fill('cerv');
  ok(await e.locator('.prod').count() === 1, 'buscador filtra al instante');
  await e.locator('#buscar').fill('');
  // sumar 3 productos (+ uno sin proveedor)
  await e.getByRole('button', { name: 'Más · Pedir Cerveza rubia lata 473 ml', exact: true }).click();
  await e.getByRole('button', { name: 'Más · Pedir Cerveza rubia lata 473 ml', exact: true }).click();
  await e.getByRole('button', { name: 'Más · Pedir Gaseosa cola 1,5 l', exact: true }).click();
  await e.getByRole('button', { name: 'Más · Pedir Bondiola de cerdo', exact: true }).click();
  await e.getByRole('button', { name: 'Más · Pedir Servilletas de papel', exact: true }).click();
  ok((await e.locator('.pill').innerText()).includes('6 ítems'), 'píldora suma a 6 ítems');
  await e.locator('.chip', { hasText: 'Bebidas' }).click();
  ok(await e.locator('.prod').count() === 3, 'filtro por categoría');
  await e.locator('.chip', { hasText: 'Todas' }).click();
  await e.locator('.pill').click();
  await e.waitForSelector('.grupo-prov');
  ok(await e.locator('h1').first().innerText() === 'Revisar pedido', 'Revisar pedido');
  ok(await e.locator('.grupo-prov').count() === 4, 'agrupa por proveedor (3 + Sin proveedor)');
  ok(await e.locator('.grupo-prov[data-prov="Sin proveedor"]').count() === 1, 'grupo "Sin proveedor"');
  const martin = await e.locator('.grupo-prov[data-prov="Martín De Ridder"]').innerText();
  ok(/pedido mínimo, gerencia lo revisa/.test(martin) && !/100\.?000/.test(martin), 'Martín: aviso de mínimo sin mostrar el monto');
  ok(/12 h del día hábil anterior/.test(martin), 'Martín: corte 12 h del día hábil anterior');
  await e.locator('#rev-nota').fill('Entregar antes de las 10');
  await shot(e, '04-revisar-m', true);
  const antes = db.log.length;
  await e.getByRole('button', { name: 'Enviar pedido' }).click();
  await e.waitForSelector('.ped');
  const posts = db.log.slice(antes).filter(l => l.m === 'POST' && (l.t === 'ordenes_compra' || l.t === 'orden_items'));
  const postOrd = posts.filter(l => l.t === 'ordenes_compra');
  ok(postOrd.length === 4, `4 órdenes creadas (3 proveedores + sin proveedor): ${postOrd.length}`);
  ok(postOrd.filter(l => l.b.proveedor_id === null).length === 1, 'el grupo "Sin proveedor" viaja con proveedor_id null');
  ok(postOrd.every(l => l.b.estado === 'borrador' && l.b.local_id === L1 && l.b.cargado_por_nombre === 'Ruth Coronel' && l.b.nota === 'Entregar antes de las 10'), 'órdenes en estado borrador, con local, nombre y nota');
  ok(posts.every(l => !/precio|costo|importe/i.test(JSON.stringify(l.b))), 'ningún POST del encargado incluye costos');
  const itemsEnviados = posts.filter(l => l.t === 'orden_items').flatMap(l => l.b);
  ok(itemsEnviados.length === 6 && itemsEnviados.some(i => i.producto_id === 'p-servilleta'), `6 ítems enviados, incluida la servilleta sin proveedor (${itemsEnviados.length})`);
  ok(db.log.slice(antes).every(l => !(l.t === 'movimientos')), 'el encargado no escribe movimientos');
  ok(db.log.filter(l => l.rol === 'encargado').every(l => !/ventas|receta|produccion|merma|alias|importar|precio/i.test(l.t)), 'el encargado nunca consulta ventas, recetas, producción, merma ni precios ' + [...new Set(db.log.filter(l => l.rol === 'encargado' && /ventas|receta|produccion|merma|alias|importar|precio/i.test(l.t)).map(l => l.t))].join());
  ok(db.log.filter(l => l.t === 'rpc/sugerido_pedido').every(l => l.rol !== null), 'sugerido_pedido solo con sesión');
  ok(await e.locator('.ped').count() === 4, 'Mis pedidos lista 4 pedidos');
  ok((await e.locator('.ped').first().innerText()).includes('En revisión'), 'estado "En revisión"');
  await e.locator('.ped-b').first().click();
  await shot(e, '05-mis-pedidos-m', true);
  ok(await e.locator('a[data-nav]').count() === 4 || await e.locator('.tab').count() >= 2, 'encargado solo tiene Pedir / Mis pedidos / Salir');
  const navTxt = (await e.locator('.tabbar').innerText()).toLowerCase();
  ok(!/stock|recibir|cat[aá]logo/.test(navTxt), 'encargado sin secciones de gerencia');
  await e.goto(BASE + '#/catalogo');
  await e.waitForSelector('.prod');
  ok(await e.locator('h1').first().innerText() === 'Pedir', 'ruta de gerencia redirige al encargado a Pedir');
  await cEnc.close();

  // ===== Encargado · celular, oscuro, jueves =====
  const cEncD = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const d = await nuevaPagina(cEncD, 'encargado-oscuro', JUEVES);
  await d.goto(BASE);
  await d.waitForSelector('.local-btn');
  await shot(d, '06-entrar-m-oscuro');
  await d.getByRole('radio', { name: 'Umo Grill' }).click();
  await d.getByRole('radio', { name: 'Otro' }).click();
  await d.locator('#in-nombre').fill('Lucía');
  await d.locator('#in-pin').fill('1234');
  await d.locator('form button[type=submit]').click();
  await d.waitForSelector('.prod');
  ok((await d.locator('.banner-warn').first().innerText()).includes('Distribuidora Florida'), 'jueves: aviso de cierre (solo Distribuidora Florida)');
  await shot(d, '07-pedir-m-oscuro');
  await d.locator('.pill').click();
  await d.waitForSelector('.grupo-prov');
  ok((await d.locator('.grupo-prov[data-prov="Barcena"]').innerText()).includes('Fuera de fecha'), 'jueves: marca proveedores fuera de fecha');
  await shot(d, '08-revisar-m-oscuro', true);
  await cEncD.close();

  // ===== Encargado · escritorio =====
  const cEncW = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  const w = await nuevaPagina(cEncW, 'encargado-pc');
  await w.goto(BASE);
  await w.waitForSelector('.local-btn');
  await w.getByRole('radio', { name: 'Umo Grill' }).click();
  await w.getByRole('radio', { name: 'Maru' }).click();
  await w.locator('#in-pin').fill('1234');
  await w.locator('form button[type=submit]').click();
  await w.waitForSelector('.prod');
  await shot(w, '09-pedir-pc');
  // recarga: sesión persistente y arranque con caché
  await w.reload();
  await w.waitForSelector('.prod');
  ok(await w.locator('.prod').count() === 8, 'sesión persistente tras recargar');
  await cEncW.close();

  // ===== Gerencia · escritorio =====
  const cGer = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  const g = await nuevaPagina(cGer, 'gerencia');
  await g.goto(BASE);
  await g.waitForSelector('.seg');
  await g.getByRole('tab', { name: 'Administración' }).click();
  await g.locator('#in-email').fill('jacobo@ejemplo.com');
  await g.locator('#in-pass').fill('clave-segura');
  await g.locator('form button[type=submit]').click();
  await g.waitForSelector('.grupo-prov', { timeout: 8000 }).catch(async () => { console.log('DEBUG', (await g.locator('body').innerText()).slice(0, 400)); console.log(JSON.stringify(db.log.slice(-8))); throw new Error('Pedidos no cargó'); });
  ok(await g.locator('.sidebar .side-link').count() === 7, 'gerencia: barra lateral con 6 secciones (Pedidos, Recibir, Stock, Ventas, Cocina, Catálogo) + Salir');
  ok(await g.locator('.grupo-prov').count() === 4, 'Pedidos: borradores por proveedor (3) + Sin proveedor');
  const sinP = g.locator('.grupo-prov[data-prov="Sin proveedor"]');
  ok(await sinP.getByRole('button', { name: 'Aprobar' }).isDisabled() && await sinP.getByRole('button', { name: 'Enviar por WhatsApp' }).isDisabled(), 'Sin proveedor: Aprobar y WhatsApp deshabilitados');
  await shot(g, '10b-g-pedidos-sin-proveedor-pc');
  await sinP.getByLabel('Asignar proveedor').selectOption(PV.barcena);
  await g.waitForSelector('.grupo-prov[data-prov="Sin proveedor"]', { state: 'detached' });
  ok(db.ordenes.filter(o => o.proveedor_id === PV.barcena).length === 2, 'asignar proveedor actualiza la orden (queda con Barcena)');
  ok(await g.locator('.grupo-prov').count() === 3, 'tras asignar, la orden se agrupa con su proveedor');
  const martinG = await g.locator('.grupo-prov[data-prov="Martín De Ridder"]').innerText();
  ok(/Pedido mínimo \$ 100\.000/.test(martinG), 'gerencia ve el mínimo de Martín De Ridder');
  await shot(g, '10-g-pedidos-pc');
  // editar una cantidad
  const florida = g.locator('.grupo-prov[data-prov="Distribuidora Florida"]');
  await florida.getByRole('button', { name: /^Más · Cantidad de Cerveza/ }).click();
  await g.waitForTimeout(700);
  ok(db.items.find(i => i.producto_id === 'p-cerveza').cantidad_pedida === 3, 'editar cantidad guarda el ítem (2 → 3)');
  await florida.getByRole('button', { name: 'Menos · Cantidad de Cerveza rubia lata 473 ml' }).click();
  await g.waitForTimeout(700);
  // aprobar
  const a0 = db.log.length;
  await florida.getByRole('button', { name: 'Aprobar' }).click();
  await g.waitForTimeout(500);
  ok(db.ordenes.find(o => o.proveedor_id === PV.florida).estado === 'aprobada', 'Aprobar pasa la orden a "aprobada"');
  ok(db.log.slice(a0).some(l => l.m === 'PATCH' && l.t === 'ordenes_compra' && l.b.estado === 'aprobada'), 'PATCH estado aprobada');
  await shot(g, '11-g-pedidos-aprobado-pc');
  // WhatsApp
  const [popup] = await Promise.all([cGer.waitForEvent('page'), g.locator('.grupo-prov[data-prov="Distribuidora Florida"]').getByRole('button', { name: 'Enviar por WhatsApp' }).click()]);
  const urlWA = popup.url();
  ok(urlWA.startsWith('https://wa.me/5491155550001?text='), `URL de WhatsApp con número solo dígitos: ${urlWA.slice(0, 48)}…`);
  const textoWA = decodeURIComponent(urlWA.split('?text=')[1]);
  ok(/Umo Grill/.test(textoWA) && /Cerveza rubia/.test(textoWA) && /Gaseosa cola/.test(textoWA), 'el texto lista local y productos');
  await popup.close();
  await g.waitForTimeout(500);
  ok(db.ordenes.find(o => o.proveedor_id === PV.florida).estado === 'enviada', 'marca la orden como "enviada"');
  // Recibir
  await g.getByRole('link', { name: 'Recibir' }).click();
  await g.waitForSelector('.grupo-prov[data-orden]');
  ok(await g.locator('.grupo-prov').count() === 1, 'Recibir: solo órdenes enviadas');
  const precioPre = await g.getByLabel('Costo unitario de Cerveza rubia lata 473 ml').inputValue();
  ok(precioPre === '9800', `costo prellenado con el actual (${precioPre})`);
  await g.getByLabel('Costo unitario de Cerveza rubia lata 473 ml').fill('10500');
  await g.getByLabel('Cantidad recibida de Gaseosa cola 1,5 l').fill('0');
  await shot(g, '12-g-recibir-pc');
  await g.getByRole('button', { name: 'Confirmar recepción' }).click();
  await g.waitForSelector('.toast-ok >> text=Recepción');
  ok(db.recepciones.length === 1 && db.recepciones[0].p_items.length === 2, 'la recepción va en una sola llamada rpc recibir_orden');
  const mov = db.movimientos.find(m => m.producto_id === 'p-cerveza');
  ok(mov && mov.tipo === 'recepcion' && mov.cantidad === 12, `movimiento de recepción = cantidad × factor (2 cajas × 6 = ${mov && mov.cantidad})`);
  ok(db.preciosNuevos.some(p => p.producto_id === 'p-cerveza' && p.precio === 10500), 'precio nuevo guardado al cambiar');
  ok(db.ordenes.find(o => o.proveedor_id === PV.florida).estado === 'parcial', 'faltó la gaseosa: orden "parcial"');
  // Stock
  await g.getByRole('link', { name: 'Stock' }).click();
  await g.waitForSelector('.prod-stk');
  await g.locator('.chip', { hasText: 'Umo Grill' }).click();
  await shot(g, '13-g-stock-pc');
  await g.getByRole('button', { name: 'Contar Chorizo parrillero' }).click();
  await g.locator('dialog .inp-big').fill('4');
  await g.getByRole('button', { name: 'Guardar conteo' }).click();
  await g.waitForSelector('.toast-ok >> text=Diferencia');
  ok(db.conteos.length === 1 && db.conteos[0].p_producto === 'p-chorizo' && db.conteos[0].p_cantidad_contada === 4, 'Contar llama a registrar_conteo');
  // Catálogo
  await g.getByRole('link', { name: 'Catálogo' }).click();
  await g.waitForSelector('.prod-cat');
  await shot(g, '14-g-catalogo-pc');
  await g.locator('.prod-cat', { hasText: 'Chorizo parrillero' }).click();
  await g.waitForSelector('dialog[open]');
  await g.locator('#f-costo').fill('6900');
  await shot(g, '15-g-catalogo-editar-pc');
  await g.getByRole('button', { name: 'Guardar cambios' }).click();
  await g.waitForSelector('.toast-ok >> text=Cambios guardados');
  ok(db.preciosNuevos.some(p => p.producto_id === 'p-chorizo' && p.precio === 6900), 'editar costo inserta precio nuevo');
  await g.waitForSelector('dialog', { state: 'detached' });
  await g.getByRole('button', { name: 'Nuevo producto' }).click();
  await g.locator('#f-nombre').fill('Provoleta');
  await g.locator('#f-codigo').fill('UMO-050');
  await g.locator('#f-uc').fill('kg');
  await g.locator('#f-uu').fill('kg');
  await g.locator('#f-prov').selectOption(PV.barcena);
  await g.getByRole('button', { name: 'Crear producto' }).click();
  await g.waitForSelector('.toast-ok >> text=Producto creado');
  ok(db.productos.some(p => p.codigo === 'UMO-050' && p.nombre === 'Provoleta'), 'alta de producto ' + JSON.stringify(db.productos.filter(p => /Provoleta/.test(p.nombre))));
  await cGer.close();

  // ===== Gerencia · celular y oscuro =====
  const cGerM = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const gm = await nuevaPagina(cGerM, 'gerencia-m');
  await gm.goto(BASE);
  await gm.waitForSelector('.seg');
  await gm.getByRole('tab', { name: 'Administración' }).click();
  await gm.locator('#in-email').fill('jacobo@ejemplo.com');
  await gm.locator('#in-pass').fill('clave-segura');
  await gm.locator('form button[type=submit]').click();
  await gm.waitForSelector('.vista-head');
  await gm.waitForTimeout(400);
  await shot(gm, '16-g-pedidos-m', true);
  await gm.getByRole('link', { name: 'Catálogo' }).click();
  await gm.waitForSelector('.prod-cat');
  await shot(gm, '17-g-catalogo-m');
  await cGerM.close();

  const cGerD = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark' });
  const gd = await nuevaPagina(cGerD, 'gerencia-oscuro');
  await gd.goto(BASE);
  await gd.waitForSelector('.seg');
  await gd.getByRole('tab', { name: 'Administración' }).click();
  await gd.locator('#in-email').fill('jacobo@ejemplo.com');
  await gd.locator('#in-pass').fill('clave-segura');
  await gd.locator('form button[type=submit]').click();
  await gd.waitForSelector('.vista-head');
  await gd.getByRole('link', { name: 'Stock' }).click();
  await gd.waitForSelector('.prod-stk');
  await shot(gd, '18-g-stock-pc-oscuro');
  await cGerD.close();

  // ===== Gerencia · Ventas, análisis, recetas, producción y merma =====
  const FX = path.join(ROOT, 'scripts/fixtures/nucleo');
  const ARCH = ['detalle-por-pedido.xlsx', 'formas-de-pago.xlsx', 'pedidos-por-producto.xlsx'].map(f => path.join(FX, f));
  const loginGer = async (pg) => {
    await pg.goto(BASE);
    await pg.waitForSelector('.seg');
    await pg.getByRole('tab', { name: 'Administración' }).click();
    await pg.locator('#in-email').fill('jacobo@ejemplo.com');
    await pg.locator('#in-pass').fill('clave-segura');
    await pg.locator('form button[type=submit]').click();
    await pg.waitForSelector('.vista-head');
  };
  const cV = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  const v = await nuevaPagina(cV, 'ventas-pc');
  await loginGer(v);
  ok(await v.locator('.sidebar .side-link').count() === 7, 'gerencia: Ventas y Cocina en la barra lateral');
  await v.getByRole('link', { name: 'Ventas', exact: true }).click();
  await v.waitForSelector('#f-archivo', { state: 'attached' });
  ok(await v.locator('h1').first().innerText() === 'Ventas', 'pantalla Ventas');
  await shot(v, '19-g-ventas-vacio-pc');
  await v.setInputFiles('#f-archivo', ARCH);
  await v.waitForSelector('.kpis');
  const kpis = (await v.locator('.kpis').first().innerText()).replace(/\s+/g, ' ');
  ok(/PRODUCTOS \$ 122\.600/i.test(kpis) && /COBRADO \$ 123\.600/i.test(kpis), `vista previa: productos y cobrado (${kpis})`);
  ok(/PEDIDOS 5/i.test(kpis) && /DIFERENCIA \$ 1\.000/i.test(kpis), 'vista previa: 5 pedidos y diferencia de $ 1.000');
  ok(/PEDIDOS A \$0 1.*9104/i.test(kpis), 'vista previa: pedido a $0 (9104)');
  ok(await v.locator('#f-fecha').inputValue() === '2026-10-24', 'la fecha se completa con la del archivo (24/10/2026)');
  ok(await v.locator('.arch').count() === 3, 'detecta los tres archivos por sus encabezados');
  ok((await v.locator('.banner-info').innerText()).includes('se ignora'), 'avisa que "Pedidos por producto" se ignora si hay detalle');
  // asociar
  await v.waitForSelector('.asoc[data-clave="beb-901"] .asoc-s');
  ok((await v.locator('.asoc[data-clave="beb-901"] .asoc-s').innerText()).includes('Cerveza rubia lata 473 ml'), 'sugiere el producto más parecido (buscar_productos)');
  const btnConf = v.getByRole('button', { name: /Faltan \d+ por asociar/ });
  ok(await btnConf.isDisabled(), 'ítems sin asociar bloquean la confirmación: ' + await btnConf.innerText());
  await shot(v, '20-g-ventas-asociar-pc', true);
  await v.getByRole('button', { name: 'Usar Cerveza rubia lata 473 ml para Cerveza Rubia Lata' }).click();
  await v.waitForSelector('.asoc[data-clave="beb-901"].asoc-ok', { state: 'attached' });
  ok(db.asociaciones.some(a => a.p_producto === 'p-cerveza' && a.p_codigo === 'BEB-901' && a.p_cantidad_por_venta === 1), 'asociar_nucleo guarda el código de Núcleo del producto');
  await v.getByRole('button', { name: 'Elegir producto para Agua Demo 500' }).click();
  await v.waitForSelector('dialog[open]');
  await v.locator('dialog input[type=search]').fill('agua');
  await shot(v, '21-g-ventas-elegir-pc');
  await v.getByRole('button', { name: 'Elegir Agua sin gas 500 ml' }).click();
  await v.locator('#f-cpv').fill('1');
  await v.getByRole('button', { name: 'Asociar', exact: true }).click();
  await v.waitForSelector('.asoc[data-clave="beb-902"].asoc-ok', { state: 'attached' });
  await v.getByRole('button', { name: 'Crear plato Parrillada Demo' }).click();
  await v.waitForSelector('.asoc[data-clave="par-901"].asoc-ok', { state: 'attached' });
  await v.getByRole('button', { name: 'Crear plato Sandwich Demo' }).click();
  await v.waitForSelector('.asoc[data-clave="san-901"].asoc-ok', { state: 'attached' });
  ok(db.platosCreados.length === 2 && db.platosCreados[0].p_codigo === 'PAR-901' && db.platosCreados[0].p_nombre === 'Parrillada Demo', 'Crear plato con un clic: PLA-<código de Núcleo>, categoría Carta, con su alias');
  ok(db.productos.find(p => p.codigo === 'PLA-PAR-901').categoria === 'Carta' && db.productos.find(p => p.codigo === 'PLA-PAR-901').es_elaborado, 'el plato es un elaborado de la categoría Carta');
  ok(await btnConf.count() === 1 && await btnConf.isDisabled(), 'todavía falta Papas Demo');
  await v.getByRole('button', { name: 'No descontar Papas Demo' }).click();
  const confirmar = v.getByRole('button', { name: 'Confirmar importación' });
  ok(await confirmar.isEnabled(), 'con todo asociado (o marcado "no descontar") se puede confirmar');
  await v.locator('.asoc-hechos summary').click();
  await shot(v, '22-g-ventas-listo-pc', true);
  await confirmar.click();
  await v.waitForSelector('.resultado');
  const rpcImp = db.importaciones_rpc[0];
  ok(rpcImp && rpcImp.p_local === L1 && rpcImp.p_fecha === '2026-10-24' && rpcImp.p_pedidos.length === 5 && rpcImp.p_items.length === 9 && rpcImp.p_pagos.length === 5, `rpc importar_ventas: local, fecha, 5 pedidos, 9 ítems, 5 pagos`);
  ok(rpcImp.p_items.filter(i => i.codigo === 'BEB-901').every(i => i.producto_id === 'p-cerveza' && !i.no_descontar) && rpcImp.p_items.filter(i => i.codigo === 'GUA-901').every(i => i.producto_id === null && i.no_descontar), 'los ítems viajan con su producto; "no descontar" sin producto');
  ok(rpcImp.p_items.every(i => typeof i.importe === 'number' && i.fecha_hora && i.pedido_numero) && rpcImp.p_pedidos.find(p => p.numero === 9104).total === 0 && rpcImp.p_pedidos.find(p => p.numero === 9101).total === 30600, 'payload: horarios por ítem, cobrado por pedido y pedido a $0');
  ok(rpcImp.p_archivo.includes('detalle-por-pedido.xlsx') && rpcImp.p_archivo.includes('formas-de-pago.xlsx'), 'el archivo queda anotado');
  ok((await v.locator('.resultado').innerText()).includes('2 platos vendidos no tienen receta'), 'avisa los platos vendidos sin receta');
  await shot(v, '23-g-ventas-importado-pc', true);
  // Recetas: platos vendidos sin receta, del más vendido al menos
  await v.getByRole('link', { name: 'Cargar recetas' }).click();
  await v.waitForSelector('.sr-b');
  const srTxt = await v.locator('.sr-b').allInnerTexts();
  ok(srTxt.length === 2 && /Parrillada Demo/.test(srTxt[0]) && /Sandwich Demo/.test(srTxt[1]), `platos sin receta ordenados por cantidad vendida (${srTxt.map(x => x.replace(/\s+/g, ' ')).join(' | ')})`);
  await shot(v, '24-g-recetas-pc', true);
  await v.getByRole('button', { name: 'Cargar receta de Parrillada Demo' }).click();
  await v.waitForSelector('dialog[open]');
  await v.getByRole('button', { name: 'Agregar insumo' }).click();
  await v.locator('dialog input[type=search]').fill('chori');
  await v.getByRole('button', { name: 'Agregar Chorizo parrillero' }).click();
  await v.getByLabel('Cantidad de Chorizo parrillero').fill('0,25');
  await v.getByLabel('Cantidad de Chorizo parrillero').press('Tab');
  await v.getByRole('button', { name: 'Agregar insumo' }).click();
  await v.locator('dialog input[type=search]').fill('queso');
  await v.getByRole('button', { name: 'Agregar Queso cremoso' }).click();
  await v.getByLabel('Cantidad de Queso cremoso').fill('0,1');
  await v.getByLabel('Cantidad de Queso cremoso').press('Tab');
  ok((await v.locator('dialog .sub').innerText()).includes('Costo estimado'), 'la receta muestra el costo estimado');
  await shot(v, '25-g-receta-editar-pc');
  await v.getByRole('button', { name: 'Guardar receta' }).click();
  await v.waitForSelector('.toast-ok >> text=Receta guardada');
  const rg = db.recetasGuardadas[0];
  ok(rg && rg.p_rinde === 1 && rg.p_items.length === 2 && rg.p_items.some(i => i.insumo_id === 'p-chorizo' && i.cantidad === 0.25) && rg.p_items.some(i => i.insumo_id === 'p-queso' && i.cantidad === 0.1), 'guardar_receta: insumos con cantidad en su unidad de uso y rinde');
  ok(await v.locator('.sr-b').count() === 1, 'el plato con receta sale de la lista de sin receta');
  // Elaborado desde Catálogo + receta + producción
  await v.getByRole('link', { name: 'Catálogo' }).click();
  await v.waitForSelector('.prod-cat');
  await v.getByRole('button', { name: 'Nuevo producto' }).click();
  await v.locator('#f-nombre').fill('Salsa criolla');
  await v.locator('#f-codigo').fill('UMO-060');
  await v.locator('#f-categoria, #f-cat').first().fill('Elaborados');
  await v.locator('#f-uu').fill('litro');
  await v.locator('#f-elab').check();
  await v.getByRole('button', { name: 'Crear producto' }).click();
  await v.waitForSelector('.toast-ok >> text=Producto creado');
  ok(db.productos.find(p => p.codigo === 'UMO-060').es_elaborado === true, 'Catálogo: producto marcado como elaborado');
  await v.getByRole('link', { name: 'Cocina' }).click();
  await v.waitForSelector('.prod-cat');
  await v.locator('.chip', { hasText: 'Elaborados' }).click();
  await v.getByRole('button', { name: 'Receta de Salsa criolla' }).click();
  await v.waitForSelector('dialog[open]');
  await v.locator('#r-rinde').fill('2');
  await v.locator('#r-rinde').press('Tab');
  await v.getByRole('button', { name: 'Agregar insumo' }).click();
  await v.locator('dialog input[type=search]').fill('mozza');
  await v.getByRole('button', { name: 'Agregar Mozzarella en barra' }).click();
  await v.getByLabel('Cantidad de Mozzarella en barra').fill('0,5');
  await v.getByLabel('Cantidad de Mozzarella en barra').press('Tab');
  await v.getByRole('button', { name: 'Guardar receta' }).click();
  await v.waitForSelector('.toast-ok >> text=Receta guardada');
  await v.getByRole('link', { name: 'Producción', exact: true }).click();
  await v.waitForSelector('.prod-stk');
  ok(await v.locator('.prod-stk').count() === 1, 'Producción lista solo elaborados con receta (no platos de la carta)');
  await shot(v, '26-g-produccion-pc');
  await v.getByRole('button', { name: 'Producir Salsa criolla' }).click();
  await v.waitForSelector('dialog[open]');
  await v.locator('#p-cant').fill('4');
  await v.locator('#p-cant').dispatchEvent('input');
  ok((await v.locator('dialog .prod-ins').innerText()).includes('1'), 'muestra cuánto descuenta de cada insumo (4 × 0,5 / 2 = 1)');
  await shot(v, '27-g-produccion-registrar-pc');
  await v.locator('#p-nota').fill('tanda de la mañana');
  await v.getByRole('button', { name: 'Registrar producción' }).click();
  await v.waitForSelector('.toast-ok >> text=Producción registrada');
  const pr = db.produccionesReg[0];
  ok(pr && pr.p_local === L1 && pr.p_cantidad === 4 && pr.p_nota === 'tanda de la mañana' && db.productos.find(p => p.id === pr.p_producto).nombre === 'Salsa criolla', 'registrar_produccion con local, producto, cantidad y nota');
  ok(await v.locator('.bloque .bfila').count() === 1, 'queda en las últimas producciones');
  await shot(v, '28-g-produccion-hecha-pc');
  // Análisis
  await v.getByRole('link', { name: 'Ventas', exact: true }).click();
  await v.waitForSelector('.subnav');
  await v.getByRole('link', { name: 'Análisis', exact: true }).click();
  await v.waitForSelector('.franja');
  const an = (await v.locator('.analisis').innerText()).replace(/\s+/g, ' ');
  ok(/COBRADO \$ 123\.600/i.test(an) && /PEDIDOS 5/i.test(an) && /TICKET PROMEDIO \$ 24\.720/i.test(an), 'análisis: cobrado, pedidos y ticket promedio');
  ok(/Efectivo/.test(an) && /Mercado Pago QR/.test(an) && /Tarjeta de débito/.test(an), 'análisis: por medio de pago');
  ok(await v.locator('.franja-c').count() === 6 || await v.locator('.franja-c').count() >= 5, 'análisis: barras por franja horaria');
  ok(/Hora pico: 14:00/.test(an), 'análisis: hora pico (14:00)');
  ok(/Salon Umo/.test(an) && /Patio Burger/.test(an) && /Mostrador/.test(an) && /PARRILLA/.test(an), 'análisis: por sector, tipo de pedido y rubro');
  ok(/Pedidos a \$0 · 1/i.test(an) && /Pedido 9104/.test(an), 'análisis: pedido a $0');
  ok(/CERVEZA RUBIA LATA|Cerveza Rubia Lata/i.test(an) && /Productos más vendidos/i.test(an), 'análisis: productos más vendidos');
  ok(!/Por mozo/i.test(an), 'análisis: sin mozo en el reporte, la sección no se muestra');
  await v.locator('.cero summary').click();
  await shot(v, '29-g-analisis-pc', true);
  // Merma
  await v.getByRole('link', { name: 'Merma', exact: true }).click();
  await v.waitForSelector('.tabla');
  const mm = (await v.locator('.vista').innerText()).replace(/\s+/g, ' ');
  ok(/Faltantes más caros/i.test(mm) && /Cerveza rubia lata/.test(mm), 'merma: faltantes más caros');
  const orden = await v.locator('.bloque').first().locator('.bfila-k').allInnerTexts();
  ok(orden[0] === 'Cerveza rubia lata 473 ml', `merma: el faltante más caro va primero (${orden.join('|')})`);
  ok(db.log.some(l => l.t === 'rpc/merma_control' && l.b.p_local === L1), 'merma_control llamado con el local y el rango');
  await shot(v, '30-g-merma-pc', true);
  await cV.close();

  // reimportar el mismo día: avisa que reemplaza
  const cV2 = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const vm = await nuevaPagina(cV2, 'ventas-m');
  await loginGer(vm);
  ok(await vm.locator('.tab').count() === 7, 'celular: barra inferior con 6 secciones + Salir');
  await shot(vm, '31-g-barra-m');
  await vm.getByRole('link', { name: 'Ventas', exact: true }).click();
  await vm.waitForSelector('#f-archivo', { state: 'attached' });
  await shot(vm, '32-g-ventas-vacio-m');
  await vm.setInputFiles('#f-archivo', ARCH.slice(0, 2));
  await vm.waitForSelector('.kpis');
  await vm.waitForSelector('.banner-warn >> text=Ya hay ventas importadas');
  ok(true, 'reimportar el mismo local y día avisa que se reemplaza');
  await vm.waitForSelector('.asoc[data-clave="par-901"].asoc-ok', { state: 'attached' });
  await vm.waitForTimeout(300);
  ok(await vm.getByRole('button', { name: 'Faltan 1 por asociar' }).count() === 1, 'las asociaciones ya hechas se recuerdan (solo falta Papas Demo)');
  await shot(vm, '33-g-ventas-preview-m', true);
  await vm.getByRole('link', { name: 'Análisis', exact: true }).click();
  await vm.waitForSelector('.franja');
  await shot(vm, '34-g-analisis-m', true);
  await vm.getByRole('link', { name: 'Merma', exact: true }).click();
  await vm.waitForSelector('.tabla');
  await shot(vm, '35-g-merma-m', true);
  await vm.getByRole('link', { name: 'Cocina' }).click();
  await vm.waitForSelector('.prod-cat');
  await shot(vm, '36-g-recetas-m', true);
  await vm.getByRole('link', { name: 'Producción', exact: true }).click();
  await vm.waitForSelector('.prod-stk');
  await shot(vm, '37-g-produccion-m', true);
  await cV2.close();

  const cV3 = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark' });
  const vd = await nuevaPagina(cV3, 'ventas-oscuro');
  await loginGer(vd);
  await vd.goto(BASE + '#/analisis');
  await vd.waitForSelector('.franja');
  await shot(vd, '38-g-analisis-pc-oscuro', true);
  await cV3.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); errores.forEach(x => console.log(' - ' + x)); fallas += errores.length; }
  console.log(`\n${fallas ? fallas + ' FALLA(S)' : 'Todo OK'} · capturas en ${OUT}`);
  process.exit(fallas ? 1 : 0);
})().catch(err => { console.error('ERROR:', err); process.exit(1); });
