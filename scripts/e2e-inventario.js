#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI). API de Supabase mockeada con page.route.
// Stock único (inventario.js): el encargado ve qué hay, dónde está y qué entró hoy; cambia el lugar desde el producto;
// gerencia ve la misma lista con Ajustar. Con ROOT=<carpeta> saca las capturas de "antes" de otra copia del repo.
// Uso: node scripts/e2e-inventario.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = process.env.ROOT || path.join(__dirname, '..');
const ANTES = !!process.env.ROOT;
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/stock-unico');
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
  vacio: prod('Vacío', 'Carnes', 'kg', { lugar: 'Cámara', orden_lugar: 1001 }),
  bife: prod('Bife de chorizo', 'Carnes', 'kg', { lugar: 'Cámara', orden_lugar: 1002 }),
  crema: prod('Crema de leche', 'Lácteos', 'litro', { lugar: 'Heladera', orden_lugar: 2001 }),
  capricho: prod('Minitorta Capricho x4', 'Pastelería', 'unidad', { unidad_compra: 'caja', factor_conversion: 4, lugar: 'Heladera', orden_lugar: 2002 }),
  papas: prod('Papas en bolsa', 'Verdulería', 'kg', { unidad_compra: 'bolsa', factor_conversion: 5, lugar: 'Depósito', orden_lugar: 3001 }),
  jamon: prod('Jamón cocido', 'Fiambres', 'kg'),
  coca: prod('Coca-Cola 500', 'Bebidas', 'unidad'),
  limon: prod('Limón', 'Verdulería', 'kg'),
  sal: prod('Sal fina', 'Almacén', 'kg')
};
const stockIni = { vacio: 6.5, bife: 4, crema: 2, capricho: 9, papas: 12.5, jamon: 4.1, coca: 24, limon: 0, sal: 3 };
const db = { stock: new Map(Object.entries(stockIni).map(([k, v]) => [P[k].id, v])), ubicar: [] };
const hoy = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const hace = (dias, h = 15) => { const d = new Date(Date.now() - dias * 864e5); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const ORD = 'ord-criollo', ORD2 = 'ord-carnes';
const mov = (k, tipo, cantidad, creado_en, nota = null, ref_id = null) => ({ producto_id: P[k].id, local_id: L1, tipo, cantidad, creado_en, nota, ref_id });
const MOVS = [
  mov('jamon', 'recepcion', 4.1, hoy(12, 5), 'Recepción con factura 0006-00375793', ORD),
  mov('crema', 'recepcion', 2, hoy(12, 5), 'Recepción con factura 0006-00375793', ORD),
  mov('papas', 'recepcion', 10, hoy(12, 5), 'Recepción con factura 0006-00375793', ORD),
  mov('vacio', 'recepcion', 5, hace(1, 11), 'Recepción', ORD2),
  mov('bife', 'recepcion', 5, hace(2, 11), 'Recepción', ORD2),
  mov('bife', 'venta', -1, hace(1, 23), 'Ventas (platos)'),
  mov('vacio', 'venta', -1.5, hace(1, 23), 'Ventas (platos)'),
  mov('limon', 'venta', -0.75, hace(1, 23), 'Ventas (platos)'),
  mov('coca', 'ajuste_conteo', -2, hace(3, 10), 'Conteo')
];
const CONTEOS = [{ id: 'c1', local_id: L1, encargado: 'Lucas', tipo: 'apertura', creado_en: hace(3, 10), items: [{ producto_id: P.coca.id, contado: 24 }, { producto_id: P.sal.id, contado: 3 }, { producto_id: P.capricho.id, contado: 9 }, { producto_id: P.vacio.id, contado: 3 }] }];
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
    const u = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: 'Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json([{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true, razon_social: 'SUMA ACTIVA S.A.' }]);
    if (t === 'productos') return json(Object.values(P).map(p => ({ ...p })));
    if (t === 'stock_actual') return json([...db.stock].map(([pid, s]) => ({ local_id: L1, producto_id: pid, stock: s })));
    if (t === 'movimientos') return json(MOVS);
    if (t === 'conteos') return json(CONTEOS);
    if (t === 'ordenes_compra') return json([{ id: ORD, local_id: L1, proveedor_id: 'pv1', estado: 'recibida', creado_en: hace(1), orden_items: [] }, { id: ORD2, local_id: L1, proveedor_id: 'pv2', estado: 'recibida', creado_en: hace(3), orden_items: [] }]);
    if (t === 'proveedores_basico' || t === 'proveedores') return json([{ id: 'pv1', nombre: 'El Criollo', activo: true }, { id: 'pv2', nombre: 'Carnes del Sur', activo: true }]);
    if (t === 'rpc/ubicar_productos') {
      const b = JSON.parse(req.postData() || '{}'); db.ubicar.push(b.p_items);
      for (const it of b.p_items) { const p = Object.values(P).find(x => x.id === it.id); if (p) { p.lugar = it.lugar; p.orden_lugar = it.orden; } }
      return json(b.p_items.length);
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

  const PC = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 };
  if (ANTES) {
    const { c, p } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
    await p.goto(BASE + '#/contar'); await p.waitForSelector('.cnt-prod, .lug-card'); await shot(p, 'antes-01-encargado-contar-m');
    await c.close();
    const g = await nuevo(PC, U_GER, { 'g:local': L1 });
    await g.p.goto(BASE + '#/stock'); await g.p.waitForSelector('.prod-stk'); await g.p.waitForTimeout(400); await shot(g.p, 'antes-02-gerencia-stock-pc');
    await g.c.close();
    await browser.close(); srv.close(); process.exit(0);
  }

  // ===== Encargado: Stock =====
  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
  await e.goto(BASE + '#/stock');
  await e.waitForSelector('.inv-fila');
  await e.waitForTimeout(300);
  ok(await e.locator('[data-nav="stock"].is-active').count() > 0 && await e.locator('[data-nav="contar"]').count() === 0, 'el menú del encargado tiene Stock (Contar se entra desde ahí)');
  const kv = async (id) => Number(await e.locator(`.inv-k-${id} .inv-kv`).innerText());
  ok(await kv('hay') === 8 && await kv('hoy') === 3 && await kv('cero') === 1, `filtros: Hay 8 · Entró hoy 3 · En cero 1 (${await kv('hay')}/${await kv('hoy')}/${await kv('cero')})`);
  const grupos = await e.locator('.inv-gt span').allTextContents();
  ok(JSON.stringify(grupos) === JSON.stringify(['Cámara', 'Heladera', 'Depósito', 'Sin lugar']), 'agrupado por lugar en el orden del recorrido · ' + grupos.join(', '));
  const fJamon = e.locator(`.inv-fila[data-prod="${P.jamon.id}"]`);
  ok(/Entró \+4,1 de El Criollo · hoy 12:05/.test(await fJamon.innerText()) && await fJamon.evaluate(x => x.classList.contains('is-hoy')), 'lo recibido hoy dice cuánto, de quién y a qué hora');
  ok(/Contado/.test(await e.locator(`.inv-fila[data-prod="${P.coca.id}"]`).innerText()), 'muestra cuándo se contó');
  ok(/2 bolsas \+ 2,5 kg/.test(await e.locator(`.inv-fila[data-prod="${P.papas.id}"]`).innerText()), 'lo que viene por bulto dice también cuántos bultos enteros (12,5 kg = 2 bolsas + 2,5 kg)');
  ok(!/\$/.test(await e.locator('.inv').innerText()), 'sin precios');
  await shot(e, '01-encargado-stock-m');
  await e.locator('.inv-k-hoy').click();
  ok(await e.locator('.inv-fila').count() === 3, 'Entró hoy: solo lo recibido hoy');
  await shot(e, '02-encargado-entro-hoy-m');
  // Ponerle lugar al jamón desde su hoja.
  await fJamon.click();
  await e.waitForSelector('.inv-det');
  ok(/Quedan/.test(await e.locator('.inv-det').textContent()) && /Recepción con factura/.test(await e.locator('.inv-movs').innerText()), 'la hoja muestra cuánto hay y los movimientos');
  ok(await e.locator('[data-ajuste]').count() === 0, 'el encargado no tiene Ajustar');
  await shot(e, '03-encargado-producto-m');
  await e.locator('.inv-lugares .chip[data-lugar="Heladera"]').click();
  await e.waitForSelector('.toast');
  ok(P.jamon.lugar === 'Heladera' && db.ubicar.length === 1, 'cambia el lugar con un toque (ubicar_productos)');
  await e.keyboard.press('Escape');
  await e.locator('.inv-k-hay').click();
  ok(await e.locator(`.inv-g[data-grupo="Heladera"] .inv-fila[data-prod="${P.jamon.id}"]`).count() === 1, 'el jamón ya aparece en Heladera');
  await e.locator('.inv-contar').click();
  await e.waitForSelector('.cnt-prod, .lug-card');
  ok(await e.locator('[data-nav="stock"].is-active').count() > 0 && await e.locator('.vista-head a', { hasText: 'Stock' }).count() === 1, 'Contar: sigue marcado Stock y tiene "← Stock"');
  await cE.close();

  // ===== Gerencia: Stock =====
  const { c: cG, p: g } = await nuevo(PC, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/stock');
  await g.waitForSelector('.inv-fila');
  await g.waitForFunction(() => /El Criollo/.test(document.querySelector('.inv') ? document.querySelector('.inv').innerText : ''), null, { timeout: 8000 }).catch(() => {});
  ok(/El Criollo/.test(await g.locator('.inv').innerText()), 'gerencia: misma lista con proveedor de lo recibido');
  await shot(g, '04-gerencia-stock-pc');
  await g.locator(`.inv-fila[data-prod="${P.bife.id}"]`).click();
  await g.waitForSelector('[data-ajuste]');
  ok(await g.locator('[data-ajuste]').count() === 3, 'gerencia: Ajustar (Conté / Se perdió / Entró) en la hoja del producto');
  await shot(g, '05-gerencia-producto-pc');
  await g.locator('[data-ajuste="merma"]').click();
  await g.waitForSelector('.seg-form');
  ok(await g.locator('.seg-form .seg-b.is-on').innerText() === 'Se perdió', 'abre el ajuste con Se perdió');
  await cG.close();
  const { c: cM, p: gm } = await nuevo(M, U_GER, { 'g:local': L1 });
  await gm.goto(BASE + '#/stock'); await gm.waitForSelector('.inv-fila'); await gm.waitForTimeout(400);
  await shot(gm, '06-gerencia-stock-m');
  await cM.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
