-- 006: teléfono de la iglesia (lo escribe la administración)
alter table public.iglesias add column if not exists telefono text
  check (telefono is null or telefono ~ '^[0-9 +()./-]{7,30}$');

create or replace function public.admin_guardar_telefono(p_clave text, p_iglesia uuid, p_telefono text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._admin_requiere(p_clave);
  update iglesias set telefono = nullif(trim(p_telefono), '') where id = p_iglesia;
end $$;

revoke all on function public.admin_guardar_telefono(text, uuid, text) from public;
grant execute on function public.admin_guardar_telefono(text, uuid, text) to anon, authenticated;
