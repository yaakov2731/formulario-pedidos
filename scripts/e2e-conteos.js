#!/usr/bin/env node
// Prueba de punta a punta de Borrar conteos y lugares (manual, no corre en CI). API de Supabase mockeada con page.route.
// Encargado (iPhone): cuenta, ve el conteo de hoy, saca un producto mal contado y borra todo el conteo (borrar_conteo).
// Gerencia (PC y celular): Stock → Conteos lista los conteos del local con faltantes; saca un producto o borra el conteo.
// Gerencia · Lugares: borrar un lugar deja sus productos sin lugar.
// Uso: node scripts/e2e-conteos.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/borrar-conteos');
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
const db = { stock: new Map(Object.values(P).map(p => [p.id, 5])), conteos: [], rpc: [], ubicar: [], borrar: [], log: [], patch: [], usuarios: ['UMO'], authUsers: [],
  locales: [{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null }, { id: 'loc-eve', codigo: 'EVE', nombre: 'Eventos', encargados: [], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null }] };
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
    if (t === 'locales' && req.method() === 'PATCH') {
      const id = eq(q.get('id')); const l = db.locales.find(x => x.id === id); Object.assign(l, JSON.parse(req.postData() || '{}')); db.patch.push(JSON.parse(req.postData() || '{}'));
      return json([{ id }]);
    }
    if (t === 'locales') return json(db.locales.map(l => ({ ...l })));
    if (t === 'rpc/locales_login') return json(db.locales.filter(l => l.activo && db.usuarios.includes(l.codigo)).map(l => ({ codigo: l.codigo, nombre: l.nombre, encargados: l.encargados })));
    if (t === 'rpc/crear_local') {
      const b = JSON.parse(req.postData() || '{}'); const id = 'loc-' + b.p_codigo.toLowerCase();
      db.locales.push({ id, codigo: b.p_codigo, nombre: b.p_nombre, encargados: [], activo: true, razon_social: b.p_razon, cuit: b.p_cuit });
      return json(id);
    }
    if (t === 'rpc/vincular_encargado') { const b = JSON.parse(req.postData() || '{}'); const l = db.locales.find(x => x.id === b.p_local); const okv = db.authUsers.includes(l.codigo); if (okv) db.usuarios.push(l.codigo); return json(okv); }
    if (t === 'productos') return json(Object.values(P).map(p => ({ ...p })));
    if (t === 'stock_actual') return json([...db.stock].map(([pid, s]) => ({ local_id: L1, producto_id: pid, stock: s })));
    if (t === 'conteos') { const v = [...db.conteos].reverse(); return json(q.get('limit') === '1' ? v.slice(0, 1) : v); }
    if (t === 'rpc/borrar_conteo') {
      const b = JSON.parse(req.postData() || '{}'); db.borrar.push(b);
      const c = db.conteos.find(x => x.id === b.p_conteo);
      if (!c) return json({ message: 'Ese conteo ya no existe' }, 400);
      const antes = c.items.length;
      c.items = b.p_producto ? c.items.filter(x => x.producto_id !== b.p_producto) : [];
      if (!c.items.length) db.conteos = db.conteos.filter(x => x !== c);
      return json({ sacados: antes - c.items.length, recontados: 0, borrado: !c.items.length });
    }
    if (t === 'rpc/ubicar_productos') {
      const b = JSON.parse(req.postData() || '{}'); db.ubicar.push(b.p_items);
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Solo gerencia ordena los lugares' }, 403);
      for (const it of b.p_items) { const p = Object.values(P).find(x => x.id === it.id); if (p) { p.lugar = it.lugar; p.orden_lugar = it.orden; } }
      return json(b.p_items.length);
    }
    if (t === 'rpc/contar_local') {
      const b = JSON.parse(req.postData() || '{}'); db.rpc.push(b);
      const id = 'c' + (++seq);
      db.conteos.push({ id, local_id: b.p_local, encargado: b.p_encargado, items: b.p_items.map(x => ({ ...x, sistema: 5, dif: x.contado - 5 })), creado_en: new Date().toISOString() });
      return json(id);
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
  // Un conteo viejo (de hace 3 días), para gerencia.
  db.conteos.push({ id: 'c-viejo', local_id: L1, encargado: 'Lucas', creado_en: new Date(Date.now() - 3 * 864e5).toISOString(),
    items: [{ producto_id: P.nalga.id, contado: 2, sistema: 5, dif: -3 }, { producto_id: P.coca.id, contado: 30, sistema: 24, dif: 6 }, { producto_id: P.agua.id, contado: 12, sistema: 12, dif: 0 }] });

  // ===== Encargado · iPhone: el conteo viejo no se puede tocar; cuenta, ve el de hoy, saca uno y borra el resto =====
  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
  await e.goto(BASE + '#/contar');
  await e.waitForSelector('.cnt-prod');
  ok(await e.locator('.cnt-ver').count() === 0, 'un conteo de otro día no muestra "Ver o corregir" al encargado');
  await e.locator(`[data-id="${P.nalga.id}"] .cnt-in`).fill('40');
  await e.locator(`[data-id="${P.papas.id}"] .cnt-in`).fill('3');
  await e.locator(`[data-id="${P.coca.id}"] .cnt-in`).fill('24');
  await e.locator('.pill').click();
  await e.waitForSelector('.cnt-ver');
  ok(/3 productos/.test(await e.locator('.cnt-ult').innerText()), 'después de guardar: último conteo con 3 productos y "Ver o corregir"');
  await e.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(e, '01-contar-guardado-m');
  await e.locator('.cnt-ver').click();
  await e.waitForSelector('dialog.sheet .cnd-fila');
  const txt = await e.locator('dialog.sheet').innerText();
  ok(/Nalga/.test(txt) && /Contado: 40 kg/.test(txt) && /3 bolsas/.test(txt) && !/Sistema/.test(txt), 'la hoja muestra lo contado (papas en bolsas) y sigue a ciegas · ' + txt.replace(/\n/g, ' / '));
  await shot(e, '02-conteo-hoja-m');
  await e.locator(`dialog.sheet .cnd-fila[data-prod="${P.nalga.id}"] .cnd-sacar`).click();
  await e.waitForFunction((id) => !document.querySelector(`dialog.sheet .cnd-fila[data-prod="${id}"]`), P.nalga.id);
  const b1 = db.borrar[db.borrar.length - 1] || {};
  ok(b1.p_producto === P.nalga.id && await e.locator('dialog.sheet .cnd-fila').count() === 2, 'Sacar la nalga llama a borrar_conteo con ese producto y quedan 2');
  await e.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(e, '03-conteo-sacado-m');
  await e.locator('dialog.sheet .cat-borrar').click();
  await e.waitForFunction(() => !document.querySelector('dialog.sheet'));
  const b2 = db.borrar[db.borrar.length - 1] || {};
  ok(b2.p_producto === null && !db.conteos.some(x => x.local_id === L1 && x.id !== 'c-viejo'), 'Borrar todo el conteo lo elimina');
  await e.waitForFunction(() => !document.querySelector('.cnt-ver'));
  ok(/Último conteo/.test(await e.locator('.cnt-ult').innerText()) && await e.locator('.cnt-ver').count() === 0, 'vuelve a mostrar el conteo anterior (de otro día, sin corregir)');
  await cE.close();

  // ===== Gerencia · PC: Stock → Conteos =====
  db.conteos.push({ id: 'c-hoy', local_id: L1, encargado: 'Gerencia', creado_en: new Date().toISOString(), items: [{ producto_id: P.helado.id, contado: 1, sistema: 2, dif: -1 }] });
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/conteos');
  await g.waitForSelector('.cnd-card');
  ok(await g.locator('.subnav-b.is-on').innerText() === 'Conteos', 'Stock tiene la pestaña Conteos');
  ok(await g.locator('.cnd-card').count() === 2 && /1 con faltante · 1 con sobrante/.test(await g.locator('.cnd-card[data-conteo="c-viejo"]').innerText()), 'lista los 2 conteos con faltantes y sobrantes');
  await shot(g, '04-g-conteos-pc', true);
  await g.locator('.cnd-card[data-conteo="c-viejo"]').click();
  await g.waitForSelector('dialog.sheet .cnd-fila');
  ok(/Sistema 5 kg · faltaban 3 kg/.test(await g.locator('dialog.sheet').innerText()), 'gerencia ve lo que decía el sistema y la diferencia');
  await shot(g, '05-g-conteo-hoja-pc');
  await g.locator(`dialog.sheet .cnd-fila[data-prod="${P.coca.id}"] .cnd-sacar`).click();
  await g.waitForFunction((id) => !document.querySelector(`dialog.sheet .cnd-fila[data-prod="${id}"]`), P.coca.id);
  await g.locator('dialog.sheet .icon-btn[aria-label="Cerrar"]').click();
  ok(/2 productos/.test(await g.locator('.cnd-card[data-conteo="c-viejo"]').innerText()), 'gerencia saca la coca de un conteo viejo y la tarjeta queda con 2');
  await g.locator('.cnd-card[data-conteo="c-hoy"]').click();
  await g.waitForSelector('dialog.sheet .cnd-fila');
  await g.locator('dialog.sheet .cat-borrar').click();
  await g.waitForFunction(() => !document.querySelector('dialog.sheet'));
  ok(await g.locator('.cnd-card').count() === 1, 'borrar todo el conteo lo saca de la lista');

  // ===== Gerencia · Lugares: borrar un lugar =====
  P.nalga.lugar = 'Cámara'; P.nalga.orden_lugar = 1000; P.pollo.lugar = 'Cámara'; P.pollo.orden_lugar = 1001; P.coca.lugar = 'Barrra'; P.coca.orden_lugar = 2000;
  await g.evaluate(() => window.dispatchEvent(new Event('stock:salir')));
  await g.goto(BASE + '#/lugares'); await g.reload();
  await g.waitForSelector('.lug-sec[data-lugar="Barrra"]');
  await g.locator('.lug-sec[data-lugar="Barrra"] .lug-borrar').click();
  ok(await g.locator('.lug-sec[data-lugar="Barrra"]').count() === 0 && await g.locator(`.lug-sec.is-sin .lug-fila[data-id="${P.coca.id}"]`).count() === 1, 'borrar el lugar "Barrra" deja la coca sin lugar');
  await shot(g, '06-g-lugar-borrado-pc', true);
  await g.locator('.pill').click();
  await g.waitForSelector('.toast');
  const ub = db.ubicar[db.ubicar.length - 1] || [];
  ok(ub.length === 1 && ub[0].id === P.coca.id && ub[0].lugar === null, 'al guardar solo cambia la coca, sin lugar · ' + JSON.stringify(ub));
  await cG.close();

  // ===== Gerencia · Catálogo → Locales: nuevo local, conectar usuario, dar de baja =====
  const { c: cL, p: gl } = await nuevo(M, U_GER, { 'g:local': L1 });
  await gl.goto(BASE + '#/locales'); await gl.waitForSelector('.loc-nuevo');
  ok(/Sin usuario de encargado/.test(await gl.locator('[data-local="EVE"]').innerText()) && !/Sin usuario/.test(await gl.locator('[data-local="UMO"]').innerText()), 'marca los locales sin usuario de encargado');
  await gl.locator('.loc-nuevo').click();
  await gl.fill('#lc-nombre', 'Palermo');
  ok(await gl.inputValue('#lc-codigo') === 'PAL', 'el código se sugiere del nombre (PAL)');
  await gl.fill('#lc-cuit', '30-7123');
  await gl.locator('dialog.sheet[open] .btn-primary').click();
  ok(/11 números/.test(await gl.locator('dialog.sheet[open] .form-err').innerText()), 'CUIT incompleto: avisa');
  await gl.fill('#lc-cuit', '');
  await shot(gl, '08-g-local-nuevo-m');
  await gl.locator('dialog.sheet[open] .btn-primary').click();
  await gl.waitForSelector('dialog.sheet[open] .loc-usr-box');
  ok(db.locales.some(l => l.codigo === 'PAL' && l.razon_social === 'SUMA ACTIVA S.A.'), 'crea Palermo (PAL) con SUMA ACTIVA S.A.');
  ok(/local-pal@docks-stock\.app/.test(await gl.locator('dialog.sheet[open]').innerText()), 'explica qué usuario crear en Supabase');
  await gl.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(gl, '09-g-local-usuario-m');
  await gl.locator('dialog.sheet[open] .loc-usr-box button').click();
  await gl.waitForSelector('.toast');
  ok(db.usuarios.length === 1, 'sin el usuario en Supabase, Conectar avisa y no conecta');
  db.authUsers.push('PAL');
  await gl.locator('dialog.sheet[open] .loc-usr-box button').click();
  await gl.waitForFunction(() => !document.querySelector('dialog.sheet[open]'));
  ok(db.usuarios.includes('PAL') && !/Sin usuario/.test(await gl.locator('[data-local="PAL"]').innerText()), 'con el usuario creado, Conectar lo deja en Entrar');
  await gl.locator('[data-local="EVE"]').click();
  await gl.locator('dialog.sheet[open] .cat-borrar').click();
  await gl.waitForFunction(() => !document.querySelector('dialog.sheet[open]'));
  ok(db.locales.find(l => l.codigo === 'EVE').activo === false && /dado de baja/.test(await gl.locator('[data-local="EVE"]').innerText()), 'Eventos dado de baja (activo = false, no se borra)');
  ok(JSON.stringify(db.patch[db.patch.length - 1]) === '{"activo":false}', 'la baja solo cambia activo');
  await gl.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
  await shot(gl, '10-g-locales-m', true);
  await gl.goto(BASE + '#/conteos'); await gl.waitForSelector('.chips');
  ok(await gl.locator('.chips [data-local="loc-eve"]').count() === 0, 'el local dado de baja no aparece en el selector de local');
  await gl.goto(BASE + '#/locales'); await gl.waitForSelector('[data-local="EVE"]');
  await gl.locator('[data-local="EVE"]').click();
  await gl.locator('dialog.sheet[open] .cat-borrar').click();
  await gl.waitForFunction(() => !document.querySelector('dialog.sheet[open]'));
  ok(db.locales.find(l => l.codigo === 'EVE').activo === true, 'Volver a activar');
  await cL.close();

  // Celular gerencia
  const { c: cGm, p: gm } = await nuevo(M, U_GER, { 'g:local': L1 });
  await gm.goto(BASE + '#/conteos'); await gm.waitForSelector('.cnd-card');
  await gm.locator('.cnd-card').first().click(); await gm.waitForSelector('dialog.sheet .cnd-fila');
  await shot(gm, '07-g-conteo-hoja-m');
  await cGm.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
