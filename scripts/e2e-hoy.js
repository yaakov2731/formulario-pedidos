#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) del rediseño estilo Apple, fases 2 y 3: barra de 4 pestañas, Más y las
// pantallas Hoy del encargado, del Shopping y de gerencia (con datos y vacía). API de Supabase mockeada y reloj fijo.
// Capturas a 390 y 1366 px (viewport, escala 2). Uso: node scripts/e2e-hoy.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/rediseno-apple/fase2-3');
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

// ---------- datos ----------
const L1 = 'loc-umo', L2 = 'loc-shp', L3 = 'loc-tre';
const U_ENC = 'usr-enc', U_SHP = 'usr-shp', U_GER = 'usr-ger';
const PV = { barcena: 'prv-barcena', florida: 'prv-florida', martin: 'prv-martin' };
const LOCALES = [
  { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true },
  { id: L2, codigo: 'SHP', nombre: 'Shopping', encargados: ['Marcos'], activo: true },
  { id: L3, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true }
];
const PROVS = [
  { id: PV.barcena, nombre: 'Barcena', whatsapp: '', dias_entrega: 'Lunes y miércoles', corte: null, tiene_minimo: false, activo: true },
  { id: PV.florida, nombre: 'Distribuidora Florida', whatsapp: '', dias_entrega: 'Sábado', corte: 'Miércoles', tiene_minimo: false, activo: true },
  { id: PV.martin, nombre: 'Martín De Ridder', whatsapp: '', dias_entrega: 'Martes y viernes', corte: null, tiene_minimo: true, activo: true }
];
let seq = 0;
const prod = (nombre, cat, uu, lugar, local, prov) => ({ id: 'p' + (++seq), codigo: 'X-' + seq, nombre, local_id: local, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: prov, par: null, es_elaborado: false, activo: true, oculto: false, lugar, orden_lugar: seq });
const P = {
  coca: prod('Coca-Cola 500 ml', 'Bebidas', 'unidad', 'Barra', L1, PV.florida),
  limon: prod('Limones', 'Verdulería', 'kg', 'Barra', L1, PV.barcena),
  nalga: prod('Nalga', 'Carnes', 'kg', 'Cocina', L1, PV.martin),
  papas: prod('Papas', 'Verdulería', 'kg', 'Cocina', L1, PV.barcena),
  papel: prod('Papel higiénico', 'Limpieza', 'rollo', null, L2, PV.barcena),
  lavandina: prod('Lavandina', 'Limpieza', 'bidón', null, L2, PV.barcena),
  cafe: prod('Café en grano', 'Café', 'kg', null, L3, PV.barcena)
};
const PRECIOS = { [P.coca.id]: 900, [P.limon.id]: 2000, [P.nalga.id]: 12000, [P.papas.id]: 900, [P.papel.id]: 450, [P.lavandina.id]: 3800, [P.cafe.id]: 21000 };

function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 30 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 30 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}
const subDe = (req) => { try { return JSON.parse(Buffer.from((req.headers().authorization || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch (_e) { return null; } };
const filtro = (rows, q) => {
  let r = rows;
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) r = r.filter(x => String(x[k]) === v.slice(3));
    else if (v.startsWith('neq.')) r = r.filter(x => String(x[k]) !== v.slice(4));
    else if (v.startsWith('gte.')) r = r.filter(x => (typeof x[k] === 'number' ? x[k] >= Number(v.slice(4)) : String(x[k]) >= v.slice(4)));
    else if (v.startsWith('lte.')) r = r.filter(x => String(x[k]) <= v.slice(4));
    else if (v.startsWith('in.(')) { const l = v.slice(4, -1).split(','); r = r.filter(x => l.includes(String(x[k]))); }
  }
  return r;
};

// Cada escenario arma su propia base (db) y su reloj.
function montarApi(ctx, db) {
  return ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const miLocal = sub === U_SHP ? L2 : L1;
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ t, rol });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: sub === U_SHP ? 'Shopping' : 'Umo', rol: 'encargado', local_id: miLocal }]);
    if (t === 'locales') return json(filtro(LOCALES, q));
    if (t === 'proveedores_basico' || t === 'proveedores') return json(PROVS);
    if (t === 'productos') return json(filtro(Object.values(P).filter(p => rol === 'gerencia' || p.local_id === miLocal), q));
    if (t === 'stock_actual') return json([]);
    if (t === 'precio_actual') return json(rol === 'gerencia' ? Object.entries(PRECIOS).map(([producto_id, precio]) => ({ producto_id, precio })) : []);
    if (t === 'hoja_movs') return json(filtro(rol === 'gerencia' ? db.hoja : db.hoja.filter(m => m.local_id === miLocal), q));
    if (t === 'movimientos') return json(filtro(db.movs, q));
    if (t === 'ordenes_compra') {
      let r = filtro(db.ordenes, q); if (rol === 'encargado') r = r.filter(o => o.local_id === miLocal);
      return json(r.map(o => ({ ...o, orden_items: o.orden_items || [] })));
    }
    if (t === 'facturas_pendientes') return rol === 'gerencia' ? json(filtro(db.facturas, q)) : json({ code: '42501', message: 'permission denied' }, 403);
    if (t === 'rpc/tablero') return rol === 'gerencia' ? json(db.tablero) : json({ code: '42501', message: 'permission denied' }, 403);
    if (t === 'notas' || t === 'conteos') return json([]);
    errores.push('mock: ruta no prevista ' + req.method() + ' ' + u.pathname + (rol ? ' (' + rol + ')' : ''));
    return json({ message: 'mock: ruta no prevista ' + t }, 404);
  });
}

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const limpiar = (p) => p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); });
const shot = async (p, n) => { await limpiar(p); await p.waitForTimeout(250); return p.screenshot({ path: path.join(OUT, n + '.png') }); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const texto = async (p, sel) => (await p.locator(sel).allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1366: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 } };
  const abrir = async (ancho, sub, db, cuando, ruta = '') => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: 'dark', ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, db);
    await c.addInitScript(([s, nombre]) => {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:nombre', JSON.stringify(nombre));
    }, [sesion(sub), sub === U_GER ? 'Jacobo' : 'Lucas']);
    const p = await c.newPage();
    await p.clock.setFixedTime(cuando);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.lg-n, .lg-s, .lg-v, .gh-sem-v, .titulo, .tab span, .side-link span')]
    .filter(e => e.offsetParent).every(e => e.scrollWidth <= e.clientWidth + 1));

  // ===== 1) Encargado de Umo · lunes 19 h =====
  const LUNES = new Date('2026-11-09T19:00:00-03:00'), hoyL = '2026-11-09';
  const dbEnc = { log: [], hoja: [
    { id: 'h1', local_id: L1, fecha: hoyL, sector: 'Barra', producto_id: P.coca.id, tipo: 'apertura', cantidad: 24, otro: null, quien: 'Lucas', creado_en: '2026-11-09T13:05:00Z' }
  ], movs: [], facturas: [], tablero: null, ordenes: [
    { id: 'o-env', local_id: L1, proveedor_id: PV.barcena, estado: 'enviada', creado_en: '2026-11-05T12:00:00Z', cargado_por_nombre: 'Lucas', nota: null, orden_items: [{ producto_id: P.limon.id, cantidad_pedida: 3 }] }
  ] };
  for (const ancho of [390, 1366]) {
    const { c, p } = await abrir(ancho, U_ENC, dbEnc, LUNES);
    await p.waitForSelector('.hoy-lista');
    if (ancho === 390) {
      ok(await p.locator('h1').first().innerText() === 'Hoy', 'encargado: abre en Hoy');
      const tareas = await p.locator('[data-tarea]').evaluateAll(xs => xs.map(x => x.getAttribute('data-tarea')));
      ok(tareas.join(',') === 'abrir,pedir,llego,cerrar', 'encargado (lunes 19 h): abrir Cocina → pedido → llegó mercadería → cerrar Barra · ' + tareas.join(','));
      const txt = await texto(p, '[data-tarea]');
      ok(/^Abrir Cocina/.test(txt[0]) && /^Hacer el pedido Cierra el miércoles/.test(txt[1]) && /^Llegó mercadería Barcena/.test(txt[2]) && /^Cerrar Barra/.test(txt[3]), 'encargado: textos de las tareas · ' + txt.join(' / '));
      ok(/Abrir Barra 10:05/.test((await texto(p, '.hoy-hechas .lg-fila')).join(' ')), 'encargado: lo hecho queda abajo, con la hora');
      ok(!/\$|precio|costo|m[ií]nimo|\bpar\b/i.test(await p.locator('#view').innerText()), 'encargado: sin plata, mínimo ni par');
      ok((await texto(p, '.tabbar .tab')).join('|') === 'Hoy|Pedir|Hoja|Más', 'encargado: barra Hoy · Pedir · Hoja · Más');
      ok(await sinDesborde(p), 'encargado 390: sin desbordes ni texto cortado');
      await shot(p, 'hoy-encargado-390');
      await p.locator('.tabbar').screenshot({ path: path.join(OUT, 'barra-encargado-390.png') });
      // La tarea lleva a la hoja del sector y "‹ Hoy" vuelve.
      await p.locator('[data-tarea="abrir"]').click();
      await p.waitForSelector('.volver-hoy');
      await p.waitForSelector('.hj-fila, .hj-paso, .hj-sector');
      ok(/Cocina/.test(await p.locator('#view').innerText()) && await p.locator('.tab.is-active').innerText() === 'Hoja', 'Abrir Cocina lleva a la hoja de Cocina (pestaña Hoja)');
      await shot(p, 'hoy-encargado-tarea-390');
      await p.locator('.volver-hoy').click();
      await p.waitForSelector('.hoy-lista');
      ok(await p.locator('.tab.is-active').innerText() === 'Hoy', '"‹ Hoy" vuelve a Hoy');
      await p.locator('.tab[data-nav="mas"]').click(); await p.waitForSelector('.mas-link');
      ok((await texto(p, '.mas-link .lg-n')).join('|') === 'Facturas|Notas', 'encargado: Más con Facturas y Notas');
      await shot(p, 'mas-encargado-390');
      await p.goto(BASE + '#/mis-pedidos'); await p.waitForSelector('.ped, .empty');
      ok(await p.locator('.tab.is-active').innerText() === 'Pedir', 'ruta vieja #/mis-pedidos sigue andando (dentro de Pedir)');
      await p.goto(BASE + '#/contar'); await p.waitForSelector('#view .vista');
      ok(await p.locator('.tab.is-active').innerText() === 'Hoja', 'ruta vieja #/contar sigue andando (dentro de Hoja)');
      ok(dbEnc.log.filter(l => l.rol === 'encargado').every(l => !/factura|tablero|precio/.test(l.t)), 'encargado: Hoy no consulta facturas, tablero ni precios');
    } else {
      ok(await sinDesborde(p), 'encargado 1366: sin desbordes ni texto cortado');
      ok((await texto(p, '.sidebar .side-link')).join('|') === 'Hoy|Pedir|Hoja|Más|Salir', 'encargado PC: barra lateral Hoy · Pedir · Hoja · Más + Salir');
      await shot(p, 'hoy-encargado-1366');
      await p.locator('.sidebar').screenshot({ path: path.join(OUT, 'barra-encargado-1366.png') });
    }
    await c.close();
  }

  // ===== 2) Shopping · lunes 9 h =====
  const LUNES9 = new Date('2026-11-09T09:00:00-03:00');
  const dbShp = { log: [], hoja: [], movs: [], facturas: [], tablero: null, ordenes: [] };
  for (const ancho of [390, 1366]) {
    const { c, p } = await abrir(ancho, U_SHP, dbShp, LUNES9);
    await p.waitForSelector('.hoy-lista');
    if (ancho === 390) {
      const txt = await texto(p, '[data-tarea]');
      ok(/^Abrir depósito/.test(txt[0]) && /^Hacer el pedido/.test(txt[1]) && txt.length === 2, 'Shopping: "Abrir depósito" y el pedido · ' + txt.join(' / '));
      ok((await texto(p, '.tabbar .tab')).join('|') === 'Hoy|Pedir|Retiros|Más', 'Shopping: barra Hoy · Pedir · Retiros · Más');
      ok(await sinDesborde(p), 'Shopping 390: sin desbordes');
      await shot(p, 'hoy-shopping-390');
      await p.locator('.tab[data-nav="mas"]').click(); await p.waitForSelector('.mas-link');
      ok((await texto(p, '.mas-link .lg-n')).join('|') === 'Hoja del depósito|Facturas|Notas', 'Shopping: Más con la hoja del depósito, Facturas y Notas');
      await p.goto(BASE + '#/elaborados'); await p.waitForFunction(() => location.hash === '#/hoy');
      ok(true, 'Shopping: #/elaborados lleva a Hoy');
    } else {
      await shot(p, 'hoy-shopping-1366');
    }
    await c.close();
  }

  // ===== 3) Gerencia con datos · miércoles 16 h =====
  const MIER = new Date('2026-11-11T16:00:00-03:00'), hoyM = '2026-11-11', ayerM = '2026-11-10';
  const dbGer = { log: [],
    tablero: { actual: { ventas: 4120000, compras: 1890000, cmv: 1300000, margen: 2820000, margen_pct: 68.4 }, anterior: {}, pendientes: { sin_precio: { n: 0 }, sin_proveedor: { n: 0 }, sin_receta: { n: 0 } } },
    ordenes: [
      { id: 'o1', local_id: L1, proveedor_id: PV.barcena, estado: 'borrador', creado_en: '2026-11-10T13:00:00Z', orden_items: [{ id: 'i1', producto_id: P.limon.id, cantidad_pedida: 4 }, { id: 'i2', producto_id: P.papas.id, cantidad_pedida: 10 }] },
      { id: 'o2', local_id: L2, proveedor_id: PV.barcena, estado: 'borrador', creado_en: '2026-11-10T14:00:00Z', orden_items: [{ id: 'i3', producto_id: P.papel.id, cantidad_pedida: 48 }] },
      { id: 'o3', local_id: L1, proveedor_id: PV.florida, estado: 'borrador', creado_en: '2026-11-11T12:00:00Z', orden_items: [{ id: 'i4', producto_id: P.coca.id, cantidad_pedida: 48 }] },
      { id: 'o4', local_id: L1, proveedor_id: PV.barcena, estado: 'enviada', creado_en: '2026-11-09T12:00:00Z', orden_items: [{ id: 'i5', producto_id: P.limon.id, cantidad_pedida: 3 }, { id: 'i6', producto_id: P.papas.id, cantidad_pedida: 8 }] }
    ],
    facturas: [
      { id: 'f1', proveedor_id: PV.martin, numero: '0002-00000046', fecha: '2026-10-20', vencimiento: '2026-11-14', total: 184500, imputado: 0, pendiente: 184500, vencida: false },
      { id: 'f2', proveedor_id: PV.barcena, numero: '0003-00000101', fecha: '2026-10-01', vencimiento: '2026-11-05', total: 62000, imputado: 0, pendiente: 62000, vencida: true },
      { id: 'f3', proveedor_id: PV.florida, numero: '0001-00000220', fecha: '2026-11-01', vencimiento: '2026-12-01', total: 90000, imputado: 0, pendiente: 90000, vencida: false }
    ],
    hoja: [
      // Umo ayer: Cocina abierta y cerrada (se usaron 6 kg de nalga, se vendieron 4 por receta: faltan 2 kg).
      { id: 'g1', local_id: L1, fecha: ayerM, sector: 'Cocina', producto_id: P.nalga.id, tipo: 'apertura', cantidad: 10, otro: null, quien: 'Lucas', creado_en: '2026-11-10T12:00:00Z' },
      { id: 'g2', local_id: L1, fecha: ayerM, sector: 'Cocina', producto_id: P.nalga.id, tipo: 'cierre', cantidad: 4, otro: null, quien: 'Lucas', creado_en: '2026-11-11T02:00:00Z' },
      // Shopping ayer: abrió el depósito y no lo cerró.
      { id: 'g3', local_id: L2, fecha: ayerM, sector: 'Depósito', producto_id: P.papel.id, tipo: 'apertura', cantidad: 120, otro: null, quien: 'Marcos', creado_en: '2026-11-10T12:00:00Z' }
    ],
    movs: [{ local_id: L1, producto_id: P.nalga.id, tipo: 'venta', cantidad: -4, nota: '', creado_en: '2026-11-10T22:00:00Z', ref_id: null }]
  };
  for (const ancho of [390, 1366]) {
    const { c, p } = await abrir(ancho, U_GER, dbGer, MIER);
    await p.waitForSelector('.gh-sem'); await p.waitForSelector('.gh-cargando', { state: 'detached' });
    if (ancho === 390) {
      ok(await p.locator('h1').first().innerText() === 'Hoy', 'gerencia: abre en Hoy');
      ok((await p.locator('.gh-sem').innerText()).replace(/\s+/g, ' ') === 'Ventas $ 4,12 M Compras $ 1,89 M Margen 68 %', 'gerencia: una línea con ventas, compras y margen de la semana');
      ok((await texto(p, '[data-grupo="aprobar"]')).join(' / ') === 'Barcena Shopping · Umo Grill 3 ítems / Distribuidora Florida Umo Grill 1 ítem', 'gerencia: para aprobar por proveedor · ' + (await texto(p, '[data-grupo="aprobar"]')).join(' / '));
      ok((await texto(p, '[data-grupo="entregas"]')).join(' / ') === 'Barcena Umo Grill 2 ítems', 'gerencia: entregas de hoy (Barcena entrega los miércoles)');
      const f = await texto(p, '[data-grupo="facturas"]');
      ok(f.length === 2 && /^Barcena Venció el 05\/11 \$ 62\.000$/.test(f[0]) && /^Martín De Ridder Vence el sáb 14\/11 \$ 184\.500$/.test(f[1]), 'gerencia: facturas vencidas y por vencer en 7 días (no la de diciembre) · ' + f.join(' / '));
      ok((await texto(p, '[data-grupo="diferencias"]')).join(' / ') === 'Umo Grill Ayer · 1 producto −$ 24.000', 'gerencia: diferencias del día en $ · ' + (await texto(p, '[data-grupo="diferencias"]')).join(' / '));
      ok((await texto(p, '[data-grupo="locales"]')).join(' / ') === 'Shopping Sin cierre ayer / Trento Café Sin cierre ayer · Sin pedido esta semana', 'gerencia: locales sin cierre o sin pedido · ' + (await texto(p, '[data-grupo="locales"]')).join(' / '));
      ok(await p.locator('.tb-card, .kpi').count() === 0 && !/estimad/i.test(await p.locator('#view').innerText()), 'gerencia: sin tarjetas grandes ni "margen estimado"');
      ok((await texto(p, '.tabbar .tab')).join('|') === 'Hoy|Compras|Stock|Más', 'gerencia: barra Hoy · Compras · Stock · Más');
      ok(await sinDesborde(p), 'gerencia 390: sin desbordes ni texto cortado');
      await shot(p, 'hoy-gerencia-datos-390');
      await p.locator('#scroller').evaluate(el => el.scrollTo(0, el.scrollHeight));
      await shot(p, 'hoy-gerencia-datos-390-abajo');
      await p.locator('#scroller').evaluate(el => el.scrollTo(0, 0));
      // Más
      await p.locator('.tab[data-nav="mas"]').click(); await p.waitForSelector('.mas-link');
      ok((await texto(p, '.mas-link .lg-n')).join('|') === 'Números|Cocina|Pagos|Catálogo|Notas', 'gerencia: Más con Números, Cocina, Pagos, Catálogo y Notas');
      ok(await sinDesborde(p), 'Más 390: sin desbordes');
      await shot(p, 'mas-gerencia-390');
      await p.goto(BASE + '#/tablero'); await p.waitForFunction(() => location.hash === '#/hoy');
      ok(true, 'gerencia: la ruta vieja #/tablero lleva a Hoy');
    } else {
      ok(await sinDesborde(p), 'gerencia 1366: sin desbordes');
      await shot(p, 'hoy-gerencia-datos-1366');
      await p.locator('.sidebar a[data-nav="mas"]').click(); await p.waitForSelector('.mas-link');
      await shot(p, 'mas-gerencia-1366');
    }
    await c.close();
  }

  // ===== 4) Gerencia sin nada pendiente · lunes 9 h =====
  const dbVacio = { log: [], ordenes: [], facturas: [], movs: [],
    tablero: { actual: { ventas: 0, compras: 0, cmv: 0, margen: 0, margen_pct: null }, anterior: {}, pendientes: { sin_precio: { n: 3 }, sin_proveedor: { n: 0 }, sin_receta: { n: 0 } } },
    hoja: LOCALES.flatMap((l, i) => ['apertura', 'cierre'].map((tipo) => ({ id: `v${i}${tipo}`, local_id: l.id, fecha: '2026-11-08', sector: 'Depósito', producto_id: Object.values(P).find(x => x.local_id === l.id).id, tipo, cantidad: 5, otro: null, quien: 'x', creado_en: '2026-11-08T15:00:00Z' }))) };
  for (const ancho of [390, 1366]) {
    const { c, p } = await abrir(ancho, U_GER, dbVacio, LUNES9);
    await p.waitForSelector('.gh-sem'); await p.waitForSelector('.gh-cargando', { state: 'detached' });
    if (ancho === 390) {
      ok(await p.locator('.empty-t').innerText() === 'Todo listo por hoy', 'gerencia vacía: "Todo listo por hoy"');
      ok((await p.locator('.gh-sem').innerText()).replace(/\s+/g, ' ') === 'Ventas Falta cargar Compras $ 0 Margen Sin historial todavía', 'gerencia vacía: sin ventas dice "Falta cargar", sin inventar margen · ' + (await p.locator('.gh-sem').innerText()).replace(/\s+/g, ' '));
      ok(await sinDesborde(p), 'gerencia vacía 390: sin desbordes');
    }
    await shot(p, 'hoy-gerencia-vacio-' + ancho);
    await c.close();
  }

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); for (const e of [...new Set(errores)]) console.log(' - ' + e); }
  const total = fallas + (errores.length ? 1 : 0);
  console.log(total ? `\n${total} FALLA(S) · capturas en ${OUT}` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
