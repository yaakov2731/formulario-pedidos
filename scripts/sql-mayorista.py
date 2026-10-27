# Genera supabase/datos/distri_stock_mayorista.sql a partir de la lista del mayorista (Excel).
# Uso: python3 -I scripts/sql-mayorista.py "LISTA MAYORISTA 2026.xlsx" > supabase/datos/distri_stock_mayorista.sql
# Lo pintado en amarillo queda a la vista en Pedir; el resto entra oculto (solo aparece al buscar).
import sys, re, openpyxl

PROV = 'Distri Stock Mayorista'
LOCALES = ['UMO', 'TRE', 'BRK', 'GEL', 'SHP']
# Categorías del mayorista → grupos de la app.
GRUPOS = {
  'Bolsas y rollos de arranque': ['ROLLOS ARRANQUE', 'BOLSAS DE POLIPROPILENO', 'BOLSAS CAMISETAS', 'BOLSAS KP', 'BOLSAS KRAFT', 'BOLSAS RIÑON', 'BOLSAS CRISTAL', 'POLIPAPEL'],
  'Bolsas de residuos': ['RESIDUO CONSORCIO'],
  'Bandejas': ['BANDEJAS DE CARTON', 'BANDEJAS DE ALUMINIO', 'BANDEJAS DORADAS', 'BANDEJAS EXPANDIDO', 'BANDEJAS MICROONDAS', 'BANDEJAS KOVAL', 'BANDEJAS SATINADAS', 'BANDEJAS AIR FRYER'],
  'Cajas y envases': ['CAJAS DELIVERY', 'POTES PLASTICOS', 'CAJAS DE BOMBONES', 'CAJA NAVIDEÑA', 'PORTAPANCHOS Y CUCURUCHOS', 'HELADO', 'PLATOS DESCARTABLES', 'CORRUGADO Y BURBUJA'],
  'Film, aluminio y papeles': ['FILM PVC ALUMINIO', 'STRETCH', 'PAPEL', 'FOLEX', 'BLONDAS', 'MOLDES DE PAPEL', 'PIROTINES'],
  'Servilletas y rollos de papel': ['ROLLOS COCINA E HIGIENICO', 'SERVILLETAS', 'TOALLAS'],
  'Vasos, cubiertos y sorbetes': ['VASOS', 'VASOS TERMICOS', 'CUBIERTOS', 'SORBETES', 'ESCARBADIENTES'],
  'Limpieza': ['LIMPIEZA', 'GUANTES', 'FRAGANCIAS'],
  'Rollos térmicos y etiquetas': ['ROLLOS TERMICOS', 'ROLLOS REGISTRADORA', 'ETIQUETADORAS ROLLOS MOTEX', 'TALONARIOS Y NUMEROS'],
  'Librería y varios': ['LIBRERIA', 'CINTAS', 'CARTELES FLUOR Y DIGITOS', 'DISPENSER, PORTA BOBINA, HILO, CINTA', 'HILOS', 'MOÑOS Y LAZOS', 'TIRAS Y DISCOS', 'TRIPODE', 'VARIOS'],
}
CAT = {c: g for g, cs in GRUPOS.items() for c in cs}
# A la vista por local: el shopping solo ve limpieza y bolsas de residuos; los potes de helado, solo Puerto Gelato.
SOLO_SHP = ['Limpieza', 'Bolsas de residuos', 'Servilletas y rollos de papel']

def q(s): return "'" + str(s).replace("'", "''") + "'"
def nombre(s):
  s = re.sub(r'\s+', ' ', str(s).replace('§', '°')).strip().lower()
  return s[:1].upper() + s[1:]
def unidad(s):
  u = str(s).upper()
  if re.search(r'X\s*5\s*LITROS', u): return 'bidón 5 l'
  if re.search(r'X\s*(KG|KILO)', u): return 'kg'
  if re.search(r'X\s*1\s*U\b|\b1\s*U\b|X\s*UNIDAD|X\s*1\s*UNIDAD', u): return 'unidad'
  if re.search(r'X\s*\d+\s*(U\b|U\.|UN|UNID)|\bCAJA\b|PAQ|PACK|X\s*\d+\s*(ROLLOS|PAQUETES|BOLSAS|PAÑOS)', u): return 'paquete'
  if re.search(r'\bBULTO\b', u): return 'bulto'
  return 'unidad'
def codigo(v):
  if isinstance(v, float) and v.is_integer(): v = int(v)
  return str(v).strip()

ws = openpyxl.load_workbook(sys.argv[1]).active
filas, vistos = [], set()
for r in range(1, ws.max_row + 1):
  cod, art, precio, cat = (ws.cell(r, c).value for c in range(1, 5))
  if not cod or not art or cod == 'CODIGO' or precio is None: continue
  c = codigo(cod)
  if c.upper() in vistos: c = c + '-B'
  vistos.add(c.upper())
  # Amarillo en cualquier celda de la fila (código, artículo, precio, categoría o al costado).
  amarillo = any(ws.cell(r, k).fill.fill_type == 'solid' and str(ws.cell(r, k).fill.fgColor.rgb) == 'FFFFFF00' for k in range(1, ws.max_column + 1))
  g = CAT.get(str(cat).strip().upper(), 'Librería y varios')
  filas.append((c, nombre(art), g, unidad(art), round(float(precio), 2), amarillo, str(cat).strip().upper()))

print(f"""-- Distri Stock Mayorista: lista 2026 completa ({len(filas)} artículos) en {', '.join(LOCALES)}.
-- Generado con scripts/sql-mayorista.py. Necesita 0012_productos_oculto.sql.
-- A la vista en Pedir: lo pintado en amarillo en la lista ({sum(f[5] for f in filas)} artículos). El shopping solo ve {', '.join(SOLO_SHP).lower()};
-- los potes de helado, solo Puerto Gelato. El resto entra oculto: aparece solo al buscarlo.
-- Precio de lista (sin IVA, en efectivo) como costo actual. Código: LOCAL-DS-código del mayorista.
-- Idempotente: si el producto ya existe no se toca (ni su precio ni si está oculto).

insert into public.proveedores (nombre, notas)
select {q(PROV)}, 'Lista mayorista 2026. Precios sin IVA, en efectivo, sujetos a cambio diario. Sucursales: Troncos del Talar (Av. Alfredo Palacios 1289) y Carupá, Tigre (Almirante Brown 547). Lun. a vie. 8 a 17, sáb. 8 a 13.'
where not exists (select 1 from public.proveedores where lower(nombre) = lower({q(PROV)}));

with lista(cod, nombre, categoria, unidad, precio, amarillo, cat_mayorista) as (values""")
print(',\n'.join(f"  ({q(c)}, {q(n)}, {q(g)}, {q(u)}, {p}, {'true' if a else 'false'}, {q(cm)})" for c, n, g, u, p, a, cm in filas))
print(f"""),
loc as (select id, codigo from public.locales where codigo in ({', '.join(q(l) for l in LOCALES)})),
prov as (select id from public.proveedores where lower(nombre) = lower({q(PROV)}) order by creado_en limit 1),
nuevos as (
  insert into public.productos (codigo, nombre, local_id, categoria, unidad_compra, unidad_uso, factor_conversion, proveedor_id, oculto)
  select loc.codigo || '-DS-' || lista.cod, lista.nombre, loc.id, lista.categoria, lista.unidad, lista.unidad, 1, prov.id,
         not (lista.amarillo
              and (loc.codigo <> 'SHP' or lista.categoria in ({', '.join(q(x) for x in SOLO_SHP)}))
              and (lista.cat_mayorista <> 'HELADO' or loc.codigo = 'GEL'))
  from lista cross join loc cross join prov
  on conflict (codigo) do nothing
  returning id, codigo, proveedor_id
)
insert into public.precios (producto_id, proveedor_id, precio, origen)
select n.id, n.proveedor_id, lista.precio, 'proveedor'
from nuevos n join lista on n.codigo like '%-DS-' || lista.cod and length(n.codigo) = length(lista.cod) + 7;

-- Control: cuántos quedaron por local y cuántos a la vista.
select l.nombre, count(*) as productos, count(*) filter (where not p.oculto) as a_la_vista
from public.productos p join public.locales l on l.id = p.local_id
where p.codigo like '%-DS-%' group by l.nombre order by l.nombre;""")
