-- E2 · Fase 3: marketplace, aceptación, ejecución del medio y seguimiento del anunciante (cierra la Entrega 2:
-- RF-MED-008…014, ANU-011, ANU-012, INT-001, INT-002, INT-005, NOT-005, NOT-006, CUP-004…006, DSH-006, PRC-003,
-- PRC-004; docs/modelo-datos.md §3.11).
--
-- · Aceptar (reservar_cupo): quien pierde el último cupo recibe «No quedan cupos en tu franja» aunque la oferta haya
--   pasado a CUPOS_COMPLETOS; «ya aceptaste» se responde antes que «sin cupo»; una clave de idempotencia ya usada en
--   otra oferta o en una asignación que ya no está en pie se rechaza (antes devolvía un éxito falso). Desistir tiene su
--   propio procedimiento (por asignación).
-- · Marketplace del medio: listado con el pago de cada cuenta, rechazadas aparte y paginación (`marketplace_medio`), y la
--   razón por la que un medio no ve ofertas (`mi_elegibilidad_marketplace`). Aviso a los medios elegibles cuando se libera
--   un cupo de una oferta llena.
-- · Mis campañas: `mis_asignaciones_medio` trae la oferta, la ventana, los cortes y el plazo de reclamo (y una asignación
--   por id); `proximas_acciones_medio` dice qué publicación y qué corte, y avisa la versión nueva del creativo.
-- · Ejecución: URL del post única y con forma de publicación (INT-002), captura del panel en Storage y como imagen
--   (INT-001), coherencia de métricas por fila y entre cortes (INT-005), personalizado idempotente, edición del medio
--   solo mientras la asignación admite métricas, aviso de métricas atrasadas por corte (NOT-005), versión del creativo
--   vigente AL PUBLICAR (no la creada antes), aviso de versión nueva solo a quien aún no publica (NOT-006) y descarga
--   cerrada al vencer el plazo.
-- · Seguimiento del anunciante (ANU-011): `seguimiento_campana` con medio público, cuenta, publicaciones y cortes
--   aprobados; el anunciante deja de ver métricas sin validar y los rechazos de medios que nunca aceptaron.
-- · Calidad (PRC-004): el aviso de cambio explica el índice frente a la franja (`cuentas_sociales.indice_franja`) en
--   formato es-CO, y el cambio programado se aplica a las 00:01 de Bogotá.

-- 1. Configuración y plantillas ------------------------------------------------------------------------------------

insert into public.configuracion
  (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica, pendiente_validacion) values
  ('metricas.tolerancia_cortes', '0.02', 'DECIMAL', 0, 0.2, null, 'metricas',
   'Caída relativa admitida entre un corte y el siguiente (7 d ≥ 72 h ≥ 24 h) en alcance, impresiones e interacciones.',
   '×', true, false)
on conflict (clave) do nothing;
-- El medio ve sus plazos: carga de métricas, reclamo de una vencida y recarga tras una disputa.
update public.configuracion set es_publica = true
where clave in ('metricas.plazo_carga_horas', 'disputas.plazo_vencida_horas', 'disputas.plazo_recarga_horas');

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('oferta.cupo_liberado', 'APP', 'Se liberó un cupo', null,
   'Se liberó un cupo en «{{oferta}}». Si te interesa, acéptala antes del {{fecha_limite}}.', array['oferta', 'fecha_limite'])
on conflict (clave, canal) do nothing;

update public.plantillas_notificacion
   set cuerpo = 'Desde el {{fecha}}, el multiplicador de calidad de @{{handle}} pasará de {{actual}} a {{proximo}}. '
                || 'Se calcula con tus últimas {{n}} publicaciones verificadas: tu índice de alcance es {{indice}} y la '
                || 'mediana de tu franja es {{indice_franja}}.',
       variables = array['handle', 'actual', 'proximo', 'fecha', 'indice', 'indice_franja', 'n']
 where clave = 'multiplicador.cambio_programado' and canal = 'APP';

-- 2. Aceptar, desistir y marketplace -------------------------------------------------------------------------------

-- MED-010 / CUP-006: errores de la aceptación según el criterio y clave de idempotencia de un solo uso.
create or replace function private.reservar_cupo(p_oferta_id uuid, p_medio_id uuid, p_cuenta_social_id uuid, p_actor_id uuid, p_session_id uuid, p_clave_idempotencia uuid DEFAULT NULL::uuid)
 RETURNS TABLE(asignacion_id uuid, monto_bruto numeric, monto_medio numeric, franja_clave text, cupos_restantes_franja integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_tipo public.rol_tipo;
  v_campana uuid;
  v_existente uuid;
  v_medio_existente uuid;
  v_oferta_existente uuid;
  v_viva boolean;
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
    select x.id, x.medio_id, x.oferta_id, private.consume_cupo(x.estado, x.estado_previo_disputa)
      into v_existente, v_medio_existente, v_oferta_existente, v_viva
    from public.asignaciones x where x.clave_idempotencia = p_clave_idempotencia;
    if v_existente is not null then
      if v_medio_existente <> p_medio_id then
        raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
      end if;
      -- Una clave ya usada en otra oferta o en una asignación que ya no está en pie (desistida, vencida) no es un
      -- reintento: devolver esa fila sería un éxito falso.
      if v_oferta_existente <> p_oferta_id or not v_viva then
        raise exception using errcode = 'P0001', message = 'AMO_IDEMPOTENCIA_INVALIDA',
          detail = 'Esta solicitud ya se usó. Vuelve a intentarlo.';
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
    select x.id, x.medio_id, x.oferta_id, private.consume_cupo(x.estado, x.estado_previo_disputa)
      into v_existente, v_medio_existente, v_oferta_existente, v_viva
    from public.asignaciones x where x.clave_idempotencia = p_clave_idempotencia;
    if v_existente is not null then
      if v_medio_existente <> p_medio_id then
        raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
      end if;
      -- Una clave ya usada en otra oferta o en una asignación que ya no está en pie (desistida, vencida) no es un
      -- reintento: devolver esa fila sería un éxito falso.
      if v_oferta_existente <> p_oferta_id or not v_viva then
        raise exception using errcode = 'P0001', message = 'AMO_IDEMPOTENCIA_INVALIDA',
          detail = 'Esta solicitud ya se usó. Vuelve a intentarlo.';
      end if;
      return query select * from private.resultado_reserva(v_existente);
      return;
    end if;
  end if;

  -- 1b. Un medio, un cupo (§10.9), antes que «sin cupo»: quien ya aceptó lo sabe aunque la franja se haya llenado.
  if not o.permite_multiples_cupos
     and exists (select 1 from public.asignaciones a where a.oferta_id = p_oferta_id and a.medio_id = p_medio_id
                   and a.estado not in ('RECHAZADA', 'CANCELADA', 'VENCIDA_SIN_PUBLICAR')) then
    raise exception using errcode = 'P0001', message = 'AMO_YA_ACEPTADA', detail = 'Ya aceptaste esta oferta.';
  end if;
  -- 1c. La reserva ganadora llenó la oferta (CUPOS_COMPLETOS): para quien llegó tarde es «sin cupo» (MED-010).
  if o.estado = 'CUPOS_COMPLETOS' and o.deleted_at is null and v_ahora < o.fecha_limite_aceptacion
     and c.estado = 'ACTIVA' and c.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'AMO_SIN_CUPO', detail = 'No quedan cupos en tu franja.';
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
    raise exception using errcode = 'P0001', message = 'AMO_SIN_CUPO', detail = 'No quedan cupos en tu franja.';
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
end $function$;

-- MED-010: desistir de una asignación concreta (con varios cupos, el medio elige cuál). La transición valida el motivo,
-- que no haya descarga y que la fecha límite de aceptación no haya pasado.
create function public.desistir_asignacion_srv(p_asignacion_id uuid, p_actor_id uuid, p_session_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo;
begin
  v_tipo := private.validar_actor(p_actor_id, 'ofertas.aceptar', p_session_id);
  if v_tipo is distinct from 'MEDIO'
     or not exists (select 1 from public.asignaciones a join public.perfiles p on p.medio_id = a.medio_id
                    where a.id = p_asignacion_id and p.id = p_actor_id) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform public.transicionar_srv('asignaciones', p_asignacion_id, 'RECHAZADA', p_actor_id, p_session_id, p_motivo, '{}');
  return p_asignacion_id;
end $$;
revoke all on function public.desistir_asignacion_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.desistir_asignacion_srv(uuid, uuid, uuid, text) to service_role;

-- Pago que recibiría el medio con una cuenta (null si la tarifa o la franja ya no aplican: el listado no se cae).
create function private.monto_medio_estimado(p_oferta_id uuid, p_cuenta_social_id uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select p.monto_medio from private.calcular_precio(p_oferta_id, p_cuenta_social_id, private.ahora()) p);
exception when sqlstate 'P0001' then
  return null;
end $$;
revoke all on function private.monto_medio_estimado(uuid, uuid) from public, anon, authenticated;

-- MED-008: ofertas que el medio puede aceptar hoy, con el pago de cada cuenta suya que cabe en un cupo libre. Las que ya
-- tomó van en «Mis campañas» y las que rechazó solo aparecen si se piden.
create function public.marketplace_medio(p_plataforma public.plataforma default null,
                                         p_incluir_rechazadas boolean default false, p_orden text default 'fecha',
                                         p_limite integer default 30, p_desplazamiento integer default 0)
returns table (id uuid, titulo text, formato_id uuid, formato_nombre text, plataforma public.plataforma,
               publicaciones_por_medio smallint, permite_multiples_cupos boolean, ventana_inicio timestamptz,
               ventana_fin timestamptz, fecha_limite_aceptacion timestamptz, permanencia_minima_dias smallint,
               exclusividad_dias smallint, cortes_requeridos public.corte_metrica[], marca text, anunciante_nombre text,
               sector_id uuid, categorias_objetivo uuid[], rechazada_por_mi boolean, vista boolean, pago_maximo numeric,
               cuentas jsonb, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_medio uuid := private.mi_medio_id(); v_umbral integer := private.config_entero('medios.umbral_seguidores');
begin
  if not private.acceso_valido() or not private.tiene_permiso('ofertas.marketplace') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_orden not in ('fecha', 'pago') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Orden no válido.';
  end if;
  return query
  with base as (
    select o.id, o.titulo, o.formato_id, f.nombre as formato_nombre, o.plataforma, o.publicaciones_por_medio,
           o.permite_multiples_cupos, o.ventana_inicio, o.ventana_fin, o.fecha_limite_aceptacion,
           o.permanencia_minima_dias, o.exclusividad_dias, o.cortes_requeridos, c.marca, an.nombre_comercial,
           an.sector_id, o.categorias_objetivo, o.seguidores_minimos,
           exists (select 1 from public.asignaciones a where a.oferta_id = o.id and a.medio_id = v_medio
                     and a.estado = 'RECHAZADA' and a.aceptada_at is null) as rechazada,
           exists (select 1 from public.oferta_vistas v where v.oferta_id = o.id and v.medio_id = v_medio) as vista
    from public.ofertas o
    join public.campanas c on c.id = o.campana_id
    join public.anunciantes an on an.id = o.anunciante_id
    join public.formatos f on f.id = o.formato_id
    where o.deleted_at is null and o.estado in ('PUBLICADA', 'EN_EJECUCION')
      and (p_plataforma is null or o.plataforma = p_plataforma)
      and private.oferta_visible_para(o.id, v_medio)
      and (o.permite_multiples_cupos
           or not exists (select 1 from public.asignaciones a where a.oferta_id = o.id and a.medio_id = v_medio
                            and private.consume_cupo(a.estado, a.estado_previo_disputa)))
  ), pagos as (
    select b.id, max(x.monto) as pago_maximo,
           jsonb_agg(jsonb_build_object('cuenta_social_id', cs.id, 'handle', cs.handle::text, 'franja_clave', fr.clave,
                                        'cupos_restantes', greatest(oc.cupos_totales - oc.cupos_ocupados, 0),
                                        'monto_medio', x.monto)
                     order by x.monto desc nulls last, cs.seguidores_verificados desc) as cuentas
    from base b
    join public.cuentas_sociales cs on cs.medio_id = v_medio and cs.plataforma = b.plataforma and cs.deleted_at is null
     and private.cuenta_vigente(cs.id) and cs.seguidores_verificados >= greatest(v_umbral, coalesce(b.seguidores_minimos, 0))
    join public.franjas fr on fr.id = cs.franja_id
    join public.oferta_cupos oc on oc.oferta_id = b.id and oc.franja_id = cs.franja_id and oc.cupos_ocupados < oc.cupos_totales
    cross join lateral (select private.monto_medio_estimado(b.id, cs.id) as monto) x
    group by b.id
  )
  select b.id, b.titulo, b.formato_id, b.formato_nombre, b.plataforma, b.publicaciones_por_medio, b.permite_multiples_cupos,
         b.ventana_inicio, b.ventana_fin, b.fecha_limite_aceptacion, b.permanencia_minima_dias, b.exclusividad_dias,
         b.cortes_requeridos, b.marca, b.nombre_comercial, b.sector_id, b.categorias_objetivo, b.rechazada, b.vista,
         pg.pago_maximo, pg.cuentas, count(*) over ()
  from base b join pagos pg on pg.id = b.id
  where coalesce(p_incluir_rechazadas, false) or not b.rechazada
  order by case when p_orden = 'pago' then pg.pago_maximo end desc nulls last, b.fecha_limite_aceptacion, b.id
  limit least(greatest(coalesce(p_limite, 30), 1), 100) offset greatest(coalesce(p_desplazamiento, 0), 0);
end $$;
revoke all on function public.marketplace_medio(public.plataforma, boolean, text, integer, integer) from public, anon;
grant execute on function public.marketplace_medio(public.plataforma, boolean, text, integer, integer) to authenticated;

-- MED-008: por qué un medio no ve ofertas (la primera razón que aplica) u OK.
create function public.mi_elegibilidad_marketplace() returns table (motivo text, detalle text)
language plpgsql stable security definer set search_path = '' as $$
declare m public.medios; v_umbral integer := private.config_entero('medios.umbral_seguidores');
begin
  if not private.acceso_valido() or not private.tiene_permiso('ofertas.marketplace') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into m from public.medios x where x.id = private.mi_medio_id() and x.deleted_at is null;
  if m.id is null then
    return query select 'SIN_MEDIO'::text, 'Tu cuenta no está vinculada a un medio.'::text;
  elsif m.estado <> 'VERIFICADO' then
    return query select 'MEDIO_' || m.estado::text,
      case m.estado when 'PENDIENTE' then 'Tu medio aún no está verificado: completa el alta y envíalo a verificación.'
                    when 'RECHAZADO' then 'La verificación de tu medio fue rechazada: corrige lo indicado y vuelve a enviarla.'
                    else 'Tu medio está suspendido: mientras tanto no verás ofertas nuevas.' end;
  elsif m.nivel_verificacion < 1 then
    return query select 'NIVEL_0'::text, 'Tu medio aún no tiene un nivel de verificación.'::text;
  elsif not exists (select 1 from public.cuentas_sociales c
                    where c.medio_id = m.id and c.deleted_at is null and private.cuenta_vigente(c.id)) then
    return query select 'SIN_CUENTA_VIGENTE'::text,
      'Ninguna de tus cuentas tiene la verificación de seguidores al día: reverifícala en Mi medio › Cuentas.'::text;
  elsif not exists (select 1 from public.cuentas_sociales c
                    where c.medio_id = m.id and c.deleted_at is null and private.cuenta_vigente(c.id)
                      and c.seguidores_verificados >= v_umbral) then
    return query select 'BAJO_UMBRAL'::text,
      format('Tus cuentas verificadas tienen menos de %s seguidores, el mínimo para recibir ofertas.',
             replace(to_char(v_umbral, 'FM999,999,999'), ',', '.'));
  else
    return query select 'OK'::text, null::text;
  end if;
end $$;
revoke all on function public.mi_elegibilidad_marketplace() from public, anon;
grant execute on function public.mi_elegibilidad_marketplace() to authenticated;

create or replace function private.liberar_cupo_efecto(p_asignacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- CUP-004: los medios elegibles se enteran de que volvió a haber cupo (como mucho un aviso cada 6 h por oferta).
    if not exists (select 1 from public.notificaciones n
                   where n.tipo = 'oferta.cupo_liberado' and n.entidad_id = o.id::text
                     and n.created_at > v_ahora - interval '6 hours') then
      perform private.notificar(
        (select coalesce(array_agg(distinct u.id), '{}') from public.medios m
           cross join lateral unnest(private.usuarios_medio(m.id)) u (id)
          where m.estado = 'VERIFICADO' and m.deleted_at is null and private.oferta_visible_para(o.id, m.id)),
        'oferta.cupo_liberado',
        jsonb_build_object('oferta', o.titulo, 'fecha_limite', private.formato_fecha(o.fecha_limite_aceptacion)),
        'ofertas', o.id::text, null, 1::smallint);
    end if;
  end if;
end $function$;

-- 3. Mis campañas y próximas acciones del medio --------------------------------------------------------------------

-- MED-011: además de los datos de la asignación, la oferta (título, marca, formato, ventana, cortes) y el plazo para
-- reclamar una vencida; una sola asignación con `p_id`. El multiplicador de calidad se ve siempre (PRC-003).
drop function public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid);
create function public.mis_asignaciones_medio(p_estados public.asignacion_estado[] default null, p_limite integer default 50,
                                              p_antes_id uuid default null, p_id uuid default null)
returns table (id uuid, oferta_id uuid, campana_id uuid, anunciante_id uuid, cuenta_social_id uuid, plataforma public.plataforma,
               slot smallint, estado public.asignacion_estado, estado_previo_disputa public.asignacion_estado,
               causa_cancelacion public.cancelacion_causa, aceptada_at timestamptz, contenido_descargado_at timestamptz,
               publicada_at timestamptz, evidencia_validada_at timestamptz, metricas_cargadas_at timestamptz,
               verificada_at timestamptz, liquidada_at timestamptz, pagada_at timestamptz, rechazada_at timestamptz,
               vencida_at timestamptz, en_disputa_at timestamptz, cancelada_at timestamptz, metricas_atrasadas_at timestamptz,
               fecha_limite_publicacion timestamptz, creativo_descargado_id uuid, franja_id uuid, franja_clave text,
               seguidores_al_aceptar integer, publicaciones smallint, tarifa_base_aplicada numeric,
               multiplicador_calidad_aplicado numeric, multiplicador_geografico_aplicado numeric,
               multiplicador_exclusividad_aplicado numeric, monto_bruto numeric, porcentaje_comision numeric,
               monto_comision numeric, monto_medio numeric, retenciones_aplicadas jsonb, monto_retenciones numeric,
               monto_neto numeric, liquidacion_id uuid, motivo text, created_at timestamptz, updated_at timestamptz,
               oferta_titulo text, marca text, anunciante_nombre text, formato_id uuid, formato_nombre text,
               ventana_inicio timestamptz, ventana_fin timestamptz, fecha_limite_aceptacion timestamptz,
               cortes_requeridos public.corte_metrica[], permanencia_minima_dias smallint, handle text,
               reclamo_hasta timestamptz)
language sql stable security definer set search_path = '' as $$
  with cfg as (select private.config_booleano('comision.visible_para_medio') as visible,
                      make_interval(hours => private.config_entero('disputas.plazo_vencida_horas')) as reclamo)
  select a.id, a.oferta_id, a.campana_id, a.anunciante_id, a.cuenta_social_id, a.plataforma, a.slot, a.estado,
         a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at, a.contenido_descargado_at, a.publicada_at,
         a.evidencia_validada_at, a.metricas_cargadas_at, a.verificada_at, a.liquidada_at, a.pagada_at, a.rechazada_at,
         a.vencida_at, a.en_disputa_at, a.cancelada_at, a.metricas_atrasadas_at, a.fecha_limite_publicacion,
         a.creativo_descargado_id, a.franja_id, a.franja_clave, a.seguidores_al_aceptar, a.publicaciones,
         case when cfg.visible then a.tarifa_base_aplicada end,
         a.multiplicador_calidad_aplicado,
         case when cfg.visible then a.multiplicador_geografico_aplicado end,
         case when cfg.visible then a.multiplicador_exclusividad_aplicado end,
         case when cfg.visible then a.monto_bruto end,
         case when cfg.visible then am.porcentaje_comision end,
         case when cfg.visible then am.monto_comision end,
         am.monto_medio, am.retenciones_aplicadas, am.monto_retenciones, am.monto_neto, a.liquidacion_id, a.motivo,
         a.created_at, a.updated_at,
         o.titulo, c.marca, an.nombre_comercial, o.formato_id, f.nombre, o.ventana_inicio, o.ventana_fin,
         o.fecha_limite_aceptacion, o.cortes_requeridos, o.permanencia_minima_dias, cs.handle::text,
         case when a.estado = 'VENCIDA_SIN_PUBLICAR' then a.vencida_at + cfg.reclamo end
  from public.asignaciones a
  join public.ofertas o on o.id = a.oferta_id
  join public.campanas c on c.id = a.campana_id
  join public.anunciantes an on an.id = a.anunciante_id
  join public.formatos f on f.id = o.formato_id
  left join public.cuentas_sociales cs on cs.id = a.cuenta_social_id
  left join public.asignacion_montos am on am.asignacion_id = a.id
  cross join cfg
  where (select private.acceso_valido())
    and (select private.tiene_permiso('asignaciones.ver_propias'))
    and a.medio_id = (select private.mi_medio_id())
    and a.aceptada_at is not null
    and (p_id is null or a.id = p_id)
    and (p_estados is null or a.estado = any (p_estados))
    and (p_antes_id is null or a.id < p_antes_id)
  order by a.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;
revoke all on function public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid, uuid) from public, anon;
grant execute on function public.mis_asignaciones_medio(public.asignacion_estado[], integer, uuid, uuid) to authenticated;

-- DSH-006: cada acción dice a qué publicación y a qué corte va (botón directo), y la versión nueva del creativo que el
-- medio aún no descarga es una acción más.
drop function public.proximas_acciones_medio(integer);
create function public.proximas_acciones_medio(p_limite integer default 10)
returns table (asignacion_id uuid, oferta_titulo text, accion text, vence_at timestamptz, numero smallint,
               corte public.corte_metrica)
language plpgsql stable security definer set search_path = '' set "TimeZone" to 'America/Bogota' as $$
declare v_me uuid; v_plazo interval := make_interval(hours => private.config_entero('metricas.plazo_carga_horas'));
begin
  perform private.exigir_permiso('inicio.medio');
  v_me := private.mi_medio_id();
  return query
  with abiertas as (
    select a.id, a.oferta_id, a.estado, a.fecha_limite_publicacion, a.creativo_descargado_id
    from public.asignaciones a
    where a.medio_id = v_me
      and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
  ), acciones as (
    select x.id, 'DESCARGAR'::text as accion, x.fecha_limite_publicacion as vence, null::smallint as numero,
           null::public.corte_metrica as corte
    from abiertas x where x.estado = 'ACEPTADA'
    union all
    select x.id, 'DESCARGAR_NUEVA_VERSION', x.fecha_limite_publicacion, null, null
    from abiertas x
    join public.creativos cr on cr.oferta_id = x.oferta_id and cr.vigente
    where x.estado = 'CONTENIDO_ENTREGADO' and x.creativo_descargado_id is distinct from cr.id
    union all
    select x.id, 'CORREGIR_EVIDENCIA', x.fecha_limite_publicacion, p.numero, null
    from abiertas x join public.publicaciones p on p.asignacion_id = x.id and p.estado_validacion = 'RECHAZADA'
    where x.estado = 'CONTENIDO_ENTREGADO'
    union all
    select x.id, 'PUBLICAR', x.fecha_limite_publicacion, null, null
    from abiertas x
    where x.estado = 'CONTENIDO_ENTREGADO'
      and not exists (select 1 from public.publicaciones p where p.asignacion_id = x.id and p.estado_validacion = 'RECHAZADA')
    union all
    select x.id, 'CARGAR_METRICA_' || k.corte::text,
           p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours' when 'H72' then interval '72 hours'
                                              else interval '7 days' end + v_plazo,
           p.numero, k.corte
    from abiertas x
    join public.ofertas o on o.id = x.oferta_id
    join public.publicaciones p on p.asignacion_id = x.id and p.estado_validacion <> 'RECHAZADA'
    cross join unnest(o.cortes_requeridos) k (corte)
    where x.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA') and k.corte <> 'PERSONALIZADO'
      and not exists (select 1 from public.metricas m where m.publicacion_id = p.id and m.corte = k.corte)
    union all
    select x.id, 'CORREGIR_METRICAS', m.validada_at + v_plazo, p.numero, m.corte
    from abiertas x
    join public.metricas m on m.asignacion_id = x.id and m.estado_validacion = 'RECHAZADA'
    join public.publicaciones p on p.id = m.publicacion_id
  )
  select ac.id, o.titulo, ac.accion, min(ac.vence), ac.numero, ac.corte
  from acciones ac
  join public.asignaciones a on a.id = ac.id
  join public.ofertas o on o.id = a.oferta_id
  group by ac.id, o.titulo, ac.accion, ac.numero, ac.corte
  order by min(ac.vence) nulls last, ac.accion, ac.numero
  limit least(greatest(coalesce(p_limite, 10), 1), 100);
end $$;
revoke all on function public.proximas_acciones_medio(integer) from public, anon;
grant execute on function public.proximas_acciones_medio(integer) to authenticated;

-- 4. Ejecución: descarga, evidencia y métricas ---------------------------------------------------------------------

create or replace function public.registrar_descarga_srv(p_asignacion_id uuid, p_actor_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- MED-012: vencido el plazo para publicar ya no hay descarga (el cron la vence en su siguiente pasada).
  if a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO') and private.ahora() > a.fecha_limite_publicacion then
    raise exception using errcode = 'P0001', message = 'AMO_FUERA_DE_VENTANA',
      detail = 'Venció el plazo para publicar: ya no puedes descargar el contenido.';
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
end $function$;

-- INT-002: URL única (forma canónica sin barra final ni mayúsculas) y forma de publicación por plataforma.
create unique index publicaciones_url_post_key on public.publicaciones (lower(rtrim(url_post, '/')));
alter table public.publicaciones drop constraint publicaciones_url_chk;
alter table public.publicaciones add constraint publicaciones_url_chk check (char_length(url_post) <= 500 and (
     (plataforma = 'FACEBOOK' and url_post ~* '^https://(www\.facebook\.com/([^/?#]+/(posts|videos|photos)/([^/?#]+/)?[^/?#]+|reel/[^/?#]+|share/([prv]/)?[^/?#]+|groups/[^/?#]+/(posts|permalink)/[^/?#]+|stories/[^/?#]+(/[^/?#]+)?|(watch|video\.php)\?(.*&)?v=[^&#]+|(photo|photo\.php)\?(.*&)?fbid=[^&#]+|(permalink|story)\.php\?(.*&)?story_fbid=[^&#]+|groups/[^/?#]+\?(.*&)?multi_permalinks=[^&#]+)|fb\.watch/[A-Za-z0-9_-]+)/?([?&][^#]*)?$')
  or (plataforma = 'INSTAGRAM' and url_post ~* '^https://www\.instagram\.com/((p|reel)/[A-Za-z0-9_-]+|stories/[A-Za-z0-9._]+/[0-9]+)/?$')
  or (plataforma = 'TIKTOK' and url_post ~* '^https://(www\.tiktok\.com/(@[A-Za-z0-9._-]+/(video|photo)/[0-9]+|t/[A-Za-z0-9]+)|vm\.tiktok\.com/[A-Za-z0-9]+)/?$')));

-- INT-005 (por fila): impresiones ≥ alcance, interacciones ≤ impresiones, campos de la plataforma.
alter table public.metricas
  add constraint metricas_alcance_impresiones_chk
    check (alcance_norm is null or impresiones_norm is null or impresiones_norm >= alcance_norm),
  add constraint metricas_interacciones_chk check (impresiones_norm is null or interacciones <= impresiones_norm),
  add constraint metricas_campos_plataforma_chk
    check ((plataforma = 'TIKTOK' and alcance is null and impresiones is null)
           or (plataforma <> 'TIKTOK' and espectadores_unicos is null));
-- MED-014: un intervalo personalizado no se repite (reintento idempotente).
create unique index metricas_personalizado_key on public.metricas (publicacion_id, periodo_desde, periodo_hasta)
  where corte = 'PERSONALIZADO';

-- INT-001: la captura (y la miniatura) existen en el bucket `evidencias` y son imágenes.
create function private.fn_captura_en_storage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if tg_op = 'UPDATE' and (new.captura_path, new.miniatura_path) is not distinct from (old.captura_path, old.miniatura_path) then
    return new;
  end if;
  if exists (select 1 from unnest(array[new.captura_path, new.miniatura_path]) r(ruta)
             where r.ruta is not null
               and not exists (select 1 from storage.objects s
                               where s.bucket_id = 'evidencias' and s.name = r.ruta
                                 and s.metadata ->> 'mimetype' like 'image/%')) then
    raise exception using errcode = 'P0001', message = 'AMO_CAPTURA_REQUERIDA',
      detail = 'Carga la captura del panel de estadísticas (imagen) antes de enviar.';
  end if;
  return new;
end $$;
revoke all on function private.fn_captura_en_storage() from public, anon, authenticated, service_role;
create trigger trg_publicaciones_a_validar_captura before insert or update of captura_path, miniatura_path
  on public.publicaciones for each row execute function private.fn_captura_en_storage();
create trigger trg_metricas_a_validar_captura before insert or update of captura_path, miniatura_path
  on public.metricas for each row execute function private.fn_captura_en_storage();

-- INT-005 (entre filas) y MED-014: corte pedido por la oferta, fecha del corte alcanzada y cortes monótonos.
create function private.fn_metricas_coherencia() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pub timestamptz; v_cortes public.corte_metrica[];
  v_tol numeric := 1 - private.config_decimal('metricas.tolerancia_cortes');
  v_alc bigint := coalesce(new.alcance, new.espectadores_unicos);
  v_imp bigint := coalesce(new.impresiones, new.reproducciones);
  v_int bigint := coalesce(new.me_gusta, 0) + coalesce(new.comentarios, 0) + coalesce(new.compartidos, 0)
                  + coalesce(new.guardados, 0);
  v_orden integer := array_position(array['H24', 'H72', 'D7']::public.corte_metrica[], new.corte);
  m record;
begin
  if private.modo_carga() then return new; end if;
  if tg_op = 'UPDATE' and not private.hay_cambios(to_jsonb(old), to_jsonb(new), array['fecha_corte', 'periodo_desde',
       'periodo_hasta', 'alcance', 'impresiones', 'reproducciones', 'espectadores_unicos', 'me_gusta', 'comentarios',
       'compartidos', 'guardados']) then
    return new;
  end if;
  select p.fecha_publicacion, o.cortes_requeridos into v_pub, v_cortes
  from public.publicaciones p join public.asignaciones a on a.id = p.asignacion_id join public.ofertas o on o.id = a.oferta_id
  where p.id = new.publicacion_id;
  if new.corte <> 'PERSONALIZADO' and not (new.corte = any (v_cortes)) then
    raise exception using errcode = 'P0001', message = 'AMO_METRICA_INCOHERENTE', detail = 'La oferta no pide ese corte.';
  end if;
  if new.fecha_corte > private.ahora() + interval '15 minutes' then
    raise exception using errcode = 'P0001', message = 'AMO_METRICA_INCOHERENTE', detail = 'La fecha del corte está en el futuro.';
  end if;
  if new.corte = 'PERSONALIZADO' then
    if new.periodo_desde < private.inicio_dia((v_pub at time zone 'America/Bogota')::date) or new.periodo_hasta > new.fecha_corte then
      raise exception using errcode = 'P0001', message = 'AMO_METRICA_INCOHERENTE',
        detail = 'El intervalo debe empezar el día de la publicación y terminar antes de la fecha del corte.';
    end if;
    return new;
  end if;
  if new.fecha_corte < v_pub + (case new.corte when 'H24' then interval '24 hours' when 'H72' then interval '72 hours'
                                                else interval '7 days' end) then
    raise exception using errcode = 'P0001', message = 'AMO_METRICA_INCOHERENTE',
      detail = 'Aún no se cumple el tiempo del corte desde la publicación.';
  end if;
  for m in select x.corte, x.alcance_norm, x.impresiones_norm, x.interacciones,
                  array_position(array['H24', 'H72', 'D7']::public.corte_metrica[], x.corte) as orden
           from public.metricas x
           where x.publicacion_id = new.publicacion_id and x.id <> new.id and x.corte <> 'PERSONALIZADO'
             and x.estado_validacion <> 'RECHAZADA' loop
    if (m.orden < v_orden and (v_alc < m.alcance_norm * v_tol or v_imp < m.impresiones_norm * v_tol
                               or v_int < m.interacciones * v_tol))
       or (m.orden > v_orden and (m.alcance_norm < v_alc * v_tol or m.impresiones_norm < v_imp * v_tol
                                  or m.interacciones < v_int * v_tol)) then
      raise exception using errcode = 'P0001', message = 'AMO_METRICA_INCOHERENTE',
        detail = format('Los valores no cuadran con el corte %s: un corte posterior no puede tener menos alcance, impresiones o interacciones.', m.corte);
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.fn_metricas_coherencia() from public, anon, authenticated, service_role;
create trigger trg_metricas_b_coherencia before insert or update on public.metricas
  for each row execute function private.fn_metricas_coherencia();

-- El medio corrige solo mientras la asignación admite métricas (no en VERIFICADA, LIQUIDADA, CANCELADA…).
drop policy "metricas: update" on public.metricas;
create policy "metricas: update" on public.metricas for update to authenticated
  using ((select private.tiene_permiso('metricas.validar')) or (select private.tiene_permiso('metricas.editar_validadas'))
         or (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
             and (select private.tiene_permiso('asignaciones.ejecutar')) and private.puedo_cargar_metricas(publicacion_id)))
  with check ((select private.tiene_permiso('metricas.validar')) or (select private.tiene_permiso('metricas.editar_validadas'))
              or (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
                  and (select private.tiene_permiso('asignaciones.ejecutar')) and private.puedo_cargar_metricas(publicacion_id)));

-- NOT-005: aviso de métricas atrasadas por corte (48 h tras cada corte), una vez por asignación y corte.
create table private.avisos_metricas_atrasadas (
  asignacion_id uuid not null references public.asignaciones (id) on delete cascade,
  corte public.corte_metrica not null,
  enviado_at timestamptz not null default private.ahora(),
  constraint avisos_metricas_atrasadas_pkey primary key (asignacion_id, corte)
);
revoke all on table private.avisos_metricas_atrasadas from public, anon, authenticated, service_role;

create or replace function private.generar_recordatorios() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer := 0;
  v_env integer;
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
           where not exists (select 1 from private.recordatorios_metricas e
                             where e.asignacion_id = y.id and e.corte = y.corte) loop
    v_env := private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.recordatorio_metricas',
      jsonb_build_object('oferta_id', x.oferta_id, 'corte', x.corte::text, 'fecha_limite', private.formato_fecha(x.vence + v_plazo)),
      'asignaciones', x.id::text, null, 1::smallint);
    if v_env > 0 then
      insert into private.recordatorios_metricas (asignacion_id, corte) values (x.id, x.corte)
      on conflict (asignacion_id, corte) do nothing;
    end if;
    v_n := v_n + v_env;
  end loop;

  -- NOT-005: plazo de carga vencido para un corte (corte + metricas.plazo_carga_horas), una vez por asignación y corte.
  for x in select a.id, a.oferta_id, a.medio_id, k.corte
           from public.asignaciones a
           join public.ofertas o on o.id = a.oferta_id
           join public.publicaciones p on p.asignacion_id = a.id and p.estado_validacion <> 'RECHAZADA'
           cross join unnest(o.cortes_requeridos) k (corte)
           where a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA')
             and p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours' when 'H72' then interval '72 hours'
                                                    else interval '7 days' end + v_plazo <= v_ahora
             and not exists (select 1 from public.metricas m
                             where m.publicacion_id = p.id and m.corte = k.corte and m.estado_validacion <> 'RECHAZADA')
             and not exists (select 1 from private.avisos_metricas_atrasadas e where e.asignacion_id = a.id and e.corte = k.corte)
           group by a.id, a.oferta_id, a.medio_id, k.corte loop
    v_env := private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.metricas_atrasadas',
      jsonb_build_object('oferta_id', x.oferta_id, 'corte', x.corte::text), 'asignaciones', x.id::text, null, 2::smallint);
    if v_env > 0 then
      insert into private.avisos_metricas_atrasadas (asignacion_id, corte) values (x.id, x.corte)
      on conflict (asignacion_id, corte) do nothing;
    end if;
    v_n := v_n + v_env;
  end loop;
  return v_n;
end $$;
revoke all on function private.generar_recordatorios() from public, anon, authenticated, service_role;


create or replace function public.registrar_evidencia_srv(p_asignacion_id uuid, p_numero integer, p_url text,
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
  -- NOT-006/MED-013: la versión vigente AL PUBLICAR (activado_at, no created_at) o una posterior debe estar descargada.
  select * into cr from public.creativos c
  where c.oferta_id = o.id and c.activado_at is not null and c.activado_at <= p_fecha_publicacion
  order by c.activado_at desc limit 1;
  if cr.id is not null
     and not exists (select 1 from public.descargas_contenido d join public.creativos c2 on c2.id = d.creativo_id
                     where d.asignacion_id = a.id and c2.version >= cr.version) then
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

create or replace function public.activar_creativo_srv(p_creativo_id uuid, p_actor_id uuid, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; cr public.creativos; o public.ofertas; v_clave text; v_req jsonb; v_n integer;
  v_anterior uuid;
begin
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);
  select * into cr from public.creativos c where c.id = p_creativo_id;
  if cr.id is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El creativo no existe.';
  end if;
  select * into o from public.ofertas x where x.id = cr.oferta_id for no key update;
  if not ((v_tipo = 'ANUNCIANTE' and private.tiene_permiso_de(p_actor_id, 'ofertas.gestionar_propias')
           and o.anunciante_id = (select p.anunciante_id from public.perfiles p where p.id = p_actor_id))
          or (v_tipo = 'ADMIN' and private.tiene_permiso_de(p_actor_id, 'ofertas.gestionar'))) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if v_tipo = 'ANUNCIANTE'
     and not exists (select 1 from public.anunciantes an
                     where an.id = o.anunciante_id and an.estado_verificacion = 'VERIFICADO' and an.deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Tu empresa no está verificada (o está suspendida): no puedes activar versiones nuevas del creativo de una oferta publicada.';
  end if;
  if cr.activado_at is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Esta versión ya está activa.';
  end if;
  if o.deleted_at is not null or o.estado not in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La oferta ya no admite versiones nuevas del creativo.';
  end if;
  select f.clave, f.requisitos into v_clave, v_req from public.formatos f where f.id = o.formato_id;
  select count(*)::integer into v_n from public.creativo_archivos f where f.creativo_id = cr.id;
  if v_n = 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Carga al menos un archivo en la versión nueva.';
  end if;
  if v_clave = 'CARRUSEL' and v_n < 2 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Un carrusel necesita al menos 2 archivos.';
  end if;
  if not private.tipo_creativo_valido(cr.tipo, v_clave, v_req) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El tipo de creativo no corresponde al formato elegido.';
  end if;
  select c.id into v_anterior from public.creativos c where c.oferta_id = o.id and c.vigente for update;
  if v_anterior is not null then
    update public.creativos c set vigente = false where c.id = v_anterior;
  end if;
  update public.creativos c set vigente = true, activado_at = private.ahora() where c.id = cr.id;
  perform private.notificar(
    (select coalesce(array_agg(distinct u.id), '{}') from public.asignaciones a
       cross join lateral unnest(private.usuarios_medio(a.medio_id)) u(id)
      where a.oferta_id = o.id and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO')),
    'creativo.actualizado', jsonb_build_object('oferta_id', o.id, 'version', cr.version),
    'ofertas', o.id::text, null, 1::smallint);
  return jsonb_build_object('creativo_id', cr.id, 'version', cr.version, 'reemplaza_a', v_anterior);
end $$;

create or replace function private.marcar_metricas_atrasadas(p_limite integer) returns integer
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
    where a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA') and a.metricas_atrasadas_at is null
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
      where a.id = x.id and a.metricas_atrasadas_at is null and a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA');
      if found then
        v_n := v_n + 1;                       -- el aviso al medio ya salió por corte (generar_recordatorios)
      end if;
    exception when lock_not_available then
      raise log 'amo cron: asignación % ocupada (métricas atrasadas), se reintenta', x.id;
    end;
  end loop;
  return v_n;
end $$;

-- 5. Seguimiento del anunciante ------------------------------------------------------------------------------------

-- ANU-011: cada asignación aceptada de la campaña con el medio (perfil público: nombre, municipio, nivel), la cuenta
-- usada, sus publicaciones y los cortes APROBADOS; nunca documentos, datos bancarios ni lo que recibe el medio.
create function public.seguimiento_campana(p_campana_id uuid)
returns table (asignacion_id uuid, oferta_id uuid, oferta_titulo text, plataforma public.plataforma, slot smallint,
               estado public.asignacion_estado, estado_previo_disputa public.asignacion_estado,
               causa_cancelacion public.cancelacion_causa, aceptada_at timestamptz, contenido_descargado_at timestamptz,
               fecha_limite_publicacion timestamptz, publicada_at timestamptz, evidencia_validada_at timestamptz,
               metricas_cargadas_at timestamptz, verificada_at timestamptz, vencida_at timestamptz, en_disputa_at timestamptz,
               cancelada_at timestamptz, monto_bruto numeric, medio_id uuid, medio_nombre text, municipio_codigo char(5),
               departamento_codigo char(2), nivel_verificacion smallint, cuenta jsonb, publicaciones jsonb)
language plpgsql stable security definer set search_path = '' set "TimeZone" to 'America/Bogota' as $$
declare v_an uuid := private.mi_anunciante_id();
begin
  perform private.exigir_permiso('asignaciones.ver_propias', 'asignaciones.ver');
  return query
  select a.id, a.oferta_id, o.titulo, a.plataforma, a.slot, a.estado, a.estado_previo_disputa, a.causa_cancelacion,
         a.aceptada_at, a.contenido_descargado_at, a.fecha_limite_publicacion, a.publicada_at, a.evidencia_validada_at,
         a.metricas_cargadas_at, a.verificada_at, a.vencida_at, a.en_disputa_at, a.cancelada_at, a.monto_bruto,
         m.id, m.nombre, m.municipio_codigo, m.departamento_codigo, m.nivel_verificacion,
         jsonb_build_object('plataforma', a.plataforma, 'handle', cs.handle::text, 'url', cs.url,
                            'seguidores_al_aceptar', a.seguidores_al_aceptar, 'franja_clave', a.franja_clave),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', p.id, 'numero', p.numero, 'url_post', p.url_post, 'fecha_publicacion', p.fecha_publicacion,
                     'estado_validacion', p.estado_validacion, 'con_captura', p.captura_path is not null,
                     'cortes', coalesce((select jsonb_agg(jsonb_build_object(
                                  'corte', mt.corte, 'fecha_corte', mt.fecha_corte, 'alcance', mt.alcance_norm,
                                  'impresiones', mt.impresiones_norm, 'interacciones', mt.interacciones,
                                  'reproducciones', mt.reproducciones, 'clics', mt.clics_enlace) order by mt.fecha_corte)
                                from public.metricas mt
                                where mt.publicacion_id = p.id and mt.estado_validacion = 'APROBADA'
                                  and mt.corte <> 'PERSONALIZADO'), '[]'::jsonb)) order by p.numero)
                   from public.publicaciones p where p.asignacion_id = a.id), '[]'::jsonb)
  from public.asignaciones a
  join public.ofertas o on o.id = a.oferta_id
  join public.medios m on m.id = a.medio_id
  left join public.cuentas_sociales cs on cs.id = a.cuenta_social_id
  where a.campana_id = p_campana_id and a.aceptada_at is not null
    and (a.anunciante_id = v_an or (v_an is null and private.tiene_permiso('asignaciones.ver')))
  order by a.aceptada_at desc, a.id;
end $$;
revoke all on function public.seguimiento_campana(uuid) from public, anon;
grant execute on function public.seguimiento_campana(uuid) to authenticated;

-- El anunciante ve solo las métricas aprobadas (las pendientes traen alertas antifraude del medio) y no ve qué medios
-- rechazaron sus ofertas sin aceptarlas.
drop policy "metricas: select" on public.metricas;
create policy "metricas: select" on public.metricas for select to authenticated
  using ((select private.tiene_permiso('asignaciones.ver')) or medio_id = (select private.mi_medio_id())
         or (anunciante_id = (select private.mi_anunciante_id()) and estado_validacion = 'APROBADA'));

drop policy "asignaciones: select interno o anunciante" on public.asignaciones;
create policy "asignaciones: select interno o anunciante" on public.asignaciones for select to authenticated
  using ((select private.tiene_permiso('asignaciones.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and aceptada_at is not null
             and (select private.tiene_permiso('asignaciones.ver_propias'))));

-- 6. Calidad (PRC-004) ---------------------------------------------------------------------------------------------

-- Mediana del índice de la franja con la que se calculó el multiplicador (la UI explica el cambio sin la notificación).
alter table public.cuentas_sociales add column indice_franja numeric(9, 6);
grant select (indice_franja) on public.cuentas_sociales to authenticated;
insert into private.auditoria_columnas (tabla, columna, tratamiento) values ('cuentas_sociales', 'indice_franja', 'OMITIR')
on conflict (tabla, columna) do update set tratamiento = excluded.tratamiento;

create or replace function private.recalcular_multiplicadores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           indice_franja = round(least(x.im, 99.999999)::numeric, 6),
           multiplicador_proximo = case when x.mult = x.multiplicador_calidad then null
                                        when x.multiplicador_proximo = x.mult then c.multiplicador_proximo
                                        else x.mult end,
           multiplicador_proximo_desde = case when x.mult = x.multiplicador_calidad then null
                                              when x.multiplicador_proximo = x.mult then c.multiplicador_proximo_desde
                                              else v_desde end
     where c.id = x.id;
    if x.mult <> x.multiplicador_calidad and x.multiplicador_proximo is distinct from x.mult then
      perform private.notificar(private.usuarios_medio(x.medio_id), 'multiplicador.cambio_programado',
        jsonb_build_object('handle', x.handle,
                           'actual', replace(to_char(x.multiplicador_calidad, 'FM0.00'), '.', ','),
                           'proximo', replace(to_char(x.mult, 'FM0.00'), '.', ','),
                           'fecha', to_char(v_desde at time zone 'America/Bogota', 'DD/MM/YYYY'),
                           'indice', replace(to_char(round(x.indice::numeric, 4), 'FM0.0000'), '.', ','),
                           'indice_franja', replace(to_char(round(x.im::numeric, 4), 'FM0.0000'), '.', ','),
                           'n', x.n),
        'cuentas_sociales', x.id::text, null, 1::smallint);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $function$;

-- El cambio programado entra a las 00:01 de Bogotá (05:01 UTC), cuando empieza su día de vigencia: antes se aplicaba a
-- las 03:00 y quien aceptaba entre medianoche y esa hora se llevaba el multiplicador viejo.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'amo_indicadores_medios') then
    perform cron.alter_job(job_id := (select jobid from cron.job where jobname = 'amo_indicadores_medios'),
                           schedule := '1 5 * * *');
  end if;
end $$;
