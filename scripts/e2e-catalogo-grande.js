#!/usr/bin/env node
// Prueba de velocidad con un catálogo grande en stock/ (manual, no corre en CI): 5 locales x 3.000 productos, con el mismo nombre
// en los 5 locales (como el mayorista). La API mockeada pagina de a 1000 como PostgREST y, si el orden no es único, desordena los
// empates en cada pedido (como Postgres). Mide Pedir (primer pintado, buscar, scroll por tandas) y el catálogo completo de gerencia.
// Uso: node scripts/e2e-catalogo-grande.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/catalogo-grande');
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
const LOCS = ['UMO', 'TRE', 'BRK', 'GEL', 'SHP'].map(c => ({ id: 'loc-' + c.toLowerCase(), codigo: c, nombre: c, encargados: ['Ana'], activo: true }));
const L1 = LOCS[0].id;
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const POR_LOCAL = 3000;
const CATS = ['Almacén', 'Lácteos', 'Carnes', 'Limpieza', 'Descartables', 'Bebidas', 'Verdulería', 'Panadería'];
const PALABRAS = ['aceite', 'arroz', 'azúcar', 'harina', 'leche', 'queso', 'manteca', 'crema', 'yogur', 'carne', 'pollo', 'cerdo', 'lavandina', 'detergente', 'servilleta', 'bolsa', 'gaseosa', 'agua', 'tomate', 'papa', 'pan', 'fideos', 'sal', 'vinagre'];
const productos = [];
for (const l of LOCS) for (let i = 0; i < POR_LOCAL; i++) {
  const n = `${PALABRAS[i % PALABRAS.length]} ${['x 1 kg', 'x 5 l', 'x 500 g', 'x 12 u'][i % 4]} marca ${Math.floor(i / 96)}`;
  productos.push({ id: `${l.codigo}-${String(i).padStart(5, '0')}`, codigo: `${l.codigo}-${i}`, nombre: n, local_id: l.id, categoria: CATS[i % CATS.length], unidad_compra: 'u', unidad_uso: 'u',
    factor_conversion: 1, proveedor_id: 'pv-1', par: null, es_elaborado: false, activo: true, oculto: i % 3 !== 0 });
}
const log = [];
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
// Ordena como Postgres: por las columnas pedidas; los empates quedan en un orden cualquiera (distinto en cada pedido).
function ordenar(rows, order) {
  const cols = (order || '').split(',').filter(Boolean).map(x => x.split('.')[0]);
  const r = rows.map(x => [x, Math.random()]);
  r.sort((a, b) => { for (const c of cols) { const d = String(a[0][c]).localeCompare(String(b[0][c])); if (d) return d; } return a[1] - b[1]; });
  return r.map(x => x[0]);
}
function paginar(rows, q, req) {
  let off = Number(q.get('offset') || 0), lim = Math.min(Number(q.get('limit') || 1000), 1000);
  const rg = req.headers()['range'];
  if (rg) { const [a, b] = rg.split('-').map(Number); off = a; lim = Math.min(b - a + 1, 1000); }
  return rows.slice(off, off + lim);
}
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
    log.push({ t, q: Object.fromEntries(u.searchParams), rol, at: Date.now() });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(String((body() || {}).refresh_token || 'r-' + U_ENC).slice(2)));
    if (!rol) return json({ code: '42501', message: 'permission denied' }, 401);
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'UMO', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(rol === 'gerencia' ? LOCS : LOCS.slice(0, 1));
    if (t === 'productos') {
      let r = productos; const l = eq(u.searchParams.get('local_id')) || (rol === 'encargado' ? L1 : null); if (l) r = r.filter(p => p.local_id === l);
      await new Promise(res => setTimeout(res, 150)); // latencia de red por pedido
      return json(paginar(ordenar(r, u.searchParams.get('order')), u.searchParams, req));
    }
    if (t === 'rpc/buscar_productos') { const b = body(); const n = (b.q || '').toLowerCase(); return json(productos.filter(p => p.local_id === (b.p_local || p.local_id) && p.nombre.toLowerCase().includes(n)).slice(0, 50).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, local_id: p.local_id, score: 0.8 }))); }
    if (t === 'proveedores_basico' || t === 'proveedores') return json([{ id: 'pv-1', nombre: 'Mayorista', activo: true }]);
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const nuevo = async (opts, sub) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    await c.addInitScript(([s]) => {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:nombre', '"Ana"');
    }, [sesion(sub)]);
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p };
  };

  // ===== Encargado · iPhone con CPU 4x más lenta: Pedir con 3.000 productos (1.000 a la vista) =====
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U_ENC);
  const cdp = await cE.newCDPSession(e);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let t0 = Date.now();
  await e.goto(BASE + '#/pedir');
  await e.waitForSelector('#view .prod');
  const tPrimero = Date.now() - t0;
  const filas = await e.locator('#view .prod').count();
  console.log(`     Pedir: primer pintado ${tPrimero} ms · ${filas} renglones en pantalla`);
  ok(filas <= 80, `Pedir pinta por tandas (${filas} renglones de 1.000 a la vista)`);
  ok(log.filter(x => x.t === 'productos' && x.rol === 'encargado').length >= 3, 'el catálogo del local (3.000) se trae paginado');
  await e.locator('#scroller').evaluate(el => el.scrollTo(0, el.scrollHeight));
  await e.waitForTimeout(400);
  ok(await e.locator('#view .prod').count() > filas, 'al bajar se suman más renglones');
  // Buscar: tiempo de cada tecla (input → lista pintada)
  const tecla = async (v) => e.evaluate((v) => new Promise(res => {
    const i = document.getElementById('buscar'); const t = performance.now();
    i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => setTimeout(() => res(performance.now() - t), 0));
  }), v);
  await e.locator('#scroller').evaluate(el => el.scrollTo(0, 0));
  const tA = await tecla('a'); const tAc = await tecla('ac'); const tAce = await tecla('ace'); const tVacio = await tecla('');
  console.log(`     Buscar: "a" ${tA.toFixed(0)} ms · "ac" ${tAc.toFixed(0)} ms · "ace" ${tAce.toFixed(0)} ms · borrar ${tVacio.toFixed(0)} ms`);
  ok(Math.max(tA, tAc, tAce, tVacio) < 400, 'cada tecla del buscador responde en menos de 0,4 s (CPU 4x más lenta)');
  await tecla('leche');
  await e.waitForTimeout(500);
  const nLeche = await e.locator('.busca-n').innerText();
  ok(/125 productos/.test(nLeche), 'el buscador cuenta todos los resultados aunque pinte por tandas · ' + nLeche);
  await shot(e, '01-pedir-buscar-m');
  await cE.close();

  // ===== Gerencia · PC: catálogo completo (15.000) sin repetidos ni faltantes =====
  log.length = 0;
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1366, height: 900 } }, U_GER);
  t0 = Date.now();
  await g.goto(BASE + '#/catalogo');
  await g.waitForSelector('#view .prod-cat');
  const tCat = Date.now() - t0;
  const r = await g.evaluate(async () => { const m = await import('./js/datos.js'); const ids = [...m.G.prods.keys()]; return { n: ids.length }; });
  const pedidos = log.filter(x => x.t === 'productos');
  const rondas = new Set(pedidos.map(x => Math.round(x.at / 100))).size;
  console.log(`     Catálogo gerencia: ${tCat} ms · ${pedidos.length} páginas en ~${rondas} tandas · ${r.n} productos`);
  ok(r.n === productos.length, `catálogo de gerencia completo: ${r.n} de ${productos.length} (sin repetidos ni faltantes)`);
  // Volver a Catálogo desde otra pantalla no vuelve a bajar todo
  log.length = 0;
  await g.goto(BASE + '#/stock'); await g.waitForSelector('#view .stk-lista, #view .vacio', { timeout: 15000 });
  await g.goto(BASE + '#/catalogo'); await g.waitForSelector('#view .prod-cat');
  ok(log.filter(x => x.t === 'productos').length === 0, 'cambiar de pantalla reusa el catálogo de memoria (no lo vuelve a bajar)');
  const cards = await g.locator('#view .stk-card, #view .prod-cat').count();
  ok(cards > 0, 'Catálogo pinta');
  await cG.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
