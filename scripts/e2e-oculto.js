#!/usr/bin/env node
// Prueba de punta a punta del catálogo con productos ocultos (mayorista) en stock/ (manual, no corre en CI). Servidor estático y
// API de Supabase mockeada con page.route. Encargado (iPhone): Pedir muestra solo lo frecuente y lo oculto sale al buscar.
// Gerencia (PC): Catálogo marca y filtra ocultos; Stock no lista ocultos sin stock. También sin la columna (0012 sin correr).
// Uso: node scripts/e2e-oculto.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/mayorista');
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
const L1 = 'loc-umo', L2 = 'loc-shp';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const PV = { ins: 'pv-ins', ds: 'pv-ds' };
let seq = 0;
const prod = (nombre, categoria, o = {}) => ({ id: 'p' + (++seq), codigo: 'UMO-' + String(seq).padStart(3, '0'), nombre, local_id: L1, categoria, unidad_compra: 'paquete', unidad_uso: 'paquete', factor_conversion: 1, proveedor_id: PV.ins, par: null, es_elaborado: false, activo: true, oculto: false, ...o });
const ds = (cod, nombre, categoria, oculto, o = {}) => prod(nombre, categoria, { codigo: 'UMO-DS-' + cod, proveedor_id: PV.ds, oculto, ...o });
const db = {
  columna: true,
  locales: [{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth Coronel'], activo: true }, { id: L2, codigo: 'SHP', nombre: 'Shopping', encargados: ['Carla'], activo: true }],
  provs: [{ id: PV.ins, nombre: 'Insunort', activo: true }, { id: PV.ds, nombre: 'Distri Stock Mayorista', activo: true, notas: 'Precios sin IVA' }],
  productos: [
    prod('Lavandina', 'Limpieza'), prod('Rejilla', 'Limpieza'), prod('Rollo film', 'Descartables'),
    ds('LAVAN', 'Lavandina x 5 litros', 'Limpieza', false, { unidad_compra: 'bidón 5 l' }),
    ds('F100', 'B.aluminio f100 x 100 unidades', 'Bandejas', false),
    ds('P21', 'B.aluminio p21 x 100 unidades', 'Bandejas', false),
    ds('LIVI1520', 'Arranq livianito 15x20 x 1u (bulto x 12 bob) mapsa', 'Bolsas y rollos de arranque', false),
    ds('A50', 'Abrochadora n° 50 x unidad (505)', 'Librería y varios', true),
    ds('MUNDIAL', 'Copa mundial llavero x 1 u', 'Librería y varios', true),
    ds('S3232', 'Servilleta elegante caja x 1000 33 x 32 cod: 290', 'Servilletas y rollos de papel', true),
    ds('BKRAFT', 'Bobina kraft x kg.', 'Film, aluminio y papeles', true),
    ds('CA', 'Cenicero de aluminio (cal2) x 100 unidades', 'Bandejas', true),
    ds('LAVAN', 'Lavandina x 5 litros', 'Limpieza', false, { local_id: L2, codigo: 'SHP-DS-LAVAN' }),
    ds('F100', 'B.aluminio f100 x 100 unidades', 'Bandejas', true, { local_id: L2, codigo: 'SHP-DS-F100' })
  ],
  stock: [],
  log: []
};
const P = (cod) => db.productos.find(p => p.codigo === cod);
db.stock.push({ local_id: L1, producto_id: P('UMO-DS-CA').id, stock: 3 });
const precios = db.productos.filter(p => p.proveedor_id === PV.ds).map((p, i) => ({ producto_id: p.id, precio: 1000 + i * 250 }));
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
const sinOculto = (cols) => (db.columna ? null : (cols || '').includes('oculto'));
const quitar = (p) => { if (db.columna) return p; const { oculto, ...r } = p; return r; };
async function montarApi(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const sub = subDe(req);
    const rol = sub === U_GER ? 'gerencia' : (sub === U_ENC ? 'encargado' : null);
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(u.searchParams), b: body(), rol });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(String((body() || {}).refresh_token || 'r-' + U_ENC).slice(2)));
    if (!rol) return json({ code: '42501', message: 'permission denied' }, 401);
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'Umo Grill', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(rol === 'gerencia' ? db.locales : db.locales.filter(l => l.id === L1));
    if (t === 'productos') {
      if (req.method() === 'PATCH') { const b = body(); if (!db.columna && 'oculto' in b) return json({ code: 'PGRST204', message: "Could not find the 'oculto' column" }, 400); const p = db.productos.find(x => x.id === eq(u.searchParams.get('id'))); Object.assign(p, b); return json([{ id: p.id }]); }
      if (sinOculto(u.searchParams.get('select'))) return json({ code: '42703', message: 'column productos.oculto does not exist' }, 400);
      let r = db.productos; const l = eq(u.searchParams.get('local_id')); if (l) r = r.filter(p => p.local_id === l);
      if (rol === 'encargado') r = r.filter(p => p.local_id === L1);
      return json(r.map(quitar));
    }
    if (t === 'stock_actual') return json(db.stock.filter(s => !eq(u.searchParams.get('local_id')) || s.local_id === eq(u.searchParams.get('local_id'))));
    if (t === 'proveedores_basico' || t === 'proveedores') return json(db.provs);
    if (t === 'precio_actual') return json(rol === 'gerencia' ? precios : []);
    if (t === 'rpc/buscar_productos') { const b = body(); const n = (b.q || '').toLowerCase(); return json(db.productos.filter(p => p.local_id === (b.p_local || p.local_id) && p.nombre.toLowerCase().includes(n)).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, local_id: p.local_id, score: 0.8 }))); }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full });
const nombres = async (p) => p.locator('#view .prod .prod-n').allInnerTexts();

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const nuevo = async (opts, sub, extra = {}) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    await c.addInitScript(([s, x]) => {
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

  // ===== Encargado · iPhone: Pedir =====
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U_ENC, { nombre: 'Ruth Coronel' });
  await e.goto(BASE + '#/pedir');
  await e.waitForSelector('#view .prod');
  let n = await nombres(e);
  ok(n.length === 7, 'Pedir muestra solo lo frecuente (3 de siempre + 4 del mayorista) · ' + n.length);
  ok(!n.some(x => /Abrochadora|llavero|Bobina kraft|Cenicero/.test(x)), 'lo oculto no aparece en la lista');
  const chips = await e.locator('.chips .chip').allInnerTexts();
  ok(!chips.includes('Librería y varios') && !chips.includes('Servilletas y rollos de papel') && chips.includes('Bandejas'), 'las categorías solo de ocultos no aparecen como chip · ' + chips.join(', '));
  ok(/Hay 5 productos más/.test(await e.locator('.mas-buscar').innerText()), 'aviso: hay 5 productos más, buscalos');
  ok(!(await e.locator('#view').innerText()).includes('$'), 'el encargado no ve precios');
  await shot(e, '01-pedir-frecuentes-m');
  await e.locator('#scroller').evaluate(el => el.scrollTo(0, el.scrollHeight));
  await shot(e, '02-pedir-abajo-m');
  await e.fill('#buscar', 'abroch');
  await e.waitForTimeout(500);
  n = await nombres(e);
  ok(n.length === 1 && /Abrochadora/.test(n[0]), 'al buscar aparece lo oculto · ' + n.join(' | '));
  await shot(e, '03-pedir-buscar-oculto-m');
  await e.locator('#view .prod .stepper button').last().click();
  await e.fill('#buscar', '');
  await e.waitForTimeout(300);
  n = await nombres(e);
  ok(n.some(x => /Abrochadora/.test(x)) && n.length === 8, 'lo oculto que ya está en el pedido queda a la vista');
  await e.locator('.chip-mio').click();
  ok((await nombres(e)).some(x => /Abrochadora/.test(x)), 'En mi pedido lo muestra');
  await cE.close();

  // ===== Encargado · iPhone: con una categoría elegida la búsqueda queda dentro de ella =====
  const verdu = [prod('Tomate redondo', 'Verdulería'), prod('Tomate cherry', 'Verdulería'), prod('Lechuga', 'Verdulería'),
    ds('PURE', 'Puré de tomate x 520 g', 'Almacén', true), ds('TOMPEL', 'Tomate perita pelado lata', 'Almacén', true)];
  db.productos.push(...verdu);
  const { c: cV2, p: vv } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U_ENC, { nombre: 'Ruth Coronel' });
  await vv.goto(BASE + '#/pedir');
  await vv.waitForSelector('#view .prod');
  await vv.fill('#buscar', 'tomate');
  await vv.waitForTimeout(500);
  n = await nombres(vv);
  ok(n.length === 4 && n.some(x => /Puré/.test(x)), 'en Todas, "tomate" busca en todo el catálogo · ' + n.join(' | '));
  ok(/^Tomate/.test(n[0]) && /^Tomate/.test(n[1]) && /^Tomate/.test(n[2]), 'primero lo que empieza con lo buscado · ' + n.join(' | '));
  await vv.locator('.chips .chip', { hasText: 'Verdulería' }).click();
  await vv.waitForTimeout(500);
  n = await nombres(vv);
  ok(await vv.inputValue('#buscar') === 'tomate', 'al elegir Verdulería se mantiene lo buscado');
  ok(n.length === 2 && n.every(x => /^Tomate (redondo|cherry)$/.test(x)), 'en Verdulería "tomate" trae solo verdura, sin puré ni lata · ' + n.join(' | '));
  ok(/en Verdulería/.test(await vv.locator('.busca-n').innerText()) && /Buscar en Verdulería/.test(await vv.getAttribute('#buscar', 'placeholder')), 'avisa que busca dentro de Verdulería');
  await shot(vv, '05-pedir-verduleria-tomate-m');
  await vv.fill('#buscar', 'puré');
  await vv.waitForTimeout(500);
  ok(await vv.locator('#view .prod').count() === 0 && /No hay "puré" en Verdulería/.test(await vv.locator('#view').innerText()), 'sin resultados en la categoría lo dice');
  await vv.getByRole('button', { name: 'Buscar en todas las categorías' }).click();
  await vv.waitForTimeout(500);
  n = await nombres(vv);
  ok(n.length === 1 && /Puré/.test(n[0]), 'el botón busca en todas las categorías · ' + n.join(' | '));
  await cV2.close();
  for (const p of verdu) db.productos.splice(db.productos.indexOf(p), 1);

  // ===== Gerencia · PC: Catálogo y Stock =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1366, height: 900 } }, U_GER);
  await g.goto(BASE + '#/catalogo');
  await g.waitForSelector('#view .prod-cat');
  ok(await g.locator('#view .tag-oculto').count() === 6, 'Catálogo marca los 6 ocultos (5 de Umo + 1 del shopping)');
  await g.selectOption('select[aria-label="Qué mostrar"]', 'ocultos');
  ok(await g.locator('#view .prod-cat').count() === 6, 'filtro Solo ocultos');
  await shot(g, '10-catalogo-ocultos-pc');
  await g.locator('#view .prod-cat', { hasText: 'Bobina kraft' }).click();
  await g.waitForSelector('#f-oculto');
  ok(await g.locator('#f-oculto').isChecked(), 'la ficha muestra "Oculto en Pedir" marcado');
  await shot(g, '11-catalogo-editar-oculto-pc');
  await g.locator('#f-oculto').uncheck();
  await g.locator('.sheet button.btn-primary').click();
  await g.waitForTimeout(400);
  ok(P('UMO-DS-BKRAFT').oculto === false, 'destildar lo pasa a la vista (se guarda en el servidor)');
  await g.goto(BASE + '#/stock');
  await g.waitForSelector('#view .stk-lista');
  const txt = await g.locator('#view .stk-lista').innerText();
  ok(/Cenicero/.test(txt) && !/Abrochadora|llavero/.test(txt), 'Stock lista lo oculto solo si tiene stock');
  await cG.close();

  // ===== Sin la columna (0012 sin correr): todo se ve como antes =====
  db.columna = false;
  const { c: cV, p: v } = await nuevo({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, U_ENC);
  await v.goto(BASE + '#/pedir');
  await v.waitForSelector('#view .prod');
  ok((await nombres(v)).length === 12 && await v.locator('.mas-buscar').count() === 0, 'sin 0012 Pedir muestra todo, como antes');
  await cV.close();
  const { c: cG2, p: g2 } = await nuevo({ viewport: { width: 1366, height: 900 } }, U_GER);
  await g2.goto(BASE + '#/catalogo');
  await g2.waitForSelector('#view .prod-cat');
  await g2.locator('#view .prod-cat').first().click();
  ok(await g2.locator('#f-oculto').count() === 0 && await g2.locator('select[aria-label="Qué mostrar"]').isHidden(), 'sin 0012 el Catálogo no ofrece ocultar');
  await cG2.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
