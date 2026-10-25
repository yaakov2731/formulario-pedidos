// Saca el texto de un PDF digital en el navegador (pdf.js vendorizado en ../vendor) y lo arma en líneas parecidas a
// `pdftotext -layout`: los items se agrupan por coordenada Y y las columnas se separan con 2 o más espacios según la X.
// Así `leerComprobante` (comprobante.js) funciona igual con el texto de pdf.js que con el de pdftotext.

const TOL_Y = 3;       // dos items a menos de 3 pt de alto están en la misma línea
const SEP_COLUMNA = 2; // espacios mínimos entre columnas

// items: [{ str, x, y, w }] (coordenadas de PDF: y crece hacia arriba). Devuelve el texto con una línea por fila.
export function lineasDeItems(items) {
  const filas = [];
  for (const it of items) {
    if (!it || !String(it.str).trim()) continue;
    const fila = filas.find((f) => Math.abs(f.y - it.y) <= TOL_Y);
    if (fila) fila.items.push(it); else filas.push({ y: it.y, items: [it] });
  }
  filas.sort((a, b) => b.y - a.y);
  const out = [];
  let yPrev = null;
  for (const f of filas) {
    f.items.sort((a, b) => a.x - b.x);
    let linea = '';
    let finX = null;
    let anchoCar = null;
    for (const it of f.items) {
      const txt = String(it.str).replace(/\s+$/, '');
      if (finX === null) linea = txt;
      else {
        const hueco = it.x - finX;
        const c = anchoCar || 5;
        if (hueco > c * 1.8) linea += ' '.repeat(Math.max(SEP_COLUMNA, Math.round(hueco / c))) + txt; // otra columna
        else if (hueco > c * 0.25 && !/\s$/.test(String(f.items[f.items.indexOf(it) - 1].str)) && !/^\s/.test(txt)) linea += ' ' + txt;
        else linea += txt;
      }
      finX = it.x + (it.w || 0);
      anchoCar = txt.length ? (it.w || 0) / String(it.str).length : anchoCar;
    }
    if (yPrev !== null && yPrev - f.y > 22) out.push(''); // renglón en blanco entre bloques separados
    out.push(linea);
    yPrev = f.y;
  }
  return out.join('\n');
}

let pdfjsCargado = null;
async function cargarPdfjs() {
  if (!pdfjsCargado) {
    if (typeof Promise.withResolvers !== 'function') { // navegadores un poco más viejos
      Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
    }
    pdfjsCargado = import('../vendor/pdf.min.mjs').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return m;
    });
  }
  return pdfjsCargado;
}

// data: ArrayBuffer | Uint8Array. pdfjs opcional (en node se pasa la build legacy).
export async function textoDePdf(data, pdfjs) {
  const lib = pdfjs || await cargarPdfjs();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const doc = await lib.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const paginas = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const pag = await doc.getPage(i);
      const tc = await pag.getTextContent();
      paginas.push(lineasDeItems(tc.items.filter((it) => typeof it.str === 'string')
        .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))));
    }
  } finally { try { await doc.destroy(); } catch (_e) { /* nada */ } }
  return paginas.join('\n');
}
