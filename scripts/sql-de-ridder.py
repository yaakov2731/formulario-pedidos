# Genera supabase/datos/de_ridder_trento.sql: lista de precios octubre 2026 de Martín De Ridder para Trento (TRE).
# Uso: python3 scripts/sql-de-ridder.py > supabase/datos/de_ridder_trento.sql
# (código de la lista, nombre, categoría, precio del bulto, unidades por bulto, unidad de compra, unidad de uso, código TRE si ya existía)
L = [
 ('16.12', 'Alfajor de chocolate x12', 'Pastelería', 22100, 12, 'caja', 'unidad', None),
 ('102.12', 'Alfajor de maicena x12', 'Pastelería', 24900, 12, 'caja', 'unidad', 'TRE-150'),
 ('03.12', 'Alfajor de manteca x12', 'Pastelería', 21700, 12, 'caja', 'unidad', None),
 ('268.12', 'Alfajor mega almendras x12', 'Pastelería', 32800, 12, 'caja', 'unidad', None),
 ('119.24', 'Colación x24', 'Pastelería', 34700, 24, 'caja', 'unidad', None),
 ('04.12', 'Rogelito x12', 'Pastelería', 21800, 12, 'caja', 'unidad', None),
 ('451', 'Budín banana, choco y nuez (vegano) entero', 'Pastelería', 20100, 1, 'unidad', 'unidad', None),
 ('139', 'Budín de limón entero', 'Pastelería', 19000, 1, 'unidad', 'unidad', None),
 ('453.12', 'Budín banana, choco y nuez porción x12', 'Pastelería', 23100, 12, 'caja', 'unidad', None),
 ('34.12', 'Budín de limón porción x12', 'Pastelería', 20900, 12, 'caja', 'unidad', None),
 ('330.12', 'Cookie chips x12', 'Pastelería', 14200, 12, 'caja', 'unidad', None),
 ('92.12', 'Brownie x12', 'Pastelería', 32200, 12, 'caja', 'unidad', None),
 ('156.12', 'Cuadrado coco y dulce de leche x12', 'Pastelería', 30200, 12, 'caja', 'unidad', None),
 ('154.12', 'Limoncito x12', 'Pastelería', 21500, 12, 'caja', 'unidad', None),
 ('155.12', 'Pasta frola cuadrado x12', 'Pastelería', 21800, 12, 'caja', 'unidad', None),
 ('891', 'Mini cookies de manteca x1 kg', 'Pastelería', 20700, 1, 'bolsa', 'kg', None),
 ('412', 'Mini alfajores surtidos x20', 'Pastelería', 18600, 20, 'caja', 'unidad', None),
 ('168.20', 'Mini alfajor almendras x20', 'Pastelería', 21800, 20, 'caja', 'unidad', None),
 ('90.20', 'Mini alfajor de chocolate x20', 'Pastelería', 19000, 20, 'caja', 'unidad', None),
 ('136.20', 'Mini alfajor de maicena x20', 'Pastelería', 21600, 20, 'caja', 'unidad', 'TRE-151'),
 ('169.20', 'Mini alfajorcito de limón x20', 'Pastelería', 22000, 20, 'caja', 'unidad', None),
 ('264.6', 'Mini conito DDL blanco x6', 'Pastelería', 7000, 6, 'caja', 'unidad', None),
 ('78.6', 'Mini conito DDL negro x6', 'Pastelería', 7000, 6, 'caja', 'unidad', None),
 ('234.121', 'Minitorta Capricho x12 cajitas', 'Pastelería', 49900, 12, 'caja', 'unidad', 'TRE-130'),
 ('234.4', 'Minitorta Capricho x4', 'Pastelería', 16600, 4, 'caja', 'unidad', 'TRE-129'),
 ('241.121', 'Minitorta Carrot cake x12 cajitas', 'Pastelería', 44900, 12, 'caja', 'unidad', 'TRE-132'),
 ('241.4', 'Minitorta Carrot cake x4', 'Pastelería', 12700, 4, 'caja', 'unidad', 'TRE-131'),
 ('27.121', 'Minitorta Cuadrada de manzana x12 cajitas', 'Pastelería', 44600, 12, 'caja', 'unidad', 'TRE-134'),
 ('287.4', 'Minitorta Manzana envuelta x4', 'Pastelería', 15000, 4, 'caja', 'unidad', 'TRE-133'),
 ('161.121', 'Minitorta Bariloche x12 cajitas', 'Pastelería', 51600, 12, 'caja', 'unidad', 'TRE-136'),
 ('161.4', 'Minitorta Bariloche x4', 'Pastelería', 17300, 4, 'caja', 'unidad', 'TRE-135'),
 ('235.4', 'Minitorta Blanco y negro x4', 'Pastelería', 17300, 4, 'caja', 'unidad', 'TRE-137'),
 ('86.121', 'Minitorta Bomba x12 cajitas', 'Pastelería', 50100, 12, 'caja', 'unidad', 'TRE-140'),
 ('86.4', 'Minitorta Bomba x4', 'Pastelería', 14400, 4, 'caja', 'unidad', 'TRE-139'),
 ('214.121', 'Minitorta Cheesecake x12 cajitas', 'Pastelería', 51100, 12, 'caja', 'unidad', 'TRE-142'),
 ('214.4', 'Minitorta Cheesecake x4', 'Pastelería', 14100, 4, 'caja', 'unidad', 'TRE-141'),
 ('85.121', 'Minitorta Key lime pie x12 cajitas', 'Pastelería', 55500, 12, 'caja', 'unidad', 'TRE-144'),
 ('85.4', 'Minitorta Key lime pie x4', 'Pastelería', 15300, 4, 'caja', 'unidad', 'TRE-143'),
 ('87.121', 'Minitorta Lemon pie x12 cajitas', 'Pastelería', 44600, 12, 'caja', 'unidad', 'TRE-146'),
 ('87.4', 'Minitorta Lemon pie x4', 'Pastelería', 10100, 4, 'caja', 'unidad', 'TRE-145'),
 ('244.4', 'Minitorta Limón con frutos rojos x4', 'Pastelería', 16500, 4, 'caja', 'unidad', 'TRE-147'),
 ('253.4', 'Minitorta Maracuyá x4', 'Pastelería', 16600, 4, 'caja', 'unidad', 'TRE-149'),
 ('235.121', 'Minitorta Blanco y negro x12 cajitas', 'Pastelería', 47600, 12, 'caja', 'unidad', 'TRE-138'),
 ('244.121', 'Minitorta Limón con frutos rojos x12 cajitas', 'Pastelería', 51600, 12, 'caja', 'unidad', 'TRE-148'),
 ('530', 'Pan blanco rebanado (lactal 1,3 kg)', 'Panadería', 9200, 1, 'unidad', 'unidad', None),
 ('499.24', 'Scons de queso x24', 'Panadería', 52600, 24, 'caja', 'unidad', None),
 ('184', 'Placa coco y dulce de leche', 'Pastelería', 61400, 1, 'unidad', 'unidad', None),
 ('181', 'Placa frutos secos', 'Pastelería', 63800, 1, 'unidad', 'unidad', None),
 ('183', 'Placa pasta frola', 'Pastelería', 53900, 1, 'unidad', 'unidad', None),
 ('243.24', 'Chipá x24', 'Panadería', 35700, 24, 'caja', 'unidad', None),
 ('101.24', 'Scons x24', 'Panadería', 26200, 24, 'caja', 'unidad', None),
 ('170.24', 'Base tarta salada x24', 'Panadería', 24500, 24, 'caja', 'unidad', None),
 ('66', 'Torta Bariloche', 'Pastelería', 55000, 1, 'unidad', 'unidad', None),
 ('160', 'Torta bizcochuelo de chocolate', 'Pastelería', 50900, 1, 'unidad', 'unidad', None),
 ('254', 'Torta Blanco y negro', 'Pastelería', 46700, 1, 'unidad', 'unidad', None),
 ('12', 'Torta Bomba', 'Pastelería', 49100, 1, 'unidad', 'unidad', None),
 ('238', 'Torta Capricho', 'Pastelería', 54700, 1, 'unidad', 'unidad', None),
 ('240', 'Torta Carrot cake', 'Pastelería', 39200, 1, 'unidad', 'unidad', None),
 ('24', 'Torta Cheesecake', 'Pastelería', 55000, 1, 'unidad', 'unidad', None),
 ('11', 'Torta Criolla (rogel)', 'Pastelería', 53400, 1, 'unidad', 'unidad', None),
 ('111', 'Torta Dubai', 'Pastelería', 64500, 1, 'unidad', 'unidad', None),
 ('121', 'Torta Key lime pie', 'Pastelería', 57600, 1, 'unidad', 'unidad', None),
 ('13', 'Torta Lemon pie', 'Pastelería', 46500, 1, 'unidad', 'unidad', None),
 ('188', 'Torta Limón con frutos rojos', 'Pastelería', 48900, 1, 'unidad', 'unidad', None),
 ('51', 'Torta de manzana', 'Pastelería', 50300, 1, 'unidad', 'unidad', None),
 ('360', 'Torta Nuez y frutos rojos', 'Pastelería', 46700, 1, 'unidad', 'unidad', None),
 ('26', 'Torta Patagonia', 'Pastelería', 52200, 1, 'unidad', 'unidad', None),
 ('21', 'Torta Red velvet', 'Pastelería', 45400, 1, 'unidad', 'unidad', None),
 ('219', 'Torta Tatin de pera', 'Pastelería', 44400, 1, 'unidad', 'unidad', None),
 ('33', 'Torta Tiramisú', 'Pastelería', 50100, 1, 'unidad', 'unidad', None),
 ('112', 'Torta Vasca', 'Pastelería', 52300, 1, 'unidad', 'unidad', None),
]
assert len(L) == 71 and len({x[0] for x in L}) == 71
q = lambda s: "'" + s.replace("'", "''") + "'"
n = 152
filas = []
for cod, nom, cat, pre, uni, uc, uu, tre in L:
    if not tre:
        tre = 'TRE-%03d' % n; n += 1
    filas.append(f"  ({q(tre)}, {q(cod)}, {q(nom)}, {q(cat)}, {uc!r}, {uu!r}, {uni}, {pre})")
head = f"""-- Martín De Ridder · lista de precios octubre 2026 (71 artículos) en Trento (TRE).
-- Generado con scripts/sql-de-ridder.py. Incluye la columna nueva de 0021_codigo_proveedor.sql.
-- * Los 23 que ya estaban (TRE-129 a TRE-151) se actualizan; los otros {n-152} entran como TRE-152 a TRE-{n-1}.
-- * Se compran por caja y se miden en unidades (caja x12 = 12 unidades): así una venta de 1 alfajor descuenta 1 unidad.
--   Lo que viene entero (tortas, budines enteros, placas, pan) va por unidad; las mini cookies, por bolsa de 1 kg.
--   Ninguno de los 23 tenía stock contado, recetas ni pedidos (solo 5 ventas de alfajor de maicena, que ya eran unidades).
-- * Precio del bulto de la lista como costo (solo lo ve gerencia) (lista del 2026-10-05), con fecha de hoy. Los 23 que
--   ya estaban tenían el mismo precio (cargado desde la planilla V3): a esos no se les agrega otro.
-- * Todos a la vista en Pedir. Se puede correr más de una vez.
"""
valores = "with lista(codigo, cod_prov, nombre, categoria, unidad_compra, unidad_uso, factor, precio) as (values\n" + ",\n".join(filas) + "\n)"
prov = "(select id from public.proveedores where nombre = 'Martín De Ridder' order by creado_en limit 1)"
cuerpo = f"""
alter table public.productos add column if not exists codigo_proveedor text;

{valores},
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
"""
import sys
sys.stdout.write(head + cuerpo)
