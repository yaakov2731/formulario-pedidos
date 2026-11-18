#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de la pérdida de la semana: Hoy de gerencia con una fila por local,
// detalle en Stock → Control → Pérdida (lo que más pesa, semana anterior, productos clave), sin datos y sin costos.
// API de Supabase mockeada y reloj fijo (jueves 12/11/2026). Capturas a 390 y 1366 px (viewport, escala 2).
// Uso: node scripts/e2e-perdida.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/perdida-semana');
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

// ---------- datos ----------
// Jueves 12/11/2026, 16 h. Semana = lunes 9 a domingo 15 (como la línea de la semana de Hoy).
const L1 = 'loc-umo', L2 = 'loc-shp', L3 = 'loc-tre';
const U_GER = 'usr-ger', U_ENC = 'usr-enc';
const LOCALES = [
  { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true },
  { id: L2, codigo: 'SHP', nombre: 'Shopping', encargados: ['Marcos'], activo: true },
  { id: L3, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true }
];
let seq = 0;
const prod = (nombre, uu, local, lugar = 'Cocina') => ({ id: 'p' + (++seq), codigo: 'X-' + seq, nombre, local_id: local, categoria: 'Insumos', unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: false, activo: true, oculto: false, lugar, orden_lugar: seq });
const P = {
  nalga: prod('Nalga', 'kg', L1), coca: prod('Coca-Cola 500 ml', 'unidad', L1, 'Barra'), papas: prod('Papas', 'kg', L1), limon: prod('Limones', 'kg', L1, 'Barra'),
  salsa: prod('Salsa de la casa', 'kg', L1), papel: prod('Papel higiénico', 'rollo', L2, 'Depósito'), cafe: prod('Café en grano', 'kg', L3)
};
const PRECIOS = { [P.nalga.id]: 12000, [P.coca.id]: 900, [P.papas.id]: 900, [P.limon.id]: 2000, [P.papel.id]: 450, [P.cafe.id]: 21000 }; // la salsa no tiene costo
const ts = (fecha, h) => new Date(`${fecha}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();
let hid = 0;
const hm = (local, fecha, sector, p, tipo, cantidad, otro = null) => ({ id: 'h' + (++hid), local_id: local, fecha, sector, producto_id: p.id, tipo, cantidad, otro, quien: 'Lucas', creado_en: ts(fecha, 12) });
const venta = (local, fecha, p, cant, h = 21) => ({ local_id: local, producto_id: p.id, tipo: 'venta', cantidad: -cant, nota: '', creado_en: ts(fecha, h), ref_id: null });
const HOJA = [
  // Esta semana. Martes 10: nalga 10 → 4 con 1 kg de merma anotada y 4 vendidos (sin explicar 1 kg); coca 48 → 20, vendidas 25 (sin explicar 3).
  hm(L1, '2026-11-10', 'Cocina', P.nalga, 'apertura', 10), hm(L1, '2026-11-10', 'Cocina', P.nalga, 'merma', 1), hm(L1, '2026-11-10', 'Cocina', P.nalga, 'cierre', 4),
  hm(L1, '2026-11-10', 'Barra', P.coca, 'apertura', 48), hm(L1, '2026-11-10', 'Barra', P.coca, 'cierre', 20),
  // Miércoles 11: papas 20 → 5, vendidas 10 (sin explicar 5 kg); limón 6 → 3 con 0,5 de merma, vendido 2 (sin explicar 0,5); salsa sin costo.
  hm(L1, '2026-11-11', 'Cocina', P.papas, 'apertura', 20), hm(L1, '2026-11-11', 'Cocina', P.papas, 'cierre', 5),
  hm(L1, '2026-11-11', 'Barra', P.limon, 'apertura', 6), hm(L1, '2026-11-11', 'Barra', P.limon, 'merma', 0.5), hm(L1, '2026-11-11', 'Barra', P.limon, 'cierre', 3),
  hm(L1, '2026-11-11', 'Cocina', P.salsa, 'apertura', 5), hm(L1, '2026-11-11', 'Cocina', P.salsa, 'cierre', 2),
  // Semana anterior. Miércoles 4: nalga 8 → 5, vendidos 2 (sin explicar 1 kg = $ 12.000).
  hm(L1, '2026-11-04', 'Cocina', P.nalga, 'apertura', 8), hm(L1, '2026-11-04', 'Cocina', P.nalga, 'cierre', 5),
  // Shopping: abrió el depósito el martes y no cerró.
  hm(L2, '2026-11-10', 'Depósito', P.papel, 'apertura', 120)
];
const MOVS = [
  venta(L1, '2026-11-10', P.nalga, 4), venta(L1, '2026-11-10', P.coca, 25), venta(L1, '2026-11-11', P.papas, 10), venta(L1, '2026-11-11', P.limon, 2),
  venta(L1, '2026-11-04', P.nalga, 2)
];
// Cuatro semanas de ventas por receta para los productos clave (con las de esta semana): nalga 32 kg = $ 384.000, coca $ 270.000, papas $ 135.000, limón $ 80.000; salsa sin costo.
for (const f of ['2026-10-16', '2026-10-23', '2026-10-30', '2026-11-06']) {
  MOVS.push(venta(L1, f, P.nalga, 6.5), venta(L1, f, P.coca, 68.75), venta(L1, f, P.papas, 35), venta(L1, f, P.limon, 9.5), venta(L1, f, P.salsa, 4));
}


function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 30 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 30 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
const subDe = (req) => { try { return JSON.parse(Buffer.from((req.headers().authorization || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch (_e) { return null; } };
const filtro = (rows, q) => {
  let r = rows;
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) r = r.filter(x => String(x[k]) === v.slice(3));
    else if (v.startsWith('neq.')) r = r.filter(x => String(x[k]) !== v.slice(4));
    else if (v.startsWith('gte.')) r = r.filter(x => (typeof x[k] === 'number' ? x[k] >= Number(v.slice(4)) : String(x[k]) >= v.slice(4)));
    else if (v.startsWith('lte.')) r = r.filter(x => String(x[k]) <= v.slice(4));
    else if (v.startsWith('in.(')) { const l = v.slice(4, -1).split(','); r = r.filter(x => l.includes(String(x[k]))); }
  }
  return r;
};

function montarApi(ctx, db) {
  return ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ t, rol });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_GER).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_GER));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: 'Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(filtro(LOCALES, q));
    if (t === 'proveedores_basico' || t === 'proveedores') return json([]);
    if (t === 'productos') return json(filtro(Object.values(P).filter(p => rol === 'gerencia' || p.local_id === L1), q));
    if (t === 'stock_actual') return json([]);
    if (t === 'precio_actual') return json(rol === 'gerencia' ? Object.entries(db.precios).map(([producto_id, precio]) => ({ producto_id, precio })) : []);
    if (t === 'hoja_movs') return json(filtro(rol === 'gerencia' ? db.hoja : db.hoja.filter(m => m.local_id === L1), q));
    if (t === 'movimientos') return json(filtro(db.movs, q));
    if (t === 'ordenes_compra') return json([]);
    if (t === 'facturas_pendientes') return rol === 'gerencia' ? json([]) : json({ code: '42501', message: 'permission denied' }, 403);
    if (t === 'rpc/tablero') return rol === 'gerencia' ? json({ actual: { ventas: 3200000, compras: 1500000, cmv: 1000000, margen: 2200000, margen_pct: 68.7 }, anterior: {}, pendientes: { sin_precio: { n: 0 } } }) : json({ code: '42501', message: 'permission denied' }, 403);
    if (t === 'notas' || t === 'conteos' || t === 'precios') return json([]);
    errores.push('mock: ruta no prevista ' + req.method() + ' ' + u.pathname + ' (' + rol + ')');
    return json({ message: 'mock: ruta no prevista ' + t }, 404);
  });
}

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const limpiar = (p) => p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); });
const shot = async (p, n) => { await limpiar(p); await p.waitForTimeout(250); return p.screenshot({ path: path.join(OUT, n + '.png') }); };
const texto = async (p, sel) => (await p.locator(sel).allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
const valor = async (p, k) => (await p.locator(`[data-perdida="${k}"] .lg-v`).innerText()).replace(/\s+/g, ' ').trim();

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1366: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 } };
  const JUEVES = new Date('2026-11-12T16:00:00-03:00');
  const abrir = async (ancho, db, ruta = '', local = null, sub = U_GER) => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: 'dark', ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, db);
    await c.addInitScript(([s, loc]) => {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:nombre', JSON.stringify('Jacobo'));
      if (loc) localStorage.setItem('stock:g:local', JSON.stringify(loc));
    }, [sesion(sub), local]);
    const p = await c.newPage();
    await p.clock.setFixedTime(JUEVES);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.lg-n, .lg-s, .lg-v, .titulo')]
    .filter(e => e.offsetParent).every(e => e.scrollWidth <= e.clientWidth + 1));
  const db = () => ({ log: [], hoja: HOJA, movs: MOVS, precios: PRECIOS });

  for (const ancho of [390, 1366]) {
    // ===== 1) Hoy de gerencia: Pérdida de la semana por local =====
    const { c, p } = await abrir(ancho, db());
    await p.waitForSelector('[data-grupo="perdida"]');
    const filas = await texto(p, '[data-grupo="perdida"]');
    ok(filas.join(' / ') === 'Umo Grill Sin explicar $ 20.200 · Merma $ 13.000 · falta costo de 1 $ 33.200 / Shopping Sin cierres esta semana Falta cargar / Trento Café Sin cierres esta semana Falta cargar',
      `${ancho}: Hoy con Pérdida de la semana (Sin explicar + Merma, a costo; sin datos "Falta cargar") · ` + filas.join(' / '));
    ok(await sinDesborde(p), `${ancho}: Hoy sin desbordes`);
    await p.locator('[data-grupo="perdida"]').first().scrollIntoViewIfNeeded();
    await shot(p, `hoy-perdida-${ancho}`);

    // ===== 2) Toca Umo → detalle en Stock → Control → Pérdida =====
    await p.locator('[data-grupo="perdida"][data-local="' + L1 + '"]').click();
    await p.waitForSelector('[data-perdida="total"]');
    ok(await p.evaluate(() => location.hash) === '#/perdida' && await p.locator('.volver-hoy').count() === 1, `${ancho}: toca → Pérdida, con ‹ Hoy para volver`);
    ok(await p.locator('.subnav-b.is-on').innerText() === 'Control' && await p.locator('.subnav-f.is-on').innerText() === 'Pérdida', `${ancho}: dentro de Stock → Control (filtro Pérdida, sin tercer nivel)`);
    ok((await p.locator('.sel-local').innerText()).trim() === 'Umo Grill', `${ancho}: abre en el local tocado`);
    ok(await valor(p, 'total') === '$ 33.200' && await valor(p, 'sin-explicar') === '$ 20.200' && await valor(p, 'merma') === '$ 13.000' && await valor(p, 'anterior') === '$ 12.000',
      `${ancho}: Pérdida $ 33.200 = Sin explicar $ 20.200 + Merma $ 13.000; Semana anterior $ 12.000`);
    const top = await texto(p, '.perd-top .lg-fila');
    ok(top.join(' / ') === 'Nalga Faltan 1 kg · Merma 1 kg $ 24.000 / Papas Faltan 5 kg $ 4.500 / Coca-Cola 500 ml Faltan 3 unidades $ 2.700 / Limones Faltan 0,5 kg · Merma 0,5 kg $ 2.000',
      `${ancho}: lo que más pesa (producto, cantidad con unidad, $) · ` + top.join(' / '));
    ok(/Falta cargar costos: Salsa de la casa/.test(await p.locator('.perd-semana .lg-pie').innerText()), `${ancho}: la salsa sin costo queda aparte ("Falta cargar costos")`);
    const clave = await texto(p, '.perd-clave .lg-fila');
    ok(clave.join(' / ') === 'Nalga Pérdida esta semana $ 24.000 $ 384.000 / Coca-Cola 500 ml Pérdida esta semana $ 2.700 $ 270.000 / Papas Pérdida esta semana $ 4.500 $ 135.000 / Falta cargar costos Salsa de la casa 1 producto',
      `${ancho}: productos clave (~80 % del costo consumido, con $ consumido y pérdida de la semana) · ` + clave.join(' / '));
    ok(/^3 productos = 91 % del costo consumido en 4 semanas/.test(await p.locator('.perd-clave .lg-pie').innerText()), `${ancho}: pie de productos clave`);
    ok(await p.locator('.kpi, .tb-card').count() === 0 && !/estimad/i.test(await p.locator('#view').innerText()), `${ancho}: sin tarjetas grandes ni estimaciones`);
    ok(await sinDesborde(p), `${ancho}: detalle sin desbordes`);
    await shot(p, `detalle-umo-${ancho}`);
    await p.locator('.perd-clave').scrollIntoViewIfNeeded();
    await shot(p, `productos-clave-${ancho}`);
    await c.close();

    // ===== 3) Sin datos: Trento no tiene hoja ni ventas =====
    const v = await abrir(ancho, db(), '#/perdida', L3);
    await v.p.waitForSelector('[data-perdida="total"]');
    ok(await valor(v.p, 'total') === 'Falta cargar' && /Sin cierres esta semana/.test(await v.p.locator('[data-perdida="total"]').innerText()) && await valor(v.p, 'anterior') === 'Sin historial todavía',
      `${ancho}: sin datos: "Falta cargar" y "Sin historial todavía", sin inventar`);
    ok(await v.p.locator('[data-clave="sin-historial"]').count() === 1 && await v.p.locator('.perd-top').count() === 0, `${ancho}: productos clave sin historial`);
    await shot(v.p, `sin-datos-${ancho}`);
    await v.c.close();

    // ===== 4) Sin costos cargados: nada en $, todo "Falta cargar costos" =====
    const s = await abrir(ancho, { ...db(), precios: {} }, '#/perdida', L1);
    await s.p.waitForSelector('[data-perdida="total"]');
    ok(await valor(s.p, 'total') === '$ 0' && /Falta cargar costos: Coca-Cola 500 ml, Limones, Nalga, Papas y 1 más/.test(await s.p.locator('.perd-semana .lg-pie').innerText())
      && (await texto(s.p, '.perd-clave .lg-fila')).length === 1 && await s.p.locator('[data-clave="falta-costo"]').count() === 1, `${ancho}: sin costos no hay ranking ni plata: "Falta cargar costos"`);
    if (ancho === 390) await shot(s.p, 'sin-costos-390');
    await s.c.close();
  }

  // ===== 5) El encargado no ve pérdida ni $ =====
  const e = await abrir(390, db(), '#/perdida', null, U_ENC);
  await e.p.waitForSelector('#view .vista, .hoy-lista', { timeout: 10000 }).catch(() => {});
  await e.p.waitForTimeout(500);
  ok(!/Pérdida|\$/.test(await e.p.locator('#view').innerText()), 'encargado: #/perdida no muestra pérdida ni plata');
  await e.c.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); for (const x of [...new Set(errores)]) console.log(' - ' + x); }
  const total = fallas + (errores.length ? 1 : 0);
  console.log(total ? `\n${total} FALLA(S) · capturas en ${OUT}` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
