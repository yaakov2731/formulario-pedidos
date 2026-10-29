-- 0016: facturas pagas que figuraban vencidas + borrar factura.
-- Causa: un pago cargado antes que su factura quedaba imputado a otra factura (la más vieja) o "a cuenta",
-- y al cargar la factura después nadie le aplicaba ese saldo a favor: la factura seguía debiendo y salía vencida.
-- Además los bancos transfieren sin centavos ($340.495 por una factura de $340.495,64) y quedaban centavos "debiendo".
--   * facturas_pendientes: una factura que debe menos de $1 cuenta como pagada (no vencida).
--   * Al cargar una factura, si el proveedor tiene saldo a favor (pagos sin imputar) sus pagos se vuelven a imputar solos:
--     cada pago primero a la factura cuyo saldo coincide con él (±$1) y después a las más viejas.
--   * borrar_factura(id): solo gerencia. Los pagos no se borran: lo que tenían imputado vuelve a quedar a favor
--     y se aplica a las otras facturas pendientes del proveedor.
--   * Arreglo de datos: los proveedores con facturas vencidas y saldo a favor se vuelven a imputar (pago ↔ factura del mismo monto).
-- Idempotente (se puede volver a correr).

-- ============ 1) Vista: menos de $1 de saldo = pagada ============
create or replace view public.facturas_pendientes with (security_invoker = true) as
  select f.id, f.proveedor_id, f.numero, f.fecha, f.vencimiento, f.total, f.archivo, f.creado_en,
         coalesce(i.imputado, 0) as imputado,
         f.total - coalesce(i.imputado, 0) as pendiente,
         (f.vencimiento is not null and f.vencimiento < current_date and f.total - coalesce(i.imputado, 0) >= 1) as vencida
  from public.facturas_proveedor f
  left join (select factura_id, sum(monto) as imputado from public.pago_facturas group by factura_id) i on i.factura_id = f.id;
revoke all on public.facturas_pendientes from anon;
grant select on public.facturas_pendientes to authenticated;

-- ============ 2) Aplicar el saldo a favor de un proveedor a sus facturas pendientes ============
-- Interna (sin chequeo de rol): la usan el trigger, borrar_factura y el arreglo de datos. Devuelve cuántas imputaciones hizo.
create or replace function public._aplicar_a_cuenta(p_proveedor uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare pg record; fa record; v_cred numeric; v_m numeric; n int := 0;
begin
  for pg in
    select p.id, p.monto - coalesce((select sum(pf.monto) from public.pago_facturas pf where pf.pago_id = p.id), 0) as credito
    from public.pagos p where p.proveedor_id = p_proveedor order by p.fecha, p.creado_en, p.id
  loop
    v_cred := pg.credito;
    continue when v_cred < 1;
    for fa in
      select f.id, f.total - coalesce(sum(pf.monto), 0) as pend, f.fecha, f.numero
      from public.facturas_proveedor f left join public.pago_facturas pf on pf.factura_id = f.id
      where f.proveedor_id = p_proveedor
      group by f.id
      having f.total - coalesce(sum(pf.monto), 0) >= 1
      order by (abs(f.total - coalesce(sum(pf.monto), 0) - v_cred) < 1) desc, f.fecha, f.numero, f.id
    loop
      exit when v_cred < 1;
      v_m := least(v_cred, fa.pend);
      insert into public.pago_facturas(pago_id, factura_id, monto) values (pg.id, fa.id, v_m)
        on conflict (pago_id, factura_id) do update set monto = public.pago_facturas.monto + excluded.monto;
      v_cred := v_cred - v_m;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public._aplicar_a_cuenta(uuid) from public, anon, authenticated;

-- Vuelve a imputar todos los pagos de un proveedor desde cero (pago ↔ factura del mismo monto, después las más viejas).
create or replace function public._reimputar_proveedor(p_proveedor uuid)
returns int
language plpgsql security definer set search_path = public as $$
begin
  delete from public.pago_facturas pf using public.pagos p where p.id = pf.pago_id and p.proveedor_id = p_proveedor;
  return public._aplicar_a_cuenta(p_proveedor);
end $$;
revoke execute on function public._reimputar_proveedor(uuid) from public, anon, authenticated;

-- ============ 3) Al cargar una factura se le aplica el saldo a favor ============
-- Si el proveedor tiene pagos con saldo sin imputar, sus pagos se vuelven a imputar desde cero: así el pago que
-- correspondía a esta factura (mismo monto) deja la factura vieja a la que se había imputado por error.
-- Sin saldo a favor no se toca nada.
create or replace function public._factura_aplica_a_cuenta()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.pagos p where p.proveedor_id = new.proveedor_id
             and p.monto - coalesce((select sum(pf.monto) from public.pago_facturas pf where pf.pago_id = p.id), 0) >= 1) then
    perform public._reimputar_proveedor(new.proveedor_id);
  end if;
  return null;
end $$;
revoke execute on function public._factura_aplica_a_cuenta() from public, anon, authenticated;
drop trigger if exists facturas_aplica_a_cuenta on public.facturas_proveedor;
create trigger facturas_aplica_a_cuenta after insert on public.facturas_proveedor
  for each row execute function public._factura_aplica_a_cuenta();

-- ============ 4) Borrar factura (solo gerencia) ============
create or replace function public.borrar_factura(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare fac public.facturas_proveedor%rowtype; v_lib numeric;
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Solo gerencia puede borrar facturas' using errcode = '42501';
  end if;
  select * into fac from public.facturas_proveedor where id = p_id for update;
  if not found then raise exception 'La factura ya no existe'; end if;
  select coalesce(sum(monto), 0) into v_lib from public.pago_facturas where factura_id = p_id;
  delete from public.facturas_proveedor where id = p_id;   -- sus imputaciones se borran en cascada; los pagos quedan
  perform public._aplicar_a_cuenta(fac.proveedor_id);
  return jsonb_build_object('numero', fac.numero, 'liberado', v_lib, 'archivo', fac.archivo);
end $$;
revoke execute on function public.borrar_factura(uuid) from public, anon;
grant execute on function public.borrar_factura(uuid) to authenticated;

-- ============ 5) Arreglo de datos ============
-- Proveedores con alguna factura vencida y pagos con saldo sin imputar: se vuelven a imputar.
do $$
declare r record;
begin
  for r in
    select distinct f.proveedor_id from public.facturas_pendientes f
    where f.vencida and exists (
      select 1 from public.pagos p
      where p.proveedor_id = f.proveedor_id
        and p.monto - coalesce((select sum(pf.monto) from public.pago_facturas pf where pf.pago_id = p.id), 0) >= 1)
  loop
    perform public._reimputar_proveedor(r.proveedor_id);
  end loop;
end $$;
