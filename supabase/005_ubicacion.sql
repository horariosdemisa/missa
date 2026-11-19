-- 005: ubicación de cada iglesia (para "Cerca de mí" y "Cómo llegar")
alter table public.iglesias add column if not exists lat double precision check (lat between -90 and 90);
alter table public.iglesias add column if not exists lng double precision check (lng between -180 and 180);

-- La administración pone o corrige la ubicación (null la quita)
create or replace function public.admin_guardar_ubicacion(p_clave text, p_iglesia uuid, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  if (p_lat is null) <> (p_lng is null) then raise exception 'Ubicación incompleta'; end if;
  update iglesias set lat = p_lat, lng = p_lng where id = p_iglesia;
end $$;

-- Agregar iglesia con ubicación opcional ("Estoy en la iglesia")
create or replace function public.agregar_iglesia(
  p_nombre text, p_estado text, p_ciudad text, p_direccion text, p_facebook text,
  p_items jsonb, p_autor uuid, p_lat double precision, p_lng double precision)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.agregar_iglesia(p_nombre, p_estado, p_ciudad, p_direccion, p_facebook, p_items, p_autor);
  if p_lat between -90 and 90 and p_lng between -180 and 180 then
    update iglesias set lat = p_lat, lng = p_lng where id = v_id;
  end if;
  return v_id;
end $$;

revoke all on function public.admin_guardar_ubicacion(text, uuid, double precision, double precision) from public;
grant execute on function public.admin_guardar_ubicacion(text, uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.agregar_iglesia(text, text, text, text, text, jsonb, uuid, double precision, double precision) to anon, authenticated;
