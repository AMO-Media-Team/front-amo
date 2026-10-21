-- Suite RLS integral (docs/modelo-datos.md §2, §3, §5.1–§5.4, §8, §11): estructura de seguridad (RLS, restrictivas,
-- grants de tabla, de columna y de EXECUTE), matriz de lectura y escritura por rol (SUPERADMIN aal2/aal1, ADMIN
-- aal1/aal2, OPERACIONES, FINANZAS, anunciante A vs B, medio A vs B), cuentas sin acceso (suspendida, sesión
-- revocada, expirada o inactiva), tablas `_privado`, Storage por bucket y carpeta, notificaciones propias, RPC de
-- analítica por rol, IDOR en los `*_srv`, escalada de roles, transiciones inválidas, procedencia falsificada,
-- limitador de login (spraying) y borrado definitivo de un usuario con actividad (§3.8).
-- Se ejecuta como owner (MCP execute_sql o psql) en una transacción que SIEMPRE se revierte: los datos se crean con
-- `amo.modo_carga` y cada consulta "como usuario" usa `set local role authenticated` con los claims del JWT.
-- Limitación conocida: en MCP `session_user` es `postgres`, así que las guardas que exceptúan al owner por
-- session_user (anti-escalada de rol_permisos) se prueban por PostgREST en scripts/db/probar-guardas-postgrest.ts.
-- Cada prueba deja `true` si pasa o lo observado si falla.
begin;

-- Resultado de una prueba: true, o lo observado. EXECUTE para los roles de la API porque se evalúa con ellos activos.
create function pg_temp.ok(p_ok boolean, p_visto text) returns jsonb language sql immutable as $$
  select case when coalesce(p_ok, false) then 'true'::jsonb else to_jsonb(coalesce(p_visto, 'null')) end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated, service_role;

-- Actuar como un usuario con sesión: claims del JWT + rol authenticated (la caché de contexto confiable se vacía).
create function pg_temp.como(p_uid uuid, p_sid uuid, p_aal text default 'aal1', p_headers text default '') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal, 'session_id', p_sid)::text, true);
  perform set_config('request.headers', p_headers, true);
  perform set_config('amo.ctx_confiable', '', true);
  execute 'set local role authenticated';
end $$;

do $rls$
declare
  r jsonb := '{}';
  v_n bigint;
  v_m bigint;
  v_e text;
  v_t text;
  v_b boolean;
  v_num numeric;
  -- Usuarios
  u_sup constant uuid := '00000000-0000-4000-a000-00000000b001';
  u_adm constant uuid := '00000000-0000-4000-a000-00000000b002';
  u_ops constant uuid := '00000000-0000-4000-a000-00000000b003';
  u_fin constant uuid := '00000000-0000-4000-a000-00000000b004';
  u_ana constant uuid := '00000000-0000-4000-a000-00000000b005';
  u_anb constant uuid := '00000000-0000-4000-a000-00000000b006';
  u_mea constant uuid := '00000000-0000-4000-a000-00000000b007';
  u_meb constant uuid := '00000000-0000-4000-a000-00000000b008';
  u_sus constant uuid := '00000000-0000-4000-a000-00000000b009';   -- ANUNCIANTE de A, SUSPENDIDO
  u_del constant uuid := '00000000-0000-4000-a000-00000000b00a';   -- ADMIN con actividad, para el borrado definitivo
  v_usuarios constant uuid[] := array[u_sup, u_adm, u_ops, u_fin, u_ana, u_anb, u_mea, u_meb, u_sus, u_del];
  -- Sesiones
  s_sup constant uuid := '00000000-0000-4000-b000-00000000b001';
  s_sup1 constant uuid := '00000000-0000-4000-b000-00000000b011';  -- SUPERADMIN a aal1
  s_adm1 constant uuid := '00000000-0000-4000-b000-00000000b002';  -- ADMIN a aal1
  s_adm constant uuid := '00000000-0000-4000-b000-00000000b012';   -- ADMIN a aal2
  s_rev constant uuid := '00000000-0000-4000-b000-00000000b022';   -- revocada: no existe en auth.sessions
  s_exp constant uuid := '00000000-0000-4000-b000-00000000b032';   -- expirada (not_after en el pasado)
  s_ina constant uuid := '00000000-0000-4000-b000-00000000b042';   -- inactiva (2 h sin actividad; ADMIN = 30 min)
  s_ops constant uuid := '00000000-0000-4000-b000-00000000b003';
  s_fin constant uuid := '00000000-0000-4000-b000-00000000b004';
  s_ana constant uuid := '00000000-0000-4000-b000-00000000b005';
  s_anb constant uuid := '00000000-0000-4000-b000-00000000b006';
  s_mea constant uuid := '00000000-0000-4000-b000-00000000b007';
  s_meb constant uuid := '00000000-0000-4000-b000-00000000b008';
  s_sus constant uuid := '00000000-0000-4000-b000-00000000b009';
  -- Organizaciones y negocio (A = anunciante A + medio A en Bogotá; B = anunciante B + medio B en Medellín)
  an_a constant uuid := '00000000-0000-4000-c000-00000000b001';
  an_b constant uuid := '00000000-0000-4000-c000-00000000b002';
  me_a constant uuid := '00000000-0000-4000-d000-00000000b001';
  me_b constant uuid := '00000000-0000-4000-d000-00000000b002';
  cu_a constant uuid := '00000000-0000-4000-e000-00000000b001';
  cu_b constant uuid := '00000000-0000-4000-e000-00000000b002';
  c_a constant uuid := '00000000-0000-4000-f000-00000000b001';
  c_b constant uuid := '00000000-0000-4000-f000-00000000b002';
  o_a constant uuid := '00000000-0000-4000-f000-00000000b011';
  o_b constant uuid := '00000000-0000-4000-f000-00000000b012';
  cr_a constant uuid := '00000000-0000-4000-f000-00000000b021';
  cr_b constant uuid := '00000000-0000-4000-f000-00000000b022';
  x_a constant uuid := '00000000-0000-4000-f000-00000000b031';
  x_b constant uuid := '00000000-0000-4000-f000-00000000b032';
  l_a constant uuid := '00000000-0000-4000-f000-00000000b041';
  l_b constant uuid := '00000000-0000-4000-f000-00000000b042';
  f_a constant uuid := '00000000-0000-4000-f000-00000000b051';
  f_b constant uuid := '00000000-0000-4000-f000-00000000b052';
  d_a constant uuid := '00000000-0000-4000-f000-00000000b061';
  dm_a constant uuid := '00000000-0000-4000-f000-00000000b071';
  dm_b constant uuid := '00000000-0000-4000-f000-00000000b072';
  da_a constant uuid := '00000000-0000-4000-f000-00000000b081';
  da_b constant uuid := '00000000-0000-4000-f000-00000000b082';
  v_campanas constant uuid[] := array[c_a, c_b];
  v_ofertas constant uuid[] := array[o_a, o_b];
  v_asignaciones constant uuid[] := array[x_a, x_b];
  n_ana bigint; n_anb bigint;
  v_desde date := private.hoy() - 7;
  v_hasta date := private.hoy();
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t where t.formato_id = (select id from public.formatos
                    where plataforma = 'INSTAGRAM' and clave = 'POST_FEED')
                    and t.franja_id = (select id from public.franjas where clave = 'F1') order by t.vigente_desde desc limit 1);
  h_falsos constant text := jsonb_build_object('x-amo-srv', 'secreto-inventado', 'x-amo-actor', '00000000-0000-4000-a000-00000000b001',
                                               'x-amo-ip', '203.0.113.9', 'x-amo-ua', 'Falso/1.0')::text;
begin
  -- ═══ Preparación (owner, modo_carga) ═══════════════════════════════════════════════════════════════════════
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls.' || substr(u::text, 34) || '@amo.test',
         now(), now(), now()
  from unnest(v_usuarios) u;
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'RLS A S.A.S.', 'RLS A', '900777101', '1', v_sector, '11001', 'VERIFICADO', now()),
         (an_b, 'RLS B S.A.S.', 'RLS B', '900777102', '2', v_sector, '05001', 'VERIFICADO', now());
  insert into public.anunciantes_privado (anunciante_id, contacto_email) values (an_a, 'contacto.a@amo.test'), (an_b, 'contacto.b@amo.test');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'RLS Medio A', 'CREADOR', '11001', 'VERIFICADO', 1, now()),
         (me_b, 'RLS Medio B', 'CREADOR', '05001', 'VERIFICADO', 1, now());
  insert into public.medios_privado (medio_id, titular_nombre, numero_documento_cifrado, numero_documento_resumen, metodo_pago,
                                     datos_pago_cifrados, datos_pago_resumen)
  values (me_a, 'Titular A', 'v1:YQ==:Yg==:Yw==', '••••1111', 'BANCARIO', 'v1:YQ==:Yg==:Yw==', 'Cuenta ••••2222'),
         (me_b, 'Titular B', 'v1:ZA==:ZQ==:Zg==', '••••3333', 'BANCARIO', 'v1:ZA==:ZQ==:Zg==', 'Cuenta ••••4444');
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'rls_medio_a', 'https://instagram.com/rls_medio_a', 45000, fr1, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'rls_medio_b', 'https://instagram.com/rls_medio_b', 45000, fr1, true, 'MANUAL', now());
  insert into public.documentos_medio (id, medio_id, tipo, archivo_path)
  values (dm_a, me_a, 'RUT', 'medio/' || me_a || '/RUT/r.pdf'), (dm_b, me_b, 'RUT', 'medio/' || me_b || '/RUT/r.pdf');
  insert into public.documentos_anunciante (id, anunciante_id, tipo, archivo_path)
  values (da_a, an_a, 'RUT', 'anunciante/' || an_a || '/RUT/r.pdf'), (da_b, an_b, 'RUT', 'anunciante/' || an_b || '/RUT/r.pdf');

  update public.perfiles p set rol_id = (select id from public.roles where clave = x.rol), estado = x.estado::public.perfil_estado,
         debe_cambiar_password = false, anunciante_id = x.anunciante, medio_id = x.medio, nombre = 'RLS ' || x.rol
  from (values (u_sup, 'SUPERADMIN', 'ACTIVO', null::uuid, null::uuid), (u_adm, 'ADMIN', 'ACTIVO', null, null),
               (u_ops, 'OPERACIONES', 'ACTIVO', null, null), (u_fin, 'FINANZAS', 'ACTIVO', null, null),
               (u_ana, 'ANUNCIANTE', 'ACTIVO', an_a, null), (u_anb, 'ANUNCIANTE', 'ACTIVO', an_b, null),
               (u_mea, 'MEDIO', 'ACTIVO', null, me_a), (u_meb, 'MEDIO', 'ACTIVO', null, me_b),
               (u_sus, 'ANUNCIANTE', 'SUSPENDIDO', an_a, null), (u_del, 'ADMIN', 'ACTIVO', null, null))
       as x (id, rol, estado, anunciante, medio)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal, not_after) values
    (s_sup, u_sup, now(), now(), 'aal2', null), (s_sup1, u_sup, now(), now(), 'aal1', null),
    (s_adm1, u_adm, now(), now(), 'aal1', null), (s_adm, u_adm, now(), now(), 'aal2', null),
    (s_exp, u_adm, now() - interval '1 day', now() - interval '1 day', 'aal2', now() - interval '1 minute'),
    (s_ina, u_adm, now() - interval '2 hours', now() - interval '2 hours', 'aal2', null),
    (s_ops, u_ops, now(), now(), 'aal2', null), (s_fin, u_fin, now(), now(), 'aal2', null),
    (s_ana, u_ana, now(), now(), 'aal1', null), (s_anb, u_anb, now(), now(), 'aal1', null),
    (s_mea, u_mea, now(), now(), 'aal1', null), (s_meb, u_meb, now(), now(), 'aal1', null),
    (s_sus, u_sus, now(), now(), 'aal1', null);

  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total,
                               presupuesto_comprometido, estado, activada_at)
  values (c_a, an_a, 'Campaña RLS A', 'Marca A', private.hoy() - 10, private.hoy() + 30, 10000000, 250000, 'ACTIVA', now()),
         (c_b, an_b, 'Campaña RLS B', 'Marca B', private.hoy() - 10, private.hoy() + 30, 10000000, 300000, 'ACTIVA', now());
  -- Segmentadas por departamento: el medio de una ciudad no es elegible para la oferta de la otra.
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              presupuesto_comprometido, tope_porcentaje_por_medio, cortes_requeridos, departamentos_objetivo,
                              ventana_inicio, ventana_fin, fecha_limite_aceptacion, estado, publicada_at, cupos_totales, cupos_ocupados)
  values (o_a, c_a, an_a, 'Oferta RLS A', f_post, 'INSTAGRAM', 5000000, 250000, 1, '{D7}', '{11}',
          now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now(), 5, 1),
         (o_b, c_b, an_b, 'Oferta RLS B', f_post, 'INSTAGRAM', 5000000, 300000, 1, '{D7}', '{05}',
          now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', 'PUBLICADA', now(), 5, 1);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales, cupos_ocupados) values (o_a, fr1, 5, 1), (o_b, fr1, 5, 1);
  insert into public.creativos (id, oferta_id, tipo, version, vigente) values (cr_a, o_a, 'IMAGEN', 1, true), (cr_b, o_b, 'IMAGEN', 1, true);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
                                   aceptada_at, fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id)
  values (x_a, o_a, c_a, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'ACEPTADA', now() - interval '1 hour', now() + interval '10 days', 1,
          250000, v_tarifa, fr1),
         (x_b, o_b, c_b, an_b, me_b, cu_b, 'INSTAGRAM', 1, 'ACEPTADA', now() - interval '1 hour', now() + interval '10 days', 1,
          300000, v_tarifa, fr1);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen, monto_comision)
  values (x_a, me_a, 250000, 0.2, 'GLOBAL', 50000), (x_b, me_b, 300000, 0.2, 'GLOBAL', 60000);
  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
                                    monto_medio, monto_retenciones, monto_neto, estado, requiere_documento_soporte)
  values (l_a, me_a, private.hoy() - 15, private.hoy() - 1, 0, 0, 0, 0, 0, 0, 'BORRADOR', true),
         (l_b, me_b, private.hoy() - 15, private.hoy() - 1, 0, 0, 0, 0, 0, 0, 'BORRADOR', true);
  insert into public.facturas (id, anunciante_id, campana_id, subtotal, iva, pagado, estado)
  values (f_a, an_a, c_a, 100000, 19000, 0, 'BORRADOR'), (f_b, an_b, c_b, 100000, 19000, 0, 'BORRADOR');
  insert into public.disputas (id, asignacion_id, abierta_por, parte, motivo, descripcion, estado, estado_asignacion_origen)
  values (d_a, x_a, u_del, 'MEDIO', 'CONTENIDO', 'Disputa de la suite RLS', 'ABIERTA', 'ACEPTADA');
  insert into public.disputa_mensajes (disputa_id, autor_id, mensaje, interno)
  values (d_a, u_del, 'Nota interna del equipo', true), (d_a, u_mea, 'Mensaje de la parte', false);
  update public.documentos_medio set validado_por = u_del where id = dm_a;
  update public.campanas set creada_por = u_del where id = c_a;
  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje) values (u_ana, 'rls.prueba', 'Para A', 'm') returning id into n_ana;
  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje) values (u_anb, 'rls.prueba', 'Para B', 'm') returning id into n_anb;
  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje) values (u_mea, 'rls.prueba', 'Para medio A', 'm'),
                                                                                (u_sus, 'rls.prueba', 'Para suspendido', 'm');
  insert into storage.objects (bucket_id, name) values
    ('documentos', 'anunciante/' || an_a || '/RUT/r.pdf'), ('documentos', 'anunciante/' || an_b || '/RUT/r.pdf'),
    ('documentos', 'medio/' || me_a || '/RUT/r.pdf'), ('documentos', 'medio/' || me_b || '/RUT/r.pdf'),
    ('avatares', 'perfil/' || u_ana || '/a.webp'), ('avatares', 'perfil/' || u_anb || '/a.webp'),
    ('soportes', 'liquidacion/' || l_a || '/s.pdf'), ('soportes', 'liquidacion/' || l_b || '/s.pdf'),
    ('evidencias', 'asignacion/' || x_a || '/publicacion/1-e.webp'), ('evidencias', 'asignacion/' || x_b || '/publicacion/1-e.webp'),
    ('creativos', 'oferta/' || o_a || '/' || cr_a || '/1-p.png'), ('creativos', 'oferta/' || o_b || '/' || cr_b || '/1-p.png');
  perform set_config('amo.modo_carga', '', true);
  perform public.registrar_acceso_srv(u_ana, 'rls.ana@amo.test', 'LOGIN_EXITOSO', s_ana, 'aal1', '198.51.100.20'::inet, 'CO', null,
                                      'Bogotá', null, null, 'Navegador/1', 'Chrome', 'macOS', 'ESCRITORIO');

  -- ═══ (g) Estructura: RLS, restrictivas, grants de tabla y de EXECUTE ════════════════════════════════════════
  select count(*) into v_n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not c.relrowsecurity;
  r := r || jsonb_build_object('g01_rls_en_toda_tabla_public', pg_temp.ok(v_n = 0, v_n || ' sin RLS'));
  select string_agg(c.relname, ',') into v_t from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                       and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL' and p.qual like '%acceso_valido()%')
     and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
            and p.permissive = 'RESTRICTIVE' and p.cmd <> 'ALL' and coalesce(p.qual, p.with_check) like '%acceso_valido()%') < 4;
  r := r || jsonb_build_object('g02_restrictiva_acceso_valido_en_toda_tabla', pg_temp.ok(v_t is null, v_t));
  select string_agg(distinct c.relname, ',' order by c.relname) into v_t from pg_class c
   join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname and p.permissive = 'RESTRICTIVE' and p.cmd = 'SELECT'
   where c.relnamespace = 'public'::regnamespace and p.qual like '%acceso_valido()%' and p.qual like '% OR %';
  r := r || jsonb_build_object('g03_excepciones_solo_las_de_2_3',
    pg_temp.ok(v_t = 'aceptaciones_terminos,perfiles,permisos,rol_permisos,roles,terminos_versiones', v_t));
  select count(*) into v_n from pg_policies where schemaname in ('public', 'storage', 'realtime')
     and not roles <@ array['authenticated']::name[];
  r := r || jsonb_build_object('g04_politicas_solo_authenticated', pg_temp.ok(v_n = 0, v_n::text));
  select count(*) into v_n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'select, insert, update, delete');
  r := r || jsonb_build_object('g05_anon_sin_tablas', pg_temp.ok(v_n = 0, v_n::text));
  select count(*) into v_n from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
     and has_function_privilege('anon', p.oid, 'execute');
  r := r || jsonb_build_object('g06_anon_sin_execute', pg_temp.ok(v_n = 0, v_n::text));
  select string_agg(p.proname, ',') into v_t from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname like '%\_srv' and (has_function_privilege('authenticated', p.oid, 'execute')
                                      or not has_function_privilege('service_role', p.oid, 'execute') or not p.prosecdef);
  r := r || jsonb_build_object('g07_srv_definer_solo_service_role', pg_temp.ok(v_t is null, v_t));
  select string_agg(p.proname, ',') into v_t from pg_proc p where p.pronamespace = 'private'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute') and p.proname <> all (private.lista_blanca_authenticated());
  r := r || jsonb_build_object('g08_private_execute_en_lista_blanca', pg_temp.ok(v_t is null, v_t));
  select string_agg(p.proname, ',') into v_t from pg_proc p
   where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false);
  r := r || jsonb_build_object('g09_definer_con_search_path_vacio', pg_temp.ok(v_t is null, v_t));
  select string_agg(c.relname, ',') into v_t from pg_class c where c.relnamespace = 'private'::regnamespace and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select, insert, update, delete')
       or has_table_privilege('authenticated', c.oid, 'select, insert, update, delete')
       or has_table_privilege('service_role', c.oid, 'select, insert, update, delete'));
  r := r || jsonb_build_object('g10_tablas_private_sin_grants', pg_temp.ok(v_t is null, v_t));
  select has_table_privilege('service_role', 'public.bitacora', 'insert, update, delete')
      or has_table_privilege('service_role', 'public.accesos', 'insert, update, delete') into v_b;
  r := r || jsonb_build_object('g11_bitacora_y_accesos_sin_escritura_service_role', pg_temp.ok(not v_b, 'con escritura'));
  select count(*) into v_n from pg_policies where schemaname = 'storage' and tablename = 'objects' and permissive = 'RESTRICTIVE'
     and (qual like '%acceso_valido()%' or with_check like '%..%');
  r := r || jsonb_build_object('g12_storage_restrictivas_sesion_y_ruta',
    pg_temp.ok(v_n = 2 and (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), v_n::text));
  select count(*) into v_n from storage.buckets where id in ('avatares', 'documentos', 'creativos', 'evidencias', 'soportes')
     and not public and file_size_limit is not null and allowed_mime_types is not null;
  r := r || jsonb_build_object('g13_buckets_privados_con_limites', pg_temp.ok(v_n = 5, v_n::text));
  select qual into v_t from pg_policies where schemaname = 'realtime' and tablename = 'messages';
  r := r || jsonb_build_object('g14_realtime_solo_topico_propio_y_sesion',
    pg_temp.ok(v_t like '%''usuario:''%auth.uid()%' and v_t like '%acceso_valido()%', v_t));
  select string_agg(t.entidad || '.' || t.columna_at, ',') into v_t from private.transiciones_estado t
   where t.columna_at is not null and not exists (select 1 from information_schema.columns c where c.table_schema = 'public'
                                                    and c.table_name = t.entidad and c.column_name = t.columna_at);
  r := r || jsonb_build_object('g15_columna_at_existen', pg_temp.ok(v_t is null, v_t));
  select string_agg(distinct t.entidad || ':' || x.estado, ',') into v_t
  from private.transiciones_estado t cross join lateral (values (t.desde), (t.hacia)) x (estado)
  join information_schema.columns c on c.table_schema = 'public' and c.table_name = t.entidad
   and c.column_name = private.columna_estado(t.entidad)
  where x.estado <> 'NUEVO'
    and not exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid
                    where ty.typname = c.udt_name and e.enumlabel = x.estado);
  r := r || jsonb_build_object('g16_estados_de_transicion_en_su_enum', pg_temp.ok(v_t is null, v_t));
  select string_agg(k.conrelid::regclass::text || '.' || k.conname, ',') into v_t from pg_constraint k
   where k.contype = 'f' and k.connamespace = 'public'::regnamespace
     and not exists (select 1 from pg_index i where i.indrelid = k.conrelid
                       and (i.indkey::int2[])[0:cardinality(k.conkey) - 1] @> k.conkey::int2[]
                       and (i.indkey::int2[])[0:cardinality(k.conkey) - 1] <@ k.conkey::int2[]);
  r := r || jsonb_build_object('g17_toda_fk_con_indice', pg_temp.ok(v_t is null, v_t));

  -- ═══ (c) Grants de columna ══════════════════════════════════════════════════════════════════════════════════
  r := r || jsonb_build_object('c01_medios_privado_sin_cifrados',
    pg_temp.ok(not has_column_privilege('authenticated', 'public.medios_privado', 'numero_documento_cifrado', 'select')
           and not has_column_privilege('authenticated', 'public.medios_privado', 'numero_documento_hash', 'select')
           and not has_column_privilege('authenticated', 'public.medios_privado', 'datos_pago_cifrados', 'select'), 'legibles'));
  r := r || jsonb_build_object('c02_perfiles_privado_sin_cifrados_ni_notas',
    pg_temp.ok(not has_column_privilege('authenticated', 'public.perfiles_privado', 'numero_documento_cifrado', 'select')
           and not has_column_privilege('authenticated', 'public.perfiles_privado', 'notas_internas', 'select'), 'legibles'));
  select string_agg(column_name, ',' order by column_name) into v_t from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'perfiles' and grantee = 'authenticated' and privilege_type = 'UPDATE';
  r := r || jsonb_build_object('c03_perfiles_update_solo_datos_propios', pg_temp.ok(v_t = 'avatar_path,celular,nombre,preferencias', v_t));
  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')
     and table_name in ('asignaciones', 'asignacion_montos', 'bitacora', 'accesos', 'descargas_contenido', 'dispersiones',
                        'pagos_anunciante', 'publicaciones', 'disputas', 'oferta_vistas');
  r := r || jsonb_build_object('c04_sin_escritura_en_tablas_de_procedimientos', pg_temp.ok(v_n = 0, v_n::text));
  select count(*) into v_n from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')
     and (table_name, column_name) in (('campanas', 'presupuesto_comprometido'), ('campanas', 'estado'), ('ofertas', 'cupos_ocupados'),
                                       ('ofertas', 'presupuesto_comprometido'), ('ofertas', 'estado'), ('oferta_cupos', 'cupos_ocupados'),
                                       ('medios', 'estado'), ('medios', 'nivel_verificacion'), ('anunciantes', 'estado_verificacion'),
                                       ('liquidaciones', 'estado'), ('facturas', 'estado'), ('metricas', 'estado_validacion'));
  r := r || jsonb_build_object('c05_contadores_y_estados_no_escribibles', pg_temp.ok(v_n = 0, v_n::text));
  select string_agg(column_name, ',' order by column_name) into v_t from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'notificaciones' and grantee = 'authenticated' and privilege_type <> 'SELECT';
  r := r || jsonb_build_object('c06_notificaciones_solo_marcar_leida',
    pg_temp.ok(v_t = 'leida,leida_at' and not has_table_privilege('authenticated', 'public.notificaciones', 'insert, delete'), v_t));
  perform pg_temp.como(u_mea, s_mea);
  begin
    perform numero_documento_cifrado from public.medios_privado;
    v_e := 'NO FALLÓ';
  exception when insufficient_privilege then v_e := 'ok';
  end;
  r := r || jsonb_build_object('c07_medio_no_selecciona_columna_cifrada', pg_temp.ok(v_e = 'ok', v_e));
  begin
    update public.perfiles set rol_id = (select id from public.roles where clave = 'SUPERADMIN') where id = u_mea;
    v_e := 'NO FALLÓ';
  exception when insufficient_privilege then v_e := 'ok';
  end;
  r := r || jsonb_build_object('c08_nadie_escribe_su_rol_por_la_api', pg_temp.ok(v_e = 'ok', v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ═══ (sa) SUPERADMIN ══════════════════════════════════════════════════════════════════════════════════════════
  perform pg_temp.como(u_sup, s_sup, 'aal2');
  select count(*) into v_n from public.perfiles where id = any (v_usuarios);
  r := r || jsonb_build_object('sa01_aal2_ve_todos_los_perfiles', pg_temp.ok(v_n = 10, v_n::text));
  select count(*) into v_n from public.campanas where id = any (v_campanas);
  select count(*) into v_m from public.asignacion_montos where asignacion_id = any (v_asignaciones);
  r := r || jsonb_build_object('sa02_aal2_ve_campanas_y_montos_de_todos', pg_temp.ok(v_n = 2 and v_m = 2, v_n || '/' || v_m));
  select count(*) into v_n from public.medios_privado where medio_id in (me_a, me_b);
  select count(*) into v_m from public.anunciantes_privado where anunciante_id in (an_a, an_b);
  r := r || jsonb_build_object('sa03_privado_ni_siquiera_para_superadmin', pg_temp.ok(v_n = 0 and v_m = 0, v_n || '/' || v_m));
  select count(*) into v_n from public.bitacora;
  r := r || jsonb_build_object('sa04_aal2_lee_bitacora', pg_temp.ok(v_n > 0, v_n::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_sup, s_sup1, 'aal1');
  select count(*) into v_n from public.perfiles where id = any (v_usuarios);
  select count(*) into v_m from public.campanas where id = any (v_campanas);
  r := r || jsonb_build_object('sa05_aal1_solo_su_perfil', pg_temp.ok(v_n = 1 and v_m = 0, v_n || '/' || v_m));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ═══ (ad) ADMIN aal1 vs aal2 ══════════════════════════════════════════════════════════════════════════════════
  perform pg_temp.como(u_adm, s_adm1, 'aal1');
  select count(*) into v_n from public.perfiles where id = any (v_usuarios);
  r := r || jsonb_build_object('ad01_aal1_solo_su_perfil', pg_temp.ok(v_n = 1, v_n::text));
  select count(*) into v_n from public.roles;
  select count(*) into v_m from public.permisos;
  r := r || jsonb_build_object('ad02_aal1_su_rol_y_sus_permisos',
    pg_temp.ok(v_n = 1 and v_m = (select count(*) from public.rol_permisos rp join public.roles x on x.id = rp.rol_id
                                   where x.clave = 'ADMIN'), v_n || '/' || v_m));
  select count(*) into v_n from public.campanas where id = any (v_campanas);
  select count(*) into v_m from public.configuracion;
  r := r || jsonb_build_object('ad03_aal1_sin_datos_de_negocio_ni_configuracion', pg_temp.ok(v_n = 0 and v_m = 0, v_n || '/' || v_m));
  begin
    perform 1 from public.kpis_admin(v_desde, v_hasta);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('ad04_aal1_sin_analitica', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_adm, s_adm, 'aal2');
  select (select count(*) from public.campanas where id = any (v_campanas)) + (select count(*) from public.asignaciones where id = any (v_asignaciones))
       + (select count(*) from public.medios where id in (me_a, me_b)) + (select count(*) from public.liquidaciones where id in (l_a, l_b))
       + (select count(*) from public.documentos_medio where id in (dm_a, dm_b)) into v_n;
  r := r || jsonb_build_object('ad05_aal2_ve_negocio_de_todos', pg_temp.ok(v_n = 10, v_n::text));
  select count(*) into v_n from public.medios_privado where medio_id in (me_a, me_b);
  r := r || jsonb_build_object('ad06_aal2_no_lee_privado', pg_temp.ok(v_n = 0, v_n::text));
  select count(*) into v_n from public.kpis_admin(v_desde, v_hasta);
  r := r || jsonb_build_object('ad07_aal2_kpis_admin', pg_temp.ok(v_n > 0, v_n::text));
  select count(*) into v_n from public.actividad_heatmap(v_desde, v_hasta, 'bitacora');
  r := r || jsonb_build_object('ad08_aal2_heatmap_de_bitacora', pg_temp.ok(v_n = 168, v_n::text));
  select count(*) into v_n from public.reporte_usuarios_accesos(v_desde, v_hasta) where usuario_id = u_ana;
  r := r || jsonb_build_object('ad09_aal2_reporte_de_accesos', pg_temp.ok(v_n = 1, v_n::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- Con un JWT válido pero sin el secreto del servidor (cabeceras falsificadas): no escribe configuración.
  perform pg_temp.como(u_adm, s_adm, 'aal2', h_falsos);
  update public.configuracion set valor = valor where clave = 'precios.redondeo';
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('ad10_sin_contexto_confiable_no_escribe_configuracion', pg_temp.ok(v_n = 0, v_n::text));
  update public.perfiles set nombre = 'RLS ADMIN editado' where id = u_adm;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_n from public.bitacora where entidad = 'perfiles' and entidad_id = u_adm::text and accion = 'UPDATE'
     and origen = 'API_DIRECTA' and ip is null and user_agent is null;
  r := r || jsonb_build_object('ad11_cabeceras_falsas_quedan_como_api_directa', pg_temp.ok(v_n = 1, v_n::text));

  -- ═══ (op) OPERACIONES y (fi) FINANZAS ═════════════════════════════════════════════════════════════════════════
  perform pg_temp.como(u_ops, s_ops, 'aal2');
  select (select count(*) from public.campanas where id = any (v_campanas)) + (select count(*) from public.medios where id in (me_a, me_b))
       + (select count(*) from public.asignaciones where id = any (v_asignaciones)) into v_n;
  r := r || jsonb_build_object('op01_ve_operacion', pg_temp.ok(v_n = 6, v_n::text));
  select (select count(*) from public.liquidaciones where id in (l_a, l_b)) + (select count(*) from public.facturas where id in (f_a, f_b))
       + (select count(*) from public.bitacora) into v_n;
  r := r || jsonb_build_object('op02_no_ve_finanzas_ni_bitacora', pg_temp.ok(v_n = 0, v_n::text));
  begin
    perform 1 from public.reporte_finanzas(v_desde, v_hasta, 'mes');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('op03_sin_reportes_financieros', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform 1 from public.actividad_heatmap(v_desde, v_hasta, 'bitacora');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('op04_sin_heatmap_de_bitacora', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_fin, s_fin, 'aal2');
  select (select count(*) from public.liquidaciones where id in (l_a, l_b)) + (select count(*) from public.facturas where id in (f_a, f_b))
       + (select count(*) from public.asignacion_montos where asignacion_id = any (v_asignaciones)) into v_n;
  r := r || jsonb_build_object('fi01_ve_finanzas', pg_temp.ok(v_n = 6, v_n::text));
  select (select count(*) from public.documentos_medio where id in (dm_a, dm_b)) + (select count(*) from public.perfiles where id = any (v_usuarios))
       + (select count(*) from public.bitacora) into v_n;
  r := r || jsonb_build_object('fi02_no_ve_documentos_ni_usuarios_ni_bitacora', pg_temp.ok(v_n = 1, v_n::text));
  select count(*) into v_n from public.reporte_finanzas(v_desde, v_hasta, 'mes');
  r := r || jsonb_build_object('fi03_reporte_financiero', pg_temp.ok(v_n >= 0, v_n::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ═══ (an) Anunciante A vs B (IDOR) ═══════════════════════════════════════════════════════════════════════════
  perform pg_temp.como(u_ana, s_ana);
  select string_agg(id::text, ',') into v_t from public.campanas where id = any (v_campanas);
  r := r || jsonb_build_object('an01_solo_su_campana', pg_temp.ok(v_t = c_a::text, v_t));
  select (select count(*) from public.ofertas where id = any (v_ofertas)) * 100 + (select count(*) from public.oferta_cupos where oferta_id = any (v_ofertas)) * 10
       + (select count(*) from public.creativos where id in (cr_a, cr_b)) into v_n;
  r := r || jsonb_build_object('an02_solo_su_oferta_cupos_y_creativo', pg_temp.ok(v_n = 111, v_n::text));
  select string_agg(id::text, ',') into v_t from public.asignaciones where id = any (v_asignaciones);
  select count(*) into v_n from public.asignacion_montos where asignacion_id = any (v_asignaciones);
  r := r || jsonb_build_object('an03_solo_su_asignacion_sin_montos_internos', pg_temp.ok(v_t = x_a::text and v_n = 0, v_t || '/' || v_n));
  select count(*) into v_n from public.anunciantes where id in (an_a, an_b);
  select count(*) into v_m from public.anunciantes_privado where anunciante_id in (an_a, an_b);
  r := r || jsonb_build_object('an04_solo_su_empresa_y_su_privado', pg_temp.ok(v_n = 1 and v_m = 1, v_n || '/' || v_m));
  select (select count(*) from public.medios where id in (me_a, me_b)) + (select count(*) from public.medios_privado where medio_id in (me_a, me_b))
       + (select count(*) from public.cuentas_sociales where id in (cu_a, cu_b)) + (select count(*) from public.liquidaciones where id in (l_a, l_b))
       + (select count(*) from public.documentos_medio where id in (dm_a, dm_b)) into v_n;
  r := r || jsonb_build_object('an05_no_lee_medios_en_tablas_base', pg_temp.ok(v_n = 0, v_n::text));
  select string_agg(id::text, ',') into v_t from public.medios_publico(array[me_a, me_b]);
  r := r || jsonb_build_object('an06_medios_publico_solo_su_contraparte', pg_temp.ok(v_t = me_a::text, v_t));
  select string_agg(id::text, ',') into v_t from public.facturas where id in (f_a, f_b);
  r := r || jsonb_build_object('an07_solo_su_factura', pg_temp.ok(v_t = f_a::text, v_t));
  select count(*) into v_n from public.perfiles where id = any (v_usuarios);
  r := r || jsonb_build_object('an08_solo_su_perfil', pg_temp.ok(v_n = 1, v_n::text));
  select count(*) into v_n from public.bitacora;
  select count(*) into v_m from public.accesos where usuario_id <> u_ana;
  r := r || jsonb_build_object('an09_sin_bitacora_ni_accesos_ajenos', pg_temp.ok(v_n = 0 and v_m = 0, v_n || '/' || v_m));
  select count(*) into v_n from public.accesos where usuario_id = u_ana;
  r := r || jsonb_build_object('an10_ve_sus_accesos', pg_temp.ok(v_n = 1, v_n::text));
  update public.campanas set nombre = 'Intento ajeno' where id = c_b;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('an11_no_actualiza_campana_ajena', pg_temp.ok(v_n = 0, v_n::text));
  begin
    insert into public.campanas (anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total)
    values (an_b, 'Campaña ajena', 'X', private.hoy(), private.hoy() + 5, 1000000);
    v_e := 'NO FALLÓ';
  exception when insufficient_privilege then v_e := 'ok';
  end;
  r := r || jsonb_build_object('an12_no_crea_campana_para_otro', pg_temp.ok(v_e = 'ok', v_e));
  begin
    insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, tope_porcentaje_por_medio,
                                cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion)
    values (c_b, 'Oferta ajena', f_post, 'INSTAGRAM', 100000, 1, '{D7}', now() + interval '3 days', now() + interval '9 days',
            now() + interval '2 days');
    v_e := 'NO FALLÓ';
  exception when insufficient_privilege then v_e := 'ok';
  end;
  r := r || jsonb_build_object('an13_no_crea_oferta_en_campana_ajena', pg_temp.ok(v_e = 'ok', v_e));
  select count(*) into v_n from public.disputas where id = d_a;
  select count(*) into v_m from public.disputa_mensajes where disputa_id = d_a;
  r := r || jsonb_build_object('an14_ve_su_disputa_sin_notas_internas', pg_temp.ok(v_n = 1 and v_m = 1, v_n || '/' || v_m));
  select string_agg(id::text, ',') into v_t from public.documentos_anunciante where id in (da_a, da_b);
  r := r || jsonb_build_object('an15_solo_sus_documentos', pg_temp.ok(v_t = da_a::text, v_t));
  select count(*) filter (where id not in (u_ana, u_sus)), count(*) filter (where id = u_ana) into v_n, v_m
  from public.miembros_organizacion() where id = any (v_usuarios);
  r := r || jsonb_build_object('an16_miembros_solo_de_su_organizacion', pg_temp.ok(v_n = 0 and v_m = 1, v_n || '/' || v_m));
  -- Notificaciones propias
  select count(*) into v_n from public.notificaciones where usuario_id = any (v_usuarios) and tipo = 'rls.prueba';
  select count(*) into v_m from public.mis_notificaciones(50, null, false) where tipo = 'rls.prueba';
  r := r || jsonb_build_object('an17_solo_sus_notificaciones', pg_temp.ok(v_n = 1 and v_m = 1, v_n || '/' || v_m));
  select public.marcar_notificaciones_leidas(array[n_anb], true) into v_n;
  update public.notificaciones set leida = true where id = n_anb;
  get diagnostics v_m = row_count;
  r := r || jsonb_build_object('an18_no_marca_notificacion_ajena', pg_temp.ok(v_n = 0 and v_m = 0, v_n || '/' || v_m));
  select public.marcar_notificaciones_leidas(array[n_ana], true) into v_n;
  r := r || jsonb_build_object('an19_marca_la_propia', pg_temp.ok(v_n = 1, v_n::text));
  -- Analítica del anunciante
  select valor into v_num from public.kpis_anunciante(v_desde, v_hasta) where kpi = 'inversion_comprometida';
  r := r || jsonb_build_object('an20_kpis_solo_con_sus_datos', pg_temp.ok(v_num = 250000, coalesce(v_num::text, 'null')));
  select count(*) into v_n from public.reporte_desempeno_campanas(v_desde, v_hasta, an_b) where campana_id = c_b;
  r := r || jsonb_build_object('an21_reporte_no_filtra_campanas_ajenas', pg_temp.ok(v_n = 0, v_n::text));
  begin
    perform 1 from public.kpis_admin(v_desde, v_hasta);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('an22_sin_kpis_de_administracion', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform 1 from public.geo_metricas('departamento', 'gmv', v_desde, v_hasta, null);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('an23_sin_mapa_global', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform 1 from public.kpis_medio(v_desde, v_hasta);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('an24_sin_kpis_de_medio', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_anb, s_anb);
  select string_agg(id::text, ',') into v_t from public.asignaciones where id = any (v_asignaciones);
  select count(*) into v_n from public.disputas where id = d_a;
  r := r || jsonb_build_object('an25_b_solo_lo_suyo', pg_temp.ok(v_t = x_b::text and v_n = 0, v_t || '/' || v_n));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  -- IDOR en los *_srv (el servidor declara al actor; la BD revalida propiedad)
  begin
    perform public.transicionar_srv('campanas', c_b, 'CANCELADA', u_ana, s_ana, 'Intento ajeno', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('an26_srv_no_cancela_campana_ajena', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.abrir_disputa_srv(x_b, 'CONTENIDO', 'Intento ajeno', u_ana, s_ana);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('an27_srv_no_abre_disputa_ajena', pg_temp.ok(v_e in ('AMO_NO_AUTORIZADO', 'AMO_TRANSICION_INVALIDA'), v_e));

  -- ═══ (me) Medio A vs B (IDOR) ════════════════════════════════════════════════════════════════════════════════
  perform pg_temp.como(u_mea, s_mea);
  select count(*) into v_n from public.medios where id in (me_a, me_b);
  select count(*) into v_m from public.medios_privado where medio_id in (me_a, me_b);
  r := r || jsonb_build_object('me01_solo_su_medio_y_su_privado', pg_temp.ok(v_n = 1 and v_m = 1, v_n || '/' || v_m));
  select (select count(*) from public.cuentas_sociales where id in (cu_a, cu_b)) * 10
       + (select count(*) from public.documentos_medio where id in (dm_a, dm_b)) into v_n;
  r := r || jsonb_build_object('me02_solo_sus_cuentas_y_documentos', pg_temp.ok(v_n = 11, v_n::text));
  select (select count(*) from public.campanas where id = any (v_campanas)) + (select count(*) from public.ofertas where id = any (v_ofertas))
       + (select count(*) from public.asignaciones where id = any (v_asignaciones)) + (select count(*) from public.anunciantes where id in (an_a, an_b))
       + (select count(*) from public.asignacion_montos where asignacion_id = any (v_asignaciones)) into v_n;
  r := r || jsonb_build_object('me03_no_lee_negocio_en_tablas_base', pg_temp.ok(v_n = 0, v_n::text));
  select string_agg(id::text, ',') into v_t from public.mis_asignaciones_medio(null, 50, null) where id = any (v_asignaciones);
  r := r || jsonb_build_object('me04_mis_asignaciones_solo_propias', pg_temp.ok(v_t = x_a::text, v_t));
  select string_agg(id::text, ',') into v_t from public.ofertas_para_medio(null) where id = any (v_ofertas);
  r := r || jsonb_build_object('me05_marketplace_respeta_segmentacion', pg_temp.ok(v_t = o_a::text, v_t));
  select string_agg(id::text, ',') into v_t from public.anunciantes_publico(array[an_a, an_b]);
  r := r || jsonb_build_object('me06_anunciantes_publico_solo_contraparte', pg_temp.ok(v_t = an_a::text, v_t));
  select string_agg(id::text, ',') into v_t from public.liquidaciones where id in (l_a, l_b);
  r := r || jsonb_build_object('me07_solo_su_liquidacion', pg_temp.ok(v_t = l_a::text, v_t));
  select valor into v_num from public.kpis_medio(v_desde, v_hasta) where kpi = 'asignaciones_activas';
  r := r || jsonb_build_object('me08_kpis_solo_con_sus_datos', pg_temp.ok(v_num = 1, coalesce(v_num::text, 'null')));
  select count(*) into v_n from public.proximas_acciones_medio(20) where asignacion_id = x_b;
  r := r || jsonb_build_object('me09_proximas_acciones_sin_ajenas', pg_temp.ok(v_n = 0, v_n::text));
  select count(*) into v_n from public.notificaciones where usuario_id = any (v_usuarios) and tipo = 'rls.prueba';
  r := r || jsonb_build_object('me10_solo_sus_notificaciones', pg_temp.ok(v_n = 1, v_n::text));
  begin
    select count(*) into v_n from public.cotizar_oferta(o_a, cu_b);
    v_e := case when v_n = 0 then 'vacío' else 'NO FALLÓ' end;
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me11_no_cotiza_con_cuenta_ajena',
    pg_temp.ok(v_e in ('vacío', 'AMO_NO_AUTORIZADO', 'AMO_NO_ELEGIBLE'), v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_meb, s_meb);
  select count(*) into v_n from public.medios_privado where medio_id = me_a;
  select string_agg(id::text, ',') into v_t from public.mis_asignaciones_medio(null, 50, null) where id = any (v_asignaciones);
  r := r || jsonb_build_object('me12_b_no_ve_privado_ni_asignaciones_de_a', pg_temp.ok(v_n = 0 and v_t = x_b::text, v_n || '/' || v_t));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.reservar_cupo_srv(o_b, me_b, cu_b, u_mea, s_mea, null);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me13_srv_no_reserva_por_otro_medio', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.registrar_descarga_srv(x_b, u_mea, s_mea);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me14_srv_no_descarga_asignacion_ajena', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.registrar_evidencia_srv(x_b, 1, 'https://instagram.com/p/x', now(), null, null, true, u_mea, s_mea);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me15_srv_no_registra_evidencia_ajena', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.abrir_disputa_srv(x_b, 'CONTENIDO', 'Intento ajeno', u_mea, s_mea);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me16_srv_no_abre_disputa_ajena', pg_temp.ok(v_e in ('AMO_NO_AUTORIZADO', 'AMO_TRANSICION_INVALIDA'), v_e));
  begin
    perform public.transicionar_srv('asignaciones', x_b, 'RECHAZADA', u_mea, s_mea, 'Intento ajeno', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me17_srv_no_desiste_por_otro', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.generar_liquidacion_srv(me_b, private.hoy() - 30, private.hoy(), u_mea, s_mea);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me18_srv_medio_no_liquida', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.revelar_privado_srv('medios_privado', me_b, u_mea, s_mea, array['numero_documento_resumen']);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('me19_srv_medio_no_revela_privado_ajeno', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  select public.revelar_privado_srv('medios_privado', me_a, u_ops, s_ops, array['numero_documento_cifrado']) ->> 'numero_documento_cifrado'
    into v_t;
  select count(*) into v_n from public.bitacora where accion = 'REVELAR_DATO' and entidad_id = me_a::text and actor_id = u_ops;
  r := r || jsonb_build_object('me20_interno_revela_por_srv_con_bitacora',
    pg_temp.ok(v_t = 'v1:YQ==:Yg==:Yw==' and v_n = 1, coalesce(v_t, 'null') || '/' || v_n));

  -- ═══ (x) Sin acceso: suspendido, sesión revocada, expirada o inactiva ═══════════════════════════════════════════
  perform pg_temp.como(u_sus, s_sus);
  select count(*) into v_n from public.perfiles where id = any (v_usuarios);
  select (select count(*) from public.campanas where id = any (v_campanas)) + (select count(*) from public.notificaciones)
       + (select count(*) from storage.objects where name like 'anunciante/' || an_a || '/%') into v_m;
  r := r || jsonb_build_object('x01_suspendido_solo_su_perfil', pg_temp.ok(v_n = 1 and v_m = 0, v_n || '/' || v_m));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.transicionar_srv('campanas', c_a, 'CANCELADA', u_sus, s_sus, 'Intento suspendido', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('x02_suspendido_no_usa_srv', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  perform pg_temp.como(u_adm, s_rev, 'aal2');
  select (select count(*) from public.campanas where id = any (v_campanas)) + (select count(*) from public.medios where id in (me_a, me_b)) into v_n;
  select count(*) into v_m from public.perfiles where id = any (v_usuarios);
  r := r || jsonb_build_object('x03_sesion_revocada_sin_datos', pg_temp.ok(v_n = 0 and v_m = 1, v_n || '/' || v_m));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_adm, s_exp, 'aal2');
  select count(*) into v_n from public.campanas where id = any (v_campanas);
  r := r || jsonb_build_object('x04_sesion_expirada_sin_datos', pg_temp.ok(v_n = 0, v_n::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_adm, s_ina, 'aal2');
  select count(*) into v_n from public.campanas where id = any (v_campanas);
  r := r || jsonb_build_object('x05_sesion_inactiva_sin_datos', pg_temp.ok(v_n = 0, v_n::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select public.tocar_sesion_srv(u_adm, s_ina) into v_t;
  r := r || jsonb_build_object('x06_tocar_no_reactiva_inactiva', pg_temp.ok(v_t = 'INACTIVA', v_t));
  begin
    perform public.transicionar_srv('campanas', c_a, 'CANCELADA', u_adm, s_rev, 'Sesión revocada', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('x07_srv_con_sesion_revocada', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));
  begin
    perform public.transicionar_srv('campanas', c_a, 'CANCELADA', u_adm, s_adm1, 'Sesión aal1', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('x08_srv_admin_a_aal1', pg_temp.ok(v_e = 'AMO_NO_AUTORIZADO', v_e));

  -- ═══ (st) Storage por bucket y carpeta ═══════════════════════════════════════════════════════════════════════
  perform pg_temp.como(u_ana, s_ana);
  select string_agg(bucket_id || ':' || split_part(name, '/', 2), ',' order by bucket_id) into v_t from storage.objects
   where name like any (array['anunciante/' || an_a || '/%', 'anunciante/' || an_b || '/%', 'perfil/' || u_ana || '/%',
                              'perfil/' || u_anb || '/%', 'asignacion/' || x_a || '/%', 'asignacion/' || x_b || '/%',
                              'oferta/' || o_a || '/%', 'oferta/' || o_b || '/%', 'medio/' || me_a || '/%', 'liquidacion/' || l_a || '/%']);
  r := r || jsonb_build_object('st01_anunciante_solo_sus_carpetas',
    pg_temp.ok(v_t = 'avatares:' || u_ana || ',creativos:' || o_a || ',documentos:' || an_a || ',evidencias:' || x_a, v_t));
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'anunciante/' || an_b || '/RUT/x.pdf');
    v_e := 'NO FALLÓ';
  exception when insufficient_privilege then v_e := 'ok';
  end;
  r := r || jsonb_build_object('st02_no_sube_a_carpeta_ajena', pg_temp.ok(v_e = 'ok', v_e));
  begin
    insert into storage.objects (bucket_id, name) values ('documentos', 'anunciante/' || an_a || '/RUT/../../' || an_b || '/RUT/x.pdf');
    v_e := 'NO FALLÓ';
  exception when insufficient_privilege then v_e := 'ok';
  end;
  r := r || jsonb_build_object('st03_no_sube_con_ruta_relativa', pg_temp.ok(v_e = 'ok', v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_mea, s_mea);
  select string_agg(bucket_id || ':' || split_part(name, '/', 2), ',' order by bucket_id) into v_t from storage.objects
   where name like any (array['medio/' || me_a || '/%', 'medio/' || me_b || '/%', 'liquidacion/' || l_a || '/%',
                              'liquidacion/' || l_b || '/%', 'asignacion/' || x_a || '/%', 'asignacion/' || x_b || '/%',
                              'oferta/' || o_a || '/%', 'anunciante/' || an_a || '/%']);
  -- Sin descarga registrada el medio no lee el creativo (§5.1 puedo_descargar_creativos_de).
  r := r || jsonb_build_object('st04_medio_solo_sus_carpetas',
    pg_temp.ok(v_t = 'documentos:' || me_a || ',evidencias:' || x_a || ',soportes:' || l_a, v_t));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.como(u_adm, s_adm, 'aal2');
  select count(*) into v_n from storage.objects where bucket_id = 'avatares' and name like any (array['perfil/' || u_ana || '/%', 'perfil/' || u_anb || '/%']);
  select count(*) into v_m from storage.objects where bucket_id = 'documentos' and name like any (array['medio/' || me_a || '/%', 'anunciante/' || an_a || '/%']);
  -- Los documentos de terceros los firma el servidor tras revalidar (regla de firma 2, §8), no la API.
  r := r || jsonb_build_object('st05_admin_avatares_si_documentos_no', pg_temp.ok(v_n = 2 and v_m = 0, v_n || '/' || v_m));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ═══ (es) Escalada de roles (actor declarado por el servidor) ═══════════════════════════════════════════════════
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.actor_id', u_adm::text, true);
  execute 'set local role service_role';
  begin
    update public.perfiles set rol_id = (select id from public.roles where clave = 'FINANZAS') where id = u_ops;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es01_admin_no_asigna_finanzas', pg_temp.ok(v_e = 'AMO_ESCALADA_PERMISOS', v_e));
  begin
    update public.perfiles set rol_id = (select id from public.roles where clave = 'SUPERADMIN') where id = u_ops;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es02_admin_no_asigna_superadmin', pg_temp.ok(v_e = 'AMO_SOLO_SUPERADMIN', v_e));
  begin
    update public.perfiles set rol_id = (select id from public.roles where clave = 'OPERACIONES') where id = u_adm;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es03_nadie_cambia_su_rol', pg_temp.ok(v_e = 'AMO_ROL_PROPIO', v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.actor_id', '', true);
  begin
    perform public.transicionar_srv('perfiles', u_sup, 'SUSPENDIDO', u_adm, s_adm, 'Intento de escalada', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es04_admin_no_suspende_superadmin', pg_temp.ok(v_e = 'AMO_ESCALADA_PERMISOS', v_e));
  begin
    perform public.transicionar_srv('perfiles', u_adm, 'SUSPENDIDO', u_adm, s_adm, 'Me suspendo', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es05_nadie_cambia_su_estado', pg_temp.ok(v_e is distinct from 'NO FALLÓ', v_e));
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa)
  values ('00000000-0000-4000-a000-00000000b0f1', 'RLS_ANUNCIANTE_EXT', 'Anunciante extendido', 'ANUNCIANTE', false);
  begin
    insert into public.rol_permisos (rol_id, permiso_clave) values ('00000000-0000-4000-a000-00000000b0f1', 'usuarios.ver');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es06_rol_externo_sin_permisos_internos', pg_temp.ok(v_e = 'AMO_PERMISO_NO_APLICABLE', v_e));
  begin
    update public.roles set requiere_mfa = false where clave = 'OPERACIONES';
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('es07_rol_interno_sin_mfa_imposible', pg_temp.ok(v_e is distinct from 'NO FALLÓ', v_e));

  -- ═══ (tr) Transiciones inválidas y escritura directa de estado ═════════════════════════════════════════════════
  begin
    perform public.transicionar_srv('campanas', c_a, 'FINALIZADA', u_ana, s_ana, 'Intento', '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('tr01_transicion_sin_fila_para_el_actor', pg_temp.ok(v_e = 'AMO_TRANSICION_INVALIDA', v_e));
  begin
    perform public.transicionar_srv('asignaciones', x_a, 'PUBLICADA', u_mea, s_mea, null, '{}');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('tr02_transicion_solo_por_procedimiento', pg_temp.ok(v_e = 'AMO_TRANSICION_INVALIDA', v_e));
  execute 'set local role service_role';
  begin
    update public.campanas set estado = 'FINALIZADA' where id = c_a;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('tr03_estado_no_se_escribe_directo', pg_temp.ok(v_e = 'AMO_ESTADO_SOLO_VIA_TRANSICION', v_e));
  begin
    insert into public.asignaciones (oferta_id, campana_id, anunciante_id, medio_id, plataforma, estado)
    values (o_a, c_a, an_a, me_b, 'INSTAGRAM', 'ACEPTADA');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('tr04_asignacion_solo_por_reserva', pg_temp.ok(v_e in ('AMO_NO_AUTORIZADO', 'AMO_TRANSICION_INVALIDA'), v_e));
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ═══ (li) Limitador de login (spraying, §5.5) ════════════════════════════════════════════════════════════════
  -- Los *_srv que prosperan dejan amo.actor_id fijado hasta el final de la transacción: se limpia como lo haría
  -- una petición nueva.
  perform set_config('amo.actor_id', '', true);
  for i in 1..20 loop
    perform public.registrar_intento_login_srv('rls.spray' || i || '@amo.test', '198.51.100.201'::inet, false);
  end loop;
  select bloqueado into v_b from public.login_bloqueado_srv('rls.nuevo@amo.test', '198.51.100.201'::inet);
  r := r || jsonb_build_object('li01_spraying_bloquea_la_ip', pg_temp.ok(v_b, coalesce(v_b::text, 'null')));
  for i in 1..5 loop
    perform public.registrar_intento_login_srv('rls.victima@amo.test', '198.51.100.202'::inet, false);
  end loop;
  select bloqueado into v_b from public.login_bloqueado_srv('rls.victima@amo.test', '198.51.100.203'::inet);
  r := r || jsonb_build_object('li02_fallos_de_una_ip_no_bloquean_el_correo_en_otra', pg_temp.ok(v_b = false, coalesce(v_b::text, 'null')));
  select bloqueado into v_b from public.login_bloqueado_srv('rls.victima@amo.test', '198.51.100.202'::inet);
  r := r || jsonb_build_object('li03_correo_e_ip_bloqueados', pg_temp.ok(v_b, coalesce(v_b::text, 'null')));

  -- ═══ (du) Borrado definitivo de un usuario con actividad (§3.8) ════════════════════════════════════════════════
  begin
    delete from auth.users where id = u_del;
    select count(*) into v_n from public.disputas where id = d_a and abierta_por = u_del;
    select count(*) into v_m from public.disputa_mensajes where disputa_id = d_a and autor_id = u_del;
    v_e := case when v_n = 1 and v_m = 1 and (select validado_por from public.documentos_medio where id = dm_a) is null
                     and (select creada_por from public.campanas where id = c_a) is null then 'ok' else v_n || '/' || v_m end;
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('du01_borrado_con_actividad_conserva_autoria', pg_temp.ok(v_e = 'ok', v_e));

  perform set_config('rls.resultado', r::text, true);
end
$rls$;

-- Resumen (detalle: select key, value from jsonb_each(current_setting('rls.resultado')::jsonb) order by key).
select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('rls.resultado')::jsonb);

rollback;
