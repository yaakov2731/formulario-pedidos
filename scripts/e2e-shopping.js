#!/usr/bin/env node
// Prueba de punta a punta del Shopping sin Elaborados (manual, no corre en CI). API de Supabase mockeada con page.route.
// Encargado del Shopping (iPhone): sin pestaña Elaborados y #/elaborados vuelve a Pedir; Contar a ciegas y guarda el conteo.
// Encargado de Brooklyn sigue con Elaborados y también tiene Contar.
// Gerencia (PC): Stock → Elaborados y Cocina → Producción no ofrecen el Shopping; Stock → Métricas del Shopping cuenta lo
// usado por conteo (había + entró − quedó) y no muestra producción ni platos.
// Uso: node scripts/e2e-shopping.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/shopping-sin-elaborados');
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

const L1 = 'loc-shp', L2 = 'loc-brk';
const U_ENC = 'usr-enc', U_BRK = 'usr-brk', U_GER = 'usr-ger';
let seq = 0;
const prod = (nombre, cat, uu, local = L1) => ({ id: 'p' + (++seq), codigo: 'SHP-' + String(seq).padStart(3, '0'), nombre, local_id: local, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: false, activo: true, oculto: false });
const P = {
  lav: prod('Lavandina 5 L', 'Limpieza', 'bidón'),
  bolsas: prod('Bolsas de residuo 80x110', 'Limpieza', 'paquete'),
  papel: prod('Rollo de papel higiénico', 'Papelería', 'rollo'),
  serv: prod('Servilletas', 'Papelería', 'paquete'),
  mila: { ...prod('Milanesa de nalga', 'Elaborados', 'unidad', L2), es_elaborado: true }
};
const hace = (d, h = 10) => { const x = new Date(Date.now() - d * 864e5); x.setHours(h, 0, 0, 0); return x.toISOString(); };
// Lavandina: había 10, entraron 12 el miércoles, el domingo quedaron 8 → se usaron 14.
const db = {
  locales: [{ id: L1, codigo: 'SHP', nombre: 'Shopping', encargados: ['Carlos'], activo: true, razon_social: 'SPMAR S.A.' }, { id: L2, codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true }],
  stock: new Map([[P.lav.id, 8], [P.bolsas.id, 3], [P.papel.id, 40], [P.serv.id, 6], [P.mila.id, 4]]),
  movs: [
    { producto_id: P.lav.id, tipo: 'recepcion', cantidad: 12, nota: 'Pedido', creado_en: hace(4) },
    { producto_id: P.bolsas.id, tipo: 'recepcion', cantidad: 10, nota: 'Pedido', creado_en: hace(4) },
    { producto_id: P.papel.id, tipo: 'recepcion', cantidad: 48, nota: 'Pedido', creado_en: hace(4) },
    { producto_id: P.lav.id, tipo: 'ajuste_conteo', cantidad: -14, nota: 'Conteo', creado_en: hace(1, 20) },
    { producto_id: P.bolsas.id, tipo: 'ajuste_conteo', cantidad: -9, nota: 'Conteo', creado_en: hace(1, 20) },
    { producto_id: P.papel.id, tipo: 'ajuste_conteo', cantidad: -20, nota: 'Conteo', creado_en: hace(1, 20) },
    { producto_id: P.serv.id, tipo: 'ajuste_conteo', cantidad: 1, nota: 'Conteo', creado_en: hace(1, 20) }
  ],
  conteos: [], rpc: [],
  log: []
};
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
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado'; const mio = sub === U_BRK ? L2 : L1;
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(q), rol });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: mio === L1 ? 'Shopping' : 'Brooklyn', rol: 'encargado', local_id: mio }]);
    if (t === 'locales') return json(rol === 'gerencia' ? db.locales : db.locales.filter(l => l.id === mio));
    if (t === 'productos') { const lid = eq(q.get('local_id')) || (rol === 'encargado' ? mio : null); return json(Object.values(P).filter(p => !lid || p.local_id === lid)); }
    if (t === 'stock_actual') {
      const lid = eq(q.get('local_id')) || (rol === 'encargado' ? mio : null);
      return json([...db.stock].map(([pid, s]) => ({ local_id: Object.values(P).find(p => p.id === pid).local_id, producto_id: pid, stock: s })).filter(r => !lid || r.local_id === lid));
    }
    if (t === 'conteos') return json(db.conteos.filter(c => c.local_id === (eq(q.get('local_id')) || mio)).slice(-1));
    if (t === 'rpc/contar_local') {
      const b = JSON.parse(req.postData() || '{}'); db.rpc.push(b);
      if (rol === 'encargado' && b.p_local !== mio) return json({ code: '42501', message: 'Sin permiso para contar en este local' }, 403);
      const items = b.p_items.map(it => { const sis = db.stock.get(it.producto_id) || 0; db.stock.set(it.producto_id, it.contado); return { ...it, sistema: sis, dif: it.contado - sis }; });
      db.conteos.push({ id: 'c' + db.conteos.length, local_id: b.p_local, encargado: b.p_encargado, items, creado_en: new Date().toISOString() });
      return json('c' + (db.conteos.length - 1));
    }
    if (t === 'movimientos') return json(eq(q.get('local_id')) === L1 ? db.movs : []);
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
  // ===== Encargado del Shopping · iPhone =====
  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Carlos' });
  await e.goto(BASE + '#/pedir');
  await e.waitForSelector('.tab');
  const tabs = await e.locator('.tab').allInnerTexts();
  ok(!tabs.some(x => /Elaborados/.test(x)), 'el Shopping no tiene la pestaña Elaborados · ' + tabs.join(' / '));
  ok(tabs.some(x => /Pedir/.test(x)) && tabs.some(x => /Facturas/.test(x)), 'sigue con Pedir y Facturas');
  await shot(e, '01-shopping-sin-elaborados-m');
  await e.goto(BASE + '#/elaborados');
  await e.waitForFunction(() => location.hash === '#/pedir');
  ok(true, 'entrar a #/elaborados lo devuelve a Pedir');

  // Contar: a ciegas (sin "Quedan"), vacío = no contado, 0 vale.
  await e.locator('.tab', { hasText: 'Contar' }).click();
  await e.waitForSelector('.cnt-prod');
  ok(/Todavía no se contó/.test(await e.locator('.cnt-ult').innerText()), 'avisa que todavía no se contó');
  ok(!/Quedan/.test(await e.locator('.cnt-lista').innerText()), 'cuenta a ciegas: no muestra lo que dice el sistema');
  ok(await e.locator('.pill').isHidden(), 'sin nada cargado no ofrece guardar');
  await shot(e, '03-contar-vacio-m');
  await e.locator(`[data-id="${P.lav.id}"] .cnt-in`).fill('6');
  await e.locator(`[data-id="${P.bolsas.id}"] .cnt-in`).fill('0');
  ok(/2 productos/.test(await e.locator('.pill').innerText()), 'el botón cuenta 2 productos');
  await shot(e, '04-contar-cargado-m');
  await e.reload(); await e.waitForSelector('.cnt-prod');
  ok(await e.locator(`[data-id="${P.lav.id}"] .cnt-in`).inputValue() === '6', 'lo cargado queda guardado en el celular si se cierra');
  await e.locator('.pill').click();
  await e.waitForSelector('.toast');
  const rc = db.rpc[db.rpc.length - 1];
  ok(rc && rc.p_local === L1 && rc.p_encargado === 'Carlos' && JSON.stringify(rc.p_items) === JSON.stringify([{ producto_id: P.bolsas.id, contado: 0 }, { producto_id: P.lav.id, contado: 6 }]), 'guarda lavandina 6 y bolsas 0 a nombre de Carlos · ' + JSON.stringify(rc && rc.p_items));
  ok(/Último conteo: .*Carlos · 2 productos/.test(await e.locator('.cnt-ult').innerText()), 'muestra el último conteo');
  ok(await e.locator(`[data-id="${P.lav.id}"] .cnt-in`).inputValue() === '', 'después de guardar queda vacío para el próximo');
  await shot(e, '05-contar-guardado-m');
  await cE.close();

  // ===== Encargado de Brooklyn: la sigue viendo =====
  const { c: cB, p: b } = await nuevo(M, U_BRK, { nombre: 'Maru' });
  await b.goto(BASE + '#/pedir');
  await b.waitForSelector('.tab');
  ok(await b.locator('.tab', { hasText: 'Elaborados' }).count() === 1 && await b.locator('.tab', { hasText: 'Contar' }).count() === 1, 'Brooklyn sigue con Elaborados y también tiene Contar');
  await cB.close();

  // ===== Gerencia · PC =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1280, height: 860 } }, U_GER, { 'g:local': L1, 'g:stk-vista': 'metricas' });
  await g.goto(BASE + '#/elaborados');
  await g.waitForSelector('.chips .chip');
  const chipsE = await g.locator('.chips .chip').allInnerTexts();
  ok(!chipsE.includes('Shopping') && chipsE.includes('Brooklyn'), 'Stock → Elaborados no ofrece el Shopping · ' + chipsE.join(', '));
  await g.goto(BASE + '#/produccion');
  await g.waitForSelector('.chips .chip');
  const chipsP = await g.locator('.chips .chip').allInnerTexts();
  ok(!chipsP.includes('Shopping'), 'Cocina → Producción no ofrece el Shopping · ' + chipsP.join(', '));

  await g.evaluate((l) => localStorage.setItem('stock:g:local', JSON.stringify(l)), L1);
  await g.goto(BASE + '#/stock');
  await g.waitForSelector('[data-bloque="consumo"]');
  const cons = await g.locator('[data-bloque="consumo"]').innerText();
  ok(/Lavandina/.test(cons) && /Usó 14/.test(cons) && /Quedan 6/.test(cons), 'lo usado sale del conteo: lavandina usó 14, quedan 6 (lo contado recién) · ' + cons.replace(/\n/g, ' / '));
  ok(!/Servilletas/.test(cons), 'un conteo que sobró no cuenta como uso');
  ok(await g.locator('[data-bloque="produccion"]').count() === 0 && await g.locator('[data-bloque="platos"]').count() === 0, 'sin Producción disponible ni Platos');
  ok(/Último conteo/i.test(await g.locator('[data-metricas]').innerText()), 'en lugar de la última venta muestra el último conteo');
  await shot(g, '02-g-stock-metricas-shopping-pc', true);
  await cG.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
