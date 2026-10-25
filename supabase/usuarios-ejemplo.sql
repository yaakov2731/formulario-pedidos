-- Perfiles de la app stock. Antes crear el usuario en Supabase → Authentication → Add user (Auto confirm).
-- Cambiar solo los valores de "params". Sin contraseñas: se cargan en Authentication.

-- Encargado de un local (email local-<codigo>@docks-stock.app):
with params as (select 'local-umo@docks-stock.app'::text as email, 'UMO'::text as codigo_local, 'Local Umo'::text as nombre)
insert into public.perfiles (id, nombre, rol, local_id)
select u.id, p.nombre, 'encargado', l.id
from params p
join auth.users u on lower(u.email) = lower(p.email)
join public.locales l on l.codigo = p.codigo_local
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, local_id = excluded.local_id;

-- Administrador (gerencia, sin local):
with params as (select 'jacobo@ejemplo.com'::text as email, 'Jacobo'::text as nombre)
insert into public.perfiles (id, nombre, rol, local_id)
select u.id, p.nombre, 'gerencia', null
from params p
join auth.users u on lower(u.email) = lower(p.email)
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, local_id = null;
