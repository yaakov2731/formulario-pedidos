// Elaborados del local (encargado y gerencia, dentro de Stock). Dos anotaciones con menús desplegables:
// "Elaboré": qué salió y cuánto (25 milanesas) y qué se usó de verdad (5 kg de nalga feteada, 500 g de pan rallado).
//   Suma lo elaborado al stock y descuenta lo usado. Se completa con lo de la última vez (o la receta, en gerencia).
// "Usé hoy": lo que se saca para el turno al empezar el día (2 kg de papas). Solo descuenta.
// Abajo, lo anotado hoy y ayer, con quién lo anotó; lo de hoy se puede borrar si se cargó mal. No muestra plata.
import { mount, h, norm, fmtNum, parseNum, porTexto, esCarta, lsGet, groupBy } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarLocales, cargarRecetas, registrarElaboracion, borrarElaboracion, elaboracionesDesde, mensajeError } from './api.js';
import { G, cargarG, chipsLocal } from './datos.js';
import { esqueleto, vacio, toast, banner, icon, subnav, SUBNAV_STOCK } from './ui.js';

// Unidades que se pueden cargar en otra escala (se guarda siempre en la unidad de uso del producto).
const ESCALAS = [
  [['kg', 'kgs', 'kilo', 'kilos'], [['kg', 1], ['g', 0.001]]],
  [['g', 'gr', 'grs', 'gramo', 'gramos'], [['g', 1], ['kg', 1000]]],
  [['l', 'lt', 'lts', 'litro', 'litros'], [['l', 1], ['ml', 0.001]]],
  [['ml', 'cc'], [['ml', 1], ['l', 1000]]]
];
export function escalasDe(unidad) {
  const u = norm(unidad);
  const e = ESCALAS.find(([nombres]) => nombres.includes(u));
  if (!e) return [[unidad || 'unid.', 1]];
  return e[1].map(([n, f], i) => [i === 0 ? unidad : n, f]);
}
// Cantidad cómoda de leer: 0,5 kg → 500 g; 1500 g → 1,5 kg.
export function legible(cant, unidad) {
  const u = norm(unidad); const n = Number(cant) || 0;
  if (['kg', 'kgs', 'kilo', 'kilos'].includes(u) && Math.abs(n) < 1) return `${fmtNum(n * 1000, 0)} g`;
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(u) && Math.abs(n) >= 1000) return `${fmtNum(n / 1000, 3)} kg`;
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u) && Math.abs(n) < 1) return `${fmtNum(n * 1000, 0)} ml`;
  if (['ml', 'cc'].includes(u) && Math.abs(n) >= 1000) return `${fmtNum(n / 1000, 3)} l`;
  if (!unidad || /^u(n|nid|nidad|nidades)?\.?$/.test(u)) return `${fmtNum(n, 3) || 0}`;
  return `${fmtNum(n, 3) || 0} ${unidad}`;
}

const inicioDia = (dias = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - dias); return d; };
const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

export async function render(root, ctx) {
  const ger = ctx.rol === 'gerencia';
  const quien = () => (ger ? (ctx.perfil.nombre || 'Gerencia') : (lsGet('nombre') || ctx.nombreGuardado || ''));
  const sub = h('p', { class: 'sub', text: 'Lo que preparás y lo que sacás para el turno' });
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Elaborados' }), sub);
  const nav = ger ? subnav(SUBNAV_STOCK, 'elaborados') : null;
  mount(root, cab, nav, esqueleto(4));

  // Datos del local: catálogo, stock y recetas (solo gerencia las lee).
  let prods = new Map(); let stock = new Map(); let recetas = new Map(); let historial = []; let sinSQL = false;
  let localId = ctx.perfil.local_id; let nombreLocal = '';
  let chips = null;
  if (ger) {
    await cargarG(['prods', 'locales', 'stock'], () => {}).catch(() => {});
    if (!ctx.alive()) return;
    chips = chipsLocal(() => { localId = chips.get(); cargarLocal(); });
    localId = chips.get();
  }

  let modo = 'elaboracion';
  const seg = h('div', { class: 'seg el-seg', role: 'tablist', 'aria-label': 'Qué anotás' });
  const form = h('section', { class: 'bloque el-form', 'aria-live': 'polite' });
  const lista = h('section', { class: 'el-hist' });
  const avisoSQL = h('div', {});

  const prodsLocal = () => [...prods.values()].filter(p => p.local_id === localId && p.activo !== false && !esCarta(p) && (!p.oculto || (stock.get(p.id) || 0) !== 0));
  const u = (p) => (p && p.unidad_uso) || '';

  async function cargarLocal() {
    form.replaceChildren(esqueleto(2)); lista.replaceChildren();
    if (ger) {
      prods = G.prods; stock = new Map([...G.stock].filter(([k]) => k.startsWith(localId + '|')).map(([k, v]) => [k.split('|')[1], v]));
      const l = G.locales.find(x => x.id === localId); nombreLocal = l ? l.nombre : '';
      try { recetas = new Map((await cargarRecetas()).filter(r => r.receta_items.length).map(r => [r.producto_id, r])); } catch (_e) { recetas = new Map(); }
    } else {
      const lid = localId;
      await Promise.allSettled([
        swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = new Map(d.map(p => [p.id, p])); }),
        swr('stk:' + lid, () => cargarStock(lid), (d) => { stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); }),
        swr('locales', cargarLocales, (d) => { const l = (d || []).find(x => x.id === lid); nombreLocal = l ? l.nombre : ''; })
      ]);
    }
    if (!ctx.alive()) return;
    sub.textContent = (nombreLocal ? nombreLocal + ' · ' : '') + 'lo que preparás y lo que usás';
    await cargarHistorial();
    pintarSeg(); pintarForm();
  }

  async function cargarHistorial() {
    try { historial = await elaboracionesDesde(localId, inicioDia(1).toISOString()); sinSQL = false; }
    catch (e) { historial = []; sinSQL = !!(e && (e.code === '42703' || /tipo|items|encargado/.test(e.message || ''))); }
    avisoSQL.replaceChildren(...(sinSQL ? [banner(ger ? 'Falta pegar el SQL de Elaborados (0014) en Supabase para poder guardar.' : 'Todavía no está activado. Avisale a gerencia.', 'warn')] : []));
    pintarHistorial();
  }

  function pintarSeg() {
    seg.replaceChildren(...[['elaboracion', 'Elaboré'], ['uso', 'Usé hoy']].map(([id, t]) => h('button', {
      class: 'seg-b' + (modo === id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': modo === id ? 'true' : 'false', text: t, 'data-modo': id,
      on: { click: () => { if (modo === id) return; modo = id; pintarSeg(); pintarForm(); } } })));
  }

  // <select> de productos del local, agrupado: primero los elaborados, después por categoría.
  function selectProducto(etiqueta, valor, excluir, soloElaborados) {
    const todos = prodsLocal().filter(p => p.id !== excluir && (!soloElaborados || p.es_elaborado));
    const grupos = groupBy(todos.filter(p => !p.es_elaborado), p => p.categoria || 'Otros');
    const opt = (p) => h('option', { value: p.id, text: p.nombre + (u(p) ? ` (${u(p)})` : ''), selected: p.id === valor });
    const elab = todos.filter(p => p.es_elaborado).sort((a, b) => porTexto(a.nombre, b.nombre));
    return h('select', { class: 'input el-sel', 'aria-label': etiqueta },
      h('option', { value: '', text: etiqueta, selected: !valor, disabled: true }),
      elab.length ? h('optgroup', { label: soloElaborados ? 'Elaborados' : 'Elaborados del local' }, elab.map(opt)) : null,
      ...(soloElaborados ? [] : [...grupos.keys()].sort(porTexto).map(cat => h('optgroup', { label: cat }, grupos.get(cat).sort((a, b) => porTexto(a.nombre, b.nombre)).map(opt)))));
  }

  // Cantidad + unidad (kg/g, l/ml) para un producto. get() devuelve la cantidad en unidad de uso.
  function cantidadCon(prod, valorUso, etiqueta) {
    const escalas = escalasDe(u(prod));
    let esc = 0;
    if (valorUso && escalas.length > 1 && Math.abs(valorUso) < 1) esc = 1; // 0,5 kg se muestra como 500 g
    const inp = h('input', { class: 'input num el-cant', type: 'text', inputmode: 'decimal', placeholder: '0', 'aria-label': etiqueta,
      value: valorUso ? fmtNum(valorUso / escalas[esc][1], 3) : '' });
    const uni = escalas.length > 1
      ? h('select', { class: 'input el-uni', 'aria-label': 'Unidad' }, escalas.map(([n], i) => h('option', { value: String(i), text: n, selected: i === esc })))
      : h('span', { class: 'el-uni el-uni-fija', text: escalas[0][0] });
    if (uni.tagName === 'SELECT') uni.addEventListener('change', () => { esc = Number(uni.value); inp.dispatchEvent(new Event('input')); });
    return { el: h('div', { class: 'el-cant-row' }, inp, uni), inp, get: () => { const n = parseNum(inp.value); return n === null ? null : n * escalas[esc][1]; } };
  }

  // Fila de insumo: desplegable + cantidad + quitar. Debajo, cuánto queda según el sistema.
  function filaInsumo(cont, filas, excluir, ini = {}) {
    const f = { id: ini.insumo_id || '', cant: null };
    const el = h('div', { class: 'el-fila' });
    const pintar = (valor) => {
      const sel = selectProducto('Elegí el insumo', f.id, excluir(), false);
      const p = prods.get(f.id);
      f.cant = p ? cantidadCon(p, valor, `Cantidad de ${p.nombre}`) : null;
      const quedan = h('p', { class: 'el-quedan' });
      const verQuedan = () => {
        if (!p) { quedan.textContent = ''; return; }
        const hay = stock.get(p.id) || 0; const usa = f.cant.get() || 0;
        quedan.textContent = `Quedan ${legible(hay, u(p))}` + (usa > hay ? ' · no alcanza según el sistema' : '');
        quedan.classList.toggle('el-mal', usa > hay);
      };
      sel.addEventListener('change', () => { f.id = sel.value; pintar(f.cant ? f.cant.get() : null); });
      if (f.cant) f.cant.inp.addEventListener('input', verQuedan);
      const quitar = h('button', { class: 'icon-btn el-quitar', type: 'button', 'aria-label': 'Quitar insumo', on: { click: () => { filas.splice(filas.indexOf(f), 1); el.remove(); } } }, icon('cerrar', 18));
      mount(el, h('div', { class: 'el-fila-t' }, sel, quitar), f.cant ? f.cant.el : null, quedan);
      verQuedan();
    };
    pintar(ini.cantidad || null);
    f.repintarExcluir = () => pintar(f.cant ? f.cant.get() : null);
    filas.push(f); cont.append(el);
    return f;
  }

  function pintarForm() {
    if (!ctx.alive()) return;
    const hayProds = prodsLocal().length > 0;
    if (!hayProds) { form.replaceChildren(vacio('No hay productos en este local', 'Gerencia los carga en Catálogo.')); return; }
    const filas = []; const contFilas = h('div', { class: 'el-filas' });
    const inNota = h('input', { class: 'input el-nota', type: 'text', placeholder: modo === 'uso' ? 'Ej.: turno noche' : 'Ej.: para el fin de semana', 'aria-label': 'Nota', autocomplete: 'off' });
    const btnMas = h('button', { class: 'btn btn-ghost el-mas', type: 'button' }, icon('mas', 18), h('span', { text: modo === 'uso' ? 'Agregar otro insumo' : 'Agregar insumo' }));
    const pista = h('p', { class: 'el-pista' });
    const btn = h('button', { class: 'btn btn-primary btn-block el-guardar', type: 'button', text: modo === 'uso' ? 'Guardar uso del día' : 'Guardar elaboración' });
    let prodId = ''; let cantSalio = null;

    const excluir = () => prodId;
    btnMas.addEventListener('click', () => { const f = filaInsumo(contFilas, filas, excluir); setTimeout(() => { const s = contFilas.lastElementChild && contFilas.lastElementChild.querySelector('select'); if (s) s.focus(); }, 30); return f; });

    // Lo de la última vez de este producto (o la receta, en gerencia), escalado a lo que salió.
    function base(pid) {
      const ult = historial.find(x => x.tipo === 'elaboracion' && x.producto_id === pid && (x.items || []).length);
      if (ult) return { de: 'la última vez', rinde: Number(ult.cantidad), items: ult.items };
      const r = recetas.get(pid);
      if (r) return { de: 'la receta', rinde: Number(r.rinde), items: r.receta_items };
      return null;
    }
    function completar() {
      const b = base(prodId); const n = cantSalio ? cantSalio.get() : null;
      contFilas.replaceChildren(); filas.length = 0; pista.textContent = '';
      if (b && b.rinde > 0) {
        const f = n && n > 0 ? n / b.rinde : 1;
        b.items.forEach(it => { if (prods.has(it.insumo_id)) filaInsumo(contFilas, filas, excluir, { insumo_id: it.insumo_id, cantidad: Math.round(Number(it.cantidad) * f * 1000) / 1000 }); });
        pista.textContent = `Completado con ${b.de}. Corregí lo que haga falta.`;
      }
      if (!filas.length) filaInsumo(contFilas, filas, excluir);
    }

    let cabeza = [];
    if (modo === 'elaboracion') {
      const selProd = selectProducto('Elegí el producto', '', null, false);
      const zonaCant = h('div', { class: 'el-salio' });
      selProd.addEventListener('change', () => {
        prodId = selProd.value; const p = prods.get(prodId);
        cantSalio = cantidadCon(p, null, `Cuánto salió de ${p.nombre}`);
        cantSalio.inp.addEventListener('change', () => { if (pista.textContent && /última vez|receta/.test(pista.textContent)) completar(); });
        zonaCant.replaceChildren(h('label', { class: 'field' }, h('span', { class: 'field-l', text: '¿Cuánto salió?' }), cantSalio.el));
        completar();
        setTimeout(() => cantSalio.inp.focus(), 30);
      });
      cabeza = [h('p', { class: 'grupo-t', text: '¿Qué preparaste?' }), selProd, zonaCant, h('p', { class: 'grupo-t el-usaste', text: '¿Qué usaste?' })];
      filaInsumo(contFilas, filas, excluir);
    } else {
      cabeza = [h('p', { class: 'grupo-t', text: '¿Qué sacaste para el turno?' })];
      filaInsumo(contFilas, filas, excluir);
    }

    btn.addEventListener('click', async () => {
      if (sinSQL) return toast('Falta activar Elaborados en el servidor.', 'error');
      let n = null;
      if (modo === 'elaboracion') {
        if (!prodId) return toast('Elegí qué preparaste.', 'error');
        n = cantSalio.get();
        if (n === null || n <= 0) { cantSalio.inp.focus(); return toast('Poné cuánto salió.', 'error'); }
      }
      const items = []; const vistos = new Map();
      for (const f of filas) {
        if (!f.id) continue;
        const c = f.cant ? f.cant.get() : null;
        if (c === null || c <= 0) { if (f.cant) f.cant.inp.focus(); return toast(`Poné cuánto usaste de ${prods.get(f.id).nombre}.`, 'error'); }
        vistos.set(f.id, (vistos.get(f.id) || 0) + c);
      }
      vistos.forEach((c, id) => items.push({ insumo_id: id, cantidad: Math.round(c * 1000) / 1000 }));
      if (modo === 'uso' && !items.length) return toast('Elegí al menos un insumo y cuánto sacaste.', 'error');
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const id = await registrarElaboracion(localId, modo === 'uso' ? null : prodId, n, items, inNota.value.trim(), quien());
        items.forEach(it => stock.set(it.insumo_id, (stock.get(it.insumo_id) || 0) - it.cantidad));
        if (modo === 'elaboracion') stock.set(prodId, (stock.get(prodId) || 0) + n);
        if (ger) { items.forEach(it => G.stock.set(localId + '|' + it.insumo_id, stock.get(it.insumo_id))); if (modo === 'elaboracion') G.stock.set(localId + '|' + prodId, stock.get(prodId)); }
        historial = [{ id, tipo: modo, producto_id: modo === 'uso' ? null : prodId, cantidad: n, items, nota: inNota.value.trim() || null, encargado: quien() || null, creado_en: new Date().toISOString() }, ...historial];
        const p = prods.get(prodId);
        toast(modo === 'uso' ? 'Uso del día anotado' : `Anotado: ${legible(n, u(p))} de ${p.nombre}`, 'ok');
        pintarForm(); pintarHistorial();
      } catch (e) { toast(mensajeError(e), 'error'); btn.disabled = false; btn.textContent = modo === 'uso' ? 'Guardar uso del día' : 'Guardar elaboración'; }
    });

    mount(form, ...cabeza, contFilas, btnMas, pista, h('label', { class: 'field' }, h('span', { class: 'field-l', text: 'Nota (opcional)' }), inNota), btn);
  }

  function pintarHistorial() {
    if (!ctx.alive()) return;
    const hoy = inicioDia(0).toISOString();
    const tarjeta = (x) => {
      const p = prods.get(x.producto_id);
      const usados = (x.items || []).map(it => { const i = prods.get(it.insumo_id); return `${legible(it.cantidad, u(i))} ${i ? i.nombre : 'insumo'}`; });
      const titulo = x.tipo === 'uso' ? 'Uso del día' : `${legible(x.cantidad, u(p))} ${p ? p.nombre : 'Producto'}`;
      const puedeBorrar = ger || x.creado_en >= hoy;
      const borrar = puedeBorrar ? h('button', { class: 'icon-btn el-borrar', type: 'button', 'aria-label': `Borrar ${titulo}`, title: 'Borrar (se cargó mal)', on: { click: async (ev) => {
        if (!window.confirm(`¿Borrar "${titulo}"? Se devuelve lo que había descontado.`)) return;
        ev.currentTarget.disabled = true;
        try {
          await borrarElaboracion(x.id);
          (x.items || []).forEach(it => stock.set(it.insumo_id, (stock.get(it.insumo_id) || 0) + Number(it.cantidad)));
          if (x.tipo !== 'uso') stock.set(x.producto_id, (stock.get(x.producto_id) || 0) - Number(x.cantidad));
          if (ger) stock.forEach((v, k) => G.stock.set(localId + '|' + k, v));
          historial = historial.filter(y => y.id !== x.id); toast('Borrado', 'ok'); pintarHistorial();
        } catch (e) { toast(mensajeError(e), 'error'); }
      } } }, icon('basura', 18)) : null;
      return h('article', { class: 'el-reg' + (x.tipo === 'uso' ? ' el-reg-uso' : ''), 'data-reg': x.id },
        h('div', { class: 'el-reg-t' }, h('span', { class: 'el-tag', text: x.tipo === 'uso' ? 'Usé' : 'Elaboré' }), h('h3', { class: 'el-reg-n', text: titulo }), borrar),
        usados.length ? h('p', { class: 'el-reg-u' }, h('span', { text: x.tipo === 'uso' ? 'Sacó ' : 'Usó ' }), h('b', { text: usados.join(' · ') })) : null,
        h('p', { class: 'el-reg-m', text: [hora(x.creado_en), x.encargado, x.nota].filter(Boolean).join(' · ') }));
    };
    const deHoy = historial.filter(x => x.creado_en >= hoy); const deAyer = historial.filter(x => x.creado_en < hoy);
    mount(lista,
      h('h2', { class: 'bloque-t el-hist-t', text: 'Anotado hoy' }),
      deHoy.length ? h('div', { class: 'el-regs' }, deHoy.map(tarjeta)) : h('p', { class: 'el-nada', text: 'Todavía nada hoy.' }),
      deAyer.length ? h('h2', { class: 'bloque-t el-hist-t', text: 'Ayer' }) : null,
      deAyer.length ? h('div', { class: 'el-regs' }, deAyer.map(tarjeta)) : null);
  }

  mount(root, cab, nav, chips ? h('div', { class: 'toolbar' }, chips.el) : null, avisoSQL, seg, form, lista);
  await cargarLocal();
}
