#!/usr/bin/env node
// Pedido sugerido (fase 4): prueba la cuenta de stock/js/sugerido.js sin navegador ni base.
//   Pedir = consumo diario (4 semanas) × (días hasta la entrega siguiente + 1) − quedan − pedido sin recibir, al bulto hacia arriba.
// Uso: node scripts/verify-sugerido.js
const path = require('path');
const { pathToFileURL } = require('url');

let fallas = 0;
const check = (n, ok, x) => { console.log((ok ? 'OK   ' : 'FAIL ') + n + (!ok && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!ok) fallas++; };

(async () => {
  const S = await import(pathToFileURL(path.join(__dirname, '..', 'stock/js/sugerido.js')).href);
  const U = await import(pathToFileURL(path.join(__dirname, '..', 'stock/js/util.js')).href);
  const LUNES = new Date(2026, 10, 9, 10, 0); // lunes 9/11/2026, 10 h
  const hoy = U.aISO(LUNES);
  const hace = (n, h = 15) => { const d = new Date(2026, 10, 9 - n, h, 0); return d.toISOString(); };
  const diaHace = (n) => U.sumarDias(hoy, -n);

  // Catálogo de prueba
  const PV = new Map([['pv-bar', { nombre: 'Barcena' }], ['pv-flo', { nombre: 'Distribuidora Florida' }], ['pv-rid', { nombre: 'Martín De Ridder' }]]);
  const P = {
    chorizo: { id: 'chorizo', nombre: 'Chorizo', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1, proveedor_id: 'pv-bar' },
    cerveza: { id: 'cerveza', nombre: 'Cerveza lata', unidad_compra: 'caja', unidad_uso: 'unidad', factor_conversion: 6, proveedor_id: 'pv-flo' },
    nuevo: { id: 'nuevo', nombre: 'Producto nuevo', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1, proveedor_id: 'pv-bar' },
    papel: { id: 'papel', nombre: 'Papel', unidad_compra: 'caja', unidad_uso: null, factor_conversion: 12, proveedor_id: 'pv-bar' },
    limon: { id: 'limon', nombre: 'Limones', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1, proveedor_id: 'pv-rid' },
    salsa: { id: 'salsa', nombre: 'Salsa de la casa', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1, proveedor_id: null, es_elaborado: true }
  };
  const prods = Object.values(P);

  // Salidas de stock: chorizo 2 kg por día las 4 semanas; cerveza 3 latas por día; el nuevo solo los últimos 5 días;
  // el papel 1 unidad por día (consumo en unidades sueltas aunque se compre por caja). Hoy no cuenta.
  const movs = [];
  for (let n = 1; n <= 28; n++) {
    movs.push({ producto_id: 'chorizo', tipo: n % 2 ? 'venta' : 'merma', cantidad: -2, creado_en: hace(n) });
    movs.push({ producto_id: 'cerveza', tipo: 'venta', cantidad: -3, creado_en: hace(n) });
    movs.push({ producto_id: 'papel', tipo: 'uso_dia', cantidad: -1, creado_en: hace(n) });
    movs.push({ producto_id: 'chorizo', tipo: 'recepcion', cantidad: 50, creado_en: hace(n) }); // no es consumo
  }
  for (let n = 1; n <= 5; n++) movs.push({ producto_id: 'nuevo', tipo: 'venta', cantidad: -10, creado_en: hace(n) });
  movs.push({ producto_id: 'chorizo', tipo: 'venta', cantidad: -100, creado_en: hace(0, 9) });  // hoy: no cuenta
  movs.push({ producto_id: 'chorizo', tipo: 'venta', cantidad: -100, creado_en: hace(40) });    // fuera de las 4 semanas
  // Hoja por sector: limones contados 15 días seguidos en Barra (apertura 5 + entró 2 − cierre 4 = 3 kg por día).
  const hoja = [];
  for (let n = 1; n <= 15; n++) {
    const f = diaHace(n);
    hoja.push({ fecha: f, sector: 'Barra', producto_id: 'limon', tipo: 'apertura', cantidad: 5 });
    hoja.push({ fecha: f, sector: 'Barra', producto_id: 'limon', tipo: 'entro', cantidad: 2 });
    hoja.push({ fecha: f, sector: 'Barra', producto_id: 'limon', tipo: 'cierre', cantidad: 4 });
  }
  hoja.push({ fecha: diaHace(16), sector: 'Cocina', producto_id: 'limon', tipo: 'apertura', cantidad: 50 }); // sin cierre: no cuenta

  const cons = S.consumoPorProducto({ movs, hoja, hoy });
  check('consumo: chorizo 56 kg en 28 días (ventas + merma, sin recepciones, sin hoy ni lo de hace 40 días)', cons.get('chorizo').mov.total === 56 && cons.get('chorizo').mov.dias === 28, cons.get('chorizo'));
  check('consumo: hoja de limones 3 kg por día en 15 días contados', cons.get('limon').hoja.total === 45 && cons.get('limon').hoja.dias === 15 && cons.get('limon').hoja.span === 15, cons.get('limon'));
  check('consumo diario: chorizo 2 kg', S.consumoDiario(cons.get('chorizo')) === 2);
  check('consumo diario: producto con 5 días de datos = sin historial (null)', S.consumoDiario(cons.get('nuevo')) === null);

  // Entregas: lunes → jueves; el pedido tiene que alcanzar hasta el jueves de la semana próxima (10 días).
  const e = S.entregaDe('Barcena', LUNES);
  check('entrega: lunes pide para el jueves y cubre hasta el jueves siguiente (10 días), "Cierra el miércoles"', e.esta === '2026-11-12' && e.siguiente === '2026-11-19' && e.dias === 10 && e.corte === 'Cierra el miércoles', e);
  check('entrega: De Ridder el miércoles a las 11 "Cierra hoy 12 h"; a las 13 pasa a la semana próxima', S.entregaDe('Martín De Ridder', new Date(2026, 10, 11, 11)).corte === 'Cierra hoy 12 h'
    && S.entregaDe('Martín De Ridder', new Date(2026, 10, 11, 13)).esta === '2026-11-19');
  check('entrega: Florida el viernes llega el sábado y cubre hasta el jueves (6 días)', (() => { const f = S.entregaDe('Distribuidora Florida', new Date(2026, 10, 13, 10)); return f.esta === '2026-11-14' && f.dias === 6 && /llega el sábado/.test(f.corte); })());
  check('entrega: el jueves los demás pasan a la semana próxima', S.entregaDe('Barcena', new Date(2026, 10, 12, 10)).corte === 'Para la semana próxima');

  const stock = new Map([['chorizo', 3], ['cerveza', 12], ['nuevo', 0], ['papel', 2], ['limon', 1]]);
  const sinPend = S.sugerencias({ prods, stock, cons, pend: new Map(), provs: PV, ahora: LUNES });
  // Caso 1 · con historial: 2 kg × (10 + 1) − 3 = 19 kg.
  check('caso 1 · con historial: Pedir 19 (2 kg/día × 11 días − quedan 3)', sinPend.get('chorizo') === 19, sinPend.get('chorizo'));
  // Caso 2 · sin historial: null (campo vacío, "Sin historial todavía").
  check('caso 2 · sin historial: sin número (null), aunque vendió 50 kg en 5 días', sinPend.get('nuevo') === null, sinPend.get('nuevo'));
  // Redondeo al bulto: cerveza 3 × 11 − 12 = 21 latas = 3,5 cajas de 6 → 4 cajas.
  check('redondeo al bulto: 21 latas en cajas de 6 → Pedir 4', sinPend.get('cerveza') === 4, sinPend.get('cerveza'));
  // Sin bulto cargado (sin unidad de uso): no se inventa la caja de 12, se redondea a la unidad: 1 × 11 − 2 = 9.
  check('sin bulto cargado: redondea a la unidad (9), no usa un factor sin unidad de uso', sinPend.get('papel') === 9, sinPend.get('papel'));
  check('hoja por sector: limones 3 × 11 − 1 = 32 kg', sinPend.get('limon') === 32, sinPend.get('limon'));
  check('elaborados: no se sugieren', !sinPend.has('salsa'));

  // Caso 3 · con pedido sin recibir.
  const ordenes = [
    { estado: 'enviada', creado_en: hace(3), orden_items: [{ producto_id: 'cerveza', cantidad_pedida: 2, cantidad_recibida: null }, { producto_id: 'chorizo', cantidad_pedida: 10 }] },
    { estado: 'parcial', creado_en: hace(5), orden_items: [{ producto_id: 'chorizo', cantidad_pedida: 6, cantidad_recibida: 4 }, { producto_id: 'limon', cantidad_pedida: 9, cantidad_recibida: 0, no_vino: true }] },
    { estado: 'borrador', creado_en: hace(1), orden_items: [{ producto_id: 'papel', cantidad_pedida: 1, excluido: true }] },
    { estado: 'recibida', creado_en: hace(4), orden_items: [{ producto_id: 'chorizo', cantidad_pedida: 30, cantidad_recibida: 30 }] },
    { estado: 'cancelada', creado_en: hace(2), orden_items: [{ producto_id: 'chorizo', cantidad_pedida: 30 }] },
    { estado: 'enviada', creado_en: hace(30), orden_items: [{ producto_id: 'chorizo', cantidad_pedida: 30 }] }
  ];
  const pend = S.pendientePorProducto(ordenes, hoy);
  check('pendiente: chorizo 10 + (6 − 4) = 12; sin recibidas, canceladas, viejas, excluidas ni lo que no vino', pend.get('chorizo') === 12 && pend.get('cerveza') === 2 && !pend.has('limon') && !pend.has('papel'), [...pend]);
  const conPend = S.sugerencias({ prods, stock, cons, pend, provs: PV, ahora: LUNES });
  check('caso 3 · con pedido sin recibir: chorizo 19 − 12 = Pedir 7', conPend.get('chorizo') === 7, conPend.get('chorizo'));
  check('caso 3 · con pedido sin recibir en bultos: cerveza 21 − 2 cajas × 6 = 9 latas → Pedir 2 cajas', conPend.get('cerveza') === 2, conPend.get('cerveza'));
  check('lo que alcanza: con 40 kg en stock el sugerido es 0', S.pedirSugerido({ diario: 2, dias: 10, quedan: 40 }) === 0);
  check('stock negativo no suma al pedido (cuenta como 0)', S.pedirSugerido({ diario: 2, dias: 10, quedan: -5 }) === 22);
  check('redondeo exacto: 12 latas justas en cajas de 6 → 2 (sin pasarse por decimales)', S.pedirSugerido({ diario: 1.2, dias: 9, quedan: 0, factor: 6 }) === 2);

  console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
