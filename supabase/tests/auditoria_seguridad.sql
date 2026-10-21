-- Auditoría de seguridad de la fase 1 (M1–M4 + gestión de usuarios). Regresión de lo verificado:
-- procedencia falsificada desde el navegador, SRF definer sin permiso, grants, esquemas no expuestos y
-- cuentas no invitadas. Se ejecuta como owner (MCP execute_sql o psql) en una transacción que SIEMPRE se
-- revierte. Cada prueba deja `true` si pasa o un texto con lo observado si falla.
begin;

do $auditoria$
declare
  r jsonb := '{}';
  v_n bigint;
  v_b boolean;
  v_t text;
  v_ids bigint[];
  u_anu constant uuid := '00000000-0000-4000-a000-0000000000a1';   -- ANUNCIANTE ACTIVO (sin MFA)
  u_adm constant uuid := '00000000-0000-4000-a000-0000000000a2';   -- ADMIN ACTIVO
  u_ops constant uuid := '00000000-0000-4000-a000-0000000000a3';   -- OPERACIONES ACTIVO (usuarios.ver sin accesos.ver)
  u_ext constant uuid := '00000000-0000-4000-a000-0000000000a4';   -- registro directo en Auth: INVITADO sin rol
  s_anu constant uuid := '00000000-0000-4000-b000-0000000000a1';
  s_adm1 constant uuid := '00000000-0000-4000-b000-0000000000a2';  -- aal1: su rol exige MFA
  s_adm2 constant uuid := '00000000-0000-4000-b000-0000000000a3';  -- aal2
  s_ops constant uuid := '00000000-0000-4000-b000-0000000000a4';   -- aal2
  c_anu text; c_adm1 text; c_ops text;
  -- Lo que un navegador puede enviar a PostgREST: secreto equivocado y actor/IP/UA inventados.
  h_falsos constant text := jsonb_build_object(
    'x-amo-srv', 'secreto-inventado', 'x-amo-actor', '00000000-0000-4000-a000-0000000000a2',
    'x-amo-ip', '203.0.113.9', 'x-amo-pais', 'US', 'x-amo-ciudad', 'Falsa', 'x-amo-ua', 'Falso/1.0')::text;
begin
  -- ── Preparación (owner) ──────────────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u_anu, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditoria.anunciante@amo.test', now(), now(), now()),
         (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditoria.admin@amo.test', now(), now(), now()),
         (u_ops, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditoria.ops@amo.test', now(), now(), now()),
         (u_ext, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auditoria.externo@amo.test', null, now(), now());
  -- Organización propia (desde negocio_actores perfiles.anunciante_id es FK): sin otros miembros (s6).
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo)
  values ('00000000-0000-4000-c000-0000000000a1', 'Auditoría S.A.S.', 'Auditoría', '900000201', '1',
          (select id from public.sectores where nombre_normalizado = 'retail y comercio'), '11001');
  -- Desde M7 el estado de un perfil solo cambia por aplicar_transicion: la preparación (owner) lo simula.
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'),
         anunciante_id = '00000000-0000-4000-c000-0000000000a1', estado = 'ACTIVO', debe_cambiar_password = false
   where id = u_anu;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'),
         estado = 'ACTIVO', debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'OPERACIONES'),
         estado = 'ACTIVO', debe_cambiar_password = false where id = u_ops;
  perform set_config('amo.transicion_autorizada', '', true);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal, ip, user_agent)
  values (s_anu, u_anu, now(), now(), 'aal1', '198.51.100.7', 'Navegador/1'),
         (s_adm1, u_adm, now(), now(), 'aal1', '198.51.100.8', 'Navegador/1'),
         (s_adm2, u_adm, now(), now(), 'aal2', '198.51.100.8', 'Navegador/1'),
         (s_ops, u_ops, now(), now(), 'aal2', '198.51.100.9', 'Navegador/1');
  c_anu := jsonb_build_object('sub', u_anu, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anu)::text;
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_ops := jsonb_build_object('sub', u_ops, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_ops)::text;

  -- ── (p) Procedencia: cabeceras x-amo-* falsificadas desde el navegador ───────────────────────────
  perform set_config('request.jwt.claims', c_anu, true);
  perform set_config('request.headers', h_falsos, true);
  perform set_config('amo.ctx_confiable', '', true);                 -- caché por transacción: nueva "solicitud"
  execute 'set local role authenticated';
  select private.contexto_confiable() into v_b;                       r := r || jsonb_build_object('p1_secreto_falso_no_es_confiable', v_b = false);
  select private.actor_id() = u_anu into v_b;                         r := r || jsonb_build_object('p2_actor_es_el_del_jwt_no_la_cabecera', v_b);
  update public.perfiles set nombre = 'Nombre Auditoría' where id = u_anu;
  get diagnostics v_n = row_count;                                    r := r || jsonb_build_object('p3_actualiza_su_nombre', v_n = 1);
  begin
    update public.perfiles set estado = 'SUSPENDIDO' where id = u_anu;
    r := r || jsonb_build_object('p4_no_escribe_columnas_protegidas', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('p4_no_escribe_columnas_protegidas', true);
  end;
  update public.perfiles set nombre = 'Intento Ajeno' where id = u_adm;
  get diagnostics v_n = row_count;                                    r := r || jsonb_build_object('p5_no_actualiza_perfiles_ajenos', v_n = 0);
  execute 'reset role';
  perform set_config('request.headers', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.ctx_confiable', '', true);

  select count(*) into v_n from public.bitacora
   where entidad = 'perfiles' and entidad_id = u_anu::text and accion = 'UPDATE'
     and origen = 'API_DIRECTA' and actor_id = u_anu
     and ip is null and pais_iso2 is null and ciudad is null and user_agent is null;
  r := r || jsonb_build_object('p6_bitacora_api_directa_sin_ip_ni_ua', v_n = 1);

  -- ── (s) SRF security definer: sin permiso o sin sesión válida no devuelven nada ───────────────────
  perform set_config('request.jwt.claims', c_anu, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.listar_usuarios();             r := r || jsonb_build_object('s1_anunciante_listar_usuarios_vacio', v_n = 0);
  select total into v_n from public.resumen_usuarios();                r := r || jsonb_build_object('s2_anunciante_resumen_en_cero', v_n = 0);
  select count(*) into v_n from public.seguridad_usuario(u_adm);      r := r || jsonb_build_object('s3_anunciante_seguridad_ajena_vacia', v_n = 0);
  select count(*) into v_n from public.sesiones_usuario(u_adm);       r := r || jsonb_build_object('s4_anunciante_sesiones_ajenas_vacias', v_n = 0);
  select count(*) into v_n from public.roles_asignables();            r := r || jsonb_build_object('s5_anunciante_sin_roles_asignables', v_n = 0);
  select count(*) into v_n from public.miembros_organizacion() where id <> u_anu;
                                                                      r := r || jsonb_build_object('s6_anunciante_sin_miembros_de_otras_org', v_n = 0);
  select count(*) into v_n from public.perfiles;                      r := r || jsonb_build_object('s7_anunciante_solo_su_perfil', v_n = 1);
  select count(*) into v_n from public.accesos where usuario_id <> u_anu;
                                                                      r := r || jsonb_build_object('s8_anunciante_sin_accesos_ajenos', v_n = 0);
  select coalesce(array_agg(m.id), '{}') into v_ids from public.mi_actividad(200, null) m;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- Se comprueba como owner: el anunciante no puede leer la bitácora directamente.
  select count(*) into v_n from public.bitacora b where b.id = any (v_ids) and b.actor_id is distinct from u_anu;
  r := r || jsonb_build_object('s9_mi_actividad_solo_propia', cardinality(v_ids) >= 1 and v_n = 0);

  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.listar_usuarios();             r := r || jsonb_build_object('s10_admin_aal1_listar_usuarios_vacio', v_n = 0);
  select count(*) into v_n from public.seguridad_usuario(u_anu);      r := r || jsonb_build_object('s11_admin_aal1_seguridad_vacia', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  perform set_config('request.jwt.claims', c_ops, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.sesiones_usuario(u_adm);       r := r || jsonb_build_object('s12_ops_ve_sesiones', v_n = 2);
  select count(*) into v_n from public.sesiones_usuario(u_adm) where ip is not null;
                                                                      r := r || jsonb_build_object('s13_ops_sin_accesos_ver_no_ve_ip', v_n = 0);
  select count(*) into v_n from public.roles_asignables();            r := r || jsonb_build_object('s14_ops_sin_permiso_de_gestion_no_asigna', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (g) Grants y exposición ──────────────────────────────────────────────────────────────────────
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute');
  r := r || jsonb_build_object('g1_anon_sin_execute', v_n = 0);
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like '%\_srv' and has_function_privilege('authenticated', p.oid, 'execute');
  r := r || jsonb_build_object('g2_authenticated_sin_execute_srv', v_n = 0);
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false);
  r := r || jsonb_build_object('g3_definer_con_search_path_vacio', v_n = 0);
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  r := r || jsonb_build_object('g4_rls_en_toda_tabla_public', v_n = 0);
  select count(*) into v_n from pg_policies where schemaname = 'public' and not roles <@ array['authenticated']::name[];
  r := r || jsonb_build_object('g5_politicas_solo_authenticated', v_n = 0);
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, 'select, insert, update, delete');
  r := r || jsonb_build_object('g6_anon_sin_tablas', v_n = 0);
  -- Las tablas de private no tienen RLS (el advisor lo marca), pero tampoco grants ni esquema expuesto.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select, insert, update, delete')
       or has_table_privilege('authenticated', c.oid, 'select, insert, update, delete')
       or has_table_privilege('service_role', c.oid, 'select, insert, update, delete'));
  r := r || jsonb_build_object('g7_tablas_private_sin_grants', v_n = 0);
  select not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select')
     and not has_table_privilege('anon', 'vault.decrypted_secrets', 'select') into v_b;
  r := r || jsonb_build_object('g8_vault_inaccesible_para_api', v_b);
  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'perfiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'
     and column_name not in ('nombre', 'celular', 'preferencias', 'avatar_path');
  r := r || jsonb_build_object('g9_perfiles_update_solo_columnas_propias', v_n = 0);

  perform set_config('request.jwt.claims', c_anu, true);
  execute 'set local role authenticated';
  begin
    perform public.tocar_sesion_srv(u_anu, s_anu);
    r := r || jsonb_build_object('g10_authenticated_no_llama_srv', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('g10_authenticated_no_llama_srv', true);
  end;
  begin
    perform 1 from private.sesiones_actividad limit 1;
    r := r || jsonb_build_object('g11_authenticated_no_lee_private', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('g11_authenticated_no_lee_private', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (c) Cuenta que no nació de una invitación (registro directo en Auth) ──────────────────────────
  select estado = 'INVITADO' and rol_id is null and invitado_por is null into v_b from public.perfiles where id = u_ext;
  r := r || jsonb_build_object('c1_registro_externo_queda_invitado_sin_rol', v_b);
  begin
    perform public.activar_perfil_srv(u_ext);
    r := r || jsonb_build_object('c2_sin_correo_confirmado_no_activa', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c2_sin_correo_confirmado_no_activa', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  update auth.users set email_confirmed_at = now() where id = u_ext;
  perform public.activar_perfil_srv(u_ext);
  select estado::text into v_t from public.perfiles where id = u_ext;
  r := r || jsonb_build_object('c3_confirmado_pero_sin_rol_sigue_invitado', v_t = 'INVITADO');
  begin
    perform public.transicionar_srv('perfiles', u_ext, 'ACTIVO', u_adm, s_adm2, null, '{}');
    r := r || jsonb_build_object('c4_admin_no_activa_cuenta_sin_rol', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c4_admin_no_activa_cuenta_sin_rol', sqlerrm = 'perfiles_rol_organizacion_chk');
  end;

  perform set_config('auditoria.resultado', r::text, true);
end
$auditoria$;

-- Resumen (detalle: select key, value from jsonb_each(current_setting('auditoria.resultado')::jsonb)).
select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('auditoria.resultado')::jsonb);

rollback;
