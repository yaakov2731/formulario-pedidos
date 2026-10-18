// Verifica v3/core.js en memoria: números, semana ISO, sugerido, ids y api.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function load(extra = {}) {
  const storage = new Map();
  const win = {
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    location: { href: 'http://localhost:8787/', search: '' },
    navigator: { onLine: true },
    URL, URLSearchParams, setTimeout, clearTimeout, ...extra
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync('v3/core.js', 'utf8'), ctx);
  return { Docks: win.Docks, win, storage };
}

(async () => {
  const { Docks, win } = load();

  // números
  assert.equal(Docks.num.parse('1,5'), 1.5);
  assert.equal(Docks.num.parse('1.5'), 1.5);
  assert.equal(Docks.num.parse('1.234,5'), 1234.5);
  assert.equal(Docks.num.parse('0'), 0);
  assert.equal(Docks.num.parse(''), null);
  assert.equal(Docks.num.parse('2 kg'), null);
  assert.equal(Docks.num.parse(Infinity), null);
  assert.equal(Docks.num.fmt(null), '—');

  // semana ISO
  assert.equal(Docks.semana.de(new Date(2026, 9, 18)).id, '2026-W42');
  assert.equal(Docks.semana.de(new Date(2026, 9, 18)).label, 'Semana 42 · 12 al 18 oct');
  assert.equal(Docks.semana.de(new Date(2026, 9, 12)).inicio, '2026-10-12');
  assert.equal(Docks.semana.de(new Date(2026, 9, 28)).label, 'Semana 44 · 26 oct al 1 nov');
  assert.equal(Docks.semana.de(new Date(2027, 0, 1)).id, '2026-W53');
  assert.equal(Docks.semana.de(new Date(2025, 11, 29)).id, '2026-W01');

  // sugerido
  assert.deepEqual({ ...Docks.sugerido({ par: 10, stock_actual: 4, pedido_abierto: 0, unidad: 'kg' }) }, { cantidad: 6, motivo: 'OK' });
  assert.equal(Docks.sugerido({ par: 10, stock_actual: 7.31, unidad: 'kg' }).cantidad, 2.7);
  assert.equal(Docks.sugerido({ par: 10, stock_actual: 7.3, unidad: 'kg' }).cantidad, 2.7);
  assert.equal(Docks.sugerido({ par: 5, stock_actual: 2.2, unidad: 'caja' }).cantidad, 3);
  assert.equal(Docks.sugerido({ par: 5, stock_actual: 1, pedido_abierto: 3, unidad: 'unidad' }).cantidad, 1);
  assert.equal(Docks.sugerido({ par: 5, stock_actual: 9, unidad: 'unidad' }).cantidad, 0);
  assert.equal(Docks.sugerido({ par: '', stock_actual: 1 }).motivo, 'SIN_PAR');
  assert.equal(Docks.sugerido({ par: 0, stock_actual: 0, unidad: 'kg' }).cantidad, 0);
  assert.equal(Docks.sugerido({ par: 3, stock_actual: null }).motivo, 'SIN_CONTEO');

  // ids
  assert.match(Docks.ids.nuevo('PED'), /^PED-\d{8}-\d{6}-[a-z0-9]{4}$/);
  assert.match(Docks.ids.nuevo('oc'), /^OC-\d{8}-\d{6}-[a-z0-9]{4}$/);

  // texto
  assert.equal(Docks.norm('  Café  Grano '), 'cafe grano');
  assert.equal(Docks.esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');

  // api sin configurar
  assert.equal(Docks.api.configured(), false);
  await assert.rejects(Docks.api.get('ping'), /Falta configurar/);

  // ?api= se guarda en el equipo
  win.location.search = '?api=/api';
  assert.equal(Docks.api.url(), '/api');
  win.location.search = '';
  assert.equal(Docks.api.configured(), true);

  // post: JSON legible, ok:false y respuesta ilegible
  const calls = [];
  win.fetch = async (url, opts) => { calls.push({ url, opts }); return { json: async () => ({ ok: true, id_pedido: 'X' }) }; };
  assert.equal((await Docks.api.post({ action: 'savePedido' })).id_pedido, 'X');
  assert.equal(calls[0].url, 'http://localhost:8787/api');
  assert.equal(calls[0].opts.headers['Content-Type'], 'text/plain;charset=utf-8');
  win.fetch = async () => ({ json: async () => ({ ok: false, error: 'Local inactivo' }) });
  await assert.rejects(Docks.api.post({}), e => e.server === true && /Local inactivo/.test(e.message));
  win.fetch = async () => { throw new TypeError('opaque'); };
  assert.equal(await Docks.api.post({}), null);
  win.navigator.onLine = false;
  await assert.rejects(Docks.api.post({}), /Sin conexión/);
  win.navigator.onLine = true;

  // get por JSONP
  let script;
  win.document = { createElement: () => ({}), head: { appendChild: el => { script = el; el.parentNode = { removeChild: () => { el.parentNode = null; } }; } } };
  const p = Docks.api.get('getHoy', { local: 'Umo Grill' });
  const u = new URL(script.src);
  assert.equal(u.searchParams.get('action'), 'getHoy');
  assert.equal(u.searchParams.get('local'), 'Umo Grill');
  win[u.searchParams.get('callback')]({ ok: true, semana: { id: '2026-W42' } });
  assert.equal((await p).semana.id, '2026-W42');
  const p2 = Docks.api.get('getHoy');
  win[new URL(script.src).searchParams.get('callback')]({ ok: false, error: 'Local desconocido' });
  await assert.rejects(p2, e => e.server && /Local desconocido/.test(e.message));

  // confirm: reintenta hasta encontrar
  let n = 0;
  win.document.head.appendChild = el => {
    script = el; el.parentNode = { removeChild: () => { el.parentNode = null; } };
    const cb = new URL(el.src).searchParams.get('callback');
    n++;
    setTimeout(() => win[cb](n < 2 ? { ok: true, found: false } : { ok: true, found: true, pedido: { id_pedido: 'PED-1' } }), 0);
  };
  const r = await Docks.api.confirm('getPedido', 'PED-1', { espera: 1 });
  assert.equal(r.pedido.id_pedido, 'PED-1');
  assert.equal(n, 2);
  n = -100;
  assert.equal(await Docks.api.confirm('getPedido', 'PED-1', { espera: 1, intentos: 2 }), null);

  console.log('V3 core verification passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
