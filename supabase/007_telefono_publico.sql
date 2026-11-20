-- 007: cualquier persona puede poner el teléfono de una iglesia que todavía no tiene.
-- Si ya tiene uno, solo la administración lo puede cambiar (admin_guardar_telefono).
create or replace function public.agregar_telefono(p_iglesia uuid, p_telefono text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_tel text := nullif(trim(p_telefono), '');
begin
  if v_tel is null or v_tel !~ '^[0-9 +()./-]{7,30}$' or length(regexp_replace(v_tel, '\D', '', 'g')) < 7 then
    raise exception 'Escribe un teléfono válido (solo números).';
  end if;
  update iglesias set telefono = v_tel
   where id = p_iglesia and telefono is null and not coalesce(oculta, false);
  return found;
end $$;

revoke all on function public.agregar_telefono(uuid, text) from public;
grant execute on function public.agregar_telefono(uuid, text) to anon, authenticated;
