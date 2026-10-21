-- Migración 7f · negocio_transacciones_ajustes (docs/modelo-datos.md §4.2, §5.2)
-- Correcciones detectadas por las pruebas de humo de M7 (no se editan migraciones aplicadas):
-- 1. private.aplicar_transicion: los fragmentos SET en dollar-quoting se concatenaban al arreglo sin tipo
--    (`text[] || unknown` se resolvía como arreglo || arreglo → 22P02); ahora se convierten a text.
-- 2. private.validar_condicion_transicion: faltaba la condición de §4.2 «metricas PENDIENTE → APROBADA: la
--    publicación está APROBADA» (una métrica sobre una evidencia pendiente o rechazada no se aprueba).

create or replace function private.aplicar_transicion(p_entidad text, p_id uuid, p_hacia text, p_actor_tipo public.transicion_actor,
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
        v_sets := v_sets || ($s$nivel_verificacion = ($4 ->> 'nivel')::smallint$s$)::text;
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
        v_sets := v_sets || ($s$seguidores_verificados = coalesce(($4 ->> 'seguidores_verificados')::integer, seguidores_verificados, seguidores_reportados)$s$)::text;
      end if;
    when 'ofertas' then
      if v_datos ? 'comentario_moderacion' or p_hacia = 'DEVUELTA' then
        v_sets := v_sets || ($s$comentario_moderacion = coalesce($4 ->> 'comentario_moderacion', $3, comentario_moderacion)$s$)::text;
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
        v_sets := v_sets || ($s$causa_cancelacion = ($4 ->> 'causa')::public.cancelacion_causa$s$)::text;
      end if;
    when 'publicaciones' then
      if p_hacia in ('APROBADA', 'RECHAZADA') then
        v_sets := v_sets || array['validada_por = $5', $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$];
      end if;
      if p_hacia = 'APROBADA' then
        v_sets := v_sets || ($s$etiqueta_verificada = coalesce(($4 ->> 'etiqueta_verificada')::boolean, etiqueta_verificada)$s$)::text;
      end if;
    when 'metricas' then
      if p_hacia in ('APROBADA', 'RECHAZADA') then v_sets := v_sets || 'validada_por = $5'::text; end if;
      v_sets := v_sets || ($s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$)::text;
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
          v_sets := v_sets || ($s$fecha_vencimiento = coalesce(($4 ->> 'fecha_vencimiento')::date, fecha_vencimiento)$s$)::text;
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

create or replace function private.validar_condicion_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text,
                                                     p_actor_tipo public.transicion_actor, p_actor_id uuid,
                                                     p_motivo text, p_datos jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_clave text := p_entidad || ':' || p_desde || '→' || p_hacia; r record; v_dest text; v_previo text;
begin
  case
    when v_clave = 'medios:PENDIENTE→VERIFICADO' then
      perform private.validar_verificacion_medio(p_id, (p_datos ->> 'nivel')::smallint, true);
    when v_clave = 'medios:VERIFICADO→VERIFICADO' then
      if (p_datos ->> 'nivel')::smallint is not distinct from (select m.nivel_verificacion from public.medios m where m.id = p_id) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Indica un nivel distinto del actual.';
      end if;
      perform private.validar_verificacion_medio(p_id, (p_datos ->> 'nivel')::smallint, false);
    when v_clave = 'verificaciones_cuenta:PENDIENTE→APROBADA' then
      select v.metodo, v.captura_path, v.codigo_expira_at, v.updated_at into r
      from public.verificaciones_cuenta v where v.id = p_id;
      if r.metodo <> 'API' and r.captura_path is null then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Falta la captura de la verificación.';
      end if;
      if r.metodo = 'CODIGO_HISTORIA' and r.updated_at > r.codigo_expira_at then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La captura se cargó después de que venció el código temporal.';
      end if;
      if coalesce((p_datos ->> 'seguidores_verificados')::integer, 0) < 0 then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Seguidores verificados inválidos.';
      end if;
    when v_clave = 'campanas:BORRADOR→ACTIVA' and p_actor_tipo = 'ANUNCIANTE' then
      if not exists (select 1 from public.campanas c join public.anunciantes a on a.id = c.anunciante_id
                     where c.id = p_id and a.estado_verificacion = 'VERIFICADO') then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Tu empresa debe estar verificada para activar campañas.';
      end if;
    when v_clave = 'campanas:ACTIVA→CANCELADA' then
      if exists (select 1 from public.asignaciones a where a.campana_id = p_id
                   and private.consume_cupo(a.estado, a.estado_previo_disputa)) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La campaña tiene asignaciones en curso: no se puede cancelar.';
      end if;
    when v_clave = 'campanas:ACTIVA→FINALIZADA' then
      if exists (select 1 from public.ofertas o where o.campana_id = p_id and o.estado not in ('CERRADA', 'CANCELADA')) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Todas las ofertas de la campaña deben estar cerradas o canceladas.';
      end if;
    when v_clave in ('ofertas:BORRADOR→EN_REVISION', 'ofertas:DEVUELTA→EN_REVISION') then
      perform private.validar_envio_oferta(p_id, false);
    when v_clave = 'ofertas:EN_REVISION→PUBLICADA' then
      perform private.validar_envio_oferta(p_id, true);
    when v_clave = 'ofertas:PUBLICADA→CANCELADA' then
      if exists (select 1 from public.asignaciones a where a.oferta_id = p_id
                   and private.consume_cupo(a.estado, a.estado_previo_disputa)) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La oferta ya tiene asignaciones: no se puede cancelar.';
      end if;
    when v_clave = 'asignaciones:ACEPTADA→RECHAZADA' then
      if exists (select 1 from public.asignaciones a join public.ofertas o on o.id = a.oferta_id
                 where a.id = p_id and (a.contenido_descargado_at is not null or private.ahora() >= o.fecha_limite_aceptacion)) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Ya no puedes desistir de esta asignación.';
      end if;
    when v_clave = 'asignaciones:PUBLICADA→EVIDENCIA_VALIDADA' then
      if (select count(*) from public.publicaciones p
          where p.asignacion_id = p_id and p.estado_validacion = 'APROBADA' and p.etiqueta_verificada)
         < (select a.publicaciones from public.asignaciones a where a.id = p_id) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Todas las publicaciones deben estar aprobadas con la etiqueta de publicidad verificada.';
      end if;
    when v_clave = 'asignaciones:METRICAS_CARGADAS→VERIFICADA' then
      perform private.validar_verificacion_asignacion(p_id, p_motivo, p_datos);
    when p_entidad = 'asignaciones' and p_desde = 'EN_DISPUTA' then
      select a.estado_previo_disputa::text into v_previo from public.asignaciones a where a.id = p_id;
      if not (p_hacia = v_previo or p_hacia = 'CANCELADA'
              or (p_hacia = 'VERIFICADA' and v_previo = 'METRICAS_CARGADAS')
              or (p_hacia = 'CONTENIDO_ENTREGADO' and v_previo = 'VENCIDA_SIN_PUBLICAR')) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La resolución no es válida para el estado previo de la asignación.', hint = coalesce(v_previo, 'null') || '→' || p_hacia;
      end if;
      if p_hacia = 'VERIFICADA' and v_previo = 'METRICAS_CARGADAS' then
        if not private.tiene_permiso_de(p_actor_id, 'metricas.validar') then
          raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Verificar exige además validar métricas.';
        end if;
        perform private.validar_verificacion_asignacion(p_id, p_motivo, p_datos);
      end if;
      if p_hacia = 'CANCELADA' and nullif(p_datos ->> 'causa', '') is null then
        raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica la causa de la cancelación.';
      end if;
    when v_clave = 'liquidaciones:BORRADOR→APROBADA' then
      select l.creada_por, l.alerta_seg_social into r from public.liquidaciones l where l.id = p_id;
      if r.creada_por = p_actor_id
         and not exists (select 1 from public.perfiles p join public.roles ro on ro.id = p.rol_id
                         where p.id = p_actor_id and ro.clave = 'SUPERADMIN') then
        raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
          detail = 'Quien genera una liquidación no puede aprobarla.';
      end if;
      if r.alerta_seg_social and private.config_texto('tributario.politica_seg_social') = 'BLOQUEAR' then
        raise exception using errcode = 'P0001', message = 'AMO_SEG_SOCIAL_PENDIENTE',
          detail = 'El medio supera el umbral mensual y no tiene la seguridad social aprobada.';
      end if;
    when v_clave = 'liquidaciones:APROBADA→PAGADA' then
      select l.soporte_pago_path, l.fecha_pago, l.requiere_documento_soporte, l.numero_factura_medio, l.factura_medio_path
        into r from public.liquidaciones l where l.id = p_id;
      if coalesce(p_datos ->> 'soporte_pago_path', r.soporte_pago_path) is null
         or coalesce(p_datos ->> 'fecha_pago', r.fecha_pago::text) is null then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Registra la fecha y el soporte del pago.';
      end if;
      if r.requiere_documento_soporte then
        if not exists (select 1 from public.documentos_soporte d where d.liquidacion_id = p_id and d.estado = 'EMITIDO') then
          raise exception using errcode = 'P0001', message = 'AMO_DOCUMENTO_SOPORTE_REQUERIDO',
            detail = 'Emite el documento soporte antes de registrar el pago.';
        end if;
      elsif r.numero_factura_medio is null or r.factura_medio_path is null then
        raise exception using errcode = 'P0001', message = 'AMO_DOCUMENTO_SOPORTE_REQUERIDO',
          detail = 'Registra el número y el archivo de la factura del medio.';
      end if;
    when v_clave = 'facturas:EMITIDA→ANULADA' then
      if exists (select 1 from public.facturas f where f.id = p_id and f.pagado > 0)
         or exists (select 1 from public.pagos_anunciante g where g.factura_id = p_id) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La factura tiene pagos registrados: no se puede anular.';
      end if;
    when v_clave = 'metricas:PENDIENTE→APROBADA' then
      if not exists (select 1 from public.metricas m join public.publicaciones p on p.id = m.publicacion_id
                     where m.id = p_id and p.estado_validacion = 'APROBADA') then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La evidencia de la publicación debe estar aprobada antes de aprobar sus métricas.';
      end if;
    when p_entidad = 'disputas' and p_hacia in ('RESUELTA', 'DESCARTADA') then
      select a.id, a.estado, a.estado_previo_disputa into r
      from public.disputas d join public.asignaciones a on a.id = d.asignacion_id where d.id = p_id;
      if r.estado is distinct from 'EN_DISPUTA' then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La asignación no está en disputa.';
      end if;
      v_dest := case when p_hacia = 'RESUELTA' then p_datos ->> 'estado_asignacion_resultante' else r.estado_previo_disputa::text end;
      if v_dest is null or not exists (select 1 from private.transiciones_estado t
                                       where t.entidad = 'asignaciones' and t.desde = 'EN_DISPUTA' and t.hacia = v_dest
                                         and t.actor = 'ADMIN') then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Indica un estado resultante válido para la asignación.';
      end if;
      perform private.validar_condicion_transicion('asignaciones', r.id, 'EN_DISPUTA', v_dest, 'ADMIN', p_actor_id, p_motivo, p_datos);
    else
      null;
  end case;
end $$;
revoke all on function private.validar_condicion_transicion(text, uuid, text, text, public.transicion_actor, uuid, text, jsonb)
  from public, anon, authenticated;

-- Verificación
do $$ begin
  assert not has_function_privilege('authenticated', 'private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)', 'execute')
     and not has_function_privilege('service_role', 'private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)', 'execute')
     and not has_function_privilege('authenticated', 'private.validar_condicion_transicion(text, uuid, text, text, public.transicion_actor, uuid, text, jsonb)', 'execute'),
         'EXECUTE indebido sobre el núcleo de transiciones';
end $$;
