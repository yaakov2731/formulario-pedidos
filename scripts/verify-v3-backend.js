// Verifica el backend V3 (v3/gas/*.gs) en memoria con scripts/v3/fake-gas.js.
// Uso: node scripts/verify-v3-backend.js
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createGasRuntime } = require('./v3/fake-gas');

const ROOT = path.resolve(__dirname, '..');
const GAS_DIR = path.join(ROOT, 'v3', 'gas');
const KEY = 'test';

const HEADERS = {
  CATALOGO: ['Código', 'Producto', 'Local', 'Categoría', 'Unidad', 'Proveedor', 'Precio', 'Par', 'Stock_Actual', 'Ultimo_Conteo', 'Estado', 'Actualizado'],
  PROVEEDORES: ['Proveedor', 'Contacto', 'WhatsApp', 'Email', 'Dias_Entrega', 'Pedido_Minimo', 'Activo', 'Observaciones'],
  LOCALES: ['Local', 'Activo', 'Encargados', 'Dia_Pedido', 'Hora_Corte', 'Prefijo_Codigo', 'Observaciones'],
  PEDIDOS: ['ID_Pedido', 'Fecha_Hora', 'Semana', 'Local', 'Encargado', 'Prioridad', 'Fecha_Entrega', 'Notas', 'Lineas', 'Estado'],
  PEDIDO_LINEAS: ['ID_Linea', 'ID_Pedido', 'Fecha_Hora', 'Semana', 'Local', 'Código', 'Producto', 'Categoría', 'Unidad', 'Cantidad', 'Proveedor', 'Precio_Ref', 'Estado', 'ID_OC', 'Cantidad_Recibida', 'Fecha_Recepcion', 'ID_Recepcion', 'Observaciones'],
  MOVIMIENTOS: ['Fecha_Hora', 'ID_Operacion', 'Tipo', 'Local', 'Encargado', 'Código', 'Producto', 'Unidad', 'Cantidad', 'Saldo_Anterior', 'Saldo_Resultante', 'Costo_Unitario', 'Referencia', 'Observaciones'],
  COMPRAS: ['ID_OC', 'Fecha_Hora', 'Semana', 'Proveedor', 'Locales', 'Estado', 'Lineas', 'Total_Estimado', 'Responsable', 'Texto_WhatsApp', 'Observaciones'],
  LOG: ['Fecha_Hora', 'Tipo', 'Referencia', 'Local', 'OK', 'Detalle']
};
const ORDER = ['CATALOGO', 'PROVEEDORES', 'LOCALES', 'PEDIDOS', 'PEDIDO_LINEAS', 'MOVIMIENTOS', 'COMPRAS', 'TABLERO', 'LOG'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/* ---------- ayudas ---------- */
function mk(props, extra) {
  return createGasRuntime(Object.assign({ dir: GAS_DIR, properties: Object.assign({ ADMIN_KEY: KEY }, props || {}) }, extra || {}));
}
let seq = 0;
function nid(prefijo) {
  seq++;
  return prefijo + '-20261018-143000-' + seq.toString(36).padStart(4, '0');
}
function get(rt, action, params) {
  const out = rt.doGet({ parameter: Object.assign({ action }, params || {}) });
  return JSON.parse(out.text);
}
function post(rt, body) {
  const out = rt.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } });
  assert.match(out.mimeType, /json/);
  return JSON.parse(out.text);
}
function ok(r) {
  assert.equal(r.ok, true, 'se esperaba ok:true y llegó: ' + JSON.stringify(r));
  return r;
}
function bad(r, re) {
  assert.equal(r.ok, false, 'se esperaba ok:false y llegó: ' + JSON.stringify(r).slice(0, 300));
  assert.equal(typeof r.error, 'string');
  if (re) assert.match(r.error, re);
  return r;
}
function rows(rt, name) {
  const v = rt.sheet(name);
  const h = v[0];
  return v.slice(1).filter(r => r.some(x => x !== '')).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
function plain(x) { return JSON.parse(JSON.stringify(x)); }
function loadCore() {
  const win = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { href: 'http://localhost/', search: '' }, URL, URLSearchParams, setTimeout, clearTimeout };
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'v3', 'core.js'), 'utf8'), vm.createContext(win));
  return win.Docks;
}
function setCell(rt, sheet, filtro, header, value) {
  const sh = rt.spreadsheet.getSheetByName(sheet);
  const v = sh.getDataRange().getValues();
  const c = v[0].indexOf(header);
  let n = 0;
  v.forEach((r, i) => { if (i > 0 && filtro(Object.fromEntries(v[0].map((k, j) => [k, r[j]])))) { sh.getRange(i + 1, c + 1).setValue(value); n++; } });
  assert.ok(n > 0, 'setCell no encontró filas en ' + sheet);
}
function fmtFecha(rt, d) { return rt.formatDate(d, 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'); }

const Docks = loadCore();

/* ================= Utilities.formatDate ================= */
{
  const rt = mk();
  const d = new Date(Date.UTC(2026, 9, 18, 2, 5, 9));
  assert.equal(rt.formatDate(d, 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd HH:mm:ss'), '2026-10-17 23:05:09');
  assert.equal(rt.formatDate(d, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'"), '2026-10-18T02:05:09Z');
  assert.equal(rt.formatDate(new Date(Date.UTC(2026, 0, 1, 2, 59)), 'America/Argentina/Buenos_Aires', 'dd/MM/yy HH:mm'), '31/12/25 23:59');
  assert.equal(rt.formatDate(d, 'America/Argentina/Buenos_Aires', 'Z'), '-0300');
}

/* ================= semana idéntica a core.js ================= */
{
  const rt = mk();
  for (let k = 0; k < 1500; k++) {
    const d = new Date(2024, 0, 1 + k);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    assert.deepEqual(plain(rt.call('semanaDe_', iso)), plain(Docks.semana.de(d)), 'semana distinta para ' + iso);
  }
}

/* ================= setupV3 ================= */
const rt = mk();
{
  const r1 = plain(rt.call('setupV3'));
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.creadas, ORDER);
  assert.equal(r1.semilla, true);
  const ss = rt.spreadsheet;
  assert.deepEqual(ss.getSheets().map(s => s.getName()), ORDER, 'pestañas en orden y sin hojas extra');
  Object.keys(HEADERS).forEach(name => {
    assert.deepEqual(rt.sheet(name)[0], HEADERS[name], 'encabezados de ' + name);
    const sh = ss.getSheetByName(name);
    assert.equal(sh.getFrozenRows(), 1, 'fila 1 congelada en ' + name);
    assert.equal(sh.getRange(1, 1).getFontWeight(), 'bold', 'encabezado en negrita en ' + name);
  });
  const locales = rows(rt, 'LOCALES');
  assert.deepEqual(locales.map(l => l.Local), ['Umo Grill', 'Trento Café', 'Brooklyn', 'Puerto Gelato', 'GreenFresh', 'Shopping', 'Eventos', 'Depósito', 'Pizzería']);
  assert.deepEqual(locales.map(l => l.Prefijo_Codigo), ['UMO', 'TRE', 'BRK', 'GEL', 'GRF', 'SHP', 'EVT', 'DEP', 'PIZ']);
  assert.deepEqual(locales.map(l => l.Activo), ['SÍ', 'SÍ', 'SÍ', 'SÍ', 'SÍ', 'SÍ', 'SÍ', 'SÍ', 'NO']);
  assert.ok(locales.every(l => l.Dia_Pedido === 'Lunes' && l.Hora_Corte === '14:00' && l.Encargados === ''));
  assert.equal(rows(rt, 'CATALOGO').length, 0);
  assert.equal(rows(rt, 'PROVEEDORES').length, 0);

  // validaciones
  const cat = ss.getSheetByName('CATALOGO');
  const vUnidad = cat.getRange(2, 5).getDataValidation();
  assert.equal(vUnidad.getCriteriaType(), 'VALUE_IN_LIST');
  assert.ok(vUnidad.getCriteriaValues()[0].includes('kg') && vUnidad.getCriteriaValues()[0].includes('balde'));
  assert.equal(vUnidad.getAllowInvalid(), false);
  const vProv = cat.getRange(50, 6).getDataValidation();
  assert.equal(vProv.getCriteriaType(), 'VALUE_IN_RANGE');
  assert.equal(vProv.getAllowInvalid(), true, 'proveedor con aviso, no rechazo');
  assert.equal(cat.getRange(2, 3).getDataValidation().getCriteriaType(), 'VALUE_IN_RANGE');
  assert.deepEqual(cat.getRange(2, 11).getDataValidation().getCriteriaValues()[0], ['Activo', 'Inactivo']);
  assert.deepEqual(ss.getSheetByName('MOVIMIENTOS').getRange(2, 3).getDataValidation().getCriteriaValues()[0], ['CONTEO', 'RECEPCION', 'AJUSTE']);
  assert.deepEqual(ss.getSheetByName('COMPRAS').getRange(2, 6).getDataValidation().getCriteriaValues()[0], ['Enviada', 'Recibida parcial', 'Recibida', 'Cancelada']);
  assert.deepEqual(ss.getSheetByName('PEDIDO_LINEAS').getRange(2, 13).getDataValidation().getCriteriaValues()[0], ['Pendiente', 'Comprado', 'Entregado', 'Incompleto', 'Cancelado']);

  // TABLERO
  const tab = ss.getSheetByName('TABLERO');
  assert.equal(tab.getRange('B1').getValue(), 'Todos');
  assert.equal(tab.getRange('B1').getDataValidation().getCriteriaType(), 'VALUE_IN_RANGE');
  const formulas = ['A4', 'F4', 'K4', 'R4', 'W4'].map(a => tab.getRange(a).getFormula());
  formulas.forEach(f => { assert.match(f, /^=IFERROR\(QUERY\(/); assert.match(f, /\$B\$1/); });
  assert.match(formulas[0], /PEDIDO_LINEAS!A:R/);
  assert.match(formulas[0], /sum\(J\)/);
  assert.match(formulas[0], /M = 'Pendiente'/);
  assert.match(formulas[1], /M = 'Comprado'/);
  assert.match(formulas[2], /CATALOGO!A:L/);
  assert.match(formulas[2], /I < H/);
  assert.match(formulas[3], /TODAY\(\)-7/);
  assert.match(formulas[4], /M = 'Incompleto'/);
  assert.match(formulas[4], /TODAY\(\)-14/);

  // protecciones
  ['TABLERO', 'LOG'].forEach(n => {
    const p = ss.getSheetByName(n).getProtections('SHEET');
    assert.equal(p.length, 1);
    assert.equal(p[0].isWarningOnly(), true);
  });

  // idempotente
  const r2 = plain(rt.call('setupV3'));
  assert.deepEqual(r2.creadas, []);
  assert.deepEqual(r2.corregidas, []);
  assert.equal(r2.semilla, false);
  assert.deepEqual(ss.getSheets().map(s => s.getName()), ORDER);
  assert.equal(rows(rt, 'LOCALES').length, 9, 'la semilla no se duplica');
  Object.keys(HEADERS).forEach(name => assert.deepEqual(rt.sheet(name)[0], HEADERS[name]));
  ['TABLERO', 'LOG'].forEach(n => assert.equal(ss.getSheetByName(n).getProtections('SHEET').length, 1));
}

/* setupV3 corrige encabezados sin mover datos */
{
  const r = mk();
  const sh = r.spreadsheet.insertSheet('CATALOGO');
  sh.getRange(1, 1, 1, 3).setValues([['codigo', 'Producto', 'Mi columna']]);
  sh.getRange(2, 1, 1, 3).setValues([['X-1', 'Harina', 'nota']]);
  const res = plain(r.call('setupV3'));
  assert.deepEqual(res.corregidas, ['CATALOGO']);
  const v = r.sheet('CATALOGO');
  assert.deepEqual(v[0].slice(0, 3), ['Código', 'Producto', 'Mi columna']);
  assert.deepEqual(v[1].slice(0, 3), ['X-1', 'Harina', 'nota']);
  HEADERS.CATALOGO.forEach(h => assert.ok(v[0].includes(h), 'falta ' + h));
  assert.equal(v.length, 2, 'no se borran ni agregan filas');
  assert.deepEqual(r.spreadsheet.getSheets().map(s => s.getName()), ORDER);
}

/* script independiente: SHEET_ID */
{
  const r = mk({ SHEET_ID: 'abc123' }, { standalone: true });
  assert.equal(plain(r.call('setupV3')).ok, true);
  ok(get(r, 'getBootstrap'));
  const r2 = mk({}, { standalone: true });
  bad(get(r2, 'getBootstrap'), /SHEET_ID/);
}

/* ================= ping, bootstrap, JSONP ================= */
{
  const out = rt.doGet({ parameter: { action: 'ping', callback: 'cb_1' } });
  assert.match(out.mimeType, /javascript/);
  assert.match(out.text, /^cb_1\(\{.*\}\);$/);
  const pong = JSON.parse(out.text.slice(5, -2));
  assert.equal(pong.ok, true);
  assert.equal(pong.version, 'v3');
  assert.match(pong.hora, FECHA_RE);

  const malo = rt.doGet({ parameter: { action: 'ping', callback: 'alert(1)' } });
  assert.match(malo.mimeType, /json/);
  bad(JSON.parse(malo.text), /Callback inválido/);

  const sinCb = rt.doGet({ parameter: { action: 'ping' } });
  assert.match(sinCb.mimeType, /json/);
  ok(JSON.parse(sinCb.text));

  bad(get(rt, 'noExiste'), /desconocida/);
  bad(get(rt, 'savePedido'), /POST/);
  bad(JSON.parse(rt.doPost({ postData: { contents: '{roto' } }).text), /JSON/);

  const b = ok(get(rt, 'getBootstrap'));
  assert.equal(b.version, 'v3');
  assert.deepEqual(b.semana, plain(Docks.semana.de(new Date(Date.now() - 3 * 3600e3 + new Date().getTimezoneOffset() * 60e3))));
  assert.equal(b.locales.length, 9);
  assert.deepEqual(b.locales[0], { local: 'Umo Grill', activo: true, encargados: [], dia_pedido: 'Lunes', hora_corte: '14:00', prefijo: 'UMO' });
  assert.equal(b.locales[8].activo, false);
  assert.deepEqual(b.proveedores, []);
}

/* ================= admin ================= */
{
  ok(post(rt, { action: 'checkAdmin', admin_key: KEY }));
  bad(post(rt, { action: 'checkAdmin', admin_key: 'mala' }), /incorrecta/);
  bad(post(rt, { action: 'checkAdmin' }), /Falta la clave/);
  const sinClave = mk({ ADMIN_KEY: null });
  sinClave.call('setupV3');
  bad(post(sinClave, { action: 'checkAdmin', admin_key: 'x' }), /ADMIN_KEY/);
  bad(post(sinClave, { action: 'saveProveedor', admin_key: 'x', proveedor: 'P' }), /no está configurada/);
}

/* ================= proveedores ================= */
{
  const p = ok(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'Distribuidora Florida', contacto: 'Raúl', whatsapp: '+54 9 11 5555-0001', email: 'a@b.com', dias_entrega: 'Martes y viernes', pedido_minimo: '50000', activo: 'SÍ', observaciones: '' }));
  assert.deepEqual(p.proveedor, { proveedor: 'Distribuidora Florida', contacto: 'Raúl', whatsapp: '+54 9 11 5555-0001', email: 'a@b.com', dias_entrega: 'Martes y viernes', pedido_minimo: 50000, activo: true, observaciones: '' });
  ok(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'Verdulería Carlitos', whatsapp: '5491155550002', activo: 'SÍ' }));
  const ed = ok(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'VERDULERIA carlitos', contacto: 'Carlitos' }));
  assert.equal(ed.nuevo, false);
  assert.equal(ed.proveedor.whatsapp, '5491155550002', 'no borra campos no enviados');
  const provs = rows(rt, 'PROVEEDORES');
  assert.equal(provs.length, 2);
  assert.equal(provs[1].WhatsApp, '5491155550002', 'WhatsApp queda como texto');
  bad(post(rt, { action: 'saveProveedor', admin_key: 'mala', proveedor: 'X' }), /incorrecta/);
  bad(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: '' }), /Falta el nombre/);
  bad(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'Z', pedido_minimo: 'mucho' }), /Pedido mínimo inválido/);
  assert.equal(ok(get(rt, 'getBootstrap')).proveedores.length, 2);
}

/* ================= productos ================= */
{
  const a = ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'umo grill', producto: 'Asado', categoria: 'Carnes', unidad: 'kg', proveedor: 'distribuidora florida', precio: 8500, par: 10, estado: 'Activo' }));
  assert.equal(a.producto.codigo, 'UMO-001');
  assert.equal(a.producto.local, 'Umo Grill');
  assert.equal(a.producto.proveedor, 'Distribuidora Florida', 'proveedor canónico');
  assert.equal(a.producto.stock_actual, null);
  assert.equal(a.producto.motivo, 'SIN_CONTEO');
  const c = ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', producto: 'Chorizo', categoria: 'Carnes', unidad: 'kg', proveedor: 'Distribuidora Florida', precio: '6200', par: 8 }));
  assert.equal(c.producto.codigo, 'UMO-002');
  assert.equal(c.producto.precio, 6200);
  const t = ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Trento Café', producto: 'Tomate', categoria: 'Verduras', unidad: 'kg', proveedor: 'Verdulería Carlitos', precio: 1800, par: 6 }));
  assert.equal(t.producto.codigo, 'TRE-001');
  // edición por código: no toca stock
  const e = ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', codigo: 'umo-001', precio: 9000 }));
  assert.equal(e.producto.precio, 9000);
  assert.equal(e.producto.producto, 'Asado');
  assert.equal(rows(rt, 'CATALOGO').length, 3);
  bad(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', producto: 'asado', unidad: 'KG' }), /Ya existe Asado \(kg\).*UMO-001/);
  bad(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', producto: 'Sal', unidad: 'pizca' }), /Unidad inválida en Sal/);
  bad(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', producto: 'Sal', unidad: 'kg', precio: -1 }), /Precio inválido en Sal/);
  bad(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', codigo: 'TRE-001', producto: 'Tomate', unidad: 'kg' }), /ya está usado en Trento Café/);
  bad(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Narnia', producto: 'Sal', unidad: 'kg' }), /no existe/);
  bad(post(rt, { action: 'saveProducto', local: 'Umo Grill', producto: 'Sal', unidad: 'kg' }), /Falta la clave/);
  const conAviso = ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', producto: 'Hielo', unidad: 'bolsa', proveedor: 'Hielos Sur', par: 4 }));
  assert.match(conAviso.aviso, /Hielos Sur/);
  assert.equal(conAviso.producto.codigo, 'UMO-003');
}

/* ================= lote ================= */
{
  const r = ok(post(rt, {
    action: 'saveProductosLote', admin_key: KEY, local: 'Umo Grill', filas: [
      { producto: 'Tomate', categoria: 'Verduras', unidad: 'kg', proveedor: 'Verdulería Carlitos', precio: 1800, par: 6 },
      { producto: 'Lechuga', categoria: 'Verduras', unidad: 'atados', proveedor: 'Verdulería Carlitos', precio: 900, par: 10 },
      { producto: 'ASADO', categoria: 'Carnes premium', unidad: 'kg', proveedor: 'Distribuidora Florida', precio: 9100, par: 10 },
      { producto: 'Aceite', unidad: 'tonel', precio: 1 },
      { producto: '', unidad: 'kg' },
      { producto: 'Servilletas', categoria: 'Descartables', unidad: 'paquete', proveedor: '', precio: 2500, par: 6 },
      { producto: 'Sal', categoria: 'Almacén', unidad: 'kg', proveedor: '', precio: 500, par: '' },
      { producto: 'Lechuga', unidad: 'atado', par: 10 }
    ]
  }));
  assert.equal(r.creados, 4);
  assert.equal(r.actualizados, 2);
  assert.deepEqual(r.errores.map(x => x.fila), [4, 5]);
  assert.match(r.errores[0].error, /Unidad inválida en Aceite/);
  assert.match(r.errores[1].error, /Falta el nombre/);
  const cat = rows(rt, 'CATALOGO').filter(x => x.Local === 'Umo Grill');
  assert.deepEqual(cat.map(x => x['Código']), ['UMO-001', 'UMO-002', 'UMO-003', 'UMO-004', 'UMO-005', 'UMO-006', 'UMO-007']);
  const asado = cat.find(x => x.Producto === 'Asado');
  assert.equal(asado['Categoría'], 'Carnes premium');
  assert.equal(asado.Precio, 9100);
  assert.equal(cat.find(x => x.Producto === 'Lechuga').Unidad, 'atado');
  assert.ok(cat.every(x => x.Estado === 'Activo' && FECHA_RE.test(x.Actualizado)));
  bad(post(rt, { action: 'saveProductosLote', admin_key: KEY, local: 'Umo Grill', filas: [] }), /No hay filas/);
}

const prod = {};
rows(rt, 'CATALOGO').forEach(x => { prod[x.Local + '|' + x.Producto] = x['Código']; });

/* ================= pedidos ================= */
const PED_UMO = nid('PED');
const PED_TRE = nid('PED');
{
  const antes = rows(rt, 'PEDIDO_LINEAS').length;
  const r = ok(post(rt, {
    action: 'savePedido', id_pedido: PED_UMO, local: 'Umo Grill', encargado: 'Ana', prioridad: 'urgente', fecha_entrega: '2026-10-20', notas: 'Antes del mediodía',
    items: [
      { codigo: prod['Umo Grill|Asado'], cantidad: 12 },
      { codigo: prod['Umo Grill|Tomate'], cantidad: '5' },
      { codigo: prod['Umo Grill|Chorizo'], cantidad: 8 },
      { producto: 'Carbón', unidad: 'bolsa', cantidad: 3 }
    ]
  }));
  assert.equal(r.id_pedido, PED_UMO);
  assert.equal(r.lineas, 4);
  const lin = rows(rt, 'PEDIDO_LINEAS').filter(x => x.ID_Pedido === PED_UMO);
  assert.equal(lin.length, 4);
  assert.deepEqual(lin.map(x => x.ID_Linea), [1, 2, 3, 4].map(n => PED_UMO + '-' + n));
  assert.equal(lin[0].Proveedor, 'Distribuidora Florida');
  assert.equal(lin[0].Precio_Ref, 9100);
  assert.equal(lin[0].Unidad, 'kg');
  assert.equal(lin[0]['Categoría'], 'Carnes premium');
  assert.equal(lin[1].Cantidad, 5);
  assert.equal(lin[3]['Código'], '');
  assert.equal(lin[3].Proveedor, '');
  assert.equal(lin[3].Precio_Ref, '');
  assert.ok(lin.every(x => x.Estado === 'Pendiente' && x.Local === 'Umo Grill' && FECHA_RE.test(x.Fecha_Hora) && /^\d{4}-W\d{2}$/.test(x.Semana)));
  const ped = rows(rt, 'PEDIDOS').find(x => x.ID_Pedido === PED_UMO);
  assert.equal(ped.Prioridad, 'Urgente');
  assert.equal(ped.Lineas, 4);
  assert.equal(ped.Estado, 'Pendiente');
  assert.equal(ped.Fecha_Entrega, '2026-10-20');
  assert.equal(rows(rt, 'LOCALES')[0].Encargados, 'Ana');

  // idempotente
  const dup = ok(post(rt, { action: 'savePedido', id_pedido: PED_UMO, local: 'Umo Grill', encargado: 'Ana', items: [{ codigo: prod['Umo Grill|Asado'], cantidad: 99 }] }));
  assert.equal(dup.duplicado, true);
  assert.equal(dup.lineas, 4);
  assert.equal(rows(rt, 'PEDIDO_LINEAS').length, antes + 4);
  assert.equal(rows(rt, 'PEDIDOS').length, 1);

  // rechazos sin escribir nada
  const base = { action: 'savePedido', local: 'Umo Grill', encargado: 'Ana' };
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [{ codigo: prod['Trento Café|Tomate'], cantidad: 1 }] })), /no pertenece a Umo Grill/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [{ codigo: 'ZZZ-999', cantidad: 1 }] })), /no existe en el catálogo de Umo Grill/);
  [0, -2, 'Infinity', 'dos', '1e999', true].forEach(q => {
    bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [{ codigo: prod['Umo Grill|Tomate'], cantidad: q }] })), /Cantidad inválida en Tomate/);
  });
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [{ codigo: prod['Umo Grill|Tomate'], cantidad: '' }] })), /Falta la cantidad de Tomate/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [{ codigo: prod['Umo Grill|Tomate'] }] })), /Falta la cantidad de Tomate/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), local: 'Pizzería', items: [{ producto: 'Muzza', unidad: 'kg', cantidad: 1 }] })), /Pizzería está inactivo/);
  bad(post(rt, Object.assign({}, base, { id_pedido: 'PED-1', items: [{ producto: 'Muzza', unidad: 'kg', cantidad: 1 }] })), /Identificador de pedido inválido/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [] })), /no tiene productos/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), items: [{ producto: 'Muzza', unidad: 'pizca', cantidad: 1 }] })), /Unidad inválida en Muzza/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), encargado: '', items: [{ producto: 'Muzza', unidad: 'kg', cantidad: 1 }] })), /Falta el nombre/);
  bad(post(rt, Object.assign({}, base, { id_pedido: nid('PED'), prioridad: 'Ya', items: [{ producto: 'Muzza', unidad: 'kg', cantidad: 1 }] })), /Prioridad inválida/);
  assert.equal(rows(rt, 'PEDIDO_LINEAS').length, antes + 4, 'los rechazos no escriben');
  assert.equal(rows(rt, 'PEDIDOS').length, 1);
  assert.ok(rows(rt, 'LOG').some(x => x.Tipo === 'savePedido' && x.OK === 'NO'), 'los rechazos quedan en LOG');

  // Trento: Tomate kg + Tomate en caja (línea libre)
  ok(post(rt, {
    action: 'savePedido', id_pedido: PED_TRE, local: 'Trento Café', encargado: 'Beto', prioridad: 'Normal',
    items: [{ codigo: prod['Trento Café|Tomate'], cantidad: 4 }, { codigo: prod['Trento Café|Tomate'], cantidad: 6 }, { producto: 'Tomate', unidad: 'caja', cantidad: 2 }]
  }));
  const lt = rows(rt, 'PEDIDO_LINEAS').filter(x => x.ID_Pedido === PED_TRE);
  assert.equal(lt.length, 2, 'mismo código se suma en una línea');
  assert.equal(lt[0].Cantidad, 10);
  assert.equal(rows(rt, 'LOCALES')[1].Encargados, 'Beto');
  // encargado existente no se duplica
  ok(post(rt, { action: 'savePedido', id_pedido: nid('PED'), local: 'Trento Café', encargado: 'beto', items: [{ producto: 'Hielo', unidad: 'bolsa', cantidad: 1 }] }));
  assert.equal(rows(rt, 'LOCALES')[1].Encargados, 'Beto');
}

/* getPedido */
{
  const g = ok(get(rt, 'getPedido', { id: PED_UMO }));
  assert.equal(g.found, true);
  assert.equal(g.pedido.id_pedido, PED_UMO);
  assert.equal(g.pedido.local, 'Umo Grill');
  assert.equal(g.pedido.encargado, 'Ana');
  assert.equal(g.pedido.prioridad, 'Urgente');
  assert.equal(g.pedido.lineas, 4);
  assert.equal(g.pedido.estado, 'Pendiente');
  assert.equal(g.lineas.length, 4);
  assert.deepEqual(Object.keys(g.lineas[0]).slice(0, 8), ['id_linea', 'codigo', 'producto', 'unidad', 'cantidad', 'proveedor', 'estado', 'id_oc']);
  assert.equal(g.lineas[0].cantidad, 12);
  const n = ok(get(rt, 'getPedido', { id: 'PED-20260101-000000-zzzz' }));
  assert.equal(n.found, false);
}

/* ================= conteo y sugerido ================= */
const CNT1 = nid('CNT');
{
  const c0 = ok(get(rt, 'getCatalogo', { local: 'Umo Grill' }));
  const asado0 = c0.productos.find(p => p.producto === 'Asado');
  assert.equal(asado0.pedido_abierto, 12);
  assert.equal(asado0.sugerido, null);
  assert.equal(asado0.motivo, 'SIN_CONTEO');

  const r = ok(post(rt, {
    action: 'saveConteo', id_operacion: CNT1, local: 'Umo Grill', encargado: 'Ana', items: [
      { codigo: prod['Umo Grill|Asado'], cantidad: 3 },
      { codigo: prod['Umo Grill|Lechuga'], cantidad: '2,5' },
      { codigo: prod['Umo Grill|Tomate'], cantidad: 0.33 },
      { codigo: prod['Umo Grill|Servilletas'], cantidad: 0 },
      { codigo: prod['Umo Grill|Sal'], cantidad: 2 }
    ]
  }));
  assert.equal(r.items, 5);
  const movs = rows(rt, 'MOVIMIENTOS').filter(x => x.ID_Operacion === CNT1);
  assert.equal(movs.length, 5);
  assert.ok(movs.every(m => m.Tipo === 'CONTEO' && m.Saldo_Anterior === '' && m.Local === 'Umo Grill' && m.Encargado === 'Ana'));
  assert.deepEqual(movs.map(m => m.Saldo_Resultante), [3, 2.5, 0.33, 0, 2]);
  const cat = rows(rt, 'CATALOGO');
  const fila = n => cat.find(x => x.Local === 'Umo Grill' && x.Producto === n);
  assert.equal(fila('Servilletas').Stock_Actual, 0, 'cero es un valor válido');
  assert.match(fila('Asado').Ultimo_Conteo, FECHA_RE);

  // segundo conteo: saldo anterior
  const CNT2 = nid('CNT');
  ok(post(rt, { action: 'saveConteo', id_operacion: CNT2, local: 'Umo Grill', encargado: 'Ana', items: [{ codigo: prod['Umo Grill|Asado'], cantidad: 4 }] }));
  const m2 = rows(rt, 'MOVIMIENTOS').find(x => x.ID_Operacion === CNT2);
  assert.equal(m2.Saldo_Anterior, 3);
  assert.equal(m2.Saldo_Resultante, 4);
  assert.equal(m2.Cantidad, 4);
  // idempotente
  const dup = ok(post(rt, { action: 'saveConteo', id_operacion: CNT2, local: 'Umo Grill', encargado: 'Ana', items: [{ codigo: prod['Umo Grill|Asado'], cantidad: 50 }] }));
  assert.equal(dup.duplicado, true);
  assert.equal(rows(rt, 'CATALOGO').find(x => x['Código'] === prod['Umo Grill|Asado']).Stock_Actual, 4);
  // rechazos
  const b = { action: 'saveConteo', local: 'Umo Grill', encargado: 'Ana' };
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('CNT'), items: [{ codigo: prod['Umo Grill|Asado'], cantidad: '' }] })), /Falta la cantidad de Asado/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('CNT'), items: [{ codigo: prod['Umo Grill|Asado'], cantidad: null }] })), /Falta la cantidad de Asado/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('CNT'), items: [{ codigo: prod['Umo Grill|Asado'], cantidad: -1 }] })), /Cantidad inválida en Asado/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('CNT'), items: [{ codigo: prod['Trento Café|Tomate'], cantidad: 1 }] })), /no pertenece a Umo Grill/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('CNT'), items: [{ codigo: prod['Umo Grill|Asado'], cantidad: 1 }, { codigo: prod['Umo Grill|Asado'], cantidad: 2 }] })), /repetido/);
  bad(post(rt, Object.assign({}, b, { id_operacion: 'CNT-mal', items: [{ codigo: prod['Umo Grill|Asado'], cantidad: 1 }] })), /inválido/);

  // sugerido (§3.5) y comparación con core.js
  const c1 = ok(get(rt, 'getCatalogo', { local: 'Umo Grill' }));
  const P = n => c1.productos.find(p => p.producto === n);
  assert.deepEqual([P('Asado').sugerido, P('Asado').motivo], [0, 'OK'], 'par 10 - stock 4 - abierto 12');
  assert.equal(P('Lechuga').sugerido, 8, 'contable: 10 - 2,5 = 7,5 → 8');
  assert.equal(P('Tomate').pedido_abierto, 5);
  assert.equal(P('Tomate').sugerido, 0.7, 'kg: 6 - 0,33 - 5 = 0,67 → 0,7');
  assert.equal(P('Servilletas').sugerido, 6);
  assert.deepEqual([P('Sal').sugerido, P('Sal').motivo], [null, 'SIN_PAR']);
  assert.deepEqual([P('Chorizo').sugerido, P('Chorizo').motivo], [null, 'SIN_CONTEO']);
  assert.equal(P('Chorizo').stock_actual, null);
  assert.equal(P('Sal').par, null);
  c1.productos.forEach(p => {
    const s = Docks.sugerido(p);
    assert.deepEqual([p.sugerido, p.motivo], [s.cantidad, s.motivo], 'sugerido distinto de core.js en ' + p.producto);
  });
  assert.deepEqual(Object.keys(P('Asado')), ['codigo', 'producto', 'local', 'categoria', 'unidad', 'proveedor', 'precio', 'par', 'stock_actual', 'ultimo_conteo', 'estado', 'pedido_abierto', 'sugerido', 'motivo']);
  // sólo activos con local; todos sin local
  ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', codigo: prod['Umo Grill|Hielo'], estado: 'Inactivo' }));
  assert.ok(!ok(get(rt, 'getCatalogo', { local: 'Umo Grill' })).productos.some(p => p.producto === 'Hielo'));
  const todos = ok(get(rt, 'getCatalogo'));
  assert.ok(todos.productos.some(p => p.producto === 'Hielo' && p.estado === 'Inactivo'));
  assert.ok(todos.productos.some(p => p.local === 'Trento Café'));
  bad(post(rt, { action: 'savePedido', id_pedido: nid('PED'), local: 'Umo Grill', encargado: 'Ana', items: [{ codigo: prod['Umo Grill|Hielo'], cantidad: 1 }] }), /inactivo/);
}

/* ================= consolidado ================= */
{
  const c = ok(get(rt, 'getConsolidado'));
  const names = c.grupos.map(g => g.proveedor);
  assert.deepEqual(names, ['Distribuidora Florida', 'Verdulería Carlitos', '']);
  const flo = c.grupos[0];
  assert.equal(flo.whatsapp, '+54 9 11 5555-0001');
  assert.equal(flo.pedido_minimo, 50000);
  assert.equal(flo.total_estimado, 12 * 9100 + 8 * 6200);
  assert.deepEqual(flo.lineas.map(l => l.producto), ['Asado', 'Chorizo']);
  assert.equal(flo.lineas[0].prioridad, 'Urgente');
  assert.deepEqual(Object.keys(flo.lineas[0]), ['id_linea', 'id_pedido', 'fecha_hora', 'local', 'codigo', 'producto', 'unidad', 'cantidad', 'precio_ref', 'prioridad']);
  const verd = c.grupos[1];
  assert.deepEqual(verd.lineas.map(l => l.local + ' ' + l.cantidad), ['Trento Café 10', 'Umo Grill 5']);
  const sin = c.grupos[2];
  assert.deepEqual(sin.lineas.map(l => l.producto + ' ' + l.unidad).sort(), ['Carbón bolsa', 'Hielo bolsa', 'Tomate caja']);
  assert.equal(sin.whatsapp, '');
  const semana = ok(get(rt, 'getBootstrap')).semana.id;
  assert.equal(ok(get(rt, 'getConsolidado', { semana })).grupos.length, 3);
  assert.equal(ok(get(rt, 'getConsolidado', { semana: '2020-W01' })).grupos.length, 0);
}

/* ================= órdenes ================= */
const lineaDe = (idp, producto, unidad) => rows(rt, 'PEDIDO_LINEAS').find(x => x.ID_Pedido === idp && x.Producto === producto && (!unidad || x.Unidad === unidad)).ID_Linea;
const OC_FLO = nid('OC');
const OC_VER = nid('OC');
{
  const semana = ok(get(rt, 'getBootstrap')).semana;
  const idsFlo = [lineaDe(PED_UMO, 'Asado'), lineaDe(PED_UMO, 'Chorizo')];
  bad(post(rt, { action: 'crearOrden', admin_key: 'mala', id_oc: OC_FLO, id_lineas: idsFlo, proveedor: 'Distribuidora Florida', responsable: 'Gerencia' }), /incorrecta/);
  bad(post(rt, { action: 'crearOrden', id_oc: OC_FLO, id_lineas: idsFlo, proveedor: 'Distribuidora Florida', responsable: 'Gerencia' }), /Falta la clave/);
  bad(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: OC_FLO, id_lineas: idsFlo, proveedor: 'Verdulería Carlitos' }), /es de Distribuidora Florida/);
  const o = ok(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: OC_FLO, id_lineas: idsFlo, proveedor: 'Distribuidora Florida', responsable: 'Gerencia' }));
  assert.equal(o.id_oc, OC_FLO);
  assert.equal(o.lineas, 2);
  assert.equal(o.texto_whatsapp, [
    '*Pedido Docks del Puerto* · ' + OC_FLO,
    'Proveedor: Distribuidora Florida',
    semana.label,
    '',
    '• Asado — 12 kg',
    '• Chorizo — 8 kg',
    '',
    'Entrega por local:',
    'Umo Grill: Asado 12 kg, Chorizo 8 kg',
    '',
    'Gracias.'
  ].join('\n'));
  assert.equal(o.whatsapp_url, 'https://wa.me/5491155550001?text=' + encodeURIComponent(o.texto_whatsapp));
  const linF = rows(rt, 'PEDIDO_LINEAS').filter(x => idsFlo.includes(x.ID_Linea));
  assert.ok(linF.every(x => x.Estado === 'Comprado' && x.ID_OC === OC_FLO));
  const oc = rows(rt, 'COMPRAS').find(x => x.ID_OC === OC_FLO);
  assert.equal(oc.Estado, 'Enviada');
  assert.equal(oc.Locales, 'Umo Grill');
  assert.equal(oc.Lineas, 2);
  assert.equal(oc.Total_Estimado, 12 * 9100 + 8 * 6200);
  assert.equal(oc.Responsable, 'Gerencia');
  assert.equal(oc.Texto_WhatsApp, o.texto_whatsapp);
  assert.equal(oc.Semana, semana.id);
  // idempotente
  const dup = ok(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: OC_FLO, id_lineas: idsFlo, proveedor: 'Distribuidora Florida', responsable: 'Gerencia' }));
  assert.equal(dup.texto_whatsapp, o.texto_whatsapp);
  assert.equal(dup.whatsapp_url, o.whatsapp_url);
  assert.equal(rows(rt, 'COMPRAS').length, 1);
  // línea ya comprada
  bad(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: nid('OC'), id_lineas: [idsFlo[0]], proveedor: 'Distribuidora Florida' }), /no está pendiente/);

  // Verdulería: suma por producto+unidad, sin mezclar unidades; línea sin proveedor toma el indicado
  const idsVer = [lineaDe(PED_UMO, 'Tomate'), lineaDe(PED_UMO, 'Carbón'), lineaDe(PED_TRE, 'Tomate', 'kg'), lineaDe(PED_TRE, 'Tomate', 'caja')];
  const v = ok(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: OC_VER, id_lineas: idsVer, proveedor: 'verdulería carlitos', responsable: 'Gerencia' }));
  assert.equal(v.texto_whatsapp, [
    '*Pedido Docks del Puerto* · ' + OC_VER,
    'Proveedor: Verdulería Carlitos',
    semana.label,
    '',
    '• Carbón — 3 bolsa',
    '• Tomate — 2 caja',
    '• Tomate — 15 kg',
    '',
    'Entrega por local:',
    'Umo Grill: Carbón 3 bolsa, Tomate 5 kg',
    'Trento Café: Tomate 2 caja, Tomate 10 kg',
    '',
    'Gracias.'
  ].join('\n'));
  assert.equal(v.whatsapp_url, 'https://wa.me/5491155550002?text=' + encodeURIComponent(v.texto_whatsapp));
  const carbon = rows(rt, 'PEDIDO_LINEAS').find(x => x.ID_Linea === idsVer[1]);
  assert.equal(carbon.Proveedor, 'Verdulería Carlitos');
  assert.equal(rows(rt, 'COMPRAS').find(x => x.ID_OC === OC_VER).Locales, 'Umo Grill, Trento Café');
  // proveedor sin WhatsApp → wa.me/?text=
  ok(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'Hielos Sur', activo: 'SÍ' }));
  const OC_H = nid('OC');
  const hielo = rows(rt, 'PEDIDO_LINEAS').find(x => x.Producto === 'Hielo' && x.Estado === 'Pendiente').ID_Linea;
  const h = ok(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: OC_H, id_lineas: [hielo], proveedor: 'Hielos Sur' }));
  assert.ok(h.whatsapp_url.startsWith('https://wa.me/?text='));
  bad(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: nid('OC'), id_lineas: ['NO-EXISTE'], proveedor: 'Hielos Sur' }), /no existe/);

  // pedidos pasan a En compra
  assert.equal(ok(get(rt, 'getPedido', { id: PED_UMO })).pedido.estado, 'En compra');
  assert.equal(ok(get(rt, 'getPedido', { id: PED_TRE })).pedido.estado, 'En compra');

  const ords = ok(get(rt, 'getOrdenes'));
  assert.deepEqual(ords.ordenes.map(x => x.id_oc), [OC_H, OC_VER, OC_FLO], 'más recientes primero');
  assert.deepEqual(ords.ordenes[1].locales, ['Umo Grill', 'Trento Café']);
  assert.equal(ords.ordenes[1].whatsapp_url, v.whatsapp_url);
  assert.deepEqual(Object.keys(ords.ordenes[2]).filter(k => k !== 'responsable'), ['id_oc', 'fecha_hora', 'semana', 'proveedor', 'locales', 'estado', 'lineas', 'total_estimado', 'texto_whatsapp', 'whatsapp_url']);
  assert.equal(ok(get(rt, 'getOrdenes', { estado: 'Enviada' })).ordenes.length, 3);
  assert.equal(ok(get(rt, 'getOrdenes', { estado: 'Recibida' })).ordenes.length, 0);
  assert.equal(ok(get(rt, 'getConsolidado')).grupos.length, 0, 'ya no quedan pendientes');
}

/* ================= por recibir y hoy ================= */
{
  const u = ok(get(rt, 'getPorRecibir', { local: 'Umo Grill' }));
  assert.deepEqual(u.ordenes.map(o => o.id_oc), [OC_FLO, OC_VER]);
  assert.equal(u.ordenes[0].proveedor, 'Distribuidora Florida');
  assert.deepEqual(u.ordenes[0].lineas.map(l => l.producto), ['Asado', 'Chorizo']);
  assert.deepEqual(Object.keys(u.ordenes[0].lineas[0]), ['id_linea', 'id_pedido', 'codigo', 'producto', 'unidad', 'cantidad', 'precio_ref']);
  assert.deepEqual(u.ordenes[1].lineas.map(l => l.producto), ['Tomate', 'Carbón'], 'sólo líneas del local');
  const t = ok(get(rt, 'getPorRecibir', { local: 'Trento Café' }));
  assert.equal(t.ordenes.length, 2);
  const hoy = ok(get(rt, 'getHoy', { local: 'Umo Grill' }));
  assert.equal(hoy.semana.id, ok(get(rt, 'getBootstrap')).semana.id);
  assert.equal(hoy.pedido_semana.id_pedido, PED_UMO);
  assert.equal(hoy.pedido_semana.estado, 'En compra');
  assert.equal(hoy.pedido_semana.lineas, 4);
  assert.equal(hoy.pedidos_semana, 1);
  assert.equal(hoy.ultimo_conteo.productos, 1, 'último conteo: el segundo, con un producto');
  assert.equal(hoy.por_recibir, 2);
  assert.equal(hoy.bajo_par, 4, 'Asado 4<10, Lechuga 2,5<10, Tomate 0,33<6, Servilletas 0<6');
  assert.deepEqual(Object.keys(hoy.semana), ['id', 'label', 'inicio', 'fin']);
}
