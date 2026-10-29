// App de stock · service worker. Red primero (siempre la última versión publicada), caché como respaldo
// sin conexión. Nunca intercepta la API de Supabase (otro origen).
const VERSION = 'stock-v1';
const SHELL = [
  './', './index.html', './config.js', './manifest.webmanifest', './css/stock.css',
  './vendor/supabase.js', './vendor/xlsx.full.min.js',
  './js/main.js', './js/util.js', './js/api.js', './js/ui.js', './js/entrar.js', './js/pedir.js',
  './js/datos.js', './js/g-pedidos.js', './js/g-cargar.js', './js/g-recibir.js', './js/g-stock.js', './js/g-catalogo.js',
  './js/nucleo.js', './js/analisis.js', './js/g-ventas.js', './js/g-analisis.js', './js/g-resumen.js', './js/ventas-global.js', './js/g-merma.js', './js/g-recetas.js', './js/g-produccion.js',
  './js/g-tablero.js', './js/g-cuentas.js', './js/g-facturas.js', './js/g-historial.js', './js/g-cargar-pago.js', './js/g-proveedores.js', './js/g-locales.js',
  './js/aviso.js', './js/notas.js', './js/elaborados.js', './js/orden-imagen.js', './js/pagos-util.js', './js/comprobante.js', './js/pdf-texto.js',
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
