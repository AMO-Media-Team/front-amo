-- Migración E3a · e3_validacion (docs/modelo-datos.md §3.12)
-- Fase 4 de las Entregas 2 y 3: validación de evidencias y métricas con alertas (ADM-007, ADM-008, INT-003, INT-004),
-- verificación de la asignación como puerta a pago (ADM-009), cancelación con causa (ADM-010, INT-006), disputas
-- (ADM-011, ADM-012) y suspensión de medios (ADM-002).
--   1. Configuración y plantillas
--   2. Validación atómica de evidencias y métricas, corrección auditada y cancelación con causa (*_srv)
--   3. Alertas por cuenta (alcance o impresiones), persistentes, e invisibles para medio y anunciante
--   4. Colas del equipo AMO
--   5. Condiciones de transición y puerta a pago
--   6. Disputas: reclamo de una vencida, mensajes con su parte, avisos, métricas durante la disputa
--   7. Medio: reclamar desde el inicio, suspensión con su motivo, recarga tras un rechazo tardío


-- 1. Configuración y plantillas ----------------------------------------------------------------------------------

insert into public.configuracion (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica,
                                  pendiente_validacion) values
  ('evidencias.plazo_recarga_horas', '24', 'ENTERO', 1, 168, null, 'metricas',
   'Horas que tiene el medio para cargar una evidencia nueva cuando el equipo AMO la rechaza con el plazo de publicación ya vencido o por vencer.',
   'h', true, true),
  ('soporte.correo', '""', 'TEXTO', null, null, null, 'disputas',
   'Correo de soporte que ven medios y anunciantes cuando necesitan escribirle al equipo AMO (vacío: solo se ofrecen los reclamos y disputas de la plataforma).',
   null, true, true)
on conflict (clave) do nothing;

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('asignacion.reabierta', 'APP', 'Reclamo a tu favor', null,
   'Tu reclamo sobre «{{oferta}}» prosperó: carga la evidencia de la publicación antes del {{plazo}}.', array['oferta', 'plazo']),
  ('cola.disputa_mensaje', 'APP', 'Mensaje en una disputa', null,
   'Una de las partes escribió en la disputa sobre «{{oferta}}».', array['oferta'])
on conflict (clave, canal) do nothing;

update public.plantillas_notificacion
   set cuerpo = 'La evidencia de publicación de «{{oferta}}» fue rechazada: {{motivo}}. Carga una evidencia nueva antes del {{plazo}}.',
       variables = array['oferta', 'motivo', 'plazo']
 where clave = 'evidencia.rechazada' and canal = 'APP';
update public.plantillas_notificacion
   set cuerpo = 'Las métricas de {{corte}}{{publicacion}} de «{{oferta}}» fueron rechazadas: {{motivo}}.',
       variables = array['oferta', 'corte', 'publicacion', 'motivo']
 where clave = 'metricas.rechazadas' and canal = 'APP';


-- 2. Validación, corrección y cancelación ---------------------------------------------------------------------------

-- ADM-007: decidir sobre una publicación y mover la asignación en la misma transacción (aprobar la última →
-- EVIDENCIA_VALIDADA; rechazar → CONTENIDO_ENTREGADO con plazo de recarga).
create function public.validar_evidencia_srv(p_publicacion_id uuid, p_aprobar boolean, p_etiqueta_verificada boolean,
  p_observaciones text, p_actor_id uuid, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; v_asig uuid; a public.asignaciones; v_obs text := left(nullif(btrim(p_observaciones), ''), 1000);
begin
  v_tipo := private.validar_actor(p_actor_id, 'evidencias.validar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select p.asignacion_id into v_asig from public.publicaciones p where p.id = p_publicacion_id;
  if v_asig is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La evidencia no existe.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform private.bloquear_transicion('asignaciones', v_asig,
                                      case when p_aprobar then 'EVIDENCIA_VALIDADA' else 'CONTENIDO_ENTREGADO' end);
  if p_aprobar then
    if not coalesce(p_etiqueta_verificada, false) then
      raise exception using errcode = 'P0001', message = 'AMO_ETIQUETA_REQUERIDA',
        detail = 'Verifica que la etiqueta de publicidad sea visible antes de aprobar.';
    end if;
    perform public.transicionar_srv('publicaciones', p_publicacion_id, 'APROBADA', p_actor_id, p_session_id, v_obs,
                                    jsonb_build_object('etiqueta_verificada', true, 'observaciones', v_obs));
    select * into a from public.asignaciones x where x.id = v_asig;
    if a.estado = 'PUBLICADA'
       and (select count(*) from public.publicaciones p
            where p.asignacion_id = a.id and p.estado_validacion = 'APROBADA') >= a.publicaciones then
      perform public.transicionar_srv('asignaciones', a.id, 'EVIDENCIA_VALIDADA', p_actor_id, p_session_id, null, '{}');
    end if;
  else
    if v_obs is null then
      raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica qué debe corregir el medio.';
    end if;
    -- El medio recarga dentro de un plazo útil aunque el de publicación ya haya vencido o esté por vencer (el cron no
    -- la vence en el siguiente ciclo). Va antes del rechazo: el aviso al medio dice el plazo nuevo.
    update public.asignaciones x
       set fecha_limite_publicacion = greatest(x.fecha_limite_publicacion,
             private.ahora() + make_interval(hours => private.config_entero('evidencias.plazo_recarga_horas')))
     where x.id = v_asig and x.estado in ('CONTENIDO_ENTREGADO', 'PUBLICADA');
    perform public.transicionar_srv('publicaciones', p_publicacion_id, 'RECHAZADA', p_actor_id, p_session_id, v_obs,
                                    jsonb_build_object('observaciones', v_obs));
    if (select x.estado from public.asignaciones x where x.id = v_asig) = 'PUBLICADA' then
      perform public.transicionar_srv('asignaciones', v_asig, 'CONTENIDO_ENTREGADO', p_actor_id, p_session_id, v_obs, '{}');
    end if;
  end if;
  select * into a from public.asignaciones x where x.id = v_asig;
  return jsonb_build_object('asignacion_id', a.id, 'estado', a.estado, 'fecha_limite_publicacion', a.fecha_limite_publicacion);
end $$;
revoke all on function public.validar_evidencia_srv(uuid, boolean, boolean, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.validar_evidencia_srv(uuid, boolean, boolean, text, uuid, uuid) to service_role;


-- ADM-008: aprobar o rechazar una métrica; al rechazar, la asignación que ya tenía todo cargado vuelve a
-- EVIDENCIA_VALIDADA en la misma transacción (D10: METRICAS_CARGADAS nunca convive con una métrica rechazada).
create function public.validar_metrica_srv(p_metrica_id uuid, p_aprobar boolean, p_observaciones text, p_actor_id uuid,
  p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; v_asig uuid; v_obs text := left(nullif(btrim(p_observaciones), ''), 1000); v_estado text;
begin
  v_tipo := private.validar_actor(p_actor_id, 'metricas.validar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select m.asignacion_id into v_asig from public.metricas m where m.id = p_metrica_id;
  if v_asig is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La métrica no existe.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform private.bloquear_transicion('asignaciones', v_asig, 'EVIDENCIA_VALIDADA');
  if p_aprobar then
    perform public.transicionar_srv('metricas', p_metrica_id, 'APROBADA', p_actor_id, p_session_id, v_obs,
                                    jsonb_build_object('observaciones', v_obs));
  else
    if v_obs is null then
      raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica qué debe corregir el medio.';
    end if;
    perform public.transicionar_srv('metricas', p_metrica_id, 'RECHAZADA', p_actor_id, p_session_id, v_obs,
                                    jsonb_build_object('observaciones', v_obs));
    if (select x.estado from public.asignaciones x where x.id = v_asig) = 'METRICAS_CARGADAS' then
      perform public.transicionar_srv('asignaciones', v_asig, 'EVIDENCIA_VALIDADA', p_actor_id, p_session_id, v_obs, '{}');
    end if;
  end if;
  select x.estado::text into v_estado from public.asignaciones x where x.id = v_asig;
  return jsonb_build_object('asignacion_id', v_asig, 'estado', v_estado);
end $$;
revoke all on function public.validar_metrica_srv(uuid, boolean, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.validar_metrica_srv(uuid, boolean, text, uuid, uuid) to service_role;


-- ADM-008 c2: corrección auditada de una métrica APROBADA (motivo obligatorio; la bitácora guarda actor y motivo).
create function public.corregir_metrica_srv(p_metrica_id uuid, p_valores jsonb, p_motivo text, p_actor_id uuid,
  p_session_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; m public.metricas; v_motivo text := nullif(btrim(p_motivo), '');
  v_cols text[] := array['fecha_corte', 'alcance', 'impresiones', 'reproducciones', 'espectadores_unicos', 'me_gusta',
    'comentarios', 'compartidos', 'guardados', 'clics_enlace', 'visitas_perfil', 'tiempo_promedio_visualizacion_s',
    'porcentaje_reproduccion_completa'];
  v_nueva public.metricas;
begin
  v_tipo := private.validar_actor(p_actor_id, 'metricas.editar_validadas', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if v_motivo is null or char_length(v_motivo) < 10 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Explica qué corriges y por qué.';
  end if;
  if jsonb_typeof(p_valores) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_valores) k where k <> all (v_cols)) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Campos de la corrección no válidos.';
  end if;
  select * into m from public.metricas x where x.id = p_metrica_id for update;
  if m.id is null or m.estado_validacion <> 'APROBADA' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se corrige una métrica aprobada; una pendiente se aprueba o se rechaza.';
  end if;
  v_nueva := jsonb_populate_record(m, p_valores);
  if not private.hay_cambios(to_jsonb(m), to_jsonb(v_nueva), v_cols) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La corrección no cambia nada.';
  end if;
  perform set_config('amo.actor_id', p_actor_id::text, true);
  perform set_config('amo.motivo', v_motivo, true);
  update public.metricas x set fecha_corte = v_nueva.fecha_corte, alcance = v_nueva.alcance, impresiones = v_nueva.impresiones,
         reproducciones = v_nueva.reproducciones, espectadores_unicos = v_nueva.espectadores_unicos,
         me_gusta = v_nueva.me_gusta, comentarios = v_nueva.comentarios, compartidos = v_nueva.compartidos,
         guardados = v_nueva.guardados, clics_enlace = v_nueva.clics_enlace, visitas_perfil = v_nueva.visitas_perfil,
         tiempo_promedio_visualizacion_s = v_nueva.tiempo_promedio_visualizacion_s,
         porcentaje_reproduccion_completa = v_nueva.porcentaje_reproduccion_completa,
         observaciones = left(coalesce(x.observaciones || ' · ', '') || 'Corrección: ' || v_motivo, 1000)
   where x.id = m.id;
  perform set_config('amo.motivo', '', true);
  return m.id;
end $$;
revoke all on function public.corregir_metrica_srv(uuid, jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.corregir_metrica_srv(uuid, jsonb, text, uuid, uuid) to service_role;


-- ADM-010 / INT-006: cancelación con causa y, con fraude o incumplimiento, suspensión del medio en la misma transacción.
create function public.cancelar_asignacion_srv(p_asignacion_id uuid, p_causa public.cancelacion_causa, p_motivo text,
  p_suspender_medio boolean, p_actor_id uuid, p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; a public.asignaciones; v_suspendido boolean := false;
begin
  v_tipo := private.validar_actor(p_actor_id, 'asignaciones.gestionar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_causa is null then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica la causa de la cancelación.';
  end if;
  select * into a from public.asignaciones x where x.id = p_asignacion_id;
  if a.estado in ('LIQUIDADA', 'PAGADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La asignación ya está en una liquidación: anula primero la liquidación.', hint = 'liquidacion_vigente';
  elsif a.estado = 'EN_DISPUTA' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La asignación está en disputa: cancélala al resolver la disputa.', hint = 'en_disputa';
  end if;
  if coalesce(p_suspender_medio, false) and p_causa not in ('FRAUDE', 'INCUMPLIMIENTO_MEDIO') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La suspensión acompaña solo una cancelación por fraude o incumplimiento del medio.';
  end if;
  perform public.transicionar_srv('asignaciones', a.id, 'CANCELADA', p_actor_id, p_session_id, p_motivo,
                                  jsonb_build_object('causa', p_causa));
  if coalesce(p_suspender_medio, false)
     and (select m.estado from public.medios m where m.id = a.medio_id) = 'VERIFICADO' then
    perform public.transicionar_srv('medios', a.medio_id, 'SUSPENDIDO', p_actor_id, p_session_id, p_motivo, '{}');
    v_suspendido := true;
  end if;
  return jsonb_build_object('asignacion_id', a.id, 'estado', 'CANCELADA', 'medio_suspendido', v_suspendido);
end $$;
revoke all on function public.cancelar_asignacion_srv(uuid, public.cancelacion_causa, text, boolean, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancelar_asignacion_srv(uuid, public.cancelacion_causa, text, boolean, uuid, uuid)
  to service_role;


-- 3. Alertas antifraude ----------------------------------------------------------------------------------------------

-- INT-003: historial de la MISMA CUENTA y el mismo corte (al menos metricas.minimo_historial aprobadas, sin las de
-- asignaciones canceladas por fraude), con alcance o impresiones fuera de mediana × / ÷ factor. INT-004: alcance sobre
-- el múltiplo de seguidores por plataforma.
create or replace function private.fn_metricas_alertas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_alcance bigint := coalesce(new.alcance, new.espectadores_unicos);
  v_impr bigint := coalesce(new.impresiones, new.reproducciones);
  v_cuenta uuid; v_seguidores integer; v_multiplo numeric;
  v_factor numeric := private.config_decimal('metricas.factor_desviacion');
  v_minimo integer := private.config_entero('metricas.minimo_historial');
  v_med_alc numeric; v_med_imp numeric; v_n integer;
begin
  if tg_op = 'UPDATE' and not private.hay_cambios(to_jsonb(old), to_jsonb(new), array['alcance', 'espectadores_unicos',
       'impresiones', 'reproducciones', 'corte', 'publicacion_id']) then
    return new;
  end if;
  select a.cuenta_social_id, a.seguidores_al_aceptar into v_cuenta, v_seguidores
  from public.asignaciones a where a.id = new.asignacion_id;
  v_multiplo := (private.config_valor('metricas.multiplo_alcance_seguidores') ->> new.plataforma::text)::numeric;
  select percentile_cont(0.5) within group (order by m.alcance_norm),
         percentile_cont(0.5) within group (order by m.impresiones_norm), count(*)
    into v_med_alc, v_med_imp, v_n
  from public.metricas m join public.asignaciones a on a.id = m.asignacion_id
  where a.cuenta_social_id = v_cuenta and not (a.estado = 'CANCELADA' and a.causa_cancelacion = 'FRAUDE')
    and m.corte = new.corte
    and m.estado_validacion = 'APROBADA' and m.publicacion_id <> new.publicacion_id and m.alcance_norm is not null;
  new.alerta_multiplo := coalesce(v_alcance > v_multiplo * v_seguidores, false);
  new.alerta_desviacion := coalesce(v_n >= v_minimo and (
       (v_med_alc > 0 and (v_alcance > v_med_alc * v_factor or v_alcance < v_med_alc / v_factor))
    or (v_med_imp > 0 and (v_impr > v_med_imp * v_factor or v_impr < v_med_imp / v_factor))), false);
  new.detalle_alertas := jsonb_build_object('mediana_historica', v_med_alc, 'mediana_impresiones', v_med_imp,
    'n_historial', v_n, 'factor', v_factor, 'seguidores', v_seguidores, 'multiplo', v_multiplo,
    'alcance', v_alcance, 'impresiones', v_impr, 'limite_alcance', v_multiplo * v_seguidores);
  -- Una alerta no se borra corrigiendo las cifras: el validador ve también la que tuvo (con sus cifras de entonces).
  if tg_op = 'UPDATE' and (old.alerta_desviacion or old.alerta_multiplo) then
    new.detalle_alertas := new.detalle_alertas || jsonb_build_object('alerta_previa',
      (old.detalle_alertas - 'alerta_previa') || jsonb_build_object('desviacion', old.alerta_desviacion,
                                                                     'multiplo_superado', old.alerta_multiplo));
  end if;
  return new;
end $$;

-- La corrección del medio (RECHAZADA → PENDIENTE sin estado en el SET) también avisa a la cola.
drop trigger trg_metricas_z_avisar_cola on public.metricas;
create trigger trg_metricas_z_avisar_cola after insert on public.metricas
  for each row execute function private.fn_avisar_cola();
create trigger trg_metricas_z_avisar_cola_correccion after update on public.metricas
  for each row when (old.estado_validacion = 'RECHAZADA' and new.estado_validacion = 'PENDIENTE')
  execute function private.fn_avisar_cola();

-- Las alertas son una herramienta del equipo AMO: ni el medio (podría ajustar cifras hasta quedar bajo el umbral) ni
-- el anunciante las leen. El equipo las consulta con alertas_metricas y las colas.
do $$
declare v_columnas text;
begin
  select string_agg(quote_ident(c.attname), ', ' order by c.attnum) into v_columnas
  from pg_attribute c
  where c.attrelid = 'public.metricas'::regclass and c.attnum > 0 and not c.attisdropped
    and c.attname not in ('alerta_desviacion', 'alerta_multiplo', 'detalle_alertas');
  execute 'revoke select on public.metricas from authenticated';
  execute format('grant select (%s) on public.metricas to authenticated', v_columnas);
end $$;

create function public.alertas_metricas(p_asignacion_id uuid default null, p_medio_id uuid default null)
returns table (metrica_id uuid, asignacion_id uuid, estado_validacion public.validacion_estado, created_at timestamptz,
               alerta_desviacion boolean, alerta_multiplo boolean, detalle_alertas jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.acceso_valido() or not private.tiene_permiso('asignaciones.ver') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  -- Con asignación: todas sus métricas. Con medio: las que tuvieron alerta (ficha del medio). Sin ninguno: las
  -- pendientes con alerta (panel y filtro de Operación).
  return query
  select m.id, m.asignacion_id, m.estado_validacion, m.created_at, m.alerta_desviacion, m.alerta_multiplo, m.detalle_alertas
  from public.metricas m
  where case when p_asignacion_id is not null then m.asignacion_id = p_asignacion_id
             when p_medio_id is not null then m.medio_id = p_medio_id and (m.alerta_desviacion or m.alerta_multiplo)
             else m.estado_validacion = 'PENDIENTE' and (m.alerta_desviacion or m.alerta_multiplo) end
  order by m.created_at, m.id;
end $$;
revoke all on function public.alertas_metricas(uuid, uuid) from public, anon;
grant execute on function public.alertas_metricas(uuid, uuid) to authenticated;


-- 4. Colas del equipo AMO (lo más antiguo primero; las métricas con alerta arriba) ----------------------------------

-- ADM-007: evidencias pendientes de asignaciones en curso, con acceso directo al post y a la captura.
create function public.cola_evidencias(p_limite integer default 50, p_desplazamiento integer default 0)
returns table (publicacion_id uuid, asignacion_id uuid, numero smallint, publicaciones smallint, plataforma public.plataforma,
  url_post text, fecha_publicacion timestamptz, captura_path text, miniatura_path text, enviada_at timestamptz,
  observaciones_previas text, medio_id uuid, medio_nombre text, handle text, cuenta_url text, oferta_id uuid, oferta_titulo text,
  marca text, ventana_inicio timestamptz, ventana_fin timestamptz, permanencia_hasta timestamptz,
  asignacion_estado public.asignacion_estado, total bigint)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.asignacion_id, p.numero, a.publicaciones, p.plataforma, p.url_post, p.fecha_publicacion, p.captura_path,
         p.miniatura_path, p.updated_at,
         p.observaciones,
         m.id, m.nombre, c.handle::text, c.url, o.id, o.titulo, ca.marca, o.ventana_inicio, o.ventana_fin,
         p.permanencia_hasta, a.estado, count(*) over ()
  from public.publicaciones p
  join public.asignaciones a on a.id = p.asignacion_id
  join public.ofertas o on o.id = a.oferta_id
  join public.campanas ca on ca.id = a.campana_id
  join public.medios m on m.id = a.medio_id
  left join public.cuentas_sociales c on c.id = a.cuenta_social_id
  where p.estado_validacion = 'PENDIENTE' and (select private.acceso_valido())
    and (select private.tiene_permiso('evidencias.validar'))
    and a.estado in ('CONTENIDO_ENTREGADO', 'PUBLICADA')
  order by p.updated_at, p.id
  limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_desplazamiento, 0), 0) $$;
revoke all on function public.cola_evidencias(integer, integer) from public, anon;
grant execute on function public.cola_evidencias(integer, integer) to authenticated;

-- ADM-008: métricas pendientes con sus alertas y su porqué (definer: las columnas de alertas no son de lectura pública).
create function public.cola_metricas(p_solo_alertas boolean default false, p_limite integer default 50,
  p_desplazamiento integer default 0)
returns table (metrica_id uuid, publicacion_id uuid, asignacion_id uuid, numero smallint, corte public.corte_metrica,
  fecha_corte timestamptz, plataforma public.plataforma, alcance bigint, impresiones bigint, reproducciones bigint,
  espectadores_unicos bigint, interacciones bigint, clics_enlace bigint, captura_path text, miniatura_path text,
  alerta_desviacion boolean, alerta_multiplo boolean, detalle_alertas jsonb, evidencia_aprobada boolean, enviada_at timestamptz,
  medio_id uuid, medio_nombre text, handle text, seguidores_al_aceptar integer, oferta_titulo text,
  asignacion_estado public.asignacion_estado, total bigint)
language sql stable security definer set search_path = '' as $$
  select x.id, x.publicacion_id, x.asignacion_id, p.numero, x.corte, x.fecha_corte, x.plataforma, x.alcance, x.impresiones,
         x.reproducciones, x.espectadores_unicos, x.interacciones, x.clics_enlace, x.captura_path, x.miniatura_path,
         x.alerta_desviacion, x.alerta_multiplo, x.detalle_alertas, p.estado_validacion = 'APROBADA', x.updated_at,
         m.id, m.nombre, c.handle::text, a.seguidores_al_aceptar, o.titulo, a.estado, count(*) over ()
  from public.metricas x
  join public.publicaciones p on p.id = x.publicacion_id
  join public.asignaciones a on a.id = x.asignacion_id
  join public.ofertas o on o.id = a.oferta_id
  join public.medios m on m.id = a.medio_id
  left join public.cuentas_sociales c on c.id = a.cuenta_social_id
  where x.estado_validacion = 'PENDIENTE' and (select private.acceso_valido())
    and (select private.tiene_permiso('metricas.validar'))
    and a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
    and (not coalesce(p_solo_alertas, false) or x.alerta_desviacion or x.alerta_multiplo)
  order by (x.alerta_desviacion or x.alerta_multiplo) desc, x.updated_at, x.id
  limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_desplazamiento, 0), 0) $$;
revoke all on function public.cola_metricas(boolean, integer, integer) from public, anon;
grant execute on function public.cola_metricas(boolean, integer, integer) to authenticated;

-- ADM-009: asignaciones con todo cargado, listas para verificar o con lo que falta.
create function public.cola_verificacion(p_limite integer default 50, p_desplazamiento integer default 0)
returns table (asignacion_id uuid, oferta_id uuid, oferta_titulo text, marca text, medio_id uuid, medio_nombre text,
               handle text, plataforma public.plataforma, publicaciones smallint, metricas_cargadas_at timestamptz,
               cortes_requeridos integer, cortes_aprobados integer, metricas_pendientes integer, metricas_con_alerta integer,
               permanencia_hasta timestamptz, lista boolean, bloqueo text, total bigint)
language sql stable security definer set search_path = '' as $$
  with base as (
    select a.id, a.oferta_id, o.titulo, ca.marca, a.medio_id, me.nombre, c.handle::text as handle, a.plataforma,
           a.publicaciones, a.metricas_cargadas_at,
           a.publicaciones * coalesce(cardinality(o.cortes_requeridos), 0) as requeridos,
           (select count(*) from public.publicaciones p cross join unnest(o.cortes_requeridos) k (corte)
            where p.asignacion_id = a.id
              and exists (select 1 from public.metricas m
                          where m.publicacion_id = p.id and m.corte = k.corte and m.estado_validacion = 'APROBADA'))::integer
             as aprobados,
           (select count(*) from public.metricas m where m.asignacion_id = a.id and m.estado_validacion = 'PENDIENTE')::integer
             as pendientes,
           (select count(*) from public.metricas m
            where m.asignacion_id = a.id and (m.alerta_desviacion or m.alerta_multiplo))::integer as con_alerta,
           (select max(p.permanencia_hasta) from public.publicaciones p
            where p.asignacion_id = a.id and p.permanencia_verificada_at is null) as permanencia
    from public.asignaciones a
    join public.ofertas o on o.id = a.oferta_id
    join public.campanas ca on ca.id = a.campana_id
    join public.medios me on me.id = a.medio_id
    left join public.cuentas_sociales c on c.id = a.cuenta_social_id
    where a.estado = 'METRICAS_CARGADAS' and (select private.acceso_valido())
      and (select private.tiene_permiso('metricas.validar'))
  )
  select b.id, b.oferta_id, b.titulo, b.marca, b.medio_id, b.nombre, b.handle, b.plataforma, b.publicaciones,
         b.metricas_cargadas_at, b.requeridos, b.aprobados, b.pendientes, b.con_alerta, b.permanencia,
         b.aprobados >= b.requeridos and b.pendientes = 0 and (b.permanencia is null or b.permanencia <= private.ahora()),
         case when b.aprobados < b.requeridos or b.pendientes > 0 then 'METRICAS'
              when b.permanencia > private.ahora() then 'PERMANENCIA' end,
         count(*) over ()
  from base b
  order by (b.aprobados >= b.requeridos and b.pendientes = 0 and (b.permanencia is null or b.permanencia <= private.ahora())) desc,
           b.metricas_cargadas_at, b.id
  limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_desplazamiento, 0), 0) $$;
revoke all on function public.cola_verificacion(integer, integer) from public, anon;
grant execute on function public.cola_verificacion(integer, integer) to authenticated;


-- 5. Condiciones de transición y puerta a pago ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.validar_condicion_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text, p_actor_tipo transicion_actor, p_actor_id uuid, p_motivo text, p_datos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_clave text := p_entidad || ':' || p_desde || '→' || p_hacia; r record; v_dest text; v_previo text;
  v_n integer; v_suma numeric; v_fuera integer;
begin
  -- Puertas de pago (§6.2): una liquidación solo se aprueba o se paga si corresponde exactamente a sus asignaciones
  -- LIQUIDADA (que solo salen de VERIFICADA por generar_liquidacion_srv).
  if p_entidad = 'liquidaciones' and p_hacia in ('APROBADA', 'PAGADA') then
    select l.cantidad_asignaciones, l.monto_medio into r from public.liquidaciones l where l.id = p_id;
    select count(*)::integer, coalesce(sum(am.monto_medio), 0), (count(*) filter (where a.estado <> 'LIQUIDADA'))::integer
      into v_n, v_suma, v_fuera
    from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
    where a.liquidacion_id = p_id;
    if v_n = 0 or v_n <> r.cantidad_asignaciones or v_suma <> r.monto_medio or v_fuera > 0 then
      raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
        detail = 'La liquidación no corresponde a sus asignaciones verificadas: anúlala y genérala de nuevo.',
        hint = 'liquidacion_integridad';
    end if;
  end if;
  -- ADM-005: la moderación decide sobre el envío que revisó. Si el anunciante retiró y reenvió la oferta mientras
  -- tanto, `enviada_at` cambió y la decisión se rechaza (la interfaz manda el que mostró).
  if p_entidad = 'ofertas' and p_desde = 'EN_REVISION' and p_actor_tipo = 'ADMIN'
     and coalesce(p_datos, '{}') ? 'enviada_at'
     and (select o.enviada_at from public.ofertas o where o.id = p_id) is distinct from (p_datos ->> 'enviada_at')::timestamptz then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El anunciante cambió la oferta mientras la revisabas: vuelve a abrirla para revisar lo que envió ahora.',
      hint = 'oferta_reenviada';
  end if;
  -- E3 (ADM-007/008): no se valida lo de una asignación que ya no está en curso.
  if p_entidad in ('publicaciones', 'metricas') and p_desde = 'PENDIENTE' and p_actor_tipo = 'ADMIN'
     and (select a.estado from public.asignaciones a
          where a.id = (case p_entidad when 'publicaciones' then (select p.asignacion_id from public.publicaciones p where p.id = p_id)
                                       else (select m.asignacion_id from public.metricas m where m.id = p_id) end))
         not in ('CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS', 'EN_DISPUTA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La asignación ya no está en curso: no hay nada que validar.', hint = 'asignacion_cerrada';
  end if;
  -- E3 (ADM-010): la causa de la cancelación es una de las del catálogo; una liquidada se anula antes.
  if p_entidad = 'asignaciones' and p_hacia = 'CANCELADA'
     and not coalesce(p_datos ->> 'causa', '') = any (enum_range(null::public.cancelacion_causa)::text[]) then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica una causa de cancelación válida.';
  end if;
  case
    when v_clave = 'publicaciones:PENDIENTE→APROBADA' then
      if not coalesce((p_datos ->> 'etiqueta_verificada')::boolean, false) then
        raise exception using errcode = 'P0001', message = 'AMO_ETIQUETA_REQUERIDA',
          detail = 'Verifica que la etiqueta de publicidad sea visible antes de aprobar.';
      end if;
    when v_clave = 'asignaciones:PUBLICADA→CONTENIDO_ENTREGADO' then
      if not exists (select 1 from public.publicaciones p where p.asignacion_id = p_id and p.estado_validacion = 'RECHAZADA') then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Rechaza primero la evidencia con sus observaciones.';
      end if;
    when v_clave = 'medios:PENDIENTE→VERIFICADO' then
      perform private.validar_verificacion_medio(p_id, (p_datos ->> 'nivel')::smallint, true);
    when v_clave = 'medios:VERIFICADO→VERIFICADO' then
      if (p_datos ->> 'nivel')::smallint is not distinct from (select m.nivel_verificacion from public.medios m where m.id = p_id) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Indica un nivel distinto del actual.';
      end if;
      perform private.validar_verificacion_medio(p_id, (p_datos ->> 'nivel')::smallint, false);
    when v_clave = 'anunciantes:PENDIENTE→VERIFICADO' then
      perform private.validar_verificacion_anunciante(p_id);                -- ADM-003
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
    when v_clave = 'campanas:BORRADOR→ACTIVA' then                     -- ANU-003: con cualquier actor (también asistido)
      if not exists (select 1 from public.campanas c join public.anunciantes a on a.id = c.anunciante_id
                     where c.id = p_id and a.estado_verificacion = 'VERIFICADO') then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La empresa debe estar verificada por AMO para activar campañas.';
      end if;
    when v_clave = 'campanas:ACTIVA→CANCELADA' then
      -- ANU-014: lo verificado, liquidado o pagado ya está cumplido; solo bloquea lo que sigue en curso.
      if exists (select 1 from public.asignaciones a where a.campana_id = p_id
                   and private.consume_cupo(a.estado, a.estado_previo_disputa)
                   and a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La campaña tiene asignaciones en curso: no se puede cancelar.';
      end if;
    when v_clave = 'campanas:ACTIVA→FINALIZADA' then
      if exists (select 1 from public.ofertas o where o.campana_id = p_id and o.deleted_at is null
                   and o.estado not in ('CERRADA', 'CANCELADA')) then
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
      perform private.validar_verificacion_asignacion(p_id, p_motivo,
        case when private.tiene_permiso_de(p_actor_id, 'metricas.editar_validadas') then p_datos
             else coalesce(p_datos, '{}') - 'permanencia_verificada' end);   -- E3: la constancia manual solo ADMIN
    when p_entidad = 'asignaciones' and p_desde = 'EN_DISPUTA' then
      select a.estado_previo_disputa::text into v_previo from public.asignaciones a where a.id = p_id;
      if not (p_hacia = v_previo or p_hacia = 'CANCELADA'
              or (p_hacia = 'VERIFICADA' and v_previo = 'METRICAS_CARGADAS')
              or (p_hacia = 'CONTENIDO_ENTREGADO' and v_previo = 'VENCIDA_SIN_PUBLICAR')) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La resolución no es válida para el estado previo de la asignación.', hint = coalesce(v_previo, 'null') || '→' || p_hacia;
      end if;
      -- Puerta a pago: verificar (previo METRICAS_CARGADAS) o restaurar (previo VERIFICADA) con las mismas exigencias.
      if p_hacia = 'VERIFICADA' then
        if v_previo = 'METRICAS_CARGADAS' and not private.tiene_permiso_de(p_actor_id, 'metricas.validar') then
          raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Verificar exige además validar métricas.';
        end if;
        perform private.validar_verificacion_asignacion(p_id, p_motivo,
        case when private.tiene_permiso_de(p_actor_id, 'metricas.editar_validadas') then p_datos
             else coalesce(p_datos, '{}') - 'permanencia_verificada' end);   -- E3: la constancia manual solo ADMIN
      end if;
      -- Reabrir una vencida exige que la oferta y la campaña sigan vivas (si cerraron, se restaura o se cancela).
      if p_hacia = 'CONTENIDO_ENTREGADO' and exists (select 1 from public.asignaciones a
           join public.ofertas o on o.id = a.oferta_id join public.campanas c on c.id = a.campana_id
           where a.id = p_id and (o.estado in ('CERRADA', 'CANCELADA') or c.estado <> 'ACTIVA')) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La oferta ya cerró: resuelve restaurando la decisión o cancelando la asignación.', hint = 'oferta_cerrada';
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
      -- ADM-009/INT-006: una métrica con alerta no se aprueba sin constancia de lo que se revisó.
      if exists (select 1 from public.metricas m where m.id = p_id and (m.alerta_desviacion or m.alerta_multiplo))
         and coalesce(nullif(btrim(p_datos ->> 'observaciones'), ''), nullif(btrim(p_motivo), '')) is null then
        raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
          detail = 'La métrica tiene alertas: anota qué revisaste antes de aprobarla.', hint = 'alerta_sin_revision';
      end if;
    when v_clave = 'metricas:APROBADA→PENDIENTE' then
      if exists (select 1 from public.metricas m join public.asignaciones a on a.id = m.asignacion_id
                 where m.id = p_id and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La asignación ya está verificada: corrige la métrica directamente (queda en bitácora) o abre una disputa.',
          hint = 'metrica_de_asignacion_verificada';
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
end $function$;


CREATE OR REPLACE FUNCTION private.validar_verificacion_asignacion(p_asignacion_id uuid, p_motivo text, p_datos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- ADM-009: nada pendiente de revisión (un corte personalizado o reabierto también cuenta).
  if exists (select 1 from public.metricas m where m.asignacion_id = a.id and m.estado_validacion = 'PENDIENTE') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Hay métricas pendientes de revisión en esta asignación.', hint = 'metricas_pendientes';
  end if;
  if exists (select 1 from public.publicaciones p
             where p.asignacion_id = a.id and p.permanencia_verificada_at is null and private.ahora() < p.permanencia_hasta)
     and not (coalesce((p_datos ->> 'permanencia_verificada')::boolean, false) and nullif(btrim(p_motivo), '') is not null) then
    raise exception using errcode = 'P0001', message = 'AMO_PERMANENCIA_PENDIENTE',
      detail = 'Aún no se cumple la permanencia mínima de la publicación.';
  end if;
end $function$;


-- ADM-008 c2 / MED-014 c3: fuera del medio dueño nadie reescribe cifras por la sesión (sin motivo ni bitácora con él);
-- el equipo AMO corrige con corregir_metrica_srv.
create or replace function private.fn_metricas_guardar_edicion() returns trigger
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
    if old.medio_id is distinct from (select private.mi_medio_id()) or old.estado_validacion = 'APROBADA' then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Las cifras del medio solo las corrige el equipo AMO con «Corregir métrica» (motivo y bitácora).';
    end if;
    if old.estado_validacion = 'RECHAZADA' then
      new.estado_validacion := 'PENDIENTE';                 -- corrección del medio dueño (fila RECHAZADA → PENDIENTE)
    end if;
  end if;
  return new;
end $$;
drop policy "metricas: update" on public.metricas;
create policy "metricas: update" on public.metricas for update to authenticated
  using (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
         and (select private.tiene_permiso('asignaciones.ejecutar')) and private.puedo_cargar_metricas(publicacion_id))
  with check (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
              and (select private.tiene_permiso('asignaciones.ejecutar')) and private.puedo_cargar_metricas(publicacion_id));


-- 6. Disputas ----------------------------------------------------------------------------------------------------

-- ADM-011 c1: el medio reclama una vencida («sí publiqué y no se registró») con motivo Otro o Incumplimiento.
CREATE OR REPLACE FUNCTION public.abrir_disputa_srv(p_asignacion_id uuid, p_motivo disputa_motivo, p_descripcion text, p_actor_id uuid, p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if v_tipo <> 'MEDIO' or p_motivo not in ('INCUMPLIMIENTO', 'OTRO')
       or private.ahora() > a.vencida_at + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas')) then
      raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
        detail = 'Una asignación vencida solo la reclama el medio y dentro del plazo.';
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
end $function$;

-- ADM-012: cada mensaje dice de qué parte es (las partes no leen perfiles ajenos) y solo las partes o quien resuelve
-- escriben (antes bastaba con ver la asignación).
alter table public.disputa_mensajes add column autor_parte public.disputa_parte;
CREATE OR REPLACE FUNCTION private.fn_disputa_mensajes_sellar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.modo_carga() then
    new.autor_parte := coalesce(new.autor_parte, (select r.tipo::text::public.disputa_parte
                                                  from public.perfiles p join public.roles r on r.id = p.rol_id
                                                  where p.id = new.autor_id));
    return new;
  end if;
  new.autor_id := private.actor_id();
  new.created_at := private.ahora();
  if new.autor_id is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El mensaje requiere un autor identificado.';
  end if;
  new.autor_parte := (select r.tipo::text::public.disputa_parte
                      from public.perfiles p join public.roles r on r.id = p.rol_id where p.id = new.autor_id);
  return new;
end $function$;

drop policy "disputa_mensajes: insert partes o resolutor" on public.disputa_mensajes;
create policy "disputa_mensajes: insert partes o resolutor" on public.disputa_mensajes for insert to authenticated
  with check (autor_id = (select auth.uid())
              and ((select private.tiene_permiso('disputas.resolver'))
                   or (not interno and private.soy_parte_disputa(disputa_id, true))));

-- ADM-012: el hilo para las partes y el equipo, con quién habló sin revelar datos personales.
create function public.mensajes_disputa(p_disputa_id uuid)
returns table (id bigint, autor_parte public.disputa_parte, autor_nombre text, autor_persona text, es_mio boolean,
               mensaje text, adjunto_path text, interno boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.autor_parte,
         case m.autor_parte when 'MEDIO' then me.nombre when 'ANUNCIANTE' then coalesce(an.nombre_comercial, an.razon_social)
                            else 'Equipo AMO' end,
         case when (select private.tiene_permiso('usuarios.ver')) then p.nombre end,
         m.autor_id = (select auth.uid()), m.mensaje, m.adjunto_path, m.interno, m.created_at
  from public.disputa_mensajes m
  join public.disputas d on d.id = m.disputa_id
  join public.asignaciones a on a.id = d.asignacion_id
  join public.medios me on me.id = a.medio_id
  join public.anunciantes an on an.id = a.anunciante_id
  left join public.perfiles p on p.id = m.autor_id
  where m.disputa_id = p_disputa_id and (select private.acceso_valido())
    and ((select private.tiene_permiso('disputas.ver'))
         or (not m.interno and private.soy_parte_disputa(p_disputa_id, false)))
  order by m.created_at, m.id $$;
revoke all on function public.mensajes_disputa(uuid) from public, anon;
grant execute on function public.mensajes_disputa(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.fn_disputa_mensajes_avisar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_asig public.asignaciones; v_disputa public.disputas; v_destinos uuid[];
begin
  if private.modo_carga() or new.interno then return null; end if;
  select * into v_disputa from public.disputas d where d.id = new.disputa_id;
  select * into v_asig from public.asignaciones a where a.id = v_disputa.asignacion_id;
  select coalesce(array_agg(u.id), '{}') into v_destinos
  from unnest(private.usuarios_medio(v_asig.medio_id) || private.usuarios_anunciante(v_asig.anunciante_id)) u (id)
  where u.id is distinct from new.autor_id;
  perform private.notificar(v_destinos, 'disputa.mensaje', jsonb_build_object('oferta_id', v_asig.oferta_id),
                            'disputas', new.disputa_id::text, null, 1::smallint);
  -- ADM-012: el equipo que resuelve se entera cuando una parte escribe.
  if not private.tiene_permiso_de(new.autor_id, 'disputas.resolver') then
    perform private.notificar_cola('disputas.resolver', 'cola.disputa_mensaje',
      jsonb_build_object('oferta', (select o.titulo from public.ofertas o where o.id = v_asig.oferta_id)),
      'disputas', new.disputa_id::text, 1::smallint);
  end if;
  return null;
end $function$;

-- ADM-011/012: la oferta no se cierra mientras una vencida pueda reclamarse (si no, el reclamo reabriría una oferta
-- cerrada y volvería a comprometer presupuesto).
CREATE OR REPLACE FUNCTION private.condicion_sistema(p_entidad text, p_id uuid, p_hacia text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                                   and (a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA', 'RECHAZADA',
                                                         'VENCIDA_SIN_PUBLICAR', 'CANCELADA')
                                        -- ADM-011: una vencida aún reclamable mantiene viva la oferta.
                                        or (a.estado = 'VENCIDA_SIN_PUBLICAR'
                                            and a.vencida_at + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas'))
                                                > private.ahora()))))))
    when p_entidad = 'ofertas' and p_hacia = 'DEVUELTA' then exists (
      select 1 from public.ofertas o
      where o.id = p_id and o.deleted_at is null and o.estado = 'EN_REVISION'
        and o.fecha_limite_aceptacion <= private.ahora())
    when p_entidad = 'ofertas' and p_hacia = 'CANCELADA' then exists (
      select 1 from public.ofertas o join public.campanas c on c.id = o.campana_id
      where o.id = p_id and o.deleted_at is null and o.estado in ('BORRADOR', 'DEVUELTA')
        and (o.ventana_fin <= private.ahora() or c.fecha_fin < private.hoy()))
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
    else false end $function$;

-- Una disputa no congela las métricas: el medio sigue cargando los cortes que se cumplen mientras se resuelve.
CREATE OR REPLACE FUNCTION private.puedo_cargar_metricas(p_publicacion_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.publicaciones p join public.asignaciones a on a.id = p.asignacion_id
                 where p.id = p_publicacion_id and a.medio_id = (select private.mi_medio_id())
                   and (a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
                        or (a.estado = 'EN_DISPUTA'
                            and a.estado_previo_disputa in ('PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')))
                   and p.estado_validacion in ('PENDIENTE', 'APROBADA')) $function$;

create function private.fn_asignaciones_evaluar_tras_disputa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return null; end if;
  perform private.evaluar_metricas_cargadas(new.id);       -- volvió a EVIDENCIA_VALIDADA con todo cargado
  return null;
end $$;
revoke all on function private.fn_asignaciones_evaluar_tras_disputa() from public, anon, authenticated, service_role;
create trigger trg_asignaciones_z_evaluar_tras_disputa after update of estado on public.asignaciones
  for each row when (old.estado = 'EN_DISPUTA' and new.estado = 'EVIDENCIA_VALIDADA')
  execute function private.fn_asignaciones_evaluar_tras_disputa();


-- Avisos: plazo de recarga en el rechazo de evidencia, corte en palabras en el de métricas, reclamo a favor del medio.
CREATE OR REPLACE FUNCTION private.notificar_transicion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_motivo text := nullif(current_setting('amo.motivo', true), '');
  v_asig public.asignaciones;
  v_destinos uuid[];
  v_cuenta record;
begin
  if private.modo_carga() then return null; end if;
  case tg_table_name
    when 'ofertas' then
      if old.estado = 'EN_REVISION' and new.estado = 'DEVUELTA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.devuelta',
          jsonb_build_object('oferta', new.titulo, 'motivo',
            coalesce(case when current_setting('amo.actor_tipo', true) = 'SISTEMA' then v_motivo end,
                     new.comentario_moderacion, v_motivo, 'sin observaciones')),
          'ofertas', new.id::text, null, 1::smallint);
      elsif old.estado = 'EN_REVISION' and new.estado = 'PUBLICADA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.publicada',
          jsonb_build_object('oferta', new.titulo), 'ofertas', new.id::text, null, 0::smallint);
        select coalesce(array_agg(distinct u.id), '{}') into v_destinos
        from public.medios m
        cross join lateral unnest(private.usuarios_medio(m.id)) u (id)
        where m.estado = 'VERIFICADO' and m.deleted_at is null and private.oferta_visible_para(new.id, m.id);
        perform private.notificar(v_destinos, 'oferta.nueva_elegible',
          jsonb_build_object('anunciante', (select coalesce(a.nombre_comercial, a.razon_social) from public.anunciantes a
                                            where a.id = new.anunciante_id),
                             'oferta', new.titulo, 'plataforma', private.nombre_plataforma(new.plataforma),
                             'fecha_limite', private.formato_fecha(new.fecha_limite_aceptacion)),
          'ofertas', new.id::text, null, 1::smallint);
      elsif old.estado = 'EN_REVISION' and new.estado = 'CANCELADA' and current_setting('amo.actor_tipo', true) = 'ADMIN' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.rechazada',
          jsonb_build_object('oferta', new.titulo, 'motivo', coalesce(new.comentario_moderacion, v_motivo, 'sin observaciones')),
          'ofertas', new.id::text, null, 1::smallint);
      elsif old.estado in ('BORRADOR', 'DEVUELTA') and new.estado = 'CANCELADA'
            and current_setting('amo.actor_tipo', true) = 'SISTEMA'
            and exists (select 1 from public.campanas c where c.id = new.campana_id and c.estado <> 'CANCELADA') then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.caducada',
          jsonb_build_object('oferta', new.titulo), 'ofertas', new.id::text, null, 1::smallint);
      elsif new.estado = 'VENCIDA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.vencida',
          jsonb_build_object('oferta', new.titulo), 'ofertas', new.id::text, null, 1::smallint);
      elsif new.estado = 'EN_REVISION' then
        perform private.notificar_cola('ofertas.moderar', 'cola.oferta_revision',
          jsonb_build_object('oferta', new.titulo,
                             'anunciante', (select a.nombre_comercial from public.anunciantes a where a.id = new.anunciante_id)),
          'ofertas', new.id::text, 1::smallint);
      end if;
    when 'asignaciones' then
      if new.estado = 'VENCIDA_SIN_PUBLICAR' then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'asignacion.vencida',
          jsonb_build_object('oferta_id', new.oferta_id,
                             'plazo_disputa', private.formato_fecha(coalesce(new.vencida_at, private.ahora())
                               + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas')))),
          'asignaciones', new.id::text, null, 2::smallint);
      elsif new.estado = 'CANCELADA' then
        perform private.notificar(private.usuarios_medio(new.medio_id) || private.usuarios_anunciante(new.anunciante_id),
          'asignacion.cancelada', jsonb_build_object('oferta_id', new.oferta_id, 'motivo', coalesce(new.motivo, v_motivo, 'sin motivo')),
          'asignaciones', new.id::text, null, 1::smallint);
      elsif old.estado = 'CONTENIDO_ENTREGADO' and new.estado = 'PUBLICADA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'asignacion.publicada',
          jsonb_build_object('oferta_id', new.oferta_id,
                             'medio', (select m.nombre from public.medios m where m.id = new.medio_id)),
          'asignaciones', new.id::text, null, 0::smallint);
      elsif new.estado = 'VERIFICADA' and old.estado in ('METRICAS_CARGADAS', 'EN_DISPUTA') then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'asignacion.verificada',
          jsonb_build_object('oferta_id', new.oferta_id), 'asignaciones', new.id::text, null, 1::smallint);
      elsif old.estado = 'EN_DISPUTA' and new.estado = 'CONTENIDO_ENTREGADO' then
        -- ADM-012 c1: el reclamo prosperó; el medio sabe hasta cuándo carga la evidencia.
        perform private.notificar(private.usuarios_medio(new.medio_id), 'asignacion.reabierta',
          jsonb_build_object('oferta_id', new.oferta_id, 'plazo', private.formato_fecha(new.fecha_limite_publicacion)),
          'asignaciones', new.id::text, null, 2::smallint);
      end if;
    when 'publicaciones' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion = 'RECHAZADA' then
        select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'evidencia.rechazada',
          jsonb_build_object('oferta_id', v_asig.oferta_id, 'motivo', coalesce(new.observaciones, v_motivo, 'sin observaciones'),
                             'plazo', private.formato_fecha(v_asig.fecha_limite_publicacion)),
          'asignaciones', new.asignacion_id::text, null, 2::smallint);
      end if;
    when 'metricas' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion = 'RECHAZADA' then
        select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'metricas.rechazadas',
          jsonb_build_object('oferta_id', v_asig.oferta_id, 'corte', private.corte_en_palabras(new.corte),
                             'publicacion', case when v_asig.publicaciones > 1
                                                 then format(' (publicación %s)',
                                                             (select p.numero from public.publicaciones p where p.id = new.publicacion_id))
                                                 else '' end,
                             'motivo', coalesce(new.observaciones, v_motivo, 'sin observaciones')),
          'asignaciones', new.asignacion_id::text, null, 2::smallint);
      end if;
    when 'verificaciones_cuenta' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion in ('APROBADA', 'RECHAZADA') then
        select c.plataforma, c.handle::text as handle into v_cuenta from public.cuentas_sociales c where c.id = new.cuenta_social_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'cuenta.verificacion_resuelta',
          jsonb_build_object('plataforma', private.nombre_plataforma(v_cuenta.plataforma), 'handle', v_cuenta.handle,
                             'resultado', case when new.estado_validacion = 'APROBADA' then 'aprobada'
                                               else 'rechazada (' || coalesce(new.observaciones, v_motivo, 'sin observaciones') || ')' end),
          'cuentas_sociales', new.cuenta_social_id::text, null, 1::smallint);
      end if;
    when 'liquidaciones' then
      if old.estado = 'APROBADA' and new.estado = 'PAGADA' then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'liquidacion.pagada',
          jsonb_build_object('periodo', to_char(new.periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(new.periodo_fin, 'DD/MM/YYYY'),
                             'monto_neto', private.formato_cop(new.monto_neto)),
          'liquidaciones', new.id::text, null, 1::smallint);
      elsif old.estado = 'BORRADOR' and new.estado = 'APROBADA' then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'liquidacion.aprobada',
          jsonb_build_object('periodo', to_char(new.periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(new.periodo_fin, 'DD/MM/YYYY'),
                             'monto_neto', private.formato_cop(new.monto_neto)),
          'liquidaciones', new.id::text, null, 1::smallint);
      elsif new.estado = 'ANULADA' and old.estado = 'APROBADA' then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'liquidacion.anulada',
          jsonb_build_object('periodo', to_char(new.periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(new.periodo_fin, 'DD/MM/YYYY'),
                             'motivo', coalesce(v_motivo, 'sin motivo')),
          'liquidaciones', new.id::text, null, 1::smallint);
      end if;
    when 'disputas' then
      select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
      if tg_op = 'INSERT' then
        v_destinos := case new.parte
          when 'MEDIO' then private.usuarios_anunciante(v_asig.anunciante_id)
          when 'ANUNCIANTE' then private.usuarios_medio(v_asig.medio_id)
          else private.usuarios_medio(v_asig.medio_id) || private.usuarios_anunciante(v_asig.anunciante_id) end;
        perform private.notificar(v_destinos, 'disputa.abierta',
          jsonb_build_object('oferta_id', v_asig.oferta_id,
                             'motivo', case new.motivo when 'INCUMPLIMIENTO' then 'incumplimiento' when 'METRICAS' then 'métricas'
                                         when 'CONTENIDO' then 'contenido' when 'PERMANENCIA' then 'permanencia'
                                         when 'PAGO' then 'pago' else 'otro motivo' end),
          'disputas', new.id::text, null, 2::smallint);
      elsif new.estado in ('RESUELTA', 'DESCARTADA') then
        perform private.notificar(private.usuarios_medio(v_asig.medio_id) || private.usuarios_anunciante(v_asig.anunciante_id),
          'disputa.resuelta',
          jsonb_build_object('oferta_id', v_asig.oferta_id,
                             'resultado', coalesce(new.resolucion, case when new.estado = 'DESCARTADA' then 'descartada' end, v_motivo)),
          'disputas', new.id::text, null, 1::smallint);
      end if;
    when 'medios' then
      if old.estado = 'PENDIENTE' and new.estado = 'VERIFICADO' then
        perform private.notificar(private.usuarios_medio(new.id), 'medio.verificado',
          jsonb_build_object('medio', new.nombre, 'nivel', new.nivel_verificacion::text), 'medios', new.id::text, null, 2::smallint);
      elsif new.estado = 'RECHAZADO' then
        perform private.notificar(private.usuarios_medio(new.id), 'medio.rechazado',
          jsonb_build_object('medio', new.nombre, 'motivo', coalesce(new.motivo_estado, v_motivo, 'sin observaciones')),
          'medios', new.id::text, null, 2::smallint);
      elsif new.estado = 'SUSPENDIDO' then
        perform private.notificar(private.usuarios_medio(new.id), 'medio.suspendido',
          jsonb_build_object('medio', new.nombre, 'motivo', coalesce(new.motivo_estado, v_motivo, 'sin motivo')),
          'medios', new.id::text, null, 2::smallint);
      elsif old.estado = 'SUSPENDIDO' and new.estado = 'VERIFICADO' then
        perform private.notificar(private.usuarios_medio(new.id), 'medio.reactivado',
          jsonb_build_object('medio', new.nombre), 'medios', new.id::text, null, 1::smallint);
      elsif old.estado = 'VERIFICADO' and new.estado = 'VERIFICADO' and old.nivel_verificacion <> new.nivel_verificacion then
        perform private.notificar(private.usuarios_medio(new.id), 'medio.nivel_cambiado',
          jsonb_build_object('medio', new.nombre, 'nivel', new.nivel_verificacion::text,
                             'tope', coalesce((select private.formato_cop(nv.tope_anual) from public.niveles_verificacion nv
                                               where nv.nivel = new.nivel_verificacion and nv.tope_anual is not null), 'sin tope')),
          'medios', new.id::text, null, 1::smallint);
      end if;
    when 'anunciantes' then
      if old.estado_verificacion = 'PENDIENTE' and new.estado_verificacion = 'VERIFICADO' then
        perform private.notificar(private.usuarios_anunciante(new.id), 'anunciante.verificado',
          jsonb_build_object('anunciante', new.nombre_comercial), 'anunciantes', new.id::text, null, 2::smallint);
      elsif new.estado_verificacion = 'RECHAZADO' then
        perform private.notificar(private.usuarios_anunciante(new.id), 'anunciante.rechazado',
          jsonb_build_object('anunciante', new.nombre_comercial, 'motivo', coalesce(new.motivo_estado, v_motivo, 'sin observaciones')),
          'anunciantes', new.id::text, null, 2::smallint);
      elsif new.estado_verificacion = 'SUSPENDIDO' then
        perform private.notificar(private.usuarios_anunciante(new.id), 'anunciante.suspendido',
          jsonb_build_object('anunciante', new.nombre_comercial, 'motivo', coalesce(new.motivo_estado, v_motivo, 'sin motivo')),
          'anunciantes', new.id::text, null, 2::smallint);
      elsif old.estado_verificacion = 'SUSPENDIDO' and new.estado_verificacion = 'VERIFICADO' then
        perform private.notificar(private.usuarios_anunciante(new.id), 'anunciante.reactivado',
          jsonb_build_object('anunciante', new.nombre_comercial), 'anunciantes', new.id::text, null, 1::smallint);
      end if;
    when 'documentos_medio', 'documentos_anunciante' then
      v_destinos := case when tg_table_name = 'documentos_medio' then private.usuarios_medio((to_jsonb(new) ->> 'medio_id')::uuid)
                         else private.usuarios_anunciante((to_jsonb(new) ->> 'anunciante_id')::uuid) end;
      if new.estado_validacion in ('APROBADO', 'RECHAZADO', 'VENCIDO') then
        perform private.notificar(v_destinos,
          case new.estado_validacion when 'APROBADO' then 'documento.aprobado' when 'RECHAZADO' then 'documento.rechazado'
                                     else 'documento.vencido' end,
          jsonb_build_object('documento', private.nombre_documento(new.tipo::text),
                             'motivo', coalesce(new.observaciones, v_motivo, 'sin observaciones'),
                             'fecha', to_char(coalesce(new.fecha_vencimiento, private.hoy()), 'DD/MM/YYYY')),
          tg_table_name, new.id::text, null,
          case when new.estado_validacion = 'APROBADO' then 0 else 1 end::smallint);
      end if;
    when 'campanas' then
      if new.estado = 'FINALIZADA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'campana.finalizada',
          jsonb_build_object('campana', new.nombre), 'campanas', new.id::text, null, 0::smallint);
      end if;
    when 'facturas' then
      if new.estado = 'EMITIDA' and old.estado = 'BORRADOR' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'factura.emitida',
          jsonb_build_object('numero', coalesce(new.numero, '—'), 'total', private.formato_cop(new.total),
                             'vencimiento', coalesce(to_char(new.fecha_vencimiento, 'DD/MM/YYYY'), '—')),
          'facturas', new.id::text, null, 1::smallint);
      elsif new.estado = 'VENCIDA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'factura.vencida',
          jsonb_build_object('numero', coalesce(new.numero, '—'), 'saldo', private.formato_cop(new.saldo)),
          'facturas', new.id::text, null, 2::smallint);
      end if;
    else
      null;
  end case;
  return null;
end $function$;


-- 7. Medio y suspensión ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.proximas_acciones_medio(p_limite integer DEFAULT 10)
 RETURNS TABLE(asignacion_id uuid, oferta_titulo text, accion text, vence_at timestamp with time zone, numero smallint, corte corte_metrica, metrica_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'America/Bogota'
AS $function$
declare v_me uuid; v_plazo interval := make_interval(hours => private.config_entero('metricas.plazo_carga_horas'));
begin
  perform private.exigir_permiso('inicio.medio', 'asignaciones.ver_propias');
  v_me := private.mi_medio_id();
  return query
  with abiertas as (
    -- Una disputa no detiene los cortes que se cumplen: cuenta con su estado previo.
    select a.id, a.oferta_id, case when a.estado = 'EN_DISPUTA' then a.estado_previo_disputa else a.estado end as estado,
           a.fecha_limite_publicacion, a.creativo_descargado_id
    from public.asignaciones a
    where a.medio_id = v_me
      and (a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')
           or (a.estado = 'EN_DISPUTA' and a.estado_previo_disputa in ('PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')))
  ), acciones as (
    select x.id, 'DESCARGAR'::text as accion, x.fecha_limite_publicacion as vence, null::smallint as numero,
           null::public.corte_metrica as corte, null::uuid as metrica_id
    from abiertas x where x.estado = 'ACEPTADA'
    union all
    select x.id, 'DESCARGAR_NUEVA_VERSION', x.fecha_limite_publicacion, null, null, null
    from abiertas x
    join public.creativos cr on cr.oferta_id = x.oferta_id and cr.vigente
    where x.estado = 'CONTENIDO_ENTREGADO' and x.creativo_descargado_id is distinct from cr.id
    union all
    select x.id, 'CORREGIR_EVIDENCIA', x.fecha_limite_publicacion, p.numero, null, null
    from abiertas x join public.publicaciones p on p.asignacion_id = x.id and p.estado_validacion = 'RECHAZADA'
    where x.estado in ('CONTENIDO_ENTREGADO', 'PUBLICADA')
    union all
    select x.id, 'PUBLICAR', x.fecha_limite_publicacion, null, null, null
    from abiertas x
    where x.estado = 'CONTENIDO_ENTREGADO'
      and not exists (select 1 from public.publicaciones p where p.asignacion_id = x.id and p.estado_validacion = 'RECHAZADA')
    union all
    select x.id, 'CARGAR_METRICA_' || k.corte::text,
           p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours' when 'H72' then interval '72 hours'
                                              else interval '7 days' end + v_plazo,
           p.numero, k.corte, null
    from abiertas x
    join public.ofertas o on o.id = x.oferta_id
    join public.publicaciones p on p.asignacion_id = x.id and p.estado_validacion <> 'RECHAZADA'
    cross join unnest(o.cortes_requeridos) k (corte)
    where x.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA') and k.corte <> 'PERSONALIZADO'
      and not exists (select 1 from public.metricas m where m.publicacion_id = p.id and m.corte = k.corte)
    union all
    select x.id, 'CORREGIR_METRICAS', m.validada_at + v_plazo, p.numero, m.corte, m.id
    from abiertas x
    join public.metricas m on m.asignacion_id = x.id and m.estado_validacion = 'RECHAZADA'
    join public.publicaciones p on p.id = m.publicacion_id
    union all
    -- MED-011 c2 / DSH-006: reclamar una vencida dentro del plazo, si aún no lo hizo.
    select a.id, 'RECLAMAR', a.vencida_at + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas')),
           null, null, null
    from public.asignaciones a
    where a.medio_id = v_me and a.estado = 'VENCIDA_SIN_PUBLICAR'
      and private.ahora() <= a.vencida_at + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas'))
      and not exists (select 1 from public.disputas d where d.asignacion_id = a.id)
  )
  select ac.id, o.titulo, ac.accion, min(ac.vence), ac.numero, ac.corte, ac.metrica_id
  from acciones ac
  join public.asignaciones a on a.id = ac.id
  join public.ofertas o on o.id = a.oferta_id
  group by ac.id, o.titulo, ac.accion, ac.numero, ac.corte, ac.metrica_id
  order by min(ac.vence) nulls last, ac.accion, ac.numero
  limit least(greatest(coalesce(p_limite, 10), 1), 100);
end $function$;

-- MED-008 c2: el medio suspendido ve el motivo.
CREATE OR REPLACE FUNCTION public.mi_elegibilidad_marketplace()
 RETURNS TABLE(motivo text, detalle text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                    else 'Tu medio está suspendido' || coalesce(': ' || nullif(btrim(m.motivo_estado), ''), '')
                         || '. Mientras tanto no verás ofertas nuevas.' end;
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
end $function$;

-- ADM-007: tras un rechazo con plazo de recarga, la publicación nueva puede declararse hasta el plazo extendido.
CREATE OR REPLACE FUNCTION public.registrar_evidencia_srv(p_asignacion_id uuid, p_numero integer, p_url text, p_fecha_publicacion timestamp with time zone, p_captura_path text, p_miniatura_path text, p_etiqueta_confirmada boolean, p_actor_id uuid, p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo public.rol_tipo; a public.asignaciones; o public.ofertas; cr public.creativos; pub public.publicaciones;
  v_ahora timestamptz := private.ahora(); v_id uuid; v_handle text; v_handle_url text;
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
     or p_fecha_publicacion > least(greatest(o.ventana_fin, a.fecha_limite_publicacion), v_ahora + interval '15 minutes') then
    raise exception using errcode = 'P0001', message = 'AMO_FUERA_DE_VENTANA',
      detail = 'La fecha de publicación está fuera de la ventana de la oferta.';
  end if;
  -- Un enlace que nombra la cuenta (TikTok @usuario, historia de Instagram) tiene que ser de la cuenta de la asignación.
  v_handle_url := coalesce((regexp_match(p_url, '^https://www\.tiktok\.com/@([^/]+)/', 'i'))[1],
                           (regexp_match(p_url, '^https://www\.instagram\.com/stories/([^/]+)/', 'i'))[1]);
  if lower(v_handle_url) = 'highlights' then
    v_handle_url := null;                                   -- historia destacada: el enlace no nombra la cuenta
  end if;
  select c.handle into v_handle from public.cuentas_sociales c where c.id = a.cuenta_social_id;
  if v_handle_url is not null and v_handle is not null and lower(v_handle_url) <> lower(v_handle) then
    raise exception using errcode = 'P0001', message = 'AMO_URL_OTRA_CUENTA',
      detail = format('El enlace es de @%s y esta campaña es con @%s. Pega el enlace de la publicación en tu cuenta.',
                      v_handle_url, v_handle);
  end if;
  -- NOT-006/MED-013: la versión vigente AL PUBLICAR (activado_at, no created_at) o una posterior debe estar descargada.
  -- El medio declara la hora al minuto: una versión activada dentro de ese minuto ya cuenta como vigente.
  select * into cr from public.creativos c
  where c.oferta_id = o.id and c.activado_at is not null
    and date_trunc('minute', c.activado_at) <= p_fecha_publicacion
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
end $function$;

-- ADM-002 c2: asignaciones en curso de un medio (para decidir cuáles cancelar al suspenderlo). Invoker: RLS y permiso.
create function public.asignaciones_en_curso_medio(p_medio_id uuid)
returns table (id uuid, estado public.asignacion_estado, estado_previo_disputa public.asignacion_estado, oferta_id uuid,
               oferta_titulo text, anunciante text, fecha_limite_publicacion timestamptz, monto_bruto numeric,
               disputa_abierta_id uuid, cancelable boolean)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.estado, a.estado_previo_disputa, a.oferta_id, o.titulo,
         coalesce(an.nombre_comercial, an.razon_social), a.fecha_limite_publicacion, a.monto_bruto,
         (select d.id from public.disputas d where d.asignacion_id = a.id and d.estado in ('ABIERTA', 'EN_REVISION')),
         a.estado <> 'EN_DISPUTA'                       -- en disputa se cancela al resolverla
  from public.asignaciones a
  join public.ofertas o on o.id = a.oferta_id
  join public.anunciantes an on an.id = a.anunciante_id
  where a.medio_id = p_medio_id and (select private.tiene_permiso('asignaciones.ver'))
    and a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS', 'VERIFICADA',
                     'EN_DISPUTA')
  order by a.fecha_limite_publicacion nulls last, a.id $$;
revoke all on function public.asignaciones_en_curso_medio(uuid) from public, anon;
grant execute on function public.asignaciones_en_curso_medio(uuid) to authenticated;


-- Reporte «Cumplimiento de medios»: las alertas se cuentan con un ayudante definer (las columnas ya no son de lectura
-- pública) y solo para el equipo con `asignaciones.ver`.
create function private.alertas_metricas_por_medio(p_ini timestamptz, p_fin timestamptz, p_departamento char(2))
returns table (medio_id uuid, n bigint)
language sql stable security definer set search_path = '' as $$
  select x.medio_id, count(*)
  from public.metricas x
  join public.medios m on m.id = x.medio_id
  where (select private.tiene_permiso('asignaciones.ver'))
    and (x.alerta_desviacion or x.alerta_multiplo) and x.created_at >= p_ini and x.created_at < p_fin
    and (p_departamento is null or m.departamento_codigo = p_departamento)
  group by x.medio_id $$;
revoke all on function private.alertas_metricas_por_medio(timestamptz, timestamptz, char) from public, anon;
grant execute on function private.alertas_metricas_por_medio(timestamptz, timestamptz, char) to authenticated;
CREATE OR REPLACE FUNCTION public.reporte_cumplimiento_medios(p_desde date, p_hasta date, p_departamento character DEFAULT NULL::bpchar)
 RETURNS TABLE(medio_id uuid, medio text, departamento text, municipio text, nivel smallint, comprometidas integer, cumplidas integer, vencidas integer, canceladas integer, en_disputa integer, tasa_cumplimiento numeric, alertas_metricas integer, multiplicador_promedio numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET "TimeZone" TO 'America/Bogota'
AS $function$
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
    select x.medio_id as mid, x.n from private.alertas_metricas_por_medio(g.ini, g.fin, p_departamento) x
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
end $function$;


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
               'cumplimiento_aplica', 'cumplimiento_ok', 'medios_en_riesgo_al', 'geo_valores', 'geo_validar',
               -- M10 storage
               'seg', 'seg_uuid', 'es_mi_oferta', 'puedo_subir_creativo', 'puedo_subir_evidencia', 'soy_parte_disputa',
               'soy_dueno_soporte',
               -- E2 fase 2
               'creativo_activado', 'validar_campana_guardar',
               -- E2 fase 3
               'puedo_ver_archivo_asignacion',
               -- E3 fase 4
               'alertas_metricas_por_medio']::text[] $$;
