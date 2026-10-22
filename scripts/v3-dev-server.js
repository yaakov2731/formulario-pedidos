// Servidor de desarrollo V3: sirve v3/ y responde la API en /api ejecutando
// v3/gas/*.gs sobre una planilla en memoria (scripts/v3/fake-gas.js).
// Uso: node scripts/v3-dev-server.js [--port 8787] [--seed]
//   --seed carga un catálogo de prueba en memoria (nunca toca una planilla real).
// Abrir: http://localhost:8787/?api=/api  y  http://localhost:8787/compras.html?api=/api (clave: dev)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createGasRuntime } = require('./v3/fake-gas');

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 8787;
const ROOT = path.resolve(__dirname, '..', 'v3');
const APP_ROOT = path.resolve(__dirname, '..', 'app'); // app nueva: http://localhost:8787/app/?api=/api
const FAVICON = path.resolve(__dirname, '..', 'favicon.svg');
const ADMIN_KEY = 'dev';

const rt = createGasRuntime({ dir: path.join(ROOT, 'gas'), properties: { ADMIN_KEY } });
rt.call('setupV3');

function post(body) {
  const out = rt.doPost({ postData: { contents: JSON.stringify(body), type: 'text/plain' } });
  const data = JSON.parse(out.text);
  if (data.ok === false) throw new Error(body.action + ': ' + data.error);
  return data;
}

if (args.includes('--seed')) {
  const proveedores = [
    ['Distribuidora Florida', '5491100000001', 0],
    ['Verdulería Carlitos', '5491100000002', 0],
    ['Lácteos del Delta', '', 50000]
  ];
  proveedores.forEach(([proveedor, whatsapp, pedido_minimo]) =>
    post({ action: 'saveProveedor', admin_key: ADMIN_KEY, proveedor, whatsapp, pedido_minimo, activo: 'SÍ' }));
  const filas = [
    ['Asado', 'Carnes', 'kg', 'Distribuidora Florida', 8500, 10],
    ['Chorizo', 'Carnes', 'kg', 'Distribuidora Florida', 6200, 8],
    ['Tomate', 'Verduras', 'kg', 'Verdulería Carlitos', 1800, 6],
    ['Lechuga', 'Verduras', 'atado', 'Verdulería Carlitos', 900, 10],
    ['Crema', 'Lácteos', 'litro', 'Lácteos del Delta', 4200, 4],
    ['Muzzarella', 'Lácteos', 'kg', 'Lácteos del Delta', 7900, 5],
    ['Servilletas', 'Descartables', 'paquete', '', 2500, 6]
  ].map(([producto, categoria, unidad, proveedor, precio, par]) => ({ producto, categoria, unidad, proveedor, precio, par }));
  ['Umo Grill', 'Trento Café'].forEach(local =>
    post({ action: 'saveProductosLote', admin_key: ADMIN_KEY, local, filas }));
  [['Bondiola', 'Parrilla', 'unidad'], ['Pollo deshuesado', 'Parrilla', 'unidad'], ['Chimichurri', 'Salsas', 'litro']].forEach(([producto, categoria, unidad]) =>
    post({ action: 'saveElaborado', admin_key: ADMIN_KEY, local: 'Umo Grill', producto, categoria, unidad }));
  console.log('Datos de prueba cargados en memoria (Umo Grill y Trento Café, con elaborados en Umo Grill).');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    try {
      if (req.method === 'GET') {
        const parameter = Object.fromEntries(url.searchParams.entries());
        const out = rt.doGet({ parameter });
        return send(res, 200, out.mimeType && /javascript/i.test(out.mimeType) ? 'text/javascript; charset=utf-8' : 'application/json; charset=utf-8', out.text);
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const out = rt.doPost({ postData: { contents: body, type: req.headers['content-type'] || '' } });
            send(res, 200, 'application/json; charset=utf-8', out.text);
          } catch (e) {
            send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(e && e.message || e) }));
          }
        });
        return;
      }
      return send(res, 405, 'text/plain', 'Método no permitido');
    } catch (e) {
      return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ ok: false, error: String(e && e.message || e) }));
    }
  }
  if (url.pathname === '/favicon.svg' || url.pathname === '/../favicon.svg') return send(res, 200, TYPES['.svg'], fs.readFileSync(FAVICON));
  if (url.pathname === '/app' ) { res.writeHead(302, { Location: '/app/' + url.search }); return res.end(); }
  if (url.pathname.startsWith('/app/')) {
    const relApp = url.pathname === '/app/' ? 'index.html' : decodeURIComponent(url.pathname.slice(5));
    const fileApp = path.resolve(APP_ROOT, relApp);
    if (!fileApp.startsWith(APP_ROOT + path.sep) || !fs.existsSync(fileApp) || !fs.statSync(fileApp).isFile()) return send(res, 404, 'text/plain; charset=utf-8', 'No encontrado');
    return send(res, 200, TYPES[path.extname(fileApp)] || 'application/octet-stream', fs.readFileSync(fileApp));
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || file.includes(path.sep + 'gas' + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'text/plain; charset=utf-8', 'No encontrado');
  }
  send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
});

server.listen(port, () => {
  console.log(`V3 dev server: http://localhost:${port}/?api=/api`);
  console.log(`Compras:       http://localhost:${port}/compras.html?api=/api  (clave: ${ADMIN_KEY})`);
  console.log(`App nueva:     http://localhost:${port}/app/?api=/api`);
});
module.exports = { server, rt };
