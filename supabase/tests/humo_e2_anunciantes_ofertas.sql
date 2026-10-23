-- Pruebas de humo de 20261022193647_e2_anunciantes_ofertas (fase 2): identificación y verificación del anunciante
-- (ANU-001, ADM-003), compañeros de empresa (ANU-002), campañas (ANU-003), segmentación, estimador y exclusiones
-- (ANU-005, ANU-007), fechas, anticipación, cortes y exclusividad (ANU-006), paquete creativo (ANU-008), envío,
-- devolución e historial (ANU-009), versiones del creativo (ANU-010), cancelaciones y cascada (ANU-014), moderación
-- (ADM-005) y el cron de revisión vencida y borradores caducados. También lo que agregó la integración: comentario de
-- moderación en rechazos y devoluciones del cron, tipo de creativo según el formato (t), ruta única y orden de los
-- archivos (f), descarte de la versión pendiente (d), presupuesto y fechas para cualquier rol (b) y archivar ofertas y
-- campañas (a). Y lo que corrigió la revisión adversarial: el estimador no deja conocer a un medio (S1 · R2, s08…s11),
-- la identificación que cambia después de aprobar los documentos (S3, h), la moderación decide sobre el envío que
-- revisó (S2, m), las obligaciones cumplidas no impiden cancelar la campaña (R3, c05…c06) y una empresa suspendida no
-- activa versiones del creativo (S5, v09…v10).
-- Se ejecuta como owner (pnpm db:suites) en una transacción que SIEMPRE se revierte. Fija la configuración que usa
-- (anticipación de 24 h, umbral de 30.000, n mínimo de 3…) para dar lo mismo en local, develop y producción, y aísla el
-- estimador con una categoría propia: no depende de los datos demo. Cada prueba deja `true` si pasa o lo observado
-- si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_e text; v_d text; v_h text;
  v_n bigint; v_m bigint; v_k bigint;
  v_t text;
  v_ok boolean; v_ok2 boolean;
  v_rec record;
  -- usuarios y sesiones
  u_adm constant uuid := '00000000-0000-4000-a000-0000000f2001';   -- ADMIN (verifica, modera, suspende)
  u_ap constant uuid := '00000000-0000-4000-a000-0000000f2002';    -- ANUNCIANTE de la empresa PENDIENTE
  u_av1 constant uuid := '00000000-0000-4000-a000-0000000f2003';   -- ANUNCIANTE de la empresa verificada
  u_av2 constant uuid := '00000000-0000-4000-a000-0000000f2004';   -- su compañero de empresa
  u_ao constant uuid := '00000000-0000-4000-a000-0000000f2005';    -- ANUNCIANTE de otra empresa
  u_ax constant uuid := '00000000-0000-4000-a000-0000000f2006';    -- ANUNCIANTE de la empresa extranjera
  u_ma constant uuid := '00000000-0000-4000-a000-0000000f2007';    -- MEDIO A
  u_mb constant uuid := '00000000-0000-4000-a000-0000000f2008';    -- MEDIO B
  u_mc constant uuid := '00000000-0000-4000-a000-0000000f2009';    -- MEDIO C (excluido de la oferta)
  u_gc constant uuid := '00000000-0000-4000-a000-0000000f2010';    -- rol interno propio: gestiona campañas, no ve ofertas
  u_an constant uuid := '00000000-0000-4000-a000-0000000f2011';    -- ANUNCIANTE de la empresa que cambia su NIT
  s_adm constant uuid := '00000000-0000-4000-b000-0000000f2001';
  s_ap constant uuid := '00000000-0000-4000-b000-0000000f2002';
  s_av1 constant uuid := '00000000-0000-4000-b000-0000000f2003';
  s_av2 constant uuid := '00000000-0000-4000-b000-0000000f2004';
  s_ao constant uuid := '00000000-0000-4000-b000-0000000f2005';
  s_ax constant uuid := '00000000-0000-4000-b000-0000000f2006';
  s_ma constant uuid := '00000000-0000-4000-b000-0000000f2007';
  s_mb constant uuid := '00000000-0000-4000-b000-0000000f2008';
  s_mc constant uuid := '00000000-0000-4000-b000-0000000f2009';
  s_gc constant uuid := '00000000-0000-4000-b000-0000000f2010';
  s_an constant uuid := '00000000-0000-4000-b000-0000000f2011';
  rol_gc constant uuid := '00000000-0000-4000-f000-0000000f20a1';
  an_p constant uuid := '00000000-0000-4000-c000-0000000f2001';
  an_v constant uuid := '00000000-0000-4000-c000-0000000f2002';
  an_o constant uuid := '00000000-0000-4000-c000-0000000f2003';
  an_x constant uuid := '00000000-0000-4000-c000-0000000f2004';
  an_x2 constant uuid := '00000000-0000-4000-c000-0000000f2005';
  an_n constant uuid := '00000000-0000-4000-c000-0000000f2006';   -- PENDIENTE que cambia su NIT con documentos aprobados
  me_a constant uuid := '00000000-0000-4000-d000-0000000f2001';
  me_b constant uuid := '00000000-0000-4000-d000-0000000f2002';
  me_c constant uuid := '00000000-0000-4000-d000-0000000f2003';
  me_d constant uuid := '00000000-0000-4000-d000-0000000f2004';   -- 25.000 seguidores: bajo el umbral
  -- Estimador (S1 · R2): seis medios de otra categoría con 41.000 a 47.000 seguidores y precios de 0,8× a 1,3×.
  me_e1 constant uuid := '00000000-0000-4000-d000-0000000f2011';
  me_e2 constant uuid := '00000000-0000-4000-d000-0000000f2012';
  me_e3 constant uuid := '00000000-0000-4000-d000-0000000f2013';
  me_e4 constant uuid := '00000000-0000-4000-d000-0000000f2014';
  me_e5 constant uuid := '00000000-0000-4000-d000-0000000f2015';
  me_e6 constant uuid := '00000000-0000-4000-d000-0000000f2016';
  cu_a constant uuid := '00000000-0000-4000-e000-0000000f2001';
  cu_b constant uuid := '00000000-0000-4000-e000-0000000f2002';
  cu_c constant uuid := '00000000-0000-4000-e000-0000000f2003';
  cu_d constant uuid := '00000000-0000-4000-e000-0000000f2004';
  cat_h constant uuid := '00000000-0000-4000-f000-0000000f20c1';
  cat_e constant uuid := '00000000-0000-4000-f000-0000000f20c2';
  c_cas constant uuid := '00000000-0000-4000-f000-0000000f2101';
  c_cron constant uuid := '00000000-0000-4000-f000-0000000f2102';
  c_cum constant uuid := '00000000-0000-4000-f000-0000000f2103';   -- R3: campaña con obligaciones cumplidas
  o_cum constant uuid := '00000000-0000-4000-f000-0000000f2207';   -- R3: EN_EJECUCION con asignaciones verificada y pagada
  o_csa constant uuid := '00000000-0000-4000-f000-0000000f2208';   -- R3: PUBLICADA sin aceptaciones
  a_ver constant uuid := '00000000-0000-4000-f000-0000000f2401';   -- R3: VERIFICADA
  a_pag constant uuid := '00000000-0000-4000-f000-0000000f2402';   -- R3: PAGADA
  a_cur constant uuid := '00000000-0000-4000-f000-0000000f2403';   -- R3: PUBLICADA (en curso) y luego VERIFICADA
  l_cum constant uuid := '00000000-0000-4000-f000-0000000f2501';   -- R3: liquidación pagada de a_pag
  o_kb constant uuid := '00000000-0000-4000-f000-0000000f2201';   -- cascada: BORRADOR
  o_kr constant uuid := '00000000-0000-4000-f000-0000000f2202';   -- cascada: EN_REVISION
  o_kd constant uuid := '00000000-0000-4000-f000-0000000f2203';   -- cascada: DEVUELTA
  o_kp constant uuid := '00000000-0000-4000-f000-0000000f2204';   -- cascada: PUBLICADA
  o_ke constant uuid := '00000000-0000-4000-f000-0000000f2205';   -- cascada: EN_EJECUCION
  o_kc constant uuid := '00000000-0000-4000-f000-0000000f2206';   -- PUBLICADA que el anunciante cancela
  o_r1 constant uuid := '00000000-0000-4000-f000-0000000f2301';   -- cron: EN_REVISION que vence en la cola
  o_r2 constant uuid := '00000000-0000-4000-f000-0000000f2302';   -- cron: BORRADOR cuya ventana termina
  o_r3 constant uuid := '00000000-0000-4000-f000-0000000f2303';   -- cron: BORRADOR vigente (control)
  c_adm text; c_ap text; c_av1 text; c_av2 text; c_ao text; c_ax text; c_ma text; c_mb text; c_mc text; c_gc text;
  c_an text;
  c_srv constant text := '{"role": "service_role"}';
  -- catálogos
  v_hoy date := private.hoy();
  v_sector uuid := (select id from public.sectores order by nombre limit 1);
  v_mun char(5) := (select m.codigo from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                    where m.activo and d.activo order by m.codigo limit 1);
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  f_reel uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'REEL');
  f_car uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'CARRUSEL');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa numeric;
  v_tarifa_id uuid;
  v_r integer;
  v_dv_malo char(1) := ((private.digito_verificacion_nit('900777001')::integer + 1) % 10)::text;
  v_dv_nuevo char(1) := private.digito_verificacion_nit('900777011');
  v_dv_n char(1) := private.digito_verificacion_nit('900777024');
  v_motivo_rechazo constant text := 'El RUT está ilegible: cárgalo de nuevo';
  v_comentario constant text := 'El copy no muestra la etiqueta de publicidad';
  v_motivo_cascada constant text := 'La marca aplazó el lanzamiento';
  -- negocio (se crean durante la prueba)
  c_p uuid; c_v uuid; o_p uuid; o_env uuid; o_reel uuid; o_ant uuid; o_presu uuid;
  cr1 uuid; cr2 uuid; cr_reel uuid; cr_presu uuid; d_rut uuid; d_cc uuid; d_rut2 uuid; d_cb uuid; d_otro uuid;
  a_a uuid; v_comprometido numeric;
  p_cr1 text; p_cr2 text; p_reel text; p_presu text;
  c_arc uuid; o_arc uuid; o_car uuid; cr_car uuid; cr3 uuid; cr4 uuid; ca1 uuid; ca_pend uuid;
  p_car1 text; p_car2 text; p_cr3 text; v_s text;
  v_j0 jsonb; v_j1 jsonb; v_j2 jsonb; v_j3 jsonb; v_res jsonb; v_visto timestamptz; v_actual timestamptz;
  d_n_rut uuid; d_n_cc uuid; d_n_rut2 uuid; d_n_cc2 uuid; p_cr4 text;
  v_sha1 constant text := encode(sha256('humo-f2-1'::bytea), 'hex');
  v_sha2 constant text := encode(sha256('humo-f2-2'::bytea), 'hex');
begin
  -- ── Preparación (owner, modo_carga) ──────────────────────────────────────────────────────────────────────────
  -- Configuración que la suite supone (en producción la de prueba deja anticipación 0 h y un solo corte).
  update public.configuracion c set valor = x.valor
  from (values ('ofertas.anticipacion_minima_horas', '24'::jsonb), ('ofertas.minimo_medios', '1'),
               ('ofertas.estimador_n_minimo', '3'), ('medios.umbral_seguidores', '30000'),
               ('calidad.minimo_publicaciones', '5'), ('calidad.multiplicador_piso', '0.7'),
               ('calidad.multiplicador_techo', '1.4'), ('archivos.max_creativo_mb', '50'),
               ('archivos.tolerancia_aspecto', '0.02'), ('precios.recargo_exclusividad', '1.25'),
               ('campanas.tope_porcentaje_por_medio', '0.15'), ('metricas.cortes_requeridos', '["H24", "H72", "D7"]'))
       as x (clave, valor)
  where c.clave = x.clave;
  v_r := private.config_entero('precios.redondeo');
  select t.valor_base, t.id into v_tarifa, v_tarifa_id from public.tarifas t
  where t.formato_id = f_post and t.franja_id = fr1 and t.vigente_desde <= now()
    and (t.vigente_hasta is null or t.vigente_hasta > now());

  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo.f2.admin@amo.test'), (u_ap, 'humo.f2.pendiente@amo.test'),
               (u_av1, 'humo.f2.marketing@amo.test'), (u_av2, 'humo.f2.compras@amo.test'),
               (u_ao, 'humo.f2.otra@amo.test'), (u_ax, 'humo.f2.exterior@amo.test'),
               (u_ma, 'humo.f2.medio.a@amo.test'), (u_mb, 'humo.f2.medio.b@amo.test'),
               (u_mc, 'humo.f2.medio.c@amo.test'), (u_gc, 'humo.f2.campanas@amo.test'),
               (u_an, 'humo.f2.identidad@amo.test')) x (u, e);
  -- Rol interno propio que gestiona campañas sin `ofertas.ver`: la RLS le oculta las ofertas (prueba b01).
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa)
  values (rol_gc, 'HUMO_F2_CAMPANAS', 'Humo F2 campañas sin ofertas', 'ADMIN', true);
  insert into public.rol_permisos (rol_id, permiso_clave) values (rol_gc, 'campanas.ver'), (rol_gc, 'campanas.gestionar');
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2,
                                  municipio_codigo, identificacion_extranjera, ciudad_extranjera, estado_verificacion,
                                  verificado_at)
  values (an_p, 'Humo F2 Pendiente S.A.S.', 'Humo F2 Pendiente', '900777001',
          private.digito_verificacion_nit('900777001'), v_sector, 'CO', v_mun, null, null, 'PENDIENTE', null),
         (an_v, 'Humo F2 Verificada S.A.S.', 'Humo F2 Verificada', '900777002',
          private.digito_verificacion_nit('900777002'), v_sector, 'CO', v_mun, null, null, 'VERIFICADO', now()),
         (an_o, 'Humo F2 Otra S.A.S.', 'Humo F2 Otra', '900777003',
          private.digito_verificacion_nit('900777003'), v_sector, 'CO', v_mun, null, null, 'VERIFICADO', now()),
         (an_x, 'Humo F2 Abroad Inc.', 'Humo F2 Abroad', null, null, v_sector, 'US', null, 'EIN 12-3456789', 'Miami',
          'PENDIENTE', null),
         (an_n, 'Humo F2 Identidad S.A.S.', 'Humo F2 Identidad', '900777004',
          private.digito_verificacion_nit('900777004'), v_sector, 'CO', v_mun, null, null, 'PENDIENTE', null);
  insert into public.anunciantes_privado (anunciante_id, contacto_nombre, contacto_email)
  values (an_x, 'Contact Abroad', 'contact.abroad@amo.test'), (an_n, 'Contacto Identidad', 'contacto.identidad@amo.test');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Xilófono A', 'PAGINA_NOTICIAS', v_mun, 'VERIFICADO', 1, now()),
         (me_b, 'Medio Xilófono B', 'CREADOR', v_mun, 'VERIFICADO', 1, now()),
         (me_c, 'Medio Xilófono C', 'CREADOR', v_mun, 'VERIFICADO', 1, now()),
         (me_d, 'Medio Xilófono D', 'EMISORA', v_mun, 'VERIFICADO', 1, now());
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo_f2_a', 'https://instagram.com/humo_f2_a', 45000, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo_f2_b', 'https://instagram.com/humo_f2_b', 45000, true, 'MANUAL', now()),
         (cu_c, me_c, 'INSTAGRAM', 'humo_f2_c', 'https://instagram.com/humo_f2_c', 45000, true, 'MANUAL', now()),
         (cu_d, me_d, 'INSTAGRAM', 'humo_f2_d', 'https://instagram.com/humo_f2_d', 25000, true, 'MANUAL', now());
  -- Categoría propia: el estimador y la elegibilidad solo ven a estos cuatro medios.
  insert into public.categorias (id, nombre, descripcion) values (cat_h, 'Humo F2 Xilófono', 'Categoría de la suite');
  insert into public.medio_categorias (medio_id, categoria_id)
  values (me_a, cat_h), (me_b, cat_h), (me_c, cat_h), (me_d, cat_h);
  -- Estimador (S1 · R2): otra categoría, con historial suficiente para que cuenten su calidad y su alcance (1.000 a 6.000).
  insert into public.categorias (id, nombre, descripcion) values (cat_e, 'Humo F2 Ocarina', 'Categoría del estimador');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  select x.id, 'Medio Ocarina ' || x.n, 'CREADOR', v_mun, 'VERIFICADO', 1, now()
  from unnest(array[me_e1, me_e2, me_e3, me_e4, me_e5, me_e6]) with ordinality as x (id, n);
  insert into public.cuentas_sociales (medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion, publicaciones_verificadas_count,
                                       multiplicador_calidad, alcance_mediano)
  select x.id, 'INSTAGRAM', 'humo_f2_e' || x.n, 'https://instagram.com/humo_f2_e' || x.n, x.seguidores, true, 'MANUAL',
         now(), 10, x.calidad, 1000 * x.n
  from unnest(array[me_e1, me_e2, me_e3, me_e4, me_e5, me_e6], array[41000, 42000, 43000, 44000, 46000, 47000],
              array[0.8, 0.9, 1.0, 1.1, 1.2, 1.3]) with ordinality as x (id, seguidores, calidad, n);
  insert into public.medio_categorias (medio_id, categoria_id)
  select x.id, cat_e from unnest(array[me_e1, me_e2, me_e3, me_e4, me_e5, me_e6]) as x (id);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ADMIN'), estado = 'ACTIVO',
         debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = (select id from public.roles where clave = 'ANUNCIANTE'), estado = 'ACTIVO',
         debe_cambiar_password = false,
         anunciante_id = case id when u_ap then an_p when u_ao then an_o when u_ax then an_x when u_an then an_n
                         else an_v end
   where id in (u_ap, u_av1, u_av2, u_ao, u_ax, u_an);
  update public.perfiles set rol_id = (select id from public.roles where clave = 'MEDIO'), estado = 'ACTIVO',
         debe_cambiar_password = false, medio_id = case id when u_ma then me_a when u_mb then me_b else me_c end
   where id in (u_ma, u_mb, u_mc);
  update public.perfiles set rol_id = rol_gc, estado = 'ACTIVO', debe_cambiar_password = false where id = u_gc;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm, u_adm, now(), now(), 'aal2'), (s_ap, u_ap, now(), now(), 'aal1'), (s_av1, u_av1, now(), now(), 'aal1'),
    (s_av2, u_av2, now(), now(), 'aal1'), (s_ao, u_ao, now(), now(), 'aal1'), (s_ax, u_ax, now(), now(), 'aal1'),
    (s_ma, u_ma, now(), now(), 'aal1'), (s_mb, u_mb, now(), now(), 'aal1'), (s_mc, u_mc, now(), now(), 'aal1'),
    (s_gc, u_gc, now(), now(), 'aal2'), (s_an, u_an, now(), now(), 'aal1');
  perform set_config('amo.modo_carga', '', true);
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_ap := jsonb_build_object('sub', u_ap, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ap)::text;
  c_av1 := jsonb_build_object('sub', u_av1, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_av1)::text;
  c_av2 := jsonb_build_object('sub', u_av2, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_av2)::text;
  c_ao := jsonb_build_object('sub', u_ao, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ao)::text;
  c_ax := jsonb_build_object('sub', u_ax, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ax)::text;
  c_ma := jsonb_build_object('sub', u_ma, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ma)::text;
  c_mb := jsonb_build_object('sub', u_mb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mb)::text;
  c_mc := jsonb_build_object('sub', u_mc, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mc)::text;
  c_gc := jsonb_build_object('sub', u_gc, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_gc)::text;
  c_an := jsonb_build_object('sub', u_an, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_an)::text;

  -- ── (g) Privilegios de las funciones nuevas ──────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('g01_srv_solo_servidor',
    not has_function_privilege('authenticated', 'public.enviar_anunciante_a_verificacion_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.enviar_anunciante_a_verificacion_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.activar_creativo_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.activar_creativo_srv(uuid, uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.activar_creativo_srv(uuid, uuid, uuid)', 'execute'));
  r := r || jsonb_build_object('g02_consultas_para_sesion',
    has_function_privilege('authenticated', 'public.disponible_campana(uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.medios_para_exclusion(text, uuid[], integer)', 'execute')
    and has_function_privilege('authenticated',
          'public.estimar_oferta(uuid, character[], character[], uuid[], integer, jsonb, smallint, uuid[], smallint)', 'execute')
    and not has_function_privilege('anon', 'public.disponible_campana(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.medios_para_exclusion(text, uuid[], integer)', 'execute'));
  r := r || jsonb_build_object('g03_historial_solo_lectura',
    has_table_privilege('authenticated', 'public.oferta_historial', 'select')
    and not has_table_privilege('authenticated', 'public.oferta_historial', 'insert')
    and not has_table_privilege('authenticated', 'public.oferta_historial', 'update'));
  r := r || jsonb_build_object('g04_archivar_solo_servidor',
    not has_function_privilege('authenticated', 'public.archivar_oferta_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.archivar_oferta_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.archivar_campana_srv(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.archivar_campana_srv(uuid, uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.archivar_oferta_srv(uuid, uuid, uuid)', 'execute')
    and has_function_privilege('service_role', 'public.archivar_campana_srv(uuid, uuid, uuid)', 'execute'));

  -- ── (i) ANU-001 · ADM-003: empresa PENDIENTE, envío, rechazo, reenvío y verificación ─────────────────────────
  perform set_config('request.jwt.claims', c_ap, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.anunciantes set digito_verificacion = v_dv_malo where id = an_p;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i01_dv_incorrecto_rechazado',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d like '%no corresponde al NIT%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  update public.anunciantes set nit = '900777011', digito_verificacion = v_dv_nuevo where id = an_p;
  get diagnostics v_n = row_count;
  insert into public.campanas (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total)
  values (an_p, 'Campaña Humo F2 pendiente', 'Lanzamiento', 'Marca Humo', v_hoy, v_hoy + 30, 10000000)
  returning id into c_p;
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion)
  values (c_p, 'Oferta Humo F2 pendiente', f_post, 'INSTAGRAM', 2000000, now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days')
  returning id into o_p;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_p, fr1, 2);
  execute 'reset role';
  r := r || jsonb_build_object('i02_pendiente_corrige_identificacion',
    v_n = 1 and (select nit = '900777011' and digito_verificacion = v_dv_nuevo from public.anunciantes where id = an_p));

  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('campanas', c_p, 'ACTIVA', u_ap, s_ap);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i03_sin_verificar_no_activa_campana',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d like 'La empresa debe estar verificada%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('campanas', c_p, 'ACTIVA', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i04_tampoco_la_activa_un_admin',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d like 'La empresa debe estar verificada%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_p, 'EN_REVISION', u_ap, s_ap);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i05_pendiente_no_envia_ofertas',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'envio_oferta:envio' and v_d like '%verificada por AMO%'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.enviar_anunciante_a_verificacion_srv(an_p, u_ap, s_ap);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i06_enviar_sin_documentos_dice_que_falta',
    case when v_e = 'AMO_CONFIG_INVALIDA'
          and v_d = 'Antes de enviar carga: RUT, Cámara de Comercio y completa la persona de contacto (nombre y correo).'
         then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  -- La persona de contacto también la exige la BD (no solo la interfaz): con el nombre y sin el correo no se envía.
  insert into public.anunciantes_privado (anunciante_id, contacto_nombre) values (an_p, 'Contacto Humo F2');

  perform set_config('request.jwt.claims', c_ap, true);
  execute 'set local role authenticated';
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_p, 'RUT', 'anunciante/' || an_p || '/RUT/humo-f2-rut-1.pdf') returning id into d_rut;
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_p, 'CAMARA_COMERCIO', 'anunciante/' || an_p || '/CAMARA_COMERCIO/humo-f2-cc-1.pdf') returning id into d_cc;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.enviar_anunciante_a_verificacion_srv(an_p, u_ap, s_ap);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i18_con_documentos_y_sin_correo_de_contacto',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'Antes de enviar completa la persona de contacto (nombre y correo).'
         then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  update public.anunciantes_privado set contacto_email = 'contacto.f2@amo.test' where anunciante_id = an_p;
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.enviar_anunciante_a_verificacion_srv(an_p, u_ap, s_ap);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.enviar_anunciante_a_verificacion_srv(an_p, u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i08_otra_empresa_no_envia',
    case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  r := r || jsonb_build_object('i07_enviada_a_la_cola',
    (select estado_verificacion = 'PENDIENTE' and enviado_verificacion_at = now() from public.anunciantes where id = an_p)
    and exists (select 1 from public.notificaciones
                where tipo = 'cola.anunciante_verificacion' and usuario_id = u_adm and entidad_id = an_p::text));

  -- Revisión: RUT ilegible (documento y empresa rechazados con motivo visible para el anunciante).
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('documentos_anunciante', d_rut, 'RECHAZADO', u_adm, s_adm, 'RUT ilegible');
  perform public.transicionar_srv('documentos_anunciante', d_cc, 'APROBADO', u_adm, s_adm, null,
                                  jsonb_build_object('fecha_vencimiento', (v_hoy + 365)::text));
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('anunciantes', an_p, 'VERIFICADO', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i10_verificar_dice_que_falta',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'Faltan documentos aprobados y vigentes: RUT.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('anunciantes', an_p, 'RECHAZADO', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i11_rechazar_exige_motivo',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.transicionar_srv('anunciantes', an_p, 'RECHAZADO', u_adm, s_adm, v_motivo_rechazo);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('anunciantes', an_p, 'PENDIENTE', u_ap, s_ap);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('i13_reenvio_solo_por_su_accion',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'anunciantes:RECHAZADO→PENDIENTE' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  r := r || jsonb_build_object('i09_documento_rechazado_con_motivo',
    (select estado_validacion = 'RECHAZADO' and observaciones = 'RUT ilegible' and validado_por = u_adm
     from public.documentos_anunciante where id = d_rut)
    and exists (select 1 from public.notificaciones where tipo = 'documento.rechazado' and usuario_id = u_ap
                  and entidad_id = d_rut::text and mensaje like '%RUT ilegible%'));
  perform set_config('request.jwt.claims', c_ap, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.anunciantes
  where id = an_p and estado_verificacion = 'RECHAZADO' and motivo_estado = v_motivo_rechazo;
  select count(*) into v_m from public.notificaciones
  where tipo = 'anunciante.rechazado' and entidad_id = an_p::text and mensaje like '%' || v_motivo_rechazo || '%';
  execute 'reset role';
  r := r || jsonb_build_object('i12_rechazada_y_el_anunciante_ve_el_motivo', v_n = 1 and v_m = 1);

  -- Corrige y reenvía: vuelve a PENDIENTE; con RUT y Cámara aprobados queda verificada.
  perform set_config('request.jwt.claims', c_ap, true);
  execute 'set local role authenticated';
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_p, 'RUT', 'anunciante/' || an_p || '/RUT/humo-f2-rut-2.pdf') returning id into d_rut2;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.enviar_anunciante_a_verificacion_srv(an_p, u_ap, s_ap);
  r := r || jsonb_build_object('i14_reenviada_vuelve_a_pendiente',
    (select estado_verificacion = 'PENDIENTE' and motivo_estado is null and enviado_verificacion_at is not null
     from public.anunciantes where id = an_p));
  perform public.transicionar_srv('documentos_anunciante', d_rut2, 'APROBADO', u_adm, s_adm, null,
                                  jsonb_build_object('fecha_vencimiento', (v_hoy + 365)::text));
  perform public.transicionar_srv('anunciantes', an_p, 'VERIFICADO', u_adm, s_adm);
  execute 'reset role';
  r := r || jsonb_build_object('i15_rut_y_camara_aprobados_verifica',
    (select estado_verificacion = 'VERIFICADO' and verificado_por = u_adm and verificado_at = now()
     from public.anunciantes where id = an_p)
    and (select fecha_vencimiento = v_hoy + 365 from public.documentos_anunciante where id = d_rut2)
    and exists (select 1 from public.notificaciones where tipo = 'anunciante.verificado' and usuario_id = u_ap));
  perform set_config('request.jwt.claims', c_ap, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.anunciantes set razon_social = 'Otra razón social S.A.S.' where id = an_p;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('i16_verificada_bloquea_identificacion',
    case when v_e = 'AMO_NO_AUTORIZADO' and v_d like '%solo las corrige el equipo de AMO%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  -- ADM-003: verificada, activa su campaña y el envío ya no se detiene en la empresa (falta el creativo).
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('campanas', c_p, 'ACTIVA', u_ap, s_ap);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_p, 'EN_REVISION', u_ap, s_ap);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('i17_verificada_activa_y_envia',
    case when (select estado = 'ACTIVA' from public.campanas where id = c_p) and v_h = 'envio_oferta:creativo'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);

  -- ── (x) ADM-003 · empresa extranjera ─────────────────────────────────────────────────────────────────────────
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.anunciantes (id, razon_social, nombre_comercial, sector_id, pais_iso2, ciudad_extranjera)
    values (an_x2, 'Humo F2 Sin Identificación Inc.', 'Humo F2 Sin Id', v_sector, 'US', 'Miami');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('x01_extranjero_exige_identificacion',
    case when v_e like '%anunciantes_identificacion_ext_chk%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_ax, true);
  execute 'set local role authenticated';
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_x, 'CERT_BANCARIA', 'anunciante/' || an_x || '/CERT_BANCARIA/humo-f2-banco.pdf') returning id into d_cb;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.enviar_anunciante_a_verificacion_srv(an_x, u_ax, s_ax);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('x02_certificado_bancario_no_basta_para_enviar',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'Antes de enviar carga: un documento de existencia de la empresa.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.transicionar_srv('documentos_anunciante', d_cb, 'APROBADO', u_adm, s_adm);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('anunciantes', an_x, 'VERIFICADO', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('x03_certificado_bancario_no_verifica',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d like '%un documento de existencia de la empresa%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  -- Carga interna: el equipo AMO (anunciantes.editar) sube el documento por cuenta del anunciante.
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_x, 'OTRO', 'anunciante/' || an_x || '/OTRO/humo-f2-registro.pdf') returning id into d_otro;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.enviar_anunciante_a_verificacion_srv(an_x, u_ax, s_ax);
  perform public.transicionar_srv('documentos_anunciante', d_otro, 'APROBADO', u_adm, s_adm);
  perform public.transicionar_srv('anunciantes', an_x, 'VERIFICADO', u_adm, s_adm);
  execute 'reset role';
  r := r || jsonb_build_object('x04_carga_interna_y_verificacion_extranjera',
    (select subido_por = u_adm from public.documentos_anunciante where id = d_otro)
    and (select estado_verificacion = 'VERIFICADO' from public.anunciantes where id = an_x));

  -- ── (h) ADM-003 · S3: la identificación cambia después de aprobar los documentos ───────────────────────────────
  -- Empresa PENDIENTE: hace dos días corrigió su razón social, ayer AMO le aprobó el RUT y la Cámara y ya está en la
  -- cola; hoy cambia el NIT. Lo aprobado antes de ese cambio no respalda la identificación nueva.
  perform set_config('amo.reloj', (now() - interval '2 days')::text, true);
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  update public.anunciantes set razon_social = 'Humo F2 Identidad Colombia S.A.S.' where id = an_n;
  execute 'reset role';
  perform set_config('amo.reloj', '', true);
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  update public.anunciantes set nombre_comercial = 'Humo F2 Identidad Nueva' where id = an_n;   -- no es identificación
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_n, 'RUT', 'anunciante/' || an_n || '/RUT/humo-f2-n-rut-1.pdf') returning id into d_n_rut;
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_n, 'CAMARA_COMERCIO', 'anunciante/' || an_n || '/CAMARA_COMERCIO/humo-f2-n-cc-1.pdf') returning id into d_n_cc;
  execute 'reset role';
  r := r || jsonb_build_object('h01_razon_social_marca_el_cambio',
    (select identificacion_cambiada_at = now() - interval '2 days' and nombre_comercial = 'Humo F2 Identidad Nueva'
     from public.anunciantes where id = an_n)
    -- La sesión no puede borrar la marca: solo la fija el trigger.
    and not has_column_privilege('authenticated', 'public.anunciantes', 'identificacion_cambiada_at', 'update'));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.enviar_anunciante_a_verificacion_srv(an_n, u_an, s_an);
  perform public.transicionar_srv('documentos_anunciante', d_n_rut, 'APROBADO', u_adm, s_adm, null,
                                  jsonb_build_object('fecha_vencimiento', (v_hoy + 365)::text));
  perform public.transicionar_srv('documentos_anunciante', d_n_cc, 'APROBADO', u_adm, s_adm, null,
                                  jsonb_build_object('fecha_vencimiento', (v_hoy + 365)::text));
  execute 'reset role';
  -- Las aprobaciones fueron ayer (después de la razón social y antes del NIT).
  perform set_config('amo.modo_carga', 'on', true);
  update public.documentos_anunciante set validado_at = now() - interval '1 day' where id in (d_n_rut, d_n_cc);
  perform set_config('amo.modo_carga', '', true);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform private.validar_verificacion_anunciante(an_n);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('h02_aprobados_despues_del_cambio_cuentan',
    case when v_e = 'NO FALLÓ' then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  update public.anunciantes set nit = '900777024', digito_verificacion = v_dv_n where id = an_n;
  get diagnostics v_n = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('h03_nit_nuevo_marca_el_cambio',
    v_n = 1 and (select nit = '900777024' and identificacion_cambiada_at = now() and estado_verificacion = 'PENDIENTE'
                 from public.anunciantes where id = an_n));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('anunciantes', an_n, 'VERIFICADO', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('h04_verificar_pide_aprobarlos_de_nuevo',
    case when v_e = 'AMO_TRANSICION_INVALIDA'
              and v_d = 'Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio. La identificación de la empresa '
                        || 'cambió después de aprobar algunos: deben cargarse y aprobarse de nuevo.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.enviar_anunciante_a_verificacion_srv(an_n, u_an, s_an);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('h05_tampoco_cuentan_para_enviar',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'Antes de enviar carga: RUT, Cámara de Comercio.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  -- Carga los del NIT nuevo, los reenvía y AMO los aprueba: queda verificada.
  perform set_config('request.jwt.claims', c_an, true);
  execute 'set local role authenticated';
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_n, 'RUT', 'anunciante/' || an_n || '/RUT/humo-f2-n-rut-2.pdf') returning id into d_n_rut2;
  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path)
  values (an_n, 'CAMARA_COMERCIO', 'anunciante/' || an_n || '/CAMARA_COMERCIO/humo-f2-n-cc-2.pdf') returning id into d_n_cc2;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.enviar_anunciante_a_verificacion_srv(an_n, u_an, s_an);
    perform public.transicionar_srv('documentos_anunciante', d_n_rut2, 'APROBADO', u_adm, s_adm, null,
                                    jsonb_build_object('fecha_vencimiento', (v_hoy + 365)::text));
    perform public.transicionar_srv('documentos_anunciante', d_n_cc2, 'APROBADO', u_adm, s_adm, null,
                                    jsonb_build_object('fecha_vencimiento', (v_hoy + 365)::text));
    perform public.transicionar_srv('anunciantes', an_n, 'VERIFICADO', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('h06_aprobados_despues_del_nit_verifican',
    case when v_e = 'NO FALLÓ'
              and (select estado_verificacion = 'VERIFICADO' and verificado_por = u_adm from public.anunciantes where id = an_n)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);

  -- ── (e) ANU-002 · ANU-003: compañeros, otra empresa y activación ────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.campanas (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total)
  values (an_v, 'Campaña Humo F2', 'Lanzamiento de temporada', 'Marca Humo', v_hoy, v_hoy + 30, 20000000)
  returning id into c_v;
  select count(*) into v_n from public.miembros_organizacion() where id in (u_av1, u_av2);
  select count(*) into v_m from public.miembros_organizacion() where id = u_ao;
  r := r || jsonb_build_object('e03_equipo_de_la_empresa', v_n = 2 and v_m = 0);
  select count(*) into v_n from public.configuracion
  where clave in ('ofertas.anticipacion_minima_horas', 'ofertas.minimo_medios', 'ofertas.estimador_n_minimo',
                  'campanas.tope_porcentaje_por_medio', 'archivos.max_creativo_mb', 'archivos.tolerancia_aspecto',
                  'precios.recargo_exclusividad', 'metricas.cortes_requeridos', 'medios.umbral_seguidores');
  r := r || jsonb_build_object('e04_configuracion_publica_para_el_anunciante', v_n = 9);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_av2, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.campanas where id = c_v;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ao, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.campanas where id = c_v;
  execute 'reset role';
  r := r || jsonb_build_object('e01_companero_ve_la_campana', v_n = 1);
  r := r || jsonb_build_object('e02_otra_empresa_no_la_ve', v_m = 0);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('campanas', c_v, 'ACTIVA', u_av1, s_av1);
  execute 'reset role';
  r := r || jsonb_build_object('e05_verificada_activa_campana',
    (select estado = 'ACTIVA' and activada_at = now() and creada_por = u_av1 from public.campanas where id = c_v));

  -- ── (o) ANU-005 · ANU-006 · ANU-008 · ANU-009 · ADM-005: oferta, creativo, envío y moderación ───────────────
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio,
                                ventana_fin, fecha_limite_aceptacion, exclusividad_dias)
    values (c_v, 'Exclusividad cero', f_post, 'INSTAGRAM', 1000000, now() + interval '3 days', now() + interval '10 days',
            now() + interval '2 days', 0);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o01_exclusividad_cero_rechazada',
    case when v_e like '%ofertas_exclusividad_chk%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, categorias_objetivo, seguidores_minimos, medios_excluidos,
                              instrucciones, restricciones)
  values (c_v, 'Post Humo F2', f_post, 'INSTAGRAM', 5000000, now() + interval '3 days', now() + interval '10 days',
          now() + interval '2 days', array[cat_h], 20000, array[me_c], 'Publica en horario de la tarde.',
          'Sin comparaciones con la competencia.')
  returning id into o_env;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_env, fr1, 2);
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, cortes_requeridos, exclusividad_dias)
  values (c_v, 'Reel Humo F2', f_reel, 'INSTAGRAM', 3000000, now() + interval '3 days', now() + interval '10 days',
          now() + interval '2 days', '{H24,D7}', 15)
  returning id into o_reel;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_reel, fr1, 1);
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion)
  values (c_v, 'Post con poca anticipación', f_post, 'INSTAGRAM', 1000000, now() + interval '1 day',
          now() + interval '5 days', now() + interval '10 hours')
  returning id into o_ant;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_ant, fr1, 1);
  execute 'reset role';
  r := r || jsonb_build_object('o02_cortes_por_defecto_y_ajustados',
    (select cortes_requeridos = '{H24,H72,D7}'::public.corte_metrica[] and tope_porcentaje_por_medio = 0.15
            and anunciante_id = an_v and cupos_totales = 2 from public.ofertas where id = o_env)
    and (select cortes_requeridos = '{H24,D7}'::public.corte_metrica[] and exclusividad_dias = 15
         from public.ofertas where id = o_reel));

  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_ant, 'EN_REVISION', u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o03_anticipacion_con_las_horas',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'envio_oferta:cuando'
              and v_d = 'La fecha límite de aceptación debe quedar al menos 24 horas después del envío.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_env, 'EN_REVISION', u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o04_sin_creativo_senala_el_paso',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'envio_oferta:creativo' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';

  -- ANU-008: el archivo trae su huella, existe en Storage con el mismo tamaño y cumple el formato.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativos (oferta_id, tipo, copy_sugerido, hashtags, menciones, enlace_destino)
  values (o_env, 'IMAGEN', 'Llega la temporada Humo #publicidad', '{#publicidad,#humo}', '{@marcahumo}',
          'https://humo.test/temporada')
  returning id into cr1;
  insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_reel, 'VIDEO', 'Reel de temporada #publicidad')
  returning id into cr_reel;
  execute 'reset role';
  p_cr1 := 'oferta/' || o_env || '/' || cr1 || '/humo-f2-1.jpg';
  p_reel := 'oferta/' || o_reel || '/' || cr_reel || '/humo-f2-reel.mp4';
  insert into storage.objects (bucket_id, name, metadata) values
    ('creativos', p_cr1, jsonb_build_object('size', 12582912, 'mimetype', 'image/jpeg')),
    ('creativos', p_reel, jsonb_build_object('size', 4096000, 'mimetype', 'video/mp4'));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto)
    values (cr1, p_cr1, 'image/jpeg', 12582912, 1080, 1080);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o05_sin_sha256_rechazado',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'Falta la huella SHA-256 del archivo.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
    values (cr1, 'oferta/' || o_env || '/' || cr1 || '/no-subido.jpg', 'image/jpeg', 12582912, 1080, 1080, v_sha1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o06_sin_objeto_en_storage_rechazado',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d like 'El archivo no está en el almacenamiento%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
    values (cr1, p_cr1, 'image/jpeg', 12000000, 1080, 1080, v_sha1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o07_tamano_distinto_al_de_storage',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d like 'El archivo no está en el almacenamiento%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr1, p_cr1, 'image/jpeg', 12582912, 1080, 1080, v_sha1);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
    values (cr1, 'oferta/' || o_env || '/' || cr1 || '/segundo.jpg', 'image/jpeg', 2048, 1080, 1080, v_sha2);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o09_un_archivo_si_el_formato_no_dice_mas',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'Este formato admite hasta 1 archivos.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, duracion_segundos, sha256)
    values (cr_reel, p_reel, 'video/mp4', 4096000, 1920, 1080, 15, v_sha2);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o10_reel_horizontal_pide_9_16',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'La relación de aspecto debe ser 9:16.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, duracion_segundos, sha256)
    values (cr_reel, p_reel, 'video/mp4', 4096000, 1080, 1920, 120, v_sha2);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o11_reel_demasiado_largo',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'El video puede durar hasta 90 segundos.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, duracion_segundos, sha256)
  values (cr_reel, p_reel, 'video/mp4', 4096000, 1080, 1920, 15, v_sha2);
  execute 'reset role';
  r := r || jsonb_build_object('o08_archivo_valido_con_su_huella',
    (select count(*) = 1 and bool_and(sha256 = v_sha1 and tamano_bytes = 12582912)
     from public.creativo_archivos where creativo_id = cr1)
    and (select version = 1 and vigente and activado_at is not null and creado_por = u_av1
         from public.creativos where id = cr1)
    and (select count(*) = 1 from public.creativo_archivos where creativo_id = cr_reel and alto = 1920));

  -- ANU-009 · ADM-005: envío, devolución con comentario, reenvío e historial.
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_env, 'EN_REVISION', u_av1, s_av1);
  execute 'reset role';
  r := r || jsonb_build_object('o12_enviada_a_moderacion',
    (select estado = 'EN_REVISION' and enviada_at = now() from public.ofertas where id = o_env)
    and exists (select 1 from public.notificaciones where tipo = 'cola.oferta_revision' and usuario_id = u_adm
                  and entidad_id = o_env::text));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_env, 'IMAGEN', 'Cambio en revisión');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('o13_en_revision_no_se_versiona',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d like 'Retira la oferta de revisión%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_env, 'DEVUELTA', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('o14_devolver_exige_comentario',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.transicionar_srv('ofertas', o_env, 'DEVUELTA', u_adm, s_adm, v_comentario);
  execute 'reset role';
  r := r || jsonb_build_object('o15_devuelta_y_el_anunciante_recibe_el_comentario',
    (select estado = 'DEVUELTA' and comentario_moderacion = v_comentario and moderada_por = u_adm and devuelta_at = now()
     from public.ofertas where id = o_env)
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'oferta.devuelta' and entidad_id = o_env::text and usuario_id in (u_av1, u_av2)
           and mensaje like '%' || v_comentario || '%'));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  update public.ofertas set titulo = 'Post Humo F2 con etiqueta' where id = o_env;
  get diagnostics v_n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_env, 'EN_REVISION', u_av1, s_av1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_av2, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.oferta_historial h
  where h.oferta_id = o_env
    and ((h.desde = 'BORRADOR' and h.hacia = 'EN_REVISION' and h.actor_tipo = 'ANUNCIANTE' and h.actor_id = u_av1)
         or (h.desde = 'EN_REVISION' and h.hacia = 'DEVUELTA' and h.actor_tipo = 'ADMIN' and h.actor_id = u_adm
             and h.comentario = v_comentario)
         or (h.desde = 'DEVUELTA' and h.hacia = 'EN_REVISION' and h.actor_tipo = 'ANUNCIANTE' and h.actor_id = u_av1));
  execute 'reset role';
  r := r || jsonb_build_object('o16_reenviada_con_el_comentario_en_el_historial',
    v_n = 1 and v_m = 3 and (select estado = 'EN_REVISION' from public.ofertas where id = o_env)
    and (select count(*) = 3 from public.oferta_historial where oferta_id = o_env));
  perform set_config('request.jwt.claims', c_ao, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.oferta_historial where oferta_id = o_env;
  execute 'reset role';
  r := r || jsonb_build_object('o17_historial_ajeno_invisible', v_n = 0);

  -- ADM-005: con la fecha límite vencida no se publica; a tiempo, se publica y avisa a los medios elegibles.
  perform set_config('amo.reloj', (now() + interval '2 days 1 hour')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_env, 'PUBLICADA', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('o18_fecha_limite_vencida_no_se_publica',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'envio_oferta:cuando' and v_d like 'La fecha límite de aceptación ya pasó%'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_env, 'PUBLICADA', u_adm, s_adm);
  execute 'reset role';
  r := r || jsonb_build_object('o19_publicada_avisa_a_los_elegibles',
    (select estado = 'PUBLICADA' and publicada_at = now() and moderada_por = u_adm from public.ofertas where id = o_env)
    and (select count(distinct usuario_id) = 2 from public.notificaciones
         where tipo = 'oferta.nueva_elegible' and entidad_id = o_env::text and usuario_id in (u_ma, u_mb))
    and not exists (select 1 from public.notificaciones
                    where tipo = 'oferta.nueva_elegible' and entidad_id = o_env::text and usuario_id = u_mc)
    and exists (select 1 from public.notificaciones where tipo = 'oferta.publicada' and entidad_id = o_env::text
                  and usuario_id = u_av1));
  -- ANU-005: mínimo efectivo = máx(umbral 30.000, 20.000 pedidos) y el medio excluido deja de ser elegible.
  r := r || jsonb_build_object('o20_minimo_efectivo_y_exclusion',
    private.medio_elegible(o_env, me_a) and private.medio_elegible(o_env, me_b)
    and not private.medio_elegible(o_env, me_c) and not private.medio_elegible(o_env, me_d));

  -- ── (s) ANU-005 · ANU-006 · ANU-007: estimador y buscador de exclusiones ─────────────────────────────────────
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select * into v_rec from public.estimar_oferta(f_post, '{}', '{}', array[cat_h], 20000, jsonb_build_object(fr1::text, 2));
  r := r || jsonb_build_object('s01_estimador_por_franja',
    case when v_rec.franja_id = fr1 and v_rec.medios_elegibles = 3 and v_rec.precio_mediano = v_tarifa
              and v_rec.inversion_estimada = 2 * v_tarifa and v_rec.alcance_mediano_estimado is null
         then 'true'::jsonb else to_jsonb(v_rec) end);
  select medios_elegibles into v_n
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_h], null, jsonb_build_object(fr1::text, 2));
  select medios_elegibles into v_m
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_h], 50000, jsonb_build_object(fr1::text, 2));
  -- Con 50.000 no queda ninguno: por debajo del mínimo de anonimato no se dice cuántos hay.
  r := r || jsonb_build_object('s02_minimo_efectivo_30000', v_n = 3 and v_m is null);
  select * into v_rec from public.estimar_oferta(f_post, '{}', '{}', array[cat_h], 20000, jsonb_build_object(fr1::text, 2),
                                                 p_medios_excluidos => array[me_a]);
  -- Excluir a menos medios que el mínimo de anonimato no cambia la estimación (comparar con y sin excluir a uno
  -- revelaría sus cifras): se estima sin la exclusión.
  r := r || jsonb_build_object('s03_excluir_pocos_no_revela_al_medio',
    case when v_rec.medios_elegibles = 3 and v_rec.precio_mediano = v_tarifa and v_rec.inversion_estimada = 2 * v_tarifa
         then 'true'::jsonb else to_jsonb(v_rec) end);
  select * into v_rec from public.estimar_oferta(f_post, '{}', '{}', array[cat_h], 20000, jsonb_build_object(fr1::text, 1),
                                                 p_exclusividad_dias => 15::smallint);
  r := r || jsonb_build_object('s04_exclusividad_con_recargo',
    case when v_rec.precio_mediano = round(v_tarifa * 1.25 / v_r) * v_r then 'true'::jsonb else to_jsonb(v_rec) end);
  -- Sin tilde ni mayúsculas encuentra «Xilófono»; con menos de 3 caracteres no busca. Solo nombre y municipio.
  select count(*) into v_n from public.medios_para_exclusion('xilofono') where id in (me_a, me_b, me_c, me_d);
  select count(*) into v_k from public.medios_para_exclusion('xi');
  r := r || jsonb_build_object('s05_buscador_por_nombre_publico',
    v_n = 4 and v_k = 0
    and pg_get_function_result('public.medios_para_exclusion(text, uuid[], integer)'::regprocedure)
        = 'TABLE(id uuid, nombre text, municipio text)');
  select string_agg(nombre, ',') into v_t from public.medios_para_exclusion(p_ids => array[me_c]);
  r := r || jsonb_build_object('s06_excluidos_por_id', coalesce(v_t, '') = 'Medio Xilófono C');
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform * from public.medios_para_exclusion('Xilofono');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('s07_medio_no_busca_medios',
    case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);

  -- S1 · R2: con los seis medios de «Ocarina» (n mínimo de 3) el estimador nunca deja conocer a uno. v_j0 es la
  -- referencia sin exclusiones ni mínimo de seguidores: 6 medios, alcance mediano 3.500.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select to_jsonb(e) into v_j0
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], null, jsonb_build_object(fr1::text, 2)) e;
  -- Con 45.000 o más solo quedan 2 (menos que el mínimo): ni cuántos son ni cifras.
  select to_jsonb(e) into v_j1
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], 45000, jsonb_build_object(fr1::text, 2)) e;
  execute 'reset role';
  -- El mínimo se lee de la configuración: con 7, los mismos 6 medios tampoco se muestran.
  update public.configuracion set valor = '7' where clave = 'ofertas.estimador_n_minimo';
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select to_jsonb(e) into v_j2
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], null, jsonb_build_object(fr1::text, 2)) e;
  execute 'reset role';
  update public.configuracion set valor = '3' where clave = 'ofertas.estimador_n_minimo';
  r := r || jsonb_build_object('s08_menos_medios_que_el_minimo_sin_cifras',
    case when (v_j0 ->> 'medios_elegibles')::integer = 6 and (v_j0 ->> 'alcance_mediano_estimado')::bigint = 3500
              and (v_j0 ->> 'inversion_estimada')::numeric = 2 * (v_j0 ->> 'precio_mediano')::numeric
              and (select count(*) = 6 from public.cuentas_sociales
                   where medio_id in (me_e1, me_e2, me_e3, me_e4, me_e5, me_e6) and franja_id = fr1)
              and v_j1 = jsonb_build_object('franja_id', fr1, 'medios_elegibles', null, 'precio_mediano', null,
                                            'inversion_estimada', null, 'alcance_mediano_estimado', null)
              and v_j2 = v_j1
         then 'true'::jsonb else jsonb_build_object('referencia', v_j0, 'con_45000', v_j1, 'n_minimo_7', v_j2) end);
  -- Excluir a 1 o a 2 (menos que el mínimo) no cambia ninguna cifra: aplicadas, la mediana y el alcance se moverían.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select to_jsonb(e) into v_j1
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], null, jsonb_build_object(fr1::text, 2),
                             p_medios_excluidos => array[me_e1]) e;
  select to_jsonb(e) into v_j2
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], null, jsonb_build_object(fr1::text, 2),
                             p_medios_excluidos => array[me_e5, me_e6]) e;
  execute 'reset role';
  r := r || jsonb_build_object('s09_excluir_menos_del_minimo_no_cambia_nada',
    case when v_j1 = v_j0 and v_j2 = v_j0 then 'true'::jsonb
         else jsonb_build_object('referencia', v_j0, 'sin_e1', v_j1, 'sin_e5_e6', v_j2) end);
  -- Excluir a 3 (el mínimo) sí se aplica: quedan e4…e6 (1,1× a 1,3×); excluir a 4 deja 2 y ya no hay estimación.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select to_jsonb(e) into v_j1
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], null, jsonb_build_object(fr1::text, 2),
                             p_medios_excluidos => array[me_e1, me_e2, me_e3]) e;
  select to_jsonb(e) into v_j2
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], null, jsonb_build_object(fr1::text, 2),
                             p_medios_excluidos => array[me_e1, me_e2, me_e3, me_e4]) e;
  execute 'reset role';
  r := r || jsonb_build_object('s10_excluir_el_minimo_o_mas_se_aplica',
    case when (v_j1 ->> 'medios_elegibles')::integer = 3
              and (v_j1 ->> 'precio_mediano')::numeric = round(v_tarifa * 1.2 / v_r) * v_r
              and (v_j1 ->> 'inversion_estimada')::numeric = 2 * round(v_tarifa * 1.2 / v_r) * v_r
              and (v_j1 ->> 'alcance_mediano_estimado')::bigint = 5000
              and v_j2 ->> 'medios_elegibles' is null and v_j2 ->> 'precio_mediano' is null
              and v_j2 ->> 'alcance_mediano_estimado' is null
         then 'true'::jsonb else jsonb_build_object('referencia', v_j0, 'sin_3', v_j1, 'sin_4', v_j2) end);
  -- El mínimo de seguidores se estima por múltiplos de 5.000: 40.001 y 44.999 cuentan desde 40.000 (sin redondear, con
  -- 44.999 solo quedarían 2 y no habría estimación).
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select to_jsonb(e) into v_j1
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], 40001, jsonb_build_object(fr1::text, 2)) e;
  select to_jsonb(e) into v_j2
  from public.estimar_oferta(f_post, '{}', '{}', array[cat_e], 44999, jsonb_build_object(fr1::text, 2)) e;
  execute 'reset role';
  r := r || jsonb_build_object('s11_seguidores_por_multiplos_de_5000',
    case when v_j1 = v_j2 and v_j1 = v_j0 then 'true'::jsonb
         else jsonb_build_object('referencia', v_j0, 'con_40001', v_j1, 'con_44999', v_j2) end);

  -- ── (p) ANU-003 · ANU-007 · ADM-005: aceptación, presupuesto, fechas, disponible y rechazo ───────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  select asignacion_id into a_a from public.reservar_cupo_srv(o_env, me_a, cu_a, u_ma, s_ma, null);
  perform public.registrar_descarga_srv(a_a, u_ma, s_ma);
  execute 'reset role';
  v_comprometido := (select presupuesto_comprometido from public.campanas where id = c_v);
  r := r || jsonb_build_object('p01_aceptada_compromete_presupuesto',
    a_a is not null and v_comprometido = v_tarifa
    and (select estado = 'CONTENIDO_ENTREGADO' and creativo_descargado_id = cr1 from public.asignaciones where id = a_a));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.campanas set presupuesto_total = v_comprometido - 1 where id = c_v;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('p02_presupuesto_bajo_lo_comprometido',
    case when v_e = 'AMO_PRESUPUESTO_CAMPANA' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.campanas set fecha_fin = v_hoy + 5 where id = c_v;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('p03_fechas_no_dejan_fuera_una_publicada',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d like '%quedaría fuera de las nuevas fechas%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  update public.campanas set fecha_fin = v_hoy + 20 where id = c_v;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('p04_fechas_que_cubren_la_oferta', v_n = 1);
  -- ANU-007: lo disponible descuenta lo que reservan las ofertas en revisión o publicadas (no los borradores).
  select public.disponible_campana(c_v) = 15000000 and public.disponible_campana(c_v, o_env) = 20000000 into v_ok;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_ao, true);
  execute 'set local role authenticated';
  select public.disponible_campana(c_v) is null into v_ok2;
  execute 'reset role';
  r := r || jsonb_build_object('p05_disponible_de_la_campana', coalesce(v_ok and v_ok2, false));

  -- ANU-007: presupuesto mayor que lo disponible; ANU-009: retirar de revisión; ADM-005: modo asistido y rechazo.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion)
  values (c_v, 'Post Humo F2 ambicioso', f_post, 'INSTAGRAM', 16000000, now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days')
  returning id into o_presu;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_presu, fr1, 1);
  insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_presu, 'IMAGEN', 'Copy ambicioso #publicidad')
  returning id into cr_presu;
  execute 'reset role';
  p_presu := 'oferta/' || o_presu || '/' || cr_presu || '/humo-f2-presu.png';
  insert into storage.objects (bucket_id, name, metadata)
  values ('creativos', p_presu, jsonb_build_object('size', 3072, 'mimetype', 'image/png'));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr_presu, p_presu, 'image/png', 3072, 1080, 1350, v_sha2);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_presu, 'EN_REVISION', u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('p06_presupuesto_mayor_que_el_disponible',
    case when v_e = 'AMO_PRESUPUESTO_CAMPANA' and v_h = 'envio_oferta:cuanto' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  update public.ofertas set presupuesto_maximo = 1000000 where id = o_presu;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_presu, 'EN_REVISION', u_av1, s_av1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select public.disponible_campana(c_v) = 14000000 into v_ok;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_presu, 'BORRADOR', u_av1, s_av1);
  execute 'reset role';
  r := r || jsonb_build_object('p07_ajusta_envia_y_retira',
    v_ok and (select estado = 'BORRADOR' from public.ofertas where id = o_presu)
    and exists (select 1 from public.oferta_historial where oferta_id = o_presu and desde = 'EN_REVISION'
                  and hacia = 'BORRADOR' and actor_tipo = 'ANUNCIANTE'));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_presu, 'EN_REVISION', u_adm, s_adm);         -- modo asistido
  -- Una devolución previa deja su comentario en la oferta; el rechazo posterior lo reemplaza por su motivo (p10).
  perform public.transicionar_srv('ofertas', o_presu, 'DEVUELTA', u_adm, s_adm, v_comentario);
  perform public.transicionar_srv('ofertas', o_presu, 'EN_REVISION', u_adm, s_adm);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_presu, 'CANCELADA', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('p08_rechazar_exige_motivo',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.transicionar_srv('ofertas', o_presu, 'CANCELADA', u_adm, s_adm, 'El enlace de destino no es seguro');
  execute 'reset role';
  r := r || jsonb_build_object('p09_rechazada_con_aviso_y_motivo',
    (select estado = 'CANCELADA' and cancelada_at = now() and moderada_por = u_adm from public.ofertas where id = o_presu)
    and exists (select 1 from public.oferta_historial where oferta_id = o_presu and desde = 'BORRADOR'
                  and hacia = 'EN_REVISION' and actor_tipo = 'ADMIN' and actor_id = u_adm)
    and exists (select 1 from public.notificaciones where tipo = 'oferta.rechazada' and entidad_id = o_presu::text
                  and usuario_id = u_av1 and mensaje like '%El enlace de destino no es seguro%'));
  r := r || jsonb_build_object('p10_rechazo_sin_datos_deja_su_motivo',
    (select comentario_moderacion = 'El enlace de destino no es seguro' from public.ofertas where id = o_presu)
    and not exists (select 1 from public.notificaciones where tipo = 'oferta.rechazada' and entidad_id = o_presu::text
                      and mensaje like '%' || v_comentario || '%'));

  -- ── (v) ANU-010: versión nueva pendiente, activación y aviso a los medios ────────────────────────────────────
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativos (oferta_id, tipo, copy_sugerido, hashtags) values (o_env, 'IMAGEN', 'Versión 2 #publicidad',
                                                                              '{#publicidad}')
  returning id into cr2;
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_env, 'IMAGEN', 'Otra pendiente');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('v02_una_pendiente_por_oferta',
    case when v_e like '%creativos_pendiente_key%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  update public.creativos set copy_sugerido = 'Cambio a la que ven los medios' where id = cr1;
  get diagnostics v_n = row_count;
  update public.creativos set copy_sugerido = 'Versión 2 corregida #publicidad' where id = cr2;
  get diagnostics v_m = row_count;
  r := r || jsonb_build_object('v03_solo_se_edita_la_pendiente', v_n = 0 and v_m = 1);
  execute 'reset role';
  r := r || jsonb_build_object('v01_version_nueva_pendiente',
    (select version = 2 and not vigente and activado_at is null and reemplaza_a = cr1 from public.creativos where id = cr2)
    and (select vigente from public.creativos where id = cr1));
  p_cr2 := 'oferta/' || o_env || '/' || cr2 || '/humo-f2-2.webp';
  insert into storage.objects (bucket_id, name, metadata)
  values ('creativos', p_cr2, jsonb_build_object('size', 5120, 'mimetype', 'image/webp'));
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.activar_creativo_srv(cr2, u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('v04_activar_sin_archivos',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'Carga al menos un archivo en la versión nueva.' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr2, p_cr2, 'image/webp', 5120, 1080, 1350, v_sha1);
  execute 'reset role';
  -- El medio con la asignación ve la versión activa, no la que el anunciante prepara (tampoco su archivo).
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select count(*) filter (where id = cr1), count(*) filter (where id = cr2) into v_n, v_m
  from public.creativos where oferta_id = o_env;
  select count(*) filter (where name = p_cr1) = 1 and count(*) filter (where name = p_cr2) = 0 into v_ok
  from storage.objects where bucket_id = 'creativos' and name in (p_cr1, p_cr2);
  execute 'reset role';
  r := r || jsonb_build_object('v05_medio_no_ve_la_pendiente', v_n = 1 and v_m = 0 and v_ok);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.activar_creativo_srv(cr2, u_ao, s_ao);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('v06_otra_empresa_no_activa',
    case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.activar_creativo_srv(cr2, u_av1, s_av1);
  execute 'reset role';
  r := r || jsonb_build_object('v07_activada_reemplaza_y_avisa',
    (select vigente and activado_at = now() from public.creativos where id = cr2)
    and (select not vigente and activado_at is not null from public.creativos where id = cr1)
    and exists (select 1 from public.notificaciones where tipo = 'creativo.actualizado' and usuario_id = u_ma
                  and entidad_id = o_env::text and mensaje like '%versión 2%')
    and not exists (select 1 from public.notificaciones where tipo = 'creativo.actualizado' and usuario_id = u_mb
                      and entidad_id = o_env::text));
  perform set_config('request.jwt.claims', c_ma, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.creativos where id = cr2;
  select count(*) into v_m from storage.objects where bucket_id = 'creativos' and name = p_cr2;
  execute 'reset role';
  r := r || jsonb_build_object('v08_medio_ve_la_version_activada', v_n = 1 and v_m = 1);

  -- ── (k) ANU-014 · ADM-003: cancelar con obligaciones, suspensión y reactivación ─────────────────────────────
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_env, 'CANCELADA', u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('k01_cancelar_publicada_exige_motivo',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_env, 'CANCELADA', u_av1, s_av1, 'Cambio de estrategia');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('k02_publicada_con_asignacion_no_se_cancela',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'La oferta ya tiene asignaciones: no se puede cancelar.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('campanas', c_v, 'CANCELADA', u_av1, s_av1, 'Cambio de estrategia');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('k03_campana_con_asignacion_no_se_cancela',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d like 'La campaña tiene asignaciones en curso%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  -- ADM-003: suspendida, su oferta publicada se queda sin elegibles; lo aceptado sigue su curso.
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ofertas_para_medio(o_env);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('anunciantes', an_v, 'SUSPENDIDO', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('k04_suspender_exige_motivo',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.transicionar_srv('anunciantes', an_v, 'SUSPENDIDO', u_adm, s_adm, 'Documentos en revisión por fraude');
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform * from public.reservar_cupo_srv(o_env, me_b, cu_b, u_mb, s_mb, null);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_mb, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.ofertas_para_medio(o_env);
  execute 'reset role';
  r := r || jsonb_build_object('k05_suspendida_sin_elegibles',
    case when v_n = 1 and v_m = 0 and v_e = 'AMO_NO_ELEGIBLE' and not private.medio_elegible(o_env, me_b)
              and (select estado = 'CONTENIDO_ENTREGADO' from public.asignaciones where id = a_a)
              and exists (select 1 from public.notificaciones where tipo = 'anunciante.suspendido' and usuario_id = u_av1
                            and mensaje like '%Documentos en revisión por fraude%')
         then 'true'::jsonb
         else jsonb_build_object('antes', v_n, 'despues', v_m, 'error', v_e, 'detail', v_d) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('anunciantes', an_v, 'VERIFICADO', u_adm, s_adm, 'Revisión concluida sin hallazgos');
  execute 'reset role';
  r := r || jsonb_build_object('k06_reactivada_vuelve_a_ser_elegible',
    (select estado_verificacion = 'VERIFICADO' from public.anunciantes where id = an_v)
    and private.medio_elegible(o_env, me_b));

  -- ── (c) ANU-014: cancelación con motivo y cascada de la campaña (también EN_EJECUCION) ───────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_cas, an_v, 'Campaña Humo F2 cascada', 'Marca Humo', v_hoy - 5, v_hoy + 30, 20000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, enviada_at, publicada_at, en_ejecucion_at)
  select x.id, c_cas, an_v, x.titulo, f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}',
         now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', x.estado::public.oferta_estado,
         case when x.estado <> 'BORRADOR' then now() - interval '1 day' end,
         case when x.estado in ('PUBLICADA', 'EN_EJECUCION') then now() - interval '1 day' end,
         case when x.estado = 'EN_EJECUCION' then now() - interval '1 hour' end
  from (values (o_kb, 'Cascada borrador', 'BORRADOR'), (o_kr, 'Cascada en revisión', 'EN_REVISION'),
               (o_kd, 'Cascada devuelta', 'DEVUELTA'), (o_kp, 'Cascada publicada', 'PUBLICADA'),
               (o_ke, 'Cascada en ejecución', 'EN_EJECUCION'), (o_kc, 'Publicada sin aceptaciones', 'PUBLICADA'))
       as x (id, titulo, estado);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales)
  select x.id, fr1, 2 from unnest(array[o_kb, o_kr, o_kd, o_kp, o_ke, o_kc]) as x (id);
  update public.ofertas set cupos_totales = 2 where campana_id = c_cas;
  perform set_config('amo.modo_carga', '', true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_kc, 'CANCELADA', u_av1, s_av1, 'Cambio de estrategia');
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('campanas', c_cas, 'CANCELADA', u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('c02_cancelar_campana_exige_motivo',
    case when v_e = 'AMO_MOTIVO_REQUERIDO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.transicionar_srv('campanas', c_cas, 'CANCELADA', u_av1, s_av1, v_motivo_cascada);
  execute 'reset role';
  r := r || jsonb_build_object('c01_publicada_sin_asignaciones_se_cancela',
    (select estado = 'CANCELADA' and cancelada_at = now() from public.ofertas where id = o_kc)
    and exists (select 1 from public.oferta_historial where oferta_id = o_kc and desde = 'PUBLICADA'
                  and hacia = 'CANCELADA' and actor_tipo = 'ANUNCIANTE' and actor_id = u_av1
                  and comentario = 'Cambio de estrategia'));
  select count(*) into v_n from public.ofertas
  where id in (o_kb, o_kr, o_kd, o_kp, o_ke) and estado = 'CANCELADA' and cancelada_at = now();
  select count(*) into v_m from public.oferta_historial
  where oferta_id in (o_kb, o_kr, o_kd, o_kp, o_ke) and hacia = 'CANCELADA' and actor_tipo = 'SISTEMA' and actor_id is null
    and comentario = v_motivo_cascada;
  r := r || jsonb_build_object('c03_cascada_cancela_todas_tambien_en_ejecucion',
    v_n = 5 and v_m = 5 and (select estado = 'CANCELADA' and cancelada_at = now() from public.campanas where id = c_cas));
  r := r || jsonb_build_object('c04_cascada_sin_aviso_de_rechazo_ni_caducidad',
    not exists (select 1 from public.notificaciones
                where entidad_id in (o_kb::text, o_kr::text, o_kd::text, o_kp::text, o_ke::text)
                  and tipo in ('oferta.rechazada', 'oferta.caducada')));

  -- ── (r) ADM-005 · cron: revisión vencida y borradores caducados ─────────────────────────────────────────────
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_cron, an_v, 'Campaña Humo F2 cron', 'Marca Humo', v_hoy - 1, v_hoy + 40, 20000000, 'ACTIVA', now());
  -- o_r1 se reenvió tras una devolución: conserva aquel comentario hasta la próxima moderación (r04).
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, enviada_at, comentario_moderacion)
  values (o_r1, c_cron, an_v, 'Cron en revisión', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}',
          now() + interval '2 days', now() + interval '10 days', now() + interval '1 day', 'EN_REVISION', now(),
          v_comentario),
         (o_r2, c_cron, an_v, 'Cron borrador vencido', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}',
          now() + interval '1 day', now() + interval '3 days', now() + interval '12 hours', 'BORRADOR', null, null),
         (o_r3, c_cron, an_v, 'Cron borrador vigente', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}',
          now() + interval '10 days', now() + interval '20 days', now() + interval '9 days', 'BORRADOR', null, null);
  perform set_config('amo.modo_carga', '', true);
  perform set_config('amo.reloj', (now() + interval '5 days')::text, true);
  for i in 1..10 loop
    exit when private.actualizar_lote('ofertas_revision_vencida', 50) = 0;
  end loop;
  for i in 1..10 loop
    exit when private.actualizar_lote('ofertas_caducadas', 50) = 0;
  end loop;
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('r01_revision_vencida_vuelve_al_anunciante',
    (select estado = 'DEVUELTA' and devuelta_at = now() + interval '5 days' from public.ofertas where id = o_r1)
    and exists (select 1 from public.oferta_historial where oferta_id = o_r1 and desde = 'EN_REVISION' and hacia = 'DEVUELTA'
                  and actor_tipo = 'SISTEMA' and actor_id is null and comentario like 'La fecha límite de aceptación pasó%')
    and exists (select 1 from public.notificaciones where tipo = 'oferta.devuelta' and entidad_id = o_r1::text
                  and usuario_id = u_av1 and mensaje like '%La fecha límite de aceptación pasó%'));
  r := r || jsonb_build_object('r02_borrador_caducado_se_cancela_y_avisa',
    (select estado = 'CANCELADA' from public.ofertas where id = o_r2)
    and exists (select 1 from public.oferta_historial where oferta_id = o_r2 and hacia = 'CANCELADA'
                  and actor_tipo = 'SISTEMA' and comentario like 'La ventana de publicación terminó%')
    and exists (select 1 from public.notificaciones where tipo = 'oferta.caducada' and entidad_id = o_r2::text
                  and usuario_id = u_av1));
  r := r || jsonb_build_object('r03_borrador_vigente_intacto',
    (select estado = 'BORRADOR' from public.ofertas where id = o_r3)
    and not exists (select 1 from public.oferta_historial where oferta_id = o_r3));
  r := r || jsonb_build_object('r04_devolucion_del_cron_deja_su_motivo',
    (select comentario_moderacion like 'La fecha límite de aceptación pasó%' from public.ofertas where id = o_r1)
    and not exists (select 1 from public.notificaciones where tipo = 'oferta.devuelta' and entidad_id = o_r1::text
                      and mensaje like '%' || v_comentario || '%'));

  -- ── (t) ANU-008: tipo de creativo coherente con el formato ──────────────────────────────────────────────────
  -- Carrusel solo en el formato carrusel (y viceversa); en un formato solo de video (REEL) el creativo es un video.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_reel, 'IMAGEN', 'Imagen en un reel');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('t01_imagen_en_un_reel',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'El tipo de creativo no corresponde al formato elegido.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_r3, 'CARRUSEL', 'Carrusel en un post');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('t02_carrusel_en_un_post',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'El tipo de creativo no corresponde al formato elegido.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion)
  values (c_v, 'Carrusel Humo F2', f_car, 'INSTAGRAM', 2000000, now() + interval '3 days', now() + interval '10 days',
          now() + interval '2 days')
  returning id into o_car;
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_car, 'IMAGEN', 'Imagen suelta en un carrusel');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('t03_imagen_en_un_carrusel',
    case when v_e = 'AMO_CONFIG_INVALIDA' and v_d = 'El tipo de creativo no corresponde al formato elegido.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  insert into public.creativos (oferta_id, tipo, copy_sugerido)
  values (o_car, 'CARRUSEL', 'Carrusel de temporada #publicidad') returning id into cr_car;
  execute 'reset role';
  r := r || jsonb_build_object('t04_carrusel_en_su_formato',
    (select tipo = 'CARRUSEL' and vigente and version = 1 from public.creativos where id = cr_car));

  -- ── (f) ANU-008: archivos del creativo — ruta única y orden por UPDATE ──────────────────────────────────────
  p_car1 := 'oferta/' || o_car || '/' || cr_car || '/humo-f2-car-1.jpg';
  p_car2 := 'oferta/' || o_car || '/' || cr_car || '/humo-f2-car-2.jpg';
  insert into storage.objects (bucket_id, name, metadata) values
    ('creativos', p_car1, jsonb_build_object('size', 2048, 'mimetype', 'image/jpeg')),
    ('creativos', p_car2, jsonb_build_object('size', 2048, 'mimetype', 'image/jpeg'));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256, orden)
  values (cr_car, p_car1, 'image/jpeg', 2048, 1080, 1080, v_sha1, 0) returning id into ca1;
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256, orden)
  values (cr_car, p_car2, 'image/jpeg', 2048, 1080, 1350, v_sha2, 1);
  -- La confirmación repetida de una carga (mismo objeto de Storage) no duplica la fila.
  v_e := 'NO FALLÓ'; v_d := null; v_h := null; v_s := null;
  begin
    insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256, orden)
    values (cr_car, p_car1, 'image/jpeg', 2048, 1080, 1080, v_sha1, 2);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint,
                            v_s = returned_sqlstate;
  end;
  r := r || jsonb_build_object('f01_ruta_repetida_rechazada',
    case when v_s = '23505' and v_e like '%creativo_archivos_archivo_path_key%' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'sqlstate', v_s) end);
  update public.creativo_archivos set orden = 5 where id = ca1;
  get diagnostics v_n = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('f02_orden_en_borrador',
    v_n = 1 and (select orden = 5 from public.creativo_archivos where id = ca1)
    and (select count(*) = 2 from public.creativo_archivos where creativo_id = cr_car));
  -- Oferta publicada (o_env): la versión pendiente se reordena; la vigente, que ya ven los medios, no.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_env, 'IMAGEN', 'Versión 3 #publicidad')
  returning id into cr3;
  execute 'reset role';
  p_cr3 := 'oferta/' || o_env || '/' || cr3 || '/humo-f2-3.jpg';
  insert into storage.objects (bucket_id, name, metadata)
  values ('creativos', p_cr3, jsonb_build_object('size', 4096, 'mimetype', 'image/jpeg'));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr3, p_cr3, 'image/jpeg', 4096, 1080, 1080, v_sha2) returning id into ca_pend;
  update public.creativo_archivos set orden = 1 where id = ca_pend;
  get diagnostics v_n = row_count;
  update public.creativo_archivos set orden = 1 where creativo_id = cr2;
  get diagnostics v_m = row_count;
  v_e := 'NO FALLÓ'; v_d := null; v_h := null; v_s := null;
  begin
    update public.creativo_archivos set archivo_path = p_cr3 || '.bak' where id = ca_pend;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint,
                            v_s = returned_sqlstate;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('f03_orden_en_la_pendiente_de_una_publicada',
    v_n = 1 and (select orden = 1 from public.creativo_archivos where id = ca_pend));
  r := r || jsonb_build_object('f04_vigente_de_una_publicada_sin_cambios',
    v_m = 0 and (select bool_and(orden = 0) from public.creativo_archivos where creativo_id = cr2));
  r := r || jsonb_build_object('f05_solo_se_cambia_el_orden',
    case when v_s = '42501' and (select archivo_path = p_cr3 from public.creativo_archivos where id = ca_pend)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'sqlstate', v_s) end);

  -- ── (d) ANU-010: descartar la versión pendiente (nunca una activada) ───────────────────────────────────────
  perform set_config('request.jwt.claims', c_ao, true);
  execute 'set local role authenticated';
  delete from public.creativos where id = cr3;
  get diagnostics v_k = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null; v_n := null;
  begin
    -- La vigente y la anterior de la publicada, y la vigente de un borrador.
    delete from public.creativos where id in (cr1, cr2, cr_car);
    get diagnostics v_n = row_count;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  delete from public.creativos where id = cr3;
  get diagnostics v_m = row_count;
  -- Descartada, la oferta vuelve a admitir una versión nueva.
  insert into public.creativos (oferta_id, tipo, copy_sugerido) values (o_env, 'IMAGEN', 'Versión 4 #publicidad')
  returning id into cr4;
  execute 'reset role';
  r := r || jsonb_build_object('d01_otra_empresa_no_descarta', v_k = 0);
  r := r || jsonb_build_object('d02_activadas_no_se_borran',
    case when v_n = 0 and (select count(*) = 3 from public.creativos where id in (cr1, cr2, cr_car)) then 'true'::jsonb
         else jsonb_build_object('borradas', v_n, 'error', v_e, 'detail', v_d) end);
  r := r || jsonb_build_object('d03_pendiente_descartada_con_sus_archivos',
    v_m = 1 and not exists (select 1 from public.creativos where id = cr3)
    and not exists (select 1 from public.creativo_archivos where id = ca_pend)
    and (select vigente from public.creativos where id = cr2)
    and (select activado_at is null and not vigente and reemplaza_a = cr2 from public.creativos where id = cr4));

  -- ── (b) ANU-003: presupuesto y fechas de la campaña frente a sus ofertas vivas, para cualquier rol ──────────
  -- o_env (publicada) reserva 5.000.000 de c_v. El rol propio no ve ofertas, pero las guardas sí las cuentan.
  perform set_config('request.jwt.claims', c_gc, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ofertas where id = o_env;
  select count(*) into v_m from public.campanas where id = c_v;
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.campanas set fecha_fin = v_hoy + 5 where id = c_v;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('b01_sin_ver_ofertas_no_deja_fuera_una_publicada',
    case when v_n = 0 and v_m = 1 and v_e = 'AMO_TRANSICION_INVALIDA' and v_d like '%quedaría fuera de las nuevas fechas%'
         then 'true'::jsonb
         else jsonb_build_object('ve_oferta', v_n, 've_campana', v_m, 'error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.campanas set presupuesto_total = 4999999 where id = c_v;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('b02_sin_ver_ofertas_no_baja_de_lo_reservado',
    case when v_e = 'AMO_PRESUPUESTO_CAMPANA' and v_d like '%lo que reservan las ofertas en revisión o publicadas%'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    update public.campanas set presupuesto_total = 4999999 where id = c_v;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('b03_anunciante_no_baja_de_lo_reservado',
    case when v_e = 'AMO_PRESUPUESTO_CAMPANA' and v_d like '%lo que reservan las ofertas en revisión o publicadas%'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  update public.campanas set presupuesto_total = 5000000 where id = c_v;
  get diagnostics v_n = row_count;
  update public.campanas set presupuesto_total = 21000000 where id = c_v;
  get diagnostics v_m = row_count;
  execute 'reset role';
  r := r || jsonb_build_object('b04_hasta_lo_reservado_y_subirlo',
    v_n = 1 and v_m = 1 and (select presupuesto_total = 21000000 from public.campanas where id = c_v));

  -- ── (a) Archivar (deleted_at) ofertas y campañas ─────────────────────────────────────────────────────────────
  -- o_r3 sigue en borrador (el cron canceló o_ant, cuya ventana terminaba). La sesión del dueño no puede archivarlo:
  -- la fila archivada dejaría de cumplir su política de lectura.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null; v_s := null;
  begin
    update public.ofertas set deleted_at = now() where id = o_r3;
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint,
                            v_s = returned_sqlstate;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('a01_la_sesion_no_archiva',
    case when v_s = '42501' and (select deleted_at is null from public.ofertas where id = o_r3) then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'sqlstate', v_s) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.archivar_oferta_srv(o_r3, u_av1, s_av1);                     -- borrador
  perform public.archivar_oferta_srv(o_presu, u_av2, s_av2);                  -- rechazada (CANCELADA), por el compañero
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.archivar_oferta_srv(o_env, u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('a03_publicada_no_se_archiva',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'Solo se archivan borradores y ofertas terminadas.'
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.archivar_oferta_srv(o_reel, u_ao, s_ao);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('a04_otra_empresa_no_archiva',
    case when v_e = 'AMO_NO_AUTORIZADO' and (select deleted_at is null from public.ofertas where id = o_reel)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  execute 'reset role';
  r := r || jsonb_build_object('a02_borrador_y_cancelada_archivadas',
    (select count(*) = 2 from public.ofertas
     where deleted_at = now() and ((id = o_r3 and estado = 'BORRADOR') or (id = o_presu and estado = 'CANCELADA')))
    and (select deleted_at is null and estado = 'PUBLICADA' from public.ofertas where id = o_env));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.ofertas where id in (o_r3, o_presu);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  select count(*) into v_m from public.ofertas where id in (o_r3, o_presu);
  execute 'reset role';
  r := r || jsonb_build_object('a05_el_dueno_ya_no_la_ve_y_amo_si', v_n = 0 and v_m = 2);

  -- Campaña en borrador con su oferta en borrador; la cancelada se archiva con sus ofertas canceladas.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.campanas (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total)
  values (an_v, 'Campaña Humo F2 descartada', 'Prueba', 'Marca Humo', v_hoy, v_hoy + 30, 5000000)
  returning id into c_arc;
  insert into public.ofertas (campana_id, titulo, formato_id, plataforma, presupuesto_maximo, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion)
  values (c_arc, 'Oferta Humo F2 descartada', f_post, 'INSTAGRAM', 1000000, now() + interval '3 days',
          now() + interval '10 days', now() + interval '2 days')
  returning id into o_arc;
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.archivar_campana_srv(c_arc, u_ao, s_ao);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('a06_otra_empresa_no_archiva_la_campana',
    case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.archivar_campana_srv(c_v, u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('a07_activa_no_se_archiva',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'Solo se archivan campañas en borrador, canceladas o finalizadas.'
              and (select deleted_at is null from public.campanas where id = c_v)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform public.archivar_campana_srv(c_arc, u_av1, s_av1);
  perform public.archivar_campana_srv(c_cas, u_av2, s_av2);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.campanas where id in (c_arc, c_cas);
  execute 'reset role';
  r := r || jsonb_build_object('a08_borrador_archivada_con_su_borrador',
    (select estado = 'BORRADOR' and deleted_at = now() from public.campanas where id = c_arc)
    and (select estado = 'BORRADOR' and deleted_at = now() from public.ofertas where id = o_arc)
    and v_n = 0);
  r := r || jsonb_build_object('a09_cancelada_archivada_con_sus_canceladas',
    (select deleted_at = now() from public.campanas where id = c_cas)
    and (select count(*) = 6 and bool_and(estado = 'CANCELADA' and deleted_at = now())
         from public.ofertas where campana_id = c_cas));

  -- ── (m) ADM-005 · S2: la moderación decide sobre el envío que revisó ───────────────────────────────────────────
  -- El anunciante envía el reel y la ficha del moderador muestra ese `enviada_at`. Mientras lo revisa, el anunciante lo
  -- retira, cambia la segmentación y lo reenvía minutos después: publicar o devolver con el envío viejo se rechaza.
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_reel, 'EN_REVISION', u_av1, s_av1);
  execute 'reset role';
  v_visto := (select enviada_at from public.ofertas where id = o_reel);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_reel, 'BORRADOR', u_av1, s_av1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  update public.ofertas set categorias_objetivo = array[cat_h] where id = o_reel;
  execute 'reset role';
  perform set_config('amo.reloj', (now() + interval '10 minutes')::text, true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_reel, 'EN_REVISION', u_av1, s_av1);
  execute 'reset role';
  v_actual := (select enviada_at from public.ofertas where id = o_reel);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_reel, 'PUBLICADA', u_adm, s_adm, null,
                                    jsonb_build_object('enviada_at', v_visto));
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  r := r || jsonb_build_object('m01_publicar_un_envio_viejo_se_rechaza',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'oferta_reenviada'
              and v_d = 'El anunciante cambió la oferta mientras la revisabas: vuelve a abrirla para revisar lo que envió ahora.'
              and v_visto < v_actual
         then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h, 'visto', v_visto, 'actual', v_actual) end);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_reel, 'DEVUELTA', u_adm, s_adm, v_comentario,
                                    jsonb_build_object('enviada_at', v_visto));
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('m02_devolver_un_envio_viejo_se_rechaza',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_h = 'oferta_reenviada'
              and (select estado = 'EN_REVISION' and comentario_moderacion is null and moderada_por is null
                   from public.ofertas where id = o_reel)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_reel, 'PUBLICADA', u_adm, s_adm, null,
                                    jsonb_build_object('enviada_at', v_actual));
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('m03_publicar_el_envio_actual',
    case when v_e = 'NO FALLÓ'
              and (select estado = 'PUBLICADA' and moderada_por = u_adm and enviada_at = v_actual
                          and categorias_objetivo = array[cat_h]
                   from public.ofertas where id = o_reel)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  -- Sin `enviada_at` (modo asistido, llamadas anteriores) la decisión sigue pasando: el carrusel, con su cupo.
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  update public.ofertas set categorias_objetivo = array[cat_h] where id = o_car;
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_car, fr1, 1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('ofertas', o_car, 'EN_REVISION', u_av1, s_av1);
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('ofertas', o_car, 'PUBLICADA', u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('m04_sin_enviada_at_sigue_pasando',
    case when v_e = 'NO FALLÓ' and (select estado = 'PUBLICADA' and publicada_at = now() from public.ofertas where id = o_car)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);

  -- ── (c) ANU-014 · R3: las obligaciones cumplidas no impiden cancelar la campaña ────────────────────────────────
  -- o_cum (en ejecución) tiene una asignación VERIFICADA, una PAGADA y otra PUBLICADA (en curso); o_csa está publicada
  -- sin aceptaciones.
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_cum, an_v, 'Campaña Humo F2 cumplida', 'Marca Humo', v_hoy - 15, v_hoy + 30, 20000000, 'ACTIVA',
          now() - interval '15 days');
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, enviada_at, publicada_at, en_ejecucion_at, cupos_totales)
  values (o_cum, c_cum, an_v, 'Cumplida en ejecución', f_post, 'INSTAGRAM', 2000000, 0.5, '{H24,H72,D7}',
          now() - interval '8 days', now() + interval '5 days', now() - interval '9 days', 'EN_EJECUCION',
          now() - interval '12 days', now() - interval '11 days', now() - interval '8 days', 3),
         (o_csa, c_cum, an_v, 'Publicada sin aceptaciones', f_post, 'INSTAGRAM', 1000000, 0.15, '{H24,H72,D7}',
          now() + interval '3 days', now() + interval '10 days', now() + interval '2 days', 'PUBLICADA',
          now() - interval '1 day', now() - interval '1 day', null, 2);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o_cum, fr1, 3), (o_csa, fr1, 2);
  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto,
                                    monto_comision, monto_medio, monto_retenciones, monto_neto, estado, fecha_pago,
                                    soporte_pago_path, pagada_at, requiere_documento_soporte)
  values (l_cum, me_b, v_hoy - 10, v_hoy - 1, 1, v_tarifa, 0.2 * v_tarifa, 0.8 * v_tarifa, 0, 0.8 * v_tarifa, 'PAGADA',
          v_hoy, 'liquidacion/' || l_cum || '/soporte.pdf', now(), false);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot,
                                   estado, aceptada_at, contenido_descargado_at, publicada_at, evidencia_validada_at,
                                   metricas_cargadas_at, verificada_at, liquidada_at, pagada_at, fecha_limite_publicacion,
                                   publicaciones, monto_bruto, tarifa_id, franja_id, liquidacion_id)
  values (a_ver, o_cum, c_cum, an_v, me_a, cu_a, 'INSTAGRAM', 1, 'VERIFICADA', now() - interval '10 days',
          now() - interval '9 days', now() - interval '8 days', now() - interval '7 days', now() - interval '1 day',
          now() - interval '1 day', null, null, now() - interval '7 days', 1, v_tarifa, v_tarifa_id, fr1, null),
         (a_pag, o_cum, c_cum, an_v, me_b, cu_b, 'INSTAGRAM', 1, 'PAGADA', now() - interval '10 days',
          now() - interval '9 days', now() - interval '8 days', now() - interval '7 days', now() - interval '3 days',
          now() - interval '3 days', now() - interval '2 days', now() - interval '1 day', now() - interval '7 days', 1,
          v_tarifa, v_tarifa_id, fr1, l_cum),
         (a_cur, o_cum, c_cum, an_v, me_c, cu_c, 'INSTAGRAM', 1, 'PUBLICADA', now() - interval '10 days',
          now() - interval '9 days', now() - interval '2 days', null, null, null, null, null, now() - interval '7 days', 1,
          v_tarifa, v_tarifa_id, fr1, null);
  perform set_config('amo.modo_carga', '', true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('campanas', c_cum, 'CANCELADA', u_av1, s_av1, 'La marca cerró la temporada');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('c05_con_una_asignacion_en_curso_no_se_cancela',
    case when v_e = 'AMO_TRANSICION_INVALIDA' and v_d = 'La campaña tiene asignaciones en curso: no se puede cancelar.'
              and (select estado = 'ACTIVA' from public.campanas where id = c_cum)
              and (select estado = 'PUBLICADA' from public.ofertas where id = o_csa)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  -- La que estaba en curso termina (verificada): ya nada impide cancelar.
  perform set_config('amo.modo_carga', 'on', true);
  update public.asignaciones set estado = 'VERIFICADA', evidencia_validada_at = now(), metricas_cargadas_at = now(),
                                 verificada_at = now()
  where id = a_cur;
  perform set_config('amo.modo_carga', '', true);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.transicionar_srv('campanas', c_cum, 'CANCELADA', u_av1, s_av1, 'La marca cerró la temporada');
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('c06_cumplidas_no_bloquean_y_la_cascada_respeta_obligaciones',
    case when v_e = 'NO FALLÓ'
              and (select estado = 'CANCELADA' and cancelada_at = now() from public.campanas where id = c_cum)
              and (select estado = 'CANCELADA' and cancelada_at = now() from public.ofertas where id = o_csa)
              and exists (select 1 from public.oferta_historial where oferta_id = o_csa and desde = 'PUBLICADA'
                            and hacia = 'CANCELADA' and actor_tipo = 'SISTEMA' and comentario = 'La marca cerró la temporada')
              -- La oferta con obligaciones queda como estaba (se cierra sola) y sus asignaciones siguen su curso.
              and (select estado = 'EN_EJECUCION' and cancelada_at is null from public.ofertas where id = o_cum)
              and not exists (select 1 from public.oferta_historial where oferta_id = o_cum)
              and (select count(*) = 3
                          and count(*) filter (where estado = 'VERIFICADA') = 2
                          and count(*) filter (where estado = 'PAGADA') = 1
                   from public.asignaciones where oferta_id = o_cum)
         then 'true'::jsonb
         else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h,
                                 'oferta_cumplida', (select estado from public.ofertas where id = o_cum),
                                 'oferta_publicada', (select estado from public.ofertas where id = o_csa)) end);

  -- ── (v) ANU-010 · ADM-003 · S5: una empresa suspendida no cambia el creativo que ven los medios ────────────────
  -- cr4 es la versión pendiente de o_env (publicada, con la asignación de A): se carga su archivo y AMO suspende la
  -- empresa. El anunciante ya no la activa; el equipo de AMO sí.
  p_cr4 := 'oferta/' || o_env || '/' || cr4 || '/humo-f2-4.jpg';
  insert into storage.objects (bucket_id, name, metadata)
  values ('creativos', p_cr4, jsonb_build_object('size', 4096, 'mimetype', 'image/jpeg'));
  perform set_config('request.jwt.claims', c_av1, true);
  execute 'set local role authenticated';
  insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, sha256)
  values (cr4, p_cr4, 'image/jpeg', 4096, 1080, 1080, v_sha1);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  perform public.transicionar_srv('anunciantes', an_v, 'SUSPENDIDO', u_adm, s_adm, 'Contenido engañoso en una oferta');
  v_e := 'NO FALLÓ'; v_d := null; v_h := null;
  begin
    perform public.activar_creativo_srv(cr4, u_av1, s_av1);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('v09_suspendida_no_activa_el_creativo',
    case when v_e = 'AMO_NO_AUTORIZADO'
              and v_d = 'Tu empresa no está verificada (o está suspendida): no puedes activar versiones nuevas del creativo de una oferta publicada.'
              and (select activado_at is null and not vigente from public.creativos where id = cr4)
              and (select vigente from public.creativos where id = cr2)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h) end);
  perform set_config('request.jwt.claims', c_srv, true);
  execute 'set local role service_role';
  v_e := 'NO FALLÓ'; v_d := null; v_h := null; v_res := null;
  begin
    v_res := public.activar_creativo_srv(cr4, u_adm, s_adm);
  exception when others then
    get stacked diagnostics v_e = message_text, v_d = pg_exception_detail, v_h = pg_exception_hint;
  end;
  execute 'reset role';
  r := r || jsonb_build_object('v10_el_equipo_amo_si_la_activa',
    case when v_e = 'NO FALLÓ' and v_res ->> 'reemplaza_a' = cr2::text
              and (select vigente and activado_at = now() from public.creativos where id = cr4)
              and (select not vigente from public.creativos where id = cr2)
              and (select estado_verificacion = 'SUSPENDIDO' from public.anunciantes where id = an_v)
         then 'true'::jsonb else jsonb_build_object('error', v_e, 'detail', v_d, 'hint', v_h, 'resultado', v_res) end);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
