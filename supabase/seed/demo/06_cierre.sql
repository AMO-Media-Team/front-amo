-- Datos demo · paso 06 · cierre (docs/modelo-datos.md §10.2 paso 7 y §10.4)
-- Se ejecuta DESPUÉS de la operación (03_mes.sql) y de las finanzas (04_finanzas.sql), siempre con amo.modo_carga:
--   demo_cierre(semilla): estado final al «hoy» de la demo (suspensiones de medios y anunciantes) y los eventos de
--     configuración que faltan en la bitácora (revisión de tarifas, excepciones de comisión).
--   demo_volcar_bitacora(mes): pasa a public.bitacora (origen DEMO, es_demo) los eventos en espera anteriores al fin del
--     mes, en orden cronológico. Una llamada por mes, en orden; es idempotente porque vacía lo que vuelca.
--   demo_volcar_avisos(dias): pasa a public.notificaciones los avisos de los últimos `dias` (90) con el texto de su
--     plantilla; los anteriores se descartan (la retención borra las notificaciones leídas a los 180 días).
--   demo_verificar(): comprobaciones de coherencia y volúmenes finales (no modifica nada).

create or replace function private.demo_cierre(p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_ops uuid[];
  v_admin uuid;
  r jsonb := '{}';
  v_n integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_cierre exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  perform setseed(private.demo_semilla(p_semilla, 400));
  select array_agg(u.usuario_id order by u.email) into v_ops from private.demo_usuarios u where u.clase = 'OPERACIONES';
  select u.usuario_id into v_admin from private.demo_usuarios u where u.email = 'demo.admin@amo.test';

  -- Suspensiones previstas en el plan (demo_medios/demo_anunciantes.baja_at): el generador mensual ya dejó de asignarles
  -- trabajo desde esa fecha; aquí queda el estado y su transición.
  drop table if exists _baja;
  create temp table _baja on commit drop as
  select 'medios'::text as entidad, d.medio_id as id, d.baja_at as t, v_ops[1 + d.n % cardinality(v_ops)] as actor,
         (array['Reportó métricas infladas en tres campañas consecutivas.',
                'Incumplimiento reiterado de publicaciones aceptadas.',
                'La cuenta social principal fue cerrada por la plataforma.',
                'Documentación vencida sin actualizar tras dos requerimientos.'])[1 + d.n % 4] as motivo
  from private.demo_medios d join public.medios m on m.id = d.medio_id
  where d.estado_final = 'SUSPENDIDO' and d.baja_at <= v_hoy and m.estado = 'VERIFICADO'
  union all
  select 'anunciantes', d.anunciante_id, d.baja_at, v_ops[1],
         'Suspendido mientras actualiza su documentación legal y su representante.'
  from private.demo_anunciantes d join public.anunciantes a on a.id = d.anunciante_id
  where d.estado_final = 'SUSPENDIDO' and d.baja_at <= v_hoy and a.estado_verificacion = 'VERIFICADO';

  update public.medios m set estado = 'SUSPENDIDO', suspendido_at = b.t, motivo_estado = b.motivo, updated_at = b.t
  from _baja b where b.entidad = 'medios' and m.id = b.id;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('medios_suspendidos', v_n);
  update public.anunciantes a set estado_verificacion = 'SUSPENDIDO', suspendido_at = b.t, motivo_estado = b.motivo, updated_at = b.t
  from _baja b where b.entidad = 'anunciantes' and a.id = b.id;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('anunciantes_suspendidos', v_n);

  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, motivo, cambios, metadatos)
  select b.t, b.actor, b.entidad, b.id::text, 'TRANSICION', 'VERIFICADO', 'SUSPENDIDO', b.motivo,
         jsonb_build_object(case when b.entidad = 'medios' then 'estado' else 'estado_verificacion' end,
                            jsonb_build_object('antes', 'VERIFICADO', 'despues', 'SUSPENDIDO')), null::jsonb
  from _baja b
  -- Revisión de tarifas: la vigencia que rige desde el 1 de enero se configuró a mediados de diciembre.
  union all
  select z.vigente_desde - interval '13 days 14 hours', v_admin, 'tarifas', null, 'CONFIGURAR', null, null,
         'Revisión anual de tarifas (+6 %)', null,
         jsonb_build_object('vigente_desde', (z.vigente_desde at time zone 'America/Bogota')::date, 'tarifas', z.n, 'ajuste', '+6 %')
  from (select t.vigente_desde, count(*) as n from public.tarifas t
        where t.vigente_hasta is null and exists (select 1 from public.tarifas x where x.vigente_hasta = t.vigente_desde)
        group by t.vigente_desde) z
  where z.vigente_desde - interval '13 days 14 hours' <= v_hoy
  union all
  select ce.created_at, v_admin, 'comisiones_excepcion', ce.id::text, 'INSERT', null, null, ce.motivo,
         jsonb_build_object('anunciante_id', ce.anunciante_id, 'campana_id', ce.campana_id, 'porcentaje', ce.porcentaje), null
  from public.comisiones_excepcion ce
  where (ce.anunciante_id in (select d.anunciante_id from private.demo_anunciantes d)
         or ce.campana_id in (select c.id from public.campanas c where c.es_demo))
    and ce.created_at <= v_hoy;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('eventos', v_n);

  return r || jsonb_build_object('eventos_en_espera', (select count(*) from private.demo_eventos),
                                 'avisos_en_espera', (select count(*) from private.demo_avisos));
end $fn$;
revoke all on function private.demo_cierre(double precision) from public, anon, authenticated, service_role;

-- Texto de una plantilla con sus variables {{clave}} (misma regla que private.notificar).
create or replace function private.demo_render(p_texto text, p_datos jsonb, p_max integer) returns text
language plpgsql immutable set search_path = '' as $fn$
declare v text := p_texto; k text; x text;
begin
  for k, x in select e.key, coalesce(e.value #>> '{}', '—') from jsonb_each(coalesce(p_datos, '{}'::jsonb)) e loop
    v := replace(v, '{{' || k || '}}', x);
  end loop;
  v := btrim(regexp_replace(v, '\{\{[a-z_]+\}\}', '—', 'g'));
  v := replace(v, '..', '.');  -- el dato ya traía su punto final
  return case when char_length(v) > p_max then left(v, p_max - 1) || '…' else v end;
end $fn$;
revoke all on function private.demo_render(text, jsonb, integer) from public, anon, authenticated, service_role;

create or replace function private.demo_volcar_bitacora(p_mes date) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_fin timestamptz := private.inicio_dia((p_mes + interval '1 month')::date);
  v_n integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_volcar_bitacora exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  -- IP, país, ciudad y navegador: los habituales del actor (los mismos de sus accesos). Sin actor = proceso del sistema.
  with e as (
    delete from private.demo_eventos x where x.t < v_fin returning x.*
  )
  insert into public.bitacora (created_at, actor_id, actor_email, actor_rol, entidad, entidad_id, accion, estado_anterior,
                               estado_nuevo, cambios, metadatos, motivo, origen, ip, pais_iso2, ciudad, user_agent, es_demo)
  select e.t, e.actor_id, private.enmascarar(u.email), u.clase, e.entidad, e.entidad_id, e.accion, e.anterior, e.nuevo,
         e.cambios, coalesce(e.metadatos, '{}'::jsonb), e.motivo, 'DEMO', u.ip, u.pais, u.ciudad, left(u.user_agent, 400), true
  from e left join private.demo_usuarios u on u.usuario_id = e.actor_id
  order by e.t, e.entidad, e.entidad_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('mes', p_mes, 'bitacora', v_n, 'en_espera', (select count(*) from private.demo_eventos));
end $fn$;
revoke all on function private.demo_volcar_bitacora(date) from public, anon, authenticated, service_role;

create or replace function private.demo_volcar_avisos(p_dias integer default 90) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_desde timestamptz := private.demo_hoy() - make_interval(days => p_dias);
  v_total integer;
  v_n integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_volcar_avisos exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  perform setseed(0.7070);
  select count(*) into v_total from private.demo_avisos;
  -- Leídas según su antigüedad; las cuentas con nombre conservan sin leer lo de los últimos 10 días (campana con datos).
  with a as (
    delete from private.demo_avisos x returning x.*
  ), listo as (
    select a.t, a.usuario_id, a.tipo, a.datos, a.entidad, a.entidad_id, a.prioridad, pl.nombre, pl.cuerpo,
           random() as r1, random() as r2, p.email::text like 'demo.%@amo.test' as con_nombre
    from a
    join public.plantillas_notificacion pl on pl.clave = a.tipo and pl.canal = 'APP' and pl.activa
    join public.perfiles p on p.id = a.usuario_id and p.estado = 'ACTIVO' and p.deleted_at is null
    where a.t >= v_desde and a.t <= v_hoy
  )
  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url, prioridad, canal, leida,
                                     leida_at, es_demo, created_at)
  select l.usuario_id, l.tipo, private.demo_render(l.nombre, l.datos, 120), private.demo_render(l.cuerpo, l.datos, 500),
         left(l.entidad, 60), left(l.entidad_id, 80),
         case l.tipo when 'seguridad.pais_inusual' then '/cuenta/seguridad'
                     when 'seguridad.alerta_pais_inusual' then '/administracion/accesos' end,
         l.prioridad, 'APP', z.leida,
         case when z.leida then least(l.t + (0.1 + l.r2 * 30) * interval '1 hour', v_hoy) end, true, l.t
  from listo l
  cross join lateral (select l.r1 < case when l.con_nombre and l.t > v_hoy - interval '10 days' then 0.0
                                         when l.t > v_hoy - interval '3 days' then 0.35
                                         when l.t > v_hoy - interval '14 days' then 0.75 else 0.93 end as leida) z
  order by l.t;
  get diagnostics v_n = row_count;
  return jsonb_build_object('notificaciones', v_n, 'descartados', v_total - v_n, 'desde', v_desde);
end $fn$;
revoke all on function private.demo_volcar_avisos(integer) from public, anon, authenticated, service_role;

create or replace function private.demo_verificar() returns jsonb
language plpgsql stable set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_err text[] := '{}';
  v_n bigint;
begin
  select count(*) into v_n from public.asignaciones a
  where a.es_demo and a.aceptada_at is not null
    and not exists (select 1 from public.asignacion_montos m where m.asignacion_id = a.id);
  if v_n > 0 then v_err := v_err || format('%s asignaciones aceptadas sin asignacion_montos', v_n); end if;

  select count(*) into v_n from public.asignaciones a
  where a.es_demo and a.estado in ('LIQUIDADA', 'PAGADA')
    and not exists (select 1 from public.liquidaciones l where l.id = a.liquidacion_id
                      and (a.estado = 'LIQUIDADA' or l.estado = 'PAGADA'));
  if v_n > 0 then v_err := v_err || format('%s asignaciones liquidadas o pagadas sin su liquidación en el estado debido', v_n); end if;

  select count(*) into v_n
  from public.liquidaciones l
  join (select a.liquidacion_id, count(*) as n, sum(m.monto_bruto) as bruto, sum(m.monto_comision) as comision,
               sum(m.monto_medio) as medio, sum(m.monto_retenciones) as retenciones, sum(m.monto_neto) as neto
        from public.asignaciones a join public.asignacion_montos m on m.asignacion_id = a.id
        where a.liquidacion_id is not null group by a.liquidacion_id) s on s.liquidacion_id = l.id
  where l.es_demo and (l.cantidad_asignaciones <> s.n or l.monto_bruto <> s.bruto or l.monto_comision <> s.comision
                       or l.monto_medio <> s.medio or l.monto_retenciones <> s.retenciones or l.monto_neto <> s.neto
                       or l.monto_neto <> l.monto_medio - l.monto_retenciones or l.monto_medio <> l.monto_bruto - l.monto_comision);
  if v_n > 0 then v_err := v_err || format('%s liquidaciones no cuadran con sus asignaciones', v_n); end if;

  select count(*) into v_n from public.liquidaciones l
  where l.es_demo and l.requiere_documento_soporte
        is distinct from exists (select 1 from public.documentos_soporte d where d.liquidacion_id = l.id);
  if v_n > 0 then v_err := v_err || format('%s liquidaciones con el documento soporte que no corresponde', v_n); end if;

  select count(*) into v_n
  from public.resoluciones_dian d
  cross join lateral (select count(*) as n, min(s.consecutivo) as lo, max(s.consecutivo) as hi
                      from public.documentos_soporte s where s.resolucion_id = d.id) s
  cross join lateral (select count(*) as n, min(f.consecutivo) as lo, max(f.consecutivo) as hi
                      from public.facturas f where f.resolucion_id = d.id) f
  where d.prefijo = 'DEMO'
    and ((s.n > 0 and (s.lo <> 1 or s.hi <> s.n or d.consecutivo_actual <> s.hi))
      or (f.n > 0 and (f.lo <> 1 or f.hi <> f.n or d.consecutivo_actual <> f.hi)));
  if v_n > 0 then v_err := v_err || format('%s resoluciones DEMO con huecos o consecutivo desfasado', v_n); end if;

  select count(*) into v_n
  from public.facturas f
  left join lateral (select coalesce(sum(p.monto), 0) as pagado from public.pagos_anunciante p where p.factura_id = f.id) p on true
  left join lateral (select coalesce(sum(a.monto_bruto), 0) as bruto from public.asignaciones a where a.factura_id = f.id) a on true
  where f.es_demo and (f.pagado <> p.pagado or f.subtotal <> a.bruto or f.pagado > f.subtotal + f.iva
                       or (f.estado = 'PAGADA') <> (f.pagado >= f.subtotal + f.iva)
                       or (f.estado = 'VENCIDA' and f.fecha_vencimiento >= (private.demo_hoy() at time zone 'America/Bogota')::date));
  if v_n > 0 then v_err := v_err || format('%s facturas no cuadran con sus pagos, asignaciones o estado', v_n); end if;

  select count(*) into v_n from private.demo_medios d join public.medios m on m.id = d.medio_id
  where d.estado_final <> m.estado::text and not (d.estado_final = 'SUSPENDIDO' and d.baja_at > private.demo_hoy());
  if v_n > 0 then v_err := v_err || format('%s medios sin su estado final', v_n); end if;

  select (select count(*) from private.demo_eventos) + (select count(*) from private.demo_avisos) into v_n;
  if v_n > 0 then v_err := v_err || format('%s eventos o avisos siguen en espera (falta volcar)', v_n); end if;

  return jsonb_build_object(
    'ok', cardinality(v_err) = 0, 'errores', to_jsonb(v_err), 'hoy', private.demo_hoy(),
    'volumenes', jsonb_build_object(
      'perfiles', (select count(*) from private.demo_usuarios),
      'anunciantes', (select count(*) from private.demo_anunciantes),
      'medios', (select count(*) from private.demo_medios),
      'cuentas_sociales', (select count(*) from public.cuentas_sociales c join private.demo_medios d on d.medio_id = c.medio_id),
      'campanas', (select count(*) from public.campanas where es_demo),
      'ofertas', (select count(*) from public.ofertas o join public.campanas c on c.id = o.campana_id where c.es_demo),
      'asignaciones', (select count(*) from public.asignaciones where es_demo),
      'publicaciones', (select count(*) from public.publicaciones p join public.asignaciones a on a.id = p.asignacion_id where a.es_demo),
      'metricas', (select count(*) from public.metricas m join public.asignaciones a on a.id = m.asignacion_id where a.es_demo),
      'liquidaciones', (select count(*) from public.liquidaciones where es_demo),
      'documentos_soporte', (select count(*) from public.documentos_soporte d join public.liquidaciones l on l.id = d.liquidacion_id where l.es_demo),
      'dispersiones', (select count(*) from public.dispersiones where es_demo),
      'facturas', (select count(*) from public.facturas where es_demo),
      'pagos_anunciante', (select count(*) from public.pagos_anunciante where es_demo),
      'accesos', (select count(*) from public.accesos where es_demo),
      'bitacora', (select count(*) from public.bitacora where es_demo),
      'notificaciones', (select count(*) from public.notificaciones where es_demo)));
end $fn$;
revoke all on function private.demo_verificar() from public, anon, authenticated, service_role;
