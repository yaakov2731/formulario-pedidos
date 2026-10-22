// Docks app · arranque, sesión, navegación y armado de la pantalla.
import { store, semanaDe } from './util.js';
import * as api from './api.js';
import { h, icon, toast, clear, banner, sheet, cell, group, haptic } from './ui.js';

const VERSION = (window.DOCKS_APP_CONFIG && window.DOCKS_APP_CONFIG.VERSION) || 'dev';

/* ---------- sesión ---------- */
export const S = {
  sesion: store.get('sesion', null),          // { rol, local, encargado }
  adminKey: store.get('admin_key', '') || '',
  boot: null,
  badges: {}
};

export function guardarSesion(s) { S.sesion = s; if (s) store.set('sesion', s); else store.del('sesion'); }
export function guardarAdminKey(k, recordar) { S.adminKey = k || ''; if (recordar && k) store.set('admin_key', k); else store.del('admin_key'); }

/* ---------- navegación ---------- */
const NAV_ENC = [
  { id: 'hoy', label: 'Hoy', icon: 'house' },
  { id: 'pedir', label: 'Pedir', icon: 'cart' },
  { id: 'contar', label: 'Contar', icon: 'clipboard' },
  { id: 'recibir', label: 'Recibir', icon: 'truck' },
  { id: 'elaborados', label: 'Elaborados', icon: 'flame' }
];
const NAV_GER = [
  { id: 'compras', label: 'Compras', icon: 'bag' },
  { id: 'ordenes', label: 'Órdenes', icon: 'send' },
  { id: 'faltantes', label: 'Faltantes', icon: 'alert' },
  { id: 'stock', label: 'Stock', icon: 'chart' },
  { id: 'catalogo', label: 'Catálogo', icon: 'book' },
  { id: 'proveedores', label: 'Proveedores', icon: 'people' },
  { id: 'locales', label: 'Locales', icon: 'store' },
  { id: 'elaborados-admin', label: 'Elaborados', icon: 'flame' }
];
const GER_TABS = ['compras', 'ordenes', 'stock', 'catalogo'];

const SCREENS = {
  entrar: () => import('./screens/entrar.js'),
  hoy: () => import('./screens/hoy.js'),
  pedir: () => import('./screens/pedir.js'),
  contar: () => import('./screens/contar.js'),
  recibir: () => import('./screens/recibir.js'),
  elaborados: () => import('./screens/elaborados.js'),
  compras: () => import('./screens/compras.js'),
  ordenes: () => import('./screens/ordenes.js'),
  faltantes: () => import('./screens/faltantes.js'),
  stock: () => import('./screens/stock.js'),
  catalogo: () => import('./screens/catalogo.js'),
  proveedores: () => import('./screens/proveedores.js'),
  locales: () => import('./screens/locales.js'),
  'elaborados-admin': () => import('./screens/elaborados-admin.js'),
  ajustes: () => import('./screens/ajustes.js')
};
const GER_ONLY = new Set(['compras', 'ordenes', 'faltantes', 'stock', 'catalogo', 'proveedores', 'locales', 'elaborados-admin']);
const ENC_ONLY = new Set(['hoy', 'pedir', 'contar', 'recibir', 'elaborados']);

export function go(hash, replace) {
  const target = '#' + String(hash || '').replace(/^#/, '');
  if (replace) history.replaceState(null, '', target); else location.hash = target;
  if (replace) route();
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, ...rest] = raw.split('/');
  return { screen: path || '', params: rest.map(decodeURIComponent), raw };
}

/* ---------- shell ---------- */
const $ = id => document.getElementById(id);
const appEl = $('app'), sidebar = $('sidebar'), tabbar = $('tabbar'), view = $('view'), topbar = $('topbar');
let actual = null;      // { screen, leave: [] }

function rol() { return S.sesion ? S.sesion.rol : null; }

export function setBadge(id, n) {
  S.badges[id] = n || 0;
  for (const el of document.querySelectorAll(`[data-nav="${id}"] .tab-badge`)) { el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n); }
}

function navItems() {
  if (rol() === 'gerencia') return NAV_GER;
  if (rol() === 'encargado') return NAV_ENC;
  return [];
}

function renderNav(active) {
  const items = navItems();
  appEl.classList.toggle('no-nav', !items.length);
  tabbar.hidden = !items.length;
  clear(tabbar); clear(sidebar);
  if (!items.length) return;
  const tabs = rol() === 'gerencia' ? items.filter(i => GER_TABS.includes(i.id)) : items;
  for (const it of tabs) {
    tabbar.append(h('a', { class: `tab${it.id === active ? ' is-active' : ''}`, href: `#${it.id}`, dataset: { nav: it.id }, 'aria-current': it.id === active ? 'page' : null },
      icon(it.icon, 26), h('span', { text: it.label }), h('span', { class: 'tab-badge', hidden: !S.badges[it.id], text: String(S.badges[it.id] || '') })));
  }
  if (rol() === 'gerencia') {
    const masActivo = !GER_TABS.includes(active);
    tabbar.append(h('button', { class: `tab${masActivo ? ' is-active' : ''}`, type: 'button', onClick: abrirMas }, icon('list', 26), h('span', { text: 'Más' })));
  }
  // barra lateral (tablet / PC)
  sidebar.append(h('div', { class: 'sb-brand' }, h('img', { class: 'sb-logo', src: 'icons/logo-docks.svg', alt: 'Docks del Puerto' })));
  if (rol() === 'encargado') sidebar.append(h('div', { class: 'sb-local' }, localBtn()));
  else sidebar.append(h('div', { class: 'sb-sec', text: 'Gerencia' }));
  for (const it of items) {
    sidebar.append(h('a', { class: `sb-item${it.id === active ? ' is-active' : ''}`, href: `#${it.id}`, dataset: { nav: it.id } }, icon(it.icon, 22), h('span', { class: 'grow', text: it.label }),
      h('span', { class: 'tab-badge', hidden: !S.badges[it.id], text: String(S.badges[it.id] || '') })));
  }
  sidebar.append(h('div', { class: 'sb-sec', text: 'General' }));
  sidebar.append(h('a', { class: `sb-item${active === 'ajustes' ? ' is-active' : ''}`, href: '#ajustes', dataset: { nav: 'ajustes' } }, icon('gear', 22), h('span', { class: 'grow', text: 'Ajustes' })));
  sidebar.append(h('div', { class: 'sb-foot' }, h('div', { text: S.sesion.encargado ? S.sesion.encargado : 'Gerencia' }), h('div', { text: semanaDe().label })));
}

function abrirMas() {
  haptic();
  const extra = NAV_GER.filter(i => !GER_TABS.includes(i.id));
  const s = sheet({
    title: 'Más',
    body: group(null, [
      ...extra.map(it => cell({ title: it.label, lead: it.icon, chevron: true, onClick: () => { s.close(); go(it.id); } })),
      cell({ title: 'Ajustes', lead: 'gear', leadKind: 'plain', chevron: true, onClick: () => { s.close(); go('ajustes'); } })
    ])
  });
}

/* ---------- selector de local (encargado) ---------- */
function localesActivos() {
  return ((S.boot && S.boot.locales) || []).filter(l => l.activo !== false && l.activo !== 'NO').map(l => l.local).sort((a, b) => a.localeCompare(b, 'es'));
}
export function localBtn() {
  return h('button', { class: 'local-pick', type: 'button', 'aria-label': `Local: ${S.sesion.local}. Cambiar de local`, onClick: elegirLocal },
    icon('store', 18), h('span', { class: 'local-pick-name', text: S.sesion.local }), icon('down', 16));
}
export function elegirLocal() {
  haptic();
  const pintar = (lista) => group(null, lista.length
    ? lista.map(l => cell({ title: l, lead: 'store', leadKind: l === S.sesion.local ? '' : 'plain', value: l === S.sesion.local ? 'Actual' : '', onClick: () => cambiarLocal(l, s) }))
    : [cell({ title: 'Cargando locales…', leadKind: 'plain' })]);
  const s = sheet({ title: 'Cambiar de local', body: pintar(localesActivos()) });
  if (!localesActivos().length) bootstrap().fresh.then(() => { clear(s.body); s.body.append(pintar(localesActivos())); }).catch(() => {});
}
function cambiarLocal(local, s) {
  s.close();
  if (!S.sesion || local === S.sesion.local) return;
  guardarSesion({ ...S.sesion, local });
  store.set('ultimo_local', local);
  haptic('success');
  toast(`Ahora estás en ${local}`, 'ok');
  route();
}

/* ---------- barra superior ---------- */
export function topbarSet({ left, right, visible = true } = {}) {
  topbar.hidden = !visible;
  clear($('topbar-left')); clear($('topbar-right'));
  if (!left && rol() === 'encargado' && S.sesion.local) left = localBtn();
  if (left) $('topbar-left').append(left);
  if (right) $('topbar-right').append(...[].concat(right));
}
export function backBtn(label = 'Atrás', hash) {
  return h('button', { class: 'topbar-btn', type: 'button', onClick: () => { if (hash) go(hash); else history.back(); } }, icon('back', 24), h('span', { text: label }));
}

/* ---------- datos compartidos ---------- */
export function bootstrap({ force } = {}) {
  const c = api.cached('getBootstrap', {}, { maxAge: force ? 0 : 10 * 60000 });
  if (c.data) S.boot = c.data;
  return { data: c.data, fresh: c.fresh.then(d => { S.boot = d; return d; }) };
}

export function localActual() {
  if (!S.sesion || !S.boot) return null;
  return (S.boot.locales || []).find(l => l.local === S.sesion.local) || null;
}

/* ---------- estado de red / cola ---------- */
let redBanner = null;
function actualizarRed() {
  const offline = navigator.onLine === false;
  const pend = api.pendientes().length;
  if (redBanner) { redBanner.remove(); redBanner = null; }
  if (!offline && !pend) return;
  const txt = offline
    ? (pend ? `Sin conexión. ${pend} ${pend === 1 ? 'envío pendiente se mandará' : 'envíos pendientes se mandarán'} al volver la señal.` : 'Sin conexión. Podés seguir cargando; se envía al volver la señal.')
    : `${pend} ${pend === 1 ? 'envío pendiente' : 'envíos pendientes'}. Reintentando…`;
  redBanner = banner(txt, offline ? 'warn' : 'tint', { icon: offline ? 'offline' : 'refresh' });
  redBanner.style.margin = '8px 0 0';
  view.prepend(redBanner);
  if (!offline && pend) api.vaciarCola();
}
window.addEventListener('online', actualizarRed);
window.addEventListener('offline', actualizarRed);
api.onCola(() => actualizarRed());

/* ---------- ruteo ---------- */
export const ctx = {
  S, go, setBadge, topbar, topbarSet, backBtn, bootstrap, localActual, view, toast, elegirLocal,
  guardarSesion, guardarAdminKey, api, version: VERSION,
  onLeave(fn) { if (actual) actual.leave.push(fn); },
  salir() { guardarSesion(null); guardarAdminKey('', false); S.boot = null; api.invalidar(); go('entrar', true); }
};

let routing = false;
async function route() {
  if (routing) { queueMicrotask(route); return; }
  routing = true;
  try {
    let { screen, params } = parseHash();
    const r = rol();
    if (!r && screen !== 'entrar') { history.replaceState(null, '', '#entrar'); screen = 'entrar'; params = []; }
    if (r && !SCREENS[screen]) { screen = r === 'gerencia' ? 'compras' : 'hoy'; history.replaceState(null, '', '#' + screen); params = []; }
    if (r && screen === 'entrar' && !params.length) { screen = r === 'gerencia' ? 'compras' : 'hoy'; history.replaceState(null, '', '#' + screen); }
    if (r === 'encargado' && GER_ONLY.has(screen)) { screen = 'hoy'; history.replaceState(null, '', '#hoy'); params = []; }
    if (r === 'gerencia' && ENC_ONLY.has(screen)) { screen = 'compras'; history.replaceState(null, '', '#compras'); params = []; }
    if (r === 'gerencia' && !S.adminKey && screen !== 'entrar') { history.replaceState(null, '', '#entrar/gerencia'); screen = 'entrar'; params = ['gerencia']; }

    if (actual) { for (const fn of actual.leave) { try { fn(); } catch (_e) { /* nada */ } } }
    actual = { screen, leave: [] };
    const mod = await SCREENS[screen]();
    if (actual.screen !== screen) return;
    renderNav(screen);
    topbarSet({ visible: screen !== 'entrar' });
    clear(view);
    view.className = 'wrap' + (mod.wide ? ' wrap-wide' : '');
    window.scrollTo(0, 0);
    actualizarRed();
    try {
      const out = await mod.default({ ...ctx, params, screen });
      if (actual.screen !== screen) return;
      if (out) view.append(out);
    } catch (e) {
      console.error(e);
      view.append(banner(e && e.message ? e.message : 'Algo falló al abrir esta pantalla.', 'bad', { icon: 'alert' }));
    }
    document.title = screen === 'entrar' ? 'Docks' : `${(navItems().find(i => i.id === screen) || { label: 'Docks' }).label} · Docks`;
  } finally { routing = false; }
}
window.addEventListener('hashchange', route);

/* ---------- acceso por URL: ?local=Umo%20Grill&nombre=Ayelén  |  ?clave=… (gerencia, sólo en memoria) ---------- */
(function accesoPorUrl() {
  let qs;
  try { qs = new URLSearchParams(location.search); } catch (_e) { return; }
  if (!qs.has('local') && !qs.has('clave')) return;
  api.apiUrl(); // fija ?api= antes de limpiar la dirección
  if (qs.has('clave') && qs.get('clave').trim()) {
    S.adminKey = qs.get('clave').trim();
    guardarSesion({ rol: 'gerencia' });
  } else if (qs.has('local')) {
    const local = qs.get('local').trim();
    const nombre = (qs.get('nombre') || '').trim();
    if (local && nombre) guardarSesion({ rol: 'encargado', local, encargado: nombre });
    else if (local) { guardarSesion(null); store.set('ultimo_local', local); }
  }
  for (const k of ['local', 'nombre', 'clave', 'api']) qs.delete(k);
  const limpia = location.pathname + (qs.toString() ? '?' + qs.toString() : '') + location.hash;
  history.replaceState(null, '', limpia);
})();

/* ---------- arranque ---------- */
if (S.sesion && S.sesion.rol === 'gerencia' && !S.adminKey) guardarSesion(null);
if (api.configured() && S.sesion) bootstrap();
route();
api.vaciarCola();

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // Buscar versión nueva al abrir y cada vez que la app vuelve al frente (iOS no lo hace solo).
      const buscar = () => { try { reg.update(); } catch (_e) { /* nada */ } };
      buscar();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
      setInterval(buscar, 30 * 60000);
    }).catch(() => {});
    // Cuando el service worker nuevo toma el control, hay una versión nueva publicada: recargar una sola vez.
    let teniaControl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!teniaControl) { teniaControl = true; return; }
      toast('Actualizando a la versión nueva…', 'info');
      setTimeout(() => location.reload(), 600);
    });
  });
}
