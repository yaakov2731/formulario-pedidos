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
  'js/main.js', 'js/util.js', 'js/api.js', 'js/ui.js', 'js/entrar.js', 'js/pedir.js', 'js/datos.js', 'js/g-pedidos.js', 'js/g-recibir.js', 'js/g-stock.js', 'js/g-catalogo.js'];
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
check('encargado no importa vistas de gerencia', !/g-pedidos|g-recibir|g-stock|g-catalogo|datos\.js/.test(read('js/pedir.js')));
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

console.log(fallas ? `\n${fallas} FAIL` : '\nTodo OK');
process.exit(fallas ? 1 : 0);
