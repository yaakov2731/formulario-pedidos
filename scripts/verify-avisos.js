#!/usr/bin/env node
// Verifica 0033 (avisos por WhatsApp para Ara) en pglite: token, cierres_pendientes, permisos y que se pueda pegar dos veces.
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
  const tok0 = (await db.query('select token from avisos_token')).rows[0].token;
  try { await db.exec(fs.readFileSync(path.join(dir, '0033_avisos_whatsapp.sql'), 'utf8')); ok(true, '0033 se puede pegar dos veces'); }
  catch (e) { ok(false, '0033 se puede pegar dos veces', e.message); }
  const tok = (await db.query('select token from avisos_token')).rows[0].token;
  ok(tok === tok0 && tok.length === 64, 'pegarlo de nuevo no cambia el token');

  const G = '00000000-0000-0000-0000-00000000000a', E = '00000000-0000-0000-0000-00000000000b';
  const [{ id: A }] = (await db.query("insert into locales(codigo,nombre,avisos_whatsapp) values ('AAA','Abre',array['5491111111111']) returning id")).rows;
  const [{ id: B }] = (await db.query("insert into locales(codigo,nombre) values ('BBB','Cerró') returning id")).rows;
  const [{ id: S }] = (await db.query("insert into locales(codigo,nombre) values ('SHP','Shopping') returning id")).rows;
  await db.query("insert into locales(codigo,nombre) values ('VAC','Sin productos')");
  for (const [l, c] of [[A, 'A'], [B, 'B'], [S, 'S']]) await db.query("insert into productos(codigo,nombre,local_id,unidad_compra,unidad_uso) values ($1,'Coca',$2,'unidad','unidad')", ['P' + c, l]);
  const [{ id: PB }] = (await db.query("select id from productos where codigo = 'PB'")).rows;
  await db.query('insert into auth.users(id) values ($1),($2)', [G, E]);
  await db.query("insert into perfiles(id,nombre,rol,local_id) values ($1,'G','gerencia',null),($2,'E','encargado',$3)", [G, E, A]);
  const vie = '2026-11-27';
  await db.query("insert into hoja_movs(local_id,fecha,sector,producto_id,tipo,cantidad) values ($1,$2,'Barra',$3,'cierre',3)", [B, vie, PB]);

  const anon = async fn => { await db.exec('set role anon'); try { return await fn(); } finally { await db.exec('reset role'); } };
  const como = async (sub, fn) => { await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role authenticated`); try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); } };

  const r = (await anon(() => db.query('select cierres_pendientes($1, $2::date) as j', [tok, vie]))).rows[0].j;
  ok(r.fecha === vie, 'devuelve la fecha pedida');
  ok(r.faltan.length === 1 && r.faltan[0].codigo === 'AAA' && r.faltan[0].whatsapp[0] === '5491111111111', 'falta el local que abre el viernes y no cerró, con su WhatsApp', JSON.stringify(r.faltan));
  ok(r.cerraron.length === 1 && r.cerraron[0].codigo === 'BBB', 'el que cerró aparece en cerraron');
  ok(!JSON.stringify(r).includes('SHP') && !JSON.stringify(r).includes('VAC'), 'Shopping y locales sin productos quedan afuera');
  const mie = (await anon(() => db.query("select cierres_pendientes($1, '2026-11-25'::date) as j", [tok]))).rows[0].j;
  ok(mie.faltan.length === 0 && mie.no_abria.length === 2, 'un miércoles nadie debe cierre');
  const [{ id: PA }] = (await db.query("select id from productos where codigo = 'PA'")).rows;
  await db.query("insert into hoja_movs(local_id,fecha,sector,producto_id,tipo,cantidad) values ($1,'2026-11-25','Barra',$2,'apertura',3)", [A, PA]);
  const mie2 = (await anon(() => db.query("select cierres_pendientes($1, '2026-11-25'::date) as j", [tok]))).rows[0].j;
  ok(mie2.faltan.length === 1 && mie2.faltan[0].hizo_apertura === true, 'si abrió un día extra (apertura), se le pide el cierre');
  const hoy = (await anon(() => db.query('select cierres_pendientes($1) as j', [tok]))).rows[0].j;
  ok(/^\d{4}-\d{2}-\d{2}$/.test(hoy.fecha), 'sin fecha usa la jornada actual de Argentina');

  let err = null; try { await anon(() => db.query("select cierres_pendientes('malo')")); } catch (e) { err = e.message; }
  ok(/Token inválido/.test(err || ''), 'token equivocado se rechaza');
  err = null; try { await anon(() => db.query('select token from avisos_token')); } catch (e) { err = e.message; }
  ok(/permission denied/.test(err || ''), 'anon no puede leer la tabla del token');
  err = null; try { await como(E, () => db.query('select aviso_token()')); } catch (e) { err = e.message; }
  ok(/Solo gerencia/.test(err || ''), 'el encargado no ve el token');
  err = null; try { await anon(() => db.query('select aviso_token()')); } catch (e) { err = e.message; }
  ok(!!err, 'anon no ve el token');
  const t1 = (await como(G, () => db.query('select aviso_token() as t'))).rows[0].t;
  ok(t1 === tok, 'gerencia ve el token');
  const t2 = (await como(G, () => db.query('select aviso_token_nuevo() as t'))).rows[0].t;
  ok(t2 !== tok && t2.length === 64, 'gerencia genera un token nuevo');
  err = null; try { await anon(() => db.query('select cierres_pendientes($1)', [tok])); } catch (e) { err = e.message; }
  ok(/Token inválido/.test(err || ''), 'el token viejo deja de andar');
  await como(G, () => db.query("update locales set avisos_whatsapp = array['5492222222222'] where id = $1", [B]));
  ok((await db.query('select avisos_whatsapp from locales where id = $1', [B])).rows[0].avisos_whatsapp[0] === '5492222222222', 'gerencia guarda el WhatsApp del local');

  console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
