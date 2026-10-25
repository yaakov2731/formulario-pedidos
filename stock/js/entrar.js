// Pantalla "Entrar": encargado (local + nombre + PIN) o administrador (email + contraseña).
import { mount, h, lsGet, lsSet } from './util.js';
import { entrarEncargado, entrarAdmin, localesLogin, mensajeError } from './api.js';
import { banner } from './ui.js';

export function montarEntrar(root, alEntrar) {
  let modo = 'encargado';
  let locales = lsGet('locales_login') || [];
  let cargandoLocales = !locales.length;
  let errorLocales = null;
  let sel = lsGet('ult_local');
  let nombre = lsGet('nombre') || '';
  let otro = false;

  const pintar = () => {
    const tabs = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Tipo de acceso' },
      ['encargado', 'admin'].map(m => h('button', {
        class: 'seg-b' + (modo === m ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': modo === m ? 'true' : 'false',
        text: m === 'encargado' ? 'Soy encargado' : 'Administración',
        on: { click: () => { modo = m; pintar(); } }
      })));
    mount(root, h('section', { class: 'login' },
      h('div', { class: 'login-marca' },
        h('img', { class: 'login-logo', src: 'icons/logo-docks.svg', alt: '', width: 231, height: 65 }),
        h('h1', { class: 'login-nombre', text: 'DOCKS DEL PUERTO' }),
        h('p', { class: 'login-lema', text: 'Locales comerciales • Gastronomía • Diversión' }),
        h('p', { class: 'login-lema', text: 'Tigre' })),
      h('p', { class: 'sub', text: 'Pedidos y stock de los locales' }),
      tabs, modo === 'encargado' ? formEncargado() : formAdmin()));
  };

  function formEncargado() {
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const local = locales.find(l => l.codigo === sel);
    const lista = h('div', { class: 'local-grid', role: 'radiogroup', 'aria-label': 'Local' },
      locales.map(l => h('button', {
        class: 'local-btn' + (l.codigo === sel ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': l.codigo === sel ? 'true' : 'false', text: l.nombre,
        on: { click: () => { sel = l.codigo; otro = false; lsSet('ult_local', sel); const n = (l.encargados || []); if (nombre && !n.includes(nombre)) otro = true; pintar(); } }
      })));
    const nombres = local ? (local.encargados || []) : [];
    const chips = local ? h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Tu nombre' },
      nombres.map(n => h('button', { class: 'chip' + (!otro && nombre === n ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': !otro && nombre === n ? 'true' : 'false', text: n,
        on: { click: () => { nombre = n; otro = false; pintar(); } } })),
      h('button', { class: 'chip' + (otro ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': otro ? 'true' : 'false', text: 'Otro', on: { click: () => { otro = true; nombre = ''; pintar(); } } })) : null;
    const inpNombre = otro || (local && !nombres.length)
      ? h('input', { class: 'input', id: 'in-nombre', type: 'text', placeholder: 'Escribí tu nombre', autocomplete: 'name', 'aria-label': 'Tu nombre', value: nombre, on: { input: (e) => { nombre = e.target.value; } } }) : null;
    const pin = h('input', { class: 'input input-pin', id: 'in-pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password', placeholder: 'PIN del local', 'aria-label': 'PIN del local' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'Entrar' });
    const form = h('form', { class: 'form', novalidate: true, on: { submit: async (e) => {
      e.preventDefault(); err.replaceChildren();
      if (!local) return err.replaceChildren(banner('Elegí tu local.', 'error'));
      if (!nombre.trim()) return err.replaceChildren(banner('Decinos tu nombre.', 'error'));
      if (!pin.value) return err.replaceChildren(banner('Poné el PIN del local.', 'error'));
      btn.disabled = true; btn.textContent = 'Entrando…';
      try { await entrarEncargado(local.codigo, pin.value); lsSet('nombre', nombre.trim()); await alEntrar(); }
      catch (x) { err.replaceChildren(banner(mensajeError(x), 'error')); btn.disabled = false; btn.textContent = 'Entrar'; pin.select(); }
    } } },
      h('div', { class: 'grupo' }, h('span', { class: 'grupo-t', text: '¿Qué local?' }),
        cargandoLocales ? h('div', { class: 'skel skel-l1', 'aria-hidden': 'true' }) : (errorLocales && !locales.length ? banner(errorLocales, 'error') : lista)),
      local ? h('div', { class: 'grupo' }, h('span', { class: 'grupo-t', text: '¿Quién sos?' }), chips, inpNombre) : null,
      h('div', { class: 'grupo' }, h('span', { class: 'grupo-t', text: 'PIN' }), pin),
      err, btn);
    return form;
  }

  function formAdmin() {
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const email = h('input', { class: 'input', id: 'in-email', type: 'email', autocomplete: 'username', placeholder: 'Email', 'aria-label': 'Email', value: lsGet('admin_email') || '' });
    const pass = h('input', { class: 'input', id: 'in-pass', type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: 'Entrar' });
    return h('form', { class: 'form', novalidate: true, on: { submit: async (e) => {
      e.preventDefault(); err.replaceChildren();
      if (!email.value.trim() || !pass.value) return err.replaceChildren(banner('Completá email y contraseña.', 'error'));
      btn.disabled = true; btn.textContent = 'Entrando…';
      try { await entrarAdmin(email.value, pass.value); lsSet('admin_email', email.value.trim()); await alEntrar(); }
      catch (x) { err.replaceChildren(banner(mensajeError(x), 'error')); btn.disabled = false; btn.textContent = 'Entrar'; }
    } } },
      h('div', { class: 'grupo' }, h('span', { class: 'grupo-t', text: 'Email' }), email),
      h('div', { class: 'grupo' }, h('span', { class: 'grupo-t', text: 'Contraseña' }), pass), err, btn);
  }

  pintar();
  localesLogin().then(r => { locales = r; cargandoLocales = false; errorLocales = null; if (!document.activeElement || document.activeElement === document.body) pintar(); else if (modo === 'encargado' && !locales.some(l => l.codigo === sel)) pintar(); })
    .catch(e => { cargandoLocales = false; errorLocales = mensajeError(e); if (!locales.length) pintar(); });
}
