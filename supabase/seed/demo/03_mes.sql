-- Datos demo · paso 03 · operación de un mes (docs/modelo-datos.md §10.2 paso 6 y §10.3)
-- private.demo_mes(mes, semilla): reverificaciones del mes → multiplicadores → campañas, ofertas, cupos y creativos →
-- vistas → aceptaciones con private.reservar_cupo (amo.reloj = instante de aceptación: precio y tarifa vigentes, cupos,
-- presupuestos, topes y exclusividad por la vía oficial) y rechazos → línea de tiempo de cada asignación (descarga,
-- evidencia, métricas, disputas, cancelaciones, vencimientos) truncada en el «hoy» de la demo → estados finales de
-- ofertas y campañas (los mismos que dejarían los jobs de pg_cron) → eventos para bitácora y notificaciones.
-- Una llamada por mes, cada una en su transacción con amo.modo_carga. Liquidaciones, facturas y pagos: 04_finanzas.sql.

-- Siete funciones pequeñas que comparten las tablas temporales de la transacción (cada definición se envía en una
-- llamada corta de MCP execute_sql): demo_mes_oferta (A–D) · demo_mes_tiempos (E) · demo_mes_materializar y
-- demo_mes_asignaciones (F) · demo_mes_estados (G) · demo_mes_eventos (H) · demo_mes_avisos (I)
-- y private.demo_mes(mes, semilla), que las llama en orden.

create or replace function private.demo_mes_oferta(p_mes date, p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_idx integer := (extract(year from p_mes)::integer - 2025) * 12 + extract(month from p_mes)::integer - 7;
  v_ini timestamptz := p_mes::timestamp at time zone 'America/Bogota';
  v_fin_mes timestamptz := (p_mes + interval '1 month')::timestamp at time zone 'America/Bogota';
  v_fin timestamptz;
  v_est numeric := (array[0.70, 0.85, 0.95, 0.95, 1.20, 1.05, 1.00, 0.95, 1.10, 1.05, 1.25, 1.35])[extract(month from p_mes)::integer];
  v_n integer; v_k integer; i integer; j integer;
  v_ops uuid[]; v_nops integer;
  v_lunes timestamptz;
  v_tc timestamptz; v_tact timestamptz; v_an record; v_camp uuid; v_nof integer; v_usr uuid;
  v_plat public.plataforma; v_fmt record; v_r double precision;
  v_tcre timestamptz; v_tenv timestamptz; v_tdev timestamptz; v_tenv2 timestamptz; v_tpub timestamptz; v_tcanc timestamptz;
  v_vini timestamptz; v_vfin timestamptz; v_tlim timestamptz; v_mod uuid;
  v_deps char(2)[]; v_muns char(5)[]; v_cats uuid[]; v_segmin integer; v_excl smallint; v_pubs smallint;
  v_of uuid; v_e1 integer; v_e2 integer; v_e3 integer; v_pve numeric; v_pac numeric; v_g numeric; v_tot numeric;
  v_c1 integer; v_c2 integer; v_c3 integer; v_pres numeric; v_cre uuid; v_tema text; v_nombre text;
  v_ok integer := 0; v_fallos jsonb := '{}'; x record;
  v_total_cupos integer; v_tope numeric;
  r jsonb := '{}';
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_oferta exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  if v_hoy is null or v_ini >= v_hoy then
    raise exception 'El mes % empieza después del «hoy» de la demo', p_mes;
  end if;
  if exists (select 1 from public.campanas c where c.es_demo and c.created_at >= v_ini and c.created_at < v_fin_mes) then
    raise exception 'El mes % ya tiene campañas demo', p_mes;
  end if;
  v_fin := least(v_fin_mes, v_hoy);
  perform setseed(private.demo_semilla(p_semilla, v_idx));
  select array_agg(u.usuario_id order by u.email), count(*) into v_ops, v_nops from private.demo_usuarios u where u.clase = 'OPERACIONES';

  -- A. Reverificaciones (cada 25–35 días; deriva de seguidores −2 % … +6 %) ---------------------------------------------
  loop
    with due as (
      select d.cuenta_id, d.medio_id, d.proxima, d.metodo, cs.seguidores_verificados as s,
             greatest(30000, round(cs.seguidores_verificados * (0.98 + random() * 0.08)))::integer as s2,
             private.uuid_v7() as vid, v_ops[1 + floor(random() * v_nops)::integer] as por, random() as rr
      from private.demo_cuentas d join public.cuentas_sociales cs on cs.id = d.cuenta_id
      where d.proxima < least(v_fin_mes + interval '12 days', v_hoy) and (d.detener_at is null or d.proxima < d.detener_at)
    ), ins as (
      insert into public.verificaciones_cuenta (id, cuenta_social_id, medio_id, metodo, seguidores_reportados, seguidores_verificados,
        captura_path, codigo_hash, codigo_expira_at, estado_validacion, validada_por, validada_at, created_at, updated_at)
      select d.vid, d.cuenta_id, d.medio_id, d.metodo, d.s2, d.s2,
             'medio/' || d.medio_id || '/cuenta_social/' || d.cuenta_id || '/verificacion-' || to_char(d.proxima, 'YYYYMMDD') || '.webp',
             case when d.metodo = 'CODIGO_HISTORIA' then encode(sha256(convert_to(d.vid::text, 'UTF8')), 'hex') end,
             case when d.metodo = 'CODIGO_HISTORIA' then d.proxima - (2 + d.rr * 18) * interval '1 hour' + interval '1 hour' end,
             'APROBADA', d.por, d.proxima, d.proxima - (2 + d.rr * 18) * interval '1 hour', d.proxima
      from due d
    ), upd as (
      update public.cuentas_sociales cs
         set seguidores_verificados = d.s2,
             franja_id = (select f.id from public.franjas f where f.activa
                          and d.s2 between f.seguidores_min and coalesce(f.seguidores_max, 2147483647)),
             fecha_ultima_verificacion = d.proxima, metodo_verificacion = d.metodo, updated_at = d.proxima
      from due d where cs.id = d.cuenta_id
    ), ev as (
      insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, cambios)
      select d.proxima, d.por, 'verificaciones_cuenta', d.vid::text, 'TRANSICION', 'PENDIENTE', 'APROBADA',
             jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'APROBADA'),
                                'seguidores_verificados', jsonb_build_object('antes', d.s, 'despues', d.s2))
      from due d
    )
    update private.demo_cuentas c set proxima = c.proxima + (25 + random() * 10) * interval '1 day'
    from due d where c.cuenta_id = d.cuenta_id;
    get diagnostics v_k = row_count;
    exit when v_k = 0;
  end loop;
  -- Un salto de seguidores > 40 % rechazado (tres en todo el periodo).
  if v_idx in (5, 9, 13) then
    with c as (
      select d.cuenta_id, d.medio_id, cs.seguidores_verificados as s, private.uuid_v7() as vid
      from private.demo_cuentas d join public.cuentas_sociales cs on cs.id = d.cuenta_id
      where d.detener_at is null order by random() limit 1
    ), ins as (
      insert into public.verificaciones_cuenta (id, cuenta_social_id, medio_id, metodo, seguidores_reportados, captura_path,
        estado_validacion, validada_por, validada_at, observaciones, created_at, updated_at)
      select c.vid, c.cuenta_id, c.medio_id, 'MANUAL', round(c.s * 1.48)::integer,
             'medio/' || c.medio_id || '/cuenta_social/' || c.cuenta_id || '/verificacion-salto.webp', 'RECHAZADA', v_ops[1],
             v_ini + interval '11 days 15 hours',
             'Salto de seguidores superior al 40 % frente a la verificación anterior: se solicita una captura nueva del panel.',
             v_ini + interval '10 days 14 hours', v_ini + interval '11 days 15 hours'
      from c
    )
    insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, motivo, cambios)
    select v_ini + interval '11 days 15 hours', v_ops[1], 'verificaciones_cuenta', c.vid::text, 'TRANSICION', 'PENDIENTE', 'RECHAZADA',
           'Salto de seguidores superior al 40 %', jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'RECHAZADA'))
    from c;
  end if;

  -- B. Multiplicadores de calidad: recálculo del primer lunes 03:30 y aplicación tras el aviso ----------------------------
  if v_idx >= 2 then
    v_lunes := ((p_mes + ((8 - extract(isodow from p_mes)::integer) % 7))::timestamp + interval '3 hours 30 minutes') at time zone 'America/Bogota';
    if v_lunes < v_hoy then
      perform set_config('amo.reloj', v_lunes::text, true);
      perform private.recalcular_multiplicadores();
      if v_lunes + interval '7 days' < v_hoy then
        perform set_config('amo.reloj', (v_lunes + interval '6 days 23 hours 30 minutes')::text, true);
        perform private.aplicar_multiplicadores_programados();
      end if;
      perform set_config('amo.reloj', '', true);
    end if;
  end if;

  -- C. Campañas y ofertas del mes ------------------------------------------------------------------------------------------
  drop table if exists _camp, _of, _eleg, _vis, _int, _tl, _pub, _met, _ag, _ev0, _ev, _fin, _oev, _oag;
  create temp table _camp (id uuid primary key, n_an integer, anunciante_id uuid, usuario uuid, t_c timestamptz, t_act timestamptz) on commit drop;
  create temp table _of (id uuid primary key, campana_id uuid, anunciante_id uuid, usuario uuid, plataforma public.plataforma,
    formato_id uuid, formato_clave text, pubs smallint, perm smallint, t_cre timestamptz, t_env timestamptz, t_dev timestamptz,
    t_env2 timestamptz, t_pub timestamptz, t_canc timestamptz, moderador uuid, v_ini timestamptz, v_fin timestamptz,
    t_lim timestamptz, p_ve numeric, p_ac numeric, enlace boolean, creativo_id uuid, titulo text) on commit drop;
  create temp table _eleg (oferta_id uuid, medio_id uuid, cuenta_id uuid, franja text, actividad numeric) on commit drop;

  v_n := greatest(1, round(9 * power(1.06, v_idx) * v_est
                           * extract(epoch from (v_fin - v_ini)) / extract(epoch from (v_fin_mes - v_ini))))::integer;
  for i in 1..v_n loop
    v_tc := private.demo_instante(v_ini, v_fin);
    select a.n, a.anunciante_id, an.nombre_comercial, an.municipio_codigo, an.pais_iso2 into v_an
    from private.demo_anunciantes a join public.anunciantes an on an.id = a.anunciante_id
    where a.estado_final in ('VERIFICADO', 'SUSPENDIDO') and a.verificado_at < v_tc
      and (a.baja_at is null or a.baja_at > v_tc + interval '25 days')
    order by -ln(greatest(random(), 1e-9)) / a.peso limit 1;
    continue when v_an.anunciante_id is null;
    select u.usuario_id into v_usr from private.demo_usuarios u
    where u.org_id = v_an.anunciante_id and u.alta_at < v_tc order by random() limit 1;
    if v_usr is null then
      select u.usuario_id into v_usr from private.demo_usuarios u where u.org_id = v_an.anunciante_id and u.principal;
    end if;
    v_camp := private.uuid_v7();
    v_tact := v_tc + (0.2 + random() * 5) * interval '1 hour';
    v_tema := case when random() < 0.55 then
        (array['Regreso a clases', 'San Valentín', 'Temporada de Semana Santa', 'Mes de los niños', 'Día de la Madre', 'Día del Padre',
               'Vacaciones de mitad de año', 'Feria de las Flores', 'Amor y Amistad', 'Halloween', 'Black Friday', 'Navidad'])[extract(month from p_mes)::integer]
      else (array['Lanzamiento de temporada', 'Promociones de quincena', 'Nueva sede', 'Campaña de marca', 'Feria regional',
                  'Descuentos de aniversario', 'Programa de fidelización', 'Convocatoria abierta', 'Nuevo producto', 'Cobertura regional'])[1 + floor(random() * 10)::integer] end;
    v_nombre := left(v_tema || ' ' || extract(year from p_mes)::integer || ' · ' || v_an.nombre_comercial
                     || case when exists (select 1 from _camp c where c.anunciante_id = v_an.anunciante_id) then ' (' || i || ')' else '' end, 120);
    insert into public.campanas (id, anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total,
                                 estado, activada_at, creada_por, es_demo, created_at, updated_at)
    values (v_camp, v_an.anunciante_id, v_nombre,
            (array['Aumentar el reconocimiento de marca en audiencias locales.', 'Llevar tráfico a los puntos de venta de la región.',
                   'Dar a conocer la promoción vigente con medios de confianza.', 'Posicionar el lanzamiento en comunidades hiperlocales.'])[1 + floor(random() * 4)::integer],
            left(v_an.nombre_comercial, 80), (v_tc at time zone 'America/Bogota')::date, (v_tc at time zone 'America/Bogota')::date + 30,
            1000000, case when v_tact <= v_hoy then 'ACTIVA' else 'BORRADOR' end::public.campana_estado,
            case when v_tact <= v_hoy then v_tact end, v_usr, true, v_tc, least(v_tact, v_hoy));
    insert into _camp values (v_camp, v_an.n, v_an.anunciante_id, v_usr, v_tc, v_tact);
    -- Excepción de comisión por campaña (12 %): la primera campaña del anunciante 1 en noviembre de 2025.
    if v_idx = 4 and v_an.n = 1 and not exists (select 1 from public.comisiones_excepcion e where e.campana_id is not null) then
      insert into public.comisiones_excepcion (campana_id, porcentaje, vigente_desde, motivo, creada_por, created_at, updated_at)
      values (v_camp, 0.12, v_tc, 'Campaña estratégica de fin de año (demo)', null, v_tc, v_tc);
    end if;

    v_r := random();
    v_nof := case when v_r < 0.40 then 1 when v_r < 0.80 then 2 else 3 end;
    for j in 1..v_nof loop
      v_r := random();
      v_plat := case when v_r < 0.50 then 'INSTAGRAM' when v_r < 0.80 then 'FACEBOOK' else 'TIKTOK' end;
      select f.id, f.clave, f.nombre into v_fmt from public.formatos f
      where f.plataforma = v_plat and f.activo
      order by -ln(greatest(random(), 1e-9)) / (case f.clave when 'HISTORIA' then 2.6 when 'POST_FEED' then 3.2 when 'REEL' then 2.4
                                                            when 'CARRUSEL' then 1.5 else 2.0 end) limit 1;
      v_tcre := v_tc + (0.1 + random() * 26) * interval '1 hour';
      v_tenv := greatest(v_tact + interval '10 minutes', v_tcre + (0.5 + random() * 18) * interval '1 hour');
      v_mod := v_ops[1 + floor(random() * v_nops)::integer];
      v_tdev := null; v_tenv2 := null; v_tcanc := null;
      v_r := random();
      if v_r < 0.06 then                                   -- devuelta una vez
        v_tdev := private.demo_habil(v_tenv, 2 + random() * 18);
        v_tenv2 := v_tdev + (2 + random() * 28) * interval '1 hour';
        v_tpub := private.demo_habil(v_tenv2, 2 + random() * 18);
      elsif v_r < 0.08 then                                -- rechazada en moderación
        v_tcanc := private.demo_habil(v_tenv, 2 + random() * 18);
        v_tpub := v_tcanc;
      else
        v_tpub := private.demo_habil(v_tenv, 2 + random() * 28);
      end if;
      v_vini := (date_trunc('day', v_tpub at time zone 'America/Bogota') + (3 + floor(random() * 5)) * interval '1 day') at time zone 'America/Bogota';
      v_vfin := v_vini + (7 + floor(random() * 15)) * interval '1 day';
      v_tlim := v_vini + floor(random() * 4) * interval '1 day';
      if v_tlim = v_vini then v_tlim := v_vini - interval '1 minute'; end if;
      v_pubs := case when random() < 0.10 and v_fmt.clave <> 'CARRUSEL' then 2 else 1 end;
      v_excl := case when random() < 0.04 then (array[7, 15])[1 + floor(random() * 2)::integer] end;
      -- Segmentación: 25 % nacional, 45 % por departamentos, 30 % por municipios.
      v_deps := '{}'; v_muns := '{}'; v_cats := '{}'; v_segmin := null;
      v_r := random();
      if v_r < 0.25 then
        if random() < 0.5 then v_segmin := 60001; end if;
      else
        select string_to_array(z.c, ',')::char(2)[] into v_deps
        from (values ('05', 9.0), ('11,25', 10.0), ('76,19,52', 7.0), ('08,13,47', 7.0), ('68,54', 4.5), ('17,66,63', 3.5), ('73,41,18', 3.0),
                     ('23,70,20,44', 3.5), ('50,85,81,95,94,97,99,91,86', 2.5), ('15,25', 2.5), ('27,76', 1.5), ('88,08,13', 1.5),
                     ('05,17,66,63', 2.0), ('11', 4.0), ('76', 4.0)) z (c, w)
        order by -ln(greatest(random(), 1e-9)) / (z.w * case when v_an.pais_iso2 = 'CO' and position(left(v_an.municipio_codigo, 2) in z.c) > 0 then 3.5 else 1 end)
        limit 1;
        if v_r >= 0.70 then
          select coalesce(array_agg(q.mun), '{}') into v_muns
          from (select m.municipio_codigo as mun from public.medios m
                where m.es_demo and m.departamento_codigo = any (v_deps) and m.estado = 'VERIFICADO'
                group by m.municipio_codigo order by count(*) desc, random() limit 3 + floor(random() * 5)::integer) q;
          if cardinality(v_muns) > 0 then v_deps := '{}'; end if;
        end if;
      end if;
      if random() < 0.20 then
        select array_agg(k.id) into v_cats from (select c.id from public.categorias c where c.activo and c.deleted_at is null
                                                 order by random() limit 1 + floor(random() * 2)::integer) k;
      end if;

      -- Medios elegibles al publicar (misma regla que private.medio_elegible).
      v_of := private.uuid_v7();
      for v_k in 1..2 loop
        delete from _eleg where oferta_id = v_of;
        insert into _eleg (oferta_id, medio_id, cuenta_id, franja, actividad)
        select v_of, d.medio_id, cs.id, f.clave, d.actividad
        from private.demo_medios d
        join public.medios m on m.id = d.medio_id
        join public.cuentas_sociales cs on cs.medio_id = d.medio_id and cs.plataforma = v_plat and cs.verificada and cs.deleted_at is null
        join public.franjas f on f.id = cs.franja_id
        where d.estado_final in ('VERIFICADO', 'SUSPENDIDO') and d.verificado_at < v_tpub and (d.baja_at is null or d.baja_at > v_tlim)
          and cs.seguidores_verificados >= greatest(30000, coalesce(v_segmin, 0))
          and ((cardinality(v_muns) = 0 and cardinality(v_deps) = 0) or m.municipio_codigo = any (v_muns) or m.departamento_codigo = any (v_deps))
          and (cardinality(v_cats) = 0 or exists (select 1 from public.medio_categorias mc where mc.medio_id = d.medio_id and mc.categoria_id = any (v_cats)));
        select count(*) filter (where e.franja = 'F1'), count(*) filter (where e.franja = 'F2'), count(*) filter (where e.franja = 'F3')
          into v_e1, v_e2, v_e3 from _eleg e where e.oferta_id = v_of;
        exit when v_e1 + v_e2 + v_e3 >= 7;
        v_deps := '{}'; v_muns := '{}'; v_cats := '{}'; v_segmin := null;       -- muy pocos medios: oferta nacional
      end loop;
      v_pve := 0.40 + random() * 0.30;
      v_pac := 0.35 + random() * 0.20 + case when v_plat = 'TIKTOK' then 0.05 else 0 end;
      v_g := 0.95 + random() * 0.35;
      v_tot := (v_e1 + v_e2 + v_e3) * v_pve * v_pac * v_g;
      if v_tot > 30 then v_pve := v_pve * 30 / v_tot; end if;
      v_c1 := round(v_e1 * v_pve * v_pac * v_g); v_c2 := round(v_e2 * v_pve * v_pac * v_g); v_c3 := round(v_e3 * v_pve * v_pac * v_g);
      if v_c1 + v_c2 + v_c3 < 2 then
        v_c1 := v_c1 + case when v_e1 >= 2 then 1 else 0 end; v_c2 := v_c2 + case when v_e2 >= 2 then 1 else 0 end;
        if v_c1 + v_c2 + v_c3 < 2 then v_c1 := greatest(v_c1, 2); end if;
      end if;
      select coalesce(sum(case fr.clave when 'F1' then v_c1 when 'F2' then v_c2 else v_c3 end * t.valor_base), 0) into v_pres
      from public.tarifas t join public.franjas fr on fr.id = t.franja_id
      where t.formato_id = v_fmt.id and t.vigente_desde <= v_tpub and (t.vigente_hasta is null or t.vigente_hasta > v_tpub);
      v_pres := ceil(v_pres * v_pubs * case when v_excl is null then 1 else 1.25 end * 1.15 / 10000) * 10000;

      insert into public.ofertas (id, campana_id, anunciante_id, titulo, formato_id, plataforma, publicaciones_por_medio,
        presupuesto_maximo, tope_porcentaje_por_medio, departamentos_objetivo, municipios_objetivo, categorias_objetivo,
        seguidores_minimos, ventana_inicio, ventana_fin, fecha_limite_aceptacion, permanencia_minima_dias, exclusividad_dias,
        cortes_requeridos, instrucciones, restricciones, estado, publicada_at, enviada_at, moderada_por, creada_por, created_at, updated_at)
      values (v_of, v_camp, v_an.anunciante_id,
              left(v_fmt.nombre || ' de ' || private.nombre_plataforma(v_plat) || ' · ' || v_tema, 120), v_fmt.id, v_plat, v_pubs,
              v_pres, 0.15, v_deps, v_muns, v_cats, v_segmin, v_vini, v_vfin, v_tlim, 7, v_excl,
              array['H24', 'H72', 'D7']::public.corte_metrica[],
              'Publica la pieza tal como se entrega, en el horario de mayor audiencia de tu cuenta. Incluye el texto sugerido y las etiquetas.',
              'No modificar la pieza ni el texto legal. La etiqueta de publicidad es obligatoria.',
              case when v_tcanc is null and v_tpub <= v_hoy then 'PUBLICADA' else 'BORRADOR' end::public.oferta_estado,
              case when v_tcanc is null and v_tpub <= v_hoy then v_tpub end,
              case when v_tcanc is null and v_tpub <= v_hoy then coalesce(v_tenv2, v_tenv) end,
              case when v_tcanc is null and v_tpub <= v_hoy then v_mod end, v_usr, v_tcre, v_tcre);
      insert into public.oferta_cupos (oferta_id, franja_id, cupos_totales, created_at, updated_at)
      select v_of, fr.id, q.c, v_tcre, v_tcre
      from (values ('F1', v_c1), ('F2', v_c2), ('F3', v_c3)) q (clave, c) join public.franjas fr on fr.clave = q.clave
      where q.c > 0;
      v_cre := private.uuid_v7();
      insert into public.creativos (id, oferta_id, tipo, copy_sugerido, hashtags, menciones, enlace_destino, version, vigente,
                                    creado_por, created_at, updated_at)
      values (v_cre, v_of, case when v_fmt.clave = 'CARRUSEL' then 'CARRUSEL' when v_fmt.clave in ('REEL', 'VIDEO') then 'VIDEO' else 'IMAGEN' end::public.creativo_tipo,
              v_tema || ' con ' || v_an.nombre_comercial || '. Conoce los detalles y aprovecha. #Publicidad',
              array['#Publicidad', '#' || replace(initcap(private.normalizar_texto(v_an.nombre_comercial)), ' ', '')],
              array['@' || left(replace(private.normalizar_texto(v_an.nombre_comercial), ' ', ''), 28)],
              case when random() < 0.6 then 'https://demo.amo.co/c/' || left(v_camp::text, 8) end, 1, true, v_usr,
              v_tcre + interval '12 minutes', v_tcre + interval '12 minutes');
      insert into public.creativo_archivos (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, duracion_segundos, orden, created_at)
      select v_cre, 'oferta/' || v_of || '/' || v_cre || '/pieza-' || g || case when v_fmt.clave in ('REEL', 'VIDEO') then '.mp4' else '.jpg' end,
             case when v_fmt.clave in ('REEL', 'VIDEO') then 'video/mp4' else 'image/jpeg' end,
             case when v_fmt.clave in ('REEL', 'VIDEO') then 6000000 + floor(random() * 22000000)::bigint else 350000 + floor(random() * 1800000)::bigint end,
             1080, case when v_fmt.clave in ('REEL', 'VIDEO', 'HISTORIA') then 1920 else 1350 end,
             case when v_fmt.clave in ('REEL', 'VIDEO') then round((12 + random() * 45)::numeric, 2) end, g - 1, v_tcre + interval '13 minutes'
      from generate_series(1, case when v_fmt.clave = 'CARRUSEL' then 3 + floor(random() * 3)::integer else 1 end) g;
      insert into _of values (v_of, v_camp, v_an.anunciante_id, v_usr, v_plat, v_fmt.id, v_fmt.clave, v_pubs, 7, v_tcre, v_tenv, v_tdev,
        v_tenv2, v_tpub, v_tcanc, v_mod, v_vini, v_vfin, v_tlim, v_pve, v_pac,
        (select c.enlace_destino is not null from public.creativos c where c.id = v_cre), v_cre,
        left(v_fmt.nombre || ' de ' || private.nombre_plataforma(v_plat) || ' · ' || v_tema, 120));
    end loop;

    -- Presupuesto y fechas de la campaña según sus ofertas; tope % por medio holgado en campañas pequeñas.
    select coalesce(sum(o.cupos_totales), 0) into v_total_cupos from public.ofertas o where o.campana_id = v_camp;
    v_tope := greatest(0.15, least(0.60, round(3.0 / greatest(v_total_cupos, 1), 2)));
    update public.ofertas o set tope_porcentaje_por_medio = v_tope where o.campana_id = v_camp;
    update public.campanas c
       set presupuesto_total = (select ceil(sum(o.presupuesto_maximo) * (1.05 + random() * 0.25) / 100000) * 100000 from public.ofertas o where o.campana_id = c.id),
           fecha_inicio = least(c.fecha_inicio, (select min((o.ventana_inicio at time zone 'America/Bogota')::date) from public.ofertas o where o.campana_id = c.id)),
           fecha_fin = (select max((o.ventana_fin at time zone 'America/Bogota')::date) from public.ofertas o where o.campana_id = c.id) + floor(random() * 3)::integer
     where c.id = v_camp;
  end loop;

  -- D. Vistas, aceptaciones (reservar_cupo en orden cronológico) y rechazos ---------------------------------------------------
  create temp table _vis on commit drop as
  select e.oferta_id, e.medio_id, e.cuenta_id, e.actividad, o.t_lim, o.p_ac,
         o.t_pub + (o.t_lim - o.t_pub) * power(random(), 2.2) as t_v, random() as r_a, random() as r_d, random() as r_t
  from _eleg e join _of o on o.id = e.oferta_id
  where o.t_canc is null and o.t_pub <= v_hoy and random() < least(0.95, o.p_ve * (0.55 + 0.45 * e.actividad));
  delete from _vis where t_v > v_hoy;
  insert into public.oferta_vistas (oferta_id, medio_id, primera_vista_at, ultima_vista_at, veces)
  select v.oferta_id, v.medio_id, v.t_v, least(v.t_v + v.r_t * interval '40 hours', v.t_lim, v_hoy), 1 + floor(v.r_t * 4)::integer
  from _vis v order by v.t_v;
  get diagnostics v_k = row_count; r := r || jsonb_build_object('vistas', v_k);

  create temp table _int on commit drop as
  select v.oferta_id, v.medio_id, v.cuenta_id, v.t_v + (0.03 + v.r_t * 18) * interval '1 hour' as t_a
  from _vis v where v.r_a < least(0.92, v.p_ac * (0.6 + 0.4 * v.actividad));
  delete from _int i using _of o
   where o.id = i.oferta_id and (i.t_a >= o.t_lim - interval '1 minute' or i.t_a > v_hoy);
  for x in select * from _int order by t_a loop
    perform set_config('amo.reloj', x.t_a::text, true);
    begin
      perform private.reservar_cupo(x.oferta_id, x.medio_id, x.cuenta_id, null, null, null);
      v_ok := v_ok + 1;
    exception when sqlstate 'P0001' then
      v_fallos := v_fallos || jsonb_build_object(sqlerrm, coalesce((v_fallos ->> sqlerrm)::integer, 0) + 1);
    end;
  end loop;
  perform set_config('amo.reloj', '', true);
  r := r || jsonb_build_object('aceptaciones', v_ok, 'intentos_fallidos', v_fallos);

  insert into public.asignaciones (oferta_id, campana_id, anunciante_id, medio_id, plataforma, estado, rechazada_at, motivo,
                                   es_demo, created_at, updated_at)
  select v.oferta_id, o.campana_id, o.anunciante_id, v.medio_id, o.plataforma, 'RECHAZADA', z.t,
         (array['No encaja con la línea editorial del medio.', 'Agenda de publicaciones llena en esas fechas.',
                'El valor ofrecido no compensa el alcance.', 'Conflicto con otro anunciante del mismo sector.', null])[1 + floor(v.r_t * 5)::integer],
         true, z.t, z.t
  from _vis v join _of o on o.id = v.oferta_id
  cross join lateral (select least(v.t_v + (0.02 + v.r_a * 6) * interval '1 hour', o.t_lim - interval '2 minutes') as t) z
  where v.r_d < 0.27 and z.t <= v_hoy and z.t > o.t_pub
    and not exists (select 1 from _int i where i.oferta_id = v.oferta_id and i.medio_id = v.medio_id);
  get diagnostics v_k = row_count; r := r || jsonb_build_object('rechazos', v_k);

  return r || jsonb_build_object('campanas', (select count(*) from _camp), 'ofertas', (select count(*) from _of));
end $fn$;
revoke all on function private.demo_mes_oferta(date, double precision) from public, anon, authenticated, service_role;

create or replace function private.demo_mes_tiempos() returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_ops uuid[]; v_nops integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_tiempos exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  select array_agg(u.usuario_id order by u.email), count(*) into v_ops, v_nops from private.demo_usuarios u where u.clase = 'OPERACIONES';

  -- E. Línea de tiempo ideal de cada asignación aceptada ----------------------------------------------------------------------
  -- Se arma por etapas, cada una como una tabla temporal nueva (sin modificar las anteriores):
  --   _t1 sorteos y desenlace → _p1 publicaciones → _t2 evidencia rechazada → _p2 desempeño → _met métricas →
  --   _a1 agregados → _tl (disputas, cancelaciones y límite) → _pub y _ag (tiempos definitivos).
  create temp table _t1 on commit drop as
  select y.*,
         case y.tipo when 'DESISTE' then false when 'VENCE' then y.r1 < 0.5 and y.t_desc < y.v_fin - interval '1 hour' else true end as descargo,
         case when y.tipo = 'DESISTE' then y.t_acc + interval '5 minutes' + y.r1 * 0.9 * (y.t_desc - y.t_acc) end as t_des,
         case when y.tipo = 'VENCE' then private.demo_tick(y.v_fin, 0) end as t_venc
  from (select x.*,
               case when greatest(x.t_desc + interval '1 hour', x.v_ini) > x.v_fin - interval '3 hours' then 'VENCE'
                    when x.r_tipo < 0.015 then 'DESISTE'
                    when x.r_tipo < 0.015 + x.p_vence then 'VENCE'
                    when x.r_tipo < 0.035 + x.p_vence then 'CANCELA'
                    when x.r_tipo < 0.051 + x.p_vence then 'DISPUTA'
                    else 'NORMAL' end as tipo
        from (select a.id, a.oferta_id, a.campana_id, a.medio_id, a.anunciante_id, a.cuenta_social_id, a.plataforma, o.formato_clave, o.pubs,
                     o.perm, o.enlace, o.creativo_id, a.seguidores_al_aceptar as seg, a.aceptada_at as t_acc, o.v_ini, o.v_fin, d.calidad,
                     um.usuario_id as u_medio, ua.usuario_id as u_anun, v_ops[1 + floor(random() * v_nops)::integer] as u_ops,
                     random() as r_tipo, least(0.40, 0.05 * d.fiabilidad) as p_vence,
                     random() as r1, random() as r2, random() as r3, random() as r4, random() as r5, random() as r6,
                     a.aceptada_at + (2 + random() * 34) * interval '1 hour' as t_desc
              from public.asignaciones a
              join _of o on o.id = a.oferta_id
              join private.demo_medios d on d.medio_id = a.medio_id
              join private.demo_usuarios um on um.org_id = a.medio_id and um.principal
              join private.demo_usuarios ua on ua.org_id = a.anunciante_id and ua.principal
              where a.estado = 'ACEPTADA'
              offset 0) x
        offset 0) y;

  create temp table _p1 on commit drop as
  with base as (
    select t.id as asig, g.i as numero, t.t_desc, t.v_ini, t.v_fin,
           greatest(t.t_desc + interval '1 hour', t.v_ini) as inferior, t.v_fin - interval '2 hours' as superior,
           greatest(t.t_desc + (4 + random() * 68) * interval '1 hour', t.v_ini + (t.v_fin - t.v_ini) * power(random(), 1.8) * 0.85)
             + (g.i - 1) * (1 + random() * 2) * interval '1 day' as objetivo
    from _t1 t cross join lateral generate_series(1, t.pubs) g (i)
    where t.tipo not in ('DESISTE', 'VENCE')
  ), pico as (
    select b.*, private.demo_pico((b.objetivo at time zone 'America/Bogota')::date) as fp0 from base b
  ), acot as (
    select p.asig, p.numero, p.v_fin,
           case when p.fp0 < p.inferior then least(p.inferior + random() * interval '3 hours', p.superior)
                when p.fp0 > p.superior then greatest(p.superior - random() * interval '2 hours', p.inferior) else p.fp0 end as fp1
    from pico p
  ), orden as (
    select a.asig, a.numero, a.v_fin,
           least(greatest(a.fp1, coalesce(lag(a.fp1) over (partition by a.asig order by a.numero) + interval '2 hours', a.fp1)),
                 a.v_fin - interval '10 minutes') as fp
    from acot a
  ), sorteo as (
    select private.uuid_v7() as id, o.asig, o.numero, o.fp,
           least(o.fp + (0.05 + random() * 5) * interval '1 hour', o.v_fin - interval '1 minute') as t_reg,
           random() as r_ratio, random() as r_infl, random() as r_infl2, 1.2 + random() * 0.4 as f_imp, random() as r_eng, random() as r_misc,
           random_normal(0, 1) as z, 1 + floor(random() * 20)::integer as muestra
    from orden o
  )
  select s.*, private.demo_habil(s.t_reg, 2 + s.r_misc * 46) as t_ev0 from sorteo s;

  -- Evidencia rechazada una vez (3 %): solo con una publicación y si alcanza a volver a cargarla dentro de la ventana.
  create temp table _t2 on commit drop as
  select q.*, case when q.rech_ev then q.t_ev_1 end as t_rej,
         case when q.rech_ev then q.t_ev_1 + (1 + q.r2 * 9) * interval '1 hour' end as t_rereg
  from (select t.*, p.t_ev0 as t_ev_1,
               coalesce(t.tipo = 'NORMAL' and t.pubs = 1 and t.r1 < 0.03
                        and p.t_ev0 + (1 + t.r2 * 9) * interval '1 hour' < t.v_fin - interval '1 minute', false) as rech_ev
        from _t1 t left join _p1 p on p.asig = t.id and p.numero = 1) q;

  -- Desempeño base (corte D7) por publicación y reportes inflados (2 %; 8 % en lo reciente).
  create temp table _p2 on commit drop as
  select w.*,
         case when w.inflada is null then 1
              when w.r_misc < 0.7 then 3.5 + w.r_eng * 2.5
              else w.seg * (case w.plataforma when 'INSTAGRAM' then 2.2 + w.r_eng * 1.8 when 'FACEBOOK' then 3.2 + w.r_eng * 1.8
                                              else (21 + w.r_eng * 9) / 0.75 end) / greatest(w.base_d7, 1) end as infl
  from (select p.id, p.asig, p.numero, p.fp, p.t_reg, p.r_ratio, p.r_infl, p.r_infl2, p.f_imp, p.r_eng, p.r_misc, p.z, p.muestra,
               t.seg, t.plataforma,
               case when t.rech_ev then private.demo_habil(t.t_rereg, 2 + p.r_eng * 22) else p.t_ev0 end as t_ev1,
               t.seg * t.calidad * exp(p.z * case when t.plataforma = 'TIKTOK' then 0.50 else 0.28 end)
                 * case t.plataforma
                     when 'INSTAGRAM' then (case t.formato_clave when 'HISTORIA' then 0.10 when 'POST_FEED' then 0.14 when 'CARRUSEL' then 0.15 else 0.19 end)
                     when 'FACEBOOK' then (case t.formato_clave when 'HISTORIA' then 0.040 when 'POST_FEED' then 0.055 when 'VIDEO' then 0.070 else 0.075 end)
                     else 0.90 end as base_d7,
               case when t.tipo = 'NORMAL' and not t.rech_ev
                         and p.r_infl < case when p.fp > v_hoy - interval '9 days' then 0.08 else 0.02 end
                    then (case when p.r_infl2 < 0.5 then 'RECHAZADA' else 'ACEPTADA' end) end as inflada
        from _p1 p join _t2 t on t.id = p.asig) w;

  create temp table _met on commit drop as
  select c.id, c.pub_id, c.asig, c.corte, c.fecha_corte, c.frac, c.t_load, c.r_val, c.r_a, c.r_b, c.muestra, c.t_rejm, c.t_fix,
         case when c.t_fix is not null then private.demo_habil(c.t_fix, 2 + c.r_b * 20) else c.t_val0 end as t_val
  from (select b.*, case when b.rechazable then b.t_val0 end as t_rejm,
               case when b.rechazable then b.t_val0 + (3 + b.r_a * 30) * interval '1 hour' end as t_fix
        from (select a.*, private.demo_habil(a.t_load, 2 + a.r_val * 46) as t_val0
              from (select private.uuid_v7() as id, p.id as pub_id, p.asig, k.corte, p.fp + k.d as fecha_corte,
                           (case k.corte when 'H24' then 0.55 + random() * 0.10 when 'H72' then 0.85 + random() * 0.07 else 1 end)::numeric as frac,
                           p.fp + k.d + (case when k.corte = 'D7' and t.tipo = 'NORMAL' and t.r3 < 0.015 then 60 + random() * 140
                                              else random() * 30 end) * interval '1 hour' as t_load,
                           random() as r_val, random() as r_a, random() as r_b, 1 + floor(random() * 20)::integer as muestra,
                           coalesce(p.inflada = 'RECHAZADA' and k.corte = 'H24', false) as rechazable
                    from _p2 p join _t2 t on t.id = p.asig
                    cross join (values ('H24'::public.corte_metrica, interval '24 hours'), ('H72', interval '72 hours'), ('D7', interval '7 days')) k (corte, d)
                    offset 0) a
              offset 0) b) c;

  create temp table _a1 on commit drop as
  select h.*, private.demo_habil(greatest(h.t_val_max, h.fp_max + h.perm * interval '1 day', h.t_mc0), 1 + h.r6 * 19) as t_ver0
  from (select g.*, greatest(g.t_eva0, g.t_load_max) as t_mc0
        from (select t.id, t.perm, t.r6, max(p.t_reg) as t_puba, max(p.t_ev1) as t_eva0, max(p.fp) as fp_max,
                     (select max(m.t_load) from _met m where m.asig = t.id) as t_load_max,
                     (select max(m.t_val) from _met m where m.asig = t.id) as t_val_max
              from _t2 t join _p2 p on p.asig = t.id group by t.id, t.perm, t.r6) g) h;

  -- Disputas (~1,6 %): 55 % con evidencia en revisión o validada, 45 % con métricas cargadas; 60 % a favor del medio.
  -- Mientras dura la disputa la asignación no avanza: lo que faltaba ocurre después de resolverla.
  create temp table _tl on commit drop as
  select n.*, least(coalesce(n.t_end, 'infinity'), v_hoy) as t_lim
  from (select m.*,
               case m.tipo when 'DESISTE' then m.t_des when 'VENCE' then m.t_venc when 'CANCELA' then m.t_canc
                           when 'DISPUTA' then (case when not m.favor then m.t_res end) end as t_end
        from (select l.*, case when l.tipo = 'DISPUTA' then private.demo_habil(l.t_disp, 30 + l.r1 * 170) end as t_res,
                     case when l.tipo = 'DISPUTA' then private.demo_habil(l.t_disp, 2 + l.r2 * 28) end as t_rev
              from (select t.id, t.oferta_id, t.campana_id, t.medio_id, t.anunciante_id, t.cuenta_social_id, t.plataforma, t.formato_clave,
                           t.pubs, t.perm, t.enlace, t.creativo_id, t.seg, t.t_acc, t.v_ini, t.v_fin, t.calidad, t.u_medio, t.u_anun, t.u_ops,
                           t.r_tipo, t.p_vence, t.r1, t.r2, t.r3, t.r4, t.r5, t.r6, t.t_desc, t.tipo, t.descargo, t.t_des, t.t_venc,
                           t.rech_ev, t.t_rej, t.t_rereg,
                           case when t.tipo = 'DISPUTA' then
                             (case when t.r5 < 0.55 then a.t_puba + (0.1 + 0.8 * t.r6) * (a.t_mc0 - a.t_puba)
                                   else a.t_mc0 + (0.05 + 0.75 * t.r6) * (a.t_ver0 - a.t_mc0) end) end as t_disp,
                           case when t.tipo = 'DISPUTA' then t.r3 < 0.60 end as favor,
                           case when t.tipo = 'CANCELA' then t.t_acc + (0.05 + 0.85 * t.r5) * (a.t_ver0 - t.t_acc) end as t_canc
                    from _t2 t left join _a1 a on a.id = t.id) l) m) n;

  create temp table _pub on commit drop as
  select p.id, p.asig, p.numero, p.fp, p.t_reg, p.r_ratio, p.r_infl, p.r_infl2, p.f_imp, p.r_eng, p.r_misc, p.z, p.muestra,
         p.base_d7, p.inflada, p.infl,
         case when t.tipo = 'DISPUTA' and p.t_ev1 > t.t_disp then greatest(p.t_ev1, t.t_res + interval '30 minutes') else p.t_ev1 end as t_ev
  from _p2 p join _tl t on t.id = p.asig;

  create temp table _ag on commit drop as
  select e.*, private.demo_tick(greatest(e.fp_max + interval '9 days', e.t_eva), 5) as t_atr
  from (select d.*,
               case when d.en_disputa then greatest(case when d.t_ver0 > d.t_disp then greatest(d.t_ver0, d.t_res + interval '3 hours') else d.t_ver0 end,
                                                    d.t_mc + interval '10 minutes')
                    else d.t_ver0 end as t_ver
        from (select c.*,
                     case when c.en_disputa then greatest(case when c.t_mc0 > c.t_disp then greatest(c.t_mc0, c.t_res + interval '1 hour') else c.t_mc0 end, c.t_eva)
                          else c.t_mc0 end as t_mc
              from (select a.id, a.t_puba, a.fp_max, a.t_load_max, a.t_val_max, a.t_mc0, a.t_ver0, t.t_disp, t.t_res, t.tipo = 'DISPUTA' as en_disputa,
                           case when t.tipo = 'DISPUTA' and a.t_eva0 > t.t_disp then greatest(a.t_eva0, t.t_res + interval '30 minutes')
                                else a.t_eva0 end as t_eva
                    from _a1 a join _tl t on t.id = a.id) c) d) e;

  return jsonb_build_object('asignaciones_con_linea', (select count(*) from _tl));
end $fn$;
revoke all on function private.demo_mes_tiempos() from public, anon, authenticated, service_role;

create or replace function private.demo_mes_materializar() returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_k integer;
  r jsonb := '{}';
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_materializar exige amo.modo_carga (solo el owner por conexión directa)';
  end if;

  -- F. Materialización hasta el «hoy» ----------------------------------------------------------------------------------------------
  insert into public.descargas_contenido (asignacion_id, creativo_id, descargado_at)
  select t.id, t.creativo_id, t.t_desc + g.k * (1 + t.r4 * 30) * interval '1 hour'
  from _tl t cross join lateral generate_series(0, case when t.r4 < 0.10 then 1 else 0 end) g (k)
  where t.descargo and t.t_desc + g.k * (1 + t.r4 * 30) * interval '1 hour' <= t.t_lim
  order by 3;

  insert into public.publicaciones (id, asignacion_id, numero, url_post, fecha_publicacion, captura_path, miniatura_path,
    etiqueta_publicidad_confirmada, etiqueta_verificada, permanencia_hasta, permanencia_verificada_at, estado_validacion,
    validada_por, validada_at, observaciones, created_at, updated_at)
  select p.id, p.asig, p.numero,
         case t.plataforma
           when 'INSTAGRAM' then 'https://www.instagram.com/' || case when t.formato_clave = 'REEL' then 'reel/' when t.formato_clave = 'HISTORIA' then 'stories/' || c.handle || '/' else 'p/' end
                                 || case when t.formato_clave = 'HISTORIA' then (3100000000000000000 + floor(p.r_ratio * 9e17)::bigint)::text
                                         else translate(left(encode(sha256(convert_to(p.id::text, 'UTF8')), 'base64'), 11), '+/=', '-_x') end || '/'
           when 'FACEBOOK' then 'https://www.facebook.com/' || c.handle || '/posts/' || (100000000000000 + floor(p.r_ratio * 8e14)::bigint)::text
           else 'https://www.tiktok.com/@' || c.handle || '/video/' || (7300000000000000000 + floor(p.r_ratio * 2e17)::bigint)::text end,
         p.fp, 'muestras/evidencia-' || lpad(p.muestra::text, 2, '0') || '.webp', 'muestras/evidencia-' || lpad(p.muestra::text, 2, '0') || '-mini.webp',
         true, e.estado = 'APROBADA', p.fp + t.perm * interval '1 day',
         case when a.t_ver <= t.t_lim then a.t_ver - interval '4 minutes' end,
         e.estado::public.validacion_estado,
         case when e.estado <> 'PENDIENTE' then t.u_ops end,
         case e.estado when 'APROBADA' then p.t_ev when 'RECHAZADA' then t.t_rej end,
         case when e.estado = 'RECHAZADA' then 'La captura no muestra la etiqueta de publicidad ni la fecha de publicación.' end,
         p.t_reg, case e.estado when 'APROBADA' then p.t_ev when 'RECHAZADA' then t.t_rej else coalesce(case when t.t_rereg <= t.t_lim then t.t_rereg end, p.t_reg) end
  from _pub p join _tl t on t.id = p.asig join _ag a on a.id = t.id
  join public.cuentas_sociales c on c.id = t.cuenta_social_id
  cross join lateral (select case when p.t_ev <= t.t_lim then 'APROBADA'
                                  when t.rech_ev and t.t_rej <= t.t_lim and t.t_rereg > t.t_lim then 'RECHAZADA' else 'PENDIENTE' end as estado) e
  where p.t_reg <= t.t_lim
  order by p.t_reg;
  get diagnostics v_k = row_count; r := r || jsonb_build_object('publicaciones', v_k);

  insert into public.metricas (id, publicacion_id, corte, fecha_corte, alcance, impresiones, reproducciones, espectadores_unicos,
    me_gusta, comentarios, compartidos, guardados, clics_enlace, visitas_perfil, tiempo_promedio_visualizacion_s,
    porcentaje_reproduccion_completa, captura_path, miniatura_path, estado_validacion, validada_por, validada_at, observaciones,
    created_at, updated_at)
  select m.id, m.pub_id, m.corte, m.fecha_corte,
         case when t.plataforma <> 'TIKTOK' then v.x end,
         case when t.plataforma <> 'TIKTOK' then round(v.x * p.f_imp) end,
         case when t.plataforma = 'TIKTOK' then v.x when t.formato_clave in ('REEL', 'VIDEO') then round(v.x * p.f_imp * (0.70 + p.r_misc * 0.25)) end,
         case when t.plataforma = 'TIKTOK' then round(v.x * 0.75) end,
         round(v.inter * case t.plataforma when 'INSTAGRAM' then 0.80 when 'FACEBOOK' then 0.85 else 0.82 end),
         round(v.inter * case t.plataforma when 'TIKTOK' then 0.06 else 0.08 end),
         round(v.inter * case t.plataforma when 'TIKTOK' then 0.09 else 0.07 end),
         case t.plataforma when 'INSTAGRAM' then round(v.inter * 0.05) when 'TIKTOK' then round(v.inter * 0.03) end,
         case when t.enlace then round(v.aud * (case t.plataforma when 'INSTAGRAM' then 0.004 when 'FACEBOOK' then 0.007 else 0.002 end) * (0.6 + m.r_a * 0.9)) end,
         round(v.aud * (0.005 + m.r_b * 0.015)),
         case when t.plataforma = 'TIKTOK' then round((6 + p.r_misc * 16)::numeric, 2) end,
         case when t.plataforma = 'TIKTOK' then round((12 + p.r_eng * 33)::numeric, 2) end,
         'muestras/metrica-' || lpad(m.muestra::text, 2, '0') || '.webp', 'muestras/metrica-' || lpad(m.muestra::text, 2, '0') || '-mini.webp',
         e.estado::public.validacion_estado,
         case when e.estado <> 'PENDIENTE' then t.u_ops end,
         case e.estado when 'APROBADA' then m.t_val when 'RECHAZADA' then m.t_rejm end,
         case when e.estado = 'RECHAZADA' then 'El alcance reportado no coincide con la captura de estadísticas: carga la captura completa del corte.'
              when e.estado = 'APROBADA' and p.inflada = 'ACEPTADA' then 'Alcance atípico validado contra las estadísticas nativas de la plataforma.' end,
         m.t_load, case e.estado when 'APROBADA' then m.t_val when 'RECHAZADA' then m.t_rejm else coalesce(case when m.t_fix <= t.t_lim then m.t_fix end, m.t_load) end
  from _met m join _pub p on p.id = m.pub_id join _tl t on t.id = m.asig
  cross join lateral (select case when m.t_rejm is not null and m.t_rejm <= t.t_lim and m.t_fix > t.t_lim then 'RECHAZADA'
                                  when m.t_val <= t.t_lim then 'APROBADA' else 'PENDIENTE' end as estado,
                             -- valores inflados mientras no se corrigen
                             case when p.inflada = 'ACEPTADA' or (p.inflada = 'RECHAZADA' and m.corte = 'H24' and m.t_fix > t.t_lim) then p.infl else 1 end as k) e
  cross join lateral (select greatest(1, round(p.base_d7 * m.frac * e.k)) as x) v0
  cross join lateral (select v0.x, case when t.plataforma = 'TIKTOK' then round(v0.x * 0.75) else v0.x end as aud) v1
  cross join lateral (select v1.x, v1.aud,
                             v1.aud / e.k * (case t.plataforma when 'INSTAGRAM' then 0.03 + p.r_eng * 0.04 when 'FACEBOOK' then 0.02 + p.r_eng * 0.03
                                                               else 0.04 + p.r_eng * 0.04 end) as inter) v
  where p.t_reg <= t.t_lim and m.t_load <= t.t_lim
  order by m.t_load;
  get diagnostics v_k = row_count; r := r || jsonb_build_object('metricas', v_k);

  return r;
end $fn$;
revoke all on function private.demo_mes_materializar() from public, anon, authenticated, service_role;

create or replace function private.demo_mes_asignaciones() returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_k integer;
  r jsonb := '{}';
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_asignaciones exige amo.modo_carga (solo el owner por conexión directa)';
  end if;

  -- Eventos de estado de cada asignación (≤ t_lim), en orden.
  create temp table _ev0 on commit drop as
  select q.* from (
    select t.id as asig, t.t_des as t, 10 as seq, 'RECHAZADA'::text as hacia, false as restaurar, t.u_medio as actor, 'MEDIO'::text as actor_tipo,
           'El medio desistió antes de descargar el contenido.'::text as motivo, null::text as causa, t.t_lim
    from _tl t where t.tipo = 'DESISTE'
    union all select t.id, t.t_desc, 20, 'CONTENIDO_ENTREGADO', false, t.u_medio, 'MEDIO', null, null, t.t_lim from _tl t where t.descargo
    union all select t.id, a.t_puba, 30, 'PUBLICADA', false, t.u_medio, 'MEDIO', null, null, t.t_lim from _tl t join _ag a on a.id = t.id
    union all select t.id, t.t_rej, 32, 'CONTENIDO_ENTREGADO', false, t.u_ops, 'ADMIN', 'La evidencia no muestra la etiqueta de publicidad.', null, t.t_lim from _tl t where t.rech_ev
    union all select t.id, t.t_rereg, 34, 'PUBLICADA', false, t.u_medio, 'MEDIO', null, null, t.t_lim from _tl t where t.rech_ev
    union all select t.id, a.t_eva, 40, 'EVIDENCIA_VALIDADA', false, t.u_ops, 'ADMIN', null, null, t.t_lim from _tl t join _ag a on a.id = t.id
    union all select t.id, a.t_mc, 50, 'METRICAS_CARGADAS', false, null, 'SISTEMA', null, null, t.t_lim from _tl t join _ag a on a.id = t.id
    union all select t.id, a.t_ver, 60, 'VERIFICADA', false, t.u_ops, 'ADMIN', null, null, t.t_lim from _tl t join _ag a on a.id = t.id
    union all select t.id, t.t_disp, 70, 'EN_DISPUTA', false,
                     case when t.r4 < 0.50 then t.u_anun when t.r4 < 0.85 then t.u_medio else t.u_ops end,
                     case when t.r4 < 0.50 then 'ANUNCIANTE' when t.r4 < 0.85 then 'MEDIO' else 'ADMIN' end,
                     (array['El contenido publicado no corresponde a la pieza entregada.', 'Las métricas reportadas no coinciden con la captura.',
                            'La publicación fue retirada antes de cumplir la permanencia.', 'No se reconoce el valor acordado para esta publicación.'])[1 + floor(t.r2 * 4)::integer],
                     null, t.t_lim
    from _tl t where t.tipo = 'DISPUTA'
    union all select t.id, t.t_res, 71, case when t.favor then null else 'CANCELADA' end, t.favor, t.u_ops, 'ADMIN',
                     case when t.favor then 'Disputa resuelta a favor del medio: la evidencia y las métricas son válidas.'
                          else 'Disputa resuelta a favor del anunciante: la publicación no cumplió lo pactado.' end,
                     case when not t.favor then (case when t.r6 < 0.6 then 'INCUMPLIMIENTO_MEDIO' else 'ACUERDO' end) end, t.t_lim
    from _tl t where t.tipo = 'DISPUTA'
    union all select t.id, t.t_canc, 80, 'CANCELADA', false, t.u_ops, 'ADMIN',
                     (array['Cancelación administrativa por ajuste de la campaña.', 'Cancelación por acuerdo entre las partes.',
                            'El medio no cumplió las condiciones de la oferta.', 'Se detectaron métricas alteradas.'])[case when t.r6 < 0.60 then 1 when t.r6 < 0.80 then 2 when t.r6 < 0.95 then 3 else 4 end],
                     case when t.r6 < 0.60 then 'ADMINISTRATIVA' when t.r6 < 0.80 then 'ACUERDO' when t.r6 < 0.95 then 'INCUMPLIMIENTO_MEDIO' else 'FRAUDE' end, t.t_lim
    from _tl t where t.tipo = 'CANCELA'
    union all select t.id, t.t_venc, 90, 'VENCIDA_SIN_PUBLICAR', false, null, 'SISTEMA', 'Venció la ventana de publicación sin evidencia', null, t.t_lim
    from _tl t where t.tipo = 'VENCE') q
  where q.t is not null and q.t <= q.t_lim;
  create temp table _ev on commit drop as
  with h as (
    select e.*, case when e.restaurar then lag(e.hacia, 2) over w else e.hacia end as hacia_f
    from _ev0 e window w as (partition by e.asig order by e.t, e.seq)
  )
  select h.asig, h.t, h.seq, coalesce(lag(h.hacia_f) over (partition by h.asig order by h.t, h.seq), 'ACEPTADA') as desde, h.hacia_f as hacia,
         h.restaurar, h.actor, h.actor_tipo, h.motivo, h.causa
  from h;

  create temp table _fin on commit drop as
  select e.asig,
         (array_agg(e.hacia order by e.t desc, e.seq desc))[1] as estado,
         (array_agg(e.desde order by e.t desc, e.seq desc) filter (where e.hacia = 'EN_DISPUTA'))[1] as previo,
         min(e.t) filter (where e.desde = 'ACEPTADA' and e.hacia = 'CONTENIDO_ENTREGADO') as contenido_at,
         max(e.t) filter (where e.desde = 'PUBLICADA' and e.hacia = 'CONTENIDO_ENTREGADO') as limpia_at,
         min(e.t) filter (where e.desde = 'PUBLICADA' and e.hacia = 'EVIDENCIA_VALIDADA') as evidencia_at,
         min(e.t) filter (where e.desde = 'EVIDENCIA_VALIDADA' and e.hacia = 'METRICAS_CARGADAS') as metricas_at,
         min(e.t) filter (where e.hacia = 'VERIFICADA') as verificada_at,
         max(e.t) filter (where e.hacia = 'RECHAZADA') as rechazada_at, max(e.t) filter (where e.hacia = 'VENCIDA_SIN_PUBLICAR') as vencida_at,
         max(e.t) filter (where e.hacia = 'EN_DISPUTA') as disputa_at, max(e.t) filter (where e.hacia = 'CANCELADA') as cancelada_at,
         (array_agg(e.causa order by e.t desc) filter (where e.causa is not null))[1] as causa,
         (array_agg(e.motivo order by e.t desc, e.seq desc) filter (where e.motivo is not null))[1] as motivo,
         max(e.t) as ultimo
  from _ev e group by e.asig;

  update public.asignaciones a
     set estado = f.estado::public.asignacion_estado,
         estado_previo_disputa = case when f.estado = 'EN_DISPUTA' then f.previo::public.asignacion_estado end,
         causa_cancelacion = case when f.estado = 'CANCELADA' then f.causa::public.cancelacion_causa end,
         contenido_descargado_at = f.contenido_at,
         publicada_at = (select min(e.t) from _ev e where e.asig = f.asig and e.desde = 'CONTENIDO_ENTREGADO' and e.hacia = 'PUBLICADA'
                           and e.t > coalesce(f.limpia_at, '-infinity')),
         evidencia_validada_at = f.evidencia_at, metricas_cargadas_at = f.metricas_at, verificada_at = f.verificada_at,
         rechazada_at = f.rechazada_at, vencida_at = f.vencida_at, en_disputa_at = f.disputa_at, cancelada_at = f.cancelada_at,
         motivo = case when f.estado in ('RECHAZADA', 'CANCELADA', 'VENCIDA_SIN_PUBLICAR', 'EN_DISPUTA') then f.motivo end,
         creativo_descargado_id = case when f.contenido_at is not null then t.creativo_id end,
         metricas_atrasadas_at = case when g.t_atr <= t.t_lim and g.t_atr < g.t_mc and f.evidencia_at <= g.t_atr
                                           and not coalesce(t.t_disp <= g.t_atr and g.t_atr < t.t_res, false) then g.t_atr end,
         updated_at = f.ultimo
  from _fin f join _tl t on t.id = f.asig left join _ag g on g.id = f.asig
  where a.id = f.asig;

  -- Disputas y sus mensajes.
  insert into public.disputas (id, asignacion_id, abierta_por, parte, motivo, descripcion, estado, estado_asignacion_origen, resolucion,
    estado_asignacion_resultante, resuelta_por, fecha_resolucion, created_at, updated_at)
  select private.uuid_v7(), t.id, e.actor, e.actor_tipo::public.disputa_parte,
         (case e.actor_tipo when 'ANUNCIANTE' then (array['CONTENIDO', 'METRICAS', 'PERMANENCIA', 'INCUMPLIMIENTO'])[1 + floor(t.r2 * 4)::integer]
                            when 'MEDIO' then (array['PAGO', 'METRICAS', 'OTRO', 'CONTENIDO'])[1 + floor(t.r2 * 4)::integer]
                            else (array['METRICAS', 'CONTENIDO', 'METRICAS', 'PERMANENCIA'])[1 + floor(t.r2 * 4)::integer] end)::public.disputa_motivo,
         e.motivo || ' Se solicita la revisión del caso por parte de la plataforma.',
         (case when t.t_res <= v_hoy then (case when t.favor and t.r3 < 0.15 then 'DESCARTADA' else 'RESUELTA' end)
               when t.t_rev <= v_hoy then 'EN_REVISION' else 'ABIERTA' end)::public.disputa_estado,
         e.desde::public.asignacion_estado,
         case when t.t_res <= v_hoy then (select x.motivo from _ev x where x.asig = t.id and x.seq = 71) end,
         case when t.t_res <= v_hoy then (select x.hacia from _ev x where x.asig = t.id and x.seq = 71)::public.asignacion_estado end,
         case when t.t_res <= v_hoy then t.u_ops end, case when t.t_res <= v_hoy then t.t_res end,
         t.t_disp, case when t.t_res <= v_hoy then t.t_res when t.t_rev <= v_hoy then t.t_rev else t.t_disp end
  from _tl t join _ev e on e.asig = t.id and e.seq = 70
  where t.tipo = 'DISPUTA';
  get diagnostics v_k = row_count; r := r || jsonb_build_object('disputas', v_k);
  insert into public.disputa_mensajes (disputa_id, autor_id, mensaje, interno, created_at)
  select d.id, x.autor, x.mensaje, x.interno, x.t
  from public.disputas d join _tl t on t.id = d.asignacion_id and t.tipo = 'DISPUTA'
  cross join lateral (values
    (d.abierta_por, 'Adjunto el detalle del caso para su revisión.', false, t.t_disp + interval '3 minutes'),
    (t.u_ops, 'Recibido. Revisamos la evidencia y las métricas y les informamos.', false, t.t_rev + interval '6 minutes'),
    (t.u_ops, 'Caso revisado contra las estadísticas nativas de la plataforma.', true, t.t_rev + interval '50 minutes'),
    (case when d.parte = 'MEDIO' then t.u_anun else t.u_medio end, 'Quedamos atentos a la decisión. Enviamos nuestra versión por este medio.', false,
     t.t_rev + (t.t_res - t.t_rev) * 0.5)) x (autor, mensaje, interno, t)
  where x.t <= least(v_hoy, t.t_res) order by x.t;

  return r;
end $fn$;
revoke all on function private.demo_mes_asignaciones() from public, anon, authenticated, service_role;

create or replace function private.demo_mes_estados() returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_estados exige amo.modo_carga (solo el owner por conexión directa)';
  end if;

  -- G. Contadores (cupos y presupuestos comprometidos) y estados finales de ofertas y campañas ----------------------------------------
  update public.oferta_cupos oc
     set cupos_ocupados = (select count(*) from public.asignaciones a where a.oferta_id = oc.oferta_id and a.franja_id = oc.franja_id
                             and private.consume_cupo(a.estado, a.estado_previo_disputa))
   where oc.oferta_id in (select o.id from _of o);
  update public.ofertas o
     set cupos_ocupados = (select count(*) from public.asignaciones a where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa)),
         presupuesto_comprometido = (select coalesce(sum(a.monto_bruto), 0) from public.asignaciones a
                                     where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa))
   where o.id in (select x.id from _of x);
  update public.campanas c
     set presupuesto_comprometido = (select coalesce(sum(a.monto_bruto), 0) from public.asignaciones a
                                     where a.campana_id = c.id and private.consume_cupo(a.estado, a.estado_previo_disputa))
   where c.id in (select x.id from _camp x);

  create temp table _oag on commit drop as
  select o.id, x.cupos_completos_at as t_cc, s.primera, s.aceptadas, s.abiertas, s.t_term,
         (select min(e.t) from _ev e join public.asignaciones a on a.id = e.asig
          where a.oferta_id = o.id and e.hacia in ('RECHAZADA', 'CANCELADA') and x.cupos_completos_at is not null
            and e.t > x.cupos_completos_at and e.t < least(o.v_ini, o.t_lim)) as t_rel
  from _of o join public.ofertas x on x.id = o.id
  cross join lateral (
    select min(a.aceptada_at) as primera, count(*) filter (where a.aceptada_at is not null) as aceptadas,
           count(*) filter (where a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA', 'RECHAZADA', 'VENCIDA_SIN_PUBLICAR', 'CANCELADA')) as abiertas,
           max(a.updated_at) filter (where a.aceptada_at is not null) as t_term
    from public.asignaciones a where a.oferta_id = o.id) s;

  create temp table _oev on commit drop as
  select q.* from (
    select o.id as oferta, o.t_env as t, 10 as seq, 'EN_REVISION'::text as hacia, o.usuario as actor, null::text as motivo from _of o
    union all select o.id, o.t_dev, 12, 'DEVUELTA', o.moderador, 'Ajusta el texto legal de la pieza y la fecha límite de aceptación.' from _of o where o.t_dev is not null
    union all select o.id, o.t_env2, 14, 'EN_REVISION', o.usuario, null from _of o where o.t_env2 is not null
    union all select o.id, o.t_canc, 16, 'CANCELADA', o.moderador, 'La pieza no cumple las políticas de contenido de la plataforma.' from _of o where o.t_canc is not null
    union all select o.id, o.t_pub, 20, 'PUBLICADA', o.moderador, null from _of o where o.t_canc is null
    union all select o.id, g.t_cc, 30, 'CUPOS_COMPLETOS', null, null from _of o join _oag g on g.id = o.id where g.t_cc is not null
    union all select o.id, g.t_rel, 32, 'PUBLICADA', null, null from _of o join _oag g on g.id = o.id where g.t_rel is not null
    union all select o.id, private.demo_tick(case when g.t_cc is not null and g.t_rel is null then o.v_ini else greatest(o.v_ini, g.primera) end, 5),
                     40, 'EN_EJECUCION', null, null
    from _of o join _oag g on g.id = o.id where o.t_canc is null and g.aceptadas > 0
    union all select o.id, private.demo_tick(o.t_lim, 5), 42, 'VENCIDA', null, null from _of o join _oag g on g.id = o.id where o.t_canc is null and g.aceptadas = 0
    union all select o.id, private.demo_tick(greatest(o.v_fin, coalesce(g.t_term, o.v_fin)), 5), 50, 'CERRADA', null, null
    from _of o join _oag g on g.id = o.id where o.t_canc is null and g.abiertas = 0) q
  where q.t is not null and q.t <= v_hoy;
  -- Una oferta sin aceptaciones se cierra después de vencer; sin vencer aún no puede estar cerrada.
  delete from _oev e where e.hacia = 'CERRADA'
    and not exists (select 1 from _oev x where x.oferta = e.oferta and x.hacia in ('EN_EJECUCION', 'VENCIDA') and x.t < e.t);

  update public.ofertas o
     set estado = coalesce(f.estado, 'BORRADOR')::public.oferta_estado,
         enviada_at = f.enviada_at, devuelta_at = f.devuelta_at, publicada_at = f.publicada_at, cupos_completos_at = f.cc_at,
         en_ejecucion_at = f.ej_at, vencida_at = f.vencida_at, cerrada_at = f.cerrada_at, cancelada_at = f.cancelada_at,
         comentario_moderacion = f.comentario, moderada_por = case when f.moderada then s.moderador end,
         updated_at = coalesce(f.ultimo, o.created_at)
  from _of s
  left join (select e.oferta, (array_agg(e.hacia order by e.t desc, e.seq desc))[1] as estado,
                    max(e.t) filter (where e.hacia = 'EN_REVISION') as enviada_at, max(e.t) filter (where e.hacia = 'DEVUELTA') as devuelta_at,
                    min(e.t) filter (where e.seq = 20) as publicada_at, max(e.t) filter (where e.hacia = 'CUPOS_COMPLETOS') as cc_at,
                    min(e.t) filter (where e.hacia = 'EN_EJECUCION') as ej_at, max(e.t) filter (where e.hacia = 'VENCIDA') as vencida_at,
                    max(e.t) filter (where e.hacia = 'CERRADA') as cerrada_at, max(e.t) filter (where e.hacia = 'CANCELADA') as cancelada_at,
                    (array_agg(e.motivo order by e.t desc) filter (where e.seq in (12, 16)))[1] as comentario,
                    bool_or(e.seq in (12, 16, 20)) as moderada, max(e.t) as ultimo
             from _oev e group by e.oferta) f on f.oferta = s.id
  where o.id = s.id;

  update public.campanas c
     set estado = 'FINALIZADA', finalizada_at = z.t, updated_at = z.t
  from (select k.id, private.demo_tick(greatest(private.inicio_dia(c2.fecha_fin + 1),
                                               (select max(coalesce(o.cerrada_at, o.cancelada_at)) from public.ofertas o where o.campana_id = k.id)), 5) as t
        from _camp k join public.campanas c2 on c2.id = k.id
        where c2.estado = 'ACTIVA'
          and not exists (select 1 from public.ofertas o where o.campana_id = k.id and o.estado not in ('CERRADA', 'CANCELADA'))) z
  where c.id = z.id and z.t <= v_hoy;

  return jsonb_build_object('ofertas_con_eventos', (select count(distinct e.oferta) from _oev e));
end $fn$;
revoke all on function private.demo_mes_estados() from public, anon, authenticated, service_role;

create or replace function private.demo_mes_eventos(p_mes date) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_ini timestamptz := p_mes::timestamp at time zone 'America/Bogota';
  v_fin_mes timestamptz := (p_mes + interval '1 month')::timestamp at time zone 'America/Bogota';
  v_fin timestamptz;
  v_k integer;
  r jsonb := '{}';
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_eventos exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  v_fin := least(v_fin_mes, v_hoy);

  -- H. Eventos para la bitácora (origen DEMO) --------------------------------------------------------------------------------------------
  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, motivo, cambios, metadatos)
  select c.t_c, c.usuario, 'campanas', c.id::text, 'INSERT', null, 'BORRADOR', null, jsonb_build_object('nombre', x.nombre, 'marca', x.marca), null::jsonb
  from _camp c join public.campanas x on x.id = c.id
  union all select c.t_act, c.usuario, 'campanas', c.id::text, 'TRANSICION', 'BORRADOR', 'ACTIVA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'BORRADOR', 'despues', 'ACTIVA')), null from _camp c where c.t_act <= v_hoy
  union all select x.finalizada_at, null, 'campanas', x.id::text, 'TRANSICION', 'ACTIVA', 'FINALIZADA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'ACTIVA', 'despues', 'FINALIZADA')), null
  from _camp c join public.campanas x on x.id = c.id where x.finalizada_at is not null
  union all select o.t_cre, o.usuario, 'ofertas', o.id::text, 'INSERT', null, 'BORRADOR', null, jsonb_build_object('titulo', o.titulo, 'plataforma', o.plataforma), null from _of o
  union all select e.t, e.actor, 'ofertas', e.oferta::text, 'TRANSICION',
                   coalesce(lag(e.hacia) over (partition by e.oferta order by e.t, e.seq), 'BORRADOR'), e.hacia, e.motivo,
                   jsonb_build_object('estado', jsonb_build_object('antes', coalesce(lag(e.hacia) over (partition by e.oferta order by e.t, e.seq), 'BORRADOR'), 'despues', e.hacia)), null
  from _oev e
  union all select a.created_at, um.usuario_id, 'asignaciones', a.id::text, 'INSERT', null, case when a.aceptada_at is null then 'RECHAZADA' else 'ACEPTADA' end, a.motivo,
                   jsonb_build_object('oferta_id', a.oferta_id, 'monto_bruto', a.monto_bruto, 'franja_clave', a.franja_clave), null
  from public.asignaciones a join _of o on o.id = a.oferta_id join private.demo_usuarios um on um.org_id = a.medio_id and um.principal
  union all select e.t, e.actor, 'asignaciones', e.asig::text, 'TRANSICION', e.desde, e.hacia, e.motivo,
                   jsonb_build_object('estado', jsonb_build_object('antes', e.desde, 'despues', e.hacia))
                   || case when e.causa is not null then jsonb_build_object('causa_cancelacion', jsonb_build_object('antes', null, 'despues', e.causa)) else '{}'::jsonb end, null
  from _ev e
  union all select p.created_at, um.usuario_id, 'publicaciones', p.id::text, 'INSERT', null, 'PENDIENTE', null,
                   jsonb_build_object('asignacion_id', p.asignacion_id, 'numero', p.numero, 'url_post', p.url_post), null
  from public.publicaciones p join _pub q on q.id = p.id join private.demo_usuarios um on um.org_id = p.medio_id and um.principal
  union all select t.t_rej, t.u_ops, 'publicaciones', q.id::text, 'TRANSICION', 'PENDIENTE', 'RECHAZADA', 'La evidencia no muestra la etiqueta de publicidad.',
                   jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'RECHAZADA')), null
  from _tl t join _pub q on q.asig = t.id where t.rech_ev and t.t_rej <= t.t_lim
  union all select t.t_rereg, t.u_medio, 'publicaciones', q.id::text, 'TRANSICION', 'RECHAZADA', 'PENDIENTE', null,
                   jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'RECHAZADA', 'despues', 'PENDIENTE')), null
  from _tl t join _pub q on q.asig = t.id where t.rech_ev and t.t_rereg <= t.t_lim
  union all select p.validada_at, p.validada_por, 'publicaciones', p.id::text, 'TRANSICION', 'PENDIENTE', 'APROBADA', null,
                   jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'APROBADA'),
                                      'etiqueta_verificada', jsonb_build_object('antes', false, 'despues', true)), null
  from public.publicaciones p join _pub q on q.id = p.id where p.estado_validacion = 'APROBADA'
  union all select m.created_at, um.usuario_id, 'metricas', m.id::text, 'INSERT', null, 'PENDIENTE', null,
                   jsonb_build_object('publicacion_id', m.publicacion_id, 'corte', m.corte, 'alcance_norm', m.alcance_norm), null
  from public.metricas m join _met q on q.id = m.id join private.demo_usuarios um on um.org_id = m.medio_id and um.principal
  union all select q.t_rejm, t.u_ops, 'metricas', q.id::text, 'TRANSICION', 'PENDIENTE', 'RECHAZADA', 'El alcance reportado no coincide con la captura.',
                   jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'RECHAZADA')), null
  from _met q join _tl t on t.id = q.asig where q.t_rejm <= t.t_lim and exists (select 1 from public.metricas m where m.id = q.id)
  union all select q.t_fix, t.u_medio, 'metricas', q.id::text, 'TRANSICION', 'RECHAZADA', 'PENDIENTE', null,
                   jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'RECHAZADA', 'despues', 'PENDIENTE')), null
  from _met q join _tl t on t.id = q.asig where q.t_fix <= t.t_lim and exists (select 1 from public.metricas m where m.id = q.id)
  union all select m.validada_at, m.validada_por, 'metricas', m.id::text, 'TRANSICION', 'PENDIENTE', 'APROBADA', m.observaciones,
                   jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'APROBADA')), null
  from public.metricas m join _met q on q.id = m.id where m.estado_validacion = 'APROBADA'
  union all select d.created_at, d.abierta_por, 'disputas', d.id::text, 'INSERT', null, 'ABIERTA', d.descripcion,
                   jsonb_build_object('asignacion_id', d.asignacion_id, 'motivo', d.motivo, 'parte', d.parte), null
  from public.disputas d join _tl t on t.id = d.asignacion_id
  union all select t.t_rev, t.u_ops, 'disputas', d.id::text, 'TRANSICION', 'ABIERTA', 'EN_REVISION', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'ABIERTA', 'despues', 'EN_REVISION')), null
  from public.disputas d join _tl t on t.id = d.asignacion_id where t.t_rev <= least(v_hoy, t.t_res)
  union all select d.fecha_resolucion, d.resuelta_por, 'disputas', d.id::text, 'TRANSICION', 'EN_REVISION', d.estado::text, d.resolucion,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'EN_REVISION', 'despues', d.estado)), null
  from public.disputas d join _tl t on t.id = d.asignacion_id where d.fecha_resolucion is not null
  union all select dc.descargado_at, t.u_medio, 'creativo_archivos', t.creativo_id::text, 'URL_FIRMADA', null, null, null, null,
                   jsonb_build_object('bucket', 'creativos', 'asignacion_id', t.id, 'vigencia_segundos', 300)
  from public.descargas_contenido dc join _tl t on t.id = dc.asignacion_id;
  get diagnostics v_k = row_count; r := r || jsonb_build_object('eventos', v_k);

  -- Exportaciones (≈ 40/mes) y datos revelados (≈ 15/mes).
  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, metadatos)
  select private.demo_instante(v_ini, v_fin), u.usuario_id, 'reportes', null, 'EXPORTAR',
         jsonb_build_object('reporte', (array['resumen_ejecutivo', 'desempeno_campanas', 'cumplimiento_medios', 'finanzas', 'cartera', 'cobertura_territorial',
                                              'usuarios_accesos'])[1 + floor(random() * 7)::integer],
                            'formato', (array['xlsx', 'pdf', 'csv'])[1 + floor(random() * 3)::integer], 'filas', 20 + floor(random() * 900)::integer,
                            'filtros', jsonb_build_object('desde', p_mes, 'hasta', (v_fin - interval '1 second')::date))
  from generate_series(1, greatest(2, round(40 * extract(epoch from (v_fin - v_ini)) / extract(epoch from (v_fin_mes - v_ini)))::integer)) g
  cross join lateral (select q.usuario_id from private.demo_usuarios q
                      where q.clase in ('ADMIN', 'OPERACIONES', 'FINANZAS') or (q.clase = 'ANUNCIANTE' and q.alta_at < v_ini)
                      order by random() + g * 0 limit 1) u;
  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, metadatos)
  select private.demo_instante(v_ini, v_fin), u.usuario_id, 'medios_privado', m.medio_id::text, 'REVELAR_DATO',
         jsonb_build_object('campos', case when random() < 0.5 then jsonb_build_array('titular_nombre', 'celular', 'email_contacto')
                                           else jsonb_build_array('tipo_documento', 'numero_documento_resumen', 'metodo_pago', 'datos_pago_resumen') end)
  from generate_series(1, greatest(1, round(15 * extract(epoch from (v_fin - v_ini)) / extract(epoch from (v_fin_mes - v_ini)))::integer)) g
  cross join lateral (select q.usuario_id from private.demo_usuarios q where q.clase in ('OPERACIONES', 'FINANZAS') order by random() + g * 0 limit 1) u
  cross join lateral (select d.medio_id from private.demo_medios d where d.verificado_at < v_fin order by random() + g * 0 limit 1) m;

  return r;
end $fn$;
revoke all on function private.demo_mes_eventos(date) from public, anon, authenticated, service_role;

create or replace function private.demo_mes_avisos() returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
begin
  if not private.modo_carga() then
    raise exception 'demo_mes_avisos exige amo.modo_carga (solo el owner por conexión directa)';
  end if;

  -- I. Avisos (se vuelcan solo los de los últimos meses; ver 06_cierre.sql) ----------------------------------------------------------------
  insert into private.demo_avisos (t, usuario_id, tipo, datos, entidad, entidad_id, prioridad)
  select o.t_pub, u.usuario_id, 'oferta.publicada', jsonb_build_object('oferta', o.titulo), 'ofertas', o.id::text, 0
  from _of o join private.demo_usuarios u on u.org_id = o.anunciante_id where o.t_canc is null and o.t_pub <= v_hoy
  union all select o.t_dev, u.usuario_id, 'oferta.devuelta', jsonb_build_object('oferta', o.titulo, 'motivo', 'Ajusta el texto legal de la pieza y la fecha límite de aceptación.'),
                   'ofertas', o.id::text, 1
  from _of o join private.demo_usuarios u on u.org_id = o.anunciante_id where o.t_dev <= v_hoy
  union all select o.t_pub, u.usuario_id, 'oferta.nueva_elegible',
                   jsonb_build_object('anunciante', an.nombre_comercial, 'oferta', o.titulo, 'plataforma', private.nombre_plataforma(o.plataforma),
                                      'fecha_limite', private.formato_fecha(o.t_lim)), 'ofertas', o.id::text, 1
  from _of o join _eleg e on e.oferta_id = o.id join private.demo_usuarios u on u.org_id = e.medio_id
  join public.anunciantes an on an.id = o.anunciante_id
  where o.t_canc is null and o.t_pub <= v_hoy and o.t_pub > v_hoy - interval '100 days'
  union all select e.t, u.usuario_id, 'asignacion.vencida',
                   jsonb_build_object('oferta', o.titulo, 'plazo_disputa', private.formato_fecha(e.t + interval '72 hours')), 'asignaciones', e.asig::text, 2
  from _ev e join _tl t on t.id = e.asig join _of o on o.id = t.oferta_id join private.demo_usuarios u on u.org_id = t.medio_id
  where e.hacia = 'VENCIDA_SIN_PUBLICAR'
  union all select e.t, u.usuario_id, 'asignacion.cancelada', jsonb_build_object('oferta', o.titulo, 'motivo', e.motivo), 'asignaciones', e.asig::text, 1
  from _ev e join _tl t on t.id = e.asig join _of o on o.id = t.oferta_id join private.demo_usuarios u on u.org_id in (t.medio_id, t.anunciante_id)
  where e.hacia = 'CANCELADA'
  union all select t.t_rej, u.usuario_id, 'evidencia.rechazada',
                   jsonb_build_object('oferta', o.titulo, 'motivo', 'La captura no muestra la etiqueta de publicidad ni la fecha de publicación.'), 'asignaciones', t.id::text, 2
  from _tl t join _of o on o.id = t.oferta_id join private.demo_usuarios u on u.org_id = t.medio_id where t.rech_ev and t.t_rej <= t.t_lim
  union all select q.t_rejm, u.usuario_id, 'metricas.rechazadas',
                   jsonb_build_object('oferta', o.titulo, 'corte', q.corte, 'motivo', 'El alcance reportado no coincide con la captura de estadísticas.'), 'asignaciones', t.id::text, 2
  from _met q join _tl t on t.id = q.asig join _of o on o.id = t.oferta_id join private.demo_usuarios u on u.org_id = t.medio_id
  where q.t_rejm <= t.t_lim
  union all select d.created_at, u.usuario_id, 'disputa.abierta',
                   jsonb_build_object('oferta', o.titulo, 'motivo', case d.motivo when 'INCUMPLIMIENTO' then 'incumplimiento' when 'METRICAS' then 'métricas'
                     when 'CONTENIDO' then 'contenido' when 'PERMANENCIA' then 'permanencia' when 'PAGO' then 'pago' else 'otro motivo' end), 'disputas', d.id::text, 2
  from public.disputas d join _tl t on t.id = d.asignacion_id join _of o on o.id = t.oferta_id
  join private.demo_usuarios u on (d.parte <> 'MEDIO' and u.org_id = t.medio_id) or (d.parte <> 'ANUNCIANTE' and u.org_id = t.anunciante_id)
  union all select d.fecha_resolucion, u.usuario_id, 'disputa.resuelta', jsonb_build_object('oferta', o.titulo, 'resultado', d.resolucion), 'disputas', d.id::text, 1
  from public.disputas d join _tl t on t.id = d.asignacion_id join _of o on o.id = t.oferta_id
  join private.demo_usuarios u on u.org_id in (t.medio_id, t.anunciante_id)
  where d.fecha_resolucion is not null
  union all select a.metricas_atrasadas_at, u.usuario_id, 'asignacion.metricas_atrasadas', jsonb_build_object('oferta', o.titulo, 'corte', 'D7'), 'asignaciones', a.id::text, 2
  from public.asignaciones a join _of o on o.id = a.oferta_id join private.demo_usuarios u on u.org_id = a.medio_id
  where a.metricas_atrasadas_at is not null;

  return jsonb_build_object('estados', (select jsonb_object_agg(z.estado, z.n)
    from (select a.estado, count(*) as n from public.asignaciones a join _of o on o.id = a.oferta_id group by a.estado) z));
end $fn$;
revoke all on function private.demo_mes_avisos() from public, anon, authenticated, service_role;

create or replace function private.demo_mes(p_mes date, p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare r jsonb;
begin
  r := private.demo_mes_oferta(p_mes, p_semilla);
  r := r || private.demo_mes_tiempos();
  r := r || private.demo_mes_materializar();
  r := r || private.demo_mes_asignaciones();
  r := r || private.demo_mes_estados();
  r := r || private.demo_mes_eventos(p_mes);
  r := r || private.demo_mes_avisos();
  return jsonb_build_object('mes', p_mes) || r;
end $fn$;
revoke all on function private.demo_mes(date, double precision) from public, anon, authenticated, service_role;
