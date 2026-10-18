// Verifica el backend V3 publicado, SIN escribir datos: sólo lecturas y escrituras que el
// servidor debe rechazar antes de tocar la planilla. Uso: node scripts/verify-live-v3.js [URL]
const fs = require('node:fs');
const assert = require('node:assert/strict');

const cfg = fs.readFileSync('v3/config.js', 'utf8').match(/API_URL:\s*"([^"]*)"/);
const URL_API = process.argv[2] || (cfg && cfg[1]);
if (!URL_API) { console.error('Falta la URL del backend V3 (v3/config.js o argumento).'); process.exit(1); }

async function get(action, params = {}) {
  const u = new URL(URL_API);
  u.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { redirect: 'follow' });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_e) { throw new Error(`${action}: respuesta no JSON (${res.status}): ${txt.slice(0, 200)}`); }
}
async function post(body) {
  const res = await fetch(URL_API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_e) { throw new Error(`${body.action}: respuesta no JSON (${res.status}): ${txt.slice(0, 200)}`); }
}

(async () => {
  const ping = await get('ping');
  assert.equal(ping.ok, true); assert.equal(ping.version, 'v3');
  console.log('OK ping', ping.hora || '');

  const boot = await get('getBootstrap');
  assert.equal(boot.ok, true);
  assert.match(boot.semana.id, /^\d{4}-W\d{2}$/);
  const activos = boot.locales.filter(l => l.activo).map(l => l.local);
  assert.ok(activos.includes('Umo Grill') && activos.includes('Trento Café'));
  console.log(`OK bootstrap: ${boot.semana.label} · ${activos.length} locales activos · ${boot.proveedores.length} proveedores`);

  const cat = await get('getCatalogo', { local: 'Umo Grill' });
  assert.equal(cat.ok, true); assert.ok(Array.isArray(cat.productos));
  console.log(`OK catálogo Umo Grill: ${cat.productos.length} productos`);

  for (const [a, p] of [['getHoy', { local: 'Umo Grill' }], ['getPorRecibir', { local: 'Umo Grill' }], ['getConsolidado', {}], ['getOrdenes', {}], ['getFaltantes', {}], ['getStockPanel', {}]]) {
    const r = await get(a, p); assert.equal(r.ok, true, `${a}: ${r.error}`);
  }
  console.log('OK lecturas de Hoy, Recibir, Compras, Órdenes, Faltantes y Stock');

  const nf = await get('getPedido', { id: 'PED-20000101-000000-zzzz' });
  assert.equal(nf.ok, true); assert.equal(nf.found, false);

  const mala = await post({ action: 'checkAdmin', admin_key: 'clave-incorrecta-de-prueba' });
  assert.equal(mala.ok, false);
  const pedidoMalo = await post({ action: 'savePedido', id_pedido: 'PED-20000101-000000-zzzz', local: 'Local Inexistente', encargado: 'Prueba', prioridad: 'Normal', items: [] });
  assert.equal(pedidoMalo.ok, false);
  console.log('OK rechazos: clave incorrecta y pedido inválido (no se escribió nada)');

  const cb = new URL(URL_API); cb.searchParams.set('action', 'ping'); cb.searchParams.set('callback', 'cb_1');
  assert.match(await (await fetch(cb)).text(), /^cb_1\(/);
  console.log('OK JSONP');
  console.log('Live V3 verification passed.');
})().catch(e => { console.error('FALLÓ:', e.message); process.exitCode = 1; });
