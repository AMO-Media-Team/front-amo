-- Módulo de Usuarios (docs/modelo-datos.md §2.4.4, §4.2 «perfiles», §5.1, §5.2, §5.4, §5.5).
-- 1) public.transicionar_srv PROVISIONAL: solo la entidad `perfiles` (filas de §4.2). negocio_transacciones (M7)
--    debe redefinirla con `create or replace` (misma firma y retorno), apoyarse en private.transiciones_estado y
--    private.aplicar_transicion y conservar las reglas de perfiles, incluida «nadie cambia el estado de su propia
--    cuenta». Con ella ya funciona suspender_usuario_srv (M4), que la invoca.
-- 2) public.eliminar_usuario_srv: borrado definitivo (solo SUPERADMIN y solo cuentas DESACTIVADAS).
-- 3) SRF de administración (definer, EXECUTE a authenticated; filtran por acceso_valido() + permiso, §2.3):
--    listar_usuarios, resumen_usuarios, roles_asignables, seguridad_usuario, sesiones_usuario. Leen auth.* (factores
--    MFA, sesiones), que PostgREST no expone, y nunca devuelven secretos (ni `secret` del TOTP ni tokens).

-- 1. Transiciones de perfiles (provisional hasta M7)
create function public.transicionar_srv(
  p_entidad text, p_id uuid, p_hacia text, p_actor_id uuid, p_session_id uuid,
  p_motivo text default null, p_datos jsonb default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo;
  v_perfil public.perfiles;
  v_permiso text;
  v_requiere_motivo boolean;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_ahora timestamptz := private.ahora();
  v_prev_tipo text := current_setting('amo.actor_tipo', true);
  v_prev_motivo text := current_setting('amo.motivo', true);
begin
  -- Un error del servidor no escala a SISTEMA: sin actor humano no hay transición (§5.2).
  if p_actor_id is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_entidad is distinct from 'perfiles' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Esta transición aún no está disponible.', hint = p_entidad;
  end if;
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);

  select * into v_perfil from public.perfiles p where p.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El usuario no existe.';
  end if;

  -- Filas ADMIN de §4.2 (la fila SISTEMA INVITADO → ACTIVO la aplica activar_perfil_srv).
  select t.permiso, t.requiere_motivo into v_permiso, v_requiere_motivo
  from (values
    ('INVITADO', 'ACTIVO', 'usuarios.invitar', false),
    ('INVITADO', 'DESACTIVADO', 'usuarios.invitar', true),
    ('ACTIVO', 'SUSPENDIDO', 'usuarios.suspender', true),
    ('SUSPENDIDO', 'ACTIVO', 'usuarios.suspender', true),
    ('ACTIVO', 'DESACTIVADO', 'usuarios.eliminar', true),
    ('SUSPENDIDO', 'DESACTIVADO', 'usuarios.eliminar', true),
    ('DESACTIVADO', 'INVITADO', 'usuarios.invitar', true)
  ) as t (desde, hacia, permiso, requiere_motivo)
  where t.desde = v_perfil.estado::text and t.hacia = p_hacia;
  if v_permiso is null or v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La cuenta no puede pasar a ese estado desde el actual.',
      hint = 'perfiles:' || v_perfil.estado::text || '→' || coalesce(p_hacia, 'null');
  end if;
  if p_id = p_actor_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'No puedes cambiar el estado de tu propia cuenta.';
  end if;
  if not private.tiene_permiso_de(p_actor_id, v_permiso) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if not private.puede_gestionar(p_actor_id, p_id, v_perfil.rol_id) then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes gestionar a un usuario con permisos que no tienes.';
  end if;
  if v_requiere_motivo and v_motivo is null then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica el motivo del cambio.';
  end if;

  perform set_config('amo.actor_tipo', 'ADMIN', true);
  perform set_config('amo.motivo', coalesce(v_motivo, ''), true);
  -- Timestamps según el mapa de §4.1 (→ ACTIVO: PRIMERA; → SUSPENDIDO / → DESACTIVADO: SIEMPRE).
  update public.perfiles p set
    estado = p_hacia::public.perfil_estado,
    motivo_estado = v_motivo,
    activado_at = case when p_hacia = 'ACTIVO' then coalesce(p.activado_at, v_ahora) else p.activado_at end,
    suspendido_at = case when p_hacia = 'SUSPENDIDO' then v_ahora else p.suspendido_at end,
    desactivado_at = case when p_hacia = 'DESACTIVADO' then v_ahora else p.desactivado_at end,
    deleted_at = case when p_hacia = 'DESACTIVADO' then v_ahora
                      when p_hacia = 'INVITADO' then null
                      else p.deleted_at end,
    debe_cambiar_password = case when p_hacia = 'INVITADO' then true else p.debe_cambiar_password end
  where p.id = p_id;
  perform set_config('amo.actor_tipo', coalesce(v_prev_tipo, ''), true);
  perform set_config('amo.motivo', coalesce(v_prev_motivo, ''), true);

  return jsonb_build_object('entidad', p_entidad, 'id', p_id, 'desde', v_perfil.estado, 'hacia', p_hacia, 'at', v_ahora);
end $$;
revoke all on function public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb) to service_role;

-- 2. Borrado definitivo: el DELETE de auth.users arrastra perfil, sesiones y factores. Los triggers de perfiles
--    ven al actor (amo.actor_id de validar_actor) y registran BORRADO_DEFINITIVO con el snapshot mínimo (§5.3).
create function public.eliminar_usuario_srv(
  p_usuario_id uuid, p_actor_id uuid, p_session_id uuid, p_motivo text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_estado public.perfil_estado;
  v_prev_motivo text := current_setting('amo.motivo', true);
begin
  perform private.validar_actor(p_actor_id, 'usuarios.eliminar', p_session_id);
  if not exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id
                 where p.id = p_actor_id and r.clave = 'SUPERADMIN') then
    raise exception using errcode = 'P0001', message = 'AMO_SOLO_SUPERADMIN',
      detail = 'Solo un superadministrador puede eliminar cuentas definitivamente.';
  end if;
  if p_usuario_id = p_actor_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No puedes eliminar tu propia cuenta.';
  end if;
  select p.estado into v_estado from public.perfiles p where p.id = p_usuario_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El usuario no existe.';
  end if;
  if v_estado <> 'DESACTIVADO' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se eliminan definitivamente cuentas desactivadas. Desactívala primero.';
  end if;
  perform set_config('amo.motivo', coalesce(nullif(btrim(p_motivo), ''), ''), true);
  delete from auth.users u where u.id = p_usuario_id;
  perform set_config('amo.motivo', coalesce(v_prev_motivo, ''), true);
end $$;
revoke all on function public.eliminar_usuario_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.eliminar_usuario_srv(uuid, uuid, uuid, text) to service_role;

-- 3. SRF de administración de usuarios

-- Listado paginado en servidor. Búsqueda sin tildes (índices trigram de perfiles), filtros facetados y orden por
-- lista blanca. Sin estados explícitos oculta las cuentas DESACTIVADAS. Un desplazamiento fuera de rango se ajusta
-- a la última página (así `total` llega siempre y la interfaz corrige la URL).
create function public.listar_usuarios(
  p_busqueda text default null,
  p_estados public.perfil_estado[] default null,
  p_roles uuid[] default null,
  p_tipos public.rol_tipo[] default null,
  p_mfa boolean default null,
  p_orden text default 'creado',
  p_descendente boolean default true,
  p_limite integer default 20,
  p_desplazamiento integer default 0)
returns table (id uuid, nombre text, email text, avatar_path text, estado public.perfil_estado, rol_id uuid,
               rol_clave text, rol_nombre text, rol_color text, rol_tipo public.rol_tipo, mfa_activo boolean,
               ultimo_acceso_at timestamptz, invitado_at timestamptz, created_at timestamptz, total bigint)
language sql stable security definer set search_path = '' as $$
  with parametros as (
    select nullif(private.normalizar_texto(coalesce(p_busqueda, '')), '') as texto,
           replace(replace(replace(btrim(coalesce(p_busqueda, '')), '\', '\\'), '%', '\%'), '_', '\_') as patron,
           least(greatest(coalesce(p_limite, 20), 1), 100) as limite
  ), filtrados as (
    select p.id, p.nombre, p.email::text as email, p.avatar_path, p.estado, p.rol_id,
           r.clave as rol_clave, r.nombre as rol_nombre, r.color as rol_color, r.tipo as rol_tipo,
           exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') as mfa_activo,
           p.ultimo_acceso_at, u.invited_at as invitado_at, p.created_at
    from public.perfiles p
    left join public.roles r on r.id = p.rol_id
    left join auth.users u on u.id = p.id
    cross join parametros x
    where (select private.acceso_valido())
      and (select private.tiene_permiso('usuarios.ver'))
      and (x.texto is null
           or private.normalizar_texto(p.nombre) like '%' || x.texto || '%'
           or p.email::text ilike '%' || x.patron || '%')
      and (case when coalesce(cardinality(p_estados), 0) = 0 then p.estado <> 'DESACTIVADO'
                else p.estado = any (p_estados) end)
      and (coalesce(cardinality(p_roles), 0) = 0 or p.rol_id = any (p_roles))
      and (coalesce(cardinality(p_tipos), 0) = 0 or r.tipo = any (p_tipos))
  ), con_mfa as (
    select * from filtrados f where p_mfa is null or f.mfa_activo = p_mfa
  ), conteo as (
    select count(*) as total from con_mfa
  ), pagina as (
    select x.limite,
           case when c.total = 0 then 0
                else least(greatest(coalesce(p_desplazamiento, 0), 0), ((c.total - 1) / x.limite) * x.limite)
           end as desplazamiento
    from parametros x cross join conteo c
  )
  select m.id, m.nombre, m.email, m.avatar_path, m.estado, m.rol_id, m.rol_clave, m.rol_nombre, m.rol_color, m.rol_tipo,
         m.mfa_activo, m.ultimo_acceso_at, m.invitado_at, m.created_at, c.total
  from con_mfa m cross join conteo c
  order by
    case when p_orden = 'nombre' and not p_descendente then lower(coalesce(m.nombre, m.email)) end asc,
    case when p_orden = 'nombre' and p_descendente then lower(coalesce(m.nombre, m.email)) end desc,
    case when p_orden = 'email' and not p_descendente then m.email end asc,
    case when p_orden = 'email' and p_descendente then m.email end desc,
    case when p_orden = 'rol' and not p_descendente then m.rol_nombre end asc nulls last,
    case when p_orden = 'rol' and p_descendente then m.rol_nombre end desc nulls last,
    case when p_orden = 'estado' and not p_descendente then m.estado end asc,
    case when p_orden = 'estado' and p_descendente then m.estado end desc,
    case when p_orden = 'ultimo_acceso' and not p_descendente then m.ultimo_acceso_at end asc nulls last,
    case when p_orden = 'ultimo_acceso' and p_descendente then m.ultimo_acceso_at end desc nulls last,
    case when p_orden = 'creado' and not p_descendente then m.created_at end asc,
    m.created_at desc,
    m.id
  limit (select g.limite from pagina g)
  offset (select g.desplazamiento from pagina g)
$$;
revoke all on function public.listar_usuarios(text, public.perfil_estado[], uuid[], public.rol_tipo[], boolean, text, boolean,
  integer, integer) from public, anon, authenticated;
grant execute on function public.listar_usuarios(text, public.perfil_estado[], uuid[], public.rol_tipo[], boolean, text,
  boolean, integer, integer) to authenticated;

-- Indicadores del encabezado del módulo (una fila; ceros sin permiso).
create function public.resumen_usuarios()
returns table (total bigint, activos bigint, invitados bigint, suspendidos bigint, desactivados bigint,
               activos_con_mfa bigint)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where p.estado <> 'DESACTIVADO'),
         count(*) filter (where p.estado = 'ACTIVO'),
         count(*) filter (where p.estado = 'INVITADO'),
         count(*) filter (where p.estado = 'SUSPENDIDO'),
         count(*) filter (where p.estado = 'DESACTIVADO'),
         count(*) filter (where p.estado = 'ACTIVO'
                            and exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'))
  from public.perfiles p
  where (select private.acceso_valido()) and (select private.tiene_permiso('usuarios.ver'))
$$;
revoke all on function public.resumen_usuarios() from public, anon, authenticated;
grant execute on function public.resumen_usuarios() to authenticated;

-- Roles que el usuario actual puede asignar: la misma regla anti-escalada que private.puede_gestionar (§5.4) y
-- «solo SUPERADMIN asigna SUPERADMIN». La interfaz ofrece solo estos; el trigger guardián lo garantiza igual.
create function public.roles_asignables()
returns table (id uuid, clave text, nombre text, descripcion text, tipo public.rol_tipo, color text, requiere_mfa boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.clave, r.nombre, r.descripcion, r.tipo, r.color, r.requiere_mfa
  from public.roles r
  where (select private.acceso_valido())
    and ((select private.tiene_permiso('usuarios.invitar')) or (select private.tiene_permiso('usuarios.editar')))
    and (r.clave <> 'SUPERADMIN'
         or exists (select 1 from public.perfiles p join public.roles s on s.id = p.rol_id
                    where p.id = (select auth.uid()) and s.clave = 'SUPERADMIN'))
    and private.puede_gestionar((select auth.uid()), null, r.id)
  order by r.tipo, r.es_sistema desc, r.nombre
$$;
revoke all on function public.roles_asignables() from public, anon, authenticated;
grant execute on function public.roles_asignables() to authenticated;

-- Estado de seguridad de una cuenta (auth.users y factores): sin secretos ni tokens.
create function public.seguridad_usuario(p_usuario_id uuid)
returns table (email_confirmado_at timestamptz, ultimo_ingreso_at timestamptz, bloqueado_hasta timestamptz,
               invitado_at timestamptz, mfa_factores integer, mfa_activado_at timestamptz,
               mfa_ultimo_uso_at timestamptz, sesiones_activas integer)
language sql stable security definer set search_path = '' as $$
  select u.email_confirmed_at, u.last_sign_in_at, u.banned_until, u.invited_at,
         (select count(*)::integer from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
         (select min(f.created_at) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
         (select max(f.last_challenged_at) from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
         (select count(*)::integer from auth.sessions s
           where s.user_id = u.id and (s.not_after is null or s.not_after > now()))
  from auth.users u
  where u.id = p_usuario_id
    and (select private.acceso_valido())
    and (select private.tiene_permiso('usuarios.ver'))
$$;
revoke all on function public.seguridad_usuario(uuid) from public, anon, authenticated;
grant execute on function public.seguridad_usuario(uuid) to authenticated;

-- Sesiones abiertas de una cuenta. La IP solo se revela con accesos.ver (mismo criterio que la tabla accesos).
create function public.sesiones_usuario(p_usuario_id uuid)
returns table (id uuid, creada_at timestamptz, refrescada_at timestamptz, ultima_actividad_at timestamptz, aal text,
               user_agent text, ip inet)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at, s.refreshed_at at time zone 'UTC', a.ultima_actividad_at, s.aal::text,
         left(s.user_agent, 400),
         case when (select private.tiene_permiso('accesos.ver')) then s.ip end
  from auth.sessions s
  left join private.sesiones_actividad a on a.session_id = s.id and a.usuario_id = s.user_id
  where s.user_id = p_usuario_id
    and (s.not_after is null or s.not_after > now())
    and (select private.acceso_valido())
    and (select private.tiene_permiso('usuarios.ver'))
  order by coalesce(a.ultima_actividad_at, s.refreshed_at at time zone 'UTC', s.created_at) desc
  limit 50
$$;
revoke all on function public.sesiones_usuario(uuid) from public, anon, authenticated;
grant execute on function public.sesiones_usuario(uuid) to authenticated;

-- 4. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname like '%\_srv'
                       and has_function_privilege('authenticated', p.oid, 'execute')),
         'authenticated tiene EXECUTE sobre una RPC *_srv';
  assert has_function_privilege('service_role', 'public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb)', 'execute')
     and has_function_privilege('service_role', 'public.eliminar_usuario_srv(uuid, uuid, uuid, text)', 'execute'),
         'service_role debe poder ejecutar las RPC de gestión de usuarios';
  assert has_function_privilege('authenticated', 'public.listar_usuarios(text, public.perfil_estado[], uuid[], public.rol_tipo[], boolean, text, boolean, integer, integer)', 'execute')
     and has_function_privilege('authenticated', 'public.resumen_usuarios()', 'execute')
     and has_function_privilege('authenticated', 'public.roles_asignables()', 'execute')
     and has_function_privilege('authenticated', 'public.seguridad_usuario(uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.sesiones_usuario(uuid)', 'execute'),
         'authenticated debe poder ejecutar las SRF de usuarios';
end $$;
