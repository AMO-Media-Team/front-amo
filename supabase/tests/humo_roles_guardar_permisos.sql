-- Pruebas de humo de `roles_guardar_permisos` (public.guardar_permisos_rol_srv, docs/modelo-datos.md §5.4): guardado
-- de la matriz en una sola llamada, idempotencia, auditoría con el actor y cada guarda (actor y sesión, rol
-- inexistente, de sistema o propio, catálogo, anti-escalada y permiso no aplicable) sin dejar cambios parciales.
-- Se ejecuta como owner (MCP execute_sql o psql) en una transacción que SIEMPRE se revierte; las llamadas se hacen
-- con el rol service_role, como el servidor. Limitación conocida: en MCP `session_user` es `postgres`, así que el
-- trigger de respaldo trg_rol_permisos_a_guardar exceptúa al owner; aquí se prueban las guardas de la función.
-- Cada prueba deja `true` si pasa o lo observado.
begin;

-- Resultado de una llamada: 'agregados,quitados' o el código de error con su hint.
create function pg_temp.intento(p_rol uuid, p_agregar text[], p_quitar text[], p_actor uuid, p_sesion uuid) returns text
language plpgsql as $$
declare v_a integer; v_q integer; v_hint text;
begin
  select g.agregados, g.quitados into v_a, v_q
  from public.guardar_permisos_rol_srv(p_rol, p_agregar, p_quitar, p_actor, p_sesion) g;
  return v_a || ',' || v_q;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return sqlerrm || case when coalesce(v_hint, '') = '' then '' else ':' || v_hint end;
end $$;
grant execute on function pg_temp.intento(uuid, text[], text[], uuid, uuid) to authenticated, service_role;

do $humo$
declare
  r jsonb := '{}';
  v_t text;
  v_fn constant text := 'public.guardar_permisos_rol_srv(uuid, text[], text[], uuid, uuid)';
  u_sup constant uuid := '00000000-0000-4000-a000-000000000e01';
  u_adm constant uuid := '00000000-0000-4000-a000-000000000e02';
  u_ges constant uuid := '00000000-0000-4000-a000-000000000e03';   -- rol personalizado con roles.gestionar
  s_sup constant uuid := '00000000-0000-4000-b000-000000000e01';
  s_sup1 constant uuid := '00000000-0000-4000-b000-000000000e11';  -- SUPERADMIN a aal1
  s_adm constant uuid := '00000000-0000-4000-b000-000000000e02';
  s_ges constant uuid := '00000000-0000-4000-b000-000000000e03';
  r_int constant uuid := '00000000-0000-4000-a000-00000000e0f1';   -- personalizado interno
  r_ext constant uuid := '00000000-0000-4000-a000-00000000e0f2';   -- personalizado de anunciante
  r_ges constant uuid := '00000000-0000-4000-a000-00000000e0f3';   -- el rol de u_ges
  r_sis uuid := (select id from public.roles where clave = 'ADMIN');
begin
  -- ── Preparación (owner, modo_carga) ─────────────────────────────────────────────────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_sup, 'humogp.sup@amo.test'), (u_adm, 'humogp.adm@amo.test'), (u_ges, 'humogp.ges@amo.test')) x (u, e);
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa) values
    (r_int, 'PRUEBA_GP_INT', 'Prueba interno', 'ADMIN', true), (r_ext, 'PRUEBA_GP_EXT', 'Prueba externo', 'ANUNCIANTE', false),
    (r_ges, 'PRUEBA_GP_GES', 'Prueba gestor', 'ADMIN', true);
  insert into public.rol_permisos (rol_id, permiso_clave) values
    (r_int, 'usuarios.ver'), (r_int, 'campanas.ver'),
    (r_ges, 'roles.gestionar'), (r_ges, 'roles.ver'), (r_ges, 'usuarios.ver');
  update public.perfiles p set rol_id = x.rol, estado = 'ACTIVO', debe_cambiar_password = false
  from (values (u_sup, (select id from public.roles where clave = 'SUPERADMIN')), (u_adm, r_sis), (u_ges, r_ges)) as x (id, rol)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_sup, u_sup, now(), now(), 'aal2'), (s_sup1, u_sup, now(), now(), 'aal1'), (s_adm, u_adm, now(), now(), 'aal2'),
    (s_ges, u_ges, now(), now(), 'aal2');
  perform set_config('amo.modo_carga', '', true);
  execute 'set local role service_role';

  -- ── (a) Guardado, idempotencia y auditoría ──────────────────────────────────────────────────────────
  v_t := pg_temp.intento(r_int, array['medios.ver', 'anunciantes.ver'], array['campanas.ver'], u_sup, s_sup);
  r := r || jsonb_build_object('a01_otorga_y_retira_en_una_llamada', case when v_t = '2,1' then 'true'::jsonb else to_jsonb(v_t) end);
  select string_agg(rp.permiso_clave, ',' order by rp.permiso_clave) into v_t from public.rol_permisos rp where rp.rol_id = r_int;
  r := r || jsonb_build_object('a02_matriz_resultante',
    v_t = 'anunciantes.ver,medios.ver,usuarios.ver'
    and (select rp.otorgado_por = u_sup from public.rol_permisos rp where rp.rol_id = r_int and rp.permiso_clave = 'medios.ver'));
  v_t := pg_temp.intento(r_int, array['medios.ver', 'anunciantes.ver'], array['campanas.ver'], u_sup, s_sup);
  r := r || jsonb_build_object('a03_idempotente', case when v_t = '0,0' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_int, array['ofertas.ver', 'ofertas.ver', null], null, u_sup, s_sup) || ' '
      || pg_temp.intento(r_int, null, null, u_sup, s_sup);
  r := r || jsonb_build_object('a04_duplicados_y_nulos', case when v_t = '1,0 0,0' then 'true'::jsonb else to_jsonb(v_t) end);
  select string_agg(x.accion || '=' || x.n, ',' order by x.accion) into v_t
  from (select b.accion, count(*) as n from public.bitacora b
        where b.entidad = 'rol_permisos' and b.entidad_id = r_int::text and b.actor_id = u_sup group by b.accion) x;
  r := r || jsonb_build_object('a05_auditoria_con_el_actor', case when v_t = 'DELETE=1,INSERT=3' then 'true'::jsonb else to_jsonb(v_t) end);

  -- ── (b) Guardas: nada se escribe cuando alguna falla ────────────────────────────────────────────────
  v_t := pg_temp.intento(r_sis, array['usuarios.ver'], null, u_sup, s_sup);
  r := r || jsonb_build_object('b01_rol_de_sistema', case when v_t = 'AMO_ROL_SISTEMA' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_ges, null, array['usuarios.ver'], u_ges, s_ges);
  r := r || jsonb_build_object('b02_rol_propio', case when v_t = 'AMO_ROL_PROPIO' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_int, array['pagos.registrar'], array['usuarios.ver'], u_ges, s_ges);
  r := r || jsonb_build_object('b03_escalada_al_otorgar_sin_cambios_parciales',
    v_t = 'AMO_ESCALADA_PERMISOS:pagos.registrar'
    and exists (select 1 from public.rol_permisos rp where rp.rol_id = r_int and rp.permiso_clave = 'usuarios.ver')
    and not exists (select 1 from public.rol_permisos rp where rp.rol_id = r_int and rp.permiso_clave = 'pagos.registrar'));
  v_t := pg_temp.intento(r_int, null, array['medios.ver'], u_ges, s_ges);
  r := r || jsonb_build_object('b04_escalada_al_retirar', case when v_t = 'AMO_ESCALADA_PERMISOS:medios.ver' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_int, null, array['usuarios.ver'], u_ges, s_ges) || ' '
      || pg_temp.intento(r_int, array['usuarios.ver'], null, u_ges, s_ges);
  r := r || jsonb_build_object('b05_gestor_dentro_de_su_alcance',
    v_t = '0,1 1,0'
    and (select rp.otorgado_por = u_ges from public.rol_permisos rp where rp.rol_id = r_int and rp.permiso_clave = 'usuarios.ver'));
  v_t := pg_temp.intento(r_ext, array['campanas.gestionar_propias', 'usuarios.ver'], null, u_sup, s_sup);
  r := r || jsonb_build_object('b06_permiso_no_aplicable_sin_cambios_parciales',
    v_t = 'AMO_PERMISO_NO_APLICABLE:usuarios.ver'
    and not exists (select 1 from public.rol_permisos rp where rp.rol_id = r_ext));
  v_t := pg_temp.intento(r_ext, array['campanas.gestionar_propias'], null, u_sup, s_sup);
  r := r || jsonb_build_object('b07_permiso_aplicable_al_rol_externo', case when v_t = '1,0' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_int, array['usuarios.ver'], null, u_adm, s_adm);
  r := r || jsonb_build_object('b08_sin_roles_gestionar', case when v_t = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_int, array['disputas.ver'], null, u_sup, s_sup1) || ' '
      || pg_temp.intento(r_int, array['disputas.ver'], null, u_sup, s_ges) || ' '
      || pg_temp.intento(r_int, array['disputas.ver'], null, u_sup, null) || ' '
      || pg_temp.intento(r_int, array['disputas.ver'], null, null, s_sup);
  r := r || jsonb_build_object('b09_sesion_o_actor_invalidos',
    case when v_t = 'AMO_NO_AUTORIZADO AMO_NO_AUTORIZADO AMO_NO_AUTORIZADO AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento('00000000-0000-4000-a000-00000000e0ff', array['usuarios.ver'], null, u_sup, s_sup) || ' '
      || pg_temp.intento(null, array['usuarios.ver'], null, u_sup, s_sup);
  r := r || jsonb_build_object('b10_rol_inexistente',
    case when v_t = 'AMO_CONFIG_INVALIDA AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_t) end);
  v_t := pg_temp.intento(r_int, array['no.existe'], null, u_sup, s_sup) || ' '
      || pg_temp.intento(r_int, null, array['tampoco.existe'], u_sup, s_sup) || ' '
      || pg_temp.intento(r_int, array['disputas.ver', 'medios.ver'], array['medios.ver'], u_sup, s_sup);
  r := r || jsonb_build_object('b11_catalogo_y_solapamiento',
    case when v_t = 'AMO_CONFIG_INVALIDA:no.existe AMO_CONFIG_INVALIDA:tampoco.existe AMO_CONFIG_INVALIDA:medios.ver'
         then 'true'::jsonb else to_jsonb(v_t) end);
  select string_agg(rp.permiso_clave, ',' order by rp.permiso_clave) into v_t from public.rol_permisos rp where rp.rol_id = r_int;
  r := r || jsonb_build_object('b12_matriz_intacta_tras_los_rechazos',
    case when v_t = 'anunciantes.ver,medios.ver,ofertas.ver,usuarios.ver' then 'true'::jsonb else to_jsonb(v_t) end);

  -- ── (c) Solo el servidor la ejecuta ─────────────────────────────────────────────────────────────────
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_sup, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_sup)::text, true);
  execute 'set local role authenticated';
  v_t := pg_temp.intento(r_int, array['disputas.ver'], null, u_sup, s_sup);
  execute 'reset role';
  r := r || jsonb_build_object('c01_authenticated_no_la_ejecuta',
    case when v_t like 'permission denied for function guardar_permisos_rol_srv%' then 'true'::jsonb else to_jsonb(v_t) end);
  r := r || jsonb_build_object('c02_definer_solo_service_role',
    has_function_privilege('service_role', v_fn, 'execute') and not has_function_privilege('authenticated', v_fn, 'execute')
    and not has_function_privilege('anon', v_fn, 'execute')
    and (select p.prosecdef and p.provolatile = 'v' and 'search_path=""' = any(p.proconfig)
         from pg_proc p where p.oid = v_fn::regprocedure));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
