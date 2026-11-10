// Arranque, sesión, ruteo por hash y estructura (barra lateral en escritorio, tab bar en celular).
import { h, lsGet, lsSet, elabora } from './util.js';
import { sb, perfilActual, codigoMiLocal, salir, mensajeError } from './api.js';
import { icon, toast, esqueleto, hoja, listaGrupo, filaLista, activarTituloGrande } from './ui.js';

const NAV = {
  encargado: [
    { id: 'pedir', label: 'Pedir', icono: 'pedir' },
    { id: 'mis-pedidos', label: 'Mis pedidos', icono: 'lista' },
    { id: 'hoja', label: 'Hoja', icono: 'hoja' },
    { id: 'retiros', label: 'Retiros', icono: 'retiro' },
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
  encargado: { 'pedir': () => import('./pedir.js'), 'revisar': () => import('./pedir.js'), 'mis-pedidos': () => import('./pedir.js'), 'hoja': () => import('./hoja.js'), 'retiros': () => import('./retiros.js'), 'stock': () => import('./stock-local.js'), 'contar': () => import('./contar.js'), 'lugares': () => import('./g-lugares.js'), 'elaborados': () => import('./elaborados.js'), 'subir-factura': () => import('./subir-factura.js'), 'notas': () => import('./notas.js') },
  contadora: { ...RUTAS_PAGOS },
  gerencia: {
    ...RUTAS_PAGOS,
    'tablero': () => import('./g-tablero.js'), 'proveedores': () => import('./g-proveedores.js'), 'locales': () => import('./g-locales.js'),
    'pedidos': () => import('./g-pedidos.js'), 'compras': () => import('./g-pedidos.js'), 'cargar': () => import('./g-cargar.js'), 'cargar-revisar': () => import('./g-cargar.js'), 'recibir': () => import('./g-recibir.js'), 'recibir-factura': () => import('./g-recibir-factura.js'),
    'stock': () => import('./g-stock.js'), 'sector': () => import('./g-sector.js'), 'g-retiros': () => import('./g-retiros.js'), 'lugares': () => import('./g-lugares.js'), 'conteos': () => import('./g-conteos.js'), 'control': () => import('./g-control.js'), 'elaborados': () => import('./elaborados.js'), 'catalogo': () => import('./g-catalogo.js'), 'categorias': () => import('./g-categorias.js'),
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
// en el menú (las rutas siguen andando). El Shopping (no elabora) suma Retiros: qué sale del depósito y a dónde va.
const navDe = (c) => NAV[c.rol].filter(it => !(it.id === 'retiros' && c.rol === 'encargado' && elabora(c.codigoLocal)));
const vistasDe = (c) => {
  const v = { ...VISTAS[c.rol] };
  if (c.rol === 'encargado') { if (elabora(c.codigoLocal)) delete v.retiros; else delete v.elaborados; }
  return v;
};

// En el celular la barra de abajo muestra 4 secciones + "Más" (el resto y Salir), para que no se corten los nombres
// y nadie cierre la sesión de un toque sin querer. En escritorio la barra lateral sigue mostrando todo.
const EN_BARRA = {
  encargado: ['pedir', 'mis-pedidos', 'hoja', 'retiros', 'subir-factura'],
  gerencia: ['tablero', 'pedidos', 'compras', 'stock'],
  contadora: ['pagos']
};
const MAX_BARRA = 4;

function construirShell(c) {
  const items = navDe(c);
  $app.classList.remove('no-nav');
  const enlace = (it, clase) => h('a', { class: clase, href: '#/' + it.id, 'data-nav': it.id }, icon(it.icono, clase === 'tab' ? 22 : 20), h('span', { text: it.label }));
  const cerrarSesion = async () => { ctx = null; await salir(); mostrarEntrar(); };
  const salirBtn = (clase) => h('button', { class: clase, type: 'button', on: { click: cerrarSesion } }, icon('salir', clase === 'tab' ? 22 : 20), h('span', { text: 'Salir' }));
  $side.replaceChildren(
    h('div', { class: 'side-brand' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 36, height: 36 }), h('div', {}, h('b', { text: 'Docks del Puerto' }), h('small', { text: c.rol === 'gerencia' ? 'Gerencia' : (c.rol === 'contadora' ? 'Administración' : (c.perfil.nombre || 'Local')) }))),
    h('nav', { class: 'side-nav' }, items.map(it => enlace(it, 'side-link')), salirBtn('side-link side-out'))
  );
  const orden = EN_BARRA[c.rol] || [];
  const enBarra = items.filter(it => orden.includes(it.id)).sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id)).slice(0, MAX_BARRA);
  const resto = items.filter(it => !enBarra.includes(it));
  const abrirMas = () => {
    const quien = c.rol === 'gerencia' ? 'Gerencia' : (c.rol === 'contadora' ? 'Administración' : (c.perfil.nombre || 'Local'));
    let hojaMas = null;
    const links = resto.map(it => filaLista({ texto: it.label, icono: it.icono, href: '#/' + it.id, chevron: true, clase: 'mas-link', attrs: { 'data-nav': it.id }, onClick: () => hojaMas && hojaMas.cerrar() }));
    hojaMas = hoja('Más', h('div', { class: 'mas-lista' }, listaGrupo(null, links),
      h('p', { class: 'mas-quien', text: 'Entraste como ' + quien }),
      h('button', { class: 'btn btn-ghost mas-salir', type: 'button', on: { click: () => { hojaMas.cerrar(); cerrarSesion(); } } }, icon('salir', 20), h('span', { text: 'Cerrar sesión' }))));
    marcarActivo((location.hash || '').split('/')[1] || '');
  };
  const masBtn = h('button', { class: 'tab tab-mas', type: 'button', 'aria-label': 'Más secciones y cerrar sesión', 'data-mas': resto.map(it => it.id).join(' '), on: { click: abrirMas } },
    icon('menu', 22), h('span', { text: 'Más' }));
  $tab.replaceChildren(...enBarra.map(it => enlace(it, 'tab')), masBtn);
  $tab.hidden = false;
  $tab.classList.remove('tabbar-7', 'tabbar-scroll');
}

function marcarActivo(id) {
  // Gerencia: Recibir y Gasto viven dentro de Compras; la contadora sigue viendo Gasto en Pagos.
  const deGerencia = ctx && ctx.rol === 'gerencia' ? ({ elaborados: 'recetas', lugares: 'stock', conteos: 'stock', control: 'stock', sector: 'stock', 'g-retiros': 'stock', gasto: 'compras' })[id] : null;
  const deEncargado = ctx && ctx.rol === 'encargado' ? ({ lugares: 'hoja', contar: 'hoja', stock: 'hoja', elaborados: 'hoja' })[id] : null;
  const act = deGerencia || deEncargado || ({ revisar: 'pedir', ventas: 'resumen', analisis: 'resumen', merma: 'resumen', produccion: 'recetas', gasto: 'pagos', facturas: 'pagos', 'cargar-pago': 'pagos', historial: 'pagos', proveedores: 'catalogo', categorias: 'catalogo', locales: 'catalogo', cargar: 'pedidos', 'cargar-revisar': 'pedidos', recibir: 'compras', 'recibir-factura': 'compras' })[id] || id;
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.getAttribute('data-nav') === act;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // "Más" se marca cuando la sección abierta no está en la barra de abajo.
  const mas = document.querySelector('.tab-mas');
  if (mas) mas.classList.toggle('is-active', (mas.getAttribute('data-mas') || '').split(' ').includes(act));
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
activarTituloGrande($scroller);
arrancar().finally(quitarSplash);
