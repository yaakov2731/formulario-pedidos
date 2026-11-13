#!/usr/bin/env node
// Pérdida de la semana y productos clave: prueba stock/js/perdida.js sin navegador ni base.
//   Pérdida = Σ días [ máx(0, Consumo − Vendido) + Merma anotada ] × costo por unidad de uso (hoja por sector, lunes a domingo).
//   Productos clave = los que suman ~80 % del costo consumido en 4 semanas, máximo 15; sin costo, aparte.
// Uso: node scripts/verify-perdida.js
const path = require('path');
const { pathToFileURL } = require('url');

let fallas = 0;
const check = (n, ok, x) => { console.log((ok ? 'OK   ' : 'FAIL ') + n + (!ok && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!ok) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 1e-6;

(async () => {
  const M = await import(pathToFileURL(path.join(__dirname, '..', 'stock/js/perdida.js')).href);
  const L = 'loc-1';
  const P = {
    nalga: { id: 'nalga', nombre: 'Nalga', local_id: L, unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1 },
    coca: { id: 'coca', nombre: 'Coca-Cola', local_id: L, unidad_compra: 'caja', unidad_uso: 'unidad', factor_conversion: 12 },
    limon: { id: 'limon', nombre: 'Limones', local_id: L, unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1 },
    otro: { id: 'otro', nombre: 'De otro local', local_id: 'loc-2', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1 }
  };
  const prods = new Map(Object.values(P).map(p => [p.id, p]));
  const precios = new Map([['nalga', 12000], ['coca', 12000], ['otro', 1000]]); // coca: $ 12.000 la caja de 12 → $ 1.000 la unidad; limón sin costo
  let n = 0;
  const hm = (fecha, sector, producto_id, tipo, cantidad, otro = null) => ({ id: 'h' + (++n), fecha, sector, producto_id, tipo, cantidad, otro, creado_en: fecha + 'T15:00:00Z' });
  const venta = (fecha, producto_id, cantidad, hora = 22) => ({ producto_id, tipo: 'venta', cantidad: -cantidad, creado_en: new Date(...fecha.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), hora).toISOString() });

  // ---- semana y jornada ----
  check('lunesDe: miércoles 11/11 → lunes 9/11', M.lunesDe('2026-11-11') === '2026-11-09');
  check('lunesDe: domingo 15/11 → lunes 9/11 (semana lunes a domingo)', M.lunesDe('2026-11-15') === '2026-11-09');
  check('lunesDe: lunes queda igual', M.lunesDe('2026-11-09') === '2026-11-09');
  check('diasDe: 7 días', M.diasDe('2026-11-09', '2026-11-15').length === 7);
  const vtas = [venta('2026-11-10', 'nalga', 1, 23), venta('2026-11-11', 'nalga', 1, 2), venta('2026-11-11', 'nalga', 1, 7)];
  check('deJornada: de 6 a 6 (la venta de las 2 de la mañana es del día anterior)', M.deJornada(vtas, '2026-11-10').length === 2 && M.deJornada(vtas, '2026-11-11').length === 1);
  check('costoUnidad: precio por bulto / factor; sin precio → null', M.costoUnidad(P.coca, precios) === 1000 && M.costoUnidad(P.limon, precios) === null);

  // ---- pérdida con y sin merma ----
  // Martes 10: nalga 10 → 4 en Cocina, vendidos 4 por receta, merma 1 anotada → consumo 5, sin explicar 1 kg.
  //            coca: Barra 24 → 10, entró 12 de Cámara (otro sector, se cancela: Cámara 30 → 18); vendidas 20 → consumo 26, sin explicar 6.
  // Miércoles 11: nalga 4 → 1, vendidos 3 → cierra. Limón 5 → 2, vendido 0 → sin explicar 3 kg pero sin costo.
  const hoja = [
    hm('2026-11-10', 'Cocina', 'nalga', 'apertura', 10), hm('2026-11-10', 'Cocina', 'nalga', 'merma', 1), hm('2026-11-10', 'Cocina', 'nalga', 'cierre', 4),
    hm('2026-11-10', 'Barra', 'coca', 'apertura', 24), hm('2026-11-10', 'Barra', 'coca', 'entro', 12, 'Cámara'), hm('2026-11-10', 'Barra', 'coca', 'cierre', 10),
    hm('2026-11-10', 'Cámara', 'coca', 'apertura', 30), hm('2026-11-10', 'Cámara', 'coca', 'cierre', 18),
    hm('2026-11-11', 'Cocina', 'nalga', 'apertura', 4), hm('2026-11-11', 'Cocina', 'nalga', 'cierre', 1),
    hm('2026-11-11', 'Barra', 'limon', 'apertura', 5), hm('2026-11-11', 'Barra', 'limon', 'cierre', 2)
  ];
  const movs = [venta('2026-11-10', 'nalga', 4), venta('2026-11-10', 'coca', 20), venta('2026-11-11', 'nalga', 3)];
  const r = M.perdidaSemana({ hoja, movs, desde: '2026-11-09', hasta: '2026-11-15', prods, precios });
  check('días con hoja y con cierre', r.diasConHoja === 2 && r.diasConCierre === 2, r);
  check('sin explicar = 1 kg nalga × 12.000 + 6 coca × 1.000 = $ 18.000', cerca(r.sinExplicar, 18000), r.sinExplicar);
  check('merma anotada = 1 kg nalga × 12.000 = $ 12.000 (aparte de lo sin explicar)', cerca(r.merma, 12000), r.merma);
  check('total = sin explicar + merma = $ 30.000', cerca(r.total, 30000), r.total);
  check('productos de mayor a menor: Nalga ($ 24.000) y Coca-Cola ($ 6.000)', r.productos.map(x => x.p.id).join(',') === 'nalga,coca' && cerca(r.productos[0].valor, 24000), r.productos.map(x => [x.p.id, x.valor]));
  check('cantidades: Nalga falta 1 kg y merma 1 kg; Coca falta 6', r.productos[0].falta === 1 && r.productos[0].merma === 1 && r.productos[1].falta === 6);
  check('sin costo: Limones fuera de la plata y listado aparte', r.sinCosto.length === 1 && r.sinCosto[0].p.id === 'limon' && r.sinCosto[0].falta === 3);
  const sinMerma = M.perdidaSemana({ hoja: hoja.filter(x => x.tipo !== 'merma'), movs, desde: '2026-11-09', hasta: '2026-11-15', prods, precios });
  check('sin merma: la nalga no anotada pasa a sin explicar (2 kg) y merma $ 0', cerca(sinMerma.merma, 0) && cerca(sinMerma.sinExplicar, 2 * 12000 + 6000), sinMerma);
  const fuera = M.perdidaSemana({ hoja, movs, desde: '2026-11-11', hasta: '2026-11-11', prods, precios });
  check('solo cuenta los días del rango (miércoles: nalga cierra, $ 0)', fuera.diasConHoja === 1 && cerca(fuera.total, 0));
  const abierto = M.perdidaSemana({ hoja: [hm('2026-11-12', 'Cocina', 'nalga', 'apertura', 5), hm('2026-11-12', 'Cocina', 'nalga', 'merma', 0.5)], movs: [], desde: '2026-11-09', hasta: '2026-11-15', prods, precios });
  check('sin cierre: no se calcula lo sin explicar (nunca se estima), la merma sí cuenta', abierto.diasConCierre === 0 && cerca(abierto.sinExplicar, 0) && cerca(abierto.merma, 6000) && M.hayPerdida(abierto));

  // ---- sin datos / sin costos ----
  const vacia = M.perdidaSemana({ hoja: [], movs: [], desde: '2026-11-09', hasta: '2026-11-15', prods, precios });
  check('sin hoja: sin número ("Sin cierres esta semana")', !M.hayPerdida(vacia) && vacia.diasConHoja === 0 && vacia.total === 0);
  const sinCostos = M.perdidaSemana({ hoja, movs, desde: '2026-11-09', hasta: '2026-11-15', prods, precios: new Map() });
  check('sin costos: $ 0 en plata y todos los productos en "Falta cargar costos"', sinCostos.total === 0 && sinCostos.productos.length === 0 && sinCostos.sinCosto.length === 3);

  // ---- consumo de 4 semanas ----
  const hoy = '2026-11-12';
  const cons = M.consumo4Semanas({ hoy, prods, precios,
    movs: [{ producto_id: 'nalga', tipo: 'venta', cantidad: -7, creado_en: '2026-11-10T22:00:00Z' }, { producto_id: 'nalga', tipo: 'recepcion', cantidad: 50, creado_en: '2026-11-10T12:00:00Z' },
      { producto_id: 'coca', tipo: 'venta', cantidad: -5, creado_en: '2026-11-12T22:00:00Z' }], // hoy no cuenta
    hoja });
  check('consumo 4 semanas: la mayor de las dos fuentes (nalga: ventas 7 vs hoja 8 → 8)', cons.get('nalga') === 8, [...cons]);
  check('consumo 4 semanas: pases entre sectores no se cuentan dos veces (coca 26)', cons.get('coca') === 26, [...cons]);
  check('consumo 4 semanas: las entradas no son consumo y hoy no cuenta', !cons.has('otro'));

  // ---- productos clave: 80 % y tope 15 ----
  const muchos = new Map(); const pm = new Map(); const prm = new Map();
  for (let i = 1; i <= 30; i++) { const id = 'x' + i; pm.set(id, { id, nombre: 'Prod ' + String(i).padStart(2, '0'), local_id: L, factor_conversion: 1 }); prm.set(id, 100); muchos.set(id, 1); }
  const plano = M.productosClave({ cons: muchos, prods: pm, precios: prm, localId: L });
  check('ranking parejo: corta en el tope de 15 aunque no llegue al 80 %', plano.clave.length === 15 && plano.acum / plano.total < 0.8);
  const pareto = new Map([['a', 50], ['b', 25], ['c', 10], ['d', 10], ['e', 5]]);
  const pp = new Map([...pareto.keys()].map(id => [id, { id, nombre: id.toUpperCase(), local_id: L, factor_conversion: 1 }]));
  const pr = new Map([...pareto.keys()].map(id => [id, 1]));
  const k = M.productosClave({ cons: pareto, prods: pp, precios: pr, localId: L });
  check('ranking 80 %: A (50 %) + B (25 %) + C (10 %) = 85 %, corta ahí', k.clave.map(x => x.p.id).join(',') === 'a,b,c' && cerca(k.acum / k.total, 0.85), k.clave.map(x => x.p.id));
  const k2 = M.productosClave({ cons: new Map([['nalga', 8], ['coca', 26], ['limon', 3], ['otro', 9]]), prods, precios, localId: L });
  check('ranking: sin costo afuera ("Falta cargar costos") y solo el local pedido', k2.clave.map(x => x.p.id).join(',') === 'nalga,coca' && k2.sinCosto.map(x => x.p.id).join(',') === 'limon' && !k2.clave.some(x => x.p.id === 'otro'), k2);
  check('ranking: nalga $ 96.000 (8 kg) > coca $ 26.000: nalga sola es 78,7 %, entra coca para llegar al 80 %', (() => { const k3 = M.productosClave({ cons: new Map([['nalga', 8], ['coca', 26]]), prods, precios, localId: L }); return k3.clave.length === 2; })());
  const nada = M.productosClave({ cons: new Map(), prods, precios, localId: L });
  check('sin historial: sin ranking ("Sin historial todavía")', !nada.hayHistorial && nada.clave.length === 0);

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
