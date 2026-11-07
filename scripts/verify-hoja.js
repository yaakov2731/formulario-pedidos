#!/usr/bin/env node
// Verifica 0031 (hoja por sector y retiros del Shopping) en un Postgres en memoria (pglite).
// Aplica todas las migraciones en orden y prueba hoja_contar, hoja_anotar, hoja_borrar, permisos y que 0031 se pueda pegar dos veces.
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
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
