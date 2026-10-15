-- Pruebas de la auditoría adversarial de M5–M11 (migraciones 12a auditoria_transiciones_endurecidas, 12b
-- auditoria_guardas_plataforma y 12c auditoria_recordatorios_idempotentes). Cada prueba reproduce un ataque: deja
-- `true` si la BD lo rechaza (o si el flujo legítimo sigue funcionando) y un texto con lo observado si no.
-- Antes de las migraciones 12a–12c los ataques marcados con «ANTES» tenían éxito (demostrado con este mismo guion):
--   a1/a2  medios.suspender fijaba el nivel de verificación (3 y 2) sin documentos            ANTES: nivel 3 / nivel 2
--   b1     un validador sin metricas.editar_validadas reescribía una métrica RECHAZADA        ANTES: PENDIENTE:777777
--   c1/c8  métrica reabierta con la asignación VERIFICADA ⇒ el medio la reescribía y se liquidaba   ANTES: LIQUIDADA
--   c3/c4  service_role insertaba una liquidación de 99 M y se aprobaba y pagaba sin asignaciones   ANTES: PAGADA
--   c5     quien aprobaba la liquidación fijaba fecha y referencia de pago                    ANTES: 2020-01-01 / FALSA
--   d1–d4  service_role ponía en cero cupos_ocupados y reescribía marcas, verificaciones y retenciones  ANTES: sin error
--   e1     el anunciante escribía comentario_moderacion al cancelar                           ANTES: escrito
--   f1/f2  recordatorios: con la plantilla editada se reenviaban en cada corrida ([1,1,1]); un título con
--          «corte D7 » suprimía el recordatorio de D7 ([1,0])
-- El bloque g conserva los vectores descartados (IDOR por analítica, tablas, storage y procedimientos).
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
begin;

do $aud$
declare
  r jsonb := '{}';
  v_t text; v_h text; v_n bigint; v_j jsonb; v_liq uuid; v_fab uuid; v_d uuid; n1 int; n2 int; n3 int;
  u_adm constant uuid := '00000000-0000-4000-a000-0000000000c1';   -- ADMIN
  u_ope constant uuid := '00000000-0000-4000-a000-0000000000c2';   -- OPERACIONES (valida métricas, no las corrige)
  u_fin constant uuid := '00000000-0000-4000-a000-0000000000c3';   -- FINANZAS
  u_sus constant uuid := '00000000-0000-4000-a000-0000000000c4';   -- rol propio: solo medios.suspender
  u_ana constant uuid := '00000000-0000-4000-a000-0000000000c5';   -- ANUNCIANTE A
  u_anb constant uuid := '00000000-0000-4000-a000-0000000000c6';   -- ANUNCIANTE B
  u_mea constant uuid := '00000000-0000-4000-a000-0000000000c7';   -- MEDIO A
  u_meb constant uuid := '00000000-0000-4000-a000-0000000000c8';   -- MEDIO B
  s_adm constant uuid := '00000000-0000-4000-b000-0000000000c1';
  s_ope constant uuid := '00000000-0000-4000-b000-0000000000c2';
  s_fin constant uuid := '00000000-0000-4000-b000-0000000000c3';
  s_sus constant uuid := '00000000-0000-4000-b000-0000000000c4';
  s_ana constant uuid := '00000000-0000-4000-b000-0000000000c5';
  s_anb constant uuid := '00000000-0000-4000-b000-0000000000c6';
  s_mea constant uuid := '00000000-0000-4000-b000-0000000000c7';
  s_meb constant uuid := '00000000-0000-4000-b000-0000000000c8';
  rol_sus constant uuid := '00000000-0000-4000-9000-0000000000c4';
  an_a constant uuid := '00000000-0000-4000-c000-0000000000ca';
  an_b constant uuid := '00000000-0000-4000-c000-0000000000cb';
  me_a constant uuid := '00000000-0000-4000-d000-0000000000ca';
  me_b constant uuid := '00000000-0000-4000-d000-0000000000cb';
  cu_a constant uuid := '00000000-0000-4000-e000-0000000000ca';
  cu_b constant uuid := '00000000-0000-4000-e000-0000000000cb';
  c1 constant uuid := '00000000-0000-4000-f000-000000000c01';      -- campaña de A
  c2 constant uuid := '00000000-0000-4000-f000-000000000c02';      -- campaña de B
  o1 constant uuid := '00000000-0000-4000-f000-000000000c11';      -- oferta de A en ejecución
  o2 constant uuid := '00000000-0000-4000-f000-000000000c12';      -- oferta de B en ejecución
  o3 constant uuid := '00000000-0000-4000-f000-000000000c13';      -- oferta de B con «corte D7 » en el título
  o4 constant uuid := '00000000-0000-4000-f000-000000000c14';      -- oferta de A en borrador
  a1 constant uuid := '00000000-0000-4000-f000-000000000c21';      -- o1 · medio A · VERIFICADA
  a2 constant uuid := '00000000-0000-4000-f000-000000000c22';      -- o1 · medio B · METRICAS_CARGADAS
  a3 constant uuid := '00000000-0000-4000-f000-000000000c23';      -- o2 · medio A · EVIDENCIA_VALIDADA
  a4 constant uuid := '00000000-0000-4000-f000-000000000c24';      -- o2 · medio B · VERIFICADA
  a5 constant uuid := '00000000-0000-4000-f000-000000000c25';      -- o3 · medio A · EVIDENCIA_VALIDADA (recordatorios)
  p1 constant uuid := '00000000-0000-4000-f000-000000000c31';
  p2 constant uuid := '00000000-0000-4000-f000-000000000c32';
  p3 constant uuid := '00000000-0000-4000-f000-000000000c33';
  p4 constant uuid := '00000000-0000-4000-f000-000000000c34';
  p5 constant uuid := '00000000-0000-4000-f000-000000000c35';
  m1 uuid; m2 uuid; m3 uuid; m4 uuid;                              -- D7: APROBADA, PENDIENTE, RECHAZADA, APROBADA
  c_adm text; c_ope text; c_ana text; c_anb text; c_mea text; c_meb text;
  c_srv constant text := '{"role": "service_role"}';
  d1 date := private.hoy() - 60; d2 date := private.hoy();
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t join public.formatos f on f.id = t.formato_id
                    join public.franjas fr on fr.id = t.franja_id
                    where f.plataforma = 'INSTAGRAM' and f.clave = 'POST_FEED' and fr.clave = 'F1'
                    order by t.vigente_desde desc limit 1);
begin
  -- ── Preparación (owner, modo_carga para fijar estados de partida) ───────────────────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'aud12.adm@amo.test'), (u_ope, 'aud12.ope@amo.test'), (u_fin, 'aud12.fin@amo.test'),
               (u_sus, 'aud12.sus@amo.test'), (u_ana, 'aud12.ana@amo.test'), (u_anb, 'aud12.anb@amo.test'),
               (u_mea, 'aud12.mea@amo.test'), (u_meb, 'aud12.meb@amo.test')) x (u, e);
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa) values (rol_sus, 'AUD12_SUSP', 'Auditoría suspensor', 'ADMIN', true);
  insert into public.rol_permisos (rol_id, permiso_clave) values (rol_sus, 'medios.suspender'), (rol_sus, 'medios.ver');
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'Sonda A S.A.S.', 'Sonda A', '900007701', '1', v_sector, '11001', 'VERIFICADO', now()),
         (an_b, 'Sonda B S.A.S.', 'Sonda B', '900007702', '1', v_sector, '05001', 'VERIFICADO', now());
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Sonda A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, now()),
         (me_b, 'Medio Sonda B', 'CREADOR', '76001', 'VERIFICADO', 1, now());
  insert into public.medios_privado (medio_id, metodo_pago, obligado_facturar) values (me_b, 'BANCARIO', true);
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'aud12_a', 'https://instagram.com/aud12_a', 45000, fr1, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'aud12_b', 'https://instagram.com/aud12_b', 45000, fr1, true, 'MANUAL', now());
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'OPERACIONES'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_ope;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'FINANZAS'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_fin;
  update public.perfiles set rol_id = rol_sus, estado = 'ACTIVO', debe_cambiar_password = false where id = u_sus;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = case id when u_ana then an_a else an_b end where id in (u_ana, u_anb);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false, medio_id = case id when u_mea then me_a else me_b end where id in (u_mea, u_meb);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm, u_adm, now(), now(), 'aal2'), (s_ope, u_ope, now(), now(), 'aal2'), (s_fin, u_fin, now(), now(), 'aal2'),
    (s_sus, u_sus, now(), now(), 'aal2'), (s_ana, u_ana, now(), now(), 'aal1'), (s_anb, u_anb, now(), now(), 'aal1'),
    (s_mea, u_mea, now(), now(), 'aal1'), (s_meb, u_meb, now(), now(), 'aal1');
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total,
                               presupuesto_comprometido, estado, activada_at)
  values (c1, an_a, 'Campaña Sonda A', 'Marca A', private.hoy() - 30, private.hoy() + 30, 20000000, 600000, 'ACTIVA', now()),
         (c2, an_b, 'Campaña Sonda B', 'Marca B', private.hoy() - 30, private.hoy() + 30, 20000000, 900000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo, presupuesto_comprometido,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion,
                              estado, publicada_at, cupos_totales, cupos_ocupados)
  values (o1, c1, an_a, 'Oferta Sonda A', f_post, 'INSTAGRAM', 5000000, 600000, 1, '{D7}', now() - interval '20 days',
          now() + interval '15 days', now() - interval '21 days', 'EN_EJECUCION', now() - interval '25 days', 5, 2),
         (o2, c2, an_b, 'Oferta Sonda B', f_post, 'INSTAGRAM', 5000000, 600000, 1, '{D7}', now() - interval '20 days',
          now() + interval '15 days', now() - interval '21 days', 'EN_EJECUCION', now() - interval '25 days', 5, 2),
         (o3, c2, an_b, 'Promo corte D7 final', f_post, 'INSTAGRAM', 5000000, 300000, 1, '{H24,D7}', now() - interval '20 days',
          now() + interval '15 days', now() - interval '21 days', 'EN_EJECUCION', now() - interval '25 days', 5, 1),
         (o4, c1, an_a, 'Oferta Sonda borrador', f_post, 'INSTAGRAM', 1000000, 0, 1, '{D7}', now() + interval '5 days',
          now() + interval '15 days', now() + interval '4 days', 'BORRADOR', null, 0, 0);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales, cupos_ocupados)
  values (o1, fr1, 5, 2), (o2, fr1, 5, 2), (o3, fr1, 5, 1);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, contenido_descargado_at, publicada_at, evidencia_validada_at, metricas_cargadas_at, verificada_at,
    fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id, seguidores_al_aceptar)
  values
    (a1, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'VERIFICADA', now() - interval '19 days', now() - interval '18 days',
     now() - interval '17 days', now() - interval '16 days', now() - interval '9 days', now() - interval '8 days',
     now() + interval '15 days', 1, 300000, v_tarifa, fr1, 45000),
    (a2, o1, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'METRICAS_CARGADAS', now() - interval '19 days', now() - interval '18 days',
     now() - interval '17 days', now() - interval '16 days', now() - interval '9 days', null,
     now() + interval '15 days', 1, 300000, v_tarifa, fr1, 45000),
    (a3, o2, c2, an_b, me_a, cu_a, 'INSTAGRAM', 1, 'EVIDENCIA_VALIDADA', now() - interval '19 days', now() - interval '18 days',
     now() - interval '4 days', now() - interval '3 days', null, null,
     now() + interval '15 days', 1, 300000, v_tarifa, fr1, 45000),
    (a4, o2, c2, an_b, me_b, cu_b, 'INSTAGRAM', 1, 'VERIFICADA', now() - interval '19 days', now() - interval '18 days',
     now() - interval '17 days', now() - interval '16 days', now() - interval '9 days', now() - interval '8 days',
     now() + interval '15 days', 1, 300000, v_tarifa, fr1, 45000),
    (a5, o3, c2, an_b, me_a, cu_a, 'INSTAGRAM', 1, 'EVIDENCIA_VALIDADA', now() - interval '19 days', now() - interval '18 days',
     now() - interval '2 days', now() - interval '1 days', null, null,
     now() + interval '15 days', 1, 300000, v_tarifa, fr1, 45000);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen, monto_comision)
  values (a1, me_a, 300000, 0.2, 'GLOBAL', 60000), (a2, me_b, 300000, 0.2, 'GLOBAL', 60000),
         (a3, me_a, 300000, 0.2, 'GLOBAL', 60000), (a4, me_b, 300000, 0.2, 'GLOBAL', 60000),
         (a5, me_a, 300000, 0.2, 'GLOBAL', 60000);
  insert into public.publicaciones (id, asignacion_id, numero, url_post, fecha_publicacion, captura_path, etiqueta_publicidad_confirmada,
                                    etiqueta_verificada, permanencia_hasta, permanencia_verificada_at, estado_validacion)
  values (p1, a1, 1, 'https://www.instagram.com/p/aud1/', now() - interval '17 days', 'asignacion/' || a1 || '/publicacion/1-c.webp',
          true, true, now() - interval '10 days', now() - interval '8 days', 'APROBADA'),
         (p2, a2, 1, 'https://www.instagram.com/p/aud2/', now() - interval '17 days', 'asignacion/' || a2 || '/publicacion/1-c.webp',
          true, true, now() - interval '10 days', null, 'APROBADA'),
         (p3, a3, 1, 'https://www.instagram.com/p/aud3/', now() - interval '3 days', 'asignacion/' || a3 || '/publicacion/1-c.webp',
          true, true, now() + interval '4 days', null, 'APROBADA'),
         (p4, a4, 1, 'https://www.instagram.com/p/aud4/', now() - interval '17 days', 'asignacion/' || a4 || '/publicacion/1-c.webp',
          true, true, now() - interval '10 days', now() - interval '8 days', 'APROBADA'),
         (p5, a5, 1, 'https://www.instagram.com/p/aud5/', now() - interval '2 days', 'asignacion/' || a5 || '/publicacion/1-c.webp',
          true, true, now() + interval '5 days', null, 'APROBADA');
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path, estado_validacion)
  values (p1, 'D7', now() - interval '10 days', 10000, 15000, 'asignacion/' || a1 || '/metrica/d7.webp', 'APROBADA') returning id into m1;
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path, estado_validacion)
  values (p2, 'D7', now() - interval '10 days', 9000, 12000, 'asignacion/' || a2 || '/metrica/d7.webp', 'PENDIENTE') returning id into m2;
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path, estado_validacion)
  values (p3, 'D7', now() - interval '1 days', 8000, 11000, 'asignacion/' || a3 || '/metrica/d7.webp', 'RECHAZADA') returning id into m3;
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path, estado_validacion)
  values (p4, 'D7', now() - interval '10 days', 7000, 10000, 'asignacion/' || a4 || '/metrica/d7.webp', 'APROBADA') returning id into m4;
  insert into storage.objects (bucket_id, name)
  values ('evidencias', 'asignacion/' || a1 || '/publicacion/1-c.webp'), ('documentos', 'medio/' || me_a || '/RUT/r.pdf');
  perform set_config('amo.modo_carga', '', true);
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_ope := jsonb_build_object('sub', u_ope, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_ope)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_anb := jsonb_build_object('sub', u_anb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anb)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;
  perform set_config('amo.ctx_confiable', 'no', true);

  -- ── (f) Recordatorios idempotentes (12c): no dependen del texto de la plantilla ni del título ────────
  begin
    update public.plantillas_notificacion
       set cuerpo = 'Sube las métricas ({{corte}}) de «{{oferta}}» antes del {{fecha_limite}}.'
     where clave = 'asignacion.recordatorio_metricas';
    n1 := private.generar_recordatorios(); n2 := private.generar_recordatorios(); n3 := private.generar_recordatorios();
    raise exception 'deshacer';
  exception when others then
    r := r || jsonb_build_object('f1_plantilla_editada_no_reenvia',
      case when sqlerrm = 'deshacer' and n1 = 1 and n2 = 0 and n3 = 0 then to_jsonb(true)
           else to_jsonb(format('%s [%s,%s,%s]', sqlerrm, n1, n2, n3)) end);
  end;
  -- Recordatorios acumulados de a5 tras cada corrida: H24 hoy; D7 seis días después (el título contiene «corte D7 »).
  perform private.generar_recordatorios();
  select count(*) into n1 from public.notificaciones n where n.tipo = 'asignacion.recordatorio_metricas' and n.entidad_id = a5::text;
  perform set_config('amo.reloj', (now() + interval '6 days')::text, true);
  perform private.generar_recordatorios();
  select count(*) into n2 from public.notificaciones n where n.tipo = 'asignacion.recordatorio_metricas' and n.entidad_id = a5::text;
  perform private.generar_recordatorios();
  select count(*) into n3 from public.notificaciones n where n.tipo = 'asignacion.recordatorio_metricas' and n.entidad_id = a5::text;
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('f2_titulo_no_suprime_corte',
    case when n1 = 1 and n2 = 2 and n3 = 2 then to_jsonb(true) else to_jsonb(format('[%s,%s,%s]', n1, n2, n3)) end);
  r := r || jsonb_build_object('f3_registro_por_asignacion_y_corte',
    (select count(*) = 2 and count(*) filter (where corte = 'H24') = 1 and count(*) filter (where corte = 'D7') = 1
     from private.recordatorios_metricas where asignacion_id = a5));
  r := r || jsonb_build_object('f4_tabla_interna_sin_grants',
    not has_table_privilege('authenticated', 'private.recordatorios_metricas', 'select, insert, update, delete')
    and not has_table_privilege('service_role', 'private.recordatorios_metricas', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'private.recordatorios_metricas', 'select, insert, update, delete'));

  -- ── (a) Nivel de verificación: solo en las transiciones que validan documentos (12a) ────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('medios', me_a, 'SUSPENDIDO', u_sus, s_sus, 'Auditoría', '{"nivel": 3}');
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  r := r || jsonb_build_object('a1_suspender_no_cambia_nivel',
    case when v_t = 'ok' and (select estado = 'SUSPENDIDO' and nivel_verificacion = 1 from public.medios where id = me_a)
         then to_jsonb(true) else to_jsonb(v_t || ' nivel=' || (select nivel_verificacion from public.medios where id = me_a)) end);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('medios', me_a, 'VERIFICADO', u_sus, s_sus, 'Auditoría reactivar', '{"nivel": 2}');
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  r := r || jsonb_build_object('a2_reactivar_no_cambia_nivel',
    case when v_t = 'ok' and (select estado = 'VERIFICADO' and nivel_verificacion = 1 from public.medios where id = me_a)
         then to_jsonb(true) else to_jsonb(v_t || ' nivel=' || (select nivel_verificacion from public.medios where id = me_a)) end);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('medios', me_a, 'VERIFICADO', u_sus, s_sus, 'Subir nivel', '{"nivel": 2}');
    r := r || jsonb_build_object('a3_subir_nivel_exige_medios_verificar', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a3_subir_nivel_exige_medios_verificar', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  begin
    perform public.transicionar_srv('medios', me_a, 'VERIFICADO', u_ope, s_ope, 'Subir nivel', '{"nivel": 2}');
    r := r || jsonb_build_object('a4_subir_nivel_exige_documentos', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a4_subir_nivel_exige_documentos', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';

  -- ── (g) Vectores descartados: aislamiento entre organizaciones (deben seguir cerrados) ──────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(to_jsonb(x)), '[]')::text into v_t from public.reporte_desempeno_campanas(d1, d2, an_b) x;
  r := r || jsonb_build_object('g1_anunciante_no_ve_reporte_ajeno', v_t not like '%Sonda B%');
  r := r || jsonb_build_object('g2_anunciante_solo_sus_filas',
    (select count(*) = 2 from public.asignaciones) and (select count(*) = 0 from public.asignaciones where anunciante_id <> an_a)
    and (select count(*) = 0 from public.metricas where anunciante_id <> an_a) and (select count(*) = 0 from public.asignacion_montos)
    and (select count(*) = 0 from public.medios) and (select count(*) = 0 from public.campanas where anunciante_id <> an_a)
    and (select count(*) = 0 from public.ofertas where anunciante_id <> an_a) and (select count(*) = 0 from public.cuentas_sociales)
    and (select count(*) = 0 from public.desempeno_anunciante(d1, d2, 'campana', c2)));
  begin
    perform public.kpis_admin(d1, d2);
    r := r || jsonb_build_object('g3_anunciante_sin_kpis_admin', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g3_anunciante_sin_kpis_admin', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  r := r || jsonb_build_object('g4_storage_anunciante',
    (select count(*) = 1 from storage.objects where bucket_id = 'evidencias')
    and (select count(*) = 0 from storage.objects where bucket_id = 'documentos'));
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('g5_medio_solo_sus_filas',
    (select count(*) = 0 from public.asignaciones) and (select count(*) = 3 from public.mis_asignaciones_medio())
    and (select count(*) = 0 from public.mis_asignaciones_medio() x where x.id not in (a1, a3, a5))
    and (select count(*) = 0 from public.metricas where medio_id <> me_a) and (select count(*) = 0 from public.campanas)
    and (select count(*) = 0 from public.ofertas) and (select count(*) = 0 from public.asignacion_montos)
    and (select count(*) = 0 from public.ofertas_para_medio(o4)) and (select count(*) = 0 from public.medios_publico(array[me_b])));
  begin
    perform public.cotizar_oferta(o1, cu_b);
    r := r || jsonb_build_object('g6_cotizar_con_cuenta_ajena', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g6_cotizar_con_cuenta_ajena', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('g7_storage_medio_ajeno_no_lee', (select count(*) = 0 from storage.objects));
  begin
    insert into storage.objects (bucket_id, name) values ('evidencias', 'asignacion/' || a1 || '/publicacion/x.webp');
    r := r || jsonb_build_object('g8_storage_subir_en_asignacion_ajena', 'NO FALLÓ');
  exception when insufficient_privilege then r := r || jsonb_build_object('g8_storage_subir_en_asignacion_ajena', true); end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('evidencias', 'asignacion/' || a2 || '/publicacion/../../' || a1 || '/publicacion/x.webp');
    r := r || jsonb_build_object('g9_storage_ruta_manipulada', 'NO FALLÓ');
  exception when insufficient_privilege then r := r || jsonb_build_object('g9_storage_ruta_manipulada', true); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('ofertas', o4, 'CANCELADA', u_anb, s_anb);
    r := r || jsonb_build_object('g10_anunciante_cancela_oferta_ajena', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g10_anunciante_cancela_oferta_ajena', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    perform public.abrir_disputa_srv(a1, 'METRICAS', 'Disputa sobre una asignación ajena', u_meb, s_meb);
    r := r || jsonb_build_object('g11_medio_disputa_ajena', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g11_medio_disputa_ajena', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    perform public.generar_liquidacion_srv(me_b, d1, d2, u_meb, s_meb);
    r := r || jsonb_build_object('g12_medio_se_liquida', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g12_medio_se_liquida', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    perform public.transicionar_srv('metricas', m2, 'APROBADA', u_adm, s_ope);
    r := r || jsonb_build_object('g13_sesion_de_otro_usuario', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g13_sesion_de_otro_usuario', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    perform public.reservar_cupo_srv(o1, me_a, cu_a, u_meb, s_meb);
    r := r || jsonb_build_object('g14_reservar_para_otro_medio', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('g14_reservar_para_otro_medio', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  execute 'reset role';

  -- ── (b) Edición de métricas, §10.8 (12a) ────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_ope, true);
  execute 'set local role authenticated';
  begin
    update public.metricas set alcance = 777777 where id = m3;
    r := r || jsonb_build_object('b1_validador_no_corrige_rechazada', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('b1_validador_no_corrige_rechazada', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    update public.metricas set alcance = 777777 where id = m1;
    r := r || jsonb_build_object('b2_validador_no_corrige_aprobada', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('b2_validador_no_corrige_aprobada', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  update public.metricas set alcance = 9001 where id = m2; get diagnostics v_n = row_count;
  r := r || jsonb_build_object('b3_validador_ajusta_pendiente', v_n = 1);
  execute 'reset role';
  r := r || jsonb_build_object('b1_rechazada_intacta', (select estado_validacion = 'RECHAZADA' and alcance = 8000 from public.metricas where id = m3));
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 555 where id in (m1, m3); get diagnostics v_n = row_count;
  r := r || jsonb_build_object('b5_medio_no_edita_ajenas', v_n = 0);
  begin
    update public.metricas set estado_validacion = 'APROBADA' where id = m2;
    r := r || jsonb_build_object('b6_medio_no_se_aprueba', 'NO FALLÓ');
  exception when insufficient_privilege then r := r || jsonb_build_object('b6_medio_no_se_aprueba', true); end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 555 where id = m1; get diagnostics v_n = row_count;
  r := r || jsonb_build_object('b4_medio_no_edita_su_aprobada', v_n = 0);
  update public.metricas set alcance = 8100 where id = m3; get diagnostics v_n = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('b7_medio_corrige_su_rechazada',
    v_n = 1 and (select estado_validacion = 'PENDIENTE' and alcance = 8100 from public.metricas where id = m3)
    and (select estado = 'METRICAS_CARGADAS' from public.asignaciones where id = a3));
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 7001 where id = m4; get diagnostics v_n = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('b8_admin_corrige_validada_con_bitacora',
    v_n = 1 and (select estado_validacion = 'APROBADA' and alcance = 7001 from public.metricas where id = m4)
    and exists (select 1 from public.bitacora b where b.entidad = 'metricas' and b.entidad_id = m4::text and b.accion = 'UPDATE'
                  and b.cambios ? 'alcance'));

  -- ── (d) Guardas de plataforma frente al servidor (12b) ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    update public.oferta_cupos set cupos_ocupados = 0 where oferta_id = o1;
    r := r || jsonb_build_object('d1_srv_no_toca_cupos_ocupados', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d1_srv_no_toca_cupos_ocupados', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    update public.asignaciones set fecha_limite_publicacion = now() + interval '10 years', verificada_at = now() - interval '5 years',
           es_demo = true where id = a1;
    r := r || jsonb_build_object('d2_srv_no_reescribe_marcas', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d2_srv_no_reescribe_marcas', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    update public.asignaciones set liquidacion_id = gen_random_uuid() where id = a2;
    r := r || jsonb_build_object('d2b_srv_no_enlaza_liquidacion', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d2b_srv_no_enlaza_liquidacion', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    update public.publicaciones set permanencia_verificada_at = now(), observaciones = 'ok' where id = p3;
    r := r || jsonb_build_object('d3_srv_no_verifica_evidencia', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d3_srv_no_verifica_evidencia', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    update public.asignacion_montos set retenciones_aplicadas = '[]', monto_retenciones = 0, monto_neto = 240000 where asignacion_id = a2;
    r := r || jsonb_build_object('d4_srv_no_fija_retenciones', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d4_srv_no_fija_retenciones', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    update public.asignaciones set estado = 'VERIFICADA' where id = a2;
    r := r || jsonb_build_object('d5_estado_solo_via_transicion', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d5_estado_solo_via_transicion', sqlerrm = 'AMO_ESTADO_SOLO_VIA_TRANSICION'); end;
  begin
    insert into public.publicaciones (asignacion_id, numero, url_post, fecha_publicacion, captura_path, permanencia_hasta)
    values (a2, 2, 'https://www.instagram.com/p/falsa/', now(), 'asignacion/' || a2 || '/publicacion/2-c.webp', now());
    r := r || jsonb_build_object('d6_srv_no_inserta_publicacion', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d6_srv_no_inserta_publicacion', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    insert into public.disputas (asignacion_id, abierta_por, parte, motivo, descripcion, estado, estado_asignacion_origen)
    values (a2, u_adm, 'ADMIN', 'METRICAS', 'Disputa insertada sin procedimiento', 'ABIERTA', 'METRICAS_CARGADAS');
    r := r || jsonb_build_object('d7_srv_no_inserta_disputa', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d7_srv_no_inserta_disputa', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    insert into public.descargas_contenido (asignacion_id, creativo_id) values (a2, gen_random_uuid());
    r := r || jsonb_build_object('d8_srv_no_inserta_descarga', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('d8_srv_no_inserta_descarga', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  begin
    insert into public.liquidaciones (medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
      monto_medio, monto_retenciones, monto_neto, estado, requiere_documento_soporte, creada_por)
    values (me_b, private.hoy() - 400, private.hoy() - 390, 0, 99000000, 0, 99000000, 0, 99000000, 'BORRADOR', false, u_fin);
    r := r || jsonb_build_object('c3_srv_no_inserta_liquidacion', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('c3_srv_no_inserta_liquidacion', sqlerrm = 'AMO_NO_AUTORIZADO'); end;
  -- Lo legítimo sigue funcionando: cupos de un borrador desde el servidor y desde el anunciante dueño.
  begin
    insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o4, fr1, 3);
    update public.oferta_cupos set cupos_totales = 4 where oferta_id = o4;
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  update public.oferta_cupos set cupos_totales = 5 where oferta_id = o4; get diagnostics v_n = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('d9_cupos_de_borrador_siguen_editables',
    case when v_t = 'ok' and v_n = 1 and (select cupos_totales = 5 from public.ofertas where id = o4) then to_jsonb(true)
         else to_jsonb(v_t || ' filas=' || v_n) end);
  r := r || jsonb_build_object('d10_contadores_intactos',
    (select cupos_ocupados = 2 from public.oferta_cupos where oferta_id = o1)
    and (select fecha_limite_publicacion > now() and not es_demo and liquidacion_id is null from public.asignaciones where id = a1)
    and (select permanencia_verificada_at is null and observaciones is null from public.publicaciones where id = p3)
    and (select monto_neto is null from public.asignacion_montos where asignacion_id = a2));

  -- ── (e) Datos de la transición con lista blanca por transición (12a) ────────────────────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('ofertas', o4, 'CANCELADA', u_ana, s_ana, null, '{"comentario_moderacion": "Aprobada por moderación"}');
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  r := r || jsonb_build_object('e1_anunciante_no_escribe_moderacion',
    case when v_t = 'ok' and (select estado = 'CANCELADA' and comentario_moderacion is null from public.ofertas where id = o4)
         then to_jsonb(true) else to_jsonb(v_t) end);

  -- ── (c) Cadena de pago, §6.2 y §10.5 (12a + 12b) ────────────────────────────────────────────────────
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('metricas', m4, 'PENDIENTE', u_adm, s_adm, 'Reabrir');
    r := r || jsonb_build_object('c1_no_reabre_metrica_de_verificada', 'NO FALLÓ');
  exception when others then
    get stacked diagnostics v_h = pg_exception_hint;
    r := r || jsonb_build_object('c1_no_reabre_metrica_de_verificada',
      sqlerrm = 'AMO_TRANSICION_INVALIDA' and v_h = 'metrica_de_asignacion_verificada');
  end;
  begin
    perform public.transicionar_srv('asignaciones', a2, 'LIQUIDADA', u_fin, s_fin);
    r := r || jsonb_build_object('c2_no_liquida_sin_verificar', 'NO FALLÓ');
  exception when others then r := r || jsonb_build_object('c2_no_liquida_sin_verificar', sqlerrm = 'AMO_TRANSICION_INVALIDA'); end;
  execute 'reset role';
  -- Liquidación fabricada (aquí la inserta el owner): ni se aprueba ni se paga porque no corresponde a asignaciones.
  insert into public.liquidaciones (medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
    monto_medio, monto_retenciones, monto_neto, estado, requiere_documento_soporte, creada_por, numero_factura_medio)
  values (me_a, private.hoy() - 400, private.hoy() - 390, 0, 99000000, 0, 99000000, 0, 99000000, 'BORRADOR', false, u_fin, 'FV-1')
  returning id into v_fab;
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('liquidaciones', v_fab, 'APROBADA', u_adm, s_adm);
    r := r || jsonb_build_object('c4_liquidacion_sin_asignaciones_no_se_aprueba', 'NO FALLÓ');
  exception when others then
    get stacked diagnostics v_h = pg_exception_hint;
    r := r || jsonb_build_object('c4_liquidacion_sin_asignaciones_no_se_aprueba',
      sqlerrm = 'AMO_TRANSICION_INVALIDA' and v_h = 'liquidacion_integridad');
  end;
  -- Flujo real del medio B: solo entra la VERIFICADA; quien aprueba no fija datos de pago; el pago sigue funcionando.
  begin
    v_liq := public.generar_liquidacion_srv(me_b, d1, d2, u_fin, s_fin);
    perform public.transicionar_srv('liquidaciones', v_liq, 'APROBADA', u_adm, s_adm, null,
                                    '{"fecha_pago": "2020-01-01", "referencia_pago": "FALSA"}');
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  r := r || jsonb_build_object('c5_aprobar_no_fija_datos_de_pago',
    case when v_t = 'ok' and (select estado = 'APROBADA' and cantidad_asignaciones = 1 and fecha_pago is null and referencia_pago is null
                              from public.liquidaciones where id = v_liq)
              and (select estado = 'METRICAS_CARGADAS' and liquidacion_id is null from public.asignaciones where id = a2)
         then to_jsonb(true) else to_jsonb(v_t) end);
  execute 'set local role service_role';
  begin
    update public.liquidaciones set numero_factura_medio = 'FV-9', factura_medio_path = 'liquidacion/' || v_liq || '/f.pdf' where id = v_liq;
    perform public.registrar_pago_liquidacion_srv(v_liq, private.hoy(), 'REF-1', 'liquidacion/' || v_liq || '/s.pdf', u_fin, s_fin);
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  r := r || jsonb_build_object('c6_pago_legitimo_funciona',
    case when v_t = 'ok' and (select estado = 'PAGADA' and referencia_pago = 'REF-1' and fecha_pago = private.hoy()
                              from public.liquidaciones where id = v_liq)
              and (select estado = 'PAGADA' from public.asignaciones where id = a4) then to_jsonb(true) else to_jsonb(v_t) end);
  -- Disputa sobre una VERIFICADA: la métrica se puede reabrir, pero no se restaura a VERIFICADA con ella pendiente.
  execute 'set local role service_role';
  begin
    v_d := public.abrir_disputa_srv(a1, 'METRICAS', 'Las métricas no coinciden con lo observado', u_ana, s_ana);
    perform public.transicionar_srv('metricas', m1, 'PENDIENTE', u_adm, s_adm, 'Reabrir durante la disputa');
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  r := r || jsonb_build_object('c7_en_disputa_si_se_reabre', to_jsonb(v_t) = '"ok"'::jsonb);
  begin
    perform public.transicionar_srv('disputas', v_d, 'DESCARTADA', u_adm, s_adm, 'Sin fundamento');
    r := r || jsonb_build_object('c8_no_restaura_verificada_con_metrica_pendiente', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c8_no_restaura_verificada_con_metrica_pendiente', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.transicionar_srv('metricas', m1, 'APROBADA', u_ope, s_ope);
    perform public.transicionar_srv('disputas', v_d, 'DESCARTADA', u_adm, s_adm, 'Sin fundamento');
    v_t := 'ok';
  exception when others then v_t := sqlerrm; end;
  execute 'reset role';
  r := r || jsonb_build_object('c9_restaura_con_metricas_aprobadas',
    case when v_t = 'ok' and (select estado = 'VERIFICADA' from public.asignaciones where id = a1)
              and (select estado_validacion = 'APROBADA' from public.metricas where id = m1) then to_jsonb(true) else to_jsonb(v_t) end);

  -- ── (z) Estructura ──────────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('z1_triggers_solo_plataforma',
    (select count(*) = 10 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where p.proname = 'fn_solo_plataforma' and not t.tgisinternal));
  r := r || jsonb_build_object('z2_nucleo_sin_execute_para_la_api',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'private'
                  and p.proname in ('aplicar_transicion', 'validar_condicion_transicion', 'ejecutar_transicion', 'fn_solo_plataforma',
                                    'fn_metricas_guardar_edicion', 'generar_recordatorios')
                  and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute')
                       or has_function_privilege('anon', p.oid, 'execute'))));
  perform set_config('humo.resultado', r::text, true);
end
$aud$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
