-- Pruebas de humo de la migración 6 (negocio_actores): RLS por tipo de usuario (admin aal2, anunciante A vs B,
-- medio A vs B, finanzas), datos privados, verificación de cuentas, rutas ligadas a la fila y FKs de perfiles.
-- Se ejecutan como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
-- Cada prueba deja `true` si pasa o un texto con lo observado si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_n bigint;
  v_t text;
  v_j jsonb;
  v_id uuid;
  v_ver uuid;
  v_cuenta uuid;
  v_rec record;
  u_adm constant uuid := '00000000-0000-4000-a000-000000000061';   -- ADMIN
  u_fin constant uuid := '00000000-0000-4000-a000-000000000062';   -- FINANZAS
  u_ana constant uuid := '00000000-0000-4000-a000-000000000063';   -- ANUNCIANTE de A
  u_anb constant uuid := '00000000-0000-4000-a000-000000000064';   -- ANUNCIANTE de B
  u_mea constant uuid := '00000000-0000-4000-a000-000000000065';   -- MEDIO de A
  u_meb constant uuid := '00000000-0000-4000-a000-000000000066';   -- MEDIO de B
  u_tmp constant uuid := '00000000-0000-4000-a000-000000000067';   -- verificador que se borra definitivamente
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000061';
  s_adm2 constant uuid := '00000000-0000-4000-b000-000000000062';
  s_fin constant uuid := '00000000-0000-4000-b000-000000000063';
  s_ana constant uuid := '00000000-0000-4000-b000-000000000064';
  s_anb constant uuid := '00000000-0000-4000-b000-000000000065';
  s_mea constant uuid := '00000000-0000-4000-b000-000000000066';
  s_meb constant uuid := '00000000-0000-4000-b000-000000000067';
  an_a constant uuid := '00000000-0000-4000-c000-00000000000a';
  an_b constant uuid := '00000000-0000-4000-c000-00000000000b';
  me_a constant uuid := '00000000-0000-4000-d000-00000000000a';
  me_b constant uuid := '00000000-0000-4000-d000-00000000000b';
  c_adm1 text; c_adm2 text; c_fin text; c_ana text; c_anb text; c_mea text; c_meb text;
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  v_categoria uuid := (select id from public.categorias where nombre_normalizado = 'deportes');
begin
  -- ── Preparación (owner) ────────────────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo6.admin@amo.test'), (u_fin, 'humo6.finanzas@amo.test'), (u_ana, 'humo6.ana@amo.test'),
               (u_anb, 'humo6.anb@amo.test'), (u_mea, 'humo6.mea@amo.test'), (u_meb, 'humo6.meb@amo.test'),
               (u_tmp, 'humo6.tmp@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo)
  values (an_a, 'Humo A S.A.S.', 'Humo A', '900000101', '1', v_sector, '11001'),
         (an_b, 'Humo B S.A.S.', 'Humo B', '900000102', '1', v_sector, '05001');
  insert into public.medios (id, nombre, tipo, municipio_codigo, lon, lat)
  values (me_a, 'Noticias Humo A', 'PAGINA_NOTICIAS', '05001', -75.5812, 6.2442),
         (me_b, 'Noticias Humo B', 'CREADOR', '76001', -76.5320, 3.4516);
  -- Desde M7 el estado de un perfil solo cambia por aplicar_transicion: la preparación (owner) lo simula.
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id in (u_adm, u_tmp);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'FINANZAS'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_fin;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = case id when u_ana then an_a else an_b end where id in (u_ana, u_anb);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false, medio_id = case id when u_mea then me_a else me_b end where id in (u_mea, u_meb);
  perform set_config('amo.transicion_autorizada', '', true);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm1, u_adm, now(), now(), 'aal1'), (s_adm2, u_adm, now(), now(), 'aal2'), (s_fin, u_fin, now(), now(), 'aal2'),
    (s_ana, u_ana, now(), now(), 'aal1'), (s_anb, u_anb, now(), now(), 'aal1'),
    (s_mea, u_mea, now(), now(), 'aal1'), (s_meb, u_meb, now(), now(), 'aal1');
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm2 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm2)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_anb := jsonb_build_object('sub', u_anb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anb)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;
  perform set_config('amo.ctx_confiable', 'no', true);

  r := r || jsonb_build_object('p1_departamento_generado',
    (select departamento_codigo = '05' from public.medios where id = me_a));

  -- ── (a) Anunciante A frente a B ─────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.anunciantes;                    r := r || jsonb_build_object('a1_anunciante_ve_solo_la_suya', v_n = 1);
  select count(*) into v_n from public.medios;                         r := r || jsonb_build_object('a2_anunciante_sin_tabla_medios', v_n = 0);
  select count(*) into v_n from public.medios_publico();               r := r || jsonb_build_object('a3_anunciante_sin_relacion_sin_medios', v_n = 0);
  select count(*) into v_n from public.anunciantes_publico();          r := r || jsonb_build_object('a4_anunciantes_publico_propio', v_n = 1);
  update public.anunciantes set nombre_comercial = 'Humo A Renovado' where id = an_a;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('a5_edita_su_empresa', v_n = 1);
  update public.anunciantes set nombre_comercial = 'Secuestro' where id = an_b;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('a6_no_edita_la_ajena', v_n = 0);
  begin
    update public.anunciantes set nit = '900000999' where id = an_a;
    r := r || jsonb_build_object('a7_nit_solo_servidor', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('a7_nit_solo_servidor', true);
  end;
  begin
    update public.anunciantes set deleted_at = now() where id = an_a;
    r := r || jsonb_build_object('a8_no_se_borra_a_si_mismo', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('a8_no_se_borra_a_si_mismo', true);
  end;
  insert into public.anunciantes_privado (anunciante_id, contacto_nombre, contacto_email, contacto_celular, direccion)
  values (an_a, 'Contacto Humo', 'contacto@humo-a.test', '+57 300 000 0001', 'Calle 1 # 2-3');
  select count(*) into v_n from public.anunciantes_privado;            r := r || jsonb_build_object('a9_privado_propio', v_n = 1);
  begin
    insert into public.anunciantes_privado (anunciante_id, contacto_nombre) values (an_b, 'Intruso');
    r := r || jsonb_build_object('a10_no_escribe_privado_ajeno', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('a10_no_escribe_privado_ajeno', true);
  end;
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_a, 'RUT', 'anunciante/' || an_a || '/RUT/rut.pdf');
  begin
    insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
    values (an_a, 'RUT', 'anunciante/' || an_b || '/RUT/ajeno.pdf');
    r := r || jsonb_build_object('a11_ruta_ligada_a_la_fila', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('a11_ruta_ligada_a_la_fila', true);
  end;
  begin
    insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
    values (an_a, 'RUT', 'anunciante/' || an_a || '/RUT/../../' || an_b || '/x.pdf');
    r := r || jsonb_build_object('a12_ruta_sin_puntos', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('a12_ruta_sin_puntos', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_anb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.anunciantes_privado;            r := r || jsonb_build_object('a13_b_no_ve_privado_de_a', v_n = 0);
  select count(*) into v_n from public.documentos_anunciante;          r := r || jsonb_build_object('a14_b_no_ve_documentos_de_a', v_n = 0);
  select count(*) into v_n from public.anunciantes where id = an_a;    r := r || jsonb_build_object('a15_b_no_ve_a', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (b) Medio A frente a B ───────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.medios;                         r := r || jsonb_build_object('b1_medio_ve_solo_el_suyo', v_n = 1);
  select count(*) into v_n from public.anunciantes;                    r := r || jsonb_build_object('b2_medio_sin_tabla_anunciantes', v_n = 0);
  select count(*) into v_n from public.anunciantes_publico();          r := r || jsonb_build_object('b3_medio_sin_relacion_sin_anunciantes', v_n = 0);
  update public.medios set descripcion_audiencia = 'Audiencia joven del Valle de Aburrá' where id = me_a;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('b4_edita_su_medio', v_n = 1);
  update public.medios set descripcion_audiencia = 'x' where id = me_b;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('b5_no_edita_el_ajeno', v_n = 0);
  begin
    update public.medios set estado = 'VERIFICADO', nivel_verificacion = 3 where id = me_a;
    r := r || jsonb_build_object('b6_no_se_autoverifica', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b6_no_se_autoverifica', true);
  end;
  -- medios_privado: columnas explícitas; select * y los datos cifrados dan 42501.
  insert into public.medios_privado (medio_id, titular_nombre, celular, email_contacto)
  values (me_a, 'Titular Humo', '+57 301 000 0002', 'titular@humo-medio.test');
  select count(*) into v_n from (select medio_id, titular_nombre, datos_pago_resumen from public.medios_privado) x;
                                                                        r := r || jsonb_build_object('b7_privado_propio_columnas', v_n = 1);
  begin
    select count(*) into v_n from (select * from public.medios_privado) x;
    r := r || jsonb_build_object('b8_select_asterisco_denegado', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b8_select_asterisco_denegado', true);
  end;
  begin
    update public.medios_privado set datos_pago_cifrados = 'v1:a:b:c', metodo_pago = 'BANCARIO' where medio_id = me_a;
    r := r || jsonb_build_object('b9_pago_solo_servidor', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b9_pago_solo_servidor', true);
  end;
  -- Cuenta social y solicitud de verificación MANUAL.
  insert into public.cuentas_sociales (medio_id, plataforma, handle, url, tarifa_referencia)
  values (me_a, 'INSTAGRAM', 'humo_medio_a', 'https://www.instagram.com/humo_medio_a', 300000) returning id into v_cuenta;
  begin
    insert into public.cuentas_sociales (medio_id, plataforma, handle, url) values (me_a, 'INSTAGRAM', 'humo_x', 'https://facebook.com/humo_x');
    r := r || jsonb_build_object('b10_url_por_plataforma', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('b10_url_por_plataforma', true);
  end;
  begin
    insert into public.cuentas_sociales (medio_id, plataforma, handle, url) values (me_b, 'TIKTOK', 'humo_b', 'https://tiktok.com/@humo_b');
    r := r || jsonb_build_object('b11_no_crea_cuenta_ajena', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b11_no_crea_cuenta_ajena', true);
  end;
  insert into public.verificaciones_cuenta (cuenta_social_id, metodo, seguidores_reportados)
  values (v_cuenta, 'MANUAL', 75000) returning id into v_ver;
  r := r || jsonb_build_object('b12_verificacion_deriva_medio',
    (select medio_id = me_a and estado_validacion = 'PENDIENTE' from public.verificaciones_cuenta where id = v_ver));
  begin
    insert into public.verificaciones_cuenta (cuenta_social_id, metodo, seguidores_reportados, captura_path)
    values (v_cuenta, 'CODIGO_HISTORIA', 75000, null);
    r := r || jsonb_build_object('b13_codigo_historia_solo_servidor', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b13_codigo_historia_solo_servidor', sqlstate in ('42501', '23514'));
  end;
  begin
    insert into public.verificaciones_cuenta (cuenta_social_id, metodo, seguidores_reportados) values (v_cuenta, 'MANUAL', 76000);
    r := r || jsonb_build_object('b14_una_solicitud_pendiente', 'NO FALLÓ');
  exception when unique_violation then
    r := r || jsonb_build_object('b14_una_solicitud_pendiente', true);
  end;
  update public.verificaciones_cuenta
     set captura_path = 'medio/' || me_a || '/cuenta_social/' || v_cuenta || '/panel.webp'
   where id = v_ver;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('b15_corrige_su_solicitud_pendiente', v_n = 1);
  insert into public.medio_categorias (medio_id, categoria_id) values (me_a, v_categoria);
  begin
    insert into public.medio_categorias (medio_id, categoria_id) values (me_b, v_categoria);
    r := r || jsonb_build_object('b16_no_categoriza_ajeno', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b16_no_categoriza_ajeno', true);
  end;
  insert into public.medio_audiencia_paises (medio_id, pais_iso2, porcentaje) values (me_a, 'CO', 90);
  begin
    insert into public.medio_audiencia_paises (medio_id, pais_iso2, porcentaje, fuente) values (me_a, 'US', 5, 'VERIFICADA_MANUAL');
    r := r || jsonb_build_object('b17_solo_declara_audiencia', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b17_solo_declara_audiencia', true);
  end;
  begin
    insert into public.medio_audiencia_paises (medio_id, pais_iso2, porcentaje) values (me_a, 'US', 20);
    set constraints trg_medio_audiencia_paises_z_suma immediate;
    r := r || jsonb_build_object('b18_audiencia_suma_max_100', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('b18_audiencia_suma_max_100', true);
  end;
  set constraints trg_medio_audiencia_paises_z_suma deferred;
  begin
    insert into public.medio_pertinencia_geografica (medio_id, municipio_codigo, multiplicador) values (me_a, '05001', 1.5);
    r := r || jsonb_build_object('b19_medio_no_clasifica_su_pertinencia', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b19_medio_no_clasifica_su_pertinencia', true);
  end;
  insert into public.documentos_medio (medio_id, tipo, archivo_path)
  values (me_a, 'CEDULA_FRENTE', 'medio/' || me_a || '/CEDULA_FRENTE/cedula.webp');
  select count(*) into v_n from public.medios_publico();               r := r || jsonb_build_object('b20_medios_publico_propio', v_n = 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.cuentas_sociales;               r := r || jsonb_build_object('b21_b_no_ve_cuentas_de_a', v_n = 0);
  select count(*) into v_n from public.verificaciones_cuenta;          r := r || jsonb_build_object('b22_b_no_ve_verificaciones_de_a', v_n = 0);
  select count(*) into v_n from public.documentos_medio;               r := r || jsonb_build_object('b23_b_no_ve_documentos_de_a', v_n = 0);
  select count(*) into v_n from (select medio_id from public.medios_privado) x;
                                                                        r := r || jsonb_build_object('b24_b_no_ve_privado_de_a', v_n = 0);
  select count(*) into v_n from public.medios_publico(array[me_a]);    r := r || jsonb_build_object('b25_b_no_ve_a_en_publico', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (c) Internos ─────────────────────────────────────────────────────────────────────────────────────
  -- c1. ADMIN a aal1: nada de negocio (su rol exige MFA).
  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.anunciantes;                    r := r || jsonb_build_object('c1_admin_aal1_sin_anunciantes', v_n = 0);
  select count(*) into v_n from public.medios_publico();               r := r || jsonb_build_object('c1_admin_aal1_sin_medios_publico', v_n = 0);
  execute 'reset role';
  -- c2. ADMIN a aal2: fichas completas, pero nunca los _privado por lectura directa.
  perform set_config('request.jwt.claims', c_adm2, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.anunciantes where id in (an_a, an_b, 'e2e00000-0000-4000-8000-00000000a001');
                                                                        r := r || jsonb_build_object('c2_admin_ve_anunciantes', v_n = 3);
  select count(*) into v_n from public.medios where id in (me_a, me_b); r := r || jsonb_build_object('c2_admin_ve_medios', v_n = 2);
  select count(*) into v_n from public.anunciantes_privado;            r := r || jsonb_build_object('c3_admin_no_lee_privado_anunciante', v_n = 0);
  select count(*) into v_n from (select medio_id from public.medios_privado) x;
                                                                        r := r || jsonb_build_object('c3_admin_no_lee_privado_medio', v_n = 0);
  select count(*) into v_n from public.documentos_medio where medio_id = me_a;
                                                                        r := r || jsonb_build_object('c4_verificador_ve_documentos', v_n = 1);
  select count(*) into v_n from public.verificaciones_cuenta where id = v_ver;
                                                                        r := r || jsonb_build_object('c4_verificador_ve_solicitud', v_n = 1);
  insert into public.medio_pertinencia_geografica (medio_id, municipio_codigo, multiplicador, notas)
  values (me_a, '05001', 1.2, 'Cobertura principal');
  r := r || jsonb_build_object('c5_pertinencia_sellada',
    (select clasificado_por = u_adm and clasificado_at = now() from public.medio_pertinencia_geografica where medio_id = me_a));
  select count(*) into v_n from public.medios_publico(array[me_a, me_b]);
                                                                        r := r || jsonb_build_object('c6_admin_medios_publico', v_n = 2);
  begin
    insert into public.medios (nombre, tipo, municipio_codigo) values ('Medio en Pradera', 'EMISORA', '76563');
    r := r || jsonb_build_object('c7_municipio_activo_aceptado', true);
  exception when others then
    r := r || jsonb_build_object('c7_municipio_activo_aceptado', sqlerrm);
  end;
  execute 'reset role';
  -- c8. Municipio inactivo: no se registra un medio allí (owner lo desactiva para la prueba).
  update public.municipios set activo = false where codigo = '05002';
  execute 'set local role authenticated';
  begin
    insert into public.medios (nombre, tipo, municipio_codigo) values ('Medio en Abejorral', 'EMISORA', '05002');
    r := r || jsonb_build_object('c8_municipio_inactivo_rechazado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c8_municipio_inactivo_rechazado', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- c9. FINANZAS: ve anunciantes y medios, pero no documentos de identidad (no verifica medios).
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.anunciantes where id in (an_a, an_b);
                                                                        r := r || jsonb_build_object('c9_finanzas_ve_anunciantes', v_n = 2);
  select count(*) into v_n from public.documentos_medio;               r := r || jsonb_build_object('c9_finanzas_sin_documentos_medio', v_n = 0);
  select count(*) into v_n from public.verificaciones_cuenta;          r := r || jsonb_build_object('c9_finanzas_sin_verificaciones', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- c10. Datos privados de terceros: solo por revelar/editar_privado_srv, con bitácora.
  execute 'set local role service_role';
  select public.revelar_privado_srv('medios_privado', me_a, u_adm, s_adm2, array['titular_nombre', 'celular']) into v_j;
  perform public.editar_privado_srv('anunciantes_privado', an_b, u_adm, s_adm2, '{"contacto_nombre": "Contacto B", "direccion": "Cra 7 # 8-9"}');
  execute 'reset role';
  perform set_config('amo.actor_id', '', true);
  r := r || jsonb_build_object('c10_revelar_y_editar_privado',
    v_j = '{"titular_nombre": "Titular Humo", "celular": "+57 301 000 0002"}'::jsonb
    and exists (select 1 from public.bitacora where accion = 'REVELAR_DATO' and entidad = 'medios_privado'
                                               and entidad_id = me_a::text and actor_id = u_adm)
    and exists (select 1 from public.bitacora where entidad = 'anunciantes_privado' and entidad_id = an_b::text
                                               and accion = 'INSERT' and cambios ->> 'direccion' = private.enmascarar('Cra 7 # 8-9')));
  r := r || jsonb_build_object('c11_bitacora_privado_enmascarado',
    exists (select 1 from public.bitacora where entidad = 'anunciantes_privado' and entidad_id = an_a::text and accion = 'INSERT'
                                           and cambios ->> 'contacto_email' = 'c***@humo-a.test' and actor_id = u_ana));

  -- ── (d) Verificación de cuenta: aprobación (efecto de transicionar_srv, M7) ────────────────────────
  -- Desde M7 la aprobación va por transicionar_srv (servidor, admin aal2 con medios.verificar).
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
  perform public.transicionar_srv('verificaciones_cuenta', v_ver, 'APROBADA', u_adm, s_adm2);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.actor_id', '', true);
  select * into v_rec from public.cuentas_sociales where id = v_cuenta;
  r := r || jsonb_build_object('d1_aprobar_deriva_la_cuenta',
    v_rec.verificada and v_rec.seguidores_verificados = 75000 and v_rec.metodo_verificacion = 'MANUAL'
    and v_rec.fecha_ultima_verificacion = now()
    and v_rec.franja_id = (select id from public.franjas where clave = 'F2'));
  r := r || jsonb_build_object('d2_verificacion_sellada',
    (select validada_por = u_adm and seguidores_verificados = 75000 from public.verificaciones_cuenta where id = v_ver));
  r := r || jsonb_build_object('d3_cuenta_vigente', private.cuenta_vigente(v_cuenta));
  perform set_config('amo.reloj', (now() + interval '38 days')::text, true);
  r := r || jsonb_build_object('d4_cuenta_vencida_tras_gracia', not private.cuenta_vigente(v_cuenta));
  perform set_config('amo.reloj', '', true);
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  begin
    update public.cuentas_sociales set handle = 'otra_cuenta' where id = v_cuenta;
    r := r || jsonb_build_object('d5_cuenta_verificada_no_cambia_handle', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d5_cuenta_verificada_no_cambia_handle', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  update public.cuentas_sociales set tarifa_referencia = 320000 where id = v_cuenta;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('d6_medio_actualiza_tarifa_referencia', v_n = 1);
  update public.verificaciones_cuenta set seguidores_reportados = 1 where id = v_ver;
  get diagnostics v_n = row_count;                                      r := r || jsonb_build_object('d7_no_edita_solicitud_resuelta', v_n = 0);
  select cuentas into v_j from public.medios_publico(array[me_a]);
  r := r || jsonb_build_object('d8_medios_publico_sin_multiplicador',
    jsonb_array_length(v_j) = 1 and v_j -> 0 ->> 'franja_clave' = 'F2' and v_j -> 0 ->> 'handle' = 'humo_medio_a'
    and not (v_j -> 0 ? 'multiplicador_calidad') and not (v_j -> 0 ? 'tarifa_referencia'));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (e) Organizaciones, FKs y borrado definitivo ─────────────────────────────────────────────────────
  r := r || jsonb_build_object('e1_anunciante_e2e_sembrado',
    exists (select 1 from public.anunciantes where id = 'e2e00000-0000-4000-8000-00000000a001' and es_demo
                                              and estado_verificacion = 'VERIFICADO'));
  begin
    update public.perfiles set anunciante_id = gen_random_uuid() where id = u_anb;
    r := r || jsonb_build_object('e2_fk_perfiles_anunciante', 'NO FALLÓ');
  exception when foreign_key_violation then
    r := r || jsonb_build_object('e2_fk_perfiles_anunciante', true);
  end;
  begin
    delete from public.medios where id = me_b;
    r := r || jsonb_build_object('e3_medio_con_usuarios_no_se_borra', 'NO FALLÓ');
  exception when foreign_key_violation then
    r := r || jsonb_build_object('e3_medio_con_usuarios_no_se_borra', true);
  end;
  update public.anunciantes set verificado_por = u_tmp where id = an_a;
  update public.verificaciones_cuenta set validada_por = u_tmp where id = v_ver;
  begin
    delete from auth.users where id = u_tmp;
    r := r || jsonb_build_object('e4_borrado_definitivo_verificador',
      (select verificado_por is null from public.anunciantes where id = an_a)
      and (select validada_por is null from public.verificaciones_cuenta where id = v_ver));
  exception when others then
    r := r || jsonb_build_object('e4_borrado_definitivo_verificador', sqlerrm);
  end;

  -- ── (f) Grants y EXECUTE ─────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('f1_execute',
    has_function_privilege('authenticated', 'public.medios_publico(uuid[])', 'execute')
    and has_function_privilege('authenticated', 'public.anunciantes_publico(uuid[])', 'execute')
    and has_function_privilege('authenticated', 'private.cuenta_vigente(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.medios_publico(uuid[])', 'execute')
    and not has_function_privilege('authenticated', 'private.medio_ve_anunciante(uuid)', 'execute'));
  r := r || jsonb_build_object('f2_columnas_derivadas_sin_grant',
    not has_column_privilege('authenticated', 'public.cuentas_sociales', 'seguidores_verificados', 'update')
    and not has_column_privilege('authenticated', 'public.cuentas_sociales', 'multiplicador_calidad', 'update')
    and not has_column_privilege('authenticated', 'public.verificaciones_cuenta', 'estado_validacion', 'update')
    and not has_column_privilege('authenticated', 'public.anunciantes', 'estado_verificacion', 'update')
    and not has_column_privilege('authenticated', 'public.medios', 'nivel_verificacion', 'update'));
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.anunciantes;
    r := r || jsonb_build_object('f3_anon_sin_select', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('f3_anon_sin_select', true);
  end;
  execute 'reset role';
  perform set_config('amo.ctx_confiable', '', true);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
