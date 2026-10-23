-- Pruebas de humo de 20261023022211_e2_integridad_ejecucion (fase 3): marketplace del medio con el pago de cada cuenta,
-- rechazadas aparte, filtros, orden, paginación y marca de nueva (MED-008), motivo por el que un medio no ve ofertas
-- (MED-008 c2), detalle y cotización con la comisión visible u oculta (MED-009), reserva con el último cupo, «ya
-- aceptaste» antes que «sin cupo», idempotencia de un solo uso y precio congelado (MED-010), desistir por asignación,
-- cupo liberado y su aviso (MED-010 c3, CUP-004), descarga fuera de plazo y versión nueva del creativo (MED-012,
-- NOT-006), evidencia con URL única y de publicación, captura en Storage y versión vigente al publicar (MED-013,
-- INT-001, INT-002), métricas con coherencia por fila y entre cortes, corte de la oferta, fecha del corte, personalizado
-- idempotente y edición solo mientras la asignación admite métricas (MED-014, INT-005), recordatorios y atrasadas por
-- corte (NOT-005), mis asignaciones y próximas acciones con número y corte (MED-011, DSH-006), seguimiento del
-- anunciante sin métricas pendientes ni rechazos de medios que nunca aceptaron (ANU-011) y lectura de la calidad
-- (PRC-003/004).
-- Se ejecuta como owner (pnpm db:suites) en una transacción que SIEMPRE se revierte. Fija la configuración que usa
-- (umbral de 30.000, comisión del 20 %, tolerancia del 2 %, plazo de carga de 48 h…) y aísla la elegibilidad con una
-- categoría propia: no depende de los datos demo (el marketplace puede listar ofertas demo, así que solo se comparan las
-- de la suite). Los precios se calculan con las tarifas vigentes de la BD (sin multiplicador geográfico ni de calidad).
-- El reloj (`amo.reloj`) avanza por la ejecución: T = inicio de la transacción. Cada prueba deja `true` si pasa o lo
-- observado si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_e text; v_d text; v_c text; v_s text;
  v_n bigint; v_m bigint; v_k bigint; v_p bigint; v_q bigint;
  v_num numeric;
  v_ok boolean; v_ok2 boolean;
  v_rec record; v_x record;
  v_j jsonb; v_res jsonb;
  v_ids uuid[]; v_ids2 uuid[];
  v_total bigint;
  v_t timestamptz;
  v_acciones text[]; v_ids2_txt text[]; v_aprobadas text[]; v_otras text[];
  -- usuarios y sesiones
  u_adm constant uuid := '00000000-0000-4000-a000-0000000f3001';   -- ADMIN (valida evidencias y métricas, cancela)
  u_an constant uuid := '00000000-0000-4000-a000-0000000f3002';    -- ANUNCIANTE de la empresa de las ofertas
  u_ao constant uuid := '00000000-0000-4000-a000-0000000f3003';    -- ANUNCIANTE de otra empresa
  u_ma constant uuid := '00000000-0000-4000-a000-0000000f3004';    -- MEDIO A (dos cuentas de Instagram y una de TikTok)
  u_mb constant uuid := '00000000-0000-4000-a000-0000000f3005';    -- MEDIO B
  u_mc constant uuid := '00000000-0000-4000-a000-0000000f3006';    -- MEDIO C
  u_md constant uuid := '00000000-0000-4000-a000-0000000f3007';    -- MEDIO D: cuenta bajo el umbral
  u_mp constant uuid := '00000000-0000-4000-a000-0000000f3008';    -- medio PENDIENTE
  u_mr constant uuid := '00000000-0000-4000-a000-0000000f3009';    -- medio RECHAZADO
  u_ms constant uuid := '00000000-0000-4000-a000-0000000f3010';    -- medio SUSPENDIDO
  u_mv constant uuid := '00000000-0000-4000-a000-0000000f3011';    -- medio con la verificación de su cuenta vencida
  u_sm constant uuid := '00000000-0000-4000-a000-0000000f3012';    -- rol MEDIO sin medio vinculado
  s_adm constant uuid := '00000000-0000-4000-b000-0000000f3001';
  s_an constant uuid := '00000000-0000-4000-b000-0000000f3002';
  s_ao constant uuid := '00000000-0000-4000-b000-0000000f3003';
  s_ma constant uuid := '00000000-0000-4000-b000-0000000f3004';
  s_mb constant uuid := '00000000-0000-4000-b000-0000000f3005';
  s_mc constant uuid := '00000000-0000-4000-b000-0000000f3006';
  s_md constant uuid := '00000000-0000-4000-b000-0000000f3007';
  s_mp constant uuid := '00000000-0000-4000-b000-0000000f3008';
  s_mr constant uuid := '00000000-0000-4000-b000-0000000f3009';
  s_ms constant uuid := '00000000-0000-4000-b000-0000000f3010';
  s_mv constant uuid := '00000000-0000-4000-b000-0000000f3011';
  s_sm constant uuid := '00000000-0000-4000-b000-0000000f3012';
  an_v constant uuid := '00000000-0000-4000-c000-0000000f3001';
  an_o constant uuid := '00000000-0000-4000-c000-0000000f3002';
  me_a constant uuid := '00000000-0000-4000-d000-0000000f3001';
  me_b constant uuid := '00000000-0000-4000-d000-0000000f3002';
  me_c constant uuid := '00000000-0000-4000-d000-0000000f3003';
  me_d constant uuid := '00000000-0000-4000-d000-0000000f3004';
  me_p constant uuid := '00000000-0000-4000-d000-0000000f3005';
  me_r constant uuid := '00000000-0000-4000-d000-0000000f3006';
  me_s constant uuid := '00000000-0000-4000-d000-0000000f3007';
  me_v constant uuid := '00000000-0000-4000-d000-0000000f3008';
  cu_a1 constant uuid := '00000000-0000-4000-e000-0000000f3001';  -- Instagram 45.000 (F1)
  cu_a2 constant uuid := '00000000-0000-4000-e000-0000000f3002';  -- Instagram 75.000 (F2)
  cu_at constant uuid := '00000000-0000-4000-e000-0000000f3003';  -- TikTok 45.000 (F1)
  cu_b constant uuid := '00000000-0000-4000-e000-0000000f3004';
  cu_c constant uuid := '00000000-0000-4000-e000-0000000f3005';
  cu_d constant uuid := '00000000-0000-4000-e000-0000000f3006';
  cu_s constant uuid := '00000000-0000-4000-e000-0000000f3007';
  cu_v constant uuid := '00000000-0000-4000-e000-0000000f3008';
  cat_h constant uuid := '00000000-0000-4000-f000-0000000f30c1';  -- categoría de la suite
  cat_o constant uuid := '00000000-0000-4000-f000-0000000f30c2';  -- otra categoría (nadie de la suite)
  c_v constant uuid := '00000000-0000-4000-f000-0000000f3101';
  o_l1 constant uuid := '00000000-0000-4000-f000-0000000f3201';   -- post: cupos en F1 y F2 (pago por cuenta)
  o_l2 constant uuid := '00000000-0000-4000-f000-0000000f3202';   -- reel: vence antes y paga menos
  o_tt constant uuid := '00000000-0000-4000-f000-0000000f3203';   -- TikTok
  o_rc constant uuid := '00000000-0000-4000-f000-0000000f3204';   -- la que el medio A rechaza («No me interesa»)
  o_ot constant uuid := '00000000-0000-4000-f000-0000000f3205';   -- otra categoría: nadie de la suite la ve
  o_f3 constant uuid := '00000000-0000-4000-f000-0000000f3206';   -- solo cupos en F3: sin cupo en sus franjas
  o_mu constant uuid := '00000000-0000-4000-f000-0000000f3207';   -- permite varios cupos por medio
  o_ul constant uuid := '00000000-0000-4000-f000-0000000f3208';   -- un solo cupo (carrera, desistir, cupo liberado)
  o_ej constant uuid := '00000000-0000-4000-f000-0000000f3209';   -- dos publicaciones, cortes H24 y D7 (ejecución)
  o_gd constant uuid := '00000000-0000-4000-f000-0000000f3210';   -- segmentada a su departamento
  o_gx constant uuid := '00000000-0000-4000-f000-0000000f3211';   -- segmentada a otro municipio
  cr1 constant uuid := '00000000-0000-4000-f000-0000000f3301';
  k1 constant uuid := '00000000-0000-4000-9000-0000000f3001';     -- claves de idempotencia
  k2 constant uuid := '00000000-0000-4000-9000-0000000f3002';
  k3 constant uuid := '00000000-0000-4000-9000-0000000f3003';
  c_adm text; c_an text; c_ao text; c_ma text; c_mb text; c_mc text; c_md text; c_mp text; c_mr text; c_ms text;
  c_mv text; c_sm text;
  c_srv constant text := '{"role": "service_role"}';
  -- catálogos y precios esperados (tarifas vigentes de la BD, comisión del 20 %, redondeo de 100)
  v_mun char(5) := (select m.codigo from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                    where m.activo and d.activo order by m.codigo limit 1);
  v_mun2 char(5) := (select m.codigo from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                     where m.activo and d.activo order by m.codigo offset 1 limit 1);
  v_sector uuid := (select id from public.sectores order by nombre limit 1);
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  f_reel uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'REEL');
  f_tt uuid := (select id from public.formatos where plataforma = 'TIKTOK' and clave = 'VIDEO');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  fr2 uuid := (select id from public.franjas where clave = 'F2');
  fr3 uuid := (select id from public.franjas where clave = 'F3');
  v_bruto_p1 numeric; v_medio_p1 numeric;     -- post, F1, una publicación
  v_bruto_p2 numeric; v_medio_p2 numeric;     -- post, F2
  v_medio_r1 numeric;                         -- reel, F1
  v_bruto_ej numeric; v_medio_ej numeric;     -- post, F1, dos publicaciones
  v_formato_post text := (select nombre from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  v_titulo_ej constant text := 'Post en dos publicaciones';
  v_titulo_ul constant text := 'Último cupo de la franja';
  v_sha2 constant text := encode(sha256('humo-f3-2'::bytea), 'hex');
  -- negocio (se crean durante la prueba)
  a_ul_b uuid; a_ul_c uuid; a_rc uuid; a_mu uuid; a_ea uuid; a_eb uuid; a_ec uuid; cr2 uuid;
  p_a1 uuid; p_a2 uuid; p_b1 uuid; p_b2 uuid;
  m_h24_a1 uuid; m_h24_a2 uuid; m_d7_a1 uuid; m_d7_a2 uuid; m_per_a1 uuid; m_h24_b1 uuid;
  v_ev text;                                   -- prefijo de las rutas de evidencia
begin
  -- ── Preparación (owner, modo_carga) ──────────────────────────────────────────────────────────────────────────
  update public.configuracion c set valor = x.valor
  from (values ('medios.umbral_seguidores', '30000'::jsonb), ('medios.reverificacion_dias', '30'),
               ('medios.reverificacion_gracia_dias', '7'), ('comision.porcentaje_global', '0.2'),
               ('comision.visible_para_medio', 'true'), ('precios.redondeo', '100'),
               ('calidad.minimo_publicaciones', '5'), ('metricas.tolerancia_cortes', '0.02'),
               ('metricas.plazo_carga_horas', '48'), ('disputas.plazo_vencida_horas', '72'),
               ('archivos.max_creativo_mb', '50'), ('archivos.tolerancia_aspecto', '0.02'))
       as x (clave, valor)
  where c.clave = x.clave;
  select round(t.valor_base / 100) * 100 into v_bruto_p1 from public.tarifas t
  where t.formato_id = f_post and t.franja_id = fr1 and t.vigente_desde <= now() and (t.vigente_hasta is null or t.vigente_hasta > now());
  select round(t.valor_base / 100) * 100 into v_bruto_p2 from public.tarifas t
  where t.formato_id = f_post and t.franja_id = fr2 and t.vigente_desde <= now() and (t.vigente_hasta is null or t.vigente_hasta > now());
  select round(t.valor_base / 100) * 100 - round(round(t.valor_base / 100) * 100 * 0.2) into v_medio_r1 from public.tarifas t
  where t.formato_id = f_reel and t.franja_id = fr1 and t.vigente_desde <= now() and (t.vigente_hasta is null or t.vigente_hasta > now());
  select round(t.valor_base * 2 / 100) * 100 into v_bruto_ej from public.tarifas t
  where t.formato_id = f_post and t.franja_id = fr1 and t.vigente_desde <= now() and (t.vigente_hasta is null or t.vigente_hasta > now());
  v_medio_p1 := v_bruto_p1 - round(v_bruto_p1 * 0.2);
  v_medio_p2 := v_bruto_p2 - round(v_bruto_p2 * 0.2);
  v_medio_ej := v_bruto_ej - round(v_bruto_ej * 0.2);

  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo.f3.admin@amo.test'), (u_an, 'humo.f3.anunciante@amo.test'),
               (u_ao, 'humo.f3.otra@amo.test'), (u_ma, 'humo.f3.medio.a@amo.test'), (u_mb, 'humo.f3.medio.b@amo.test'),
               (u_mc, 'humo.f3.medio.c@amo.test'), (u_md, 'humo.f3.medio.d@amo.test'),
               (u_mp, 'humo.f3.medio.pendiente@amo.test'), (u_mr, 'humo.f3.medio.rechazado@amo.test'),
               (u_ms, 'humo.f3.medio.suspendido@amo.test'), (u_mv, 'humo.f3.medio.vencido@amo.test'),
               (u_sm, 'humo.f3.sin.medio@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2,
                                  municipio_codigo, estado_verificacion, verificado_at)
  values (an_v, 'Humo F3 Verificada S.A.S.', 'Humo F3 Verificada', '900888001',
          private.digito_verificacion_nit('900888001'), v_sector, 'CO', v_mun, 'VERIFICADO', now()),
         (an_o, 'Humo F3 Otra S.A.S.', 'Humo F3 Otra', '900888002',
          private.digito_verificacion_nit('900888002'), v_sector, 'CO', v_mun, 'VERIFICADO', now());
  insert into public.categorias (id, nombre, descripcion)
  values (cat_h, 'Humo F3 Marimba', 'Categoría de la suite'), (cat_o, 'Humo F3 Quena', 'Categoría sin medios de la suite');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at, suspendido_at,
                             rechazado_at)
  values (me_a, 'Medio Marimba A', 'PAGINA_NOTICIAS', v_mun, 'VERIFICADO', 1, now(), null, null),
         (me_b, 'Medio Marimba B', 'CREADOR', v_mun, 'VERIFICADO', 1, now(), null, null),
         (me_c, 'Medio Marimba C', 'CREADOR', v_mun, 'VERIFICADO', 1, now(), null, null),
         (me_d, 'Medio Marimba D', 'EMISORA', v_mun, 'VERIFICADO', 1, now(), null, null),
         (me_p, 'Medio Marimba Pendiente', 'CREADOR', v_mun, 'PENDIENTE', 0, null, null, null),
         (me_r, 'Medio Marimba Rechazado', 'CREADOR', v_mun, 'RECHAZADO', 0, null, null, now()),
         (me_s, 'Medio Marimba Suspendido', 'CREADOR', v_mun, 'SUSPENDIDO', 1, now() - interval '30 days', now(), null),
         (me_v, 'Medio Marimba Vencido', 'CREADOR', v_mun, 'VERIFICADO', 1, now(), null, null);
  insert into public.medio_categorias (medio_id, categoria_id)
  select x.id, cat_h from unnest(array[me_a, me_b, me_c, me_d, me_p, me_r, me_s, me_v]) as x (id);
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a1, me_a, 'INSTAGRAM', 'humo_f3_a1', 'https://instagram.com/humo_f3_a1', 45000, true, 'MANUAL', now()),
         (cu_a2, me_a, 'INSTAGRAM', 'humo_f3_a2', 'https://instagram.com/humo_f3_a2', 75000, true, 'MANUAL', now()),
         (cu_at, me_a, 'TIKTOK', 'humo_f3_at', 'https://www.tiktok.com/@humo_f3_at', 45000, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo_f3_b', 'https://instagram.com/humo_f3_b', 45000, true, 'MANUAL', now()),
         (cu_c, me_c, 'INSTAGRAM', 'humo_f3_c', 'https://instagram.com/humo_f3_c', 45000, true, 'MANUAL', now()),
         (cu_d, me_d, 'INSTAGRAM', 'humo_f3_d', 'https://instagram.com/humo_f3_d', 25000, true, 'MANUAL', now()),
         (cu_s, me_s, 'INSTAGRAM', 'humo_f3_s', 'https://instagram.com/humo_f3_s', 45000, true, 'MANUAL', now()),
         (cu_v, me_v, 'INSTAGRAM', 'humo_f3_v', 'https://instagram.com/humo_f3_v', 45000, true, 'MANUAL',
          now() - interval '60 days');
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = case id when u_an then an_v else an_o end
   where id in (u_an, u_ao);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false,
         medio_id = case id when u_ma then me_a when u_mb then me_b when u_mc then me_c when u_md then me_d
                            when u_mp then me_p when u_mr then me_r when u_ms then me_s when u_mv then me_v end
   where id in (u_ma, u_mb, u_mc, u_md, u_mp, u_mr, u_ms, u_mv, u_sm);
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  select x.s, x.u, now(), now(), x.aal::auth.aal_level
  from (values (s_adm, u_adm, 'aal2'), (s_an, u_an, 'aal1'), (s_ao, u_ao, 'aal1'), (s_ma, u_ma, 'aal1'),
               (s_mb, u_mb, 'aal1'), (s_mc, u_mc, 'aal1'), (s_md, u_md, 'aal1'), (s_mp, u_mp, 'aal1'),
               (s_mr, u_mr, 'aal1'), (s_ms, u_ms, 'aal1'), (s_mv, u_mv, 'aal1'), (s_sm, u_sm, 'aal1'))
       as x (s, u, aal);
  -- Campaña ACTIVA con las ofertas ya PUBLICADAS (la moderación la prueba la suite de la fase 2).
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_v, an_v, 'Campaña Humo F3', 'Marca Marimba', private.hoy() - 1, private.hoy() + 40, 50000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, publicaciones_por_medio,
                              permite_multiples_cupos, presupuesto_maximo, tope_porcentaje_por_medio, categorias_objetivo,
                              cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion, instrucciones,
                              restricciones, estado, enviada_at, publicada_at)
  select x.id, c_v, an_v, x.titulo, x.formato, x.plataforma::public.plataforma, x.pubs, x.multiples, 5000000, 0.15,
         array[x.cat], x.cortes::public.corte_metrica[], now() + x.ini, now() + x.fin, now() + x.lim,
         'Publica la pieza con el copy tal cual.', 'No edites el copy ni recortes la pieza.', 'PUBLICADA',
         now() - interval '1 day', now() - interval '1 day'
  from (values
    (o_l1, 'Post del marketplace', f_post, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_l2, 'Reel del marketplace', f_reel, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '1 day'),
    (o_tt, 'Video de TikTok', f_tt, 'TIKTOK', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_rc, 'Post que no me interesa', f_post, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_ot, 'Post de otra categoría', f_post, 'INSTAGRAM', 1, false, cat_o, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_f3, 'Post solo para la franja 3', f_post, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_mu, 'Post de varios cupos', f_post, 'INSTAGRAM', 1, true, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_ul, v_titulo_ul, f_post, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_ej, v_titulo_ej, f_post, 'INSTAGRAM', 2, false, cat_h, '{H24,D7}', interval '1 day', interval '20 days', interval '12 hours'),
    (o_gd, 'Post para su departamento', f_post, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'),
    (o_gx, 'Post para otro municipio', f_post, 'INSTAGRAM', 1, false, cat_h, '{H24,H72,D7}', interval '3 days', interval '10 days', interval '2 days'))
    as x (id, titulo, formato, plataforma, pubs, multiples, cat, cortes, ini, fin, lim);
  update public.ofertas set departamentos_objetivo = array[left(v_mun, 2)]::char(2)[] where id = o_gd;
  update public.ofertas set municipios_objetivo = array[v_mun2]::char(5)[] where id = o_gx;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales)
  values (o_l1, fr1, 2), (o_l1, fr2, 1), (o_l2, fr1, 1), (o_tt, fr1, 1), (o_rc, fr1, 1), (o_ot, fr1, 1), (o_f3, fr3, 1),
         (o_mu, fr1, 3), (o_ul, fr1, 1), (o_ej, fr1, 3), (o_gd, fr1, 1), (o_gx, fr1, 1);
  update public.ofertas o set cupos_totales = (select sum(oc.cupos_totales) from public.oferta_cupos oc where oc.oferta_id = o.id)
  where o.campana_id = c_v;
  -- Versión 1 del creativo de la oferta de ejecución, activa desde ayer.
  insert into public.creativos (id, oferta_id, tipo, copy_sugerido, hashtags, menciones, enlace_destino, version, vigente,
                                activado_at)
  values (cr1, o_ej, 'IMAGEN', 'La temporada llegó #publicidad', '{#publicidad,#marimba}', '{@marcamarimba}',
          'https://marimba.example.com/temporada', 1, true, now() - interval '1 day');
  insert into storage.objects (bucket_id, name, metadata)
  values ('creativos', 'oferta/' || o_ej || '/' || cr1 || '/1-pieza.webp', jsonb_build_object('size', 4096, 'mimetype', 'image/webp'));
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr1, 'oferta/' || o_ej || '/' || cr1 || '/1-pieza.webp', 'image/webp', 4096, 1080, 1080,
          encode(sha256('humo-f3-1'::bytea), 'hex'));
  perform set_config('amo.modo_carga', '', true);
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_an := jsonb_build_object('sub', u_an, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_an)::text;
  c_ao := jsonb_build_object('sub', u_ao, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ao)::text;
  c_ma := jsonb_build_object('sub', u_ma, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ma)::text;
  c_mb := jsonb_build_object('sub', u_mb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mb)::text;
  c_mc := jsonb_build_object('sub', u_mc, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mc)::text;
  c_md := jsonb_build_object('sub', u_md, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_md)::text;
  c_mp := jsonb_build_object('sub', u_mp, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mp)::text;
  c_mr := jsonb_build_object('sub', u_mr, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mr)::text;
  c_ms := jsonb_build_object('sub', u_ms, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ms)::text;
  c_mv := jsonb_build_object('sub', u_mv, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mv)::text;
  c_sm := jsonb_build_object('sub', u_sm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_sm)::text;

  -- ── (g) Privilegios de lo nuevo ──────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('g01_consultas_para_la_sesion',
    has_function_privilege('authenticated', 'public.marketplace_medio(public.plataforma, boolean, text, integer, integer, uuid, uuid, date, date)', 'execute')
    and has_function_privilege('authenticated', 'public.mi_elegibilidad_marketplace()', 'execute')
    and has_function_privilege('authenticated', 'public.marketplace_facetas(public.plataforma)', 'execute')
    and not has_function_privilege('anon', 'public.marketplace_facetas(public.plataforma)', 'execute')
    and has_function_privilege('authenticated', 'public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.proximas_acciones_medio(integer)', 'execute')
    and has_function_privilege('authenticated', 'public.seguimiento_campana(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.marketplace_medio(public.plataforma, boolean, text, integer, integer, uuid, uuid, date, date)', 'execute')
    and not has_function_privilege('anon', 'public.mi_elegibilidad_marketplace()', 'execute')
    and not has_function_privilege('anon', 'public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.proximas_acciones_medio(integer)', 'execute')
    and not has_function_privilege('anon', 'public.seguimiento_campana(uuid)', 'execute'));
  r := r || jsonb_build_object('g02_srv_solo_servidor',
    has_function_privilege('service_role', 'public.desistir_asignacion_srv(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.desistir_asignacion_srv(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.desistir_asignacion_srv(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.reservar_cupo_srv(uuid, uuid, uuid, uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.registrar_descarga_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated',
          'public.registrar_evidencia_srv(uuid, integer, text, timestamp with time zone, text, text, boolean, uuid, uuid)', 'execute'));
  r := r || jsonb_build_object('g03_internos_cerrados',
    not has_table_privilege('authenticated', 'private.avisos_metricas_atrasadas', 'select')
    and not has_table_privilege('service_role', 'private.avisos_metricas_atrasadas', 'select')
    and not has_function_privilege('authenticated', 'private.monto_medio_estimado(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.fn_captura_en_storage()', 'execute')
    and not has_function_privilege('authenticated', 'private.fn_metricas_coherencia()', 'execute'));
  r := r || jsonb_build_object('g04_indice_franja_legible',
    has_column_privilege('authenticated', 'public.cuentas_sociales', 'indice_franja', 'select')
    and not has_column_privilege('authenticated', 'public.cuentas_sociales', 'indice_franja', 'update'));

  -- ── (l) MED-008 c2: por qué un medio no ve ofertas ───────────────────────────────────────────────────────────
  for v_x in select * from (values
      ('l01_ok', c_ma, 'OK', null),
      ('l02_sin_medio', c_sm, 'SIN_MEDIO', 'Tu cuenta no está vinculada a un medio.'),
      ('l03_pendiente', c_mp, 'MEDIO_PENDIENTE', 'Tu medio aún no está verificado: completa el alta y envíalo a verificación.'),
      ('l04_rechazado', c_mr, 'MEDIO_RECHAZADO', 'La verificación de tu medio fue rechazada: corrige lo indicado y vuelve a enviarla.'),
      ('l05_suspendido', c_ms, 'MEDIO_SUSPENDIDO', 'Tu medio está suspendido: mientras tanto no verás ofertas nuevas.'),
      ('l06_sin_cuenta_vigente', c_mv, 'SIN_CUENTA_VIGENTE',
       'Ninguna de tus cuentas tiene la verificación de seguidores al día: reverifícala en Mi medio › Cuentas.'),
      ('l07_bajo_umbral', c_md, 'BAJO_UMBRAL',
       'Tus cuentas verificadas tienen menos de 30.000 seguidores, el mínimo para recibir ofertas.'))
      as t (clave, claims, motivo, detalle) loop
    perform set_config('request.jwt.claims', v_x.claims, true);
    execute 'set local role authenticated';
    select * into v_rec from public.mi_elegibilidad_marketplace();
    select count(*) into v_n from public.marketplace_medio(null, true, 'fecha', 100, 0);
    execute 'reset role';
    r := r || jsonb_build_object(v_x.clave,
      case when v_rec.motivo = v_x.motivo and v_rec.detalle is not distinct from v_x.detalle
                and (v_x.motivo = 'OK' or v_n = 0)
           then 'true'::jsonb else jsonb_build_object('motivo', v_rec.motivo, 'detalle', v_rec.detalle, 'ofertas', v_n) end);
  end loop;
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform * from public.mi_elegibilidad_marketplace();
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  v_s := 'NO FALLÓ';
  begin
    perform * from public.marketplace_medio();
  exception when others then
    get stacked diagnostics v_s = message_text;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('l08_anunciante_sin_marketplace',
    case when v_e = 'AMO_NO_AUTORIZADO' and v_s = 'AMO_NO_AUTORIZADO' then 'true'::jsonb
         else jsonb_build_object('elegibilidad', v_e, 'marketplace', v_s) end);

  -- ── (k) MED-008 / MED-009: listado, pago por cuenta, filtros, orden, paginación, vista y detalle ─────────────────
  -- «No me interesa» con motivo: la oferta sale del listado (sin aceptar, sin precio).
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  a_rc := public.rechazar_oferta_srv(o_rc, u_ma, s_ma, 'No es para mi audiencia');
  execute 'reset role';
  v_ok2 := (select estado = 'RECHAZADA' and aceptada_at is null and motivo = 'No es para mi audiencia' and monto_bruto is null
            from public.asignaciones where id = a_rc);
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select array_agg(m.id order by m.ordinality), max(m.total) into v_ids, v_total
  from public.marketplace_medio(null, false, 'fecha', 100, 0) with ordinality m;
  r := r || jsonb_build_object('k01_visibles_y_no_visibles',
    o_l1 = any (v_ids) and o_l2 = any (v_ids) and o_tt = any (v_ids) and o_mu = any (v_ids) and o_ul = any (v_ids)
    and o_ej = any (v_ids) and not o_ot = any (v_ids) and not o_f3 = any (v_ids) and not o_rc = any (v_ids));
  r := r || jsonb_build_object('k01b_segmentacion_geografica', o_gd = any (v_ids) and not o_gx = any (v_ids));
  -- MED-008: filtros por anunciante, sector y días de publicación, y sus facetas. La base local puede tener ofertas
  -- de la demo visibles para este medio: se cuentan aparte las de la suite (todas de an_v).
  select count(*) into v_k from public.marketplace_medio(p_limite => 100) m where m.anunciante_id = an_v;
  r := r || jsonb_build_object('k01c_filtros_y_facetas',
    (select count(*) = 0 from public.marketplace_medio(p_anunciante => an_o))
    and (select max(m.total) = v_k and bool_and(m.anunciante_id = an_v)
         from public.marketplace_medio(p_limite => 100, p_anunciante => an_v, p_sector => v_sector) m)
    and (select count(*) = 0 from public.marketplace_medio(p_sector => private.uuid_v7()))
    and (select array_agg(m.id) filter (where m.anunciante_id = an_v) = array[o_ej]
                and bool_and(m.ventana_inicio < private.inicio_dia(private.hoy() + 2))
         from public.marketplace_medio(p_limite => 100, p_publica_hasta => private.hoy() + 1) m)
    and (select bool_or(f.tipo = 'SECTOR' and f.id = v_sector and f.ofertas >= v_k)
                and bool_or(f.tipo = 'ANUNCIANTE' and f.id = an_v and f.nombre = 'Humo F3 Verificada' and f.ofertas = v_k)
                and sum(f.ofertas) filter (where f.tipo = 'ANUNCIANTE') = v_total
                and sum(f.ofertas) filter (where f.tipo = 'SECTOR') = v_total
         from public.marketplace_facetas() f));
  select count(*) filter (where m.id = o_rc and m.rechazada_por_mi),
         count(*) filter (where m.id <> o_rc and m.rechazada_por_mi)
    into v_n, v_m
  from public.marketplace_medio(null, true, 'fecha', 100, 0) m;
  r := r || jsonb_build_object('k02_rechazadas_aparte', v_n = 1 and v_m = 0 and v_ok2);
  select m.cuentas, m.pago_maximo into v_j, v_num from public.marketplace_medio() m where m.id = o_l1;
  r := r || jsonb_build_object('k03_pago_por_cuenta',
    case when jsonb_array_length(v_j) = 2
              and v_j -> 0 ->> 'cuenta_social_id' = cu_a2::text and v_j -> 0 ->> 'handle' = 'humo_f3_a2'
              and v_j -> 0 ->> 'franja_clave' = 'F2' and (v_j -> 0 ->> 'cupos_restantes')::int = 1
              and (v_j -> 0 ->> 'monto_medio')::numeric = v_medio_p2
              and v_j -> 1 ->> 'cuenta_social_id' = cu_a1::text and v_j -> 1 ->> 'franja_clave' = 'F1'
              and (v_j -> 1 ->> 'cupos_restantes')::int = 2 and (v_j -> 1 ->> 'monto_medio')::numeric = v_medio_p1
              and v_num = v_medio_p2
         then 'true'::jsonb else jsonb_build_object('cuentas', v_j, 'pago_maximo', v_num, 'esperado', v_medio_p2) end);
  select m.cuentas into v_j from public.marketplace_medio() m where m.id = o_l2;
  r := r || jsonb_build_object('k04_solo_cuentas_con_cupo_en_su_franja',
    jsonb_array_length(v_j) = 1 and v_j -> 0 ->> 'cuenta_social_id' = cu_a1::text
    and (v_j -> 0 ->> 'monto_medio')::numeric = v_medio_r1);
  select * into v_rec from public.cotizar_oferta(o_l1, cu_a2);
  r := r || jsonb_build_object('k05_cotizacion_con_comision_visible',
    v_rec.monto_medio = v_medio_p2 and v_rec.monto_bruto = v_bruto_p2 and v_rec.porcentaje_comision = 0.2
    and v_rec.monto_comision = v_bruto_p2 - v_medio_p2 and v_rec.franja_clave = 'F2' and v_rec.multiplicador_calidad = 1);
  select array_agg(m.id), bool_and(m.plataforma = 'TIKTOK') into v_ids2, v_ok from public.marketplace_medio('TIKTOK') m;
  r := r || jsonb_build_object('k06_filtro_por_plataforma',
    o_tt = any (v_ids2) and v_ok and not o_l1 = any (v_ids2)
    and not exists (select 1 from public.marketplace_medio('INSTAGRAM') m where m.id = o_tt));
  select array_position(array_agg(m.id order by m.ordinality), o_l2) < array_position(array_agg(m.id order by m.ordinality), o_l1)
    into v_ok
  from public.marketplace_medio(null, false, 'fecha', 100, 0) with ordinality m;
  -- Con las tarifas de la BD el post en F2 paga más que el reel en F1; si una BD las tuviera al revés, el orden también.
  select (array_position(array_agg(m.id order by m.ordinality), o_l1) < array_position(array_agg(m.id order by m.ordinality), o_l2))
         = (v_medio_p2 > v_medio_r1)
    into v_ok2
  from public.marketplace_medio(null, false, 'pago', 100, 0) with ordinality m;
  r := r || jsonb_build_object('k07_orden_por_fecha_y_por_pago', v_ok and v_ok2);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform * from public.marketplace_medio(null, false, 'monto');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('k08_orden_invalido',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'Orden no válido.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d) end);
  select count(*), min(m.total), max(m.total) into v_n, v_m, v_k from public.marketplace_medio(null, false, 'fecha', 2, 0) m;
  select count(*) into v_p from public.marketplace_medio(null, false, 'fecha', 2, v_total::integer) m;
  r := r || jsonb_build_object('k09_paginacion',
    case when v_total = cardinality(v_ids) and v_n = least(2, v_total) and v_m = v_total and v_k = v_total and v_p = 0
         then 'true'::jsonb else jsonb_build_object('total', v_total, 'filas', cardinality(v_ids), 'pagina', v_n, 'fuera', v_p) end);
  perform public.registrar_vista_oferta(o_l1);
  select bool_and(m.vista) filter (where m.id = o_l1), bool_and(not m.vista) filter (where m.id = o_l2) into v_ok, v_ok2
  from public.marketplace_medio() m;
  r := r || jsonb_build_object('k10_vista_y_nueva', v_ok and v_ok2
    and (select veces = 1 from public.oferta_vistas where oferta_id = o_l1 and medio_id = me_a));
  select * into v_rec from public.ofertas_para_medio(o_l1);
  select count(*) into v_n from public.ofertas_para_medio(o_ot);
  r := r || jsonb_build_object('k11_detalle',
    v_rec.instrucciones = 'Publica la pieza con el copy tal cual.' and v_rec.restricciones = 'No edites el copy ni recortes la pieza.'
    and v_rec.marca = 'Marca Marimba' and v_rec.anunciante_nombre = 'Humo F3 Verificada'
    and jsonb_array_length(v_rec.cupos_restantes_mi_franja) = 2 and v_n = 0);
  execute 'reset role';
  update public.configuracion set valor = 'false' where clave = 'comision.visible_para_medio';
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select * into v_rec from public.cotizar_oferta(o_l1, cu_a1);
  execute 'reset role';
  update public.configuracion set valor = 'true' where clave = 'comision.visible_para_medio';
  r := r || jsonb_build_object('k12_cotizacion_sin_comision_visible',
    v_rec.monto_medio = v_medio_p1 and v_rec.monto_bruto is null and v_rec.porcentaje_comision is null
    and v_rec.monto_comision is null and v_rec.tarifa_base is null and v_rec.multiplicador_calidad = 1
    and v_rec.franja_clave = 'F1');

  -- ── (r) MED-010: último cupo, «ya aceptaste» antes que «sin cupo», idempotencia y precio congelado ─────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  -- El medio A dice «No me interesa»: no recibirá el aviso cuando se libere el cupo (N5).
  perform public.rechazar_oferta_srv(o_ul, u_ma, s_ma, 'No publico ese tema');
  select * into v_rec from public.reservar_cupo_srv(o_ul, me_b, cu_b, u_mb, s_mb, k1);
  a_ul_b := v_rec.asignacion_id;
  r := r || jsonb_build_object('r01_reserva_el_ultimo_cupo',
    v_rec.monto_bruto = v_bruto_p1 and v_rec.monto_medio = v_medio_p1 and v_rec.franja_clave = 'F1'
    and v_rec.cupos_restantes_franja = 0
    and (select estado = 'CUPOS_COMPLETOS' and cupos_ocupados = 1 from public.ofertas where id = o_ul));
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform * from public.reservar_cupo_srv(o_ul, me_c, cu_c, u_mc, s_mc, k3);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('r02_quien_llega_tarde_no_tiene_cupo',
    case when v_e = 'AMO_SIN_CUPO' and v_d = 'No quedan cupos en tu franja.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d) end);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform * from public.reservar_cupo_srv(o_ul, me_b, cu_b, u_mb, s_mb, k2);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('r03_ya_aceptada_antes_que_sin_cupo',
    case when v_e = 'AMO_YA_ACEPTADA' and v_d = 'Ya aceptaste esta oferta.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d) end);
  select * into v_rec from public.reservar_cupo_srv(o_ul, me_b, cu_b, u_mb, s_mb, k1);
  r := r || jsonb_build_object('r04_doble_toque_una_asignacion',
    v_rec.asignacion_id = a_ul_b
    and (select count(*) = 1 from public.asignaciones where oferta_id = o_ul and medio_id = me_b));
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform * from public.reservar_cupo_srv(o_l1, me_b, cu_b, u_mb, s_mb, k1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('r05_clave_de_otra_oferta',
    case when v_e = 'AMO_IDEMPOTENCIA_INVALIDA' and v_d = 'Esta solicitud ya se usó. Vuelve a intentarlo.'
              and not exists (select 1 from public.asignaciones where oferta_id = o_l1 and medio_id = me_b)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  execute 'reset role';
  -- El multiplicador de calidad de la cuenta sube después de aceptar: la cotización cambia, la asignación no.
  update public.cuentas_sociales set publicaciones_verificadas_count = 10, multiplicador_calidad = 1.2 where id = cu_b;
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  select * into v_rec from public.cotizar_oferta(o_ul, cu_b);
  select * into v_x from public.mis_asignaciones_medio(null, 50, null, a_ul_b);
  execute 'reset role';
  update public.cuentas_sociales set publicaciones_verificadas_count = 0, multiplicador_calidad = 1 where id = cu_b;
  r := r || jsonb_build_object('r06_precio_congelado',
    v_rec.multiplicador_calidad = 1.2 and v_rec.monto_medio > v_medio_p1
    and v_x.monto_medio = v_medio_p1 and v_x.monto_bruto = v_bruto_p1 and v_x.multiplicador_calidad_aplicado = 1
    and (select monto_bruto = v_bruto_p1 and franja_clave = 'F1'
                and seguidores_al_aceptar = 45000 and clave_idempotencia = k1
         from public.asignaciones where id = a_ul_b)
    and (select monto_medio = v_medio_p1 and monto_comision = v_bruto_p1 - v_medio_p1 from public.asignacion_montos
         where asignacion_id = a_ul_b));
  perform set_config('request.jwt.claims', c_mc, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.marketplace_medio() m where m.id = o_ul;
  execute 'reset role';
  r := r || jsonb_build_object('r07_oferta_llena_fuera_del_marketplace', v_n = 0);

  -- ── (d) MED-010 c3 · CUP-004: desistir libera el cupo y avisa a los elegibles (como mucho cada 6 h) ────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.desistir_asignacion_srv(a_ul_b, u_mb, s_mb, null);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('d01_desistir_exige_motivo',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.desistir_asignacion_srv(a_ul_b, u_mc, s_mc, 'No es mía');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('d02_desistir_ajena',
    case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  v_res := to_jsonb(public.desistir_asignacion_srv(a_ul_b, u_mb, s_mb, 'Se me cruzó con otra campaña'));
  execute 'reset role';
  r := r || jsonb_build_object('d03_desiste_con_motivo',
    (v_res #>> '{}')::uuid = a_ul_b
    and (select estado = 'RECHAZADA' and rechazada_at = now() and motivo = 'Se me cruzó con otra campaña'
                and aceptada_at is not null from public.asignaciones where id = a_ul_b));
  r := r || jsonb_build_object('d04_cupo_y_presupuesto_liberados',
    (select estado = 'PUBLICADA' and cupos_ocupados = 0 and presupuesto_comprometido = 0 from public.ofertas where id = o_ul)
    and (select cupos_ocupados = 0 from public.oferta_cupos where oferta_id = o_ul and franja_id = fr1));
  -- Al medio elegible C y a nadie más: ni a B, que acaba de desistir, ni a A, que dijo «No me interesa», ni bajo el
  -- umbral, ni suspendido, ni con la cuenta vencida, ni sin verificar, ni a los anunciantes.
  select count(*) into v_p from public.notificaciones where tipo = 'oferta.cupo_liberado' and entidad_id = o_ul::text;
  r := r || jsonb_build_object('d05_aviso_de_cupo_liberado_a_los_elegibles',
    (select count(*) = 1 from public.notificaciones
     where tipo = 'oferta.cupo_liberado' and entidad = 'ofertas' and entidad_id = o_ul::text and usuario_id = u_mc
       and prioridad = 1
       and mensaje = format('Se liberó un cupo en «%s». Si te interesa, acéptala antes del %s.', v_titulo_ul,
                            private.formato_fecha(now() + interval '2 days')))
    and not exists (select 1 from public.notificaciones where tipo = 'oferta.cupo_liberado' and entidad_id = o_ul::text
                      and usuario_id in (u_ma, u_mb, u_md, u_ms, u_mv, u_mp, u_mr, u_sm, u_an, u_ao)));
  perform set_config('request.jwt.claims', c_mc, true);
  execute 'set local role authenticated';
  select (m.cuentas -> 0 ->> 'cupos_restantes')::int into v_n from public.marketplace_medio() m where m.id = o_ul;
  execute 'reset role';
  r := r || jsonb_build_object('d06_cupo_vuelve_al_marketplace', v_n = 1);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform * from public.reservar_cupo_srv(o_ul, me_b, cu_b, u_mb, s_mb, k1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('d07_clave_de_un_solo_uso',
    case when v_e = 'AMO_IDEMPOTENCIA_INVALIDA' and v_d = 'Esta solicitud ya se usó. Vuelve a intentarlo.'
              and (select estado = 'RECHAZADA' from public.asignaciones where id = a_ul_b)
              and (select cupos_ocupados = 0 from public.ofertas where id = o_ul)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  select asignacion_id into a_ul_c from public.reservar_cupo_srv(o_ul, me_c, cu_c, u_mc, s_mc, k3);
  execute 'reset role';
  -- Pasada la fecha límite de aceptación ya no se desiste.
  perform set_config('amo.reloj', (now() + interval '2 days 1 hour')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.desistir_asignacion_srv(a_ul_c, u_mc, s_mc, 'Llegué tarde');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  execute 'reset role';
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('d08_no_desiste_tras_la_fecha_limite',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'Ya no puedes desistir de esta asignación.'
              and (select estado = 'ACEPTADA' from public.asignaciones where id = a_ul_c)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.desistir_asignacion_srv(a_ul_c, u_mc, s_mc, 'Cambié de planes');
  execute 'reset role';
  r := r || jsonb_build_object('d09_aviso_como_mucho_cada_6_horas',
    (select estado = 'PUBLICADA' and cupos_ocupados = 0 from public.ofertas where id = o_ul)
    and (select count(*) = v_p from public.notificaciones where tipo = 'oferta.cupo_liberado' and entidad_id = o_ul::text));

  -- ── (c) MED-012 · NOT-006: reservas de la oferta de ejecución, descarga y versión nueva del creativo ───────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  select asignacion_id into a_ea from public.reservar_cupo_srv(o_ej, me_a, cu_a1, u_ma, s_ma, gen_random_uuid());
  select asignacion_id into a_eb from public.reservar_cupo_srv(o_ej, me_b, cu_b, u_mb, s_mb, gen_random_uuid());
  select asignacion_id into a_ec from public.reservar_cupo_srv(o_ej, me_c, cu_c, u_mc, s_mc, gen_random_uuid());
  select asignacion_id into a_mu from public.reservar_cupo_srv(o_mu, me_a, cu_a1, u_ma, s_ma, gen_random_uuid());
  execute 'reset role';
  r := r || jsonb_build_object('c01_precio_por_dos_publicaciones',
    (select monto_bruto = v_bruto_ej and publicaciones = 2 and fecha_limite_publicacion = now() + interval '20 days'
     from public.asignaciones where id = a_ea)
    and (select monto_medio = v_medio_ej from public.asignacion_montos where asignacion_id = a_ea));
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select array_agg(m.id) into v_ids from public.marketplace_medio(null, false, 'fecha', 100, 0) m;
  select count(*) into v_n from public.ofertas_para_medio(o_ej);
  perform public.registrar_vista_oferta(o_ej);
  execute 'reset role';
  -- La ya aceptada sale del listado pero su detalle sigue disponible (enlaza a «Mis campañas»).
  r := r || jsonb_build_object('c02_sin_las_que_tomo_salvo_varios_cupos', not o_ej = any (v_ids) and o_mu = any (v_ids)
    and v_n = 1);
  perform set_config('request.jwt.claims', c_mc, true);
  execute 'set local role authenticated';
  select * into v_rec from public.proximas_acciones_medio(100) p where p.asignacion_id = a_ec;
  execute 'reset role';
  r := r || jsonb_build_object('c03_proxima_accion_descargar',
    v_rec.accion = 'DESCARGAR' and v_rec.oferta_titulo = v_titulo_ej and v_rec.vence_at = now() + interval '20 days'
    and v_rec.numero is null and v_rec.corte is null);
  -- Descarga en T (antes de la fecha límite de aceptación): después ya no se desiste.
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_j := public.registrar_descarga_srv(a_ea, u_ma, s_ma);
  perform public.registrar_descarga_srv(a_eb, u_mb, s_mb);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.desistir_asignacion_srv(a_ea, u_ma, s_ma, 'Ya no puedo');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('c04_descarga_v1',
    v_j ->> 'creativo_id' = cr1::text and (v_j ->> 'version')::int = 1 and jsonb_array_length(v_j -> 'archivos') = 1
    and v_j ->> 'copy_sugerido' = 'La temporada llegó #publicidad' and v_j -> 'hashtags' = '["#publicidad", "#marimba"]'
    and v_j ->> 'enlace_destino' = 'https://marimba.example.com/temporada'
    and (select estado = 'CONTENIDO_ENTREGADO' and creativo_descargado_id = cr1 from public.asignaciones where id = a_ea)
    and (select count(*) = 1 from public.descargas_contenido where asignacion_id = a_ea and creativo_id = cr1));
  -- Con la descarga la asignación ya está en CONTENIDO_ENTREGADO: la máquina de estados no tiene esa salida.
  r := r || jsonb_build_object('c05_no_desiste_tras_descargar',
    case when v_e = 'AMO_TRANSICION_INVALIDA'
              and (select estado = 'CONTENIDO_ENTREGADO' and rechazada_at is null from public.asignaciones where id = a_ea)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  -- Versión 2 creada (pendiente) en T+1d+1h50 y activada en T+1d+3h.
  perform set_config('amo.reloj', (now() + interval '1 day 1 hour 50 minutes')::text, true);
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  insert into public.creativos (oferta_id, tipo, copy_sugerido, hashtags) values (o_ej, 'IMAGEN', 'Versión 2 #publicidad',
                                                                               '{#publicidad}')
  returning id into cr2;
  execute 'reset role';
  insert into storage.objects (bucket_id, name, metadata)
  values ('creativos', 'oferta/' || o_ej || '/' || cr2 || '/1-pieza-v2.webp', jsonb_build_object('size', 5120, 'mimetype', 'image/webp'));
  execute 'set local role authenticated';
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr2, 'oferta/' || o_ej || '/' || cr2 || '/1-pieza-v2.webp', 'image/webp', 5120, 1080, 1080, v_sha2);
  execute 'reset role';

  -- ── (e) MED-013 · INT-001 · INT-002: evidencia ───────────────────────────────────────────────────────────────
  v_ev := 'asignacion/';
  insert into storage.objects (bucket_id, name, metadata)
  select 'evidencias', x.ruta, jsonb_build_object('size', 2048, 'mimetype', x.mime)
  from (values (v_ev || a_eb || '/publicacion/1.webp', 'image/webp'), (v_ev || a_eb || '/publicacion/2.webp', 'image/webp'),
               (v_ev || a_ea || '/publicacion/1.webp', 'image/webp'), (v_ev || a_ea || '/publicacion/1-min.webp', 'image/webp'),
               (v_ev || a_ea || '/publicacion/2.webp', 'image/webp'), (v_ev || a_ea || '/publicacion/2b.webp', 'image/webp'),
               (v_ev || a_ea || '/publicacion/2.pdf', 'application/pdf'),
               (v_ev || a_ea || '/metrica/h24-1.webp', 'image/webp'), (v_ev || a_ea || '/metrica/h24-2.webp', 'image/webp'),
               (v_ev || a_ea || '/metrica/d7-1.webp', 'image/webp'), (v_ev || a_ea || '/metrica/d7-2.webp', 'image/webp'),
               (v_ev || a_ea || '/metrica/p-1.webp', 'image/webp'), (v_ev || a_eb || '/metrica/h24-1.webp', 'image/webp'),
               (v_ev || a_eb || '/metrica/h24-2.webp', 'image/webp')) x (ruta, mime);
  perform set_config('amo.reloj', (now() + interval '1 day 2 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  p_b1 := public.registrar_evidencia_srv(a_eb, 1, 'https://www.instagram.com/p/HumoF3b1/', now() + interval '1 day 1 hour 30 minutes',
                                         v_ev || a_eb || '/publicacion/1.webp', null, true, u_mb, s_mb);
  p_b2 := public.registrar_evidencia_srv(a_eb, 2, 'https://www.instagram.com/reel/HumoF3b2/', now() + interval '1 day 1 hour 30 minutes',
                                         v_ev || a_eb || '/publicacion/2.webp', null, true, u_mb, s_mb);
  p_a1 := public.registrar_evidencia_srv(a_ea, 1, 'https://www.instagram.com/p/humof3a1/', now() + interval '1 day 1 hour 45 minutes',
                                         v_ev || a_ea || '/publicacion/1.webp', v_ev || a_ea || '/publicacion/1-min.webp',
                                         true, u_ma, s_ma);
  execute 'reset role';
  r := r || jsonb_build_object('e01_una_evidencia_por_publicacion',
    (select estado = 'PUBLICADA' from public.asignaciones where id = a_eb)
    and (select estado = 'CONTENIDO_ENTREGADO' from public.asignaciones where id = a_ea)
    and (select estado_validacion = 'PENDIENTE' and numero = 1 and miniatura_path is not null
                and permanencia_hasta = now() + interval '1 day 1 hour 45 minutes' + interval '7 days'
         from public.publicaciones where id = p_a1));
  perform set_config('amo.reloj', (now() + interval '1 day 3 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_res := public.activar_creativo_srv(cr2, u_an, s_an);
  execute 'reset role';
  r := r || jsonb_build_object('c06_version_2_activa',
    v_res ->> 'reemplaza_a' = cr1::text
    and (select version = 2 and vigente and activado_at = now() + interval '1 day 3 hours' from public.creativos where id = cr2));
  r := r || jsonb_build_object('c07_aviso_solo_a_quien_no_ha_publicado',
    (select count(*) = 2 from public.notificaciones
     where tipo = 'creativo.actualizado' and entidad_id = o_ej::text and usuario_id in (u_ma, u_mc)
       and mensaje = format('El anunciante actualizó el contenido de «%s». Descarga la versión 2 antes de publicar.', v_titulo_ej))
    and not exists (select 1 from public.notificaciones where tipo = 'creativo.actualizado' and usuario_id = u_mb));
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select array_agg(p.accion order by p.accion) into v_acciones from public.proximas_acciones_medio(100) p where p.asignacion_id = a_ea;
  execute 'reset role';
  r := r || jsonb_build_object('c08_proxima_accion_version_nueva',
    case when v_acciones = array['DESCARGAR_NUEVA_VERSION', 'PUBLICAR'] then 'true'::jsonb else to_jsonb(v_acciones) end);

  -- Publicación 2 del medio A (T+1d+5h): forma de la URL, URL única, captura y versión vigente al publicar.
  perform set_config('amo.reloj', (now() + interval '1 day 5 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  for v_x in select * from (values
      ('e02_url_de_perfil', 'https://www.instagram.com/humo_f3_a1/', 'publicaciones_url_chk'),
      ('e03_url_de_otra_red', 'https://www.facebook.com/humo/posts/123456', 'publicaciones_url_chk'),
      -- El mismo post de Instagram como reel (N1): la clave es el código, no el texto del enlace.
      ('e04_url_unica_en_la_plataforma', 'https://www.instagram.com/reel/HumoF3b1', 'publicaciones_url_post_key'))
      as t (clave, url, restriccion) loop
    v_e := 'NO FALLÓ'; v_c := null; v_s := null;
    begin
      perform public.registrar_evidencia_srv(a_ea, 2, v_x.url, now() + interval '1 day 2 hours',
                                             v_ev || a_ea || '/publicacion/2.webp', null, true, u_ma, s_ma);
    exception when others then
      get stacked diagnostics v_e = message_text, v_c = constraint_name, v_s = returned_sqlstate;
    end;
    r := r || jsonb_build_object(v_x.clave,
      case when v_c = v_x.restriccion and v_s = case when v_x.restriccion = 'publicaciones_url_post_key' then '23505' else '23514' end
           then 'true'::jsonb else jsonb_build_object('error', v_e, 'constraint', v_c, 'sqlstate', v_s) end);
  end loop;
  -- S2: una historia de otra cuenta no sirve como evidencia de esta asignación.
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/stories/otro_medio/3412345678901234567',
                                           now() + interval '1 day 2 hours', v_ev || a_ea || '/publicacion/2.webp', null,
                                           true, u_ma, s_ma);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('e04b_url_de_otra_cuenta',
    case when v_e = 'AMO_URL_OTRA_CUENTA'
               and v_d = 'El enlace es de @otro_medio y esta campaña es con @humo_f3_a1. Pega el enlace de la publicación en tu cuenta.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detalle', v_d) end);
  -- N1: la clave identifica el post en cualquiera de sus formas; los códigos de Instagram distinguen mayúsculas.
  execute 'reset role';
  r := r || jsonb_build_object('e04c_clave_del_post',
    private.clave_post('https://www.instagram.com/p/AbC12/') = private.clave_post('https://www.instagram.com/reel/AbC12')
    and private.clave_post('https://www.instagram.com/p/AbC12') <> private.clave_post('https://www.instagram.com/p/abc12')
    and private.clave_post('https://www.tiktok.com/@uno/video/7412345678') = private.clave_post('https://www.tiktok.com/@dos/video/7412345678')
    and private.clave_post('https://www.facebook.com/permalink.php?story_fbid=123&id=456')
        = private.clave_post('https://www.facebook.com/permalink.php?id=456&story_fbid=123')
    and private.clave_post('https://www.facebook.com/humo/posts/987654') = private.clave_post('https://www.facebook.com/otra/posts/987654/')
    and private.clave_post('https://vm.tiktok.com/ZMabc/') = 'https://vm.tiktok.com/zmabc'
    -- S2: una evidencia rechazada libera el enlace.
    and (select indexdef like '%WHERE (estado_validacion <> ''RECHAZADA''%' from pg_indexes
         where schemaname = 'public' and indexname = 'publicaciones_url_post_key'));
  execute 'set local role service_role';
  for v_x in select * from (values
      ('e05_captura_en_storage', v_ev || a_ea || '/publicacion/2-no-existe.webp', null::text),
      ('e06_captura_es_imagen', v_ev || a_ea || '/publicacion/2.pdf', null),
      ('e07_miniatura_en_storage', v_ev || a_ea || '/publicacion/2.webp', v_ev || a_ea || '/publicacion/2-min-no-existe.webp'))
      as t (clave, captura, miniatura) loop
    v_e := 'NO FALLÓ'; v_d := null;
    begin
      perform public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/p/humof3a2/', now() + interval '1 day 2 hours',
                                             v_x.captura, v_x.miniatura, true, u_ma, s_ma);
    exception when others then
      get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
    end;
    r := r || jsonb_build_object(v_x.clave,
      case when v_e = 'AMO_CAPTURA_REQUERIDA'
                and v_d = 'Carga la captura del panel de estadísticas (imagen) antes de enviar.' then 'true'::jsonb
           else jsonb_build_object('error', v_e, 'detail', v_d) end);
  end loop;
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/p/humof3a2/', now() + interval '1 day 2 hours',
                                           v_ev || a_ea || '/publicacion/2.webp', null, false, u_ma, s_ma);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('e12_etiqueta_de_publicidad_obligatoria',
    case when v_e = 'AMO_ETIQUETA_REQUERIDA' and v_d = 'Confirma que la publicación lleva la etiqueta de publicidad.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/p/humof3a2/', now() + interval '20 hours',
                                           v_ev || a_ea || '/publicacion/2.webp', null, true, u_ma, s_ma);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('e13_fecha_dentro_de_la_ventana',
    case when v_e = 'AMO_FUERA_DE_VENTANA' and v_d = 'La fecha de publicación está fuera de la ventana de la oferta.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/p/humof3a2/', now() + interval '1 day 4 hours',
                                           v_ev || a_ea || '/publicacion/2.webp', null, true, u_ma, s_ma);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('e08_publicar_despues_de_la_v2_exige_descargarla',
    case when v_e = 'AMO_CREATIVO_DESACTUALIZADO' and v_d = 'Descarga la versión vigente del creativo antes de publicar.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  -- Publicada en T+1d+2h: la v2 ya existía (creada en T+1d+1h50) pero aún no estaba activa; vale la v1 descargada.
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    p_a2 := public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/p/humof3a2/', now() + interval '1 day 2 hours',
                                           v_ev || a_ea || '/publicacion/2.webp', null, true, u_ma, s_ma);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('e09_vale_la_version_vigente_al_publicar',
    case when v_e = 'NO FALLÓ' and (select estado = 'PUBLICADA' and publicada_at = now() + interval '1 day 5 hours'
                                    from public.asignaciones where id = a_ea)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  -- El equipo AMO rechaza la publicación 2 (no abre): la asignación vuelve a CONTENIDO_ENTREGADO para corregirla.
  perform set_config('amo.reloj', (now() + interval '1 day 6 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('publicaciones', p_a2, 'RECHAZADA', u_adm, s_adm, 'La publicación no abre públicamente');
  perform public.transicionar_srv('asignaciones', a_ea, 'CONTENIDO_ENTREGADO', u_adm, s_adm,
                                  'Evidencia rechazada: vuelve a cargar la publicación 2');
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select array_agg(p.accion || coalesce(':' || p.numero, '') order by p.accion) into v_acciones
  from public.proximas_acciones_medio(100) p where p.asignacion_id = a_ea;
  execute 'reset role';
  r := r || jsonb_build_object('e10_proxima_accion_corregir_evidencia',
    case when v_acciones = array['CORREGIR_EVIDENCIA:2', 'DESCARGAR_NUEVA_VERSION'] then 'true'::jsonb
         else to_jsonb(v_acciones) end);
  -- Corrige en T+1d+7h (publicada en T+1d+6h30): ahora sí debe descargar la v2.
  perform set_config('amo.reloj', (now() + interval '1 day 7 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_j := public.registrar_descarga_srv(a_ea, u_ma, s_ma);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.registrar_evidencia_srv(a_ea, 2, 'https://www.instagram.com/p/humof3a2b/', now() + interval '1 day 6 hours 30 minutes',
                                           v_ev || a_ea || '/publicacion/2b.webp', null, true, u_ma, s_ma);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('c09_descarga_v2_sin_cambiar_estado',
    (v_j ->> 'version')::int = 2 and v_j ->> 'creativo_id' = cr2::text and v_j ->> 'copy_sugerido' = 'Versión 2 #publicidad'
    and (select creativo_descargado_id = cr2 from public.asignaciones where id = a_ea)
    and (select count(*) = 2 from public.descargas_contenido where asignacion_id = a_ea));
  r := r || jsonb_build_object('e11_correccion_de_la_rechazada',
    case when v_e = 'NO FALLÓ'
              and (select id = p_a2 and estado_validacion = 'PENDIENTE' and url_post = 'https://www.instagram.com/p/humof3a2b/'
                          and fecha_publicacion = now() + interval '1 day 6 hours 30 minutes'
                   from public.publicaciones where asignacion_id = a_ea and numero = 2)
              and (select estado = 'PUBLICADA' from public.asignaciones where id = a_ea)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  -- Evidencia validada (T+1d+8h).
  perform set_config('amo.reloj', (now() + interval '1 day 8 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('publicaciones', p_a1, 'APROBADA', u_adm, s_adm, null, '{"etiqueta_verificada": true}');
  perform public.transicionar_srv('publicaciones', p_a2, 'APROBADA', u_adm, s_adm, null, '{"etiqueta_verificada": true}');
  perform public.transicionar_srv('asignaciones', a_ea, 'EVIDENCIA_VALIDADA', u_adm, s_adm);
  execute 'reset role';

  -- ── (n) NOT-005: recordatorio al cumplirse cada corte (una vez por publicación y corte) ───────────────────────
  -- Medio B publicó en T+1d+1h30: su H24 se cumple en T+2d+1h30 (las dos publicaciones a la vez, un aviso por cada una).
  perform set_config('amo.reloj', (now() + interval '2 days 2 hours')::text, true);
  perform private.generar_recordatorios();
  r := r || jsonb_build_object('n01_recordatorio_del_corte',
    (select count(*) = 2 from public.notificaciones
     where tipo = 'asignacion.recordatorio_metricas' and usuario_id = u_mb and entidad_id = a_eb::text
       and mensaje in (format('Carga las métricas de 24 horas (publicación 1) de «%s» antes del %s.', v_titulo_ej,
                              private.formato_fecha(now() + interval '4 days 1 hour 30 minutes')),
                       format('Carga las métricas de 24 horas (publicación 2) de «%s» antes del %s.', v_titulo_ej,
                              private.formato_fecha(now() + interval '4 days 1 hour 30 minutes')))));
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
  values (p_b1, 'H24', now() + interval '2 days 2 hours', 10000, 15000, 100, v_ev || a_eb || '/metrica/h24-1.webp')
  returning id into m_h24_b1;
  execute 'reset role';

  -- ── (m) MED-014 · INT-005: métricas (T+2d+3h; la publicación 1 del medio A cumplió 24 h en T+2d+1h45) ────────
  perform set_config('amo.reloj', (now() + interval '2 days 3 hours')::text, true);
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  for v_x in select * from (values
      ('m01_corte_que_la_oferta_no_pide', 'H72', 1, interval '2 days 2 hours', 'La oferta no pide ese corte.'),
      ('m02_corte_aun_no_cumplido', 'H24', 2, interval '2 days 3 hours', 'Aún no se cumple el tiempo del corte desde la publicación.'),
      ('m03_fecha_del_corte_futura', 'H24', 1, interval '2 days 4 hours', 'La fecha del corte está en el futuro.'))
      as t (clave, corte, numero, fecha, detalle) loop
    v_e := 'NO FALLÓ'; v_d := null;
    begin
      insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
      values (case v_x.numero when 1 then p_a1 else p_a2 end, v_x.corte::public.corte_metrica, now() + v_x.fecha,
              20000, 30000, 800, v_ev || a_ea || '/metrica/h24-' || v_x.numero || '.webp');
    exception when others then
      get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
    end;
    r := r || jsonb_build_object(v_x.clave,
      case when v_e = 'AMO_METRICA_INCOHERENTE' and v_d = v_x.detalle then 'true'::jsonb
           else jsonb_build_object('error', v_e, 'detail', v_d) end);
  end loop;
  for v_x in select * from (values
      ('m04_impresiones_bajo_el_alcance', 30000::bigint, 20000::bigint, 800::bigint, null::bigint, 'metricas_alcance_impresiones_chk'),
      ('m05_interacciones_sobre_impresiones', 1000, 1000, 2000, null, 'metricas_interacciones_chk'),
      ('m06_campo_de_otra_plataforma', 20000, 30000, 800, 15000, 'metricas_campos_plataforma_chk'))
      as t (clave, alcance, impresiones, me_gusta, espectadores, restriccion) loop
    v_e := 'NO FALLÓ'; v_c := null;
    begin
      insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, espectadores_unicos,
                                   captura_path)
      values (p_a1, 'H24', now() + interval '2 days 2 hours', v_x.alcance, v_x.impresiones, v_x.me_gusta, v_x.espectadores,
              v_ev || a_ea || '/metrica/h24-1.webp');
    exception when others then
      get stacked diagnostics v_e = message_text, v_c = constraint_name;
    end;
    r := r || jsonb_build_object(v_x.clave,
      case when v_c = v_x.restriccion then 'true'::jsonb else jsonb_build_object('error', v_e, 'constraint', v_c) end);
  end loop;
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
    values (p_a1, 'H24', now() + interval '2 days 2 hours', 20000, 30000, 800, v_ev || a_ea || '/metrica/h24-no-existe.webp');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('m07_captura_obligatoria',
    case when v_e = 'AMO_CAPTURA_REQUERIDA' then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, comentarios, captura_path)
  values (p_a1, 'H24', now() + interval '2 days 2 hours', 20000, 30000, 800, 40, v_ev || a_ea || '/metrica/h24-1.webp')
  returning id into m_h24_a1;
  -- Corte personalizado: del día de la publicación hasta T+2d+1h, con su captura; repetir el intervalo no duplica.
  v_t := private.inicio_dia(((now() + interval '1 day 1 hour 45 minutes') at time zone 'America/Bogota')::date);
  insert into public.metricas (publicacion_id, corte, fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones, me_gusta,
                               captura_path)
  values (p_a1, 'PERSONALIZADO', now() + interval '2 days 2 hours', v_t, now() + interval '2 days 1 hour', 15000, 22000, 500,
          v_ev || a_ea || '/metrica/p-1.webp')
  returning id into m_per_a1;
  v_e := 'NO FALLÓ'; v_c := null;
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones,
                                 me_gusta, captura_path)
    values (p_a1, 'PERSONALIZADO', now() + interval '2 days 2 hours', v_t, now() + interval '2 days 1 hour', 15000, 22000, 500,
            v_ev || a_ea || '/metrica/p-1.webp');
  exception when others then
    get stacked diagnostics v_e = message_text, v_c = constraint_name;
  end;
  r := r || jsonb_build_object('m08_personalizado_idempotente',
    case when v_c = 'metricas_personalizado_key' then 'true'::jsonb else jsonb_build_object('error', v_e, 'constraint', v_c) end);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones,
                                 me_gusta, captura_path)
    values (p_a1, 'PERSONALIZADO', now() + interval '2 days 2 hours', v_t - interval '1 day', now() + interval '2 days',
            15000, 22000, 500, v_ev || a_ea || '/metrica/p-1.webp');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('m09_personalizado_desde_el_dia_de_la_publicacion',
    case when v_e = 'AMO_METRICA_INCOHERENTE'
              and v_d = 'El intervalo debe empezar el día de la publicación y terminar antes de la fecha del corte.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  select array_agg(p.accion || ':' || p.numero || ':' || p.corte order by p.accion, p.numero) into v_acciones
  from public.proximas_acciones_medio(100) p where p.asignacion_id = a_ea;
  select p.vence_at into v_t from public.proximas_acciones_medio(100) p
  where p.asignacion_id = a_ea and p.accion = 'CARGAR_METRICA_H24';
  -- DSH-006: ordenadas por vencimiento (el H24 de la publicación 2 vence antes que la descarga del post de varios cupos).
  select array_agg(p.accion || ':' || coalesce(p.numero::text, '-') order by p.ordinality) into v_ids2_txt
  from public.proximas_acciones_medio(100) with ordinality p;
  execute 'reset role';
  r := r || jsonb_build_object('m11b_ordenadas_por_vencimiento',
    case when v_ids2_txt = array['CARGAR_METRICA_H24:2', 'DESCARGAR:-', 'CARGAR_METRICA_D7:1', 'CARGAR_METRICA_D7:2']
         then 'true'::jsonb else to_jsonb(v_ids2_txt) end);
  r := r || jsonb_build_object('m10_metrica_cargada_pendiente',
    (select estado_validacion = 'PENDIENTE' and asignacion_id = a_ea and medio_id = me_a and interacciones = 840
     from public.metricas where id = m_h24_a1)
    and (select corte = 'PERSONALIZADO' and estado_validacion = 'PENDIENTE' from public.metricas where id = m_per_a1)
    and (select estado = 'EVIDENCIA_VALIDADA' from public.asignaciones where id = a_ea));
  r := r || jsonb_build_object('m11_proximas_acciones_con_numero_y_corte',
    case when v_acciones = array['CARGAR_METRICA_D7:1:D7', 'CARGAR_METRICA_D7:2:D7', 'CARGAR_METRICA_H24:2:H24']
              and v_t = now() + interval '1 day 6 hours 30 minutes' + interval '24 hours' + interval '48 hours'
         then 'true'::jsonb else jsonb_build_object('acciones', v_acciones, 'vence_h24', v_t) end);
  perform set_config('amo.reloj', (now() + interval '2 days 7 hours')::text, true);
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
  values (p_a2, 'H24', now() + interval '2 days 7 hours', 10000, 15000, 300, v_ev || a_ea || '/metrica/h24-2.webp')
  returning id into m_h24_a2;
  execute 'reset role';

  -- ── (n) NOT-005: aviso de atrasadas por corte (48 h después del corte, una vez) ────────────────────────────────
  -- T+4d+2h: el H24 de la publicación 2 del medio B venció su plazo de carga en T+4d+1h30; el D7 aún no se cumple.
  perform set_config('amo.reloj', (now() + interval '4 days 2 hours')::text, true);
  perform private.generar_recordatorios();
  r := r || jsonb_build_object('n02_atrasadas_por_corte',
    (select count(*) = 1 from public.notificaciones
     where tipo = 'asignacion.metricas_atrasadas' and usuario_id = u_mb and entidad_id = a_eb::text and prioridad = 2
       and mensaje = format('Las métricas de 24 horas (publicación 2) de «%s» están atrasadas. Cárgalas cuanto antes '
                            'para no retrasar tu pago.', v_titulo_ej))
    and exists (select 1 from private.avisos_metricas_atrasadas where asignacion_id = a_eb and numero = 2 and corte = 'H24')
    and not exists (select 1 from private.avisos_metricas_atrasadas where asignacion_id = a_eb and numero = 1)
    and not exists (select 1 from private.avisos_metricas_atrasadas where asignacion_id = a_eb and corte = 'D7')
    and not exists (select 1 from public.notificaciones where tipo = 'asignacion.metricas_atrasadas' and entidad_id = a_ea::text));
  perform private.generar_recordatorios();
  r := r || jsonb_build_object('n03_sin_duplicar',
    (select count(*) = 1 from public.notificaciones where tipo = 'asignacion.metricas_atrasadas' and entidad_id = a_eb::text)
    and (select count(*) = 2 from public.notificaciones where tipo = 'asignacion.recordatorio_metricas' and entidad_id = a_eb::text));

  -- ── (x) MED-014: el medio edita solo mientras la asignación admite métricas ──────────────────────────────────
  perform set_config('amo.reloj', (now() + interval '4 days 3 hours')::text, true);
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  update public.metricas set me_gusta = 120 where id = m_h24_b1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('asignaciones', a_eb, 'CANCELADA', u_adm, s_adm, 'Incumplió las condiciones de la marca',
                                  '{"causa": "ADMINISTRATIVA"}');
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  update public.metricas set me_gusta = 150 where id = m_h24_b1;
  get diagnostics v_m = row_count;
  v_e := 'NO FALLÓ'; v_s := null;
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
    values (p_b2, 'H24', now() + interval '4 days 3 hours', 10000, 15000, 100, v_ev || a_eb || '/metrica/h24-2.webp');
  exception when others then
    get stacked diagnostics v_e = message_text, v_s = returned_sqlstate;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('x01_edita_mientras_admite', v_n = 1);
  r := r || jsonb_build_object('x02_cancelada_no_admite_metricas',
    case when v_m = 0 and v_s = '42501' and (select me_gusta = 120 from public.metricas where id = m_h24_b1)
         then 'true'::jsonb else jsonb_build_object('filas', v_m, 'error', v_e, 'sqlstate', v_s) end);

  -- ── (m) Coherencia entre cortes (T+8d+3h; el D7 de la publicación 1 se cumplió en T+8d+1h45) ─────────────────
  perform set_config('amo.reloj', (now() + interval '8 days 3 hours')::text, true);
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, comentarios, captura_path)
    values (p_a1, 'D7', now() + interval '8 days 2 hours', 19000, 30000, 800, 40, v_ev || a_ea || '/metrica/d7-1.webp');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  r := r || jsonb_build_object('m12_corte_posterior_no_baja',
    case when v_e = 'AMO_METRICA_INCOHERENTE'
              and v_d = 'Los valores no cuadran con el corte H24: un corte posterior no puede tener menos alcance, impresiones o interacciones.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  execute 'reset role';
  -- 19.700 es 1,5 % menos que 20.000: pasa con la tolerancia del 2 % y no sin ella.
  update public.configuracion set valor = '0' where clave = 'metricas.tolerancia_cortes';
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ';
  begin
    insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, comentarios, captura_path)
    values (p_a1, 'D7', now() + interval '8 days 2 hours', 19700, 30000, 800, 40, v_ev || a_ea || '/metrica/d7-1.webp');
  exception when others then
    get stacked diagnostics v_e = message_text;
  end;
  execute 'reset role';
  update public.configuracion set valor = '0.02' where clave = 'metricas.tolerancia_cortes';
  execute 'set local role authenticated';
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, comentarios, captura_path)
  values (p_a1, 'D7', now() + interval '8 days 2 hours', 19700, 30000, 800, 40, v_ev || a_ea || '/metrica/d7-1.webp')
  returning id into m_d7_a1;
  r := r || jsonb_build_object('m13_tolerancia_configurable',
    case when v_e = 'AMO_METRICA_INCOHERENTE' and m_d7_a1 is not null then 'true'::jsonb else to_jsonb(v_e) end);
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    update public.metricas set alcance = 25000 where id = m_h24_a1;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('m14_corte_anterior_no_supera_al_posterior',
    case when v_e = 'AMO_METRICA_INCOHERENTE'
              and v_d = 'Los valores no cuadran con el corte D7: un corte posterior no puede tener menos alcance, impresiones o interacciones.'
              and (select alcance = 20000 from public.metricas where id = m_h24_a1)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  r := r || jsonb_build_object('m15_personalizado_no_reemplaza_cortes',
    (select estado = 'EVIDENCIA_VALIDADA' from public.asignaciones where id = a_ea));
  -- T+8d+7h: el último corte requerido pasa la asignación a METRICAS_CARGADAS sola.
  perform set_config('amo.reloj', (now() + interval '8 days 7 hours')::text, true);
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, captura_path)
  values (p_a2, 'D7', now() + interval '8 days 7 hours', 10500, 15500, 320, v_ev || a_ea || '/metrica/d7-2.webp')
  returning id into m_d7_a2;
  execute 'reset role';
  r := r || jsonb_build_object('m16_metricas_cargadas',
    (select estado = 'METRICAS_CARGADAS' and metricas_cargadas_at = now() + interval '8 days 7 hours'
     from public.asignaciones where id = a_ea));
  -- T+8d+8h: el equipo AMO aprueba los H24 y el D7 de la publicación 2, y rechaza el D7 de la publicación 1.
  perform set_config('amo.reloj', (now() + interval '8 days 8 hours')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('metricas', m_h24_a1, 'APROBADA', u_adm, s_adm);
  perform public.transicionar_srv('metricas', m_h24_a2, 'APROBADA', u_adm, s_adm);
  perform public.transicionar_srv('metricas', m_d7_a2, 'APROBADA', u_adm, s_adm);
  perform public.transicionar_srv('metricas', m_d7_a1, 'RECHAZADA', u_adm, s_adm, 'La captura no muestra la fecha');
  perform public.transicionar_srv('asignaciones', a_ea, 'EVIDENCIA_VALIDADA', u_adm, s_adm, 'Métricas rechazadas');
  execute 'reset role';
  -- S1: en Storage el anunciante lee las capturas de las publicaciones registradas y las de los cortes APROBADA; no las
  -- de cortes pendientes o rechazados ni las subidas sin registrar.
  select array_agg(m.captura_path) filter (where m.estado_validacion = 'APROBADA'),
         array_agg(m.captura_path) filter (where m.estado_validacion <> 'APROBADA')
    into v_aprobadas, v_otras from public.metricas m where m.asignacion_id in (a_ea, a_eb);
  select count(*) into v_k from storage.objects o
   where o.bucket_id = 'evidencias' and o.name like 'asignacion/' || a_ea || '/publicacion/%'
     and exists (select 1 from public.publicaciones p where p.asignacion_id = a_ea and o.name in (p.captura_path, p.miniatura_path));
  select count(*) into v_q from storage.objects o
   where o.bucket_id = 'evidencias' and o.name like 'asignacion/' || a_ea || '/publicacion/%';
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'evidencias' and name = any (v_aprobadas);
  select count(*) into v_m from storage.objects where bucket_id = 'evidencias' and name = any (v_otras);
  select count(*) into v_p from storage.objects where bucket_id = 'evidencias' and name like 'asignacion/' || a_ea || '/publicacion/%';
  execute 'reset role';
  r := r || jsonb_build_object('s01_anunciante_storage_como_la_rls',
    case when v_n = cardinality(v_aprobadas) and v_n > 0 and cardinality(v_otras) > 0 and v_m = 0 and v_p = v_k and v_k > 0
              and v_q > v_k
         then 'true'::jsonb
         else jsonb_build_object('aprobadas', v_n, 'otras', v_m, 'publicacion', v_p, 'registradas', v_k, 'subidas', v_q) end);
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  update public.metricas set alcance = 30000 where id = m_h24_a1;
  get diagnostics v_n = row_count;
  select array_agg(p.accion || ':' || p.numero || ':' || p.corte order by p.accion) into v_acciones
  from public.proximas_acciones_medio(100) p where p.asignacion_id = a_ea;
  select p.vence_at into v_t from public.proximas_acciones_medio(100) p
  where p.asignacion_id = a_ea and p.accion = 'CORREGIR_METRICAS';
  update public.metricas set alcance = 20500, impresiones = 31000 where id = m_d7_a1;
  get diagnostics v_m = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('m17_aprobada_no_se_edita',
    v_n = 0 and (select alcance = 20000 and estado_validacion = 'APROBADA' from public.metricas where id = m_h24_a1));
  r := r || jsonb_build_object('m18_proxima_accion_corregir_metricas',
    case when v_acciones = array['CORREGIR_METRICAS:1:D7'] and v_t = now() + interval '8 days 8 hours' + interval '48 hours'
         then 'true'::jsonb else jsonb_build_object('acciones', v_acciones, 'vence', v_t) end);
  r := r || jsonb_build_object('m19_rechazada_se_corrige',
    v_m = 1
    and (select estado_validacion = 'PENDIENTE' and alcance = 20500 and observaciones = 'La captura no muestra la fecha'
         from public.metricas where id = m_d7_a1)
    and (select estado = 'METRICAS_CARGADAS' from public.asignaciones where id = a_ea));

  -- ── (c) MED-012 · MED-011: vencido el plazo para publicar no hay descarga; la vencida muestra su plazo de reclamo
  perform set_config('amo.reloj', (now() + interval '20 days 1 hour')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null;
  begin
    perform public.registrar_descarga_srv(a_ec, u_mc, s_mc);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('c10_descarga_fuera_de_plazo',
    case when v_e = 'AMO_FUERA_DE_VENTANA' and v_d = 'Venció el plazo para publicar: ya no puedes descargar el contenido.'
              and (select estado = 'ACEPTADA' and contenido_descargado_at is null from public.asignaciones where id = a_ec)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d) end);
  v_ok := private.cron_aplicar('asignaciones', a_ec, 'VENCIDA_SIN_PUBLICAR', 'Venció la ventana de publicación sin evidencia');
  perform set_config('request.jwt.claims', c_mc, true);
  execute 'set local role authenticated';
  select * into v_rec from public.mis_asignaciones_medio(null, 50, null, a_ec);
  execute 'reset role';
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('a01_vencida_con_plazo_de_reclamo',
    v_ok and v_rec.estado = 'VENCIDA_SIN_PUBLICAR' and v_rec.vencida_at = now() + interval '20 days 1 hour'
    and v_rec.reclamo_hasta = now() + interval '20 days 1 hour' + interval '72 hours');

  -- ── (a) MED-011: mis asignaciones (solo las aceptadas del medio, con la oferta) ───────────────────────────────
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select count(*) filter (where m.id = a_ea), count(*) filter (where m.id = a_mu),
         count(*) filter (where m.oferta_id = o_rc or m.id in (a_eb, a_ec, a_ul_b, a_ul_c))
    into v_n, v_m, v_k
  from public.mis_asignaciones_medio() m;
  select * into v_rec from public.mis_asignaciones_medio(null, 50, null, a_ea);
  select count(*) into v_p from public.mis_asignaciones_medio(array['METRICAS_CARGADAS']::public.asignacion_estado[]) m;
  execute 'reset role';
  r := r || jsonb_build_object('a02_solo_las_aceptadas_propias', v_n = 1 and v_m = 1 and v_k = 0 and v_p = 1);
  r := r || jsonb_build_object('a03_con_la_oferta_y_la_cuenta',
    v_rec.oferta_titulo = v_titulo_ej and v_rec.marca = 'Marca Marimba' and v_rec.anunciante_nombre = 'Humo F3 Verificada'
    and v_rec.formato_id = f_post and v_rec.formato_nombre = v_formato_post and v_rec.cortes_requeridos = '{H24,D7}'
    and v_rec.permanencia_minima_dias = 7 and v_rec.handle = 'humo_f3_a1' and v_rec.estado = 'METRICAS_CARGADAS'
    and v_rec.ventana_fin = now() + interval '20 days' and v_rec.fecha_limite_aceptacion = now() + interval '12 hours'
    and v_rec.monto_medio = v_medio_ej and v_rec.monto_bruto = v_bruto_ej and v_rec.multiplicador_calidad_aplicado = 1
    and v_rec.porcentaje_comision = 0.2 and v_rec.reclamo_hasta is null);
  update public.configuracion set valor = 'false' where clave = 'comision.visible_para_medio';
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select * into v_rec from public.mis_asignaciones_medio(null, 50, null, a_ea);
  execute 'reset role';
  update public.configuracion set valor = 'true' where clave = 'comision.visible_para_medio';
  r := r || jsonb_build_object('a04_sin_comision_visible',
    v_rec.monto_medio = v_medio_ej and v_rec.multiplicador_calidad_aplicado = 1 and v_rec.monto_bruto is null
    and v_rec.tarifa_base_aplicada is null and v_rec.porcentaje_comision is null and v_rec.monto_comision is null
    and v_rec.multiplicador_geografico_aplicado is null);

  -- ── (s) ANU-011: seguimiento del anunciante ─────────────────────────────────────────────────────────────────
  select count(*) into v_total from public.asignaciones where campana_id = c_v and aceptada_at is not null;
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  select count(*), count(*) filter (where s.oferta_id = o_rc), count(*) filter (where s.asignacion_id = a_ul_b)
    into v_n, v_m, v_k
  from public.seguimiento_campana(c_v) s;
  select * into v_rec from public.seguimiento_campana(c_v) s where s.asignacion_id = a_ea;
  select count(*) into v_p from public.metricas where asignacion_id = a_ea;
  select count(*) filter (where a.oferta_id = o_rc), count(*) filter (where a.id = a_ul_b) into v_q, v_num
  from public.asignaciones a where a.campana_id = c_v;
  execute 'reset role';
  r := r || jsonb_build_object('s01_asignaciones_aceptadas',
    case when v_n = v_total and v_n >= 6 and v_m = 0 and v_k = 1 then 'true'::jsonb
         else jsonb_build_object('filas', v_n, 'esperadas', v_total, 'rechazo_marketplace', v_m, 'desistida', v_k) end);
  r := r || jsonb_build_object('s02_medio_publico_y_cuenta',
    v_rec.medio_id = me_a and v_rec.medio_nombre = 'Medio Marimba A' and v_rec.municipio_codigo = v_mun
    and v_rec.nivel_verificacion = 1 and v_rec.estado = 'METRICAS_CARGADAS' and v_rec.monto_bruto = v_bruto_ej
    and v_rec.cuenta = jsonb_build_object('plataforma', 'INSTAGRAM', 'handle', 'humo_f3_a1', 'url', 'https://instagram.com/humo_f3_a1',
                                          'seguidores_al_aceptar', 45000, 'franja_clave', 'F1')
    and jsonb_array_length(v_rec.publicaciones) = 2
    and v_rec.publicaciones -> 0 ->> 'url_post' = 'https://www.instagram.com/p/humof3a1/'
    and (v_rec.publicaciones -> 0 ->> 'con_captura')::boolean
    and v_rec.publicaciones -> 1 ->> 'url_post' = 'https://www.instagram.com/p/humof3a2b/'
    and v_rec.publicaciones -> 1 ->> 'estado_validacion' = 'APROBADA');
  r := r || jsonb_build_object('s03_solo_cortes_aprobados',
    case when jsonb_array_length(v_rec.publicaciones -> 0 -> 'cortes') = 1
              and v_rec.publicaciones -> 0 -> 'cortes' -> 0 ->> 'corte' = 'H24'
              and (v_rec.publicaciones -> 0 -> 'cortes' -> 0 ->> 'alcance')::int = 20000
              and (v_rec.publicaciones -> 0 -> 'cortes' -> 0 ->> 'impresiones')::int = 30000
              and (v_rec.publicaciones -> 0 -> 'cortes' -> 0 ->> 'interacciones')::int = 840
              and jsonb_path_query_array(v_rec.publicaciones -> 1 -> 'cortes', '$[*].corte') = '["H24", "D7"]'
              and v_p = 3
         then 'true'::jsonb else jsonb_build_object('publicaciones', v_rec.publicaciones, 'metricas_visibles', v_p) end);
  r := r || jsonb_build_object('s04_sin_lo_que_recibe_el_medio',
    not (to_jsonb(v_rec) ?| array['monto_medio', 'porcentaje_comision', 'monto_comision', 'monto_neto', 'retenciones_aplicadas'])
    and (select array_agg(k order by k) from jsonb_object_keys(v_rec.cuenta) k)
        = array['franja_clave', 'handle', 'plataforma', 'seguidores_al_aceptar', 'url']
    and not exists (select 1 from jsonb_array_elements(v_rec.publicaciones) p
                    where p ?| array['captura_path', 'miniatura_path', 'observaciones']));
  r := r || jsonb_build_object('s05_rls_sin_rechazos_de_marketplace', v_q = 0 and v_num = 1);
  perform set_config('request.jwt.claims', c_ao, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.seguimiento_campana(c_v);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.seguimiento_campana(c_v);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  select count(*) into v_k from public.seguimiento_campana(c_v);
  execute 'reset role';
  r := r || jsonb_build_object('s06_solo_su_empresa_o_el_equipo_amo', v_n = 0 and v_m = 0 and v_k = v_total);

  -- ── (q) PRC-003 · PRC-004: el medio lee la calidad de sus cuentas ────────────────────────────────────────────
  update public.cuentas_sociales set multiplicador_proximo = 1.12, multiplicador_proximo_desde = private.inicio_dia(private.hoy() + 7),
         indice_calidad = 0.4, indice_franja = 0.35, alcance_mediano = 18000, multiplicador_calculado_at = now()
   where id = cu_a1;
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select multiplicador_calidad, multiplicador_proximo, multiplicador_proximo_desde, indice_calidad, indice_franja,
         alcance_mediano, publicaciones_verificadas_count
    into v_rec
  from public.cuentas_sociales where id = cu_a1;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.cuentas_sociales where id = cu_a1;
  execute 'reset role';
  r := r || jsonb_build_object('q01_medio_lee_su_calidad',
    v_rec.multiplicador_calidad = 1 and v_rec.multiplicador_proximo = 1.12 and v_rec.indice_calidad = 0.4
    and v_rec.indice_franja = 0.35 and v_rec.alcance_mediano = 18000 and v_rec.publicaciones_verificadas_count = 0
    and v_rec.multiplicador_proximo_desde = private.inicio_dia(private.hoy() + 7) and v_n = 0);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
