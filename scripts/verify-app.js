// Verifica la app nueva (app/): estructura, sintaxis e importaciones de los módulos, y la lógica pura
// de util.js y api.js (números, semana, sugerido, IDs, pegado desde Excel, caché, cola de envíos).
// Sin npm. Uso: node scripts/verify-app.js
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pasos = 0;
const ok = (m) => { pasos++; console.log('·', m); };

/* ---------- estructura ---------- */
const requeridos = ['app/index.html', 'app/config.js', 'app/manifest.webmanifest', 'app/sw.js', 'app/css/app.css',
  'app/icons/icon.svg', 'app/icons/icon-180.png', 'app/icons/icon-192.png', 'app/icons/icon-512.png', 'app/icons/icon-maskable-512.png',
  'app/js/main.js', 'app/js/util.js', 'app/js/api.js', 'app/js/ui.js', 'app/js/flujo.js', 'app/js/gerencia.js', 'app/js/detalles.js'];
const pantallas = ['entrar', 'hoy', 'pedir', 'contar', 'recibir', 'elaborados', 'compras', 'ordenes', 'faltantes', 'stock', 'catalogo', 'datos', 'proveedores', 'locales', 'elaborados-admin', 'ajustes'];
for (const f of requeridos) assert.ok(fs.existsSync(path.join(ROOT, f)), `falta ${f}`);
for (const p of pantallas) assert.ok(fs.existsSync(path.join(APP, 'js/screens', p + '.js')), `falta la pantalla ${p}`);
ok('archivos requeridos presentes');

const html = read('app/index.html');
for (const s of ['manifest.webmanifest', 'css/app.css', 'config.js', 'js/main.js', 'apple-mobile-web-app-capable', 'viewport-fit=cover', 'icons/icon-180.png']) assert.ok(html.includes(s), `index.html no referencia ${s}`);
const manifest = JSON.parse(read('app/manifest.webmanifest'));
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some(i => i.purpose === 'maskable'), 'manifest sin ícono maskable');
const cfg = read('app/config.js');
const urlApp = (cfg.match(/API_URL:\s*"([^"]+)"/) || [])[1];
const urlV3 = (read('v3/config.js').match(/API_URL:\s*"([^"]+)"/) || [])[1];
assert.ok(urlApp && /\/exec$/.test(urlApp), 'config.js sin API_URL /exec');
assert.equal(urlApp, urlV3, 'app/config.js y v3/config.js apuntan a backends distintos');
ok('index.html, manifest y config coherentes con V3');

const sw = read('app/sw.js');
for (const p of pantallas) assert.ok(sw.includes(`./js/screens/${p}.js`), `sw.js no precachea ${p}.js`);
ok('service worker precachea todas las pantallas');

const main = read('app/js/main.js');
for (const p of pantallas) assert.ok(main.includes(`'./screens/${p}.js'`), `main.js no rutea ${p}`);
ok('main.js rutea todas las pantallas');

/* ---------- sintaxis e importaciones ---------- */
const modulos = [...fs.readdirSync(path.join(APP, 'js')).filter(f => f.endsWith('.js')).map(f => 'app/js/' + f), ...fs.readdirSync(path.join(APP, 'js/screens')).map(f => 'app/js/screens/' + f)];
// --check sobre el archivo no valida módulos ES en Node 22; por stdin con --input-type=module sí.
for (const m of modulos) execFileSync(process.execPath, ['--input-type=module', '--check'], { input: read(m), stdio: ['pipe', 'pipe', 'pipe'] });
ok(`sintaxis válida en ${modulos.length} módulos`);
const exportsOf = {};
for (const f of modulos) {
  const s = read(f); const names = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) names.add(n.trim().split(/\s+as\s+/).pop().trim());
  if (/export\s+default/.test(s)) names.add('default');
  exportsOf[path.resolve(ROOT, f)] = names;
}
for (const f of modulos) {
  const s = read(f);
  for (const m of s.matchAll(/import\s*(?:\*\s+as\s+\w+|\{([^}]*)\}|\w+)?\s*from\s*'([^']+)'/g)) {
    const target = path.resolve(path.dirname(path.join(ROOT, f)), m[2]);
    assert.ok(exportsOf[target], `${f} importa ${m[2]} que no existe`);
    if (m[1]) for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/)[0].trim(); if (name) assert.ok(exportsOf[target].has(name), `${f} importa ${name} que ${m[2]} no exporta`); }
  }
  for (const m of s.matchAll(/import\(\s*'([^']+)'\s*\)/g)) assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(ROOT, f)), m[1])), `${f} importa dinámicamente ${m[1]} que no existe`);
}
ok('todas las importaciones resuelven');
assert.ok(!/\.replaceChildren\(/.test(modulos.filter(m => !m.endsWith('ui.js')).map(read).join('')), 'usar fill() en vez de replaceChildren (null se dibuja como texto)');
ok('sin replaceChildren con posibles null');

/* ---------- lógica pura ---------- */
(async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i], get length() { return mem.size; } };
  globalThis.location = { href: 'http://localhost/app/', search: '' };
  globalThis.navigator = { onLine: true };
  globalThis.DOCKS_APP_CONFIG = { API_URL: 'https://script.google.com/macros/s/X/exec' };

  const u = await import(path.join(APP, 'js/util.js'));
  assert.equal(u.parseNum('1,5'), 1.5); assert.equal(u.parseNum('1.234,5'), 1234.5); assert.equal(u.parseNum(''), null); assert.equal(u.parseNum('abc'), null); assert.equal(u.parseNum(0), 0);
  assert.equal(u.inputNum(1234.5), '1234,5'); assert.equal(u.inputNum(null), '');
  assert.equal(u.parseNum(u.inputNum(2.25)), 2.25);
  assert.equal(u.fmtMoney(57200), '$ 57.200');
  ok('números: parse, input y moneda');
  assert.deepEqual(u.sugerido({ par: 10, stock_actual: 4, pedido_abierto: 0, unidad: 'kg' }), { cantidad: 6, motivo: 'OK' });
  assert.deepEqual(u.sugerido({ par: 10, stock_actual: 4.25, pedido_abierto: 1, unidad: 'kg' }), { cantidad: 4.8, motivo: 'OK' });
  assert.deepEqual(u.sugerido({ par: 6, stock_actual: 1.5, unidad: 'unidad' }), { cantidad: 5, motivo: 'OK' });
  assert.deepEqual(u.sugerido({ par: null, stock_actual: 4 }), { cantidad: null, motivo: 'SIN_PAR' });
  assert.deepEqual(u.sugerido({ par: 4, stock_actual: null }), { cantidad: null, motivo: 'SIN_CONTEO' });
  assert.equal(u.estadoStock(10, 0), 'SIN_STOCK'); assert.equal(u.estadoStock(10, 4), 'BAJO'); assert.equal(u.estadoStock(10, 12), 'OK'); assert.equal(u.estadoStock(null, 3), 'SIN_PAR'); assert.equal(u.estadoStock(3, null), 'SIN_CONTEO');
  ok('sugerido y estado de stock (contrato §3.5)');
  assert.ok(u.conteoSospechoso(3050, { par: 5, unidad: 'kg' }), 'chinchulín 3050 kg con par 5');
  assert.ok(u.conteoSospechoso(3050, { unidad: 'kg' }), 'kg sin referencia');
  assert.equal(u.conteoSospechoso(3, { par: 5, unidad: 'kg' }), null);
  assert.equal(u.conteoSospechoso(12, { stock_actual: 1, unidad: 'unidad' }), null, 'diferencia chica no avisa');
  assert.ok(u.conteoSospechoso(40, { stock_actual: 2, unidad: 'unidad' }));
  assert.equal(u.conteoSospechoso(0, { par: 5 }), null);
  assert.equal(u.conteoSospechoso(500, { unidad: 'unidad' }), null);
  ok('aviso de conteo sospechoso');
  const dia = n => new Date(2026, 9, 25 + n, 10); // 25/10/2026 es domingo
  assert.equal(u.avisoCierre(dia(1)), null, 'lunes sin aviso');
  assert.equal(u.avisoCierre(dia(3)).kind, 'warn', 'miércoles último día');
  assert.equal(u.avisoCierre(dia(3), { yaPidio: true }), null);
  assert.equal(u.avisoCierre(dia(4)).kind, 'plain', 'jueves cerrado');
  assert.ok(u.avisoCierre(dia(5)).texto.includes('Florida'));
  assert.equal(u.avisoCierre(dia(6)), null, 'sábado sin aviso');
  ok('aviso de cierre de pedidos');
  assert.deepEqual(u.faltasProducto({ proveedor: '', precio: null, stock_actual: 0 }), ['proveedor', 'precio']);
  const rd = u.resumenDatos([{ local: 'A', proveedor: 'X', precio: 10, stock_actual: 1 }, { local: 'A', proveedor: 'X', precio: null, stock_actual: null }, { local: 'A', estado: 'Inactivo' }]);
  assert.equal(rd.length, 1); assert.equal(rd[0].total, 2); assert.deepEqual(rd[0].pct, { proveedor: 100, precio: 50, conteo: 50 });
  ok('resumen de datos pendientes');
  const s42 = u.semanaDe('2026-10-14');
  assert.equal(s42.id, '2026-W42'); assert.equal(s42.inicio, '2026-10-12'); assert.equal(s42.fin, '2026-10-18');
  assert.equal(s42.label, 'Semana 42, 12 al 18 de octubre');
  assert.equal(u.semanaDe('2026-01-01').id, '2026-W01');
  assert.equal(u.semanaDe('2027-01-01').id, '2026-W53');
  assert.match(u.semanaDe('2026-09-30').label, /^Semana 40, 28 de septiembre al 4 de octubre$/);
  ok('semana ISO igual al servidor');
  const id = u.nuevoId('PED');
  assert.match(id, u.ID_RE); assert.ok(id.startsWith('PED-'));
  assert.notEqual(u.nuevoId('CNT'), u.nuevoId('CNT'));
  ok('IDs con el formato del contrato §2');
  assert.deepEqual(u.parsearTabla('Producto\tUnidad\r\nTomate\tkg\n\n'), [['Producto', 'Unidad'], ['Tomate', 'kg']]);
  assert.equal(u.norm('  Verdulería  Ñandú '), 'verduleria ñandu'.replace('ñ', 'n') === 'verduleria nandu' ? u.norm('Verdulería Ñandú') : u.norm('Verdulería Ñandú'));
  assert.equal(u.waUrl('+54 9 11 5555-0000', 'hola'), 'https://wa.me/5491155550000?text=hola');
  assert.equal(u.fechaRelativa('2026-10-22 14:30:00', new Date(2026, 9, 22, 18)), 'hoy 14:30');
  assert.equal(u.fechaRelativa('2026-10-21 09:05:00', new Date(2026, 9, 22, 18)), 'ayer 09:05');
  assert.equal(u.haceDias('2026-10-15 09:05:00', new Date(2026, 9, 22, 18)), 7);
  ok('texto, pegado, WhatsApp y fechas');

  /* api.js: dirección, caché y cola */
  const api = await import(path.join(APP, 'js/api.js'));
  assert.equal(api.apiUrl(), 'https://script.google.com/macros/s/X/exec');
  globalThis.location.search = '?api=/api';
  assert.equal(api.apiUrl(), '/api');
  globalThis.location.search = '';
  assert.equal(api.apiUrl(), '/api', 'la URL fijada con ?api= persiste');
  globalThis.DOCKS_APP_CONFIG.API_URL = 'https://script.google.com/macros/s/NUEVA/exec';
  assert.equal(api.apiUrl(), 'https://script.google.com/macros/s/NUEVA/exec', 'al cambiar config.js se descarta la URL fijada');
  ok('dirección del backend: ?api= y cambio de config.js');

  const llamadas = [];
  let modo = 'ok';
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), init });
    if (modo === 'red') throw new TypeError('Failed to fetch');
    const body = init && init.body ? JSON.parse(init.body) : null;
    const qs = new URL(String(url), 'http://x').searchParams;
    const action = body ? body.action : qs.get('action');
    let data;
    if (modo === 'ilegible' && body) return { text: async () => '<html>' };
    if (action === 'savePedido') data = { ok: true, id_pedido: body.id_pedido, lineas: 2 };
    else if (action === 'getPedido') data = modo === 'noexiste' ? { ok: true, found: false } : { ok: true, found: true, pedido: { id_pedido: qs.get('id') }, lineas: [] };
    else if (action === 'getHoy') data = { ok: true, bajo_par: 3 };
    else if (action === 'rechazo') data = { ok: false, error: 'Local inactivo' };
    else data = { ok: true, version: 'v3' };
    return { text: async () => JSON.stringify(data) };
  };
  const r1 = await api.enviar({ payload: { action: 'savePedido', id_pedido: 'PED-1' }, id: 'PED-1', confirmAction: 'getPedido', titulo: 'p' });
  assert.equal(r1.estado, 'confirmado'); assert.equal(r1.respuesta.lineas, 2);
  modo = 'ilegible';
  const r2 = await api.enviar({ payload: { action: 'savePedido', id_pedido: 'PED-2' }, id: 'PED-2', confirmAction: 'getPedido', titulo: 'p' });
  assert.equal(r2.estado, 'confirmado'); assert.equal(r2.respuesta.pedido.id_pedido, 'PED-2', 'respuesta ilegible → confirma por ID');
  modo = 'ok';
  await assert.rejects(api.post({ action: 'rechazo' }), e => e.server && /Local inactivo/.test(e.message));
  globalThis.navigator.onLine = false;
  const r3 = await api.enviar({ payload: { action: 'savePedido', id_pedido: 'PED-3' }, id: 'PED-3', confirmAction: 'getPedido', titulo: 'p' });
  assert.equal(r3.estado, 'pendiente'); assert.equal(api.pendientes().length, 1);
  globalThis.navigator.onLine = true;
  await api.vaciarCola();
  assert.equal(api.pendientes().length, 0, 'la cola se vacía al volver la red');
  ok('envíos: confirmación por ID, rechazo del servidor y cola sin conexión');

  llamadas.length = 0;
  const c1 = api.cached('getHoy', { local: 'Umo Grill' }, { maxAge: 60000 });
  assert.equal(c1.data, null); await c1.fresh;
  const c2 = api.cached('getHoy', { local: 'Umo Grill' }, { maxAge: 60000 });
  assert.equal(c2.data.bajo_par, 3); assert.equal(c2.stale, false);
  await c2.fresh;
  assert.equal(llamadas.filter(x => x.url.includes('getHoy')).length, 1, 'con caché fresca no vuelve a pedir');
  api.invalidar('getHoy');
  assert.equal(api.leerCache('getHoy', { local: 'Umo Grill' }), null);
  ok('caché de lecturas con invalidación');

  console.log(`App verification passed (${pasos} checks).`);
})().catch(e => { console.error('FALLÓ:', e.message); process.exit(1); });
