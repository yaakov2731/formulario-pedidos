#!/usr/bin/env node
// Chequeos estáticos de stock/ (CI, sin dependencias).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const S = (p) => path.join(root, 'stock', p);
const read = (p) => fs.readFileSync(S(p), 'utf8');
let fallas = 0;
const check = (n, ok, x) => { console.log((ok ? 'OK   ' : 'FAIL ') + n + (!ok && x ? ' -> ' + x : '')); if (!ok) fallas++; };

const archivos = ['index.html', 'config.js', 'manifest.webmanifest', 'sw.js', 'css/stock.css', 'vendor/supabase.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/icon.svg',
  'vendor/xlsx.full.min.js', 'vendor/README.md',
  'js/main.js', 'js/util.js', 'js/api.js', 'js/ui.js', 'js/entrar.js', 'js/pedir.js', 'js/datos.js', 'js/g-pedidos.js', 'js/g-recibir.js', 'js/g-stock.js', 'js/g-catalogo.js',
  'js/nucleo.js', 'js/analisis.js', 'js/g-ventas.js', 'js/g-analisis.js', 'js/g-merma.js', 'js/g-recetas.js', 'js/g-produccion.js'];
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
check('encargado no importa vistas de gerencia', !/g-pedidos|g-recibir|g-stock|g-catalogo|g-ventas|g-analisis|g-merma|g-recetas|g-produccion|nucleo|analisis\.js|datos\.js/.test(read('js/pedir.js')));
check('encargado: ni ventas, recetas, producción ni lector de Excel en pedir.js/entrar.js', !/ventas|receta|producci[oó]n|xlsx|merma|importar_/i.test(read('js/pedir.js') + read('js/entrar.js')));
check('encargado: sugerido por rpc sugerido_pedido (sin consultar tablas de ventas)', /rpc\('sugerido_pedido'/.test(read('js/api.js')) && /cargarSugerido/.test(read('js/pedir.js')));
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

  console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
