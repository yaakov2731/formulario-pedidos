-- 0026 · Borrar un conteo equivocado (o sacar un solo producto de un conteo).
--   * borrar_conteo(p_conteo, p_producto): saca del conteo ese producto (o todos, con p_producto null) y deshace su ajuste:
--     el stock vuelve a lo que había antes de ese conteo. Si se borran todos los productos, el conteo desaparece.
--   * Si el producto se volvió a contar después, su ajuste no se toca: manda lo último que se contó.
--   * Gerencia borra cualquier conteo. El encargado solo los de su local y del mismo día (hora de Argentina).
--   * Para corregir un número: sacar ese producto y volver a contarlo.
--   * Idempotente: se puede pegar más de una vez.

create or replace function public.borrar_conteo(p_conteo uuid, p_producto uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.conteos%rowtype; it jsonb; pid uuid; quedan jsonb := '[]'::jsonb;
        sacados integer := 0; recontados integer := 0;
        tz constant text := 'America/Argentina/Buenos_Aires';
begin
  select * into c from public.conteos where id = p_conteo for update;
  if not found then raise exception 'Ese conteo ya no existe'; end if;
  if public.mi_rol() = 'gerencia' then
    null;
  elsif public.mi_rol() = 'encargado' and public.mi_local() = c.local_id then
    if (c.creado_en at time zone tz)::date <> (now() at time zone tz)::date then
      raise exception 'Solo se puede borrar un conteo del mismo día. Pedíselo a gerencia.';
    end if;
  else
    raise exception 'Sin permiso para borrar este conteo' using errcode = '42501';
  end if;

  for it in select * from jsonb_array_elements(c.items) loop
    pid := (it->>'producto_id')::uuid;
    if p_producto is not null and pid <> p_producto then quedan := quedan || it; continue; end if;
    sacados := sacados + 1;
    if exists (select 1 from public.movimientos m
                where m.local_id = c.local_id and m.producto_id = pid and m.tipo = 'ajuste_conteo'
                  and m.creado_en > c.creado_en and coalesce(m.ref_id, '') <> c.id::text)
       or exists (select 1 from public.conteos c2
                   where c2.local_id = c.local_id and c2.id <> c.id and c2.creado_en > c.creado_en
                     and c2.items @> jsonb_build_array(jsonb_build_object('producto_id', pid::text))) then
      recontados := recontados + 1;
    else
      delete from public.movimientos
       where local_id = c.local_id and producto_id = pid and tipo = 'ajuste_conteo'
         and ref_tipo = 'conteo' and ref_id = c.id::text;
    end if;
  end loop;

  if sacados = 0 then raise exception 'Ese producto no está en el conteo'; end if;
  if jsonb_array_length(quedan) = 0 then
    delete from public.conteos where id = c.id;
  else
    update public.conteos set items = quedan where id = c.id;
  end if;
  return jsonb_build_object('sacados', sacados, 'recontados', recontados, 'borrado', jsonb_array_length(quedan) = 0);
end $$;

revoke all on function public.borrar_conteo(uuid, uuid) from public, anon;
grant execute on function public.borrar_conteo(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tiene que salir la función.
select 'funcion ' || proname from pg_proc where proname = 'borrar_conteo';
