// Gerencia · Compras → Armar → Por producto: los pedidos de los locales que todavía no se mandaron (para aprobar y
// aprobados, los mismos de "Por proveedor"), sumados por producto: una fila por producto con la cantidad de cada local y
// el total, agrupada por proveedor. Es la hoja de armado del depósito; se imprime en A4 horizontal (compras-impresion.js).
// Solo lee: aprobar, corregir y mandar se hace en "Por proveedor". Sin precios.
import { mount, h, fmtNum, groupBy, porTexto, lsGet, lsSet } from './util.js';
import { swr, ordenesPorEstado, mensajeError } from './api.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, banner, icon, subnav, toast, SUBNAV_COMPRAS } from './ui.js';
import { estadoDeVarias, textoEstado, claseEstado } from './compras-estado.js';
import { vistaAncha } from './g-hay.js';
import { VIVAS, SIN, consolidar, localesDe, nombreProv, rangoFechas, hojaArmado, imprimir } from './compras-impresion.js';

const FILTROS = [['todos', 'Todos'], ['borrador', 'Para aprobar'], ['aprobada', 'Aprobados']];
const TXT_FILTRO = { todos: 'Pedidos para aprobar y aprobados', borrador: 'Pedidos para aprobar', aprobada: 'Pedidos aprobados' };

export async function render(root, ctx) {
  let ordenes = [];
  let filtro = lsGet('g:pprod:estado', 'todos');
  if (!FILTROS.some(([k]) => k === filtro)) filtro = 'todos';
  let error = null;
  const ANCHO = typeof matchMedia === 'function' ? matchMedia('(min-width: 820px)') : null;
  const nav = subnav(SUBNAV_COMPRAS, 'por-producto');
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Compras' }), h('p', { class: 'sub', text: 'Por producto, de todos los locales' }));

  // Lo destildado en "Por proveedor" no se manda ni se arma (orden_items.excluido o, sin esa columna, este dispositivo).
  const fueraLocal = () => new Set(lsGet('g:ped:fuera', []));
  const vivas = () => ordenes.filter(o => VIVAS.includes(o.estado) && o.orden_items.length);
  const delFiltro = () => vivas().filter(o => filtro === 'todos' || o.estado === filtro);

  function grupos(os) {
    const fl = fueraLocal();
    const fuera = (it) => it.excluido || fl.has(it.id);
    return [...groupBy(os, o => o.proveedor_id || SIN)]
      .map(([pid, l]) => ({ pid, nombre: nombreProv(pid), os: l, filas: consolidar(l, fuera) }))
      .filter(g => g.filas.length)
      .sort((a, b) => (a.pid === SIN) - (b.pid === SIN) || porTexto(a.nombre, b.nombre));
  }

  const verEnProveedor = (nombre) => h('a', { class: 'ppr-ir', href: '#/compras', 'data-accion': 'ver-prov', on: { click: () => { try { sessionStorage.setItem('stock:ver-prov', nombre); } catch (_e) { /* nada */ } } } },
    h('span', { text: 'Ver y aprobar' }), icon('flecha', 14));
  const estadoDe = (os) => { const k = estadoDeVarias(os); return h('span', { class: claseEstado(k), 'data-estado': k, text: textoEstado(k) }); };
  const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // PC: una tabla con encabezado fijo; un bloque por proveedor.
  function tabla(gs, locs) {
    const ncol = 3 + locs.length;
    return h('div', { class: 'ppr-scroll' }, h('table', { class: 'ppr-tabla' },
      h('thead', {}, h('tr', {}, h('th', { class: 'ppr-c-prod', scope: 'col', text: 'Producto' }), h('th', { scope: 'col', text: 'Unidad' }),
        locs.map(l => h('th', { class: 'num', scope: 'col', text: nombreLocal(l) })), h('th', { class: 'num ppr-c-tot', scope: 'col', text: 'Total' }))),
      gs.map(g => h('tbody', { 'data-prov': g.nombre },
        h('tr', { class: 'ppr-g' }, h('th', { colspan: String(ncol), scope: 'rowgroup' },
          h('div', { class: 'ppr-g-in' }, h('b', { class: 'ppr-g-t', text: g.nombre }), h('span', { class: 'ppr-g-n', text: cuenta(g.filas.length, 'producto', 'productos') }), estadoDe(g.os),
            g.pid !== SIN ? verEnProveedor(g.nombre) : null))),
        g.filas.map(x => h('tr', { class: 'ppr-f', 'data-prod': x.producto_id, 'data-total': String(x.total) },
          h('td', { class: 'ppr-c-prod' }, h('b', { text: x.nombre }), x.cod ? h('small', { class: 'ppr-cod', text: 'Cód. ' + x.cod }) : null),
          h('td', { class: 'ppr-u', text: x.unidad || '' }),
          locs.map(l => { const v = x.porLocal.get(l); return h('td', { class: 'num' + (v ? '' : ' ppr-cero'), 'data-local': l, text: v ? fmtNum(v, 3) : '—' }); }),
          h('td', { class: 'num ppr-c-tot', text: fmtNum(x.total, 3) })))))));
  }

  // Celular: por proveedor, una fila por producto con el total grande y el desglose por local en una línea.
  function lista(gs) {
    return gs.map(g => h('section', { class: 'ppr-grupo', 'data-prov': g.nombre },
      h('header', { class: 'ppr-g-head' },
        h('div', {}, h('h2', { class: 'ppr-g-t', text: g.nombre }), h('p', { class: 'ppr-g-n', text: cuenta(g.filas.length, 'producto', 'productos') + ' · ' + cuenta(localesDe(g.os).length, 'local', 'locales') })),
        estadoDe(g.os)),
      h('ul', { class: 'ppr-lista' }, g.filas.map(x => h('li', { class: 'ppr-f', 'data-prod': x.producto_id, 'data-total': String(x.total) },
        h('div', { class: 'ppr-f-t' }, h('b', { text: x.nombre }),
          h('span', { class: 'ppr-desglose', text: [...x.porLocal].sort((a, b) => porTexto(nombreLocal(a[0]), nombreLocal(b[0]))).map(([l, v]) => `${nombreLocal(l)} ${fmtNum(v, 3)}`).join(' · ') })),
        h('div', { class: 'ppr-f-tot num' }, h('b', { text: fmtNum(x.total, 3) }), h('span', { text: x.unidad || '' }))))),
      g.pid !== SIN ? verEnProveedor(g.nombre) : null));
  }

  function pintar() {
    if (!ctx.alive()) return;
    const os = delFiltro();
    const gs = grupos(os);
    const conProductos = gs.flatMap(g => g.os);
    const locs = localesDe(conProductos);
    const nProd = gs.reduce((s, g) => s + g.filas.length, 0);
    const cuentaDe = (k) => vivas().filter(o => k === 'todos' || o.estado === k).length;
    const seg = h('div', { class: 'seg ppr-seg', role: 'tablist', 'aria-label': 'Qué pedidos' }, FILTROS.map(([k, t]) => h('button', {
      class: 'seg-b' + (filtro === k ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': filtro === k ? 'true' : 'false', 'data-filtro': k,
      on: { click: () => { filtro = k; lsSet('g:pprod:estado', k); pintar(); } } }, h('span', { text: t }), cuentaDe(k) ? h('span', { class: 'seg-n', text: String(cuentaDe(k)) }) : null)));
    const btnPrint = h('button', { class: 'btn btn-ghost', type: 'button', 'data-accion': 'imprimir-armado', disabled: !nProd, on: { click: () => {
      if (!nProd) return toast('No hay productos para imprimir.', 'error');
      imprimir([hojaArmado({ grupos: gs, os: conProductos, estadoTxt: TXT_FILTRO[filtro] })]);
    } } }, icon('imprimir', 18), h('span', { text: 'Imprimir hoja de armado' }));
    const resumen = nProd ? h('p', { class: 'ppr-resumen' },
      h('b', { text: cuenta(nProd, 'producto', 'productos') }), h('span', { text: ` · ${cuenta(locs.length, 'local', 'locales')} · ${cuenta(gs.length, 'proveedor', 'proveedores')}` }),
      rangoFechas(conProductos) ? h('span', { text: ' · pedidos del ' + rangoFechas(conProductos) }) : null) : null;
    mount(root, cab, nav,
      error ? banner('No se pudieron actualizar los pedidos: ' + error, 'warn') : null,
      h('div', { class: 'ppr-barra' }, seg, btnPrint),
      resumen,
      nProd ? (ANCHO && ANCHO.matches ? tabla(gs, locs) : lista(gs))
        : vacio('No hay pedidos para armar', filtro === 'todos' ? 'Lo que manden los locales y esté para aprobar o aprobado aparece acá, sumado por producto.' : 'No hay pedidos en este estado. Probá con "Todos".'));
  }

  mount(root, cab, nav, esqueleto(4));
  const finAncho = vistaAncha();
  const alCambiarAncho = () => pintar();
  if (ANCHO) ANCHO.addEventListener('change', alCambiarAncho);
  try {
    await cargarG(['prods', 'provs', 'locales'], () => {});
    await swr('g:ord:vivas', () => ordenesPorEstado(VIVAS), (d, _cache, err) => {
      ordenes = (d || []).map(o => ({ ...o, orden_items: o.orden_items || [] }));
      error = err ? mensajeError(err) : null;
      pintar();
    });
  } catch (e) { error = mensajeError(e); pintar(); }
  return () => { finAncho(); if (ANCHO) ANCHO.removeEventListener('change', alCambiarAncho); };
}
