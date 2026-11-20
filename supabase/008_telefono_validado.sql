-- 008: el teléfono se valida igual que los horarios.
-- Cualquier persona propone un teléfono (nuevo o corregido); queda pendiente
-- hasta que 5 dispositivos lo confirmen, y entonces pasa a iglesias.telefono.
-- La administración puede ponerlo directo con admin_guardar_telefono.
create table if not exists public.telefono_propuestas (
  id uuid primary key default gen_random_uuid(),
  iglesia_id uuid not null references public.iglesias(id) on delete cascade,
  telefono text not null check (telefono ~ '^[0-9 +()./-]{7,30}$'),
  autor_id uuid not null,
  creado_en timestamptz not null default now()
);
create index if not exists telefono_propuestas_iglesia_idx on public.telefono_propuestas (iglesia_id, creado_en desc);

create table if not exists public.telefono_votos (
  propuesta_id uuid not null references public.telefono_propuestas(id) on delete cascade,
  votante_id uuid not null,
  creado_en timestamptz not null default now(),
  primary key (propuesta_id, votante_id)
);

alter table public.telefono_propuestas enable row level security;
alter table public.telefono_votos enable row level security;
create policy "lectura publica telefono_propuestas" on public.telefono_propuestas for select using (true);
create policy "conteo telefono_votos" on public.telefono_votos for select using (true);
revoke all on public.telefono_propuestas, public.telefono_votos from anon, authenticated;
grant select (id, iglesia_id, telefono, creado_en) on public.telefono_propuestas to anon, authenticated;
grant select (propuesta_id, creado_en) on public.telefono_votos to anon, authenticated;

create or replace view public.telefonos_con_votos
with (security_invoker = true) as
select t.id, t.iglesia_id, t.telefono, t.creado_en,
       (select count(*) from public.telefono_votos v where v.propuesta_id = t.id)::int as votos
from public.telefono_propuestas t;
grant select on public.telefonos_con_votos to anon, authenticated;

create or replace function public._telefono_ok(p text) returns text
language plpgsql immutable as $$
declare v text := nullif(trim(p), '');
begin
  if v is null or v !~ '^[0-9 +()./-]{7,30}$' or length(regexp_replace(v, '\D', '', 'g')) < 7 then
    raise exception 'Escribe un teléfono válido (solo números).';
  end if;
  return v;
end $$;

-- Validar (confirmar) un teléfono. Un voto por dispositivo. Con 5 queda publicado.
create or replace function public.validar_telefono(p_propuesta uuid, p_votante uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_votos int; v_ig uuid; v_tel text;
begin
  select iglesia_id, telefono into v_ig, v_tel from telefono_propuestas where id = p_propuesta;
  if v_ig is null then raise exception 'No existe'; end if;
  insert into telefono_votos (propuesta_id, votante_id) values (p_propuesta, p_votante) on conflict do nothing;
  select count(*) into v_votos from telefono_votos where propuesta_id = p_propuesta;
  if v_votos >= 5 then
    -- solo si sigue siendo la propuesta más reciente de esa iglesia
    update iglesias set telefono = v_tel
     where id = v_ig and not exists (
       select 1 from telefono_propuestas t where t.iglesia_id = v_ig and t.creado_en > (select creado_en from telefono_propuestas where id = p_propuesta));
  end if;
  return v_votos;
end $$;

-- Proponer un teléfono. El voto de quien lo propone cuenta como el primero.
create or replace function public.proponer_telefono(p_iglesia uuid, p_telefono text, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_tel text := public._telefono_ok(p_telefono); v_id uuid; v_mias int;
begin
  if not exists (select 1 from iglesias where id = p_iglesia and not oculta) then raise exception 'No existe la iglesia'; end if;
  select count(*) into v_mias from telefono_propuestas where autor_id = p_autor and creado_en > now() - interval '1 hour';
  if v_mias >= 5 then raise exception 'Has enviado muchos teléfonos, intenta más tarde'; end if;
  -- si ya existe esa misma propuesta pendiente, solo se suma el voto
  select id into v_id from telefono_propuestas
   where iglesia_id = p_iglesia and regexp_replace(telefono, '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g')
   order by creado_en desc limit 1;
  if v_id is null or exists (select 1 from telefono_propuestas t where t.iglesia_id = p_iglesia
       and t.creado_en > (select creado_en from telefono_propuestas where id = v_id)) then
    insert into telefono_propuestas (iglesia_id, telefono, autor_id) values (p_iglesia, v_tel, p_autor) returning id into v_id;
  end if;
  perform public.validar_telefono(v_id, p_autor);
  return v_id;
end $$;

-- La versión de 007 (sin validar) ya no se usa
create or replace function public.agregar_telefono(p_iglesia uuid, p_telefono text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Usa proponer_telefono';
end $$;

revoke all on function public._telefono_ok(text) from public, anon, authenticated;
revoke all on function public.validar_telefono(uuid, uuid) from public;
revoke all on function public.proponer_telefono(uuid, text, uuid) from public;
grant execute on function public.validar_telefono(uuid, uuid) to anon, authenticated;
grant execute on function public.proponer_telefono(uuid, text, uuid) to anon, authenticated;
