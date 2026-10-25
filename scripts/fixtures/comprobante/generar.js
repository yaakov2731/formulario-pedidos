#!/usr/bin/env node
// Genera el comprobante sintético (datos inventados, sin CUIT ni cuentas reales) que usan verify-stock y e2e-stock:
//   items-pdfjs.json  los items de texto tal como los entrega pdf.js (cadena, x, y, ancho) para probar el lector sin navegador.
//   comprobante-demo.pdf  PDF digital con ese mismo texto, para probar la lectura real con pdf.js en el navegador.
// Uso: node scripts/fixtures/comprobante/generar.js
const fs = require('fs');
const path = require('path');

const ITEMS = [
  [39, 754, 'Identificador de la operación: DEMO0001ab'],
  [39, 723, 'Datos del pago'],
  [39, 701, 'Tipo de transferencia'], [239, 701, 'Nro. de Transferencia'],
  [39, 683, 'Proveedores'], [239, 683, '1'],
  [39, 655, 'Fecha de envío'], [239, 655, 'Monto'],
  [39, 637, '05/10/2026'], [239, 637, '$ 150.000,50'],
  [39, 610, 'Concepto'], [239, 610, 'Descripción'],
  [39, 593, 'Factura'], [239, 593, 'Mercaderia'],
  [39, 567, 'Datos del pagador'],
  [39, 545, 'CUIT/CUIL'], [239, 545, 'Razón Social'],
  [39, 527, '30000000027'], [239, 527, 'EMPRESA DEMO SA'],
  [39, 511, 'Cuenta a debitar'],
  [39, 493, 'CC$ 000000001'],
  [39, 467, 'Datos del destinatario'],
  [39, 445, 'CUIT/CUIL'], [239, 445, 'Razón social'],
  [39, 427, '30000000019'], [239, 427, 'Distribuidora Demo Srl'],
  [39, 412, 'Cuenta en'], [239, 412, 'Cuenta de destino'],
  [39, 394, 'Banco Demo'], [239, 394, '0000000000000000001234'],
  [39, 346, 'COMPROBANTE DE LA OPERACIÓN'],
  [39, 312, '1/1'], [475, 312, 'Impreso 05/10/2026 - 10:00'],
  [437, 801, 'Office Banking']
];
const ANCHO_CAR = 5.4;
const items = ITEMS.map(([x, y, str]) => ({ str, x, y, w: Math.round(str.length * ANCHO_CAR * 10) / 10 }));

// PDF mínimo con una página y Helvetica. Los textos con tildes van en WinAnsi (latin1).
function construirPdf(filas) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const contenido = filas.map((i) => `BT /F1 10 Tf ${i.x} ${i.y} Td (${esc(i.str)}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  const partes = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let largo = partes[0].length;
  objs.forEach((o, n) => {
    const cuerpo = o === null ? `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream` : o;
    const b = Buffer.from(`${n + 1} 0 obj\n${cuerpo}\nendobj\n`, 'latin1');
    offsets.push(largo); largo += b.length; partes.push(b);
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${largo}\n%%EOF\n`;
  partes.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(partes);
}

if (require.main === module) {
  const dir = __dirname;
  fs.writeFileSync(path.join(dir, 'items-pdfjs.json'), JSON.stringify(items, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, 'comprobante-demo.pdf'), construirPdf(items));
  console.log('Generados items-pdfjs.json y comprobante-demo.pdf en', dir);
}
module.exports = { items, construirPdf };
