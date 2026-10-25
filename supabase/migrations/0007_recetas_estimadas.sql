-- 0007: recetas "estimadas" (cargadas con pesos estándar, sin revisar).
-- Cuando gerencia guarda la receta desde la app (guardar_receta actualiza la fila), deja de ser estimada.
alter table public.recetas add column if not exists estimada boolean not null default false;

create or replace function public.receta_revisada()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.estimada and new.estimada then new.estimada := false; end if;
  return new;
end $$;

drop trigger if exists recetas_revisada on public.recetas;
create trigger recetas_revisada before update on public.recetas
  for each row execute function public.receta_revisada();
