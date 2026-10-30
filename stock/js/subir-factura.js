// Encargado · Facturas: sube la foto o el PDF de la factura/remito que llegó al local, sin ver precios ni totales.
// Queda pendiente en Gerencia → Recibir, que la lee con Recibir con factura (ahí sí se ven montos) y suma el stock.
// El encargado solo puede subir a comprobantes/locales/<su local>/ y no puede abrir los archivos (migración 0022).
import { mount, h, porTexto, lsGet, fechaCorta } from './util.js';
import { cargarProveedoresBasico, subirArchivoLocal, crearFacturaLocal, facturasLocales, borrarFacturaLocal, mensajeError } from './api.js';
import { esqueleto, banner, campo, toast, icon, vacio } from './ui.js';
import { achicarFoto, base64ABlob, PDF_MAX } from './fotos.js';

const MAX_FOTOS = 6;
const ESTADO = { pendiente: ['Esperando a gerencia', 'borrador'], recibida: ['Recibida por gerencia', 'recibida'], descartada: ['Descartada', 'cancelada'] };
const seguro = (s) => String(s || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-60);

export async function render(root, ctx) {
  const localId = ctx.perfil.local_id;
  const cab = h('header', { class: 'vista-head' }, h('h1', { class: 'titulo', text: 'Facturas' }),
    h('p', { class: 'sub', text: 'Sacale una foto a la factura o remito que llegó y mandala a gerencia.' }));
  mount(root, cab, esqueleto(3));
  let provs = [], subidas = [];
  try {
    [provs, subidas] = await Promise.all([cargarProveedoresBasico().catch(() => []), facturasLocales({ limite: 30 })]);
  } catch (e) {
    if (!ctx.alive()) return;
    const m = mensajeError(e);
    return mount(root, cab, banner(/facturas_locales|schema cache|does not exist/i.test(m) ? 'Falta activar esta pantalla: gerencia tiene que pegar el SQL de facturas de los locales.' : m, 'error'));
  }
  if (!ctx.alive()) return;
  provs = provs.filter(p => p.activo !== false).sort((a, b) => porTexto(a.nombre, b.nombre));
  const nombreProv = (id) => (provs.find(p => p.id === id) || {}).nombre || '';

  let fotos = [];   // [{ file, data, tipo, canvas }]
  let pdf = null;   // { file }

  const selProv = h('select', { class: 'input', id: 'sf-prov', 'aria-label': 'Proveedor' },
    h('option', { value: '', text: 'No sé / no está en la lista' }), provs.map(p => h('option', { value: p.id, text: p.nombre })));
  const nota = h('textarea', { class: 'input', id: 'sf-nota', rows: 2, maxlength: 500, placeholder: 'Ej.: faltó la crema, vino una caja rota' });
  const input = h('input', { type: 'file', id: 'sf-archivo', accept: 'image/*,application/pdf', multiple: true });
  const lista = h('div', { class: 'rf-fotos' });
  const err = h('p', { class: 'form-err', role: 'alert' });
  const mandar = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Mandar a gerencia', disabled: true });
  const drop = h('label', { class: 'drop', for: 'sf-archivo' }, icon('recibir', 30), h('span', { class: 'drop-t', text: 'Sacar foto o elegir archivo' }),
    h('span', { class: 'sub', text: 'Si es larga, sacá varias fotos en orden. También sirve el PDF que mandó el proveedor.' }), input);
  const $hist = h('section', { class: 'sf-hist' });

  function pintarFotos() {
    lista.replaceChildren(...(pdf ? [h('div', { class: 'rf-foto rf-pdf' }, icon('pagos', 26), h('span', { text: pdf.file.name }),
      h('button', { class: 'icon-btn rf-quitar', type: 'button', 'aria-label': 'Quitar PDF', on: { click: () => { pdf = null; pintarFotos(); } } }, icon('cerrar', 16)))] :
      fotos.map((f, i) => h('div', { class: 'rf-foto' }, h('img', { src: f.canvas.toDataURL('image/jpeg', 0.5), alt: `Foto ${i + 1}` }),
        h('button', { class: 'icon-btn rf-quitar', type: 'button', 'aria-label': `Quitar foto ${i + 1}`, on: { click: () => { fotos.splice(i, 1); pintarFotos(); } } }, icon('cerrar', 16))))));
    mandar.disabled = !pdf && !fotos.length;
    drop.querySelector('.drop-t').textContent = pdf || fotos.length ? 'Agregar otra foto' : 'Sacar foto o elegir archivo';
  }
  input.addEventListener('change', async () => {
    const files = [...input.files]; input.value = ''; err.textContent = '';
    try {
      for (const f of files) {
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (f.size > PDF_MAX) throw new Error('El PDF es muy pesado (máximo 9 MB).');
          pdf = { file: f }; fotos = [];
        } else if (/^image\//.test(f.type)) {
          if (pdf) pdf = null;
          if (fotos.length >= MAX_FOTOS) throw new Error(`Máximo ${MAX_FOTOS} fotos por factura.`);
          fotos.push({ file: f, ...(await achicarFoto(f)) });
        }
      }
    } catch (e) { toast(e.message || String(e), 'error'); }
    pintarFotos();
  });

  mandar.addEventListener('click', async () => {
    err.textContent = '';
    mandar.disabled = true; mandar.textContent = 'Subiendo…';
    try {
      const base = `locales/${localId}/${Date.now()}`;
      const archivos = [];
      if (pdf) archivos.push(await subirArchivoLocal(`${base}-${seguro(pdf.file.name)}`, new File([pdf.file], pdf.file.name, { type: 'application/pdf' })));
      else for (let i = 0; i < fotos.length; i++) {
        archivos.push(await subirArchivoLocal(`${base}-foto${i + 1}.jpg`, new File([base64ABlob(fotos[i].data, 'image/jpeg')], `foto${i + 1}.jpg`, { type: 'image/jpeg' })));
      }
      const fila = await crearFacturaLocal({ local_id: localId, proveedor_id: selProv.value || null, archivos, nota: nota.value.trim(),
        subida_por_nombre: lsGet('nombre') || ctx.nombreGuardado || '' });
      subidas.unshift(fila);
      fotos = []; pdf = null; nota.value = ''; selProv.value = '';
      pintarFotos(); pintarHist();
      toast('Listo: la factura le llegó a gerencia', 'ok');
    } catch (e) {
      const m = mensajeError(e);
      err.textContent = /row-level security|policy|Unauthorized|403/i.test(m) ? 'No se pudo subir: falta activar el permiso. Avisale a gerencia.' : m;
    } finally { mandar.textContent = 'Mandar a gerencia'; mandar.disabled = !pdf && !fotos.length; }
  });

  function pintarHist() {
    const filas = subidas.map(s => {
      const [txt, cls] = ESTADO[s.estado] || ESTADO.pendiente;
      const n = (s.archivos || []).length;
      return h('article', { class: 'prod sf-item', 'data-id': s.id },
        h('div', { class: 'sf-item-t' },
          h('h3', { class: 'prod-n', text: nombreProv(s.proveedor_id) || 'Proveedor sin indicar' }),
          h('span', { class: 'estado estado-' + cls, text: txt })),
        h('p', { class: 'prod-m' }, h('span', { text: fechaCorta(s.creado_en) }), h('span', { text: /\.pdf$/i.test((s.archivos || [])[0] || '') ? 'PDF' : `${n} ${n === 1 ? 'foto' : 'fotos'}` }),
          s.subida_por_nombre ? h('span', { text: s.subida_por_nombre }) : null),
        s.nota ? h('p', { class: 'sf-nota', text: s.nota }) : null,
        s.estado === 'pendiente' ? h('button', { class: 'btn btn-text btn-sm', type: 'button', text: 'Borrar (me equivoqué)', on: { click: async (e) => {
          if (!confirm('¿Borrar esta factura subida?')) return;
          e.target.disabled = true;
          try { await borrarFacturaLocal(s.id); subidas = subidas.filter(x => x.id !== s.id); pintarHist(); toast('Borrada', 'ok'); }
          catch (er) { e.target.disabled = false; toast(mensajeError(er), 'error'); }
        } } }) : null);
    });
    $hist.replaceChildren(h('h2', { class: 'rf-h2', text: 'Las que subiste' }),
      ...(filas.length ? filas : [vacio('Todavía no subiste facturas', 'Cuando llegue mercadería, sacale foto a la factura o remito.')]));
  }

  mount(root, cab,
    h('section', { class: 'bloque rf-paso' }, drop, lista, campo('Proveedor', selProv), campo('Nota para gerencia (opcional)', nota), err, mandar,
      h('p', { class: 'sub sf-aviso', text: 'Acá no se ven precios: gerencia revisa la factura y suma la mercadería al stock.' })),
    $hist);
  pintarFotos(); pintarHist();
}
