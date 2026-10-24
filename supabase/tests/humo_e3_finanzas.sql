-- Pruebas de humo de 20261024024312_e3_finanzas (fase 5): periodo cerrado, periodo sugerido y medios por liquidar
-- (LIQ-001), corte por lote con un solo aviso a quienes aprueban, retenciones prorrateadas (LIQ-002), segregación y
-- seguridad social reevaluada al aprobar (LIQ-003, LIQ-007), documento soporte numerado por la plataforma o por el
-- proveedor, protegido, con archivos, CUDS y nota de ajuste antes de anular (LIQ-004, D35 y D38 del RF), factura del
-- medio que factura, dispersión en dos pasos con el permiso de datos reservados, datos de pago completos y un revelado
-- por medio (LIQ-005), pago con soporte cargado y fecha válida (LIQ-006), lo que ve el medio con la comisión oculta
-- (MED-015, CFG-004), facturas al anunciante desde las asignaciones y expedidas en el software de AMO, pagos con
-- retenciones, notas crédito parciales y totales y esquema de mandato (LIQ-008, ANU-013, D16/D37 del RF), y la cartera
-- y los reportes con notas crédito y retenciones (ADM-004).
-- Se ejecuta como owner (pnpm db:suites) en una transacción que SIEMPRE se revierte. Fija la configuración y los
-- parámetros tributarios que usa (UVT de 50.000, SMLMV de 1.500.000, umbral de 1 SMLMV, retención en la fuente del 4 % y
-- del 6 % con base de 4 UVT, ReteICA de 9,66 por mil) y sus propias resoluciones DIAN (las demás se desactivan dentro de
-- la transacción). El corte por lote también liquida lo que tenga la demo: solo se comparan las filas de la suite. Los
-- roles internos entran con aal2. Cada prueba deja `true` si pasa o lo observado si falla.
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

create function pg_temp.es(p_obs jsonb, p_e text, p_d text default null, p_h text default null) returns jsonb
language sql as $$
  select case when p_obs ->> 'e' = p_e and (p_d is null or p_obs ->> 'd' = p_d) and (p_h is null or p_obs ->> 'h' = p_h)
              then 'true'::jsonb else p_obs end $$;

create function pg_temp.es_estado(p_obs jsonb, p_s text) returns jsonb
language sql as $$ select case when p_obs ->> 's' = p_s then 'true'::jsonb else p_obs end $$;

-- Sube un objeto al bucket de soportes como lo haría la interfaz (owner).
create function pg_temp.subir(p_ruta text) returns void
language sql as $$
  insert into storage.objects (bucket_id, name, metadata)
  values ('soportes', p_ruta, '{"mimetype": "application/pdf", "size": 1000}') $$;

-- `true` si se cumple; si no, lo observado.
create function pg_temp.ok(p_cond boolean, p_obs jsonb) returns jsonb
language sql as $$ select case when coalesce(p_cond, false) then 'true'::jsonb else coalesce(p_obs, 'null'::jsonb) end $$;

do $humo$
declare
  r jsonb := '{}';
  v_e jsonb; v_j jsonb; v_n bigint; v_m bigint; v_txt text; v_num numeric; v_ok boolean;
  -- usuarios y sesiones
  u_adm constant uuid := '00000000-0000-4000-a000-0000000f5001';   -- ADMIN (genera)
  u_fin constant uuid := '00000000-0000-4000-a000-0000000f5002';   -- FINANZAS (aprueba, emite, dispersa, paga, factura)
  u_tes constant uuid := '00000000-0000-4000-a000-0000000f5003';   -- rol propio: registra pagos sin datos reservados
  u_an constant uuid := '00000000-0000-4000-a000-0000000f5004';    -- ANUNCIANTE
  u_ms constant uuid := '00000000-0000-4000-a000-0000000f5005';    -- MEDIO S (documento soporte)
  u_mf constant uuid := '00000000-0000-4000-a000-0000000f5006';    -- MEDIO F (factura)
  s_adm constant uuid := '00000000-0000-4000-b000-0000000f5001';
  s_fin constant uuid := '00000000-0000-4000-b000-0000000f5002';
  s_tes constant uuid := '00000000-0000-4000-b000-0000000f5003';
  s_an constant uuid := '00000000-0000-4000-b000-0000000f5004';
  s_ms constant uuid := '00000000-0000-4000-b000-0000000f5005';
  s_mf constant uuid := '00000000-0000-4000-b000-0000000f5006';
  rol_tes constant uuid := '00000000-0000-4000-a000-00000000f5f1';
  an_v constant uuid := '00000000-0000-4000-c000-0000000f5001';
  me_s constant uuid := '00000000-0000-4000-d000-0000000f5001';   -- no declarante, no factura: 6 % y documento soporte
  me_f constant uuid := '00000000-0000-4000-d000-0000000f5002';   -- declarante, factura: 4 %
  me_x constant uuid := '00000000-0000-4000-d000-0000000f5003';   -- sin datos de pago
  cu_s constant uuid := '00000000-0000-4000-e000-0000000f5001';
  cu_f constant uuid := '00000000-0000-4000-e000-0000000f5002';
  cu_x constant uuid := '00000000-0000-4000-e000-0000000f5003';
  cat_f constant uuid := '00000000-0000-4000-f000-0000000f50c1';
  c_v constant uuid := '00000000-0000-4000-f000-0000000f5101';
  o_v constant uuid := '00000000-0000-4000-f000-0000000f5201';
  a_s1 constant uuid := '00000000-0000-4000-9000-0000000f5301';
  a_s2 constant uuid := '00000000-0000-4000-9000-0000000f5302';
  a_f1 constant uuid := '00000000-0000-4000-9000-0000000f5303';
  a_x1 constant uuid := '00000000-0000-4000-9000-0000000f5304';
  res_ds constant uuid := '00000000-0000-4000-8000-0000000f5401';
  res_fv constant uuid := '00000000-0000-4000-8000-0000000f5402';
  disp constant uuid := '00000000-0000-4000-8000-0000000f5501';
  c_adm text; c_fin text; c_tes text; c_an text; c_ms text; c_mf text;
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
  liq_s uuid; liq_f uuid; liq_x uuid; ds1 uuid; ds2 uuid; dsx uuid; f1 uuid; f2 uuid; f3 uuid; f4 uuid;
begin
  -- ── Preparación (owner, modo_carga) ──────────────────────────────────────────────────────────────────────────
  update public.configuracion c set valor = x.valor
  from (values ('comision.porcentaje_global', '0.2'::jsonb), ('comision.visible_para_medio', 'true'),
               ('liquidaciones.periodicidad', '"QUINCENAL"'), ('liquidaciones.dias_pago', '8'),
               ('tributario.politica_seg_social', '"ALERTA"'), ('tributario.reteica_municipio_base', '"MEDIO"'),
               ('tributario.numeracion_documento_soporte', '"PLATAFORMA"'), ('facturacion.iva', '0.19'),
               ('facturacion.dias_vencimiento', '30'), ('facturacion.esquema', '"COMPRA_REVENTA"'))
       as x (clave, valor)
  where c.clave = x.clave;
  update public.parametros_tributarios set uvt = 50000, smlmv = 1500000, umbral_seg_social_smlmv = 1
  where anio = extract(year from v_hoy)::smallint;
  delete from public.retenciones_config;
  insert into public.retenciones_config (tipo, concepto, aplica_declarante, tarifa, base_minima_uvt, vigente_desde)
  values ('RETEFUENTE', 'SERVICIOS', true, 0.04, 4, date '2025-01-01'),
         ('RETEFUENTE', 'SERVICIOS', false, 0.06, 4, date '2025-01-01');
  delete from public.reteica_municipal where municipio_codigo = v_mun;
  insert into public.reteica_municipal (municipio_codigo, tarifa_por_mil, base_minima_uvt, vigente_desde)
  values (v_mun, 9.66, 0, date '2025-01-01');
  update public.resoluciones_dian set activa = false where activa;
  insert into public.resoluciones_dian (id, tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        consecutivo_actual, vigente_desde, activa)
  values (res_ds, 'DOCUMENTO_SOPORTE', 'DSF', '18764000005001', v_hoy - 30, 1, 100, 0, v_hoy - 30, true),
         (res_fv, 'FACTURA_VENTA', 'FVF', '18764000005002', v_hoy - 30, 1, 100, 0, v_hoy - 30, true);

  perform set_config('amo.modo_carga', 'on', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humo.e3f.admin@amo.test'), (u_fin, 'humo.e3f.finanzas@amo.test'),
               (u_tes, 'humo.e3f.tesorero@amo.test'), (u_an, 'humo.e3f.anunciante@amo.test'),
               (u_ms, 'humo.e3f.medio.s@amo.test'), (u_mf, 'humo.e3f.medio.f@amo.test')) x (u, e);
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa)
  values (rol_tes, 'HUMO_E3F_TESORERO', 'Humo E3F tesorero', 'ADMIN', true);
  insert into public.rol_permisos (rol_id, permiso_clave)
  values (rol_tes, 'liquidaciones.ver'), (rol_tes, 'liquidaciones.registrar_pago');
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2,
                                  municipio_codigo, estado_verificacion, verificado_at)
  values (an_v, 'Humo E3F S.A.S.', 'Humo E3F', '900888001', private.digito_verificacion_nit('900888001'), v_sector, 'CO',
          v_mun, 'VERIFICADO', now());
  insert into public.categorias (id, nombre, descripcion) values (cat_f, 'Humo E3F', 'Categoría de la suite');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_s, 'Medio Humo S', 'PAGINA_NOTICIAS', v_mun, 'VERIFICADO', 1, now()),
         (me_f, 'Medio Humo F', 'CREADOR', v_mun, 'VERIFICADO', 1, now()),
         (me_x, 'Medio Humo X', 'CREADOR', v_mun, 'VERIFICADO', 1, now());
  insert into public.medios_privado (medio_id, titular_nombre, tipo_documento, numero_documento_cifrado, es_declarante,
                                     obligado_facturar, responsable_iva, metodo_pago, datos_pago_cifrados, datos_pago_resumen,
                                     datos_pago_cambiados_at)
  values (me_s, 'Sara Medio', 'CC', 'v1:aaaa:bbbb:cccc', false, false, false, 'BANCARIO', 'v1:dddd:eeee:ffff',
          'Banco ···1234', now() - interval '10 days'),
         (me_f, 'Fabián Medio', 'CC', 'v1:aaaa:bbbb:cccd', true, true, false, 'BANCARIO', 'v1:dddd:eeee:fffe',
          'Banco ···5678', now() - interval '10 days'),
         (me_x, 'Ximena Medio', 'CC', null, false, false, false, null, null, null, null)
  on conflict (medio_id) do update
    set titular_nombre = excluded.titular_nombre, tipo_documento = excluded.tipo_documento,
        numero_documento_cifrado = excluded.numero_documento_cifrado, es_declarante = excluded.es_declarante,
        obligado_facturar = excluded.obligado_facturar, responsable_iva = excluded.responsable_iva,
        metodo_pago = excluded.metodo_pago, datos_pago_cifrados = excluded.datos_pago_cifrados,
        datos_pago_resumen = excluded.datos_pago_resumen, datos_pago_cambiados_at = excluded.datos_pago_cambiados_at;
  insert into public.documentos_medio (medio_id, tipo, archivo_path, estado_validacion, validado_at, metodo, created_at)
  values (me_s, 'CERT_BANCARIA', 'medio/' || me_s || '/CERT_BANCARIA/c.pdf', 'APROBADO', now(), 'ARCHIVO', now() - interval '5 days'),
         (me_f, 'CERT_BANCARIA', 'medio/' || me_f || '/CERT_BANCARIA/c.pdf', 'APROBADO', now(), 'ARCHIVO', now() - interval '5 days');
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_s, me_s, 'INSTAGRAM', 'humo_e3f_s', 'https://instagram.com/humo_e3f_s', 45000, true, 'MANUAL', now()),
         (cu_f, me_f, 'INSTAGRAM', 'humo_e3f_f', 'https://instagram.com/humo_e3f_f', 45000, true, 'MANUAL', now()),
         (cu_x, me_x, 'INSTAGRAM', 'humo_e3f_x', 'https://instagram.com/humo_e3f_x', 45000, true, 'MANUAL', now());
  update public.perfiles p set rol_id = (select id from public.roles where clave = x.rol), estado = 'ACTIVO',
         debe_cambiar_password = false, nombre = x.nombre,
         anunciante_id = case when x.rol = 'ANUNCIANTE' then x.org end, medio_id = case when x.rol = 'MEDIO' then x.org end
  from (values (u_adm, 'ADMIN', 'Ana Administradora', null::uuid), (u_fin, 'FINANZAS', 'Fabio Finanzas', null),
               (u_tes, 'HUMO_E3F_TESORERO', 'Tomás Tesorero', null), (u_an, 'ANUNCIANTE', 'Andrea Anunciante', an_v),
               (u_ms, 'MEDIO', 'Sara Medio', me_s), (u_mf, 'MEDIO', 'Fabián Medio', me_f)) as x (id, rol, nombre, org)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  select x.s, x.u, now(), now(), x.aal::auth.aal_level
  from (values (s_adm, u_adm, 'aal2'), (s_fin, u_fin, 'aal2'), (s_tes, u_tes, 'aal2'), (s_an, u_an, 'aal1'),
               (s_ms, u_ms, 'aal1'), (s_mf, u_mf, 'aal1')) as x (s, u, aal);
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c_v, an_v, 'Campaña Humo E3F', 'Marca Cuatro', v_hoy - 20, v_hoy + 20, 50000000, 'ACTIVA', now());
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, publicaciones_por_medio,
                              permite_multiples_cupos, presupuesto_maximo, tope_porcentaje_por_medio, categorias_objetivo,
                              cortes_requeridos, ventana_inicio, ventana_fin, fecha_limite_aceptacion, instrucciones,
                              restricciones, estado, enviada_at, publicada_at)
  values (o_v, c_v, an_v, 'Post de la liquidación', f_post, 'INSTAGRAM', 1, true, 20000000, 1, array[cat_f], '{H24}',
          now() - interval '15 days', now() - interval '5 days', now() - interval '16 days', 'Publica la pieza.', 'Sin cambios.',
          'CERRADA', now() - interval '18 days', now() - interval '17 days');
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, contenido_descargado_at, publicada_at, evidencia_validada_at, metricas_cargadas_at, verificada_at,
    fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id, franja_clave, seguidores_al_aceptar)
  select x.id, o_v, c_v, an_v, x.medio, x.cuenta, 'INSTAGRAM', x.slot, 'VERIFICADA', now() - interval '14 days',
         now() - interval '13 days', now() - interval '12 days', now() - interval '11 days', now() - interval '10 days',
         now() - interval '3 days', now() - interval '5 days', 1, x.bruto, v_tarifa, fr1, 'F1', 45000
  from (values (a_s1, me_s, cu_s, 1, 5000000), (a_s2, me_s, cu_s, 2, 5000000), (a_f1, me_f, cu_f, 1, 1000000),
               (a_x1, me_x, cu_x, 1, 1000000)) as x (id, medio, cuenta, slot, bruto);
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen, monto_comision)
  select a.id, a.medio_id, a.monto_bruto, 0.2, 'GLOBAL', a.monto_bruto * 0.2
  from public.asignaciones a where a.id in (a_s1, a_s2, a_f1, a_x1);
  perform set_config('amo.modo_carga', '', true);

  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_tes := jsonb_build_object('sub', u_tes, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_tes)::text;
  c_an := jsonb_build_object('sub', u_an, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_an)::text;
  c_ms := jsonb_build_object('sub', u_ms, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ms)::text;
  c_mf := jsonb_build_object('sub', u_mf, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_mf)::text;

  -- ── (a) Periodo cerrado, periodo sugerido y medios por liquidar (LIQ-001) ───────────────────────────────────────
  v_e := pg_temp.srv_falla(format('select public.generar_liquidacion_srv(%L, %L, %L, %L, %L)', me_s, v_hoy - 10, v_hoy + 1,
                                  u_adm, s_adm));
  r := r || jsonb_build_object('a1_periodo_abierto_no_se_liquida', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', null, 'periodo_abierto'));
  v_j := pg_temp.como(c_fin, 'authenticated', 'select to_jsonb(p) from public.periodo_liquidacion_sugerido() p');
  r := r || jsonb_build_object('a2_periodo_sugerido_quincenal_cerrado',
    pg_temp.ok((v_j ->> 'fin')::date <= v_hoy and (v_j ->> 'periodicidad') = 'QUINCENAL'
               and extract(day from (v_j ->> 'inicio')::date) in (1, 16)
               and ((v_j ->> 'fin')::date = ((v_j ->> 'inicio')::date + 14) or extract(day from (v_j ->> 'fin')::date + 1) = 1),
               v_j));
  v_e := pg_temp.falla(c_ms, 'authenticated', 'select * from public.periodo_liquidacion_sugerido()');
  r := r || jsonb_build_object('a3_periodo_sugerido_solo_finanzas', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  v_j := pg_temp.como(c_fin, 'authenticated', format(
    'select jsonb_object_agg(medio_id, jsonb_build_object(''n'', asignaciones, ''monto'', monto_medio, ''ds'', requiere_documento_soporte,
       ''pago'', datos_pago_listos, ''ss'', seg_social_pendiente)) from public.pendientes_liquidacion(%L) where medio_id in (%L, %L, %L)',
    v_hoy, me_s, me_f, me_x));
  r := r || jsonb_build_object('a4_pendientes_de_liquidar',
    pg_temp.ok(v_j -> me_s::text = '{"n": 2, "monto": 8000000, "ds": true, "pago": true, "ss": true}'::jsonb
               and v_j -> me_f::text = '{"n": 1, "monto": 800000, "ds": false, "pago": true, "ss": false}'::jsonb
               and (v_j -> me_x::text ->> 'pago')::boolean = false, v_j));
  v_n := pg_temp.como(c_ms, 'authenticated', format('select count(*) from public.pendientes_liquidacion(null)'));
  r := r || jsonb_build_object('a5_pendientes_solo_finanzas', pg_temp.ok(v_n = 0, to_jsonb(v_n)));

  -- ── (b) Corte por lote con un aviso a la cola (LIQ-001, LIQ-002) ───────────────────────────────────────────────
  v_j := pg_temp.srv(format(
    'select jsonb_object_agg(medio_id, jsonb_build_object(''l'', liquidacion_id, ''e'', error))
       from public.generar_liquidaciones_corte_srv(%L, %L, %L, %L) where medio_id in (%L, %L, %L)',
    v_hoy - 14, v_hoy, u_adm, s_adm, me_s, me_f, me_x));
  liq_s := (v_j -> me_s::text ->> 'l')::uuid;
  liq_f := (v_j -> me_f::text ->> 'l')::uuid;
  liq_x := (v_j -> me_x::text ->> 'l')::uuid;
  r := r || jsonb_build_object('b1_corte_por_lote',
    pg_temp.ok(liq_s is not null and liq_f is not null and liq_x is not null
               and v_j -> me_s::text -> 'e' = 'null'::jsonb, v_j));
  r := r || jsonb_build_object('b2_retenciones_prorrateadas',
    pg_temp.ok((select estado = 'BORRADOR' and monto_bruto = 10000000 and monto_comision = 2000000 and monto_medio = 8000000
                       and monto_retenciones = 557280 and monto_neto = 7442720 and requiere_documento_soporte and alerta_seg_social
                       and creada_por = u_adm from public.liquidaciones where id = liq_s)
               and (select bool_and(m.monto_retenciones = 278640 and m.monto_neto = 3721360) from public.asignacion_montos m
                    where m.asignacion_id in (a_s1, a_s2))
               and (select monto_retenciones = 39728 and monto_neto = 760272 and not requiere_documento_soporte
                    from public.liquidaciones where id = liq_f)
               and (select count(*) = 1 from public.documentos_soporte where liquidacion_id = liq_s and estado = 'BORRADOR')
               and not exists (select 1 from public.documentos_soporte where liquidacion_id = liq_f),
               (select to_jsonb(l) from public.liquidaciones l where l.id = liq_s)));
  r := r || jsonb_build_object('b3_un_aviso_a_quienes_aprueban',
    pg_temp.ok((select count(*) = 1 from public.notificaciones where usuario_id = u_fin and tipo = 'cola.liquidaciones_por_aprobar')
               and not exists (select 1 from public.notificaciones where usuario_id = u_adm and tipo like 'cola.liquidacion%')
               and not exists (select 1 from public.notificaciones where tipo = 'cola.liquidacion_por_aprobar'
                               and entidad_id in (liq_s::text, liq_f::text, liq_x::text)),
               (select jsonb_agg(tipo) from public.notificaciones where usuario_id in (u_fin, u_adm))));
  r := r || jsonb_build_object('b4_medio_que_factura_carga_su_factura',
    pg_temp.ok((select count(*) = 1 from public.notificaciones where usuario_id = u_mf and tipo = 'liquidacion.factura_requerida'
                and entidad_id = liq_f::text)
               and not exists (select 1 from public.notificaciones where usuario_id = u_ms and tipo = 'liquidacion.factura_requerida'),
               null));
  v_e := pg_temp.srv_falla(format('select public.generar_liquidacion_srv(%L, %L, %L, %L, %L)', me_s, v_hoy - 3, v_hoy, u_adm, s_adm));
  r := r || jsonb_build_object('b5_traslape', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA'));

  -- ── (c) Aprobación: seguridad social reevaluada y segregación (LIQ-003, LIQ-007) ────────────────────────────────
  update public.configuracion set valor = '"BLOQUEAR"' where clave = 'tributario.politica_seg_social';
  v_e := pg_temp.srv_falla(format('select public.transicionar_srv(''liquidaciones'', %L, ''APROBADA'', %L, %L)', liq_s, u_fin, s_fin));
  r := r || jsonb_build_object('c1_seguridad_social_bloquea', pg_temp.es(v_e, 'AMO_SEG_SOCIAL_PENDIENTE'));
  perform set_config('amo.modo_carga', 'on', true);
  insert into public.documentos_medio (medio_id, tipo, archivo_path, estado_validacion, validado_at, metodo, fecha_vencimiento)
  values (me_s, 'SEG_SOCIAL', 'medio/' || me_s || '/SEG_SOCIAL/p.pdf', 'APROBADO', now(), 'ARCHIVO', v_hoy + 30);
  perform set_config('amo.modo_carga', '', true);
  perform pg_temp.srv(format('select public.transicionar_srv(''liquidaciones'', %L, ''APROBADA'', %L, %L)', liq_s, u_fin, s_fin));
  r := r || jsonb_build_object('c2_aprueba_y_reevalua_la_alerta',
    pg_temp.ok((select estado = 'APROBADA' and not alerta_seg_social and aprobada_por = u_fin from public.liquidaciones where id = liq_s),
               (select to_jsonb(l) from public.liquidaciones l where l.id = liq_s)));
  update public.configuracion set valor = '"ALERTA"' where clave = 'tributario.politica_seg_social';
  v_e := pg_temp.srv_falla(format('select public.transicionar_srv(''liquidaciones'', %L, ''APROBADA'', %L, %L)', liq_f, u_adm, s_adm));
  r := r || jsonb_build_object('c3_quien_genera_no_aprueba', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  perform pg_temp.srv(format('select public.transicionar_srv(''liquidaciones'', %L, ''APROBADA'', %L, %L)', liq_f, u_fin, s_fin));
  perform pg_temp.srv(format('select public.transicionar_srv(''liquidaciones'', %L, ''APROBADA'', %L, %L)', liq_x, u_fin, s_fin));
  v_j := pg_temp.como(c_fin, 'authenticated', format(
    'select jsonb_object_agg(id, jsonb_build_object(''doc'', documento_listo, ''pago'', datos_pago_listos))
       from public.liquidaciones_por_pagar(500, 0) where id in (%L, %L, %L)', liq_s, liq_f, liq_x));
  v_n := pg_temp.como(c_ms, 'authenticated', 'select count(*) from public.liquidaciones_por_pagar(500, 0)');
  r := r || jsonb_build_object('c5_por_pagar_con_lo_que_falta',
    pg_temp.ok(v_j -> liq_s::text = '{"doc": false, "pago": true}'::jsonb and v_j -> liq_f::text = '{"doc": false, "pago": true}'::jsonb
               and v_j -> liq_x::text = '{"doc": false, "pago": false}'::jsonb and v_n = 0, v_j));
  v_e := pg_temp.srv_falla(format('select public.datos_dispersion_srv(array[%L]::uuid[], %L, %L)', liq_s, u_fin, s_fin));
  r := r || jsonb_build_object('c4_sin_documento_soporte_no_se_dispersa',
    pg_temp.es(v_e, 'AMO_DOCUMENTO_SOPORTE_REQUERIDO', null, 'documento_soporte_requerido'));

  -- ── (d) Documento soporte (LIQ-004, D35 y D38 del RF) ──────────────────────────────────────────────────────────
  ds1 := pg_temp.srv(format('select public.emitir_documento_soporte_srv(%L, %L, %L)', liq_s, u_fin, s_fin)) #>> '{}';
  r := r || jsonb_build_object('d1_emitido_por_la_plataforma',
    pg_temp.ok((select estado = 'EMITIDO' and numero = 'DSF1' and fecha_emision = v_hoy and valor_total = 8000000
                from public.documentos_soporte where id = ds1), null));
  v_e := pg_temp.srv_falla(format('update public.documentos_soporte set valor_total = 1 where id = %L', ds1));
  r := r || jsonb_build_object('d2_ni_la_clave_secreta_reescribe', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  v_txt := format('select public.adjuntar_archivos_documento_soporte_srv(%L, %L, %L, %L, %L)', ds1,
                  'documento_soporte/' || ds1 || '/DSF1.pdf', 'documento_soporte/' || ds1 || '/DSF1.json', u_fin, s_fin);
  v_e := pg_temp.srv_falla(v_txt);
  perform pg_temp.subir('documento_soporte/' || ds1 || '/DSF1.pdf');
  perform pg_temp.subir('documento_soporte/' || ds1 || '/DSF1.json');
  perform pg_temp.srv(v_txt);
  r := r || jsonb_build_object('d3_archivos_cargados_antes',
    pg_temp.ok(v_e ->> 'h' = 'archivo_no_cargado'
               and (select archivo_path = 'documento_soporte/' || ds1 || '/DSF1.pdf'
                           and archivo_proveedor_path = 'documento_soporte/' || ds1 || '/DSF1.json'
                    from public.documentos_soporte where id = ds1), v_e));
  v_e := pg_temp.srv_falla(format('select public.registrar_cuds_srv(%L, %L, %L, %L)', ds1, 'no-es-un-cuds', u_fin, s_fin));
  perform pg_temp.srv(format('select public.registrar_cuds_srv(%L, %L, %L, %L)', ds1, upper(repeat('b', 96)), u_fin, s_fin));
  perform pg_temp.srv(format('select public.registrar_cuds_srv(%L, %L, %L, %L)', ds1, repeat('b', 96), u_fin, s_fin));
  r := r || jsonb_build_object('d4_cuds_con_formato_e_idempotente',
    pg_temp.ok(v_e ->> 'h' = 'cuds_formato'
               and (select cuds = repeat('b', 96) and cuds_registrado_por = u_fin from public.documentos_soporte where id = ds1), v_e));
  v_e := pg_temp.srv_falla(format('select public.registrar_cuds_srv(%L, %L, %L, %L)', ds1, repeat('c', 96), u_fin, s_fin));
  r := r || jsonb_build_object('d5_cuds_no_se_reemplaza', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', null, 'cuds_registrado'));
  v_e := pg_temp.srv_falla(format('select public.transicionar_srv(''liquidaciones'', %L, ''ANULADA'', %L, %L, ''Error en el periodo'')',
                                  liq_s, u_fin, s_fin));
  v_j := pg_temp.srv_falla(format('select public.transicionar_srv(''documentos_soporte'', %L, ''ANULADO'', %L, %L, ''Corrección'')',
                                  ds1, u_fin, s_fin));
  r := r || jsonb_build_object('d6_transmitido_no_se_anula_sin_nota',
    pg_temp.ok(v_e ->> 'h' = 'requiere_nota_ajuste' and v_j ->> 'h' = 'requiere_nota_ajuste', jsonb_build_array(v_e, v_j)));
  v_txt := format('select public.registrar_nota_ajuste_srv(%L, %L, null, %L, %L, %L)', ds1, 'na-1',
                  'documento_soporte/' || ds1 || '/NA-1.pdf', u_fin, s_fin);
  v_e := pg_temp.srv_falla(v_txt);
  perform pg_temp.subir('documento_soporte/' || ds1 || '/NA-1.pdf');
  perform pg_temp.srv(v_txt);
  perform pg_temp.srv(format('select public.transicionar_srv(''documentos_soporte'', %L, ''ANULADO'', %L, %L, ''Corrección con nota de ajuste'')',
                             ds1, u_fin, s_fin));
  ds2 := pg_temp.srv(format('select public.emitir_documento_soporte_srv(%L, %L, %L)', liq_s, u_fin, s_fin)) #>> '{}';
  r := r || jsonb_build_object('d7_nota_de_ajuste_anular_y_reemitir',
    pg_temp.ok(v_e ->> 'h' = 'archivo_no_cargado'
               and (select estado = 'ANULADO' and nota_ajuste_numero = 'NA-1' and nota_ajuste_por = u_fin
                    from public.documentos_soporte where id = ds1)
               and (select estado = 'EMITIDO' and numero = 'DSF2' and liquidacion_id = liq_s from public.documentos_soporte where id = ds2)
               and (select estado = 'APROBADA' from public.liquidaciones where id = liq_s), v_e));
  -- Numeración del proveedor (D35 del RF): la plataforma no numera; registra el número, el CUDS y el PDF.
  update public.configuracion set valor = '"PROVEEDOR"' where clave = 'tributario.numeracion_documento_soporte';
  v_e := pg_temp.srv_falla(format('select public.emitir_documento_soporte_srv(%L, %L, %L)', liq_x, u_fin, s_fin));
  dsx := pg_temp.srv(format('select public.preparar_documento_soporte_srv(%L, %L, %L)', liq_x, u_fin, s_fin)) #>> '{}';
  v_txt := format('select public.registrar_documento_soporte_externo_srv(%L, %L, 50, %L, %L, %L, %L, %L)', dsx, 'dsf', v_hoy,
                  repeat('d', 96), 'documento_soporte/' || dsx || '/DSF50.pdf', u_fin, s_fin);
  v_j := pg_temp.srv_falla(v_txt);
  perform pg_temp.subir('documento_soporte/' || dsx || '/DSF50.pdf');
  perform pg_temp.srv(v_txt);
  r := r || jsonb_build_object('d8_numeracion_del_proveedor',
    pg_temp.ok(v_e ->> 'h' = 'numeracion_proveedor' and v_j ->> 'h' = 'archivo_no_cargado'
               and (select estado = 'EMITIDO' and numero = 'DSF50' and cuds = repeat('d', 96)
                           and archivo_path = 'documento_soporte/' || dsx || '/DSF50.pdf'
                    from public.documentos_soporte where id = dsx)
               and (select consecutivo_actual = 50 from public.resoluciones_dian where id = res_ds), jsonb_build_array(v_e, v_j)));
  update public.configuracion set valor = '"PLATAFORMA"' where clave = 'tributario.numeracion_documento_soporte';
  v_e := pg_temp.srv_falla(v_txt);
  r := r || jsonb_build_object('d9_un_solo_sistema_numera', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', null, 'numeracion_plataforma'));
  v_j := pg_temp.como(c_fin, 'authenticated', format('select public.datos_documento_soporte(%L)', ds2));
  r := r || jsonb_build_object('d10_datos_del_pdf',
    pg_temp.ok(jsonb_array_length(v_j -> 'lineas') = 2 and v_j #>> '{documento,numero}' = 'DSF2'
               and v_j #>> '{resolucion,numero_resolucion}' = '18764000005001'
               and (select jsonb_object_agg(e ->> 'tipo', (e ->> 'valor')::numeric) from jsonb_array_elements(v_j -> 'retenciones') e)
                   = '{"RETEFUENTE": 480000, "RETEICA": 77280}'::jsonb
               and v_j ? 'adquiriente', v_j));
  v_e := pg_temp.falla(c_ms, 'authenticated', format('select public.datos_documento_soporte(%L)', ds2));
  r := r || jsonb_build_object('d11_datos_del_pdf_solo_finanzas', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));

  -- ── (e) Factura del medio que factura (LIQ-004) ────────────────────────────────────────────────────────────────
  v_n := pg_temp.hacer(c_mf, 'authenticated', format('insert into storage.objects (bucket_id, name) values (''soportes'', %L)',
                                                     'liquidacion/' || liq_f || '/factura/fe-77.pdf'));
  v_e := pg_temp.falla(c_ms, 'authenticated', format('insert into storage.objects (bucket_id, name) values (''soportes'', %L)',
                                                     'liquidacion/' || liq_f || '/factura/ajena.pdf'));
  v_j := pg_temp.falla(c_mf, 'authenticated', format('insert into storage.objects (bucket_id, name) values (''soportes'', %L)',
                                                     'liquidacion/' || liq_s || '/factura/otra.pdf'));
  r := r || jsonb_build_object('e1_medio_sube_su_factura',
    pg_temp.ok(v_n = 1 and v_e ->> 's' = '42501' and v_j ->> 's' = '42501', jsonb_build_array(v_n, v_e, v_j)));
  v_e := pg_temp.srv_falla(format('select public.registrar_factura_medio_srv(%L, %L, %L, %L, %L)', liq_f, 'FE-77',
                                  'liquidacion/' || liq_f || '/factura/fe-77.pdf', u_ms, s_ms));
  v_j := pg_temp.srv_falla(format('select public.registrar_factura_medio_srv(%L, %L, %L, %L, %L)', liq_s, 'FE-1',
                                  'liquidacion/' || liq_s || '/factura/x.pdf', u_fin, s_fin));
  perform pg_temp.srv(format('select public.registrar_factura_medio_srv(%L, %L, %L, %L, %L)', liq_f, 'fe-77',
                             'liquidacion/' || liq_f || '/factura/fe-77.pdf', u_mf, s_mf));
  r := r || jsonb_build_object('e2_registra_su_factura_solo_el_dueno',
    pg_temp.ok(v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_j ->> 'd' = 'Este medio no factura: su pago lleva documento soporte.'
               and (select numero_factura_medio = 'FE-77' and factura_medio_path = 'liquidacion/' || liq_f || '/factura/fe-77.pdf'
                    from public.liquidaciones where id = liq_f), jsonb_build_array(v_e, v_j)));
  r := r || jsonb_build_object('e3_finanzas_sabe_que_ya_puede_pagar',
    pg_temp.ok((select count(*) = 1 from public.notificaciones where usuario_id = u_fin and tipo = 'cola.factura_medio_cargada'
                and entidad_id = liq_f::text)
               and not exists (select 1 from public.notificaciones where usuario_id = u_adm and tipo = 'cola.factura_medio_cargada'),
               null));

  -- ── (f) Dispersión en dos pasos (LIQ-005) ──────────────────────────────────────────────────────────────────────
  v_e := pg_temp.srv_falla(format('select public.datos_dispersion_srv(array[%L]::uuid[], %L, %L)', liq_s, u_tes, s_tes));
  r := r || jsonb_build_object('f1_dice_que_falta_datos_reservados', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO', null, 'datos_sensibles.ver'));
  v_e := pg_temp.srv_falla(format('select public.datos_dispersion_srv(array[%L, %L, %L]::uuid[], %L, %L)', liq_s, liq_f, liq_x,
                                  u_fin, s_fin));
  r := r || jsonb_build_object('f2_datos_de_pago_incompletos',
    pg_temp.ok(v_e ->> 'h' = 'datos_pago_incompletos' and v_e ->> 'd' like '%Medio Humo X%', v_e));
  v_n := pg_temp.srv(format('select count(*) from public.datos_dispersion_srv(array[%L, %L]::uuid[], %L, %L)
                             where datos_pago_cifrados is not null and numero_documento_cifrado is not null',
                            liq_s, liq_f, u_fin, s_fin));
  r := r || jsonb_build_object('f3_revela_y_registra_uno_por_medio',
    pg_temp.ok(v_n = 2 and (select count(*) = 2 from public.bitacora where accion = 'REVELAR_DATO' and entidad = 'medios_privado'
                            and entidad_id in (me_s::text, me_f::text) and metadatos ->> 'origen' = 'dispersion'),
               to_jsonb(v_n)));
  v_txt := format('select public.registrar_dispersion_srv(%L, array[%L, %L]::uuid[], %L, %L, %L)', disp, liq_s, liq_f,
                  'dispersion/' || disp || '/pagos.csv', u_fin, s_fin);
  v_e := pg_temp.srv_falla(v_txt);
  insert into storage.objects (bucket_id, name, metadata)
  values ('soportes', 'dispersion/' || disp || '/pagos.csv', '{"mimetype": "text/csv", "size": 200}');
  perform pg_temp.srv(v_txt);
  v_j := pg_temp.srv(v_txt);
  r := r || jsonb_build_object('f4_registra_la_dispersion',
    pg_temp.ok(v_e ->> 'h' = 'archivo_no_cargado' and v_j #>> '{}' = disp::text
               and (select count(*) = 1 from public.bitacora where accion = 'EXPORTAR' and entidad = 'dispersiones'
                    and entidad_id = disp::text)
               and (select cantidad_liquidaciones = 2 and monto_total = 7442720 + 760272 from public.dispersiones where id = disp)
               and (select count(*) = 2 from public.liquidaciones where dispersion_id = disp), v_e));
  v_txt := pg_temp.como(c_fin, 'authenticated', format('select string_agg(nombre, '','') from public.nombres_equipo(array[%L, %L]::uuid[])',
                                                        u_fin, u_ms)) #>> '{}';
  v_n := pg_temp.como(c_ms, 'authenticated', format('select count(*) from public.nombres_equipo(array[%L]::uuid[])', u_fin));
  r := r || jsonb_build_object('f6_nombres_del_equipo_solo_internos', pg_temp.ok(v_txt = 'Fabio Finanzas' and v_n = 0,
                                                                                 jsonb_build_array(v_txt, v_n)));
  v_e := pg_temp.srv_falla(format('select public.datos_dispersion_srv(array[%L]::uuid[], %L, %L)', liq_s, u_fin, s_fin));
  v_n := pg_temp.srv(format('select count(*) from public.datos_dispersion_srv(array[%L]::uuid[], %L, %L, true)', liq_s, u_fin, s_fin));
  r := r || jsonb_build_object('f5_no_se_dispersa_dos_veces_sin_confirmar',
    pg_temp.ok(v_e ->> 'h' = 'ya_dispersada' and v_n = 1, v_e));

  -- ── (g) Pago con soporte cargado (LIQ-006) ─────────────────────────────────────────────────────────────────────
  v_txt := format('select public.registrar_pago_liquidacion_srv(%L, %L, %L, %L, %L, %L)', liq_s, v_hoy, 'TRX-S',
                  'liquidacion/' || liq_s || '/pago/s.pdf', u_fin, s_fin);
  v_e := pg_temp.srv_falla(v_txt);
  perform pg_temp.subir('liquidacion/' || liq_s || '/pago/s.pdf');
  v_j := pg_temp.srv_falla(format('select public.registrar_pago_liquidacion_srv(%L, %L, %L, %L, %L, %L)', liq_s, v_hoy + 1, 'TRX-S',
                                  'liquidacion/' || liq_s || '/pago/s.pdf', u_fin, s_fin));
  perform pg_temp.srv(v_txt);
  r := r || jsonb_build_object('g1_pago_con_soporte_y_fecha_valida',
    pg_temp.ok(v_e ->> 'h' = 'soporte_no_cargado' and v_j ->> 'h' = 'fecha_pago'
               and (select estado = 'PAGADA' and fecha_pago = v_hoy and referencia_pago = 'TRX-S' from public.liquidaciones where id = liq_s)
               and (select bool_and(estado = 'PAGADA') from public.asignaciones where id in (a_s1, a_s2))
               and exists (select 1 from public.notificaciones where usuario_id = u_ms and tipo = 'liquidacion.pagada'
                           and entidad_id = liq_s::text), jsonb_build_array(v_e, v_j)));
  perform pg_temp.subir('liquidacion/' || liq_f || '/pago/f.pdf');
  perform pg_temp.srv(format('select public.registrar_pago_liquidacion_srv(%L, %L, %L, %L, %L, %L)', liq_f, v_hoy, 'TRX-F',
                             'liquidacion/' || liq_f || '/pago/f.pdf', u_fin, s_fin));
  r := r || jsonb_build_object('g2_pago_del_medio_que_factura',
    pg_temp.ok((select estado = 'PAGADA' from public.liquidaciones where id = liq_f), null));
  v_e := pg_temp.srv_falla(format('update public.liquidaciones set referencia_pago = ''OTRA'' where id = %L', liq_x));
  v_j := pg_temp.falla(c_fin, 'authenticated', format('update public.liquidaciones set referencia_pago = ''OTRA'' where id = %L', liq_x));
  r := r || jsonb_build_object('g3_la_liquidacion_solo_la_cambia_la_plataforma',
    pg_temp.ok(v_e ->> 'e' = 'AMO_NO_AUTORIZADO' and v_j ->> 's' = '42501', jsonb_build_array(v_e, v_j)));

  -- ── (h) Lo que ve el medio (MED-015, CFG-004) ──────────────────────────────────────────────────────────────────
  update public.configuracion set valor = 'false' where clave = 'comision.visible_para_medio';
  v_j := pg_temp.como(c_ms, 'authenticated', format('select to_jsonb(x) from public.mis_liquidaciones_medio() x where x.id = %L', liq_s));
  r := r || jsonb_build_object('h1_sus_liquidaciones_sin_comision',
    pg_temp.ok(v_j ->> 'monto_bruto' is null and v_j ->> 'monto_comision' is null and (v_j ->> 'monto_medio')::numeric = 8000000
               and (v_j ->> 'retefuente')::numeric = 480000 and (v_j ->> 'reteica')::numeric = 77280
               and (v_j ->> 'monto_neto')::numeric = 7442720 and v_j ->> 'estado' = 'PAGADA' and v_j ->> 'documento_numero' = 'DSF2'
               and v_j ->> 'enviada_banco_at' is not null and v_j ->> 'soporte_pago_path' = 'liquidacion/' || liq_s || '/pago/s.pdf',
               v_j));
  v_n := pg_temp.como(c_ms, 'authenticated', format('select count(*) from public.lineas_liquidacion_medio(%L) where monto_bruto is null', liq_s));
  v_m := pg_temp.como(c_ms, 'authenticated', format('select count(*) from public.lineas_liquidacion_medio(%L)', liq_f));
  r := r || jsonb_build_object('h2_detalle_solo_de_lo_suyo', pg_temp.ok(v_n = 2 and v_m = 0, jsonb_build_array(v_n, v_m)));
  v_j := pg_temp.como(c_ms, 'authenticated', 'select to_jsonb(x) from public.resumen_ganancias_medio() x');
  r := r || jsonb_build_object('h3_resumen_de_ganancias',
    pg_temp.ok((v_j ->> 'pagado_historico')::numeric = 7442720 and (v_j ->> 'retenciones_historicas')::numeric = 557280
               and (v_j ->> 'por_pagar')::numeric = 0 and (v_j ->> 'por_liquidar')::numeric = 0
               and (v_j ->> 'requiere_documento_soporte')::boolean and not (v_j ->> 'comision_visible')::boolean
               and v_j ->> 'periodicidad' = 'QUINCENAL' and (v_j ->> 'dias_pago')::integer = 8, v_j));
  v_e := pg_temp.falla(c_fin, 'authenticated', 'select * from public.resumen_ganancias_medio()');
  r := r || jsonb_build_object('h4_resumen_solo_del_medio', pg_temp.es(v_e, 'AMO_NO_AUTORIZADO'));
  v_n := pg_temp.como(c_ms, 'authenticated', 'select (select count(*) from public.liquidaciones) + (select count(*) from public.documentos_soporte)');
  v_ok := pg_temp.como(c_ms, 'authenticated', format('select private.soy_dueno_soporte(''documento_soporte'', %L)', ds2))::boolean;
  r := r || jsonb_build_object('h5_sin_tablas_pero_con_sus_archivos', pg_temp.ok(v_n = 0 and v_ok, jsonb_build_array(v_n, v_ok)));
  update public.configuracion set valor = 'true' where clave = 'comision.visible_para_medio';

  -- ── (i) Facturas al anunciante (LIQ-008, ANU-013, D16/D37 del RF) ───────────────────────────────────────────────
  v_j := pg_temp.como(c_fin, 'authenticated', format(
    'select to_jsonb(x) from public.pendientes_facturacion(%L) x where x.anunciante_id = %L', v_hoy, an_v));
  v_n := pg_temp.como(c_an, 'authenticated', format('select count(*) from public.pendientes_facturacion(%L)', v_hoy));
  r := r || jsonb_build_object('i0_por_facturar',
    pg_temp.ok((v_j ->> 'asignaciones')::integer = 4 and (v_j ->> 'monto_bruto')::numeric = 12000000
               and (v_j ->> 'campana_id')::uuid = c_v and v_n = 0, v_j));
  f1 := pg_temp.srv(format('select public.generar_factura_srv(%L, null, %L, %L, %L, %L)', an_v, v_hoy - 30, v_hoy, u_fin, s_fin)) #>> '{}';
  r := r || jsonb_build_object('i1_borrador_desde_las_asignaciones',
    pg_temp.ok((select estado = 'BORRADOR' and subtotal = 12000000 and iva = 2280000 and total = 14280000 and saldo = 14280000
                       and esquema = 'COMPRA_REVENTA' and porcentaje_iva = 0.19 and periodo_desde = v_hoy - 30 and campana_id is null
                from public.facturas where id = f1)
               and (select count(*) = 4 from public.asignaciones where factura_id = f1),
               (select to_jsonb(f) from public.facturas f where f.id = f1)));
  v_n := pg_temp.como(c_an, 'authenticated', format('select count(*) from public.facturas where id = %L', f1));
  v_ok := pg_temp.como(c_an, 'authenticated', format('select private.soy_dueno_soporte(''factura'', %L)', f1))::boolean;
  r := r || jsonb_build_object('i2_el_anunciante_no_ve_borradores', pg_temp.ok(v_n = 0 and not v_ok, jsonb_build_array(v_n, v_ok)));
  v_e := pg_temp.srv_falla(format('select public.generar_factura_srv(%L, null, %L, %L, %L, %L)', an_v, v_hoy - 30, v_hoy, u_fin, s_fin));
  r := r || jsonb_build_object('i3_nada_que_facturar', pg_temp.es(v_e, 'AMO_TRANSICION_INVALIDA', null, 'sin_asignaciones'));
  v_txt := 'select public.registrar_factura_expedida_srv(%L, %L, %s, %L, %L, null, %s, %L, %L, %L)';
  v_j := jsonb_build_array(
    pg_temp.srv_falla(format(v_txt, f1, 'FVF', 1, repeat('e', 96), v_hoy, 14280001, 'factura/' || f1 || '/FVF1.pdf', u_fin, s_fin)) ->> 'h',
    pg_temp.srv_falla(format(v_txt, f1, 'FVF', 500, repeat('e', 96), v_hoy, 14280000, 'factura/' || f1 || '/FVF1.pdf', u_fin, s_fin)) ->> 'e',
    pg_temp.srv_falla(format(v_txt, f1, 'FVF', 1, 'CUFE-CORTO', v_hoy, 14280000, 'factura/' || f1 || '/FVF1.pdf', u_fin, s_fin)) ->> 'h',
    pg_temp.srv_falla(format(v_txt, f1, 'FVF', 1, repeat('e', 96), v_hoy, 14280000, 'factura/' || f1 || '/FVF1.pdf', u_fin, s_fin)) ->> 'h');
  r := r || jsonb_build_object('i4_validaciones_de_la_factura_expedida',
    pg_temp.ok(v_j = '["total_distinto", "AMO_RESOLUCION_AGOTADA", "cufe_formato", "archivo_no_cargado"]'::jsonb, v_j));
  perform pg_temp.subir('factura/' || f1 || '/FVF1.pdf');
  perform pg_temp.srv(format(v_txt, f1, 'fvf', 1, upper(repeat('e', 96)), v_hoy, 14280000, 'factura/' || f1 || '/FVF1.pdf', u_fin, s_fin));
  v_n := pg_temp.como(c_an, 'authenticated', format('select count(*) from public.facturas where id = %L', f1));
  r := r || jsonb_build_object('i5_factura_expedida_visible',
    pg_temp.ok((select estado = 'EMITIDA' and numero = 'FVF1' and fecha_vencimiento = v_hoy + 30 and cufe = repeat('e', 96)
                from public.facturas where id = f1)
               and v_n = 1
               and exists (select 1 from public.notificaciones where usuario_id = u_an and tipo = 'factura.emitida'
                           and entidad_id = f1::text), to_jsonb(v_n)));
  v_e := pg_temp.srv_falla(format('select public.transicionar_srv(''facturas'', %L, ''ANULADA'', %L, %L, ''Error de valor'')', f1, u_fin, s_fin));
  begin
    perform private.aplicar_transicion('facturas', f1, 'ANULADA', 'ADMIN', u_fin, 'Sin nota crédito');
    v_j := '"NO FALLÓ"';
  exception when others then
    get stacked diagnostics v_txt = pg_exception_hint;
    v_j := to_jsonb(v_txt);
  end;
  r := r || jsonb_build_object('i6_expedida_no_se_anula_sin_nota_credito',
    pg_temp.ok(v_e ->> 'e' = 'AMO_TRANSICION_INVALIDA' and v_e ->> 'h' = 'facturas:EMITIDA→ANULADA'
               and v_j = '"requiere_nota_credito"', jsonb_build_array(v_e, v_j)));
  v_txt := 'select public.registrar_pago_anunciante_srv(%L, %L, %s, ''TRANSFERENCIA'', ''R-1'', %L, %L, %L, %s)';
  v_e := pg_temp.srv_falla(format(v_txt, f1, v_hoy, 10000000, 'pago/' || f1 || '/p1.pdf', u_fin, s_fin, 280000));
  perform pg_temp.subir('pago/' || f1 || '/p1.pdf');
  v_j := pg_temp.srv_falla(format(v_txt, f1, v_hoy + 1, 10000000, 'pago/' || f1 || '/p1.pdf', u_fin, s_fin, 280000));
  perform pg_temp.srv(format(v_txt, f1, v_hoy, 10000000, 'pago/' || f1 || '/p1.pdf', u_fin, s_fin, 280000));
  r := r || jsonb_build_object('i7_pago_con_retenciones_y_soporte',
    pg_temp.ok(v_e ->> 'h' = 'soporte_no_cargado' and v_j ->> 'h' = 'fecha_pago'
               and (select estado = 'PAGADA_PARCIAL' and pagado = 10280000 and saldo = 4000000 from public.facturas where id = f1)
               and (select monto = 10000000 and valor_retenciones = 280000 from public.pagos_anunciante where factura_id = f1),
               jsonb_build_array(v_e, v_j)));
  -- Nota crédito parcial: rebaja el saldo y libera la asignación indicada.
  perform pg_temp.subir('factura/' || f1 || '/NC-1.pdf');
  v_txt := 'select public.registrar_nota_credito_srv(%L, %L, %L, %L, %s, %L, %L, %L::uuid[], %L, %L)';
  v_e := pg_temp.srv_falla(format(v_txt, f1, 'NC-1', repeat('f', 96), v_hoy, 1000000, 'Ajuste por permanencia incompleta',
                                  'factura/' || f1 || '/NC-1.pdf', array[a_s1, gen_random_uuid()], u_fin, s_fin));
  perform pg_temp.srv(format(v_txt, f1, 'nc-1', repeat('f', 96), v_hoy, 1000000, 'Ajuste por permanencia incompleta',
                             'factura/' || f1 || '/NC-1.pdf', array[a_x1], u_fin, s_fin));
  v_j := pg_temp.srv_falla(format(v_txt, f1, 'NC-1', repeat('a', 96), v_hoy, 100, 'Otra nota con el mismo número',
                                  'factura/' || f1 || '/NC-1.pdf', null, u_fin, s_fin));
  r := r || jsonb_build_object('i8_nota_credito_parcial',
    pg_temp.ok(v_e ->> 'd' = 'Alguna asignación indicada no pertenece a la factura.'
               and v_j ->> 'd' = 'Ese número o ese CUDE ya están registrados en otra nota crédito.'
               and (select estado = 'PAGADA_PARCIAL' and valor_notas_credito = 1000000 and saldo = 3000000 from public.facturas where id = f1)
               and (select factura_id is null from public.asignaciones where id = a_x1)
               and (select not anula_factura and numero = 'NC-1' from public.notas_credito where factura_id = f1)
               and exists (select 1 from public.notificaciones where usuario_id = u_an and tipo = 'factura.nota_credito'),
               jsonb_build_array(v_e, v_j)));
  -- Nota crédito total sobre una factura sin pagos: queda ANULADA y libera sus asignaciones.
  f2 := pg_temp.srv(format('select public.generar_factura_srv(%L, null, %L, %L, %L, %L)', an_v, v_hoy - 30, v_hoy, u_fin, s_fin)) #>> '{}';
  perform pg_temp.subir('factura/' || f2 || '/FVF2.pdf');
  perform pg_temp.srv(format('select public.registrar_factura_expedida_srv(%L, ''FVF'', 2, %L, %L, null, 1190000, %L, %L, %L)', f2,
                             repeat('1', 96), v_hoy, 'factura/' || f2 || '/FVF2.pdf', u_fin, s_fin));
  perform pg_temp.subir('factura/' || f2 || '/NC-2.pdf');
  perform pg_temp.srv(format(v_txt, f2, 'NC-2', repeat('2', 96), v_hoy, 1190000, 'Anulación total de la factura',
                             'factura/' || f2 || '/NC-2.pdf', null, u_fin, s_fin));
  r := r || jsonb_build_object('i9_nota_credito_total_anula',
    pg_temp.ok((select estado = 'ANULADA' and saldo = 0 and anulada_at is not null from public.facturas where id = f2)
               and (select factura_id is null from public.asignaciones where id = a_x1)
               and (select anula_factura from public.notas_credito where factura_id = f2)
               and exists (select 1 from public.notificaciones where usuario_id = u_an and tipo = 'factura.anulada'
                           and entidad_id = f2::text), null));
  -- Anular un borrador también libera sus asignaciones.
  f3 := pg_temp.srv(format('select public.generar_factura_srv(%L, null, %L, %L, %L, %L)', an_v, v_hoy - 30, v_hoy, u_fin, s_fin)) #>> '{}';
  perform pg_temp.srv(format('select public.transicionar_srv(''facturas'', %L, ''ANULADA'', %L, %L, ''Borrador con error'')', f3, u_fin, s_fin));
  r := r || jsonb_build_object('i10_borrador_anulado_libera',
    pg_temp.ok((select estado = 'ANULADA' from public.facturas where id = f3)
               and (select factura_id is null from public.asignaciones where id = a_x1), null));
  -- Esquema de mandato: IVA solo sobre la comisión; el valor del medio va como ingreso para terceros.
  update public.configuracion set valor = '"MANDATO"' where clave = 'facturacion.esquema';
  f4 := pg_temp.srv(format('select public.generar_factura_srv(%L, %L, %L, %L, %L, %L)', an_v, c_v, v_hoy - 30, v_hoy, u_fin, s_fin)) #>> '{}';
  update public.configuracion set valor = '"COMPRA_REVENTA"' where clave = 'facturacion.esquema';
  r := r || jsonb_build_object('i11_esquema_de_mandato',
    pg_temp.ok((select esquema = 'MANDATO' and subtotal = 200000 and iva = 38000 and valor_terceros = 800000 and total = 1038000
                       and campana_id = c_v from public.facturas where id = f4), (select to_jsonb(f) from public.facturas f where f.id = f4)));
  v_n := pg_temp.como(c_an, 'authenticated', format('select count(*) from public.facturas where anunciante_id = %L', an_v));
  v_m := pg_temp.como(c_an, 'authenticated', format('select count(*) from public.notas_credito where anunciante_id = %L', an_v));
  r := r || jsonb_build_object('i12_el_anunciante_ve_expedidas_y_notas', pg_temp.ok(v_n = 2 and v_m = 2, jsonb_build_array(v_n, v_m)));

  -- ── (j) Cartera y finanzas con notas crédito y retenciones (ADM-004) ───────────────────────────────────────────
  v_j := pg_temp.como(c_fin, 'authenticated', format(
    'select to_jsonb(x) from public.reporte_cartera(%L) x where x.anunciante_id = %L', v_hoy, an_v));
  r := r || jsonb_build_object('j1_cartera',
    pg_temp.ok((v_j ->> 'facturado')::numeric = 13280000 and (v_j ->> 'pagado')::numeric = 10280000
               and (v_j ->> 'saldo')::numeric = 3000000, v_j));
  v_j := pg_temp.como(c_fin, 'authenticated', format(
    'select to_jsonb(x) from public.reporte_finanzas(%L, %L, ''anunciante'') x where x.grupo_id = %L', v_hoy - 1, v_hoy, an_v));
  r := r || jsonb_build_object('j2_finanzas',
    pg_temp.ok((v_j ->> 'facturado')::numeric = 13280000 and (v_j ->> 'recaudado')::numeric = 10000000
               and (v_j ->> 'cartera')::numeric = 3000000, v_j));

  -- ── (k) Estructura ─────────────────────────────────────────────────────────────────────────────────────────────
  r := r || jsonb_build_object('k1_transiciones_146', (select count(*) = 146 from private.transiciones_estado));
  begin
    insert into public.retenciones_config (tipo, concepto, aplica_declarante, tarifa, base_minima_uvt, vigente_desde)
    values ('RETEFUENTE', 'PUBLICIDAD', true, 0.11, 4, date '2026-01-01');
    v_j := '"NO FALLÓ"';
  exception when exclusion_violation then v_j := 'true';
  end;
  r := r || jsonb_build_object('k2_un_concepto_vigente_por_tipo', v_j);
  begin
    update public.notas_credito set valor = 1 where factura_id = f1;
    v_j := '"NO FALLÓ"';
  exception when others then v_j := to_jsonb(sqlerrm = 'AMO_BITACORA_INMUTABLE');
  end;
  r := r || jsonb_build_object('k3_notas_credito_inmutables', v_j);
  r := r || jsonb_build_object('k4_lista_blanca', 'puedo_subir_factura_medio' = any (private.lista_blanca_authenticated()));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
