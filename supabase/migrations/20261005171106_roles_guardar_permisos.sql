-- Fase 4a, requisito 2: guardado TRANSACCIONAL de la matriz de permisos de un rol (docs/modelo-datos.md §5.4).
-- La Server Action aplica hoy el diff con dos peticiones (DELETE y luego upsert): si la segunda falla, el rol queda
-- con los permisos retirados y sin los nuevos. `guardar_permisos_rol_srv` hace las dos escrituras en una sola
-- transacción (todo o nada) y revalida en la BD todas las guardas antes de tocar una fila, con el actor y la sesión
-- que el servidor declara:
--   1. validar_actor: perfil ACTIVO, permiso roles.gestionar y sesión viva (AAL e inactividad)  ⇒ AMO_NO_AUTORIZADO
--   2. el rol existe                                                                              ⇒ AMO_CONFIG_INVALIDA
--   3. no es un rol de sistema (D20)                                                              ⇒ AMO_ROL_SISTEMA
--   4. no es el rol del propio actor                                                              ⇒ AMO_ROL_PROPIO
--   5. ningún permiso se otorga y se retira a la vez, y todos existen en el catálogo              ⇒ AMO_CONFIG_INVALIDA
--   6. anti-escalada: el actor tiene cada permiso que otorga o retira                             ⇒ AMO_ESCALADA_PERMISOS
--   7. cada permiso que se otorga aplica al tipo del rol                                          ⇒ AMO_PERMISO_NO_APLICABLE
-- Las guardas 3, 4, 6 y 7 también las aplica trg_rol_permisos_a_guardar fila por fila (sigue activo como respaldo);
-- aquí se comprueban antes para responder con el primer permiso infractor en `hint` sin haber escrito nada. Cada
-- fila pasa además por z_auditar con el actor de validar_actor (amo.actor_id).
-- Devuelve las filas que cambiaron de verdad: otorgar un permiso ya otorgado o retirar uno ausente no cuenta.
create function public.guardar_permisos_rol_srv(
  p_rol_id uuid, p_agregar text[], p_quitar text[], p_actor_id uuid, p_session_id uuid)
returns table (agregados integer, quitados integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_rol public.roles;
  v_agregar text[];
  v_quitar text[];
  v_clave text;
  v_agregados integer := 0;
  v_quitados integer := 0;
begin
  perform private.validar_actor(p_actor_id, 'roles.gestionar', p_session_id);
  select coalesce(array_agg(distinct k.clave order by k.clave), '{}') into v_agregar
  from unnest(p_agregar) k (clave) where k.clave is not null;
  select coalesce(array_agg(distinct k.clave order by k.clave), '{}') into v_quitar
  from unnest(p_quitar) k (clave) where k.clave is not null;

  -- Bloquea el rol: dos guardados simultáneos de la misma matriz se aplican uno tras otro.
  select * into v_rol from public.roles x where x.id = p_rol_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El rol ya no existe.';
  end if;
  if v_rol.es_sistema then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
      detail = 'Los permisos de los roles de sistema solo cambian por migración.';
  end if;
  if exists (select 1 from public.perfiles p where p.id = p_actor_id and p.rol_id = p_rol_id) then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_PROPIO',
      detail = 'No puedes cambiar los permisos de tu propio rol.';
  end if;

  select k.clave into v_clave from unnest(v_agregar) k (clave) where k.clave = any (v_quitar) order by k.clave limit 1;
  if v_clave is not null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Un permiso no puede otorgarse y retirarse a la vez.', hint = left(v_clave, 80);
  end if;
  select k.clave into v_clave from unnest(v_agregar || v_quitar) k (clave)
  where not exists (select 1 from public.permisos pe where pe.clave = k.clave) order by k.clave limit 1;
  if v_clave is not null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El permiso no existe en el catálogo.', hint = left(v_clave, 80);
  end if;
  select k.clave into v_clave from unnest(v_agregar || v_quitar) k (clave)
  where not private.tiene_permiso_de(p_actor_id, k.clave) order by k.clave limit 1;
  if v_clave is not null then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes otorgar ni retirar un permiso que no tienes.', hint = v_clave;
  end if;
  select k.clave into v_clave from unnest(v_agregar) k (clave)
  where not private.permiso_aplicable(v_rol.tipo, k.clave) order by k.clave limit 1;
  if v_clave is not null then
    raise exception using errcode = 'P0001', message = 'AMO_PERMISO_NO_APLICABLE',
      detail = 'Ese permiso no aplica a un rol de ' || lower(v_rol.tipo::text) || ': le abriría datos de toda la plataforma.',
      hint = v_clave;
  end if;

  -- Retira y otorga en la misma transacción: si algo falla, no queda ningún cambio.
  delete from public.rol_permisos rp where rp.rol_id = p_rol_id and rp.permiso_clave = any (v_quitar);
  get diagnostics v_quitados = row_count;
  insert into public.rol_permisos (rol_id, permiso_clave, otorgado_por)
  select p_rol_id, k.clave, p_actor_id from unnest(v_agregar) k (clave)
  on conflict (rol_id, permiso_clave) do nothing;
  get diagnostics v_agregados = row_count;
  return query select v_agregados, v_quitados;
end $$;
revoke all on function public.guardar_permisos_rol_srv(uuid, text[], text[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.guardar_permisos_rol_srv(uuid, text[], text[], uuid, uuid) to service_role;

do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert has_function_privilege('service_role', 'public.guardar_permisos_rol_srv(uuid, text[], text[], uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'public.guardar_permisos_rol_srv(uuid, text[], text[], uuid, uuid)', 'execute'),
         'guardar_permisos_rol_srv debe ser ejecutable solo por service_role';
  assert exists (select 1 from pg_proc p
                 where p.oid = 'public.guardar_permisos_rol_srv(uuid, text[], text[], uuid, uuid)'::regprocedure
                   and p.prosecdef and p.provolatile = 'v' and 'search_path=""' = any(p.proconfig)),
         'guardar_permisos_rol_srv debe ser definer, VOLATILE y con search_path vacío';
end $$;
