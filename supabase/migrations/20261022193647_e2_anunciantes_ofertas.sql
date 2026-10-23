-- E2 · Anunciante, campañas, asistente de oferta, creativos y moderación (fase 2: RF-ANU-001…010, ANU-014, ADM-003,
-- ADM-005; docs/modelo-datos.md §3.10, §5.11).
--
-- · Anunciante: «Enviar a verificación» con su marca de orden y aviso a la cola; la identificación tributaria y la razón
--   social solo se protegen una vez verificada la empresa (antes, el anunciante corrige lo que le rechazaron); un
--   extranjero siempre declara su identificación; el equipo AMO carga documentos por cuenta del anunciante; un
--   anunciante que no esté verificado (p. ej. suspendido) deja de recibir aceptaciones en sus ofertas.
-- · Campañas: activar exige empresa verificada con cualquier actor; las fechas no pueden dejar fuera a ofertas vivas;
--   la cascada de cancelación alcanza EN_EJECUCION (sin asignaciones vivas, que la campaña ya exige); presupuesto
--   disponible con una sola regla (`private.comprometido_en_ofertas`).
-- · Ofertas: historial de estados con el comentario de cada devolución (`oferta_historial`); envío a revisión que dice
--   qué paso del asistente falta (hint `envio_oferta:<paso>`); el modo asistido reenvía y retira de revisión; el cron
--   devuelve las ofertas cuya fecha límite vence en la cola y cancela borradores caducados (la campaña puede
--   finalizar); el estimador recibe exclusiones y publicaciones por medio, y no muestra precio ni alcance con menos
--   medios de los configurados; buscador de medios para excluir por nombre público.
-- · Creativos: cada archivo se valida contra los requisitos del formato (MIME, peso, relación de aspecto, duración,
--   cantidad), con huella SHA-256 y el objeto presente en Storage; en una oferta publicada la versión nueva nace
--   pendiente y solo reemplaza a la vigente (y avisa a los medios) cuando tiene sus archivos (`activar_creativo_srv`).

-- 1. Configuración -------------------------------------------------------------------------------------------------

insert into public.configuracion
  (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica, pendiente_validacion) values
  ('ofertas.estimador_n_minimo', '5', 'ENTERO', 3, 50, null, 'ofertas',
   'Medios elegibles mínimos por franja para mostrar cuántos son, el precio, la inversión y el alcance estimados sin revelar a un medio.',
   'medios', true, false),
  ('archivos.tolerancia_aspecto', '0.02', 'DECIMAL', 0, 0.2, null, 'archivos',
   'Diferencia relativa admitida entre la relación de aspecto de un creativo y la que exige su formato.',
   '×', true, false)
on conflict (clave) do nothing;

-- El bucket `creativos` corta en 50 MB: un valor mayor nunca se cumpliría.
update public.configuracion set maximo = 50 where clave = 'archivos.max_creativo_mb';

-- El asistente de oferta las muestra al anunciante (que no tiene `configuracion.ver`).
update public.configuracion set es_publica = true
where clave in ('ofertas.anticipacion_minima_horas', 'ofertas.minimo_medios', 'campanas.tope_porcentaje_por_medio',
                'archivos.max_creativo_mb', 'precios.recargo_exclusividad');

-- 2. Plantillas ----------------------------------------------------------------------------------------------------

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('cola.anunciante_verificacion', 'APP', 'Anunciante listo para verificar', null,
   '**{{anunciante}}** cargó sus documentos y envió su empresa a verificación.', array['anunciante']),
  ('oferta.caducada', 'APP', 'Oferta cancelada por fechas', null,
   'La oferta **{{oferta}}** se canceló porque su ventana de publicación terminó sin que se enviara a revisión.',
   array['oferta'])
on conflict (clave, canal) do nothing;

-- 3. Anunciantes ---------------------------------------------------------------------------------------------------

alter table public.anunciantes add column enviado_verificacion_at timestamptz;
create index anunciantes_cola_verificacion_idx on public.anunciantes (enviado_verificacion_at)
  where estado_verificacion = 'PENDIENTE' and deleted_at is null;

-- Último cambio de la identificación (NIT, DV, país, identificación extranjera o razón social) antes de verificar: los
-- documentos aprobados antes no la respaldan.
alter table public.anunciantes add column identificacion_cambiada_at timestamptz;

alter table public.anunciantes add constraint anunciantes_identificacion_ext_chk
  check (pais_iso2 = 'CO' or identificacion_extranjera is not null);

-- ADM-003: mientras la empresa no esté verificada, su usuario corrige lo que AMO le rechazó (NIT, DV, país, razón
-- social). Verificada o suspendida, esos datos solo los cambia el equipo AMO.
create or replace function private.fn_anunciantes_identificacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;

  if tg_op = 'UPDATE'
     and old.estado_verificacion in ('VERIFICADO', 'SUSPENDIDO')
     and (new.nit, new.digito_verificacion, new.identificacion_extranjera, new.pais_iso2, new.razon_social)
         is distinct from (old.nit, old.digito_verificacion, old.identificacion_extranjera, old.pais_iso2, old.razon_social)
     and coalesce((select auth.role()), '') = 'authenticated'
     and not private.tiene_permiso('anunciantes.editar') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La razón social y la identificación tributaria de una empresa verificada solo las corrige el equipo de AMO.';
  end if;

  if tg_op = 'UPDATE' and old.estado_verificacion not in ('VERIFICADO', 'SUSPENDIDO')
     and (new.nit, new.digito_verificacion, new.identificacion_extranjera, new.pais_iso2, new.razon_social)
         is distinct from (old.nit, old.digito_verificacion, old.identificacion_extranjera, old.pais_iso2, old.razon_social) then
    new.identificacion_cambiada_at := private.ahora();
  end if;

  if new.pais_iso2 = 'CO'
     and (tg_op = 'INSERT'
          or (new.nit, new.digito_verificacion, new.pais_iso2)
             is distinct from (old.nit, old.digito_verificacion, old.pais_iso2)) then
    if new.digito_verificacion is null then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'Indica el dígito de verificación del NIT.';
    end if;
    if new.digito_verificacion is distinct from private.digito_verificacion_nit(new.nit) then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.';
    end if;
  end if;
  return new;
end $$;

drop trigger trg_anunciantes_b_identificacion on public.anunciantes;
create trigger trg_anunciantes_b_identificacion
  before insert or update of nit, digito_verificacion, identificacion_extranjera, pais_iso2, razon_social
  on public.anunciantes for each row execute function private.fn_anunciantes_identificacion();

-- Documentos que exige la verificación: en Colombia, RUT y Cámara de Comercio; en el exterior, un documento de
-- existencia de la empresa (Cámara de Comercio u otro equivalente; un certificado bancario no lo es).
create or replace function private.validar_verificacion_anunciante(p_anunciante_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_pais char(2); v_cambio timestamptz; v_faltan text[];
begin
  select a.pais_iso2, a.identificacion_cambiada_at into v_pais, v_cambio from public.anunciantes a where a.id = p_anunciante_id;
  if v_pais = 'CO' then
    select coalesce(array_agg(private.nombre_documento(x.tipo::text) order by x.tipo), '{}') into v_faltan
    from unnest(array['RUT', 'CAMARA_COMERCIO']::public.documento_anunciante_tipo[]) as x (tipo)
    where not exists (select 1 from public.documentos_anunciante d
                      where d.anunciante_id = p_anunciante_id and d.tipo = x.tipo and d.estado_validacion = 'APROBADO'
                        and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())
                        and (v_cambio is null or d.validado_at >= v_cambio));
  elsif not exists (select 1 from public.documentos_anunciante d
                    where d.anunciante_id = p_anunciante_id and d.tipo in ('CAMARA_COMERCIO', 'OTRO')
                      and d.estado_validacion = 'APROBADO'
                      and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())
                      and (v_cambio is null or d.validado_at >= v_cambio)) then
    v_faltan := array['un documento de existencia de la empresa'];
  end if;
  if cardinality(v_faltan) > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Faltan documentos aprobados y vigentes: ' || array_to_string(v_faltan, ', ') || '.'
               || case when v_cambio is not null
                            and exists (select 1 from public.documentos_anunciante d
                                        where d.anunciante_id = p_anunciante_id and d.estado_validacion = 'APROBADO'
                                          and d.validado_at < v_cambio)
                       then ' La identificación de la empresa cambió después de aprobar algunos: deben cargarse y aprobarse de nuevo.'
                       else '' end;
  end if;
end $$;

-- ADM-003 / ANU-001: el anunciante envía su empresa a la cola (o la reenvía tras un rechazo, que la devuelve a
-- PENDIENTE). Exige los documentos cargados (pendientes o aprobados) y la persona de contacto; la decisión es del
-- equipo AMO.
create function public.enviar_anunciante_a_verificacion_srv(p_anunciante_id uuid, p_actor_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_anunciante public.anunciantes; v_faltan text[] := '{}'; v_contacto boolean;
begin
  perform private.validar_actor(p_actor_id, 'anunciantes.editar_propio', p_session_id);
  if (select p.anunciante_id from public.perfiles p where p.id = p_actor_id) is distinct from p_anunciante_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into v_anunciante from public.anunciantes a where a.id = p_anunciante_id and a.deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La empresa no existe.';
  end if;
  if v_anunciante.estado_verificacion not in ('PENDIENTE', 'RECHAZADO') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Tu empresa ya está verificada.';
  end if;
  if v_anunciante.pais_iso2 = 'CO' then
    select coalesce(array_agg(private.nombre_documento(x.tipo::text) order by x.tipo), '{}') into v_faltan
    from unnest(array['RUT', 'CAMARA_COMERCIO']::public.documento_anunciante_tipo[]) as x (tipo)
    where not exists (select 1 from public.documentos_anunciante d
                      where d.anunciante_id = p_anunciante_id and d.tipo = x.tipo
                        and (d.estado_validacion = 'PENDIENTE'
                             or (d.estado_validacion = 'APROBADO'
                                 and (v_anunciante.identificacion_cambiada_at is null
                                      or d.validado_at >= v_anunciante.identificacion_cambiada_at)))
                        and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy()));
  elsif not exists (select 1 from public.documentos_anunciante d
                    where d.anunciante_id = p_anunciante_id and d.tipo in ('CAMARA_COMERCIO', 'OTRO')
                      and (d.estado_validacion = 'PENDIENTE'
                           or (d.estado_validacion = 'APROBADO'
                               and (v_anunciante.identificacion_cambiada_at is null
                                    or d.validado_at >= v_anunciante.identificacion_cambiada_at)))
                      and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())) then
    v_faltan := array['un documento de existencia de la empresa'];
  end if;
  v_contacto := exists (select 1 from public.anunciantes_privado p
                        where p.anunciante_id = p_anunciante_id and p.contacto_nombre is not null
                          and p.contacto_email is not null);
  if cardinality(v_faltan) > 0 or not v_contacto then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Antes de enviar '
               || concat_ws(' y ',
                            case when cardinality(v_faltan) > 0 then 'carga: ' || array_to_string(v_faltan, ', ') end,
                            case when not v_contacto then 'completa la persona de contacto (nombre y correo)' end)
               || '.';
  end if;
  if v_anunciante.estado_verificacion = 'RECHAZADO' then
    perform private.aplicar_transicion('anunciantes', p_anunciante_id, 'PENDIENTE', 'ANUNCIANTE', p_actor_id, null, '{}');
  end if;
  update public.anunciantes set enviado_verificacion_at = private.ahora() where id = p_anunciante_id;
  perform private.notificar_cola('anunciantes.verificar', 'cola.anunciante_verificacion',
                                 jsonb_build_object('anunciante', v_anunciante.nombre_comercial),
                                 'anunciantes', p_anunciante_id::text, 1::smallint);
end $$;
revoke all on function public.enviar_anunciante_a_verificacion_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.enviar_anunciante_a_verificacion_srv(uuid, uuid, uuid) to service_role;

-- Carga de documentos por cuenta del anunciante (equipo AMO con `anunciantes.editar`). La Server Action confirma el
-- objeto como servicio tras el DAL: los internos no leen el bucket `documentos` directamente.
create policy "documentos_anunciante: insert interno" on public.documentos_anunciante for insert to authenticated
  with check ((select private.tiene_permiso('anunciantes.editar')));
create policy "storage: documentos insert interno" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and private.seg(name, 1) = 'anunciante'
              and (select private.tiene_permiso('anunciantes.editar'))
              and private.seg(name, 3) = any ((enum_range(null::public.documento_anunciante_tipo))::text[])
              and exists (select 1 from public.anunciantes a
                          where a.id = private.seg_uuid(name, 2) and a.deleted_at is null));

-- Reenviar un anunciante rechazado solo por `enviar_anunciante_a_verificacion_srv` (marca de orden y aviso a la cola).
create or replace function public.transicionar_srv(p_entidad text, p_id uuid, p_hacia text, p_actor_id uuid, p_session_id uuid, p_motivo text DEFAULT NULL::text, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                          'metricas:RECHAZADA→PENDIENTE', 'facturas:BORRADOR→EMITIDA', 'documentos_soporte:BORRADOR→EMITIDO',
                          'anunciantes:RECHAZADO→PENDIENTE'])
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
end $function$;

-- 4. Campañas ------------------------------------------------------------------------------------------------------

create or replace function private.validar_condicion_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text, p_actor_tipo transicion_actor, p_actor_id uuid, p_motivo text, p_datos jsonb)
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
  case
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
      perform private.validar_verificacion_asignacion(p_id, p_motivo, p_datos);
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

create or replace function private.fn_campanas_guardar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.modo_carga() then return new; end if;
  if new.presupuesto_total < new.presupuesto_comprometido then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA',
      detail = 'El presupuesto no puede quedar por debajo de lo ya comprometido.';
  end if;
  perform private.validar_campana_guardar(new.id, new.fecha_inicio, new.fecha_fin, new.presupuesto_total,
                                          old.presupuesto_total,
                                          (new.fecha_inicio, new.fecha_fin) is distinct from (old.fecha_inicio, old.fecha_fin));
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
end $function$;

-- Lo que las otras ofertas de la campaña ya reservan: el máximo de las que están en revisión o publicadas y lo
-- efectivamente comprometido de las vencidas o cerradas. Borradores, devueltas y canceladas no reservan.
create function private.comprometido_en_ofertas(p_campana_id uuid, p_excluir uuid default null) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when o.estado in ('VENCIDA', 'CERRADA') then o.presupuesto_comprometido
                           else o.presupuesto_maximo end), 0)
  from public.ofertas o
  where o.campana_id = p_campana_id and o.id is distinct from p_excluir and o.deleted_at is null
    and o.estado in ('EN_REVISION', 'PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION', 'VENCIDA', 'CERRADA') $$;
revoke all on function private.comprometido_en_ofertas(uuid, uuid) from public, anon, authenticated;

-- Guardas de la campaña que necesitan ver todas sus ofertas (el trigger corre con los permisos de quien edita y la RLS
-- le ocultaría las ajenas a su rol): el total no baja de lo que reservan las ofertas vivas (ANU-003) y las fechas no
-- dejan fuera la ventana de una oferta en revisión o publicada.
create function private.validar_campana_guardar(p_campana_id uuid, p_inicio date, p_fin date, p_total numeric,
                                                p_total_anterior numeric, p_fechas_cambian boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_total < p_total_anterior and p_total < private.comprometido_en_ofertas(p_campana_id) then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA',
      detail = 'El presupuesto no puede quedar por debajo de lo que reservan las ofertas en revisión o publicadas.';
  end if;
  if p_fechas_cambian
     and exists (select 1 from public.ofertas o
                 where o.campana_id = p_campana_id and o.deleted_at is null
                   and o.estado in ('EN_REVISION', 'PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')
                   and (o.ventana_inicio < private.inicio_dia(p_inicio) or o.ventana_fin > private.inicio_dia(p_fin + 1))) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Hay ofertas en revisión o publicadas cuya ventana quedaría fuera de las nuevas fechas de la campaña.';
  end if;
end $$;
revoke all on function private.validar_campana_guardar(uuid, date, date, numeric, numeric, boolean) from public, anon;
grant execute on function private.validar_campana_guardar(uuid, date, date, numeric, numeric, boolean)
  to authenticated, service_role;

-- Archivar (ocultar) lo que ya no sirve. La sesión del dueño no puede: la fila nueva dejaría de cumplir su política de
-- lectura (`deleted_at is null`).
create function public.archivar_campana_srv(p_campana_id uuid, p_actor_id uuid, p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; c public.campanas;
begin
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);
  select * into c from public.campanas x where x.id = p_campana_id and x.deleted_at is null for update;
  if c.id is null
     or not ((v_tipo = 'ANUNCIANTE' and private.tiene_permiso_de(p_actor_id, 'campanas.gestionar_propias')
              and c.anunciante_id = (select p.anunciante_id from public.perfiles p where p.id = p_actor_id))
             or (v_tipo = 'ADMIN' and private.tiene_permiso_de(p_actor_id, 'campanas.gestionar'))) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if c.estado not in ('BORRADOR', 'CANCELADA', 'FINALIZADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se archivan campañas en borrador, canceladas o finalizadas.';
  end if;
  update public.ofertas o set deleted_at = private.ahora()
  where o.campana_id = p_campana_id and o.deleted_at is null and o.estado in ('BORRADOR', 'CANCELADA', 'VENCIDA', 'CERRADA');
  update public.campanas x set deleted_at = private.ahora() where x.id = p_campana_id;
end $$;
revoke all on function public.archivar_campana_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.archivar_campana_srv(uuid, uuid, uuid) to service_role;

create function public.archivar_oferta_srv(p_oferta_id uuid, p_actor_id uuid, p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; o public.ofertas;
begin
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);
  select * into o from public.ofertas x where x.id = p_oferta_id and x.deleted_at is null for update;
  if o.id is null
     or not ((v_tipo = 'ANUNCIANTE' and private.tiene_permiso_de(p_actor_id, 'ofertas.gestionar_propias')
              and o.anunciante_id = (select p.anunciante_id from public.perfiles p where p.id = p_actor_id))
             or (v_tipo = 'ADMIN' and private.tiene_permiso_de(p_actor_id, 'ofertas.gestionar'))) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if o.estado not in ('BORRADOR', 'CANCELADA', 'VENCIDA', 'CERRADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se archivan borradores y ofertas terminadas.';
  end if;
  -- Una vencida con cupos tomados sigue en ejecución para esos medios hasta cerrar.
  if o.estado = 'VENCIDA' and o.cupos_ocupados > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Hay medios publicando esta oferta: archívala cuando se cierre.';
  end if;
  update public.ofertas x set deleted_at = private.ahora() where x.id = p_oferta_id;
end $$;
revoke all on function public.archivar_oferta_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.archivar_oferta_srv(uuid, uuid, uuid) to service_role;

-- ANU-007: presupuesto que le queda a la campaña para una oferta (la que se edita no cuenta). Null si no se ve.
create function public.disponible_campana(p_campana_id uuid, p_excluir_oferta uuid default null) returns numeric
language sql stable security definer set search_path = '' as $$
  select c.presupuesto_total - private.comprometido_en_ofertas(c.id, p_excluir_oferta)
  from public.campanas c
  where c.id = p_campana_id and c.deleted_at is null and (select private.acceso_valido())
    and ((select private.tiene_permiso('campanas.ver'))
         or c.anunciante_id = (select private.mi_anunciante_id())) $$;
revoke all on function public.disponible_campana(uuid, uuid) from public, anon;
grant execute on function public.disponible_campana(uuid, uuid) to authenticated;

-- 5. Ofertas -------------------------------------------------------------------------------------------------------

-- ANU-009 / ADM-005: cada cambio de estado con quién lo hizo y su comentario (las devoluciones conservan el suyo
-- aunque la oferta se devuelva otra vez). Solo lo escribe el trigger.
create table public.oferta_historial (
  id uuid primary key default private.uuid_v7(),
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  desde public.oferta_estado not null,
  hacia public.oferta_estado not null,
  actor_tipo public.transicion_actor not null,
  actor_id uuid references public.perfiles (id) on delete set null,
  comentario text constraint oferta_historial_comentario_chk check (char_length(comentario) <= 2000),
  created_at timestamptz not null default private.ahora()
);
create index oferta_historial_oferta_idx on public.oferta_historial (oferta_id, created_at desc);
create index oferta_historial_actor_idx on public.oferta_historial (actor_id);
alter table public.oferta_historial enable row level security;
create policy "oferta_historial: acceso válido" on public.oferta_historial as restrictive for all
  to authenticated using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "oferta_historial: select interno o propio" on public.oferta_historial for select to authenticated
  using ((select private.tiene_permiso('ofertas.ver')) or private.es_mi_oferta(oferta_id));
grant select on public.oferta_historial to authenticated;
grant select on public.oferta_historial to service_role;

create function private.fn_ofertas_historial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_tipo text := nullif(current_setting('amo.actor_tipo', true), '');
begin
  if private.modo_carga() then return null; end if;
  insert into public.oferta_historial (oferta_id, desde, hacia, actor_tipo, actor_id, comentario)
  values (new.id, old.estado, new.estado, coalesce(v_tipo, 'SISTEMA')::public.transicion_actor,
          case when v_tipo = 'SISTEMA' then null else private.actor_id() end,
          case when new.estado = 'DEVUELTA' and v_tipo = 'ADMIN' then new.comentario_moderacion
               else nullif(current_setting('amo.motivo', true), '') end);
  return null;
end $$;
revoke all on function private.fn_ofertas_historial() from public, anon, authenticated;
create trigger trg_ofertas_z_historial after update of estado on public.ofertas
  for each row when (old.estado is distinct from new.estado) execute function private.fn_ofertas_historial();

-- Modo asistido (ADM-014): el equipo AMO reenvía una devuelta y retira de revisión por cuenta del anunciante. El cron
-- devuelve lo que vence en la cola y la cascada de una campaña cancelada alcanza a EN_EJECUCION.
insert into private.transiciones_estado (entidad, desde, hacia, actor, permiso, requiere_motivo, columna_at, modo_at, descripcion) values
  ('ofertas', 'DEVUELTA', 'EN_REVISION', 'ADMIN', 'ofertas.gestionar', false, 'enviada_at', 'SIEMPRE',
   'Reenvío a revisión por cuenta del anunciante (modo asistido)'),
  ('ofertas', 'EN_REVISION', 'BORRADOR', 'ADMIN', 'ofertas.gestionar', false, null, null,
   'Retiro de revisión por cuenta del anunciante (modo asistido)'),
  ('ofertas', 'EN_REVISION', 'DEVUELTA', 'SISTEMA', null, false, 'devuelta_at', 'SIEMPRE',
   'La fecha límite de aceptación venció mientras estaba en revisión'),
  ('ofertas', 'EN_EJECUCION', 'CANCELADA', 'SISTEMA', null, false, 'cancelada_at', 'SIEMPRE',
   'Cancelación de la campaña sin asignaciones vivas');

create or replace function private.ejecutar_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text, p_actor_tipo transicion_actor, p_actor_id uuid, p_motivo text, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
             where o.campana_id = p_id and o.estado in ('BORRADOR', 'EN_REVISION', 'DEVUELTA', 'PUBLICADA', 'EN_EJECUCION')
               -- Las que tienen obligaciones (cumplidas) se cierran solas con el cron.
               and not exists (select 1 from public.asignaciones a
                               where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa))
             order by o.id loop
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
end $function$;

-- ANU-009 / ADM-005: el comentario de moderación queda en la oferta en cada devolución o rechazo.
create or replace function private.aplicar_transicion(p_entidad text, p_id uuid, p_hacia text, p_actor_tipo transicion_actor, p_actor_id uuid, p_motivo text DEFAULT NULL::text, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      elsif v_datos ? 'nivel' and p_hacia = 'VERIFICADO' and v_desde in ('PENDIENTE', 'VERIFICADO') then
        v_sets := v_sets || ($s$nivel_verificacion = ($4 ->> 'nivel')::smallint$s$)::text;
      end if;
      if p_hacia = 'VERIFICADO' and v_desde in ('PENDIENTE', 'VERIFICADO') then
        v_sets := v_sets || 'verificado_por = $5'::text;
      end if;
    when 'documentos_medio', 'documentos_anunciante' then
      if p_hacia in ('APROBADO', 'RECHAZADO') then
        v_sets := v_sets || array['validado_por = $5', $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$];
      end if;
      -- MED-003: quien aprueba puede fijar la vigencia del documento (cédula, certificados, seguridad social…).
      if p_hacia = 'APROBADO' then
        v_sets := v_sets || ($s$fecha_vencimiento = coalesce(($4 ->> 'fecha_vencimiento')::date, fecha_vencimiento)$s$)::text;
      end if;
    when 'verificaciones_cuenta' then
      v_sets := v_sets || array['validada_por = $5', $s$observaciones = coalesce($4 ->> 'observaciones', $3, observaciones)$s$];
      if p_hacia = 'APROBADA' then
        v_sets := v_sets || ($s$seguidores_verificados = coalesce(($4 ->> 'seguidores_verificados')::integer, seguidores_verificados, seguidores_reportados)$s$)::text;
      end if;
    when 'ofertas' then
      -- E2d: también la devolución del sistema (fecha límite vencida en revisión) y el rechazo dejan su comentario.
      if p_hacia = 'DEVUELTA' or (v_desde = 'EN_REVISION' and p_hacia = 'CANCELADA')
         or (p_actor_tipo = 'ADMIN' and v_datos ? 'comentario_moderacion') then
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
      if p_hacia = 'PAGADA' then
        v_sets := v_sets || array[$s$fecha_pago = coalesce(($4 ->> 'fecha_pago')::date, fecha_pago)$s$,
                                  $s$referencia_pago = coalesce($4 ->> 'referencia_pago', referencia_pago)$s$,
                                  $s$soporte_pago_path = coalesce($4 ->> 'soporte_pago_path', soporte_pago_path)$s$];
      end if;
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
end $function$;

-- ANU-009: el envío dice qué paso del asistente falta (hint `envio_oferta:<que|quien|cuando|cuanto|creativo|envio>`).
create or replace function private.validar_envio_oferta(p_oferta_id uuid, p_publicar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.ofertas; c public.campanas; v_anunciante public.anunciante_estado; v_minimo integer;
  v_horas integer := private.config_entero('ofertas.anticipacion_minima_horas');
  v_formato public.formatos; cr public.creativos; v_archivos integer; v_videos integer; v_max integer;
  v_falla text; v_paso text;
begin
  update public.ofertas x
     set cupos_totales = (select coalesce(sum(oc.cupos_totales), 0) from public.oferta_cupos oc where oc.oferta_id = x.id)
   where x.id = p_oferta_id
  returning * into o;
  select * into c from public.campanas x where x.id = o.campana_id;
  select a.estado_verificacion into v_anunciante from public.anunciantes a where a.id = o.anunciante_id;
  select * into v_formato from public.formatos f where f.id = o.formato_id;
  select * into cr from public.creativos x where x.oferta_id = o.id and x.vigente;
  select count(*)::integer, (count(*) filter (where f.mime like 'video/%'))::integer into v_archivos, v_videos
  from public.creativo_archivos f where f.creativo_id = cr.id;
  v_minimo := private.config_entero('ofertas.minimo_medios');
  v_max := coalesce((v_formato.requisitos ->> 'max_archivos')::integer, 1);

  if o.deleted_at is not null then
    v_paso := 'envio'; v_falla := 'La oferta está archivada.';
  elsif v_anunciante is distinct from 'VERIFICADO' then
    v_paso := 'envio'; v_falla := 'La empresa debe estar verificada por AMO para enviar ofertas a revisión.';
  elsif c.estado <> 'ACTIVA' or c.deleted_at is not null then
    v_paso := 'envio'; v_falla := 'Activa la campaña antes de enviar la oferta.';
  elsif not coalesce(v_formato.activo, false) then
    v_paso := 'que'; v_falla := 'El formato ya no está disponible.';
  elsif exists (select 1 from unnest(o.departamentos_objetivo) x(codigo)
                where not exists (select 1 from public.departamentos d where d.codigo = x.codigo and d.activo))
     or exists (select 1 from unnest(o.municipios_objetivo) x(codigo)
                where not exists (select 1 from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                                  where m.codigo = x.codigo and m.activo and d.activo))
     or exists (select 1 from unnest(o.categorias_objetivo) x(id)
                where not exists (select 1 from public.categorias k where k.id = x.id and k.activo and k.deleted_at is null)) then
    v_paso := 'quien'; v_falla := 'La segmentación incluye zonas o categorías que no están habilitadas.';
  elsif o.ventana_inicio < private.inicio_dia(c.fecha_inicio) or o.ventana_fin > private.inicio_dia(c.fecha_fin + 1) then
    v_paso := 'cuando'; v_falla := 'La ventana de publicación debe quedar dentro de las fechas de la campaña.';
  elsif not p_publicar and o.fecha_limite_aceptacion < private.ahora() + make_interval(hours => v_horas) then
    v_paso := 'cuando';
    v_falla := case when v_horas = 0 then 'La fecha límite de aceptación ya pasó.'
                    else format('La fecha límite de aceptación debe quedar al menos %s horas después del envío.', v_horas) end;
  elsif p_publicar and private.ahora() >= o.fecha_limite_aceptacion then
    v_paso := 'cuando'; v_falla := 'La fecha límite de aceptación ya pasó: devuelve la oferta para que el anunciante la ajuste.';
  elsif not exists (select 1 from public.oferta_cupos oc where oc.oferta_id = o.id) or o.cupos_totales < v_minimo then
    v_paso := 'cuanto'; v_falla := format('Define al menos %s cupos.', v_minimo);
  elsif cr.id is null or v_archivos = 0 then
    v_paso := 'creativo'; v_falla := 'Carga el paquete creativo con al menos un archivo.';
  elsif v_archivos > v_max then
    v_paso := 'creativo'; v_falla := format('Este formato admite hasta %s archivos.', v_max);
  elsif not private.tipo_creativo_valido(cr.tipo, v_formato.clave, v_formato.requisitos) then
    v_paso := 'creativo'; v_falla := 'El tipo de creativo no corresponde al formato elegido.';
  elsif cr.tipo = 'CARRUSEL' and v_archivos < 2 then
    v_paso := 'creativo'; v_falla := 'Un carrusel necesita al menos 2 archivos.';
  elsif (cr.tipo = 'VIDEO' and v_videos < v_archivos) or (cr.tipo = 'IMAGEN' and v_videos > 0) then
    v_paso := 'creativo'; v_falla := 'Los archivos no corresponden al tipo de creativo.';
  end if;
  if v_falla is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = v_falla,
      hint = 'envio_oferta:' || v_paso;
  end if;
  if o.presupuesto_maximo > c.presupuesto_total - private.comprometido_en_ofertas(o.campana_id, o.id) then
    raise exception using errcode = 'P0001', message = 'AMO_PRESUPUESTO_CAMPANA',
      detail = 'El presupuesto de la oferta supera lo que queda disponible en la campaña.', hint = 'envio_oferta:cuanto';
  end if;
end $$;

-- La exclusividad se cobra con días (cero días no es exclusividad).
alter table public.ofertas drop constraint ofertas_exclusividad_chk;
alter table public.ofertas add constraint ofertas_exclusividad_chk
  check (exclusividad_dias is null or exclusividad_dias between 1 and 90);

-- ADM-003: un anunciante que deja de estar verificado (suspendido) no recibe aceptaciones nuevas; lo que ya está en
-- curso sigue su camino. `oferta_visible_para` y `reservar_cupo` usan esta función.
create or replace function private.medio_elegible(p_oferta_id uuid, p_medio_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.ofertas o
    join public.anunciantes an on an.id = o.anunciante_id
    join public.medios m on m.id = p_medio_id
    join public.municipios mu on mu.codigo = m.municipio_codigo
    join public.departamentos d on d.codigo = m.departamento_codigo
    where o.id = p_oferta_id
      and an.estado_verificacion = 'VERIFICADO' and an.deleted_at is null
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

create or replace function private.notificar_transicion()
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
      end if;
    when 'publicaciones' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion = 'RECHAZADA' then
        select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'evidencia.rechazada',
          jsonb_build_object('oferta_id', v_asig.oferta_id, 'motivo', coalesce(new.observaciones, v_motivo, 'sin observaciones')),
          'asignaciones', new.asignacion_id::text, null, 2::smallint);
      end if;
    when 'metricas' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion = 'RECHAZADA' then
        select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'metricas.rechazadas',
          jsonb_build_object('oferta_id', v_asig.oferta_id, 'corte', new.corte::text,
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

create or replace function private.condicion_sistema(p_entidad text, p_id uuid, p_hacia text)
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
                                   and a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA', 'RECHAZADA',
                                                        'VENCIDA_SIN_PUBLICAR', 'CANCELADA')))))
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

create or replace function private.actualizar_lote(p_familia text, p_limite integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    when 'ofertas_revision_vencida' then
      -- ADM-005: una oferta cuya fecha límite vence en la cola vuelve al anunciante para que la ajuste.
      for x in select o.id from public.ofertas o
               where o.deleted_at is null and o.estado = 'EN_REVISION' and o.fecha_limite_aceptacion <= v_ahora
               order by o.campana_id, o.id limit p_limite loop
        if private.cron_aplicar('ofertas', x.id, 'DEVUELTA',
             'La fecha límite de aceptación pasó mientras la oferta estaba en revisión: ajusta las fechas y envíala de nuevo.')
        then v_n := v_n + 1; end if;
      end loop;
    when 'ofertas_caducadas' then
      -- Borradores y devueltas que ya no pueden publicarse: se cancelan para que la campaña pueda finalizar.
      for x in select o.id from public.ofertas o join public.campanas c on c.id = o.campana_id
               where o.deleted_at is null and o.estado in ('BORRADOR', 'DEVUELTA')
                 and (o.ventana_fin <= v_ahora or c.fecha_fin < v_hoy)
               order by o.campana_id, o.id limit p_limite loop
        if private.cron_aplicar('ofertas', x.id, 'CANCELADA',
             'La ventana de publicación terminó sin que la oferta se enviara a revisión.')
        then v_n := v_n + 1; end if;
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
end $function$;

create or replace procedure private.actualizar_estados(IN p_max_lotes integer DEFAULT 20, IN p_confirmar boolean DEFAULT true)
 LANGUAGE plpgsql
AS $procedure$
declare v_familia text; v_lote integer; v_n integer;
begin
  foreach v_familia in array array['ofertas_en_ejecucion', 'ofertas_vencidas', 'ofertas_cerradas', 'ofertas_revision_vencida',
                                   'ofertas_caducadas', 'campanas_finalizadas',
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
end $procedure$;

-- ANU-005 / ANU-007: el estimador recibe las exclusiones y las publicaciones por medio y nunca deja conocer a un medio:
-- · con menos de `ofertas.estimador_n_minimo` medios en la franja no dice cuántos son ni da precio, inversión o alcance
--   («Sin estimación»);
-- · si las exclusiones quitan menos de ese mínimo, se estima sin ellas (comparar con y sin excluir a uno revelaría sus
--   cifras);
-- · el mínimo de seguidores se redondea hacia abajo a miles de 5.000 (una búsqueda fina revelaría los de un medio).
-- El alcance solo cuenta cuentas con historial suficiente (`calidad.minimo_publicaciones`).
drop function public.estimar_oferta(uuid, character[], character[], uuid[], integer, jsonb, smallint);
drop function private.estimar_oferta_agregado(uuid, character[], character[], uuid[], integer, jsonb, smallint);

create function private.estimar_oferta_agregado(
  p_formato_id uuid, p_departamentos char(2)[], p_municipios char(5)[], p_categorias uuid[], p_seguidores_minimos integer,
  p_cupos jsonb, p_exclusividad_dias smallint, p_medios_excluidos uuid[], p_publicaciones smallint)
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
  v_n_min integer := private.config_entero('ofertas.estimador_n_minimo');
  v_pubs integer := coalesce(p_publicaciones, 1);
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
  if v_pubs not between 1 and 10 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Las publicaciones por medio van de 1 a 10.';
  end if;
  v_me := case when coalesce(p_exclusividad_dias, 0) = 0 then 1 else private.config_decimal('precios.recargo_exclusividad') end;
  return query
  with pedidas as (
    select e.key::uuid as franja_id, greatest(e.value::integer, 0) as cupos from jsonb_each_text(p_cupos) e
  ), todas as (
    select c.medio_id, c.franja_id, c.alcance_mediano, c.multiplicador_calidad, c.publicaciones_verificadas_count,
           m.id = any (coalesce(p_medios_excluidos, '{}')) as excluido
    from public.cuentas_sociales c
    join public.medios m on m.id = c.medio_id
    join public.municipios mu on mu.codigo = m.municipio_codigo
    join public.departamentos d on d.codigo = m.departamento_codigo
    where c.plataforma = v_plataforma and c.deleted_at is null and private.cuenta_vigente(c.id)
      and c.seguidores_verificados >= greatest(v_umbral, floor(coalesce(p_seguidores_minimos, 0) / 5000.0) * 5000)
      and m.estado = 'VERIFICADO' and m.nivel_verificacion >= 1 and m.deleted_at is null and mu.activo and d.activo
      and (v_sin_geo or m.municipio_codigo = any (p_municipios) or m.departamento_codigo = any (p_departamentos))
      and (coalesce(cardinality(p_categorias), 0) = 0
           or exists (select 1 from public.medio_categorias mc where mc.medio_id = m.id and mc.categoria_id = any (p_categorias)))
  ), quitados as (
    select t.franja_id, count(distinct t.medio_id) filter (where t.excluido) as n from todas t group by t.franja_id
  ), cuentas as (
    -- Las exclusiones solo se aplican si quitan cero medios o al menos el mínimo de la franja.
    select t.* from todas t left join quitados q on q.franja_id = t.franja_id
    where not t.excluido or coalesce(q.n, 0) between 1 and v_n_min - 1
  ), precios as (
    select cu.medio_id, cu.franja_id,
           case when cu.publicaciones_verificadas_count >= v_min_pub then cu.alcance_mediano end as alcance,
           round(t.valor_base
                 * (case when cu.publicaciones_verificadas_count < v_min_pub then 1
                         else least(greatest(cu.multiplicador_calidad, v_piso), v_techo) end)
                 * (case when v_sin_geo then 1
                         else coalesce((select max(pg.multiplicador) from public.medio_pertinencia_geografica pg
                                        join public.municipios mm on mm.codigo = pg.municipio_codigo
                                        where pg.medio_id = cu.medio_id
                                          and (pg.municipio_codigo = any (p_municipios)
                                               or mm.departamento_codigo = any (p_departamentos))), 1) end)
                 * v_me * v_pubs / v_r) * v_r as precio
    from cuentas cu
    join public.tarifas t on t.formato_id = p_formato_id and t.franja_id = cu.franja_id
     and t.vigente_desde <= private.ahora() and (t.vigente_hasta is null or t.vigente_hasta > private.ahora())
  ), por_franja as (
    select pe.franja_id, pe.cupos, count(distinct pr.medio_id)::integer as medios,
           percentile_cont(0.5) within group (order by pr.precio) as precio,
           count(pr.alcance)::integer as con_alcance,
           percentile_cont(0.5) within group (order by pr.alcance) as alcance
    from pedidas pe left join precios pr on pr.franja_id = pe.franja_id
    group by pe.franja_id, pe.cupos
  )
  select f.franja_id,
         case when f.medios >= v_n_min then f.medios end,
         case when f.medios >= v_n_min then (round(f.precio / v_r) * v_r)::numeric end,
         case when f.medios >= v_n_min then (round(f.precio / v_r) * v_r * f.cupos)::numeric end,
         case when f.con_alcance >= v_n_min then f.alcance::bigint end
  from por_franja f
  order by f.franja_id;
end $$;
revoke all on function private.estimar_oferta_agregado(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint, uuid[], smallint)
  from public, anon;
grant execute on function private.estimar_oferta_agregado(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint, uuid[], smallint)
  to authenticated, service_role;

create function public.estimar_oferta(
  p_formato_id uuid, p_departamentos char(2)[], p_municipios char(5)[], p_categorias uuid[], p_seguidores_minimos integer,
  p_cupos jsonb, p_exclusividad_dias smallint default null, p_medios_excluidos uuid[] default '{}',
  p_publicaciones smallint default 1)
returns table (franja_id uuid, medios_elegibles integer, precio_mediano numeric, inversion_estimada numeric,
               alcance_mediano_estimado bigint)
language sql stable set search_path = '' as $$
  select * from private.estimar_oferta_agregado(p_formato_id, p_departamentos, p_municipios, p_categorias,
                                                p_seguidores_minimos, p_cupos, p_exclusividad_dias, p_medios_excluidos,
                                                p_publicaciones) $$;
revoke all on function public.estimar_oferta(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint, uuid[], smallint)
  from public, anon;
grant execute on function public.estimar_oferta(uuid, char(2)[], char(5)[], uuid[], integer, jsonb, smallint, uuid[], smallint)
  to authenticated;

-- ANU-005: medios para excluir de una oferta, por su nombre público (o los ya excluidos, por id). Sin cifras ni datos
-- personales: nombre y municipio.
create function public.medios_para_exclusion(p_texto text default null, p_ids uuid[] default null,
                                             p_limite integer default 20)
returns table (id uuid, nombre text, municipio text)
language plpgsql stable security definer set search_path = '' as $$
declare v_texto text := private.normalizar_texto(nullif(btrim(p_texto), ''));
begin
  if not private.acceso_valido()
     or not (private.tiene_permiso('ofertas.gestionar_propias') or private.tiene_permiso('ofertas.gestionar')) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_ids is not null then
    return query
    select m.id, m.nombre, mu.nombre from public.medios m left join public.municipios mu on mu.codigo = m.municipio_codigo
    where m.id = any (p_ids[1:2000]) and m.deleted_at is null
    order by m.nombre;
    return;
  end if;
  if v_texto is null or char_length(v_texto) < 3 then return; end if;
  return query
  select m.id, m.nombre, mu.nombre from public.medios m left join public.municipios mu on mu.codigo = m.municipio_codigo
  where m.estado = 'VERIFICADO' and m.deleted_at is null and strpos(m.nombre_normalizado, v_texto) > 0
  order by strpos(m.nombre_normalizado, v_texto), m.nombre
  limit least(greatest(coalesce(p_limite, 20), 1), 50);
end $$;
revoke all on function public.medios_para_exclusion(text, uuid[], integer) from public, anon;
grant execute on function public.medios_para_exclusion(text, uuid[], integer) to authenticated;

-- 6. Creativos -----------------------------------------------------------------------------------------------------

-- ANU-010: `activado_at` null = versión nueva de una oferta publicada aún sin activar (una a la vez por oferta).
-- Carrusel solo en el formato carrusel (y viceversa); en formatos solo de video, el creativo es un video.
create function private.tipo_creativo_valido(p_tipo public.creativo_tipo, p_clave text, p_requisitos jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select (p_clave = 'CARRUSEL') = (p_tipo = 'CARRUSEL')
     and (p_tipo = 'VIDEO'
          or exists (select 1 from jsonb_array_elements_text(coalesce(p_requisitos -> 'mime', '[]')) m where m like 'image/%')) $$;
revoke all on function private.tipo_creativo_valido(public.creativo_tipo, text, jsonb) from public, anon, authenticated;

alter table public.creativos add column activado_at timestamptz;
update public.creativos set activado_at = created_at;
create unique index creativos_pendiente_key on public.creativos (oferta_id) where activado_at is null;

create or replace function private.fn_creativos_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_anterior uuid; v_estado public.oferta_estado; v_clave text; v_req jsonb;
begin
  if private.modo_carga() then
    new.activado_at := coalesce(new.activado_at, new.created_at);
    return new;
  end if;
  select o.estado into v_estado from public.ofertas o where o.id = new.oferta_id for no key update;
  if v_estado in ('EN_REVISION', 'VENCIDA', 'CERRADA', 'CANCELADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = case when v_estado = 'EN_REVISION' then 'Retira la oferta de revisión para cambiar el creativo.'
                    else 'La oferta ya no admite creativos nuevos.' end;
  end if;
  select f.clave, f.requisitos into v_clave, v_req
  from public.ofertas o join public.formatos f on f.id = o.formato_id where o.id = new.oferta_id;
  if not private.tipo_creativo_valido(new.tipo, v_clave, v_req) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El tipo de creativo no corresponde al formato elegido.';
  end if;
  select c.id into v_anterior from public.creativos c where c.oferta_id = new.oferta_id and c.vigente;
  new.version := coalesce((select max(c.version) from public.creativos c where c.oferta_id = new.oferta_id), 0) + 1;
  new.reemplaza_a := v_anterior;
  new.creado_por := private.actor_id();
  if v_estado in ('BORRADOR', 'DEVUELTA') then
    -- Sin publicar nadie la ha descargado: la versión nueva reemplaza de inmediato a la anterior.
    new.vigente := true;
    new.activado_at := private.ahora();
    if v_anterior is not null then
      update public.creativos c set vigente = false where c.id = v_anterior;
    end if;
  else
    -- Publicada: queda pendiente hasta tener sus archivos; `activar_creativo_srv` la pone vigente y avisa a los medios.
    new.vigente := false;
    new.activado_at := null;
  end if;
  return new;
end $$;

create or replace function private.fn_creativos_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['oferta_id', 'tipo', 'version', 'reemplaza_a', 'vigente',
       'activado_at', 'creado_por', 'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Para cambiar el creativo publica una versión nueva.';
  end if;
  return new;
end $$;

drop policy "creativos: insert propio o interno" on public.creativos;
create policy "creativos: insert propio o interno" on public.creativos for insert to authenticated
  with check ((select private.tiene_permiso('ofertas.gestionar'))
              or ((select private.tiene_permiso('ofertas.gestionar_propias'))
                  and exists (select 1 from public.ofertas o
                              where o.id = creativos.oferta_id and o.anunciante_id = (select private.mi_anunciante_id())
                                and o.deleted_at is null
                                and o.estado not in ('EN_REVISION', 'CANCELADA', 'CERRADA', 'VENCIDA'))));

-- Se edita la vigente de una oferta sin publicar o la versión pendiente de una publicada; nunca la que ya ven los medios.
drop policy "creativos: update propio o interno" on public.creativos;
create policy "creativos: update propio o interno" on public.creativos for update to authenticated
  using (exists (select 1 from public.ofertas o
                 where o.id = creativos.oferta_id and o.deleted_at is null
                   and ((creativos.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
                        or (creativos.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))
                   and ((select private.tiene_permiso('ofertas.gestionar'))
                        or (o.anunciante_id = (select private.mi_anunciante_id())
                            and (select private.tiene_permiso('ofertas.gestionar_propias'))))))
  with check (exists (select 1 from public.ofertas o
                      where o.id = creativos.oferta_id and o.deleted_at is null
                        and ((creativos.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
                             or (creativos.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))
                        and ((select private.tiene_permiso('ofertas.gestionar'))
                             or (o.anunciante_id = (select private.mi_anunciante_id())
                                 and (select private.tiene_permiso('ofertas.gestionar_propias'))))));

-- El medio con una asignación activa ve las versiones activadas, no la que el anunciante prepara.
drop policy "creativos: select" on public.creativos;
create policy "creativos: select" on public.creativos for select to authenticated
  using ((select private.tiene_permiso('ofertas.ver'))
         or exists (select 1 from public.ofertas o
                    where o.id = creativos.oferta_id and o.anunciante_id = (select private.mi_anunciante_id()))
         or (activado_at is not null and private.tengo_asignacion_activa_en(oferta_id)));

drop policy "creativo_archivos: insert propio o interno" on public.creativo_archivos;
create policy "creativo_archivos: insert propio o interno" on public.creativo_archivos for insert to authenticated
  with check (exists (select 1 from public.creativos c join public.ofertas o on o.id = c.oferta_id
                      where c.id = creativo_archivos.creativo_id and o.deleted_at is null
                        and ((c.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
                             or (c.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))
                        and ((select private.tiene_permiso('ofertas.gestionar'))
                             or (o.anunciante_id = (select private.mi_anunciante_id())
                                 and (select private.tiene_permiso('ofertas.gestionar_propias'))))));

drop policy "creativo_archivos: delete en borrador" on public.creativo_archivos;
create policy "creativo_archivos: delete en borrador" on public.creativo_archivos for delete to authenticated
  using (exists (select 1 from public.creativos c join public.ofertas o on o.id = c.oferta_id
                 where c.id = creativo_archivos.creativo_id
                   and ((c.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
                        or (c.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))
                   and ((select private.tiene_permiso('ofertas.gestionar'))
                        or (o.anunciante_id = (select private.mi_anunciante_id())
                            and (select private.tiene_permiso('ofertas.gestionar_propias'))))));

-- La confirmación es idempotente por ruta; el orden se cambia con UPDATE (antes: borrar y reinsertar).
create unique index creativo_archivos_archivo_path_key on public.creativo_archivos (archivo_path);
grant update (orden) on public.creativo_archivos to authenticated;
create policy "creativo_archivos: update orden" on public.creativo_archivos for update to authenticated
  using (exists (select 1 from public.creativos c join public.ofertas o on o.id = c.oferta_id
                 where c.id = creativo_archivos.creativo_id
                   and ((c.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
                        or (c.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))
                   and ((select private.tiene_permiso('ofertas.gestionar'))
                        or (o.anunciante_id = (select private.mi_anunciante_id())
                            and (select private.tiene_permiso('ofertas.gestionar_propias'))))))
  with check (exists (select 1 from public.creativos c join public.ofertas o on o.id = c.oferta_id
                      where c.id = creativo_archivos.creativo_id
                        and ((c.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
                             or (c.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))
                        and ((select private.tiene_permiso('ofertas.gestionar'))
                             or (o.anunciante_id = (select private.mi_anunciante_id())
                                 and (select private.tiene_permiso('ofertas.gestionar_propias'))))));

-- Descartar una versión en preparación (nadie la ha visto: no está activada).
grant delete on public.creativos to authenticated;
create policy "creativos: delete pendiente" on public.creativos for delete to authenticated
  using (activado_at is null
         and exists (select 1 from public.ofertas o
                     where o.id = creativos.oferta_id and o.deleted_at is null
                       and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')
                       and ((select private.tiene_permiso('ofertas.gestionar'))
                            or (o.anunciante_id = (select private.mi_anunciante_id())
                                and (select private.tiene_permiso('ofertas.gestionar_propias'))))));

create or replace function private.puedo_subir_creativo(p_oferta_id uuid, p_creativo_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ofertas o
    join public.creativos c on c.oferta_id = o.id and c.id = p_creativo_id
    where o.id = p_oferta_id and o.deleted_at is null
      and ((o.anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('ofertas.gestionar_propias')))
           or (select private.tiene_permiso('ofertas.gestionar')))
      and ((c.vigente and o.estado in ('BORRADOR', 'DEVUELTA'))
           or (c.activado_at is null and o.estado in ('PUBLICADA', 'CUPOS_COMPLETOS', 'EN_EJECUCION')))) $$;

-- El medio descarga archivos de versiones activadas, nunca de la que el anunciante prepara.
create function private.creativo_activado(p_creativo_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.creativos c where c.id = p_creativo_id and c.activado_at is not null) $$;
revoke all on function private.creativo_activado(uuid) from public, anon;
grant execute on function private.creativo_activado(uuid) to authenticated;

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
               'creativo_activado', 'validar_campana_guardar']::text[] $$;

drop policy "storage: creativos select" on storage.objects;
create policy "storage: creativos select" on storage.objects for select to authenticated
  using (bucket_id = 'creativos' and private.seg(name, 1) = 'oferta'
         and (private.es_mi_oferta(private.seg_uuid(name, 2))
              or (select private.tiene_permiso('ofertas.ver'))
              or (private.puedo_descargar_creativos_de(private.seg_uuid(name, 2))
                  and private.creativo_activado(private.seg_uuid(name, 3)))));

-- «9:16» → 0,5625; «1.91:1» → 1,91.
create function private.relacion_aspecto(p_texto text) returns numeric
language sql immutable set search_path = '' as $$
  select split_part(p_texto, ':', 1)::numeric / nullif(split_part(p_texto, ':', 2)::numeric, 0) $$;
revoke all on function private.relacion_aspecto(text) from public, anon, authenticated;

-- ANU-008: cada archivo cumple los requisitos de su formato (`formatos.requisitos`), trae su huella SHA-256 (el
-- original se guarda sin recomprimir) y ya está en Storage con el tamaño declarado.
create or replace function private.fn_creativo_archivos_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_oferta uuid; v_tipo public.creativo_tipo; v_req jsonb;
  v_max_mb numeric; v_relaciones text[]; v_tol numeric; v_es_video boolean; v_max integer;
begin
  if private.modo_carga() then return new; end if;
  select c.oferta_id, c.tipo, f.requisitos into v_oferta, v_tipo, v_req
  from public.creativos c join public.ofertas o on o.id = c.oferta_id join public.formatos f on f.id = o.formato_id
  where c.id = new.creativo_id;
  if v_oferta is null or position('..' in new.archivo_path) > 0
     or new.archivo_path not like 'oferta/' || v_oferta::text || '/' || new.creativo_id::text || '/%' then
    raise exception using errcode = 'check_violation', constraint = 'creativo_archivos_archivo_path_chk',
      message = 'creativo_archivos_archivo_path_chk', detail = 'La ruta del archivo no corresponde al creativo.';
  end if;
  if new.sha256 is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Falta la huella SHA-256 del archivo.';
  end if;
  if not (new.mime = any (array(select jsonb_array_elements_text(coalesce(v_req -> 'mime', '[]'))))) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Este formato no admite ese tipo de archivo.';
  end if;
  v_max_mb := least(coalesce((v_req ->> 'peso_max_mb')::numeric, 50), private.config_entero('archivos.max_creativo_mb'));
  if new.tamano_bytes > v_max_mb * 1048576 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = format('El archivo supera el tamaño máximo de %s MB.', v_max_mb);
  end if;
  v_es_video := new.mime like 'video/%';
  if (v_tipo = 'IMAGEN' and v_es_video) or (v_tipo = 'VIDEO' and not v_es_video) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El archivo no corresponde al tipo de creativo.';
  end if;
  if new.ancho is null or new.alto is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Faltan las dimensiones del archivo.';
  end if;
  v_relaciones := array(select jsonb_array_elements_text(coalesce(v_req -> 'relaciones_aspecto', '[]')));
  v_tol := private.config_decimal('archivos.tolerancia_aspecto');
  if cardinality(v_relaciones) > 0
     and not exists (select 1 from unnest(v_relaciones) r
                     where abs((new.ancho::numeric / new.alto) / private.relacion_aspecto(r) - 1) <= v_tol) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La relación de aspecto debe ser ' || array_to_string(v_relaciones, ', ') || '.';
  end if;
  if v_es_video then
    if new.duracion_segundos is null then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Falta la duración del video.';
    end if;
    if v_req ? 'duracion_max_s' and new.duracion_segundos > (v_req ->> 'duracion_max_s')::numeric then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = format('El video puede durar hasta %s segundos.', v_req ->> 'duracion_max_s');
    end if;
  end if;
  v_max := coalesce((v_req ->> 'max_archivos')::integer, 1);
  if (select count(*) from public.creativo_archivos f where f.creativo_id = new.creativo_id) >= v_max then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = format('Este formato admite hasta %s archivos.', v_max);
  end if;
  if not exists (select 1 from storage.objects s
                 where s.bucket_id = 'creativos' and s.name = new.archivo_path
                   and (s.metadata ->> 'size')::bigint = new.tamano_bytes) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El archivo no está en el almacenamiento o su tamaño no coincide: vuelve a cargarlo.';
  end if;
  new.created_at := private.ahora();
  return new;
end $$;

-- ANU-010: activa la versión pendiente de una oferta publicada (con sus archivos), deja la anterior sin vigencia y
-- avisa a los medios con asignaciones que consumen cupo.
create function public.activar_creativo_srv(p_creativo_id uuid, p_actor_id uuid, p_session_id uuid) returns jsonb
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
      where a.oferta_id = o.id and private.consume_cupo(a.estado, a.estado_previo_disputa)),
    'creativo.actualizado', jsonb_build_object('oferta_id', o.id, 'version', cr.version),
    'ofertas', o.id::text, null, 1::smallint);
  return jsonb_build_object('creativo_id', cr.id, 'version', cr.version, 'reemplaza_a', v_anterior);
end $$;
revoke all on function public.activar_creativo_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.activar_creativo_srv(uuid, uuid, uuid) to service_role;
