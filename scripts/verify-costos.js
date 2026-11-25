#!/usr/bin/env node
// Costo por plato (stock/js/costos.js) y FIFO del contar guiado (stock/js/fifo.js): prueba las cuentas sin navegador ni base.
// Uso: node scripts/verify-costos.js
process.env.TZ = 'America/Argentina/Buenos_Aires';
const path = require('path');
const { pathToFileURL } = require('url');

let fallas = 0;
const check = (n, ok, x) => { console.log((ok ? 'OK   ' : 'FAIL ') + n + (!ok && x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!ok) fallas++; };
const js = (f) => pathToFileURL(path.join(__dirname, '..', 'stock/js', f)).href;
const casi = (a, b) => a != null && Math.abs(a - b) < 1e-6;

(async () => {
  const C = await import(js('costos.js'));
  const F = await import(js('fifo.js'));

  // ---- Catálogo de prueba ----
  const prod = (id, nombre, extra = {}) => ({ id, nombre, categoria: 'Almacén', unidad_compra: 'kg', unidad_uso: 'kg', factor_conversion: 1, activo: true, ...extra });
  const prods = new Map([
    ['chorizo', prod('chorizo', 'Chorizo')],
    ['pan', prod('pan', 'Pan', { unidad_compra: 'pack', unidad_uso: 'unidad', factor_conversion: 12 })],
    ['provolone', prod('provolone', 'Provolone')],
    ['salsa', prod('salsa', 'Salsa criolla', { es_elaborado: true, unidad_compra: 'litro', unidad_uso: 'litro' })],
    ['tomate', prod('tomate', 'Tomate')],
    ['choripan', prod('choripan', 'Choripán', { categoria: 'Carta', unidad_compra: 'unidad', unidad_uso: 'unidad' })],
    ['provoleta', prod('provoleta', 'Provoleta', { categoria: 'Carta' })],
    ['flan', prod('flan', 'Flan', { categoria: 'Carta' })],
    ['chori-salsa', prod('chori-salsa', 'Choripán con salsa', { categoria: 'Carta' })]
  ]);
  const precios = new Map([['chorizo', 8000], ['pan', 3600], ['tomate', 2000]]);
  const recetas = new Map([
    ['choripan', { producto_id: 'choripan', rinde: 1, receta_items: [{ insumo_id: 'chorizo', cantidad: 0.2 }, { insumo_id: 'pan', cantidad: 1 }] }],
    ['provoleta', { producto_id: 'provoleta', rinde: 1, receta_items: [{ insumo_id: 'provolone', cantidad: 0.15 }] }],
    // Salsa: 2 kg de tomate rinden 4 litros → 1000 por litro. El plato usa 0,1 l → 100.
    ['salsa', { producto_id: 'salsa', rinde: 4, receta_items: [{ insumo_id: 'tomate', cantidad: 2 }] }],
    ['chori-salsa', { producto_id: 'chori-salsa', rinde: 2, receta_items: [{ insumo_id: 'chorizo', cantidad: 0.4 }, { insumo_id: 'pan', cantidad: 2 }, { insumo_id: 'salsa', cantidad: 0.2 }] }]
  ]);
  const cat = { prods, precios, recetas };

  // ---- costoReceta ----
  const r1 = C.costoReceta(recetas.get('choripan'), cat);
  check('choripán: 0,2 kg × 8000 + 1 pan (pack de 12 a 3600 → 300) = 1900', casi(r1.costo, 1900) && !r1.faltan.length, r1);
  check('choripán: ingredientes con su costo por plato (1600 y 300)', casi(r1.ingredientes[0].costo, 1600) && casi(r1.ingredientes[1].costo, 300) && casi(r1.ingredientes[0].cantidad, 0.2));
  const r2 = C.costoReceta(recetas.get('provoleta'), cat);
  check('provoleta: sin precio del provolone → costo null y "precio de Provolone" en lo que falta', r2.costo === null && r2.faltan.join() === 'precio de Provolone' && r2.ingredientes[0].costo === null, r2);
  check('sin receta → null y "la receta"', C.costoReceta(undefined, cat).costo === null && C.costoReceta(undefined, cat).faltan[0] === 'la receta');
  const r3 = C.costoReceta(recetas.get('chori-salsa'), cat);
  check('elaborado sin precio usa el costo de su receta; rinde 2 divide todo: (3200 + 600 + 200) ÷ 2 = 2000', casi(r3.costo, 2000) && casi(r3.ingredientes[2].costo, 100) && casi(r3.ingredientes[0].cantidad, 0.2), r3);

  // ---- ventasPorPlato ----
  const ventas = C.ventasPorPlato([
    { producto_id: 'choripan', cantidad: 4, importe: 24000 }, { producto_id: 'choripan', cantidad: 6, importe: 36000 },
    { producto_id: null, cantidad: 3, importe: 9000 }, { producto_id: 'provoleta', cantidad: 2, importe: 14000 },
    { producto_id: 'chori-salsa', cantidad: 5, importe: 40000 }
  ]);
  check('ventas por plato: suma cantidad e importe y deja afuera lo que no tiene producto', ventas.get('choripan').cantidad === 10 && ventas.get('choripan').importe === 60000 && !ventas.has(null) && ventas.size === 3);

  // ---- fichaPlato ----
  const f1 = C.fichaPlato(prods.get('choripan'), cat, ventas);
  check('ficha choripán: precio 6000, ganancia 4100, 31,7 %', casi(f1.precio, 6000) && casi(f1.ganancia, 4100) && casi(f1.pct, 1900 / 6000) && C.textoPct(f1.pct) === '32 %', f1);
  check('ficha choripán: arriba de la meta → sugiere 6400 (1900 ÷ 0,30 = 6333, redondeado a $100 hacia arriba)', f1.sugerido === 6400, f1.sugerido);
  const f2 = C.fichaPlato(prods.get('chori-salsa'), cat, ventas);
  check('ficha con salsa: 2000 ÷ 8000 = 25 %, dentro de la meta → sin sugerencia', casi(f2.pct, 0.25) && f2.sugerido === null);
  const f3 = C.fichaPlato(prods.get('provoleta'), cat, ventas);
  check('ficha provoleta: Falta dato (no completo), sin %, sin ganancia ni sugerencia', !f3.completo && f3.pct === null && f3.ganancia === null && f3.sugerido === null && casi(f3.precio, 7000));
  const f4 = C.fichaPlato(prods.get('flan'), cat, ventas);
  check('ficha flan: sin receta ni ventas → dice las dos cosas', !f4.completo && f4.faltan.includes('la receta') && f4.faltan.includes('ventas de los últimos días') && f4.precio === null);
  check('precio sugerido exacto: 4080 ÷ 0,30 = 13600 (sin error de coma flotante)', C.precioSugerido(4080) === 13600 && C.precioSugerido(0) === null && C.precioSugerido(null) === null);

  // ---- resumenCostos ----
  const res = C.resumenCostos(['choripan', 'chori-salsa', 'provoleta', 'flan'].map(id => prods.get(id)), cat, ventas);
  check('% global solo con los platos completos: (1900·10 + 2000·5) ÷ (60000 + 40000) = 29 %', casi(res.pct, 29000 / 100000) && C.textoPct(res.pct) === '29 %' && res.cubiertos === 2 && res.total === 4, res.pct);
  const vacio = C.resumenCostos([prods.get('flan')], cat, ventas);
  check('sin platos completos → % null ("Falta dato"), nunca 0 %', vacio.pct === null && vacio.cubiertos === 0 && C.textoPct(vacio.pct) === null);
  check('textoPct de NaN o Infinity → null', C.textoPct(NaN) === null && C.textoPct(Infinity) === null);

  // ---- FIFO ----
  const ent = [
    { producto_id: 'leche', creado_en: '2026-11-10T13:00:00.000Z' }, { producto_id: 'leche', creado_en: '2026-11-18T13:00:00.000Z' },
    { producto_id: 'leche', creado_en: '2026-11-18T20:00:00.000Z' }, { producto_id: 'leche', creado_en: '2026-11-02T13:00:00.000Z' },
    { producto_id: 'muzza', creado_en: '2026-11-21T12:00:00.000Z' },
    { producto_id: 'vieja', creado_en: '2026-09-01T12:00:00.000Z' },
    { producto_id: 'noche', creado_en: '2026-11-22T02:30:00.000Z' } // 21/11 a las 23:30 en Argentina
  ];
  const L = F.lotesFifo(ent, { desde: '2026-10-08' });
  check('FIFO: las dos últimas entradas, un día por fecha, de más vieja a más nueva', JSON.stringify(L.get('leche')) === JSON.stringify(['2026-11-10', '2026-11-18']), L.get('leche'));
  check('FIFO: lo anterior a la ventana no cuenta', !L.has('vieja') && F.DIAS_FIFO === 45);
  check('FIFO: la fecha es la del día local (23:30 del 21/11 en Argentina)', JSON.stringify(L.get('noche')) === JSON.stringify(['2026-11-21']), L.get('noche'));
  check('FIFO: etiquetas "Primero · entró 10/11" y "Después · entró 18/11"', F.etiquetasFifo(L.get('leche')).map(e => e.texto).join(' | ') === 'Primero · entró 10/11 | Después · entró 18/11');
  check('FIFO: una sola entrada → solo "Primero"', F.etiquetasFifo(L.get('muzza')).map(e => e.tipo + ':' + e.texto).join() === 'primero:Primero · entró 21/11');
  check('FIFO: sin entradas → "Sin fecha de entrada"', F.etiquetasFifo(undefined)[0].texto === 'Sin fecha de entrada' && F.etiquetasFifo([])[0].tipo === 'sin');
  check('FIFO: las etiquetas no llevan cantidades (solo dd/mm)', [...L.values()].flatMap(F.etiquetasFifo).every(e => /^(Primero|Después) · entró \d\d\/\d\d$/.test(e.texto)));

  console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
