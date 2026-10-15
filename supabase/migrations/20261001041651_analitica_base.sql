-- Migración 9a · analitica_base (docs/modelo-datos.md §5.9, docs/kpis.md §0)
-- Tipo public.kpi_fila, helpers comunes de las RPC de analítica e índices de soporte. M9 va en cinco migraciones:
-- 9a base (esta), 9b tablero admin y accesos, 9c geografía, 9d anunciante y medio, 9e reportes.
-- Helpers (private, EXECUTE authenticated/service_role y lista blanca): son puros o invoker (la RLS del llamador
-- aplica), así que no amplían lo que un usuario puede leer.
-- Desviaciones (docs/modelo-datos.md §5.9 «Real»): kpi_fila añade `n_anterior` al final (la UI lo usa para exigir
-- el n mínimo en ambos periodos); los KPI «foto» (medios_en_riesgo, campañas activas, saldos del medio) no traen
-- serie (null).

-- 1. Tipo de fila de tarjetas KPI
create type public.kpi_fila as (
  kpi text,
  valor numeric,
  valor_anterior numeric,
  variacion numeric,          -- (valor − anterior) / anterior; null si anterior = 0 o null
  n integer,
  unidad text,                -- 'COP', '%', 'h', 'conteo', 'personas', 'factor'
  serie numeric[],            -- un punto por día (≤ 31 días) o por semana ISO (> 31 días); null en KPI «foto»
  n_anterior integer
);

-- 2. Helpers

-- Sesión válida (acceso_valido) y al menos uno de los permisos; si no, AMO_NO_AUTORIZADO.
create function private.exigir_permiso(variadic p_claves text[]) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not coalesce((select private.acceso_valido()), false)
     or not exists (select 1 from unnest(p_claves) k (clave) where private.tiene_permiso(k.clave)) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'No tienes permiso para consultar esta información.';
  end if;
end $$;
revoke all on function private.exigir_permiso(text[]) from public, anon, authenticated;
grant execute on function private.exigir_permiso(text[]) to authenticated, service_role;

-- Periodo [p_desde 00:00, p_hasta + 1 00:00) de Bogotá y periodo de comparación (explícito o el mismo número de
-- días inmediatamente antes, docs/kpis.md §0.1). p_desde_ant/p_hasta_ant van juntos.
create function private.rango_kpi(p_desde date, p_hasta date, p_desde_ant date default null, p_hasta_ant date default null)
returns table (ini timestamptz, fin timestamptz, ini_ant timestamptz, fin_ant timestamptz, dias integer)
language plpgsql stable set search_path = '' as $$
declare v_dias integer;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 3660 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El periodo no es válido: indica fechas inicial y final (máximo 10 años).';
  end if;
  if (p_desde_ant is null) <> (p_hasta_ant is null) or p_hasta_ant < p_desde_ant or p_hasta_ant - p_desde_ant > 3660 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El periodo de comparación debe tener fecha inicial y final válidas.';
  end if;
  v_dias := p_hasta - p_desde + 1;
  return query select private.inicio_dia(p_desde), private.inicio_dia(p_hasta + 1),
                      private.inicio_dia(coalesce(p_desde_ant, p_desde - v_dias)),
                      private.inicio_dia(coalesce(p_hasta_ant + 1, p_desde)), v_dias;
end $$;
revoke all on function private.rango_kpi(date, date, date, date) from public, anon, authenticated;
grant execute on function private.rango_kpi(date, date, date, date) to authenticated, service_role;

-- Cubeta del sparkline: día de Bogotá (periodo ≤ 31 días) o lunes de la semana ISO.
create function private.cubeta(p_t timestamptz, p_dias integer) returns date
language sql stable set search_path = '' as $$
  select case when p_dias <= 31 then (p_t at time zone 'America/Bogota')::date
              else date_trunc('week', p_t at time zone 'America/Bogota')::date end $$;
revoke all on function private.cubeta(timestamptz, integer) from public, anon, authenticated;
grant execute on function private.cubeta(timestamptz, integer) to authenticated, service_role;

create function private.cubetas(p_desde date, p_hasta date) returns date[]
language sql immutable set search_path = '' as $$
  select array_agg(x.c order by x.c)
  from (select distinct case when p_hasta - p_desde + 1 <= 31 then d::date else date_trunc('week', d)::date end as c
        from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') d) x $$;
revoke all on function private.cubetas(date, date) from public, anon, authenticated;
grant execute on function private.cubetas(date, date) to authenticated, service_role;

-- Ensambla filas kpi_fila a partir de agregados por (kpi, grupo): grupo 'act' (periodo), 'ant' (comparación) y
-- 'b<fecha>' (cubeta). p_defs: [{kpi, orden, tipo: suma|razon|distinto|razon_distinto, unidad, nmin, foto, sin_ant}].
-- p_agregados: [{kpi, grupo, num, den, n, nd}] (nd = conteo de claves distintas). nmin ⇒ valor null si n < p_nmin
-- (tasas agregadas, docs/kpis.md §0.4). Pura: no lee tablas.
create function private.kpi_ensamblar(p_defs jsonb, p_agregados jsonb, p_cubetas date[], p_nmin integer)
returns setof public.kpi_fila
language sql immutable set search_path = '' as $$
  with defs as (
    select d.kpi, d.orden, d.tipo, d.unidad, coalesce(d.nmin, false) as nmin, coalesce(d.foto, false) as foto,
           coalesce(d.sin_ant, false) as sin_ant
    from jsonb_to_recordset(p_defs) as d (kpi text, orden integer, tipo text, unidad text, nmin boolean, foto boolean,
                                          sin_ant boolean)
  ), ag as (
    select a.kpi, a.grupo, a.num, a.den, a.n, a.nd
    from jsonb_to_recordset(coalesce(p_agregados, '[]')) as a (kpi text, grupo text, num numeric, den numeric, n numeric, nd numeric)
  ), val as (
    select d.kpi, ag.grupo,
           case d.tipo when 'suma' then coalesce(ag.num, 0)
                       when 'razon' then ag.num / nullif(ag.den, 0)
                       when 'distinto' then coalesce(ag.nd, 0)
                       when 'razon_distinto' then ag.num / nullif(ag.nd, 0) end as valor,
           (case when d.tipo in ('distinto', 'razon_distinto') then ag.nd else ag.n end)::integer as n
    from defs d join ag on ag.kpi = d.kpi
  ), per as (
    select d.*,
           case when d.tipo in ('suma', 'distinto') then coalesce(act.valor, 0) else act.valor end as v_act,
           coalesce(act.n, 0) as n_act,
           case when d.sin_ant then null
                when d.tipo in ('suma', 'distinto') then coalesce(ant.valor, 0) else ant.valor end as v_ant,
           case when d.sin_ant then null else coalesce(ant.n, 0) end as n_ant
    from defs d
    left join val act on act.kpi = d.kpi and act.grupo = 'act'
    left join val ant on ant.kpi = d.kpi and ant.grupo = 'ant'
  ), fin as (
    select p.*,
           round(case when p.nmin and p.n_act < p_nmin then null else p.v_act end, 6) as valor,
           round(case when p.nmin and p.n_ant < p_nmin then null else p.v_ant end, 6) as anterior
    from per p
  )
  select f.kpi, f.valor, f.anterior,
         case when f.anterior is null or f.anterior = 0 or f.valor is null then null
              else round((f.valor - f.anterior) / f.anterior, 6) end,
         f.n_act, f.unidad,
         case when f.foto then null else (
           select array_agg(round(case when f.tipo in ('suma', 'distinto') then coalesce(v.valor, 0) else v.valor end, 6)
                            order by c.ord)
           from unnest(p_cubetas) with ordinality as c (cubeta, ord)
           left join val v on v.kpi = f.kpi and v.grupo = 'b' || c.cubeta::text) end,
         f.n_ant
  from fin f
  order by f.orden $$;
revoke all on function private.kpi_ensamblar(jsonb, jsonb, date[], integer) from public, anon, authenticated;
grant execute on function private.kpi_ensamblar(jsonb, jsonb, date[], integer) to authenticated, service_role;

-- Desempeño por asignación verificada (docs/kpis.md §0.3): asignaciones CUMPLIDAS con verificada_at en el rango y la
-- suma, por asignación, del último corte APROBADO de cada publicación (D7 > H72 > H24). Invoker: la RLS del llamador
-- limita las filas. Asignaciones sin métricas aprobadas quedan con desempeño null.
create function private.desempeno_verificadas(p_ini timestamptz, p_fin timestamptz)
returns table (asignacion_id uuid, verificada_at timestamptz, anunciante_id uuid, medio_id uuid, campana_id uuid,
               oferta_id uuid, plataforma public.plataforma, monto_bruto numeric, alcance numeric, impresiones numeric,
               interacciones numeric, clics numeric, reproducciones numeric)
language sql stable set search_path = '' as $$
  with base as (
    select a.id, a.verificada_at, a.anunciante_id, a.medio_id, a.campana_id, a.oferta_id, a.plataforma, a.monto_bruto
    from public.asignaciones a
    where a.verificada_at >= p_ini and a.verificada_at < p_fin and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
  ), ultimo_corte as (
    select distinct on (m.publicacion_id) m.publicacion_id, m.asignacion_id, m.alcance_norm, m.impresiones_norm,
           m.interacciones, m.clics_enlace, m.reproducciones
    from base b
    join public.metricas m on m.asignacion_id = b.id
    where m.estado_validacion = 'APROBADA' and m.corte <> 'PERSONALIZADO'
    order by m.publicacion_id, case m.corte when 'D7' then 3 when 'H72' then 2 else 1 end desc
  ), desempeno as (
    select uc.asignacion_id, sum(uc.alcance_norm) as alcance, sum(uc.impresiones_norm) as impresiones,
           sum(coalesce(uc.interacciones, 0)) as interacciones, sum(coalesce(uc.clics_enlace, 0)) as clics,
           sum(coalesce(uc.reproducciones, 0)) as reproducciones
    from ultimo_corte uc
    group by uc.asignacion_id
  )
  select b.id, b.verificada_at, b.anunciante_id, b.medio_id, b.campana_id, b.oferta_id, b.plataforma, b.monto_bruto,
         d.alcance, d.impresiones, d.interacciones, d.clics, d.reproducciones
  from base b
  left join desempeno d on d.asignacion_id = b.id $$;
revoke all on function private.desempeno_verificadas(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.desempeno_verificadas(timestamptz, timestamptz) to authenticated, service_role;

-- Tasa de cumplimiento (docs/kpis.md §1.10): ¿la asignación entra en el denominador? y ¿se cumplió?
create function private.cumplimiento_aplica(p_estado public.asignacion_estado, p_previo public.asignacion_estado,
                                            p_causa public.cancelacion_causa, p_aceptada_at timestamptz,
                                            p_limite timestamptz)
returns boolean
language sql stable set search_path = '' as $$
  select p_limite <= private.ahora() and p_aceptada_at is not null and p_estado <> 'RECHAZADA'
     and not (p_estado = 'CANCELADA' and coalesce(p_causa in ('ADMINISTRATIVA', 'ACUERDO'), false))
     and not (p_estado = 'PUBLICADA' or (p_estado = 'EN_DISPUTA' and coalesce(p_previo in ('PUBLICADA', 'VENCIDA_SIN_PUBLICAR'), false))) $$;
revoke all on function private.cumplimiento_aplica(public.asignacion_estado, public.asignacion_estado, public.cancelacion_causa,
  timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.cumplimiento_aplica(public.asignacion_estado, public.asignacion_estado, public.cancelacion_causa,
  timestamptz, timestamptz) to authenticated, service_role;

create function private.cumplimiento_ok(p_estado public.asignacion_estado, p_causa public.cancelacion_causa,
                                        p_publicada_at timestamptz, p_evidencia_at timestamptz, p_limite timestamptz)
returns boolean
language sql immutable set search_path = '' as $$
  select p_evidencia_at is not null and p_publicada_at is not null and p_publicada_at <= p_limite
     and p_estado <> 'VENCIDA_SIN_PUBLICAR'
     and p_causa is distinct from 'INCUMPLIMIENTO_MEDIO' and p_causa is distinct from 'FRAUDE' $$;
revoke all on function private.cumplimiento_ok(public.asignacion_estado, public.cancelacion_causa, timestamptz, timestamptz,
  timestamptz) from public, anon, authenticated;
grant execute on function private.cumplimiento_ok(public.asignacion_estado, public.cancelacion_causa, timestamptz, timestamptz,
  timestamptz) to authenticated, service_role;

-- Medios en riesgo al instante p_t (docs/kpis.md §1.14): verificados con aceptaciones en `medios.dias_actividad`
-- días pero ninguna en los últimos `medios.dias_riesgo_sin_aceptar`. Invoker.
create function private.medios_en_riesgo_al(p_t timestamptz)
returns table (medio_id uuid, gmv_90d numeric, ultima_aceptacion_at timestamptz)
language sql stable set search_path = '' as $$
  select x.medio_id, x.gmv_90d, x.ultima
  from (select a.medio_id,
               coalesce(sum(a.monto_bruto) filter (where a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')), 0) as gmv_90d,
               max(a.aceptada_at) as ultima
        from public.asignaciones a
        join public.medios m on m.id = a.medio_id
        where m.estado = 'VERIFICADO' and m.deleted_at is null
          and a.aceptada_at >= p_t - make_interval(days => private.config_entero('medios.dias_actividad'))
          and a.aceptada_at < p_t
        group by a.medio_id) x
  where x.ultima < p_t - make_interval(days => private.config_entero('medios.dias_riesgo_sin_aceptar')) $$;
revoke all on function private.medios_en_riesgo_al(timestamptz) from public, anon, authenticated;
grant execute on function private.medios_en_riesgo_al(timestamptz) to authenticated, service_role;

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
               'cumplimiento_aplica', 'cumplimiento_ok', 'medios_en_riesgo_al', 'geo_valores']::text[] $$;

-- 3. Índices de soporte (§5.9). asignaciones_verificada_at_idx (M7) se reemplaza por la versión cubriente.
create index asignaciones_aceptada_cubierta_idx on public.asignaciones (aceptada_at)
  include (monto_bruto, medio_id, anunciante_id, campana_id, plataforma, estado, estado_previo_disputa)
  where aceptada_at is not null;
create index asignaciones_verificada_cubierta_idx on public.asignaciones (verificada_at)
  include (monto_bruto, estado, medio_id, anunciante_id, campana_id, oferta_id, plataforma)
  where verificada_at is not null;
drop index public.asignaciones_verificada_at_idx;
create index asignaciones_limite_publicacion_idx on public.asignaciones (fecha_limite_publicacion)
  where aceptada_at is not null;
create index asignaciones_publicada_at_idx on public.asignaciones (publicada_at) where publicada_at is not null;
create index asignaciones_pagada_at_idx on public.asignaciones (pagada_at) where pagada_at is not null;
create index ofertas_limite_publicadas_idx on public.ofertas (fecha_limite_aceptacion)
  where publicada_at is not null and deleted_at is null;
create index ofertas_llena_at_idx on public.ofertas (llena_at) where llena_at is not null;
create index oferta_vistas_primera_vista_idx on public.oferta_vistas (primera_vista_at, oferta_id) include (medio_id);
create index accesos_evento_created_idx on public.accesos (evento, created_at)
  include (pais_iso2, departamento_codigo, municipio_codigo, usuario_id);
create index medios_verificado_at_idx on public.medios (verificado_at) where verificado_at is not null;
create index publicaciones_fecha_publicacion_idx on public.publicaciones (fecha_publicacion);
create index facturas_fecha_emision_idx on public.facturas (fecha_emision) where fecha_emision is not null;
create index pagos_anunciante_fecha_pago_idx on public.pagos_anunciante (fecha_pago);

-- 4. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert (select count(*) from private.kpi_ensamblar(
            '[{"kpi":"a","orden":1,"tipo":"suma","unidad":"conteo"},{"kpi":"b","orden":2,"tipo":"razon","unidad":"%","nmin":true}]',
            '[{"kpi":"a","grupo":"act","num":3,"n":3},{"kpi":"b","grupo":"act","num":1,"den":2,"n":2}]',
            array['2026-01-01'::date], 20)) = 2, 'kpi_ensamblar no devuelve una fila por definición';
end $$;
