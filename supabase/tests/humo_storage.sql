-- Pruebas de humo de la migración 10 (storage): buckets privados con límites, restrictivas globales (sesión válida y
-- ruta segura) y políticas por bucket y carpeta de storage.objects (subida, lectura y borrado por rol, dueño y estado
-- de la fila de negocio), más el endurecimiento de perfiles.avatar_path.
-- Inserta filas en storage.objects como `authenticated` (lo que hace la API de Storage con el JWT del usuario) y
-- permite el DELETE directo solo dentro de la transacción (storage.allow_delete_query).
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte.
-- Cada prueba deja `true` si pasa o un texto con lo observado si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_ok boolean;
  v_n bigint;
  u_adm constant uuid := '00000000-0000-4000-a000-000000000a01';
  u_fin constant uuid := '00000000-0000-4000-a000-000000000a02';
  u_ana constant uuid := '00000000-0000-4000-a000-000000000a03';
  u_anb constant uuid := '00000000-0000-4000-a000-000000000a04';
  u_mea constant uuid := '00000000-0000-4000-a000-000000000a05';
  u_meb constant uuid := '00000000-0000-4000-a000-000000000a06';
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000a00';
  s_adm constant uuid := '00000000-0000-4000-b000-000000000a01';
  s_fin constant uuid := '00000000-0000-4000-b000-000000000a02';
  s_ana constant uuid := '00000000-0000-4000-b000-000000000a03';
  s_anb constant uuid := '00000000-0000-4000-b000-000000000a04';
  s_mea constant uuid := '00000000-0000-4000-b000-000000000a05';
  s_meb constant uuid := '00000000-0000-4000-b000-000000000a06';
  an_a constant uuid := '00000000-0000-4000-c000-000000000a01';
  an_b constant uuid := '00000000-0000-4000-c000-000000000a02';
  me_a constant uuid := '00000000-0000-4000-d000-000000000a01';
  me_b constant uuid := '00000000-0000-4000-d000-000000000a02';
  cu_a constant uuid := '00000000-0000-4000-e000-000000000a01';
  cu_b constant uuid := '00000000-0000-4000-e000-000000000a02';
  c1 constant uuid := '00000000-0000-4000-f000-000000000a01';
  o1 constant uuid := '00000000-0000-4000-f000-000000000a11';
  o2 constant uuid := '00000000-0000-4000-f000-000000000a12';
  cr1 constant uuid := '00000000-0000-4000-f000-000000000a21';
  cr2 constant uuid := '00000000-0000-4000-f000-000000000a22';
  cr2v constant uuid := '00000000-0000-4000-f000-000000000a23';
  a1 constant uuid := '00000000-0000-4000-f000-000000000a31';
  a2 constant uuid := '00000000-0000-4000-f000-000000000a32';
  d1 constant uuid := '00000000-0000-4000-f000-000000000a41';
  l1 constant uuid := '00000000-0000-4000-f000-000000000a51';
  f1 constant uuid := '00000000-0000-4000-f000-000000000a61';
  rs1 constant uuid := '00000000-0000-4000-f000-000000000a71';
  c_adm1 text; c_adm text; c_fin text; c_ana text; c_anb text; c_mea text; c_meb text;
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
  from (values (u_adm, 'humo10.adm@amo.test'), (u_fin, 'humo10.fin@amo.test'), (u_ana, 'humo10.ana@amo.test'),
               (u_anb, 'humo10.anb@amo.test'), (u_mea, 'humo10.mea@amo.test'), (u_meb, 'humo10.meb@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'Humo Diez A S.A.S.', 'Humo Diez A', '900001001', '1', v_sector, '11001', 'VERIFICADO', now()),
         (an_b, 'Humo Diez B S.A.S.', 'Humo Diez B', '900001002', '1', v_sector, '11001', 'VERIFICADO', now());
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Diez A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, now()),
         (me_b, 'Medio Diez B', 'CREADOR', '76001', 'VERIFICADO', 1, now());
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo10_a', 'https://instagram.com/humo10_a', 45000, fr1, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo10_b', 'https://instagram.com/humo10_b', 45000, fr1, true, 'MANUAL', now());
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'FINANZAS'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_fin;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = case id when u_ana then an_a else an_b end where id in (u_ana, u_anb);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false, medio_id = case id when u_mea then me_a else me_b end where id in (u_mea, u_meb);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm1, u_adm, now(), now(), 'aal1'), (s_adm, u_adm, now(), now(), 'aal2'), (s_fin, u_fin, now(), now(), 'aal2'),
    (s_ana, u_ana, now(), now(), 'aal1'), (s_anb, u_anb, now(), now(), 'aal1'), (s_mea, u_mea, now(), now(), 'aal1'),
    (s_meb, u_meb, now(), now(), 'aal1');
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c1, an_a, 'Campaña Diez', 'Marca Humo', private.hoy(), private.hoy() + 30, 20000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, publicada_at)
  values (o1, c1, an_a, 'Oferta Diez borrador', f_post, 'INSTAGRAM', 5000000, 1, '{D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'BORRADOR', null),
         (o2, c1, an_a, 'Oferta Diez publicada', f_post, 'INSTAGRAM', 5000000, 1, '{D7}', now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now());
  insert into public.creativos (id, oferta_id, tipo, version, vigente)
  values (cr1, o1, 'IMAGEN', 1, true), (cr2, o2, 'IMAGEN', 1, false), (cr2v, o2, 'IMAGEN', 2, true);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
                                   aceptada_at, contenido_descargado_at, fecha_limite_publicacion, publicaciones, monto_bruto,
                                   tarifa_id, franja_id)
  values (a1, o2, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'CONTENIDO_ENTREGADO', now(), now(), now() + interval '9 days', 1, 300000,
          v_tarifa, fr1),
         (a2, o2, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'ACEPTADA', now(), null, now() + interval '9 days', 1, 300000,
          v_tarifa, fr1);
  insert into public.disputas (id, asignacion_id, abierta_por, parte, motivo, descripcion, estado, estado_asignacion_origen)
  values (d1, a1, u_mea, 'MEDIO', 'CONTENIDO', 'Prueba de adjuntos de disputa', 'ABIERTA', 'CONTENIDO_ENTREGADO');
  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
                                    monto_medio, monto_retenciones, monto_neto, estado, requiere_documento_soporte)
  values (l1, me_a, private.hoy() - 15, private.hoy() - 1, 0, 0, 0, 0, 0, 0, 'BORRADOR', true);
  insert into public.resoluciones_dian (id, tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        consecutivo_actual, vigente_desde, activa)
  values (rs1, 'FACTURA_VENTA', 'HDIE', '18760000010', '2026-01-01', 1, 1000, 1, '2026-01-01', false);
  insert into public.facturas (id, anunciante_id, resolucion_id, prefijo, consecutivo, fecha_emision, fecha_vencimiento,
                               subtotal, iva, pagado, estado, emitida_at)
  values (f1, an_a, rs1, 'HDIE', 1, private.hoy(), private.hoy() + 30, 100000, 19000, 0, 'EMITIDA', now());
  perform set_config('amo.modo_carga', '', true);
  perform set_config('storage.allow_delete_query', 'true', true);
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_anb := jsonb_build_object('sub', u_anb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anb)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;

  r := r || jsonb_build_object('s0_buckets_privados',
    (select count(*) = 5 from storage.buckets
     where id in ('avatares', 'documentos', 'creativos', 'evidencias', 'soportes') and not public)
    and (select file_size_limit = 2097152 and allowed_mime_types @> array['image/webp'] from storage.buckets where id = 'avatares')
    and (select file_size_limit = 52428800 and allowed_mime_types @> array['video/mp4'] from storage.buckets where id = 'creativos')
    and (select allowed_mime_types @> array['text/csv'] from storage.buckets where id = 'soportes'));

  -- ── (a) Anunciante A: avatar, logo, documentos, creativos ──────────────────────────────────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  begin insert into storage.objects (bucket_id, name) values ('avatares', 'perfil/' || u_ana || '/a.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a1_avatar_propio', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('avatares', 'perfil/' || u_mea || '/a.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a2_avatar_ajeno', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('avatares', 'perfil/' || u_ana || '/sub/a.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a3_avatar_subcarpeta', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('avatares', 'perfil/' || u_ana || '/../' || u_mea || '/a.webp');
    v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a4_ruta_con_puntos', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('avatares', 'anunciante/' || an_a || '/logo-1.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a5_logo_propio', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('avatares', 'anunciante/' || an_b || '/logo-1.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a6_logo_ajeno', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('documentos', 'anunciante/' || an_a || '/RUT/r.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a7_documento_propio', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('documentos', 'anunciante/' || an_a || '/CEDULA_FRENTE/r.pdf');
    v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a8_documento_tipo_invalido', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('creativos', 'oferta/' || o1 || '/' || cr1 || '/1-a.jpg'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a9_creativo_borrador', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('creativos', 'oferta/' || o2 || '/' || cr2 || '/1-a.jpg'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a10_creativo_publicada_version_vieja', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('creativos', 'oferta/' || o2 || '/' || cr2v || '/1-a.jpg'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a11_creativo_version_nueva', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('creativos', 'oferta/' || o1 || '/' || cr2v || '/1-a.jpg'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('a12_creativo_de_otra_oferta', not v_ok);
  begin update storage.objects set name = name || '.bak' where bucket_id = 'avatares' and name like 'perfil/' || u_ana || '/%';
    get diagnostics v_n = row_count; v_ok := v_n = 0;
  exception when insufficient_privilege then v_ok := true; end;
  r := r || jsonb_build_object('a13_sin_update', v_ok);
  execute 'reset role';

  -- Anunciante B: no sube a ofertas ajenas ni lee el avatar de A.
  perform set_config('request.jwt.claims', c_anb, true);
  execute 'set local role authenticated';
  begin insert into storage.objects (bucket_id, name) values ('creativos', 'oferta/' || o1 || '/' || cr1 || '/2-b.jpg'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('b1_creativo_oferta_ajena', not v_ok);
  r := r || jsonb_build_object('b2_no_lee_avatar_ajeno',
    (select count(*) = 0 from storage.objects where bucket_id = 'avatares' and name like 'perfil/%'));
  r := r || jsonb_build_object('b3_lee_logos', (select count(*) = 1 from storage.objects where bucket_id = 'avatares'
                                                and name like 'anunciante/%'));
  r := r || jsonb_build_object('b4_no_lee_creativos_ajenos', (select count(*) = 0 from storage.objects where bucket_id = 'creativos'));
  r := r || jsonb_build_object('b5_no_lee_documentos_ajenos', (select count(*) = 0 from storage.objects where bucket_id = 'documentos'));
  execute 'reset role';

  -- ── (c) Medio A: documentos, evidencias, disputa; lee creativos tras la descarga ─────────────────────
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  begin insert into storage.objects (bucket_id, name) values ('documentos', 'medio/' || me_a || '/RUT/r.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c1_documento_medio', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('documentos', 'medio/' || me_a || '/cuenta_social/' || cu_a || '/v.webp');
    v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c2_captura_cuenta_propia', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('documentos', 'medio/' || me_a || '/cuenta_social/' || cu_b || '/v.webp');
    v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c3_captura_cuenta_ajena', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('documentos', 'medio/' || me_b || '/RUT/r.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c4_documento_otro_medio', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'asignacion/' || a1 || '/publicacion/1-x.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c5_evidencia_propia', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'asignacion/' || a2 || '/publicacion/1-x.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c6_evidencia_ajena', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'asignacion/' || a1 || '/otra/1-x.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c7_evidencia_carpeta_invalida', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'disputa/' || d1 || '/prueba.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c8_adjunto_disputa_parte', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'disputa/' || d1 || '/interno/nota.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c9_parte_sin_carpeta_interna', not v_ok);
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'muestras/1.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c10_muestras_solo_servidor', not v_ok);
  r := r || jsonb_build_object('c11_documentos_solo_propios',
    (select count(*) = 2 from storage.objects where bucket_id = 'documentos'));
  execute 'reset role';

  -- Owner: creativo de la oferta publicada para probar la lectura del medio.
  insert into storage.objects (bucket_id, name) values ('creativos', 'oferta/' || o2 || '/' || cr2v || '/9-owner.jpg');

  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('c12_medio_lee_creativo_descargado',
    (select count(*) >= 2 from storage.objects where bucket_id = 'creativos' and name like 'oferta/' || o2 || '/%')
    and not exists (select 1 from storage.objects where bucket_id = 'creativos' and name like 'oferta/' || o1 || '/%'));
  execute 'reset role';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('c13_medio_sin_descarga_no_lee', (select count(*) = 0 from storage.objects where bucket_id = 'creativos'));
  r := r || jsonb_build_object('c14_no_lee_evidencias_ajenas', (select count(*) = 0 from storage.objects where bucket_id = 'evidencias'));
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'asignacion/' || a2 || '/publicacion/1-x.webp'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('c15_evidencia_sin_descarga', not v_ok);
  execute 'reset role';

  -- Anunciante A ve la evidencia de su asignación y el adjunto de la disputa, no la nota interna.
  insert into storage.objects (bucket_id, name) values ('evidencias', 'disputa/' || d1 || '/interno/owner.pdf');
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('d1_anunciante_lee_evidencia',
    exists (select 1 from storage.objects where bucket_id = 'evidencias' and name = 'asignacion/' || a1 || '/publicacion/1-x.webp')
    and exists (select 1 from storage.objects where bucket_id = 'evidencias' and name = 'disputa/' || d1 || '/prueba.pdf')
    and not exists (select 1 from storage.objects where bucket_id = 'evidencias' and name like 'disputa/' || d1 || '/interno/%'));
  execute 'reset role';

  -- ── (e) Internos ───────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  begin insert into storage.objects (bucket_id, name) values ('evidencias', 'disputa/' || d1 || '/interno/admin.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('e1_admin_nota_interna', v_ok);
  r := r || jsonb_build_object('e2_admin_lee_disputa_completa',
    (select count(*) = 3 from storage.objects where bucket_id = 'evidencias' and name like 'disputa/' || d1 || '/%'));
  r := r || jsonb_build_object('e3_admin_sin_documentos', (select count(*) = 0 from storage.objects where bucket_id = 'documentos'));
  r := r || jsonb_build_object('e4_admin_lee_avatares', (select count(*) >= 2 from storage.objects where bucket_id = 'avatares'));
  begin insert into storage.objects (bucket_id, name) values ('soportes', 'liquidacion/' || l1 || '/s.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('e5_admin_sin_registrar_pago', not v_ok);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('e6_aal1_sin_acceso', (select count(*) = 0 from storage.objects));
  execute 'reset role';
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  begin insert into storage.objects (bucket_id, name) values ('soportes', 'liquidacion/' || l1 || '/s.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('e7_finanzas_soporte_liquidacion', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('soportes', 'factura/' || f1 || '/f.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('e8_finanzas_factura', v_ok);
  begin insert into storage.objects (bucket_id, name) values ('soportes', 'dispersion/' || gen_random_uuid() || '/d.csv'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('e9_dispersion_solo_servidor', not v_ok);
  r := r || jsonb_build_object('e10_finanzas_no_lee_soportes', (select count(*) = 0 from storage.objects where bucket_id = 'soportes'));
  execute 'reset role';

  -- ── (f) Dueños de soportes y borrado ───────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('f1_medio_lee_su_liquidacion',
    (select count(*) = 1 from storage.objects where bucket_id = 'soportes' and name like 'liquidacion/%'));
  begin insert into storage.objects (bucket_id, name) values ('soportes', 'liquidacion/' || l1 || '/m.pdf'); v_ok := true;
  exception when insufficient_privilege then v_ok := false; end;
  r := r || jsonb_build_object('f2_medio_no_sube_soporte', not v_ok);
  delete from storage.objects where bucket_id = 'avatares' and name like 'perfil/' || u_ana || '/%';
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('f3_no_borra_avatar_ajeno', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('f4_anunciante_lee_su_factura',
    (select count(*) = 1 from storage.objects where bucket_id = 'soportes' and name like 'factura/' || f1 || '/%'));
  delete from storage.objects where bucket_id = 'avatares' and name like 'perfil/' || u_ana || '/%';
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('f5_borra_su_avatar', v_n = 1);
  delete from storage.objects where bucket_id = 'documentos';
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('f6_no_borra_documentos', v_n = 0);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_anb, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('f7_otro_anunciante_sin_factura', (select count(*) = 0 from storage.objects where bucket_id = 'soportes'));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (g) perfiles.avatar_path endurecido ───────────────────────────────────────────────────────────
  begin
    update public.perfiles set avatar_path = 'perfil/' || u_ana || '/../x.webp' where id = u_ana;
    r := r || jsonb_build_object('g1_avatar_path_sin_puntos', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('g1_avatar_path_sin_puntos', true);
  end;
  begin
    update public.perfiles set avatar_path = 'perfil/' || u_ana || '/sub/x.webp' where id = u_ana;
    r := r || jsonb_build_object('g2_avatar_path_sin_subcarpetas', 'NO FALLÓ');
  exception when check_violation then
    r := r || jsonb_build_object('g2_avatar_path_sin_subcarpetas', true);
  end;
  update public.perfiles set avatar_path = 'perfil/' || u_ana || '/' || gen_random_uuid() || '.webp' where id = u_ana;
  r := r || jsonb_build_object('g3_avatar_path_valido', (select avatar_path is not null from public.perfiles where id = u_ana));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
