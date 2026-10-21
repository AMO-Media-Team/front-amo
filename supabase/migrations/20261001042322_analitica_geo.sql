-- Migración 9c · analitica_geo (docs/modelo-datos.md §5.9 «Matriz geo_metricas / top_zonas», docs/kpis.md §0.4, §4)
-- private.geo_validar / private.geo_valores (invoker: la RLS del llamador aplica) y las RPC geo_metricas, top_zonas
-- y reporte_cobertura_territorial.
-- Matriz nivel × métrica (fuera ⇒ AMO_METRICA_NIVEL_INVALIDO). Además de las del doc, `cumplimiento` (tasa §1.10
-- con n mínimo) y `campanas` (campañas distintas con asignaciones aceptadas vigentes) en los tres niveles, porque el
-- explorador geográfico las ofrece en los niveles nacional y departamental. En `pais`, las métricas ubicadas por el
-- municipio del medio solo tienen la fila CO.
--   pais:          accesos, audiencia, anunciantes, gmv, asignaciones, medios, alcance, campanas, cumplimiento
--   departamento:  accesos (CO), anunciantes, gmv, asignaciones, medios, alcance, campanas, cumplimiento
--   municipio:     ídem departamento

create function private.geo_validar(p_nivel text, p_metrica text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_nivel is null or p_nivel not in ('pais', 'departamento', 'municipio')
     or p_metrica is null
     or p_metrica not in ('accesos', 'audiencia', 'anunciantes', 'gmv', 'asignaciones', 'medios', 'alcance', 'campanas', 'cumplimiento')
     or (p_metrica = 'audiencia' and p_nivel <> 'pais') then
    raise exception using errcode = 'P0001', message = 'AMO_METRICA_NIVEL_INVALIDO',
      detail = 'Esta métrica no está disponible para este nivel del mapa.',
      hint = coalesce(p_nivel, 'null') || ' × ' || coalesce(p_metrica, 'null');
  end if;
end $$;
revoke all on function private.geo_validar(text, text) from public, anon, authenticated;
grant execute on function private.geo_validar(text, text) to authenticated, service_role;

-- Valores por zona (solo zonas con datos). codigo = ISO2 (pais), DANE de 2 dígitos (departamento) o DIVIPOLA de 5
-- (municipio). Ubicación: municipio del medio (asignaciones, medios, alcance, cumplimiento, campañas), del anunciante
-- (anunciantes) o de la conexión (accesos). p_departamento filtra los niveles departamento y municipio.
create function private.geo_valores(p_nivel text, p_metrica text, p_ini timestamptz, p_fin timestamptz,
                                    p_departamento char(2) default null)
returns table (codigo text, valor numeric, n integer)
language plpgsql stable set search_path = '' as $$
begin
  perform private.geo_validar(p_nivel, p_metrica);
  case p_metrica
    when 'gmv', 'asignaciones', 'campanas' then
      return query
      select z.codigo,
             case p_metrica when 'gmv' then sum(a.monto_bruto)
                            when 'asignaciones' then count(*)::numeric
                            else count(distinct a.campana_id)::numeric end,
             (case when p_metrica = 'campanas' then count(distinct a.campana_id) else count(*) end)::integer
      from public.asignaciones a
      join public.medios m on m.id = a.medio_id
      cross join lateral (select case p_nivel when 'pais' then 'CO' when 'departamento' then m.departamento_codigo::text
                                              else m.municipio_codigo::text end as codigo) z
      where a.aceptada_at >= p_ini and a.aceptada_at < p_fin and private.consume_cupo(a.estado, a.estado_previo_disputa)
        and (p_departamento is null or p_nivel = 'pais' or m.departamento_codigo = p_departamento)
      group by z.codigo;
    when 'alcance' then
      return query
      select z.codigo, sum(d.alcance), count(*)::integer
      from private.desempeno_verificadas(p_ini, p_fin) d
      join public.medios m on m.id = d.medio_id
      cross join lateral (select case p_nivel when 'pais' then 'CO' when 'departamento' then m.departamento_codigo::text
                                              else m.municipio_codigo::text end as codigo) z
      where d.alcance is not null
        and (p_departamento is null or p_nivel = 'pais' or m.departamento_codigo = p_departamento)
      group by z.codigo;
    when 'cumplimiento' then
      return query
      select z.codigo,
             avg(case when private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at, a.evidencia_validada_at,
                                                   a.fecha_limite_publicacion) then 1 else 0 end)::numeric,
             count(*)::integer
      from public.asignaciones a
      join public.medios m on m.id = a.medio_id
      cross join lateral (select case p_nivel when 'pais' then 'CO' when 'departamento' then m.departamento_codigo::text
                                              else m.municipio_codigo::text end as codigo) z
      where a.fecha_limite_publicacion >= p_ini and a.fecha_limite_publicacion < p_fin and a.aceptada_at is not null
        and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                        a.fecha_limite_publicacion)
        and (p_departamento is null or p_nivel = 'pais' or m.departamento_codigo = p_departamento)
      group by z.codigo;
    when 'medios' then
      -- Foto al cierre: verificados hoy y verificados antes del fin del periodo.
      return query
      select z.codigo, count(*)::numeric, count(*)::integer
      from public.medios m
      cross join lateral (select case p_nivel when 'pais' then 'CO' when 'departamento' then m.departamento_codigo::text
                                              else m.municipio_codigo::text end as codigo) z
      where m.estado = 'VERIFICADO' and m.deleted_at is null and m.verificado_at < p_fin
        and (p_departamento is null or p_nivel = 'pais' or m.departamento_codigo = p_departamento)
      group by z.codigo;
    when 'anunciantes' then
      return query
      select z.codigo, count(*)::numeric, count(*)::integer
      from (select distinct a.anunciante_id from public.asignaciones a
            where a.aceptada_at >= p_ini and a.aceptada_at < p_fin
              and private.consume_cupo(a.estado, a.estado_previo_disputa)) act
      join public.anunciantes an on an.id = act.anunciante_id
      left join public.municipios mu on mu.codigo = an.municipio_codigo
      cross join lateral (select case p_nivel when 'pais' then an.pais_iso2::text
                                              when 'departamento' then mu.departamento_codigo::text
                                              else an.municipio_codigo::text end as codigo) z
      where an.estado_verificacion = 'VERIFICADO' and z.codigo is not null
        and (p_nivel = 'pais' or an.pais_iso2 = 'CO')
        and (p_departamento is null or p_nivel = 'pais' or mu.departamento_codigo = p_departamento)
      group by z.codigo;
    when 'accesos' then
      return query
      select z.codigo, count(*)::numeric, count(*)::integer
      from public.accesos x
      cross join lateral (select case p_nivel when 'pais' then x.pais_iso2::text
                                              when 'departamento' then x.departamento_codigo::text
                                              else x.municipio_codigo::text end as codigo) z
      where x.evento = 'LOGIN_EXITOSO' and x.created_at >= p_ini and x.created_at < p_fin and z.codigo is not null
        and (p_nivel = 'pais' or x.pais_iso2 = 'CO')
        and (p_departamento is null or p_nivel = 'pais' or x.departamento_codigo = p_departamento)
      group by z.codigo;
    when 'audiencia' then
      -- Foto actual: Σ (porcentaje / 100 × seguidores verificados de las cuentas del medio), medios verificados.
      return query
      select ap.pais_iso2::text, round(sum(ap.porcentaje / 100.0 * s.seguidores)), count(distinct ap.medio_id)::integer
      from public.medio_audiencia_paises ap
      join public.medios m on m.id = ap.medio_id and m.estado = 'VERIFICADO' and m.deleted_at is null
      cross join lateral (select sum(c.seguidores_verificados) as seguidores from public.cuentas_sociales c
                          where c.medio_id = m.id and c.verificada and c.deleted_at is null) s
      where s.seguidores is not null
      group by ap.pais_iso2;
  end case;
end $$;
revoke all on function private.geo_valores(text, text, timestamptz, timestamptz, char) from public, anon, authenticated;
grant execute on function private.geo_valores(text, text, timestamptz, timestamptz, char) to authenticated, service_role;

-- geo_metricas (analitica.mapa; accesos exige además accesos.ver). pais: solo países con datos (codigo_geometria =
-- ISO2); departamento: todos los activos (poblacion DANE y valor por 100 mil en métricas aditivas); municipio: todos
-- los activos del departamento (codigo_geometria = municipios.codigo_geometria). Tasas: valor null si n < mínimo.
create function public.geo_metricas(p_nivel text, p_metrica text, p_desde date, p_hasta date,
                                    p_departamento char(2) default null)
returns table (codigo text, codigo_geometria text, nombre text, valor numeric, n integer, poblacion integer,
               valor_por_100k numeric)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_nmin integer := private.config_entero('analitica.n_minimo_tasas');
  v_tasa boolean := p_metrica = 'cumplimiento';
begin
  perform private.exigir_permiso('analitica.mapa');
  if p_metrica = 'accesos' then perform private.exigir_permiso('accesos.ver'); end if;
  perform private.geo_validar(p_nivel, p_metrica);
  if p_nivel = 'municipio' and p_departamento is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Indica el departamento para ver sus municipios.';
  end if;
  select * into g from private.rango_kpi(p_desde, p_hasta);

  if p_nivel = 'pais' then
    return query
    select v.codigo, v.codigo, coalesce(pa.nombre, v.codigo),
           case when v_tasa and v.n < v_nmin then null else round(v.valor, 6) end, v.n, null::integer, null::numeric
    from private.geo_valores(p_nivel, p_metrica, g.ini, g.fin, null) v
    left join public.paises pa on pa.iso2 = v.codigo
    where v.n > 0
    order by v.valor desc nulls last, v.codigo;
  elsif p_nivel = 'departamento' then
    return query
    select d.codigo::text, d.codigo::text, d.nombre,
           case when v_tasa then (case when coalesce(v.n, 0) >= v_nmin then round(v.valor, 6) end)
                else coalesce(round(v.valor, 6), 0) end,
           coalesce(v.n, 0), d.poblacion,
           case when not v_tasa and d.poblacion > 0 then round(coalesce(v.valor, 0) / d.poblacion * 100000, 2) end
    from public.departamentos d
    left join private.geo_valores(p_nivel, p_metrica, g.ini, g.fin, p_departamento) v on v.codigo = d.codigo::text
    where d.activo and (p_departamento is null or d.codigo = p_departamento)
    order by d.nombre;
  else
    return query
    select mu.codigo::text, mu.codigo_geometria::text, mu.nombre,
           case when v_tasa then (case when coalesce(v.n, 0) >= v_nmin then round(v.valor, 6) end)
                else coalesce(round(v.valor, 6), 0) end,
           coalesce(v.n, 0), null::integer, null::numeric
    from public.municipios mu
    left join private.geo_valores(p_nivel, p_metrica, g.ini, g.fin, p_departamento) v on v.codigo = mu.codigo::text
    where mu.departamento_codigo = p_departamento and mu.activo
    order by mu.nombre;
  end if;
end $$;
revoke all on function public.geo_metricas(text, text, date, date, char) from public, anon, authenticated;
grant execute on function public.geo_metricas(text, text, date, date, char) to authenticated;

-- top_zonas (analitica.global; accesos exige accesos.ver): ranking del periodo con el valor del periodo anterior de
-- igual duración. En municipio cubre todo el país. Tasas: fuera del ranking si n < mínimo; sin participación.
create function public.top_zonas(p_nivel text, p_metrica text, p_desde date, p_hasta date, p_limite integer default 10)
returns table (codigo text, nombre text, valor numeric, participacion numeric, valor_anterior numeric, variacion numeric,
               rank integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare
  g record;
  v_nmin integer := private.config_entero('analitica.n_minimo_tasas');
  v_tasa boolean := p_metrica = 'cumplimiento';
begin
  perform private.exigir_permiso('analitica.global');
  if p_metrica = 'accesos' then perform private.exigir_permiso('accesos.ver'); end if;
  perform private.geo_validar(p_nivel, p_metrica);
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with act as (
    select * from private.geo_valores(p_nivel, p_metrica, g.ini, g.fin, null)
  ), ant as (
    select * from private.geo_valores(p_nivel, p_metrica, g.ini_ant, g.fin_ant, null)
  ), val as (
    select a.codigo,
           case when v_tasa and a.n < v_nmin then null else a.valor end as valor,
           case when p_metrica = 'audiencia' then null
                when v_tasa then (case when coalesce(b.n, 0) >= v_nmin then b.valor end)
                else coalesce(b.valor, 0) end as anterior
    from act a
    left join ant b on b.codigo = a.codigo
  )
  select v.codigo,
         case p_nivel
           when 'pais' then (select pa.nombre from public.paises pa where pa.iso2 = v.codigo)
           when 'departamento' then (select d.nombre from public.departamentos d where d.codigo = v.codigo)
           else (select mu.nombre || ' (' || d.nombre_corto || ')' from public.municipios mu
                 join public.departamentos d on d.codigo = mu.departamento_codigo where mu.codigo = v.codigo) end,
         round(v.valor, 6),
         case when not v_tasa then round(v.valor / nullif(sum(v.valor) over (), 0), 6) end,
         round(v.anterior, 6),
         case when v.anterior is null or v.anterior = 0 or v.valor is null then null
              else round((v.valor - v.anterior) / v.anterior, 6) end,
         (rank() over (order by v.valor desc))::integer
  from val v
  where v.valor is not null
  order by 7, 1
  limit least(greatest(coalesce(p_limite, 10), 1), 100);
end $$;
revoke all on function public.top_zonas(text, text, date, date, integer) from public, anon, authenticated;
grant execute on function public.top_zonas(text, text, date, date, integer) to authenticated;

-- reporte_cobertura_territorial (reportes.ver): sin departamento, una fila por departamento (municipio_* null); con
-- departamento, una fila por municipio activo. medios = verificados al cierre; medios_activos §1.12; asignaciones y
-- gmv por aceptada_at (vigentes); alcance por verificada_at.
create function public.reporte_cobertura_territorial(p_desde date, p_hasta date, p_departamento char(2) default null)
returns table (departamento_codigo char(2), departamento text, municipio_codigo char(5), municipio text, poblacion integer,
               medios integer, medios_activos integer, medios_por_100k numeric, asignaciones integer, gmv numeric,
               alcance bigint)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_nivel text := case when p_departamento is null then 'departamento' else 'municipio' end;
begin
  perform private.exigir_permiso('reportes.ver');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with med as (select * from private.geo_valores(v_nivel, 'medios', g.ini, g.fin, p_departamento)),
       asi as (select * from private.geo_valores(v_nivel, 'asignaciones', g.ini, g.fin, p_departamento)),
       gm as (select * from private.geo_valores(v_nivel, 'gmv', g.ini, g.fin, p_departamento)),
       alc as (select * from private.geo_valores(v_nivel, 'alcance', g.ini, g.fin, p_departamento)),
       act as (
         select case when v_nivel = 'departamento' then m.departamento_codigo::text else m.municipio_codigo::text end as codigo,
                count(distinct x.medio_id) as n
         from (select a.medio_id from public.asignaciones a where a.aceptada_at >= g.ini and a.aceptada_at < g.fin
               union
               select a.medio_id from public.asignaciones a where a.publicada_at >= g.ini and a.publicada_at < g.fin) x
         join public.medios m on m.id = x.medio_id and m.estado = 'VERIFICADO' and m.deleted_at is null
         where p_departamento is null or m.departamento_codigo = p_departamento
         group by 1),
       zonas as (
         select d.codigo as dep, d.nombre as dep_nombre, null::char(5) as mun, null::text as mun_nombre,
                d.poblacion as pob, d.codigo::text as clave
         from public.departamentos d
         where v_nivel = 'departamento' and d.activo
         union all
         select d.codigo, d.nombre, mu.codigo, mu.nombre, null::integer, mu.codigo::text
         from public.municipios mu join public.departamentos d on d.codigo = mu.departamento_codigo
         where v_nivel = 'municipio' and mu.departamento_codigo = p_departamento and mu.activo)
  select z.dep, z.dep_nombre, z.mun, z.mun_nombre, z.pob,
         coalesce(med.valor, 0)::integer, coalesce(act.n, 0)::integer,
         case when z.pob > 0 then round(coalesce(med.valor, 0) / z.pob * 100000, 2) end,
         coalesce(asi.valor, 0)::integer, coalesce(gm.valor, 0), coalesce(alc.valor, 0)::bigint
  from zonas z
  left join med on med.codigo = z.clave
  left join asi on asi.codigo = z.clave
  left join gm on gm.codigo = z.clave
  left join alc on alc.codigo = z.clave
  left join act on act.codigo = z.clave
  order by z.dep_nombre, z.mun_nombre nulls first;
end $$;
revoke all on function public.reporte_cobertura_territorial(date, date, char) from public, anon, authenticated;
grant execute on function public.reporte_cobertura_territorial(date, date, char) to authenticated;

create or replace function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header',
               'modo_carga', 'purga_habilitada',
               'actor_id', 'contexto_confiable', 'mi_rol_id', 'mi_anunciante_id', 'mi_medio_id', 'tiene_permiso',
               'acceso_valido', 'config_entero', 'config_decimal', 'config_texto', 'config_booleano', 'config_lista',
               'cuenta_vigente', 'anunciante_ve_medio',
               'hay_cambios', 'estados_con_cupo', 'consume_cupo', 'oferta_visible_para_mi', 'tengo_asignacion_en',
               'tengo_asignacion_activa_en', 'puedo_descargar_creativos_de', 'puedo_ver_asignacion',
               'puedo_cargar_metricas', 'calcular_precio', 'registrar_vista_oferta', 'estimar_oferta_agregado',
               -- M9 analítica
               'exigir_permiso', 'rango_kpi', 'cubeta', 'cubetas', 'kpi_ensamblar', 'desempeno_verificadas',
               'cumplimiento_aplica', 'cumplimiento_ok', 'medios_en_riesgo_al', 'geo_valores', 'geo_validar']::text[] $$;

do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname in ('geo_metricas', 'top_zonas', 'reporte_cobertura_territorial')
                       and (p.prosecdef or p.provolatile <> 's'
                            or not exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=america/bogota'))),
         'las RPC geográficas deben ser invoker, STABLE y con timezone America/Bogota';
end $$;
