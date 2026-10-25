#!/usr/bin/env node
// Genera los Excel sintéticos (nombres y montos inventados) con el mismo formato que exporta Núcleo IT.
// Uso: node scripts/fixtures/nucleo/generar.js   (usa el SheetJS vendorizado de stock/vendor)
const fs = require('fs');
const path = require('path');
const X = require(path.join(__dirname, '../../../stock/vendor/xlsx.full.min.js'));

const BASE = 46319; // 24/10/2026 en número de serie de Excel
const hora = (h, m, s = 0) => BASE + (h * 3600 + m * 60 + s) / 86400;

// [pedido, hora, cliente, tipo, sector, [código, nombre, cantidad, total, rubro, subrubro][], pagos [forma, monto][]]
const PEDIDOS = [
  [9101, hora(12, 35, 10), 'Salón', 'Salon Umo', [['BEB-901', 'Cerveza Rubia Lata', 2, 5600, 'BEBIDAS', 'CERVEZAS'], ['PAR-901', 'Parrillada Demo', 1, 24000, 'PARRILLA', 'CARNES']], 30600, [['Efectivo', 30600]]],
  [9102, hora(13, 10, 5), 'Mostrador', null, [['BEB-901', 'Cerveza Rubia Lata', 1, 2800, 'BEBIDAS', 'CERVEZAS'], ['SAN-901', 'Sandwich Demo', 2, 18000, 'SÁNDWICHES', 'SANDWICHES']], 20800, [['Mercado Pago QR', 20800]]],
  [9103, hora(14, 20, 40), 'Salón', 'Patio Frente', [['PAR-901', 'Parrillada Demo', 2, 48000, 'PARRILLA', 'CARNES'], ['BEB-902', 'Agua Demo 500', 3, 6000, 'BEBIDAS', 'AGUAS']], 54000, [['Efectivo', 30000], ['Tarjeta de débito', 24000]]],
  [9104, hora(20, 45, 0), 'Salón', 'Salon Umo', [['PAR-901', 'Parrillada Demo', 1, 0, 'PARRILLA', 'CARNES']], null, []],
  [9105, hora(21, 5, 30), 'Salón', 'Patio Burger', [['BEB-901', 'Cerveza Rubia Lata', 4, 11200, 'BEBIDAS', 'CERVEZAS'], ['GUA-901', 'Papas Demo', 2, 7000, 'GUARNICIONES', 'PAPAS']], 18200, [['Tarjeta de crédito', 18200]]]
];

function hoja(titulo, encabezados, filas, fechaCols) {
  const aoa = [[], [titulo], [null, null, 'Exportado:', 'dom. 25/10/2026 09:25'], [], encabezados, ...filas];
  const ws = X.utils.aoa_to_sheet(aoa);
  const rango = X.utils.decode_range(ws['!ref']);
  for (let r = 5; r <= rango.e.r; r++) for (const c of fechaCols) { const cel = ws[X.utils.encode_cell({ r, c })]; if (cel) cel.z = 'dd/mm/yyyy hh:mm:ss'; }
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
  return wb;
}

const detalle = [];
const pagos = [];
const prod = new Map();
for (const [num, h, tipo, sector, items, cobrado, pg] of PEDIDOS) {
  for (const [cod, nom, cant, tot, rub, sub] of items) {
    detalle.push([h, num, cod, nom, cant, tot, rub, sub, tipo, sector]);
    const p = prod.get(cod) || [cod, nom, 0, 0]; p[2] += cant; p[3] += tot; prod.set(cod, p);
  }
  for (const [forma, monto] of pg) pagos.push([num, h, 'Consumidor final', cobrado, forma, monto]);
}
const dir = __dirname;
const guardar = (wb, destino) => fs.writeFileSync(destino, X.write(wb, { type: 'buffer', bookType: 'xlsx' }));
guardar(hoja('Detalle de productos vendidos por pedido', ['Fecha', 'N° Pedido', 'Código', 'Nombre', 'Cantidad de productos', 'Total $', 'Rubro', 'SubRubro', 'Tipo de pedido', 'Sector'], detalle, [0]), path.join(dir, 'detalle-por-pedido.xlsx'));
guardar(hoja('Formas de pago de pedidos', ['N° de pedido', 'Fecha', 'Cliente', 'Total $', 'Forma de pago', 'Monto $'], pagos, [1]), path.join(dir, 'formas-de-pago.xlsx'));
guardar(hoja('Pedidos por producto', ['Código', 'Nombre', 'Cantidad', 'Total $'], [...prod.values()], []), path.join(dir, 'pedidos-por-producto.xlsx'));
console.log('Fixtures generados en', dir);
