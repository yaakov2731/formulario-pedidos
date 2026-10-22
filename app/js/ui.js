// Docks app · piezas de interfaz (DOM). Sin dependencias.
import { esc, fmtNum, inputNum, parseNum, paso, redondear } from './util.js';

/* ---------- creación de nodos ---------- */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Reemplaza los hijos ignorando null/undefined/false (replaceChildren(null) escribe el texto "null").
export function fill(el, ...children) { clear(el); return append(el, children); }

export function frag(...children) { return append(document.createDocumentFragment(), children); }

/* ---------- íconos (trazo 1.8, extremos redondos) ---------- */
const PATHS = {
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 12l2 2 4-4"/><path d="M9 17h6"/>',
  flame: '<path d="M12 3c.6 2.8 3.6 4.3 3.6 7.6a3.6 3.6 0 0 1-7.2 0c0-1.3.5-2.3 1.3-3.1.2 1.1.7 1.8 1.4 2.2C10.8 7.9 10.9 5.2 12 3z"/><path d="M5 17h14"/><path d="M7 17v4M17 17v4"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  bag: '<path d="M6 8h12l1 13H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6"/>',
  chart: '<path d="M4 20h16"/><path d="M6 16v-5M11 16V7M16 16v-3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h12"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.9.3 5.5 2.4 5.5 5.8"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"/><path d="M5 11v9h14v-9"/><path d="M10 20v-5h4v5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  whatsapp: '<path d="M4 20l1.3-4A8.5 8.5 0 1 1 8.4 19z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.9-.9-.8.8c-1.2-.5-2-1.3-2.5-2.5l.8-.8-.9-1.9z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  offline: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 8-2.8"/><path d="M9 15.5a5 5 0 0 1 2.3-1.3"/><circle cx="12" cy="19" r=".8"/><path d="M3 3l18 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 9-12h-6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9"/><path d="M16 4l3 3M18 2l3 3"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/>',
  arrow: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.3-3.2L2.6 13a1.4 1.4 0 0 1 2.4-1.4L8 15"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'
};

export function icon(name, size = 24) {
  const p = PATHS[name] || PATHS.info;
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
  return t.content.firstChild;
}

/* ---------- táctil ---------- */
export function haptic(kind = 'light') {
  try {
    if (!navigator.vibrate) return;
    navigator.vibrate(kind === 'success' ? [10, 40, 10] : kind === 'error' ? [30, 40, 30] : 8);
  } catch (_e) { /* no soportado */ }
}

/* ---------- toast ---------- */
let toastRoot;
export function toast(msg, tipo = 'info', ms) {
  if (!toastRoot) { toastRoot = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastRoot); }
  const el = h('div', { class: `toast ${tipo}` }, icon(tipo === 'ok' ? 'check' : tipo === 'error' ? 'alert' : 'info', 18), h('span', { text: msg }));
  toastRoot.append(el);
  const dur = ms || (tipo === 'error' ? 5500 : 2800);
  setTimeout(() => el.classList.add('is-out'), dur);
  setTimeout(() => el.remove(), dur + 300);
  if (tipo === 'error') haptic('error');
  return el;
}

/* ---------- botones y celdas ---------- */
export function btn(label, { kind = '', onClick, icon: ic, full, disabled, size = '', type = 'button', attrs = {} } = {}) {
  const cls = ['btn', kind ? `btn-${kind}` : '', full ? 'btn-full' : '', size ? `btn-${size}` : ''].filter(Boolean).join(' ');
  return h('button', { class: cls, type, disabled: !!disabled, onClick, ...attrs }, ic ? icon(ic, 20) : null, label ? h('span', { text: label }) : null);
}

export function cell({ title, sub, value, valueStrong, chevron, onClick, lead, leadKind = '', href, right, cls = '', attrs = {} }) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const inner = [
    lead ? h('span', { class: `cell-lead ${leadKind}` }, typeof lead === 'string' ? icon(lead, 20) : lead) : null,
    h('div', { class: 'cell-body' },
      title instanceof Node ? title : h('div', { class: 'cell-title', text: title }),
      sub ? (sub instanceof Node ? sub : h('div', { class: 'cell-sub', text: sub })) : null),
    right || null,
    value !== undefined && value !== null ? h('div', { class: `cell-value${valueStrong ? ' strong' : ''}`, text: value }) : null,
    chevron || href ? h('span', { class: 'cell-chev' }, icon('chevron', 14)) : null
  ];
  const el = h(tag, { class: `cell${lead ? ' has-lead' : ''}${cls ? ' ' + cls : ''}`, type: tag === 'button' ? 'button' : null, href, onClick, ...attrs }, ...inner);
  return el;
}

export function group(title, children, foot) {
  return h('section', { class: 'group' },
    title ? h('h2', { class: 'group-title', text: title }) : null,
    h('div', { class: 'list' }, ...[].concat(children)),
    foot ? h('p', { class: 'group-foot', text: foot }) : null);
}

export function empty({ icon: ic = 'box', title, text, action }) {
  return h('div', { class: 'empty' }, icon(ic, 44), h('h3', { text: title }), text ? h('p', { text }) : null, action || null);
}

export function skeleton(n = 4) {
  const list = h('div', { class: 'list' });
  for (let i = 0; i < n; i++) {
    list.append(h('div', { class: 'sk-cell' },
      h('div', { class: 'skeleton', style: 'width:32px;height:32px;border-radius:8px;flex-shrink:0' }),
      h('div', { class: 'grow stack', style: 'gap:8px' }, h('div', { class: 'skeleton', style: `width:${55 + (i * 13) % 35}%` }), h('div', { class: 'skeleton', style: 'width:35%;height:11px' }))));
  }
  return list;
}

export function banner(text, kind = 'plain', { icon: ic, action } = {}) {
  return h('div', { class: `banner ${kind}`, role: kind === 'bad' ? 'alert' : null }, ic ? icon(ic, 20) : null, h('span', { class: 'grow', text }), action || null);
}

export function badge(text, kind = 'plain') { return h('span', { class: `badge ${kind}`, text }); }

let fieldSeq = 0;
export function field(label, input, { error, hint, id } = {}) {
  if (!input.id) input.id = id || `f-${++fieldSeq}`;
  if (input.hasAttribute('aria-label')) input.removeAttribute('aria-label');
  return h('div', { class: 'field' }, h('label', { for: input.id || null, text: label }), input, hint ? h('span', { class: 'note', text: hint }) : null, h('p', { class: 'field-error', role: 'alert', text: error || '' }));
}

export function input(attrs = {}) {
  const el = h('input', { class: 'input', type: 'text', autocomplete: 'off', ...attrs });
  return el;
}

export function select(options, value, attrs = {}) {
  const el = h('select', { class: 'input', ...attrs });
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    el.append(h('option', { value: opt.value, text: opt.label, selected: opt.value === value }));
  }
  return el;
}

export function switchEl(on, onChange, label) {
  const el = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label || null });
  el.addEventListener('click', () => {
    const now = el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', now ? 'true' : 'false');
    haptic();
    onChange && onChange(now);
  });
  return el;
}

export function segmented(options, value, onChange, label) {
  const el = h('div', { class: 'segmented', role: 'tablist', 'aria-label': label || null });
  for (const o of options) {
    const b = h('button', { type: 'button', role: 'tab', class: o.value === value ? 'is-on' : '', 'aria-selected': o.value === value ? 'true' : 'false', text: o.label });
    b.addEventListener('click', () => {
      for (const x of el.children) { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); }
      haptic();
      onChange(o.value);
    });
    el.append(b);
  }
  return el;
}

// Stepper numérico: value null = vacío. onChange(valor|null)
export function stepper({ value = null, unidad, min = 0, onChange, label, wide }) {
  const st = paso(unidad);
  const inp = h('input', { type: 'text', inputmode: 'decimal', 'aria-label': label || 'Cantidad', value: inputNum(value) });
  const el = h('div', { class: `stepper${wide ? ' wide' : ''}${value !== null && value !== undefined && value !== '' ? ' is-on' : ''}` });
  const menos = h('button', { type: 'button', 'aria-label': `Menos ${label || ''}`.trim() }, icon('minus', 18));
  const mas = h('button', { type: 'button', 'aria-label': `Más ${label || ''}`.trim() }, icon('plus', 18));
  const set = (v, fromInput) => {
    if (v !== null && v < min) v = min;
    if (!fromInput) inp.value = inputNum(v);
    el.classList.toggle('is-on', v !== null && v !== undefined);
    onChange && onChange(v);
  };
  menos.addEventListener('click', () => { const cur = parseNum(inp.value); if (cur === null) return; haptic(); const v = Math.round((cur - st) * 1000) / 1000; set(v <= min ? (min === 0 ? null : min) : v); });
  mas.addEventListener('click', () => { const cur = parseNum(inp.value) || 0; haptic(); set(Math.round((cur + st) * 1000) / 1000); });
  inp.addEventListener('input', () => { set(parseNum(inp.value), true); });
  inp.addEventListener('blur', () => { const v = parseNum(inp.value); inp.value = inputNum(v); });
  inp.addEventListener('focus', () => { try { inp.select(); } catch (_e) { /* nada */ } });
  el.append(menos, inp, mas);
  el.setValue = (v) => set(v);
  el.getValue = () => parseNum(inp.value);
  el.input = inp;
  return el;
}

export function cantidadTexto(n, unidad) { return fmtNum(n, unidad); }
export { redondear };

/* ---------- hoja (sheet) ---------- */
const abiertas = [];
export function sheet({ title, body, actions, onClose, wide, closable = true, label }) {
  const root = h('div', { class: 'sheet-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title || 'Panel' });
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: `sheet${wide ? ' wide' : ''}` });
  const bodyEl = h('div', { class: 'sheet-body' });
  append(bodyEl, [body]);
  const actionsEl = actions ? h('div', { class: `sheet-actions${Array.isArray(actions) && actions.length === 2 ? ' row2' : ''}` }, ...[].concat(actions)) : null;
  let closed = false;
  const api = {
    el: panel, body: bodyEl, root,
    close(result) {
      if (closed) return;
      closed = true;
      root.classList.add('is-closing'); root.classList.remove('is-open');
      const idx = abiertas.indexOf(api); if (idx > -1) abiertas.splice(idx, 1);
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { root.remove(); if (!abiertas.length) document.body.style.overflow = ''; }, 260);
      onClose && onClose(result);
    },
    setTitle(t) { const hh = panel.querySelector('.sheet-head h2'); if (hh) hh.textContent = t; }
  };
  const closeBtn = closable ? h('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Cerrar' }, icon('x', 16)) : null;
  if (closeBtn) closeBtn.addEventListener('click', () => api.close());
  const head = (title || closable) ? h('div', { class: 'sheet-head' }, h('h2', { text: title || '' }), closeBtn) : null;
  append(panel, [h('div', { class: 'sheet-handle' }), head, bodyEl, actionsEl]);
  root.append(backdrop, panel);
  if (closable) backdrop.addEventListener('click', () => api.close());
  function onKey(e) { if (e.key === 'Escape' && closable && abiertas[abiertas.length - 1] === api) api.close(); }
  document.addEventListener('keydown', onKey);
  // arrastre hacia abajo para cerrar (celular)
  if (closable) {
    let y0 = null, dy = 0;
    const handleArea = panel;
    handleArea.addEventListener('touchstart', (e) => { if (bodyEl.scrollTop > 0 && bodyEl.contains(e.target)) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; panel.style.transition = 'none'; }, { passive: true });
    handleArea.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); panel.style.transform = `translateY(${dy}px)`; }, { passive: true });
    handleArea.addEventListener('touchend', () => { if (y0 === null) return; panel.style.transition = ''; if (dy > 90) { api.close(); } else { panel.style.transform = ''; } y0 = null; });
  }
  document.body.append(root);
  document.body.style.overflow = 'hidden';
  abiertas.push(api);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
  setTimeout(() => { const f = panel.querySelector('input:not([type=hidden]), textarea, select, button.btn-primary, button'); if (f && window.matchMedia('(min-width: 820px)').matches) f.focus(); }, 300);
  return api;
}

export function confirmar({ title, text, ok = 'Confirmar', cancel = 'Cancelar', danger = false, body }) {
  return new Promise((resolve) => {
    let result = false;
    const s = sheet({
      title,
      body: [text ? h('p', { class: 'sub', style: 'color:var(--text);font-size:17px;line-height:22px;padding:4px 0 8px', text }) : null, body || null],
      actions: [
        btn(cancel, { onClick: () => s.close() }),
        btn(ok, { kind: danger ? 'danger-fill' : 'primary', onClick: () => { result = true; s.close(); } })
      ],
      onClose: () => resolve(result)
    });
  });
}

export function prompt({ title, text, label, value = '', placeholder, ok = 'Guardar', multiline, required = true, validar }) {
  return new Promise((resolve) => {
    let result = null;
    const inp = multiline ? h('textarea', { class: 'input', placeholder, value }) : input({ value, placeholder });
    if (multiline) inp.value = value;
    const err = h('p', { class: 'field-error', role: 'alert' });
    const s = sheet({
      title,
      body: [text ? h('p', { class: 'sub', text, style: 'padding-bottom:10px' }) : null, h('div', { class: 'field' }, label ? h('label', { text: label }) : null, inp, err)],
      actions: [btn('Cancelar', { onClick: () => s.close() }), btn(ok, { kind: 'primary', onClick: () => {
        const v = inp.value.trim();
        if (required && !v) { err.textContent = 'Completá este dato.'; inp.classList.add('is-invalid'); return; }
        if (validar) { const e = validar(v); if (e) { err.textContent = e; inp.classList.add('is-invalid'); return; } }
        result = v; s.close();
      } })],
      onClose: () => resolve(result)
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); s.el.querySelector('.btn-primary').click(); } });
    setTimeout(() => inp.focus(), 350);
  });
}

/* ---------- encabezado grande con barra compacta ---------- */
export function largeTitle({ title, sub, actions, topbar }) {
  const header = h('header', { class: 'lt' }, h('div', null, h('h1', { text: title }), sub ? h('p', { class: 'lt-sub', text: sub }) : null), actions ? h('div', { class: 'lt-actions' }, ...[].concat(actions)) : null);
  if (topbar) {
    const t = topbar.querySelector('.topbar-title');
    if (t) t.textContent = title;
    topbar.classList.remove('is-compact');
    if ('IntersectionObserver' in window) {
      const h1 = header.querySelector('h1');
      const io = new IntersectionObserver(([e]) => { topbar.classList.toggle('is-compact', !e.isIntersecting && e.boundingClientRect.top < 0); }, { rootMargin: `-${44 + 2}px 0px 0px 0px`, threshold: 0 });
      requestAnimationFrame(() => io.observe(h1));
      header._io = io;
    }
  }
  return header;
}

export function buscador({ placeholder = 'Buscar', onInput, value = '' }) {
  const inp = h('input', { class: 'input', type: 'search', placeholder, value, autocomplete: 'off', autocorrect: 'off', 'aria-label': placeholder, enterkeyhint: 'search' });
  const clearBtn = h('button', { class: 'clear', type: 'button', 'aria-label': 'Borrar búsqueda', hidden: !value }, icon('x', 18));
  const wrap = h('div', { class: 'search' }, icon('search', 18), inp, clearBtn);
  inp.addEventListener('input', () => { clearBtn.hidden = !inp.value; onInput(inp.value); });
  clearBtn.addEventListener('click', () => { inp.value = ''; clearBtn.hidden = true; onInput(''); inp.focus(); });
  wrap.input = inp;
  return wrap;
}

export function chip(label, { on, onClick, icon: ic, kind = '' } = {}) {
  return h('button', { class: `chip${on ? ' is-on' : ''}${kind ? ' ' + kind : ''}`, type: 'button', 'aria-pressed': on ? 'true' : 'false', onClick }, ic ? icon(ic, 16) : null, h('span', { text: label }));
}

export function checkEl(on, label) {
  return h('span', { class: `check${on ? ' is-on' : ''}`, role: 'img', 'aria-label': label ? `${on ? 'Seleccionado' : 'No seleccionado'}: ${label}` : null }, icon('check', 14));
}

export function copiar(texto) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto).then(() => true, () => false);
  try {
    const ta = h('textarea', { style: 'position:fixed;opacity:0', value: texto });
    document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove();
    return Promise.resolve(ok);
  } catch (_e) { return Promise.resolve(false); }
}

export function doneScreen({ title, text, id, actions }) {
  return h('div', { class: 'done' },
    h('div', { class: 'done-mark' }, icon('check', 44)),
    h('h1', { text: title }),
    text ? h('p', { text }) : null,
    id ? h('div', { class: 'done-id', text: id }) : null,
    actions ? h('div', { class: 'btn-group mt24' }, ...[].concat(actions)) : null);
}

export function escHtml(s) { return esc(s); }
