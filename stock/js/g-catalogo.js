// Gerencia · Catálogo: búsqueda, alta y edición de productos y costo actual.
import { mount, h, tokens, coincide, fmtMoney, fmtNum, parseNum, porTexto, debounce, norm, plural, medidaReceta, escalaPresentacion } from './util.js';
import { guardarProducto, guardarPrecio, cambiarPresentacion, mensajeError, hayColumnaOculto } from './api.js';
import { G, cargarG, refrescarPrecio } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, icon, subnav, SUBNAV_CATALOGO } from './ui.js';

const MEDIDAS = [['kg', 'kg'], ['litro', 'litro'], ['unidad', 'unidad']];

export async function render(root, ctx) {
  let q = '', localF = 'todos', vistaF = 'todos';
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Catálogo' }), h('p', { class: 'sub', text: 'Productos, proveedores y costos' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'catalogo'), esqueleto(5));
  const lista = h('div', { class: 'lista' });

  function editar(p) {
    const nuevo = !p;
    const d = p || { codigo: '', nombre: '', local_id: localF !== 'todos' ? localF : (G.locales[0] || {}).id, categoria: '', unidad_compra: '', unidad_uso: 'unidad', factor_conversion: 1, proveedor_id: '', par: null, es_elaborado: false, activo: true, oculto: false };
    const sel = (opts, val, id) => { const s = h('select', { class: 'input', id }, opts.map(([v, t]) => h('option', { value: v, text: t }))); s.value = val || ''; return s; };
    const f = {
      codigo: h('input', { class: 'input num', id: 'f-codigo', value: d.codigo, autocomplete: 'off' }),
      nombre: h('input', { class: 'input', id: 'f-nombre', value: d.nombre, autocomplete: 'off' }),
      local: sel(G.locales.map(l => [l.id, l.nombre]), d.local_id, 'f-local'),
      categoria: h('input', { class: 'input', id: 'f-cat', value: d.categoria || '', list: 'dl-cat', autocomplete: 'off' }),
      uc: h('input', { class: 'input', id: 'f-uc', value: d.unidad_compra || '', placeholder: 'bolsa, caja, kg…', autocomplete: 'off' }),
      uu: sel([...MEDIDAS, ...(d.unidad_uso && !MEDIDAS.some(([v]) => v === d.unidad_uso) ? [[d.unidad_uso, d.unidad_uso]] : [])], d.unidad_uso || '', 'f-uu'),
      factor: h('input', { class: 'input num', id: 'f-factor', inputmode: 'decimal', value: String(d.factor_conversion ?? 1).replace('.', ',') }),
      prov: sel([['', 'Sin proveedor'], ...[...G.provs.values()].sort((a, b) => porTexto(a.nombre, b.nombre)).map(x => [x.id, x.nombre])], d.proveedor_id, 'f-prov'),
      ideal: h('input', { class: 'input num', id: 'f-ideal', inputmode: 'decimal', value: d.par === null || d.par === undefined ? '' : String(d.par).replace('.', ','), placeholder: 'Sin definir' }),
      costo: h('input', { class: 'input num', id: 'f-costo', inputmode: 'decimal', value: p && G.precios.has(p.id) ? String(G.precios.get(p.id)).replace('.', ',') : '', placeholder: '0' }),
      activo: h('input', { type: 'checkbox', id: 'f-activo', checked: d.activo !== false }),
      oculto: h('input', { type: 'checkbox', id: 'f-oculto', checked: d.oculto === true }),
      elab: h('input', { type: 'checkbox', id: 'f-elab', checked: d.es_elaborado === true })
    };
    if (nuevo) f.local.addEventListener('change', () => { const l = G.locales.find(x => x.id === f.local.value); if (l && (!f.codigo.value || /^[A-Z]{3}-?$/.test(f.codigo.value))) f.codigo.value = l.codigo + '-'; });
    if (nuevo && !f.codigo.value) { const l = G.locales.find(x => x.id === f.local.value); if (l) f.codigo.value = l.codigo + '-'; }
    // Presentación: "se compra por bolsa · cada una trae 5 kg". Si cambia la medida de algo ya cargado, se elige si convertir.
    const pres = h('p', { class: 'field-h pres-txt' });
    const conv = h('div', { class: 'pres-conv', hidden: true });
    let convertir = true;
    const leerPres = () => {
      const uc = f.uc.value.trim(), uu = f.uu.value;
      const igual = !uc || norm(uc) === norm(uu);
      if (igual) f.factor.value = '1';
      f.factor.disabled = igual;
      return { unidad_compra: uc || uu || null, unidad_uso: uu || null, factor_conversion: igual ? 1 : parseNum(f.factor.value) };
    };
    const pintarPres = () => {
      const n = leerPres(); const fac = n.factor_conversion;
      const rec = medidaReceta(n);
      pres.textContent = !n.unidad_uso ? '' : n.factor_conversion === 1 && norm(n.unidad_compra || '') === norm(n.unidad_uso)
        ? `Se compra y se cuenta por ${n.unidad_uso}.${rec.mult > 1 ? ` En las recetas se carga en ${rec.u}.` : ''}`
        : fac > 0 ? `1 ${n.unidad_compra} = ${fmtNum(fac, 3)} ${n.unidad_uso}. Se pide por ${plural(n.unidad_compra, 2)}; el stock se ve en ${plural(n.unidad_compra, 2)} y ${n.unidad_uso}${rec.mult > 1 ? ` y en las recetas se carga en ${rec.u}` : ''}.` : '';
      const esc = !nuevo && fac > 0 ? escalaPresentacion(d, n) : 1;
      conv.hidden = esc === 1;
      if (esc === 1) return;
      const opc = (v, t, sub) => h('button', { class: 'pres-op' + (convertir === v ? ' is-on' : ''), type: 'button', 'aria-pressed': convertir === v ? 'true' : 'false', on: { click: () => { convertir = v; pintarPres(); } } },
        h('b', { text: t }), h('span', { text: sub }));
      conv.replaceChildren(h('p', { class: 'pres-conv-t', text: `Lo que ya está cargado (stock, recetas, cantidad ideal) está en ${plural(d.unidad_uso || 'unidad', 2)}.` }),
        opc(true, 'Convertir lo cargado', `1 ${d.unidad_uso} pasa a ${fmtNum(esc, 4)} ${n.unidad_uso}`),
        opc(false, 'Dejar los números como están', `Ya estaban pensados en ${n.unidad_uso}`));
    };
    for (const x of [f.uc, f.factor]) x.addEventListener('input', pintarPres);
    f.uu.addEventListener('change', pintarPres);
    pintarPres();
    const cats = [...new Set([...G.prods.values()].map(x => x.categoria).filter(Boolean))].sort(porTexto);
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: nuevo ? 'Crear producto' : 'Guardar cambios' });
    const form = h('div', { class: 'form' },
      h('datalist', { id: 'dl-cat' }, cats.map(c => h('option', { value: c }))),
      campo('Código', f.codigo), campo('Nombre', f.nombre), campo('Local', f.local), campo('Categoría', f.categoria),
      h('div', { class: 'dos' }, campo('Se compra por', f.uc, 'Bolsa, caja, kg…'), campo('Se mide en', f.uu, 'Para stock y recetas')),
      campo('Cada una trae', f.factor, 'Ej.: la bolsa de papas trae 5 (kg).'), pres, conv,
      campo('Proveedor', f.prov), campo('Cantidad ideal en el local', f.ideal, 'Sirve para sugerir el pedido.'),
      campo('Costo actual ($)', f.costo),
      h('label', { class: 'check' }, f.elab, h('span', { text: 'Se elabora en el local (tiene receta)' })),
      hayColumnaOculto() ? h('label', { class: 'check' }, f.oculto, h('span', { text: 'Oculto en Pedir: aparece solo al buscarlo' })) : null,
      h('label', { class: 'check' }, f.activo, h('span', { text: 'Activo' })), err, btn);
    const { cerrar } = hoja(nuevo ? 'Nuevo producto' : 'Editar producto', form);
    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const np = leerPres(); const factor = np.factor_conversion;
      if (!f.codigo.value.trim() || !f.nombre.value.trim()) return err.textContent = 'Completá código y nombre.';
      if (factor === null || factor <= 0) return err.textContent = 'Poné cuánto trae cada una (mayor a cero).';
      const escala = !nuevo && convertir ? escalaPresentacion(d, np) : 1;
      const datos = {
        codigo: f.codigo.value.trim().toUpperCase(), nombre: f.nombre.value.trim(), local_id: f.local.value, categoria: f.categoria.value.trim() || null,
        ...np,
        proveedor_id: f.prov.value || null, par: parseNum(f.ideal.value), es_elaborado: f.elab.checked, activo: f.activo.checked
      };
      if (hayColumnaOculto()) datos.oculto = f.oculto.checked;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        // Con conversión, el servidor pasa stock, recetas y cantidad ideal a la medida nueva.
        if (escala !== 1) {
          await cambiarPresentacion(p.id, np.unidad_compra, np.unidad_uso, factor, escala);
          delete datos.par;
          if (p.par !== null && p.par !== undefined) datos.par = Math.round(Number(p.par) * escala * 1000) / 1000;
          const k = p.local_id + '|' + p.id;
          if (G.stock && G.stock.has(k)) G.stock.set(k, G.stock.get(k) * escala);
        }
        const id = await guardarProducto(p ? p.id : null, datos);
        const costo = parseNum(f.costo.value);
        const previo = p && G.precios.has(p.id) ? G.precios.get(p.id) : null;
        if (costo !== null && costo !== previo) { await guardarPrecio(id, datos.proveedor_id, costo); refrescarPrecio(id, costo); }
        G.prods.set(id, { ...(p || {}), ...datos, id });
        toast(nuevo ? 'Producto creado' : 'Cambios guardados', 'ok');
        cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = nuevo ? 'Crear producto' : 'Guardar cambios'; }
    });
    f.nombre.focus();
  }

  function pintar() {
    const t = tokens(q);
    const vis = [...G.prods.values()].filter(p => (localF === 'todos' || p.local_id === localF) && (vistaF === 'todos' || (vistaF === 'ocultos') === (p.oculto === true)) && coincide(p.nombre + ' ' + p.codigo, t))
      .sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 150);
    if (!vis.length) { lista.replaceChildren(vacio('No hay productos', 'Probá con otra búsqueda o creá uno nuevo.')); return; }
    lista.replaceChildren(...vis.map(p => {
      const prov = G.provs.get(p.proveedor_id);
      return h('button', { class: 'prod prod-cat' + (p.activo === false ? ' is-off' : ''), type: 'button', on: { click: () => editar(p) }, 'aria-label': `Editar ${p.nombre}` },
        h('span', { class: 'prod-n', text: p.nombre }),
        h('span', { class: 'prod-m' }, h('span', { class: 'prod-u num', text: p.codigo }), h('span', { text: prov ? prov.nombre : 'Sin proveedor' }), p.oculto ? h('span', { class: 'tag-oculto', text: 'Oculto' }) : null),
        h('span', { class: 'prod-m' }, h('span', { text: p.unidad_compra || '—' }), G.precios.has(p.id) ? h('b', { class: 'num', text: fmtMoney(G.precios.get(p.id)) }) : h('span', { class: 'mute', text: 'Sin costo' })));
    }));
  }

  await cargarG(['prods', 'provs', 'locales', 'precios'], () => { if (ctx.alive() && lista.isConnected) pintar(); });
  if (!ctx.alive()) return;
  const locSel = h('select', { class: 'input', 'aria-label': 'Local', on: { change: (e) => { localF = e.target.value; pintar(); } } },
    h('option', { value: 'todos', text: 'Todos los locales' }), G.locales.map(l => h('option', { value: l.id, text: l.nombre })));
  const vistaSel = h('select', { class: 'input', 'aria-label': 'Qué mostrar', hidden: !hayColumnaOculto(), on: { change: (e) => { vistaF = e.target.value; pintar(); } } },
    h('option', { value: 'todos', text: 'A la vista y ocultos' }), h('option', { value: 'vista', text: 'Solo a la vista' }), h('option', { value: 'ocultos', text: 'Solo ocultos' }));
  const buscar = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar por nombre o código', 'aria-label': 'Buscar producto', autocomplete: 'off', on: { input: debounce((e) => { q = e.target.value; pintar(); }, 120) } });
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'catalogo'),
    h('div', { class: 'toolbar toolbar-row' }, buscar, locSel, vistaSel, h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => editar(null) } }, icon('mas', 18), h('span', { text: 'Nuevo producto' }))),
    lista);
  pintar();
}
