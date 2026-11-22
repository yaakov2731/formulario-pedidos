#!/usr/bin/env node
// Reposición por días que abre el local (stock/js/reposicion.js y feriados.js): prueba la cuenta sin navegador ni base.
// Uso: node scripts/verify-reposicion.js
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let fallas = 0;
const check = (n, ok, x) => { console.log((ok ? 'OK   ' : 'FAIL ') + n + (!ok && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!ok) fallas++; };
const js = (f) => pathToFileURL(path.join(__dirname, '..', 'stock/js', f)).href;

(async () => {
  const R = await import(js('reposicion.js'));
  const F = await import(js('feriados.js'));
  const S = await import(js('sugerido.js'));
  const U = await import(js('util.js'));
  const VSD = { dias_abre: [5, 6, 0], abre_feriados: true };

  // ---- Días que abre ----
  check('sin días cargados usa vie · sáb · dom', JSON.stringify(R.diasDe(null)) === '[5,6,0]' && JSON.stringify(R.diasDe({})) === '[5,6,0]');
  check('domingo 8/11 → próxima apertura viernes 13/11 (en 5 días)', JSON.stringify(R.proximaApertura('2026-11-08', VSD)) === JSON.stringify({ fecha: '2026-11-13', dias: 5 }), R.proximaApertura('2026-11-08', VSD));
  check('el 23/11/2026 es feriado (Soberanía, trasladado al lunes)', F.esFeriado('2026-11-23') && !F.esFeriado('2026-11-20'));
  check('domingo 22/11 con el lunes feriado → abre mañana', JSON.stringify(R.proximaApertura('2026-11-22', VSD)) === JSON.stringify({ fecha: '2026-11-23', dias: 1 }), R.proximaApertura('2026-11-22', VSD));
  check('con abre_feriados = false el feriado no cuenta → viernes 27/11', R.proximaApertura('2026-11-22', { dias_abre: [5, 6, 0], abre_feriados: false }).fecha === '2026-11-27');
  check('local que abre todos los días → mañana', R.proximaApertura('2026-11-10', { dias_abre: [0, 1, 2, 3, 4, 5, 6] }).dias === 1);
  check('sin ningún día → null', R.proximaApertura('2026-11-10', { dias_abre: [], abre_feriados: false }) === null);
  check('días abiertos de la semana desde el viernes 13/11: 3', R.diasAbiertos('2026-11-13', 7, VSD) === 3);
  check('desde el viernes 20/11 con el lunes 23 feriado: 4', R.diasAbiertos('2026-11-20', 7, VSD) === 4);
  check('último día abierto antes del lunes 9/11: domingo 8/11', R.ultimaApertura('2026-11-09', VSD) === '2026-11-08');
  check('próximos feriados desde el 22/11/2026', F.proximosFeriados('2026-11-22', 3).map(x => x.fecha).join(',') === '2026-11-23,2026-12-07,2026-12-08');

  // ---- Uso por día abierto ----
  const hoy = '2026-11-09';
  const movs = [];
  for (let i = 1; i <= 28; i++) { const f = U.sumarDias(hoy, -i); if (R.abreEl(f, VSD)) movs.push({ producto_id: 'coca', tipo: 'venta', cantidad: -4, creado_en: f }); }
  const cons = S.consumoPorProducto({ movs, hoy });
  check('consumoPorProducto guarda desde (primer día con salida)', cons.get('coca').mov.desde === movs[movs.length - 1].creado_en, cons.get('coca').mov);
  const uso = R.usoPorDiaAbierto(cons.get('coca'), { hoy, local: VSD });
  check('vende 4 por día abierto → uso 4 (no 4 × 3 ÷ 7)', Math.abs(uso - 4) < 1e-9, uso);
  check('sin historial suficiente (10 días) → null', R.usoPorDiaAbierto({ mov: { total: 20, dias: 10, desde: U.sumarDias(hoy, -10) }, hoja: null }, { hoy, local: VSD }) === null);
  check('hoja: total ÷ días contados', R.usoPorDiaAbierto({ mov: null, hoja: { total: 24, dias: 8, span: 20 } }, { hoy, local: VSD }) === 3);
  check('hoja con pocos días contados → null', R.usoPorDiaAbierto({ mov: null, hoja: { total: 24, dias: 4, span: 20 } }, { hoy, local: VSD }) === null);

  // ---- Estado y pedido ----
  const est = (q) => R.estadoProducto({ quedan: q, uso: 4, diasSemana: 3 }).c;
  check('no alcanza para abrir → rojo; alcanza para abrir pero no la semana → amarillo; alcanza → verde', est(3) === 'rojo' && est(4) === 'amar' && est(11) === 'amar' && est(12) === 'verde', [est(3), est(4), est(11), est(12)]);
  check('sin historial → gris', R.estadoProducto({ quedan: 3, uso: null, diasSemana: 3 }).c === 'gris');
  check('alcanza para 2 días', R.textoAlcanza(R.estadoProducto({ quedan: 9, uso: 4, diasSemana: 3 }).dias) === '2 días' && R.textoAlcanza(0.5) === '< 1 día' && R.textoAlcanza(null) === '—');
  check('pedir en unidades: 4 × 3 − 5 = 7', R.pedir({ uso: 4, diasSemana: 3, quedan: 5 }) === 7);
  check('redondeo al bulto: (12 − 5) ÷ 6 → 2 cajas', R.pedir({ uso: 4, diasSemana: 3, quedan: 5, factor: 6 }) === 2);
  check('lo pedido sin recibir se descuenta: 1 caja pendiente → 1', R.pedir({ uso: 4, diasSemana: 3, quedan: 5, factor: 6, pendiente: 1 }) === 1);
  check('2 cajas pendientes → 0', R.pedir({ uso: 4, diasSemana: 3, quedan: 5, factor: 6, pendiente: 2 }) === 0);
  check('sin historial → null (nunca un número inventado)', R.pedir({ uso: null, diasSemana: 3, quedan: 0 }) === null);
  check('alcanza → 0', R.pedir({ uso: 4, diasSemana: 3, quedan: 20 }) === 0);

  // ---- Plan del local ----
  const prods = [
    { id: 'coca', nombre: 'Coca-Cola', unidad_compra: 'caja', unidad_uso: 'unidad', factor_conversion: 6 },
    { id: 'nuevo', nombre: 'Nuevo', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1 },
    { id: 'salsa', nombre: 'Salsa', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1, es_elaborado: true },
    { id: 'bife', nombre: 'Bife', categoria: 'Carta' }
  ];
  const plan = R.planLocal({ prods, quedan: new Map([['coca', 5]]), cons, pend: new Map(), local: VSD, hoy });
  check('plan: próxima apertura y días de la semana', plan.prox.fecha === '2026-11-13' && plan.diasSemana === 3, plan.prox);
  check('plan: coca 5 unidades con uso 4 → amarillo y 2 cajas', plan.items.get('coca').c === 'amar' && plan.items.get('coca').pedir === 2, plan.items.get('coca'));
  check('plan: sin historial → gris y pedir null', plan.items.get('nuevo').c === 'gris' && plan.items.get('nuevo').pedir === null);
  check('plan: elaborados y carta no se compran', !plan.items.has('salsa') && !plan.items.has('bife'));

  // ---- Apertura precargada y cierres ----
  const ap = R.aperturaSugerida(new Map([['coca', 5], ['papa', 2]]), [{ producto_id: 'coca', cantidad: 12 }, { producto_id: 'limon', cantidad: 1.5 }]);
  check('apertura = último cierre + lo recibido después', ap.get('coca') === 17 && ap.get('papa') === 2 && ap.get('limon') === 1.5, [...ap]);
  const hoja = [];
  for (let i = 0; i < 10; i++) hoja.push({ fecha: U.sumarDias('2026-11-01', i), producto_id: 'coca', tipo: 'cierre', cantidad: i, sector: 'Barra' });
  hoja.push({ fecha: '2026-11-10', producto_id: 'coca', tipo: 'cierre', cantidad: 1, sector: 'Depósito' }, { fecha: '2026-11-10', producto_id: 'coca', tipo: 'apertura', cantidad: 99, sector: 'Barra' });
  const uc = R.ultimosCierres(hoja, 8);
  check('últimos 8 cierres, sumando sectores del mismo día', uc.get('coca').length === 8 && uc.get('coca')[7].fecha === '2026-11-10' && uc.get('coca')[7].cantidad === 10 && uc.get('coca')[0].fecha === '2026-11-03', uc.get('coca'));
  const ul = R.ultimoCierreDe(hoja);
  check('último cierre del local', ul.fecha === '2026-11-10' && ul.q.get('coca') === 10);
  const locs = [{ id: 'A', nombre: 'Umo', dias_abre: [5, 6, 0] }, { id: 'B', nombre: 'Trento', dias_abre: [5, 6, 0] }, { id: 'C', nombre: 'Baja', activo: false }];
  const cdA = R.cierresDeAnoche(new Map([['A', [{ fecha: '2026-11-08', tipo: 'cierre', producto_id: 'x' }]], ['B', [{ fecha: '2026-11-07', tipo: 'cierre', producto_id: 'x' }]]]), locs, '2026-11-09');
  check('cierres de anoche: Umo cerró el domingo, Trento no; el local de baja no cuenta', cdA.length === 2 && cdA[0].hecho && !cdA[1].hecho && cdA[0].esperada === '2026-11-08', cdA.map(x => [x.local.id, x.hecho, x.esperada]));
  check('misma clave para el mismo producto en dos locales', R.clavePorNombre({ nombre: 'Coca-Cola  350 cc', unidad_uso: 'Caja' }) === R.clavePorNombre({ nombre: 'coca-cola 350 cc', unidad_uso: 'caja' }) && R.clavePorNombre({ nombre: 'Tomate', unidad_uso: 'kg' }) !== R.clavePorNombre({ nombre: 'Tomate', unidad_uso: 'caja' }));

  const src = fs.readFileSync(path.join(__dirname, '..', 'stock/js/reposicion.js'), 'utf8');
  check('reposicion.js no usa precios', !/precio|costo|importe/i.test(src));
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
