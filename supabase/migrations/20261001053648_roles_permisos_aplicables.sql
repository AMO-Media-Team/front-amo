-- Verificación integral (requisito 1 de la Fase 4a): un rol de tipo ANUNCIANTE o MEDIO solo admite los permisos
-- de su rol de sistema. `private.tiene_permiso` no distingue el tipo del rol, así que un permiso interno
-- (`usuarios.ver`, `campanas.ver`, `pagos.registrar`…) otorgado a un rol externo personalizado le abriría datos de
-- toda la plataforma. La UI ya lo refleja (`src/features/roles/reglas.ts`, `esAplicable`); la BD lo garantiza:
--   1. INSERT en rol_permisos de un permiso no aplicable a un rol externo personalizado ⇒ AMO_PERMISO_NO_APLICABLE
--      (también como owner: los roles de sistema quedan fuera porque definen qué es aplicable).
--   2. UPDATE de rol_permisos que cambie rol_id o permiso_clave ⇒ AMO_NO_AUTORIZADO, también como owner (antes no
--      disparaba ninguna guarda: con la secret key se podía "mover" un permiso sin anti-escalada; quien necesite
--      reasignar retira y otorga). El `on delete set null` de otorgado_por (borrado de un usuario) sigue permitido.
--   3. Cambiar el tipo de un rol personalizado que tenga permisos no aplicables al tipo nuevo ⇒ AMO_PERMISO_NO_APLICABLE.

create function private.permiso_aplicable(p_tipo public.rol_tipo, p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_tipo = 'ADMIN'
      or exists (select 1 from public.rol_permisos rp join public.roles r on r.id = rp.rol_id
                 where r.es_sistema and r.tipo = p_tipo and rp.permiso_clave = p_clave) $$;
revoke all on function private.permiso_aplicable(public.rol_tipo, text) from public, anon, authenticated, service_role;

create or replace function private.fn_guardar_rol_permisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rol uuid; v_clave text; v_actor uuid; r public.roles;
begin
  if tg_op = 'UPDATE' then
    if (new.rol_id, new.permiso_clave) is distinct from (old.rol_id, old.permiso_clave) then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Un permiso no se reasigna: retíralo y otórgalo de nuevo.';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    select * into r from public.roles x where x.id = new.rol_id;
    if found and not r.es_sistema and not private.permiso_aplicable(r.tipo, new.permiso_clave) then
      raise exception using errcode = 'P0001', message = 'AMO_PERMISO_NO_APLICABLE',
        detail = 'Ese permiso no aplica a un rol de ' || lower(r.tipo::text) || ': le abriría datos de toda la plataforma.',
        hint = new.permiso_clave;
    end if;
  end if;
  if session_user = 'postgres' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then v_rol := old.rol_id; v_clave := old.permiso_clave;
  else v_rol := new.rol_id; v_clave := new.permiso_clave; end if;
  if exists (select 1 from public.roles x where x.id = v_rol and x.es_sistema) then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
      detail = 'Los permisos de los roles de sistema solo cambian por migración.';
  end if;
  v_actor := private.actor_id();
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Cambiar permisos de un rol requiere un actor identificado.';
  end if;
  if exists (select 1 from public.perfiles p where p.id = v_actor and p.rol_id = v_rol) then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_PROPIO',
      detail = 'No puedes cambiar los permisos de tu propio rol.';
  end if;
  -- SUPERADMIN tiene todos los permisos, así que la comprobación también lo cubre.
  if not private.tiene_permiso_de(v_actor, v_clave) then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes otorgar ni retirar un permiso que no tienes.', hint = v_clave;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.fn_guardar_rol_permisos() from public, anon, authenticated;

drop trigger trg_rol_permisos_a_guardar on public.rol_permisos;
create trigger trg_rol_permisos_a_guardar before insert or update or delete on public.rol_permisos
  for each row execute function private.fn_guardar_rol_permisos();

-- Definer (fn_guardar_roles es invoker y la API no lee rol_permisos ajenos): no requiere EXECUTE para la API.
create function private.fn_roles_tipo_aplicable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_clave text;
begin
  if new.tipo is not distinct from old.tipo or new.es_sistema then return new; end if;
  select rp.permiso_clave into v_clave from public.rol_permisos rp
  where rp.rol_id = new.id and not private.permiso_aplicable(new.tipo, rp.permiso_clave)
  order by rp.permiso_clave limit 1;
  if v_clave is not null then
    raise exception using errcode = 'P0001', message = 'AMO_PERMISO_NO_APLICABLE',
      detail = 'El rol tiene permisos que no aplican a un rol de ' || lower(new.tipo::text) || ': retíralos antes de cambiar el tipo.',
      hint = v_clave;
  end if;
  return new;
end $$;
revoke all on function private.fn_roles_tipo_aplicable() from public, anon, authenticated;

create trigger trg_roles_a_tipo_aplicable before update of tipo on public.roles
  for each row execute function private.fn_roles_tipo_aplicable();

do $$ begin
  assert not exists (select 1 from public.rol_permisos rp join public.roles r on r.id = rp.rol_id
                     where not r.es_sistema and not private.permiso_aplicable(r.tipo, rp.permiso_clave)),
         'hay roles externos personalizados con permisos no aplicables';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
end $$;
