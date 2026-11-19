-- 004: horarios de confesiones con hora de fin opcional, y foto de cada iglesia
-- (la foto solo la sube la administración, así no aparecen imágenes inapropiadas)

-- Cada horario puede llevar "fin" (HH:MM), útil para confesiones: 5:00 a 7:00 p. m.
create or replace function public._items_validos(p_items jsonb)
returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) between 1 and 80
     and not exists (
       select 1 from jsonb_array_elements(p_items) e
       where not (
         jsonb_typeof(e) = 'object'
         and coalesce(e->>'dia','') ~ '^[0-6]$'
         and coalesce(e->>'hora','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         and char_length(coalesce(e->>'tipo', '')) between 1 and 40
         and (e->>'fin' is null or (e->>'fin' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and e->>'fin' > e->>'hora'))
       )
     );
$$;
revoke all on function public._items_validos(jsonb) from public, anon, authenticated;

-- Fecha de la foto actual (vacío = sin foto). El público ya puede leer iglesias.
alter table public.iglesias add column if not exists foto_actualizada timestamptz;

create table if not exists public.iglesia_fotos (
  iglesia_id uuid primary key references public.iglesias(id),
  foto text not null check (char_length(foto) <= 700000
    and foto ~ '^data:image/(jpeg|webp);base64,[A-Za-z0-9+/=]+$'),
  actualizado_en timestamptz not null default now()
);
alter table public.iglesia_fotos enable row level security;
revoke all on public.iglesia_fotos from anon, authenticated;
grant select on public.iglesia_fotos to anon, authenticated;

drop policy if exists "lectura publica fotos" on public.iglesia_fotos;
create policy "lectura publica fotos" on public.iglesia_fotos for select using (
  exists (select 1 from public.iglesias i
          where i.id = iglesia_id and not i.oculta and i.foto_actualizada is not null));

-- Subir o quitar la foto (solo administración). p_foto vacío = quitar.
create or replace function public.admin_guardar_foto(p_clave text, p_iglesia uuid, p_foto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  if coalesce(p_foto, '') = '' then
    update iglesias set foto_actualizada = null where id = p_iglesia;
  else
    insert into iglesia_fotos (iglesia_id, foto, actualizado_en) values (p_iglesia, p_foto, now())
    on conflict (iglesia_id) do update set foto = excluded.foto, actualizado_en = now();
    update iglesias set foto_actualizada = now() where id = p_iglesia;
  end if;
end $$;
revoke all on function public.admin_guardar_foto(text,uuid,text) from public;
grant execute on function public.admin_guardar_foto(text,uuid,text) to anon, authenticated;
