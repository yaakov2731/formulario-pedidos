#!/usr/bin/env node
// Prueba de punta a punta de "Facturas que suben los locales" (manual, no corre en CI). Servidor estático y Supabase mockeado.
// Encargado (iPhone): pestaña Facturas → foto + proveedor + nota → sube a comprobantes/locales/<local>/ y crea la fila,
// sin ningún precio ni total en pantalla. Gerencia (PC): Recibir muestra la factura subida → «Leer y recibir» abre
// Recibir con factura con el local, la foto y el proveedor del encargado → confirmar la marca como recibida.
// Uso: node scripts/e2e-subir-factura.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/subir-factura');
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

const L1 = 'loc-umo', L2 = 'loc-tre';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const FLO = 'prv-florida', DS = 'prv-ds';
let seq = 0;
const prod = (nombre, uc, prov, extra = {}) => ({ id: 'p' + (++seq), codigo: 'UMO-' + String(100 + seq), nombre, local_id: L1, categoria: 'Verdura', unidad_compra: uc, unidad_uso: uc, factor_conversion: 1, proveedor_id: prov, par: null, es_elaborado: false, activo: true, oculto: false, ...extra });
const P = { tomate: prod('Tomate perita', 'kg', FLO), leche: prod('Leche entera', 'caja', FLO), muzza: prod('Queso mozzarella', 'kg', FLO), lavandina: prod('Lavandina 5 L', 'bidón', DS, { codigo: 'UMO-DS-4410' }) };
const FACTURA = {
  es_factura: true, proveedor: 'DISTRIB. FLO', cuit: null, tipo: 'Factura A', numero: '0004-00228899',
  fecha: '2026-10-28', vencimiento: '2026-11-07', subtotal: 98500, total: 119185,
  renglones: [
    { codigo: '1020', descripcion: 'TOMATE PERITA X KG', cantidad: 8, unidad: 'kg', precio_unitario: 2100, importe: 16800 },
    { codigo: '2210', descripcion: 'LECHE ENT. LS 1L CJ X12', cantidad: 2, unidad: 'cj', precio_unitario: 14400, importe: 28800 },
    { codigo: '4410', descripcion: 'LAVANDINA CONCENTRADA BIDON 5L', cantidad: 3, unidad: 'un', precio_unitario: 5300, importe: 15900 },
    { codigo: '3300', descripcion: 'MUZZARELLA HORMA LA PAULINA', cantidad: 4.2, unidad: 'kg', precio_unitario: 7500, importe: 31500 },
    { codigo: null, descripcion: 'FLETE', cantidad: 1, unidad: null, precio_unitario: 5500, importe: 5500 }
  ],
  observaciones: null
};
const db = { fl: [], subidas: [], rpc: [], patch: [], archivos: new Map() };
const subDe = (req) => { try { return JSON.parse(Buffer.from((req.headers().authorization || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch (_e) { return null; } };
function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
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
    const sub = subDe(req) || U_ENC;
    const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname === '/auth/v1/user') return json(sesion(sub).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(sub));
    if (u.pathname === '/functions/v1/leer-factura') {
      const txt = JSON.stringify(FACTURA); const lineas = [];
      for (let i = 0; i < txt.length; i += 40) lineas.push(JSON.stringify({ t: txt.slice(i, i + 40) }));
      lineas.push(JSON.stringify({ fin: true }));
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/x-ndjson' }, body: lineas.join('\n') + '\n' });
    }
    if (u.pathname.startsWith('/storage/v1/object/comprobantes/') && req.method() === 'POST') {
      const ruta = decodeURIComponent(u.pathname.replace('/storage/v1/object/comprobantes/', ''));
      if (rol === 'encargado' && !ruta.startsWith('locales/' + L1 + '/')) return json({ statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 400);
      // supabase-js manda el archivo como multipart: se guarda solo el JPEG de adentro.
      let buf = req.postDataBuffer() || Buffer.alloc(0);
      const ini = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff])), fin = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (ini >= 0 && fin > ini) buf = buf.subarray(ini, fin + 2);
      db.subidas.push({ ruta, bytes: buf.length, rol, upsert: req.headers()['x-upsert'] }); db.archivos.set(ruta, buf);
      return json({ Key: 'comprobantes/' + ruta, Id: 'x' });
    }
    if (u.pathname.startsWith('/storage/v1/object/authenticated/comprobantes/') || u.pathname.startsWith('/storage/v1/object/comprobantes/')) {
      if (rol !== 'gerencia') return json({ error: 'not found' }, 400);
      const ruta = decodeURIComponent(u.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?comprobantes\//, ''));
      const buf = db.archivos.get(ruta);
      return buf ? route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/jpeg' }, body: buf }) : json({ error: 'not found' }, 400);
    }
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'Umo Grill', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json([{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true }, { id: L2, codigo: 'TRE', nombre: 'Trento Café', encargados: [], activo: true }]);
    if (t === 'proveedores' || t === 'proveedores_basico') return json([{ id: FLO, nombre: 'Florida', cuit: '30711111111', activo: true }, { id: DS, nombre: 'Distri Stock Mayorista', cuit: null, activo: true }]);
    if (t === 'facturas_locales') {
      if (req.method() === 'POST') { const b = body(); const fila = { id: 'fl' + (db.fl.length + 1), estado: 'pendiente', factura_id: null, procesada_en: null, creado_en: '2026-10-30T10:15:00-03:00', ...b }; db.fl.unshift(fila); return json([fila], 201); }
      if (req.method() === 'PATCH') { const id = (u.searchParams.get('id') || '').replace('eq.', ''); const b = body(); db.patch.push({ id, ...b }); const f = db.fl.find(x => x.id === id); if (f) Object.assign(f, b); return json([{ id }]); }
      let r = db.fl;
      const est = u.searchParams.get('estado'); if (est) r = r.filter(x => x.estado === est.replace('eq.', ''));
      const id = u.searchParams.get('id'); if (id) r = r.filter(x => x.id === id.replace('eq.', ''));
      return json(r);
    }
    if (rol !== 'gerencia' && /precio|facturas_proveedor|recepciones/.test(t)) return json({ message: 'permission denied' }, 403);
    if (t === 'productos') return json(Object.values(P));
    if (t === 'producto_alias' || t === 'ordenes_compra' || t === 'precio_actual' || t === 'stock_actual') return json([]);
    if (t === 'rpc/recibir_con_factura') { const b = body(); db.rpc.push(b); return json({ recepcion_id: 'rec-1', factura_id: 'fac-9', items: b.p_items.length, estado_orden: null }); }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
// La app scrollea dentro de #scroller: para la captura completa se agranda la ventana al alto del contenido.
async function shot(p, n, full = false) {
  if (!full) return p.screenshot({ path: path.join(OUT, n + '.png') });
  const vp = p.viewportSize();
  const alto = await p.evaluate(() => { const s = document.getElementById('scroller'); return Math.max(document.documentElement.scrollHeight, s ? s.scrollHeight + 160 : 0); });
  await p.setViewportSize({ width: vp.width, height: Math.min(alto, 6000) });
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, n + '.png') });
  await p.setViewportSize(vp);
}

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const foto = path.join(os.tmpdir(), 'e2e-factura-local.jpg');
  { const p = await browser.newPage({ viewport: { width: 700, height: 900 } });
    await p.setContent(`<body style="font:16px monospace;padding:30px;background:#fff"><h2>DISTRIB. FLO</h2><pre>${FACTURA.renglones.map(r => `${r.cantidad}  ${r.descripcion}  ${r.precio_unitario}`).join('\n')}</pre><h3>TOTAL $119.185</h3></body>`);
    await p.screenshot({ path: foto, type: 'jpeg', quality: 80 }); await p.close(); }
  const nuevo = async (opts, sub) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    await c.addInitScript(([s, enc]) => {
      window.confirm = () => true;
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      if (enc) localStorage.setItem('stock:nombre', JSON.stringify('Ruth'));
    }, [sesion(sub), sub === U_ENC]);
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|40[03]/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p };
  };

  // ===== Encargado · iPhone =====
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, U_ENC);
  await e.goto(BASE + '#/pedir');
  await e.waitForSelector('.tab');
  ok(await e.locator('.tab', { hasText: 'Facturas' }).count() === 1, 'el encargado tiene la pestaña Facturas');
  await e.goto(BASE + '#/subir-factura');
  await e.waitForSelector('#sf-archivo', { state: 'attached' });
  ok(await e.locator('button', { hasText: 'Mandar a gerencia' }).isDisabled(), 'sin foto no deja mandar');
  await shot(e, '01-encargado-vacio-m');
  await e.setInputFiles('#sf-archivo', foto);
  await e.waitForSelector('.rf-foto img');
  await e.selectOption('#sf-prov', FLO);
  await e.fill('#sf-nota', 'Faltó la crema');
  await shot(e, '02-encargado-foto-m');
  await e.locator('button', { hasText: 'Mandar a gerencia' }).click();
  await e.waitForSelector('.sf-item');
  const s0 = db.subidas[0];
  ok(s0 && s0.rol === 'encargado' && s0.ruta.startsWith('locales/' + L1 + '/') && s0.bytes > 1000 && s0.upsert !== 'true', 'sube la foto a comprobantes/locales/<su local>/ sin pisar · ' + (s0 && s0.ruta));
  const f0 = db.fl[0];
  ok(f0 && f0.local_id === L1 && f0.proveedor_id === FLO && f0.nota === 'Faltó la crema' && f0.subida_por_nombre === 'Ruth' && f0.archivos.length === 1, 'crea la fila con local, proveedor, nota y quién subió');
  ok(!Object.keys(f0).some(k => /total|precio|monto/.test(k)), 'la fila no lleva montos');
  const txtE = await e.locator('#view').innerText();
  ok(!/\$|precio unitario|total factura/i.test(txtE), 'la pantalla del encargado no muestra precios ni totales');
  ok(/Esperando a gerencia/.test(txtE) && /Florida/.test(txtE), 'queda en "Las que subiste" como Esperando a gerencia');
  await shot(e, '03-encargado-mandada-m', true);
  await cE.close();

  // ===== Gerencia · PC =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1280, height: 900 } }, U_GER);
  await g.goto(BASE + '#/recibir');
  await g.waitForSelector('.fl-item');
  const txtG = await g.locator('.fl-grupo').innerText();
  ok(/Umo Grill · Florida/.test(txtG) && /Subió Ruth/.test(txtG) && /Faltó la crema/.test(txtG), 'Recibir muestra la factura subida por el local');
  await shot(g, '04-gerencia-recibir-pc');
  await g.locator('.fl-item a', { hasText: 'Leer y recibir' }).click();
  await g.waitForSelector('.rf-foto img');
  ok(await g.locator('#rf-local').inputValue() === L1, 'abre con el local de la factura');
  ok(/subió Ruth de Umo Grill/.test(await g.locator('.banner').first().innerText()), 'avisa quién la subió');
  await g.locator('button', { hasText: 'Leer factura' }).click();
  await g.waitForSelector('.rf-fila');
  ok(await g.locator('#rf-prov').inputValue() === FLO, 'usa el proveedor que eligió el encargado');
  ok(/Lo eligió el local/.test(await g.locator('.rf-prov-h').innerText()), 'dice que el proveedor lo eligió el local');
  await shot(g, '05-gerencia-revisar-pc', true);
  for (const d of ['MUZZARELLA HORMA LA PAULINA', 'FLETE', 'LECHE ENT. LS 1L CJ X12', 'TOMATE PERITA X KG', 'LAVANDINA CONCENTRADA BIDON 5L']) {
    const b = g.locator(`[aria-label="Elegir producto para ${d}"]`);
    if (await b.count()) { await b.click(); await g.locator('dialog[open] button', { hasText: 'No recibir este renglón' }).click(); }
  }
  await g.locator('button', { hasText: 'Confirmar recepción' }).click();
  await g.waitForFunction(() => location.hash === '#/recibir');
  ok(db.rpc.length === 1 && db.rpc[0].p_local === L1 && db.rpc[0].p_proveedor === FLO, 'recibe con local y proveedor');
  const pt = db.patch[0];
  ok(pt && pt.id === 'fl1' && pt.estado === 'recibida' && pt.factura_id === 'fac-9', 'marca la factura del local como recibida con su factura · ' + JSON.stringify(pt));
  await g.waitForTimeout(300);
  ok(!(await g.locator('.fl-item').count()), 'ya no figura como pendiente');
  await cG.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
