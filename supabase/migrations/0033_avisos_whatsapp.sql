-- 0033 · Avisos por WhatsApp (para Ara u otro asistente externo).
-- Se puede pegar dos veces. No borra nada.
-- 1) locales.avisos_whatsapp: números de WhatsApp a los que se avisa (encargados del local), solo dígitos con código de país.
-- 2) avisos_token: una clave secreta (una sola fila). Sin políticas: nadie la lee por la API salvo con las funciones de abajo.
-- 3) cierres_pendientes(p_token, p_fecha): qué locales abrieron y todavía no cerraron, con sus WhatsApp. La llama Ara sin usuario,
--    solo con la clave pública de la app (apikey) y el token secreto.
-- 4) aviso_token() / aviso_token_nuevo(): gerencia ve o cambia el token desde Más → Ajustes.

alter table public.locales add column if not exists avisos_whatsapp text[] not null default '{}';

create table if not exists public.avisos_token (
  id     boolean primary key default true check (id),
  token  text not null,
  creado timestamptz not null default now()
);
alter table public.avisos_token enable row level security;
revoke all on public.avisos_token from anon, authenticated;
insert into public.avisos_token(id, token)
values (true, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

create or replace function public.cierres_pendientes(p_token text, p_fecha date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ahora timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  f date := coalesce(p_fecha, (ahora - interval '6 hours')::date);
  dow smallint := extract(dow from f)::smallint;
  link text := 'https://yaakov2731.github.io/formulario-pedidos/stock/#/hoja';
  faltan jsonb; cerraron jsonb; no_abria jsonb;
begin
  if p_token is null or not exists (select 1 from public.avisos_token where token = p_token) then
    raise exception 'Token inválido' using errcode = '42501';
  end if;
  with ls as (
    select l.id, l.codigo, l.nombre, l.encargados, l.avisos_whatsapp,
           (dow = any(l.dias_abre)) as toca,
           exists (select 1 from public.hoja_movs h where h.local_id = l.id and h.fecha = f and h.tipo = 'apertura') as abrio,
           (select max(h.creado_en) from public.hoja_movs h where h.local_id = l.id and h.fecha = f and h.tipo = 'cierre') as cerro
    from public.locales l
    where l.activo and l.codigo <> 'SHP'
      and exists (select 1 from public.productos p where p.local_id = l.id)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'local', nombre, 'encargados', to_jsonb(encargados),
      'whatsapp', to_jsonb(avisos_whatsapp), 'hizo_apertura', abrio, 'link', link) order by nombre)
      filter (where cerro is null and (toca or abrio)), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'local', nombre,
      'hora', to_char(cerro at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI')) order by nombre)
      filter (where cerro is not null), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'local', nombre) order by nombre)
      filter (where cerro is null and not toca and not abrio), '[]'::jsonb)
  into faltan, cerraron, no_abria
  from ls;
  return jsonb_build_object('fecha', f, 'hora_ar', to_char(ahora, 'YYYY-MM-DD HH24:MI'),
    'faltan', faltan, 'cerraron', cerraron, 'no_abria', no_abria,
    'nota', 'Los feriados no están en la base: un feriado que no cae en los días que abre solo cuenta si hicieron apertura.');
end $$;
revoke all on function public.cierres_pendientes(text, date) from public;
grant execute on function public.cierres_pendientes(text, date) to anon, authenticated;

create or replace function public.aviso_token()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_rol() is distinct from 'gerencia' then raise exception 'Solo gerencia' using errcode = '42501'; end if;
  return (select token from public.avisos_token where id);
end $$;
revoke all on function public.aviso_token() from public, anon;
grant execute on function public.aviso_token() to authenticated;

create or replace function public.aviso_token_nuevo()
returns text language plpgsql volatile security definer set search_path = public as $$
declare t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if public.mi_rol() is distinct from 'gerencia' then raise exception 'Solo gerencia' using errcode = '42501'; end if;
  insert into public.avisos_token(id, token, creado) values (true, t, now())
  on conflict (id) do update set token = excluded.token, creado = excluded.creado;
  return t;
end $$;
revoke all on function public.aviso_token_nuevo() from public, anon;
grant execute on function public.aviso_token_nuevo() to authenticated;

notify pgrst, 'reload schema';
