-- 0005: la pantalla Entrar solo lista los locales que tienen un encargado con usuario.
-- Depósito y Eventos no tienen usuario: si aparecían, el PIN fallaba siempre.
create or replace function public.locales_login()
returns table (codigo text, nombre text, encargados text[])
language sql stable security definer set search_path = public as $$
  select l.codigo, l.nombre, l.encargados from public.locales l
  where l.activo and exists (select 1 from public.perfiles p where p.local_id = l.id and p.rol = 'encargado')
  order by l.nombre
$$;
