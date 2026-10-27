-- 0011: datos completos de cada proveedor, para dar de alta proveedores nuevos desde la app (gerencia).
--  * Pedidos: contacto, teléfono y email (además de WhatsApp, días de entrega, corte y mínimo, que ya existían).
--  * Pagos: WhatsApp y email de cobranzas (si quedan vacíos se usan los de pedidos), razón social y banco
--    (además de CUIT y alias/CBU, que ya existían).
-- Gerencia ya puede crear y editar proveedores (política gerencia_todo de 0001); la contadora solo los lee.
-- Idempotente (se puede volver a correr). Sin tablas temporales: el SQL Editor autocommitea cada sentencia.

alter table public.proveedores add column if not exists razon_social   text;
alter table public.proveedores add column if not exists contacto       text;
alter table public.proveedores add column if not exists telefono       text;
alter table public.proveedores add column if not exists email          text;
alter table public.proveedores add column if not exists whatsapp_pagos text;
alter table public.proveedores add column if not exists email_pagos    text;
alter table public.proveedores add column if not exists banco          text;

-- Que la app vea las columnas nuevas enseguida.
notify pgrst, 'reload schema';
