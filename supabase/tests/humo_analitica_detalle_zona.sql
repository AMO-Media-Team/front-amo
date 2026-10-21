-- Pruebas de humo de `analitica_detalle_zona` (public.detalle_zona_geo, docs/modelo-datos.md §5.9): con un
-- conjunto pequeño y conocido (julio y agosto de 2026 contra los 62 días anteriores) verifica las tres secciones
-- (kpi, serie mensual y medios destacados), que cada KPI coincide con `geo_metricas`, el n mínimo de las tasas, el
-- recorte de los meses al periodo, el tope de 36 meses, los tres niveles, los permisos (analitica.mapa, accesos.ver,
-- AAL) y los errores de parámetros.
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte. El umbral
-- analitica.n_minimo_tasas se baja a 2 dentro de la transacción. Cada prueba deja `true` si pasa o lo observado.
begin;
-- Límite del lado del servidor: la suite retira los datos demo dentro de la transacción (unos 15 s con el juego demo
-- actual) y mientras tanto los mantiene bloqueados. Si no termina a tiempo (p. ej. espera a otra transacción), se
-- cancela y revierte en vez de seguir viva cuando el cliente (MCP) ya dejó de esperar. No ejecutar en paralelo con
-- otra suite que también purgue.
set local statement_timeout = '45s';

do $humo$
declare
  r jsonb := '{}';
  v_j jsonb;
  v_n bigint;
  v_e text;
  v_pob integer := (select d.poblacion from public.departamentos d where d.codigo = '05');
  u_adm constant uuid := '00000000-0000-4000-a000-000000000d01';
  u_fin constant uuid := '00000000-0000-4000-a000-000000000d02';
  u_ana constant uuid := '00000000-0000-4000-a000-000000000d03';
  s_adm1 constant uuid := '00000000-0000-4000-b000-000000000d00';
  s_adm constant uuid := '00000000-0000-4000-b000-000000000d01';
  s_fin constant uuid := '00000000-0000-4000-b000-000000000d02';
  s_ana constant uuid := '00000000-0000-4000-b000-000000000d03';
  an_a constant uuid := '00000000-0000-4000-c000-000000000d01';   -- Bogotá
  an_b constant uuid := '00000000-0000-4000-c000-000000000d02';   -- Medellín
  me_a constant uuid := '00000000-0000-4000-d000-000000000d01';   -- Medellín, verificado el 15 de julio
  me_b constant uuid := '00000000-0000-4000-d000-000000000d02';   -- Cali
  me_c constant uuid := '00000000-0000-4000-d000-000000000d03';   -- Bello
  cu_a constant uuid := '00000000-0000-4000-e000-000000000d01';
  cu_b constant uuid := '00000000-0000-4000-e000-000000000d02';
  cu_c constant uuid := '00000000-0000-4000-e000-000000000d03';
  c1 constant uuid := '00000000-0000-4000-f000-000000000d01';
  c2 constant uuid := '00000000-0000-4000-f000-000000000d02';
  o1 constant uuid := '00000000-0000-4000-f000-000000000d11';
  o2 constant uuid := '00000000-0000-4000-f000-000000000d12';
  a1 constant uuid := '00000000-0000-4000-f000-000000000d21';
  a2 constant uuid := '00000000-0000-4000-f000-000000000d22';
  a3 constant uuid := '00000000-0000-4000-f000-000000000d23';
  a4 constant uuid := '00000000-0000-4000-f000-000000000d24';
  a5 constant uuid := '00000000-0000-4000-f000-000000000d25';
  a6 constant uuid := '00000000-0000-4000-f000-000000000d26';
  a7 constant uuid := '00000000-0000-4000-f000-000000000d27';
  c_adm1 text; c_adm text; c_fin text; c_ana text;
  v_sector uuid := (select id from public.sectores where nombre_normalizado = 'retail y comercio');
  f_post uuid := (select id from public.formatos where plataforma = 'INSTAGRAM' and clave = 'POST_FEED');
  fr1 uuid := (select id from public.franjas where clave = 'F1');
  v_tarifa uuid := (select t.id from public.tarifas t join public.formatos f on f.id = t.formato_id
                    join public.franjas fr on fr.id = t.franja_id
                    where f.plataforma = 'INSTAGRAM' and f.clave = 'POST_FEED' and fr.clave = 'F1'
                    order by t.vigente_desde desc limit 1);
begin
  -- ── Preparación (owner, modo_carga) ─────────────────────────────────────────────────────────────────
  update public.configuracion set valor = to_jsonb(2) where clave = 'analitica.n_minimo_tasas';
  perform set_config('amo.modo_carga', 'on', true);
  -- La suite compara valores exactos de toda la zona (KPI, serie y medios destacados): los datos demo que traiga la BD
  -- se retiran dentro de esta transacción con la purga de la propia BD; el rollback final los restaura.
  perform set_config('amo.purga', 'on', true);
  perform private.purgar_demo();
  perform set_config('amo.purga', '', true);
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, now(), now(), now()
  from (values (u_adm, 'humodz.adm@amo.test'), (u_fin, 'humodz.fin@amo.test'), (u_ana, 'humodz.ana@amo.test')) x (u, e);
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, municipio_codigo,
                                  estado_verificacion, verificado_at)
  values (an_a, 'Humo Zona A S.A.S.', 'Humo Zona A', '900000951', '1', v_sector, '11001', 'VERIFICADO', '2026-04-01'),
         (an_b, 'Humo Zona B S.A.S.', 'Humo Zona B', '900000952', '1', v_sector, '05001', 'VERIFICADO', '2026-04-01');
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  values (me_a, 'Medio Zona A', 'PAGINA_NOTICIAS', '05001', 'VERIFICADO', 1, '2026-07-15 15:00+00'),
         (me_b, 'Medio Zona B', 'CREADOR', '76001', 'VERIFICADO', 1, '2026-05-01 15:00+00'),
         (me_c, 'Medio Zona C', 'CREADOR', '05088', 'VERIFICADO', 1, '2026-05-01 15:00+00');
  -- Cuatro medios más en Cali para probar el tope de 5 destacados.
  insert into public.medios (id, nombre, tipo, municipio_codigo, estado, nivel_verificacion, verificado_at)
  select ('00000000-0000-4000-d000-000000000d1' || i)::uuid, 'Medio Zona X' || i, 'CREADOR', '76001', 'VERIFICADO', 1,
         '2026-05-01 15:00+00'
  from generate_series(1, 4) i;
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  values (cu_a, me_a, 'INSTAGRAM', 'humodz_a', 'https://instagram.com/humodz_a', 45000, fr1, true, 'MANUAL', now()),
         (cu_b, me_b, 'INSTAGRAM', 'humodz_b', 'https://instagram.com/humodz_b', 45000, fr1, true, 'MANUAL', now()),
         (cu_c, me_c, 'INSTAGRAM', 'humodz_c', 'https://instagram.com/humodz_c', 45000, fr1, true, 'MANUAL', now());
  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
                                       metodo_verificacion, fecha_ultima_verificacion)
  select ('00000000-0000-4000-e000-000000000d1' || i)::uuid, ('00000000-0000-4000-d000-000000000d1' || i)::uuid, 'INSTAGRAM',
         'humodz_x' || i, 'https://instagram.com/humodz_x' || i, 45000, fr1, true, 'MANUAL', now()
  from generate_series(1, 4) i;
  insert into public.medio_audiencia_paises (medio_id, pais_iso2, porcentaje, fuente)
  values (me_a, 'CO', 90, 'DECLARADA'), (me_a, 'US', 10, 'DECLARADA');
  update public.perfiles p set rol_id = (select id from public.roles where clave = x.rol), estado = 'ACTIVO',
         debe_cambiar_password = false, anunciante_id = x.anunciante
  from (values (u_adm, 'ADMIN', null::uuid), (u_fin, 'FINANZAS', null), (u_ana, 'ANUNCIANTE', an_a)) as x (id, rol, anunciante)
  where p.id = x.id;
  insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
    (s_adm1, u_adm, now(), now(), 'aal1'), (s_adm, u_adm, now(), now(), 'aal2'), (s_fin, u_fin, now(), now(), 'aal2'),
    (s_ana, u_ana, now(), now(), 'aal1');
  insert into public.campanas (id, anunciante_id, nombre, marca, fecha_inicio, fecha_fin, presupuesto_total, estado, activada_at)
  values (c1, an_a, 'Campaña Zona', 'Marca Humo', '2026-06-01', '2026-12-31', 50000000, 'ACTIVA', '2026-06-01 15:00+00'),
         (c2, an_b, 'Campaña Zona B', 'Marca Humo', '2026-07-01', '2026-12-31', 10000000, 'ACTIVA', '2026-07-01 15:00+00');
  insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, presupuesto_maximo,
                              tope_porcentaje_por_medio, cortes_requeridos, ventana_inicio, ventana_fin,
                              fecha_limite_aceptacion, estado, publicada_at, cupos_totales)
  values (o1, c1, an_a, 'Oferta Zona', f_post, 'INSTAGRAM', 20000000, 1, '{D7}', '2026-06-05 15:00+00',
          '2026-10-31 15:00+00', '2026-08-09 15:00+00', 'EN_EJECUCION', '2026-06-05 15:00+00', 20),
         (o2, c2, an_b, 'Oferta Zona B', f_post, 'INSTAGRAM', 5000000, 1, '{D7}', '2026-07-10 15:00+00',
          '2026-10-31 15:00+00', '2026-07-25 15:00+00', 'EN_EJECUCION', '2026-07-10 15:00+00', 5);
  insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales) values (o1, fr1, 20), (o2, fr1, 5);
  -- a1, a2, a7: cumplidas en Antioquia; a3: vencida (no consume cupo, sí cuenta en cumplimiento); a4: aceptada en
  -- julio por el anunciante de Medellín; a5: cumplida en Cali; a6: cumplida en junio (periodo anterior).
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, publicada_at, evidencia_validada_at, verificada_at, vencida_at, fecha_limite_publicacion, publicaciones,
    monto_bruto, tarifa_id, franja_id)
  values
    (a1, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 1, 'VERIFICADA', '2026-08-03 15:00+00', '2026-08-05 15:00+00',
     '2026-08-06 15:00+00', '2026-08-12 15:00+00', null, '2026-08-10 15:00+00', 1, 500000, v_tarifa, fr1),
    (a2, o1, c1, an_a, me_c, cu_c, 'INSTAGRAM', 1, 'VERIFICADA', '2026-08-04 15:00+00', '2026-08-06 15:00+00',
     '2026-08-07 15:00+00', '2026-08-14 15:00+00', null, '2026-08-12 15:00+00', 1, 300000, v_tarifa, fr1),
    (a3, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 2, 'VENCIDA_SIN_PUBLICAR', '2026-08-05 15:00+00', null, null, null,
     '2026-08-15 16:00+00', '2026-08-15 15:00+00', 1, 500000, v_tarifa, fr1),
    (a4, o2, c2, an_b, me_a, cu_a, 'INSTAGRAM', 1, 'ACEPTADA', '2026-07-20 15:00+00', null, null, null, null,
     '2026-10-20 15:00+00', 1, 250000, v_tarifa, fr1),
    (a5, o1, c1, an_a, me_b, cu_b, 'INSTAGRAM', 1, 'VERIFICADA', '2026-07-10 15:00+00', '2026-07-12 15:00+00',
     '2026-07-13 15:00+00', '2026-07-20 15:00+00', null, '2026-07-15 15:00+00', 1, 200000, v_tarifa, fr1),
    (a6, o1, c1, an_a, me_a, cu_a, 'INSTAGRAM', 3, 'VERIFICADA', '2026-06-10 15:00+00', '2026-06-12 15:00+00',
     '2026-06-13 15:00+00', '2026-06-20 15:00+00', null, '2026-06-15 15:00+00', 1, 100000, v_tarifa, fr1),
    (a7, o1, c1, an_a, me_c, cu_c, 'INSTAGRAM', 2, 'VERIFICADA', '2026-07-08 15:00+00', '2026-07-10 15:00+00',
     '2026-07-11 15:00+00', '2026-07-18 15:00+00', null, '2026-07-14 15:00+00', 1, 150000, v_tarifa, fr1);
  insert into public.asignaciones (id, oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot, estado,
    aceptada_at, fecha_limite_publicacion, publicaciones, monto_bruto, tarifa_id, franja_id)
  select ('00000000-0000-4000-f000-000000000d3' || i)::uuid, o1, c1, an_a, ('00000000-0000-4000-d000-000000000d1' || i)::uuid,
         ('00000000-0000-4000-e000-000000000d1' || i)::uuid, 'INSTAGRAM', 1, 'ACEPTADA', '2026-08-06 15:00+00',
         '2026-10-30 15:00+00', 1, 10000 * i, v_tarifa, fr1
  from generate_series(1, 4) i;
  insert into public.publicaciones (id, asignacion_id, numero, url_post, fecha_publicacion, captura_path,
                                    etiqueta_publicidad_confirmada, etiqueta_verificada, permanencia_hasta, estado_validacion)
  select ('00000000-0000-4000-f000-000000000d4' || x.i)::uuid, x.a, 1, 'https://www.instagram.com/p/humodz' || x.i || '/',
         x.fecha, 'asignacion/' || x.a || '/publicacion/1-c.webp', true, true, x.fecha + interval '7 days', 'APROBADA'
  from (values (1, a1, '2026-08-05 15:00+00'::timestamptz), (2, a2, '2026-08-06 15:00+00'), (5, a5, '2026-07-12 15:00+00'),
               (6, a6, '2026-06-12 15:00+00')) as x (i, a, fecha);
  insert into public.metricas (publicacion_id, corte, fecha_corte, alcance, impresiones, me_gusta, clics_enlace, captura_path,
                               estado_validacion, created_at)
  select ('00000000-0000-4000-f000-000000000d4' || x.i)::uuid, 'D7', x.fecha, x.alcance, x.alcance * 2, 100, 10,
         'asignacion/' || x.a || '/metrica/d7.webp', 'APROBADA', x.fecha
  from (values (1, a1, '2026-08-12 15:00+00'::timestamptz, 10000), (2, a2, '2026-08-13 15:00+00', 5000),
               (5, a5, '2026-07-19 15:00+00', 4000), (6, a6, '2026-06-19 15:00+00', 2000)) as x (i, a, fecha, alcance);
  insert into public.accesos (usuario_id, email_hash, evento, pais_iso2, departamento_codigo, municipio_codigo, created_at,
                              es_sospechoso, motivo_sospecha)
  values (u_adm, null, 'LOGIN_EXITOSO', 'CO', '05', '05001', '2026-08-10 13:00+00', false, null),
         (u_adm, null, 'LOGIN_EXITOSO', 'CO', '05', '05001', '2026-07-10 13:00+00', false, null),
         (u_adm, null, 'LOGIN_EXITOSO', 'CO', '05', '05001', '2026-06-10 13:00+00', false, null),
         (u_ana, null, 'LOGIN_EXITOSO', 'CO', '11', '11001', '2026-08-11 14:00+00', false, null),
         (u_adm, null, 'LOGIN_EXITOSO', 'US', null, null, '2026-08-12 15:00+00', false, null);
  perform set_config('amo.modo_carga', '', true);
  c_adm1 := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_adm1)::text;
  c_adm := jsonb_build_object('sub', u_adm, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_adm)::text;
  c_fin := jsonb_build_object('sub', u_fin, 'role', 'authenticated', 'aal', 'aal2', 'session_id', s_fin)::text;
  c_ana := jsonb_build_object('sub', u_ana, 'role', 'authenticated', 'aal', 'aal1', 'session_id', s_ana)::text;

  -- ── (a) Departamento: Antioquia, julio y agosto de 2026 ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_adm, true);
  execute 'set local role authenticated';
  select jsonb_object_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, ''), to_jsonb(d)) into v_j
  from public.detalle_zona_geo('departamento', '05', '2026-07-01', '2026-08-31') d;
  r := r || jsonb_build_object('a01_secciones_y_filas',
    (select count(*) filter (where k like 'kpi:%') = 8 and count(*) filter (where k like 'serie:%') = 16
            and count(*) filter (where k like 'medio:%') = 2 from jsonb_object_keys(v_j) k));
  r := r || jsonb_build_object('a02_formato',
    (select array_agg(x order by x) from jsonb_object_keys(v_j -> 'kpi:gmv') x)
      = array['clave', 'detalle', 'n', 'nombre', 'orden', 'periodo', 'seccion', 'unidad', 'valor', 'valor_anterior',
              'valor_por_100k', 'variacion']);
  r := r || jsonb_build_object('a03_kpi_gmv',
    (v_j -> 'kpi:gmv' ->> 'valor')::numeric = 1200000 and (v_j -> 'kpi:gmv' ->> 'n')::int = 4
    and (v_j -> 'kpi:gmv' ->> 'valor_anterior')::numeric = 100000 and (v_j -> 'kpi:gmv' ->> 'variacion')::numeric = 11
    and v_j -> 'kpi:gmv' ->> 'unidad' = 'COP' and v_j -> 'kpi:gmv' ->> 'nombre' = 'Antioquia'
    and (v_j -> 'kpi:gmv' ->> 'valor_por_100k')::numeric = round(1200000::numeric / v_pob * 100000, 2)
    and v_j -> 'kpi:gmv' -> 'periodo' = 'null'::jsonb);
  r := r || jsonb_build_object('a04_kpi_conteos',
    (v_j -> 'kpi:asignaciones' ->> 'valor')::numeric = 4 and (v_j -> 'kpi:asignaciones' ->> 'valor_anterior')::numeric = 1
    and (v_j -> 'kpi:campanas' ->> 'valor')::numeric = 2 and (v_j -> 'kpi:campanas' ->> 'valor_anterior')::numeric = 1
    and (v_j -> 'kpi:anunciantes' ->> 'valor')::numeric = 1 and (v_j -> 'kpi:anunciantes' ->> 'valor_anterior')::numeric = 0
    and v_j -> 'kpi:anunciantes' -> 'variacion' = 'null'::jsonb);
  r := r || jsonb_build_object('a05_kpi_alcance',
    (v_j -> 'kpi:alcance' ->> 'valor')::numeric = 15000 and (v_j -> 'kpi:alcance' ->> 'n')::int = 2
    and (v_j -> 'kpi:alcance' ->> 'valor_anterior')::numeric = 2000 and v_j -> 'kpi:alcance' ->> 'unidad' = 'personas');
  r := r || jsonb_build_object('a06_kpi_cumplimiento_n_minimo',
    (v_j -> 'kpi:cumplimiento' ->> 'valor')::numeric = 0.75 and (v_j -> 'kpi:cumplimiento' ->> 'n')::int = 4
    and v_j -> 'kpi:cumplimiento' -> 'valor_anterior' = 'null'::jsonb and v_j -> 'kpi:cumplimiento' -> 'variacion' = 'null'::jsonb
    and v_j -> 'kpi:cumplimiento' -> 'valor_por_100k' = 'null'::jsonb and v_j -> 'kpi:cumplimiento' ->> 'unidad' = '%');
  r := r || jsonb_build_object('a07_kpi_medios_foto',
    (v_j -> 'kpi:medios' ->> 'valor')::numeric = 2 and (v_j -> 'kpi:medios' ->> 'valor_anterior')::numeric = 1
    and (v_j -> 'kpi:medios' ->> 'variacion')::numeric = 1);
  r := r || jsonb_build_object('a08_kpi_accesos',
    (v_j -> 'kpi:accesos' ->> 'valor')::numeric = 2 and (v_j -> 'kpi:accesos' ->> 'valor_anterior')::numeric = 1);
  select count(*) into v_n
  from unnest(array['medios', 'gmv', 'alcance', 'cumplimiento', 'campanas', 'asignaciones', 'anunciantes', 'accesos']) m
  join lateral (select g.valor, g.n from public.geo_metricas('departamento', m, '2026-07-01', '2026-08-31') g
                where g.codigo = '05') g on true
  where (v_j -> ('kpi:' || m) ->> 'valor')::numeric is not distinct from g.valor
    and (v_j -> ('kpi:' || m) ->> 'n')::int = g.n;
  r := r || jsonb_build_object('a09_kpi_coincide_con_geo_metricas', case when v_n = 8 then 'true'::jsonb else to_jsonb(v_n) end);
  r := r || jsonb_build_object('a10_serie_gmv_suma_el_kpi',
    (v_j -> 'serie:gmv:2026-07-01' ->> 'valor')::numeric = 400000 and (v_j -> 'serie:gmv:2026-07-01' ->> 'n')::int = 2
    and (v_j -> 'serie:gmv:2026-08-01' ->> 'valor')::numeric = 800000 and v_j -> 'serie:gmv:2026-08-01' -> 'nombre' = 'null'::jsonb
    and v_j -> 'serie:gmv:2026-08-01' -> 'valor_anterior' = 'null'::jsonb);
  r := r || jsonb_build_object('a11_serie_cumplimiento_n_minimo',
    v_j -> 'serie:cumplimiento:2026-07-01' -> 'valor' = 'null'::jsonb and (v_j -> 'serie:cumplimiento:2026-07-01' ->> 'n')::int = 1
    and (v_j -> 'serie:cumplimiento:2026-08-01' ->> 'valor')::numeric = 0.666667
    and (v_j -> 'serie:cumplimiento:2026-08-01' ->> 'n')::int = 3);
  r := r || jsonb_build_object('a12_serie_otras_metricas',
    (v_j -> 'serie:medios:2026-07-01' ->> 'valor')::numeric = 2 and (v_j -> 'serie:medios:2026-08-01' ->> 'valor')::numeric = 2
    and (v_j -> 'serie:campanas:2026-07-01' ->> 'valor')::numeric = 2 and (v_j -> 'serie:campanas:2026-08-01' ->> 'valor')::numeric = 1
    and (v_j -> 'serie:anunciantes:2026-07-01' ->> 'valor')::numeric = 1 and (v_j -> 'serie:anunciantes:2026-08-01' ->> 'valor')::numeric = 0
    and (v_j -> 'serie:alcance:2026-07-01' ->> 'valor')::numeric = 0 and (v_j -> 'serie:alcance:2026-08-01' ->> 'valor')::numeric = 15000
    and (v_j -> 'serie:accesos:2026-07-01' ->> 'valor')::numeric = 1 and (v_j -> 'serie:accesos:2026-08-01' ->> 'valor')::numeric = 1
    and (v_j -> 'serie:asignaciones:2026-07-01' ->> 'valor')::numeric = 2);
  r := r || jsonb_build_object('a13_medios_destacados',
    (v_j -> ('medio:' || me_a) ->> 'valor')::numeric = 750000 and (v_j -> ('medio:' || me_a) ->> 'n')::int = 2
    and (v_j -> ('medio:' || me_a) ->> 'orden')::int = 1 and v_j -> ('medio:' || me_a) ->> 'nombre' = 'Medio Zona A'
    and v_j -> ('medio:' || me_a) ->> 'detalle' = 'Medellín (Antioquia)' and v_j -> ('medio:' || me_a) ->> 'unidad' = 'COP'
    and (v_j -> ('medio:' || me_c) ->> 'valor')::numeric = 450000 and (v_j -> ('medio:' || me_c) ->> 'orden')::int = 2
    and v_j -> ('medio:' || me_c) ->> 'detalle' = 'Bello (Antioquia)');

  -- ── (b) Meses recortados al periodo, tope de 36 meses y orden de las filas ──────────────────────────
  select jsonb_object_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, ''), to_jsonb(d)) into v_j
  from public.detalle_zona_geo('departamento', '05', '2026-07-15', '2026-08-04') d;
  r := r || jsonb_build_object('b01_meses_recortados_al_periodo',
    (v_j -> 'serie:gmv:2026-07-01' ->> 'valor')::numeric = 250000 and (v_j -> 'serie:gmv:2026-08-01' ->> 'valor')::numeric = 800000
    and (v_j -> 'kpi:gmv' ->> 'valor')::numeric = 1050000
    and (select count(*) = 16 from jsonb_object_keys(v_j) k where k like 'serie:%'));
  select count(*), min(d.periodo)::text into v_n, v_e
  from public.detalle_zona_geo('departamento', '05', '2022-01-01', '2026-08-31') d where d.seccion = 'serie' and d.clave = 'gmv';
  r := r || jsonb_build_object('b02_serie_maximo_36_meses',
    v_n = 36 and v_e = '2023-09-01'
    and (select d.valor = 1300000 from public.detalle_zona_geo('departamento', '05', '2022-01-01', '2026-08-31') d
         where d.seccion = 'kpi' and d.clave = 'gmv'));
  r := r || jsonb_build_object('b03_orden_de_las_filas',
    (select array_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, '') order by d.ordinality)
     from public.detalle_zona_geo('municipio', '05001', '2026-07-01', '2026-08-31') with ordinality d
     where d.seccion <> 'serie' or d.clave = 'medios')
      = array['kpi:medios', 'kpi:gmv', 'kpi:alcance', 'kpi:cumplimiento', 'kpi:campanas', 'kpi:asignaciones', 'kpi:anunciantes',
              'kpi:accesos', 'serie:medios:2026-07-01', 'serie:medios:2026-08-01', 'medio:' || me_a]);

  -- ── (c) Municipio y país ────────────────────────────────────────────────────────────────────────────
  select jsonb_object_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, ''), to_jsonb(d)) into v_j
  from public.detalle_zona_geo('municipio', '05001', '2026-07-01', '2026-08-31') d;
  r := r || jsonb_build_object('c01_municipio',
    (v_j -> 'kpi:gmv' ->> 'valor')::numeric = 750000 and (v_j -> 'kpi:gmv' ->> 'n')::int = 2
    and v_j -> 'kpi:gmv' ->> 'nombre' = 'Medellín' and v_j -> 'kpi:gmv' -> 'valor_por_100k' = 'null'::jsonb
    and (v_j -> 'kpi:medios' ->> 'valor')::numeric = 1 and (v_j -> 'kpi:accesos' ->> 'valor')::numeric = 2
    and not v_j ? 'kpi:audiencia' and not v_j ? ('medio:' || me_c));
  select jsonb_object_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, ''), to_jsonb(d)) into v_j
  from public.detalle_zona_geo('pais', ' co ', '2026-07-01', '2026-08-31') d;
  r := r || jsonb_build_object('c02_pais_colombia',
    (select count(*) = 9 from jsonb_object_keys(v_j) k where k like 'kpi:%')
    and (v_j -> 'kpi:gmv' ->> 'valor')::numeric = 1500000 and v_j -> 'kpi:gmv' ->> 'nombre' = 'Colombia'
    and (v_j -> 'kpi:audiencia' ->> 'valor')::numeric = 40500 and v_j -> 'kpi:audiencia' -> 'valor_anterior' = 'null'::jsonb
    and (v_j -> 'kpi:anunciantes' ->> 'valor')::numeric = 2 and (v_j -> 'kpi:accesos' ->> 'valor')::numeric = 3
    and not exists (select 1 from jsonb_object_keys(v_j) k where k like 'serie:audiencia:%'));
  r := r || jsonb_build_object('c03_pais_cinco_medios_destacados',
    (select array_agg(e.value ->> 'nombre' order by (e.value ->> 'orden')::int) from jsonb_each(v_j) e where e.key like 'medio:%')
      = array['Medio Zona A', 'Medio Zona C', 'Medio Zona B', 'Medio Zona X4', 'Medio Zona X3']);
  select jsonb_object_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, ''), to_jsonb(d)) into v_j
  from public.detalle_zona_geo('pais', 'US', '2026-07-01', '2026-08-31') d;
  r := r || jsonb_build_object('c04_pais_sin_medios',
    (v_j -> 'kpi:gmv' ->> 'valor')::numeric = 0 and (v_j -> 'kpi:audiencia' ->> 'valor')::numeric = 4500
    and (v_j -> 'kpi:accesos' ->> 'valor')::numeric = 1 and (v_j -> 'serie:accesos:2026-08-01' ->> 'valor')::numeric = 1
    and not exists (select 1 from jsonb_object_keys(v_j) k where k like 'medio:%'));

  -- ── (d) Permisos ────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_fin, true);
  select jsonb_object_agg(d.seccion || ':' || d.clave || coalesce(':' || d.periodo, ''), to_jsonb(d)) into v_j
  from public.detalle_zona_geo('departamento', '05', '2026-07-01', '2026-08-31') d;
  r := r || jsonb_build_object('d01_sin_accesos_ver_no_hay_accesos',
    (select count(*) filter (where k like 'kpi:%') = 7 and count(*) filter (where k like 'serie:%') = 14
            and count(*) filter (where k like '%:accesos%') = 0 from jsonb_object_keys(v_j) k)
    and (v_j -> 'kpi:gmv' ->> 'valor')::numeric = 1200000 and v_j ? ('medio:' || me_a));
  perform set_config('request.jwt.claims', c_ana, true);
  begin
    perform public.detalle_zona_geo('departamento', '05', '2026-07-01', '2026-08-31');
    r := r || jsonb_build_object('d02_anunciante_no_autorizado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d02_anunciante_no_autorizado', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  perform set_config('request.jwt.claims', c_adm1, true);
  begin
    perform public.detalle_zona_geo('departamento', '05', '2026-07-01', '2026-08-31');
    r := r || jsonb_build_object('d03_admin_aal1_no_autorizado', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('d03_admin_aal1_no_autorizado', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;

  -- ── (e) Parámetros inválidos ────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_adm, true);
  begin
    perform public.detalle_zona_geo('region', '05', '2026-07-01', '2026-08-31');
    r := r || jsonb_build_object('e01_nivel_invalido', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e01_nivel_invalido', sqlerrm = 'AMO_METRICA_NIVEL_INVALIDO');
  end;
  v_e := '';
  for v_n in 1..4 loop
    begin
      if v_n = 1 then perform public.detalle_zona_geo('departamento', '00', '2026-07-01', '2026-08-31');
      elsif v_n = 2 then perform public.detalle_zona_geo('municipio', '05', '2026-07-01', '2026-08-31');
      elsif v_n = 3 then perform public.detalle_zona_geo('pais', 'COL', '2026-07-01', '2026-08-31');
      else perform public.detalle_zona_geo('departamento', null, '2026-07-01', '2026-08-31'); end if;
      v_e := v_e || 'NO FALLÓ ';
    exception when others then
      if sqlerrm <> 'AMO_CONFIG_INVALIDA' then v_e := v_e || sqlerrm || ' '; end if;
    end;
  end loop;
  r := r || jsonb_build_object('e02_zona_inexistente', case when v_e = '' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    perform public.detalle_zona_geo('departamento', '05', '2026-08-31', '2026-07-01');
    r := r || jsonb_build_object('e03_periodo_invalido', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('e03_periodo_invalido', sqlerrm = 'AMO_CONFIG_INVALIDA');
  end;

  -- ── (f) Seguridad de la función ─────────────────────────────────────────────────────────────────────
  execute 'reset role';
  r := r || jsonb_build_object('f01_invoker_stable_bogota',
    (select not p.prosecdef and p.provolatile = 's' and 'search_path=""' = any(p.proconfig)
            and exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=america/bogota')
     from pg_proc p where p.oid = 'public.detalle_zona_geo(text, text, date, date)'::regprocedure));
  r := r || jsonb_build_object('f02_execute_solo_authenticated',
    has_function_privilege('authenticated', 'public.detalle_zona_geo(text, text, date, date)', 'execute')
    and not has_function_privilege('anon', 'public.detalle_zona_geo(text, text, date, date)', 'execute')
    and not has_function_privilege('service_role', 'public.detalle_zona_geo(text, text, date, date)', 'execute'));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
