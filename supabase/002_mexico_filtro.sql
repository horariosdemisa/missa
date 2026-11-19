-- 002: estados de México, filtro de groserías, sin comentarios públicos

alter table public.iglesias add column if not exists estado text check (char_length(estado) <= 60);
alter table public.iglesias add column if not exists pais text not null default 'México' check (char_length(pais) <= 60);
create index if not exists iglesias_estado_ciudad_idx on public.iglesias (estado, ciudad);
grant select on public.iglesias to anon, authenticated;

-- Aprobación directa de la administradora (cuenta como validado)
alter table public.propuestas add column if not exists aprobada boolean not null default false;
grant select (aprobada) on public.propuestas to anon, authenticated;

create or replace view public.propuestas_con_votos
with (security_invoker = true) as
select p.id, p.iglesia_id, p.items, p.nota, p.creado_en,
       (select count(*) from public.validaciones v where v.propuesta_id = p.id)::int as votos,
       p.aprobada
from public.propuestas p;
grant select on public.propuestas_con_votos to anon, authenticated;

-- Filtro de groserías: devuelve true si el texto está limpio
create or replace function public._texto_limpio(t text)
returns boolean language sql immutable set search_path = public as $$
  select not exists (
    select 1
    from regexp_split_to_table(
           translate(lower(coalesce(t, '')), 'áéíóúüàèìòù0134@$', 'aeiouuaeiouoieaas'),
           '[^a-zñ]+') w
    where w ~ '^(pendej|chingad|chingar|chingon|chingue|verg|cabron|culer|mierd|mamad|mamon|maric|pinche|pinchi|estupid|imbecil|ojete|huevon|guey|wey|cagad|caga|joder|jodid|prostitu|fuck|shit|bitch)'
       or w in ('puta','puto','putas','putos','putita','joto','jotos','culo','culos','zorra','perra','naco','nacos','idiota','idiotas','pene','coño','pito','teta','tetas','nalga','nalgas','sexo','porno','xxx','kk','alv','ptm','hdp','mrd')
  );
$$;

-- Agregar iglesia (público): sin notas libres
create or replace function public.agregar_iglesia(
  p_nombre text, p_estado text, p_ciudad text, p_direccion text, p_facebook text,
  p_items jsonb, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_recientes int;
begin
  if not public._items_validos(p_items) then raise exception 'Horario inválido'; end if;
  if char_length(coalesce(trim(p_estado), '')) < 2 then raise exception 'Elige el estado'; end if;
  if not public._texto_limpio(concat_ws(' ', p_nombre, p_ciudad, p_direccion)) then
    raise exception 'Por favor escribe solo los datos de la iglesia, sin palabras ofensivas.';
  end if;
  if coalesce(trim(p_facebook), '') <> '' and p_facebook !~* '^https?://([a-z0-9-]+\.)*(facebook\.com|fb\.com|fb\.me)/' then
    raise exception 'El enlace debe ser de Facebook';
  end if;
  select count(*) into v_recientes from iglesias where creado_en > now() - interval '1 minute';
  if v_recientes > 10 then raise exception 'Demasiadas solicitudes, intenta en un momento'; end if;
  insert into iglesias (nombre, estado, ciudad, direccion, facebook)
  values (trim(p_nombre), trim(p_estado), trim(p_ciudad), nullif(trim(p_direccion), ''), nullif(trim(p_facebook), ''))
  returning id into v_id;
  insert into propuestas (iglesia_id, items, autor_id) values (v_id, p_items, p_autor);
  insert into validaciones (propuesta_id, votante_id)
  select id, p_autor from propuestas where iglesia_id = v_id;
  return v_id;
end $$;

-- Actualizar horario (público): sin notas libres
create or replace function public.actualizar_horario(p_iglesia uuid, p_items jsonb, p_autor uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_mias int;
begin
  if not public._items_validos(p_items) then raise exception 'Horario inválido'; end if;
  select count(*) into v_mias from propuestas
   where autor_id = p_autor and creado_en > now() - interval '1 hour';
  if v_mias >= 5 then raise exception 'Has enviado muchos horarios, intenta más tarde'; end if;
  insert into propuestas (iglesia_id, items, autor_id) values (p_iglesia, p_items, p_autor)
  returning id into v_id;
  insert into validaciones (propuesta_id, votante_id) values (v_id, p_autor);
  return v_id;
end $$;

revoke all on function public._texto_limpio(text) from public, anon, authenticated;
revoke all on function public.agregar_iglesia(text,text,text,text,text,jsonb,uuid) from public;
revoke all on function public.actualizar_horario(uuid,jsonb,uuid) from public;
grant execute on function public.agregar_iglesia(text,text,text,text,text,jsonb,uuid) to anon, authenticated;
grant execute on function public.actualizar_horario(uuid,jsonb,uuid) to anon, authenticated;
revoke execute on function public.agregar_iglesia(text,text,text,text,jsonb,text,uuid) from anon, authenticated;
revoke execute on function public.actualizar_horario(uuid,jsonb,text,uuid) from anon, authenticated;
