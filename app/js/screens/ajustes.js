// Ajustes: sesión, apariencia, backend, envíos pendientes, y (gerencia) empezar de cero.
import { h, largeTitle, cell, group, segmented, btn, toast, confirmar, prompt, sheet, banner, haptic, input, field, fill } from '../ui.js';
import { store, fechaRelativa, plural } from '../util.js';
import * as api from '../api.js';

export default async function ajustes(ctx) {
  const { S } = ctx;
  const root = h('div');
  const esGer = S.sesion && S.sesion.rol === 'gerencia';
  ctx.topbarSet({ left: ctx.backBtn('Volver', esGer ? 'compras' : 'hoy') });
  root.append(largeTitle({ title: 'Ajustes', topbar: ctx.topbar }));

  // sesión
  root.append(group('Sesión', [
    esGer
      ? cell({ title: 'Gerencia', sub: S.adminKey && store.get('admin_key', '') ? 'Clave guardada en este equipo' : 'Clave sólo para esta visita', lead: 'key' })
      : cell({ title: S.sesion.local, sub: S.sesion.encargado, lead: 'store' }),
    cell({ title: esGer ? 'Cerrar sesión de gerencia' : 'Cambiar local o nombre', lead: 'people', leadKind: 'plain', chevron: true, onClick: async () => {
      if (await confirmar({ title: esGer ? '¿Cerrar sesión?' : '¿Cambiar de local?', text: esGer ? 'La clave se borra de este equipo.' : 'Los borradores de este local quedan guardados en el equipo.', ok: esGer ? 'Cerrar sesión' : 'Cambiar' })) ctx.salir();
    } }),
    esGer ? cell({ title: 'Entrar como encargado', sub: 'Para cargar un pedido o conteo desde este equipo', lead: 'cart', leadKind: 'plain', chevron: true, onClick: () => { ctx.guardarSesion(null); ctx.go('entrar', true); } })
      : cell({ title: 'Entrar como gerencia', sub: 'Compras, órdenes y catálogo (con clave)', lead: 'key', leadKind: 'plain', chevron: true, onClick: () => { ctx.guardarSesion(null); ctx.go('entrar/gerencia', true); } })
  ]));

  // apariencia
  const tema = store.get('tema', 'auto');
  const seg = segmented([{ value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }], tema, (v) => {
    store.set('tema', v);
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
  }, 'Apariencia');
  root.append(group('Apariencia', h('div', { style: 'padding:12px 16px' }, seg)));

  // envíos pendientes y rechazos
  const colaSec = h('div');
  function pintarCola() {
    fill(colaSec);
    const pend = api.pendientes();
    const rech = api.rechazos();
    if (pend.length) {
      colaSec.append(group(`${pend.length} ${plural(pend.length, 'envío pendiente', 'envíos pendientes')}`, pend.map(p => cell({
        title: p.titulo || p.payload.action, sub: `${fechaRelativa(new Date(p.t))} · se reintenta solo al volver la señal`, lead: 'refresh', leadKind: 'amber',
        right: btn('Descartar', { kind: 'danger', size: 'xs', onClick: async () => { if (await confirmar({ title: '¿Descartar este envío?', text: 'No va a llegar a la planilla.', ok: 'Descartar', danger: true })) { api.descartarPendiente(p.id); pintarCola(); } } })
      })), 'Se envían solos cuando hay conexión. Tocá Reintentar para forzarlo.'));
      colaSec.append(h('div', { style: 'padding:10px 0 0' }, btn('Reintentar ahora', { kind: 'tinted', full: true, onClick: async () => { await api.vaciarCola(); pintarCola(); toast(api.pendientes().length ? 'Todavía no hay conexión' : 'Enviados', api.pendientes().length ? 'info' : 'ok'); } })));
    }
    if (rech.length) {
      colaSec.append(group('La planilla rechazó', rech.map(r => cell({ title: r.titulo || r.id, sub: r.error, lead: 'alert', leadKind: 'bad' })), ''));
      colaSec.append(h('div', { style: 'padding:10px 0 0' }, btn('Limpiar avisos', { full: true, onClick: () => { api.limpiarRechazos(); pintarCola(); } })));
    }
  }
  pintarCola();
  ctx.onLeave(api.onCola(pintarCola));
  root.append(colaSec);

  // gerencia: empezar de cero
  if (esGer) {
    root.append(group('Planilla', [
      cell({ title: 'Empezar de cero', sub: 'Vacía pedidos, movimientos y órdenes. Hace una copia antes.', lead: 'trash', leadKind: 'bad', chevron: true, onClick: () => reiniciar(ctx) })
    ]));
  }

  // backend
  const url = api.apiUrl();
  const fijada = store.get('api_url', '');
  root.append(group('Conexión', [
    cell({ title: 'Planilla', sub: url ? url.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '…/').slice(0, 60) : 'Sin configurar', lead: 'arrow', leadKind: 'plain', chevron: true, onClick: async () => {
      const v = await prompt({ title: 'Dirección del backend', text: 'Dejala vacía para volver a la configurada en la app.', label: 'URL /exec', value: fijada, required: false, validar: (x) => x && !/^https?:\/\/|^\//.test(x) ? 'Tiene que empezar con https://' : '' });
      if (v === null) return;
      api.fijarApi(v); api.invalidar(); toast(v ? 'Dirección guardada' : 'Se usa la dirección de la app', 'ok'); ctx.go('ajustes', true);
    } }),
    cell({ title: 'Probar conexión', lead: 'bolt', leadKind: 'plain', chevron: true, onClick: async () => {
      try { const r = await api.get('ping'); toast(`Conectado · ${r.version} · ${r.hora}`, 'ok'); } catch (e) { toast(e.message, 'error'); }
    } }),
    cell({ title: 'Borrar datos guardados en el equipo', sub: 'Caché de catálogo y lecturas. No borra borradores ni la sesión.', lead: 'refresh', leadKind: 'plain', chevron: true, onClick: () => { api.invalidar(); toast('Listo', 'ok'); } })
  ], `Docks app ${ctx.version}`));

  return root;
}

async function reiniciar(ctx) {
  const conf = input({ placeholder: 'EMPEZAR DE CERO', autocapitalize: 'characters' });
  const err = h('p', { class: 'field-error', role: 'alert' });
  const s = sheet({
    title: 'Empezar de cero',
    body: [
      banner('Hace una copia completa de la planilla y después vacía pedidos, líneas, movimientos, órdenes y conteos de elaborados. El catálogo, proveedores, locales y elaborados quedan.', 'warn', { icon: 'alert' }),
      h('div', { class: 'mt12' }, field('Escribí EMPEZAR DE CERO para confirmar', conf)),
      err
    ],
    actions: [btn('Cancelar', { onClick: () => s.close() }), btn('Vaciar la planilla', { kind: 'danger-fill', onClick: async () => {
      if (conf.value.trim().toUpperCase() !== 'EMPEZAR DE CERO') { err.textContent = 'El texto no coincide.'; return; }
      err.textContent = '';
      const b = s.el.querySelector('.btn-danger-fill'); b.disabled = true;
      try {
        const r = await api.post({ action: 'reiniciarDatos', admin_key: ctx.S.adminKey, confirmacion: 'EMPEZAR DE CERO' });
        api.invalidar();
        s.close();
        haptic('success');
        sheet({ title: 'Planilla vacía', body: [
          h('p', { class: 'sub', style: 'color:var(--text)', text: `Se borraron ${r.pedidos} pedidos, ${r.lineas} líneas, ${r.movimientos} movimientos y ${r.ordenes} órdenes.` }),
          r.respaldo_url ? h('p', { class: 'mt12' }, h('a', { href: r.respaldo_url, target: '_blank', rel: 'noopener', text: `Copia de respaldo: ${r.respaldo_nombre}` })) : null
        ] });
      } catch (e) { err.textContent = e.message; b.disabled = false; }
    } })]
  });
}
