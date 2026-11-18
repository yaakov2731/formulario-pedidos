// Gerencia · Hoy (inicio, reemplaza al Tablero): lo que necesita una decisión, en listas agrupadas.
//   Arriba, una línea con ventas, compras y margen de la semana (rpc tablero). Después: pedidos para aprobar por proveedor,
//   entregas de hoy, facturas por vencer en 7 días, pérdida de la semana por local (perdida.js: sin explicar + merma, a costo;
//   toca → Stock → Control → Pérdida), diferencias del día en $ (hoja por sector, a costo) y locales sin pedido
//   o sin cierre, y subas de precio de los últimos 7 días (más de 5 % contra la compra anterior al mismo proveedor; sin
//   historial de precios la sección no aparece). Lo que no está cargado dice "Falta cargar"; nunca se inventa un número.
import { mount, h, fmtNum, fmtMoney, hoyISO, sumarDias, jornadaISO, lsSet, porTexto, entregaHoy } from './util.js';
import { tablero, facturasLista, ordenesPorEstado, ordenesHistorial, hojaRango, movimientosDesde, sinHojaSQL, subasDesde, mensajeError } from './api.js';
import { subasRecientes } from './compras-estado.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, vacio, banner, listaGrupo, filaLista, tituloGrande, selectorLocal, desdeHoy } from './ui.js';
import { fechaDMA } from './pagos-util.js';
import { calcularSector, TODOS, perdidaSemana, hayPerdida, lunesDe, deJornada } from './perdida.js';

const MAX_FILAS = 6;
// En la línea de la semana los millones van abreviados ("$ 4,12 M") para que entren en el celular; el monto completo queda en el title.
const plataCorta = (n) => (Math.abs(n) >= 1e6 ? `$ ${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 2 })} M` : fmtMoney(n));
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const diaCorto = (iso) => { const d = new Date(iso + 'T12:00:00'); return `${d.toLocaleDateString('es-AR', { weekday: 'short' }).replace(/[.,]/g, '')} ${d.getDate()}/${d.getMonth() + 1}`; };

// Diferencia del día de un local: Vendido − Consumo de todos los sectores, a costo. Solo lo que da negativo (faltante).
export function diferenciaDia(movsDia, ventasDia) {
  const filas = calcularSector(TODOS, movsDia, ventasDia, G.prods, G.precios);
  const conDif = filas.filter(r => r.dif != null && r.dif < 0);
  return {
    completos: filas.filter(r => r.completo).length,
    productos: conDif.length,
    plata: conDif.reduce((s, r) => s + (r.valorDif || 0), 0),
    sinCosto: conDif.filter(r => r.valorDif == null).length
  };
}

export async function render(root, ctx) {
  mount(root, tituloGrande('Hoy'), esqueleto(4));
  try { await cargarG(['locales', 'provs'], () => {}); } catch (e) { return mount(root, tituloGrande('Hoy'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;

  const locales = G.locales.filter(l => l.activo);
  const sel = selectorLocal({ locales: locales.map(l => ({ id: l.id, nombre: l.nombre })), todos: 'Todos los locales', clave: 'g:hoy-local', onChange: () => cargar() });
  const zona = h('div', { class: 'gh' });
  mount(root, tituloGrande('Hoy', null, { accion: sel.el }), zona);
  let vez = 0;

  async function cargar() {
    const mi = ++vez;
    const localId = sel.valor();
    const enScope = (lid) => !localId || lid === localId;
    const ahora = new Date();
    const hoy = hoyISO(), dow = ahora.getDay(), h24 = ahora.getHours();
    const lunes = sumarDias(hoy, -((dow + 6) % 7));
    zona.replaceChildren(esqueleto(4));
    const r = await Promise.allSettled([tablero(localId, lunes, hoy), facturasLista(true), ordenesPorEstado(['borrador', 'aprobada', 'enviada']), ordenesHistorial(lunes)]);
    if (mi !== vez || !ctx.alive()) return;
    const [rTab, rFac, rViv, rHist] = r;
    const errores = r.filter(x => x.status === 'rejected').map(x => mensajeError(x.reason));
    const tab = rTab.status === 'fulfilled' ? rTab.value : null;
    const porId = new Map();
    for (const o of [...(rViv.value || []), ...(rHist.value || [])]) porId.set(o.id, o);
    const ordenes = [...porId.values()].filter(o => enScope(o.local_id));
    const prov = (id) => (id && G.provs.get(id) ? G.provs.get(id).nombre : 'Sin proveedor');
    const items = (o) => (o.orden_items || []).filter(i => !i.excluido && Number(i.cantidad_pedida) > 0).length;

    // ---- línea de la semana (ventas, compras, margen) ----
    const celda = (k, v, falta, completo) => h('span', { class: 'gh-sem-c' + (falta ? ' is-falta' : ''), 'data-sem': k.toLowerCase(), title: completo || null }, h('span', { class: 'gh-sem-k', text: k }), h('b', { class: 'gh-sem-v num', text: v }));
    let semana;
    if (!tab) semana = h('div', { class: 'gh-sem' }, celda('Ventas', 'Sin datos', true), celda('Compras', 'Sin datos', true), celda('Margen', 'Sin datos', true));
    else {
      const ven = Number(tab.actual && tab.actual.ventas) || 0, com = Number(tab.actual && tab.actual.compras) || 0;
      const mp = tab.actual ? tab.actual.margen_pct : null;
      const sinCosto = tab.pendientes && tab.pendientes.sin_precio ? Number(tab.pendientes.sin_precio.n) || 0 : 0;
      const margen = !ven ? ['Sin historial todavía', true] : (mp == null || sinCosto ? ['Falta cargar costos', true] : [`${fmtNum(mp, 0)} %`, false]);
      semana = h('a', { class: 'gh-sem', href: '#/resumen', 'aria-label': 'Semana: ventas, compras y margen', on: { click: () => desdeHoy('resumen') } },
        celda('Ventas', ven ? plataCorta(ven) : 'Falta cargar', !ven, ven ? fmtMoney(ven) : null), celda('Compras', plataCorta(com), false, fmtMoney(com)), celda('Margen', margen[0], margen[1]));
    }

    const grupos = [];
    const recortar = (filas, href, total) => (filas.length > MAX_FILAS
      ? [...filas.slice(0, MAX_FILAS), filaLista({ texto: `Ver todo (${total})`, href, chevron: true, clase: 'gh-ver' })] : filas);

    // ---- pedidos para aprobar, por proveedor ----
    const borr = ordenes.filter(o => o.estado === 'borrador');
    if (borr.length) {
      const porProv = new Map();
      for (const o of borr) { const k = o.proveedor_id || ''; if (!porProv.has(k)) porProv.set(k, []); porProv.get(k).push(o); }
      const filas = [...porProv].map(([pid, os]) => ({ pid, os, n: os.reduce((s, o) => s + items(o), 0) }))
        .sort((a, b) => porTexto(prov(a.pid), prov(b.pid)))
        .map(({ pid, os, n }) => filaLista({ texto: prov(pid), sub: [...new Set(os.map(o => nombreLocal(o.local_id)))].sort(porTexto).join(' · '), valor: plural(n, 'ítem', 'ítems'),
          href: '#/compras', chevron: true, clase: 'gh-fila', attrs: { 'data-grupo': 'aprobar', 'data-prov': pid }, onClick: () => desdeHoy('compras') }));
      grupos.push(listaGrupo('Para aprobar', recortar(filas, '#/compras', filas.length), { clase: 'gh-aprobar' }));
    }

    // ---- entregas de hoy: pedidos mandados a proveedores que entregan hoy ----
    const env = ordenes.filter(o => o.estado === 'enviada' && entregaHoy((G.provs.get(o.proveedor_id) || {}).dias_entrega, dow));
    if (env.length) {
      const filas = env.sort((a, b) => porTexto(prov(a.proveedor_id), prov(b.proveedor_id))).map(o => filaLista({ texto: prov(o.proveedor_id), sub: nombreLocal(o.local_id),
        valor: plural(items(o), 'ítem', 'ítems'), href: '#/recibir', chevron: true, clase: 'gh-fila', attrs: { 'data-grupo': 'entregas', 'data-orden': o.id }, onClick: () => desdeHoy('recibir') }));
      grupos.push(listaGrupo('Entregas de hoy', recortar(filas, '#/recibir', filas.length), { clase: 'gh-entregas' }));
    }

    // ---- facturas que vencen en 7 días (y las ya vencidas, primero) ----
    const tope = sumarDias(hoy, 7);
    const fac = (rFac.value || []).filter(f => f.vencimiento && String(f.vencimiento).slice(0, 10) <= tope && Number(f.pendiente) >= 1)
      .sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento)));
    if (fac.length) {
      const filas = fac.map(f => { const v = String(f.vencimiento).slice(0, 10); const vencida = v < hoy;
        return filaLista({ texto: prov(f.proveedor_id), sub: vencida ? 'Venció el ' + fechaDMA(v).slice(0, 5) : v === hoy ? 'Vence hoy' : 'Vence el ' + diaCorto(v),
          valor: fmtMoney(f.pendiente), href: '#/facturas', chevron: true, clase: 'gh-fila' + (vencida ? ' is-vencida' : ''), attrs: { 'data-grupo': 'facturas', 'data-factura': f.id }, onClick: () => desdeHoy('facturas') }); });
      grupos.push(listaGrupo('Facturas por vencer', recortar(filas, '#/facturas', filas.length), { clase: 'gh-facturas' }));
    }

    // ---- diferencias del día y locales sin pedido o sin cierre (se completan después: leen la hoja de cada local) ----
    const zonaHojas = h('div', { class: 'gh-hojas' }, listaGrupo('Pérdida de la semana', [filaLista({ texto: 'Revisando las hojas…', clase: 'gh-cargando' })]));
    // pendientes: cuántos grupos de las hojas piden algo (la pérdida de la semana se muestra siempre, pero no es una tarea).
    const pintar = (conHojas, pendientes = 0) => {
      const hayAlgo = grupos.length || pendientes;
      zona.replaceChildren(...[semana, errores.length ? banner('Parte de los datos no cargó: ' + errores[0], 'warn') : null,
        ...grupos, !hayAlgo && conHojas !== undefined ? vacio('Todo listo por hoy') : null, conHojas === undefined ? zonaHojas : conHojas].filter(Boolean));
    };
    pintar(undefined);

    const desdeSubas = sumarDias(hoy, -7);
    const pSubas = subasDesde(desdeSubas).catch(() => null);
    const lista = localId ? locales.filter(l => l.id === localId) : locales;
    const jornada = jornadaISO(), ayer = sumarDias(jornada, -1), lunesJ = lunesDe(jornada);
    const desdeHoja = ayer < lunesJ ? ayer : lunesJ; // la hoja de la semana (pérdida) y la de ayer (diferencias, cierres)
    const [y, m, d] = ayer.split('-').map(Number);
    const finAyer = new Date(y, m - 1, d + 1, 6);
    const [yh, mh, dh] = desdeHoja.split('-').map(Number);
    const desdeMovs = new Date(yh, mh - 1, dh, 6);
    try { await cargarG(['prods', 'precios'], () => {}); } catch (_e) { /* sin costos: las diferencias dicen "Falta cargar costos" */ }
    const hojas = await Promise.all(lista.map(async (l) => {
      try {
        const [hm, mv] = await Promise.all([hojaRango(l.id, desdeHoja, jornada), movimientosDesde(l.id, desdeMovs.toISOString())]);
        return { l, hm: hm || [], mv: mv || [] };
      } catch (e) { return { l, error: e }; }
    }));
    if (mi !== vez || !ctx.alive()) return;

    const sinSQL = hojas.some(x => x.error && sinHojaSQL(x.error));
    const difs = [], faltan = new Map(), perdidas = [];
    const marcar = (l, motivo) => { if (!faltan.has(l.id)) faltan.set(l.id, { l, motivos: [] }); faltan.get(l.id).motivos.push(motivo); };
    for (const x of hojas) {
      if (x.error) continue;
      const deDia = (f) => x.hm.filter(r => r.fecha === f);
      const vtas = (f) => (f === ayer ? deJornada(x.mv, ayer) : x.mv.filter(r => Date.parse(r.creado_en) >= finAyer.getTime()));
      perdidas.push({ l: x.l, ...perdidaSemana({ hoja: x.hm, movs: x.mv, desde: lunesJ, hasta: jornada, prods: G.prods, precios: G.precios }) });
      let dia = 'Hoy', r = diferenciaDia(deDia(jornada), vtas(jornada));
      if (!r.completos) { dia = 'Ayer'; r = diferenciaDia(deDia(ayer), vtas(ayer)); }
      if (r.productos) difs.push({ l: x.l, dia, ...r });
      // Sin cierre: la jornada de ayer quedó sin hoja o con algún sector abierto y sin cerrar.
      const hAyer = deDia(ayer);
      const abiertos = new Set(hAyer.filter(r2 => r2.tipo === 'apertura').map(r2 => r2.sector));
      const cerrados = new Set(hAyer.filter(r2 => r2.tipo === 'cierre').map(r2 => r2.sector));
      if (!hAyer.length || [...abiertos].some(s => !cerrados.has(s))) marcar(x.l, 'Sin cierre ayer');
    }
    // Sin pedido: desde el miércoles a la tarde, los locales que no mandaron ningún pedido esta semana.
    if ((dow === 3 && h24 >= 14) || dow >= 4 || dow === 0) {
      const conPedido = new Set(ordenes.filter(o => o.estado !== 'cancelada' && String(o.creado_en).slice(0, 10) >= lunes).map(o => o.local_id));
      for (const l of lista) if (!conPedido.has(l.id)) marcar(l, 'Sin pedido esta semana');
    }

    const bloques = [];
    // ---- pérdida de la semana por local: un número (sin explicar + merma, a costo), de mayor a menor ----
    if (perdidas.length) {
      const filas = perdidas.sort((a, b) => (hayPerdida(b) - hayPerdida(a)) || (b.total - a.total) || porTexto(a.l.nombre, b.l.nombre)).map(x => {
        const con = hayPerdida(x);
        const sinCosto = x.sinCosto.length ? ` · falta costo de ${x.sinCosto.length}` : '';
        const sub = !con ? 'Sin cierres esta semana'
          : (x.diasConCierre ? `Sin explicar ${fmtMoney(x.sinExplicar)}` : 'Sin explicar: faltan cierres') + ` · Merma ${fmtMoney(x.merma)}${sinCosto}`;
        return filaLista({ texto: x.l.nombre, sub, valor: con ? fmtMoney(x.total) : 'Falta cargar', href: '#/perdida', chevron: true,
          clase: 'gh-fila gh-perdida' + (con && x.total > 0 ? ' is-perdida' : ''), attrs: { 'data-grupo': 'perdida', 'data-local': x.l.id },
          onClick: () => { lsSet('g:local', x.l.id); desdeHoy('perdida'); } });
      });
      bloques.push(listaGrupo('Pérdida de la semana', filas, { clase: 'gh-perdidas' }));
    }
    if (difs.length) {
      const filas = difs.sort((a, b) => a.plata - b.plata).map(x => filaLista({ texto: x.l.nombre,
        sub: `${x.dia} · ${plural(x.productos, 'producto', 'productos')}${x.sinCosto ? ` · falta costo de ${x.sinCosto}` : ''}`,
        valor: x.plata ? '−' + fmtMoney(Math.abs(x.plata)) : 'Falta cargar costos', href: '#/sector', chevron: true, clase: 'gh-fila gh-dif', attrs: { 'data-grupo': 'diferencias', 'data-local': x.l.id },
        onClick: () => { lsSet('g:local', x.l.id); desdeHoy('sector'); } }));
      bloques.push(listaGrupo('Diferencias del día', filas, { clase: 'gh-diferencias' }));
    }
    if (faltan.size) {
      const filas = [...faltan.values()].sort((a, b) => porTexto(a.l.nombre, b.l.nombre)).map(({ l, motivos }) => {
        const sinPedido = motivos.includes('Sin pedido esta semana');
        return filaLista({ texto: l.nombre, sub: motivos.join(' · '), href: sinPedido ? '#/pedidos' : '#/sector', chevron: true, clase: 'gh-fila', attrs: { 'data-grupo': 'locales', 'data-local': l.id },
          onClick: () => { lsSet('g:local', l.id); desdeHoy(sinPedido ? 'pedidos' : 'sector'); } });
      });
      bloques.push(listaGrupo('Locales', filas, { clase: 'gh-locales' }));
    }
    // ---- subas de precio de la semana (solo con historial de precios) ----
    const histPrecios = await pSubas;
    if (mi !== vez || !ctx.alive()) return;
    const subas = subasRecientes(histPrecios || [], desdeSubas).filter(x => { const p = G.prods.get(x.producto_id); return p && enScope(p.local_id); });
    if (subas.length) {
      const filas = subas.slice(0, MAX_FILAS).map(x => { const p = G.prods.get(x.producto_id);
        return filaLista({ texto: p.nombre, sub: [prov(x.proveedor_id), localId ? null : nombreLocal(p.local_id), `antes ${fmtMoney(x.previo)}`].filter(Boolean).join(' · '),
          valor: `+${x.pct} %`, clase: 'gh-fila gh-suba', attrs: { 'data-grupo': 'subas', 'data-producto': x.producto_id } }); });
      bloques.push(listaGrupo('Subas de precio', filas, { clase: 'gh-subas', pie: subas.length > MAX_FILAS ? `Y ${plural(subas.length - MAX_FILAS, 'suba más', 'subas más')} en los últimos 7 días` : null }));
    }
    if (sinSQL) bloques.push(banner('Falta activar la hoja por sector en el servidor: no se pueden ver diferencias ni cierres.', 'warn'));
    pintar(bloques.length ? h('div', { class: 'gh-hojas' }, ...bloques) : null, bloques.length - (perdidas.length ? 1 : 0));
  }

  await cargar();
}
