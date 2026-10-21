-- Migración 9b · analitica_admin (docs/modelo-datos.md §5.9, docs/kpis.md §1, §4)
-- RPC del tablero administrativo y de accesos: kpis_admin, serie_gmv, embudo_asignaciones, mezcla_plataformas,
-- salud_medios, medios_en_riesgo, actividad_heatmap y metricas_accesos. Todas security invoker (la RLS del usuario
-- limita las filas), STABLE, search_path '' y timezone America/Bogota; la primera instrucción exige sesión válida y
-- permiso. Las tasas agregadas devuelven valor null con n < analitica.n_minimo_tasas (docs/kpis.md §0.4).

-- 1. kpis_admin (inicio.admin): las 16 tarjetas del tablero (docs/kpis.md §1)
create function public.kpis_admin(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns setof public.kpi_fila
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_lo timestamptz;
  v_hi timestamptz;
  v_ag jsonb;
  v_defs constant jsonb := '[
    {"kpi": "gmv_comprometido", "orden": 1, "tipo": "suma", "unidad": "COP"},
    {"kpi": "gmv_verificado", "orden": 2, "tipo": "suma", "unidad": "COP"},
    {"kpi": "comision", "orden": 3, "tipo": "suma", "unidad": "COP"},
    {"kpi": "take_rate", "orden": 4, "tipo": "razon", "unidad": "%", "nmin": true},
    {"kpi": "negocios_cerrados", "orden": 5, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "ofertas_publicadas", "orden": 6, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "tasa_llenado", "orden": 7, "tipo": "razon", "unidad": "%", "nmin": true},
    {"kpi": "tiempo_medio_llenado_h", "orden": 8, "tipo": "razon", "unidad": "h", "nmin": true},
    {"kpi": "tasa_aceptacion", "orden": 9, "tipo": "razon", "unidad": "%", "nmin": true},
    {"kpi": "tasa_cumplimiento", "orden": 10, "tipo": "razon", "unidad": "%", "nmin": true},
    {"kpi": "alcance_total", "orden": 11, "tipo": "suma", "unidad": "personas"},
    {"kpi": "medios_activos", "orden": 12, "tipo": "distinto", "unidad": "conteo"},
    {"kpi": "medios_nuevos", "orden": 13, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "medios_en_riesgo", "orden": 14, "tipo": "suma", "unidad": "conteo", "foto": true},
    {"kpi": "anunciantes_activos", "orden": 15, "tipo": "distinto", "unidad": "conteo"},
    {"kpi": "ticket_promedio", "orden": 16, "tipo": "razon_distinto", "unidad": "COP"}]';
begin
  perform private.exigir_permiso('inicio.admin');
  select * into g from private.rango_kpi(p_desde, p_hasta, p_desde_ant, p_hasta_ant);
  v_lo := least(g.ini, g.ini_ant);
  v_hi := greatest(g.fin, g.fin_ant);

  with hechos (kpi, t, num, den, n, clave) as (
    -- 1.1, 1.15, 1.16: aceptadas que siguen consumiendo cupo (ancla aceptada_at)
    select k.kpi, a.aceptada_at, a.monto_bruto, null::numeric, 1, a.anunciante_id::text
    from public.asignaciones a
    cross join (values ('gmv_comprometido'), ('anunciantes_activos'), ('ticket_promedio')) k (kpi)
    where a.aceptada_at >= v_lo and a.aceptada_at < v_hi and private.consume_cupo(a.estado, a.estado_previo_disputa)
    union all
    -- 1.2 – 1.5: CUMPLIDAS (ancla verificada_at)
    select k.kpi, a.verificada_at,
           case k.kpi when 'gmv_verificado' then a.monto_bruto when 'negocios_cerrados' then 1 else am.monto_comision end,
           case when k.kpi = 'take_rate' then a.monto_bruto end, 1, null
    from public.asignaciones a
    left join public.asignacion_montos am on am.asignacion_id = a.id
    cross join (values ('gmv_verificado'), ('comision'), ('take_rate'), ('negocios_cerrados')) k (kpi)
    where a.verificada_at >= v_lo and a.verificada_at < v_hi and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    union all
    -- 1.6
    select 'ofertas_publicadas', o.publicada_at, 1, null, 1, null
    from public.ofertas o
    where o.publicada_at >= v_lo and o.publicada_at < v_hi and o.deleted_at is null
    union all
    -- 1.7: ofertas con la ventana de aceptación cerrada; aceptaciones hasta la fecha límite, topadas en los cupos
    select 'tasa_llenado', o.fecha_limite_aceptacion,
           least((select count(*) from public.asignaciones a
                  where a.oferta_id = o.id and a.aceptada_at is not null and a.aceptada_at <= o.fecha_limite_aceptacion),
                 o.cupos_totales),
           o.cupos_totales, 1, null
    from public.ofertas o
    where o.fecha_limite_aceptacion >= v_lo and o.fecha_limite_aceptacion < v_hi
      and o.fecha_limite_aceptacion <= private.ahora() and o.publicada_at is not null and o.deleted_at is null
      and o.estado <> 'CANCELADA'
    union all
    -- 1.8
    select 'tiempo_medio_llenado_h', o.llena_at, extract(epoch from (o.llena_at - o.publicada_at)) / 3600.0, 1, 1, null
    from public.ofertas o
    where o.llena_at >= v_lo and o.llena_at < v_hi and o.publicada_at is not null and o.deleted_at is null
    union all
    -- 1.9
    select 'tasa_aceptacion', v.primera_vista_at,
           case when exists (select 1 from public.asignaciones a
                             where a.oferta_id = v.oferta_id and a.medio_id = v.medio_id and a.aceptada_at is not null)
                then 1 else 0 end,
           1, 1, null
    from public.oferta_vistas v
    where v.primera_vista_at >= v_lo and v.primera_vista_at < v_hi
    union all
    -- 1.10
    select 'tasa_cumplimiento', a.fecha_limite_publicacion,
           case when private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at, a.evidencia_validada_at,
                                             a.fecha_limite_publicacion) then 1 else 0 end,
           1, 1, null
    from public.asignaciones a
    where a.fecha_limite_publicacion >= v_lo and a.fecha_limite_publicacion < v_hi and a.aceptada_at is not null
      and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                      a.fecha_limite_publicacion)
    union all
    -- 1.11
    select 'alcance_total', d.verificada_at, d.alcance, null, 1, null
    from private.desempeno_verificadas(v_lo, v_hi) d
    where d.alcance is not null
    union all
    -- 1.12: medio verificado con aceptación o publicación en el periodo
    select 'medios_activos', a.aceptada_at, 0, null, 1, a.medio_id::text
    from public.asignaciones a join public.medios m on m.id = a.medio_id
    where a.aceptada_at >= v_lo and a.aceptada_at < v_hi and m.estado = 'VERIFICADO' and m.deleted_at is null
    union all
    select 'medios_activos', a.publicada_at, 0, null, 1, a.medio_id::text
    from public.asignaciones a join public.medios m on m.id = a.medio_id
    where a.publicada_at >= v_lo and a.publicada_at < v_hi and m.estado = 'VERIFICADO' and m.deleted_at is null
    union all
    -- 1.13
    select 'medios_nuevos', m.verificado_at, 1, null, 1, null
    from public.medios m
    where m.verificado_at >= v_lo and m.verificado_at < v_hi and m.deleted_at is null
  ), etiquetado as (
    select h.kpi, x.grupo, h.num, h.den, h.n, h.clave
    from hechos h
    cross join lateral (values
      (case when h.t >= g.ini and h.t < g.fin then 'act' end),
      (case when h.t >= g.ini_ant and h.t < g.fin_ant then 'ant' end),
      (case when h.t >= g.ini and h.t < g.fin then 'b' || private.cubeta(h.t, g.dias)::text end)) x (grupo)
    where x.grupo is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('kpi', s.kpi, 'grupo', s.grupo, 'num', s.num, 'den', s.den, 'n', s.n,
                                               'nd', s.nd)), '[]')
    into v_ag
  from (select e.kpi, e.grupo, sum(e.num) as num, sum(e.den) as den, sum(e.n) as n, count(distinct e.clave) as nd
        from etiquetado e
        group by e.kpi, e.grupo
        union all
        -- 1.14: foto al cierre de cada periodo
        select 'medios_en_riesgo', 'act', count(*), null, count(*), null from private.medios_en_riesgo_al(g.fin)
        union all
        select 'medios_en_riesgo', 'ant', count(*), null, count(*), null from private.medios_en_riesgo_al(g.fin_ant)) s;

  return query select * from private.kpi_ensamblar(v_defs, v_ag, private.cubetas(p_desde, p_hasta),
                                                   private.config_entero('analitica.n_minimo_tasas'));
end $$;
revoke all on function public.kpis_admin(date, date, date, date) from public, anon, authenticated;
grant execute on function public.kpis_admin(date, date, date, date) to authenticated;

-- 2. serie_gmv (inicio.admin o analitica.global): GMV comprometido/verificado, comisión, negocios y aceptaciones
-- (todas, aunque luego se cayeran) por día, semana ISO o mes, con periodos vacíos en 0.
create function public.serie_gmv(p_desde date, p_hasta date, p_granularidad text)
returns table (periodo date, gmv_comprometido numeric, gmv_verificado numeric, comision numeric, negocios integer,
               asignaciones_aceptadas integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_unidad text;
begin
  perform private.exigir_permiso('inicio.admin', 'analitica.global');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  v_unidad := case p_granularidad when 'dia' then 'day' when 'semana' then 'week' when 'mes' then 'month' end;
  if v_unidad is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La granularidad debe ser dia, semana o mes.';
  end if;
  return query
  with periodos as (
    select gs::date as periodo
    from generate_series(date_trunc(v_unidad, p_desde::timestamp), p_hasta::timestamp, ('1 ' || v_unidad)::interval) gs
  ), aceptadas as (
    select date_trunc(v_unidad, a.aceptada_at)::date as periodo,
           sum(a.monto_bruto) filter (where private.consume_cupo(a.estado, a.estado_previo_disputa)) as gmv,
           count(*) as n
    from public.asignaciones a
    where a.aceptada_at >= g.ini and a.aceptada_at < g.fin
    group by 1
  ), verificadas as (
    select date_trunc(v_unidad, a.verificada_at)::date as periodo, sum(a.monto_bruto) as gmv,
           sum(am.monto_comision) as comision, count(*) as n
    from public.asignaciones a
    left join public.asignacion_montos am on am.asignacion_id = a.id
    where a.verificada_at >= g.ini and a.verificada_at < g.fin and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    group by 1
  )
  select p.periodo, coalesce(ac.gmv, 0), coalesce(v.gmv, 0), coalesce(v.comision, 0), coalesce(v.n, 0)::integer,
         coalesce(ac.n, 0)::integer
  from periodos p
  left join aceptadas ac on ac.periodo = p.periodo
  left join verificadas v on v.periodo = p.periodo
  order by p.periodo;
end $$;
revoke all on function public.serie_gmv(date, date, text) from public, anon, authenticated;
grant execute on function public.serie_gmv(date, date, text) to authenticated;

-- 3. embudo_asignaciones (inicio.admin): vistas (pares oferta×medio con primera vista en el periodo) y la cohorte de
-- aceptadas en el periodo según la etapa más avanzada que alcanzaron (timestamps de transición).
create function public.embudo_asignaciones(p_desde date, p_hasta date)
returns table (etapa text, orden smallint, cantidad integer, porcentaje_inicio numeric, porcentaje_anterior numeric)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record;
begin
  perform private.exigir_permiso('inicio.admin');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with cohorte as (
    select count(*) as aceptadas,
           count(*) filter (where a.contenido_descargado_at is not null) as contenido_entregado,
           count(*) filter (where a.publicada_at is not null or a.evidencia_validada_at is not null) as publicadas,
           count(*) filter (where a.evidencia_validada_at is not null) as evidencia_validada,
           count(*) filter (where a.metricas_cargadas_at is not null) as metricas_cargadas,
           count(*) filter (where a.verificada_at is not null) as verificadas,
           count(*) filter (where a.pagada_at is not null) as pagadas
    from public.asignaciones a
    where a.aceptada_at >= g.ini and a.aceptada_at < g.fin
  ), vistas as (
    select count(*) as vistas from public.oferta_vistas v where v.primera_vista_at >= g.ini and v.primera_vista_at < g.fin
  ), etapas as (
    select e.etapa, e.orden::smallint as orden, e.cantidad::integer as cantidad
    from cohorte c cross join vistas v
    cross join lateral (values ('vistas', 1, v.vistas), ('aceptadas', 2, c.aceptadas),
                               ('contenido_entregado', 3, c.contenido_entregado), ('publicadas', 4, c.publicadas),
                               ('evidencia_validada', 5, c.evidencia_validada), ('metricas_cargadas', 6, c.metricas_cargadas),
                               ('verificadas', 7, c.verificadas), ('pagadas', 8, c.pagadas)) e (etapa, orden, cantidad)
  )
  select e.etapa, e.orden, e.cantidad,
         round(e.cantidad::numeric / nullif(first_value(e.cantidad) over (order by e.orden), 0), 6),
         round(e.cantidad::numeric / nullif(lag(e.cantidad) over (order by e.orden), 0), 6)
  from etapas e
  order by e.orden;
end $$;
revoke all on function public.embudo_asignaciones(date, date) from public, anon, authenticated;
grant execute on function public.embudo_asignaciones(date, date) to authenticated;

-- 4. mezcla_plataformas (inicio.admin o analitica.global): verificadas en el periodo por plataforma × formato.
-- CPM = Σ bruto / Σ impresiones × 1000 sobre las asignaciones con impresiones (n mínimo de tasas).
create function public.mezcla_plataformas(p_desde date, p_hasta date)
returns table (plataforma public.plataforma, formato_clave text, formato_nombre text, asignaciones integer, gmv numeric,
               alcance bigint, participacion_gmv numeric, cpm_efectivo numeric)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_nmin integer := private.config_entero('analitica.n_minimo_tasas');
begin
  perform private.exigir_permiso('inicio.admin', 'analitica.global');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with agregado as (
    select d.plataforma, f.clave, f.nombre, count(*) as n, sum(d.monto_bruto) as gmv, sum(d.alcance) as alcance,
           sum(d.monto_bruto) filter (where d.impresiones > 0) as bruto_imp,
           sum(d.impresiones) filter (where d.impresiones > 0) as impresiones,
           count(*) filter (where d.impresiones > 0) as n_imp
    from private.desempeno_verificadas(g.ini, g.fin) d
    join public.ofertas o on o.id = d.oferta_id
    join public.formatos f on f.id = o.formato_id
    group by d.plataforma, f.clave, f.nombre
  )
  select x.plataforma, x.clave, x.nombre, x.n::integer, x.gmv, coalesce(x.alcance, 0)::bigint,
         round(x.gmv / nullif(sum(x.gmv) over (), 0), 6),
         case when x.n_imp >= v_nmin then round(x.bruto_imp / nullif(x.impresiones, 0) * 1000, 2) end
  from agregado x
  order by x.gmv desc, x.plataforma, x.clave;
end $$;
revoke all on function public.mezcla_plataformas(date, date) from public, anon, authenticated;
grant execute on function public.mezcla_plataformas(date, date) to authenticated;

-- 5. salud_medios (inicio.admin): segmentos (no excluyentes) al cierre del periodo. gmv_en_juego = GMV de
-- asignaciones CUMPLIDAS aceptadas en los últimos `medios.dias_actividad` días por los medios del segmento;
-- porcentaje sobre los medios verificados o suspendidos.
create function public.salud_medios(p_desde date, p_hasta date)
returns table (segmento text, cantidad integer, gmv_en_juego numeric, porcentaje numeric)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_act interval := make_interval(days => private.config_entero('medios.dias_actividad'));
begin
  perform private.exigir_permiso('inicio.admin');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with ventana as (
    select a.medio_id,
           coalesce(sum(a.monto_bruto) filter (where a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')), 0) as gmv
    from public.asignaciones a
    where a.aceptada_at >= g.fin - v_act and a.aceptada_at < g.fin
    group by a.medio_id
  ), miembros as (
    select 'activos'::text as segmento, x.medio_id
    from (select a.medio_id from public.asignaciones a
          where (a.aceptada_at >= g.ini and a.aceptada_at < g.fin) or (a.publicada_at >= g.ini and a.publicada_at < g.fin)
          group by a.medio_id) x
    join public.medios m on m.id = x.medio_id and m.estado = 'VERIFICADO' and m.deleted_at is null
    union all
    select 'nuevos', m.id from public.medios m
    where m.verificado_at >= g.ini and m.verificado_at < g.fin and m.deleted_at is null
    union all
    select 'en_riesgo', r.medio_id from private.medios_en_riesgo_al(g.fin) r
    union all
    select 'inactivos', m.id from public.medios m
    where m.estado = 'VERIFICADO' and m.deleted_at is null
      and not exists (select 1 from ventana w where w.medio_id = m.id)
    union all
    select 'suspendidos', m.id from public.medios m where m.estado = 'SUSPENDIDO' and m.deleted_at is null
  ), base as (
    select count(*) as total from public.medios m where m.estado in ('VERIFICADO', 'SUSPENDIDO') and m.deleted_at is null
  )
  select s.segmento, count(mi.medio_id)::integer, coalesce(sum(w.gmv), 0),
         round(count(mi.medio_id)::numeric / nullif(b.total, 0), 6)
  from (values ('activos', 1), ('nuevos', 2), ('en_riesgo', 3), ('inactivos', 4), ('suspendidos', 5)) s (segmento, orden)
  cross join base b
  left join miembros mi on mi.segmento = s.segmento
  left join ventana w on w.medio_id = mi.medio_id
  group by s.segmento, s.orden, b.total
  order by s.orden;
end $$;
revoke all on function public.salud_medios(date, date) from public, anon, authenticated;
grant execute on function public.salud_medios(date, date) to authenticated;

-- 6. medios_en_riesgo (inicio.admin): detalle a hoy, por GMV en juego.
create function public.medios_en_riesgo(p_limite integer default 10)
returns table (medio_id uuid, nombre text, departamento text, ultima_actividad_at timestamptz,
               ultima_aceptacion_at timestamptz, gmv_90d numeric, asignaciones_abiertas integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
begin
  perform private.exigir_permiso('inicio.admin');
  return query
  select r.medio_id, m.nombre, d.nombre,
         greatest(r.ultima_aceptacion_at, (select max(a.publicada_at) from public.asignaciones a where a.medio_id = r.medio_id)),
         r.ultima_aceptacion_at, r.gmv_90d,
         (select count(*) from public.asignaciones a
          where a.medio_id = r.medio_id and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA',
                                                          'METRICAS_CARGADAS', 'EN_DISPUTA'))::integer
  from private.medios_en_riesgo_al(private.ahora()) r
  join public.medios m on m.id = r.medio_id
  left join public.departamentos d on d.codigo = m.departamento_codigo
  order by r.gmv_90d desc, r.ultima_aceptacion_at, m.nombre
  limit least(greatest(coalesce(p_limite, 10), 1), 100);
end $$;
revoke all on function public.medios_en_riesgo(integer) from public, anon, authenticated;
grant execute on function public.medios_en_riesgo(integer) to authenticated;

-- 7. actividad_heatmap: 168 celdas día ISO (1 = lunes) × hora de Bogotá. Fuentes: asignaciones (aceptada_at) y
-- publicaciones (fecha_publicacion) con inicio.admin; accesos (LOGIN_EXITOSO) con accesos.ver; bitacora (created_at)
-- con auditoria.ver.
create function public.actividad_heatmap(p_desde date, p_hasta date, p_fuente text default 'asignaciones')
returns table (dia_semana smallint, hora smallint, cantidad integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record;
begin
  case p_fuente
    when 'asignaciones', 'publicaciones' then perform private.exigir_permiso('inicio.admin');
    when 'accesos' then perform private.exigir_permiso('accesos.ver');
    when 'bitacora' then perform private.exigir_permiso('auditoria.ver');
    else
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'La fuente debe ser asignaciones, publicaciones, accesos o bitacora.';
  end case;
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with instantes as (
    select a.aceptada_at as t from public.asignaciones a
    where p_fuente = 'asignaciones' and a.aceptada_at >= g.ini and a.aceptada_at < g.fin
    union all
    select p.fecha_publicacion from public.publicaciones p
    where p_fuente = 'publicaciones' and p.fecha_publicacion >= g.ini and p.fecha_publicacion < g.fin
    union all
    select x.created_at from public.accesos x
    where p_fuente = 'accesos' and x.evento = 'LOGIN_EXITOSO' and x.created_at >= g.ini and x.created_at < g.fin
    union all
    select b.created_at from public.bitacora b
    where p_fuente = 'bitacora' and b.created_at >= g.ini and b.created_at < g.fin
  ), conteo as (
    select extract(isodow from i.t)::smallint as d, extract(hour from i.t)::smallint as h, count(*) as n
    from instantes i
    group by 1, 2
  )
  select dd.d::smallint, hh.h::smallint, coalesce(c.n, 0)::integer
  from generate_series(1, 7) dd (d)
  cross join generate_series(0, 23) hh (h)
  left join conteo c on c.d = dd.d and c.h = hh.h
  order by 1, 2;
end $$;
revoke all on function public.actividad_heatmap(date, date, text) from public, anon, authenticated;
grant execute on function public.actividad_heatmap(date, date, text) to authenticated;

-- 8. metricas_accesos (accesos.ver): tarjetas del registro de accesos (docs/kpis.md §4).
create function public.metricas_accesos(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns setof public.kpi_fila
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_lo timestamptz;
  v_hi timestamptz;
  v_ag jsonb;
  v_defs constant jsonb := '[
    {"kpi": "accesos_exitosos", "orden": 1, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "accesos_fallidos", "orden": 2, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "bloqueos", "orden": 3, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "tasa_fallo", "orden": 4, "tipo": "razon", "unidad": "%", "nmin": true},
    {"kpi": "usuarios_unicos", "orden": 5, "tipo": "distinto", "unidad": "conteo"},
    {"kpi": "paises_distintos", "orden": 6, "tipo": "distinto", "unidad": "conteo"},
    {"kpi": "accesos_sospechosos", "orden": 7, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "mfa_fallidos", "orden": 8, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "sesiones_revocadas", "orden": 9, "tipo": "suma", "unidad": "conteo"}]';
begin
  perform private.exigir_permiso('accesos.ver');
  select * into g from private.rango_kpi(p_desde, p_hasta, p_desde_ant, p_hasta_ant);
  v_lo := least(g.ini, g.ini_ant);
  v_hi := greatest(g.fin, g.fin_ant);

  with hechos (kpi, t, num, den, n, clave) as (
    select k.kpi, a.created_at, k.num, k.den, 1, k.clave
    from public.accesos a
    cross join lateral (values
      ('accesos_exitosos', case when a.evento = 'LOGIN_EXITOSO' then 1 end, null::numeric, null::text),
      ('accesos_fallidos', case when a.evento = 'LOGIN_FALLIDO' then 1 end, null, null),
      ('bloqueos', case when a.evento = 'LOGIN_BLOQUEADO' then 1 end, null, null),
      ('tasa_fallo', case when a.evento in ('LOGIN_EXITOSO', 'LOGIN_FALLIDO') then (a.evento = 'LOGIN_FALLIDO')::integer end,
       1, null),
      ('usuarios_unicos', case when a.evento = 'LOGIN_EXITOSO' and a.usuario_id is not null then 0 end, null, a.usuario_id::text),
      ('paises_distintos', case when a.evento = 'LOGIN_EXITOSO' and a.pais_iso2 is not null then 0 end, null, a.pais_iso2::text),
      ('accesos_sospechosos', case when a.es_sospechoso then 1 end, null, null),
      ('mfa_fallidos', case when a.evento = 'MFA_FALLIDO' then 1 end, null, null),
      ('sesiones_revocadas', case when a.evento in ('SESION_REVOCADA', 'USUARIO_SUSPENDIDO') then 1 end, null, null)
    ) k (kpi, num, den, clave)
    where a.created_at >= v_lo and a.created_at < v_hi and k.num is not null
  ), etiquetado as (
    select h.kpi, x.grupo, h.num, h.den, h.n, h.clave
    from hechos h
    cross join lateral (values
      (case when h.t >= g.ini and h.t < g.fin then 'act' end),
      (case when h.t >= g.ini_ant and h.t < g.fin_ant then 'ant' end),
      (case when h.t >= g.ini and h.t < g.fin then 'b' || private.cubeta(h.t, g.dias)::text end)) x (grupo)
    where x.grupo is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('kpi', s.kpi, 'grupo', s.grupo, 'num', s.num, 'den', s.den, 'n', s.n,
                                               'nd', s.nd)), '[]')
    into v_ag
  from (select e.kpi, e.grupo, sum(e.num) as num, sum(e.den) as den, sum(e.n) as n, count(distinct e.clave) as nd
        from etiquetado e
        group by e.kpi, e.grupo) s;

  return query select * from private.kpi_ensamblar(v_defs, v_ag, private.cubetas(p_desde, p_hasta),
                                                   private.config_entero('analitica.n_minimo_tasas'));
end $$;
revoke all on function public.metricas_accesos(date, date, date, date) from public, anon, authenticated;
grant execute on function public.metricas_accesos(date, date, date, date) to authenticated;

-- 9. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public'
                       and p.proname in ('kpis_admin', 'serie_gmv', 'embudo_asignaciones', 'mezcla_plataformas', 'salud_medios',
                                         'medios_en_riesgo', 'actividad_heatmap', 'metricas_accesos')
                       and (p.prosecdef or p.provolatile <> 's'
                            or not exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=america/bogota'))),
         'las RPC de analítica deben ser invoker, STABLE y con timezone America/Bogota';
end $$;
