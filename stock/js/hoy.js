// Encargado · Hoy: lo que toca ahora, en orden, armado por la app con lo que ya hay cargado:
//   Abrir sector → Hacer el pedido (lunes a miércoles; el viernes solo Florida) → Llegó mercadería → Subir factura →
//   Cerrar sector (después de las 18 h). Cada fila lleva a su pantalla, que muestra "‹ Hoy" para volver.
// En el Shopping el sector es el depósito: "Abrir depósito" / "Cerrar depósito". Sin montos ni cantidades internas.
import { mount, lsGet, lsSet, jornadaISO, hoyISO, sumarDias, fechaLarga, esFlorida, esCarta, elabora, entregaHoy } from './util.js';
import { swr, cargarCatalogo, cargarLocales, cargarProveedoresBasico, misOrdenes, hojaDelDia, sinHojaSQL, mensajeError } from './api.js';
import { esqueleto, vacio, banner, listaGrupo, filaLista, tituloGrande, desdeHoy } from './ui.js';
import { sectoresDe, TODO_EL_LOCAL, PROVEEDOR } from './hoja.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
export const claveFactura = (lid, fecha) => 'factura-subida:' + lid + ':' + fecha;

export async function render(root, ctx) {
  const lid = ctx.perfil.local_id;
  const shopping = !elabora(ctx.codigoLocal);
  const fecha = jornadaISO();
  let prods = [], local = null, provs = new Map(), ordenes = [], movs = [], sinSQL = false, error = null;
  mount(root, tituloGrande('Hoy'), esqueleto(4));
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
  const hecho = (texto, sub) => hechas.push(filaLista({ texto, sub, check: true, clase: 'hoy-hecho' }));
  const tarea = (clave, texto, sub, href, onClick) => pendientes.push(filaLista({ texto, sub, href, onClick, chevron: true, clase: 'hoy-tarea', attrs: { 'data-tarea': clave } }));

  // 1 · Abrir cada sector (o el depósito)
  if (!sinSQL) for (const s of sectores) {
    const ap = de(s, 'apertura');
    if (ap.length) hecho(nombreSector(s, 'Abrir'), `${subSector(s) ? subSector(s) + ' · ' : ''}${hora(ap[0].creado_en)}`);
    else tarea('abrir', nombreSector(s, 'Abrir'), subSector(s) || 'Contá lo que hay al abrir', '#/hoja', aHoja(s));
  }

  // 2 · Pedido de la semana: de lunes a miércoles a todos; el viernes solo a Florida.
  const deLaSemana = ordenes.filter(o => o.estado !== 'cancelada' && String(o.creado_en).slice(0, 10) >= lunes);
  if (dow >= 1 && dow <= 3) {
    if (deLaSemana.length) hecho('Pedido de la semana', `${deLaSemana.length} ${deLaSemana.length === 1 ? 'pedido enviado' : 'pedidos enviados'}`);
    else tarea('pedir', 'Hacer el pedido', dow === 3 ? 'Cierra hoy' : 'Cierra el miércoles', '#/pedir', ir('pedir'));
  } else if (dow === 5) {
    const florida = [...provs.values()].find(p => esFlorida(p.nombre));
    if (florida) {
      if (deLaSemana.some(o => o.proveedor_id === florida.id)) hecho('Pedido a ' + florida.nombre, 'Enviado');
      else tarea('pedir', 'Pedido a ' + florida.nombre, 'Hoy solo se pide a Florida', '#/pedir', ir('pedir'));
    }
  }

  // 3 · Llegó mercadería: pedidos ya mandados al proveedor que entrega hoy. Se anota en la hoja (+ Entró · Proveedor).
  const enCamino = ordenes.filter(o => o.estado === 'enviada' && (!o.proveedor_id || entregaHoy((provs.get(o.proveedor_id) || {}).dias_entrega, dow)));
  const nombresProv = [...new Set(enCamino.map(o => (provs.get(o.proveedor_id) || {}).nombre || 'Proveedor'))];
  const entroHoy = movs.filter(m => m.tipo === 'entro' && m.otro === PROVEEDOR);
  if (entroHoy.length) hecho('Mercadería anotada', `${entroHoy.length} ${entroHoy.length === 1 ? 'producto' : 'productos'} en la hoja`);
  else if (nombresProv.length && !sinSQL) tarea('llego', 'Llegó mercadería', nombresProv.join(' · '), '#/hoja', aHoja(null));

  // 4 · Subir la factura de lo que llegó hoy.
  if (entroHoy.length) {
    if (lsGet(claveFactura(lid, fecha))) hecho('Factura subida');
    else tarea('factura', 'Subir factura', 'De lo que llegó hoy', '#/subir-factura', ir('subir-factura'));
  }

  // 5 · Cerrar cada sector abierto, después de las 18 h.
  if (!sinSQL) for (const s of sectores) {
    const ci = de(s, 'cierre');
    if (ci.length) hecho(nombreSector(s, 'Cerrar'), `${subSector(s) ? subSector(s) + ' · ' : ''}${hora(ci[ci.length - 1].creado_en)}`);
    else if (tarde && de(s, 'apertura').length) tarea('cerrar', nombreSector(s, 'Cerrar'), subSector(s) || 'Contá lo que queda', '#/hoja', aHoja(s));
  }

  mount(root,
    tituloGrande('Hoy', `${local ? local.nombre + ' · ' : ''}${fechaLarga(fecha)}`),
    error ? banner(error, 'warn') : null,
    sinSQL ? banner('Falta activar la hoja por sector en el servidor.', 'warn') : null,
    pendientes.length ? listaGrupo('Para hacer', pendientes, { clase: 'hoy-lista' }) : vacio('Todo listo por hoy'),
    hechas.length ? listaGrupo('Hecho', hechas, { clase: 'hoy-lista hoy-hechas' }) : null);
}
