#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de las pantallas nuevas de gerencia: Comprar, Lo que hay (con ficha),
// Pedidos en columnas y Ajustes (días que abre cada local, 0032). Domingo 22/11/2026 a las 10: Umo cerró el sábado,
// Trento no (queda fuera del cálculo, con aviso); el Shopping no elabora y no aparece.
// API de Supabase mockeada (e2e-reposicion-datos.js) y reloj fijo. Capturas a 390 y 1300 px.
// Uso: node scripts/e2e-comprar.js [carpeta-de-capturas]
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { servidor, U, L, P, PV, base, sesion, montarApi } = require('./e2e-reposicion-datos.js');

const OUT = path.resolve(process.argv[2] || '/mnt/project-files/rediseno-sobrante/app');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const limpiar = (p) => p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); });
const shot = async (p, n) => { await limpiar(p); await p.waitForTimeout(250); return p.screenshot({ path: path.join(OUT, n + '.png') }); };
const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1300: { viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 }, 1440: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } };
const DOMINGO = new Date('2026-11-22T10:00:00-03:00');
const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const abrir = async (ancho, db, ruta) => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: 'dark', ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, db, errores);
    await c.addInitScript(([s]) => {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.setItem('stock-auth', JSON.stringify(s));
      localStorage.setItem('stock:nombre', JSON.stringify('Jacobo'));
    }, [sesion(U.ger)]);
    const p = await c.newPage();
    await p.clock.setFixedTime(DOMINGO);
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|favicon|40[04] \(/i.test(m.text())) errores.push(`console: ${m.text()}`); });
    await p.goto(BASE + ruta);
    return { c, p };
  };
  const sinDesborde = (p) => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  const ir = async (p, ruta, sel) => { await p.goto(BASE + ruta); await p.waitForSelector(sel); await p.waitForTimeout(400); };

  for (const ancho of [390, 1300]) {
    const n = ancho === 390 ? 'celular' : 'pc';
    const A = ancho === 390;
    const db = base({ ahora: DOMINGO });
    const { c, p } = await abrir(ancho, db, '#/comprar');
    await p.waitForSelector('.cq-kpis');
    await p.waitForSelector('.cq-prov');
    await p.waitForTimeout(400);
    // ---- Comprar ----
    const kpis = await p.locator('.cq-kpi').allInnerTexts();
    const k = kpis.map(x => x.replace(/\s+/g, ' ').trim());
    if (A) {
      const tabs = (await p.locator('.tabbar .tab').allInnerTexts()).map(x => x.trim()).join(',');
      ok(tabs === 'Inicio,Stock,Pedidos,Costos,Más' && await p.locator('.tab.is-active').getAttribute('data-nav') === 'pedidos', 'barra de gerencia: Inicio · Stock · Pedidos · Costos · Más (Comprar queda marcada en Pedidos) · ' + tabs);
      ok(/Compra de la semana \$/.test(k[0]), 'KPI compra de la semana en pesos · ' + k[0]);
      ok(/^Para hoy \d+ no alcanzan para el domingo/.test(k[1]), 'KPI urgentes: Umo cerró el sábado y abre hoy → "Para hoy" · ' + k[1]);
      ok(k.length === 3 && !k.some(x => /Cierres de anoche/.test(x)), 'quedan 3 KPI, sin la de cierres · ' + k.length);
      ok(/^cierres de anoche falta 1 cierre/i.test((await p.locator('.cc').innerText()).replace(/\s+/g, ' ')), 'panel de cierres: "Falta 1 cierre"');
      ok(await p.evaluate(() => { const v = document.querySelector('#view'); const c = v.querySelector('.cc'), k = v.querySelector('.cq-kpis'); return !!(c.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'el panel va antes de las KPI');
      ok(await p.locator('.cc-barra[role="img"][aria-label="1 de 2 cierres hechos"] i').count() === 2, 'barra: 2 segmentos, "1 de 2 cierres hechos"');
      ok(/Trento Café sin cierre/.test((await p.locator('.cc-locs li', { hasText: 'Trento' }).innerText()).replace(/\s+/g, ' ')), 'panel: Trento Café sin cierre');
      ok(await p.locator('.cc-locs li .cc-tag.is-hecho').count() === 1, 'panel: Umo con cierre hecho');
      ok(!/Shopping/.test(await p.locator('#view').innerText()), 'el Shopping (no elabora) no aparece en Comprar');
      ok(await p.locator('.cq-tabla td.cq-loc', { hasText: 'Trento' }).count() === 0, 'Trento sin cierre queda fuera de la tabla');
      const provs = await p.locator('.cq-prov').evaluateAll(xs => xs.map(x => x.getAttribute('data-prov')));
      ok(provs.includes('Martín De Ridder') && provs.includes('Barcena') && provs.includes('Distribuidora Florida') && provs.includes('Sin proveedor'), 'una tabla por proveedor · ' + provs.join(', '));
      ok(/mínimo de \$\s?100\.000: faltan/.test(await p.locator('.cq-prov[data-prov="Martín De Ridder"]').innerText()), 'Martín De Ridder: aviso del mínimo de $ 100.000');
      ok(await p.locator('.cq-prov[data-prov="Sin proveedor"] .cq-armar').count() === 0, 'sin proveedor: sin "Armar orden" y con aviso');
      ok(await p.locator('.cq-tabla tr[data-id="limon"] .cd-pill.p-rojo').count() === 1, 'Limones urgente: quedó 1 kg y se usan 2 por día, abre hoy');
      ok(await p.locator('.cq-tabla tr[data-id="coca"] .cd-pill.p-amar').count() === 1, 'Coca "semana": 12 del cierre + 24 que llegaron alcanzan para hoy');
      ok(await sinDesborde(p), '390: sin scroll horizontal en Comprar');
    } else {
      ok(await p.locator('.app.vista-ancha').count() === 1, '1300: Comprar usa la vista ancha');
    }
    await shot(p, `05-comprar-${n}`);
    // Armar orden de Barcena → Cargar pedido de Umo con esas cantidades y lo de otros proveedores en 0.
    if (A) {
      const esperado = {};
      for (const tr of await p.locator('.cq-prov[data-prov="Barcena"] tbody tr').all()) esperado[await tr.getAttribute('data-id')] = num((await tr.locator('.cq-pedir').innerText()).split(' ')[0]);
      await p.locator('.cq-prov[data-prov="Barcena"] .cq-armar').click();
      await p.waitForFunction(() => location.hash === '#/cargar');
      await p.waitForSelector('.prod[data-id="chorizo"]');
      await p.waitForTimeout(400);
      const dif = [];
      for (const [id, v] of Object.entries(esperado)) { const x = num(await p.locator(`.prod[data-id="${id}"] .step-val`).inputValue()); if (x !== v) dif.push(`${id}: ${v} vs ${x}`); }
      ok(Object.keys(esperado).length > 0 && !dif.length, 'Armar orden: Cargar viene con lo de Barcena · ' + JSON.stringify(esperado) + (dif.length ? ' · ' + dif.join(' | ') : ''));
      const coca = await p.locator('.prod[data-id="coca"] .step-val').count() ? await p.locator('.prod[data-id="coca"] .step-val').inputValue() : '';
      ok(coca === '0' || coca === '', 'lo de otros proveedores queda en 0 · coca ' + coca);
      ok(/Umo Grill/.test(await p.locator('#view').innerText()), 'Cargar queda en Umo Grill');
    }
    // ---- Lo que hay ----
    await ir(p, '#/hay', '.cq-matriz tbody tr');
    if (A) {
      const cols = (await p.locator('.cq-matriz thead th').allInnerTexts()).map(x => x.trim()).join(',');
      ok(cols === 'Producto,Trento Café,Umo Grill,Total,Valor,Tendencia', 'matriz por local (sin el Shopping) · ' + cols);
      ok(/Último cierre/.test(await p.locator('.titulo, h1').first().locator('xpath=..').innerText()), 'dice de qué cierre son los números');
      const b = p.locator('.input-search');
      await b.click(); await b.pressSequentially('coca', { delay: 40 });
      await p.waitForTimeout(250);
      ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('input-search')), 'buscar no pierde el foco al escribir');
      ok(await p.locator('.cq-matriz tbody tr').count() === 1, 'buscar "coca": una fila (la misma Coca en los dos locales)');
      ok(await p.locator('.cq-matriz tbody tr .spark').count() === 1, 'Coca con tendencia (varios cierres)');
      await b.fill('');
      await p.waitForTimeout(200);
      ok(await p.locator('.cq-matriz tbody tr[data-clave] .cq-cero').count() > 0, 'productos que no están en un local se marcan con ·');
    }
    await shot(p, `06-lo-que-hay-${n}`);
    // Ficha de producto
    await p.locator('.input-search').fill('coca');
    await p.waitForTimeout(250);
    await p.locator('.cq-matriz tbody tr').first().click();
    await p.waitForSelector('dialog.sheet[open] .fi-graf');
    if (A) {
      const t = await p.locator('dialog.sheet[open]').innerText();
      ok(/se usa por día abierto/.test(t) && /alcanza/.test(t) && /Lo que quedó en los últimos \d+ cierres/.test(t), 'ficha: quedan, uso por día, alcanza y los últimos cierres');
      ok(await p.locator('dialog.sheet[open] .fi-locales .chip').count() === 2, 'ficha: se puede cambiar de local (Umo / Trento)');
      await p.locator('dialog.sheet[open] .fi-locales .chip[data-local="' + L.tre + '"]').click();
      ok(await p.locator('dialog.sheet[open] .fi-locales .chip.is-on').innerText() === 'Trento Café', 'ficha: cambia a Trento');
      await p.locator('dialog.sheet[open] .fi-locales .chip[data-local="' + L.umo + '"]').click();
    }
    await shot(p, `07-ficha-producto-${n}`);
    await p.keyboard.press('Escape');
    // ---- Pedidos ----
    await ir(p, '#/pedidos', A ? '#view' : '.kb');
    if (A) ok(await p.locator('.kb').count() === 0, '390: Pedidos sigue en lista (sin columnas)');
    else {
      const cols = await p.locator('.kb-col').evaluateAll(xs => xs.map(x => x.getAttribute('data-col')));
      ok(cols.join(',') === 'aprobar,enviado,recibido', '1300: Pedidos en tres columnas · ' + cols.join(','));
      ok(await p.locator('.kb-col[data-col="aprobar"] .kb-card').count() === 1 && await p.locator('.kb-col[data-col="enviado"] .kb-card').count() === 1, 'el borrador de Trento por aprobar, la orden de Florida enviada');
      await shot(p, `08-pedidos-columnas-${n}`);
      await p.locator('.kb-col[data-col="aprobar"] .kb-card').first().click();
      ok(await p.waitForSelector('dialog.sheet[open]').then(() => true, () => false), 'una tarjeta abre el detalle');
      await p.keyboard.press('Escape');
    }
    if (A) await shot(p, `08-pedidos-${n}`);
    // ---- Ajustes ----
    await ir(p, '#/ajustes', '.aj-local');
    if (A) {
      ok(await p.locator('.aj-local').count() === 3, 'Ajustes: un bloque por local');
      ok(/Soberanía/.test(await p.locator('#view').innerText()), 'Ajustes: próximos feriados (23/11 Soberanía Nacional)');
      ok(/Abre hoy/.test(await p.locator(`.aj-local[data-local="${L.umo}"]`).innerText()), 'Ajustes: Umo abre hoy (domingo)');
      await p.locator(`.aj-local[data-local="${L.tre}"] .chip[data-dia="4"]`).click();
      await p.waitForFunction(() => document.querySelector('.aj-local .chip[data-dia="4"]:not([disabled])'));
      await p.waitForTimeout(300);
      const pa = db.patches.find(x => x.id === L.tre);
      ok(pa && JSON.stringify(pa.b.dias_abre) === '[0,4,5,6]' && pa.b.abre_feriados === true, 'Trento: agregar jueves guarda dias_abre [0,4,5,6] · ' + JSON.stringify(pa && pa.b));
      ok(await p.locator(`.aj-local[data-local="${L.tre}"] .chip[data-dia="4"][aria-pressed="true"]`).count() === 1, 'el jueves queda marcado');
      ok(!/falta pegar en Supabase/.test(await p.locator('#view').innerText()), 'con 0032 no hay aviso');
      ok(await sinDesborde(p), '390: sin scroll horizontal en Ajustes');
    }
    await shot(p, `09-ajustes-${n}`);
    await c.close();
  }

  // ---- Panel "Cierres de anoche": parciales, ninguno y un local elegido (compacto), a 390 y 1440 ----
  for (const ancho of [390, 1440]) {
    const n = ancho === 390 ? 'celular' : 'pc';
    {
      const { c, p } = await abrir(ancho, base({ ahora: DOMINGO }), '#/comprar');
      await p.waitForSelector('.cq-prov'); await p.waitForTimeout(400);
      if (ancho === 390) {
        const r = await p.evaluate(() => { const t = document.querySelector('.cc-t').getBoundingClientRect(), k = document.querySelector('.cc-cont').getBoundingClientRect(); return k.top >= t.bottom; });
        ok(r, '390: el contador queda debajo del título');
        ok(await p.evaluate(() => getComputedStyle(document.querySelector('.cc-locs')).gridTemplateColumns.split(' ').length === 1), '390: locales en 1 columna');
        ok(await sinDesborde(p), '390: sin scroll horizontal con el panel');
      }
      await shot(p, `10-cierres-parciales-${n}`);
      // Un local elegido: el panel muestra solo ese local (Umo cerró → renglón compacto).
      await p.locator('.sel-local').click();
      await p.locator(`dialog.sheet [data-local="${L.umo}"]`).first().click();
      await p.waitForTimeout(400);
      ok(await p.locator('.cc.is-compacto').count() === 1 && await p.locator('.cc-barra i').count() === 1, n + ': con Umo elegido el panel queda compacto, 1/1');
      await shot(p, `12-cierres-un-local-${n}`);
      await c.close();
    }
    {
      const db = base({ ahora: DOMINGO });
      db.hoja = db.hoja.filter(m => !(m.fecha === '2026-11-21' && m.tipo === 'cierre'));
      const { c, p } = await abrir(ancho, db, '#/comprar');
      await p.waitForSelector('.cc'); await p.waitForTimeout(600);
      ok(/Ningún local hizo el cierre/.test(await p.locator('.cc-t').innerText()), n + ': 0 cierres → "Ningún local hizo el cierre"');
      ok(!/Sin cierres para calcular/.test(await p.locator('#view').innerText()), n + ': sin el vacío viejo');
      ok(await p.locator('.cq-kpi.is-sin').count() === 2, n + ': 0 cierres → compra y urgentes en gris');
      ok(await p.locator('.cc-barra[aria-label="0 de 2 cierres hechos"]').count() === 1, n + ': barra "0 de 2 cierres hechos"');
      await shot(p, `11-cierres-ninguno-${n}`);
      await c.close();
    }
  }

  // ---- Sin 0032: Ajustes avisa y no deja guardar; Comprar calcula con vie · sáb · dom ----
  {
    const db = base({ sin0032: true, ahora: DOMINGO });
    const { c, p } = await abrir(390, db, '#/ajustes');
    await p.waitForSelector('.aj-local');
    ok(/0032_dias_abre_cierre_stock\.sql/.test(await p.locator('#view').innerText()), 'sin 0032: aviso de que falta el SQL');
    ok(await p.locator('.aj-local .chip[disabled]').count() === 21, 'sin 0032: los días no se pueden tocar');
    await ir(p, '#/comprar', '.cq-prov');
    ok(/^Para hoy/.test((await p.locator('.cq-kpi').nth(1).innerText()).trim()), 'sin 0032 Comprar igual calcula (vie · sáb · dom y feriados)');
    ok(!db.patches.length, 'sin 0032 no intenta guardar');
    await c.close();
  }

  // ---- Con 0033: WhatsApp por local y la sección de Ara (dirección, token, ejemplo) ----
  for (const ancho of [390, 1300]) {
    const db = base({ con0033: true, ahora: DOMINGO });
    const { c, p } = await abrir(ancho, db, '#/ajustes');
    await p.waitForSelector('.aj-ara .aj-token');
    const n = ancho === 390 ? 'celular' : 'pc';
    if (ancho === 390) {
      ok(await p.locator(`.aj-local[data-local="${L.umo}"] .aj-wa-in`).inputValue() === '5491122223333', '0033: Umo muestra su WhatsApp');
      ok(await p.locator(`.aj-local[data-local="${L.shp}"] .aj-wa-in`).count() === 0, '0033: el Shopping no tiene aviso de cierre');
      await p.locator(`.aj-local[data-local="${L.tre}"] .aj-wa-in`).fill('11 4444-5555, +54 9 11 6666 7777');
      await p.locator(`.aj-local[data-local="${L.tre}"] .aj-wa-btn`).click();
      await p.waitForTimeout(400);
      const pa = db.patches.find(x => x.id === L.tre && x.b.avisos_whatsapp);
      ok(pa && JSON.stringify(pa.b.avisos_whatsapp) === '["5491144445555","5491166667777"]', '0033: guarda los números normalizados · ' + JSON.stringify(pa && pa.b));
      ok(/rest\/v1\/rpc\/cierres_pendientes/.test(await p.locator('.aj-ara').innerText()), '0033: muestra la dirección para Ara');
      ok(/a{64}/.test(await p.locator('.aj-token').innerText()), '0033: muestra el token');
      ok(!/0033_avisos_whatsapp/.test(await p.locator('#view').innerText()), '0033: sin aviso de SQL');
      ok(await sinDesborde(p), '390: sin scroll horizontal con la sección de Ara');
    }
    await p.locator('.aj-ara').scrollIntoViewIfNeeded();
    await shot(p, `13-ajustes-ara-${n}`);
    await c.close();
  }
  // ---- Sin 0033 (con 0032): aviso de SQL, sin sección de Ara, campos de WhatsApp bloqueados ----
  {
    const db = base({ ahora: DOMINGO });
    const { c, p } = await abrir(390, db, '#/ajustes');
    await p.waitForSelector('.aj-local'); await p.waitForTimeout(500);
    ok(/0033_avisos_whatsapp\.sql/.test(await p.locator('#view').innerText()), 'sin 0033: aviso de que falta el SQL');
    ok(await p.locator('.aj-ara .aj-token').count() === 0, 'sin 0033: no muestra la sección de Ara');
    ok(await p.locator('.aj-wa-in[disabled]').count() === 2, 'sin 0033: WhatsApp no se puede tocar');
    await c.close();
  }

  await browser.close(); srv.close();
  if (errores.length) { console.log('\nErrores de consola/página:'); for (const e of [...new Set(errores)]) console.log(' - ' + e); }
  const total = fallas + (errores.length ? 1 : 0);
  console.log(total ? `\n${total} FALLA(S) · capturas en ${OUT}` : `\nTodo OK · capturas en ${OUT}`);
  process.exit(total ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
