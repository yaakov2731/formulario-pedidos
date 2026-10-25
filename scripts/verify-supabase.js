#!/usr/bin/env node
// Verifica supabase/migrations/0001_base.sql (y el seed si existe) en un Postgres en memoria (pglite).
// pglite se resuelve desde PGLITE_DIR (por defecto /tmp/claude-0/pglite), instalado con:
//   npm install --prefix /tmp/claude-0/pglite @electric-sql/pglite
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.join(__dirname, '..');
const pgDir = process.env.PGLITE_DIR || '/tmp/claude-0/pglite';
let req;
try { req = createRequire(path.join(pgDir, 'noop.js')); req.resolve('@electric-sql/pglite'); }
catch (e) { console.error('Falta @electric-sql/pglite. Instalá: npm install --prefix ' + pgDir + ' @electric-sql/pglite'); process.exit(2); }

const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + name + (!ok && extra ? ' -> ' + extra : '')); };

(async () => {
  const { PGlite } = req('@electric-sql/pglite');
  const { pg_trgm } = req('@electric-sql/pglite/contrib/pg_trgm');
  const { unaccent } = req('@electric-sql/pglite/contrib/unaccent');
  const db = new PGlite({ extensions: { pg_trgm, unaccent } });

  // Simulación mínima de Supabase: roles y auth.uid().
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);

  const mig = fs.readFileSync(path.join(root, 'supabase/migrations/0001_base.sql'), 'utf8');
  try { await db.exec(mig); check('aplica 0001_base.sql', true); }
  catch (e) { check('aplica 0001_base.sql', false, e.message); return finish(); }
  try { await db.exec(mig); check('0001 es idempotente (2da aplicación)', true); }
  catch (e) { check('0001 es idempotente (2da aplicación)', false, e.message); }

  const seed = path.join(root, 'supabase/seed/0002_seed_v3.sql');
  let seeded = false;
  if (fs.existsSync(seed)) {
    try {
      await db.exec(fs.readFileSync(seed, 'utf8'));
      await db.exec(fs.readFileSync(seed, 'utf8')); // idempotencia
      const r = await db.query(`select (select count(*) from productos)::int p, (select count(*) from locales)::int l,
        (select count(*) from proveedores)::int v, (select count(*) from movimientos where tipo='inicial')::int m,
        (select count(*) from precios where origen='v3')::int pr`);
      const x = r.rows[0]; seeded = true;
      check(`seed aplicado dos veces (productos ${x.p}, locales ${x.l}, proveedores ${x.v}, iniciales ${x.m}, precios ${x.pr})`, x.p > 0 && x.l > 0);
    } catch (e) { check('seed aplicado', false, e.message); }
  } else console.log('INFO sin seed local (supabase/seed/0002_seed_v3.sql), se omite');

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = async (sub, fn) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role authenticated`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); }
  };
  const tryq = async (sql, p) => { try { return { rows: await q(sql, p) }; } catch (e) { return { err: e.message }; } };

  // Datos de prueba
  const U = { ger: '00000000-0000-0000-0000-0000000000a1', e1: '00000000-0000-0000-0000-0000000000b1',
              e2: '00000000-0000-0000-0000-0000000000b2', con: '00000000-0000-0000-0000-0000000000c1' };
  for (const id of Object.values(U)) await db.query('insert into auth.users(id) values ($1)', [id]);
  const [l1] = await q("insert into locales(codigo,nombre) values ('ZZ1','Local Test 1') returning id");
  const [l2] = await q("insert into locales(codigo,nombre) values ('ZZ2','Local Test 2') returning id");
  await db.query("insert into perfiles(id,nombre,rol,local_id) values ($1,'Gerente','gerencia',null),($2,'Enc 1','encargado',$4),($3,'Enc 2','encargado',$5),($6,'Conta','contadora',null)",
    [U.ger, U.e1, U.e2, l1.id, l2.id, U.con]);
  const [prov] = await q("insert into proveedores(nombre,whatsapp,cuit,alias_cbu) values ('Prov Test','5491100000000','20-00000000-0','test.alias') returning id");
  const [moz] = await q("insert into productos(codigo,nombre,local_id,categoria,unidad_compra,unidad_uso,proveedor_id) values ('ZZ1-001','Mozzarella',$1,'Lácteos','kg','kg',$2) returning id", [l1.id, prov.id]);
  const [ajeno] = await q("insert into productos(codigo,nombre,local_id) values ('ZZ2-001','Producto Ajeno',$1) returning id", [l2.id]);
  await db.query("insert into producto_alias(producto_id,alias,origen) values ($1,'Muzarella','proveedor')", [moz.id]);
  await db.query("insert into precios(producto_id,proveedor_id,precio,fecha,origen) values ($1,$2,100,'2026-01-01','manual'),($1,$2,120,'2026-02-01','manual')", [moz.id, prov.id]);

  // Stock por movimientos
  await db.query("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'recepcion',10),($1,$2,'venta',-3)", [l1.id, moz.id]);
  let st = (await q('select stock from stock_actual where local_id=$1 and producto_id=$2', [l1.id, moz.id]))[0];
  check('recepción +10, venta -3 => stock 7', Number(st.stock) === 7, JSON.stringify(st));
  await q('select registrar_conteo($1,$2,5)', [l1.id, moz.id]);
  st = (await q('select stock from stock_actual where local_id=$1 and producto_id=$2', [l1.id, moz.id]))[0];
  check('conteo a 5 => stock_actual = 5', Number(st.stock) === 5, JSON.stringify(st));
  const aj = await q("select cantidad from movimientos where tipo='ajuste_conteo' and producto_id=$1", [moz.id]);
  check('conteo inserta un único ajuste de -2', aj.length === 1 && Number(aj[0].cantidad) === -2, JSON.stringify(aj));
  const bad = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'venta',4)", [l1.id, moz.id]);
  check('venta con cantidad positiva rechazada (check de signo)', !!bad.err);

  // Búsqueda
  let b = await q("select nombre,score from buscar_productos('muza')");
  check("buscar_productos('muza') encuentra Mozzarella (vía alias Muzarella)", b.some(r => r.nombre === 'Mozzarella'), JSON.stringify(b));
  b = await q("select nombre from buscar_productos('MOZARELA')");
  check("buscar_productos('MOZARELA') tolera tildes/mayúsculas/errata", b.some(r => r.nombre === 'Mozzarella'), JSON.stringify(b));
  b = await q("select nombre from buscar_productos('mozzarella', $1)", [l2.id]);
  check('buscar_productos filtra por local', b.length === 0, JSON.stringify(b));
  const dupA = await tryq("insert into producto_alias(producto_id,alias,origen) values ($1,'MUZARELLA','proveedor')", [ajeno.id]);
  check('alias único por (origen, alias normalizado)', !!dupA.err);

  // Precios y RLS
  const pa = await q('select precio from precio_actual where producto_id=$1', [moz.id]);
  check('precio_actual = último precio (120)', pa.length === 1 && Number(pa[0].precio) === 120, JSON.stringify(pa));

  await as(U.e1, async () => {
    const p = await tryq('select * from precios');
    check('encargado: precios sin filas', p.err ? true : p.rows.length === 0, JSON.stringify(p.rows));
    const pv = await tryq('select * from precio_actual');
    check('encargado: precio_actual sin filas', pv.err ? true : pv.rows.length === 0, JSON.stringify(pv.rows));
    const op = await tryq('select * from orden_item_precios');
    check('encargado: orden_item_precios sin filas', op.err ? true : op.rows.length === 0);
    const pr = await tryq('select * from proveedores');
    check('encargado: no lee proveedores (CUIT/CBU/WhatsApp)', pr.err ? true : pr.rows.length === 0);
    const pb = await tryq('select * from proveedores_basico');
    check('encargado: proveedores_basico muestra nombre sin datos sensibles',
      pb.rows && pb.rows.length >= 1 && !('cuit' in pb.rows[0]) && !('whatsapp' in pb.rows[0]) && !('alias_cbu' in pb.rows[0]));
    for (const t of ['pagos', 'facturas_proveedor', 'pago_facturas', 'cuenta_corriente', 'ventas_import', 'ventas_items', 'ventas_pedidos', 'ventas_pedido_pagos']) {
      const r = await tryq('select * from ' + t);
      check('encargado: ' + t + ' sin filas', r.err ? true : r.rows.length === 0);
    }
    const prods = await q('select codigo from productos');
    check('encargado 1 ve solo productos de su local', prods.length >= 1 && prods.every(r => r.codigo.startsWith('ZZ1') || seeded === false) && !prods.some(r => r.codigo === 'ZZ2-001'), JSON.stringify(prods.slice(0, 5)));
    const sa = await q('select * from stock_actual');
    check('encargado ve stock solo de su local', sa.every(r => r.local_id === l1.id) && sa.length >= 1);
    const m1 = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'merma',-1)", [l1.id, moz.id]);
    check('encargado inserta merma en su local', !m1.err, m1.err);
    const m2 = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'merma',-1)", [l2.id, ajeno.id]);
    check('encargado NO inserta movimientos en otro local', !!m2.err);
    const m3 = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'venta',-1)", [l1.id, moz.id]);
    check('encargado NO inserta ventas', !!m3.err);
    const c = await tryq('select registrar_conteo($1,$2,3)', [l1.id, moz.id]);
    check('encargado registra conteo en su local', !c.err, c.err);
    const o1 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'borrador')", [l1.id, prov.id]);
    check('encargado crea orden borrador de su local', !o1.err, o1.err);
    const o2 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'enviada')", [l1.id, prov.id]);
    check('encargado NO crea orden enviada', !!o2.err);
    const o3 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'borrador')", [l2.id, prov.id]);
    check('encargado NO crea orden en otro local', !!o3.err);
    const f = await tryq("insert into facturas_proveedor(proveedor_id,numero,fecha,total) values ($1,'X',current_date,1)", [prov.id]);
    check('encargado NO inserta facturas', !!f.err);
    const pi = await tryq("insert into precios(producto_id,precio) values ($1,1)", [moz.id]);
    check('encargado NO inserta precios', !!pi.err);
  });

  await as(U.e2, async () => {
    const prods = await q('select codigo from productos');
    check('encargado de otro local no ve productos ajenos', !prods.some(r => r.codigo === 'ZZ1-001') && prods.some(r => r.codigo === 'ZZ2-001'), JSON.stringify(prods.slice(0, 5)));
    const sa = await q('select * from stock_actual where local_id=$1', [l1.id]);
    check('encargado de otro local no ve stock ajeno', sa.length === 0);
    const ocs = await q('select * from ordenes_compra');
    check('encargado de otro local no ve órdenes ajenas', ocs.length === 0);
  });

  await as(U.con, async () => {
    const p = await q('select precio from precio_actual where producto_id=$1', [moz.id]);
    check('contadora ve precio_actual', p.length === 1 && Number(p[0].precio) === 120, JSON.stringify(p));
    const pr = await q('select cuit from proveedores');
    check('contadora lee proveedores', pr.length >= 1);
    const f = await tryq("insert into facturas_proveedor(proveedor_id,numero,fecha,total) values ($1,'A-1',current_date,1000)", [prov.id]);
    check('contadora inserta factura', !f.err, f.err);
    const pg = await tryq("insert into pagos(proveedor_id,monto,numero_operacion) values ($1,400,'OP1')", [prov.id]);
    check('contadora inserta pago', !pg.err, pg.err);
    const cc = await q('select saldo from cuenta_corriente where proveedor_id=$1', [prov.id]);
    check('cuenta_corriente saldo = 1000 - 400 = 600', cc.length === 1 && Number(cc[0].saldo) === 600, JSON.stringify(cc));
    const pi = await tryq("insert into precios(producto_id,precio) values ($1,1)", [moz.id]);
    check('contadora NO escribe precios', !!pi.err);
    const pp = await tryq("insert into productos(codigo,nombre,local_id) values ('ZZ1-999','x',$1)", [l1.id]);
    check('contadora NO escribe productos', !!pp.err);
  });

  await as(U.ger, async () => {
    const p = await q('select count(*)::int n from precios');
    check('gerencia ve precios', p[0].n >= 2);
    const pr = await tryq("insert into precios(producto_id,precio) values ($1,130)", [moz.id]);
    check('gerencia escribe precios', !pr.err, pr.err);
    const prods = await q('select codigo from productos');
    check('gerencia ve productos de todos los locales', prods.some(r => r.codigo === 'ZZ1-001') && prods.some(r => r.codigo === 'ZZ2-001'));
  });

  // anon sin sesión
  await db.exec('set role anon');
  const an = await tryq('select * from productos');
  await db.exec('reset role');
  check('anon no accede a productos', !!an.err || an.rows.length === 0);

  return finish();
})().catch(e => { console.error('ERROR inesperado:', e); process.exit(1); });

function finish() {
  const fails = results.filter(x => !x).length;
  console.log(`\n${results.length - fails}/${results.length} chequeos OK` + (fails ? `, ${fails} FAIL` : ''));
  process.exit(fails ? 1 : 0);
}
