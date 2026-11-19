-- 003: panel de administración (clave cifrada) y ocultar en lugar de borrar

alter table public.iglesias add column if not exists oculta boolean not null default false;
alter table public.propuestas add column if not exists oculta boolean not null default false;

-- El público solo ve lo que no está oculto
alter policy "lectura publica iglesias" on public.iglesias using (not oculta);
alter policy "lectura publica propuestas" on public.propuestas using (not oculta);

create table if not exists public.admin_config (
  id int primary key default 1 check (id = 1),
  clave_hash text not null
);
alter table public.admin_config enable row level security;
revoke all on public.admin_config from anon, authenticated;

create table if not exists public.admin_intentos (
  creado_en timestamptz not null default now(),
  ok boolean not null
);
alter table public.admin_intentos enable row level security;
revoke all on public.admin_intentos from anon, authenticated;

create or replace function public._admin_ok(p_clave text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_ok boolean; v_fallos int;
begin
  select count(*) into v_fallos from admin_intentos where not ok and creado_en > now() - interval '15 minutes';
  if v_fallos >= 10 then raise exception 'Demasiados intentos. Espera 15 minutos.'; end if;
  select crypt(coalesce(p_clave, ''), clave_hash) = clave_hash into v_ok from admin_config where id = 1;
  v_ok := coalesce(v_ok, false);
  if not v_ok then insert into admin_intentos (ok) values (false); end if;
  return v_ok;
end $$;

create or replace function public._admin_requiere(p_clave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._admin_ok(p_clave) then raise exception 'Clave incorrecta'; end if;
end $$;

create or replace function public.admin_entrar(p_clave text)
returns boolean language plpgsql security definer set search_path = public as $$
begin return public._admin_ok(p_clave); end $$;

create or replace function public.admin_cambiar_clave(p_clave text, p_nueva text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._admin_requiere(p_clave);
  if char_length(coalesce(p_nueva, '')) < 10 then raise exception 'La clave nueva debe tener al menos 10 caracteres'; end if;
  update admin_config set clave_hash = crypt(p_nueva, gen_salt('bf', 10)) where id = 1;
end $$;

-- Datos completos para el panel (incluye lo oculto)
create or replace function public.admin_datos(p_clave text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  return jsonb_build_object(
    'iglesias', coalesce((select jsonb_agg(to_jsonb(i) order by i.nombre) from iglesias i), '[]'::jsonb),
    'propuestas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'iglesia_id', p.iglesia_id, 'items', p.items, 'nota', p.nota, 'creado_en', p.creado_en,
        'aprobada', p.aprobada, 'oculta', p.oculta,
        'votos', (select count(*) from validaciones v where v.propuesta_id = p.id)) order by p.creado_en desc)
      from propuestas p), '[]'::jsonb));
end $$;

create or replace function public.admin_guardar_iglesia(
  p_clave text, p_id uuid, p_nombre text, p_estado text, p_ciudad text, p_direccion text, p_facebook text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform public._admin_requiere(p_clave);
  if v_id is null then
    insert into iglesias (nombre, estado, ciudad, direccion, facebook)
    values (trim(p_nombre), trim(p_estado), trim(p_ciudad), nullif(trim(p_direccion), ''), nullif(trim(p_facebook), ''))
    returning id into v_id;
  else
    update iglesias set nombre = trim(p_nombre), estado = trim(p_estado), ciudad = trim(p_ciudad),
      direccion = nullif(trim(p_direccion), ''), facebook = nullif(trim(p_facebook), '')
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_ocultar_iglesia(p_clave text, p_id uuid, p_oculta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  update iglesias set oculta = p_oculta where id = p_id;
end $$;

create or replace function public.admin_publicar_horario(p_clave text, p_iglesia uuid, p_items jsonb, p_nota text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._admin_requiere(p_clave);
  if not public._items_validos(p_items) then raise exception 'Horario inválido'; end if;
  insert into propuestas (iglesia_id, items, nota, autor_id, aprobada)
  values (p_iglesia, p_items, nullif(trim(p_nota), ''), '00000000-0000-0000-0000-000000000000', true)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_aprobar_propuesta(p_clave text, p_id uuid, p_aprobada boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  update propuestas set aprobada = p_aprobada where id = p_id;
end $$;

create or replace function public.admin_ocultar_propuesta(p_clave text, p_id uuid, p_oculta boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  update propuestas set oculta = p_oculta where id = p_id;
end $$;

revoke all on function public._admin_ok(text) from public, anon, authenticated;
revoke all on function public._admin_requiere(text) from public, anon, authenticated;
revoke all on function public.admin_entrar(text) from public;
revoke all on function public.admin_cambiar_clave(text,text) from public;
revoke all on function public.admin_datos(text) from public;
revoke all on function public.admin_guardar_iglesia(text,uuid,text,text,text,text,text) from public;
revoke all on function public.admin_ocultar_iglesia(text,uuid,boolean) from public;
revoke all on function public.admin_publicar_horario(text,uuid,jsonb,text) from public;
revoke all on function public.admin_aprobar_propuesta(text,uuid,boolean) from public;
revoke all on function public.admin_ocultar_propuesta(text,uuid,boolean) from public;
grant execute on function
  public.admin_entrar(text),
  public.admin_cambiar_clave(text,text),
  public.admin_datos(text),
  public.admin_guardar_iglesia(text,uuid,text,text,text,text,text),
  public.admin_ocultar_iglesia(text,uuid,boolean),
  public.admin_publicar_horario(text,uuid,jsonb,text),
  public.admin_aprobar_propuesta(text,uuid,boolean),
  public.admin_ocultar_propuesta(text,uuid,boolean)
to anon, authenticated;
