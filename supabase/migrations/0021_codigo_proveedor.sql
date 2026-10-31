-- 0021_codigo_proveedor.sql · Código del artículo en la lista del proveedor (ej. De Ridder "16.12" = alfajor de chocolate x12).
-- Sale en el pedido al proveedor (mensaje, imagen e impresión) y ayuda a reconocer los renglones al recibir con factura.
-- Los productos del mayorista de limpieza lo siguen sacando de su código LOCAL-DS-<código>.
-- Se puede correr más de una vez.
alter table public.productos add column if not exists codigo_proveedor text;
