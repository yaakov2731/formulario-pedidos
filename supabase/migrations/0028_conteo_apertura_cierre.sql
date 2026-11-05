-- 0028 · Conteo de apertura y de cierre: al contar, el encargado marca si es el conteo del primer día de servicio
--   (apertura) o del último (cierre). Con los dos, gerencia ve en Stock → Control lo que se usó en la semana por lugar:
--   había (apertura) + entró − quedó (cierre) = se usó, comparado con lo anotado (ventas por receta, elaborados, merma)
--   y con lo que el local pide después del cierre.
--   * conteos.tipo: 'apertura', 'cierre' o vacío (conteos viejos o sueltos).
--   * contar_local(): suma p_tipo (opcional). Reemplaza a la versión de 3 parámetros (misma lógica).
--   * marcar_conteo(): gerencia corrige si un conteo es de apertura o de cierre (o lo deja sin marcar).
--   * Idempotente: se puede pegar más de una vez.

alter table public.conteos add column if not exists tipo text;
alter table public.conteos drop constraint if exists conteos_tipo_chk;
alter table public.conteos add constraint conteos_tipo_chk check (tipo is null or tipo in ('apertura', 'cierre'));
create index if not exists conteos_tipo_idx on public.conteos (local_id, tipo, creado_en desc);

drop function if exists public.contar_local(uuid, jsonb, text);

-- p_items: [{producto_id, contado}] en unidad de uso. p_tipo: 'apertura' | 'cierre' | null. Devuelve el id del conteo.
create or replace function public.contar_local(p_local uuid, p_items jsonb, p_encargado text default null, p_tipo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare e jsonb; prod public.productos%rowtype; c numeric; sis numeric; dif numeric; cid uuid := gen_random_uuid();
        limpio jsonb := '[]'::jsonb; quien text := nullif(btrim(p_encargado), ''); tp text := nullif(btrim(lower(p_tipo)), '');
begin
  if not (public.mi_rol() = 'gerencia' or (public.mi_rol() = 'encargado' and public.mi_local() = p_local)) then
    raise exception 'Sin permiso para contar en este local' using errcode = '42501';
  end if;
  if tp is not null and tp not in ('apertura', 'cierre') then raise exception 'El conteo es de apertura o de cierre'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if e->>'contado' is null or e->>'contado' = '' then continue; end if;
    c := round((e->>'contado')::numeric, 3);
    if c < 0 then raise exception 'Lo contado no puede ser negativo'; end if;
    select * into prod from public.productos where id = (e->>'producto_id')::uuid;
    if not found then raise exception 'Un producto no existe'; end if;
    if prod.local_id <> p_local then raise exception '% es de otro local', prod.nombre; end if;
    if prod.categoria = 'Carta' then continue; end if;
    select coalesce(sum(cantidad), 0) into sis from public.movimientos where local_id = p_local and producto_id = prod.id;
    dif := c - sis;
    if dif <> 0 then
      insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
      values (p_local, prod.id, 'ajuste_conteo', dif, 'conteo', cid::text,
              'Conteo' || coalesce(' de ' || tp, '') || coalesce(' de ' || quien, '') || ': ' || c || ' (sistema ' || sis || ')');
    end if;
    limpio := limpio || jsonb_build_object('producto_id', prod.id, 'contado', c, 'sistema', sis, 'dif', dif);
  end loop;
  if jsonb_array_length(limpio) = 0 then raise exception 'Anotá al menos un producto contado'; end if;
  insert into public.conteos(id, local_id, encargado, items, tipo) values (cid, p_local, quien, limpio, tp);
  return cid;
end $$;

revoke execute on function public.contar_local(uuid, jsonb, text, text) from public, anon;
grant execute on function public.contar_local(uuid, jsonb, text, text) to authenticated;

-- Gerencia corrige el tipo de un conteo. p_tipo vacío = sin marcar.
create or replace function public.marcar_conteo(p_conteo uuid, p_tipo text)
returns text
language plpgsql security definer set search_path = public as $$
declare tp text := nullif(btrim(lower(p_tipo)), '');
begin
  if public.mi_rol() <> 'gerencia' then
    raise exception 'Solo gerencia cambia el tipo de un conteo' using errcode = '42501';
  end if;
  if tp is not null and tp not in ('apertura', 'cierre') then raise exception 'El conteo es de apertura o de cierre'; end if;
  update public.conteos set tipo = tp where id = p_conteo;
  if not found then raise exception 'Ese conteo ya no existe'; end if;
  return tp;
end $$;

revoke all on function public.marcar_conteo(uuid, text) from public, anon;
grant execute on function public.marcar_conteo(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tienen que salir la columna tipo y las dos funciones (contar_local con 4 parámetros).
select 'columna ' || column_name from information_schema.columns where table_schema = 'public' and table_name = 'conteos' and column_name = 'tipo'
union all
select 'funcion ' || p.proname || ' (' || p.pronargs || ' parámetros)' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('contar_local', 'marcar_conteo');
