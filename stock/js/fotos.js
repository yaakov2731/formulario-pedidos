// Fotos y PDF de facturas: achicar fotos del celular, pasar a base64 y unir varias fotos en una sola imagen.
export const LADO_MAX = 1568;           // px del lado largo: Claude achica a esto igual, más grande solo tarda más en subir
export const PDF_MAX = 9 * 1024 * 1024;

// Foto del celular → JPEG más liviano (las de 12 MP pesan 4–6 MB). Devuelve { data (base64), tipo, img }.
export async function achicarFoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo abrir la foto ' + file.name)); i.src = url; });
    const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.8);
    return { data: dataUrl.split(',')[1], tipo: 'image/jpeg', canvas: c };
  } finally { URL.revokeObjectURL(url); }
}
export const aBase64 = (file) => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => mal(r.error); r.readAsDataURL(file); });
export const base64ABlob = (b64, tipo) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: tipo }); };
// Varias fotos → una sola imagen (una debajo de la otra) para guardar como archivo de la factura.
export function unirFotos(canvases) {
  if (canvases.length === 1) return canvases[0];
  const w = Math.max(...canvases.map(c => c.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = canvases.reduce((s, x) => s + Math.round(x.height * w / x.width), 0);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  let y = 0; for (const x of canvases) { const hh = Math.round(x.height * w / x.width); g.drawImage(x, 0, y, w, hh); y += hh; }
  return c;
}
