-- Migración 11 · cron (docs/modelo-datos.md §5.8, §9.2)
-- Procesos programados con pg_cron (horarios en UTC; Bogotá = UTC−5, sin horario de verano):
--   amo_vencer_asignaciones        */15 * * * *    cada 15 min      call private.vencer_asignaciones()
--   amo_actualizar_estados         5-59/15 * * * * cada 15 min (+5) call private.actualizar_estados()
--   amo_recordatorios              20 * * * *      cada hora        private.generar_recordatorios()
--   amo_indicadores_medios         0 8 * * *       03:00 diario     recalcular_indicadores_medios, aplicar_multiplicadores_
--                                                                   programados y revisar_reverificacion
--   amo_recalcular_multiplicadores 30 8 * * 1      lunes 03:30      private.recalcular_multiplicadores()
--   amo_retencion                  0 9 * * *       04:00 diario     private.purgar_retencion() (incluye cron.job_run_details,
--                                                                   intentos_login y sesiones_actividad huérfanas)
-- Todo en private sin EXECUTE para roles de la API; solo los llama pg_cron como postgres (owner). Los dos procesos que
-- bloquean filas de negocio son PROCEDURE (invoker, sin cláusula SET: Postgres prohíbe COMMIT con SET o definer) y
-- confirman cada lote de 50; cada elemento va en su propia subtransacción con lock_timeout de 300 ms y revalida la
-- condición con la fila bloqueada (si otro proceso ganó la carrera, se omite). p_confirmar = false (pruebas dentro de
-- una transacción) no hace COMMIT. Las transiciones usan private.aplicar_transicion(..., 'SISTEMA', null, ...).
-- Desviación: purgar_demo conserva los anunciantes/medios demo que todavía referencia un perfil NO demo (p. ej. la
-- organización E2E) para no violar la FK perfiles → organización; el script de purga los reporta.

-- 1. Condiciones de las transiciones SISTEMA (§4.2) evaluadas sobre la fila actual
create function private.condicion_sistema(p_entidad text, p_id uuid, p_hacia text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_entidad = 'asignaciones' and p_hacia = 'VENCIDA_SIN_PUBLICAR' then exists (
      select 1 from public.asignaciones a
      where a.id = p_id and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO') and a.fecha_limite_publicacion < private.ahora())
    when p_entidad = 'ofertas' and p_hacia = 'EN_EJECUCION' then exists (
      select 1 from public.ofertas o
      where o.id = p_id and o.deleted_at is null
        and ((o.estado = 'PUBLICADA'
              and (o.ventana_inicio <= private.ahora() or o.fecha_limite_aceptacion <= private.ahora())
              and exists (select 1 from public.asignaciones a
                          where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa)))
             or (o.estado = 'CUPOS_COMPLETOS' and o.ventana_inicio <= private.ahora())))
    when p_entidad = 'ofertas' and p_hacia = 'VENCIDA' then exists (
      select 1 from public.ofertas o
      where o.id = p_id and o.deleted_at is null and o.estado = 'PUBLICADA'
        and o.fecha_limite_aceptacion <= private.ahora()
        and not exists (select 1 from public.asignaciones a
                        where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa)))
    when p_entidad = 'ofertas' and p_hacia = 'CERRADA' then exists (
      select 1 from public.ofertas o
      where o.id = p_id and o.ventana_fin < private.ahora()
        and (o.estado = 'VENCIDA'
             or (o.estado = 'EN_EJECUCION'
                 and not exists (select 1 from public.asignaciones a
                                 where a.oferta_id = o.id
                                   and a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA', 'RECHAZADA',
                                                        'VENCIDA_SIN_PUBLICAR', 'CANCELADA')))))
    when p_entidad = 'campanas' and p_hacia = 'FINALIZADA' then exists (
      select 1 from public.campanas c
      where c.id = p_id and c.estado = 'ACTIVA' and private.hoy() > c.fecha_fin
        and not exists (select 1 from public.ofertas o
                        where o.campana_id = c.id and o.deleted_at is null and o.estado not in ('CERRADA', 'CANCELADA')))
    when p_entidad = 'facturas' and p_hacia = 'VENCIDA' then exists (
      select 1 from public.facturas f
      where f.id = p_id and f.estado in ('EMITIDA', 'PAGADA_PARCIAL') and f.fecha_vencimiento < private.hoy() and f.saldo > 0)
    when p_entidad = 'documentos_medio' and p_hacia = 'VENCIDO' then exists (
      select 1 from public.documentos_medio d
      where d.id = p_id and d.estado_validacion = 'APROBADO' and d.fecha_vencimiento < private.hoy())
    when p_entidad = 'documentos_anunciante' and p_hacia = 'VENCIDO' then exists (
      select 1 from public.documentos_anunciante d
      where d.id = p_id and d.estado_validacion = 'APROBADO' and d.fecha_vencimiento < private.hoy())
    else false end $$;
revoke all on function private.condicion_sistema(text, uuid, text) from public, anon, authenticated, service_role;

-- Un elemento del lote: bloqueos canónicos (campaña → oferta → cupo de la franja → asignación), revalidación con la
-- fila bloqueada y transición SISTEMA (+ liberar el cupo al vencer). Subtransacción propia: un bloqueo ocupado o un
-- cambio de estado concurrente no aborta el lote (queda en el log y se reintenta en la siguiente corrida).
create function private.cron_aplicar(p_entidad text, p_id uuid, p_hacia text, p_motivo text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_campana uuid; v_oferta uuid; v_franja uuid;
begin
  if p_entidad = 'asignaciones' then
    select a.campana_id, a.oferta_id, a.franja_id into v_campana, v_oferta, v_franja from public.asignaciones a where a.id = p_id;
    perform 1 from public.campanas c where c.id = v_campana for update;
    perform 1 from public.ofertas o where o.id = v_oferta for update;
    perform 1 from public.oferta_cupos oc where oc.oferta_id = v_oferta and oc.franja_id = v_franja for update;
  elsif p_entidad = 'ofertas' then
    select o.campana_id into v_campana from public.ofertas o where o.id = p_id;
    perform 1 from public.campanas c where c.id = v_campana for update;
  end if;
  execute format('select 1 from public.%I x where x.id = $1 for update', p_entidad) using p_id;
  if not private.condicion_sistema(p_entidad, p_id, p_hacia) then
    return false;
  end if;
  perform private.aplicar_transicion(p_entidad, p_id, p_hacia, 'SISTEMA', null, p_motivo);
  if p_entidad = 'asignaciones' and p_hacia = 'VENCIDA_SIN_PUBLICAR' then
    perform private.liberar_cupo_efecto(p_id);
  end if;
  return true;
exception
  when lock_not_available then
    raise log 'amo cron: % % ocupado, se reintenta', p_entidad, p_id;
    return false;
  when sqlstate 'P0001' then
    raise log 'amo cron: % % no pasó a % (%), se omite', p_entidad, p_id, p_hacia, sqlerrm;
    return false;
end $$;
revoke all on function private.cron_aplicar(text, uuid, text, text) from public, anon, authenticated, service_role;

-- Métricas atrasadas (§7.1.6): EVIDENCIA_VALIDADA sin marca cuyo último corte requerido + plazo de carga ya pasó ⇒
-- marca metricas_atrasadas_at (aparece en la cola del admin) y avisa al medio con los cortes que faltan.
create function private.marcar_metricas_atrasadas(p_limite integer) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer := 0;
  v_plazo interval := make_interval(hours => private.config_entero('metricas.plazo_carga_horas'));
  x record;
begin
  for x in
    select a.id, a.oferta_id, a.medio_id,
           (select string_agg(k.corte::text, ', ' order by k.corte)
            from unnest(o.cortes_requeridos) k (corte)
            where exists (select 1 from public.publicaciones p
                          where p.asignacion_id = a.id
                            and not exists (select 1 from public.metricas m
                                            where m.publicacion_id = p.id and m.corte = k.corte
                                              and m.estado_validacion <> 'RECHAZADA'))) as faltan
    from public.asignaciones a
    join public.ofertas o on o.id = a.oferta_id
    where a.estado = 'EVIDENCIA_VALIDADA' and a.metricas_atrasadas_at is null
      and (select max(p.fecha_publicacion) from public.publicaciones p where p.asignacion_id = a.id)
          + (select max(case k.corte when 'H24' then interval '24 hours' when 'H72' then interval '72 hours'
                                     else interval '7 days' end)
             from unnest(o.cortes_requeridos) k (corte))
          + v_plazo < private.ahora()
    order by a.campana_id, a.oferta_id, a.id
    limit p_limite
  loop
    begin
      update public.asignaciones a set metricas_atrasadas_at = private.ahora()
      where a.id = x.id and a.metricas_atrasadas_at is null and a.estado = 'EVIDENCIA_VALIDADA';
      if found then
        perform private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.metricas_atrasadas',
          jsonb_build_object('oferta_id', x.oferta_id, 'corte', coalesce(x.faltan, '—')),
          'asignaciones', x.id::text, null, 2::smallint);
        v_n := v_n + 1;
      end if;
    exception when lock_not_available then
      raise log 'amo cron: asignación % ocupada (métricas atrasadas), se reintenta', x.id;
    end;
  end loop;
  return v_n;
end $$;
revoke all on function private.marcar_metricas_atrasadas(integer) from public, anon, authenticated, service_role;

-- Un lote (≤ p_limite) de una familia de transiciones automáticas; devuelve cuántas aplicó.
create function private.actualizar_lote(p_familia text, p_limite integer) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer := 0; v_ahora timestamptz := private.ahora(); v_hoy date := private.hoy(); x record;
begin
  case p_familia
    when 'ofertas_en_ejecucion' then
      for x in select o.id from public.ofertas o
               where o.deleted_at is null
                 and ((o.estado = 'PUBLICADA' and (o.ventana_inicio <= v_ahora or o.fecha_limite_aceptacion <= v_ahora)
                       and exists (select 1 from public.asignaciones a
                                   where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa)))
                      or (o.estado = 'CUPOS_COMPLETOS' and o.ventana_inicio <= v_ahora))
               order by o.campana_id, o.id limit p_limite loop
        if private.cron_aplicar('ofertas', x.id, 'EN_EJECUCION', null) then v_n := v_n + 1; end if;
      end loop;
    when 'ofertas_vencidas' then
      for x in select o.id from public.ofertas o
               where o.deleted_at is null and o.estado = 'PUBLICADA' and o.fecha_limite_aceptacion <= v_ahora
                 and not exists (select 1 from public.asignaciones a
                                 where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa))
               order by o.campana_id, o.id limit p_limite loop
        if private.cron_aplicar('ofertas', x.id, 'VENCIDA', null) then v_n := v_n + 1; end if;
      end loop;
    when 'ofertas_cerradas' then
      for x in select o.id from public.ofertas o
               where o.estado in ('EN_EJECUCION', 'VENCIDA') and o.ventana_fin < v_ahora
                 and (o.estado = 'VENCIDA'
                      or not exists (select 1 from public.asignaciones a
                                     where a.oferta_id = o.id
                                       and a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA', 'RECHAZADA',
                                                            'VENCIDA_SIN_PUBLICAR', 'CANCELADA')))
               order by o.campana_id, o.id limit p_limite loop
        if private.cron_aplicar('ofertas', x.id, 'CERRADA', null) then v_n := v_n + 1; end if;
      end loop;
    when 'campanas_finalizadas' then
      for x in select c.id from public.campanas c
               where c.estado = 'ACTIVA' and c.fecha_fin < v_hoy
                 and not exists (select 1 from public.ofertas o
                                 where o.campana_id = c.id and o.deleted_at is null and o.estado not in ('CERRADA', 'CANCELADA'))
               order by c.id limit p_limite loop
        if private.cron_aplicar('campanas', x.id, 'FINALIZADA', null) then v_n := v_n + 1; end if;
      end loop;
    when 'facturas_vencidas' then
      for x in select f.id from public.facturas f
               where f.estado in ('EMITIDA', 'PAGADA_PARCIAL') and f.fecha_vencimiento < v_hoy and f.saldo > 0
               order by f.id limit p_limite loop
        if private.cron_aplicar('facturas', x.id, 'VENCIDA', null) then v_n := v_n + 1; end if;
      end loop;
    when 'documentos_vencidos' then
      for x in select 'documentos_medio' as entidad, d.id from public.documentos_medio d
               where d.estado_validacion = 'APROBADO' and d.fecha_vencimiento < v_hoy
               union all
               select 'documentos_anunciante', d.id from public.documentos_anunciante d
               where d.estado_validacion = 'APROBADO' and d.fecha_vencimiento < v_hoy
               limit p_limite loop
        if private.cron_aplicar(x.entidad, x.id, 'VENCIDO', null) then v_n := v_n + 1; end if;
      end loop;
    when 'metricas_atrasadas' then
      v_n := private.marcar_metricas_atrasadas(p_limite);
  end case;
  return v_n;
end $$;
revoke all on function private.actualizar_lote(text, integer) from public, anon, authenticated, service_role;

-- 2. Procedures por lotes (invoker, sin SET; nombres calificados y search_path vacío en cada lote)
create procedure private.vencer_asignaciones(p_max_lotes integer default 20, p_confirmar boolean default true)
language plpgsql as $$
declare v_lote integer := 0; v_n integer; x record;
begin
  loop
    perform set_config('search_path', '', true);
    perform set_config('lock_timeout', '300ms', true);
    perform set_config('statement_timeout', '60s', true);
    v_lote := v_lote + 1;
    v_n := 0;
    for x in select a.id from public.asignaciones a
             where a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO') and a.fecha_limite_publicacion < private.ahora()
             order by a.campana_id, a.oferta_id, a.id
             limit 50 loop
      if private.cron_aplicar('asignaciones', x.id, 'VENCIDA_SIN_PUBLICAR',
                              'Venció la ventana de publicación sin evidencia') then
        v_n := v_n + 1;
      end if;
    end loop;
    if p_confirmar then commit; end if;
    exit when v_n = 0 or v_lote >= coalesce(p_max_lotes, 20);
  end loop;
end $$;
revoke all on procedure private.vencer_asignaciones(integer, boolean) from public, anon, authenticated, service_role;

create procedure private.actualizar_estados(p_max_lotes integer default 20, p_confirmar boolean default true)
language plpgsql as $$
declare v_familia text; v_lote integer; v_n integer;
begin
  foreach v_familia in array array['ofertas_en_ejecucion', 'ofertas_vencidas', 'ofertas_cerradas', 'campanas_finalizadas',
                                   'facturas_vencidas', 'documentos_vencidos', 'metricas_atrasadas'] loop
    v_lote := 0;
    loop
      perform set_config('search_path', '', true);
      perform set_config('lock_timeout', '300ms', true);
      perform set_config('statement_timeout', '60s', true);
      v_lote := v_lote + 1;
      v_n := private.actualizar_lote(v_familia, 50);
      if p_confirmar then commit; end if;
      exit when v_n = 0 or v_lote >= coalesce(p_max_lotes, 20);
    end loop;
  end loop;
end $$;
revoke all on procedure private.actualizar_estados(integer, boolean) from public, anon, authenticated, service_role;

-- 3. Funciones programadas (definer, sin EXECUTE para la API)

-- Recordatorios (§5.8, SHOULD): publicación que vence en 24 h (uno por asignación cada 24 h) y corte de métricas ya
-- alcanzado sin fila (uno por asignación y corte, desde PUBLICADA).
create function private.generar_recordatorios() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer := 0;
  v_ahora timestamptz := private.ahora();
  v_plazo interval := make_interval(hours => private.config_entero('metricas.plazo_carga_horas'));
  x record;
begin
  for x in select a.id, a.oferta_id, a.medio_id, a.fecha_limite_publicacion
           from public.asignaciones a
           where a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO')
             and a.fecha_limite_publicacion > v_ahora and a.fecha_limite_publicacion <= v_ahora + interval '24 hours'
             and not exists (select 1 from public.notificaciones n
                             where n.tipo = 'asignacion.recordatorio_publicacion' and n.entidad_id = a.id::text
                               and n.created_at > v_ahora - interval '24 hours') loop
    v_n := v_n + private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.recordatorio_publicacion',
      jsonb_build_object('oferta_id', x.oferta_id, 'fecha_fin', private.formato_fecha(x.fecha_limite_publicacion)),
      'asignaciones', x.id::text, null, 1::smallint);
  end loop;

  for x in select y.id, y.oferta_id, y.medio_id, y.corte, y.vence
           from (select a.id, a.oferta_id, a.medio_id, k.corte,
                        min(p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours'
                                                               when 'H72' then interval '72 hours'
                                                               else interval '7 days' end) as vence
                 from public.asignaciones a
                 join public.ofertas o on o.id = a.oferta_id
                 join public.publicaciones p on p.asignacion_id = a.id and p.estado_validacion <> 'RECHAZADA'
                 cross join unnest(o.cortes_requeridos) k (corte)
                 where a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA')
                   and p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours'
                                                          when 'H72' then interval '72 hours'
                                                          else interval '7 days' end <= v_ahora
                   and not exists (select 1 from public.metricas m
                                   where m.publicacion_id = p.id and m.corte = k.corte and m.estado_validacion <> 'RECHAZADA')
                 group by a.id, a.oferta_id, a.medio_id, k.corte) y
           where not exists (select 1 from public.notificaciones n
                             where n.tipo = 'asignacion.recordatorio_metricas' and n.entidad_id = y.id::text
                               and n.mensaje like '%corte ' || y.corte::text || ' %') loop
    v_n := v_n + private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.recordatorio_metricas',
      jsonb_build_object('oferta_id', x.oferta_id, 'corte', x.corte::text, 'fecha_limite', private.formato_fecha(x.vence + v_plazo)),
      'asignaciones', x.id::text, null, 1::smallint);
  end loop;
  return v_n;
end $$;
revoke all on function private.generar_recordatorios() from public, anon, authenticated, service_role;

-- Reverificación de cuentas (§7.1.1, D27): aviso previo (vence en ≤ 7 días) y vencimiento, una vez por umbral y
-- ciclo de verificación. No cambia datos: la vigencia es derivada (private.cuenta_vigente).
create function private.revisar_reverificacion() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer := 0;
  v_ahora timestamptz := private.ahora();
  v_dias interval := make_interval(days => private.config_entero('medios.reverificacion_dias'));
  v_gracia interval := make_interval(days => private.config_entero('medios.reverificacion_gracia_dias'));
  x record;
begin
  for x in select c.id, c.medio_id, c.plataforma, c.handle::text as handle, c.fecha_ultima_verificacion + v_dias as vence
           from public.cuentas_sociales c
           join public.medios m on m.id = c.medio_id and m.deleted_at is null
           where c.verificada and c.deleted_at is null
             and c.fecha_ultima_verificacion + v_dias <= v_ahora + interval '7 days'
             and not exists (select 1 from public.notificaciones n
                             where n.tipo = 'cuenta.reverificacion_pendiente' and n.entidad_id = c.id::text
                               and n.created_at > case when c.fecha_ultima_verificacion + v_dias <= v_ahora
                                                       then c.fecha_ultima_verificacion + v_dias
                                                       else c.fecha_ultima_verificacion + v_dias - interval '7 days' end) loop
    v_n := v_n + private.notificar(private.usuarios_medio(x.medio_id), 'cuenta.reverificacion_pendiente',
      jsonb_build_object('plataforma', private.nombre_plataforma(x.plataforma), 'handle', x.handle,
                         'fecha_limite', private.formato_fecha(x.vence + v_gracia)),
      'cuentas_sociales', x.id::text, null, case when x.vence <= v_ahora then 2 else 1 end::smallint);
  end loop;
  return v_n;
end $$;
revoke all on function private.revisar_reverificacion() from public, anon, authenticated, service_role;

-- Multiplicador de calidad (§10.6 bis): alcance mediano de las últimas N métricas APROBADAS del corte de referencia
-- por cuenta, índice = alcance mediano / seguidores, multiplicador = índice / mediana de la franja × plataforma
-- (cuentas con n ≥ mínimo), acotado a [piso, techo]. El cambio se anuncia con calidad.dias_aviso_cambio días de
-- antelación (multiplicador_proximo, desde las 00:00 de Bogotá) y se notifica al medio con el porqué.
create function private.recalcular_multiplicadores() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_corte public.corte_metrica := private.config_texto('calidad.corte_referencia')::public.corte_metrica;
  v_ventana integer := private.config_entero('calidad.ventana_publicaciones');
  v_min integer := private.config_entero('calidad.minimo_publicaciones');
  v_piso numeric := private.config_decimal('calidad.multiplicador_piso');
  v_techo numeric := private.config_decimal('calidad.multiplicador_techo');
  v_desde timestamptz := private.inicio_dia(private.hoy() + private.config_entero('calidad.dias_aviso_cambio'));
  v_n integer := 0;
  x record;
begin
  for x in
    with base as (
      select c.id, c.medio_id, c.handle::text as handle, c.franja_id, c.plataforma, c.seguidores_verificados,
             c.multiplicador_calidad, c.multiplicador_proximo
      from public.cuentas_sociales c
      where c.verificada and c.deleted_at is null
    ), ultimas as (
      select b.id, m.alcance_norm,
             row_number() over (partition by b.id order by m.fecha_corte desc, m.id) as rn
      from base b
      join public.asignaciones a on a.cuenta_social_id = b.id and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
      join public.metricas m on m.asignacion_id = a.id and m.corte = v_corte and m.estado_validacion = 'APROBADA'
      where m.alcance_norm is not null
    ), mediana as (
      select u.id, percentile_cont(0.5) within group (order by u.alcance_norm) as am, count(*)::integer as n
      from ultimas u where u.rn <= v_ventana group by u.id
    ), indices as (
      select b.*, md.am, coalesce(md.n, 0) as n, md.am / nullif(b.seguidores_verificados, 0) as indice
      from base b left join mediana md on md.id = b.id
    ), franja as (
      select i.franja_id, i.plataforma, percentile_cont(0.5) within group (order by i.indice) as im
      from indices i where i.n >= v_min and i.indice is not null
      group by i.franja_id, i.plataforma
    )
    select i.*, f.im,
           case when i.n < v_min or f.im is null or f.im = 0 or i.indice is null then 1.000
                else round(least(greatest(i.indice / f.im, v_piso), v_techo)::numeric, 3) end as mult
    from indices i
    left join franja f on f.franja_id is not distinct from i.franja_id and f.plataforma = i.plataforma
  loop
    update public.cuentas_sociales c
       set alcance_mediano = round(x.am)::integer,
           indice_calidad = round(least(x.indice, 99.999999)::numeric, 6),
           publicaciones_verificadas_count = x.n,
           multiplicador_calculado_at = private.ahora(),
           multiplicador_proximo = case when x.mult = x.multiplicador_calidad then null
                                        when x.multiplicador_proximo = x.mult then c.multiplicador_proximo
                                        else x.mult end,
           multiplicador_proximo_desde = case when x.mult = x.multiplicador_calidad then null
                                              when x.multiplicador_proximo = x.mult then c.multiplicador_proximo_desde
                                              else v_desde end
     where c.id = x.id;
    if x.mult <> x.multiplicador_calidad and x.multiplicador_proximo is distinct from x.mult then
      perform private.notificar(private.usuarios_medio(x.medio_id), 'multiplicador.cambio_programado',
        jsonb_build_object('handle', x.handle, 'actual', to_char(x.multiplicador_calidad, 'FM0.000'),
                           'proximo', to_char(x.mult, 'FM0.000'), 'fecha', to_char(v_desde at time zone 'America/Bogota', 'DD/MM/YYYY'),
                           'indice', round(x.indice::numeric, 4), 'indice_franja', round(x.im::numeric, 4), 'n', x.n),
        'cuentas_sociales', x.id::text, null, 1::smallint);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function private.recalcular_multiplicadores() from public, anon, authenticated, service_role;

create function private.aplicar_multiplicadores_programados() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  update public.cuentas_sociales c
     set multiplicador_calidad = c.multiplicador_proximo, multiplicador_proximo = null, multiplicador_proximo_desde = null
   where c.multiplicador_proximo_desde <= private.ahora() and c.multiplicador_proximo is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.aplicar_multiplicadores_programados() from public, anon, authenticated, service_role;

-- Reputación del medio (§7.1.8): tasa de cumplimiento (docs/kpis.md §1.10) en ventana móvil de 180 días con mínimo
-- medios.n_minimo_cumplimiento (con menos, null) y publicaciones verificadas. Solo escribe lo que cambió.
create function private.recalcular_indicadores_medios() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer; v_min integer := private.config_entero('medios.n_minimo_cumplimiento'); v_ahora timestamptz := private.ahora();
begin
  with base as (
    select a.medio_id,
           count(*) as n,
           count(*) filter (where private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at,
                                                          a.evidencia_validada_at, a.fecha_limite_publicacion)) as ok
    from public.asignaciones a
    where a.fecha_limite_publicacion >= v_ahora - interval '180 days' and a.fecha_limite_publicacion < v_ahora
      and a.aceptada_at is not null
      and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                      a.fecha_limite_publicacion)
    group by a.medio_id
  ), pubs as (
    select p.medio_id, count(*) as n from public.publicaciones p where p.estado_validacion = 'APROBADA' group by p.medio_id
  ), calc as (
    select m.id, coalesce(b.n, 0)::integer as n,
           case when coalesce(b.n, 0) >= v_min then round(b.ok::numeric / b.n, 4) end as tasa,
           coalesce(pu.n, 0)::integer as publicaciones
    from public.medios m
    left join base b on b.medio_id = m.id
    left join pubs pu on pu.medio_id = m.id
    where m.deleted_at is null
  )
  update public.medios m
     set tasa_cumplimiento = c.tasa, n_cumplimiento = c.n, publicaciones_verificadas = c.publicaciones
    from calc c
   where c.id = m.id
     and (m.tasa_cumplimiento is distinct from c.tasa or m.n_cumplimiento is distinct from c.n
          or m.publicaciones_verificadas is distinct from c.publicaciones);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.recalcular_indicadores_medios() from public, anon, authenticated, service_role;

-- Retención (§5.8): activa amo.purga solo dentro de la función (el cron corre como postgres) y la restaura.
create function private.purgar_retencion() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_prev text := current_setting('amo.purga', true);
  v_ahora timestamptz := private.ahora();
  v_bitacora_limite timestamptz := private.ahora() - make_interval(days => private.config_entero('retencion.bitacora_dias'));
  v_accesos integer; v_bitacora integer := 0; v_lote integer; v_intentos integer; v_notif integer; v_sesiones integer;
  v_cron integer; v_conteos jsonb;
begin
  perform set_config('amo.purga', 'on', true);
  delete from public.accesos a
   where a.created_at < v_ahora - make_interval(days => private.config_entero('retencion.accesos_dias'));
  get diagnostics v_accesos = row_count;
  loop
    delete from public.bitacora b
     where b.id in (select x.id from public.bitacora x where x.created_at < v_bitacora_limite order by x.id limit 10000);
    get diagnostics v_lote = row_count;
    v_bitacora := v_bitacora + v_lote;
    exit when v_lote < 10000;
  end loop;
  delete from private.intentos_login i
   where i.created_at < v_ahora - make_interval(days => private.config_entero('retencion.intentos_login_dias'));
  get diagnostics v_intentos = row_count;
  delete from public.notificaciones n
   where n.leida and n.created_at < v_ahora - make_interval(days => private.config_entero('retencion.notificaciones_dias'));
  get diagnostics v_notif = row_count;
  delete from private.sesiones_actividad s where not exists (select 1 from auth.sessions x where x.id = s.session_id);
  get diagnostics v_sesiones = row_count;
  delete from cron.job_run_details d where d.end_time < now() - interval '7 days';
  get diagnostics v_cron = row_count;
  perform set_config('amo.purga', coalesce(v_prev, ''), true);
  v_conteos := jsonb_build_object('accesos', v_accesos, 'bitacora', v_bitacora, 'intentos_login', v_intentos,
                                  'notificaciones', v_notif, 'sesiones_actividad', v_sesiones, 'cron_job_run_details', v_cron);
  perform private.registrar_en_bitacora('OTRO', 'retencion', null, null, v_conteos, 'Purga de retención programada',
                                        null, null, false);
  return v_conteos;
end $$;
revoke all on function private.purgar_retencion() from public, anon, authenticated, service_role;

-- Purga demo (§5.8, §10.5): solo el owner con amo.purga y amo.modo_carga. Hijos antes que padres. Conserva las
-- organizaciones demo que todavía referencia un perfil no demo (FK perfiles → anunciantes/medios).
create function private.purgar_demo() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb := '{}'; v_n integer; v_asig uuid[]; v_ofe uuid[]; v_medios uuid[]; v_anunciantes uuid[];
begin
  if not (private.purga_habilitada() and private.modo_carga()) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La purga demo exige amo.purga y amo.modo_carga (solo el owner).';
  end if;
  v_asig := array(select a.id from public.asignaciones a where a.es_demo);
  v_ofe := array(select o.id from public.ofertas o join public.campanas c on c.id = o.campana_id where c.es_demo);

  delete from public.disputa_mensajes dm using public.disputas d
   where dm.disputa_id = d.id and d.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('disputa_mensajes', v_n);
  delete from public.disputas d where d.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('disputas', v_n);
  delete from public.metricas m where m.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('metricas', v_n);
  delete from public.publicaciones p where p.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('publicaciones', v_n);
  delete from public.descargas_contenido d where d.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('descargas_contenido', v_n);
  delete from public.pagos_anunciante p where p.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('pagos_anunciante', v_n);
  delete from public.documentos_soporte ds using public.liquidaciones l where ds.liquidacion_id = l.id and l.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('documentos_soporte', v_n);
  delete from public.asignacion_montos am where am.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('asignacion_montos', v_n);
  delete from public.asignaciones a where a.id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('asignaciones', v_n);
  delete from public.liquidaciones l where l.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('liquidaciones', v_n);
  delete from public.dispersiones d where d.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('dispersiones', v_n);
  delete from public.facturas f where f.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('facturas', v_n);
  delete from public.oferta_vistas v where v.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('oferta_vistas', v_n);
  delete from public.creativo_archivos ca using public.creativos c
   where ca.creativo_id = c.id and c.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('creativo_archivos', v_n);
  delete from public.creativos c where c.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('creativos', v_n);
  delete from public.oferta_cupos oc where oc.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('oferta_cupos', v_n);
  delete from public.ofertas o where o.id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('ofertas', v_n);
  delete from public.comisiones_excepcion ce
   where ce.anunciante_id in (select an.id from public.anunciantes an where an.es_demo)
      or ce.campana_id in (select c.id from public.campanas c where c.es_demo);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('comisiones_excepcion', v_n);
  delete from public.campanas c where c.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('campanas', v_n);

  update public.perfiles p set medio_id = null, anunciante_id = null
   where p.es_demo and (p.medio_id is not null or p.anunciante_id is not null);
  v_medios := array(select m.id from public.medios m
                    where m.es_demo and not exists (select 1 from public.perfiles p where p.medio_id = m.id));
  v_anunciantes := array(select an.id from public.anunciantes an
                         where an.es_demo and not exists (select 1 from public.perfiles p where p.anunciante_id = an.id));

  delete from public.verificaciones_cuenta v where v.medio_id = any (v_medios);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('verificaciones_cuenta', v_n);
  delete from public.cuentas_sociales c where c.medio_id = any (v_medios);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('cuentas_sociales', v_n);
  delete from public.medio_categorias x where x.medio_id = any (v_medios);
  delete from public.medio_audiencia_paises x where x.medio_id = any (v_medios);
  delete from public.medio_pertinencia_geografica x where x.medio_id = any (v_medios);
  delete from public.documentos_medio x where x.medio_id = any (v_medios);
  delete from public.medios_privado x where x.medio_id = any (v_medios);
  delete from public.documentos_anunciante x where x.anunciante_id = any (v_anunciantes);
  delete from public.anunciantes_privado x where x.anunciante_id = any (v_anunciantes);
  delete from public.medios m where m.id = any (v_medios);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('medios', v_n);
  delete from public.anunciantes an where an.id = any (v_anunciantes);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('anunciantes', v_n);
  r := r || jsonb_build_object('organizaciones_conservadas',
    (select count(*) from public.medios m where m.es_demo) + (select count(*) from public.anunciantes an where an.es_demo));

  delete from public.aceptaciones_terminos a where a.perfil_id in (select p.id from public.perfiles p where p.es_demo);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('aceptaciones_terminos', v_n);
  delete from public.perfiles_privado pp where pp.perfil_id in (select p.id from public.perfiles p where p.es_demo);
  delete from public.notificaciones n where n.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('notificaciones', v_n);
  delete from public.accesos a where a.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('accesos', v_n);
  delete from public.bitacora b where b.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('bitacora', v_n);
  return r;
end $$;
revoke all on function private.purgar_demo() from public, anon, authenticated, service_role;

-- 4. Agenda (idempotente: se desprograma el job con el mismo nombre antes de programarlo)
select cron.unschedule(j.jobid) from cron.job j
 where j.jobname in ('amo_vencer_asignaciones', 'amo_actualizar_estados', 'amo_recordatorios', 'amo_indicadores_medios',
                     'amo_recalcular_multiplicadores', 'amo_retencion');
select cron.schedule('amo_vencer_asignaciones', '*/15 * * * *', $c$call private.vencer_asignaciones()$c$);
select cron.schedule('amo_actualizar_estados', '5-59/15 * * * *', $c$call private.actualizar_estados()$c$);
select cron.schedule('amo_recordatorios', '20 * * * *', $c$select private.generar_recordatorios()$c$);
select cron.schedule('amo_indicadores_medios', '0 8 * * *',
  $c$select private.recalcular_indicadores_medios(), private.aplicar_multiplicadores_programados(), private.revisar_reverificacion()$c$);
select cron.schedule('amo_recalcular_multiplicadores', '30 8 * * 1', $c$select private.recalcular_multiplicadores()$c$);
select cron.schedule('amo_retencion', '0 9 * * *', $c$select private.purgar_retencion()$c$);

-- 5. Verificación
do $$ begin
  assert (select count(*) from cron.job
          where jobname like 'amo\_%' and username = 'postgres' and active) = 6, 'faltan jobs de pg_cron';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private'
                       and p.proname in ('vencer_asignaciones', 'actualizar_estados', 'generar_recordatorios',
                                         'revisar_reverificacion', 'recalcular_multiplicadores',
                                         'aplicar_multiplicadores_programados', 'recalcular_indicadores_medios',
                                         'purgar_retencion', 'purgar_demo', 'cron_aplicar', 'actualizar_lote',
                                         'condicion_sistema', 'marcar_metricas_atrasadas')
                       and (has_function_privilege('authenticated', p.oid, 'execute')
                            or has_function_privilege('service_role', p.oid, 'execute')
                            or has_function_privilege('anon', p.oid, 'execute'))),
         'los procesos programados no deben ser ejecutables por roles de la API';
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.prokind = 'p' and not p.prosecdef and p.proconfig is null
            and p.proname in ('vencer_asignaciones', 'actualizar_estados')) = 2,
         'los procesos por lotes deben ser procedures invoker sin cláusula SET';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
end $$;
