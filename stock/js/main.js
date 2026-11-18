// Arranque, sesión, ruteo por hash y estructura (barra lateral en escritorio, tab bar en celular).
import { h, lsGet, elabora } from './util.js';
import { sb, perfilActual, codigoMiLocal, salir, mensajeError } from './api.js';
import { icon, toast, esqueleto, activarTituloGrande, CLAVE_DESDE_HOY } from './ui.js';

// Cuatro pestañas por rol y la primera es Hoy (rediseño estilo Apple, fase 2). incluye: pantallas que viven dentro de esa
// pestaña (quedan marcadas en ella). Lo demás está en Más, una lista tipo Ajustes (mas.js, MAS de abajo).
const NAV = {
  encargado: [
    { id: 'hoy', label: 'Hoy', icono: 'hoy' },
    { id: 'pedir', label: 'Pedir', icono: 'pedir', incluye: ['revisar', 'mis-pedidos'] },
    { id: 'hoja', label: 'Hoja', icono: 'hoja', incluye: ['lugares', 'contar', 'stock', 'elaborados'] },
    { id: 'retiros', label: 'Retiros', icono: 'retiro', incluye: ['hoja', 'lugares', 'contar', 'stock'] },
    { id: 'mas', label: 'Más', icono: 'menu', incluye: ['subir-factura', 'notas'] }
  ],
  gerencia: [
    { id: 'hoy', label: 'Hoy', icono: 'hoy' },
    { id: 'compras', label: 'Compras', icono: 'pedir', incluye: ['pedidos', 'cargar', 'cargar-revisar', 'recibir', 'recibir-factura', 'gasto'] },
    { id: 'stock', label: 'Stock', icono: 'stock', incluye: ['sector', 'control', 'perdida', 'g-retiros', 'conteos', 'lugares'] },
    { id: 'mas', label: 'Más', icono: 'menu', incluye: ['resumen', 'ventas', 'analisis', 'merma', 'recetas', 'produccion', 'elaborados', 'pagos', 'facturas', 'historial', 'cargar-pago',
      'catalogo', 'categorias', 'proveedores', 'locales', 'notas'] }
  ],
  contadora: [
    { id: 'pagos', label: 'Pagos', icono: 'pagos', incluye: ['gasto', 'facturas', 'historial', 'cargar-pago'] },
    { id: 'mas', label: 'Más', icono: 'menu' }
  ]
};
// Más: filas tipo Ajustes. Encargado: Facturas y Notas (el Shopping suma su hoja del depósito). Gerencia: Números, Cocina,
// Pagos, Catálogo y Notas. Abajo de todo, con quién se entró y Cerrar sesión.
const MAS = {
  encargado: [
    { id: 'hoja', label: 'Hoja del depósito', icono: 'hoja', soloShopping: true },
    { id: 'subir-factura', label: 'Facturas', icono: 'recibir' },
    { id: 'notas', label: 'Notas', icono: 'nota' }
  ],
  gerencia: [
    { id: 'resumen', label: 'Números', icono: 'ventas', sub: 'Ventas, análisis, merma' },
    { id: 'recetas', label: 'Cocina', icono: 'cocina', sub: 'Recetas, producción, elaborados' },
    { id: 'pagos', label: 'Pagos', icono: 'pagos', sub: 'Cuentas, facturas, pagos' },
    { id: 'catalogo', label: 'Catálogo', icono: 'catalogo', sub: 'Productos, proveedores, locales' },
    { id: 'notas', label: 'Notas', icono: 'nota' }
  ],
  contadora: []
};
// Rutas viejas que cambiaron de nombre: siguen andando y llevan a la nueva.
const ALIAS = { 'gerencia/tablero': 'hoy' };
const RUTAS_PAGOS = { 'gasto': () => import('./g-gasto.js'), 'pagos': () => import('./g-cuentas.js'), 'facturas': () => import('./g-facturas.js'), 'cargar-pago': () => import('./g-cargar-pago.js'), 'historial': () => import('./g-historial.js') };
const VISTAS = {
  encargado: { 'hoy': () => import('./hoy.js'), 'pedir': () => import('./pedir.js'), 'revisar': () => import('./pedir.js'), 'mis-pedidos': () => import('./pedir.js'), 'hoja': () => import('./hoja.js'), 'retiros': () => import('./retiros.js'), 'stock': () => import('./stock-local.js'), 'contar': () => import('./contar.js'), 'lugares': () => import('./g-lugares.js'), 'elaborados': () => import('./elaborados.js'), 'subir-factura': () => import('./subir-factura.js'), 'notas': () => import('./notas.js') },
  contadora: { ...RUTAS_PAGOS },
  gerencia: {
    ...RUTAS_PAGOS,
    'hoy': () => import('./g-hoy.js'), 'proveedores': () => import('./g-proveedores.js'), 'locales': () => import('./g-locales.js'),
    'pedidos': () => import('./g-pedidos.js'), 'compras': () => import('./g-pedidos.js'), 'cargar': () => import('./g-cargar.js'), 'cargar-revisar': () => import('./g-cargar.js'), 'recibir': () => import('./g-recibir.js'), 'recibir-factura': () => import('./g-recibir-factura.js'),
    'stock': () => import('./g-stock.js'), 'sector': () => import('./g-sector.js'), 'g-retiros': () => import('./g-retiros.js'), 'lugares': () => import('./g-lugares.js'), 'conteos': () => import('./g-conteos.js'), 'control': () => import('./g-control.js'), 'perdida': () => import('./g-perdida.js'), 'elaborados': () => import('./elaborados.js'), 'catalogo': () => import('./g-catalogo.js'), 'categorias': () => import('./g-categorias.js'),
    'resumen': () => import('./g-resumen.js'), 'ventas': () => import('./g-ventas.js'), 'analisis': () => import('./g-analisis.js'), 'merma': () => import('./g-merma.js'),
    'recetas': () => import('./g-recetas.js'), 'produccion': () => import('./g-produccion.js'),
    'notas': () => import('./notas.js')
  }
};

const $app = document.getElementById('app');
const $view = document.getElementById('view');
// La ventana queda fija (sin rebote en iPhone) y lo que scrollea es #scroller: los window.scrollTo de las vistas van ahí.
const $scroller = document.getElementById('scroller');
const scrollVentana = window.scrollTo.bind(window);
window.scrollTo = (...a) => { scrollVentana(...a); if ($scroller) $scroller.scrollTo(...a); };
const $side = document.getElementById('sidebar');
const $tab = document.getElementById('tabbar');

let ctx = null;
let ticket = 0;
let limpiar = null;

function registrarSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function mostrarEntrar() {
  ctx = null; ticket++;
  if (limpiar) { try { limpiar(); } catch (_e) { /* nada */ } limpiar = null; }
  $app.classList.add('no-nav'); $side.replaceChildren(); $tab.replaceChildren(); $tab.hidden = true;
  const { montarEntrar } = await import('./entrar.js');
  montarEntrar($view, async () => { await arrancar(); });
}

function pantallaSimple(titulo, texto, acciones) {
  $app.classList.add('no-nav'); $side.replaceChildren(); $tab.replaceChildren(); $tab.hidden = true;
  $view.replaceChildren(h('section', { class: 'center-card' },
    h('h1', { class: 'titulo', text: titulo }), h('p', { class: 'sub', text: texto }), h('div', { class: 'acciones' }, acciones)));
}

// Encargado: una sola Hoja por sector (apertura, entró, devolví, merma, cierre). Stock, Contar y Elaborados ya no están
// en el menú (las rutas siguen andando). El Shopping (no elabora) tiene Retiros en lugar de Hoja: qué sale del depósito y
// a dónde va; su hoja (abrir y cerrar el depósito) se abre desde Hoy y desde Más.
const shopping = (c) => c.rol === 'encargado' && !elabora(c.codigoLocal);
const navDe = (c) => NAV[c.rol].filter(it => !(c.rol === 'encargado' && it.id === (shopping(c) ? 'hoja' : 'retiros')));
const masDe = (c) => (MAS[c.rol] || []).filter(it => !it.soloShopping || shopping(c));
const vistasDe = (c) => {
  const v = { ...VISTAS[c.rol], mas: () => import('./mas.js') };
  if (c.rol === 'encargado') { if (elabora(c.codigoLocal)) delete v.retiros; else delete v.elaborados; }
  return v;
};
// Pestaña que queda marcada para una pantalla.
function pestanaDe(id) {
  if (!ctx) return id;
  const items = navDe(ctx);
  const it = items.find(x => x.id === id) || items.find(x => (x.incluye || []).includes(id));
  return it ? it.id : id;
}

function construirShell(c) {
  const items = navDe(c);
  const mas = masDe(c);
  $app.classList.remove('no-nav');
  const enlace = (it, clase) => h('a', { class: clase + (it.id === 'mas' && clase === 'tab' ? ' tab-mas' : ''), href: '#/' + it.id, 'data-nav': it.id, 'data-mas': it.id === 'mas' ? mas.map(x => x.id).join(' ') : null }, icon(it.icono, clase === 'tab' ? 22 : 20), h('span', { text: it.label }));
  const salirBtn = (clase) => h('button', { class: clase, type: 'button', on: { click: cerrarSesion } }, icon('salir', clase === 'tab' ? 22 : 20), h('span', { text: 'Salir' }));
  // En escritorio la barra lateral muestra las mismas pestañas (Más solo si tiene secciones) y Salir.
  const lateral = items.filter(it => it.id !== 'mas' || mas.length);
  $side.replaceChildren(
    h('div', { class: 'side-brand' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 36, height: 36 }), h('div', {}, h('b', { text: 'Docks del Puerto' }), h('small', { text: quienEs(c) }))),
    h('nav', { class: 'side-nav' }, lateral.map(it => enlace(it, 'side-link')), salirBtn('side-link side-out'))
  );
  $tab.replaceChildren(...items.map(it => enlace(it, 'tab')));
  $tab.hidden = false;
  $tab.classList.remove('tabbar-7', 'tabbar-scroll');
}
const quienEs = (c) => (c.rol === 'gerencia' ? 'Gerencia' : (c.rol === 'contadora' ? 'Administración' : (c.perfil.nombre || 'Local')));
async function cerrarSesion() { ctx = null; await salir(); mostrarEntrar(); }

function marcarActivo(id) {
  const act = pestanaDe(id);
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.getAttribute('data-nav') === act;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

// "‹ Hoy" arriba de la pantalla a la que se llegó desde una tarea de Hoy.
function volverAHoy(id) {
  let desde = null;
  try { desde = sessionStorage.getItem(CLAVE_DESDE_HOY); } catch (_e) { /* nada */ }
  if (desde !== id) { if (desde && id !== 'hoy') { try { sessionStorage.removeItem(CLAVE_DESDE_HOY); } catch (_e) { /* nada */ } } return null; }
  return h('a', { class: 'volver-hoy', href: '#/hoy', on: { click: () => { try { sessionStorage.removeItem(CLAVE_DESDE_HOY); } catch (_e) { /* nada */ } } } }, icon('atras', 20), h('span', { text: 'Hoy' }));
}

const VERSION_NUEVA = /does not provide an export named|dynamically imported module|Importing a module script failed|error loading dynamically imported|is not a valid JavaScript MIME/i;

async function ruta() {
  if (!ctx) return;
  const [, id] = (location.hash || '').split('/');
  const vistas = vistasDe(ctx);
  const def = navDe(ctx)[0].id;
  const alias = ALIAS[ctx.rol + '/' + id];
  if (alias) { location.replace('#/' + alias); return; }
  if (!id || !vistas[id]) { location.replace('#/' + def); return; }
  const mi = ++ticket;
  if (limpiar) { try { limpiar(); } catch (_e) { /* nada */ } limpiar = null; }
  marcarActivo(id);
  $view.replaceChildren(esqueleto(5));
  try {
    const mod = await vistas[id]();
    if (mi !== ticket) return;
    const root = h('div', { class: 'vista' });
    const volver = volverAHoy(id);
    $view.replaceChildren(...(volver ? [volver, root] : [root]));
    const vctx = { ...ctx, alive: () => mi === ticket, ir: (r) => { location.hash = '#/' + r; }, mas: masDe(ctx), quien: quienEs(ctx), salir: cerrarSesion };
    const res = await mod.render(root, vctx, id);
    if (mi === ticket && typeof res === 'function') limpiar = res;
    window.scrollTo(0, 0);
  } catch (e) {
    if (mi !== ticket) return;
    // Se publicó una versión nueva con la app abierta: el navegador mezcla archivos viejos (ya cargados) con nuevos.
    // Se recarga sola una vez; si vuelve a pasar, se ofrece actualizar a mano.
    if (VERSION_NUEVA.test(String(e && e.message || e))) {
      let ultima = 0; try { ultima = Number(sessionStorage.getItem('stock:recarga')) || 0; } catch (_e) { /* nada */ }
      if (Date.now() - ultima > 60e3) { try { sessionStorage.setItem('stock:recarga', String(Date.now())); } catch (_e) { /* nada */ } location.reload(); return; }
      $view.replaceChildren(h('section', { class: 'center-card' }, h('h1', { class: 'titulo', text: 'Hay una versión nueva' }),
        h('p', { class: 'sub', text: 'Tocá Actualizar para cargarla. Si sigue igual, cerrá la app y abrila de nuevo.' }), h('button', { class: 'btn btn-primary', type: 'button', text: 'Actualizar', on: { click: () => location.reload() } })));
      return;
    }
    $view.replaceChildren(h('section', { class: 'center-card' }, h('h1', { class: 'titulo', text: 'No se pudo cargar' }),
      h('p', { class: 'sub', text: mensajeError(e) }), h('button', { class: 'btn btn-primary', type: 'button', text: 'Reintentar', on: { click: () => ruta() } })));
  }
}

async function arrancar() {
  let perfil;
  try { perfil = await perfilActual(); }
  catch (e) {
    return pantallaSimple('Sin conexión', mensajeError(e), h('button', { class: 'btn btn-primary', type: 'button', text: 'Reintentar', on: { click: arrancar } }));
  }
  if (!perfil) return mostrarEntrar();
  if (perfil.sinPerfil || !['encargado', 'gerencia', 'contadora'].includes(perfil.rol)) {
    return pantallaSimple('Sin permisos', 'Tu usuario todavía no tiene permisos para esta app. Avisale a gerencia.',
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'Salir', on: { click: cerrarSesion } }));
  }
  if (perfil.rol === 'encargado' && !perfil.local_id) {
    return pantallaSimple('Sin local', 'Tu usuario no tiene un local asignado. Avisale a gerencia.', h('button', { class: 'btn btn-ghost', type: 'button', text: 'Salir', on: { click: async () => { ctx = null; await salir(); mostrarEntrar(); } } }));
  }
  ctx = { perfil, rol: perfil.rol, nombreGuardado: lsGet('nombre'), codigoLocal: perfil.rol === 'encargado' ? await codigoMiLocal(perfil.local_id) : '' };
  construirShell(ctx);
  await ruta();
}

window.addEventListener('hashchange', ruta);
sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT' && ctx) { toast('La sesión terminó. Entrá de nuevo.', 'info'); mostrarEntrar(); } });
// La pantalla de carga se va cuando terminó la intro (~3,2 s, la marca el fin de la animación del subtítulo) y la primera
// pantalla (entrar o la vista inicial) quedó armada. Mientras tanto la app ya carga los datos por detrás.
function quitarSplash() {
  const sp = document.getElementById('splash');
  if (!sp) return;
  const fin = () => { if (!sp.isConnected || sp.classList.contains('sp-fuera')) return; sp.classList.add('sp-fuera'); setTimeout(() => sp.remove(), 500); };
  const ultimo = sp.querySelector('.splash-s');
  if (!ultimo || getComputedStyle(ultimo).opacity === '1') return fin();
  ultimo.addEventListener('animationend', fin, { once: true });
  setTimeout(fin, 4000);
}

registrarSW();
activarTituloGrande($scroller);
arrancar().finally(quitarSplash);
