// Gerencia · Proveedores: WhatsApp, CUIT y alias/CBU de cada proveedor (sirven para avisar los pagos y reconocer comprobantes).
import { mount, h, norm, porTexto, debounce } from './util.js';
import { guardarProveedor, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, SUBNAV_CATALOGO, banner } from './ui.js';
import { soloDigitos } from './pagos-util.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Proveedores' }), h('p', { class: 'sub', text: 'WhatsApp, CUIT y alias para los pagos' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'proveedores'), esqueleto(4));
  let q = '';
  const lista = h('div', { class: 'lista' });

  function editar(p) {
    const f = {
      wa: h('input', { class: 'input num', id: 'pv-wa', inputmode: 'tel', autocomplete: 'off', value: p.whatsapp || '', placeholder: '5491155550000' }),
      cuit: h('input', { class: 'input num', id: 'pv-cuit', inputmode: 'numeric', autocomplete: 'off', value: p.cuit || '', placeholder: '30-12345678-9' }),
      alias: h('input', { class: 'input', id: 'pv-alias', autocomplete: 'off', value: p.alias_cbu || '', placeholder: 'alias o CBU' })
    };
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar cambios' });
    const { cerrar } = hoja(p.nombre, h('div', { class: 'form' },
      campo('WhatsApp', f.wa, 'Con código de país, sin + ni espacios. Ej. 5491155550000'),
      campo('CUIT', f.cuit, 'Con él se reconoce al proveedor en los comprobantes de pago.'),
      campo('Alias o CBU', f.alias), err, btn));
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const cuit = soloDigitos(f.cuit.value);
      if (cuit && cuit.length !== 11) return (err.textContent = 'El CUIT tiene 11 números.');
      const otro = cuit && [...G.provs.values()].find((x) => x.id !== p.id && soloDigitos(x.cuit) === cuit);
      if (otro) return (err.textContent = `Ese CUIT ya está cargado en ${otro.nombre}.`);
      const datos = { whatsapp: soloDigitos(f.wa.value) || null, cuit: cuit ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : null, alias_cbu: f.alias.value.trim() || null };
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const r = await guardarProveedor(p.id, datos);
        if (!r.length) throw new Error('No tenés permiso para editar proveedores.');
        Object.assign(p, datos); G.provs.set(p.id, p);
        toast('Proveedor guardado', 'ok'); cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    });
    f.wa.focus();
  }

  function pintar() {
    const t = norm(q).split(' ').filter(Boolean);
    const vis = [...G.provs.values()].filter((p) => t.every((k) => norm(p.nombre).includes(k))).sort((a, b) => porTexto(a.nombre, b.nombre));
    if (!vis.length) return lista.replaceChildren(vacio('No hay proveedores', 'Probá con otra búsqueda.'));
    lista.replaceChildren(...vis.map((p) => h('button', { class: 'prod prod-cat', type: 'button', 'data-prov': p.nombre, on: { click: () => editar(p) }, 'aria-label': `Editar ${p.nombre}` },
      h('span', { class: 'prod-n', text: p.nombre }),
      h('span', { class: 'prod-m' }, p.whatsapp ? h('span', { class: 'num', text: p.whatsapp }) : h('span', { class: 'chip-aviso', text: 'Sin WhatsApp' }), p.cuit ? h('span', { class: 'num', text: p.cuit }) : h('span', { class: 'chip-aviso', text: 'Sin CUIT' })),
      p.alias_cbu ? h('span', { class: 'prod-m' }, h('span', { text: p.alias_cbu })) : null)));
  }

  try { await cargarG(['provs'], () => { if (ctx.alive() && lista.isConnected) pintar(); }); }
  catch (e) { return mount(root, cab, subnav(SUBNAV_CATALOGO, 'proveedores'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  const buscar = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar proveedor', 'aria-label': 'Buscar proveedor', autocomplete: 'off', on: { input: debounce((e) => { q = e.target.value; pintar(); }, 120) } });
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'proveedores'), h('div', { class: 'toolbar' }, buscar), lista);
  pintar();
}
