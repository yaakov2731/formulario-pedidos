#!/usr/bin/env node
// Prueba de punta a punta del tablero de Notas de stock/ (manual, no corre en CI). Servidor estático del repo y
// API de Supabase mockeada con page.route. Recorre encargado (iPhone: ver, crear, responder, resolver) y gerencia
// (PC: todos los locales, filtro por local, nota para un local). Guarda capturas en OUT.
// Uso: node scripts/e2e-notas.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/notas');
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

const L1 = 'loc-umo', L2 = 'loc-tre', L3 = 'loc-brk';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const hace = (h) => new Date(Date.parse('2026-10-26T13:00:00-03:00') - h * 3600e3).toISOString();
let seq = 0;
const nota = (o) => ({ id: 'n' + (++seq), local_id: L1, para: 'gerencia', texto: '', color: 'amarillo', etiquetas: [], autor_rol: 'encargado', fijada: false, resuelta_en: null, resuelta_por: null, leida_en: hace(1), nota_respuestas: [], ...o });
const db = {
  locales: [
    { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth Coronel'], activo: true },
    { id: L2, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true },
    { id: L3, codigo: 'BRK', nombre: 'Brooklyn', encargados: ['Maru'], activo: true }
  ],
  notas: [
    nota({ titulo: 'Se cortó el gas de la plancha', texto: 'Desde las 12 la plancha no prende. Estamos usando el horno para las carnes.', color: 'naranja', etiquetas: ['urgente', 'rotura'], autor_nombre: 'Ruth Coronel', fijada: true, creado_en: hace(1), leida_en: null }),
    nota({ titulo: 'Turnos del finde', texto: 'Sábado entra Maru a las 11 y yo cierro. Domingo doble turno Ayelén.', color: 'azul', para: 'equipo', etiquetas: ['turno'], autor_nombre: 'Ruth Coronel', fijada: true, creado_en: hace(20) }),
    nota({ titulo: 'Para el jueves', texto: 'Limones\nPan de hamburguesa\nCarbón 2 bolsas', color: 'amarillo', para: 'equipo', etiquetas: ['faltante'], autor_nombre: 'Lucas (cocina)', fijada: true, creado_en: hace(26) }),
    nota({ titulo: 'Falta papel film', texto: 'Queda medio rollo. Lo pido con Barcena o lo compran ustedes?', color: 'amarillo', etiquetas: ['faltante', 'proveedor'], autor_nombre: 'Lucas (cocina)', creado_en: hace(3), leida_en: null,
      nota_respuestas: [{ id: 'r1', texto: 'Pedilo con Barcena en el pedido de hoy.', autor_nombre: 'Jacobo', autor_rol: 'gerencia', creado_en: hace(2) }] }),
    nota({ titulo: 'Recordatorio', texto: 'Llamar al técnico de la cámara a las 14 h', color: 'naranja', para: 'equipo', etiquetas: ['urgente'], autor_nombre: 'Maru', creado_en: hace(5) }),
    nota({ titulo: 'Idea para el menú', texto: 'Sumar limonada de jengibre en la carta de verano, la piden mucho.', color: 'verde', etiquetas: ['idea'], autor_nombre: 'Ayelén', creado_en: hace(30) }),
    nota({ titulo: 'Limpieza profunda de la campana', texto: 'Hacerla el lunes antes de abrir.', color: 'azul', para: 'equipo', etiquetas: ['limpieza'], autor_nombre: 'Ruth Coronel', creado_en: hace(50) }),
    nota({ titulo: 'Cambio de horario de entrega', texto: 'Florida entrega el sábado a las 9 en vez de las 8.', color: 'rosa', local_id: null, para: 'equipo', autor_rol: 'gerencia', autor_nombre: 'Jacobo', etiquetas: ['proveedor'], creado_en: hace(28) }),
    nota({ titulo: 'Se rompió un vaso de licuadora', color: 'rosa', etiquetas: ['rotura'], autor_nombre: 'Lucas (cocina)', creado_en: hace(72), resuelta_en: hace(48), resuelta_por: 'Jacobo' }),
    nota({ local_id: L2, titulo: 'No llegó la leche', texto: 'El repartidor dijo que viene mañana temprano.', color: 'naranja', etiquetas: ['urgente', 'proveedor'], autor_nombre: 'Angelica', creado_en: hace(2), leida_en: null }),
    nota({ local_id: L2, titulo: 'Heladera de tortas hace ruido', color: 'azul', etiquetas: ['rotura'], autor_nombre: 'Angelica', creado_en: hace(8) }),
    nota({ local_id: L3, titulo: 'Inventario de cervezas', texto: 'Conté 4 barriles llenos y 1 por la mitad.', color: 'verde', para: 'gerencia', autor_nombre: 'Maru', creado_en: hace(10), fijada: true })
  ],
  log: []
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
    const u = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const sub = subDe(req);
    const rol = sub === U_GER ? 'gerencia' : (sub === U_ENC ? 'encargado' : null);
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ m: req.method(), t, q: Object.fromEntries(u.searchParams), b: body(), rol });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(String((body() || {}).refresh_token || 'r-' + U_ENC).slice(2)));
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    if (!rol) return json({ code: '42501', message: 'permission denied' }, 401);
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: U_ENC, nombre: 'Umo Grill', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(rol === 'gerencia' ? db.locales : db.locales.filter(l => l.id === L1));
    if (t === 'notas') {
      const visible = (n) => rol === 'gerencia' || n.local_id === L1 || n.local_id === null;
      if (req.method() === 'GET') return json(db.notas.filter(visible).sort((a, b) => b.creado_en.localeCompare(a.creado_en)));
      if (req.method() === 'POST') {
        const b = body(); const fila = Array.isArray(b) ? b[0] : b;
        if (rol === 'encargado' && (fila.local_id !== L1 || fila.autor_rol !== 'encargado')) return json({ code: '42501', message: 'new row violates row-level security policy' }, 403);
        const r = { id: 'n' + (++seq), nota_respuestas: [], resuelta_en: null, resuelta_por: null, leida_en: null, creado_en: new Date().toISOString(), ...fila };
        db.notas.push(r); return json([r], 201);
      }
      const id = eq(u.searchParams.get('id')); const n = db.notas.find(x => x.id === id);
      if (!n || !visible(n)) return json([]);
      if (req.method() === 'PATCH') { Object.assign(n, body()); return json([{ id }]); }
      if (req.method() === 'DELETE') { db.notas = db.notas.filter(x => x.id !== id); return json([{ id }]); }
    }
    if (t === 'nota_respuestas' && req.method() === 'POST') {
      const b = body(); const fila = Array.isArray(b) ? b[0] : b;
      const n = db.notas.find(x => x.id === fila.nota_id);
      const r = { id: 'r' + (++seq), creado_en: new Date().toISOString(), ...fila };
      n.nota_respuestas.push(r); return json([r], 201);
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
  const ahora = new Date('2026-10-26T13:00:00-03:00');
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
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.clock.setFixedTime(ahora);
    return { c, p };
  };

  // ===== Encargado · iPhone =====
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' }, U_ENC, { nombre: 'Ruth Coronel' });
  await e.goto(BASE + '#/notas');
  await e.waitForSelector('.nb-postit');
  ok(await e.locator('.tab', { hasText: 'Notas' }).count() === 1, 'el encargado tiene la pestaña Notas');
  ok(await e.locator('#app.tema-notas').count() === 1, 'la pantalla Notas usa el tema oscuro de vidrio');
  ok(await e.locator('.nb-postit').count() === 3, 'tres notas fijadas como post-its');
  ok(!(await e.locator('.nb').innerText()).includes('Trento'), 'el local no ve notas de otros locales');
  ok((await e.locator('.nb').innerText()).includes('Cambio de horario de entrega'), 'el local ve los avisos de gerencia para todos');
  ok(!(await e.locator('.nb').innerText()).includes('vaso de licuadora'), 'las resueltas no aparecen en Todas');
  ok(await e.locator('.nb-nueva-b').count() === 0, 'el encargado no ve el sello "Nueva" (es para gerencia)');
  await shot(e, '01-notas-m');
  await e.locator('#scroller').evaluate(el => el.scrollTo(0, 560));
  await shot(e, '02-notas-m-abajo');
  await e.locator('#scroller').evaluate(el => el.scrollTo(0, 0));
  // Filtrar por etiqueta
  await e.locator('.nb-carpeta', { hasText: '#urgente' }).click();
  ok(await e.locator('.nb-card, .nb-postit').count() === 2, 'la carpeta #urgente filtra las notas');
  await e.locator('.nb-limpiar').click();
  // Nueva nota para gerencia con #urgente
  await e.getByRole('button', { name: 'Nueva nota' }).click();
  await e.waitForSelector('dialog[open] .nb-form');
  await e.getByLabel('Título').fill('Se terminó el aceite');
  await e.getByLabel('Texto').fill('Queda un bidón para la noche. Hay que pedir 2 para mañana.');
  await e.locator('.nb-color.c-naranja').click();
  await e.locator('.nb-tagb', { hasText: '#urgente' }).click();
  await e.locator('.nb-tagb', { hasText: '#faltante' }).click();
  await shot(e, '03-nueva-nota-m');
  await e.getByRole('button', { name: 'Publicar nota' }).click();
  await e.waitForSelector('.toast >> text=Nota enviada a gerencia');
  const creada = db.notas.find(n => n.titulo === 'Se terminó el aceite');
  ok(creada && creada.local_id === L1 && creada.para === 'gerencia' && creada.autor_nombre === 'Ruth Coronel' && creada.color === 'naranja' && creada.etiquetas.join() === 'urgente,faltante', 'la nota se guarda con local, destinatario, firma, color y etiquetas');
  ok((await e.locator('.nb-card').first().innerText()).includes('Se terminó el aceite'), 'la nota nueva aparece primera');
  // Detalle, respuesta y resolver
  await e.locator('.nb-card', { hasText: 'Falta papel film' }).click();
  await e.waitForSelector('dialog[open] .nb-det');
  ok((await e.locator('dialog[open]').innerText()).includes('Pedilo con Barcena'), 'el detalle muestra la respuesta de gerencia');
  await e.getByLabel('Respuesta').fill('Listo, va en el pedido.');
  await e.getByRole('button', { name: 'Responder' }).click();
  await e.waitForSelector('dialog[open] .nb-resp-i >> nth=1');
  await shot(e, '04-detalle-m');
  await e.getByRole('button', { name: 'Resuelta', exact: true }).click();
  await e.waitForSelector('.toast >> text=Marcada como resuelta');
  ok(!!db.notas.find(n => n.titulo === 'Falta papel film').resuelta_en, 'marcar como resuelta se guarda');
  await e.locator('.nb-folder', { hasText: 'Resueltas' }).click();
  ok(await e.locator('.nb-card').count() === 2, 'la carpeta Resueltas muestra las resueltas');
  await cE.close();

  // ===== Gerencia · PC =====
  const { c: cG, p: g } = await nuevo({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' }, U_GER);
  await g.goto(BASE + '#/notas');
  await g.waitForSelector('.nb-postit');
  ok(await g.locator('.side-link', { hasText: 'Notas' }).count() === 1, 'gerencia tiene Notas en la barra lateral');
  ok((await g.locator('.nb').innerText()).includes('No llegó la leche'), 'gerencia ve las notas de todos los locales');
  ok(await g.locator('.nb-nueva-b').count() >= 2, 'gerencia ve las notas sin leer marcadas como "Nueva"');
  await shot(g, '05-notas-pc');
  await g.locator('.nb-loc', { hasText: 'Trento Café' }).click();
  ok(await g.locator('.nb-card, .nb-postit').count() === 2, 'filtro por local');
  await g.locator('.nb-card', { hasText: 'No llegó la leche' }).click();
  await g.waitForSelector('dialog[open] .nb-det');
  ok(!!db.notas.find(n => n.titulo === 'No llegó la leche').leida_en, 'abrir la nota la marca como leída');
  await shot(g, '06-detalle-pc');
  await g.keyboard.press('Escape');
  await g.locator('.nb-loc', { hasText: 'Todos' }).first().click();
  await g.getByRole('button', { name: 'Nueva nota' }).click();
  await g.waitForSelector('dialog[open] .nb-form');
  await g.getByLabel('Título').fill('Inventario el domingo');
  await g.getByLabel('Para').selectOption({ label: 'Brooklyn' });
  await shot(g, '07-nueva-nota-pc');
  await g.getByRole('button', { name: 'Publicar nota' }).click();
  await g.waitForSelector('.toast >> text=Nota publicada');
  const ng = db.notas.find(n => n.titulo === 'Inventario el domingo');
  ok(ng && ng.local_id === L3 && ng.autor_rol === 'gerencia' && ng.autor_nombre === 'Jacobo', 'gerencia deja una nota para un local');
  await cG.close();

  // ===== Gerencia · iPhone =====
  const { c: cG2, p: g2 } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' }, U_GER);
  await g2.goto(BASE + '#/notas');
  await g2.waitForSelector('.nb-postit');
  await shot(g2, '08-notas-gerencia-m');
  await cG2.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); errores.forEach(x => console.log(' - ' + x)); fallas += errores.length; }
  console.log(`\n${fallas ? fallas + ' FALLA(S)' : 'Todo OK'} · capturas en ${OUT}`);
  process.exit(fallas ? 1 : 0);
})().catch(err => { console.error('ERROR:', err); process.exit(1); });
