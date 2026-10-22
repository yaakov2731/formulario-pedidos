// Piezas comunes de los flujos del encargado: catálogo con caché, borradores, píldora, envío y pantalla final.
import { h, btn, icon, doneScreen, haptic, toast, banner, fill } from './ui.js';
import { store, plural } from './util.js';
import * as api from './api.js';

/* ---------- catálogo del local (caché + refresco) ---------- */
export function catalogoLocal(local, { force } = {}) {
  const c = api.cached('getCatalogo', { local }, { maxAge: force ? 0 : 90000 });
  const activos = d => (d && d.productos ? d.productos : []).filter(p => !p.estado || p.estado === 'Activo');
  return { productos: c.data ? activos(c.data) : null, fresh: c.fresh.then(activos) };
}

export function invalidarLecturasLocal(local) {
  api.invalidar('getHoy');
  api.invalidar('getCatalogo');
  api.invalidar('getPorRecibir');
  api.invalidar('getElaborados');
  api.invalidar('getStockPanel');
  void local;
}

/* ---------- borradores ---------- */
export function borrador(tipo, local) {
  const k = `borrador:${tipo}:${local}`;
  return {
    leer(def) { return store.get(k, def); },
    guardar(v) { store.set(k, { ...v, t: Date.now() }); },
    borrar() { store.del(k); }
  };
}

/* ---------- píldora flotante ---------- */
export function pill({ label, onClick }) {
  const txt = h('div', { class: 'pill-text' });
  const sub = h('div', { class: 'pill-sub' });
  const b = btn(label, { onClick: () => { haptic(); onClick(); } });
  const el = h('div', { class: 'pill', role: 'region', 'aria-label': 'Resumen' }, h('div', null, txt, sub), b);
  document.body.append(el);
  return {
    el,
    set(text, subtext) { txt.textContent = text; sub.textContent = subtext || ''; sub.hidden = !subtext; },
    show(v = true) { el.classList.toggle('is-visible', v); el.setAttribute('aria-hidden', v ? 'false' : 'true'); document.body.classList.toggle('has-pill', v); },
    remove() { el.remove(); document.body.classList.remove('has-pill'); },
    button: b
  };
}

/* ---------- quién carga (en la hoja de Revisar, antes de enviar) ---------- */
export function quienCarga(ctx) {
  const nombre = h('strong');
  const pintar = () => { nombre.textContent = ctx.S.sesion.encargado || 'Sin nombre'; };
  pintar();
  return h('div', { class: 'quien-carga' }, icon('people', 18),
    h('div', { class: 'grow' }, 'Lo carga ', nombre),
    btn('Cambiar', { kind: 'plain', size: 'sm', onClick: () => ctx.elegirEncargado({ onElegido: pintar }) }));
}

/* ---------- envío con confirmación y pantalla final ---------- */
// opts: { payload, id, confirmAction, titulo, view, done: {title, text, textoPendiente}, acciones(resultado) }
export async function enviarFlujo({ payload, id, confirmAction, titulo, ctx, done, botonEnvio }) {
  if (botonEnvio) botonEnvio.disabled = true;
  try {
    const r = await api.enviar({ payload, id, confirmAction, titulo });
    haptic('success');
    return r;
  } catch (e) {
    if (botonEnvio) botonEnvio.disabled = false;
    haptic('error');
    throw e;
  }
}

export function pantallaFinal(ctx, { estado, title, text, textoPendiente, id, acciones }) {
  const pendiente = estado === 'pendiente';
  const el = doneScreen({
    title: pendiente ? 'Guardado en el equipo' : title,
    text: pendiente ? (textoPendiente || 'Sin conexión. Se envía solo cuando vuelva la señal; podés cerrar la app.') : text,
    id,
    actions: acciones
  });
  if (pendiente) { const m = el.querySelector('.done-mark'); m.style.background = 'var(--amber-soft)'; m.style.color = 'var(--amber)'; }
  fill(ctx.view, el);
  window.scrollTo(0, 0);
  return el;
}

export function errorEnvio(e, { reintentar }) {
  const msg = e && e.server ? e.message : (e && e.message) || 'No se pudo enviar.';
  return banner(msg, 'bad', { icon: 'alert', action: reintentar ? btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: reintentar }) : null });
}

export function resumenCantidad(n, uno, varios) { return `${n} ${plural(n, uno, varios)}`; }

export { toast };
