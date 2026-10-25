#!/usr/bin/env node
// Genera supabase/seed/0002_seed_v3.sql desde los CSV exportados de la planilla V3.
// Uso: node scripts/supabase-seed-v3.js [dirCSV] [salida.sql]
// dirCSV por defecto: supabase/datos-v3 (o supabase/datos-v3-ejemplo si no existe).
// Sin dependencias. El SQL generado es idempotente (upserts por código/nombre).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let dir = process.argv[2] || path.join(root, 'supabase', 'datos-v3');
if (!process.argv[2] && !fs.existsSync(path.join(dir, 'CATALOGO.csv'))) {
  dir = path.join(root, 'supabase', 'datos-v3-ejemplo');
  console.log('Aviso: no hay supabase/datos-v3, uso el ejemplo.');
}
const out = process.argv[3] || path.join(root, 'supabase', 'seed', '0002_seed_v3.sql');

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...data] = rows.filter(r => r.some(x => x !== ''));
  return data.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const read = n => parseCsv(fs.readFileSync(path.join(dir, n + '.csv'), 'utf8'));
const s = v => (v === '' || v == null) ? 'null' : "'" + String(v).replace(/'/g, "''") + "'";
const num = v => { const n = Number(String(v).replace(',', '.')); return v !== '' && isFinite(n) ? String(n) : 'null'; };
const bool = v => /^(si|sí|activo|true|1)$/i.test(v) ? 'true' : 'false';
const fecha = v => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(v || ''); return m ? m[1] : null; };

const locales = read('LOCALES'), provs = read('PROVEEDORES'), cat = read('CATALOGO');
const warn = [];

// Proveedores: los de la hoja + los que solo aparecen en el catálogo.
const provMap = new Map(provs.map(p => [p.Proveedor, p]));
for (const c of cat) if (c.Proveedor && !provMap.has(c.Proveedor)) { provMap.set(c.Proveedor, { Proveedor: c.Proveedor, Activo: 'SÍ' }); warn.push('Proveedor solo en catálogo: ' + c.Proveedor); }
const sinProv = cat.filter(c => !c.Proveedor).map(c => c.Código);
if (sinProv.length) warn.push('Productos sin proveedor: ' + sinProv.join(', '));
const locNombres = new Set(locales.map(l => l.Local));
for (const c of cat) if (!locNombres.has(c.Local)) warn.push('Local desconocido en ' + c.Código + ': ' + c.Local);
const codigos = new Set(); for (const c of cat) { if (codigos.has(c.Código)) warn.push('Código duplicado: ' + c.Código); codigos.add(c.Código); }

const hoy = new Date().toISOString().slice(0, 10);
const L = [];
L.push('-- 0002_seed_v3.sql · GENERADO por scripts/supabase-seed-v3.js (no editar a mano)');
L.push('-- Contiene teléfonos de proveedores: NO versionar. Idempotente.');
L.push('begin;');

L.push('insert into public.locales (codigo, nombre, encargados, activo) values');
L.push(locales.map(l => `  (${s(l.Prefijo_Codigo)}, ${s(l.Local)}, ${l.Encargados ? `array[${l.Encargados.split(',').map(x => s(x.trim())).join(', ')}]::text[]` : "'{}'::text[]"}, ${bool(l.Activo)})`).join(',\n'));
L.push('on conflict (codigo) do update set nombre = excluded.nombre, encargados = excluded.encargados, activo = excluded.activo;');

L.push('insert into public.proveedores (nombre, whatsapp, dias_entrega, pedido_minimo, notas, activo) values');
L.push([...provMap.values()].map(p => `  (${s(p.Proveedor)}, ${s(p.WhatsApp)}, ${s(p.Dias_Entrega)}, ${num(p.Pedido_Minimo || '')}, ${s(p.Observaciones)}, ${bool(p.Activo || 'SÍ')})`).join(',\n'));
L.push('on conflict (nombre) do update set whatsapp = excluded.whatsapp, dias_entrega = excluded.dias_entrega, pedido_minimo = excluded.pedido_minimo, notas = excluded.notas, activo = excluded.activo;');

if (cat.length) {
  L.push('with v(codigo, nombre, local, categoria, unidad, proveedor, par, activo) as (values');
  L.push(cat.map(c => `  (${s(c.Código)}, ${s(c.Producto)}, ${s(c.Local)}, ${s(c.Categoría)}, ${s(c.Unidad)}, ${s(c.Proveedor)}, ${num(c.Par)}::numeric, ${/^activo$/i.test(c.Estado) ? 'true' : 'false'})`).join(',\n'));
  L.push(')');
  L.push('insert into public.productos (codigo, nombre, local_id, categoria, unidad_compra, unidad_uso, proveedor_id, par, activo)');
  L.push('select v.codigo, v.nombre, l.id, v.categoria, v.unidad, v.unidad, p.id, v.par, v.activo');
  L.push('from v join public.locales l on l.nombre = v.local left join public.proveedores p on p.nombre = v.proveedor');
  L.push('on conflict (codigo) do update set nombre = excluded.nombre, local_id = excluded.local_id, categoria = excluded.categoria,');
  L.push('  unidad_compra = excluded.unidad_compra, unidad_uso = excluded.unidad_uso, proveedor_id = excluded.proveedor_id, par = excluded.par, activo = excluded.activo;');

  const conPrecio = cat.filter(c => c.Precio !== '' && Number(c.Precio) >= 0 && isFinite(Number(c.Precio)));
  if (conPrecio.length) {
    L.push('with v(codigo, precio, fecha) as (values');
    L.push(conPrecio.map(c => `  (${s(c.Código)}, ${num(c.Precio)}::numeric, ${s(fecha(c.Actualizado) || hoy)}::date)`).join(',\n'));
    L.push(')');
    L.push("insert into public.precios (producto_id, proveedor_id, precio, fecha, origen)");
    L.push("select p.id, p.proveedor_id, v.precio, v.fecha, 'v3' from v join public.productos p on p.codigo = v.codigo");
    L.push("where not exists (select 1 from public.precios x where x.producto_id = p.id and x.origen = 'v3' and x.fecha = v.fecha and x.precio = v.precio);");
  }

  const conStock = cat.filter(c => c.Stock_Actual !== '' && isFinite(Number(c.Stock_Actual)));
  if (conStock.length) {
    L.push('with v(codigo, stock) as (values');
    L.push(conStock.map(c => `  (${s(c.Código)}, ${num(c.Stock_Actual)}::numeric)`).join(',\n'));
    L.push(')');
    L.push("insert into public.movimientos (local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)");
    L.push("select p.local_id, p.id, 'inicial', v.stock, 'seed_v3', p.codigo, 'Stock inicial migrado de V3' from v join public.productos p on p.codigo = v.codigo");
    L.push("where not exists (select 1 from public.movimientos m where m.ref_tipo = 'seed_v3' and m.ref_id = p.codigo);");
  }
}
L.push('commit;');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, L.join('\n') + '\n');
console.log(`Seed escrito en ${path.relative(root, out)}: ${locales.length} locales, ${provMap.size} proveedores, ${cat.length} productos.`);
warn.forEach(w => console.log('Aviso:', w));
