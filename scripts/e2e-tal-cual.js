#!/usr/bin/env node
// Prueba de punta a punta de "Se vende tal cual" (manual, no corre en CI). Servidor estático y API de Supabase mockeada.
// Gerencia (PC): Recetas → "Vendidos sin receta" muestra PULSERA-PASE (35 vendidas, creada como plato al importar);
// se abre, "Se vende tal cual" → elige "Pulseras para inflables" del stock → vender_tal_cual; el plato sale de Recetas
// y las pulseras aparecen en Stock con lo descontado. También: "que este mismo tenga stock" para un plato sin producto.
// Uso: node scripts/e2e-tal-cual.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/tal-cual');
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

const L1 = 'loc-gel';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const PRV = 'prv-varios';
let seq = 0;
const prod = (nombre, cat, uu, extra = {}) => ({ id: 'p' + (++seq), codigo: 'GEL-' + String(80 + seq).padStart(3, '0'), nombre, local_id: L1, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: PRV, par: null, es_elaborado: false, activo: true, oculto: false, ...extra });
const P = {
  pulseras: prod('Pulseras para inflables', 'Varios', 'unidad'),
  servilletas: prod('Servilletas', 'Descartables', 'paquete'),
  pase: prod('PULSERA-PASE', 'Carta', 'porción', { codigo: 'PLA-PROM-0027', unidad_compra: null, es_elaborado: true, proveedor_id: null }),
  agua: prod('Aguas', 'Carta', 'porción', { codigo: 'PLA-BEB-0001', unidad_compra: null, es_elaborado: true, proveedor_id: null })
};
const db = {
  stock: new Map([[P.pulseras.id, 500], [P.servilletas.id, 4]]),
  sinReceta: [{ local_id: L1, producto_id: P.pase.id, codigo: P.pase.codigo, nombre: P.pase.nombre, vendidos: 35, ultima_venta: '2026-10-23' },
              { local_id: L1, producto_id: P.agua.id, codigo: P.agua.codigo, nombre: P.agua.nombre, vendidos: 12, ultima_venta: '2026-10-23' }],
  rpc: [], log: []
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
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(q), b: body(), rol });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(String((body() || {}).refresh_token || 'r-' + U_ENC).slice(2)));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json([{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true }]);
    if (t === 'proveedores' || t === 'proveedores_basico') return json([{ id: PRV, nombre: 'Verdulería Central', activo: true, dias_entrega: null, corte: null, tiene_minimo: false }]);
    if (t === 'productos') return json(Object.values(P));
    if (t === 'stock_actual') return json([...db.stock].map(([pid, s]) => ({ local_id: L1, producto_id: pid, stock: s })));
    if (t === 'recetas') return json([]);
    if (t === 'platos_sin_receta') return json(db.sinReceta);
    if (t === 'rpc/vender_tal_cual') {
      const b = body(); db.rpc.push(b);
      const pla = Object.values(P).find(x => x.id === b.p_plato);
      const vend = (db.sinReceta.find(s => s.producto_id === pla.id) || {}).vendidos || 0;
      db.sinReceta = db.sinReceta.filter(s => s.producto_id !== pla.id);
      if (b.p_producto) { pla.activo = false; db.stock.set(b.p_producto, (db.stock.get(b.p_producto) || 0) - vend * b.p_cantidad); }
      else { Object.assign(pla, { es_elaborado: false, categoria: 'Reventa', unidad_uso: 'unidad', unidad_compra: 'unidad' }); db.stock.set(pla.id, -vend); }
      return json({ producto_id: b.p_producto || pla.id, items: 1, importaciones: 1 });
    }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full });
const hojaShot = async (p, n) => { const d = p.locator('dialog[open]').last(); await d.screenshot({ path: path.join(OUT, n + '.png') }); };

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

  // ===== Gerencia · PC =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1280, height: 900 } }, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/recetas');
  await g.waitForSelector('.sr-b');
  ok(/Se vende tal cual/.test(await g.locator('.bloque').first().innerText()), 'Vendidos sin receta explica «Se vende tal cual»');
  await shot(g, '01-recetas-sin-receta-pc');
  await g.locator('[aria-label="Cargar receta de PULSERA-PASE"]').click();
  await g.locator('button', { hasText: 'Se vende tal cual' }).click();
  await g.waitForSelector('[aria-label="Descontar Pulseras para inflables"]');
  ok(await g.locator('input[aria-label="Buscar producto del stock"]').inputValue() === 'PULSERA', 'arranca buscando la primera palabra (PULSERA)');
  ok(!(await g.locator('[aria-label="Descontar PULSERA-PASE"]').count()) && !(await g.locator('[aria-label="Descontar Aguas"]').count()), 'no ofrece platos como producto del stock');
  await hojaShot(g, '02-elegir-producto-pc');
  await g.locator('[aria-label="Descontar Pulseras para inflables"]').click();
  ok(/35 ventas ya subidas también se descuentan/.test(await g.locator('dialog[open]').innerText()), 'avisa que las 35 ventas ya subidas también se descuentan');
  await hojaShot(g, '03-confirmar-pc');
  await g.locator('dialog[open] button', { hasText: 'Confirmar' }).click();
  await g.waitForTimeout(300);
  const r1 = db.rpc.find(x => x.p_plato === P.pase.id);
  ok(r1 && r1.p_producto === P.pulseras.id && r1.p_cantidad === 1, 'llama vender_tal_cual(PULSERA-PASE → Pulseras para inflables, 1) · ' + JSON.stringify(r1));
  ok(!(await g.locator('[aria-label="Receta de PULSERA-PASE"]').count()) && !(await g.locator('[aria-label="Cargar receta de PULSERA-PASE"]').count()), 'PULSERA-PASE sale de Recetas');
  // Aguas: no hay producto en el catálogo → el plato mismo pasa a tener stock.
  await g.locator('[aria-label="Cargar receta de Aguas"]').click();
  await g.locator('button', { hasText: 'Se vende tal cual' }).click();
  await g.locator('button', { hasText: 'que este mismo tenga stock' }).click();
  await g.locator('dialog[open] button', { hasText: 'Confirmar' }).click();
  await g.waitForTimeout(300);
  const r2 = db.rpc.find(x => x.p_plato === P.agua.id);
  ok(r2 && r2.p_producto === null, 'Aguas: vender_tal_cual sin producto (pasa a tener stock) · ' + JSON.stringify(r2));
  await shot(g, '04-recetas-despues-pc');
  // Stock: las pulseras con lo descontado (500 − 35) y Aguas ahora se cuenta.
  await g.goto(BASE + '#/stock');
  const card = g.locator(`[data-prod="${P.pulseras.id}"]`);
  await card.waitFor();
  ok(/465/.test(await card.innerText()), 'Stock: Pulseras para inflables quedan 465 · ' + (await card.innerText()).replace(/\n/g, ' / '));
  ok(await g.locator(`[data-prod="${P.agua.id}"]`).count() === 1, 'Stock: Aguas aparece como producto con stock');
  await shot(g, '05-stock-pulseras-pc');
  await cG.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
