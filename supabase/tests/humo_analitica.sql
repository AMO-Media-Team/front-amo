-- Pruebas de humo de la migración 9 (analítica: 9a base, 9b admin y accesos, 9c geografía, 9d anunciante y medio,
-- 9e reportes). Con un conjunto pequeño y conocido (agosto de 2026 contra julio) verifica el formato de salida de
-- cada RPC (columnas, filas, kpi_fila con n_anterior y serie diaria/semanal), los valores de las fórmulas de
-- docs/kpis.md (anclas, estados, último corte validado, n mínimo), el filtrado por organización (anunciante y
-- medio), los permisos (AMO_NO_AUTORIZADO, AAL) y los errores de parámetros (AMO_CONFIG_INVALIDA,
-- AMO_METRICA_NIVEL_INVALIDO).
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte. El umbral
-- analitica.n_minimo_tasas se baja a 2 dentro de la transacción para ejercitar las tasas agregadas.
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
  v_k jsonb;
  v_j jsonb;
  v_n bigint;
  v_num numeric;
  v_txt text;
  v_rec record;
  u_adm constant uuid := '00000000-0000-4000-a000-000000000901';
  u_fin constant uuid := '00000000-0000-4000-a000-000000000902';
  u_ana constant uuid := '00000000-0000-4000-a000-000000000903';
  u_anb constant uuid := '00000000-0000-4000-a000-000000000904';
  u_mea constant uuid := '00000000-0000-4000-a000-000000000905';
  u_meb constant uuid := '00000000-0000-4000-a000-000000000906';
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000900';
  s_adm constant uuid := '00000000-0000-4000-b000-000000000901';
  s_fin constant uuid := '00000000-0000-4000-b000-000000000902';
  s_ana constant uuid := '00000000-0000-4000-b000-000000000903';
  s_anb constant uuid := '00000000-0000-4000-b000-000000000904';
  s_mea constant uuid := '00000000-0000-4000-b000-000000000905';
  s_meb constant uuid := '00000000-0000-4000-b000-000000000906';
  an_a constant uuid := '00000000-0000-4000-c000-000000000901';
  an_b constant uuid := '00000000-0000-4000-c000-000000000902';
  me_a constant uuid := '00000000-0000-4000-d000-000000000901';
  me_b constant uuid := '00000000-0000-4000-d000-000000000902';
  cu_a constant uuid := '00000000-0000-4000-e000-000000000901';
  cu_b constant uuid := '00000000-0000-4000-e000-000000000902';
  c1 constant uuid := '00000000-0000-4000-f000-000000000901';
  c2 constant uuid := '00000000-0000-4000-f000-000000000902';
  o1 constant uuid := '00000000-0000-4000-f000-000000000911';
  o2 constant uuid := '00000000-0000-4000-f000-000000000912';
  a1 constant uuid := '00000000-0000-4000-f000-000000000921';
  a2 constant uuid := '00000000-0000-4000-f000-000000000922';
  a3 constant uuid := '00000000-0000-4000-f000-000000000923';
  a4 constant uuid := '00000000-0000-4000-f000-000000000924';
  a5 constant uuid := '00000000-0000-4000-f000-000000000925';
  a6 constant uuid := '00000000-0000-4000-f000-000000000926';
  p1 constant uuid := '00000000-0000-4000-f000-000000000931';
  p2 constant uuid := '00000000-0000-4000-f000-000000000932';
  p6 constant uuid := '00000000-0000-4000-f000-000000000936';
  l1 constant uuid := '00000000-0000-4000-f000-000000000941';
  rs1 constant uuid := '00000000-0000-4000-f000-000000000951';
  f1 constant uuid := '00000000-0000-4000-f000-000000000961';
  c_adm1 text; c_adm text; c_fin text; c_ana text; c_anb text; c_mea text; c_meb text;
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t join public.formatos f on f.id = t.formato_id
                    join public.franjas fr on fr.id = t.franja_id
                    where f.plataforma = 'INSTAGRAM' and f.clave = 'POST_FEED' and fr.clave = 'F1'
                    order by t.vigente_desde desc limit 1);
begin
  -- ── Preparación (owner, modo_carga): agosto de 2026 con julio como comparación ──────────────────────
  update public.configuracion set valor = to_jsonb(2) where clave = 'analitica.n_minimo_tasas';
  perform set_config('amo.modo_carga', 'on', true);
  -- La suite compara valores exactos de toda la plataforma (KPI, embudo, mapa): los datos demo que traiga la BD se
  -- retiran dentro de esta transacción con la purga de la propia BD; el rollback final los restaura.
  perform set_config('amo.purga', 'on', true);
  perform private.purgar_demo();
  perform set_config('amo.purga', '', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo9.adm@amo.test'), (u_fin, 'humo9.fin@amo.test'), (u_ana, 'humo9.ana@amo.test'),
               (u_anb, 'humo9.anb@amo.test'), (u_mea, 'humo9.mea@amo.test'), (u_meb, 'humo9.meb@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'Humo Nueve A S.A.S.', 'Humo Nueve A', '900000901', '1', v_sector, '11001', 'VERIFICADO', '2026-06-01'),
         (an_b, 'Humo Nueve B S.A.S.', 'Humo Nueve B', '900000902', '1', v_sector, '05001', 'VERIFICADO', '2026-06-01');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Nueve A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, '2026-08-01 15:00+00'),
         (me_b, 'Medio Nueve B', 'CREADOR', '76001', 'VERIFICADO', 1, '2026-06-01 15:00+00');
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humo9_a', 'https://instagram.com/humo9_a', 45000, fr1, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humo9_b', 'https://instagram.com/humo9_b', 45000, fr1, true, 'MANUAL', now());
  insert into public.medio_audiencia_paises (medio_id, pais_iso2, porcentaje, fuente)
  values (me_a, 'CO', 90, 'DECLARADA'), (me_a, 'US', 10, 'DECLARADA');
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
  values (c1, an_a, 'Campaña Nueve', 'Marca Humo', '2026-07-01', '2026-12-31', 50000000, 'ACTIVA', '2026-07-01 15:00+00'),
         (c2, an_b, 'Campaña Nueve B', 'Marca Humo', '2026-08-01', '2026-12-31', 10000000, 'ACTIVA', '2026-08-01 15:00+00');
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, publicada_at, cupos_totales)
  values (o1, c1, an_a, 'Oferta Nueve', f_post, 'INSTAGRAM', 20000000, 1, '{D7}', '2026-07-05 15:00+00',
          '2026-09-30 15:00+00', '2026-08-09 15:00+00', 'EN_EJECUCION', '2026-07-05 15:00+00', 10),
         (o2, c2, an_b, 'Oferta Nueve B', f_post, 'INSTAGRAM', 5000000, 1, '{D7}', '2026-08-10 15:00+00',
          '2026-10-31 15:00+00', '2026-08-25 15:00+00', 'EN_EJECUCION', '2026-08-10 15:00+00', 5);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o1, fr1, 10), (o2, fr1, 5);
  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto, monto_comision,
                                    monto_medio, monto_retenciones, monto_neto, estado, fecha_pago, soporte_pago_path, pagada_at,
                                    requiere_documento_soporte)
  values (l1, me_b, '2026-08-01', '2026-08-15', 1, 300000, 60000, 240000, 12000, 228000, 'PAGADA', '2026-08-20',
          'liquidacion/' || l1 || '/soporte.pdf', '2026-08-20 15:00+00', false);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, contenido_descargado_at, publicada_at, evidencia_validada_at, metricas_cargadas_at, verificada_at, liquidada_at,
    pagada_at, vencida_at, cancelada_at, causa_cancelacion, fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id,
    franja_id, liquidacion_id)
  values
    (a1, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'VERIFICADA', '2026-08-03 15:00+00', '2026-08-04 15:00+00',
     '2026-08-05 15:00+00', '2026-08-06 15:00+00', '2026-08-11 15:00+00', '2026-08-12 15:00+00', null, null, null, null, null,
     '2026-08-10 15:00+00', 1, 500000, v_tarifa, fr1, null),
    (a2, o1, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'PAGADA', '2026-08-04 15:00+00', '2026-08-05 15:00+00',
     '2026-08-06 15:00+00', '2026-08-07 15:00+00', '2026-08-13 15:00+00', '2026-08-14 15:00+00', '2026-08-15 15:00+00',
     '2026-08-20 15:00+00', null, null, null, '2026-08-12 15:00+00', 1, 300000, v_tarifa, fr1, l1),
    (a3, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 2, 'VENCIDA_SIN_PUBLICAR', '2026-08-05 15:00+00', null, null, null, null, null,
     null, null, '2026-08-15 16:00+00', null, null, '2026-08-15 15:00+00', 1, 500000, v_tarifa, fr1, null),
    (a4, o2, c2, an_b, me_a, cu_a, 'INSTAGRAM', 1, 'ACEPTADA', '2026-08-20 15:00+00', null, null, null, null, null, null, null,
     null, null, null, '2026-10-20 15:00+00', 1, 250000, v_tarifa, fr1, null),
    (a5, o1, c1, an_a, me_b, cu_b, 'INSTAGRAM', 2, 'CANCELADA', '2026-08-08 15:00+00', null, null, null, null, null, null, null,
     null, '2026-08-09 15:00+00', 'ADMINISTRATIVA', '2026-08-16 15:00+00', 1, 300000, v_tarifa, fr1, null),
    (a6, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 3, 'VERIFICADA', '2026-07-10 15:00+00', '2026-07-11 15:00+00',
     '2026-07-12 15:00+00', '2026-07-13 15:00+00', '2026-07-19 15:00+00', '2026-07-20 15:00+00', null, null, null, null, null,
     '2026-07-15 15:00+00', 1, 200000, v_tarifa, fr1, null);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen,
                                        monto_comision, retenciones_aplicadas, monto_retenciones, monto_neto)
  values (a1, me_a, 500000, 0.2, 'GLOBAL', 100000, null, null, null),
         (a2, me_b, 300000, 0.2, 'GLOBAL', 60000, '[]', 12000, 228000),
         (a3, me_a, 500000, 0.2, 'GLOBAL', 100000, null, null, null),
         (a4, me_a, 250000, 0.2, 'GLOBAL', 50000, null, null, null),
         (a5, me_b, 300000, 0.2, 'GLOBAL', 60000, null, null, null),
         (a6, me_a, 200000, 0.2, 'GLOBAL', 40000, null, null, null);
  insert into public.publicaciones (id, asignacion_id, numero, url_post, fecha_publicacion, captura_path, etiqueta_publicidad_confirmada,
                                    etiqueta_verificada, permanencia_hasta, estado_validacion)
  values (p1, a1, 1, 'https://www.instagram.com/p/humo9a/', '2026-08-05 15:00+00', 'asignacion/' || a1 || '/publicacion/1-c.webp',
          true, true, '2026-08-12 15:00+00', 'APROBADA'),
         (p2, a2, 1, 'https://www.instagram.com/p/humo9b/', '2026-08-06 15:00+00', 'asignacion/' || a2 || '/publicacion/1-c.webp',
          true, true, '2026-08-13 15:00+00', 'APROBADA'),
         (p6, a6, 1, 'https://www.instagram.com/p/humo9f/', '2026-07-12 15:00+00', 'asignacion/' || a6 || '/publicacion/1-c.webp',
          true, true, '2026-07-19 15:00+00', 'APROBADA');
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, clics_enlace, captura_path,
                               estado_validacion, created_at)
  values (p1, 'H24', '2026-08-06 15:00+00', 6000, 9000, 300, 20, 'asignacion/' || a1 || '/metrica/h24.webp', 'APROBADA',
          '2026-08-06 15:00+00'),
         (p1, 'D7', '2026-08-12 15:00+00', 10000, 15000, 600, 50, 'asignacion/' || a1 || '/metrica/d7.webp', 'APROBADA',
          '2026-08-12 15:00+00'),
         (p2, 'D7', '2026-08-13 15:00+00', 5000, 8000, 300, 10, 'asignacion/' || a2 || '/metrica/d7.webp', 'APROBADA',
          '2026-08-13 15:00+00'),
         (p6, 'D7', '2026-07-19 15:00+00', 4000, 5000, 100, 5, 'asignacion/' || a6 || '/metrica/d7.webp', 'APROBADA',
          '2026-07-19 15:00+00');
  -- Alerta de desviación en el corte D7 de A (el trigger de alertas solo la recalcula si cambian alcance o corte).
  update public.metricas set alerta_desviacion = true where publicacion_id = p1 and corte = 'D7';
  insert into public.oferta_vistas (oferta_id, medio_id, primera_vista_at, ultima_vista_at, veces)
  values (o1, me_a, '2026-08-02 15:00+00', '2026-08-02 15:00+00', 1), (o1, me_b, '2026-08-03 15:00+00', '2026-08-03 15:00+00', 1),
         (o2, me_b, '2026-08-11 15:00+00', '2026-08-11 15:00+00', 1);
  insert into public.accesos (usuario_id, email_hash, evento, pais_iso2, departamento_codigo, municipio_codigo, created_at,
                              es_sospechoso, motivo_sospecha)
  values (u_mea, null, 'LOGIN_EXITOSO', 'CO', '05', '05001', '2026-08-10 13:00+00', false, null),
         (u_ana, null, 'LOGIN_EXITOSO', 'CO', '11', '11001', '2026-08-11 14:00+00', false, null),
         (u_adm, null, 'LOGIN_EXITOSO', 'US', null, null, '2026-08-12 15:00+00', true, 'PAIS_INUSUAL'),
         (null, encode(sha256(convert_to('humo9.ana@amo.test', 'UTF8')), 'hex'), 'LOGIN_FALLIDO', 'CO', '11', null,
          '2026-08-12 16:00+00', false, null),
         (u_adm, null, 'MFA_FALLIDO', 'CO', null, null, '2026-08-13 15:00+00', false, null),
         (u_mea, null, 'LOGIN_EXITOSO', 'CO', '05', '05001', '2026-07-10 13:00+00', false, null);
  insert into public.resoluciones_dian (id, tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        consecutivo_actual, vigente_desde, activa)
  values (rs1, 'FACTURA_VENTA', 'HNUE', '18760000009', '2026-01-01', 1, 1000, 1, '2026-01-01', false);
  insert into public.facturas (id, anunciante_id, campana_id, resolucion_id, prefijo, consecutivo, fecha_emision,
                               fecha_vencimiento, subtotal, iva, pagado, estado, emitida_at)
  values (f1, an_a, c1, rs1, 'HNUE', 1, '2026-08-05', '2026-08-20', 1000000, 190000, 500000, 'PAGADA_PARCIAL',
          '2026-08-05 15:00+00');
  insert into public.pagos_anunciante (factura_id, anunciante_id, fecha_pago, monto, medio_pago)
  values (f1, an_a, '2026-08-25', 500000, 'TRANSFERENCIA');
  perform set_config('amo.modo_carga', '', true);
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;
  c_anb := jsonb_build_object('sub', u_anb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_anb)::text;
  c_mea := jsonb_build_object('sub', u_mea, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mea)::text;
  c_meb := jsonb_build_object('sub', u_meb, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_meb)::text;

  -- ── (a) Tablero admin ───────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_admin('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('a1_kpis_admin_16_claves', (select count(*) = 16 from jsonb_object_keys(v_k)));
  r := r || jsonb_build_object('a2_formato_kpi_fila',
    (select array_agg(x order by x) from jsonb_object_keys(v_k -> 'gmv_verificado') x)
      = array['kpi', 'n', 'n_anterior', 'serie', 'unidad', 'valor', 'valor_anterior', 'variacion']
    and jsonb_array_length(v_k -> 'gmv_verificado' -> 'serie') = 31);
  r := r || jsonb_build_object('a3_gmv_comprometido',
    (v_k -> 'gmv_comprometido' ->> 'valor')::numeric = 1050000 and (v_k -> 'gmv_comprometido' ->> 'n')::int = 3
    and (v_k -> 'gmv_comprometido' ->> 'valor_anterior')::numeric = 200000
    and (v_k -> 'gmv_comprometido' ->> 'variacion')::numeric = 4.25 and v_k -> 'gmv_comprometido' ->> 'unidad' = 'COP');
  r := r || jsonb_build_object('a4_gmv_verificado_y_serie',
    (v_k -> 'gmv_verificado' ->> 'valor')::numeric = 800000 and (v_k -> 'gmv_verificado' ->> 'n_anterior')::int = 1
    and (v_k -> 'gmv_verificado' -> 'serie' ->> 11)::numeric = 500000
    and (select sum(x::numeric) from jsonb_array_elements_text(v_k -> 'gmv_verificado' -> 'serie') x) = 800000);
  r := r || jsonb_build_object('a5_comision_take_rate',
    (v_k -> 'comision' ->> 'valor')::numeric = 160000 and (v_k -> 'take_rate' ->> 'valor')::numeric = 0.2
    and v_k -> 'take_rate' ->> 'unidad' = '%');
  r := r || jsonb_build_object('a6_negocios_ofertas',
    (v_k -> 'negocios_cerrados' ->> 'valor')::numeric = 2 and (v_k -> 'ofertas_publicadas' ->> 'valor')::numeric = 1
    and (v_k -> 'ofertas_publicadas' ->> 'valor_anterior')::numeric = 1);
  r := r || jsonb_build_object('a7_tasas',
    (v_k -> 'tasa_llenado' ->> 'valor')::numeric = 0.4 and (v_k -> 'tasa_llenado' ->> 'n')::int = 2
    and (v_k -> 'tasa_aceptacion' ->> 'valor')::numeric = 0.666667
    and (v_k -> 'tasa_cumplimiento' ->> 'valor')::numeric = 0.666667 and (v_k -> 'tasa_cumplimiento' ->> 'n')::int = 3);
  r := r || jsonb_build_object('a8_alcance_ultimo_corte', (v_k -> 'alcance_total' ->> 'valor')::numeric = 15000);
  r := r || jsonb_build_object('a9_medios_anunciantes',
    (v_k -> 'medios_activos' ->> 'valor')::numeric = 2 and (v_k -> 'medios_nuevos' ->> 'valor')::numeric = 1
    and (v_k -> 'anunciantes_activos' ->> 'valor')::numeric = 2 and (v_k -> 'ticket_promedio' ->> 'valor')::numeric = 525000
    and v_k -> 'medios_en_riesgo' -> 'serie' = 'null'::jsonb);
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_admin('2026-07-01', '2026-08-31') k;
  r := r || jsonb_build_object('a10_serie_semanal', jsonb_array_length(v_k -> 'gmv_verificado' -> 'serie') = 10);
  execute 'reset role';
  update public.configuracion set valor = to_jsonb(20) where clave = 'analitica.n_minimo_tasas';
  execute 'set local role authenticated';
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_admin('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('a11_n_minimo_tasas',
    v_k -> 'take_rate' -> 'valor' = 'null'::jsonb and (v_k -> 'take_rate' ->> 'n')::int = 2
    and (v_k -> 'gmv_verificado' ->> 'valor')::numeric = 800000);
  execute 'reset role';
  update public.configuracion set valor = to_jsonb(2) where clave = 'analitica.n_minimo_tasas';
  execute 'set local role authenticated';
  select count(*) as filas, sum(s.gmv_verificado) as verificado, sum(s.asignaciones_aceptadas) as aceptadas,
         sum(s.gmv_comprometido) as comprometido into v_rec
  from public.serie_gmv('2026-08-01', '2026-08-31', 'semana') s;
  r := r || jsonb_build_object('a12_serie_gmv',
    v_rec.filas = 6 and v_rec.verificado = 800000 and v_rec.aceptadas = 5 and v_rec.comprometido = 1050000);
  select jsonb_object_agg(e.etapa, jsonb_build_array(e.orden, e.cantidad, e.porcentaje_anterior)) into v_j
  from public.embudo_asignaciones('2026-08-01', '2026-08-31') e;
  r := r || jsonb_build_object('a13_embudo',
    v_j = '{"vistas": [1, 3, null], "aceptadas": [2, 5, 1.666667], "contenido_entregado": [3, 2, 0.400000],
            "publicadas": [4, 2, 1.000000], "evidencia_validada": [5, 2, 1.000000], "metricas_cargadas": [6, 2, 1.000000],
            "verificadas": [7, 2, 1.000000], "pagadas": [8, 1, 0.500000]}'::jsonb);
  select * into v_rec from public.mezcla_plataformas('2026-08-01', '2026-08-31');
  r := r || jsonb_build_object('a14_mezcla_plataformas',
    v_rec.plataforma = 'INSTAGRAM' and v_rec.formato_clave = 'POST_FEED' and v_rec.asignaciones = 2 and v_rec.gmv = 800000
    and v_rec.alcance = 15000 and v_rec.participacion_gmv = 1 and v_rec.cpm_efectivo = 34782.61);
  select jsonb_object_agg(s.segmento, s.cantidad) into v_j from public.salud_medios('2026-08-01', '2026-08-31') s;
  r := r || jsonb_build_object('a15_salud_medios',
    (select count(*) = 5 from jsonb_object_keys(v_j)) and (v_j ->> 'activos')::int >= 2 and (v_j ->> 'nuevos')::int >= 1);
  -- «A hoy» con el reloj fijo: la ventana de actividad (medios.dias_actividad, 90 días) se mide desde private.ahora()
  -- y los datos de la prueba son de julio y agosto de 2026; con la fecha real la aceptación del 10 de julio sale de la
  -- ventana el 8 de octubre de 2026 y el GMV esperado dejaría de cumplirse.
  perform set_config('amo.reloj', '2026-09-30 15:00:00+00', true);
  select jsonb_agg(jsonb_build_object('m', x.medio_id, 'g', x.gmv_90d, 'ab', x.asignaciones_abiertas) order by x.gmv_90d desc)
    into v_j from public.medios_en_riesgo(50) x where x.medio_id in (me_a, me_b);
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('a16_medios_en_riesgo',
    v_j = jsonb_build_array(jsonb_build_object('m', me_a, 'g', 700000, 'ab', 1), jsonb_build_object('m', me_b, 'g', 300000, 'ab', 0)));
  select count(*) as filas, sum(h.cantidad) as total, max(h.cantidad) filter (where h.dia_semana = 1 and h.hora = 10) as lunes_10
    into v_rec
  from public.actividad_heatmap('2026-08-01', '2026-08-31') h;
  r := r || jsonb_build_object('a17_heatmap_168', v_rec.filas = 168 and v_rec.total = 5 and v_rec.lunes_10 = 1);
  select count(*) as filas, sum(h.cantidad) as total into v_rec
  from public.actividad_heatmap('2026-08-01', '2026-08-31', 'accesos') h;
  r := r || jsonb_build_object('a18_heatmap_accesos', v_rec.filas = 168 and v_rec.total = 3);
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.metricas_accesos('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('a19_metricas_accesos',
    (v_k -> 'accesos_exitosos' ->> 'valor')::numeric = 3 and (v_k -> 'accesos_exitosos' ->> 'valor_anterior')::numeric = 1
    and (v_k -> 'accesos_fallidos' ->> 'valor')::numeric = 1 and (v_k -> 'tasa_fallo' ->> 'valor')::numeric = 0.25
    and (v_k -> 'usuarios_unicos' ->> 'valor')::numeric = 3 and (v_k -> 'paises_distintos' ->> 'valor')::numeric = 2
    and (v_k -> 'accesos_sospechosos' ->> 'valor')::numeric = 1 and (v_k -> 'mfa_fallidos' ->> 'valor')::numeric = 1
    and (select count(*) = 9 from jsonb_object_keys(v_k)));
  r := r || jsonb_build_object('a20_resumen_ejecutivo',
    (select count(*) = 16 from public.reporte_resumen_ejecutivo('2026-08-01', '2026-08-31')));

  -- ── (b) Geografía ──────────────────────────────────────────────────────────────────────────────────
  select * into v_rec from public.geo_metricas('departamento', 'gmv', '2026-08-01', '2026-08-31') g where g.codigo = '05';
  r := r || jsonb_build_object('b1_geo_departamento_gmv',
    v_rec.valor = 750000 and v_rec.n = 2 and v_rec.codigo_geometria = '05' and v_rec.poblacion > 0
    and v_rec.valor_por_100k = round(750000 / v_rec.poblacion::numeric * 100000, 2)
    and (select count(*) from public.geo_metricas('departamento', 'gmv', '2026-08-01', '2026-08-31'))
        = (select count(*) from public.departamentos where activo));
  select * into v_rec from public.geo_metricas('departamento', 'cumplimiento', '2026-08-01', '2026-08-31') g
  where g.codigo in ('05', '76') order by g.codigo limit 1;
  r := r || jsonb_build_object('b2_geo_cumplimiento_n_minimo', v_rec.valor = 0.5 and v_rec.n = 2 and v_rec.valor_por_100k is null
    and (select g.valor is null and g.n = 1 from public.geo_metricas('departamento', 'cumplimiento', '2026-08-01', '2026-08-31') g
         where g.codigo = '76'));
  r := r || jsonb_build_object('b3_geo_campanas',
    (select g.valor = 2 from public.geo_metricas('departamento', 'campanas', '2026-08-01', '2026-08-31') g where g.codigo = '05'));
  select * into v_rec from public.geo_metricas('municipio', 'medios', '2026-08-01', '2026-08-31', '05') g where g.codigo = '05001';
  r := r || jsonb_build_object('b4_geo_municipio', v_rec.valor >= 1 and v_rec.codigo_geometria is not null and v_rec.poblacion is null);
  r := r || jsonb_build_object('b5_geo_pais_accesos',
    (select jsonb_object_agg(g.codigo, g.valor) from public.geo_metricas('pais', 'accesos', '2026-08-01', '2026-08-31') g)
      = '{"CO": 2, "US": 1}'::jsonb);
  r := r || jsonb_build_object('b6_geo_pais_audiencia',
    (select g.valor >= 4500 and g.codigo_geometria = 'US' from public.geo_metricas('pais', 'audiencia', '2026-08-01', '2026-08-31') g
     where g.codigo = 'US'));
  r := r || jsonb_build_object('b7_geo_pais_anunciantes',
    (select g.valor = 2 from public.geo_metricas('pais', 'anunciantes', '2026-08-01', '2026-08-31') g where g.codigo = 'CO'));
  begin
    perform public.geo_metricas('departamento', 'audiencia', '2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('b8_matriz_invalida', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b8_matriz_invalida', sqlerrm = 'AMO_METRICA_NIVEL_INVALIDO');
  end;
  begin
    perform public.geo_metricas('municipio', 'gmv', '2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('b9_municipio_sin_departamento', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('b9_municipio_sin_departamento', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  select * into v_rec from public.top_zonas('departamento', 'gmv', '2026-08-01', '2026-08-31', 5) t order by t.rank limit 1;
  r := r || jsonb_build_object('b10_top_zonas',
    v_rec.codigo = '05' and v_rec.rank = 1 and v_rec.valor = 750000 and v_rec.participacion = 0.714286
    and v_rec.valor_anterior = 200000 and v_rec.variacion = 2.75);
  select * into v_rec from public.reporte_cobertura_territorial('2026-08-01', '2026-08-31') c where c.departamento_codigo = '05';
  r := r || jsonb_build_object('b11_cobertura_departamental',
    v_rec.municipio_codigo is null and v_rec.gmv = 750000 and v_rec.asignaciones = 2 and v_rec.alcance = 10000
    and v_rec.medios_activos >= 1 and v_rec.medios_por_100k is not null);
  select * into v_rec from public.reporte_cobertura_territorial('2026-08-01', '2026-08-31', '05') c where c.municipio_codigo = '05001';
  r := r || jsonb_build_object('b12_cobertura_municipal', v_rec.gmv = 750000 and v_rec.poblacion is null);

  -- ── (c) Reportes ───────────────────────────────────────────────────────────────────────────────────
  select * into v_rec from public.reporte_usuarios_accesos('2026-08-01', '2026-08-31') u where u.usuario_id = u_ana;
  r := r || jsonb_build_object('c1_usuarios_accesos',
    v_rec.accesos_exitosos = 1 and v_rec.accesos_fallidos = 1 and v_rec.email = 'humo9.ana@amo.test' and not v_rec.mfa_activo
    and v_rec.rol is not null and v_rec.estado = 'ACTIVO');
  select * into v_rec from public.reporte_desempeno_campanas('2026-08-01', '2026-08-31') c where c.campana_id = c1;
  r := r || jsonb_build_object('c2_desempeno_campanas',
    v_rec.gmv_comprometido = 800000 and v_rec.gmv_verificado = 800000 and v_rec.n_verificadas = 2
    and v_rec.tasa_cumplimiento = 0.666667 and v_rec.ofertas = 1 and v_rec.cupos = 10 and v_rec.tasa_llenado = 0.5
    and v_rec.alcance = 15000 and v_rec.cpm_efectivo = 34782.61 and v_rec.anunciante = 'Humo Nueve A');
  select jsonb_object_agg(c.medio_id, jsonb_build_array(c.comprometidas, c.cumplidas, c.vencidas, c.canceladas, c.alertas_metricas))
    into v_j from public.reporte_cumplimiento_medios('2026-08-01', '2026-08-31') c where c.medio_id in (me_a, me_b);
  r := r || jsonb_build_object('c3_cumplimiento_medios',
    v_j = jsonb_build_object(me_a, jsonb_build_array(2, 1, 1, 0, 1), me_b, jsonb_build_array(1, 1, 0, 1, 0)));
  select * into v_rec from public.reporte_finanzas('2026-08-01', '2026-08-31', 'anunciante') f where f.grupo_id = an_a::text;
  r := r || jsonb_build_object('c4_finanzas_anunciante',
    v_rec.grupo = 'Humo Nueve A' and v_rec.gmv_comprometido = 800000 and v_rec.gmv_verificado = 800000
    and v_rec.comision = 160000 and v_rec.take_rate = 0.2 and v_rec.pagado_medios = 228000 and v_rec.facturado = 1190000
    and v_rec.recaudado = 500000 and v_rec.cartera = 690000);
  select count(*) as filas, min(f.grupo_id) as gid, min(f.grupo) as nombre into v_rec
  from public.reporte_finanzas('2026-08-01', '2026-08-31', 'mes') f;
  r := r || jsonb_build_object('c5_finanzas_mes', v_rec.filas = 1 and v_rec.gid = '2026-08' and v_rec.nombre = 'agosto 2026');
  select * into v_rec from public.reporte_cartera('2026-08-31') c where c.anunciante_id = an_a;
  r := r || jsonb_build_object('c6_cartera',
    v_rec.saldo = 690000 and v_rec.saldo_0_30 = 690000 and v_rec.saldo_90_mas = 0 and v_rec.facturas_vencidas = 1);
  begin
    perform public.reporte_finanzas('2026-08-01', '2026-08-31', 'region');
    r := r || jsonb_build_object('c7_agrupacion_invalida', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c7_agrupacion_invalida', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    perform public.kpis_admin('2026-08-31', '2026-08-01');
    r := r || jsonb_build_object('c8_periodo_invalido', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c8_periodo_invalido', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  begin
    perform public.kpis_admin('2026-08-01', '2026-08-31', '2026-07-01', null);
    r := r || jsonb_build_object('c9_comparacion_incompleta', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c9_comparacion_incompleta', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;
  execute 'reset role';

  -- FINANZAS: reportes financieros sí; usuarios y accesos no.
  perform set_config('request.jwt.claims', c_fin, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('c10_finanzas_reporte',
    (select count(*) >= 1 from public.reporte_finanzas('2026-08-01', '2026-08-31', 'sector')));
  begin
    perform public.reporte_usuarios_accesos('2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('c11_finanzas_sin_accesos', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c11_finanzas_sin_accesos', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';

  -- ADMIN en aal1: la sesión no es válida para un rol con MFA.
  perform set_config('request.jwt.claims', c_adm1, true);
  execute 'set local role authenticated';
  begin
    perform public.kpis_admin('2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('c12_admin_aal1', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('c12_admin_aal1', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';

  -- ── (d) Anunciante ─────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_ana, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_anunciante('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('d1_kpis_anunciante',
    (select count(*) = 16 from jsonb_object_keys(v_k))
    and (v_k -> 'inversion_comprometida' ->> 'valor')::numeric = 800000
    and (v_k -> 'inversion_verificada' ->> 'valor')::numeric = 800000
    and (v_k -> 'medios_alcanzados' ->> 'valor')::numeric = 2 and (v_k -> 'campanas_activas' ->> 'valor')::numeric = 1
    and (v_k -> 'ofertas_publicadas' ->> 'valor')::numeric = 0 and (v_k -> 'tasa_llenado' ->> 'valor')::numeric = 0.5);
  r := r || jsonb_build_object('d2_desempeno_anunciante',
    (v_k -> 'alcance_total' ->> 'valor')::numeric = 15000 and (v_k -> 'impresiones' ->> 'valor')::numeric = 23000
    and (v_k -> 'interacciones' ->> 'valor')::numeric = 900 and (v_k -> 'clics' ->> 'valor')::numeric = 60
    and (v_k -> 'cpm_efectivo' ->> 'valor')::numeric = 34782.608696 and (v_k -> 'engagement' ->> 'valor')::numeric = 0.06
    and (v_k -> 'costo_por_alcance' ->> 'valor')::numeric = 53.333333
    and (v_k -> 'tasa_cumplimiento' ->> 'valor')::numeric = 0.666667 and (v_k -> 'tasa_cumplimiento' ->> 'n')::int = 3);
  select * into v_rec from public.desempeno_anunciante('2026-08-01', '2026-08-31', 'plataforma');
  r := r || jsonb_build_object('d3_cortes_plataforma',
    v_rec.clave = 'INSTAGRAM' and v_rec.nombre = 'Instagram' and v_rec.asignaciones = 2 and v_rec.gmv = 800000
    and v_rec.alcance = 15000 and v_rec.cpm_efectivo = 34782.61 and v_rec.n = 2);
  r := r || jsonb_build_object('d4_cortes_medio',
    (select array_agg(d.nombre order by d.nombre) from public.desempeno_anunciante('2026-08-01', '2026-08-31', 'medio') d)
      = array['Medio Nueve A', 'Medio Nueve B']);
  r := r || jsonb_build_object('d5_cortes_departamento_fecha',
    (select count(*) = 2 from public.desempeno_anunciante('2026-08-01', '2026-08-31', 'departamento') d where d.nombre is not null)
    and (select array_agg(d.clave order by d.clave) from public.desempeno_anunciante('2026-08-01', '2026-08-31', 'fecha') d)
        = array['2026-08-12', '2026-08-14']);
  begin
    perform public.desempeno_anunciante('2026-08-01', '2026-08-31', 'sector');
    r := r || jsonb_build_object('d6_dimension_invalida', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d6_dimension_invalida', sqlerrm = 'AMO_METRICA_NIVEL_INVALIDO');
  end;
  begin
    perform public.kpis_admin('2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('d7_anunciante_sin_tablero_admin', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d7_anunciante_sin_tablero_admin', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  begin
    perform public.geo_metricas('departamento', 'gmv', '2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('d8_anunciante_sin_mapa', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d8_anunciante_sin_mapa', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  r := r || jsonb_build_object('d9_reporte_campanas_propias',
    (select array_agg(c.campana_id) from public.reporte_desempeno_campanas('2026-08-01', '2026-08-31', an_b) c) = array[c1]);
  execute 'reset role';
  perform set_config('request.jwt.claims', c_anb, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_anunciante('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('d10_anunciante_b_aislado',
    (v_k -> 'inversion_comprometida' ->> 'valor')::numeric = 250000 and (v_k -> 'inversion_verificada' ->> 'valor')::numeric = 0);
  begin
    perform public.kpis_medio('2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('d11_anunciante_sin_tablero_medio', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d11_anunciante_sin_tablero_medio', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  execute 'reset role';

  -- ── (e) Medio (RPC definer filtradas a su medio) ────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_mea, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_medio('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('e1_kpis_medio',
    (select count(*) = 11 from jsonb_object_keys(v_k))
    and (v_k -> 'ganado_periodo' ->> 'valor')::numeric = 400000 and (v_k -> 'ganado_periodo' ->> 'valor_anterior')::numeric = 160000
    and (v_k -> 'pendiente_pago' ->> 'valor')::numeric = 560000 and v_k -> 'pendiente_pago' -> 'valor_anterior' = 'null'::jsonb
    and (v_k -> 'pagado_historico' ->> 'valor')::numeric = 0 and (v_k -> 'asignaciones_activas' ->> 'valor')::numeric = 1
    and (v_k -> 'publicaciones_realizadas' ->> 'valor')::numeric = 1);
  r := r || jsonb_build_object('e2_cumplimiento_y_tope',
    (v_k -> 'tasa_cumplimiento' ->> 'valor')::numeric = 0.666667 and (v_k -> 'tasa_cumplimiento' ->> 'n')::int = 3
    and (v_k -> 'consumido_tope' ->> 'valor')::numeric = 760000
    and (v_k -> 'tope_anual' ->> 'valor')::numeric = (select tope_anual from public.niveles_verificacion where nivel = 1)
    and (v_k -> 'porcentaje_tope' ->> 'valor')::numeric
        = round(760000 / (select tope_anual from public.niveles_verificacion where nivel = 1), 6)
    and v_k -> 'multiplicador_calidad' ->> 'unidad' = 'factor' and (v_k -> 'multiplicador_calidad' ->> 'n')::int = 1);
  select count(*) as filas, sum(s.ganado) as ganado, sum(s.asignaciones) as asignaciones into v_rec
  from public.serie_ganancias_medio('2026-08-01', '2026-08-31', 'semana') s;
  r := r || jsonb_build_object('e3_serie_ganancias', v_rec.filas = 6 and v_rec.ganado = 400000 and v_rec.asignaciones = 1);
  select * into v_rec from public.proximas_acciones_medio() limit 1;
  r := r || jsonb_build_object('e4_proximas_acciones',
    v_rec.asignacion_id = a4 and v_rec.accion = 'DESCARGAR' and v_rec.oferta_titulo = 'Oferta Nueve B'
    and v_rec.vence_at = '2026-10-20 15:00+00');
  begin
    perform public.kpis_admin('2026-08-01', '2026-08-31');
    r := r || jsonb_build_object('e5_medio_sin_tablero_admin', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e5_medio_sin_tablero_admin', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  r := r || jsonb_build_object('e6_medio_no_lee_asignaciones_base', (select count(*) = 0 from public.asignaciones));
  execute 'reset role';
  perform set_config('request.jwt.claims', c_meb, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(k.kpi, to_jsonb(k)) into v_k from public.kpis_medio('2026-08-01', '2026-08-31') k;
  r := r || jsonb_build_object('e7_medio_b_pagos',
    (v_k -> 'pagado_historico' ->> 'valor')::numeric = 228000 and (v_k -> 'retenciones_historicas' ->> 'valor')::numeric = 12000
    and (v_k -> 'ganado_periodo' ->> 'valor')::numeric = 240000);
  select sum(s.pagado) into v_num from public.serie_ganancias_medio('2026-08-01', '2026-08-31', 'mes') s;
  r := r || jsonb_build_object('e8_serie_pagado', v_num = 228000);
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ── (f) Grants y propiedades ──────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('f1_sin_anon',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('kpis_admin', 'kpis_medio', 'geo_metricas', 'reporte_cartera')
                  and has_function_privilege('anon', p.oid, 'execute')));
  r := r || jsonb_build_object('f2_authenticated_ejecuta',
    has_function_privilege('authenticated', 'public.kpis_admin(date, date, date, date)', 'execute')
    and has_function_privilege('authenticated', 'public.top_zonas(text, text, date, date, integer)', 'execute'));
  r := r || jsonb_build_object('f3_definer_solo_medio_y_usuarios',
    (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('kpis_admin', 'serie_gmv', 'embudo_asignaciones', 'mezcla_plataformas', 'top_zonas', 'geo_metricas',
                         'salud_medios', 'medios_en_riesgo', 'actividad_heatmap', 'kpis_anunciante', 'desempeno_anunciante',
                         'kpis_medio', 'serie_ganancias_medio', 'proximas_acciones_medio', 'metricas_accesos',
                         'reporte_resumen_ejecutivo', 'reporte_cobertura_territorial', 'reporte_usuarios_accesos',
                         'reporte_desempeno_campanas', 'reporte_cumplimiento_medios', 'reporte_finanzas', 'reporte_cartera'))
      = array['kpis_medio', 'proximas_acciones_medio', 'reporte_usuarios_accesos', 'serie_ganancias_medio']);

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
