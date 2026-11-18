#!/usr/bin/env node
// Prueba de punta a punta de Compras con un estado, Recibir contra lo pedido, reclamo de faltante y subas de precio
// (manual, no corre en CI). Servidor estático y API de Supabase mockeada, como e2e-recibir-factura.js.
// Gerencia, en celular (390 px) y PC (1366 px):
//   * Enviar y Pedidos: un solo estado por orden o envío (Para aprobar, Para enviar, Enviado, Llegó incompleto, Recibido).
//   * Recibir: abre con lo pedido; «Llegó todo» en un toque; corregir filas → «Llegó incompleto» con el faltante en la base.
//   * Reclamar faltante: texto para WhatsApp con producto, pedido, llegó, falta y la razón social del local.
//   * Aviso de suba (> 5 % contra el último precio pagado al mismo proveedor) en Recibir y Recibir con factura.
//   * Hoy: «Subas de precio» de los últimos 7 días; sin historial de precios la sección no aparece.
// Uso: node scripts/e2e-recibir.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/recibir-precios');
const SB = 'https://zunyzlpzofbyqplgiupl.supabase.co';
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

const L1 = 'loc-umo', L2 = 'loc-shop';
const U_GER = 'usr-ger';
const FLO = 'prv-florida', DS = 'prv-ds', BAR = 'prv-barcena';
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const iso = (n) => { const d = dia(n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ts = (n, h = 12) => { const d = dia(n); d.setHours(h, 0, 0, 0); return d.toISOString(); };

let seq = 0;
const prod = (id, nombre, local, uc, prov, extra = {}) => ({ id, codigo: 'C-' + (100 + (++seq)), nombre, local_id: local, categoria: 'Varios', unidad_compra: uc, unidad_uso: uc, factor_conversion: 1, proveedor_id: prov, par: null, es_elaborado: false, activo: true, oculto: false, ...extra });
const PRODS = [
  prod('p-tomate', 'Tomate perita', L1, 'kg', FLO), prod('p-leche', 'Leche entera', L1, 'caja', FLO), prod('p-crema', 'Crema de leche', L1, 'pote', FLO),
  prod('p-gaseosa', 'Gaseosa cola 1,5 l', L1, 'pack', BAR), prod('p-lav', 'Lavandina 5 L', L1, 'bidón', DS),
  prod('p-agua', 'Agua sin gas 500 ml', L2, 'pack', BAR), prod('p-lav2', 'Lavandina 5 L', L2, 'bidón', DS), prod('p-vaso', 'Vaso térmico', L2, 'caja', DS)
];
const FACTURA = {
  es_factura: true, proveedor: 'DISTRIBUIDORA FLORIDA S.A.', cuit: '30-71111111-1', tipo: 'Factura A', numero: '0004-00230001',
  fecha: iso(0), vencimiento: iso(10), subtotal: 54000, total: 65340,
  renglones: [
    { codigo: '1020', descripcion: 'TOMATE PERITA X KG', cantidad: 10, unidad: 'kg', precio_unitario: 2100, importe: 21000 },
    { codigo: '2210', descripcion: 'LECHE ENT. LS 1L CJ X12', cantidad: 2, unidad: 'cj', precio_unitario: 18500, importe: 37000 },
    { codigo: '3301', descripcion: 'CREMA DE LECHE POTE', cantidad: 6, unidad: 'un', precio_unitario: 3000, importe: 18000 }
  ],
  observaciones: null
};
const item = (id, producto_id, cantidad_pedida, extra = {}) => ({ id, producto_id, cantidad_pedida, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false, ...extra });
function crearDb() {
  return {
    ordenes: [
      // Enviar: Barcena mezcla un local por aprobar y otro aprobado → un solo estado («Para aprobar»).
      { id: 'o-b1', local_id: L1, proveedor_id: BAR, estado: 'borrador', creado_en: ts(0, 9), cargado_por_nombre: 'Ruth', nota: null, orden_items: [item('i-b1', 'p-gaseosa', 3)] },
      { id: 'o-a1', local_id: L2, proveedor_id: BAR, estado: 'aprobada', creado_en: ts(-1, 10), cargado_por_nombre: 'Angelica', nota: null, orden_items: [item('i-a1', 'p-agua', 4)] },
      { id: 'o-a2', local_id: L2, proveedor_id: DS, estado: 'aprobada', creado_en: ts(-1, 15), cargado_por_nombre: 'Angelica', nota: null, orden_items: [item('i-a2', 'p-vaso', 2)] },
      // Recibir: dos enviados.
      { id: 'o-env', local_id: L1, proveedor_id: FLO, estado: 'enviada', creado_en: ts(-2, 11), cargado_por_nombre: 'Ruth', nota: null,
        orden_items: [item('i-tom', 'p-tomate', 10), item('i-lec', 'p-leche', 2), item('i-cre', 'p-crema', 6)] },
      { id: 'o-env2', local_id: L1, proveedor_id: DS, estado: 'enviada', creado_en: ts(-2, 16), cargado_por_nombre: 'Ruth', nota: null, orden_items: [item('i-lav', 'p-lav', 3)] },
      // Recibida con faltante (Shopping, SPMAR) y recibida completa.
      { id: 'o-inc', local_id: L2, proveedor_id: DS, estado: 'recibida', creado_en: ts(-3, 9), cargado_por_nombre: 'Angelica', nota: null,
        orden_items: [item('i-inc', 'p-lav2', 4, { cantidad_recibida: 1, no_vino: true })] },
      { id: 'o-rec', local_id: L2, proveedor_id: BAR, estado: 'recibida', creado_en: ts(-4, 9), cargado_por_nombre: 'Angelica', nota: null,
        orden_items: [item('i-rec', 'p-agua', 2, { cantidad_recibida: 2 })] }
    ],
    // Historial de precios: el tomate subió 16 % hace dos días (Florida); la leche venía a $ 14.000.
    precios: [
      { producto_id: 'p-tomate', proveedor_id: FLO, precio: 1900, fecha: iso(-12), creado_en: ts(-12), origen: 'recepcion' },
      { producto_id: 'p-tomate', proveedor_id: FLO, precio: 2200, fecha: iso(-2), creado_en: ts(-2), origen: 'factura' },
      { producto_id: 'p-leche', proveedor_id: FLO, precio: 14000, fecha: iso(-20), creado_en: ts(-20), origen: 'recepcion' },
      { producto_id: 'p-leche', proveedor_id: DS, precio: 9000, fecha: iso(-30), creado_en: ts(-30), origen: 'manual' },
      { producto_id: 'p-crema', proveedor_id: FLO, precio: 3000, fecha: iso(-15), creado_en: ts(-15), origen: 'recepcion' },
      { producto_id: 'p-agua', proveedor_id: BAR, precio: 5000, fecha: iso(-40), creado_en: ts(-40), origen: 'recepcion' },
      { producto_id: 'p-agua', proveedor_id: BAR, precio: 5100, fecha: iso(-1), creado_en: ts(-1), origen: 'recepcion' }
    ],
    rpc: [], facturas: []
  };
}
const precioActual = (db) => {
  const m = new Map();
  for (const r of db.precios.slice().sort((a, b) => (a.fecha + a.creado_en).localeCompare(b.fecha + b.creado_en))) m.set(r.producto_id, r.precio);
  return [...m].map(([producto_id, precio]) => ({ producto_id, precio }));
};
function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
// Filtros de PostgREST que usa la app: eq, in, gte.
function filtrar(rows, q) {
  return rows.filter(r => [...q].every(([k, v]) => {
    if (['select', 'order', 'limit', 'offset'].includes(k)) return true;
    const m = /^(eq|in|gte|lte|lt|gt)\.(.*)$/.exec(v);
    if (!m) return true;
    const val = r[k];
    if (m[1] === 'eq') return String(val) === m[2];
    if (m[1] === 'in') return m[2].replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(val));
    if (m[1] === 'gte') return String(val) >= m[2];
    if (m[1] === 'lte') return String(val) <= m[2];
    if (m[1] === 'gt') return String(val) > m[2];
    return String(val) < m[2];
  }));
}

async function montarApi(ctx, db, { sinHistorial = false } = {}) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname === '/auth/v1/user') return json(sesion(U_GER).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_GER));
    if (u.pathname === '/functions/v1/leer-factura') {
      const txt = JSON.stringify(FACTURA); const lineas = [];
      for (let i = 0; i < txt.length; i += 40) lineas.push(JSON.stringify({ t: txt.slice(i, i + 40) }));
      lineas.push(JSON.stringify({ fin: true, modelo: 'x', uso: {}, ms: 100 }));
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/x-ndjson' }, body: lineas.join('\n') + '\n' });
    }
    if (u.pathname.startsWith('/storage/v1/')) return json({ Key: 'comprobantes/x', Id: 'x' });
    if (t === 'perfiles') return json([{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }]);
    if (t === 'locales') return json([
      { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: '30-70000000-1' },
      { id: L2, codigo: 'SHO', nombre: 'Shopping', encargados: ['Angelica'], activo: true, razon_social: 'SPMAR S.A.', cuit: '30-70000000-2' }]);
    if (t === 'proveedores' || t === 'proveedores_basico') return json([
      { id: FLO, nombre: 'Florida', cuit: '30711111111', contacto: 'Juan', whatsapp: '11 5555-1234', activo: true },
      { id: DS, nombre: 'Distri Stock', cuit: null, contacto: null, whatsapp: '1144443333', activo: true },
      { id: BAR, nombre: 'Barcena', cuit: null, contacto: 'Marta', whatsapp: '1122223333', activo: true }]);
    if (t === 'productos') return json(PRODS);
    if (t === 'precio_actual') return json(precioActual(db));
    if (t === 'precios' && req.method() === 'GET') return sinHistorial ? json({ code: '42501', message: 'permission denied for table precios' }, 403) : json(filtrar(db.precios, u.searchParams));
    if (t === 'producto_alias') return json([{ id: 'a1', producto_id: 'p-leche', alias: 'LECHE ENT. LS 1L CJ X12' }]);
    if (t === 'stock_actual') return json([]);
    if (t === 'ordenes_compra' && req.method() === 'GET') return json(filtrar(db.ordenes, u.searchParams));
    if (t === 'rpc/recibir_orden') {
      const b = body(); db.rpc.push(b);
      const o = db.ordenes.find(x => x.id === b.p_orden);
      for (const it of b.p_items) {
        const i = it.orden_item_id ? o.orden_items.find(x => x.id === it.orden_item_id) : null;
        if (!i) continue;
        if (it.no_vino) i.no_vino = true;
        if (it.cantidad_recibida > 0) i.cantidad_recibida = (i.cantidad_recibida || 0) + it.cantidad_recibida;
        const prev = precioActual(db).find(x => x.producto_id === i.producto_id);
        if (it.precio_unitario != null && (!prev || prev.precio !== it.precio_unitario)) db.precios.push({ producto_id: i.producto_id, proveedor_id: o.proveedor_id, precio: it.precio_unitario, fecha: iso(0), creado_en: new Date().toISOString(), origen: 'recepcion' });
      }
      if (b.p_cerrar) o.orden_items.filter(i => (i.cantidad_recibida || 0) < i.cantidad_pedida).forEach(i => { i.no_vino = true; });
      o.estado = o.orden_items.every(i => i.no_vino || (i.cantidad_recibida || 0) >= i.cantidad_pedida) ? 'recibida' : 'parcial';
      return json(o.estado);
    }
    if (t === 'rpc/recibir_con_factura') { const b = body(); db.facturas.push(b); return json({ recepcion_id: 'rec-1', factura_id: 'fac-1', items: b.p_items.length, estado_orden: null }); }
    if (t === 'rpc/tablero') return json(null);
    return json([]);
  });
}

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
// Los avisos de abajo (toasts) se sacan para que no tapen la pantalla en la captura.
const shot = async (p, n) => { await p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await p.screenshot({ path: path.join(OUT, n + '.png') }); };

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const foto = path.join(os.tmpdir(), 'e2e-recibir-factura.jpg');
  { const p = await browser.newPage({ viewport: { width: 600, height: 700 } });
    await p.setContent(`<body style="font:16px monospace;padding:30px;background:#fff"><h2>DISTRIBUIDORA FLORIDA S.A.</h2><pre>${FACTURA.renglones.map(r => `${r.cantidad}  ${r.descripcion}  ${r.precio_unitario}`).join('\n')}</pre></body>`);
    await p.screenshot({ path: foto, type: 'jpeg', quality: 80 }); await p.close(); }

  const nuevo = async (vp, apiOpts) => {
    const db = crearDb();
    const movil = vp.width < 600;
    const c = await browser.newContext({ serviceWorkers: 'block', viewport: vp, deviceScaleFactor: 2, isMobile: movil, hasTouch: movil });
    await montarApi(c, db, apiOpts);
    await c.addInitScript((s) => {
      window.confirm = () => true;
      window.__abiertos = [];
      window.open = (url) => { window.__abiertos.push(url); return null; };
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:g:local', JSON.stringify('loc-umo'));
    }, sesion(U_GER));
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|403/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p, db };
  };
  // Espera a que se vaya la pantalla de carga (intro) para que no tape las capturas.
  const ir = async (p, hash, sel) => { await p.goto(BASE + hash); await p.waitForSelector(sel); await p.waitForFunction(() => { const sp = document.getElementById('splash'); return !sp || !sp.isConnected || getComputedStyle(sp).display === 'none' || sp.hidden || Number(getComputedStyle(sp).opacity) === 0; }, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(250); };

  // ===== Lógica pura (compras-estado.js) =====
  {
    const { c, p } = await nuevo({ width: 390, height: 844 });
    await p.goto(BASE + '#/hoy');
    const r = await p.evaluate(async () => {
      const m = await import('./js/compras-estado.js');
      const it = (pedida, recibida, extra = {}) => ({ producto_id: 'x', cantidad_pedida: pedida, cantidad_recibida: recibida, ...extra });
      const est = ['borrador', 'aprobada', 'enviada', 'parcial'].map(e => m.textoEstado(m.estadoCompra({ estado: e, orden_items: [it(2, 1)] })));
      return {
        est,
        recibidaCompleta: m.textoEstado(m.estadoCompra({ estado: 'recibida', orden_items: [it(2, 2), it(0, 1, { agregado: true })] })),
        recibidaConFalta: m.textoEstado(m.estadoCompra({ estado: 'recibida', orden_items: [it(2, 2), it(3, 0, { no_vino: true })] })),
        varias: m.textoEstado(m.estadoDeVarias([{ estado: 'enviada', orden_items: [] }, { estado: 'borrador', orden_items: [] }])),
        falt: m.faltantesDe({ estado: 'parcial', orden_items: [it(10, 8), it(6, null), it(2, 2), it(0, 3, { agregado: true })] }).map(x => x.falta),
        suba12: m.subaPrecio(1120, 1000), suba4: m.subaPrecio(1040, 1000), sinPrevio: m.subaPrecio(1500, null), baja: m.subaPrecio(900, 1000),
        texto: m.textoSuba(m.subaPrecio(1120, 1000)),
        reclamo: m.textoReclamo({ proveedor: 'Florida', contacto: 'Juan', local: 'Umo Grill', razon: 'SUMA ACTIVA S.A.', fecha: '2026-10-27T12:00:00', filas: [{ nombre: 'Tomate perita', unidad: 'kg', pedido: 10, llego: 8, falta: 2 }] }),
        reclamoSinRazon: m.textoReclamo({ proveedor: 'Florida', local: 'Umo Grill', razon: '', fecha: null, filas: [] }),
        subas: m.subasRecientes([
          { producto_id: 'a', proveedor_id: 'P', precio: 100, fecha: '2026-11-01', creado_en: '1', origen: 'recepcion' },
          { producto_id: 'a', proveedor_id: 'P', precio: 120, fecha: '2026-11-10', creado_en: '2', origen: 'factura' },
          { producto_id: 'b', proveedor_id: 'P', precio: 100, fecha: '2026-11-01', creado_en: '1', origen: 'recepcion' },
          { producto_id: 'b', proveedor_id: 'Q', precio: 200, fecha: '2026-11-10', creado_en: '2', origen: 'factura' },
          { producto_id: 'c', proveedor_id: 'P', precio: 100, fecha: '2026-11-10', creado_en: '2', origen: 'manual' }
        ], '2026-11-06')
      };
    });
    ok(r.est.join(' · ') === 'Para aprobar · Para enviar · Enviado · Llegó incompleto', 'estado único: borrador, aprobada, enviada, parcial → ' + r.est.join(' · '));
    ok(r.recibidaCompleta === 'Recibido' && r.recibidaConFalta === 'Llegó incompleto', 'recibida sin faltante = Recibido; con faltante = Llegó incompleto (lo agregado no cuenta)');
    ok(r.varias === 'Para aprobar', 'un envío con órdenes en distintos estados muestra uno solo: el más atrasado');
    ok(JSON.stringify(r.falt) === '[2,6]', 'faltante = pedido − llegó (sin lo completo ni lo agregado) · ' + JSON.stringify(r.falt));
    ok(r.suba12 && r.suba12.pct === 12 && r.suba4 === null && r.sinPrevio === null && r.baja === null, 'suba solo si pasa el 5 % y hay precio anterior');
    ok(r.texto === 'Subió 12 % (antes $ 1.000)', 'texto de suba · ' + r.texto);
    ok(/^Hola Juan! Del pedido de \*Docks del Puerto\* del 27\/10 para Umo Grill \(factura SUMA ACTIVA S\.A\.\) faltó:\n- Tomate perita: pedido 10 kg, llegó 8, falta 2 kg\n/.test(r.reclamo), 'texto de reclamo · ' + JSON.stringify(r.reclamo));
    ok(!/factura/.test(r.reclamoSinRazon), 'sin razón social cargada, el reclamo no la inventa');
    ok(r.subas.length === 1 && r.subas[0].producto_id === 'a' && r.subas[0].pct === 20 && r.subas[0].previo === 100, 'subas de la semana: solo pagadas, contra el mismo proveedor · ' + JSON.stringify(r.subas));
    await c.close();
  }

  for (const [vp, s] of [[{ width: 390, height: 844 }, 'm'], [{ width: 1366, height: 900 }, 'pc']]) {
    const pc = s === 'pc';
    const { c, p, db } = await nuevo(vp);

    // ===== Enviar: un estado por proveedor =====
    await ir(p, '#/compras', '.pp');
    const tarjetas = await p.locator('section.pp').evaluateAll(els => els.map(e => ({ prov: e.dataset.prov, est: [...e.querySelectorAll('.pp-head .estado')].map(x => x.textContent) })));
    ok(tarjetas.every(t => t.est.length === 1), `[${s}] Enviar: cada proveedor con un solo estado · ` + JSON.stringify(tarjetas));
    const bar = tarjetas.find(t => t.prov === 'Barcena'), dsT = tarjetas.find(t => t.prov === 'Distri Stock');
    ok(bar && bar.est[0] === 'Para aprobar' && dsT && dsT.est[0] === 'Para enviar', `[${s}] Barcena (un local por aprobar y otro aprobado) = Para aprobar; Distri Stock = Para enviar`);
    await shot(p, `01-compras-enviar-${s}`);

    // ===== Pedidos: tabla con un estado por envío =====
    await ir(p, '#/pedidos', '.pt-filtros');
    await p.locator('[data-filtro="todos"]').click();
    await p.waitForSelector('.pt-envio');
    const filas = await p.locator('.pt-envio').evaluateAll(els => els.map(e => [...e.querySelectorAll('.pt-est .estado')].map(x => x.textContent)));
    ok(filas.every(f => f.length === 1), `[${s}] Pedidos: cada envío con un solo estado`);
    const todos = new Set(filas.flat());
    ok(['Para aprobar', 'Para enviar', 'Enviado', 'Llegó incompleto', 'Recibido'].every(x => todos.has(x)), `[${s}] Pedidos muestra los cinco estados · ` + [...todos].join(', '));
    ok(/Para aprobar/.test(await p.locator('[data-filtro="revisar"]').innerText()) && /Para enviar/.test(await p.locator('[data-filtro="aprobados"]').innerText()), `[${s}] filtros con los nombres nuevos`);
    await shot(p, `02-compras-pedidos-${s}`);
    // El envío incompleto ofrece reclamar desde la tabla.
    await p.locator('.pt-envio', { hasText: 'Shopping' }).filter({ hasText: 'Llegó incompleto' }).locator('.pt-fila').click();
    ok(await p.locator('[data-accion="reclamar"]', { hasText: 'Reclamar faltante a Distri Stock' }).count() === 1, `[${s}] en Pedidos, el envío incompleto tiene «Reclamar faltante»`);

    // ===== Recibir: abre con lo pedido =====
    await ir(p, '#/recibir', '.grupo-prov[data-orden="o-env"]');
    const card = p.locator('.grupo-prov[data-orden="o-env"]');
    ok(await card.locator('.gp-head .estado').count() === 1 && await card.locator('.gp-head .estado').innerText() === 'Enviado', `[${s}] Recibir: la orden muestra un solo estado (Enviado)`);
    ok(await card.getByLabel('Cantidad recibida de Tomate perita').inputValue() === '10' && await card.getByLabel('Cantidad recibida de Crema de leche').inputValue() === '6', `[${s}] abre con lo pedido cargado`);
    ok(await card.locator('.rec-ok').innerText() === 'Llegó todo' && /Llegó todo lo pedido/.test(await card.locator('.rec-resumen').innerText()), `[${s}] sin corregir: botón «Llegó todo»`);
    await shot(p, `03-recibir-con-lo-pedido-${s}`);
    if (!pc) { await card.locator('.rec-ok').scrollIntoViewIfNeeded(); await shot(p, `03b-recibir-llego-todo-${s}`); }

    // «Llegó todo» en un toque (Distri Stock, Umo)
    await p.locator('.grupo-prov[data-orden="o-env2"] .rec-ok').click();
    await p.waitForSelector('.grupo-prov[data-orden="o-env2"]', { state: 'detached' });
    const r1 = db.rpc[0];
    ok(r1 && r1.p_orden === 'o-env2' && r1.p_items.length === 1 && r1.p_items[0].cantidad_recibida === 3 && !r1.p_cerrar, `[${s}] Llegó todo: recibir_orden con lo pedido`);
    ok(db.ordenes.find(o => o.id === 'o-env2').estado === 'recibida' && /llegó todo/.test(await p.locator('.toast').last().innerText()), `[${s}] queda Recibido`);

    // Corregir filas: tomate 8 de 10, la crema no vino, la leche sube 14 %.
    await card.getByLabel('Cantidad recibida de Tomate perita').fill('8');
    await card.getByRole('button', { name: 'No vino Crema de leche' }).click();
    await card.getByLabel('Costo unitario de Leche entera').fill('16000');
    const suba = card.locator('.prod-rec[data-producto="p-leche"] .rec-suba');
    ok(await suba.isVisible() && await suba.innerText() === 'Subió 14 % (antes $ 14.000)', `[${s}] aviso de suba en la fila · ` + await suba.innerText().catch(() => ''));
    ok(!(await card.locator('.prod-rec[data-producto="p-tomate"] .rec-suba').isVisible()), `[${s}] sin suba, sin aviso`);
    ok(/^Llegó incompleto/.test(await card.locator('.rec-resumen').innerText()) && await card.locator('.rec-ok').innerText() === 'Confirmar recepción' && await card.locator('.rec-volver').isVisible(), `[${s}] corregido: «Llegó incompleto», «Confirmar recepción» y «Volver a lo pedido»`);
    if (pc) await card.scrollIntoViewIfNeeded();
    await card.locator('.prod-rec[data-producto="p-leche"]').scrollIntoViewIfNeeded();
    await shot(p, `04-recibir-corregido-suba-${s}`);
    await card.locator('.rec-ok').click();
    await p.waitForSelector('.grupo-prov[data-orden="o-env"][data-estado="incompleto"]');
    const r2 = db.rpc[1];
    const li = (id) => r2.p_items.find(x => x.orden_item_id === id) || {};
    ok(li('i-tom').cantidad_recibida === 8 && li('i-cre').no_vino === true && li('i-cre').cantidad_recibida === 0 && li('i-lec').cantidad_recibida === 2 && li('i-lec').precio_unitario === 16000, `[${s}] el faltante viaja a la base (tomate 8, crema no vino, leche 2 a $ 16.000)`);
    const card2 = p.locator('.grupo-prov[data-orden="o-env"]');
    ok(await card2.locator('.gp-head .estado').innerText() === 'Llegó incompleto' && await card2.locator('.gp-head .estado').count() === 1, `[${s}] la orden queda «Llegó incompleto» (un solo estado)`);
    ok(/Tomate perita/.test(await card2.locator('.rec-falt-t').innerText()), `[${s}] muestra lo que falta llegar`);

    // Segunda vuelta: llega el resto del tomate («Llegó todo»); la crema que no vino queda como faltante.
    ok(await card2.locator('.rec-ok').innerText() === 'Llegó todo' && await card2.getByLabel('Cantidad recibida de Tomate perita').inputValue() === '2', `[${s}] la orden incompleta abre con lo que falta llegar y «Llegó todo»`);
    // ===== Reclamar faltante =====
    await card2.locator('[data-accion="reclamar"]').click();
    await p.waitForSelector('dialog[open] [data-reclamo]');
    const txt = await p.locator('dialog[open] [data-reclamo]').innerText();
    ok(/^Hola Juan! Del pedido de \*Docks del Puerto\* del \d+\/\d+ para Umo Grill \(factura SUMA ACTIVA S\.A\.\) faltó:/.test(txt), `[${s}] reclamo con local y razón social de gastronomía`);
    ok(/- Tomate perita: pedido 10 kg, llegó 8, falta 2 kg/.test(txt) && /- Crema de leche: pedido 6 potes, llegó 0, falta 6 potes/.test(txt) && !/Leche entera/.test(txt), `[${s}] reclamo con producto, pedido, llegó y falta · ` + JSON.stringify(txt));
    await shot(p, `05-reclamo-faltante-${s}`);
    await p.locator('dialog[open] [data-accion="reclamo-wa"]').click();
    const abiertos = await p.evaluate(() => window.__abiertos);
    ok(abiertos.length === 1 && abiertos[0].startsWith('https://wa.me/5491155551234?text=') && decodeURIComponent(abiertos[0].split('text=')[1]) === txt, `[${s}] abre el chat de Florida con el texto`);

    await p.keyboard.press('Escape');
    await card2.locator('.rec-ok').click();
    await p.waitForSelector('.rec-incompletas [data-incompleta="o-env"]');
    ok(db.rpc[2] && db.rpc[2].p_items.find(x => x.orden_item_id === 'i-tom').cantidad_recibida === 2 && db.ordenes.find(o => o.id === 'o-env').estado === 'recibida', `[${s}] llegó el resto: la orden se cierra y pasa a «Llegó incompleto» por la crema`);
    ok(/Reclamado/.test(await p.locator('.rec-incompletas [data-incompleta="o-env"]').innerText()), `[${s}] queda marcado como reclamado`);
    // Recibida con faltante (Shopping): en «Llegó incompleto», con SPMAR S.A.
    await p.waitForSelector('.rec-incompletas [data-incompleta="o-inc"]');
    await p.locator('.rec-incompletas [data-incompleta="o-inc"]').scrollIntoViewIfNeeded();
    await shot(p, `06-llego-incompleto-lista-${s}`);
    await p.locator('.rec-incompletas [data-incompleta="o-inc"]').click();
    await p.waitForSelector('dialog[open] [data-reclamo]');
    const txt2 = await p.locator('dialog[open] [data-reclamo]').innerText();
    ok(/para Shopping \(factura SPMAR S\.A\.\)/.test(txt2) && /Lavandina 5 L: pedido 4 bidones, llegó 1, falta 3 bidones/.test(txt2), `[${s}] Shopping reclama como SPMAR S.A. · ` + JSON.stringify(txt2));
    await p.keyboard.press('Escape');

    // ===== Recibir con factura: aviso de suba =====
    await ir(p, '#/recibir-factura', '#rf-archivo');
    await p.setInputFiles('#rf-archivo', foto);
    await p.locator('button', { hasText: 'Leer factura' }).click();
    await p.waitForSelector('.rf-fila');
    await p.waitForTimeout(300);
    const sLeche = p.locator('[data-renglon="1"] .rec-suba');
    ok(await sLeche.isVisible() && await sLeche.innerText() === 'Subió 16 % (antes $ 16.000)', `[${s}] factura: la leche marca «Subió 16 % (antes $ 16.000)» contra lo último pagado a Florida (recibido recién) · ` + await sLeche.innerText().catch(() => ''));
    ok(!(await p.locator('[data-renglon="0"] .rec-suba').isVisible()) && !(await p.locator('[data-renglon="2"] .rec-suba').isVisible()), `[${s}] factura: tomate (bajó) y crema (igual) sin aviso`);
    ok(/1 precio subió más de 5 %/.test(await p.locator('.rf-resumen').innerText()), `[${s}] factura: el resumen cuenta las subas`);
    await p.locator('[data-renglon="1"]').scrollIntoViewIfNeeded();
    await shot(p, `07-factura-suba-${s}`);

    // ===== Hoy: Subas de precio =====
    await ir(p, '#/hoy', '.gh-sem');
    await p.waitForSelector('.gh-subas', { timeout: 8000 }).catch(() => {});
    const subas = await p.locator('.gh-subas .lg-fila').allInnerTexts();
    ok(subas.length >= 1 && /Tomate perita/.test(subas[0]) && /\+16 %/.test(subas[0]) && /antes \$ 1\.900/.test(subas[0]), `[${s}] Hoy: Subas de precio con el tomate (+16 %) · ` + JSON.stringify(subas));
    ok(subas.some(x => /Leche entera/.test(x) && /\+14 %/.test(x)) && !subas.some(x => /Agua/.test(x)), `[${s}] Hoy: suma la leche recibida hoy (+14 %); el agua (+2 %) no`);
    await p.locator('.gh-subas').scrollIntoViewIfNeeded();
    await shot(p, `08-hoy-subas-${s}`);
    await c.close();
  }

  // ===== Sin historial de precios: Hoy no muestra la sección y Recibir funciona igual =====
  {
    const { c, p } = await nuevo({ width: 390, height: 844 }, { sinHistorial: true });
    await ir(p, '#/hoy', '.gh-sem');
    await p.waitForSelector('.gh-hojas:not(:has(.gh-cargando))', { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(400);
    ok(!(await p.locator('.gh-subas').count()), 'sin historial de precios, Hoy no muestra «Subas de precio»');
    await ir(p, '#/recibir', '.grupo-prov[data-orden="o-env"]');
    await p.getByLabel('Costo unitario de Leche entera').fill('16000');
    ok(await p.locator('.prod-rec[data-producto="p-leche"] .rec-suba').innerText() === 'Subió 14 % (antes $ 14.000)', 'sin historial, Recibir compara con el precio actual del producto');
    await c.close();
  }

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(fallas || errores.length ? 1 : 0);
})();
