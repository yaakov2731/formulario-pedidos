#!/usr/bin/env node
// Prueba de punta a punta de stock/ (manual, no corre en CI). Levanta un servidor estático del repo y mockea con
// page.route toda la API de Supabase. Recorre encargado (login, pedir, revisar, enviar, mis pedidos) y gerencia
// (tablero, pedidos, aprobar, WhatsApp, recibir, stock, catálogo, ventas de Núcleo, análisis, recetas, producción y merma, pagos con
// comprobante PDF, facturas, avisos por WhatsApp y proveedores) y contadora. Guarda capturas en OUT (por defecto /mnt/project-files/app-stock/fase4).
// Uso: node scripts/e2e-stock.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/fase4');
const SB = 'https://zunyzlpzofbyqplgiupl.supabase.co';
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.mjs': 'text/javascript; charset=utf-8', '.pdf': 'application/pdf', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
const PV = { barcena: 'prv-barcena', florida: 'prv-florida', martin: 'prv-martin', demo: 'prv-demo' };
const U_ENC = 'usr-enc', U_GER = 'usr-ger', U_CON = 'usr-con';
const COMPROBANTES = path.join(__dirname, 'fixtures/comprobante');
const { items: ITEMS_FX, construirPdf } = require('./fixtures/comprobante/generar.js');
// Comprobantes sintéticos de prueba: el de la carpeta de fixtures y otros con distinta operación y monto.
const PDF_DEMO = path.join(COMPROBANTES, 'comprobante-demo.pdf');
const pdfVariante = (op, monto, cuit, razon) => {
  const f = path.join(os.tmpdir(), `${op}.pdf`);
  fs.writeFileSync(f, construirPdf(ITEMS_FX.map(i => ({ ...i, str: i.str.replace('DEMO0001ab', op).replace('$ 150.000,50', monto).replace('30000000019', cuit || '30000000019').replace('Distribuidora Demo Srl', razon || 'Distribuidora Demo Srl') }))));
  return f;
};
const prod = (id, codigo, nombre, cat, uc, uu, factor, prov, par, local = L1) => ({ id, codigo, nombre, local_id: local, categoria: cat, unidad_compra: uc, unidad_uso: uu, factor_conversion: factor, proveedor_id: prov, par, es_elaborado: false, activo: true });
// Columnas de 0011_proveedores_datos.sql (contacto, email y datos de cobranza).
const EXTRA_PROV = { razon_social: null, contacto: null, telefono: null, email: null, whatsapp_pagos: null, email_pagos: null, banco: null, notas: null };
const db = {
  locales: [
    { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth Coronel', 'Maru', 'Ayelén'], activo: true },
    { id: L2, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true },
    { id: 'loc-brk', codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true },
    { id: 'loc-gel', codigo: 'GEL', nombre: 'Puerto Gelato', encargados: [], activo: true },
    { id: 'loc-shp', codigo: 'SHP', nombre: 'Shopping', encargados: [], activo: true }
  ],
  proveedores: [
    { ...EXTRA_PROV, id: PV.barcena, nombre: 'Barcena', whatsapp: '5491155550003', cuit: null, alias_cbu: 'barcena.pagos', dias_entrega: '1 día · pedir antes del jueves', corte: null, pedido_minimo: null, activo: true },
    { ...EXTRA_PROV, email: 'pedidos@florida.com', contacto: 'Hernán', id: PV.florida, nombre: 'Distribuidora Florida', whatsapp: '+54 9 11 5555-0001', cuit: '30-00000002-7', alias_cbu: null, dias_entrega: 'Sábado', corte: 'Miércoles', pedido_minimo: null, activo: true },
    { ...EXTRA_PROV, id: PV.martin, nombre: 'Martín De Ridder', whatsapp: '5491155550002', cuit: null, alias_cbu: null, dias_entrega: 'Martes y viernes', corte: null, pedido_minimo: 100000, activo: true },
    { ...EXTRA_PROV, whatsapp_pagos: '5491155550044', email_pagos: 'cobranzas@demo.com', id: PV.demo, nombre: 'Distribuidora Demo', whatsapp: '5491155550004', cuit: null, alias_cbu: null, dias_entrega: 'Lunes', corte: null, pedido_minimo: null, activo: true }
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
    prod('p-trento', 'TRE-001', 'Café en grano', 'Café', 'kg', 'kg', 1, PV.barcena, null, L2),
    prod('p-serv-tre', 'TRE-002', 'Servilletas de papel', 'Descartables', 'paquete', 'paquete', 1, PV.demo, null, L2),
    prod('p-limon', 'TRE-003', 'Limones', 'Verdulería', 'kg', 'kg', 1, null, null, L2)
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
  alias: [], recetas: [], importaciones: [], producciones: [], asociaciones: [], platosCreados: [], recetasGuardadas: [], produccionesReg: [], importaciones_rpc: [], borradas: [],
  // fase 4: facturas, pagos, comprobantes y proveedores
  facturas: [
    { id: 'fa-1', proveedor_id: PV.demo, numero: '0001-00000002', fecha: '2026-08-01', vencimiento: '2026-09-01', total: 100000, archivo: null, imputado: 0 },
    { id: 'fa-2', proveedor_id: PV.demo, numero: '0001-00000010', fecha: '2026-09-20', vencimiento: '2026-11-20', total: 70000, archivo: null, imputado: 0 },
    { id: 'fa-3', proveedor_id: PV.barcena, numero: '0003-00000099', fecha: '2026-09-15', vencimiento: '2026-10-01', total: 30000, archivo: null, imputado: 0 },
    { id: 'fa-4', proveedor_id: PV.martin, numero: '0002-00000045', fecha: '2026-10-10', vencimiento: null, total: 120000, archivo: null, imputado: 120000 },
    // pagada sin centavos (el banco transfirió $50.000 por $50.000,64): cuenta como pagada, no vencida
    { id: 'fa-5', proveedor_id: PV.martin, numero: '0002-00000046', fecha: '2026-10-11', vencimiento: '2026-10-15', total: 50000.64, archivo: null, imputado: 50000 }
  ],
  pagos: [
    { id: 'pg-1', proveedor_id: PV.martin, monto: 120000, fecha: '2026-10-12', numero_operacion: 'OPVIEJA001', concepto: 'Factura', descripcion: 'Carnes', comprobante_path: 'pagos/prv-martin/OPVIEJA001.pdf', avisado_en: '2026-10-12T15:00:00Z', creado_en: '2026-10-12T14:00:00Z' },
    { id: 'pg-0', proveedor_id: PV.martin, monto: 50000, fecha: '2026-10-11', numero_operacion: 'OPVIEJA000', concepto: 'Factura', descripcion: 'Carnes', comprobante_path: 'pagos/prv-martin/OPVIEJA000.pdf', avisado_en: '2026-10-11T15:00:00Z', creado_en: '2026-10-11T14:00:00Z' },
    { id: 'pg-2', proveedor_id: PV.florida, monto: 54000, fecha: '2026-10-20', numero_operacion: 'OPVIEJA002', concepto: 'Factura', descripcion: 'Bebidas', comprobante_path: 'pagos/prv-florida/OPVIEJA002.pdf', avisado_en: null, creado_en: '2026-10-20T14:00:00Z' }
  ],
  subidos: {}, pagosRegistrados: [], facturasCreadas: [], facturasBorradas: [], proveedoresEditados: [], proveedoresCreados: [], sin0011: false, avisos: [], consultasTablero: []
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
    const rol = sub === U_GER ? 'gerencia' : (sub === U_ENC ? 'encargado' : (sub === U_CON ? 'contadora' : null));
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(q), b: body(), rol });

    if (u.pathname === '/auth/v1/token') {
      const b = body() || {};
      if (u.searchParams.get('grant_type') === 'refresh_token') return json(sesion(String(b.refresh_token || '').slice(2), 'x@x'));
      if (b.email === 'local-umo@docks-stock.app' && b.password === '1234') return json(sesion(U_ENC, b.email));
      if (b.email === 'jacobo@ejemplo.com' && b.password === 'clave-segura') return json(sesion(U_GER, b.email));
      if (b.email === 'conta@ejemplo.com' && b.password === 'clave-conta') return json(sesion(U_CON, b.email));
      return json({ error: 'invalid_grant', error_code: 'invalid_credentials', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC, 'x@x').user);
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname.startsWith('/storage/v1/')) {
      if (rol !== 'gerencia' && rol !== 'contadora') return json({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 403);
      const ruta = decodeURIComponent(u.pathname.replace(/^\/storage\/v1\/object\/(sign\/|authenticated\/)?comprobantes\//, ''));
      if (u.pathname.includes('/object/sign/') && req.method() === 'POST') return json({ signedURL: `/object/sign/comprobantes/${ruta}?token=firma` });
      if (req.method() === 'POST' || req.method() === 'PUT') { db.subidos[ruta] = (req.postDataBuffer() || Buffer.alloc(0)).length; return json({ Key: 'comprobantes/' + ruta, Id: nid('obj') }); }
      if (req.method() === 'GET') return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/pdf' }, body: fs.readFileSync(path.join(COMPROBANTES, 'comprobante-demo.pdf')) });
      return json({}, 404);
    }
    if (!u.pathname.startsWith('/rest/v1/')) return json({}, 404);

    if (t === 'rpc/locales_login') return json(db.locales.map(l => ({ codigo: l.codigo, nombre: l.nombre, encargados: l.encargados })));
    if (!rol) return json({ code: '42501', message: 'permission denied' }, 401);
    const esGet = req.method() === 'GET';
    const ver = (arr) => arr;
    if (t === 'perfiles' && rol === 'contadora') return json([{ id: U_CON, nombre: 'Contadora', rol: 'contadora', local_id: null }]);
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
    if (t === 'proveedores' && req.method() === 'PATCH') {
      if (rol !== 'gerencia') return json([]); // la contadora solo lee proveedores
      const id = eq(q.get('id')); const p = db.proveedores.find(x => x.id === id); Object.assign(p, body()); db.proveedoresEditados.push({ id, ...body() }); return json([{ id, nombre: p.nombre, whatsapp: p.whatsapp, cuit: p.cuit, alias_cbu: p.alias_cbu }]);
    }
    if (t === 'proveedores' && req.method() === 'POST') {
      if (rol !== 'gerencia') return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
      const b = body(); if (db.proveedores.some(x => x.nombre === b.nombre)) return json({ code: '23505', message: 'duplicate key value violates unique constraint "proveedores_nombre_key"' }, 409);
      const r = { ...EXTRA_PROV, ...b, id: nid('prv') }; db.proveedores.push(r); db.proveedoresCreados.push(r); return json([{ id: r.id }], 201);
    }
    if (t === 'proveedores' && db.sin0011 && /razon_social/.test(q.get('select') || '')) return json({ code: '42703', message: 'column proveedores.razon_social does not exist' }, 400);
    if (t === 'proveedores') return rol === 'gerencia' || rol === 'contadora' ? json(db.sin0011 ? db.proveedores.map(p => Object.fromEntries(Object.entries(p).filter(([k]) => !(k in EXTRA_PROV)))) : db.proveedores) : json([]);
    if (t === 'precio_actual') return rol === 'gerencia' ? json(Object.entries(db.precios).map(([producto_id, precio]) => ({ producto_id, precio }))) : json([]);
    if (t === 'rpc/buscar_productos') { const b = body(); const n = (b.q || '').toLowerCase(); return json(db.productos.filter(p => p.local_id === (b.p_local || p.local_id) && p.nombre.toLowerCase().includes(n)).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, local_id: p.local_id, score: 0.8 }))); }
    if (t === 'rpc/registrar_conteo') { const b = body(); if (rol !== 'gerencia') return json({ code: '42501', message: 'new row violates row-level security policy' }, 403); db.conteos.push(b); const s = db.stock.find(x => x.producto_id === b.p_producto && x.local_id === b.p_local); const dif = b.p_cantidad_contada - (s ? s.stock : 0); if (s) s.stock = b.p_cantidad_contada; else db.stock.push({ local_id: b.p_local, producto_id: b.p_producto, stock: b.p_cantidad_contada }); return json(dif); }



    // ---- fase 4: facturas, pagos, comprobantes (gerencia y contadora; el encargado nunca) ----
    const hoyMock = '2026-10-26';
    const conSaldo = (f) => ({ ...f, pendiente: f.total - f.imputado, vencida: !!f.vencimiento && f.vencimiento < hoyMock && f.total - f.imputado >= 1 });
    if (/^(cuenta_corriente|facturas_pendientes|facturas_proveedor|pagos|pago_facturas|rpc\/(registrar_pago|tablero))/.test(t) && rol !== 'gerencia' && rol !== 'contadora') return json({ code: '42501', message: 'permission denied for table ' + t }, 403);
    if (t === 'cuenta_corriente') {
      return json(db.proveedores.map(p => { const fa = db.facturas.filter(f => f.proveedor_id === p.id).reduce((a, f) => a + f.total, 0), pa = db.pagos.filter(g => g.proveedor_id === p.id).reduce((a, g) => a + g.monto, 0);
        return { proveedor_id: p.id, nombre: p.nombre, facturado: fa, pagado: pa, saldo: fa - pa }; }).sort((a, b) => b.saldo - a.saldo));
    }
    if (t === 'facturas_pendientes') {
      let r = db.facturas.map(conSaldo); if (eq(q.get('proveedor_id'))) r = r.filter(f => f.proveedor_id === eq(q.get('proveedor_id')));
      if ((q.get('pendiente') || '').startsWith('gt.')) r = r.filter(f => f.pendiente > Number(q.get('pendiente').slice(3)));
      if ((q.get('pendiente') || '').startsWith('gte.')) r = r.filter(f => f.pendiente >= Number(q.get('pendiente').slice(4)));
      return json(r.sort((a, b) => a.fecha.localeCompare(b.fecha)));
    }
    if (t === 'gastos_compras') {
      return json(db.facturas.map(conSaldo).map(f => ({ ...f, proveedor: (db.proveedores.find(p => p.id === f.proveedor_id) || {}).nombre || 'Proveedor',
        tipo: f.tipo || 'Factura', es_x: f.tipo === 'Recibo X', local_id: f.local_id || null, local: null, razon_social: 'Sin razón social', categoria: f.categoria || 'Sin categoría',
        pagada: f.pendiente < 1, creado_en: f.fecha })).sort((a, b) => a.fecha.localeCompare(b.fecha)));
    }
    if (t === 'rpc/borrar_factura') {
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Solo gerencia puede borrar facturas' }, 403);
      const id = body().p_id; const f = db.facturas.find(x => x.id === id); db.facturas = db.facturas.filter(x => x.id !== id); db.facturasBorradas.push(id);
      return json({ numero: f.numero, liberado: f.imputado, archivo: f.archivo });
    }
    if (t === 'facturas_proveedor' && req.method() === 'POST') {
      const b = body(); if (db.facturas.some(f => f.proveedor_id === b.proveedor_id && f.numero === b.numero)) return json({ code: '23505', message: 'duplicate key value violates unique constraint "facturas_proveedor_proveedor_id_numero_key"' }, 409);
      const f = { ...b, id: nid('fa'), imputado: 0 }; db.facturas.push(f); db.facturasCreadas.push(b); return json([{ id: f.id }], 201);
    }
    if (t === 'pagos' && req.method() === 'PATCH') { const id = eq(q.get('id')); const g = db.pagos.find(x => x.id === id); Object.assign(g, body()); db.avisos.push({ id, ...body() }); return json([{ id, avisado_en: g.avisado_en }]); }
    if (t === 'pagos') {
      let r = db.pagos; if (eq(q.get('numero_operacion'))) r = r.filter(g => g.numero_operacion === eq(q.get('numero_operacion')));
      return json([...r].sort((a, b) => (b.fecha + b.creado_en).localeCompare(a.fecha + a.creado_en)));
    }
    if (t === 'rpc/registrar_pago') {
      const b = body(); const pg = b.p_pago; db.pagosRegistrados.push(b);
      if (pg.numero_operacion && db.pagos.some(g => g.numero_operacion === pg.numero_operacion)) return json({ code: '23505', message: `La operación ${pg.numero_operacion} ya está cargada: no se registra dos veces` }, 409);
      const id = nid('pg'); db.pagos.push({ id, ...pg, avisado_en: null, creado_en: '2026-10-26T13:00:00Z' });
      for (const im of b.p_imputaciones) db.facturas.find(f => f.id === im.factura_id).imputado += im.monto;
      if (pg.actualizar_cuit && pg.cuit_destino) db.proveedores.find(x => x.id === pg.proveedor_id).cuit = pg.cuit_destino;
      return json(id);
    }
    if (t === 'rpc/tablero') {
      const b = body(); db.consultasTablero.push(b); const uno = !!b.p_local; const k = uno ? 0.4 : 1;
      const m = (v) => Math.round(v * k);
      return json({
        periodo: { local_id: b.p_local, desde: b.p_desde, hasta: b.p_hasta, anterior_desde: '2026-10-19', anterior_hasta: '2026-10-26' },
        actual: { ventas: m(2850000), compras: m(1240000), cmv: m(910000), margen: m(1940000), margen_pct: 68.1 },
        anterior: { ventas: m(2610000), compras: m(1480000), cmv: m(940000), margen: m(1670000), margen_pct: 64 },
        stock: { total: m(3120000), por_local: (uno ? [{ local_id: b.p_local, nombre: 'Umo Grill', valor: 1250000, sin_precio: 1 }] : [{ local_id: L1, nombre: 'Umo Grill', valor: 1250000, sin_precio: 1 }, { local_id: L2, nombre: 'Trento Café', valor: 870000, sin_precio: 0 }, { local_id: 'loc-brk', nombre: 'Brooklyn', valor: 620000, sin_precio: 3 }, { local_id: 'loc-gel', nombre: 'Puerto Gelato', valor: 380000, sin_precio: 0 }]) },
        deuda: { total: 640000, proveedores: [{ proveedor_id: PV.demo, nombre: 'Distribuidora Demo', saldo: 170000 }, { proveedor_id: PV.martin, nombre: 'Martín De Ridder', saldo: 310000 }, { proveedor_id: PV.barcena, nombre: 'Barcena', saldo: 30000 }],
          vencidas: { n: 2, total: 130000, items: [{ id: 'fa-1', proveedor: 'Distribuidora Demo', numero: '0001-00000002', vencimiento: '2026-09-01', pendiente: 100000 }, { id: 'fa-3', proveedor: 'Barcena', numero: '0003-00000099', vencimiento: '2026-10-01', pendiente: 30000 }] } },
        pagos_sin_avisar: { n: 1, total: 54000, items: [{ id: 'pg-2', proveedor: 'Distribuidora Florida', monto: 54000, fecha: '2026-10-20' }] },
        pedidos_por_aprobar: { n: 3, items: [{ id: 'o1', local: 'Umo Grill', proveedor: 'Barcena', lineas: 4, creado_en: '2026-10-25T10:00:00Z' }, { id: 'o2', local: 'Umo Grill', proveedor: null, lineas: 1, creado_en: '2026-10-25T10:00:00Z' }, { id: 'o3', local: 'Trento Café', proveedor: 'Distribuidora Florida', lineas: 6, creado_en: '2026-10-25T11:00:00Z' }] },
        faltantes: [{ local: 'Umo Grill', producto_id: 'p-cerveza', nombre: 'Cerveza rubia lata 473 ml', unidad_uso: 'unidad', faltante: 12, valor: 19600 }, { local: 'Umo Grill', producto_id: 'p-chorizo', nombre: 'Chorizo parrillero', unidad_uso: 'kg', faltante: 2.5, valor: 15500 }, { local: 'Trento Café', producto_id: 'p-trento', nombre: 'Café en grano', unidad_uso: 'kg', faltante: 1.2, valor: 9800 }],
        pendientes: { sin_precio: { n: 14, ejemplos: ['Servilletas de papel'] }, sin_proveedor: { n: 9, ejemplos: ['Servilletas de papel'] }, sin_receta: { n: 3, ejemplos: ['Parrillada Demo'] } }
      });
    }

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
    if (t === 'ventas_import' && !q.getAll('fecha_desde').length) {
      const l = eq(q.get('local_id'));
      if (!/\bid\b/.test(q.get('select') || '')) return json(l === L1 ? [{ fecha_desde: '2026-10-24', creado_en: new Date().toISOString() }] : []);
      return json(imps().filter(i => i.local_id === l).sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map(i => ({ id: i.id, fecha_desde: i.fecha, archivo: i.archivo, n_pedidos: i.pedidos.length, total_productos: i.items.reduce((s2, it) => s2 + (it.importe || 0), 0), creado_en: new Date().toISOString() })));
    }
    if (t === 'rpc/borrar_todos_los_pedidos') {
      const b = body(); db.borradosPedidos = (db.borradosPedidos || 0) + 1;
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Sin permiso para borrar pedidos' }, 403);
      if (String(b.p_confirmacion || '').trim().toUpperCase() !== 'BORRAR') return json({ message: 'Escribí BORRAR para confirmar' }, 400);
      const r = { pedidos: db.ordenes.length, items: db.items.length, movimientos: 3 };
      db.ordenes.length = 0; db.items.length = 0;
      return json(r);
    }
    if (t === 'rpc/borrar_importacion') {
      const b = body(); db.borradas.push(b.p_import);
      const k = imps().findIndex(i => i.id === b.p_import);
      if (k < 0) return json({ message: 'Esa importación ya no existe' }, 400);
      const [x] = imps().splice(k, 1);
      return json({ local_id: x.local_id, fecha: x.fecha, archivo: x.archivo, movimientos: 7, items: x.items.length, pedidos: x.pedidos.length });
    }
    if (t === 'ventas_import') { const l = eq(q.get('local_id')); const f = (q.getAll('fecha_desde')[0] || '').replace('eq.', ''); const x = imps().find(i => i.local_id === l && i.fecha === f); return json(x ? [{ id: x.id, archivo: x.archivo, n_pedidos: x.pedidos.length, total_productos: 0, creado_en: new Date().toISOString() }] : []); }
    if (t === 'rpc/importar_ventas') {
      const b = body(); db.importaciones_rpc.push(b);
      const prev = imps().findIndex(i => i.local_id === b.p_local && i.fecha === b.p_fecha); if (prev >= 0) imps().splice(prev, 1);
      const idImp = nid('imp');
      imps().push({ id: idImp, local_id: b.p_local, fecha: b.p_fecha, archivo: b.p_archivo, pedidos: b.p_pedidos, items: b.p_items, pagos: b.p_pagos });
      const sin = new Map();
      for (const it of b.p_items) { const p = db.productos.find(x => x.id === it.producto_id); if (p && p.es_elaborado && !it.no_descontar && !db.recetas.some(r => r.producto_id === p.id)) { const a = sin.get(p.id) || { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: 0 }; a.cantidad += it.cantidad; sin.set(p.id, a); } }
      return json({ import_id: idImp, reemplazo: prev >= 0, items: b.p_items.length, pedidos: b.p_pedidos.length, pagos: b.p_pagos.length, movimientos: 7, no_descontados: b.p_items.filter(i => i.no_descontar).length, sin_receta: [...sin.values()].sort((x, y) => y.cantidad - x.cantidad) });
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
      if (req.method() === 'POST') { const b = body(); const o = { creado_en: new Date().toISOString(), ...b, id: nid('ord'), creado_por: U_ENC }; db.ordenes.push(o); return json([{ id: o.id }], 201); }
      if (req.method() === 'PATCH') { const id = eq(q.get('id')); const o = db.ordenes.find(x => x.id === id); Object.assign(o, body()); return json([{ id }]); }
      let r = db.ordenes; const est = enLista(q.get('estado')); if (est) r = r.filter(o => est.includes(o.estado));
      if (eq(q.get('local_id'))) r = r.filter(o => o.local_id === eq(q.get('local_id')));
      if (rol === 'encargado') r = r.filter(o => o.local_id === L1);
      r = r.map(o => ({ ...o, orden_items: db.items.filter(i => i.orden_id === o.id).map(i => ({ id: i.id, producto_id: i.producto_id, cantidad_pedida: i.cantidad_pedida, cantidad_recibida: i.cantidad_recibida, excluido: !!i.excluido, agregado: !!i.agregado, no_vino: !!i.no_vino })) }));
      r.sort((a, b) => (q.get('order') || '').includes('desc') ? b.creado_en.localeCompare(a.creado_en) : a.creado_en.localeCompare(b.creado_en));
      return json(r);
    }
    if (t === 'orden_items') {
      if (req.method() === 'POST') { const b = body(); const nuevos = (Array.isArray(b) ? b : [b]).map(i => ({ ...i, id: nid('it'), cantidad_recibida: null })); db.items.push(...nuevos); return json(nuevos.map(i => ({ id: i.id })), 201); }
      if (req.method() === 'PATCH') { const ids = enLista(q.get('id')) || [eq(q.get('id'))]; ids.forEach(id => Object.assign(db.items.find(x => x.id === id), body())); return json(ids.map(id => ({ id }))); }
      if (req.method() === 'DELETE') { const id = eq(q.get('id')); db.items = db.items.filter(x => x.id !== id); return json([{ id }]); }
    }
    if (t === 'movimientos' && req.method() === 'GET') {
      const ahora = new Date().toISOString(); const l = eq(q.get('local_id'));
      const demo = [['p-chorizo', 'venta', -6], ['p-bondiola', 'venta', -3], ['p-mozza', 'produccion_consumo', -1.5], ['p-queso', 'merma', -0.5]].map(([producto_id, tipo, cantidad]) => ({ local_id: L1, producto_id, tipo, cantidad, creado_en: ahora }));
      return json([...demo, ...db.movimientos.map(m => ({ creado_en: ahora, ...m }))].filter(m => m.local_id === l && m.tipo !== 'recepcion'));
    }
    if (t === 'movimientos' && req.method() === 'POST') { if (rol !== 'gerencia') return json({ code: '42501', message: 'row-level security' }, 403); const b = body(); db.movimientos.push(...b); return route.fulfill({ status: 201, headers: cors, body: '' }); }
    if (t === 'rpc/recibir_orden') {
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Sin permiso para recibir órdenes' }, 403);
      const b = body(); db.recepciones.push(b);
      const o = db.ordenes.find(x => x.id === b.p_orden);
      for (const it of b.p_items) {
        let item = it.orden_item_id ? db.items.find(i => i.id === it.orden_item_id) : db.items.find(i => i.orden_id === o.id && i.producto_id === it.producto_id);
        if (!item) {
          if (!(it.cantidad_recibida > 0)) continue;
          if (db.productos.find(x => x.id === it.producto_id).local_id !== o.local_id) return json({ message: 'El producto es de otro local' }, 400);
          item = { id: nid('oi'), orden_id: o.id, producto_id: it.producto_id, cantidad_pedida: 0, cantidad_recibida: 0, agregado: true }; db.items.push(item);
        }
        if (it.no_vino) item.no_vino = true;
        const p = db.productos.find(x => x.id === item.producto_id);
        if (it.cantidad_recibida > 0) {
          db.movimientos.push({ local_id: o.local_id, producto_id: item.producto_id, tipo: 'recepcion', cantidad: it.cantidad_recibida * p.factor_conversion, ref_id: o.id });
          item.cantidad_recibida = (item.cantidad_recibida || 0) + it.cantidad_recibida;
          if (it.precio_unitario !== null && it.precio_unitario !== db.precios[item.producto_id]) { db.preciosNuevos.push({ producto_id: item.producto_id, precio: it.precio_unitario, origen: 'recepcion' }); db.precios[item.producto_id] = it.precio_unitario; }
        }
      }
      if (b.p_cerrar) db.items.filter(i => i.orden_id === o.id && (i.cantidad_recibida || 0) < i.cantidad_pedida).forEach(i => { i.no_vino = true; });
      o.estado = db.items.filter(i => i.orden_id === o.id).every(i => i.no_vino || (i.cantidad_recibida || 0) >= i.cantidad_pedida) ? 'recibida' : 'parcial';
      return json(o.estado);
    }
    if (t === 'orden_item_precios') { const b = body(); db.itemPrecios.push(b); return json([b], 201); }
    if (t === 'precios' && req.method() === 'POST') { const b = body(); (Array.isArray(b) ? b : [b]).forEach(r => { db.preciosNuevos.push(r); db.precios[r.producto_id] = r.precio; }); return json([{ id: 'pr' }], 201); }
    if (t === 'facturas_locales' && req.method() === 'GET') return json([]);
    return json({ message: 'mock: ruta no prevista ' + req.method() + ' ' + t }, 404);
  });
}

// ---------- recorrido ----------
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const VIVAS_E2E = ['borrador', 'aprobada'];
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
  ok(await e.locator('.prod[data-id="p-chorizo"] .step-val').inputValue() === '0', 'sin pedido precargado: Chorizo arranca en 0');
  ok(await e.locator('.prod[data-id="p-mozza"] .step-val').inputValue() === '0', 'sin pedido precargado: Mozzarella arranca en 0');
  ok(!db.log.some(l => l.t === 'rpc/sugerido_pedido'), 'Pedir ya no pide el sugerido');
  ok((await e.locator('.prod[data-id="p-chorizo"] .quedan').innerText()).replace(/\s+/g, ' ').includes('Quedan 3'), '"Quedan 3" visible');
  ok(await e.locator('.prod[data-id="p-bondiola"] .step-val').inputValue() === '0', 'sin par: Pedir arranca en 0');
  ok(await e.locator('.pill').isHidden(), 'sin cantidades no hay píldora de Revisar');
  ok(await e.locator('.borrador').isHidden(), 'sin cantidades no hay aviso de pedido guardado');
  await shot(e, '03-pedir-m');
  // pantalla fija como app de iPhone: la ventana no se desplaza, scrollea sólo #scroller y la barra queda abajo
  const fija = await e.evaluate(async () => {
    const sc = document.getElementById('scroller');
    window.scrollTo(0, 0);
    const barra = () => document.getElementById('tabbar').getBoundingClientRect().bottom;
    const antes = barra();
    sc.scrollTop = 400; await new Promise(r => setTimeout(r, 50));
    const fs = [...document.querySelectorAll('input, select, textarea')].filter(x => x.offsetParent).map(x => parseFloat(getComputedStyle(x).fontSize));
    const r = { ventana: document.scrollingElement.scrollHeight <= innerHeight + 1, scrollea: sc.scrollTop > 0, barra: barra() === antes && Math.round(antes) === innerHeight,
      busca: Math.round(document.querySelector('.toolbar-fija').getBoundingClientRect().top) >= 0, letra: Math.min(...fs), ancho: document.documentElement.scrollWidth <= innerWidth };
    window.scrollTo(0, 0); r.vuelve = sc.scrollTop === 0;
    return r;
  });
  ok(fija.ventana && fija.scrollea && fija.vuelve, 'iPhone: la ventana no se desplaza, scrollea el contenido y window.scrollTo lo lleva arriba');
  ok(fija.barra, 'iPhone: la barra inferior no se mueve al scrollear');
  ok(fija.busca, 'iPhone: el buscador queda fijo arriba al scrollear');
  ok(fija.letra >= 16, `iPhone: campos con letra de 16 px o más (sin zoom al tocar) · mínimo ${fija.letra}`);
  ok(fija.ancho, 'iPhone: sin desplazamiento horizontal');
  // buscador: fijo arriba; con una categoría elegida busca dentro de ella (#62) y ofrece buscar en todas
  await e.locator('.chip', { hasText: 'Bebidas' }).click();
  await e.locator('#buscar').fill('chor');
  ok(await e.locator('.prod').count() === 0, 'con Bebidas elegida, "chor" no trae el chorizo (busca dentro de la categoría)');
  await e.locator('.chip', { hasText: 'Carnes' }).click();
  ok(await e.locator('.prod').count() === 1 && await e.locator('.prod[data-id="p-chorizo"]').count() === 1, 'buscador filtra al instante dentro de la categoría elegida');
  ok((await e.locator('.busca-n').innerText()).includes('1 producto'), 'buscador muestra cuántos encontró');
  await e.getByRole('button', { name: 'Más · Pedir Chorizo parrillero', exact: true }).click();
  await shot(e, '03b-pedir-buscar-m');
  await e.locator('.busca-x').click();
  ok(await e.locator('#buscar').inputValue() === '', 'la cruz borra la búsqueda');
  await e.locator('.chip', { hasText: 'Todas' }).click();
  await e.evaluate(() => window.scrollTo(0, 2000));
  const topBusca = await e.locator('.toolbar-fija').evaluate(el => el.getBoundingClientRect().top);
  ok(Math.abs(topBusca) < 2, `el buscador queda fijo arriba al bajar (${topBusca})`);
  await e.evaluate(() => window.scrollTo(0, 0));
  await e.getByRole('button', { name: 'Más · Pedir Mozzarella en barra', exact: true }).click();
  // pedido guardado por local y encargado: sobrevive a recargar
  ok((await e.locator('.borrador').innerText()).includes('Tu pedido de Umo Grill está guardado'), 'avisa que el pedido queda guardado');
  const claves = await e.evaluate(() => Object.keys(localStorage).filter(k => k.includes('pedido:')));
  ok(claves.length === 1 && claves[0].includes(L1) && /pedido:[^:]+:.+/.test(claves[0]), 'el pedido se guarda por local y por encargado: ' + claves.join());
  await e.reload(); await e.waitForSelector('.prod');
  ok(await e.locator('.prod[data-id="p-chorizo"] .step-val').inputValue() === '1' && (await e.locator('.pill').innerText()).includes('2 ítems'), 'al volver a entrar el pedido sigue ahí');
  await e.locator('.chip-mio').click();
  ok(await e.locator('.prod').count() === 2, '"En mi pedido" muestra solo lo que cargó');
  await shot(e, '03c-pedir-guardado-m');
  await e.locator('.chip', { hasText: 'Todas' }).click();
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
  ok(db.log.filter(l => l.rol === 'encargado').every(l => !/ventas|receta|produccion|merma|alias|importar|precio|pago|factura|cuenta_corriente|tablero|comprobante|storage/i.test(l.t)), 'el encargado nunca consulta ventas, recetas, producción, merma ni precios ' + [...new Set(db.log.filter(l => l.rol === 'encargado' && /ventas|receta|produccion|merma|alias|importar|precio|pago|factura|cuenta_corriente|tablero|comprobante|storage/i.test(l.t)).map(l => l.t))].join());
  ok(db.log.filter(l => l.t === 'rpc/sugerido_pedido').every(l => l.rol !== null), 'sugerido_pedido solo con sesión');
  ok(await e.locator('.ped').count() === 4, 'Mis pedidos lista 4 pedidos');
  ok((await e.locator('.ped').first().innerText()).includes('En revisión'), 'estado "En revisión"');
  await e.locator('.ped-b').first().click();
  await shot(e, '05-mis-pedidos-m', true);
  ok(await e.locator('a[data-nav]').count() === 4 || await e.locator('.tab').count() >= 2, 'encargado solo tiene Pedir / Mis pedidos / Notas / Salir');
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
  await d.getByRole('button', { name: 'Más · Pedir Chorizo parrillero', exact: true }).click();
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

  // Pedidos de otro local y uno ya recibido (historial): para la tabla de gerencia y el proveedor sugerido.
  const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
  db.ordenes.push({ id: 'ord-tre-1', local_id: L2, proveedor_id: PV.barcena, estado: 'borrador', cargado_por_nombre: 'Angelica', nota: null, creado_en: hace(90) },
    { id: 'ord-tre-2', local_id: L2, proveedor_id: null, estado: 'borrador', cargado_por_nombre: 'Angelica', nota: null, creado_en: hace(89) },
    { id: 'ord-tre-h', local_id: L2, proveedor_id: PV.demo, estado: 'recibida', cargado_por_nombre: 'Angelica', nota: null, creado_en: hace(60 * 24 * 6) });
  db.items.push({ id: 'it-tre-1', orden_id: 'ord-tre-1', producto_id: 'p-trento', cantidad_pedida: 2, cantidad_recibida: null },
    { id: 'it-tre-2', orden_id: 'ord-tre-2', producto_id: 'p-limon', cantidad_pedida: 3, cantidad_recibida: null },
    { id: 'it-tre-h', orden_id: 'ord-tre-h', producto_id: 'p-limon', cantidad_pedida: 2, cantidad_recibida: 2 });

  // ===== Gerencia · escritorio =====
  const cGer = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
  const g = await nuevaPagina(cGer, 'gerencia');
  await g.goto(BASE);
  await g.waitForSelector('.seg');
  await g.getByRole('tab', { name: 'Administración' }).click();
  await g.locator('#in-email').fill('jacobo@ejemplo.com');
  await g.locator('#in-pass').fill('clave-segura');
  await g.locator('form button[type=submit]').click();
  await g.waitForSelector('.tb-card', { timeout: 8000 }).catch(async () => { console.log('DEBUG', (await g.locator('body').innerText()).slice(0, 400)); console.log(JSON.stringify(db.log.slice(-8))); throw new Error('Tablero no cargó'); });
  ok(await g.locator('h1').first().innerText() === 'Tablero', 'gerencia cae en el Tablero (inicio)');
  ok(await g.locator('.sidebar .side-link').count() === 10, 'gerencia: barra lateral con 9 secciones (Tablero, Pedidos, Compras, Notas, Stock, Ventas, Cocina, Pagos, Catálogo) + Salir');
  // ---- Tablero ----
  const tbTxt = async () => (await g.locator('.tb-metricas').innerText()).replace(/\s+/g, ' ');
  ok(/VENTAS \$ 2\.850\.000 Anterior \$ 2\.610\.000 · ▲ 9 %/i.test(await tbTxt()), 'Tablero: ventas de la semana contra la anterior con variación (+9 %) ' + await tbTxt());
  ok(/COMPRAS \$ 1\.240\.000 Anterior \$ 1\.480\.000 · ▼ 16 %/i.test(await tbTxt()) && /MARGEN BRUTO ESTIMADO \$ 1\.940\.000/i.test(await tbTxt()) && /COSTO DE MERCADERÍA VENDIDA \$ 910\.000/i.test(await tbTxt()), 'Tablero: compras, costo de mercadería vendida y margen estimado');
  for (const c of ['ventas', 'compras', 'cmv', 'margen', 'stock', 'deuda', 'sin-avisar', 'por-aprobar', 'faltantes', 'pendientes']) ok(await g.locator(`[data-card="${c}"]`).count() === 1, `Tablero: tarjeta ${c}`);
  const tbAll = (await g.locator('.vista').innerText()).replace(/\s+/g, ' ');
  ok(/Plata parada en stock \$ 3\.120\.000/i.test(tbAll) && /Trento Café \$ 870\.000/.test(tbAll), 'Tablero: plata parada en stock por local');
  ok(/Deuda con proveedores \$ 640\.000 2 facturas vencidas · \$ 130\.000/i.test(tbAll), 'Tablero: deuda y facturas vencidas');
  ok(/Pagos sin avisar 1/i.test(tbAll) && /Pedidos por aprobar 3/i.test(tbAll) && /Cerveza rubia lata 473 ml \$ 19\.600/.test(tbAll) && /Datos pendientes 26/i.test(tbAll), 'Tablero: pagos sin avisar, pedidos por aprobar, faltantes más caros y datos pendientes');
  ok(db.consultasTablero.length === 1 && db.consultasTablero[0].p_local === null && db.consultasTablero[0].p_desde === '2026-10-26' && db.consultasTablero[0].p_hasta === '2026-10-26', 'Tablero: una sola llamada rpc tablero (todos los locales, lunes a hoy) ' + JSON.stringify(db.consultasTablero[0]));
  await shot(g, '39-g-tablero-pc', true);
  await g.locator('.chip', { hasText: 'Umo Grill' }).click();
  await g.waitForFunction(() => /\$ 1\.140\.000/.test(document.querySelector('.tb-metricas').innerText));
  ok(db.consultasTablero.at(-1).p_local === L1, 'Tablero: filtrar por local vuelve a llamar con ese local');
  await g.locator('.chip', { hasText: 'Todos los locales' }).click();
  await g.waitForFunction(() => /\$ 2\.850\.000/.test(document.querySelector('.tb-metricas').innerText));
  await g.locator('[data-card="por-aprobar"]').click();
  await g.waitForSelector('.ped-tabla', { timeout: 8000 });
  ok(await g.locator('.side-link.is-active').innerText() === 'Pedidos' && await g.locator('.grupo-prov').count() === 0, 'Pedidos abre en "De los locales" (tabla), sin lo de proveedores');
  ok(await g.locator('[data-accion="ir-compras"]').count() === 1, 'Pedidos tiene el acceso a Compras cuando hay algo para mandar');
  ok(await g.locator('.pt-envio').count() === 2, `tabla: un renglón por pedido de cada local (Umo de Ruth y Trento de Angelica), no por proveedor (${await g.locator('.pt-envio').count()})`);
  ok(await g.locator('.pt-h').isVisible(), 'en PC la tabla tiene encabezados');
  const filaUmo = g.locator('.pt-envio', { hasText: 'Umo Grill' });
  const txtUmo = (await filaUmo.innerText()).replace(/\s+/g, ' ');
  ok(/Ruth Coronel/.test(txtUmo) && /6 productos/.test(txtUmo) && /Barcena/.test(txtUmo) && /Sin proveedor/.test(txtUmo) && /En revisión/.test(txtUmo) && /Nota/.test(txtUmo), 'fila: local, encargado, productos, proveedores, estado y nota · ' + txtUmo);
  ok((await g.locator('.pt-envio').first().innerText()).includes('Umo Grill'), 'lo más nuevo arriba');
  await g.locator('[data-filtro="enviados"]').click();
  ok(await g.locator('.pt-envio').count() === 1 && /Recibido/.test(await g.locator('.pt-envio').innerText()), 'filtro Enviados muestra el historial (pedido recibido de Trento)');
  await g.locator('[data-filtro="revisar"]').click();
  await shot(g, '10-g-pedidos-tabla-pc');
  await filaUmo.locator('.pt-fila').click();
  await g.waitForSelector('.pt-det');
  ok(await g.locator('.pt-det .det-fila:not(.det-h)').count() === 6, 'detalle: los 6 productos del pedido');
  ok(/Entregar antes de las 10/.test(await g.locator('.pt-det .pt-nota').innerText()), 'detalle: nota del local');
  const sugServ = await g.locator('.det-fila', { hasText: 'Servilletas de papel' }).locator('.sug').innerText();
  ok(/Distribuidora Demo/.test(sugServ) && /como en Trento Café/.test(sugServ), 'proveedor sugerido: el mismo producto en otro local · ' + sugServ.replace(/\s+/g, ' '));
  ok(!(await g.locator('.pt-det').innerText()).includes('$'), 'el detalle del pedido no muestra plata');
  await shot(g, '10b-g-pedidos-detalle-pc');
  // corregir una cantidad desde la tabla
  const inpCer = g.getByLabel('Cantidad de Cerveza rubia lata 473 ml');
  await inpCer.fill('3'); await inpCer.evaluate(el => el.blur());
  await g.waitForTimeout(700);
  ok(db.items.find(i => i.producto_id === 'p-cerveza').cantidad_pedida === 3, 'editar cantidad guarda el ítem (2 → 3)');
  await inpCer.fill('2'); await inpCer.evaluate(el => el.blur());
  await g.waitForTimeout(700);
  // pasar un producto a otro proveedor: va a una orden nueva del mismo local, encargado y fecha
  const ordBar = db.ordenes.find(o => o.local_id === L1 && o.proveedor_id === PV.barcena);
  await g.getByLabel('Proveedor de Mozzarella en barra').selectOption(PV.demo);
  await g.waitForFunction(() => document.querySelector('.det-fila[data-item] select[aria-label="Proveedor de Mozzarella en barra"]')?.value !== '' );
  await g.waitForTimeout(400);
  const ordDemo = db.ordenes.find(o => o.local_id === L1 && o.proveedor_id === PV.demo);
  ok(ordDemo && ordDemo.cargado_por_nombre === 'Ruth Coronel' && ordDemo.creado_en === ordBar.creado_en && db.items.find(i => i.producto_id === 'p-mozza').orden_id === ordDemo.id, 'mover un producto: orden nueva de Demo para Umo, misma encargada y fecha, con el ítem movido');
  ok(db.items.find(i => i.producto_id === 'p-chorizo').orden_id === ordBar.id, 'el resto del pedido de Barcena queda donde estaba');
  ok(db.productos.find(p => p.id === 'p-mozza').proveedor_id === PV.demo, 'el catálogo recuerda el proveedor nuevo');
  ok(await g.locator('.pt-envio').count() === 2, 'sigue siendo un solo pedido de Umo en la tabla');
  await g.getByLabel('Proveedor de Mozzarella en barra').selectOption(PV.barcena);
  await g.waitForTimeout(600);
  ok(ordDemo.proveedor_id === PV.barcena && db.productos.find(p => p.id === 'p-mozza').proveedor_id === PV.barcena, 'volver a Barcena: la orden entera cambia de proveedor y el catálogo también');
  // agregar un producto que el local no pidió, antes de aprobar
  const agregarEn = async (scope, buscar, nombre, cant) => {
    await scope.locator('[data-accion="agregar"]').click();
    await g.waitForSelector('dialog.sheet .ag-hoja');
    await g.getByLabel('Buscar producto para agregar').fill(buscar);
    await g.getByRole('button', { name: 'Agregar ' + nombre }).click();
    await g.locator('dialog.sheet').getByLabel('Cantidad de ' + nombre).fill(String(cant));
  };
  const nItems = db.items.length;
  await agregarEn(filaUmo.locator('.pt-det'), 'queso', 'Queso cremoso', 2);
  ok(/Umo Grill · Barcena/.test(await g.locator('.ag-elegido').innerText()), 'agregar: dice a qué local y proveedor va');
  await g.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(g, '10f-g-pedidos-agregar-pc');
  await g.locator('[data-accion="agregar-confirmar"]').click();
  await filaUmo.locator('.det-fila', { hasText: 'Queso cremoso' }).waitFor();
  const itQ = db.items.find(i => i.producto_id === 'p-queso');
  ok(itQ && itQ.orden_id === ordBar.id && itQ.cantidad_pedida === 2 && db.items.length === nItems + 1, 'agregar: el queso va a la orden de Barcena de Umo con 2');
  ok(await filaUmo.locator('.det-fila:not(.det-h)').count() === 7, 'agregar: el detalle muestra 7 productos');
  const choIt = db.items.find(i => i.producto_id === 'p-chorizo'); const choA = choIt.cantidad_pedida;
  await agregarEn(filaUmo.locator('.pt-det'), 'chorizo', 'Chorizo parrillero', 1);
  ok(/Ya pidió/.test(await g.locator('dialog.sheet').innerText()), 'agregar algo ya pedido avisa que se suma');
  await g.locator('[data-accion="agregar-confirmar"]').click();
  await g.waitForSelector('dialog.sheet', { state: 'detached' });
  await g.waitForTimeout(300);
  ok(choIt.cantidad_pedida === choA + 1 && db.items.length === nItems + 1, `agregar algo ya pedido suma a esa cantidad (${choA} → ${choIt.cantidad_pedida})`);
  // Trento no tiene pedido a Demo: se crea una orden nueva con la misma encargada y fecha (sigue en el mismo renglón)
  const filaTre = g.locator('.pt-envio:has([data-envio="ord-tre-1"])');
  await filaTre.locator('.pt-fila').click();
  await filaTre.locator('.pt-det').waitFor();
  await agregarEn(filaTre.locator('.pt-det'), 'servill', 'Servilletas de papel', 4);
  await g.locator('[data-accion="agregar-confirmar"]').click();
  await filaTre.locator('.det-fila', { hasText: 'Servilletas de papel' }).waitFor();
  const ordTreDemo = db.ordenes.find(o => o.local_id === L2 && o.proveedor_id === PV.demo && o.estado === 'borrador');
  ok(ordTreDemo && ordTreDemo.cargado_por_nombre === 'Angelica' && ordTreDemo.creado_en === db.ordenes.find(o => o.id === 'ord-tre-1').creado_en
    && db.items.some(i => i.orden_id === ordTreDemo.id && i.producto_id === 'p-serv-tre' && i.cantidad_pedida === 4), 'agregar sin orden de ese proveedor: orden nueva de Demo para Trento, misma encargada y fecha');
  ok(await g.locator('.pt-envio').count() === 2, 'sigue siendo un renglón por local');
  // se deja todo como estaba para lo que sigue
  db.items = db.items.filter(i => i !== itQ && i.orden_id !== ordTreDemo.id); db.ordenes = db.ordenes.filter(o => o !== ordTreDemo); choIt.cantidad_pedida = choA;
  await g.reload(); await g.waitForSelector('.ped-tabla');
  // ---- Compras (por proveedor) ----
  await g.locator('.sidebar a[data-nav="compras"]').click();
  await g.waitForSelector('.grupo-prov');
  ok(await g.locator('.side-link.is-active').innerText() === 'Compras' && await g.locator('.subnav-b.is-on').innerText() === 'Enviar', 'Compras: pestaña propia, abre en Enviar (por proveedor)');
  ok((await g.locator('.subnav-b').allInnerTexts()).join('|') === 'Enviar|Recibir|Gasto', 'Compras: Enviar · Recibir · Gasto');
  ok(await g.locator('.zona-pruebas').count() === 0 && await g.locator('[data-accion="cargar"]').count() === 0, 'Compras no repite Cargar ni Borrar todo');
  ok(await g.locator('.grupo-prov').count() === 4, `Por proveedor: Barcena, Florida, Martín + Sin proveedor (${await g.locator('.grupo-prov').count()})`);
  const sinP = g.locator('.grupo-prov[data-prov="Sin proveedor"]');
  ok(await sinP.getByRole('button', { name: 'Enviar por WhatsApp' }).count() === 0, 'Sin proveedor: no se puede mandar');
  const txtSin = (await sinP.innerText()).replace(/\s+/g, ' ');
  ok(/Servilletas de papel/.test(txtSin) && /Limones/.test(txtSin) && /último pedido/.test(txtSin), 'Sin proveedor junta los dos locales y sugiere por último pedido · ' + txtSin);
  const barTxt = (await g.locator('.grupo-prov[data-prov="Barcena"]').innerText()).replace(/\s+/g, ' ');
  ok(/Umo Grill \(Ruth Coronel\)/.test(barTxt) && /Trento Café \(Angelica\)/.test(barTxt) && /Café en grano/.test(barTxt), 'Barcena suma lo de Umo y Trento y dice quién pidió · ' + barTxt);
  await shot(g, '10c-g-pedidos-proveedor-pc', true);
  await sinP.locator('[data-accion="sugeridos"]').click();
  await g.waitForSelector('.grupo-prov[data-prov="Sin proveedor"]', { state: 'detached' });
  ok(db.ordenes.filter(o => VIVAS_E2E.includes(o.estado) && o.proveedor_id === PV.demo).length === 2, 'Usar los sugeridos: servilletas y limones pasan a Distribuidora Demo');
  ok(await g.locator('.grupo-prov').count() === 4, 'tras asignar, quedan 4 proveedores (con Demo)');
  const martinG = await g.locator('.grupo-prov[data-prov="Martín De Ridder"]').innerText();
  ok(/Pedido mínimo \$ 100\.000/.test(martinG), 'gerencia ve el mínimo de Martín De Ridder');
  // agregar desde la tarjeta del proveedor: se elige el local y va a ese proveedor
  const barcena = g.locator('.grupo-prov[data-prov="Barcena"]');
  await barcena.locator('[data-accion="agregar"]').click();
  await g.waitForSelector('dialog.sheet .ag-hoja');
  const opLoc = await g.locator('dialog.sheet select[aria-label="Local"] option').allInnerTexts();
  ok(opLoc.length === 5 && opLoc[0] === 'Trento Café' && opLoc[1] === 'Umo Grill', 'tarjeta: se elige el local, primero los que ya le piden a Barcena · ' + opLoc.join(', '));
  await g.locator('dialog.sheet select[aria-label="Local"]').selectOption(L1);
  ok(await g.getByRole('button', { name: 'Agregar Queso cremoso' }).count() === 1, 'tarjeta: sin buscar muestra los productos de ese proveedor');
  await g.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(g, '10g-g-pedidos-agregar-proveedor-pc');
  await g.getByRole('button', { name: 'Agregar Queso cremoso' }).click();
  await g.locator('dialog.sheet').getByLabel('Cantidad de Queso cremoso').fill('1,5');
  await g.locator('[data-accion="agregar-confirmar"]').click();
  await barcena.locator('.pp-fila', { hasText: 'Queso cremoso' }).waitFor();
  const itQ2 = db.items.find(i => i.producto_id === 'p-queso');
  ok(itQ2 && itQ2.orden_id === ordBar.id && itQ2.cantidad_pedida === 1.5, 'tarjeta: el queso se suma al pedido de Barcena de Umo con 1,5');
  g.once('dialog', d => d.accept());
  const inpQ = barcena.getByLabel('Cantidad de Queso cremoso para Umo Grill');
  await inpQ.fill('0'); await inpQ.evaluate(el => el.blur());
  await barcena.locator('.pp-fila', { hasText: 'Queso cremoso' }).waitFor({ state: 'detached' });
  await g.waitForTimeout(600);
  ok(!db.items.some(i => i.producto_id === 'p-queso'), 'lo agregado se saca poniendo 0');
  // destildar un producto: no se manda ni se imprime
  await barcena.getByLabel('Pedir Café en grano').uncheck();
  await g.waitForSelector('.grupo-prov[data-prov="Barcena"] .pp-fila.is-fuera');
  await g.waitForTimeout(300);
  ok(db.items.filter(i => i.producto_id === 'p-trento').every(i => i.excluido === true) && db.log.some(l => l.m === 'PATCH' && l.t === 'orden_items' && l.b.excluido === true), 'destildar se guarda en el servidor (orden_items.excluido)');
  await g.reload();
  await g.waitForSelector('.grupo-prov[data-prov="Barcena"] .pp-fila.is-fuera');
  ok(!(await g.getByLabel('Pedir Café en grano').isChecked()), 'al volver a abrir, lo destildado sigue destildado');
  ok(/2 de 3 productos/.test(await barcena.locator('.pp-sub').innerText()) && /1 producto destildado/.test(await barcena.innerText()), 'destildar: la tarjeta dice 2 de 3 y avisa que no se manda');
  const martinC = g.locator('.grupo-prov[data-prov="Martín De Ridder"]');
  await martinC.getByLabel('Pedir Bondiola de cerdo').uncheck();
  ok(await martinC.getByRole('button', { name: 'Enviar por WhatsApp' }).isDisabled() && await martinC.getByRole('button', { name: 'Imprimir' }).isDisabled(), 'todo destildado: no se puede mandar ni imprimir');
  await martinC.getByLabel('Pedir Bondiola de cerdo').check();
  await g.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await barcena.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await shot(g, '10e-g-pedidos-destildado-pc');
  // revisar y aprobar: sin aprobar no se manda ni se imprime; la cantidad de cada local se corrige en la tarjeta
  ok(await barcena.locator('[data-accion="enviar"]').isDisabled() && await barcena.getByRole('button', { name: 'Imprimir' }).isDisabled(), 'sin aprobar no se puede mandar ni imprimir');
  ok(/falta aprobar: Trento Café, Umo Grill/.test(await barcena.locator('.pp-falta-aprobar').innerText()), 'la tarjeta dice qué locales faltan aprobar');
  const itCho = db.items.find(i => i.producto_id === 'p-chorizo');
  const choAntes = itCho.cantidad_pedida;
  const inpCho = barcena.getByLabel('Cantidad de Chorizo parrillero para Umo Grill');
  await inpCho.fill(String(choAntes + 2)); await inpCho.evaluate(el => el.blur());
  await g.waitForTimeout(700);
  ok(itCho.cantidad_pedida === choAntes + 2, `corregir la cantidad de un local en la tarjeta del proveedor guarda el ítem (${choAntes} → ${itCho.cantidad_pedida})`);
  ok((await barcena.locator('.pp-fila[data-prod="p-chorizo"] .pp-cant b').innerText()).trim() === String(choAntes + 2), 'el total del producto se actualiza');
  await inpCho.fill(String(choAntes)); await inpCho.evaluate(el => el.blur());
  await g.waitForTimeout(700);
  await barcena.locator('[data-accion="aprobar"]').click();
  await g.waitForSelector('.grupo-prov[data-prov="Barcena"] [data-accion="enviar"]:not([disabled])');
  ok(db.ordenes.filter(o => o.proveedor_id === PV.barcena && VIVAS_E2E.includes(o.estado)).every(o => o.estado === 'aprobada'), 'Aprobar cantidades aprueba lo de todos los locales de ese proveedor');
  ok(await barcena.locator('.pp-loc-ok').count() > 0 && await barcena.locator('.pp-loc-inp').count() > 0, 'aprobado: muestra la tilde y la cantidad sigue editable hasta enviarlo');
  // imprimir: A4 horizontal con lo tildado; la vista previa se guarda en PDF
  await g.evaluate(() => { window.print = () => { window.__impreso = document.querySelector('.print-area').outerHTML; }; });
  const avisoPrint = new Promise(r => g.once('dialog', async d => { r(d.message()); await d.dismiss(); }));
  await barcena.getByRole('button', { name: 'Imprimir' }).click();
  ok(/Marcar el pedido a Barcena como enviado/.test(await avisoPrint) && /1 producto destildado sale/.test(await avisoPrint), 'después de imprimir pregunta si se marca como enviado');
  const impreso = await g.evaluate(() => window.__impreso || '');
  ok(/Chorizo parrillero/.test(impreso) && /Mozzarella en barra/.test(impreso) && !/Café en grano/.test(impreso) && !/\$/.test(impreso), 'la hoja impresa lleva lo tildado, sin el destildado ni precios');
  ok(db.ordenes.find(o => o.local_id === L1 && o.proveedor_id === PV.barcena && o.id === ordBar.id).estado === 'aprobada', 'si no se confirma, el pedido no cambia');
  const pdf = async (html, nombre) => {
    await g.evaluate((x) => { document.querySelectorAll('.print-area').forEach(e => e.remove()); const d = document.createElement('div'); d.innerHTML = x; document.body.append(d.firstElementChild); document.body.classList.add('imprimiendo'); }, html);
    await g.pdf({ path: path.join(OUT, nombre + '.pdf'), preferCSSPageSize: true, printBackground: true });
    await g.evaluate(() => { document.querySelectorAll('.print-area').forEach(e => e.remove()); document.body.classList.remove('imprimiendo'); });
  };
  for (const n of ['Martín De Ridder', 'Distribuidora Demo']) {
    await g.locator(`.grupo-prov[data-prov="${n}"] [data-accion="aprobar"]`).click();
    await g.waitForSelector(`.grupo-prov[data-prov="${n}"] [data-accion="enviar"]:not([disabled])`);
  }
  await g.locator('[data-accion="imprimir-todos"]').click();
  const todos = await g.evaluate(() => window.__impreso);
  ok((todos.match(/class="pr-prov"/g) || []).length === 3 && !/Distribuidora Florida/.test(todos), 'Imprimir todos: una hoja por proveedor aprobado (3, Florida todavía no)');
  await pdf(todos, 'impresion-todos');
  // lista larga (de prueba) para ver salto de página y numeración
  const largo = await g.evaluate((x) => { const d = document.createElement('div'); d.innerHTML = x; const tb = d.querySelector('tbody'); const base = [...tb.children]; for (let i = 0; i < 14; i++) base.forEach(r => tb.append(r.cloneNode(true))); return d.innerHTML; }, impreso);
  await pdf(largo, 'impresion-lista-larga');
  await barcena.getByLabel('Pedir Café en grano').check();
  const florida = g.locator('.grupo-prov[data-prov="Distribuidora Florida"]');
  // aprobar
  const a0 = db.log.length;
  await florida.getByRole('button', { name: 'Aprobar' }).click();
  await g.waitForTimeout(500);
  ok(db.ordenes.find(o => o.proveedor_id === PV.florida).estado === 'aprobada', 'Aprobar pasa la orden a "aprobada"');
  ok(db.log.slice(a0).some(l => l.m === 'PATCH' && l.t === 'ordenes_compra' && l.b.estado === 'aprobada'), 'PATCH estado aprobada');
  await shot(g, '11-g-pedidos-aprobado-pc');
  // WhatsApp
  await g.locator('.grupo-prov[data-prov="Distribuidora Florida"]').getByRole('button', { name: 'Enviar por WhatsApp' }).click();
  await g.waitForSelector('.sheet .orden-img img');
  const dimImg = await g.locator('.sheet .orden-img img').evaluate(i => [i.naturalWidth, i.naturalHeight]);
  ok(dimImg[0] === 1080 && dimImg[1] > 600, `copia del pedido en imagen (${dimImg.join('×')})`);
  ok(await g.locator('.sheet [data-accion="descargar"]').count() === 1, 'se puede descargar la imagen');
  ok((await g.locator('.sheet [data-accion="mail"]').innerText()).includes('pedidos@florida.com'), 'pedido: botón para mandarlo por email');
  ok(/Hernán/.test(await g.locator('.sheet [data-destino]').innerText()), 'pedido: muestra el contacto del proveedor');
  await shot(g, '11c-g-pedidos-enviar-pc');
  const imgOrden = await g.locator('.sheet .orden-img img').evaluate(async (i) => { const b = await (await fetch(i.src)).arrayBuffer(); let s = ''; new Uint8Array(b).forEach(x => { s += String.fromCharCode(x); }); return btoa(s); });
  fs.writeFileSync(path.join(OUT, '11d-copia-pedido.png'), Buffer.from(imgOrden, 'base64'));
  if (await g.locator('.sheet .seg').count()) {
    await g.locator('.sheet').getByRole('tab', { name: 'Todo junto' }).click();
    await g.waitForFunction(() => /Pedido total/.test((document.querySelector('.sheet .orden-img img') || {}).alt || ''));
    ok(true, 'Todo junto suma los productos de todos los locales');
    await g.locator('.sheet').getByRole('tab', { name: 'Separado por local' }).click();
  }
  const dl = []; g.on('download', d => dl.push(d.suggestedFilename()));
  ok(/Abrir el chat de Distribuidora Florida con la imagen|Bajar la imagen y abrir WhatsApp/.test(await g.locator('.sheet [data-accion="wa"]').innerText()), 'escritorio: el botón abre el chat del proveedor con la imagen');
  const [popup] = await Promise.all([cGer.waitForEvent('page'), g.locator('.sheet [data-accion="wa"]').click()]);
  const urlWA = popup.url();
  ok(urlWA.startsWith('https://wa.me/5491155550001?text='), `URL de WhatsApp con número solo dígitos: ${urlWA.slice(0, 48)}…`);
  const textoWA = decodeURIComponent(urlWA.split('?text=')[1]);
  ok(/^Hola Hernán!/.test(textoWA) && /Umo Grill/.test(textoWA) && /Va todo en la imagen/.test(textoWA) && !/Cerveza rubia|Gaseosa cola/.test(textoWA), 'el texto es solo un saludo con el local, sin repetir los productos');
  const enPortapapeles = await g.evaluate(async () => { try { const it = await navigator.clipboard.read(); return it.some(i => i.types.includes('image/png')); } catch (_e) { return false; } });
  ok(enPortapapeles || dl.some(d => /^pedido-distribuidora-florida-.*\.png$/.test(d)), `en la computadora la imagen queda lista para pegar (${enPortapapeles ? 'portapapeles' : 'descarga: ' + dl.join(', ')})`);
  await popup.close();
  await g.waitForTimeout(500);
  ok(db.ordenes.find(o => o.proveedor_id === PV.florida).estado === 'enviada', 'marca la orden como "enviada"');
  // Cargar un pedido desde gerencia en nombre de un local
  await g.locator('.sidebar a[data-nav="pedidos"]').click();
  await g.locator('[data-accion="cargar"]').click();
  await g.waitForSelector('.cargar-local');
  await g.locator('.cargar-local .chip', { hasText: 'Trento Café' }).click();
  await g.waitForSelector('.prod[data-id="p-trento"]');
  ok(await g.locator('.prod').count() === 3 && !(await g.locator('#view').innerText()).includes('$'), 'Cargar: catálogo del local elegido (Trento, 3 productos), sin precios');
  await g.getByRole('button', { name: 'Más · Pedir Café en grano', exact: true }).click();
  await g.getByRole('button', { name: 'Más · Pedir Café en grano', exact: true }).click();
  ok(/Trento Café/.test(await g.locator('.vista-head .sub').first().innerText()) && /Tu pedido de Trento Café/.test(await g.locator('.borrador').innerText()), 'Cargar: el encabezado muestra el local elegido');
  await shot(g, '10d-g-cargar-pc');
  await g.locator('.pill').click();
  await g.waitForSelector('#rev-nombre');
  ok(await g.locator('.side-link.is-active').innerText() === 'Pedidos', 'Cargar queda marcado dentro de Pedidos');
  const nOrd = db.ordenes.length;
  await g.getByRole('button', { name: 'Enviar pedido' }).click();
  await g.waitForSelector('.ped-tabla');
  const nueva = db.ordenes.slice(nOrd);
  ok(nueva.length === 1 && nueva[0].local_id === L2 && nueva[0].proveedor_id === PV.barcena && nueva[0].estado === 'borrador' && nueva[0].cargado_por_nombre === 'Jacobo', 'Cargar: crea la orden del local elegido, en revisión, cargada por Jacobo ' + JSON.stringify(nueva[0]));
  ok(db.items.some(i => i.orden_id === nueva[0].id && i.producto_id === 'p-trento' && i.cantidad_pedida === 2), 'Cargar: con sus productos');
  // Recibir
  await g.locator('.sidebar a[data-nav="compras"]').click();
  await g.waitForSelector('.subnav');
  await g.locator('.subnav-b', { hasText: 'Recibir' }).click();
  await g.waitForSelector('.rec-factura');
  ok(await g.locator('.side-link.is-active').innerText() === 'Compras' && await g.locator('.subnav-b.is-on').innerText() === 'Recibir', 'Recibir queda dentro de Compras');
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
  // Recibir: corregir con lo que realmente trajo (no vino / agregar producto que no estaba)
  await g.waitForSelector('.grupo-prov[data-orden] [aria-label="No vino Gaseosa cola 1,5 l"]');
  ok(await g.locator('.grupo-prov[data-orden]').count() === 1, 'la orden parcial sigue esperando la gaseosa');
  await g.getByRole('button', { name: 'No vino Gaseosa cola 1,5 l' }).click();
  ok(/quedan 1 pack x 6 como faltante|quedan [\d,]+ .* como faltante/.test(await g.locator('.prod-rec.is-off').innerText()), 'No vino: muestra lo que queda como faltante');
  await g.getByRole('button', { name: 'Agregar producto que no estaba en el pedido' }).click();
  await g.waitForSelector('.sheet input[type=search]');
  ok(await g.locator('.sheet .prod-cat', { hasText: 'Agua sin gas 500 ml' }).count() === 1, 'Agregar: sin buscar muestra los productos del mismo proveedor');
  await g.locator('.sheet input[type=search]').fill('café');
  ok(await g.locator('.sheet .prod-cat').count() === 0, 'Agregar: solo busca en el catálogo del local de la orden');
  await g.locator('.sheet input[type=search]').fill('agua');
  await g.getByRole('button', { name: 'Agregar Agua sin gas 500 ml' }).click();
  await g.getByLabel('Cantidad recibida de Agua sin gas 500 ml').fill('2');
  await g.getByLabel('Costo unitario de Agua sin gas 500 ml').fill('5100');
  ok(/1 producto no vino · 1 agregado/.test(await g.locator('.rec-resumen').innerText()), 'resumen: no vino y agregado ' + await g.locator('.rec-resumen').innerText());
  await shot(g, '12b-g-recibir-corregir-pc');
  const nRec = db.recepciones.length;
  await g.getByRole('button', { name: 'Confirmar recepción' }).click();
  await g.waitForSelector('.toast-ok >> text=Recepción completa');
  const rc = db.recepciones[nRec];
  ok(rc && rc.p_items.some(i => i.producto_id === 'p-agua' && !i.orden_item_id && i.cantidad_recibida === 2 && i.precio_unitario === 5100), 'el agregado viaja con producto_id, cantidad y costo');
  ok(rc && rc.p_items.some(i => i.orden_item_id && i.no_vino === true && i.cantidad_recibida === 0), 'la gaseosa viaja como no vino');
  const ordFlo = db.ordenes.find(o => o.proveedor_id === PV.florida);
  ok(ordFlo.estado === 'recibida', 'con lo que no vino marcado, la orden queda recibida');
  ok(db.items.some(i => i.orden_id === ordFlo.id && i.producto_id === 'p-agua' && i.agregado && i.cantidad_pedida === 0), 'el agua queda registrada como agregada al recibir (pedido 0)');
  ok(db.items.some(i => i.orden_id === ordFlo.id && i.producto_id === 'p-gaseosa' && i.no_vino && i.cantidad_pedida > 0), 'la gaseosa queda pedida y marcada como faltante');
  ok(db.movimientos.some(m => m.producto_id === 'p-agua' && m.tipo === 'recepcion' && m.cantidad === 24), 'el agua suma stock (2 packs × 12)');
  // Stock
  await g.locator('.sidebar a[data-nav="stock"]').click();
  await g.waitForSelector('.prod-stk');
  await g.locator('.chip', { hasText: 'Umo Grill' }).click();
  await g.waitForSelector('.stk-estados .stk-k');
  const est = (await g.locator('.stk-estados').innerText()).replace(/\s+/g, ' ');
  ok(/PRODUCTOS/i.test(est) && /AGOTADOS/i.test(est) && /POR AGOTARSE/i.test(est) && !/m[ií]nimo|par\b/i.test(await g.locator('.stk-prod').innerText()), `Stock: resumen por estado sin "mínimo" ni "par" (${est})`);
  await g.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => {});
  const tChor = (await g.locator('[data-prod="p-chorizo"]').innerText()).replace(/\s+/g, ' ');
  ok(/Por agotarse/.test(tChor) && /HACE 7 DÍAS/i.test(tChor) && /QUEDAN 3 kg/i.test(tChor) && /DIF\. −6/i.test(tChor) && /Pedir 5 kg/.test(tChor), `Stock: tarjeta con estado, Hace 7 días / Quedan / Dif. y Pedir (${tChor})`);
  ok(/Agotado/.test(await g.locator('[data-prod="p-agua"]').innerText()), 'Stock: sin unidades figura Agotado');
  await shot(g, '13-g-stock-pc');
  await g.locator('[data-filtro="agotado"]').click();
  ok(await g.locator('.prod-stk').count() > 0 && await g.locator('.prod-stk:not([data-estado="agotado"])').count() === 0, 'Stock: tocar Agotados filtra');
  await g.locator('[data-filtro="todos"]').click();
  await g.locator('.stk-cats .chip', { hasText: 'Bebidas' }).click();
  ok(await g.locator('.prod-stk').count() === 3, 'Stock: filtro por categoría');
  await g.locator('.stk-cats .chip', { hasText: 'Todas' }).click();
  await g.locator('[data-periodo="hoy"]').click();
  ok(/AL ABRIR/i.test(await g.locator('[data-prod="p-chorizo"]').innerText()), 'Stock: período Hoy cambia la columna a "Al abrir"');
  await g.locator('[data-periodo="semana"]').click();
  // Ajuste con motivo: merma
  await g.getByRole('button', { name: 'Ajuste de Queso cremoso' }).click();
  await g.locator('dialog .inp-big').fill('0,5');
  await g.getByRole('button', { name: 'Descontar del stock' }).click();
  await g.waitForSelector('.toast-error >> text=motivo');
  await g.locator('dialog .stk-motivos .chip', { hasText: 'Vencido' }).click();
  await g.locator('dialog input[aria-label="Detalle"]').fill('olía mal');
  await shot(g, '13b-g-stock-ajuste-pc');
  await g.getByRole('button', { name: 'Descontar del stock' }).click();
  await g.waitForSelector('.toast-ok >> text=Se descontó');
  const mer = db.movimientos.find(m => m.tipo === 'merma' && m.producto_id === 'p-queso');
  ok(mer && mer.cantidad === -0.5 && /Merma: Vencido · olía mal/.test(mer.nota) && mer.local_id === L1, `Ajuste: merma con motivo (${JSON.stringify(mer)})`);
  ok(/Vencido/.test(await g.locator('[data-prod="p-queso"]').innerText()), 'Stock: la tarjeta muestra el último ajuste');
  // Imprimir: arma la planilla A4 con columna para anotar el conteo
  await g.evaluate(() => { window.__print = 0; window.print = () => { window.__print++; window.__prHTML = document.querySelector('.print-area') && document.querySelector('.print-area').innerText; }; });
  await g.locator('.stk-print').click();
  const prTxt = await g.evaluate(() => window.__prHTML || '');
  ok(/Umo Grill/.test(prTxt) && /Contado/i.test(prTxt) && /Chorizo parrillero/.test(prTxt), 'Stock: imprimir arma la planilla con columna Contado');
  await g.locator('[data-vista="metricas"]').click();
  await g.waitForSelector('[data-metricas]');
  const kpS = (await g.locator('[data-metricas]').innerText()).replace(/\s+/g, ' ');
  ok(/VALOR DEL STOCK \$/i.test(kpS) && /EN CERO/i.test(kpS) && /ÚLTIMA VENTA SUBIDA/i.test(kpS), `Stock: métricas del local (${kpS.slice(0, 120)}…)`);
  const cons = (await g.locator('[data-bloque="consumo"]').innerText()).replace(/\s+/g, ' ');
  ok(/Chorizo parrillero/.test(cons) && /alcanza para|no alcanza/.test(cons), `Stock: lo que más se usa con días de cobertura (${cons.slice(0, 140)})`);
  ok(/Cargá las recetas/.test(await g.locator('[data-bloque="platos"]').innerText()), 'Stock: sin recetas explica qué hacer');
  await shot(g, '13c-g-stock-metricas-pc');
  await g.locator('[data-vista="productos"]').click();
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
  await g.locator('#f-uu').selectOption('kg');
  await g.locator('#f-prov').selectOption(PV.barcena);
  await g.getByRole('button', { name: 'Crear producto' }).click();
  await g.waitForSelector('.toast-ok >> text=Producto creado');
  ok(db.productos.some(p => p.codigo === 'UMO-050' && p.nombre === 'Provoleta'), 'alta de producto ' + JSON.stringify(db.productos.filter(p => /Provoleta/.test(p.nombre))));
  // ===== Gerencia · Pagos, facturas, comprobantes, avisos y proveedores (escritorio) =====
  await g.locator('.sidebar a[data-nav="pagos"]').click();
  await g.waitForSelector('.cc-fila');
  ok(await g.locator('h1').first().innerText() === 'Pagos', 'pantalla Pagos (cuentas corrientes)');
  const kp = (await g.locator('.kpis').innerText()).replace(/\s+/g, ' ');
  ok(/DEUDA TOTAL \$ 200\.000/i.test(kp) && /VENCIDO \$ 130\.000 2 facturas/i.test(kp), 'cuentas: deuda total y vencido ' + kp);
  const demoCC = (await g.locator('.cc-fila[data-prov="Distribuidora Demo"]').innerText()).replace(/\s+/g, ' ');
  ok(/\$ 170\.000/.test(demoCC) && /1 factura vencida/.test(demoCC), 'cuentas: Distribuidora Demo debe $ 170.000 con una factura vencida');
  ok((await g.locator('.cc-fila[data-prov="Distribuidora Florida"]').innerText()).includes('$ 54.000 a favor'), 'cuentas: pago sin facturas queda a favor');
  await g.locator('.cc-fila[data-prov="Distribuidora Demo"] button', { hasText: 'Ver 2 facturas pendientes' }).click();
  ok((await g.locator('.cc-fila[data-prov="Distribuidora Demo"] .tb-lista').innerText()).includes('0001-00000002'), 'cuentas: abre las facturas pendientes del proveedor');
  await shot(g, '40-g-cuentas-pc', true);

  // Facturas: alta con PDF y vencidas resaltadas
  await g.locator('.subnav-b', { hasText: 'Facturas' }).click();
  await g.waitForSelector('.fac');
  ok(await g.locator('.fac').count() === 3 && await g.locator('.fac-vencida').count() === 2, 'facturas: 3 pendientes, 2 vencidas resaltadas');
  await shot(g, '41-g-facturas-pc', true);
  await g.getByRole('button', { name: 'Nueva factura' }).click();
  await g.waitForSelector('dialog[open]');
  await g.locator('#fa-prov').selectOption(PV.florida);
  await g.locator('#fa-numero').fill('0004-00000123');
  await g.locator('#fa-fecha').fill('2026-10-01');
  await g.locator('#fa-venc').fill('2026-10-20');
  await g.locator('#fa-total').fill('45000');
  await g.locator('#fa-archivo').setInputFiles(PDF_DEMO);
  await shot(g, '42-g-factura-nueva-pc');
  await g.getByRole('button', { name: 'Guardar factura' }).click();
  await g.waitForSelector('.toast-ok >> text=Factura guardada');
  const fc = db.facturasCreadas[0];
  ok(fc && fc.proveedor_id === PV.florida && fc.numero === '0004-00000123' && fc.total === 45000 && fc.vencimiento === '2026-10-20' && /^facturas\/prv-florida\/\d+-comprobante-demo\.pdf$/.test(fc.archivo), 'factura: proveedor, número, total, vencimiento y PDF en facturas/<proveedor>/<archivo> ' + JSON.stringify(fc));
  ok(Object.keys(db.subidos).includes(fc.archivo) && db.subidos[fc.archivo] > 0, 'factura: el PDF se subió al bucket comprobantes');
  await g.waitForSelector('.fac[data-factura="0004-00000123"].fac-vencida');
  ok(await g.locator('.fac-vencida').count() === 3, 'factura nueva vencida resaltada');
  // Todas: la pagada sin centavos figura Pagada (no vencida)
  await g.locator('.chip[data-filtro="todas"]').click();
  const f46 = g.locator('.fac[data-factura="0002-00000046"]');
  ok(/Pagada/.test(await f46.innerText()) && !(await f46.getAttribute('class')).includes('fac-vencida'), 'factura pagada sin centavos ($0,64) figura Pagada, no vencida');
  await f46.scrollIntoViewIfNeeded();
  await shot(g, '41b-g-facturas-pagada-sin-centavos-pc');
  // Borrar factura (solo gerencia, con confirmación)
  await g.locator('.chip[data-filtro="vencidas"]').click();
  await g.locator('.fac[data-factura="0004-00000123"] button', { hasText: 'Borrar' }).click();
  await g.waitForSelector('dialog[open]');
  ok(/0004-00000123/.test(await g.locator('dialog[open]').innerText()), 'borrar factura: pide confirmación con el número');
  await shot(g, '42b-g-factura-borrar-pc');
  await g.getByRole('button', { name: 'Sí, borrar la factura' }).click();
  await g.waitForSelector('.toast-ok >> text=Factura 0004-00000123 borrada');
  await g.waitForSelector('.fac[data-factura="0004-00000123"]', { state: 'detached' });
  ok(db.facturasBorradas.length === 1 && await g.locator('.fac-vencida').count() === 2, 'borrar factura: se borra y deja de figurar vencida');
  await shot(g, '42c-g-factura-borrada-pc', true);
  await g.locator('.chip[data-filtro="pendientes"]').click();

  // Cargar pago: subir el PDF, precarga, proveedor sugerido, imputación
  await g.locator('.subnav-b', { hasText: 'Cargar' }).click();
  await g.waitForSelector('#p-archivo', { state: 'attached' });
  await shot(g, '43-g-cargar-pago-vacio-pc');
  await g.locator('#p-archivo').setInputFiles(PDF_DEMO);
  await g.waitForSelector('.banner-ok >> text=Comprobante leído', { timeout: 15000 }).catch(async () => { console.log('DEBUG lectura:', (await g.locator('#p-form').innerText()).slice(0, 300), errores.slice(-5)); throw new Error('no leyó el comprobante'); });
  const val = async (id) => g.locator(id).inputValue();
  ok(await val('#p-monto') === '150000,5' && await val('#p-fecha') === '2026-10-05' && await val('#p-op') === 'DEMO0001ab', `precarga: monto, fecha y operación (${await val('#p-monto')}, ${await val('#p-fecha')}, ${await val('#p-op')})`);
  ok(await val('#p-cuit') === '30000000019' && await val('#p-banco') === 'Banco Demo' && (await val('#p-cuenta')).endsWith('1234') && await val('#p-concepto') === 'Factura' && await val('#p-desc') === 'Mercaderia', 'precarga: CUIT, banco, cuenta, concepto y descripción');
  ok(await val('#p-prov') === '', 'ningún proveedor tiene ese CUIT: queda sin elegir');
  ok((await g.locator('[data-sugerencias]').innerText()).includes('Distribuidora Demo'), 'sugiere el proveedor por razón social (Distribuidora Demo)');
  ok(await g.locator('.imp-fila').count() === 0, 'sin proveedor todavía no hay facturas para imputar');
  await g.locator('[data-sug="prv-demo"]').click();
  await g.waitForSelector('.imp-fila');
  ok((await g.locator('#p-form .banner-info').first().innerText()).includes('al guardar se guarda el 30000000019'), 'al confirmar avisa que guarda el CUIT en el proveedor');
  const impVals = async () => g.locator('.imp-fila input').evaluateAll(els => els.map(e => e.value));
  ok(JSON.stringify(await impVals()) === JSON.stringify(['100000', '50000,5']), 'imputación automática: más vieja primero (100000 + 50000,5) ' + JSON.stringify(await impVals()));
  await g.locator('.imp-fila input').first().fill('90000');
  ok((await g.locator('[data-imputado]').innerText()).replace(/\s+/g, ' ').includes('$ 140.000,50'), 'editar la imputación actualiza los totales');
  await g.getByRole('button', { name: 'Volver a imputar automático' }).click();
  ok(JSON.stringify(await impVals()) === JSON.stringify(['100000', '50000,5']), 'volver a imputar automático');
  await shot(g, '44-g-cargar-pago-leido-pc', true);
  await g.getByRole('button', { name: 'Guardar pago' }).click();
  await g.waitForSelector('#p-resultado:not([hidden])');
  const rp = db.pagosRegistrados[0];
  ok(rp && rp.p_pago.monto === 150000.5 && rp.p_pago.numero_operacion === 'DEMO0001ab' && rp.p_pago.proveedor_id === PV.demo && rp.p_pago.fecha === '2026-10-05' && rp.p_pago.actualizar_cuit === true && rp.p_pago.cuit_destino === '30000000019', 'registrar_pago: pago, proveedor y confirmación del CUIT ' + JSON.stringify(rp && rp.p_pago));
  ok(rp.p_imputaciones.length === 2 && rp.p_imputaciones[0].factura_id === 'fa-1' && rp.p_imputaciones[0].monto === 100000 && rp.p_imputaciones[1].monto === 50000.5, 'registrar_pago: imputaciones a las facturas más viejas');
  ok(rp.p_pago.comprobante_path === 'pagos/prv-demo/DEMO0001ab.pdf' && db.subidos['pagos/prv-demo/DEMO0001ab.pdf'] > 0, 'el PDF se subió a pagos/<proveedor>/<operación>.pdf');
  ok(db.proveedores.find(p => p.id === PV.demo).cuit === '30000000019', 'el CUIT quedó guardado en el proveedor');
  await shot(g, '45-g-pago-guardado-pc');

  // Avisar por WhatsApp (escritorio: wa.me + descargar el PDF)
  await g.locator('[data-accion="avisar"]').click();
  await g.waitForSelector('dialog[open] [data-accion="wa"]');
  const msg = (await g.locator('[data-aviso]').innerText());
  ok(/Distribuidora Demo/.test(msg) && /150\.000,50/.test(msg) && /DEMO0001ab/.test(msg) && /terminada en 1234/.test(msg) && /Banco Demo/.test(msg), 'el mensaje del aviso trae proveedor, monto, operación, banco y cuenta ' + JSON.stringify(msg));
  ok(await g.locator('dialog [data-accion="compartir"]').count() === 0, 'escritorio: no hay botón Compartir');
  ok((await g.locator('dialog .banner-info').innerText()).includes('adjuntalo a mano'), 'escritorio: avisa que el PDF se adjunta a mano');
  await g.waitForSelector('dialog [data-accion="descargar"]');
  ok(/\/storage\/v1\/object\/sign\/comprobantes\/pagos\/prv-demo\/DEMO0001ab\.pdf\?token=/.test(await g.locator('dialog [data-accion="descargar"]').getAttribute('href')), 'botón para descargar el PDF con URL firmada del bucket');
  ok((await g.locator('dialog [data-accion="mail"]').innerText()).includes('cobranzas@demo.com'), 'aviso: botón para mandarlo por email a cobranzas');
  ok(/WhatsApp 5491155550044 · cobranzas@demo\.com/.test(await g.locator('dialog [data-destino]').innerText()), 'aviso: muestra WhatsApp y email de cobranzas');
  await shot(g, '46-g-avisar-pc');
  const [waPopup] = await Promise.all([cGer.waitForEvent('page'), g.locator('dialog [data-accion="wa"]').click()]);
  ok(waPopup.url().startsWith('https://wa.me/5491155550044?text='), 'abre wa.me con el WhatsApp de cobranzas del proveedor: ' + waPopup.url().slice(0, 40));
  ok(decodeURIComponent(waPopup.url().split('?text=')[1]) === msg, 'el texto de wa.me es el mismo mensaje');
  await waPopup.close();
  await g.waitForSelector('[data-estado].estado-avisado');
  ok(db.avisos.length === 1 && db.avisos[0].avisado_en, 'al avisar se marca avisado_en');

  // Lista de pagos: Avisado / Sin avisar
  await g.locator('.subnav-b', { hasText: /^Pagos$/ }).click();
  await g.waitForSelector('.prod[data-pago]');
  ok(await g.locator('.prod[data-pago]').count() === 4, 'lista de pagos: 4');
  ok((await g.locator('.prod[data-pago="DEMO0001ab"]').innerText()).includes('Avisado') && (await g.locator('.prod[data-pago="OPVIEJA002"]').innerText()).includes('Sin avisar'), 'lista de pagos con estado Avisado / Sin avisar');
  await shot(g, '47-g-pagos-lista-pc', true);
  await g.locator('.chip', { hasText: 'Sin avisar' }).click();
  ok(await g.locator('.prod[data-pago]').count() === 1, 'filtro Sin avisar');
  const [waPopup2] = await Promise.all([cGer.waitForEvent('page'), (async () => {
    await g.locator('.prod[data-pago="OPVIEJA002"] [data-accion="avisar"]').click();
    await g.locator('dialog [data-accion="wa"]').click();
  })()]);
  ok(waPopup2.url().startsWith('https://wa.me/5491155550001?text='), 'avisar desde la lista: número de Distribuidora Florida solo con dígitos');
  await waPopup2.close();
  await g.waitForSelector('text=No hay pagos sin avisar');
  ok(db.avisos.length === 2 && db.avisos[1].id === 'pg-2', 'queda marcado el pago viejo');

  // Segundo pago: ahora el proveedor se reconoce por el CUIT; imputa solo lo pendiente
  await g.locator('.subnav-b', { hasText: 'Cargar' }).click();
  await g.locator('#p-archivo').setInputFiles(pdfVariante('DEMO0002cd', '$ 80.000,00'));
  await g.waitForSelector('.banner-ok >> text=Comprobante leído');
  await g.waitForSelector('.imp-fila');
  ok(await val('#p-prov') === PV.demo && (await g.locator('#p-form .banner-info').first().innerText()).includes('reconocido por el CUIT'), 'segundo pago: proveedor reconocido por el CUIT');
  ok(JSON.stringify(await impVals()) === JSON.stringify(['19999,5']), 'segundo pago: solo queda pendiente la factura 2 (19999,5) ' + JSON.stringify(await impVals()));
  await g.getByRole('button', { name: 'Guardar pago' }).click();
  await g.waitForSelector('#p-resultado:not([hidden])');
  const rp2 = db.pagosRegistrados[1];
  ok(rp2.p_pago.actualizar_cuit === false && rp2.p_pago.monto === 80000 && rp2.p_imputaciones.length === 1 && rp2.p_imputaciones[0].monto === 19999.5, 'segundo pago: sin actualizar CUIT, imputa 19999,5 y el resto queda a cuenta');
  ok((await g.locator('#p-resultado').innerText()).includes('imputado a 1 factura'), 'resultado del segundo pago');

  // Operación duplicada
  await g.getByRole('button', { name: 'Cargar otro pago' }).click();
  await g.locator('#p-archivo').setInputFiles(PDF_DEMO);
  await g.waitForSelector('.banner-error >> text=ya está cargada');
  ok(await g.getByRole('button', { name: 'Guardar pago' }).isDisabled(), 'la misma operación no se puede guardar dos veces: botón deshabilitado y mensaje claro');
  await shot(g, '48-g-pago-duplicado-pc', true);

  // Proveedores (Catálogo → Proveedores): sin el SQL 0011 la ficha avisa y guarda solo lo de siempre
  db.sin0011 = true;
  await g.reload(); await g.waitForSelector('.sidebar a[data-nav="catalogo"]'); // los proveedores quedan 2 min en memoria: recargar los vuelve a pedir
  await g.locator('.sidebar a[data-nav="catalogo"]').click();
  await g.locator('.subnav-b', { hasText: 'Proveedores' }).click();
  await g.waitForSelector('.prod-cat[data-prov="Barcena"]');
  await g.waitForTimeout(400);
  await g.locator('.prod-cat[data-prov="Barcena"]').click();
  await g.waitForSelector('dialog[open]');
  ok(await g.locator('dialog .banner-warn', { hasText: 'Falta pegar el SQL' }).count() === 1 && await g.locator('#pv-email').count() === 0, 'sin 0011: avisa y oculta email, contacto y cobranzas');
  await g.locator('dialog [aria-label="Cerrar"]').click();
  db.sin0011 = false;
  await g.reload();
  await g.waitForSelector('.prod-cat[data-prov="Barcena"]');
  await g.waitForTimeout(400);
  ok((await g.locator('.prod-cat[data-prov="Barcena"]').innerText()).includes('Sin CUIT'), 'proveedores: marca los que no tienen CUIT');
  ok(/1 día · pedir antes del jueves/.test(await g.locator('.prod-cat[data-prov="Barcena"]').innerText()), 'proveedores: la tarjeta muestra días de entrega');
  await g.locator('.prod-cat[data-prov="Barcena"]').click();
  await g.waitForSelector('dialog[open] #pv-email');
  await g.locator('#pv-wa').fill('+54 9 11 5555-0099');
  await g.locator('#pv-cuit').fill('30-00000003-5');
  await g.locator('#pv-alias').fill('barcena.nuevo');
  await g.locator('#pv-contacto').fill('Rubén');
  await g.locator('#pv-email').fill('Ventas@Barcena.com');
  await g.locator('#pv-email-pago').fill('cobranzas@barcena');
  await g.getByRole('button', { name: 'Guardar cambios' }).click();
  ok((await g.locator('dialog .form-err').innerText()).includes('email de cobranzas'), 'valida el email de cobranzas');
  await g.locator('#pv-email-pago').fill('cobranzas@barcena.com');
  await shot(g, '49-g-proveedor-editar-pc');
  await g.getByRole('button', { name: 'Guardar cambios' }).click();
  await g.waitForSelector('.toast-ok >> text=Proveedor guardado');
  const pe = db.proveedoresEditados[0];
  ok(pe && pe.id === PV.barcena && pe.whatsapp === '5491155550099' && pe.cuit === '30-00000003-5' && pe.alias_cbu === 'barcena.nuevo', 'proveedor: WhatsApp (solo dígitos), CUIT con guiones y alias ' + JSON.stringify(pe));
  ok(pe && pe.contacto === 'Rubén' && pe.email === 'ventas@barcena.com' && pe.email_pagos === 'cobranzas@barcena.com' && pe.nombre === 'Barcena', 'proveedor: contacto y emails guardados');
  // Nuevo proveedor
  await g.locator('[data-accion="nuevo-proveedor"]').click();
  await g.waitForSelector('dialog[open] #pv-nombre');
  await g.getByRole('button', { name: 'Crear proveedor' }).click();
  ok((await g.locator('dialog .form-err').innerText()).includes('nombre'), 'nuevo: pide el nombre');
  await g.locator('#pv-nombre').fill('barcena');
  await g.getByRole('button', { name: 'Crear proveedor' }).click();
  ok((await g.locator('dialog .form-err').innerText()).includes('Ya hay un proveedor'), 'nuevo: no deja repetir el nombre');
  await g.locator('#pv-nombre').fill('Lácteos del Sur');
  await g.locator('#pv-contacto').fill('Carla');
  await g.locator('#pv-wa').fill('11 5555-0123');
  await g.locator('#pv-tel').fill('011 4444-5555');
  await g.locator('#pv-email').fill('pedidos@lacteosdelsur.com');
  await g.locator('#pv-entrega').fill('Martes y viernes');
  await g.locator('#pv-corte').fill('Lunes 18 h');
  await g.locator('#pv-minimo').fill('50000');
  await g.locator('#pv-razon').fill('Lácteos del Sur SRL');
  await g.locator('#pv-cuit').fill('30711112223');
  await g.locator('#pv-banco').fill('Galicia');
  await g.locator('#pv-alias').fill('lacteos.sur');
  await g.locator('#pv-wa-pago').fill('5491166660000');
  await shot(g, '49b-g-proveedor-nuevo-pc', true);
  await g.getByRole('button', { name: 'Crear proveedor' }).click();
  await g.waitForSelector('.toast-ok >> text=Proveedor creado');
  const pc = db.proveedoresCreados[0];
  ok(pc && pc.nombre === 'Lácteos del Sur' && pc.whatsapp === '5491155550123' && pc.cuit === '30-71111222-3' && pc.pedido_minimo === 50000 && pc.razon_social === 'Lácteos del Sur SRL' && pc.banco === 'Galicia' && pc.whatsapp_pagos === '5491166660000' && pc.activo === true, 'nuevo proveedor con datos de pedidos y pagos ' + JSON.stringify(pc));
  // queda abierta su ficha para sumarle productos
  await g.waitForSelector('dialog[open] #pv-buscar-prod');
  await g.locator('#pv-buscar-prod').fill('cerveza');
  await g.waitForSelector('dialog .pv-res .pv-prod');
  await g.locator('dialog .pv-res .pv-prod').first().getByRole('button', { name: /Sumar/ }).click();
  await g.waitForSelector('dialog .pv-lista .pv-prod');
  ok(db.productos.filter(x => x.proveedor_id === pc.id).length === 1, 'sumar producto: queda asignado al proveedor nuevo');
  await shot(g, '49c-g-proveedor-productos-pc');
  await g.locator('dialog [aria-label="Cerrar"]').click();
  await g.waitForSelector('.prod-cat[data-prov="Lácteos del Sur"]');
  ok(/1 producto/.test(await g.locator('.prod-cat[data-prov="Lácteos del Sur"]').innerText()), 'la tarjeta cuenta sus productos');
  await shot(g, '50-g-proveedores-pc', true);
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
  await gm.waitForSelector('.tb-card');
  await gm.waitForTimeout(400);
  await shot(gm, '16a-g-tablero-m', true);
  await gm.locator('a.tab[data-nav="stock"]').click();
  await gm.waitForSelector('.prod-stk');
  await gm.waitForTimeout(300);
  ok(await gm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Stock celular: sin desplazamiento horizontal');
  await shot(gm, '16c-g-stock-m');
  await gm.locator('.prod-stk[data-estado="ok"] .stk-ajuste').first().click();
  await gm.waitForSelector('dialog[open] .stk-motivos');
  await shot(gm, '16d-g-stock-ajuste-m');
  await gm.locator('dialog[open] [aria-label="Cerrar"]').click();
  await gm.locator('[data-vista="metricas"]').click();
  await gm.waitForSelector('[data-metricas]');
  await shot(gm, '16e-g-stock-metricas-m');
  await gm.locator('[data-vista="productos"]').click();
  await gm.locator('a.tab[data-nav="pedidos"]').click();
  await gm.waitForSelector('.ped-tabla');
  await shot(gm, '16-g-pedidos-m');
  await gm.locator('[data-filtro="aprobados"]').click(); // lo de Trento ya quedó aprobado en la PC
  await gm.locator('.pt-envio', { hasText: 'Angelica' }).locator('.pt-fila').click();
  await gm.waitForSelector('.pt-det');
  await shot(gm, '16b-g-pedidos-detalle-m');
  await gm.locator('a.tab[data-nav="compras"]').click();
  await gm.waitForSelector('.grupo-prov');
  await shot(gm, '16c-g-pedidos-proveedor-m');
  // imprimir y marcar como enviado: lo destildado sale del pedido; la orden que queda vacía se cancela
  const barM = gm.locator('.grupo-prov[data-prov="Barcena"]');
  await barM.getByLabel('Pedir Café en grano').uncheck();
  await gm.waitForSelector('.grupo-prov[data-prov="Barcena"] .pp-fila.is-fuera');
  await shot(gm, '16d-g-pedidos-destildado-m');
  if (await barM.locator('[data-accion="aprobar"]').count()) {
    await barM.locator('[data-accion="aprobar"]').click();
    await gm.waitForSelector('.grupo-prov[data-prov="Barcena"] [data-accion="enviar"]:not([disabled])');
  }
  await gm.evaluate(() => { window.print = () => {}; });
  gm.once('dialog', d => d.accept());
  const nCafe = db.items.filter(i => i.producto_id === 'p-trento').length;
  await barM.getByRole('button', { name: 'Imprimir' }).click();
  await gm.waitForTimeout(800);
  ok(db.items.filter(i => i.producto_id === 'p-trento').length === nCafe - 2, 'al marcar enviado, el café destildado sale de los dos pedidos de Trento');
  ok(db.ordenes.find(o => o.id === 'ord-tre-1').estado === 'cancelada', 'la orden de Trento que quedó vacía se cancela');
  ok(db.ordenes.find(o => o.local_id === L1 && o.proveedor_id === PV.barcena && o.estado === 'enviada'), 'lo de Umo para Barcena queda enviado');
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
  await gd.waitForSelector('.tb-card');
  await shot(gd, '51-g-tablero-pc-oscuro', true);
  await gd.locator('.sidebar a[data-nav="stock"]').click();
  await gd.waitForSelector('.prod-stk');
  await shot(gd, '18-g-stock-pc-oscuro');
  await cGerD.close();

  const loginGer = async (pg) => {
    await pg.goto(BASE);
    await pg.waitForSelector('.seg');
    await pg.getByRole('tab', { name: 'Administración' }).click();
    await pg.locator('#in-email').fill('jacobo@ejemplo.com');
    await pg.locator('#in-pass').fill('clave-segura');
    await pg.locator('form button[type=submit]').click();
    await pg.waitForSelector('.vista-head');
  };

  // ===== Gerencia · Pagos en el celular (Compartir con el PDF adjunto) =====
  const cPM = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await cPM.addInitScript(() => { // simula el Compartir del celular: guarda lo que se comparte
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => { window.__compartido = { text: d.text, archivos: d.files.map(f => ({ name: f.name, type: f.type, size: f.size })) }; };
  });
  const pm = await nuevaPagina(cPM, 'pagos-m');
  await loginGer(pm);
  await pm.waitForSelector('.tb-card');
  const barra = await pm.locator('.tabbar').evaluate(el => ({ scroll: el.scrollWidth, ancho: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
  ok(barra.scroll > barra.ancho && barra.overflowX === 'auto', `celular: la barra inferior con 9 secciones se desplaza (${barra.scroll} > ${barra.ancho})`);
  await pm.locator('a.tab[data-nav="pagos"]').click();
  await pm.waitForSelector('.cc-fila');
  await shot(pm, '52-g-cuentas-m', true);
  await pm.locator('.subnav-b', { hasText: 'Facturas' }).click();
  await pm.waitForSelector('.fac');
  await shot(pm, '53-g-facturas-m', true);
  await pm.locator('.subnav-b', { hasText: 'Cargar' }).click();
  await pm.locator('#p-archivo').setInputFiles(pdfVariante('DEMO0003ef', '$ 12.500,00', '30000000035', 'Barcena SA'));
  await pm.waitForSelector('.banner-ok >> text=Comprobante leído');
  await pm.waitForSelector('.imp-fila');
  await shot(pm, '54-g-cargar-pago-m', true);
  await pm.getByRole('button', { name: 'Guardar pago' }).click();
  await pm.waitForSelector('#p-resultado:not([hidden])');
  await shot(pm, '55-g-pago-guardado-m');
  await pm.locator('[data-accion="avisar"]').click();
  await pm.waitForSelector('dialog [data-accion="compartir"]');
  ok(await pm.locator('dialog [data-accion="wa"]').count() === 0, 'celular: botón Compartir en lugar de wa.me');
  await shot(pm, '56-g-avisar-compartir-m');
  const avisosAntes = db.avisos.length;
  await pm.locator('dialog [data-accion="compartir"]').click();
  await pm.waitForFunction(() => window.__compartido);
  const comp = await pm.evaluate(() => window.__compartido);
  ok(comp.archivos.length === 1 && comp.archivos[0].name === 'DEMO0003ef.pdf' && comp.archivos[0].type === 'application/pdf' && comp.archivos[0].size > 500, 'celular: se comparte el PDF adjunto ' + JSON.stringify(comp.archivos));
  ok(/Barcena/.test(comp.text) && /12\.500,00/.test(comp.text) && /DEMO0003ef/.test(comp.text), 'celular: el texto compartido es el mensaje del aviso');
  await pm.waitForSelector('[data-estado].estado-avisado');
  ok(db.avisos.length === avisosAntes + 1, 'celular: al compartir se marca avisado_en');
  await pm.locator('.subnav-b', { hasText: /^Pagos$/ }).click();
  await pm.waitForSelector('.prod[data-pago]');
  await shot(pm, '57-g-pagos-lista-m', true);
  await pm.locator('a.tab[data-nav="catalogo"]').click();
  await pm.locator('.subnav-b', { hasText: 'Proveedores' }).click();
  await pm.waitForSelector('.prod-cat[data-prov]');
  await pm.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => {});
  await shot(pm, '58-g-proveedores-m', true);
  await pm.locator('.prod-cat[data-prov="Lácteos del Sur"]').click();
  await pm.waitForSelector('dialog[open] #pv-email');
  await shot(pm, '58b-g-proveedor-ficha-m');
  await pm.locator('dialog .sheet-body').evaluate(e => { e.scrollTop = e.scrollHeight; });
  await shot(pm, '58c-g-proveedor-pagos-m');
  await pm.locator('dialog [aria-label="Cerrar"]').click();
  await cPM.close();

  // ===== Contadora: solo Pagos (sin tablero, ventas ni catálogo) =====
  const cCon = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  const co = await nuevaPagina(cCon, 'contadora');
  await co.goto(BASE);
  await co.waitForSelector('.seg');
  await co.getByRole('tab', { name: 'Administración' }).click();
  await co.locator('#in-email').fill('conta@ejemplo.com');
  await co.locator('#in-pass').fill('clave-conta');
  await co.locator('form button[type=submit]').click();
  await co.waitForSelector('.cc-fila');
  ok(await co.locator('.sidebar .side-link').count() === 2 && await co.locator('.sidebar a[data-nav="pagos"]').count() === 1, 'contadora: la barra lateral solo tiene Pagos y Salir');
  await co.goto(BASE + '#/tablero');
  await co.waitForSelector('.cc-fila');
  ok(co.url().endsWith('#/pagos'), 'contadora: el tablero la redirige a Pagos');
  await co.goto(BASE + '#/ventas');
  await co.waitForSelector('.cc-fila');
  ok(db.log.filter(l => l.rol === 'contadora').every(l => !/tablero|ventas|merma|recetas|produccion|ordenes/.test(l.t)), 'contadora: nunca consulta tablero, ventas ni pedidos ' + [...new Set(db.log.filter(l => l.rol === 'contadora').map(l => l.t))].join());
  await co.locator('.subnav-b', { hasText: 'Cargar' }).click();
  await co.locator('#p-archivo').setInputFiles(pdfVariante('DEMO0004gh', '$ 1.000,00'));
  await co.waitForSelector('.banner-ok >> text=Comprobante leído');
  await co.getByRole('button', { name: 'Guardar pago' }).click();
  await co.waitForSelector('#p-resultado:not([hidden])');
  ok(db.pagosRegistrados.at(-1).p_pago.numero_operacion === 'DEMO0004gh', 'contadora: puede cargar pagos');
  await shot(co, '59-c-pagos-pc');
  await cCon.close();

  // ===== Gerencia · Ventas, análisis, recetas, producción y merma =====
  const FX = path.join(ROOT, 'scripts/fixtures/nucleo');
  const ARCH = ['detalle-por-pedido.xlsx', 'formas-de-pago.xlsx', 'pedidos-por-producto.xlsx'].map(f => path.join(FX, f));
  const cV = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
  const v = await nuevaPagina(cV, 'ventas-pc');
  await loginGer(v);
  ok(await v.locator('.sidebar .side-link').count() === 10, 'gerencia: Ventas y Cocina en la barra lateral');
  await v.getByRole('link', { name: 'Ventas', exact: true }).click();
  await v.waitForSelector('.subnav-b');
  await v.locator('.subnav-b', { hasText: 'Importar' }).click();
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
  await v.getByRole('button', { name: 'Elegir producto del stock para Agua Demo 500' }).click();
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
  await v.getByLabel('Cantidad de Chorizo parrillero').fill('250');
  await v.getByLabel('Cantidad de Chorizo parrillero').press('Tab');
  await v.getByRole('button', { name: 'Agregar insumo' }).click();
  await v.locator('dialog input[type=search]').fill('queso');
  await v.getByRole('button', { name: 'Agregar Queso cremoso' }).click();
  await v.getByLabel('Cantidad de Queso cremoso').fill('100');
  await v.getByLabel('Cantidad de Queso cremoso').press('Tab');
  // Insumo que no está en el catálogo del local: búsqueda tolerante (limones → Limón) y alta en el momento
  await v.getByRole('button', { name: 'Agregar insumo' }).click();
  await v.locator('dialog input[type=search]').fill('chorizos');
  ok(await v.getByRole('button', { name: 'Agregar Chorizo parrillero' }).count() === 0, 'Recetas: un insumo ya usado no se ofrece de nuevo');
  await v.locator('dialog input[type=search]').fill('Mozzarellas');
  ok(await v.getByRole('button', { name: 'Agregar Mozzarella en barra' }).count() === 1, 'Recetas: la búsqueda encuentra en plural y con mayúsculas');
  await v.locator('dialog input[type=search]').fill('limónes');
  await v.waitForSelector('dialog >> text=No está en el catálogo de');
  ok(await v.getByRole('button', { name: /Crear «limónes» como insumo nuevo/ }).isVisible(), 'Recetas: si no existe ofrece crearlo');
  await shot(v, '25a-g-receta-no-existe-pc');
  await v.setViewportSize({ width: 390, height: 844 });
  await shot(v, '25a-g-receta-no-existe-m');
  await v.getByRole('button', { name: /Crear «limónes» como insumo nuevo/ }).click();
  await v.waitForSelector('#n-nombre');
  ok(await v.locator('#n-nombre').inputValue() === 'Limones' && await v.locator('#n-cat').inputValue() === 'Verdulería', 'Insumo nuevo: copia nombre y categoría del mismo insumo de otro local');
  ok(/Copiamos los datos de «Limones» de Trento/.test(await v.locator('dialog .banner').innerText()), 'Insumo nuevo: avisa de dónde copió los datos');
  await v.locator('#n-cant').fill('150');
  await shot(v, '25b-g-insumo-nuevo-m');
  await v.setViewportSize({ width: 1366, height: 900 });
  await shot(v, '25b-g-insumo-nuevo-pc');
  await v.getByRole('button', { name: 'Crear y sumar a la receta' }).click();
  await v.waitForSelector('.toast-ok >> text=Limones quedó en el catálogo de Umo');
  const limUmo = db.productos.find(x => x.local_id === L1 && x.nombre === 'Limones');
  ok(limUmo && /^UMO-\d{3}$/.test(limUmo.codigo) && limUmo.unidad_uso === 'kg' && limUmo.factor_conversion === 1 && limUmo.es_elaborado === false && db.productos.filter(x => x.codigo === limUmo.codigo).length === 1, 'Insumo nuevo: queda en el catálogo del local con código libre y unidad ' + JSON.stringify(limUmo));
  ok(await v.getByLabel('Cantidad de Limones').inputValue() === '150', 'Insumo nuevo: se suma a la receta con la cantidad cargada (150 g)');
  ok((await v.locator('dialog .sub').first().innerText()).includes('Costo estimado'), 'la receta muestra el costo estimado');
  await shot(v, '25-g-receta-editar-pc');
  await v.getByRole('button', { name: 'Guardar receta' }).click();
  await v.waitForSelector('.toast-ok >> text=Receta guardada');
  const rg = db.recetasGuardadas[0];
  ok(rg && rg.p_rinde === 1 && rg.p_items.length === 3 && rg.p_items.some(i => i.cantidad === 0.15) && rg.p_items.some(i => i.insumo_id === 'p-chorizo' && i.cantidad === 0.25) && rg.p_items.some(i => i.insumo_id === 'p-queso' && i.cantidad === 0.1), 'guardar_receta: insumos con cantidad en su unidad de uso y rinde');
  ok(await v.locator('.sr-b').count() === 1, 'el plato con receta sale de la lista de sin receta');
  // Elaborado desde Catálogo + receta + producción
  await v.getByRole('link', { name: 'Catálogo' }).click();
  await v.waitForSelector('.prod-cat');
  await v.getByRole('button', { name: 'Nuevo producto' }).click();
  await v.locator('#f-nombre').fill('Salsa criolla');
  await v.locator('#f-codigo').fill('UMO-060');
  await v.locator('#f-categoria, #f-cat').first().fill('Elaborados');
  await v.locator('#f-uu').selectOption('litro');
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
  // Stock: producción disponible con la receta cargada
  await v.locator('.sidebar a[data-nav="stock"]').click();
  await v.locator('[data-vista="metricas"]').click();
  await v.waitForSelector('[data-bloque="produccion"] .bfila');
  const pd = (await v.locator('[data-bloque="produccion"]').innerText()).replace(/\s+/g, ' ');
  ok(/Salsa criolla/.test(pd) && /Hechos 4/.test(pd) && /(Se pueden hacer|No alcanza)/.test(pd) && !/Parrillada/.test(pd), `Stock: producción disponible solo elaborados (${pd.slice(0, 160)})`);
  const pl = (await v.locator('[data-bloque="platos"]').innerText()).replace(/\s+/g, ' ');
  ok(/Parrillada Demo/.test(pl) && /Limita/.test(pl), `Stock: platos que se pueden servir con lo que limita (${pl.slice(0, 160)})`);
  await v.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => {});
  await shot(v, '28b-g-stock-produccion-pc');
  // Recetas estándar estimadas: se marcan y se filtran
  db.recetas.forEach(r => { r.estimada = true; });
  await v.getByRole('link', { name: 'Cocina' }).click();
  await v.getByRole('link', { name: 'Recetas', exact: true }).click();
  await v.waitForSelector('#lista-rec .prod-cat');
  ok(await v.locator('#lista-rec .chip-aviso', { hasText: 'Estimada' }).count() >= 1, 'Recetas: las estándar se ven como "Estimada"');
  await v.getByRole('button', { name: 'Estimadas' }).click();
  await v.locator('#lista-rec .prod-cat').first().click();
  await v.waitForSelector('dialog[open] .banner');
  ok(/estimada/i.test(await v.locator('dialog[open] .banner').first().innerText()), 'Recetas: al abrir una estimada avisa que hay que revisar los pesos');
  ok(/\n(g|cc)\b/.test(await v.locator('dialog[open] .ins-lista').innerText()), 'Recetas: lo que va en kilos o litros se carga en gramos o cc');
  await shot(v, '28c-g-receta-estimada-pc');
  await v.keyboard.press('Escape');
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
  ok(await vm.locator('.tab').count() === 10, 'celular: barra inferior con 9 secciones + Salir (se desplaza)');
  await shot(vm, '31-g-barra-m');
  await vm.getByRole('link', { name: 'Ventas', exact: true }).click();
  await vm.waitForSelector('.subnav-b');
  await vm.locator('.subnav-b', { hasText: 'Importar' }).click();
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

  // Subí un Excel de más: se borra desde Ventas y el stock vuelve
  const cV4 = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const vb = await nuevaPagina(cV4, 'ventas-borrar');
  await loginGer(vb);
  await vb.getByRole('link', { name: 'Ventas', exact: true }).click();
  await vb.waitForSelector('.subnav-b');
  await vb.locator('.subnav-b', { hasText: 'Importar' }).click();
  await vb.waitForSelector('.imp-fila');
  ok(await vb.locator('.imp-fila').count() === 1 && /24 de octubre/i.test(await vb.locator('.imp-fila').innerText()), 'Ventas lista las ventas ya subidas del local');
  await vb.locator('.imp-subidas').scrollIntoViewIfNeeded();
  await shot(vb, '41-g-ventas-subidas-m');
  await vb.locator('.imp-fila .btn-danger').click();
  await vb.waitForSelector('dialog[open] .borrar-imp');
  ok(/vuelve a sumarse/.test(await vb.locator('dialog[open]').innerText()), 'antes de borrar explica que el stock vuelve');
  await shot(vb, '42-g-ventas-borrar-m');
  const idBorrar = db.importaciones[0].id;
  await vb.getByRole('button', { name: 'Sí, borrar estas ventas' }).click();
  await vb.waitForSelector('.toast >> text=Ventas borradas');
  ok(db.borradas.length === 1 && db.borradas[0] === idBorrar && db.importaciones.length === 0, 'rpc borrar_importacion con el id de esa importación');
  ok(await vb.locator('.imp-fila').count() === 0, 'la importación borrada desaparece de la lista');
  await cV4.close();

  // Pruebas terminadas: gerencia borra todos los pedidos (pide escribir BORRAR)
  const cP = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const pb = await nuevaPagina(cP, 'pedidos-borrar');
  await loginGer(pb);
  await pb.locator('a.tab[data-nav="pedidos"]').click();
  await pb.waitForSelector('.zona-pruebas');
  await pb.locator('.zona-pruebas').scrollIntoViewIfNeeded();
  await shot(pb, '60-g-pedidos-zona-pruebas-m');
  await pb.locator('[data-accion="borrar-todo"]').click();
  await pb.waitForSelector('dialog[open] #in-borrar');
  const siBorrar = pb.locator('[data-accion="borrar-todo-si"]');
  ok(await siBorrar.isDisabled(), 'borrar todo: el botón arranca desactivado');
  await pb.locator('#in-borrar').fill('borra');
  ok(await siBorrar.isDisabled(), 'borrar todo: sigue desactivado si no escribís BORRAR completo');
  await pb.locator('#in-borrar').fill('borrar');
  ok(!(await siBorrar.isDisabled()), 'borrar todo: se activa al escribir BORRAR');
  ok(/No se puede deshacer/.test(await pb.locator('dialog[open]').innerText()), 'borrar todo: avisa que no se puede deshacer');
  await shot(pb, '61-g-pedidos-borrar-todo-m');
  const nOrdAntes = db.ordenes.length;
  await siBorrar.click();
  await pb.waitForSelector('.toast >> text=Pedidos borrados');
  ok(nOrdAntes > 0 && db.ordenes.length === 0 && db.log.some(l => l.t === 'rpc/borrar_todos_los_pedidos' && l.b.p_confirmacion === 'borrar'), 'rpc borrar_todos_los_pedidos con la confirmación y sin pedidos después');
  ok(await pb.locator('.pt-envio').count() === 0, 'la tabla de pedidos queda vacía');
  await shot(pb, '62-g-pedidos-vacio-m');
  await cP.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); errores.forEach(x => console.log(' - ' + x)); fallas += errores.length; }
  console.log(`\n${fallas ? fallas + ' FALLA(S)' : 'Todo OK'} · capturas en ${OUT}`);
  process.exit(fallas ? 1 : 0);
})().catch(err => { console.error('ERROR:', err); process.exit(1); });
