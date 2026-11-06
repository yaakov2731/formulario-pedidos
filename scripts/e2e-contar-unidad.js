#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI). API de Supabase mockeada con page.route.
// 1) El encargado arma los lugares de su local desde Contar → "Armar los lugares del local" (sin selector de locales)
//    y después cuenta por lugar.
// 2) Lo que se compra por bulto (minitorta en caja de 4, papas en bolsa de 5 kg) se cuenta en bultos + sueltas:
//    1 caja + 2 sueltas = 6 unidades; solo 2 sueltas = 2.
// Uso: node scripts/e2e-contar-unidad.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/contar-por-unidad');
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

const L1 = 'loc-umo';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
let seq = 0;
const prod = (nombre, cat, uu, extra = {}) => ({ id: 'p' + (++seq), codigo: 'UMO-' + String(seq).padStart(3, '0'), nombre, local_id: L1, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: false, activo: true, oculto: false, lugar: null, orden_lugar: null, ...extra });
const P = {
  capricho: prod('Minitorta Capricho x4', 'Pastelería', 'unidad', { unidad_compra: 'caja', factor_conversion: 4 }),
  carrot: prod('Minitorta Carrot cake x4', 'Pastelería', 'unidad', { unidad_compra: 'caja', factor_conversion: 4 }),
  papas: prod('Papas en bolsa', 'Verdulería', 'kg', { unidad_compra: 'bolsa', factor_conversion: 5 }),
  lechuga: prod('Lechuga', 'Verdulería', 'kg'),
  coca: prod('Coca-Cola 500', 'Bebidas', 'unidad')
};
const db = { stock: new Map(Object.values(P).map(p => [p.id, 5])), conteos: [], rpc: [], ubicar: [], log: [] };
function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
const subDe = (req) => { try { return JSON.parse(Buffer.from((req.headers().authorization || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch (_e) { return null; } };
const eq = (v) => (v && v.startsWith('eq.') ? v.slice(3) : null);


async function montarApi(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: 'Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json([{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true, razon_social: 'SUMA ACTIVA S.A.' }]);
    if (t === 'productos') return json(Object.values(P).map(p => ({ ...p })));
    if (t === 'stock_actual') return json([...db.stock].map(([pid, s]) => ({ local_id: L1, producto_id: pid, stock: s })));
    if (t === 'conteos') return json(db.conteos.slice(-1));
    if (t === 'rpc/ubicar_productos') {
      const b = JSON.parse(req.postData() || '{}'); db.ubicar.push(b.p_items);
      // 0030: el encargado ubica solo productos de su local.
      for (const it of b.p_items) { const p = Object.values(P).find(x => x.id === it.id); if (p && (rol === 'gerencia' || p.local_id === L1)) { p.lugar = it.lugar; p.orden_lugar = it.orden; } }
      return json(b.p_items.length);
    }
    if (t === 'rpc/contar_local') {
      const b = JSON.parse(req.postData() || '{}'); db.rpc.push(b);
      db.conteos.push({ id: 'c' + db.conteos.length, local_id: b.p_local, encargado: b.p_encargado, items: b.p_items, creado_en: new Date().toISOString() });
      return json('c' + (db.conteos.length - 1));
    }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = async (p, n, full = false) => { await p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); }); return p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full }); };

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const nuevo = async (opts, sub, extra = {}) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    await c.addInitScript(([s, x]) => {
      window.confirm = () => true;
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      for (const [k, v] of Object.entries(x)) localStorage.setItem('stock:' + k, JSON.stringify(v));
    }, [sesion(sub), extra]);
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|400 \(Bad Request\)/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p };
  };

  const M = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
  await e.goto(BASE + '#/contar');
  await e.waitForSelector('.cnt-prod');

  // ===== Bultos + sueltas =====
  const fila = (p) => e.locator(`[data-id="${p.id}"]`);
  ok(await fila(P.capricho).locator('.cnt-in').count() === 2 && await fila(P.lechuga).locator('.cnt-in').count() === 1, 'lo que viene por caja tiene cajas + sueltas; lo demás un solo número');
  ok(/cajas de 4 unidades/.test(await fila(P.capricho).innerText()) && /unidades sueltas/.test(await fila(P.capricho).innerText()), 'dice "cajas de 4 unidades" y "unidades sueltas"');
  await fila(P.capricho).locator('.cnt-in').nth(0).fill('1');
  await fila(P.capricho).locator('.cnt-in').nth(1).fill('2');
  ok((await fila(P.capricho).locator('.cnt-total').innerText()).trim() === '= 6 unidades', '1 caja + 2 sueltas = 6 unidades');
  await fila(P.carrot).locator('.cnt-in').nth(1).fill('2');
  ok((await fila(P.carrot).locator('.cnt-total').innerText()).trim() === '= 2 unidades' && await fila(P.carrot).evaluate(x => x.classList.contains('is-on')), 'solo 2 sueltas = 2 unidades, y cuenta como contado');
  await fila(P.papas).locator('.cnt-in').nth(0).fill('2');
  await fila(P.papas).locator('.cnt-in').nth(1).fill('1,5');
  ok((await fila(P.papas).locator('.cnt-total').innerText()).trim() === '= 11,5 kg', '2 bolsas de 5 kg + 1,5 kg = 11,5 kg');
  await fila(P.lechuga).locator('.cnt-in').fill('3');
  await fila(P.capricho).scrollIntoViewIfNeeded();
  await shot(e, '01-contar-cajas-y-sueltas-m');
  await e.reload(); await e.waitForSelector('.cnt-prod');
  ok(await fila(P.capricho).locator('.cnt-in').nth(1).inputValue() === '2' && (await fila(P.capricho).locator('.cnt-total').innerText()).trim() === '= 6 unidades', 'si se cierra la app, las sueltas quedan guardadas en el borrador');
  await e.locator('.cnt-tipo-b[data-tipo="cierre"]').click();
  await e.locator('.pill').click();
  await e.waitForSelector('.toast');
  const got = Object.fromEntries(((db.rpc[db.rpc.length - 1] || {}).p_items || []).map(x => [x.producto_id, x.contado]));
  ok(got[P.capricho.id] === 6 && got[P.carrot.id] === 2 && got[P.papas.id] === 11.5 && got[P.lechuga.id] === 3 && Object.keys(got).length === 4, 'guarda en unidades: capricho 6, carrot 2, papas 11,5 kg · ' + JSON.stringify(got));

  // ===== El encargado arma los lugares =====
  ok(await e.locator('.cnt-armar').isVisible() && /Armar los lugares del local/.test(await e.locator('.cnt-armar').innerText()), 'sin lugares, Contar ofrece "Armar los lugares del local"');
  await e.locator('.cnt-armar a').click();
  await e.waitForSelector('.lug-sec');
  ok(await e.locator('.chips [data-local]').count() === 0 && await e.locator('.subnav').count() === 0, 'el encargado ve solo su local, sin selector de locales ni menú de gerencia');
  ok(await e.locator('[data-nav="stock"].is-active').count() > 0, 'en el menú queda marcado Stock');
  for (const l of ['Cámara', 'Barra']) { await e.fill('#lug-nuevo', l); await e.locator('.lug-tool button', { hasText: 'Agregar' }).click(); }
  for (const [c, l] of [['Pastelería', 'Cámara'], ['Verdulería', 'Cámara'], ['Bebidas', 'Barra']]) {
    await e.selectOption('#lug-cat', c); await e.selectOption('#lug-dest', l); await e.locator('.lug-tool-cat button').click();
  }
  await e.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 8000 }).catch(() => {});
  await shot(e, '02-encargado-arma-lugares-m', true);
  await e.locator('.pill').click();
  await e.waitForSelector('.toast');
  ok(P.capricho.lugar === 'Cámara' && P.coca.lugar === 'Barra' && db.ubicar.length === 1, 'guarda los lugares del local (ubicar_productos)');
  await e.goto(BASE + '#/contar');
  await e.waitForSelector('.lug-card');
  const cards = await e.locator('.lug-card .lug-n').allInnerTexts();
  ok(JSON.stringify(cards) === JSON.stringify(['Cámara', 'Barra']), 'de vuelta en Contar aparecen sus lugares · ' + cards.join(', '));
  ok(/Cambiar los lugares/.test(await e.locator('.cnt-armar').innerText()), 'con lugares, el botón dice "Cambiar los lugares"');
  await shot(e, '03-contar-lugares-m');
  await e.locator('.lug-card[data-lugar="Cámara"]').click();
  await e.waitForSelector('.lug-cab');
  ok(await e.locator('.cnt-armar').isHidden() && await fila(P.capricho).locator('.cnt-in').count() === 2, 'dentro del lugar: sin el botón, y la minitorta con cajas + sueltas');
  await fila(P.capricho).locator('.cnt-in').nth(1).fill('3');
  await shot(e, '04-contar-camara-sueltas-m');
  await cE.close();

  // PC: cómo se ve en escritorio
  const { c: cP, p: pc } = await nuevo({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, U_ENC, { nombre: 'Lucas' });
  await pc.goto(BASE + '#/contar'); await pc.waitForSelector('.lug-card');
  await pc.locator('.lug-card[data-lugar="Cámara"]').click(); await pc.waitForSelector('.lug-cab');
  await pc.locator(`[data-id="${P.capricho.id}"] .cnt-in`).nth(0).fill('1');
  await pc.locator(`[data-id="${P.capricho.id}"] .cnt-in`).nth(1).fill('2');
  await shot(pc, '05-contar-camara-pc');
  await cP.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
