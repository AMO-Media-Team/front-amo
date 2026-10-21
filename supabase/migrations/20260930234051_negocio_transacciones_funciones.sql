-- Migración 7b · negocio_transacciones_funciones (docs/modelo-datos.md §3.6, §4, §5.1, §5.2, §5.7)
-- Helpers de visibilidad y de reglas, núcleo de transiciones (verificar_propiedad, aplicar_transicion,
-- fn_validar_transicion, estado inicial), precio y cupos (calcular_precio, reservar_cupo, liberar_cupo_efecto,
-- reconsumir_cupo, evaluar_metricas_cargadas), funciones de trigger de las tablas de 7a y sus triggers, más los
-- triggers a_validar_transicion / a_estado_inicial de las tablas de M6. El de perfiles llega en 7c, junto con la
-- redefinición de transicionar_srv y activar_perfil_srv (hasta entonces escriben el estado directamente).
-- Reglas: helpers de política definer con EXECUTE a authenticated/service_role (y en la lista blanca); procedimientos
-- privilegiados sin EXECUTE para roles API; triggers invoker solo llaman funciones con EXECUTE para esos roles.
-- «Procedimiento de la BD» = current_user = 'postgres' dentro de un trigger INVOKER: solo es cierto para el owner o
-- dentro de una función definer (los *_srv y sus efectos); service_role y authenticated nunca lo cumplen.

-- 1. Utilidades puras

-- ¿Cambió alguna de estas columnas? (triggers invoker de guarda).
create function private.hay_cambios(p_old jsonb, p_new jsonb, p_cols text[]) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select exists (select 1 from unnest(p_cols) k where p_old -> k is distinct from p_new -> k) $$;
revoke all on function private.hay_cambios(jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function private.hay_cambios(jsonb, jsonb, text[]) to authenticated, service_role;

-- Estados que consumen cupo (§3.6) y predicado único (con la excepción de la disputa de una vencida).
create function private.estados_con_cupo() returns public.asignacion_estado[]
language sql immutable parallel safe set search_path = '' as $$
  select array['ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS', 'VERIFICADA',
               'LIQUIDADA', 'PAGADA', 'EN_DISPUTA']::public.asignacion_estado[] $$;
revoke all on function private.estados_con_cupo() from public, anon, authenticated;
grant execute on function private.estados_con_cupo() to authenticated, service_role;

create function private.consume_cupo(p_estado public.asignacion_estado, p_previo public.asignacion_estado) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select p_estado = any (private.estados_con_cupo())
         and not (p_estado = 'EN_DISPUTA' and p_previo is not distinct from 'VENCIDA_SIN_PUBLICAR') $$;
revoke all on function private.consume_cupo(public.asignacion_estado, public.asignacion_estado) from public, anon, authenticated;
grant execute on function private.consume_cupo(public.asignacion_estado, public.asignacion_estado) to authenticated, service_role;

-- Columna de estado de cada entidad con máquina de estados (§4.1); null = entidad desconocida.
create function private.columna_estado(p_entidad text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_entidad = 'anunciantes' then 'estado_verificacion'
    when p_entidad in ('documentos_medio', 'documentos_anunciante', 'verificaciones_cuenta', 'publicaciones', 'metricas')
      then 'estado_validacion'
    when p_entidad in ('perfiles', 'medios', 'campanas', 'ofertas', 'asignaciones', 'liquidaciones', 'documentos_soporte',
                       'facturas', 'disputas') then 'estado'
  end $$;
revoke all on function private.columna_estado(text) from public, anon, authenticated;

-- Usuarios activos de una organización (destinatarios de notificaciones).
create function private.usuarios_medio(p_medio_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id order by p.id), '{}') from public.perfiles p
  where p.medio_id = p_medio_id and p.estado = 'ACTIVO' and p.deleted_at is null $$;
revoke all on function private.usuarios_medio(uuid) from public, anon, authenticated;

-- PROVISIONAL hasta M8 (notificaciones): no hace nada. M8 la redefine con `create or replace` y la misma firma.
create function private.notificar(p_usuarios uuid[], p_tipo text, p_datos jsonb, p_entidad text, p_entidad_id text,
                                  p_url text, p_prioridad smallint default 0)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  return 0;
end $$;
revoke all on function private.notificar(uuid[], text, jsonb, text, text, text, smallint) from public, anon, authenticated;

-- 2. Helpers de visibilidad y de reglas (§5.1)

-- Elegibilidad §10.1 del medio para la oferta (cuenta vigente, umbral, geo, categorías, exclusiones). Sin EXECUTE para
-- authenticated: con un medio arbitrario revelaría exclusiones y segmentación ajenas; solo la usan funciones definer.
create function private.medio_elegible(p_oferta_id uuid, p_medio_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.ofertas o
    join public.medios m on m.id = p_medio_id
    join public.municipios mu on mu.codigo = m.municipio_codigo
    join public.departamentos d on d.codigo = m.departamento_codigo
    where o.id = p_oferta_id
      and m.estado = 'VERIFICADO' and m.nivel_verificacion >= 1 and m.deleted_at is null
      and mu.activo and d.activo
      and ((cardinality(o.municipios_objetivo) = 0 and cardinality(o.departamentos_objetivo) = 0)
           or m.municipio_codigo = any (o.municipios_objetivo)
           or m.departamento_codigo = any (o.departamentos_objetivo))
      and (cardinality(o.categorias_objetivo) = 0
           or exists (select 1 from public.medio_categorias mc
                      where mc.medio_id = m.id and mc.categoria_id = any (o.categorias_objetivo)))
      and m.id <> all (o.medios_excluidos)
      and exists (select 1 from public.cuentas_sociales c
                  where c.medio_id = m.id and c.plataforma = o.plataforma and c.deleted_at is null
                    and private.cuenta_vigente(c.id)
                    and c.seguidores_verificados >= greatest(private.config_entero('medios.umbral_seguidores'),
                                                             coalesce(o.seguidores_minimos, 0)))) $$;
revoke all on function private.medio_elegible(uuid, uuid) from public, anon, authenticated;

-- Visibilidad derivada del marketplace (§4.3.2) para un medio: estado, fecha límite, ventana, campaña activa,
-- elegibilidad y cupo libre en la franja de al menos una cuenta elegible del medio.
create function private.oferta_visible_para(p_oferta_id uuid, p_medio_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_medio_id is not null and exists (
    select 1
    from public.ofertas o
    join public.campanas c on c.id = o.campana_id
    where o.id = p_oferta_id
      and o.estado in ('PUBLICADA', 'EN_EJECUCION') and o.deleted_at is null
      and private.ahora() < o.fecha_limite_aceptacion and private.ahora() < o.ventana_fin
      and c.estado = 'ACTIVA' and c.deleted_at is null
      and private.medio_elegible(o.id, p_medio_id)
      and exists (select 1 from public.cuentas_sociales cs
                  join public.oferta_cupos oc on oc.oferta_id = o.id and oc.franja_id = cs.franja_id
                  where cs.medio_id = p_medio_id and cs.plataforma = o.plataforma and cs.deleted_at is null
                    and private.cuenta_vigente(cs.id)
                    and cs.seguidores_verificados >= greatest(private.config_entero('medios.umbral_seguidores'),
                                                              coalesce(o.seguidores_minimos, 0))
                    and oc.cupos_ocupados < oc.cupos_totales)) $$;
revoke all on function private.oferta_visible_para(uuid, uuid) from public, anon, authenticated;

create function private.oferta_visible_para_mi(p_oferta_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.oferta_visible_para(p_oferta_id, (select private.mi_medio_id())) $$;
revoke all on function private.oferta_visible_para_mi(uuid) from public, anon, authenticated;
grant execute on function private.oferta_visible_para_mi(uuid) to authenticated, service_role;

create function private.tengo_asignacion_en(p_oferta_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaciones a
                 where a.oferta_id = p_oferta_id and a.medio_id = (select private.mi_medio_id())) $$;
revoke all on function private.tengo_asignacion_en(uuid) from public, anon, authenticated;
grant execute on function private.tengo_asignacion_en(uuid) to authenticated, service_role;

create function private.tengo_asignacion_activa_en(p_oferta_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaciones a
                 where a.oferta_id = p_oferta_id and a.medio_id = (select private.mi_medio_id())
                   and private.consume_cupo(a.estado, a.estado_previo_disputa)) $$;
revoke all on function private.tengo_asignacion_activa_en(uuid) from public, anon, authenticated;
grant execute on function private.tengo_asignacion_activa_en(uuid) to authenticated, service_role;

-- La primera descarga pasa obligatoriamente por registrar_descarga_srv (fija contenido_descargado_at).
create function private.puedo_descargar_creativos_de(p_oferta_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaciones a
                 where a.oferta_id = p_oferta_id and a.medio_id = (select private.mi_medio_id())
                   and private.consume_cupo(a.estado, a.estado_previo_disputa)
                   and a.contenido_descargado_at is not null) $$;
revoke all on function private.puedo_descargar_creativos_de(uuid) from public, anon, authenticated;
grant execute on function private.puedo_descargar_creativos_de(uuid) to authenticated, service_role;

-- Solo dentro de SRF definer (sin grants).
create function private.medio_ve_campana(p_campana_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ofertas o
                 where o.campana_id = p_campana_id
                   and (private.oferta_visible_para_mi(o.id) or private.tengo_asignacion_en(o.id))) $$;
revoke all on function private.medio_ve_campana(uuid) from public, anon, authenticated;

-- Redefinición de los helpers provisionales de M6 (misma firma).
create or replace function private.medio_ve_anunciante(p_anunciante_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.mi_medio_id()) is not null
     and exists (select 1 from public.ofertas o
                 where o.anunciante_id = p_anunciante_id
                   and (private.oferta_visible_para_mi(o.id) or private.tengo_asignacion_en(o.id))) $$;

create or replace function private.anunciante_ve_medio(p_medio_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaciones a
                 where a.medio_id = p_medio_id and a.anunciante_id = (select private.mi_anunciante_id())
                   and a.estado <> 'RECHAZADA') $$;

create function private.puedo_ver_asignacion(p_asignacion_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaciones a
                 where a.id = p_asignacion_id
                   and ((select private.tiene_permiso('asignaciones.ver'))
                        or a.medio_id = (select private.mi_medio_id())
                        or a.anunciante_id = (select private.mi_anunciante_id()))) $$;
revoke all on function private.puedo_ver_asignacion(uuid) from public, anon, authenticated;
grant execute on function private.puedo_ver_asignacion(uuid) to authenticated, service_role;

-- El medio carga cortes desde PUBLICADA (evidencia aún sin validar), §5 pasos 11–12.
create function private.puedo_cargar_metricas(p_publicacion_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.publicaciones p join public.asignaciones a on a.id = p.asignacion_id
                 where p.id = p_publicacion_id and a.medio_id = (select private.mi_medio_id())
                   and a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
                   and p.estado_validacion in ('PENDIENTE', 'APROBADA')) $$;
revoke all on function private.puedo_cargar_metricas(uuid) from public, anon, authenticated;
grant execute on function private.puedo_cargar_metricas(uuid) to authenticated, service_role;

-- 3. Núcleo de transiciones (§5.2)

-- Propiedad del objetivo para actores ANUNCIANTE / MEDIO (ADMIN: nada que verificar).
create function private.verificar_propiedad(p_entidad text, p_id uuid, p_actor uuid, p_tipo public.rol_tipo) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_mia uuid; v_duena uuid;
begin
  if p_tipo = 'ADMIN' then return; end if;
  select case when p_tipo = 'ANUNCIANTE' then p.anunciante_id else p.medio_id end into v_mia
  from public.perfiles p where p.id = p_actor;
  if p_tipo = 'ANUNCIANTE' then
    v_duena := case p_entidad
      when 'campanas' then (select x.anunciante_id from public.campanas x where x.id = p_id)
      when 'ofertas' then (select x.anunciante_id from public.ofertas x where x.id = p_id)
      when 'facturas' then (select x.anunciante_id from public.facturas x where x.id = p_id)
      when 'asignaciones' then (select x.anunciante_id from public.asignaciones x where x.id = p_id)
      when 'publicaciones' then (select x.anunciante_id from public.publicaciones x where x.id = p_id)
      when 'metricas' then (select x.anunciante_id from public.metricas x where x.id = p_id)
      when 'disputas' then (select a.anunciante_id from public.disputas d join public.asignaciones a on a.id = d.asignacion_id
                            where d.id = p_id)
      when 'anunciantes' then (select x.id from public.anunciantes x where x.id = p_id)
      when 'documentos_anunciante' then (select x.anunciante_id from public.documentos_anunciante x where x.id = p_id)
    end;
  elsif p_tipo = 'MEDIO' then
    v_duena := case p_entidad
      when 'asignaciones' then (select x.medio_id from public.asignaciones x where x.id = p_id)
      when 'publicaciones' then (select x.medio_id from public.publicaciones x where x.id = p_id)
      when 'metricas' then (select x.medio_id from public.metricas x where x.id = p_id)
      when 'disputas' then (select a.medio_id from public.disputas d join public.asignaciones a on a.id = d.asignacion_id
                            where d.id = p_id)
      when 'liquidaciones' then (select x.medio_id from public.liquidaciones x where x.id = p_id)
      when 'documentos_soporte' then (select l.medio_id from public.documentos_soporte x
                                      join public.liquidaciones l on l.id = x.liquidacion_id where x.id = p_id)
      when 'medios' then (select x.id from public.medios x where x.id = p_id)
      when 'documentos_medio' then (select x.medio_id from public.documentos_medio x where x.id = p_id)
      when 'cuentas_sociales' then (select x.medio_id from public.cuentas_sociales x where x.id = p_id)
      when 'verificaciones_cuenta' then (select x.medio_id from public.verificaciones_cuenta x where x.id = p_id)
    end;
  end if;
  if v_mia is null or v_duena is null or v_mia <> v_duena then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
end $$;
revoke all on function private.verificar_propiedad(text, uuid, uuid, public.rol_tipo) from public, anon, authenticated;

-- ÚNICA función que escribe una columna de estado (fuera de modo_carga). El llamador ya validó al actor humano, la
-- propiedad y la condición adicional, y ya tomó los bloqueos canónicos. Activa amo.transicion_autorizada solo
-- durante el UPDATE y restaura los GUC previos (un aplicar_transicion anidado no deja el interruptor abierto).
-- Parámetros del UPDATE dinámico: $1 hacia, $2 ahora, $3 motivo, $4 datos, $5 actor, $6 desde, $7 id.
create function private.aplicar_transicion(p_entidad text, p_id uuid, p_hacia text, p_actor_tipo public.transicion_actor,
                                           p_actor_id uuid, p_motivo text default null, p_datos jsonb default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_col text := private.columna_estado(p_entidad);
  v_tipo_col text;
  v_desde text;
  t private.transiciones_estado;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_datos jsonb := coalesce(p_datos, '{}');
  v_ahora timestamptz := private.ahora();
  v_sets text[];
  v_prev_aut text := current_setting('amo.transicion_autorizada', true);
  v_prev_tipo text := current_setting('amo.actor_tipo', true);
  v_prev_motivo text := current_setting('amo.motivo', true);
  v_prev_actor text := current_setting('amo.actor_id', true);
begin
  if v_col is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Esta entidad no tiene estados.', hint = coalesce(p_entidad, 'null');
  end if;
  execute format('select t.%I::text from public.%I t where t.id = $1 for update', v_col, p_entidad) into v_desde using p_id;
  if v_desde is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El registro no existe.',
      hint = p_entidad || ':' || coalesce(p_id::text, 'null');
  end if;
  select * into t from private.transiciones_estado x
  where x.entidad = p_entidad and x.desde = v_desde and x.hacia = p_hacia and x.actor = p_actor_tipo;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El registro no puede pasar a ese estado desde el actual.',
      hint = p_entidad || ':' || v_desde || '→' || coalesce(p_hacia, 'null') || ' (' || p_actor_tipo || ')';
  end if;
  if not private.modo_carga() then
    if t.permiso is not null and not coalesce(private.tiene_permiso_de(p_actor_id, t.permiso), false) then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
    end if;
    if t.requiere_motivo and v_motivo is null then
      raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica el motivo del cambio.';
    end if;
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_tipo_col
  from pg_attribute a where a.attrelid = format('public.%I', p_entidad)::regclass and a.attname = v_col;
  v_sets := array[format('%I = $1::%s', v_col, v_tipo_col)];
  if t.columna_at is not null then
    v_sets := v_sets || case t.modo_at
      when 'PRIMERA' then format('%1$I = coalesce(%1$I, $2)', t.columna_at)
      when 'SIEMPRE' then format('%I = $2', t.columna_at)
      else format('%I = null', t.columna_at) end;
  end if;

  -- Columnas propias de la entidad y datos permitidos de p_datos (lista blanca por entidad).
  case p_entidad
    when 'perfiles' then
      v_sets := v_sets || 'motivo_estado = $3'::text;
      if p_hacia = 'DESACTIVADO' then v_sets := v_sets || 'deleted_at = $2'::text; end if;
      if p_hacia = 'INVITADO' then v_sets := v_sets || array['deleted_at = null', 'debe_cambiar_password = true']; end if;
    when 'anunciantes' then
      v_sets := v_sets || 'motivo_estado = $3'::text;
      if v_desde = 'PENDIENTE' and p_hacia = 'VERIFICADO' then v_sets := v_sets || 'verificado_por = $5'::text; end if;
    when 'medios' then
      v_sets := v_sets || 'motivo_estado = $3'::text;
      if p_hacia in ('PENDIENTE', 'RECHAZADO') then
        v_sets := v_sets || 'nivel_verificacion = 0'::text;
      elsif v_datos ? 'nivel' then
        v_sets := v_sets || $s$nivel_verificacion = ($4 ->> 'nivel')::smallint$s$;
      end if;
      if p_hacia = 'VERIFICADO' and v_desde in ('PENDIENTE', 'VERIFICADO') then
        v_sets := v_sets || 'verificado_por = $5'::text;
      end if;
    when 'documentos_medio', 'documentos_anunciante' then
      if p_hacia in ('APROBADO', 'RECHAZADO') then
        v_sets := v_sets || array['validado_por = $5', $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$];
      end if;
    when 'verificaciones_cuenta' then
      v_sets := v_sets || array['validada_por = $5', $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$];
      if p_hacia = 'APROBADA' then
        v_sets := v_sets || $s$seguidores_verificados = coalesce(($4 ->> 'seguidores_verificados')::integer, seguidores_verificados, seguidores_reportados)$s$;
      end if;
    when 'ofertas' then
      if v_datos ? 'comentario_moderacion' or p_hacia = 'DEVUELTA' then
        v_sets := v_sets || $s$comentario_moderacion = coalesce($4 ->> 'comentario_moderacion', $3, comentario_moderacion)$s$;
      end if;
      if p_actor_tipo = 'ADMIN' and v_desde = 'EN_REVISION' then v_sets := v_sets || 'moderada_por = $5'::text; end if;
    when 'asignaciones' then
      if p_hacia = 'EN_DISPUTA' then
        v_sets := v_sets || 'estado_previo_disputa = $6::public.asignacion_estado'::text;
      elsif v_desde = 'EN_DISPUTA' then
        v_sets := v_sets || 'estado_previo_disputa = null'::text;
      end if;
      if v_motivo is not null then v_sets := v_sets || 'motivo = $3'::text; end if;
      if p_hacia = 'CANCELADA' then
        if nullif(v_datos ->> 'causa', '') is null and not private.modo_carga() then
          raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
            detail = 'Indica la causa de la cancelación.';
        end if;
        v_sets := v_sets || $s$causa_cancelacion = ($4 ->> 'causa')::public.cancelacion_causa$s$;
      end if;
    when 'publicaciones' then
      if p_hacia in ('APROBADA', 'RECHAZADA') then
        v_sets := v_sets || array['validada_por = $5', $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$];
      end if;
      if p_hacia = 'APROBADA' then
        v_sets := v_sets || $s$etiqueta_verificada = coalesce(($4 ->> 'etiqueta_verificada')::boolean, etiqueta_verificada)$s$;
      end if;
    when 'metricas' then
      if p_hacia in ('APROBADA', 'RECHAZADA') then v_sets := v_sets || 'validada_por = $5'::text; end if;
      v_sets := v_sets || $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$;
    when 'liquidaciones' then
      v_sets := v_sets || array[$s$fecha_pago = coalesce(($4 ->> 'fecha_pago')::date, fecha_pago)$s$,
                                $s$referencia_pago = coalesce($4 ->> 'referencia_pago', referencia_pago)$s$,
                                $s$soporte_pago_path = coalesce($4 ->> 'soporte_pago_path', soporte_pago_path)$s$];
      if p_hacia = 'APROBADA' then v_sets := v_sets || 'aprobada_por = $5'::text; end if;
    when 'documentos_soporte', 'facturas' then
      -- Numeración DIAN: solo al emitir y en el mismo UPDATE que el estado (el borrador nunca tiene número).
      if p_hacia in ('EMITIDO', 'EMITIDA') then
        v_sets := v_sets || array[$s$resolucion_id = ($4 ->> 'resolucion_id')::uuid$s$, $s$prefijo = $4 ->> 'prefijo'$s$,
                                  $s$consecutivo = ($4 ->> 'consecutivo')::bigint$s$,
                                  $s$fecha_emision = ($4 ->> 'fecha_emision')::date$s$];
        if p_entidad = 'facturas' then
          v_sets := v_sets || $s$fecha_vencimiento = coalesce(($4 ->> 'fecha_vencimiento')::date, fecha_vencimiento)$s$;
        end if;
      end if;
    when 'disputas' then
      if p_hacia in ('RESUELTA', 'DESCARTADA') then
        v_sets := v_sets || array['resuelta_por = $5', $s$resolucion = coalesce($4 ->> 'resolucion', $3, resolucion)$s$,
          $s$estado_asignacion_resultante = coalesce(($4 ->> 'estado_asignacion_resultante')::public.asignacion_estado, estado_asignacion_resultante)$s$];
      end if;
    else
      null;
  end case;

  perform set_config('amo.transicion_autorizada', 'on', true);
  perform set_config('amo.actor_tipo', p_actor_tipo::text, true);
  perform set_config('amo.motivo', coalesce(v_motivo, ''), true);
  if p_actor_id is not null then perform set_config('amo.actor_id', p_actor_id::text, true); end if;
  execute format('update public.%I set %s where id = $7', p_entidad, array_to_string(v_sets, ', '))
    using p_hacia, v_ahora, v_motivo, v_datos, p_actor_id, v_desde, p_id;
  perform set_config('amo.transicion_autorizada', coalesce(v_prev_aut, ''), true);
  perform set_config('amo.actor_tipo', coalesce(v_prev_tipo, ''), true);
  perform set_config('amo.motivo', coalesce(v_prev_motivo, ''), true);
  perform set_config('amo.actor_id', coalesce(v_prev_actor, ''), true);

  return jsonb_build_object('entidad', p_entidad, 'id', p_id, 'desde', v_desde, 'hacia', p_hacia, 'at', v_ahora);
end $$;
revoke all on function private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)
  from public, anon, authenticated;

-- Trigger de respaldo BEFORE UPDATE OF <col estado> (TG_ARGV[0] = entidad, TG_ARGV[1] = columna): nada cambia un
-- estado fuera de aplicar_transicion (salvo modo_carga) ni hacia un par (desde, hacia) inexistente.
create function private.fn_validar_transicion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_col text := coalesce(tg_argv[1], 'estado'); v_desde text; v_hacia text;
begin
  v_desde := to_jsonb(old) ->> v_col;
  v_hacia := to_jsonb(new) ->> v_col;
  if v_desde is not distinct from v_hacia
     and not (tg_argv[0] = 'medios' and (to_jsonb(old) ->> 'nivel_verificacion') is distinct from (to_jsonb(new) ->> 'nivel_verificacion')) then
    return new;                                   -- no hay cambio de estado (ni de nivel en medios)
  end if;
  if private.modo_carga() then return new; end if;
  if coalesce(current_setting('amo.transicion_autorizada', true), '') <> 'on' then
    raise exception using errcode = 'P0001', message = 'AMO_ESTADO_SOLO_VIA_TRANSICION',
      detail = 'El estado solo cambia mediante una transición autorizada.', hint = tg_argv[0];
  end if;
  if not exists (select 1 from private.transiciones_estado t
                 where t.entidad = tg_argv[0] and t.desde = v_desde and t.hacia = v_hacia) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El registro no puede pasar a ese estado desde el actual.', hint = tg_argv[0] || ':' || v_desde || '→' || v_hacia;
  end if;
  return new;
end $$;
revoke all on function private.fn_validar_transicion() from public, anon, authenticated;

-- Estado inicial (BEFORE INSERT, TG_ARGV[0] = entidad): una fila nace en un estado `NUEVO → x` de la máquina, o en
-- PENDIENTE si la entidad no tiene filas NUEVO (documentos, anunciantes, medios, publicaciones, métricas).
create function private.fn_validar_estado_inicial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_estado text := to_jsonb(new) ->> private.columna_estado(tg_argv[0]);
begin
  if private.modo_carga() then return new; end if;
  if exists (select 1 from private.transiciones_estado t where t.entidad = tg_argv[0] and t.desde = 'NUEVO') then
    if not exists (select 1 from private.transiciones_estado t
                   where t.entidad = tg_argv[0] and t.desde = 'NUEVO' and t.hacia = v_estado) then
      raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
        detail = 'El registro no puede crearse en ese estado.', hint = tg_argv[0] || ':NUEVO→' || coalesce(v_estado, 'null');
    end if;
  elsif v_estado is distinct from 'PENDIENTE' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El registro debe crearse pendiente de validación.', hint = tg_argv[0] || ':NUEVO→' || coalesce(v_estado, 'null');
  end if;
  return new;
end $$;
revoke all on function private.fn_validar_estado_inicial() from public, anon, authenticated;

-- 4. Precio y cupos (§5.7)

-- Precio congelable de una oferta para una cuenta (§7.2.3 bis, D15, D16, D25). Autoprotegida: fuera de un
-- procedimiento del servidor, un usuario sin ofertas.ver solo cotiza con una cuenta de su propio medio.
create function private.calcular_precio(p_oferta_id uuid, p_cuenta_social_id uuid, p_en timestamptz default private.ahora())
returns table (franja_id uuid, franja_clave text, seguidores integer, tarifa_id uuid, tarifa_base numeric,
               publicaciones smallint, multiplicador_calidad numeric, multiplicador_geografico numeric,
               multiplicador_exclusividad numeric, monto_bruto numeric, porcentaje_comision numeric,
               comision_origen public.comision_origen, comision_excepcion_id uuid, monto_comision numeric, monto_medio numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  o public.ofertas;
  c public.cuentas_sociales;
  v_franja uuid; v_franja_clave text; v_tarifa uuid; v_base numeric;
  v_mc numeric; v_mg numeric; v_me numeric; v_r integer; v_bruto numeric;
  v_pct numeric; v_origen public.comision_origen; v_exc uuid; v_com numeric;
begin
  select * into o from public.ofertas x where x.id = p_oferta_id and x.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE', detail = 'La oferta no está disponible.';
  end if;
  select * into c from public.cuentas_sociales x where x.id = p_cuenta_social_id and x.deleted_at is null;
  if not found or not private.cuenta_vigente(c.id) or c.plataforma <> o.plataforma then
    raise exception using errcode = 'P0001', message = 'AMO_NO_ELEGIBLE',
      detail = 'La cuenta no está verificada y vigente para la plataforma de la oferta.';
  end if;
  if auth.uid() is not null and not private.tiene_permiso('ofertas.ver')
     and c.medio_id is distinct from private.mi_medio_id() then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;

  select f.id, f.clave into v_franja, v_franja_clave from public.franjas f
  where f.activa and c.seguidores_verificados between f.seguidores_min and coalesce(f.seguidores_max, 2147483647)
  order by f.seguidores_min limit 1;
  if v_franja is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_ELEGIBLE',
      detail = 'Los seguidores verificados de la cuenta no alcanzan ninguna franja.';
  end if;
  select t.id, t.valor_base into v_tarifa, v_base from public.tarifas t
  where t.formato_id = o.formato_id and t.franja_id = v_franja
    and t.vigente_desde <= p_en and (t.vigente_hasta is null or t.vigente_hasta > p_en);
  if v_tarifa is null then
    raise exception using errcode = 'P0001', message = 'AMO_SIN_TARIFA',
      detail = 'No hay una tarifa vigente para este formato y franja.';
  end if;

  v_mc := case when c.publicaciones_verificadas_count < private.config_entero('calidad.minimo_publicaciones') then 1.000
               else least(greatest(c.multiplicador_calidad, private.config_decimal('calidad.multiplicador_piso')),
                          private.config_decimal('calidad.multiplicador_techo')) end;
  if cardinality(o.municipios_objetivo) = 0 and cardinality(o.departamentos_objetivo) = 0 then
    v_mg := 1.000;
  else
    select coalesce(max(pg.multiplicador), 1.000) into v_mg
    from public.medio_pertinencia_geografica pg join public.municipios m on m.codigo = pg.municipio_codigo
    where pg.medio_id = c.medio_id
      and (pg.municipio_codigo = any (o.municipios_objetivo) or m.departamento_codigo = any (o.departamentos_objetivo));
  end if;
  v_me := case when o.exclusividad_dias is null then 1.000 else private.config_decimal('precios.recargo_exclusividad') end;
  v_mc := round(v_mc, 3); v_mg := round(v_mg, 3); v_me := round(v_me, 3);
  v_r := private.config_entero('precios.redondeo');
  v_bruto := round(v_base * v_mc * v_mg * v_me * o.publicaciones_por_medio / v_r) * v_r;

  -- Comisión vigente en p_en: excepción por campaña → por anunciante → global.
  select e.porcentaje, e.id into v_pct, v_exc from public.comisiones_excepcion e
  where e.campana_id = o.campana_id and e.vigente_desde <= p_en and (e.vigente_hasta is null or e.vigente_hasta > p_en);
  if v_exc is not null then
    v_origen := 'EXCEPCION_CAMPANA';
  else
    select e.porcentaje, e.id into v_pct, v_exc from public.comisiones_excepcion e
    where e.anunciante_id = o.anunciante_id and e.vigente_desde <= p_en and (e.vigente_hasta is null or e.vigente_hasta > p_en);
    if v_exc is not null then
      v_origen := 'EXCEPCION_ANUNCIANTE';
    else
      v_pct := private.config_decimal('comision.porcentaje_global');
      v_origen := 'GLOBAL';
    end if;
  end if;
  v_com := round(v_bruto * v_pct);

  return query select v_franja, v_franja_clave, c.seguidores_verificados, v_tarifa, v_base, o.publicaciones_por_medio,
                      v_mc, v_mg, v_me, v_bruto, v_pct, v_origen, v_exc, v_com, v_bruto - v_com;
end $$;
revoke all on function private.calcular_precio(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.calcular_precio(uuid, uuid, timestamptz) to authenticated, service_role;

-- Resultado de una reserva (también para la respuesta idempotente).
create function private.resultado_reserva(p_asignacion_id uuid)
returns table (asignacion_id uuid, monto_bruto numeric, monto_medio numeric, franja_clave text, cupos_restantes_franja integer)
language sql stable security definer set search_path = '' as $$
  select a.id, a.monto_bruto, am.monto_medio, a.franja_clave, greatest(oc.cupos_totales - oc.cupos_ocupados, 0)::integer
  from public.asignaciones a
  join public.asignacion_montos am on am.asignacion_id = a.id
  left join public.oferta_cupos oc on oc.oferta_id = a.oferta_id and oc.franja_id = a.franja_id
  where a.id = p_asignacion_id $$;
revoke all on function private.resultado_reserva(uuid) from public, anon, authenticated;

-- Aceptar una oferta (§5.7): bloqueos en el orden global campañas → ofertas → oferta_cupos → medio (advisory) →
-- asignaciones; todos los chequeos con las filas bloqueadas; precio congelado; idempotente por clave.
create function private.reservar_cupo(p_oferta_id uuid, p_medio_id uuid, p_cuenta_social_id uuid, p_actor_id uuid,
                                      p_session_id uuid, p_clave_idempotencia uuid default null)
returns table (asignacion_id uuid, monto_bruto numeric, monto_medio numeric, franja_clave text, cupos_restantes_franja integer)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_tipo public.rol_tipo;
  v_campana uuid;
  v_existente uuid;
  v_medio_existente uuid;
  c public.campanas;
  o public.ofertas;
  oc public.oferta_cupos;
  cu public.cuentas_sociales;
  p record;
  n public.niveles_verificacion;
  v_slot integer := 1;
  v_medio_camp numeric;
  v_anual numeric;
  v_ini_anio timestamptz;
  v_sector uuid;
  v_id uuid;
  v_ahora timestamptz := private.ahora();
begin
  perform set_config('lock_timeout', '3s', true);
  -- 0. Actor: un usuario MEDIO de ese medio, con sesión válida y ofertas.aceptar.
  if not private.modo_carga() then
    v_tipo := private.validar_actor(p_actor_id, 'ofertas.aceptar', p_session_id);
    if v_tipo is distinct from 'MEDIO'
       or not exists (select 1 from public.perfiles x where x.id = p_actor_id and x.medio_id = p_medio_id) then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
    end if;
  end if;
  -- 0b. Idempotencia (vía rápida).
  if p_clave_idempotencia is not null then
    select x.id, x.medio_id into v_existente, v_medio_existente from public.asignaciones x
    where x.clave_idempotencia = p_clave_idempotencia;
    if v_existente is not null then
      if v_medio_existente <> p_medio_id then
        raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
      end if;
      return query select * from private.resultado_reserva(v_existente);
      return;
    end if;
  end if;

  -- 1. Bloqueos en orden.
  select x.campana_id into v_campana from public.ofertas x where x.id = p_oferta_id;
  if v_campana is null then
    raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE', detail = 'La oferta no está disponible.';
  end if;
  select * into c from public.campanas x where x.id = v_campana for update;
  select * into o from public.ofertas x where x.id = p_oferta_id for update;
  -- Idempotencia con los bloqueos tomados: un doble envío concurrente ve aquí la fila del primero.
  if p_clave_idempotencia is not null then
    select x.id, x.medio_id into v_existente, v_medio_existente from public.asignaciones x
    where x.clave_idempotencia = p_clave_idempotencia;
    if v_existente is not null then
      if v_medio_existente <> p_medio_id then
        raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
      end if;
      return query select * from private.resultado_reserva(v_existente);
      return;
    end if;
  end if;

  -- 2. Disponibilidad (con la fila bloqueada).
  if o.estado not in ('PUBLICADA', 'EN_EJECUCION') or o.deleted_at is not null
     or v_ahora >= o.fecha_limite_aceptacion or v_ahora >= o.ventana_fin
     or c.estado <> 'ACTIVA' or c.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE',
      detail = 'La oferta ya no recibe aceptaciones.';
  end if;
  -- 3. Elegibilidad (§10.1) de medio y cuenta.
  if not private.medio_elegible(p_oferta_id, p_medio_id) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_ELEGIBLE', detail = 'Tu medio no cumple los requisitos de la oferta.';
  end if;
  select * into cu from public.cuentas_sociales x where x.id = p_cuenta_social_id;
  if not found or cu.medio_id <> p_medio_id or cu.deleted_at is not null or not private.cuenta_vigente(cu.id)
     or cu.plataforma <> o.plataforma
     or cu.seguidores_verificados < greatest(private.config_entero('medios.umbral_seguidores'), coalesce(o.seguidores_minimos, 0)) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_ELEGIBLE',
      detail = 'La cuenta elegida no cumple los requisitos de la oferta.';
  end if;
  -- 4. Precio congelado.
  select * into p from private.calcular_precio(p_oferta_id, p_cuenta_social_id, v_ahora);
  -- 5. Cupo en la franja.
  select * into oc from public.oferta_cupos x where x.oferta_id = p_oferta_id and x.franja_id = p.franja_id for update;
  if not found or oc.cupos_ocupados >= oc.cupos_totales then
    raise exception using errcode = 'P0001', message = 'AMO_SIN_CUPO', detail = 'No quedan cupos para tu franja en esta oferta.';
  end if;
  -- 5b. Bloqueo del medio (topes anuales y exclusividad abarcan todas sus campañas).
  perform pg_advisory_xact_lock(hashtextextended('amo.medio:' || p_medio_id::text, 0));
  -- 6. Un medio, un cupo (§10.9): cualquier asignación en pie (también una disputa de una vencida) cuenta.
  if exists (select 1 from public.asignaciones a where a.oferta_id = p_oferta_id and a.medio_id = p_medio_id
               and a.estado not in ('RECHAZADA', 'CANCELADA', 'VENCIDA_SIN_PUBLICAR')) then
    if not o.permite_multiples_cupos then
      raise exception using errcode = 'P0001', message = 'AMO_YA_ACEPTADA', detail = 'Ya aceptaste esta oferta.';
    end if;
    select max(a.slot) + 1 into v_slot from public.asignaciones a
    where a.oferta_id = p_oferta_id and a.medio_id = p_medio_id
      and a.estado not in ('RECHAZADA', 'CANCELADA', 'VENCIDA_SIN_PUBLICAR');
  end if;
  -- 7. Presupuestos (§10.2).
  if o.presupuesto_comprometido + p.monto_bruto > o.presupuesto_maximo then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_OFERTA',
      detail = 'La oferta ya no tiene presupuesto para este cupo.';
  end if;
  if c.presupuesto_comprometido + p.monto_bruto > c.presupuesto_total then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA',
      detail = 'La campaña ya no tiene presupuesto para este cupo.';
  end if;
  -- 8. Tope % por medio dentro de la campaña (D13).
  select coalesce(sum(a.monto_bruto), 0) into v_medio_camp from public.asignaciones a
  where a.campana_id = c.id and a.medio_id = p_medio_id and private.consume_cupo(a.estado, a.estado_previo_disputa);
  if v_medio_camp + p.monto_bruto > o.tope_porcentaje_por_medio * c.presupuesto_total then
    raise exception using errcode = 'P0001', message = 'AMO_TOPE_MEDIO',
      detail = 'Superarías la participación máxima de un medio en esta campaña.';
  end if;
  -- 9. Tope anual por nivel de verificación (D14, D26).
  select nv.* into n from public.niveles_verificacion nv
  join public.medios m on m.nivel_verificacion = nv.nivel where m.id = p_medio_id;
  if n.tope_anual is not null then
    v_ini_anio := private.inicio_dia(make_date(extract(year from private.hoy())::integer, 1, 1));
    select coalesce(sum(am.monto_medio), 0) into v_anual
    from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
    where a.medio_id = p_medio_id and a.aceptada_at >= v_ini_anio
      and private.consume_cupo(a.estado, a.estado_previo_disputa);
    if v_anual + p.monto_medio > n.porcentaje_bloqueo * n.tope_anual then
      raise exception using errcode = 'P0001', message = 'AMO_TOPE_NIVEL',
        detail = 'Estás cerca del tope anual de tu nivel de verificación: sube de nivel para seguir aceptando.';
    end if;
  end if;
  -- 9b. Exclusividad por sector (D25).
  select an.sector_id into v_sector from public.anunciantes an where an.id = o.anunciante_id;
  if exists (select 1 from public.asignaciones a2
             join public.ofertas o2 on o2.id = a2.oferta_id
             join public.anunciantes an2 on an2.id = a2.anunciante_id
             where a2.medio_id = p_medio_id and private.consume_cupo(a2.estado, a2.estado_previo_disputa)
               and a2.anunciante_id <> o.anunciante_id and an2.sector_id = v_sector
               and (o.exclusividad_dias is not null or o2.exclusividad_dias is not null)
               and tstzrange(o.ventana_inicio, o.ventana_fin + make_interval(days => coalesce(o.exclusividad_dias, 0)))
                   && tstzrange(o2.ventana_inicio, o2.ventana_fin + make_interval(days => coalesce(o2.exclusividad_dias, 0)))) then
    raise exception using errcode = 'P0001', message = 'AMO_EXCLUSIVIDAD',
      detail = 'Tienes un compromiso de exclusividad con otra marca del mismo sector en esas fechas.';
  end if;
  -- 10. Asignación con valores congelados y sus montos (misma transacción).
  insert into public.asignaciones (oferta_id, campana_id, anunciante_id, medio_id, cuenta_social_id, plataforma, slot,
    clave_idempotencia, estado, aceptada_at, fecha_limite_publicacion, franja_id, franja_clave, seguidores_al_aceptar,
    tarifa_id, tarifa_base_aplicada, publicaciones, multiplicador_calidad_aplicado, multiplicador_geografico_aplicado,
    multiplicador_exclusividad_aplicado, monto_bruto, es_demo)
  values (o.id, c.id, o.anunciante_id, p_medio_id, cu.id, o.plataforma, v_slot, p_clave_idempotencia, 'ACEPTADA', v_ahora,
          o.ventana_fin, p.franja_id, p.franja_clave, p.seguidores, p.tarifa_id, p.tarifa_base, p.publicaciones,
          p.multiplicador_calidad, p.multiplicador_geografico, p.multiplicador_exclusividad, p.monto_bruto, c.es_demo)
  returning id into v_id;
  insert into public.asignacion_montos (asignacion_id, medio_id, monto_bruto, porcentaje_comision, comision_origen,
                                        comision_excepcion_id, monto_comision)
  values (v_id, p_medio_id, p.monto_bruto, p.porcentaje_comision, p.comision_origen, p.comision_excepcion_id, p.monto_comision);
  -- 11. Contadores.
  update public.oferta_cupos x set cupos_ocupados = x.cupos_ocupados + 1
  where x.oferta_id = o.id and x.franja_id = p.franja_id;
  update public.ofertas x set cupos_ocupados = x.cupos_ocupados + 1,
         presupuesto_comprometido = x.presupuesto_comprometido + p.monto_bruto,
         llena_at = case when x.llena_at is null and x.cupos_ocupados + 1 = x.cupos_totales then v_ahora else x.llena_at end
  where x.id = o.id;
  update public.campanas x set presupuesto_comprometido = x.presupuesto_comprometido + p.monto_bruto where x.id = c.id;
  -- 12. Oferta llena antes de la ventana ⇒ CUPOS_COMPLETOS (si ya está EN_EJECUCION la visibilidad derivada la oculta).
  if o.estado = 'PUBLICADA' and o.cupos_ocupados + 1 = o.cupos_totales and v_ahora < o.ventana_inicio then
    perform private.aplicar_transicion('ofertas', o.id, 'CUPOS_COMPLETOS', 'SISTEMA', null);
  end if;
  return query select * from private.resultado_reserva(v_id);
end $$;
revoke all on function private.reservar_cupo(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Solo contadores (§5.7). Precondición: el llamador validó la transición, tomó los bloqueos canónicos y ya aplicó el
-- cambio de estado. Si la oferta estaba llena antes de la ventana y de la fecha límite, vuelve a PUBLICADA (D5).
create function private.liberar_cupo_efecto(p_asignacion_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare a public.asignaciones; o public.ofertas; v_ahora timestamptz := private.ahora();
begin
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  if a.monto_bruto is null or a.franja_id is null then return; end if;   -- un rechazo de marketplace nunca consumió
  update public.oferta_cupos x set cupos_ocupados = x.cupos_ocupados - 1
  where x.oferta_id = a.oferta_id and x.franja_id = a.franja_id;
  update public.ofertas x set cupos_ocupados = x.cupos_ocupados - 1,
         presupuesto_comprometido = x.presupuesto_comprometido - a.monto_bruto
  where x.id = a.oferta_id
  returning * into o;
  update public.campanas x set presupuesto_comprometido = x.presupuesto_comprometido - a.monto_bruto where x.id = a.campana_id;
  if o.estado = 'CUPOS_COMPLETOS' and v_ahora < o.fecha_limite_aceptacion and v_ahora < o.ventana_inicio then
    perform private.aplicar_transicion('ofertas', o.id, 'PUBLICADA', 'SISTEMA', null);
  end if;
end $$;
revoke all on function private.liberar_cupo_efecto(uuid) from public, anon, authenticated;

-- EN_DISPUTA (previo VENCIDA_SIN_PUBLICAR) → CONTENIDO_ENTREGADO: vuelve a tomar cupo y presupuesto con el precio
-- congelado, revalidando cupo, presupuestos y topes con los bloqueos canónicos; da un plazo nuevo de publicación.
create function private.reconsumir_cupo(p_asignacion_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  a public.asignaciones; am public.asignacion_montos; c public.campanas; o public.ofertas; oc public.oferta_cupos;
  n public.niveles_verificacion; v_medio_camp numeric; v_anual numeric; v_ini_anio timestamptz;
begin
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  select * into c from public.campanas x where x.id = a.campana_id for update;
  select * into o from public.ofertas x where x.id = a.oferta_id for update;
  select * into oc from public.oferta_cupos x where x.oferta_id = a.oferta_id and x.franja_id = a.franja_id for update;
  perform pg_advisory_xact_lock(hashtextextended('amo.medio:' || a.medio_id::text, 0));
  select * into a from public.asignaciones x where x.id = p_asignacion_id for update;
  select * into am from public.asignacion_montos x where x.asignacion_id = a.id;
  if oc.oferta_id is null or oc.cupos_ocupados >= oc.cupos_totales then
    raise exception using errcode = 'P0001', message = 'AMO_SIN_CUPO', detail = 'Ya no quedan cupos en la franja de la asignación.';
  end if;
  if o.presupuesto_comprometido + a.monto_bruto > o.presupuesto_maximo then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_OFERTA', detail = 'La oferta ya no tiene presupuesto.';
  end if;
  if c.presupuesto_comprometido + a.monto_bruto > c.presupuesto_total then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA', detail = 'La campaña ya no tiene presupuesto.';
  end if;
  select coalesce(sum(x.monto_bruto), 0) into v_medio_camp from public.asignaciones x
  where x.campana_id = c.id and x.medio_id = a.medio_id and x.id <> a.id
    and private.consume_cupo(x.estado, x.estado_previo_disputa);
  if v_medio_camp + a.monto_bruto > o.tope_porcentaje_por_medio * c.presupuesto_total then
    raise exception using errcode = 'P0001', message = 'AMO_TOPE_MEDIO',
      detail = 'Se superaría la participación máxima del medio en la campaña.';
  end if;
  select nv.* into n from public.niveles_verificacion nv
  join public.medios m on m.nivel_verificacion = nv.nivel where m.id = a.medio_id;
  if n.tope_anual is not null then
    v_ini_anio := private.inicio_dia(make_date(extract(year from private.hoy())::integer, 1, 1));
    select coalesce(sum(y.monto_medio), 0) into v_anual
    from public.asignaciones x join public.asignacion_montos y on y.asignacion_id = x.id
    where x.medio_id = a.medio_id and x.id <> a.id and x.aceptada_at >= v_ini_anio
      and private.consume_cupo(x.estado, x.estado_previo_disputa);
    if v_anual + am.monto_medio > n.porcentaje_bloqueo * n.tope_anual then
      raise exception using errcode = 'P0001', message = 'AMO_TOPE_NIVEL',
        detail = 'Se superaría el tope anual del nivel de verificación del medio.';
    end if;
  end if;
  update public.oferta_cupos x set cupos_ocupados = x.cupos_ocupados + 1
  where x.oferta_id = a.oferta_id and x.franja_id = a.franja_id;
  update public.ofertas x set cupos_ocupados = x.cupos_ocupados + 1,
         presupuesto_comprometido = x.presupuesto_comprometido + a.monto_bruto
  where x.id = a.oferta_id;
  update public.campanas x set presupuesto_comprometido = x.presupuesto_comprometido + a.monto_bruto where x.id = a.campana_id;
  update public.asignaciones x
     set fecha_limite_publicacion = private.ahora() + make_interval(hours => private.config_entero('disputas.plazo_recarga_horas'))
   where x.id = a.id;
end $$;
revoke all on function private.reconsumir_cupo(uuid) from public, anon, authenticated;

-- METRICAS_CARGADAS (§4.3.7, D10): cada publicación tiene fila en cada corte requerido y ninguna RECHAZADA.
create function private.evaluar_metricas_cargadas(p_asignacion_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare a public.asignaciones; v_cortes public.corte_metrica[];
begin
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  if a.estado is distinct from 'EVIDENCIA_VALIDADA' then return false; end if;
  select o.cortes_requeridos into v_cortes from public.ofertas o where o.id = a.oferta_id;
  if (select count(*) from public.publicaciones p where p.asignacion_id = a.id) < a.publicaciones
     or exists (select 1 from public.publicaciones p cross join unnest(v_cortes) k(corte)
                where p.asignacion_id = a.id
                  and not exists (select 1 from public.metricas m
                                  where m.publicacion_id = p.id and m.corte = k.corte
                                    and m.estado_validacion <> 'RECHAZADA')) then
    return false;
  end if;
  perform private.aplicar_transicion('asignaciones', a.id, 'METRICAS_CARGADAS', 'SISTEMA', null);
  return true;
end $$;
revoke all on function private.evaluar_metricas_cargadas(uuid) from public, anon, authenticated;

-- 5. Funciones de trigger

-- Campañas: nace en borrador, sin contadores; es_demo y autor derivados.
create function private.fn_campanas_derivar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_demo boolean;
begin
  if private.modo_carga() then return new; end if;
  select a.es_demo into v_demo from public.anunciantes a where a.id = new.anunciante_id and a.deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El anunciante no está disponible.';
  end if;
  new.es_demo := v_demo;
  new.presupuesto_comprometido := 0;
  new.activada_at := null;
  new.finalizada_at := null;
  new.cancelada_at := null;
  new.deleted_at := null;
  new.creada_por := private.actor_id();
  return new;
end $$;
revoke all on function private.fn_campanas_derivar() from public, anon, authenticated;

-- Campañas: anunciante y contador solo los procedimientos; presupuesto ≥ comprometido; cerradas no se editan;
-- solo se archivan (deleted_at) en borrador, canceladas o finalizadas.
create function private.fn_campanas_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if new.presupuesto_total < new.presupuesto_comprometido then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA',
      detail = 'El presupuesto no puede quedar por debajo de lo ya comprometido.';
  end if;
  if current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['anunciante_id', 'presupuesto_comprometido', 'activada_at',
       'finalizada_at', 'cancelada_at', 'creada_por', 'es_demo', 'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Esos datos de la campaña solo los cambia la plataforma.';
  end if;
  if old.estado in ('FINALIZADA', 'CANCELADA')
     and private.hay_cambios(to_jsonb(old), to_jsonb(new), array['nombre', 'objetivo', 'marca', 'fecha_inicio', 'fecha_fin',
       'presupuesto_total']) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Una campaña finalizada o cancelada no se modifica.';
  end if;
  if new.deleted_at is not null and old.deleted_at is null and old.estado not in ('BORRADOR', 'CANCELADA', 'FINALIZADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se archivan campañas en borrador, canceladas o finalizadas.';
  end if;
  return new;
end $$;
revoke all on function private.fn_campanas_guardar() from public, anon, authenticated;

-- Ofertas (invoker): el contenido solo se edita en BORRADOR/DEVUELTA; campaña, anunciante, contadores, marcas de
-- moderación y timestamps solo los cambian los procedimientos.
create function private.fn_ofertas_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['campana_id', 'anunciante_id', 'cupos_totales', 'cupos_ocupados',
       'presupuesto_comprometido', 'llena_at', 'comentario_moderacion', 'moderada_por', 'enviada_at', 'devuelta_at',
       'publicada_at', 'cupos_completos_at', 'en_ejecucion_at', 'vencida_at', 'cerrada_at', 'cancelada_at', 'creada_por',
       'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Esos datos de la oferta solo los cambia la plataforma.';
  end if;
  if old.estado not in ('BORRADOR', 'DEVUELTA')
     and private.hay_cambios(to_jsonb(old), to_jsonb(new), array['titulo', 'formato_id', 'plataforma',
       'publicaciones_por_medio', 'permite_multiples_cupos', 'presupuesto_maximo', 'tope_porcentaje_por_medio',
       'departamentos_objetivo', 'municipios_objetivo', 'categorias_objetivo', 'seguidores_minimos', 'medios_excluidos',
       'ventana_inicio', 'ventana_fin', 'fecha_limite_aceptacion', 'permanencia_minima_dias', 'exclusividad_dias',
       'cortes_requeridos', 'instrucciones', 'restricciones']) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La oferta solo se edita en borrador o devuelta.';
  end if;
  if new.deleted_at is not null and old.deleted_at is null
     and old.estado not in ('BORRADOR', 'DEVUELTA', 'CANCELADA', 'VENCIDA', 'CERRADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Una oferta en curso no se archiva.';
  end if;
  return new;
end $$;
revoke all on function private.fn_ofertas_guardar() from public, anon, authenticated;

-- Ofertas (definer): anunciante copiado de la campaña, defaults de configuración, contadores en cero y segmentación
-- validada contra geo y categorías ACTIVOS (al crear o al cambiar la segmentación).
create function private.fn_ofertas_derivar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_anunciante uuid; v_estado public.campana_estado; v_borrada timestamptz;
begin
  if private.modo_carga() then return new; end if;
  if tg_op = 'INSERT' then
    select c.anunciante_id, c.estado, c.deleted_at into v_anunciante, v_estado, v_borrada
    from public.campanas c where c.id = new.campana_id;
    if v_anunciante is null or v_borrada is not null or v_estado not in ('BORRADOR', 'ACTIVA') then
      raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
        detail = 'La campaña no admite ofertas nuevas.';
    end if;
    if not exists (select 1 from public.formatos f where f.id = new.formato_id and f.plataforma = new.plataforma and f.activo) then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El formato no está disponible.';
    end if;
    new.anunciante_id := v_anunciante;
    new.tope_porcentaje_por_medio := coalesce(new.tope_porcentaje_por_medio,
                                              private.config_decimal('campanas.tope_porcentaje_por_medio'));
    new.cortes_requeridos := coalesce(new.cortes_requeridos,
                                      private.config_lista('metricas.cortes_requeridos')::public.corte_metrica[]);
    new.cupos_totales := 0;
    new.cupos_ocupados := 0;
    new.presupuesto_comprometido := 0;
    new.llena_at := null;
    new.comentario_moderacion := null;
    new.moderada_por := null;
    new.enviada_at := null; new.devuelta_at := null; new.publicada_at := null; new.cupos_completos_at := null;
    new.en_ejecucion_at := null; new.vencida_at := null; new.cerrada_at := null; new.cancelada_at := null;
    new.deleted_at := null;
    new.creada_por := private.actor_id();
  end if;
  if tg_op = 'INSERT'
     or new.departamentos_objetivo is distinct from old.departamentos_objetivo
     or new.municipios_objetivo is distinct from old.municipios_objetivo
     or new.categorias_objetivo is distinct from old.categorias_objetivo then
    if exists (select 1 from unnest(new.departamentos_objetivo) x(codigo)
               where not exists (select 1 from public.departamentos d where d.codigo = x.codigo and d.activo))
       or exists (select 1 from unnest(new.municipios_objetivo) x(codigo)
                  where not exists (select 1 from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                                    where m.codigo = x.codigo and m.activo and d.activo))
       or exists (select 1 from unnest(new.categorias_objetivo) x(id)
                  where not exists (select 1 from public.categorias c where c.id = x.id and c.activo and c.deleted_at is null)) then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'La segmentación incluye zonas o categorías que no están habilitadas.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.fn_ofertas_derivar() from public, anon, authenticated;

-- Cupos por franja: solo con la oferta en BORRADOR/DEVUELTA (o dentro de una transición); bloquea la oferta para
-- serializar con el envío a revisión. Franja activa al crear.
create function private.fn_oferta_cupos_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_estado public.oferta_estado;
begin
  if private.modo_carga() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select o.estado into v_estado from public.ofertas o where o.id = coalesce(new.oferta_id, old.oferta_id) for no key update;
  if tg_op = 'DELETE' and v_estado is null then return old; end if;     -- borrado en cascada de la oferta
  if v_estado not in ('BORRADOR', 'DEVUELTA') and coalesce(current_setting('amo.transicion_autorizada', true), '') <> 'on' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Los cupos solo se editan con la oferta en borrador o devuelta.';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.franjas f where f.id = new.franja_id and f.activa) then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'La franja no está activa.';
    end if;
    new.cupos_ocupados := 0;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.fn_oferta_cupos_guardar() from public, anon, authenticated;

-- ofertas.cupos_totales = Σ oferta_cupos.cupos_totales (sin condición).
create function private.fn_oferta_cupos_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_oferta uuid := coalesce(new.oferta_id, old.oferta_id);
begin
  update public.ofertas o
     set cupos_totales = (select coalesce(sum(x.cupos_totales), 0) from public.oferta_cupos x where x.oferta_id = v_oferta)
   where o.id = v_oferta;
  return null;
end $$;
revoke all on function private.fn_oferta_cupos_total() from public, anon, authenticated;

-- Creativos: versión nueva = max + 1, la anterior deja de ser vigente (serializado por la oferta); avisa a los medios
-- con asignación en curso (creativo.actualizado, §7.2.4).
create function private.fn_creativos_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_anterior uuid;
begin
  if private.modo_carga() then return new; end if;
  perform 1 from public.ofertas o where o.id = new.oferta_id for no key update;
  select c.id into v_anterior from public.creativos c where c.oferta_id = new.oferta_id and c.vigente;
  new.version := coalesce((select max(c.version) from public.creativos c where c.oferta_id = new.oferta_id), 0) + 1;
  new.vigente := true;
  new.reemplaza_a := v_anterior;
  new.creado_por := private.actor_id();
  if v_anterior is not null then
    update public.creativos c set vigente = false where c.id = v_anterior;
    perform private.notificar(
      (select coalesce(array_agg(distinct u.id), '{}') from public.asignaciones a
         cross join lateral unnest(private.usuarios_medio(a.medio_id)) u(id)
        where a.oferta_id = new.oferta_id and private.consume_cupo(a.estado, a.estado_previo_disputa)),
      'creativo.actualizado', jsonb_build_object('oferta_id', new.oferta_id, 'version', new.version),
      'ofertas', new.oferta_id::text, null, 1::smallint);
  end if;
  return new;
end $$;
revoke all on function private.fn_creativos_version() from public, anon, authenticated;

create function private.fn_creativos_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['oferta_id', 'tipo', 'version', 'reemplaza_a', 'vigente',
       'creado_por', 'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Para cambiar el creativo publica una versión nueva.';
  end if;
  return new;
end $$;
revoke all on function private.fn_creativos_guardar() from public, anon, authenticated;

-- Archivo del creativo: ruta ligada a su oferta y creativo (§3.8) y tamaño máximo de configuración.
create function private.fn_creativo_archivos_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_oferta uuid;
begin
  if private.modo_carga() then return new; end if;
  select c.oferta_id into v_oferta from public.creativos c where c.id = new.creativo_id;
  if v_oferta is null or position('..' in new.archivo_path) > 0
     or new.archivo_path not like 'oferta/' || v_oferta::text || '/' || new.creativo_id::text || '/%' then
    raise exception using errcode = 'check_violation', constraint = 'creativo_archivos_archivo_path_chk',
      message = 'creativo_archivos_archivo_path_chk', detail = 'La ruta del archivo no corresponde al creativo.';
  end if;
  if new.tamano_bytes > private.config_entero('archivos.max_creativo_mb')::bigint * 1048576 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El archivo supera el tamaño máximo permitido.';
  end if;
  new.created_at := private.ahora();
  return new;
end $$;
revoke all on function private.fn_creativo_archivos_validar() from public, anon, authenticated;

-- Asignaciones (invoker): solo las crean los procedimientos; los valores congelados no cambian una vez fijados.
create function private.fn_asignaciones_congelado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if tg_op = 'INSERT' then
    if current_user <> 'postgres' then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Las asignaciones solo se crean al aceptar o rechazar una oferta.';
    end if;
    return new;
  end if;
  if exists (select 1 from unnest(array['oferta_id', 'campana_id', 'anunciante_id', 'medio_id', 'cuenta_social_id',
               'plataforma', 'slot', 'franja_id', 'franja_clave', 'seguidores_al_aceptar', 'tarifa_id',
               'tarifa_base_aplicada', 'publicaciones', 'multiplicador_calidad_aplicado',
               'multiplicador_geografico_aplicado', 'multiplicador_exclusividad_aplicado', 'monto_bruto', 'aceptada_at',
               'clave_idempotencia']) k
             where to_jsonb(old) -> k <> 'null'::jsonb and to_jsonb(old) -> k is distinct from to_jsonb(new) -> k) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Los valores congelados de la asignación no se modifican.';
  end if;
  return new;
end $$;
revoke all on function private.fn_asignaciones_congelado() from public, anon, authenticated;

-- Montos (invoker): congelados; el trío de retenciones solo pasa de null a valor (liquidar) o de valor a null (anular).
create function private.fn_asignacion_montos_congelado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if tg_op = 'INSERT' then
    if current_user <> 'postgres' then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Los montos solo los fija la aceptación de la oferta.';
    end if;
    return new;
  end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['asignacion_id', 'medio_id', 'monto_bruto', 'porcentaje_comision',
       'comision_origen', 'comision_excepcion_id', 'monto_comision']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Los montos congelados no se modifican.';
  end if;
  if old.monto_neto is not null and new.monto_neto is not null
     and (old.retenciones_aplicadas, old.monto_retenciones, old.monto_neto)
         is distinct from (new.retenciones_aplicadas, new.monto_retenciones, new.monto_neto) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Las retenciones liquidadas no se reescriben: anula la liquidación.';
  end if;
  return new;
end $$;
revoke all on function private.fn_asignacion_montos_congelado() from public, anon, authenticated;

-- Publicaciones: anunciante, medio y plataforma copiados de la asignación (inmutables); nacen pendientes.
create function private.fn_publicaciones_derivar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select a.anunciante_id, a.medio_id, a.plataforma into new.anunciante_id, new.medio_id, new.plataforma
    from public.asignaciones a where a.id = new.asignacion_id;
    if new.medio_id is null then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La asignación no existe.';
    end if;
    if not private.modo_carga() then
      new.validada_por := null;
      new.validada_at := null;
      new.etiqueta_verificada := false;
      new.permanencia_verificada_at := null;
      new.retirada_detectada_at := null;
    end if;
    return new;
  end if;
  if not private.modo_carga()
     and (new.asignacion_id, new.anunciante_id, new.medio_id, new.plataforma, new.numero)
         is distinct from (old.asignacion_id, old.anunciante_id, old.medio_id, old.plataforma, old.numero) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La evidencia no cambia de asignación ni de número.';
  end if;
  return new;
end $$;
revoke all on function private.fn_publicaciones_derivar() from public, anon, authenticated;

-- Rutas de evidencia (publicaciones y métricas, TG_ARGV[0] = 'publicacion' | 'metrica'): prefijo de la propia fila,
-- sin '..'; las capturas compartidas de la demo (muestras/) solo con modo_carga.
create function private.fn_validar_ruta_evidencia() returns trigger
language plpgsql set search_path = '' as $$
declare v_prefijo text := 'asignacion/' || new.asignacion_id::text || '/' || tg_argv[0] || '/';
begin
  if exists (select 1 from unnest(array[new.captura_path, new.miniatura_path]) r(ruta)
             where r.ruta is not null
               and (position('..' in r.ruta) > 0
                    or not (r.ruta like v_prefijo || '%' or (private.modo_carga() and r.ruta like 'muestras/%')))) then
    raise exception using errcode = 'check_violation', constraint = tg_table_name || '_ruta_chk',
      message = tg_table_name || '_ruta_chk', detail = 'La ruta del archivo no corresponde a la asignación.';
  end if;
  return new;
end $$;
revoke all on function private.fn_validar_ruta_evidencia() from public, anon, authenticated;

-- Métricas: asignación, anunciante, medio y plataforma derivados de la publicación (el cliente no los envía; así un
-- medio no carga métricas sobre la publicación de otro ni ocupa su corte); nacen pendientes.
create function private.fn_metricas_derivar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select p.asignacion_id, p.anunciante_id, p.medio_id, p.plataforma
    into new.asignacion_id, new.anunciante_id, new.medio_id, new.plataforma
  from public.publicaciones p where p.id = new.publicacion_id;
  if new.asignacion_id is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La publicación no existe.';
  end if;
  if not private.modo_carga() then
    new.estado_validacion := 'PENDIENTE';
    new.validada_por := null;
    new.validada_at := null;
    new.observaciones := null;
  end if;
  return new;
end $$;
revoke all on function private.fn_metricas_derivar() from public, anon, authenticated;

-- Edición de métricas (§10.8, invoker): claves inmutables; validación y alertas solo por la plataforma; una validada solo
-- la corrige metricas.editar_validadas; si el medio corrige una RECHAZADA vuelve a PENDIENTE (fila RECHAZADA → PENDIENTE).
create function private.fn_metricas_guardar_edicion() returns trigger
language plpgsql set search_path = '' as $$
declare v_proc boolean := current_user = 'postgres';
begin
  if private.modo_carga() then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['publicacion_id', 'asignacion_id', 'anunciante_id', 'medio_id',
       'plataforma', 'corte', 'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La métrica no cambia de publicación ni de corte.';
  end if;
  if v_proc then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['validada_por', 'validada_at', 'observaciones', 'alerta_desviacion',
       'alerta_multiplo', 'detalle_alertas', 'fuente']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La validación solo la registra la plataforma.';
  end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['fecha_corte', 'periodo_desde', 'periodo_hasta', 'alcance',
       'impresiones', 'reproducciones', 'espectadores_unicos', 'me_gusta', 'comentarios', 'compartidos', 'guardados',
       'clics_enlace', 'visitas_perfil', 'tiempo_promedio_visualizacion_s', 'porcentaje_reproduccion_completa',
       'captura_path', 'miniatura_path']) then
    if old.estado_validacion = 'APROBADA' and not private.tiene_permiso('metricas.editar_validadas') then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Una métrica validada solo la corrige quien tiene permiso.';
    end if;
    if old.estado_validacion = 'RECHAZADA' and not private.tiene_permiso('metricas.editar_validadas') then
      new.estado_validacion := 'PENDIENTE';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.fn_metricas_guardar_edicion() from public, anon, authenticated;

-- Alertas (§11): múltiplo de alcance sobre seguidores al aceptar y desviación frente a la mediana histórica del medio
-- (mismo corte y plataforma, métricas aprobadas de otras publicaciones).
create function private.fn_metricas_alertas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_alcance bigint := coalesce(new.alcance, new.espectadores_unicos);
  v_seguidores integer;
  v_multiplo numeric;
  v_factor numeric := private.config_decimal('metricas.factor_desviacion');
  v_minimo integer := private.config_entero('metricas.minimo_historial');
  v_mediana numeric;
  v_n integer;
begin
  if tg_op = 'UPDATE' and not private.hay_cambios(to_jsonb(old), to_jsonb(new), array['alcance', 'espectadores_unicos',
       'corte', 'publicacion_id']) then
    return new;
  end if;
  select a.seguidores_al_aceptar into v_seguidores from public.asignaciones a where a.id = new.asignacion_id;
  v_multiplo := (private.config_valor('metricas.multiplo_alcance_seguidores') ->> new.plataforma::text)::numeric;
  select percentile_cont(0.5) within group (order by m.alcance_norm), count(*)
    into v_mediana, v_n
  from public.metricas m
  where m.medio_id = new.medio_id and m.plataforma = new.plataforma and m.corte = new.corte
    and m.estado_validacion = 'APROBADA' and m.publicacion_id <> new.publicacion_id and m.alcance_norm is not null;
  new.alerta_multiplo := coalesce(v_alcance > v_multiplo * v_seguidores, false);
  new.alerta_desviacion := coalesce(v_n >= v_minimo and v_mediana > 0
                                    and (v_alcance > v_mediana * v_factor or v_alcance < v_mediana / v_factor), false);
  new.detalle_alertas := jsonb_build_object('mediana_historica', v_mediana, 'n_historial', v_n, 'factor', v_factor,
                                            'seguidores', v_seguidores, 'multiplo', v_multiplo);
  return new;
end $$;
revoke all on function private.fn_metricas_alertas() from public, anon, authenticated;

-- Completitud: cada carga o corrección reevalúa METRICAS_CARGADAS (actor SISTEMA, dentro de la sesión del medio).
create function private.fn_metricas_completitud() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return null; end if;
  perform private.evaluar_metricas_cargadas(new.asignacion_id);
  return null;
end $$;
revoke all on function private.fn_metricas_completitud() from public, anon, authenticated;

-- Facturas (definer): la campaña debe ser del anunciante; es_demo derivado; nace sin número ni pagos.
create function private.fn_facturas_derivar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_demo boolean;
begin
  if private.modo_carga() then return new; end if;
  select a.es_demo into v_demo from public.anunciantes a where a.id = new.anunciante_id;
  if new.campana_id is not null
     and not exists (select 1 from public.campanas c where c.id = new.campana_id and c.anunciante_id = new.anunciante_id) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'La campaña no pertenece al anunciante.';
  end if;
  new.es_demo := coalesce(v_demo, false);
  new.pagado := 0;
  new.resolucion_id := null; new.prefijo := null; new.consecutivo := null; new.fecha_emision := null;
  new.emitida_at := null; new.pagada_at := null; new.vencida_at := null; new.anulada_at := null;
  return new;
end $$;
revoke all on function private.fn_facturas_derivar() from public, anon, authenticated;

-- Facturas (invoker): solo el borrador se edita; numeración, pagos y marcas solo los procedimientos.
create function private.fn_facturas_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['anunciante_id', 'campana_id', 'resolucion_id', 'prefijo',
       'consecutivo', 'fecha_emision', 'pagado', 'emitida_at', 'pagada_at', 'vencida_at', 'anulada_at', 'es_demo',
       'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Esos datos de la factura solo los cambia la plataforma.';
  end if;
  if old.estado <> 'BORRADOR'
     and private.hay_cambios(to_jsonb(old), to_jsonb(new), array['periodo_desde', 'periodo_hasta', 'fecha_vencimiento',
       'subtotal', 'iva']) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Solo se edita una factura en borrador.';
  end if;
  return new;
end $$;
revoke all on function private.fn_facturas_guardar() from public, anon, authenticated;

-- Liquidaciones (invoker): totales, periodo y marcas solo los procedimientos; una pagada o anulada no cambia.
create function private.fn_liquidaciones_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['medio_id', 'periodo_inicio', 'periodo_fin',
       'cantidad_asignaciones', 'monto_bruto', 'monto_comision', 'monto_medio', 'monto_retenciones', 'monto_neto',
       'requiere_documento_soporte', 'alerta_seg_social', 'aprobada_por', 'aprobada_at', 'pagada_at', 'anulada_at',
       'dispersion_id', 'creada_por', 'es_demo', 'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Esos datos de la liquidación solo los cambia la plataforma.';
  end if;
  if old.estado in ('PAGADA', 'ANULADA') and private.hay_cambios(to_jsonb(old), to_jsonb(new), array['fecha_pago',
       'referencia_pago', 'soporte_pago_path', 'numero_factura_medio', 'factura_medio_path']) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Una liquidación pagada o anulada no se modifica.';
  end if;
  return new;
end $$;
revoke all on function private.fn_liquidaciones_guardar() from public, anon, authenticated;

-- Mensajes de disputa: el autor es siempre el actor efectivo y la fecha la del servidor.
create function private.fn_disputa_mensajes_sellar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  new.autor_id := private.actor_id();
  new.created_at := private.ahora();
  if new.autor_id is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El mensaje requiere un autor identificado.';
  end if;
  return new;
end $$;
revoke all on function private.fn_disputa_mensajes_sellar() from public, anon, authenticated;

-- 6. Triggers (orden alfabético dentro de cada momento: a_ validar, b_ derivar, m_ updated_at, z_ auditar)

-- 6.1 Tablas de M6: máquina de estados (el de perfiles llega en 7c).
create trigger trg_anunciantes_a_estado_inicial before insert on public.anunciantes
  for each row execute function private.fn_validar_estado_inicial('anunciantes');
create trigger trg_anunciantes_a_validar_transicion before update of estado_verificacion on public.anunciantes
  for each row execute function private.fn_validar_transicion('anunciantes', 'estado_verificacion');
create trigger trg_medios_a_estado_inicial before insert on public.medios
  for each row execute function private.fn_validar_estado_inicial('medios');
create trigger trg_medios_a_validar_transicion before update of estado, nivel_verificacion on public.medios
  for each row execute function private.fn_validar_transicion('medios', 'estado');
create trigger trg_documentos_medio_a_estado_inicial before insert on public.documentos_medio
  for each row execute function private.fn_validar_estado_inicial('documentos_medio');
create trigger trg_documentos_medio_a_validar_transicion before update of estado_validacion on public.documentos_medio
  for each row execute function private.fn_validar_transicion('documentos_medio', 'estado_validacion');
create trigger trg_documentos_anunciante_a_estado_inicial before insert on public.documentos_anunciante
  for each row execute function private.fn_validar_estado_inicial('documentos_anunciante');
create trigger trg_documentos_anunciante_a_validar_transicion before update of estado_validacion on public.documentos_anunciante
  for each row execute function private.fn_validar_transicion('documentos_anunciante', 'estado_validacion');
create trigger trg_verificaciones_cuenta_a_validar_transicion before update of estado_validacion on public.verificaciones_cuenta
  for each row execute function private.fn_validar_transicion('verificaciones_cuenta', 'estado_validacion');

-- 6.2 Campañas
create trigger trg_campanas_a_estado_inicial before insert on public.campanas
  for each row execute function private.fn_validar_estado_inicial('campanas');
create trigger trg_campanas_a_guardar before update on public.campanas
  for each row execute function private.fn_campanas_guardar();
create trigger trg_campanas_a_validar_transicion before update of estado on public.campanas
  for each row execute function private.fn_validar_transicion('campanas', 'estado');
create trigger trg_campanas_b_derivar before insert on public.campanas
  for each row execute function private.fn_campanas_derivar();
create trigger trg_campanas_m_updated_at before update on public.campanas
  for each row execute function private.fn_set_updated_at();
create trigger trg_campanas_z_auditar after insert or update or delete on public.campanas
  for each row execute function private.fn_auditar('id');

-- 6.3 Ofertas, cupos y creativos
create trigger trg_ofertas_a_estado_inicial before insert on public.ofertas
  for each row execute function private.fn_validar_estado_inicial('ofertas');
create trigger trg_ofertas_a_guardar before update on public.ofertas
  for each row execute function private.fn_ofertas_guardar();
create trigger trg_ofertas_a_validar_transicion before update of estado on public.ofertas
  for each row execute function private.fn_validar_transicion('ofertas', 'estado');
create trigger trg_ofertas_b_derivar before insert or update on public.ofertas
  for each row execute function private.fn_ofertas_derivar();
create trigger trg_ofertas_m_updated_at before update on public.ofertas
  for each row execute function private.fn_set_updated_at();
create trigger trg_ofertas_z_auditar after insert or update or delete on public.ofertas
  for each row execute function private.fn_auditar('id');

create trigger trg_oferta_cupos_a_guardar before insert or update of cupos_totales or delete on public.oferta_cupos
  for each row execute function private.fn_oferta_cupos_guardar();
create trigger trg_oferta_cupos_m_updated_at before update on public.oferta_cupos
  for each row execute function private.fn_set_updated_at();
create trigger trg_oferta_cupos_z_auditar after insert or update or delete on public.oferta_cupos
  for each row execute function private.fn_auditar('oferta_id');
create trigger trg_oferta_cupos_z_total after insert or update of cupos_totales or delete on public.oferta_cupos
  for each row execute function private.fn_oferta_cupos_total();

create trigger trg_creativos_a_guardar before update on public.creativos
  for each row execute function private.fn_creativos_guardar();
create trigger trg_creativos_b_version before insert on public.creativos
  for each row execute function private.fn_creativos_version();
create trigger trg_creativos_m_updated_at before update on public.creativos
  for each row execute function private.fn_set_updated_at();
create trigger trg_creativos_z_auditar after insert or update or delete on public.creativos
  for each row execute function private.fn_auditar('id');

create trigger trg_creativo_archivos_a_validar before insert on public.creativo_archivos
  for each row execute function private.fn_creativo_archivos_validar();
create trigger trg_creativo_archivos_z_auditar after insert or update or delete on public.creativo_archivos
  for each row execute function private.fn_auditar('id');

create trigger trg_comisiones_excepcion_m_updated_at before update on public.comisiones_excepcion
  for each row execute function private.fn_set_updated_at();
create trigger trg_comisiones_excepcion_z_auditar after insert or update or delete on public.comisiones_excepcion
  for each row execute function private.fn_auditar('id');

-- 6.4 Asignaciones y montos
create trigger trg_asignaciones_a_congelado before insert or update on public.asignaciones
  for each row execute function private.fn_asignaciones_congelado();
create trigger trg_asignaciones_a_estado_inicial before insert on public.asignaciones
  for each row execute function private.fn_validar_estado_inicial('asignaciones');
create trigger trg_asignaciones_a_validar_transicion before update of estado on public.asignaciones
  for each row execute function private.fn_validar_transicion('asignaciones', 'estado');
create trigger trg_asignaciones_m_updated_at before update on public.asignaciones
  for each row execute function private.fn_set_updated_at();
create trigger trg_asignaciones_z_auditar after insert or update or delete on public.asignaciones
  for each row execute function private.fn_auditar('id');

create trigger trg_asignacion_montos_a_congelado before insert or update on public.asignacion_montos
  for each row execute function private.fn_asignacion_montos_congelado();
create trigger trg_asignacion_montos_m_updated_at before update on public.asignacion_montos
  for each row execute function private.fn_set_updated_at();
create trigger trg_asignacion_montos_z_auditar after insert or update or delete on public.asignacion_montos
  for each row execute function private.fn_auditar('asignacion_id');

create trigger trg_descargas_contenido_a_inmutable before update or delete on public.descargas_contenido
  for each row execute function private.fn_solo_insercion();
create trigger trg_descargas_contenido_a_inmutable_truncate before truncate on public.descargas_contenido
  for each statement execute function private.fn_solo_insercion();

-- 6.5 Evidencias y métricas
create trigger trg_publicaciones_a_estado_inicial before insert on public.publicaciones
  for each row execute function private.fn_validar_estado_inicial('publicaciones');
create trigger trg_publicaciones_a_validar_ruta before insert or update of captura_path, miniatura_path on public.publicaciones
  for each row execute function private.fn_validar_ruta_evidencia('publicacion');
create trigger trg_publicaciones_a_validar_transicion before update of estado_validacion on public.publicaciones
  for each row execute function private.fn_validar_transicion('publicaciones', 'estado_validacion');
create trigger trg_publicaciones_b_derivar before insert or update on public.publicaciones
  for each row execute function private.fn_publicaciones_derivar();
create trigger trg_publicaciones_m_updated_at before update on public.publicaciones
  for each row execute function private.fn_set_updated_at();
create trigger trg_publicaciones_z_auditar after insert or update or delete on public.publicaciones
  for each row execute function private.fn_auditar('id');

create trigger trg_metricas_a_derivar before insert on public.metricas
  for each row execute function private.fn_metricas_derivar();
create trigger trg_metricas_a_estado_inicial before insert on public.metricas
  for each row execute function private.fn_validar_estado_inicial('metricas');
create trigger trg_metricas_a_guardar_edicion before update on public.metricas
  for each row execute function private.fn_metricas_guardar_edicion();
create trigger trg_metricas_a_validar_ruta before insert or update of captura_path, miniatura_path on public.metricas
  for each row execute function private.fn_validar_ruta_evidencia('metrica');
create trigger trg_metricas_a_validar_transicion before update of estado_validacion on public.metricas
  for each row execute function private.fn_validar_transicion('metricas', 'estado_validacion');
create trigger trg_metricas_b_alertas before insert or update on public.metricas
  for each row execute function private.fn_metricas_alertas();
create trigger trg_metricas_m_updated_at before update on public.metricas
  for each row execute function private.fn_set_updated_at();
create trigger trg_metricas_z_auditar after insert or update or delete on public.metricas
  for each row execute function private.fn_auditar('id');
create trigger trg_metricas_z_completitud after insert or update on public.metricas
  for each row execute function private.fn_metricas_completitud();

-- 6.6 Finanzas
create trigger trg_dispersiones_a_inmutable before update or delete on public.dispersiones
  for each row execute function private.fn_solo_insercion();
create trigger trg_dispersiones_a_inmutable_truncate before truncate on public.dispersiones
  for each statement execute function private.fn_solo_insercion();
create trigger trg_dispersiones_z_auditar after insert on public.dispersiones
  for each row execute function private.fn_auditar('id');

create trigger trg_liquidaciones_a_estado_inicial before insert on public.liquidaciones
  for each row execute function private.fn_validar_estado_inicial('liquidaciones');
create trigger trg_liquidaciones_a_guardar before update on public.liquidaciones
  for each row execute function private.fn_liquidaciones_guardar();
create trigger trg_liquidaciones_a_validar_transicion before update of estado on public.liquidaciones
  for each row execute function private.fn_validar_transicion('liquidaciones', 'estado');
create trigger trg_liquidaciones_m_updated_at before update on public.liquidaciones
  for each row execute function private.fn_set_updated_at();
create trigger trg_liquidaciones_z_auditar after insert or update or delete on public.liquidaciones
  for each row execute function private.fn_auditar('id');

create trigger trg_documentos_soporte_a_estado_inicial before insert on public.documentos_soporte
  for each row execute function private.fn_validar_estado_inicial('documentos_soporte');
create trigger trg_documentos_soporte_a_validar_transicion before update of estado on public.documentos_soporte
  for each row execute function private.fn_validar_transicion('documentos_soporte', 'estado');
create trigger trg_documentos_soporte_m_updated_at before update on public.documentos_soporte
  for each row execute function private.fn_set_updated_at();
create trigger trg_documentos_soporte_z_auditar after insert or update or delete on public.documentos_soporte
  for each row execute function private.fn_auditar('id');

create trigger trg_facturas_a_estado_inicial before insert on public.facturas
  for each row execute function private.fn_validar_estado_inicial('facturas');
create trigger trg_facturas_a_guardar before update on public.facturas
  for each row execute function private.fn_facturas_guardar();
create trigger trg_facturas_a_validar_transicion before update of estado on public.facturas
  for each row execute function private.fn_validar_transicion('facturas', 'estado');
create trigger trg_facturas_b_derivar before insert on public.facturas
  for each row execute function private.fn_facturas_derivar();
create trigger trg_facturas_m_updated_at before update on public.facturas
  for each row execute function private.fn_set_updated_at();
create trigger trg_facturas_z_auditar after insert or update or delete on public.facturas
  for each row execute function private.fn_auditar('id');

create trigger trg_pagos_anunciante_a_inmutable before update or delete on public.pagos_anunciante
  for each row execute function private.fn_solo_insercion();
create trigger trg_pagos_anunciante_a_inmutable_truncate before truncate on public.pagos_anunciante
  for each statement execute function private.fn_solo_insercion();
create trigger trg_pagos_anunciante_z_auditar after insert on public.pagos_anunciante
  for each row execute function private.fn_auditar('id');

-- 6.7 Disputas
create trigger trg_disputas_a_estado_inicial before insert on public.disputas
  for each row execute function private.fn_validar_estado_inicial('disputas');
create trigger trg_disputas_a_validar_transicion before update of estado on public.disputas
  for each row execute function private.fn_validar_transicion('disputas', 'estado');
create trigger trg_disputas_m_updated_at before update on public.disputas
  for each row execute function private.fn_set_updated_at();
create trigger trg_disputas_z_auditar after insert or update or delete on public.disputas
  for each row execute function private.fn_auditar('id');

create trigger trg_disputa_mensajes_a_inmutable before update or delete on public.disputa_mensajes
  for each row execute function private.fn_solo_insercion();
create trigger trg_disputa_mensajes_a_inmutable_truncate before truncate on public.disputa_mensajes
  for each statement execute function private.fn_solo_insercion();
create trigger trg_disputa_mensajes_b_sellar before insert on public.disputa_mensajes
  for each row execute function private.fn_disputa_mensajes_sellar();

-- 7. Lista blanca de EXECUTE para authenticated en private (se amplía en 7c/7d).
create or replace function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header',
               'modo_carga', 'purga_habilitada',
               'actor_id', 'contexto_confiable', 'mi_rol_id', 'mi_anunciante_id', 'mi_medio_id', 'tiene_permiso',
               'acceso_valido', 'config_entero', 'config_decimal', 'config_texto', 'config_booleano', 'config_lista',
               'cuenta_vigente', 'anunciante_ve_medio',
               'hay_cambios', 'estados_con_cupo', 'consume_cupo', 'oferta_visible_para_mi', 'tengo_asignacion_en',
               'tengo_asignacion_activa_en', 'puedo_descargar_creativos_de', 'puedo_ver_asignacion',
               'puedo_cargar_metricas', 'calcular_precio', 'registrar_vista_oferta', 'estimar_oferta_agregado']::text[] $$;

-- 8. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not has_function_privilege('authenticated', 'private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)', 'execute')
     and not has_function_privilege('service_role', 'private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)', 'execute')
     and not has_function_privilege('service_role', 'private.reservar_cupo(uuid, uuid, uuid, uuid, uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.medio_elegible(uuid, uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.medio_ve_anunciante(uuid)', 'execute'),
         'EXECUTE indebido sobre procedimientos privilegiados';
  -- Todo trigger invoker de estas tablas solo llama funciones con EXECUTE para los roles de la API.
  assert has_function_privilege('authenticated', 'private.hay_cambios(jsonb, jsonb, text[])', 'execute')
     and has_function_privilege('service_role', 'private.hay_cambios(jsonb, jsonb, text[])', 'execute'),
         'hay_cambios necesita EXECUTE para los roles de la API';
end $$;
