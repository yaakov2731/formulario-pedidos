// Encargado · Hoy (inicio): "Hola, <nombre>" y lo que toca ahora en botones grandes, lo pendiente arriba (el primero en la tinta)
// y lo hecho abajo con "✓ Hecho", la hora y cuántos productos se contaron. Armado con lo que ya hay cargado:
//   Abrir (apertura) → Pedir (lunes a miércoles; el viernes solo Florida) → Recibir mercadería (solo si hay un pedido en camino
//   que llega hoy) → Subir factura → Cerrar el día (después de las 18 h). Cada botón lleva a su pantalla, con "‹ Hoy" para volver.
// Locales que elaboran: Abrir → #/apertura y Cerrar → #/cierre (contar guiado, hoja.js); Pedir → #/pedir-prov.
// Shopping (no elabora): Abrir / Cerrar depósito por sector (#/hoja, la hoja por sector de siempre) y Retiros.
// Sin montos ni cantidades internas.
import { mount, h, lsGet, lsSet, jornadaISO, hoyISO, sumarDias, fechaLarga, esFlorida, esCarta, elabora, entregaHoy } from './util.js';
import { swr, cargarCatalogo, cargarLocales, cargarProveedoresBasico, misOrdenes, hojaDelDia, sinHojaSQL, mensajeError } from './api.js';
import { esqueleto, banner, botonGrande, desdeHoy } from './ui.js';
import { sectoresDe, TODO_EL_LOCAL, PROVEEDOR } from './hoja.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
export const claveFactura = (lid, fecha) => 'factura-subida:' + lid + ':' + fecha;
const cabeza = (arriba, nombre) => h('header', { class: 'vista-head hoy-top' }, h('small', { text: arriba }), h('h1', { class: 'titulo', text: nombre ? `Hola, ${nombre}` : 'Hoy' }));

export async function render(root, ctx) {
  const lid = ctx.perfil.local_id;
  const shopping = !elabora(ctx.codigoLocal);
  const fecha = jornadaISO();
  let prods = [], local = null, provs = new Map(), ordenes = [], movs = [], sinSQL = false, error = null;
  const nombre = String(lsGet('nombre') || ctx.nombreGuardado || '').trim().split(/\s+/)[0] || '';
  mount(root, cabeza(fechaLarga(fecha), nombre), esqueleto(4));
  await Promise.allSettled([
    swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = d || []; }),
    swr('locales', cargarLocales, (d) => { local = (d || []).find(x => x.id === lid) || null; }),
    swr('provb', cargarProveedoresBasico, (d) => { provs = new Map((d || []).map(p => [p.id, p])); }),
    misOrdenes(lid).then(r => { ordenes = r || []; }).catch(e => { error = mensajeError(e); }),
    hojaDelDia(lid, fecha).then(r => { movs = r || []; }).catch(e => { if (sinHojaSQL(e)) sinSQL = true; else error = mensajeError(e); })
  ]);
  if (!ctx.alive()) return;

  const ahora = new Date();
  const dow = ahora.getDay(), h24 = ahora.getHours();
  const tarde = h24 >= 18 || h24 < 6;
  const lunes = sumarDias(hoyISO(), -((dow + 6) % 7));
  const activos = prods.filter(p => p.activo !== false && !esCarta(p) && !p.oculto);
  const sectores = activos.length ? [...sectoresDe(activos).keys()] : [];
  const de = (s, tipo) => movs.filter(m => m.sector === s && m.tipo === tipo);
  const nombreSector = (s, verbo) => (shopping ? `${verbo} depósito` : `${verbo} ${s === TODO_EL_LOCAL ? 'la hoja' : s}`);
  const subSector = (s) => (shopping && s !== TODO_EL_LOCAL && sectores.length > 1 ? s : null);
  const claveSector = 'hoja-sector:' + lid + ':' + fecha;
  const aHoja = (s) => () => { if (s) lsSet(claveSector, s); desdeHoy('hoja'); };
  const ir = (id) => () => desdeHoy(id);

  const pendientes = [], hechas = [];
  const hecho = (texto, sub) => hechas.push({ texto, sub });
  const tarea = (clave, texto, sub, href, onClick) => pendientes.push({ clave, texto, sub, href, onClick });
  const contados = (tipo) => new Set(movs.filter(m => m.tipo === tipo).map(m => m.producto_id)).size;
  const nDeN = (tipo) => `${contados(tipo)} de ${activos.length}`;

  // 1 · Abrir: los locales que elaboran cuentan todo el local de una (contar guiado); el Shopping, cada sector del depósito.
  const hayAp = movs.some(m => m.tipo === 'apertura'), hayCi = movs.some(m => m.tipo === 'cierre');
  const ultima = (tipo) => { const xs = movs.filter(m => m.tipo === tipo); return xs.length ? hora(xs[xs.length - 1].creado_en) : ''; };
  if (!sinSQL && !shopping && activos.length) {
    if (hayAp) hecho('Apertura', `${ultima('apertura')} · ${nDeN('apertura')}`);
    else tarea('abrir', 'Abrir el local', `${activos.length} ${activos.length === 1 ? 'producto' : 'productos'} · contá lo que hay`, '#/apertura', ir('apertura'));
  }
  if (!sinSQL && shopping) for (const s of sectores) {
    const ap = de(s, 'apertura');
    if (ap.length) hecho(nombreSector(s, 'Abrir'), `${subSector(s) ? subSector(s) + ' · ' : ''}${hora(ap[0].creado_en)}`);
    else tarea('abrir', nombreSector(s, 'Abrir'), subSector(s) || 'Contá lo que hay al abrir', '#/hoja', aHoja(s));
  }

  // 2 · Pedido de la semana: de lunes a miércoles a todos; el viernes solo a Florida.
  const deLaSemana = ordenes.filter(o => o.estado !== 'cancelada' && String(o.creado_en).slice(0, 10) >= lunes);
  if (dow >= 1 && dow <= 3) {
    if (deLaSemana.length) hecho('Pedido de la semana', `${deLaSemana.length} ${deLaSemana.length === 1 ? 'pedido enviado' : 'pedidos enviados'}`);
    else tarea('pedir', 'Pedir para la semana', dow === 3 ? 'Por proveedor · cierra hoy' : 'Por proveedor · cierra el miércoles', '#/pedir-prov', ir('pedir-prov'));
  } else if (dow === 5) {
    const florida = [...provs.values()].find(p => esFlorida(p.nombre));
    if (florida) {
      if (deLaSemana.some(o => o.proveedor_id === florida.id)) hecho('Pedido a ' + florida.nombre, 'Enviado');
      else tarea('pedir', 'Pedir a ' + florida.nombre, 'Hoy solo se pide a Florida', '#/pedir-prov/' + florida.id, ir('pedir-prov'));
    }
  }

  // 3 · Llegó mercadería: pedidos ya mandados al proveedor que entrega hoy. Se anota en la hoja (+ Entró · Proveedor).
  const enCamino = ordenes.filter(o => o.estado === 'enviada' && (!o.proveedor_id || entregaHoy((provs.get(o.proveedor_id) || {}).dias_entrega, dow)));
  const nombresProv = [...new Set(enCamino.map(o => (provs.get(o.proveedor_id) || {}).nombre || 'Proveedor'))];
  const entroHoy = movs.filter(m => m.tipo === 'entro' && m.otro === PROVEEDOR);
  const llegaTx = `${nombresProv.join(' · ')} ${nombresProv.length === 1 ? 'llega' : 'llegan'} hoy`;
  if (!shopping) {
    // En los locales que elaboran lo que llega se carga con la factura (la apertura de mañana ya lo suma).
    if (nombresProv.length && lsGet(claveFactura(lid, fecha))) hecho('Factura subida');
    else if (nombresProv.length) tarea('llego', 'Recibir mercadería', llegaTx + ' · subí la factura', '#/subir-factura', ir('subir-factura'));
  } else if (entroHoy.length) hecho('Mercadería anotada', `${entroHoy.length} ${entroHoy.length === 1 ? 'producto' : 'productos'} en la hoja`);
  else if (nombresProv.length && !sinSQL) tarea('llego', 'Recibir mercadería', llegaTx, '#/hoja', aHoja(null));

  // 4 · Subir la factura de lo que llegó hoy (Shopping: lo anotado en la hoja).
  if (shopping && entroHoy.length) {
    if (lsGet(claveFactura(lid, fecha))) hecho('Factura subida');
    else tarea('factura', 'Subir factura', 'De lo que llegó hoy', '#/subir-factura', ir('subir-factura'));
  }

  // 5 · Cerrar, después de las 18 h (el cierre sigue a ciegas: no muestra la apertura).
  if (!sinSQL && !shopping && activos.length) {
    if (hayCi) hecho('Cierre', `${ultima('cierre')} · ${nDeN('cierre')}`);
    else if (tarde && hayAp) tarea('cerrar', 'Cerrar el día', `${activos.length} ${activos.length === 1 ? 'producto' : 'productos'} · contá lo que queda`, '#/cierre', ir('cierre'));
  }
  if (!sinSQL && shopping) for (const s of sectores) {
    const ci = de(s, 'cierre');
    if (ci.length) hecho(nombreSector(s, 'Cerrar'), `${subSector(s) ? subSector(s) + ' · ' : ''}${hora(ci[ci.length - 1].creado_en)}`);
    else if (tarde && de(s, 'apertura').length) tarea('cerrar', nombreSector(s, 'Cerrar'), subSector(s) || 'Contá lo que queda', '#/hoja', aHoja(s));
  }

  const arriba = `${local ? local.nombre + ' · ' : ''}${fechaLarga(fecha)}`;
  // A la noche lo que más urge es cerrar: va primero.
  pendientes.sort((a, b) => (b.clave === 'cerrar') - (a.clave === 'cerrar'));
  const botones = pendientes.map((t, n) => botonGrande({ titulo: t.texto, sub: t.sub, principal: n === 0, href: t.href, onClick: t.onClick, attrs: { 'data-tarea': t.clave } }));
  // Shopping: Retiros a mano siempre (qué sale del depósito y a dónde va).
  if (shopping) botones.push(botonGrande({ titulo: 'Anotar un retiro', sub: 'Qué sale del depósito y a dónde va', href: '#/retiros', onClick: ir('retiros'), attrs: { 'data-tarea': 'retiros' } }));
  mount(root,
    cabeza(arriba, nombre),
    error ? banner(error, 'warn') : null,
    sinSQL ? banner('Falta activar la hoja por sector en el servidor.', 'warn') : null,
    pendientes.length ? null : h('div', { class: 'hoy-vacio empty' }, h('b', { class: 'empty-t', text: 'Todo listo por hoy' }), h('span', { text: 'Cuando haya algo para hacer, aparece acá.' })),
    botones.length ? h('div', { class: 'bg-lista hoy-lista' }, botones) : null,
    hechas.length ? h('h2', { class: 'lg-t hoy-hechos-t', text: 'Hecho' }) : null,
    hechas.length ? h('div', { class: 'bg-lista hoy-hechas' }, hechas.map(x => botonGrande({ titulo: x.texto, sub: x.sub, hecho: true, attrs: { 'data-hecho': x.texto } }))) : null);
}
