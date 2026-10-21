-- roles_asignables también sirve para decidir a quién puede gestionar el actor (misma regla que
-- private.puede_gestionar): se abre a cualquier permiso de gestión de usuarios, no solo invitar/editar
-- (un rol personalizado con solo `usuarios.suspender` también necesita saber sobre quién actúa).
create or replace function public.roles_asignables()
returns table (id uuid, clave text, nombre text, descripcion text, tipo public.rol_tipo, color text, requiere_mfa boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.clave, r.nombre, r.descripcion, r.tipo, r.color, r.requiere_mfa
  from public.roles r
  where (select private.acceso_valido())
    and ((select private.tiene_permiso('usuarios.invitar')) or (select private.tiene_permiso('usuarios.editar'))
         or (select private.tiene_permiso('usuarios.suspender')) or (select private.tiene_permiso('usuarios.cerrar_sesiones'))
         or (select private.tiene_permiso('usuarios.generar_enlace')) or (select private.tiene_permiso('usuarios.eliminar')))
    and (r.clave <> 'SUPERADMIN'
         or exists (select 1 from public.perfiles p join public.roles s on s.id = p.rol_id
                    where p.id = (select auth.uid()) and s.clave = 'SUPERADMIN'))
    and private.puede_gestionar((select auth.uid()), null, r.id)
  order by r.tipo, r.es_sistema desc, r.nombre
$$;
revoke all on function public.roles_asignables() from public, anon, authenticated;
grant execute on function public.roles_asignables() to authenticated;

do $$ begin
  assert not has_function_privilege('anon', 'public.roles_asignables()', 'execute'), 'anon no debe ejecutar roles_asignables';
  assert has_function_privilege('authenticated', 'public.roles_asignables()', 'execute'), 'authenticated debe ejecutar roles_asignables';
end $$;
