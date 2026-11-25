// FIFO del contar guiado (encargado): qué lote usar primero según cuándo entró cada producto. Puro: sin DOM ni Supabase
// (se prueba con scripts/verify-costos.js). Solo fechas de entrada (recepciones y, para lo elaborado, producciones):
// nunca cantidades esperadas (el cierre sigue a ciegas) ni precios.
// Con dos o más entradas en la ventana se muestran las dos últimas: la más vieja "Primero" y la más nueva "Después"
// (la mercadería de antes de eso ya se tendría que haber usado). Con una: "Primero". Sin ninguna: "Sin fecha de entrada".
export const DIAS_FIFO = 45;

const dosDig = (n) => String(n).padStart(2, '0');
// "aaaa-mm-dd" del día local de un instante (creado_en).
export const diaLocal = (iso) => { const d = new Date(iso); return isNaN(d) ? null : `${d.getFullYear()}-${dosDig(d.getMonth() + 1)}-${dosDig(d.getDate())}`; };
export const ddmm = (dia) => { const [, m, d] = String(dia).split('-'); return `${d}/${m}`; };

// entradas: [{ producto_id, creado_en }] → Map producto_id → días distintos de entrada, de más viejo a más nuevo (los dos
// últimos). desde: "aaaa-mm-dd"; lo anterior no cuenta.
export function lotesFifo(entradas, { desde = null } = {}) {
  const m = new Map();
  for (const e of entradas || []) {
    if (!e || !e.producto_id) continue;
    const dia = diaLocal(e.creado_en);
    if (!dia || (desde && dia < desde)) continue;
    if (!m.has(e.producto_id)) m.set(e.producto_id, new Set());
    m.get(e.producto_id).add(dia);
  }
  const out = new Map();
  for (const [id, s] of m) out.set(id, [...s].sort().slice(-2));
  return out;
}

// Etiquetas para un producto: [{ tipo: 'primero' | 'despues' | 'sin', texto }].
export function etiquetasFifo(dias) {
  if (!dias || !dias.length) return [{ tipo: 'sin', texto: 'Sin fecha de entrada' }];
  const [a, b] = dias;
  const out = [{ tipo: 'primero', texto: `Primero · entró ${ddmm(a)}` }];
  if (b) out.push({ tipo: 'despues', texto: `Después · entró ${ddmm(b)}` });
  return out;
}
