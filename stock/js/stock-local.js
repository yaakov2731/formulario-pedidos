// Encargado · Stock: qué hay en el local, dónde está y qué entró hoy. Desde acá se cuenta (Contar) y se arman los lugares.
// Lo recibido aparece enseguida: el stock es último conteo + lo que entró − lo que se usó (vista stock_actual).
import { mount, h, fechaCorta } from './util.js';
import { swr, cargarCatalogo, cargarStock, cargarLocales, movimientosDesde, listarConteos, ordenesLocalDesde, cargarProveedoresBasico, mensajeError } from './api.js';
import { esqueleto, vacio, toast, icon } from './ui.js';
import { inventario, planillaConteo, DIAS_MOV } from './inventario.js';

export async function render(root, ctx) {
  const lid = ctx.perfil.local_id;
  const sub = h('p', { class: 'sub', text: 'Qué hay en el local' });
  const btnPrint = h('button', { class: 'icon-btn stk-print', type: 'button', 'aria-label': 'Imprimir planilla para contar', title: 'Imprimir planilla para contar', on: { click: () => imprimir() } }, icon('imprimir', 20));
  const cab = h('header', { class: 'vista-head stk-head' }, h('div', { class: 'stk-head-t' }, h('h1', { class: 'titulo', text: 'Stock' }), sub), btnPrint);
  mount(root, cab, esqueleto(6));

  let prods = [], stock = new Map(), movs = [], conteos = [], nombreLocal = '';
  const provDeOrden = new Map();
  const desde = new Date(Date.now() - DIAS_MOV * 864e5).toISOString();
  await Promise.allSettled([
    swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = d; }),
    swr('stk:' + lid, () => cargarStock(lid), (d) => { stock = new Map(d.map(r => [r.producto_id, Number(r.stock)])); }),
    swr('locales', cargarLocales, (d) => { const l = (d || []).find(x => x.id === lid); nombreLocal = l ? l.nombre : ''; }),
    movimientosDesde(lid, desde).then(r => { movs = r; }).catch(e => toast('No pude cargar los movimientos: ' + mensajeError(e), 'error')),
    listarConteos(lid, 12).then(r => { conteos = r || []; }).catch(() => {}),
    Promise.all([ordenesLocalDesde(lid, desde), cargarProveedoresBasico()]).then(([os, ps]) => {
      const nom = new Map((ps || []).map(p => [p.id, p.nombre]));
      for (const o of os || []) if (o.proveedor_id && nom.has(o.proveedor_id)) provDeOrden.set(o.id, nom.get(o.proveedor_id));
    }).catch(() => {})
  ]);
  if (!ctx.alive()) return;
  if (nombreLocal) sub.textContent = nombreLocal;
  if (!prods.length) { mount(root, cab, vacio('No hay productos', 'El catálogo del local está vacío.')); return; }

  const stockDe = (p) => stock.get(p.id) || 0;
  const inv = inventario({ localId: lid, prods, stockDe, movs, conteos, provDeOrden, clave: 'inv-enc' });
  const ultimo = conteos[0];
  const acciones = h('div', { class: 'inv-acc' },
    h('a', { class: 'btn btn-primary inv-contar', href: '#/contar' }, icon('check', 18), h('span', { text: 'Contar' })),
    h('a', { class: 'btn btn-ghost', href: '#/lugares' }, icon('pin', 18), h('span', { text: 'Lugares' })));
  const nota = h('p', { class: 'inv-nota' }, ultimo
    ? `Último conteo: ${fechaCorta(ultimo.creado_en)}${ultimo.encargado ? ' · ' + ultimo.encargado : ''}. Desde ahí se suma lo que entra y se resta lo que se usa.`
    : 'Todavía no se contó el local. Contá una vez para que el stock arranque bien.');

  function imprimir() {
    const vis = inv.visibles();
    if (!vis.length) return;
    document.querySelectorAll('.print-area').forEach(el => el.remove());
    const area = planillaConteo(nombreLocal || 'Local', fechaCorta(new Date().toISOString()), vis, stockDe, false);
    document.body.append(area); document.body.classList.add('imprimiendo');
    const limpiar = () => { document.body.classList.remove('imprimiendo'); area.remove(); window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar); window.print(); setTimeout(limpiar, 1000);
  }

  mount(root, cab, acciones, nota, inv.el);
  inv.pintar();
  return () => {};
}
