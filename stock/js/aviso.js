// Aviso de pago al proveedor por WhatsApp o email (los de cobranzas del proveedor o, si faltan, los de pedidos). Siempre lo envía una persona (nunca un bot ni un envío automático):
//  * Celular: Compartir con el PDF adjunto (navigator.share con archivos) y el mensaje armado.
//  * Computadora: abre wa.me con el mensaje y deja descargar el PDF para adjuntarlo a mano.
// Se abre en una hoja con un botón propio, así el envío ocurre en un toque nuevo del usuario (los navegadores lo exigen).
import { h } from './util.js';
import { hoja, toast, icon, banner } from './ui.js';
import { marcarAvisado, bajarComprobante, urlComprobante, mensajeError } from './api.js';
import { textoAviso, urlWhatsApp, urlMail, whatsappPagos, emailPagos } from './pagos-util.js';

export function puedeCompartirArchivos(archivo) {
  try { return !!(archivo && navigator.canShare && navigator.share && navigator.canShare({ files: [archivo] })); } catch (_e) { return false; }
}

// pago: fila de `pagos`; prov: proveedor ({nombre, whatsapp, whatsapp_pagos, email, email_pagos}); archivo: File opcional (si ya está en memoria).
export function abrirAviso(pago, prov, { archivo = null, alAvisar } = {}) {
  const texto = textoAviso(pago, prov);
  const nombreArchivo = `${pago.numero_operacion || 'comprobante'}.pdf`;
  let file = archivo;
  const wa = whatsappPagos(prov), mail = emailPagos(prov);
  const estado = h('div', { class: 'form', 'aria-live': 'polite' }, h('p', { class: 'sub', text: 'Preparando el comprobante…' }));
  const cuerpo = h('div', { class: 'form' },
    h('p', { class: 'sub', 'data-destino': '', text: `Para ${prov ? prov.nombre : 'el proveedor'}${wa ? ' · WhatsApp ' + wa : ''}${mail ? ' · ' + mail : ''}` }),
    h('div', { class: 'aviso-txt', 'data-aviso': '', text: texto }), estado);
  const { cerrar } = hoja(wa || !mail ? 'Avisar por WhatsApp' : 'Avisar por email', cuerpo);

  async function avisado() {
    try { await marcarAvisado(pago.id); pago.avisado_en = new Date().toISOString(); if (alAvisar) alAvisar(pago); toast('Marcado como avisado.', 'ok'); }
    catch (e) { toast('Se envió, pero no pude marcarlo como avisado: ' + mensajeError(e), 'error'); }
  }

  async function armar() {
    if (!file && pago.comprobante_path) {
      try { const blob = await bajarComprobante(pago.comprobante_path); file = new File([blob], nombreArchivo, { type: 'application/pdf' }); }
      catch (_e) { file = null; }
    }
    let enlace = null;
    if (pago.comprobante_path) { try { enlace = await urlComprobante(pago.comprobante_path, nombreArchivo); } catch (_e) { enlace = null; } }
    else if (file) enlace = URL.createObjectURL(file);

    const acciones = [];
    if (puedeCompartirArchivos(file)) {
      acciones.push(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', 'data-accion': 'compartir', on: { click: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          await navigator.share({ files: [file], text: texto });
          await avisado(); cerrar();
        } catch (x) {
          b.disabled = false;
          if (x && x.name === 'AbortError') toast('Se canceló el envío. No se marcó como avisado.', 'info');
          else toast('No se pudo compartir: ' + mensajeError(x), 'error');
        }
      } } }, icon('whatsapp', 20), h('span', { text: 'Compartir por WhatsApp con el PDF' })));
    } else {
      const url = urlWhatsApp(wa, texto);
      if (!url) acciones.push(banner(`${prov ? prov.nombre : 'El proveedor'} no tiene WhatsApp cargado.${mail ? ' Podés mandarlo por email.' : ' Cargalo en Proveedores (gerencia) y volvé a intentar.'}`, 'warn'));
      acciones.push(h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', disabled: !url, 'data-accion': 'wa', on: { click: async () => {
        window.open(url, '_blank', 'noopener');
        await avisado(); cerrar();
      } } }, icon('whatsapp', 20), h('span', { text: 'Abrir WhatsApp con el mensaje' })));
      acciones.push(banner('En la computadora WhatsApp no recibe el PDF solo: descargalo y adjuntalo a mano en el chat.', 'info'));
    }
    const urlM = urlMail(mail, `Comprobante de pago · Docks del Puerto${pago.numero_operacion ? ' · Op. ' + pago.numero_operacion : ''}`, texto);
    if (urlM) acciones.push(h('button', { class: 'btn btn-ghost btn-block', type: 'button', 'data-accion': 'mail', on: { click: async () => {
      window.location.href = urlM;
      await avisado(); cerrar();
    } } }, icon('mail', 20), h('span', { text: `Mandar por email a ${mail}` })));
    if (enlace) acciones.push(h('a', { class: 'btn btn-ghost btn-block', href: enlace, download: nombreArchivo, target: '_blank', rel: 'noopener', 'data-accion': 'descargar' }, h('span', { text: 'Descargar el PDF' })));
    else acciones.push(banner('Este pago no tiene el PDF guardado.', 'warn'));
    estado.replaceChildren(...acciones);
  }
  armar();
}
