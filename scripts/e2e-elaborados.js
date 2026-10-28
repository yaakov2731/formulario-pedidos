#!/usr/bin/env node
// Prueba de punta a punta de Elaborados (manual, no corre en CI). Servidor estático y API de Supabase mockeada con page.route.
// Encargado (iPhone): pestaña Elaborados; "Elaboré" 25 milanesas con 5 kg de nalga feteada y 500 g de pan rallado (en g);
// la segunda vez se completa con lo de la última vez escalado; "Usé hoy" 2 kg de papas; borrar lo de hoy; lo de ayer no.
// Gerencia (PC): Stock → Elaborados con selector de local y receta. Sin 0014, avisa y no guarda.
// Uso: node scripts/e2e-elaborados.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/elaborados');
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

const L1 = 'loc-brk', L2 = 'loc-umo';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
let seq = 0;
const prod = (nombre, cat, uu, extra = {}, local = L1) => ({ id: 'p' + (++seq), codigo: 'BRK-' + String(seq).padStart(3, '0'), nombre, local_id: local, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: false, activo: true, oculto: false, ...extra });
const P = {
  nalga: prod('Nalga feteada', 'Carnes', 'kg'),
  pan: prod('Pan rallado', 'Almacén', 'kg'),
  huevo: prod('Huevos', 'Almacén', 'docena'),
  jamon: prod('Jamón cocido', 'Fiambres', 'kg'),
  papas: prod('Papas en bolsa', 'Verdulería', 'kg'),
  mila: prod('Milanesa de nalga', 'Elaborados', 'unidad', { es_elaborado: true }),
  jamonF: prod('Jamón feteado', 'Elaborados', 'kg', { es_elaborado: true }),
  plato: prod('Milanesa napolitana', 'Carta', 'unidad', { es_elaborado: true }),
  umo: prod('Chorizo', 'Carnes', 'kg', {}, L2)
};
const ayer = new Date(Date.now() - 864e5); ayer.setHours(19, 30, 0, 0);
const db = {
  sql: true,
  locales: [{ id: L1, codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true }, { id: L2, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true }],
  stock: new Map([[P.nalga.id, 8], [P.pan.id, 2], [P.huevo.id, 3], [P.jamon.id, 4], [P.papas.id, 10], [P.mila.id, 6], [P.umo.id, 5]]),
  regs: [{ id: 'r-ayer', local_id: L1, tipo: 'uso', producto_id: null, cantidad: null, items: [{ insumo_id: P.papas.id, cantidad: 1.5 }], nota: null, encargado: 'Maru', creado_en: ayer.toISOString() }],
  recetas: [{ id: 'rec1', producto_id: P.jamonF.id, rinde: 1, receta_items: [{ insumo_id: P.jamon.id, cantidad: 1.05 }] }],
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
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'Brooklyn', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(rol === 'gerencia' ? db.locales : db.locales.filter(l => l.id === L1));
    if (t === 'productos') { const lid = eq(q.get('local_id')) || (rol === 'encargado' ? L1 : null); return json(Object.values(P).filter(p => !lid || p.local_id === lid)); }
    if (t === 'stock_actual') {
      const lid = eq(q.get('local_id')) || (rol === 'encargado' ? L1 : null);
      return json([...db.stock].map(([pid, s]) => ({ local_id: Object.values(P).find(p => p.id === pid).local_id, producto_id: pid, stock: s })).filter(r => !lid || r.local_id === lid));
    }
    if (t === 'recetas') return json(rol === 'gerencia' ? db.recetas : []);
    if (t === 'producciones') {
      if (!db.sql) return json({ code: '42703', message: 'column producciones.tipo does not exist' }, 400);
      const lid = eq(q.get('local_id'));
      return json(db.regs.filter(r => r.local_id === lid).sort((a, b) => b.creado_en.localeCompare(a.creado_en)));
    }
    if (t === 'rpc/registrar_elaboracion') {
      const b = body(); db.rpc.push(b);
      if (b.p_local !== L1 && rol === 'encargado') return json({ code: '42501', message: 'Sin permiso para anotar en este local' }, 403);
      const id = 'r' + (++seq);
      (b.p_items || []).forEach(it => db.stock.set(it.insumo_id, (db.stock.get(it.insumo_id) || 0) - it.cantidad));
      if (b.p_producto) db.stock.set(b.p_producto, (db.stock.get(b.p_producto) || 0) + b.p_cantidad);
      db.regs.push({ id, local_id: b.p_local, tipo: b.p_producto ? 'elaboracion' : 'uso', producto_id: b.p_producto, cantidad: b.p_cantidad, items: b.p_items, nota: b.p_nota, encargado: b.p_encargado, creado_en: new Date().toISOString() });
      return json(id);
    }
    if (t === 'rpc/borrar_elaboracion') { const b = body(); db.rpc.push({ borrar: b.p_id }); db.regs = db.regs.filter(r => r.id !== b.p_id); return json(null); }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full });
const nombreOpt = async (sel, texto) => sel.evaluate((s, t) => { const o = [...s.options].find(x => x.textContent.startsWith(t)); return o ? o.value : null; }, texto);
async function elegir(sel, texto) { const v = await nombreOpt(sel, texto); if (!v) throw new Error('no hay opción ' + texto); await sel.selectOption(v); }

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

  // ===== Encargado · iPhone =====
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U_ENC, { nombre: 'Maru' });
  await e.goto(BASE + '#/pedir');
  await e.waitForSelector('.tab');
  ok(await e.locator('.tab', { hasText: 'Elaborados' }).count() === 1, 'el encargado tiene la pestaña Elaborados');
  await e.locator('.tab', { hasText: 'Elaborados' }).click();
  await e.waitForSelector('.el-form select.el-sel');
  ok(/Brooklyn/.test(await e.locator('.vista-head .sub').innerText()), 'el subtítulo dice el local');
  const histTxt = await e.locator('.el-hist').innerText();
  ok(/Ayer/i.test(histTxt) && /1,5 kg Papas en bolsa/.test(histTxt), 'muestra lo de ayer con lo que sacó · ' + histTxt.replace(/\n/g, ' / '));
  ok(await e.locator('[data-reg="r-ayer"] .el-borrar').count() === 0, 'lo de ayer no se puede borrar');
  await shot(e, '01-elaborados-vacio-m');

  const selProd = e.locator('.el-form > select.el-sel');
  const opts = await selProd.evaluate(s => [...s.options].map(o => o.textContent));
  ok(!opts.some(o => /napolitana/.test(o)) && !opts.some(o => /Chorizo/.test(o)), 'el desplegable no tiene platos de la carta ni productos de otro local');
  ok(await selProd.evaluate(s => s.querySelector('optgroup').label) === 'Elaborados del local', 'los elaborados aparecen primero');
  await elegir(selProd, 'Milanesa de nalga');
  await e.fill('.el-salio .el-cant', '25');
  let filas = e.locator('.el-fila');
  await elegir(filas.nth(0).locator('select.el-sel'), 'Nalga feteada');
  await filas.nth(0).locator('.el-cant').fill('5');
  await e.locator('.el-mas').click();
  await elegir(filas.nth(1).locator('select.el-sel'), 'Pan rallado');
  await filas.nth(1).locator('select.el-uni').selectOption({ label: 'g' });
  await filas.nth(1).locator('.el-cant').fill('500');
  await e.fill('.el-nota', 'para el fin de semana');
  ok(/Quedan 2 kg/.test(await filas.nth(1).innerText()), 'muestra cuánto queda del insumo');
  await shot(e, '02-elabore-m', true);
  await e.locator('.el-guardar').click();
  await e.waitForSelector('.el-reg:not([data-reg="r-ayer"])');
  let r = db.rpc[db.rpc.length - 1];
  ok(r.p_producto === P.mila.id && r.p_cantidad === 25 && r.p_local === L1 && r.p_encargado === 'Maru', 'guarda 25 milanesas de Brooklyn a nombre de Maru');
  ok(JSON.stringify(r.p_items) === JSON.stringify([{ insumo_id: P.nalga.id, cantidad: 5 }, { insumo_id: P.pan.id, cantidad: 0.5 }]), '500 g de pan rallado se guardan como 0,5 kg · ' + JSON.stringify(r.p_items));
  const hoyTxt = await e.locator('.el-hist').innerText();
  ok(/25 Milanesa de nalga/.test(hoyTxt) && /5 kg Nalga feteada · 500 g Pan rallado/.test(hoyTxt) && /Maru · para el fin de semana/.test(hoyTxt), 'lo anotado hoy: qué salió, qué usó y quién');
  await shot(e, '03-anotado-m', true);

  // Segunda vez: se completa con lo de la última vez, escalado a lo que salió.
  await elegir(e.locator('.el-form > select.el-sel'), 'Milanesa de nalga');
  await e.fill('.el-salio .el-cant', '50');
  await e.locator('.el-salio .el-cant').dispatchEvent('change');
  await e.waitForTimeout(100);
  filas = e.locator('.el-fila');
  const vals = await filas.locator('.el-cant').evaluateAll(xs => xs.map(x => x.value));
  ok(await filas.count() === 2 && vals[0] === '10' && vals[1] === '1', 'la segunda vez completa con lo de la última vez para 50 (10 kg y 1 kg) · ' + vals.join(','));
  ok(/última vez/.test(await e.locator('.el-pista').innerText()), 'avisa que se completó con la última vez');
  await shot(e, '04-completado-m', true);

  // Usé hoy
  await e.locator('.el-seg [data-modo="uso"]').click();
  await elegir(e.locator('.el-fila select.el-sel').first(), 'Papas en bolsa');
  await e.locator('.el-fila .el-cant').first().fill('2');
  await e.locator('.el-mas').click();
  await elegir(e.locator('.el-fila select.el-sel').nth(1), 'Jamón cocido');
  await e.locator('.el-fila select.el-uni').nth(1).selectOption({ label: 'g' });
  await e.locator('.el-fila .el-cant').nth(1).fill('500');
  await shot(e, '05-use-hoy-m', true);
  await e.locator('.el-guardar').click();
  await e.waitForFunction(() => document.querySelectorAll('.el-reg').length === 3);
  r = db.rpc[db.rpc.length - 1];
  ok(r.p_producto === null && r.p_cantidad === null && r.p_items.length === 2 && r.p_items[1].cantidad === 0.5, 'uso del día: sin producto, 2 kg de papas y 0,5 kg de jamón');
  ok(/Uso del día/.test(await e.locator('.el-reg').first().innerText()), 'el uso del día queda arriba en lo anotado hoy');
  await shot(e, '06-historial-m', true);
  // Borrar lo de hoy
  const idUso = await e.locator('.el-reg').first().getAttribute('data-reg');
  await e.locator('.el-reg').first().locator('.el-borrar').click();
  await e.waitForFunction(() => document.querySelectorAll('.el-reg').length === 2);
  ok(db.rpc.some(x => x.borrar === idUso), 'borra lo de hoy en el servidor');
  // Validaciones
  await e.locator('.el-seg [data-modo="elaboracion"]').click();
  await e.locator('.el-guardar').click();
  ok(/Elegí qué preparaste/.test(await e.locator('.toast').last().innerText().catch(() => '')), 'sin producto avisa');
  await cE.close();

  // ===== Gerencia · PC: Stock → Elaborados =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1366, height: 900 } }, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/stock');
  await g.waitForSelector('.subnav-b');
  ok(await g.locator('.subnav-b', { hasText: 'Elaborados' }).count() === 1, 'Stock tiene la pestaña Elaborados');
  await g.locator('.subnav-b', { hasText: 'Elaborados' }).click();
  await g.waitForSelector('.el-form select.el-sel');
  ok(await g.locator('.side-link.is-active').innerText() === 'Stock', 'en gerencia queda marcado Stock en el menú');
  await elegir(g.locator('.el-form > select.el-sel'), 'Jamón feteado');
  await g.fill('.el-salio .el-cant', '2');
  await g.locator('.el-salio .el-cant').dispatchEvent('change');
  await g.waitForTimeout(100);
  const gv = await g.locator('.el-fila .el-cant').evaluateAll(xs => xs.map(x => x.value));
  ok(/receta/.test(await g.locator('.el-pista').innerText()) && gv[0] === '2,1', 'gerencia completa con la receta (2 kg feteado → 2,1 kg de jamón) · ' + gv.join(','));
  await shot(g, '07-gerencia-pc', true);
  await cG.close();

  // ===== Sin 0014 =====
  db.sql = false;
  const { c: cV, p: v } = await nuevo({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, U_ENC, { nombre: 'Maru' });
  await v.goto(BASE + '#/elaborados');
  await v.waitForSelector('.el-form select.el-sel');
  ok(/no está activado/.test(await v.locator('.banner').innerText()), 'sin 0014 avisa que no está activado');
  const antes = db.rpc.length;
  await elegir(v.locator('.el-fila select.el-sel').first(), 'Papas en bolsa');
  await v.locator('.el-seg [data-modo="uso"]').click();
  await elegir(v.locator('.el-fila select.el-sel').first(), 'Papas en bolsa');
  await v.locator('.el-fila .el-cant').first().fill('1');
  await v.locator('.el-guardar').click();
  ok(db.rpc.length === antes, 'sin 0014 no intenta guardar');
  await cV.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
