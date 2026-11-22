-- 0032 · Días que abre cada local y cierre que actualiza el stock.
--   * locales.dias_abre: días de la semana que abre (0 domingo … 6 sábado). Todos arrancan con viernes, sábado y domingo.
--   * locales.abre_feriados: si abre también los feriados nacionales (la lista vive en la app, stock/js/feriados.js).
--     Con esto la app sabe si lo que falta hay que comprarlo "para mañana" o para la próxima vez que abre.
--   * hoja_guardar(): guarda de una sola vez la apertura o el cierre de todo el local (cada producto con su lugar).
--     - Reemplaza lo contado ese día y de ese tipo para cada producto (se puede corregir sin duplicar).
--     - El cierre deja el stock del local igual a lo contado: un movimiento ajuste_conteo por la diferencia contra el
--       sistema. Corregir el cierre agrega solo la diferencia nueva (idempotente). Si ya hay un cierre posterior del
--       producto, el cierre viejo no toca el stock. Los platos de la carta no se ajustan.
--     - La apertura no toca el stock.
--   * Idempotente: se puede pegar más de una vez. Es aditivo: la app sigue andando sin esto (usa hoja_contar por sector).

alter table public.locales add column if not exists dias_abre smallint[] not null default '{5,6,0}';
alter table public.locales add column if not exists abre_feriados boolean not null default true;
alter table public.locales drop constraint if exists locales_dias_abre_chk;
alter table public.locales add constraint locales_dias_abre_chk check (dias_abre <@ array[0,1,2,3,4,5,6]::smallint[]);

-- p_items: [{producto_id, sector, cantidad}]. Cantidad vacía o null = no contado (se saca si estaba). Devuelve cuántos quedaron contados.
create or replace function public.hoja_guardar(p_local uuid, p_fecha date, p_tipo text, p_items jsonb, p_quien text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb; prod public.productos%rowtype; c numeric; sis numeric; n integer := 0; sec text; quien text := nullif(btrim(p_quien), '');
begin
  perform public.hoja_permiso(p_local);
  if p_tipo not in ('apertura', 'cierre') then raise exception 'El conteo tiene que ser de apertura o de cierre'; end if;
  if p_fecha is null or p_fecha > current_date + 1 or p_fecha < current_date - 7 then raise exception 'Fecha fuera de rango'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into prod from public.productos where id = (e->>'producto_id')::uuid;
    if not found then raise exception 'Un producto no existe'; end if;
    if prod.local_id <> p_local then raise exception '% es de otro local', prod.nombre; end if;
    sec := nullif(btrim(e->>'sector'), '');
    if sec is null then raise exception 'Falta el sector'; end if;
    delete from public.hoja_movs where local_id = p_local and fecha = p_fecha and producto_id = prod.id and tipo = p_tipo;
    if e->>'cantidad' is null or e->>'cantidad' = '' then continue; end if;
    c := round((e->>'cantidad')::numeric, 3);
    if c < 0 then raise exception 'Lo contado no puede ser negativo'; end if;
    insert into public.hoja_movs(local_id, fecha, sector, producto_id, tipo, cantidad, quien)
    values (p_local, p_fecha, sec, prod.id, p_tipo, c, quien);
    n := n + 1;
    if p_tipo = 'cierre' and prod.categoria is distinct from 'Carta'
       and not exists (select 1 from public.hoja_movs x where x.local_id = p_local and x.producto_id = prod.id and x.tipo = 'cierre' and x.fecha > p_fecha) then
      select coalesce(sum(cantidad), 0) into sis from public.movimientos where local_id = p_local and producto_id = prod.id;
      if c - sis <> 0 then
        insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
        values (p_local, prod.id, 'ajuste_conteo', c - sis, 'hoja_cierre', p_fecha::text,
                'Cierre del ' || to_char(p_fecha, 'DD/MM') || coalesce(' de ' || quien, '') || ': ' || c || ' (sistema ' || sis || ')');
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.hoja_guardar(uuid, date, text, jsonb, text) from public, anon;
grant execute on function public.hoja_guardar(uuid, date, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

-- Verificación: tienen que salir 2 columnas y 1 función.
select 'columna ' || column_name from information_schema.columns where table_schema = 'public' and table_name = 'locales' and column_name in ('dias_abre', 'abre_feriados')
union all
select 'funcion ' || proname from pg_proc where proname = 'hoja_guardar';
