#!/usr/bin/env node
// Prueba de punta a punta de insumos por bulto (manual, no corre en CI). Servidor estático y API de Supabase mockeada.
// Gerencia (PC): Catálogo → Papas en bolsa pasa de "paquete" a "bolsa de 5 kg, se mide en kg" convirtiendo lo cargado
// (2 paquetes → 10 kg); Recetas → Papas Fritas Provenzal lleva 200 g de papas (se guarda 0,2 kg); insumo nuevo comprado
// por bolsa; Stock muestra kg y bolsas. Encargado (iPhone): Pedir muestra "bolsa de 5 kg" y lo que queda en bolsas y kg.
// Uso: node scripts/e2e-bulto.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/bulto');
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
const PRV = 'prv-verdu';
let seq = 0;
const prod = (nombre, cat, uu, extra = {}) => ({ id: 'p' + (++seq), codigo: 'UMO-' + String(100 + seq), nombre, local_id: L1, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: PRV, par: null, es_elaborado: false, activo: true, oculto: false, ...extra });
const P = {
  papas: prod('Papas en bolsa', 'Verdulería', 'paquete', { par: 3 }),
  ajo: prod('Ajo', 'Verdulería', 'kg'),
  aceite: prod('Aceite girasol', 'Almacén', 'litro', { unidad_compra: 'bidón', factor_conversion: 5 }),
  plato: prod('Papas Fritas Provenzal', 'Carta', 'porción', { codigo: 'PLA-GUA-002', unidad_compra: null, es_elaborado: true, proveedor_id: null })
};
const db = {
  stock: new Map([[P.papas.id, 2], [P.ajo.id, 1.5], [P.aceite.id, 12]]),
  recetas: [], rpc: [], log: []
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
    if (t === 'productos') {
      if (req.method() === 'PATCH') { const id = eq(q.get('id')); Object.assign(Object.values(P).find(p => p.id === id), body()); return json([{ id }]); }
      if (req.method() === 'POST') { const b = body(); const x = { id: 'p' + (++seq), oculto: false, par: null, ...(Array.isArray(b) ? b[0] : b) }; P['n' + seq] = x; db.rpc.push({ nuevo: x }); return json([{ id: x.id }]); }
      return json(Object.values(P));
    }
    if (t === 'stock_actual') return json([...db.stock].map(([pid, s]) => ({ local_id: L1, producto_id: pid, stock: s })));
    if (t === 'recetas') return json(db.recetas);
    if (t === 'rpc/guardar_receta') {
      const b = body(); db.rpc.push(b);
      db.recetas = db.recetas.filter(r => r.producto_id !== b.p_producto).concat([{ id: 'r' + (++seq), producto_id: b.p_producto, rinde: b.p_rinde, estimada: false, receta_items: b.p_items }]);
      return json(null);
    }
    if (t === 'rpc/cambiar_presentacion') {
      const b = body(); db.rpc.push(b);
      const p = Object.values(P).find(x => x.id === b.p_producto);
      Object.assign(p, { unidad_compra: b.p_unidad_compra, unidad_uso: b.p_unidad_uso, factor_conversion: b.p_factor });
      if (p.par != null) p.par = p.par * b.p_escala;
      if (db.stock.has(p.id)) db.stock.set(p.id, db.stock.get(p.id) * b.p_escala);
      return json({ movimientos: 3, recetas: 0 });
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
  // 1) Catálogo: Papas en bolsa → bolsa de 5 kg, se mide en kg; lo cargado se convierte.
  await g.goto(BASE + '#/catalogo');
  await g.locator('[aria-label="Editar Papas en bolsa"]').click();
  await g.waitForSelector('#f-uc');
  ok(/Se compra y se cuenta por paquete/.test(await g.locator('.pres-txt').innerText()), 'antes: se compra y se cuenta por paquete');
  await g.fill('#f-uc', 'bolsa');
  await g.locator('#f-uu').selectOption('kg');
  await g.fill('#f-factor', '5');
  await g.locator('#f-factor').dispatchEvent('input');
  const pres = await g.locator('.pres-txt').innerText();
  ok(/1 bolsa = 5 kg/.test(pres) && /recetas se carga en g/.test(pres), 'explica: 1 bolsa = 5 kg y recetas en g · ' + pres);
  ok(await g.locator('.pres-conv').isVisible() && /1 paquete pasa a 5 kg/.test(await g.locator('.pres-conv').innerText()), 'ofrece convertir lo cargado (1 paquete → 5 kg)');
  await hojaShot(g, '01-catalogo-bolsa-5kg-pc');
  await g.locator('.form .btn-primary').last().click();
  await g.waitForSelector('dialog[open]', { state: 'detached' }).catch(() => {});
  let r = db.rpc.find(x => x.p_producto === P.papas.id && x.p_escala);
  ok(r && r.p_unidad_compra === 'bolsa' && r.p_unidad_uso === 'kg' && r.p_factor === 5 && r.p_escala === 5, 'llama a cambiar_presentacion con bolsa/kg/5 y escala 5');
  ok(P.papas.unidad_compra === 'bolsa' && P.papas.unidad_uso === 'kg' && P.papas.factor_conversion === 5 && P.papas.par === 15, 'el producto queda bolsa de 5 kg y la cantidad ideal pasa de 3 paquetes a 15 kg · par ' + P.papas.par);
  ok(db.stock.get(P.papas.id) === 10, 'el stock pasa de 2 paquetes a 10 kg');

  // 1b) "Dejar los números como están": no convierte.
  await g.locator('[aria-label="Editar Ajo"]').click();
  await g.waitForSelector('#f-uc');
  await g.fill('#f-uc', 'bolsa'); await g.fill('#f-factor', '1'); await g.locator('#f-factor').dispatchEvent('input');
  ok(!(await g.locator('.pres-conv').isVisible()), 'si la medida de uso no cambia (sigue en kg) no hay nada que convertir');
  await g.locator('.form .btn-primary').last().click();
  await g.waitForTimeout(300);
  ok(P.ajo.unidad_compra === 'bolsa' && P.ajo.unidad_uso === 'kg' && P.ajo.factor_conversion === 1 && !db.rpc.some(x => x.p_producto === P.ajo.id), 'ajo: bolsa de 1 kg sin convertir nada');

  // 2) Recetas: Papas Fritas Provenzal = 200 g de papas.
  await g.goto(BASE + '#/recetas');
  await g.locator('[aria-label="Receta de Papas Fritas Provenzal"]').click();
  await g.locator('button', { hasText: 'Agregar insumo' }).click();
  await g.fill('[aria-label="Buscar insumo"]', 'papas');
  const opTxt = await g.locator('[aria-label="Agregar Papas en bolsa"]').innerText();
  ok(/bolsa de 5 kg/.test(opTxt), 'el buscador muestra "bolsa de 5 kg" · ' + opTxt.replace(/\n/g, ' / '));
  await g.locator('[aria-label="Agregar Papas en bolsa"]').click();
  const inPapas = g.locator('[aria-label="Cantidad de Papas en bolsa en g"]');
  ok(await inPapas.inputValue() === '100', 'arranca en 100 g');
  await inPapas.fill('200'); await inPapas.dispatchEvent('change');
  const filaTxt = await g.locator('.ins').first().innerText();
  ok(/bolsa de 5 kg · alcanza para 25/.test(filaTxt), 'muestra que una bolsa de 5 kg alcanza para 25 platos · ' + filaTxt.replace(/\n/g, ' / '));
  // Insumo nuevo comprado por bolsa: Perejil, bolsa de 1 kg, 5 g por plato.
  await g.locator('button', { hasText: 'Agregar insumo' }).click();
  await g.fill('[aria-label="Buscar insumo"]', 'perejil');
  await g.locator('button', { hasText: 'Crear «perejil»' }).click();
  await g.waitForSelector('#n-bulto');
  ok(/Cuánto lleva la receta \(g\)/.test(await g.locator('label.field', { has: g.locator('#n-cant') }).innerText()), 'insumo nuevo: la cantidad se pide en gramos');
  await g.fill('#n-cant', '5');
  await g.fill('#n-bulto', 'bolsa'); await g.locator('#n-bulto').dispatchEvent('input');
  await g.fill('#n-cont', '1');
  ok(/Cada bolsa trae \(kg\)/.test(await g.locator('label.field', { has: g.locator('#n-cont') }).innerText()), 'insumo nuevo: "Cada bolsa trae (kg)"');
  await hojaShot(g, '03-insumo-nuevo-bolsa-pc');
  await g.locator('button', { hasText: 'Crear y sumar a la receta' }).click();
  await g.waitForSelector('[aria-label="Cantidad de Perejil en g"]');
  const nuevoIns = db.rpc.find(x => x.nuevo);
  ok(nuevoIns && nuevoIns.nuevo.unidad_compra === 'bolsa' && nuevoIns.nuevo.unidad_uso === 'kg' && nuevoIns.nuevo.factor_conversion === 1, 'perejil se crea como bolsa de 1 kg medido en kg');
  await hojaShot(g, '02-receta-200g-pc');
  await g.locator('button', { hasText: 'Guardar receta' }).click();
  await g.waitForTimeout(300);
  r = db.rpc.find(x => x.p_producto === P.plato.id);
  const it = r && r.p_items.find(i => i.insumo_id === P.papas.id);
  ok(it && it.cantidad === 0.2, '200 g de papas se guardan como 0,2 kg · ' + JSON.stringify(r && r.p_items));
  ok(r && r.p_items.some(i => i.cantidad === 0.005), '5 g de perejil se guardan como 0,005 kg');

  // 3) Stock: 10 kg = 2 bolsas; cantidad ideal 15 kg → pedir 1 bolsa.
  db.stock.set(P.papas.id, 9.6);
  await g.goto(BASE + '#/stock');
  const card = g.locator(`[data-prod="${P.papas.id}"]`);
  await card.waitFor();
  const cTxt = await card.innerText();
  ok(/Quedan 1,9 bolsas de 5 kg/.test(cTxt), 'stock muestra kg y "Quedan 1,9 bolsas de 5 kg"');
  ok(/Pedir 2 bolsas/.test(cTxt), 'el sugerido se dice en bolsas (15 − 9,6 = 5,4 kg → 2 bolsas) · ' + cTxt.replace(/\n/g, ' / '));
  await card.screenshot({ path: path.join(OUT, '04-stock-bolsas-pc.png') });
  await cG.close();

  // ===== Encargado · iPhone: Pedir =====
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U_ENC, { nombre: 'Ruth' });
  await e.goto(BASE + '#/pedir');
  await e.waitForSelector('.prod');
  await e.fill('input[type="search"]', 'papas');
  await e.waitForTimeout(400);
  const fila = e.locator(`.prod[data-id="${P.papas.id}"]`);
  const fTxt = await fila.innerText();
  ok(/bolsa de 5 kg/.test(fTxt) && /Quedan\s+1,9 bolsas \(9,6 kg\)/.test(fTxt), 'Pedir: "bolsa de 5 kg" y "Quedan 1,9 bolsas (9,6 kg)" · ' + fTxt.replace(/\n/g, ' / '));
  await shot(e, '05-pedir-bolsa-m');
  await cE.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
