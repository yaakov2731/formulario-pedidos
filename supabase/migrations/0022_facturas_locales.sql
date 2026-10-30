-- 0022 · Los locales suben las facturas y remitos que les llegan, sin ver precios ni totales.
--   * facturas_locales: una fila por factura subida (local, proveedor si lo sabe, fotos/PDF, nota, quién la subió).
--     No guarda montos: el encargado solo manda el archivo. Gerencia la lee en Recibir con factura (ahí sí ve precios)
--     y queda marcada como recibida (o descartada si era repetida).
--   * Storage: el encargado solo puede SUBIR archivos dentro de comprobantes/locales/<su local>/. No puede ver, bajar
--     ni borrar ningún comprobante (las políticas de lectura siguen siendo de gerencia y contadora).
--   * Idempotente: se puede pegar más de una vez. Sin tablas temporales (el SQL Editor autocommitea cada sentencia).

create table if not exists public.facturas_locales (
  id                uuid primary key default gen_random_uuid(),
  local_id          uuid not null references public.locales(id) on delete cascade,
  proveedor_id      uuid references public.proveedores(id) on delete set null,
  archivos          text[] not null default '{}',
  nota              text not null default '' check (char_length(nota) <= 500),
  subida_por        uuid default auth.uid(),
  subida_por_nombre text not null default '',
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'recibida', 'descartada')),
  factura_id        uuid references public.facturas_proveedor(id) on delete set null,
  procesada_en      timestamptz,
  creado_en         timestamptz not null default now()
);
create index if not exists facturas_locales_estado on public.facturas_locales (estado, creado_en desc);
create index if not exists facturas_locales_local on public.facturas_locales (local_id, creado_en desc);

alter table public.facturas_locales enable row level security;
revoke all on public.facturas_locales from anon;
grant select, insert, update, delete on public.facturas_locales to authenticated;

-- Gerencia: todo.
drop policy if exists facturas_locales_ger on public.facturas_locales;
create policy facturas_locales_ger on public.facturas_locales for all to authenticated
  using (public.mi_rol() = 'gerencia') with check (public.mi_rol() = 'gerencia');

-- Encargado: ve las de su local, sube solo a su local y puede borrar la suya mientras esté pendiente.
drop policy if exists facturas_locales_enc_sel on public.facturas_locales;
create policy facturas_locales_enc_sel on public.facturas_locales for select to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local());
drop policy if exists facturas_locales_enc_ins on public.facturas_locales;
create policy facturas_locales_enc_ins on public.facturas_locales for insert to authenticated
  with check (public.mi_rol() = 'encargado' and local_id = public.mi_local() and estado = 'pendiente'
              and factura_id is null and procesada_en is null
              and coalesce(array_length(archivos, 1), 0) between 1 and 6
              and not exists (select 1 from unnest(archivos) a where a not like 'locales/' || public.mi_local()::text || '/%'));
drop policy if exists facturas_locales_enc_del on public.facturas_locales;
create policy facturas_locales_enc_del on public.facturas_locales for delete to authenticated
  using (public.mi_rol() = 'encargado' and local_id = public.mi_local() and estado = 'pendiente');

-- Storage: el encargado sube solo a su carpeta (sin leer, sin pisar, sin borrar).
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists comprobantes_local_insert on storage.objects;
    create policy comprobantes_local_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'comprobantes' and public.mi_rol() = 'encargado'
                  and name like 'locales/' || public.mi_local()::text || '/%');
  end if;
end $$;

notify pgrst, 'reload schema';
