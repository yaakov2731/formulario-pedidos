// Docks app · transporte con el backend V3 (Apps Script), caché local y cola de envíos.
// Contrato: docs/v3/CONTRATO.md §4. Lecturas por fetch (CORS) con JSONP de respaldo; escrituras por POST text/plain.
import { store } from './util.js';

const CFG = () => (globalThis.DOCKS_APP_CONFIG && globalThis.DOCKS_APP_CONFIG.API_URL) || '';

export function apiUrl() {
  const cfg = CFG();
  try {
    const qs = new URLSearchParams(globalThis.location.search);
    if (qs.has('api')) {
      const v = qs.get('api').trim();
      if (v) { store.set('api_url', v); store.set('api_url_cfg', cfg); } else { store.del('api_url'); store.del('api_url_cfg'); }
    }
  } catch (_e) { /* sin location */ }
  const fijada = store.get('api_url', '');
  if (!fijada) return cfg;
  if (store.get('api_url_cfg', '') !== cfg) { store.del('api_url'); store.del('api_url_cfg'); return cfg; }
  return fijada;
}

export function fijarApi(url) {
  const v = String(url || '').trim();
  if (v) { store.set('api_url', v); store.set('api_url_cfg', CFG()); } else { store.del('api_url'); store.del('api_url_cfg'); }
}

export function configured() { return !!apiUrl(); }

function absUrl(u) {
  try { return new URL(u, globalThis.location.href); } catch (_e) { return new URL(u); }
}

export class ApiError extends Error {
  constructor(msg, server) { super(msg); this.server = !!server; }
}

const MSG_RED = 'No se pudo conectar con la planilla. Revisá la conexión y probá de nuevo.';
const MSG_TIMEOUT = 'La planilla tardó demasiado en responder. Probá de nuevo.';

let jsonpSeq = 0;
function jsonp(url, timeout) {
  return new Promise((resolve, reject) => {
    const cb = `__docksApp_${Date.now()}_${jsonpSeq++}`;
    const script = document.createElement('script');
    let done = false;
    const cleanup = (late) => {
      if (script.parentNode) script.parentNode.removeChild(script);
      if (late) { globalThis[cb] = () => {}; setTimeout(() => { delete globalThis[cb]; }, 60000); }
      else delete globalThis[cb];
    };
    const timer = setTimeout(() => { if (done) return; done = true; cleanup(true); reject(new ApiError(MSG_TIMEOUT)); }, timeout);
    globalThis[cb] = (data) => { if (done) return; done = true; clearTimeout(timer); cleanup(false); resolve(data); };
    url.searchParams.set('callback', cb);
    script.async = true;
    script.src = url.toString();
    script.onerror = () => { if (done) return; done = true; clearTimeout(timer); cleanup(false); reject(new ApiError(MSG_RED)); };
    document.head.appendChild(script);
  });
}

function fetchJson(url, init, timeout) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), timeout);
  return fetch(url, { ...init, signal: ctrl ? ctrl.signal : undefined })
    .then(res => res.text())
    .then(txt => { clearTimeout(timer); try { return JSON.parse(txt); } catch (_e) { throw new ApiError('__ilegible__'); } },
      err => { clearTimeout(timer); throw err && err.name === 'AbortError' ? new ApiError(MSG_TIMEOUT) : new ApiError(MSG_RED); });
}

function sinUsarJsonp() { return typeof document === 'undefined'; }

export function get(action, params = {}, { timeout = 20000 } = {}) {
  const base = apiUrl();
  if (!base) return Promise.reject(new ApiError('Falta configurar la dirección del backend.'));
  const url = absUrl(base);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  url.searchParams.set('_', String(Date.now()));
  const check = (data) => {
    if (!data || typeof data !== 'object') throw new ApiError(MSG_RED);
    if (data.ok === false) throw new ApiError(data.error || 'La planilla rechazó la operación.', true);
    return data;
  };
  return fetchJson(url.toString(), { method: 'GET' }, timeout)
    .then(check, (err) => {
      if (err && err.server) throw err;
      if (err && err.message === MSG_TIMEOUT) throw err;
      if (sinUsarJsonp()) throw new ApiError(MSG_RED);
      const u2 = absUrl(base);
      u2.searchParams.set('action', action);
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u2.searchParams.set(k, v);
      u2.searchParams.set('_', String(Date.now()));
      return jsonp(u2, timeout).then(check);
    });
}

// POST: devuelve el JSON si se pudo leer, null si la respuesta fue ilegible (el llamador confirma por ID).
// Rechaza con ApiError.server si el servidor dijo ok:false; con ApiError de red si no hubo conexión.
export function post(payload, { timeout = 45000 } = {}) {
  const base = apiUrl();
  if (!base) return Promise.reject(new ApiError('Falta configurar la dirección del backend.'));
  if (globalThis.navigator && globalThis.navigator.onLine === false) return Promise.reject(new ApiError('Sin conexión.'));
  return fetchJson(absUrl(base).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }, timeout).then(data => {
    if (data && data.ok === false) throw new ApiError(data.error || 'La planilla rechazó la operación.', true);
    return data || null;
  }, err => {
    if (err && err.message === '__ilegible__') return null;
    throw err;
  });
}

const espera = ms => new Promise(r => setTimeout(r, ms));

export async function confirmar(action, id, { intentos = 4, pausa = 1500 } = {}) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await get(action, { id });
      if (r && r.found !== false) return r;
    } catch (e) {
      if (e && e.server) throw e;
    }
    if (i + 1 < intentos) await espera(pausa);
  }
  return null;
}

/* ---------- caché de lecturas (stale-while-revalidate) ---------- */
const memo = new Map();
const claveCache = (action, params) => `cache:${action}:${JSON.stringify(params || {})}`;

export function leerCache(action, params) {
  const k = claveCache(action, params);
  if (memo.has(k)) return memo.get(k);
  const v = store.get(k, null);
  if (v) memo.set(k, v);
  return v;
}

export function guardarCache(action, params, data) {
  const k = claveCache(action, params);
  const v = { t: Date.now(), data };
  memo.set(k, v);
  store.set(k, v);
  return v;
}

export function invalidar(prefijo = '') {
  for (const k of [...memo.keys()]) if (k.startsWith(`cache:${prefijo}`)) memo.delete(k);
  for (const k of store.keys(`cache:${prefijo}`)) store.del(k);
}

// Devuelve { data, stale, fresh } : data inmediato (caché o null), promesa fresh con el dato nuevo.
export function cached(action, params = {}, { maxAge = 60000 } = {}) {
  const hit = leerCache(action, params);
  const stale = !hit || (Date.now() - hit.t) > maxAge;
  const fresh = (!hit || stale)
    ? get(action, params).then(d => guardarCache(action, params, d).data)
    : Promise.resolve(hit.data);
  return { data: hit ? hit.data : null, stale, fresh };
}

/* ---------- cola de envíos pendientes ---------- */
const COLA = 'cola';
const listeners = new Set();
export function onCola(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function avisar() { for (const fn of listeners) { try { fn(pendientes()); } catch (_e) { /* ignorar */ } } }

export function pendientes() { return store.get(COLA, []); }

function encolar(item) {
  const cola = pendientes();
  if (!cola.some(x => x.id === item.id)) cola.push(item);
  store.set(COLA, cola);
  avisar();
}

function desencolar(id) {
  store.set(COLA, pendientes().filter(x => x.id !== id));
  avisar();
}

export function descartarPendiente(id) { desencolar(id); }

// Envía una escritura y la confirma. Resultado:
//  { estado: 'confirmado', respuesta }   la planilla tiene el registro
//  { estado: 'pendiente' }               sin red: quedó en cola, se reintenta solo
//  lanza ApiError.server                 la planilla lo rechazó (mensaje para mostrar)
//  lanza ApiError                        no se pudo confirmar (puede o no haberse guardado)
export async function enviar({ payload, id, confirmAction, titulo }) {
  let respuesta = null;
  try {
    respuesta = await post(payload);
  } catch (e) {
    if (e && e.server) throw e;
    if (globalThis.navigator && globalThis.navigator.onLine === false) {
      encolar({ id, payload, confirmAction, titulo, t: Date.now() });
      return { estado: 'pendiente' };
    }
    respuesta = null;
  }
  if (respuesta && respuesta.ok) return { estado: 'confirmado', respuesta };
  const conf = await confirmar(confirmAction, id);
  if (conf) return { estado: 'confirmado', respuesta: conf };
  if (globalThis.navigator && globalThis.navigator.onLine === false) {
    encolar({ id, payload, confirmAction, titulo, t: Date.now() });
    return { estado: 'pendiente' };
  }
  throw new ApiError('No se pudo confirmar que la planilla lo haya guardado. Revisá la conexión y volvé a intentar: no se va a duplicar.');
}

let vaciando = false;
export async function vaciarCola() {
  if (vaciando) return;
  vaciando = true;
  try {
    for (const item of pendientes()) {
      try {
        const r = await enviar(item);
        if (r.estado === 'confirmado') desencolar(item.id);
        else break;
      } catch (e) {
        if (e && e.server) { desencolar(item.id); item.error = e.message; marcarRechazo(item); }
        else break;
      }
    }
  } finally { vaciando = false; }
}

const RECHAZOS = 'rechazos';
function marcarRechazo(item) {
  const l = store.get(RECHAZOS, []);
  l.unshift({ id: item.id, titulo: item.titulo, error: item.error, t: Date.now() });
  store.set(RECHAZOS, l.slice(0, 20));
  avisar();
}
export function rechazos() { return store.get(RECHAZOS, []); }
export function limpiarRechazos() { store.del(RECHAZOS); avisar(); }

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('online', () => { vaciarCola(); });
}
