#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) del encargado rediseñado: Hoy · Mis pedidos · Más, contar guiado y
// pedir por proveedor. Domingo 22/11/2026 en Umo (datos de e2e-reposicion-datos.js, API de Supabase mockeada).
// 1) Hoy: "Hola, Lucas", botones grandes con lo pendiente arriba (Abrir el local primero, en la tinta), barra exacta.
// 2) Apertura guiada (#/apertura): uno por pantalla, sin campo enfocado ni teclado del teléfono; "Ayer quedaron N";
//    el teclado reemplaza el valor precargado; Anterior / Siguiente; "Ver lista" muestra lo mismo; recargar retoma el
//    borrador; "Todo igual, confirmar apertura" guarda con UNA llamada a hoja_guardar y vuelve a Hoy (Apertura ✓ Hecho).
// 3) Cierre guiado (#/cierre) a las 22:30: a ciegas (sin "quedaron"), vacío; los que faltan piden "Van en 0"; una sola
//    llamada a hoja_guardar y el resultado de siempre.
// 4) Pedir por proveedor: lista de proveedores, pantalla de uno con "Quedan N" y stepper; "Mandar pedido (n productos)"
//    crea la orden en borrador y pasa al siguiente proveedor o a Mis pedidos.
// 5) Ninguna pantalla del encargado muestra "$", precio, mínimo ni par; sin desborde a 390 px.
// Uso: node scripts/e2e-guiado.js [carpeta-de-capturas]
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { servidor, U, P, PV, base, sesion, montarApi } = require('./e2e-reposicion-datos.js');

const OUT = path.resolve(process.argv[2] || '/tmp/e2e-guiado');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });
const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1300: { viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 } };
const MANANA = new Date('2026-11-22T10:00:00-03:00');
const NOCHE = new Date('2026-11-22T22:30:00-03:00');
const UMO = ['coca', 'cerveza', 'limon', 'servilleta', 'chorizo', 'molleja', 'morcilla'];

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const abrir = async (ancho, db, reloj, ruta, esquema = 'light') => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: esquema, ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, db, errores);
    await c.addInitScript(([s]) => {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:nombre', JSON.stringify('Lucas'));
    }, [sesion(U.umo)]);
    const p = await c.newPage();
    await p.clock.setFixedTime(reloj);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|40[04] \(/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('scroller').scrollWidth <= document.getElementById('scroller').clientWidth + 1);
  const sinPlata = async (p) => { const t = await p.locator('#view').innerText(); return !/\$|precio|costo|m[ií]nimo|\bpar\b/i.test(t); };
  const llamadas = (db, fn) => db.rpc.filter(r => r.fn === fn);
  const txt = (p, sel) => p.locator(sel).innerText().then(t => t.trim()).catch(() => '');
  const tecla = (p, k) => p.locator(`.tecl [data-tecla="${k}"]`).click();

  for (const ancho of [390, 1300]) {
    const n = ancho === 390 ? 'celular' : 'pc';
    const db = base({ ahora: MANANA });

    // ===== 1) Hoy =====
    const { c, p } = await abrir(ancho, db, MANANA, '#/hoy');
    await p.waitForSelector('.hoy-top');
    await p.waitForSelector('[data-tarea]');
    ok(await txt(p, '.hoy-top .titulo') === 'Hola, Lucas', `${n}: Hoy saluda "Hola, Lucas"`);
    ok(/^Umo Grill · domingo,? 22 de noviembre/.test(await txt(p, '.hoy-top small')), `${n}: local y fecha arriba · ${await txt(p, '.hoy-top small')}`);
    const tabs = ancho === 390 ? await p.locator('.tabbar .tab span').allInnerTexts() : await p.locator('.side-nav .side-link:not(.side-out) span').allInnerTexts();
    ok(tabs.join(' · ') === 'Hoy · Mis pedidos · Más', `${n}: barra exacta "Hoy · Mis pedidos · Más" · ${tabs.join(' · ')}`);
    const primero = p.locator('.hoy-lista [data-tarea]').first();
    ok(await primero.getAttribute('data-tarea') === 'abrir' && /is-main/.test(await primero.getAttribute('class')) && await primero.getAttribute('href') === '#/apertura', `${n}: lo primero es Abrir el local, en la tinta, y lleva a #/apertura`);
    ok(await p.locator('.hoy-avance, .av-anillo').count() === 0, `${n}: sin anillo de avance`);
    ok(await sinPlata(p), `${n}: Hoy sin plata, precio, mínimo ni par`);
    if (ancho === 390) ok(await sinDesborde(p), `${n}: Hoy sin desborde`);

    // ===== 2) Apertura guiada =====
    await primero.click();
    await p.waitForSelector('.gd[data-modo="apertura"]');
    ok(await p.evaluate(() => location.hash) === '#/apertura', `${n}: Abrir → #/apertura`);
    ok(await p.locator('.gd input, .gd textarea').count() === 0 && await p.evaluate(() => !/INPUT|TEXTAREA/.test(document.activeElement.tagName)), `${n}: guiada sin campos ni foco en un campo (no abre el teclado del teléfono)`);
    ok(await p.locator('.tecl button').count() === 12, `${n}: teclado de 12 teclas`);
    const total = UMO.length;
    ok(await txt(p, '[data-guiada="n"]') === `1 de ${total}`, `${n}: "1 de ${total}"`);
    const prod1 = await txt(p, '[data-guiada="producto"]');
    ok(/^Ayer quedaron /.test(await txt(p, '[data-guiada="anterior"]')), `${n}: apertura muestra "Ayer quedaron N" · ${await txt(p, '[data-guiada="anterior"]')}`);
    ok(/^Siguiente: /.test(await txt(p, '[data-guiada="siguiente"]')), `${n}: botón "Siguiente: <producto>"`);
    ok(await p.locator('[data-guiada="atajo"]').innerText() === 'Todo igual, confirmar apertura', `${n}: atajo "Todo igual, confirmar apertura"`);
    await tecla(p, '5');
    ok((await txt(p, '[data-guiada="valor"]')).startsWith('5'), `${n}: la primera tecla reemplaza lo precargado (5)`);
    await p.locator('[data-guiada="siguiente"]').click();
    ok(await txt(p, '[data-guiada="n"]') === `2 de ${total}`, `${n}: Siguiente → 2 de ${total}`);
    await tecla(p, '1'); await tecla(p, ','); await tecla(p, '5');
    ok((await txt(p, '[data-guiada="valor"]')).startsWith('1,5'), `${n}: coma decimal (1,5)`);
    await tecla(p, 'borrar');
    ok((await txt(p, '[data-guiada="valor"]')).startsWith('1,'), `${n}: borrar saca el último dígito`);
    await p.locator('[data-guiada="anterior-btn"]').click();
    ok(await txt(p, '[data-guiada="producto"]') === prod1 && (await txt(p, '[data-guiada="valor"]')).startsWith('5'), `${n}: Anterior vuelve con el mismo valor`);
    if (ancho === 390) ok(await sinDesborde(p), `${n}: guiada sin desborde`);
    ok(await sinPlata(p), `${n}: guiada sin plata`);
    await p.screenshot({ path: path.join(OUT, `guiado-apertura-${n}.png`) });
    // Ver lista: mismo estado.
    await p.locator('[data-guiada="lista"]').click();
    await p.waitForSelector('.cd-fila');
    const idPrimero = await p.locator('.cd-fila').evaluateAll((els, nombre) => (els.find(e => e.querySelector('b').textContent === nombre) || {}).dataset.id, prod1);
    ok(await p.locator(`.cd-fila[data-id="${idPrimero}"] .cd-in`).inputValue() === '5', `${n}: Ver lista muestra el 5 cargado en la guiada (mismo estado)`);
    await p.locator('[data-accion="guiada"]').click();
    await p.waitForSelector('.gd');
    // Recargar: retoma el borrador.
    await p.reload();
    await p.waitForSelector('.gd[data-modo="apertura"]');
    ok((await txt(p, '[data-guiada="valor"]')).startsWith('5') || await txt(p, '[data-guiada="producto"]') !== prod1, `${n}: al recargar retoma el borrador`);
    const antes = llamadas(db, 'hoja_guardar').length;
    await p.locator('[data-guiada="atajo"]').click();
    await p.waitForSelector('.hoy-top');
    const gA = llamadas(db, 'hoja_guardar').slice(antes);
    ok(gA.length === 1 && gA[0].p_tipo === 'apertura' && gA[0].p_items.length === total, `${n}: una sola llamada a hoja_guardar (apertura, ${total} productos)`);
    ok(Number((gA[0].p_items.find(i => i.producto_id === idPrimero) || {}).cantidad) === 5, `${n}: guarda el 5 corregido`);
    ok(await p.evaluate(() => location.hash) === '#/hoy' && await p.locator('[data-hecho="Apertura"]').count() === 1, `${n}: vuelve a Hoy con Apertura ✓ Hecho`);
    ok(/de 7/.test(await txt(p, '[data-hecho="Apertura"]')), `${n}: lo hecho dice "n de n" · ${await txt(p, '[data-hecho="Apertura"]')}`);
    await c.close();

    // ===== 3) Cierre guiado =====
    db.opc.ahora = NOCHE;
    const k = await abrir(ancho, db, NOCHE, '#/hoy');
    await k.p.waitForSelector('[data-tarea="cerrar"]');
    ok(await k.p.locator('.hoy-lista [data-tarea]').first().getAttribute('data-tarea') === 'cerrar', `${n}: a la noche lo primero es Cerrar el día`);
    await k.p.locator('[data-tarea="cerrar"]').click();
    await k.p.waitForSelector('.gd[data-modo="cierre"]');
    ok(await txt(k.p, '[data-guiada="anterior"]') === '' && await k.p.locator('[data-guiada="atajo"]').count() === 0, `${n}: cierre a ciegas (sin "quedaron" ni atajo)`);
    ok((await txt(k.p, '[data-guiada="valor"]')).startsWith('–'), `${n}: cierre arranca vacío`);
    await tecla(k.p, '4');
    await k.p.locator('[data-guiada="siguiente"]').click();
    await tecla(k.p, '2'); await tecla(k.p, '0');
    for (let i = 2; i < total; i++) await k.p.locator('[data-guiada="siguiente"]').click();
    ok(await txt(k.p, '[data-guiada="siguiente"]') === 'Terminar cierre', `${n}: el último dice "Terminar cierre"`);
    if (ancho === 390) await k.p.screenshot({ path: path.join(OUT, `guiado-cierre-${n}.png`) });
    const antesC = llamadas(db, 'hoja_guardar').length;
    await k.p.locator('[data-guiada="siguiente"]').click();
    await k.p.waitForSelector('[data-guiada="van-en-0"]');
    ok(/5 productos sin contar\. Van en 0/.test(await txt(k.p, '.gd-confirma')), `${n}: faltantes → "Van en 0" · ${await txt(k.p, '.gd-confirma')}`);
    ok(llamadas(db, 'hoja_guardar').length === antesC, `${n}: no guarda hasta confirmar`);
    await k.p.locator('[data-guiada="van-en-0"]').click();
    await k.p.waitForSelector('.cd-ok');
    const gC = llamadas(db, 'hoja_guardar').slice(antesC);
    ok(gC.length === 1 && gC[0].p_tipo === 'cierre' && gC[0].p_items.filter(i => Number(i.cantidad) === 0).length === 5, `${n}: una sola llamada (cierre, los 5 sin contar en 0)`);
    ok(await sinPlata(k.p), `${n}: resultado del cierre sin plata`);
    await k.c.close();

    // ===== 4) Pedir por proveedor =====
    const q = await abrir(ancho, db, NOCHE, '#/pedir-prov');
    await q.p.waitForSelector('[data-prov]');
    const provs = await q.p.locator('[data-prov] .lg-n').allInnerTexts();
    ok(provs.length >= 2, `${n}: lista de proveedores · ${provs.join(' / ')}`);
    await q.p.locator(`[data-prov="${PV.barcena}"]`).click();
    await q.p.waitForSelector('.pp-row');
    ok(await q.p.evaluate(() => location.hash) === '#/pedir-prov/' + PV.barcena, `${n}: una pantalla por proveedor`);
    const subs = await q.p.locator('.pp-row-t small').allInnerTexts();
    ok(subs.length > 0 && subs.every(s => /^Quedan |Sin historial todavía/.test(s)), `${n}: cada fila con "Quedan N" · ${subs.join(' / ')}`);
    ok(await sinPlata(q.p), `${n}: pedir por proveedor sin plata, mínimo ni par`);
    if (ancho === 390) ok(await sinDesborde(q.p), `${n}: pedir por proveedor sin desborde`);
    const fila = q.p.locator('.pp-row').first();
    await fila.locator('.step-btn').last().click();
    const btnTx = await txt(q.p, '[data-accion="mandar"]');
    ok(/^Mandar pedido \(\d+ productos?\)$/.test(btnTx), `${n}: "${btnTx}"`);
    ok(await q.p.locator('[data-accion="buscar-otro"]').getAttribute('href') === '#/pedir', `${n}: "Buscar otro producto" lleva a Pedir`);
    const posts = db.posts.length;
    await q.p.locator('[data-accion="mandar"]').click();
    await q.p.waitForFunction(() => !/pedir-prov\/prv-barcena$/.test(location.hash));
    const orden = db.posts.slice(posts).find(x => x.t === 'ordenes_compra');
    ok(orden && orden.b.estado === 'borrador' && orden.b.proveedor_id === PV.barcena && orden.b.cargado_por_nombre === 'Lucas', `${n}: crea la orden de Barcena en borrador a nombre de Lucas`);
    ok(db.posts.slice(posts).some(x => x.t === 'orden_items'), `${n}: con sus productos`);
    ok(/#\/(pedir-prov\/.+|mis-pedidos)$/.test(await q.p.evaluate(() => location.hash)), `${n}: sigue con otro proveedor o Mis pedidos · ${await q.p.evaluate(() => location.hash)}`);
    // Rutas viejas siguen cargando.
    for (const r of ['hoja', 'pedir', 'revisar', 'contar', 'stock', 'lugares', 'elaborados', 'mis-pedidos', 'mas']) {
      await q.p.evaluate((x) => { location.hash = '#/' + x; }, r);
      await q.p.waitForTimeout(400);
      const h1 = await q.p.locator('#view').innerText().catch(() => '');
      ok(await q.p.evaluate((x) => location.hash === '#/' + x, r) && !/No se pudo cargar/.test(h1), `${n}: #/${r} sigue cargando`);
    }
    await q.c.close();
  }

  await browser.close(); srv.close();
  const reales = errores.filter(e => !/ruta no prevista .*(notas|conteos|ventas_import|elaboraciones|producciones)/.test(e));
  ok(!reales.length, 'sin errores de consola ni rutas sin mock' + (reales.length ? ' · ' + reales.slice(0, 4).join(' | ') : ''));
  console.log(fallas ? `\n${fallas} FAIL` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
