-- Migración 7d · negocio_transacciones_procedimientos (docs/modelo-datos.md §5.1, §5.7, §12)
-- Finanzas: generar_liquidacion_srv (retenciones por pago prorrateadas, seguridad social, documento soporte en
-- borrador), emitir_factura_srv y emitir_documento_soporte_srv (consecutivo DIAN sin huecos, en el mismo UPDATE que el
-- estado), registrar_pago_anunciante_srv, registrar_pago_liquidacion_srv (vía transicionar_srv) y
-- preparar_dispersion_srv. Cotización: cotizar_oferta (invoker) y estimar_oferta (invoker + agregado definer). SRF de
-- visibilidad del medio: ofertas_para_medio y mis_asignaciones_medio.

-- 1. Liquidaciones y documentos

create function public.generar_liquidacion_srv(p_medio_id uuid, p_periodo_inicio date, p_periodo_fin date,
                                               p_actor_id uuid, p_session_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo;
  v_ids uuid[] := '{}';
  r record;
  v_n integer;
  v_bruto numeric; v_comision numeric; v_medio_total numeric;
  v_declarante boolean; v_obligado boolean; v_resp_iva boolean;
  v_municipio_medio char(5); v_demo boolean;
  v_uvt numeric; v_smlmv numeric; v_umbral numeric;
  v_reglas jsonb := '[]';
  v_regla jsonb;
  v_base numeric;
  v_mun text;
  ri public.reteica_municipal;
  v_por_asig jsonb := '{}';
  v_total_regla numeric; v_acum numeric; v_i integer; v_valor numeric;
  v_ret_total numeric := 0;
  v_mes_inicio date; v_mes_total numeric; v_alerta boolean := false;
  v_liq uuid := private.uuid_v7();
  v_rets jsonb; v_ret_asig numeric;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.generar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_medio_id is null or p_periodo_inicio is null or p_periodo_fin is null or p_periodo_fin < p_periodo_inicio then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El periodo de la liquidación no es válido.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(hashtextextended('amo.liquidacion:' || p_medio_id::text, 0));
  if exists (select 1 from public.liquidaciones l
             where l.medio_id = p_medio_id and l.estado <> 'ANULADA'
               and daterange(l.periodo_inicio, l.periodo_fin, '[]') && daterange(p_periodo_inicio, p_periodo_fin, '[]')) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Ya hay una liquidación del medio que cubre ese periodo.';
  end if;
  -- Verificadas sin liquidar hasta el fin del periodo (incluye las que quedaron fuera de periodos anteriores).
  for r in select a.id from public.asignaciones a
           where a.medio_id = p_medio_id and a.estado = 'VERIFICADA' and a.liquidacion_id is null
             and a.verificada_at < private.inicio_dia(p_periodo_fin + 1)
           order by a.id for update loop
    v_ids := v_ids || r.id;
  end loop;
  v_n := cardinality(v_ids);
  if v_n = 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'No hay asignaciones verificadas por liquidar en ese periodo.';
  end if;
  select sum(m.monto_bruto), sum(m.monto_comision), sum(m.monto_medio) into v_bruto, v_comision, v_medio_total
  from public.asignacion_montos m where m.asignacion_id = any (v_ids);
  select mp.es_declarante, mp.obligado_facturar, mp.responsable_iva into v_declarante, v_obligado, v_resp_iva
  from public.medios_privado mp where mp.medio_id = p_medio_id;
  v_declarante := coalesce(v_declarante, false);
  v_obligado := coalesce(v_obligado, false);
  v_resp_iva := coalesce(v_resp_iva, false);
  select m.municipio_codigo, m.es_demo into v_municipio_medio, v_demo from public.medios m where m.id = p_medio_id;
  select pt.uvt, pt.smlmv, pt.umbral_seg_social_smlmv into v_uvt, v_smlmv, v_umbral
  from public.parametros_tributarios pt where pt.anio = extract(year from p_periodo_fin)::smallint;
  if v_uvt is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Faltan los parámetros tributarios del año del periodo.';
  end if;

  -- Retenciones por pago (§12 «cuantías mínimas», D29): la base mínima se evalúa sobre el total de la liquidación.
  for r in select rc.* from public.retenciones_config rc
           where rc.tipo in ('RETEFUENTE', 'RETEIVA') and rc.aplica_declarante = v_declarante
             and rc.vigente_desde <= p_periodo_fin and (rc.vigente_hasta is null or rc.vigente_hasta > p_periodo_fin)
           order by rc.tipo, rc.concepto loop
    continue when r.tipo = 'RETEIVA' and not v_resp_iva;
    v_base := case when r.tipo = 'RETEIVA' then round(v_medio_total * private.config_decimal('facturacion.iva'), 2)
                   else v_medio_total end;
    if v_base >= r.base_minima_uvt * v_uvt then
      v_reglas := v_reglas || jsonb_build_object('tipo', r.tipo, 'concepto', r.concepto, 'base_pago', v_base,
                                                 'tarifa', r.tarifa, 'config_id', r.id, 'municipio_codigo', null);
    end if;
  end loop;
  v_mun := case private.config_texto('tributario.reteica_municipio_base')
             when 'PLATAFORMA' then private.config_texto('tributario.municipio_plataforma') else v_municipio_medio end;
  select * into ri from public.reteica_municipal x
  where x.municipio_codigo = v_mun and x.vigente_desde <= p_periodo_fin
    and (x.vigente_hasta is null or x.vigente_hasta > p_periodo_fin);
  if ri.id is not null and v_medio_total >= ri.base_minima_uvt * v_uvt then
    v_reglas := v_reglas || jsonb_build_object('tipo', 'RETEICA', 'concepto', 'ICA', 'base_pago', v_medio_total,
                                               'tarifa', round(ri.tarifa_por_mil / 1000, 8), 'config_id', ri.id,
                                               'municipio_codigo', v_mun);
  end if;
  -- Prorrateo de cada retención por monto_medio (la última asignación absorbe el redondeo).
  for v_regla in select e.value from jsonb_array_elements(v_reglas) e loop
    v_total_regla := round((v_regla ->> 'base_pago')::numeric * (v_regla ->> 'tarifa')::numeric);
    v_ret_total := v_ret_total + v_total_regla;
    v_acum := 0;
    v_i := 0;
    for r in select m.asignacion_id, m.monto_medio from public.asignacion_montos m
             where m.asignacion_id = any (v_ids) order by m.asignacion_id loop
      v_i := v_i + 1;
      v_valor := case when v_i = v_n then v_total_regla - v_acum
                      else round(v_total_regla * r.monto_medio / v_medio_total) end;
      v_acum := v_acum + v_valor;
      v_por_asig := jsonb_set(v_por_asig, array[r.asignacion_id::text],
        coalesce(v_por_asig -> r.asignacion_id::text, '[]'::jsonb)
        || jsonb_build_array((v_regla - 'base_pago') || jsonb_build_object(
             'base', round((v_regla ->> 'base_pago')::numeric * r.monto_medio / v_medio_total, 2),
             'base_pago', v_regla -> 'base_pago', 'valor', v_valor)));
    end loop;
  end loop;

  -- Seguridad social (§12, §14.2.5, D30): mes calendario de p_periodo_fin.
  v_mes_inicio := date_trunc('month', p_periodo_fin)::date;
  select coalesce(sum(l.monto_medio), 0) into v_mes_total from public.liquidaciones l
  where l.medio_id = p_medio_id and l.estado <> 'ANULADA'
    and l.periodo_fin >= v_mes_inicio and l.periodo_fin < (v_mes_inicio + interval '1 month')::date;
  if v_umbral is not null and v_mes_total + v_medio_total > v_umbral * v_smlmv
     and not exists (select 1 from public.documentos_medio d
                     where d.medio_id = p_medio_id and d.tipo = 'SEG_SOCIAL' and d.estado_validacion = 'APROBADO'
                       and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())) then
    v_alerta := true;
  end if;

  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto,
    monto_comision, monto_medio, monto_retenciones, monto_neto, estado, requiere_documento_soporte, alerta_seg_social,
    creada_por, es_demo)
  values (v_liq, p_medio_id, p_periodo_inicio, p_periodo_fin, v_n, v_bruto, v_comision, v_medio_total, v_ret_total,
          v_medio_total - v_ret_total, 'BORRADOR', not v_obligado, v_alerta, p_actor_id, coalesce(v_demo, false));
  if not v_obligado then
    insert into public.documentos_soporte (liquidacion_id, valor_total) values (v_liq, v_medio_total);
  end if;
  for r in select m.asignacion_id, m.monto_medio from public.asignacion_montos m
           where m.asignacion_id = any (v_ids) order by m.asignacion_id loop
    v_rets := coalesce(v_por_asig -> r.asignacion_id::text, '[]'::jsonb);
    select coalesce(sum((e.value ->> 'valor')::numeric), 0) into v_ret_asig from jsonb_array_elements(v_rets) e;
    update public.asignaciones a set liquidacion_id = v_liq where a.id = r.asignacion_id;
    update public.asignacion_montos m set retenciones_aplicadas = v_rets, monto_retenciones = v_ret_asig,
           monto_neto = r.monto_medio - v_ret_asig
    where m.asignacion_id = r.asignacion_id;
    perform private.aplicar_transicion('asignaciones', r.asignacion_id, 'LIQUIDADA', 'ADMIN', p_actor_id);
  end loop;
  return v_liq;
end $$;
revoke all on function public.generar_liquidacion_srv(uuid, date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.generar_liquidacion_srv(uuid, date, date, uuid, uuid) to service_role;

-- Emite una factura en borrador: consecutivo DIAN sin huecos (misma transacción) y fecha de emisión de Bogotá.
create function public.emitir_factura_srv(p_factura_id uuid, p_actor_id uuid, p_session_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; f public.facturas; n record; v_hoy date := private.hoy(); v_vence date; v_res jsonb;
begin
  v_tipo := private.validar_actor(p_actor_id, 'facturas.gestionar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into f from public.facturas x where x.id = p_factura_id for update;
  if f.id is null or f.estado <> 'BORRADOR' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Solo se emite una factura en borrador.';
  end if;
  if f.subtotal + f.iva <= 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La factura no tiene valor.';
  end if;
  select * into n from private.siguiente_consecutivo('FACTURA_VENTA');
  v_vence := case when f.fecha_vencimiento is null or f.fecha_vencimiento < v_hoy
                  then v_hoy + private.config_entero('facturacion.dias_vencimiento') else f.fecha_vencimiento end;
  v_res := private.aplicar_transicion('facturas', f.id, 'EMITIDA', 'ADMIN', p_actor_id, null,
             jsonb_build_object('resolucion_id', n.resolucion_id, 'prefijo', n.prefijo, 'consecutivo', n.consecutivo,
                                'fecha_emision', v_hoy, 'fecha_vencimiento', v_vence));
  return v_res || jsonb_build_object('numero', n.prefijo || n.consecutivo::text, 'fecha_emision', v_hoy,
                                     'fecha_vencimiento', v_vence);
end $$;
revoke all on function public.emitir_factura_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.emitir_factura_srv(uuid, uuid, uuid) to service_role;

-- Documento soporte de una liquidación APROBADA que lo requiere: crea el borrador si no existe y lo emite con el
-- consecutivo DIAN (idempotente si ya está emitido).
create function public.emitir_documento_soporte_srv(p_liquidacion_id uuid, p_actor_id uuid, p_session_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; l public.liquidaciones; ds public.documentos_soporte; n record;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into l from public.liquidaciones x where x.id = p_liquidacion_id for update;
  if l.id is null or l.estado <> 'APROBADA' or not l.requiere_documento_soporte then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La liquidación debe estar aprobada y requerir documento soporte.';
  end if;
  select * into ds from public.documentos_soporte d where d.liquidacion_id = l.id and d.estado <> 'ANULADO' for update;
  if ds.id is null then
    insert into public.documentos_soporte (liquidacion_id, valor_total) values (l.id, l.monto_medio) returning * into ds;
  end if;
  if ds.estado = 'EMITIDO' then return ds.id; end if;
  select * into n from private.siguiente_consecutivo('DOCUMENTO_SOPORTE');
  perform private.aplicar_transicion('documentos_soporte', ds.id, 'EMITIDO', 'ADMIN', p_actor_id, null,
            jsonb_build_object('resolucion_id', n.resolucion_id, 'prefijo', n.prefijo, 'consecutivo', n.consecutivo,
                               'fecha_emision', private.hoy()));
  return ds.id;
end $$;
revoke all on function public.emitir_documento_soporte_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.emitir_documento_soporte_srv(uuid, uuid, uuid) to service_role;

-- Pago de un anunciante: no excede el total; PAGADA_PARCIAL / PAGADA como efecto SISTEMA.
create function public.registrar_pago_anunciante_srv(p_factura_id uuid, p_fecha date, p_monto numeric, p_medio_pago text,
                                                     p_referencia text, p_soporte_path text, p_actor_id uuid,
                                                     p_session_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; f public.facturas; v_id uuid;
begin
  v_tipo := private.validar_actor(p_actor_id, 'pagos.registrar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into f from public.facturas x where x.id = p_factura_id for update;
  if f.id is null or f.estado not in ('EMITIDA', 'PAGADA_PARCIAL', 'VENCIDA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La factura no admite pagos en su estado actual.';
  end if;
  if p_fecha is null or p_monto is null or p_monto <= 0 or f.pagado + p_monto > f.total then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El pago debe tener fecha y un monto que no supere el saldo de la factura.';
  end if;
  insert into public.pagos_anunciante (factura_id, anunciante_id, fecha_pago, monto, medio_pago, referencia, soporte_path,
                                       registrado_por, es_demo)
  values (f.id, f.anunciante_id, p_fecha, p_monto, p_medio_pago, nullif(btrim(p_referencia), ''), p_soporte_path,
          p_actor_id, f.es_demo)
  returning id into v_id;
  update public.facturas x set pagado = x.pagado + p_monto where x.id = f.id returning * into f;
  if f.saldo = 0 then
    perform private.aplicar_transicion('facturas', f.id, 'PAGADA', 'SISTEMA', null);
  elsif f.estado in ('EMITIDA', 'VENCIDA') then
    perform private.aplicar_transicion('facturas', f.id, 'PAGADA_PARCIAL', 'SISTEMA', null);
  end if;
  return v_id;
end $$;
revoke all on function public.registrar_pago_anunciante_srv(uuid, date, numeric, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_pago_anunciante_srv(uuid, date, numeric, text, text, text, uuid, uuid)
  to service_role;

-- Pago de una liquidación APROBADA: mismas condiciones y efectos que transicionar_srv (documento soporte o factura del
-- medio, asignaciones LIQUIDADA → PAGADA).
create function public.registrar_pago_liquidacion_srv(p_liquidacion_id uuid, p_fecha date, p_referencia text,
                                                      p_soporte_path text, p_actor_id uuid, p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return public.transicionar_srv('liquidaciones', p_liquidacion_id, 'PAGADA', p_actor_id, p_session_id, null,
           jsonb_strip_nulls(jsonb_build_object('fecha_pago', p_fecha, 'referencia_pago', nullif(btrim(p_referencia), ''),
                                                'soporte_pago_path', p_soporte_path)));
end $$;
revoke all on function public.registrar_pago_liquidacion_srv(uuid, date, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_pago_liquidacion_srv(uuid, date, text, text, uuid, uuid) to service_role;

-- Archivo de dispersión bancaria (§7.3.6): solo liquidaciones APROBADA; la ruta la construye el servidor como
-- dispersion/{uuid}/{archivo}.csv y ese uuid es el id de la dispersión. Registra EXPORTAR y un REVELAR_DATO por medio.
create function public.preparar_dispersion_srv(p_liquidacion_ids uuid[], p_archivo_path text, p_actor_id uuid,
                                               p_session_id uuid)
returns table (liquidacion_id uuid, medio_id uuid, titular_nombre text, tipo_documento public.documento_identidad_tipo,
               numero_documento_cifrado text, metodo_pago public.metodo_pago, datos_pago_cifrados text, monto_neto numeric)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare v_id uuid; v_n integer; v_total numeric; v_demo boolean; r record;
begin
  perform private.validar_actor(p_actor_id, 'liquidaciones.registrar_pago', p_session_id);
  if not private.tiene_permiso_de(p_actor_id, 'datos_sensibles.ver') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_liquidacion_ids is null or cardinality(p_liquidacion_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Selecciona al menos una liquidación.';
  end if;
  if p_archivo_path is null
     or p_archivo_path !~ '^dispersion/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+\.csv$'
     or position('..' in p_archivo_path) > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'La ruta del archivo de dispersión no es válida.';
  end if;
  v_id := split_part(p_archivo_path, '/', 2)::uuid;
  perform 1 from public.liquidaciones l where l.id = any (p_liquidacion_ids) order by l.id for update;
  select count(*), sum(l.monto_neto), bool_or(l.es_demo) into v_n, v_total, v_demo
  from public.liquidaciones l where l.id = any (p_liquidacion_ids) and l.estado = 'APROBADA';
  if v_n <> (select count(distinct x.id) from unnest(p_liquidacion_ids) x(id)) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Todas las liquidaciones deben estar aprobadas.';
  end if;
  insert into public.dispersiones (id, archivo_path, cantidad_liquidaciones, monto_total, generada_por, es_demo)
  values (v_id, p_archivo_path, v_n, v_total, p_actor_id, coalesce(v_demo, false));
  update public.liquidaciones l set dispersion_id = v_id where l.id = any (p_liquidacion_ids);
  perform private.registrar_en_bitacora('EXPORTAR', 'dispersiones', v_id::text, null,
            jsonb_build_object('liquidaciones', to_jsonb(p_liquidacion_ids), 'filas', v_n, 'formato', 'csv'));
  for r in select distinct l.medio_id from public.liquidaciones l where l.id = any (p_liquidacion_ids) loop
    perform private.registrar_en_bitacora('REVELAR_DATO', 'medios_privado', r.medio_id::text, null,
              jsonb_build_object('tabla', 'medios_privado', 'id', r.medio_id, 'origen', 'dispersion',
                                 'campos', jsonb_build_array('titular_nombre', 'tipo_documento', 'numero_documento_cifrado',
                                                             'metodo_pago', 'datos_pago_cifrados')));
  end loop;
  return query
    select l.id, l.medio_id, mp.titular_nombre, mp.tipo_documento, mp.numero_documento_cifrado, mp.metodo_pago,
           mp.datos_pago_cifrados, l.monto_neto
    from public.liquidaciones l left join public.medios_privado mp on mp.medio_id = l.medio_id
    where l.id = any (p_liquidacion_ids) order by l.id;
end $$;
revoke all on function public.preparar_dispersion_srv(uuid[], text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.preparar_dispersion_srv(uuid[], text, uuid, uuid) to service_role;

-- 2. Cotización y estimación

-- Cotización para la UI (invoker). Un medio solo cotiza ofertas que ve o en las que participa; sin
-- comision.visible_para_medio no recibe bruto, comisión ni tarifa base (derivarían la comisión).
create function public.cotizar_oferta(p_oferta_id uuid, p_cuenta_social_id uuid)
returns table (franja_id uuid, franja_clave text, seguidores integer, tarifa_id uuid, tarifa_base numeric,
               publicaciones smallint, multiplicador_calidad numeric, multiplicador_geografico numeric,
               multiplicador_exclusividad numeric, monto_bruto numeric, porcentaje_comision numeric,
               comision_origen public.comision_origen, comision_excepcion_id uuid, monto_comision numeric, monto_medio numeric)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare v_visible boolean;
begin
  if not private.acceso_valido() then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if private.mi_medio_id() is not null then
    if not (private.oferta_visible_para_mi(p_oferta_id) or private.tengo_asignacion_en(p_oferta_id)) then
      raise exception using errcode = 'P0001', message = 'AMO_OFERTA_NO_DISPONIBLE', detail = 'La oferta no está disponible.';
    end if;
    v_visible := private.config_booleano('comision.visible_para_medio');
    return query
      select p.franja_id, p.franja_clave, p.seguidores, case when v_visible then p.tarifa_id end,
             case when v_visible then p.tarifa_base end, p.publicaciones, p.multiplicador_calidad,
             p.multiplicador_geografico, p.multiplicador_exclusividad, case when v_visible then p.monto_bruto end,
             case when v_visible then p.porcentaje_comision end, case when v_visible then p.comision_origen end,
             null::uuid, case when v_visible then p.monto_comision end, p.monto_medio
      from private.calcular_precio(p_oferta_id, p_cuenta_social_id) p;
  elsif private.tiene_permiso('ofertas.ver') then
    return query select * from private.calcular_precio(p_oferta_id, p_cuenta_social_id);
  else
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
end $$;
revoke all on function public.cotizar_oferta(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cotizar_oferta(uuid, uuid) to authenticated;

-- Estimador del anunciante (agregado, definer): por franja pedida, medios elegibles, precio mediano, inversión
-- estimada y alcance mediano de las cuentas vigentes; nunca expone medios individuales.
create function private.estimar_oferta_agregado(p_formato_id uuid, p_departamentos char(2)[], p_municipios char(5)[],
                                                p_categorias uuid[], p_seguidores_minimos integer, p_cupos jsonb,
                                                p_exclusividad_dias smallint)
returns table (franja_id uuid, medios_elegibles integer, precio_mediano numeric, inversion_estimada numeric,
               alcance_mediano_estimado bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_plataforma public.plataforma;
  v_umbral integer := private.config_entero('medios.umbral_seguidores');
  v_min_pub integer := private.config_entero('calidad.minimo_publicaciones');
  v_piso numeric := private.config_decimal('calidad.multiplicador_piso');
  v_techo numeric := private.config_decimal('calidad.multiplicador_techo');
  v_r integer := private.config_entero('precios.redondeo');
  v_me numeric;
  v_sin_geo boolean := coalesce(cardinality(p_municipios), 0) = 0 and coalesce(cardinality(p_departamentos), 0) = 0;
begin
  if not private.acceso_valido()
     or not (private.tiene_permiso('ofertas.gestionar_propias') or private.tiene_permiso('ofertas.gestionar')
             or private.tiene_permiso('ofertas.ver')) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select f.plataforma into v_plataforma from public.formatos f where f.id = p_formato_id and f.activo;
  if v_plataforma is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El formato no está disponible.';
  end if;
  if p_cupos is null or jsonb_typeof(p_cupos) <> 'object' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Indica los cupos por franja.';
  end if;
  v_me := case when p_exclusividad_dias is null then 1 else private.config_decimal('precios.recargo_exclusividad') end;
  return query
  with pedidas as (
    select e.key::uuid as franja_id, greatest(e.value::integer, 0) as cupos from jsonb_each_text(p_cupos) e
  ), cuentas as (
    select c.medio_id, c.franja_id, c.alcance_mediano, c.multiplicador_calidad, c.publicaciones_verificadas_count
    from public.cuentas_sociales c
    join public.medios m on m.id = c.medio_id
    join public.municipios mu on mu.codigo = m.municipio_codigo
    join public.departamentos d on d.codigo = m.departamento_codigo
    where c.plataforma = v_plataforma and c.deleted_at is null and private.cuenta_vigente(c.id)
      and c.seguidores_verificados >= greatest(v_umbral, coalesce(p_seguidores_minimos, 0))
      and m.estado = 'VERIFICADO' and m.nivel_verificacion >= 1 and m.deleted_at is null and mu.activo and d.activo
      and (v_sin_geo or m.municipio_codigo = any (p_municipios) or m.departamento_codigo = any (p_departamentos))
      and (coalesce(cardinality(p_categorias), 0) = 0
           or exists (select 1 from public.medio_categorias mc where mc.medio_id = m.id and mc.categoria_id = any (p_categorias)))
  ), precios as (
    select cu.medio_id, cu.franja_id, cu.alcance_mediano,
           round(t.valor_base
                 * (case when cu.publicaciones_verificadas_count < v_min_pub then 1
                         else least(greatest(cu.multiplicador_calidad, v_piso), v_techo) end)
                 * (case when v_sin_geo then 1
                         else coalesce((select max(pg.multiplicador) from public.medio_pertinencia_geografica pg
                                        join public.municipios mm on mm.codigo = pg.municipio_codigo
                                        where pg.medio_id = cu.medio_id
                                          and (pg.municipio_codigo = any (p_municipios)
                                               or mm.departamento_codigo = any (p_departamentos))), 1) end)
                 * v_me / v_r) * v_r as precio
    from cuentas cu
    join public.tarifas t on t.formato_id = p_formato_id and t.franja_id = cu.franja_id
     and t.vigente_desde <= private.ahora() and (t.vigente_hasta is null or t.vigente_hasta > private.ahora())
  )
  select pe.franja_id, count(distinct pr.medio_id)::integer,
         (percentile_cont(0.5) within group (order by pr.precio))::numeric,
         ((percentile_cont(0.5) within group (order by pr.precio)) * pe.cupos)::numeric,
         (percentile_cont(0.5) within group (order by pr.alcance_mediano))::bigint
  from pedidas pe left join precios pr on pr.franja_id = pe.franja_id
  group by pe.franja_id, pe.cupos
  order by pe.franja_id;
end $$;
revoke all on function private.estimar_oferta_agregado(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint)
  from public, anon, authenticated;
grant execute on function private.estimar_oferta_agregado(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint)
  to authenticated, service_role;

create function public.estimar_oferta(p_formato_id uuid, p_departamentos char(2)[], p_municipios char(5)[],
                                      p_categorias uuid[], p_seguidores_minimos integer, p_cupos jsonb,
                                      p_exclusividad_dias smallint default null)
returns table (franja_id uuid, medios_elegibles integer, precio_mediano numeric, inversion_estimada numeric,
               alcance_mediano_estimado bigint)
language sql stable security invoker set search_path = '' as $$
  select * from private.estimar_oferta_agregado(p_formato_id, p_departamentos, p_municipios, p_categorias,
                                                p_seguidores_minimos, p_cupos, p_exclusividad_dias) $$;
revoke all on function public.estimar_oferta(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint)
  from public, anon, authenticated;
grant execute on function public.estimar_oferta(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint) to authenticated;

-- 3. SRF de visibilidad del medio (§2.3): columnas públicas y filtro explícito acceso_valido() + helper.

-- Marketplace, detalle y ofertas con asignación propia (sin medios_excluidos, moderación ni presupuestos).
create function public.ofertas_para_medio(p_oferta_id uuid default null)
returns table (id uuid, titulo text, formato_id uuid, plataforma public.plataforma, publicaciones_por_medio smallint,
               permite_multiples_cupos boolean, ventana_inicio timestamptz, ventana_fin timestamptz,
               fecha_limite_aceptacion timestamptz, permanencia_minima_dias smallint, exclusividad_dias smallint,
               cortes_requeridos public.corte_metrica[], instrucciones text, restricciones text,
               estado public.oferta_estado, marca text, anunciante_id uuid, anunciante_nombre text, sector_id uuid,
               cupos_restantes_mi_franja jsonb)
language sql stable security definer set search_path = '' as $$
  select o.id, o.titulo, o.formato_id, o.plataforma, o.publicaciones_por_medio, o.permite_multiples_cupos,
         o.ventana_inicio, o.ventana_fin, o.fecha_limite_aceptacion, o.permanencia_minima_dias, o.exclusividad_dias,
         o.cortes_requeridos, o.instrucciones, o.restricciones, o.estado, c.marca, o.anunciante_id,
         an.nombre_comercial, an.sector_id,
         coalesce((select jsonb_agg(jsonb_build_object('cuenta_social_id', cs.id, 'handle', cs.handle::text,
                                                       'franja_id', cs.franja_id, 'franja_clave', f.clave,
                                                       'cupos_restantes', greatest(oc.cupos_totales - oc.cupos_ocupados, 0))
                                    order by cs.seguidores_verificados desc)
                   from public.cuentas_sociales cs
                   join public.franjas f on f.id = cs.franja_id
                   join public.oferta_cupos oc on oc.oferta_id = o.id and oc.franja_id = cs.franja_id
                   where cs.medio_id = (select private.mi_medio_id()) and cs.plataforma = o.plataforma
                     and cs.deleted_at is null and private.cuenta_vigente(cs.id)
                     and cs.seguidores_verificados >= greatest(private.config_entero('medios.umbral_seguidores'),
                                                               coalesce(o.seguidores_minimos, 0))), '[]'::jsonb)
  from public.ofertas o
  join public.campanas c on c.id = o.campana_id
  join public.anunciantes an on an.id = o.anunciante_id
  where (select private.acceso_valido())
    and (select private.tiene_permiso('ofertas.marketplace'))
    and (p_oferta_id is null or o.id = p_oferta_id)
    and o.deleted_at is null
    and (o.estado in ('PUBLICADA', 'EN_EJECUCION')
         or exists (select 1 from public.asignaciones a where a.oferta_id = o.id and a.medio_id = (select private.mi_medio_id())))
    and (private.oferta_visible_para_mi(o.id) or private.tengo_asignacion_en(o.id))
  order by o.fecha_limite_aceptacion, o.id
$$;
revoke all on function public.ofertas_para_medio(uuid) from public, anon, authenticated;
grant execute on function public.ofertas_para_medio(uuid) to authenticated;

-- Asignaciones propias del medio con sus montos; bruto, comisión, tarifa base y multiplicadores solo si
-- comision.visible_para_medio (con ellos se derivaría la comisión). Keyset por id desc (uuid v7).
create function public.mis_asignaciones_medio(p_estados public.asignacion_estado[] default null, p_limite integer default 50,
                                              p_antes_id uuid default null)
returns table (id uuid, oferta_id uuid, campana_id uuid, anunciante_id uuid, cuenta_social_id uuid,
               plataforma public.plataforma, slot smallint, estado public.asignacion_estado,
               estado_previo_disputa public.asignacion_estado, causa_cancelacion public.cancelacion_causa,
               aceptada_at timestamptz, contenido_descargado_at timestamptz, publicada_at timestamptz,
               evidencia_validada_at timestamptz, metricas_cargadas_at timestamptz, verificada_at timestamptz,
               liquidada_at timestamptz, pagada_at timestamptz, rechazada_at timestamptz, vencida_at timestamptz,
               en_disputa_at timestamptz, cancelada_at timestamptz, metricas_atrasadas_at timestamptz,
               fecha_limite_publicacion timestamptz, creativo_descargado_id uuid, franja_id uuid, franja_clave text,
               seguidores_al_aceptar integer, publicaciones smallint, tarifa_base_aplicada numeric,
               multiplicador_calidad_aplicado numeric, multiplicador_geografico_aplicado numeric,
               multiplicador_exclusividad_aplicado numeric, monto_bruto numeric, porcentaje_comision numeric,
               monto_comision numeric, monto_medio numeric, retenciones_aplicadas jsonb, monto_retenciones numeric,
               monto_neto numeric, liquidacion_id uuid, motivo text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with cfg as (select private.config_booleano('comision.visible_para_medio') as visible)
  select a.id, a.oferta_id, a.campana_id, a.anunciante_id, a.cuenta_social_id, a.plataforma, a.slot, a.estado,
         a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at, a.contenido_descargado_at, a.publicada_at,
         a.evidencia_validada_at, a.metricas_cargadas_at, a.verificada_at, a.liquidada_at, a.pagada_at, a.rechazada_at,
         a.vencida_at, a.en_disputa_at, a.cancelada_at, a.metricas_atrasadas_at, a.fecha_limite_publicacion,
         a.creativo_descargado_id, a.franja_id, a.franja_clave, a.seguidores_al_aceptar, a.publicaciones,
         case when cfg.visible then a.tarifa_base_aplicada end,
         case when cfg.visible then a.multiplicador_calidad_aplicado end,
         case when cfg.visible then a.multiplicador_geografico_aplicado end,
         case when cfg.visible then a.multiplicador_exclusividad_aplicado end,
         case when cfg.visible then a.monto_bruto end,
         case when cfg.visible then am.porcentaje_comision end,
         case when cfg.visible then am.monto_comision end,
         am.monto_medio, am.retenciones_aplicadas, am.monto_retenciones, am.monto_neto, a.liquidacion_id, a.motivo,
         a.created_at, a.updated_at
  from public.asignaciones a
  left join public.asignacion_montos am on am.asignacion_id = a.id
  cross join cfg
  where (select private.acceso_valido())
    and (select private.tiene_permiso('asignaciones.ver_propias'))
    and a.medio_id = (select private.mi_medio_id())
    and (p_estados is null or a.estado = any (p_estados))
    and (p_antes_id is null or a.id < p_antes_id)
  order by a.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;
revoke all on function public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid) from public, anon, authenticated;
grant execute on function public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid) to authenticated;

-- 4. Verificación
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
  assert (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('generar_liquidacion_srv', 'emitir_factura_srv',
            'emitir_documento_soporte_srv', 'registrar_pago_anunciante_srv', 'registrar_pago_liquidacion_srv',
            'preparar_dispersion_srv') and has_function_privilege('service_role', p.oid, 'execute')) = 6,
         'service_role debe poder ejecutar los procedimientos financieros';
  assert has_function_privilege('authenticated', 'public.ofertas_para_medio(uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.cotizar_oferta(uuid, uuid)', 'execute')
     and has_function_privilege('authenticated', 'public.estimar_oferta(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint)', 'execute'),
         'authenticated debe poder ejecutar las SRF y cotizaciones';
end $$;
