// Gerencia · Ajustes: qué días abre cada local y si abre los feriados (locales.dias_abre y abre_feriados, 0032).
// Con esto la app sabe si lo que falta hay que comprarlo "para mañana" o para la próxima vez que abre. Abajo, los próximos
// feriados nacionales (feriados.js) y cómo calcula la app. Sin 0032 se ve igual pero no se puede guardar.
import { mount, h, elabora, porTexto, hoyISO, fechaLarga } from './util.js';
import { guardarLocal, hayColumnaDiasAbre, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, banner, toast, tituloGrande, listaGrupo, filaLista } from './ui.js';
import { diasDe, proximaApertura } from './reposicion.js';
import { proximosFeriados } from './feriados.js';

const DIAS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']];

export async function render(root, ctx) {
  mount(root, tituloGrande('Ajustes'), esqueleto(4));
  await cargarG(['locales']);
  if (!ctx.alive()) return;
  const puede = hayColumnaDiasAbre() && G.locales.some(l => 'dias_abre' in l);
  const hoy = hoyISO();
  const locs = G.locales.filter(l => l.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));

  const tarjeta = (l) => {
    let dias = new Set(diasDe(l)), fer = l.abre_feriados !== false, guardando = false;
    const sec = h('section', { class: 'aj-local', 'data-local': l.id });
    async function guardar(nuevoDias, nuevoFer) {
      if (!puede || guardando) return;
      const antes = [new Set(dias), fer];
      dias = nuevoDias; fer = nuevoFer; guardando = true; pintar();
      try {
        const d = [...dias].sort((a, b) => a - b);
        await guardarLocal(l.id, { dias_abre: d, abre_feriados: fer });
        l.dias_abre = d; l.abre_feriados = fer; guardando = false; pintar();
        toast(`${l.nombre}: guardado`, 'ok');
      } catch (e) {
        [dias, fer] = antes; guardando = false; pintar();
        toast('No se pudo guardar: ' + mensajeError(e), 'error');
      }
    }
    function pintar() {
      const loc = { dias_abre: [...dias], abre_feriados: fer };
      const px = proximaApertura(hoy, loc, undefined, true);
      mount(sec, h('div', { class: 'aj-h' }, h('h2', { text: l.nombre }), h('span', { class: 'cq-k', text: px ? (px.dias === 0 ? 'Abre hoy' : `Próxima apertura: ${fechaLarga(px.fecha)}`) : 'No abre ningún día' })),
        h('div', { class: 'chips aj-dias', role: 'group', 'aria-label': 'Días que abre ' + l.nombre }, DIAS.map(([n, t]) => h('button', { class: 'chip' + (dias.has(n) ? ' is-on' : ''), type: 'button', 'aria-pressed': dias.has(n) ? 'true' : 'false', 'data-dia': String(n), text: t, disabled: !puede || guardando,
          on: { click: () => { const d = new Set(dias); if (d.has(n)) d.delete(n); else d.add(n); guardar(d, fer); } } }))),
        h('label', { class: 'aj-fer' }, h('span', {}, h('b', { text: 'Abre los feriados' }), h('small', { text: 'Si el lunes es feriado, el domingo lo que falta pasa a ser "para mañana".' })),
          h('input', { type: 'checkbox', class: 'aj-switch', role: 'switch', checked: fer, disabled: !puede || guardando, 'aria-label': 'Abre los feriados · ' + l.nombre, on: { change: (e) => guardar(new Set(dias), e.target.checked) } })),
        !elabora(l.codigo) ? h('p', { class: 'cd-nota', text: 'No elabora: no entra en Comprar ni en Lo que hay (usa sus retiros).' }) : null);
    }
    pintar();
    return sec;
  };

  mount(root,
    tituloGrande('Ajustes', 'Con esto la app sabe si hay que comprar para mañana o para la próxima vez que abren.'),
    puede ? null : banner('Para guardar los días falta pegar en Supabase el SQL 0032_dias_abre_cierre_stock.sql. Mientras tanto la app usa viernes, sábado y domingo y los feriados.', 'warn'),
    h('h2', { class: 'lg-t aj-t', text: 'Días que abre cada local' }),
    h('div', { class: 'aj-lista' }, locs.map(tarjeta)),
    listaGrupo('Próximos feriados nacionales', proximosFeriados(hoy, 6).map(f => filaLista({ texto: f.nombre, valor: fechaLarga(f.fecha) })), { pie: 'Vienen cargados en la app. Se revisan cada año contra el calendario oficial.' }),
    listaGrupo('Cómo calcula', [h('p', { class: 'aj-como', text: 'Uso por día = lo que salió (ventas, cocina, merma) o apertura + lo que entró − cierre, repartido entre los días que abrió el local en las últimas 4 semanas. Pedir = uso por día × días que abre la semana − lo que quedó en el cierre − lo pedido sin recibir, redondeado al bulto. Sin al menos 2 semanas de datos el producto queda "Sin historial": la app no inventa un número.' })]));
}
