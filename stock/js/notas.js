// Notas del equipo: tablero tipo post-it (fondo oscuro con vidrio) donde el local deja notas para gerencia
// o para sus compañeros, y gerencia para un local o para todos. Fijar, resolver y responder.
import { h, mount, tokens, coincide, lsGet, lsSet, limpiarEtiquetas, CARPETAS, enCarpeta } from './util.js';
import { swr, cargarNotas, crearNota, actualizarNota, borrarNota, responderNota, cargarLocales, mensajeError } from './api.js';
import { icon, toast, hoja, campo, vacio, esqueleto } from './ui.js';

export const COLORES = ['amarillo', 'naranja', 'azul', 'verde', 'rosa'];
export const ETIQUETAS = ['urgente', 'faltante', 'rotura', 'turno', 'limpieza', 'proveedor', 'idea'];
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const diaMes = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', ''); };
const diaHora = (iso) => { const d = new Date(iso); return `${diaMes(iso)} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`; };
const iniciales = (n) => String(n || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

export const esNueva = (n, rol) => rol === 'gerencia' && n.autor_rol === 'encargado' && !n.leida_en && !n.resuelta_en;

export async function render(root, ctx) {
  const ger = ctx.rol === 'gerencia';
  const $app = document.getElementById('app');
  $app.classList.add('tema-notas');
  const firma = () => (ger ? (ctx.perfil.nombre || 'Gerencia') : (lsGet('nombre') || ctx.nombreGuardado || ''));
  let notas = null, locales = [], error = null;
  const st = { carpeta: 'todas', local: ger ? (lsGet('notas_local') || '') : '', tag: '', q: '' };
  const nombreLocal = (id) => (!id ? 'Todos los locales' : (!ger && id === ctx.perfil.local_id ? (ctx.perfil.nombre || 'Local') : ((locales.find(l => l.id === id) || {}).nombre || 'Local')));

  const $lista = h('div', { class: 'nb-cuerpo' }, esqueleto(4));
  const $side = h('nav', { class: 'nb-side', 'aria-label': 'Carpetas' });
  const buscar = h('input', { class: 'nb-search-in', type: 'search', placeholder: 'Buscar notas', 'aria-label': 'Buscar notas',
    on: { input: () => { st.q = buscar.value; pintar(); } } });
  const ahora = new Date();
  const sub = h('p', { class: 'nb-sub' });
  mount(root,
    h('div', { class: 'nb' },
      h('header', { class: 'nb-head' },
        h('div', { class: 'nb-head-t' }, h('h1', { class: 'nb-titulo', text: 'Notas del equipo' }), sub),
        h('div', { class: 'nb-yo', title: firma() || 'Sin firmar' }, h('span', { class: 'nb-av', text: iniciales(firma() || (ger ? 'G' : 'L')) }),
          h('span', { class: 'nb-yo-t' }, h('b', { text: firma() || 'Sin firmar' }), h('small', { text: ger ? 'Gerencia' : (ctx.perfil.nombre || 'Local') })))),
      h('div', { class: 'nb-tools' },
        h('label', { class: 'nb-search' }, icon('buscar', 18), buscar),
        h('button', { class: 'nb-nueva', type: 'button', on: { click: () => editor() } }, icon('mas', 20), h('span', { text: 'Nueva nota' }))),
      h('div', { class: 'nb-layout' }, $side, $lista)));

  function base() { return (notas || []).filter(n => !st.local || n.local_id === st.local || (n.local_id === null && st.local === '__todos')); }
  function filtradas() {
    const tk = tokens(st.q);
    return base().filter(n => enCarpeta(n, st.carpeta) && (!st.tag || n.etiquetas.includes(st.tag))
      && (!tk.length || coincide([n.titulo, n.texto, n.autor_nombre, n.etiquetas.join(' '), nombreLocal(n.local_id)].join(' '), tk)));
  }

  function pintarSide() {
    const b = base();
    const cuenta = (c) => b.filter(n => enCarpeta(n, c)).length;
    const nuevas = b.filter(n => esNueva(n, ctx.rol)).length;
    const carpeta = ([id, txt, ic]) => h('button', { class: 'nb-folder' + (st.carpeta === id ? ' is-on' : ''), type: 'button', 'aria-pressed': st.carpeta === id ? 'true' : 'false',
      on: { click: () => { st.carpeta = id; st.tag = ''; pintar(); } } },
      icon(ic, 18), h('span', { class: 'nb-folder-t', text: txt }), h('span', { class: 'nb-folder-n', text: String(cuenta(id)) }),
      id === 'gerencia' && nuevas ? h('span', { class: 'nb-dot', title: `${nuevas} sin leer` }) : null);
    const items = [h('p', { class: 'nb-side-t', text: 'Carpetas' }), ...CARPETAS.map(carpeta)];
    if (ger) {
      const loc = (id, txt, n) => h('button', { class: 'nb-folder nb-loc' + (st.local === id ? ' is-on' : ''), type: 'button', 'aria-pressed': st.local === id ? 'true' : 'false',
        on: { click: () => { st.local = id; lsSet('notas_local', id); pintar(); } } },
        h('span', { class: 'nb-loc-ic', text: id === '' ? '★' : (id === '__todos' ? '◎' : iniciales(txt)) }), h('span', { class: 'nb-folder-t', text: txt }),
        h('span', { class: 'nb-folder-n', text: String(n) }));
      const abiertas = (notas || []).filter(n => !n.resuelta_en);
      items.push(h('p', { class: 'nb-side-t', text: 'Locales' }),
        loc('', 'Todos', abiertas.length),
        ...locales.filter(l => l.activo !== false).map(l => loc(l.id, l.nombre, abiertas.filter(n => n.local_id === l.id).length)),
        loc('__todos', 'Para todos', abiertas.filter(n => n.local_id === null).length));
    }
    mount($side, items);
  }

  function postit(n) {
    return h('button', { class: `nb-postit c-${n.color}` + (n.resuelta_en ? ' is-done' : ''), type: 'button', on: { click: () => detalle(n) } },
      esNueva(n, ctx.rol) ? h('span', { class: 'nb-nueva-b', text: 'Nueva' }) : null,
      h('span', { class: 'nb-postit-t', text: n.titulo }),
      n.texto ? h('span', { class: 'nb-postit-x', text: n.texto }) : null,
      n.etiquetas.length ? h('span', { class: 'nb-tags' }, n.etiquetas.map(t => h('span', { class: 'nb-tag', text: '#' + t }))) : null,
      h('span', { class: 'nb-postit-f' }, h('span', { text: diaMes(n.creado_en) }), h('span', { class: 'nb-postit-a', text: firmaCorta(n) })));
  }
  function firmaCorta(n) {
    const quien = n.autor_nombre || (n.autor_rol === 'gerencia' ? 'Gerencia' : 'Local');
    return ger && n.autor_rol === 'encargado' ? `${quien} · ${nombreLocal(n.local_id)}` : quien;
  }
  function tarjeta(n) {
    const urg = n.etiquetas.includes('urgente');
    return h('button', { class: `nb-card t-${n.color}` + (urg ? ' is-urg' : '') + (n.resuelta_en ? ' is-done' : ''), type: 'button', on: { click: () => detalle(n) } },
      esNueva(n, ctx.rol) ? h('span', { class: 'nb-nueva-b', text: 'Nueva' }) : null,
      h('span', { class: 'nb-card-t', text: n.titulo }),
      n.texto ? h('span', { class: 'nb-card-x', text: n.texto }) : null,
      h('span', { class: 'nb-card-f' },
        h('span', { text: diaMes(n.creado_en) }),
        h('span', { class: 'nb-card-a', text: firmaCorta(n) }),
        n.nota_respuestas && n.nota_respuestas.length ? h('span', { class: 'nb-card-r', title: 'Respuestas' }, icon('nota', 13), h('span', { text: String(n.nota_respuestas.length) })) : null,
        n.resuelta_en ? h('span', { class: 'nb-card-ok', title: 'Resuelta' }, icon('check', 14)) : null,
        urg && !n.resuelta_en ? h('span', { class: 'nb-urg', 'aria-label': 'Urgente' }) : null));
  }

  function pintar() {
    sub.textContent = `${ger ? (st.local ? (st.local === '__todos' ? 'Notas para todos los locales' : nombreLocal(st.local)) : 'Todos los locales') : (ctx.perfil.nombre || 'Local')} · ${MES[ahora.getMonth()]} ${ahora.getFullYear()}`;
    if (notas === null) return;
    pintarSide();
    const lista = filtradas();
    const fijadas = st.carpeta === 'resueltas' ? [] : lista.filter(n => n.fijada);
    const resto = lista.filter(n => !fijadas.includes(n));
    // Etiquetas como carpetas (las más usadas en lo que se ve, sin contar el filtro de etiqueta).
    const sinTag = base().filter(n => enCarpeta(n, st.carpeta));
    const conteo = {};
    sinTag.forEach(n => n.etiquetas.forEach(t => { conteo[t] = (conteo[t] || 0) + 1; }));
    const tags = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const secciones = [];
    if (error) secciones.push(h('div', { class: 'nb-error', role: 'alert' }, icon('alerta', 18), h('span', { text: error })));
    if (fijadas.length) secciones.push(h('section', { class: 'nb-sec' },
      h('div', { class: 'nb-sec-h' }, h('h2', { class: 'nb-sec-t', text: 'Fijadas' }), icon('pin', 18)),
      h('div', { class: 'nb-postits' }, fijadas.map(postit))));
    if (tags.length) secciones.push(h('section', { class: 'nb-sec' },
      h('div', { class: 'nb-sec-h' }, h('h2', { class: 'nb-sec-t', text: 'Etiquetas' }), st.tag ? h('button', { class: 'nb-limpiar', type: 'button', text: 'Ver todas', on: { click: () => { st.tag = ''; pintar(); } } }) : null),
      h('div', { class: 'nb-carpetas' }, tags.map(([t, c]) => h('button', { class: 'nb-carpeta' + (st.tag === t ? ' is-on' : '') + (t === 'urgente' ? ' is-urg' : ''), type: 'button', 'aria-pressed': st.tag === t ? 'true' : 'false',
        on: { click: () => { st.tag = st.tag === t ? '' : t; pintar(); } } },
        h('span', { class: 'nb-carpeta-tab', 'aria-hidden': 'true' }), h('span', { class: 'nb-carpeta-t', text: '#' + t }), h('span', { class: 'nb-carpeta-n', text: `${c} nota${c === 1 ? '' : 's'}` }))))));
    secciones.push(h('section', { class: 'nb-sec' },
      h('div', { class: 'nb-sec-h' }, h('h2', { class: 'nb-sec-t', text: st.tag ? '#' + st.tag : (CARPETAS.find(c => c[0] === st.carpeta) || CARPETAS[0])[1] }),
        h('span', { class: 'nb-sec-n num', text: String(resto.length) })),
      resto.length ? h('div', { class: 'nb-cards' }, resto.map(tarjeta))
        : (fijadas.length ? null : h('div', { class: 'nb-vacio' }, vacio(st.q || st.tag ? 'Nada con ese filtro' : 'Todavía no hay notas',
          st.q || st.tag ? 'Probá con otra palabra o etiqueta.' : (ger ? 'Las notas de los locales van a aparecer acá.' : 'Tocá "Nueva nota" para dejarle algo a gerencia o a tus compañeros.'))))));
    mount($lista, secciones);
  }

  async function cargar() {
    try {
      if (ger) locales = await swr('locales', cargarLocales, (d) => { locales = d; });
      await swr('notas', cargarNotas, (d, cache, e) => { if (!ctx.alive()) return; notas = d; error = e ? mensajeError(e) : null; pintar(); });
    } catch (e) {
      if (!ctx.alive()) return;
      notas = notas || []; error = /notas|relation|does not exist|schema cache/i.test(String(e && e.message)) ? 'El tablero todavía no está activado en el servidor (falta el SQL de notas).' : mensajeError(e);
      pintar();
    }
  }

  // ---- nueva nota ----
  function editor() {
    const titulo = h('input', { class: 'input nb-in', maxlength: '120', placeholder: 'Ej.: Falta gas en la cocina', 'aria-label': 'Título' });
    const texto = h('textarea', { class: 'input nb-in', rows: '4', maxlength: '2000', placeholder: 'Contá qué pasa (opcional)', 'aria-label': 'Texto' });
    const nombre = h('input', { class: 'input nb-in', maxlength: '40', placeholder: 'Tu nombre', value: firma(), 'aria-label': 'Firma' });
    let para = 'gerencia', destino = ger ? (st.local && st.local !== '__todos' ? st.local : '') : null, color = 'amarillo', fijar = false;
    const elegidas = new Set();
    const seg = (opts, get, set) => {
      const el = h('div', { class: 'nb-seg', role: 'group' });
      const pint = () => mount(el, opts.map(([v, t]) => h('button', { class: 'nb-seg-b' + (get() === v ? ' is-on' : ''), type: 'button', 'aria-pressed': get() === v ? 'true' : 'false', text: t, on: { click: () => { set(v); pint(); } } })));
      pint(); return el;
    };
    const paraEl = ger
      ? h('select', { class: 'input nb-in', 'aria-label': 'Para', on: { change: (e) => { destino = e.target.value; } } },
        h('option', { value: '', text: 'Todos los locales' }), ...locales.map(l => h('option', { value: l.id, text: l.nombre, selected: l.id === destino })))
      : seg([['gerencia', 'Gerencia'], ['equipo', 'Mis compañeros']], () => para, (v) => { para = v; });
    const colores = h('div', { class: 'nb-colores', role: 'radiogroup', 'aria-label': 'Color' });
    const pintColores = () => mount(colores, COLORES.map(c => h('button', { class: `nb-color c-${c}` + (color === c ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': color === c ? 'true' : 'false', 'aria-label': c,
      on: { click: () => { color = c; pintColores(); } } }, color === c ? icon('check', 16) : null)));
    pintColores();
    const tagsEl = h('div', { class: 'nb-tagsel' });
    const otra = h('input', { class: 'input nb-in nb-otra', maxlength: '20', placeholder: 'Otra etiqueta', 'aria-label': 'Otra etiqueta',
      on: { keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); sumarOtra(); } } } });
    const sumarOtra = () => { limpiarEtiquetas([otra.value]).forEach(t => elegidas.add(t)); otra.value = ''; pintTags(); };
    const pintTags = () => mount(tagsEl, [...new Set([...ETIQUETAS, ...elegidas])].map(t => h('button', { class: 'nb-tagb' + (elegidas.has(t) ? ' is-on' : '') + (t === 'urgente' ? ' is-urg' : ''), type: 'button', 'aria-pressed': elegidas.has(t) ? 'true' : 'false', text: '#' + t,
      on: { click: () => { if (elegidas.has(t)) elegidas.delete(t); else elegidas.add(t); pintTags(); } } })));
    pintTags();
    const fijarEl = h('label', { class: 'nb-check' }, h('input', { type: 'checkbox', on: { change: (e) => { fijar = e.target.checked; } } }), h('span', { text: 'Fijar arriba del tablero' }));
    const err = h('p', { class: 'nb-err', role: 'alert' });
    const guardar = h('button', { class: 'nb-btn nb-btn-pri', type: 'button' }, icon('enviar', 18), h('span', { text: 'Publicar nota' }));
    const { cerrar, dlg } = hoja('Nueva nota', h('div', { class: 'nb-form' },
      campo('Título', titulo), campo('Nota', texto),
      campo(ger ? 'Para' : '¿Para quién?', paraEl, ger ? 'Elegí un local o mandala a todos.' : null),
      campo('Color', colores), campo('Etiquetas', h('div', {}, tagsEl, h('div', { class: 'nb-otra-row' }, otra, h('button', { class: 'nb-btn', type: 'button', text: 'Sumar', on: { click: sumarOtra } })))),
      ger ? null : campo('Firma', nombre, 'Quién deja la nota (cocinero, encargado…).'),
      fijarEl, err, guardar));
    dlg.classList.add('tema-notas', 'nb-sheet');
    setTimeout(() => titulo.focus(), 50);
    guardar.addEventListener('click', async () => {
      const t = titulo.value.trim();
      if (!t) { err.textContent = 'Poné un título.'; titulo.focus(); return; }
      if (!ger && !nombre.value.trim()) { err.textContent = 'Firmá la nota con tu nombre.'; nombre.focus(); return; }
      if (otra.value.trim()) sumarOtra();
      guardar.disabled = true; err.textContent = '';
      const n = {
        local_id: ger ? (destino || null) : ctx.perfil.local_id, para: ger ? 'equipo' : para,
        titulo: t, texto: texto.value.trim(), color, etiquetas: limpiarEtiquetas([...elegidas]), fijada: fijar,
        autor_nombre: ger ? firma() : nombre.value.trim(), autor_rol: ger ? 'gerencia' : 'encargado'
      };
      try {
        const nueva = await crearNota(n);
        if (!ger) lsSet('nombre', n.autor_nombre);
        notas = [{ nota_respuestas: [], ...n, ...(nueva || {}), creado_en: (nueva && nueva.creado_en) || new Date().toISOString() }, ...(notas || [])];
        cerrar(); toast(ger ? 'Nota publicada.' : (n.para === 'gerencia' ? 'Nota enviada a gerencia.' : 'Nota publicada para el equipo.'), 'ok');
        st.carpeta = 'todas'; st.tag = ''; pintar();
      } catch (e) { err.textContent = mensajeError(e); guardar.disabled = false; }
    });
  }

  // ---- detalle ----
  function detalle(n) {
    if (esNueva(n, ctx.rol)) { n.leida_en = new Date().toISOString(); actualizarNota(n.id, { leida_en: n.leida_en }).catch(() => {}); pintar(); }
    const puedeEditar = ger || n.local_id === ctx.perfil.local_id;
    const puedeBorrar = ger || (n.local_id === ctx.perfil.local_id && n.autor_rol === 'encargado');
    const resp = h('ul', { class: 'nb-resp' });
    const pintResp = () => mount(resp, (n.nota_respuestas || []).slice().sort((a, b) => String(a.creado_en).localeCompare(b.creado_en)).map(r =>
      h('li', { class: 'nb-resp-i' + (r.autor_rol === 'gerencia' ? ' is-ger' : '') }, h('span', { class: 'nb-av nb-av-s', text: iniciales(r.autor_nombre) }),
        h('div', { class: 'nb-resp-b' }, h('p', { class: 'nb-resp-m' }, h('b', { text: r.autor_nombre || (r.autor_rol === 'gerencia' ? 'Gerencia' : 'Local') }), h('span', { text: diaHora(r.creado_en) })), h('p', { class: 'nb-resp-x', text: r.texto })))));
    pintResp();
    const inp = h('textarea', { class: 'input nb-in', rows: '2', maxlength: '1000', placeholder: 'Escribí una respuesta', 'aria-label': 'Respuesta' });
    const enviar = h('button', { class: 'nb-btn nb-btn-pri', type: 'button' }, icon('enviar', 18), h('span', { text: 'Responder' }));
    const accion = (txt, ic, fn, clase = '') => h('button', { class: 'nb-btn ' + clase, type: 'button', on: { click: fn } }, icon(ic, 18), h('span', { text: txt }));
    const cambiar = async (cambios, okTxt) => {
      try { await actualizarNota(n.id, cambios); Object.assign(n, cambios); toast(okTxt, 'ok'); cerrar(); pintar(); }
      catch (e) { toast(mensajeError(e), 'error'); }
    };
    const para = n.autor_rol === 'gerencia' ? (n.local_id ? `Para ${nombreLocal(n.local_id)}` : 'Para todos los locales') : (n.para === 'gerencia' ? 'Para gerencia' : 'Para el equipo');
    const { cerrar, dlg } = hoja(n.autor_rol === 'gerencia' ? 'Nota de gerencia' : 'Nota', h('div', { class: 'nb-det' },
      h('div', { class: `nb-det-nota c-${n.color}` },
        h('p', { class: 'nb-det-t', text: n.titulo }),
        n.texto ? h('p', { class: 'nb-det-x', text: n.texto }) : null,
        n.etiquetas.length ? h('span', { class: 'nb-tags' }, n.etiquetas.map(t => h('span', { class: 'nb-tag', text: '#' + t }))) : null),
      h('p', { class: 'nb-det-m' }, h('span', { class: 'nb-av nb-av-s', text: iniciales(n.autor_nombre) }),
        h('span', {}, h('b', { text: n.autor_nombre || (n.autor_rol === 'gerencia' ? 'Gerencia' : 'Local') }),
          h('small', { text: [n.autor_rol === 'encargado' ? nombreLocal(n.local_id) : 'Gerencia', diaHora(n.creado_en), para].join(' · ') }))),
      n.resuelta_en ? h('p', { class: 'nb-det-ok' }, icon('check', 16), h('span', { text: `Resuelta${n.resuelta_por ? ' por ' + n.resuelta_por : ''} · ${diaHora(n.resuelta_en)}` })) : null,
      puedeEditar ? h('div', { class: 'nb-acciones' },
        accion(n.fijada ? 'Desfijar' : 'Fijar', 'pin', () => cambiar({ fijada: !n.fijada }, n.fijada ? 'Nota desfijada.' : 'Nota fijada arriba.')),
        n.resuelta_en ? accion('Reabrir', 'bandeja', () => cambiar({ resuelta_en: null, resuelta_por: null }, 'Nota reabierta.'))
          : accion('Resuelta', 'check', () => cambiar({ resuelta_en: new Date().toISOString(), resuelta_por: firma() || null, fijada: false }, 'Marcada como resuelta.'), 'nb-btn-ok'),
        puedeBorrar ? accion('Borrar', 'basura', async () => {
          if (!confirm('¿Borrar esta nota? No se puede deshacer.')) return;
          try { await borrarNota(n.id); notas = notas.filter(x => x.id !== n.id); toast('Nota borrada.', 'ok'); cerrar(); pintar(); } catch (e) { toast(mensajeError(e), 'error'); }
        }, 'nb-btn-bad') : null) : null,
      h('p', { class: 'nb-side-t nb-resp-h', text: `Respuestas · ${(n.nota_respuestas || []).length}` }), resp,
      h('div', { class: 'nb-responder' }, inp, enviar)));
    dlg.classList.add('tema-notas', 'nb-sheet');
    enviar.addEventListener('click', async () => {
      const t = inp.value.trim();
      if (!t) { inp.focus(); return; }
      const autor = firma();
      if (!autor && !ger) { toast('Firmá primero: escribí tu nombre en una nota nueva.', 'info'); }
      enviar.disabled = true;
      try {
        const r = await responderNota({ nota_id: n.id, texto: t, autor_nombre: autor || 'Local', autor_rol: ger ? 'gerencia' : 'encargado' });
        n.nota_respuestas = [...(n.nota_respuestas || []), r || { texto: t, autor_nombre: autor, autor_rol: ger ? 'gerencia' : 'encargado', creado_en: new Date().toISOString() }];
        inp.value = ''; pintResp(); pintar();
      } catch (e) { toast(mensajeError(e), 'error'); }
      enviar.disabled = false;
    });
  }

  // Al volver a la app (o a la pestaña) trae lo nuevo.
  const alVolver = () => { if (document.visibilityState === 'visible' && ctx.alive()) cargar(); };
  document.addEventListener('visibilitychange', alVolver);
  pintar();
  await cargar();
  return () => { document.removeEventListener('visibilitychange', alVolver); $app.classList.remove('tema-notas'); };
}
