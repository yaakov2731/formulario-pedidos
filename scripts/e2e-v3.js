// Prueba de punta a punta V3 en Chromium contra la planilla en memoria. Manual, no corre en CI.
// 1) node scripts/v3-dev-server.js --seed     2) node scripts/e2e-v3.js [carpeta-de-capturas]
// Requiere Playwright y Chromium instalados. No escribe en ninguna planilla real.
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const BASE = process.env.V3_BASE || 'http://localhost:8787';
const SHOTS = path.resolve(process.argv[2] || require('node:os').tmpdir());
const EXEC = process.env.CHROMIUM_PATH || (require('node:fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const errors = [];
const step = (m) => console.log('·', m);

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const hook = (page, tag) => {
    page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|favicon/i.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  };
  const blockFonts = async (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

  // ---------- Encargado: Umo Grill, celular ----------
  const enc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await blockFonts(enc);
  const p = await enc.newPage(); hook(p, 'encargado');
  await p.goto(BASE + '/?api=/api');
  await p.getByRole('button', { name: 'Umo Grill' }).click();
  await p.locator('#enc-otro').fill('Ayelén');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.getByRole('heading', { name: /Hola, Ayelén/ }).waitFor();
  step('login encargado ok');
  await p.screenshot({ path: SHOTS + '/01-hoy.png', fullPage: true });

  // Contar
  await p.goto(BASE + '/#contar');
  await p.getByLabel(/Cantidad contada de Asado en kg/).fill('4');
  await p.getByLabel(/Cantidad contada de Tomate en kg/).fill('1,5');
  await p.getByLabel(/Cantidad contada de Lechuga en atado/).fill('2');
  await p.getByLabel(/No queda: Crema en cero/).click();
  await p.screenshot({ path: SHOTS + '/02-contar.png', fullPage: true });
  await p.getByRole('link', { name: 'Revisar' }).click();
  await p.getByRole('button', { name: /Guardar conteo/ }).click();
  await p.waitForFunction(() => location.hash.startsWith('#hoy') || /guardad/i.test(document.body.innerText), null, { timeout: 15000 });
  step('conteo guardado: ' + (await p.evaluate(() => location.hash)));

  // Pedir con sugeridos
  await p.goto(BASE + '/#pedir');
  await p.getByRole('button', { name: /Cargar sugerido/ }).first().waitFor();
  const sugs = p.getByRole('button', { name: /Cargar sugerido/ });
  const nSug = await sugs.count();
  for (let i = 0; i < nSug; i++) await sugs.nth(i).click();
  const chipN = await p.locator('.chip-sugeridos .chip-n').innerText();
  if (Number(chipN) !== nSug) errors.push('chip Sugeridos muestra ' + chipN + ' y hay ' + nSug);
  await p.getByLabel(/Cantidad de Chorizo en kg/).fill('3');
  await p.screenshot({ path: SHOTS + '/03-pedir.png', fullPage: true });
  await p.getByRole('link', { name: /Revisar pedido/ }).click();
  await p.screenshot({ path: SHOTS + '/04-revisar.png', fullPage: true });
  await p.getByRole('button', { name: 'Enviar pedido' }).click();
  await p.getByText(/PED-\d{8}/).first().waitFor({ timeout: 15000 });
  step('pedido Umo enviado (' + nSug + ' sugeridos): ' + (await p.getByText(/PED-\d{8}/).first().innerText()).trim());
  await p.screenshot({ path: SHOTS + '/05-pedido-ok.png', fullPage: true });

  // ---------- Pedido de Trento por API (segundo local) ----------
  const tr = await (await fetch(BASE + '/api?action=getCatalogo&local=' + encodeURIComponent('Trento Café'))).json();
  const tomate = tr.productos.find(x => x.producto === 'Tomate');
  const r2 = await (await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify({ action: 'savePedido', id_pedido: 'PED-20261018-100000-tr01', local: 'Trento Café', encargado: 'Nadia', prioridad: 'Urgente', items: [{ codigo: tomate.codigo, cantidad: 10 }] }) })).json();
  step('pedido Trento por API: ' + r2.ok);

  // ---------- Compras: escritorio ----------
  const adm = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await blockFonts(adm);
  const c = await adm.newPage(); hook(c, 'compras');
  await c.goto(BASE + '/compras.html?api=/api');
  await c.locator('#cx-clave').fill('mal');
  await c.locator('#cx-entrar').click();
  await c.getByText(/clave|incorrect|inválid/i).first().waitFor();
  step('clave incorrecta rechazada');
  await c.locator('#cx-clave').fill('dev');
  await c.locator('#cx-entrar').click();
  await c.getByRole('button', { name: /Armar orden/ }).first().waitFor({ timeout: 15000 });
  await c.screenshot({ path: SHOTS + '/06-compras.png', fullPage: true });
  const resp = c.getByLabel(/Responsable|Quién compra|Comprador/i).first();
  if (await resp.count()) await resp.fill('Gerencia');
  const bloques = await c.getByRole('button', { name: /Armar orden/ }).count();
  step('bloques de proveedor con "Armar orden": ' + bloques);
  // Armar la orden de Distribuidora Florida
  const florida = c.locator('section, article, div.grupo, .prov-block').filter({ hasText: 'Distribuidora Florida' }).filter({ has: c.getByRole('button', { name: /Armar orden/ }) }).last();
  await florida.getByRole('button', { name: /Armar orden/ }).click();
  await c.locator('#dlg-wa-abrir').waitFor({ state: 'visible', timeout: 15000 });
  const wa = await c.locator('dialog[open] textarea').first().inputValue();
  const href = await c.locator('#dlg-wa-abrir').getAttribute('href');
  await c.screenshot({ path: SHOTS + '/07-whatsapp.png' });
  step('orden creada. Link: ' + href.slice(0, 40) + '…');
  console.log(wa.split('\n').map(l => '    | ' + l).join('\n'));
  const listo = c.getByRole('button', { name: /^(Listo|Cerrar)$/ }).first();
  await listo.click();

  // ---------- Encargado recibe con faltante ----------
  await p.goto(BASE + '/#recibir');
  await p.getByRole('button', { name: 'Llegó todo' }).first().waitFor({ timeout: 15000 });
  await p.getByRole('button', { name: 'Llegó todo' }).first().click();
  const inp = p.getByLabel(/Cantidad recibida de Chorizo en kg/);
  await inp.fill('2');
  await p.screenshot({ path: SHOTS + '/08-recibir.png', fullPage: true });
  await p.getByRole('button', { name: /Guardar recepción/ }).click();
  await p.getByText(/incomplet/i).first().waitFor({ timeout: 15000 });
  step('recepción guardada con faltante');
  await p.screenshot({ path: SHOTS + '/09-recibido.png', fullPage: true });

  // ---------- Compras: faltantes y stock ----------
  await c.goto(BASE + '/compras.html#faltantes');
  await c.getByText('Chorizo').first().waitFor({ timeout: 15000 });
  step('faltante visible en Compras');
  await c.screenshot({ path: SHOTS + '/10-faltantes.png', fullPage: true });
  await c.goto(BASE + '/compras.html#stock');
  await c.getByText('Asado').first().waitFor({ timeout: 15000 });
  await c.screenshot({ path: SHOTS + '/11-stock.png', fullPage: true });

  // ---------- Verificación en la "planilla" ----------
  const stock = await (await fetch(BASE + '/api?action=getStockPanel&local=Umo%20Grill')).json();
  const by = n => stock.filas.find(f => f.producto === n);
  console.log('  stock Umo:', ['Asado', 'Chorizo', 'Tomate', 'Crema'].map(n => `${n}=${by(n).stock_actual} (${by(n).estado})`).join(' · '));
  const ord = await (await fetch(BASE + '/api?action=getOrdenes')).json();
  console.log('  órdenes:', ord.ordenes.map(o => `${o.proveedor}: ${o.estado}`).join(' · '));

  // Scroll horizontal
  for (const [pg, tag] of [[p, 'encargado'], [c, 'compras']]) {
    const w = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (w > 1) errors.push(`${tag}: scroll horizontal de ${w}px`);
  }
  await browser.close();
  if (errors.length) { console.log('ERRORES:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log('E2E OK: sin errores de JS ni scroll horizontal.');
})().catch(async e => { console.error('FALLO:', e.message); console.log(errors.join('\n')); process.exitCode = 1; process.exit(1); });
