// Gerencia · Categorías: crear, renombrar y borrar categorías (Almacén, Verdulería…) y elegir qué productos van en cada una.
// La categoría es el texto de productos.categoria: no hace falta SQL. Pedir, Contar, Stock y Lugares la usan sola.
// "Carta" (platos de Núcleo) no se toca desde acá.
import { mount, h, tokens, coincide, porTexto, debounce, norm } from './util.js';
import { ponerCategoria, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, toast, hoja, campo, icon, subnav, SUBNAV_CATALOGO } from './ui.js';

const SIN = 'Sin categoría';
const esSistema = (c) => norm(c || '') === 'carta';

export async function render(root, ctx) {
  let localF = 'todos';
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Categorías' }), h('p', { class: 'sub', text: 'Cómo se agrupan los productos en Pedir y Contar' }));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'categorias'), esqueleto(4));
  const lista = h('div', { class: 'lista' });

  const prodsLocal = (loc) => [...G.prods.values()].filter(p => p.activo !== false && !esSistema(p.categoria) && (loc === 'todos' || p.local_id === loc));

  function editar(cat) {
    const nueva = cat === null;
    const original = nueva ? null : cat;
    let loc = localF;
    let q = '';
    // Productos marcados: arrancan con los que ya están en la categoría (de todos los locales).
    const marcados = new Set(nueva ? [] : [...G.prods.values()].filter(p => p.activo !== false && p.categoria === original).map(p => p.id));
    const antes = new Set(marcados);
    const nombre = h('input', { class: 'input', id: 'cat-nombre', value: original || '', placeholder: 'Ej.: Almacén, Verdulería', maxlength: '40', autocomplete: 'off' });
    const locSel = h('select', { class: 'input', 'aria-label': 'Local', id: 'cat-local' },
      h('option', { value: 'todos', text: 'Todos los locales' }), G.locales.map(l => h('option', { value: l.id, text: l.nombre })));
    locSel.value = loc;
    const buscar = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto para sumar', 'aria-label': 'Buscar producto', autocomplete: 'off' });
    const cuenta = h('p', { class: 'field-h cat-cuenta', 'aria-live': 'polite' });
    const picker = h('div', { class: 'cat-picker' });
    const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: nueva ? 'Crear categoría' : 'Guardar cambios' });
    const borrar = nueva ? null : h('button', { class: 'btn btn-text btn-block cat-borrar', type: 'button' }, icon('basura', 18), h('span', { text: 'Borrar categoría' }));

    const pintarPicker = () => {
      cuenta.textContent = marcados.size === 1 ? '1 producto en esta categoría' : `${marcados.size} productos en esta categoría`;
      const t = tokens(q);
      const vis = prodsLocal(loc).filter(p => coincide(p.nombre + ' ' + p.codigo + ' ' + (p.categoria || ''), t))
        .sort((a, b) => (marcados.has(b.id) - marcados.has(a.id)) || porTexto(a.nombre, b.nombre));
      if (!vis.length) return picker.replaceChildren(h('p', { class: 'mute cat-vacio', text: q ? `No hay "${q.trim()}"` : 'No hay productos en este local.' }));
      const max = 200;
      picker.replaceChildren(...vis.slice(0, max).map(p => {
        const ch = h('input', { type: 'checkbox', checked: marcados.has(p.id), on: { change: (e) => { if (e.target.checked) marcados.add(p.id); else marcados.delete(p.id); cuenta.textContent = marcados.size === 1 ? '1 producto en esta categoría' : `${marcados.size} productos en esta categoría`; } } });
        const otra = p.categoria && p.categoria !== original ? p.categoria : null;
        return h('label', { class: 'cat-item' }, ch,
          h('span', { class: 'cat-item-t' }, h('b', { text: p.nombre }),
            h('span', { class: 'cat-item-m' }, h('span', { class: 'num', text: p.codigo }), loc === 'todos' ? h('span', { text: nombreLocal(p.local_id) }) : null,
              otra ? h('span', { text: 'Ahora en ' + otra }) : (!p.categoria ? h('span', { text: SIN }) : null))));
      }), ...(vis.length > max ? [h('p', { class: 'mute cat-vacio', text: `Hay ${vis.length - max} más: buscalos por nombre.` })] : []));
    };
    locSel.addEventListener('change', () => { loc = locSel.value; pintarPicker(); });
    buscar.addEventListener('input', debounce(() => { q = buscar.value; pintarPicker(); }, 120));

    const form = h('div', { class: 'form' },
      campo('Nombre de la categoría', nombre, 'Así sale en Pedir, Contar, Stock y Lugares.'),
      h('div', { class: 'field' }, h('span', { class: 'field-l', text: 'Productos' }),
        h('div', { class: 'cat-filtros' }, locSel, buscar), cuenta, picker),
      err, btn, borrar);
    const { cerrar } = hoja(nueva ? 'Nueva categoría' : original, form);
    pintarPicker();

    async function aplicar(cambios) {
      // cambios: Map categoria(null|texto) -> [ids]
      for (const [c, ids] of cambios) {
        if (!ids.length) continue;
        await ponerCategoria(ids, c);
        for (const id of ids) { const p = G.prods.get(id); if (p) p.categoria = c; }
      }
    }

    btn.addEventListener('click', async () => {
      err.replaceChildren();
      const n = nombre.value.trim().replace(/\s+/g, ' ');
      if (!n) return (err.textContent = 'Poné el nombre de la categoría.');
      if (esSistema(n) || norm(n) === norm(SIN)) return (err.textContent = `"${n}" no se puede usar: elegí otro nombre.`);
      if (!marcados.size) return (err.textContent = 'Marcá al menos un producto: la categoría aparece cuando tiene productos.');
      // Si ya existe con otra escritura (almacen / Almacén), se usa la que ya está.
      const existente = [...new Set([...G.prods.values()].map(p => p.categoria).filter(Boolean))].find(c => c !== original && norm(c) === norm(n));
      const destino = existente || n;
      const poner = [...marcados].filter(id => (G.prods.get(id) || {}).categoria !== destino);
      const sacar = [...antes].filter(id => !marcados.has(id));
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await aplicar(new Map([[destino, poner], [null, sacar]]));
        toast(nueva ? `Categoría ${destino} creada` : 'Cambios guardados', 'ok');
        cerrar(); pintar();
      } catch (e) { err.textContent = mensajeError(e); btn.disabled = false; btn.textContent = nueva ? 'Crear categoría' : 'Guardar cambios'; }
    });

    if (borrar) borrar.addEventListener('click', async () => {
      const ids = [...antes];
      if (!confirm(`¿Borrar la categoría ${original}? Sus ${ids.length} productos quedan en "${SIN}" (no se borra ningún producto).`)) return;
      borrar.disabled = true;
      try { await aplicar(new Map([[null, ids]])); toast(`Categoría ${original} borrada`, 'ok'); cerrar(); pintar(); }
      catch (e) { err.textContent = mensajeError(e); borrar.disabled = false; }
    });
    if (nueva) nombre.focus();
  }

  function pintar() {
    const cuenta = new Map();
    for (const p of prodsLocal(localF)) { const c = p.categoria || SIN; cuenta.set(c, (cuenta.get(c) || 0) + 1); }
    // Las categorías de otros locales también se listan (con 0) para poder sumarles productos de este local.
    for (const p of prodsLocal('todos')) if (p.categoria && !cuenta.has(p.categoria)) cuenta.set(p.categoria, 0);
    const cats = [...cuenta.keys()].filter(c => c !== SIN).sort(porTexto);
    if (!cats.length && !cuenta.has(SIN)) return lista.replaceChildren(vacio('No hay categorías', 'Creá la primera con "Nueva categoría".'));
    const fila = (c, n, sin) => h('button', { class: 'prod prod-cat' + (sin ? ' cat-sin' : ''), type: 'button', 'aria-label': sin ? 'Productos sin categoría' : `Editar ${c}`,
      on: { click: () => sin ? editar(null) : editar(c) } },
      h('span', { class: 'prod-n', text: c }),
      h('span', { class: 'prod-m' }, h('span', { text: n === 1 ? '1 producto' : `${n} productos` }), sin ? h('span', { class: 'chip-aviso', text: 'Ponelos en una categoría' }) : null));
    lista.replaceChildren(...cats.map(c => fila(c, cuenta.get(c), false)), ...(cuenta.get(SIN) ? [fila(SIN, cuenta.get(SIN), true)] : []));
  }

  await cargarG(['prods', 'locales'], () => { if (ctx.alive() && lista.isConnected) pintar(); });
  if (!ctx.alive()) return;
  const locSel = h('select', { class: 'input', 'aria-label': 'Local', on: { change: (e) => { localF = e.target.value; pintar(); } } },
    h('option', { value: 'todos', text: 'Todos los locales' }), G.locales.map(l => h('option', { value: l.id, text: l.nombre })));
  mount(root, cab, subnav(SUBNAV_CATALOGO, 'categorias'),
    h('div', { class: 'toolbar toolbar-row' }, locSel, h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => editar(null) } }, icon('mas', 18), h('span', { text: 'Nueva categoría' }))),
    lista);
  pintar();
}
