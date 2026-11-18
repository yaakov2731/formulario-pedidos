#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de la fase 4 · Pedido sugerido: Pedir abre con lo sugerido cargado,
// agrupado por proveedor con su corte; sin historial deja el campo vacío; lo pedido sin recibir se descuenta; Mis pedidos
// queda abajo de Pedir (y #/mis-pedidos lleva ahí); gerencia ve el sugerido al cargar un pedido para un local.
// API de Supabase mockeada y reloj fijo (lunes 10 h). Capturas a 390 y 1366 px (viewport, escala 2).
// Uso: node scripts/e2e-sugerido.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/sugerido');
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
const L1 = 'loc-umo', L2 = 'loc-tre';
const U_ENC = 'usr-enc', U_GER = 'usr-ger';
const PV = { barcena: 'prv-barcena', florida: 'prv-florida', martin: 'prv-martin' };
const LOCALES = [
  { id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true },
  { id: L2, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true }
];
const PROVS = [
  { id: PV.barcena, nombre: 'Barcena', whatsapp: '', dias_entrega: '1 día', corte: null, tiene_minimo: false, activo: true },
  { id: PV.florida, nombre: 'Distribuidora Florida', whatsapp: '', dias_entrega: '1 día', corte: null, tiene_minimo: false, activo: true },
  { id: PV.martin, nombre: 'Martín De Ridder', whatsapp: '', dias_entrega: '1 día', corte: null, tiene_minimo: true, activo: true }
];
const prod = (id, nombre, cat, uc, uu, factor, prov, local = L1) => ({ id, codigo: id.toUpperCase(), nombre, local_id: local, categoria: cat, unidad_compra: uc, unidad_uso: uu, factor_conversion: factor, proveedor_id: prov, par: 99, es_elaborado: false, activo: true, oculto: false });
const P = [
  prod('chorizo', 'Chorizo parrillero', 'Carnes', 'kg', 'kg', 1, PV.barcena),
  prod('nuevo', 'Morcilla nueva', 'Carnes', 'kg', 'kg', 1, PV.barcena),
  prod('papas', 'Papas', 'Verdulería', 'kg', 'kg', 1, PV.barcena),
  prod('cerveza', 'Cerveza rubia lata 473 ml', 'Bebidas', 'caja', 'unidad', 6, PV.florida),
  prod('agua', 'Agua sin gas 500 ml', 'Bebidas', 'pack', 'unidad', 12, PV.florida),
  prod('nalga', 'Nalga', 'Carnes', 'kg', 'kg', 1, PV.martin),
  prod('servilleta', 'Servilletas de papel', 'Descartables', 'paquete', 'paquete', 1, null),
  prod('cafe', 'Café en grano', 'Café', 'kg', 'kg', 1, PV.barcena, L2)
];
const STOCK = { chorizo: 3, nuevo: 0, papas: 20, cerveza: 12, agua: 30, nalga: 2, servilleta: 1, cafe: 1 };

const LUNES = new Date('2026-11-09T10:00:00-03:00');
const haceTs = (n, h = 15) => new Date(Date.UTC(2026, 10, 9 - n, h + 3, 0)).toISOString(); // h hora local (UTC−3)
const haceDia = (n) => new Date(Date.UTC(2026, 10, 9 - n)).toISOString().slice(0, 10);
function base() {
  const movs = [];
  for (let n = 1; n <= 28; n++) {
    movs.push({ local_id: L1, producto_id: 'chorizo', tipo: 'venta', cantidad: -2, creado_en: haceTs(n) });   // 2 kg/día → 2 × 11 − 3 = 19
    movs.push({ local_id: L1, producto_id: 'cerveza', tipo: 'venta', cantidad: -3, creado_en: haceTs(n) });   // 3 latas/día → 33 − 12 − 2 cajas = 9 → 2 cajas
    movs.push({ local_id: L1, producto_id: 'papas', tipo: 'produccion_consumo', cantidad: -1, creado_en: haceTs(n) }); // 11 − 20 → 0
    movs.push({ local_id: L1, producto_id: 'agua', tipo: 'venta', cantidad: -2, creado_en: haceTs(n) });      // 22 − 30 → 0
    movs.push({ local_id: L2, producto_id: 'cafe', tipo: 'venta', cantidad: -1, creado_en: haceTs(n) });
  }
  for (let n = 1; n <= 4; n++) movs.push({ local_id: L1, producto_id: 'nuevo', tipo: 'venta', cantidad: -5, creado_en: haceTs(n) }); // 4 días: sin historial
  const hoja = [];
  for (let n = 1; n <= 20; n++) { // nalga contada en Cocina: 4 kg por día → 44 − 2 = 42
    hoja.push({ id: 'ha' + n, local_id: L1, fecha: haceDia(n), sector: 'Cocina', producto_id: 'nalga', tipo: 'apertura', cantidad: 10, otro: null, quien: 'Lucas', creado_en: haceTs(n, 9) });
    hoja.push({ id: 'hc' + n, local_id: L1, fecha: haceDia(n), sector: 'Cocina', producto_id: 'nalga', tipo: 'cierre', cantidad: 6, otro: null, quien: 'Lucas', creado_en: haceTs(n, 23) });
  }
  const ordenes = [
    { id: 'o-flo', local_id: L1, proveedor_id: PV.florida, estado: 'enviada', creado_en: haceTs(3, 11), cargado_por_nombre: 'Lucas', nota: null,
      orden_items: [{ id: 'i1', producto_id: 'cerveza', cantidad_pedida: 2, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false }] },
    { id: 'o-bar', local_id: L1, proveedor_id: PV.barcena, estado: 'recibida', creado_en: haceTs(6, 11), cargado_por_nombre: 'Lucas', nota: 'Antes de las 10',
      orden_items: [{ id: 'i2', producto_id: 'chorizo', cantidad_pedida: 12, cantidad_recibida: 12, excluido: false, agregado: false, no_vino: false },
        { id: 'i3', producto_id: 'papas', cantidad_pedida: 15, cantidad_recibida: 15, excluido: false, agregado: false, no_vino: false }] },
    { id: 'o-rid', local_id: L1, proveedor_id: PV.martin, estado: 'parcial', creado_en: haceTs(10, 11), cargado_por_nombre: 'Maru', nota: null,
      orden_items: [{ id: 'i4', producto_id: 'nalga', cantidad_pedida: 8, cantidad_recibida: 8, excluido: false, agregado: false, no_vino: false }] }
  ];
  return { log: [], posts: [], movs, hoja, ordenes };
}

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
    else if (v.startsWith('gte.')) r = r.filter(x => String(x[k]) >= v.slice(4));
    else if (v.startsWith('lte.')) r = r.filter(x => String(x[k]) <= v.slice(4));
    else if (v.startsWith('in.(')) { const l = v.slice(4, -1).split(','); r = r.filter(x => l.includes(String(x[k]))); }
  }
  return r;
};
let nid = 0;
function montarApi(ctx, db) {
  return ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ t, rol, m: req.method() });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    const mio = (r) => rol === 'gerencia' || r.local_id === L1;
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: 'Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(filtro(LOCALES, q));
    if (t === 'proveedores_basico' || t === 'proveedores') return json(PROVS);
    if (t === 'productos') return json(filtro(P.filter(mio), q));
    if (t === 'stock_actual') return json(filtro(P.filter(mio).map(p => ({ local_id: p.local_id, producto_id: p.id, stock: STOCK[p.id] })), q));
    if (t === 'precio_actual' || t === 'precios') return json([]);
    if (t === 'hoja_movs') return json(filtro(db.hoja.filter(mio), q));
    if (t === 'movimientos') return json(filtro(db.movs.filter(mio), q));
    if (t === 'ordenes_compra' && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); const o = { ...b, id: 'o-n' + (++nid), creado_en: LUNES.toISOString(), orden_items: [] };
      db.ordenes.unshift(o); db.posts.push({ t, b }); return json([{ id: o.id }], 201);
    }
    if (t === 'orden_items' && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '[]'); const arr = Array.isArray(b) ? b : [b];
      for (const i of arr) { const o = db.ordenes.find(x => x.id === i.orden_id); if (o) o.orden_items.push({ id: 'i-n' + (++nid), ...i, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false }); }
      db.posts.push({ t, b: arr }); return route.fulfill({ status: 201, headers: cors, body: '' });
    }
    if (t === 'ordenes_compra') return json(filtro(db.ordenes.filter(mio), q).map(o => ({ ...o, orden_items: o.orden_items || [] })));
    if (t === 'notas' || t === 'conteos') return json([]);
    if (t === 'rpc/buscar_productos') return json([]);
    errores.push('mock: ruta no prevista ' + req.method() + ' ' + u.pathname + ' (' + rol + ')');
    return json({ message: 'mock: ruta no prevista ' + t }, 404);
  });
}

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const limpiar = (p) => p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); });
const shot = async (p, n) => { await limpiar(p); await p.waitForTimeout(250); return p.screenshot({ path: path.join(OUT, n + '.png') }); };
const valor = (p, id) => p.locator(`.prod[data-id="${id}"] .step-val`).inputValue();

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1366: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 } };
  const abrir = async (ancho, sub, db, ruta = '') => {
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
    await p.clock.setFixedTime(LUNES);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const sinDesborde = async (p) => {
    const malos = await p.evaluate(() => [...(document.documentElement.scrollWidth > innerWidth ? ['ventana'] : []),
      ...[...document.querySelectorAll('.pv-n, .pv-c, .ped-prov, .titulo')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.className + ': ' + e.textContent)]);
    if (malos.length) console.log('   desborde: ' + malos.join(' | '));
    return !malos.length;
  };
  const conSugerido = (p) => p.waitForSelector('.prod[data-id="chorizo"][data-sug="19"]');

  for (const ancho of [390, 1366]) {
    const db = base();
    const { c, p } = await abrir(ancho, U_ENC, db, '#/pedir');
    await conSugerido(p);
    if (ancho === 390) {
      ok(await valor(p, 'chorizo') === '19', 'con historial: chorizo viene cargado con Pedir 19 (2 kg/día × 11 − 3)');
      ok(await valor(p, 'cerveza') === '2', 'con pedido sin recibir: cerveza Pedir 2 cajas (33 − 12 − 2 cajas × 6 = 9 latas, al bulto)');
      ok(await valor(p, 'nalga') === '42', 'hoja por sector: nalga Pedir 42 (4 kg/día × 11 − 2)');
      ok(await valor(p, 'papas') === '0' && await valor(p, 'agua') === '0', 'lo que alcanza queda en 0');
      ok(await valor(p, 'nuevo') === '' && /Sin historial todavía/.test(await p.locator('.prod[data-id="nuevo"]').innerText()), 'sin historial: campo vacío y "Sin historial todavía"');
      ok(await p.locator('.prod[data-id="chorizo"] .sin-hist').count() === 0, 'con historial no dice "Sin historial"');
      const grupos = await p.locator('.pv-t').evaluateAll(xs => xs.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
      ok(grupos.join(' | ') === 'Barcena Cierra el miércoles | Distribuidora Florida Cierra el miércoles | Martín De Ridder Cierra el miércoles 12 h | Sin proveedor', 'agrupado por proveedor, con el corte a la derecha · ' + grupos.join(' | '));
      ok(/Confirmar pedido · 3 ítems/.test(await p.locator('.pill').innerText()), 'botón grande: Confirmar pedido · 3 ítems (lo sugerido)');
      const txt = await p.locator('#view').innerText();
      ok(!/\$|precio|costo|m[ií]nimo|\bpar\b|consumo|promedio/i.test(txt), 'encargado: sin precios, mínimo, par ni cálculos a la vista');
      ok(await p.locator('#mis-pedidos .ped').count() === 3, 'Mis pedidos abajo de Pedir con 3 pedidos');
      ok(await sinDesborde(p), '390: sin desbordes ni texto cortado');
      await shot(p, 'pedir-sugerido-390');
      await p.locator('.prod[data-id="nuevo"]').scrollIntoViewIfNeeded();
      await p.locator('#scroller').evaluate(el => el.scrollBy(0, -200));
      await shot(p, 'pedir-sin-historial-390');
      // El encargado corrige: chorizo a 15 y nalga a 0; queda guardado al volver a entrar.
      await p.locator('.prod[data-id="chorizo"] .step-val').fill('15'); await p.locator('.prod[data-id="chorizo"] .step-val').press('Tab');
      await p.locator('.prod[data-id="nalga"] .step-val').fill('0'); await p.locator('.prod[data-id="nalga"] .step-val').press('Tab');
      await p.reload(); await conSugerido(p);
      ok(await valor(p, 'chorizo') === '15' && await valor(p, 'nalga') === '0' && await valor(p, 'cerveza') === '2', 'lo corregido queda guardado (15 y 0) y lo demás sigue sugerido');
      ok(/Confirmar pedido · 2 ítems/.test(await p.locator('.pill').innerText()), 'el botón cuenta lo corregido · ' + await p.locator('.pill').innerText());
      // #/mis-pedidos lleva a Pedir con Mis pedidos a la vista.
      await p.goto(BASE + '#/mis-pedidos'); await p.waitForSelector('#mis-pedidos .ped');
      await p.waitForTimeout(300);
      ok(await p.locator('.tab.is-active').innerText() === 'Pedir', '#/mis-pedidos marca la pestaña Pedir');
      const enVista = await p.locator('#mis-pedidos').evaluate(el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
      ok(enVista, '#/mis-pedidos muestra la sección Mis pedidos');
      await p.locator('#mis-pedidos .ped-b').first().click();
      await shot(p, 'mis-pedidos-390');
      // Confirmar y enviar: viajan las cantidades sugeridas y corregidas; después lo enviado no se vuelve a sugerir.
      await p.goto(BASE + '#/pedir'); await conSugerido(p).catch(() => {});
      await p.locator('.pill').click(); await p.waitForSelector('.grupo-prov');
      await p.getByRole('button', { name: 'Enviar pedido' }).click();
      await p.waitForSelector('#mis-pedidos .ped');
      const items = db.posts.filter(x => x.t === 'orden_items').flatMap(x => x.b);
      const de = (id) => (items.find(i => i.producto_id === id) || {}).cantidad_pedida;
      ok(items.length === 2 && de('chorizo') === 15 && de('cerveza') === 2, 'se envía chorizo 15 (corregido) y cerveza 2 (sugerido) · ' + JSON.stringify(items.map(i => [i.producto_id, i.cantidad_pedida])));
      ok(db.posts.filter(x => x.t === 'ordenes_compra').every(x => x.b.estado === 'borrador'), 'órdenes en borrador');
      await p.waitForTimeout(400);
      ok(await valor(p, 'chorizo') === '0' && await valor(p, 'cerveza') === '0', 'lo recién enviado pasa a "sin recibir" y el sugerido queda en 0');
      ok(await p.locator('#mis-pedidos .ped').count() === 5, 'Mis pedidos suma los 2 enviados');
      ok(db.log.filter(l => l.rol === 'encargado').every(l => !/precio|ventas|receta|factura/.test(l.t)), 'el encargado no consulta precios, ventas, recetas ni facturas');
    } else {
      ok(await sinDesborde(p), '1366: sin desbordes ni texto cortado');
      await shot(p, 'pedir-sugerido-1366');
      await p.locator('.prod[data-id="nuevo"]').scrollIntoViewIfNeeded();
      await shot(p, 'pedir-sin-historial-1366');
      await p.goto(BASE + '#/mis-pedidos'); await p.waitForSelector('#mis-pedidos .ped'); await p.waitForTimeout(300);
      await p.locator('#mis-pedidos .ped-b').first().click();
      await shot(p, 'mis-pedidos-1366');
    }
    await c.close();
  }

  // Gerencia carga un pedido en nombre de Umo: ve el mismo sugerido, sin Mis pedidos.
  {
    const db = base();
    const { c, p } = await abrir(1366, U_GER, db, '#/cargar');
    await p.waitForSelector('.cargar-local');
    const chip = p.locator('.cargar-local button', { hasText: 'Umo Grill' });
    if (await chip.count()) await chip.first().click();
    await conSugerido(p);
    ok(await valor(p, 'chorizo') === '19' && await valor(p, 'nuevo') === '', 'gerencia: Cargar pedido para Umo trae el sugerido (y vacío sin historial)');
    ok(await p.locator('#mis-pedidos').count() === 0, 'gerencia: sin sección Mis pedidos (tiene Compras)');
    await shot(p, 'cargar-gerencia-1366');
    await c.close();
  }

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); for (const e of [...new Set(errores)]) console.log(' - ' + e); }
  const total = fallas + (errores.length ? 1 : 0);
  console.log(total ? `\n${total} FALLA(S) · capturas en ${OUT}` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
