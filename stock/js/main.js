// Arranque, sesión, ruteo por hash y estructura (barra lateral en escritorio, tab bar en celular).
import { h, lsGet, lsSet, elabora } from './util.js';
import { sb, perfilActual, codigoMiLocal, salir, mensajeError } from './api.js';
import { icon, toast, esqueleto } from './ui.js';

const NAV = {
  encargado: [
    { id: 'pedir', label: 'Pedir', icono: 'pedir' },
    { id: 'mis-pedidos', label: 'Mis pedidos', icono: 'lista' },
    { id: 'elaborados', label: 'Elaborados', icono: 'cocina' },
    { id: 'subir-factura', label: 'Facturas', icono: 'recibir' },
    { id: 'notas', label: 'Notas', icono: 'nota' }
  ],
  gerencia: [
    { id: 'tablero', label: 'Tablero', icono: 'tablero' },
    { id: 'pedidos', label: 'Pedidos', icono: 'lista' },
    { id: 'compras', label: 'Compras', icono: 'pedir' },
    { id: 'notas', label: 'Notas', icono: 'nota' },
    { id: 'stock', label: 'Stock', icono: 'stock' },
    { id: 'resumen', label: 'Ventas', icono: 'ventas' },
    { id: 'recetas', label: 'Cocina', icono: 'cocina' },
    { id: 'pagos', label: 'Pagos', icono: 'pagos' },
    { id: 'catalogo', label: 'Catálogo', icono: 'catalogo' }
  ],
  contadora: [
    { id: 'pagos', label: 'Pagos', icono: 'pagos' }
  ]
};
const RUTAS_PAGOS = { 'gasto': () => import('./g-gasto.js'), 'pagos': () => import('./g-cuentas.js'), 'facturas': () => import('./g-facturas.js'), 'cargar-pago': () => import('./g-cargar-pago.js'), 'historial': () => import('./g-historial.js') };
const VISTAS = {
  encargado: { 'pedir': () => import('./pedir.js'), 'revisar': () => import('./pedir.js'), 'mis-pedidos': () => import('./pedir.js'), 'elaborados': () => import('./elaborados.js'), 'subir-factura': () => import('./subir-factura.js'), 'notas': () => import('./notas.js') },
  contadora: { ...RUTAS_PAGOS },
  gerencia: {
    ...RUTAS_PAGOS,
    'tablero': () => import('./g-tablero.js'), 'proveedores': () => import('./g-proveedores.js'), 'locales': () => import('./g-locales.js'),
    'pedidos': () => import('./g-pedidos.js'), 'compras': () => import('./g-pedidos.js'), 'cargar': () => import('./g-cargar.js'), 'cargar-revisar': () => import('./g-cargar.js'), 'recibir': () => import('./g-recibir.js'), 'recibir-factura': () => import('./g-recibir-factura.js'),
    'stock': () => import('./g-stock.js'), 'elaborados': () => import('./elaborados.js'), 'catalogo': () => import('./g-catalogo.js'),
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

// El encargado de un local que no elabora (Shopping) no ve Elaborados.
const navDe = (c) => NAV[c.rol].filter(it => !(it.id === 'elaborados' && c.rol === 'encargado' && !elabora(c.codigoLocal)));
const vistasDe = (c) => { const v = { ...VISTAS[c.rol] }; if (c.rol === 'encargado' && !elabora(c.codigoLocal)) delete v.elaborados; return v; };

function construirShell(c) {
  const items = navDe(c);
  $app.classList.remove('no-nav');
  const enlace = (it, clase) => h('a', { class: clase, href: '#/' + it.id, 'data-nav': it.id }, icon(it.icono, clase === 'tab' ? 22 : 20), h('span', { text: it.label }));
  const salirBtn = (clase) => h('button', { class: clase, type: 'button', on: { click: async () => { ctx = null; await salir(); mostrarEntrar(); } } }, icon('salir', clase === 'tab' ? 22 : 20), h('span', { text: 'Salir' }));
  $side.replaceChildren(
    h('div', { class: 'side-brand' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 36, height: 36 }), h('div', {}, h('b', { text: 'Docks del Puerto' }), h('small', { text: c.rol === 'gerencia' ? 'Gerencia' : (c.rol === 'contadora' ? 'Administración' : (c.perfil.nombre || 'Local')) }))),
    h('nav', { class: 'side-nav' }, items.map(it => enlace(it, 'side-link')), salirBtn('side-link side-out'))
  );
  $tab.replaceChildren(...items.map(it => enlace(it, 'tab')), salirBtn('tab'));
  $tab.hidden = false;
  $tab.classList.toggle('tabbar-7', items.length + 1 > 6);
  $tab.classList.toggle('tabbar-scroll', items.length + 1 > 7);
}

function marcarActivo(id) {
  // Gerencia: Recibir y Gasto viven dentro de Compras; la contadora sigue viendo Gasto en Pagos.
  const deGerencia = ctx && ctx.rol === 'gerencia' ? ({ elaborados: 'stock', gasto: 'compras' })[id] : null;
  const act = deGerencia || ({ revisar: 'pedir', ventas: 'resumen', analisis: 'resumen', merma: 'resumen', produccion: 'recetas', gasto: 'pagos', facturas: 'pagos', 'cargar-pago': 'pagos', historial: 'pagos', proveedores: 'catalogo', locales: 'catalogo', cargar: 'pedidos', 'cargar-revisar': 'pedidos', recibir: 'compras', 'recibir-factura': 'compras' })[id] || id;
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.getAttribute('data-nav') === act;
    a.classList.toggle('is-active', on);
    if (on) { a.setAttribute('aria-current', 'page'); if (a.classList.contains('tab') && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'center' }); } else a.removeAttribute('aria-current');
  });
}

const VERSION_NUEVA = /does not provide an export named|dynamically imported module|Importing a module script failed|error loading dynamically imported|is not a valid JavaScript MIME/i;

async function ruta() {
  if (!ctx) return;
  const [, id] = (location.hash || '').split('/');
  const vistas = vistasDe(ctx);
  const def = navDe(ctx)[0].id;
  if (!id || !vistas[id]) { location.replace('#/' + def); return; }
  const mi = ++ticket;
  if (limpiar) { try { limpiar(); } catch (_e) { /* nada */ } limpiar = null; }
  marcarActivo(id);
  $view.replaceChildren(esqueleto(5));
  try {
    const mod = await vistas[id]();
    if (mi !== ticket) return;
    const root = h('div', { class: 'vista' });
    $view.replaceChildren(root);
    const vctx = { ...ctx, alive: () => mi === ticket, ir: (r) => { location.hash = '#/' + r; } };
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
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'Salir', on: { click: async () => { ctx = null; await salir(); mostrarEntrar(); } } }));
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
arrancar().finally(quitarSplash);
