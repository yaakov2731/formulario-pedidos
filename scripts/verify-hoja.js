#!/usr/bin/env node
// Verifica 0031 (hoja por sector y retiros del Shopping) y 0032 (días que abre, cierre que actualiza el stock) en un
// Postgres en memoria (pglite). Aplica todas las migraciones en orden y prueba hoja_contar, hoja_anotar, hoja_borrar,
// hoja_guardar, permisos y que 0031 y 0032 se puedan pegar dos veces.
// pglite: npm install --prefix /tmp/claude-0/pglite @electric-sql/pglite
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const root = path.join(__dirname, '..');
const pgDir = process.env.PGLITE_DIR || '/tmp/claude-0/pglite';
let req;
try { req = createRequire(path.join(pgDir, 'noop.js')); req.resolve('@electric-sql/pglite'); }
catch (e) { console.error('Falta @electric-sql/pglite. Instalá: npm install --prefix ' + pgDir + ' @electric-sql/pglite'); process.exit(2); }
let fallas = 0;
const ok = (c, m, x) => { console.log((c ? 'OK   ' : 'FAIL ') + m + (!c && x ? ' -> ' + x : '')); if (!c) fallas++; };

(async () => {
  const { PGlite } = req('@electric-sql/pglite');
  const { pg_trgm } = req('@electric-sql/pglite/contrib/pg_trgm');
  const { unaccent } = req('@electric-sql/pglite/contrib/unaccent');
  const db = new PGlite({ extensions: { pg_trgm, unaccent } });
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  const dir = path.join(root, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { if (f >= '0031') ok(false, 'aplica ' + f, e.message); else console.log('     (salteo ' + f + ': ' + e.message.split('\n')[0] + ')'); }
  }
  try { await db.exec(fs.readFileSync(path.join(dir, '0031_hoja_sector.sql'), 'utf8')); ok(true, '0031 se puede pegar dos veces'); }
  catch (e) { ok(false, '0031 se puede pegar dos veces', e.message); }
  try { await db.exec(fs.readFileSync(path.join(dir, '0032_dias_abre_cierre_stock.sql'), 'utf8')); ok(true, '0032 se puede pegar dos veces'); }
  catch (e) { ok(false, '0032 se puede pegar dos veces', e.message); }

  const G = '00000000-0000-0000-0000-00000000000a', E = '00000000-0000-0000-0000-00000000000b', E2 = '00000000-0000-0000-0000-00000000000c';
  const [{ id: L }] = (await db.query("insert into locales(codigo,nombre) values ('ZZZ','Prueba') returning id")).rows;
  const [{ id: L2 }] = (await db.query("insert into locales(codigo,nombre) values ('ZZY','Otro') returning id")).rows;
  await db.query('insert into auth.users(id) values ($1),($2),($3)', [G, E, E2]);
  await db.query("insert into perfiles(id,nombre,rol,local_id) values ($1,'G','gerencia',null),($2,'E','encargado',$3),($4,'E2','encargado',$5)", [G, E, L, E2, L2]);
  const [{ id: P }] = (await db.query("insert into productos(codigo,nombre,local_id,unidad_compra,unidad_uso) values ('ZZZ-1','Coca',$1,'unidad','unidad') returning id", [L])).rows;
  const como = async (sub, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role authenticated`); try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); } };
  const hoy = (await db.query('select current_date::text as d')).rows[0].d;
  const stock = async () => Number((await db.query('select coalesce(sum(cantidad),0)::numeric as s from movimientos where producto_id = $1', [P])).rows[0].s);
  await db.query("insert into movimientos(local_id, producto_id, tipo, cantidad) values ($1, $2, 'inicial', 50)", [L, P]);

  const n1 = await como(E, () => db.query("select hoja_contar($1, 'Barra', $2::date, 'apertura', $3::jsonb, 'Lucas') as n", [L, hoy, JSON.stringify([{ producto_id: P, cantidad: 24 }])]));
  ok(n1.rows[0].n === 1, 'el encargado guarda la apertura de la barra');
  await como(E, () => db.query("select hoja_contar($1, 'Barra', $2::date, 'apertura', $3::jsonb, 'Lucas')", [L, hoy, JSON.stringify([{ producto_id: P, cantidad: 20 }])]));
  const ap = (await db.query("select cantidad from hoja_movs where tipo = 'apertura'")).rows;
  ok(ap.length === 1 && Number(ap[0].cantidad) === 20, 'volver a guardar la apertura la corrige (no duplica)');
  ok(await stock() === 50, 'contar apertura no cambia el stock del local');
  await como(E, () => db.query("select hoja_anotar($1, 'Barra', $2::date, $3, 'entro', 12, 'Depósito', 'Lucas')", [L, hoy, P]));
  ok(await stock() === 50, 'entrar del depósito a la barra no cambia el stock total');
  const mid = (await como(E, () => db.query("select hoja_anotar($1, 'Barra', $2::date, $3, 'merma', 2, null, 'Lucas') as id", [L, hoy, P]))).rows[0].id;
  ok(await stock() === 48, 'la merma resta del stock (50 → 48)');
  await como(E, () => db.query('select hoja_borrar($1)', [mid]));
  ok(await stock() === 50 && (await db.query("select count(*)::int as n from hoja_movs where tipo='merma'")).rows[0].n === 0, 'borrar la merma la saca de la hoja y del stock');
  await como(E, () => db.query("select hoja_anotar($1, 'Depósito', $2::date, $3, 'retiro', 4, 'Baños planta baja', 'Marcos')", [L, hoy, P]));
  ok(await stock() === 46, 'el retiro resta del stock (50 → 46)');
  const ds = (await como(E, () => db.query('select nombre from destinos'))).rows.map(r => r.nombre);
  ok(ds.length === 1 && ds[0] === 'Baños planta baja', 'el destino nuevo queda guardado para la próxima');
  let err = null; try { await como(E, () => db.query("select hoja_anotar($1, 'Depósito', $2::date, $3, 'retiro', 4, '', 'Marcos')", [L, hoy, P])); } catch (e) { err = e.message; }
  ok(/a dónde va/.test(err || ''), 'el retiro sin destino se rechaza');
  err = null; try { await como(E2, () => db.query("select hoja_anotar($1, 'Barra', $2::date, $3, 'entro', 1)", [L, hoy, P])); } catch (e) { err = e.message; }
  ok(/Sin permiso/.test(err || ''), 'el encargado de otro local no puede anotar');
  const vis = (await como(E2, () => db.query('select count(*)::int as n from hoja_movs'))).rows[0].n;
  ok(vis === 0, 'el encargado de otro local no ve la hoja');
  err = null; try { await como(E, () => db.query("select hoja_anotar($1, 'Barra', $2::date, $3, 'entro', 0)", [L, hoy, P])); } catch (e) { err = e.message; }
  ok(/mayor a 0/.test(err || ''), 'cantidad 0 se rechaza');
  await como(E, () => db.query("select hoja_contar($1, 'Barra', $2::date, 'cierre', $3::jsonb, 'Lucas')", [L, hoy, JSON.stringify([{ producto_id: P, cantidad: 9 }])]));
  await como(E, () => db.query("select hoja_contar($1, 'Barra', $2::date, 'cierre', $3::jsonb, 'Lucas')", [L, hoy, JSON.stringify([{ producto_id: P, cantidad: '' }])]));
  ok((await db.query("select count(*)::int as n from hoja_movs where tipo='cierre'")).rows[0].n === 0, 'dejar vacío al corregir saca lo contado');

  // ---- 0032: días que abre y hoja_guardar ----
  const dias = (await db.query('select dias_abre::text as d, abre_feriados as f from locales where id = $1', [L])).rows[0];
  ok(dias.d === '{5,6,0}' && dias.f === true, 'los locales quedan con vie, sáb y dom y feriados · ' + dias.d);
  err = null; try { await db.query("update locales set dias_abre = '{1,9}' where id = $1", [L]); } catch (e) { err = e.message; }
  ok(/locales_dias_abre_chk/.test(err || ''), 'un día fuera de 0–6 se rechaza');
  await como(G, () => db.query("update locales set dias_abre = '{4,5,6,0}' where id = $1", [L]));
  ok((await db.query('select dias_abre::text as d from locales where id = $1', [L])).rows[0].d === '{4,5,6,0}', 'gerencia cambia los días que abre');
  const [{ id: Q }] = (await db.query("insert into productos(codigo,nombre,local_id,unidad_compra,unidad_uso) values ('ZZZ-2','Entraña',$1,'kg','kg') returning id", [L])).rows;
  const [{ id: K }] = (await db.query("insert into productos(codigo,nombre,local_id,unidad_compra,unidad_uso,categoria) values ('ZZZ-3','Bife',$1,'unidad','unidad','Carta') returning id", [L])).rows;
  const stockDe = async (pid) => Number((await db.query('select coalesce(sum(cantidad),0)::numeric as s from movimientos where producto_id = $1', [pid])).rows[0].s);
  await db.query("insert into movimientos(local_id, producto_id, tipo, cantidad) values ($1, $2, 'inicial', 20)", [L, Q]);
  const ayer = (await db.query("select (current_date - 1)::text as d")).rows[0].d;
  const guardarH = (sub, fecha, tipo, items) => como(sub, () => db.query('select hoja_guardar($1, $2::date, $3, $4::jsonb, $5) as n', [L, fecha, tipo, JSON.stringify(items), 'Martín']));
  const nA = (await guardarH(E, hoy, 'apertura', [{ producto_id: Q, sector: 'Cámara', cantidad: 18 }])).rows[0].n;
  ok(nA === 1 && await stockDe(Q) === 20, 'la apertura se guarda y no toca el stock');
  const nC = (await guardarH(E, hoy, 'cierre', [{ producto_id: Q, sector: 'Cámara', cantidad: 7.5 }, { producto_id: K, sector: 'Cocina', cantidad: 3 }])).rows[0].n;
  ok(nC === 2 && await stockDe(Q) === 7.5, 'el cierre deja el stock igual a lo contado (20 → 7,5)');
  ok(await stockDe(K) === 0, 'los platos de la carta no se ajustan');
  const aj1 = (await db.query("select count(*)::int as n from movimientos where producto_id = $1 and ref_tipo = 'hoja_cierre'", [Q])).rows[0].n;
  await guardarH(E, hoy, 'cierre', [{ producto_id: Q, sector: 'Cámara', cantidad: 7.5 }]);
  const aj2 = (await db.query("select count(*)::int as n from movimientos where producto_id = $1 and ref_tipo = 'hoja_cierre'", [Q])).rows[0].n;
  ok(aj1 === 1 && aj2 === 1 && await stockDe(Q) === 7.5, 'guardar el mismo cierre otra vez no duplica');
  await guardarH(E, hoy, 'cierre', [{ producto_id: Q, sector: 'Cámara', cantidad: 6 }]);
  ok(await stockDe(Q) === 6 && (await db.query("select count(*)::int as n from hoja_movs where producto_id = $1 and tipo = 'cierre'", [Q])).rows[0].n === 1, 'corregir el cierre ajusta solo la diferencia y no duplica la hoja');
  await guardarH(E, ayer, 'cierre', [{ producto_id: Q, sector: 'Cámara', cantidad: 2 }]);
  ok(await stockDe(Q) === 6, 'un cierre viejo con uno posterior no toca el stock');
  err = null; let code = null;
  try { await como(E2, () => db.query('select hoja_guardar($1, $2::date, $3, $4::jsonb)', [L, hoy, 'cierre', JSON.stringify([{ producto_id: Q, sector: 'Cámara', cantidad: 1 }])])); } catch (e) { err = e.message; code = e.code; }
  ok(code === '42501' && await stockDe(Q) === 6, 'el encargado de otro local no puede guardar (42501) · ' + code);
  err = null; try { await guardarH(E, hoy, 'cierre', [{ producto_id: Q, cantidad: 1 }]); } catch (e) { err = e.message; }
  ok(/Falta el sector/.test(err || ''), 'sin sector se rechaza');
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
