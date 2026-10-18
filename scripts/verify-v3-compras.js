// Verifica la lógica pura de v3/compras.js (window.DocksCompras) en memoria, sin navegador ni npm.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function load() {
  const storage = new Map();
  const listeners = [];
  const win = {
    localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { href: 'http://localhost:8787/compras.html', search: '', hash: '' },
    navigator: { onLine: true },
    document: { readyState: 'complete', getElementById: () => null, addEventListener: (t, f) => listeners.push([t, f]) },
    addEventListener: () => {},
    URL, URLSearchParams, setTimeout, clearTimeout, Intl
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(root, 'v3/core.js'), 'utf8'), ctx, { filename: 'core.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'v3/compras.js'), 'utf8'), ctx, { filename: 'compras.js' });
  return { C: win.DocksCompras, Docks: win.Docks, win, listeners };
}

const { C, Docks, listeners } = load();
assert.ok(C, 'compras.js expone window.DocksCompras');
assert.equal(listeners.length, 0, 'sin la página (sin #cx-app) no se engancha nada');
const sp = s => String(s).replace(/\s/g, ' ');
const plain = v => JSON.parse(JSON.stringify(v));

// ---------- formato de pesos ----------
assert.equal(sp(C.formatoPesos(1234567)), '$ 1.234.567');
assert.equal(sp(C.formatoPesos(1234.6)), '$ 1.235');
assert.equal(sp(C.formatoPesos(0)), '$ 0');
assert.equal(C.formatoPesos(null), '—');
assert.equal(C.formatoPesos(''), '—');

// ---------- agregado por producto + unidad ----------
const L = (id, local, producto, unidad, cantidad, precio_ref, prioridad = 'Normal') =>
  ({ id_linea: id, id_pedido: 'PED-20261018-100000-aaaa', fecha_hora: '2026-10-18 10:00:00', local, codigo: '', producto, unidad, cantidad, precio_ref, prioridad });
const lineas = [
  L('a1', 'Umo Grill', 'Asado', 'kg', 5, 8000),
  L('a2', 'Trento Café', 'Asado', 'kg', 10, 8000, 'Urgente'),
  L('a3', 'Umo Grill', 'asado ', 'KG', 1.5, 8000),
  L('a4', 'Umo Grill', 'Asado', 'unidad', 2, null),
  L('t1', 'Trento Café', 'Tomate', 'kg', 0.1, 1000),
  L('t2', 'Trento Café', 'Tomate', 'kg', 0.2, 1000)
];
const agg = C.agregarPorProducto(lineas);
assert.equal(agg.length, 3, 'Asado kg, Asado unidad y Tomate kg: no se mezclan unidades');
const asadoKg = agg.find(p => p.producto === 'Asado' && p.unidad === 'kg');
const asadoU = agg.find(p => p.unidad === 'unidad');
const tomate = agg.find(p => p.producto === 'Tomate');
assert.equal(asadoKg.total, 16.5);
assert.equal(asadoKg.detalle, 'Trento 10 · Umo 6,5');
assert.deepEqual(plain(asadoKg.locales), [{ local: 'Trento Café', cantidad: 10 }, { local: 'Umo Grill', cantidad: 6.5 }]);
assert.deepEqual(plain(asadoKg.id_lineas), ['a1', 'a2', 'a3']);
assert.equal(asadoKg.urgente, true);
assert.equal(asadoKg.precio_ref, 8000);
assert.equal(asadoKg.subtotal, 132000);
assert.equal(asadoU.total, 2);
assert.equal(asadoU.precio_ref, null);
assert.equal(asadoU.sin_precio, 1);
assert.equal(asadoU.urgente, false);
assert.equal(tomate.total, 0.3, 'suma sin errores de coma flotante');
assert.equal(tomate.detalle, 'Trento 0,3');
assert.deepEqual(plain(agg).map(p => p.producto + '/' + p.unidad), ['Asado/kg', 'Asado/unidad', 'Tomate/kg']);

// resumen por local: nombres cortos, y nombre completo si la primera palabra se repite
assert.equal(C.resumenLocales([L('x', 'Umo Grill', 'A', 'kg', 5), L('y', 'Trento Café', 'A', 'kg', 10)]), 'Trento 10 · Umo 5');
assert.equal(C.resumenLocales([L('x', 'Puerto Gelato', 'A', 'kg', 1), L('y', 'Puerto Norte', 'A', 'kg', 2)]), 'Puerto Gelato 1 · Puerto Norte 2');
assert.equal(C.resumenLocales([]), '');

// ---------- totales y pedido mínimo ----------
assert.equal(C.totalEstimado(lineas), 5 * 8000 + 10 * 8000 + 1.5 * 8000 + 0.3 * 1000);
assert.equal(C.totalEstimado([]), 0);
assert.equal(C.totalEstimado([L('z', 'Umo Grill', 'X', 'kg', null, 100)]), 0, 'sin cantidad no suma');
assert.equal(C.alcanzaMinimo({ pedido_minimo: null, lineas }), true);
assert.equal(C.alcanzaMinimo({ pedido_minimo: 0, lineas: [] }), true);
assert.equal(C.alcanzaMinimo({ pedido_minimo: 132300, lineas }), true, 'igual al mínimo alcanza');
assert.equal(C.alcanzaMinimo({ pedido_minimo: 132301, lineas }), false);
assert.equal(C.alcanzaMinimo({ pedido_minimo: 50000, total_estimado: 40000 }), false);
assert.equal(C.alcanzaMinimo({ pedido_minimo: '50.000', total_estimado: 60000 }), true);

// ---------- pegado desde Excel: productos ----------
let r = C.parsearPegado('Producto\tCategoría\tUnidad\tProveedor\tPrecio\tPar\r\n' +
  'Asado\tCarnes\tkg\tDistribuidora Florida\t8.500\t12\r\n' +
  'Tomate\tVerdulería\tKg\t\t1200,50\t5,5\r\n' +
  '\r\n' +
  'Servilletas\tDescartables\tcajas\t\t\t\r\n' +
  '\tBebidas\tbotella\t\t\t\r\n' +
  'Coca\tBebidas\tpack\t\t\t\r\n' +
  'Sal\tAlmacén\tkg\t\tabc\t-1\r\n' +
  'asado\tCarnes\tKG\t\t\t\r\n', 'productos');
assert.equal(r.encabezado, true);
assert.equal(r.filas.length, 7, 'el renglón vacío se ignora');
assert.deepEqual(plain(r.filas[0].datos), { producto: 'Asado', categoria: 'Carnes', unidad: 'kg', proveedor: 'Distribuidora Florida', precio: 8500, par: 12 });
assert.deepEqual(plain(r.filas[1].datos), { producto: 'Tomate', categoria: 'Verdulería', unidad: 'kg', proveedor: '', precio: 1200.5, par: 5.5 });
assert.equal(r.filas[2].datos.unidad, 'caja', 'plural aceptado');
assert.equal(r.filas[2].datos.precio, null, 'precio vacío queda null');
assert.equal(r.filas[2].fila, 5, 'el número de fila es el renglón pegado');
assert.match(r.filas[3].errores.join(), /Falta el producto/);
assert.match(r.filas[4].errores.join(), /Unidad no válida/);
assert.match(r.filas[5].errores.join(), /Precio no válido/);
assert.match(r.filas[5].errores.join(), /Par no válido/);
assert.match(r.filas[6].errores.join(), /Repetido \(igual que la fila 2\)/);
assert.equal(r.validas.length, 3);
assert.equal(r.conErrores, 4);

// sin encabezado, orden fijo
r = C.parsearPegado('Harina\tAlmacén\tkg\tMolino\t900\t25\nHuevos\tFrescos\tdocena\tGranja\t2500,5\t10', 'productos');
assert.equal(r.encabezado, false);
assert.equal(r.validas.length, 2);
assert.equal(r.validas[1].unidad, 'docena');
assert.equal(r.validas[1].precio, 2500.5);
assert.equal(r.filas[0].fila, 1);

// encabezado en otro orden y columnas faltantes
r = C.parsearPegado('Unidad\tProducto\tPar\nlitro\tLeche\t4,5\n', 'productos');
assert.equal(r.encabezado, true);
assert.deepEqual(plain(r.validas[0]), { producto: 'Leche', categoria: '', unidad: 'litro', proveedor: '', precio: null, par: 4.5 });

// unidad vacía, celdas entre comillas, texto vacío, sin tabulaciones
r = C.parsearPegado('"Queso, cremoso"\tLácteos\t\t\t\t', 'productos');
assert.equal(r.filas[0].datos.producto, 'Queso, cremoso');
assert.match(r.filas[0].errores.join(), /Falta la unidad/);
assert.equal(C.parsearPegado('', 'productos').filas.length, 0);
assert.equal(C.parsearPegado('   \n\t\t\n', 'productos').filas.length, 0);
assert.match(C.parsearPegado('Asado kg 12', 'productos').aviso, /tabulaciones/);

// montos
assert.equal(C.parsearMonto('$ 1.234'), 1234);
assert.equal(C.parsearMonto('1.234,50'), 1234.5);
assert.equal(C.parsearMonto('1,234.50'), 1234.5);
assert.equal(C.parsearMonto('12,5'), 12.5);
assert.equal(C.parsearMonto(''), null);
assert.equal(C.parsearMonto('doce'), null);
assert.equal(C.normalizarUnidad('Unidades'), 'unidad');
assert.equal(C.normalizarUnidad('LITROS'), 'litro');
assert.equal(C.normalizarUnidad('kgs'), 'kg');
assert.equal(C.normalizarUnidad('pack'), null);
assert.equal(C.normalizarUnidad(''), '');

// ---------- pegado desde Excel: proveedores ----------
r = C.parsearPegado('Proveedor\tContacto\tWhatsApp\tEmail\tDías de entrega\tPedido mínimo\n' +
  'Distribuidora Florida\tMarcela\t+54 9 11 1234-5678\tventas@florida.com\tmartes y viernes\t$ 50.000\n' +
  'Verdulería Sur\t\t1234\tmal-mail\t\tmucho\n' +
  '\tJuan\t\t\t\t\n' +
  'distribuidora florida\t\t\t\t\t\n', 'proveedores');
assert.equal(r.encabezado, true);
assert.deepEqual(plain(r.validas[0]), { proveedor: 'Distribuidora Florida', contacto: 'Marcela', whatsapp: '5491112345678', email: 'ventas@florida.com', dias_entrega: 'martes y viernes', pedido_minimo: 50000 });
assert.match(r.filas[1].errores.join(), /WhatsApp no válido/);
assert.match(r.filas[1].errores.join(), /Email no válido/);
assert.match(r.filas[1].errores.join(), /Pedido mínimo no válido/);
assert.match(r.filas[2].errores.join(), /Falta el nombre/);
assert.match(r.filas[3].errores.join(), /Repetido/);
assert.equal(r.validas.length, 1);
r = C.parsearPegado('Carnes del Delta\tPedro\t5491100000000', 'proveedores');
assert.equal(r.encabezado, false);
assert.equal(r.validas[0].whatsapp, '5491100000000');

// ---------- orden de stock por gravedad ----------
const stock = [
  { local: 'Umo Grill', producto: 'Tomate', estado: 'OK' },
  { local: 'Umo Grill', producto: 'Asado', estado: 'SIN_PAR' },
  { local: 'Trento Café', producto: 'Leche', estado: 'BAJO' },
  { local: 'Umo Grill', producto: 'Leche', estado: 'SIN_STOCK' },
  { local: 'Brooklyn', producto: 'Azúcar', estado: 'SIN_CONTEO' },
  { local: 'Umo Grill', producto: 'Aceite', estado: 'BAJO' },
  { local: 'Brooklyn', producto: 'Leche', estado: 'BAJO' }
];
const ord = C.ordenarStock(stock);
assert.deepEqual(plain(ord).map(f => f.estado + ':' + f.producto + ':' + f.local), [
  'SIN_STOCK:Leche:Umo Grill',
  'BAJO:Aceite:Umo Grill',
  'BAJO:Leche:Brooklyn',
  'BAJO:Leche:Trento Café',
  'SIN_CONTEO:Azúcar:Brooklyn',
  'SIN_PAR:Asado:Umo Grill',
  'OK:Tomate:Umo Grill'
]);
assert.equal(stock[0].estado, 'OK', 'no modifica el arreglo original');

// ---------- payload de crearOrden ----------
const desel = { a2: true };
const tildadas = C.lineasTildadas(lineas, desel);
assert.deepEqual(plain(tildadas).map(l => l.id_linea), ['a1', 'a3', 'a4', 't1', 't2']);
const intentos = {};
const datos = { clave: 'Distribuidora Florida', proveedor: 'Distribuidora Florida', id_lineas: tildadas.map(l => l.id_linea), responsable: ' Yaakov ', admin_key: 'k' };
const p1 = C.prepararOrden(intentos, datos);
assert.equal(p1.action, 'crearOrden');
assert.equal(p1.admin_key, 'k');
assert.equal(p1.proveedor, 'Distribuidora Florida');
assert.equal(p1.responsable, 'Yaakov');
assert.deepEqual(plain(p1.id_lineas), ['a1', 'a3', 'a4', 't1', 't2']);
assert.ok(!p1.id_lineas.includes('a2'), 'sólo líneas tildadas');
assert.match(p1.id_oc, /^OC-\d{8}-\d{6}-[a-z0-9]{4}$/);
const p2 = C.prepararOrden(intentos, { ...datos, id_lineas: ['t2', 't1', 'a4', 'a3', 'a1'] });
assert.equal(p2.id_oc, p1.id_oc, 'el reintento usa el mismo id_oc');
let otro = p1.id_oc;
for (let i = 0; i < 20 && otro === p1.id_oc; i++) {
  otro = C.prepararOrden({ ...intentos }, { ...datos, id_lineas: ['a1'] }).id_oc;
}
assert.notEqual(otro, p1.id_oc, 'si cambia la selección es otra orden');
C.cerrarIntento(intentos, datos.clave);
let nuevo = p1.id_oc;
for (let i = 0; i < 20 && nuevo === p1.id_oc; i++) {
  nuevo = C.prepararOrden({}, datos).id_oc;
}
assert.notEqual(nuevo, p1.id_oc, 'después de confirmar, la próxima orden tiene otro id');
assert.ok(!('Distribuidora Florida' in intentos));
assert.throws(() => C.prepararOrden({}, { ...datos, id_lineas: [] }), /Tildá al menos una línea/);
assert.throws(() => C.prepararOrden({}, { ...datos, proveedor: '' }), /proveedor/);
assert.throws(() => C.prepararOrden({}, { ...datos, responsable: '' }), /quién compra/);

// ---------- auxiliares ----------
assert.equal(C.idCorto('OC-20261018-143000-ab12'), 'OC-ab12');
assert.equal(C.idCorto('PED-20261018-143000-ab12-3'), 'PED-ab12');
assert.equal(C.idCorto('raro'), 'raro');
assert.equal(C.esActivo('SÍ'), true);
assert.equal(C.esActivo('NO'), false);
assert.equal(C.esActivo(true), true);
assert.equal(C.haceTexto(null), 'Nunca');
assert.equal(C.haceTexto(0), 'Hoy');
assert.equal(C.haceTexto(1), 'Hace 1 día');
assert.equal(C.haceTexto(9), 'Hace 9 días');
assert.deepEqual(plain(C.listaEncargados('Ana, Luis ;')), ['Ana', 'Luis']);
assert.equal(C.horaHHMM('9:30:00'), '09:30');
const reclamo = C.textoReclamo([{ proveedor: 'Florida', producto: 'Asado', unidad: 'kg', cantidad: 12, cantidad_recibida: 10, local: 'Umo Grill', id_oc: 'OC-20261018-143000-ab12' }]);
assert.match(reclamo, /\*Florida\*\n• Asado — pedido 12 kg, llegó 10 kg \(faltan 2 kg\) · Umo Grill · OC-ab12/);

// ---------- empezar de cero ----------
assert.equal(C.fraseReinicioOk('EMPEZAR DE CERO'), true);
assert.equal(C.fraseReinicioOk('  empezar de cero '), true);
assert.equal(C.fraseReinicioOk('empezar'), false);
assert.equal(C.fraseReinicioOk(''), false);
assert.deepEqual(plain(C.resumenReinicio({ pedidos: 3, lineas: 12, ordenes: 2, movimientos: 40, productos_sin_contar: 473 })), [
  '3 pedidos y 12 líneas borrados', '2 órdenes de compra borradas', '40 conteos y recepciones borrados', '473 productos quedan sin contar']);
assert.deepEqual(plain(C.resumenReinicio({ pedidos: 1, lineas: 1, ordenes: 1, movimientos: 1, productos_sin_contar: 1 })), [
  '1 pedido y 1 línea borrados', '1 orden de compra borrada', '1 conteo o recepción borrado', '1 producto queda sin contar']);

// ---------- página: orden de carga y archivos ----------
const html = fs.readFileSync(path.join(root, 'v3/compras.html'), 'utf8');
const orden = ['fonts.googleapis.com/css2', 'base.css', 'compras.css', 'config.js', 'core.js', 'compras.js'].map(s => html.indexOf(s));
assert.ok(orden.every(i => i > -1) && orden.every((v, i) => i === 0 || v > orden[i - 1]), 'compras.html carga en el orden del contrato');
assert.match(html, /<html lang="es">/);
assert.match(html, /<title>Compras · Docks del Puerto<\/title>/);
assert.match(html, /href="\.\.\/favicon\.svg"/);
assert.match(html, /<label for="cx-clave">Clave de administración<\/label>/);
assert.match(html, /id="cx-clave" class="input" type="password"/);
assert.match(html, /id="cx-reiniciar"[^>]*>Empezar de cero</);
assert.match(html, /<label for="dlg-reinicio-frase">/);
const js = fs.readFileSync(path.join(root, 'v3/compras.js'), 'utf8');
assert.ok(!/localStorage/.test(js), 'la clave no va a localStorage (y el resto usa Docks.store)');
assert.ok(!/<script[^>]+src="http/.test(html), 'sin JS externo');
const css = fs.readFileSync(path.join(root, 'v3/compras.css'), 'utf8');
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'compras.css usa sólo tokens (sin colores hex)');

console.log('V3 compras verification passed.');
