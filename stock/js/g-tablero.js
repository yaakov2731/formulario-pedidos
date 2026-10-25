// Gerencia · Tablero (inicio): semana actual contra la anterior, plata parada en stock, deuda, pagos sin avisar,
// pedidos por aprobar, faltantes más caros y datos pendientes. Una sola llamada: rpc tablero().
import { mount, h, fmtNum, fmtMoney, hoyISO, sumarDias } from './util.js';
import { tablero, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, banner, barraFila } from './ui.js';
import { fechaDMA } from './pagos-util.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Tablero' }), h('p', { class: 'sub', text: 'Cómo viene la semana' }));
  mount(root, cab, esqueleto(4));
  try { await cargarG(['locales'], () => {}); } catch (e) { return mount(root, cab, banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;

  const hoy = hoyISO();
  const dow = (new Date(hoy + 'T12:00:00').getDay() + 6) % 7; // lunes = 0
  const desde = sumarDias(hoy, -dow);
  let localId = null, datos = null, error = null, cargando = false, vez = 0;
  const zona = h('div', {});

  const chips = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': 'Local' }, [['', 'Todos los locales'], ...G.locales.filter((l) => l.activo).map((l) => [l.id, l.nombre])].map(([id, t]) =>
    h('button', { class: 'chip' + (id === '' ? ' is-on' : ''), type: 'button', text: t, 'aria-pressed': id === '' ? 'true' : 'false', 'data-local': id, on: { click: () => {
      localId = id || null;
      chips.querySelectorAll('.chip').forEach((b) => { const on = b.getAttribute('data-local') === id; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      cargar();
    } } })));

  async function cargar() {
    const mi = ++vez; cargando = true; error = null; pintar();
    try { const d = await tablero(localId, desde, hoy); if (mi !== vez) return; datos = d; }
    catch (e) { if (mi !== vez) return; error = mensajeError(e); datos = null; }
    cargando = false; pintar();
  }

  const variacion = (act, ant, colorear) => {
    act = Number(act); ant = Number(ant);
    if (!ant) return act ? h('span', { class: 'mute', text: 'sin semana anterior' }) : h('span', { class: 'mute', text: '—' });
    const pct = Math.round(((act - ant) / Math.abs(ant)) * 100);
    const cls = !colorear || pct === 0 ? 'mute' : (pct > 0 ? 'var-sube' : 'var-baja');
    return h('span', { class: cls, text: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)} %` });
  };
  const metrica = (titulo, clave, ir, colorear, d) => {
    const a = Number(d.actual[clave]), p = Number(d.anterior[clave]);
    return h('a', { class: 'tb-card', href: '#/' + ir, 'data-card': clave },
      h('span', { class: 'tb-card-t', text: titulo }), h('b', { class: 'tb-card-v', text: fmtMoney(a) }),
      h('span', { class: 'tb-card-n' }, 'Anterior ', h('b', { class: 'num', text: fmtMoney(p) }), ' · ', variacion(a, p, colorear)));
  };
  const lista = (filas) => h('ul', { class: 'tb-lista' }, filas.map(([k, v]) => h('li', {}, h('span', { text: k }), h('b', { class: 'num', text: v }))));
  const tarjeta = (clave, titulo, ir, tono, ...hijos) => h('a', { class: 'tb-card' + (tono ? ' tb-' + tono : ''), href: '#/' + ir, 'data-card': clave }, h('span', { class: 'tb-card-t', text: titulo }), ...hijos, h('span', { class: 'tb-ir', text: 'Ver detalle ›' }));

  function pintarDatos(d) {
    const barVs = (a, p) => { const max = Math.max(Number(a), Number(p), 1); return h('div', { class: 'vs-bar', 'aria-hidden': 'true' },
      h('div', {}, h('span', { text: 'Ahora' }), h('i', { style: `width:${Math.max(1, Math.round(Number(a) / max * 100))}%` })),
      h('div', {}, h('span', { text: 'Antes' }), h('i', { class: 'ant', style: `width:${Math.max(1, Math.round(Number(p) / max * 100))}%` }))); };
    const st = d.stock, de = d.deuda, ps = d.pagos_sin_avisar, pa = d.pedidos_por_aprobar, pe = d.pendientes;
    const maxStock = Math.max(...st.por_local.map((x) => Number(x.valor)), 1);
    const maxFal = Math.max(...d.faltantes.map((x) => Number(x.valor)), 1);
    const nPend = pe.sin_precio.n + pe.sin_proveedor.n + pe.sin_receta.n;
    const mp = d.actual.margen_pct;
    return [
      h('p', { class: 'sub', text: `Del ${fechaDMA(d.periodo.desde)} al ${fechaDMA(d.periodo.hasta)} contra el mismo tramo anterior (${fechaDMA(d.periodo.anterior_desde)} al ${fechaDMA(d.periodo.anterior_hasta)})` }),
      h('section', { class: 'tb-grid tb-metricas' },
        metrica('Ventas', 'ventas', 'analisis', true, d), metrica('Compras', 'compras', 'recibir', false, d),
        metrica('Costo de mercadería vendida', 'cmv', 'merma', false, d), metrica('Margen bruto estimado', 'margen', 'merma', true, d),
        h('div', { class: 'tb-card tb-ancho' }, h('span', { class: 'tb-card-t', text: 'Ventas, esta semana contra la anterior' }), barVs(d.actual.ventas, d.anterior.ventas),
          h('span', { class: 'tb-card-n', text: mp === null || mp === undefined ? 'Margen: sin ventas importadas todavía' : `Margen estimado ${fmtNum(mp, 1)} % de las ventas (los productos sin costo no restan)` }))),
      h('section', { class: 'tb-grid' },
        tarjeta('stock', 'Plata parada en stock', 'stock', null, h('b', { class: 'tb-card-v', text: fmtMoney(st.total) }),
          h('ul', { class: 'barras' }, st.por_local.map((x) => barraFila(x.nombre, fmtMoney(x.valor), Number(x.valor) / maxStock, x.sin_precio ? `${x.sin_precio} con stock y sin costo` : null)))),
        tarjeta('deuda', 'Deuda con proveedores', 'pagos', de.vencidas.n ? 'bad' : null, h('b', { class: 'tb-card-v', text: fmtMoney(de.total) }),
          h('span', { class: 'tb-card-n', text: de.vencidas.n ? `${de.vencidas.n} ${de.vencidas.n === 1 ? 'factura vencida' : 'facturas vencidas'} · ${fmtMoney(de.vencidas.total)}` : 'Sin facturas vencidas' }),
          de.proveedores.length ? lista(de.proveedores.map((x) => [x.nombre, fmtMoney(x.saldo)])) : null),
        tarjeta('sin-avisar', 'Pagos sin avisar', 'historial', ps.n ? 'warn' : 'ok', h('b', { class: 'tb-card-v', text: String(ps.n) }),
          h('span', { class: 'tb-card-n', text: ps.n ? `${fmtMoney(ps.total)} sin avisar a los proveedores` : 'Todos los proveedores están avisados' }),
          ps.items.length ? lista(ps.items.map((x) => [`${x.proveedor} · ${fechaDMA(x.fecha)}`, fmtMoney(x.monto)])) : null),
        tarjeta('por-aprobar', 'Pedidos por aprobar', 'pedidos', pa.n ? 'warn' : 'ok', h('b', { class: 'tb-card-v', text: String(pa.n) }),
          h('span', { class: 'tb-card-n', text: pa.n ? 'Esperan que los revises y los envíes' : 'No hay pedidos esperando' }),
          pa.items.length ? lista(pa.items.map((x) => [`${x.local} · ${x.proveedor || 'Sin proveedor'}`, `${x.lineas} ${x.lineas === 1 ? 'ítem' : 'ítems'}`])) : null),
        tarjeta('faltantes', 'Faltantes más caros', 'merma', null,
          d.faltantes.length ? h('ul', { class: 'barras' }, d.faltantes.map((x) => barraFila(x.nombre, fmtMoney(x.valor), Number(x.valor) / maxFal, `Faltan ${fmtNum(x.faltante, 2)} ${x.unidad_uso || ''} · ${x.local}`)))
            : h('span', { class: 'tb-card-n', text: 'Los conteos de la semana no dejaron faltantes.' })),
        tarjeta('pendientes', 'Datos pendientes', 'catalogo', nPend ? 'warn' : 'ok', h('b', { class: 'tb-card-v', text: String(nPend) }),
          lista([['Productos sin precio', String(pe.sin_precio.n)], ['Productos sin proveedor', String(pe.sin_proveedor.n)], ['Elaborados sin receta', String(pe.sin_receta.n)]]),
          h('span', { class: 'tb-card-n', text: nPend ? 'Sin estos datos el costo y el margen quedan incompletos' : 'Todo completo' })))
    ];
  }
  function pintar() { zona.replaceChildren(...(cargando && !datos ? [esqueleto(4)] : error ? [banner(error, 'error'), h('button', { class: 'btn btn-primary', type: 'button', text: 'Reintentar', on: { click: cargar } })] : datos ? pintarDatos(datos) : [])); }

  mount(root, cab, h('div', { class: 'toolbar' }, chips), zona);
  cargar();
}
