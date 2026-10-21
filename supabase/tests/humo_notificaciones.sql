-- Pruebas de humo de la migración 8 (notificaciones) y de accesos_bloqueo_unico.
-- Cubre: private.notificar (plantilla, destinatarios ACTIVO, prioridad, URL, variables ausentes, modo_carga), RLS y
-- privilegios de columna de notificaciones, RPC de bandeja (contador, SRF con cursor, marcado), leida_at fijado por la
-- BD, notificaciones por transición (oferta devuelta/publicada con medios elegibles, asignación cancelada, disputa
-- abierta), alerta PAIS_INUSUAL (usuario + SUPERADMIN), un LOGIN_BLOQUEADO por ventana y aislamiento de la política
-- de Realtime (tópico usuario:<uuid>).
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
-- Cada prueba deja `true` si pasa o un texto con lo observado si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_n bigint;
  v_i integer;
  v_t text;
  v_j jsonb;
  v_rec record;
  v_qual text;
  v_ok boolean;
  v_id bigint;
  v_id2 bigint;
  v_id3 bigint;
  u_sa constant uuid := '00000000-0000-4000-a000-0000000000d1';
  u_ana constant uuid := '00000000-0000-4000-a000-0000000000d2';
  u_mea constant uuid := '00000000-0000-4000-a000-0000000000d3';
  u_meb constant uuid := '00000000-0000-4000-a000-0000000000d4';
  u_inv constant uuid := '00000000-0000-4000-a000-0000000000d5';
  s_sa constant uuid := '00000000-0000-4000-b000-0000000000d1';
  s_ana constant uuid := '00000000-0000-4000-b000-0000000000d2';
  s_mea constant uuid := '00000000-0000-4000-b000-0000000000d3';
  s_meb constant uuid := '00000000-0000-4000-b000-0000000000d4';
  an_a constant uuid := '00000000-0000-4000-c000-0000000000d1';
  me_a constant uuid := '00000000-0000-4000-d000-0000000000d1';
  me_b constant uuid := '00000000-0000-4000-d000-0000000000d2';
  cu_a constant uuid := '00000000-0000-4000-e000-0000000000d1';
  c1 constant uuid := '00000000-0000-4000-f000-0000000000d1';
  o1 constant uuid := '00000000-0000-4000-f000-0000000000e1';
  o2 constant uuid := '00000000-0000-4000-f000-0000000000e2';
  a1 constant uuid := '00000000-0000-4000-f000-0000000000f1';
  a2 constant uuid := '00000000-0000-4000-f000-0000000000f2';
  c_ana text; c_mea text; c_meb text;
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t join public.formatos f on f.id = t.formato_id
                    join public.franjas fr on fr.id = t.franja_id
                    where f.plataforma = 'INSTAGRAM' and f.clave = 'POST_FEED' and fr.clave = 'F1'
                    order by t.vigente_desde desc limit 1);
begin
  -- ── Preparación (owner, modo_carga) ─────────────────────────────────────────────────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_sa, 'humo8.sa@amo.test'), (u_ana, 'humo8.ana@amo.test'), (u_mea, 'humo8.mea@amo.test'),
               (u_meb, 'humo8.meb@amo.test'), (u_inv, 'humo8.inv@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'Humo Ocho A S.A.S.', 'Humo Ocho A', '900000801', '1', v_sector, '11001', 'VERIFICADO', now());
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Ocho A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, now()),
         (me_b, 'Medio Ocho B', 'CREADOR', '76001', 'VERIFICADO', 1, now());
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo8_a', 'https://instagram.com/humo8_a', 45000, fr1, true, 'MANUAL', now());
  update public.perfiles set rol_id = (select id from public.roles where clave = 'SUPERADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_sa;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = an_a where id = u_ana;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), anunciante_id = an_a
   where id = u_inv;                                                                  -- queda INVITADO
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false, medio_id = case id when u_mea then me_a else me_b end where id in (u_mea, u_meb);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_sa, u_sa, now(), now(), 'aal2'), (s_ana, u_ana, now(), now(), 'aal1'), (s_mea, u_mea, now(), now(), 'aal1'),
    (s_meb, u_meb, now(), now(), 'aal1');
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c1, an_a, 'Campaña Humo 8', 'Marca Humo', private.hoy(), private.hoy() + 30, 20000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, enviada_at)
  values (o1, c1, an_a, 'Oferta Ocho devuelta', f_post, 'INSTAGRAM', 5000000, 0.5, '{H24,H72,D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'EN_REVISION', now()),
         (o2, c1, an_a, 'Oferta Ocho publicada', f_post, 'INSTAGRAM', 5000000, 0.5, '{H24,H72,D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'EN_REVISION', now());
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o1, fr1, 3), (o2, fr1, 3);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot,
                                   estado, aceptada_at, fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id)
  values (a1, o2, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'ACEPTADA', now(), now() + interval '10 days', 1, 300000, v_tarifa, fr1),
         (a2, o2, c1, an_a, me_a, cu_a, 'INSTAGRAM', 2, 'PUBLICADA', now(), now() + interval '10 days', 1, 300000, v_tarifa, fr1);
  perform set_config('amo.modo_carga', '', true);
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;

  -- ── (a) private.notificar ───────────────────────────────────────────────────────────────────────────
  v_i := private.notificar(array[u_ana, u_mea, u_inv, u_ana], 'oferta.publicada', '{"oferta": "Prueba X"}', 'ofertas', 'x',
                           '/campanas/x', 5::smallint);
  r := r || jsonb_build_object('a1_destinatarios_activos', v_i = 2
    and not exists (select 1 from public.notificaciones where usuario_id = u_inv));
  r := r || jsonb_build_object('a2_render_plantilla',
    (select titulo = 'Oferta publicada' and mensaje = 'Tu oferta «Prueba X» ya está publicada en el marketplace.'
            and prioridad = 2 and url = '/campanas/x' and entidad = 'ofertas' and canal = 'APP' and not leida and not es_demo
     from public.notificaciones where usuario_id = u_ana and tipo = 'oferta.publicada'));
  r := r || jsonb_build_object('a3_plantilla_inexistente', private.notificar(array[u_ana], 'no.existe', '{}', null, null, null) = 0);
  perform private.notificar(array[u_mea], 'oferta.devuelta', '{"oferta": "Sin motivo"}', null, null, '//malicioso.com');
  r := r || jsonb_build_object('a4_url_externa_y_variable_ausente',
    (select url is null and mensaje = 'Tu oferta «Sin motivo» fue devuelta con observaciones: —'
     from public.notificaciones where usuario_id = u_mea and tipo = 'oferta.devuelta'));
  perform private.notificar(array[u_mea], 'creativo.actualizado', jsonb_build_object('oferta_id', o2, 'version', 3), null, null, null);
  r := r || jsonb_build_object('a5_completa_titulo_oferta',
    (select mensaje like '%«Oferta Ocho publicada»%versión 3%' from public.notificaciones
     where usuario_id = u_mea and tipo = 'creativo.actualizado'));
  perform set_config('amo.modo_carga', 'on', true);
  r := r || jsonb_build_object('a6_modo_carga_no_notifica',
    private.notificar(array[u_ana], 'oferta.publicada', '{"oferta": "Demo"}', null, null, null) = 0);
  perform set_config('amo.modo_carga', '', true);
  r := r || jsonb_build_object('a7_sin_execute_api',
    not has_function_privilege('authenticated', 'private.notificar(uuid[], text, jsonb, text, text, text, smallint)', 'execute')
    and not has_function_privilege('service_role', 'private.notificar(uuid[], text, jsonb, text, text, text, smallint)', 'execute')
    and not has_function_privilege('authenticated', 'private.notificar_transicion()', 'execute'));

  -- ── (b) RLS, privilegios y RPC de bandeja ───────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.notificaciones;
  r := r || jsonb_build_object('b1_solo_propias', v_n = 1);
  r := r || jsonb_build_object('b2_contador_no_leidas', public.notificaciones_no_leidas() = 1);
  select count(*), min(tipo) into v_rec from public.mis_notificaciones(10, null, true);
  r := r || jsonb_build_object('b3_srf_bandeja', v_rec.count = 1 and v_rec.min = 'oferta.publicada');
  select id into v_id from public.notificaciones limit 1;
  update public.notificaciones set leida = true, leida_at = '2000-01-01' where id = v_id;
  begin
    update public.notificaciones set mensaje = 'alterado' where id = v_id;
    r := r || jsonb_build_object('b5_no_edita_mensaje', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b5_no_edita_mensaje', true);
  end;
  begin
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje) values (u_ana, 'x.y', 't', 'm');
    r := r || jsonb_build_object('b6_no_inserta', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b6_no_inserta', true);
  end;
  update public.notificaciones set leida = true where usuario_id = u_mea;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('b7_no_marca_ajenas', v_n = 0);
  r := r || jsonb_build_object('b8_marcar_no_leida', public.marcar_notificaciones_leidas(array[v_id], false) = 1);
  v_i := public.marcar_notificaciones_leidas();
  r := r || jsonb_build_object('b9_marcar_todas', v_i = 1 and public.notificaciones_no_leidas() = 0);
  execute 'reset role';
  r := r || jsonb_build_object('b4_leida_at_de_la_bd',
    (select leida and leida_at = now() from public.notificaciones where id = v_id));
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.mis_notificaciones(1);
  r := r || jsonb_build_object('b10_srf_limite', v_n = 1);
  select max(id) into v_id2 from public.notificaciones;
  select count(*) into v_n from public.mis_notificaciones(50, v_id2);
  r := r || jsonb_build_object('b11_srf_cursor', v_n = (select count(*) - 1 from public.notificaciones));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('b12_anon_sin_acceso',
    not has_table_privilege('anon', 'public.notificaciones', 'select')
    and not has_function_privilege('anon', 'public.mis_notificaciones(integer, bigint, boolean)', 'execute'));

  -- ── (c) Notificaciones por transición ───────────────────────────────────────────────────────────────
  perform private.aplicar_transicion('ofertas', o1, 'DEVUELTA', 'ADMIN', u_sa, 'Ajusta el texto del copy');
  r := r || jsonb_build_object('c1_oferta_devuelta',
    (select count(*) = 1 from public.notificaciones where usuario_id = u_ana and tipo = 'oferta.devuelta'
       and entidad = 'ofertas' and entidad_id = o1::text and mensaje like '%«Oferta Ocho devuelta»%Ajusta el texto del copy%'));
  perform private.aplicar_transicion('ofertas', o2, 'PUBLICADA', 'ADMIN', u_sa);
  r := r || jsonb_build_object('c2_oferta_publicada_anunciante',
    exists (select 1 from public.notificaciones where usuario_id = u_ana and tipo = 'oferta.publicada' and entidad_id = o2::text));
  r := r || jsonb_build_object('c3_nueva_elegible_solo_elegibles',
    (select count(*) = 1 from public.notificaciones where tipo = 'oferta.nueva_elegible' and entidad_id = o2::text
       and usuario_id = u_mea and mensaje like '%Humo Ocho A%Instagram%')
    and not exists (select 1 from public.notificaciones where tipo = 'oferta.nueva_elegible' and usuario_id = u_meb));
  perform private.aplicar_transicion('asignaciones', a1, 'CANCELADA', 'ADMIN', u_sa, 'Acuerdo entre las partes',
                                     '{"causa": "ACUERDO"}');
  r := r || jsonb_build_object('c4_asignacion_cancelada_ambas_partes',
    (select count(distinct usuario_id) = 2 from public.notificaciones where tipo = 'asignacion.cancelada'
       and entidad_id = a1::text and usuario_id in (u_ana, u_mea) and mensaje like '%Acuerdo entre las partes%'));
  insert into public.disputas (asignacion_id, abierta_por, parte, motivo, descripcion, estado, estado_asignacion_origen)
  values (a2, u_mea, 'MEDIO', 'METRICAS', 'El anunciante no reconoce el alcance reportado', 'ABIERTA', 'PUBLICADA');
  r := r || jsonb_build_object('c5_disputa_abierta_contraparte',
    exists (select 1 from public.notificaciones where tipo = 'disputa.abierta' and usuario_id = u_ana and mensaje like '%métricas%')
    and not exists (select 1 from public.notificaciones where tipo = 'disputa.abierta' and usuario_id = u_mea));
  r := r || jsonb_build_object('c6_triggers', (select count(*) = 8 from pg_trigger where tgname like 'trg\_%\_z\_notificar%'));

  -- ── (d) Accesos: alerta PAIS_INUSUAL y un bloqueo por ventana ──────────────────────────────────────
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
  select * into v_rec from public.registrar_acceso_srv(u_mea, 'humo8.mea@amo.test', 'LOGIN_EXITOSO', s_mea, 'aal1',
    '203.0.113.10', 'RU', null, 'Moscú', 55.75, 37.62, 'Mozilla/5.0', 'Firefox', 'Linux', 'ESCRITORIO');
  r := r || jsonb_build_object('d1_pais_inusual', v_rec.es_sospechoso and v_rec.motivo = 'PAIS_INUSUAL');
  select id into v_id from public.registrar_acceso_srv(null, 'humo8.bloqueado@amo.test', 'LOGIN_BLOQUEADO', null, null,
    '203.0.113.20', 'CO', null, null, null, null, 'Mozilla/5.0', 'Firefox', 'Linux', 'ESCRITORIO');
  select id into v_id2 from public.registrar_acceso_srv(null, 'humo8.bloqueado@amo.test', 'LOGIN_BLOQUEADO', null, null,
    '203.0.113.20', 'CO', null, null, null, null, 'Mozilla/5.0', 'Firefox', 'Linux', 'ESCRITORIO');
  select id into v_id3 from public.registrar_acceso_srv(null, 'humo8.bloqueado@amo.test', 'LOGIN_BLOQUEADO', null, null,
    '203.0.113.21', 'CO', null, null, null, null, 'Mozilla/5.0', 'Firefox', 'Linux', 'ESCRITORIO');
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  r := r || jsonb_build_object('d2_alerta_usuario',
    exists (select 1 from public.notificaciones where usuario_id = u_mea and tipo = 'seguridad.pais_inusual'
              and url = '/cuenta/seguridad' and prioridad = 2
              and mensaje like '%desde ' || (select nombre from public.paises where iso2 = 'RU') || ' el %'));
  r := r || jsonb_build_object('d3_alerta_superadmin',
    exists (select 1 from public.notificaciones where usuario_id = u_sa and tipo = 'seguridad.alerta_pais_inusual'
              and url = '/administracion/accesos' and entidad = 'accesos'
              and mensaje like '% ingresó a AMO desde ' || (select nombre from public.paises where iso2 = 'RU') || ' el %'));
  r := r || jsonb_build_object('d4_un_bloqueo_por_ventana', v_id = v_id2 and v_id3 <> v_id
    and (select count(*) = 2 from public.accesos where email_hash = encode(sha256(convert_to('humo8.bloqueado@amo.test', 'UTF8')), 'hex')));

  -- ── (e) Realtime: la notificación no falla sin particiones y la política aísla el tópico ─────────────
  r := r || jsonb_build_object('e1_insert_no_bloqueado_por_realtime',
    exists (select 1 from public.notificaciones where usuario_id = u_mea and tipo = 'seguridad.pais_inusual'));
  select qual into v_qual from pg_policies where schemaname = 'realtime' and tablename = 'messages'
    and policyname = 'realtime: tópico propio';
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  perform set_config('realtime.topic', 'usuario:' || u_ana, true);
  execute format('select exists (select 1 from (select %L::text as extension) m where %s)', 'broadcast', v_qual) into v_ok;
  r := r || jsonb_build_object('e2_topico_propio', v_ok);
  perform set_config('realtime.topic', 'usuario:' || u_mea, true);
  execute format('select exists (select 1 from (select %L::text as extension) m where %s)', 'broadcast', v_qual) into v_ok;
  r := r || jsonb_build_object('e3_topico_ajeno', not v_ok);
  perform set_config('realtime.topic', 'usuario:' || u_ana, true);
  execute format('select exists (select 1 from (select %L::text as extension) m where %s)', 'postgres_changes', v_qual) into v_ok;
  r := r || jsonb_build_object('e4_solo_broadcast', not v_ok);
  execute 'reset role';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'session_id',
                                                              gen_random_uuid())::text, true);
  execute 'set local role authenticated';
  execute format('select exists (select 1 from (select %L::text as extension) m where %s)', 'broadcast', v_qual) into v_ok;
  r := r || jsonb_build_object('e5_sesion_invalida', not v_ok);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('realtime.topic', '', true);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
