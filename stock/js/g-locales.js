// Gerencia · Locales: razón social y CUIT con los que compra cada local.
// Salen en el mensaje, la imagen y la impresión de las órdenes a los proveedores.
// Sin 0013_locales_razon_social.sql la pantalla avisa y no deja guardar.
import { mount, h, porTexto } from './util.js';
import { guardarLocal, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, SUBNAV_CATALOGO, banner } from './ui.js';
import { soloDigitos } from './pagos-util.js';

const cuitConGuiones = (d) => `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Locales' }), h('p', { class: 'sub', text: 'A nombre de quién compra cada local' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'locales'), esqueleto(3));
  const lista = h('div', { class: 'lista' });
  const hayColumna = () => G.locales.some((l) => 'razon_social' in l);

  function editar(l) {
    const inp = (id, v, attrs) => h('input', { class: 'input', id, autocomplete: 'off', value: v || '', ...attrs });
    const razon = inp('lc-razon', l.razon_social, { placeholder: 'Ej. SUMA ACTIVA S.A.', maxlength: '80' });
    const cuit = inp('lc-cuit', l.cuit, { class: 'input num', inputmode: 'numeric', placeholder: '30-12345678-9' });
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar cambios' });
    const { cerrar } = hoja(l.nombre, h('div', { class: 'form' },
      campo('Razón social', razon, 'Sale en las órdenes: "Facturar a …".'),
      campo('CUIT', cuit, 'Opcional. Si lo cargás, también sale en la orden.'),
      err, btn));
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const d = soloDigitos(cuit.value);
      if (d && d.length !== 11) return (err.textContent = 'El CUIT tiene 11 números.');
      const datos = { razon_social: razon.value.trim().replace(/\s+/g, ' ') || null, cuit: d ? cuitConGuiones(d) : null };
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const r = await guardarLocal(l.id, datos);
        if (!r.length) throw new Error('No tenés permiso para editar locales.');
        Object.assign(l, datos); toast('Local guardado', 'ok'); cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });
    razon.focus();
  }

  function pintar() {
    const vis = [...G.locales].sort((a, b) => (a.activo === false) - (b.activo === false) || porTexto(a.nombre, b.nombre));
    if (!vis.length) return lista.replaceChildren(vacio('No hay locales', 'Se cargan en Supabase.'));
    const col = hayColumna();
    lista.replaceChildren(
      ...(col ? [] : [banner('Falta pegar el SQL de razón social en Supabase: hasta entonces las órdenes salen sin razón social.', 'warn')]),
      ...vis.map((l) => h('button', { class: 'prod prod-cat' + (l.activo === false ? ' is-off' : ''), type: 'button', 'data-local': l.codigo, disabled: !col,
        'aria-label': `Editar ${l.nombre}`, on: { click: () => editar(l) } },
        h('span', { class: 'prod-n', text: l.nombre + (l.activo === false ? ' · inactivo' : '') }),
        h('span', { class: 'prod-m' },
          l.razon_social ? h('span', { text: 'Factura a ' + l.razon_social }) : h('span', { class: 'chip-aviso', text: 'Sin razón social' }),
          l.cuit ? h('span', { class: 'num', text: l.cuit }) : null))));
  }

  try { await cargarG(['locales'], () => { if (ctx.alive() && lista.isConnected) pintar(); }); }
  catch (e) { return mount(root, cab, subnav(SUBNAV_CATALOGO, 'locales'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'locales'), lista);
  pintar();
}
