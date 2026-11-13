// Encargado del Shopping · Retiros: qué sale del depósito, cuánto, a dónde va y quién lo retira.
// En el Shopping el control es por retiro y destino, no contra ventas. Cada retiro resta del stock del local
// y gerencia ve el gasto por destino en Stock → Retiros (0031_hoja_sector.sql). El destino nuevo queda guardado.
import { mount, h, tokens, coincide, fmtNum, porTexto, lsGet, lsSet, esCarta, esBulto, plural, fechaLarga, lugarDe, SIN_LUGAR, jornadaISO, sumarDias, textoBulto } from './util.js';
import { swr, cargarCatalogo, cargarLocales, hojaRango, hojaAnotar, hojaBorrar, cargarDestinos, sinHojaSQL, mensajeError } from './api.js';
import { esqueleto, vacio, banner, toast, icon, hoja as hojaModal, stepper } from './ui.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const cant = (n) => fmtNum(n, 3) || '0';
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export const sectorRetiro = (p) => (lugarDe(p) === SIN_LUGAR ? 'Depósito' : lugarDe(p));

export async function render(root, ctx) {
  const lid = ctx.perfil.local_id;
  const fecha = jornadaISO();
  const desde = sumarDias(fecha, -6);
  let prods = [], local = null, movs = [], destinos = [], sinSQL = false;
  const cab = () => h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Retiros' }), h('p', { class: 'sub', text: 'Qué sale del depósito y a dónde va' }));
  mount(root, cab(), esqueleto(4));
  const cargarMovs = () => hojaRango(lid, desde, fecha).then(r => { movs = (r || []).filter(m => m.tipo === 'retiro'); });
  await Promise.allSettled([
    swr('cat:' + lid, () => cargarCatalogo(lid), (d) => { prods = d; }),
    swr('locales', cargarLocales, (d) => { local = (d || []).find(x => x.id === lid) || null; }),
    cargarMovs().catch(e => { if (sinHojaSQL(e)) sinSQL = true; else toast('No pude cargar los retiros: ' + mensajeError(e), 'error'); }),
    cargarDestinos(lid).then(r => { destinos = (r || []).map(d => d.nombre); }).catch(() => {})
  ]);
  if (!ctx.alive()) return;
  const activos = prods.filter(p => p.activo !== false && !esCarta(p) && !p.oculto).sort((a, b) => porTexto(a.nombre, b.nombre));
  if (!activos.length) { mount(root, cab(), vacio('No hay productos', 'El catálogo del local está vacío.')); return; }
  const porId = new Map(activos.map(p => [p.id, p]));
  const personas = (local && Array.isArray(local.encargados) ? local.encargados : []).filter(Boolean);
  const uni = (p, n) => (p && p.unidad_uso ? ' ' + plural(p.unidad_uso, n) : '');

  function pintar() {
    const porDia = new Map();
    for (const m of [...movs].reverse()) { if (!porDia.has(m.fecha)) porDia.set(m.fecha, []); porDia.get(m.fecha).push(m); }
    const hoy = porDia.get(fecha) || [];
    const tarjeta = (m) => {
      const p = porId.get(m.producto_id);
      return h('article', { class: 'rt-item', 'data-id': m.id },
        h('div', { class: 'rt-t' }, h('b', { text: p ? p.nombre : 'Producto' }),
          h('span', { class: 'rt-dest', text: `${cant(m.cantidad)}${uni(p, Number(m.cantidad))}${m.otro ? ' a ' + m.otro : ''}` }),
          h('small', { text: `${m.quien ? m.quien + ' · ' : ''}${hora(m.creado_en)}` })),
        m.fecha >= sumarDias(fecha, -2) ? h('button', { class: 'btn btn-text btn-danger btn-sm', type: 'button', text: 'Sacar', 'aria-label': 'Sacar el retiro de ' + (p ? p.nombre : ''), on: { click: () => sacar(m) } }) : null);
    };
    const anteriores = [...porDia].filter(([f]) => f !== fecha);
    mount(root, cab(),
      sinSQL ? banner('Falta activar los retiros: hay que pegar el SQL 0031_hoja_sector.sql en Supabase.', 'warn') : null,
      h('button', { class: 'btn btn-primary btn-block btn-lg rt-nuevo', type: 'button', on: { click: nuevo } }, icon('mas', 20), h('span', { text: 'Nuevo retiro' })),
      h('h2', { class: 'rt-dia', text: `Hoy · ${hoy.length} ${hoy.length === 1 ? 'retiro' : 'retiros'}` }),
      hoy.length ? h('div', { class: 'rt-lista' }, hoy.map(tarjeta)) : h('p', { class: 'hj-hint', text: 'Todavía no se anotó ningún retiro hoy.' }),
      ...anteriores.map(([f, ms]) => [h('h2', { class: 'rt-dia', text: mayus(fechaLarga(f)) }), h('div', { class: 'rt-lista' }, ms.map(tarjeta))]).flat(),
      h('p', { class: 'hj-hint rt-pie', text: 'El conteo del depósito (apertura y cierre) se hace en Hoja.' }));
  }

  async function sacar(m) {
    try { await hojaBorrar(m.id); movs = movs.filter(x => x.id !== m.id); toast('Retiro sacado', 'ok'); pintar(); }
    catch (err) { toast('No se pudo sacar: ' + mensajeError(err), 'error'); }
  }

  function nuevo() {
    let prod = null, cuanto = 0, destino = null, quien = lsGet('rt-quien') || lsGet('nombre') || ctx.nombreGuardado || '', q = '', enviando = false;
    const cuerpo = h('div', { class: 'hj-form rt-form' });
    const buscar = h('input', { class: 'input input-search', type: 'search', placeholder: 'Buscar producto', 'aria-label': 'Buscar producto', autocomplete: 'off',
      on: { input: (ev) => { q = ev.target.value; pintarProd(); } } });
    const resultados = h('div', { class: 'rt-res' });
    const elegido = h('div', { class: 'rt-elegido' });
    const st = stepper({ value: 0, label: 'Cantidad', onChange: (n) => { cuanto = n; } });
    const lblCant = h('p', { class: 'hj-lbl', text: '¿Cuánto?' });
    const chipsDest = h('div', { class: 'chips hj-chips', role: 'group', 'aria-label': 'Destino' });
    const otroDest = h('input', { class: 'input', type: 'text', placeholder: 'Otro destino (ej. Baños planta baja)', 'aria-label': 'Otro destino', autocomplete: 'off',
      on: { input: (ev) => { destino = ev.target.value.trim() || null; pintarDest(false); } } });
    const chipsQuien = h('div', { class: 'chips hj-chips', role: 'group', 'aria-label': 'Quién retira' });
    const otroQuien = h('input', { class: 'input', type: 'text', placeholder: 'Nombre de quien retira', 'aria-label': 'Quién retira', autocomplete: 'off', value: personas.includes(quien) ? '' : quien,
      on: { input: (ev) => { quien = ev.target.value.trim(); pintarQuien(false); } } });

    function pintarProd() {
      if (prod) {
        resultados.replaceChildren(); buscar.hidden = true;
        mount(elegido, h('b', { text: prod.nombre }), h('button', { class: 'btn btn-text btn-sm', type: 'button', text: 'Cambiar', on: { click: () => { prod = null; buscar.hidden = false; buscar.focus(); pintarProd(); } } }));
        lblCant.textContent = `Cantidad en ${plural(prod.unidad_uso || 'unidad', 2)}${esBulto(prod) ? ' (' + textoBulto(prod) + ')' : ''}`;
        return;
      }
      elegido.replaceChildren();
      const toks = tokens(q);
      const vis = (toks.length ? activos.filter(p => coincide(p.nombre, toks)) : activos).slice(0, 8);
      resultados.replaceChildren(...vis.map(p => h('button', { class: 'rt-op', type: 'button', 'data-id': p.id, text: p.nombre, on: { click: () => { prod = p; pintarProd(); } } })));
    }
    function pintarDest(limpiarOtro = true) {
      chipsDest.replaceChildren(...destinos.map(d => h('button', { class: 'chip' + (destino === d ? ' is-on' : ''), type: 'button', 'aria-pressed': destino === d ? 'true' : 'false', 'data-destino': d, text: d,
        on: { click: () => { destino = d; otroDest.value = ''; pintarDest(); } } })));
      if (limpiarOtro && destinos.includes(destino)) otroDest.value = '';
    }
    function pintarQuien() {
      chipsQuien.replaceChildren(...personas.map(n => h('button', { class: 'chip' + (quien === n ? ' is-on' : ''), type: 'button', 'aria-pressed': quien === n ? 'true' : 'false', 'data-quien': n, text: n,
        on: { click: () => { quien = n; otroQuien.value = ''; pintarQuien(); } } })));
    }
    const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', text: 'Anotar retiro', on: { click: async () => {
      if (enviando) return;
      if (!prod) { toast('Elegí el producto.', 'error'); return; }
      if (!(cuanto > 0)) { toast('Poné cuánto se retira.', 'error'); return; }
      if (!destino) { toast('Elegí o escribí a dónde va.', 'error'); return; }
      enviando = true; btn.disabled = true;
      try {
        await hojaAnotar(lid, sectorRetiro(prod), fecha, prod.id, 'retiro', cuanto, destino, quien);
        if (quien) lsSet('rt-quien', quien);
        if (!destinos.includes(destino)) destinos = [...destinos, destino].sort(porTexto);
        await cargarMovs();
        modal.cerrar(); toast('Retiro anotado', 'ok');
        if (ctx.alive()) pintar();
      } catch (err) {
        enviando = false; btn.disabled = false;
        toast(sinHojaSQL(err) ? 'Falta pegar el SQL 0031_hoja_sector.sql en Supabase.' : 'No se pudo anotar: ' + mensajeError(err), 'error');
      }
    } } });
    mount(cuerpo, h('p', { class: 'hj-lbl', text: 'Producto' }), buscar, elegido, resultados, lblCant, st.el,
      h('p', { class: 'hj-lbl', text: '¿A dónde va?' }), chipsDest, otroDest,
      h('p', { class: 'hj-lbl', text: '¿Quién retira?' }), personas.length ? chipsQuien : null, otroQuien, btn);
    pintarProd(); pintarDest(); pintarQuien();
    const modal = hojaModal('Nuevo retiro', cuerpo);
  }

  pintar();
  return () => {};
}
