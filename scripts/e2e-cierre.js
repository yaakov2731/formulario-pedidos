#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de la Hoja nueva del encargado (0032_dias_abre_cierre_stock.sql).
// Domingo 22/11/2026, el lunes 23/11 es feriado y Umo abre los feriados: lo que falta es "para mañana".
// 1) Apertura precargada con el cierre del sábado + lo que llegó (Coca 12 + 24); se corrige un producto y se guarda con
//    una sola llamada a hoja_guardar. 2) Cierre: lo que no se cuenta va en 0 (con confirmación), una sola llamada.
// 3) Resultado: urgentes "para mañana", sin historial aparte, sin plata. 4) "Armar el pedido" abre Pedir con las mismas
//    cantidades. 5) Sin 0032 (locales sin dias_abre, sin rpc hoja_guardar): guarda con hoja_contar por lugar y calcula
//    con vie · sáb · dom y feriados. 6) Cierre después de medianoche: se guarda con la fecha del domingo.
// API de Supabase mockeada (e2e-reposicion-datos.js) y reloj fijo. Capturas a 390 y 1300 px.
// Uso: node scripts/e2e-cierre.js [carpeta-de-capturas]
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { servidor, U, P, HOY, base, sesion, montarApi } = require('./e2e-reposicion-datos.js');

const OUT = path.resolve(process.argv[2] || '/mnt/project-files/rediseno-sobrante/app');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const limpiar = (p) => p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); });
const shot = async (p, n, full = false) => { await limpiar(p); await p.waitForTimeout(250); return p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full }); };
const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1300: { viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 } };
const DOMINGO = new Date('2026-11-22T10:00:00-03:00');
const DOMINGO_NOCHE = new Date('2026-11-22T22:30:00-03:00');
const LUNES_MADRUGADA = new Date('2026-11-23T01:30:00-03:00');

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const abrir = async (ancho, db, reloj, ruta) => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: 'dark', ...ANCHOS[ancho] });
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
  const inp = (p, id) => p.locator(`.cd-fila[data-id="${id}"] .cd-in`);
  const btn = (p) => p.locator('.cd-btn').innerText();
  const llamadas = (db, fn) => db.rpc.filter(r => r.fn === fn);
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const CIERRE = { coca: '4', cerveza: '20', limon: '0,5', chorizo: '6', molleja: '1', morcilla: '1' };

  for (const ancho of [390, 1300]) {
    const n = ancho === 390 ? 'celular' : 'pc';
    const db = base({ ahora: DOMINGO });
    const { c, p } = await abrir(ancho, db, DOMINGO, '#/hoja');
    await p.waitForSelector('.cd-fila');
    await p.waitForTimeout(300);
    const A = ancho === 390;
    // ---- 1) Apertura precargada ----
    if (A) {
      ok(await p.locator('.seg-b[data-modo="apertura"].is-on').count() === 1, 'a las 10 sin nada contado abre en Apertura');
      ok(await inp(p, 'coca').inputValue() === '36' && await inp(p, 'cerveza').inputValue() === '22' && await inp(p, 'chorizo').inputValue() === '5',
        'apertura precargada: Coca 12 del cierre + 24 que llegaron = 36; cerveza 22; chorizo 5');
      ok(/sábado/i.test(await p.locator('.cd-nota').first().innerText()) && /llegó después/.test(await p.locator('.cd-nota').first().innerText()), 'la nota dice que viene del cierre del sábado y lo que llegó');
      ok(/Todo igual, confirmar apertura/.test(await btn(p)), 'sin cambios: "Todo igual, confirmar apertura"');
      const grupos = await p.locator('.cd-grupo').evaluateAll(xs => xs.map(x => x.getAttribute('data-sector')));
      ok(JSON.stringify(grupos) === '["Barra","Cocina"]', 'una lista por lugar · ' + grupos.join(','));
      ok(await sinDesborde(p), '390: sin scroll horizontal en la apertura');
    }
    await shot(p, `01-hoja-apertura-${n}`);
    await inp(p, 'limon').fill('1,5');
    if (A) ok(/Guardar apertura \(1 corregido\)/.test(await btn(p)), 'con una corrección: "Guardar apertura (1 corregido)" · ' + await btn(p));
    await p.locator('.cd-btn').click();
    await p.waitForSelector('.seg-b[data-modo="cierre"].is-on');
    if (A) {
      const g = llamadas(db, 'hoja_guardar');
      const it = g.length ? Object.fromEntries(g[0].p_items.map(x => [x.producto_id, x.cantidad])) : {};
      ok(g.length === 1 && g[0].p_tipo === 'apertura' && g[0].p_fecha === HOY && it.limon === 1.5 && it.coca === 36, 'la apertura se guarda con una sola llamada (limón 1,5 corregido, Coca 36)');
      ok(llamadas(db, 'hoja_contar').length === 0, 'con 0032 no usa hoja_contar');
      ok(/mañana/.test(await p.locator('.cd-prox').innerText()), 'en el cierre: próxima apertura "mañana" (lunes feriado) · ' + (await p.locator('.cd-prox').innerText()).replace(/\s+/g, ' '));
      ok(await inp(p, 'coca').inputValue() === '', 'el cierre es a ciegas: arranca vacío');
    }
    // ---- 2) Cierre ----
    for (const [id, v] of Object.entries(CIERRE)) await inp(p, id).fill(v);
    if (A) ok(/Terminar cierre \(1 sin contar van en 0\)/.test(await btn(p)), 'el botón avisa lo que va en 0 · ' + await btn(p));
    await p.locator(`.cd-fila[data-id="chorizo"]`).scrollIntoViewIfNeeded();
    await shot(p, `02-hoja-cierre-${n}`);
    await p.locator('.cd-btn').click();
    await p.waitForSelector('.cd-confirma:not([hidden])');
    if (A) ok(/Van en 0/.test(await p.locator('.cd-confirma').innerText()), 'confirmación: lo que falta va en 0');
    await p.locator('.cd-confirma .btn-primary').click();
    await p.waitForSelector('.cd-ok');
    await p.waitForTimeout(300);
    // ---- 3) Resultado ----
    const res = {};
    for (const f of await p.locator('.cd-fila-res').all()) res[await f.getAttribute('data-id')] = (await f.locator('.cd-pedir b').innerText()).replace('Pedir ', '');
    if (A) {
      const g = llamadas(db, 'hoja_guardar');
      const ci = g[g.length - 1];
      const it = Object.fromEntries(ci.p_items.map(x => [x.producto_id, [x.sector, x.cantidad]]));
      ok(g.length === 2 && ci.p_tipo === 'cierre' && ci.p_fecha === HOY, 'el cierre se guarda con una sola llamada a hoja_guardar');
      ok(it.servilleta && it.servilleta[1] === 0 && it.limon[1] === 0.5 && it.chorizo[0] === 'Cocina' && it.coca[0] === 'Barra', 'lo no contado va en 0 y cada producto con su lugar · ' + JSON.stringify(it));
      const txt = await p.locator('#view').innerText();
      ok(/Comprar para mañana/.test(txt), 'resultado: "Comprar para mañana" (el lunes feriado abre)');
      ok(/lunes/i.test(await p.locator('.cd-ok .sub').innerText()), 'para abrir el lunes · ' + await p.locator('.cd-ok .sub').innerText());
      ok(await p.locator('.cd-res-rojo .cd-fila-res[data-id="coca"]').count() === 1, 'Coca: quedan 4 y se usan 18 por día → urgente');
      ok(/1 sin historial/.test(txt) && !res.morcilla, 'la morcilla (2 días contados) queda "sin historial", sin número inventado');
      ok(!/\$|precio|costo/i.test(txt), 'el encargado no ve plata');
      ok(Object.keys(res).length >= 2, 'hay cosas para pedir · ' + JSON.stringify(res));
      ok(await sinDesborde(p), '390: sin scroll horizontal en el resultado');
    }
    await shot(p, `03-resultado-cierre-${n}`, A);
    // ---- 4) Armar el pedido: Pedir con las mismas cantidades ----
    await p.locator('.cd-armar').click();
    await p.waitForFunction(() => location.hash === '#/pedir');
    await p.waitForSelector('.prod[data-id="coca"]');
    await p.waitForTimeout(400);
    if (A) {
      const dif = [];
      for (const [id, v] of Object.entries(res)) { const x = await p.locator(`.prod[data-id="${id}"] .step-val`).inputValue(); if (x.replace('.', ',') !== v) dif.push(`${id}: resultado ${v}, Pedir ${x}`); }
      ok(!dif.length, 'Pedir viene con las mismas cantidades del resultado' + (dif.length ? ' · ' + dif.join(' | ') : ''));
      ok(/Armado con el cierre/.test(await p.locator('#view').innerText()), 'Pedir avisa que viene armado con el cierre');
      ok(!/\$|precio|costo/i.test(await p.locator('#view').innerText()), 'Pedir sin plata');
      ok(await p.locator('.prod[data-id="coca"] .cd-pill.p-rojo').count() === 1, 'Coca marcada urgente en Pedir');
    }
    await shot(p, `04-pedir-precargado-${n}`);
    await c.close();
  }

  // ---- 5) Sin 0032: locales sin dias_abre y sin hoja_guardar ----
  {
    const db = base({ sin0032: true, ahora: DOMINGO_NOCHE });
    const { c, p } = await abrir(390, db, DOMINGO_NOCHE, '#/hoja');
    await p.waitForSelector('.cd-fila');
    ok(await p.locator('.seg-b[data-modo="cierre"].is-on').count() === 1, 'sin 0032, 22:30: abre en Cierre');
    ok(/mañana/.test(await p.locator('.cd-prox').innerText()), 'sin dias_abre usa vie · sáb · dom y feriados: próxima apertura mañana');
    for (const id of Object.keys(P).filter(k => P[k].local_id === 'loc-umo')) await inp(p, id).fill(CIERRE[id] || '2');
    await p.locator('.cd-btn').click();
    await p.waitForSelector('.cd-ok');
    const cs = llamadas(db, 'hoja_contar');
    ok(llamadas(db, 'hoja_guardar').length === 1 && cs.length === 2 && cs.every(x => x.p_tipo === 'cierre' && x.p_fecha === HOY) && cs.map(x => x.p_sector).sort().join() === 'Barra,Cocina',
      'sin hoja_guardar: guarda con hoja_contar, una por lugar · ' + cs.map(x => x.p_sector).join(','));
    ok(db.log.some(l => l.t === 'locales' && /dias_abre/.test(l.sel)) && db.log.some(l => l.t === 'locales' && !/dias_abre/.test(l.sel)), 'locales: prueba con dias_abre y cae al pedido viejo');
    ok(/Comprar para mañana/.test(await p.locator('#view').innerText()), 'sin 0032 el resultado igual calcula "para mañana"');
    await c.close();
  }

  // ---- 6) Cierre después de medianoche: fecha del domingo ----
  {
    const db = base({ ahora: LUNES_MADRUGADA });
    const { c, p } = await abrir(390, db, LUNES_MADRUGADA, '#/hoja');
    await p.waitForSelector('.cd-fila');
    ok(await p.locator('.seg-b[data-modo="cierre"].is-on').count() === 1, '01:30 del lunes: sigue la jornada del domingo, en Cierre');
    ok(/domingo/i.test(await p.locator('.titulo, h1').first().innerText()) || /domingo/i.test(await p.locator('#view').innerText()), 'el título muestra el domingo');
    for (const id of Object.keys(P).filter(k => P[k].local_id === 'loc-umo')) await inp(p, id).fill(CIERRE[id] || '2');
    await p.locator('.cd-btn').click();
    await p.waitForSelector('.cd-ok');
    const g = llamadas(db, 'hoja_guardar');
    ok(g.length === 1 && g[0].p_fecha === '2026-11-22', 'el cierre de la 01:30 se guarda con p_fecha = domingo 22/11 · ' + (g[0] && g[0].p_fecha));
    await c.close();
  }

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); for (const e of [...new Set(errores)]) console.log(' - ' + e); }
  const total = fallas + (errores.length ? 1 : 0);
  console.log(total ? `\n${total} FALLA(S) · capturas en ${OUT}` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
