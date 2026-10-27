// Gerencia · Proveedores: alta y ficha completa de cada proveedor.
//  * Pedidos: contacto, WhatsApp, teléfono, email, días de entrega, corte, mínimo y productos que le compramos.
//  * Pagos: razón social, CUIT (reconoce los comprobantes), banco, alias/CBU, WhatsApp y email de cobranzas.
// Sin 0011_proveedores_datos.sql se guardan solo los datos de siempre y la ficha lo avisa.
import { mount, h, norm, porTexto, debounce, fmtMoney, parseNum, tokens, coincide } from './util.js';
import { guardarProveedor, crearProveedor, guardarProducto, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, SUBNAV_CATALOGO, banner, icon } from './ui.js';
import { soloDigitos, whatsappAR, emailValido, whatsappPagos, emailPagos } from './pagos-util.js';

const EXTRA = ['razon_social', 'contacto', 'telefono', 'email', 'whatsapp_pagos', 'email_pagos', 'banco'];
// Con el SQL 0011 corrido, cada proveedor trae las columnas nuevas (aunque estén vacías).
const hayExtra = () => !G.provs.size || [...G.provs.values()].some((p) => 'email' in p);
const cuitConGuiones = (d) => `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Proveedores' }), h('p', { class: 'sub', text: 'Datos para los pedidos y para mandar los comprobantes' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'proveedores'), esqueleto(4));
  let q = '';
  const lista = h('div', { class: 'lista' });
  const productosDe = (id) => [...G.prods.values()].filter((x) => x.proveedor_id === id && x.activo !== false);

  function editar(p) {
    const nuevo = !p;
    const d = p || { nombre: '', activo: true };
    const extra = hayExtra();
    const inp = (id, v, o = {}) => h('input', { class: 'input' + (o.num ? ' num' : ''), id, autocomplete: 'off', value: v == null ? '' : String(v), ...o.attrs });
    const f = {
      nombre: inp('pv-nombre', d.nombre, { attrs: { placeholder: 'Ej. Distribuidora Florida', maxlength: '80' } }),
      contacto: inp('pv-contacto', d.contacto, { attrs: { placeholder: 'Con quién hablamos' } }),
      wa: inp('pv-wa', d.whatsapp, { num: true, attrs: { inputmode: 'tel', placeholder: '5491155550000' } }),
      tel: inp('pv-tel', d.telefono, { num: true, attrs: { inputmode: 'tel', placeholder: '011 4444-5555' } }),
      email: inp('pv-email', d.email, { attrs: { type: 'email', inputmode: 'email', placeholder: 'pedidos@proveedor.com' } }),
      entrega: inp('pv-entrega', d.dias_entrega, { attrs: { placeholder: 'Ej. 1 día · martes y viernes' } }),
      corte: inp('pv-corte', d.corte, { attrs: { placeholder: 'Ej. miércoles 12 h' } }),
      minimo: inp('pv-minimo', d.pedido_minimo, { num: true, attrs: { inputmode: 'decimal', placeholder: 'Sin mínimo' } }),
      razon: inp('pv-razon', d.razon_social, { attrs: { placeholder: 'Como figura en la factura' } }),
      cuit: inp('pv-cuit', d.cuit, { num: true, attrs: { inputmode: 'numeric', placeholder: '30-12345678-9' } }),
      banco: inp('pv-banco', d.banco, { attrs: { placeholder: 'Ej. Credicoop' } }),
      alias: inp('pv-alias', d.alias_cbu, { attrs: { placeholder: 'alias o CBU' } }),
      waPago: inp('pv-wa-pago', d.whatsapp_pagos, { num: true, attrs: { inputmode: 'tel', placeholder: 'El mismo de pedidos' } }),
      emailPago: inp('pv-email-pago', d.email_pagos, { attrs: { type: 'email', inputmode: 'email', placeholder: 'El mismo de pedidos' } }),
      notas: h('textarea', { class: 'input', id: 'pv-notas', rows: '2', maxlength: '500', placeholder: 'Ej. entregar por la puerta de atrás' }),
      activo: h('input', { type: 'checkbox', id: 'pv-activo', checked: d.activo !== false })
    };
    f.notas.value = d.notas || '';
    const sec = (titulo, ...kids) => h('fieldset', { class: 'pv-sec' }, h('legend', { class: 'grupo-t', text: titulo }), ...kids);
    const solo = (el) => (extra ? el : null);
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: nuevo ? 'Crear proveedor' : 'Guardar cambios' });
    const form = h('div', { class: 'form' },
      extra ? null : banner('Falta pegar el SQL de proveedores en Supabase: por ahora no se guardan contacto, teléfono, email, razón social, banco ni los datos de cobranza.', 'warn'),
      sec('Proveedor', campo('Nombre', f.nombre), solo(campo('Contacto', f.contacto))),
      sec('Para los pedidos',
        h('div', { class: 'dos' }, campo('WhatsApp', f.wa, 'Ej. 11 5555-0000: el 549 se agrega solo.'), solo(campo('Teléfono', f.tel))),
        solo(campo('Email', f.email, 'Si no tiene WhatsApp, el pedido se le manda por acá.')),
        h('div', { class: 'dos' }, campo('Días de entrega', f.entrega), campo('Corte', f.corte, 'Hasta cuándo se le pide.')),
        campo('Pedido mínimo $', f.minimo)),
      sec('Para los pagos',
        solo(campo('Razón social', f.razon)),
        h('div', { class: 'dos' }, campo('CUIT', f.cuit, 'Con él se reconoce el comprobante.'), solo(campo('Banco', f.banco))),
        campo('Alias o CBU', f.alias),
        solo(h('div', { class: 'dos' }, campo('WhatsApp de cobranzas', f.waPago), campo('Email de cobranzas', f.emailPago))),
        solo(h('p', { class: 'field-h', text: 'El comprobante de pago va a cobranzas; si lo dejás vacío, va al WhatsApp o email de pedidos.' }))),
      campo('Notas', f.notas),
      h('label', { class: 'check' }, f.activo, h('span', { text: 'Activo (aparece para pedir y pagar)' })),
      err, btn,
      nuevo ? null : seccionProductos(d));
    const { cerrar } = hoja(nuevo ? 'Nuevo proveedor' : d.nombre, form);

    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const nombre = f.nombre.value.trim().replace(/\s+/g, ' ');
      if (!nombre) { f.nombre.focus(); return (err.textContent = 'Poné el nombre del proveedor.'); }
      const igual = [...G.provs.values()].find((x) => x.id !== d.id && norm(x.nombre) === norm(nombre));
      if (igual) return (err.textContent = `Ya hay un proveedor que se llama ${igual.nombre}.`);
      const cuit = soloDigitos(f.cuit.value);
      if (cuit && cuit.length !== 11) return (err.textContent = 'El CUIT tiene 11 números.');
      const otro = cuit && [...G.provs.values()].find((x) => x.id !== d.id && soloDigitos(x.cuit) === cuit);
      if (otro) return (err.textContent = `Ese CUIT ya está cargado en ${otro.nombre}.`);
      const minimo = f.minimo.value.trim() ? parseNum(f.minimo.value) : null;
      if (f.minimo.value.trim() && (minimo === null || minimo < 0)) return (err.textContent = 'El pedido mínimo tiene que ser un número.');
      for (const [el, qué] of [[f.email, 'de pedidos'], [f.emailPago, 'de cobranzas']]) {
        if (el.value.trim() && !emailValido(el.value)) return (err.textContent = `Revisá el email ${qué}.`);
      }
      const t = (el) => el.value.trim() || null;
      let datos = {
        nombre, whatsapp: whatsappAR(f.wa.value) || null, cuit: cuit ? cuitConGuiones(cuit) : null, alias_cbu: t(f.alias),
        dias_entrega: t(f.entrega), corte: t(f.corte), pedido_minimo: minimo || null, notas: t(f.notas), activo: f.activo.checked,
        contacto: t(f.contacto), telefono: t(f.tel), email: t(f.email) && t(f.email).toLowerCase(), razon_social: t(f.razon), banco: t(f.banco),
        whatsapp_pagos: whatsappAR(f.waPago.value) || null, email_pagos: t(f.emailPago) && t(f.emailPago).toLowerCase()
      };
      if (!extra) datos = Object.fromEntries(Object.entries(datos).filter(([k]) => !EXTRA.includes(k)));
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        if (nuevo) {
          const id = await crearProveedor(datos);
          const pr = { id, ...Object.fromEntries(EXTRA.filter(() => extra).map((k) => [k, null])), ...datos };
          G.provs.set(id, pr);
          toast('Proveedor creado. Ahora sumale los productos que le comprás.', 'ok'); cerrar(); pintar(); editar(pr);
        } else {
          const r = await guardarProveedor(d.id, datos);
          if (!r.length) throw new Error('No tenés permiso para editar proveedores.');
          Object.assign(d, datos); G.provs.set(d.id, d);
          toast('Proveedor guardado', 'ok'); cerrar(); pintar();
        }
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = nuevo ? 'Crear proveedor' : 'Guardar cambios'; }
    });
    (nuevo ? f.nombre : f.wa).focus();
  }

  // Productos que le compramos: los del catálogo con este proveedor, y un buscador para sumar más.
  function seccionProductos(p) {
    const cont = h('div', { class: 'pv-prods' });
    const res = h('div', { class: 'pv-res', 'aria-live': 'polite' });
    const buscar = h('input', { class: 'input input-search', type: 'search', id: 'pv-buscar-prod', placeholder: 'Buscar producto para sumar', 'aria-label': 'Buscar producto para sumar', autocomplete: 'off' });
    const fila = (x, accion) => h('div', { class: 'pv-prod', 'data-prod': x.codigo },
      h('span', { class: 'pv-prod-n' }, h('b', { text: x.nombre }), h('small', { text: `${nombreLocal(x.local_id)} · ${x.codigo}${x.proveedor_id && x.proveedor_id !== p.id && G.provs.get(x.proveedor_id) ? ' · hoy: ' + G.provs.get(x.proveedor_id).nombre : ''}` })),
      accion);
    async function asignar(x, provId, b) {
      b.disabled = true;
      try { await guardarProducto(x.id, { proveedor_id: provId }); x.proveedor_id = provId; G.prods.set(x.id, x); pintarProds(); buscarProds(); pintar(); }
      catch (e) { b.disabled = false; toast(mensajeError(e), 'error'); }
    }
    function pintarProds() {
      const ps = productosDe(p.id).sort((a, b) => porTexto(nombreLocal(a.local_id), nombreLocal(b.local_id)) || porTexto(a.nombre, b.nombre));
      cont.replaceChildren(
        h('p', { class: 'grupo-t', text: `Productos que le compramos (${ps.length})` }),
        ps.length ? h('div', { class: 'pv-lista' }, ps.map((x) => fila(x, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': `Quitar ${x.nombre}`, text: 'Quitar', on: { click: (e) => asignar(x, null, e.currentTarget) } }))))
          : h('p', { class: 'field-h', text: 'Todavía no tiene productos. Buscalos abajo y tocá Sumar.' }));
    }
    function buscarProds() {
      const toks = tokens(buscar.value);
      if (!toks.length) return res.replaceChildren();
      const vis = [...G.prods.values()].filter((x) => x.activo !== false && x.proveedor_id !== p.id && coincide(`${x.nombre} ${x.codigo}`, toks))
        .sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 15);
      res.replaceChildren(...(vis.length ? vis.map((x) => fila(x, h('button', { class: 'btn btn-primary btn-sm', type: 'button', 'aria-label': `Sumar ${x.nombre}`, on: { click: (e) => asignar(x, p.id, e.currentTarget) } }, icon('mas', 16), h('span', { text: 'Sumar' }))))
        : [h('p', { class: 'field-h', text: 'No hay productos con ese nombre. Si es nuevo, cargalo en Catálogo → Productos.' })]));
    }
    buscar.addEventListener('input', debounce(buscarProds, 150));
    pintarProds();
    return h('section', { class: 'pv-sec pv-prods-sec' }, cont, buscar, res);
  }

  function pintar() {
    const t = norm(q).split(' ').filter(Boolean);
    const vis = [...G.provs.values()].filter((p) => t.every((k) => norm(`${p.nombre} ${p.razon_social || ''} ${p.contacto || ''}`).includes(k)))
      .sort((a, b) => (a.activo === false) - (b.activo === false) || porTexto(a.nombre, b.nombre));
    if (!vis.length) return lista.replaceChildren(vacio('No hay proveedores', q ? 'Probá con otra búsqueda.' : 'Tocá "Nuevo proveedor" para cargar el primero.'));
    lista.replaceChildren(...vis.map((p) => {
      const n = productosDe(p.id).length;
      const wa = whatsappPagos(p), mail = emailPagos(p);
      const pedidos = [p.dias_entrega && 'Entrega ' + p.dias_entrega, p.corte && 'Corte ' + p.corte, p.pedido_minimo && 'Mínimo ' + fmtMoney(p.pedido_minimo)].filter(Boolean).join(' · ');
      return h('button', { class: 'prod prod-cat' + (p.activo === false ? ' is-off' : ''), type: 'button', 'data-prov': p.nombre, on: { click: () => editar(p) }, 'aria-label': `Editar ${p.nombre}` },
        h('span', { class: 'prod-n', text: p.nombre + (p.activo === false ? ' · inactivo' : '') }),
        h('span', { class: 'prod-m' },
          p.whatsapp ? h('span', { class: 'num', text: p.whatsapp }) : p.email ? null : h('span', { class: 'chip-aviso', text: 'Sin WhatsApp' }),
          p.email ? h('span', { text: p.email }) : null,
          p.cuit ? h('span', { class: 'num', text: p.cuit }) : h('span', { class: 'chip-aviso', text: 'Sin CUIT' })),
        pedidos ? h('span', { class: 'prod-m' }, h('span', { text: pedidos })) : null,
        h('span', { class: 'prod-m' },
          h('span', { text: `${n} ${n === 1 ? 'producto' : 'productos'}` }),
          p.alias_cbu ? h('span', { text: p.alias_cbu }) : null,
          !wa && !mail ? h('span', { class: 'chip-aviso', text: 'Sin dónde mandar el comprobante' }) : null));
    }));
  }

  try { await cargarG(['provs', 'prods', 'locales'], () => { if (ctx.alive() && lista.isConnected) pintar(); }); }
  catch (e) { return mount(root, cab, subnav(SUBNAV_CATALOGO, 'proveedores'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;
  const buscar = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar proveedor', 'aria-label': 'Buscar proveedor', autocomplete: 'off', on: { input: debounce((e) => { q = e.target.value; pintar(); }, 120) } });
  const btnNuevo = h('button', { class: 'btn btn-primary', type: 'button', 'data-accion': 'nuevo-proveedor', on: { click: () => editar(null) } }, icon('mas', 18), h('span', { text: 'Nuevo proveedor' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'proveedores'), h('div', { class: 'toolbar toolbar-row' }, buscar, btnNuevo), lista);
  pintar();
}
