-- Pruebas de humo de 20261023171316_e3_validacion (fase 4): validación atómica de evidencias con plazo de recarga
-- (ADM-007), validación de métricas con alertas, constancia y corrección auditada (ADM-008), alertas por cuenta y por
-- impresiones, persistentes e invisibles para medio y anunciante (INT-003, INT-004), verificación como puerta a pago y
-- constancia manual de permanencia (ADM-009, INT-006), cancelación con causa y suspensión atómica (ADM-010), colas del
-- equipo, suspensión y reactivación del medio con lo que tiene en curso (ADM-002, D73), disputas de cada parte y reclamo
-- de una vencida sin cupo (ADM-011), hilo con su parte, notas internas y avisos, y resolución con cada destino:
-- restaurar, verificar, reabrir la vencida con cupo y plazo, cancelar con causa y descartar (ADM-012), métricas durante
-- la disputa (D72), oferta que no cierra mientras una vencida pueda reclamarse (D70) y configuración nueva (D74).
-- Se ejecuta como owner (pnpm db:suites) en una transacción que SIEMPRE se revierte. Fija la configuración que usa
-- (umbral de 30.000, factor 3, historial mínimo 5, múltiplo 2 en Instagram, plazos de 24, 48 y 72 h…) y aísla la
-- elegibilidad con una categoría propia: no depende de los datos demo (las colas también listan lo de la demo, así que
-- solo se comparan las filas de la suite). Los roles internos (ADMIN, OPERACIONES, FINANZAS) entran con aal2.
-- El reloj (`amo.reloj`) avanza por la ejecución: T = inicio de la transacción. Cada prueba deja `true` si pasa o lo
-- observado si falla.
begin;

-- Ejecuta p_sql con esos claims y ese rol y devuelve su resultado como jsonb (primera columna de la primera fila;
-- null si no hay filas o el valor es nulo).
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

-- Ejecuta p_sql con esos claims y ese rol y SIEMPRE revierte lo que haga: devuelve el error observado
-- ({e: mensaje, d: detalle, h: hint, s: sqlstate, c: restricción}) o {e: 'NO FALLÓ'}.
create function pg_temp.falla(p_claims text, p_rol text, p_sql text) returns jsonb
language plpgsql as $$
declare v_e text; v_d text; v_h text; v_s text; v_c text;
begin
  begin
    perform set_config('request.jwt.claims', p_claims, true);
    execute format('set local role %I', p_rol);
    execute p_sql;
    raise exception using errcode = 'P0001', message = 'NO FALLÓ';
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint,
                            v_s = returned_sqlstate, v_c = constraint_name;
  end;
  return jsonb_strip_nulls(jsonb_build_object('e', v_e, 'd', nullif(v_d, ''), 'h', nullif(v_h, ''), 's', v_s,
                                              'c', nullif(v_c, '')));
end $$;

-- Ejecuta una escritura (sin RETURNING) con esos claims y ese rol y devuelve cuántas filas tocó.
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

-- Como el servidor (service_role).
create function pg_temp.srv(p_sql text) returns jsonb
language sql as $$ select pg_temp.como('{"role": "service_role"}', 'service_role', p_sql) $$;
create function pg_temp.srv_falla(p_sql text) returns jsonb
language sql as $$ select pg_temp.falla('{"role": "service_role"}', 'service_role', p_sql) $$;

-- `true` si el error observado tiene ese mensaje y, si se indican, ese detalle y ese hint; si no, lo observado.
create function pg_temp.es(p_obs jsonb, p_e text, p_d text default null, p_h text default null) returns jsonb
language sql as $$
  select case when p_obs ->> 'e' = p_e and (p_d is null or p_obs ->> 'd' = p_d) and (p_h is null or p_obs ->> 'h' = p_h)
              then 'true'::jsonb else p_obs end $$;

-- `true` si el error observado tiene ese sqlstate y, si se indica, esa restricción; si no, lo observado.
create function pg_temp.es_estado(p_obs jsonb, p_s text, p_c text default null) returns jsonb
language sql as $$
  select case when p_obs ->> 's' = p_s and (p_c is null or p_obs ->> 'c' = p_c) then 'true'::jsonb else p_obs end $$;

do $humo$
declare
  r jsonb := '{}';
  v_e jsonb; v_e2 jsonb; v_e3 jsonb; v_j jsonb; v_k jsonb; v_res jsonb;
  v_n bigint; v_m bigint; v_p bigint; v_q bigint;
  v_num numeric; v_num2 numeric; v_camp numeric; v_monto numeric;
  v_ok boolean; v_ok2 boolean;
  v_ids uuid[];
  v_txt text; v_txt2 text;
  t0 constant timestamptz := now();
  -- usuarios y sesiones
  u_adm constant uuid := '00000000-0000-4000-a000-0000000f4001';   -- ADMIN
  u_ope constant uuid := '00000000-0000-4000-a000-0000000f4002';   -- OPERACIONES (sin metricas.editar_validadas)
  u_fin constant uuid := '00000000-0000-4000-a000-0000000f4003';   -- FINANZAS (ve, no decide)
  u_an constant uuid := '00000000-0000-4000-a000-0000000f4004';    -- ANUNCIANTE de la empresa de las ofertas
  u_ao constant uuid := '00000000-0000-4000-a000-0000000f4005';    -- ANUNCIANTE de otra empresa
  u_ma constant uuid := '00000000-0000-4000-a000-0000000f4006';    -- MEDIO A (dos cuentas de Instagram)
  u_mb constant uuid := '00000000-0000-4000-a000-0000000f4007';    -- MEDIO B
  u_mc constant uuid := '00000000-0000-4000-a000-0000000f4008';    -- MEDIO C (se suspende por fraude)
  u_md constant uuid := '00000000-0000-4000-a000-0000000f4009';    -- MEDIO D (suspensión y reactivación)
  u_gs constant uuid := '00000000-0000-4000-a000-0000000f400a';    -- rol propio: cancela pero no suspende
  s_adm constant uuid := '00000000-0000-4000-b000-0000000f4001';
  s_ope constant uuid := '00000000-0000-4000-b000-0000000f4002';
  s_fin constant uuid := '00000000-0000-4000-b000-0000000f4003';
  s_an constant uuid := '00000000-0000-4000-b000-0000000f4004';
  s_ao constant uuid := '00000000-0000-4000-b000-0000000f4005';
  s_ma constant uuid := '00000000-0000-4000-b000-0000000f4006';
  s_mb constant uuid := '00000000-0000-4000-b000-0000000f4007';
  s_mc constant uuid := '00000000-0000-4000-b000-0000000f4008';
  s_md constant uuid := '00000000-0000-4000-b000-0000000f4009';
  s_gs constant uuid := '00000000-0000-4000-b000-0000000f400a';
  rol_gs constant uuid := '00000000-0000-4000-a000-00000000f4f1';
  an_v constant uuid := '00000000-0000-4000-c000-0000000f4001';
  an_o constant uuid := '00000000-0000-4000-c000-0000000f4002';
  me_a constant uuid := '00000000-0000-4000-d000-0000000f4001';
  me_b constant uuid := '00000000-0000-4000-d000-0000000f4002';
  me_c constant uuid := '00000000-0000-4000-d000-0000000f4003';
  me_d constant uuid := '00000000-0000-4000-d000-0000000f4004';
  cu_a1 constant uuid := '00000000-0000-4000-e000-0000000f4001';  -- Instagram 40.000 (límite de alcance 80.000)
  cu_a2 constant uuid := '00000000-0000-4000-e000-0000000f4002';  -- Instagram 45.000, sin historial
  cu_b constant uuid := '00000000-0000-4000-e000-0000000f4003';
  cu_c constant uuid := '00000000-0000-4000-e000-0000000f4004';
  cu_d constant uuid := '00000000-0000-4000-e000-0000000f4005';
  cat_h constant uuid := '00000000-0000-4000-f000-0000000f40c1';
  c_v constant uuid := '00000000-0000-4000-f000-0000000f4101';    -- campaña de las ofertas en curso
  c_x constant uuid := '00000000-0000-4000-f000-0000000f4102';    -- campaña que el anunciante cancela con un reclamo abierto
  c_h constant uuid := '00000000-0000-4000-f000-0000000f4103';    -- campaña del historial
  o_ev constant uuid := '00000000-0000-4000-f000-0000000f4201';   -- dos publicaciones, corte H24 (evidencias)
  o_rc constant uuid := '00000000-0000-4000-f000-0000000f4202';   -- ventana que cierra en T+2h (recarga tras el rechazo)
  o_al constant uuid := '00000000-0000-4000-f000-0000000f4203';   -- H24 y D7, varios cupos por medio (alertas)
  o_vf constant uuid := '00000000-0000-4000-f000-0000000f4204';   -- H24 (verificación)
  o_cn constant uuid := '00000000-0000-4000-f000-0000000f4205';   -- H24 (cancelación, disputas)
  o_vc constant uuid := '00000000-0000-4000-f000-0000000f4206';   -- vence en T+2h: reclamo que prospera
  o_vz constant uuid := '00000000-0000-4000-f000-0000000f4207';   -- vence en T+2h: nadie reclama, la oferta cierra
  o_dp constant uuid := '00000000-0000-4000-f000-0000000f4208';   -- H24 y D7 (métricas durante la disputa)
  o_vx constant uuid := '00000000-0000-4000-f000-0000000f4209';   -- vence en T+2h en la campaña que se cancela
  o_h constant uuid := '00000000-0000-4000-f000-0000000f4210';    -- historial (cerrada)
  l_lq constant uuid := '00000000-0000-4000-f000-0000000f4401';
  l_pg constant uuid := '00000000-0000-4000-f000-0000000f4402';
  h1 constant uuid := '00000000-0000-4000-9000-0000000f4301';     -- historial de cu_a1 (5 H24 y 4 D7 aprobadas)
  h2 constant uuid := '00000000-0000-4000-9000-0000000f4302';
  h3 constant uuid := '00000000-0000-4000-9000-0000000f4303';
  h4 constant uuid := '00000000-0000-4000-9000-0000000f4304';
  h5 constant uuid := '00000000-0000-4000-9000-0000000f4305';
  hf constant uuid := '00000000-0000-4000-9000-0000000f4306';     -- cancelada por fraude: no cuenta en el historial
  a_lq constant uuid := '00000000-0000-4000-9000-0000000f4307';   -- LIQUIDADA
  a_pg constant uuid := '00000000-0000-4000-9000-0000000f4308';   -- PAGADA
  a_d3 constant uuid := '00000000-0000-4000-9000-0000000f4309';   -- medio D, VERIFICADA (se liquida suspendido)
  a_d4 constant uuid := '00000000-0000-4000-9000-0000000f4310';   -- medio D, METRICAS_CARGADAS (no se liquida)
  c_adm text; c_ope text; c_fin text; c_an text; c_ao text; c_ma text; c_mb text; c_mc text; c_md text;
  v_mun char(5) := (select m.codigo from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                    where m.activo and d.activo order by m.codigo limit 1);
  v_sector uuid := (select id from public.sectores order by nombre limit 1);
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t
                    where t.formato_id = (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED')
                      and t.franja_id = (select id from public.franjas where clave = 'F1')
                      and t.vigente_desde <= now() and (t.vigente_hasta is null or t.vigente_hasta > now()));
  v_ev text := 'asignacion/';
  -- negocio en curso (se crean durante la prueba)
  a_e1 uuid; a_e2 uuid; a_rc uuid; a_al1 uuid; a_al2 uuid; a_al3 uuid; a_vf uuid; a_cs uuid; a_d2 uuid; a_cf uuid;
  a_d1 uuid; a_dm uuid; a_vc uuid; a_vz uuid; a_de uuid; a_vx uuid;
  p_e1_1 uuid; p_e1_2 uuid; p_e2_1 uuid; p_e2_2 uuid; p_rc uuid; p_al1 uuid; p_al2 uuid; p_al3 uuid; p_vf uuid; p_cf uuid;
  p_d1 uuid; p_dm uuid; p_de uuid; p_d2 uuid; p_vc uuid;
  m_e1_1 uuid; m_e1_2 uuid; m_al1_h uuid; m_al1_d uuid; m_al2_h uuid; m_al2_d uuid; m_al3_h uuid; m_vf_h uuid; m_vf_p uuid;
  m_cf_h uuid; m_dm_h uuid; m_de_h uuid; m_de_d uuid; m_d1_h uuid; m_hf uuid;
  d_p uuid; d_m uuid; d_e uuid; d_v uuid; d_vc uuid; d_vx uuid;
  v_liq uuid;
begin
  -- ── Preparación (owner, modo_carga) ──────────────────────────────────────────────────────────────────────────
  update public.configuracion c set valor = x.valor
  from (values ('medios.umbral_seguidores', '30000'::jsonb), ('medios.reverificacion_dias', '30'),
               ('medios.reverificacion_gracia_dias', '7'), ('comision.porcentaje_global', '0.2'),
               ('comision.visible_para_medio', 'true'), ('precios.redondeo', '100'),
               ('metricas.tolerancia_cortes', '0.02'), ('metricas.plazo_carga_horas', '48'),
               ('metricas.factor_desviacion', '3.0'), ('metricas.minimo_historial', '5'),
               ('metricas.multiplo_alcance_seguidores', '{"FACEBOOK": 3, "INSTAGRAM": 2, "TIKTOK": 20}'),
               ('disputas.plazo_vencida_horas', '72'), ('disputas.plazo_recarga_horas', '24'),
               ('evidencias.plazo_recarga_horas', '24'))
       as x (clave, valor)
  where c.clave = x.clave;

  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo.e3.admin@amo.test'), (u_ope, 'humo.e3.operaciones@amo.test'),
               (u_fin, 'humo.e3.finanzas@amo.test'), (u_an, 'humo.e3.anunciante@amo.test'),
               (u_ao, 'humo.e3.otra@amo.test'), (u_ma, 'humo.e3.medio.a@amo.test'), (u_mb, 'humo.e3.medio.b@amo.test'),
               (u_mc, 'humo.e3.medio.c@amo.test'), (u_md, 'humo.e3.medio.d@amo.test'),
               (u_gs, 'humo.e3.gestor@amo.test')) x (u, e);
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa) values (rol_gs, 'HUMO_E3_GESTOR', 'Humo E3 gestor', 'ADMIN', true);
  insert into public.rol_permisos (rol_id, permiso_clave)
  values (rol_gs, 'asignaciones.gestionar'), (rol_gs, 'asignaciones.ver');
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2,
                                  municipio_codigo, estado_verificacion, verificado_at)
  values (an_v, 'Humo E3 Verificada S.A.S.', 'Humo E3 Verificada', '900777001',
          private.digito_verificacion_nit('900777001'), v_sector, 'CO', v_mun, 'VERIFICADO', now()),
         (an_o, 'Humo E3 Otra S.A.S.', 'Humo E3 Otra', '900777002',
          private.digito_verificacion_nit('900777002'), v_sector, 'CO', v_mun, 'VERIFICADO', now());
  insert into public.categorias (id, nombre, descripcion) values (cat_h, 'Humo E3 Tiple', 'Categoría de la suite');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Humo A', 'PAGINA_NOTICIAS', v_mun, 'VERIFICADO', 1, now()),
         (me_b, 'Medio Humo B', 'CREADOR', v_mun, 'VERIFICADO', 1, now()),
         (me_c, 'Medio Humo C', 'CREADOR', v_mun, 'VERIFICADO', 1, now()),
         (me_d, 'Medio Humo D', 'EMISORA', v_mun, 'VERIFICADO', 1, now());
  insert into public.medio_categorias (medio_id, categoria_id)
  select x.id, cat_h from unnest(array[me_a, me_b, me_c, me_d]) as x (id);
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a1, me_a, 'INSTAGRAM', 'humo_e3_a1', 'https://instagram.com/humo_e3_a1', 40000, true, 'MANUAL', now()),
         (cu_a2, me_a, 'INSTAGRAM', 'humo_e3_a2', 'https://instagram.com/humo_e3_a2', 45000, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo_e3_b', 'https://instagram.com/humo_e3_b', 45000, true, 'MANUAL', now()),
         (cu_c, me_c, 'INSTAGRAM', 'humo_e3_c', 'https://instagram.com/humo_e3_c', 45000, true, 'MANUAL', now()),
         (cu_d, me_d, 'INSTAGRAM', 'humo_e3_d', 'https://instagram.com/humo_e3_d', 45000, true, 'MANUAL', now());
  update public.perfiles p set rol_id = (select id from public.roles where clave = x.rol), estado = 'ACTIVO',
         debe_cambiar_password = false, nombre = x.nombre,
         anunciante_id = case when x.rol = 'ANUNCIANTE' then x.org end,
         medio_id = case when x.rol = 'MEDIO' then x.org end
  from (values (u_adm, 'ADMIN', 'Ana Administradora', null::uuid), (u_ope, 'OPERACIONES', 'Óscar Operaciones', null),
               (u_fin, 'FINANZAS', 'Fabio Finanzas', null), (u_an, 'ANUNCIANTE', 'Andrea Anunciante', an_v),
               (u_ao, 'ANUNCIANTE', 'Omar Otra Marca', an_o), (u_ma, 'MEDIO', 'Mario Medio', me_a),
               (u_mb, 'MEDIO', 'Berta Medio', me_b), (u_mc, 'MEDIO', 'Carlos Medio', me_c),
               (u_md, 'MEDIO', 'Diana Medio', me_d), (u_gs, 'HUMO_E3_GESTOR', 'Gustavo Gestor', null))
       as x (id, rol, nombre, org)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  select x.s, x.u, now(), now(), x.aal::auth.aal_level
  from (values (s_adm, u_adm, 'aal2'), (s_ope, u_ope, 'aal2'), (s_fin, u_fin, 'aal2'), (s_an, u_an, 'aal1'),
               (s_ao, u_ao, 'aal1'), (s_ma, u_ma, 'aal1'), (s_mb, u_mb, 'aal1'), (s_mc, u_mc, 'aal1'),
               (s_md, u_md, 'aal1'), (s_gs, u_gs, 'aal2')) as x (s, u, aal);

  -- Campañas: c_v y c_x activas, c_h del historial.
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_v, an_v, 'Campaña Humo E3', 'Marca Tiple', private.hoy() - 11, private.hoy() + 40, 50000000, 'ACTIVA', now()),
         (c_x, an_v, 'Campaña Humo E3 corta', 'Marca Tiple', private.hoy() - 11, private.hoy() + 40, 10000000, 'ACTIVA', now()),
         (c_h, an_v, 'Campaña Humo E3 historial', 'Marca Tiple', private.hoy() - 70, private.hoy() - 10, 50000000,
          'FINALIZADA', now() - interval '70 days');
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, publicaciones_por_medio,
                              permite_multiples_cupos, presupuesto_maximo, tope_porcentaje_por_medio, categorias_objetivo,
                              cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion, instrucciones,
                              restricciones, estado, enviada_at, publicada_at)
  select x.id, x.campana, an_v, x.titulo, f_post, 'INSTAGRAM', x.pubs, x.multiples, 5000000, 0.15, array[cat_h],
         x.cortes::public.corte_metrica[], now() + x.ini, now() + x.fin, now() + x.lim,
         'Publica la pieza con el copy tal cual.', 'No edites el copy.', x.estado::public.oferta_estado,
         now() + x.ini - interval '2 days', now() + x.ini - interval '2 days'
  from (values
    (o_ev, c_v, 'Post en dos publicaciones', 2, false, '{H24}', interval '-10 days', interval '20 days', interval '1 hour', 'PUBLICADA'),
    (o_rc, c_v, 'Post de ventana corta', 1, false, '{H24}', interval '-10 days', interval '2 hours', interval '1 hour', 'PUBLICADA'),
    (o_al, c_v, 'Post de alertas', 1, true, '{H24,D7}', interval '-10 days', interval '20 days', interval '1 hour', 'PUBLICADA'),
    (o_vf, c_v, 'Post para verificar', 1, false, '{H24}', interval '-10 days', interval '20 days', interval '1 hour', 'PUBLICADA'),
    (o_cn, c_v, 'Post para cancelar', 1, false, '{H24}', interval '-10 days', interval '20 days', interval '1 hour', 'PUBLICADA'),
    (o_vc, c_v, 'Post que vence', 1, false, '{H24}', interval '-10 days', interval '2 hours', interval '1 hour', 'PUBLICADA'),
    (o_vz, c_v, 'Post que vence sin reclamo', 1, false, '{H24}', interval '-10 days', interval '2 hours', interval '1 hour', 'PUBLICADA'),
    (o_dp, c_v, 'Post de dos cortes', 1, false, '{H24,D7}', interval '-10 days', interval '20 days', interval '1 hour', 'PUBLICADA'),
    (o_vx, c_x, 'Post de la campaña corta', 1, false, '{H24}', interval '-10 days', interval '2 hours', interval '1 hour', 'PUBLICADA'),
    (o_h, c_h, 'Post del historial', 1, true, '{H24,D7}', interval '-60 days', interval '-20 days', interval '-61 days', 'CERRADA'))
    as x (id, campana, titulo, pubs, multiples, cortes, ini, fin, lim, estado);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales)
  values (o_ev, fr1, 3), (o_rc, fr1, 2), (o_al, fr1, 5), (o_vf, fr1, 4), (o_cn, fr1, 4), (o_vc, fr1, 2), (o_vz, fr1, 2),
         (o_dp, fr1, 2), (o_vx, fr1, 2), (o_h, fr1, 20);
  update public.ofertas o set cupos_totales = (select sum(oc.cupos_totales) from public.oferta_cupos oc where oc.oferta_id = o.id)
  where o.campana_id in (c_v, c_x, c_h);
  -- Versión 1 del creativo de cada oferta en curso, activa desde antes de la ventana.
  insert into public.creativos (oferta_id, tipo, copy_sugerido, hashtags, version, vigente, activado_at)
  select x.id, 'IMAGEN', 'La temporada llegó #publicidad', '{#publicidad}', 1, true, now() - interval '11 days'
  from unnest(array[o_ev, o_rc, o_al, o_vf, o_cn, o_vc, o_vz, o_dp, o_vx]) as x (id);

  -- Historial de cu_a1 (INT-003): cinco cortes H24 aprobados (alcance 8.000…12.000, mediana 10.000; impresiones
  -- 12.000…18.000, mediana 15.000) y cuatro D7 (por debajo del mínimo de 5). La cancelada por fraude tiene cifras
  -- absurdas aprobadas: si contara, la mediana sería 10.500 y el historial 6.
  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
                                    monto_medio, monto_retenciones, monto_neto, estado, fecha_pago, soporte_pago_path, pagada_at,
                                    requiere_documento_soporte)
  values (l_lq, me_b, private.hoy() - 45, private.hoy() - 35, 1, 250000, 50000, 200000, 0, 200000, 'BORRADOR', null, null, null,
          false),
         (l_pg, me_b, private.hoy() - 34, private.hoy() - 30, 1, 250000, 50000, 200000, 0, 200000, 'PAGADA',
          private.hoy() - 29, 'liquidacion/' || l_pg || '/soporte.pdf', now() - interval '29 days', false);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    causa_cancelacion, aceptada_at, contenido_descargado_at, publicada_at, evidencia_validada_at, metricas_cargadas_at,
    verificada_at, cancelada_at, fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id, franja_clave,
    seguidores_al_aceptar, liquidacion_id)
  select x.id, o_h, c_h, an_v, x.medio, x.cuenta, 'INSTAGRAM', x.slot, x.estado::public.asignacion_estado,
         x.causa::public.cancelacion_causa, now() - interval '59 days', now() - interval '58 days', now() - interval '55 days',
         now() - interval '50 days', case when x.estado <> 'CANCELADA' then now() - interval '45 days' end,
         case when x.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA') then now() - x.verif end,
         case when x.estado = 'CANCELADA' then now() - interval '40 days' end,
         now() - interval '20 days', 1, 250000, v_tarifa, fr1, 'F1', x.seg, x.liq
  from (values (h1, me_a, cu_a1, 1, 'VERIFICADA', null, 40000, interval '40 days', null::uuid),
               (h2, me_a, cu_a1, 2, 'VERIFICADA', null, 40000, interval '40 days', null),
               (h3, me_a, cu_a1, 3, 'VERIFICADA', null, 40000, interval '40 days', null),
               (h4, me_a, cu_a1, 4, 'VERIFICADA', null, 40000, interval '40 days', null),
               (h5, me_a, cu_a1, 5, 'VERIFICADA', null, 40000, interval '40 days', null),
               (hf, me_a, cu_a1, 6, 'CANCELADA', 'FRAUDE', 40000, interval '40 days', null),
               (a_lq, me_b, cu_b, 1, 'LIQUIDADA', null, 45000, interval '40 days', l_lq),
               (a_pg, me_b, cu_b, 2, 'PAGADA', null, 45000, interval '40 days', l_pg),
               (a_d3, me_d, cu_d, 1, 'VERIFICADA', null, 45000, interval '5 days', null),
               (a_d4, me_d, cu_d, 2, 'METRICAS_CARGADAS', null, 45000, interval '5 days', null))
       as x (id, medio, cuenta, slot, estado, causa, seg, verif, liq);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen, monto_comision)
  values (a_lq, me_b, 250000, 0.2, 'GLOBAL', 50000), (a_pg, me_b, 250000, 0.2, 'GLOBAL', 50000),
         (a_d3, me_d, 250000, 0.2, 'GLOBAL', 50000), (a_d4, me_d, 250000, 0.2, 'GLOBAL', 50000);
  insert into public.publicaciones (asignacion_id, numero, url_post, fecha_publicacion, captura_path, etiqueta_publicidad_confirmada,
                                    etiqueta_verificada, permanencia_hasta, permanencia_verificada_at, estado_validacion)
  select x.id, 1, 'https://www.instagram.com/p/HumoE3H' || x.n || '/', now() - interval '55 days' + make_interval(days => x.n),
         v_ev || x.id || '/publicacion/1.webp', true, true, now() - interval '48 days' + make_interval(days => x.n),
         now() - interval '40 days', 'APROBADA'
  from (values (h1, 1), (h2, 2), (h3, 3), (h4, 4), (h5, 5), (hf, 6)) as x (id, n);
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path, estado_validacion)
  select p.id, 'H24', p.fecha_publicacion + interval '1 day', x.alcance, x.impresiones, 100,
         v_ev || x.id || '/metrica/h24.webp', 'APROBADA'
  from (values (h1, 8000, 12000), (h2, 9000, 13500), (h3, 10000, 15000), (h4, 11000, 16500), (h5, 12000, 18000),
               (hf, 1000000, 1200000)) as x (id, alcance, impresiones)
  join public.publicaciones p on p.asignacion_id = x.id;
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path, estado_validacion)
  select p.id, 'D7', p.fecha_publicacion + interval '7 days', 15000, 20000, 150, v_ev || p.asignacion_id || '/metrica/d7.webp',
         'APROBADA'
  from public.publicaciones p where p.asignacion_id in (h1, h2, h3, h4);
  select m.id into m_hf from public.metricas m where m.asignacion_id = hf;
  perform set_config('amo.modo_carga', '', true);
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_ope := jsonb_build_object('sub', u_ope, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_ope)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_an := jsonb_build_object('sub', u_an, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_an)::text;
  c_ao := jsonb_build_object('sub', u_ao, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ao)::text;
  c_ma := jsonb_build_object('sub', u_ma, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ma)::text;
  c_mb := jsonb_build_object('sub', u_mb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mb)::text;
  c_mc := jsonb_build_object('sub', u_mc, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mc)::text;
  c_md := jsonb_build_object('sub', u_md, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_md)::text;

  -- Reservas, descargas y evidencias por el camino real (T). Las publicaciones se declaran en el pasado (D63): sus
  -- cortes ya se cumplieron. a_cs, a_vc, a_vz y a_vx se quedan ACEPTADA; a_d2 descarga y no publica.
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
  select asignacion_id into a_e1 from public.reservar_cupo_srv(o_ev, me_a, cu_a1, u_ma, s_ma, gen_random_uuid());
  select asignacion_id into a_e2 from public.reservar_cupo_srv(o_ev, me_b, cu_b, u_mb, s_mb, gen_random_uuid());
  select asignacion_id into a_rc from public.reservar_cupo_srv(o_rc, me_c, cu_c, u_mc, s_mc, gen_random_uuid());
  select asignacion_id into a_al1 from public.reservar_cupo_srv(o_al, me_a, cu_a1, u_ma, s_ma, gen_random_uuid());
  select asignacion_id into a_al2 from public.reservar_cupo_srv(o_al, me_a, cu_a1, u_ma, s_ma, gen_random_uuid());
  select asignacion_id into a_al3 from public.reservar_cupo_srv(o_al, me_a, cu_a2, u_ma, s_ma, gen_random_uuid());
  select asignacion_id into a_vf from public.reservar_cupo_srv(o_vf, me_b, cu_b, u_mb, s_mb, gen_random_uuid());
  select asignacion_id into a_cs from public.reservar_cupo_srv(o_vf, me_c, cu_c, u_mc, s_mc, gen_random_uuid());
  select asignacion_id into a_d2 from public.reservar_cupo_srv(o_vf, me_d, cu_d, u_md, s_md, gen_random_uuid());
  select asignacion_id into a_cf from public.reservar_cupo_srv(o_cn, me_c, cu_c, u_mc, s_mc, gen_random_uuid());
  select asignacion_id into a_d1 from public.reservar_cupo_srv(o_cn, me_d, cu_d, u_md, s_md, gen_random_uuid());
  select asignacion_id into a_dm from public.reservar_cupo_srv(o_cn, me_b, cu_b, u_mb, s_mb, gen_random_uuid());
  select asignacion_id into a_vc from public.reservar_cupo_srv(o_vc, me_b, cu_b, u_mb, s_mb, gen_random_uuid());
  select asignacion_id into a_vz from public.reservar_cupo_srv(o_vz, me_c, cu_c, u_mc, s_mc, gen_random_uuid());
  select asignacion_id into a_de from public.reservar_cupo_srv(o_dp, me_a, cu_a2, u_ma, s_ma, gen_random_uuid());
  select asignacion_id into a_vx from public.reservar_cupo_srv(o_vx, me_a, cu_a2, u_ma, s_ma, gen_random_uuid());
  perform public.registrar_descarga_srv(x.a, x.u, x.s)
  from (values (a_e1, u_ma, s_ma), (a_e2, u_mb, s_mb), (a_rc, u_mc, s_mc), (a_al1, u_ma, s_ma), (a_al2, u_ma, s_ma),
               (a_al3, u_ma, s_ma), (a_vf, u_mb, s_mb), (a_d2, u_md, s_md), (a_cf, u_mc, s_mc), (a_d1, u_md, s_md),
               (a_dm, u_mb, s_mb), (a_de, u_ma, s_ma)) as x (a, u, s);
  execute 'reset role';
  insert into storage.objects (bucket_id, name, metadata)
  select 'evidencias', v_ev || x.a || '/' || y.ruta, jsonb_build_object('size', 2048, 'mimetype', 'image/webp')
  from unnest(array[a_e1, a_e2, a_rc, a_al1, a_al2, a_al3, a_vf, a_d2, a_cf, a_d1, a_dm, a_vc, a_de]) as x (a)
  cross join unnest(array['publicacion/1.webp', 'publicacion/2.webp', 'publicacion/1b.webp', 'metrica/h24-1.webp',
                          'metrica/h24-2.webp', 'metrica/d7-1.webp', 'metrica/p-1.webp']) as y (ruta);
  execute 'set local role service_role';
  p_e1_1 := public.registrar_evidencia_srv(a_e1, 1, 'https://www.instagram.com/p/HumoE3e1a/', now() - interval '3 days',
                                           v_ev || a_e1 || '/publicacion/1.webp', null, true, u_ma, s_ma);
  p_e1_2 := public.registrar_evidencia_srv(a_e1, 2, 'https://www.instagram.com/p/HumoE3e1b/', now() - interval '3 days',
                                           v_ev || a_e1 || '/publicacion/2.webp', null, true, u_ma, s_ma);
  p_e2_1 := public.registrar_evidencia_srv(a_e2, 1, 'https://www.instagram.com/p/HumoE3e2a/', now() - interval '3 days',
                                           v_ev || a_e2 || '/publicacion/1.webp', null, true, u_mb, s_mb);
  p_e2_2 := public.registrar_evidencia_srv(a_e2, 2, 'https://www.instagram.com/p/HumoE3e2b/', now() - interval '3 days',
                                           v_ev || a_e2 || '/publicacion/2.webp', null, true, u_mb, s_mb);
  p_rc := public.registrar_evidencia_srv(a_rc, 1, 'https://www.instagram.com/p/HumoE3rc/', now() - interval '1 day',
                                         v_ev || a_rc || '/publicacion/1.webp', null, true, u_mc, s_mc);
  p_al1 := public.registrar_evidencia_srv(a_al1, 1, 'https://www.instagram.com/p/HumoE3al1/', now() - interval '9 days',
                                          v_ev || a_al1 || '/publicacion/1.webp', null, true, u_ma, s_ma);
  p_al2 := public.registrar_evidencia_srv(a_al2, 1, 'https://www.instagram.com/p/HumoE3al2/', now() - interval '9 days',
                                          v_ev || a_al2 || '/publicacion/1.webp', null, true, u_ma, s_ma);
  p_al3 := public.registrar_evidencia_srv(a_al3, 1, 'https://www.instagram.com/p/HumoE3al3/', now() - interval '9 days',
                                          v_ev || a_al3 || '/publicacion/1.webp', null, true, u_ma, s_ma);
  p_vf := public.registrar_evidencia_srv(a_vf, 1, 'https://www.instagram.com/p/HumoE3vf/', now() - interval '9 days',
                                         v_ev || a_vf || '/publicacion/1.webp', null, true, u_mb, s_mb);
  p_cf := public.registrar_evidencia_srv(a_cf, 1, 'https://www.instagram.com/p/HumoE3cf/', now() - interval '9 days',
                                         v_ev || a_cf || '/publicacion/1.webp', null, true, u_mc, s_mc);
  p_d1 := public.registrar_evidencia_srv(a_d1, 1, 'https://www.instagram.com/p/HumoE3d1/', now() - interval '9 days',
                                         v_ev || a_d1 || '/publicacion/1.webp', null, true, u_md, s_md);
  p_dm := public.registrar_evidencia_srv(a_dm, 1, 'https://www.instagram.com/p/HumoE3dm/', now() - interval '3 days',
                                         v_ev || a_dm || '/publicacion/1.webp', null, true, u_mb, s_mb);
  p_de := public.registrar_evidencia_srv(a_de, 1, 'https://www.instagram.com/p/HumoE3de/', now() - interval '6 days',
                                         v_ev || a_de || '/publicacion/1.webp', null, true, u_ma, s_ma);
  execute 'reset role';

  -- Métricas que carga cada medio en T (con la evidencia aún pendiente: la asignación está PUBLICADA).
  m_e1_1 := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 20000, 30000, 800, %L) returning to_jsonb(id)',
    p_e1_1, t0 - interval '2 days', v_ev || a_e1 || '/metrica/h24-1.webp')) #>> '{}';
  m_e1_2 := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 18000, 25000, 600, %L) returning to_jsonb(id)',
    p_e1_2, t0 - interval '2 days', v_ev || a_e1 || '/metrica/h24-2.webp')) #>> '{}';
  -- a_al1 (cu_a1): H24 45.000 de alcance (> 3 × 10.000) con impresiones justo en 3 × 15.000; D7 95.000 (> 2 × 40.000).
  m_al1_h := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 45000, 45000, 900, %L) returning to_jsonb(id)',
    p_al1, t0 - interval '8 days', v_ev || a_al1 || '/metrica/h24-1.webp')) #>> '{}';
  m_al1_d := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''D7'', %L, 95000, 100000, 1500, %L) returning to_jsonb(id)',
    p_al1, t0 - interval '2 days', v_ev || a_al1 || '/metrica/d7-1.webp')) #>> '{}';
  -- a_al2 (cu_a1): H24 con alcance normal e impresiones > 3 × 15.000; D7 exactamente 2 × 40.000.
  m_al2_h := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 12000, 50000, 300, %L) returning to_jsonb(id)',
    p_al2, t0 - interval '8 days', v_ev || a_al2 || '/metrica/h24-1.webp')) #>> '{}';
  m_al2_d := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''D7'', %L, 80000, 80000, 900, %L) returning to_jsonb(id)',
    p_al2, t0 - interval '2 days', v_ev || a_al2 || '/metrica/d7-1.webp')) #>> '{}';
  -- a_al3 (cu_a2, sin historial): las mismas cifras que alertan en cu_a1.
  m_al3_h := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 45000, 45000, 900, %L) returning to_jsonb(id)',
    p_al3, t0 - interval '8 days', v_ev || a_al3 || '/metrica/h24-1.webp')) #>> '{}';
  m_vf_h := pg_temp.como(c_mb, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 15000, 20000, 400, %L) returning to_jsonb(id)',
    p_vf, t0 - interval '8 days', v_ev || a_vf || '/metrica/h24-1.webp')) #>> '{}';
  m_vf_p := pg_temp.como(c_mb, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones,
                                  me_gusta, captura_path)
     values (%L, ''PERSONALIZADO'', %L, %L, %L, 16000, 21000, 420, %L) returning to_jsonb(id)',
    p_vf, t0 - interval '6 days', private.inicio_dia(((t0 - interval '9 days') at time zone 'America/Bogota')::date),
    t0 - interval '7 days', v_ev || a_vf || '/metrica/p-1.webp')) #>> '{}';
  m_cf_h := pg_temp.como(c_mc, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 10000, 15000, 300, %L) returning to_jsonb(id)',
    p_cf, t0 - interval '8 days', v_ev || a_cf || '/metrica/h24-1.webp')) #>> '{}';
  m_dm_h := pg_temp.como(c_mb, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 15000, 20000, 400, %L) returning to_jsonb(id)',
    p_dm, t0 - interval '2 days', v_ev || a_dm || '/metrica/h24-1.webp')) #>> '{}';
  m_de_h := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 30000, 40000, 700, %L) returning to_jsonb(id)',
    p_de, t0 - interval '5 days', v_ev || a_de || '/metrica/h24-1.webp')) #>> '{}';

  -- Evidencias que el equipo aprueba en T para tener asignaciones en cada estado (la validación se prueba abajo).
  perform pg_temp.srv(format('select public.validar_evidencia_srv(%L, true, true, null, %L, %L)', x.p, u_adm, s_adm))
  from unnest(array[p_al1, p_al2, p_al3, p_vf, p_cf, p_dm, p_de]) as x (p);

  -- ── (g) Privilegios y configuración nueva ───────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('g01_srv_solo_servidor', (
    select bool_and(has_function_privilege('service_role', f, 'execute') and not has_function_privilege('authenticated', f, 'execute')
                    and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.validar_evidencia_srv(uuid, boolean, boolean, text, uuid, uuid)',
                      'public.validar_metrica_srv(uuid, boolean, text, uuid, uuid)',
                      'public.corregir_metrica_srv(uuid, jsonb, text, uuid, uuid)',
                      'public.cancelar_asignacion_srv(uuid, public.cancelacion_causa, text, boolean, uuid, uuid)']) f));
  r := r || jsonb_build_object('g02_consultas_para_la_sesion', (
    select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.alertas_metricas(uuid, uuid)', 'public.cola_evidencias(integer, integer)',
                      'public.cola_metricas(boolean, integer, integer)', 'public.cola_verificacion(integer, integer)',
                      'public.mensajes_disputa(uuid)', 'public.asignaciones_en_curso_medio(uuid)']) f));
  -- D67: las columnas de alertas no se leen ni se escriben por PostgREST; el resto de la métrica sí se lee.
  r := r || jsonb_build_object('g03_columnas_de_alertas_cerradas',
    not has_column_privilege('authenticated', 'public.metricas', 'alerta_desviacion', 'select')
    and not has_column_privilege('authenticated', 'public.metricas', 'alerta_multiplo', 'select')
    and not has_column_privilege('authenticated', 'public.metricas', 'detalle_alertas', 'select')
    and not has_column_privilege('authenticated', 'public.metricas', 'alerta_multiplo', 'update')
    and not has_column_privilege('authenticated', 'public.metricas', 'detalle_alertas', 'update')
    and has_column_privilege('authenticated', 'public.metricas', 'alcance', 'select')
    and has_column_privilege('authenticated', 'public.metricas', 'estado_validacion', 'select')
    and not has_table_privilege('anon', 'public.metricas', 'select'));
  -- Las colas de evidencias y las asignaciones en curso son invoker (RLS); el resto, definer con search_path vacío.
  r := r || jsonb_build_object('g04_definer_e_invoker', (
    select bool_and(p.prosecdef = x.definer and p.proconfig @> array['search_path=""'])
    from (values ('public.validar_evidencia_srv(uuid, boolean, boolean, text, uuid, uuid)', true),
                 ('public.validar_metrica_srv(uuid, boolean, text, uuid, uuid)', true),
                 ('public.corregir_metrica_srv(uuid, jsonb, text, uuid, uuid)', true),
                 ('public.cancelar_asignacion_srv(uuid, public.cancelacion_causa, text, boolean, uuid, uuid)', true),
                 ('public.alertas_metricas(uuid, uuid)', true), ('public.cola_metricas(boolean, integer, integer)', true),
                 ('public.cola_verificacion(integer, integer)', true), ('public.mensajes_disputa(uuid)', true),
                 ('public.cola_evidencias(integer, integer)', false), ('public.asignaciones_en_curso_medio(uuid)', false),
                 ('private.alertas_metricas_por_medio(timestamp with time zone, timestamp with time zone, character)', true))
         as x (firma, definer)
    join pg_proc p on p.oid = x.firma::regprocedure));
  r := r || jsonb_build_object('g05_internos_cerrados',
    not has_function_privilege('authenticated', 'private.fn_asignaciones_evaluar_tras_disputa()', 'execute')
    and not has_function_privilege('service_role', 'private.fn_asignaciones_evaluar_tras_disputa()', 'execute')
    and 'alertas_metricas_por_medio' = any (private.lista_blanca_authenticated()));
  -- D74 · ADM-007: claves nuevas públicas (las lee cualquier sesión) y plantillas nuevas.
  v_j := pg_temp.como(c_ma, 'authenticated', 'select jsonb_object_agg(clave, valor) from public.configuracion
                                              where clave in (''evidencias.plazo_recarga_horas'', ''soporte.correo'')');
  r := r || jsonb_build_object('g06_configuracion_publica',
    case when v_j = '{"evidencias.plazo_recarga_horas": 24, "soporte.correo": ""}'::jsonb then 'true'::jsonb else v_j end);
  r := r || jsonb_build_object('g07_plantillas_nuevas',
    (select count(*) = 2 from public.plantillas_notificacion
     where canal = 'APP' and activa
       and ((clave = 'asignacion.reabierta' and variables = array['oferta', 'plazo'])
            or (clave = 'cola.disputa_mensaje' and variables = array['oferta']))));

  -- ── (a) INT-003 · INT-004: alertas por cuenta y corte, por alcance o impresiones, y por múltiplo ──────────────
  select to_jsonb(m) into v_j from (select alerta_desviacion, alerta_multiplo, detalle_alertas
                                    from public.metricas where id = m_al1_h) m;
  r := r || jsonb_build_object('a01_desviacion_por_alcance_con_su_calculo',
    case when (v_j ->> 'alerta_desviacion')::boolean and not (v_j ->> 'alerta_multiplo')::boolean
              and (v_j #>> '{detalle_alertas,mediana_historica}')::numeric = 10000
              and (v_j #>> '{detalle_alertas,mediana_impresiones}')::numeric = 15000
              and (v_j #>> '{detalle_alertas,factor}')::numeric = 3
              and (v_j #>> '{detalle_alertas,seguidores}')::integer = 40000
              and (v_j #>> '{detalle_alertas,multiplo}')::numeric = 2
              and (v_j #>> '{detalle_alertas,alcance}')::integer = 45000
              and (v_j #>> '{detalle_alertas,impresiones}')::integer = 45000
              and (v_j #>> '{detalle_alertas,limite_alcance}')::numeric = 80000
              and not (v_j -> 'detalle_alertas') ? 'alerta_previa'
         then 'true'::jsonb else v_j end);
  -- Seis H24 aprobadas de la cuenta, pero la cancelada por fraude no cuenta (si contara: 6 y mediana 10.500).
  r := r || jsonb_build_object('a02_historial_de_la_cuenta_sin_fraude',
    case when (v_j #>> '{detalle_alertas,n_historial}')::integer = 5
              and (select count(*) = 6 from public.metricas m join public.asignaciones a on a.id = m.asignacion_id
                   where a.cuenta_social_id = cu_a1 and m.corte = 'H24' and m.estado_validacion = 'APROBADA')
         then 'true'::jsonb else v_j -> 'detalle_alertas' end);
  select to_jsonb(m) into v_j from (select alerta_desviacion, alerta_multiplo, detalle_alertas
                                    from public.metricas where id = m_al2_h) m;
  r := r || jsonb_build_object('a03_desviacion_por_impresiones',
    case when (v_j ->> 'alerta_desviacion')::boolean and not (v_j ->> 'alerta_multiplo')::boolean
              and (v_j #>> '{detalle_alertas,alcance}')::integer = 12000
              and (v_j #>> '{detalle_alertas,impresiones}')::integer = 50000
         then 'true'::jsonb else v_j end);
  select to_jsonb(m) into v_j from (select alerta_desviacion, alerta_multiplo, detalle_alertas
                                    from public.metricas where id = m_al1_d) m;
  r := r || jsonb_build_object('a04_multiplo_sobre_seguidores',
    case when (v_j ->> 'alerta_multiplo')::boolean and not (v_j ->> 'alerta_desviacion')::boolean
              and (v_j #>> '{detalle_alertas,n_historial}')::integer = 4
              and (v_j #>> '{detalle_alertas,alcance}')::integer = 95000
              and (v_j #>> '{detalle_alertas,limite_alcance}')::numeric = 80000
         then 'true'::jsonb else v_j end);
  -- INT-004 c2: exactamente el múltiplo no alerta (y con 4 D7 aprobados no hay desviación posible).
  select to_jsonb(m) into v_j from (select alerta_desviacion, alerta_multiplo, detalle_alertas
                                    from public.metricas where id = m_al2_d) m;
  r := r || jsonb_build_object('a05_multiplo_exacto_no_alerta',
    case when not (v_j ->> 'alerta_multiplo')::boolean and not (v_j ->> 'alerta_desviacion')::boolean
              and (v_j #>> '{detalle_alertas,alcance}')::integer = 80000
              and (v_j #>> '{detalle_alertas,limite_alcance}')::numeric = 80000
         then 'true'::jsonb else v_j end);
  -- Las mismas cifras en otra cuenta del mismo medio, sin historial propio, no alertan.
  select to_jsonb(m) into v_j from (select alerta_desviacion, alerta_multiplo, detalle_alertas
                                    from public.metricas where id = m_al3_h) m;
  r := r || jsonb_build_object('a06_historial_por_cuenta',
    case when not (v_j ->> 'alerta_multiplo')::boolean and not (v_j ->> 'alerta_desviacion')::boolean
              and (v_j #>> '{detalle_alertas,n_historial}')::integer = 0
              and (v_j #>> '{detalle_alertas,limite_alcance}')::numeric = 90000
         then 'true'::jsonb else v_j end);
  -- Ni el medio ni el anunciante leen las alertas (columnas cerradas, RPC con asignaciones.ver, colas vacías).
  v_e := pg_temp.falla(c_ma, 'authenticated', format('select alerta_desviacion from public.metricas where id = %L', m_al1_h));
  v_e2 := pg_temp.falla(c_ma, 'authenticated', format('select * from public.metricas where id = %L', m_al1_h));
  v_e3 := pg_temp.falla(c_ma, 'authenticated', format('select * from public.alertas_metricas(%L)', a_al1));
  v_n := pg_temp.como(c_ma, 'authenticated', format('select count(*) from public.metricas where id = %L and alcance = 45000',
                                                    m_al1_h));
  v_m := pg_temp.como(c_ma, 'authenticated', 'select count(*) from public.cola_metricas(false, 200, 0)');
  r := r || jsonb_build_object('a07_invisibles_para_el_medio',
    case when v_e ->> 's' = '42501' and v_e2 ->> 's' = '42501' and v_e3 ->> 'e' = 'AMO_NO_AUTORIZADO' and v_n = 1 and v_m = 0
         then 'true'::jsonb else jsonb_build_object('columna', v_e, 'todo', v_e2, 'rpc', v_e3, 'cifras', v_n, 'cola', v_m) end);
  v_e := pg_temp.falla(c_an, 'authenticated', 'select detalle_alertas from public.metricas limit 1');
  v_e2 := pg_temp.falla(c_an, 'authenticated', format('select * from public.alertas_metricas(null, %L)', me_a));
  v_j := pg_temp.como(c_an, 'authenticated', format('select jsonb_agg(s) from public.seguimiento_campana(%L) s', c_v));
  r := r || jsonb_build_object('a08_invisibles_para_el_anunciante',
    case when v_e ->> 's' = '42501' and v_e2 ->> 'e' = 'AMO_NO_AUTORIZADO' and jsonb_array_length(v_j) > 0
              and v_j::text !~ '"[a-z_]*alerta[a-z_]*":'
         then 'true'::jsonb else jsonb_build_object('columna', v_e, 'rpc', v_e2) end);
  -- El equipo las lee por RPC: por asignación (todas sus métricas), por medio (las que alertaron) y pendientes.
  v_txt := format('select jsonb_agg(jsonb_build_object(''id'', metrica_id, ''d'', alerta_desviacion, ''m'', alerta_multiplo)
                                     order by created_at, metrica_id) from public.alertas_metricas(%L)', a_al1);
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt);
  v_k := pg_temp.como(c_fin, 'authenticated', v_txt);
  r := r || jsonb_build_object('a09_equipo_lee_las_alertas_de_la_asignacion',
    case when v_j @> jsonb_build_array(jsonb_build_object('id', m_al1_h, 'd', true, 'm', false),
                                       jsonb_build_object('id', m_al1_d, 'd', false, 'm', true))
              and jsonb_array_length(v_j) = 2 and v_k = v_j
         then 'true'::jsonb else jsonb_build_object('operaciones', v_j, 'finanzas', v_k) end);
  r := r || jsonb_build_object('a09b_alertas_exigen_sesion_valida', pg_temp.es(pg_temp.falla(
    jsonb_build_object('sub', u_ope, 'role', 'authenticated', 'aal', 'aal2', 'session_id', gen_random_uuid())::text,
    'authenticated', format('select * from public.alertas_metricas(%L)', a_al1)), 'AMO_NO_AUTORIZADO'));
  select array_agg(x.metrica_id) into v_ids
  from jsonb_to_recordset(pg_temp.como(c_ope, 'authenticated', format(
         'select jsonb_agg(jsonb_build_object(''metrica_id'', metrica_id)) from public.alertas_metricas(null, %L)', me_a)))
       as x (metrica_id uuid);
  r := r || jsonb_build_object('a10_alertas_del_medio',
    m_al1_h = any (v_ids) and m_al1_d = any (v_ids) and m_al2_h = any (v_ids) and m_hf = any (v_ids)
    and not m_al2_d = any (v_ids) and not m_al3_h = any (v_ids) and not m_e1_1 = any (v_ids));
  select array_agg(x.metrica_id) into v_ids
  from jsonb_to_recordset(pg_temp.como(c_ope, 'authenticated',
         'select jsonb_agg(jsonb_build_object(''metrica_id'', metrica_id)) from public.alertas_metricas()')) as x (metrica_id uuid);
  r := r || jsonb_build_object('a11_pendientes_con_alerta',
    m_al1_h = any (v_ids) and m_al1_d = any (v_ids) and m_al2_h = any (v_ids) and not m_hf = any (v_ids)
    and not m_al3_h = any (v_ids));

  -- ── (v) ADM-007: validación de evidencias (T) ─────────────────────────────────────────────────────────────────
  v_txt := 'select public.validar_evidencia_srv(%L, true, true, null, %L, %L)';
  v_e := pg_temp.srv_falla(format(v_txt, p_e1_1, u_fin, s_fin));
  v_e2 := pg_temp.srv_falla(format(v_txt, p_e1_1, u_ma, s_ma));
  v_e3 := pg_temp.srv_falla(format(v_txt, p_e1_1, u_an, s_an));
  r := r || jsonb_build_object('v01_solo_quien_valida_evidencias',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e3 ->> 'e' = 'AMO_NO_AUTORIZADO'
         then 'true'::jsonb else jsonb_build_object('finanzas', v_e, 'medio', v_e2, 'anunciante', v_e3) end);
  v_e := pg_temp.srv_falla(format('select public.validar_evidencia_srv(%L, true, false, null, %L, %L)', p_e1_1, u_ope, s_ope));
  v_e2 := pg_temp.srv_falla(format('select public.validar_evidencia_srv(%L, true, null, null, %L, %L)', p_e1_1, u_ope, s_ope));
  r := r || jsonb_build_object('v02_aprobar_exige_la_etiqueta',
    case when pg_temp.es(v_e, 'AMO_ETIQUETA_REQUERIDA', 'Verifica que la etiqueta de publicidad sea visible antes de aprobar.')
              = 'true' and v_e2 ->> 'e' = 'AMO_ETIQUETA_REQUERIDA'
         then 'true'::jsonb else jsonb_build_object('falsa', v_e, 'nula', v_e2) end);
  r := r || jsonb_build_object('v03_evidencia_inexistente', pg_temp.es(pg_temp.srv_falla(format(v_txt, gen_random_uuid(), u_ope, s_ope)),
    'AMO_TRANSICION_INVALIDA', 'La evidencia no existe.'));
  v_res := pg_temp.srv(format(v_txt, p_e1_1, u_ope, s_ope));
  r := r || jsonb_build_object('v04_aprobar_una_de_dos',
    case when v_res ->> 'asignacion_id' = a_e1::text and v_res ->> 'estado' = 'PUBLICADA'
              and (v_res ->> 'fecha_limite_publicacion')::timestamptz = t0 + interval '20 days'
              and (select estado_validacion = 'APROBADA' and etiqueta_verificada and validada_por = u_ope and validada_at = t0
                   from public.publicaciones where id = p_e1_1)
         then 'true'::jsonb else v_res end);
  r := r || jsonb_build_object('m00_metrica_exige_la_evidencia_aprobada', pg_temp.es(pg_temp.srv_falla(format(
    'select public.validar_metrica_srv(%L, true, null, %L, %L)', m_e1_2, u_ope, s_ope)),
    'AMO_TRANSICION_INVALIDA', 'La evidencia de la publicación debe estar aprobada antes de aprobar sus métricas.'));
  -- Con los cortes ya cargados, aprobar la última publicación lleva la asignación hasta METRICAS_CARGADAS.
  v_res := pg_temp.srv(format('select public.validar_evidencia_srv(%L, true, true, %L, %L, %L)', p_e1_2,
                              '  Etiqueta visible en el pie de foto  ', u_adm, s_adm));
  r := r || jsonb_build_object('v05_la_ultima_valida_y_completa',
    case when v_res ->> 'estado' = 'METRICAS_CARGADAS'
              and (select evidencia_validada_at = t0 and metricas_cargadas_at = t0 from public.asignaciones where id = a_e1)
              and (select observaciones = 'Etiqueta visible en el pie de foto' and validada_por = u_adm
                   from public.publicaciones where id = p_e1_2)
         then 'true'::jsonb else v_res end);
  v_e := pg_temp.srv_falla(format('select public.validar_evidencia_srv(%L, false, false, null, %L, %L)', p_e2_1, u_ope, s_ope));
  v_e2 := pg_temp.srv_falla(format('select public.validar_evidencia_srv(%L, false, false, %L, %L, %L)', p_e2_1, '   ',
                                   u_ope, s_ope));
  r := r || jsonb_build_object('v06_rechazar_exige_observaciones',
    case when pg_temp.es(v_e, 'AMO_MOTIVO_REQUERIDO', 'Indica qué debe corregir el medio.') = 'true'
              and v_e2 ->> 'e' = 'AMO_MOTIVO_REQUERIDO'
         then 'true'::jsonb else jsonb_build_object('nulas', v_e, 'en_blanco', v_e2) end);

  -- T+1h: rechazos. Con el plazo lejano no cambia; con la ventana por cerrar, el medio recibe 24 h para recargar.
  perform set_config('amo.reloj', (t0 + interval '1 hour')::text, true);
  v_txt := 'Falta la etiqueta de publicidad. ' || repeat('x', 1200);
  v_res := pg_temp.srv(format('select public.validar_evidencia_srv(%L, false, false, %L, %L, %L)', p_e2_1, v_txt, u_ope, s_ope));
  r := r || jsonb_build_object('v07_rechazo_vuelve_a_contenido_entregado',
    case when v_res ->> 'estado' = 'CONTENIDO_ENTREGADO'
              and (v_res ->> 'fecha_limite_publicacion')::timestamptz = t0 + interval '20 days'
              and (select estado_validacion = 'RECHAZADA' and observaciones = left(v_txt, 1000) and validada_por = u_ope
                   from public.publicaciones where id = p_e2_1)
              and (select estado = 'CONTENIDO_ENTREGADO' and publicada_at is null from public.asignaciones where id = a_e2)
              and exists (select 1 from public.notificaciones where tipo = 'evidencia.rechazada' and usuario_id = u_mb
                            and entidad_id = a_e2::text and prioridad = 2)
         then 'true'::jsonb else v_res end);
  v_res := pg_temp.srv(format('select public.validar_evidencia_srv(%L, false, false, %L, %L, %L)', p_rc,
                              'El post no abre públicamente', u_adm, s_adm));
  r := r || jsonb_build_object('v08_rechazo_tardio_da_plazo_de_recarga',
    case when v_res ->> 'estado' = 'CONTENIDO_ENTREGADO'
              and (v_res ->> 'fecha_limite_publicacion')::timestamptz = t0 + interval '25 hours'
              and (select count(*) = 1 from public.notificaciones
                   where tipo = 'evidencia.rechazada' and usuario_id = u_mc and entidad_id = a_rc::text and prioridad = 2
                     and mensaje = format('La evidencia de publicación de «Post de ventana corta» fue rechazada: El post no abre '
                                          'públicamente. Carga una evidencia nueva antes del %s.',
                                          private.formato_fecha(t0 + interval '25 hours')))
         then 'true'::jsonb else v_res end);

  -- T+1h30: el cron pasa a ejecución las ofertas que vencerán.
  perform set_config('amo.reloj', (t0 + interval '90 minutes')::text, true);
  perform private.cron_aplicar('ofertas', x.id, 'EN_EJECUCION', 'Inició la ventana de publicación')
  from unnest(array[o_vc, o_vz, o_vx]) as x (id);

  -- ── T+3h: vencida la ventana de T+2h ─────────────────────────────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '3 hours')::text, true);
  v_ok := private.condicion_sistema('asignaciones', a_rc, 'VENCIDA_SIN_PUBLICAR');
  v_ok2 := private.cron_aplicar('asignaciones', a_rc, 'VENCIDA_SIN_PUBLICAR', 'Venció la ventana de publicación sin evidencia');
  r := r || jsonb_build_object('v09_no_vence_dentro_del_plazo_de_recarga',
    not v_ok and not v_ok2 and (select estado = 'CONTENIDO_ENTREGADO' from public.asignaciones where id = a_rc));
  v_j := pg_temp.srv(format('select to_jsonb(public.registrar_evidencia_srv(%L, 1, %L, %L, %L, null, true, %L, %L))',
                            a_rc, 'https://www.instagram.com/p/HumoE3rc2/', t0 + interval '150 minutes',
                            v_ev || a_rc || '/publicacion/1b.webp', u_mc, s_mc));
  r := r || jsonb_build_object('v10_recarga_tras_la_ventana_dentro_del_plazo',
    case when v_j #>> '{}' = p_rc::text
              and (select estado_validacion = 'PENDIENTE' and url_post = 'https://www.instagram.com/p/HumoE3rc2/'
                          and observaciones = 'El post no abre públicamente' from public.publicaciones where id = p_rc)
              and (select estado = 'PUBLICADA' and publicada_at = t0 + interval '3 hours' from public.asignaciones where id = a_rc)
         then 'true'::jsonb else v_j end);

  -- ── (o) ADM-011 c1 · D70: vencida reclamable ─────────────────────────────────────────────────────────────────
  select bool_and(private.cron_aplicar('asignaciones', x.id, 'VENCIDA_SIN_PUBLICAR',
                                       'Venció la ventana de publicación sin evidencia'))
    into v_ok from unnest(array[a_vc, a_vz, a_vx]) as x (id);
  r := r || jsonb_build_object('o01_vencidas_liberan_el_cupo',
    v_ok and (select bool_and(estado = 'VENCIDA_SIN_PUBLICAR' and vencida_at = t0 + interval '3 hours')
              from public.asignaciones where id in (a_vc, a_vz, a_vx))
    and (select bool_and(cupos_ocupados = 0 and presupuesto_comprometido = 0 and estado = 'EN_EJECUCION')
         from public.ofertas where id in (o_vc, o_vz, o_vx))
    and (select count(*) = 1 from public.notificaciones
         where tipo = 'asignacion.vencida' and usuario_id = u_mb and entidad_id = a_vc::text
           and mensaje = format('La asignación de «Post que vence» venció sin publicación. Puedes abrir una disputa hasta el %s.',
                                private.formato_fecha(t0 + interval '75 hours'))));
  -- La ventana terminó y nada sigue en curso, pero la oferta espera el plazo de reclamo.
  r := r || jsonb_build_object('o02_no_cierra_con_una_vencida_reclamable',
    not private.cron_aplicar('ofertas', o_vz, 'CERRADA', 'Terminó la ventana')
    and not private.condicion_sistema('ofertas', o_vc, 'CERRADA')
    and (select estado = 'EN_EJECUCION' from public.ofertas where id = o_vz));
  v_txt := 'select public.abrir_disputa_srv(%L, %L, ''Sí publiqué y no se registró'', %L, %L)';
  v_e := pg_temp.srv_falla(format(v_txt, a_vc, 'OTRO', u_an, s_an));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_vc, 'METRICAS', u_mb, s_mb));
  v_e3 := pg_temp.srv_falla(format(v_txt, a_vc, 'OTRO', u_adm, s_adm));
  r := r || jsonb_build_object('o03_la_vencida_solo_la_reclama_el_medio',
    case when (select bool_and(x ->> 'e' = 'AMO_TRANSICION_INVALIDA'
                               and x ->> 'd' = 'Una asignación vencida solo la reclama el medio y dentro del plazo.')
               from unnest(array[v_e, v_e2, v_e3]) x)
         then 'true'::jsonb else jsonb_build_object('anunciante', v_e, 'medio_metricas', v_e2, 'admin', v_e3) end);
  v_j := pg_temp.como(c_mb, 'authenticated', format(
    'select jsonb_agg(jsonb_build_object(''accion'', accion, ''vence'', vence_at)) from public.proximas_acciones_medio(100)
     where asignacion_id = %L', a_vc));
  r := r || jsonb_build_object('o04_proxima_accion_reclamar',
    case when jsonb_array_length(v_j) = 1 and v_j -> 0 ->> 'accion' = 'RECLAMAR'
              and (v_j -> 0 ->> 'vence')::timestamptz = t0 + interval '75 hours'
         then 'true'::jsonb else coalesce(v_j, 'null') end);
  r := r || jsonb_build_object('o05_la_vencida_no_se_cancela', pg_temp.es(pg_temp.srv_falla(format(
    'select public.cancelar_asignacion_srv(%L, ''ADMINISTRATIVA'', ''Limpieza'', false, %L, %L)', a_vz, u_adm, s_adm)),
    'AMO_TRANSICION_INVALIDA', 'El registro no puede pasar a ese estado desde el actual.'));

  -- T+4h: el medio A reclama la suya; luego la marca cancela esa campaña (el reclamo no consume cupo).
  perform set_config('amo.reloj', (t0 + interval '4 hours')::text, true);
  d_vx := pg_temp.srv(format('select to_jsonb(public.abrir_disputa_srv(%L, ''INCUMPLIMIENTO'', %L, %L, %L))', a_vx,
                             'Sí publiqué y no se registró en la plataforma', u_ma, s_ma)) #>> '{}';
  perform pg_temp.srv(format('select public.transicionar_srv(''campanas'', %L, ''CANCELADA'', %L, %L, %L)', c_x, u_an, s_an,
                             'La marca cerró la campaña antes de tiempo'));
  v_e := pg_temp.srv_falla(format('select public.transicionar_srv(''disputas'', %L, ''RESUELTA'', %L, %L, %L, %L)', d_vx,
                                  u_ope, s_ope, 'Sí publicó a tiempo', '{"estado_asignacion_resultante": "CONTENIDO_ENTREGADO"}'));
  r := r || jsonb_build_object('o06_no_reabre_si_la_oferta_ya_cerro',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA',
                         'La oferta ya cerró: resuelve restaurando la decisión o cancelando la asignación.', 'oferta_cerrada') = 'true'
              and (select estado = 'CANCELADA' from public.ofertas where id = o_vx)
         then 'true'::jsonb else v_e end);
  perform pg_temp.srv(format('select public.transicionar_srv(''disputas'', %L, ''RESUELTA'', %L, %L, %L, %L)', d_vx, u_ope, s_ope,
                             'La campaña se canceló: se acuerda cerrar el caso',
                             '{"estado_asignacion_resultante": "CANCELADA", "causa": "ACUERDO"}'));
  r := r || jsonb_build_object('o07_cancelar_la_vencida_por_la_disputa_sin_liberar_dos_veces',
    (select estado = 'CANCELADA' and causa_cancelacion = 'ACUERDO' and estado_previo_disputa is null
     from public.asignaciones where id = a_vx)
    and (select estado = 'RESUELTA' and estado_asignacion_resultante = 'CANCELADA' and resuelta_por = u_ope
         from public.disputas where id = d_vx)
    and (select cupos_ocupados = 0 and presupuesto_comprometido = 0 from public.ofertas where id = o_vx)
    and (select cupos_ocupados = 0 from public.oferta_cupos where oferta_id = o_vx)
    and (select presupuesto_comprometido = 0 from public.campanas where id = c_x));

  -- ── (q) Colas del equipo (T+5h) ──────────────────────────────────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '5 hours')::text, true);
  v_ids := array[o_ev, o_rc, o_al, o_vf, o_cn, o_vc, o_vz, o_dp, o_vx];
  v_j := pg_temp.como(c_ope, 'authenticated', format(
    'select jsonb_agg(jsonb_build_object(''p'', c.publicacion_id, ''n'', c.numero, ''pubs'', c.publicaciones,
                                         ''obs'', c.observaciones_previas, ''url'', c.url_post, ''handle'', c.handle,
                                         ''medio'', c.medio_nombre, ''oferta'', c.oferta_titulo, ''estado'', c.asignacion_estado,
                                         ''captura'', c.captura_path) order by c.ordinality)
     from public.cola_evidencias(200, 0) with ordinality c where c.oferta_id = any (%L::uuid[])', v_ids));
  r := r || jsonb_build_object('q01_cola_de_evidencias',
    case when jsonb_array_length(v_j) = 3
              and v_j @> jsonb_build_array(jsonb_build_object('p', p_e2_2, 'n', 2, 'pubs', 2, 'estado', 'CONTENIDO_ENTREGADO'),
                                           jsonb_build_object('p', p_d1, 'n', 1, 'estado', 'PUBLICADA'))
              and v_j -> 2 = jsonb_build_object('p', p_rc, 'n', 1, 'pubs', 1, 'obs', 'El post no abre públicamente',
                                                'url', 'https://www.instagram.com/p/HumoE3rc2/', 'handle', 'humo_e3_c',
                                                'medio', 'Medio Humo C', 'oferta', 'Post de ventana corta',
                                                'estado', 'PUBLICADA', 'captura', v_ev || a_rc || '/publicacion/1b.webp')
         then 'true'::jsonb else v_j end);
  -- Total y paginación en una sola sentencia (una instantánea: otros procesos pueden escribir en la base local).
  v_j := pg_temp.como(c_ope, 'authenticated', '
    select jsonb_build_object(
      ''total'', (select max(total) from public.cola_evidencias(1, 0)),
      ''esperado'', (select count(*) from public.publicaciones p join public.asignaciones a on a.id = p.asignacion_id
                     where p.estado_validacion = ''PENDIENTE'' and a.estado in (''CONTENIDO_ENTREGADO'', ''PUBLICADA'')),
      ''limite_0'', (select count(*) from public.cola_evidencias(0, 0)),
      ''fuera'', (select count(*) from public.cola_evidencias(50, (select max(total) from public.cola_evidencias(1, 0))::integer)),
      ''tope'', (select count(*) <= 200 from public.cola_evidencias(1000, -5)))');
  r := r || jsonb_build_object('q02_total_y_paginacion',
    case when v_j ->> 'total' = v_j ->> 'esperado' and (v_j ->> 'limite_0')::integer = 1 and (v_j ->> 'fuera')::integer = 0
              and (v_j ->> 'tope')::boolean
         then 'true'::jsonb else v_j end);
  v_n := pg_temp.como(c_fin, 'authenticated', 'select count(*) from public.cola_evidencias(200, 0)');
  v_m := pg_temp.como(c_md, 'authenticated', 'select count(*) from public.cola_evidencias(200, 0)');
  v_p := pg_temp.como(c_an, 'authenticated', 'select count(*) from public.cola_evidencias(200, 0)');
  r := r || jsonb_build_object('q03_cola_de_evidencias_solo_quien_valida', v_n = 0 and v_m = 0 and v_p = 0);
  -- Métricas: las que tienen alerta arriba, con su porqué; el filtro deja solo esas.
  v_j := pg_temp.como(c_ope, 'authenticated', format(
    'select jsonb_agg(jsonb_build_object(''m'', c.metrica_id, ''alerta'', c.alerta_desviacion or c.alerta_multiplo,
                                         ''detalle'', c.detalle_alertas, ''evidencia'', c.evidencia_aprobada,
                                         ''seguidores'', c.seguidores_al_aceptar, ''handle'', c.handle, ''corte'', c.corte)
                      order by c.ordinality)
     from public.cola_metricas(false, 200, 0) with ordinality c
     join public.asignaciones a on a.id = c.asignacion_id where a.oferta_id = any (%L::uuid[])', v_ids));
  select coalesce(max(x.i) filter (where (x.e ->> 'alerta')::boolean), 0) < min(x.i) filter (where not (x.e ->> 'alerta')::boolean)
         and count(*) filter (where (x.e ->> 'alerta')::boolean) = 3 and count(*) = 12
    into v_ok
  from jsonb_array_elements(v_j) with ordinality x (e, i);
  r := r || jsonb_build_object('q04_cola_de_metricas_alertas_primero',
    case when v_ok
              and exists (select 1 from jsonb_array_elements(v_j) e
                          where e ->> 'm' = m_al1_h::text and (e ->> 'evidencia')::boolean
                            and (e #>> '{detalle,mediana_historica}')::numeric = 10000
                            and (e ->> 'seguidores')::integer = 40000 and e ->> 'handle' = 'humo_e3_a1' and e ->> 'corte' = 'H24')
         then 'true'::jsonb else v_j end);
  select array_agg(x.m order by x.m) into v_ids
  from jsonb_to_recordset(pg_temp.como(c_ope, 'authenticated', format(
         'select jsonb_agg(jsonb_build_object(''m'', c.metrica_id)) from public.cola_metricas(true, 200, 0) c
          join public.asignaciones a on a.id = c.asignacion_id where a.oferta_id = any (%L::uuid[])',
         array[o_ev, o_rc, o_al, o_vf, o_cn, o_vc, o_vz, o_dp, o_vx]))) as x (m uuid);
  r := r || jsonb_build_object('q05_filtro_solo_con_alertas',
    v_ids = (select array_agg(x order by x) from unnest(array[m_al1_h, m_al1_d, m_al2_h]) x));
  v_n := pg_temp.como(c_fin, 'authenticated', 'select count(*) from public.cola_metricas(false, 200, 0)');
  v_m := pg_temp.como(c_fin, 'authenticated', 'select count(*) from public.cola_verificacion(200, 0)');
  r := r || jsonb_build_object('q06_finanzas_sin_colas_de_validacion', v_n = 0 and v_m = 0);
  v_j := pg_temp.como(c_ope, 'authenticated', '
    select jsonb_build_object(
      ''metricas'', (select max(total) from public.cola_metricas(false, 1, 0)),
      ''metricas_esperado'', (select count(*) from public.metricas x join public.asignaciones a on a.id = x.asignacion_id
                              where x.estado_validacion = ''PENDIENTE''
                                and a.estado in (''PUBLICADA'', ''EVIDENCIA_VALIDADA'', ''METRICAS_CARGADAS'')),
      ''metricas_limite_0'', (select count(*) from public.cola_metricas(false, 0, 0)),
      ''metricas_fuera'', (select count(*) from public.cola_metricas(false, 50,
                                                                    (select max(total) from public.cola_metricas(false, 1, 0))::integer)),
      ''verificar'', (select max(total) from public.cola_verificacion(1, 0)),
      ''verificar_esperado'', (select count(*) from public.asignaciones where estado = ''METRICAS_CARGADAS''),
      ''verificar_limite_0'', (select count(*) from public.cola_verificacion(0, 0)),
      ''tope'', (select count(*) <= 200 from public.cola_metricas(true, 1000, -5)))');
  r := r || jsonb_build_object('q07_total_y_paginacion_de_metricas_y_verificacion',
    case when v_j ->> 'metricas' = v_j ->> 'metricas_esperado' and (v_j ->> 'metricas_limite_0')::integer = 1
              and (v_j ->> 'metricas_fuera')::integer = 0 and v_j ->> 'verificar' = v_j ->> 'verificar_esperado'
              and (v_j ->> 'verificar_limite_0')::integer = 1 and (v_j ->> 'tope')::boolean
         then 'true'::jsonb else v_j end);

  -- Una asignación cancelada sale de la cola y su evidencia ya no se valida.
  v_res := pg_temp.srv(format('select public.cancelar_asignacion_srv(%L, ''ADMINISTRATIVA'', %L, false, %L, %L)', a_e2,
                              'La marca retiró la pieza', u_adm, s_adm));
  v_e := pg_temp.srv_falla(format('select public.validar_evidencia_srv(%L, true, true, null, %L, %L)', p_e2_2, u_ope, s_ope));
  v_n := pg_temp.como(c_ope, 'authenticated', format('select count(*) from public.cola_evidencias(200, 0) where publicacion_id = %L',
                                                     p_e2_2));
  r := r || jsonb_build_object('v11_asignacion_cerrada_no_se_valida',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'La asignación ya no está en curso: no hay nada que validar.',
                         'asignacion_cerrada') = 'true'
              and v_n = 0 and v_res ->> 'estado' = 'CANCELADA' and not (v_res ->> 'medio_suspendido')::boolean
         then 'true'::jsonb else jsonb_build_object('validar', v_e, 'en_cola', v_n, 'cancelar', v_res) end);

  -- ── (x) ADM-010 · INT-006: cancelación con causa y suspensión (T+6h) ─────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '6 hours')::text, true);
  v_txt := 'select public.cancelar_asignacion_srv(%L, %L, %L, %L, %L, %L)';
  v_e := pg_temp.srv_falla(format(v_txt, a_cf, 'FRAUDE', 'Métricas falsas', true, u_fin, s_fin));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_cf, 'FRAUDE', 'Métricas falsas', true, u_mc, s_mc));
  v_e3 := pg_temp.srv_falla(format(v_txt, a_cf, 'FRAUDE', 'Métricas falsas', true, u_an, s_an));
  r := r || jsonb_build_object('x01_solo_quien_gestiona_asignaciones',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e3 ->> 'e' = 'AMO_NO_AUTORIZADO'
         then 'true'::jsonb else jsonb_build_object('finanzas', v_e, 'medio', v_e2, 'anunciante', v_e3) end);
  r := r || jsonb_build_object('x02_causa_obligatoria', pg_temp.es(pg_temp.srv_falla(format(
    'select public.cancelar_asignacion_srv(%L, null, ''Métricas falsas'', false, %L, %L)', a_cf, u_ope, s_ope)),
    'AMO_MOTIVO_REQUERIDO', 'Indica la causa de la cancelación.'));
  r := r || jsonb_build_object('x03_motivo_obligatorio', pg_temp.es(pg_temp.srv_falla(format(
    'select public.cancelar_asignacion_srv(%L, ''FRAUDE'', null, false, %L, %L)', a_cf, u_ope, s_ope)),
    'AMO_MOTIVO_REQUERIDO', 'Indica el motivo del cambio.'));
  r := r || jsonb_build_object('x04_suspension_solo_con_fraude_o_incumplimiento', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, a_cf, 'ADMINISTRATIVA', 'Métricas falsas', true, u_ope, s_ope)),
    'AMO_TRANSICION_INVALIDA', 'La suspensión acompaña solo una cancelación por fraude o incumplimiento del medio.'));
  -- Atomicidad: quien cancela pero no puede suspender no deja la asignación cancelada sin el medio suspendido.
  v_e := pg_temp.srv_falla(format(v_txt, a_cf, 'FRAUDE', 'Métricas falsas comprobadas con el panel', true, u_gs, s_gs));
  r := r || jsonb_build_object('x05_cancelar_y_suspender_o_nada',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO'
              and (select estado = 'METRICAS_CARGADAS' from public.asignaciones where id = a_cf)
              and (select estado = 'VERIFICADO' from public.medios where id = me_c)
         then 'true'::jsonb else v_e end);
  select o.cupos_ocupados, o.presupuesto_comprometido into v_n, v_num from public.ofertas o where o.id = o_cn;
  select oc.cupos_ocupados into v_m from public.oferta_cupos oc where oc.oferta_id = o_cn and oc.franja_id = fr1;
  select c.presupuesto_comprometido into v_camp from public.campanas c where c.id = c_v;
  v_res := pg_temp.srv(format(v_txt, a_cf, 'FRAUDE', 'Métricas falsas comprobadas con el panel', true, u_ope, s_ope));
  r := r || jsonb_build_object('x06_fraude_cancela_y_suspende',
    case when v_res = jsonb_build_object('asignacion_id', a_cf, 'estado', 'CANCELADA', 'medio_suspendido', true)
              and (select estado = 'CANCELADA' and causa_cancelacion = 'FRAUDE' and cancelada_at = t0 + interval '6 hours'
                          and motivo = 'Métricas falsas comprobadas con el panel' from public.asignaciones where id = a_cf)
              and (select estado = 'SUSPENDIDO' and motivo_estado = 'Métricas falsas comprobadas con el panel'
                          and suspendido_at = t0 + interval '6 hours' from public.medios where id = me_c)
         then 'true'::jsonb else v_res end);
  select monto_bruto into v_num2 from public.asignaciones where id = a_cf;
  r := r || jsonb_build_object('x07_libera_cupo_y_presupuesto',
    (select cupos_ocupados = v_n - 1 and presupuesto_comprometido = v_num - v_num2 from public.ofertas where id = o_cn)
    and (select cupos_ocupados = v_m - 1 from public.oferta_cupos where oferta_id = o_cn and franja_id = fr1)
    and (select presupuesto_comprometido = v_camp - v_num2 from public.campanas where id = c_v));
  r := r || jsonb_build_object('x08_avisos_de_cancelacion_y_suspension',
    (select count(distinct usuario_id) = 2 from public.notificaciones
     where tipo = 'asignacion.cancelada' and entidad_id = a_cf::text and usuario_id in (u_mc, u_an)
       and mensaje = 'La asignación de «Post para cancelar» fue cancelada. Motivo: Métricas falsas comprobadas con el panel')
    and (select count(*) = 1 from public.notificaciones
         where tipo = 'medio.suspendido' and usuario_id = u_mc and entidad_id = me_c::text
           and mensaje = '**Medio Humo C** fue suspendido: Métricas falsas comprobadas con el panel. Mientras tanto no verás '
                         'ofertas nuevas.'));
  v_res := pg_temp.srv(format(v_txt, a_cs, 'INCUMPLIMIENTO_MEDIO', 'No descargó el contenido a tiempo', true, u_ope, s_ope));
  r := r || jsonb_build_object('x09_medio_ya_suspendido',
    case when v_res = jsonb_build_object('asignacion_id', a_cs, 'estado', 'CANCELADA', 'medio_suspendido', false)
              and (select causa_cancelacion = 'INCUMPLIMIENTO_MEDIO' from public.asignaciones where id = a_cs)
         then 'true'::jsonb else v_res end);
  v_j := pg_temp.como(c_mc, 'authenticated', 'select to_jsonb(e) from public.mi_elegibilidad_marketplace() e');
  v_n := pg_temp.como(c_mc, 'authenticated', 'select count(*) from public.marketplace_medio(null, true, ''fecha'', 100, 0)');
  r := r || jsonb_build_object('x10_el_suspendido_ve_el_motivo',
    case when v_j = jsonb_build_object('motivo', 'MEDIO_SUSPENDIDO', 'detalle',
                      'Tu medio está suspendido: Métricas falsas comprobadas con el panel. Mientras tanto no verás ofertas nuevas.')
              and v_n = 0
         then 'true'::jsonb else jsonb_build_object('elegibilidad', v_j, 'ofertas', v_n) end);
  v_e := pg_temp.srv_falla(format(v_txt, a_lq, 'ADMINISTRATIVA', 'Error de digitación', false, u_adm, s_adm));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_pg, 'FRAUDE', 'Fraude descubierto tarde', true, u_adm, s_adm));
  r := r || jsonb_build_object('x11_liquidada_o_pagada_anula_primero',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'La asignación ya está en una liquidación: anula primero la liquidación.',
                         'liquidacion_vigente') = 'true'
              and v_e2 ->> 'h' = 'liquidacion_vigente'
         then 'true'::jsonb else jsonb_build_object('liquidada', v_e, 'pagada', v_e2) end);
  r := r || jsonb_build_object('v12_metrica_de_asignacion_cerrada', pg_temp.es(pg_temp.srv_falla(format(
    'select public.validar_metrica_srv(%L, true, ''Revisada'', %L, %L)', m_cf_h, u_ope, s_ope)),
    'AMO_TRANSICION_INVALIDA', null, 'asignacion_cerrada'));

  -- ── (s) ADM-002 · D73: suspensión y reactivación del medio D (T+7h) ──────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '7 hours')::text, true);
  v_txt := format('select jsonb_agg(jsonb_build_object(''id'', id, ''estado'', estado, ''cancelable'', cancelable,
                                                       ''disputa'', disputa_abierta_id, ''oferta'', oferta_titulo,
                                                       ''anunciante'', anunciante, ''monto'', monto_bruto)
                                    order by fecha_limite_publicacion, id)
                   from public.asignaciones_en_curso_medio(%L)', me_d);
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt);
  r := r || jsonb_build_object('s01_asignaciones_en_curso_para_decidir',
    case when jsonb_array_length(v_j) = 4
              and v_j @> jsonb_build_array(
                    jsonb_build_object('id', a_d1, 'estado', 'PUBLICADA', 'cancelable', true, 'oferta', 'Post para cancelar',
                                       'anunciante', 'Humo E3 Verificada'),
                    jsonb_build_object('id', a_d2, 'estado', 'CONTENIDO_ENTREGADO', 'cancelable', true),
                    jsonb_build_object('id', a_d3, 'estado', 'VERIFICADA', 'cancelable', true),
                    jsonb_build_object('id', a_d4, 'estado', 'METRICAS_CARGADAS', 'cancelable', true))
              and not exists (select 1 from jsonb_array_elements(v_j) e where e ->> 'disputa' is not null)
         then 'true'::jsonb else v_j end);
  v_n := coalesce(jsonb_array_length(pg_temp.como(c_md, 'authenticated', v_txt)), 0);
  v_m := coalesce(jsonb_array_length(pg_temp.como(c_an, 'authenticated', v_txt)), 0);
  v_p := coalesce(jsonb_array_length(pg_temp.como(c_fin, 'authenticated', v_txt)), 0);
  r := r || jsonb_build_object('s02_en_curso_solo_para_el_equipo', v_n = 0 and v_m = 0 and v_p = 4);
  v_txt2 := 'select public.transicionar_srv(''medios'', %L, %L, %L, %L, %L)';
  v_e := pg_temp.srv_falla(format(v_txt2, me_d, 'SUSPENDIDO', u_fin, s_fin, 'Revisión de cumplimiento en curso'));
  v_e2 := pg_temp.srv_falla(format(v_txt2, me_d, 'SUSPENDIDO', u_ope, s_ope, null));
  r := r || jsonb_build_object('s03_suspender_exige_permiso_y_motivo',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_MOTIVO_REQUERIDO'
         then 'true'::jsonb else jsonb_build_object('finanzas', v_e, 'sin_motivo', v_e2) end);
  perform pg_temp.srv(format(v_txt2, me_d, 'SUSPENDIDO', u_ope, s_ope, 'Revisión de cumplimiento en curso'));
  v_j := pg_temp.como(c_md, 'authenticated', 'select to_jsonb(e) from public.mi_elegibilidad_marketplace() e');
  r := r || jsonb_build_object('s04_suspendido_con_su_motivo',
    case when (select estado = 'SUSPENDIDO' and suspendido_at = t0 + interval '7 hours' from public.medios where id = me_d)
              and v_j ->> 'detalle' = 'Tu medio está suspendido: Revisión de cumplimiento en curso. Mientras tanto no verás ofertas nuevas.'
              and exists (select 1 from public.notificaciones where tipo = 'medio.suspendido' and usuario_id = u_md)
         then 'true'::jsonb else v_j end);
  -- D73: sigue cumpliendo lo que tiene (métricas y evidencias) y puede disputar.
  m_d1_h := pg_temp.como(c_md, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''H24'', %L, 9000, 12000, 200, %L) returning to_jsonb(id)',
    p_d1, t0 - interval '8 days', v_ev || a_d1 || '/metrica/h24-1.webp')) #>> '{}';
  v_j := pg_temp.srv(format('select to_jsonb(public.registrar_evidencia_srv(%L, 1, %L, %L, %L, null, true, %L, %L))',
                            a_d2, 'https://www.instagram.com/p/HumoE3d2/', t0 + interval '6 hours',
                            v_ev || a_d2 || '/publicacion/1.webp', u_md, s_md));
  p_d2 := v_j #>> '{}';
  d_p := pg_temp.srv(format('select to_jsonb(public.abrir_disputa_srv(%L, ''CONTENIDO'', %L, %L, %L))', a_d1,
                            'El anunciante pidió cambios fuera de lo acordado', u_md, s_md)) #>> '{}';
  r := r || jsonb_build_object('s05_el_suspendido_sigue_cumpliendo',
    (select estado_validacion = 'PENDIENTE' from public.metricas where id = m_d1_h)
    and (select estado = 'PUBLICADA' from public.asignaciones where id = a_d2)
    and (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'PUBLICADA' from public.asignaciones where id = a_d1)
    and (select parte = 'MEDIO' and estado = 'ABIERTA' from public.disputas where id = d_p));
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt);
  r := r || jsonb_build_object('s06_en_disputa_no_se_cancela_desde_la_lista',
    case when v_j @> jsonb_build_array(jsonb_build_object('id', a_d1, 'estado', 'EN_DISPUTA', 'cancelable', false, 'disputa', d_p))
         then 'true'::jsonb else v_j end);
  r := r || jsonb_build_object('x12_en_disputa_se_cancela_al_resolverla', pg_temp.es(pg_temp.srv_falla(format(
    'select public.cancelar_asignacion_srv(%L, ''INCUMPLIMIENTO_MEDIO'', ''No cumplió'', false, %L, %L)', a_d1, u_ope, s_ope)),
    'AMO_TRANSICION_INVALIDA', 'La asignación está en disputa: cancélala al resolver la disputa.', 'en_disputa'));
  -- D73 · INT-006: la verificada del suspendido se liquida; la que aún no está verificada, no.
  v_liq := pg_temp.srv(format('select to_jsonb(public.generar_liquidacion_srv(%L, %L, %L, %L, %L))', me_d,
                              private.hoy() - 30, private.hoy(), u_fin, s_fin)) #>> '{}';
  r := r || jsonb_build_object('s07_sus_verificadas_se_liquidan',
    (select estado = 'LIQUIDADA' and liquidacion_id = v_liq from public.asignaciones where id = a_d3)
    and (select estado = 'METRICAS_CARGADAS' and liquidacion_id is null from public.asignaciones where id = a_d4)
    and (select cantidad_asignaciones = 1 from public.liquidaciones where id = v_liq));
  perform pg_temp.srv(format(v_txt2, me_d, 'VERIFICADO', u_ope, s_ope, 'Cumplimiento revisado: sin hallazgos'));
  v_j := pg_temp.como(c_md, 'authenticated', 'select to_jsonb(e) from public.mi_elegibilidad_marketplace() e');
  r := r || jsonb_build_object('s08_reactivado',
    case when v_j ->> 'motivo' = 'OK' and (select estado = 'VERIFICADO' from public.medios where id = me_d)
              and exists (select 1 from public.notificaciones where tipo = 'medio.reactivado' and usuario_id = u_md)
         then 'true'::jsonb else v_j end);

  -- ── (r) ADM-009 · INT-006: verificación, la única puerta a pago (T+8h) ───────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '8 hours')::text, true);
  v_ids := array[o_ev, o_rc, o_al, o_vf, o_cn, o_vc, o_vz, o_dp, o_vx];
  v_txt := 'select public.transicionar_srv(''asignaciones'', %L, ''VERIFICADA'', %L, %L, %L, %L)';
  v_txt2 := format('select jsonb_agg(jsonb_build_object(''a'', asignacion_id, ''lista'', lista, ''bloqueo'', bloqueo,
                                                        ''requeridos'', cortes_requeridos, ''aprobados'', cortes_aprobados,
                                                        ''pendientes'', metricas_pendientes, ''permanencia'', permanencia_hasta)
                                     order by ordinality)
                    from public.cola_verificacion(200, 0) with ordinality where oferta_id = any (%L::uuid[])', v_ids);
  v_e := pg_temp.srv_falla(format(v_txt, a_vf, u_ope, s_ope, null, '{}'));
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt2);
  r := r || jsonb_build_object('r01_faltan_metricas_requeridas',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'Todas las métricas requeridas deben estar aprobadas.') = 'true'
              and v_j @> jsonb_build_array(jsonb_build_object('a', a_vf, 'lista', false, 'bloqueo', 'METRICAS', 'requeridos', 1,
                                                              'aprobados', 0, 'pendientes', 2))
         then 'true'::jsonb else jsonb_build_object('verificar', v_e, 'cola', v_j) end);
  perform pg_temp.srv(format('select public.validar_metrica_srv(%L, true, null, %L, %L)', m_vf_h, u_ope, s_ope));
  v_e := pg_temp.srv_falla(format(v_txt, a_vf, u_ope, s_ope, null, '{}'));
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt2);
  -- El corte personalizado pendiente también cuenta.
  r := r || jsonb_build_object('r02_sin_metricas_pendientes',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'Hay métricas pendientes de revisión en esta asignación.',
                         'metricas_pendientes') = 'true'
              and v_j @> jsonb_build_array(jsonb_build_object('a', a_vf, 'lista', false, 'bloqueo', 'METRICAS', 'aprobados', 1,
                                                              'pendientes', 1))
         then 'true'::jsonb else jsonb_build_object('verificar', v_e, 'cola', v_j) end);
  perform pg_temp.srv(format('select public.validar_metrica_srv(%L, true, null, %L, %L)', m_vf_p, u_ope, s_ope));
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt2);
  r := r || jsonb_build_object('r03_cola_de_verificacion_listas_primero',
    case when (v_j -> 0) - 'permanencia' = jsonb_build_object('a', a_vf, 'lista', true, 'bloqueo', null, 'requeridos', 1,
                                                            'aprobados', 1, 'pendientes', 0)
              and (v_j -> 0 ->> 'permanencia')::timestamptz = t0 - interval '2 days'
              and not exists (select 1 from jsonb_array_elements(v_j) with ordinality e (x, i)
                              where i > 1 and (x ->> 'lista')::boolean)
              and jsonb_array_length(v_j) > 1
         then 'true'::jsonb else v_j end);
  r := r || jsonb_build_object('r04_finanzas_no_verifica', pg_temp.es(pg_temp.srv_falla(format(v_txt, a_vf, u_fin, s_fin, null, '{}')),
    'AMO_NO_AUTORIZADO'));
  perform pg_temp.srv(format(v_txt, a_vf, u_ope, s_ope, null, '{}'));
  r := r || jsonb_build_object('r05_verificada',
    (select estado = 'VERIFICADA' and verificada_at = t0 + interval '8 hours' from public.asignaciones where id = a_vf)
    and (select permanencia_verificada_at = t0 + interval '8 hours' from public.publicaciones where id = p_vf)
    and (select count(*) = 1 from public.notificaciones
         where tipo = 'asignacion.verificada' and usuario_id = u_mb and entidad_id = a_vf::text
           and mensaje = 'Verificamos tu publicación de «Post para verificar». Entrará en tu próxima liquidación.'));
  r := r || jsonb_build_object('r06_sin_verificar_no_se_liquida',
    case when pg_temp.es(pg_temp.srv_falla(format('select public.transicionar_srv(''asignaciones'', %L, ''LIQUIDADA'', %L, %L)',
                                                  a_dm, u_adm, s_adm)), 'AMO_TRANSICION_INVALIDA') = 'true'
              and (select array_agg(distinct t.desde) = '{VERIFICADA}' from private.transiciones_estado t
                   where t.entidad = 'asignaciones' and t.hacia = 'LIQUIDADA')
         then 'true'::jsonb else 'false'::jsonb end);

  -- ── (d) ADM-011: apertura de disputas (T+8h30) ───────────────────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '8 hours 30 minutes')::text, true);
  v_txt := 'select to_jsonb(public.abrir_disputa_srv(%L, %L, %L, %L, %L))';
  v_e := pg_temp.srv_falla(format(v_txt, a_pg, 'PAGO', 'El pago no corresponde a lo acordado', u_mb, s_mb));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_pg, 'METRICAS', 'Las cifras no coinciden con la cuenta', u_an, s_an));
  v_e3 := pg_temp.srv_falla(format(v_txt, a_lq, 'PAGO', 'El pago no corresponde a lo acordado', u_mb, s_mb));
  r := r || jsonb_build_object('d01_pagada_o_liquidada_no_se_disputa',
    case when (select bool_and(x ->> 'e' = 'AMO_TRANSICION_INVALIDA'
                               and x ->> 'd' = 'La asignación no se puede disputar en su estado actual.')
               from unnest(array[v_e, v_e2, v_e3]) x)
         then 'true'::jsonb else jsonb_build_object('pagada_medio', v_e, 'pagada_anunciante', v_e2, 'liquidada', v_e3) end);
  v_e := pg_temp.srv_falla(format(v_txt, a_dm, 'METRICAS', 'Las cifras no coinciden con la cuenta', u_ma, s_ma));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_dm, 'METRICAS', 'Las cifras no coinciden con la cuenta', u_ao, s_ao));
  v_e3 := pg_temp.srv_falla(format(v_txt, a_dm, 'METRICAS', 'Las cifras no coinciden con la cuenta', u_fin, s_fin));
  r := r || jsonb_build_object('d02_terceros_y_finanzas_no_abren',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e3 ->> 'e' = 'AMO_NO_AUTORIZADO'
         then 'true'::jsonb else jsonb_build_object('otro_medio', v_e, 'otra_empresa', v_e2, 'finanzas', v_e3) end);
  v_e := pg_temp.srv_falla(format(v_txt, a_dm, 'METRICAS', '   ', u_an, s_an));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_dm, 'METRICAS', 'Corta', u_an, s_an));
  r := r || jsonb_build_object('d03_descripcion_de_al_menos_10',
    case when pg_temp.es(v_e, 'AMO_MOTIVO_REQUERIDO', 'Describe el motivo de la disputa.') = 'true'
              and pg_temp.es_estado(v_e2, '23514', 'disputas_descripcion_chk') = 'true'
         then 'true'::jsonb else jsonb_build_object('vacia', v_e, 'corta', v_e2) end);
  d_m := pg_temp.srv(format(v_txt, a_dm, 'METRICAS', 'Las cifras no coinciden con lo que vemos en la cuenta', u_an, s_an)) #>> '{}';
  r := r || jsonb_build_object('d04_el_anunciante_abre',
    (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'METRICAS_CARGADAS' and en_disputa_at = t0 + interval '510 minutes'
     from public.asignaciones where id = a_dm)
    and (select parte = 'ANUNCIANTE' and estado = 'ABIERTA' and estado_asignacion_origen = 'METRICAS_CARGADAS'
                and abierta_por = u_an and motivo = 'METRICAS' from public.disputas where id = d_m));
  r := r || jsonb_build_object('d05_una_disputa_abierta_por_asignacion', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, a_dm, 'OTRO', 'También quiero reportar algo', u_mb, s_mb)),
    'AMO_TRANSICION_INVALIDA', 'Ya hay una disputa abierta sobre esta asignación.'));
  r := r || jsonb_build_object('d06_avisos_de_apertura',
    (select count(*) = 1 from public.notificaciones
     where tipo = 'disputa.abierta' and usuario_id = u_mb and entidad_id = d_m::text
       and mensaje = 'Se abrió una disputa sobre «Post para cancelar» por métricas.')
    and not exists (select 1 from public.notificaciones where tipo = 'disputa.abierta' and usuario_id = u_an and entidad_id = d_m::text)
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'cola.disputa' and entidad_id = d_m::text and usuario_id in (u_adm, u_ope))
    and not exists (select 1 from public.notificaciones where tipo = 'cola.disputa' and entidad_id = d_m::text
                      and usuario_id in (u_fin, u_gs)));
  d_e := pg_temp.srv(format(v_txt, a_de, 'CONTENIDO', 'La pieza publicada no corresponde al creativo aprobado', u_adm, s_adm))
         #>> '{}';
  r := r || jsonb_build_object('d07_el_equipo_abre',
    (select parte = 'ADMIN' and estado_asignacion_origen = 'EVIDENCIA_VALIDADA' from public.disputas where id = d_e)
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'disputa.abierta' and entidad_id = d_e::text and usuario_id in (u_ma, u_an)));
  d_v := pg_temp.srv(format(v_txt, a_vf, 'PERMANENCIA', 'El post ya no está en la cuenta del medio', u_an, s_an)) #>> '{}';
  r := r || jsonb_build_object('d08_permanencia_marca_el_post_retirado',
    (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'VERIFICADA' from public.asignaciones where id = a_vf)
    and (select retirada_detectada_at = t0 + interval '510 minutes' from public.publicaciones where id = p_vf));

  -- ── (h) ADM-012 · D71: hilo con su parte, notas internas y avisos (T+9h, disputa del medio D) ──────────────────
  perform set_config('amo.reloj', (t0 + interval '9 hours')::text, true);
  v_txt := 'insert into public.disputa_mensajes (disputa_id, mensaje, adjunto_path, interno) values (%L, %L, %L, %L)';
  v_n := pg_temp.hacer(c_md, 'authenticated', format(v_txt, d_p, 'Adjunto la conversación con la marca',
                                                     'disputa/' || d_p || '/' || gen_random_uuid() || '.pdf', false));
  v_m := pg_temp.hacer(c_an, 'authenticated', format(v_txt, d_p, 'Pedimos lo mismo que decía la oferta', null, false));
  r := r || jsonb_build_object('h01_las_partes_escriben_con_su_parte',
    v_n = 1 and v_m = 1
    and (select array_agg(autor_parte::text || ':' || autor_id order by id) = array['MEDIO:' || u_md, 'ANUNCIANTE:' || u_an]
                and bool_and(created_at = t0 + interval '9 hours')
         from public.disputa_mensajes where disputa_id = d_p));
  v_e := pg_temp.falla(c_md, 'authenticated', format(v_txt, d_p, 'Nota que solo quiero para el equipo',
                                                     'disputa/' || d_p || '/interno/' || gen_random_uuid() || '.pdf', true));
  v_e2 := pg_temp.falla(c_md, 'authenticated', format(v_txt, d_p, 'Nota que solo quiero para el equipo', null, true));
  r := r || jsonb_build_object('h02_las_partes_no_escriben_notas_internas',
    case when v_e ->> 's' = '42501' and v_e2 ->> 's' = '42501' then 'true'::jsonb
         else jsonb_build_object('con_adjunto', v_e, 'sin_adjunto', v_e2) end);
  v_e := pg_temp.falla(c_ma, 'authenticated', format(v_txt, d_p, 'Me meto en una disputa ajena', null, false));
  v_e2 := pg_temp.falla(c_ao, 'authenticated', format(v_txt, d_p, 'Me meto en una disputa ajena', null, false));
  v_e3 := pg_temp.falla(c_fin, 'authenticated', format(v_txt, d_p, 'Finanzas opina', null, false));
  r := r || jsonb_build_object('h03_terceros_y_finanzas_no_escriben',
    case when v_e ->> 's' = '42501' and v_e2 ->> 's' = '42501' and v_e3 ->> 's' = '42501' then 'true'::jsonb
         else jsonb_build_object('otro_medio', v_e, 'otra_empresa', v_e2, 'finanzas', v_e3) end);
  r := r || jsonb_build_object('h04_adjunto_interno_en_su_carpeta', pg_temp.es_estado(pg_temp.falla(c_ope, 'authenticated',
    format(v_txt, d_p, 'Nota interna con adjunto fuera de su carpeta', 'disputa/' || d_p || '/' || gen_random_uuid() || '.pdf', true)),
    '23514', 'disputa_mensajes_adjunto_chk'));
  v_n := pg_temp.hacer(c_ope, 'authenticated', format(v_txt, d_p, 'Revisé el chat: la marca sí pidió cambios',
                                                      'disputa/' || d_p || '/interno/' || gen_random_uuid() || '.pdf', true));
  v_m := pg_temp.hacer(c_adm, 'authenticated', format(v_txt, d_p, 'Estamos revisando el caso con las dos partes', null, false));
  r := r || jsonb_build_object('h05_el_equipo_escribe_y_anota',
    v_n = 1 and v_m = 1
    and (select count(*) = 2 from public.disputa_mensajes where disputa_id = d_p and autor_parte = 'ADMIN'));
  v_txt2 := format('select jsonb_agg(jsonb_build_object(''parte'', autor_parte, ''nombre'', autor_nombre, ''persona'', autor_persona,
                                                        ''mio'', es_mio, ''interno'', interno) order by created_at, id)
                    from public.mensajes_disputa(%L)', d_p);
  v_j := pg_temp.como(c_md, 'authenticated', v_txt2);
  v_k := pg_temp.como(c_an, 'authenticated', v_txt2);
  r := r || jsonb_build_object('h06_hilo_de_las_partes_sin_notas_internas',
    case when v_j = jsonb_build_array(
                      jsonb_build_object('parte', 'MEDIO', 'nombre', 'Medio Humo D', 'persona', null, 'mio', true, 'interno', false),
                      jsonb_build_object('parte', 'ANUNCIANTE', 'nombre', 'Humo E3 Verificada', 'persona', null, 'mio', false,
                                         'interno', false),
                      jsonb_build_object('parte', 'ADMIN', 'nombre', 'Equipo AMO', 'persona', null, 'mio', false, 'interno', false))
              and v_k = jsonb_build_array(
                      jsonb_build_object('parte', 'MEDIO', 'nombre', 'Medio Humo D', 'persona', null, 'mio', false, 'interno', false),
                      jsonb_build_object('parte', 'ANUNCIANTE', 'nombre', 'Humo E3 Verificada', 'persona', null, 'mio', true,
                                         'interno', false),
                      jsonb_build_object('parte', 'ADMIN', 'nombre', 'Equipo AMO', 'persona', null, 'mio', false, 'interno', false))
         then 'true'::jsonb else jsonb_build_object('medio', v_j, 'anunciante', v_k) end);
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt2);
  v_k := pg_temp.como(c_fin, 'authenticated', v_txt2);
  r := r || jsonb_build_object('h07_hilo_del_equipo_con_notas_y_personas',
    case when jsonb_array_length(v_j) = 4
              and v_j -> 0 = jsonb_build_object('parte', 'MEDIO', 'nombre', 'Medio Humo D', 'persona', 'Diana Medio', 'mio', false,
                                                'interno', false)
              and v_j -> 2 = jsonb_build_object('parte', 'ADMIN', 'nombre', 'Equipo AMO', 'persona', 'Óscar Operaciones', 'mio', true,
                                                'interno', true)
              and jsonb_array_length(v_k) = 4 and (v_k -> 2 ->> 'interno')::boolean
              and not exists (select 1 from jsonb_array_elements(v_k) e where e ->> 'persona' is not null)
         then 'true'::jsonb else jsonb_build_object('operaciones', v_j, 'finanzas', v_k) end);
  v_j := pg_temp.como(c_ma, 'authenticated', v_txt2);
  v_k := pg_temp.como(c_ao, 'authenticated', v_txt2);
  v_n := pg_temp.como(c_md, 'authenticated', format('select count(*) from public.disputa_mensajes where disputa_id = %L', d_p));
  v_m := pg_temp.como(c_fin, 'authenticated', format('select count(*) from public.disputa_mensajes where disputa_id = %L', d_p));
  r := r || jsonb_build_object('h08_terceros_sin_hilo_y_rls_sin_internas',
    case when v_j is null and v_k is null and v_n = 3 and v_m = 4 then 'true'::jsonb
         else jsonb_build_object('otro_medio', v_j, 'otra_empresa', v_k, 'parte', v_n, 'finanzas', v_m) end);
  -- Avisos: la otra parte por cada mensaje que no es interno; el equipo, una vez, cuando escribe una parte.
  r := r || jsonb_build_object('h09_avisos_de_mensajes',
    (select count(*) = 2 from public.notificaciones
     where tipo = 'disputa.mensaje' and entidad_id = d_p::text and usuario_id = u_an
       and mensaje = 'Hay un mensaje nuevo en la disputa sobre «Post para cancelar».')
    and (select count(*) = 2 from public.notificaciones where tipo = 'disputa.mensaje' and entidad_id = d_p::text and usuario_id = u_md)
    and (select count(*) = 1 from public.notificaciones
         where tipo = 'cola.disputa_mensaje' and entidad_id = d_p::text and usuario_id = u_adm
           and mensaje = 'Una de las partes escribió en la disputa sobre «Post para cancelar».')
    and (select count(*) = 1 from public.notificaciones where tipo = 'cola.disputa_mensaje' and entidad_id = d_p::text
           and usuario_id = u_ope)
    and not exists (select 1 from public.notificaciones where tipo in ('cola.disputa_mensaje', 'disputa.mensaje')
                      and entidad_id = d_p::text and usuario_id in (u_fin, u_ma, u_ao)));
  -- Los adjuntos de las notas internas no los leen las partes en Storage.
  insert into storage.objects (bucket_id, name, metadata)
  values ('evidencias', 'disputa/' || d_p || '/chat.pdf', '{"size": 2048, "mimetype": "application/pdf"}'),
         ('evidencias', 'disputa/' || d_p || '/interno/nota.pdf', '{"size": 2048, "mimetype": "application/pdf"}');
  v_txt2 := format('select count(*) from storage.objects where bucket_id = ''evidencias'' and name like %L', 'disputa/' || d_p || '/%');
  v_n := pg_temp.como(c_md, 'authenticated', v_txt2);
  v_m := pg_temp.como(c_an, 'authenticated', v_txt2);
  v_p := pg_temp.como(c_fin, 'authenticated', v_txt2);
  v_q := pg_temp.como(c_ma, 'authenticated', v_txt2);
  r := r || jsonb_build_object('h10_adjuntos_internos_ocultos_en_storage', v_n = 1 and v_m = 1 and v_p = 2 and v_q = 0);

  -- ── (z) ADM-012: resolución con cada destino (T+10h) ─────────────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '10 hours')::text, true);
  v_txt := 'select public.transicionar_srv(''disputas'', %L, %L, %L, %L, %L, %L)';
  perform pg_temp.srv(format(v_txt, d_p, 'EN_REVISION', u_ope, s_ope, null, '{}'));
  r := r || jsonb_build_object('z01_en_revision_sin_motivo',
    (select estado = 'EN_REVISION' from public.disputas where id = d_p));
  v_e := pg_temp.srv_falla(format(v_txt, d_p, 'RESUELTA', u_fin, s_fin, 'Resuelvo yo',
                                  '{"estado_asignacion_resultante": "PUBLICADA"}'));
  v_e2 := pg_temp.srv_falla(format(v_txt, d_p, 'RESUELTA', u_ope, s_ope, null, '{"estado_asignacion_resultante": "PUBLICADA"}'));
  r := r || jsonb_build_object('z02_resolver_exige_permiso_y_motivo',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('finanzas', v_e, 'sin_motivo', v_e2) end);
  v_e := pg_temp.srv_falla(format(v_txt, d_p, 'RESUELTA', u_ope, s_ope, 'Verificar de una vez',
                                  '{"estado_asignacion_resultante": "VERIFICADA"}'));
  v_e2 := pg_temp.srv_falla(format(v_txt, d_p, 'RESUELTA', u_ope, s_ope, 'Reabrir la publicación',
                                   '{"estado_asignacion_resultante": "CONTENIDO_ENTREGADO"}'));
  v_e3 := pg_temp.srv_falla(format(v_txt, d_p, 'RESUELTA', u_ope, s_ope, 'Sin destino', '{}'));
  r := r || jsonb_build_object('z03_destino_segun_el_estado_previo',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'La resolución no es válida para el estado previo de la asignación.') = 'true'
              and pg_temp.es(v_e2, 'AMO_TRANSICION_INVALIDA',
                             'La resolución no es válida para el estado previo de la asignación.') = 'true'
              and pg_temp.es(v_e3, 'AMO_TRANSICION_INVALIDA', 'Indica un estado resultante válido para la asignación.') = 'true'
         then 'true'::jsonb else jsonb_build_object('verificar', v_e, 'reabrir', v_e2, 'sin_destino', v_e3) end);
  perform pg_temp.srv(format(v_txt, d_p, 'RESUELTA', u_ope, s_ope, 'El contenido corresponde a lo acordado',
                             '{"estado_asignacion_resultante": "PUBLICADA"}'));
  r := r || jsonb_build_object('z04_restaurar_el_estado_previo',
    (select estado = 'RESUELTA' and estado_asignacion_resultante = 'PUBLICADA' and resolucion = 'El contenido corresponde a lo acordado'
            and resuelta_por = u_ope and fecha_resolucion = t0 + interval '10 hours' from public.disputas where id = d_p)
    and (select estado = 'PUBLICADA' and estado_previo_disputa is null from public.asignaciones where id = a_d1)
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'disputa.resuelta' and entidad_id = d_p::text and usuario_id in (u_md, u_an)
           and mensaje = 'La disputa sobre «Post para cancelar» se resolvió: El contenido corresponde a lo acordado.'));
  v_e := pg_temp.falla(c_md, 'authenticated', format(
    'insert into public.disputa_mensajes (disputa_id, mensaje) values (%L, ''Una cosa más'')', d_p));
  v_n := pg_temp.hacer(c_ope, 'authenticated', format(
    'insert into public.disputa_mensajes (disputa_id, mensaje, interno) values (%L, ''Caso cerrado sin cambios'', true)', d_p));
  r := r || jsonb_build_object('h11_cerrada_solo_escribe_quien_resuelve',
    case when v_e ->> 's' = '42501' and v_n = 1 then 'true'::jsonb else jsonb_build_object('parte', v_e, 'equipo', v_n) end);
  -- Disputa del anunciante sobre METRICAS_CARGADAS: se valida durante la disputa y verificar exige lo mismo que siempre.
  v_res := pg_temp.srv(format('select public.validar_metrica_srv(%L, true, null, %L, %L)', m_dm_h, u_ope, s_ope));
  r := r || jsonb_build_object('z05_se_valida_durante_la_disputa',
    case when v_res ->> 'estado' = 'EN_DISPUTA' and (select estado_validacion = 'APROBADA' from public.metricas where id = m_dm_h)
         then 'true'::jsonb else v_res end);
  v_e := pg_temp.srv_falla(format(v_txt, d_m, 'RESUELTA', u_adm, s_adm, 'Las métricas coinciden con el panel',
                                  '{"estado_asignacion_resultante": "VERIFICADA"}'));
  v_e2 := pg_temp.srv_falla(format(v_txt, d_m, 'RESUELTA', u_ope, s_ope, 'Las métricas coinciden con el panel',
                                   '{"estado_asignacion_resultante": "VERIFICADA", "permanencia_verificada": true}'));
  r := r || jsonb_build_object('z06_verificar_por_la_disputa_con_las_mismas_exigencias',
    case when pg_temp.es(v_e, 'AMO_PERMANENCIA_PENDIENTE', 'Aún no se cumple la permanencia mínima de la publicación.') = 'true'
              and v_e2 ->> 'e' = 'AMO_PERMANENCIA_PENDIENTE'
         then 'true'::jsonb else jsonb_build_object('admin', v_e, 'operaciones_con_constancia', v_e2) end);
  perform pg_temp.srv(format(v_txt, d_m, 'RESUELTA', u_adm, s_adm, 'Revisé el post: sigue publicado y las cifras coinciden',
                             '{"estado_asignacion_resultante": "VERIFICADA", "permanencia_verificada": true}'));
  r := r || jsonb_build_object('z07_verificar_por_la_disputa',
    (select estado = 'VERIFICADA' and verificada_at = t0 + interval '10 hours' and estado_previo_disputa is null
     from public.asignaciones where id = a_dm)
    and (select permanencia_verificada_at = t0 + interval '10 hours' from public.publicaciones where id = p_dm)
    and (select estado = 'RESUELTA' and estado_asignacion_resultante = 'VERIFICADA' from public.disputas where id = d_m)
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.verificada' and usuario_id = u_mb
                  and entidad_id = a_dm::text));

  -- ── (m) ADM-008: validación de métricas (T+11h) ──────────────────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '11 hours')::text, true);
  v_txt := 'select public.validar_metrica_srv(%L, %L, %L, %L, %L)';
  v_e := pg_temp.srv_falla(format(v_txt, m_e1_1, true, null, u_fin, s_fin));
  v_e2 := pg_temp.srv_falla(format(v_txt, m_e1_1, true, null, u_ma, s_ma));
  v_e3 := pg_temp.srv_falla(format(v_txt, m_e1_1, true, null, u_an, s_an));
  r := r || jsonb_build_object('m01_solo_quien_valida_metricas',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e3 ->> 'e' = 'AMO_NO_AUTORIZADO'
         then 'true'::jsonb else jsonb_build_object('finanzas', v_e, 'medio', v_e2, 'anunciante', v_e3) end);
  r := r || jsonb_build_object('m02_metrica_inexistente', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, gen_random_uuid(), true, null, u_ope, s_ope)), 'AMO_TRANSICION_INVALIDA', 'La métrica no existe.'));
  r := r || jsonb_build_object('m03_rechazar_exige_observaciones', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, m_e1_2, false, ' ', u_ope, s_ope)), 'AMO_MOTIVO_REQUERIDO', 'Indica qué debe corregir el medio.'));
  v_res := pg_temp.srv(format(v_txt, m_e1_2, false, 'La captura no muestra la fecha', u_ope, s_ope));
  r := r || jsonb_build_object('m04_rechazo_vuelve_a_evidencia_validada',
    case when v_res = jsonb_build_object('asignacion_id', a_e1, 'estado', 'EVIDENCIA_VALIDADA')
              and (select estado_validacion = 'RECHAZADA' and observaciones = 'La captura no muestra la fecha' and validada_por = u_ope
                   from public.metricas where id = m_e1_2)
              and (select count(*) = 1 from public.notificaciones
                   where tipo = 'metricas.rechazadas' and usuario_id = u_ma and entidad_id = a_e1::text and prioridad = 2
                     and mensaje = 'Las métricas de 24 horas (publicación 2) de «Post en dos publicaciones» fueron rechazadas: '
                                   'La captura no muestra la fecha.')
         then 'true'::jsonb else v_res end);
  v_res := pg_temp.srv(format(v_txt, m_e1_1, true, null, u_ope, s_ope));
  r := r || jsonb_build_object('m05_aprobar_sin_alerta',
    case when v_res ->> 'estado' = 'EVIDENCIA_VALIDADA'
              and (select estado_validacion = 'APROBADA' and validada_at = t0 + interval '11 hours' from public.metricas where id = m_e1_1)
         then 'true'::jsonb else v_res end);
  v_e := pg_temp.srv_falla(format(v_txt, m_al1_h, true, null, u_ope, s_ope));
  v_e2 := pg_temp.srv_falla(format(v_txt, m_al1_h, true, '   ', u_ope, s_ope));
  r := r || jsonb_build_object('m06_aprobar_con_alerta_exige_constancia',
    case when pg_temp.es(v_e, 'AMO_MOTIVO_REQUERIDO', 'La métrica tiene alertas: anota qué revisaste antes de aprobarla.',
                         'alerta_sin_revision') = 'true'
              and v_e2 ->> 'h' = 'alerta_sin_revision'
         then 'true'::jsonb else jsonb_build_object('nula', v_e, 'en_blanco', v_e2) end);
  perform pg_temp.srv(format(v_txt, m_al1_d, true, 'Revisé la captura: el alcance coincide con el panel', u_ope, s_ope));
  r := r || jsonb_build_object('m07_aprobar_con_alerta_y_constancia',
    (select estado_validacion = 'APROBADA' and observaciones = 'Revisé la captura: el alcance coincide con el panel'
     from public.metricas where id = m_al1_d));
  v_res := pg_temp.srv(format(v_txt, m_al1_h, false, 'El alcance no cuadra con la captura', u_ope, s_ope));
  r := r || jsonb_build_object('m08_rechazo_avisa_con_el_corte_en_palabras',
    case when v_res ->> 'estado' = 'EVIDENCIA_VALIDADA'
              and (select count(*) = 1 from public.notificaciones
                   where tipo = 'metricas.rechazadas' and usuario_id = u_ma and entidad_id = a_al1::text
                     and mensaje = 'Las métricas de 24 horas de «Post de alertas» fueron rechazadas: El alcance no cuadra con la captura.')
         then 'true'::jsonb else v_res end);

  -- T+13h: el medio corrige lo rechazado; vuelve a la cola (más de 12 h después del primer aviso).
  perform set_config('amo.reloj', (t0 + interval '13 hours')::text, true);
  v_n := pg_temp.hacer(c_ma, 'authenticated', format('update public.metricas set alcance = 18500 where id = %L', m_e1_2));
  r := r || jsonb_build_object('m09_correccion_del_medio_vuelve_a_la_cola',
    v_n = 1
    and (select estado_validacion = 'PENDIENTE' and alcance = 18500 from public.metricas where id = m_e1_2)
    and (select estado = 'METRICAS_CARGADAS' from public.asignaciones where id = a_e1)
    and (select count(*) = 2 from public.notificaciones where tipo = 'cola.metricas' and usuario_id = u_ope
           and entidad_id = a_e1::text));
  -- D67: corregir no borra la alerta; queda la anterior con sus cifras.
  v_n := pg_temp.hacer(c_ma, 'authenticated', format('update public.metricas set alcance = 12000, impresiones = 50000 where id = %L',
                                                     m_al1_h));
  select to_jsonb(m) into v_j from (select estado_validacion, alerta_desviacion, alerta_multiplo, detalle_alertas
                                    from public.metricas where id = m_al1_h) m;
  r := r || jsonb_build_object('a12_alerta_persistente_al_corregir',
    case when v_n = 1 and v_j ->> 'estado_validacion' = 'PENDIENTE'
              and (v_j ->> 'alerta_desviacion')::boolean and not (v_j ->> 'alerta_multiplo')::boolean
              and (v_j #>> '{detalle_alertas,impresiones}')::integer = 50000
              and (v_j #>> '{detalle_alertas,alerta_previa,desviacion}')::boolean
              and not (v_j #>> '{detalle_alertas,alerta_previa,multiplo_superado}')::boolean
              and (v_j #>> '{detalle_alertas,alerta_previa,alcance}')::integer = 45000
              and (v_j #>> '{detalle_alertas,alerta_previa,mediana_historica}')::numeric = 10000
              and not (v_j #> '{detalle_alertas,alerta_previa}') ? 'alerta_previa'
         then 'true'::jsonb else v_j end);
  perform pg_temp.hacer(c_ma, 'authenticated', format('update public.metricas set alcance = 11000, impresiones = 16000 where id = %L',
                                                      m_al1_h));
  select to_jsonb(m) into v_j from (select alerta_desviacion, alerta_multiplo, detalle_alertas from public.metricas where id = m_al1_h) m;
  r := r || jsonb_build_object('a13_sin_alerta_actual_conserva_la_previa',
    case when not (v_j ->> 'alerta_desviacion')::boolean and not (v_j ->> 'alerta_multiplo')::boolean
              and (v_j #>> '{detalle_alertas,alerta_previa,desviacion}')::boolean
              and (v_j #>> '{detalle_alertas,alerta_previa,impresiones}')::integer = 50000
         then 'true'::jsonb else v_j end);

  -- ── (c) ADM-008 c2 · D66: corrección auditada de una métrica aprobada (T+15h) ───────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '15 hours')::text, true);
  v_txt := 'select to_jsonb(public.corregir_metrica_srv(%L, %L, %L, %L, %L))';
  v_e := pg_temp.srv_falla(format(v_txt, m_e1_1, '{"alcance": 21000}', 'Error de digitación en el alcance', u_ope, s_ope));
  v_e2 := pg_temp.srv_falla(format(v_txt, m_e1_1, '{"alcance": 21000}', 'Error de digitación en el alcance', u_fin, s_fin));
  r := r || jsonb_build_object('c01_solo_admin_corrige',
    case when v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_e2 ->> 'e' = 'AMO_NO_AUTORIZADO' then 'true'::jsonb
         else jsonb_build_object('operaciones', v_e, 'finanzas', v_e2) end);
  v_e := pg_temp.srv_falla(format(v_txt, m_e1_1, '{"alcance": 21000}', 'Error', u_adm, s_adm));
  v_e2 := pg_temp.srv_falla(format(v_txt, m_e1_1, '{"alcance": 21000}', null, u_adm, s_adm));
  r := r || jsonb_build_object('c02_motivo_de_al_menos_10',
    case when pg_temp.es(v_e, 'AMO_MOTIVO_REQUERIDO', 'Explica qué corriges y por qué.') = 'true'
              and v_e2 ->> 'e' = 'AMO_MOTIVO_REQUERIDO'
         then 'true'::jsonb else jsonb_build_object('corto', v_e, 'nulo', v_e2) end);
  v_e := pg_temp.srv_falla(format(v_txt, m_e1_1, '{"estado_validacion": "PENDIENTE"}', 'Error de digitación en el alcance',
                                  u_adm, s_adm));
  v_e2 := pg_temp.srv_falla(format(v_txt, m_e1_1, '[21000]', 'Error de digitación en el alcance', u_adm, s_adm));
  r := r || jsonb_build_object('c03_solo_campos_de_cifras',
    case when pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', 'Campos de la corrección no válidos.') = 'true'
              and pg_temp.es(v_e2, 'AMO_TRANSICION_INVALIDA', 'Campos de la corrección no válidos.') = 'true'
         then 'true'::jsonb else jsonb_build_object('estado', v_e, 'arreglo', v_e2) end);
  r := r || jsonb_build_object('c04_solo_aprobadas', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, m_e1_2, '{"alcance": 18000}', 'Error de digitación en el alcance', u_adm, s_adm)),
    'AMO_TRANSICION_INVALIDA', 'Solo se corrige una métrica aprobada; una pendiente se aprueba o se rechaza.'));
  r := r || jsonb_build_object('c05_sin_cambios', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, m_e1_1, '{"alcance": 20000}', 'Error de digitación en el alcance', u_adm, s_adm)),
    'AMO_TRANSICION_INVALIDA', 'La corrección no cambia nada.'));
  r := r || jsonb_build_object('c06_la_correccion_respeta_la_coherencia', pg_temp.es_estado(pg_temp.srv_falla(format(
    v_txt, m_e1_1, '{"impresiones": 1000}', 'Error de digitación en las impresiones', u_adm, s_adm)),
    '23514', 'metricas_alcance_impresiones_chk'));
  v_j := pg_temp.srv(format(v_txt, m_e1_1, '{"alcance": 21000, "me_gusta": 900}', 'Error de digitación en el alcance', u_adm, s_adm));
  select to_jsonb(b) into v_k from (select actor_id, motivo, accion, cambios from public.bitacora
                                    where entidad = 'metricas' and entidad_id = m_e1_1::text order by id desc limit 1) b;
  r := r || jsonb_build_object('c07_correccion_auditada',
    case when v_j #>> '{}' = m_e1_1::text
              and (select alcance = 21000 and me_gusta = 900 and estado_validacion = 'APROBADA' and validada_por = u_ope
                          and observaciones = 'Corrección: Error de digitación en el alcance' from public.metricas where id = m_e1_1)
              and v_k ->> 'actor_id' = u_adm::text and v_k ->> 'motivo' = 'Error de digitación en el alcance'
              and v_k ->> 'accion' = 'UPDATE'
              and v_k #> '{cambios,alcance}' = '{"antes": 20000, "despues": 21000}'::jsonb
         then 'true'::jsonb else jsonb_build_object('resultado', v_j, 'bitacora', v_k) end);
  v_n := pg_temp.hacer(c_adm, 'authenticated', format('update public.metricas set alcance = 1 where id = %L', m_e1_1));
  v_m := pg_temp.hacer(c_ma, 'authenticated', format('update public.metricas set alcance = 1 where id = %L', m_e1_1));
  r := r || jsonb_build_object('c08_nadie_reescribe_cifras_por_la_sesion',
    v_n = 0 and v_m = 0 and (select alcance = 21000 from public.metricas where id = m_e1_1));
  -- T+16h: el equipo aprueba la corregida; a_e1 queda con todo aprobado (se verifica en T+3d).
  perform set_config('amo.reloj', (t0 + interval '16 hours')::text, true);
  perform pg_temp.srv(format('select public.validar_metrica_srv(%L, true, null, %L, %L)', m_e1_2, u_ope, s_ope));

  -- ── (z) D72: métricas durante la disputa y descarte (T+25h) ──────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '25 hours')::text, true);
  v_j := pg_temp.como(c_ma, 'authenticated', format(
    'select jsonb_agg(jsonb_build_object(''accion'', accion, ''vence'', vence_at)) from public.proximas_acciones_medio(100)
     where asignacion_id = %L', a_de));
  m_de_d := pg_temp.como(c_ma, 'authenticated', format(
    'insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
     values (%L, ''D7'', %L, 32000, 42000, 750, %L) returning to_jsonb(id)',
    p_de, t0 + interval '1 day', v_ev || a_de || '/metrica/d7-1.webp')) #>> '{}';
  r := r || jsonb_build_object('z08_el_medio_carga_los_cortes_durante_la_disputa',
    case when v_j = jsonb_build_array(jsonb_build_object('accion', 'CARGAR_METRICA_D7', 'vence', t0 + interval '3 days'))
              and (select estado_validacion = 'PENDIENTE' from public.metricas where id = m_de_d)
              and (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'EVIDENCIA_VALIDADA' from public.asignaciones where id = a_de)
         then 'true'::jsonb else coalesce(v_j, 'null') end);
  perform pg_temp.srv(format('select public.validar_metrica_srv(%L, true, null, %L, %L)', m_de_h, u_ope, s_ope));
  v_txt := 'select public.transicionar_srv(''disputas'', %L, %L, %L, %L, %L, %L)';
  perform pg_temp.srv(format(v_txt, d_e, 'DESCARTADA', u_ope, s_ope, 'La pieza sí corresponde al creativo aprobado', '{}'));
  r := r || jsonb_build_object('z09_descartar_restaura_y_completa',
    (select estado = 'DESCARTADA' and estado_asignacion_resultante = 'EVIDENCIA_VALIDADA' and resuelta_por = u_ope
     from public.disputas where id = d_e)
    and (select estado = 'METRICAS_CARGADAS' and metricas_cargadas_at = t0 + interval '25 hours' and estado_previo_disputa is null
         from public.asignaciones where id = a_de)
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'disputa.resuelta' and entidad_id = d_e::text and usuario_id in (u_ma, u_an)
           and mensaje = 'La disputa sobre «Post de dos cortes» se resolvió: La pieza sí corresponde al creativo aprobado.'));

  -- T+26h: la de permanencia se resuelve cancelando por incumplimiento: libera cupo y presupuesto de una verificada.
  perform set_config('amo.reloj', (t0 + interval '26 hours')::text, true);
  select o.cupos_ocupados, o.presupuesto_comprometido into v_n, v_num from public.ofertas o where o.id = o_vf;
  select monto_bruto into v_num2 from public.asignaciones where id = a_vf;
  r := r || jsonb_build_object('z10_cancelar_exige_causa', pg_temp.es(pg_temp.srv_falla(format(
    v_txt, d_v, 'RESUELTA', u_ope, s_ope, 'El medio retiró el post antes de tiempo', '{"estado_asignacion_resultante": "CANCELADA"}')),
    'AMO_MOTIVO_REQUERIDO'));
  perform pg_temp.srv(format(v_txt, d_v, 'RESUELTA', u_ope, s_ope, 'El medio retiró el post antes de tiempo',
                             '{"estado_asignacion_resultante": "CANCELADA", "causa": "INCUMPLIMIENTO_MEDIO"}'));
  r := r || jsonb_build_object('z11_cancelar_por_la_disputa',
    (select estado = 'CANCELADA' and causa_cancelacion = 'INCUMPLIMIENTO_MEDIO' and estado_previo_disputa is null
     from public.asignaciones where id = a_vf)
    and (select cupos_ocupados = v_n - 1 and presupuesto_comprometido = v_num - v_num2 from public.ofertas where id = o_vf)
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.cancelada' and usuario_id = u_mb
                  and entidad_id = a_vf::text));

  -- T+27h: el medio B reclama su vencida (24 h después), sin volver a tomar cupo.
  perform set_config('amo.reloj', (t0 + interval '27 hours')::text, true);
  d_vc := pg_temp.srv(format('select to_jsonb(public.abrir_disputa_srv(%L, ''OTRO'', %L, %L, %L))', a_vc,
                             'Sí publiqué y no se registró', u_mb, s_mb)) #>> '{}';
  v_n := pg_temp.como(c_mb, 'authenticated', format('select count(*) from public.proximas_acciones_medio(100) where asignacion_id = %L',
                                                    a_vc));
  r := r || jsonb_build_object('o08_reclamo_de_la_vencida_sin_cupo',
    (select estado = 'EN_DISPUTA' and estado_previo_disputa = 'VENCIDA_SIN_PUBLICAR' from public.asignaciones where id = a_vc)
    and (select parte = 'MEDIO' and motivo = 'OTRO' and estado_asignacion_origen = 'VENCIDA_SIN_PUBLICAR'
                and descripcion = 'Sí publiqué y no se registró' from public.disputas where id = d_vc)
    and (select cupos_ocupados = 0 and presupuesto_comprometido = 0 from public.ofertas where id = o_vc)
    and v_n = 0);

  -- ── (r) ADM-009 c1: permanencia pendiente y constancia manual (T+3d; la permanencia vence en T+4d) ───────────
  perform set_config('amo.reloj', (t0 + interval '3 days')::text, true);
  v_txt := 'select public.transicionar_srv(''asignaciones'', %L, ''VERIFICADA'', %L, %L, %L, %L)';
  v_txt2 := format('select jsonb_agg(jsonb_build_object(''a'', asignacion_id, ''lista'', lista, ''bloqueo'', bloqueo,
                                                        ''requeridos'', cortes_requeridos, ''aprobados'', cortes_aprobados,
                                                        ''pendientes'', metricas_pendientes, ''permanencia'', permanencia_hasta))
                    from public.cola_verificacion(200, 0) where asignacion_id = %L', a_e1);
  v_j := pg_temp.como(c_ope, 'authenticated', v_txt2);
  r := r || jsonb_build_object('r07_cola_dice_permanencia_pendiente',
    case when v_j -> 0 ->> 'bloqueo' = 'PERMANENCIA' and not (v_j -> 0 ->> 'lista')::boolean
              and (v_j -> 0 ->> 'requeridos')::integer = 2 and (v_j -> 0 ->> 'aprobados')::integer = 2
              and (v_j -> 0 ->> 'pendientes')::integer = 0
              and (v_j -> 0 ->> 'permanencia')::timestamptz = t0 + interval '4 days'
         then 'true'::jsonb else coalesce(v_j, 'null') end);
  v_e := pg_temp.srv_falla(format(v_txt, a_e1, u_ope, s_ope, null, '{}'));
  v_e2 := pg_temp.srv_falla(format(v_txt, a_e1, u_ope, s_ope, 'Revisé el post', '{"permanencia_verificada": true}'));
  v_e3 := pg_temp.srv_falla(format(v_txt, a_e1, u_adm, s_adm, null, '{"permanencia_verificada": true}'));
  r := r || jsonb_build_object('r08_permanencia_pendiente_y_constancia_solo_admin_con_motivo',
    case when pg_temp.es(v_e, 'AMO_PERMANENCIA_PENDIENTE', 'Aún no se cumple la permanencia mínima de la publicación.') = 'true'
              and v_e2 ->> 'e' = 'AMO_PERMANENCIA_PENDIENTE' and v_e3 ->> 'e' = 'AMO_PERMANENCIA_PENDIENTE'
         then 'true'::jsonb else jsonb_build_object('operaciones', v_e, 'operaciones_constancia', v_e2, 'admin_sin_motivo', v_e3) end);
  perform pg_temp.srv(format(v_txt, a_e1, u_adm, s_adm, 'Revisé el post en vivo: sigue publicado',
                             '{"permanencia_verificada": true}'));
  r := r || jsonb_build_object('r09_constancia_manual_del_admin',
    (select estado = 'VERIFICADA' and verificada_at = t0 + interval '3 days' and motivo = 'Revisé el post en vivo: sigue publicado'
     from public.asignaciones where id = a_e1)
    and (select count(*) = 2 and bool_and(permanencia_verificada_at = t0 + interval '3 days')
         from public.publicaciones where asignacion_id = a_e1)
    and exists (select 1 from public.notificaciones where tipo = 'asignacion.verificada' and usuario_id = u_ma
                  and entidad_id = a_e1::text));

  -- ── (o) T+76h: pasado el plazo de reclamo ────────────────────────────────────────────────────────────────────
  perform set_config('amo.reloj', (t0 + interval '76 hours')::text, true);
  r := r || jsonb_build_object('o09_fuera_de_plazo_no_se_reclama', pg_temp.es(pg_temp.srv_falla(format(
    'select public.abrir_disputa_srv(%L, ''OTRO'', ''Sí publiqué y no se registró'', %L, %L)', a_vz, u_mc, s_mc)),
    'AMO_TRANSICION_INVALIDA', 'Una asignación vencida solo la reclama el medio y dentro del plazo.'));
  v_ok := private.cron_aplicar('ofertas', o_vz, 'CERRADA', 'Terminó la ventana');
  r := r || jsonb_build_object('o10_cierra_cuando_ya_no_se_puede_reclamar',
    v_ok and (select estado = 'CERRADA' from public.ofertas where id = o_vz)
    and not private.condicion_sistema('ofertas', o_vc, 'CERRADA'));

  -- T+77h: el reclamo prospera. La asignación vuelve a CONTENIDO_ENTREGADO, retoma cupo y presupuesto y tiene 24 h.
  perform set_config('amo.reloj', (t0 + interval '77 hours')::text, true);
  select o.cupos_ocupados, o.presupuesto_comprometido into v_n, v_num from public.ofertas o where o.id = o_vc;
  select c.presupuesto_comprometido into v_num2 from public.campanas c where c.id = c_v;
  select oc.cupos_ocupados into v_m from public.oferta_cupos oc where oc.oferta_id = o_vc and oc.franja_id = fr1;
  perform pg_temp.srv(format('select public.transicionar_srv(''disputas'', %L, ''RESUELTA'', %L, %L, %L, %L)', d_vc, u_ope, s_ope,
                             'Comprobamos que sí publicó a tiempo', '{"estado_asignacion_resultante": "CONTENIDO_ENTREGADO"}'));
  select monto_bruto into v_monto from public.asignaciones where id = a_vc;
  r := r || jsonb_build_object('o11_reclamo_a_favor_reabre_con_cupo_y_plazo',
    (select estado = 'CONTENIDO_ENTREGADO' and estado_previo_disputa is null
            and fecha_limite_publicacion = t0 + interval '101 hours' from public.asignaciones where id = a_vc)
    and (select cupos_ocupados = v_n + 1 and presupuesto_comprometido = v_num + v_monto from public.ofertas where id = o_vc)
    and (select cupos_ocupados = v_m + 1 from public.oferta_cupos where oferta_id = o_vc and franja_id = fr1)
    and (select presupuesto_comprometido = v_num2 + v_monto from public.campanas where id = c_v)
    and (select estado = 'RESUELTA' and estado_asignacion_resultante = 'CONTENIDO_ENTREGADO' from public.disputas where id = d_vc));
  r := r || jsonb_build_object('o12_aviso_de_reapertura_con_plazo',
    (select count(*) = 1 from public.notificaciones
     where tipo = 'asignacion.reabierta' and usuario_id = u_mb and entidad_id = a_vc::text and prioridad = 2
       and mensaje = format('Tu reclamo sobre «Post que vence» prosperó: carga la evidencia de la publicación antes del %s.',
                            private.formato_fecha(t0 + interval '101 hours')))
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'disputa.resuelta' and entidad_id = d_vc::text and usuario_id in (u_mb, u_an)));
  perform set_config('amo.reloj', (t0 + interval '78 hours')::text, true);
  perform pg_temp.srv(format('select public.registrar_descarga_srv(%L, %L, %L)', a_vc, u_mb, s_mb));
  p_vc := pg_temp.srv(format('select to_jsonb(public.registrar_evidencia_srv(%L, 1, %L, %L, %L, null, true, %L, %L))',
                             a_vc, 'https://www.instagram.com/p/HumoE3vc/', t0 + interval '77 hours 30 minutes',
                             v_ev || a_vc || '/publicacion/1.webp', u_mb, s_mb)) #>> '{}';
  r := r || jsonb_build_object('o13_publica_dentro_del_plazo_nuevo',
    p_vc is not null and (select estado = 'PUBLICADA' from public.asignaciones where id = a_vc));

  -- ── (x) INT-006: fraude e incumplimiento del medio cuentan como incumplimiento; la administrativa no ──────────
  perform set_config('amo.reloj', (t0 + interval '21 days')::text, true);
  r := r || jsonb_build_object('x13_fraude_e_incumplimiento_cuentan_como_incumplimiento',
    (select bool_and(private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                                 a.fecha_limite_publicacion)
                     and not private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at, a.evidencia_validada_at,
                                                     a.fecha_limite_publicacion))
     from public.asignaciones a where a.id in (a_cf, a_cs))
    and (select not private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                                a.fecha_limite_publicacion)
         from public.asignaciones a where a.id = a_e2));
  perform set_config('amo.reloj', '', true);

  -- ── (t) Reporte «Cumplimiento de medios»: cuenta las alertas sin leer las columnas cerradas ───────────────────
  -- Medio A con alerta hoy: el D7 de a_al1 (múltiplo), el H24 de a_al2 (impresiones) y el del historial por fraude; el
  -- H24 de a_al1 se corrigió y ya no alerta.
  v_txt := format('select alertas_metricas from public.reporte_cumplimiento_medios(%L, %L) where medio_id = %L',
                  private.hoy() - 70, private.hoy() + 30, me_a);
  v_n := pg_temp.como(c_ope, 'authenticated', v_txt);
  v_txt := format('select count(*) from private.alertas_metricas_por_medio(%L, %L, null)', t0 - interval '70 days',
                  t0 + interval '30 days');
  v_m := pg_temp.como(c_an, 'authenticated', v_txt);
  v_p := pg_temp.como(c_ma, 'authenticated', v_txt);
  r := r || jsonb_build_object('t01_reporte_cuenta_alertas_solo_para_el_equipo',
    case when v_n = 3 and v_m = 0 and v_p = 0 then 'true'::jsonb
         else jsonb_build_object('operaciones', v_n, 'anunciante', v_m, 'medio', v_p) end);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
