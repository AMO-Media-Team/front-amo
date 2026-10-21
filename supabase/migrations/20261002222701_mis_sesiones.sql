-- Fase 4a, requisito 3: sesiones propias para «Mi cuenta» (docs/modelo-datos.md §5.5). Hasta ahora la página solo
-- podía listarlas con `sesiones_usuario`, que exige `usuarios.ver`: un anunciante, un medio o un rol interno sin ese
-- permiso no veía sus propias sesiones. `mis_sesiones()` es una SRF de visibilidad (definer: lee auth.sessions, que
-- PostgREST no expone) filtrada por `auth.uid()` y `acceso_valido()`. Devuelve las mismas columnas que
-- `sesiones_usuario` (el contrato que ya consume src/features/cuenta/queries.ts) con la IP enmascarada en la BD y
-- `es_actual` (la sesión del JWT). Nunca devuelve tokens ni la IP completa.

-- IP visible solo hasta la red: 181.51.23.4 → 181.51.•••.•••; IPv6, los dos primeros grupos (2800:e2:•••); una
-- IPv4 mapeada en IPv6 se trata como IPv4. La del propio equipo (127.0.0.0/8, ::1) no dice nada: null.
-- Mismo criterio que `enmascararIp` de src/features/cuenta/presentacion.ts (idempotente sobre este resultado).
create function private.enmascarar_ip(p_ip inet) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_ip is null or p_ip <<= inet '127.0.0.0/8' or p_ip = inet '::1' or p_ip <<= inet '::ffff:127.0.0.0/104' then null
    when family(p_ip) = 4 then
      split_part(host(p_ip), '.', 1) || '.' || split_part(host(p_ip), '.', 2) || '.•••.•••'
    when host(p_ip) ~ '^::ffff:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' then
      split_part(substr(host(p_ip), 8), '.', 1) || '.' || split_part(substr(host(p_ip), 8), '.', 2) || '.•••.•••'
    else array_to_string((array_remove(string_to_array(host(p_ip), ':'), ''))[1:2], ':') || ':•••'
  end $$;
-- Solo la usa la SRF definer (owner): sin EXECUTE para los roles de la API.
revoke all on function private.enmascarar_ip(inet) from public, anon, authenticated, service_role;

create function public.mis_sesiones()
returns table (id uuid, creada_at timestamptz, refrescada_at timestamptz, ultima_actividad_at timestamptz, aal text,
               user_agent text, ip text, es_actual boolean)
language sql stable security definer set search_path = '' as $$
  with actual as (select nullif((select auth.jwt()) ->> 'session_id', '')::uuid as sid)
  select s.id, s.created_at, s.refreshed_at at time zone 'UTC', a.ultima_actividad_at, s.aal::text,
         left(s.user_agent, 400), private.enmascarar_ip(s.ip), coalesce(s.id = actual.sid, false)
  from auth.sessions s
  cross join actual
  left join private.sesiones_actividad a on a.session_id = s.id and a.usuario_id = s.user_id
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
    and (select private.acceso_valido())
  order by coalesce(s.id = actual.sid, false) desc,
           coalesce(a.ultima_actividad_at, s.refreshed_at at time zone 'UTC', s.created_at) desc
  limit 50
$$;
revoke all on function public.mis_sesiones() from public, anon, authenticated;
grant execute on function public.mis_sesiones() to authenticated;

do $$ begin
  assert private.enmascarar_ip('181.51.23.4') = '181.51.•••.•••'
     and private.enmascarar_ip('10.0.0.1/32') = '10.0.•••.•••'
     and private.enmascarar_ip('2800:e2:1a80::5d1') = '2800:e2:•••'
     and private.enmascarar_ip('::ffff:181.51.23.4') = '181.51.•••.•••'
     and private.enmascarar_ip('127.0.0.1') is null and private.enmascarar_ip('::1') is null
     and private.enmascarar_ip(null) is null,
         'enmascarar_ip no enmascara como se espera';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert has_function_privilege('authenticated', 'public.mis_sesiones()', 'execute')
     and not has_function_privilege('service_role', 'private.enmascarar_ip(inet)', 'execute'),
         'grants de mis_sesiones / enmascarar_ip incorrectos';
  assert exists (select 1 from pg_proc p where p.oid = 'public.mis_sesiones()'::regprocedure and p.prosecdef
                   and p.provolatile = 's' and 'search_path=""' = any(p.proconfig)),
         'mis_sesiones debe ser definer, STABLE y con search_path vacío';
end $$;
