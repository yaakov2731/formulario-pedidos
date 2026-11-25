#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) del rediseño v2 de gerencia: Inicio "¿Qué hacemos?" con 5 módulos de
// color y Costos (lista y ficha de plato). Domingo 22/11/2026 (datos de e2e-reposicion-datos.js + platos, recetas y
// ventas de esta prueba; API mockeada). Al final, el encargado: tema negro y dorado y ningún "$" en sus pantallas.
// Cuentas a mano (últimos 28 días, precio de venta = importe ÷ cantidad de Núcleo):
//   Choripán (Umo): 0,2 kg chorizo × 8000 + 1 pan (pack 12 × 3600 → 300) = 1900; vende 10 × 6000 → 32 %, sugiere 6400.
//   Mollejas (Umo): 0,25 kg × 9000 = 2250; vende 5 × 9000 → 25 % (dentro de la meta, sin sugerencia).
//   Café con leche (Trento): 0,015 kg × 30000 + 0,15 l × 1500 = 675; vende 20 × 2500 → 27 %.
//   Provoleta (Umo): el provolone no tiene precio → Falta dato. Flan (Umo): sin receta ni ventas → Falta dato.
//   Global = (1900·10 + 2250·5 + 675·20) ÷ (60000 + 45000 + 50000) = 43750 ÷ 155000 = 28 %, 3 de 5 platos.
// Recetas: 4 de 5 platos con receta. Pedidos: 1 borrador (Barcena · Trento). Problemas: Trento sin cierre anoche y
// la suba de la molleja (2).
// Uso: node scripts/e2e-inicio.js [carpeta-de-capturas]
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { servidor, U, L, PV, base, sesion, montarApi } = require('./e2e-reposicion-datos.js');

const OUT = path.resolve(process.argv[2] || '/tmp/e2e-inicio');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1300: { viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 } };
const DOMINGO = new Date('2026-11-22T10:00:00-03:00');
const ts = (f, h) => new Date(`${f}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();

const plato = (id, nombre, local = L.umo) => ({ id, codigo: 'P-' + id, nombre, local_id: local, categoria: 'Carta', unidad_compra: 'unidad', unidad_uso: 'unidad', factor_conversion: 1, proveedor_id: null, par: null, es_elaborado: false, activo: true, oculto: false, lugar: null, orden_lugar: 999 });
const insumo = (id, nombre, uc, uu, f, local = L.umo) => ({ id, codigo: 'I-' + id, nombre, local_id: local, categoria: 'Almacén', unidad_compra: uc, unidad_uso: uu, factor_conversion: f, proveedor_id: PV.barcena, par: null, es_elaborado: false, activo: true, oculto: false, lugar: 'Cocina', orden_lugar: 998 });
function datos() {
  const db = base({ ahora: DOMINGO });
  db.prodsExtra = [plato('choripan', 'Choripán'), plato('mollejas-p', 'Mollejas a la parrilla'), plato('provoleta', 'Provoleta'), plato('flan', 'Flan casero'),
    plato('cafe-c', 'Café con leche', L.tre), insumo('pan', 'Pan de choripán', 'pack', 'unidad', 12), insumo('provolone', 'Provolone', 'kg', 'kg', 1)];
  db.preciosExtra = { pan: 3600 };
  db.recetas = [
    { id: 1, producto_id: 'choripan', rinde: 1, receta_items: [{ insumo_id: 'chorizo', cantidad: 0.2 }, { insumo_id: 'pan', cantidad: 1 }] },
    { id: 2, producto_id: 'mollejas-p', rinde: 1, receta_items: [{ insumo_id: 'molleja', cantidad: 0.25 }] },
    { id: 3, producto_id: 'provoleta', rinde: 1, receta_items: [{ insumo_id: 'provolone', cantidad: 0.15 }] },
    { id: 4, producto_id: 'cafe-c', rinde: 1, receta_items: [{ insumo_id: 'cafe', cantidad: 0.015 }, { insumo_id: 'leche', cantidad: 0.15 }] }
  ];
  let n = 0;
  const venta = (pid, local, f, cant, imp) => db.ventasItems.push({ id: ++n, local_id: local, fecha: f, codigo_origen: 'N' + pid, nombre_origen: pid, cantidad: cant, importe: imp, producto_id: pid });
  db.ventasItems = [];
  venta('choripan', L.umo, '2026-11-14', 4, 24000); venta('choripan', L.umo, '2026-11-21', 6, 36000);
  venta('mollejas-p', L.umo, '2026-11-20', 5, 45000);
  venta('cafe-c', L.tre, '2026-11-15', 8, 20000); venta('cafe-c', L.tre, '2026-11-21', 12, 30000);
  venta(null, L.umo, '2026-11-21', 2, 3000); // renglón sin producto: no cuenta
  db.precios = [
    { producto_id: 'molleja', proveedor_id: PV.martin, precio: 8000, fecha: '2026-11-10', creado_en: ts('2026-11-10', 10), origen: 'recepcion' },
    { producto_id: 'molleja', proveedor_id: PV.martin, precio: 9000, fecha: '2026-11-20', creado_en: ts('2026-11-20', 10), origen: 'recepcion' }
  ];
  return db;
}

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const abrir = async (ancho, db, ruta, { esquema = 'light', quien = U.ger } = {}) => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: esquema, ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, db, errores);
    await c.addInitScript(([s]) => { if (sessionStorage.getItem('e2e-init')) return; sessionStorage.setItem('e2e-init', '1'); localStorage.setItem('stock-auth', JSON.stringify(s)); }, [sesion(quien)]);
    const p = await c.newPage();
    await p.clock.setFixedTime(DOMINGO);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|40[04] \(/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const txt = (p, sel) => p.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('scroller').scrollWidth <= document.getElementById('scroller').clientWidth + 1);
  const listo = (p) => p.waitForFunction(() => document.querySelectorAll('.tm').length === 5 && !document.querySelector('.tm[aria-busy="true"]'), null, { timeout: 15000 });
  // Captura sin la pantalla de carga ni la animación de entrada.
  const foto = async (p, nombre, fullPage = false) => { await p.waitForSelector('#splash', { state: 'detached', timeout: 8000 }).catch(() => {}); await p.waitForTimeout(450); await p.screenshot({ path: path.join(OUT, nombre), fullPage }); };
  const miga = (p) => p.locator('.miga-mod').first().textContent().catch(() => '');
  const fondo = (p) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const inventado = (t) => /NaN|\$ 0(?![\d.,])|(?<![\d,])0 %|undefined|Infinity/.test(t);

  for (const ancho of [390, 1300]) {
    const n = ancho === 390 ? 'celular' : 'pc';
    const db = datos();
    const { c, p } = await abrir(ancho, db, '#/hoy');
    // ===== Inicio =====
    await listo(p);
    ok(await p.evaluate(() => location.hash) === '#/inicio', `${n}: #/hoy de gerencia lleva al Inicio`);
    const tabs = ancho === 390 ? await p.locator('.tabbar .tab span').allInnerTexts() : await p.locator('.side-nav .side-link:not(.side-out) span').allInnerTexts();
    ok(tabs.join(' · ') === 'Inicio · Stock · Pedidos · Costos · Más', `${n}: barra "Inicio · Stock · Pedidos · Costos · Más" · ${tabs.join(' · ')}`);
    ok(await p.locator((ancho === 390 ? '.tabbar' : '.side-nav') + ' .chip-mod').count() === 4, `${n}: chip de color en Inicio, Stock, Pedidos y Costos`);
    ok(await txt(p, '.titulo') === '¿Qué hacemos?', `${n}: título "¿Qué hacemos?"`);
    const card = async (m) => ({ n: await txt(p, `.tm[data-mod="${m}"] .tm-n`), t: await txt(p, `.tm[data-mod="${m}"] .tm-t`), s: await txt(p, `.tm[data-mod="${m}"] .tm-s`) });
    const st = await card('stock'), pe = await card('pedidos'), co = await card('costos'), re = await card('recetas'), pr = await card('problemas');
    ok(/^(< 1 día|\d+ días?)$/.test(st.n) && st.t === 'Lo que hay' && /^Lo más justo: .+ en .+$/.test(st.s), `${n}: Stock con los días que alcanza lo más justo · ${JSON.stringify(st)}`);
    ok(pe.n === '1' && pe.t === 'Para aprobar' && pe.s === '1 local', `${n}: Pedidos 1 para aprobar · ${JSON.stringify(pe)}`);
    ok(co.n === '28 %' && co.t === 'Costo comida' && co.s === '3 de 5 platos', `${n}: Costos 28 % con 3 de 5 platos · ${JSON.stringify(co)}`);
    ok(re.n === '4' && re.t === 'Platos' && re.s === '1 sin receta', `${n}: Recetas 4 platos, 1 sin receta · ${JSON.stringify(re)}`);
    ok(pr.n === '2' && pr.t === 'Trento Café sin cierre anoche' && pr.s === 'y 1 más', `${n}: Problemas 2, primero el cierre de Trento · ${JSON.stringify(pr)}`);
    ok(await p.evaluate(() => { const g = document.querySelector('.tm.is-ancho'); return g && g.dataset.mod === 'problemas' && g.getBoundingClientRect().width > document.querySelector('.tm[data-mod="stock"]').getBoundingClientRect().width * 1.5; }), `${n}: Problemas va a lo ancho`);
    const colores = await p.evaluate(() => ['stock', 'pedidos', 'costos', 'recetas', 'problemas'].map(m => getComputedStyle(document.querySelector(`.tm[data-mod="${m}"]`)).backgroundColor));
    ok(colores.join(' ') === 'rgb(47, 111, 228) rgb(31, 157, 99) rgb(233, 169, 19) rgb(238, 122, 30) rgb(216, 67, 75)', `${n}: colores de módulo · ${colores.join(' ')}`);
    ok(await fondo(p) === 'rgb(246, 247, 249)', `${n}: gerencia clara #F6F7F9`);
    ok(!inventado(await txt(p, '#view')), `${n}: Inicio sin NaN, $ 0 ni 0 % inventados`);
    ok(await sinDesborde(p), `${n}: Inicio sin scroll horizontal`);
    await foto(p, `${n}-inicio.png`, false);

    // ===== Costos: lista =====
    await p.click('.tm[data-mod="costos"]');
    await p.waitForSelector('.cs-kpi');
    ok(await p.evaluate(() => document.documentElement.dataset.modulo) === 'costos', `${n}: Costos pinta el módulo amarillo (data-modulo)`);
    ok(await miga(p) === 'Costos · Por plato', `${n}: miga "Costos · Por plato" · ${await miga(p)}`);
    ok(await txt(p, '[data-pct="global"]') === '28 %' && await txt(p, '[data-cobertura]') === '3 de 5 platos con todos los datos', `${n}: costo comida 28 %, 3 de 5 platos`);
    ok(await txt(p, '[data-plato="choripan"] .cs-pct') === '32 %' && await txt(p, '[data-plato="mollejas-p"] .cs-pct') === '25 %' && await txt(p, '[data-plato="cafe-c"] .cs-pct') === '27 %', `${n}: % por plato (32, 25, 27)`);
    ok(await txt(p, '[data-plato="provoleta"] .cs-pct') === 'Falta dato' && /precio de Provolone/.test(await txt(p, '[data-plato="provoleta"]')) && await txt(p, '[data-plato="flan"] .cs-pct') === 'Falta dato', `${n}: Provoleta y Flan "Falta dato" con lo que falta`);
    ok(/Precio de venta = promedio de Núcleo \(puede incluir IVA\)/.test(await txt(p, '.cs-nota')), `${n}: nota del precio de venta`);
    ok(!inventado(await txt(p, '#view')) && await sinDesborde(p), `${n}: lista sin datos inventados ni desborde`);
    await foto(p, `${n}-costos-lista.png`, true);

    // ===== Costos: ficha =====
    await p.click('[data-plato="choripan"]');
    await p.waitForSelector('.pf[data-paso="4"]');
    ok(await p.evaluate(() => location.hash) === '#/costos/choripan', `${n}: ficha en #/costos/choripan`);
    ok(await p.locator('.pf-k').allInnerTexts().then(a => a.join('') === '1234'), `${n}: ficha numerada 1 a 4`);
    ok(await txt(p, '[data-insumo="chorizo"]') === 'Chorizo parrillero 200 g $ 1.600' && await txt(p, '[data-insumo="pan"]') === 'Pan de choripán 1 unidad $ 300', `${n}: ingredientes con su costo · ${await txt(p, '[data-insumo="chorizo"]')} / ${await txt(p, '[data-insumo="pan"]')}`);
    ok(await txt(p, '[data-costo]') === '$ 1.900' && await txt(p, '[data-ganancia]') === '$ 4.100', `${n}: costo total $ 1.900 y ganancia $ 4.100`);
    ok(await txt(p, '.pf[data-paso="4"] .pf-t') === 'Costo comida 32 %' && /el precio sería \$ 6\.400/.test(await txt(p, '[data-sugerido]')), `${n}: 32 % vs meta 30 %, sugiere $ 6.400 · ${await txt(p, '[data-sugerido]')}`);
    ok(/Precio de venta \$ 6\.000/.test(await txt(p, '.tg .sub')), `${n}: precio de venta promedio $ 6.000`);
    await foto(p, `${n}-costos-ficha.png`, true);
    await p.evaluate(() => { location.hash = '#/costos/mollejas-p'; });
    await p.waitForFunction(() => location.hash === '#/costos/mollejas-p' && document.querySelector('[data-sugerido]'));
    ok(/dentro de la meta/.test(await txt(p, '[data-sugerido]')), `${n}: Mollejas 25 % dentro de la meta, sin sugerencia`);
    await p.evaluate(() => { location.hash = '#/costos/provoleta'; });
    await p.waitForFunction(() => location.hash === '#/costos/provoleta' && document.querySelector('.pf[data-paso="4"]'));
    ok(await txt(p, '[data-costo]') === 'Falta dato' && await txt(p, '[data-ganancia]') === 'Falta dato' && /precio de Provolone/.test(await txt(p, '#view')) && !(await p.locator('[data-sugerido]').count()), `${n}: Provoleta sin precio: Falta dato, sin sugerencia`);
    ok(!inventado(await txt(p, '#view')), `${n}: ficha sin datos inventados`);

    // ===== Módulo Stock y Problemas =====
    await p.evaluate(() => { location.hash = '#/hay'; });
    await p.waitForSelector('.cq-matriz, .empty', { timeout: 15000 });
    ok(await p.evaluate(() => document.documentElement.dataset.modulo) === 'stock' && await miga(p) === 'Stock · Lo que hay', `${n}: Lo que hay en el módulo Stock (azul) con su miga`);
    ok(await p.locator((ancho === 390 ? '.tabbar' : '.side-nav') + ' [data-nav="hay"].is-active').count() === 1, `${n}: la pestaña Stock queda marcada`);
    await foto(p, `${n}-modulo-stock.png`, false);
    await p.evaluate(() => { location.hash = '#/decidir'; });
    await p.waitForSelector('.dec');
    ok(await txt(p, '.titulo') === 'Problemas' && await p.evaluate(() => document.documentElement.dataset.modulo) === 'problemas', `${n}: #/decidir sigue andando como Problemas (rojo)`);
    await p.evaluate(() => { location.hash = '#/inicio'; });
    await listo(p);
    ok(!(await p.evaluate(() => document.documentElement.dataset.modulo)), `${n}: el Inicio no tiene módulo (color base)`);
    await c.close();
  }

  // ===== Gerencia oscura =====
  {
    const { c, p } = await abrir(390, datos(), '#/inicio', { esquema: 'dark' });
    await listo(p);
    ok(await fondo(p) === 'rgb(18, 20, 26)', 'oscuro: gerencia sigue al teléfono (#12141A)');
    await foto(p, 'celular-inicio-oscuro.png');
    await c.close();
  }

  // ===== Encargado: negro y dorado fijo, sin "$" =====
  for (const esquema of ['light', 'dark']) {
    const db = datos();
    const { c, p } = await abrir(390, db, '#/hoy', { esquema, quien: U.umo });
    await p.waitForSelector('.ct');
    ok(await fondo(p) === 'rgb(13, 12, 10)', `encargado (${esquema}): fondo negro #0D0C0A aunque el teléfono esté en ${esquema === 'light' ? 'claro' : 'oscuro'}`);
    ok(!(await p.evaluate(() => document.documentElement.dataset.modulo)), `encargado (${esquema}): sin módulos de color`);
    const tabs = await p.locator('.tabbar .tab span').allInnerTexts();
    ok(tabs.join(' · ').toLowerCase() === 'hoy · pedidos · más', `encargado: barra "Hoy · Pedidos · Más" · ${tabs.join(' · ')}`);
    for (const r of ['hoy', 'mis-pedidos', 'apertura', 'cierre', 'pedir-prov', 'mas']) {
      await p.evaluate((x) => { location.hash = '#/' + x; }, r);
      await p.waitForFunction((x) => location.hash.startsWith('#/' + x) && !document.querySelector('#view .skel, #view .esq'), r, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(400);
      const t = await txt(p, '#view');
      ok(t.length > 0 && !t.includes('$'), `encargado: #/${r} sin "$"`);
    }
    await c.close();
  }
  ok(!errores.some(e => /el encargado pidió precios/.test(e)), 'el encargado nunca pide precios');

  await browser.close(); srv.close();
  const reales = errores.filter(e => !/el encargado pidió precios/.test(e));
  if (reales.length) { console.log('\nErrores de la página:\n' + reales.join('\n')); fallas += reales.length; }
  console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
