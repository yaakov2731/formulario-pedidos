// Encargado · Contar: cuenta lo que queda en el local (una vez por semana, antes de pedir) y el stock pasa a ser lo contado.
// Desde ahí el stock sigue solo: último conteo + lo que entra − lo que sale. Lo que faltó al contar es lo usado sin anotar.
// Se cuenta a ciegas: no se muestra lo que dice el sistema, para que nadie copie el número. Vacío = no lo contó.
// Lo que va cargando queda guardado en el celular hasta que guarda el conteo (0024_conteos.sql).
// Antes de guardar marca si es el conteo de apertura (primer día de servicio) o de cierre (último): con los dos,
// gerencia ve en Stock → Control lo que se usó en la semana (0028_conteo_apertura_cierre.sql).
// Por lugar (0025_lugares.sql): si gerencia ya ubicó los productos, primero se elige el lugar (Cámara, Freezer, Depósito…)
// y se ve solo lo que hay ahí, en el orden de los estantes, con el avance de cada lugar. Si no, la lista por categoría.
import { mount, h, norm, tokens, coincide, fmtNum, parseNum, porTexto, lsGet, lsSet, lsDel, esCarta, esBulto, factorDe, plural, fechaCorta, porLugar, lugarDe, SIN_LUGAR } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarLocales, contarLocal, ultimoConteo, mensajeError } from './api.js';
import { esqueleto, vacio, banner, toast, icon } from './ui.js';
import { abrirConteo } from './conteo-detalle.js';

export async function render(root, ctx) {
  const lid = ctx.perfil.local_id;
  const quien = () => lsGet('nombre') || ctx.nombreGuardado || '';
  const clave = 'conteo:' + lid;
  const claveLugar = 'conteo-lugar:' + lid;
  const claveTipo = 'conteo-tipo:' + lid;
  let prods = [], stock = new Map(), nombreLocal = '', ultimo = null, sinSQL = false;
  let q = '', cat = 'todas', guardando = false;
  let lugar = lsGet(claveLugar) || null;
  let tipo = ['apertura', 'cierre'].includes(lsGet(claveTipo)) ? lsGet(claveTipo) : null;
  const borrador = () => { const d = lsGet(clave); return d && d.t && Date.now() - d.t < 3 * 864e5 ? d : {}; };
  // vals: lo contado (en bultos si se compra por bulto). sus: las unidades sueltas de un bulto abierto (ej. 2 tortas de una caja de 4).
  let vals = borrador().v || {}, sus = borrador().s || {};
  const guardarBorrador = () => lsSet(clave, { t: Date.now(), v: vals, s: sus });
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
  const lugares = porLugar(activos);
  const conLugares = activos.some(p => lugarDe(p) !== SIN_LUGAR);
  if (!conLugares || !lugares.has(lugar)) lugar = null;
  const lleno = (m, p) => m[p.id] != null && m[p.id] !== '';
  const hecho = (p) => lleno(vals, p) || lleno(sus, p);
  const numOk = (m, p) => !lleno(m, p) || parseNum(m[p.id]) >= 0;
  // Total en la unidad de uso: bultos × lo que trae cada uno + sueltas. Ej.: 1 caja de 4 + 2 sueltas = 6 unidades.
  const total = (p) => (lleno(vals, p) ? parseNum(vals[p.id]) * (esBulto(p) ? factorDe(p) : 1) : 0) + (esBulto(p) && lleno(sus, p) ? parseNum(sus[p.id]) : 0);
  const contados = () => activos.filter(hecho);
  // Por bulto (bolsa de 5 kg) se cuenta en bolsas, con decimales; se guarda en la unidad de uso.
  // Si quedó un bulto abierto, lo suelto se anota aparte en la unidad de uso (unidades, kg) y se suma.
  const unidad = (p) => esBulto(p) ? `${plural(p.unidad_compra, 2)} de ${fmtNum(factorDe(p), 3)} ${plural(p.unidad_uso, factorDe(p))}` : (p.unidad_uso || 'unidades');
  const unidadSuelta = (p) => { const u = p.unidad_uso || 'unidad'; return plural(u, 2) + (/^(unidad|porci|feta|botella|lata)/i.test(u) ? ' sueltas' : ' sueltos'); };

  const infoUltimo = h('p', { class: 'cnt-ult' });
  // El conteo de hoy se puede revisar y corregir (sacar un producto o borrarlo entero). Los de otros días, solo gerencia.
  const esDeHoy = (c) => c && c.id && new Date(c.creado_en).toDateString() === new Date().toDateString();
  const alCambiarConteo = async (c) => {
    ultimo = c;
    if (!c) { try { ultimo = await ultimoConteo(lid); } catch (_e) { ultimo = null; } }
    if (!ctx.alive()) return;
    pintarUltimo();
    cargarStock(lid).then(d => { stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); }).catch(() => {});
  };
  const pintarUltimo = () => mount(infoUltimo, icon('check', 16), h('span', { text: ultimo
    ? `Último conteo${ultimo.tipo ? ' de ' + ultimo.tipo : ''}: ${fechaCorta(ultimo.creado_en)}${ultimo.encargado ? ' · ' + ultimo.encargado : ''} · ${ultimo.items.length} ${ultimo.items.length === 1 ? 'producto' : 'productos'}`
    : 'Todavía no se contó. Contá el primer día de servicio (apertura) y el último (cierre), antes de pedir.' }),
    esDeHoy(ultimo) ? h('button', { class: 'btn btn-text cnt-ver', type: 'button', text: 'Ver o corregir',
      on: { click: () => abrirConteo(ultimo, { prods: new Map(prods.map(p => [p.id, p])), alCambiar: alCambiarConteo }) } }) : null);
  pintarUltimo();
  const ayuda = banner(conLugares
    ? 'Elegí un lugar y contá lo que hay ahí, en el orden de los estantes. Lo que no contaste dejalo vacío. Si no queda nada, poné 0.'
    : 'Contá lo que hay en depósito, cámara y barra. Lo que no contaste dejalo vacío. Si no queda nada, poné 0. Para contar por lugar, primero armá los lugares del local.', 'info');
  // El encargado arma u ordena los lugares de su local (Stock → Lugares de gerencia, solo con su local).
  const armar = h('div', { class: 'cnt-armar' }, h('a', { class: 'btn btn-ghost', href: '#/lugares' },
    icon('mas', 18), h('span', { text: conLugares ? 'Cambiar los lugares' : 'Armar los lugares del local' })));
  // Apertura o cierre: obligatorio para guardar. Queda guardado en el celular con el borrador.
  const TIPOS = [['apertura', 'Apertura', 'Primer día de servicio'], ['cierre', 'Cierre', 'Último día de servicio']];
  const segTipo = h('div', { class: 'seg cnt-tipo', role: 'radiogroup', 'aria-label': 'Qué conteo es' });
  const pintarTipo = () => segTipo.replaceChildren(...TIPOS.map(([id, t, d]) => h('button', {
    class: 'seg-b cnt-tipo-b' + (tipo === id ? ' is-on' : ''), type: 'button', role: 'radio', 'aria-checked': tipo === id ? 'true' : 'false', 'data-tipo': id,
    on: { click: () => { tipo = id; lsSet(claveTipo, id); pintarTipo(); pintarBtn(); } } }, h('b', { text: t }), h('small', { text: d }))));
  const bloqueTipo = h('section', { class: 'cnt-tipo-box' }, h('p', { class: 'cnt-tipo-t', text: '¿Qué conteo es?' }), segTipo);
  pintarTipo();
  const btn = h('button', { class: 'pill', type: 'button', hidden: true, on: { click: guardar } });
  const pintarBtn = () => { const n = contados().length; btn.hidden = n === 0; btn.replaceChildren(icon('check', 20), h('span', { text: guardando ? 'Guardando…' : `Guardar ${tipo ? 'conteo de ' + tipo : 'conteo'} · ${n} ${n === 1 ? 'producto' : 'productos'}` })); };
  const lista = h('div', { class: 'lista cnt-lista' });
  const buscador = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off',
    on: { input: (e) => { q = e.target.value; pintarLista(); } } });
  const chips = conLugares ? null : h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Categoría' },
    [['todas', 'Todas'], ['faltan', 'Sin contar'], ...cats.map(c => [c, c])].map(([id, t]) => h('button', { class: 'chip' + (id === cat ? ' is-on' : ''), type: 'button', text: t, 'data-cat': id,
      on: { click: () => { cat = id; chips.querySelectorAll('.chip').forEach(b => b.classList.toggle('is-on', b.getAttribute('data-cat') === id)); pintarLista(); } } })));

  // Avance de un lugar: "8 de 12". Se actualiza mientras escribe (cabecera del lugar abierto).
  const avance = (ps) => { const n = ps.filter(hecho).length; return { n, total: ps.length, listo: n === ps.length }; };
  const textoAvance = ({ n, total }) => `${n} de ${total} ${total === 1 ? 'contado' : 'contados'}`;
  let alCambiar = () => {};

  const fila = (p, conLugar) => {
    const entrada = (m, etiqueta) => h('input', { class: 'input num cnt-in', type: 'text', inputmode: 'decimal', placeholder: '—', 'aria-label': `${etiqueta} de ${p.nombre}`, value: m[p.id] ?? '',
      on: { input: (e) => {
        const t = e.target.value.trim();
        if (t === '') delete m[p.id]; else m[p.id] = t;
        guardarBorrador();
        const algo = hecho(p);
        row.classList.toggle('is-on', algo); row.classList.toggle('cnt-mal', algo && !(numOk(vals, p) && numOk(sus, p)));
        pintarTotal(); pintarBtn(); alCambiar();
      } } });
    const bulto = esBulto(p);
    const tot = bulto ? h('p', { class: 'cnt-total' }) : null;
    // "= 6 unidades" debajo, para que se vea qué queda guardado.
    const pintarTotal = () => {
      if (!tot) return;
      const n = Math.round(total(p) * 1000) / 1000;
      tot.textContent = hecho(p) && numOk(vals, p) && numOk(sus, p) ? `= ${fmtNum(n, 3)} ${plural(p.unidad_uso, n)}` : '';
    };
    const row = h('article', { class: 'prod cnt-prod' + (hecho(p) ? ' is-on' : '') + (bulto ? ' cnt-bulto' : ''), 'data-id': p.id },
      conLugar ? h('span', { class: 'cnt-donde', text: lugarDe(p) }) : null,
      h('h3', { class: 'prod-n', text: p.nombre }),
      h('div', { class: 'prod-p' }, entrada(vals, `Cuántos ${unidad(p)}`), h('span', { class: 'prod-u', text: unidad(p) })),
      bulto ? h('div', { class: 'prod-p cnt-suelto' }, h('span', { class: 'cnt-mas', 'aria-hidden': 'true', text: '+' }), entrada(sus, `Cuántas ${unidadSuelta(p)}`), h('span', { class: 'prod-u', text: unidadSuelta(p) })) : null,
      tot);
    pintarTotal();
    return row;
  };

  const irA = (l) => { lugar = l; if (l) lsSet(claveLugar, l); else lsDel(claveLugar); q = ''; buscador.value = ''; pintarLista(); window.scrollTo(0, 0); };

  // Lugares: una tarjeta por lugar, en el orden del recorrido, con su avance.
  function pintarLugares() {
    alCambiar = () => {};
    const tarjetas = [...lugares].map(([l, ps]) => {
      const a = avance(ps);
      return h('button', { class: 'lug-card' + (a.listo ? ' is-done' : a.n ? ' is-on' : ''), type: 'button', 'data-lugar': l, on: { click: () => irA(l) } },
        h('span', { class: 'lug-n', text: l }),
        h('span', { class: 'lug-a' }, a.listo ? icon('check', 16) : null, h('span', { text: textoAvance(a) })),
        h('span', { class: 'lug-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round(a.n / Math.max(1, a.total) * 100)}%` })));
    });
    lista.replaceChildren(h('div', { class: 'lug-grid' }, tarjetas));
  }
  // Un lugar abierto: sus productos en el orden de los estantes y, al final, el siguiente lugar.
  function pintarLugar() {
    const ps = lugares.get(lugar);
    const orden = [...lugares.keys()];
    const sig = orden[orden.indexOf(lugar) + 1];
    const cuenta = h('span', { class: 'lug-cab-a' });
    const pie = h('div', { class: 'lug-pie' });
    alCambiar = () => {
      const a = avance(ps);
      cuenta.textContent = textoAvance(a);
      pie.replaceChildren(sig
        ? h('button', { class: 'btn ' + (a.listo ? 'btn-primary' : 'btn-ghost') + ' btn-block lug-sig', type: 'button', on: { click: () => irA(sig) } }, h('span', { text: `Siguiente: ${sig}` }), h('span', { 'aria-hidden': 'true', text: ' →' }))
        : h('button', { class: 'btn btn-ghost btn-block lug-sig', type: 'button', on: { click: () => irA(null) } }, h('span', { text: 'Volver a los lugares' })));
    };
    lista.replaceChildren(
      h('div', { class: 'lug-cab' },
        h('button', { class: 'btn btn-ghost lug-volver', type: 'button', on: { click: () => irA(null) } }, h('span', { 'aria-hidden': 'true', text: '← ' }), h('span', { text: 'Lugares' })),
        h('div', { class: 'lug-cab-t' }, h('h2', { class: 'lug-cab-n', text: lugar }), cuenta)),
      ...ps.map(p => fila(p)), pie);
    alCambiar();
  }

  function pintarLista() {
    const tk = tokens(norm(q));
    // Dentro de un lugar, lo importante son los productos: se esconde la ayuda y el último conteo.
    infoUltimo.hidden = ayuda.hidden = bloqueTipo.hidden = armar.hidden = !!(conLugares && lugar && !tk.length);
    if (conLugares && !tk.length) return lugar ? pintarLugar() : pintarLugares();
    alCambiar = () => {};
    let vis = activos;
    if (!conLugares && cat === 'faltan') vis = vis.filter(p => !hecho(p));
    else if (!conLugares && cat !== 'todas') vis = vis.filter(p => (p.categoria || 'Sin categoría') === cat);
    if (tk.length) vis = vis.filter(p => coincide(p.nombre + ' ' + p.codigo, tk));
    if (!vis.length) return lista.replaceChildren(vacio(cat === 'faltan' ? 'Contaste todo' : 'No hay productos', cat === 'faltan' ? 'Tocá Guardar conteo.' : 'Probá con otra palabra.'));
    // Al buscar con lugares, cada producto dice dónde está.
    if (conLugares) return lista.replaceChildren(...vis.map(p => fila(p, true)));
    const grupos = new Map();
    for (const p of vis) { const c = p.categoria || 'Sin categoría'; if (!grupos.has(c)) grupos.set(c, []); grupos.get(c).push(p); }
    lista.replaceChildren(...[...grupos].flatMap(([c, ps]) => [h('h2', { class: 'cat-t', text: c }), ...ps.map(p => fila(p))]));
  }

  const volver = h('a', { class: 'btn btn-ghost cnt-volver', href: '#/stock' }, h('span', { 'aria-hidden': 'true', text: '← ' }), h('span', { text: 'Stock' }));

  async function guardar() {
    if (guardando) return;
    const malos = contados().filter(p => !(numOk(vals, p) && numOk(sus, p)));
    if (malos.length) return toast(`Revisá ${malos[0].nombre}: tiene que ser un número.`, 'error');
    if (!tipo) { bloqueTipo.hidden = false; bloqueTipo.classList.add('is-falta'); window.scrollTo(0, 0); return toast('Elegí arriba si es el conteo de apertura o de cierre.', 'error'); }
    const items = contados().map(p => ({ producto_id: p.id, contado: Math.round(total(p) * 1000) / 1000 }));
    if (!confirm(`¿Guardar el conteo de ${tipo} de ${items.length} ${items.length === 1 ? 'producto' : 'productos'}? El stock pasa a ser lo que contaste.`)) return;
    guardando = true; pintarBtn();
    try {
      const cid = await contarLocal(lid, items, quien(), tipo);
      const eraTipo = tipo;
      lsDel(clave); lsDel(claveLugar); lsDel(claveTipo); vals = {}; sus = {}; lugar = null; tipo = null; pintarTipo(); bloqueTipo.classList.remove('is-falta');
      ultimo = { id: cid, creado_en: new Date().toISOString(), encargado: quien(), items, tipo: eraTipo };
      pintarUltimo(); pintarLista();
      toast(`Conteo de ${eraTipo} guardado: ${items.length} ${items.length === 1 ? 'producto' : 'productos'}`, 'ok');
      cargarStock(lid).then(d => { stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); }).catch(() => {});
    } catch (e) { toast('No se pudo guardar: ' + mensajeError(e), 'error'); }
    guardando = false; pintarBtn();
  }

  mount(root, h('header', { class: 'vista-head' }, volver, h('h1', { class: 'titulo', text: 'Contar' }), sub),
    sinSQL ? banner('Contar todavía no está activado. Avisale a gerencia.', 'warn') : null,
    infoUltimo, bloqueTipo, ayuda, armar, h('div', { class: 'toolbar-fija' }, buscador, chips), lista, btn);
  pintarLista(); pintarBtn();
  return () => {};
}
