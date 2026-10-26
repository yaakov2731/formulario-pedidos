-- 0010: tablero de notas del equipo.
-- Cocineros y empleados de cada local dejan notas para gerencia (el encargado general) o para sus compañeros.
-- Gerencia ve las de todos los locales y puede dejar notas para un local o para todos (local_id null).
-- Cada nota puede fijarse, marcarse como resuelta y tener respuestas.
-- Idempotente (se puede volver a correr). Sin tablas temporales: el SQL Editor autocommitea cada sentencia.

create table if not exists public.notas (
  id           uuid primary key default gen_random_uuid(),
  local_id     uuid references public.locales(id) on delete cascade,     -- null = de gerencia para todos los locales
  para         text not null default 'gerencia' check (para in ('gerencia', 'equipo')),
  titulo       text not null check (char_length(titulo) between 1 and 120),
  texto        text not null default '' check (char_length(texto) <= 2000),
  color        text not null default 'amarillo' check (color in ('amarillo', 'naranja', 'azul', 'verde', 'rosa')),
  etiquetas    text[] not null default '{}',
  autor_id     uuid default auth.uid(),
  autor_nombre text not null default '',
  autor_rol    text not null default 'encargado' check (autor_rol in ('encargado', 'gerencia')),
  fijada       boolean not null default false,
  resuelta_en  timestamptz,
  resuelta_por text,
  leida_en     timestamptz,                                              -- cuándo la abrió gerencia
  creado_en    timestamptz not null default now()
);
create index if not exists notas_local_fecha on public.notas (local_id, creado_en desc);

create table if not exists public.nota_respuestas (
  id           uuid primary key default gen_random_uuid(),
  nota_id      uuid not null references public.notas(id) on delete cascade,
  texto        text not null check (char_length(texto) between 1 and 1000),
  autor_id     uuid default auth.uid(),
  autor_nombre text not null default '',
  autor_rol    text not null default 'encargado' check (autor_rol in ('encargado', 'gerencia')),
  creado_en    timestamptz not null default now()
);
create index if not exists nota_respuestas_nota on public.nota_respuestas (nota_id, creado_en);

alter table public.notas enable row level security;
alter table public.nota_respuestas enable row level security;

-- Gerencia: todo.
drop policy if exists gerencia_todo on public.notas;
create policy gerencia_todo on public.notas for all to authenticated
  using (public.mi_rol() = 'gerencia') with check (public.mi_rol() = 'gerencia');
drop policy if exists gerencia_todo on public.nota_respuestas;
create policy gerencia_todo on public.nota_respuestas for all to authenticated
  using (public.mi_rol() = 'gerencia') with check (public.mi_rol() = 'gerencia');

-- Encargado (el celular del local): ve las de su local y las de gerencia para todos; escribe solo en su local.
drop policy if exists notas_enc_sel on public.notas;
create policy notas_enc_sel on public.notas for select to authenticated
  using (public.mi_rol() = 'encargado' and (local_id = public.mi_local() or local_id is null));
drop policy if exists notas_enc_ins on public.notas;
create policy notas_enc_ins on public.notas for insert to authenticated
  with check (public.mi_rol() = 'encargado' and local_id = public.mi_local() and autor_rol = 'encargado');
drop policy if exists notas_enc_upd on public.notas;
create policy notas_enc_upd on public.notas for update to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local())
  with check (public.mi_rol() = 'encargado' and local_id = public.mi_local());
drop policy if exists notas_enc_del on public.notas;
create policy notas_enc_del on public.notas for delete to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local() and autor_rol = 'encargado');

drop policy if exists notas_resp_enc_sel on public.nota_respuestas;
create policy notas_resp_enc_sel on public.nota_respuestas for select to authenticated
  using (public.mi_rol() = 'encargado' and exists (select 1 from public.notas n where n.id = nota_id));
drop policy if exists notas_resp_enc_ins on public.nota_respuestas;
create policy notas_resp_enc_ins on public.nota_respuestas for insert to authenticated
  with check (public.mi_rol() = 'encargado' and autor_rol = 'encargado' and exists (select 1 from public.notas n where n.id = nota_id));

-- El local solo puede fijar o resolver: autor, local, fecha y lectura de gerencia no se tocan.
create or replace function public.notas_proteger()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(public.mi_rol(), '') <> 'gerencia' then
    new.local_id := old.local_id; new.autor_id := old.autor_id; new.autor_nombre := old.autor_nombre;
    new.autor_rol := old.autor_rol; new.creado_en := old.creado_en; new.leida_en := old.leida_en;
    if old.autor_rol = 'gerencia' then
      new.titulo := old.titulo; new.texto := old.texto; new.para := old.para; new.color := old.color; new.etiquetas := old.etiquetas;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notas_proteger on public.notas;
create trigger notas_proteger before update on public.notas for each row execute function public.notas_proteger();

-- Aviso por Telegram a gerencia: notas del local para gerencia o con #urgente.
-- Usa los mismos secretos de Vault que el aviso de pedidos (telegram_token, telegram_chat_id); sin ellos no hace nada.
create or replace function public.avisar_nota_telegram()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_token text; v_chat text; v_texto text; v_local text;
begin
  if new.autor_rol <> 'encargado' or not (new.para = 'gerencia' or 'urgente' = any(new.etiquetas)) then
    return null;
  end if;
  begin
    if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
      return null;
    end if;
    execute $q$select max(decrypted_secret) filter (where name = 'telegram_token'),
                      max(decrypted_secret) filter (where name = 'telegram_chat_id')
               from vault.decrypted_secrets where name in ('telegram_token', 'telegram_chat_id')$q$
      into v_token, v_chat;
    if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then
      return null;
    end if;
    select nombre into v_local from public.locales where id = new.local_id;
    v_texto := format(E'%s Nota · %s\nDe: %s\n\n%s%s%s',
      case when 'urgente' = any(new.etiquetas) then '🚨' else '📝' end,
      coalesce(v_local, '—'),
      coalesce(nullif(new.autor_nombre, ''), '—'),
      new.titulo,
      case when new.texto <> '' then E'\n' || new.texto else '' end,
      case when cardinality(new.etiquetas) > 0 then E'\n\n#' || array_to_string(new.etiquetas, ' #') else '' end);
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using 'https://api.telegram.org/bot' || v_token || '/sendMessage',
            jsonb_build_object('chat_id', v_chat, 'text', left(v_texto, 4000)),
            '{"Content-Type": "application/json"}'::jsonb;
  exception when others then
    raise warning 'aviso Telegram de nota: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.avisar_nota_telegram() from public, anon, authenticated;

drop trigger if exists notas_aviso_telegram on public.notas;
create trigger notas_aviso_telegram after insert on public.notas for each row execute function public.avisar_nota_telegram();
