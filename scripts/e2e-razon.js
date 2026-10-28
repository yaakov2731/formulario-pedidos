#!/usr/bin/env node
// Prueba de punta a punta de la razón social por local en las órdenes a proveedores (manual, no corre en CI). Servidor estático y
// API de Supabase mockeada con page.route. Gerencia (PC y iPhone): Catálogo → Locales edita razón social y CUIT; el envío por
// WhatsApp (mensaje + imagen) y la impresión dicen "Facturar a …" por local y el código del mayorista en cada producto; "Todo junto" suma por razón social. Sin 0013, como antes.
// Uso: node scripts/e2e-razon.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/codigo-proveedor');
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
const LOC = { umo: 'loc-umo', gel: 'loc-gel', shp: 'loc-shp' };
const U_GER = 'usr-ger';
const PV = 'pv-ds';
const db = {
  columna: true,
  locales: [
    { id: LOC.umo, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth Coronel'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null },
    { id: LOC.gel, codigo: 'GEL', nombre: 'Gelato', encargados: ['Sofía'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null },
    { id: LOC.shp, codigo: 'SHP', nombre: 'Shopping', encargados: ['Carla'], activo: true, razon_social: 'SPMAR S.A.', cuit: null }],
  provs: [{ id: PV, nombre: 'Distri Stock Mayorista', whatsapp: '5491155550000', contacto: 'Diego', activo: true }],
  productos: [], ordenes: [], items: [], log: []
};
let seq = 0;
const prod = (local, cod, nombre, unidad) => { const p = { id: 'p' + (++seq), codigo: `${local.toUpperCase()}-DS-${cod}`, nombre, local_id: LOC[local], categoria: 'Limpieza', unidad_compra: unidad, unidad_uso: unidad, factor_conversion: 1, proveedor_id: PV, par: null, es_elaborado: false, activo: true, oculto: false }; db.productos.push(p); return p; };
const orden = (local, quien, lineas) => {
  const id = 'ord-' + local; db.ordenes.push({ id, local_id: LOC[local], proveedor_id: PV, estado: 'aprobada', creado_en: '2026-10-27T13:00:00Z', cargado_por_nombre: quien, nota: null });
  lineas.forEach(([p, c]) => db.items.push({ id: 'it' + (++seq), orden_id: id, producto_id: p.id, cantidad_pedida: c, excluido: false }));
};
orden('umo', 'Ruth Coronel', [[prod('umo', 'LAVAN', 'Lavandina x 5 litros', 'bidón'), 2], [prod('umo', 'F100', 'B.aluminio f100 x 100 unidades', 'paquete'), 3]]);
orden('gel', 'Sofía', [[prod('gel', 'LAVAN', 'Lavandina x 5 litros', 'bidón'), 1], [prod('gel', 'POTE1', 'Pote térmico 1 kg x 25', 'paquete'), 4]]);
orden('shp', 'Carla', [[prod('shp', 'LAVAN', 'Lavandina x 5 litros', 'bidón'), 3], [prod('shp', 'CONS80', 'Bolsa consorcio 80x110 x 10', 'paquete'), 6], [prod('shp', 'PANU6-B', 'Paño multiuso x 6', 'paquete'), 2]]);
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
const enLista = (v) => (v && v.startsWith('in.(') ? v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')) : null);
async function montarApi(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(q), b: body() });
    if (u.pathname === '/auth/v1/user') return json(sesion(U_GER).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_GER));
    if (t === 'perfiles') return json([{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }]);
    if (t === 'locales') {
      if (req.method() === 'PATCH') { const l = db.locales.find(x => x.id === eq(q.get('id'))); Object.assign(l, body()); return json([{ id: l.id }]); }
      if (!db.columna && /razon_social/.test(q.get('select') || '')) return json({ code: '42703', message: 'column locales.razon_social does not exist' }, 400);
      return json(db.columna ? db.locales : db.locales.map(({ razon_social, cuit, ...r }) => r));
    }
    if (t === 'productos') return json(db.productos);
    if (t === 'proveedores_basico' || t === 'proveedores') return json(db.provs);
    if (t === 'ordenes_compra') {
      if (req.method() === 'PATCH') { const o = db.ordenes.find(x => x.id === eq(q.get('id'))); Object.assign(o, body()); return json([{ id: o.id }]); }
      let r = db.ordenes; const est = enLista(q.get('estado')); if (est) r = r.filter(o => est.includes(o.estado));
      return json(r.map(o => ({ ...o, orden_items: db.items.filter(i => i.orden_id === o.id).map(({ orden_id, ...i }) => i) })));
    }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = (p, n, full = false) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full });

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const nuevo = async (opts) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    await c.addInitScript((s) => {
      window.print = () => {}; window.confirm = () => false;
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
    }, sesion(U_GER));
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|400 \(Bad Request\)/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p };
  };
  const guardarImagen = async (p, n) => {
    const b64 = await p.locator('.orden-img img').evaluate(async (img) => { const r = await fetch(img.src); const b = new Uint8Array(await r.arrayBuffer()); let s = ''; b.forEach(x => { s += String.fromCharCode(x); }); return btoa(s); });
    fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(b64, 'base64'));
  };

  // ===== Gerencia · PC: Catálogo → Locales =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1366, height: 900 } });
  await g.goto(BASE + '#/locales');
  await g.waitForSelector('#view [data-local]');
  const txt = await g.locator('#view .lista').innerText();
  ok(/Factura a SPMAR S\.A\./.test(txt) && (txt.match(/Factura a SUMA ACTIVA S\.A\./g) || []).length === 2, 'Locales: Shopping factura a SPMAR y los de gastronomía a SUMA ACTIVA');
  ok(await g.locator('.subnav-b.is-on').innerText() === 'Locales', 'Locales está dentro de Catálogo');
  await shot(g, '01-locales-pc');
  await g.locator('[data-local="UMO"]').click();
  await g.waitForSelector('#lc-cuit');
  await shot(g, '02-locales-editar-pc');
  await g.fill('#lc-cuit', '301234');
  await g.locator('.sheet button.btn-primary').click();
  ok(/11 números/.test(await g.locator('.sheet .form-err').innerText()), 'CUIT mal escrito: avisa');
  await g.fill('#lc-cuit', '30712345678');
  await g.locator('.sheet button.btn-primary').click();
  await g.waitForTimeout(400);
  ok(db.locales[0].cuit === '30-71234567-8', 'guarda el CUIT con guiones en el servidor');

  // ===== Por proveedor: enviar por WhatsApp =====
  await g.goto(BASE + '#/pedidos');
  await g.waitForSelector('[data-vista="proveedor"]');
  await g.locator('[data-vista="proveedor"]').click();
  await g.locator('#view button', { hasText: 'Enviar por WhatsApp' }).first().click();
  await g.waitForSelector('.orden-img img');
  const alt = () => g.locator('.orden-img img').getAttribute('alt');
  ok(/^Hola .*Docks del Puerto.*\(Gelato, Shopping, Umo Grill\)\. Va todo en la imagen\. ¡Gracias!$/.test(await g.locator('[data-aviso]').innerText()), 'mensaje: solo el saludo con los locales, sin la lista');
  let msg = await alt();
  ok(/Umo Grill\nFacturar a SUMA ACTIVA S\.A\. · CUIT 30-71234567-8/.test(msg), 'mensaje: Umo factura a SUMA ACTIVA con CUIT');
  ok(/Gelato\nFacturar a SUMA ACTIVA S\.A\. · CUIT 30-71234567-8/.test(msg) && /Shopping\nFacturar a SPMAR S\.A\./.test(msg), 'mensaje: Gelato a SUMA ACTIVA y Shopping a SPMAR');
  ok(/• 2 bidón Lavandina x 5 litros · Cód\. LAVAN\n/.test(msg) && /Pote térmico 1 kg x 25 · Cód\. POTE1/.test(msg) && /Cód\. PANU6\n/.test(msg), 'mensaje: cada producto lleva el código del mayorista (sin LOCAL-DS- ni -B)');
  await guardarImagen(g, '03-orden-imagen-por-local');
  await shot(g, '04-enviar-por-local-pc');
  await g.locator('.sheet .seg-b', { hasText: 'Todo junto' }).click();
  await g.waitForFunction(() => /Gelato \+ Umo Grill/.test((document.querySelector('.orden-img img') || {}).alt || ''));
  msg = await alt();
  ok(/Shopping\nFacturar a SPMAR S\.A\./.test(msg) && /Gelato \+ Umo Grill\nFacturar a SUMA ACTIVA S\.A\. · CUIT 30-71234567-8/.test(msg), 'Todo junto: un bloque por razón social');
  ok(/3 bidón Lavandina x 5 litros · Cód\. LAVAN \(Gelato 1 · Umo Grill 2\)/.test(msg) && /• 3 bidón Lavandina x 5 litros · Cód\. LAVAN\n/.test(msg), 'Todo junto: suma solo dentro de la misma razón social · ' + (msg.match(/.*Lavandina.*/g) || []).join(' | '));
  await guardarImagen(g, '05-orden-imagen-todo-junto');
  await g.keyboard.press('Escape');

  // ===== Impresión =====
  await g.emulateMedia({ media: 'print' });
  await g.locator('#view [data-accion="imprimir"]').first().click();
  await g.waitForSelector('.print-area .pr-factura');
  const fact = await g.locator('.print-area .pr-factura').allInnerTexts();
  ok(fact.length === 3 && fact.filter(x => /SUMA ACTIVA/.test(x)).length === 2 && fact.some(x => /SPMAR/.test(x)), 'impresión: "Facturar a" en cada local · ' + fact.join(' | '));
  const cods = await g.locator('.print-area .pr-cod').allInnerTexts();
  ok(cods.includes('LAVAN') && cods.includes('CONS80') && cods.includes('PANU6'), 'impresión: código del mayorista en cada producto · ' + cods.join(' '));
  await g.pdf({ path: path.join(OUT, '06-impresion.pdf'), format: 'A4', landscape: true, printBackground: true }).catch(() => {});
  await g.emulateMedia({ media: 'screen' });
  await cG.close();

  // ===== iPhone: Locales =====
  const { c: cM, p: m } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto(BASE + '#/locales');
  await m.waitForSelector('#view [data-local]');
  await shot(m, '07-locales-m');
  await cM.close();

  // ===== Sin la columna (0013 sin correr): las órdenes salen como antes =====
  db.columna = false;
  const { c: cV, p: v } = await nuevo({ viewport: { width: 1366, height: 900 } });
  await v.goto(BASE + '#/locales');
  await v.waitForSelector('#view [data-local]');
  ok(/Falta pegar el SQL/.test(await v.locator('#view').innerText()) && await v.locator('[data-local="UMO"]').isDisabled(), 'sin 0013 Locales avisa y no deja editar');
  await v.goto(BASE + '#/pedidos');
  await v.waitForSelector('[data-vista="proveedor"]');
  await v.locator('[data-vista="proveedor"]').click();
  await v.locator('#view button', { hasText: 'Enviar por WhatsApp' }).first().click();
  await v.waitForSelector('.orden-img img');
  ok(!/Facturar/.test(await v.locator('.orden-img img').getAttribute('alt')), 'sin 0013 el pedido sale como antes');
  await cV.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
