// Arranque, sesión, ruteo por hash y estructura (barra lateral en escritorio, tab bar en celular).
import { h, lsGet, elabora } from './util.js';
import { sb, perfilActual, codigoMiLocal, salir, mensajeError } from './api.js';
import { icon, toast, esqueleto, activarTituloGrande, CLAVE_DESDE_HOY } from './ui.js';

// Pestañas por rol. incluye: pantallas que viven dentro de esa pestaña (quedan marcadas en ella). Lo demás está en Más,
// una lista tipo Ajustes (mas.js, MAS de abajo).
// Encargado (también el Shopping): Hoy · Mis pedidos · Más. Hoy lleva a todo lo del día (abrir, pedir, recibir, cerrar).
// Gerencia: Decidir · Locales · Compras · Más (el Tablero de antes sigue en Más → Tablero). Administración: Pagos · Más.
const NAV = {
  encargado: [
    { id: 'hoy', label: 'Hoy', icono: 'hoy', incluye: ['hoja', 'apertura', 'cierre', 'pedir', 'pedir-prov', 'revisar', 'retiros', 'lugares', 'contar', 'stock', 'elaborados', 'subir-factura'] },
    { id: 'mis-pedidos', label: 'Mis pedidos', icono: 'lista' },
    { id: 'mas', label: 'Más', icono: 'menu', incluye: ['notas'] }
  ],
  gerencia: [
    { id: 'decidir', label: 'Decidir', icono: 'decidir' },
    { id: 'semaforo', label: 'Locales', icono: 'semaforo', incluye: ['local', 'producto', 'perdida', 'sector', 'control', 'g-retiros'] },
    { id: 'pedidos', label: 'Compras', icono: 'pedir', incluye: ['compras', 'por-producto', 'comprar', 'cargar', 'cargar-revisar', 'recibir', 'recibir-factura', 'gasto'] },
    { id: 'mas', label: 'Más', icono: 'menu', incluye: ['tablero', 'hay', 'ajustes', 'stock', 'conteos', 'lugares',
      'resumen', 'ventas', 'analisis', 'merma', 'recetas', 'produccion', 'elaborados', 'pagos', 'facturas', 'historial', 'cargar-pago',
      'catalogo', 'categorias', 'proveedores', 'locales', 'notas'] }
  ],
  contadora: [
    { id: 'pagos', label: 'Pagos', icono: 'pagos', incluye: ['gasto', 'facturas', 'historial', 'cargar-pago'] },
    { id: 'mas', label: 'Más', icono: 'menu' }
  ]
};
// Más: filas tipo Ajustes. Encargado: la hoja completa, pedir de la lista, retiros (Shopping), facturas y notas. Gerencia:
// Tablero, Lo que hay, Comprar por cierres, Stock y control, Números, Cocina, Pagos, Catálogo, Ajustes y Notas.
// Abajo de todo, con quién se entró y Cerrar sesión.
const MAS = {
  encargado: [
    { id: 'hoja', label: 'Hoja del día', icono: 'hoja', sub: 'Apertura y cierre en una lista', soloElabora: true },
    { id: 'hoja', label: 'Hoja del depósito', icono: 'hoja', sub: 'Abrir y cerrar por sector', soloShopping: true },
    { id: 'retiros', label: 'Retiros', icono: 'retiro', sub: 'Qué sale del depósito', soloShopping: true },
    { id: 'pedir', label: 'Pedir de la lista completa', icono: 'buscar', sub: 'Buscar cualquier producto' },
    { id: 'subir-factura', label: 'Facturas', icono: 'recibir' },
    { id: 'notas', label: 'Notas', icono: 'nota' }
  ],
  gerencia: [
    { id: 'tablero', label: 'Tablero', icono: 'tablero', sub: 'Semana, aprobar, entregas, facturas' },
    { id: 'hay', label: 'Lo que hay', icono: 'stock', sub: 'Lo que queda en cada local' },
    { id: 'comprar', label: 'Comprar por cierres', icono: 'pedir', sub: 'Qué comprar según lo que sobró' },
    { id: 'stock', label: 'Stock y control', icono: 'stock', sub: 'Qué hay, control del día, lugares' },
    { id: 'resumen', label: 'Números', icono: 'ventas', sub: 'Ventas, análisis, merma' },
    { id: 'recetas', label: 'Cocina', icono: 'cocina', sub: 'Recetas, producción, elaborados' },
    { id: 'pagos', label: 'Pagos', icono: 'pagos', sub: 'Cuentas, facturas, pagos' },
    { id: 'catalogo', label: 'Catálogo', icono: 'catalogo', sub: 'Productos, proveedores, locales' },
    { id: 'ajustes', label: 'Ajustes', icono: 'ajuste', sub: 'Días que abre cada local, feriados' },
    { id: 'notas', label: 'Notas', icono: 'nota' }
  ],
  contadora: []
};
// Rutas viejas que cambiaron de nombre: siguen andando y llevan a la nueva. El Hoy de gerencia pasó a Decidir (el tablero
// sigue en Más → Tablero, #/tablero).
const ALIAS = { 'gerencia/hoy': 'decidir' };
const RUTAS_PAGOS = { 'gasto': () => import('./g-gasto.js'), 'pagos': () => import('./g-cuentas.js'), 'facturas': () => import('./g-facturas.js'), 'cargar-pago': () => import('./g-cargar-pago.js'), 'historial': () => import('./g-historial.js') };
const VISTAS = {
  encargado: { 'hoy': () => import('./hoy.js'), 'pedir': () => import('./pedir.js'), 'pedir-prov': () => import('./pedir.js'), 'apertura': () => import('./hoja.js'), 'cierre': () => import('./hoja.js'), 'revisar': () => import('./pedir.js'), 'mis-pedidos': () => import('./pedir.js'), 'hoja': () => import('./hoja.js'), 'retiros': () => import('./retiros.js'), 'stock': () => import('./stock-local.js'), 'contar': () => import('./contar.js'), 'lugares': () => import('./g-lugares.js'), 'elaborados': () => import('./elaborados.js'), 'subir-factura': () => import('./subir-factura.js'), 'notas': () => import('./notas.js') },
  contadora: { ...RUTAS_PAGOS },
  gerencia: {
    ...RUTAS_PAGOS,
    'decidir': () => import('./g-decidir.js'), 'semaforo': () => import('./g-semaforo.js'), 'local': () => import('./g-local.js'), 'producto': () => import('./g-local.js'),
    'tablero': () => import('./g-hoy.js'), 'comprar': () => import('./g-comprar.js'), 'hay': () => import('./g-hay.js'), 'ajustes': () => import('./g-ajustes.js'), 'proveedores': () => import('./g-proveedores.js'), 'locales': () => import('./g-locales.js'),
    'pedidos': () => import('./g-pedidos.js'), 'compras': () => import('./g-pedidos.js'), 'por-producto': () => import('./g-por-producto.js'), 'cargar': () => import('./g-cargar.js'), 'cargar-revisar': () => import('./g-cargar.js'), 'recibir': () => import('./g-recibir.js'), 'recibir-factura': () => import('./g-recibir-factura.js'),
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
  delete document.documentElement.dataset.rol; // Entrar usa el tema base (el del encargado)
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

// Encargado: Hoy · Mis pedidos · Más, igual en el Shopping (no elabora): su Hoy muestra Retiros y abrir/cerrar el depósito.
const shopping = (c) => c.rol === 'encargado' && !elabora(c.codigoLocal);
const navDe = (c) => NAV[c.rol];
const masDe = (c) => (MAS[c.rol] || []).filter(it => (!it.soloShopping || shopping(c)) && (!it.soloElabora || !shopping(c)));
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
  // Tema por rol (stock.css): encargado "Guiado", gerencia y administración "Semáforo".
  document.documentElement.dataset.rol = c.rol;
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
  if (desde !== id) { if (desde && id !== 'hoy' && id !== 'tablero') { try { sessionStorage.removeItem(CLAVE_DESDE_HOY); } catch (_e) { /* nada */ } } return null; }
  const g = ctx && ctx.rol === 'gerencia';
  return h('a', { class: 'volver-hoy', href: g ? '#/tablero' : '#/hoy', on: { click: () => { try { sessionStorage.removeItem(CLAVE_DESDE_HOY); } catch (_e) { /* nada */ } } } }, icon('atras', 20), h('span', { text: g ? 'Tablero' : 'Hoy' }));
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
    root.classList.add('entra'); setTimeout(() => root.classList.remove('entra'), 600); // aparece suave solo al entrar
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
