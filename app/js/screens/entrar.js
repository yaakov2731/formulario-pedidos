// Pantalla Entrar: elegir rol (encargado de un local, o gerencia con clave).
import { h, icon, btn, input, field, toast, haptic, chip, banner, skeleton, fill } from '../ui.js';
import { texto, ordenarTexto, store } from '../util.js';
import * as api from '../api.js';

export default async function entrar(ctx) {
  const modo = ctx.params[0] === 'gerencia' ? 'gerencia' : 'encargado';
  const root = h('div', { class: 'entrar' });
  const brand = h('div', { class: 'entrar-brand' },
    h('img', { class: 'entrar-logo', src: 'icons/logo-docks.svg', alt: '' }),
    h('div', null,
      h('h1', { class: 'entrar-marca', text: 'Docks del Puerto' }),
      h('p', { class: 'entrar-rubros', text: 'Locales comerciales • Gastronomía • Diversión' }),
      h('p', { class: 'entrar-rubros', text: 'Tigre' }),
      h('p', { class: 'entrar-modo', text: modo === 'gerencia' ? 'Gerencia y compras' : 'Pedidos y stock de tu local' })));
  root.append(brand);

  if (!api.configured()) {
    root.append(banner('Falta la dirección del backend. Abrí la app con ?api=URL del Apps Script.', 'bad', { icon: 'alert' }));
    return root;
  }

  if (modo === 'gerencia') return gerencia(ctx, root);
  return encargado(ctx, root);
}

async function encargado(ctx, root) {
  const cont = h('div', null, skeleton(3));
  root.append(cont);
  let boot;
  try {
    const b = ctx.bootstrap();
    boot = b.data || await b.fresh;
    if (!b.data) { /* ya es fresco */ } else { b.fresh.then(d => { if (JSON.stringify(d.locales) !== JSON.stringify(boot.locales)) { boot = d; pintar(); } }).catch(() => {}); }
  } catch (e) {
    fill(cont, banner(e.message, 'bad', { icon: 'alert', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => ctx.go('entrar', true) }) }));
    return root;
  }

  const estado = { local: store.get('ultimo_local', ''), nombre: '', otro: false };

  function pintar() {
    const locales = (boot.locales || []).filter(l => l.activo !== false && l.activo !== 'NO').sort((a, b) => ordenarTexto(a.local, b.local));
    if (!locales.length) {
      fill(cont, banner('La planilla no tiene locales activos. Gerencia los carga en Locales.', 'warn', { icon: 'alert' }));
      return;
    }
    const grid = h('div', { class: 'locales', role: 'radiogroup', 'aria-label': 'Local' });
    const paso2 = h('div', { class: 'stack mt24', hidden: !estado.local });
    const nombreInp = input({ placeholder: 'Nombre y apellido', autocapitalize: 'words', autocomplete: 'name', enterkeyhint: 'go', maxlength: 60, 'aria-label': 'Tu nombre' });
    const campoNombre = h('div', { hidden: true }, field('Tu nombre', nombreInp, { error: '' }));
    const err = h('p', { class: 'field-error', role: 'alert' });
    const sugeridos = h('div', { class: 'names' });
    const entrarBtn = btn('Entrar', { kind: 'primary', full: true, onClick: () => confirmar() });

    // Encargados del local (los carga gerencia en Locales; los nombres nuevos se suman solos) + "Otro" para escribir.
    function pintarNombres() {
      fill(sugeridos);
      const loc = locales.find(l => l.local === estado.local);
      const previos = store.get('nombres:' + estado.local, []);
      const lista = [...new Set([...(loc && loc.encargados ? loc.encargados : []), ...previos])].filter(Boolean).sort(ordenarTexto);
      if (estado.nombre && !estado.otro && !lista.includes(estado.nombre)) estado.nombre = '';
      for (const n of lista) sugeridos.append(chip(n, { on: !estado.otro && estado.nombre === n, onClick: () => { haptic(); estado.nombre = n; estado.otro = false; nombreInp.value = n; err.textContent = ''; pintarNombres(); } }));
      const soloEscribir = !lista.length;
      if (!soloEscribir) sugeridos.append(chip('Otro', { icon: 'edit', on: estado.otro, onClick: () => { haptic(); estado.otro = true; estado.nombre = ''; nombreInp.value = ''; pintarNombres(); setTimeout(() => nombreInp.focus(), 50); } }));
      sugeridos.hidden = soloEscribir;
      campoNombre.hidden = !(soloEscribir || estado.otro);
      quien.textContent = soloEscribir ? '¿Quién sos? Escribí tu nombre' : '¿Quién sos?';
    }
    for (const l of locales) {
      const b = h('button', { class: `local-btn${estado.local === l.local ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': estado.local === l.local ? 'true' : 'false' },
        h('span', { text: l.local }), l.prefijo ? h('span', { class: 'pref', text: l.prefijo }) : null);
      b.addEventListener('click', () => {
        haptic();
        estado.local = l.local;
        for (const x of grid.children) { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); }
        paso2.hidden = false;
        estado.nombre = store.get('nombres:' + l.local, [])[0] || ''; estado.otro = false; nombreInp.value = estado.nombre;  // el último que cargó en este equipo
        pintarNombres();
        if (!campoNombre.hidden) setTimeout(() => nombreInp.focus(), 50);
        paso2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      grid.append(b);
    }
    nombreInp.addEventListener('input', () => { estado.nombre = nombreInp.value; err.textContent = ''; nombreInp.classList.remove('is-invalid'); });
    nombreInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });

    function confirmar() {
      const nombre = texto(nombreInp.value, 60);
      if (!estado.local) { err.textContent = 'Elegí tu local.'; return; }
      if (!nombre) {
        if (campoNombre.hidden) { err.textContent = 'Tocá tu nombre, o “Otro” si no estás en la lista.'; return; }
        err.textContent = 'Escribí tu nombre: queda en cada pedido y conteo.'; nombreInp.classList.add('is-invalid'); nombreInp.focus(); return;
      }
      const previos = store.get('nombres:' + estado.local, []);
      store.set('nombres:' + estado.local, [...new Set([nombre, ...previos])].slice(0, 12));
      store.set('ultimo_local', estado.local);
      ctx.guardarSesion({ rol: 'encargado', local: estado.local, encargado: nombre });
      haptic('success');
      ctx.go('hoy', true);
    }

    const quien = h('p', { class: 'head', text: '¿Quién sos?' });
    paso2.append(
      quien,
      sugeridos,
      campoNombre,
      err,
      entrarBtn
    );
    fill(cont, 
      h('p', { class: 'head', style: 'margin-bottom:10px', text: 'Elegí tu local' }),
      grid,
      paso2,
      h('p', { class: 'note mt24' }, '¿Sos de gerencia? ', h('a', { href: '#entrar/gerencia', text: 'Entrar con clave' }))
    );
    if (estado.local) { estado.nombre = store.get('nombres:' + estado.local, [])[0] || ''; nombreInp.value = estado.nombre; pintarNombres(); }
  }
  pintar();
  return root;
}

async function gerencia(ctx, root) {
  const key = input({ type: 'password', placeholder: 'Clave de gerencia', autocomplete: 'current-password', enterkeyhint: 'go', 'aria-label': 'Clave de gerencia' });
  const err = h('p', { class: 'field-error', role: 'alert' });
  let recordar = true;
  const rec = h('button', { class: 'cell', type: 'button', style: 'background:var(--surface);border-radius:12px' },
    h('div', { class: 'cell-body' }, h('div', { class: 'cell-title', text: 'Recordar en este equipo' }), h('div', { class: 'cell-sub', text: 'Guardá la clave sólo en tu computadora o tablet.' })),
    h('span', { class: 'switch', role: 'switch', 'aria-checked': 'true' }));
  rec.addEventListener('click', () => { recordar = !recordar; rec.querySelector('.switch').setAttribute('aria-checked', recordar ? 'true' : 'false'); haptic(); });
  const entrarBtn = btn('Entrar', { kind: 'primary', full: true, onClick: enviar });
  async function enviar() {
    const k = key.value.trim();
    if (!k) { err.textContent = 'Escribí la clave.'; key.focus(); return; }
    entrarBtn.disabled = true; err.textContent = '';
    try {
      await api.post({ action: 'checkAdmin', admin_key: k });
      ctx.guardarAdminKey(k, recordar);
      ctx.guardarSesion({ rol: 'gerencia' });
      haptic('success');
      ctx.go('compras', true);
    } catch (e) {
      err.textContent = e.server ? e.message : (e.message || 'No se pudo verificar la clave.');
      key.classList.add('is-invalid');
      entrarBtn.disabled = false;
    }
  }
  key.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
  key.addEventListener('input', () => { key.classList.remove('is-invalid'); err.textContent = ''; });
  root.append(
    h('div', { class: 'stack' },
      field('Clave', key),
      err,
      rec,
      entrarBtn,
      h('p', { class: 'note mt16' }, '¿Sos encargado de un local? ', h('a', { href: '#entrar', text: 'Entrar sin clave' }))
    )
  );
  setTimeout(() => key.focus(), 100);
  return root;
}
