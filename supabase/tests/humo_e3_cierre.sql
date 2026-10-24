-- Pruebas de humo de 20261024181218_e3_cierre (fase 6): confirmación de parámetros (CFG-001), medios cerca del tope
-- (CFG-005), plantilla desactivada (CFG-009), reputación del medio (MED-016), texto de la oferta elegible (NOT-003),
-- gestión asistida con bitácora y aviso al anunciante (ADM-014), derechos del titular con días hábiles, plazos legales,
-- requerimiento, prórroga, respuesta, desistimiento, exportación y supresión (CTA-007), correo apagado con cola,
-- turnos y reintentos (NOT-004), aviso en vivo mínimo (NOT-007) y la limpieza final de las pruebas (que aquí corre en la
-- transacción revertida, al final).
-- Se ejecuta como owner (pnpm db:suites) en una transacción que SIEMPRE se revierte. Los roles internos entran con
-- aal2; el contexto confiable del servidor se simula con la caché por transacción (amo.ctx_confiable). Cada prueba deja
-- `true` si pasa o lo observado si falla.
begin;

create function pg_temp.como(p_claims text, p_rol text, p_sql text) returns jsonb
language plpgsql as $$
declare v record;
begin
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_rol);
  execute p_sql into v;
  execute 'reset role';
  return (select nullif(e.value, 'null'::jsonb) from jsonb_each(to_jsonb(v)) e limit 1);
end $$;

create function pg_temp.falla(p_claims text, p_rol text, p_sql text) returns jsonb
language plpgsql as $$
declare v_e text; v_d text; v_h text; v_s text;
begin
  begin
    perform set_config('request.jwt.claims', p_claims, true);
    execute format('set local role %I', p_rol);
    execute p_sql;
    raise exception using errcode = 'P0001', message = 'NO FALLÓ';
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint, v_s = returned_sqlstate;
  end;
  return jsonb_strip_nulls(jsonb_build_object('e', v_e, 'd', nullif(v_d, ''), 'h', nullif(v_h, ''), 's', v_s));
end $$;

create function pg_temp.hacer(p_claims text, p_rol text, p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_rol);
  execute p_sql;
  get diagnostics v = row_count;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.srv(p_sql text) returns jsonb
language sql as $$ select pg_temp.como('{"role": "service_role"}', 'service_role', p_sql) $$;
create function pg_temp.srv_falla(p_sql text) returns jsonb
language sql as $$ select pg_temp.falla('{"role": "service_role"}', 'service_role', p_sql) $$;

create function pg_temp.es(p_obs jsonb, p_e text, p_d text default null) returns jsonb
language sql as $$
  select case when p_obs ->> 'e' = p_e and (p_d is null or p_obs ->> 'd' like p_d) then 'true'::jsonb else p_obs end $$;

-- `true` si se cumple; si no, lo observado.
create function pg_temp.ok(p_cond boolean, p_obs jsonb) returns jsonb
language sql as $$ select case when coalesce(p_cond, false) then 'true'::jsonb else coalesce(p_obs, 'null'::jsonb) end $$;

do $humo$
declare
  r jsonb := '{}';
  v_e jsonb; v_j jsonb; v_n bigint; v_m bigint; v_txt text; v_fecha date; v_id uuid; v_id2 uuid; v_id3 uuid;
  v_big bigint; v_num numeric;
  u_adm constant uuid := '00000000-0000-4000-a000-0000000f6001';   -- ADMIN (privacidad.gestionar)
  u_op constant uuid := '00000000-0000-4000-a000-0000000f6002';    -- OPERACIONES (gestión asistida y moderación)
  u_op2 constant uuid := '00000000-0000-4000-a000-0000000f6003';   -- OPERACIONES (recibe la cola)
  u_an constant uuid := '00000000-0000-4000-a000-0000000f6004';    -- ANUNCIANTE (contacto de su empresa)
  u_ma constant uuid := '00000000-0000-4000-a000-0000000f6005';    -- MEDIO A: asignación en curso
  u_mb constant uuid := '00000000-0000-4000-a000-0000000f6006';    -- MEDIO B: sin historial
  u_mc constant uuid := '00000000-0000-4000-a000-0000000f6007';    -- MEDIO C: historial terminado
  u_dm constant uuid := '00000000-0000-4000-a000-0000000f6008';    -- MEDIO demo (no recibe correo)
  s_adm constant uuid := '00000000-0000-4000-b000-0000000f6001';
  s_op constant uuid := '00000000-0000-4000-b000-0000000f6002';
  s_op2 constant uuid := '00000000-0000-4000-b000-0000000f6003';
  s_an constant uuid := '00000000-0000-4000-b000-0000000f6004';
  s_ma constant uuid := '00000000-0000-4000-b000-0000000f6005';
  s_mb constant uuid := '00000000-0000-4000-b000-0000000f6006';
  s_mc constant uuid := '00000000-0000-4000-b000-0000000f6007';
  an_v constant uuid := '00000000-0000-4000-c000-0000000f6001';
  me_a constant uuid := '00000000-0000-4000-d000-0000000f6001';
  me_b constant uuid := '00000000-0000-4000-d000-0000000f6002';
  me_c constant uuid := '00000000-0000-4000-d000-0000000f6003';
  me_d constant uuid := '00000000-0000-4000-d000-0000000f6004';
  cu_a constant uuid := '00000000-0000-4000-e000-0000000f6001';
  cu_b constant uuid := '00000000-0000-4000-e000-0000000f6002';
  cu_c constant uuid := '00000000-0000-4000-e000-0000000f6003';
  c_h constant uuid := '00000000-0000-4000-f000-0000000f6101';     -- campaña del historial (owner)
  o_h constant uuid := '00000000-0000-4000-f000-0000000f6201';
  o_rev constant uuid := '00000000-0000-4000-f000-0000000f6202';   -- oferta en revisión (moderación)
  liq_c constant uuid := '00000000-0000-4000-8000-0000000f6301';
  c_adm text; c_op text; c_op2 text; c_an text; c_ma text; c_mb text; c_mc text;
  v_mun char(5) := (select m.codigo from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                    where m.activo and d.activo order by m.codigo limit 1);
  v_sector uuid := (select id from public.sectores order by nombre limit 1);
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t
                    where t.formato_id = (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED')
                      and t.franja_id = (select id from public.franjas where clave = 'F1')
                      and t.vigente_desde <= now() and (t.vigente_hasta is null or t.vigente_hasta > now()));
  v_hoy constant date := private.hoy();
  c_asis uuid; o_asis uuid; c_propia uuid;
  st_a uuid; st_b uuid; st_c uuid; st_an uuid; st_cons uuid; st_viejo uuid;
begin
  -- ── Preparación (owner, modo_carga) ──────────────────────────────────────────────────────────────────────────
  update public.configuracion set valor = 'false' where clave = 'correo.habilitado';
  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo.e3c.admin@amo.test'), (u_op, 'humo.e3c.op@amo.test'), (u_op2, 'humo.e3c.op2@amo.test'),
               (u_an, 'humo.e3c.anunciante@amo.test'), (u_ma, 'humo.e3c.medio.a@amo.test'),
               (u_mb, 'humo.e3c.medio.b@amo.test'), (u_mc, 'humo.e3c.medio.c@amo.test'),
               (u_dm, 'humo.e3c.medio.demo@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2,
                                  municipio_codigo, estado_verificacion, verificado_at)
  values (an_v, 'Humo E3C S.A.S.', 'Humo E3C', '900888061', private.digito_verificacion_nit('900888061'), v_sector, 'CO',
          v_mun, 'VERIFICADO', now());
  insert into public.anunciantes_privado (anunciante_id, contacto_nombre, contacto_email, contacto_celular)
  values (an_v, 'Andrea Anunciante', 'humo.e3c.anunciante@amo.test', '3001234567')
  on conflict (anunciante_id) do update set contacto_nombre = excluded.contacto_nombre,
    contacto_email = excluded.contacto_email, contacto_celular = excluded.contacto_celular;
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at, es_demo)
  values (me_a, 'Medio Humo E3C A', 'CREADOR', v_mun, 'VERIFICADO', 1, now(), false),
         (me_b, 'Medio Humo E3C B', 'CREADOR', v_mun, 'PENDIENTE', 0, null, false),
         (me_c, 'Medio Humo E3C C', 'CREADOR', v_mun, 'VERIFICADO', 1, now(), false),
         (me_d, 'Medio Humo E3C demo', 'CREADOR', v_mun, 'VERIFICADO', 1, now(), true);
  insert into public.medios_privado (medio_id, titular_nombre, tipo_documento, numero_documento_cifrado, numero_documento_resumen,
                                     celular, email_contacto, direccion, es_declarante, obligado_facturar, responsable_iva,
                                     metodo_pago, datos_pago_cifrados, datos_pago_resumen, datos_pago_cambiados_at)
  select m, 'Titular ' || m, 'CC', 'v1:aaaa:bbbb:cccc', '••••1234', '3009998877', 'medio@ejemplo.co', 'Calle 1', false, false,
         false, 'BANCARIO', 'v1:dddd:eeee:ffff', 'Banco ···1234', now() - interval '10 days'
  from unnest(array[me_a, me_b, me_c]) m
  on conflict (medio_id) do update set titular_nombre = excluded.titular_nombre, tipo_documento = excluded.tipo_documento,
    numero_documento_cifrado = excluded.numero_documento_cifrado, numero_documento_resumen = excluded.numero_documento_resumen,
    celular = excluded.celular, email_contacto = excluded.email_contacto, direccion = excluded.direccion,
    metodo_pago = excluded.metodo_pago, datos_pago_cifrados = excluded.datos_pago_cifrados,
    datos_pago_resumen = excluded.datos_pago_resumen, datos_pago_cambiados_at = excluded.datos_pago_cambiados_at;
  insert into public.documentos_medio (medio_id, tipo, archivo_path, estado_validacion, validado_at, metodo)
  values (me_c, 'PRUEBA_VIDA', 'medio/' || me_c || '/PRUEBA_VIDA/v.mp4', 'APROBADO', now(), 'ARCHIVO'),
         (me_c, 'CERT_BANCARIA', 'medio/' || me_c || '/CERT_BANCARIA/c.pdf', 'APROBADO', now(), 'ARCHIVO'),
         (me_c, 'CEDULA_FRENTE', 'medio/' || me_c || '/CEDULA_FRENTE/f.jpg', 'APROBADO', now(), 'ARCHIVO'),
         (me_b, 'CEDULA_FRENTE', 'medio/' || me_b || '/CEDULA_FRENTE/f.jpg', 'PENDIENTE', null, 'ARCHIVO');
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo_e3c_a', 'https://instagram.com/humo_e3c_a', 45000, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo_e3c_b', 'https://instagram.com/humo_e3c_b', 45000, false, null, null),
         (cu_c, me_c, 'INSTAGRAM', 'humo_e3c_c', 'https://instagram.com/humo_e3c_c', 45000, true, 'MANUAL', now());
  update public.perfiles p set rol_id = (select id from public.roles where clave = x.rol), estado = 'ACTIVO',
         debe_cambiar_password = false, nombre = x.nombre, es_demo = x.demo,
         anunciante_id = case when x.rol = 'ANUNCIANTE' then x.org end, medio_id = case when x.rol = 'MEDIO' then x.org end
  from (values (u_adm, 'ADMIN', 'Ana Administradora', null::uuid, false), (u_op, 'OPERACIONES', 'Óscar Operador', null, false),
               (u_op2, 'OPERACIONES', 'Olga Operadora', null, false), (u_an, 'ANUNCIANTE', 'Andrea Anunciante', an_v, false),
               (u_ma, 'MEDIO', 'Mario Medio', me_a, false), (u_mb, 'MEDIO', 'Berta Medio', me_b, false),
               (u_mc, 'MEDIO', 'Carla Medio', me_c, false), (u_dm, 'MEDIO', 'Demo Medio', me_d, true)) as x (id, rol, nombre, org, demo)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  select x.s, x.u, now(), now(), x.aal::auth.aal_level
  from (values (s_adm, u_adm, 'aal2'), (s_op, u_op, 'aal2'), (s_op2, u_op2, 'aal2'), (s_an, u_an, 'aal1'),
               (s_ma, u_ma, 'aal1'), (s_mb, u_mb, 'aal1'), (s_mc, u_mc, 'aal1')) as x (s, u, aal);
  -- Historial: A con una asignación en curso; C con 3 casos en la ventana (2 cumplidos, 1 vencido sin publicar) y pagados.
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_h, an_v, 'Campaña Humo E3C', 'Marca Seis', v_hoy - 60, v_hoy + 20, 90000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, publicaciones_por_medio,
                              permite_multiples_cupos, presupuesto_maximo, tope_porcentaje_por_medio, cortes_requeridos,
                              ventana_inicio, ventana_fin, fecha_limite_aceptacion, instrucciones, restricciones, estado,
                              enviada_at, publicada_at)
  values (o_h, c_h, an_v, 'Post de la reputación', f_post, 'INSTAGRAM', 1, true, 60000000, 1, '{H24}',
          now() - interval '50 days', now() + interval '5 days', now() - interval '51 days', 'Publica la pieza.', 'Sin cambios.',
          'PUBLICADA', now() - interval '53 days', now() - interval '52 days'),
         (o_rev, c_h, an_v, 'Oferta en revisión', f_post, 'INSTAGRAM', 1, true, 2000000, 1, '{H24}',
          now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', 'Publica la pieza.', 'Sin cambios.',
          'EN_REVISION', now() - interval '1 day', null);
  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
                                    monto_medio, monto_neto, estado, requiere_documento_soporte, aprobada_at, pagada_at,
                                    fecha_pago, soporte_pago_path)
  values (liq_c, me_c, v_hoy - 45, v_hoy - 16, 2, 10000000, 2000000, 8000000, 8000000, 'PAGADA', true, now() - interval '15 days',
          now() - interval '10 days', v_hoy - 10, 'liquidacion/' || liq_c || '/pago/soporte.pdf');
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, publicada_at, evidencia_validada_at, fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id,
    franja_clave, seguidores_al_aceptar, liquidacion_id)
  select gen_random_uuid(), o_h, c_h, an_v, x.medio, x.cuenta, 'INSTAGRAM', x.slot, x.estado::public.asignacion_estado,
         now() - interval '40 days', x.publicada, x.validada, x.limite, 1, 5000000, v_tarifa, fr1, 'F1', 45000,
         case when x.estado = 'PAGADA' then liq_c end
  from (values (me_a, cu_a, 1, 'ACEPTADA', null::timestamptz, null::timestamptz, now() + interval '2 days'),
               (me_c, cu_c, 1, 'PAGADA', now() - interval '35 days', now() - interval '34 days', now() - interval '30 days'),
               (me_c, cu_c, 2, 'PAGADA', now() - interval '25 days', now() - interval '24 days', now() - interval '20 days'),
               (me_c, cu_c, 3, 'VENCIDA_SIN_PUBLICAR', null, null, now() - interval '10 days'))
       as x (medio, cuenta, slot, estado, publicada, validada, limite);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen, monto_comision)
  select a.id, a.medio_id, a.monto_bruto, 0.2, 'GLOBAL', a.monto_bruto * 0.2
  from public.asignaciones a where a.oferta_id = o_h;
  perform set_config('amo.modo_carga', '', true);

  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_op := jsonb_build_object('sub', u_op, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_op)::text;
  c_op2 := jsonb_build_object('sub', u_op2, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_op2)::text;
  c_an := jsonb_build_object('sub', u_an, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_an)::text;
  c_ma := jsonb_build_object('sub', u_ma, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ma)::text;
  c_mb := jsonb_build_object('sub', u_mb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mb)::text;
  c_mc := jsonb_build_object('sub', u_mc, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mc)::text;

  -- ── (a) Configuración, reputación y textos ─────────────────────────────────────────────────────────────────────
  update public.configuracion set pendiente_validacion = true where clave = 'privacidad.alerta_dias';
  perform set_config('amo.ctx_confiable', 'si', true);               -- la configuración se escribe desde el servidor
  v_n := pg_temp.hacer(c_adm, 'authenticated',
    'update public.configuracion set pendiente_validacion = false where clave = ''privacidad.alerta_dias''');
  r := r || jsonb_build_object('a01_confirmar_parametro_pendiente',
    pg_temp.ok(v_n = 1 and exists (select 1 from public.bitacora b where b.entidad = 'configuracion'
                                    and b.entidad_id = 'privacidad.alerta_dias' and b.actor_id = u_adm
                                    and b.cambios ? 'pendiente_validacion'), to_jsonb(v_n)));
  v_e := pg_temp.falla(c_adm, 'authenticated',
    'update public.configuracion set pendiente_validacion = true where clave = ''privacidad.alerta_dias''');
  r := r || jsonb_build_object('a02_confirmado_no_vuelve_a_pendiente', pg_temp.es(v_e, 'AMO_CONFIG_INVALIDA'));
  v_n := pg_temp.hacer(c_op, 'authenticated',
    'update public.configuracion set pendiente_validacion = false where clave = ''correo.habilitado''');
  r := r || jsonb_build_object('a03_sin_configuracion_editar_no_confirma',
    pg_temp.ok(v_n = 0 and (select pendiente_validacion from public.configuracion where clave = 'correo.habilitado'),
               to_jsonb(v_n)));
  perform set_config('amo.ctx_confiable', '', true);

  v_j := pg_temp.como(c_mc, 'authenticated', 'select to_jsonb(x) from public.mi_reputacion() x');
  r := r || jsonb_build_object('a04_reputacion_tres_casos',
    pg_temp.ok((v_j ->> 'n')::int = 3 and (v_j ->> 'cumplidas')::int = 2 and (v_j ->> 'tasa')::numeric = 0.6667
               and jsonb_array_length(v_j -> 'casos') = 3 and (v_j ->> 'n_minimo')::int = 3, v_j));
  v_j := pg_temp.como(c_ma, 'authenticated', 'select to_jsonb(x) from public.mi_reputacion() x');
  r := r || jsonb_build_object('a05_reputacion_sin_historial_suficiente',
    pg_temp.ok((v_j ->> 'tasa') is null and (v_j ->> 'n')::int = 0 and jsonb_array_length(v_j -> 'casos') = 0, v_j));
  v_e := pg_temp.falla(c_an, 'authenticated', 'select * from public.mi_reputacion()');
  r := r || jsonb_build_object('a06_reputacion_solo_del_medio', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));

  update public.niveles_verificacion set tope_anual = 10000000, porcentaje_alerta = 0.8 where nivel = 1;
  v_j := pg_temp.como(c_op, 'authenticated',
    format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.medios_cerca_tope() x where x.medio_id in (%L, %L)',
           me_a, me_c));
  r := r || jsonb_build_object('a07_medios_cerca_del_tope',
    pg_temp.ok(jsonb_array_length(v_j) = 1 and v_j -> 0 ->> 'medio_id' = me_c::text
               and (v_j -> 0 ->> 'consumido')::numeric = 8000000, v_j));
  v_e := pg_temp.falla(c_ma, 'authenticated', 'select * from public.medios_cerca_tope()');
  r := r || jsonb_build_object('a08_cerca_del_tope_solo_internos', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));

  r := r || jsonb_build_object('a09_titulo_oferta_elegible',
    (select nombre = 'Nueva oferta disponible para tu medio' from public.plantillas_notificacion
     where clave = 'oferta.nueva_elegible' and canal = 'APP'));
  update public.plantillas_notificacion set activa = false where clave = 'medio.cerca_tope' and canal = 'APP';
  r := r || jsonb_build_object('a10_plantilla_desactivada_no_avisa',
    pg_temp.ok(private.notificar(array[u_ma], 'medio.cerca_tope', '{}', 'medios', me_a::text, null) = 0, null));
  update public.plantillas_notificacion set activa = true where clave = 'medio.cerca_tope' and canal = 'APP';

  -- ── (b) Gestión asistida (ADM-014) ─────────────────────────────────────────────────────────────────────────────
  v_j := pg_temp.como(c_op, 'authenticated', format(
    'insert into public.campanas (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total)
     values (%L, ''Campaña asistida'', ''Lanzamiento'', ''Marca Seis'', %L, %L, 10000000) returning to_jsonb(id)',
    an_v, v_hoy, v_hoy + 30));
  c_asis := (v_j #>> '{}')::uuid;
  r := r || jsonb_build_object('b01_campana_asistida_marcada',
    pg_temp.ok((select gestion_asistida and creada_por = u_op from public.campanas where id = c_asis), v_j));
  v_j := (select b.metadatos from public.bitacora b where b.entidad = 'campanas' and b.entidad_id = c_asis::text
          and b.accion = 'INSERT');
  r := r || jsonb_build_object('b02_bitacora_operador_y_propietario',
    pg_temp.ok(v_j ->> 'modo' = 'ASISTIDO' and v_j ->> 'anunciante_id' = an_v::text
               and exists (select 1 from public.bitacora b where b.entidad = 'campanas' and b.entidad_id = c_asis::text
                           and b.actor_id = u_op), v_j));
  r := r || jsonb_build_object('b03_aviso_al_anunciante_creada',
    pg_temp.ok(exists (select 1 from public.notificaciones n where n.usuario_id = u_an and n.tipo = 'campana.gestion_asistida'
                       and n.entidad_id = c_asis::text and n.mensaje like 'El equipo AMO creó la campaña «Campaña asistida»%'),
               null));
  v_j := pg_temp.como(c_op, 'authenticated', format(
    'insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                                 fecha_limite_aceptacion)
     values (%L, ''Oferta asistida'', %L, ''INSTAGRAM'', 2000000, now() + interval ''3 days'', now() + interval ''10 days'',
             now() + interval ''2 days'') returning to_jsonb(id)', c_asis, f_post));
  o_asis := (v_j #>> '{}')::uuid;
  v_n := pg_temp.hacer(c_op, 'authenticated',
    format('insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (%L, %L, 2)', o_asis, fr1));
  r := r || jsonb_build_object('b04_oferta_y_cupos_asistidos',
    pg_temp.ok((select gestion_asistida from public.ofertas where id = o_asis)
               and (select b.metadatos ->> 'modo' = 'ASISTIDO' from public.bitacora b
                    where b.entidad = 'oferta_cupos' and b.accion = 'INSERT' and b.actor_id = u_op order by b.id desc limit 1),
               v_j));
  v_j := pg_temp.como(c_an, 'authenticated', format(
    'insert into public.campanas (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total)
     values (%L, ''Campaña propia'', ''Lanzamiento'', ''Marca Seis'', %L, %L, 10000000) returning to_jsonb(id)',
    an_v, v_hoy, v_hoy + 30));
  c_propia := (v_j #>> '{}')::uuid;
  r := r || jsonb_build_object('b05_campana_propia_sin_marca',
    pg_temp.ok((select not gestion_asistida from public.campanas where id = c_propia)
               and (select b.metadatos = '{}'::jsonb from public.bitacora b where b.entidad = 'campanas'
                    and b.entidad_id = c_propia::text and b.accion = 'INSERT'), v_j));
  r := r || jsonb_build_object('b06_marca_no_editable',
    not has_column_privilege('authenticated', 'public.campanas', 'gestion_asistida', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.ofertas', 'gestion_asistida', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.campanas', 'gestion_asistida', 'INSERT'));
  perform pg_temp.srv(format('select public.transicionar_srv(''campanas'', %L, ''ACTIVA'', %L, %L)', c_asis, u_op, s_op));
  r := r || jsonb_build_object('b07_activar_asistida_avisa_y_marca',
    pg_temp.ok(exists (select 1 from public.notificaciones n where n.usuario_id = u_an and n.tipo = 'campana.gestion_asistida'
                       and n.entidad_id = c_asis::text and n.mensaje like '%activó%')
               and (select b.metadatos ->> 'modo' = 'ASISTIDO' from public.bitacora b where b.entidad = 'campanas'
                    and b.entidad_id = c_asis::text and b.accion = 'TRANSICION' order by b.id desc limit 1), null));
  perform pg_temp.srv(format('select public.transicionar_srv(''ofertas'', %L, ''CANCELADA'', %L, %L, ''Pedido del cliente'')',
                             o_asis, u_op, s_op));
  r := r || jsonb_build_object('b08_cancelar_borrador_asistido_avisa_con_motivo',
    pg_temp.ok(exists (select 1 from public.notificaciones n where n.usuario_id = u_an and n.tipo = 'oferta.gestion_asistida'
                       and n.entidad_id = o_asis::text and n.mensaje like '%canceló%Motivo: Pedido del cliente'), null));
  perform pg_temp.srv(format('select public.transicionar_srv(''ofertas'', %L, ''DEVUELTA'', %L, %L, ''Ajusta el texto'')',
                             o_rev, u_op, s_op));
  r := r || jsonb_build_object('b09_moderacion_no_es_asistida',
    pg_temp.ok((select b.metadatos = '{}'::jsonb from public.bitacora b where b.entidad = 'ofertas'
                and b.entidad_id = o_rev::text and b.accion = 'TRANSICION' order by b.id desc limit 1)
               and not exists (select 1 from public.notificaciones n where n.tipo = 'oferta.gestion_asistida'
                               and n.entidad_id = o_rev::text)
               and exists (select 1 from public.notificaciones n where n.tipo = 'oferta.devuelta' and n.entidad_id = o_rev::text),
               null));
  perform set_config('request.jwt.claims', '', true);
  perform set_config('amo.actor_id', u_op::text, true);
  v_n := private.notificar_cola('ofertas.moderar', 'cola.oferta_revision', jsonb_build_object('oferta', 'X', 'anunciante', 'Y'),
                                'ofertas', 'humo-e3c-cola', 1::smallint);
  perform set_config('amo.actor_id', '', true);
  r := r || jsonb_build_object('b10_la_cola_no_avisa_a_quien_actua',
    pg_temp.ok(v_n > 0 and not exists (select 1 from public.notificaciones n where n.usuario_id = u_op
                                       and n.entidad_id = 'humo-e3c-cola')
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_op2 and n.entidad_id = 'humo-e3c-cola'),
               to_jsonb(v_n)));

  -- ── (c) Derechos del titular (CTA-007) ─────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('c01_festivos_2026',
    pg_temp.ok(private.domingo_pascua(2026) = date '2026-04-05'
               and (select count(*) from private.festivos where extract(year from fecha) = 2026) = 18
               and exists (select 1 from private.festivos where fecha = date '2026-05-18')
               and exists (select 1 from private.festivos where fecha = date '2026-06-15')
               and exists (select 1 from private.festivos where fecha = date '2026-11-16'),
               (select jsonb_agg(fecha order by fecha) from private.festivos where extract(year from fecha) = 2026)));
  r := r || jsonb_build_object('c02_dias_habiles',
    pg_temp.ok(private.sumar_dias_habiles(date '2026-10-24', 10) = date '2026-11-09'
               and private.sumar_dias_habiles(date '2026-10-24', 15) = date '2026-11-17'
               and private.sumar_dias_habiles(date '2026-12-31', 1) = date '2027-01-04'
               and private.restar_dias_habiles(date '2026-11-17', 2) = date '2026-11-12', null));

  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''SUPRESION'', %L, %L)', u_mb, s_mb,
                            'Quiero que borren mis datos de AMO.', '{CONTACTO,PAGO}'));
  st_b := (v_j #>> '{}')::uuid;
  r := r || jsonb_build_object('c03_supresion_radicada_con_fecha_y_plazo',
    pg_temp.ok((select estado = 'RADICADA' and recibida_at is not null and tipo = 'SUPRESION' and rol_tipo = 'MEDIO'
                       and medio_id = me_b and plazo_vence = private.sumar_dias_habiles(v_hoy, 15)
                       and alerta_desde <= plazo_vence and datos_afectados = '{CONTACTO,PAGO}'
                from public.solicitudes_titular where id = st_b), v_j));
  r := r || jsonb_build_object('c04_el_equipo_recibe_el_caso',
    pg_temp.ok(exists (select 1 from public.notificaciones n where n.usuario_id = u_adm and n.tipo = 'cola.solicitud_titular'
                       and n.entidad = 'solicitudes_titular' and n.entidad_id = st_b::text)
               and not exists (select 1 from public.notificaciones n where n.usuario_id = u_op
                               and n.tipo = 'cola.solicitud_titular' and n.entidad_id = st_b::text)
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_mb
                           and n.tipo = 'titular.solicitud_radicada' and n.entidad_id = st_b::text), null));
  v_e := pg_temp.srv_falla(format('select public.radicar_solicitud_titular_srv(%L, %L, ''SUPRESION'', %L)', u_mb, s_mb,
                                  'Otra vez la misma solicitud.'));
  r := r || jsonb_build_object('c05_una_abierta_por_tipo', pg_temp.es(v_e, 'AMO_SOLICITUD_ABIERTA'));
  v_e := pg_temp.srv_falla(format('select public.radicar_solicitud_titular_srv(%L, %L, ''QUEJA'', %L)', u_mb, s_mb,
                                  'Tipo que no existe en la ley.'));
  r := r || jsonb_build_object('c06_tipo_invalido', pg_temp.es(v_e, 'AMO_CONFIG_INVALIDA'));
  v_e := pg_temp.srv_falla(format('select public.radicar_solicitud_titular_srv(%L, %L, ''CONSULTA'', ''corta'')', u_mb, s_mb));
  r := r || jsonb_build_object('c07_descripcion_minima', pg_temp.es(v_e, 'AMO_MOTIVO_REQUERIDO'));

  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''CONSULTA'', %L)', u_an, s_an,
                            'Quiero saber qué datos míos tienen.'));
  st_cons := (v_j #>> '{}')::uuid;
  r := r || jsonb_build_object('c08_consulta_diez_dias_habiles',
    pg_temp.ok((select plazo_vence = private.sumar_dias_habiles(v_hoy, 10) and rol_tipo = 'ANUNCIANTE'
                       and anunciante_id = an_v
                from public.solicitudes_titular where id = st_cons), v_j));
  r := r || jsonb_build_object('c09_rls_titular_e_interno',
    pg_temp.ok(pg_temp.como(c_mb, 'authenticated', 'select count(*) from public.solicitudes_titular')::int = 1
               and pg_temp.como(c_an, 'authenticated',
                                format('select count(*) from public.solicitudes_titular where id = %L', st_b))::int = 0
               and pg_temp.como(c_op, 'authenticated', 'select count(*) from public.solicitudes_titular')::int = 0
               and pg_temp.como(c_adm, 'authenticated',
                                format('select count(*) from public.solicitudes_titular where id in (%L, %L)', st_b,
                                       st_cons))::int = 2, null));
  v_e := pg_temp.falla(c_mb, 'authenticated',
    format('update public.solicitudes_titular set estado = ''RESPONDIDA'' where id = %L', st_b));
  r := r || jsonb_build_object('c10_sin_escritura_directa', pg_temp.ok(v_e ->> 's' = '42501', v_e));
  v_e := pg_temp.srv_falla(format('select public.tramitar_solicitud_titular_srv(%L, %L, %L)', st_b, u_op, s_op));
  r := r || jsonb_build_object('c11_tramitar_exige_permiso', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  perform pg_temp.srv(format('select public.tramitar_solicitud_titular_srv(%L, %L, %L)', st_b, u_adm, s_adm));
  perform pg_temp.srv(format('select public.requerir_informacion_titular_srv(%L, %L, %L, %L)', st_b, u_adm, s_adm,
                             'Confírmanos el correo con el que te registraste.'));
  r := r || jsonb_build_object('c12_requerimiento_avisa_al_titular',
    pg_temp.ok((select estado = 'REQUIERE_INFORMACION' and requerida_at is not null from public.solicitudes_titular
                where id = st_b)
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_mb
                           and n.tipo = 'titular.informacion_requerida' and n.entidad_id = st_b::text), null));
  v_e := pg_temp.srv_falla(format('select public.aportar_informacion_titular_srv(%L, %L, %L, ''Soy yo'')', st_b, u_ma, s_ma));
  r := r || jsonb_build_object('c13_solo_el_titular_responde', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  update public.solicitudes_titular set plazo_vence = v_hoy + 1, alerta_desde = v_hoy where id = st_b;
  perform pg_temp.srv(format('select public.aportar_informacion_titular_srv(%L, %L, %L, %L)', st_b, u_mb, s_mb,
                             'Es humo.e3c.medio.b@amo.test'));
  r := r || jsonb_build_object('c14_informacion_reinicia_el_plazo',
    pg_temp.ok((select estado = 'EN_TRAMITE' and plazo_vence = private.sumar_dias_habiles(v_hoy, 15)
                       and informacion_aportada is not null
                from public.solicitudes_titular where id = st_b)
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_adm
                           and n.tipo = 'cola.solicitud_titular_informacion' and n.entidad_id = st_b::text), null));
  v_j := pg_temp.srv(format('select to_jsonb(public.prorrogar_solicitud_titular_srv(%L, %L, %L, %L))', st_b, u_adm, s_adm,
                            'Revisamos el historial contable del medio.'));
  r := r || jsonb_build_object('c15_prorroga_ocho_dias_habiles',
    pg_temp.ok((v_j #>> '{}')::date = private.sumar_dias_habiles(private.sumar_dias_habiles(v_hoy, 15), 8)
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_mb
                           and n.tipo = 'titular.solicitud_prorrogada' and n.entidad_id = st_b::text), v_j));
  v_e := pg_temp.srv_falla(format('select public.prorrogar_solicitud_titular_srv(%L, %L, %L, %L)', st_b, u_adm, s_adm,
                                  'Una segunda prórroga no procede.'));
  r := r || jsonb_build_object('c16_una_sola_prorroga', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA'));

  v_j := pg_temp.como(c_mb, 'authenticated', 'select public.datos_titular()');
  r := r || jsonb_build_object('c17_exportacion_propia',
    pg_temp.ok(v_j -> 'perfil' ->> 'correo' = 'humo.e3c.medio.b@amo.test' and v_j -> 'medio' ->> 'nombre' = 'Medio Humo E3C B'
               and jsonb_array_length(v_j -> 'solicitudes') = 1 and not (v_j::text like '%v1:aaaa%')
               and exists (select 1 from public.bitacora b where b.accion = 'EXPORTAR' and b.entidad = 'perfiles'
                           and b.entidad_id = u_mb::text and b.actor_id = u_mb), v_j));
  v_e := pg_temp.falla(c_ma, 'authenticated', format('select public.datos_titular(%L)', u_mb));
  r := r || jsonb_build_object('c18_exportacion_ajena_bloqueada', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  v_j := pg_temp.como(c_adm, 'authenticated', format('select public.datos_titular(%L)', u_mb));
  r := r || jsonb_build_object('c19_exportacion_para_atender_consulta',
    pg_temp.ok(v_j -> 'perfil' ->> 'nombre' = 'Berta Medio', v_j));

  -- Supresión: B sin historial (se borra todo), C con historial terminado (se anonimiza), A con asignación en curso.
  v_j := pg_temp.srv(format('select public.suprimir_titular_srv(%L, %L, %L)', st_b, u_adm, s_adm));
  r := r || jsonb_build_object('c20_simulacion_sin_historial',
    pg_temp.ok(v_j ->> 'medio' = 'BORRAR' and jsonb_array_length(v_j -> 'bloqueos') = 0 and (v_j ->> 'simulacion')::boolean
               and exists (select 1 from public.perfiles where id = u_mb), v_j));
  v_e := pg_temp.srv_falla(format('select public.suprimir_titular_srv(%L, %L, %L, false)', st_b, u_adm, s_adm));
  r := r || jsonb_build_object('c21_ejecutar_exige_respuesta', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'Responde%'));
  v_e := pg_temp.srv_falla(format('select public.responder_solicitud_titular_srv(%L, %L, %L, ''PROCEDE'', ''Listo'')',
                                  st_b, u_adm, s_adm));
  r := r || jsonb_build_object('c22_respuesta_minima', pg_temp.es(v_e, 'AMO_MOTIVO_REQUERIDO'));
  perform pg_temp.srv(format('select public.responder_solicitud_titular_srv(%L, %L, %L, ''PROCEDE'', %L)', st_b, u_adm, s_adm,
                             'Procede: suprimiremos tu cuenta y los datos de tu medio.'));
  r := r || jsonb_build_object('c23_respuesta_avisa',
    pg_temp.ok(exists (select 1 from public.notificaciones n where n.usuario_id = u_mb
                       and n.tipo = 'titular.solicitud_respondida' and n.mensaje like '%procede%'), null));
  v_j := pg_temp.srv(format('select public.suprimir_titular_srv(%L, %L, %L, false)', st_b, u_adm, s_adm));
  r := r || jsonb_build_object('c24_supresion_sin_historial',
    pg_temp.ok(not exists (select 1 from auth.users where id = u_mb) and not exists (select 1 from public.perfiles where id = u_mb)
               and not exists (select 1 from public.medios where id = me_b)
               and not exists (select 1 from public.notificaciones where usuario_id = u_mb)
               and (select perfil_id is null and supresion_ejecutada_at is not null and medio_id is null
                    from public.solicitudes_titular where id = st_b)
               and exists (select 1 from public.bitacora b where b.accion = 'BORRADO_DEFINITIVO' and b.entidad_id = u_mb::text)
               and v_j -> 'archivos' @> jsonb_build_array(jsonb_build_object('bucket', 'documentos',
                                                                               'prefijo', 'medio/' || me_b || '/')), v_j));

  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''REVOCATORIA'', %L)', u_mc, s_mc,
                            'Revoco la autorización de tratamiento.'));
  st_c := (v_j #>> '{}')::uuid;
  perform pg_temp.srv(format('select public.responder_solicitud_titular_srv(%L, %L, %L, ''PROCEDE_PARCIAL'', %L)', st_c, u_adm,
                             s_adm, 'Procede en parte: conservamos los datos tributarios por ley.'));
  v_j := pg_temp.srv(format('select public.suprimir_titular_srv(%L, %L, %L, false)', st_c, u_adm, s_adm));
  r := r || jsonb_build_object('c25_supresion_con_historial_anonimiza',
    pg_temp.ok(v_j ->> 'medio' = 'ANONIMIZAR' and not exists (select 1 from public.perfiles where id = u_mc)
               and (select deleted_at is not null from public.medios where id = me_c)
               and (select celular is null and email_contacto is null and direccion is null and datos_pago_cifrados is null
                           and metodo_pago is null and titular_nombre is not null and numero_documento_cifrado is not null
                    from public.medios_privado where medio_id = me_c)
               and not exists (select 1 from public.documentos_medio where medio_id = me_c
                               and tipo in ('PRUEBA_VIDA', 'CERT_BANCARIA'))
               and exists (select 1 from public.documentos_medio where medio_id = me_c and tipo = 'CEDULA_FRENTE')
               and (select count(*) from public.asignaciones where medio_id = me_c) = 3
               and jsonb_array_length(v_j -> 'archivos') = 2, v_j));

  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''SUPRESION'', %L)', u_ma, s_ma,
                            'Borren mis datos por favor.'));
  st_a := (v_j #>> '{}')::uuid;
  v_j := pg_temp.srv(format('select public.suprimir_titular_srv(%L, %L, %L)', st_a, u_adm, s_adm));
  r := r || jsonb_build_object('c26_bloqueo_por_negocio_en_curso',
    pg_temp.ok(jsonb_array_length(v_j -> 'bloqueos') = 1 and v_j ->> 'medio' = 'ANONIMIZAR', v_j));
  perform pg_temp.srv(format('select public.responder_solicitud_titular_srv(%L, %L, %L, ''PROCEDE'', %L)', st_a, u_adm, s_adm,
                             'Procede cuando termines la asignación en curso.'));
  v_e := pg_temp.srv_falla(format('select public.suprimir_titular_srv(%L, %L, %L, false)', st_a, u_adm, s_adm));
  r := r || jsonb_build_object('c27_no_se_ejecuta_con_bloqueos',
    pg_temp.ok(v_e ->> 'e' = 'AMO_SUPRESION_BLOQUEADA' and exists (select 1 from public.perfiles where id = u_ma), v_e));

  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''SUPRESION'', %L)', u_an, s_an,
                            'Supriman mis datos de contacto.'));
  st_an := (v_j #>> '{}')::uuid;
  perform pg_temp.srv(format('select public.responder_solicitud_titular_srv(%L, %L, %L, ''PROCEDE'', %L)', st_an, u_adm, s_adm,
                             'Procede: suprimimos tu cuenta y el contacto de la empresa.'));
  v_j := pg_temp.srv(format('select public.suprimir_titular_srv(%L, %L, %L, false)', st_an, u_adm, s_adm));
  r := r || jsonb_build_object('c28_supresion_anunciante_solo_la_persona',
    pg_temp.ok(v_j ->> 'contacto_empresa' = 'BORRAR' and not exists (select 1 from public.perfiles where id = u_an)
               and exists (select 1 from public.anunciantes where id = an_v and deleted_at is null)
               and (select contacto_email is null from public.anunciantes_privado where anunciante_id = an_v)
               and (select count(*) from public.campanas where anunciante_id = an_v) >= 3, v_j));
  v_e := pg_temp.srv_falla(format('select public.suprimir_titular_srv(%L, %L, %L, false)', st_an, u_adm, s_adm));
  r := r || jsonb_build_object('c29_supresion_una_vez', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA'));

  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''RECTIFICACION'', %L)', u_ma, s_ma,
                            'Mi celular está mal escrito.'));
  v_id := (v_j #>> '{}')::uuid;
  perform pg_temp.srv(format('select public.desistir_solicitud_titular_srv(%L, %L, %L)', v_id, u_ma, s_ma));
  r := r || jsonb_build_object('c30_desistimiento_propio',
    (select estado = 'DESISTIDA' and desistida_at is not null from public.solicitudes_titular where id = v_id));
  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''ACTUALIZACION'', %L)', u_ma, s_ma,
                            'Actualicen mi dirección por favor.'));
  st_viejo := (v_j #>> '{}')::uuid;
  perform pg_temp.srv(format('select public.requerir_informacion_titular_srv(%L, %L, %L, %L)', st_viejo, u_adm, s_adm,
                             'Envíanos la nueva dirección completa.'));
  update public.solicitudes_titular set requerida_at = now() - interval '3 months' where id = st_viejo;
  v_j := pg_temp.srv(format('select public.radicar_solicitud_titular_srv(%L, %L, ''PRUEBA_AUTORIZACION'', %L)', u_ma, s_ma,
                            'Muéstrenme la autorización que di.'));
  v_id2 := (v_j #>> '{}')::uuid;
  update public.solicitudes_titular set alerta_desde = v_hoy, plazo_vence = v_hoy where id = v_id2;
  v_n := private.vencer_solicitudes_titular();
  r := r || jsonb_build_object('c31_cron_desiste_y_avisa_por_vencer',
    pg_temp.ok((select estado = 'DESISTIDA' from public.solicitudes_titular where id = st_viejo)
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_ma
                           and n.tipo = 'titular.solicitud_desistida' and n.entidad_id = st_viejo::text)
               and exists (select 1 from public.notificaciones n where n.usuario_id = u_adm
                           and n.tipo = 'cola.solicitud_titular_por_vencer' and n.entidad_id = v_id2::text
                           and n.mensaje like '%vence hoy%'), to_jsonb(v_n)));
  v_e := pg_temp.srv_falla(format('select public.suprimir_titular_srv(%L, %L, %L)', st_cons, u_adm, s_adm));
  r := r || jsonb_build_object('c32_supresion_solo_de_supresion_o_revocatoria', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA'));

  -- ── (d) Correo apagado (NOT-004) ───────────────────────────────────────────────────────────────────────────────
  v_n := private.notificar(array[u_ma], 'oferta.publicada', jsonb_build_object('oferta', 'Apagado'), 'ofertas', 'humo-d1', null);
  r := r || jsonb_build_object('d01_apagado_no_encola',
    pg_temp.ok(v_n = 1 and not exists (select 1 from private.correos_salientes q join public.notificaciones n
                                       on n.id = q.notificacion_id where n.entidad_id = 'humo-d1'), to_jsonb(v_n)));
  update public.configuracion set valor = 'true' where clave = 'correo.habilitado';
  v_n := private.notificar(array[u_ma, u_dm], 'oferta.publicada', jsonb_build_object('oferta', 'Encendido <b>'), 'ofertas',
                           'humo-d2', null);
  r := r || jsonb_build_object('d02_encendido_encola_sin_demo',
    pg_temp.ok(v_n = 2 and (select count(*) from private.correos_salientes q join public.notificaciones n
                            on n.id = q.notificacion_id where n.entidad_id = 'humo-d2') = 1
               and (select q.datos ->> 'oferta' = 'Encendido <b>' and q.usuario_id = u_ma and q.estado = 'PENDIENTE'
                    from private.correos_salientes q join public.notificaciones n on n.id = q.notificacion_id
                    where n.entidad_id = 'humo-d2'), to_jsonb(v_n)));
  update public.perfiles set preferencias = jsonb_build_object('correo', jsonb_build_object('silenciadas',
                                                                 jsonb_build_array('ofertas', 'seguridad')))
  where id = u_ma;
  perform private.notificar(array[u_ma], 'oferta.publicada', '{}', 'ofertas', 'humo-d3', null);
  perform private.notificar(array[u_ma], 'seguridad.alerta_pais_inusual', '{}', 'perfiles', 'humo-d3b', null);
  perform private.notificar(array[u_ma], 'cola.disputa', '{}', 'disputas', 'humo-d3c', null);
  r := r || jsonb_build_object('d03_silencio_por_categoria_salvo_seguridad_y_colas_inactivas',
    pg_temp.ok(not exists (select 1 from private.correos_salientes q join public.notificaciones n on n.id = q.notificacion_id
                           where n.entidad_id in ('humo-d3', 'humo-d3c'))
               and exists (select 1 from private.correos_salientes q join public.notificaciones n on n.id = q.notificacion_id
                           where n.entidad_id = 'humo-d3b'), null));
  update public.perfiles set preferencias = '{}' where id = u_ma;
  r := r || jsonb_build_object('d04_reclamar_exige_contexto_confiable',
    pg_temp.ok(pg_temp.srv('select count(*) from public.reclamar_correos_srv(50)')::int = 0, null));
  perform set_config('amo.ctx_confiable', 'si', true);
  update private.correos_salientes set proximo_intento_at = now() + interval '1 day'
  where notificacion_id not in (select n.id from public.notificaciones n where n.entidad_id in ('humo-d2', 'humo-d3b'));
  v_j := pg_temp.srv('select coalesce(jsonb_agg(to_jsonb(x) order by x.correo_id), ''[]'') from public.reclamar_correos_srv(50) x');
  r := r || jsonb_build_object('d05_reclamo_con_turno',
    pg_temp.ok(jsonb_array_length(v_j) = 2 and v_j -> 0 ->> 'destinatario' = 'humo.e3c.medio.a@amo.test'
               and (v_j -> 0 ->> 'intento')::int = 1 and v_j -> 0 ->> 'asunto' is not null
               and (select count(*) from private.correos_salientes where estado = 'ENVIANDO' and bloqueado_hasta > now()) = 2,
               v_j));
  r := r || jsonb_build_object('d06_turno_vigente_no_se_reclama_otra_vez',
    pg_temp.ok(pg_temp.srv('select count(*) from public.reclamar_correos_srv(50)')::int = 0, null));
  v_big := (v_j -> 0 ->> 'correo_id')::bigint;
  r := r || jsonb_build_object('d07_turno_viejo_ignorado',
    pg_temp.ok(pg_temp.srv(format('select public.registrar_envio_correo_srv(%s, 7::smallint, ''ENVIADO'', ''x'')', v_big))
               #>> '{}' = 'IGNORADO', null));
  v_txt := pg_temp.srv(format('select public.registrar_envio_correo_srv(%s, 1::smallint, ''ENVIADO'', ''re_123'')', v_big))
           #>> '{}';
  r := r || jsonb_build_object('d08_enviado_registra_fecha',
    pg_temp.ok(v_txt = 'ENVIADO' and (select n.enviada_email_at is not null and q.proveedor_id = 're_123'
                                      from private.correos_salientes q join public.notificaciones n on n.id = q.notificacion_id
                                      where q.id = v_big), to_jsonb(v_txt)));
  v_big := (v_j -> 1 ->> 'correo_id')::bigint;
  v_txt := pg_temp.srv(format('select public.registrar_envio_correo_srv(%s, 1::smallint, ''REINTENTO'', null, ''503'')', v_big))
           #>> '{}';
  r := r || jsonb_build_object('d09_reintento_con_espera',
    pg_temp.ok(v_txt = 'REINTENTO' and (select estado = 'REINTENTO' and proximo_intento_at > now()
                                         and proximo_intento_at <= now() + interval '2 minutes'
                                        from private.correos_salientes where id = v_big), to_jsonb(v_txt)));
  update private.correos_salientes set estado = 'ENVIANDO', intentos = 5 where id = v_big;
  v_txt := pg_temp.srv(format('select public.registrar_envio_correo_srv(%s, 5::smallint, ''REINTENTO'', null, ''503'')', v_big))
           #>> '{}';
  r := r || jsonb_build_object('d10_agotados_los_intentos_falla',
    pg_temp.ok(v_txt = 'FALLIDO' and (select estado = 'FALLIDO' from private.correos_salientes where id = v_big),
               to_jsonb(v_txt)));
  perform set_config('amo.ctx_confiable', '', true);
  r := r || jsonb_build_object('d11_despachador_solo_servidor',
    not has_function_privilege('authenticated', 'public.reclamar_correos_srv(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.registrar_envio_correo_srv(bigint, smallint, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'private.disparar_envio_correos()', 'execute')
    and not has_table_privilege('authenticated', 'private.correos_salientes', 'select'));
  r := r || jsonb_build_object('d12_jobs',
    pg_temp.ok((select not active from cron.job where jobname = 'amo_correos')
               and (select active and schedule = '10 13 * * *' from cron.job where jobname = 'amo_privacidad'), null));
  r := r || jsonb_build_object('d13_plantillas_de_correo',
    pg_temp.ok(not exists (select 1 from public.plantillas_notificacion a where a.canal = 'APP'
                           and not exists (select 1 from public.plantillas_notificacion e
                                           where e.canal = 'EMAIL' and e.clave = a.clave))
               and not exists (select 1 from public.plantillas_notificacion where canal = 'EMAIL' and clave like 'cola.%' and activa)
               and not exists (select 1 from public.plantillas_notificacion where canal = 'EMAIL' and asunto is null), null));
  r := r || jsonb_build_object('d14_categorias',
    pg_temp.ok(private.categoria_notificacion('titular.solicitud_respondida') = 'privacidad'
               and private.categoria_notificacion('campana.gestion_asistida') = 'ofertas'
               and private.categoria_notificacion('desconocida.x') = 'otras'
               and not private.correo_silenciado(u_ma, 'titular.solicitud_respondida'), null));
  update public.configuracion set valor = 'false' where clave = 'correo.habilitado';

  -- ── (e) Aviso en vivo mínimo (NOT-007) ─────────────────────────────────────────────────────────────────────────
  perform private.notificar(array[u_ma], 'oferta.publicada', jsonb_build_object('oferta', 'En vivo'), 'ofertas', 'humo-e1', null);
  select m.payload into v_j from realtime.messages m
  where m.topic = 'usuario:' || u_ma and m.event = 'notificacion' order by m.inserted_at desc, m.id desc limit 1;
  r := r || jsonb_build_object('e01_aviso_en_vivo_sin_contenido',
    pg_temp.ok(v_j ? 'no_leidas' and v_j ? 'id' and not (v_j ? 'titulo') and not (v_j::text like '%En vivo%'), v_j));

  -- ── (g) Estructura ─────────────────────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('g01_permiso_privacidad',
    pg_temp.ok((select array_agg(r2.clave order by r2.clave) from public.rol_permisos rp join public.roles r2 on r2.id = rp.rol_id
                where rp.permiso_clave = 'privacidad.gestionar' and r2.es_sistema) = array['ADMIN', 'SUPERADMIN']::text[], null));
  r := r || jsonb_build_object('g02_lecturas_para_authenticated',
    has_function_privilege('authenticated', 'public.datos_titular(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.mi_reputacion()', 'execute')
    and has_function_privilege('authenticated', 'public.medios_cerca_tope()', 'execute')
    and not has_function_privilege('anon', 'public.datos_titular(uuid)', 'execute'));
  r := r || jsonb_build_object('g03_transiciones_sin_cambio', (select count(*) = 146 from private.transiciones_estado));
  r := r || jsonb_build_object('g04_calendario_privado',
    not has_table_privilege('authenticated', 'private.festivos', 'select')
    and not has_table_privilege('service_role', 'private.festivos', 'select'));
  select string_agg(x.t, ', ') into v_txt from (
    select n.nspname || '.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
    except select jsonb_array_elements_text(private.tablas_limpieza() -> 'conservar')
    except select jsonb_array_elements_text(private.tablas_limpieza() -> 'borrar')) x;
  r := r || jsonb_build_object('g05_toda_tabla_clasificada_para_la_limpieza', pg_temp.ok(v_txt is null, to_jsonb(v_txt)));
  select string_agg(x.t, ', ') into v_txt from (
    select jsonb_array_elements_text(private.tablas_limpieza() -> 'conservar') as t
    union all select jsonb_array_elements_text(private.tablas_limpieza() -> 'borrar')
    except select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')) x;
  r := r || jsonb_build_object('g06_clasificacion_sin_tablas_inexistentes', pg_temp.ok(v_txt is null, to_jsonb(v_txt)));

  -- ── (f) Limpieza final (al final: deja la base vacía dentro de la transacción) ────────────────────────────────
  begin
    perform private.limpiar_pruebas(array[u_adm], '{}');
    v_txt := 'NO FALLÓ';
  exception when others then v_txt := sqlerrm;
  end;
  r := r || jsonb_build_object('f01_limpieza_exige_modo_purga', pg_temp.ok(v_txt = 'AMO_NO_AUTORIZADO', to_jsonb(v_txt)));
  perform set_config('amo.modo_carga', 'on', true);
  perform set_config('amo.purga', 'on', true);
  begin
    perform private.limpiar_pruebas(array[u_adm], '{}');
    v_txt := 'NO FALLÓ';
  exception when others then v_txt := sqlerrm;
  end;
  r := r || jsonb_build_object('f02_conserva_solo_superadministradores', pg_temp.ok(v_txt = 'AMO_NO_AUTORIZADO', to_jsonb(v_txt)));
  v_m := (select count(*) from public.perfiles p join public.roles r2 on r2.id = p.rol_id
          where r2.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null);
  if v_m = 0 then
    r := r || jsonb_build_object('f03_limpieza_completa', '"sin superadministradores activos en la base"'::jsonb);
  else
    v_j := private.limpiar_pruebas((select array_agg(p.id) from public.perfiles p join public.roles r2 on r2.id = p.rol_id
                                    where r2.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null), '{}');
    v_txt := null;
    declare v_t text; v_c bigint;
    begin
      for v_t in select jsonb_array_elements_text(private.tablas_limpieza() -> 'borrar') loop
        execute format('select count(*) from %s', v_t) into v_c;
        if v_c > (case when v_t = 'public.bitacora' then 1 else 0 end) then v_txt := concat_ws(', ', v_txt, v_t || '=' || v_c); end if;
      end loop;
    end;
    r := r || jsonb_build_object('f03_limpieza_completa',
      pg_temp.ok(v_txt is null and (select count(*) from public.perfiles) = v_m and (select count(*) from auth.users) = v_m
                 and (select count(*) from public.bitacora) = 1 and (select count(*) from public.medios) = 0
                 and (v_j ->> 'public.solicitudes_titular')::int >= 5, jsonb_build_object('quedan', v_txt, 'conteo', v_j)));
  end if;
  perform set_config('amo.purga', '', true);
  perform set_config('amo.modo_carga', '', true);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
