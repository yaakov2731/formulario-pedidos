// Feriados nacionales de Argentina (2026 y 2027) para saber si un local abre "mañana" (locales.abre_feriados, 0032).
// IMPORTANTE: armado a mano con la ley 27.399 (traslados de los feriados trasladables) y los días no laborables con fines
// turísticos conocidos. Antes de cada año hay que verificarlos contra el calendario oficial (argentina.gob.ar/interior/feriados)
// y corregir esta lista: un decreto puede agregar o mover días. Sin precios ni datos del negocio: solo fechas.
export const FERIADOS = [
  // 2026
  ['2026-01-01', 'Año Nuevo'],
  ['2026-02-16', 'Carnaval'], ['2026-02-17', 'Carnaval'],
  ['2026-03-23', 'Puente turístico'],
  ['2026-03-24', 'Día de la Memoria'],
  ['2026-04-02', 'Malvinas'], ['2026-04-03', 'Viernes Santo'],
  ['2026-05-01', 'Día del Trabajador'], ['2026-05-25', 'Revolución de Mayo'],
  ['2026-06-15', 'Paso a la Inmortalidad de Güemes'], ['2026-06-20', 'Día de la Bandera'],
  ['2026-07-09', 'Día de la Independencia'], ['2026-07-10', 'Puente turístico'],
  ['2026-08-17', 'Paso a la Inmortalidad de San Martín'],
  ['2026-10-12', 'Día de la Diversidad Cultural'],
  ['2026-11-23', 'Día de la Soberanía Nacional'],
  ['2026-12-07', 'Puente turístico'], ['2026-12-08', 'Inmaculada Concepción'],
  ['2026-12-25', 'Navidad'],
  // 2027 (sin los puentes turísticos: se decretan durante el año anterior)
  ['2027-01-01', 'Año Nuevo'],
  ['2027-02-08', 'Carnaval'], ['2027-02-09', 'Carnaval'],
  ['2027-03-24', 'Día de la Memoria'],
  ['2027-03-26', 'Viernes Santo'],
  ['2027-04-02', 'Malvinas'],
  ['2027-05-01', 'Día del Trabajador'], ['2027-05-25', 'Revolución de Mayo'],
  ['2027-06-20', 'Día de la Bandera'], ['2027-06-21', 'Paso a la Inmortalidad de Güemes'],
  ['2027-07-09', 'Día de la Independencia'],
  ['2027-08-16', 'Paso a la Inmortalidad de San Martín'],
  ['2027-10-11', 'Día de la Diversidad Cultural'],
  ['2027-11-20', 'Día de la Soberanía Nacional'],
  ['2027-12-08', 'Inmaculada Concepción'],
  ['2027-12-25', 'Navidad']
];
export const FERIADOS_SET = new Set(FERIADOS.map(f => f[0]));
const NOMBRES = new Map(FERIADOS);
export const esFeriado = (iso) => FERIADOS_SET.has(String(iso).slice(0, 10));
export const nombreFeriado = (iso) => NOMBRES.get(String(iso).slice(0, 10)) || '';
// Los próximos n feriados desde una fecha (incluida).
export const proximosFeriados = (desdeISO, n = 5) => FERIADOS.filter(f => f[0] >= desdeISO).slice(0, n).map(([fecha, nombre]) => ({ fecha, nombre }));
