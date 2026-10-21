-- Pruebas de humo de la migración 11 (cron): procedures por lotes (vencer_asignaciones y actualizar_estados con
-- p_confirmar = false, porque dentro de esta transacción no se puede hacer COMMIT), recordatorios, reverificación,
-- multiplicadores de calidad (cálculo, aviso y aplicación con amo.reloj), indicadores de medios, retención, purga demo
-- y la agenda de pg_cron (6 jobs con horarios UTC).
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
-- Cada prueba deja `true` si pasa o un texto con lo observado si falla.
begin;
-- Límite del lado del servidor: la suite retira los datos demo dentro de la transacción (unos 15 s con el juego demo
-- actual) y mientras tanto los mantiene bloqueados. Si no termina a tiempo (p. ej. espera a otra transacción), se
-- cancela y revierte en vez de seguir viva cuando el cliente (MCP) ya dejó de esperar. No ejecutar en paralelo con
-- otra suite que también purgue.
set local statement_timeout = '45s';

do $humo$
declare
  r jsonb := '{}';
  v_n integer;
  v_j jsonb;
  v_ok boolean;
  u_mea constant uuid := '00000000-0000-4000-a000-000000000b01';
  u_meb constant uuid := '00000000-0000-4000-a000-000000000b02';
  u_ana constant uuid := '00000000-0000-4000-a000-000000000b03';
  an_a constant uuid := '00000000-0000-4000-c000-000000000b01';
  an_d constant uuid := '00000000-0000-4000-c000-000000000b0d';
  me_a constant uuid := '00000000-0000-4000-d000-000000000b01';
  me_b constant uuid := '00000000-0000-4000-d000-000000000b02';
  me_d constant uuid := '00000000-0000-4000-d000-000000000b0d';
  cu_a constant uuid := '00000000-0000-4000-e000-000000000b01';
  cu_b constant uuid := '00000000-0000-4000-e000-000000000b02';
  cu_d constant uuid := '00000000-0000-4000-e000-000000000b0d';
  c1 constant uuid := '00000000-0000-4000-f000-000000000b01';
  c2 constant uuid := '00000000-0000-4000-f000-000000000b02';
  c_d constant uuid := '00000000-0000-4000-f000-000000000b0d';
  o1 constant uuid := '00000000-0000-4000-f000-000000000b11';
  o2 constant uuid := '00000000-0000-4000-f000-000000000b12';
  o3 constant uuid := '00000000-0000-4000-f000-000000000b13';
  o4 constant uuid := '00000000-0000-4000-f000-000000000b14';
  o5 constant uuid := '00000000-0000-4000-f000-000000000b15';
  o6 constant uuid := '00000000-0000-4000-f000-000000000b16';
  o_d constant uuid := '00000000-0000-4000-f000-000000000b1d';
  a1 constant uuid := '00000000-0000-4000-f000-000000000b21';
  a2 constant uuid := '00000000-0000-4000-f000-000000000b22';
  a3 constant uuid := '00000000-0000-4000-f000-000000000b23';
  a4 constant uuid := '00000000-0000-4000-f000-000000000b24';
  a5 constant uuid := '00000000-0000-4000-f000-000000000b25';
  a6 constant uuid := '00000000-0000-4000-f000-000000000b26';
  a_d constant uuid := '00000000-0000-4000-f000-000000000b2d';
  p3 constant uuid := '00000000-0000-4000-f000-000000000b33';
  p4 constant uuid := '00000000-0000-4000-f000-000000000b34';
  p5 constant uuid := '00000000-0000-4000-f000-000000000b35';
  p6 constant uuid := '00000000-0000-4000-f000-000000000b36';
  rs1 constant uuid := '00000000-0000-4000-f000-000000000b41';
  f1 constant uuid := '00000000-0000-4000-f000-000000000b51';
  dm1 constant uuid := '00000000-0000-4000-f000-000000000b61';
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t join public.formatos f on f.id = t.formato_id
                    join public.franjas fr on fr.id = t.franja_id
                    where f.plataforma = 'INSTAGRAM' and f.clave = 'POST_FEED' and fr.clave = 'F1'
                    order by t.vigente_desde desc limit 1);
begin
  -- ── Preparación (owner, modo_carga) ─────────────────────────────────────────────────────────────────
  update public.configuracion set valor = to_jsonb(1) where clave = 'calidad.minimo_publicaciones';
  perform set_config('amo.modo_carga', 'on', true);
  -- Las funciones programadas recorren toda la plataforma y aquí el mínimo de publicaciones baja a 1: con los datos
  -- demo que traiga la BD recalcularían cientos de cuentas (la suite no terminaba a tiempo). Se retiran dentro de esta
  -- transacción con la purga de la propia BD (que así se ejerce sobre el juego demo completo); la sección (e) la
  -- vuelve a probar con los datos demo de la prueba.
  perform set_config('amo.purga', 'on', true);
  perform private.purgar_demo();
  perform set_config('amo.purga', '', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_mea, 'humo11.mea@amo.test'), (u_meb, 'humo11.meb@amo.test'), (u_ana, 'humo11.ana@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at, es_demo)
  values (an_a, 'Humo Once A S.A.S.', 'Humo Once A', '900001101', '1', v_sector, '11001', 'VERIFICADO', now(), false),
         (an_d, 'Demo Once S.A.S.', 'Demo Once', '900001109', '1', v_sector, '11001', 'VERIFICADO', now(), true);
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at, es_demo)
  values (me_a, 'Medio Once A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, now(), false),
         (me_b, 'Medio Once B', 'CREADOR', '76001', 'VERIFICADO', 1, now(), false),
         (me_d, 'Medio Demo Once', 'CREADOR', '76001', 'VERIFICADO', 1, now(), true);
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo11_a', 'https://instagram.com/humo11_a', 45000, fr1, true, 'MANUAL', now() - interval '25 days'),
         (cu_b, me_b, 'INSTAGRAM', 'humo11_b', 'https://instagram.com/humo11_b', 45000, fr1, true, 'MANUAL', now() - interval '40 days'),
         (cu_d, me_d, 'INSTAGRAM', 'humo11_d', 'https://instagram.com/humo11_d', 45000, fr1, false, null, null);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false, medio_id = case id when u_mea then me_a else me_b end where id in (u_mea, u_meb);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = an_a where id = u_ana;
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, presupuesto_comprometido,
                               estado, activada_at, es_demo)
  values (c1, an_a, 'Campaña Once', 'Marca Humo', private.hoy() - 30, private.hoy() + 30, 20000000, 600000, 'ACTIVA', now(), false),
         (c2, an_a, 'Campaña Once vencida', 'Marca Humo', private.hoy() - 30, private.hoy() - 2, 1000000, 0, 'ACTIVA', now(), false),
         (c_d, an_d, 'Campaña Demo Once', 'Marca Demo', private.hoy() - 30, private.hoy() + 30, 1000000, 0, 'ACTIVA', now(), true);
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo, presupuesto_comprometido,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion,
                              estado, publicada_at, cupos_totales, cupos_ocupados)
  values (o1, c1, an_a, 'Oferta Once en curso', f_post, 'INSTAGRAM', 5000000, 600000, 1, '{D7}', now() - interval '1 day',
          now() + interval '10 days', now() + interval '1 day', 'PUBLICADA', now() - interval '5 days', 5, 2),
         (o2, c1, an_a, 'Oferta Once sin aceptar', f_post, 'INSTAGRAM', 5000000, 0, 1, '{D7}', now() + interval '1 day',
          now() + interval '10 days', now() - interval '1 hour', 'PUBLICADA', now() - interval '5 days', 5, 0),
         (o3, c1, an_a, 'Oferta Once vencida', f_post, 'INSTAGRAM', 5000000, 0, 1, '{D7}', now() - interval '10 days',
          now() - interval '1 day', now() - interval '12 days', 'VENCIDA', now() - interval '20 days', 5, 0),
         (o4, c2, an_a, 'Oferta Once cerrada', f_post, 'INSTAGRAM', 1000000, 0, 1, '{D7}', now() - interval '20 days',
          now() - interval '5 days', now() - interval '21 days', 'CERRADA', now() - interval '25 days', 5, 0),
         (o5, c1, an_a, 'Oferta Once métricas', f_post, 'INSTAGRAM', 5000000, 0, 1, '{D7}', now() - interval '12 days',
          now() + interval '5 days', now() - interval '13 days', 'EN_EJECUCION', now() - interval '14 days', 5, 0),
         (o6, c1, an_a, 'Oferta Once cortes', f_post, 'INSTAGRAM', 5000000, 0, 1, '{H24,D7}', now() - interval '3 days',
          now() + interval '5 days', now() - interval '4 days', 'EN_EJECUCION', now() - interval '5 days', 5, 0),
         (o_d, c_d, an_d, 'Oferta Demo Once', f_post, 'INSTAGRAM', 1000000, 0, 1, '{D7}', now() + interval '1 day',
          now() + interval '10 days', now() + interval '1 day', 'PUBLICADA', now(), 5, 1);
  -- La oferta demo lleva un cupo ocupado en sus contadores, como cualquier oferta demo real: la purga debe poder
  -- borrarla (e4; antes de 20261006152348_purga_demo_cupos_en_cascada fallaba con ofertas_cupos_ocupados_chk).
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales, cupos_ocupados)
  values (o1, fr1, 5, 2), (o2, fr1, 5, 0), (o3, fr1, 5, 0), (o4, fr1, 5, 0), (o5, fr1, 5, 0), (o6, fr1, 5, 0), (o_d, fr1, 5, 1);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, contenido_descargado_at, publicada_at, evidencia_validada_at, verificada_at, fecha_limite_publicacion,
    publicaciones, monto_bruto, tarifa_id, franja_id, es_demo)
  values
    (a1, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'ACEPTADA', now() - interval '4 days', null, null, null, null,
     now() - interval '1 hour', 1, 300000, v_tarifa, fr1, false),
    (a2, o1, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'ACEPTADA', now() - interval '4 days', null, null, null, null,
     now() + interval '12 hours', 1, 300000, v_tarifa, fr1, false),
    (a3, o5, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'EVIDENCIA_VALIDADA', now() - interval '13 days', now() - interval '12 days',
     now() - interval '10 days', now() - interval '9 days', null, now() - interval '9 days', 1, 300000, v_tarifa, fr1, false),
    (a4, o6, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'PUBLICADA', now() - interval '4 days', now() - interval '3 days',
     now() - interval '2 days', null, null, now() + interval '3 days', 1, 300000, v_tarifa, fr1, false),
    (a5, o5, c1, an_a, me_a, cu_a, 'INSTAGRAM', 2, 'VERIFICADA', now() - interval '25 days', now() - interval '24 days',
     now() - interval '21 days', now() - interval '20 days', now() - interval '12 days', now() - interval '20 days', 1, 300000,
     v_tarifa, fr1, false),
    (a6, o5, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'VERIFICADA', now() - interval '25 days', now() - interval '24 days',
     now() - interval '21 days', now() - interval '20 days', now() - interval '12 days', now() - interval '20 days', 1, 300000,
     v_tarifa, fr1, false),
    (a_d, o_d, c_d, an_d, me_d, cu_d, 'INSTAGRAM', 1, 'RECHAZADA', null, null, null, null, null, null, 1, null, null, null, true);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen, monto_comision)
  values (a1, me_a, 300000, 0.2, 'GLOBAL', 60000), (a2, me_b, 300000, 0.2, 'GLOBAL', 60000);
  insert into public.publicaciones (id, asignacion_id, numero, url_post, fecha_publicacion, captura_path, etiqueta_publicidad_confirmada,
                                    etiqueta_verificada, permanencia_hasta, estado_validacion)
  values (p3, a3, 1, 'https://www.instagram.com/p/humo11c/', now() - interval '10 days', 'asignacion/' || a3 || '/publicacion/1-c.webp',
          true, true, now() - interval '3 days', 'APROBADA'),
         (p4, a4, 1, 'https://www.instagram.com/p/humo11d/', now() - interval '2 days', 'asignacion/' || a4 || '/publicacion/1-c.webp',
          true, false, now() + interval '5 days', 'PENDIENTE'),
         (p5, a5, 1, 'https://www.instagram.com/p/humo11e/', now() - interval '21 days', 'asignacion/' || a5 || '/publicacion/1-c.webp',
          true, true, now() - interval '14 days', 'APROBADA'),
         (p6, a6, 1, 'https://www.instagram.com/p/humo11f/', now() - interval '21 days', 'asignacion/' || a6 || '/publicacion/1-c.webp',
          true, true, now() - interval '14 days', 'APROBADA');
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path, estado_validacion)
  values (p5, 'D7', now() - interval '14 days', 10000, 15000, 'asignacion/' || a5 || '/metrica/d7.webp', 'APROBADA'),
         (p6, 'D7', now() - interval '14 days', 5000, 8000, 'asignacion/' || a6 || '/metrica/d7.webp', 'APROBADA');
  insert into public.resoluciones_dian (id, tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        consecutivo_actual, vigente_desde, activa)
  values (rs1, 'FACTURA_VENTA', 'HONC', '18760000011', '2026-01-01', 1, 1000, 1, '2026-01-01', false);
  insert into public.facturas (id, anunciante_id, resolucion_id, prefijo, consecutivo, fecha_emision, fecha_vencimiento,
                               subtotal, iva, pagado, estado, emitida_at)
  values (f1, an_a, rs1, 'HONC', 1, private.hoy() - 31, private.hoy() - 1, 100000, 19000, 0, 'EMITIDA', now() - interval '31 days');
  insert into public.documentos_medio (id, medio_id, tipo, archivo_path, estado_validacion, validado_at, fecha_vencimiento, subido_por)
  values (dm1, me_a, 'RUT', 'medio/' || me_a || '/RUT/rut.pdf', 'APROBADO', now() - interval '100 days', private.hoy() - 1, u_mea);
  -- Datos de retención
  insert into public.accesos (usuario_id, evento, pais_iso2, created_at) values
    (u_mea, 'LOGIN_EXITOSO', 'CO', now() - interval '400 days'), (u_mea, 'LOGIN_EXITOSO', 'CO', now() - interval '10 days');
  insert into public.bitacora (entidad, accion, origen, created_at, metadatos)
  values ('humo11', 'OTRO', 'DB', now() - interval '6 years', '{}'), ('humo11', 'OTRO', 'DB', now() - interval '1 day', '{}');
  insert into private.intentos_login (email_hash, ip, exito, created_at)
  values ('humo11', '203.0.113.99', false, now() - interval '40 days'), ('humo11', '203.0.113.99', false, now());
  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, leida, leida_at, created_at)
  values (u_mea, 'humo.once', 'Vieja', 'Leída hace tiempo', true, now() - interval '200 days', now() - interval '200 days'),
         (u_mea, 'humo.once', 'Vieja sin leer', 'No leída', false, null, now() - interval '200 days');
  insert into private.sesiones_actividad (session_id, usuario_id) values (gen_random_uuid(), u_mea);
  perform set_config('amo.modo_carga', '', true);

  -- ── (a) vencer_asignaciones ────────────────────────────────────────────────────────────────────────
  call private.vencer_asignaciones(20, false);
  r := r || jsonb_build_object('a1_vencida_y_cupo_liberado',
    (select estado = 'VENCIDA_SIN_PUBLICAR' and vencida_at = now() from public.asignaciones where id = a1)
    and (select cupos_ocupados = 1 and presupuesto_comprometido = 300000 from public.ofertas where id = o1)
    and (select cupos_ocupados = 1 from public.oferta_cupos where oferta_id = o1)
    and (select presupuesto_comprometido = 300000 from public.campanas where id = c1));
  r := r || jsonb_build_object('a2_no_vence_en_plazo', (select estado = 'ACEPTADA' from public.asignaciones where id = a2));
  r := r || jsonb_build_object('a3_notifica_vencida',
    exists (select 1 from public.notificaciones where tipo = 'asignacion.vencida' and usuario_id = u_mea and entidad_id = a1::text));
  r := r || jsonb_build_object('a4_bitacora_sistema',
    exists (select 1 from public.bitacora where entidad = 'asignaciones' and entidad_id = a1::text and accion = 'TRANSICION'
              and estado_nuevo = 'VENCIDA_SIN_PUBLICAR' and actor_id is null));

  -- ── (b) actualizar_estados ─────────────────────────────────────────────────────────────────────────
  call private.actualizar_estados(20, false);
  r := r || jsonb_build_object('b1_oferta_en_ejecucion', (select estado = 'EN_EJECUCION' from public.ofertas where id = o1));
  r := r || jsonb_build_object('b2_oferta_vencida', (select estado = 'VENCIDA' and vencida_at = now() from public.ofertas where id = o2));
  r := r || jsonb_build_object('b3_oferta_cerrada', (select estado = 'CERRADA' from public.ofertas where id = o3));
  r := r || jsonb_build_object('b4_campana_finalizada', (select estado = 'FINALIZADA' from public.campanas where id = c2)
                                                         and (select estado = 'ACTIVA' from public.campanas where id = c1));
  r := r || jsonb_build_object('b5_factura_vencida', (select estado = 'VENCIDA' from public.facturas where id = f1));
  r := r || jsonb_build_object('b6_documento_vencido', (select estado_validacion = 'VENCIDO' from public.documentos_medio where id = dm1));
  r := r || jsonb_build_object('b7_metricas_atrasadas',
    (select metricas_atrasadas_at = now() from public.asignaciones where id = a3)
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.metricas_atrasadas' and usuario_id = u_mea
                  and entidad_id = a3::text and mensaje like '%D7%'));
  r := r || jsonb_build_object('b8_no_toca_lo_vigente',
    (select estado = 'EN_EJECUCION' from public.ofertas where id = o5) and (select estado = 'PUBLICADA' from public.ofertas where id = o_d));
  call private.actualizar_estados(20, false);
  r := r || jsonb_build_object('b9_idempotente',
    (select count(*) = 1 from public.notificaciones where tipo = 'asignacion.metricas_atrasadas' and entidad_id = a3::text));

  -- ── (c) Recordatorios y reverificación ─────────────────────────────────────────────────────────────
  v_n := private.generar_recordatorios();
  r := r || jsonb_build_object('c1_recordatorios',
    v_n >= 3
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.recordatorio_metricas' and usuario_id = u_mea
                  and entidad_id = a3::text and mensaje like '%corte D7 %')
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.recordatorio_publicacion' and usuario_id = u_meb
                  and entidad_id = a2::text)
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.recordatorio_metricas' and usuario_id = u_meb
                  and entidad_id = a4::text and mensaje like '%corte H24 %'));
  r := r || jsonb_build_object('c2_recordatorios_sin_duplicar', private.generar_recordatorios() = 0);
  v_n := private.revisar_reverificacion();
  r := r || jsonb_build_object('c3_reverificacion',
    v_n >= 2
    and exists (select 1 from public.notificaciones where tipo = 'cuenta.reverificacion_pendiente' and usuario_id = u_mea
                  and entidad_id = cu_a::text and prioridad = 1)
    and exists (select 1 from public.notificaciones where tipo = 'cuenta.reverificacion_pendiente' and usuario_id = u_meb
                  and entidad_id = cu_b::text and prioridad = 2));
  r := r || jsonb_build_object('c4_reverificacion_una_vez_por_umbral', private.revisar_reverificacion() = 0);

  -- ── (d) Multiplicadores e indicadores ──────────────────────────────────────────────────────────────
  v_n := private.recalcular_multiplicadores();
  r := r || jsonb_build_object('d1_multiplicadores_anunciados',
    v_n >= 2
    and (select multiplicador_proximo = 1.333 and multiplicador_calidad = 1.000 and alcance_mediano = 10000
                and publicaciones_verificadas_count = 1 and indice_calidad = 0.222222
                and multiplicador_proximo_desde = private.inicio_dia(private.hoy() + 7)
         from public.cuentas_sociales where id = cu_a)
    and (select multiplicador_proximo = 0.700 from public.cuentas_sociales where id = cu_b)
    and exists (select 1 from public.notificaciones where tipo = 'multiplicador.cambio_programado' and usuario_id = u_mea
                  and mensaje like '%1.000 a 1.333%'));
  r := r || jsonb_build_object('d2_no_reanuncia', private.recalcular_multiplicadores() = 0
    and (select count(*) = 1 from public.notificaciones where tipo = 'multiplicador.cambio_programado' and usuario_id = u_mea));
  r := r || jsonb_build_object('d3_no_aplica_antes', private.aplicar_multiplicadores_programados() = 0);
  perform set_config('amo.reloj', (now() + interval '8 days')::text, true);
  v_n := private.aplicar_multiplicadores_programados();
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('d4_aplica_en_la_fecha',
    v_n >= 2 and (select multiplicador_calidad = 1.333 and multiplicador_proximo is null and multiplicador_proximo_desde is null
                  from public.cuentas_sociales where id = cu_a));
  v_n := private.recalcular_indicadores_medios();
  r := r || jsonb_build_object('d5_indicadores_medio',
    v_n >= 2
    and (select tasa_cumplimiento = 0.6667 and n_cumplimiento = 3 and publicaciones_verificadas = 2 from public.medios where id = me_a)
    and (select tasa_cumplimiento is null and n_cumplimiento = 1 from public.medios where id = me_b));
  r := r || jsonb_build_object('d6_indicadores_sin_cambios', private.recalcular_indicadores_medios() = 0);

  -- ── (e) Retención y purga demo ─────────────────────────────────────────────────────────────────────
  v_j := private.purgar_retencion();
  r := r || jsonb_build_object('e1_retencion',
    (v_j ->> 'accesos')::int >= 1 and (v_j ->> 'bitacora')::int >= 1 and (v_j ->> 'intentos_login')::int >= 1
    and (v_j ->> 'notificaciones')::int >= 1 and (v_j ->> 'sesiones_actividad')::int >= 1 and v_j ? 'cron_job_run_details'
    and (select count(*) = 1 from public.accesos where usuario_id = u_mea and evento = 'LOGIN_EXITOSO')
    and (select count(*) = 1 from public.bitacora where entidad = 'humo11')
    and (select count(*) = 1 from private.intentos_login where email_hash = 'humo11')
    and exists (select 1 from public.notificaciones where tipo = 'humo.once' and not leida)
    and not exists (select 1 from public.notificaciones where tipo = 'humo.once' and leida)
    and coalesce(current_setting('amo.purga', true), '') = ''
    and exists (select 1 from public.bitacora where entidad = 'retencion' and created_at = now()));
  begin
    perform private.purgar_demo();
    r := r || jsonb_build_object('e2_purga_demo_exige_interruptores', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e2_purga_demo_exige_interruptores', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform set_config('amo.modo_carga', 'on', true);
  perform set_config('amo.purga', 'on', true);
  v_j := private.purgar_demo();
  perform set_config('amo.purga', '', true);
  perform set_config('amo.modo_carga', '', true);
  r := r || jsonb_build_object('e3_purga_demo',
    (v_j ->> 'asignaciones')::int >= 1 and (v_j ->> 'campanas')::int >= 1
    and not exists (select 1 from public.anunciantes where id = an_d)
    and not exists (select 1 from public.medios where id = me_d)
    and not exists (select 1 from public.campanas where id = c_d)
    and not exists (select 1 from public.asignaciones where id = a_d)
    and exists (select 1 from public.anunciantes where id = an_a) and exists (select 1 from public.campanas where id = c1)
    and v_j ? 'organizaciones_conservadas');
  r := r || jsonb_build_object('e4_purga_demo_oferta_con_cupos_ocupados',
    (v_j ->> 'ofertas')::int >= 1 and (v_j ->> 'oferta_cupos')::int >= 1
    and not exists (select 1 from public.ofertas where id = o_d)
    and not exists (select 1 from public.oferta_cupos where oferta_id = o_d));

  -- ── (f) Agenda y permisos ──────────────────────────────────────────────────────────────────────────
  select jsonb_object_agg(j.jobname, j.schedule) into v_j from cron.job j where j.jobname like 'amo\_%';
  r := r || jsonb_build_object('f1_agenda_utc',
    v_j = '{"amo_vencer_asignaciones": "*/15 * * * *", "amo_actualizar_estados": "5-59/15 * * * *",
            "amo_recordatorios": "20 * * * *", "amo_indicadores_medios": "0 8 * * *",
            "amo_recalcular_multiplicadores": "30 8 * * 1", "amo_retencion": "0 9 * * *"}'::jsonb
    and (select bool_and(j.username = 'postgres' and j.active) from cron.job j where j.jobname like 'amo\_%'));
  r := r || jsonb_build_object('f2_sin_execute_api',
    not has_function_privilege('authenticated', 'private.purgar_retencion()', 'execute')
    and not has_function_privilege('service_role', 'private.purgar_demo()', 'execute')
    and not has_function_privilege('service_role', 'private.recalcular_multiplicadores()', 'execute')
    and not has_function_privilege('authenticated', 'private.vencer_asignaciones(integer, boolean)', 'execute'));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
