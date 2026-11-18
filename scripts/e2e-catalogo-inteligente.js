#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) del catálogo inteligente en Pedir: "Lo de siempre" (lo más pedido por el
// local), búsqueda que perdona errores de tipeo ("chorzio", "muzarela", "cocacola"), lo más usado primero entre parecidos,
// atajos al tocar el buscador vacío y uso anotado en el celular. API de Supabase mockeada, reloj fijo (lunes 10 h).
// Uso: node scripts/e2e-catalogo-inteligente.js [carpeta-de-capturas]   (SIN_FUENTES=1 para no bajar la letra Geist)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/catalogo-inteligente');
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
  prod('coca', 'Coca Cola 1,5 L', 'Bebidas', 'pack', 'unidad', 6, PV.florida),
  prod('tomate', 'Tomate perita', 'Verdulería', 'kg', 'kg', 1, PV.barcena),
  prod('pure', 'Puré de tomate', 'Almacén', 'caja', 'unidad', 12, PV.barcena),
  prod('muzza', 'Muzzarella', 'Lácteos', 'kg', 'kg', 1, PV.barcena),
  prod('cafe', 'Café en grano', 'Café', 'kg', 'kg', 1, PV.barcena, L2)
];
const STOCK = { coca: 6, tomate: 4, pure: 10, muzza: 2, chorizo: 3, nuevo: 0, papas: 20, cerveza: 12, agua: 30, nalga: 2, servilleta: 1, cafe: 1 };

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
  // Historial de pedidos: puré de tomate y chorizo se piden casi todas las semanas; tomate perita una sola vez hace mucho.
  for (let n = 1; n <= 5; n++) ordenes.push({ id: 'o-h' + n, local_id: L1, proveedor_id: PV.barcena, estado: 'recibida', creado_en: haceTs(7 * n, 11), cargado_por_nombre: 'Lucas', nota: null,
    orden_items: [{ id: 'ih' + n, producto_id: 'pure', cantidad_pedida: 2, cantidad_recibida: 2 }, { id: 'ic' + n, producto_id: 'chorizo', cantidad_pedida: 10, cantidad_recibida: 10 }, { id: 'im' + n, producto_id: 'muzza', cantidad_pedida: 4, cantidad_recibida: 4 }] });
  ordenes.push({ id: 'o-viejo', local_id: L1, proveedor_id: PV.barcena, estado: 'recibida', creado_en: haceTs(60, 11), cargado_por_nombre: 'Lucas', nota: null,
    orden_items: [{ id: 'it', producto_id: 'tomate', cantidad_pedida: 3, cantidad_recibida: 3 }] });
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
    if (process.env.SIN_FUENTES) await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
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


  const nombres = (p) => p.locator('#lista-prod .prod .prod-n').evaluateAll(xs => xs.map(x => x.textContent.trim()));
  const buscarTxt = async (p, t) => { await p.locator('#buscar').fill(t); await p.waitForTimeout(450); };
  for (const ancho of [390, 1366]) {
    const db = base();
    const { c, p } = await abrir(ancho, U_ENC, db, '#/pedir');
    await conSugerido(p);
    await p.waitForSelector('.chip-frec');
    if (ancho === 390) {
      // 1) Lo de siempre: lo más pedido por el local, de más a menos.
      await p.locator('.chip-frec').click(); await p.waitForTimeout(200);
      const top = await nombres(p);
      ok(top[0] === 'Chorizo parrillero' && top.includes('Puré de tomate') && top.includes('Muzzarella'), 'Lo de siempre: primero lo que más pide el local · ' + top.join(', '));
      ok(!top.includes('Agua sin gas 500 ml') && !top.includes('Coca Cola 1,5 L'), 'Lo de siempre: no muestra lo que nunca se pidió');
      ok(/Última: 12 kg/.test(await p.locator('.prod[data-id="chorizo"] .prod-uso').innerText()), 'cada producto dice cuánto se pidió la última vez');
      const txt = await p.locator('#view').innerText();
      ok(!/\$|precio|costo|m[ií]nimo|\bpar\b/i.test(txt), 'encargado: sin precios, mínimo ni par');
      await shot(p, 'lo-de-siempre-390');
      // 2) Errores de tipeo.
      await p.locator('.chip[data-cat="todas"]').click();
      await buscarTxt(p, 'chorzio');
      let r = await nombres(p);
      ok(r[0] === 'Chorizo parrillero', '"chorzio" encuentra Chorizo parrillero · ' + r.join(', '));
      ok(await p.locator('.prod[data-id="chorizo"] .tag-aprox').count() === 1 && /Quisiste decir/.test(await p.locator('.quisiste').innerText()), 'marca "Parecido" y pregunta "¿Quisiste decir…?"');
      await shot(p, 'buscar-con-error-390');
      await buscarTxt(p, 'muzarela'); r = await nombres(p);
      ok(r[0] === 'Muzzarella', '"muzarela" encuentra Muzzarella · ' + r.join(', '));
      await buscarTxt(p, 'cocacola'); r = await nombres(p);
      ok(r[0] === 'Coca Cola 1,5 L', '"cocacola" encuentra Coca Cola 1,5 L · ' + r.join(', '));
      // 3) Entre parecidos, primero lo que más se usa.
      await buscarTxt(p, 'tomate'); r = await nombres(p);
      ok(r[0] === 'Puré de tomate' && r.includes('Tomate perita'), '"tomate": primero el puré (se pide todas las semanas), después tomate perita · ' + r.join(', '));
      await shot(p, 'buscar-lo-mas-usado-390');
      // 4) Atajos al tocar el buscador vacío.
      await p.locator('.busca-x').click(); await p.locator('#buscar').focus(); await p.waitForTimeout(250);
      ok(await p.locator('.atajos').isVisible(), 'al tocar el buscador vacío aparecen los atajos "Lo que más pedís"');
      const at = await p.locator('.atajo').evaluateAll(xs => xs.map(x => x.textContent));
      ok(at[0] === 'Chorizo parrillero' && at.length >= 3, 'atajos en orden de uso · ' + at.join(', '));
      await shot(p, 'atajos-390');
      await p.locator('.atajo', { hasText: 'Muzzarella' }).click(); await p.waitForTimeout(450);
      r = await nombres(p);
      ok(r[0] === 'Muzzarella' && await p.locator('#buscar').inputValue() === 'Muzzarella', 'tocar un atajo lleva directo al producto');
      // 5) Lo que se toca en el celular también cuenta.
      await p.locator('.busca-x').click();
      await buscarTxt(p, 'coca');
      await p.locator('.prod[data-id="coca"] .step-btn').last().click();
      const uso = await p.evaluate(() => JSON.parse(localStorage.getItem('stock:uso:loc-umo') || '{}'));
      ok(uso.coca && uso.coca.s > 0, 'lo que se suma al pedido queda anotado como usado en el celular');
      ok(errores.length === 0, 'sin errores de consola');
    } else {
      await shot(p, 'pedir-1366');
      await buscarTxt(p, 'tomate');
      await shot(p, 'buscar-1366');
    }
    await c.close();
  }

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); for (const e of [...new Set(errores)]) console.log(' - ' + e); }
  const total = fallas + (errores.length ? 1 : 0);
  console.log(total ? `\n${total} FALLA(S) · capturas en ${OUT}` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
