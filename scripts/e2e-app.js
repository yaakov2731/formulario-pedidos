// Prueba de punta a punta de la app nueva (app/) en Chromium contra la planilla en memoria. Manual, no corre en CI.
// 1) node scripts/v3-dev-server.js --seed     2) node scripts/e2e-app.js [carpeta-de-capturas] [--dark]
// Recorre encargado en iPhone (390×844): entrar, contar, pedir, elaborados, recibir; y gerencia en escritorio (1440×900)
// y tablet (1024×1366): clave, crear orden, órdenes, faltantes, stock, catálogo (alta y pegado), proveedores, locales,
// elaborados y ajustes. Requiere Playwright y Chromium. No escribe en ninguna planilla real.
const path = require('node:path');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const BASE = process.env.APP_BASE || 'http://localhost:8787';
const args = process.argv.slice(2);
const DARK = args.includes('--dark');
const OUT = path.resolve(args.find(a => !a.startsWith('--')) || require('node:os').tmpdir());
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const step = (m) => console.log('·', m);
const sufijo = Date.now().toString(36).slice(-4);
const shot = (p, n, full = true) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full });
const sheetOpen = p => p.waitForSelector('.sheet-root.is-open', { timeout: 10000 });
const sheetClosed = p => p.waitForSelector('.sheet-root', { state: 'detached', timeout: 10000 });
async function apiPost(body) { const r = await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify(body) }); return r.json(); }
async function apiGet(q) { const r = await fetch(BASE + '/api?' + new URLSearchParams(q)); return r.json(); }

(async () => {
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const hook = (page, tag) => {
    page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|favicon/i.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
  };
  const nuevoCtx = async (opts) => { const c = await browser.newContext({ colorScheme: DARK ? 'dark' : 'light', ...opts }); await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); return c; };

  /* ---------- Encargado · iPhone ---------- */
  const enc = await nuevoCtx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await enc.newPage(); hook(p, 'encargado');
  await p.goto(BASE + '/app/?api=/api');
  await p.waitForSelector('.local-btn');
  await shot(p, '00-entrar', false);
  await p.getByRole('radio', { name: 'Umo Grill' }).click();
  await p.waitForSelector('.names .chip');
  await shot(p, '00b-entrar-encargados', false);
  await p.getByRole('button', { name: 'Otro', exact: true }).click();
  await p.getByLabel('Tu nombre').fill('Ayelén');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForSelector('.hero-local');
  step('entrar como encargado');
  await shot(p, '01-hoy');
  await shot(p, '01b-hoy-tarjeta', false);

  await p.goto(BASE + '/app/#contar');
  await p.waitForSelector('.prod');
  await p.getByRole('textbox', { name: 'Asado en kg' }).fill('4');
  await p.getByRole('textbox', { name: 'Tomate en kg' }).fill('1,5');
  await p.getByLabel('No queda Crema').click();
  await shot(p, '10-contar');
  await p.getByRole('button', { name: 'Revisar' }).click();
  await sheetOpen(p); await p.waitForTimeout(350);
  await shot(p, '11-contar-revisar');
  await p.getByRole('button', { name: 'Guardar conteo' }).click();
  await p.waitForSelector('.done', { timeout: 15000 });
  step('conteo guardado');
  await shot(p, '12-contar-ok');

  await p.goto(BASE + '/app/#pedir');
  await p.waitForSelector('.prod'); await p.waitForTimeout(300);
  const sug = p.locator('.prod-sug').first();
  if (await sug.count()) await sug.click();
  await p.getByLabel('Más Chorizo en kg').click();
  await p.getByRole('button', { name: 'Pedir un producto que no está en la lista' }).click();
  await sheetOpen(p);
  await p.getByRole('dialog').getByLabel('Producto').fill('Pan árabe ' + sufijo);
  await p.getByRole('dialog').getByLabel('Cantidad').fill('20');
  await p.getByRole('button', { name: 'Agregar al pedido' }).click();
  await p.waitForTimeout(350);
  await shot(p, '20-pedir');
  await p.getByRole('button', { name: 'Revisar' }).click();
  await sheetOpen(p);
  await p.getByRole('tab', { name: 'Urgente' }).click();
  await p.getByLabel('Notas para Compras (opcional)').fill('No pedir pan árabe la semana que viene');
  await p.waitForTimeout(300);
  await shot(p, '21-pedir-revisar');
  await p.getByRole('button', { name: 'Enviar pedido' }).click();
  await p.waitForSelector('.done', { timeout: 15000 });
  const idPedido = (await p.locator('.done-id').textContent()).trim();
  const ped = await apiGet({ action: 'getPedido', id: idPedido });
  if (!ped.ok || ped.found === false) throw new Error('el pedido no quedó en la planilla: ' + idPedido);
  step('pedido enviado y confirmado en la planilla: ' + idPedido);
  await shot(p, '22-pedir-ok');
  await p.getByRole('button', { name: 'Ver el pedido' }).click();
  await p.waitForSelector('.sheet-root.is-open .cell'); await p.waitForTimeout(350);
  await shot(p, '23-pedido-detalle');
  await p.keyboard.press('Escape');

  await p.goto(BASE + '/app/#hoy');
  await p.waitForSelector('.step-mark.ok', { timeout: 10000 }); await p.waitForTimeout(300);
  await shot(p, '30-hoy-con-datos');

  await p.goto(BASE + '/app/#elaborados');
  await p.waitForSelector('.tri');
  await p.getByLabel('Listo de Bondiola en unidad').fill('3');
  await p.getByLabel('Crudo de Bondiola en unidad').fill('5');
  await p.getByLabel('No queda nada de Pollo deshuesado').click();
  await shot(p, '40-elaborados');
  await p.getByRole('button', { name: 'Revisar' }).click();
  await sheetOpen(p);
  await p.getByRole('button', { name: 'Guardar conteo' }).click();
  await p.waitForSelector('.done', { timeout: 15000 });
  step('elaborados guardados');

  // Gerencia crea una orden por API para probar Recibir
  const cons = await apiGet({ action: 'getConsolidado' });
  const grupo = cons.grupos.find(g => g.proveedor === 'Distribuidora Florida');
  if (!grupo) throw new Error('sin líneas pendientes de Distribuidora Florida');
  const d = new Date(); const pad = n => String(n).padStart(2, '0');
  const idOc = `OC-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${sufijo}`;
  const oc = await apiPost({ action: 'crearOrden', admin_key: 'dev', id_oc: idOc, id_lineas: grupo.lineas.map(l => l.id_linea), proveedor: 'Distribuidora Florida', responsable: 'Gerencia' });
  if (!oc.ok) throw new Error('crearOrden: ' + oc.error);

  await p.goto(BASE + '/app/#recibir'); await p.reload();
  await p.waitForSelector('.prod', { timeout: 10000 }); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Llegó todo' }).first().click();
  await p.locator('.stepper input').first().fill('3');
  await p.waitForTimeout(300);
  await shot(p, '50-recibir');
  await p.getByRole('button', { name: 'Revisar' }).click();
  await sheetOpen(p); await p.waitForTimeout(300);
  await shot(p, '51-recibir-revisar');
  await p.getByRole('button', { name: 'Confirmar recepción' }).click();
  await p.waitForSelector('.done', { timeout: 15000 });
  step('recepción confirmada');
  await shot(p, '52-recibir-ok');
  await p.goto(BASE + '/app/#ajustes'); await p.waitForSelector('.list .cell'); await p.waitForTimeout(200);
  await shot(p, '53-ajustes');

  // Cambiar de local pide quién carga en el local nuevo; el nombre queda en el conteo.
  await p.goto(BASE + '/app/#hoy'); await p.waitForSelector('.hero-local');
  await p.locator('.hero-local').click(); await sheetOpen(p);
  await p.getByRole('button', { name: /Trento Café/ }).click();
  await p.waitForSelector('.sheet-root.is-open .sheet-head h2:has-text("Trento Café")', { timeout: 10000 }); await p.waitForTimeout(350);
  await shot(p, '55-quien-carga', false);
  await p.getByRole('button', { name: /Lucía Paz/ }).click(); await sheetClosed(p);
  await p.waitForSelector('.hero-quien:has-text("Lucía Paz")');
  step('cambio de local pide encargado');
  await shot(p, '56-hoy-lucia', false);
  await p.goto(BASE + '/app/#contar'); await p.waitForSelector('.prod');
  await p.getByRole('textbox', { name: 'Asado en kg' }).fill('2');
  await p.getByRole('button', { name: 'Revisar' }).click(); await sheetOpen(p); await p.waitForTimeout(350);
  await shot(p, '57-contar-revisar-quien', false);
  await p.locator('.quien-carga').getByRole('button', { name: 'Cambiar' }).click();
  await p.waitForSelector('.sheet-root.is-open .sheet-head h2:has-text("¿Quién carga")'); await p.waitForTimeout(350);
  await p.getByRole('button', { name: /Diego Sosa/ }).click();
  await p.waitForSelector('.quien-carga strong:has-text("Diego Sosa")');
  await p.getByRole('button', { name: 'Guardar conteo' }).click();
  await p.waitForSelector('.done', { timeout: 15000 });
  const hoyT = await apiGet({ action: 'getHoy', local: 'Trento Café' });
  if (!hoyT.ultimo_conteo || hoyT.ultimo_conteo.encargado !== 'Diego Sosa') throw new Error('el conteo no guardó el encargado elegido: ' + JSON.stringify(hoyT.ultimo_conteo));
  step('conteo firmado por el encargado elegido');
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(BASE + '/app/#hoy'); await p.waitForSelector('.hero-quien:has-text("Diego Sosa")'); await p.waitForTimeout(400);
  await shot(p, '58-hoy-escritorio', false);
  await enc.close();

  /* ---------- Gerencia · escritorio ---------- */
  const ger = await nuevoCtx({ viewport: { width: 1440, height: 900 } });
  const g = await ger.newPage(); hook(g, 'gerencia');
  await g.goto(BASE + '/app/?api=/api#entrar/gerencia');
  await g.getByLabel('Clave').fill('dev');
  await g.getByRole('button', { name: 'Entrar' }).click();
  await g.waitForSelector('.prov, .empty', { timeout: 15000 }); await g.waitForTimeout(400);
  step('entrar como gerencia');
  await shot(g, '60-compras', false);
  const asignar = g.getByRole('button', { name: /Asignar proveedor y crear orden/ }).first();
  if (await asignar.count()) {
    await asignar.click(); await sheetOpen(g);
    await g.getByLabel('Proveedor para estas líneas').selectOption({ index: 1 });
    await g.getByLabel('Responsable de la compra').fill('Gerencia');
    await shot(g, '61-compras-asignar', false);
    await g.getByRole('dialog').getByRole('button', { name: 'Crear orden' }).click();
    await g.waitForSelector('.wa-text', { timeout: 15000 }); await g.waitForTimeout(400);
    await shot(g, '62-compras-whatsapp', false);
    step('orden creada desde Compras');
    await g.keyboard.press('Escape'); await g.waitForTimeout(300);
  }
  await g.goto(BASE + '/app/#ordenes');
  await g.waitForSelector('.list .cell', { timeout: 10000 }); await g.waitForTimeout(300);
  await shot(g, '63-ordenes', false);
  await g.locator('.list .cell').first().click(); await sheetOpen(g); await g.waitForSelector('.wa-text'); await g.waitForTimeout(400);
  await shot(g, '64-orden-detalle', false);
  await g.keyboard.press('Escape');
  await g.goto(BASE + '/app/#faltantes');
  await g.waitForSelector('.prov, .empty', { timeout: 10000 }); await g.waitForTimeout(300);
  await shot(g, '65-faltantes', false);
  await g.goto(BASE + '/app/#stock');
  await g.waitForSelector('table.tbl', { timeout: 10000 }); await g.waitForTimeout(300);
  await shot(g, '66-stock', false);

  await g.goto(BASE + '/app/#catalogo');
  await g.waitForSelector('table.tbl, .empty', { timeout: 10000 }); await g.waitForTimeout(300);
  await shot(g, '67-catalogo', false);
  await g.getByRole('button', { name: 'Nuevo' }).click(); await sheetOpen(g);
  const papa = 'Papa ' + sufijo;
  await g.getByRole('dialog').getByLabel('Producto', { exact: true }).fill(papa);
  await g.getByRole('dialog').getByLabel('Categoría').fill('Verduras');
  await g.getByRole('dialog').getByLabel('Precio de referencia').fill('1200');
  await g.getByRole('dialog').getByLabel('Par (stock ideal)').fill('20');
  await g.getByRole('button', { name: 'Crear producto' }).click();
  await sheetClosed(g);
  await g.waitForSelector(`text=${papa}`, { timeout: 10000 });
  step('producto creado');
  await g.getByRole('button', { name: 'Pegar desde Excel' }).click(); await sheetOpen(g);
  await g.locator('.sheet textarea').fill(`Producto\tCategoría\tUnidad\tProveedor\tPrecio\tPar\nCebolla ${sufijo}\tVerduras\tkg\tVerdulería Carlitos\t900\t5\nAceite ${sufijo}\tAlmacén\tlitro\t\t4500\t3`);
  await g.waitForTimeout(300);
  await shot(g, '68-catalogo-pegar', false);
  await g.getByRole('button', { name: 'Cargar' }).click();
  await g.waitForSelector('.sheet .banner.ok', { timeout: 15000 });
  step('productos pegados desde Excel');
  await g.getByRole('button', { name: 'Listo' }).click(); await g.waitForTimeout(300);

  await g.goto(BASE + '/app/#proveedores');
  await g.waitForSelector('.list .cell', { timeout: 10000 }); await g.waitForTimeout(300);
  await g.getByRole('button', { name: 'Nuevo' }).click(); await sheetOpen(g);
  const pesc = 'Pescadería ' + sufijo;
  await g.getByRole('dialog').getByLabel('Proveedor', { exact: true }).fill(pesc);
  await g.getByRole('dialog').getByLabel('WhatsApp').fill('5491155550000');
  await g.getByRole('button', { name: 'Crear proveedor' }).click();
  await sheetClosed(g);
  await g.waitForSelector(`text=${pesc}`, { timeout: 10000 });
  step('proveedor creado');
  await shot(g, '69-proveedores', false);

  await g.goto(BASE + '/app/#locales');
  await g.waitForSelector('.list .cell', { timeout: 10000 }); await g.waitForTimeout(300);
  await g.locator('.list .cell', { hasText: 'Umo Grill' }).click(); await sheetOpen(g);
  await g.getByPlaceholder('Agregar encargado').fill('Jose ' + sufijo);
  await g.getByRole('dialog').getByRole('button', { name: 'Agregar' }).click();
  await shot(g, '70-local-editar', false);
  await g.getByRole('button', { name: 'Guardar' }).click();
  await sheetClosed(g);
  await g.waitForSelector(`text=Jose ${sufijo}`, { timeout: 10000 });
  step('local guardado');

  await g.goto(BASE + '/app/#elaborados-admin');
  await g.waitForSelector('.list .cell, .empty', { timeout: 10000 }); await g.waitForTimeout(300);
  await g.getByRole('button', { name: 'Nuevo' }).click(); await sheetOpen(g);
  await g.getByRole('dialog').getByLabel('Producto', { exact: true }).fill('Salsa ' + sufijo);
  await g.getByRole('dialog').getByLabel('Unidad').selectOption('litro');
  await g.getByRole('button', { name: 'Crear' }).click();
  await sheetClosed(g);
  await g.waitForSelector(`text=Salsa ${sufijo}`, { timeout: 10000 });
  step('elaborado creado');
  await shot(g, '71-elaborados-admin', false);
  await g.goto(BASE + '/app/#ajustes');
  await g.waitForSelector('.list .cell', { timeout: 10000 }); await g.waitForTimeout(300);
  await shot(g, '72-ajustes-gerencia', false);
  await ger.close();

  /* ---------- Gerencia · tablet ---------- */
  const tab = await nuevoCtx({ viewport: { width: 1024, height: 1366 }, isMobile: true, hasTouch: true });
  const t = await tab.newPage(); hook(t, 'tablet');
  await t.goto(BASE + '/app/?api=/api#entrar/gerencia');
  await t.getByLabel('Clave').fill('dev');
  await t.getByRole('button', { name: 'Entrar' }).click();
  await t.waitForSelector('.prov, .empty', { timeout: 15000 }); await t.waitForTimeout(400);
  await shot(t, '80-tablet-compras', false);
  await t.goto(BASE + '/app/#stock');
  await t.waitForSelector('table.tbl', { timeout: 10000 }); await t.waitForTimeout(300);
  await shot(t, '81-tablet-stock', false);
  await tab.close();

  await browser.close();
  if (errors.length) { console.log('ERRORES:\n' + errors.join('\n')); process.exit(1); }
  console.log(`App e2e passed. Capturas en ${OUT}`);
})().catch(e => { console.error(e); if (errors.length) console.log('ERRORES:\n' + errors.join('\n')); process.exit(1); });
