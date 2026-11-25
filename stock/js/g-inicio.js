// Gerencia · Inicio "¿Qué hacemos?": un mapa de 5 módulos, cada uno con su color y su número clave.
//   Stock (azul): para cuántos días alcanza lo más justo (reposición de Lo que hay, g-hay.js + reposicion.js).
//   Pedidos (verde): pedidos de los locales para aprobar (órdenes en borrador).
//   Costos (amarillo): costo comida % de los últimos 28 días con los platos que tienen todos los datos (costos.js).
//   Recetas (naranja): platos de la carta con receta; abajo, cuántos no tienen.
//   Problemas (rojo, a lo ancho): cierres que faltan y subas de precio no aceptadas; el primero escrito, o "Todo en orden".
// Cada número se carga por su lado (Promise.allSettled): si uno falla o no hay dato, esa tarjeta dice "Falta dato".
import { mount, h, sumarDias, jornadaISO, lsGet, elabora, fechaLarga } from './util.js';
import { ordenesPorEstado, subasDesde, hojaRango, cargarRecetas } from './api.js';
import { subasRecientes } from './compras-estado.js';
import { G, cargarG } from './datos.js';
import { tarjetaModulo } from './ui.js';
import { cierresDeAnoche, textoAlcanza } from './reposicion.js';
import { estadoReposicion, cargarReposicion } from './g-hay.js';
import { cargarCostos } from './g-costos.js';
import { resumenCostos, textoPct } from './costos.js';
import { claveVisto } from './g-decidir.js';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export async function render(root, ctx) {
  const fecha = jornadaISO();
  const [y, m, d] = fecha.split('-').map(Number);
  const nombre = (ctx.perfil && ctx.perfil.nombre) || '';
  const saludo = `${nombre ? 'Hola, ' + nombre + ' · ' : ''}${DIAS[new Date(y, m - 1, d).getDay()]} ${d}`;

  const stock = tarjetaModulo({ modulo: 'stock', rotulo: 'Stock', href: '#/hay' });
  const pedidos = tarjetaModulo({ modulo: 'pedidos', rotulo: 'Pedidos', href: '#/pedidos' });
  const costos = tarjetaModulo({ modulo: 'costos', rotulo: 'Costos', href: '#/costos' });
  const recetas = tarjetaModulo({ modulo: 'recetas', rotulo: 'Recetas', href: '#/recetas' });
  const problemas = tarjetaModulo({ modulo: 'problemas', rotulo: 'Problemas', href: '#/decidir', ancho: true });
  mount(root, h('header', { class: 'vista-head tg ini-head' }, h('p', { class: 'sub ini-hola', text: saludo }), h('h1', { class: 'titulo', text: '¿Qué hacemos?' })),
    h('div', { class: 'tm-grid' }, stock.el, pedidos.el, costos.el, recetas.el, problemas.el));

  const vivo = () => ctx.alive();
  const falta = (t) => t.set({});
  // Cada tarjeta por su lado: la que falla queda en "Falta dato" sin frenar a las demás.
  await Promise.allSettled([
    // ---- Stock: lo más justo de todos los locales ----
    (async () => {
      const R = estadoReposicion();
      await cargarReposicion(R);
      let min = null;
      for (const l of R.locs) for (const [pid, e] of (R.planes.get(l.id) || { items: new Map() }).items) {
        if (e.dias === null || e.dias === undefined || !isFinite(e.dias)) continue;
        if (!min || e.dias < min.dias) min = { dias: e.dias, p: G.prods.get(pid), l };
      }
      if (!vivo()) return;
      if (!min) return falta(stock);
      stock.set({ numero: textoAlcanza(min.dias), texto: 'Lo que hay', sub: `Lo más justo: ${min.p ? min.p.nombre : 'un producto'} en ${min.l.nombre}` });
    })().catch(() => vivo() && falta(stock)),
    // ---- Pedidos para aprobar ----
    ordenesPorEstado(['borrador']).then(os => {
      if (!vivo()) return;
      const n = (os || []).length;
      pedidos.set({ numero: n, texto: 'Para aprobar', sub: n ? (() => { const k = new Set(os.map(o => o.local_id)).size; return `${k} ${k === 1 ? 'local' : 'locales'}`; })() : 'Nada pendiente' });
    }).catch(() => vivo() && falta(pedidos)),
    // ---- Costos: costo comida global ----
    cargarCostos().then(dt => {
      if (!vivo()) return;
      const r = resumenCostos(dt.platos, dt.cat, dt.ventas);
      const pct = textoPct(r.pct);
      if (!pct) return costos.set({ texto: 'Falta dato', sub: r.total ? `${r.cubiertos} de ${r.total} platos con datos` : '' });
      costos.set({ numero: pct, texto: 'Costo comida', sub: `${r.cubiertos} de ${r.total} platos` });
    }).catch(() => vivo() && falta(costos)),
    // ---- Recetas: platos de la carta con receta ----
    Promise.all([cargarG(['prods'], () => {}), cargarRecetas()]).then(([, rs]) => {
      if (!vivo()) return;
      const con = new Set((rs || []).filter(r => (r.receta_items || []).length).map(r => r.producto_id));
      const platos = [...G.prods.values()].filter(p => p.categoria === 'Carta' && p.activo !== false);
      if (!platos.length) return falta(recetas);
      const n = platos.filter(p => con.has(p.id)).length;
      const sin = platos.length - n;
      recetas.set({ numero: n, texto: n === 1 ? 'Plato' : 'Platos', sub: sin ? `${sin} sin receta` : 'Todos con receta' });
    }).catch(() => vivo() && falta(recetas)),
    // ---- Problemas: cierres que faltan y subas sin aceptar ----
    (async () => {
      await cargarG(['locales', 'prods'], () => {});
      const elaboran = G.locales.filter(l => l.activo !== false && elabora(l.codigo));
      const desde = sumarDias(fecha, -7);
      const [rHojas, rSubas] = await Promise.allSettled([
        Promise.all(elaboran.map(l => hojaRango(l.id, desde, fecha).then(r => [l.id, r || []]))),
        subasDesde(desde)
      ]);
      if (rHojas.status === 'rejected' && rSubas.status === 'rejected') throw rHojas.reason;
      const textos = [];
      if (rHojas.status === 'fulfilled') {
        for (const c of cierresDeAnoche(new Map(rHojas.value), elaboran, fecha)) {
          if (c.hecho || !c.esperada) continue;
          textos.push(`${c.local.nombre} sin cierre ${c.esperada === sumarDias(fecha, -1) ? 'anoche' : 'del ' + fechaLarga(c.esperada)}`);
        }
      }
      if (rSubas.status === 'fulfilled') {
        for (const x of subasRecientes(rSubas.value || [], desde)) {
          const p = G.prods.get(x.producto_id);
          if (p && !lsGet(claveVisto(x))) textos.push(`${p.nombre} subió ${x.pct} %`);
        }
      }
      if (!vivo()) return;
      const incompleto = rHojas.status === 'rejected' || rSubas.status === 'rejected';
      if (!textos.length) return problemas.set(incompleto ? {} : { texto: 'Todo en orden', sub: '' });
      problemas.set({ numero: textos.length, texto: textos[0], sub: textos.length > 1 ? `y ${textos.length - 1} más` : '' });
    })().catch(() => vivo() && falta(problemas))
  ]);
}
