-- 0024 · Contar: el encargado de cada local cuenta lo que queda y el stock pasa a ser lo contado.
--   * conteos: una fila por conteo (local, quién contó, cuándo y por producto: contado, lo que decía el sistema y la diferencia).
--   * contar_local(): guarda el conteo y, por cada producto contado, un movimiento ajuste_conteo con la diferencia.
--     Desde ahí el stock sigue: último conteo + lo que entra (recepciones) − lo que sale (ventas por receta, elaborados, mermas).
--     Lo que faltó al contar es lo usado sin anotar (Shopping) o la diferencia real contra la receta (gastronomía).
--   * El encargado solo cuenta en su local; la pantalla Contar no le muestra lo que decía el sistema (cuenta a ciegas). Gerencia ve todo.
--   * Idempotente: se puede pegar más de una vez.

create table if not exists public.conteos (
  id         uuid primary key default gen_random_uuid(),
  local_id   uuid not null references public.locales(id) on delete cascade,
  encargado  text,
  usuario    uuid default auth.uid(),
  items      jsonb not null default '[]'::jsonb,
  creado_en  timestamptz not null default now()
);
create index if not exists conteos_local_idx on public.conteos (local_id, creado_en desc);
alter table public.conteos enable row level security;

drop policy if exists conteos_ger on public.conteos;
create policy conteos_ger on public.conteos for select to authenticated using (public.mi_rol() = 'gerencia');
drop policy if exists conteos_enc on public.conteos;
create policy conteos_enc on public.conteos for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());

-- p_items: [{producto_id, contado}] en unidad de uso. Devuelve el id del conteo.
create or replace function public.contar_local(p_local uuid, p_items jsonb, p_encargado text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare e jsonb; prod public.productos%rowtype; c numeric; sis numeric; dif numeric; cid uuid := gen_random_uuid();
        limpio jsonb := '[]'::jsonb; quien text := nullif(btrim(p_encargado), '');
begin
  if not (public.mi_rol() = 'gerencia' or (public.mi_rol() = 'encargado' and public.mi_local() = p_local)) then
    raise exception 'Sin permiso para contar en este local' using errcode = '42501';
  end if;
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
              'Conteo' || coalesce(' de ' || quien, '') || ': ' || c || ' (sistema ' || sis || ')');
    end if;
    limpio := limpio || jsonb_build_object('producto_id', prod.id, 'contado', c, 'sistema', sis, 'dif', dif);
  end loop;
  if jsonb_array_length(limpio) = 0 then raise exception 'Anotá al menos un producto contado'; end if;
  insert into public.conteos(id, local_id, encargado, items) values (cid, p_local, quien, limpio);
  return cid;
end $$;

revoke execute on function public.contar_local(uuid, jsonb, text) from public, anon;
grant execute on function public.contar_local(uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
