// Encargado · Contar: cuenta lo que queda en el local (una vez por semana, antes de pedir) y el stock pasa a ser lo contado.
// Desde ahí el stock sigue solo: último conteo + lo que entra − lo que sale. Lo que faltó al contar es lo usado sin anotar.
// Se cuenta a ciegas: no se muestra lo que dice el sistema, para que nadie copie el número. Vacío = no lo contó.
// Lo que va cargando queda guardado en el celular hasta que guarda el conteo (0024_conteos.sql).
import { mount, h, norm, tokens, coincide, fmtNum, parseNum, porTexto, lsGet, lsSet, lsDel, esCarta, esBulto, factorDe, plural, fechaCorta } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarLocales, contarLocal, ultimoConteo, mensajeError } from './api.js';
import { esqueleto, vacio, banner, toast, icon } from './ui.js';

export async function render(root, ctx) {
  const lid = ctx.perfil.local_id;
  const quien = () => lsGet('nombre') || ctx.nombreGuardado || '';
  const clave = 'conteo:' + lid;
  let prods = [], stock = new Map(), nombreLocal = '', ultimo = null, sinSQL = false;
  let q = '', cat = 'todas', guardando = false;
  const borrador = () => { const d = lsGet(clave); return d && d.t && Date.now() - d.t < 3 * 864e5 ? (d.v || {}) : {}; };
  let vals = borrador();
  const sub = h('p', { class: 'sub', text: 'Lo que queda en el local' });
  mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Contar' }), sub), esqueleto(5));

  await Promise.allSettled([
    swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = d; }),
    swr('stk:' + lid, () => cargarStock(lid), (d) => { stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); }),
    swr('locales', cargarLocales, (d) => { const l = (d || []).find(x => x.id === lid); nombreLocal = l ? l.nombre : ''; }),
    ultimoConteo(lid).then(r => { ultimo = r; }).catch(e => { if (e && (e.code === '42P01' || /conteos/.test(e.message || ''))) sinSQL = true; })
  ]);
  if (!ctx.alive()) return;
  if (!prods.length) { mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Contar' }), sub), vacio('No hay productos', 'El catálogo del local está vacío.')); return; }
  sub.textContent = nombreLocal || 'Lo que queda en el local';

  // Lo oculto (resto de la lista de un mayorista) solo aparece si hay stock; los platos de la carta no se cuentan.
  const activos = prods.filter(p => p.activo !== false && !esCarta(p) && (!p.oculto || (stock.get(p.id) || 0) > 0)).sort((a, b) => porTexto(a.nombre, b.nombre));
  const cats = [...new Set(activos.map(p => p.categoria || 'Sin categoría'))].sort(porTexto);
  const contados = () => activos.filter(p => vals[p.id] != null && vals[p.id] !== '');
  // Por bulto (bolsa de 5 kg) se cuenta en bolsas, con decimales; se guarda en la unidad de uso.
  const unidad = (p) => esBulto(p) ? `${plural(p.unidad_compra, 2)} de ${fmtNum(factorDe(p), 3)} ${p.unidad_uso}` : (p.unidad_uso || 'unidades');

  const infoUltimo = h('p', { class: 'cnt-ult' });
  const pintarUltimo = () => infoUltimo.replaceChildren(icon('check', 16), h('span', { text: ultimo
    ? `Último conteo: ${fechaCorta(ultimo.creado_en)}${ultimo.encargado ? ' · ' + ultimo.encargado : ''} · ${ultimo.items.length} ${ultimo.items.length === 1 ? 'producto' : 'productos'}`
    : 'Todavía no se contó. Contá una vez por semana, antes de pedir.' }));
  pintarUltimo();
  const ayuda = banner('Contá lo que hay en depósito, cámara y barra. Lo que no contaste dejalo vacío. Si no queda nada, poné 0.', 'info');
  const btn = h('button', { class: 'pill', type: 'button', hidden: true, on: { click: guardar } });
  const pintarBtn = () => { const n = contados().length; btn.hidden = n === 0; btn.replaceChildren(icon('check', 20), h('span', { text: guardando ? 'Guardando…' : `Guardar conteo · ${n} ${n === 1 ? 'producto' : 'productos'}` })); };
  const lista = h('div', { class: 'lista cnt-lista' });
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off',
    on: { input: (e) => { q = e.target.value; pintarLista(); } } });
  const chips = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Categoría' },
    [['todas', 'Todas'], ['faltan', 'Sin contar'], ...cats.map(c => [c, c])].map(([id, t]) => h('button', { class: 'chip' + (id === cat ? ' is-on' : ''), type: 'button', text: t, 'data-cat': id,
      on: { click: () => { cat = id; chips.querySelectorAll('.chip').forEach(b => b.classList.toggle('is-on', b.getAttribute('data-cat') === id)); pintarLista(); } } })));

  const fila = (p) => {
    const inp = h('input', { class: 'input num cnt-in', type: 'text', inputmode: 'decimal', placeholder: '—', 'aria-label': `Cuántos ${unidad(p)} de ${p.nombre}`, value: vals[p.id] ?? '',
      on: { input: (e) => {
        const t = e.target.value.trim();
        if (t === '') delete vals[p.id]; else vals[p.id] = t;
        lsSet(clave, { t: Date.now(), v: vals });
        row.classList.toggle('is-on', t !== ''); row.classList.toggle('cnt-mal', t !== '' && !(parseNum(t) >= 0));
        pintarBtn();
      } } });
    const row = h('article', { class: 'prod cnt-prod' + (vals[p.id] != null ? ' is-on' : ''), 'data-id': p.id },
      h('h3', { class: 'prod-n', text: p.nombre }),
      h('div', { class: 'prod-p' }, inp, h('span', { class: 'prod-u', text: unidad(p) })));
    return row;
  };
  function pintarLista() {
    const tk = tokens(norm(q));
    let vis = activos;
    if (cat === 'faltan') vis = vis.filter(p => vals[p.id] == null);
    else if (cat !== 'todas') vis = vis.filter(p => (p.categoria || 'Sin categoría') === cat);
    if (tk.length) vis = vis.filter(p => coincide(p.nombre + ' ' + p.codigo, tk));
    if (!vis.length) return lista.replaceChildren(vacio(cat === 'faltan' ? 'Contaste todo' : 'No hay productos', cat === 'faltan' ? 'Tocá Guardar conteo.' : 'Probá con otra palabra.'));
    const grupos = new Map();
    for (const p of vis) { const c = p.categoria || 'Sin categoría'; if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(p); }
    lista.replaceChildren(...[...grupos].flatMap(([c, ps]) => [h('h2', { class: 'cat-t', text: c }), ...ps.map(fila)]));
  }

  async function guardar() {
    if (guardando) return;
    const malos = contados().filter(p => !(parseNum(vals[p.id]) >= 0));
    if (malos.length) return toast(`Revisá ${malos[0].nombre}: tiene que ser un número.`, 'error');
    const items = contados().map(p => ({ producto_id: p.id, contado: Math.round(parseNum(vals[p.id]) * (esBulto(p) ? factorDe(p) : 1) * 1000) / 1000 }));
    if (!confirm(`¿Guardar el conteo de ${items.length} ${items.length === 1 ? 'producto' : 'productos'}? El stock pasa a ser lo que contaste.`)) return;
    guardando = true; pintarBtn();
    try {
      await contarLocal(lid, items, quien());
      lsDel(clave); vals = {};
      ultimo = { creado_en: new Date().toISOString(), encargado: quien(), items };
      pintarUltimo(); pintarLista();
      toast(`Conteo guardado: ${items.length} ${items.length === 1 ? 'producto' : 'productos'}`, 'ok');
      cargarStock(lid).then(d => { stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); }).catch(() => {});
    } catch (e) { toast('No se pudo guardar: ' + mensajeError(e), 'error'); }
    guardando = false; pintarBtn();
  }

  mount(root, h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Contar' }), sub),
    sinSQL ? banner('Contar todavía no está activado. Avisale a gerencia.', 'warn') : null,
    infoUltimo, ayuda, h('div', { class: 'toolbar-fija' }, buscador, chips), lista, btn);
  pintarLista(); pintarBtn();
  return () => {};
}
