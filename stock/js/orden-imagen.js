// Copia del pedido en imagen (PNG) para mandarle al proveedor: logo de Docks del Puerto, proveedor, fecha
// y los productos, separados por local o todo junto. Sin precios.
// orden: { proveedor, fecha: Date, bloques: [{ titulo, factura, lineas: [{ cant, unidad, nombre, codigo, detalle }] }] }
// codigo: el del proveedor ("Cód. LAVAN"), debajo del nombre.
// factura: "Facturar a SUMA ACTIVA S.A." (razón social del local), debajo del título del bloque.

const W = 1080, PAD = 72;
const COLORES = ['#EB4537', '#F4842A', '#F8B600', '#4688F4'];
const TINTA = '#0E1A2B', GRIS = '#5B6675', LINEA = '#D9DEE5', FONDO_BLOQUE = '#F3F5F8';
const SANS = '"Public Sans", -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const DISPLAY = '"Familjen Grotesk", ' + SANS;
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

function cortar(ctx, texto, ancho) {
  const palabras = String(texto).split(/\s+/);
  const lineas = [];
  let act = '';
  for (const p of palabras) {
    const prueba = act ? act + ' ' + p : p;
    if (ctx.measureText(prueba).width <= ancho || !act) act = prueba;
    else { lineas.push(act); act = p; }
  }
  if (act) lineas.push(act);
  return lineas;
}

function logo(ctx, cx, y) {
  const lado = 62, gap = 14, total = lado * 4 + gap * 3;
  let x = cx - total / 2;
  COLORES.forEach((c) => {
    ctx.fillStyle = c; ctx.fillRect(x, y, lado, lado);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + lado * 0.36, y + lado * 0.36, lado * 0.28, lado * 0.52);
    x += lado + gap;
  });
  ctx.fillStyle = '#A3A3A3'; ctx.fillRect(cx - total / 2 - 6, y + lado + 14, total + 12, 2);
  return y + lado + 16;
}

function fechaLarga(d) {
  const s = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Dibuja en un canvas; con medir=true solo calcula el alto.
function pintar(ctx, orden, medir) {
  const cx = W / 2;
  let y = PAD;
  const t = (txt, x, yy, font, color, align = 'left') => { if (medir) return; ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(txt, x, yy); };

  if (!medir) y = logo(ctx, cx, y); else y += 78;
  y += 54; t('DOCKS DEL PUERTO', cx, y, `400 46px ${DISPLAY}`, TINTA, 'center');
  y += 32; t('LOCALES COMERCIALES • GASTRONOMÍA • DIVERSIÓN • TIGRE', cx, y, `500 17px ${SANS}`, GRIS, 'center');

  y += 56;
  if (!medir) { ctx.fillStyle = TINTA; ctx.fillRect(PAD, y, W - PAD * 2, 64); }
  t('ORDEN DE PEDIDO', PAD + 28, y + 42, `700 26px ${SANS}`, '#FFFFFF');
  t(orden.numero ? 'N° ' + orden.numero : '', W - PAD - 28, y + 42, `600 22px ${MONO}`, '#FFFFFF', 'right');
  y += 64 + 50;
  t('PROVEEDOR', PAD, y, `700 16px ${SANS}`, GRIS);
  t('FECHA', W - PAD, y, `700 16px ${SANS}`, GRIS, 'right');
  y += 40;
  ctx.font = `700 34px ${DISPLAY}`;
  const provLineas = cortar(ctx, orden.proveedor, W - PAD * 2 - 360);
  t(fechaLarga(orden.fecha), W - PAD, y, `500 22px ${SANS}`, TINTA, 'right');
  provLineas.forEach((l, i) => t(l, PAD, y + i * 40, `700 34px ${DISPLAY}`, TINTA));
  y += (provLineas.length - 1) * 40 + 36;

  const xCant = PAD + 150, xNom = PAD + 172, anchoNom = W - PAD - 24 - xNom;
  let total = 0;
  for (const b of orden.bloques) {
    y += 28;
    const altoCab = b.factura ? 86 : 54;
    if (!medir) { ctx.fillStyle = FONDO_BLOQUE; ctx.fillRect(PAD, y, W - PAD * 2, altoCab); ctx.fillStyle = COLORES[3]; ctx.fillRect(PAD, y, 6, altoCab); }
    t(b.titulo.toUpperCase(), PAD + 26, y + 36, `700 22px ${SANS}`, TINTA);
    t(`${b.lineas.length} ${b.lineas.length === 1 ? 'producto' : 'productos'}`, W - PAD - 22, y + 36, `500 18px ${SANS}`, GRIS, 'right');
    if (b.factura) t(b.factura, PAD + 26, y + 68, `700 19px ${SANS}`, TINTA);
    y += altoCab;
    for (const l of b.lineas) {
      total++;
      ctx.font = `600 25px ${SANS}`;
      const nom = cortar(ctx, l.nombre, anchoNom);
      const alto = 24 + nom.length * 32 + (l.codigo ? 26 : 0) + (l.detalle ? 26 : 0) + 14;
      t(l.cant, xCant, y + 46, `600 26px ${MONO}`, TINTA, 'right');
      t(l.unidad || '', xCant, y + 72, `500 16px ${SANS}`, GRIS, 'right');
      nom.forEach((n, i) => t(n, xNom, y + 46 + i * 32, `600 25px ${SANS}`, TINTA));
      let yExtra = y + 46 + nom.length * 32 - 4;
      if (l.codigo) { t('Cód. ' + l.codigo, xNom, yExtra, `600 18px ${MONO}`, TINTA); yExtra += 26; }
      if (l.detalle) t(l.detalle, xNom, yExtra, `400 18px ${SANS}`, GRIS);
      y += Math.max(alto, 86);
      if (!medir) { ctx.fillStyle = LINEA; ctx.fillRect(PAD + 20, y - 1, W - PAD * 2 - 40, 1); }
    }
  }

  y += 50;
  t(`Total: ${total} ${total === 1 ? 'producto' : 'productos'}`, PAD, y, `700 22px ${SANS}`, TINTA);
  t('¡Gracias!', W - PAD, y, `700 22px ${SANS}`, TINTA, 'right');
  y += 36;
  t('Docks del Puerto · Tigre', PAD, y, `400 18px ${SANS}`, GRIS);
  return y + PAD - 20;
}

export async function imagenOrden(orden) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_e) { /* sin fuentes web: usa las del sistema */ }
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const alto = Math.ceil(pintar(ctx, orden, true));
  c.width = W; c.height = alto;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, alto);
  ctx.textBaseline = 'alphabetic';
  pintar(ctx, orden, false);
  return new Promise((ok, mal) => c.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo armar la imagen'))), 'image/png'));
}
