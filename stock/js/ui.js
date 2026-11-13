// Piezas de interfaz compartidas: iconos, avisos, stepper, esqueletos, hoja inferior y componentes estilo Apple
// (lista agrupada, botón fijo abajo, título grande, aviso con Deshacer y selector de local).
import { h, parseNum, fmtNum, lsGet, lsSet } from './util.js';

const P = {
  pedir: 'M3 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L19 8H6.2M9 20.2a.9.9 0 1 0 0-.01M17 20.2a.9.9 0 1 0 0-.01',
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  salir: 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3',
  mas: 'M12 5v14M5 12h14',
  menu: 'M5 12h.01M12 12h.01M19 12h.01',
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
  tablero: 'M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-4H4z',
  pagos: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  ajuste: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  imprimir: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  nota: 'M5 3h14a1 1 0 0 1 1 1v10l-6 7H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 21v-6a1 1 0 0 1 1-1h5M8 8h8M8 12h5',
  pin: 'M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v7',
  carpeta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  enviar: 'M4 12l16-8-6 16-2.5-6.5L4 12zM11.5 13.5L20 4',
  equipo: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  persona: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bandeja: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
  basura: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  mail: 'M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3.5 6l8.5 7 8.5-7',
  atras: 'M15 18l-6-6 6-6',
  abajo: 'M6 9l6 6 6-6',
  flecha: 'M9 18l6-6-6-6',
  hoja: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6',
  retiro: 'M4 7h16v13H4zM9 3h6v4H9zM12 11v6M9 14l3 3 3-3',
  hoy: 'M7 3v3M17 3v3M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 9h16M9 14.5l2 2 4-4'
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

// Aviso arriba. Con { accion, onAccion } suma un botón (p. ej. "Deshacer") y dura más (5 s por defecto).
// Devuelve { el, cerrar } para cerrarlo antes de tiempo.
export function toast(texto, tipo = 'info', { accion, onAccion, ms } = {}) {
  const cont = document.getElementById('toasts');
  const t = h('div', { class: `toast toast-${tipo}` + (accion ? ' toast-accion' : ''), role: tipo === 'error' ? 'alert' : 'status' }, h('span', { class: 'toast-t', text: texto }));
  let vivo = true;
  const cerrar = () => { if (!vivo) return; vivo = false; t.classList.add('is-out'); setTimeout(() => t.remove(), 250); };
  if (accion) t.append(h('button', { class: 'toast-b', type: 'button', text: accion, on: { click: () => { cerrar(); if (onAccion) onAccion(); } } }));
  if (cont) cont.append(t);
  setTimeout(cerrar, ms || (accion ? 5000 : (tipo === 'error' ? 6000 : 3200)));
  return { el: t, cerrar };
}
// Aviso con "Deshacer" por 5 s: para acciones que se pueden revertir sin preguntar "¿Seguro?".
export const avisoDeshacer = (texto, onDeshacer, ms = 5000) => toast(texto, 'info', { accion: 'Deshacer', onAccion: onDeshacer, ms });

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

// Hoja inferior accesible (usa <dialog>): en el celular sube desde abajo; se cierra con la cruz, tocando fuera o
// deslizándola hacia abajo desde la manija. { pie } fija un botón (p. ej. "Listo") abajo de todo. Devuelve { dlg, cerrar }.
export function hoja(titulo, contenido, { onClose, pie } = {}) {
  const dlg = h('dialog', { class: 'sheet', 'aria-label': titulo });
  const cerrar = () => { if (dlg.open) dlg.close(); };
  const head = h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-grab', 'aria-hidden': 'true' }), h('h2', { class: 'sheet-t', text: titulo }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', on: { click: cerrar } }, icon('cerrar', 20)));
  dlg.append(head, h('div', { class: 'sheet-body' }, contenido));
  if (pie) dlg.append(h('div', { class: 'sheet-pie' }, pie));
  dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) cerrar(); });
  // Deslizar hacia abajo desde la cabecera: la hoja sigue al dedo y se cierra si bajó más de 80 px (o se tiró rápido).
  let y0 = null, t0 = 0, dy = 0;
  head.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; y0 = e.clientY; t0 = Date.now(); dy = 0; dlg.classList.add('is-arrastre'); try { head.setPointerCapture(e.pointerId); } catch (_e) { /* nada */ } });
  head.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); dlg.style.transform = dy ? `translateY(${dy}px)` : ''; });
  const soltar = () => {
    if (y0 === null) return;
    const rapido = dy > 30 && dy / Math.max(1, Date.now() - t0) > 0.6;
    y0 = null; dlg.classList.remove('is-arrastre');
    if (dy > 80 || rapido) { dlg.style.transform = 'translateY(100%)'; setTimeout(cerrar, 160); } else dlg.style.transform = '';
  };
  head.addEventListener('pointerup', soltar); head.addEventListener('pointercancel', soltar);
  document.body.append(dlg);
  dlg.showModal();
  return { dlg, cerrar };
}

// ---------- Lista agrupada (tipo Ajustes de iPhone) ----------
// Fila: texto a la izquierda (y una línea chica abajo), valor a la derecha con cifras tabulares, chevron si abre algo.
// Con href es un enlace, con onClick un botón; si no, una fila quieta. attrs suma atributos (data-*, aria-*).
export function filaLista({ texto, sub, valor, chevron, icono, href, onClick, check, clase = '', attrs = {} } = {}) {
  const tag = href ? 'a' : (onClick ? 'button' : 'div');
  const el = h(tag, { class: 'lg-fila' + (href || onClick ? ' is-toca' : '') + (clase ? ' ' + clase : ''), href: href || null, type: tag === 'button' ? 'button' : null, ...attrs, on: onClick ? { click: onClick } : undefined },
    icono ? h('span', { class: 'lg-ic' }, typeof icono === 'string' ? icon(icono, 20) : icono) : null,
    h('span', { class: 'lg-tx' }, h('span', { class: 'lg-n', text: texto }), sub ? h('span', { class: 'lg-s', text: sub }) : null),
    valor !== undefined && valor !== null && valor !== '' ? (valor instanceof Node ? h('span', { class: 'lg-v' }, valor) : h('span', { class: 'lg-v num', text: String(valor) })) : null,
    check ? h('span', { class: 'lg-check' }, icon('check', 20)) : null,
    chevron ? h('span', { class: 'lg-chev' }, icon('flecha', 16)) : null);
  return el;
}
// Grupo: título opcional arriba, filas en una tarjeta #1C1C1E con separadores finos y nota opcional abajo.
export function listaGrupo(titulo, filas, { pie, clase = '' } = {}) {
  return h('section', { class: 'lg' + (clase ? ' ' + clase : '') },
    titulo ? h('h2', { class: 'lg-t', text: titulo }) : null,
    h('ul', { class: 'lg-list', role: 'list' }, filas.filter(Boolean).map((f) => h('li', {}, f))),
    pie ? h('p', { class: 'lg-pie', text: pie }) : null);
}

// ---------- Botón principal fijo abajo (ancho completo, 50 px, por encima de la barra) ----------
export function botonFijo(texto, onClick, { clase = '', icono, hidden = false } = {}) {
  return h('button', { class: 'btn-fijo' + (clase ? ' ' + clase : ''), type: 'button', hidden, on: onClick ? { click: onClick } : undefined },
    icono ? icon(icono, 20) : null, h('span', { text: texto }));
}

// ---------- Título grande a la izquierda ----------
// Cabecera de pantalla: título de 34 px, subtítulo y, a la derecha, una acción (p. ej. el selector de local).
// Al bajar, activarTituloGrande() muestra el título chico en una barra fija arriba (como en iOS).
export function tituloGrande(titulo, sub, { accion, volver, clase = '' } = {}) {
  return h('header', { class: 'vista-head tg' + (accion ? ' tg-con-accion' : '') + (clase ? ' ' + clase : '') }, volver || null,
    h('div', { class: 'tg-fila' }, h('div', { class: 'tg-tx' }, h('h1', { class: 'titulo', text: titulo }), sub ? h('p', { class: 'sub', text: sub }) : null), accion || null));
}
// Una sola vez al arrancar: barra con el título chico que aparece cuando el título grande sale de la pantalla.
// En pantallas con buscador fijo (.toolbar-fija) no aparece: el buscador ya ocupa el borde de arriba.
export function activarTituloGrande(scroller) {
  if (!scroller || scroller.querySelector('.tg-barra')) return;
  const barra = h('div', { class: 'tg-barra', 'aria-hidden': 'true' }, h('span', { class: 'tg-barra-t' }));
  scroller.prepend(barra);
  let pend = false;
  const medir = () => {
    pend = false;
    const t = scroller.querySelector('#view .vista-head .titulo');
    const on = !!t && !scroller.querySelector('#view .toolbar-fija') && t.getBoundingClientRect().bottom < barra.getBoundingClientRect().bottom;
    if (on) barra.firstChild.textContent = t.textContent;
    barra.classList.toggle('is-on', on);
  };
  scroller.addEventListener('scroll', () => { if (!pend) { pend = true; requestAnimationFrame(medir); } }, { passive: true });
  window.addEventListener('hashchange', () => barra.classList.remove('is-on'));
}

// ---------- Selector de local en hoja ----------
// Botón "Umo Grill ▾" que abre una hoja con los locales (y "Todos" si se pasa todos). Recuerda el último en clave.
// locales: [{ id, nombre }]. onChange(id | null). Devuelve { el, valor, set }.
export function selectorLocal({ locales, valor = null, todos = null, clave = null, onChange, titulo = 'Elegí el local' }) {
  const ids = new Set(locales.map((l) => l.id));
  let actual = valor;
  if (clave) { const g = lsGet(clave); if (g === null ? !!todos : ids.has(g)) actual = g; }
  if (actual !== null && !ids.has(actual)) actual = null;
  if (actual === null && !todos && locales.length) actual = locales[0].id;
  const nombre = () => (actual === null ? todos : (locales.find((l) => l.id === actual) || {}).nombre || '');
  const txt = h('span', { class: 'sel-local-t' });
  const el = h('button', { class: 'sel-local', type: 'button', 'aria-haspopup': 'dialog', on: { click: () => abrir() } }, txt, icon('abajo', 16));
  const pintar = () => { txt.textContent = nombre(); el.setAttribute('aria-label', `Local: ${nombre()}. Cambiar`); el.setAttribute('data-local', actual || ''); };
  const set = (id, emitir = true) => {
    actual = id || null; pintar();
    if (clave) lsSet(clave, actual);
    if (emitir && onChange) onChange(actual);
  };
  function abrir() {
    let hj = null;
    const opciones = [...(todos ? [{ id: null, nombre: todos }] : []), ...locales];
    hj = hoja(titulo, listaGrupo(null, opciones.map((l) => filaLista({ texto: l.nombre, check: l.id === actual, onClick: () => { hj.cerrar(); if (l.id !== actual) set(l.id); },
      attrs: { 'data-local': l.id || '', 'aria-pressed': l.id === actual ? 'true' : 'false' } }))), {});
  }
  pintar();
  return { el, valor: () => actual, set: (id) => set(id, false) };
}

// Sub-navegación entre pantallas hermanas (Ventas: Resumen · Importar · Análisis · Merma; Cocina: Recetas · Producción).
// Como máximo dos niveles: barra de abajo + este selector. Una pestaña puede agrupar pantallas ([id, texto, filtro, extra]):
//   filtro: [[id, texto], …] se muestra como filtro chico debajo (Control: Hoy · Semana), no como otra fila de pestañas.
//   extra: [[id, texto], …] pantallas que se abren desde ahí (Retiros, Conteos) y tienen "‹ Control" para volver.
export function subnav(items, actual) {
  const en = (lista) => !!lista && lista.some(([id]) => id === actual);
  const grupo = items.find(([, , filtro, extra]) => en(filtro) || en(extra));
  const nav = h('nav', { class: 'subnav', 'aria-label': 'Sección' }, items.map(([id, texto]) => {
    const on = id === actual || (grupo && grupo[0] === id);
    return h('a', { class: 'subnav-b' + (on ? ' is-on' : ''), href: '#/' + id, text: texto, 'aria-current': on ? 'page' : null });
  }));
  if (!grupo) return nav;
  const [gid, gtexto, filtro = [], extra = []] = grupo;
  if (!en(filtro)) {
    return h('div', { class: 'subnav-grupo' }, nav,
      h('a', { class: 'subnav-volver', href: '#/' + gid, 'data-volver': gid }, icon('atras', 18), h('span', { text: gtexto })));
  }
  const fil = h('div', { class: 'subnav-filtro', role: 'group', 'aria-label': gtexto }, filtro.map(([id, texto]) =>
    h('a', { class: 'subnav-f' + (id === actual ? ' is-on' : ''), href: '#/' + id, text: texto, 'aria-current': id === actual ? 'page' : null })));
  const ir = extra.length ? h('div', { class: 'subnav-ir' }, extra.map(([id, texto]) =>
    h('a', { class: 'subnav-ir-b', href: '#/' + id, 'data-ir': id }, h('span', { text: texto }), icon('flecha', 14)))) : null;
  return h('div', { class: 'subnav-grupo' }, nav, h('div', { class: 'subnav-fila' }, fil, ir));
}

// Hoy → tarea: se recuerda de qué tarea se vino para mostrar "‹ Hoy" arriba de esa pantalla (main.js) y volver.
export const CLAVE_DESDE_HOY = 'stock:desde-hoy';
export function desdeHoy(id) { try { sessionStorage.setItem(CLAVE_DESDE_HOY, id); } catch (_e) { /* nada */ } }

// Fila con barra proporcional (CSS): etiqueta, valor y porcentaje.
export function barraFila(etiqueta, valorTexto, fraccion, detalle) {
  return h('li', { class: 'bfila' },
    h('div', { class: 'bfila-t' }, h('span', { class: 'bfila-k', text: etiqueta }), h('b', { class: 'num', text: valorTexto })),
    h('div', { class: 'bfila-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.max(2, Math.round(Math.min(1, fraccion) * 100))}%` })),
    detalle ? h('span', { class: 'bfila-d', text: detalle }) : null);
}

export const SUBNAV_VENTAS = [['resumen', 'Resumen'], ['ventas', 'Importar'], ['analisis', 'Análisis'], ['merma', 'Merma']];
export const SUBNAV_PAGOS = [['gasto', 'Gasto'], ['pagos', 'Cuentas'], ['facturas', 'Facturas'], ['historial', 'Pagos'], ['cargar-pago', 'Cargar']];
// Gerencia · Compras: lo que pidió cada local, lo que se manda a proveedores, lo que llega y cuánto se lleva gastado.
export const SUBNAV_COMPRAS = [['pedidos', 'Pedidos'], ['compras', 'Enviar'], ['recibir', 'Recibir'], ['gasto', 'Gasto']];
// En gerencia Gasto está en Compras; la contadora (sin Compras) lo sigue viendo en Pagos.
export const navPagos = (ctx) => (ctx.rol === 'gerencia' ? SUBNAV_PAGOS.filter(([id]) => id !== 'gasto') : SUBNAV_PAGOS);
export const SUBNAV_CATALOGO = [['catalogo', 'Productos'], ['categorias', 'Categorías'], ['proveedores', 'Proveedores'], ['locales', 'Locales']];
// Gerencia · Stock en 3 pestañas: Qué hay (la foto de ahora), Control (lo que pasó, con filtro Hoy · Semana · Pérdida; desde ahí se
// abren Retiros del Shopping y Conteos guardados) y Lugares (cómo está armado cada local). Elaborados pasó a Cocina.
export const SUBNAV_CONTROL = [['sector', 'Hoy'], ['control', 'Semana'], ['perdida', 'Pérdida']];
export const CONTROL_ABRE = [['g-retiros', 'Retiros'], ['conteos', 'Conteos']];
export const SUBNAV_STOCK = [['stock', 'Qué hay'], ['sector', 'Control', SUBNAV_CONTROL, CONTROL_ABRE], ['lugares', 'Lugares']];
export const SUBNAV_COCINA = [['recetas', 'Recetas'], ['produccion', 'Producción'], ['elaborados', 'Elaborados']];
