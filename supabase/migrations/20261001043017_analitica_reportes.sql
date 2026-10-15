-- Migración 9e · analitica_reportes (docs/modelo-datos.md §5.9, docs/kpis.md)
-- Reportes: reporte_resumen_ejecutivo, reporte_desempeno_campanas, reporte_cumplimiento_medios, reporte_finanzas y
-- reporte_cartera (invoker: la RLS del usuario limita las filas) y reporte_usuarios_accesos (DEFINER: necesita
-- auth.mfa_factors; filtra acceso_valido y exige reportes.ver + accesos.ver + usuarios.ver). Las razones por fila de
-- un reporte (una campaña, un medio, un grupo) devuelven siempre el valor (docs/kpis.md §0.4).

-- 1. reporte_resumen_ejecutivo (reportes.ver + inicio.admin): las tarjetas de kpis_admin.
create function public.reporte_resumen_ejecutivo(p_desde date, p_hasta date, p_desde_ant date default null,
                                                 p_hasta_ant date default null)
returns setof public.kpi_fila
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
begin
  perform private.exigir_permiso('reportes.ver');
  return query select * from public.kpis_admin(p_desde, p_hasta, p_desde_ant, p_hasta_ant);
end $$;
revoke all on function public.reporte_resumen_ejecutivo(date, date, date, date) from public, anon, authenticated;
grant execute on function public.reporte_resumen_ejecutivo(date, date, date, date) to authenticated;

-- 2. reporte_usuarios_accesos (reportes.ver + accesos.ver + usuarios.ver; DEFINER). Correo enmascarado salvo
-- datos_sensibles.ver. Fallidos: por usuario y, sin usuario, por hash del correo. mfa_activo: factor TOTP verificado.
create function public.reporte_usuarios_accesos(p_desde date, p_hasta date)
returns table (usuario_id uuid, nombre text, email text, rol text, estado public.perfil_estado, ultimo_acceso_at timestamptz,
               accesos_exitosos integer, accesos_fallidos integer, paises_distintos integer, sospechosos integer,
               mfa_activo boolean)
language plpgsql stable security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_sensibles boolean;
begin
  perform private.exigir_permiso('reportes.ver');
  perform private.exigir_permiso('accesos.ver');
  perform private.exigir_permiso('usuarios.ver');
  v_sensibles := private.tiene_permiso('datos_sensibles.ver');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with por_usuario as (
    select a.usuario_id as uid,
           count(*) filter (where a.evento = 'LOGIN_EXITOSO') as exitosos,
           count(*) filter (where a.evento = 'LOGIN_FALLIDO') as fallidos,
           count(distinct a.pais_iso2) filter (where a.evento = 'LOGIN_EXITOSO') as paises,
           count(*) filter (where a.es_sospechoso) as sospechosos
    from public.accesos a
    where a.created_at >= g.ini and a.created_at < g.fin and a.usuario_id is not null
    group by a.usuario_id
  ), por_hash as (
    select a.email_hash as hash, count(*) filter (where a.evento = 'LOGIN_FALLIDO') as fallidos
    from public.accesos a
    where a.created_at >= g.ini and a.created_at < g.fin and a.usuario_id is null and a.email_hash is not null
    group by a.email_hash
  )
  select p.id, p.nombre, case when v_sensibles then p.email::text else private.enmascarar(p.email::text) end, r.nombre,
         p.estado, p.ultimo_acceso_at, coalesce(u.exitosos, 0)::integer,
         (coalesce(u.fallidos, 0) + coalesce(h.fallidos, 0))::integer, coalesce(u.paises, 0)::integer,
         coalesce(u.sospechosos, 0)::integer,
         exists (select 1 from auth.mfa_factors f
                 where f.user_id = p.id and f.status::text = 'verified' and f.factor_type::text = 'totp')
  from public.perfiles p
  left join public.roles r on r.id = p.rol_id
  left join por_usuario u on u.uid = p.id
  left join por_hash h on h.hash = encode(sha256(convert_to(lower(p.email::text), 'UTF8')), 'hex')
  where p.deleted_at is null
  order by coalesce(u.exitosos, 0) desc, p.nombre nulls last, p.email;
end $$;
revoke all on function public.reporte_usuarios_accesos(date, date) from public, anon, authenticated;
grant execute on function public.reporte_usuarios_accesos(date, date) to authenticated;

-- 3. reporte_desempeno_campanas (reportes.ver; el anunciante solo las propias): campañas (no borrador) que se cruzan
-- con el periodo. Ofertas, cupos y llenado sobre sus ofertas publicadas (llenado: ventana de aceptación ya cerrada,
-- §1.7); GMV comprometido por aceptada_at; desempeño y verificadas por verificada_at; cumplimiento §1.10.
create function public.reporte_desempeno_campanas(p_desde date, p_hasta date, p_anunciante_id uuid default null)
returns table (campana_id uuid, campana text, anunciante text, ofertas integer, cupos integer, cupos_ocupados integer,
               tasa_llenado numeric, gmv_comprometido numeric, gmv_verificado numeric, alcance bigint, impresiones bigint,
               interacciones bigint, reproducciones bigint, clics bigint, cpm_efectivo numeric,
               costo_por_interaccion numeric, engagement numeric, costo_por_alcance numeric, tasa_cumplimiento numeric,
               n_verificadas integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record; v_an uuid;
begin
  perform private.exigir_permiso('reportes.ver');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  v_an := coalesce(private.mi_anunciante_id(), p_anunciante_id);
  return query
  with camps as (
    select c.id, c.nombre, c.anunciante_id
    from public.campanas c
    where c.deleted_at is null and c.estado <> 'BORRADOR' and c.fecha_inicio <= p_hasta and c.fecha_fin >= p_desde
      and (v_an is null or c.anunciante_id = v_an)
  ), ofe as (
    select o.campana_id, count(*) as n, sum(o.cupos_totales) as cupos, sum(o.cupos_ocupados) as ocupados,
           sum(least((select count(*) from public.asignaciones a
                      where a.oferta_id = o.id and a.aceptada_at is not null and a.aceptada_at <= o.fecha_limite_aceptacion),
                     o.cupos_totales))
             filter (where o.fecha_limite_aceptacion <= private.ahora() and o.estado <> 'CANCELADA') as tomados,
           sum(o.cupos_totales) filter (where o.fecha_limite_aceptacion <= private.ahora() and o.estado <> 'CANCELADA')
             as cupos_cerrados
    from public.ofertas o
    join camps c on c.id = o.campana_id
    where o.publicada_at is not null and o.deleted_at is null
    group by o.campana_id
  ), acep as (
    select a.campana_id, sum(a.monto_bruto) as gmv
    from public.asignaciones a
    join camps c on c.id = a.campana_id
    where a.aceptada_at >= g.ini and a.aceptada_at < g.fin and private.consume_cupo(a.estado, a.estado_previo_disputa)
    group by a.campana_id
  ), des as (
    select d.campana_id, count(*) as n, sum(d.monto_bruto) as gmv, sum(d.alcance) as alcance,
           sum(d.impresiones) as impresiones, sum(d.interacciones) as interacciones,
           sum(d.reproducciones) as reproducciones, sum(d.clics) as clics,
           sum(d.monto_bruto) filter (where d.impresiones > 0) as bruto_imp,
           sum(d.impresiones) filter (where d.impresiones > 0) as imp,
           sum(d.monto_bruto) filter (where d.interacciones > 0) as bruto_int,
           sum(d.interacciones) filter (where d.interacciones > 0) as inter,
           sum(d.interacciones) filter (where d.alcance > 0) as inter_alc,
           sum(d.monto_bruto) filter (where d.alcance > 0) as bruto_alc,
           sum(d.alcance) filter (where d.alcance > 0) as alc
    from private.desempeno_verificadas(g.ini, g.fin) d
    join camps c on c.id = d.campana_id
    group by d.campana_id
  ), cum as (
    select a.campana_id, count(*) as n,
           count(*) filter (where private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at,
                                                          a.evidencia_validada_at, a.fecha_limite_publicacion)) as ok
    from public.asignaciones a
    join camps c on c.id = a.campana_id
    where a.fecha_limite_publicacion >= g.ini and a.fecha_limite_publicacion < g.fin and a.aceptada_at is not null
      and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                      a.fecha_limite_publicacion)
    group by a.campana_id
  )
  select c.id, c.nombre, an.nombre_comercial,
         coalesce(o.n, 0)::integer, coalesce(o.cupos, 0)::integer, coalesce(o.ocupados, 0)::integer,
         round(o.tomados::numeric / nullif(o.cupos_cerrados, 0), 6),
         coalesce(ac.gmv, 0), coalesce(d.gmv, 0), coalesce(d.alcance, 0)::bigint, coalesce(d.impresiones, 0)::bigint,
         coalesce(d.interacciones, 0)::bigint, coalesce(d.reproducciones, 0)::bigint, coalesce(d.clics, 0)::bigint,
         round(d.bruto_imp / nullif(d.imp, 0) * 1000, 2), round(d.bruto_int / nullif(d.inter, 0), 2),
         round(d.inter_alc / nullif(d.alc, 0), 6), round(d.bruto_alc / nullif(d.alc, 0), 4),
         round(cu.ok::numeric / nullif(cu.n, 0), 6), coalesce(d.n, 0)::integer
  from camps c
  left join public.anunciantes an on an.id = c.anunciante_id
  left join ofe o on o.campana_id = c.id
  left join acep ac on ac.campana_id = c.id
  left join des d on d.campana_id = c.id
  left join cum cu on cu.campana_id = c.id
  order by coalesce(ac.gmv, 0) desc, c.nombre;
end $$;
revoke all on function public.reporte_desempeno_campanas(date, date, uuid) from public, anon, authenticated;
grant execute on function public.reporte_desempeno_campanas(date, date, uuid) to authenticated;

-- 4. reporte_cumplimiento_medios (reportes.ver): por medio, asignaciones con fecha límite de publicación en el
-- periodo (§1.10: comprometidas = denominador, cumplidas = numerador; vencidas, canceladas y en disputa por estado
-- actual), alertas de métricas creadas en el periodo y multiplicador promedio de sus cuentas verificadas.
create function public.reporte_cumplimiento_medios(p_desde date, p_hasta date, p_departamento char(2) default null)
returns table (medio_id uuid, medio text, departamento text, municipio text, nivel smallint, comprometidas integer,
               cumplidas integer, vencidas integer, canceladas integer, en_disputa integer, tasa_cumplimiento numeric,
               alertas_metricas integer, multiplicador_promedio numeric)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record;
begin
  perform private.exigir_permiso('reportes.ver');
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with base as (
    select a.medio_id as mid,
           count(*) filter (where private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion,
                                                              a.aceptada_at, a.fecha_limite_publicacion)) as comp,
           count(*) filter (where private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion,
                                                              a.aceptada_at, a.fecha_limite_publicacion)
                              and private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at,
                                                          a.evidencia_validada_at, a.fecha_limite_publicacion)) as cump,
           count(*) filter (where a.estado = 'VENCIDA_SIN_PUBLICAR') as venc,
           count(*) filter (where a.estado = 'CANCELADA') as canc,
           count(*) filter (where a.estado = 'EN_DISPUTA') as disp
    from public.asignaciones a
    join public.medios m on m.id = a.medio_id
    where a.fecha_limite_publicacion >= g.ini and a.fecha_limite_publicacion < g.fin and a.aceptada_at is not null
      and (p_departamento is null or m.departamento_codigo = p_departamento)
    group by a.medio_id
  ), alertas as (
    select x.medio_id as mid, count(*) as n
    from public.metricas x
    join public.medios m on m.id = x.medio_id
    where (x.alerta_desviacion or x.alerta_multiplo) and x.created_at >= g.ini and x.created_at < g.fin
      and (p_departamento is null or m.departamento_codigo = p_departamento)
    group by x.medio_id
  ), ids as (
    select b.mid from base b union select al.mid from alertas al
  )
  select m.id, m.nombre, de.nombre, mu.nombre, m.nivel_verificacion,
         coalesce(b.comp, 0)::integer, coalesce(b.cump, 0)::integer, coalesce(b.venc, 0)::integer,
         coalesce(b.canc, 0)::integer, coalesce(b.disp, 0)::integer, round(b.cump::numeric / nullif(b.comp, 0), 6),
         coalesce(al.n, 0)::integer,
         (select round(avg(c.multiplicador_calidad), 3) from public.cuentas_sociales c
          where c.medio_id = m.id and c.verificada and c.deleted_at is null)
  from ids i
  join public.medios m on m.id = i.mid
  left join base b on b.mid = m.id
  left join alertas al on al.mid = m.id
  left join public.departamentos de on de.codigo = m.departamento_codigo
  left join public.municipios mu on mu.codigo = m.municipio_codigo
  order by coalesce(b.comp, 0) desc, m.nombre;
end $$;
revoke all on function public.reporte_cumplimiento_medios(date, date, char) from public, anon, authenticated;
grant execute on function public.reporte_cumplimiento_medios(date, date, char) to authenticated;

-- 5. reporte_finanzas (reportes.finanzas): por anunciante, sector o mes. GMV comprometido (aceptada_at, vigentes),
-- verificado y comisión (verificada_at, CUMPLIDAS), pagado a medios (neto de asignaciones PAGADA por pagada_at),
-- facturado (facturas emitidas no anuladas por fecha_emision), recaudado (pagos por fecha_pago) y cartera (saldo al
-- cierre: al p_hasta por anunciante/sector, al cierre de cada mes en la agrupación mensual).
create function public.reporte_finanzas(p_desde date, p_hasta date, p_agrupacion text)
returns table (grupo_id text, grupo text, gmv_comprometido numeric, gmv_verificado numeric, comision numeric,
               take_rate numeric, pagado_medios numeric, facturado numeric, recaudado numeric, cartera numeric)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
declare g record;
begin
  perform private.exigir_permiso('reportes.finanzas');
  if p_agrupacion is null or p_agrupacion not in ('anunciante', 'sector', 'mes') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La agrupación debe ser anunciante, sector o mes.';
  end if;
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with meses as (
    select m::date as mes from generate_series(date_trunc('month', p_desde::timestamp), p_hasta::timestamp, interval '1 month') m
  ), cortes as (
    select case when p_agrupacion = 'mes' then least((ms.mes + interval '1 month' - interval '1 day')::date, p_hasta)
                else p_hasta end as corte
    from meses ms
    where p_agrupacion = 'mes' or ms.mes = (select min(x.mes) from meses x)
  ), hechos (anunciante_id, fecha, metrica, valor) as (
    select a.anunciante_id, a.aceptada_at::date, 'gmv_comprometido', a.monto_bruto
    from public.asignaciones a
    where a.aceptada_at >= g.ini and a.aceptada_at < g.fin and private.consume_cupo(a.estado, a.estado_previo_disputa)
    union all
    select a.anunciante_id, a.verificada_at::date, k.metrica,
           case when k.metrica = 'gmv_verificado' then a.monto_bruto else am.monto_comision end
    from public.asignaciones a
    left join public.asignacion_montos am on am.asignacion_id = a.id
    cross join (values ('gmv_verificado'), ('comision')) k (metrica)
    where a.verificada_at >= g.ini and a.verificada_at < g.fin and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    union all
    select a.anunciante_id, a.pagada_at::date, 'pagado_medios', am.monto_neto
    from public.asignaciones a
    join public.asignacion_montos am on am.asignacion_id = a.id
    where a.estado = 'PAGADA' and a.pagada_at >= g.ini and a.pagada_at < g.fin
    union all
    select f.anunciante_id, f.fecha_emision, 'facturado', f.total
    from public.facturas f
    where f.fecha_emision between p_desde and p_hasta and f.estado not in ('BORRADOR', 'ANULADA')
    union all
    select pg.anunciante_id, pg.fecha_pago, 'recaudado', pg.monto
    from public.pagos_anunciante pg
    where pg.fecha_pago between p_desde and p_hasta
    union all
    select f.anunciante_id, c.corte, 'cartera',
           greatest(f.total - coalesce((select sum(pg.monto) from public.pagos_anunciante pg
                                        where pg.factura_id = f.id and pg.fecha_pago <= c.corte), 0), 0)
    from cortes c
    join public.facturas f on f.fecha_emision <= c.corte and f.estado not in ('BORRADOR', 'ANULADA')
    union all
    select null::uuid, ms.mes, 'facturado', 0 from meses ms where p_agrupacion = 'mes'
  ), agrupado as (
    select case p_agrupacion
             when 'anunciante' then h.anunciante_id::text
             when 'sector' then an.sector_id::text
             else to_char(date_trunc('month', h.fecha::timestamp), 'YYYY-MM') end as gid,
           case p_agrupacion
             when 'anunciante' then an.nombre_comercial
             when 'sector' then se.nombre
             else (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                         'noviembre', 'diciembre'])[extract(month from h.fecha)::integer] || ' ' || extract(year from h.fecha)::integer
           end as gnombre,
           h.metrica, h.valor
    from hechos h
    left join public.anunciantes an on an.id = h.anunciante_id
    left join public.sectores se on se.id = an.sector_id
  )
  select x.gid, max(x.gnombre),
         coalesce(sum(x.valor) filter (where x.metrica = 'gmv_comprometido'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'gmv_verificado'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'comision'), 0),
         round(sum(x.valor) filter (where x.metrica = 'comision')
               / nullif(sum(x.valor) filter (where x.metrica = 'gmv_verificado'), 0), 6),
         coalesce(sum(x.valor) filter (where x.metrica = 'pagado_medios'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'facturado'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'recaudado'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'cartera'), 0)
  from agrupado x
  where x.gid is not null
  group by x.gid
  order by case when p_agrupacion = 'mes' then x.gid end,
           coalesce(sum(x.valor) filter (where x.metrica = 'gmv_verificado'), 0) desc, x.gid;
end $$;
revoke all on function public.reporte_finanzas(date, date, text) from public, anon, authenticated;
grant execute on function public.reporte_finanzas(date, date, text) to authenticated;

-- 6. reporte_cartera (reportes.finanzas): saldo por anunciante al corte con antigüedad por días desde el vencimiento
-- (0–30 incluye lo no vencido). Solo anunciantes con saldo.
create function public.reporte_cartera(p_corte date)
returns table (anunciante_id uuid, anunciante text, facturado numeric, pagado numeric, saldo numeric, saldo_0_30 numeric,
               saldo_31_60 numeric, saldo_61_90 numeric, saldo_90_mas numeric, facturas_vencidas integer)
language plpgsql stable security invoker set search_path = '' set timezone = 'America/Bogota' as $$
begin
  perform private.exigir_permiso('reportes.finanzas');
  if p_corte is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Indica la fecha de corte.';
  end if;
  return query
  with f as (
    select x.id, x.anunciante_id as aid, x.total, x.fecha_vencimiento,
           coalesce((select sum(pg.monto) from public.pagos_anunciante pg
                     where pg.factura_id = x.id and pg.fecha_pago <= p_corte), 0) as pagos
    from public.facturas x
    where x.fecha_emision <= p_corte and x.estado not in ('BORRADOR', 'ANULADA')
  ), s as (
    select f.*, greatest(f.total - f.pagos, 0) as sal, p_corte - f.fecha_vencimiento as mora from f
  )
  select s.aid, an.nombre_comercial, sum(s.total), sum(s.pagos), sum(s.sal),
         coalesce(sum(s.sal) filter (where s.mora is null or s.mora <= 30), 0),
         coalesce(sum(s.sal) filter (where s.mora between 31 and 60), 0),
         coalesce(sum(s.sal) filter (where s.mora between 61 and 90), 0),
         coalesce(sum(s.sal) filter (where s.mora > 90), 0),
         (count(*) filter (where s.sal > 0 and s.fecha_vencimiento < p_corte))::integer
  from s
  left join public.anunciantes an on an.id = s.aid
  group by s.aid, an.nombre_comercial
  having sum(s.sal) > 0
  order by sum(s.sal) desc, an.nombre_comercial;
end $$;
revoke all on function public.reporte_cartera(date) from public, anon, authenticated;
grant execute on function public.reporte_cartera(date) to authenticated;

-- 7. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public'
                       and p.proname in ('reporte_resumen_ejecutivo', 'reporte_desempeno_campanas', 'reporte_cumplimiento_medios',
                                         'reporte_finanzas', 'reporte_cartera')
                       and (p.prosecdef or p.provolatile <> 's'
                            or not exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=america/bogota'))),
         'los reportes deben ser invoker, STABLE y con timezone America/Bogota';
  assert (select p.prosecdef and p.provolatile = 's' from pg_proc p
          where p.oid = 'public.reporte_usuarios_accesos(date, date)'::regprocedure),
         'reporte_usuarios_accesos debe ser definer y STABLE';
end $$;
