#!/usr/bin/env node
// Verifica 0024 a 0028 (conteos, lugares, borrar conteo, locales, apertura/cierre) en un Postgres en memoria (pglite).
// Aplica todas las migraciones en orden (las que pglite no soporta, como el aviso por Telegram, se saltean) y prueba
// contar_local con p_tipo, marcar_conteo (solo gerencia) y que 0028 se pueda pegar dos veces.
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
    catch (e) { if (f >= '0024') ok(false, 'aplica ' + f, e.message); else console.log('     (salteo ' + f + ': ' + e.message.split('\n')[0] + ')'); }
  }
  try { await db.exec(fs.readFileSync(path.join(dir, '0028_conteo_apertura_cierre.sql'), 'utf8')); ok(true, '0028 se puede pegar dos veces'); }
  catch (e) { ok(false, '0028 se puede pegar dos veces', e.message); }

  const G = '00000000-0000-0000-0000-00000000000a', E = '00000000-0000-0000-0000-00000000000b';
  const [{ id: L }] = (await db.query("insert into locales(codigo,nombre) values ('ZZZ','Prueba') returning id")).rows;
  await db.query('insert into auth.users(id) values ($1),($2)', [G, E]);
  await db.query("insert into perfiles(id,nombre,rol,local_id) values ($1,'G','gerencia',null),($2,'E','encargado',$3)", [G, E, L]);
  const [{ id: P }] = (await db.query("insert into productos(codigo,nombre,local_id,unidad_compra,unidad_uso) values ('ZZZ-1','Nalga',$1,'kg','kg') returning id", [L])).rows;
  const como = async (sub, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role authenticated`); try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); } };
  const items = JSON.stringify([{ producto_id: P, contado: 7 }]);

  const c1 = await como(E, () => db.query("select contar_local($1, $2::jsonb, 'Lucas', 'apertura') as id", [L, items]));
  const r1 = (await db.query('select tipo, encargado from conteos where id = $1', [c1.rows[0].id])).rows[0];
  ok(r1.tipo === 'apertura' && r1.encargado === 'Lucas', 'el encargado guarda un conteo de apertura');
  const c2 = await como(E, () => db.query('select contar_local($1, $2::jsonb, $3) as id', [L, items, 'Lucas']));
  ok((await db.query('select tipo from conteos where id = $1', [c2.rows[0].id])).rows[0].tipo === null, 'sin p_tipo (3 parámetros) sigue andando y queda sin marcar');
  const st = (await db.query("select coalesce(sum(cantidad),0)::numeric as s from movimientos where producto_id = $1", [P])).rows[0].s;
  ok(Number(st) === 7, 'el stock pasa a ser lo contado (7)', st);
  let err = null; try { await como(E, () => db.query("select contar_local($1, $2::jsonb, 'x', 'mitad')", [L, items])); } catch (e) { err = e.message; }
  ok(/apertura o de cierre/.test(err || ''), 'rechaza un tipo raro');
  err = null; try { await como(E, () => db.query("select marcar_conteo($1, 'cierre')", [c2.rows[0].id])); } catch (e) { err = e.message; }
  ok(/Solo gerencia/.test(err || ''), 'el encargado no puede cambiar el tipo');
  await como(G, () => db.query("select marcar_conteo($1, 'cierre')", [c2.rows[0].id]));
  ok((await db.query('select tipo from conteos where id = $1', [c2.rows[0].id])).rows[0].tipo === 'cierre', 'gerencia lo marca como cierre');
  await como(G, () => db.query("select marcar_conteo($1, '')", [c2.rows[0].id]));
  ok((await db.query('select tipo from conteos where id = $1', [c2.rows[0].id])).rows[0].tipo === null, 'gerencia lo deja sin marcar');
  const fn = (await db.query("select count(*)::int as n from pg_proc where proname = 'contar_local'")).rows[0].n;
  ok(fn === 1, 'queda una sola contar_local (sin ambigüedad para la API)', fn);
  console.log(fallas ? `\n${fallas} fallas` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
