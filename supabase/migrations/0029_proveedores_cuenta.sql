-- 0029 · Datos bancarios completos del proveedor: además del alias (alias_cbu) y el banco, el CBU y el número de cuenta.
--   Se ven y se editan en Catálogo → Proveedores → Para los pagos. Solo gerencia y contadora leen proveedores (0001).
--   Idempotente: se puede pegar más de una vez.

alter table public.proveedores add column if not exists cbu           text;
alter table public.proveedores add column if not exists numero_cuenta text;

-- Martín De Ridder factura como CLAMER SRL (datos que pasó Jacobo el 2026-11-06).
update public.proveedores
   set razon_social = 'CLAMER SRL', cuit = '30-64298698-4', alias_cbu = 'ALFAJOR.TORTA',
       cbu = '0150521402000104571417', numero_cuenta = '0521/02104571/41', banco = 'ICBC'
 where nombre = 'Martín De Ridder';

notify pgrst, 'reload schema';
