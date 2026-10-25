// Piezas de interfaz compartidas: iconos, toasts, stepper, esqueletos, hoja modal.
import { h, parseNum, fmtNum } from './util.js';

const P = {
  pedir: 'M3 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19 8H6.2M9 20.2a.9.9 0 1 0 0-.01M17 20.2a.9.9 0 1 0 0-.01',
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  salir: 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  mas: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  recibir: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  stock: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  catalogo: 'M3 12l9-9h8a1 1 0 0 1 1 1v8l-9 9-9-9zM16 8h.01',
  whatsapp: 'M4 20l1.3-4.2A8 8 0 1 1 8.3 18.8L4 20z',
  cerrar: 'M6 6l12 12M18 6L6 18',
  editar: 'M4 20h4L19 9l-4-4L4 16v4z',
  ventas: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  cocina: 'M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6zM3 11h18M9 7c0-2 2-2 2-4M14 7c0-2 2-2 2-4',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'
};
export function icon(nombre, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[nombre] || P.check); s.append(p);
  return s;
}

export function toast(texto, tipo = 'info') {
  const cont = document.getElementById('toasts');
  const t = h('div', { class: `toast toast-${tipo}`, role: tipo === 'error' ? 'alert' : 'status', text: texto });
  cont.append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 250); }, tipo === 'error' ? 6000 : 3200);
}

// Stepper −/+ con campo numérico. onChange(valor|null).
export function stepper({ value = 0, label, paso = 1, onChange, max = 99999 }) {
  const inp = h('input', { class: 'step-val num', type: 'text', inputmode: 'decimal', 'aria-label': label || 'Cantidad', value: value ? fmtNum(value, 3) : '0' });
  const menos = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Menos · ' + (label || 'cantidad') }, icon('menos', 18));
  const mas = h('button', { class: 'step-btn', type: 'button', 'aria-label': 'Más · ' + (label || 'cantidad') }, icon('mas', 18));
  const el = h('div', { class: 'stepper' }, menos, inp, mas);
  let v = value || 0;
  const set = (n, emitir = true) => {
    n = Math.min(max, Math.max(0, Math.round(n * 1000) / 1000));
    v = n; inp.value = fmtNum(n, 3) || '0';
    el.classList.toggle('is-on', n > 0);
    if (emitir && onChange) onChange(n);
  };
  el.classList.toggle('is-on', v > 0);
  menos.addEventListener('click', () => set(v - paso));
  mas.addEventListener('click', () => set(v + paso));
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('change', () => { const n = parseNum(inp.value); set(n === null ? 0 : n); });
  return { el, set: (n) => set(n, false), get: () => v };
}

export function esqueleto(n = 6) {
  return h('div', { class: 'skel-list', 'aria-hidden': 'true' }, Array.from({ length: n }, () =>
    h('div', { class: 'skel-card' }, h('div', { class: 'skel skel-l1' }), h('div', { class: 'skel skel-l2' }), h('div', { class: 'skel skel-l3' }))));
}
export const vacio = (titulo, texto) => h('div', { class: 'empty' }, h('p', { class: 'empty-t', text: titulo }), texto ? h('p', { class: 'empty-s', text: texto }) : null);
export const banner = (texto, tipo = 'info') => h('div', { class: `banner banner-${tipo}`, role: tipo === 'error' ? 'alert' : null }, icon('alerta', 18), h('span', { text: texto }));

export function campo(etiqueta, input, ayuda) {
  return h('label', { class: 'field' }, h('span', { class: 'field-l', text: etiqueta }), input, ayuda ? h('span', { class: 'field-h', text: ayuda }) : null);
}

// Hoja modal accesible (usa <dialog>). Devuelve { cuerpo, cerrar }.
export function hoja(titulo, contenido, { onClose } = {}) {
  const dlg = h('dialog', { class: 'sheet', 'aria-label': titulo });
  const cerrar = () => { if (dlg.open) dlg.close(); };
  const head = h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-t', text: titulo }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', on: { click: cerrar } }, icon('cerrar', 20)));
  dlg.append(head, h('div', { class: 'sheet-body' }, contenido));
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) cerrar(); });
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, cerrar };
}

// Sub-navegación entre pantallas hermanas (Ventas: Importar · Análisis · Merma; Cocina: Recetas · Producción).
export function subnav(items, actual) {
  return h('nav', { class: 'subnav', 'aria-label': 'Sección' }, items.map(([id, texto]) =>
    h('a', { class: 'subnav-b' + (id === actual ? ' is-on' : ''), href: '#/' + id, text: texto, 'aria-current': id === actual ? 'page' : null })));
}

// Fila con barra proporcional (CSS): etiqueta, valor y porcentaje.
export function barraFila(etiqueta, valorTexto, fraccion, detalle) {
  return h('li', { class: 'bfila' },
    h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: etiqueta }), h('b', { class: 'num', text: valorTexto })),
    h('div', { class: 'bfila-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.max(2, Math.round(Math.min(1, fraccion) * 100))}%` })),
    detalle ? h('span', { class: 'bfila-d', text: detalle }) : null);
}

export const SUBNAV_VENTAS = [['ventas', 'Importar'], ['analisis', 'Análisis'], ['merma', 'Merma']];
export const SUBNAV_COCINA = [['recetas', 'Recetas'], ['produccion', 'Producción']];
