-- Migración 7c · negocio_transacciones_transiciones (docs/modelo-datos.md §2.4, §4.2, §5.2, §5.4, §5.7)
-- Camino único de las transiciones humanas: bloqueos canónicos, condición adicional de §4.2 y efectos encadenados.
-- Redefine (create or replace, misma firma) public.transicionar_srv —conserva las reglas de perfiles: nadie cambia el
-- estado de su propia cuenta, permiso, anti-escalada (puede_gestionar) y motivo— y public.activar_perfil_srv (vía
-- aplicar_transicion). Adjunta el trigger a_validar_transicion de perfiles (desde aquí el estado de un perfil solo
-- cambia por estas dos RPC). Procedimientos del medio: reservar_cupo_srv (solo service_role; prueba de carrera),
-- rechazar_oferta_srv, registrar_vista_oferta, registrar_descarga_srv, registrar_evidencia_srv y abrir_disputa_srv.

-- 1. Bloqueos canónicos (§5.7): campañas → ofertas → oferta_cupos (franja) → medio (advisory, solo si la transición
--    puede volver a consumir cupo) → asignación; campaña → sus ofertas por id; liquidación → sus asignaciones por id.
--    Devuelve el estado actual leído con la fila bloqueada.
create function private.bloquear_transicion(p_entidad text, p_id uuid, p_hacia text, p_datos jsonb default '{}')
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_col text := private.columna_estado(p_entidad);
  v_asig uuid; v_campana uuid; v_oferta uuid; v_franja uuid; v_medio uuid; v_estado text;
begin
  if v_col is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Esta entidad no tiene estados.',
      hint = coalesce(p_entidad, 'null');
  end if;
  if p_entidad in ('asignaciones', 'disputas') then
    if p_entidad = 'asignaciones' then
      v_asig := p_id;
    else
      select d.asignacion_id into v_asig from public.disputas d where d.id = p_id;
    end if;
    select a.campana_id, a.oferta_id, a.franja_id, a.medio_id into v_campana, v_oferta, v_franja, v_medio
    from public.asignaciones a where a.id = v_asig;
    if v_campana is not null then
      perform 1 from public.campanas x where x.id = v_campana for update;
      perform 1 from public.ofertas x where x.id = v_oferta for update;
      if v_franja is not null then
        perform 1 from public.oferta_cupos x where x.oferta_id = v_oferta and x.franja_id = v_franja for update;
      end if;
      if (p_entidad = 'asignaciones' and p_hacia = 'CONTENIDO_ENTREGADO')
         or (p_entidad = 'disputas' and p_hacia = 'RESUELTA'
             and coalesce(p_datos, '{}') ->> 'estado_asignacion_resultante' = 'CONTENIDO_ENTREGADO') then
        perform pg_advisory_xact_lock(hashtextextended('amo.medio:' || v_medio::text, 0));
      end if;
      perform 1 from public.asignaciones x where x.id = v_asig for update;
    end if;
  elsif p_entidad = 'ofertas' then
    select o.campana_id into v_campana from public.ofertas o where o.id = p_id;
    perform 1 from public.campanas x where x.id = v_campana for update;
  elsif p_entidad = 'campanas' then
    perform 1 from public.campanas x where x.id = p_id for update;
    perform 1 from public.ofertas o where o.campana_id = p_id order by o.id for update;
  elsif p_entidad = 'liquidaciones' then
    perform 1 from public.liquidaciones x where x.id = p_id for update;
    perform 1 from public.asignaciones a where a.liquidacion_id = p_id order by a.id for update;
  end if;
  execute format('select t.%I::text from public.%I t where t.id = $1 for update', v_col, p_entidad) into v_estado using p_id;
  if v_estado is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El registro no existe.',
      hint = p_entidad || ':' || coalesce(p_id::text, 'null');
  end if;
  return v_estado;
end $$;
revoke all on function private.bloquear_transicion(text, uuid, text, jsonb) from public, anon, authenticated;

-- 2. Condiciones adicionales de §4.2

-- Condiciones de envío de una oferta (BORRADOR/DEVUELTA → EN_REVISION) y su revalidación al publicar. Recalcula
-- cupos_totales con la oferta bloqueada (congela el valor que se revisa).
create function private.validar_envio_oferta(p_oferta_id uuid, p_publicar boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.ofertas; c public.campanas; v_anunciante public.anunciante_estado; v_otros numeric; v_minimo integer;
  v_falla text;
begin
  update public.ofertas x
     set cupos_totales = (select coalesce(sum(oc.cupos_totales), 0) from public.oferta_cupos oc where oc.oferta_id = x.id)
   where x.id = p_oferta_id
  returning * into o;
  select * into c from public.campanas x where x.id = o.campana_id;
  select a.estado_verificacion into v_anunciante from public.anunciantes a where a.id = o.anunciante_id;
  v_minimo := private.config_entero('ofertas.minimo_medios');
  v_falla := case
    when o.deleted_at is not null then 'La oferta está archivada.'
    when c.estado <> 'ACTIVA' or c.deleted_at is not null then 'La campaña debe estar activa.'
    when v_anunciante is distinct from 'VERIFICADO' then 'El anunciante debe estar verificado.'
    when not exists (select 1 from public.oferta_cupos oc where oc.oferta_id = o.id) or o.cupos_totales < v_minimo
      then format('Define al menos %s cupos.', v_minimo)
    when not exists (select 1 from public.creativos cr where cr.oferta_id = o.id and cr.vigente
                       and exists (select 1 from public.creativo_archivos f where f.creativo_id = cr.id))
      then 'Carga el creativo con al menos un archivo.'
    when o.ventana_inicio < private.inicio_dia(c.fecha_inicio) or o.ventana_fin > private.inicio_dia(c.fecha_fin + 1)
      then 'La ventana de publicación debe quedar dentro de las fechas de la campaña.'
    when not p_publicar and o.fecha_limite_aceptacion
         < private.ahora() + make_interval(hours => private.config_entero('ofertas.anticipacion_minima_horas'))
      then 'La fecha límite de aceptación está demasiado cerca.'
    when p_publicar and private.ahora() >= o.fecha_limite_aceptacion then 'La fecha límite de aceptación ya pasó.'
    when not exists (select 1 from public.formatos f where f.id = o.formato_id and f.activo) then 'El formato no está disponible.'
    when exists (select 1 from unnest(o.departamentos_objetivo) x(codigo)
                 where not exists (select 1 from public.departamentos d where d.codigo = x.codigo and d.activo))
      or exists (select 1 from unnest(o.municipios_objetivo) x(codigo)
                 where not exists (select 1 from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                                   where m.codigo = x.codigo and m.activo and d.activo))
      or exists (select 1 from unnest(o.categorias_objetivo) x(id)
                 where not exists (select 1 from public.categorias k where k.id = x.id and k.activo and k.deleted_at is null))
      then 'La segmentación incluye zonas o categorías que no están habilitadas.'
  end;
  if v_falla is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = v_falla, hint = 'envio_oferta';
  end if;
  select coalesce(sum(x.presupuesto_maximo), 0) into v_otros from public.ofertas x
  where x.campana_id = o.campana_id and x.id <> o.id and x.estado <> 'CANCELADA' and x.deleted_at is null;
  if o.presupuesto_maximo > c.presupuesto_total - v_otros then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA',
      detail = 'El presupuesto de la oferta supera lo que queda disponible en la campaña.';
  end if;
end $$;
revoke all on function private.validar_envio_oferta(uuid, boolean) from public, anon, authenticated;

-- Documentos del nivel APROBADOS y vigentes + certificado del medio de pago declarado (§3.4); cuenta vigente al verificar.
create function private.validar_verificacion_medio(p_medio_id uuid, p_nivel smallint, p_exigir_cuenta boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_docs public.documento_medio_tipo[]; v_metodo public.metodo_pago; v_faltan text[];
begin
  if p_nivel is null or p_nivel not between 1 and 3 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Indica un nivel de verificación válido (1, 2 o 3).';
  end if;
  select nv.documentos_requeridos into v_docs from public.niveles_verificacion nv where nv.nivel = p_nivel;
  select mp.metodo_pago into v_metodo from public.medios_privado mp where mp.medio_id = p_medio_id;
  if v_metodo = 'BANCARIO' then
    v_docs := v_docs || 'CERT_BANCARIA'::public.documento_medio_tipo;
  elsif v_metodo = 'BILLETERA' then
    v_docs := v_docs || 'CERT_BILLETERA'::public.documento_medio_tipo;
  end if;
  select coalesce(array_agg(x.tipo::text order by x.tipo), '{}') into v_faltan from unnest(v_docs) as x(tipo)
  where not exists (select 1 from public.documentos_medio d
                    where d.medio_id = p_medio_id and d.tipo = x.tipo and d.estado_validacion = 'APROBADO'
                      and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy()));
  if v_metodo is null then v_faltan := v_faltan || 'CERT_BANCARIA o CERT_BILLETERA (medio de pago)'::text; end if;
  if cardinality(v_faltan) > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Faltan documentos aprobados y vigentes: ' || array_to_string(v_faltan, ', ') || '.';
  end if;
  if p_exigir_cuenta and not exists (select 1 from public.cuentas_sociales c
                                     where c.medio_id = p_medio_id and private.cuenta_vigente(c.id)) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El medio necesita al menos una cuenta social verificada y vigente.';
  end if;
end $$;
revoke all on function private.validar_verificacion_medio(uuid, smallint, boolean) from public, anon, authenticated;

-- Puerta a pago (§6.2): todas las métricas requeridas APROBADA y permanencia cumplida (o constancia manual con motivo).
create function private.validar_verificacion_asignacion(p_asignacion_id uuid, p_motivo text, p_datos jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare a public.asignaciones; v_cortes public.corte_metrica[];
begin
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  select o.cortes_requeridos into v_cortes from public.ofertas o where o.id = a.oferta_id;
  if (select count(*) from public.publicaciones p where p.asignacion_id = a.id) < a.publicaciones
     or exists (select 1 from public.publicaciones p cross join unnest(v_cortes) k(corte)
                where p.asignacion_id = a.id
                  and not exists (select 1 from public.metricas m
                                  where m.publicacion_id = p.id and m.corte = k.corte and m.estado_validacion = 'APROBADA')) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Todas las métricas requeridas deben estar aprobadas.';
  end if;
  if exists (select 1 from public.publicaciones p
             where p.asignacion_id = a.id and p.permanencia_verificada_at is null and private.ahora() < p.permanencia_hasta)
     and not (coalesce((p_datos ->> 'permanencia_verificada')::boolean, false) and nullif(btrim(p_motivo), '') is not null) then
    raise exception using errcode = 'P0001', message = 'AMO_PERMANENCIA_PENDIENTE',
      detail = 'Aún no se cumple la permanencia mínima de la publicación.';
  end if;
end $$;
revoke all on function private.validar_verificacion_asignacion(uuid, text, jsonb) from public, anon, authenticated;

-- Condición adicional de cada fila de §4.2 (con las filas ya bloqueadas).
create function private.validar_condicion_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text,
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

-- 3. Aplicación con efectos encadenados (§5.2 pasos 5–6), con los bloqueos ya tomados.
create function private.ejecutar_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text,
                                            p_actor_tipo public.transicion_actor, p_actor_id uuid, p_motivo text,
                                            p_datos jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_datos jsonb := coalesce(p_datos, '{}');
  v_previo public.asignacion_estado;
  v_desde_cupo boolean;
  v_hacia_cupo boolean;
  v_res jsonb;
  r record;
  v_asig uuid;
  v_dest text;
begin
  if p_entidad = 'asignaciones' then
    select a.estado_previo_disputa into v_previo from public.asignaciones a where a.id = p_id;
    v_desde_cupo := private.consume_cupo(p_desde::public.asignacion_estado, v_previo);
    v_hacia_cupo := private.consume_cupo(p_hacia::public.asignacion_estado,
                                         case when p_hacia = 'EN_DISPUTA' then p_desde::public.asignacion_estado end);
    if not v_desde_cupo and v_hacia_cupo then
      perform private.reconsumir_cupo(p_id);          -- reapertura de una vencida: antes de aplicar (§5.2 paso 6)
    end if;
  elsif p_entidad = 'disputas' then
    select d.asignacion_id, a.estado_previo_disputa into v_asig, v_previo
    from public.disputas d join public.asignaciones a on a.id = d.asignacion_id where d.id = p_id;
    if p_hacia = 'DESCARTADA' then
      v_datos := v_datos || jsonb_build_object('estado_asignacion_resultante', v_previo);
    end if;
  end if;

  v_res := private.aplicar_transicion(p_entidad, p_id, p_hacia, p_actor_tipo, p_actor_id, p_motivo, v_datos);

  if p_entidad = 'asignaciones' then
    if v_desde_cupo and not v_hacia_cupo then
      perform private.liberar_cupo_efecto(p_id);
    end if;
    if p_desde = 'PUBLICADA' and p_hacia = 'EVIDENCIA_VALIDADA' then
      perform private.evaluar_metricas_cargadas(p_id);
    end if;
    if p_hacia = 'VERIFICADA' and (p_desde = 'METRICAS_CARGADAS' or v_previo = 'METRICAS_CARGADAS') then
      update public.publicaciones p set permanencia_verificada_at = coalesce(p.permanencia_verificada_at, private.ahora())
      where p.asignacion_id = p_id;
    end if;
  elsif p_entidad = 'campanas' and p_hacia = 'CANCELADA' then
    for r in select o.id from public.ofertas o
             where o.campana_id = p_id and o.estado in ('BORRADOR', 'EN_REVISION', 'DEVUELTA', 'PUBLICADA') order by o.id loop
      perform private.aplicar_transicion('ofertas', r.id, 'CANCELADA', 'SISTEMA', null,
                                         coalesce(p_motivo, 'Cancelación de la campaña'));
    end loop;
  elsif p_entidad = 'liquidaciones' and p_hacia = 'PAGADA' then
    for r in select a.id from public.asignaciones a where a.liquidacion_id = p_id and a.estado = 'LIQUIDADA' order by a.id loop
      perform private.aplicar_transicion('asignaciones', r.id, 'PAGADA', 'ADMIN', p_actor_id);
    end loop;
  elsif p_entidad = 'liquidaciones' and p_hacia = 'ANULADA' then
    for r in select a.id from public.asignaciones a where a.liquidacion_id = p_id order by a.id loop
      perform private.aplicar_transicion('asignaciones', r.id, 'VERIFICADA', 'ADMIN', p_actor_id,
                                         coalesce(p_motivo, 'Anulación de la liquidación'));
      update public.asignaciones a set liquidacion_id = null where a.id = r.id;
      update public.asignacion_montos m set retenciones_aplicadas = null, monto_retenciones = null, monto_neto = null
      where m.asignacion_id = r.id;
    end loop;
    for r in select d.id from public.documentos_soporte d
             where d.liquidacion_id = p_id and d.estado in ('BORRADOR', 'EMITIDO') order by d.id loop
      perform private.aplicar_transicion('documentos_soporte', r.id, 'ANULADO', 'SISTEMA', null,
                                         coalesce(p_motivo, 'Anulación de la liquidación'));
    end loop;
  elsif p_entidad = 'disputas' and p_hacia in ('RESUELTA', 'DESCARTADA') then
    v_dest := case when p_hacia = 'RESUELTA' then v_datos ->> 'estado_asignacion_resultante' else v_previo::text end;
    perform private.ejecutar_transicion('asignaciones', v_asig, 'EN_DISPUTA', v_dest, 'ADMIN', p_actor_id, p_motivo, v_datos);
  end if;
  return v_res;
end $$;
revoke all on function private.ejecutar_transicion(text, uuid, text, text, public.transicion_actor, uuid, text, jsonb)
  from public, anon, authenticated;

-- 4. RPC de transición (redefinición del provisional de usuarios_gestion, misma firma y retorno).
create or replace function public.transicionar_srv(
  p_entidad text, p_id uuid, p_hacia text, p_actor_id uuid, p_session_id uuid,
  p_motivo text default null, p_datos jsonb default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo;
  v_actor public.transicion_actor;
  v_desde text;
  v_clave text;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_datos jsonb := coalesce(p_datos, '{}');
  t private.transiciones_estado;
begin
  -- Un error del servidor no escala a SISTEMA: sin actor humano no hay transición (§5.2).
  if p_actor_id is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);
  if v_tipo is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if private.columna_estado(p_entidad) is null or jsonb_typeof(v_datos) <> 'object' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Esta transición no está disponible.', hint = coalesce(p_entidad, 'null');
  end if;
  v_actor := v_tipo::text::public.transicion_actor;
  perform set_config('lock_timeout', '3s', true);

  v_desde := private.bloquear_transicion(p_entidad, p_id, p_hacia, v_datos);
  select * into t from private.transiciones_estado x
  where x.entidad = p_entidad and x.desde = v_desde and x.hacia = p_hacia and x.actor = v_actor;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El registro no puede pasar a ese estado desde el actual.',
      hint = p_entidad || ':' || v_desde || '→' || coalesce(p_hacia, 'null');
  end if;
  v_clave := p_entidad || ':' || v_desde || '→' || p_hacia;
  -- Transiciones que registran algo más que el estado: solo por su procedimiento o como efecto encadenado.
  if v_clave = any (array['asignaciones:ACEPTADA→CONTENIDO_ENTREGADO', 'asignaciones:CONTENIDO_ENTREGADO→PUBLICADA',
                          'asignaciones:VERIFICADA→LIQUIDADA', 'asignaciones:LIQUIDADA→VERIFICADA',
                          'asignaciones:LIQUIDADA→PAGADA', 'publicaciones:RECHAZADA→PENDIENTE',
                          'metricas:RECHAZADA→PENDIENTE', 'facturas:BORRADOR→EMITIDA', 'documentos_soporte:BORRADOR→EMITIDO'])
     or (p_entidad = 'asignaciones' and (p_hacia = 'EN_DISPUTA' or v_desde = 'EN_DISPUTA')) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Esta transición se hace con su acción específica.', hint = v_clave;
  end if;
  if p_entidad = 'perfiles' and p_id = p_actor_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'No puedes cambiar el estado de tu propia cuenta.';
  end if;
  if t.permiso is not null and not private.tiene_permiso_de(p_actor_id, t.permiso) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if v_tipo <> 'ADMIN' then
    perform private.verificar_propiedad(p_entidad, p_id, p_actor_id, v_tipo);
  end if;
  if v_tipo = 'ADMIN' and p_entidad = 'perfiles'
     and not private.puede_gestionar(p_actor_id, p_id, (select p.rol_id from public.perfiles p where p.id = p_id)) then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes gestionar a un usuario con permisos que no tienes.';
  end if;
  if t.requiere_motivo and v_motivo is null then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica el motivo del cambio.';
  end if;
  perform private.validar_condicion_transicion(p_entidad, p_id, v_desde, p_hacia, v_actor, p_actor_id, v_motivo, v_datos);
  return private.ejecutar_transicion(p_entidad, p_id, v_desde, p_hacia, v_actor, p_actor_id, v_motivo, v_datos);
end $$;
revoke all on function public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb) to service_role;

-- Activación tras verifyOtp del enlace de invitación: INVITADO → ACTIVO (SISTEMA) vía aplicar_transicion. Idempotente.
create or replace function public.activar_perfil_srv(p_usuario_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_estado public.perfil_estado;
begin
  if not exists (select 1 from auth.users u where u.id = p_usuario_id and u.email_confirmed_at is not null) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La invitación todavía no se ha confirmado.';
  end if;
  select p.estado into v_estado from public.perfiles p
  where p.id = p_usuario_id and p.rol_id is not null and p.deleted_at is null
  for update;
  if v_estado is distinct from 'INVITADO' then return; end if;
  perform private.aplicar_transicion('perfiles', p_usuario_id, 'ACTIVO', 'SISTEMA', null);
end $$;
revoke all on function public.activar_perfil_srv(uuid) from public, anon, authenticated;
grant execute on function public.activar_perfil_srv(uuid) to service_role;

-- Desde aquí el estado de un perfil solo cambia por transicionar_srv / activar_perfil_srv (o modo_carga).
create trigger trg_perfiles_a_validar_transicion before update of estado on public.perfiles
  for each row execute function private.fn_validar_transicion('perfiles', 'estado');

-- 5. Procedimientos del medio

-- Aceptar (Server Action «Aceptar» y prueba de carrera scripts/pruebas/carrera-cupos.ts): mismo contrato que
-- private.reservar_cupo; EXECUTE solo service_role.
create function public.reservar_cupo_srv(p_oferta_id uuid, p_medio_id uuid, p_cuenta_social_id uuid, p_actor_id uuid,
                                         p_session_id uuid, p_clave_idempotencia uuid default null)
returns table (asignacion_id uuid, monto_bruto numeric, monto_medio numeric, franja_clave text, cupos_restantes_franja integer)
language sql volatile security definer set search_path = '' as $$
  select * from private.reservar_cupo(p_oferta_id, p_medio_id, p_cuenta_social_id, p_actor_id, p_session_id,
                                      p_clave_idempotencia) $$;
revoke all on function public.reservar_cupo_srv(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reservar_cupo_srv(uuid, uuid, uuid, uuid, uuid, uuid) to service_role;

-- Rechazar desde el marketplace (RECHAZADA sin precio; idempotente) o desistir de una aceptación sin descarga
-- (camino completo de transicionar_srv, que libera el cupo). El medio se deriva del actor.
create function public.rechazar_oferta_srv(p_oferta_id uuid, p_actor_id uuid, p_session_id uuid, p_motivo text default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; v_medio uuid; v_campana uuid; v_asig uuid; o public.ofertas; v_demo boolean;
begin
  v_tipo := private.validar_actor(p_actor_id, 'ofertas.aceptar', p_session_id);
  select p.medio_id into v_medio from public.perfiles p where p.id = p_actor_id;
  if v_tipo is distinct from 'MEDIO' or v_medio is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  select x.campana_id into v_campana from public.ofertas x where x.id = p_oferta_id;
  if v_campana is null then
    raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE', detail = 'La oferta no está disponible.';
  end if;
  select c.es_demo into v_demo from public.campanas c where c.id = v_campana for update;
  select * into o from public.ofertas x where x.id = p_oferta_id for update;

  select a.id into v_asig from public.asignaciones a
  where a.oferta_id = p_oferta_id and a.medio_id = v_medio and a.estado = 'ACEPTADA' and a.contenido_descargado_at is null
  order by a.aceptada_at desc limit 1;
  if v_asig is not null then
    perform public.transicionar_srv('asignaciones', v_asig, 'RECHAZADA', p_actor_id, p_session_id, p_motivo, '{}');
    return v_asig;
  end if;
  if exists (select 1 from public.asignaciones a where a.oferta_id = p_oferta_id and a.medio_id = v_medio
               and private.consume_cupo(a.estado, a.estado_previo_disputa)) then
    raise exception using errcode = 'P0001', message = 'AMO_YA_ACEPTADA',
      detail = 'Ya aceptaste esta oferta y descargaste el contenido.';
  end if;
  if not private.oferta_visible_para(p_oferta_id, v_medio) then
    raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE', detail = 'La oferta no está disponible.';
  end if;
  insert into public.asignaciones as a (oferta_id, campana_id, anunciante_id, medio_id, plataforma, estado, rechazada_at,
                                        motivo, es_demo)
  values (o.id, o.campana_id, o.anunciante_id, v_medio, o.plataforma, 'RECHAZADA', private.ahora(),
          nullif(btrim(p_motivo), ''), v_demo)
  on conflict (oferta_id, medio_id) where estado = 'RECHAZADA' and aceptada_at is null do nothing
  returning a.id into v_asig;
  if v_asig is null then
    select a.id into v_asig from public.asignaciones a
    where a.oferta_id = p_oferta_id and a.medio_id = v_medio and a.estado = 'RECHAZADA' and a.aceptada_at is null;
  end if;
  return v_asig;
end $$;
revoke all on function public.rechazar_oferta_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rechazar_oferta_srv(uuid, uuid, uuid, text) to service_role;

-- Vista de una oferta (denominador de la tasa de aceptación): el medio la registra con su propio JWT.
create function private.registrar_vista_oferta(p_oferta_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_medio uuid := private.mi_medio_id();
begin
  if not private.acceso_valido() or v_medio is null or not private.tiene_permiso('ofertas.marketplace') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if not (private.oferta_visible_para(p_oferta_id, v_medio)
          or exists (select 1 from public.asignaciones a where a.oferta_id = p_oferta_id and a.medio_id = v_medio)) then
    raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE', detail = 'La oferta no está disponible.';
  end if;
  insert into public.oferta_vistas as v (oferta_id, medio_id) values (p_oferta_id, v_medio)
  on conflict (oferta_id, medio_id) do update set ultima_vista_at = private.ahora(), veces = v.veces + 1;
end $$;
revoke all on function private.registrar_vista_oferta(uuid) from public, anon, authenticated;
grant execute on function private.registrar_vista_oferta(uuid) to authenticated, service_role;

create function public.registrar_vista_oferta(p_oferta_id uuid) returns void
language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform private.registrar_vista_oferta(p_oferta_id);
end $$;
revoke all on function public.registrar_vista_oferta(uuid) from public, anon, authenticated;
grant execute on function public.registrar_vista_oferta(uuid) to authenticated;

-- Descarga del creativo vigente (§7.1.4, D11): registra la descarga y, la primera vez, ACEPTADA → CONTENIDO_ENTREGADO.
-- Devuelve el paquete creativo y sus rutas (la app las firma con el cliente del usuario y registra URL_FIRMADA).
create function public.registrar_descarga_srv(p_asignacion_id uuid, p_actor_id uuid, p_session_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; a public.asignaciones; cr public.creativos;
begin
  v_tipo := private.validar_actor(p_actor_id, 'asignaciones.ejecutar', p_session_id);
  if v_tipo is distinct from 'MEDIO' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform private.verificar_propiedad('asignaciones', p_asignacion_id, p_actor_id, v_tipo);
  perform set_config('lock_timeout', '3s', true);
  perform private.bloquear_transicion('asignaciones', p_asignacion_id, 'CONTENIDO_ENTREGADO');
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  if not private.consume_cupo(a.estado, a.estado_previo_disputa) or a.estado in ('LIQUIDADA', 'PAGADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La asignación ya no admite descargas.';
  end if;
  select * into cr from public.creativos c where c.oferta_id = a.oferta_id and c.vigente;
  if cr.id is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La oferta no tiene un creativo vigente.';
  end if;
  insert into public.descargas_contenido (asignacion_id, creativo_id) values (a.id, cr.id);
  update public.asignaciones x set creativo_descargado_id = cr.id where x.id = a.id;
  if a.estado = 'ACEPTADA' then
    perform private.aplicar_transicion('asignaciones', a.id, 'CONTENIDO_ENTREGADO', 'MEDIO', p_actor_id);
  end if;
  return jsonb_build_object(
    'asignacion_id', a.id, 'creativo_id', cr.id, 'version', cr.version, 'tipo', cr.tipo,
    'copy_sugerido', cr.copy_sugerido, 'hashtags', to_jsonb(cr.hashtags), 'menciones', to_jsonb(cr.menciones),
    'enlace_destino', cr.enlace_destino,
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'archivo_path', f.archivo_path, 'mime', f.mime,
                                                              'tamano_bytes', f.tamano_bytes, 'orden', f.orden)
                                           order by f.orden, f.id)
                          from public.creativo_archivos f where f.creativo_id = cr.id), '[]'::jsonb));
end $$;
revoke all on function public.registrar_descarga_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_descarga_srv(uuid, uuid, uuid) to service_role;

-- Evidencia de una publicación (§7.1.2, §10.7): etiqueta confirmada, fecha dentro de la ventana, creativo vigente
-- descargado; upsert de la publicación (RECHAZADA → PENDIENTE) y, con las N evidencias, CONTENIDO_ENTREGADO → PUBLICADA.
create function public.registrar_evidencia_srv(p_asignacion_id uuid, p_numero integer, p_url text,
                                               p_fecha_publicacion timestamptz, p_captura_path text, p_miniatura_path text,
                                               p_etiqueta_confirmada boolean, p_actor_id uuid, p_session_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; a public.asignaciones; o public.ofertas; cr public.creativos; pub public.publicaciones;
  v_ahora timestamptz := private.ahora(); v_id uuid;
begin
  v_tipo := private.validar_actor(p_actor_id, 'asignaciones.ejecutar', p_session_id);
  if v_tipo is distinct from 'MEDIO' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform private.verificar_propiedad('asignaciones', p_asignacion_id, p_actor_id, v_tipo);
  perform set_config('lock_timeout', '3s', true);
  perform private.bloquear_transicion('asignaciones', p_asignacion_id, 'PUBLICADA');
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  select * into o from public.ofertas x where x.id = a.oferta_id;
  if a.estado not in ('CONTENIDO_ENTREGADO', 'PUBLICADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La asignación no admite evidencias en su estado actual.';
  end if;
  if v_ahora > a.fecha_limite_publicacion then
    raise exception using errcode = 'P0001', message = 'AMO_FUERA_DE_VENTANA', detail = 'Venció el plazo para cargar la evidencia.';
  end if;
  if p_numero is null or p_numero < 1 or p_numero > a.publicaciones then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El número de publicación no es válido.';
  end if;
  if not coalesce(p_etiqueta_confirmada, false) then
    raise exception using errcode = 'P0001', message = 'AMO_ETIQUETA_REQUERIDA',
      detail = 'Confirma que la publicación lleva la etiqueta de publicidad.';
  end if;
  if p_fecha_publicacion is null or p_fecha_publicacion < o.ventana_inicio
     or p_fecha_publicacion > least(o.ventana_fin, v_ahora + interval '15 minutes') then
    raise exception using errcode = 'P0001', message = 'AMO_FUERA_DE_VENTANA',
      detail = 'La fecha de publicación está fuera de la ventana de la oferta.';
  end if;
  select * into cr from public.creativos c where c.oferta_id = o.id and c.vigente;
  if cr.id is not null and cr.created_at < p_fecha_publicacion
     and not exists (select 1 from public.descargas_contenido d where d.asignacion_id = a.id and d.creativo_id = cr.id) then
    raise exception using errcode = 'P0001', message = 'AMO_CREATIVO_DESACTUALIZADO',
      detail = 'Descarga la versión vigente del creativo antes de publicar.';
  end if;

  select * into pub from public.publicaciones p where p.asignacion_id = a.id and p.numero = p_numero for update;
  if pub.id is null then
    insert into public.publicaciones (asignacion_id, numero, url_post, fecha_publicacion, captura_path, miniatura_path,
                                      etiqueta_publicidad_confirmada, permanencia_hasta)
    values (a.id, p_numero, p_url, p_fecha_publicacion, p_captura_path, p_miniatura_path, true,
            p_fecha_publicacion + make_interval(days => o.permanencia_minima_dias))
    returning id into v_id;
  else
    if pub.estado_validacion = 'APROBADA' then
      raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Esa publicación ya fue aprobada.';
    end if;
    update public.publicaciones p set url_post = p_url, fecha_publicacion = p_fecha_publicacion,
           captura_path = p_captura_path, miniatura_path = p_miniatura_path, etiqueta_publicidad_confirmada = true,
           etiqueta_verificada = false, permanencia_verificada_at = null, retirada_detectada_at = null,
           permanencia_hasta = p_fecha_publicacion + make_interval(days => o.permanencia_minima_dias)
    where p.id = pub.id;
    if pub.estado_validacion = 'RECHAZADA' then
      perform private.aplicar_transicion('publicaciones', pub.id, 'PENDIENTE', 'MEDIO', p_actor_id);
    end if;
    v_id := pub.id;
  end if;
  if a.estado = 'CONTENIDO_ENTREGADO'
     and (select count(*) from public.publicaciones p
          where p.asignacion_id = a.id and p.estado_validacion in ('PENDIENTE', 'APROBADA')) >= a.publicaciones then
    perform private.aplicar_transicion('asignaciones', a.id, 'PUBLICADA', 'MEDIO', p_actor_id);
  end if;
  return v_id;
end $$;
revoke all on function public.registrar_evidencia_srv(uuid, integer, text, timestamptz, text, text, boolean, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_evidencia_srv(uuid, integer, text, timestamptz, text, text, boolean, uuid, uuid)
  to service_role;

-- Abrir disputa (§4.2, D7, D24): partes o ADMIN; una abierta por asignación; desde una vencida solo el medio, en plazo
-- y por incumplimiento (no consume cupo mientras dure). Con motivo PERMANENCIA marca la retirada detectada.
create function public.abrir_disputa_srv(p_asignacion_id uuid, p_motivo public.disputa_motivo, p_descripcion text,
                                         p_actor_id uuid, p_session_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; a public.asignaciones; v_id uuid; v_descripcion text := nullif(btrim(p_descripcion), '');
  v_prev_motivo text := current_setting('amo.motivo', true);
begin
  v_tipo := private.validar_actor(p_actor_id, 'disputas.abrir', p_session_id);
  perform private.verificar_propiedad('asignaciones', p_asignacion_id, p_actor_id, v_tipo);
  if v_descripcion is null or p_motivo is null then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Describe el motivo de la disputa.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform private.bloquear_transicion('asignaciones', p_asignacion_id, 'EN_DISPUTA');
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  if exists (select 1 from public.disputas d where d.asignacion_id = a.id and d.estado in ('ABIERTA', 'EN_REVISION')) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Ya hay una disputa abierta sobre esta asignación.';
  end if;
  if a.estado = 'VENCIDA_SIN_PUBLICAR' then
    if v_tipo <> 'MEDIO' or p_motivo <> 'INCUMPLIMIENTO'
       or private.ahora() > a.vencida_at + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas')) then
      raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
        detail = 'Una asignación vencida solo la disputa el medio, por incumplimiento y dentro del plazo.';
    end if;
  elsif a.estado not in ('PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS', 'VERIFICADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La asignación no se puede disputar en su estado actual.';
  end if;
  perform set_config('amo.motivo', v_descripcion, true);
  insert into public.disputas (asignacion_id, abierta_por, parte, motivo, descripcion, estado, estado_asignacion_origen)
  values (a.id, p_actor_id, v_tipo::text::public.disputa_parte, p_motivo, v_descripcion, 'ABIERTA', a.estado)
  returning id into v_id;
  perform set_config('amo.motivo', coalesce(v_prev_motivo, ''), true);
  perform private.aplicar_transicion('asignaciones', a.id, 'EN_DISPUTA', v_tipo::text::public.transicion_actor, p_actor_id,
                                     v_descripcion);
  if p_motivo = 'PERMANENCIA' then
    update public.publicaciones p set retirada_detectada_at = coalesce(p.retirada_detectada_at, private.ahora())
    where p.asignacion_id = a.id;
  end if;
  return v_id;
end $$;
revoke all on function public.abrir_disputa_srv(uuid, public.disputa_motivo, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.abrir_disputa_srv(uuid, public.disputa_motivo, text, uuid, uuid) to service_role;

-- 6. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname like '%\_srv'
                       and has_function_privilege('authenticated', p.oid, 'execute')),
         'authenticated tiene EXECUTE sobre una RPC *_srv';
  assert has_function_privilege('service_role', 'public.transicionar_srv(text, uuid, text, uuid, uuid, text, jsonb)', 'execute')
     and has_function_privilege('service_role', 'public.activar_perfil_srv(uuid)', 'execute')
     and has_function_privilege('service_role', 'public.reservar_cupo_srv(uuid, uuid, uuid, uuid, uuid, uuid)', 'execute')
     and not has_function_privilege('service_role', 'private.ejecutar_transicion(text, uuid, text, text, public.transicion_actor, uuid, text, jsonb)', 'execute'),
         'EXECUTE de las RPC de transición incorrecto';
  assert exists (select 1 from pg_trigger where tgname = 'trg_perfiles_a_validar_transicion'
                   and tgrelid = 'public.perfiles'::regclass),
         'falta el trigger de transición de perfiles';
end $$;
