-- Fase 4a, requisito de analítica: detalle de una zona del explorador geográfico en UNA llamada
-- (docs/modelo-datos.md §5.9). Hasta ahora el servidor lo componía con una lectura de `geo_metricas` por métrica y
-- otra por cada cubeta de la evolución: decenas de viajes a PostgREST por clic. `detalle_zona_geo` devuelve tres
-- secciones con las mismas definiciones del mapa (reutiliza private.geo_valores, así que cada cifra coincide con
-- la de `geo_metricas` para esa zona):
--   kpi    una fila por métrica del nivel (matriz de geo_validar): valor y n del periodo, valor del periodo anterior
--          de igual duración y variación. Tasas con n < analitica.n_minimo_tasas ⇒ valor null (§0.4 de kpis.md).
--          `accesos` solo si el usuario tiene accesos.ver: sin él esa fila no se devuelve (el resto sí).
--          `audiencia` (solo pais) es una foto actual: sin valor anterior.
--   serie  una fila por mes calendario de Bogotá y métrica (sin audiencia). El primer y el último mes se recortan al
--          periodo, así que la suma de la serie de gmv, asignaciones, alcance o accesos es su KPI. `medios` es la
--          foto al cierre de cada mes. Como máximo los 36 meses más recientes del periodo.
--   medio  los 5 medios de la zona con más GMV comprometido en el periodo (asignaciones aceptadas vigentes):
--          valor = GMV, n = asignaciones, detalle = municipio. En `pais` solo Colombia tiene medios.
-- Invoker (la RLS del llamador limita las filas: sin medios.ver o asignaciones.ver esas cifras quedan en cero),
-- STABLE, timezone America/Bogota y permiso analitica.mapa, como geo_metricas.
create function public.detalle_zona_geo(p_nivel text, p_codigo text, p_desde date, p_hasta date)
returns table (seccion text, clave text, nombre text, detalle text, unidad text, periodo date, valor numeric, n integer,
               valor_anterior numeric, variacion numeric, valor_por_100k numeric, orden integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_nmin integer := private.config_entero('analitica.n_minimo_tasas');
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_zona text;
  v_depto char(2);
  v_muni char(5);
  v_poblacion integer;
  v_accesos boolean;
  v_metricas jsonb;
begin
  perform private.exigir_permiso('analitica.mapa');
  if p_nivel is null or p_nivel not in ('pais', 'departamento', 'municipio') then
    raise exception using errcode = 'P0001', message = 'AMO_METRICA_NIVEL_INVALIDO',
      detail = 'El nivel del mapa no es válido.', hint = coalesce(p_nivel, 'null');
  end if;
  select * into g from private.rango_kpi(p_desde, p_hasta);

  -- La zona debe existir en su nivel. p_departamento de geo_valores acota el trabajo a su departamento.
  if p_nivel = 'pais' then
    select pa.nombre into v_zona from public.paises pa where pa.iso2::text = v_codigo;
  elsif p_nivel = 'departamento' then
    select d.nombre, d.codigo, d.poblacion into v_zona, v_depto, v_poblacion
    from public.departamentos d where d.codigo::text = v_codigo;
  else
    select mu.nombre, mu.departamento_codigo, mu.codigo into v_zona, v_depto, v_muni
    from public.municipios mu where mu.codigo::text = v_codigo;
  end if;
  if v_zona is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La zona no existe en este nivel del mapa.', hint = p_nivel || ' ' || left(v_codigo, 12);
  end if;

  v_accesos := private.tiene_permiso('accesos.ver');
  -- Métricas del nivel, en el orden del explorador. tasa ⇒ n mínimo y sin «por 100 mil».
  select jsonb_agg(to_jsonb(x) order by x.ord) into v_metricas
  from (values ('medios', 1, 'conteo', false), ('gmv', 2, 'COP', false), ('alcance', 3, 'personas', false),
               ('cumplimiento', 4, '%', true), ('campanas', 5, 'conteo', false), ('asignaciones', 6, 'conteo', false),
               ('anunciantes', 7, 'conteo', false), ('accesos', 8, 'conteo', false), ('audiencia', 9, 'personas', false))
       as x (metrica, ord, unidad, tasa)
  where (x.metrica <> 'audiencia' or p_nivel = 'pais') and (x.metrica <> 'accesos' or v_accesos);

  -- 1. KPI del periodo y del periodo anterior de igual duración.
  return query
  with val as (
    select x.metrica, x.ord, x.unidad, x.tasa,
           case when x.tasa then (case when coalesce(a.n, 0) >= v_nmin then a.valor end) else coalesce(a.valor, 0) end as actual,
           coalesce(a.n, 0) as n_actual,
           case when x.metrica = 'audiencia' then null
                when x.tasa then (case when coalesce(b.n, 0) >= v_nmin then b.valor end)
                else coalesce(b.valor, 0) end as anterior
    from jsonb_to_recordset(v_metricas) as x (metrica text, ord integer, unidad text, tasa boolean)
    left join lateral (select v.valor, v.n from private.geo_valores(p_nivel, x.metrica, g.ini, g.fin, v_depto) v
                       where v.codigo = v_codigo) a on true
    left join lateral (select v.valor, v.n from private.geo_valores(p_nivel, x.metrica, g.ini_ant, g.fin_ant, v_depto) v
                       where v.codigo = v_codigo) b on true
  )
  select 'kpi'::text, v.metrica, v_zona, null::text, v.unidad, null::date, round(v.actual, 6), v.n_actual,
         round(v.anterior, 6),
         case when v.anterior is null or v.anterior = 0 or v.actual is null then null
              else round((v.actual - v.anterior) / v.anterior, 6) end,
         case when p_nivel = 'departamento' and not v.tasa and v_poblacion > 0
              then round(v.actual / v_poblacion * 100000, 2) end,
         v.ord
  from val v
  order by v.ord;

  -- 2. Serie mensual (meses de Bogotá recortados al periodo; como máximo los 36 más recientes).
  return query
  with meses as (
    select ms.mes::date as mes,
           private.inicio_dia(greatest(ms.mes::date, p_desde)) as ini,
           private.inicio_dia(least((ms.mes + interval '1 month')::date, p_hasta + 1)) as fin
    from generate_series(date_trunc('month', p_desde::timestamp), p_hasta::timestamp, interval '1 month') ms (mes)
    where ms.mes >= date_trunc('month', p_hasta::timestamp) - interval '35 months'
  )
  select 'serie'::text, x.metrica, null::text, null::text, x.unidad, ms.mes,
         case when x.tasa then (case when coalesce(s.n, 0) >= v_nmin then round(s.valor, 6) end)
              else coalesce(round(s.valor, 6), 0) end,
         coalesce(s.n, 0), null::numeric, null::numeric, null::numeric, x.ord
  from jsonb_to_recordset(v_metricas) as x (metrica text, ord integer, unidad text, tasa boolean)
  cross join meses ms
  left join lateral (select v.valor, v.n from private.geo_valores(p_nivel, x.metrica, ms.ini, ms.fin, v_depto) v
                     where v.codigo = v_codigo) s on true
  where x.metrica <> 'audiencia'
  order by x.ord, ms.mes;

  -- 3. Medios con más GMV comprometido en la zona (ubicación = municipio del medio).
  return query
  select 'medio'::text, t.id::text, t.medio, t.lugar, 'COP'::text, null::date, t.gmv, t.asignaciones, null::numeric,
         null::numeric, null::numeric, t.puesto
  from (
    select m.id, m.nombre as medio, mu.nombre || ' (' || d.nombre_corto || ')' as lugar, sum(a.monto_bruto) as gmv,
           count(*)::integer as asignaciones,
           (row_number() over (order by sum(a.monto_bruto) desc, count(*) desc, m.nombre, m.id))::integer as puesto
    from public.asignaciones a
    join public.medios m on m.id = a.medio_id
    left join public.municipios mu on mu.codigo = m.municipio_codigo
    left join public.departamentos d on d.codigo = mu.departamento_codigo
    where a.aceptada_at >= g.ini and a.aceptada_at < g.fin and private.consume_cupo(a.estado, a.estado_previo_disputa)
      and (p_nivel <> 'pais' or v_codigo = 'CO')
      and (p_nivel <> 'departamento' or m.departamento_codigo = v_depto)
      and (p_nivel <> 'municipio' or m.municipio_codigo = v_muni)
    group by m.id, m.nombre, mu.nombre, d.nombre_corto
  ) t
  where t.puesto <= 5
  order by t.puesto;
end $$;
revoke all on function public.detalle_zona_geo(text, text, date, date) from public, anon, authenticated;
grant execute on function public.detalle_zona_geo(text, text, date, date) to authenticated;

do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert has_function_privilege('authenticated', 'public.detalle_zona_geo(text, text, date, date)', 'execute')
     and not has_function_privilege('service_role', 'public.detalle_zona_geo(text, text, date, date)', 'execute'),
         'grants de detalle_zona_geo incorrectos';
  assert exists (select 1 from pg_proc p where p.oid = 'public.detalle_zona_geo(text, text, date, date)'::regprocedure
                   and not p.prosecdef and p.provolatile = 's' and 'search_path=""' = any(p.proconfig)
                   and exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=america/bogota')),
         'detalle_zona_geo debe ser invoker, STABLE, con search_path vacío y timezone America/Bogota';
end $$;
