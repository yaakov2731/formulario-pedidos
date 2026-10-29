#!/usr/bin/env node
// Prueba de punta a punta de Ventas · Resumen (manual, no corre en CI). Servidor estático y API de Supabase mockeada con page.route.
// Gerencia: el menú Ventas abre el Resumen con el total de todos los locales, la variación contra el período anterior, el desglose
// por local (con días cargados), las columnas por día apiladas por local y el ranking de más vendidos (todos o por local,
// por unidades o por importe). Los datos son de prueba, generados acá (no salen de la base).
// Uso: node scripts/e2e-ventas-resumen.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/ventas-resumen');
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
const LOC = { umo: 'loc-umo', tre: 'loc-tre', brk: 'loc-brk', gel: 'loc-gel', shp: 'loc-shp', dep: 'loc-dep' };
const locales = [
  { id: LOC.gel, codigo: 'GEL', nombre: 'Puerto Gelato', encargados: [], activo: true },
  { id: LOC.shp, codigo: 'SHP', nombre: 'Shopping', encargados: [], activo: true },
  { id: LOC.umo, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true },
  { id: LOC.tre, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true },
  { id: LOC.brk, codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true },
  { id: LOC.dep, codigo: 'DEP', nombre: 'Depósito', encargados: [], activo: true }
];
const CARTA = {
  [LOC.umo]: [['Asado al Asador', 27000, 12], ['Vacío c/ Guarnición', 29000, 8], ['Parrillada para dos', 86000, 4], ['Papas Fritas', 7800, 14], ['Coca-Cola', 4500, 9], ['Agua S/Gas', 4500, 11], ['Limonada Natural 1 Lt', 16000, 8], ['Matambre a la Pizza', 25500, 5], ['Provoleta Criolla', 15600, 4], ['Sándwich de Choripán', 11000, 7], ['Empanadas Osobuco', 5900, 8], ['Flan c/ Dulce de Leche', 7000, 4]],
  [LOC.tre]: [['Café con Leche + 2 Medialunas', 10900, 10], ['Cortado Jarrito', 5100, 16], ['Medialuna', 2800, 14], ['Cafe doble +Torta', 14300, 9], ['Tostado de Miga J y Q', 11950, 5], ['Coca-Cola', 4400, 3], ['Avocado Toast', 19900, 2], ['Café con Leche Doble', 6700, 11]],
  [LOC.brk]: [['COMBO NAPOLITANA', 30900, 4], ['COMBO BROOKLYN', 26900, 4], ['Nuggets', 5850, 3], ['Coca-Cola', 4500, 5], ['Quesadilla de Lomo', 23900, 2], ['Roll Mex', 21900, 2], ['Limonada litro', 15900, 2]]
};
// Pseudoaleatorio fijo (las capturas salen siempre iguales).
let semilla = 7;
const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
const items = []; const pedidos = [];
for (let atras = 59; atras >= 0; atras--) {
  const d = new Date(hoy); d.setDate(d.getDate() - atras); const f = iso(d);
  const finde = d.getDay() === 0 || d.getDay() === 5 || d.getDay() === 6;
  for (const [loc, carta] of Object.entries(CARTA)) {
    if (loc === LOC.brk && atras > 20) continue;                 // Brooklyn arrancó a subir hace 3 semanas
    if (loc === LOC.tre && d.getDay() === 1) continue;           // Trento cierra los lunes
    if (atras === 0) continue;                                    // hoy todavía no se subió nada
    const factor = (finde ? 1.5 : 0.9) * (atras < 30 ? 1.08 : 1) * (0.8 + azar() * 0.4);
    for (const [nombre, precio, base] of carta) {
      const cant = Math.max(0, Math.round(base * factor * (0.6 + azar() * 0.8)));
      if (cant) items.push({ id: items.length + 1, local_id: loc, fecha: f, codigo_origen: null, nombre_origen: nombre, cantidad: cant, importe: cant * precio });
    }
    if (loc === LOC.umo) for (let n = 0; n < Math.round(30 * factor); n++) pedidos.push({ local_id: loc, numero: 1000 + pedidos.length, fecha: f });
  }
}

function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
const log = [];
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
    if (t === 'ventas_items') { const en = rango(q); return json(pagina(items.filter(i => en(i.fecha)))); }
    if (t === 'ventas_pedidos') { const en = rango(q); return json(pagina(pedidos.filter(p => en(p.fecha)))); }
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
  const hasta = iso(hoy); const d30 = new Date(hoy); d30.setDate(d30.getDate() - 29); const desde = iso(d30);
  const d60 = new Date(hoy); d60.setDate(d60.getDate() - 59);
  const en30 = items.filter(i => i.fecha >= desde && i.fecha <= hasta);
  const total = en30.reduce((s, i) => s + i.importe, 0);
  const prev = items.filter(i => i.fecha >= iso(d60) && i.fecha < desde).reduce((s, i) => s + i.importe, 0);

  // ===== Celular =====
  const { p: m } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto(BASE + '#/tablero');
  await m.waitForSelector('.tab');
  await m.locator('.tab', { hasText: 'Ventas' }).click();
  await m.waitForSelector('.vg-hero');
  ok(/#\/resumen$/.test(m.url()), 'el menú Ventas abre el Resumen');
  ok(await m.locator('.subnav-b').allInnerTexts().then(t => t.join('|')) === 'Resumen|Importar|Análisis|Merma', 'subnav: Resumen, Importar, Análisis, Merma');
  ok(await m.locator('.tab.is-active', { hasText: 'Ventas' }).count() === 1, 'la pestaña Ventas queda marcada');
  const heroTxt = await m.locator('.vg-hero-v').innerText();
  ok(heroTxt === plata(total), `total de todos los locales en 30 días = ${plata(total)} · ${heroTxt}`);
  const v = Math.round(Math.abs((total - prev) / prev) * 100);
  ok((await m.locator('.vg-var').innerText()).includes(`${v} %`) && (await m.locator('.vg-var').innerText()).includes(plata(prev)), `variación contra los 30 días anteriores (${v} %, ${plata(prev)})`);
  const locs = await m.locator('.vg-loc .vg-loc-n').allInnerTexts();
  ok(locs.join('|') === 'Umo Grill|Trento Café|Brooklyn|Puerto Gelato', 'por local en orden fijo, sin Shopping ni Depósito · ' + locs.join('|'));
  ok(/Sin ventas importadas en estas fechas: Puerto Gelato/.test(await m.locator('.banner-warn').innerText()), 'avisa que Puerto Gelato no tiene ventas cargadas');
  const umo = en30.filter(i => i.local_id === LOC.umo).reduce((s, i) => s + i.importe, 0);
  ok((await m.locator(`.vg-loc[data-local="${LOC.umo}"]`).innerText()).includes(plata(umo)), 'Umo con su total');
  ok(await m.locator('.vg-col').count() === 30, '30 columnas, una por día');
  ok(/Ticket promedio/i.test(await m.locator('.vg-kpis').innerText()), 'ticket promedio con los pedidos de Umo');
  await shot(m, '01-resumen-m');
  await m.locator('.vg-dos .bloque').nth(1).scrollIntoViewIfNeeded();
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  ok((await m.locator('.vg-det').innerText()).includes('Umo Grill'), 'el detalle del día muestra el último día con ventas por local');
  await shot(m, '02-por-dia-m');
  await m.locator('.vg-col').nth(10).click();
  ok(await m.locator('.vg-col.is-sel').getAttribute('data-fecha') === iso(new Date(d30.getFullYear(), d30.getMonth(), d30.getDate() + 10)), 'tocar una columna elige ese día');

  // ranking
  await m.locator('#vg-ranking').scrollIntoViewIfNeeded();
  const prim = await m.locator('.vg-r .vg-r-n').first().innerText();
  const agr = new Map(); for (const i of en30) agr.set(i.nombre_origen, (agr.get(i.nombre_origen) || 0) + i.cantidad);
  const top = [...agr].sort((a, b) => b[1] - a[1])[0];
  ok(prim === top[0], `más vendido por unidades en todos los locales: ${top[0]} · ${prim}`);
  ok(await m.locator('.vg-r').count() === 10, 'muestra los 10 primeros');
  const coca = m.locator('.vg-r').filter({ has: m.locator('.vg-r-n', { hasText: /^Coca-Cola$/ }) }).first();
  ok((await coca.locator('.vg-r-loc > span').count()) === 3, 'Coca-Cola suma los tres locales y los nombra');
  await shot(m, '03-ranking-m');
  await m.locator('#vg-ranking .seg-b', { hasText: 'Importe' }).click();
  const agrI = new Map(); for (const i of en30) agrI.set(i.nombre_origen, (agrI.get(i.nombre_origen) || 0) + i.importe);
  const topI = [...agrI].sort((a, b) => b[1] - a[1])[0];
  ok(await m.locator('.vg-r .vg-r-n').first().innerText() === topI[0], `por importe: ${topI[0]}`);
  await m.locator(`.vg-chip[data-local="${LOC.tre}"]`).click();
  ok(/Trento Café/i.test(await m.locator('#vg-ranking .bloque-t').innerText()) && await m.locator('.vg-r-loc').count() === 0, 'filtro por local: solo Trento, sin etiquetas de local');
  await m.locator('#vg-ranking').scrollIntoViewIfNeeded();
  await shot(m, '04-ranking-trento-importe-m');
  await m.locator('#vg-ranking .chip', { hasText: 'Todos' }).click();
  await m.locator('#vg-ranking .btn', { hasText: 'Ver los' }).click();
  ok(await m.locator('.vg-r').count() > 10, 'Ver los N muestra el resto');

  // tocar un local en "Por local" filtra el ranking
  await m.locator(`.vg-loc[data-local="${LOC.brk}"]`).click();
  ok(/Brooklyn/i.test(await m.locator('#vg-ranking .bloque-t').innerText()), 'tocar Brooklyn en Por local filtra el ranking');

  // período: 7 días
  await m.locator('.toolbar .chip[data-rango="7"]').click();
  await m.waitForFunction(() => document.querySelectorAll('.vg-col').length === 7);
  ok(true, '7 días: 7 columnas');
  await m.evaluate(() => document.querySelector('.main').scrollTo(0, 0));
  await shot(m, '05-siete-dias-m');
  await shot(m, '06-resumen-completo-m', true);

  // ===== PC =====
  const { p: pc } = await nuevo({ viewport: { width: 1366, height: 900 } });
  await pc.goto(BASE + '#/resumen');
  await pc.waitForSelector('.vg-hero');
  ok(await pc.locator('.side-link.is-active', { hasText: 'Ventas' }).count() === 1, 'PC: Ventas marcado en la barra lateral');
  await shot(pc, '07-resumen-pc', true);
  await pc.goto(BASE + '#/ventas');
  await pc.waitForSelector('#f-archivo', { state: 'attached' });
  ok(await pc.locator('.side-link.is-active', { hasText: 'Ventas' }).count() === 1 && await pc.locator('.subnav-b.is-on').innerText() === 'Importar', 'Importar sigue en #/ventas y marca Ventas');

  // ===== sin ventas =====
  items.length = 0; pedidos.length = 0;
  await pc.goto(BASE + '#/resumen'); await pc.reload();
  await pc.waitForSelector('.empty');
  ok(/No hay ventas en esas fechas/.test(await pc.locator('.empty').innerText()) && await pc.locator('a[href="#/ventas"]', { hasText: 'Importar ventas' }).count() === 1, 'sin ventas: aviso y botón a Importar');

  ok(log.filter(l => l.t === 'ventas_items').every(l => !/local_id=/.test(l.q)), 'pide las ventas de todos los locales en una consulta');
  ok(!errores.length, 'sin errores en consola ' + errores.join(' | '));
  await browser.close(); srv.close();
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
