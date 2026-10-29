// Gerencia · Cocina · Recetas: insumos y rinde de cada plato y elaborado; platos vendidos sin receta.
import { mount, h, tokens, coincide, norm, fmtNum, fmtMoney, parseNum, porTexto, esCarta, medidaReceta, esBulto, factorDe } from './util.js';
import { cargarRecetas, guardarReceta, platosSinReceta, guardarProducto, venderTalCual, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, subnav, icon, banner, SUBNAV_COCINA } from './ui.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Recetas' }), h('p', { class: 'sub', text: 'Qué lleva cada plato y cada elaborado' }));
  mount(root, cab, subnav(SUBNAV_COCINA, 'recetas'), esqueleto(4));
  await cargarG(['prods', 'provs', 'locales', 'precios'], () => {});
  if (!ctx.alive()) return;

  let recetas = new Map(); let sinReceta = []; let filtro = 'todos'; let q = '';
  const chips = chipsLocal(() => cargarLocal());
  const zona = h('div', {});

  async function cargarLocal() {
    try { recetas = new Map((await cargarRecetas()).map(r => [r.producto_id, r])); } catch (e) { toast(mensajeError(e), 'error'); }
    try { sinReceta = await platosSinReceta(chips.get()); } catch (_e) { sinReceta = []; }
    pintar();
  }

  const UNIDADES = [['kg', 'Kilo'], ['unidad', 'Unidad'], ['litro', 'Litro']];
  const unidadSimple = (u) => /^(l|lt|litro|litros|cc|ml)$/i.test(u || '') ? 'litro' : /^(kg|kilo|kilos|g|gr|gramos)$/i.test(u || '') ? 'kg' : 'unidad';
  const mayus = (t) => t ? t[0].toUpperCase() + t.slice(1) : t;
  const localDe = (p) => G.locales.find(l => l.id === p.local_id) || {};
  let nombreLocal = '';
  // Siguiente código libre del local (UMO-128…); n salta códigos si otro ya lo tomó.
  function proximoCodigo(n) {
    const pre = localDe(editando).codigo || 'INS';
    const re = new RegExp('^' + pre + '-(\\d+)$');
    let max = 0;
    for (const x of G.prods.values()) { const m = re.exec(x.codigo || ''); if (m) max = Math.max(max, Number(m[1])); }
    return `${pre}-${String(max + 1 + n).padStart(3, '0')}`;
  }
  let editando = null;

  const nItems = (p) => { const r = recetas.get(p.id); return r ? r.receta_items.length : 0; };
  const unidad = (p) => p.unidad_uso || 'unidad';

  function costo(r) {
    let t = 0, hay = false;
    for (const it of r.items) {
      const ins = G.prods.get(it.insumo_id);
      if (ins && G.precios.has(it.insumo_id)) { t += it.cantidad * G.precios.get(it.insumo_id) / (Number(ins.factor_conversion) || 1); hay = true; }
    }
    return hay ? t / r.rinde : null;
  }

  function editar(p) {
    editando = p; nombreLocal = localDe(p).nombre || 'este local';
    const previa = recetas.get(p.id);
    const r = { rinde: previa ? Number(previa.rinde) : 1, items: previa ? previa.receta_items.map(i => ({ insumo_id: i.insumo_id, cantidad: Number(i.cantidad) })) : [] };
    const cuerpo = h('div', { class: 'form' });
    const { cerrar } = hoja(`Receta · ${p.nombre}`, cuerpo);

    function vistaEditor() {
      const inRinde = h('input', { class: 'input num', id: 'r-rinde', type: 'text', inputmode: 'decimal', value: fmtNum(r.rinde, 3), 'aria-label': 'Rinde', on: { change: (e) => { const n = parseNum(e.target.value); r.rinde = n && n > 0 ? n : r.rinde; e.target.value = fmtNum(r.rinde, 3); vistaEditor(); } } });
      const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
      const filas = r.items.map((it, i) => {
        const ins = G.prods.get(it.insumo_id) || { nombre: 'Insumo' };
        // Lo que se mide en kilos o litros se escribe en gramos o cc; se guarda en la medida del insumo (200 g → 0,2 kg).
        const m = medidaReceta(ins); const dec = m.mult > 1 ? 1 : 4;
        const inp = h('input', { class: 'input num inp-num', type: 'text', inputmode: 'decimal', value: fmtNum(it.cantidad * m.mult, dec), 'aria-label': `Cantidad de ${ins.nombre} en ${m.u}`, on: { change: (e) => { const n = parseNum(e.target.value); if (n && n > 0) it.cantidad = Math.round(n / m.mult * 1e4) / 1e4; e.target.value = fmtNum(it.cantidad * m.mult, dec); verG(); } } });
        const gramos = h('span', { class: 'mute ins-g' });
        // Si se compra por bulto: "bolsa de 5 kg · rinde 25 platos".
        const verG = () => { gramos.textContent = esBulto(ins) ? `${ins.unidad_compra} de ${fmtNum(factorDe(ins), 3)} ${ins.unidad_uso}${it.cantidad > 0 ? ` · alcanza para ${fmtNum(Math.floor(factorDe(ins) / it.cantidad * r.rinde), 0)}` : ''}` : ''; };
        verG();
        return h('div', { class: 'ins' }, h('span', { class: 'ins-n' }, ins.nombre, gramos),
          h('div', { class: 'ins-c' }, inp, h('span', { class: 'mute', text: m.u }),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Quitar ${ins.nombre}`, on: { click: () => { r.items.splice(i, 1); vistaEditor(); } } }, icon('cerrar', 18))));
      });
      const c = costo(r);
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Guardar receta' });
      btn.addEventListener('click', async () => {
        err.replaceChildren();
        if (!r.items.length) return err.append(document.createTextNode('Agregá al menos un insumo.'));
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          await guardarReceta(p.id, r.rinde, r.items.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })), null);
          recetas.set(p.id, { ...(previa || {}), estimada: false, producto_id: p.id, rinde: r.rinde, receta_items: r.items.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })) });
          sinReceta = sinReceta.filter(x => x.producto_id !== p.id);
          toast('Receta guardada', 'ok'); cerrar(); pintar();
        } catch (e) { err.replaceChildren(document.createTextNode(mensajeError(e))); btn.disabled = false; btn.textContent = 'Guardar receta'; }
      });
      cuerpo.replaceChildren(...[
        previa && previa.estimada ? banner('Receta estándar estimada con pesos típicos. Ajustá las cantidades a lo que sirve el local y guardá: deja de ser estimada.', 'warn') : null,
        campo(`Rinde (${unidad(p)})`, inRinde, 'Cuántas unidades salen con estas cantidades.'),
        h('div', { class: 'ins-lista' }, ...(filas.length ? filas : [h('p', { class: 'mute centro', text: 'Todavía no tiene insumos.' })])),
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'Agregar insumo', on: { click: vistaPicker } }),
        c !== null ? h('p', { class: 'sub', text: `Costo estimado por ${unidad(p)}: ${fmtMoney(c)}` }) : null, err, btn,
        esCarta(p) ? h('div', { class: 'tal-cual' },
          h('p', { class: 'sub', text: '¿No se cocina? Pulseras, aguas, gaseosas: cada venta descuenta 1 del stock.' }),
          h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Se vende tal cual', on: { click: vistaTalCual } })) : null].filter(Boolean));
    }

    // El plato en realidad es un producto que se vende tal cual: sus ventas pasan a descontar un producto del stock.
    function vistaTalCual() {
      let t = (p.nombre.split(/[^\p{L}\p{N}]+/u).find(w => w.length >= 3) || '');   // PULSERA-PASE → busca «PULSERA»
      const lista = h('div', { class: 'lista lista-sheet' });
      const pintarOpc = () => {
        const tk = tokens(t);
        const vis = [...G.prods.values()].filter(x => x.local_id === p.local_id && !x.es_elaborado && !esCarta(x) && coincide(x.nombre + ' ' + x.codigo, tk))
          .sort((a, b) => (b.activo !== false) - (a.activo !== false) || porTexto(a.nombre, b.nombre)).slice(0, 40);
        lista.replaceChildren(...(vis.length ? vis.map(x => h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Descontar ${x.nombre}`, on: { click: () => confirmarTalCual(x) } },
          h('span', { class: 'prod-n', text: x.nombre }), h('span', { class: 'prod-m' }, h('span', { class: 'num', text: x.codigo }), h('span', { text: x.categoria || '' }), h('span', { text: x.unidad_uso || '' })))) : [vacio(`No está en el catálogo de ${nombreLocal}`, 'Probá con otra palabra, o convertí el plato en producto con stock.')]));
      };
      const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto del stock', 'aria-label': 'Buscar producto del stock', autocomplete: 'off', value: t, on: { input: (e) => { t = e.target.value; pintarOpc(); } } });
      cuerpo.replaceChildren(
        h('p', { class: 'sub', text: `¿Qué producto del stock descuenta cada venta de ${p.nombre}?` }), buscador, lista,
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'No está: que este mismo tenga stock', on: { click: () => confirmarTalCual(null) } }),
        h('button', { class: 'btn btn-text', type: 'button', text: 'Volver a la receta', on: { click: vistaEditor } }));
      pintarOpc(); setTimeout(() => buscador.focus(), 50);
    }

    function confirmarTalCual(x) {
      const inCpv = h('input', { class: 'input num', id: 'tc-cpv', type: 'text', inputmode: 'decimal', value: '1', 'aria-label': 'Cantidad que descuenta cada venta' });
      const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Confirmar' });
      const vendidos = (sinReceta.find(s => s.producto_id === p.id) || {}).vendidos;
      cuerpo.replaceChildren(
        h('p', { class: 'sub', text: x ? `Cada venta de ${p.nombre} va a descontar ${x.nombre}. El plato se oculta.` : `${p.nombre} deja de ser plato: pasa a tener stock propio, se cuenta en Stock y se pide en Pedir.` }),
        x ? campo(`Cuánto descuenta cada venta (${x.unidad_uso || 'unidad'})`, inCpv, 'Casi siempre es 1.') : null,
        vendidos ? banner(`Las ${fmtNum(vendidos, 3)} ventas ya subidas también se descuentan.`, 'info') : null,
        err, btn, h('button', { class: 'btn btn-text', type: 'button', text: 'Elegir otro', on: { click: vistaTalCual } }));
      btn.addEventListener('click', async () => {
        const n = x ? parseNum(inCpv.value) : 1;
        if (!(n > 0)) return err.replaceChildren(document.createTextNode('La cantidad tiene que ser mayor a cero.'));
        btn.disabled = true; btn.textContent = 'Guardando…';
        try {
          await venderTalCual(p.id, x ? x.id : null, n);
          if (x) { G.prods.set(p.id, { ...p, activo: false }); G.prods.set(x.id, { ...x, activo: true }); }
          else G.prods.set(p.id, { ...p, es_elaborado: false, categoria: 'Reventa', unidad_uso: p.unidad_uso === 'porción' ? 'unidad' : p.unidad_uso, unidad_compra: p.unidad_compra && p.unidad_compra !== 'porción' ? p.unidad_compra : 'unidad', activo: true });
          recetas.delete(p.id);
          sinReceta = sinReceta.filter(s => s.producto_id !== p.id);
          toast(x ? `Listo: ${p.nombre} descuenta ${x.nombre}` : `Listo: ${p.nombre} ya tiene stock`, 'ok'); cerrar(); pintar();
        } catch (e) { err.replaceChildren(document.createTextNode(mensajeError(e))); btn.disabled = false; btn.textContent = 'Confirmar'; }
      });
    }

    function vistaPicker() {
      let t = '';
      const lista = h('div', { class: 'lista lista-sheet' });
      const usados = new Set(r.items.map(i => i.insumo_id));
      const crear = h('button', { class: 'btn btn-ghost btn-block', type: 'button', on: { click: () => vistaNuevo(t) } });
      const pintarOpc = () => {
        const tk = tokens(t);
        const vis = [...G.prods.values()].filter(x => x.local_id === p.local_id && x.id !== p.id && x.activo !== false && !esCarta(x) && !usados.has(x.id) && coincide(x.nombre + ' ' + x.codigo, tk))
          .sort((a, b) => porTexto(a.nombre, b.nombre)).slice(0, 40);
        lista.replaceChildren(...(vis.length ? vis.map(x => h('button', { class: 'prod prod-cat', type: 'button', 'aria-label': `Agregar ${x.nombre}`, on: { click: () => { r.items.push({ insumo_id: x.id, cantidad: medidaReceta(x).mult > 1 ? 0.1 : 1 }); vistaEditor(); } } },
          h('span', { class: 'prod-n', text: x.nombre }), h('span', { class: 'prod-m' }, h('span', { text: x.categoria || '' }), h('span', { text: esBulto(x) ? `${x.unidad_compra} de ${fmtNum(factorDe(x), 3)} ${x.unidad_uso}` : x.unidad_uso || '' })))) : [vacio(`No está en el catálogo de ${nombreLocal}`, 'Crealo acá: queda en el catálogo y se suma a la receta.')]));
        crear.hidden = !t.trim();
        crear.replaceChildren(icon('mas', 18), h('span', { text: `Crear «${t.trim()}» como insumo nuevo` }));
      };
      const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar insumo', 'aria-label': 'Buscar insumo', autocomplete: 'off', on: { input: (e) => { t = e.target.value; pintarOpc(); } } });
      cuerpo.replaceChildren(buscador, lista, crear, h('button', { class: 'btn btn-text', type: 'button', text: 'Volver a la receta', on: { click: vistaEditor } }));
      pintarOpc(); setTimeout(() => buscador.focus(), 50);
    }

    // Alta de un insumo que todavía no está en el catálogo del local: se crea y se suma a la receta en un paso.
    function vistaNuevo(texto) {
      const tk = tokens(texto);
      const igual = [...G.prods.values()].find(x => x.local_id !== p.local_id && !esCarta(x) && !x.es_elaborado && coincide(x.nombre, tk));
      const base = igual ? { nombre: igual.nombre, unidad: unidadSimple(igual.unidad_uso), categoria: igual.categoria || '', proveedor_id: igual.proveedor_id || '',
        bulto: esBulto(igual) && unidadSimple(igual.unidad_uso) === igual.unidad_uso ? igual.unidad_compra : '', cont: factorDe(igual) }
        : { nombre: mayus(texto.trim()), unidad: 'kg', categoria: '', proveedor_id: '', bulto: '', cont: 1 };
      let unidadSel = base.unidad;
      const inNombre = h('input', { class: 'input', id: 'n-nombre', value: base.nombre, autocomplete: 'off' });
      const seg = h('div', { class: 'seg seg-form', role: 'group', 'aria-label': 'Unidad' });
      const inCant = h('input', { class: 'input num', id: 'n-cant', type: 'text', inputmode: 'decimal', placeholder: '0', autocomplete: 'off' });
      const ayudaCant = h('span', { class: 'field-h' });
      const labCant = h('span', { class: 'field-l' });
      // Bulto: "lo compramos por bolsa · cada una trae 5 kg". Vacío = se compra por kilo, litro o unidad.
      const inBulto = h('input', { class: 'input', id: 'n-bulto', value: base.bulto, placeholder: 'bolsa, caja… (vacío: suelto)', autocomplete: 'off' });
      const inCont = h('input', { class: 'input num', id: 'n-cont', type: 'text', inputmode: 'decimal', value: base.bulto ? fmtNum(base.cont, 3) : '', placeholder: '5', autocomplete: 'off' });
      const labCont = h('span', { class: 'field-l' });
      const pintarSeg = () => {
        seg.replaceChildren(...UNIDADES.map(([v, txt]) => h('button', { class: 'seg-b' + (unidadSel === v ? ' is-on' : ''), type: 'button', text: txt, 'aria-pressed': unidadSel === v ? 'true' : 'false', on: { click: () => { unidadSel = v; pintarSeg(); } } })));
        const m = medidaReceta({ unidad_uso: unidadSel });
        labCant.textContent = `Cuánto lleva la receta (${m.u})`;
        ayudaCant.textContent = unidadSel === 'kg' ? 'En gramos: 200 = 200 g.' : unidadSel === 'litro' ? 'En cc: 250 = 250 cc.' : 'En unidades: 2, 0,5…';
        labCont.textContent = `Cada ${inBulto.value.trim() || 'una'} trae (${unidadSel})`;
      };
      inBulto.addEventListener('input', pintarSeg);
      pintarSeg();
      const cats = [...new Set([...G.prods.values()].filter(x => !esCarta(x)).map(x => x.categoria).filter(Boolean))].sort(porTexto);
      const inCat = h('input', { class: 'input', id: 'n-cat', value: base.categoria, list: 'dl-ncat', autocomplete: 'off', placeholder: 'Verdulería, Almacén…' });
      const selProv = h('select', { class: 'input', id: 'n-prov' }, [['', 'Sin proveedor'], ...[...G.provs.values()].sort((a, b) => porTexto(a.nombre, b.nombre)).map(x => [x.id, x.nombre])].map(([v, txt]) => h('option', { value: v, text: txt })));
      selProv.value = base.proveedor_id;
      const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Crear y sumar a la receta' });
      btn.addEventListener('click', async () => {
        err.replaceChildren();
        const nombre = inNombre.value.trim();
        const cant = parseNum(inCant.value);
        const bulto = inBulto.value.trim(); const cont = parseNum(inCont.value);
        if (bulto && norm(bulto) !== norm(unidadSel) && !(cont > 0)) return err.append(document.createTextNode(`Poné cuánto trae cada ${bulto} (en ${unidadSel}).`));
        const conBulto = !!bulto && norm(bulto) !== norm(unidadSel);
        if (!nombre) return err.append(document.createTextNode('Poné el nombre del insumo.'));
        if (!cant || cant <= 0) return err.append(document.createTextNode('Poné cuánto lleva la receta.'));
        const repetido = [...G.prods.values()].find(x => x.local_id === p.local_id && norm(x.nombre) === norm(nombre));
        if (repetido) return err.append(document.createTextNode(`«${repetido.nombre}» ya está en el catálogo de ${nombreLocal}. Buscalo y agregalo.`));
        btn.disabled = true; btn.textContent = 'Creando…';
        const datos = { nombre, local_id: p.local_id, categoria: inCat.value.trim() || null, unidad_compra: conBulto ? bulto : unidadSel, unidad_uso: unidadSel, factor_conversion: conBulto ? cont : 1, proveedor_id: selProv.value || null, es_elaborado: false, activo: true };
        try {
          let id = null;
          for (let n = 0; !id; n++) {
            datos.codigo = proximoCodigo(n);
            try { id = await guardarProducto(null, datos); } catch (e) { if (n < 4 && /duplic|unique|23505/i.test(String(e && (e.code || e.message || e)))) continue; throw e; }
          }
          G.prods.set(id, { ...datos, id });
          r.items.push({ insumo_id: id, cantidad: Math.round(cant / medidaReceta(datos).mult * 1e4) / 1e4 });
          toast(`${nombre} quedó en el catálogo de ${nombreLocal}`, 'ok');
          vistaEditor();
        } catch (e) { err.replaceChildren(document.createTextNode(mensajeError(e))); btn.disabled = false; btn.textContent = 'Crear y sumar a la receta'; }
      });
      cuerpo.replaceChildren(...[
        h('p', { class: 'sub', text: `Insumo nuevo para el catálogo de ${nombreLocal}.` }),
        igual ? banner(`Copiamos los datos de «${igual.nombre}» de ${(G.locales.find(l => l.id === igual.local_id) || {}).nombre || 'otro local'}. Revisalos antes de crear.`, 'info') : null,
        h('datalist', { id: 'dl-ncat' }, cats.map(c => h('option', { value: c }))),
        campo('Nombre', inNombre),
        h('div', { class: 'field' }, h('span', { class: 'field-l', text: 'Se mide en' }), seg),
        h('label', { class: 'field' }, labCant, inCant, ayudaCant),
        h('div', { class: 'dos' }, campo('Lo compramos por', inBulto), h('label', { class: 'field' }, labCont, inCont)),
        campo('Categoría', inCat), campo('Proveedor (opcional)', selProv), err, btn,
        h('button', { class: 'btn btn-text', type: 'button', text: 'Volver a buscar', on: { click: vistaPicker } })].filter(Boolean));
      setTimeout(() => inCant.focus(), 50);
    }
    vistaEditor();
  }

  function tarjeta(p) {
    const n = nItems(p); const r = recetas.get(p.id);
    return h('button', { class: 'prod prod-cat', type: 'button', 'data-id': p.id, 'aria-label': `Receta de ${p.nombre}`, on: { click: () => editar(p) } },
      h('span', { class: 'prod-n', text: p.nombre }),
      h('span', { class: 'prod-m' }, h('span', { text: esCarta(p) ? 'Plato' : 'Elaborado' }), r && r.estimada ? h('span', { class: 'chip-aviso', text: 'Estimada' }) : null, n ? h('span', { text: `${n} ${n === 1 ? 'insumo' : 'insumos'} · rinde ${fmtNum(r.rinde, 3)}` }) : h('span', { class: 'chip-aviso', text: 'Sin receta' })));
  }

  function pintar() {
    if (!ctx.alive()) return;
    const tk = norm(q).split(' ').filter(Boolean);
    let vis = [...G.prods.values()].filter(p => p.local_id === chips.get() && p.es_elaborado && p.activo !== false && tk.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)));
    if (filtro === 'platos') vis = vis.filter(esCarta); else if (filtro === 'elaborados') vis = vis.filter(p => !esCarta(p)); else if (filtro === 'sin') vis = vis.filter(p => !nItems(p)); else if (filtro === 'estimadas') vis = vis.filter(p => (recetas.get(p.id) || {}).estimada);
    vis.sort((a, b) => porTexto(a.nombre, b.nombre));
    const filtros = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar' }, [['todos', 'Todos'], ['platos', 'Platos'], ['elaborados', 'Elaborados'], ['sin', 'Sin receta'], ['estimadas', 'Estimadas']].map(([id, t]) =>
      h('button', { class: 'chip' + (filtro === id ? ' is-on' : ''), type: 'button', text: t, 'aria-pressed': filtro === id ? 'true' : 'false', on: { click: () => { filtro = id; pintar(); } } })));
    const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar plato o elaborado', 'aria-label': 'Buscar plato o elaborado', autocomplete: 'off', value: q, on: { input: (e) => { q = e.target.value; pintarLista(); } } });
    const lista = h('div', { class: 'lista', id: 'lista-rec' });
    const pintarLista = () => {
      const tk2 = norm(q).split(' ').filter(Boolean);
      const v2 = vis.filter(p => tk2.every(k => norm(p.nombre + ' ' + p.codigo).includes(k)));
      lista.replaceChildren(...(v2.length ? v2.map(tarjeta) : [vacio('No hay platos ni elaborados', 'Los platos se crean al importar las ventas de Núcleo; los elaborados, en Catálogo.')]));
    };
    mount(zona,
      sinReceta.length ? h('section', { class: 'bloque' }, h('h2', { class: 'bloque-t', text: `Vendidos sin receta · ${sinReceta.length}` }),
        h('p', { class: 'sub', text: 'Mientras no tengan receta, sus ventas no descuentan insumos. Si se venden tal cual (pulseras, aguas, gaseosas), abrilos y tocá «Se vende tal cual».' }),
        h('ul', { class: 'barras sr' }, sinReceta.slice(0, 12).map(s => h('li', { class: 'bfila' },
          h('button', { class: 'sr-b', type: 'button', 'aria-label': `Cargar receta de ${s.nombre}`, on: { click: () => { const p = G.prods.get(s.producto_id); if (p) editar(p); } } },
            h('span', { class: 'bfila-k', text: s.nombre }), h('b', { class: 'num', text: `${fmtNum(s.vendidos, 3)} vendidos` })))))) : null,
      h('div', { class: 'toolbar' }, filtros, buscador), lista);
    pintarLista();
  }

  mount(root, cab, subnav(SUBNAV_COCINA, 'recetas'), h('div', { class: 'toolbar' }, chips.el), zona);
  await cargarLocal();
}
