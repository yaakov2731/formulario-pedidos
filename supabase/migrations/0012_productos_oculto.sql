-- 0012: productos ocultos en Pedir.
-- Un producto oculto no aparece en la lista de Pedir (ni en sus categorías): solo sale al buscarlo por nombre o código,
-- o si ya está en el pedido. Sirve para cargar la lista completa de un mayorista y dejar a la vista solo lo que se usa.
-- Gerencia lo cambia en Catálogo → Editar producto ("Oculto en Pedir"). En Stock se listan solo si tienen stock.
-- Idempotente (se puede volver a correr).

alter table public.productos add column if not exists oculto boolean not null default false;

-- Que la app vea la columna nueva enseguida.
notify pgrst, 'reload schema';
