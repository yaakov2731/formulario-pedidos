// Lee el texto de un comprobante de transferencia "Office Banking" (el que sube la contadora)
// y devuelve los datos del pago. El texto sale de pdf.js en la app o de `pdftotext -layout`.
// Devuelve null en los campos que no encuentra; la contadora confirma antes de guardar.

function montoANumero(txt) {
  if (!txt) return null;
  const limpio = txt.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function fechaISO(txt) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(txt || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Los valores van en la línea siguiente al par de etiquetas, separados por 2+ espacios.
function valoresDespuesDe(lineas, etiqueta) {
  const i = lineas.findIndex((l) => l.includes(etiqueta));
  if (i < 0) return [];
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j].trim();
    if (l) return l.split(/\s{2,}/);
  }
  return [];
}

function leerComprobante(texto) {
  const lineas = String(texto || '').split(/\r?\n/);
  const op = /Identificador de la operaci[oó]n:\s*(\S+)/i.exec(texto || '');
  const [fecha, monto] = valoresDespuesDe(lineas, 'Fecha de envío');
  const [concepto, descripcion] = valoresDespuesDe(lineas, 'Concepto');
  const desde = (etiqueta) => {
    const i = lineas.findIndex((l) => l.includes(etiqueta));
    return i >= 0 ? lineas.slice(i) : [];
  };
  const [cuitPagador, pagador] = valoresDespuesDe(desde('Datos del pagador'), 'CUIT/CUIL');
  const dest = desde('Datos del destinatario');
  const [cuitDestino, razonDestino] = valoresDespuesDe(dest, 'CUIT/CUIL');
  const [bancoDestino, cuentaDestino] = valoresDespuesDe(dest, 'Cuenta en');
  const cuentaOrigen = valoresDespuesDe(lineas, 'Cuenta a debitar')[0] || null;

  return {
    numero_operacion: op ? op[1] : null,
    fecha: fechaISO(fecha),
    monto: montoANumero(monto),
    concepto: concepto || null,
    descripcion: descripcion || null,
    cuit_pagador: cuitPagador || null,
    pagador: pagador || null,
    cuenta_origen: cuentaOrigen,
    cuit_destino: cuitDestino || null,
    proveedor_razon_social: razonDestino || null,
    banco_destino: bancoDestino || null,
    cuenta_destino: cuentaDestino || null,
  };
}

// Mensaje de aviso al proveedor. Se envía con el botón Compartir (WhatsApp + PDF adjunto)
// o con un link wa.me; siempre lo manda una persona, nunca un bot.
function mensajeAviso(p, nombreProveedor) {
  const monto = p.monto == null ? '' : p.monto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  const fecha = p.fecha ? p.fecha.split('-').reverse().join('/') : '';
  const ultimos = p.cuenta_destino ? p.cuenta_destino.slice(-4) : '';
  const detalle = [p.concepto, p.descripcion].filter(Boolean).join(' · ');
  return [
    `Hola ${nombreProveedor || p.proveedor_razon_social || ''}, te informamos el pago de ${monto}${detalle ? ` (${detalle})` : ''} del ${fecha}.`,
    `Operación ${p.numero_operacion || '-'}, transferencia a tu cuenta${p.banco_destino ? ` del ${p.banco_destino}` : ''}${ultimos ? ` terminada en ${ultimos}` : ''}.`,
    'Te adjunto el comprobante. Saludos, Docks del Puerto.',
  ].join('\n');
}

if (typeof module !== 'undefined') module.exports = { leerComprobante, mensajeAviso };
