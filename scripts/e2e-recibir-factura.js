#!/usr/bin/env node
// Prueba de punta a punta de "Recibir con factura" (manual, no corre en CI). Servidor estático y API de Supabase mockeada,
// incluida la Edge Function leer-factura (devuelve una factura ya leída).
// Gerencia (celular y PC): Recibir → Recibir con factura → foto → reconoce proveedor por CUIT, cruza renglones con el
// catálogo (alias, código del mayorista, parecido), uno queda para elegir a mano y el flete se destilda; con pedido abierto
// muestra lo que faltó; confirma → recibir_con_factura con producto, cantidad, precio y alias; la foto se sube a comprobantes.
// Uso: node scripts/e2e-recibir-factura.js [carpeta-de-capturas]
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/app-stock/recibir-factura');
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
const U_GER = 'usr-ger';
const FLO = 'prv-florida', DS = 'prv-ds';
let seq = 0;
const prod = (nombre, cat, uc, uu, fac, prov, extra = {}) => ({ id: 'p' + (++seq), codigo: 'UMO-' + String(100 + seq), nombre, local_id: L1, categoria: cat, unidad_compra: uc, unidad_uso: uu, factor_conversion: fac, proveedor_id: prov, par: null, es_elaborado: false, activo: true, oculto: false, ...extra });
const P = {
  tomate: prod('Tomate perita', 'Verdura', 'kg', 'kg', 1, FLO),
  leche: prod('Leche entera', 'Lácteos', 'caja', 'litro', 12, FLO),
  muzza: prod('Queso mozzarella', 'Lácteos', 'kg', 'kg', 1, FLO),
  crema: prod('Crema de leche', 'Lácteos', 'pote', 'pote', 1, FLO),
  lavandina: prod('Lavandina 5 L', 'Limpieza', 'bidón', 'bidón', 1, DS, { codigo: 'UMO-DS-4410' }),
  otroLocal: { ...prod('Tomate perita', 'Verdura', 'kg', 'kg', 1, FLO), local_id: L2, codigo: 'TRE-100' }
};
const FACTURA = {
  es_factura: true, proveedor: 'DISTRIBUIDORA FLORIDA S.A.', cuit: '30-71111111-1', tipo: 'Factura A', numero: '0004-00228899',
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
const db = {
  alias: [{ id: 'a1', producto_id: P.leche.id, alias: 'LECHE ENT. LS 1L CJ X12' }],
  ordenes: [{ id: 'ord-1', local_id: L1, proveedor_id: FLO, estado: 'enviada', creado_en: '2026-10-27T12:00:00Z', cargado_por_nombre: 'Ruth', nota: null,
    orden_items: [{ id: 'oi1', producto_id: P.tomate.id, cantidad_pedida: 10, cantidad_recibida: null, excluido: false }, { id: 'oi2', producto_id: P.leche.id, cantidad_pedida: 2, cantidad_recibida: null, excluido: false }, { id: 'oi3', producto_id: P.crema.id, cantidad_pedida: 6, cantidad_recibida: null, excluido: false }] }],
  rpc: [], subidas: [], lecturas: []
};
function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7 * 86400 })}.firma`;
}
function sesion(sub) {
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 604800, expires_at: Math.floor(Date.now() / 1000) + 7 * 86400, refresh_token: 'r-' + sub,
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: 'x@x', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
}

async function montarApi(ctx, { falla = null } = {}) {
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = () => { try { return JSON.parse(req.postData() || 'null'); } catch (_e) { return null; } };
    const t = u.pathname.replace('/rest/v1/', '');
    if (u.pathname === '/auth/v1/user') return json(sesion(U_GER).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U_GER));
    if (u.pathname === '/functions/v1/leer-factura') {
      const b = body(); db.lecturas.push(b);
      await new Promise(r => setTimeout(r, 400));
      if (falla) return json({ error: falla }, 503);
      // Como la función real: líneas JSON con pedazos del texto y una línea final.
      const txt = JSON.stringify(FACTURA); const lineas = [];
      for (let i = 0; i < txt.length; i += 40) lineas.push(JSON.stringify({ t: txt.slice(i, i + 40) }));
      lineas.push(JSON.stringify({ fin: true, modelo: 'claude-sonnet-5-5', uso: { entrada: 3200, salida: 900 }, ms: 6100 }));
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/x-ndjson' }, body: lineas.join('\n') + '\n' });
    }
    if (u.pathname.startsWith('/storage/v1/object/comprobantes/')) { db.subidas.push({ ruta: u.pathname.replace('/storage/v1/object/comprobantes/', ''), bytes: (req.postDataBuffer() || Buffer.alloc(0)).length }); return json({ Key: 'comprobantes/x', Id: 'x' }); }
    if (t === 'perfiles') return json([{ id: U_GER, nombre: 'Jacobo', rol: 'gerencia', local_id: null }]);
    if (t === 'locales') return json([{ id: L1, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Ruth'], activo: true }, { id: L2, codigo: 'TRE', nombre: 'Trento Café', encargados: [], activo: true }]);
    if (t === 'proveedores' || t === 'proveedores_basico') return json([{ id: FLO, nombre: 'Florida', cuit: '30711111111', activo: true }, { id: DS, nombre: 'Distri Stock Mayorista', cuit: null, activo: true }]);
    if (t === 'productos') return json(Object.values(P));
    if (t === 'precio_actual') return json([{ producto_id: P.tomate.id, precio: 1900 }]);
    if (t === 'stock_actual') return json([]);
    if (t === 'producto_alias') return json(db.alias);
    if (t === 'ordenes_compra') return json(db.ordenes);
    if (t === 'rpc/recibir_con_factura') { const b = body(); db.rpc.push(b); return json({ recepcion_id: 'rec-1', factura_id: 'fac-1', items: b.p_items.length, estado_orden: b.p_orden ? 'parcial' : null }); }
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
  // Foto de prueba: una factura dibujada en HTML.
  const foto = path.join(os.tmpdir(), 'e2e-factura.jpg');
  { const p = await browser.newPage({ viewport: { width: 700, height: 900 } });
    await p.setContent(`<body style="font:16px monospace;padding:30px;background:#fff"><h2>DISTRIBUIDORA FLORIDA S.A.</h2><p>CUIT 30-71111111-1 · FACTURA A 0004-00228899</p><pre>${FACTURA.renglones.map(r => `${r.cantidad}  ${r.descripcion}  ${r.precio_unitario}`).join('\n')}</pre><h3>TOTAL $119.185</h3></body>`);
    await p.screenshot({ path: foto, type: 'jpeg', quality: 80 }); await p.close(); }

  const nuevo = async (opts, apiOpts) => {
    const c = await browser.newContext({ serviceWorkers: 'block', ...opts });
    await montarApi(c, apiOpts);
    await c.addInitScript((s) => {
      window.confirm = () => true;
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:g:local', JSON.stringify('loc-umo'));
    }, sesion(U_GER));
    const p = await c.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|400 \(Bad Request\)|503/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    return { c, p };
  };

  // ===== Gerencia · celular =====
  const { c: cM, p: m } = await nuevo({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto(BASE + '#/recibir');
  await m.waitForSelector('.rec-factura');
  await shot(m, '01-recibir-boton-m');
  await m.locator('.rec-factura').click();
  await m.waitForSelector('#rf-archivo', { state: 'attached' });
  ok(await m.locator('#rf-local').inputValue() === L1, 'arranca con el local elegido (Umo)');
  ok(await m.locator('button', { hasText: 'Leer factura' }).isDisabled(), 'sin foto, "Leer factura" deshabilitado');
  await m.setInputFiles('#rf-archivo', foto);
  await m.waitForSelector('.rf-foto img');
  await shot(m, '02-foto-cargada-m');
  await m.locator('button', { hasText: 'Leer factura' }).click();
  await m.waitForSelector('.rf-leyendo');
  await shot(m, '03-leyendo-m');
  await m.waitForSelector('.rf-fila');
  const lec = db.lecturas[0];
  ok(lec && lec.archivos.length === 1 && lec.archivos[0].tipo === 'image/jpeg' && lec.archivos[0].data.length > 1000, 'manda la foto achicada en JPEG a leer-factura');
  ok(await m.locator('#rf-prov').inputValue() === FLO, 'reconoce a Florida por CUIT');
  ok(/Reconocido por CUIT/.test(await m.locator('.rf-prov-h').innerText()), 'dice que lo reconoció por CUIT');
  ok(await m.locator('#rf-numero').inputValue() === '0004-00228899' && await m.locator('#rf-venc').inputValue() === '2026-11-07', 'precarga número y vencimiento');
  const txtFila = async (i) => (await m.locator(`[data-renglon="${i}"]`).innerText()).replace(/\n/g, ' / ');
  ok(/Tomate perita/.test(await txtFila(0)) && /Parecido/.test(await txtFila(0)), 'renglón 1 → Tomate perita (parecido) · ' + await txtFila(0));
  ok(/Leche entera/.test(await txtFila(1)) && /Como la última vez/.test(await txtFila(1)), 'renglón 2 → Leche entera (alias aprendido) · ' + await txtFila(1));
  ok(/Lavandina 5 L/.test(await txtFila(2)) && /Por código/.test(await txtFila(2)), 'renglón 3 → Lavandina (código del mayorista) · ' + await txtFila(2));
  ok(/Elegí el producto/.test(await txtFila(3)), 'renglón 4 (MUZZARELLA) queda para elegir a mano');
  ok(/Pedido del/.test(await m.locator('#rf-orden').innerText()), 'ofrece el pedido abierto de Florida para Umo');
  ok(/Faltó contra el pedido/.test(await m.locator('.rf-resumen').innerText()) && /Crema de leche/.test(await m.locator('.rf-resumen').innerText()), 'muestra lo que faltó contra el pedido (Tomate 10→8, Crema)');
  await shot(m, '04-revisar-m', true);
  // Confirmar sin elegir falla con mensaje claro.
  await m.locator('button', { hasText: 'Confirmar recepción' }).click();
  ok(/Elegí el producto de cada renglón/.test(await m.locator('.form-err').innerText()), 'no deja confirmar con renglones sin producto');
  // Elegir MUZZARELLA → Queso mozzarella.
  await m.locator('[aria-label="Elegir producto para MUZZARELLA HORMA LA PAULINA"]').click();
  await m.locator('input[aria-label="Buscar producto del catálogo"]').fill('mozz');
  await m.locator('[aria-label="Elegir Queso mozzarella"]').click();
  ok(/Queso mozzarella/.test(await txtFila(3)) && /Elegido/.test(await txtFila(3)), 'eligió Queso mozzarella a mano');
  ok(!(await m.locator('[aria-label="Elegir Tomate perita"]').count()), 'el otro local no se mezcla');
  // El flete no se recibe.
  await m.locator('[aria-label="Elegir producto para FLETE"]').click();
  await m.locator('dialog[open] button', { hasText: 'No recibir este renglón' }).click();
  ok(/No se recibe/.test(await txtFila(4)), 'el flete queda sin recibir');
  // Corrige la cantidad de tomate a 8,5.
  await m.locator('[aria-label="Cantidad de TOMATE PERITA X KG"]').fill('8,5');
  await shot(m, '05-listo-m', true);
  await m.locator('button', { hasText: 'Confirmar recepción' }).click();
  await m.waitForFunction(() => location.hash === '#/recibir');
  const r = db.rpc[0];
  ok(r && r.p_local === L1 && r.p_proveedor === FLO && r.p_orden === 'ord-1', 'recibir_con_factura con local, proveedor y pedido · ' + JSON.stringify(r && { l: r.p_local, p: r.p_proveedor, o: r.p_orden }));
  const it = (id) => (r.p_items || []).find(x => x.producto_id === id);
  ok(r.p_items.length === 4 && it(P.tomate.id).cantidad === 8.5 && it(P.tomate.id).precio_unitario === 2100 && it(P.muzza.id).alias === 'MUZZARELLA HORMA LA PAULINA', 'manda 4 productos con cantidad, precio y alias (sin el flete)');
  ok(r.p_factura && r.p_factura.numero === '0004-00228899' && r.p_factura.total === 119185 && r.p_factura.guardar === true && /^facturas\/prv-florida\//.test(r.p_factura.archivo || ''), 'manda la factura con total y archivo · ' + JSON.stringify(r.p_factura));
  ok(db.subidas.length === 1 && db.subidas[0].bytes > 1000, 'sube la foto a comprobantes');
  await m.waitForTimeout(200);
  await shot(m, '06-guardado-m');
  await cM.close();

  // ===== Gerencia · PC: revisar en pantalla ancha, y error de clave faltante =====
  const { c: cP, p: g } = await nuevo({ viewport: { width: 1280, height: 900 } });
  await g.goto(BASE + '#/recibir-factura');
  await g.waitForSelector('#rf-archivo', { state: 'attached' });
  await g.setInputFiles('#rf-archivo', foto);
  await g.locator('button', { hasText: 'Leer factura' }).click();
  await g.waitForSelector('.rf-fila');
  await shot(g, '07-revisar-pc', true);
  await cP.close();
  const { c: cE, p: e } = await nuevo({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { falla: 'Falta configurar la clave de Anthropic (ANTHROPIC_API_KEY) en Supabase.' });
  await e.goto(BASE + '#/recibir-factura');
  await e.waitForSelector('#rf-archivo', { state: 'attached' });
  await e.setInputFiles('#rf-archivo', foto);
  await e.locator('button', { hasText: 'Leer factura' }).click();
  await e.waitForSelector('.banner-error');
  ok(/clave de Anthropic/.test(await e.locator('.banner-error').innerText()), 'si falta la clave, lo dice en pantalla y vuelve a subir');
  await shot(e, '08-sin-clave-m');
  await cE.close();

  await browser.close(); srv.close();
  for (const x of errores) console.log('ERR  ' + x);
  console.log(fallas || errores.length ? `\n${fallas} fallas, ${errores.length} errores` : '\nTodo OK');
  process.exit(fallas || errores.length ? 1 : 0);
})();
