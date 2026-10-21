-- Pruebas de humo de la migración 5 (configuracion + configuracion_semillas).
-- Se ejecutan como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
-- Cada prueba deja `true` si pasa o un texto con lo observado si falla.
--
-- Contexto confiable: el secreto x-amo-srv no se usa en pruebas. Se simula con la caché por transacción de
-- private.contexto_confiable() (GUC amo.ctx_confiable = 'si' | 'no'), que un cliente PostgREST no puede fijar.
-- El anunciante usa la organización E2E (e2e00000-…a001), que existe desde negocio_actores (M6).
begin;

do $humo$
declare
  r jsonb := '{}';
  v_n bigint;
  v_b boolean;
  v_t text;
  v_id uuid;
  v_id2 uuid;
  v_ts timestamptz;
  v_rec record;
  u_adm constant uuid := '00000000-0000-4000-a000-000000000051';   -- ADMIN ACTIVO
  u_anu constant uuid := '00000000-0000-4000-a000-000000000052';   -- ANUNCIANTE ACTIVO (organización E2E)
  u_tmp constant uuid := '00000000-0000-4000-a000-000000000053';   -- usuario que se borra definitivamente
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000051';  -- aal1
  s_adm2 constant uuid := '00000000-0000-4000-b000-000000000052';  -- aal2
  s_anu constant uuid := '00000000-0000-4000-b000-000000000053';   -- aal1 (el rol ANUNCIANTE no exige MFA)
  s_tmp constant uuid := '00000000-0000-4000-b000-000000000054';
  c_adm1 text; c_adm2 text; c_anu text; c_tmp text;
  v_anunciante constant uuid := 'e2e00000-0000-4000-8000-00000000a001';
  v_formato uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'REEL');
  v_franja uuid := (select id from public.franjas where clave = 'F1');
  v_termino uuid;
  v_borrador uuid;
  v_franja_libre uuid;
begin
  -- ── Preparación (owner) ────────────────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo5.admin@amo.test', now(), now(), now()),
    (u_anu, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'Humo5.Anunciante@amo.test', now(), now(), now()),
    (u_tmp, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo5.tmp@amo.test', now(), now(), now());
  -- Desde M7 el estado de un perfil solo cambia por aplicar_transicion: la preparación (owner) lo simula.
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id in (u_adm, u_tmp);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         anunciante_id = v_anunciante, debe_cambiar_password = false where id = u_anu;
  perform set_config('amo.transicion_autorizada', '', true);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm1, u_adm, now(), now(), 'aal1'), (s_adm2, u_adm, now(), now(), 'aal2'),
    (s_anu, u_anu, now(), now(), 'aal1'), (s_tmp, u_tmp, now(), now(), 'aal2');
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm2 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm2)::text;
  c_anu := jsonb_build_object('sub', u_anu, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anu)::text;
  c_tmp := jsonb_build_object('sub', u_tmp, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_tmp)::text;

  -- Una versión publicada y un borrador de términos (owner con modo_carga: la carga fija la vigencia).
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.terminos_versiones (tipo, version, contenido_md, publicada, vigente_desde)
  values ('POLITICA_DATOS', 'humo-1', '# Política de datos (humo)', true, now()) returning id into v_termino;
  insert into public.terminos_versiones (tipo, version, contenido_md)
  values ('POLITICA_DATOS', 'humo-2', '# Borrador (humo)') returning id into v_borrador;
  perform set_config('amo.modo_carga', '', true);
  insert into public.franjas (clave, nombre, seguidores_min, seguidores_max, orden, activa)
  values ('F8', 'Inactiva (humo)', 1, 10, 8, false) returning id into v_franja_libre;

  -- ── (a) Lectura por tipo de usuario ──────────────────────────────────────────────────────────────────
  -- a1. ADMIN a aal1 (su rol exige MFA): solo términos publicados y su propia aceptación (§2.3).
  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.franjas;                       r := r || jsonb_build_object('a1_admin_aal1_sin_franjas', v_n = 0);
  select count(*) into v_n from public.plantillas_notificacion;       r := r || jsonb_build_object('a1_admin_aal1_sin_plantillas', v_n = 0);
  select count(*) into v_n from public.terminos_versiones where tipo = 'POLITICA_DATOS';
                                                                       r := r || jsonb_build_object('a1_admin_aal1_solo_publicada', v_n = 1);
  insert into public.aceptaciones_terminos (perfil_id, termino_version_id) values (u_adm, v_termino);
  select count(*) into v_n from public.aceptaciones_terminos;          r := r || jsonb_build_object('a1_admin_aal1_acepta_y_ve_la_suya', v_n = 1);
  begin
    insert into public.aceptaciones_terminos (perfil_id, termino_version_id) values (u_adm, v_borrador);
    r := r || jsonb_build_object('a1_no_acepta_borrador', 'NO FALLÓ');
  exception when others then          -- el trigger de sellado lo rechaza antes que la RLS
    r := r || jsonb_build_object('a1_no_acepta_borrador', sqlerrm = 'AMO_CONFIG_INVALIDA' or sqlstate = '42501');
  end;
  begin
    insert into public.aceptaciones_terminos (perfil_id, termino_version_id) values (u_anu, v_termino);
    r := r || jsonb_build_object('a1_no_acepta_por_otro', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a1_no_acepta_por_otro', sqlstate = '42501');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select * into v_rec from public.aceptaciones_terminos where perfil_id = u_adm;
  r := r || jsonb_build_object('a1_aceptacion_sellada',
    v_rec.email_sha256 = encode(sha256(convert_to('humo5.admin@amo.test', 'UTF8')), 'hex')
    and v_rec.aceptada_at = now() and v_rec.ip is null);

  -- a2. ADMIN a aal2: todo lo de configuración.
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.franjas where activa;          r := r || jsonb_build_object('a2_admin_franjas_3', v_n = 3);
  select count(*) into v_n from public.formatos;                      r := r || jsonb_build_object('a2_admin_formatos_9', v_n = 9);
  select count(*) into v_n from public.tarifas where vigente_hasta is null;
                                                                       r := r || jsonb_build_object('a2_admin_tarifas_vigentes_27', v_n = 27);
  select count(*) into v_n from public.niveles_verificacion;          r := r || jsonb_build_object('a2_admin_niveles_3', v_n = 3);
  select count(*) into v_n from public.parametros_tributarios;        r := r || jsonb_build_object('a2_admin_parametros_2', v_n = 2);
  -- 20 de configuracion_semillas + seguridad.alerta_pais_inusual (notificaciones, M8).
  select count(*) into v_n from public.plantillas_notificacion;       r := r || jsonb_build_object('a2_admin_plantillas_21', v_n = 21);
  select count(*) into v_n from public.configuracion;                 r := r || jsonb_build_object('a2_admin_configuracion_53', v_n = 53);
  select count(*) into v_n from public.terminos_versiones where tipo = 'POLITICA_DATOS';
                                                                       r := r || jsonb_build_object('a2_admin_ve_borradores', v_n = 2);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- a3. ANUNCIANTE: catálogos públicos sí; tributario, plantillas y configuración privada no.
  perform set_config('request.jwt.claims', c_anu, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.franjas where activa;          r := r || jsonb_build_object('a3_anunciante_franjas_publicas', v_n = 3);
  select count(*) into v_n from public.tarifas where vigente_hasta is null;
                                                                       r := r || jsonb_build_object('a3_anunciante_tarifas_publicas', v_n = 27);
  select count(*) into v_n from public.niveles_verificacion;          r := r || jsonb_build_object('a3_anunciante_niveles_publicos', v_n = 3);
  select count(*) into v_n from public.parametros_tributarios;        r := r || jsonb_build_object('a3_anunciante_sin_tributario', v_n = 0);
  select count(*) into v_n from public.resoluciones_dian;             r := r || jsonb_build_object('a3_anunciante_sin_resoluciones', v_n = 0);
  select count(*) into v_n from public.plantillas_notificacion;       r := r || jsonb_build_object('a3_anunciante_sin_plantillas', v_n = 0);
  select count(*) into v_n from public.configuracion;
  r := r || jsonb_build_object('a3_anunciante_solo_config_publica', v_n = (select count(*) from public.configuracion where es_publica));
  select count(*) into v_n from public.terminos_versiones where tipo = 'POLITICA_DATOS';
                                                                       r := r || jsonb_build_object('a3_anunciante_solo_publicada', v_n = 1);
  select count(*) into v_n from public.aceptaciones_terminos;          r := r || jsonb_build_object('a3_anunciante_no_ve_ajenas', v_n = 0);
  -- a3b. Con contexto confiable, el anunciante tampoco programa tarifas.
  perform set_config('amo.ctx_confiable', 'si', true);
  begin
    perform public.programar_tarifa(v_formato, v_franja, 400000, now() + interval '1 day');
    r := r || jsonb_build_object('a3b_anunciante_no_programa_tarifas', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a3b_anunciante_no_programa_tarifas', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform set_config('amo.ctx_confiable', '', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (b) Sin contexto confiable un ADMIN con JWT válido no escribe configuración ─────────────────────────
  perform set_config('amo.ctx_confiable', 'no', true);
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  begin
    perform public.programar_tarifa(v_formato, v_franja, 400000, now() + interval '1 day');
    r := r || jsonb_build_object('b1_programar_sin_contexto_falla', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b1_programar_sin_contexto_falla', true);
  end;
  update public.plantillas_notificacion set activa = false where clave = 'oferta.publicada';
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('b2_plantilla_sin_contexto_0_filas', v_n = 0);
  update public.niveles_verificacion set tope_anual = 1 where nivel = 1;
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('b3_nivel_sin_contexto_0_filas', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (c) Tarifas versionadas con contexto confiable ──────────────────────────────────────────────────
  perform set_config('amo.ctx_confiable', 'si', true);
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  v_ts := now() + interval '1 day';
  select public.programar_tarifa(v_formato, v_franja, 380000.004, v_ts) into v_id;
  -- Cuentan las vigencias no terminadas (la que regía, cerrada en v_ts, y la programada): la BD puede traer además
  -- vigencias históricas ya cerradas de la misma tarifa (datos demo).
  r := r || jsonb_build_object('c1_programar_tarifa',
    (select count(*) from public.tarifas where formato_id = v_formato and franja_id = v_franja
       and (vigente_hasta is null or vigente_hasta > now())) = 2
    and exists (select 1 from public.tarifas where id = v_id and valor_base = 380000 and vigente_hasta is null
                                                and creada_por = u_adm and not pendiente_validacion)
    and exists (select 1 from public.tarifas where formato_id = v_formato and franja_id = v_franja
                                                and id <> v_id and vigente_hasta = v_ts));
  begin
    perform public.programar_tarifa(v_formato, v_franja, 390000, v_ts - interval '12 hours');
    r := r || jsonb_build_object('c2_no_programa_antes_de_una_programada', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c2_no_programa_antes_de_una_programada', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  -- Encadenar otra vigencia después de la programada sí se permite (cierra la programada en su inicio).
  select public.programar_tarifa(v_formato, v_franja, 395000, v_ts + interval '1 day') into v_id2;
  r := r || jsonb_build_object('c2b_encadena_vigencias',
    exists (select 1 from public.tarifas where id = v_id and vigente_hasta = v_ts + interval '1 day')
    and exists (select 1 from public.tarifas where id = v_id2 and vigente_hasta is null));
  begin
    perform public.programar_tarifa(v_formato, v_franja, 390000, now() - interval '1 hour');
    r := r || jsonb_build_object('c3_no_programa_en_el_pasado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c3_no_programa_en_el_pasado', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    update public.tarifas set valor_base = 1 where id = v_id;
    r := r || jsonb_build_object('c4_sin_grant_valor_base', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('c4_sin_grant_valor_base', true);
  end;
  -- Cancelar la intermedia devuelve su tramo a la anterior, que queda hasta el inicio de la siguiente.
  perform public.cancelar_tarifa_programada(v_id);
  r := r || jsonb_build_object('c5_cancelar_devuelve_el_tramo',
    not exists (select 1 from public.tarifas where id = v_id)
    and exists (select 1 from public.tarifas where formato_id = v_formato and franja_id = v_franja
                                                and vigente_desde < now() and vigente_hasta = v_ts + interval '1 day')
    and (select count(*) from public.tarifas where formato_id = v_formato and franja_id = v_franja and vigente_hasta is null) = 1);
  -- Validaciones de configuración con contexto: fuera de rango se rechaza; en rango se acepta y se audita.
  begin
    update public.configuracion set valor = '0.9' where clave = 'comision.porcentaje_global';
    r := r || jsonb_build_object('c6_comision_fuera_de_rango', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c6_comision_fuera_de_rango', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  update public.configuracion set valor = '0.18' where clave = 'comision.porcentaje_global';
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('c7_admin_edita_comision', v_n = 1);
  update public.niveles_verificacion set tope_anual = 32000000, pendiente_validacion = false where nivel = 1;
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('c8_admin_edita_nivel', v_n = 1);
  begin
    update public.niveles_verificacion set porcentaje_alerta = 0.99 where nivel = 1;
    r := r || jsonb_build_object('c9_alerta_mayor_que_bloqueo', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('c9_alerta_mayor_que_bloqueo', true);
  end;
  begin
    insert into public.franjas (clave, nombre, seguidores_min, seguidores_max, orden) values ('F9', 'Solapada', 100000, 200000, 9);
    r := r || jsonb_build_object('c10_franjas_sin_solape', 'NO FALLÓ');
  exception when exclusion_violation then
    r := r || jsonb_build_object('c10_franjas_sin_solape', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('c11_bitacora_tarifa_y_config_con_actor',
    exists (select 1 from public.bitacora where entidad = 'tarifas' and accion = 'INSERT' and actor_id = u_adm and origen = 'APP')
    and exists (select 1 from public.bitacora where entidad = 'configuracion' and entidad_id = 'comision.porcentaje_global'
                                               and accion = 'UPDATE' and actor_id = u_adm));
  -- Reglas del trigger de inmutabilidad (service_role no tiene RLS pero sí el trigger).
  execute 'set local role service_role';
  begin
    update public.tarifas set valor_base = 1 where formato_id = v_formato and franja_id = v_franja and vigente_hasta is null;
    r := r || jsonb_build_object('c12_tarifa_historica_inmutable', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c12_tarifa_historica_inmutable', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    delete from public.tarifas where formato_id = v_formato and franja_id = v_franja;
    r := r || jsonb_build_object('c13_no_borra_tarifa_vigente', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c13_no_borra_tarifa_vigente', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    insert into public.tarifas (formato_id, plataforma, franja_id, valor_base, vigente_desde)
    values (v_formato, 'INSTAGRAM', v_franja, 1000, now() + interval '3 days');
    r := r || jsonb_build_object('c14_exclusion_de_vigencias', 'NO FALLÓ');
  exception when exclusion_violation then
    r := r || jsonb_build_object('c14_exclusion_de_vigencias', true);
  end;
  begin
    -- Franja sin tarifas (inactiva) para que la FK compuesta falle antes que la exclusión de vigencias.
    insert into public.tarifas (formato_id, plataforma, franja_id, valor_base, vigente_desde)
    values (v_formato, 'FACEBOOK', v_franja_libre, 1000, now() + interval '3 days');
    r := r || jsonb_build_object('c15_fk_formato_plataforma', 'NO FALLÓ');
  exception when foreign_key_violation then
    r := r || jsonb_build_object('c15_fk_formato_plataforma', true);
  end;
  execute 'reset role';

  -- ── (d) Términos y aceptaciones ──────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  update public.terminos_versiones set publicada = true where id = v_borrador;
  r := r || jsonb_build_object('d1_publicar_fija_vigencia',
    (select publicada and vigente_desde = now() from public.terminos_versiones where id = v_borrador));
  begin
    update public.terminos_versiones set contenido_md = 'cambio' where id = v_borrador;
    r := r || jsonb_build_object('d2_publicada_inmutable', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d2_publicada_inmutable', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    insert into public.aceptaciones_terminos (perfil_id, termino_version_id) values (u_adm, v_termino);
    r := r || jsonb_build_object('d3_aceptacion_unica', 'NO FALLÓ');
  exception when unique_violation then
    r := r || jsonb_build_object('d3_aceptacion_unica', true);
  end;
  -- d4. Con contexto confiable la IP y el UA salen de los headers x-amo-*.
  perform set_config('request.headers', '{"x-amo-ip":"203.0.113.5","x-amo-ua":"humo/5.0"}', true);
  insert into public.aceptaciones_terminos (perfil_id, termino_version_id) values (u_adm, v_borrador);
  perform set_config('request.headers', '', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('d4_ip_y_ua_desde_headers_confiables',
    exists (select 1 from public.aceptaciones_terminos where perfil_id = u_adm and termino_version_id = v_borrador
                                                        and ip = '203.0.113.5' and user_agent = 'humo/5.0'));
  begin
    update public.aceptaciones_terminos set ip = '198.51.100.1' where perfil_id = u_adm;
    r := r || jsonb_build_object('d5_aceptaciones_append_only', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d5_aceptaciones_append_only', sqlerrm = 'AMO_BITACORA_INMUTABLE');
  end;
  begin
    delete from public.aceptaciones_terminos where perfil_id = u_adm;
    r := r || jsonb_build_object('d6_aceptaciones_sin_borrado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d6_aceptaciones_sin_borrado', sqlerrm = 'AMO_BITACORA_INMUTABLE');
  end;

  -- ── (e) Resoluciones DIAN y consecutivo sin huecos ───────────────────────────────────────────────────
  -- Solo hay una resolución activa por tipo y la BD puede traer las suyas (datos demo): se desactivan dentro de esta
  -- transacción para que la prueba parta de «sin resolución activa» y numere con la propia.
  update public.resoluciones_dian set activa = false where activa;
  insert into public.resoluciones_dian (tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        consecutivo_actual, vigente_desde, activa)
  values ('DOCUMENTO_SOPORTE', 'HUMO', '18764000000001', private.hoy(), 1, 2, 500, private.hoy(), true) returning id into v_id2;
  r := r || jsonb_build_object('e1_consecutivo_inicial_forzado',
    (select consecutivo_actual = 0 from public.resoluciones_dian where id = v_id2));
  select * into v_rec from private.siguiente_consecutivo('DOCUMENTO_SOPORTE');
  r := r || jsonb_build_object('e2_primer_consecutivo', v_rec.consecutivo = 1 and v_rec.prefijo = 'HUMO' and v_rec.resolucion_id = v_id2);
  select * into v_rec from private.siguiente_consecutivo('DOCUMENTO_SOPORTE');
  r := r || jsonb_build_object('e3_segundo_consecutivo', v_rec.consecutivo = 2);
  begin
    perform private.siguiente_consecutivo('DOCUMENTO_SOPORTE');
    r := r || jsonb_build_object('e4_resolucion_agotada', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e4_resolucion_agotada', sqlerrm = 'AMO_RESOLUCION_AGOTADA');
  end;
  begin
    perform private.siguiente_consecutivo('FACTURA_VENTA');
    r := r || jsonb_build_object('e5_sin_resolucion_activa', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e5_sin_resolucion_activa', sqlerrm = 'AMO_RESOLUCION_AGOTADA');
  end;
  begin
    update public.resoluciones_dian set rango_desde = 2 where id = v_id2;
    r := r || jsonb_build_object('e6_rango_con_emitidos_inmutable', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e6_rango_con_emitidos_inmutable', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    insert into public.resoluciones_dian (tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                          consecutivo_actual, vigente_desde)
    values ('DOCUMENTO_SOPORTE', 'HUMO', '18764000000002', private.hoy(), 2, 10, 0, private.hoy());
    r := r || jsonb_build_object('e7_rangos_sin_solape', 'NO FALLÓ');
  exception when exclusion_violation then
    r := r || jsonb_build_object('e7_rangos_sin_solape', true);
  end;

  -- ── (f) Grants y EXECUTE ─────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('f1_execute',
    has_function_privilege('authenticated', 'public.programar_tarifa(uuid,uuid,numeric,timestamptz)', 'execute')
    and has_function_privilege('authenticated', 'public.cancelar_tarifa_programada(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.programar_tarifa(uuid,uuid,numeric,timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'private.siguiente_consecutivo(public.documento_electronico_tipo)', 'execute')
    and not has_function_privilege('service_role', 'private.siguiente_consecutivo(public.documento_electronico_tipo)', 'execute'));
  r := r || jsonb_build_object('f2_grants_de_columna',
    not has_column_privilege('authenticated', 'public.resoluciones_dian', 'consecutivo_actual', 'insert')
    and not has_column_privilege('authenticated', 'public.resoluciones_dian', 'consecutivo_actual', 'update')
    and not has_column_privilege('authenticated', 'public.aceptaciones_terminos', 'ip', 'insert')
    and not has_column_privilege('authenticated', 'public.terminos_versiones', 'creada_por', 'insert')
    and not has_table_privilege('service_role', 'public.aceptaciones_terminos', 'delete'));
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.franjas;
    r := r || jsonb_build_object('f3_anon_sin_select', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('f3_anon_sin_select', true);
  end;
  execute 'reset role';

  -- ── (g) Borrado definitivo con tarifa creada y términos aceptados (§3.8) ───────────────────────────
  perform set_config('request.jwt.claims', c_tmp, true);
  execute 'set local role authenticated';
  select public.programar_tarifa(v_formato, v_franja, 410000, now() + interval '10 days') into v_id;
  insert into public.aceptaciones_terminos (perfil_id, termino_version_id) values (u_tmp, v_termino);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  begin
    delete from auth.users where id = u_tmp;
    r := r || jsonb_build_object('g1_borrado_definitivo_con_actividad',
      exists (select 1 from public.tarifas where id = v_id and creada_por = u_tmp)
      and exists (select 1 from public.aceptaciones_terminos where perfil_id = u_tmp)
      and not exists (select 1 from public.perfiles where id = u_tmp));
  exception when others then
    r := r || jsonb_build_object('g1_borrado_definitivo_con_actividad', sqlerrm);
  end;
  perform set_config('amo.ctx_confiable', '', true);

  -- ── (h) Semillas ─────────────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('h1_franjas_contiguas',
    (select string_agg(clave || ':' || seguidores_min || '-' || coalesce(seguidores_max::text, '∞'), ' ' order by orden)
     from public.franjas where activa) = 'F1:30000-60000 F2:60001-120000 F3:120001-∞');
  r := r || jsonb_build_object('h2_formatos_por_plataforma',
    (select jsonb_object_agg(plataforma, n) from (select plataforma, count(*) n from public.formatos group by 1) x)
    = '{"FACEBOOK": 4, "INSTAGRAM": 4, "TIKTOK": 1}'::jsonb);
  r := r || jsonb_build_object('h3_tarifa_ig_reel_f3',
    exists (select 1 from public.tarifas t join public.formatos f on f.id = t.formato_id join public.franjas fr on fr.id = t.franja_id
            where f.plataforma = 'INSTAGRAM' and f.clave = 'REEL' and fr.clave = 'F3' and t.valor_base = 1200000 and t.pendiente_validacion));
  r := r || jsonb_build_object('h4_config_tipos_validos', (select count(*) from public.configuracion) = 53);
  r := r || jsonb_build_object('h5_nivel_3_sin_tope', (select tope_anual is null from public.niveles_verificacion where nivel = 3));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
