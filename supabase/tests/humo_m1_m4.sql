-- Pruebas de humo de las migraciones 1–4 (extensiones_y_esquemas, geo, identidad_rbac, bitacora_accesos).
-- Se ejecutan como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
-- Cada prueba deja en el resultado `true` si pasa o un texto con lo observado si falla.
--
-- Limitación conocida: en este canal session_user = 'postgres', así que las guardas que exceptúan al owner
-- (rol de sistema inmutable, actor desconocido en perfiles) se prueban por PostgREST con la secret key
-- (session_user = authenticator); ver el informe de la pista de BD.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_n bigint;
  v_b boolean;
  v_t text;
  v_j jsonb;
  -- Usuarios y sesiones de prueba (solo existen dentro de esta transacción).
  u_inv constant uuid := '00000000-0000-4000-a000-000000000001';   -- INVITADO con rol ADMIN asignado
  u_adm constant uuid := '00000000-0000-4000-a000-000000000002';   -- ADMIN ACTIVO
  u_sup constant uuid := '00000000-0000-4000-a000-000000000003';   -- SUPERADMIN ACTIVO
  s_inv constant uuid := '00000000-0000-4000-b000-000000000001';   -- sesión aal1 del invitado
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000002';  -- sesión aal1 del admin
  s_adm2 constant uuid := '00000000-0000-4000-b000-000000000003';  -- sesión aal2 del admin
  s_sup constant uuid := '00000000-0000-4000-b000-000000000004';   -- sesión aal2 del superadmin
  s_vieja constant uuid := '00000000-0000-4000-b000-000000000005'; -- sesión aal2 del admin, 31 min sin actividad
  s_falsa constant uuid := '00000000-0000-4000-b000-0000000000ff'; -- no existe en auth.sessions
  v_rol_admin uuid := (select id from public.roles where clave = 'ADMIN');
  v_rol_super uuid := (select id from public.roles where clave = 'SUPERADMIN');
  v_rol_fin uuid := (select id from public.roles where clave = 'FINANZAS');
  c_inv text; c_adm1 text; c_adm2 text; c_sup text; c_vieja text; c_falsa text;
begin
  -- ── Preparación (owner) ────────────────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u_inv, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.invitado@amo.test', now(), now(), now()),
         (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.admin@amo.test', now(), now(), now()),
         (u_sup, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.super@amo.test', now(), now(), now());

  select count(*) into v_n from public.perfiles where id in (u_inv, u_adm, u_sup) and estado = 'INVITADO' and rol_id is null;
  r := r || jsonb_build_object('00_handle_new_user_crea_perfiles_invitados', v_n = 3);

  update public.perfiles set rol_id = v_rol_admin where id = u_inv;
  -- Desde M7 el estado de un perfil solo cambia por aplicar_transicion: la preparación (owner) lo simula.
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.perfiles set rol_id = v_rol_admin, estado = 'ACTIVO', debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = v_rol_super, estado = 'ACTIVO', debe_cambiar_password = false where id = u_sup;
  perform set_config('amo.transicion_autorizada', '', true);

  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (s_inv, u_inv, now(), now(), 'aal1'), (s_adm1, u_adm, now(), now(), 'aal1'),
         (s_adm2, u_adm, now(), now(), 'aal2'), (s_sup, u_sup, now(), now(), 'aal2'),
         (s_vieja, u_adm, now() - interval '31 minutes', now() - interval '31 minutes', 'aal2');

  c_inv := jsonb_build_object('sub', u_inv, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_inv)::text;
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm2 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm2)::text;
  c_sup := jsonb_build_object('sub', u_sup, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_sup)::text;
  c_vieja := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_vieja)::text;
  c_falsa := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_falsa)::text;

  -- ── (a) Lectura como authenticated con claims simulados ───────────────────────────────────────────
  -- a1. INVITADO (aal1): ve su perfil, su rol y sus permisos; nada más.
  perform set_config('request.jwt.claims', c_inv, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.perfiles;                      r := r || jsonb_build_object('a1_invitado_perfiles_solo_propio', v_n = 1);
  select count(*) into v_n from public.roles;                         r := r || jsonb_build_object('a1_invitado_roles_solo_propio', v_n = 1);
  select count(*) into v_n from public.permisos;                      r := r || jsonb_build_object('a1_invitado_permisos_de_su_rol_53', v_n = 53);
  select count(*) into v_n from public.rol_permisos;                  r := r || jsonb_build_object('a1_invitado_rol_permisos_propios_53', v_n = 53);
  select count(*) into v_n from public.paises;                        r := r || jsonb_build_object('a1_invitado_sin_geo', v_n = 0);
  select count(*) into v_n from public.configuracion;                 r := r || jsonb_build_object('a1_invitado_sin_configuracion', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- a2. ADMIN ACTIVO a aal1 (su rol exige MFA): solo lo exceptuado.
  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  select private.acceso_valido() into v_b;                            r := r || jsonb_build_object('a2_admin_aal1_acceso_invalido', v_b = false);
  select count(*) into v_n from public.perfiles;                      r := r || jsonb_build_object('a2_admin_aal1_perfiles_solo_propio', v_n = 1);
  select count(*) into v_n from public.roles;                         r := r || jsonb_build_object('a2_admin_aal1_roles_solo_propio', v_n = 1);
  select count(*) into v_n from public.sectores;                      r := r || jsonb_build_object('a2_admin_aal1_sin_sectores', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- a3. ADMIN ACTIVO a aal2: acceso completo según permisos.
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  select private.acceso_valido() into v_b;                            r := r || jsonb_build_object('a3_admin_aal2_acceso_valido', v_b);
  select count(*) into v_n from public.paises;                        r := r || jsonb_build_object('a3_admin_paises_250', v_n = 250);
  select count(*) into v_n from public.municipios;                    r := r || jsonb_build_object('a3_admin_municipios_1122', v_n = 1122);
  -- Solo roles de sistema: los personalizados se crean desde la app (gestión de roles).
  select count(*) into v_n from public.roles where es_sistema;        r := r || jsonb_build_object('a3_admin_roles_sistema_6', v_n = 6);
  select count(*) into v_n from public.perfiles where id in (u_inv, u_adm, u_sup);
                                                                      r := r || jsonb_build_object('a3_admin_ve_perfiles_usuarios_ver', v_n = 3);
  -- Claves de M3; configuracion_semillas (M5) añade las de negocio.
  select count(*) into v_n from public.configuracion where clave like 'seguridad.%';
                                                                      r := r || jsonb_build_object('a3_admin_configuracion_seguridad_11', v_n = 11);
  select count(*) into v_n from public.sectores;                      r := r || jsonb_build_object('a3_admin_sectores_14', v_n = 14);
  select count(*) into v_n from public.miembros_organizacion();       r := r || jsonb_build_object('a3_admin_sin_organizacion_0_miembros', v_n = 0);
  -- a4. Escritura propia por privilegios de columna (dispara m_updated_at y z_auditar).
  update public.perfiles set nombre = 'Admin de humo' where id = u_adm;
  get diagnostics v_n = row_count;                                    r := r || jsonb_build_object('a4_admin_actualiza_su_nombre', v_n = 1);
  select count(*) into v_n from public.mi_actividad(10, null);        r := r || jsonb_build_object('a4_mi_actividad_devuelve_lo_propio', v_n >= 1);
  begin
    update public.perfiles set rol_id = v_rol_super where id = u_adm;
    r := r || jsonb_build_object('a4_admin_no_puede_cambiar_rol_columna', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('a4_admin_no_puede_cambiar_rol_columna', true);
  end;
  begin
    update public.configuracion set valor = '45' where clave = 'seguridad.inactividad_minutos_admin';
    get diagnostics v_n = row_count;
    r := r || jsonb_build_object('a4_config_sin_contexto_confiable_no_escribe', v_n = 0);
  exception when others then
    r := r || jsonb_build_object('a4_config_sin_contexto_confiable_no_escribe', sqlstate = '42501' or sqlerrm like '%row-level security%');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_n from public.bitacora
   where entidad = 'perfiles' and entidad_id = u_adm::text and accion = 'UPDATE' and origen = 'API_DIRECTA'
     and actor_id = u_adm and cambios ? 'nombre' and not cambios ? 'updated_at';
  r := r || jsonb_build_object('a4_bitacora_update_propio_api_directa_redactado', v_n = 1);

  -- a5. SUPERADMIN aal2 ve todo el catálogo.
  perform set_config('request.jwt.claims', c_sup, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.permisos;                      r := r || jsonb_build_object('a5_super_permisos_70', v_n = 70);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- a6. Sesión inexistente (revocada) y sesión inactiva > 30 min.
  perform set_config('request.jwt.claims', c_falsa, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.paises;                        r := r || jsonb_build_object('a6_sesion_revocada_sin_acceso', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_vieja, true);
  execute 'set local role authenticated';
  select private.acceso_valido() into v_b;                            r := r || jsonb_build_object('a6_sesion_inactiva_sin_acceso', v_b = false);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- tocar_sesion_srv informa la vigencia y NO reactiva la sesión vencida (el DAL cierra la sesión).
  execute 'set local role service_role';
  select public.tocar_sesion_srv(u_adm, s_vieja) into v_t;            r := r || jsonb_build_object('a6_tocar_sesion_inactiva', v_t = 'INACTIVA');
  select public.tocar_sesion_srv(u_adm, s_falsa) into v_t;            r := r || jsonb_build_object('a6_tocar_sesion_revocada', v_t = 'REVOCADA');
  select public.tocar_sesion_srv(u_adm, s_adm2) into v_t;             r := r || jsonb_build_object('a6_tocar_sesion_vigente', v_t = 'VIGENTE');
  execute 'reset role';
  perform set_config('request.jwt.claims', c_vieja, true);
  execute 'set local role authenticated';
  select private.acceso_valido() into v_b;                            r := r || jsonb_build_object('a6_tocar_sesion_no_reactiva', v_b = false);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- a6b. activar_perfil_srv: INVITADO con rol y correo confirmado pasa a ACTIVO; es idempotente.
  execute 'set local role service_role';
  perform public.activar_perfil_srv(u_inv);
  perform public.activar_perfil_srv(u_inv);
  execute 'reset role';
  r := r || jsonb_build_object('a6b_activar_perfil_invitado',
    (select estado = 'ACTIVO' and activado_at is not null from public.perfiles where id = u_inv));
  -- ACTIVO → INVITADO no es una transición: se deshace con modo_carga (owner) para las pruebas siguientes.
  perform set_config('amo.modo_carga', 'on', true);
  update public.perfiles set estado = 'INVITADO', activado_at = null where id = u_inv;
  perform set_config('amo.modo_carga', '', true);

  -- a7. anon no ve nada.
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.paises;
    r := r || jsonb_build_object('a7_anon_sin_select', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('a7_anon_sin_select', true);
  end;
  execute 'reset role';

  -- ── (b) EXECUTE: helpers de política sí, procedimientos privilegiados no ──────────────────────────────
  r := r || jsonb_build_object('b1_auth_execute_helpers_politica',
    has_function_privilege('authenticated', 'private.acceso_valido()', 'execute')
    and has_function_privilege('authenticated', 'private.tiene_permiso(text)', 'execute')
    and has_function_privilege('authenticated', 'private.mi_rol_id()', 'execute')
    and has_function_privilege('authenticated', 'private.contexto_confiable()', 'execute')
    and has_schema_privilege('authenticated', 'private', 'usage'));
  r := r || jsonb_build_object('b2_auth_sin_execute_privilegiados',
    not has_function_privilege('authenticated', 'private.sesion_valida(uuid,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.validar_actor(uuid,text,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.tiene_permiso_de(uuid,text)', 'execute')
    and not has_function_privilege('authenticated', 'private.puede_gestionar(uuid,uuid,uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.registrar_en_bitacora(text,text,text,jsonb,jsonb,text,text,text,boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.login_bloqueado_srv(text,inet)', 'execute')
    and not has_function_privilege('authenticated', 'public.registrar_evento_srv(uuid,text,text,text,jsonb,inet,char,text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.cerrar_sesiones_usuario_srv(uuid,uuid,uuid,uuid,text)', 'execute'));
  r := r || jsonb_build_object('b3_service_role_execute_srv',
    has_function_privilege('service_role', 'public.login_bloqueado_srv(text,inet)', 'execute')
    and has_function_privilege('service_role', 'public.registrar_acceso_srv(uuid,text,public.acceso_evento,uuid,text,inet,char,text,text,numeric,numeric,text,text,text,text)', 'execute')
    and has_function_privilege('service_role', 'public.autorizar_gestion_usuario_srv(uuid,uuid,uuid,text)', 'execute'));
  r := r || jsonb_build_object('b4_anon_sin_execute_ni_usage',
    not has_function_privilege('anon', 'public.miembros_organizacion()', 'execute')
    and not has_schema_privilege('anon', 'private', 'usage'));
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  begin
    perform public.login_bloqueado_srv('x@amo.test', null);
    r := r || jsonb_build_object('b5_auth_llama_srv_denegado', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b5_auth_llama_srv_denegado', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (c) El owner lee y borra auth.sessions (acceso_valido y cerrar sesiones dependen de ello) ─────────
  select count(*) into v_n from auth.sessions where user_id = u_inv;  r := r || jsonb_build_object('c1_owner_select_auth_sessions', v_n = 1);
  execute 'set local role service_role';
  perform set_config('amo.actor_id', '', true);
  select public.cerrar_sesiones_usuario_srv(u_inv, u_adm, s_adm2, null, 'prueba de humo') into v_n;
  execute 'reset role';
  perform set_config('amo.actor_id', '', true);
  r := r || jsonb_build_object('c2_cerrar_sesiones_borra_auth_sessions', v_n = 1
          and not exists (select 1 from auth.sessions where user_id = u_inv)
          and exists (select 1 from public.bitacora where accion = 'CERRAR_SESIONES' and entidad_id = u_inv::text and actor_id = u_adm));

  -- ── (d) Bitácora append-only ─────────────────────────────────────────────────────────────────────────
  begin
    update public.bitacora set motivo = 'x' where true;
    r := r || jsonb_build_object('d1_update_bitacora_falla', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d1_update_bitacora_falla', sqlerrm = 'AMO_BITACORA_INMUTABLE');
  end;
  begin
    delete from public.bitacora where true;
    r := r || jsonb_build_object('d2_delete_bitacora_falla', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d2_delete_bitacora_falla', sqlerrm = 'AMO_BITACORA_INMUTABLE');
  end;
  begin
    truncate public.bitacora;
    r := r || jsonb_build_object('d3_truncate_bitacora_falla', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d3_truncate_bitacora_falla', sqlerrm = 'AMO_BITACORA_INMUTABLE');
  end;
  execute 'set local role service_role';
  begin
    insert into public.bitacora (entidad, accion, origen) values ('x', 'OTRO', 'APP');
    r := r || jsonb_build_object('d4_service_role_no_inserta_bitacora', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('d4_service_role_no_inserta_bitacora', true);
  end;
  select public.registrar_evento_srv(u_adm, 'EXPORTAR', 'reportes', 'resumen', '{"formato":"xlsx"}', '203.0.113.7', 'co', 'Bogotá', 'humo/1.0') into v_n;
  execute 'reset role';
  select count(*) into v_n from public.bitacora
   where id = v_n and origen = 'APP' and pais_iso2 = 'CO' and actor_rol = 'ADMIN' and actor_email = 'h***@amo.test';
  r := r || jsonb_build_object('d5_registrar_evento_srv', v_n = 1);

  -- ── (e) Guardas de roles y perfiles ──────────────────────────────────────────────────────────────────
  -- e1. No se puede quitar el último SUPERADMIN activo (se intenta degradar a TODOS en una sola sentencia).
  begin
    update public.perfiles set rol_id = v_rol_admin where rol_id = v_rol_super and estado = 'ACTIVO';
    r := r || jsonb_build_object('e1_ultimo_superadmin', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e1_ultimo_superadmin', sqlerrm = 'AMO_ULTIMO_SUPERADMIN');
  end;
  -- e2. Solo SUPERADMIN asigna SUPERADMIN (actor ADMIN vía amo.actor_id, como un *_srv).
  perform set_config('amo.actor_id', u_adm::text, true);
  execute 'set local role service_role';
  begin
    update public.perfiles set rol_id = v_rol_super where id = u_inv;
    r := r || jsonb_build_object('e2_solo_superadmin_asigna_superadmin', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e2_solo_superadmin_asigna_superadmin', sqlerrm = 'AMO_SOLO_SUPERADMIN');
  end;
  -- e3. Anti-escalada: ADMIN no puede asignar FINANZAS (no tiene sus permisos de tesorería).
  begin
    update public.perfiles set rol_id = v_rol_fin where id = u_inv;
    r := r || jsonb_build_object('e3_admin_no_escala_a_finanzas', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e3_admin_no_escala_a_finanzas', sqlerrm = 'AMO_ESCALADA_PERMISOS');
  end;
  -- e4. Nadie cambia su propio rol.
  begin
    update public.perfiles set rol_id = v_rol_fin where id = u_adm;
    r := r || jsonb_build_object('e4_rol_propio', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e4_rol_propio', sqlerrm = 'AMO_ROL_PROPIO');
  end;
  -- e5. ADMIN no toca a un SUPERADMIN.
  begin
    update public.perfiles set deleted_at = now(), estado = 'DESACTIVADO' where id = u_sup;
    r := r || jsonb_build_object('e5_admin_no_toca_superadmin', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e5_admin_no_toca_superadmin', sqlerrm in ('AMO_ESCALADA_PERMISOS', 'AMO_ULTIMO_SUPERADMIN'));
  end;
  -- e6. Un perfil ACTIVO exige coherencia rol ↔ organización.
  begin
    update public.perfiles set medio_id = gen_random_uuid() where id = u_adm;
    r := r || jsonb_build_object('e6_admin_sin_organizacion', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e6_admin_sin_organizacion', sqlstate = '23514');
  end;
  execute 'reset role';
  perform set_config('amo.actor_id', '', true);

  -- e7. autorizar_gestion_usuario_srv: permiso + sesión aal2 + puede_gestionar.
  execute 'set local role service_role';
  begin
    perform public.autorizar_gestion_usuario_srv(u_adm, s_adm2, u_inv, 'EDITAR');
    r := r || jsonb_build_object('e7_autorizar_admin_sobre_admin', true);
  exception when others then
    r := r || jsonb_build_object('e7_autorizar_admin_sobre_admin', sqlerrm);
  end;
  begin
    perform public.autorizar_gestion_usuario_srv(u_adm, s_adm2, u_sup, 'EDITAR');
    r := r || jsonb_build_object('e7_autorizar_admin_sobre_super_denegado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e7_autorizar_admin_sobre_super_denegado', sqlerrm = 'AMO_ESCALADA_PERMISOS');
  end;
  begin
    perform public.autorizar_gestion_usuario_srv(u_adm, s_adm1, u_inv, 'EDITAR');
    r := r || jsonb_build_object('e7_autorizar_con_sesion_aal1_denegado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e7_autorizar_con_sesion_aal1_denegado', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  -- e8. Datos sensibles: editar y revelar con bitácora.
  perform public.editar_privado_srv('perfiles_privado', u_inv, u_adm, s_adm2, '{"direccion": "Calle 1 # 2-3"}');
  select public.revelar_privado_srv('perfiles_privado', u_inv, u_adm, s_adm2, array['direccion']) into v_j;
  begin
    perform public.revelar_privado_srv('perfiles_privado', u_inv, u_adm, s_adm2, array['perfil_id']);
    v_t := 'NO FALLÓ';
  exception when others then
    v_t := sqlerrm;
  end;
  execute 'reset role';
  perform set_config('amo.actor_id', '', true);
  r := r || jsonb_build_object('e8_editar_y_revelar_privado', v_j = '{"direccion": "Calle 1 # 2-3"}'::jsonb
          and exists (select 1 from public.bitacora where accion = 'REVELAR_DATO' and entidad_id = u_inv::text and actor_id = u_adm)
          and exists (select 1 from public.bitacora where entidad = 'perfiles_privado' and accion = 'INSERT' and actor_id = u_adm
                                                      and cambios ->> 'direccion' = private.enmascarar('Calle 1 # 2-3')));
  r := r || jsonb_build_object('e8_revelar_campo_no_permitido', v_t = 'AMO_NO_AUTORIZADO');

  -- ── (f) Limitador de login ───────────────────────────────────────────────────────────────────────────
  execute 'set local role service_role';
  for i in 1..20 loop
    perform public.registrar_intento_login_srv(format('spray%s@amo.test', i), '198.51.100.20', false);
  end loop;
  select bloqueado into v_b from public.login_bloqueado_srv('nuevo@amo.test', '198.51.100.20');
  r := r || jsonb_build_object('f1_spraying_bloquea_ip', v_b);
  for i in 1..5 loop
    perform public.registrar_intento_login_srv('victima@amo.test', '198.51.100.30', false);
  end loop;
  select bloqueado into v_b from public.login_bloqueado_srv('victima@amo.test', '198.51.100.30');
  r := r || jsonb_build_object('f2_cinco_fallos_bloquean_email_ip', v_b);
  select bloqueado into v_b from public.login_bloqueado_srv('VICTIMA@amo.test ', '198.51.100.31');
  r := r || jsonb_build_object('f3_otra_ip_no_bloqueada', v_b = false);
  select bloqueado into v_b from public.login_bloqueado_srv('limpio@amo.test', null);
  r := r || jsonb_build_object('f4_nunca_devuelve_null', v_b is not null and v_b = false);
  -- f5. registrar_acceso_srv: geolocalización DANE y país inusual.
  select (x).es_sospechoso into v_b
  from (select public.registrar_acceso_srv(u_adm, 'humo.admin@amo.test', 'LOGIN_EXITOSO', s_adm2, 'aal2', '190.0.2.1',
                                           'co', 'ANT', 'Medellín', 6.2442, -75.5812, 'humo/1.0', 'Chrome', 'macOS', 'ESCRITORIO') as x) q;
  r := r || jsonb_build_object('f5_acceso_co_no_sospechoso', v_b = false);
  select public.registrar_acceso_srv(u_adm, 'humo.admin@amo.test', 'LOGIN_EXITOSO', s_adm2, 'aal2', '203.0.113.9',
                                     'US', null, 'Miami', 25.77, -80.19, 'humo/1.0', 'Chrome', 'macOS', 'ESCRITORIO') into v_t;
  execute 'reset role';
  r := r || jsonb_build_object('f5_acceso_resuelve_departamento_y_municipio',
          exists (select 1 from public.accesos where usuario_id = u_adm and departamento_codigo = '05'
                                                  and municipio_codigo = '05001' and lat = 6.24));
  r := r || jsonb_build_object('f5_pais_inusual_marcado',
          exists (select 1 from public.accesos where usuario_id = u_adm and pais_iso2 = 'US'
                                                  and es_sospechoso and motivo_sospecha = 'PAIS_INUSUAL'));
  r := r || jsonb_build_object('f5_login_exitoso_actualiza_ultimo_acceso',
          (select ultimo_acceso_at is not null from public.perfiles where id = u_adm));

  -- ── (g) Semillas ─────────────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('g1_geo_250_33_1122',
    (select count(*) from public.paises) = 250 and (select count(*) from public.departamentos) = 33
    and (select count(*) from public.municipios) = 1122);
  r := r || jsonb_build_object('g2_permisos_70', (select count(*) from public.permisos) = 70);
  select jsonb_object_agg(r2.clave, r2.n) into v_j
  from (select ro.clave, count(rp.permiso_clave) as n from public.roles ro
        left join public.rol_permisos rp on rp.rol_id = ro.id where ro.es_sistema group by ro.clave) r2;
  r := r || jsonb_build_object('g3_permisos_por_rol_como_permisos_ts',
    v_j = '{"SUPERADMIN": 70, "ADMIN": 53, "OPERACIONES": 30, "FINANZAS": 24, "ANUNCIANTE": 11, "MEDIO": 10}'::jsonb);
  r := r || jsonb_build_object('g4_configuracion_seguridad_11',
    (select count(*) from public.configuracion where clave like 'seguridad.%') = 11);
  r := r || jsonb_build_object('g5_normalizar_texto_paridad_ts',
    private.normalizar_texto('Bogotá, D.C.') = 'bogota' and private.normalizar_texto('NARI¥O') = 'narino'
    and private.normalizar_texto('Côte d’Ivoire') = 'cote divoire' and private.normalizar_texto('Distrito Capital') = 'distrito capital');
  begin
    update public.configuracion set valor = '9999' where clave = 'seguridad.inactividad_minutos_admin';
    r := r || jsonb_build_object('g6_config_fuera_de_rango_rechazada', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('g6_config_fuera_de_rango_rechazada', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    update public.configuracion set valor = '["CO","ZZ"]' where clave = 'seguridad.paises_habituales';
    r := r || jsonb_build_object('g7_pais_inexistente_rechazado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('g7_pais_inexistente_rechazado', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

-- Resumen (para el detalle por prueba: select key, value from jsonb_each(current_setting('humo.resultado')::jsonb)).
select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
