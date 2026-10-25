-- 0006: aviso por Telegram a gerencia cuando un local envía un pedido.
-- La app crea la orden y después le carga los productos en un segundo paso, así que el aviso
-- sale cuando entran los primeros productos de la orden (una vez por proveedor).
-- Sin los secretos 'telegram_token' y 'telegram_chat_id' en Vault no hace nada.
-- Si Telegram falla, el pedido se guarda igual.

do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net no disponible: el aviso por Telegram queda apagado';
end $$;

create or replace function public.avisar_pedido_telegram()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_token text;
  v_chat text;
  v_texto text;
  v_lineas text;
  v_cant int;
begin
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

    for r in
      select n.orden_id, count(*) as nuevos
      from nuevos n group by n.orden_id
    loop
      -- Solo la primera carga de productos de la orden (las ediciones posteriores no avisan).
      if (select count(*) from public.orden_items i where i.orden_id = r.orden_id) <> r.nuevos then
        continue;
      end if;

      select string_agg(format('• %s × %s', p.nombre, trim(trailing '.' from trim(trailing '0' from n.cantidad_pedida::text))), chr(10) order by p.nombre),
             count(*)
        into v_lineas, v_cant
        from nuevos n join public.productos p on p.id = n.producto_id
       where n.orden_id = r.orden_id;

      select format(E'🛒 Pedido nuevo · %s\nProveedor: %s\nCargó: %s\n%s producto%s%s\n\n%s',
                    l.nombre,
                    coalesce(pr.nombre, 'sin asignar'),
                    coalesce(nullif(o.cargado_por_nombre, ''), '—'),
                    v_cant, case when v_cant = 1 then '' else 's' end,
                    case when coalesce(o.nota, '') <> '' then E'\nNota: ' || o.nota else '' end,
                    v_lineas)
        into v_texto
        from public.ordenes_compra o
        join public.locales l on l.id = o.local_id
        left join public.proveedores pr on pr.id = o.proveedor_id
       where o.id = r.orden_id;

      execute 'select net.http_post(url := $1, body := $2, headers := $3)'
        using 'https://api.telegram.org/bot' || v_token || '/sendMessage',
              jsonb_build_object('chat_id', v_chat, 'text', left(v_texto, 4000)),
              '{"Content-Type": "application/json"}'::jsonb;
    end loop;
  exception when others then
    raise warning 'aviso Telegram: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.avisar_pedido_telegram() from public, anon, authenticated;

drop trigger if exists orden_items_aviso_telegram on public.orden_items;
create trigger orden_items_aviso_telegram
  after insert on public.orden_items
  referencing new table as nuevos
  for each statement execute function public.avisar_pedido_telegram();
