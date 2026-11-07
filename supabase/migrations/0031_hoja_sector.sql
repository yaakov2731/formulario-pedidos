-- 0031 · Hoja por sector: el encargado anota en una sola hoja por sector (Barra, Cocina, Cámara, Depósito…) y por día
--   la apertura, lo que entra, lo que devuelve, la merma y el cierre. Los cálculos (consumo, diferencia contra ventas)
--   los ve solo gerencia. En el Shopping se anotan retiros: qué sale del depósito, a dónde va y quién lo retira.
--   * hoja_movs: una fila por cosa anotada. tipo = apertura | cierre (lo contado) | entro (otro = de dónde vino)
--     | devolvi (otro = a dónde fue) | merma | retiro (Shopping: otro = destino).
--   * Apertura y cierre se guardan con hoja_contar(): reemplaza lo contado ese día en ese sector (se puede corregir).
--   * hoja_anotar(): entro, devolvi, merma, retiro. La merma y el retiro también restan del stock del local
--     (movimientos merma / uso_dia). Entrar o devolver entre sectores no cambia el stock total del local.
--   * hoja_borrar(): saca algo anotado por error (el encargado solo en su local y en los últimos 2 días).
--   * destinos: los destinos de los retiros del Shopping. El que se escribe nuevo queda guardado para la próxima.
--   * Idempotente: se puede pegar más de una vez.

create table if not exists public.hoja_movs (
  id          uuid primary key default gen_random_uuid(),
  local_id    uuid not null references public.locales(id) on delete cascade,
  fecha       date not null,
  sector      text not null,
  producto_id uuid not null references public.productos(id) on delete cascade,
  tipo        text not null check (tipo in ('apertura','cierre','entro','devolvi','merma','retiro')),
  cantidad    numeric not null check (cantidad >= 0),
  otro        text,
  quien       text,
  usuario     uuid default auth.uid(),
  creado_en   timestamptz not null default now()
);
create index if not exists hoja_movs_local_idx on public.hoja_movs (local_id, fecha, sector);
alter table public.hoja_movs enable row level security;
drop policy if exists hoja_ger on public.hoja_movs;
create policy hoja_ger on public.hoja_movs for select to authenticated using (public.mi_rol() = 'gerencia');
drop policy if exists hoja_enc on public.hoja_movs;
create policy hoja_enc on public.hoja_movs for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());

create table if not exists public.destinos (
  id        uuid primary key default gen_random_uuid(),
  local_id  uuid not null references public.locales(id) on delete cascade,
  nombre    text not null,
  creado_en timestamptz not null default now(),
  unique (local_id, nombre)
);
alter table public.destinos enable row level security;
drop policy if exists destinos_ger on public.destinos;
create policy destinos_ger on public.destinos for all to authenticated
  using (public.mi_rol() = 'gerencia') with check (public.mi_rol() = 'gerencia');
drop policy if exists destinos_enc on public.destinos;
create policy destinos_enc on public.destinos for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());

grant select on public.hoja_movs to authenticated;
grant select, insert, update, delete on public.destinos to authenticated;

create or replace function public.hoja_permiso(p_local uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.mi_rol() = 'gerencia' or (public.mi_rol() = 'encargado' and public.mi_local() = p_local)) then
    raise exception 'Sin permiso para anotar en este local' using errcode = '42501';
  end if;
end $$;
revoke all on function public.hoja_permiso(uuid) from public, anon;
grant execute on function public.hoja_permiso(uuid) to authenticated;

-- p_items: [{producto_id, cantidad}]. Vacío o null = no contado (se saca si estaba). Devuelve cuántos quedaron contados.
create or replace function public.hoja_contar(p_local uuid, p_sector text, p_fecha date, p_tipo text, p_items jsonb, p_quien text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb; prod public.productos%rowtype; c numeric; n integer := 0; sec text := nullif(btrim(p_sector), '');
begin
  perform public.hoja_permiso(p_local);
  if p_tipo not in ('apertura', 'cierre') then raise exception 'El conteo tiene que ser de apertura o de cierre'; end if;
  if sec is null then raise exception 'Falta el sector'; end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < current_date - 7 then raise exception 'Fecha fuera de rango'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into prod from public.productos where id = (e->>'producto_id')::uuid;
    if not found then raise exception 'Un producto no existe'; end if;
    if prod.local_id <> p_local then raise exception '% es de otro local', prod.nombre; end if;
    delete from public.hoja_movs where local_id = p_local and fecha = p_fecha and sector = sec and producto_id = prod.id and tipo = p_tipo;
    if e->>'cantidad' is null or e->>'cantidad' = '' then continue; end if;
    c := round((e->>'cantidad')::numeric, 3);
    if c < 0 then raise exception 'Lo contado no puede ser negativo'; end if;
    insert into public.hoja_movs(local_id, fecha, sector, producto_id, tipo, cantidad, quien)
    values (p_local, p_fecha, sec, prod.id, p_tipo, c, nullif(btrim(p_quien), ''));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.hoja_contar(uuid, text, date, text, jsonb, text) from public, anon;
grant execute on function public.hoja_contar(uuid, text, date, text, jsonb, text) to authenticated;

-- Devuelve el id de lo anotado.
create or replace function public.hoja_anotar(p_local uuid, p_sector text, p_fecha date, p_producto uuid, p_tipo text,
                                              p_cantidad numeric, p_otro text default null, p_quien text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare prod public.productos%rowtype; hid uuid := gen_random_uuid(); sec text := nullif(btrim(p_sector), '');
        otro text := nullif(btrim(p_otro), ''); quien text := nullif(btrim(p_quien), ''); c numeric := round(p_cantidad, 3);
begin
  perform public.hoja_permiso(p_local);
  if p_tipo not in ('entro', 'devolvi', 'merma', 'retiro') then raise exception 'Tipo de movimiento desconocido'; end if;
  if sec is null then raise exception 'Falta el sector'; end if;
  if c is null or c <= 0 then raise exception 'La cantidad tiene que ser mayor a 0'; end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < current_date - 7 then raise exception 'Fecha fuera de rango'; end if;
  if p_tipo = 'retiro' and otro is null then raise exception 'Falta a dónde va el retiro'; end if;
  select * into prod from public.productos where id = p_producto;
  if not found then raise exception 'El producto no existe'; end if;
  if prod.local_id <> p_local then raise exception '% es de otro local', prod.nombre; end if;
  insert into public.hoja_movs(id, local_id, fecha, sector, producto_id, tipo, cantidad, otro, quien)
  values (hid, p_local, p_fecha, sec, prod.id, p_tipo, c, otro, quien);
  if p_tipo = 'merma' then
    insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
    values (p_local, prod.id, 'merma', -c, 'hoja', hid::text, 'Merma en ' || sec || coalesce(' · ' || quien, ''));
  elsif p_tipo = 'retiro' then
    insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
    values (p_local, prod.id, 'uso_dia', -c, 'hoja', hid::text, 'Retiro → ' || otro || coalesce(' · ' || quien, ''));
    insert into public.destinos(local_id, nombre) values (p_local, otro) on conflict (local_id, nombre) do nothing;
  end if;
  return hid;
end $$;
revoke all on function public.hoja_anotar(uuid, text, date, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.hoja_anotar(uuid, text, date, uuid, text, numeric, text, text) to authenticated;

create or replace function public.hoja_borrar(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare m public.hoja_movs%rowtype;
begin
  select * into m from public.hoja_movs where id = p_id;
  if not found then return; end if;
  perform public.hoja_permiso(m.local_id);
  if public.mi_rol() <> 'gerencia' and m.fecha < current_date - 2 then
    raise exception 'Lo de hace más de 2 días solo lo corrige gerencia' using errcode = '42501';
  end if;
  delete from public.movimientos where ref_tipo = 'hoja' and ref_id = p_id::text;
  delete from public.hoja_movs where id = p_id;
end $$;
revoke all on function public.hoja_borrar(uuid) from public, anon;
grant execute on function public.hoja_borrar(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tienen que salir 2 tablas y 3 funciones.
select 'tabla ' || table_name from information_schema.tables where table_schema = 'public' and table_name in ('hoja_movs', 'destinos')
union all
select 'funcion ' || proname from pg_proc where proname in ('hoja_contar', 'hoja_anotar', 'hoja_borrar');
