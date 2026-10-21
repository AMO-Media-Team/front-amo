-- Pruebas de humo de la migración 7 (negocio_transacciones: 7a tablas, 7b funciones, 7c transiciones,
-- 7d procedimientos, 7e seguridad, 7f ajustes, 7g políticas). Cubre: transiciones válidas e inválidas (perfiles,
-- campañas, ofertas, asignaciones, publicaciones, métricas, disputas, liquidaciones, documentos soporte y facturas), precio congelado,
-- reserva con cupos / presupuestos / topes / idempotencia, liberación y re-consumo de cupo, inmutabilidad de montos,
-- RLS por rol y visibilidad derivada del marketplace.
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
  v_n bigint;
  v_t text;
  v_j jsonb;
  v_rec record;
  v_det text;
  v_ok boolean;
  -- usuarios y sesiones
  u_adm constant uuid := '00000000-0000-4000-a000-000000000081';   -- ADMIN
  u_fin constant uuid := '00000000-0000-4000-a000-000000000082';   -- FINANZAS
  u_ana constant uuid := '00000000-0000-4000-a000-000000000083';   -- ANUNCIANTE de A
  u_anb constant uuid := '00000000-0000-4000-a000-000000000084';   -- ANUNCIANTE de B
  u_mea constant uuid := '00000000-0000-4000-a000-000000000085';   -- MEDIO A (franja F2)
  u_meb constant uuid := '00000000-0000-4000-a000-000000000086';   -- MEDIO B (F1)
  u_mec constant uuid := '00000000-0000-4000-a000-000000000087';   -- MEDIO C (F1)
  u_med constant uuid := '00000000-0000-4000-a000-000000000088';   -- MEDIO D (F1)
  u_inv constant uuid := '00000000-0000-4000-a000-000000000089';   -- invitado (activar_perfil_srv)
  u_ope constant uuid := '00000000-0000-4000-a000-00000000008a';   -- OPERACIONES (a suspender)
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000081';
  s_adm constant uuid := '00000000-0000-4000-b000-000000000082';
  s_fin constant uuid := '00000000-0000-4000-b000-000000000083';
  s_ana constant uuid := '00000000-0000-4000-b000-000000000084';
  s_anb constant uuid := '00000000-0000-4000-b000-000000000085';
  s_mea constant uuid := '00000000-0000-4000-b000-000000000086';
  s_meb constant uuid := '00000000-0000-4000-b000-000000000087';
  s_mec constant uuid := '00000000-0000-4000-b000-000000000088';
  s_med constant uuid := '00000000-0000-4000-b000-000000000089';
  an_a constant uuid := '00000000-0000-4000-c000-00000000002a';
  an_b constant uuid := '00000000-0000-4000-c000-00000000002b';
  me_a constant uuid := '00000000-0000-4000-d000-00000000002a';
  me_b constant uuid := '00000000-0000-4000-d000-00000000002b';
  me_c constant uuid := '00000000-0000-4000-d000-00000000002c';
  me_d constant uuid := '00000000-0000-4000-d000-00000000002d';
  cu_a constant uuid := '00000000-0000-4000-e000-00000000002a';
  cu_b constant uuid := '00000000-0000-4000-e000-00000000002b';
  cu_c constant uuid := '00000000-0000-4000-e000-00000000002c';
  cu_d constant uuid := '00000000-0000-4000-e000-00000000002d';
  c2 constant uuid := '00000000-0000-4000-f000-0000000000c2';
  o2 constant uuid := '00000000-0000-4000-f000-0000000000a2';
  o3 constant uuid := '00000000-0000-4000-f000-0000000000a3';
  o4 constant uuid := '00000000-0000-4000-f000-0000000000a4';
  o5 constant uuid := '00000000-0000-4000-f000-0000000000a5';
  c_adm1 text; c_adm text; c_fin text; c_ana text; c_anb text; c_mea text; c_meb text; c_mec text; c_med text;
  c_srv constant text := '{"role": "service_role"}';
  -- catálogos
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  f_reel uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'REEL');
  f_hist uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'HISTORIA');
  f_carr uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'CARRUSEL');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  fr2 uuid := (select id from public.franjas where clave = 'F2');
  -- negocio
  c1 uuid; o1 uuid; cr1 uuid; a_a uuid; a_b uuid; a_c uuid; a_d uuid; r_c uuid; a_o5 uuid; p1 uuid;
  m_h24 uuid; m_h72 uuid; m_d7 uuid; d1 uuid; d2 uuid; liq1 uuid; liq2 uuid; f1 uuid; v_id uuid;
  v_tarifa_vieja uuid;
begin
  -- ── Preparación (owner, modo_carga para fijar estados de partida) ───────────────────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  -- La suite compara valores de toda la plataforma (estimador c7, invariantes de contadores m1–m4): los datos demo
  -- que traiga la BD se retiran dentro de esta transacción con la purga de la propia BD; el rollback los restaura.
  perform set_config('amo.purga', 'on', true);
  perform private.purgar_demo();
  perform set_config('amo.purga', '', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo7.admin@amo.test'), (u_fin, 'humo7.finanzas@amo.test'), (u_ana, 'humo7.ana@amo.test'),
               (u_anb, 'humo7.anb@amo.test'), (u_mea, 'humo7.mea@amo.test'), (u_meb, 'humo7.meb@amo.test'),
               (u_mec, 'humo7.mec@amo.test'), (u_med, 'humo7.med@amo.test'), (u_inv, 'humo7.inv@amo.test'),
               (u_ope, 'humo7.ope@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'Humo Siete A S.A.S.', 'Humo Siete A', '900000201', '1', v_sector, '11001', 'VERIFICADO', now()),
         (an_b, 'Humo Siete B S.A.S.', 'Humo Siete B', '900000202', '1', v_sector, '05001', 'VERIFICADO', now());
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Siete A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, now()),
         (me_b, 'Medio Siete B', 'CREADOR', '76001', 'VERIFICADO', 1, now()),
         (me_c, 'Medio Siete C', 'CREADOR', '11001', 'VERIFICADO', 1, now()),
         (me_d, 'Medio Siete D', 'EMISORA', '08001', 'VERIFICADO', 1, now());
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo7_a', 'https://instagram.com/humo7_a', 75000, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo7_b', 'https://instagram.com/humo7_b', 45000, true, 'MANUAL', now()),
         (cu_c, me_c, 'INSTAGRAM', 'humo7_c', 'https://instagram.com/humo7_c', 45000, true, 'MANUAL', now()),
         (cu_d, me_d, 'INSTAGRAM', 'humo7_d', 'https://instagram.com/humo7_d', 45000, true, 'MANUAL', now());
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'FINANZAS'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_fin;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'OPERACIONES'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_ope;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = case id when u_ana then an_a else an_b end where id in (u_ana, u_anb);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false,
         medio_id = case id when u_mea then me_a when u_meb then me_b when u_mec then me_c else me_d end
   where id in (u_mea, u_meb, u_mec, u_med);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), anunciante_id = an_b
   where id = u_inv;                                                          -- queda INVITADO con rol
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm1, u_adm, now(), now(), 'aal1'), (s_adm, u_adm, now(), now(), 'aal2'), (s_fin, u_fin, now(), now(), 'aal2'),
    (s_ana, u_ana, now(), now(), 'aal1'), (s_anb, u_anb, now(), now(), 'aal1'), (s_mea, u_mea, now(), now(), 'aal1'),
    (s_meb, u_meb, now(), now(), 'aal1'), (s_mec, u_mec, now(), now(), 'aal1'), (s_med, u_med, now(), now(), 'aal1');
  -- La suite liquida sin retenciones configuradas (así deja la BD la semilla de migraciones: monto_retenciones = 0) y
  -- la BD puede traer tarifas de retención en la fuente y de ReteICA (datos demo): se retiran en esta transacción.
  delete from public.reteica_municipal;
  delete from public.retenciones_config;
  perform set_config('amo.modo_carga', '', true);
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_anb := jsonb_build_object('sub', u_anb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anb)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;
  c_mec := jsonb_build_object('sub', u_mec, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mec)::text;
  c_med := jsonb_build_object('sub', u_med, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_med)::text;
  perform set_config('amo.ctx_confiable', 'no', true);

  r := r || jsonb_build_object('s0_semilla_transiciones', (select count(*) = 141 from private.transiciones_estado));

  -- ── (a) Perfiles: la regla de M3 sigue en el transicionar_srv definitivo ─────────────────────────────
  perform set_config('amo.actor_id', u_adm::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    update public.perfiles set estado = 'SUSPENDIDO' where id = u_ope;
    r := r || jsonb_build_object('a1_estado_perfil_solo_via_transicion', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a1_estado_perfil_solo_via_transicion', sqlerrm = 'AMO_ESTADO_SOLO_VIA_TRANSICION');
  end;
  begin
    perform public.transicionar_srv('perfiles', u_ope, 'SUSPENDIDO', u_adm, s_adm);
    r := r || jsonb_build_object('a2_motivo_requerido', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a2_motivo_requerido', sqlerrm = 'AMO_MOTIVO_REQUERIDO');
  end;
  v_j := public.transicionar_srv('perfiles', u_ope, 'SUSPENDIDO', u_adm, s_adm, 'Prueba de suspensión');
  begin
    perform public.transicionar_srv('perfiles', u_adm, 'SUSPENDIDO', u_adm, s_adm, 'Autosuspensión');
    r := r || jsonb_build_object('a4_no_cambia_su_estado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a4_no_cambia_su_estado', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  begin
    perform public.transicionar_srv('perfiles', u_ope, 'INVITADO', u_adm, s_adm, 'Sin fila');
    r := r || jsonb_build_object('a5_transicion_inexistente', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('a5_transicion_inexistente', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  perform set_config('amo.actor_id', '', true);             -- activar_perfil_srv es su propia petición (sin actor)
  perform public.activar_perfil_srv(u_inv);
  execute 'reset role';
  r := r || jsonb_build_object('a3_suspension_via_transicion',
    v_j ->> 'hacia' = 'SUSPENDIDO' and (select estado = 'SUSPENDIDO' and suspendido_at = now() and motivo_estado = 'Prueba de suspensión'
                                         from public.perfiles where id = u_ope));
  r := r || jsonb_build_object('a6_activar_perfil_srv',
    (select estado = 'ACTIVO' and activado_at = now() from public.perfiles where id = u_inv)
    and exists (select 1 from public.bitacora where entidad = 'perfiles' and entidad_id = u_inv::text
                  and accion = 'TRANSICION' and estado_nuevo = 'ACTIVO'));
  perform set_config('amo.actor_id', '', true);

  -- ── (b) Campaña y oferta: ciclo real con RLS y transicionar_srv ─────────────────────────────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  insert into public.campanas (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total)
  values (an_a, 'Campaña Humo 7', 'Lanzamiento', 'Marca Humo', private.hoy(), private.hoy() + 30, 20000000)
  returning id into c1;
  begin
    insert into public.campanas (anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total)
    values (an_b, 'Ajena', 'X', private.hoy(), private.hoy() + 1, 1000);
    r := r || jsonb_build_object('b2_no_crea_campana_ajena', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b2_no_crea_campana_ajena', true);
  end;
  begin
    update public.campanas set estado = 'ACTIVA' where id = c1;
    r := r || jsonb_build_object('b3_estado_sin_grant', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('b3_estado_sin_grant', true);
  end;
  execute 'reset role';
  r := r || jsonb_build_object('b1_campana_borrador',
    (select estado = 'BORRADOR' and creada_por = u_ana and not es_demo and presupuesto_comprometido = 0
     from public.campanas where id = c1));
  perform set_config('amo.actor_id', u_ana::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    update public.campanas set estado = 'ACTIVA' where id = c1;
    r := r || jsonb_build_object('b4_servidor_sin_transicion', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b4_servidor_sin_transicion', sqlerrm = 'AMO_ESTADO_SOLO_VIA_TRANSICION');
  end;
  perform public.transicionar_srv('campanas', c1, 'ACTIVA', u_ana, s_ana);
  execute 'reset role';
  r := r || jsonb_build_object('b5_campana_activa', (select estado = 'ACTIVA' and activada_at = now() from public.campanas where id = c1));

  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion)
  values (c1, 'Oferta Humo 7', f_post, 'INSTAGRAM', 5000000, now() + interval '3 days', now() + interval '10 days',
          now() + interval '2 days')
  returning id into o1;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o1, fr1, 2), (o1, fr2, 2);
  execute 'reset role';
  r := r || jsonb_build_object('b6_oferta_derivada',
    (select estado = 'BORRADOR' and anunciante_id = an_a and tope_porcentaje_por_medio = 0.15
            and cortes_requeridos = '{H24,H72,D7}'::public.corte_metrica[] and creada_por = u_ana
     from public.ofertas where id = o1));
  r := r || jsonb_build_object('b7_cupos_totales', (select cupos_totales = 4 from public.ofertas where id = o1));
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', c_srv, true);
  begin
    perform public.transicionar_srv('ofertas', o1, 'EN_REVISION', u_ana, s_ana);
    r := r || jsonb_build_object('b8_envio_sin_creativo', 'NO FALLÓ');
  exception when others then
    get stacked diagnostics v_det = pg_exception_detail;
    r := r || jsonb_build_object('b8_envio_sin_creativo', sqlerrm = 'AMO_TRANSICION_INVALIDA' and v_det like '%creativo%');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  insert into public.creativos (oferta_id, tipo, copy_sugerido, hashtags) values (o1, 'IMAGEN', 'Copy de humo', '{#humo}')
  returning id into cr1;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes)
    values (cr1, 'oferta/' || o1 || '/otro/pieza.jpg', 'image/jpeg', 1000);
    r := r || jsonb_build_object('b10_ruta_creativo_ligada', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('b10_ruta_creativo_ligada', true);
  end;
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes)
  values (cr1, 'oferta/' || o1 || '/' || cr1 || '/1-pieza.jpg', 'image/jpeg', 1000);
  execute 'reset role';
  r := r || jsonb_build_object('b9_creativo_v1', (select version = 1 and vigente and creado_por = u_ana from public.creativos where id = cr1));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o1, 'EN_REVISION', u_ana, s_ana);
  execute 'reset role';
  r := r || jsonb_build_object('b12_enviada', (select estado = 'EN_REVISION' and enviada_at = now() from public.ofertas where id = o1));
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  update public.ofertas set titulo = 'Cambio en revisión' where id = o1;
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('b13_no_edita_en_revision', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    update public.ofertas set titulo = 'Cambio del servidor' where id = o1;
    r := r || jsonb_build_object('b14_contenido_bloqueado_fuera_de_borrador', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b14_contenido_bloqueado_fuera_de_borrador', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.transicionar_srv('ofertas', o1, 'DEVUELTA', u_adm, s_adm);
    r := r || jsonb_build_object('b15_devolver_exige_motivo', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b15_devolver_exige_motivo', sqlerrm = 'AMO_MOTIVO_REQUERIDO');
  end;
  perform public.transicionar_srv('ofertas', o1, 'DEVUELTA', u_adm, s_adm, 'Ajusta el título');
  execute 'reset role';
  r := r || jsonb_build_object('b16_devuelta',
    (select estado = 'DEVUELTA' and comentario_moderacion = 'Ajusta el título' and moderada_por = u_adm and devuelta_at = now()
     from public.ofertas where id = o1));
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  update public.ofertas set titulo = 'Oferta Humo 7 corregida' where id = o1;
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('b17_edita_devuelta', v_n = 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o1, 'EN_REVISION', u_ana, s_ana);
  begin
    perform public.transicionar_srv('ofertas', o1, 'PUBLICADA', u_ana, s_ana);
    r := r || jsonb_build_object('b19_anunciante_no_publica', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b19_anunciante_no_publica', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.transicionar_srv('ofertas', o1, 'BORRADOR', u_anb, s_anb);
    r := r || jsonb_build_object('b20_otro_anunciante_no_retira', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b20_otro_anunciante_no_retira', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform public.transicionar_srv('ofertas', o1, 'PUBLICADA', u_adm, s_adm);
  begin
    perform public.transicionar_srv('ofertas', o1, 'CANCELADA', u_med, s_med, 'Un medio no cancela');
    r := r || jsonb_build_object('b22_medio_sin_fila', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b22_medio_sin_fila', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';
  r := r || jsonb_build_object('b21_publicada',
    (select estado = 'PUBLICADA' and publicada_at = now() and moderada_por = u_adm and cupos_totales = 4
     from public.ofertas where id = o1));

  -- Ofertas auxiliares (owner, modo_carga): O2 sin presupuesto suficiente, O3 para topes, O5 de un cupo y la campaña C2
  -- con O4 (tope % por medio bajo).
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c2, an_a, 'Campaña Humo 7 pequeña', 'Marca Humo', private.hoy(), private.hoy() + 30, 2000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, publicada_at)
  values (o2, c1, an_a, 'Reel sin presupuesto', f_reel, 'INSTAGRAM', 500000, 0.15, '{H24,H72,D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now()),
         (o3, c1, an_a, 'Historia para topes', f_hist, 'INSTAGRAM', 2000000, 0.15, '{H24,H72,D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now()),
         (o4, c2, an_a, 'Post de campaña pequeña', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now()),
         (o5, c1, an_a, 'Carrusel de un cupo', f_carr, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now());
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales)
  values (o2, fr2, 3), (o3, fr1, 2), (o3, fr2, 2), (o4, fr2, 2), (o5, fr1, 1);
  perform set_config('amo.modo_carga', '', true);

  -- ── (c) Marketplace: visibilidad derivada, vistas y cotización ─────────────────────────────────────
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ofertas;                       r := r || jsonb_build_object('c1_medio_sin_tabla_ofertas', v_n = 0);
  select count(*) into v_n from public.campanas;                      r := r || jsonb_build_object('c1_medio_sin_tabla_campanas', v_n = 0);
  select cupos_restantes_mi_franja into v_j from public.ofertas_para_medio(o1);
  r := r || jsonb_build_object('c2_marketplace_franja_propia',
    jsonb_array_length(v_j) = 1 and v_j -> 0 ->> 'franja_clave' = 'F2' and (v_j -> 0 ->> 'cupos_restantes')::int = 2);
  perform public.registrar_vista_oferta(o1);
  perform public.registrar_vista_oferta(o1);
  r := r || jsonb_build_object('c3_vista_registrada',
    (select veces = 2 from public.oferta_vistas where oferta_id = o1 and medio_id = me_a));
  select * into v_rec from public.cotizar_oferta(o1, cu_a);
  r := r || jsonb_build_object('c4_cotizacion',
    v_rec.monto_bruto = 450000 and v_rec.monto_comision = 90000 and v_rec.monto_medio = 360000
    and v_rec.franja_clave = 'F2' and v_rec.comision_origen = 'GLOBAL');
  begin
    perform * from public.estimar_oferta(f_post, '{}', '{}', '{}', null, '{}');
    r := r || jsonb_build_object('c5_medio_no_estima', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c5_medio_no_estima', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  begin
    perform * from public.cotizar_oferta(o1, cu_a);
    r := r || jsonb_build_object('c6_no_cotiza_cuenta_ajena', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c6_no_cotiza_cuenta_ajena', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  select * into v_rec from public.estimar_oferta(f_post, '{}', '{}', '{}', null, jsonb_build_object(fr1::text, 3));
  r := r || jsonb_build_object('c7_estimador_agregado',
    v_rec.medios_elegibles = 3 and v_rec.precio_mediano = 250000 and v_rec.inversion_estimada = 750000);
  begin
    perform * from public.cotizar_oferta(o1, cu_a);
    r := r || jsonb_build_object('c8_anunciante_no_cotiza_cuentas', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c8_anunciante_no_cotiza_cuentas', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';

  -- ── (d) Reserva de cupos: precio congelado, idempotencia, cupo, presupuestos y topes ───────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  select * into v_rec from public.reservar_cupo_srv(o1, me_a, cu_a, u_mea, s_mea, '00000000-0000-4000-9000-000000000001');
  a_a := v_rec.asignacion_id;
  r := r || jsonb_build_object('d1_reserva', v_rec.monto_bruto = 450000 and v_rec.monto_medio = 360000
                                           and v_rec.franja_clave = 'F2' and v_rec.cupos_restantes_franja = 1);
  select * into v_rec from public.reservar_cupo_srv(o1, me_a, cu_a, u_mea, s_mea, '00000000-0000-4000-9000-000000000001');
  r := r || jsonb_build_object('d2_idempotente', v_rec.asignacion_id = a_a);
  begin
    perform * from public.reservar_cupo_srv(o1, me_a, cu_a, u_mea, s_mea, '00000000-0000-4000-9000-000000000002');
    r := r || jsonb_build_object('d3_un_medio_un_cupo', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d3_un_medio_un_cupo', sqlerrm = 'AMO_YA_ACEPTADA');
  end;
  begin
    perform * from public.reservar_cupo_srv(o1, me_a, cu_a, u_meb, s_meb, null);
    r := r || jsonb_build_object('d4_actor_de_otro_medio', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d4_actor_de_otro_medio', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  select asignacion_id into a_b from public.reservar_cupo_srv(o1, me_b, cu_b, u_meb, s_meb, null);
  select asignacion_id into a_c from public.reservar_cupo_srv(o1, me_c, cu_c, u_mec, s_mec, null);
  begin
    perform * from public.reservar_cupo_srv(o1, me_d, cu_d, u_med, s_med, null);
    r := r || jsonb_build_object('d5_sin_cupo', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d5_sin_cupo', sqlerrm = 'AMO_SIN_CUPO');
  end;
  execute 'reset role';
  r := r || jsonb_build_object('d6_valores_congelados',
    (select a.estado = 'ACEPTADA' and a.tarifa_base_aplicada = 450000 and a.franja_clave = 'F2' and a.seguidores_al_aceptar = 75000
            and a.multiplicador_calidad_aplicado = 1 and a.multiplicador_exclusividad_aplicado = 1 and a.publicaciones = 1
            and a.aceptada_at = now() and a.fecha_limite_publicacion = o.ventana_fin and a.campana_id = c1
            and a.anunciante_id = an_a and m.monto_comision = 90000 and m.monto_medio = 360000 and m.comision_origen = 'GLOBAL'
     from public.asignaciones a join public.asignacion_montos m on m.asignacion_id = a.id
     join public.ofertas o on o.id = a.oferta_id where a.id = a_a));
  r := r || jsonb_build_object('d7_contadores',
    (select cupos_ocupados = 3 and presupuesto_comprometido = 950000 and llena_at is null from public.ofertas where id = o1)
    and (select cupos_ocupados = 2 from public.oferta_cupos where oferta_id = o1 and franja_id = fr1)
    and (select cupos_ocupados = 1 from public.oferta_cupos where oferta_id = o1 and franja_id = fr2)
    and (select presupuesto_comprometido = 950000 from public.campanas where id = c1));
  perform set_config('request.jwt.claims', c_med, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ofertas_para_medio(o1);         r := r || jsonb_build_object('d8_sin_cupo_no_visible', v_n = 0);
  execute 'reset role';

  -- Cancelación administrativa libera cupo y presupuesto.
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('asignaciones', a_c, 'CANCELADA', u_adm, s_adm, 'Cancelación de prueba');
    r := r || jsonb_build_object('d9_cancelar_exige_causa', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d9_cancelar_exige_causa', sqlerrm = 'AMO_MOTIVO_REQUERIDO');
  end;
  perform public.transicionar_srv('asignaciones', a_c, 'CANCELADA', u_adm, s_adm, 'Cancelación de prueba',
                                  '{"causa": "ADMINISTRATIVA"}');
  execute 'reset role';
  r := r || jsonb_build_object('d10_cancelacion_libera',
    (select estado = 'CANCELADA' and causa_cancelacion = 'ADMINISTRATIVA' and cancelada_at = now() from public.asignaciones where id = a_c)
    and (select cupos_ocupados = 2 and presupuesto_comprometido = 700000 from public.ofertas where id = o1)
    and (select cupos_ocupados = 1 from public.oferta_cupos where oferta_id = o1 and franja_id = fr1)
    and (select presupuesto_comprometido = 700000 from public.campanas where id = c1));

  -- Excepción de comisión por campaña (contexto confiable) y su precedencia en el precio.
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  begin
    insert into public.comisiones_excepcion (campana_id, porcentaje, vigente_desde, motivo)
    values (c1, 0.10, now(), 'Acuerdo comercial de prueba');
    r := r || jsonb_build_object('d11_comision_solo_servidor', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('d11_comision_solo_servidor', true);
  end;
  perform set_config('amo.ctx_confiable', 'si', true);
  insert into public.comisiones_excepcion (campana_id, porcentaje, vigente_desde, motivo)
  values (c1, 0.10, now(), 'Acuerdo comercial de prueba');
  perform set_config('amo.ctx_confiable', 'no', true);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  select asignacion_id into a_d from public.reservar_cupo_srv(o1, me_d, cu_d, u_med, s_med, null);
  execute 'reset role';
  r := r || jsonb_build_object('d12_comision_excepcion_campana',
    (select m.porcentaje_comision = 0.10 and m.monto_comision = 25000 and m.comision_origen = 'EXCEPCION_CAMPANA'
            and m.comision_excepcion_id is not null
     from public.asignacion_montos m where m.asignacion_id = a_d));

  -- Desistimiento (ACEPTADA sin descarga → RECHAZADA) y rechazo desde el marketplace (sin precio, idempotente).
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.rechazar_oferta_srv(o1, u_meb, s_meb);
    r := r || jsonb_build_object('d13_desistir_exige_motivo', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d13_desistir_exige_motivo', sqlerrm = 'AMO_MOTIVO_REQUERIDO');
  end;
  v_id := public.rechazar_oferta_srv(o1, u_meb, s_meb, 'Ya no tengo espacio');
  r := r || jsonb_build_object('d14_desistimiento', v_id = a_b);
  r_c := public.rechazar_oferta_srv(o1, u_mec, s_mec, 'No me interesa');
  v_id := public.rechazar_oferta_srv(o1, u_mec, s_mec, 'Otra vez');
  r := r || jsonb_build_object('d15_rechazo_marketplace_idempotente', v_id = r_c);
  execute 'reset role';
  r := r || jsonb_build_object('d16_desistimiento_libera',
    (select estado = 'RECHAZADA' and rechazada_at = now() and motivo = 'Ya no tengo espacio' and monto_bruto = 250000
     from public.asignaciones where id = a_b)
    and (select estado = 'RECHAZADA' and aceptada_at is null and monto_bruto is null and cuenta_social_id is null
         from public.asignaciones where id = r_c)
    and (select cupos_ocupados = 2 and presupuesto_comprometido = 700000 from public.ofertas where id = o1)
    and (select cupos_ocupados = 1 from public.oferta_cupos where oferta_id = o1 and franja_id = fr1));

  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform * from public.reservar_cupo_srv(o2, me_a, cu_a, u_mea, s_mea, null);
    r := r || jsonb_build_object('d17_presupuesto_oferta', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d17_presupuesto_oferta', sqlerrm = 'AMO_PRESUPUESTO_OFERTA');
  end;
  begin
    perform * from public.reservar_cupo_srv(o4, me_a, cu_a, u_mea, s_mea, null);
    r := r || jsonb_build_object('d18_tope_medio', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d18_tope_medio', sqlerrm = 'AMO_TOPE_MEDIO');
  end;
  execute 'reset role';
  update public.niveles_verificacion set tope_anual = 500000 where nivel = 1;
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform * from public.reservar_cupo_srv(o3, me_a, cu_a, u_mea, s_mea, null);
    r := r || jsonb_build_object('d19_tope_nivel', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d19_tope_nivel', sqlerrm = 'AMO_TOPE_NIVEL');
  end;
  execute 'reset role';
  update public.niveles_verificacion set tope_anual = 30000000 where nivel = 1;
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  begin
    update public.campanas set presupuesto_total = 600000 where id = c1;
    r := r || jsonb_build_object('d20_presupuesto_bajo_comprometido', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d20_presupuesto_bajo_comprometido', sqlerrm = 'AMO_PRESUPUESTO_CAMPANA');
  end;
  update public.campanas set presupuesto_total = 800000 where id = c1;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform * from public.reservar_cupo_srv(o3, me_b, cu_b, u_meb, s_meb, null);
    r := r || jsonb_build_object('d21_presupuesto_campana', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d21_presupuesto_campana', sqlerrm = 'AMO_PRESUPUESTO_CAMPANA');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  update public.campanas set presupuesto_total = 20000000 where id = c1;
  execute 'reset role';

  -- Oferta llena antes de la ventana ⇒ CUPOS_COMPLETOS; al liberar el cupo vuelve a PUBLICADA (D5).
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  select asignacion_id into a_o5 from public.reservar_cupo_srv(o5, me_b, cu_b, u_meb, s_meb, null);
  execute 'reset role';
  r := r || jsonb_build_object('d22_cupos_completos',
    (select estado = 'CUPOS_COMPLETOS' and cupos_completos_at = now() and llena_at = now() from public.ofertas where id = o5));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.rechazar_oferta_srv(o5, u_meb, s_meb, 'Me equivoqué de oferta');
  execute 'reset role';
  r := r || jsonb_build_object('d23_libera_y_republica',
    (select estado = 'PUBLICADA' and cupos_ocupados = 0 and presupuesto_comprometido = 0 from public.ofertas where id = o5));

  -- ── (e) Precio congelado e inmutabilidad de montos ─────────────────────────────────────────────────
  perform set_config('amo.actor_id', u_adm::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    update public.asignaciones set monto_bruto = 1 where id = a_a;
    r := r || jsonb_build_object('e1_monto_congelado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e1_monto_congelado', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  begin
    insert into public.asignaciones (oferta_id, campana_id, anunciante_id, medio_id, plataforma, estado)
    values (o1, c1, an_a, me_d, 'INSTAGRAM', 'RECHAZADA');
    r := r || jsonb_build_object('e2_asignacion_solo_por_procedimiento', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e2_asignacion_solo_por_procedimiento', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';
  begin
    update public.asignacion_montos set monto_comision = 1 where asignacion_id = a_a;      -- ni el owner
    r := r || jsonb_build_object('e3_comision_congelada', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e3_comision_congelada', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform set_config('amo.actor_id', '', true);
  -- Nueva vigencia de tarifa (F2 del post de Instagram): la cotización cambia, la asignación no.
  select id into v_tarifa_vieja from public.tarifas where formato_id = f_post and franja_id = fr2 and vigente_hasta is null;
  update public.tarifas set vigente_hasta = now() where id = v_tarifa_vieja;
  insert into public.tarifas (formato_id, plataforma, franja_id, valor_base, vigente_desde)
  values (f_post, 'INSTAGRAM', fr2, 500000, now());
  update public.cuentas_sociales set seguidores_verificados = 130000 where id = cu_a;      -- sube a F3
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select * into v_rec from public.cotizar_oferta(o1, cu_a);
  execute 'reset role';
  r := r || jsonb_build_object('e4_cotizacion_nueva_asignacion_congelada',
    v_rec.franja_clave = 'F3' and v_rec.monto_bruto > 450000
    and (select tarifa_id = v_tarifa_vieja and tarifa_base_aplicada = 450000 and monto_bruto = 450000 and franja_clave = 'F2'
                and seguidores_al_aceptar = 75000 from public.asignaciones where id = a_a));
  update public.cuentas_sociales set seguidores_verificados = 75000 where id = cu_a;

  -- ── (f) Ejecución: descarga, evidencia, métricas, validación y verificación ───────────────────────
  perform set_config('amo.reloj', (now() + interval '4 days')::text, true);        -- dentro de la ventana
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.registrar_evidencia_srv(a_a, 1, 'https://www.instagram.com/p/humo7a/', now() + interval '4 days' - interval '1 hour',
      'asignacion/' || a_a || '/publicacion/1-captura.webp', null, true, u_mea, s_mea);
    r := r || jsonb_build_object('f1_evidencia_exige_descarga', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f1_evidencia_exige_descarga', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.registrar_descarga_srv(a_a, u_meb, s_meb);
    r := r || jsonb_build_object('f2_descarga_ajena', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f2_descarga_ajena', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  v_j := public.registrar_descarga_srv(a_a, u_mea, s_mea);
  r := r || jsonb_build_object('f3_descarga',
    (v_j ->> 'creativo_id')::uuid = cr1 and jsonb_array_length(v_j -> 'archivos') = 1
    and (select estado = 'CONTENIDO_ENTREGADO' and contenido_descargado_at = now() + interval '4 days'
                and creativo_descargado_id = cr1 from public.asignaciones where id = a_a)
    and (select count(*) = 1 from public.descargas_contenido where asignacion_id = a_a));
  begin
    perform public.registrar_evidencia_srv(a_a, 1, 'https://www.instagram.com/p/humo7a/', now() + interval '4 days' - interval '1 hour',
      'asignacion/' || a_a || '/publicacion/1-captura.webp', null, false, u_mea, s_mea);
    r := r || jsonb_build_object('f4_etiqueta_requerida', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f4_etiqueta_requerida', sqlerrm = 'AMO_ETIQUETA_REQUERIDA');
  end;
  begin
    perform public.registrar_evidencia_srv(a_a, 1, 'https://www.instagram.com/p/humo7a/', now() + interval '2 days',
      'asignacion/' || a_a || '/publicacion/1-captura.webp', null, true, u_mea, s_mea);
    r := r || jsonb_build_object('f5_fuera_de_ventana', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f5_fuera_de_ventana', sqlerrm = 'AMO_FUERA_DE_VENTANA');
  end;
  begin
    perform public.registrar_evidencia_srv(a_a, 1, 'https://www.instagram.com/p/humo7a/', now() + interval '4 days' - interval '1 hour',
      'asignacion/' || a_b || '/publicacion/1-captura.webp', null, true, u_mea, s_mea);
    r := r || jsonb_build_object('f6_ruta_evidencia_ligada', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('f6_ruta_evidencia_ligada', true);
  end;
  p1 := public.registrar_evidencia_srv(a_a, 1, 'https://www.instagram.com/p/humo7a/', now() + interval '4 days' - interval '1 hour',
      'asignacion/' || a_a || '/publicacion/1-captura.webp', 'asignacion/' || a_a || '/publicacion/1-captura-min.webp',
      true, u_mea, s_mea);
  execute 'reset role';
  r := r || jsonb_build_object('f7_publicada',
    (select estado = 'PUBLICADA' and publicada_at = now() + interval '4 days' from public.asignaciones where id = a_a)
    and (select estado_validacion = 'PENDIENTE' and medio_id = me_a and anunciante_id = an_a
                and permanencia_hasta = now() + interval '11 days' - interval '1 hour' from public.publicaciones where id = p1));
  -- El medio carga el corte de 24 h aunque la evidencia esté pendiente (§5 pasos 11–12).
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, comentarios, captura_path)
  values (p1, 'H24', now() + interval '4 days', 20000, 30000, 800, 40, 'asignacion/' || a_a || '/metrica/h24.webp')
  returning id into m_h24;
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, captura_path)
    values (p1, 'H72', now() + interval '4 days', 20000, 'asignacion/' || a_a || '/metrica/h72.webp');
    r := r || jsonb_build_object('f8_metricas_por_plataforma', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('f8_metricas_por_plataforma', true);
  end;
  execute 'reset role';
  r := r || jsonb_build_object('f9_metrica_derivada',
    (select asignacion_id = a_a and medio_id = me_a and anunciante_id = an_a and plataforma = 'INSTAGRAM'
            and estado_validacion = 'PENDIENTE' and interacciones = 840 and alcance_norm = 20000 and not alerta_multiplo
     from public.metricas where id = m_h24));
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path)
    values (p1, 'H72', now() + interval '4 days', 1, 1, 'asignacion/' || a_a || '/metrica/h72.webp');
    r := r || jsonb_build_object('f10_metrica_ajena', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('f10_metrica_ajena', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('asignaciones', a_a, 'EVIDENCIA_VALIDADA', u_adm, s_adm);
    r := r || jsonb_build_object('f11_evidencia_sin_aprobar', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f11_evidencia_sin_aprobar', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.transicionar_srv('metricas', m_h24, 'APROBADA', u_adm, s_adm);
    r := r || jsonb_build_object('f11b_metrica_exige_evidencia_aprobada', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f11b_metrica_exige_evidencia_aprobada', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.transicionar_srv('publicaciones', p1, 'APROBADA', u_adm, s_adm);
    r := r || jsonb_build_object('f12_aprobar_exige_etiqueta', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('f12_aprobar_exige_etiqueta', true);
  end;
  perform public.transicionar_srv('publicaciones', p1, 'APROBADA', u_adm, s_adm, null, '{"etiqueta_verificada": true}');
  perform public.transicionar_srv('asignaciones', a_a, 'EVIDENCIA_VALIDADA', u_adm, s_adm);
  execute 'reset role';
  r := r || jsonb_build_object('f13_evidencia_validada',
    (select estado_validacion = 'APROBADA' and etiqueta_verificada and validada_por = u_adm from public.publicaciones where id = p1)
    and (select estado = 'EVIDENCIA_VALIDADA' and evidencia_validada_at is not null from public.asignaciones where id = a_a));
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path)
  values (p1, 'H72', now() + interval '4 days', 25000, 36000, 'asignacion/' || a_a || '/metrica/h72.webp') returning id into m_h72;
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path)
  values (p1, 'D7', now() + interval '4 days', 200000, 250000, 'asignacion/' || a_a || '/metrica/d7.webp') returning id into m_d7;
  execute 'reset role';
  r := r || jsonb_build_object('f14_metricas_cargadas_automatico',
    (select estado = 'METRICAS_CARGADAS' and metricas_cargadas_at is not null from public.asignaciones where id = a_a)
    and (select alerta_multiplo and (detalle_alertas ->> 'seguidores')::int = 75000 from public.metricas where id = m_d7));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('metricas', m_d7, 'RECHAZADA', u_adm, s_adm, 'Alcance inconsistente');
  perform public.transicionar_srv('asignaciones', a_a, 'EVIDENCIA_VALIDADA', u_adm, s_adm, 'Métricas rechazadas');
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 60000, impresiones = 90000 where id = m_d7;
  execute 'reset role';
  r := r || jsonb_build_object('f15_correccion_vuelve_a_pendiente',
    (select estado_validacion = 'PENDIENTE' and observaciones = 'Alcance inconsistente' and not alerta_multiplo
     from public.metricas where id = m_d7)
    and (select estado = 'METRICAS_CARGADAS' from public.asignaciones where id = a_a));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('metricas', m_h24, 'APROBADA', u_adm, s_adm);
  perform public.transicionar_srv('metricas', m_h72, 'APROBADA', u_adm, s_adm);
  perform public.transicionar_srv('metricas', m_d7, 'APROBADA', u_adm, s_adm);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 1 where id = m_h24;
  get diagnostics v_n = row_count;                                     r := r || jsonb_build_object('f16_medio_no_edita_aprobada', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('asignaciones', a_a, 'VERIFICADA', u_adm, s_adm);
    r := r || jsonb_build_object('f17_permanencia_pendiente', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f17_permanencia_pendiente', sqlerrm = 'AMO_PERMANENCIA_PENDIENTE');
  end;
  perform public.transicionar_srv('asignaciones', a_a, 'VERIFICADA', u_adm, s_adm,
                                  'Constancia: el post sigue publicado', '{"permanencia_verificada": true}');
  perform set_config('amo.actor_id', u_adm::text, true);
  begin
    update public.asignaciones set estado = 'LIQUIDADA' where id = a_a;
    r := r || jsonb_build_object('f18_estado_solo_via_transicion', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f18_estado_solo_via_transicion', sqlerrm = 'AMO_ESTADO_SOLO_VIA_TRANSICION');
  end;
  begin
    perform public.transicionar_srv('asignaciones', a_a, 'LIQUIDADA', u_adm, s_adm);
    r := r || jsonb_build_object('f19_liquidar_solo_por_procedimiento', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('f19_liquidar_solo_por_procedimiento', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';
  r := r || jsonb_build_object('f20_verificada',
    (select estado = 'VERIFICADA' and verificada_at = now() + interval '4 days' from public.asignaciones where id = a_a)
    and (select permanencia_verificada_at = now() + interval '4 days' from public.publicaciones where id = p1));

  -- ── (g) Disputas: partes, una abierta, mensajes y descarte ─────────────────────────────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.abrir_disputa_srv(a_a, 'METRICAS', 'El alcance no coincide con lo reportado', u_meb, s_meb);
    r := r || jsonb_build_object('g1_disputa_solo_partes', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('g1_disputa_solo_partes', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  d1 := public.abrir_disputa_srv(a_a, 'METRICAS', 'El alcance no coincide con lo reportado', u_ana, s_ana);
  begin
    perform public.abrir_disputa_srv(a_a, 'OTRO', 'Segunda disputa sobre lo mismo', u_mea, s_mea);
    r := r || jsonb_build_object('g2_una_disputa_abierta', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('g2_una_disputa_abierta', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';
  r := r || jsonb_build_object('g3_en_disputa',
    (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'VERIFICADA' from public.asignaciones where id = a_a)
    and (select parte = 'ANUNCIANTE' and estado_asignacion_origen = 'VERIFICADA' and abierta_por = u_ana
         from public.disputas where id = d1));
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  insert into public.disputa_mensajes (disputa_id, mensaje) values (d1, 'Adjunto el reporte del cliente');
  begin
    insert into public.disputa_mensajes (disputa_id, mensaje, interno) values (d1, 'Nota interna falsa', true);
    r := r || jsonb_build_object('g4_parte_no_escribe_interno', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('g4_parte_no_escribe_interno', true);
  end;
  execute 'reset role';
  r := r || jsonb_build_object('g5_mensaje_sellado',
    (select autor_id = u_ana and created_at = now() + interval '4 days' from public.disputa_mensajes where disputa_id = d1));
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.disputas;                       r := r || jsonb_build_object('g6_tercero_no_ve_disputa', v_n = 0);
  select count(*) into v_n from public.disputa_mensajes;               r := r || jsonb_build_object('g6_tercero_no_ve_mensajes', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.disputa_mensajes where disputa_id = d1;
                                                                       r := r || jsonb_build_object('g7_contraparte_ve_mensajes', v_n = 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.transicionar_srv('disputas', d1, 'RESUELTA', u_adm, s_adm, 'Resolución inválida',
                                    '{"estado_asignacion_resultante": "PUBLICADA"}');
    r := r || jsonb_build_object('g8_resolucion_valida_para_previo', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('g8_resolucion_valida_para_previo', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  perform public.transicionar_srv('disputas', d1, 'DESCARTADA', u_adm, s_adm, 'El reporte coincide con la evidencia');
  execute 'reset role';
  r := r || jsonb_build_object('g9_descartada_restaura',
    (select estado = 'VERIFICADA' and estado_previo_disputa is null from public.asignaciones where id = a_a)
    and (select estado = 'DESCARTADA' and resuelta_por = u_adm and estado_asignacion_resultante = 'VERIFICADA'
                and fecha_resolucion is not null from public.disputas where id = d1));

  -- ── (h) Vencida, reclamo del medio y reapertura con re-consumo de cupo ─────────────────────────────
  perform private.aplicar_transicion('asignaciones', a_d, 'VENCIDA_SIN_PUBLICAR', 'SISTEMA', null, 'Venció la ventana');
  perform private.liberar_cupo_efecto(a_d);
  r := r || jsonb_build_object('h1_vencida_libera',
    (select cupos_ocupados = 1 and presupuesto_comprometido = 450000 from public.ofertas where id = o1)
    and (select cupos_ocupados = 0 from public.oferta_cupos where oferta_id = o1 and franja_id = fr1));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.abrir_disputa_srv(a_d, 'INCUMPLIMIENTO', 'Sí publiqué y la evidencia no subió', u_ana, s_ana);
    r := r || jsonb_build_object('h2_vencida_solo_medio', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('h2_vencida_solo_medio', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  d2 := public.abrir_disputa_srv(a_d, 'INCUMPLIMIENTO', 'Sí publiqué y la evidencia no subió', u_med, s_med);
  execute 'reset role';
  r := r || jsonb_build_object('h3_disputa_de_vencida_sin_cupo',
    (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'VENCIDA_SIN_PUBLICAR'
            and not private.consume_cupo(estado, estado_previo_disputa) from public.asignaciones where id = a_d)
    and (select cupos_ocupados = 0 from public.oferta_cupos where oferta_id = o1 and franja_id = fr1));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('disputas', d2, 'RESUELTA', u_adm, s_adm, 'A favor del medio',
                                  '{"estado_asignacion_resultante": "CONTENIDO_ENTREGADO"}');
  execute 'reset role';
  r := r || jsonb_build_object('h4_reapertura_reconsume',
    (select estado = 'CONTENIDO_ENTREGADO' and estado_previo_disputa is null
            and fecha_limite_publicacion = now() + interval '4 days' + interval '24 hours' from public.asignaciones where id = a_d)
    and (select cupos_ocupados = 2 and presupuesto_comprometido = 700000 from public.ofertas where id = o1)
    and (select cupos_ocupados = 1 from public.oferta_cupos where oferta_id = o1 and franja_id = fr1)
    and (select presupuesto_comprometido = 700000 from public.campanas where id = c1)
    and (select estado = 'RESUELTA' and estado_asignacion_resultante = 'CONTENIDO_ENTREGADO' from public.disputas where id = d2));

  -- ── (i) Liquidación, anulación, documento soporte y pago ───────────────────────────────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  liq1 := public.generar_liquidacion_srv(me_a, private.hoy() - 14, private.hoy(), u_adm, s_adm);
  execute 'reset role';
  r := r || jsonb_build_object('i1_liquidacion_borrador',
    (select estado = 'BORRADOR' and cantidad_asignaciones = 1 and monto_bruto = 450000 and monto_comision = 90000
            and monto_medio = 360000 and monto_retenciones = 0 and monto_neto = 360000 and requiere_documento_soporte
            and creada_por = u_adm from public.liquidaciones where id = liq1)
    and (select estado = 'LIQUIDADA' and liquidacion_id = liq1 from public.asignaciones where id = a_a)
    and (select retenciones_aplicadas = '[]'::jsonb and monto_retenciones = 0 and monto_neto = 360000
         from public.asignacion_montos where asignacion_id = a_a)
    and (select count(*) = 1 from public.documentos_soporte where liquidacion_id = liq1 and estado = 'BORRADOR' and consecutivo is null));
  begin
    update public.asignacion_montos set monto_retenciones = 1, monto_neto = 359999 where asignacion_id = a_a;
    r := r || jsonb_build_object('i2_retenciones_no_se_reescriben', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('i2_retenciones_no_se_reescriben', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  begin
    perform public.generar_liquidacion_srv(me_a, private.hoy() - 3, private.hoy(), u_adm, s_adm);
    r := r || jsonb_build_object('i3_periodo_solapado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('i3_periodo_solapado', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  begin
    perform public.transicionar_srv('liquidaciones', liq1, 'APROBADA', u_adm, s_adm);
    r := r || jsonb_build_object('i4_segregacion_d17', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('i4_segregacion_d17', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform public.transicionar_srv('liquidaciones', liq1, 'APROBADA', u_fin, s_fin);
  perform public.transicionar_srv('liquidaciones', liq1, 'ANULADA', u_fin, s_fin, 'Error en el periodo');
  execute 'reset role';
  r := r || jsonb_build_object('i5_anulacion_revierte',
    (select estado = 'ANULADA' and aprobada_por = u_fin and anulada_at is not null from public.liquidaciones where id = liq1)
    and (select estado = 'VERIFICADA' and liquidacion_id is null and liquidada_at is null and verificada_at is not null
         from public.asignaciones where id = a_a)
    and (select retenciones_aplicadas is null and monto_neto is null from public.asignacion_montos where asignacion_id = a_a)
    and (select estado = 'ANULADO' from public.documentos_soporte where liquidacion_id = liq1));
  -- Solo hay una resolución DIAN activa por tipo y la BD puede traer las suyas (datos demo): se desactivan dentro de
  -- esta transacción para probar primero «sin resolución» (i7) y numerar después desde 1 con las de la prueba (i8, j1).
  update public.resoluciones_dian set activa = false where activa;
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  liq2 := public.generar_liquidacion_srv(me_a, private.hoy() - 14, private.hoy(), u_adm, s_adm);
  perform public.transicionar_srv('liquidaciones', liq2, 'APROBADA', u_fin, s_fin);
  begin
    perform public.registrar_pago_liquidacion_srv(liq2, private.hoy(), 'TRX-1', 'liquidacion/' || liq2 || '/soporte.pdf', u_fin, s_fin);
    r := r || jsonb_build_object('i6_pago_exige_documento_soporte', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('i6_pago_exige_documento_soporte', sqlerrm = 'AMO_DOCUMENTO_SOPORTE_REQUERIDO');
  end;
  begin
    perform public.emitir_documento_soporte_srv(liq2, u_fin, s_fin);
    r := r || jsonb_build_object('i7_sin_resolucion_dian', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('i7_sin_resolucion_dian', sqlerrm = 'AMO_RESOLUCION_AGOTADA');
  end;
  execute 'reset role';
  insert into public.resoluciones_dian (tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        vigente_desde, activa)
  values ('DOCUMENTO_SOPORTE', 'DSH', '18764000000001', private.hoy() - 30, 1, 100, private.hoy() - 1, true),
         ('FACTURA_VENTA', 'FH', '18764000000002', private.hoy() - 30, 1, 50, private.hoy() - 1, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_id := public.emitir_documento_soporte_srv(liq2, u_fin, s_fin);
  perform public.registrar_pago_liquidacion_srv(liq2, private.hoy(), 'TRX-1', 'liquidacion/' || liq2 || '/soporte.pdf', u_fin, s_fin);
  execute 'reset role';
  r := r || jsonb_build_object('i8_documento_soporte_emitido',
    (select estado = 'EMITIDO' and consecutivo = 1 and numero = 'DSH1' and fecha_emision = private.hoy() and liquidacion_id = liq2
     from public.documentos_soporte where id = v_id));
  r := r || jsonb_build_object('i9_pago_liquidacion',
    (select estado = 'PAGADA' and fecha_pago = private.hoy() and referencia_pago = 'TRX-1' and pagada_at is not null
     from public.liquidaciones where id = liq2)
    and (select estado = 'PAGADA' and pagada_at is not null and liquidacion_id = liq2 from public.asignaciones where id = a_a));
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  begin
    update public.liquidaciones set referencia_pago = 'Cambio' where id = liq2;
    r := r || jsonb_build_object('i10_pagada_no_cambia', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('i10_pagada_no_cambia', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';

  -- ── (j) Facturas: borrador, emisión con consecutivo, pagos parciales y total ───────────────────────
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  insert into public.facturas (anunciante_id, campana_id, subtotal, iva) values (an_a, c1, 1000000, 190000) returning id into f1;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_j := public.emitir_factura_srv(f1, u_fin, s_fin);
  execute 'reset role';
  r := r || jsonb_build_object('j1_factura_emitida',
    v_j ->> 'numero' = 'FH1'
    and (select estado = 'EMITIDA' and consecutivo = 1 and fecha_emision = private.hoy()
                and fecha_vencimiento = private.hoy() + 30 and total = 1190000 from public.facturas where id = f1));
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  begin
    update public.facturas set subtotal = 2 where id = f1;
    r := r || jsonb_build_object('j2_emitida_no_se_edita', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('j2_emitida_no_se_edita', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.registrar_pago_anunciante_srv(f1, private.hoy(), 500000, 'TRANSFERENCIA', 'R1', null, u_fin, s_fin);
  v_ok := (select estado = 'PAGADA_PARCIAL' and pagado = 500000 and saldo = 690000 from public.facturas where id = f1);
  begin
    perform public.registrar_pago_anunciante_srv(f1, private.hoy(), 700000, 'PSE', 'R2', null, u_fin, s_fin);
    r := r || jsonb_build_object('j4_pago_no_supera_saldo', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('j4_pago_no_supera_saldo', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  perform public.registrar_pago_anunciante_srv(f1, private.hoy(), 690000, 'PSE', 'R3', null, u_fin, s_fin);
  begin
    perform public.transicionar_srv('facturas', f1, 'ANULADA', u_fin, s_fin, 'Ya está pagada');
    r := r || jsonb_build_object('j6_pagada_no_se_anula', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('j6_pagada_no_se_anula', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';
  r := r || jsonb_build_object('j3_pago_parcial', v_ok);
  r := r || jsonb_build_object('j5_pagada', (select estado = 'PAGADA' and saldo = 0 and pagada_at is not null from public.facturas where id = f1));

  -- ── (k) Cancelación de campaña en cascada ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('campanas', c2, 'CANCELADA', u_ana, s_ana, 'Ya no se necesita');
  begin
    perform public.transicionar_srv('campanas', c1, 'CANCELADA', u_ana, s_ana, 'Intento con asignaciones');
    r := r || jsonb_build_object('k2_no_cancela_con_asignaciones', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('k2_no_cancela_con_asignaciones', sqlerrm = 'AMO_TRANSICION_INVALIDA');
  end;
  execute 'reset role';
  r := r || jsonb_build_object('k1_cascada_ofertas',
    (select estado = 'CANCELADA' and cancelada_at is not null from public.campanas where id = c2)
    and (select estado = 'CANCELADA' and cancelada_at is not null from public.ofertas where id = o4));

  -- ── (l) RLS por rol ─────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.campanas;                       r := r || jsonb_build_object('l1_anunciante_sus_campanas', v_n = 2);
  select count(*) into v_n from public.ofertas;                        r := r || jsonb_build_object('l1_anunciante_sus_ofertas', v_n = 5);
  select count(*) into v_n from public.asignaciones where oferta_id = o1;
                                                                       r := r || jsonb_build_object('l2_anunciante_sus_asignaciones', v_n = 5);
  select count(*) into v_n from public.asignacion_montos;              r := r || jsonb_build_object('l3_anunciante_sin_montos_internos', v_n = 0);
  select count(*) into v_n from public.liquidaciones;                  r := r || jsonb_build_object('l3_anunciante_sin_liquidaciones', v_n = 0);
  select count(*) into v_n from public.comisiones_excepcion;           r := r || jsonb_build_object('l3_anunciante_sin_comisiones', v_n = 0);
  select count(*) into v_n from public.facturas;                       r := r || jsonb_build_object('l4_anunciante_su_factura', v_n = 1);
  select count(*) into v_n from public.pagos_anunciante;               r := r || jsonb_build_object('l4_anunciante_sus_pagos', v_n = 2);
  select count(*) into v_n from public.medios_publico(array[me_a, me_b]);
                                                                       r := r || jsonb_build_object('l5_anunciante_ve_medios_con_negocio', v_n = 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_anb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.campanas;                       r := r || jsonb_build_object('l6_anunciante_b_sin_campanas', v_n = 0);
  select count(*) into v_n from public.asignaciones;                   r := r || jsonb_build_object('l6_anunciante_b_sin_asignaciones', v_n = 0);
  select count(*) into v_n from public.publicaciones;                  r := r || jsonb_build_object('l6_anunciante_b_sin_publicaciones', v_n = 0);
  select count(*) into v_n from public.facturas;                       r := r || jsonb_build_object('l6_anunciante_b_sin_facturas', v_n = 0);
  select count(*) into v_n from public.medios_publico(array[me_a]);    r := r || jsonb_build_object('l6_anunciante_b_sin_medios', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.asignaciones;                   r := r || jsonb_build_object('l7_medio_sin_tabla_asignaciones', v_n = 0);
  select count(*) into v_n from public.asignacion_montos;              r := r || jsonb_build_object('l7_medio_sin_montos', v_n = 0);
  select count(*) into v_n from public.publicaciones;                  r := r || jsonb_build_object('l8_medio_sus_publicaciones', v_n = 1);
  select count(*) into v_n from public.metricas;                       r := r || jsonb_build_object('l8_medio_sus_metricas', v_n = 3);
  select count(*) into v_n from public.liquidaciones;                  r := r || jsonb_build_object('l8_medio_sus_liquidaciones', v_n = 2);
  select count(*) into v_n from public.documentos_soporte;             r := r || jsonb_build_object('l8_medio_sus_documentos_soporte', v_n = 2);
  select count(*) into v_n from public.creativos where oferta_id = o1; r := r || jsonb_build_object('l8_medio_ve_creativo_activo', v_n = 1);
  select * into v_rec from public.mis_asignaciones_medio();
  r := r || jsonb_build_object('l9_mis_asignaciones_medio',
    v_rec.id = a_a and v_rec.monto_neto = 360000 and v_rec.monto_bruto = 450000 and v_rec.monto_comision = 90000);
  select count(*) into v_n from public.anunciantes_publico(array[an_a, an_b]);
                                                                       r := r || jsonb_build_object('l10_medio_ve_su_anunciante', v_n = 1);
  execute 'reset role';
  update public.configuracion set valor = 'false' where clave = 'comision.visible_para_medio';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select * into v_rec from public.mis_asignaciones_medio();
  r := r || jsonb_build_object('l11_sin_comision_visible',
    v_rec.monto_bruto is null and v_rec.monto_comision is null and v_rec.tarifa_base_aplicada is null and v_rec.monto_medio = 360000);
  execute 'reset role';
  update public.configuracion set valor = 'true' where clave = 'comision.visible_para_medio';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.publicaciones;                  r := r || jsonb_build_object('l12_medio_b_sin_publicaciones', v_n = 0);
  select count(*) into v_n from public.liquidaciones;                  r := r || jsonb_build_object('l12_medio_b_sin_liquidaciones', v_n = 0);
  select count(*) into v_n from public.creativos;                      r := r || jsonb_build_object('l12_medio_b_sin_creativos', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.asignacion_montos where asignacion_id in (a_a, a_b, a_d);
                                                                       r := r || jsonb_build_object('l13_finanzas_ve_montos', v_n = 3);
  select count(*) into v_n from public.campanas where id in (c1, c2);  r := r || jsonb_build_object('l13_finanzas_ve_campanas', v_n = 2);
  select count(*) into v_n from public.comisiones_excepcion where campana_id = c1;
                                                                       r := r || jsonb_build_object('l13_finanzas_ve_comisiones', v_n = 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.asignaciones;                   r := r || jsonb_build_object('l14_admin_aal1_sin_negocio', v_n = 0);
  execute 'reset role';
  execute 'set local role anon';
  begin
    select count(*) into v_n from public.asignaciones;
    r := r || jsonb_build_object('l15_anon_sin_select', 'NO FALLÓ');
  exception when insufficient_privilege then
    r := r || jsonb_build_object('l15_anon_sin_select', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (m) Invariantes de contadores (como la prueba de carrera) y grants ─────────────────────────────
  r := r || jsonb_build_object('m1_invariante_franjas', not exists (
    select 1 from public.oferta_cupos oc
    where oc.cupos_ocupados <> (select count(*) from public.asignaciones a where a.oferta_id = oc.oferta_id
                                  and a.franja_id = oc.franja_id and private.consume_cupo(a.estado, a.estado_previo_disputa))));
  r := r || jsonb_build_object('m2_invariante_ofertas', not exists (
    select 1 from public.ofertas o
    where o.cupos_ocupados <> (select coalesce(sum(oc.cupos_ocupados), 0) from public.oferta_cupos oc where oc.oferta_id = o.id)
       or o.presupuesto_comprometido <> (select coalesce(sum(a.monto_bruto), 0) from public.asignaciones a
                                         where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa))));
  r := r || jsonb_build_object('m3_invariante_campanas', not exists (
    select 1 from public.campanas c
    where c.presupuesto_comprometido <> (select coalesce(sum(a.monto_bruto), 0) from public.asignaciones a
                                         where a.campana_id = c.id and private.consume_cupo(a.estado, a.estado_previo_disputa))));
  r := r || jsonb_build_object('m4_montos_uno_a_uno', not exists (
    select 1 from public.asignaciones a where a.aceptada_at is not null
      and not exists (select 1 from public.asignacion_montos m where m.asignacion_id = a.id)));
  r := r || jsonb_build_object('m5_execute',
    has_function_privilege('service_role', 'public.reservar_cupo_srv(uuid, uuid, uuid, uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.reservar_cupo_srv(uuid, uuid, uuid, uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb)', 'execute')
    and not has_function_privilege('service_role', 'private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'private.medio_elegible(uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'private.calcular_precio(uuid, uuid, timestamptz)', 'execute')
    and not has_table_privilege('authenticated', 'private.transiciones_estado', 'select'));
  r := r || jsonb_build_object('m6_bitacora_transiciones',
    (select count(*) >= 8 from public.bitacora where entidad = 'asignaciones' and entidad_id = a_a::text and accion = 'TRANSICION')
    and exists (select 1 from public.bitacora where entidad = 'asignaciones' and entidad_id = a_c::text and accion = 'TRANSICION'
                  and actor_id = u_adm and motivo = 'Cancelación de prueba'));

  perform set_config('amo.reloj', '', true);
  perform set_config('amo.actor_id', '', true);
  perform set_config('amo.ctx_confiable', '', true);
  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;

-- ── Políticas UPDATE fusionadas (7g): cada rama de la política única de campanas, ofertas y metricas ──────────
begin;

do $pol$
declare
  r jsonb := '{}'; v_n bigint;
  u_adm constant uuid := '00000000-0000-4000-a000-000000000091';
  u_ana constant uuid := '00000000-0000-4000-a000-000000000092';
  u_anb constant uuid := '00000000-0000-4000-a000-000000000093';
  u_mea constant uuid := '00000000-0000-4000-a000-000000000094';
  u_meb constant uuid := '00000000-0000-4000-a000-000000000095';
  s_adm constant uuid := '00000000-0000-4000-b000-000000000091';
  s_ana constant uuid := '00000000-0000-4000-b000-000000000092';
  s_anb constant uuid := '00000000-0000-4000-b000-000000000093';
  s_mea constant uuid := '00000000-0000-4000-b000-000000000094';
  s_meb constant uuid := '00000000-0000-4000-b000-000000000095';
  an_a constant uuid := '00000000-0000-4000-c000-00000000009a';
  an_b constant uuid := '00000000-0000-4000-c000-00000000009b';
  me_a constant uuid := '00000000-0000-4000-d000-00000000009a';
  me_b constant uuid := '00000000-0000-4000-d000-00000000009b';
  cu_a constant uuid := '00000000-0000-4000-e000-00000000009a';
  c1 constant uuid := '00000000-0000-4000-f000-0000000009c1';
  c2 constant uuid := '00000000-0000-4000-f000-0000000009c2';
  o1 constant uuid := '00000000-0000-4000-f000-0000000009a1';
  o2 constant uuid := '00000000-0000-4000-f000-0000000009a2';
  p1 constant uuid := '00000000-0000-4000-f000-0000000009d1';
  m1 constant uuid := '00000000-0000-4000-f000-0000000009e1';
  m2 constant uuid := '00000000-0000-4000-f000-0000000009e2';
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr2 uuid := (select id from public.franjas where clave = 'F2');
  c_adm text; c_ana text; c_anb text; c_mea text; c_meb text;
begin
  -- Preparación (owner, modo_carga): campaña ACTIVA y CANCELADA, oferta BORRADOR y PUBLICADA con una asignación
  -- publicada, una métrica PENDIENTE y otra APROBADA.
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'pol.adm@amo.test'), (u_ana, 'pol.ana@amo.test'), (u_anb, 'pol.anb@amo.test'),
               (u_mea, 'pol.mea@amo.test'), (u_meb, 'pol.meb@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo, estado_verificacion, verificado_at)
  values (an_a, 'Pol A S.A.S.', 'Pol A', '900000301', '1', v_sector, '11001', 'VERIFICADO', now()),
         (an_b, 'Pol B S.A.S.', 'Pol B', '900000302', '1', v_sector, '11001', 'VERIFICADO', now());
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Pol Medio A', 'CREADOR', '05001', 'VERIFICADO', 1, now()), (me_b, 'Pol Medio B', 'CREADOR', '05001', 'VERIFICADO', 1, now());
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada, metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'pol_a', 'https://instagram.com/pol_a', 75000, true, 'MANUAL', now());
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO', debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO', debe_cambiar_password = false,
         anunciante_id = case id when u_ana then an_a else an_b end where id in (u_ana, u_anb);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO', debe_cambiar_password = false,
         medio_id = case id when u_mea then me_a else me_b end where id in (u_mea, u_meb);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm, u_adm, now(), now(), 'aal2'), (s_ana, u_ana, now(), now(), 'aal1'), (s_anb, u_anb, now(), now(), 'aal1'),
    (s_mea, u_mea, now(), now(), 'aal1'), (s_meb, u_meb, now(), now(), 'aal1');
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at, cancelada_at)
  values (c1, an_a, 'Pol activa', 'M', private.hoy(), private.hoy() + 30, 5000000, 'ACTIVA', now(), null),
         (c2, an_a, 'Pol cancelada', 'M', private.hoy(), private.hoy() + 30, 5000000, 'CANCELADA', null, now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo, tope_porcentaje_por_medio,
                              cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion, estado, publicada_at)
  values (o1, c1, an_a, 'Pol borrador', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}', now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', 'BORRADOR', null),
         (o2, c1, an_a, 'Pol publicada', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}', now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now());
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o1, fr2, 1), (o2, fr2, 1);
  perform set_config('amo.modo_carga', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  perform public.reservar_cupo_srv(o2, me_a, cu_a, u_mea, s_mea, null);
  execute 'reset role';
  perform set_config('amo.modo_carga', 'on', true);
  update public.asignaciones set estado = 'PUBLICADA', publicada_at = now(), contenido_descargado_at = now() where oferta_id = o2;
  insert into public.publicaciones (id, asignacion_id, numero, url_post, fecha_publicacion, captura_path, etiqueta_publicidad_confirmada, permanencia_hasta)
  select p1, a.id, 1, 'https://www.instagram.com/p/pol1/', now(), 'asignacion/' || a.id || '/publicacion/1.webp', true, now() + interval '7 days'
  from public.asignaciones a where a.oferta_id = o2;
  insert into public.metricas (id, publicacion_id, corte, fecha_corte, alcance, impresiones, captura_path, estado_validacion)
  select m1, p1, 'H24'::public.corte_metrica, now(), 100, 100, 'asignacion/' || a.id || '/metrica/h24.webp', 'PENDIENTE'::public.validacion_estado from public.asignaciones a where a.oferta_id = o2
  union all
  select m2, p1, 'H72'::public.corte_metrica, now(), 100, 100, 'asignacion/' || a.id || '/metrica/h72.webp', 'APROBADA'::public.validacion_estado from public.asignaciones a where a.oferta_id = o2;
  perform set_config('amo.modo_carga', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.ctx_confiable', 'no', true);
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_anb := jsonb_build_object('sub', u_anb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anb)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;

  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  update public.campanas set objetivo = 'Objetivo nuevo' where id = c1;   get diagnostics v_n = row_count; r := r || jsonb_build_object('p1_anunciante_edita_activa', v_n = 1);
  update public.campanas set objetivo = 'Objetivo nuevo' where id = c2;   get diagnostics v_n = row_count; r := r || jsonb_build_object('p2_anunciante_no_edita_cancelada', v_n = 0);
  update public.ofertas set titulo = 'Pol borrador editado' where id = o1; get diagnostics v_n = row_count; r := r || jsonb_build_object('p3_anunciante_edita_oferta_borrador', v_n = 1);
  update public.ofertas set titulo = 'Pol publicada editada' where id = o2; get diagnostics v_n = row_count; r := r || jsonb_build_object('p4_anunciante_no_edita_publicada', v_n = 0);
  update public.metricas set alcance = 1 where id = m1;                   get diagnostics v_n = row_count; r := r || jsonb_build_object('p5_anunciante_no_edita_metricas', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_anb, true);
  execute 'set local role authenticated';
  update public.campanas set objetivo = 'Objetivo ajeno' where id = c1;    get diagnostics v_n = row_count; r := r || jsonb_build_object('p6_otro_anunciante_no_edita', v_n = 0);
  update public.ofertas set titulo = 'Pol borrador ajeno' where id = o1;  get diagnostics v_n = row_count; r := r || jsonb_build_object('p7_otro_anunciante_no_edita_oferta', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 150 where id = m1;                 get diagnostics v_n = row_count; r := r || jsonb_build_object('p8_medio_edita_pendiente', v_n = 1);
  update public.metricas set alcance = 150 where id = m2;                 get diagnostics v_n = row_count; r := r || jsonb_build_object('p9_medio_no_edita_aprobada', v_n = 0);
  update public.campanas set objetivo = 'Objetivo medio' where id = c1;   get diagnostics v_n = row_count; r := r || jsonb_build_object('p10_medio_no_edita_campana', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 160 where id = m1;                 get diagnostics v_n = row_count; r := r || jsonb_build_object('p11_otro_medio_no_edita', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 170 where id = m2;                 get diagnostics v_n = row_count; r := r || jsonb_build_object('p12_admin_edita_metrica', v_n = 1);
  update public.ofertas set titulo = 'Pol borrador moderado' where id = o1; get diagnostics v_n = row_count; r := r || jsonb_build_object('p13_admin_edita_oferta', v_n = 1);
  update public.campanas set objetivo = 'Objetivo admin' where id = c1;   get diagnostics v_n = row_count; r := r || jsonb_build_object('p13b_admin_edita_campana', v_n = 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.ctx_confiable', '', true);
  r := r || jsonb_build_object('p14_una_permisiva_update',
    (select count(*) = 3 from pg_policies where schemaname = 'public' and tablename in ('campanas', 'ofertas', 'metricas') and cmd = 'UPDATE'));
  perform set_config('humo.resultado', r::text, true);
end
$pol$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
