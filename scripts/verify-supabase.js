#!/usr/bin/env node
// Verifica supabase/migrations/0001_base.sql a 0008_borrar_importacion.sql, 0011_proveedores_datos.sql, 0014_borrar_pedidos.sql, 0016_facturas_saldo.sql, 0017_vender_tal_cual.sql, 0018_recibir_factura.sql y 0019_gasto_compras.sql (y el seed si existe) en un Postgres en memoria (pglite).
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

  const mig2 = fs.readFileSync(path.join(root, 'supabase/migrations/0002_roles_pedidos.sql'), 'utf8');
  try { await db.exec(mig2); check('aplica 0002_roles_pedidos.sql', true); }
  catch (e) { check('aplica 0002_roles_pedidos.sql', false, e.message); return finish(); }
  try { await db.exec(mig2); check('0002 es idempotente (2da aplicación)', true); }
  catch (e) { check('0002 es idempotente (2da aplicación)', false, e.message); }

  const mig3 = fs.readFileSync(path.join(root, 'supabase/migrations/0003_ventas_recetas.sql'), 'utf8');
  try { await db.exec(mig3); check('aplica 0003_ventas_recetas.sql', true); }
  catch (e) { check('aplica 0003_ventas_recetas.sql', false, e.message); return finish(); }
  try { await db.exec(mig3); check('0003 es idempotente (2da aplicación)', true); }
  catch (e) { check('0003 es idempotente (2da aplicación)', false, e.message); }

  const mig4 = fs.readFileSync(path.join(root, 'supabase/migrations/0004_pagos_tablero.sql'), 'utf8');
  try { await db.exec(mig4); check('aplica 0004_pagos_tablero.sql', true); }
  catch (e) { check('aplica 0004_pagos_tablero.sql', false, e.message); return finish(); }
  try { await db.exec(mig4); check('0004 es idempotente (2da aplicación)', true); }
  catch (e) { check('0004 es idempotente (2da aplicación)', false, e.message); }
  const mig5 = fs.readFileSync(path.join(root, 'supabase/migrations/0005_locales_login.sql'), 'utf8');
  try { await db.exec(mig5); await db.exec(mig5); check('aplica 0005_locales_login.sql (idempotente)', true); }
  catch (e) { check('aplica 0005_locales_login.sql (idempotente)', false, e.message); return finish(); }
  const mig6 = fs.readFileSync(path.join(root, 'supabase/migrations/0006_aviso_telegram.sql'), 'utf8');
  try { await db.exec(mig6); await db.exec(mig6); check('aplica 0006_aviso_telegram.sql (idempotente)', true); }
  catch (e) { check('aplica 0006_aviso_telegram.sql (idempotente)', false, e.message); return finish(); }
  const mig7 = fs.readFileSync(path.join(root, 'supabase/migrations/0007_recetas_estimadas.sql'), 'utf8');
  try { await db.exec(mig7); await db.exec(mig7); check('aplica 0007_recetas_estimadas.sql (idempotente)', true); }
  catch (e) { check('aplica 0007_recetas_estimadas.sql (idempotente)', false, e.message); return finish(); }
  const mig8 = fs.readFileSync(path.join(root, 'supabase/migrations/0008_borrar_importacion.sql'), 'utf8');
  try { await db.exec(mig8); await db.exec(mig8); check('aplica 0008_borrar_importacion.sql (idempotente)', true); }
  catch (e) { check('aplica 0008_borrar_importacion.sql (idempotente)', false, e.message); return finish(); }
  const mig11 = fs.readFileSync(path.join(root, 'supabase/migrations/0011_proveedores_datos.sql'), 'utf8');
  try {
    await db.exec(mig11); await db.exec(mig11);
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='proveedores'`)).rows.map(r => r.column_name);
    const faltan = ['razon_social', 'contacto', 'telefono', 'email', 'whatsapp_pagos', 'email_pagos', 'banco'].filter(c => !cols.includes(c));
    check('aplica 0011_proveedores_datos.sql (idempotente) con contacto, email y datos de pago', !faltan.length, faltan.join(', '));
  } catch (e) { check('aplica 0011_proveedores_datos.sql (idempotente)', false, e.message); return finish(); }

  const mig14 = fs.readFileSync(path.join(root, 'supabase/migrations/0014_borrar_pedidos.sql'), 'utf8');
  try { await db.exec(mig14); await db.exec(mig14); check('aplica 0014_borrar_pedidos.sql (idempotente)', true); }
  catch (e) { check('aplica 0014_borrar_pedidos.sql (idempotente)', false, e.message); return finish(); }
  const mig16 = fs.readFileSync(path.join(root, 'supabase/migrations/0016_facturas_saldo.sql'), 'utf8');
  try { await db.exec(mig16); await db.exec(mig16); check('aplica 0016_facturas_saldo.sql (idempotente)', true); }
  catch (e) { check('aplica 0016_facturas_saldo.sql (idempotente)', false, e.message); return finish(); }
  const mig17 = fs.readFileSync(path.join(root, 'supabase/migrations/0017_vender_tal_cual.sql'), 'utf8');
  try { await db.exec(mig17); await db.exec(mig17); check('aplica 0017_vender_tal_cual.sql (idempotente)', true); }
  catch (e) { check('aplica 0017_vender_tal_cual.sql (idempotente)', false, e.message); return finish(); }

  const mig18 = fs.readFileSync(path.join(root, 'supabase/migrations/0018_recibir_factura.sql'), 'utf8');
  try { await db.exec(mig18); await db.exec(mig18); check('aplica 0018_recibir_factura.sql (idempotente)', true); }
  catch (e) { check('aplica 0018_recibir_factura.sql (idempotente)', false, e.message); return finish(); }

  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/0013_locales_razon_social.sql'), 'utf8')); // 0019 usa la razón social de los locales
  const mig19 = fs.readFileSync(path.join(root, 'supabase/migrations/0019_gasto_compras.sql'), 'utf8');
  try { await db.exec(mig19); await db.exec(mig19); check('aplica 0019_gasto_compras.sql (idempotente)', true); }
  catch (e) { check('aplica 0019_gasto_compras.sql (idempotente)', false, e.message); return finish(); }

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
    check('encargado NO inserta movimientos (ni en su local)', !!m1.err);
    const m2 = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'merma',-1)", [l2.id, ajeno.id]);
    check('encargado NO inserta movimientos en otro local', !!m2.err);
    const m3 = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'recepcion',5)", [l1.id, moz.id]);
    check('encargado NO inserta recepciones', !!m3.err);
    const c = await tryq('select registrar_conteo($1,$2,3)', [l1.id, moz.id]);
    check('encargado NO registra conteo con efecto', !!c.err);
    const stE = (await q('select stock from stock_actual where local_id=$1 and producto_id=$2', [l1.id, moz.id]))[0];
    check('encargado ve "Quedan" (stock 5) y los intentos no lo alteraron', Number(stE.stock) === 5, JSON.stringify(stE));
    const o1 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado,cargado_por_nombre,nota) values ($1,$2,'borrador','Ana','sin apuro') returning id", [l1.id, prov.id]);
    check('encargado crea orden borrador de su local (con cargado_por_nombre y nota)', !o1.err, o1.err);
    const ordenId = o1.rows && o1.rows[0].id;
    const it1 = await tryq("insert into orden_items(orden_id,producto_id,cantidad_pedida) values ($1,$2,4)", [ordenId, moz.id]);
    check('encargado agrega ítems a su orden borrador', !it1.err, it1.err);
    const it2 = await tryq("update orden_items set cantidad_pedida = 6 where orden_id=$1", [ordenId]);
    check('encargado edita cantidades de su borrador', !it2.err, it2.err);
    const it3 = await tryq("insert into orden_items(orden_id,producto_id,cantidad_pedida) values ($1,$2,1)", [ordenId, ajeno.id]);
    check('encargado NO agrega productos de otro local', !!it3.err);
    const o2 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'enviada')", [l1.id, prov.id]);
    check('encargado NO crea orden enviada', !!o2.err);
    const o3 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'borrador')", [l2.id, prov.id]);
    check('encargado NO crea orden en otro local', !!o3.err);
    const o4 = await tryq("update ordenes_compra set estado='aprobada' where id=$1 returning id", [ordenId]);
    check('encargado NO aprueba su orden', !!o4.err || o4.rows.length === 0);
    const o6 = await tryq("insert into ordenes_compra(local_id,proveedor_id,estado,cargado_por_nombre) values ($1,null,'borrador','Ana') returning id", [l1.id]);
    check('encargado crea orden borrador sin proveedor', !o6.err, o6.err);
    const rr = await tryq("select recibir_orden($1, '[]'::jsonb)", [ordenId]);
    check('encargado NO ejecuta recibir_orden', !!rr.err);
    const o5 = await tryq("select * from proveedores_basico");
    check('encargado: proveedores_basico no expone pedido_minimo', o5.rows && o5.rows.length >= 1 && !('pedido_minimo' in o5.rows[0]) && 'tiene_minimo' in o5.rows[0]);
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
    const oAdm = await q("select count(*)::int n from ordenes_compra where cargado_por_nombre='Ana' and proveedor_id is not null");
    check('gerencia ve la orden cargada por el encargado', oAdm[0].n === 1);
    const aprob = await tryq("update ordenes_compra set estado='aprobada' where cargado_por_nombre='Ana' and proveedor_id is not null returning id");
    check('gerencia aprueba la orden', aprob.rows && aprob.rows.length === 1, aprob.err);
    const mg = await tryq("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'recepcion',2)", [l1.id, moz.id]);
    check('gerencia inserta recepciones', !mg.err, mg.err);
    const cg = await tryq('select registrar_conteo($1,$2,3)', [l1.id, moz.id]);
    check('gerencia registra conteo', !cg.err, cg.err);
    // recibir_orden: transaccional
    await q("update productos set factor_conversion = 2 where id = $1", [moz.id]);
    const ordenId2 = (await q("select id from ordenes_compra where cargado_por_nombre='Ana' and proveedor_id is not null"))[0].id;
    const itemId = (await q('select id from orden_items where orden_id=$1', [ordenId2]))[0].id;
    await q("update ordenes_compra set estado='enviada' where id=$1", [ordenId2]);
    const nMov0 = (await q('select count(*)::int n from movimientos'))[0].n;
    const bad2 = await tryq("select recibir_orden($1, $2::jsonb)", [ordenId2, JSON.stringify([{ orden_item_id: itemId, cantidad_recibida: 3, precio_unitario: 150 }, { orden_item_id: '00000000-0000-0000-0000-00000000dead', cantidad_recibida: 1 }])]);
    const nMov1 = (await q('select count(*)::int n from movimientos'))[0].n;
    const est0 = (await q('select estado, (select cantidad_recibida from orden_items where id=$2) rec from ordenes_compra where id=$1', [ordenId2, itemId]))[0];
    check('recibir_orden con ítem inválido falla y revierte todo', !!bad2.err && nMov1 === nMov0 && est0.estado === 'enviada' && est0.rec === null, JSON.stringify([bad2.err, nMov0, nMov1, est0]));
    const stk0 = Number((await q('select stock from stock_actual where local_id=$1 and producto_id=$2', [l1.id, moz.id]))[0].stock);
    const r1 = await tryq("select recibir_orden($1, $2::jsonb) r", [ordenId2, JSON.stringify([{ orden_item_id: itemId, cantidad_recibida: 4, precio_unitario: 150 }])]);
    check('gerencia recibe parcial (4 de 6): estado parcial', r1.rows && r1.rows[0].r === 'parcial', r1.err);
    const stk1 = Number((await q('select stock from stock_actual where local_id=$1 and producto_id=$2', [l1.id, moz.id]))[0].stock);
    check('recepción suma cantidad × factor (4 × 2 = 8)', stk1 - stk0 === 8, String(stk1 - stk0));
    const pa2 = await q('select precio from precio_actual where producto_id=$1', [moz.id]);
    check('recepción registra el precio nuevo (150)', Number(pa2[0].precio) === 150, JSON.stringify(pa2));
    const r2 = await tryq("select recibir_orden($1, $2::jsonb) r", [ordenId2, JSON.stringify([{ orden_item_id: itemId, cantidad_recibida: 2, precio_unitario: 150 }])]);
    check('segunda recepción completa la orden: recibida', r2.rows && r2.rows[0].r === 'recibida', r2.err);
    const nPre = (await q("select count(*)::int n from precios where origen='recepcion'"))[0].n;
    check('precio sin cambios no genera otro precio', nPre === 1, String(nPre));
    const r3 = await tryq("select recibir_orden($1, '[]'::jsonb)", [ordenId2]);
    check('no se recibe una orden ya recibida', !!r3.err);
    const prods = await q('select codigo from productos');
    check('gerencia ve productos de todos los locales', prods.some(r => r.codigo === 'ZZ1-001') && prods.some(r => r.codigo === 'ZZ2-001'));
  });

  // ===================== 0003: ventas, recetas, producción, merma y sugerido =====================
  const mk = async (cod, nom, loc, cat, uc, uu, fac, par, ela = false) => (await q(
    'insert into productos(codigo,nombre,local_id,categoria,unidad_compra,unidad_uso,factor_conversion,par,es_elaborado) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',
    [cod, nom, loc, cat, uc, uu, fac, par, ela]))[0].id;
  const cerv = await mk('ZZ1-100', 'Cerveza Test', l1.id, 'Bebidas', 'caja x 6', 'unidad', 6, 99);
  const queso = await mk('ZZ1-101', 'Queso Test', l1.id, 'Lácteos', 'kg', 'kg', 1, null);
  const pan = await mk('ZZ1-102', 'Pan Test', l1.id, 'Panadería', 'unidad', 'unidad', 1, null);
  const vino = await mk('ZZ1-104', 'Vino Test', l1.id, 'Bebidas', 'caja x 6', 'unidad', 6, null);
  const sinCons = await mk('ZZ1-105', 'Sin Consumo Test', l1.id, 'Varios', 'unidad', 'unidad', 1, 10);
  const viejo = await mk('ZZ1-106', 'Antiguo Test', l1.id, 'Varios', 'unidad', 'unidad', 1, 10);
  const salsa = await mk('ZZ1-103', 'Salsa Test', l1.id, 'Elaborados', null, 'litro', 1, null, true);
  let pla;
  const ajeno2 = await mk('ZZ2-100', 'Ajeno Test', l2.id, 'Varios', 'unidad', 'unidad', 1, null);
  await db.query("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'recepcion',45),($1,$3,'inicial',10),($1,$4,'inicial',50),($1,$5,'inicial',12),($1,$6,'inicial',4),($1,$7,'inicial',4)",
    [l1.id, cerv, queso, pan, vino, sinCons, viejo]);
  await db.query("insert into precios(producto_id,precio) values ($1,12)", [cerv]);

  await as(U.ger, async () => {
    const stockDe = async (pid) => Number((await q('select coalesce(sum(cantidad),0) s from movimientos where local_id=$1 and producto_id=$2', [l1.id, pid]))[0].s);
    // Alias de Núcleo y platos
    await q("select asociar_nucleo($1,'BEB-1',1)", [cerv]);
    await q("select asociar_nucleo($1,'VIN-1',0.2)", [vino]);
    const alias = await q("select local_id, cantidad_por_venta from producto_alias where origen='nucleo' and producto_id=$1", [vino]);
    check('asociar_nucleo guarda alias de Núcleo con local y cantidad_por_venta', alias.length === 1 && alias[0].local_id === l1.id && Number(alias[0].cantidad_por_venta) === 0.2, JSON.stringify(alias));
    await q("select asociar_nucleo($1,'VIN-1',0.25)", [vino]);
    const al2 = await q("select cantidad_por_venta from producto_alias where origen='nucleo' and producto_id=$1", [vino]);
    check('asociar_nucleo reemplaza el alias existente', al2.length === 1 && Number(al2[0].cantidad_por_venta) === 0.25);
    await q("select asociar_nucleo($1,'VIN-1',0.2)", [vino]);
    pla = (await q("select crear_plato($1,'SAN-1','Sándwich Test') id", [l1.id]))[0].id;
    const pla2 = (await q("select crear_plato($1,'SAN-2','Plato sin receta') id", [l1.id]))[0].id;
    const pla3 = (await q("select crear_plato($1,'SAN-1','Sándwich Test') id", [l1.id]))[0].id;
    const pr = (await q('select codigo, categoria, es_elaborado from productos where id=$1', [pla]))[0];
    check('crear_plato: producto elaborado, categoría Carta, código PLA-<código Núcleo>', pr.codigo === 'PLA-SAN-1' && pr.categoria === 'Carta' && pr.es_elaborado === true, JSON.stringify(pr));
    check('crear_plato es idempotente (mismo código de Núcleo, mismo producto)', pla3 === pla);
    // el mismo código de Núcleo puede existir en otro local con otro producto
    const otroLocal = await tryq("select asociar_nucleo($1,'BEB-1',1)", [ajeno2]);
    check('el código de Núcleo es por local (BEB-1 también en otro local)', !otroLocal.err, otroLocal.err);
    await q("delete from producto_alias where producto_id=$1", [ajeno2]);

    // Recetas
    const rs = await q("select guardar_receta($1,1,$2::jsonb,'test') id", [pla, JSON.stringify([{ insumo_id: queso, cantidad: 0.2 }, { insumo_id: pan, cantidad: 1 }])]);
    check('guardar_receta crea la receta del plato', rs.length === 1 && (await q('select count(*)::int n from receta_items where receta_id=$1', [rs[0].id]))[0].n === 2);
    const rs2 = await q("select guardar_receta($1,1,$2::jsonb) id", [pla, JSON.stringify([{ insumo_id: queso, cantidad: 0.2 }, { insumo_id: pan, cantidad: 1 }])]);
    check('guardar_receta reemplaza (no duplica) los insumos', rs2[0].id === rs[0].id && (await q('select count(*)::int n from receta_items where receta_id=$1', [rs[0].id]))[0].n === 2);
    const rBad = await tryq("select guardar_receta($1,1,$2::jsonb)", [pla, JSON.stringify([{ insumo_id: ajeno2, cantidad: 1 }])]);
    check('guardar_receta rechaza insumos de otro local', !!rBad.err);
    const rBad2 = await tryq("select guardar_receta($1,1,$2::jsonb)", [cerv, JSON.stringify([{ insumo_id: queso, cantidad: 1 }])]);
    check('guardar_receta rechaza productos que no son elaborados', !!rBad2.err);
    await q("select guardar_receta($1,2,$2::jsonb)", [salsa, JSON.stringify([{ insumo_id: queso, cantidad: 0.5 }])]);

    // Importar ventas
    const hoy = (await q('select current_date::text d'))[0].d;
    const pedidos = [
      { numero: 7001, fecha_hora: hoy + 'T12:30:00-03:00', cliente: 'Consumidor final', tipo_pedido: 'Salón', sector: 'Salon Test', total: 700 },
      { numero: 7002, fecha_hora: hoy + 'T20:10:00-03:00', cliente: 'Consumidor final', tipo_pedido: 'Mostrador', total: 300 },
      { numero: 7003, fecha_hora: hoy + 'T21:00:00-03:00', tipo_pedido: 'Salón', sector: 'Salon Test', total: 0 }
    ];
    const items = [
      { codigo: 'BEB-1', nombre: 'Cerveza', cantidad: 40, importe: 400, producto_id: cerv, pedido_numero: 7001, fecha_hora: hoy + 'T12:30:00-03:00', rubro: 'BEBIDAS', tipo_pedido: 'Salón', sector: 'Salon Test' },
      { codigo: 'VIN-1', nombre: 'Copa de vino', cantidad: 10, importe: 300, producto_id: vino, pedido_numero: 7001, fecha_hora: hoy + 'T12:30:00-03:00', rubro: 'BEBIDAS' },
      { codigo: 'SAN-1', nombre: 'Sándwich', cantidad: 3, importe: 300, producto_id: pla, pedido_numero: 7002, fecha_hora: hoy + 'T20:10:00-03:00', rubro: 'SÁNDWICHES' },
      { codigo: 'SAN-2', nombre: 'Plato sin receta', cantidad: 2, importe: 0, producto_id: pla2, pedido_numero: 7003, fecha_hora: hoy + 'T21:00:00-03:00', rubro: 'COCINA' },
      { codigo: 'CUB-1', nombre: 'Cubierto', cantidad: 4, importe: 0, no_descontar: true, pedido_numero: 7003 }
    ];
    const pagos = [
      { pedido_numero: 7001, forma_pago: 'Efectivo', monto: 500 }, { pedido_numero: 7001, forma_pago: 'Tarjeta', monto: 200 },
      { pedido_numero: 7002, forma_pago: 'Efectivo', monto: 300 }
    ];
    const stCerv0 = await stockDe(cerv), stQueso0 = await stockDe(queso), stPan0 = await stockDe(pan), stVino0 = await stockDe(vino);
    const imp = (await q('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l1.id, JSON.stringify(pedidos), JSON.stringify(items), JSON.stringify(pagos), 'umo.xlsx']))[0].r;
    check('importar_ventas: producto directo descuenta la cantidad vendida (40 cervezas)', (await stockDe(cerv)) === stCerv0 - 40, String(await stockDe(cerv)));
    check('importar_ventas: cantidad_por_venta (10 copas × 0,2 = 2 botellas)', Math.abs((await stockDe(vino)) - (stVino0 - 2)) < 1e-9);
    check('importar_ventas: plato con receta explota insumos (3 × 0,2 kg queso, 3 pan)', Math.abs((await stockDe(queso)) - (stQueso0 - 0.6)) < 1e-9 && (await stockDe(pan)) === stPan0 - 3, `${await stockDe(queso)} ${await stockDe(pan)}`);
    check('importar_ventas: el plato no mueve su propio stock', (await stockDe(pla)) === 0);
    check('importar_ventas: plato sin receta no descuenta y se informa', imp.sin_receta.length === 1 && imp.sin_receta[0].codigo === 'PLA-SAN-2' && Number(imp.sin_receta[0].cantidad) === 2 && imp.movimientos === 4, JSON.stringify(imp));
    check('importar_ventas: ítem "no descontar" no genera movimiento', imp.no_descontados === 1);
    const cnt = (await q(`select (select count(*) from ventas_import)::int i, (select count(*) from ventas_pedidos)::int p, (select count(*) from ventas_pedido_pagos)::int g,
      (select count(*) from ventas_items)::int it, (select count(*) from movimientos where ref_tipo='venta_import')::int m`))[0];
    check('importar_ventas: guarda import, pedidos, pagos (dos medios en el pedido 7001) e ítems', cnt.i === 1 && cnt.p === 3 && cnt.g === 3 && cnt.it === 5 && cnt.m === 4, JSON.stringify(cnt));
    const tot = (await q('select total_productos, total_cobrado, n_pedidos, pedidos_cero, con_detalle, con_pagos, estado from ventas_import'))[0];
    check('importar_ventas: totales (productos 1000, cobrado 1000, 3 pedidos, 1 a $0)', Number(tot.total_productos) === 1000 && Number(tot.total_cobrado) === 1000 && tot.n_pedidos === 3 && tot.pedidos_cero === 1 && tot.con_detalle && tot.con_pagos && tot.estado === 'procesado', JSON.stringify(tot));
    // idempotencia
    const stAntesRe = await stockDe(cerv);
    const imp2 = (await q('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l1.id, JSON.stringify(pedidos), JSON.stringify(items), JSON.stringify(pagos), 'umo.xlsx']))[0].r;
    const cnt2 = (await q(`select (select count(*) from ventas_import)::int i, (select count(*) from ventas_pedidos)::int p, (select count(*) from ventas_items)::int it, (select count(*) from movimientos where ref_tipo='venta_import')::int m`))[0];
    check('reimportar el mismo local + fecha reemplaza sin duplicar (filas y stock)', imp2.reemplazo === true && cnt2.i === 1 && cnt2.p === 3 && cnt2.it === 5 && cnt2.m === 4 && (await stockDe(cerv)) === stAntesRe);
    const items3 = items.map(i => i.codigo === 'BEB-1' ? { ...i, cantidad: 10 } : i);
    await q('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l1.id, JSON.stringify(pedidos), JSON.stringify(items3), JSON.stringify(pagos), 'umo.xlsx']);
    check('reimportar con otras cantidades deja solo la última versión (10 cervezas)', (await stockDe(cerv)) === stCerv0 - 10);
    await q('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l1.id, JSON.stringify(pedidos), JSON.stringify(items), JSON.stringify(pagos), 'umo.xlsx']);
    // ítems sin asociar bloquean, y todo revierte
    const sinAsoc = items.concat([{ codigo: 'XXX-9', nombre: 'Cosa sin asociar', cantidad: 1, importe: 10, pedido_numero: 7002 }]);
    const stFin = await stockDe(cerv);
    const eAsoc = await tryq('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l1.id, JSON.stringify(pedidos), JSON.stringify(sinAsoc), JSON.stringify(pagos), 'x']);
    const cnt3 = (await q(`select (select count(*) from ventas_import)::int i, (select count(*) from movimientos where ref_tipo='venta_import')::int m`))[0];
    check('ítem sin asociar bloquea la importación y revierte todo (conserva la anterior)', !!eAsoc.err && /sin asociar/.test(eAsoc.err) && cnt3.i === 1 && cnt3.m === 4 && (await stockDe(cerv)) === stFin, eAsoc.err);
    const eNeg = await tryq('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l1.id, '[]', JSON.stringify([{ codigo: 'BEB-1', nombre: 'x', cantidad: -1, importe: 1 }]), '[]', 'x']);
    check('cantidad negativa rechazada', !!eNeg.err);
    const eOtroLocal = await tryq('select importar_ventas($1,current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5) r', [l2.id, '[]', JSON.stringify([{ codigo: 'Q', nombre: 'x', cantidad: 1, importe: 1, producto_id: cerv }]), '[]', 'x']);
    check('no asocia ítems a productos de otro local', !!eOtroLocal.err);
    const eFecha = await tryq("select importar_ventas($1,current_date - 3,$2::jsonb,$3::jsonb,'[]'::jsonb,'x') r", [l1.id, JSON.stringify(pedidos), JSON.stringify(items)]);
    check('un pedido ya importado en otra fecha no se vuelve a cargar', !!eFecha.err, eFecha.err);
    const ps = await q('select codigo, vendidos from platos_sin_receta where local_id=$1', [l1.id]);
    check('platos_sin_receta lista el plato vendido sin receta', ps.length === 1 && ps[0].codigo === 'PLA-SAN-2' && Number(ps[0].vendidos) === 2, JSON.stringify(ps));
    // Modo simple (sin pedidos): solo ítems de otro día
    const simple = (await q("select importar_ventas($1,current_date - 40,'[]'::jsonb,$2::jsonb,'[]'::jsonb,'simple.xlsx') r", [l1.id, JSON.stringify([
      { codigo: 'BEB-1', nombre: 'Cerveza', cantidad: 2, importe: 20 }, { nombre: 'Antiguo Test', codigo: '', cantidad: 2, importe: 5, producto_id: viejo }])]))[0].r;
    check('modo simple (Pedidos por producto): ítems sin pedidos', simple.items === 2 && simple.pedidos === 0 && simple.movimientos === 2, JSON.stringify(simple));
    // Borrar una importación subida por error: el stock vuelve a como estaba
    const stB0 = await stockDe(cerv);
    const dup = (await q("select importar_ventas($1,current_date - 41,'[]'::jsonb,$2::jsonb,'[]'::jsonb,'repetido.xlsx') r", [l1.id, JSON.stringify([{ codigo: 'BEB-1', nombre: 'Cerveza', cantidad: 5, importe: 50 }])]))[0].r;
    check('importación repetida descuenta (5 cervezas)', (await stockDe(cerv)) === stB0 - 5);
    const nImp0 = (await q('select count(*)::int n from ventas_import'))[0].n;
    const bor = (await q('select borrar_importacion($1) r', [dup.import_id]))[0].r;
    const quedan = (await q("select (select count(*) from ventas_items where import_id=$1)::int it, (select count(*) from movimientos where ref_tipo='venta_import' and ref_id=$1::text)::int m", [dup.import_id]))[0];
    check('borrar_importacion devuelve el stock y borra ítems y movimientos', (await stockDe(cerv)) === stB0 && bor.movimientos === 1 && bor.items === 1 && quedan.it === 0 && quedan.m === 0, JSON.stringify(bor));
    check('borrar_importacion no toca las otras importaciones', (await q('select count(*)::int n from ventas_import'))[0].n === nImp0 - 1);
    const eBor2 = await tryq('select borrar_importacion($1) r', [dup.import_id]);
    check('borrar_importacion de una ya borrada avisa', !!eBor2.err && /ya no existe/.test(eBor2.err), eBor2.err);
    const conPed = (await q('select id from ventas_import where fecha_desde = current_date and local_id = $1', [l1.id]))[0].id;
    await q('begin');
    await q('select borrar_importacion($1)', [conPed]);
    const cascada = (await q('select (select count(*) from ventas_pedidos where import_id=$1)::int p, (select count(*) from ventas_pedido_pagos g join ventas_pedidos vp on vp.id=g.pedido_id where vp.import_id=$1)::int g', [conPed]))[0];
    check('borrar_importacion borra pedidos y pagos en cascada', cascada.p === 0 && cascada.g === 0, JSON.stringify(cascada));
    await q('rollback');

    // Se vende tal cual: el plato SAN-2 (2 vendidos hoy, sin receta) pasa a descontar un producto del stock. Todo se deshace al final.
    await q('begin');
    const pul = (await q("insert into productos(codigo,nombre,local_id,categoria,unidad_uso,es_elaborado) values ('ZZ1-110','Pulsera Test',$1,'Varios','unidad',false) returning id", [l1.id]))[0].id;
    await db.query("insert into movimientos(local_id,producto_id,tipo,cantidad) values ($1,$2,'inicial',50)", [l1.id, pul]);
    const stCervT = await stockDe(cerv), stQuesoT = await stockDe(queso);
    const vt = (await q('select vender_tal_cual($1,$2,1) r', [pla2, pul]))[0].r;
    const vtAl = await q("select producto_id from producto_alias where origen='nucleo' and alias='SAN-2'");
    const vtPla = (await q('select activo from productos where id=$1', [pla2]))[0];
    check('vender_tal_cual: las ventas ya importadas descuentan el producto (50 - 2 = 48)', (await stockDe(pul)) === 48 && vt.items === 1 && vt.importaciones === 1, JSON.stringify(vt) + ' ' + await stockDe(pul));
    check('vender_tal_cual: el código de Núcleo pasa al producto y el plato queda inactivo', vtAl.length === 1 && vtAl[0].producto_id === pul && vtPla.activo === false, JSON.stringify(vtAl));
    check('vender_tal_cual: no cambia lo que descontó el resto de la importación', (await stockDe(cerv)) === stCervT && Math.abs((await stockDe(queso)) - stQuesoT) < 1e-9);
    await q('select vender_tal_cual($1,$2,1)', [pla2, pul]);
    check('vender_tal_cual: repetirlo no descuenta dos veces', (await stockDe(pul)) === 48);
    const vtImp = (await q("select importar_ventas($1,current_date - 42,'[]'::jsonb,$2::jsonb,'[]'::jsonb,'pulseras.xlsx') r", [l1.id, JSON.stringify([{ codigo: 'SAN-2', nombre: 'Plato sin receta', cantidad: 5, importe: 50 }])]))[0].r;
    check('vender_tal_cual: la próxima importación descuenta directo (48 - 5 = 43)', (await stockDe(pul)) === 43 && vtImp.sin_receta.length === 0, JSON.stringify(vtImp));
    await q('select borrar_importacion($1)', [vtImp.import_id]);
    const pla4 = (await q("select crear_plato($1,'AGU-1','Agua Test') id", [l1.id]))[0].id;
    await q('select vender_tal_cual($1)', [pla4]);
    const p4 = (await q('select es_elaborado, categoria, unidad_uso, activo from productos where id=$1', [pla4]))[0];
    check('vender_tal_cual sin producto: el plato pasa a producto con stock (Reventa, unidad)', p4.es_elaborado === false && p4.categoria === 'Reventa' && p4.unidad_uso === 'unidad' && p4.activo === true, JSON.stringify(p4));
    await q('rollback');
    const vtBad = await tryq('select vender_tal_cual($1,$2,1)', [pla, salsa]);
    check('vender_tal_cual rechaza un elaborado como destino', !!vtBad.err && /elaborado/.test(vtBad.err), vtBad.err);
    const vtOtro = await tryq('select vender_tal_cual($1,$2,1)', [pla, ajeno2]);
    check('vender_tal_cual rechaza un producto de otro local', !!vtOtro.err, vtOtro.err);

    // Producción
    const stSalsa0 = await stockDe(salsa), stQ1 = await stockDe(queso);
    await q("select registrar_produccion($1,$2,4,'tanda 1')", [l1.id, salsa]);
    check('registrar_produccion: suma el elaborado (+4) y descuenta insumos (4 × 0,5 / 2 = 1 kg)', (await stockDe(salsa)) === stSalsa0 + 4 && Math.abs((await stockDe(queso)) - (stQ1 - 1)) < 1e-9);
    const tp = await q("select tipo from movimientos where ref_tipo='produccion' order by tipo");
    check('registrar_produccion usa los tipos produccion_consumo y produccion_alta', tp.map(x => x.tipo).join() === 'produccion_alta,produccion_consumo', JSON.stringify(tp));
    check('registrar_produccion deja el historial', (await q('select count(*)::int n from producciones'))[0].n === 1);
    const nM = (await q('select count(*)::int n from movimientos'))[0].n;
    const pSin = await tryq("select registrar_produccion($1,$2,1)", [l1.id, pla2]);
    const pNoEl = await tryq("select registrar_produccion($1,$2,1)", [l1.id, cerv]);
    check('registrar_produccion rechaza elaborados sin receta y productos no elaborados (sin dejar movimientos)', !!pSin.err && !!pNoEl.err && (await q('select count(*)::int n from movimientos'))[0].n === nM);

    // Merma / control
    await q('select registrar_conteo($1,$2,1)', [l1.id, cerv]);
    const mc = await q("select * from merma_control($1, current_date - 1, current_date + 1) where producto_id=$2", [l1.id, cerv]);
    check('merma_control: teórico (ventas) vs ajuste por conteo valuado a precio_actual / factor',
      mc.length === 1 && Number(mc[0].vendido) === 40 && Number(mc[0].teorico) === 40 && Number(mc[0].ajuste) === -2 && Number(mc[0].precio_uso) === 2 && Number(mc[0].valor_ajuste) === Number(mc[0].ajuste) * 2, JSON.stringify(mc));
  });

  // Sugerido: encargado de su local, sin precios
  await as(U.e1, async () => {
    const sg = await tryq('select * from sugerido_pedido($1)', [l1.id]);
    const cols = sg.rows && sg.rows[0] ? Object.keys(sg.rows[0]).join() : '';
    check('encargado lee sugerido_pedido de su local', !sg.err && sg.rows.length >= 7, sg.err);
    check('sugerido_pedido no expone precios', cols === 'producto_id,stock,consumo_semanal,pendiente,sugerido', cols);
    const fila = (id) => sg.rows.find(r => r.producto_id === id);
    check('sugerido con consumo: ventas de un solo día = 1 semana con datos: consumo 40, ceil((40 − stock 1) / factor 6) = 7 cajas', fila(cerv) && Number(fila(cerv).consumo_semanal) === 40 && Number(fila(cerv).sugerido) === 7, JSON.stringify(fila(cerv)));
    check('sugerido sin consumo usa la cantidad ideal: 10 − stock 4 = 6', fila(sinCons) && fila(sinCons).consumo_semanal === null && Number(fila(sinCons).sugerido) === 6, JSON.stringify(fila(sinCons)));
    check('consumo fuera de las últimas 4 semanas no cuenta (cae a la cantidad ideal: 10 − 2 = 8)', fila(viejo) && fila(viejo).consumo_semanal === null && Number(fila(viejo).sugerido) === 8, JSON.stringify(fila(viejo)));
    check('sugerido_pedido omite los platos de la carta y productos de otro local', !sg.rows.some(r => r.producto_id === pla || r.producto_id === ajeno2));
    const sgAjeno = await tryq('select * from sugerido_pedido($1)', [l2.id]);
    check('encargado no ve el sugerido de otro local', sgAjeno.err ? true : sgAjeno.rows.length === 0);
    // ventas, recetas y producción: nada
    for (const t of ['ventas_import', 'ventas_items', 'ventas_pedidos', 'ventas_pedido_pagos', 'recetas', 'receta_items', 'producciones', 'platos_sin_receta']) {
      const r = await tryq('select * from ' + t);
      check('encargado: ' + t + ' sin filas', r.err ? true : r.rows.length === 0);
    }
    const mcE = await tryq("select * from merma_control($1, current_date - 1, current_date + 1)", [l1.id]);
    check('encargado: merma_control sin filas', mcE.err ? true : mcE.rows.length === 0);
    for (const [nom, sql, par] of [
      ['importar_ventas', "select importar_ventas($1,current_date,'[]'::jsonb,$2::jsonb,'[]'::jsonb,'x')", [l1.id, JSON.stringify([{ codigo: 'a', nombre: 'a', cantidad: 1, producto_id: cerv }])]],
      ['registrar_produccion', 'select registrar_produccion($1,$2,1)', [l1.id, salsa]],
      ['guardar_receta', "select guardar_receta($1,1,'[]'::jsonb)", [pla]],
      ['crear_plato', "select crear_plato($1,'X','X')", [l1.id]],
      ['asociar_nucleo', "select asociar_nucleo($1,'X',1)", [cerv]],
      ['vender_tal_cual', 'select vender_tal_cual($1)', [pla]],
      ['borrar_importacion', "select borrar_importacion((select id from ventas_import limit 1))", []]]) {
      const r = await tryq(sql, par);
      check('encargado NO ejecuta ' + nom, !!r.err);
    }
  });
  await as(U.con, async () => {
    for (const t of ['ventas_import', 'ventas_items', 'ventas_pedidos', 'ventas_pedido_pagos', 'recetas', 'receta_items', 'producciones']) {
      const r = await tryq('select * from ' + t);
      check('contadora: ' + t + ' sin filas (solo gerencia)', r.err ? true : r.rows.length === 0);
    }
  });
  await as(U.ger, async () => {
    // Pendiente por órdenes aprobadas / enviadas
    const [o] = await q("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'aprobada') returning id", [l1.id, prov.id]);
    await q('insert into orden_items(orden_id,producto_id,cantidad_pedida) values ($1,$2,2)', [o.id, cerv]);
    const [oBorr] = await q("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'borrador') returning id", [l1.id, prov.id]);
    await q('insert into orden_items(orden_id,producto_id,cantidad_pedida) values ($1,$2,5)', [oBorr.id, cerv]);
    const f = (await q('select * from sugerido_pedido($1) where producto_id=$2', [l1.id, cerv]))[0];
    check('sugerido descuenta lo pendiente (2 cajas aprobadas = 12 unidades; el borrador no cuenta) → ceil((40 − 1 − 12) / 6) = 5', Number(f.pendiente) === 12 && Number(f.sugerido) === 5, JSON.stringify(f));
    // Ajuste de 0004: se divide por las semanas con ventas importadas del local (mínimo 1, máximo 4), no siempre por 4.
    for (const [dias, semanas] of [[3, 1], [10, 2], [19, 3], [27, 4]]) {
      await q("delete from movimientos where local_id=$1 and tipo='venta'", [l2.id]);
      await q("insert into movimientos(local_id,producto_id,tipo,cantidad,creado_en) values ($1,$2,'venta',-120,now() - ($3 || ' days')::interval)", [l2.id, ajeno2, String(dias)]);
      const s2 = (await q('select * from sugerido_pedido($1) where producto_id=$2', [l2.id, ajeno2]))[0];
      check(`sugerido: primera venta hace ${dias} días = ${semanas} semana(s) con datos: consumo semanal ${120 / semanas}`, Number(s2.consumo_semanal) === 120 / semanas, JSON.stringify(s2));
    }
    await q("delete from movimientos where local_id=$1 and tipo='venta'", [l2.id]);
  });

  // ===================== 0004: facturas, pagos y tablero =====================
  const [provP] = await q("insert into proveedores(nombre,whatsapp) values ('Prov Pagos','5491100000001') returning id");
  const [provOtro] = await q("insert into proveedores(nombre) values ('Prov Otro') returning id");
  let F1, F2, F3, F4, FO;
  await as(U.con, async () => {
    const ins = async (prv, num, venc, total) => (await q("insert into facturas_proveedor(proveedor_id,numero,fecha,vencimiento,total) values ($1,$2,current_date - 20,$3,$4) returning id", [prv, num, venc, total]))[0].id;
    F1 = await ins(provP.id, 'F-1', (await q("select (current_date - 10)::text d"))[0].d, 1000);
    F2 = await ins(provP.id, 'F-2', (await q("select (current_date + 15)::text d"))[0].d, 500);
    F3 = await ins(provP.id, 'F-3', null, 300);
    FO = await ins(provOtro.id, 'F-9', null, 100);
    const dupF = await tryq("insert into facturas_proveedor(proveedor_id,numero,fecha,total) values ($1,'F-1',current_date,1)", [provP.id]);
    check('factura: mismo proveedor y número no se repite', !!dupF.err);
    const vi = await q('select numero, pendiente, vencida from facturas_pendientes where proveedor_id=$1 order by numero', [provP.id]);
    check('facturas_pendientes: vencida solo la F-1 (venció hace 10 días y debe 1000)', vi.length === 3 && vi[0].vencida === true && vi[1].vencida === false && vi[2].vencida === false && Number(vi[0].pendiente) === 1000, JSON.stringify(vi));
    const pago = { proveedor_id: provP.id, monto: 1200, fecha: '2026-10-19', numero_operacion: 'OP-T1', cuenta_origen: 'CC$ 123', banco: 'Banco X', cuit_destino: '30-99999999-9',
      banco_destino: 'Banco Test', cuenta_destino: '0000000000000001234', concepto: 'Factura', descripcion: 'Test', comprobante_path: `pagos/${provP.id}/OP-T1.pdf`, actualizar_cuit: true };
    const r = await tryq('select registrar_pago($1::jsonb, $2::jsonb) id', [JSON.stringify(pago), JSON.stringify([{ factura_id: F1, monto: 1000 }, { factura_id: F2, monto: 200 }])]);
    check('contadora registra un pago con imputación a dos facturas', !r.err && !!r.rows[0].id, r.err);
    const pid = r.rows && r.rows[0].id;
    const pf = await q('select factura_id, monto from pago_facturas where pago_id=$1 order by monto desc', [pid]);
    check('registrar_pago: imputaciones guardadas (1000 a F-1 y 200 a F-2)', pf.length === 2 && Number(pf[0].monto) === 1000 && pf[0].factura_id === F1 && Number(pf[1].monto) === 200, JSON.stringify(pf));
    const pg = (await q('select monto, numero_operacion, comprobante_path, avisado_en, cargado_por from pagos where id=$1', [pid]))[0];
    check('registrar_pago: guarda el pago sin avisar, con comprobante y usuario', Number(pg.monto) === 1200 && pg.numero_operacion === 'OP-T1' && pg.comprobante_path.endsWith('OP-T1.pdf') && pg.avisado_en === null && pg.cargado_por === U.con, JSON.stringify(pg));
    const fp = await q('select numero, pendiente, imputado, vencida from facturas_pendientes where proveedor_id=$1 order by numero', [provP.id]);
    check('facturas_pendientes después del pago: F-1 saldada, F-2 debe 300, F-3 debe 300, ninguna vencida',
      Number(fp[0].pendiente) === 0 && Number(fp[1].pendiente) === 300 && Number(fp[1].imputado) === 200 && Number(fp[2].pendiente) === 300 && fp.every(x => x.vencida === false), JSON.stringify(fp));
    const cc = (await q('select facturado, pagado, saldo from cuenta_corriente where proveedor_id=$1', [provP.id]))[0];
    check('cuenta corriente del proveedor: facturado 1800, pagado 1200, saldo 600', Number(cc.facturado) === 1800 && Number(cc.pagado) === 1200 && Number(cc.saldo) === 600, JSON.stringify(cc));
    const cuit = (await q('select cuit from proveedores where id=$1', [provP.id]))[0].cuit;
    check('registrar_pago con actualizar_cuit guarda el CUIT del comprobante en el proveedor', cuit === '30-99999999-9', cuit);

    const nPagos = async () => (await q('select count(*)::int n from pagos'))[0].n;
    const n0 = await nPagos();
    const dup = await tryq('select registrar_pago($1::jsonb) id', [JSON.stringify({ proveedor_id: provP.id, monto: 50, numero_operacion: 'OP-T1' })]);
    check('la misma operación no se carga dos veces (mensaje claro, sin fila nueva)', !!dup.err && /ya está cargada/.test(dup.err) && (await nPagos()) === n0, dup.err);
    const dupIdx = await tryq("insert into pagos(proveedor_id,monto,numero_operacion) values ($1,1,'OP-T1')", [provP.id]);
    check('el índice único de numero_operacion también lo impide a mano', !!dupIdx.err);
    const exc = await tryq('select registrar_pago($1::jsonb, $2::jsonb)', [JSON.stringify({ proveedor_id: provP.id, monto: 500, numero_operacion: 'OP-T2' }), JSON.stringify([{ factura_id: F2, monto: 400 }])]);
    check('imputar más que el pendiente de la factura falla y no deja nada guardado', !!exc.err && /pendiente/.test(exc.err) && (await nPagos()) === n0 && (await q("select count(*)::int n from pagos where numero_operacion='OP-T2'"))[0].n === 0, exc.err);
    const sup = await tryq('select registrar_pago($1::jsonb, $2::jsonb)', [JSON.stringify({ proveedor_id: provP.id, monto: 100, numero_operacion: 'OP-T3' }), JSON.stringify([{ factura_id: F3, monto: 200 }])]);
    check('imputar más que el monto del pago falla (todo o nada)', !!sup.err && /supera/.test(sup.err) && (await nPagos()) === n0, sup.err);
    const ajena = await tryq('select registrar_pago($1::jsonb, $2::jsonb)', [JSON.stringify({ proveedor_id: provP.id, monto: 100, numero_operacion: 'OP-T4' }), JSON.stringify([{ factura_id: FO, monto: 100 }])]);
    check('no se imputa a facturas de otro proveedor', !!ajena.err && (await nPagos()) === n0, ajena.err);
    const cero = await tryq('select registrar_pago($1::jsonb) id', [JSON.stringify({ proveedor_id: provP.id, monto: 0, numero_operacion: 'OP-T5' })]);
    check('monto cero rechazado', !!cero.err);
    const sinProv = await tryq('select registrar_pago($1::jsonb) id', [JSON.stringify({ monto: 10, numero_operacion: 'OP-T6' })]);
    check('pago sin proveedor rechazado', !!sinProv.err);
    // sin imputar: queda como pago a cuenta
    const libre = await tryq('select registrar_pago($1::jsonb) id', [JSON.stringify({ proveedor_id: provOtro.id, monto: 40, numero_operacion: 'OP-T7' })]);
    check('un pago puede quedar sin imputar (a cuenta)', !libre.err, libre.err);
    const av = await tryq('update pagos set avisado_en = now() where id = $1 returning id', [pid]);
    check('contadora marca el pago como avisado', av.rows && av.rows.length === 1, av.err);
    F4 = await ins(provP.id, 'F-4', (await q("select (current_date - 3)::text d"))[0].d, 700);
    const pc = await tryq('select * from pagos where id=$1', [pid]);
    check('contadora lee pagos y comprobantes', pc.rows && pc.rows.length === 1);
    const tb = await tryq('select tablero()');
    check('contadora NO ve el tablero (ni las ventas)', !!tb.err);
  });
  await as(U.e1, async () => {
    for (const [nom, sql, par] of [
      ['registrar_pago', "select registrar_pago($1::jsonb)", [JSON.stringify({ proveedor_id: provP.id, monto: 10, numero_operacion: 'OP-ENC' })]],
      ['tablero', 'select tablero()', []],
      ['tablero_periodo', 'select tablero_periodo(null, current_date, current_date)', []]]) {
      const r = await tryq(sql, par);
      check('encargado NO ejecuta ' + nom + ' (error o sin datos)', !!r.err || (nom === 'tablero_periodo' && Object.values(r.rows[0])[0] === null));
    }
    for (const t of ['pagos', 'facturas_proveedor', 'pago_facturas', 'facturas_pendientes', 'cuenta_corriente']) {
      const r = await tryq('select * from ' + t);
      check('encargado: ' + t + ' sin filas', r.err ? true : r.rows.length === 0);
    }
    const ins = await tryq("insert into pagos(proveedor_id,monto) values ($1,1)", [provP.id]);
    check('encargado NO inserta pagos directo', !!ins.err);
    const ins2 = await tryq("update pagos set avisado_en = now() returning id");
    check('encargado NO marca avisos', ins2.err ? true : ins2.rows.length === 0);
  });
  await as(U.ger, async () => {
    const r = await tryq('select registrar_pago($1::jsonb, $2::jsonb) id', [JSON.stringify({ proveedor_id: provP.id, monto: 250, numero_operacion: 'OP-G1', cuit_destino: '30-11111111-1' }), JSON.stringify([{ factura_id: F3, monto: 250 }])]);
    check('gerencia también registra pagos', !r.err, r.err);
    const cuit = (await q('select cuit from proveedores where id=$1', [provP.id]))[0].cuit;
    check('sin actualizar_cuit el CUIT del proveedor no se pisa', cuit === '30-99999999-9', cuit);
    const f3 = (await q("select pendiente from facturas_pendientes where id=$1", [F3]))[0];
    check('imputación de gerencia a la F-3 (300 − 250 = 50)', Number(f3.pendiente) === 50, JSON.stringify(f3));

    // Tablero
    const tb = (await q('select tablero($1, current_date, current_date) t', [l1.id]))[0].t;
    const claves = Object.keys(tb).sort().join();
    check('tablero devuelve las claves esperadas', claves === 'actual,anterior,deuda,faltantes,pagos_sin_avisar,pedidos_por_aprobar,pendientes,periodo,stock', claves);
    check('tablero: período actual y anterior de igual duración', tb.periodo.desde === tb.periodo.hasta && tb.periodo.anterior_desde === tb.periodo.anterior_hasta && tb.periodo.anterior_hasta < tb.periodo.desde, JSON.stringify(tb.periodo));
    check('tablero.actual: claves ventas, compras, cmv, margen y margen_pct', Object.keys(tb.actual).sort().join() === 'cmv,compras,margen,margen_pct,ventas', JSON.stringify(tb.actual));
    check('tablero: ventas del día = total cobrado de la importación (1000)', Number(tb.actual.ventas) === 1000, JSON.stringify(tb.actual));
    check('tablero: costo de mercadería vendida = 40 cervezas × (12 / 6) + 3 kg de mozzarella × 150 / 2 = 305; margen 695 (69,5 %)', Number(tb.actual.cmv) === 305 && Number(tb.actual.margen) === 695 && Number(tb.actual.margen_pct) === 69.5, JSON.stringify(tb.actual));
    check('tablero: compras = recepciones valorizadas (1.890)', Number(tb.actual.compras) === 1890, JSON.stringify(tb.actual));
    check('tablero: período anterior sin ventas ni compras y margen_pct nulo', Number(tb.anterior.ventas) === 0 && Number(tb.anterior.compras) === 0 && tb.anterior.margen_pct === null, JSON.stringify(tb.anterior));
    check('tablero.stock: valor por local (cerveza 1 unidad × 12 / 6) y total', Number(tb.stock.total) > 0 && tb.stock.por_local.length === 1 && tb.stock.por_local[0].local_id === l1.id && Number(tb.stock.por_local[0].valor) >= 2, JSON.stringify(tb.stock));
    const dTotal = (await q('select sum(saldo)::numeric s from cuenta_corriente where saldo > 0'))[0].s;
    check('tablero.deuda: total = suma de saldos de la cuenta corriente y proveedor con más deuda primero', Number(tb.deuda.total) === Number(dTotal) && Number(tb.deuda.total) > 0 && tb.deuda.proveedores.length >= 1 && Number(tb.deuda.proveedores[0].saldo) >= Number(tb.deuda.proveedores.at(-1).saldo), JSON.stringify(tb.deuda));
    check('tablero.deuda.vencidas: la F-4 (700, venció hace 3 días)', tb.deuda.vencidas.n === 1 && Number(tb.deuda.vencidas.total) === 700 && tb.deuda.vencidas.items[0].numero === 'F-4', JSON.stringify(tb.deuda.vencidas));
    const sinAv = (await q('select count(*)::int n, sum(monto)::numeric t from pagos where avisado_en is null'))[0];
    check('tablero.pagos_sin_avisar: cuenta los pagos no avisados (el de OP-T1 ya está avisado)', tb.pagos_sin_avisar.n === sinAv.n && Number(tb.pagos_sin_avisar.total) === Number(sinAv.t) && tb.pagos_sin_avisar.items.every(i => i.proveedor), JSON.stringify(tb.pagos_sin_avisar));
    check('tablero.pedidos_por_aprobar: borradores del local (2)', tb.pedidos_por_aprobar.n === 2 && tb.pedidos_por_aprobar.items.length === 2, JSON.stringify(tb.pedidos_por_aprobar));
    const fc = tb.faltantes.find(x => x.nombre === 'Cerveza Test');
    check('tablero.faltantes: del más caro al más barato; cerveza = conteo −2 × 2 = 4', tb.faltantes.length >= 2 && fc && Number(fc.valor) === 4 && Number(fc.faltante) === 2 && tb.faltantes.every((x, i, a) => i === 0 || Number(a[i - 1].valor) >= Number(x.valor)), JSON.stringify(tb.faltantes));
    check('tablero.pendientes: sin precio, sin proveedor y sin receta con cantidad y ejemplos',
      ['sin_precio', 'sin_proveedor', 'sin_receta'].every(k => typeof tb.pendientes[k].n === 'number' && Array.isArray(tb.pendientes[k].ejemplos)) && tb.pendientes.sin_receta.ejemplos.includes('Plato sin receta') && tb.pendientes.sin_precio.n >= 1, JSON.stringify(tb.pendientes));
    check('tablero: los platos de la carta no cuentan como "sin precio" ni "sin proveedor"', !tb.pendientes.sin_precio.ejemplos.includes('Plato sin receta') && !tb.pendientes.sin_proveedor.ejemplos.includes('Plato sin receta'));
    const todos = (await q('select tablero() t'))[0].t;
    check('tablero sin parámetros: todos los locales y semana actual (lunes a hoy)', todos.periodo.local_id === null && todos.stock.por_local.length >= 2 && todos.periodo.hasta === (await q('select current_date::text d'))[0].d, JSON.stringify(todos.periodo));
    const mal = await tryq("select tablero(null, current_date, current_date - 2)");
    check('tablero con fechas invertidas falla con mensaje', !!mal.err);
  });

  // Aviso por Telegram (pglite no trae Vault ni pg_net: se simulan para ver qué mandaría)
  {
    const nueva = async () => (await as(U.e1, () => q("insert into ordenes_compra(local_id,proveedor_id,estado,cargado_por_nombre,nota) values ($1,$2,'borrador','Ruth','antes de las 10') returning id", [l1.id, prov.id])))[0].id;
    const [pan] = await q("insert into productos(codigo,nombre,local_id,categoria,unidad_compra,unidad_uso) values ('ZZ1-901','Pan de campo',$1,'Panadería','u','u') returning id", [l1.id]);
    const items = (oid, n, prod = moz.id) => as(U.e1, () => q('insert into orden_items(orden_id,producto_id,cantidad_pedida) values ($1,$2,$3)', [oid, prod, n]));
    let sinSecretos = true; try { await items(await nueva(), 2); } catch { sinSecretos = false; }
    check('sin Vault ni pg_net el pedido se guarda igual y no avisa', sinSecretos);
    await db.exec(`create schema if not exists vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
      create schema if not exists net; create table net.enviados(url text, body jsonb);
      create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as 'insert into net.enviados values (url, body) returning 1::bigint';`);
    const o0 = await nueva(); await items(o0, 1);
    check('sin token cargado no avisa', (await q('select count(*)::int n from net.enviados'))[0].n === 0);
    await db.exec("insert into vault.decrypted_secrets values ('telegram_token','TOKEN'),('telegram_chat_id','123')");
    const oid = await nueva(); await items(oid, 2.5);
    const env = await q('select url, body from net.enviados');
    check('pedido nuevo: un aviso a Telegram con local, proveedor, quién cargó, nota y productos',
      env.length === 1 && env[0].url === 'https://api.telegram.org/botTOKEN/sendMessage' && env[0].body.chat_id === '123'
      && /Pedido nuevo · Local Test 1/.test(env[0].body.text) && /Proveedor: Prov Test/.test(env[0].body.text) && /Cargó: Ruth/.test(env[0].body.text)
      && /Nota: antes de las 10/.test(env[0].body.text) && /Mozzarella × 2\.5/.test(env[0].body.text) && !/\$/.test(env[0].body.text), JSON.stringify(env));
    await items(oid, 1, pan.id);
    check('agregar productos a una orden ya avisada no repite el aviso', (await q('select count(*)::int n from net.enviados'))[0].n === 1);
    await db.exec("drop function net.http_post(text, jsonb, jsonb)");
    let guardo = true; try { const o2 = await nueva(); await items(o2, 1); } catch { guardo = false; }
    check('si Telegram falla el pedido se guarda igual', guardo);
    await db.exec('drop schema net cascade; drop schema vault cascade');
  }

  // Recetas estándar de Umo (necesitan el catálogo real del seed)
  if (seeded) {
    const rec = fs.readFileSync(path.join(root, 'supabase/datos/recetas_umo_estandar.sql'), 'utf8');
    const cuenta = async () => (await q("select count(*)::int r, (select count(*)::int from receta_items ri join recetas x on x.id = ri.receta_id join productos p on p.id = x.producto_id join locales l on l.id = p.local_id where l.codigo = 'UMO') i from recetas re join productos p on p.id = re.producto_id join locales l on l.id = p.local_id where l.codigo = 'UMO' and re.estimada"))[0];
    // Como en la base real: códigos asociados directo a un insumo crudo (1 kg por venta) y un plato ya creado al importar.
    const [umo] = await q("select id from locales where codigo = 'UMO'");
    await q("insert into producto_alias(producto_id, alias, origen, local_id, cantidad_por_venta) select p.id, x.alias, 'nucleo', $1, 1 from (values ('PAR-002','UMO-051'),('COC-004','UMO-056'),('PAR-007','UMO-056'),('ACH-001','UMO-054')) x(alias, cod) join productos p on p.codigo = x.cod", [umo.id]);
    await as(U.ger, () => q("select crear_plato($1, 'PAR-006', 'Vacío c/ Guarnición')", [umo.id]));
    try { await db.exec(rec); check('recetas estándar de Umo: se cargan', true); } catch (e) { check('recetas estándar de Umo: se cargan', false, e.message); }
    const c1 = await cuenta();
    check('recetas estándar: 28 platos y 76 insumos, todos del catálogo de Umo', c1.r === 28 && c1.i === 76, JSON.stringify(c1));
    const dir = await q("select a.alias, p.codigo, a.cantidad_por_venta::float c from producto_alias a join productos p on p.id = a.producto_id where a.alias in ('PAR-002','COC-004','PAR-007','ACH-001') order by a.alias");
    check('los códigos asociados directo a un insumo crudo pasan a su plato con receta', dir.every(x => x.codigo === 'PLA-' + x.alias && x.c === 1), JSON.stringify(dir));
    check('reusa el plato que ya se había creado al importar', (await q("select count(*)::int n from productos where codigo like 'PLA-PAR-006%'"))[0].n === 1);
    const alias = await q("select count(*)::int n from producto_alias a join locales l on l.id = a.local_id where l.codigo = 'UMO' and a.origen = 'nucleo' and a.alias like 'PAR-%'");
    check('recetas estándar: cada plato queda asociado a su código de Núcleo', alias[0].n === 8, JSON.stringify(alias));
    const [vac] = await q("select p.id, re.rinde from productos p join recetas re on re.producto_id = p.id where p.codigo = 'PLA-PAR-006'");
    const [ins] = await q("select id from productos where codigo = 'UMO-065'");
    await as(U.ger, () => q("select guardar_receta($1, 1, $2::jsonb, null)", [vac.id, JSON.stringify([{ insumo_id: ins.id, cantidad: 0.45 }])]));
    const [ed] = await q('select estimada from recetas where producto_id = $1', [vac.id]);
    check('al guardar la receta desde la app deja de ser estimada', ed.estimada === false);
    await db.exec(rec);
    const [it] = await q('select count(*)::int n, max(cantidad)::float c from receta_items ri join recetas re on re.id = ri.receta_id where re.producto_id = $1', [vac.id]);
    check('volver a correr las recetas estándar no pisa una receta revisada', it.n === 1 && it.c === 0.45, JSON.stringify(it));
    check('volver a correr las recetas estándar no duplica', (await cuenta()).r === 27);
  }

  // anon sin sesión
  await db.exec('set role anon');
  const an = await tryq('select * from productos');
  await db.exec('reset role');
  check('anon no accede a productos', !!an.err || an.rows.length === 0);
  await db.exec('set role anon');
  const ll = await tryq('select * from locales_login()');
  const lm = await tryq('select mi_rol()');
  await db.exec('reset role');
  check('anon lista locales para Entrar (solo codigo, nombre, encargados)', ll.rows && ll.rows.length >= 2 && Object.keys(ll.rows[0]).join() === 'codigo,nombre,encargados', ll.err);
  check('anon NO ejecuta mi_rol()', !!lm.err);
  const sinEnc = await q("select l.codigo from locales l where l.activo and not exists (select 1 from perfiles p where p.local_id = l.id and p.rol = 'encargado')");
  check('Entrar no lista locales sin encargado con usuario', ll.rows && !ll.rows.some(r => sinEnc.some(x => x.codigo === r.codigo)));

  // Borrar todos los pedidos (limpiar pruebas): solo gerencia, con BORRAR, y descuenta lo recibido del stock
  {
    const antes = (await q("select (select count(*) from ordenes_compra)::int o, (select count(*) from orden_items)::int i, (select count(*) from movimientos where ref_tipo='orden')::int mo, (select count(*) from movimientos where ref_tipo is distinct from 'orden')::int otros, (select count(*) from precios)::int pr"))[0];
    const stockSinOrden = async () => (await q("select local_id, producto_id, sum(cantidad)::float s from movimientos where ref_tipo is distinct from 'orden' group by 1,2 order by 1,2")).map(r => `${r.local_id}:${r.producto_id}:${r.s}`).join('|');
    const st0 = await stockSinOrden();
    check('hay pedidos con recepciones para probar el borrado', antes.o > 0 && antes.i > 0 && antes.mo > 0, JSON.stringify(antes));
    const eEnc = await as(U.e1, () => tryq("select borrar_todos_los_pedidos('BORRAR') r"));
    const eAnon = await (async () => { await db.exec('set role anon'); try { return await tryq("select borrar_todos_los_pedidos('BORRAR') r"); } finally { await db.exec('reset role'); } })();
    const eSin = await as(U.ger, () => tryq("select borrar_todos_los_pedidos('si') r"));
    const sigue = (await q('select count(*)::int n from ordenes_compra'))[0].n;
    check('borrar_todos_los_pedidos: encargado, anon y sin escribir BORRAR no borran nada', !!eEnc.err && !!eAnon.err && !!eSin.err && /BORRAR/.test(eSin.err) && sigue === antes.o, JSON.stringify([eEnc.err, eAnon.err, eSin.err]));
    const rb = await as(U.ger, () => tryq("select borrar_todos_los_pedidos(' borrar ') r"));
    const desp = (await q("select (select count(*) from ordenes_compra)::int o, (select count(*) from orden_items)::int i, (select count(*) from orden_item_precios)::int ip, (select count(*) from movimientos where ref_tipo='orden')::int mo, (select count(*) from movimientos where ref_tipo is distinct from 'orden')::int otros, (select count(*) from precios)::int pr"))[0];
    check('borrar_todos_los_pedidos borra órdenes, productos, precios recibidos y entradas de stock de recepciones',
      rb.rows && rb.rows[0].r.pedidos === antes.o && rb.rows[0].r.items === antes.i && rb.rows[0].r.movimientos === antes.mo && desp.o === 0 && desp.i === 0 && desp.ip === 0 && desp.mo === 0, JSON.stringify([rb, desp]));
    check('borrar_todos_los_pedidos no toca otros movimientos, stock por ventas/conteos ni precios de lista', desp.otros === antes.otros && desp.pr === antes.pr && (await stockSinOrden()) === st0);
    const rb2 = await as(U.ger, () => tryq("select borrar_todos_los_pedidos('BORRAR') r"));
    check('borrar_todos_los_pedidos sin pedidos devuelve 0', rb2.rows && rb2.rows[0].r.pedidos === 0, JSON.stringify(rb2));
  }

  // ===================== 0016: facturas pagas que figuraban vencidas + borrar factura =====================
  {
    // Caso real (Florida): dos pagos sin centavos cargados ANTES que una de sus facturas.
    const [pv] = await q("insert into proveedores(nombre) values ('Prov Saldo') returning id");
    const vencio = (await q("select (current_date - 3)::text d"))[0].d;
    const fac = async (num, total) => (await q("insert into facturas_proveedor(proveedor_id,numero,fecha,vencimiento,total) values ($1,$2,current_date - 7,$3,$4) returning id", [pv.id, num, vencio, total]))[0].id;
    const vista = async () => (await q('select numero, pendiente::float p, vencida from facturas_pendientes where proveedor_id=$1 order by numero', [pv.id]));
    let FA, FB;
    await as(U.con, async () => {
      FB = await fac('B', 575682.61);
      // como pasó: el pago de la A (340.495) se imputó a la B y el de la B dejó el resto a cuenta
      await q('select registrar_pago($1::jsonb, $2::jsonb)', [JSON.stringify({ proveedor_id: pv.id, monto: 340495, numero_operacion: 'OP-S1' }), JSON.stringify([{ factura_id: FB, monto: 340495 }])]);
      await q('select registrar_pago($1::jsonb, $2::jsonb)', [JSON.stringify({ proveedor_id: pv.id, monto: 575682, numero_operacion: 'OP-S2' }), JSON.stringify([{ factura_id: FB, monto: 235187.61 }])]);
      FA = await fac('A', 340495.64);
    });
    const v1 = await vista();
    check('0016: al cargar la factura que faltaba, cada pago pasa a la factura de su mismo monto (quedan $0,64 y $0,61 = pagadas)', Math.abs(v1[0].p - 0.64) < 0.001 && Math.abs(v1[1].p - 0.61) < 0.001 && v1.every(x => x.vencida === false), JSON.stringify(v1));
    await q('select _reimputar_proveedor($1)', [pv.id]);
    const v2 = await vista();
    check('0016: reimputar de nuevo da lo mismo (idempotente)', Math.abs(v2[0].p - 0.64) < 0.001 && Math.abs(v2[1].p - 0.61) < 0.001 && v2.every(x => x.vencida === false), JSON.stringify(v2));
    const FC = await fac('C', 1000);
    check('0016: una factura vencida sin pagos sigue figurando vencida', (await vista())[2].vencida === true);
    const eCon = await as(U.con, () => tryq('select borrar_factura($1) r', [FC]));
    const eEnc = await as(U.e1, () => tryq('select borrar_factura($1) r', [FC]));
    check('0016: borrar_factura solo gerencia (contadora y encargado no)', !!eCon.err && !!eEnc.err && (await vista()).length === 3, JSON.stringify([eCon.err, eEnc.err]));
    const rb = await as(U.ger, () => tryq('select borrar_factura($1) r', [FC]));
    check('0016: gerencia borra una factura', !rb.err && rb.rows[0].r.numero === 'C' && (await vista()).length === 2, JSON.stringify(rb));
    // borrar una factura pagada: el pago queda y lo imputado pasa a otra pendiente
    const FD = await fac('D', 500);
    await as(U.ger, () => q('select borrar_factura($1) r', [FA]));
    const pagos = (await q("select count(*)::int n from pagos where proveedor_id=$1", [pv.id]))[0].n;
    const d = (await vista()).find(x => x.numero === 'D');
    check('0016: borrar una factura pagada no borra el pago; su saldo se aplica a otra pendiente', pagos === 2 && d.p === 0 && d.vencida === false, JSON.stringify([pagos, d]));
  }

  // ===================== 0018: recibir con factura (con y sin pedido previo) =====================
  {
    const [pv] = await q("insert into proveedores(nombre) values ('Prov Factura') returning id");
    const mk = async (cod, nom, fac = 1) => (await q("insert into productos(codigo,nombre,local_id,unidad_compra,unidad_uso,factor_conversion,proveedor_id) values ($1,$2,$3,'caja','unidad',$4,$5) returning id", [cod, nom, l1.id, fac, pv.id]))[0].id;
    const tom = await mk('ZZ1-F01', 'Tomate perita', 1), lec = await mk('ZZ1-F02', 'Leche entera', 12);
    const st = async (pid) => Number((await q('select coalesce(sum(cantidad),0) s from movimientos where local_id=$1 and producto_id=$2', [l1.id, pid]))[0].s);
    const items = JSON.stringify([{ producto_id: tom, cantidad: 5, precio_unitario: 1500, alias: 'TOMATE PERITA X KG' }, { producto_id: lec, cantidad: 2, precio_unitario: 9000, alias: 'LECHE ENT LS 1L CJ12' }]);
    const fac = JSON.stringify({ numero: '0003-00001234', fecha: '2026-10-28', vencimiento: '2026-11-07', total: 25500, archivo: 'facturas/x/1.jpg' });
    const eEnc = await as(U.e1, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,$4::jsonb) r', [l1.id, pv.id, items, fac]));
    check('0018: encargado no puede recibir con factura', !!eEnc.err && (await st(tom)) === 0, eEnc.err);
    const r1 = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,$4::jsonb) r', [l1.id, pv.id, items, fac]));
    check('0018: sin pedido previo suma stock (5 cajas de tomate = 5; 2 cajas de leche x12 = 24)', !r1.err && (await st(tom)) === 5 && (await st(lec)) === 24, JSON.stringify(r1));
    const f = await q('select total::float t, vencimiento::text v, archivo from facturas_proveedor where proveedor_id=$1', [pv.id]);
    check('0018: deja la factura cargada en Pagos con total, vencimiento y archivo', f.length === 1 && f[0].t === 25500 && f[0].v === '2026-11-07' && f[0].archivo === 'facturas/x/1.jpg', JSON.stringify(f));
    const pr = await q("select precio::float p from precio_actual where producto_id=$1", [tom]);
    check('0018: guarda el precio de la factura', pr.length && pr[0].p === 1500, JSON.stringify(pr));
    const al = await q("select alias from producto_alias where origen='proveedor' and local_id=$1 and producto_id=$2", [l1.id, lec]);
    check('0018: aprende cómo figura el producto en la factura (alias del proveedor)', al.length === 1 && al[0].alias === 'LECHE ENT LS 1L CJ12', JSON.stringify(al));
    const r2 = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,$4::jsonb) r', [l1.id, pv.id, items, fac]));
    check('0018: la misma factura no se recibe dos veces', !!r2.err && /ya se recibió/.test(r2.err) && (await st(tom)) === 5, r2.err);
    const otro = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb) r', [l1.id, pv.id, JSON.stringify([{ producto_id: ajeno.id, cantidad: 1 }])]));
    check('0018: rechaza un producto de otro local', !!otro.err && /otro local/.test(otro.err), otro.err);
    // Con pedido abierto: lo pedido queda recibido (parcial si faltó algo) y lo que vino de más igual suma.
    const [o] = await q("insert into ordenes_compra(local_id,proveedor_id,estado) values ($1,$2,'enviada') returning id", [l1.id, pv.id]);
    await q("insert into orden_items(orden_id,producto_id,cantidad_pedida) values ($1,$2,10),($1,$3,1)", [o.id, tom, lec]);
    const it2 = JSON.stringify([{ producto_id: tom, cantidad: 6, precio_unitario: 1600 }]);
    const r3 = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,$4::jsonb,$5) r', [l1.id, pv.id, it2, JSON.stringify({ numero: '0003-00001300', total: 9600 }), o.id]));
    const oi = await q('select cantidad_recibida::float r from orden_items where orden_id=$1 and producto_id=$2', [o.id, tom]);
    check('0018: con pedido, suma lo recibido al pedido y queda parcial', !r3.err && r3.rows[0].r.estado_orden === 'parcial' && oi[0].r === 6 && (await st(tom)) === 11, JSON.stringify([r3, oi]));
    const mv = await q("select ref_tipo, ref_id from movimientos where producto_id=$1 order by creado_en desc limit 1", [tom]);
    check('0018: el movimiento del pedido queda ligado a la orden (lo borra "Borrar pedidos de prueba")', mv[0].ref_tipo === 'orden' && mv[0].ref_id === o.id, JSON.stringify(mv));
    const r4 = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,null,$4) r', [l1.id, prov.id, it2, o.id]));
    check('0018: rechaza un pedido de otro proveedor', !!r4.err, r4.err);
  }

  // ===================== 0019: gasto en compras y Recibo X =====================
  {
    const [pv] = await q("insert into proveedores(nombre) values ('Prov Gasto') returning id");
    await q("insert into productos(codigo,nombre,local_id,categoria,proveedor_id) values ('ZZ1-G01','Lavandina',$1,'Limpieza',$2),('ZZ1-G02','Detergente',$1,'Limpieza',$2),('ZZ1-G03','Bolsa',$1,'Descartables',$2)", [l1.id, pv.id]);
    const rx = await as(U.ger, () => tryq("insert into facturas_proveedor(proveedor_id,numero,tipo,local_id,fecha,total) values ($1,'X-0001-77','Recibo X',$2,'2026-10-20',50000) returning id", [pv.id, l1.id]));
    const g1 = await q("select tipo, es_x, categoria, local_id, pagada, pendiente::float p from gastos_compras where numero='X-0001-77'");
    check('0019: gerencia carga un Recibo X; suma al gasto con local y categoría automática (la más común del proveedor)', !rx.err && g1.length === 1 && g1[0].es_x === true && g1[0].categoria === 'Limpieza' && g1[0].local_id === l1.id && g1[0].p === 50000 && g1[0].pagada === false, JSON.stringify([rx.err, g1]));
    const malo = await as(U.ger, () => tryq("insert into facturas_proveedor(proveedor_id,numero,tipo,fecha,total) values ($1,'Z-1','Factura Z','2026-10-20',1)", [pv.id]));
    check('0019: rechaza un tipo de comprobante desconocido', !!malo.err, malo.err);
    const enc = await as(U.e1, () => tryq('select count(*)::int n from gastos_compras'));
    check('0019: el encargado no ve el gasto', !enc.err ? enc.rows[0].n === 0 : true, JSON.stringify(enc));
    const sinT = await q("insert into facturas_proveedor(proveedor_id,numero,fecha,total,categoria) values ($1,'0001-1','2026-10-21',1000,'Bebidas') returning id", [pv.id]);
    const g2 = await q("select tipo, categoria, razon_social from gastos_compras where id=$1", [sinT[0].id]);
    check('0019: factura sin tipo figura como "Factura", respeta la categoría puesta y sin local queda "Sin razón social"', g2[0].tipo === 'Factura' && g2[0].categoria === 'Bebidas' && g2[0].razon_social === 'Sin razón social', JSON.stringify(g2));
    // Recibir con factura: guarda tipo, local y la categoría de los productos recibidos.
    const bol = (await q("select id from productos where codigo='ZZ1-G03'"))[0].id;
    const r = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,$4::jsonb) r', [l1.id, pv.id, JSON.stringify([{ producto_id: bol, cantidad: 3, precio_unitario: 100 }]), JSON.stringify({ numero: 'X-0002-5', tipo: 'Recibo X', total: 300 })]));
    const g3 = await q("select tipo, categoria, local_id from gastos_compras where numero='X-0002-5'");
    check('0019: recibir con factura guarda tipo Recibo X, local y categoría de lo recibido', !r.err && g3.length === 1 && g3[0].tipo === 'Recibo X' && g3[0].categoria === 'Descartables' && g3[0].local_id === l1.id, JSON.stringify([r.err, g3]));
    const r2 = await as(U.ger, () => tryq('select recibir_con_factura($1,$2,$3::jsonb,$4::jsonb) r', [l1.id, pv.id, JSON.stringify([{ producto_id: bol, cantidad: 1 }]), JSON.stringify({ numero: 'X-0002-6', tipo: 'Cualquiera', total: 10 })]));
    const g4 = await q("select tipo from gastos_compras where numero='X-0002-6'");
    check('0019: un tipo raro leído de la factura queda como "Otro"', !r2.err && g4[0].tipo === 'Otro', JSON.stringify([r2.err, g4]));
  }

  return finish();
})().catch(e => { console.error('ERROR inesperado:', e); process.exit(1); });

function finish() {
  const fails = results.filter(x => !x).length;
  console.log(`\n${results.length - fails}/${results.length} chequeos OK` + (fails ? `, ${fails} FAIL` : ''));
  process.exit(fails ? 1 : 0);
}
