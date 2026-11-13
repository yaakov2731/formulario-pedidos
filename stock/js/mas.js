// Más: lista tipo Ajustes con lo que no está en la barra de abajo (encargado: Facturas y Notas; gerencia: Números,
// Cocina, Pagos, Catálogo y Notas). Abajo, con quién se entró y Cerrar sesión. Las filas vienen de main.js (ctx.mas).
import { mount, h } from './util.js';
import { icon, listaGrupo, filaLista, tituloGrande } from './ui.js';

export function render(root, ctx) {
  const filas = (ctx.mas || []).map(it => filaLista({ texto: it.label, sub: it.sub, icono: it.icono, href: '#/' + it.id, chevron: true, clase: 'mas-link', attrs: { 'data-nav': it.id } }));
  mount(root,
    tituloGrande('Más'),
    filas.length ? listaGrupo(null, filas) : null,
    listaGrupo(null, [filaLista({ texto: 'Entraste como', valor: ctx.quien, clase: 'mas-quien-fila' })]),
    h('button', { class: 'btn btn-ghost mas-salir', type: 'button', on: { click: () => ctx.salir() } }, icon('salir', 20), h('span', { text: 'Cerrar sesión' })));
}
