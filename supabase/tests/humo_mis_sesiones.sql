-- Pruebas de humo de `mis_sesiones` (public.mis_sesiones, docs/modelo-datos.md §5.5): cada persona ve solo sus
-- sesiones vivas (aunque su rol no tenga usuarios.ver), con la IP enmascarada, el agente recortado, la sesión del
-- JWT marcada y primero; sin acceso válido (cuenta suspendida, AAL insuficiente, sesión revocada) no devuelve nada.
-- Se ejecuta como owner (MCP execute_sql o psql) en una transacción que SIEMPRE se revierte.
-- Cada prueba deja `true` si pasa o lo observado.
begin;

create function pg_temp.como(p_uid uuid, p_sid uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'session_id', p_sid)::text, true);
  execute 'set local role authenticated';
end $$;
-- Se vuelve a llamar con el rol authenticated ya activo.
grant execute on function pg_temp.como(uuid, uuid, text) to authenticated;

do $humo$
declare
  r jsonb := '{}';
  v_j jsonb;
  v_n bigint;
  u_a constant uuid := '00000000-0000-4000-a000-000000000f01';     -- anunciante con dos sesiones vivas y una expirada
  u_b constant uuid := '00000000-0000-4000-a000-000000000f02';     -- otro anunciante
  u_sus constant uuid := '00000000-0000-4000-a000-000000000f03';   -- anunciante suspendido
  u_adm constant uuid := '00000000-0000-4000-a000-000000000f04';   -- administrador a aal1 (su rol exige aal2)
  s_a1 constant uuid := '00000000-0000-4000-b000-000000000f01';    -- la sesión del JWT (dentro del tope de inactividad)
  s_a2 constant uuid := '00000000-0000-4000-b000-000000000f02';    -- otro dispositivo, con actividad reciente
  s_a3 constant uuid := '00000000-0000-4000-b000-000000000f03';    -- expirada
  s_b1 constant uuid := '00000000-0000-4000-b000-000000000f04';
  s_sus constant uuid := '00000000-0000-4000-b000-000000000f05';
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000f06';
  s_rev constant uuid := '00000000-0000-4000-b000-000000000f0f';   -- revocada: no existe en auth.sessions
  v_anunciante uuid := (select id from public.anunciantes order by created_at limit 1);
  v_fn constant text := 'public.mis_sesiones()';
begin
  -- ── Preparación (owner, modo_carga) ─────────────────────────────────────────────────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_a, 'humoms.a@amo.test'), (u_b, 'humoms.b@amo.test'), (u_sus, 'humoms.sus@amo.test'),
               (u_adm, 'humoms.adm@amo.test')) x (u, e);
  update public.perfiles p set rol_id = (select id from public.roles where clave = x.rol), estado = x.estado::public.perfil_estado,
         debe_cambiar_password = false, anunciante_id = case when x.rol = 'ANUNCIANTE' then v_anunciante end
  from (values (u_a, 'ANUNCIANTE', 'ACTIVO'), (u_b, 'ANUNCIANTE', 'ACTIVO'), (u_sus, 'ANUNCIANTE', 'SUSPENDIDO'),
               (u_adm, 'ADMIN', 'ACTIVO')) as x (id, rol, estado)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal, not_after, refreshed_at, user_agent, ip) values
    (s_a1, u_a, now() - interval '20 minutes', now(), 'aal1', null, null, 'Navegador/1', '181.51.23.4'),
    (s_a2, u_a, now() - interval '1 hour', now(), 'aal1', null, (now() - interval '30 minutes') at time zone 'UTC',
     repeat('x', 500), '2800:e2:1a80::5d1'),
    (s_a3, u_a, now() - interval '2 days', now(), 'aal1', now() - interval '1 minute', null, 'Expirada/1', '190.0.0.1'),
    (s_b1, u_b, now(), now(), 'aal1', null, null, 'Otro/1', '200.1.2.3'),
    (s_sus, u_sus, now(), now(), 'aal1', null, null, 'Suspendida/1', '200.1.2.4'),
    (s_adm1, u_adm, now(), now(), 'aal1', null, null, 'Admin/1', '127.0.0.1');
  insert into private.sesiones_actividad (session_id, usuario_id, ultima_actividad_at)
  values (s_a2, u_a, now() - interval '5 minutes');
  perform set_config('amo.modo_carga', '', true);

  -- ── (a) Sesiones propias de un rol sin usuarios.ver ─────────────────────────────────────────────────
  perform pg_temp.como(u_a, s_a1);
  select jsonb_agg(to_jsonb(s) order by s.ordinality) into v_j from public.mis_sesiones() with ordinality s;
  r := r || jsonb_build_object('a01_solo_las_vivas_y_propias',
    jsonb_array_length(v_j) = 2 and (v_j -> 0 ->> 'id')::uuid = s_a1 and (v_j -> 1 ->> 'id')::uuid = s_a2);
  r := r || jsonb_build_object('a02_formato',
    (select array_agg(x order by x) from jsonb_object_keys(v_j -> 0) x)
      = array['aal', 'creada_at', 'es_actual', 'id', 'ip', 'ordinality', 'refrescada_at', 'ultima_actividad_at', 'user_agent']);
  r := r || jsonb_build_object('a03_sesion_actual_marcada_y_primera',
    (v_j -> 0 ->> 'es_actual')::boolean and not (v_j -> 1 ->> 'es_actual')::boolean and v_j -> 0 ->> 'aal' = 'aal1');
  r := r || jsonb_build_object('a04_ip_enmascarada',
    v_j -> 0 ->> 'ip' = '181.51.•••.•••' and v_j -> 1 ->> 'ip' = '2800:e2:•••' and v_j::text not like '%181.51.23.4%'
    and v_j::text not like '%1a80%');
  r := r || jsonb_build_object('a05_agente_recortado', v_j -> 0 ->> 'user_agent' = 'Navegador/1'
    and char_length(v_j -> 1 ->> 'user_agent') = 400);
  r := r || jsonb_build_object('a06_actividad_y_refresco',
    v_j -> 0 -> 'ultima_actividad_at' = 'null'::jsonb and v_j -> 0 -> 'refrescada_at' = 'null'::jsonb
    and (v_j -> 1 ->> 'ultima_actividad_at')::timestamptz = now() - interval '5 minutes'
    and (v_j -> 1 ->> 'refrescada_at')::timestamptz = now() - interval '30 minutes'
    and (v_j -> 0 ->> 'creada_at')::timestamptz = now() - interval '20 minutes');
  -- Desde el otro dispositivo la sesión actual cambia y sigue siendo la primera.
  perform pg_temp.como(u_a, s_a2);
  r := r || jsonb_build_object('a07_actual_segun_el_jwt',
    (select array_agg(s.id order by s.ordinality) = array[s_a2, s_a1] and bool_or(s.es_actual and s.id = s_a2)
            and count(*) filter (where s.es_actual) = 1
     from public.mis_sesiones() with ordinality s));

  -- ── (b) Aislamiento y acceso válido ─────────────────────────────────────────────────────────────────
  perform pg_temp.como(u_b, s_b1);
  r := r || jsonb_build_object('b01_otra_persona_solo_ve_las_suyas',
    (select count(*) = 1 and bool_and(s.id = s_b1 and s.ip = '200.1.•••.•••') from public.mis_sesiones() s));
  perform pg_temp.como(u_sus, s_sus);
  select count(*) into v_n from public.mis_sesiones();
  r := r || jsonb_build_object('b02_cuenta_suspendida_sin_filas', case when v_n = 0 then 'true'::jsonb else to_jsonb(v_n) end);
  perform pg_temp.como(u_adm, s_adm1);
  select count(*) into v_n from public.mis_sesiones();
  r := r || jsonb_build_object('b03_aal_insuficiente_sin_filas', case when v_n = 0 then 'true'::jsonb else to_jsonb(v_n) end);
  perform pg_temp.como(u_a, s_rev);
  select count(*) into v_n from public.mis_sesiones();
  r := r || jsonb_build_object('b04_sesion_revocada_sin_filas', case when v_n = 0 then 'true'::jsonb else to_jsonb(v_n) end);
  perform pg_temp.como(u_a, s_a3);
  select count(*) into v_n from public.mis_sesiones();
  r := r || jsonb_build_object('b05_sesion_expirada_sin_filas', case when v_n = 0 then 'true'::jsonb else to_jsonb(v_n) end);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.mis_sesiones();
  r := r || jsonb_build_object('b06_sin_jwt_sin_filas', case when v_n = 0 then 'true'::jsonb else to_jsonb(v_n) end);

  -- ── (c) Seguridad de las funciones ──────────────────────────────────────────────────────────────────
  execute 'reset role';
  r := r || jsonb_build_object('c01_definer_stable_solo_authenticated',
    has_function_privilege('authenticated', v_fn, 'execute') and not has_function_privilege('anon', v_fn, 'execute')
    and (select p.prosecdef and p.provolatile = 's' and 'search_path=""' = any(p.proconfig)
         from pg_proc p where p.oid = v_fn::regprocedure));
  r := r || jsonb_build_object('c02_enmascarar_ip_sin_execute_para_la_api',
    not has_function_privilege('authenticated', 'private.enmascarar_ip(inet)', 'execute')
    and not has_function_privilege('service_role', 'private.enmascarar_ip(inet)', 'execute')
    and private.enmascarar_ip('::ffff:181.51.23.4') = '181.51.•••.•••' and private.enmascarar_ip('127.0.0.1') is null);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
