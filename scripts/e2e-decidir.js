#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de gerencia: Problemas (#/decidir, desde el Inicio), Locales y Más.
// Domingo 22/11/2026 (datos de e2e-reposicion-datos.js + ventas, subas y retiros de esta prueba; API mockeada).
// 1) Decidir: "n cosas para decidir" con Pedidos ("Barcena: 2 locales listos" con monto porque todo tiene precio),
//    Precio ("Molleja subió 12 %") y Falta cierre ("Trento Café no cerró anoche"). Aprobar abre Compras en ese proveedor
//    sin aprobar nada; Aceptar la suba la saca (queda vista en este equipo); Avisar arma un WhatsApp sin número.
// 2) Locales: semáforo. Umo rojo (chorizo y molleja explican el número, ≥ 3 % de las ventas), Trento ámbar (falta 1
//    cierre), Shopping "—" por retiros (2 sin destino). Sin ventas: "Falta dato", nunca verde.
// 3) Local → productos que explican el número → ficha: debió usarse, se usó, diferencia en $ y barras de 6 semanas
//    (semanas sin cierres = hueco).
// 4) Todo lo de Más carga; las rutas viejas siguen (#/hoy → Inicio, #/comprar, #/hay, #/tablero, #/compras).
// Uso: node scripts/e2e-decidir.js [carpeta-de-capturas]
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { servidor, U, L, P, PV, base, sesion, montarApi } = require('./e2e-reposicion-datos.js');

const OUT = path.resolve(process.argv[2] || '/tmp/e2e-decidir');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1300: { viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 } };
const DOMINGO = new Date('2026-11-22T10:00:00-03:00');
const ts = (f, h) => new Date(`${f}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();

// Datos de gerencia: ventas por receta (lo vendido), un borrador más, historial de precios y retiros del Shopping.
function datos() {
  const db = base({ ahora: DOMINGO });
  const USO = { coca: 18, cerveza: 18, limon: 2, servilleta: 2, chorizo: 3, molleja: 1, morcilla: 1, cafe: 1, leche: 8, 'coca-t': 8 };
  const DE_MAS = { chorizo: 1, molleja: 0.5 }; // se usó de más (sin explicar) cada día en Umo
  let n = 0;
  for (const f of ['2026-11-20', '2026-11-21']) {
    for (const p of Object.values(P)) {
      if (!USO[p.id] || p.local_id === L.shp) continue;
      db.movs.push({ id: 'v' + (++n), local_id: p.local_id, producto_id: p.id, tipo: 'venta', cantidad: -(USO[p.id] - (DE_MAS[p.id] || 0)), nota: '', creado_en: ts(f, 14), ref_id: null });
    }
  }
  db.ventas = { [L.umo]: 600000, [L.tre]: 400000 };
  db.ordenes.push({ id: 'o-bar2', local_id: L.umo, proveedor_id: PV.barcena, estado: 'borrador', creado_en: ts('2026-11-21', 18), cargado_por_nombre: 'Lucas', nota: null,
    orden_items: [{ id: 'i9', producto_id: 'chorizo', cantidad_pedida: 5, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false }] });
  db.precios = [
    { producto_id: 'molleja', proveedor_id: PV.martin, precio: 9000, fecha: '2026-11-10', creado_en: ts('2026-11-10', 10), origen: 'recepcion' },
    { producto_id: 'molleja', proveedor_id: PV.martin, precio: 10080, fecha: '2026-11-20', creado_en: ts('2026-11-20', 10), origen: 'recepcion' }
  ];
  const ret = (id, otro, f) => db.hoja.push({ id: 'r' + id, local_id: L.shp, fecha: f, sector: 'Depósito', producto_id: 'papel', tipo: 'retiro', cantidad: 4, otro, quien: 'Marcos', creado_en: ts(f, 12) });
  ret(1, null, '2026-11-20'); ret(2, 'Umo Grill', '2026-11-21'); ret(3, null, '2026-11-21');
  return db;
}

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const abrir = async (ancho, db, ruta, esquema = 'light') => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: esquema, ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, db, errores);
    await c.addInitScript(([s]) => { if (sessionStorage.getItem('e2e-init')) return; sessionStorage.setItem('e2e-init', '1'); localStorage.setItem('stock-auth', JSON.stringify(s)); }, [sesion(U.ger)]);
    const p = await c.newPage();
    await p.clock.setFixedTime(DOMINGO);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|40[04] \(/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const txt = (p, sel) => p.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('scroller').scrollWidth <= document.getElementById('scroller').clientWidth + 1);

  for (const ancho of [390, 1300]) {
    const n = ancho === 390 ? 'celular' : 'pc';
    const db = datos();
    const { c, p } = await abrir(ancho, db, '#/hoy');
    // ===== 1) Problemas (#/decidir, desde la tarjeta roja del Inicio) =====
    await p.waitForSelector('.tm[data-mod="problemas"]');
    ok(await p.evaluate(() => location.hash) === '#/inicio', `${n}: #/hoy de gerencia aterriza en el Inicio`);
    await p.locator('.tm[data-mod="problemas"]').click();
    await p.waitForSelector('.dec');
    ok(await p.evaluate(() => location.hash) === '#/decidir', `${n}: la tarjeta Problemas abre #/decidir`);
    const tabs = ancho === 390 ? await p.locator('.tabbar .tab span').allInnerTexts() : await p.locator('.side-nav .side-link:not(.side-out) span').allInnerTexts();
    ok(tabs.join(' · ') === 'Inicio · Stock · Pedidos · Costos · Más', `${n}: barra "Inicio · Stock · Pedidos · Costos · Más" · ${tabs.join(' · ')}`);
    ok(await p.evaluate(() => document.documentElement.dataset.rol) === 'gerencia', `${n}: tema de gerencia (data-rol)`);
    const nDec = await p.locator('.dec').count();
    ok(await txt(p, '.vista-head .titulo') === 'Problemas' && (await txt(p, '.vista-head .sub')).startsWith(`${nDec} cosas para decidir`), `${n}: título "Problemas" y "${nDec} cosas para decidir"`);
    const ped = await txt(p, `[data-decidir="pedidos"][data-prov="${PV.barcena}"]`);
    ok(/Barcena: 2 locales listos/.test(ped) && /Trento Café, Umo Grill · \$ 130\.000/.test(ped), `${n}: Pedidos "Barcena: 2 locales listos" con monto · ${ped}`);
    const pre = await txt(p, '[data-decidir="precio"]');
    ok(/Molleja subió 12 %/.test(pre) && /antes \$ 9\.000/.test(pre), `${n}: Precio "Molleja subió 12 %" · ${pre}`);
    const cie = await txt(p, '[data-decidir="cierre"]');
    ok(/Trento Café no cerró anoche/.test(cie) && !/Umo Grill no cerró/.test(await p.locator('#view').innerText()), `${n}: Falta cierre solo Trento · ${cie}`);
    const wa = await p.locator('[data-decidir="cierre"] a').getAttribute('href');
    ok(/^https:\/\/wa\.me\/\?text=/.test(wa) && /Trento/.test(decodeURIComponent(wa)), `${n}: Avisar al encargado arma un WhatsApp sin número inventado`);
    if (ancho === 390) ok(await sinDesborde(p), `${n}: Decidir sin desborde`);
    // Aceptar la suba: se va y baja el contador.
    await p.locator('[data-decidir="precio"] [data-accion="Aceptar"]').click();
    ok(await p.locator('[data-decidir="precio"]').count() === 0 && (await txt(p, '.vista-head .sub')).startsWith(`${nDec - 1} cosas para decidir`), `${n}: Aceptar saca la suba y descuenta`);
    // Aprobar: abre Compras en el proveedor, sin aprobar nada.
    const patches = db.patches.length;
    await p.locator(`[data-decidir="pedidos"][data-prov="${PV.barcena}"] [data-accion="Aprobar"]`).click();
    await p.waitForSelector('.grupo-prov');
    ok(await p.evaluate(() => location.hash) === '#/compras' && await p.locator('.grupo-prov.is-ver[data-prov="Barcena"]').count() === 1, `${n}: Aprobar abre Compras en Barcena`);
    ok(db.patches.length === patches && db.ordenes.filter(o => o.estado === 'aprobada').length === 0, `${n}: no aprueba con un toque`);
    ok(await p.locator('.tab.is-active, .side-link.is-active').first().getAttribute('data-nav') === 'pedidos', `${n}: queda marcada la pestaña Pedidos`);

    // ===== 2) Locales (semáforo) =====
    await p.evaluate(() => { location.hash = '#/semaforo'; });
    await p.waitForSelector('.sem[data-local]');
    const umo = await txt(p, `.sem[data-local="${L.umo}"]`);
    ok(await p.locator(`.sem[data-local="${L.umo}"]`).getAttribute('data-luz') === 'rojo' && /Chorizo parrillero y Molleja explican el 100 %/.test(umo) && /\$ 25\.000/.test(umo) && /4,2 %/.test(umo), `${n}: Umo en rojo con lo que lo explica · ${umo}`);
    const tre = await txt(p, `.sem[data-local="${L.tre}"]`);
    ok(await p.locator(`.sem[data-local="${L.tre}"]`).getAttribute('data-luz') === 'ambar' && /Falta 1 cierre/.test(tre), `${n}: Trento ámbar por un cierre que falta · ${tre}`);
    const shp = await txt(p, `.sem[data-local="${L.shp}"]`);
    ok(/2 retiros sin destino/.test(shp) && /— por retiros/.test(shp), `${n}: Shopping por retiros · ${shp}`);
    ok(await p.locator('.sem-luz.is-verde').count() === 0, `${n}: nadie en verde sin datos`);
    if (ancho === 390) ok(await sinDesborde(p), `${n}: Locales sin desborde`);
    // ===== 3) Local → ficha =====
    await p.locator(`.sem[data-local="${L.umo}"]`).click();
    await p.waitForSelector('[data-local-total]');
    ok(await p.evaluate(() => location.hash) === '#/local' && /\$ 25\.000/.test(await txt(p, '[data-local-total]')), `${n}: detalle de Umo con $ 25.000 sin explicar`);
    ok(await p.locator('[data-producto]').count() === 2 && await p.locator('[data-accion="perdida"]').count() === 1 && await p.locator('[data-accion="control"]').count() === 1, `${n}: productos que explican el número y enlaces a Pérdida y Control`);
    await p.locator('[data-producto="chorizo"]').click();
    await p.waitForSelector('dialog [data-ficha]');
    ok(/Debió usarse según lo vendido y producido 4 kg/.test(await txt(p, '[data-fp="debio"]')) && /6 kg/.test(await txt(p, '[data-fp="uso"]')) && /\$ 16\.000/.test(await txt(p, '[data-fp="dif"]')),
      `${n}: ficha debió usarse 4 kg / se usó 6 kg / diferencia $ 16.000 · ${await txt(p, '[data-fp="dif"]')}`);
    const barras = await p.locator('dialog .bsem-c').count(), huecos = await p.locator('dialog .bsem-c.is-hueco').count();
    ok(barras === 6 && huecos >= 1, `${n}: 6 semanas en barras, con huecos donde no hubo cierres (${huecos})`);
    await p.screenshot({ path: path.join(OUT, `ficha-${n}.png`) });
    await p.keyboard.press('Escape');

    // ===== 4) Más y rutas viejas =====
    for (const r of ['inicio', 'costos', 'decidir', 'semaforo', 'tablero', 'hay', 'comprar', 'stock', 'resumen', 'recetas', 'pagos', 'catalogo', 'ajustes', 'notas', 'compras', 'pedidos', 'perdida', 'control', 'mas']) {
      await p.evaluate((x) => { location.hash = '#/' + x; }, r);
      await p.waitForTimeout(500);
      const v = await p.locator('#view').innerText().catch(() => '');
      ok(await p.evaluate((x) => location.hash === '#/' + x, r) && !/No se pudo cargar/.test(v), `${n}: #/${r} carga`);
    }
    const mas = await p.locator('#view .lg-fila .lg-n').allInnerTexts();
    ok(['Problemas', 'Locales', 'Tablero', 'Comprar por cierres', 'Stock y control', 'Números', 'Recetas', 'Pagos', 'Catálogo', 'Ajustes', 'Notas'].every(x => mas.includes(x)) && !mas.includes('Compras'), `${n}: Más con todo · ${mas.join(' / ')}`);
    await c.close();
  }
  await browser.close(); srv.close();
  const reales = errores.filter(e => !/ruta no prevista/.test(e));
  ok(!reales.length, 'sin errores de consola' + (reales.length ? ' · ' + reales.slice(0, 4).join(' | ') : ''));
  console.log(fallas ? `\n${fallas} FAIL` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
