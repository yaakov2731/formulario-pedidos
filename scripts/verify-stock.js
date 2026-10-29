#!/usr/bin/env node
// Chequeos estáticos de stock/ (CI, sin dependencias).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const S = (p) => path.join(root, 'stock', p);
const read = (p) => fs.readFileSync(S(p), 'utf8');
// stock/js/comprobante.js es una copia GENERADA de supabase/lib/comprobante.js (única fuente de verdad del lector).
const comprobanteGenerado = () => `// GENERADO desde supabase/lib/comprobante.js (única fuente de verdad). No editar a mano:\n// corré \`node scripts/verify-stock.js --sync\` después de tocar el original.\n`
  + fs.readFileSync(path.join(root, 'supabase/lib/comprobante.js'), 'utf8').replace(/\nif \(typeof module !== 'undefined'\)[^\n]*\n?/, '\nexport { leerComprobante, mensajeAviso, montoANumero, fechaISO };\n');
if (process.argv.includes('--sync')) { fs.writeFileSync(S('js/comprobante.js'), comprobanteGenerado()); console.log('Sincronizado stock/js/comprobante.js'); }
let fallas = 0;
const check = (n, ok, x) => { console.log((ok ? 'OK   ' : 'FAIL ') + n + (!ok && x ? ' -> ' + x : '')); if (!ok) fallas++; };

const archivos = ['index.html', 'config.js', 'manifest.webmanifest', 'sw.js', 'css/stock.css', 'vendor/supabase.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/icon.svg',
  'vendor/xlsx.full.min.js', 'vendor/README.md', 'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs',
  'js/main.js', 'js/util.js', 'js/api.js', 'js/ui.js', 'js/entrar.js', 'js/pedir.js', 'js/datos.js', 'js/g-pedidos.js', 'js/g-cargar.js', 'js/g-recibir.js', 'js/g-stock.js', 'js/g-catalogo.js',
  'js/nucleo.js', 'js/analisis.js', 'js/g-ventas.js', 'js/g-analisis.js', 'js/g-resumen.js', 'js/ventas-global.js', 'js/g-merma.js', 'js/g-recetas.js', 'js/g-produccion.js',
  'js/g-tablero.js', 'js/g-gasto.js', 'js/g-cuentas.js', 'js/g-facturas.js', 'js/g-historial.js', 'js/g-cargar-pago.js', 'js/g-proveedores.js', 'js/g-locales.js', 'js/aviso.js', 'js/notas.js', 'js/elaborados.js', 'js/pagos-util.js', 'js/comprobante.js', 'js/pdf-texto.js'];
for (const a of archivos) check('existe stock/' + a, fs.existsSync(S(a)));

check('config apunta al proyecto Supabase', /https:\/\/zunyzlpzofbyqplgiupl\.supabase\.co/.test(read('config.js')) && /sb_publishable_/.test(read('config.js')));
check('config no contiene service_role ni claves secretas', !/service_role|sb_secret_/i.test(read('config.js')));
check('sw.js con versión stock-v1', /const VERSION = 'stock-v1';/.test(read('sw.js')));
check('vendor supabase-js es el UMD', /supabase/i.test(read('vendor/supabase.js').slice(0, 2000)) || read('vendor/supabase.js').length > 100000);
const html = read('index.html');
check('index.html sin CDN de scripts (solo Google Fonts)', !/<script[^>]+src="https?:/.test(html) && !/<link[^>]+href="https?:\/\/(?!fonts\.(googleapis|gstatic)\.com|zunyzlpzofbyqplgiupl\.supabase\.co)/.test(html));
check('manifest válido', (() => { try { const m = JSON.parse(read('manifest.webmanifest')); return m.icons.length >= 3 && m.start_url; } catch (_e) { return false; } })());

// El SW cachea módulos que existen
const shell = [...read('sw.js').matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(x => x && x.includes('.'));
check('todo el SHELL del SW existe', shell.every(f => fs.existsSync(S(f))), shell.filter(f => !fs.existsSync(S(f))).join(', '));

// Vistas del encargado: sin costos ni umbrales internos visibles.
const permitido = (t) => t.replace(/pedido m[ií]nimo/gi, '').replace(/tiene_minimo/g, '');
for (const f of ['js/pedir.js', 'js/entrar.js']) {
  const t = permitido(read(f));
  check(`${f}: sin "precio"/"costo"`, !/precio|costo|importe/i.test(t));
  check(`${f}: sin "mínimo" ni "par" visibles`, !/m[ií]nimo/i.test(t) && !/\bpar\b/i.test(t));
}
check('encargado no importa vistas de gerencia', !/from '\.\/(g-[a-z-]+|nucleo|analisis|datos|aviso|pagos-util|comprobante|pdf-texto)\.js'/.test(read('js/pedir.js') + read('js/entrar.js')));
check('encargado: ni ventas, recetas, producción ni lector de Excel en pedir.js/entrar.js', !/ventas|receta|producci[oó]n|xlsx|merma|importar_/i.test(read('js/pedir.js') + read('js/entrar.js')));
check('encargado: Pedir arranca vacío (sin pedido precargado)', !/cargarSugerido|sugeridoDe/.test(read('js/pedir.js')));
const main = read('js/main.js');
const navEnc = (main.match(/encargado: \[[\s\S]*?\],\s*gerencia:/) || [''])[0];
check('el menú del encargado no tiene Ventas ni Cocina', navEnc.length > 0 && !/ventas|recetas|merma|produccion/.test(navEnc));
check('rutas de Ventas, Análisis, Merma, Recetas y Producción solo en gerencia', ['ventas', 'analisis', 'merma', 'recetas', 'produccion'].every(r => new RegExp(`'${r}': \\(\\) => import\\('\\./g-`).test(main.split('gerencia: {')[1] || '')));
check('index.html no carga el lector de Excel (se carga solo en Ventas)', !/xlsx/i.test(html) && /vendor\/xlsx\.full\.min\.js/.test(read('js/g-ventas.js')));
check('vendor xlsx es SheetJS 0.18.5 y está anotado', /SheetJS|XLSX/.test(read('vendor/xlsx.full.min.js').slice(0, 400)) && /xlsx\.full\.min\.js.*0\.18\.5/.test(read('vendor/README.md')));
check('los módulos de ventas no usan CDN', !/https?:\/\/(?!fonts)/.test(['js/g-ventas.js', 'js/nucleo.js', 'js/analisis.js', 'js/g-analisis.js'].map(read).join('')));
check('encargado no escribe movimientos ni conteos', !/movimientos|registrar_conteo|contarProducto|registrarRecepcion/.test(read('js/pedir.js')));
check('pedir.js crea órdenes solo en borrador', /estado: 'borrador'/.test(read('js/pedir.js')) && !/estado: '(aprobada|enviada)'/.test(read('js/pedir.js')));
check('login encargado usa local-<codigo>@docks-stock.app', /local-\$\{String\(codigo\)\.toLowerCase\(\)\}@docks-stock\.app/.test(read('js/api.js')));

// Todos los módulos JS pasan --check (vía stdin como módulo ES)
for (const f of fs.readdirSync(S('js')).filter(x => x.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: read('js/' + f), stdio: ['pipe', 'pipe', 'pipe'] }); check(`sintaxis js/${f}`, true); }
  catch (e) { check(`sintaxis js/${f}`, false, String(e.stderr).split('\n')[0]); }
}
for (const f of ['config.js', 'sw.js']) {
  try { execFileSync(process.execPath, ['--check', S(f)], { stdio: 'pipe' }); check('sintaxis ' + f, true); } catch (e) { check('sintaxis ' + f, false); }
}

const wf = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
check('deploy.yml publica stock/ y versiona su SW', /cp -r stock\/\. site\/stock\//.test(wf) && /stock-v1/.test(wf) && /verify-stock\.js/.test(wf));

// Lector de Excel de Núcleo: corre el parser real contra los fixtures sintéticos (scripts/fixtures/nucleo).
(async () => {
  const { pathToFileURL } = require('url');
  const N = await import(pathToFileURL(S('js/nucleo.js')).href);
  const A = await import(pathToFileURL(S('js/analisis.js')).href);
  const X = require(S('vendor/xlsx.full.min.js'));
  const fx = (f) => { const wb = X.read(fs.readFileSync(path.join(root, 'scripts/fixtures/nucleo', f))); return N.leerReporte(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null })); };
  const det = fx('detalle-por-pedido.xlsx'), pag = fx('formas-de-pago.xlsx'), sim = fx('pedidos-por-producto.xlsx');
  check('parser: reconoce los tres reportes por sus encabezados', det && det.tipo === 'detalle' && pag && pag.tipo === 'pagos' && sim && sim.tipo === 'simple');
  const imp = N.armarImportacion({ detalle: det, pagos: pag, simple: sim });
  const r = imp.resumen;
  check('parser: totales (productos 122.600, cobrado 123.600, 5 pedidos, diferencia 1.000)', r.totalProductos === 122600 && r.totalCobrado === 123600 && r.nPedidos === 5 && r.diferencia === 1000, JSON.stringify(r));
  check('parser: pedido a $0 detectado (9104) y fecha del archivo 2026-10-24', r.pedidosCero.join() === '9104' && r.fecha === '2026-10-24');
  check('parser: dos medios de pago en un pedido y total del pedido sin cobro = 0', imp.pagos.filter(p => p.pedido_numero === 9103).length === 2 && imp.pedidos.find(p => p.numero === 9104).total === 0);
  check('parser: hora local del pedido (12:35 -03:00)', imp.pedidos[0].fecha_hora === '2026-10-24T12:35:10-03:00', imp.pedidos[0].fecha_hora);
  const simple = N.armarImportacion({ simple: sim }).resumen;
  check('parser: modo simple (Pedidos por producto) sin pedidos', simple.modo === 'simple' && simple.totalProductos === 122600 && simple.nPedidos === 0);
  check('parser: un Excel que no es de Núcleo no se reconoce', N.leerReporte([['a', 'b'], [1, 2]]) === null);
  const pedidosDb = imp.pedidos.map(p => ({ ...p, fecha: '2026-10-24', ventas_pedido_pagos: imp.pagos.filter(g => g.pedido_numero === p.numero).map(g => ({ forma_pago: g.forma_pago, monto: g.monto })) }));
  const an = A.analizar(pedidosDb, imp.items.map(i => ({ ...i, codigo_origen: i.codigo, nombre_origen: i.nombre })));
  check('análisis: total cobrado, ticket promedio y medios de pago', an.total === 123600 && Math.round(an.ticket) === 24720 && an.porPago[0].k === 'Efectivo' && an.porPago[0].total === 60600, JSON.stringify(an.porPago));
  check('análisis: franja horaria en horario argentino (12 a 21 h) y pedidos a $0 con sus productos', an.porHora[0].hora === 12 && an.porHora.at(-1).hora === 21 && an.ceros.length === 1 && an.ceros[0].productos[0].nombre === 'Parrillada Demo');
  check('análisis: top por cantidad y diferencia cobrado contra productos', an.top[0].k === 'BEB-901' && an.top[0].cantidad === 7 && an.diferencia.dif === 1000 && an.diferencia.pedidosConDif === 1);
  check('análisis: sin mozo en el reporte no hay sección de mozo', an.porMozo.length === 0);

  // ---- Fase 4 y 5: pagos, comprobantes, WhatsApp y tablero ----
  check('stock/js/comprobante.js es copia exacta de supabase/lib/comprobante.js (si falla: node scripts/verify-stock.js --sync)', read('js/comprobante.js') === comprobanteGenerado());
  const CR = await import(pathToFileURL(S('js/comprobante.js')).href);
  const PT = await import(pathToFileURL(S('js/pdf-texto.js')).href);
  const PU = await import(pathToFileURL(S('js/pagos-util.js')).href);
  const itemsFx = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/comprobante/items-pdfjs.json'), 'utf8'));
  const texto = PT.lineasDeItems(itemsFx);
  const lin = texto.split('\n');
  check('pdf.js → líneas: las columnas se separan con 2 o más espacios y cada fila va en su línea', /^Fecha de envío {2,}Monto$/.test(lin.find(l => l.startsWith('Fecha de envío'))) && /^05\/10\/2026 {2,}\$ 150\.000,50$/.test(lin.find(l => l.startsWith('05/10/2026'))), texto.slice(0, 400));
  const rd = CR.leerComprobante(texto);
  check('lector de comprobantes con texto de pdf.js (fixture inventado): operación, monto, fecha, CUIT, banco y cuenta',
    rd.numero_operacion === 'DEMO0001ab' && rd.monto === 150000.5 && rd.fecha === '2026-10-05' && rd.cuit_destino === '30000000019' && rd.proveedor_razon_social === 'Distribuidora Demo Srl' && rd.banco_destino === 'Banco Demo' && rd.cuenta_destino.endsWith('1234') && rd.concepto === 'Factura' && rd.descripcion === 'Mercaderia' && rd.cuit_pagador === '30000000027' && rd.cuenta_origen === 'CC$ 000000001', JSON.stringify(rd));
  const desordenado = PT.lineasDeItems([...itemsFx].reverse().map(i => ({ ...i, y: i.y + (i.y % 2 ? 1 : -1) })));
  check('pdf.js → líneas: tolera items desordenados y diferencias de 1 pt en Y', CR.leerComprobante(desordenado).monto === 150000.5);
  check('lector: un texto sin datos devuelve campos nulos (sin romper)', (() => { const x = CR.leerComprobante('hola'); return x.monto === null && x.numero_operacion === null && x.cuit_destino === null; })());
  check('mensajeAviso arma el mensaje con monto, fecha, operación y cuenta terminada en 1234', (() => { const m = CR.mensajeAviso({ ...rd }, 'Distribuidora Demo'); return /Distribuidora Demo/.test(m) && /150\.000,50/.test(m) && /05\/10\/2026/.test(m) && /DEMO0001ab/.test(m) && /terminada en 1234/.test(m); })());

  const provsFx = [{ id: 'a', nombre: 'Distribuidora Demo S.R.L.', cuit: '30-00000001-9', whatsapp: '54 9 11 5555-0001'}, { id: 'b', nombre: 'Barcena', cuit: null }, { id: 'c', nombre: 'Martín De Ridder', cuit: '' }];
  check('proveedor por CUIT: ignora guiones y espacios', PU.proveedorPorCuit(provsFx, '30000000019').id === 'a' && PU.proveedorPorCuit(provsFx, '30-00000001-9').id === 'a' && PU.proveedorPorCuit(provsFx, '30000000027') === null && PU.proveedorPorCuit(provsFx, '') === null);
  check('sugerencia por razón social (similitud): "Distribuidora Demo Srl" → Distribuidora Demo S.R.L., "Ridder Martin" → Martín De Ridder', PU.sugerirProveedores(provsFx, 'Distribuidora Demo Srl')[0].proveedor.id === 'a' && PU.sugerirProveedores(provsFx, 'RIDDER MARTIN')[0].proveedor.id === 'c' && PU.sugerirProveedores(provsFx, 'Zeta Omega Industrias').length === 0);
  const facFx = [{ id: 'f2', fecha: '2026-09-20', numero: '0001-00000010', pendiente: 500 }, { id: 'f1', fecha: '2026-08-01', numero: '0001-00000002', pendiente: 1000 }, { id: 'f3', fecha: '2026-10-01', numero: '0001-00000030', pendiente: 300 }];
  check('imputación automática: las facturas más viejas primero hasta agotar el monto (1200 → 1000 + 200)', JSON.stringify(PU.imputarAutomatico(1200, facFx)) === JSON.stringify({ f1: 1000, f2: 200 }), JSON.stringify(PU.imputarAutomatico(1200, facFx)));
  check('imputación automática: primero la factura con el mismo saldo que el pago (±$1, sin centavos)', JSON.stringify(PU.imputarAutomatico(500, facFx)) === JSON.stringify({ f2: 500 }) && JSON.stringify(PU.imputarAutomatico(299.5, facFx)) === JSON.stringify({ f3: 299.5 }), JSON.stringify(PU.imputarAutomatico(500, facFx)));
  check('factura que debe menos de $1 cuenta como pagada', PU.estaPagada({ pendiente: 0.64 }) && !PU.estaPagada({ pendiente: 1 }) && !PU.estaPagada({ pendiente: 340495.64 }));
  check('imputación automática: un monto mayor a la deuda deja el resto a cuenta', Object.values(PU.imputarAutomatico(5000, facFx)).reduce((a, b) => a + b, 0) === 1800 && Object.keys(PU.imputarAutomatico(0, facFx)).length === 0);
  check('validar imputación: no supera el pendiente de la factura ni el monto del pago', PU.validarImputacion(1200, facFx, { f1: 1000, f2: 200 }).error === null && PU.validarImputacion(1200, facFx, { f1: 1100 }).error && PU.validarImputacion(500, facFx, { f1: 400, f2: 200 }).error && PU.validarImputacion(1200, facFx, { f1: 1000 }).aCuenta === 200);
  check('estado del aviso: "Avisado" / "Sin avisar"', PU.estadoAviso({ avisado_en: '2026-10-05T10:00:00Z' }) === 'Avisado' && PU.estadoAviso({ avisado_en: null }) === 'Sin avisar');
  check('wa.me: número solo con dígitos y texto codificado', PU.urlWhatsApp('+54 9 11 5555-0001', 'Hola\ncómo') === 'https://wa.me/5491155550001?text=Hola%0Ac%C3%B3mo' && PU.urlWhatsApp('', 'x') === null);
  check('WhatsApp argentino sin 549 se completa', PU.whatsappAR('11 5555-0123') === '5491155550123' && PU.whatsappAR('011 5555 0123') === '5491155550123' && PU.whatsappAR('+54 9 11 5555-0001') === '5491155550001' && PU.whatsappAR('') === '');
  check('email: valida y arma mailto con asunto y texto', PU.emailValido('a@b.com') && !PU.emailValido('a@b') && PU.urlMail('a@b.com', 'Pago', 'Hola\nya') === 'mailto:a@b.com?subject=Pago&body=Hola%0Aya' && PU.urlMail('', 'x', 'y') === null);
  check('comprobante: va a cobranzas y si falta a pedidos', PU.whatsappPagos({ whatsapp: '1', whatsapp_pagos: '2' }) === '2' && PU.whatsappPagos({ whatsapp: '1' }) === '1' && PU.emailPagos({ email: 'a@b.com' }) === 'a@b.com' && PU.emailPagos(null) === null);
  check('rutas del bucket: pagos/<proveedor>/<operación>.pdf y facturas/<proveedor>/<archivo>', PU.rutaPago('prv1', 'LRAKD8f240') === 'pagos/prv1/LRAKD8f240.pdf' && /^facturas\/prv1\/\d+-Factura-1-.*\.pdf$/.test(PU.rutaFactura('prv1', 'Factura 1 ñ.pdf')), PU.rutaFactura('prv1', 'Factura 1 ñ.pdf'));

  // Gasto en compras y Recibo X
  { const U2 = await import(pathToFileURL(S('js/util.js')).href);
    check('montos en pesos: "480.000" son 480 mil; "1500,50" y "12.5" como siempre', U2.parseMonto('480.000') === 480000 && U2.parseMonto('$ 1.250.300') === 1250300 && U2.parseMonto('1500,50') === 1500.5 && U2.parseMonto('12.5') === 12.5 && U2.parseMonto('') === null); }
  check('tipo de comprobante leído por la IA → Factura A/B/C, Recibo X u Otro',
    PU.tipoComprobante('FACTURA A') === 'Factura A' && PU.tipoComprobante('Factura "B"') === 'Factura B' && PU.tipoComprobante('C') === 'Factura C' &&
    PU.tipoComprobante('X') === 'Recibo X' && PU.tipoComprobante('Remito X') === 'Recibo X' && PU.tipoComprobante('DOCUMENTO NO VÁLIDO COMO FACTURA') === 'Recibo X' &&
    PU.tipoComprobante('Ticket') === 'Otro' && PU.tipoComprobante('') === '' && PU.tipoComprobante(null) === '');
  check('número armado para un recibo X sin número', /^X-\d{8}-\d{6}$/.test(PU.numeroReciboX(new Date(2026, 9, 29, 8, 5, 3))) && PU.numeroReciboX(new Date(2026, 9, 29, 8, 5, 3)) === 'X-20261029-080503');
  const gx = [
    { fecha: '2026-10-02', total: 100000, es_x: false, imputado: 100000, pendiente: 0, vencida: false, local_id: 'u', local: 'Umo', razon_social: 'SUMA ACTIVA S.A.', proveedor: 'Florida', categoria: 'Verdulería', creado_en: '2026-10-02T10:00' },
    { fecha: '2026-10-10', total: 50000, es_x: true, imputado: 0, pendiente: 50000, vencida: true, local_id: 's', local: 'Shopping', razon_social: 'SPMAR S.A.', proveedor: 'Distri', categoria: 'Limpieza', creado_en: '2026-10-10T10:00' },
    { fecha: '2026-10-12', total: 30000, es_x: false, imputado: 10000, pendiente: 20000, vencida: false, local_id: null, local: null, razon_social: 'Sin razón social', proveedor: 'Florida', categoria: 'Verdulería', creado_en: '2026-10-12T10:00' },
    { fecha: '2026-09-05', total: 120000, es_x: false, imputado: 120000, pendiente: 0, vencida: false, local_id: 'u', local: 'Umo', razon_social: 'SUMA ACTIVA S.A.', proveedor: 'Florida', categoria: 'Verdulería', creado_en: '2026-09-05T10:00' }];
  const rg = PU.resumenGasto(gx, '2026-10-01', '2026-10-31', { desde: '2026-09-01', hasta: '2026-09-30' });
  check('gasto: total del período, variación contra el anterior y factura vs. recibo X',
    rg.total === 180000 && rg.totalPrev === 120000 && Math.abs(rg.variacion - 0.5) < 1e-9 && rg.conFactura === 130000 && rg.reciboX === 50000 && rg.n === 3, JSON.stringify(rg));
  check('gasto: pagado, falta pagar y vencido',
    rg.pagado === 110000 && rg.pendiente === 70000 && rg.vencido === 50000 && rg.nVencidas === 1, JSON.stringify([rg.pagado, rg.pendiente, rg.vencido]));
  check('gasto: por proveedor, razón social (sin local aparte) y categoría, de mayor a menor',
    rg.porProveedor[0].clave === 'Florida' && rg.porProveedor[0].total === 130000 && rg.porProveedor[0].n === 2 &&
    rg.porRazon.map(g => g.clave).join('|') === 'SUMA ACTIVA S.A.|SPMAR S.A.|Sin local asignado' && rg.porCategoria[0].clave === 'Verdulería' && rg.ultimos[0].proveedor === 'Florida' && rg.ultimos.length === 3, JSON.stringify(rg.porRazon));
  const rx = PU.resumenGasto(gx, '2026-10-01', '2026-10-31', null, 'x');
  check('gasto: filtro solo recibo X (la mezcla factura/X sigue sobre todo el período)', rx.total === 50000 && rx.n === 1 && rx.reciboX === 50000 && rx.conFactura === 130000 && rx.variacion === null);

  // Estructura: roles, rutas, vendors, sin envíos automáticos
  const m4 = read('js/main.js');
  const navGer = (m4.match(/gerencia: \[[\s\S]*?\],\s*contadora:/) || [''])[0];
  const navCon = (m4.match(/contadora: \[[\s\S]*?\]\s*\};/) || [''])[0];
  check('gerencia: el tablero es el inicio (primera sección) y tiene Pagos', /\[\s*\{ id: 'tablero'/.test(navGer) && /id: 'pagos'/.test(navGer));
  check('contadora: solo la sección Pagos', navCon.length > 0 && /id: 'pagos'/.test(navCon) && !/pedidos|stock|ventas|tablero|catalogo|recetas|recibir/.test(navCon), navCon);
  check('el menú del encargado no tiene Pagos ni Tablero', navEnc.length > 0 && !/pagos|tablero|facturas|proveedores/.test(navEnc));
  check('las rutas de pagos, facturas y comprobantes están en gerencia y contadora; tablero y proveedores solo en gerencia',
    /contadora: \{ \.\.\.RUTAS_PAGOS \}/.test(m4) && /gerencia: \{\s*\.\.\.RUTAS_PAGOS,\s*'tablero': \(\) => import\('\.\/g-tablero\.js'\), 'proveedores'/.test(m4) && !/encargado: \{[^}]*(pagos|tablero|proveedores)/.test(m4));
  check('el perfil contadora puede entrar a la app', /\['encargado', 'gerencia', 'contadora'\]\.includes\(perfil\.rol\)/.test(m4));
  check('vendor pdf.js 4.x anotado en vendor/README.md', /pdf\.min\.mjs.*4\.\d+\.\d+/.test(read('vendor/README.md')) && /pdf\.worker\.min\.mjs/.test(read('vendor/README.md')));
  check('pdf.js se carga solo en Cargar pago (import dinámico), no en index.html ni en el arranque', !/pdf\.|pdfjs/i.test(html) && /import\('\.\.\/vendor\/pdf\.min\.mjs'\)/.test(read('js/pdf-texto.js')) && !/pdf-texto|pdf\.min/.test(m4));
  check('vendor pdf.js es el build de Mozilla', /Mozilla Foundation/.test(read('vendor/pdf.min.mjs').slice(0, 400)) && read('vendor/pdf.worker.min.mjs').length > 500000);
  const todoJs = fs.readdirSync(S('js')).filter(x => x.endsWith('.js')).map(f => [f, read('js/' + f)]);
  check('WhatsApp: nunca un envío automático ni un bot (sin APIs de mensajería, sin timers)', todoJs.every(([f, t]) => !/graph\.facebook|api\.whatsapp|twilio|setInterval|whatsapp-web|\/messages/i.test(t)), todoJs.filter(([f, t]) => /graph\.facebook|api\.whatsapp|twilio|setInterval/i.test(t)).map(x => x[0]).join());
  const av = read('js/aviso.js');
  check('WhatsApp: el aviso se abre por un botón (click) con navigator.share con archivos o wa.me; marca avisado al compartir', /navigator\.share\(\{ files: \[file\]/.test(av) && /canShare/.test(av) && /window\.open\(url, '_blank'/.test(av) && /marcarAvisado/.test(av) && !/^\s*(window\.open|navigator\.share)/m.test(av.split('on: { click')[0].split('export function abrirAviso')[0]));
  check('el encargado no ve pagos: pedir.js/entrar.js sin pagos, facturas, comprobantes ni tablero', !/pago|factura|comprobante|tablero|cuenta_corriente/i.test(read('js/pedir.js') + read('js/entrar.js')));
  const sw = read('sw.js');
  check('el SW precachea los módulos nuevos', ['g-tablero', 'g-cuentas', 'g-facturas', 'g-historial', 'g-cargar-pago', 'g-proveedores', 'aviso', 'pagos-util', 'comprobante', 'pdf-texto'].every(m => sw.includes(`./js/${m}.js`)));
  check('api.js: sube comprobantes al bucket privado y guarda con registrar_pago (rpc transaccional)', /from\('comprobantes'\)/.test(read('js/api.js')) && /rpc\('registrar_pago'/.test(read('js/api.js')) && /rpc\('tablero'/.test(read('js/api.js')));

  // ---- Notas del equipo ----
  const nt = read('js/notas.js');
  check('notas: pantalla en el menú del encargado y de gerencia, con ruta en ambos', /id: 'notas'/.test(navEnc) && /id: 'notas'/.test(navGer) && (m4.match(/'notas': \(\) => import\('\.\/notas\.js'\)/g) || []).length === 2);
  check('notas: el SW precachea notas.js', sw.includes('./js/notas.js'));
  check('notas: sin precios ni costos', !/precio|costo|importe/i.test(nt));
  check('notas: el tema oscuro se saca al salir de la pantalla', /classList\.add\('tema-notas'\)/.test(nt) && /classList\.remove\('tema-notas'\)/.test(nt));
  const NT = await import(pathToFileURL(S('js/util.js')).href).catch(() => null);
  check('notas: etiquetas sin #, en minúscula y sin repetir', NT && NT.limpiarEtiquetas(['#Urgente', 'urgente', ' Rotura ', '##', 'faltante!']).join() === 'urgente,rotura,faltante');
  check('notas: carpetas (resueltas aparte, para gerencia, para el equipo, de gerencia)', NT && (() => {
    const a = { autor_rol: 'encargado', para: 'gerencia' }, b = { autor_rol: 'encargado', para: 'equipo' }, c = { autor_rol: 'gerencia', para: 'equipo' }, r = { ...a, resuelta_en: 'x' };
    return NT.enCarpeta(a, 'gerencia') && !NT.enCarpeta(b, 'gerencia') && NT.enCarpeta(b, 'equipo') && NT.enCarpeta(c, 'de-gerencia') && !NT.enCarpeta(r, 'todas') && NT.enCarpeta(r, 'resueltas');
  })());
  const el = read('js/elaborados.js');
  check('elaborados: pestaña del encargado y dentro de Stock en gerencia', /id: 'elaborados'/.test(navEnc) && (m4.match(/'elaborados': \(\) => import\('\.\/elaborados\.js'\)/g) || []).length === 2 && /SUBNAV_STOCK/.test(read('js/g-stock.js')));
  check('elaborados: el SW precachea elaborados.js y no muestra precios', sw.includes('./js/elaborados.js') && !/precio|costo|importe/i.test(el));
  check('elaborados: migración 0014 con permiso por local, uso del día y borrar', (() => { const q = fs.readFileSync(path.join(root, 'supabase/migrations/0014_elaborados.sql'), 'utf8'); return /mi_local\(\) = p_local/.test(q) && /uso_dia/.test(q) && /borrar_elaboracion/.test(q) && /cerrar_servicio/.test(q); })());
  check('notas: migración 0010 con RLS por local y aviso Telegram opcional', (() => { const q = fs.readFileSync(path.join(root, 'supabase/migrations/0010_notas.sql'), 'utf8'); return /enable row level security/.test(q) && /local_id = public\.mi_local\(\)/.test(q) && /avisar_nota_telegram/.test(q); })());

  console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
