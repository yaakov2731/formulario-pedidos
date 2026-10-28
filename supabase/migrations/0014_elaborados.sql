-- 0014_elaborados.sql · El encargado anota lo que elabora en el local y el insumo que saca al empezar el día.
-- Elaboré: "De 5 kg de nalga feteada y 500 g de pan rallado salieron 25 milanesas". Descuenta lo que se usó de verdad
--   (no la receta) y suma lo elaborado al stock del local.
-- Usé hoy: "Saqué 2 kg de papas y 1 kg de queso para el turno". Solo descuenta (movimiento 'uso_dia').
-- Cierre: al terminar el servicio cuenta lo que sobró de cada elaborado y lo que se tiró. Lo tirado va como merma y la
--   diferencia con lo que decía el sistema como ajuste de conteo; el stock queda en lo que sobró.
-- Cada registro queda en producciones (tipo, encargado y el detalle de lo usado) y se puede borrar en el día por si se cargó mal.
-- Se puede correr más de una vez.

-- ============ 1) Producciones: tipo, quién y lo usado ============
alter table public.producciones add column if not exists tipo text not null default 'produccion';
alter table public.producciones add column if not exists encargado text;
alter table public.producciones add column if not exists items jsonb;
alter table public.producciones alter column producto_id drop not null;
alter table public.producciones alter column cantidad drop not null;
alter table public.producciones drop constraint if exists producciones_cantidad_check;
alter table public.producciones drop constraint if exists producciones_tipo_check;
alter table public.producciones add constraint producciones_tipo_check check (
  (tipo in ('produccion', 'elaboracion') and producto_id is not null and cantidad > 0) or
  (tipo in ('uso', 'cierre') and producto_id is null and cantidad is null));

-- El encargado ve lo de su local (gerencia ya ve todo).
drop policy if exists producciones_encargado on public.producciones;
create policy producciones_encargado on public.producciones for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());

-- ============ 2) Movimientos: nuevo tipo 'uso_dia' (salida) ============
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.movimientos'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~ 'tipo' loop
    execute format('alter table public.movimientos drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.movimientos add constraint movimientos_tipo_check
  check (tipo in ('recepcion','venta','produccion_consumo','produccion_alta','merma','ajuste_conteo','inicial','uso_dia'));
alter table public.movimientos add constraint movimientos_signo_check check (
  (tipo in ('venta','produccion_consumo','merma','uso_dia') and cantidad <= 0) or
  (tipo in ('recepcion','produccion_alta') and cantidad >= 0) or
  tipo in ('ajuste_conteo','inicial'));

-- ============ 3) Registrar una elaboración o el uso del día ============
-- p_producto null = uso del día. p_items: [{insumo_id, cantidad}] en unidad_uso de cada insumo.
create or replace function public.registrar_elaboracion(p_local uuid, p_producto uuid, p_cantidad numeric, p_items jsonb,
                                                        p_nota text default null, p_encargado text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare prod public.productos%rowtype; ins public.productos%rowtype; e jsonb; c numeric; pid uuid; n int := 0;
        es_uso boolean := p_producto is null; limpio jsonb := '[]'::jsonb;
begin
  if not (public.mi_rol() = 'gerencia' or (public.mi_rol() = 'encargado' and public.mi_local() = p_local)) then
    raise exception 'Sin permiso para anotar en este local' using errcode = '42501';
  end if;
  if not es_uso then
    if coalesce(p_cantidad, 0) <= 0 then raise exception 'Poné cuánto salió (mayor a cero)'; end if;
    select * into prod from public.productos where id = p_producto;
    if not found then raise exception 'El producto no existe'; end if;
    if prod.local_id <> p_local then raise exception 'El producto es de otro local'; end if;
    if prod.categoria = 'Carta' then raise exception '% es un plato de la carta: se descuenta solo con las ventas', prod.nombre; end if;
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    c := round(coalesce((e->>'cantidad')::numeric, 0), 3);
    if c <= 0 then continue; end if;
    select * into ins from public.productos where id = (e->>'insumo_id')::uuid;
    if not found then raise exception 'Un insumo no existe'; end if;
    if ins.local_id <> p_local then raise exception '% es de otro local', ins.nombre; end if;
    if not es_uso and ins.id = p_producto then raise exception 'Lo elaborado no puede ser también lo usado'; end if;
    limpio := limpio || jsonb_build_object('insumo_id', ins.id, 'cantidad', c);
    n := n + 1;
  end loop;
  if es_uso and n = 0 then raise exception 'Anotá al menos un insumo con cantidad'; end if;

  insert into public.producciones(local_id, producto_id, cantidad, nota, tipo, encargado, items)
    values (p_local, p_producto, case when es_uso then null else round(p_cantidad, 3) end, nullif(btrim(p_nota), ''),
            case when es_uso then 'uso' else 'elaboracion' end, nullif(btrim(p_encargado), ''), limpio)
    returning id into pid;
  insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
    select p_local, (x->>'insumo_id')::uuid, case when es_uso then 'uso_dia' else 'produccion_consumo' end, -(x->>'cantidad')::numeric,
           'produccion', pid::text, case when es_uso then 'Uso del día' else 'Elaboración de ' || prod.nombre end
    from jsonb_array_elements(limpio) x;
  if not es_uso then
    insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
      values (p_local, p_producto, 'produccion_alta', round(p_cantidad, 3), 'produccion', pid::text, nullif(btrim(p_nota), ''));
  end if;
  return pid;
end $$;

-- ============ 4) Cierre del servicio ============
-- p_items: [{producto_id, sobro, tiro}] en unidad_uso. Devuelve el id del registro (items con sistema y diferencia).
create or replace function public.cerrar_servicio(p_local uuid, p_items jsonb, p_nota text default null, p_encargado text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare e jsonb; prod public.productos%rowtype; sobro numeric; tiro numeric; sis numeric; dif numeric; pid uuid := gen_random_uuid();
        limpio jsonb := '[]'::jsonb;
begin
  if not (public.mi_rol() = 'gerencia' or (public.mi_rol() = 'encargado' and public.mi_local() = p_local)) then
    raise exception 'Sin permiso para cerrar en este local' using errcode = '42501';
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if e->>'sobro' is null then continue; end if;
    sobro := round((e->>'sobro')::numeric, 3); tiro := round(coalesce((e->>'tiro')::numeric, 0), 3);
    if sobro < 0 or tiro < 0 then raise exception 'Las cantidades no pueden ser negativas'; end if;
    select * into prod from public.productos where id = (e->>'producto_id')::uuid;
    if not found then raise exception 'Un producto no existe'; end if;
    if prod.local_id <> p_local then raise exception '% es de otro local', prod.nombre; end if;
    select coalesce(sum(cantidad), 0) into sis from public.movimientos where local_id = p_local and producto_id = prod.id;
    dif := round(sobro + tiro - sis, 3);
    if dif <> 0 then
      insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
        values (p_local, prod.id, 'ajuste_conteo', dif, 'produccion', pid::text, 'Cierre: sobró ' || sobro || ' + se tiró ' || tiro || ' (sistema ' || sis || ')');
    end if;
    if tiro > 0 then
      insert into public.movimientos(local_id, producto_id, tipo, cantidad, ref_tipo, ref_id, nota)
        values (p_local, prod.id, 'merma', -tiro, 'produccion', pid::text, 'Se tiró al cerrar el servicio');
    end if;
    limpio := limpio || jsonb_build_object('producto_id', prod.id, 'sistema', round(sis, 3), 'sobro', sobro, 'tiro', tiro, 'dif', dif);
  end loop;
  if jsonb_array_length(limpio) = 0 then raise exception 'Anotá cuánto sobró de al menos un producto'; end if;
  insert into public.producciones(id, local_id, producto_id, cantidad, nota, tipo, encargado, items)
    values (pid, p_local, null, null, nullif(btrim(p_nota), ''), 'cierre', nullif(btrim(p_encargado), ''), limpio);
  return pid;
end $$;

-- ============ 5) Borrar un registro (se cargó mal) ============
-- Gerencia siempre; el encargado solo los de su local y del mismo día.
create or replace function public.borrar_elaboracion(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.producciones%rowtype;
begin
  select * into r from public.producciones where id = p_id;
  if not found then return; end if;
  if not (public.mi_rol() = 'gerencia' or (public.mi_rol() = 'encargado' and public.mi_local() = r.local_id
          and (r.creado_en at time zone 'America/Argentina/Buenos_Aires')::date = (now() at time zone 'America/Argentina/Buenos_Aires')::date)) then
    raise exception 'Solo se puede borrar lo anotado hoy' using errcode = '42501';
  end if;
  delete from public.movimientos where ref_tipo = 'produccion' and ref_id = p_id::text;
  delete from public.producciones where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.registrar_elaboracion(uuid, uuid, numeric, jsonb, text, text)', 'public.borrar_elaboracion(uuid)',
                         'public.cerrar_servicio(uuid, jsonb, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
