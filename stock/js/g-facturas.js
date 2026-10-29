// Pagos · Facturas: alta de facturas de proveedores (con PDF o foto opcional), listado con las vencidas resaltadas
// y, solo gerencia, borrar una factura (los pagos quedan y lo imputado pasa a las otras facturas del proveedor).
import { mount, h, fmtMoney, parseNum, porTexto, hoyISO } from './util.js';
import { swr, facturasLista, crearFactura, borrarFactura, subirComprobante, urlComprobante, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, vacio, banner, subnav, SUBNAV_PAGOS, toast, hoja, campo, icon } from './ui.js';
import { fechaDMA, rutaFactura, estaPagada } from './pagos-util.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Facturas' }), h('p', { class: 'sub', text: 'Facturas de proveedores y su vencimiento' }));
  mount(root, cab, subnav(SUBNAV_PAGOS, 'facturas'), esqueleto(4));
  let facturas = [], filtro = 'pendientes', error = null;
  const lista = h('div', { class: 'lista' });

  const ger = ctx.rol === 'gerencia';
  const nombreProv = (id) => (G.provs.get(id) || {}).nombre || 'Proveedor';
  function estadoDe(f) { return estaPagada(f) ? ['Pagada', 'estado-recibida'] : f.vencida ? ['Vencida', 'estado-vencida'] : Number(f.imputado) > 0 ? ['Pago parcial', 'estado-aprobada'] : ['Pendiente', 'estado-borrador']; }

  function pintarLista() {
    const vis = facturas.filter((f) => filtro === 'todas' || (filtro === 'vencidas' ? f.vencida : !estaPagada(f)))
      .sort((a, b) => (b.vencida - a.vencida) || String(a.vencimiento || '9999').localeCompare(String(b.vencimiento || '9999')) || porTexto(a.numero, b.numero));
    if (!vis.length) return lista.replaceChildren(vacio('No hay facturas para mostrar', filtro === 'todas' ? 'Cargá la primera con "Nueva factura".' : 'Nada pendiente en esta vista.'));
    lista.replaceChildren(...vis.map((f) => {
      const [txt, cls] = estadoDe(f);
      return h('article', { class: 'prod fac' + (f.vencida ? ' fac-vencida' : ''), 'data-factura': f.numero },
        h('h3', { class: 'prod-n', text: nombreProv(f.proveedor_id) }),
        h('p', { class: 'prod-m' }, h('span', { class: 'num', text: `N° ${f.numero}` }), h('span', { text: `del ${fechaDMA(f.fecha)}` })),
        h('p', { class: 'prod-m' }, h('span', { class: 'fac-v', text: f.vencimiento ? `Vence ${fechaDMA(f.vencimiento)}` : 'Sin vencimiento' }), h('b', { class: 'num', text: fmtMoney(f.total) })),
        h('div', { class: 'prod-m' }, h('span', { class: 'estado ' + cls, text: txt }), !estaPagada(f) && Number(f.imputado) > 0 ? h('span', { class: 'num', text: `Debe ${fmtMoney(f.pendiente)}` }) : null),
        f.archivo || ger ? h('div', { class: 'fac-acc' },
          f.archivo ? h('button', { class: 'btn btn-text btn-sm', type: 'button', text: 'Ver archivo', on: { click: async () => {
            try { window.open(await urlComprobante(f.archivo), '_blank', 'noopener'); } catch (e) { toast(mensajeError(e), 'error'); }
          } } }) : null,
          ger ? h('button', { class: 'btn btn-text btn-sm btn-danger', type: 'button', text: 'Borrar', 'aria-label': `Borrar factura ${f.numero}`, on: { click: () => pedirBorrar(f) } }) : null) : null);
    }));
  }

  // Borrar una factura (solo gerencia). Los pagos no se tocan: lo imputado vuelve a quedar a favor del proveedor.
  function pedirBorrar(f) {
    const si = h('button', { class: 'btn btn-primary btn-peligro btn-block', type: 'button', text: 'Sí, borrar la factura' });
    const pagado = Number(f.imputado) > 0;
    const { cerrar } = hoja('Borrar factura', h('div', { class: 'borrar-imp' },
      h('p', { text: `Vas a borrar la factura N° ${f.numero} de ${nombreProv(f.proveedor_id)} por ${fmtMoney(f.total)}.` }),
      banner(pagado ? `Tiene ${fmtMoney(f.imputado)} pagados: los pagos no se borran, ese monto pasa a las otras facturas pendientes del proveedor (o queda a favor).`
        : 'No tiene pagos imputados. Se borra y deja de figurar en la cuenta del proveedor.', 'info'),
      h('div', { class: 'acciones' }, si, h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'No, dejarla', on: { click: () => cerrar() } }))));
    si.addEventListener('click', async () => {
      si.disabled = true; si.textContent = 'Borrando…';
      try {
        await borrarFactura(f.id);
        cerrar(); toast(`Factura ${f.numero} borrada`, 'ok');
        facturas = await facturasLista(false); pintarLista();
      } catch (e) { toast(mensajeError(e), 'error'); si.disabled = false; si.textContent = 'Sí, borrar la factura'; }
    });
  }

  function nueva() {
    const provs = [...G.provs.values()].filter((p) => p.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));
    const f = {
      prov: h('select', { class: 'input', id: 'fa-prov' }, h('option', { value: '', text: 'Elegí el proveedor' }), provs.map((p) => h('option', { value: p.id, text: p.nombre }))),
      numero: h('input', { class: 'input num', id: 'fa-numero', autocomplete: 'off', placeholder: '0001-00012345' }),
      fecha: h('input', { class: 'input', id: 'fa-fecha', type: 'date', value: hoyISO() }),
      venc: h('input', { class: 'input', id: 'fa-venc', type: 'date' }),
      total: h('input', { class: 'input num', id: 'fa-total', inputmode: 'decimal', placeholder: '0' }),
      archivo: h('input', { class: 'input', id: 'fa-archivo', type: 'file', accept: 'application/pdf,image/*' })
    };
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar factura' });
    const { cerrar } = hoja('Nueva factura', h('div', { class: 'form' },
      campo('Proveedor', f.prov), campo('Número de factura', f.numero),
      h('div', { class: 'dos' }, campo('Fecha', f.fecha), campo('Vencimiento', f.venc)),
      campo('Total ($)', f.total), campo('PDF o foto (opcional)', f.archivo), err, btn));
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const total = parseNum(f.total.value);
      if (!f.prov.value) return (err.textContent = 'Elegí el proveedor.');
      if (!f.numero.value.trim()) return (err.textContent = 'Poné el número de la factura.');
      if (!f.fecha.value) return (err.textContent = 'Poné la fecha de la factura.');
      if (total === null || total < 0) return (err.textContent = 'Poné el total de la factura.');
      if (f.venc.value && f.venc.value < f.fecha.value) return (err.textContent = 'El vencimiento no puede ser anterior a la fecha de la factura.');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const arch = f.archivo.files && f.archivo.files[0];
        const ruta = arch ? await subirComprobante(rutaFactura(f.prov.value, arch.name), arch) : null;
        await crearFactura({ proveedor_id: f.prov.value, numero: f.numero.value.trim(), fecha: f.fecha.value, vencimiento: f.venc.value || null, total, archivo: ruta });
        toast('Factura guardada', 'ok'); cerrar();
        facturas = await facturasLista(false); pintarLista();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = 'Guardar factura'; }
    });
    f.prov.focus();
  }

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtro' }, [['pendientes', 'Pendientes'], ['vencidas', 'Vencidas'], ['todas', 'Todas']].map(([id, t]) =>
    h('button', { class: 'chip' + (id === filtro ? ' is-on' : ''), type: 'button', text: t, 'aria-pressed': id === filtro ? 'true' : 'false', 'data-filtro': id, on: { click: (e) => {
      filtro = id; chips.querySelectorAll('.chip').forEach((b) => { const on = b.getAttribute('data-filtro') === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      pintarLista();
    } } })));

  try {
    await cargarG(['provs'], () => {});
    if (!ctx.alive()) return;
    mount(root, cab, subnav(SUBNAV_PAGOS, 'facturas'),
      h('div', { class: 'toolbar' }, chips, h('button', { class: 'btn btn-primary', type: 'button', on: { click: nueva } }, icon('mas', 18), h('span', { text: 'Nueva factura' }))), lista);
    await swr('p:fac:todas', () => facturasLista(false), (d) => { facturas = d; if (ctx.alive()) pintarLista(); });
  } catch (e) { error = mensajeError(e); mount(root, cab, subnav(SUBNAV_PAGOS, 'facturas'), banner(error, 'error')); }
}
