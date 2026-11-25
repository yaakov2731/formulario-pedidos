// Gerencia · Decidir (inicio): una bandeja con lo que necesita una decisión hoy, una tarjeta por cosa.
//   Pedidos: "Proveedor: n locales listos" (borradores de los locales por proveedor). El monto va solo si todos los
//     productos tienen precio cargado. Ver → Compras; Aprobar → abre ese proveedor en Compras (no aprueba con un toque).
//   Precio: "X subió n %" (subas de los últimos 7 días, compras-estado.js). Ver factura → Facturas; Aceptar → queda visto
//     en este equipo (localStorage, sin tocar el servidor).
//   Falta cierre: locales que abrieron y no cerraron (cierresDeAnoche de reposicion.js, con sus días de apertura).
//     Avisar al encargado: WhatsApp con el texto armado (sin número: elige el contacto) y el texto copiado.
// Sin nada pendiente: "Nada para decidir". El Tablero de antes sigue en Más → Tablero (g-hoy.js).
import { mount, h, fmtMoney, porTexto, sumarDias, jornadaISO, lsGet, lsSet, elabora, fechaLarga } from './util.js';
import { ordenesPorEstado, subasDesde, hojaRango, mensajeError } from './api.js';
import { subasRecientes } from './compras-estado.js';
import { G, cargarG, nombreLocal } from './datos.js';
import { esqueleto, banner, toast, tituloGrande, tarjetaDecidir, vacio } from './ui.js';
import { cierresDeAnoche } from './reposicion.js';

export const CLAVE_VER_PROV = 'stock:ver-prov';
const claveVisto = (x) => `decidir:suba:${x.producto_id}:${x.fecha}:${x.pct}`;
const verProveedor = (nombre) => { try { sessionStorage.setItem(CLAVE_VER_PROV, nombre); } catch (_e) { /* nada */ } };

export async function render(root, ctx) {
  const fecha = jornadaISO();
  const cabeza = (n) => tituloGrande(n === null ? 'Decidir' : n ? `${n} ${n === 1 ? 'cosa' : 'cosas'} para decidir` : 'Decidir', `Gerencia · ${fechaLarga(fecha)}`);
  mount(root, cabeza(null), esqueleto(3));
  try { await cargarG(['locales', 'provs', 'prods', 'precios'], () => {}); } catch (e) { return mount(root, cabeza(null), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;

  const locales = G.locales.filter(l => l.activo !== false);
  const elaboran = locales.filter(l => elabora(l.codigo));
  const desde = sumarDias(fecha, -7);
  const [rBorr, rSubas, rHojas] = await Promise.allSettled([
    ordenesPorEstado(['borrador']),
    subasDesde(desde),
    Promise.all(elaboran.map(l => hojaRango(l.id, desde, fecha).then(r => [l.id, r || []])))
  ]);
  if (!ctx.alive()) return;
  const errores = [rBorr, rSubas, rHojas].filter(r => r.status === 'rejected').map(r => mensajeError(r.reason));
  const tarjetas = [];
  const prov = (id) => (id && G.provs.get(id) ? G.provs.get(id).nombre : 'Sin proveedor');

  // ---- Pedidos listos por proveedor ----
  const borr = rBorr.status === 'fulfilled' ? rBorr.value || [] : [];
  const porProv = new Map();
  for (const o of borr) { const k = o.proveedor_id || ''; if (!porProv.has(k)) porProv.set(k, []); porProv.get(k).push(o); }
  for (const [pid, os] of [...porProv].sort((a, b) => porTexto(prov(a[0]), prov(b[0])))) {
    const locs = [...new Set(os.map(o => o.local_id))];
    const items = os.flatMap(o => (o.orden_items || []).filter(i => !i.excluido && Number(i.cantidad_pedida) > 0));
    const conPrecio = items.every(i => G.precios.get(i.producto_id) > 0);
    const monto = items.length && conPrecio ? items.reduce((s, i) => s + Number(i.cantidad_pedida) * G.precios.get(i.producto_id), 0) : null;
    const nombres = locs.map(nombreLocal).sort(porTexto).join(', ');
    tarjetas.push(tarjetaDecidir({ rotulo: 'Pedidos', tono: 'ink', titulo: `${prov(pid)}: ${locs.length} ${locs.length === 1 ? 'local listo' : 'locales listos'}`,
      sub: monto != null ? `${nombres} · ${fmtMoney(Math.round(monto))}` : nombres, attrs: { 'data-decidir': 'pedidos', 'data-prov': pid },
      acciones: [{ texto: 'Ver', href: '#/compras' }, { texto: 'Aprobar', principal: true, href: '#/compras', onClick: () => verProveedor(prov(pid)) }] }));
  }

  // ---- Subas de precio (solo las que no se aceptaron en este equipo) ----
  const subas = rSubas.status === 'fulfilled' ? subasRecientes(rSubas.value || [], desde).filter(x => G.prods.get(x.producto_id) && !lsGet(claveVisto(x))) : [];
  for (const x of subas.slice(0, 6)) {
    const p = G.prods.get(x.producto_id);
    const el = tarjetaDecidir({ rotulo: 'Precio', tono: 'warn', titulo: `${p.nombre} subió ${x.pct} %`,
      sub: [prov(x.proveedor_id), nombreLocal(p.local_id), `antes ${fmtMoney(x.previo)}`].join(' · '), attrs: { 'data-decidir': 'precio', 'data-producto': x.producto_id },
      acciones: [{ texto: 'Ver factura', href: '#/facturas' }, { texto: 'Aceptar', principal: true, onClick: () => { lsSet(claveVisto(x), true); el.remove(); contar(); toast('Listo: suba aceptada.', 'ok'); } }] });
    tarjetas.push(el);
  }

  // ---- Locales que no cerraron ----
  if (rHojas.status === 'fulfilled') {
    const hojaPorLocal = new Map(rHojas.value);
    for (const c of cierresDeAnoche(hojaPorLocal, elaboran, fecha)) {
      if (c.hecho || !c.esperada) continue;
      const cuando = c.esperada === sumarDias(fecha, -1) ? 'anoche' : `el ${fechaLarga(c.esperada)}`;
      const texto = `Hola, ¿cómo va? En la app no figura el cierre de ${c.local.nombre} de ${cuando}. ¿Lo podés cargar? Gracias.`;
      tarjetas.push(tarjetaDecidir({ rotulo: 'Falta cierre', tono: 'warn', titulo: `${c.local.nombre} no cerró ${cuando}`, attrs: { 'data-decidir': 'cierre', 'data-local': c.local.id },
        acciones: [{ texto: 'Avisar al encargado', principal: true, href: 'https://wa.me/?text=' + encodeURIComponent(texto), externo: true,
          onClick: () => { try { navigator.clipboard.writeText(texto).then(() => toast('Texto copiado: pegalo en el chat del encargado.', 'ok'), () => {}); } catch (_e) { /* nada */ } } }] }));
    }
  }

  const lista = h('div', { class: 'dec-lista' }, tarjetas);
  const titulo = h('div', {});
  function contar() {
    const n = lista.querySelectorAll('.dec').length;
    titulo.replaceChildren(cabeza(n));
    if (!n) lista.replaceChildren(vacio('Nada para decidir', 'Cuando un local mande un pedido, suba un precio o falte un cierre, aparece acá.'));
  }
  mount(root, titulo, errores.length ? banner('Parte de los datos no cargó: ' + errores[0], 'warn') : null, lista,
    h('p', { class: 'dec-pie' }, h('a', { href: '#/tablero', text: 'Ver el tablero de la semana' })));
  contar();
}
