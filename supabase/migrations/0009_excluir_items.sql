-- 0009: productos destildados por gerencia en Pedidos → Por proveedor.
-- Quedan guardados en el pedido (se ven igual en el celular y la PC) y no se mandan ni se imprimen.
-- Al marcar el pedido como enviado, la app los saca del pedido. Idempotente (se puede volver a correr).

alter table public.orden_items add column if not exists excluido boolean not null default false;
