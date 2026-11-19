-- Horarios de Misa: esquema de base de datos (Supabase / Postgres)
-- Lectura pública. Escritura solo a través de funciones (RPC) con validaciones.

create extension if not exists pgcrypto;

create table if not exists public.iglesias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 3 and 120),
  ciudad text not null check (char_length(ciudad) between 2 and 80),
  direccion text check (char_length(direccion) <= 200),
  facebook text check (char_length(facebook) <= 300),
  creado_en timestamptz not null default now()
);

-- Cada propuesta es una versión completa del horario de una iglesia.
-- items: [{ "dia": 0-6 (0 = domingo), "hora": "HH:MM", "tipo": "Misa" | "Confesiones" | ... }]
create table if not exists public.propuestas (
  id uuid primary key default gen_random_uuid(),
  iglesia_id uuid not null references public.iglesias(id) on delete cascade,
  items jsonb not null,
  nota text check (char_length(nota) <= 300),
  autor_id uuid not null,
  creado_en timestamptz not null default now()
);
create index if not exists propuestas_iglesia_idx on public.propuestas (iglesia_id, creado_en desc);

create table if not exists public.validaciones (
  propuesta_id uuid not null references public.propuestas(id) on delete cascade,
  votante_id uuid not null,
  creado_en timestamptz not null default now(),
  primary key (propuesta_id, votante_id)
);

-- Vista con el conteo de validaciones por propuesta
create or replace view public.propuestas_con_votos
with (security_invoker = true) as
select p.id, p.iglesia_id, p.items, p.nota, p.creado_en,
       (select count(*) from public.validaciones v where v.propuesta_id = p.id)::int as votos
from public.propuestas p;

alter table public.iglesias enable row level security;
alter table public.propuestas enable row level security;
alter table public.validaciones enable row level security;

drop policy if exists "lectura publica iglesias" on public.iglesias;
create policy "lectura publica iglesias" on public.iglesias for select using (true);
drop policy if exists "lectura publica propuestas" on public.propuestas;
create policy "lectura publica propuestas" on public.propuestas for select using (true);
drop policy if exists "conteo validaciones" on public.validaciones;
create policy "conteo validaciones" on public.validaciones for select using (true);

-- Solo lectura para el público; los ids de dispositivo (autor_id, votante_id) no se exponen.
revoke all on public.iglesias, public.propuestas, public.validaciones from anon, authenticated;
grant select on public.iglesias to anon, authenticated;
grant select (id, iglesia_id, items, nota, creado_en) on public.propuestas to anon, authenticated;
grant select (propuesta_id, creado_en) on public.validaciones to anon, authenticated;
grant select on public.propuestas_con_votos to anon, authenticated;

-- Valida la forma del horario
create or replace function public._items_validos(p_items jsonb)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) between 1 and 60
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
       where not (
         jsonb_typeof(e) = 'object'
         and coalesce(e->>'dia','') ~ '^[0-6]$'
         and coalesce(e->>'hora','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         and char_length(coalesce(e->>'tipo', '')) between 1 and 40
       )
     );
$$;

-- Agregar una iglesia con su primer horario
create or replace function public.agregar_iglesia(
  p_nombre text, p_ciudad text, p_direccion text, p_facebook text,
  p_items jsonb, p_nota text, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_recientes int;
begin
  if not public._items_validos(p_items) then raise exception 'Horario inválido'; end if;
  select count(*) into v_recientes from iglesias where creado_en > now() - interval '1 minute';
  if v_recientes > 10 then raise exception 'Demasiadas solicitudes, intenta en un momento'; end if;
  insert into iglesias (nombre, ciudad, direccion, facebook)
  values (trim(p_nombre), trim(p_ciudad), nullif(trim(p_direccion), ''), nullif(trim(p_facebook), ''))
  returning id into v_id;
  insert into propuestas (iglesia_id, items, nota, autor_id)
  values (v_id, p_items, nullif(trim(p_nota), ''), p_autor);
  -- quien propone también lo valida
  insert into validaciones (propuesta_id, votante_id)
  select id, p_autor from propuestas where iglesia_id = v_id;
  return v_id;
end $$;

-- Proponer un horario actualizado
create or replace function public.actualizar_horario(
  p_iglesia uuid, p_items jsonb, p_nota text, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_mias int;
begin
  if not public._items_validos(p_items) then raise exception 'Horario inválido'; end if;
  select count(*) into v_mias from propuestas
   where autor_id = p_autor and creado_en > now() - interval '1 hour';
  if v_mias >= 5 then raise exception 'Has enviado muchos horarios, intenta más tarde'; end if;
  insert into propuestas (iglesia_id, items, nota, autor_id)
  values (p_iglesia, p_items, nullif(trim(p_nota), ''), p_autor)
  returning id into v_id;
  insert into validaciones (propuesta_id, votante_id) values (v_id, p_autor);
  return v_id;
end $$;

-- Validar (confirmar) una propuesta. Un voto por dispositivo.
create or replace function public.validar_horario(p_propuesta uuid, p_votante uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_votos int;
begin
  insert into validaciones (propuesta_id, votante_id) values (p_propuesta, p_votante)
  on conflict do nothing;
  select count(*) into v_votos from validaciones where propuesta_id = p_propuesta;
  return v_votos;
end $$;

revoke all on function public._items_validos(jsonb) from public, anon, authenticated;
revoke all on function public.agregar_iglesia(text,text,text,text,jsonb,text,uuid) from public;
revoke all on function public.actualizar_horario(uuid,jsonb,text,uuid) from public;
revoke all on function public.validar_horario(uuid,uuid) from public;
grant execute on function public.agregar_iglesia(text,text,text,text,jsonb,text,uuid) to anon, authenticated;
grant execute on function public.actualizar_horario(uuid,jsonb,text,uuid) to anon, authenticated;
grant execute on function public.validar_horario(uuid,uuid) to anon, authenticated;
