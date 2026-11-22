// Datos y API de Supabase mockeada para e2e-cierre.js y e2e-comprar.js (no es una prueba: la usan esas dos).
// Domingo 22/11/2026; el lunes 23/11 es feriado (Soberanía Nacional, trasladado). Umo y Trento abren vie · sáb · dom y
// feriados (los días por defecto de 0032). El Shopping no elabora: no entra en la Hoja nueva ni en Comprar.
// Historial: aperturas y cierres de las últimas 4 semanas en la Hoja (12 días abiertos). Umo cerró el sábado; Trento no.
// opciones.sin0032: locales sin dias_abre/abre_feriados (42703) y sin rpc hoja_guardar (PGRST202), como hoy en producción.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SB = 'https://zunyzlpzofbyqplgiupl.supabase.co';
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

const L = { umo: 'loc-umo', tre: 'loc-tre', shp: 'loc-shp' };
const U = { umo: 'usr-umo', ger: 'usr-ger' };
const PV = { barcena: 'prv-barcena', florida: 'prv-florida', martin: 'prv-martin' };
const PROVS = [
  { id: PV.barcena, nombre: 'Barcena', whatsapp: '', dias_entrega: '1 día', corte: null, tiene_minimo: false, activo: true },
  { id: PV.florida, nombre: 'Distribuidora Florida', whatsapp: '', dias_entrega: '1 día', corte: null, tiene_minimo: false, activo: true },
  { id: PV.martin, nombre: 'Martín De Ridder', whatsapp: '', dias_entrega: '1 día', corte: null, tiene_minimo: true, activo: true }
];
let seq = 0;
const prod = (id, nombre, cat, uc, uu, factor, prov, lugar, local = L.umo) => ({ id, codigo: 'C-' + String(++seq).padStart(3, '0'), nombre, local_id: local, categoria: cat, unidad_compra: uc, unidad_uso: uu, factor_conversion: factor, proveedor_id: prov, par: null, es_elaborado: false, activo: true, oculto: false, lugar, orden_lugar: seq });
const P = {
  coca: prod('coca', 'Coca-Cola 500 ml', 'Bebidas', 'pack', 'unidad', 6, PV.florida, 'Barra'),
  cerveza: prod('cerveza', 'Cerveza rubia lata 473 ml', 'Bebidas', 'caja', 'unidad', 6, PV.florida, 'Barra'),
  limon: prod('limon', 'Limones', 'Verdulería', 'kg', 'kg', 1, PV.barcena, 'Barra'),
  servilleta: prod('servilleta', 'Servilletas de papel', 'Descartables', 'paquete', 'paquete', 1, null, 'Barra'),
  chorizo: prod('chorizo', 'Chorizo parrillero', 'Carnes', 'kg', 'kg', 1, PV.barcena, 'Cocina'),
  molleja: prod('molleja', 'Molleja', 'Carnes', 'kg', 'kg', 1, PV.martin, 'Cocina'),
  morcilla: prod('morcilla', 'Morcilla bombón', 'Carnes', 'kg', 'kg', 1, PV.barcena, 'Cocina'),
  cafe: prod('cafe', 'Café en grano', 'Café', 'kg', 'kg', 1, PV.barcena, 'Barra', L.tre),
  leche: prod('leche', 'Leche entera', 'Lácteos', 'litro', 'litro', 1, PV.florida, 'Barra', L.tre),
  cocaT: prod('coca-t', 'Coca-Cola 500 ml', 'Bebidas', 'pack', 'unidad', 6, PV.florida, 'Barra', L.tre),
  papel: prod('papel', 'Papel higiénico', 'Limpieza', 'rollo', 'rollo', 1, null, null, L.shp)
};
// Uso de un día abierto: apertura − cierre (Hoja). Sábado 21/11: lo que quedó al cerrar.
const USO = { coca: [30, 12], cerveza: [40, 22], limon: [3, 1], servilleta: [5, 3], chorizo: [8, 5], molleja: [3, 2], cafe: [4, 3], leche: [20, 12], 'coca-t': [18, 10] };
const PRECIO = { coca: 5400, cerveza: 7200, limon: 2000, servilleta: 1500, chorizo: 8000, molleja: 9000, morcilla: 7000, cafe: 30000, leche: 1500, 'coca-t': 5400, papel: 450 };
const STOCK = { coca: 30, cerveza: 40, limon: 2, servilleta: 4, chorizo: 6, molleja: 3, morcilla: 2, cafe: 2, leche: 15, 'coca-t': 12, papel: 80 };

const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const dia = (f, n) => { const [y, m, d] = f.split('-').map(Number); return iso(new Date(Date.UTC(y, m - 1, d + n))); };
const ts = (f, h) => new Date(`${f}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();
const HOY = '2026-11-22';
// Fechas abiertas (vie, sáb, dom) de las 4 semanas antes de hoy.
const ABIERTOS = [];
for (let n = 1; n <= 28; n++) { const f = dia(HOY, -n); const dow = new Date(f + 'T12:00:00Z').getUTCDay(); if ([5, 6, 0].includes(dow)) ABIERTOS.push(f); }

function base(opc = {}) {
  const hoja = [], movs = [], log = [], rpc = [], patches = [], posts = [];
  let hid = 0;
  const h = (local, fecha, sector, pid, tipo, cantidad, hora) => hoja.push({ id: 'h' + (++hid), local_id: local, fecha, sector, producto_id: pid, tipo, cantidad, otro: null, quien: 'Lucas', creado_en: ts(fecha, hora) });
  for (const f of ABIERTOS) {
    for (const p of Object.values(P)) {
      if (p.local_id === L.shp || !USO[p.id]) continue;
      if (p.local_id === L.tre && f === '2026-11-21') { h(p.local_id, f, p.lugar, p.id, 'apertura', USO[p.id][0], 9); continue; } // Trento abrió el sábado y no cerró
      h(p.local_id, f, p.lugar, p.id, 'apertura', USO[p.id][0], 9);
      h(p.local_id, f, p.lugar, p.id, 'cierre', USO[p.id][1], 23);
    }
  }
  // Morcilla: producto nuevo, contado solo el viernes y el sábado → sin historial.
  for (const f of ['2026-11-20', '2026-11-21']) { h(L.umo, f, 'Cocina', 'morcilla', 'apertura', 3, 9); h(L.umo, f, 'Cocina', 'morcilla', 'cierre', 2, 23); }
  // El domingo a la mañana llegaron 4 packs de Coca (24 unidades) a Umo.
  movs.push({ id: 'm1', local_id: L.umo, producto_id: 'coca', tipo: 'recepcion', cantidad: 24, nota: '', creado_en: ts(HOY, 9), ref_id: null });
  const ordenes = [
    { id: 'o-flo', local_id: L.umo, proveedor_id: PV.florida, estado: 'enviada', creado_en: ts('2026-11-19', 11), cargado_por_nombre: 'Lucas', nota: null,
      orden_items: [{ id: 'i1', producto_id: 'cerveza', cantidad_pedida: 1, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false, precio_unitario: 7200 }] },
    { id: 'o-bar', local_id: L.tre, proveedor_id: PV.barcena, estado: 'borrador', creado_en: ts('2026-11-21', 12), cargado_por_nombre: 'Angelica', nota: null,
      orden_items: [{ id: 'i2', producto_id: 'cafe', cantidad_pedida: 3, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false, precio_unitario: 30000 }] },
    { id: 'o-rid', local_id: L.umo, proveedor_id: PV.martin, estado: 'recibida', creado_en: ts('2026-11-17', 11), cargado_por_nombre: 'Maru', nota: null,
      orden_items: [{ id: 'i3', producto_id: 'molleja', cantidad_pedida: 6, cantidad_recibida: 6, excluido: false, agregado: false, no_vino: false, precio_unitario: 9000 }] }
  ];
  const locales = [
    { id: L.umo, codigo: 'UMO', nombre: 'Umo Grill', encargados: ['Lucas'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null, dias_abre: [0, 5, 6], abre_feriados: true },
    { id: L.tre, codigo: 'TRE', nombre: 'Trento Café', encargados: ['Angelica'], activo: true, razon_social: 'SUMA ACTIVA S.A.', cuit: null, dias_abre: [0, 5, 6], abre_feriados: true },
    { id: L.shp, codigo: 'SHP', nombre: 'Shopping', encargados: ['Marcos'], activo: true, razon_social: 'SPMAR S.A.', cuit: null, dias_abre: [0, 5, 6], abre_feriados: true }
  ];
  return { opc, hoja, movs, ordenes, locales, log, rpc, patches, posts, hid: () => ++hid };
}

function jwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3650 * 86400 })}.firma`;
}
function sesion(sub) {
  const exp = Math.floor(Date.now() / 1000) + 3650 * 86400;
  return { access_token: jwt(sub), token_type: 'bearer', expires_in: 3650 * 86400, expires_at: exp, refresh_token: 'r-' + sub,
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
    else if (v.startsWith('in.(')) { const l = v.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, '')); r = r.filter(x => l.includes(String(x[k]))); }
  }
  return r;
};

// Hora de lo guardado: la del reloj fijo de la prueba (opc.ahora), no la de la máquina.
const ahora = (db) => (db.opc.ahora ? new Date(+new Date(db.opc.ahora) + 60000 * (db.min = (db.min || 0) + 1)) : new Date()).toISOString();
function montarApi(ctx, db, errores) {
  return ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()); const q = u.searchParams;
    const json = (data, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const sub = subDe(req); const rol = sub === U.ger ? 'gerencia' : 'encargado';
    const t = u.pathname.replace('/rest/v1/', '');
    db.log.push({ t, rol, m: req.method(), sel: q.get('select') || '' });
    if (u.pathname === '/auth/v1/user') return json(sesion(sub || U.umo).user);
    if (u.pathname === '/auth/v1/token') return json(sesion(U.umo));
    const mio = (r) => rol === 'gerencia' || r.local_id === L.umo;
    const sin = db.opc.sin0032;
    if (t === 'perfiles') return json(rol === 'gerencia' ? [{ id: U.ger, nombre: 'Jacobo', rol: 'gerencia', local_id: null }] : [{ id: sub, nombre: 'Umo', rol: 'encargado', local_id: L.umo }]);
    if (t === 'locales' && req.method() === 'PATCH') {
      if (sin) return json({ code: '42703', message: 'column "dias_abre" of relation "locales" does not exist' }, 400);
      const b = JSON.parse(req.postData() || '{}'); const id = (q.get('id') || '').replace('eq.', '');
      db.patches.push({ id, b }); const l = db.locales.find(x => x.id === id); if (l) Object.assign(l, b);
      return json([{ id }]);
    }
    if (t === 'locales') {
      if (sin && /dias_abre|abre_feriados/.test(q.get('select') || '')) return json({ code: '42703', message: 'column locales.dias_abre does not exist' }, 400);
      return json(filtro(db.locales.map(l => { const x = { ...l }; if (sin) { delete x.dias_abre; delete x.abre_feriados; } return x; }), q));
    }
    if (t === 'proveedores_basico' || t === 'proveedores') return json(PROVS);
    if (t === 'productos') return json(filtro(Object.values(P).filter(mio), q));
    if (t === 'stock_actual') return json(filtro(Object.values(P).filter(mio).map(p => ({ local_id: p.local_id, producto_id: p.id, stock: STOCK[p.id] })), q));
    if (t === 'precio_actual') { if (rol !== 'gerencia') errores.push('el encargado pidió precios'); return json(Object.entries(PRECIO).map(([producto_id, precio]) => ({ producto_id, precio }))); }
    if (t === 'precios') return json([]);
    if (t === 'hoja_movs') return json(filtro(db.hoja.filter(mio), q));
    if (t === 'movimientos') return json(filtro(db.movs.filter(mio), q));
    if (t === 'ordenes_compra' && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); const o = { ...b, id: 'o-n' + db.hid(), creado_en: ahora(db), orden_items: [] };
      db.ordenes.unshift(o); db.posts.push({ t, b }); return json([{ id: o.id }], 201);
    }
    if (t === 'orden_items' && req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '[]'); const arr = Array.isArray(b) ? b : [b];
      for (const i of arr) { const o = db.ordenes.find(x => x.id === i.orden_id); if (o) o.orden_items.push({ id: 'i-n' + db.hid(), ...i, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false }); }
      db.posts.push({ t, b: arr }); return route.fulfill({ status: 201, headers: cors, body: '' });
    }
    if (t === 'ordenes_compra') return json(filtro(db.ordenes.filter(mio), q).map(o => ({ ...o, orden_items: o.orden_items || [] })));
    if (t === 'notas' || t === 'conteos' || t === 'destinos' || t === 'facturas' || t === 'pagos') return json([]);
    if (t.startsWith('rpc/')) db.rpc.push({ fn: t.slice(4), ...JSON.parse(req.postData() || '{}') });
    const guardar = (b, sectorDe) => {
      let n = 0;
      for (const it of b.p_items) {
        const sector = sectorDe(it);
        db.hoja = db.hoja.filter(m => !(m.local_id === b.p_local && m.fecha === b.p_fecha && m.sector === sector && m.producto_id === it.producto_id && m.tipo === b.p_tipo));
        if (it.cantidad === '' || it.cantidad == null) continue;
        db.hoja.push({ id: 'h' + db.hid(), local_id: b.p_local, fecha: b.p_fecha, sector, producto_id: it.producto_id, tipo: b.p_tipo, cantidad: Number(it.cantidad), otro: null, quien: b.p_quien, creado_en: ahora(db) }); n++;
      }
      return n;
    };
    if (t === 'rpc/hoja_guardar') {
      if (sin) return json({ code: 'PGRST202', message: 'Could not find the function public.hoja_guardar(p_fecha, p_items, p_local, p_quien, p_tipo) in the schema cache' }, 404);
      return json(guardar(JSON.parse(req.postData() || '{}'), it => it.sector));
    }
    if (t === 'rpc/hoja_contar') { const b = JSON.parse(req.postData() || '{}'); return json(guardar(b, () => b.p_sector)); }
    if (t === 'rpc/buscar_productos') return json([]);
    errores.push('mock: ruta no prevista ' + req.method() + ' ' + u.pathname + ' (' + rol + ')');
    return json([]);
  });
}

module.exports = { servidor, SB, L, U, PV, P, PRECIO, HOY, base, sesion, montarApi };
