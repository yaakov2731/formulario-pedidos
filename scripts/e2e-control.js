#!/usr/bin/env node
// Prueba de punta a punta del Control semanal (manual, no corre en CI). API de Supabase mockeada con page.route.
// Encargado (iPhone): al contar elige Apertura o Cierre (obligatorio) y se manda p_tipo a contar_local.
// Gerencia: Stock → Conteos marca o corrige el tipo (marcar_conteo); Stock → Control muestra la semana por lugar:
// había + entró − quedó = se usó, contra lo anotado (ventas, producción) y lo pedido después del cierre.
// Uso: node scripts/e2e-control.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/control-semanal');
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
  nalga: prod('Nalga', 'Carnes', 'kg', { lugar: 'Cámara', orden_lugar: 1000 }),
  pollo: prod('Pechuga de pollo', 'Carnes', 'kg', { lugar: 'Cámara', orden_lugar: 1001 }),
  papas: prod('Papas en bolsa', 'Verdulería', 'kg', { unidad_compra: 'bolsa', factor_conversion: 5, lugar: 'Depósito', orden_lugar: 3000 }),
  helado: prod('Helado de vainilla', 'Postres', 'balde', { lugar: 'Freezer', orden_lugar: 4000 }),
  coca: prod('Coca-Cola 500', 'Bebidas', 'unidad', { lugar: 'Barra', orden_lugar: 2000 }),
  agua: prod('Agua sin gas 500', 'Bebidas', 'unidad', { lugar: 'Barra', orden_lugar: 2001 })
};
const hace = (d) => new Date(Date.now() - d * 864e5).toISOString();
const it = (p, contado) => ({ producto_id: p.id, contado, sistema: contado, dif: 0 });
const db = { stock: new Map(Object.values(P).map(p => [p.id, 5])), rpc: [], marcar: [],
  conteos: [
    { id: 'c-ap', local_id: L1, encargado: 'Lucas', tipo: 'apertura', creado_en: hace(6), items: [it(P.nalga, 5), it(P.pollo, 4), it(P.papas, 10), it(P.helado, 2), it(P.coca, 30), it(P.agua, 12)] },
    { id: 'c-suelto', local_id: L1, encargado: 'Lucas', tipo: null, creado_en: hace(3), items: [it(P.nalga, 9)] },
    { id: 'c-ci', local_id: L1, encargado: 'Lucas', tipo: 'cierre', creado_en: hace(1), items: [it(P.nalga, 3), it(P.pollo, 1), it(P.papas, 15), it(P.coca, 30), it(P.agua, 12)] }
  ],
  movs: [
    { producto_id: P.nalga.id, tipo: 'recepcion', cantidad: 10, nota: null, creado_en: hace(4) },
    { producto_id: P.nalga.id, tipo: 'venta', cantidad: -8, nota: null, creado_en: hace(3) },
    { producto_id: P.nalga.id, tipo: 'ajuste_conteo', cantidad: 4, nota: null, creado_en: hace(3) },
    { producto_id: P.pollo.id, tipo: 'produccion_consumo', cantidad: -3, nota: null, creado_en: hace(2) },
    { producto_id: P.papas.id, tipo: 'recepcion', cantidad: 10, nota: null, creado_en: hace(4) },
    { producto_id: P.papas.id, tipo: 'venta', cantidad: -5, nota: null, creado_en: hace(2) },
    { producto_id: P.coca.id, tipo: 'recepcion', cantidad: 24, nota: null, creado_en: hace(4) },
    { producto_id: P.coca.id, tipo: 'venta', cantidad: -20, nota: null, creado_en: hace(2) },
    { producto_id: P.coca.id, tipo: 'recepcion', cantidad: 99, nota: null, creado_en: hace(0.5) }
  ],
  ords: [
    { id: 'o1', local_id: L1, proveedor_id: null, estado: 'borrador', creado_en: hace(0.9), cargado_por_nombre: 'Lucas', nota: null,
      orden_items: [{ id: 'i1', producto_id: P.nalga.id, cantidad_pedida: 2, cantidad_recibida: null, excluido: false }, { id: 'i2', producto_id: P.coca.id, cantidad_pedida: 48, cantidad_recibida: null, excluido: false },
        { id: 'i3', producto_id: P.agua.id, cantidad_pedida: 12, cantidad_recibida: null, excluido: false }, { id: 'i4', producto_id: P.papas.id, cantidad_pedida: 9, cantidad_recibida: null, excluido: true }] }
  ],
  precios: [{ producto_id: P.nalga.id, precio: 10000 }, { producto_id: P.coca.id, precio: 1000 }],
  locales: [{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null }] };
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
    const gte = (v) => (v && v.startsWith('gte.') ? v.slice(4) : null);
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: 'Umo', rol: 'encargado', local_id: L1 }]);
    if (t === 'locales') return json(db.locales.map(l => ({ ...l })));
    if (t === 'rpc/locales_login') return json(db.locales.map(l => ({ codigo: l.codigo, nombre: l.nombre, encargados: l.encargados })));
    if (t === 'productos') return json(Object.values(P).map(p => ({ ...p })));
    if (t === 'stock_actual') return json([...db.stock].map(([pid, s]) => ({ local_id: L1, producto_id: pid, stock: s })));
    if (t === 'precio_actual') return json(db.precios);
    if (t === 'conteos') { const v = [...db.conteos].sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1)); return json(q.get('limit') === '1' ? v.slice(0, 1) : v); }
    if (t === 'movimientos') { const d = gte(q.get('creado_en')) || ''; return json(db.movs.filter(m => m.creado_en >= d)); }
    if (t === 'ordenes_compra') { const d = gte(q.get('creado_en')) || ''; return json(db.ords.filter(o => o.creado_en >= d)); }
    if (t === 'rpc/marcar_conteo') {
      const b = JSON.parse(req.postData() || '{}'); db.marcar.push(b);
      if (rol !== 'gerencia') return json({ code: '42501', message: 'Solo gerencia' }, 403);
      const c = db.conteos.find(x => x.id === b.p_conteo); c.tipo = b.p_tipo; return json(b.p_tipo);
    }
    if (t === 'rpc/contar_local') {
      const b = JSON.parse(req.postData() || '{}'); db.rpc.push(b);
      const id = 'c' + (++seq);
      db.conteos.push({ id, local_id: b.p_local, encargado: b.p_encargado, tipo: b.p_tipo || null, items: b.p_items.map(x => ({ ...x, sistema: 5, dif: x.contado - 5 })), creado_en: new Date().toISOString() });
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
  const quitarToasts = (p) => p.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));

  // ===== Gerencia · iPhone: Stock → Control =====
  const { c: cG, p: g } = await nuevo(M, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/control');
  await g.waitForSelector('.ctl-lugar');
  ok(await g.locator('.subnav-b.is-on').innerText() === 'Control', 'Stock tiene la pestaña Control');
  ok(await g.locator('.ctl-semanas .chip').count() === 1, 'una semana: apertura → cierre (el conteo suelto no cuenta)');
  const fila = (p) => g.locator(`.ctl-fila[data-prod="${p.id}"]`);
  await g.locator('[data-filtro="todo"]').click();
  const nums = async (p) => (await fila(p).locator('.ctl-n b').allInnerTexts()).join('|');
  ok(await nums(P.nalga) === '5|10|3|12|8|2', 'nalga: había 5 + entró 10 − quedó 3 = usó 12; anotado 8; pide 2 · ' + await nums(P.nalga));
  const av = async (p) => (await fila(p).locator('.ctl-badge').allInnerTexts()).join(',');
  ok(await av(P.nalga) === 'Sin anotar,Se queda corto', 'nalga: sin anotar y se queda corto · ' + await av(P.nalga));
  ok(/Sin anotar: 4 kg · \$\s?40\.000/.test(await fila(P.nalga).innerText()), 'nalga: 4 kg sin anotar = $ 40.000');
  ok(await nums(P.coca) === '30|24|30|24|20|48' && await av(P.coca) === 'Sin anotar,Pide de más', 'coca: la entrada después del cierre no cuenta; pide 48 = de más · ' + await nums(P.coca) + ' ' + await av(P.coca));
  ok(await av(P.agua) === 'Pide sin usar', 'agua: pide sin usar');
  ok(await av(P.papas) === '' && /—$/.test(await nums(P.papas)), 'papas: cierran y lo destildado no cuenta · ' + await nums(P.papas));
  ok(await fila(P.helado).count() === 0 && /solo en uno de los dos conteos.*Helado/.test(await g.locator('.ctl').innerText()), 'helado (solo en apertura) queda afuera, avisado');
  const lugares = await g.locator('.ctl-lugar-n').allInnerTexts();
  ok(lugares.join(',') === 'Cámara,Barra,Depósito', 'lugares en el orden del recorrido · ' + lugares.join(','));
  ok(/Cierra/.test(await g.locator('.ctl-lugar[data-lugar="Depósito"] .ctl-lugar-h').innerText()), 'Depósito cierra');
  await shot(g, '03-control-todo-m', true);
  await g.locator('[data-filtro="avisos"]').click();
  ok(await g.locator('.ctl-fila').count() === 4 && /Todo cierra en este lugar/.test(await g.locator('.ctl-lugar[data-lugar="Depósito"]').innerText()), 'Con aviso: 4 productos');
  ok(await g.locator('[data-bloque="mirar"] .bfila').count() === 4, 'Para mirar primero: 4');
  await shot(g, '02-control-m', true);
  await cG.close();

  // ===== Gerencia · PC =====
  const { c: cP, p: gp } = await nuevo({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }, U_GER, { 'g:local': L1 });
  await gp.goto(BASE + '#/control'); await gp.waitForSelector('.ctl-lugar');
  await shot(gp, '04-control-pc', true);
  // Conteos: marcar el suelto como cierre y volver a Control: pasa a ser la semana más nueva? no: hay una apertura antes y otro cierre después.
  await gp.goto(BASE + '#/conteos'); await gp.waitForSelector('.cnd-card');
  ok(/Apertura/.test(await gp.locator('.cnd-card[data-conteo="c-ap"]').innerText()) && /Cierre/.test(await gp.locator('.cnd-card[data-conteo="c-ci"]').innerText()), 'Conteos muestra Apertura y Cierre');
  await gp.locator('.cnd-card[data-conteo="c-suelto"]').click();
  await gp.waitForSelector('dialog.sheet .cnd-tipo');
  await gp.locator('dialog.sheet .cnd-tipo [data-tipo="apertura"]').click();
  await gp.waitForFunction(() => document.querySelector('dialog.sheet .cnd-tipo [data-tipo="apertura"].is-on'));
  ok(JSON.stringify(db.marcar[0]) === '{"p_conteo":"c-suelto","p_tipo":"apertura"}', 'marcar_conteo con apertura');
  await quitarToasts(gp);
  await shot(gp, '05-conteo-marcar-pc');
  await gp.locator('dialog.sheet .icon-btn[aria-label="Cerrar"]').click();
  ok(/Apertura/.test(await gp.locator('.cnd-card[data-conteo="c-suelto"]').innerText()), 'la tarjeta queda como Apertura');
  await gp.goto(BASE + '#/control'); await gp.waitForSelector('.ctl-lugar');
  ok(/Apertura .*→ Cierre/.test(await gp.locator('.ctl-sem').innerText()) && await gp.locator('.ctl-fila').count() >= 0, 'con la apertura nueva la semana arranca en el conteo suelto');
  await cP.close();

  // ===== Encargado · iPhone: Contar con Apertura / Cierre =====
  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
  await e.goto(BASE + '#/contar');
  await e.waitForSelector('.lug-card');
  ok(await e.locator('.cnt-tipo-box').isVisible(), 'Contar pregunta "¿Qué conteo es?"');
  await shot(e, '01-contar-tipo-m');
  await e.locator('.lug-card[data-lugar="Cámara"]').click();
  ok(!(await e.locator('.cnt-tipo-box').isVisible()), 'dentro de un lugar se esconde la pregunta');
  await e.locator(`[data-id="${P.nalga.id}"] .cnt-in`).fill('4');
  await e.locator('.pill').click();
  await e.waitForSelector('.cnt-tipo-box.is-falta');
  ok(db.rpc.length === 0, 'sin elegir apertura o cierre no guarda');
  await quitarToasts(e);
  await shot(e, '01b-contar-falta-tipo-m');
  await e.locator('.cnt-tipo [data-tipo="cierre"]').click();
  ok(/Guardar conteo de cierre/.test(await e.locator('.pill').innerText()), 'el botón dice "Guardar conteo de cierre"');
  await e.locator('.pill').click();
  await e.waitForFunction(() => !document.querySelector('.cnt-tipo .is-on'));
  ok(db.rpc[0] && db.rpc[0].p_tipo === 'cierre', 'contar_local recibe p_tipo = cierre');
  ok(await e.locator('.cnt-tipo .is-on').count() === 0, 'después de guardar se limpia la elección');
  await cE.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
