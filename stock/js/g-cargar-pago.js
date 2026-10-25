// Pagos · Cargar pago: se sube el PDF del comprobante, se lee en el navegador (pdf.js), se precarga el formulario
// (editable), se elige el proveedor (por CUIT o sugerido por razón social), se imputa a facturas pendientes (las más viejas
// primero) y se guarda todo junto con registrar_pago. Después se avisa al proveedor por WhatsApp (lo envía una persona).
import { mount, h, fmtMoney, parseNum, porTexto, hoyISO, debounce } from './util.js';
import { facturasPendientesDe, pagoPorOperacion, registrarPago, subirComprobante, mensajeError } from './api.js';
import { G, cargarG } from './datos.js';
import { esqueleto, banner, subnav, SUBNAV_PAGOS, toast, campo, icon } from './ui.js';
import { textoDePdf } from './pdf-texto.js';
import { leerComprobante } from './comprobante.js';
import { abrirAviso } from './aviso.js';
import { soloDigitos, proveedorPorCuit, sugerirProveedores, imputarAutomatico, validarImputacion, redondear, rutaPago, fechaDMA } from './pagos-util.js';

export async function render(root, ctx) {
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Cargar pago' }), h('p', { class: 'sub', text: 'Subí el comprobante de la transferencia' }));
  mount(root, cab, subnav(SUBNAV_PAGOS, 'cargar-pago'), esqueleto(3));
  try { await cargarG(['provs'], () => {}); } catch (e) { return mount(root, cab, subnav(SUBNAV_PAGOS, 'cargar-pago'), banner(mensajeError(e), 'error')); }
  if (!ctx.alive()) return;

  let archivo = null, leido = null, facturas = [], imput = {}, manual = false, duplicado = null, actualizarCuit = false, guardando = false, vez = 0;
  const provs = () => [...G.provs.values()].filter((p) => p.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));
  const provSel = () => G.provs.get(f.prov.value) || null;

  const f = {
    prov: h('select', { class: 'input', id: 'p-prov', 'aria-label': 'Proveedor' }),
    monto: h('input', { class: 'input num', id: 'p-monto', inputmode: 'decimal', autocomplete: 'off' }),
    fecha: h('input', { class: 'input', id: 'p-fecha', type: 'date', value: hoyISO() }),
    op: h('input', { class: 'input num', id: 'p-op', autocomplete: 'off' }),
    concepto: h('input', { class: 'input', id: 'p-concepto', autocomplete: 'off' }),
    desc: h('input', { class: 'input', id: 'p-desc', autocomplete: 'off' }),
    cuit: h('input', { class: 'input num', id: 'p-cuit', inputmode: 'numeric', autocomplete: 'off' }),
    banco: h('input', { class: 'input', id: 'p-banco', autocomplete: 'off' }),
    cuenta: h('input', { class: 'input num', id: 'p-cuenta', autocomplete: 'off' }),
    origen: h('input', { class: 'input num', id: 'p-origen', autocomplete: 'off' })
  };
  const llenarProvs = () => f.prov.replaceChildren(h('option', { value: '', text: 'Elegí el proveedor' }), ...provs().map((p) => h('option', { value: p.id, text: p.nombre })));
  llenarProvs();

  const zonaLectura = h('div', { 'aria-live': 'polite' });
  const zonaMatch = h('div', { class: 'leido' });
  const zonaDup = h('div', {});
  const zonaImp = h('div', { class: 'leido' });
  const err = h('div', { class: 'form-err', 'aria-live': 'polite' });
  const btnGuardar = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button', text: 'Guardar pago', on: { click: () => guardar() } });
  const formulario = h('div', { class: 'form', hidden: true, id: 'p-form' },
    zonaLectura,
    campo('Proveedor', f.prov), zonaMatch,
    h('div', { class: 'dos' }, campo('Monto ($)', f.monto), campo('Fecha', f.fecha)),
    campo('N° de operación', f.op), zonaDup,
    h('div', { class: 'dos' }, campo('Concepto', f.concepto), campo('Descripción', f.desc)),
    h('div', { class: 'dos' }, campo('CUIT del destinatario', f.cuit), campo('Banco de destino', f.banco)),
    h('div', { class: 'dos' }, campo('Cuenta de destino', f.cuenta), campo('Cuenta de origen', f.origen)),
    h('h2', { class: 'bloque-t', text: 'Imputar a facturas' }), zonaImp, err, btnGuardar);

  const input = h('input', { type: 'file', id: 'p-archivo', accept: 'application/pdf,.pdf', on: { change: (e) => { const a = e.target.files && e.target.files[0]; if (a) leerArchivo(a); } } });
  const drop = h('label', { class: 'drop', for: 'p-archivo' }, icon('pagos', 30), h('span', { class: 'drop-t', text: 'Elegir el PDF del comprobante' }), h('span', { class: 'sub', text: 'Se lee en tu dispositivo: los datos se precargan y los podés corregir.' }), input);
  const resultado = h('div', { hidden: true, class: 'resultado', id: 'p-resultado' });

  // ---------- proveedor ----------
  function refrescarMatch() {
    const p = provSel();
    const cuit = soloDigitos(f.cuit.value);
    actualizarCuit = false;
    const piezas = [];
    if (p) {
      if (cuit && soloDigitos(p.cuit) === cuit) piezas.push(banner(`Proveedor reconocido por el CUIT ${f.cuit.value}.`, 'info'));
      else if (cuit && !soloDigitos(p.cuit)) { actualizarCuit = true; piezas.push(banner(`${p.nombre} no tiene CUIT cargado: al guardar se guarda el ${f.cuit.value} para reconocerlo la próxima vez.`, 'info')); }
      else if (cuit && soloDigitos(p.cuit) !== cuit) piezas.push(banner(`${p.nombre} tiene otro CUIT cargado (${p.cuit}). Revisá que sea el proveedor correcto: no se cambia el CUIT.`, 'warn'));
    } else {
      const razon = leido && leido.proveedor_razon_social;
      const sug = razon ? sugerirProveedores(provs(), razon) : [];
      if (cuit && razon) piezas.push(banner(`Ningún proveedor tiene el CUIT ${f.cuit.value}. El comprobante dice "${razon}".`, 'warn'));
      if (sug.length) piezas.push(h('div', { class: 'sug', 'data-sugerencias': '' }, sug.map((s) =>
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-sug': s.proveedor.id, text: `¿Es ${s.proveedor.nombre}? Confirmar`, on: { click: () => { f.prov.value = s.proveedor.id; alCambiarProveedor(); } } }))));
      else if (razon) piezas.push(h('p', { class: 'mute centro', text: 'No encontré un proveedor parecido: elegilo de la lista.' }));
    }
    zonaMatch.replaceChildren(...piezas);
  }
  async function alCambiarProveedor() {
    refrescarMatch();
    facturas = []; imput = {}; manual = false; pintarImp();
    const p = provSel();
    if (!p) return;
    const mi = ++vez;
    try { const r = await facturasPendientesDe(p.id); if (mi !== vez) return; facturas = r; } catch (e) { zonaImp.replaceChildren(banner(mensajeError(e), 'error')); return; }
    imputarAuto(); pintarImp();
  }
  f.prov.addEventListener('change', alCambiarProveedor);
  f.cuit.addEventListener('input', refrescarMatch);

  // ---------- operación duplicada ----------
  const revisarOperacion = debounce(async () => {
    const op = f.op.value.trim();
    duplicado = null; zonaDup.replaceChildren();
    if (!op) return actualizarBoton();
    try {
      const r = await pagoPorOperacion(op);
      if (r[0]) {
        duplicado = r[0]; const pr = G.provs.get(r[0].proveedor_id);
        zonaDup.replaceChildren(banner(`La operación ${op} ya está cargada (${fechaDMA(r[0].fecha)}, ${fmtMoney(r[0].monto)}${pr ? ', ' + pr.nombre : ''}). No se puede registrar dos veces.`, 'error'));
      }
    } catch (_e) { /* si no hay conexión, lo vuelve a controlar el servidor al guardar */ }
    actualizarBoton();
  }, 250);
  f.op.addEventListener('input', revisarOperacion);
  const actualizarBoton = () => { btnGuardar.disabled = guardando || !!duplicado; };

  // ---------- imputación ----------
  const montoNum = () => { const m = parseNum(f.monto.value); return m === null || m <= 0 ? 0 : m; };
  function imputarAuto() { imput = imputarAutomatico(montoNum(), facturas); manual = false; }
  function pintarImp() {
    if (!provSel()) return zonaImp.replaceChildren(h('p', { class: 'mute centro', text: 'Elegí el proveedor para ver sus facturas pendientes.' }));
    if (!facturas.length) return zonaImp.replaceChildren(h('p', { class: 'mute centro', text: 'No tiene facturas pendientes: el pago queda a cuenta.' }));
    const v = validarImputacion(montoNum(), facturas, imput);
    zonaImp.replaceChildren(...[
      ...facturas.map((fa) => {
        const inp = h('input', { class: 'input num', inputmode: 'decimal', 'data-factura': fa.numero, 'aria-label': `Imputar a la factura ${fa.numero}`, value: imput[fa.id] ? String(imput[fa.id]).replace('.', ',') : '', placeholder: '0',
          on: { input: () => { const n = parseNum(inp.value); imput[fa.id] = n === null ? 0 : n; manual = true; resumen(); } } });
        return h('div', { class: 'imp-fila' },
          h('div', {}, h('h3', { class: 'prod-n', text: `N° ${fa.numero}` }), h('p', { class: 'prod-m' }, h('span', { text: `del ${fechaDMA(fa.fecha)}` }), h('span', { class: fa.vencida ? 'var-baja' : '', text: fa.vencimiento ? `vence ${fechaDMA(fa.vencimiento)}${fa.vencida ? ' (vencida)' : ''}` : 'sin vencimiento' }), h('span', { class: 'num', text: `debe ${fmtMoney(fa.pendiente)}` }))),
          inp);
      }),
      h('div', { class: 'imp-tot', 'data-imputado': '' }, h('span', { text: 'Imputado' }), h('b', { class: 'num', text: fmtMoney(v.total) }), h('span', { text: 'A cuenta' }), h('b', { class: 'num', text: fmtMoney(Math.max(0, redondear(montoNum() - v.total))) })),
      h('div', { 'data-imp-error': '' }, v.error ? banner(v.error, 'error') : null),
      manual ? h('button', { class: 'btn btn-text btn-sm', type: 'button', text: 'Volver a imputar automático (más viejas primero)', on: { click: () => { imputarAuto(); pintarImp(); } } }) : null
    ].filter(Boolean));
  }
  // Actualiza solo los totales (no vuelve a dibujar los campos, así no se pierde el foco al tipear).
  function resumen() {
    const fila = zonaImp.querySelector('[data-imputado]'); if (!fila) return;
    const v = validarImputacion(montoNum(), facturas, imput);
    const [tot, cuenta] = fila.querySelectorAll('b');
    tot.textContent = fmtMoney(v.total); cuenta.textContent = fmtMoney(Math.max(0, redondear(montoNum() - v.total)));
    zonaImp.querySelector('[data-imp-error]').replaceChildren(...(v.error ? [banner(v.error, 'error')] : []));
    if (!zonaImp.querySelector('.btn-text')) pintarImpBoton();
  }
  function pintarImpBoton() {
    const caja = zonaImp.querySelector('[data-imp-error]');
    if (caja && manual) caja.after(h('button', { class: 'btn btn-text btn-sm', type: 'button', text: 'Volver a imputar automático (más viejas primero)', on: { click: () => { imputarAuto(); pintarImp(); } } }));
  }
  f.monto.addEventListener('input', () => { if (!manual) imputarAuto(); pintarImp(); });

  // ---------- lectura del PDF ----------
  async function leerArchivo(a) {
    archivo = a; leido = null; duplicado = null; zonaDup.replaceChildren(); err.replaceChildren();
    formulario.hidden = false; resultado.hidden = true;
    zonaLectura.replaceChildren(banner(`Leyendo ${a.name}…`, 'info'));
    let texto = '';
    try { texto = await textoDePdf(await a.arrayBuffer()); leido = leerComprobante(texto); }
    catch (_e) { leido = null; }
    const datos = leido || {};
    const pocos = !datos.monto || !datos.numero_operacion;
    zonaLectura.replaceChildren(!leido ? banner('No pude leer el PDF: completá los datos a mano.', 'warn') : pocos ? banner('Leí solo una parte del comprobante: revisá los datos marcados en blanco.', 'warn') : banner('Comprobante leído. Revisá los datos antes de guardar.', 'ok'));
    f.monto.value = datos.monto ? String(datos.monto).replace('.', ',') : '';
    f.fecha.value = datos.fecha || hoyISO();
    f.op.value = datos.numero_operacion || '';
    f.concepto.value = datos.concepto || ''; f.desc.value = datos.descripcion || '';
    f.cuit.value = datos.cuit_destino || ''; f.banco.value = datos.banco_destino || '';
    f.cuenta.value = datos.cuenta_destino || ''; f.origen.value = datos.cuenta_origen || '';
    const p = proveedorPorCuit(provs(), datos.cuit_destino);
    f.prov.value = p ? p.id : '';
    refrescarMatch();
    await alCambiarProveedor();
    revisarOperacion();
    formulario.scrollIntoView && formulario.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---------- guardar ----------
  async function guardar() {
    err.replaceChildren();
    const p = provSel(); const monto = parseNum(f.monto.value);
    if (!p) return (err.textContent = 'Elegí el proveedor del pago.');
    if (monto === null || monto <= 0) return (err.textContent = 'Poné el monto del pago.');
    if (!f.fecha.value) return (err.textContent = 'Poné la fecha del pago.');
    const v = validarImputacion(monto, facturas, imput);
    if (v.error) return (err.textContent = v.error);
    const imputaciones = facturas.filter((fa) => Number(imput[fa.id]) > 0).map((fa) => ({ factura_id: fa.id, monto: redondear(imput[fa.id]) }));
    const op = f.op.value.trim();
    guardando = true; actualizarBoton(); btnGuardar.textContent = 'Guardando…';
    try {
      let ruta = null;
      if (archivo) ruta = await subirComprobante(rutaPago(p.id, op), archivo);
      const pago = { proveedor_id: p.id, monto, fecha: f.fecha.value, numero_operacion: op || null, cuenta_origen: f.origen.value.trim() || null, banco: null,
        cuit_destino: f.cuit.value.trim() || null, banco_destino: f.banco.value.trim() || null, cuenta_destino: f.cuenta.value.trim() || null,
        concepto: f.concepto.value.trim() || null, descripcion: f.desc.value.trim() || null, comprobante_path: ruta, actualizar_cuit: actualizarCuit };
      const id = await registrarPago(pago, imputaciones);
      if (actualizarCuit && p) p.cuit = pago.cuit_destino;
      terminar({ ...pago, id, avisado_en: null }, p, imputaciones);
    } catch (e) {
      err.textContent = mensajeError(e); if (/ya está cargada/.test(err.textContent)) revisarOperacion();
      guardando = false; actualizarBoton(); btnGuardar.textContent = 'Guardar pago';
    }
  }

  function terminar(pago, prov, imputaciones) {
    guardando = false;
    toast('Pago guardado', 'ok');
    const archivoGuardado = archivo;
    const estado = h('span', { class: 'estado estado-sinavisar', text: 'Sin avisar', 'data-estado': '' });
    resultado.replaceChildren(
      h('h2', { class: 'titulo', text: 'Pago guardado' }),
      h('p', { class: 'sub', text: `${prov.nombre} · ${fmtMoney(pago.monto)} · ${imputaciones.length ? `imputado a ${imputaciones.length} ${imputaciones.length === 1 ? 'factura' : 'facturas'}` : 'a cuenta'}` }),
      estado,
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', 'data-accion': 'avisar', on: { click: () => abrirAviso(pago, prov, { archivo: archivoGuardado, alAvisar: () => { estado.className = 'estado estado-avisado'; estado.textContent = 'Avisado'; } }) } },
        icon('whatsapp', 20), h('span', { text: 'Avisar por WhatsApp' })),
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'Cargar otro pago', on: { click: () => { archivo = null; leido = null; input.value = ''; formulario.hidden = true; resultado.hidden = true; drop.hidden = false; btnGuardar.textContent = 'Guardar pago'; actualizarBoton(); window.scrollTo(0, 0); } } }));
    resultado.hidden = false; formulario.hidden = true; drop.hidden = true;
    window.scrollTo(0, 0);
  }

  mount(root, cab, subnav(SUBNAV_PAGOS, 'cargar-pago'), drop, formulario, resultado);
}
