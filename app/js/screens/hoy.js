// Hoy: el ritmo de la semana del local (contar → pedir → recibir) y accesos.
import { h, icon, largeTitle, cell, group, banner, btn, skeleton, haptic, fill } from '../ui.js';
import { semanaDe, fechaRelativa, haceDias, plural, fmtNum } from '../util.js';
import { verPedido, verOperacion, badgeEstado } from '../detalles.js';
import * as api from '../api.js';

export default async function hoy(ctx) {
  const { S } = ctx;
  const sem = semanaDe();
  const root = h('div');
  const gear = h('a', { class: 'topbar-btn', href: '#ajustes', 'aria-label': 'Ajustes' }, icon('gear', 24));
  const refresh = h('button', { class: 'topbar-btn', type: 'button', 'aria-label': 'Actualizar', onClick: () => { haptic(); cargar(true); } }, icon('refresh', 24));
  ctx.topbarSet({ right: [refresh, gear] });
  const hdr = largeTitle({ title: 'Hoy', sub: sem.label, topbar: ctx.topbar });
  root.append(hdr);

  const hero = h('div', { class: 'hero' });
  const heroWrap = h('div', { class: 'hero-wrap' }, hero);
  const kpis = h('div', { class: 'kpis' });
  const extra = h('div');
  root.append(heroWrap, kpis, extra);
  tilt3d(hero);

  const nombre = S.sesion.encargado ? S.sesion.encargado.split(' ')[0] : '';
  let datos = null;

  function pintar() {
    const d = datos;
    fill(hero, 
      h('div', { class: 'hero-top' },
        h('div', null, h('div', { class: 'hero-week', text: nombre ? `Hola, ${nombre}` : 'Hola' }), h('div', { class: 'hero-local', text: S.sesion.local })),
        d && d.pedido_semana ? badgeEstado(d.pedido_semana.estado) : null),
      h('div', { class: 'steps' }, pasoContar(d), pasoPedir(d), pasoRecibir(d))
    );
    fill(kpis, 
      kpi(d ? d.bajo_par : null, 'por agotarse', d && d.bajo_par > 0 ? 'amber' : '', 'contar'),
      kpi(d ? d.por_recibir : null, plural(d ? d.por_recibir : 0, 'orden por recibir', 'órdenes por recibir'), d && d.por_recibir > 0 ? 'warn' : '', 'recibir'),
      kpi(d ? d.pedidos_semana : null, plural(d ? d.pedidos_semana : 0, 'pedido esta semana', 'pedidos esta semana'), '', 'pedir'),
      kpi(d ? d.elaborados_activos : null, 'elaborados', '', 'elaborados')
    );
    fill(extra);
    if (d && (d.pedido_semana || d.ultimo_conteo || d.ultimo_elaborados)) {
      const celdas = [];
      if (d.pedido_semana) celdas.push(cell({ title: 'Último pedido', sub: `${fechaRelativa(d.pedido_semana.fecha_hora)} · ${d.pedido_semana.lineas} ${plural(d.pedido_semana.lineas, 'producto', 'productos')}`, lead: 'cart', leadKind: 'plain', chevron: true, onClick: () => verPedido(d.pedido_semana.id_pedido) }));
      if (d.ultimo_conteo) celdas.push(cell({ title: 'Último conteo', sub: `${fechaRelativa(d.ultimo_conteo.fecha_hora)} · ${d.ultimo_conteo.productos} ${plural(d.ultimo_conteo.productos, 'producto', 'productos')}`, lead: 'clipboard', leadKind: 'plain', chevron: true, onClick: () => verOperacion(d.ultimo_conteo.id_operacion) }));
      if (d.ultimo_elaborados) celdas.push(cell({ title: 'Último conteo de elaborados', sub: `${fechaRelativa(d.ultimo_elaborados.fecha_hora)} · ${d.ultimo_elaborados.encargado || ''}`.replace(/ · $/, ''), lead: 'flame', leadKind: 'plain', chevron: true, onClick: () => verOperacion(d.ultimo_elaborados.id_conteo) }));
      extra.append(group('Historial', celdas));
    }
    ctx.setBadge('recibir', d ? d.por_recibir : 0);
  }

  function kpi(n, label, kind, destino) {
    return h('a', { class: `kpi${kind ? ' ' + kind : ''}`, href: `#${destino}` },
      n === null || n === undefined ? h('div', { class: 'skeleton', style: 'width:48px;height:30px;margin:2px 0' }) : h('div', { class: 'kpi-n', text: String(n) }),
      h('div', { class: 'kpi-l', text: label }));
  }

  function pasoContar(d) {
    let mark = 'now', sub = 'Contá el stock para que la app te sugiera cuánto pedir.', kind = 'now';
    if (d === null) { sub = 'Cargando…'; kind = ''; }
    else if (d.ultimo_conteo) {
      const dias = haceDias(d.ultimo_conteo.fecha_hora);
      if (dias !== null && dias <= 3) { kind = 'ok'; sub = `Contado ${fechaRelativa(d.ultimo_conteo.fecha_hora)}.`; }
      else { kind = 'warn'; sub = `Último conteo ${fechaRelativa(d.ultimo_conteo.fecha_hora)}. Conviene contar de nuevo.`; }
    }
    return paso('Contar stock', sub, kind, 'contar', 1);
  }
  function pasoPedir(d) {
    let kind = '', sub = 'Cargando…';
    if (d) {
      if (d.pedido_semana) { kind = 'ok'; sub = `Enviado ${fechaRelativa(d.pedido_semana.fecha_hora)} · ${d.pedido_semana.lineas} ${plural(d.pedido_semana.lineas, 'producto', 'productos')}. Podés mandar otro.`; }
      else { kind = d.ultimo_conteo ? 'now' : ''; sub = 'Todavía no hay pedido esta semana.'; }
    }
    return paso('Pedir', sub, kind, 'pedir', 2);
  }
  function pasoRecibir(d) {
    let kind = '', sub = 'Cargando…';
    if (d) {
      if (d.por_recibir > 0) { kind = 'warn'; sub = `${d.por_recibir} ${plural(d.por_recibir, 'orden por recibir', 'órdenes por recibir')}. Controlá lo que llega.`; }
      else { kind = ''; sub = 'Nada pendiente de recibir.'; }
    }
    return paso('Recibir', sub, kind, 'recibir', 3);
  }
  function paso(titulo, sub, kind, destino, n) {
    return h('a', { class: 'step', href: `#${destino}` },
      h('span', { class: `step-mark ${kind}` }, kind === 'ok' ? icon('check', 18) : h('span', { text: String(n) })),
      h('span', { class: 'step-body' }, h('span', { class: 'step-title', text: titulo }), h('span', { class: 'step-sub', text: sub })),
      h('span', { class: 'cell-chev' }, icon('chevron', 14)));
  }

  let aviso = null;
  function cargar(force) {
    const c = api.cached('getHoy', { local: S.sesion.local }, { maxAge: force ? 0 : 45000 });
    if (c.data) { datos = c.data; pintar(); hdr.setStamp(c.stale ? 'Guardado en el equipo, actualizando…' : ''); } else { datos = null; pintar(); }
    if (force) refresh.classList.add('is-busy');
    c.fresh.then(d => { datos = d; pintar(); hdr.stampNow(); if (aviso) { aviso.remove(); aviso = null; } })
      .catch(e => {
        if (aviso) aviso.remove();
        aviso = banner(datos ? 'Mostrando datos guardados. ' + e.message : e.message, 'warn', { icon: 'offline', action: btn('Reintentar', { kind: 'tinted', size: 'sm', onClick: () => cargar(true) }) });
        root.insertBefore(aviso, hero);
        if (!datos) { datos = { bajo_par: 0, por_recibir: 0, pedidos_semana: 0, elaborados_activos: 0 }; pintar(); }
      })
      .finally(() => refresh.classList.remove('is-busy'));
  }
  cargar(false);
  if (!aviso && datos) hdr.stampNow();
  ctx.bootstrap();
  // precarga del catálogo para que Pedir y Contar abran al instante
  api.cached('getCatalogo', { local: S.sesion.local }, { maxAge: 120000 }).fresh.catch(() => {});
  return root;
}

// Inclinación 3D sutil de la tarjeta según el dedo o el puntero (sólo transform; respeta reduced-motion).
function tilt3d(el) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const MAX = 4;
  let raf = 0;
  const mover = (x, y) => {
    const r = el.getBoundingClientRect();
    const px = (x - r.left) / r.width - 0.5;
    const py = (y - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { el.classList.add('is-tilting'); el.style.transform = `rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateZ(0)`; });
  };
  const soltar = () => { cancelAnimationFrame(raf); el.classList.remove('is-tilting'); el.style.transform = ''; };
  el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') mover(e.clientX, e.clientY); });
  el.addEventListener('pointerleave', soltar);
  el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) mover(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (e.touches.length === 1) mover(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  el.addEventListener('touchend', soltar);
  el.addEventListener('touchcancel', soltar);
}
