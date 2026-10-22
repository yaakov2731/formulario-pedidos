// Docks app · service worker. Red primero para la app (siempre la última versión publicada),
// caché como respaldo sin conexión. Nunca intercepta la API (otro origen).
const VERSION = 'docks-app-v1';
const SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/util.js', './js/api.js', './js/ui.js',
  './js/screens/entrar.js', './js/screens/hoy.js', './js/screens/pedir.js', './js/screens/contar.js',
  './js/screens/recibir.js', './js/screens/elaborados.js', './js/screens/compras.js', './js/screens/ordenes.js',
  './js/screens/faltantes.js', './js/screens/stock.js', './js/screens/catalogo.js', './js/screens/proveedores.js',
  './js/screens/locales.js', './js/screens/elaborados-admin.js', './js/screens/ajustes.js',
  './icons/icon.svg', './icons/logo-docks.svg', './icons/icon-180.png', './icons/icon-192.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // cache: 'no-cache' revalida con el servidor (ETag de GitHub Pages): nunca sirve un archivo viejo estando en línea.
  // Una Request con mode 'navigate' no admite init: se pide por URL.
  const pedir = req.mode === 'navigate'
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    pedir.then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
