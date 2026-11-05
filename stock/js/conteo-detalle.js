// Detalle de un conteo guardado: qué se contó y, para corregir, sacar un producto o borrar todo el conteo (0026_borrar_conteo.sql).
// Al sacar un producto se deshace su ajuste: el stock vuelve a lo que había antes de ese conteo. Después se lo vuelve a contar.
// Gerencia ve también lo que decía el sistema y la diferencia; el encargado no (cuenta a ciegas) y solo borra los de hoy.
import { h, fmtNum, porTexto, esBulto, factorDe, plural, fechaCorta } from './util.js';
import { borrarConteo, mensajeError } from './api.js';
import { hoja, toast, icon } from './ui.js';

// Lo contado en la unidad en que se cuenta (bolsas para lo que va por bulto).
export function textoContado(p, n) {
  if (!p) return fmtNum(n, 3);
  if (esBulto(p)) { const b = Number(n) / factorDe(p); return `${fmtNum(b, 3) || '0'} ${plural(p.unidad_compra, b)}`; }
  return `${fmtNum(n, 3) || '0'}${p.unidad_uso ? ' ' + plural(p.unidad_uso, Number(n)) : ''}`;
}

const avisoRecontado = (r) => r && r.recontados
  ? ` ${r.recontados === 1 ? 'Ese producto ya se volvió a contar después: queda lo último contado.' : `${r.recontados} ya se volvieron a contar después: queda lo último contado.`}`
  : '';

// conteo: { id, encargado, items, creado_en }. prods: Map id → producto. alCambiar(conteo | null) al sacar o borrar.
export function abrirConteo(conteo, { prods, gerencia = false, alCambiar = () => {} }) {
  let items = [...(conteo.items || [])];
  let ocupado = false;
  const nombre = (it) => (prods.get(it.producto_id) || {}).nombre || 'Producto borrado';
  const cuerpo = h('div', { class: 'cnd' });

  async function sacar(it, boton) {
    if (ocupado) return;
    const n = nombre(it);
    if (!confirm(`¿Sacar ${n} de este conteo? Su stock vuelve a lo que había antes de contarlo. Después lo podés contar de nuevo.`)) return;
    ocupado = true; boton.disabled = true;
    try {
      const r = await borrarConteo(conteo.id, it.producto_id);
      items = items.filter(x => x.producto_id !== it.producto_id);
      conteo = { ...conteo, items };
      toast(`Sacaste ${n} del conteo.${avisoRecontado(r)}`, 'ok');
      alCambiar(items.length ? conteo : null);
      if (!items.length) return ui.cerrar();
      pintar();
    } catch (e) { toast('No se pudo: ' + mensajeError(e), 'error'); boton.disabled = false; }
    ocupado = false;
  }

  async function borrarTodo(boton) {
    if (ocupado) return;
    if (!confirm(`¿Borrar todo el conteo del ${fechaCorta(conteo.creado_en)}? Los ${items.length} productos vuelven al stock que tenían antes de contarlos.`)) return;
    ocupado = true; boton.disabled = true;
    try {
      const r = await borrarConteo(conteo.id);
      toast(`Conteo borrado.${avisoRecontado(r)}`, 'ok');
      alCambiar(null);
      ui.cerrar();
    } catch (e) { toast('No se pudo borrar: ' + mensajeError(e), 'error'); boton.disabled = false; }
    ocupado = false;
  }

  function fila(it) {
    const p = prods.get(it.producto_id);
    const dif = Number(it.dif) || 0;
    const btn = h('button', { class: 'btn btn-ghost cnd-sacar', type: 'button', 'aria-label': `Sacar ${nombre(it)} del conteo` }, icon('basura', 16), h('span', { text: 'Sacar' }));
    btn.addEventListener('click', () => sacar(it, btn));
    return h('li', { class: 'cnd-fila', 'data-prod': it.producto_id },
      h('div', { class: 'cnd-t' },
        h('b', { text: nombre(it) }),
        h('span', { class: 'cnd-n num', text: 'Contado: ' + textoContado(p, it.contado) }),
        gerencia && it.sistema != null ? h('span', { class: 'cnd-d num' + (dif < 0 ? ' is-falta' : dif > 0 ? ' is-sobra' : ''),
          text: `Sistema ${textoContado(p, it.sistema)} · ${dif === 0 ? 'sin diferencia' : (dif < 0 ? 'faltaban ' : 'sobraban ') + textoContado(p, Math.abs(dif))}` }) : null),
      btn);
  }

  function pintar() {
    const orden = [...items].sort((a, b) => porTexto(nombre(a), nombre(b)));
    const todo = h('button', { class: 'btn btn-text btn-block cat-borrar', type: 'button' }, icon('basura', 18), h('span', { text: 'Borrar todo el conteo' }));
    todo.addEventListener('click', () => borrarTodo(todo));
    cuerpo.replaceChildren(
      h('p', { class: 'cnd-sub', text: `${fechaCorta(conteo.creado_en)}${conteo.encargado ? ' · ' + conteo.encargado : ''} · ${items.length} ${items.length === 1 ? 'producto' : 'productos'}` }),
      h('p', { class: 'field-h', text: 'Si un número está mal, sacalo y volvé a contar ese producto.' }),
      h('ol', { class: 'cnd-lista' }, orden.map(fila)),
      todo);
  }

  pintar();
  const ui = hoja('Conteo guardado', cuerpo);
  return ui;
}
