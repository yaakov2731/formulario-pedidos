#!/usr/bin/env node
// Prueba de punta a punta (manual, no corre en CI) de Compras → Armar: "Por producto" (hoja de armado) y "Por proveedor"
// (rediseño: columnas por local), con la impresión A4 horizontal de las dos. API de Supabase mockeada
// (e2e-reposicion-datos.js) y reloj fijo (domingo 22/11/2026 10:00).
// Datos: Umo y Trento piden a Florida la misma Coca-Cola (fichas distintas por local → una sola fila, 5 + 3 = 8); Umo
// pide 36 insumos a Martín De Ridder (para que las hojas pasen de página); Trento tiene café para aprobar en Barcena;
// el Shopping pidió papel sin proveedor. La cerveza de Umo está destildada (no se arma ni se imprime).
// Uso: node scripts/e2e-por-producto.js [carpeta-capturas] [carpeta-pdf]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const { servidor, U, L, P, PV, base, sesion, montarApi } = require('./e2e-reposicion-datos.js');

const OUT = path.resolve(process.argv[2] || '/mnt/project-files/rediseno-cero/por-producto');
const PDF = path.resolve(process.argv[3] || '/mnt/project-files/rediseno-cero/impresion');
const EXEC = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PDF, { recursive: true });

const errores = [];
let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fallas++; };
const limpiar = (p) => p.evaluate(() => { const s = document.getElementById('splash'); if (s) s.remove(); document.querySelectorAll('.toast').forEach(t => t.remove()); });
const shot = async (p, n, full = true) => { await limpiar(p); await p.waitForTimeout(250); return p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full }); };
const ANCHOS = { 390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1300: { viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 } };
const DOMINGO = new Date('2026-11-22T10:00:00-03:00');
const ts = (f, h) => new Date(`${f}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString();
const it = (id, producto_id, cantidad_pedida, extra = {}) => ({ id, producto_id, cantidad_pedida, cantidad_recibida: null, excluido: false, agregado: false, no_vino: false, ...extra });

// 36 insumos de Umo para Martín De Ridder (las hojas pasan de página).
const INSUMOS = [];
for (let i = 1; i <= 36; i++) {
  const id = 'ins' + String(i).padStart(2, '0');
  P[id] = { ...P.molleja, id, codigo: 'C-I' + i, nombre: `Insumo de cocina ${String(i).padStart(2, '0')}`, codigo_proveedor: 'MR-' + (100 + i), unidad_compra: i % 3 ? 'kg' : 'caja x 12' };
  INSUMOS.push(it('ii' + i, id, (i % 5) + 1));
}

function datos() {
  const db = base({ ahora: DOMINGO });
  db.ordenes.push(
    { id: 'o-b1', local_id: L.umo, proveedor_id: PV.barcena, estado: 'aprobada', creado_en: ts('2026-11-21', 10), cargado_por_nombre: 'Lucas', nota: 'Entregar antes de las 11',
      orden_items: [it('ib1', 'limon', 4), it('ib2', 'chorizo', 10), it('ib3', 'morcilla', 3)] },
    { id: 'o-f1', local_id: L.umo, proveedor_id: PV.florida, estado: 'aprobada', creado_en: ts('2026-11-21', 11), cargado_por_nombre: 'Lucas', nota: null,
      orden_items: [it('if1', 'coca', 5), it('if2', 'cerveza', 2, { excluido: true })] },
    { id: 'o-f2', local_id: L.tre, proveedor_id: PV.florida, estado: 'aprobada', creado_en: ts('2026-11-22', 9), cargado_por_nombre: 'Angelica', nota: null,
      orden_items: [it('if3', 'coca-t', 3), it('if4', 'leche', 12)] },
    { id: 'o-m1', local_id: L.umo, proveedor_id: PV.martin, estado: 'aprobada', creado_en: ts('2026-11-20', 18), cargado_por_nombre: 'Maru', nota: null, orden_items: INSUMOS },
    { id: 'o-s1', local_id: L.shp, proveedor_id: null, estado: 'borrador', creado_en: ts('2026-11-22', 8), cargado_por_nombre: 'Marcos', nota: null, orden_items: [it('is1', 'papel', 40)] }
  );
  return db;
}

(async () => {
  const srv = await servidor();
  const BASE = `http://127.0.0.1:${srv.address().port}/stock/`;
  const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});
  const abrir = async (ancho, esquema, ruta) => {
    const c = await browser.newContext({ serviceWorkers: 'block', timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR', colorScheme: esquema, ...ANCHOS[ancho] });
    await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await montarApi(c, datos(), errores);
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
  // window.print → guarda la hoja armada; después se vuelve a poner para sacar el PDF.
  const capturarImpresion = (p) => p.evaluate(() => { window.__impreso = null; window.print = () => { window.__impreso = document.querySelector('.print-area').outerHTML; }; });
  const pdfDe = async (p, archivo) => {
    const html = await p.evaluate(() => window.__impreso);
    await p.evaluate((x) => { document.querySelectorAll('.print-area').forEach(e => e.remove()); const d = document.createElement('div'); d.innerHTML = x; document.body.append(d.firstElementChild); document.body.classList.add('imprimiendo'); }, html);
    await p.emulateMedia({ media: 'print', colorScheme: 'light' });
    await p.pdf({ path: archivo, format: 'A4', landscape: true, preferCSSPageSize: true, printBackground: true });
    await p.emulateMedia({ media: 'screen' });
    await p.evaluate(() => { document.querySelectorAll('.print-area').forEach(e => e.remove()); document.body.classList.remove('imprimiendo'); });
    return html;
  };
  const paginas = (f) => Number((execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/) || [])[1] || 0);
  const textoPdf = (f, pag) => { try { return execFileSync('pdftotext', ['-f', String(pag), '-l', String(pag), '-layout', f, '-']).toString(); } catch (_e) { return null; } };
  const png = (f, nombre) => { try { execFileSync('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', '3', f, path.join(PDF, nombre)]); return true; } catch (_e) { return false; } };

  // ===== Por producto · PC =====
  {
    const { c, p } = await abrir(1300, 'light', '#/por-producto');
    await p.waitForSelector('.ppr-tabla tbody tr.ppr-f');
    await p.waitForTimeout(400);
    ok(await p.locator('.subnav-b.is-on').innerText() === 'Armar' && (await p.locator('.subnav-f').allInnerTexts()).join(',') === 'Por proveedor,Por producto' && await p.locator('.subnav-f.is-on').innerText() === 'Por producto', 'Compras → Armar con Por proveedor · Por producto');
    ok(await p.locator('.tab.is-active').getAttribute('data-nav') === 'pedidos' || await p.locator('.side .is-active, [data-nav="pedidos"].is-active').count() > 0, 'queda marcada la pestaña Compras');
    const cols = (await p.locator('.ppr-tabla thead th').allInnerTexts()).map(x => x.trim()).join(',');
    ok(cols === 'Producto,Unidad,Shopping,Trento Café,Umo Grill,Total', 'columnas: producto, unidad, un local por columna y total · ' + cols);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ppr-tabla thead th')).position) === 'sticky', 'encabezado de la tabla fijo');
    const provs = await p.locator('.ppr-tabla tbody[data-prov]').evaluateAll(xs => xs.map(x => x.getAttribute('data-prov')));
    ok(provs.join(',') === 'Barcena,Distribuidora Florida,Martín De Ridder,Sin proveedor', 'agrupado por proveedor (sin proveedor al final) · ' + provs.join(','));
    const coca = p.locator('tbody[data-prov="Distribuidora Florida"] tr.ppr-f', { hasText: 'Coca-Cola 500 ml' });
    ok(await coca.count() === 1 && await coca.getAttribute('data-total') === '8', 'Coca-Cola de Umo (5) y Trento (3): una sola fila con total 8');
    ok(await coca.locator(`td[data-local="${L.umo}"]`).innerText() === '5' && await coca.locator(`td[data-local="${L.tre}"]`).innerText() === '3' && await coca.locator(`td[data-local="${L.shp}"]`).innerText() === '—', 'Coca: 5 en Umo, 3 en Trento, — en el Shopping');
    ok(await p.locator('tr.ppr-f', { hasText: 'Cerveza' }).count() === 0, 'la cerveza destildada no se arma');
    ok(await p.locator('tbody[data-prov="Martín De Ridder"] tr.ppr-f').count() === 36, 'Martín De Ridder: 36 insumos');
    ok(await p.locator('tbody[data-prov="Barcena"] tr.ppr-f').count() === 4 && await p.locator('tbody[data-prov="Barcena"] .estado').innerText() === 'Para aprobar', 'Barcena: 4 productos (3 de Umo + café de Trento), estado Para aprobar');
    const altos = await p.locator('.ppr-tabla tr.ppr-f').evaluateAll(xs => Math.min(...xs.map(x => x.getBoundingClientRect().height)));
    ok(altos >= 48, 'filas de al menos 48 px · ' + Math.round(altos));
    ok(!/\$/.test(await p.locator('#view').innerText()), 'sin precios');
    ok(/43 productos · 3 locales · 4 proveedores · pedidos del 20\/11\/2026 al 22\/11\/2026/.test(await p.locator('.ppr-resumen').innerText()), 'resumen: productos, locales, proveedores y fechas · ' + await p.locator('.ppr-resumen').innerText());
    await shot(p, 'por-producto-pc-claro', false);
    // Filtro por estado
    await p.locator('.ppr-seg [data-filtro="borrador"]').click();
    await p.waitForTimeout(200);
    const provsB = await p.locator('.ppr-tabla tbody[data-prov]').evaluateAll(xs => xs.map(x => x.getAttribute('data-prov')));
    ok(provsB.join(',') === 'Barcena,Sin proveedor' && await p.locator('.ppr-tabla tr.ppr-f').count() === 2, 'Para aprobar: café de Trento (Barcena) y papel del Shopping · ' + provsB.join(','));
    await p.locator('.ppr-seg [data-filtro="aprobada"]').click();
    await p.waitForTimeout(200);
    ok(await p.locator('tbody[data-prov="Barcena"] tr.ppr-f').count() === 3 && await p.locator('tbody[data-prov="Sin proveedor"]').count() === 0, 'Aprobados: Barcena sin el café para aprobar, sin el Shopping');
    await p.locator('.ppr-seg [data-filtro="todos"]').click();
    await p.waitForTimeout(200);
    // Imprimir hoja de armado
    await capturarImpresion(p);
    await p.locator('[data-accion="imprimir-armado"]').click();
    await p.waitForFunction(() => !!window.__impreso);
    const html = await pdfDe(p, path.join(PDF, 'hoja-armado.pdf'));
    ok(/Hoja de armado por producto/.test(html) && /<thead><tr class="pr-run">/.test(html), 'impresión: título y encabezado dentro del thead (se repite en cada hoja)');
    ok(/Responsable del armado<\/dt><dd class="pr-firma"/.test(html), 'responsable del armado: línea para firmar (no se inventa)');
    ok(/Fecha del pedido<\/dt><dd>20\/11\/2026 al 22\/11\/2026/.test(html), 'fecha del pedido: rango de las órdenes');
    ok(/Pidieron<\/dt><dd>Marcos \(Shopping\) · Angelica \(Trento Café\) · Lucas, Maru \(Umo Grill\)/.test(html), 'pidieron: quién cargó cada pedido');
    ok(/SPMAR S\.A\. \(Shopping\)/.test(html) && /SUMA ACTIVA S\.A\. \(Trento Café, Umo Grill\)/.test(html), 'razón social de cada local');
    ok((html.match(/class="pr-grupo"/g) || []).length === 4 && !/\$/.test(html) && !/Cerveza/.test(html), 'impresión: 4 grupos por proveedor, sin precios, sin lo destildado');
    const n = paginas(path.join(PDF, 'hoja-armado.pdf'));
    ok(n >= 2, 'hoja de armado: ' + n + ' páginas A4');
    const t2 = textoPdf(path.join(PDF, 'hoja-armado.pdf'), 2);
    if (t2 !== null) {
      ok(/Hoja de armado por producto/.test(t2) && /PRODUCTO/.test(t2), 'página 2: repite el encabezado y las columnas');
      ok(new RegExp(`Página 2 de ${n}`).test(t2), `página 2: pie "Página 2 de ${n}"`);
    }
    png(path.join(PDF, 'hoja-armado.pdf'), 'hoja-armado');
    await c.close();
  }

  // ===== Por proveedor · PC =====
  {
    const { c, p } = await abrir(1300, 'light', '#/compras');
    await p.waitForSelector('.grupo-prov');
    await p.waitForTimeout(400);
    ok(await p.locator('.subnav-f.is-on').innerText() === 'Por proveedor', 'Por proveedor marcado en Armar');
    const flo = p.locator('.grupo-prov[data-prov="Distribuidora Florida"]');
    ok(/^2 de 3 productos · 2 locales$/.test(await flo.locator('.pp-sub').innerText()), 'Florida: encabezado con productos y locales · ' + await flo.locator('.pp-sub').innerText());
    ok(await flo.locator('.pp-meta .estado').innerText() === 'Para enviar', 'Florida: estado Para enviar');
    const h = (await flo.locator('.pp-h').innerText()).replace(/\s+/g, ' ').trim();
    ok(/Pedir Producto Trento Café Umo Grill Total Pasar a otro proveedor/.test(h), 'Florida: columnas por local · ' + h);
    const cocaF = flo.locator('.pp-fila:not(.pp-h)', { hasText: 'Coca-Cola' });
    ok(await cocaF.count() === 1 && (await cocaF.locator('.pp-tot').innerText()) === '8' && await cocaF.locator('.pp-loc-inp').count() === 2, 'Florida: Coca-Cola en una fila, total 8 y una cantidad por local');
    ok(await cocaF.locator('.pp-prov select').isVisible(), 'PC: el selector de proveedor se ve en su columna');
    const x1 = await cocaF.locator(`.pp-c[data-local="${L.tre}"]`).boundingBox(), x2 = await flo.locator('.pp-h .pp-c').first().boundingBox();
    ok(Math.abs(x1.x + x1.width - (x2.x + x2.width)) < 2, 'la cantidad de Trento queda alineada bajo su columna');
    ok(await sinDesborde(p), '1300: sin scroll horizontal');
    await shot(p, 'por-proveedor-pc-claro', false);
    await flo.screenshot({ path: path.join(OUT, 'por-proveedor-pc-claro-florida.png') });
    await p.locator('.grupo-prov[data-prov="Barcena"]').screenshot({ path: path.join(OUT, 'por-proveedor-pc-claro-barcena.png') });
    // Imprimir todos: Florida y Martín (aprobados); Barcena todavía tiene un local para aprobar.
    await capturarImpresion(p);
    await p.locator('[data-accion="imprimir-todos"]').click();
    await p.waitForFunction(() => !!window.__impreso);
    const html = await pdfDe(p, path.join(PDF, 'ordenes-proveedor.pdf'));
    ok((html.match(/class="pr-prov"/g) || []).length === 2 && /Distribuidora Florida/.test(html) && /Martín De Ridder/.test(html) && !/<h1 class="pr-t">Barcena/.test(html), 'Imprimir todos: una orden por proveedor aprobado (Florida y Martín)');
    ok(/Orden de compra/.test(html) && /Aprobó<\/dt><dd class="pr-firma"/.test(html), 'orden: título y "Aprobó" para firmar');
    ok(/Facturar a SUMA ACTIVA S\.A\./.test(html) && !/Cerveza/.test(html) && !/\$/.test(html), 'orden: facturar a la razón social del local, sin lo destildado, sin precios');
    ok(/<span class="pr-cod">MR-101<\/span>/.test(html), 'orden: código del proveedor en cada producto');
    const n = paginas(path.join(PDF, 'ordenes-proveedor.pdf'));
    ok(n >= 3, 'órdenes: ' + n + ' páginas (Florida en una, Martín empieza en hoja nueva)');
    const t1 = textoPdf(path.join(PDF, 'ordenes-proveedor.pdf'), 1), t2 = textoPdf(path.join(PDF, 'ordenes-proveedor.pdf'), 2);
    if (t1 !== null) {
      ok(/Distribuidora Florida/.test(t1) && !/Insumo de cocina/.test(t1) && new RegExp(`Página 1 de ${n}`).test(t1), 'página 1: solo Florida, con "Página 1 de ' + n + '"');
      ok(/Martín De Ridder/.test(t2) && /Insumo de cocina 01/.test(t2), 'página 2: Martín arranca en hoja nueva');
    }
    png(path.join(PDF, 'ordenes-proveedor.pdf'), 'ordenes-proveedor');
    await c.close();
  }

  // ===== Celular y modo oscuro: capturas y desborde =====
  for (const [ancho, esquema] of [[390, 'light'], [390, 'dark'], [1300, 'dark']]) {
    const nom = (ancho === 390 ? 'celular' : 'pc') + '-' + (esquema === 'light' ? 'claro' : 'oscuro');
    const { c, p } = await abrir(ancho, esquema, '#/por-producto');
    await p.waitForSelector('.ppr-f');
    await p.waitForTimeout(400);
    if (ancho === 390) {
      const coca = p.locator('.ppr-grupo[data-prov="Distribuidora Florida"] .ppr-f', { hasText: 'Coca-Cola' });
      ok(await coca.getAttribute('data-total') === '8' && (await coca.locator('.ppr-f-tot b').innerText()) === '8' && (await coca.locator('.ppr-desglose').innerText()) === 'Trento Café 3 · Umo Grill 5', `${nom}: tarjeta de Coca con total 8 y "Trento Café 3 · Umo Grill 5"`);
      ok(await sinDesborde(p), `${nom}: Por producto sin scroll horizontal`);
    }
    await shot(p, 'por-producto-' + nom, ancho === 390);
    await ir(p, '#/compras', '.grupo-prov');
    if (ancho === 390) {
      const fila = p.locator('.grupo-prov[data-prov="Distribuidora Florida"] .pp-fila:not(.pp-h)', { hasText: 'Coca-Cola' });
      ok(!(await fila.locator('.pp-prov select').isVisible()) && await fila.locator('.pp-otro').isVisible(), `${nom}: el cambio de proveedor queda detrás de "Otro proveedor"`);
      await fila.locator('.pp-otro').click();
      ok(await fila.locator('.pp-prov select').isVisible(), `${nom}: "Otro proveedor" muestra el selector`);
      await fila.locator('.pp-otro').click();
      ok(await p.locator('.grupo-prov[data-prov="Sin proveedor"] .pp-prov select').first().isVisible(), `${nom}: sin proveedor, el selector se ve siempre`);
      ok(await sinDesborde(p), `${nom}: Por proveedor sin scroll horizontal`);
    }
    await shot(p, 'por-proveedor-' + nom, ancho === 390);
    await c.close();
  }

  await browser.close();
  srv.close();
  const err = errores.filter(e => !/ruta no prevista/.test(e) || !/rpc\/tablero/.test(e));
  ok(!err.length, 'sin errores de página · ' + err.slice(0, 5).join(' | '));
  console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo OK');
  console.log('Capturas: ' + OUT + '\nPDF: ' + PDF);
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
