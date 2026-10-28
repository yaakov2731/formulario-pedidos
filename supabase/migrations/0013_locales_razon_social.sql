-- Razón social y CUIT de cada local: salen en las órdenes que se mandan a los proveedores
-- (el Shopping compra como SPMAR S.A.; los locales de gastronomía como SUMA ACTIVA S.A.).
alter table public.locales add column if not exists razon_social text;
alter table public.locales add column if not exists cuit text;

update public.locales set razon_social = 'SPMAR S.A.' where codigo = 'SHP' and razon_social is null;
update public.locales set razon_social = 'SUMA ACTIVA S.A.' where codigo in ('UMO', 'TRE', 'BRK', 'GEL') and razon_social is null;

notify pgrst, 'reload schema';
