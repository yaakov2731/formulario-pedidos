// Gerencia · Locales: agregar un local, dar de baja uno que ya no está y la razón social y CUIT con los que compra cada uno.
// La razón social sale en el mensaje, la imagen y la impresión de las órdenes a los proveedores.
// Dar de baja no borra nada (activo = false): deja de aparecer en Entrar, en los selectores de local y en Pedir, pero
// pedidos, conteos, facturas y ventas quedan. Se puede volver a activar. El alta usa 0027_locales_alta_baja.sql.
// Sin 0013_locales_razon_social.sql la pantalla avisa y no deja guardar.
import { mount, h, porTexto } from './util.js';
import { guardarLocal, crearLocal, vincularEncargado, localesLogin, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, SUBNAV_CATALOGO, banner, icon } from './ui.js';
import { soloDigitos } from './pagos-util.js';

const cuitConGuiones = (d) => `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
const RAZONES = ['SUMA ACTIVA S.A.', 'SPMAR S.A.'];
const emailEncargado = (codigo) => `local-${String(codigo || '').toLowerCase()}@docks-stock.app`;

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Locales' }), h('p', { class: 'sub', text: 'Qué locales hay y a nombre de quién compra cada uno' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'locales'), esqueleto(3));
  const lista = h('div', { class: 'lista' });
  const hayColumna = () => G.locales.some((l) => 'razon_social' in l);
  let conUsuario = new Set();   // códigos de locales con usuario de encargado (los que salen en Entrar)
  const inp = (id, v, attrs) => h('input', { class: 'input', id, autocomplete: 'off', value: v || '', ...attrs });
  const leerCuit = (cuit, err) => {
    const d = soloDigitos(cuit.value);
    if (d && d.length !== 11) { err.textContent = 'El CUIT tiene 11 números.'; return undefined; }
    return d ? cuitConGuiones(d) : null;
  };

  // Cómo crear el usuario del encargado: en Supabase y después "Conectar usuario".
  const ayudaUsuario = (l) => h('div', { class: 'loc-usr' },
    h('p', { class: 'field-h', text: `Para que el encargado entre: en Supabase → Authentication → Add user, creá ${emailEncargado(l.codigo)} con un PIN de 6 números (Auto confirm). Después tocá "Conectar usuario".` }));

  async function conectar(l, boton) {
    boton.disabled = true;
    try {
      const okv = await vincularEncargado(l.id);
      if (!okv) { toast(`Todavía no existe ${emailEncargado(l.codigo)} en Supabase.`, 'error'); boton.disabled = false; return false; }
      conUsuario.add(l.codigo); toast(`${l.nombre} ya aparece en Entrar.`, 'ok'); pintar(); return true;
    } catch (e) { toast(mensajeError(e), 'error'); boton.disabled = false; return false; }
  }

  function nuevo() {
    const nombre = inp('lc-nombre', '', { placeholder: 'Ej.: Palermo', maxlength: '40' });
    const codigo = inp('lc-codigo', '', { placeholder: 'Ej.: PAL', maxlength: '5', autocapitalize: 'characters', class: 'input lc-cod' });
    const razon = inp('lc-razon', RAZONES[0], { placeholder: 'Ej. SUMA ACTIVA S.A.', maxlength: '80', list: 'dl-razon' });
    const cuit = inp('lc-cuit', '', { class: 'input num', inputmode: 'numeric', placeholder: '30-12345678-9' });
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Agregar local' });
    let tocado = false;
    codigo.addEventListener('input', () => { tocado = true; codigo.value = codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    nombre.addEventListener('input', () => { if (!tocado) codigo.value = nombre.value.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase(); });
    const { cerrar } = hoja('Nuevo local', h('div', { class: 'form' },
      h('datalist', { id: 'dl-razon' }, RAZONES.map(r => h('option', { value: r }))),
      campo('Nombre', nombre),
      campo('Código', codigo, 'De 2 a 5 letras. Va adelante de los códigos de producto (PAL-001) y en el usuario del encargado.'),
      campo('Razón social', razon, 'Sale en las órdenes: "Facturar a …".'),
      campo('CUIT', cuit, 'Opcional.'),
      err, btn));
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const c = leerCuit(cuit, err); if (c === undefined) return;
      const d = { nombre: nombre.value.trim().replace(/\s+/g, ' '), codigo: codigo.value.trim().toUpperCase(), razon_social: razon.value.trim().replace(/\s+/g, ' '), cuit: c };
      if (!d.nombre) return (err.textContent = 'Poné el nombre del local.');
      if (!/^[A-Z0-9]{2,5}$/.test(d.codigo)) return (err.textContent = 'El código va de 2 a 5 letras o números (ej.: PAL).');
      if (G.locales.some(l => l.codigo.toUpperCase() === d.codigo)) return (err.textContent = `Ya hay un local con el código ${d.codigo}.`);
      if (G.locales.some(l => l.nombre.toLowerCase() === d.nombre.toLowerCase())) return (err.textContent = `Ya hay un local llamado ${d.nombre}.`);
      btn.disabled = true; btn.textContent = 'Agregando…';
      try {
        const id = await crearLocal(d);
        const l = { id, encargados: [], activo: true, ...d };
        G.locales.push(l);
        try { conUsuario = new Set((await localesLogin()).map(x => x.codigo)); } catch (_e) { /* sin red: queda como estaba */ }
        toast(`${d.nombre} agregado`, 'ok'); cerrar(); pintar(); editar(l);
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = 'Agregar local'; }
    });
    nombre.focus();
  }

  function editar(l) {
    const razon = inp('lc-razon', l.razon_social, { placeholder: 'Ej. SUMA ACTIVA S.A.', maxlength: '80', list: 'dl-razon' });
    const cuit = inp('lc-cuit', l.cuit, { class: 'input num', inputmode: 'numeric', placeholder: '30-12345678-9' });
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar cambios' });
    const activo = l.activo !== false;
    const baja = h('button', { class: 'btn btn-text btn-block cat-borrar', type: 'button' }, icon(activo ? 'basura' : 'check', 18), h('span', { text: activo ? 'Dar de baja el local' : 'Volver a activar' }));
    const conectarBtn = !activo || conUsuario.has(l.codigo) ? null : h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Conectar usuario' });
    const { cerrar } = hoja(l.nombre, h('div', { class: 'form' },
      h('datalist', { id: 'dl-razon' }, RAZONES.map(r => h('option', { value: r }))),
      campo('Razón social', razon, 'Sale en las órdenes: "Facturar a …".'),
      campo('CUIT', cuit, 'Opcional. Si lo cargás, también sale en la orden.'),
      err, btn,
      conectarBtn ? h('div', { class: 'loc-usr-box' }, h('b', { text: 'Sin usuario de encargado' }), ayudaUsuario(l), conectarBtn) : null,
      baja));
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const c = leerCuit(cuit, err); if (c === undefined) return;
      const datos = { razon_social: razon.value.trim().replace(/\s+/g, ' ') || null, cuit: c };
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const r = await guardarLocal(l.id, datos);
        if (!r.length) throw new Error('No tenés permiso para editar locales.');
        Object.assign(l, datos); toast('Local guardado', 'ok'); cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });
    if (conectarBtn) conectarBtn.addEventListener('click', async () => { if (await conectar(l, conectarBtn)) cerrar(); });
    baja.addEventListener('click', async () => {
      if (activo && !confirm(`¿Dar de baja ${l.nombre}? Deja de aparecer en Entrar, en Pedir y en los selectores de local. No se borra nada: pedidos, conteos, facturas y ventas quedan, y lo podés volver a activar.`)) return;
      baja.disabled = true;
      try {
        const r = await guardarLocal(l.id, { activo: !activo });
        if (!r.length) throw new Error('No tenés permiso para editar locales.');
        l.activo = !activo;
        toast(activo ? `${l.nombre} dado de baja` : `${l.nombre} activo de nuevo`, 'ok'); cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); baja.disabled = false; }
    });
  }

  function pintar() {
    const vis = [...G.locales].sort((a, b) => (a.activo === false) - (b.activo === false) || porTexto(a.nombre, b.nombre));
    const col = hayColumna();
    const agregar = h('button', { class: 'btn btn-primary loc-nuevo', type: 'button', disabled: !col, on: { click: nuevo } }, icon('mas', 18), h('span', { text: 'Nuevo local' }));
    lista.replaceChildren(
      ...(col ? [] : [banner('Falta pegar el SQL de razón social en Supabase: hasta entonces las órdenes salen sin razón social.', 'warn')]),
      agregar,
      ...(vis.length ? vis.map((l) => h('button', { class: 'prod prod-cat' + (l.activo === false ? ' is-off' : ''), type: 'button', 'data-local': l.codigo, disabled: !col,
        'aria-label': `Editar ${l.nombre}`, on: { click: () => editar(l) } },
        h('span', { class: 'prod-n', text: l.nombre + (l.activo === false ? ' · dado de baja' : '') }),
        h('span', { class: 'prod-m' },
          h('span', { class: 'num', text: l.codigo }),
          l.razon_social ? h('span', { text: 'Factura a ' + l.razon_social }) : h('span', { class: 'chip-aviso', text: 'Sin razón social' }),
          l.cuit ? h('span', { class: 'num', text: l.cuit }) : null,
          l.activo !== false && !conUsuario.has(l.codigo) ? h('span', { class: 'chip-aviso', text: 'Sin usuario de encargado' }) : null))) : [vacio('No hay locales', 'Agregá el primero con "Nuevo local".')]));
  }

  try {
    await Promise.all([
      cargarG(['locales'], () => { if (ctx.alive() && lista.isConnected) pintar(); }),
      localesLogin().then(r => { conUsuario = new Set((r || []).map(x => x.codigo)); }).catch(() => {})
    ]);
  } catch (e) { return mount(root, cab, subnav(SUBNAV_CATALOGO, 'locales'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'locales'), lista);
  pintar();
}
