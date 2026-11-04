#!/usr/bin/env node
// Prueba de punta a punta de Contar por lugar (manual, no corre en CI). API de Supabase mockeada con page.route.
// Gerencia (PC y celular): Stock → Lugares, agrega lugares, pasa categorías enteras, ordena y guarda (ubicar_productos).
// Encargado (iPhone): Contar arranca en los lugares con su avance; dentro de un lugar ve sus productos en orden de
// estantes, a ciegas, con "Siguiente: <lugar>"; al buscar cada producto dice dónde está; guarda el conteo de todo junto.
// Sin lugares cargados, Contar sigue como antes (lista por categoría).
// Uso: node scripts/e2e-lugares.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/contar-por-lugar');
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
  nalga: prod('Nalga', 'Carnes', 'kg'),
  pollo: prod('Pechuga de pollo', 'Carnes', 'kg'),
  papas: prod('Papas en bolsa', 'Verdulería', 'kg', { unidad_compra: 'bolsa', factor_conversion: 5 }),
  lechuga: prod('Lechuga', 'Verdulería', 'kg'),
  helado: prod('Helado de vainilla', 'Postres', 'balde'),
  coca: prod('Coca-Cola 500', 'Bebidas', 'unidad'),
  agua: prod('Agua sin gas 500', 'Bebidas', 'unidad')
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
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Solo gerencia ordena los lugares' }, 403);
      for (const it of b.p_items) { const p = Object.values(P).find(x => x.id === it.id); if (p) { p.lugar = it.lugar; p.orden_lugar = it.orden; } }
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

  // ===== Encargado sin lugares cargados: como antes =====
  {
    const { c, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
    await e.goto(BASE + '#/contar');
    await e.waitForSelector('.cnt-prod');
    ok(await e.locator('.lug-card').count() === 0 && await e.locator('.chips .chip', { hasText: 'Carnes' }).count() === 1, 'sin lugares: lista por categoría como antes');
    await c.close();
  }

  // ===== Gerencia · PC: Stock → Lugares =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/lugares');
  await g.waitForSelector('.lug-sec');
  ok(await g.locator('.subnav-b.is-on').innerText() === 'Lugares', 'Stock tiene la pestaña Lugares');
  ok(await g.locator('.lug-sec.is-sin .lug-fila').count() === 7, 'al principio todo está sin lugar');
  await shot(g, '01-g-lugares-vacio-pc', true);
  for (const l of ['Cámara', 'Freezer', 'Barra']) { await g.fill('#lug-nuevo', l); await g.locator('.lug-tool button', { hasText: 'Agregar' }).click(); }
  ok(await g.locator('.lug-sec:not(.is-sin)').count() === 3, 'agrega Cámara, Freezer y Barra');
  const pasar = async (cat, l) => { await g.selectOption('#lug-cat', cat); await g.selectOption('#lug-dest', l); await g.locator('.lug-tool button', { hasText: 'Pasar' }).click(); };
  await pasar('Carnes', 'Cámara'); await pasar('Verdulería', 'Cámara'); await pasar('Postres', 'Freezer'); await pasar('Bebidas', 'Barra');
  ok(await g.locator('.lug-sec.is-sin .lug-fila').count() === 0, 'con "Toda una categoría" queda todo ubicado');
  // Coca a la cámara (va al final) y de vuelta a la barra, lechuga primero, y la Barra antes que el Freezer.
  await g.locator(`.lug-fila[data-id="${P.coca.id}"] .lug-sel`).selectOption('Cámara');
  const camara = () => g.locator('.lug-sec[data-lugar="Cámara"] .lug-fila').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
  let ids = await camara();
  ok(ids[ids.length - 1] === P.coca.id, 'mover la coca a Cámara la pone al final');
  await g.locator(`.lug-fila[data-id="${P.coca.id}"] .lug-sel`).selectOption('Barra');
  ok((await camara()).length === 4, 'y vuelve a la Barra');
  for (let i = ids.indexOf(P.lechuga.id); i > 0; i--) await g.locator(`.lug-fila[data-id="${P.lechuga.id}"] button[aria-label^="Subir"]`).click();
  ids = await camara();
  ok(ids[0] === P.lechuga.id, 'con ↑ la lechuga queda primera en la cámara');
  await g.locator('.lug-sec[data-lugar="Barra"] .lug-sec-h button[aria-label^="Contar Barra antes"]').click();
  const ordenSec = await g.locator('.lug-sec:not(.is-sin)').evaluateAll(els => els.map(e => e.getAttribute('data-lugar')));
  ok(JSON.stringify(ordenSec) === JSON.stringify(['Cámara', 'Barra', 'Freezer']), 'la Barra pasa antes que el Freezer · ' + ordenSec.join(', '));
  ok(await g.locator('.pill').isVisible(), 'aparece Guardar lugares');
  await g.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(g, '02-g-lugares-armado-pc', true);
  await g.locator('.pill').click();
  await g.waitForSelector('.toast');
  const ub = db.ubicar[db.ubicar.length - 1] || [];
  ok(ub.length === 7 && ub.find(x => x.id === P.lechuga.id).orden < ub.find(x => x.id === P.nalga.id).orden && ub.find(x => x.id === P.coca.id).orden < ub.find(x => x.id === P.helado.id).orden, 'guarda los 7 con lugar y orden · ' + JSON.stringify(ub.map(x => [x.lugar, x.orden])));
  ok(P.helado.lugar === 'Freezer' && P.coca.lugar === 'Barra' && P.coca.orden_lugar === 2001 && P.agua.orden_lugar === 2000 && P.lechuga.orden_lugar === 1000, 'en la base: Barra segunda (agua, coca), lechuga primera en la cámara');
  ok(await g.locator('.pill').isHidden(), 'después de guardar no queda nada pendiente');
  await cG.close();
  const { c: cGm, p: gm } = await nuevo(M, U_GER, { 'g:local': L1 });
  await gm.goto(BASE + '#/lugares'); await gm.waitForSelector('.lug-sec');
  await shot(gm, '03-g-lugares-m', true);
  await cGm.close();

  // ===== Encargado · iPhone: Contar por lugar =====
  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
  await e.goto(BASE + '#/contar');
  await e.waitForSelector('.lug-card');
  const cards = await e.locator('.lug-card .lug-n').allInnerTexts();
  ok(JSON.stringify(cards) === JSON.stringify(['Cámara', 'Barra', 'Freezer']), 'los lugares salen en el orden del recorrido · ' + cards.join(', '));
  ok(/0 de 4 contados/.test(await e.locator('.lug-card[data-lugar="Cámara"]').innerText()), 'Cámara: 0 de 4 contados');
  ok(!/Quedan/.test(await e.locator('.cnt-lista').innerText()), 'sigue a ciegas');
  await shot(e, '04-contar-lugares-m');
  await e.locator('.lug-card[data-lugar="Cámara"]').click();
  await e.waitForSelector('.lug-cab');
  const enCam = await e.locator('.cnt-prod').evaluateAll(els => els.map(x => x.getAttribute('data-id')));
  ok(enCam[0] === P.lechuga.id && enCam.length === 4, 'dentro de Cámara: 4 productos y la lechuga primera, como los estantes');
  await e.locator(`[data-id="${P.lechuga.id}"] .cnt-in`).fill('2,5');
  await e.locator(`[data-id="${P.papas.id}"] .cnt-in`).fill('3');
  ok(/2 de 4 contados/.test(await e.locator('.lug-cab-a').innerText()), 'el avance se actualiza al escribir');
  ok(/Siguiente: Barra/.test(await e.locator('.lug-sig').innerText()), 'ofrece seguir con la Barra');
  await shot(e, '05-contar-camara-m');
  await e.locator(`[data-id="${P.nalga.id}"] .cnt-in`).fill('4');
  await e.locator(`[data-id="${P.pollo.id}"] .cnt-in`).fill('0');
  ok(await e.locator('.lug-sig.btn-primary').count() === 1, 'con la cámara completa el botón Siguiente se resalta');
  await e.reload(); await e.waitForSelector('.lug-cab');
  ok(await e.locator('.lug-cab-n').innerText() === 'Cámara' && await e.locator(`[data-id="${P.nalga.id}"] .cnt-in`).inputValue() === '4', 'si se cierra, vuelve al mismo lugar con lo cargado');
  await e.locator('.lug-sig').click();
  await e.waitForFunction(() => document.querySelector('.lug-cab-n') && document.querySelector('.lug-cab-n').textContent === 'Barra');
  await e.locator(`[data-id="${P.coca.id}"] .cnt-in`).fill('24');
  await e.locator('.lug-volver').click();
  await e.waitForSelector('.lug-card');
  ok(await e.locator('.lug-card[data-lugar="Cámara"].is-done').count() === 1 && /1 de 2/.test(await e.locator('.lug-card[data-lugar="Barra"]').innerText()), 'en los lugares: Cámara completa y Barra 1 de 2');
  await shot(e, '06-contar-avance-m');
  await e.fill('.input-search', 'helado');
  const donde = await e.locator('.cnt-lista').innerText();
  ok(/Freezer/i.test(donde) && /Helado/.test(donde), 'al buscar, el producto dice en qué lugar está · ' + donde.replace(/\n/g, ' / '));
  await shot(e, '07-contar-buscar-m');
  await e.fill('.input-search', '');
  await e.locator('.pill').click();
  await e.waitForSelector('.toast');
  const rc = db.rpc[db.rpc.length - 1] || {};
  const got = Object.fromEntries((rc.p_items || []).map(x => [x.producto_id, x.contado]));
  ok(got[P.lechuga.id] === 2.5 && got[P.papas.id] === 15 && got[P.pollo.id] === 0 && got[P.coca.id] === 24 && Object.keys(got).length === 5, 'guarda 5 productos (papas 3 bolsas = 15 kg) · ' + JSON.stringify(got));
  ok(await e.locator('.lug-card').count() === 3 && /0 de 4/.test(await e.locator('.lug-card[data-lugar="Cámara"]').innerText()), 'después de guardar vuelve a los lugares, vacío para el próximo');
  await cE.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
