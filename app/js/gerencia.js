// Piezas comunes de gerencia: escrituras con clave, selector de local, tabla, pegar desde Excel.
import { h, btn, sheet, banner, toast, select, icon, haptic, fill } from './ui.js';
import { parsearTabla, norm, parseNum, texto, esc } from './util.js';
import * as api from './api.js';

export async function postAdmin(ctx, payload) {
  const r = await api.post({ ...payload, admin_key: ctx.S.adminKey });
  if (!r) throw new api.ApiError('No se pudo leer la respuesta de la planilla. Actualizá para ver si se guardó.');
  return r;
}

export function manejarError(ctx, e) {
  if (e && e.server && /clave/i.test(e.message)) {
    toast(e.message, 'error');
    ctx.guardarAdminKey('', false);
    ctx.go('entrar/gerencia', true);
    return true;
  }
  return false;
}

export function localesDe(ctx, { soloActivos = true } = {}) {
  const l = (ctx.S.boot && ctx.S.boot.locales) || [];
  return soloActivos ? l.filter(x => x.activo !== false && x.activo !== 'NO') : l;
}

export function proveedoresDe(ctx, { soloActivos = true } = {}) {
  const l = (ctx.S.boot && ctx.S.boot.proveedores) || [];
  return soloActivos ? l.filter(x => x.activo !== false && x.activo !== 'NO') : l;
}

export function selectLocal(ctx, value, { todos, onChange, soloActivos = true, label = 'Local' } = {}) {
  const opts = [...(todos ? [{ value: '', label: todos }] : []), ...localesDe(ctx, { soloActivos }).map(l => ({ value: l.local, label: l.local }))];
  const el = select(opts, value, { 'aria-label': label });
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function selectProveedor(ctx, value, { vacio = 'Elegí un proveedor', onChange } = {}) {
  const opts = [{ value: '', label: vacio }, ...proveedoresDe(ctx).map(p => ({ value: p.proveedor, label: p.proveedor }))];
  const el = select(opts, value, { 'aria-label': 'Proveedor' });
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

// Tabla: columns [{key, label, num, render(row)}], rows, onRow(row)
export function tabla({ columns, rows, onRow, vacio, selected }) {
  const thead = h('thead', null, h('tr', null, ...columns.map(c => h('th', { class: c.num ? 'num' : '', text: c.label }))));
  const tbody = h('tbody');
  if (!rows.length) tbody.append(h('tr', null, h('td', { colspan: String(columns.length), class: 'muted', style: 'padding:24px;text-align:center', text: vacio || 'Sin datos' })));
  for (const r of rows) {
    const tr = h('tr', { class: selected && selected(r) ? 'is-selected' : '', tabindex: onRow ? '0' : null, role: onRow ? 'button' : null, style: onRow ? 'cursor:pointer' : null });
    for (const c of columns) {
      const v = c.render ? c.render(r) : r[c.key];
      tr.append(h('td', { class: c.num ? 'num' : '' }, v instanceof Node ? v : (v === null || v === undefined ? '—' : String(v))));
    }
    if (onRow) { tr.addEventListener('click', () => onRow(r)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } }); }
    tbody.append(tr);
  }
  return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, thead, tbody));
}

/* ---------- pegar desde Excel ----------
 * columnas: [{key, label, alias:[...], num, req}] ; onEnviar(filas) -> Promise<resultadoHtmlNode|string> */
export function pegarDesdeExcel({ title, columnas, ayuda, onEnviar, extraTop }) {
  const ta = h('textarea', { class: 'input', rows: '8', placeholder: 'Copiá las celdas en Excel o Google Sheets y pegalas acá (Ctrl+V).', style: 'min-height:160px;font-size:14px' });
  const preview = h('div', { class: 'mt12' });
  const err = h('p', { class: 'field-error', role: 'alert' });
  let filas = [];
  const enviar = btn('Cargar', { kind: 'primary', onClick: async () => {
    if (!filas.length) { err.textContent = 'Pegá al menos una fila.'; return; }
    err.textContent = ''; enviar.disabled = true;
    try {
      const out = await onEnviar(filas);
      fill(preview, typeof out === 'string' ? banner(out, 'ok', { icon: 'check' }) : out);
      ta.value = ''; filas = []; enviar.textContent = 'Listo';
      enviar.onclick = () => s.close();
      enviar.disabled = false;
    } catch (e) { err.textContent = e.message; enviar.disabled = false; }
  } });
  function analizar() {
    const tabla = parsearTabla(ta.value);
    filas = [];
    if (!tabla.length) { fill(preview); return; }
    // ¿primera fila es encabezado?
    let mapa = columnas.map((c, i) => i);
    const cab = tabla[0].map(norm);
    const esCab = cab.some(x => columnas.some(c => [c.label, c.key, ...(c.alias || [])].map(norm).includes(x)));
    let cuerpo = tabla;
    if (esCab) {
      mapa = columnas.map(c => cab.findIndex(x => [c.label, c.key, ...(c.alias || [])].map(norm).includes(x)));
      cuerpo = tabla.slice(1);
    }
    const errores = [];
    cuerpo.forEach((r, k) => {
      const f = {};
      columnas.forEach((c, j) => { const idx = mapa[j]; let v = idx > -1 ? (r[idx] || '') : ''; if (c.num) { const n = v === '' ? null : parseNum(v); if (v !== '' && n === null) errores.push(`Fila ${k + 1}: ${c.label} no es un número (${v}).`); f[c.key] = n; } else f[c.key] = texto(v, 120); });
      for (const c of columnas) if (c.req && (f[c.key] === '' || f[c.key] === null || f[c.key] === undefined)) errores.push(`Fila ${k + 1}: falta ${c.label}.`);
      filas.push(f);
    });
    const tbl = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ...columnas.map(c => h('th', { text: c.label })))),
      h('tbody', null, ...filas.slice(0, 50).map(f => h('tr', null, ...columnas.map(c => h('td', { class: c.num ? 'num' : '', text: f[c.key] === null || f[c.key] === undefined ? '' : String(f[c.key]) }))))));
    fill(preview, 
      h('p', { class: 'note', text: `${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}${esCab ? ' (encabezado detectado)' : ''}${filas.length > 50 ? ', se muestran 50' : ''}` }),
      h('div', { class: 'table-wrap mt8', style: 'max-height:260px' }, tbl),
      errores.length ? banner(errores.slice(0, 5).join(' ') + (errores.length > 5 ? ` (+${errores.length - 5})` : ''), 'bad', { icon: 'alert' }) : null);
    enviar.disabled = !!errores.length;
  }
  ta.addEventListener('input', analizar);
  const s = sheet({ title, wide: true, body: [extraTop || null, h('p', { class: 'note', style: 'padding-bottom:8px', text: ayuda || `Columnas: ${columnas.map(c => c.label).join(', ')}. Con o sin fila de encabezado.` }), ta, preview, err], actions: [btn('Cancelar', { onClick: () => s.close() }), enviar] });
  setTimeout(() => ta.focus(), 350);
  return s;
}

export function hojaWhatsApp({ titulo, texto: txt, url, extra }) {
  const s = sheet({ title: titulo || 'Orden lista', body: [extra || null, h('div', { class: 'wa-text', text: txt })],
    actions: [btn('Copiar texto', { icon: 'copy', onClick: () => navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Texto copiado', 'ok'), () => toast('No se pudo copiar', 'error')) }),
      h('a', { class: 'btn btn-ok', href: url, target: '_blank', rel: 'noopener', onClick: () => haptic() }, icon('whatsapp', 20), h('span', { text: 'Abrir WhatsApp' }))] });
  return s;
}

export { esc };
