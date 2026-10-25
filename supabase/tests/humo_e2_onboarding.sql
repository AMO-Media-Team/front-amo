-- Pruebas de humo de 20261022030524_e2_onboarding_medio y 20261022030525_e2_notificaciones_negocio: términos
-- pendientes (AUT-012), solicitudes de vinculación (MED-001), datos de pago cifrados (MED-004), prueba de vida por
-- videollamada y vigencia al aprobar (MED-003), documentos exigidos al anunciante (ADM-003) y avisos a colas.
-- Se ejecuta como owner (pnpm db:suites) en una transacción que SIEMPRE se revierte. Cada prueba deja `true` si pasa
-- o lo observado si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_e text;
  v_n bigint;
  v_id uuid;
  v_cu uuid;
  v_cert text;
  v_t text;
  u_adm constant uuid := '00000000-0000-4000-a000-00000000e301';
  u_med constant uuid := '00000000-0000-4000-a000-00000000e302';
  u_med2 constant uuid := '00000000-0000-4000-a000-00000000e303';
  s_adm constant uuid := '00000000-0000-4000-b000-00000000e301';
  s_med constant uuid := '00000000-0000-4000-b000-00000000e302';
  s_med2 constant uuid := '00000000-0000-4000-b000-00000000e303';
  me_a constant uuid := '00000000-0000-4000-a000-00000000e3a1';
  me_b constant uuid := '00000000-0000-4000-a000-00000000e3a2';
  an_co constant uuid := '00000000-0000-4000-a000-00000000e3b1';
  v_mun char(5) := (select m.codigo from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                    where m.activo and d.activo order by m.codigo limit 1);
  v_sector uuid := (select id from public.sectores order by nombre limit 1);
  v_cif constant text := 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCC==';
  v_hash constant text := repeat('ab', 32);
begin
  -- ── Preparación ──────────────────────────────────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e3.admin@amo.test', now(), now(), now()),
    (u_med, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e3.medio@amo.test', now(), now(), now()),
    (u_med2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e3.medio2@amo.test', now(), now(), now());
  insert into public.medios (id, nombre, tipo, municipio_codigo) values
    (me_a, 'Medio Humo A', 'PAGINA_NOTICIAS', v_mun), (me_b, 'Medio Humo B', 'CREADOR', v_mun);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2, municipio_codigo)
  values (an_co, 'Humo E3 S.A.S.', 'Humo E3', '900123456', '8', v_sector, 'CO', v_mun);
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), medio_id = me_a, estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_med;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), medio_id = me_b, estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_med2;
  perform set_config('amo.transicion_autorizada', '', true);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm, u_adm, now(), now(), 'aal2'), (s_med, u_med, now(), now(), 'aal1'), (s_med2, u_med2, now(), now(), 'aal1');

  -- ── (t) AUT-012 · términos pendientes ──────────────────────────────────────────────────────────────────────────
  -- Sin vigente_desde: el trigger la fija en el instante de la transacción (no admite el pasado).
  insert into public.terminos_versiones (tipo, version, contenido_md, publicada) values
    ('TERMINOS_MEDIO', 'humo-1', 'Términos de prueba para medios', true),
    ('POLITICA_DATOS', 'humo-1', 'Política de prueba', true),
    ('CONDICIONES_COMERCIALES', 'humo-1', 'Condiciones de prueba', true),
    ('TERMINOS_ANUNCIANTE', 'humo-1', 'Términos de prueba para anunciantes', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_med, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_med)::text, true);
  execute 'set local role authenticated';
  select string_agg(tipo::text, ',' order by tipo) into v_t from public.terminos_pendientes();
  r := r || jsonb_build_object('t01_medio_tres_pendientes',
    case when v_t = 'TERMINOS_MEDIO,POLITICA_DATOS,CONDICIONES_COMERCIALES' then 'true'::jsonb else to_jsonb(v_t) end);
  insert into public.aceptaciones_terminos (perfil_id, termino_version_id)
  select u_med, t.id from public.terminos_versiones t where t.tipo = 'TERMINOS_MEDIO' and t.version = 'humo-1';
  select count(*) into v_n from public.terminos_pendientes();
  r := r || jsonb_build_object('t02_tras_aceptar_quedan_dos', v_n = 2);
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.terminos_pendientes();
  r := r || jsonb_build_object('t03_interno_sin_pendientes', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (v) MED-001 · solicitudes de vinculación ───────────────────────────────────────────────────────────────────
  perform public.crear_solicitud_vinculacion_srv(jsonb_build_object('nombre_medio', 'Noticias Humo', 'contacto_nombre', 'Ana Humo',
    'email', 'ana.humo@amo.test', 'municipio_codigo', v_mun, 'autoriza_datos', true,
    'cuentas', jsonb_build_array(jsonb_build_object('plataforma', 'INSTAGRAM', 'usuario', '@noticiashumo', 'seguidores', 45000))),
    repeat('1', 64));
  select count(*) into v_n from public.solicitudes_vinculacion where email = 'ana.humo@amo.test' and estado = 'PENDIENTE';
  r := r || jsonb_build_object('v01_solicitud_creada', v_n = 1);
  perform public.crear_solicitud_vinculacion_srv(jsonb_build_object('nombre_medio', 'Noticias Humo bis', 'contacto_nombre', 'Ana',
    'email', 'ANA.HUMO@amo.test', 'municipio_codigo', v_mun, 'autoriza_datos', true,
    'cuentas', jsonb_build_array(jsonb_build_object('plataforma', 'TIKTOK', 'usuario', 'humo'))), repeat('2', 64));
  select count(*) into v_n from public.solicitudes_vinculacion where email = 'ana.humo@amo.test';
  r := r || jsonb_build_object('v02_duplicado_absorbido', v_n = 1);
  perform public.crear_solicitud_vinculacion_srv(jsonb_build_object('nombre_medio', 'Cuenta existente', 'contacto_nombre', 'Medio',
    'email', 'humo.e3.medio@amo.test', 'municipio_codigo', v_mun, 'autoriza_datos', true,
    'cuentas', jsonb_build_array(jsonb_build_object('plataforma', 'FACEBOOK', 'usuario', 'existente'))), repeat('3', 64));
  select count(*) into v_n from public.solicitudes_vinculacion where email = 'humo.e3.medio@amo.test';
  r := r || jsonb_build_object('v03_correo_con_cuenta_absorbido', v_n = 0);
  begin
    for i in 1..6 loop
      perform public.crear_solicitud_vinculacion_srv(jsonb_build_object('nombre_medio', 'Ráfaga ' || i, 'contacto_nombre', 'Bot',
        'email', 'rafaga' || i || '@amo.test', 'municipio_codigo', v_mun, 'autoriza_datos', true,
        'cuentas', jsonb_build_array(jsonb_build_object('plataforma', 'INSTAGRAM', 'usuario', 'r' || i))), repeat('4', 64));
    end loop;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('v04_limite_por_ip', case when v_e = 'AMO_LIMITE_SOLICITUDES' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    perform public.crear_solicitud_vinculacion_srv(jsonb_build_object('nombre_medio', 'Sin cuentas', 'contacto_nombre', 'Ana',
      'email', 'sin.cuentas@amo.test', 'municipio_codigo', v_mun, 'autoriza_datos', true, 'cuentas', '[]'::jsonb), null);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('v05_exige_una_cuenta', case when v_e like '%solicitudes_vinculacion_cuentas_chk%' then 'true'::jsonb else to_jsonb(v_e) end);
  select id into v_id from public.solicitudes_vinculacion where email = 'ana.humo@amo.test';
  begin
    perform public.resolver_solicitud_vinculacion_srv(v_id, u_adm, s_adm, 'DESCARTADA', null, '  ');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('v06_descartar_exige_motivo', case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb else to_jsonb(v_e) end);
  perform public.resolver_solicitud_vinculacion_srv(v_id, u_adm, s_adm, 'INVITADA', me_a, null);
  select count(*) into v_n from public.solicitudes_vinculacion
  where id = v_id and estado = 'INVITADA' and medio_id = me_a and resuelta_por = u_adm;
  r := r || jsonb_build_object('v07_invitada_con_medio', v_n = 1);
  select count(*) into v_n from public.notificaciones where tipo = 'cola.vinculacion' and usuario_id = u_adm;
  r := r || jsonb_build_object('v08_aviso_a_la_cola', v_n >= 1);
  r := r || jsonb_build_object('v09_authenticated_sin_execute',
    not has_function_privilege('authenticated', 'public.crear_solicitud_vinculacion_srv(jsonb, text)', 'execute')
    and not has_function_privilege('anon', 'public.crear_solicitud_vinculacion_srv(jsonb, text)', 'execute'));

  -- ── (p) MED-004 · datos de pago ────────────────────────────────────────────────────────────────────────────────
  perform public.guardar_datos_pago_medio_srv(me_a, u_med, s_med, jsonb_build_object('titular_nombre', 'Ana Humo',
    'tipo_documento', 'CC', 'numero_documento_cifrado', v_cif, 'numero_documento_hash', v_hash,
    'numero_documento_resumen', '•••• 1234', 'metodo_pago', 'BANCARIO', 'datos_pago_cifrados', v_cif,
    'datos_pago_resumen', 'Bancolombia ahorros •••• 9876', 'es_declarante', true));
  select count(*) into v_n from public.medios_privado
  where medio_id = me_a and es_declarante and metodo_pago = 'BANCARIO' and numero_documento_hash = v_hash;
  r := r || jsonb_build_object('p01_medio_guarda_sus_datos', v_n = 1);
  perform public.guardar_datos_pago_medio_srv(me_a, u_med, s_med, jsonb_build_object('metodo_pago', 'BILLETERA',
    'datos_pago_cifrados', 'v2:QUJD-_xyz:REVG:R0hJ', 'datos_pago_resumen', 'Nequi •••• 4321'));
  select count(*) into v_n from public.medios_privado
  where medio_id = me_a and metodo_pago = 'BILLETERA' and titular_nombre = 'Ana Humo' and es_declarante;
  r := r || jsonb_build_object('p02_parcial_conserva_y_admite_v2', v_n = 1);
  select count(*) into v_n from public.notificaciones where tipo = 'cola.datos_pago_cambiados' and usuario_id = u_adm;
  r := r || jsonb_build_object('p03_cambio_de_pago_avisa', v_n >= 1);
  begin
    perform public.guardar_datos_pago_medio_srv(me_a, u_med, s_med, '{"estado": "VERIFICADO"}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('p04_clave_no_admitida', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    perform public.guardar_datos_pago_medio_srv(me_a, u_med2, s_med2, '{"es_declarante": false}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('p05_otro_medio_no', case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    perform public.guardar_datos_pago_medio_srv(me_b, u_med2, s_med2, jsonb_build_object('numero_documento_cifrado', v_cif,
      'numero_documento_hash', v_hash));
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('p06_documento_repetido', case when v_e like '%medios_privado_numero_documento_hash_key%' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    perform public.guardar_datos_pago_medio_srv(me_b, u_med2, s_med2, jsonb_build_object('metodo_pago', 'BANCARIO'));
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('p07_pago_incompleto', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  -- p08: aun en modo carga (sin el trigger), el CHECK impide una cuenta cifrada sin método.
  perform set_config('amo.modo_carga', 'on', true);
  begin
    update public.medios_privado set metodo_pago = null, datos_pago_resumen = null where medio_id = me_a;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  perform set_config('amo.modo_carga', '', true);
  r := r || jsonb_build_object('p08_check_cifrado_sin_metodo', case when v_e like '%medios_privado_pago_completo_chk%' then 'true'::jsonb else to_jsonb(v_e) end);
  -- p09: fuera del modo carga, por cualquier vía (aquí el owner, como `editar_privado_srv`), el método exige la cuenta.
  begin
    update public.medios_privado set datos_pago_cifrados = null where medio_id = me_a;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('p09_trigger_metodo_sin_cuenta', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);

  -- ── (e) MED-002 · «Enviar a verificación» ──────────────────────────────────────────────────────────────────────
  begin
    perform public.enviar_medio_a_verificacion_srv(me_b, u_med2, s_med2);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('e01_incompleto_no_se_envia', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    update public.medios set deleted_at = now() where id = me_b;
    perform public.enviar_medio_a_verificacion_srv(me_b, u_med2, s_med2);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('e02_medio_borrado', case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_e) end);

  -- ── (d) MED-003 · videollamada y vigencia ──────────────────────────────────────────────────────────────────────
  v_id := public.registrar_verificacion_videollamada_srv(me_a, u_adm, s_adm, 'Videollamada del 22/10 con Ana; cédula exhibida.');
  select count(*) into v_n from public.documentos_medio
  where id = v_id and metodo = 'VIDEOLLAMADA' and archivo_path is null and estado_validacion = 'APROBADO' and validado_por = u_adm;
  r := r || jsonb_build_object('d01_videollamada_aprobada_sin_imagen', v_n = 1);
  begin
    insert into public.documentos_medio (medio_id, tipo, metodo, archivo_path) values (me_a, 'CEDULA_FRENTE', 'VIDEOLLAMADA', null);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('d02_videollamada_solo_prueba_de_vida', case when v_e like '%documentos_medio_archivo_path_chk%' then 'true'::jsonb else to_jsonb(v_e) end);
  perform set_config('amo.actor_id', u_med::text, true);            -- lo carga el medio (la cola no avisa a quien actúa)
  insert into public.documentos_medio (medio_id, tipo, archivo_path, subido_por)
  values (me_a, 'CEDULA_FRENTE', 'medio/' || me_a || '/CEDULA_FRENTE/humo.webp', u_med) returning id into v_id;
  perform public.transicionar_srv('documentos_medio', v_id, 'APROBADO', u_adm, s_adm, null, '{"fecha_vencimiento": "2030-12-31"}');
  select count(*) into v_n from public.documentos_medio where id = v_id and fecha_vencimiento = '2030-12-31';
  r := r || jsonb_build_object('d03_vigencia_al_aprobar', v_n = 1);
  select count(*) into v_n from public.notificaciones where tipo = 'documento.aprobado' and usuario_id = u_med;
  r := r || jsonb_build_object('d04_medio_avisado', v_n >= 2);
  select count(*) into v_n from public.notificaciones where tipo = 'cola.medio_documentos' and usuario_id = u_adm;
  r := r || jsonb_build_object('d05_cola_de_documentos', v_n = 1);

  -- ── (a) ADM-003 · verificación del anunciante ──────────────────────────────────────────────────────────────────
  begin
    perform public.transicionar_srv('anunciantes', an_co, 'VERIFICADO', u_adm, s_adm, null, '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('a01_sin_documentos_no_verifica', case when v_e like 'AMO_TRANSICION_INVALIDA%' then 'true'::jsonb else to_jsonb(v_e) end);
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_co, 'RUT', 'anunciante/' || an_co || '/RUT/rut.pdf'), (an_co, 'CAMARA_COMERCIO', 'anunciante/' || an_co || '/CAMARA_COMERCIO/cc.pdf');
  perform public.transicionar_srv('documentos_anunciante', d.id, 'APROBADO', u_adm, s_adm, null, '{}')
  from public.documentos_anunciante d where d.anunciante_id = an_co;
  perform public.transicionar_srv('anunciantes', an_co, 'VERIFICADO', u_adm, s_adm, null, '{}');
  select count(*) into v_n from public.anunciantes where id = an_co and estado_verificacion = 'VERIFICADO';
  r := r || jsonb_build_object('a02_con_rut_y_camara_verifica', v_n = 1);

  -- ── (k) Ajustes tras la revisión de la fase 1 ─────────────────────────────────────────────────────────────────
  -- k01: el medio no escribe tipo_documento directo (la huella es tipo:número; solo la RPC).
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', u_med, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_med)::text, true);
  execute 'set local role authenticated';
  begin
    update public.medios_privado set tipo_documento = 'NIT' where medio_id = me_a;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('k01_tipo_documento_solo_rpc', case when v_e = '42501' then 'true'::jsonb else to_jsonb(v_e) end);

  -- k02/k03: un certificado de pago anterior al cambio de cuenta no sirve; uno posterior sí.
  update public.medios_privado set datos_pago_cambiados_at = now() where medio_id = me_a;
  select case mp.metodo_pago when 'BANCARIO' then 'CERT_BANCARIA' else 'CERT_BILLETERA' end into v_cert
  from public.medios_privado mp where mp.medio_id = me_a;
  perform set_config('amo.modo_carga', 'on', true);   -- dato de prueba: el certificado ya aprobado
  insert into public.documentos_medio (medio_id, tipo, archivo_path, estado_validacion, created_at)
  values (me_a, v_cert::public.documento_medio_tipo, 'medio/' || me_a || '/' || v_cert || '/humo-viejo.pdf', 'APROBADO',
          now() - interval '1 day')
  returning id into v_id;
  perform set_config('amo.modo_carga', '', true);
  begin
    perform private.validar_verificacion_medio(me_a, 1::smallint, false);
    v_e := 'NO FALLÓ';
  exception when others then
    get stacked diagnostics v_t = pg_exception_detail;
    v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('k02_certificado_viejo_falta', case when v_t like '%' || v_cert || '%' then 'true'::jsonb else to_jsonb(v_t) end);
  update public.documentos_medio set created_at = now() where id = v_id;
  v_t := '';
  begin
    perform private.validar_verificacion_medio(me_a, 1::smallint, false);
  exception when others then
    get stacked diagnostics v_t = pg_exception_detail;
  end;
  r := r || jsonb_build_object('k03_certificado_nuevo_vale', case when coalesce(v_t, '') not like '%' || v_cert || '%' then 'true'::jsonb else to_jsonb(v_t) end);

  -- k04–k06: quitar una cuenta sin verificar por la RPC; ajena o verificada, no.
  insert into public.cuentas_sociales (medio_id, plataforma, handle, url)
  values (me_b, 'TIKTOK', 'humo_quitar', 'https://www.tiktok.com/@humo_quitar') returning id into v_cu;
  begin
    perform public.quitar_cuenta_social_srv(v_cu, u_med, s_med);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('k04_cuenta_ajena_no', case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_e) end);
  perform public.quitar_cuenta_social_srv(v_cu, u_med2, s_med2);
  r := r || jsonb_build_object('k05_quita_su_cuenta',
    (select deleted_at is not null from public.cuentas_sociales where id = v_cu));
  perform set_config('amo.modo_carga', 'on', true);
  update public.cuentas_sociales
     set verificada = true, deleted_at = null, seguidores_verificados = 31000, metodo_verificacion = 'MANUAL',
         fecha_ultima_verificacion = now()
   where id = v_cu;
  perform set_config('amo.modo_carga', '', true);
  begin
    perform public.quitar_cuenta_social_srv(v_cu, u_med2, s_med2);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('k06_verificada_no_se_quita', case when v_e = 'AMO_TRANSICION_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);

  -- k07/k08: la cola de cuentas se avisa al llegar la captura, no al generar el código.
  perform set_config('amo.modo_carga', 'on', true);
  update public.cuentas_sociales set verificada = false where id = v_cu;
  perform set_config('amo.modo_carga', '', true);
  delete from public.notificaciones where tipo = 'cola.cuenta_verificacion';
  insert into public.verificaciones_cuenta (cuenta_social_id, metodo, seguidores_reportados, codigo_hash, codigo_expira_at)
  values (v_cu, 'CODIGO_HISTORIA', 31000, repeat('cd', 32), now() + interval '30 minutes') returning id into v_id;
  select count(*) into v_n from public.notificaciones where tipo = 'cola.cuenta_verificacion';
  r := r || jsonb_build_object('k07_codigo_sin_captura_no_avisa', v_n = 0);
  update public.verificaciones_cuenta set captura_path = 'medio/' || me_b || '/cuenta_social/' || v_cu || '/humo.webp'
  where id = v_id;
  select count(*) into v_n from public.notificaciones where tipo = 'cola.cuenta_verificacion';
  r := r || jsonb_build_object('k08_captura_avisa', v_n >= 1);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
