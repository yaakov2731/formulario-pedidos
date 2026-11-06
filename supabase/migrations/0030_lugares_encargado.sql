-- 0030 · El encargado también arma los lugares de su local (Contar → Armar los lugares del local).
--   ubicar_productos(): gerencia ubica productos de cualquier local; el encargado, solo los de su propio local
--   (si manda un producto de otro local, no se toca). Lo demás igual que 0025_lugares.sql.
--   Idempotente: se puede pegar más de una vez.

create or replace function public.ubicar_productos(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb; n integer := 0; c integer; rol text := public.mi_rol(); loc uuid := public.mi_local();
begin
  if rol is null or rol not in ('gerencia', 'encargado') or (rol = 'encargado' and loc is null) then
    raise exception 'Solo gerencia o el encargado del local ordenan los lugares' using errcode = '42501';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    update public.productos
       set lugar = nullif(btrim(e->>'lugar'), ''),
           orden_lugar = case when nullif(btrim(e->>'lugar'), '') is null then null else nullif(e->>'orden', '')::integer end
     where id = (e->>'id')::uuid
       and (rol = 'gerencia' or local_id = loc);
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end $$;
revoke all on function public.ubicar_productos(jsonb) from public, anon;
grant execute on function public.ubicar_productos(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tiene que decir "encargado: sí".
select 'encargado: ' || case when pg_get_functiondef('public.ubicar_productos(jsonb)'::regprocedure) like '%local_id = loc%' then 'sí' else 'no' end as ubicar_productos;
