#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de la hoja por sector (0031_hoja_sector.sql). API de Supabase mockeada.
// 1) Encargado de Umo: Hoja nueva (Apertura | Cierre, una lista por lugar), cierra a ciegas con una sola llamada a
//    hoja_guardar; lo de la Barra durante el día (entró, devolví, merma) se siembra para gerencia.
// 2) Encargado del Shopping: Retiros con destino y quién retira; el destino nuevo queda guardado.
// 3) Gerencia: Stock → Por sector (consumo, vendido por recetas, diferencia) y Stock → Retiros por destino y control del depósito.
// Uso: node scripts/e2e-hoja.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/hoja-por-sector/app');
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

const L1 = 'loc-umo', L2 = 'loc-shp';
const U_ENC = 'usr-enc', U_SHP = 'usr-shp', U_GER = 'usr-ger';
let seq = 0;
const prod = (nombre, cat, uu, lugar, local = L1, extra = {}) => ({ id: 'p' + (++seq), codigo: (local === L1 ? 'UMO-' : 'SHP-') + String(seq).padStart(3, '0'), nombre, local_id: local, categoria: cat, unidad_compra: uu, unidad_uso: uu, factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: false, activo: true, oculto: false, lugar, orden_lugar: seq, ...extra });
const P = {
  coca: prod('Coca-Cola 500 ml', 'Bebidas', 'unidad', 'Barra'),
  agua: prod('Agua sin gas 500 ml', 'Bebidas', 'unidad', 'Barra'),
  cerveza: prod('Cerveza lata', 'Bebidas', 'unidad', 'Barra'),
  limon: prod('Limones', 'Verdulería', 'kg', 'Barra'),
  tortas: prod('Minitorta Capricho', 'Pastelería', 'unidad', 'Barra', L1, { unidad_compra: 'caja', factor_conversion: 4 }),
  nalga: prod('Nalga', 'Carnes', 'kg', 'Cocina'),
  papas: prod('Papas', 'Verdulería', 'kg', 'Cocina'),
  cocaDep: null,
  papel: prod('Papel higiénico', 'Limpieza', 'rollo', null, L2),
  lavandina: prod('Lavandina', 'Limpieza', 'bidón', null, L2),
  bolsas: prod('Bolsas de residuo grandes', 'Limpieza', 'paquete', null, L2)
};
delete P.cocaDep;
const hoy = (() => { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const db = { hoja: [], destinos: [{ id: 'd1', local_id: L2, nombre: 'Baños planta baja' }, { id: 'd2', local_id: L2, nombre: 'Limpieza pasillos' }], rpc: [], movs: [] };
let hid = 0;
const ahora = () => new Date().toISOString();
const mov = (local, sector, pid, tipo, cantidad, otro = null, quien = 'Lucas', fecha = hoy) => db.hoja.push({ id: 'h' + (++hid), local_id: local, fecha, sector, producto_id: pid, tipo, cantidad, otro, quien, creado_en: ahora() });
// Cocina ya abierta y cerrada; ventas del día (por receta) para gerencia.
mov(L1, 'Cocina', P.nalga.id, 'apertura', 8); mov(L1, 'Cocina', P.papas.id, 'apertura', 10);
mov(L1, 'Cocina', P.nalga.id, 'entro', 5, 'Proveedor');
mov(L1, 'Cocina', P.nalga.id, 'cierre', 9); mov(L1, 'Cocina', P.papas.id, 'cierre', 6);
db.movs.push({ producto_id: P.nalga.id, tipo: 'venta', cantidad: -3, nota: '', creado_en: ahora(), ref_id: null }, { producto_id: P.papas.id, tipo: 'venta', cantidad: -4, nota: '', creado_en: ahora(), ref_id: null },
  { producto_id: P.coca.id, tipo: 'venta', cantidad: -25, nota: '', creado_en: ahora(), ref_id: null }, { producto_id: P.cerveza.id, tipo: 'venta', cantidad: -28, nota: '', creado_en: ahora(), ref_id: null });
// Shopping: depósito abierto con conteo, retiros de días anteriores.
const ayer = (() => { const [y, m, d] = hoy.split('-').map(Number); const x = new Date(y, m - 1, d - 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; })();
mov(L2, 'Depósito', P.papel.id, 'apertura', 120, null, 'Marcos', ayer); mov(L2, 'Depósito', P.lavandina.id, 'apertura', 12, null, 'Marcos', ayer); mov(L2, 'Depósito', P.bolsas.id, 'apertura', 30, null, 'Marcos', ayer);
mov(L2, 'Depósito', P.papel.id, 'retiro', 48, 'Baños planta baja', 'Marcos', ayer); mov(L2, 'Depósito', P.lavandina.id, 'retiro', 3, 'Limpieza pasillos', 'Juan', ayer);
const precios = { [P.coca.id]: 900, [P.agua.id]: 700, [P.cerveza.id]: 1100, [P.limon.id]: 2000, [P.nalga.id]: 12000, [P.papas.id]: 900, [P.papel.id]: 450, [P.lavandina.id]: 3800, [P.bolsas.id]: 2500, [P.tortas.id]: 16000 };
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



const filtro = (rows, q) => {
  let r = rows;
  for (const [k, v] of q.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    if (v.startsWith('eq.')) r = r.filter(x => String(x[k]) === v.slice(3));
    else if (v.startsWith('gte.')) r = r.filter(x => String(x[k]) >= v.slice(4));
    else if (v.startsWith('lte.')) r = r.filter(x => String(x[k]) <= v.slice(4));
  }
  return r;
};
async function montarApi(ctx) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U_GER ? 'gerencia' : 'encargado';
    const miLocal = sub === U_SHP ? L2 : L1;
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U_ENC).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_ENC));
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: sub === U_SHP ? 'Shopping' : 'Umo', rol: 'encargado', local_id: miLocal }]);
    if (t === 'locales') return json(filtro([{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true, razon_social: 'SUMA ACTIVA S.A.' }, { id: L2, codigo: 'SHP', nombre: 'Shopping', encargados: ['Marcos', 'Juan'], activo: true, razon_social: 'SPMAR S.A.' }], q));
    if (t === 'productos') return json(filtro(Object.values(P).map(p => ({ ...p })), q));
    if (t === 'precio_actual') return json(Object.entries(precios).map(([producto_id, precio]) => ({ producto_id, precio })));
    if (t === 'hoja_movs') return json(filtro(rol === 'gerencia' ? db.hoja : db.hoja.filter(m => m.local_id === miLocal), q));
    if (t === 'destinos') return json(filtro(db.destinos, q));
    if (t === 'movimientos') return json(q.get('local_id') === 'eq.' + L1 ? db.movs : []);
    if (t.startsWith('rpc/')) { const b = JSON.parse(req.postData() || '{}'); db.rpc.push({ fn: t.slice(4), ...b }); }
    if (t === 'rpc/hoja_contar') {
      const b = JSON.parse(req.postData() || '{}'); let n = 0;
      for (const it of b.p_items) {
        db.hoja = db.hoja.filter(m => !(m.local_id === b.p_local && m.fecha === b.p_fecha && m.sector === b.p_sector && m.producto_id === it.producto_id && m.tipo === b.p_tipo));
        if (it.cantidad === '' || it.cantidad == null) continue;
        mov(b.p_local, b.p_sector, it.producto_id, b.p_tipo, Number(it.cantidad), null, b.p_quien, b.p_fecha); n++;
      }
      return json(n);
    }
    if (t === 'rpc/hoja_guardar') {
      const b = JSON.parse(req.postData() || '{}'); let n = 0;
      for (const it of b.p_items) {
        db.hoja = db.hoja.filter(m => !(m.local_id === b.p_local && m.fecha === b.p_fecha && m.producto_id === it.producto_id && m.tipo === b.p_tipo));
        if (it.cantidad === '' || it.cantidad == null) continue;
        mov(b.p_local, it.sector, it.producto_id, b.p_tipo, Number(it.cantidad), null, b.p_quien, b.p_fecha); n++;
      }
      return json(n);
    }
    if (t === 'rpc/hoja_anotar') {
      const b = JSON.parse(req.postData() || '{}');
      mov(b.p_local, b.p_sector, b.p_producto, b.p_tipo, b.p_cantidad, b.p_otro, b.p_quien, b.p_fecha);
      if (b.p_tipo === 'retiro' && !db.destinos.some(d => d.nombre === b.p_otro)) db.destinos.push({ id: 'd' + db.destinos.length + 1, local_id: b.p_local, nombre: b.p_otro });
      return json('h' + hid);
    }
    if (t === 'rpc/hoja_borrar') { const b = JSON.parse(req.postData() || '{}'); db.hoja = db.hoja.filter(m => m.id !== b.p_id); return json(null); }
    return json([]);
  });
}
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const shot = async (p, n, full = false) => { await p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); }); return p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full }); };

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
  const PC = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 };
  const fila = (p, x) => p.locator(`.hj-fila[data-id="${x.id}"]`);

  // ===== 1) Encargado de Umo: la Hoja nueva (Apertura | Cierre, 0032). La hoja por sector queda para el Shopping. =====
  // Lo que antes se anotaba a mano en la Barra se siembra directo para las vistas de gerencia de abajo.
  mov(L1, 'Barra', P.coca.id, 'apertura', 24); mov(L1, 'Barra', P.agua.id, 'apertura', 18); mov(L1, 'Barra', P.cerveza.id, 'apertura', 30);
  mov(L1, 'Barra', P.limon.id, 'apertura', 2.5); mov(L1, 'Barra', P.tortas.id, 'apertura', 6);
  mov(L1, 'Barra', P.coca.id, 'entro', 12, 'Proveedor'); mov(L1, 'Barra', P.cerveza.id, 'entro', 24, 'Cocina'); mov(L1, 'Barra', P.cerveza.id, 'devolvi', 6, 'Cocina');
  mov(L1, 'Barra', P.limon.id, 'merma', 0.5);
  const { c: cE, p: e } = await nuevo(M, U_ENC, { nombre: 'Lucas' });
  await e.goto(BASE + '#/hoja');
  await e.waitForSelector('.cd-seg');
  const tabs = await e.locator('.tabbar .tab').allInnerTexts();
  ok(tabs.map(x => x.trim()).join(',') === 'Hoja,Pedir,Mis pedidos,Más', 'barra del encargado: Hoja · Pedir · Mis pedidos · Más · ' + tabs.join(','));
  ok(await e.locator('[data-nav="stock"], [data-nav="elaborados"], [data-nav="retiros"]').count() === 0, 'sin Stock, Elaborados ni Retiros en el menú de Umo');
  ok(await e.locator('.seg-b[data-paso="durante"]').count() === 0 && await e.locator('.seg-b[data-modo]').count() === 2, 'Umo: Apertura | Cierre (sin "Durante el día")');
  // La Cocina ya cerró hoy: abre en el resultado y "Corregir el cierre" trae lo guardado; la Barra está sin contar.
  ok(await e.locator('.cd-ok').count() === 1, 'con un cierre de hoy abre en el resultado');
  await e.locator('.cd-corregir').click();
  await e.waitForSelector('.cd-avance');
  const grupos = await e.locator('.cd-grupo').evaluateAll(xs => xs.map(x => x.getAttribute('data-sector')));
  ok(JSON.stringify(grupos) === JSON.stringify(['Barra', 'Cocina']), 'una lista por lugar · ' + grupos.join(','));
  const cf = (x) => e.locator(`.cd-fila[data-id="${x.id}"] .cd-in`);
  ok(await cf(P.coca).inputValue() === '' && await cf(P.nalga).inputValue() === '9', 'la Barra sin contar (a ciegas) y la Cocina con lo que ya cerró');
  await cf(P.coca).fill('9'); await cf(P.agua).fill('18'); await cf(P.cerveza).fill('20'); await cf(P.limon).fill('0,8');
  ok(/4 de 5/.test(await e.locator('.cd-grupo[data-sector="Barra"] .cd-gh').innerText()), 'la Barra cuenta 4 de 5');
  ok(/1 sin contar van en 0/.test(await e.locator('.cd-btn').innerText()), 'el botón avisa lo que va en 0 · ' + await e.locator('.cd-btn').innerText());
  await e.locator('.cd-btn').click();
  await e.waitForSelector('.cd-confirma:not([hidden])');
  const antes = db.rpc.filter(r => r.fn === 'hoja_guardar').length;
  await e.locator('.cd-confirma .btn-primary').click();
  await e.waitForSelector('.cd-ok');
  const gs = db.rpc.filter(r => r.fn === 'hoja_guardar');
  ok(gs.length === antes + 1 && gs[gs.length - 1].p_tipo === 'cierre', 'el cierre se guarda con una sola llamada a hoja_guardar');
  const ci = Object.fromEntries(gs[gs.length - 1].p_items.map(x => [x.producto_id, [x.sector, x.cantidad]]));
  ok(ci[P.coca.id][0] === 'Barra' && ci[P.coca.id][1] === 9 && ci[P.limon.id][1] === 0.8 && ci[P.nalga.id][0] === 'Cocina' && ci[P.nalga.id][1] === 9 && ci[P.tortas.id][1] === 0, 'cada producto con su lugar; lo no contado va en 0 · ' + JSON.stringify(ci));
  await shot(e, '01-cierre-resultado-m');
  ok(!/precio|\$/.test(await e.locator('#view').innerText()), 'el encargado no ve precios');
  await cE.close();

  // ===== 2) Shopping: retiros =====
  const { c: cS, p: s } = await nuevo(M, U_SHP, { nombre: 'Marcos' });
  await s.goto(BASE + '#/retiros');
  await s.waitForSelector('.rt-nuevo');
  const tabsS = (await s.locator('.tabbar .tab').allInnerTexts()).map(x => x.trim()).join(',');
  ok(tabsS === 'Retiros,Pedir,Mis pedidos,Más', 'barra del Shopping: Retiros · Pedir · Mis pedidos · Más (Hoy y la hoja del depósito, en Más) · ' + tabsS);
  await s.locator('.rt-nuevo').click(); await s.waitForSelector('dialog.sheet');
  await s.locator('dialog input[type="search"]').fill('bolsas');
  await s.locator(`dialog .rt-op[data-id="${P.bolsas.id}"]`).click();
  await s.locator('dialog .step-val').fill('4'); await s.locator('dialog .step-val').dispatchEvent('change');
  await s.locator('dialog .chip[data-destino="Limpieza pasillos"]').click();
  await s.locator('dialog .chip[data-quien="Marcos"]').click();
  await shot(s, '07-shopping-nuevo-retiro-m');
  await s.locator('dialog .btn-primary').click();
  await s.waitForSelector('dialog.sheet', { state: 'detached' });
  await s.locator('.rt-nuevo').click(); await s.waitForSelector('dialog.sheet');
  await s.locator(`dialog .rt-op[data-id="${P.papel.id}"]`).click();
  await s.locator('dialog .step-val').fill('8'); await s.locator('dialog .step-val').dispatchEvent('change');
  await s.locator('dialog input[aria-label="Otro destino"]').fill('Patio de comidas');
  await s.locator('dialog .chip[data-quien="Juan"]').click();
  await s.locator('dialog .btn-primary').click();
  await s.waitForSelector('dialog.sheet', { state: 'detached' });
  const ret = db.hoja.filter(m => m.tipo === 'retiro' && m.fecha === hoy);
  ok(ret.length === 2 && ret[0].otro === 'Limpieza pasillos' && ret[0].quien === 'Marcos' && ret[1].otro === 'Patio de comidas' && ret[1].sector === 'Depósito', 'guarda los retiros con destino, quién y sector Depósito');
  ok(db.destinos.some(d => d.nombre === 'Patio de comidas'), 'el destino nuevo queda guardado');
  ok(await s.locator('.rt-item').count() === 4, 'lista hoy y ayer');
  await shot(s, '06-shopping-retiros-m');
  await s.goto(BASE + '#/hoja'); await s.waitForSelector('.hj-sector');
  ok(await s.locator('.hj-sector').count() === 1 && await s.locator('.cd-seg').count() === 0, 'el Shopping sigue con la hoja por sector de antes (sin cambios)');
  await cS.close();

  // ===== 3) Gerencia =====
  const { c: cG, p: g } = await nuevo(PC, U_GER, { 'g:local': L1 });
  await g.goto(BASE + '#/sector');
  await g.waitForSelector('.gs-tabla');
  const celda = async (pid, i) => (await g.locator(`.gs-tabla tr[data-prod="${pid}"] td`).nth(i).innerText()).trim();
  // Todos: coca 24 + 12 (proveedor) − 9 = 27 consumo, vendió 25 → −2.
  ok(await celda(P.coca.id, 6) === '27' && await celda(P.coca.id, 7) === '25' && await celda(P.coca.id, 8) === '-2', 'todos los sectores: Coca consumo 27, vendido 25, diferencia −2');
  // Cerveza: 30 abrió, pases con Cocina se cancelan (Cocina no tiene cerveza contada) → falta en Cocina.
  ok(/Falta/.test(await celda(P.cerveza.id, 6)), 'la cerveza pasó por Cocina sin contarse ahí: avisa que falta contar');
  await shot(g, '08-g-por-sector-todos-pc');
  await g.locator('.gs-sectores .chip[data-sector="Barra"]').click();
  await g.waitForSelector('.gs-tabla');
  ok(await celda(P.cerveza.id, 2) === '24' && await celda(P.cerveza.id, 3) === '6' && await celda(P.cerveza.id, 6) === '28', 'Barra: cerveza 30 + 24 − 6 − 20 = 28');
  await shot(g, '09-g-por-sector-barra-pc');
  await g.locator('.gs-sectores .chip[data-sector="Cocina"]').click();
  await g.waitForSelector('.gs-tabla');
  ok(await celda(P.cerveza.id, 2) === '6' && await celda(P.cerveza.id, 3) === '24', 'Cocina: lo que la Barra sacó de acá cuenta como salida y lo devuelto como entrada');
  await g.goto(BASE + '#/g-retiros');
  await g.waitForSelector('.gs-kpis');
  await g.waitForSelector('.gr-tabla');
  const dest = await g.locator('.gr-tabla tr[data-destino]').evaluateAll(xs => xs.map(x => x.getAttribute('data-destino')));
  ok(dest.includes('Baños planta baja') && dest.includes('Patio de comidas') && dest.includes('Limpieza pasillos'), 'retiros por destino · ' + dest.join(', '));
  await g.locator('.sel-local').click(); await g.waitForSelector('dialog.sheet');
  ok(await g.locator('dialog .lg-fila[data-local="' + L1 + '"]').count() === 0 && await g.locator('dialog .lg-fila[data-local="' + L2 + '"]').count() === 1, 'en Retiros solo aparece el Shopping (selector de local en hoja)');
  await g.keyboard.press('Escape'); await g.waitForSelector('dialog.sheet', { state: 'detached' });
  await shot(g, '10-g-retiros-destino-pc');
  await g.locator('.seg-b[data-vista="deposito"]').click();
  ok(/Falta contar la cierre|Falta contar el cierre|Falta contar/.test(await g.locator('.gs-tabla').innerText()), 'control del depósito avisa que falta el cierre');
  await shot(g, '11-g-retiros-deposito-pc');
  await g.setViewportSize({ width: 390, height: 844 });
  await g.goto(BASE + '#/sector'); await g.waitForSelector('.gs-tabla');
  await shot(g, '12-g-por-sector-m');
  // Stock en 3 pestañas (Qué hay · Control · Lugares). Control: filtro Hoy · Semana y desde ahí Retiros y Conteos (sin tercer nivel).
  ok((await g.locator('.subnav-b').allInnerTexts()).join('|') === 'Qué hay|Control|Lugares' && await g.locator('.subnav-b.is-on').innerText() === 'Control', 'Stock: Qué hay · Control · Lugares');
  ok((await g.locator('.subnav-f').allInnerTexts()).join('|') === 'Hoy|Semana|Pérdida' && await g.locator('.subnav-f.is-on').innerText() === 'Hoy', 'Control: filtro Hoy · Semana · Pérdida');
  ok((await g.locator('.subnav-ir-b').allInnerTexts()).map(x => x.trim()).join('|') === 'Retiros|Conteos', 'Control: Retiros y Conteos se abren desde ahí');
  await g.locator('.subnav-ir-b[data-ir="conteos"]').click(); await g.waitForSelector('.subnav-volver');
  ok(await g.locator('.subnav-b.is-on').innerText() === 'Control' && await g.locator('.subnav-f').count() === 0 && /Control/.test(await g.locator('.subnav-volver').innerText()), 'Conteos: queda en Control, con ‹ Control para volver');
  await g.goto(BASE + '#/sector'); await g.waitForSelector('.gs-tabla');
  await g.goto(BASE + '#/stock'); await g.waitForSelector('.subnav-b.is-on');
  ok(await g.locator('.subnav-fila, .subnav-volver').count() === 0 && await g.locator('.subnav-b.is-on').innerText() === 'Qué hay', 'Qué hay sin segunda fila');
  await shot(g, '13-g-que-hay-m');
  await g.goto(BASE + '#/recetas'); await g.waitForSelector('.subnav-b');
  ok((await g.locator('.subnav-b').allInnerTexts()).join('|') === 'Recetas|Producción|Elaborados', 'Elaborados pasó a Cocina');
  await cG.close();

  await browser.close(); srv.close();
  if (errores.length) { console.log(errores.join('\n')); fallas += errores.length; }
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
