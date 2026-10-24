-- Migración E3c · e3_cierre (docs/modelo-datos.md §3.14)
-- Fase 6, cierre de la Entrega 3: gestión asistida por cuenta del anunciante (ADM-014), reputación del medio (MED-016),
-- derechos del titular de datos (CTA-007), correo construido apagado (NOT-004), aviso en vivo mínimo (NOT-007), textos
-- de aviso (NOT-003), confirmación de parámetros (CFG-001), medios cerca del tope (CFG-005) y la limpieza final de las
-- pruebas en producción (se construye; solo se ejecuta por orden expresa).
--   1. Configuración, reputación y textos de aviso
--   2. Gestión asistida: marca, bitácora con el propietario y aviso al anunciante
--   3. Derechos del titular: días hábiles, solicitudes, exportación y supresión
--   4. Correo apagado: cola, despachador y job inactivo
--   5. Avisos: notificar encola el correo; el aviso en vivo solo lleva el contador
--   6. Limpieza final de las pruebas
--   7. Permiso privacidad.gestionar, jobs y plantillas de correo

-- 1. Configuración (CFG-001, CFG-005), reputación del medio (MED-016) y textos de aviso (NOT-003) -----------------

-- CFG-001: quien edita la configuración confirma un valor «pendiente de validación» desde la interfaz; la bitácora lo
-- registra (trg_configuracion_z_auditar). Una clave confirmada no vuelve a quedar pendiente fuera de una migración.
grant update (pendiente_validacion) on public.configuracion to authenticated;

create function private.fn_configuracion_validada() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Invocador: current_user es el rol que escribe (authenticated o service_role); las migraciones corren como postgres.
  if new.pendiente_validacion and not old.pendiente_validacion and not private.modo_carga()
     and current_user in ('authenticated', 'service_role', 'anon') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Un parámetro confirmado no vuelve a quedar pendiente de validación.';
  end if;
  return new;
end $$;
revoke all on function private.fn_configuracion_validada() from public, anon, authenticated;
create trigger trg_configuracion_b_validada before update of pendiente_validacion on public.configuracion
  for each row execute function private.fn_configuracion_validada();

-- CFG-005: medios que ya consumieron el porcentaje de alerta de su tope anual (mismo cálculo que reservar_cupo).
create function public.medios_cerca_tope()
returns table (medio_id uuid, consumido numeric, tope numeric, fraccion numeric)
language plpgsql stable security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare v_ini timestamptz := private.inicio_dia(make_date(extract(year from private.hoy())::integer, 1, 1));
begin
  perform private.exigir_permiso('medios.ver');
  return query
  select m.id, s.c, nv.tope_anual, round(s.c / nv.tope_anual, 4)
  from public.medios m
  join public.niveles_verificacion nv on nv.nivel = m.nivel_verificacion and nv.tope_anual is not null and nv.tope_anual > 0
  cross join lateral (select coalesce(sum(am.monto_medio), 0) as c
                      from public.asignaciones a
                      join public.asignacion_montos am on am.asignacion_id = a.id
                      where a.medio_id = m.id and a.aceptada_at >= v_ini
                        and private.consume_cupo(a.estado, a.estado_previo_disputa)) s
  where m.deleted_at is null and s.c >= nv.porcentaje_alerta * nv.tope_anual;
end $$;
revoke all on function public.medios_cerca_tope() from public, anon, authenticated;
grant execute on function public.medios_cerca_tope() to authenticated;

-- MED-016: la reputación del medio a hoy, con la misma regla que el cron (ventana de 180 días, mínimo de casos), y los
-- casos de la ventana para que el medio entienda la tasa. La calificación de anunciantes llega con la calificación
-- bidireccional (fuera de esta fase).
create function public.mi_reputacion()
returns table (tasa numeric, n integer, cumplidas integer, n_minimo integer, publicaciones_total integer,
               publicaciones_180d integer, calculada_at timestamptz, casos jsonb)
language plpgsql stable security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare
  v_me uuid;
  v_min integer := private.config_entero('medios.n_minimo_cumplimiento');
  v_ahora timestamptz := private.ahora();
begin
  perform private.exigir_permiso('inicio.medio');
  v_me := private.mi_medio_id();
  if v_me is null then return; end if;
  return query
  with b as (
    select a.id, a.oferta_id, a.fecha_limite_publicacion, a.estado,
           private.cumplimiento_ok(a.estado, a.causa_cancelacion, a.publicada_at, a.evidencia_validada_at,
                                   a.fecha_limite_publicacion) as ok
    from public.asignaciones a
    where a.medio_id = v_me and a.aceptada_at is not null
      and a.fecha_limite_publicacion >= v_ahora - interval '180 days' and a.fecha_limite_publicacion < v_ahora
      and private.cumplimiento_aplica(a.estado, a.estado_previo_disputa, a.causa_cancelacion, a.aceptada_at,
                                      a.fecha_limite_publicacion)
  )
  select case when count(b.id) >= v_min and count(b.id) > 0
              then round((count(b.id) filter (where b.ok))::numeric / count(b.id), 4) end,
         count(b.id)::integer,
         (count(b.id) filter (where b.ok))::integer,
         v_min,
         (select count(*)::integer from public.publicaciones p where p.medio_id = v_me and p.estado_validacion = 'APROBADA'),
         (select count(*)::integer from public.publicaciones p
          where p.medio_id = v_me and p.estado_validacion = 'APROBADA'
            and p.fecha_publicacion >= v_ahora - interval '180 days'),
         v_ahora,
         coalesce(jsonb_agg(jsonb_build_object('asignacion_id', b.id, 'oferta', o.titulo,
                                               'limite', b.fecha_limite_publicacion, 'estado', b.estado,
                                               'cumplida', b.ok)
                            order by b.fecha_limite_publicacion desc) filter (where b.id is not null), '[]'::jsonb)
  from b left join public.ofertas o on o.id = b.oferta_id;
end $$;
revoke all on function public.mi_reputacion() from public, anon, authenticated;
grant execute on function public.mi_reputacion() to authenticated;

-- NOT-003 (criterio 1): el título del aviso de una oferta elegible. Respeta una plantilla que ya hayan editado.
update public.plantillas_notificacion set nombre = 'Nueva oferta disponible para tu medio'
where clave = 'oferta.nueva_elegible' and canal = 'APP' and nombre = 'Nueva oferta disponible';

-- 2. ADM-014 · Gestión asistida por cuenta del anunciante ------------------------------------------------------------
-- El equipo AMO (campanas.gestionar / ofertas.gestionar) crea y gestiona campañas y ofertas de un anunciante. La base ya
-- lo permitía (RLS, transiciones ADMIN); aquí queda la marca persistente, la bitácora con el propietario y el aviso.

create function private.tipo_rol_de(p_perfil uuid) returns public.rol_tipo
language sql stable security definer set search_path = '' as $$
  select r.tipo from public.perfiles p join public.roles r on r.id = p.rol_id where p.id = p_perfil
$$;
revoke all on function private.tipo_rol_de(uuid) from public, anon, authenticated;

alter table public.campanas add column gestion_asistida boolean not null default false;
alter table public.ofertas add column gestion_asistida boolean not null default false;
comment on column public.campanas.gestion_asistida is
  'La creó el equipo AMO por cuenta del anunciante (ADM-014). La fija el trigger de derivación; nadie la edita.';
comment on column public.ofertas.gestion_asistida is
  'La creó el equipo AMO por cuenta del anunciante (ADM-014). La fija el trigger de derivación; nadie la edita.';
create index campanas_gestion_asistida_idx on public.campanas (anunciante_id) where gestion_asistida;
create index ofertas_gestion_asistida_idx on public.ofertas (anunciante_id) where gestion_asistida;

-- Metadatos de bitácora de una acción asistida: el operador queda como actor y el anunciante como propietario. No se
-- marcan la moderación (ofertas.moderar), el cron (sin actor) ni lo que hacen el anunciante o el medio.
create function private.metadatos_asistidos(p_tabla text, p_fila jsonb, p_desde text, p_hacia text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := private.actor_id(); v_anunciante uuid;
begin
  if v_actor is null or private.tipo_rol_de(v_actor) is distinct from 'ADMIN' then return '{}'::jsonb; end if;
  v_anunciante := case p_tabla
    when 'campanas' then (p_fila ->> 'anunciante_id')::uuid
    when 'ofertas' then (p_fila ->> 'anunciante_id')::uuid
    when 'oferta_cupos' then (select o.anunciante_id from public.ofertas o where o.id = (p_fila ->> 'oferta_id')::uuid)
    when 'creativos' then (select o.anunciante_id from public.ofertas o where o.id = (p_fila ->> 'oferta_id')::uuid)
    when 'creativo_archivos' then (select o.anunciante_id from public.creativos c join public.ofertas o on o.id = c.oferta_id
                                   where c.id = (p_fila ->> 'creativo_id')::uuid)
  end;
  if v_anunciante is null then return '{}'::jsonb; end if;
  if p_tabla in ('campanas', 'ofertas') and p_desde is distinct from p_hacia
     and not exists (select 1 from private.transiciones_estado t
                     where t.entidad = p_tabla and t.desde = coalesce(p_desde, 'NUEVO') and t.hacia = p_hacia
                       and t.actor = 'ADMIN' and t.permiso in ('campanas.gestionar', 'ofertas.gestionar')) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('modo', 'ASISTIDO', 'anunciante_id', v_anunciante);
end $$;
revoke all on function private.metadatos_asistidos(text, jsonb, text, text) from public, anon, authenticated;

-- Aviso al anunciante de lo que el equipo AMO hizo por su cuenta. La finalización, la publicación, la devolución y el
-- rechazo ya tienen su aviso propio (notificar_transicion); la cancelación en cascada de una campaña avisa una vez.
create function private.fn_avisar_gestion_asistida() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_desde text; v_accion text; v_motivo text := nullif(btrim(current_setting('amo.motivo', true)), '');
begin
  if private.modo_carga() or private.actor_id() is null
     or private.tipo_rol_de(private.actor_id()) is distinct from 'ADMIN' then
    return null;
  end if;
  v_desde := case when tg_op = 'INSERT' then 'NUEVO' else old.estado::text end;
  if v_desde = new.estado::text then return null; end if;
  if not exists (select 1 from private.transiciones_estado t
                 where t.entidad = tg_table_name and t.desde = v_desde and t.hacia = new.estado::text and t.actor = 'ADMIN'
                   and t.permiso in ('campanas.gestionar', 'ofertas.gestionar')) then
    return null;
  end if;
  if tg_table_name = 'campanas' then
    v_accion := case when tg_op = 'INSERT' then 'creó'
                     when new.estado = 'ACTIVA' then 'activó'
                     when new.estado = 'CANCELADA' then 'canceló' end;
    if v_accion is null then return null; end if;
    perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'campana.gestion_asistida',
      jsonb_build_object('accion', v_accion, 'campana', new.nombre,
                         'motivo', case when new.estado = 'CANCELADA' and v_motivo is not null
                                        then ' Motivo: ' || v_motivo else '' end),
      'campanas', new.id::text, null, 1::smallint);
  else
    v_accion := case when new.estado = 'EN_REVISION' then 'envió a revisión'
                     when old.estado = 'EN_REVISION' and new.estado = 'BORRADOR' then 'retiró de revisión'
                     when new.estado = 'CANCELADA' then 'canceló' end;
    if v_accion is null
       or (new.estado = 'CANCELADA'
           and exists (select 1 from public.campanas c where c.id = new.campana_id and c.estado = 'CANCELADA')) then
      return null;
    end if;
    perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.gestion_asistida',
      jsonb_build_object('accion', v_accion, 'oferta', new.titulo,
                         'motivo', case when new.estado = 'CANCELADA' and v_motivo is not null
                                        then ' Motivo: ' || v_motivo else '' end),
      'ofertas', new.id::text, null, 1::smallint);
  end if;
  return null;
end $$;
revoke all on function private.fn_avisar_gestion_asistida() from public, anon, authenticated;
create trigger trg_campanas_z_gestion_asistida after insert or update of estado on public.campanas
  for each row execute function private.fn_avisar_gestion_asistida();
create trigger trg_ofertas_z_gestion_asistida after update of estado on public.ofertas
  for each row when (old.estado is distinct from new.estado) execute function private.fn_avisar_gestion_asistida();

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('campana.gestion_asistida', 'APP', 'El equipo AMO gestionó tu campaña', null,
   'El equipo AMO {{accion}} la campaña «{{campana}}» por cuenta de tu empresa.{{motivo}}',
   array['accion', 'campana', 'motivo']),
  ('oferta.gestion_asistida', 'APP', 'El equipo AMO gestionó tu oferta', null,
   'El equipo AMO {{accion}} la oferta «{{oferta}}» por cuenta de tu empresa.{{motivo}}',
   array['accion', 'oferta', 'motivo'])
on conflict (clave, canal) do nothing;

-- La bitácora de campañas, ofertas, cupos y creativos marca la acción asistida con el anunciante propietario.
CREATE OR REPLACE FUNCTION private.fn_auditar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pk text := coalesce(tg_argv[0], 'id');
  v_old jsonb;
  v_new jsonb;
  v_cambios jsonb;
  v_estado_col text;
begin
  if private.modo_carga() then return null; end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(e.key, jsonb_build_object(
             'antes', private.redactar_valor(e.value, t.tratamiento),
             'despues', private.redactar_valor(v_new -> e.key, t.tratamiento)))
      into v_cambios
    from jsonb_each(v_old) e
    left join lateral (select a.tratamiento from private.auditoria_columnas a
                       where a.tabla in (tg_table_name, '*') and a.columna = e.key
                       order by (a.tabla = '*') limit 1) t on true
    where e.value is distinct from v_new -> e.key
      and t.tratamiento is distinct from 'OMITIR';
    if v_cambios is null then return null; end if;          -- solo cambiaron columnas omitidas
  else
    select jsonb_object_agg(e.key, private.redactar_valor(e.value, t.tratamiento))
      into v_cambios
    from jsonb_each(coalesce(v_new, v_old)) e
    left join lateral (select a.tratamiento from private.auditoria_columnas a
                       where a.tabla in (tg_table_name, '*') and a.columna = e.key
                       order by (a.tabla = '*') limit 1) t on true
    where t.tratamiento is distinct from 'OMITIR';
  end if;

  v_estado_col := case tg_table_name
    when 'anunciantes' then 'estado_verificacion'
    when 'documentos_medio' then 'estado_validacion'
    when 'documentos_anunciante' then 'estado_validacion'
    when 'verificaciones_cuenta' then 'estado_validacion'
    when 'publicaciones' then 'estado_validacion'
    when 'metricas' then 'estado_validacion'
    else 'estado' end;

  perform private.registrar_en_bitacora(
    case when tg_op = 'UPDATE' and (v_old ->> v_estado_col) is distinct from (v_new ->> v_estado_col)
         then 'TRANSICION' else tg_op end,
    tg_table_name,
    coalesce(v_new, v_old) ->> v_pk,
    v_cambios,
    case when tg_table_name in ('campanas', 'ofertas', 'oferta_cupos', 'creativos', 'creativo_archivos')
         then private.metadatos_asistidos(tg_table_name, coalesce(v_new, v_old),
                case when tg_op = 'INSERT' then null else v_old ->> v_estado_col end,
                case when tg_op = 'DELETE' then null else v_new ->> v_estado_col end)
         else '{}'::jsonb end,
    nullif(current_setting('amo.motivo', true), ''),
    v_old ->> v_estado_col,
    v_new ->> v_estado_col,
    coalesce((coalesce(v_new, v_old) ->> 'es_demo')::boolean, false));
  return null;
end $function$;

CREATE OR REPLACE FUNCTION private.fn_campanas_derivar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  new.gestion_asistida := coalesce(private.tipo_rol_de(private.actor_id()) = 'ADMIN', false);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.fn_ofertas_derivar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    new.gestion_asistida := coalesce(private.tipo_rol_de(private.actor_id()) = 'ADMIN', false);
  else
    new.gestion_asistida := old.gestion_asistida;
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
end $function$;

-- Las colas del equipo no le avisan a quien originó el aviso (p. ej., el operador que envía una oferta asistida).
CREATE OR REPLACE FUNCTION private.notificar_cola(p_permiso text, p_tipo text, p_datos jsonb, p_entidad text, p_entidad_id text, p_prioridad smallint DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_destinos uuid[];
begin
  if private.modo_carga() then return 0; end if;
  select coalesce(array_agg(u.id), '{}') into v_destinos
  from unnest(private.usuarios_con_permiso(p_permiso)) u (id)
  where u.id is distinct from private.actor_id()           -- quien actúa no se avisa a sí mismo
    and not exists (select 1 from public.notificaciones n
                    where n.tipo = p_tipo and n.entidad_id = p_entidad_id and n.usuario_id = u.id
                      and n.created_at > private.ahora() - interval '12 hours');
  return private.notificar(v_destinos, p_tipo, p_datos, p_entidad, p_entidad_id, null, p_prioridad);
end $function$;

-- La cola de moderación dice cuándo la oferta la envió el equipo AMO por cuenta del anunciante.
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
                             'anunciante', (select a.nombre_comercial from public.anunciantes a where a.id = new.anunciante_id)
                                          || case when current_setting('amo.actor_tipo', true) = 'ADMIN'
                                                  then ' (por el equipo AMO)' else '' end),
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

-- 3. CTA-007 · Derechos del titular de datos (Ley 1581 de 2012) ----------------------------------------------------
-- Consulta (art. 14: 10 días hábiles, prórroga de 5) y reclamo de actualización, rectificación, supresión o revocatoria
-- (art. 15: 15 días hábiles desde el día siguiente al recibo, prórroga de 8; reclamo incompleto: requerimiento y
-- desistimiento a los 2 meses). Los plazos son configurables dentro del máximo legal y se cuentan en días hábiles de
-- Colombia. La supresión anonimiza lo que la contabilidad obliga a conservar (Decreto 1377 de 2013, art. 9).

-- 3.1 Calendario de días hábiles ------------------------------------------------------------------------------------

create table private.festivos (
  fecha date primary key,
  nombre text not null constraint festivos_nombre_chk check (char_length(nombre) between 3 and 80)
);
revoke all on private.festivos from public, anon, authenticated, service_role;

create function private.domingo_pascua(p_anio integer) returns date
language plpgsql immutable set search_path = '' as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  -- Algoritmo anónimo gregoriano (Meeus/Jones/Butcher).
  a := p_anio % 19; b := p_anio / 100; c := p_anio % 100; d := b / 4; e := b % 4; f := (b + 8) / 25;
  g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30; i := c / 4; k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  return make_date(p_anio, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;
revoke all on function private.domingo_pascua(integer) from public, anon, authenticated;

-- Festivos de Colombia: fijos, trasladables al lunes siguiente (Ley 51 de 1983) y los que dependen de la Pascua.
create function private.festivos_colombia(p_anio integer) returns table (fecha date, nombre text)
language sql immutable set search_path = '' as $$
  with p as (select private.domingo_pascua(p_anio) as d),
  lunes as (select x.f, x.n from (values
      (make_date(p_anio, 1, 6), 'Día de los Reyes Magos'), (make_date(p_anio, 3, 19), 'Día de San José'),
      (make_date(p_anio, 6, 29), 'San Pedro y San Pablo'), (make_date(p_anio, 8, 15), 'La Asunción de la Virgen'),
      (make_date(p_anio, 10, 12), 'Día de la Raza'), (make_date(p_anio, 11, 1), 'Día de Todos los Santos'),
      (make_date(p_anio, 11, 11), 'Independencia de Cartagena')) x (f, n))
  select v.f, v.n from (values
      (make_date(p_anio, 1, 1), 'Año Nuevo'), (make_date(p_anio, 5, 1), 'Día del Trabajo'),
      (make_date(p_anio, 7, 20), 'Día de la Independencia'), (make_date(p_anio, 8, 7), 'Batalla de Boyacá'),
      (make_date(p_anio, 12, 8), 'La Inmaculada Concepción'), (make_date(p_anio, 12, 25), 'Navidad')) v (f, n)
  union all
  select case when extract(isodow from l.f) = 1 then l.f else l.f + (8 - extract(isodow from l.f)::integer) end, l.n
  from lunes l
  union all
  select p.d - 3, 'Jueves Santo' from p
  union all select p.d - 2, 'Viernes Santo' from p
  union all select p.d + 43, 'Ascensión del Señor' from p
  union all select p.d + 64, 'Corpus Christi' from p
  union all select p.d + 71, 'Sagrado Corazón de Jesús' from p
$$;
revoke all on function private.festivos_colombia(integer) from public, anon, authenticated;

insert into private.festivos (fecha, nombre)
select f.fecha, f.nombre from generate_series(2025, 2040) a (anio) cross join lateral private.festivos_colombia(a.anio) f
on conflict (fecha) do nothing;

-- Fecha hábil número p_dias contada desde el día siguiente a p_desde (sábados, domingos y festivos no cuentan).
create function private.sumar_dias_habiles(p_desde date, p_dias integer) returns date
language plpgsql stable security definer set search_path = '' as $$
declare v_fecha date := p_desde; v_n integer := 0;
begin
  if p_desde is null or p_dias is null or p_dias < 0 or p_dias > 366 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Plazo en días hábiles no válido.';
  end if;
  if (select max(f.fecha) from private.festivos f) < p_desde + p_dias * 2 + 30 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El calendario de festivos no cubre esta fecha: cárgalo en una migración.';
  end if;
  while v_n < p_dias loop
    v_fecha := v_fecha + 1;
    if extract(isodow from v_fecha) < 6 and not exists (select 1 from private.festivos f where f.fecha = v_fecha) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_fecha;
end $$;
revoke all on function private.sumar_dias_habiles(date, integer) from public, anon, authenticated;

-- Fecha hábil número p_dias hacia atrás desde p_hasta (para el aviso de vencimiento).
create function private.restar_dias_habiles(p_hasta date, p_dias integer) returns date
language plpgsql stable security definer set search_path = '' as $$
declare v_fecha date := p_hasta; v_n integer := 0;
begin
  if p_hasta is null or p_dias is null or p_dias < 0 or p_dias > 366 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Plazo en días hábiles no válido.';
  end if;
  while v_n < p_dias loop
    v_fecha := v_fecha - 1;
    if extract(isodow from v_fecha) < 6 and not exists (select 1 from private.festivos f where f.fecha = v_fecha) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_fecha;
end $$;
revoke all on function private.restar_dias_habiles(date, integer) from public, anon, authenticated;

-- 3.2 Configuración -------------------------------------------------------------------------------------------------

insert into public.configuracion (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica,
                                  pendiente_validacion) values
  ('privacidad.plazo_consulta_dias', '10', 'ENTERO', 1, 10, null, 'privacidad',
   'Días hábiles para responder una consulta del titular (Ley 1581, art. 14: máximo 10).', 'días hábiles', false, true),
  ('privacidad.prorroga_consulta_dias', '5', 'ENTERO', 0, 5, null, 'privacidad',
   'Días hábiles de prórroga de una consulta, con aviso y motivo al titular (art. 14: máximo 5).', 'días hábiles',
   false, true),
  ('privacidad.plazo_reclamo_dias', '15', 'ENTERO', 1, 15, null, 'privacidad',
   'Días hábiles para responder un reclamo (actualización, rectificación, supresión o revocatoria; art. 15: máximo 15).',
   'días hábiles', false, true),
  ('privacidad.prorroga_reclamo_dias', '8', 'ENTERO', 0, 8, null, 'privacidad',
   'Días hábiles de prórroga de un reclamo, con aviso y motivo al titular (art. 15: máximo 8).', 'días hábiles', false,
   true),
  ('privacidad.desistimiento_meses', '2', 'ENTERO', 2, 12, null, 'privacidad',
   'Meses sin respuesta del titular a un requerimiento tras los cuales la solicitud se entiende desistida (art. 15: 2).',
   'meses', false, true),
  ('privacidad.alerta_dias', '2', 'ENTERO', 0, 5, null, 'privacidad',
   'Días hábiles antes del vencimiento en que el equipo recibe el aviso de una solicitud por vencer.', 'días hábiles',
   false, false)
on conflict (clave) do nothing;

-- 3.3 Solicitudes -------------------------------------------------------------------------------------------------

create type public.solicitud_titular_tipo as enum ('CONSULTA', 'PRUEBA_AUTORIZACION', 'ACTUALIZACION', 'RECTIFICACION',
                                                    'SUPRESION', 'REVOCATORIA');
create type public.solicitud_titular_estado as enum ('RADICADA', 'EN_TRAMITE', 'REQUIERE_INFORMACION', 'RESPONDIDA',
                                                      'DESISTIDA');
create type public.solicitud_titular_decision as enum ('PROCEDE', 'PROCEDE_PARCIAL', 'NO_PROCEDE');

create table public.solicitudes_titular (
  id uuid primary key default private.uuid_v7(),
  numero bigint generated always as identity constraint solicitudes_titular_numero_key unique,
  perfil_id uuid references public.perfiles (id) on delete set null,       -- el caso sobrevive a la supresión
  email_sha256 text not null constraint solicitudes_titular_email_sha256_chk check (email_sha256 ~ '^[0-9a-f]{64}$'),
  rol_tipo public.rol_tipo not null,
  medio_id uuid references public.medios (id) on delete set null,
  anunciante_id uuid references public.anunciantes (id) on delete set null,
  tipo public.solicitud_titular_tipo not null,
  descripcion text not null constraint solicitudes_titular_descripcion_chk check (char_length(descripcion) between 10 and 2000),
  datos_afectados text[] not null default '{}' constraint solicitudes_titular_datos_chk
    check (datos_afectados <@ array['IDENTIFICACION', 'CONTACTO', 'PAGO', 'DOCUMENTOS', 'CUENTAS_SOCIALES', 'ACCESOS',
                                    'ACTIVIDAD', 'AUTORIZACIONES', 'OTROS']::text[]),
  estado public.solicitud_titular_estado not null default 'RADICADA',
  recibida_at timestamptz not null default private.ahora(),
  plazo_vence date not null,
  alerta_desde date not null,
  en_tramite_at timestamptz,
  tramitada_por uuid references public.perfiles (id) on delete set null,
  requerimiento text constraint solicitudes_titular_requerimiento_chk check (char_length(requerimiento) between 10 and 2000),
  requerida_at timestamptz,
  informacion_aportada text
    constraint solicitudes_titular_informacion_chk check (char_length(informacion_aportada) between 2 and 2000),
  informacion_at timestamptz,
  prorroga_motivo text constraint solicitudes_titular_prorroga_motivo_chk check (char_length(prorroga_motivo) between 10 and 1000),
  prorrogada_at timestamptz,
  decision public.solicitud_titular_decision,
  respuesta text constraint solicitudes_titular_respuesta_texto_chk check (char_length(respuesta) between 20 and 4000),
  respondida_at timestamptz,
  respondida_por uuid references public.perfiles (id) on delete set null,
  evidencia_path text constraint solicitudes_titular_evidencia_chk
    check (evidencia_path ~ ('^titular/' || id::text || '/[0-9a-f-]{36}\.pdf$')),
  supresion_ejecutada_at timestamptz,
  supresion_resultado jsonb constraint solicitudes_titular_supresion_resultado_chk
    check (pg_column_size(supresion_resultado) < 16384),
  desistida_at timestamptz,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint solicitudes_titular_respondida_chk
    check ((estado = 'RESPONDIDA') = (respondida_at is not null and decision is not null and respuesta is not null)),
  constraint solicitudes_titular_prorroga_chk check ((prorrogada_at is null) = (prorroga_motivo is null)),
  constraint solicitudes_titular_requerida_chk check ((requerida_at is null) = (requerimiento is null)),
  constraint solicitudes_titular_requiere_chk check (estado <> 'REQUIERE_INFORMACION' or requerida_at is not null),
  constraint solicitudes_titular_desistida_chk check ((estado = 'DESISTIDA') = (desistida_at is not null)),
  constraint solicitudes_titular_plazo_chk check (alerta_desde <= plazo_vence),
  constraint solicitudes_titular_supresion_chk
    check (supresion_ejecutada_at is null
           or (tipo in ('SUPRESION', 'REVOCATORIA') and estado = 'RESPONDIDA' and decision <> 'NO_PROCEDE'))
);
comment on table public.solicitudes_titular is
  'CTA-007: solicitudes de titulares de datos (Ley 1581). Solo se escriben con las RPC *_srv; el titular y quien tiene privacidad.gestionar las leen.';
create unique index solicitudes_titular_abierta_uq on public.solicitudes_titular (perfil_id, tipo)
  where estado in ('RADICADA', 'EN_TRAMITE', 'REQUIERE_INFORMACION');
create index solicitudes_titular_abiertas_idx on public.solicitudes_titular (plazo_vence)
  where estado in ('RADICADA', 'EN_TRAMITE', 'REQUIERE_INFORMACION');
create index solicitudes_titular_perfil_idx on public.solicitudes_titular (perfil_id, recibida_at desc);
create index solicitudes_titular_medio_idx on public.solicitudes_titular (medio_id);
create index solicitudes_titular_anunciante_idx on public.solicitudes_titular (anunciante_id);
create index solicitudes_titular_tramitada_por_idx on public.solicitudes_titular (tramitada_por);
create index solicitudes_titular_respondida_por_idx on public.solicitudes_titular (respondida_por);

create trigger trg_solicitudes_titular_m_updated_at before update on public.solicitudes_titular
  for each row execute function private.fn_set_updated_at();
create trigger trg_solicitudes_titular_z_auditar after insert or update or delete on public.solicitudes_titular
  for each row execute function private.fn_auditar('id');
insert into private.auditoria_columnas (tabla, columna, tratamiento) values
  ('solicitudes_titular', 'descripcion', 'ENMASCARAR'),
  ('solicitudes_titular', 'requerimiento', 'ENMASCARAR'),
  ('solicitudes_titular', 'informacion_aportada', 'ENMASCARAR'),
  ('solicitudes_titular', 'respuesta', 'ENMASCARAR'),
  ('solicitudes_titular', 'prorroga_motivo', 'ENMASCARAR'),
  ('solicitudes_titular', 'email_sha256', 'OMITIR')
on conflict (tabla, columna) do update set tratamiento = excluded.tratamiento;

alter table public.solicitudes_titular enable row level security;
create policy "solicitudes_titular: acceso válido" on public.solicitudes_titular as restrictive for all
  to authenticated using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "solicitudes_titular: select propio o interno" on public.solicitudes_titular for select to authenticated
  using (perfil_id = (select auth.uid()) or (select private.tiene_permiso('privacidad.gestionar')));
grant select on public.solicitudes_titular to authenticated;
grant select, insert, update, delete on public.solicitudes_titular to service_role;

-- 3.4 Procedimientos ------------------------------------------------------------------------------------------------

create function private.tipo_solicitud_titular_texto(p_tipo public.solicitud_titular_tipo) returns text
language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'CONSULTA' then 'consulta de datos'
    when 'PRUEBA_AUTORIZACION' then 'prueba de la autorización'
    when 'ACTUALIZACION' then 'actualización de datos'
    when 'RECTIFICACION' then 'rectificación de datos'
    when 'SUPRESION' then 'supresión de datos'
    when 'REVOCATORIA' then 'revocatoria de la autorización' end
$$;
revoke all on function private.tipo_solicitud_titular_texto(public.solicitud_titular_tipo) from public, anon, authenticated;

-- Plazo legal desde p_desde según la clase (consulta o reclamo) y fecha de aviso al equipo.
create function private.plazo_solicitud_titular(p_tipo public.solicitud_titular_tipo, p_desde date, p_prorroga boolean,
                                                p_base date default null)
returns table (vence date, alerta date)
language plpgsql stable security definer set search_path = '' as $$
declare v_consulta boolean := p_tipo in ('CONSULTA', 'PRUEBA_AUTORIZACION'); v_vence date; v_hoy date := private.hoy();
begin
  if p_prorroga then
    v_vence := private.sumar_dias_habiles(p_base, private.config_entero(
      case when v_consulta then 'privacidad.prorroga_consulta_dias' else 'privacidad.prorroga_reclamo_dias' end));
  else
    v_vence := private.sumar_dias_habiles(p_desde, private.config_entero(
      case when v_consulta then 'privacidad.plazo_consulta_dias' else 'privacidad.plazo_reclamo_dias' end));
  end if;
  return query select v_vence,
    least(v_vence, greatest(v_hoy, private.restar_dias_habiles(v_vence, private.config_entero('privacidad.alerta_dias'))));
end $$;
revoke all on function private.plazo_solicitud_titular(public.solicitud_titular_tipo, date, boolean, date)
  from public, anon, authenticated;

create function public.radicar_solicitud_titular_srv(p_actor_id uuid, p_session_id uuid, p_tipo text, p_descripcion text,
                                                     p_datos_afectados text[] default '{}')
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.solicitud_titular_tipo;
  v_p public.perfiles;
  v_rol public.rol_tipo;
  v_desc text := btrim(coalesce(p_descripcion, ''));
  v_plazo record;
  v_id uuid;
  v_numero bigint;
begin
  v_rol := private.validar_actor(p_actor_id, 'cuenta.gestionar', p_session_id);
  if p_tipo is null or not (p_tipo = any (enum_range(null::public.solicitud_titular_tipo)::text[])) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Elige el tipo de solicitud.';
  end if;
  v_tipo := p_tipo::public.solicitud_titular_tipo;
  if char_length(v_desc) < 10 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
      detail = 'Describe tu solicitud con al menos 10 caracteres.';
  end if;
  select * into v_p from public.perfiles p where p.id = p_actor_id;
  if exists (select 1 from public.solicitudes_titular s
             where s.perfil_id = p_actor_id and s.tipo = v_tipo and s.estado in ('RADICADA', 'EN_TRAMITE', 'REQUIERE_INFORMACION')) then
    raise exception using errcode = 'P0001', message = 'AMO_SOLICITUD_ABIERTA',
      detail = 'Ya tienes una solicitud de este tipo en trámite. Te avisaremos cuando la respondamos.';
  end if;
  select * into v_plazo from private.plazo_solicitud_titular(v_tipo, private.hoy(), false);
  insert into public.solicitudes_titular (perfil_id, email_sha256, rol_tipo, medio_id, anunciante_id, tipo, descripcion,
                                          datos_afectados, plazo_vence, alerta_desde)
  values (p_actor_id, encode(sha256(convert_to(lower(v_p.email::text), 'UTF8')), 'hex'), v_rol, v_p.medio_id,
          v_p.anunciante_id, v_tipo, v_desc,
          coalesce((select array_agg(distinct d order by d) from unnest(p_datos_afectados) d where d is not null), '{}'),
          v_plazo.vence, v_plazo.alerta)
  returning id, numero into v_id, v_numero;
  perform private.notificar(array[p_actor_id], 'titular.solicitud_radicada',
    jsonb_build_object('numero', v_numero, 'tipo', private.tipo_solicitud_titular_texto(v_tipo),
                       'vence', to_char(v_plazo.vence, 'DD/MM/YYYY')),
    'solicitudes_titular', v_id::text, null, 0::smallint);
  perform private.notificar_cola('privacidad.gestionar', 'cola.solicitud_titular',
    jsonb_build_object('numero', v_numero, 'tipo', private.tipo_solicitud_titular_texto(v_tipo),
                       'vence', to_char(v_plazo.vence, 'DD/MM/YYYY')),
    'solicitudes_titular', v_id::text, 1::smallint);
  return v_id;
end $$;
revoke all on function public.radicar_solicitud_titular_srv(uuid, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.radicar_solicitud_titular_srv(uuid, uuid, text, text, text[]) to service_role;

-- Lee la solicitud bloqueada y comprueba el estado; error uniforme si no existe o ya cambió.
create function private.solicitud_titular_para(p_id uuid, p_estados public.solicitud_titular_estado[])
returns public.solicitudes_titular
language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_titular;
begin
  select * into s from public.solicitudes_titular x where x.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La solicitud no existe.';
  end if;
  if not (s.estado = any (p_estados)) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La solicitud cambió de estado. Actualiza la página.';
  end if;
  return s;
end $$;
revoke all on function private.solicitud_titular_para(uuid, public.solicitud_titular_estado[]) from public, anon, authenticated;

create function public.tramitar_solicitud_titular_srv(p_id uuid, p_actor_id uuid, p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.validar_actor(p_actor_id, 'privacidad.gestionar', p_session_id);
  perform private.solicitud_titular_para(p_id, array['RADICADA']::public.solicitud_titular_estado[]);
  update public.solicitudes_titular
  set estado = 'EN_TRAMITE', en_tramite_at = private.ahora(), tramitada_por = p_actor_id
  where id = p_id;
end $$;
revoke all on function public.tramitar_solicitud_titular_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.tramitar_solicitud_titular_srv(uuid, uuid, uuid) to service_role;

create function public.requerir_informacion_titular_srv(p_id uuid, p_actor_id uuid, p_session_id uuid,
                                                        p_requerimiento text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_titular; v_texto text := btrim(coalesce(p_requerimiento, ''));
begin
  perform private.validar_actor(p_actor_id, 'privacidad.gestionar', p_session_id);
  s := private.solicitud_titular_para(p_id, array['RADICADA', 'EN_TRAMITE']::public.solicitud_titular_estado[]);
  if char_length(v_texto) < 10 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
      detail = 'Explica qué información necesitas (al menos 10 caracteres).';
  end if;
  update public.solicitudes_titular
  set estado = 'REQUIERE_INFORMACION', requerimiento = v_texto, requerida_at = private.ahora(),
      en_tramite_at = coalesce(en_tramite_at, private.ahora()), tramitada_por = coalesce(tramitada_por, p_actor_id)
  where id = p_id;
  if s.perfil_id is not null then
    perform private.notificar(array[s.perfil_id], 'titular.informacion_requerida',
      jsonb_build_object('numero', s.numero,
                         'limite', to_char(private.ahora()
                                           + make_interval(months => private.config_entero('privacidad.desistimiento_meses')),
                                           'DD/MM/YYYY')),
      'solicitudes_titular', s.id::text, null, 2::smallint);
  end if;
end $$;
revoke all on function public.requerir_informacion_titular_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.requerir_informacion_titular_srv(uuid, uuid, uuid, text) to service_role;

-- El titular completa su solicitud: el plazo se cuenta de nuevo desde el recibo de la información completa.
create function public.aportar_informacion_titular_srv(p_id uuid, p_actor_id uuid, p_session_id uuid, p_informacion text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_titular; v_texto text := btrim(coalesce(p_informacion, '')); v_plazo record;
begin
  perform private.validar_actor(p_actor_id, 'cuenta.gestionar', p_session_id);
  s := private.solicitud_titular_para(p_id, array['REQUIERE_INFORMACION']::public.solicitud_titular_estado[]);
  if s.perfil_id is distinct from p_actor_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Esta solicitud no es tuya.';
  end if;
  if char_length(v_texto) < 2 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Escribe la información que te pedimos.';
  end if;
  select * into v_plazo from private.plazo_solicitud_titular(s.tipo, private.hoy(), false);
  update public.solicitudes_titular
  set estado = 'EN_TRAMITE', informacion_aportada = v_texto, informacion_at = private.ahora(),
      plazo_vence = v_plazo.vence, alerta_desde = v_plazo.alerta, prorrogada_at = null, prorroga_motivo = null
  where id = p_id;
  perform private.notificar_cola('privacidad.gestionar', 'cola.solicitud_titular_informacion',
    jsonb_build_object('numero', s.numero, 'vence', to_char(v_plazo.vence, 'DD/MM/YYYY')),
    'solicitudes_titular', s.id::text, 1::smallint);
end $$;
revoke all on function public.aportar_informacion_titular_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.aportar_informacion_titular_srv(uuid, uuid, uuid, text) to service_role;

create function public.prorrogar_solicitud_titular_srv(p_id uuid, p_actor_id uuid, p_session_id uuid, p_motivo text)
returns date
language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_titular; v_motivo text := btrim(coalesce(p_motivo, '')); v_plazo record;
begin
  perform private.validar_actor(p_actor_id, 'privacidad.gestionar', p_session_id);
  s := private.solicitud_titular_para(p_id, array['RADICADA', 'EN_TRAMITE']::public.solicitud_titular_estado[]);
  if s.prorrogada_at is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El plazo de esta solicitud ya se prorrogó una vez.';
  end if;
  if private.hoy() > s.plazo_vence then
    raise exception using errcode = 'P0001', message = 'AMO_FUERA_DE_VENTANA',
      detail = 'El plazo ya venció: la prórroga se informa antes del vencimiento.';
  end if;
  if char_length(v_motivo) < 10 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
      detail = 'Explica al titular por qué necesitas más tiempo (al menos 10 caracteres).';
  end if;
  select * into v_plazo from private.plazo_solicitud_titular(s.tipo, null, true, s.plazo_vence);
  update public.solicitudes_titular
  set prorroga_motivo = v_motivo, prorrogada_at = private.ahora(), plazo_vence = v_plazo.vence, alerta_desde = v_plazo.alerta,
      estado = 'EN_TRAMITE', en_tramite_at = coalesce(en_tramite_at, private.ahora()),
      tramitada_por = coalesce(tramitada_por, p_actor_id)
  where id = p_id;
  if s.perfil_id is not null then
    perform private.notificar(array[s.perfil_id], 'titular.solicitud_prorrogada',
      jsonb_build_object('numero', s.numero, 'vence', to_char(v_plazo.vence, 'DD/MM/YYYY'), 'motivo', v_motivo),
      'solicitudes_titular', s.id::text, null, 1::smallint);
  end if;
  return v_plazo.vence;
end $$;
revoke all on function public.prorrogar_solicitud_titular_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.prorrogar_solicitud_titular_srv(uuid, uuid, uuid, text) to service_role;

create function public.responder_solicitud_titular_srv(p_id uuid, p_actor_id uuid, p_session_id uuid, p_decision text,
                                                       p_respuesta text, p_evidencia_path text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_titular; v_texto text := btrim(coalesce(p_respuesta, ''));
begin
  perform private.validar_actor(p_actor_id, 'privacidad.gestionar', p_session_id);
  s := private.solicitud_titular_para(p_id, array['RADICADA', 'EN_TRAMITE']::public.solicitud_titular_estado[]);
  if p_decision is null or not (p_decision = any (enum_range(null::public.solicitud_titular_decision)::text[])) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Elige la decisión.';
  end if;
  if char_length(v_texto) < 20 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
      detail = 'Escribe la respuesta al titular (al menos 20 caracteres).';
  end if;
  if p_evidencia_path is not null and p_evidencia_path !~ ('^titular/' || p_id::text || '/[0-9a-f-]{36}\.pdf$') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El soporte de la respuesta no es válido.';
  end if;
  update public.solicitudes_titular
  set estado = 'RESPONDIDA', decision = p_decision::public.solicitud_titular_decision, respuesta = v_texto,
      evidencia_path = p_evidencia_path, respondida_at = private.ahora(), respondida_por = p_actor_id,
      en_tramite_at = coalesce(en_tramite_at, private.ahora()), tramitada_por = coalesce(tramitada_por, p_actor_id)
  where id = p_id;
  if s.perfil_id is not null then
    perform private.notificar(array[s.perfil_id], 'titular.solicitud_respondida',
      jsonb_build_object('numero', s.numero,
                         'decision', case p_decision when 'PROCEDE' then 'procede'
                                                     when 'PROCEDE_PARCIAL' then 'procede en parte'
                                                     else 'no procede' end),
      'solicitudes_titular', s.id::text, null, 1::smallint);
  end if;
end $$;
revoke all on function public.responder_solicitud_titular_srv(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.responder_solicitud_titular_srv(uuid, uuid, uuid, text, text, text) to service_role;

create function public.desistir_solicitud_titular_srv(p_id uuid, p_actor_id uuid, p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare s public.solicitudes_titular;
begin
  perform private.validar_actor(p_actor_id, 'cuenta.gestionar', p_session_id);
  s := private.solicitud_titular_para(p_id,
         array['RADICADA', 'EN_TRAMITE', 'REQUIERE_INFORMACION']::public.solicitud_titular_estado[]);
  if s.perfil_id is distinct from p_actor_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Esta solicitud no es tuya.';
  end if;
  update public.solicitudes_titular set estado = 'DESISTIDA', desistida_at = private.ahora() where id = p_id;
end $$;
revoke all on function public.desistir_solicitud_titular_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.desistir_solicitud_titular_srv(uuid, uuid, uuid) to service_role;

-- Cron diario: desistimiento legal de los requerimientos sin respuesta y aviso al equipo de las solicitudes por vencer.
create function private.vencer_solicitudes_titular() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; x record; v_hoy date := private.hoy();
begin
  for x in select s.id, s.numero, s.perfil_id from public.solicitudes_titular s
           where s.estado = 'REQUIERE_INFORMACION'
             and s.requerida_at + make_interval(months => private.config_entero('privacidad.desistimiento_meses'))
                 <= private.ahora()
           for update skip locked loop
    update public.solicitudes_titular set estado = 'DESISTIDA', desistida_at = private.ahora() where id = x.id;
    if x.perfil_id is not null then
      perform private.notificar(array[x.perfil_id], 'titular.solicitud_desistida', jsonb_build_object('numero', x.numero),
                                'solicitudes_titular', x.id::text, null, 1::smallint);
    end if;
    v_n := v_n + 1;
  end loop;
  for x in select s.id, s.numero, s.tipo, s.plazo_vence from public.solicitudes_titular s
           where s.estado in ('RADICADA', 'EN_TRAMITE') and s.alerta_desde <= v_hoy loop
    v_n := v_n + private.notificar_cola('privacidad.gestionar', 'cola.solicitud_titular_por_vencer',
      jsonb_build_object('numero', x.numero, 'tipo', private.tipo_solicitud_titular_texto(x.tipo),
                         'vence', to_char(x.plazo_vence, 'DD/MM/YYYY'),
                         'situacion', case when x.plazo_vence < v_hoy then 'venció el'
                                           when x.plazo_vence = v_hoy then 'vence hoy,'
                                           else 'vence el' end),
      'solicitudes_titular', x.id::text, 2::smallint);
  end loop;
  return v_n;
end $$;
revoke all on function private.vencer_solicitudes_titular() from public, anon, authenticated;

-- 3.5 Exportación de los datos del titular (consulta, art. 14) -----------------------------------------------------
-- El propio titular, o quien tiene privacidad.gestionar para atender una consulta. Nunca entrega valores cifrados ni
-- notas internas; queda en la bitácora como EXPORTAR.
create function public.datos_titular(p_perfil_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' set timezone = 'America/Bogota' as $$
declare
  v_uid uuid := (select auth.uid());
  v_obj uuid := coalesce(p_perfil_id, (select auth.uid()));
  v_p public.perfiles;
  v_desde timestamptz := private.ahora() - interval '365 days';
  r jsonb;
begin
  if v_uid is null or not coalesce(private.acceso_valido(), false)
     or (v_obj <> v_uid and not private.tiene_permiso('privacidad.gestionar')) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'No tienes permiso para consultar esta información.';
  end if;
  select * into v_p from public.perfiles p where p.id = v_obj;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El titular no existe.';
  end if;
  r := jsonb_build_object(
    'generado_at', private.ahora(),
    'responsable', 'AMO — Advertising Market Optimization',
    'perfil', jsonb_build_object(
      'nombre', v_p.nombre, 'correo', v_p.email, 'celular', v_p.celular,
      'rol', (select ro.nombre from public.roles ro where ro.id = v_p.rol_id), 'estado', v_p.estado,
      'tiene_foto', v_p.avatar_path is not null, 'creado_at', v_p.created_at, 'activado_at', v_p.activado_at,
      'ultimo_acceso_at', v_p.ultimo_acceso_at, 'preferencias', v_p.preferencias),
    'identificacion', (select jsonb_build_object('tipo_documento', pp.tipo_documento,
                                                 'numero_documento', pp.numero_documento_resumen,
                                                 'fecha_nacimiento', pp.fecha_nacimiento, 'direccion', pp.direccion)
                       from public.perfiles_privado pp where pp.perfil_id = v_obj),
    'medio', (select jsonb_build_object(
        'nombre', m.nombre, 'tipo', m.tipo, 'municipio', mu.nombre, 'estado', m.estado,
        'nivel_verificacion', m.nivel_verificacion, 'creado_at', m.created_at,
        'datos_reservados', (select jsonb_build_object(
            'titular', mp.titular_nombre, 'tipo_documento', mp.tipo_documento,
            'numero_documento', mp.numero_documento_resumen, 'celular', mp.celular, 'correo', mp.email_contacto,
            'direccion', mp.direccion, 'metodo_pago', mp.metodo_pago, 'cuenta_de_pago', mp.datos_pago_resumen,
            'declarante', mp.es_declarante, 'obligado_a_facturar', mp.obligado_facturar,
            'responsable_de_iva', mp.responsable_iva)
          from public.medios_privado mp where mp.medio_id = m.id),
        'cuentas_sociales', (select coalesce(jsonb_agg(jsonb_build_object(
              'plataforma', c.plataforma, 'usuario', c.handle, 'enlace', c.url, 'seguidores', c.seguidores_verificados,
              'verificada', c.verificada, 'ultima_verificacion', c.fecha_ultima_verificacion) order by c.created_at), '[]')
          from public.cuentas_sociales c where c.medio_id = m.id and c.deleted_at is null),
        'documentos', (select coalesce(jsonb_agg(jsonb_build_object(
              'tipo', d.tipo, 'estado', d.estado_validacion, 'cargado_at', d.created_at,
              'vence', d.fecha_vencimiento) order by d.created_at), '[]')
          from public.documentos_medio d where d.medio_id = m.id))
      from public.medios m left join public.municipios mu on mu.codigo = m.municipio_codigo
      where m.id = v_p.medio_id),
    'empresa', (select jsonb_build_object(
        'razon_social', a.razon_social, 'nombre_comercial', a.nombre_comercial,
        'eres_el_contacto', coalesce(ap.contacto_email = v_p.email, false),
        'contacto', case when ap.contacto_email = v_p.email
                         then jsonb_build_object('nombre', ap.contacto_nombre, 'correo', ap.contacto_email,
                                                 'celular', ap.contacto_celular) end)
      from public.anunciantes a left join public.anunciantes_privado ap on ap.anunciante_id = a.id
      where a.id = v_p.anunciante_id),
    'autorizaciones', (select coalesce(jsonb_agg(jsonb_build_object(
          'documento', tv.tipo, 'version', tv.version, 'aceptada_at', at.aceptada_at,
          'ip', case when at.ip is null then null
                     when family(at.ip) = 4 then split_part(host(at.ip), '.', 1) || '.' || split_part(host(at.ip), '.', 2) || '.x.x'
                     else left(host(at.ip), 9) || '…' end) order by at.aceptada_at desc), '[]')
      from public.aceptaciones_terminos at join public.terminos_versiones tv on tv.id = at.termino_version_id
      where at.perfil_id = v_obj),
    'accesos', (select coalesce(jsonb_agg(x.fila order by x.creado desc), '[]') from (
        select a.created_at as creado, jsonb_build_object('fecha', a.created_at, 'evento', a.evento, 'pais', a.pais_iso2,
               'ciudad', a.ciudad, 'navegador', a.navegador, 'sistema', a.sistema_operativo, 'dispositivo', a.dispositivo) as fila
        from public.accesos a where a.usuario_id = v_obj and a.created_at >= v_desde
        order by a.created_at desc limit 500) x),
    'actividad', (select coalesce(jsonb_agg(x.fila order by x.creado desc), '[]') from (
        select b.created_at as creado, jsonb_build_object('fecha', b.created_at, 'accion', b.accion, 'entidad', b.entidad,
               'estado_nuevo', b.estado_nuevo) as fila
        from public.bitacora b where b.actor_id = v_obj and b.created_at >= v_desde
        order by b.created_at desc limit 500) x),
    'consultas_de_tus_datos_reservados', (select coalesce(jsonb_agg(x.fila order by x.creado desc), '[]') from (
        select b.created_at as creado, jsonb_build_object('fecha', b.created_at, 'rol_de_quien_consulto', b.actor_rol,
               'campos', b.metadatos -> 'campos') as fila
        from public.bitacora b
        where b.accion = 'REVELAR_DATO'
          and ((b.entidad = 'perfiles_privado' and b.entidad_id = v_obj::text)
               or (v_p.medio_id is not null and b.entidad = 'medios_privado' and b.entidad_id = v_p.medio_id::text))
        order by b.created_at desc limit 500) x),
    'solicitudes', (select coalesce(jsonb_agg(jsonb_build_object(
          'numero', s.numero, 'tipo', s.tipo, 'estado', s.estado, 'recibida_at', s.recibida_at, 'vence', s.plazo_vence,
          'decision', s.decision, 'respondida_at', s.respondida_at) order by s.recibida_at desc), '[]')
      from public.solicitudes_titular s where s.perfil_id = v_obj));
  perform private.registrar_en_bitacora('EXPORTAR', 'perfiles', v_obj::text, null,
    jsonb_build_object('alcance', 'datos_titular', 'propio', v_obj = v_uid), null, null, null, v_p.es_demo);
  return r;
end $$;
revoke all on function public.datos_titular(uuid) from public, anon, authenticated;
grant execute on function public.datos_titular(uuid) to authenticated;

-- 3.6 Supresión ---------------------------------------------------------------------------------------------------
-- Simula por defecto. Con p_simular = false exige la solicitud RESPONDIDA con decisión PROCEDE o PROCEDE_PARCIAL y la
-- ejecuta en una transacción: borra la cuenta (auth.users → perfil, datos reservados, notificaciones), suprime el
-- contacto y el pago del medio, sus documentos biométricos y bancarios, y el medio completo si no tiene historial.
-- Conserva lo que la ley obliga (bitácora enmascarada, aceptaciones, datos tributarios de documentos soporte emitidos)
-- y devuelve los archivos que el servidor borra de Storage después del commit.
create function public.suprimir_titular_srv(p_solicitud_id uuid, p_actor_id uuid, p_session_id uuid,
                                            p_simular boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.solicitudes_titular;
  v_p public.perfiles;
  v_medio uuid;
  v_otros integer := 0;
  v_historial boolean := false;
  v_bloqueos text[] := '{}';
  v_accion_medio text := 'NINGUNA';
  v_archivos jsonb := '[]'::jsonb;
  v_res jsonb;
  v_prev_motivo text := current_setting('amo.motivo', true);
begin
  perform private.validar_actor(p_actor_id, 'privacidad.gestionar', p_session_id);
  select * into s from public.solicitudes_titular x where x.id = p_solicitud_id for update;
  if not found or s.tipo not in ('SUPRESION', 'REVOCATORIA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo una solicitud de supresión o de revocatoria admite la supresión de datos.';
  end if;
  if s.supresion_ejecutada_at is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La supresión ya se ejecutó.';
  end if;
  if s.estado = 'DESISTIDA' or (s.estado = 'RESPONDIDA' and s.decision = 'NO_PROCEDE') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La solicitud está cerrada sin supresión.';
  end if;
  if not p_simular and s.estado <> 'RESPONDIDA' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Responde la solicitud (procede o procede en parte) antes de ejecutar la supresión.';
  end if;
  if s.perfil_id is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El titular ya no tiene cuenta.';
  end if;
  if s.perfil_id = p_actor_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Otra persona del equipo ejecuta la supresión de tus propios datos.';
  end if;
  select * into v_p from public.perfiles p where p.id = s.perfil_id for update;
  v_medio := v_p.medio_id;

  -- Deber legal o contractual de conservar (Decreto 1377 de 2013, art. 9): negocio en curso o dinero pendiente.
  if v_medio is not null then
    select count(*) into v_otros from public.perfiles p
    where p.medio_id = v_medio and p.id <> v_p.id and p.deleted_at is null and p.estado <> 'DESACTIVADO';
    v_historial := exists (select 1 from public.asignaciones a where a.medio_id = v_medio)
                   or exists (select 1 from public.liquidaciones l where l.medio_id = v_medio);
    if exists (select 1 from public.asignaciones a where a.medio_id = v_medio
               and a.estado not in ('PAGADA', 'RECHAZADA', 'VENCIDA_SIN_PUBLICAR', 'CANCELADA')) then
      v_bloqueos := v_bloqueos || 'El medio tiene asignaciones en curso o por pagar.'::text;
    end if;
    if exists (select 1 from public.liquidaciones l where l.medio_id = v_medio and l.estado not in ('PAGADA', 'ANULADA')) then
      v_bloqueos := v_bloqueos || 'El medio tiene liquidaciones sin pagar.'::text;
    end if;
    if exists (select 1 from public.disputas d join public.asignaciones a on a.id = d.asignacion_id
               where a.medio_id = v_medio and d.estado in ('ABIERTA', 'EN_REVISION')) then
      v_bloqueos := v_bloqueos || 'El medio tiene disputas abiertas.'::text;
    end if;
    v_accion_medio := case when v_otros > 0 then 'CONSERVAR' when v_historial then 'ANONIMIZAR' else 'BORRAR' end;
  end if;
  if exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id
             where p.id = v_p.id and r.clave = 'SUPERADMIN')
     and not exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id
                     where r.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null and p.id <> v_p.id) then
    v_bloqueos := v_bloqueos || 'Es el último superadministrador activo.'::text;
  end if;

  if v_p.avatar_path is not null then
    v_archivos := v_archivos || jsonb_build_object('bucket', 'avatares', 'prefijo', 'perfil/' || v_p.id::text || '/');
  end if;
  if v_accion_medio = 'BORRAR' then
    v_archivos := v_archivos || jsonb_build_object('bucket', 'documentos', 'prefijo', 'medio/' || v_medio::text || '/');
  elsif v_accion_medio = 'ANONIMIZAR' then
    v_archivos := v_archivos || coalesce((select jsonb_agg(jsonb_build_object('bucket', 'documentos', 'ruta', d.archivo_path))
                                          from public.documentos_medio d
                                          where d.medio_id = v_medio and d.archivo_path is not null
                                            and d.tipo in ('PRUEBA_VIDA', 'CERT_BANCARIA', 'CERT_BILLETERA')), '[]'::jsonb);
  end if;

  v_res := jsonb_build_object(
    'solicitud', s.numero,
    'bloqueos', to_jsonb(v_bloqueos),
    'cuenta', 'BORRAR',
    'medio', v_accion_medio,
    'contacto_empresa', case when v_p.anunciante_id is not null and exists (
                                select 1 from public.anunciantes_privado ap
                                where ap.anunciante_id = v_p.anunciante_id and ap.contacto_email = v_p.email)
                             then 'BORRAR' else 'NINGUNO' end,
    'archivos', v_archivos,
    'se_conserva', jsonb_build_array(
      'La bitácora de auditoría, con el correo enmascarado.',
      'Las aceptaciones de términos y de la política de datos, como prueba de la autorización.',
      'Los datos tributarios del medio y los documentos soporte emitidos, por el deber de conservación contable.',
      'Esta solicitud y su respuesta, como evidencia del cumplimiento.'));
  if p_simular then
    return v_res || jsonb_build_object('simulacion', true);
  end if;
  if cardinality(v_bloqueos) > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_SUPRESION_BLOQUEADA',
      detail = array_to_string(v_bloqueos, ' ');
  end if;

  perform set_config('amo.motivo', format('Supresión de datos del titular (solicitud N.º %s)', s.numero), true);
  if v_p.anunciante_id is not null then
    update public.anunciantes_privado
    set contacto_nombre = null, contacto_email = null, contacto_celular = null
    where anunciante_id = v_p.anunciante_id and contacto_email = v_p.email;
  end if;
  if v_accion_medio = 'ANONIMIZAR' then
    update public.medios_privado
    set celular = null, email_contacto = null, direccion = null, metodo_pago = null, datos_pago_cifrados = null,
        datos_pago_resumen = null
    where medio_id = v_medio;
    delete from public.documentos_medio
    where medio_id = v_medio and tipo in ('PRUEBA_VIDA', 'CERT_BANCARIA', 'CERT_BILLETERA');
    update public.medios set deleted_at = coalesce(deleted_at, private.ahora()),
                             motivo_estado = 'Supresión de datos del titular'
    where id = v_medio;
  end if;
  delete from auth.users u where u.id = v_p.id;      -- en cascada: perfil, datos reservados, notificaciones, sesiones
  if v_accion_medio = 'BORRAR' then
    begin
      delete from public.cuentas_sociales c where c.medio_id = v_medio;
      delete from public.medios m where m.id = v_medio;
    exception when foreign_key_violation then
      -- Algo lo sigue referenciando: se anonimiza como un medio con historial.
      update public.medios_privado
      set celular = null, email_contacto = null, direccion = null, metodo_pago = null, datos_pago_cifrados = null,
          datos_pago_resumen = null
      where medio_id = v_medio;
      update public.medios set deleted_at = coalesce(deleted_at, private.ahora()),
                               motivo_estado = 'Supresión de datos del titular'
      where id = v_medio;
      v_res := jsonb_set(v_res, '{medio}', '"ANONIMIZAR"');
    end;
  end if;
  update public.solicitudes_titular
  set supresion_ejecutada_at = private.ahora(), supresion_resultado = v_res - 'archivos'
  where id = s.id;
  perform set_config('amo.motivo', coalesce(v_prev_motivo, ''), true);
  return v_res;
end $$;
revoke all on function public.suprimir_titular_srv(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.suprimir_titular_srv(uuid, uuid, uuid, boolean) to service_role;

-- 3.7 Plantillas ----------------------------------------------------------------------------------------------------

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('cola.solicitud_titular', 'APP', 'Solicitud de un titular de datos', null,
   'Llegó la solicitud N.º {{numero}} ({{tipo}}). El plazo legal vence el {{vence}}.', array['numero', 'tipo', 'vence']),
  ('cola.solicitud_titular_informacion', 'APP', 'El titular completó su solicitud', null,
   'El titular respondió el requerimiento de la solicitud N.º {{numero}}. Nuevo plazo: {{vence}}.',
   array['numero', 'vence']),
  ('cola.solicitud_titular_por_vencer', 'APP', 'Solicitud de datos por vencer', null,
   'La solicitud N.º {{numero}} ({{tipo}}) {{situacion}} {{vence}}. Respóndela dentro del plazo legal.',
   array['numero', 'tipo', 'situacion', 'vence']),
  ('titular.solicitud_radicada', 'APP', 'Recibimos tu solicitud', null,
   'Radicamos tu solicitud N.º {{numero}} ({{tipo}}). Te responderemos a más tardar el {{vence}}.',
   array['numero', 'tipo', 'vence']),
  ('titular.informacion_requerida', 'APP', 'Necesitamos más información', null,
   'Para atender tu solicitud N.º {{numero}} necesitamos más información. Respóndenos antes del {{limite}} o la daremos por desistida.',
   array['numero', 'limite']),
  ('titular.solicitud_prorrogada', 'APP', 'Ampliamos el plazo de tu solicitud', null,
   'Ampliamos hasta el {{vence}} el plazo de tu solicitud N.º {{numero}}. Motivo: {{motivo}}',
   array['numero', 'vence', 'motivo']),
  ('titular.solicitud_respondida', 'APP', 'Respondimos tu solicitud', null,
   'Respondimos tu solicitud N.º {{numero}}: {{decision}}. Lee la respuesta en Cuenta → Privacidad.',
   array['numero', 'decision']),
  ('titular.solicitud_desistida', 'APP', 'Cerramos tu solicitud', null,
   'Cerramos tu solicitud N.º {{numero}} porque no recibimos la información pedida en el plazo legal.', array['numero'])
on conflict (clave, canal) do nothing;

-- 4. NOT-004 · Notificaciones por correo, construidas apagadas -------------------------------------------------------
-- Con correo.habilitado = false no se encola nada. Al encenderlo (Servicios-Pendientes-Definir.md §5): proveedor y
-- variables en Vercel, secretos amo_correos_url y amo_correos_secreto en Vault y el job amo_correos activo. Cada aviso
-- con plantilla EMAIL activa entra a private.correos_salientes; el despachador (/api/correos/procesar) los reclama con
-- SKIP LOCKED y un turno con vencimiento, y registra el resultado: reintentos con espera creciente y sin duplicados.

insert into public.configuracion (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica,
                                  pendiente_validacion) values
  ('correo.habilitado', 'false', 'BOOLEANO', null, null, null, 'correo',
   'Envía por correo los avisos con plantilla de correo activa. Requiere el proveedor configurado y el job amo_correos activo.',
   null, false, true),
  ('correo.max_intentos', '5', 'ENTERO', 1, 10, null, 'correo',
   'Intentos de envío de un correo antes de marcarlo como fallido.', 'intentos', false, false),
  ('correo.lote', '20', 'ENTERO', 1, 100, null, 'correo',
   'Correos que envía el despachador en cada corrida.', 'correos', false, false)
on conflict (clave) do nothing;

create table private.correos_salientes (
  id bigint generated always as identity primary key,
  notificacion_id bigint not null constraint correos_salientes_notificacion_key unique
    references public.notificaciones (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  clave text not null,
  datos jsonb not null default '{}'::jsonb constraint correos_salientes_datos_chk check (pg_column_size(datos) < 8192),
  estado text not null default 'PENDIENTE'
    constraint correos_salientes_estado_chk
    check (estado in ('PENDIENTE', 'ENVIANDO', 'REINTENTO', 'ENVIADO', 'FALLIDO', 'DESCARTADO')),
  intentos smallint not null default 0,
  proximo_intento_at timestamptz not null default private.ahora(),
  bloqueado_hasta timestamptz,
  proveedor_id text constraint correos_salientes_proveedor_chk check (char_length(proveedor_id) <= 120),
  ultimo_error text constraint correos_salientes_error_chk check (char_length(ultimo_error) <= 300),
  enviado_at timestamptz,
  created_at timestamptz not null default private.ahora()
);
create index correos_salientes_cola_idx on private.correos_salientes (proximo_intento_at, id)
  where estado in ('PENDIENTE', 'REINTENTO');
create index correos_salientes_turno_idx on private.correos_salientes (bloqueado_hasta) where estado = 'ENVIANDO';
create index correos_salientes_usuario_idx on private.correos_salientes (usuario_id);
revoke all on private.correos_salientes from public, anon, authenticated, service_role;

-- Categoría que ve la persona (copia de CATEGORIAS en src/features/notificaciones/presentacion.ts; un test las compara).
create function private.categoria_notificacion(p_tipo text) returns text
language sql immutable set search_path = '' as $$
  select case split_part(p_tipo, '.', 1)
    when 'oferta' then 'ofertas' when 'creativo' then 'ofertas' when 'campana' then 'ofertas'
    when 'asignacion' then 'asignaciones'
    when 'evidencia' then 'ejecucion' when 'metricas' then 'ejecucion'
    when 'liquidacion' then 'pagos' when 'multiplicador' then 'pagos' when 'factura' then 'pagos'
    when 'medio' then 'verificacion' when 'anunciante' then 'verificacion' when 'documento' then 'verificacion'
    when 'cuenta' then 'cuentas'
    when 'disputa' then 'disputas'
    when 'cola' then 'pendientes'
    when 'seguridad' then 'seguridad' when 'usuario' then 'seguridad'
    when 'titular' then 'privacidad'
    else 'otras' end
$$;
revoke all on function private.categoria_notificacion(text) from public, anon, authenticated;

-- La persona silencia categorías en Cuenta → Preferencias (perfiles.preferencias.correo.silenciadas). Seguridad y
-- privacidad nunca se silencian: son avisos de la cuenta y respuestas con plazo legal.
create function private.correo_silenciado(p_usuario uuid, p_tipo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.categoria_notificacion(p_tipo) not in ('seguridad', 'privacidad')
     and coalesce((select jsonb_typeof(p.preferencias -> 'correo' -> 'silenciadas') = 'array'
                          and (p.preferencias -> 'correo' -> 'silenciadas') ? private.categoria_notificacion(p_tipo)
                   from public.perfiles p where p.id = p_usuario), false)
$$;
revoke all on function private.correo_silenciado(uuid, text) from public, anon, authenticated;

-- Reclama un lote para enviar. Solo el servidor Next (service_role con contexto confiable) y solo con el correo
-- encendido. Primero descarta lo que ya no se debe enviar (plantilla inactiva, perfil no activo).
create function public.reclamar_correos_srv(p_limite integer default 20)
returns table (correo_id bigint, intento smallint, destinatario text, nombre text, clave text, asunto text, cuerpo text,
               datos jsonb, titulo text, mensaje text, entidad text, entidad_id text, url text)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.contexto_confiable() or not private.config_booleano('correo.habilitado') then return; end if;
  update private.correos_salientes q set estado = 'DESCARTADO', bloqueado_hasta = null
  where q.estado in ('PENDIENTE', 'REINTENTO')
    and (not exists (select 1 from public.plantillas_notificacion t
                     where t.clave = q.clave and t.canal = 'EMAIL' and t.activa)
         or not exists (select 1 from public.perfiles p
                        where p.id = q.usuario_id and p.estado = 'ACTIVO' and p.deleted_at is null));
  return query
  with c as (
    select q.id from private.correos_salientes q
    where (q.estado in ('PENDIENTE', 'REINTENTO') and q.proximo_intento_at <= private.ahora())
       or (q.estado = 'ENVIANDO' and q.bloqueado_hasta < private.ahora())
    order by q.proximo_intento_at, q.id
    limit least(greatest(coalesce(p_limite, 20), 1), 100)
    for update skip locked
  ), u as (
    update private.correos_salientes q
    set estado = 'ENVIANDO', intentos = q.intentos + 1, bloqueado_hasta = private.ahora() + interval '5 minutes'
    from c where q.id = c.id
    returning q.id, q.intentos, q.usuario_id, q.clave, q.datos, q.notificacion_id
  )
  select u.id, u.intentos, p.email::text, p.nombre, u.clave, t.asunto, t.cuerpo, u.datos, n.titulo, n.mensaje, n.entidad,
         n.entidad_id, n.url
  from u
  join public.perfiles p on p.id = u.usuario_id
  join public.plantillas_notificacion t on t.clave = u.clave and t.canal = 'EMAIL'
  join public.notificaciones n on n.id = u.notificacion_id
  order by u.id;
end $$;
revoke all on function public.reclamar_correos_srv(integer) from public, anon, authenticated;
grant execute on function public.reclamar_correos_srv(integer) to service_role;

-- Resultado de un envío. El intento es la marca de turno: un despachador que perdió el turno no pisa a otro.
create function public.registrar_envio_correo_srv(p_id bigint, p_intento smallint, p_resultado text,
                                                  p_proveedor_id text default null, p_error text default null)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare q private.correos_salientes; v_max integer := private.config_entero('correo.max_intentos');
begin
  if not private.contexto_confiable() then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Solo el servidor registra envíos.';
  end if;
  if p_resultado not in ('ENVIADO', 'REINTENTO', 'FALLIDO') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Resultado de envío no válido.';
  end if;
  select * into q from private.correos_salientes x where x.id = p_id for update;
  if not found or q.estado <> 'ENVIANDO' or q.intentos <> p_intento then return 'IGNORADO'; end if;
  if p_resultado = 'ENVIADO' then
    update private.correos_salientes
    set estado = 'ENVIADO', enviado_at = private.ahora(), proveedor_id = left(p_proveedor_id, 120), bloqueado_hasta = null,
        ultimo_error = null
    where id = p_id;
    update public.notificaciones set enviada_email_at = private.ahora() where id = q.notificacion_id;
    return 'ENVIADO';
  elsif p_resultado = 'REINTENTO' and q.intentos < v_max then
    update private.correos_salientes
    set estado = 'REINTENTO', bloqueado_hasta = null, ultimo_error = left(p_error, 300),
        proximo_intento_at = private.ahora()
                             + make_interval(mins => (array[1, 5, 30, 120, 360])[least(greatest(q.intentos, 1), 5)])
    where id = p_id;
    return 'REINTENTO';
  end if;
  update private.correos_salientes
  set estado = 'FALLIDO', bloqueado_hasta = null, ultimo_error = left(p_error, 300)
  where id = p_id;
  return 'FALLIDO';
end $$;
revoke all on function public.registrar_envio_correo_srv(bigint, smallint, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_envio_correo_srv(bigint, smallint, text, text, text) to service_role;

-- El job amo_correos (creado inactivo) llama cada minuto al despachador cuando hay correos por enviar. Usa pg_net, que se
-- habilita al activar el correo (Servicios-Pendientes-Definir.md §5): mientras tanto la función no se ejecuta.

create function private.disparar_envio_correos() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secreto text;
begin
  if not private.config_booleano('correo.habilitado') then return null; end if;
  if not exists (select 1 from private.correos_salientes q
                 where (q.estado in ('PENDIENTE', 'REINTENTO') and q.proximo_intento_at <= private.ahora())
                    or (q.estado = 'ENVIANDO' and q.bloqueado_hasta < private.ahora())) then
    return null;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'amo_correos_url';
  select s.decrypted_secret into v_secreto from vault.decrypted_secrets s where s.name = 'amo_correos_secreto';
  if v_url is null or v_secreto is null then
    raise log 'amo correo: faltan los secretos amo_correos_url o amo_correos_secreto en Vault';
    return null;
  end if;
  return net.http_post(url := v_url, body := '{}'::jsonb, timeout_milliseconds := 30000,
                       headers := jsonb_build_object('Content-Type', 'application/json',
                                                     'Authorization', 'Bearer ' || v_secreto));
end $$;
revoke all on function private.disparar_envio_correos() from public, anon, authenticated, service_role;

-- 5. Avisos: cola de correo (NOT-004) y tiempo real (NOT-007) -------------------------------------------------------

-- notificar: además del aviso en la aplicación, encola el correo cuando el envío está encendido, la plantilla de correo
-- está activa, el destinatario no silenció la categoría y no es una cuenta demo. Guarda los datos para armar el correo.
CREATE OR REPLACE FUNCTION private.notificar(p_usuarios uuid[], p_tipo text, p_datos jsonb, p_entidad text, p_entidad_id text, p_url text, p_prioridad smallint DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plantilla public.plantillas_notificacion;
  v_datos jsonb := coalesce(p_datos, '{}');
  v_titulo text;
  v_mensaje text;
  v_clave text;
  v_valor text;
  v_n integer;
  v_correo boolean;
begin
  if private.modo_carga() or coalesce(cardinality(p_usuarios), 0) = 0 then return 0; end if;
  select * into v_plantilla from public.plantillas_notificacion x
  where x.clave = p_tipo and x.canal = 'APP' and x.activa;
  if not found then return 0; end if;
  if v_datos ? 'oferta_id' and not v_datos ? 'oferta' then
    v_datos := v_datos || jsonb_build_object('oferta',
      (select o.titulo from public.ofertas o where o.id = (v_datos ->> 'oferta_id')::uuid));
  end if;
  v_titulo := v_plantilla.nombre;
  v_mensaje := v_plantilla.cuerpo;
  for v_clave, v_valor in select e.key, coalesce(e.value #>> '{}', '—') from jsonb_each(v_datos) e loop
    v_titulo := replace(v_titulo, '{{' || v_clave || '}}', v_valor);
    v_mensaje := replace(v_mensaje, '{{' || v_clave || '}}', v_valor);
  end loop;
  v_titulo := btrim(regexp_replace(v_titulo, '\{\{[a-z_]+\}\}', '—', 'g'));
  v_mensaje := btrim(regexp_replace(v_mensaje, '\{\{[a-z_]+\}\}', '—', 'g'));
  v_titulo := case when char_length(v_titulo) > 120 then left(v_titulo, 119) || '…' else v_titulo end;
  v_mensaje := case when char_length(v_mensaje) > 500 then left(v_mensaje, 499) || '…' else v_mensaje end;
  v_correo := private.config_booleano('correo.habilitado')
              and exists (select 1 from public.plantillas_notificacion x where x.clave = p_tipo and x.canal = 'EMAIL' and x.activa);

  -- Un aviso nunca tumba la operación que lo genera: si un destinatario se borró mientras se armaba (la llave foránea
  -- lo ve borrado aunque la lectura no), se reintenta con los perfiles vigentes.
  begin
    with ins as (
      insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url, prioridad, es_demo)
      select p.id, p_tipo, v_titulo, v_mensaje, left(p_entidad, 60), left(p_entidad_id, 80),
             case when p_url ~ '^/[^/]' and char_length(p_url) <= 300 and position('..' in p_url) = 0 then p_url end,
             least(greatest(coalesce(p_prioridad, 0), 0), 2)::smallint, p.es_demo
      from public.perfiles p
      where p.id = any (p_usuarios) and p.estado = 'ACTIVO' and p.deleted_at is null
      returning id, usuario_id, es_demo
    ), cola as (
      insert into private.correos_salientes (notificacion_id, usuario_id, clave, datos)
      select i.id, i.usuario_id, p_tipo, v_datos from ins i
      where v_correo and not i.es_demo and not private.correo_silenciado(i.usuario_id, p_tipo)
      returning 1
    )
    select count(*) into v_n from ins;
  exception when foreign_key_violation then
    with ins as (
      insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url, prioridad, es_demo)
      select p.id, p_tipo, v_titulo, v_mensaje, left(p_entidad, 60), left(p_entidad_id, 80),
             case when p_url ~ '^/[^/]' and char_length(p_url) <= 300 and position('..' in p_url) = 0 then p_url end,
             least(greatest(coalesce(p_prioridad, 0), 0), 2)::smallint, p.es_demo
      from public.perfiles p
      where p.id = any (p_usuarios) and p.estado = 'ACTIVO' and p.deleted_at is null
      returning id, usuario_id, es_demo
    ), cola as (
      insert into private.correos_salientes (notificacion_id, usuario_id, clave, datos)
      select i.id, i.usuario_id, p_tipo, v_datos from ins i
      where v_correo and not i.es_demo and not private.correo_silenciado(i.usuario_id, p_tipo)
      returning 1
    )
    select count(*) into v_n from ins;
  end;
  return v_n;
end $function$;

-- NOT-007: el aviso en vivo viaja por el canal privado del usuario (política «realtime: tópico propio») y lleva solo lo
-- necesario para refrescar el contador; el contenido se lee después con la sesión, bajo RLS.
CREATE OR REPLACE FUNCTION private.fn_notificacion_realtime()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.modo_carga() then return null; end if;
  perform realtime.send(
    jsonb_build_object('id', new.id, 'tipo', new.tipo, 'prioridad', new.prioridad,
                       'no_leidas', (select count(*) from public.notificaciones n
                                     where n.usuario_id = new.usuario_id and not n.leida)),
    'notificacion', 'usuario:' || new.usuario_id::text, true);
  return null;
end $function$;

-- 6. Limpieza final de las pruebas en producción (se construye; solo se ejecuta por orden expresa) -------------------
-- La llama scripts/produccion/limpiar-pruebas.ts conectado como postgres con amo.modo_carga y amo.purga encendidos, en
-- una sola transacción (simulación por defecto: rollback). Borra todo el negocio, los usuarios salvo los
-- superadministradores activos, la bitácora, los accesos y los avisos; conserva catálogos, configuración, tarifas,
-- roles y permisos. Las vigencias tributarias y resoluciones de prueba las retira después
-- `pnpm prod:config-pruebas --revertir`. Los archivos de Storage los borra el script con la API.

-- Clasificación de cada tabla: un test exige que toda tabla nueva de public o private quede en una de las dos listas.
create function private.tablas_limpieza() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'conservar', jsonb_build_array(
      'public.categorias', 'public.configuracion', 'public.departamentos', 'public.formatos', 'public.franjas',
      'public.municipios', 'public.niveles_verificacion', 'public.paises', 'public.parametros_tributarios',
      'public.perfiles', 'public.perfiles_privado', 'public.permisos', 'public.plantillas_notificacion',
      'public.reteica_municipal', 'public.resoluciones_dian', 'public.retenciones_config', 'public.rol_permisos',
      'public.roles', 'public.sectores', 'public.tarifas', 'public.terminos_versiones',
      'private.auditoria_columnas', 'private.transiciones_estado', 'private.festivos', 'private.demo_anunciantes',
      'private.demo_avisos', 'private.demo_control', 'private.demo_cuentas', 'private.demo_eventos', 'private.demo_medios',
      'private.demo_usuarios', 'private.sesiones_actividad'),
    'borrar', jsonb_build_array(
      'public.disputa_mensajes', 'public.disputas', 'public.metricas', 'public.publicaciones',
      'public.descargas_contenido', 'public.notas_credito', 'public.pagos_anunciante', 'public.documentos_soporte',
      'public.asignacion_montos', 'public.asignaciones', 'public.liquidaciones', 'public.dispersiones', 'public.facturas',
      'public.oferta_vistas', 'public.creativo_archivos', 'public.creativos', 'public.oferta_cupos',
      'public.oferta_historial', 'public.ofertas', 'public.comisiones_excepcion', 'public.campanas',
      'public.solicitudes_titular', 'public.verificaciones_cuenta', 'public.cuentas_sociales', 'public.documentos_medio',
      'public.medio_audiencia_paises', 'public.medio_categorias', 'public.medio_pertinencia_geografica',
      'public.medios_privado', 'public.medios', 'public.documentos_anunciante', 'public.anunciantes_privado',
      'public.anunciantes', 'public.solicitudes_vinculacion', 'public.aceptaciones_terminos', 'public.notificaciones',
      'public.accesos', 'public.bitacora', 'private.correos_salientes', 'private.intentos_login',
      'private.recordatorios_metricas', 'private.avisos_metricas_atrasadas'))
$$;
revoke all on function private.tablas_limpieza() from public, anon, authenticated;

create function private.limpiar_pruebas(p_conservar uuid[], p_terminos uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_super uuid[];
  v_conteo jsonb := '{}'::jsonb;
  v_n bigint;
  v_tabla text;
begin
  if not private.purga_habilitada() or not private.modo_carga() then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La limpieza exige una conexión directa como postgres con amo.modo_carga y amo.purga encendidos.';
  end if;
  select coalesce(array_agg(p.id order by p.id), '{}') into v_super
  from public.perfiles p join public.roles r on r.id = p.rol_id
  where r.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null;
  if coalesce(cardinality(p_conservar), 0) = 0
     or (select array_agg(x order by x) from (select distinct unnest(p_conservar) x) y) is distinct from v_super then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Las cuentas a conservar deben ser exactamente los superadministradores activos.';
  end if;
  if exists (select 1 from public.terminos_versiones t where t.id = any (coalesce(p_terminos, '{}'))
             and t.version not like '%PRUEBA%') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Solo se retiran las versiones de términos rotuladas de prueba.';
  end if;
  perform set_config('statement_timeout', '600s', true);

  -- Conteos previos (lo que se borra), en el orden de la clasificación.
  for v_tabla in select jsonb_array_elements_text(private.tablas_limpieza() -> 'borrar') loop
    execute format('select count(*) from %s', v_tabla) into v_n;
    v_conteo := v_conteo || jsonb_build_object(v_tabla, v_n);
  end loop;
  v_conteo := v_conteo
    || jsonb_build_object('auth.users', (select count(*) from auth.users u where not (u.id = any (p_conservar))))
    || jsonb_build_object('public.terminos_versiones',
                          (select count(*) from public.terminos_versiones t
                           where t.id = any (coalesce(p_terminos, '{}')) or t.version like '%PRUEBA%'));

  delete from public.disputa_mensajes;
  delete from public.disputas;
  delete from public.metricas;
  delete from public.publicaciones;
  delete from public.descargas_contenido;
  delete from public.notas_credito;
  delete from public.pagos_anunciante;
  delete from public.documentos_soporte;
  delete from public.asignacion_montos;
  delete from public.asignaciones;
  delete from public.liquidaciones;
  delete from public.dispersiones;
  delete from public.facturas;
  delete from public.oferta_vistas;
  delete from public.creativo_archivos;
  delete from public.creativos;
  delete from public.ofertas;                       -- cupos e historial en cascada
  delete from public.comisiones_excepcion;
  delete from public.campanas;
  delete from public.solicitudes_titular;
  delete from auth.users u where not (u.id = any (p_conservar));   -- perfiles, datos reservados, avisos, sesiones, MFA
  delete from public.verificaciones_cuenta;
  delete from public.cuentas_sociales;
  delete from public.medios;                        -- datos reservados, documentos, categorías, audiencia, pertinencia
  delete from public.anunciantes;                   -- datos reservados y documentos
  delete from public.solicitudes_vinculacion;
  delete from public.aceptaciones_terminos;
  delete from public.terminos_versiones t where t.id = any (coalesce(p_terminos, '{}')) or t.version like '%PRUEBA%';
  delete from public.notificaciones;
  delete from public.accesos;
  delete from public.bitacora;
  delete from private.intentos_login;
  delete from private.recordatorios_metricas;
  delete from private.avisos_metricas_atrasadas;
  delete from private.sesiones_actividad s where not (s.usuario_id = any (p_conservar));
  delete from auth.audit_log_entries;
  update public.perfiles set ultimo_acceso_at = null where id = any (p_conservar);

  perform private.registrar_en_bitacora('OTRO', 'plataforma', null, v_conteo, jsonb_build_object('alcance', 'limpieza'),
                                        'Limpieza final de las pruebas en producción', null, null, false);
  return v_conteo;
end $$;
revoke all on function private.limpiar_pruebas(uuid[], uuid[]) from public, anon, authenticated, service_role;

-- 7. Permiso privacidad.gestionar, jobs y plantillas de correo -------------------------------------------------------

-- Copia de supabase/seed/permisos.sql (pnpm db:permisos desde src/lib/auth/permisos.ts): agrega privacidad.gestionar.
-- Generado por scripts/db/permisos-seed.ts (pnpm db:permisos) desde src/lib/auth/permisos.ts — no editar.
-- Idempotente: upsert del catálogo y sincronización de los permisos por defecto de los roles de sistema.

insert into public.permisos (clave, modulo, descripcion, es_sensible, orden) values
  ('inicio.admin', 'inicio', 'Ver el panel de inicio administrativo', false, 1),
  ('inicio.anunciante', 'inicio', 'Ver el panel de inicio del anunciante', false, 2),
  ('inicio.medio', 'inicio', 'Ver el panel de inicio del medio', false, 3),
  ('analitica.global', 'analitica', 'Ver analítica agregada de toda la plataforma', false, 4),
  ('analitica.mapa', 'analitica', 'Usar el explorador geográfico', false, 5),
  ('reportes.ver', 'reportes', 'Consultar reportes (el anunciante solo ve los suyos)', false, 6),
  ('reportes.exportar', 'reportes', 'Exportar reportes a Excel y PDF', false, 7),
  ('reportes.finanzas', 'reportes', 'Ver reportes financieros y de cartera', false, 8),
  ('usuarios.ver', 'usuarios', 'Ver el listado y la ficha de usuarios', false, 9),
  ('usuarios.invitar', 'usuarios', 'Invitar usuarios y regenerar invitaciones', true, 10),
  ('usuarios.editar', 'usuarios', 'Editar datos, rol y organización de usuarios', true, 11),
  ('usuarios.suspender', 'usuarios', 'Suspender y reactivar usuarios', true, 12),
  ('usuarios.cerrar_sesiones', 'usuarios', 'Cerrar las sesiones activas de otro usuario', true, 13),
  ('usuarios.generar_enlace', 'usuarios', 'Generar enlaces de recuperación de contraseña', true, 14),
  ('usuarios.eliminar', 'usuarios', 'Desactivar usuarios definitivamente', true, 15),
  ('roles.ver', 'roles', 'Ver roles y sus permisos', false, 16),
  ('roles.gestionar', 'roles', 'Crear, editar y eliminar roles personalizados', true, 17),
  ('auditoria.ver', 'auditoria', 'Consultar la bitácora de auditoría', false, 18),
  ('auditoria.exportar', 'auditoria', 'Exportar la bitácora', false, 19),
  ('accesos.ver', 'accesos', 'Consultar el registro de accesos y su mapa', false, 20),
  ('accesos.exportar', 'accesos', 'Exportar el registro de accesos', false, 21),
  ('configuracion.ver', 'configuracion', 'Ver parámetros de la plataforma', false, 22),
  ('configuracion.editar', 'configuracion', 'Editar parámetros generales y niveles de verificación', true, 23),
  ('configuracion.tarifas', 'configuracion', 'Programar nuevas vigencias de tarifas', true, 24),
  ('configuracion.comisiones', 'configuracion', 'Editar la comisión global y sus excepciones', true, 25),
  ('configuracion.tributario', 'configuracion', 'Editar parámetros tributarios y resoluciones DIAN', true, 26),
  ('configuracion.catalogos', 'configuracion', 'Editar sectores, categorías, franjas, formatos, plantillas y términos', false, 27),
  ('datos_sensibles.ver', 'datos_sensibles', 'Revelar datos personales, documentos de identidad y datos bancarios (uno por uno, con bitácora)', true, 28),
  ('datos_sensibles.editar', 'datos_sensibles', 'Corregir datos personales o bancarios de terceros', true, 29),
  ('medios.ver', 'medios', 'Ver medios y sus fichas', false, 30),
  ('medios.editar', 'medios', 'Editar la ficha de cualquier medio', false, 31),
  ('medios.verificar', 'medios', 'Verificar medios, documentos y cuentas sociales (incluidas las reverificaciones)', false, 32),
  ('medios.suspender', 'medios', 'Suspender y reactivar medios', true, 33),
  ('medios.clasificar_pertinencia', 'medios', 'Clasificar la pertinencia geográfica de medios', false, 34),
  ('medios.editar_propio', 'medios', 'Editar el perfil, cuentas y documentos del propio medio', false, 35),
  ('anunciantes.ver', 'anunciantes', 'Ver anunciantes y sus fichas', false, 36),
  ('anunciantes.editar', 'anunciantes', 'Crear y editar anunciantes', false, 37),
  ('anunciantes.verificar', 'anunciantes', 'Verificar anunciantes y sus documentos', false, 38),
  ('anunciantes.suspender', 'anunciantes', 'Suspender y reactivar anunciantes', true, 39),
  ('anunciantes.editar_propio', 'anunciantes', 'Editar los datos de la propia empresa', false, 40),
  ('campanas.ver', 'campanas', 'Ver todas las campañas', false, 41),
  ('campanas.gestionar', 'campanas', 'Crear y gestionar campañas por cuenta de un anunciante', false, 42),
  ('campanas.gestionar_propias', 'campanas', 'Crear y gestionar las campañas propias', false, 43),
  ('ofertas.ver', 'ofertas', 'Ver todas las ofertas', false, 44),
  ('ofertas.gestionar', 'ofertas', 'Crear y editar ofertas por cuenta de un anunciante', false, 45),
  ('ofertas.moderar', 'ofertas', 'Moderar ofertas (publicar, devolver, rechazar, cancelar)', false, 46),
  ('ofertas.gestionar_propias', 'ofertas', 'Crear, enviar a revisión y cancelar ofertas propias', false, 47),
  ('ofertas.marketplace', 'ofertas', 'Ver el marketplace de ofertas elegibles', false, 48),
  ('ofertas.aceptar', 'ofertas', 'Aceptar o rechazar ofertas', false, 49),
  ('asignaciones.ver', 'asignaciones', 'Ver todas las asignaciones', false, 50),
  ('asignaciones.gestionar', 'asignaciones', 'Cancelar asignaciones', true, 51),
  ('asignaciones.ver_propias', 'asignaciones', 'Ver las asignaciones propias', false, 52),
  ('asignaciones.ejecutar', 'asignaciones', 'Descargar contenido, cargar evidencia y métricas', false, 53),
  ('evidencias.validar', 'evidencias', 'Validar o rechazar evidencias de publicación', false, 54),
  ('metricas.validar', 'metricas', 'Validar o rechazar métricas', false, 55),
  ('metricas.editar_validadas', 'metricas', 'Corregir métricas ya validadas', true, 56),
  ('liquidaciones.ver', 'liquidaciones', 'Ver todas las liquidaciones', false, 57),
  ('liquidaciones.generar', 'liquidaciones', 'Generar cortes de liquidación', false, 58),
  ('liquidaciones.aprobar', 'liquidaciones', 'Aprobar o anular liquidaciones y documentos soporte', true, 59),
  ('liquidaciones.registrar_pago', 'liquidaciones', 'Registrar el pago de liquidaciones con soporte', true, 60),
  ('liquidaciones.ver_propias', 'liquidaciones', 'Ver las liquidaciones y ganancias propias', false, 61),
  ('facturas.ver', 'facturas', 'Ver todas las facturas', false, 62),
  ('facturas.gestionar', 'facturas', 'Crear, emitir y anular facturas', true, 63),
  ('facturas.ver_propias', 'facturas', 'Ver las facturas propias', false, 64),
  ('pagos.registrar', 'pagos', 'Registrar pagos de anunciantes', true, 65),
  ('disputas.ver', 'disputas', 'Ver todas las disputas', false, 66),
  ('disputas.abrir', 'disputas', 'Abrir disputas sobre asignaciones', false, 67),
  ('disputas.resolver', 'disputas', 'Resolver o descartar disputas', true, 68),
  ('notificaciones.ver', 'notificaciones', 'Ver y marcar las notificaciones propias', false, 69),
  ('cuenta.gestionar', 'cuenta', 'Gestionar el perfil, la seguridad y las preferencias propias', false, 70),
  ('privacidad.gestionar', 'privacidad', 'Atender las solicitudes de titulares de datos (Ley 1581) y ejecutar supresiones', true, 71)
on conflict (clave) do update set
  modulo = excluded.modulo,
  descripcion = excluded.descripcion,
  es_sensible = excluded.es_sensible,
  orden = excluded.orden;

with por_defecto (rol_clave, permiso_clave) as (values
  ('SUPERADMIN', 'inicio.admin'),
  ('ADMIN', 'inicio.admin'),
  ('OPERACIONES', 'inicio.admin'),
  ('FINANZAS', 'inicio.admin'),
  ('SUPERADMIN', 'inicio.anunciante'),
  ('ANUNCIANTE', 'inicio.anunciante'),
  ('SUPERADMIN', 'inicio.medio'),
  ('MEDIO', 'inicio.medio'),
  ('SUPERADMIN', 'analitica.global'),
  ('ADMIN', 'analitica.global'),
  ('OPERACIONES', 'analitica.global'),
  ('FINANZAS', 'analitica.global'),
  ('SUPERADMIN', 'analitica.mapa'),
  ('ADMIN', 'analitica.mapa'),
  ('OPERACIONES', 'analitica.mapa'),
  ('FINANZAS', 'analitica.mapa'),
  ('SUPERADMIN', 'reportes.ver'),
  ('ADMIN', 'reportes.ver'),
  ('OPERACIONES', 'reportes.ver'),
  ('FINANZAS', 'reportes.ver'),
  ('ANUNCIANTE', 'reportes.ver'),
  ('SUPERADMIN', 'reportes.exportar'),
  ('ADMIN', 'reportes.exportar'),
  ('OPERACIONES', 'reportes.exportar'),
  ('FINANZAS', 'reportes.exportar'),
  ('ANUNCIANTE', 'reportes.exportar'),
  ('SUPERADMIN', 'reportes.finanzas'),
  ('ADMIN', 'reportes.finanzas'),
  ('FINANZAS', 'reportes.finanzas'),
  ('SUPERADMIN', 'usuarios.ver'),
  ('ADMIN', 'usuarios.ver'),
  ('OPERACIONES', 'usuarios.ver'),
  ('SUPERADMIN', 'usuarios.invitar'),
  ('ADMIN', 'usuarios.invitar'),
  ('SUPERADMIN', 'usuarios.editar'),
  ('ADMIN', 'usuarios.editar'),
  ('SUPERADMIN', 'usuarios.suspender'),
  ('ADMIN', 'usuarios.suspender'),
  ('SUPERADMIN', 'usuarios.cerrar_sesiones'),
  ('ADMIN', 'usuarios.cerrar_sesiones'),
  ('SUPERADMIN', 'usuarios.generar_enlace'),
  ('ADMIN', 'usuarios.generar_enlace'),
  ('SUPERADMIN', 'usuarios.eliminar'),
  ('SUPERADMIN', 'roles.ver'),
  ('ADMIN', 'roles.ver'),
  ('SUPERADMIN', 'roles.gestionar'),
  ('SUPERADMIN', 'auditoria.ver'),
  ('ADMIN', 'auditoria.ver'),
  ('SUPERADMIN', 'auditoria.exportar'),
  ('ADMIN', 'auditoria.exportar'),
  ('SUPERADMIN', 'accesos.ver'),
  ('ADMIN', 'accesos.ver'),
  ('SUPERADMIN', 'accesos.exportar'),
  ('ADMIN', 'accesos.exportar'),
  ('SUPERADMIN', 'configuracion.ver'),
  ('ADMIN', 'configuracion.ver'),
  ('OPERACIONES', 'configuracion.ver'),
  ('FINANZAS', 'configuracion.ver'),
  ('SUPERADMIN', 'configuracion.editar'),
  ('ADMIN', 'configuracion.editar'),
  ('SUPERADMIN', 'configuracion.tarifas'),
  ('ADMIN', 'configuracion.tarifas'),
  ('SUPERADMIN', 'configuracion.comisiones'),
  ('ADMIN', 'configuracion.comisiones'),
  ('SUPERADMIN', 'configuracion.tributario'),
  ('ADMIN', 'configuracion.tributario'),
  ('FINANZAS', 'configuracion.tributario'),
  ('SUPERADMIN', 'configuracion.catalogos'),
  ('ADMIN', 'configuracion.catalogos'),
  ('SUPERADMIN', 'datos_sensibles.ver'),
  ('ADMIN', 'datos_sensibles.ver'),
  ('OPERACIONES', 'datos_sensibles.ver'),
  ('FINANZAS', 'datos_sensibles.ver'),
  ('SUPERADMIN', 'datos_sensibles.editar'),
  ('ADMIN', 'datos_sensibles.editar'),
  ('SUPERADMIN', 'medios.ver'),
  ('ADMIN', 'medios.ver'),
  ('OPERACIONES', 'medios.ver'),
  ('FINANZAS', 'medios.ver'),
  ('SUPERADMIN', 'medios.editar'),
  ('ADMIN', 'medios.editar'),
  ('OPERACIONES', 'medios.editar'),
  ('SUPERADMIN', 'medios.verificar'),
  ('ADMIN', 'medios.verificar'),
  ('OPERACIONES', 'medios.verificar'),
  ('SUPERADMIN', 'medios.suspender'),
  ('ADMIN', 'medios.suspender'),
  ('OPERACIONES', 'medios.suspender'),
  ('SUPERADMIN', 'medios.clasificar_pertinencia'),
  ('ADMIN', 'medios.clasificar_pertinencia'),
  ('OPERACIONES', 'medios.clasificar_pertinencia'),
  ('SUPERADMIN', 'medios.editar_propio'),
  ('MEDIO', 'medios.editar_propio'),
  ('SUPERADMIN', 'anunciantes.ver'),
  ('ADMIN', 'anunciantes.ver'),
  ('OPERACIONES', 'anunciantes.ver'),
  ('FINANZAS', 'anunciantes.ver'),
  ('SUPERADMIN', 'anunciantes.editar'),
  ('ADMIN', 'anunciantes.editar'),
  ('OPERACIONES', 'anunciantes.editar'),
  ('SUPERADMIN', 'anunciantes.verificar'),
  ('ADMIN', 'anunciantes.verificar'),
  ('OPERACIONES', 'anunciantes.verificar'),
  ('SUPERADMIN', 'anunciantes.suspender'),
  ('ADMIN', 'anunciantes.suspender'),
  ('SUPERADMIN', 'anunciantes.editar_propio'),
  ('ANUNCIANTE', 'anunciantes.editar_propio'),
  ('SUPERADMIN', 'campanas.ver'),
  ('ADMIN', 'campanas.ver'),
  ('OPERACIONES', 'campanas.ver'),
  ('FINANZAS', 'campanas.ver'),
  ('SUPERADMIN', 'campanas.gestionar'),
  ('ADMIN', 'campanas.gestionar'),
  ('OPERACIONES', 'campanas.gestionar'),
  ('SUPERADMIN', 'campanas.gestionar_propias'),
  ('ANUNCIANTE', 'campanas.gestionar_propias'),
  ('SUPERADMIN', 'ofertas.ver'),
  ('ADMIN', 'ofertas.ver'),
  ('OPERACIONES', 'ofertas.ver'),
  ('FINANZAS', 'ofertas.ver'),
  ('SUPERADMIN', 'ofertas.gestionar'),
  ('ADMIN', 'ofertas.gestionar'),
  ('OPERACIONES', 'ofertas.gestionar'),
  ('SUPERADMIN', 'ofertas.moderar'),
  ('ADMIN', 'ofertas.moderar'),
  ('OPERACIONES', 'ofertas.moderar'),
  ('SUPERADMIN', 'ofertas.gestionar_propias'),
  ('ANUNCIANTE', 'ofertas.gestionar_propias'),
  ('SUPERADMIN', 'ofertas.marketplace'),
  ('MEDIO', 'ofertas.marketplace'),
  ('SUPERADMIN', 'ofertas.aceptar'),
  ('MEDIO', 'ofertas.aceptar'),
  ('SUPERADMIN', 'asignaciones.ver'),
  ('ADMIN', 'asignaciones.ver'),
  ('OPERACIONES', 'asignaciones.ver'),
  ('FINANZAS', 'asignaciones.ver'),
  ('SUPERADMIN', 'asignaciones.gestionar'),
  ('ADMIN', 'asignaciones.gestionar'),
  ('OPERACIONES', 'asignaciones.gestionar'),
  ('SUPERADMIN', 'asignaciones.ver_propias'),
  ('ANUNCIANTE', 'asignaciones.ver_propias'),
  ('MEDIO', 'asignaciones.ver_propias'),
  ('SUPERADMIN', 'asignaciones.ejecutar'),
  ('MEDIO', 'asignaciones.ejecutar'),
  ('SUPERADMIN', 'evidencias.validar'),
  ('ADMIN', 'evidencias.validar'),
  ('OPERACIONES', 'evidencias.validar'),
  ('SUPERADMIN', 'metricas.validar'),
  ('ADMIN', 'metricas.validar'),
  ('OPERACIONES', 'metricas.validar'),
  ('SUPERADMIN', 'metricas.editar_validadas'),
  ('ADMIN', 'metricas.editar_validadas'),
  ('SUPERADMIN', 'liquidaciones.ver'),
  ('ADMIN', 'liquidaciones.ver'),
  ('FINANZAS', 'liquidaciones.ver'),
  ('SUPERADMIN', 'liquidaciones.generar'),
  ('ADMIN', 'liquidaciones.generar'),
  ('FINANZAS', 'liquidaciones.generar'),
  ('SUPERADMIN', 'liquidaciones.aprobar'),
  ('ADMIN', 'liquidaciones.aprobar'),
  ('FINANZAS', 'liquidaciones.aprobar'),
  ('SUPERADMIN', 'liquidaciones.registrar_pago'),
  ('FINANZAS', 'liquidaciones.registrar_pago'),
  ('SUPERADMIN', 'liquidaciones.ver_propias'),
  ('MEDIO', 'liquidaciones.ver_propias'),
  ('SUPERADMIN', 'facturas.ver'),
  ('ADMIN', 'facturas.ver'),
  ('FINANZAS', 'facturas.ver'),
  ('SUPERADMIN', 'facturas.gestionar'),
  ('FINANZAS', 'facturas.gestionar'),
  ('SUPERADMIN', 'facturas.ver_propias'),
  ('ANUNCIANTE', 'facturas.ver_propias'),
  ('SUPERADMIN', 'pagos.registrar'),
  ('FINANZAS', 'pagos.registrar'),
  ('SUPERADMIN', 'disputas.ver'),
  ('ADMIN', 'disputas.ver'),
  ('OPERACIONES', 'disputas.ver'),
  ('FINANZAS', 'disputas.ver'),
  ('SUPERADMIN', 'disputas.abrir'),
  ('ADMIN', 'disputas.abrir'),
  ('OPERACIONES', 'disputas.abrir'),
  ('ANUNCIANTE', 'disputas.abrir'),
  ('MEDIO', 'disputas.abrir'),
  ('SUPERADMIN', 'disputas.resolver'),
  ('ADMIN', 'disputas.resolver'),
  ('OPERACIONES', 'disputas.resolver'),
  ('SUPERADMIN', 'notificaciones.ver'),
  ('ADMIN', 'notificaciones.ver'),
  ('OPERACIONES', 'notificaciones.ver'),
  ('FINANZAS', 'notificaciones.ver'),
  ('ANUNCIANTE', 'notificaciones.ver'),
  ('MEDIO', 'notificaciones.ver'),
  ('SUPERADMIN', 'cuenta.gestionar'),
  ('ADMIN', 'cuenta.gestionar'),
  ('OPERACIONES', 'cuenta.gestionar'),
  ('FINANZAS', 'cuenta.gestionar'),
  ('ANUNCIANTE', 'cuenta.gestionar'),
  ('MEDIO', 'cuenta.gestionar'),
  ('SUPERADMIN', 'privacidad.gestionar'),
  ('ADMIN', 'privacidad.gestionar')
), retirados as (
  delete from public.rol_permisos rp
  using public.roles r
  where r.id = rp.rol_id and r.es_sistema
    and not exists (select 1 from por_defecto d
                    where d.rol_clave = r.clave and d.permiso_clave = rp.permiso_clave)
)
insert into public.rol_permisos (rol_id, permiso_clave)
select r.id, d.permiso_clave
from por_defecto d
join public.roles r on r.clave = d.rol_clave and r.es_sistema
on conflict (rol_id, permiso_clave) do nothing;

-- 08:10 en Bogotá: desistimientos legales y avisos de solicitudes por vencer.
select cron.schedule('amo_privacidad', '10 13 * * *', $c$select private.vencer_solicitudes_titular()$c$);
-- Despachador de correo: creado inactivo. Se activa con el proveedor y los secretos de Vault (Servicios pendientes §5).
select cron.schedule('amo_correos', '* * * * *', $c$select private.disparar_envio_correos()$c$);
select cron.alter_job(job_id := (select j.jobid from cron.job j where j.jobname = 'amo_correos'), active := false);

-- Una plantilla de correo por cada aviso de la aplicación (mismo texto; el asunto es el título). Las de las colas del
-- equipo quedan inactivas para no inundar los buzones; se editan y activan en Configuración → Plantillas.
insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables, activa)
select t.clave, 'EMAIL', t.nombre, left(t.nombre, 200), t.cuerpo, t.variables, t.clave not like 'cola.%'
from public.plantillas_notificacion t
where t.canal = 'APP'
on conflict (clave, canal) do nothing;
