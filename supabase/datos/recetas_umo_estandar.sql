-- Recetas estándar de Umo Grill (pesos típicos de parrilla argentina, en crudo y por porción).
-- Son ESTIMADAS: quedan marcadas así hasta que gerencia las revisa y guarda desde Cocina → Recetas.
-- Supuestos de unidades del catálogo: "Papas en bolsa" = bolsa de 2,5 kg (300 g de fritas = 0,12 bolsa;
-- guarnición 200 g = 0,08); Huevos en docenas (1 huevo = 0,0833); "Crema 520 cc" por unidad (200 cc = 0,4);
-- Ají molido en gramos; Cebolla de verdeo por atado (medio atado = 0,5).
-- No llevan receta los platos sin insumos en el catálogo (pan de los sándwiches, limonada, café, postres):
-- el pan se suma a la receta cuando esté en el catálogo.
-- Si un código de Núcleo estaba asociado directo a un insumo crudo (ej. "Asado al Asador" → Asado, 1 kg por venta),
-- pasa a apuntar al plato con su receta: así cada venta descuenta la porción y la guarnición, no 1 kg.
-- Requiere 0007_recetas_estimadas.sql. Se puede correr más de una vez: no pisa recetas ya revisadas.

drop table if exists pg_temp.r;
create temp table r(plato_codigo text, plato_nombre text, insumo_codigo text, cantidad numeric);
insert into r values
  ('ACH-001', 'Chorizo', 'UMO-003', 0.12),
  ('ACH-002', 'Morcilla', 'UMO-004', 0.1),
  ('ACH-003', 'Chinchulín', 'UMO-001', 0.2),
  ('ACH-004', 'Riñón', 'UMO-005', 0.2),
  ('ACH-005', 'Matrimonio', 'UMO-003', 0.12),
  ('ACH-005', 'Matrimonio', 'UMO-004', 0.1),
  ('COC-001', 'Pollo al Verdeo', 'UMO-064', 0.3),
  ('COC-001', 'Pollo al Verdeo', 'UMO-083', 0.4),
  ('COC-001', 'Pollo al Verdeo', 'UMO-121', 0.5),
  ('COC-001', 'Pollo al Verdeo', 'UMO-113', 0.05),
  ('COC-004', 'Bondiola al BBQ', 'UMO-056', 0.3),
  ('COC-004', 'Bondiola al BBQ', 'UMO-030', 0.05),
  ('COC-005', 'Milanesa Clásica', 'UMO-057', 0.25),
  ('COC-005', 'Milanesa Clásica', 'UMO-084', 0.0833),
  ('COC-005', 'Milanesa Clásica', 'UMO-020', 0.06),
  ('COC-005', 'Milanesa Clásica', 'UMO-006', 0.1),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-057', 0.25),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-084', 0.0833),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-020', 0.06),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-006', 0.1),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-013', 0.04),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-087', 0.08),
  ('COC-006', 'Milanesa a la Napolitana', 'UMO-026', 0.05),
  ('ENT-002', 'Provoleta Criolla', 'UMO-088', 0.15),
  ('ENT-002', 'Provoleta Criolla', 'UMO-019', 0.001),
  ('ENT-002', 'Provoleta Criolla', 'UMO-009', 0.5),
  ('ENT-002', 'Provoleta Criolla', 'UMO-008', 0.01),
  ('ENT-003', 'Empanadas Osobuco', 'UMO-101', 1),
  ('ENT-003', 'Empanadas Osobuco', 'UMO-062', 0.08),
  ('ENT-003', 'Empanadas Osobuco', 'UMO-113', 0.03),
  ('GUA-001', 'Papas Fritas', 'UMO-106', 0.12),
  ('GUA-001', 'Papas Fritas', 'UMO-006', 0.03),
  ('GUA-004', 'Rúcula y Parmesano', 'UMO-108', 0.08),
  ('GUA-004', 'Rúcula y Parmesano', 'UMO-089', 0.03),
  ('GUA-004', 'Rúcula y Parmesano', 'UMO-008', 0.01),
  ('GUA-005', 'Zanahoria y Huevos', 'UMO-110', 0.15),
  ('GUA-005', 'Zanahoria y Huevos', 'UMO-084', 0.0833),
  ('GUA-008', 'Puré de Papas', 'UMO-106', 0.1),
  ('GUA-008', 'Puré de Papas', 'UMO-085', 0.05),
  ('GUA-008', 'Puré de Papas', 'UMO-086', 0.02),
  ('GUA-009', 'Ensalada a Elección', 'UMO-102', 0.1),
  ('GUA-009', 'Ensalada a Elección', 'UMO-109', 0.1),
  ('GUA-009', 'Ensalada a Elección', 'UMO-113', 0.05),
  ('PAR-001', 'Parrillada para dos', 'UMO-051', 0.4),
  ('PAR-001', 'Parrillada para dos', 'UMO-065', 0.3),
  ('PAR-001', 'Parrillada para dos', 'UMO-003', 0.24),
  ('PAR-001', 'Parrillada para dos', 'UMO-004', 0.2),
  ('PAR-001', 'Parrillada para dos', 'UMO-001', 0.2),
  ('PAR-001', 'Parrillada para dos', 'UMO-005', 0.15),
  ('PAR-002', 'Asado al Asador', 'UMO-051', 0.5),
  ('PAR-004', 'Bife de Chorizo Mariposa c/G', 'UMO-055', 1),
  ('PAR-004', 'Bife de Chorizo Mariposa c/G', 'UMO-106', 0.08),
  ('PAR-005', 'Entraña c/ Guarnición', 'UMO-060', 0.3),
  ('PAR-005', 'Entraña c/ Guarnición', 'UMO-106', 0.08),
  ('PAR-006', 'Vacío c/ Guarnición', 'UMO-065', 0.4),
  ('PAR-006', 'Vacío c/ Guarnición', 'UMO-106', 0.08),
  ('PAR-007', 'Bondiola c/ Guarnición', 'UMO-056', 0.3),
  ('PAR-007', 'Bondiola c/ Guarnición', 'UMO-106', 0.08),
  ('PAR-008', 'Pata y Muslo c/ Guarnición', 'UMO-063', 0.45),
  ('PAR-008', 'Pata y Muslo c/ Guarnición', 'UMO-106', 0.08),
  ('PAR-009', 'Matambre a la Pizza', 'UMO-061', 0.35),
  ('PAR-009', 'Matambre a la Pizza', 'UMO-087', 0.08),
  ('PAR-009', 'Matambre a la Pizza', 'UMO-026', 0.05),
  ('PAR-009', 'Matambre a la Pizza', 'UMO-019', 0.001),
  ('SAN-001', 'Sándwich de Vacío', 'UMO-065', 0.2),
  ('SAN-001', 'Sándwich de Vacío', 'UMO-010', 0.02),
  ('SAN-002', 'Sándwich de Bondiola', 'UMO-056', 0.2),
  ('SAN-002', 'Sándwich de Bondiola', 'UMO-010', 0.02),
  ('SAN-003', 'Sándwich de Choripán', 'UMO-003', 0.12),
  ('SAN-003', 'Sándwich de Choripán', 'UMO-010', 0.02),
  ('SAN-004', 'Sándwich de Milanesa', 'UMO-057', 0.2),
  ('SAN-004', 'Sándwich de Milanesa', 'UMO-084', 0.0833),
  ('SAN-004', 'Sándwich de Milanesa', 'UMO-020', 0.05),
  ('SAN-004', 'Sándwich de Milanesa', 'UMO-006', 0.08),
  ('SAN-004', 'Sándwich de Milanesa', 'UMO-102', 0.03),
  ('SAN-004', 'Sándwich de Milanesa', 'UMO-109', 0.05);

-- 1) Plato de la carta para cada código (si no hay uno ya).
insert into public.productos(codigo, nombre, local_id, categoria, unidad_uso, es_elaborado, activo)
select distinct 'PLA-' || r.plato_codigo, r.plato_nombre, l.id, 'Carta', 'porción', true, true
from r join public.locales l on l.codigo = 'UMO'
where not exists (select 1 from public.producto_alias a join public.productos p on p.id = a.producto_id
                  where a.origen = 'nucleo' and a.local_id = l.id and public.norm(a.alias) = public.norm(r.plato_codigo) and p.es_elaborado)
  and not exists (select 1 from public.productos p where p.codigo = 'PLA-' || r.plato_codigo);

-- 2) El código de Núcleo apunta al plato (reemplaza la asociación directa a un insumo crudo).
update public.producto_alias a set producto_id = p.id, cantidad_por_venta = 1
from public.productos p, public.locales l
where l.codigo = 'UMO' and a.origen = 'nucleo' and a.local_id = l.id
  and p.codigo = 'PLA-' || a.alias and p.local_id = l.id
  and a.alias in (select plato_codigo from r)
  and not exists (select 1 from public.productos x where x.id = a.producto_id and x.es_elaborado);
insert into public.producto_alias(producto_id, alias, origen, local_id)
select p.id, substr(p.codigo, 5), 'nucleo', l.id
from public.productos p join public.locales l on l.codigo = 'UMO' and p.local_id = l.id
where p.codigo in (select distinct 'PLA-' || plato_codigo from r)
  and not exists (select 1 from public.producto_alias a where a.origen = 'nucleo' and a.local_id = l.id and public.norm(a.alias) = public.norm(substr(p.codigo, 5)));

-- 3) Recetas estimadas (solo si el plato todavía no tiene una).
insert into public.recetas(producto_id, rinde, notas, estimada)
select distinct a.producto_id, 1, 'Receta estándar estimada: revisá los pesos', true
from r
join public.locales l on l.codigo = 'UMO'
join public.producto_alias a on a.origen = 'nucleo' and a.local_id = l.id and public.norm(a.alias) = public.norm(r.plato_codigo)
join public.productos p on p.id = a.producto_id and p.es_elaborado
on conflict (producto_id) do nothing;

-- 4) Insumos de cada receta estimada (sin repetir).
insert into public.receta_items(receta_id, insumo_id, cantidad)
select re.id, ins.id, sum(r.cantidad)
from r
join public.locales l on l.codigo = 'UMO'
join public.producto_alias a on a.origen = 'nucleo' and a.local_id = l.id and public.norm(a.alias) = public.norm(r.plato_codigo)
join public.recetas re on re.producto_id = a.producto_id and re.estimada
join public.productos ins on ins.codigo = r.insumo_codigo and ins.local_id = l.id
group by re.id, ins.id
on conflict (receta_id, insumo_id) do nothing;

select count(*) filter (where estimada) as recetas_estimadas from public.recetas;
