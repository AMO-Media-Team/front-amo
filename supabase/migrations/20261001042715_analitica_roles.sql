-- Migración 9d · analitica_roles (docs/modelo-datos.md §5.9, docs/kpis.md §2, §3)
-- Tablero del anunciante (kpis_anunciante, desempeno_anunciante: invoker, filtradas a su organización; razones de
-- una sola entidad con valor y n, sin mínimo) y del medio (kpis_medio, serie_ganancias_medio, proximas_acciones_medio:
-- security DEFINER con filtro explícito medio_id = mi_medio_id() y acceso_valido(), porque el medio no lee
-- asignaciones ni asignacion_montos en la tabla base, §5.0).

-- 1. kpis_anunciante (inicio.anunciante)
create function public.kpis_anunciante(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns setof public.kpi_fila
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_lo timestamptz;
  v_hi timestamptz;
  v_ag jsonb;
  v_an uuid;
  v_defs constant jsonb := '[
    {"kpi": "inversion_comprometida", "orden": 1, "tipo": "suma", "unidad": "COP"},
    {"kpi": "inversion_verificada", "orden": 2, "tipo": "suma", "unidad": "COP"},
    {"kpi": "campanas_activas", "orden": 3, "tipo": "suma", "unidad": "conteo", "foto": true},
    {"kpi": "ofertas_publicadas", "orden": 4, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "tasa_llenado", "orden": 5, "tipo": "razon", "unidad": "%"},
    {"kpi": "medios_alcanzados", "orden": 6, "tipo": "distinto", "unidad": "conteo"},
    {"kpi": "alcance_total", "orden": 7, "tipo": "suma", "unidad": "personas"},
    {"kpi": "impresiones", "orden": 8, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "interacciones", "orden": 9, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "reproducciones", "orden": 10, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "clics", "orden": 11, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "cpm_efectivo", "orden": 12, "tipo": "razon", "unidad": "COP"},
    {"kpi": "costo_por_interaccion", "orden": 13, "tipo": "razon", "unidad": "COP"},
    {"kpi": "engagement", "orden": 14, "tipo": "razon", "unidad": "%"},
    {"kpi": "costo_por_alcance", "orden": 15, "tipo": "razon", "unidad": "COP"},
    {"kpi": "tasa_cumplimiento", "orden": 16, "tipo": "razon", "unidad": "%"}]';
begin
  perform private.exigir_permiso('inicio.anunciante');
  v_an := private.mi_anunciante_id();
  select * into g from private.rango_kpi(p_desde, p_hasta, p_desde_ant, p_hasta_ant);
  v_lo := least(g.ini, g.ini_ant);
  v_hi := greatest(g.fin, g.fin_ant);

  with hechos (kpi, t, num, den, n, clave) as (
    select k.kpi, a.aceptada_at, case when k.kpi = 'inversion_comprometida' then a.monto_bruto else 0 end, null::numeric, 1,
           a.medio_id::text
    from public.asignaciones a
    cross join (values ('inversion_comprometida'), ('medios_alcanzados')) k (kpi)
    where a.anunciante_id = v_an and a.aceptada_at >= v_lo and a.aceptada_at < v_hi
      and private.consume_cupo(a.estado, a.estado_previo_disputa)
    union all
    select 'inversion_verificada', a.verificada_at, a.monto_bruto, null, 1, null
    from public.asignaciones a
    where a.anunciante_id = v_an and a.verificada_at >= v_lo and a.verificada_at < v_hi
      and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    union all
    select 'ofertas_publicadas', o.publicada_at, 1, null, 1, null
    from public.ofertas o
    where o.anunciante_id = v_an and o.publicada_at >= v_lo and o.publicada_at < v_hi and o.deleted_at is null
    union all
    select 'tasa_llenado', o.fecha_limite_aceptacion,
           least((select count(*) from public.asignaciones a
                  where a.oferta_id = o.id and a.aceptada_at is not null and a.aceptada_at <= o.fecha_limite_aceptacion),
                 o.cupos_totales),
           o.cupos_totales, 1, null
    from public.ofertas o
    where o.anunciante_id = v_an and o.fecha_limite_aceptacion >= v_lo and o.fecha_limite_aceptacion < v_hi
      and o.fecha_limite_aceptacion <= private.ahora() and o.publicada_at is not null and o.deleted_at is null
      and o.estado <> 'CANCELADA'
    union all
    select k.kpi, d.verificada_at, k.num, k.den, 1, null
    from private.desempeno_verificadas(v_lo, v_hi) d
    cross join lateral (values
      ('alcance_total', d.alcance, null::numeric),
      ('impresiones', d.impresiones, null),
      ('interacciones', d.interacciones, null),
      ('reproducciones', d.reproducciones, null),
      ('clics', d.clics, null),
      ('cpm_efectivo', case when d.impresiones > 0 then d.monto_bruto * 1000 end, case when d.impresiones > 0 then d.impresiones end),
      ('costo_por_interaccion', case when d.interacciones > 0 then d.monto_bruto end,
       case when d.interacciones > 0 then d.interacciones end),
      ('engagement', case when d.alcance > 0 then d.interacciones end, case when d.alcance > 0 then d.alcance end),
      ('costo_por_alcance', case when d.alcance > 0 then d.monto_bruto end, case when d.alcance > 0 then d.alcance end)
    ) k (kpi, num, den)
    where d.anunciante_id = v_an and k.num is not null
    union all
    select 'tasa_cumplimiento', a.fecha_limite_publicacion,
           case when private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at, a.evidencia_validada_at,
                                             a.fecha_limite_publicacion) then 1 else 0 end,
           1, 1, null
    from public.asignaciones a
    where a.anunciante_id = v_an and a.fecha_limite_publicacion >= v_lo and a.fecha_limite_publicacion < v_hi
      and a.aceptada_at is not null
      and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                      a.fecha_limite_publicacion)
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
        -- Campañas activas al cierre de cada periodo (foto).
        select 'campanas_activas', w.grupo, count(c.id), null, count(c.id), null
        from (values ('act', g.fin), ('ant', g.fin_ant)) w (grupo, t)
        left join public.campanas c
          on c.anunciante_id = v_an and c.deleted_at is null and c.activada_at < w.t
         and coalesce(c.finalizada_at, c.cancelada_at, 'infinity'::timestamptz) >= w.t
        group by w.grupo) s;

  return query select * from private.kpi_ensamblar(v_defs, v_ag, private.cubetas(p_desde, p_hasta), 0);
end $$;
revoke all on function public.kpis_anunciante(date, date, date, date) from public, anon, authenticated;
grant execute on function public.kpis_anunciante(date, date, date, date) to authenticated;

-- 2. desempeno_anunciante (inicio.anunciante o reportes.ver): cortes §7.2.6 de las asignaciones verificadas en el
-- periodo. El anunciante ve solo las suyas; un interno (sin organización) ve lo que su RLS permite y puede acotar a
-- una campaña. Ubicación = municipio del medio; nombres de medio vía medios_publico. Sin comisión ni neto.
create function public.desempeno_anunciante(p_desde date, p_hasta date, p_dimension text, p_campana_id uuid default null)
returns table (clave text, nombre text, asignaciones integer, gmv numeric, alcance bigint, impresiones bigint,
               interacciones bigint, reproducciones bigint, clics bigint, cpm_efectivo numeric,
               costo_por_interaccion numeric, engagement numeric, costo_por_alcance numeric, n integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_an uuid;
begin
  perform private.exigir_permiso('inicio.anunciante', 'reportes.ver');
  if p_dimension is null or p_dimension not in ('plataforma', 'medio', 'municipio', 'departamento', 'fecha', 'campana') then
    raise exception using errcode = 'P0001', message = 'AMO_METRICA_NIVEL_INVALIDO',
      detail = 'La dimensión debe ser plataforma, medio, municipio, departamento, fecha o campana.',
      hint = coalesce(p_dimension, 'null');
  end if;
  select * into g from private.rango_kpi(p_desde, p_hasta);
  v_an := private.mi_anunciante_id();
  return query
  with d as (
    select x.* from private.desempeno_verificadas(g.ini, g.fin) x
    where (v_an is null or x.anunciante_id = v_an) and (p_campana_id is null or x.campana_id = p_campana_id)
  ), mp as (
    select m.id, m.nombre, m.municipio_codigo, m.departamento_codigo
    from public.medios_publico((select array_agg(distinct d.medio_id) from d)) m
    where p_dimension in ('medio', 'municipio', 'departamento')
  ), claves as (
    select d.*,
           case p_dimension
             when 'plataforma' then d.plataforma::text
             when 'campana' then d.campana_id::text
             when 'medio' then d.medio_id::text
             when 'municipio' then mp.municipio_codigo::text
             when 'departamento' then mp.departamento_codigo::text
             else private.cubeta(d.verificada_at, g.dias)::text end as k
    from d
    left join mp on mp.id = d.medio_id
  )
  select c.k,
         case p_dimension
           when 'plataforma' then (case c.k when 'INSTAGRAM' then 'Instagram' when 'FACEBOOK' then 'Facebook' else 'TikTok' end)
           when 'campana' then (select ca.nombre from public.campanas ca where ca.id::text = c.k)
           when 'medio' then (select mp.nombre from mp where mp.id::text = c.k)
           when 'municipio' then (select mu.nombre || ', ' || de.nombre_corto from public.municipios mu
                                  join public.departamentos de on de.codigo = mu.departamento_codigo where mu.codigo = c.k)
           when 'departamento' then (select de.nombre from public.departamentos de where de.codigo = c.k)
           else (case when g.dias <= 31 then to_char(c.k::date, 'DD/MM/YYYY')
                      else 'Semana del ' || to_char(c.k::date, 'DD/MM/YYYY') end) end,
         count(*)::integer, sum(c.monto_bruto), coalesce(sum(c.alcance), 0)::bigint, coalesce(sum(c.impresiones), 0)::bigint,
         coalesce(sum(c.interacciones), 0)::bigint, coalesce(sum(c.reproducciones), 0)::bigint,
         coalesce(sum(c.clics), 0)::bigint,
         round(sum(c.monto_bruto) filter (where c.impresiones > 0)
               / nullif(sum(c.impresiones) filter (where c.impresiones > 0), 0) * 1000, 2),
         round(sum(c.monto_bruto) filter (where c.interacciones > 0)
               / nullif(sum(c.interacciones) filter (where c.interacciones > 0), 0), 2),
         round(sum(c.interacciones) filter (where c.alcance > 0) / nullif(sum(c.alcance) filter (where c.alcance > 0), 0), 6),
         round(sum(c.monto_bruto) filter (where c.alcance > 0) / nullif(sum(c.alcance) filter (where c.alcance > 0), 0), 4),
         count(*)::integer
  from claves c
  group by c.k
  order by case when p_dimension = 'fecha' then c.k end, sum(c.monto_bruto) desc, c.k;
end $$;
revoke all on function public.desempeno_anunciante(date, date, text, uuid) from public, anon, authenticated;
grant execute on function public.desempeno_anunciante(date, date, text, uuid) to authenticated;

-- 3. kpis_medio (inicio.medio; DEFINER filtrado a su medio). Bases (docs/kpis.md §3.2): ganado antes de retenciones;
-- pendiente = neto si LIQUIDADA, si no valor para el medio; pagado = neto. Cumplimiento: ventana móvil de 180 días al
-- cierre de cada periodo con mínimo medios.n_minimo_cumplimiento (con menos, valor null y n). Tope: año calendario
-- de Bogotá de p_hasta. Saldos, tope y multiplicador son foto actual (sin anterior ni serie).
create function public.kpis_medio(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns setof public.kpi_fila
language plpgsql stable security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_lo timestamptz;
  v_hi timestamptz;
  v_ag jsonb;
  v_me uuid;
  v_min_cump integer := private.config_entero('medios.n_minimo_cumplimiento');
  v_tope numeric;
  v_consumido numeric;
  v_ini_anio timestamptz := private.inicio_dia(make_date(extract(year from p_hasta)::integer, 1, 1));
  v_fin_anio timestamptz := private.inicio_dia(make_date(extract(year from p_hasta)::integer + 1, 1, 1));
  v_defs constant jsonb := '[
    {"kpi": "ganado_periodo", "orden": 1, "tipo": "suma", "unidad": "COP"},
    {"kpi": "pendiente_pago", "orden": 2, "tipo": "suma", "unidad": "COP", "foto": true, "sin_ant": true},
    {"kpi": "pagado_historico", "orden": 3, "tipo": "suma", "unidad": "COP", "foto": true, "sin_ant": true},
    {"kpi": "retenciones_historicas", "orden": 4, "tipo": "suma", "unidad": "COP", "foto": true, "sin_ant": true},
    {"kpi": "asignaciones_activas", "orden": 5, "tipo": "suma", "unidad": "conteo", "foto": true, "sin_ant": true},
    {"kpi": "tasa_cumplimiento", "orden": 6, "tipo": "razon", "unidad": "%", "foto": true},
    {"kpi": "publicaciones_realizadas", "orden": 7, "tipo": "suma", "unidad": "conteo"},
    {"kpi": "tope_anual", "orden": 8, "tipo": "razon", "unidad": "COP", "foto": true, "sin_ant": true},
    {"kpi": "consumido_tope", "orden": 9, "tipo": "suma", "unidad": "COP", "foto": true, "sin_ant": true},
    {"kpi": "porcentaje_tope", "orden": 10, "tipo": "razon", "unidad": "%", "foto": true, "sin_ant": true},
    {"kpi": "multiplicador_calidad", "orden": 11, "tipo": "razon", "unidad": "factor", "foto": true, "sin_ant": true}]';
begin
  perform private.exigir_permiso('inicio.medio');
  v_me := private.mi_medio_id();
  select * into g from private.rango_kpi(p_desde, p_hasta, p_desde_ant, p_hasta_ant);
  v_lo := least(g.ini, g.ini_ant);
  v_hi := greatest(g.fin, g.fin_ant);
  select nv.tope_anual into v_tope
  from public.medios m join public.niveles_verificacion nv on nv.nivel = m.nivel_verificacion where m.id = v_me;
  select coalesce(sum(am.monto_medio), 0) into v_consumido
  from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
  where a.medio_id = v_me and a.aceptada_at >= v_ini_anio and a.aceptada_at < v_fin_anio
    and private.consume_cupo(a.estado, a.estado_previo_disputa);

  with hechos (kpi, t, num, den, n, clave) as (
    select 'ganado_periodo', a.verificada_at, am.monto_medio, null::numeric, 1, null::text
    from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
    where a.medio_id = v_me and a.verificada_at >= v_lo and a.verificada_at < v_hi
      and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    union all
    select 'publicaciones_realizadas', p.fecha_publicacion, 1, null, 1, null
    from public.publicaciones p
    where p.medio_id = v_me and p.estado_validacion = 'APROBADA' and p.fecha_publicacion >= v_lo and p.fecha_publicacion < v_hi
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
        select 'pendiente_pago', 'act', sum(case when a.estado = 'LIQUIDADA' then am.monto_neto else am.monto_medio end),
               null, count(*), null
        from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
        where a.medio_id = v_me and a.estado in ('VERIFICADA', 'LIQUIDADA')
        union all
        select k.kpi, 'act', case when k.kpi = 'pagado_historico' then sum(am.monto_neto) else sum(am.monto_retenciones) end,
               null, count(*), null
        from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
        cross join (values ('pagado_historico'), ('retenciones_historicas')) k (kpi)
        where a.medio_id = v_me and a.estado = 'PAGADA'
        group by k.kpi
        union all
        select 'asignaciones_activas', 'act', count(*), null, count(*), null
        from public.asignaciones a
        where a.medio_id = v_me
          and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
        union all
        select 'tasa_cumplimiento', w.grupo,
               case when count(a.id) >= v_min_cump then
                 count(a.id) filter (where private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at,
                                                                   a.evidencia_validada_at, a.fecha_limite_publicacion)) end,
               count(a.id), count(a.id), null
        from (values ('act', g.fin), ('ant', g.fin_ant)) w (grupo, t)
        left join public.asignaciones a
          on a.medio_id = v_me and a.fecha_limite_publicacion >= w.t - interval '180 days'
         and a.fecha_limite_publicacion < w.t and a.aceptada_at is not null
         and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                         a.fecha_limite_publicacion)
        group by w.grupo
        union all
        select 'tope_anual', 'act', v_tope, 1, 1, null
        union all
        select 'consumido_tope', 'act', v_consumido, null, 1, null
        union all
        select 'porcentaje_tope', 'act', v_consumido, v_tope, 1, null
        union all
        select 'multiplicador_calidad', 'act', min(c.multiplicador_calidad), case when count(*) > 0 then 1 end, count(*), null
        from public.cuentas_sociales c
        where c.medio_id = v_me and c.verificada and c.deleted_at is null) s;

  return query select * from private.kpi_ensamblar(v_defs, v_ag, private.cubetas(p_desde, p_hasta), 0);
end $$;
revoke all on function public.kpis_medio(date, date, date, date) from public, anon, authenticated;
grant execute on function public.kpis_medio(date, date, date, date) to authenticated;

-- 4. serie_ganancias_medio (inicio.medio o liquidaciones.ver_propias; DEFINER filtrado a su medio): ganado (Σ
-- monto_medio por verificada_at), pagado (Σ monto_neto por pagada_at) y asignaciones verificadas por semana ISO o mes.
create function public.serie_ganancias_medio(p_desde date, p_hasta date, p_granularidad text)
returns table (periodo date, ganado numeric, pagado numeric, asignaciones integer)
language plpgsql stable security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_me uuid; v_unidad text;
begin
  perform private.exigir_permiso('inicio.medio', 'liquidaciones.ver_propias');
  v_me := private.mi_medio_id();
  select * into g from private.rango_kpi(p_desde, p_hasta);
  v_unidad := case p_granularidad when 'semana' then 'week' when 'mes' then 'month' end;
  if v_unidad is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'La granularidad debe ser semana o mes.';
  end if;
  return query
  with periodos as (
    select gs::date as periodo
    from generate_series(date_trunc(v_unidad, p_desde::timestamp), p_hasta::timestamp, ('1 ' || v_unidad)::interval) gs
  ), ganancias as (
    select date_trunc(v_unidad, a.verificada_at)::date as periodo, sum(am.monto_medio) as monto, count(*) as n
    from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
    where a.medio_id = v_me and a.verificada_at >= g.ini and a.verificada_at < g.fin
      and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    group by 1
  ), pagos as (
    select date_trunc(v_unidad, a.pagada_at)::date as periodo, sum(am.monto_neto) as monto
    from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
    where a.medio_id = v_me and a.estado = 'PAGADA' and a.pagada_at >= g.ini and a.pagada_at < g.fin
    group by 1
  )
  select p.periodo, coalesce(ga.monto, 0), coalesce(pa.monto, 0), coalesce(ga.n, 0)::integer
  from periodos p
  left join ganancias ga on ga.periodo = p.periodo
  left join pagos pa on pa.periodo = p.periodo
  order by p.periodo;
end $$;
revoke all on function public.serie_ganancias_medio(date, date, text) from public, anon, authenticated;
grant execute on function public.serie_ganancias_medio(date, date, text) to authenticated;

-- 5. proximas_acciones_medio (inicio.medio; DEFINER filtrado a su medio): DESCARGAR (ACEPTADA), PUBLICAR o
-- CORREGIR_EVIDENCIA (CONTENIDO_ENTREGADO, según haya evidencia rechazada) hasta fecha_limite_publicacion;
-- CARGAR_METRICA_<corte> por publicación y corte requerido sin fila (fecha_publicacion + corte +
-- metricas.plazo_carga_horas); CORREGIR_METRICAS por métrica rechazada (validada_at + plazo). Una fila por
-- asignación y acción, la más próxima primero.
create function public.proximas_acciones_medio(p_limite integer default 10)
returns table (asignacion_id uuid, oferta_titulo text, accion text, vence_at timestamptz)
language plpgsql stable security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare v_me uuid; v_plazo interval := make_interval(hours => private.config_entero('metricas.plazo_carga_horas'));
begin
  perform private.exigir_permiso('inicio.medio');
  v_me := private.mi_medio_id();
  return query
  with abiertas as (
    select a.id, a.oferta_id, a.estado, a.fecha_limite_publicacion
    from public.asignaciones a
    where a.medio_id = v_me
      and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
  ), acciones as (
    select x.id, 'DESCARGAR'::text as accion, x.fecha_limite_publicacion as vence
    from abiertas x where x.estado = 'ACEPTADA'
    union all
    select x.id,
           case when exists (select 1 from public.publicaciones p where p.asignacion_id = x.id and p.estado_validacion = 'RECHAZADA')
                then 'CORREGIR_EVIDENCIA' else 'PUBLICAR' end,
           x.fecha_limite_publicacion
    from abiertas x where x.estado = 'CONTENIDO_ENTREGADO'
    union all
    select x.id, 'CARGAR_METRICA_' || k.corte::text,
           p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours' when 'H72' then interval '72 hours'
                                              else interval '7 days' end + v_plazo
    from abiertas x
    join public.ofertas o on o.id = x.oferta_id
    join public.publicaciones p on p.asignacion_id = x.id and p.estado_validacion <> 'RECHAZADA'
    cross join unnest(o.cortes_requeridos) k (corte)
    where x.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA') and k.corte <> 'PERSONALIZADO'
      and not exists (select 1 from public.metricas m where m.publicacion_id = p.id and m.corte = k.corte)
    union all
    select x.id, 'CORREGIR_METRICAS', m.validada_at + v_plazo
    from abiertas x
    join public.metricas m on m.asignacion_id = x.id and m.estado_validacion = 'RECHAZADA'
  )
  select ac.id, o.titulo, ac.accion, min(ac.vence)
  from acciones ac
  join public.asignaciones a on a.id = ac.id
  join public.ofertas o on o.id = a.oferta_id
  group by ac.id, o.titulo, ac.accion
  order by min(ac.vence) nulls last, ac.accion
  limit least(greatest(coalesce(p_limite, 10), 1), 100);
end $$;
revoke all on function public.proximas_acciones_medio(integer) from public, anon, authenticated;
grant execute on function public.proximas_acciones_medio(integer) to authenticated;

-- 6. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in ('kpis_anunciante', 'desempeno_anunciante')
                       and (p.prosecdef or p.provolatile <> 's')),
         'las RPC del anunciante deben ser invoker y STABLE';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('kpis_medio', 'serie_ganancias_medio', 'proximas_acciones_medio')
            and p.prosecdef and p.provolatile = 's'
            and exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=america/bogota')
            and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""')) = 3,
         'las RPC del medio deben ser definer, STABLE, con search_path vacío y timezone America/Bogota';
end $$;
