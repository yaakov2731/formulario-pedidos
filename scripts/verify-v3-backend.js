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
  // Sin SHEET_ID usa la planilla V3 por defecto (V3_SHEET_ID_DEFAULT).
  const r2 = mk({}, { standalone: true });
  bad(get(r2, 'getBootstrap'), /1Jro4Ynb6n7otyaNsFWAi3QznYsWHuHf8EBPazY-_BpE/);
  const r3 = mk({}, { standalone: true, spreadsheetId: '1Jro4Ynb6n7otyaNsFWAi3QznYsWHuHf8EBPazY-_BpE' });
  bad(get(r3, 'getBootstrap'), /setupV3/);
  // instalarV3: crea pestañas y una sola clave de gerencia; no la pisa al repetir.
  r3.deleteProperty('ADMIN_KEY');
  r3.call('instalarV3');
  ok(get(r3, 'getBootstrap'));
  const clave = r3.getProperty('ADMIN_KEY');
  assert.match(clave, /^[0-9a-f]{10}$/);
  r3.call('instalarV3');
  assert.equal(r3.getProperty('ADMIN_KEY'), clave);
  assert.equal(JSON.parse(r3.doPost({ postData: { contents: JSON.stringify({ action: 'checkAdmin', admin_key: clave }) } }).text).ok, true);
}

/* fórmulas según configuración regional (es_AR usa ";") */
{
  const r = mk({});
  assert.equal(r.call('formulaConPuntoYComa_', '=IFERROR(QUERY(A:B,"select A, B label A \'x, y\'",1),"Sin datos, nada")'),
    '=IFERROR(QUERY(A:B;"select A, B label A \'x, y\'";1);"Sin datos, nada")');
  const escritas = [];
  const rango = (display) => ({ setFormula(f) { escritas.push(f); return this; }, getDisplayValue() { return display; } });
  r.call('setFormulaLocal_', rango('#ERROR!'), '=SUM(A1,B1)');
  assert.deepEqual(escritas, ['=SUM(A1,B1)', '=SUM(A1;B1)']);
  escritas.length = 0;
  r.call('setFormulaLocal_', rango('3'), '=SUM(A1,B1)');
  assert.deepEqual(escritas, ['=SUM(A1,B1)']);
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

/* ================= recepción ================= */
const PED_UMO2 = nid('PED');
const REC1 = nid('REC');
{
  ok(post(rt, { action: 'savePedido', id_pedido: PED_UMO2, local: 'Umo Grill', encargado: 'Carla', items: [{ codigo: prod['Umo Grill|Asado'], cantidad: 2 }, { codigo: prod['Umo Grill|Lechuga'], cantidad: 4 }] }));
  const lAsado = lineaDe(PED_UMO, 'Asado');
  const lChorizo = lineaDe(PED_UMO, 'Chorizo');
  const b = { action: 'saveRecepcion', local: 'Umo Grill', encargado: 'Ana' };
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: lineaDe(PED_TRE, 'Tomate', 'kg'), cantidad_recibida: 1 }] })), /es de Trento Café, no de Umo Grill/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: lineaDe(PED_UMO2, 'Asado'), cantidad_recibida: 1 }] })), /no está comprada \(estado: Pendiente\)/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: lAsado, cantidad_recibida: '' }] })), /Falta la cantidad de Asado/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: lAsado, cantidad_recibida: -3 }] })), /Cantidad inválida en Asado/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [] })), /no tiene productos/);
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: 'X-1', cantidad_recibida: 1 }] })), /no existe/);

  const r = ok(post(rt, Object.assign({}, b, {
    id_operacion: REC1, observaciones: 'Llegó tarde',
    items: [{ id_linea: lAsado, cantidad_recibida: 12 }, { id_linea: lChorizo, cantidad_recibida: '5' }],
    extras: [{ codigo: prod['Umo Grill|Lechuga'], cantidad: 1 }]
  })));
  assert.deepEqual([r.entregadas, r.incompletas, r.extras], [1, 1, 1]);
  const L = rows(rt, 'PEDIDO_LINEAS');
  const asado = L.find(x => x.ID_Linea === lAsado);
  const chorizo = L.find(x => x.ID_Linea === lChorizo);
  assert.equal(asado.Estado, 'Entregado');
  assert.equal(asado.Cantidad_Recibida, 12);
  assert.equal(asado.ID_Recepcion, REC1);
  assert.match(asado.Fecha_Recepcion, FECHA_RE);
  assert.equal(chorizo.Estado, 'Incompleto');
  assert.equal(chorizo.Cantidad_Recibida, 5);
  const movs = rows(rt, 'MOVIMIENTOS').filter(x => x.ID_Operacion === REC1);
  assert.equal(movs.length, 3);
  const mA = movs.find(m => m.Producto === 'Asado');
  assert.deepEqual([mA.Tipo, mA.Cantidad, mA.Saldo_Anterior, mA.Saldo_Resultante, mA.Referencia, mA.Costo_Unitario, mA.Observaciones], ['RECEPCION', 12, 4, 16, OC_FLO, 9100, 'Llegó tarde']);
  const mC = movs.find(m => m.Producto === 'Chorizo');
  assert.deepEqual([mC.Saldo_Anterior, mC.Saldo_Resultante], ['', ''], 'stock desconocido queda vacío');
  const mL = movs.find(m => m.Producto === 'Lechuga');
  assert.deepEqual([mL.Referencia, mL.Saldo_Anterior, mL.Saldo_Resultante], ['SIN PEDIDO', 2.5, 3.5]);
  const cat = rows(rt, 'CATALOGO');
  assert.equal(cat.find(x => x['Código'] === prod['Umo Grill|Asado']).Stock_Actual, 16);
  assert.equal(cat.find(x => x['Código'] === prod['Umo Grill|Chorizo']).Stock_Actual, '');
  assert.equal(cat.find(x => x['Código'] === prod['Umo Grill|Lechuga']).Stock_Actual, 3.5);
  assert.equal(rows(rt, 'COMPRAS').find(x => x.ID_OC === OC_FLO).Estado, 'Recibida parcial');
  // idempotente
  const dup = ok(post(rt, Object.assign({}, b, { id_operacion: REC1, items: [{ id_linea: lAsado, cantidad_recibida: 12 }] })));
  assert.equal(dup.duplicado, true);
  assert.deepEqual([dup.entregadas, dup.incompletas, dup.extras], [1, 1, 1]);
  assert.equal(rows(rt, 'CATALOGO').find(x => x['Código'] === prod['Umo Grill|Asado']).Stock_Actual, 16);
  assert.equal(rows(rt, 'MOVIMIENTOS').filter(x => x.ID_Operacion === REC1).length, 3);
  // línea ya entregada
  bad(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: lAsado, cantidad_recibida: 1 }] })), /no está comprada \(estado: Entregado\)/);

  // Verdulería: Umo recibe todo; la orden queda parcial hasta que recibe Trento
  ok(post(rt, Object.assign({}, b, { id_operacion: nid('REC'), items: [{ id_linea: lineaDe(PED_UMO, 'Tomate'), cantidad_recibida: 5 }, { id_linea: lineaDe(PED_UMO, 'Carbón'), cantidad_recibida: 4 }] })));
  assert.equal(rows(rt, 'COMPRAS').find(x => x.ID_OC === OC_VER).Estado, 'Recibida parcial');
  assert.equal(rows(rt, 'PEDIDOS').find(x => x.ID_Pedido === PED_UMO).Estado, 'Cerrado');
  const rt2 = ok(post(rt, { action: 'saveRecepcion', id_operacion: nid('REC'), local: 'Trento Café', encargado: 'Beto', items: [{ id_linea: lineaDe(PED_TRE, 'Tomate', 'kg'), cantidad_recibida: 10 }, { id_linea: lineaDe(PED_TRE, 'Tomate', 'caja'), cantidad_recibida: 2 }] }));
  assert.deepEqual([rt2.entregadas, rt2.incompletas, rt2.extras], [2, 0, 0]);
  assert.equal(rows(rt, 'COMPRAS').find(x => x.ID_OC === OC_VER).Estado, 'Recibida');
  assert.equal(rows(rt, 'CATALOGO').find(x => x['Código'] === prod['Trento Café|Tomate']).Stock_Actual, '', 'Trento sin conteo: sigue vacío');
  // cero recibido → Incompleto sin movimiento
  const hielo = rows(rt, 'PEDIDO_LINEAS').find(x => x.Producto === 'Hielo' && x.Estado === 'Comprado');
  const REC0 = nid('REC');
  const r0 = ok(post(rt, { action: 'saveRecepcion', id_operacion: REC0, local: 'Trento Café', encargado: 'Beto', items: [{ id_linea: hielo.ID_Linea, cantidad_recibida: 0 }] }));
  assert.deepEqual([r0.entregadas, r0.incompletas], [0, 1]);
  assert.equal(rows(rt, 'MOVIMIENTOS').filter(x => x.ID_Operacion === REC0).length, 0);
  assert.equal(ok(post(rt, { action: 'saveRecepcion', id_operacion: REC0, local: 'Trento Café', encargado: 'Beto', items: [{ id_linea: hielo.ID_Linea, cantidad_recibida: 0 }] })).duplicado, true);
  assert.equal(rows(rt, 'COMPRAS').find(x => x.ID_OC === hielo.ID_OC).Estado, 'Recibida parcial');
  assert.equal(ok(get(rt, 'getPorRecibir', { local: 'Umo Grill' })).ordenes.length, 0);
  assert.equal(ok(get(rt, 'getOrdenes', { estado: 'Recibida' })).ordenes.length, 1);

  // getOperacion
  const oc = ok(get(rt, 'getOperacion', { id: CNT1 }));
  assert.deepEqual([oc.found, oc.tipo, oc.local, oc.items], [true, 'CONTEO', 'Umo Grill', 5]);
  assert.match(oc.fecha_hora, FECHA_RE);
  const orc = ok(get(rt, 'getOperacion', { id: REC1 }));
  assert.deepEqual([orc.found, orc.tipo, orc.local, orc.items, orc.entregadas, orc.incompletas, orc.extras], [true, 'RECEPCION', 'Umo Grill', 3, 1, 1, 1]);
  const or0 = ok(get(rt, 'getOperacion', { id: REC0 }));
  assert.deepEqual([or0.tipo, or0.items, or0.local], ['RECEPCION', 1, 'Trento Café']);
  const ooc = ok(get(rt, 'getOperacion', { id: OC_FLO }));
  assert.deepEqual([ooc.found, ooc.tipo, ooc.local, ooc.items, ooc.proveedor], [true, 'OC', 'Umo Grill', 2, 'Distribuidora Florida']);
  assert.match(ooc.texto_whatsapp, /^\*Pedido Docks del Puerto\* · OC-/);
  assert.ok(ooc.whatsapp_url.startsWith('https://wa.me/5491155550001?text='));
  assert.equal(ok(get(rt, 'getOperacion', { id: 'REC-20200101-000000-zzzz' })).found, false);
  assert.equal(ok(get(rt, 'getOperacion', { id: PED_UMO })).items, 4);
}

/* ================= faltantes ================= */
{
  const f = ok(get(rt, 'getFaltantes'));
  assert.deepEqual(f.lineas.map(l => l.producto).sort(), ['Chorizo', 'Hielo']);
  const ch = f.lineas.find(l => l.producto === 'Chorizo');
  assert.deepEqual([ch.local, ch.proveedor, ch.unidad, ch.cantidad, ch.cantidad_recibida, ch.id_oc], ['Umo Grill', 'Distribuidora Florida', 'kg', 8, 5, OC_FLO]);
  assert.match(ch.fecha_recepcion, FECHA_RE);
  setCell(rt, 'PEDIDO_LINEAS', x => x.Producto === 'Chorizo' && x.Estado === 'Incompleto', 'Fecha_Recepcion', fmtFecha(rt, new Date(Date.now() - 30 * 864e5)));
  assert.deepEqual(ok(get(rt, 'getFaltantes')).lineas.map(l => l.producto), ['Hielo']);
  assert.equal(ok(get(rt, 'getFaltantes', { dias: '60' })).lineas.length, 2);
}

/* ================= cancelar ================= */
{
  const lA = lineaDe(PED_UMO2, 'Asado');
  const lL = lineaDe(PED_UMO2, 'Lechuga');
  bad(post(rt, { action: 'cancelarLineas', admin_key: 'mala', id_lineas: [lA], motivo: 'x' }), /incorrecta/);
  bad(post(rt, { action: 'cancelarLineas', admin_key: KEY, id_lineas: [lineaDe(PED_UMO, 'Asado')], motivo: 'x' }), /no se puede cancelar: está Entregado/);
  const c = ok(post(rt, { action: 'cancelarLineas', admin_key: KEY, id_lineas: [lA], motivo: 'Sobra stock' }));
  assert.equal(c.canceladas, 1);
  const la = rows(rt, 'PEDIDO_LINEAS').find(x => x.ID_Linea === lA);
  assert.equal(la.Estado, 'Cancelado');
  assert.match(la.Observaciones, /Sobra stock/);
  assert.equal(rows(rt, 'PEDIDOS').find(x => x.ID_Pedido === PED_UMO2).Estado, 'Pendiente');
  const again = ok(post(rt, { action: 'cancelarLineas', admin_key: KEY, id_lineas: [lA, lL], motivo: 'Cambio de menú' }));
  assert.deepEqual([again.canceladas, again.ya_canceladas], [1, 1]);
  assert.equal(rows(rt, 'PEDIDOS').find(x => x.ID_Pedido === PED_UMO2).Estado, 'Cerrado');
  // orden con todas las líneas canceladas → Cancelada
  const P3 = nid('PED');
  ok(post(rt, { action: 'savePedido', id_pedido: P3, local: 'Umo Grill', encargado: 'Ana', items: [{ codigo: prod['Umo Grill|Servilletas'], cantidad: 6 }] }));
  const lS = lineaDe(P3, 'Servilletas');
  assert.equal(ok(get(rt, 'getCatalogo', { local: 'Umo Grill' })).productos.find(p => p.producto === 'Servilletas').pedido_abierto, 6);
  const OC_S = nid('OC');
  ok(post(rt, { action: 'crearOrden', admin_key: KEY, id_oc: OC_S, id_lineas: [lS], proveedor: 'Distribuidora Florida', responsable: 'Gerencia' }));
  assert.equal(rows(rt, 'PEDIDOS').find(x => x.ID_Pedido === P3).Estado, 'En compra');
  ok(post(rt, { action: 'cancelarLineas', admin_key: KEY, id_lineas: [lS], motivo: 'Proveedor sin stock' }));
  assert.equal(rows(rt, 'COMPRAS').find(x => x.ID_OC === OC_S).Estado, 'Cancelada');
  assert.equal(rows(rt, 'PEDIDOS').find(x => x.ID_Pedido === P3).Estado, 'Cerrado');
  assert.equal(ok(get(rt, 'getCatalogo', { local: 'Umo Grill' })).productos.find(p => p.producto === 'Servilletas').pedido_abierto, 0);
}

/* ================= panel de stock ================= */
{
  setCell(rt, 'CATALOGO', x => x['Código'] === prod['Umo Grill|Asado'], 'Ultimo_Conteo', fmtFecha(rt, new Date(Date.now() - 10 * 864e5)));
  const p = ok(get(rt, 'getStockPanel', { local: 'Umo Grill' }));
  const E = n => p.filas.find(f => f.producto === n);
  assert.equal(E('Asado').estado, 'OK');
  assert.equal(E('Asado').dias_sin_contar, 10);
  assert.equal(E('Chorizo').estado, 'SIN_CONTEO');
  assert.equal(E('Chorizo').dias_sin_contar, null);
  assert.equal(E('Servilletas').estado, 'SIN_STOCK');
  assert.equal(E('Lechuga').estado, 'BAJO');
  assert.equal(E('Lechuga').dias_sin_contar, 0);
  assert.equal(E('Sal').estado, 'SIN_PAR');
  assert.equal(E('Tomate').estado, 'BAJO');
  assert.equal(E('Hielo'), undefined, 'inactivos fuera del panel');
  assert.deepEqual(Object.keys(E('Asado')), ['local', 'codigo', 'producto', 'categoria', 'unidad', 'proveedor', 'par', 'stock_actual', 'pedido_abierto', 'sugerido', 'ultimo_conteo', 'dias_sin_contar', 'estado']);
  const todos = ok(get(rt, 'getStockPanel'));
  assert.ok(todos.filas.some(f => f.local === 'Trento Café' && f.estado === 'SIN_CONTEO'));
  bad(get(rt, 'getStockPanel', { local: 'Narnia' }), /no existe/);
}

/* ================= locales ================= */
{
  const r = ok(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'umo grill', encargados: ['Ana', 'Carla', 'ana'], dia_pedido: 'martes', hora_corte: '9:30' }));
  assert.deepEqual(r.local, { local: 'Umo Grill', activo: true, encargados: ['Ana', 'Carla'], dia_pedido: 'Martes', hora_corte: '09:30', prefijo: 'UMO' });
  ok(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'Umo Grill', activo: false }));
  assert.equal(rows(rt, 'LOCALES')[0].Activo, 'NO');
  assert.equal(rows(rt, 'LOCALES')[0].Dia_Pedido, 'Martes', 'campo ausente no se toca');
  bad(post(rt, { action: 'savePedido', id_pedido: nid('PED'), local: 'Umo Grill', encargado: 'Ana', items: [{ producto: 'X', unidad: 'kg', cantidad: 1 }] }), /inactivo/);
  ok(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'Umo Grill', activo: 'si' }));
  assert.equal(rows(rt, 'LOCALES')[0].Activo, 'SÍ');
  ok(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'Umo Grill', dia_pedido: '' }));
  assert.equal(rows(rt, 'LOCALES')[0].Dia_Pedido, '', 'texto vacío vacía');
  bad(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'Umo Grill', dia_pedido: 'Feriado' }), /Día de pedido inválido/);
  bad(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'Umo Grill', hora_corte: '25:00' }), /Hora de corte inválida/);
  bad(post(rt, { action: 'saveLocal', admin_key: KEY, local: 'Narnia' }), /no existe/);
  // proveedor: activo como booleano y edición parcial con vacío
  ok(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'Hielos Sur', activo: false, observaciones: 'Sólo verano' }));
  let hs = rows(rt, 'PROVEEDORES').find(x => x.Proveedor === 'Hielos Sur');
  assert.deepEqual([hs.Activo, hs.Observaciones], ['NO', 'Sólo verano']);
  ok(post(rt, { action: 'saveProveedor', admin_key: KEY, proveedor: 'Hielos Sur', observaciones: '' }));
  hs = rows(rt, 'PROVEEDORES').find(x => x.Proveedor === 'Hielos Sur');
  assert.deepEqual([hs.Activo, hs.Observaciones], ['NO', '']);
  assert.equal(ok(get(rt, 'getBootstrap')).proveedores.find(x => x.proveedor === 'Hielos Sur').activo, false);
  // producto: edición parcial con vacío
  const pr = ok(post(rt, { action: 'saveProducto', admin_key: KEY, local: 'Umo Grill', codigo: prod['Umo Grill|Tomate'], par: '' }));
  assert.equal(pr.producto.par, null);
  assert.equal(pr.producto.precio, 1800, 'campo ausente no se toca');
  assert.equal(pr.producto.motivo, 'SIN_PAR');
}

/* ================= POST de lectura, lock ocupado ================= */
{
  ok(post(rt, { action: 'ping' }));
  rt.setLockBusy(true);
  bad(post(rt, { action: 'savePedido', id_pedido: nid('PED'), local: 'Trento Café', encargado: 'Beto', items: [{ producto: 'X', unidad: 'kg', cantidad: 1 }] }), /ocupada/);
  rt.setLockBusy(false);
  ok(get(rt, 'getBootstrap'));
}

/* ================= Telegram ================= */
{
  const r = mk({ TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '-100' });
  r.call('setupV3');
  r.setUrlFetchHandler(() => { throw new Error('sin red'); });
  const P = nid('PED');
  ok(post(r, { action: 'savePedido', id_pedido: P, local: 'Brooklyn', encargado: 'Dani', items: [{ producto: 'Pan', unidad: 'unidad', cantidad: 30 }] }));
  assert.equal(ok(get(r, 'getPedido', { id: P })).found, true);
  assert.equal(r.urlFetchCalls.length, 1);
  assert.equal(r.urlFetchCalls[0].url, 'https://api.telegram.org/bot123:abc/sendMessage');
  assert.match(JSON.parse(r.urlFetchCalls[0].params.payload).text, /Pedido nuevo · Brooklyn/);
  const lg = rows(r, 'LOG').filter(x => x.Tipo === 'TELEGRAM');
  assert.equal(lg.length, 1);
  assert.equal(lg[0].OK, 'NO');
  assert.match(lg[0].Detalle, /sin red/);
  r.setUrlFetchHandler(() => ({ code: 500, body: 'error' }));
  ok(post(r, { action: 'savePedido', id_pedido: nid('PED'), local: 'Brooklyn', encargado: 'Dani', items: [{ producto: 'Pan', unidad: 'unidad', cantidad: 30 }] }));
  assert.match(rows(r, 'LOG').filter(x => x.Tipo === 'TELEGRAM')[1].Detalle, /500/);
  r.setUrlFetchHandler(null);
  ok(post(r, { action: 'savePedido', id_pedido: nid('PED'), local: 'Brooklyn', encargado: 'Dani', items: [{ producto: 'Pan', unidad: 'unidad', cantidad: 30 }] }));
  assert.equal(rows(r, 'LOG').filter(x => x.Tipo === 'TELEGRAM').length, 2);
  assert.equal(r.urlFetchCalls.length, 3);
  assert.equal(rt.urlFetchCalls.length, 0, 'sin propiedades de Telegram no se llama a la red');
}

/* ================= volumen ================= */
{
  const r = mk();
  r.call('setupV3');
  const t0 = Date.now();
  const filas = Array.from({ length: 2000 }, (_, k) => ({ producto: 'Insumo ' + k, categoria: 'Cat ' + (k % 20), unidad: k % 2 ? 'kg' : 'unidad', proveedor: 'Prov ' + (k % 15), precio: 100 + k, par: 10 }));
  const lote = ok(post(r, { action: 'saveProductosLote', admin_key: KEY, local: 'Depósito', filas }));
  assert.equal(lote.creados, 2000);
  const codigos = rows(r, 'CATALOGO').map(x => x['Código']);
  assert.equal(codigos[1999], 'DEP-2000');
  for (let k = 0; k < 10; k++) {
    ok(post(r, { action: 'savePedido', id_pedido: nid('PED'), local: 'Depósito', encargado: 'Eva', items: codigos.slice(k * 150, k * 150 + 150).map(c => ({ codigo: c, cantidad: 2 })) }));
  }
  ok(post(r, { action: 'saveConteo', id_operacion: nid('CNT'), local: 'Depósito', encargado: 'Eva', items: codigos.slice(0, 500).map(c => ({ codigo: c, cantidad: 3 })) }));
  const t1 = Date.now();
  const cat = ok(get(r, 'getCatalogo', { local: 'Depósito' }));
  ok(get(r, 'getStockPanel'));
  ok(get(r, 'getConsolidado'));
  const t2 = Date.now();
  assert.equal(cat.productos.length, 2000);
  assert.equal(cat.productos[0].pedido_abierto, 2);
  assert.equal(cat.productos[0].sugerido, 5);
  assert.equal(rows(r, 'PEDIDO_LINEAS').length, 1500);
  assert.ok(t2 - t1 < 3000, 'lecturas con miles de filas demasiado lentas: ' + (t2 - t1) + ' ms');
  assert.ok(t1 - t0 < 15000, 'escrituras demasiado lentas: ' + (t1 - t0) + ' ms');
}

console.log('V3 backend verification passed.');
