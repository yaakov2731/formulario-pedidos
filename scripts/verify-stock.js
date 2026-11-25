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
  'js/main.js', 'js/util.js', 'js/api.js', 'js/ui.js', 'js/entrar.js', 'js/pedir.js', 'js/sugerido.js', 'js/busqueda.js', 'js/datos.js', 'js/g-pedidos.js', 'js/g-cargar.js', 'js/g-recibir.js', 'js/g-stock.js', 'js/g-lugares.js', 'js/contar.js', 'js/g-catalogo.js', 'js/g-categorias.js',
  'js/nucleo.js', 'js/analisis.js', 'js/g-ventas.js', 'js/g-analisis.js', 'js/g-resumen.js', 'js/ventas-global.js', 'js/g-merma.js', 'js/g-recetas.js', 'js/g-produccion.js',
  'js/g-hoy.js', 'js/hoy.js', 'js/compras-estado.js', 'js/mas.js', 'js/g-gasto.js', 'js/g-cuentas.js', 'js/g-facturas.js', 'js/g-historial.js', 'js/g-cargar-pago.js', 'js/g-proveedores.js', 'js/g-locales.js', 'js/aviso.js', 'js/notas.js', 'js/elaborados.js', 'js/pagos-util.js', 'js/comprobante.js', 'js/pdf-texto.js',
  'js/feriados.js', 'js/reposicion.js', 'js/g-comprar.js', 'js/g-hay.js', 'js/g-ajustes.js', 'js/hoja.js', 'js/g-decidir.js', 'js/g-semaforo.js', 'js/g-local.js'];
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
for (const f of ['js/pedir.js', 'js/sugerido.js', 'js/entrar.js', 'js/contar.js', 'js/inventario.js', 'js/stock-local.js', 'js/hoy.js', 'js/hoja.js', 'js/reposicion.js']) {
  const t = permitido(read(f));
  check(`${f}: sin "precio"/"costo"`, !/precio|costo|importe/i.test(t));
  check(`${f}: sin "mínimo" ni "par" visibles`, !/m[ií]nimo/i.test(t) && !/\bpar\b/i.test(t));
}
check('encargado no importa vistas de gerencia', !/from '\.\/(g-[a-z-]+|nucleo|analisis|datos|aviso|pagos-util|comprobante|pdf-texto)\.js'/.test(read('js/pedir.js') + read('js/entrar.js')));
check('encargado: ni ventas, recetas, producción ni lector de Excel en pedir.js/entrar.js', !/ventas|receta|producci[oó]n|xlsx|merma|importar_/i.test(read('js/pedir.js') + read('js/entrar.js')));
check('fase 4: Pedir trae el sugerido cargado (reposicion.js + entregaDe de sugerido.js), sin historial lo deja vacío y Mis pedidos tiene su pestaña',
  /from '\.\/sugerido\.js'/.test(read('js/pedir.js')) && /Sin historial todavía/.test(read('js/pedir.js')) && /seccionMis\(/.test(read('js/pedir.js'))
  && !/renderMis/.test(read('js/pedir.js')) && /'mis-pedidos': \(\) => import\('\.\/pedir\.js'\)/.test(read('js/main.js')) && read('sw.js').includes('./js/sugerido.js'));
check('fase 4: el sugerido no usa la cantidad ideal ni precios (solo consumo, lo que queda y lo pedido)', !/\.par\b|precio|costo|importe/i.test(read('js/sugerido.js')) && !/cargarSugerido/.test(read('js/pedir.js')));
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
  check('rutas del bucket: pagos/<proveedor>/<operación>.pdf y facturas/<proveedor>/<archivo>', PU.rutaPago('prv1', 'LRAKD8f240') === 'pagos/prv1/LRAKD8f240.pdf' && PU.rutaPago('prv1', 'OP1', { type: 'image/jpeg' }) === 'pagos/prv1/OP1.jpg' && PU.rutaPago('prv1', 'OP1', { type: 'image/png' }) === 'pagos/prv1/OP1.png' && /^facturas\/prv1\/\d+-Factura-1-.*\.pdf$/.test(PU.rutaFactura('prv1', 'Factura 1 ñ.pdf')), PU.rutaFactura('prv1', 'Factura 1 ñ.pdf'));

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
  const masGer = (m4.match(/const MAS = \{[\s\S]*?gerencia: \[[\s\S]*?\],\s*contadora:/) || [''])[0].split('gerencia:')[1] || '';
  check('gerencia: Inicio es la primera sección y Pagos, Tablero, Problemas, Locales, Comprar y Ajustes están en Más', /\[\s*\{ id: 'inicio'/.test(navGer) && ['pagos', 'tablero', 'ajustes', 'decidir', 'semaforo', 'comprar', 'stock', 'resumen', 'recetas', 'catalogo', 'notas'].every(x => masGer.includes(`id: '${x}'`)) && !/id: 'compras'/.test(masGer));
  check('contadora: solo la sección Pagos', navCon.length > 0 && /id: 'pagos'/.test(navCon) && !/pedidos|stock|ventas|tablero|catalogo|recetas|recibir/.test(navCon), navCon);
  check('el menú del encargado no tiene Pagos ni Tablero', navEnc.length > 0 && !/pagos|tablero|facturas|proveedores/.test(navEnc));
  check('las rutas de pagos, facturas y comprobantes están en gerencia y contadora; tablero y proveedores solo en gerencia',
    /contadora: \{ \.\.\.RUTAS_PAGOS \}/.test(m4) && /gerencia: \{\s*\.\.\.RUTAS_PAGOS,\s*'inicio': \(\) => import\('\.\/g-inicio\.js'\), 'costos': \(\) => import\('\.\/g-costos\.js'\), 'decidir': \(\) => import\('\.\/g-decidir\.js'\), 'semaforo': \(\) => import\('\.\/g-semaforo\.js'\), 'local': \(\) => import\('\.\/g-local\.js'\), 'producto': \(\) => import\('\.\/g-local\.js'\),\s*'tablero': \(\) => import\('\.\/g-hoy\.js'\), 'comprar': \(\) => import\('\.\/g-comprar\.js'\), 'hay': \(\) => import\('\.\/g-hay\.js'\), 'ajustes': \(\) => import\('\.\/g-ajustes\.js'\), 'proveedores'/.test(m4) && /ALIAS = \{ 'gerencia\/hoy': 'inicio' \}/.test(m4) && !/encargado: \{[^}]*(pagos|tablero|proveedores)/.test(m4));
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
  check('el SW precachea los módulos nuevos', ['g-hoy', 'hoy', 'mas', 'g-cuentas', 'g-facturas', 'g-historial', 'g-cargar-pago', 'g-proveedores', 'aviso', 'pagos-util', 'comprobante', 'pdf-texto'].every(m => sw.includes(`./js/${m}.js`)));
  check('api.js: sube comprobantes al bucket privado y guarda con registrar_pago (rpc transaccional)', /from\('comprobantes'\)/.test(read('js/api.js')) && /rpc\('registrar_pago'/.test(read('js/api.js')) && /rpc\('tablero'/.test(read('js/api.js')));

  // ---- Notas del equipo ----
  const nt = read('js/notas.js');
  const masEnc = (m4.match(/const MAS = \{\s*encargado: \[[\s\S]*?\],\s*gerencia:/) || [''])[0];
  check('notas: en Más del encargado y de gerencia, con ruta en ambos', /id: 'notas'/.test(masEnc) && /id: 'notas'/.test(masGer) && (m4.match(/'notas': \(\) => import\('\.\/notas\.js'\)/g) || []).length === 2);
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
  check('hoja por sector: Hoja, Apertura, Cierre y Retiros viven dentro de Hoy (sin pestaña propia) y Stock y Elaborados no tienen pestaña', /incluye: \['hoja', 'apertura', 'cierre', 'pedir', 'pedir-prov', 'revisar', 'retiros'/.test(navEnc) && !/id: '(hoja|retiros|elaborados|stock)'/.test(navEnc)
    && /'hoja': \(\) => import\('\.\/hoja\.js'\)/.test(m4) && /'sector': \(\) => import\('\.\/g-sector\.js'\)/.test(m4) && sw.includes('./js/hoja.js') && sw.includes('./js/g-retiros.js'));
  check('hoja por sector: el encargado no ve precios ni cálculos', !/precio|costo|fmtMoney|consumo/i.test(read('js/hoja.js').replace(/^\/\/.*$/gm, '')) && !/precio|costo|fmtMoney/i.test(read('js/retiros.js').replace(/^\/\/.*$/gm, '')));
  check('hoja por sector: migración 0031 con permiso por local y merma/retiro en movimientos', (() => { const q = fs.readFileSync(path.join(root, 'supabase/migrations/0031_hoja_sector.sql'), 'utf8'); return /mi_local\(\) = p_local/.test(q) && /'merma', -c/.test(q) && /'uso_dia', -c/.test(q) && /hoja_borrar/.test(q); })());
  check('elaborados: sigue la ruta del encargado y dentro de Stock en gerencia', /'elaborados'/.test(navEnc) && (m4.match(/'elaborados': \(\) => import\('\.\/elaborados\.js'\)/g) || []).length === 2 && /SUBNAV_STOCK/.test(read('js/g-stock.js')));
  check('elaborados: el SW precachea elaborados.js y no muestra precios', sw.includes('./js/elaborados.js') && !/precio|costo|importe/i.test(el));
  check('elaborados: migración 0014 con permiso por local, uso del día y borrar', (() => { const q = fs.readFileSync(path.join(root, 'supabase/migrations/0014_elaborados.sql'), 'utf8'); return /mi_local\(\) = p_local/.test(q) && /uso_dia/.test(q) && /borrar_elaboracion/.test(q) && /cerrar_servicio/.test(q); })());
  check('notas: migración 0010 con RLS por local y aviso Telegram opcional', (() => { const q = fs.readFileSync(path.join(root, 'supabase/migrations/0010_notas.sql'), 'utf8'); return /enable row level security/.test(q) && /local_id = public\.mi_local\(\)/.test(q) && /avisar_nota_telegram/.test(q); })());

  // ---- Rediseño estilo Apple · fases 2 y 3 ----
  const ui = read('js/ui.js');
  const pestanas = (bloque) => (bloque.match(/\{ id: '/g) || []).length;
  const labels = (bloque) => [...bloque.matchAll(/label: '([^']+)'/g)].map(m => m[1]).join(' · ');
  check('rediseño v2: encargado Hoy · Pedidos · Más (también el Shopping); gerencia Inicio · Stock · Pedidos · Costos · Más con chip de módulo', labels(navEnc) === 'Hoy · Pedidos · Más' && labels(navGer) === 'Inicio · Stock · Pedidos · Costos · Más'
    && /id: 'mis-pedidos', label: 'Pedidos'/.test(navEnc) && /chip-mod/.test(m4) && /dataset\.modulo = modulo/.test(m4) && /miga-mod/.test(m4)
    && pestanas(navCon) <= 4 && /const navDe = \(c\) => NAV\[c\.rol\];/.test(m4) && /'pedir-prov': \(\) => import\('\.\/pedir\.js'\), 'apertura': \(\) => import\('\.\/hoja\.js'\), 'cierre': \(\) => import\('\.\/hoja\.js'\)/.test(m4),
    labels(navEnc) + ' / ' + labels(navGer));
  check('fase 2: Stock sin tercer nivel (Control con filtro Hoy · Semana · Pérdida; Retiros y Conteos se abren desde ahí)', /SUBNAV_CONTROL = \[\['sector', 'Hoy'\], \['control', 'Semana'\], \['perdida', 'Pérdida'\]\]/.test(ui) && /CONTROL_ABRE = \[\['g-retiros', 'Retiros'\], \['conteos', 'Conteos'\]\]/.test(ui) && !/subnav2/.test(ui));
  check('fase 2: Compras junta Pedidos · Armar (Por proveedor · Por producto) · Recibir · Gasto', /SUBNAV_ARMAR = \[\['compras', 'Por proveedor'\], \['por-producto', 'Por producto'\]\];/.test(ui) && /SUBNAV_COMPRAS = \[\['pedidos', 'Pedidos'\], \['compras', 'Armar', SUBNAV_ARMAR\], \['recibir', 'Recibir'\], \['gasto', 'Gasto'\]\]/.test(ui));
  check('fase 2: un solo selector de local (chipsLocal usa selectorLocal)', /selectorLocal\(\{ locales, clave: 'g:local'/.test(read('js/datos.js')) && !/class: 'chip' \+ \(l\.id === localId/.test(read('js/g-stock.js')));
  check('fase 2: Más es una pantalla para todos los roles', /mas: \(\) => import\('\.\/mas\.js'\)/.test(m4));
  const hy = read('js/hoy.js'), gh = read('js/g-hoy.js');
  check('fase 3: Hoy del encargado con abrir, pedido, mercadería, factura y cierre; vacío "Todo listo por hoy"', ['abrir', 'pedir', 'llego', 'factura', 'cerrar'].every(t => hy.includes(`tarea('${t}'`)) && /Todo listo por hoy/.test(hy) && /depósito/.test(hy));
  check('fase 3: Hoy del encargado sin precios, facturas de gerencia ni tablero', !/fmtMoney|precio|costo|tablero|facturasLista|facturasLocales/.test(hy) && !/from '\.\/(g-[a-z-]+|datos)\.js'/.test(hy));
  check('fase 3: Hoy de gerencia con aprobar, entregas, facturas por vencer, diferencias y locales; solo consultas de api.js', ['aprobar', 'entregas', 'facturas', 'diferencias', 'locales'].every(g => gh.includes(`'data-grupo': '${g}'`)) && /Todo listo por hoy/.test(gh) && /Falta cargar/.test(gh) && !/sb\.|supabase/.test(gh));
  check('fase 3: g-tablero.js absorbido por g-hoy.js', !fs.existsSync(S('js/g-tablero.js')) && !/g-tablero/.test(m4 + sw));

  // ---- Fase 6 · Compras con un estado, recibir contra lo pedido, reclamo y subas de precio ----
  const ce = read('js/compras-estado.js'), gp = read('js/g-pedidos.js'), gr = read('js/g-recibir.js'), grf = read('js/g-recibir-factura.js');
  check('fase 6: estados visibles Para aprobar · Para enviar · Enviado · Llegó incompleto · Recibido', ['Para aprobar', 'Para enviar', "'Enviado'", 'Llegó incompleto', "'Recibido'"].every(t => ce.includes(t)));
  check('fase 6: Compras y Recibir muestran un solo estado (sin lista de estados por tarjeta)', !/estados\.map\(/.test(gp) && !/ESTADOS\[/.test(gp + gr) && /estadoDeVarias\(os\)/.test(gp) && /claseEstado\(k\)/.test(gr));
  check('fase 6: Recibir abre con lo pedido, «Llegó todo» y «Reclamar faltante»', /'Llegó todo'/.test(gr) && /Reclamar faltante/.test(gr) && /textoReclamo\(/.test(gr) && /razonLocal\(o\.local_id\)/.test(gr));
  check('fase 6: aviso de suba en Recibir y Recibir con factura; Subas de precio en Hoy', /subaPrecio\(/.test(gr) && /subaPrecio\(/.test(grf) && /'Subas de precio'/.test(gh) && /'data-grupo': 'subas'/.test(gh));
  check('fase 6: lo de compras no llega a pantallas del encargado', !['js/pedir.js', 'js/hoy.js', 'js/entrar.js', 'js/contar.js', 'js/hoja.js'].some(f => /compras-estado|g-recibir/.test(read(f))));

  // ---- Pérdida de la semana y productos clave (solo gerencia) ----
  const pe = read('js/perdida.js'), gpe = read('js/g-perdida.js');
  check('pérdida: una sola cuenta del día (calcularSector vive en perdida.js; g-sector, g-hoy y g-perdida la importan)', /export function calcularSector/.test(pe) && !/function calcularSector/.test(read('js/g-sector.js'))
    && /from '\.\/perdida\.js'/.test(read('js/g-sector.js')) && /from '\.\/perdida\.js'/.test(gh) && /costoUnidad/.test(read('js/g-control.js')));
  check('pérdida: perdida.js es pura (sin DOM ni Supabase)', !/document\.|window\.|from '\.\/(api|ui|datos)\.js'/.test(pe));
  check('pérdida: Hoy de gerencia con "Pérdida de la semana" (Sin explicar · Merma) que abre Stock → Control → Pérdida', /'Pérdida de la semana'/.test(gh) && /'data-grupo': 'perdida'/.test(gh) && /Sin explicar/.test(gh) && /desdeHoy\('perdida'\)/.test(gh));
  check('pérdida: ruta de gerencia, dentro de Stock, en el SW', /'perdida': \(\) => import\('\.\/g-perdida\.js'\)/.test(m4) && /id: 'hay'[^\n]*incluye: \[[^\]]*'sector', 'control', 'perdida', 'semaforo'/.test(m4) && sw.includes('./js/perdida.js') && sw.includes('./js/g-perdida.js'));
  check('pérdida: detalle con lo que más pesa, semana anterior y productos clave; sin datos no estima', /'Lo que más pesa'/.test(gpe) && /'Semana anterior'/.test(gpe) && /'Productos clave'/.test(gpe) && /Sin historial todavía/.test(gpe) && /Falta cargar costos/.test(gpe));
  check('pérdida: nada de esto en pantallas del encargado', !['js/pedir.js', 'js/hoy.js', 'js/entrar.js', 'js/contar.js', 'js/hoja.js', 'js/inventario.js', 'js/stock-local.js', 'js/retiros.js'].some(f => /perdida/.test(read(f))) && !/encargado: \{[^}]*perdida/.test(m4));

  // ---- Cierre y compras (0032) ----
  const hj = read('js/hoja.js'), gc = read('js/g-comprar.js'), gy = read('js/g-hay.js'), ga = read('js/g-ajustes.js'), rp = read('js/reposicion.js'), ap = read('js/api.js');
  check('cierre: la Hoja guarda con una sola llamada (hojaGuardar) y el Shopping sigue con la hoja por sector', /hojaGuardar\(lid, fecha, modo, items/.test(hj) && /if \(!elabora\(ctx\.codigoLocal\)\) return renderSector/.test(hj) && /export function sectoresDe/.test(hj) && /TODO_EL_LOCAL/.test(hj) && /PROVEEDOR/.test(hj) && /ELABORE/.test(hj));
  check('cierre: sin 0032 cae a hoja_contar por sector y los locales se leen sin dias_abre', /hayHojaGuardar = false/.test(ap) && /hojaContar\(localId, sector, fecha, tipo, its, quien\)/.test(ap) && /hayDiasAbre = false/.test(ap) && /hoja_guardar/.test(ap));
  check('cierre: resultado con "Sin historial" y "para mañana" solo si mañana abre', /sin historial/i.test(hj) && /prox\.dias === 1/.test(hj) && /Terminar cierre/.test(hj) && /Todo igual, confirmar apertura/.test(hj));
  check('cierre: reposicion.js y feriados.js en el SW; Comprar, Lo que hay y Ajustes también', ['reposicion', 'feriados', 'g-comprar', 'g-hay', 'g-ajustes'].every(x => sw.includes('./js/' + x + '.js')));
  check('cierre: Comprar avisa el mínimo de De Ridder y deja fuera a los locales sin cierre', /MINIMO_DE_RIDDER = 100000/.test(gc) && /Sin cierre no hay cálculo para ese local/.test(gc) && /cierres hechos/.test(gc) && /precargarPedido/.test(gc));
  check('cierre: Lo que hay con tendencia solo con 2 o más cierres reales y ficha con los últimos 8', /serie\.length >= 2/.test(gy) && /export function abrirFicha/.test(gy) && /ultimosCierres|slice\(-8\)/.test(ap + gy));
  check('cierre: Ajustes guarda dias_abre y abre_feriados', /dias_abre: d, abre_feriados: fer/.test(ga));
  check('cierre: el Shopping no entra en Comprar ni Lo que hay', /elabora\(l\.codigo\)/.test(gy));
  check('cierre: reposicion.js sin DOM ni Supabase', !/document\.|window\.|from '\.\/(api|ui|datos)\.js'/.test(rp));

  // ---- Rediseño de cero (Guiado para el encargado, Semáforo para gerencia) ----
  const css = read('css/stock.css'), pd = read('js/pedir.js'), gd = read('js/g-decidir.js'), gs = read('js/g-semaforo.js'), gl = read('js/g-local.js');
  check('rediseño v2: sin Geist; el único degradé es el encabezado dorado de las cajas del turno (--caja-head)', !/Geist/i.test(css + html + ui) && (css.match(/gradient\(/g) || []).length === 1 && /--caja-head: linear-gradient\(90deg, #C69A45, #8E6A2B\)/.test(css));
  check('rediseño v2: encargado negro y dorado fijo (#0D0C0A, #D4A852, #EDE6D6, Barlow Condensed en mayúscula) y gerencia clara #F6F7F9/#1B1E27 con Sora + Manrope y oscuro por prefers-color-scheme', /:root \{\s*color-scheme: dark;\s*--bg: #0D0C0A;/.test(css) && /--accent: #D4A852;/.test(css) && /--text: #EDE6D6;/.test(css) && /--font-display: "Barlow Condensed"/.test(css) && /--title-case: uppercase;/.test(css)
    && /:root\[data-rol="gerencia"\], :root\[data-rol="contadora"\] \{\s*color-scheme: light;\s*--bg: #F6F7F9;/.test(css) && /--text: #1B1E27;/.test(css) && /--font-display: "Sora"/.test(css) && /"Manrope"/.test(css)
    && /@media \(prefers-color-scheme: dark\) \{\s*:root\[data-rol="gerencia"\], :root\[data-rol="contadora"\] \{/.test(css) && !/@media \(prefers-color-scheme: dark\) \{\s*:root \{/.test(css)
    && /color-scheme" content="light dark"/.test(html) && /family=Barlow:/.test(html) && /Barlow\+Condensed/.test(html) && /family=Sora/.test(html) && /family=Manrope/.test(html) && /media="print" onload/.test(html) && /dataset\.rol = c\.rol/.test(m4) && /colorBarra\(c\.rol\)/.test(m4));
  check('rediseño v2: colores de módulo (stock #2F6FE4, pedidos #1F9D63, costos #E9A913 con tinta #2A1F00, recetas #EE7A1E, problemas #D8434B) y [data-modulo] redefine --accent', /--mod-stock: #2F6FE4/.test(css) && /--mod-pedidos: #1F9D63/.test(css) && /--mod-costos: #E9A913; --mod-costos-ink: #2A1F00/.test(css) && /--mod-recetas: #EE7A1E/.test(css) && /--mod-problemas: #D8434B/.test(css)
    && ['stock', 'pedidos', 'costos', 'recetas', 'problemas'].every(m => new RegExp(`:root\\[data-modulo="${m}"\\] \\{ --accent: var\\(--mod-${m}\\)`).test(css)));
  check('rediseño: contar guiado en hoja.js (teclado propio, sin input) y una sola llamada a hojaGuardar para lista y guiada', /function pintarGuiada/.test(hj) && /teclado\(/.test(hj) && (hj.match(/hojaGuardar\(/g) || []).length === 1
    && /hoja-dia:\$\{lid\}:\$\{fecha\}:\$\{tipo\}/.test(hj) && /Ayer/.test(hj) && /Van en 0/.test(hj) && !/h\('input'[^\n]*gd-/.test(hj));
  check('rediseño: Hoy con botones grandes (Abrir → #/apertura, Cerrar → #/cierre, Pedir → #/pedir-prov) y sin anillo', /botonGrande\(/.test(hy) && /'#\/apertura'/.test(hy) && /'#\/cierre'/.test(hy) && /'#\/pedir-prov'/.test(hy) && !/avanceDelDia|av-anillo/.test(hy + css));
  check('rediseño: pedir por proveedor reusa enviarGrupo (Revisar y Pedir por proveedor) y crea en borrador', (pd.match(/await enviarGrupo\(/g) || []).length === 2 && /async function enviarGrupo/.test(pd) && /Mandar pedido/.test(pd) && /Buscar otro producto/.test(pd));
  check('rediseño: Decidir con pedidos, subas y cierres; Aprobar abre Compras (no aprueba) y Aceptar queda en este equipo', /tarjetaDecidir\(/.test(gd) && /Nada para decidir/.test(gd) && /cierresDeAnoche/.test(gd) && /subasRecientes/.test(gd) && !/actualizarOrden|estado: 'aprobada'/.test(gd) && /lsSet\(claveVisto/.test(gd) && /wa\.me\/\?text=/.test(gd));
  check('rediseño: semáforo con umbrales 3 % y 1 %, "Falta dato" y Shopping por retiros; detalle con barras de 6 semanas', /ROJO = 3, AMBAR = 1/.test(gs) && /Falta dato/.test(gs) && /por retiros/.test(gs) && /retiros? sin destino/.test(gs) && /barrasSemanas\(/.test(gl) && /detalleSemana/.test(gl) && /export function detalleSemana/.test(pe));
  check('rediseño: el SW precachea las pantallas nuevas', ['g-decidir', 'g-semaforo', 'g-local'].every(x => sw.includes('./js/' + x + '.js')));

  // ---- Compras → Armar: Por producto (hoja de armado) e impresión A4 horizontal ----
  const pp = read('js/g-por-producto.js'), ci = read('js/compras-impresion.js'), gPed = read('js/g-pedidos.js');
  check('armar: ruta #/por-producto en Compras de gerencia y en el SW', /'por-producto': \(\) => import\('\.\/g-por-producto\.js'\)/.test(m4) && /incluye: \['compras', 'por-producto'/.test(m4) && sw.includes('./js/g-por-producto.js') && sw.includes('./js/compras-impresion.js'));
  check('armar: Por producto lee los mismos pedidos vivos (para aprobar y aprobados), sin escribir ni mostrar precios', /ordenesPorEstado\(VIVAS\)/.test(pp) && /export const VIVAS = \['borrador', 'aprobada'\]/.test(ci) && !/actualizarItem|actualizarOrden|borrarItem|marcarExcluidos|fmtMoney|G\.precios|'precios'/.test(pp) && !/fmtMoney|G\.precios/.test(ci));
  check('armar: Por proveedor imprime con la orden de compra nueva (encabezado, responsable para firmar, entrega y facturación)', /ordenProveedor\(prov, os\)/.test(gPed) && !/function hojaImpresion/.test(gPed) && /\['Aprobó', ''\]/.test(ci) && /\['Responsable del armado', ''\]/.test(ci) && /cargado_por_nombre/.test(ci) && /Entrega y facturación/.test(ci));
  check('impresión: @page A4 horizontal con "Página N de M" (counter(page) y counter(pages))', /@page \{ size: A4 landscape;/.test(css) && /@bottom-center \{ content: "Página " counter\(page\) " de " counter\(pages\)/.test(css));
  check('impresión: encabezado dentro del thead (se repite), thead repetido, filas enteras, grupo pegado a su fila y un documento por hoja', /h\('thead', \{\},\s*h\('tr', \{ class: 'pr-run' \}/.test(ci) && /\.pr-tabla thead \{ display: table-header-group; \}/.test(css) && /\.pr-tabla tr \{ break-inside: avoid; \}/.test(css) && /tr\.pr-grupo \{ break-inside: avoid; break-after: avoid;/.test(css) && /\.pr-prov \+ \.pr-prov \{ break-before: page; \}/.test(css));

  // ---- Rediseño v2: Inicio de módulos, Costos, el turno del encargado y FIFO ----
  const gi = read('js/g-inicio.js'), gco = read('js/g-costos.js'), co = read('js/costos.js'), ff = read('js/fifo.js');
  const sinCodigoComentado = (t) => t.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  check('v2: hoy.js, fifo.js y hoja.js no importan ni muestran precios (ni costos, ni datos de gerencia)', ['js/hoy.js', 'js/fifo.js', 'js/hoja.js'].every(f => {
    const t = sinCodigoComentado(read(f));
    return !/precio|cargarPrecios|precio_actual|fmtMoney|costo|from '\.\/(datos|costos|g-costos|g-hay)\.js'/i.test(t);
  }));
  check('v2: Inicio con 5 tarjetas (Problemas a lo ancho), cada número con Promise.allSettled y "Falta dato" sin inventar', /export function tarjetaModulo/.test(ui) && (gi.match(/tarjetaModulo\(/g) || []).length === 5 && /modulo: 'problemas'[^\n]*ancho: true/.test(gi)
    && /Promise\.allSettled/.test(gi) && /Falta dato/.test(ui) && /ordenesPorEstado\(\['borrador'\]\)/.test(gi) && /cierresDeAnoche/.test(gi) && /claveVisto/.test(gi) && /textoAlcanza/.test(gi) && /cargarReposicion/.test(gi) && /Todo en orden/.test(gi));
  check('v2: costos.js puro (sin DOM ni Supabase) con meta 30 % y precio sugerido a $100', !/document\.|window\.|from '\.\/(api|ui|datos)\.js'/.test(co) && /export const META = 0\.30/.test(co) && /export function costoReceta/.test(co) && /export function resumenCostos/.test(co) && /\/ 100\) \* 100/.test(co));
  check('v2: Costos con lista (cobertura "n de m platos") y ficha numerada; nota del precio de venta de Núcleo', /de \$\{res\.total\} platos con todos los datos/.test(gco) && /pasoFicha\(1, 'Ingredientes'/.test(gco) && /pasoFicha\(4,/.test(gco) && /Precio de venta = promedio de Núcleo \(puede incluir IVA\)/.test(gco) && /ventasItemsTodos/.test(gco) && /producto_id'\)/.test(ap));
  check('v2: Hoy del encargado con la línea del turno, cajas con encabezado dorado y botón grande; sin merma', /lineaTurno\(/.test(hy) && /cajaTurno\(/.test(hy) && /'data-principal'/.test(hy) && /export function cajaTurno/.test(ui) && /Nada pendiente/.test(ui) && !/merma/i.test(sinCodigoComentado(hy)));
  check('v2: FIFO en el contar guiado (fifo.js puro, solo fechas de recepciones y producciones, ventana de 45 días)', !/document\.|window\.|from '\.\//.test(ff) && /DIAS_FIFO = 45/.test(ff) && /Sin fecha de entrada/.test(ff) && /Primero · entró/.test(ff)
    && /entradasRecientes\(lid/.test(hj) && /etiquetasFifo\(/.test(hj) && /select\('producto_id,creado_en'\)\.eq\('local_id', localId\)\.eq\('tipo', 'recepcion'\)/.test(ap) && /from\('producciones'\)\.select\('producto_id,creado_en'\)/.test(ap));
  check('v2: el SW precachea Inicio, Costos y FIFO; VERSION sigue en stock-v1 (la versiona el deploy)', ['g-inicio', 'g-costos', 'costos', 'fifo'].every(x => sw.includes('./js/' + x + '.js')) && /const VERSION = 'stock-v1'/.test(sw));
  check('v2: Costos e Inicio solo en gerencia', !/encargado: \{[^}]*(costos|inicio)/.test(m4) && !/contadora: \{[^}]*(costos|inicio)/.test(m4));

  console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
