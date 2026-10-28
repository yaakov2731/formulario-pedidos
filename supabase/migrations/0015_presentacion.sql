-- 0015_presentacion.sql · Insumos que se compran por bulto y se usan en kilos, litros o unidades.
-- Ej.: la bolsa de papas viene de 5 kg. unidad_compra = 'bolsa', unidad_uso = 'kg', factor_conversion = 5.
--   * Pedir y el pedido al proveedor siguen en bolsas (unidad_compra).
--   * Al recibir 2 bolsas entran 10 kg (recibir_orden ya multiplica por factor_conversion).
--   * El stock, las recetas, las ventas y la producción van en kg: un plato con 200 g descuenta 0,2 kg.
-- cambiar_presentacion cambia cómo se compra y se mide un producto y, si hace falta, convierte lo que ya estaba
-- cargado (stock, recetas que lo usan, su propia receta, cantidad ideal y cantidad por venta) con p_escala:
--   cantidad nueva = cantidad vieja × p_escala   (ej. de 'paquete' a 'kg' con bolsa de 5 kg: p_escala = 5).
-- Además pasa las Papas en bolsa de Umo (UMO-106) a bolsa de 5 kg. Sus recetas y su stock ya estaban pensados
-- en kilos (0,08 = 80 g), así que no se convierten.
-- Se puede correr más de una vez.

create or replace function public.cambiar_presentacion(p_producto uuid, p_unidad_compra text, p_unidad_uso text,
  p_factor numeric, p_escala numeric default 1)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_mov int := 0; n_rec int := 0; esc numeric := coalesce(p_escala, 1);
begin
  if public.mi_rol() is distinct from 'gerencia' then
    raise exception 'Sin permiso para cambiar productos' using errcode = '42501';
  end if;
  if p_factor is null or p_factor <= 0 then raise exception 'Cada bulto tiene que traer más de cero'; end if;
  if esc <= 0 then raise exception 'La conversión tiene que ser mayor a cero'; end if;
  if not exists (select 1 from public.productos where id = p_producto) then raise exception 'No existe el producto'; end if;

  update public.productos
     set unidad_compra = nullif(trim(p_unidad_compra), ''), unidad_uso = nullif(trim(p_unidad_uso), ''),
         factor_conversion = p_factor, par = case when esc <> 1 then round(par * esc, 3) else par end
   where id = p_producto;

  if esc <> 1 then
    update public.movimientos set cantidad = round(cantidad * esc, 3) where producto_id = p_producto;
    get diagnostics n_mov = row_count;
    update public.receta_items set cantidad = round(cantidad * esc, 4) where insumo_id = p_producto;
    get diagnostics n_rec = row_count;
    update public.recetas set rinde = round(rinde * esc, 3) where producto_id = p_producto;
    update public.producto_alias set cantidad_por_venta = round(cantidad_por_venta * esc, 4) where producto_id = p_producto;
    update public.producciones set cantidad = round(cantidad * esc, 3) where producto_id = p_producto and cantidad is not null;
  end if;
  return jsonb_build_object('movimientos', n_mov, 'recetas', n_rec);
end $$;
revoke execute on function public.cambiar_presentacion(uuid, text, text, numeric, numeric) from public, anon;
grant execute on function public.cambiar_presentacion(uuid, text, text, numeric, numeric) to authenticated;

-- Papas en bolsa de Umo: bolsa de 5 kg, se usan en kilos (solo si todavía están como paquete).
update public.productos
   set unidad_compra = 'bolsa', unidad_uso = 'kg', factor_conversion = 5
 where codigo = 'UMO-106' and unidad_uso is distinct from 'kg';

-- Control: debería mostrar UMO-106 | bolsa | kg | 5
select codigo, nombre, unidad_compra, unidad_uso, factor_conversion from public.productos where codigo = 'UMO-106';
