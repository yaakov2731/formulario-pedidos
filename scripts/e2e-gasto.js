#!/usr/bin/env node
// Prueba de punta a punta de Pagos · Gasto y la carga de Recibo X (manual, no corre en CI). API de Supabase mockeada con page.route.
// Gerencia: Pagos → Gasto muestra lo gastado en el período contra el anterior, con factura vs. recibo X, pagado / a pagar,
// por razón social, local, proveedor y categoría; "Cargar factura o recibo X" abre Facturas con el formulario y un recibo X
// sin número se guarda con tipo, local y número armado. Datos de prueba generados acá (no salen de la base).
// Uso: node scripts/e2e-gasto.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/gasto-compras');
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

// ---------- datos de prueba ----------
const U_GER = 'usr-ger';
const LOC = { umo: 'loc-umo', tre: 'loc-tre', brk: 'loc-brk', gel: 'loc-gel', shp: 'loc-shp' };
const locales = [
  { id: LOC.gel, codigo: 'GEL', nombre: 'Puerto Gelato', encargados: [], activo: true, razon_social: 'SUMA ACTIVA S.A.' },
  { id: LOC.shp, codigo: 'SHP', nombre: 'Shopping', encargados: [], activo: true, razon_social: 'SPMAR S.A.' },
  { id: LOC.umo, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true, razon_social: 'SUMA ACTIVA S.A.' },
  { id: LOC.tre, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true, razon_social: 'SUMA ACTIVA S.A.' },
  { id: LOC.brk, codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true, razon_social: 'SUMA ACTIVA S.A.' }
];
const provs = [['p-flo', 'Florida', 'Verdulería'], ['p-ds', 'Distri Stock Mayorista', 'Limpieza'], ['p-cri', 'El Criollo', 'Carnes'], ['p-lac', 'Lácteos del Sur', 'Lácteos y huevos'],
  ['p-mdr', 'Martín De Ridder', 'Pastelería'], ['p-beb', 'Bebidas Puerto', 'Bebidas'], ['p-pan', 'Panadería Nueva', 'Panadería']]
  .map(([id, nombre, cat]) => ({ id, nombre, cat, whatsapp: null, cuit: null, alias_cbu: null, dias_entrega: null, corte: null, pedido_minimo: null, notas: null, activo: true }));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
let semilla = 11;
const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const gastos = [];
const locDe = { 'p-flo': [LOC.umo, LOC.tre, LOC.brk], 'p-ds': [LOC.shp, LOC.gel, LOC.umo], 'p-cri': [LOC.umo], 'p-lac': [LOC.tre, LOC.gel], 'p-mdr': [LOC.tre], 'p-beb': [LOC.umo, LOC.brk], 'p-pan': [LOC.tre, LOC.brk] };
const base = { 'p-flo': 380000, 'p-ds': 260000, 'p-cri': 900000, 'p-lac': 210000, 'p-mdr': 150000, 'p-beb': 320000, 'p-pan': 90000 };
function mk(fecha, p, i) {
  const ls = locDe[p.id]; const loc = locales.find(l => l.id === ls[i % ls.length]);
  const es_x = ['p-cri', 'p-pan', 'p-flo'].includes(p.id) && azar() < 0.45;
  const total = Math.round(base[p.id] * (0.6 + azar() * 0.8) / 100) * 100;
  const dif = Math.round((hoy - new Date(fecha + 'T12:00')) / 864e5);
  const imputado = dif > 12 ? total : dif > 5 && azar() < 0.5 ? Math.round(total / 2) : 0;
  const venc = new Date(fecha + 'T12:00'); venc.setDate(venc.getDate() + 10);
  const sinLocal = azar() < 0.08;
  return { id: 'g' + gastos.length, proveedor_id: p.id, proveedor: p.nombre, numero: es_x ? `X-0001-${1000 + gastos.length}` : `0004-${String(226000 + gastos.length).padStart(8, '0')}`,
    tipo: es_x ? 'Recibo X' : (p.id === 'p-mdr' ? 'Factura C' : 'Factura A'), es_x, fecha, vencimiento: iso(venc), total, archivo: null, creado_en: fecha + 'T1' + (i % 10) + ':00:00Z',
    local_id: sinLocal ? null : loc.id, local: sinLocal ? null : loc.nombre, razon_social: sinLocal ? 'Sin razón social' : loc.razon_social, categoria: p.cat,
    imputado, pendiente: total - imputado, pagada: total - imputado < 1, vencida: iso(venc) < iso(hoy) && total - imputado >= 1 };
}
for (let atras = 75; atras >= 0; atras--) {
  const d = new Date(hoy); d.setDate(d.getDate() - atras); const f = iso(d);
  provs.forEach((p, k) => { if ((atras + k) % (p.id === 'p-flo' ? 2 : p.id === 'p-cri' ? 4 : 6) === 0) gastos.push(mk(f, p, atras)); });
}

function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
const log = []; const creadas = [];
const rango = (q) => { const g = (q.getAll('fecha').find(v => v.startsWith('gte.')) || 'gte.0000').slice(4); const l = (q.getAll('fecha').find(v => v.startsWith('lte.')) || 'lte.9999').slice(4); return (f) => f >= g && f <= l; };
async function montarApi(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const t = u.pathname.replace('/rest/v1/', '');
    log.push({ t, q: u.search });
    if (u.pathname === '/auth/v1/user') return json(sesion(U_GER).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_GER));
    if (t === 'perfiles') return json([{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }]);
    if (t === 'locales') return json(locales);
    const pagina = (xs) => { const a = Number(q.get('offset') || 0); return xs.slice(a, a + Number(q.get('limit') || 1000)); };
    if (t === 'proveedores') return json(provs);
    if (t === 'gastos_compras') { const en = rango(q); return json(pagina(gastos.filter(g => en(g.fecha)))); }
    if (t === 'facturas_proveedor' && req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); creadas.push(b); return json([{ id: 'nueva-1' }], 201); }
    if (t === 'rpc/tablero') return json(null);
    return json([]);
  });
}

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
// Captura completa: suelta la pantalla fija (sólo scrollea .main) para que entre todo el contenido.
async function shot(p, n, full = false) {
  if (!full) return p.screenshot({ path: path.join(OUT, n + '.png') });
  const st = await p.addStyleTag({ content: 'html,body,.app,.main{position:static!important;height:auto!important;overflow:visible!important}.tabbar{position:fixed!important}' });
  await p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  await st.evaluate(e => e.remove());
}
const plata = (n) => '$ ' + Math.round(n).toLocaleString('es-AR');

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const nuevo = async (opts) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c);
    await c.addInitScript((s) => { if (sessionStorage.getItem('e2e-init')) return; sessionStorage.setItem('e2e-init', '1'); localStorage.setItem('stock-auth', JSON.stringify(s)); }, sesion(U_GER));
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p };
  };
  const hasta = iso(hoy); const desde = iso(hoy).slice(0, 8) + '01';
  const delMes = gastos.filter(g => g.fecha >= desde && g.fecha <= hasta);
  const total = delMes.reduce((s, g) => s + g.total, 0);
  const x = delMes.filter(g => g.es_x).reduce((s, g) => s + g.total, 0);

  // ===== Celular =====
  const { p: m } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto(BASE + '#/pagos');
  await m.waitForSelector('.subnav-b');
  ok((await m.locator('.subnav-b').allInnerTexts()).join('|') === 'Gasto|Cuentas|Facturas|Pagos|Cargar', 'Pagos tiene la pestaña Gasto primero');
  await m.locator('.subnav-b', { hasText: 'Gasto' }).click();
  await m.waitForSelector('.vg-hero');
  ok(await m.locator('.tab.is-active', { hasText: 'Pagos' }).count() === 1, 'la pestaña Pagos queda marcada');
  ok(await m.locator('.vg-hero-v').innerText() === plata(total), `gastado este mes = ${plata(total)} · ${await m.locator('.vg-hero-v').innerText()}`);
  ok(/mismos días del mes pasado/.test(await m.locator('.vg-var').innerText()), 'compara con los mismos días del mes pasado · ' + await m.locator('.vg-var').innerText());
  ok((await m.locator('.gc-mix').innerText()).includes(plata(x)) && (await m.locator('.gc-mix').innerText()).includes(plata(total - x)), 'con factura y recibo X por separado');
  ok(/SUMA ACTIVA/.test(await m.locator('.vg-b', { hasText: 'Por razón social' }).innerText()) && /SPMAR/.test(await m.locator('.vg-b', { hasText: 'Por razón social' }).innerText()), 'por razón social: SUMA ACTIVA y SPMAR');
  ok(/Carnes/.test(await m.locator('.vg-b', { hasText: 'Por categoría' }).innerText()), 'por categoría');
  ok(/El Criollo/.test(await m.locator('.vg-b', { hasText: 'Por proveedor' }).innerText()), 'por proveedor');
  await shot(m, '01-gasto-m');
  await shot(m, '02-gasto-completo-m', true);
  await m.locator('.gc-seg .seg-b[data-tipo="x"]').click();
  ok(await m.locator('.vg-hero-v').innerText() === plata(x) && /recibo X/i.test(await m.locator('.vg-hero-t').innerText()), 'filtro Recibo X: solo lo comprado sin factura');
  await shot(m, '03-solo-recibo-x-m');
  await m.locator('.gc-seg .seg-b[data-tipo="todo"]').click();
  await m.locator('.toolbar .chip[data-rango="mes-1"]').click();
  await m.waitForSelector('.vg-hero');
  ok(/mes anterior/.test(await m.locator('.vg-var').innerText()), 'mes pasado contra el mes anterior');

  // Cargar un recibo X sin número
  await m.locator('.toolbar a.btn', { hasText: 'Cargar factura o recibo X' }).click();
  await m.waitForSelector('#fa-tipo');
  ok(/#\/facturas$/.test(m.url()), 'abre Facturas con el formulario de carga');
  await m.selectOption('#fa-prov', 'p-cri');
  await m.selectOption('#fa-tipo', 'Recibo X');
  await m.selectOption('#fa-local', LOC.umo);
  await m.fill('#fa-total', '480.000');
  ok(/sin factura/i.test(await m.locator('.field-h').first().innerText()), 'explica qué es el recibo X');
  await shot(m, '04-nuevo-recibo-x-m');
  await m.locator('.sheet .btn-primary', { hasText: 'Guardar recibo X' }).click();
  await m.waitForFunction(() => !document.querySelector('#fa-tipo'));
  const b = creadas[0] || {};
  ok(b.tipo === 'Recibo X' && b.local_id === LOC.umo && /^X-\d{8}-\d{6}$/.test(b.numero) && b.total === 480000 && b.categoria === null, 'guarda tipo, local, total y número armado · ' + JSON.stringify(b));
  await m.locator('.chip[data-filtro="x"]').click();
  ok(await m.locator('.fac-x').count() > 0, 'filtro Recibos X en Facturas');
  await shot(m, '05-facturas-recibos-x-m');

  // ===== PC =====
  const { p: pc } = await nuevo({ viewport: { width: 1366, height: 900 } });
  await pc.goto(BASE + '#/gasto');
  await pc.waitForSelector('.vg-hero');
  ok(await pc.locator('.side-link.is-active', { hasText: 'Pagos' }).count() === 1, 'PC: Pagos marcado en la barra lateral');
  await shot(pc, '06-gasto-pc', true);

  ok(!errores.length, 'sin errores en consola ' + errores.join(' | '));
  await browser.close(); srv.close();
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
