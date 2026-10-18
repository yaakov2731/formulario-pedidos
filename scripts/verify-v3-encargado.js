// Verifica v3/encargado.js (lógica pura y envíos con API simulada) y la estructura de v3/index.html.
// Sin npm: node:vm + node:assert. Uso: node scripts/verify-v3-encargado.js
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function load() {
  const storage = new Map();
  const win = {
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    location: { href: 'http://localhost:8787/', search: '', hash: '' },
    navigator: { onLine: true },
    document: { getElementById: () => null },
    URL, URLSearchParams, setTimeout, clearTimeout, Promise
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(read('v3/core.js'), ctx, { filename: 'core.js' });
  vm.runInContext(read('v3/encargado.js'), ctx, { filename: 'encargado.js' });
  return { win, Docks: win.Docks, E: win.DocksEncargado, storage };
}

// Copia "plana" para comparar objetos creados dentro del contexto vm.
const plain = x => JSON.parse(JSON.stringify(x));

function fecha(diasAtras) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 10:00:00`;
}

const CATALOGO = [
  { codigo: 'UMO001', producto: 'Café en grano', categoria: 'Almacén', unidad: 'kg', proveedor: 'Distribuidora Florida', par: 10, stock_actual: 4, pedido_abierto: 0, sugerido: 6, motivo: 'OK' },
  { codigo: 'UMO002', producto: 'Tomate perita', categoria: 'Verdulería', unidad: 'kg', proveedor: 'Verdulería Ñandú', par: 20, stock_actual: 25, pedido_abierto: 0, sugerido: 0, motivo: 'OK' },
  { codigo: 'UMO003', producto: 'Leche entera', categoria: 'Lácteos', unidad: 'litro', proveedor: 'Distribuidora Florida', par: null, stock_actual: 3, pedido_abierto: 0, sugerido: null, motivo: 'SIN_PAR' },
  { codigo: 'UMO004', producto: 'Servilletas', categoria: '', unidad: 'paquete', proveedor: '', par: 5, stock_actual: 1, pedido_abierto: 0, sugerido: 4, motivo: 'OK' },
  { codigo: 'UMO005', producto: 'Azúcar', categoria: 'Almacén', unidad: 'kg', proveedor: 'Almacén Central', par: 8, stock_actual: null, pedido_abierto: 0, sugerido: null, motivo: 'SIN_CONTEO' }
];

(async () => {
  const { win, Docks, E, storage } = load();
  assert.ok(E, 'window.DocksEncargado expuesto');

  /* ---------- Hoy: acción principal ---------- */
  assert.equal(E.accionPrincipal({ ultimo_conteo: null, pedido_semana: null, por_recibir: 2 }).clave, 'contar');
  assert.equal(E.accionPrincipal({ ultimo_conteo: { fecha_hora: fecha(8) }, pedido_semana: { id_pedido: 'X' } }).clave, 'contar');
  assert.equal(E.accionPrincipal({ ultimo_conteo: { fecha_hora: fecha(7) }, pedido_semana: { id_pedido: 'X' } }).clave, 'contar');
  const pedir = E.accionPrincipal({ ultimo_conteo: { fecha_hora: fecha(2) }, pedido_semana: null, por_recibir: 3 });
  assert.equal(pedir.clave, 'pedir');
  assert.equal(pedir.texto, 'Hacer el pedido');
  assert.equal(pedir.hash, '#pedir');
  const recibir = E.accionPrincipal({ ultimo_conteo: { fecha_hora: fecha(0) }, pedido_semana: { id_pedido: 'PED-1', lineas: 4 }, por_recibir: 2 });
  assert.equal(recibir.clave, 'recibir');
  assert.equal(recibir.texto, 'Recibir mercadería');
  assert.match(recibir.motivo, /2 órdenes/);
  const alDia = E.accionPrincipal({ ultimo_conteo: { fecha_hora: fecha(1) }, pedido_semana: { id_pedido: 'PED-1' }, por_recibir: 0 });
  assert.equal(alDia.clave, 'al_dia');
  assert.equal(alDia.hash, null);
  assert.equal(E.accionPrincipal({ ultimo_conteo: { fecha_hora: fecha(6) }, pedido_semana: { id_pedido: 'P' } }).clave, 'al_dia');
  assert.equal(E.accionPrincipal(undefined).texto, 'Contar stock');
  assert.equal(E.textoHaceDias(null), 'Nunca');
  assert.equal(E.textoHaceDias(0), 'Hoy');
  assert.equal(E.textoHaceDias(1), 'Ayer');
  assert.equal(E.textoHaceDias(3), 'Hace 3 días');
  assert.equal(E.cantidadPorRecibir({ por_recibir: [{}, {}] }), 2);

  /* ---------- cantidades ---------- */
  assert.equal(E.pasoCantidad('kg'), 0.5);
  assert.equal(E.pasoCantidad('litro'), 0.5);
  assert.equal(E.pasoCantidad('caja'), 1);
  assert.equal(E.pasoCantidad('unidad'), 1);
  assert.equal(E.sumarPaso('', 'kg', 1), '0,5');
  assert.equal(E.sumarPaso('1,5', 'kg', 1), '2');
  assert.equal(E.sumarPaso('0,5', 'kg', -1), '');
  assert.equal(E.sumarPaso('', 'caja', -1), '');
  assert.equal(E.sumarPaso('2', 'caja', 1), '3');
  assert.equal(E.numTexto(1234.5), '1234,5');
  assert.equal(Docks.num.parse(E.numTexto(1234.5)), 1234.5);

  /* ---------- filtro ---------- */
  const nombres = l => l.map(p => p.codigo).join(',');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, 'cafe', '')), 'UMO001');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, '  CAFÉ   grano ', '')), 'UMO001');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, 'azucar', '')), 'UMO005');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, 'nandu', '')), 'UMO002', 'busca también por proveedor sin tildes');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, '', 'Almacén')), 'UMO001,UMO005');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, '', 'almacen')), 'UMO001,UMO005');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, 'cafe', 'Lácteos')), '');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, '', 'Sin categoría')), 'UMO004');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, '', E.CAT_SUGERIDOS)), 'UMO001,UMO004');
  assert.equal(nombres(E.filtrarProductos(CATALOGO, 'serv', E.CAT_SUGERIDOS)), 'UMO004');
  assert.equal(E.filtrarProductos(CATALOGO, '', '').length, CATALOGO.length);
  assert.deepEqual(plain(E.categorias(CATALOGO)), ['Almacén', 'Lácteos', 'Verdulería', 'Sin categoría']);
  // sin `sugerido` del servidor se calcula con Docks.sugerido
  assert.equal(E.sugeridoDe({ par: 10, stock_actual: 7.3, unidad: 'kg' }), 2.7);

  /* ---------- items del pedido ---------- */
  const bPed = {
    items: { UMO001: '6', UMO002: '', UMO003: '1,5', UMO004: '0', UMO005: 'abc', ZZZ999: '4' },
    libres: [
      { key: 'L1', producto: '  Hielo en bolsa ', unidad: 'bolsa', cantidad: '3' },
      { key: 'L2', producto: '', unidad: 'kg', cantidad: '2' },
      { key: 'L3', producto: 'Limones', unidad: 'kg', cantidad: '' }
    ],
    prioridad: 'Urgente', notas: ' llamar antes ', id: 'PED-20261018-143000-ab12'
  };
  const items = plain(E.armarItemsPedido(bPed, CATALOGO));
  assert.deepEqual(items.map(i => i.codigo || i.producto), ['UMO001', 'UMO003', 'Hielo en bolsa']);
  assert.equal(items[0].cantidad, 6);
  assert.equal(items[1].cantidad, 1.5);
  assert.equal(items[2].libre, true);
  assert.equal(items[2].proveedor, '');
  assert.deepEqual(plain(E.fueraDeCatalogo(bPed, CATALOGO)), ['ZZZ999']);
  assert.deepEqual(plain(E.armarItemsPedido({ items: {}, libres: [] }, CATALOGO)), []);
  const payload = plain(E.payloadPedido(bPed, E.armarItemsPedido(bPed, CATALOGO), { local: 'Umo Grill', encargado: 'Juan' }));
  assert.deepEqual(payload, {
    action: 'savePedido', id_pedido: 'PED-20261018-143000-ab12', local: 'Umo Grill', encargado: 'Juan',
    prioridad: 'Urgente', notas: 'llamar antes',
    items: [{ codigo: 'UMO001', cantidad: 6 }, { codigo: 'UMO003', cantidad: 1.5 }, { producto: 'Hielo en bolsa', unidad: 'bolsa', cantidad: 3 }]
  });
  assert.equal(E.payloadPedido({ prioridad: 'cualquiera', id: 'X' }, [], { local: 'A', encargado: 'B' }).prioridad, 'Normal');

  /* ---------- agrupado por proveedor ---------- */
  const grupos = plain(E.agruparPorProveedor([
    { codigo: 'A', producto: 'A', proveedor: 'Verdulería Ñandú', cantidad: 1 },
    { codigo: 'B', producto: 'B', proveedor: '', cantidad: 1 },
    { libre: true, producto: 'C', proveedor: 'Ignorado', cantidad: 1 },
    { codigo: 'D', producto: 'D', proveedor: 'Distribuidora Florida', cantidad: 1 },
    { codigo: 'E', producto: 'E', proveedor: 'distribuidora florida ', cantidad: 2 }
  ]));
  assert.deepEqual(grupos.map(g => g.proveedor), ['Distribuidora Florida', 'Verdulería Ñandú', E.SIN_PROVEEDOR]);
  assert.deepEqual(grupos[0].items.map(i => i.codigo), ['D', 'E']);
  assert.deepEqual(grupos[2].items.map(i => i.producto), ['B', 'C']);
  assert.equal(E.SIN_PROVEEDOR, 'Sin proveedor');

  /* ---------- conteo ---------- */
  const bCnt = { items: { UMO001: '4,5', UMO002: '', UMO003: '0', UMO004: '-1', UMO005: 'x', ZZZ: '3' } };
  assert.deepEqual(plain(E.itemsConteo(bCnt, CATALOGO)), [{ codigo: 'UMO001', cantidad: 4.5 }, { codigo: 'UMO003', cantidad: 0 }]);
  assert.deepEqual(plain(E.itemsConteo(bCnt)), [{ codigo: 'UMO001', cantidad: 4.5 }, { codigo: 'UMO003', cantidad: 0 }, { codigo: 'ZZZ', cantidad: 3 }]);
  assert.deepEqual(plain(E.conteoInvalidos(bCnt)).sort(), ['UMO004', 'UMO005']);
  assert.deepEqual(plain(E.itemsConteo({ items: {} }, CATALOGO)), []);

  /* ---------- recepción ---------- */
  const ORDENES = [
    { id_oc: 'OC-20261018-143000-ab12', proveedor: 'Distribuidora Florida', fecha_hora: '2026-10-18 14:30:00', lineas: [
      { id_linea: 'PED-1-1', id_pedido: 'PED-1', codigo: 'UMO001', producto: 'Café en grano', unidad: 'kg', cantidad: 12 },
      { id_linea: 'PED-1-2', id_pedido: 'PED-1', codigo: 'UMO003', producto: 'Leche entera', unidad: 'litro', cantidad: 6 },
      { id_linea: 'PED-1-3', id_pedido: 'PED-1', codigo: 'UMO004', producto: 'Servilletas', unidad: 'paquete', cantidad: 4 }
    ] }
  ];
  const estadoRec = {
    ordenes: ORDENES,
    marcas: { 'PED-1-1': { llego: true, cantidad: '10' }, 'PED-1-2': { llego: true }, 'PED-1-3': { llego: false, cantidad: '4' } },
    extras: [{ codigo: 'UMO002', producto: 'Tomate perita', unidad: 'kg', cantidad: '2,5' }, { codigo: 'UMO005', cantidad: '' }]
  };
  const rec = plain(E.itemsRecepcion(estadoRec));
  assert.deepEqual(rec.items, [{ id_linea: 'PED-1-1', cantidad_recibida: 10 }, { id_linea: 'PED-1-2', cantidad_recibida: 6 }]);
  assert.deepEqual(rec.extras, [{ codigo: 'UMO002', cantidad: 2.5 }]);
  assert.deepEqual(rec.errores, []);
  assert.deepEqual(plain(E.itemsRecepcion({ ordenes: ORDENES, marcas: { 'PED-1-1': { llego: true, cantidad: 'mucho' } } })).errores, ['PED-1-1']);
  assert.deepEqual(plain(E.itemsRecepcion({ ordenes: ORDENES, marcas: {} })).items, []);
  assert.equal(E.faltante(12, '10'), 2);
  assert.equal(E.faltante(12, '12'), 0);
  assert.equal(E.faltante(12, '13'), 0);
  assert.equal(E.faltante(1.5, '1,2'), 0.3);
  assert.equal(E.faltante(12, ''), null);
  assert.deepEqual(plain(E.resumenRecepcion(estadoRec)), { entregadas: 1, incompletas: 1, extras: 1 });
  const todo = E.llegoTodo({ marcas: {} }, ORDENES[0]);
  assert.deepEqual(plain(E.itemsRecepcion({ ordenes: ORDENES, marcas: todo.marcas })).items.map(i => i.cantidad_recibida), [12, 6, 4]);
  assert.equal(E.idCorto('OC-20261018-143000-ab12'), 'OC ab12');

  /* ---------- borradores por local ---------- */
  E.guardarBorrador('pedido', 'Umo Grill', { items: { UMO001: '2' }, libres: [], prioridad: 'Normal', notas: '', id: null });
  assert.deepEqual(plain(E.leerBorrador('pedido', 'Trento Café').items), {});
  assert.equal(E.leerBorrador('pedido', 'Umo Grill').items.UMO001, '2');
  E.guardarBorrador('conteo', 'Umo Grill', { items: { UMO001: '1' }, id: null });
  assert.deepEqual(plain(E.leerBorrador('conteo', 'Brooklyn').items), {});
  assert.deepEqual(plain(E.leerBorrador('pedido', 'Umo Grill').items), { UMO001: '2' }, 'pedido y conteo no se pisan');
  assert.notEqual(E.claveBorrador('pedido', 'Umo Grill'), E.claveBorrador('pedido', 'Trento Café'));
  assert.ok([...storage.keys()].every(k => k.startsWith('docksv3:')), 'todo pasa por Docks.store');
  E.borrarBorrador('pedido', 'Umo Grill');
  E.borrarBorrador('conteo', 'Umo Grill');
  const vacio = E.leerBorrador('recepcion', 'Umo Grill');
  assert.deepEqual(plain(vacio), { marcas: {}, extras: [], observaciones: '', id: null });

  /* ---------- id estable ---------- */
  const b = { id: null };
  const id1 = E.asegurarId(b, 'PED');
  assert.match(id1, /^PED-\d{8}-\d{6}-[a-z0-9]{4}$/);
  assert.equal(E.asegurarId(b, 'PED'), id1);

  /* ---------- envío de pedido: idempotente y confirmado ---------- */
  const sesion = { local: 'Umo Grill', encargado: 'Juan' };
  const posts = [];
  const confirms = [];
  const api = Docks.api;
  const borr = () => E.leerBorrador('pedido', 'Umo Grill');
  E.guardarBorrador('pedido', 'Umo Grill', { items: { UMO001: '6', UMO003: '2' }, libres: [], prioridad: 'Normal', notas: '', id: null });

  // 1) el servidor rechaza: se conserva el borrador con su id
  api.post = async p => { posts.push(JSON.parse(JSON.stringify(p))); const e = new Error('Local inactivo'); e.server = true; throw e; };
  let r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, false);
  assert.match(r.error, /Local inactivo/);
  assert.equal(borr().id, posts[0].id_pedido, 'el id queda guardado con el borrador');
  assert.equal(borr().items.UMO001, '6');

  // 2) respuesta ilegible y confirmación sin encontrarlo: falla, mismo id
  api.post = async p => { posts.push(JSON.parse(JSON.stringify(p))); return null; };
  api.confirm = async (action, id) => { confirms.push([action, id]); return null; };
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, false);
  assert.match(r.error, /No pudimos confirmar/);
  assert.equal(posts[1].id_pedido, posts[0].id_pedido, 'reintento con el mismo id');
  assert.deepEqual(confirms[0], ['getPedido', posts[0].id_pedido]);

  // 3) confirmación con otra cantidad de líneas: conflicto, no éxito
  api.confirm = async (action, id) => ({ ok: true, pedido: { id_pedido: id, local: 'Umo Grill', lineas: 5 }, lineas: [{}, {}, {}, {}, {}] });
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, false);
  assert.equal(r.conflicto, true);
  assert.ok(borr().items.UMO001, 'borrador conservado');

  // 4) confirmación de otro local: no es éxito
  api.confirm = async (action, id) => ({ ok: true, pedido: { id_pedido: id, local: 'Brooklyn', lineas: 2 }, lineas: [{}, {}] });
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, false);

  // 5) respuesta ilegible + confirmación correcta: éxito, mismo id, borrador limpio
  api.confirm = async (action, id) => ({ ok: true, pedido: { id_pedido: id, local: 'Umo Grill', lineas: 2 }, lineas: [{ id_linea: id + '-1' }, { id_linea: id + '-2' }] });
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, true);
  assert.equal(r.via, 'confirmacion');
  assert.equal(r.id, posts[0].id_pedido);
  assert.ok(posts.every(p => p.id_pedido === posts[0].id_pedido), 'todos los intentos con el mismo id');
  assert.equal(storage.has('docksv3:' + E.claveBorrador('pedido', 'Umo Grill')), false, 'borrador borrado tras el éxito');
  assert.deepEqual(posts[4].items, [{ codigo: 'UMO001', cantidad: 6 }, { codigo: 'UMO003', cantidad: 2 }]);

  // 6) respuesta legible con id: éxito directo; nuevo pedido => id nuevo
  E.guardarBorrador('pedido', 'Umo Grill', { items: { UMO004: '3' }, libres: [{ key: 'L', producto: 'Hielo', unidad: 'bolsa', cantidad: '2' }], prioridad: 'Normal', notas: '', id: null });
  api.post = async p => { posts.push(JSON.parse(JSON.stringify(p))); return { ok: true, id_pedido: p.id_pedido, lineas: 2 }; };
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, true);
  assert.equal(r.via, 'respuesta');
  assert.notEqual(posts[5].id_pedido, posts[0].id_pedido);
  assert.deepEqual(posts[5].items[1], { producto: 'Hielo', unidad: 'bolsa', cantidad: 2 });

  // 7) el borrador cambia durante el envío: se conserva sin id
  E.guardarBorrador('pedido', 'Umo Grill', { items: { UMO001: '1' }, libres: [], prioridad: 'Normal', notas: '', id: null });
  api.post = async p => {
    const x = E.leerBorrador('pedido', 'Umo Grill'); x.items.UMO002 = '5'; E.guardarBorrador('pedido', 'Umo Grill', x);
    return { ok: true, id_pedido: p.id_pedido, lineas: 1 };
  };
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, true);
  assert.equal(r.borradorConservado, true);
  assert.equal(borr().id, null);
  assert.equal(borr().items.UMO002, '5');
  E.borrarBorrador('pedido', 'Umo Grill');

  // pedido vacío no se envía
  posts.length = 0;
  r = await E.enviarPedido(sesion, CATALOGO);
  assert.equal(r.ok, false);
  assert.equal(posts.length, 0);

  /* ---------- envío de conteo ---------- */
  E.guardarBorrador('conteo', 'Umo Grill', { items: { UMO001: '3', UMO002: '', UMO003: '0' }, id: null });
  const cntPosts = [];
  api.post = async p => { cntPosts.push(JSON.parse(JSON.stringify(p))); return null; };
  api.confirm = async () => null;
  r = await E.enviarConteo(sesion, CATALOGO);
  assert.equal(r.ok, false);
  api.confirm = async (action, id) => { assert.equal(action, 'getOperacion'); return { ok: true, found: true, tipo: 'CONTEO', local: 'Umo Grill', items: [{}, {}] }; };
  r = await E.enviarConteo(sesion, CATALOGO);
  assert.equal(r.ok, true);
  assert.equal(cntPosts[0].id_operacion, cntPosts[1].id_operacion);
  assert.match(cntPosts[0].id_operacion, /^CNT-/);
  assert.equal(cntPosts[0].action, 'saveConteo');
  assert.deepEqual(cntPosts[0].items, [{ codigo: 'UMO001', cantidad: 3 }, { codigo: 'UMO003', cantidad: 0 }], 'vacío no se envía, cero sí');
  assert.equal(E.leerBorrador('conteo', 'Umo Grill').items.UMO001, undefined, 'borrador de conteo limpio');
  E.guardarBorrador('conteo', 'Umo Grill', { items: { UMO001: 'x' }, id: null });
  const antes = cntPosts.length;
  r = await E.enviarConteo(sesion, CATALOGO);
  assert.equal(r.ok, false);
  assert.equal(cntPosts.length, antes, 'cantidad inválida no se envía');
  E.borrarBorrador('conteo', 'Umo Grill');

  /* ---------- elaborados: lógica pura ---------- */
  const ELAB = [
    { codigo: 'UMO-E002', producto: 'Pollo deshuesado', categoria: 'Parrilla', unidad: 'unidad', listo: null, marcado: null, crudo: null, total: null, ultimo_conteo: '' },
    { codigo: 'UMO-E003', producto: 'Chimichurri', categoria: '', unidad: 'litro', listo: 1, marcado: 0, crudo: 0, total: 1, ultimo_conteo: fecha(1) },
    { codigo: 'UMO-E001', producto: 'Bondiola', categoria: 'Parrilla', unidad: 'unidad', listo: 3, marcado: 0, crudo: 5, total: 8, ultimo_conteo: fecha(0) }
  ];
  assert.deepEqual(plain(E.ESTADOS_ELAB.map(e => e[0])), ['listo', 'marcado', 'crudo']);
  assert.deepEqual(plain(E.ordenarElaborados(ELAB).map(p => p.codigo)), ['UMO-E001', 'UMO-E002', 'UMO-E003'], 'por grupo y nombre; sin grupo al final');
  assert.deepEqual(plain(E.leerBorrador('elab', 'Umo Grill')), { items: {}, id: null });
  const bElab = { items: {
    'UMO-E001': { listo: '3', crudo: '5' },          // marcado vacío = 0
    'UMO-E002': { listo: '', marcado: ' ' },          // nada escrito: no se cuenta
    'UMO-E003': { listo: '0' },                       // cero explícito sí
    'UMO-E009': { listo: '1' },                       // no está en la lista
    'UMO-E004': { listo: 'dos' }                      // inválido
  }, id: null };
  assert.deepEqual(plain(E.itemsElaborados(bElab, E.ordenarElaborados(ELAB))), [
    { codigo: 'UMO-E001', listo: 3, marcado: 0, crudo: 5 },
    { codigo: 'UMO-E003', listo: 0, marcado: 0, crudo: 0 }], 'en el orden de la lista');
  assert.deepEqual(plain(E.itemsElaborados(bElab, null)).map(i => i.codigo), ['UMO-E001', 'UMO-E003', 'UMO-E009']);
  assert.deepEqual(plain(E.elabInvalidos(bElab)), ['UMO-E004']);
  assert.deepEqual(plain(E.elabInvalidos({ items: { 'UMO-E001': { listo: '-1' } } })), ['UMO-E001']);
  assert.equal(E.totalElab({ listo: 1.5, marcado: 0, crudo: 2 }), 3.5);
  assert.equal(E.itemsElaborados({ items: { 'UMO-E001': { listo: '1,5' } } }, ELAB)[0].listo, 1.5, 'coma decimal');

  /* ---------- elaborados: envío ---------- */
  E.guardarBorrador('elab', 'Umo Grill', { items: { 'UMO-E001': { listo: '3', crudo: '5' }, 'UMO-E004': { listo: 'dos' } }, id: null });
  const elbPosts = [];
  api.post = async p => { elbPosts.push(JSON.parse(JSON.stringify(p))); return null; };
  r = await E.enviarElaborados(sesion, ELAB);
  assert.equal(r.ok, false, 'con una cantidad inválida no se envía');
  assert.equal(elbPosts.length, 0);
  E.guardarBorrador('elab', 'Umo Grill', { items: { 'UMO-E001': { listo: '3', crudo: '5' }, 'UMO-E003': { marcado: '0' } }, id: null });
  api.confirm = async () => null;
  const ELAB_ORD = E.ordenarElaborados(ELAB);
  r = await E.enviarElaborados(sesion, ELAB_ORD);
  assert.equal(r.ok, false, 'sin confirmación no se da por guardado');
  assert.equal(E.leerBorrador('elab', 'Umo Grill').id, elbPosts[0].id_conteo, 'el ID queda en el borrador para reintentar');
  api.confirm = async (action, id) => { assert.equal(action, 'getOperacion'); assert.equal(id, elbPosts[0].id_conteo); return { ok: true, found: true, tipo: 'ELABORADOS', local: 'Umo Grill', items: 2 }; };
  r = await E.enviarElaborados(sesion, ELAB_ORD);
  assert.equal(r.ok, true);
  assert.equal(r.items, 2);
  assert.equal(elbPosts[0].id_conteo, elbPosts[1].id_conteo, 'reintento con el mismo ID');
  assert.match(elbPosts[0].id_conteo, /^ELB-/);
  assert.deepEqual(elbPosts[0], {
    action: 'saveConteoElaborados', id_conteo: elbPosts[0].id_conteo, local: 'Umo Grill', encargado: 'Juan',
    items: [{ codigo: 'UMO-E001', listo: 3, marcado: 0, crudo: 5 }, { codigo: 'UMO-E003', listo: 0, marcado: 0, crudo: 0 }]
  });
  assert.deepEqual(plain(E.leerBorrador('elab', 'Umo Grill')), { items: {}, id: null }, 'borrador limpio al guardar');
  E.guardarBorrador('elab', 'Umo Grill', { items: { 'UMO-E001': { listo: '1' } }, id: null });
  api.post = async p => ({ ok: true, id_conteo: p.id_conteo, items: 5 });
  r = await E.enviarElaborados(sesion, ELAB);
  assert.equal(r.ok, false, 'la planilla ya tiene ese ID con otra cantidad: conflicto');
  assert.equal(r.conflicto, true);
  api.post = async p => ({ ok: true, id_conteo: p.id_conteo, items: 1 });
  r = await E.enviarElaborados(sesion, ELAB);
  assert.equal(r.ok, true);
  api.post = async () => null;
  r = await E.enviarElaborados(sesion, ELAB);
  assert.equal(r.ok, false, 'sin nada cargado no se guarda');
  assert.match(r.error, /No cargaste/);
  E.borrarBorrador('elab', 'Umo Grill');

  /* ---------- envío de recepción ---------- */
  E.guardarBorrador('recepcion', 'Umo Grill', { marcas: estadoRec.marcas, extras: estadoRec.extras, observaciones: ' tomate golpeado ', id: null });
  const recPosts = [];
  api.post = async p => { recPosts.push(JSON.parse(JSON.stringify(p))); return null; };
  api.confirm = async () => ({ ok: true, found: true, tipo: 'RECEPCION', local: 'Umo Grill', items: [] });
  r = await E.enviarRecepcion(sesion, ORDENES);
  assert.equal(r.ok, true);
  assert.deepEqual(recPosts[0], {
    action: 'saveRecepcion', id_operacion: recPosts[0].id_operacion, local: 'Umo Grill', encargado: 'Juan',
    items: [{ id_linea: 'PED-1-1', cantidad_recibida: 10 }, { id_linea: 'PED-1-2', cantidad_recibida: 6 }],
    extras: [{ codigo: 'UMO002', cantidad: 2.5 }], observaciones: 'tomate golpeado'
  });
  assert.match(recPosts[0].id_operacion, /^REC-/);
  assert.deepEqual(plain(r.resumen), { entregadas: 1, incompletas: 1, extras: 1 });
  E.guardarBorrador('recepcion', 'Umo Grill', { marcas: { 'PED-1-1': { llego: true, cantidad: '12' } }, extras: [], observaciones: '', id: null });
  api.post = async p => ({ ok: true, id_operacion: p.id_operacion, entregadas: 1, incompletas: 0, extras: 0 });
  r = await E.enviarRecepcion(sesion, ORDENES);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.resumen), { entregadas: 1, incompletas: 0, extras: 0 });
  r = await E.enviarRecepcion(sesion, ORDENES);
  assert.equal(r.ok, false, 'sin nada tildado no se guarda');

  /* ---------- sesión ---------- */
  const boot = { locales: [
    { local: 'Umo Grill', activo: 'SÍ', encargados: ['Juan', 'María'] },
    { local: 'Pizzería', activo: 'NO', encargados: [] },
    { local: 'Brooklyn', activo: true, encargados: 'Ana, Pedro' }
  ] };
  assert.deepEqual(plain(E.localesActivos(boot).map(l => l.local)), ['Umo Grill', 'Brooklyn']);
  assert.deepEqual(plain(E.encargadosDe(boot, 'Umo Grill', ['juan', 'Rocío'])), ['Juan', 'María', 'Rocío']);
  assert.deepEqual(plain(E.encargadosDe(boot, 'Brooklyn', [])), ['Ana', 'Pedro']);

  /* ---------- HTML y referencias ---------- */
  const html = read('v3/index.html');
  const js = read('v3/encargado.js');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="es">/);
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(html, /name="theme-color" content="#0E1A2B"/);
  assert.match(html, /<title>Pedidos · Docks del Puerto<\/title>/);
  assert.match(html, /rel="icon"[^>]*href="\.\.\/favicon\.svg"/);
  assert.ok(fs.existsSync(path.join(ROOT, 'favicon.svg')));
  const orden = ['fonts.googleapis.com/css2', 'href="base.css"', 'href="encargado.css"', 'src="config.js"', 'src="core.js"', 'src="encargado.js"'].map(s => html.indexOf(s));
  assert.ok(orden.every(i => i > -1), 'carga todos los recursos');
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'orden de carga');
  assert.match(html, /Public\+Sans:wght@400;500;600;700/);
  assert.match(html, /Familjen\+Grotesk:wght@600;700/);
  const srcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(srcs, ['config.js', 'core.js', 'encargado.js'], 'sin JS externo');
  [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map(m => m[1]).forEach(f => {
    assert.ok(fs.existsSync(path.join(ROOT, 'v3', f)), 'existe ' + f);
  });
  ['div', 'dialog', 'form', 'nav', 'header', 'main', 'a', 'button', 'p', 'span', 'svg'].forEach(t => {
    const abre = (html.match(new RegExp('<' + t + '[\\s>]', 'g')) || []).length;
    const cierra = (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
    assert.equal(abre, cierra, 'etiquetas <' + t + '> balanceadas');
  });
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos en index.html');
  [...html.matchAll(/\sfor="([^"]+)"/g)].forEach(m => assert.ok(ids.includes(m[1]), 'label for=' + m[1]));
  const usados = [...new Set([...js.matchAll(/byId\('([^']+)'\)/g)].map(m => m[1]))];
  const plantillas = [...js.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]);
  const prefijos = [...js.matchAll(/id="([A-Za-z0-9_-]+)' \+/g)].map(m => m[1]);
  usados.forEach(id => {
    const ok = ids.includes(id) || plantillas.includes(id) || prefijos.some(p => id.startsWith(p));
    assert.ok(ok, 'el id "' + id + '" que usa encargado.js existe');
  });
  assert.ok(['app', 'nav', 'barra', 'hdr-sesion', 'nav-badge', 'dlg-libre', 'dlg-extra', 'dlg-elab', 'form-elab'].every(i => ids.includes(i)));
  assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]), ['hoy', 'pedir', 'contar', 'elaborados', 'recibir'], 'cinco pestañas');
  assert.match(read('v3/encargado.css'), /\.enc-nav\{[^}]*repeat\(5,/, 'la navegación reparte cinco columnas');
  assert.doesNotMatch(js, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage/, 'todo pasa por Docks.api y Docks.store');
  assert.doesNotMatch(read('v3/encargado.css'), /#(?!fff\b)[0-9a-fA-F]{3,8}\b/, 'colores sólo con tokens (salvo #fff)');

  console.log('V3 encargado verification passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
