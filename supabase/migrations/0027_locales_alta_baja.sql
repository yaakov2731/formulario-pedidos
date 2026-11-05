-- 0027 · Locales: agregar uno nuevo y conectar el usuario de su encargado (Catálogo → Locales).
--   * crear_local(): gerencia da de alta un local (nombre, código, razón social, CUIT).
--   * vincular_encargado(): si en Supabase → Authentication ya existe el usuario local-<código>@docks-stock.app,
--     lo deja como encargado de ese local (así aparece en Entrar). crear_local lo intenta solo.
--   * Dar de baja no borra nada: locales.activo = false (lo hace la app). Pedidos, conteos, facturas y ventas quedan.
--   * Idempotente: se puede pegar más de una vez.

create or replace function public.vincular_encargado(p_local uuid)
returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare l public.locales%rowtype; uid uuid;
begin
  if public.mi_rol() <> 'gerencia' then raise exception 'Solo gerencia maneja los locales' using errcode = '42501'; end if;
  select * into l from public.locales where id = p_local;
  if not found then raise exception 'Ese local no existe'; end if;
  select u.id into uid from auth.users u where lower(u.email) = 'local-' || lower(l.codigo) || '@docks-stock.app' limit 1;
  if uid is null then return false; end if;
  insert into public.perfiles (id, nombre, rol, local_id) values (uid, l.nombre, 'encargado', l.id)
  on conflict (id) do update set rol = 'encargado', local_id = excluded.local_id;
  return true;
end $$;

create or replace function public.crear_local(p_nombre text, p_codigo text, p_razon text default null, p_cuit text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare nom text := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
        cod text := upper(btrim(coalesce(p_codigo, ''))); nid uuid;
begin
  if public.mi_rol() <> 'gerencia' then raise exception 'Solo gerencia maneja los locales' using errcode = '42501'; end if;
  if nom is null then raise exception 'Poné el nombre del local'; end if;
  if cod !~ '^[A-Z0-9]{2,5}$' then raise exception 'El código va de 2 a 5 letras o números, sin espacios (ej.: UMO)'; end if;
  if exists (select 1 from public.locales where upper(codigo) = cod) then raise exception 'Ya hay un local con el código %', cod; end if;
  if exists (select 1 from public.locales where lower(nombre) = lower(nom)) then raise exception 'Ya hay un local llamado %', nom; end if;
  insert into public.locales (codigo, nombre, razon_social, cuit)
  values (cod, nom, nullif(btrim(coalesce(p_razon, '')), ''), nullif(btrim(coalesce(p_cuit, '')), ''))
  returning id into nid;
  perform public.vincular_encargado(nid);
  return nid;
end $$;

revoke all on function public.vincular_encargado(uuid) from public, anon;
grant execute on function public.vincular_encargado(uuid) to authenticated;
revoke all on function public.crear_local(text, text, text, text) from public, anon;
grant execute on function public.crear_local(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tienen que salir las 2 funciones.
select 'funcion ' || proname from pg_proc where proname in ('crear_local', 'vincular_encargado');
