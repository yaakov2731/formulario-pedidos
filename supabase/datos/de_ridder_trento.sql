-- Martín De Ridder · lista de precios octubre 2026 (71 artículos) en Trento (TRE).
-- Generado con scripts/sql-de-ridder.py. Incluye la columna nueva de 0021_codigo_proveedor.sql.
-- * Los 23 que ya estaban (TRE-129 a TRE-151) se actualizan; los otros 48 entran como TRE-152 a TRE-199.
-- * Se compran por caja y se miden en unidades (caja x12 = 12 unidades): así una venta de 1 alfajor descuenta 1 unidad.
--   Lo que viene entero (tortas, budines enteros, placas, pan) va por unidad; las mini cookies, por bolsa de 1 kg.
--   Ninguno de los 23 tenía stock contado, recetas ni pedidos (solo 5 ventas de alfajor de maicena, que ya eran unidades).
-- * Precio del bulto de la lista como costo (solo lo ve gerencia) (lista del 2026-10-05), con fecha de hoy. Los 23 que
--   ya estaban tenían el mismo precio (cargado desde la planilla V3): a esos no se les agrega otro.
-- * Todos a la vista en Pedir. Se puede correr más de una vez.

alter table public.productos add column if not exists codigo_proveedor text;

with lista(codigo, cod_prov, nombre, categoria, unidad_compra, unidad_uso, factor, precio) as (values
  ('TRE-152', '16.12', 'Alfajor de chocolate x12', 'Pastelería', 'caja', 'unidad', 12, 22100),
  ('TRE-150', '102.12', 'Alfajor de maicena x12', 'Pastelería', 'caja', 'unidad', 12, 24900),
  ('TRE-153', '03.12', 'Alfajor de manteca x12', 'Pastelería', 'caja', 'unidad', 12, 21700),
  ('TRE-154', '268.12', 'Alfajor mega almendras x12', 'Pastelería', 'caja', 'unidad', 12, 32800),
  ('TRE-155', '119.24', 'Colación x24', 'Pastelería', 'caja', 'unidad', 24, 34700),
  ('TRE-156', '04.12', 'Rogelito x12', 'Pastelería', 'caja', 'unidad', 12, 21800),
  ('TRE-157', '451', 'Budín banana, choco y nuez (vegano) entero', 'Pastelería', 'unidad', 'unidad', 1, 20100),
  ('TRE-158', '139', 'Budín de limón entero', 'Pastelería', 'unidad', 'unidad', 1, 19000),
  ('TRE-159', '453.12', 'Budín banana, choco y nuez porción x12', 'Pastelería', 'caja', 'unidad', 12, 23100),
  ('TRE-160', '34.12', 'Budín de limón porción x12', 'Pastelería', 'caja', 'unidad', 12, 20900),
  ('TRE-161', '330.12', 'Cookie chips x12', 'Pastelería', 'caja', 'unidad', 12, 14200),
  ('TRE-162', '92.12', 'Brownie x12', 'Pastelería', 'caja', 'unidad', 12, 32200),
  ('TRE-163', '156.12', 'Cuadrado coco y dulce de leche x12', 'Pastelería', 'caja', 'unidad', 12, 30200),
  ('TRE-164', '154.12', 'Limoncito x12', 'Pastelería', 'caja', 'unidad', 12, 21500),
  ('TRE-165', '155.12', 'Pasta frola cuadrado x12', 'Pastelería', 'caja', 'unidad', 12, 21800),
  ('TRE-166', '891', 'Mini cookies de manteca x1 kg', 'Pastelería', 'bolsa', 'kg', 1, 20700),
  ('TRE-167', '412', 'Mini alfajores surtidos x20', 'Pastelería', 'caja', 'unidad', 20, 18600),
  ('TRE-168', '168.20', 'Mini alfajor almendras x20', 'Pastelería', 'caja', 'unidad', 20, 21800),
  ('TRE-169', '90.20', 'Mini alfajor de chocolate x20', 'Pastelería', 'caja', 'unidad', 20, 19000),
  ('TRE-151', '136.20', 'Mini alfajor de maicena x20', 'Pastelería', 'caja', 'unidad', 20, 21600),
  ('TRE-170', '169.20', 'Mini alfajorcito de limón x20', 'Pastelería', 'caja', 'unidad', 20, 22000),
  ('TRE-171', '264.6', 'Mini conito DDL blanco x6', 'Pastelería', 'caja', 'unidad', 6, 7000),
  ('TRE-172', '78.6', 'Mini conito DDL negro x6', 'Pastelería', 'caja', 'unidad', 6, 7000),
  ('TRE-130', '234.121', 'Minitorta Capricho x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 49900),
  ('TRE-129', '234.4', 'Minitorta Capricho x4', 'Pastelería', 'caja', 'unidad', 4, 16600),
  ('TRE-132', '241.121', 'Minitorta Carrot cake x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 44900),
  ('TRE-131', '241.4', 'Minitorta Carrot cake x4', 'Pastelería', 'caja', 'unidad', 4, 12700),
  ('TRE-134', '27.121', 'Minitorta Cuadrada de manzana x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 44600),
  ('TRE-133', '287.4', 'Minitorta Manzana envuelta x4', 'Pastelería', 'caja', 'unidad', 4, 15000),
  ('TRE-136', '161.121', 'Minitorta Bariloche x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 51600),
  ('TRE-135', '161.4', 'Minitorta Bariloche x4', 'Pastelería', 'caja', 'unidad', 4, 17300),
  ('TRE-137', '235.4', 'Minitorta Blanco y negro x4', 'Pastelería', 'caja', 'unidad', 4, 17300),
  ('TRE-140', '86.121', 'Minitorta Bomba x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 50100),
  ('TRE-139', '86.4', 'Minitorta Bomba x4', 'Pastelería', 'caja', 'unidad', 4, 14400),
  ('TRE-142', '214.121', 'Minitorta Cheesecake x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 51100),
  ('TRE-141', '214.4', 'Minitorta Cheesecake x4', 'Pastelería', 'caja', 'unidad', 4, 14100),
  ('TRE-144', '85.121', 'Minitorta Key lime pie x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 55500),
  ('TRE-143', '85.4', 'Minitorta Key lime pie x4', 'Pastelería', 'caja', 'unidad', 4, 15300),
  ('TRE-146', '87.121', 'Minitorta Lemon pie x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 44600),
  ('TRE-145', '87.4', 'Minitorta Lemon pie x4', 'Pastelería', 'caja', 'unidad', 4, 10100),
  ('TRE-147', '244.4', 'Minitorta Limón con frutos rojos x4', 'Pastelería', 'caja', 'unidad', 4, 16500),
  ('TRE-149', '253.4', 'Minitorta Maracuyá x4', 'Pastelería', 'caja', 'unidad', 4, 16600),
  ('TRE-138', '235.121', 'Minitorta Blanco y negro x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 47600),
  ('TRE-148', '244.121', 'Minitorta Limón con frutos rojos x12 cajitas', 'Pastelería', 'caja', 'unidad', 12, 51600),
  ('TRE-173', '530', 'Pan blanco rebanado (lactal 1,3 kg)', 'Panadería', 'unidad', 'unidad', 1, 9200),
  ('TRE-174', '499.24', 'Scons de queso x24', 'Panadería', 'caja', 'unidad', 24, 52600),
  ('TRE-175', '184', 'Placa coco y dulce de leche', 'Pastelería', 'unidad', 'unidad', 1, 61400),
  ('TRE-176', '181', 'Placa frutos secos', 'Pastelería', 'unidad', 'unidad', 1, 63800),
  ('TRE-177', '183', 'Placa pasta frola', 'Pastelería', 'unidad', 'unidad', 1, 53900),
  ('TRE-178', '243.24', 'Chipá x24', 'Panadería', 'caja', 'unidad', 24, 35700),
  ('TRE-179', '101.24', 'Scons x24', 'Panadería', 'caja', 'unidad', 24, 26200),
  ('TRE-180', '170.24', 'Base tarta salada x24', 'Panadería', 'caja', 'unidad', 24, 24500),
  ('TRE-181', '66', 'Torta Bariloche', 'Pastelería', 'unidad', 'unidad', 1, 55000),
  ('TRE-182', '160', 'Torta bizcochuelo de chocolate', 'Pastelería', 'unidad', 'unidad', 1, 50900),
  ('TRE-183', '254', 'Torta Blanco y negro', 'Pastelería', 'unidad', 'unidad', 1, 46700),
  ('TRE-184', '12', 'Torta Bomba', 'Pastelería', 'unidad', 'unidad', 1, 49100),
  ('TRE-185', '238', 'Torta Capricho', 'Pastelería', 'unidad', 'unidad', 1, 54700),
  ('TRE-186', '240', 'Torta Carrot cake', 'Pastelería', 'unidad', 'unidad', 1, 39200),
  ('TRE-187', '24', 'Torta Cheesecake', 'Pastelería', 'unidad', 'unidad', 1, 55000),
  ('TRE-188', '11', 'Torta Criolla (rogel)', 'Pastelería', 'unidad', 'unidad', 1, 53400),
  ('TRE-189', '111', 'Torta Dubai', 'Pastelería', 'unidad', 'unidad', 1, 64500),
  ('TRE-190', '121', 'Torta Key lime pie', 'Pastelería', 'unidad', 'unidad', 1, 57600),
  ('TRE-191', '13', 'Torta Lemon pie', 'Pastelería', 'unidad', 'unidad', 1, 46500),
  ('TRE-192', '188', 'Torta Limón con frutos rojos', 'Pastelería', 'unidad', 'unidad', 1, 48900),
  ('TRE-193', '51', 'Torta de manzana', 'Pastelería', 'unidad', 'unidad', 1, 50300),
  ('TRE-194', '360', 'Torta Nuez y frutos rojos', 'Pastelería', 'unidad', 'unidad', 1, 46700),
  ('TRE-195', '26', 'Torta Patagonia', 'Pastelería', 'unidad', 'unidad', 1, 52200),
  ('TRE-196', '21', 'Torta Red velvet', 'Pastelería', 'unidad', 'unidad', 1, 45400),
  ('TRE-197', '219', 'Torta Tatin de pera', 'Pastelería', 'unidad', 'unidad', 1, 44400),
  ('TRE-198', '33', 'Torta Tiramisú', 'Pastelería', 'unidad', 'unidad', 1, 50100),
  ('TRE-199', '112', 'Torta Vasca', 'Pastelería', 'unidad', 'unidad', 1, 52300)
),
prov as (select id from public.proveedores where nombre = 'Martín De Ridder' order by creado_en limit 1),
-- Los que ya estaban: misma ficha, ahora con el código de la lista y medidos en unidades.
viejos as (
  update public.productos p
     set codigo_proveedor = d.cod_prov, unidad_compra = d.unidad_compra, unidad_uso = d.unidad_uso,
         factor_conversion = d.factor, categoria = d.categoria, activo = true, proveedor_id = (select id from prov)
    from lista d
   where p.codigo = d.codigo
  returning p.id, p.codigo, p.proveedor_id
),
nuevos as (
  insert into public.productos (codigo, codigo_proveedor, nombre, local_id, categoria, unidad_compra, unidad_uso, factor_conversion, proveedor_id, oculto)
  select d.codigo, d.cod_prov, d.nombre, l.id, d.categoria, d.unidad_compra, d.unidad_uso, d.factor, (select id from prov), false
    from lista d cross join public.locales l
   where l.codigo = 'TRE' and not exists (select 1 from public.productos x where x.codigo = d.codigo)
  on conflict (codigo) do nothing
  returning id, codigo, proveedor_id
),
todos as (select * from viejos union all select * from nuevos)
-- Precio de lista, solo si cambió respecto del último cargado.
insert into public.precios (producto_id, proveedor_id, precio, fecha, origen)
select t.id, t.proveedor_id, d.precio, current_date, 'proveedor'
  from todos t join lista d on d.codigo = t.codigo
 where not exists (select 1 from public.precio_actual x where x.producto_id = t.id and x.precio = d.precio);

-- Control: tiene que dar 71 productos, 71 con código de la lista y 71 con precio.
select count(*) as productos, count(p.codigo_proveedor) as con_codigo, count(pa.precio) as con_precio
  from public.productos p left join public.precio_actual pa on pa.producto_id = p.id
 where p.proveedor_id = (select id from public.proveedores where nombre = 'Martín De Ridder' order by creado_en limit 1)
   and p.local_id = (select id from public.locales where codigo = 'TRE');
