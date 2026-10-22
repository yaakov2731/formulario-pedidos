// Pantalla Entrar: elegir rol (encargado de un local, o gerencia con clave).
import { h, icon, btn, input, field, toast, haptic, chip, banner, skeleton, fill } from '../ui.js';
import { texto, ordenarTexto, store } from '../util.js';
import * as api from '../api.js';

export default async function entrar(ctx) {
  const modo = ctx.params[0] === 'gerencia' ? 'gerencia' : 'encargado';
  const root = h('div', { class: 'entrar' });
  const brand = h('div', { class: 'entrar-brand' },
    h('img', { src: 'icons/icon.svg', alt: '' }),
    h('div', null, h('h1', { text: 'Docks' }), h('p', { text: modo === 'gerencia' ? 'Gerencia y compras' : 'Pedidos y stock de tu local' })));
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

  const estado = { local: store.get('ultimo_local', ''), nombre: '' };

  function pintar() {
    const locales = (boot.locales || []).filter(l => l.activo !== false && l.activo !== 'NO').sort((a, b) => ordenarTexto(a.local, b.local));
    if (!locales.length) {
      fill(cont, banner('La planilla no tiene locales activos. Gerencia los carga en Locales.', 'warn', { icon: 'alert' }));
      return;
    }
    const grid = h('div', { class: 'locales', role: 'radiogroup', 'aria-label': 'Local' });
    const paso2 = h('div', { class: 'stack mt24', hidden: !estado.local });
    const nombreInp = input({ placeholder: 'Tu nombre', autocapitalize: 'words', autocomplete: 'given-name', enterkeyhint: 'go', 'aria-label': 'Tu nombre' });
    const err = h('p', { class: 'field-error', role: 'alert' });
    const sugeridos = h('div', { class: 'names' });
    const entrarBtn = btn('Entrar', { kind: 'primary', full: true, onClick: () => confirmar() });

    function pintarNombres() {
      fill(sugeridos);
      const loc = locales.find(l => l.local === estado.local);
      const previos = store.get('nombres:' + estado.local, []);
      const lista = [...new Set([...(loc && loc.encargados ? loc.encargados : []), ...previos])].filter(Boolean).sort(ordenarTexto);
      for (const n of lista) sugeridos.append(chip(n, { on: estado.nombre === n, onClick: () => { estado.nombre = n; nombreInp.value = n; pintarNombres(); } }));
    }
    for (const l of locales) {
      const b = h('button', { class: `local-btn${estado.local === l.local ? ' is-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': estado.local === l.local ? 'true' : 'false' },
        h('span', { text: l.local }), l.prefijo ? h('span', { class: 'pref', text: l.prefijo }) : null);
      b.addEventListener('click', () => {
        haptic();
        estado.local = l.local;
        for (const x of grid.children) { x.classList.toggle('is-on', x === b); x.setAttribute('aria-checked', x === b ? 'true' : 'false'); }
        paso2.hidden = false;
        pintarNombres();
        if (!nombreInp.value) setTimeout(() => nombreInp.focus(), 50);
        paso2.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      grid.append(b);
    }
    nombreInp.addEventListener('input', () => { estado.nombre = nombreInp.value; err.textContent = ''; pintarNombres(); });
    nombreInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); } });

    function confirmar() {
      const nombre = texto(nombreInp.value, 60);
      if (!estado.local) { err.textContent = 'Elegí tu local.'; return; }
      if (!nombre) { err.textContent = 'Escribí tu nombre: queda en cada pedido y conteo.'; nombreInp.classList.add('is-invalid'); nombreInp.focus(); return; }
      const previos = store.get('nombres:' + estado.local, []);
      store.set('nombres:' + estado.local, [...new Set([nombre, ...previos])].slice(0, 12));
      store.set('ultimo_local', estado.local);
      ctx.guardarSesion({ rol: 'encargado', local: estado.local, encargado: nombre });
      haptic('success');
      ctx.go('hoy', true);
    }

    paso2.append(
      h('p', { class: 'head', text: '¿Quién sos?' }),
      sugeridos,
      field('Nombre', nombreInp, { error: '' }),
      err,
      entrarBtn
    );
    fill(cont, 
      h('p', { class: 'head', style: 'margin-bottom:10px', text: 'Elegí tu local' }),
      grid,
      paso2,
      h('p', { class: 'note mt24' }, '¿Sos de gerencia? ', h('a', { href: '#entrar/gerencia', text: 'Entrar con clave' }))
    );
    if (estado.local) pintarNombres();
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
