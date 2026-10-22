-- E2 · Notificaciones por eventos del negocio (RF-NOT-003; docs/modelo-datos.md §3.7, §5.8).
--
-- Completa lo que la migración 8 dejó fuera:
-- · Medio y anunciante: verificado, rechazado, suspendido, reactivado, cambio de nivel; documentos aprobados,
--   rechazados o vencidos; aviso al 80 % del tope anual del nivel (MED-007, una vez por año y nivel).
-- · Oferta rechazada en moderación o vencida sin aceptaciones; asignación aceptada (al anunciante, con el nombre
--   público del medio y sin datos personales), publicada y verificada; liquidación aprobada o anulada; factura
--   emitida o vencida; campaña finalizada; mensaje nuevo en una disputa (las notas internas no avisan a las partes).
-- · Avisos a las colas internas (`private.notificar_cola`: a quien tenga el permiso, uno por entidad cada 12 h):
--   documentos y cuentas por verificar, oferta por moderar, evidencia y métricas por validar, disputa nueva.
-- Las notificaciones se guardan con `url = null`; la app resuelve el destino por (entidad, entidad_id) y rol.

-- 1. Nombres legibles de los documentos ---------------------------------------------------------------------------

create function private.nombre_documento(p_tipo text) returns text
language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'CEDULA_FRENTE' then 'Cédula (frente)' when 'CEDULA_REVERSO' then 'Cédula (reverso)'
    when 'PRUEBA_VIDA' then 'Prueba de vida' when 'RUT' then 'RUT' when 'RUT_SOCIEDAD' then 'RUT de la sociedad'
    when 'CAMARA_COMERCIO' then 'Cámara de Comercio' when 'CERT_BANCARIA' then 'Certificado bancario'
    when 'CERT_BILLETERA' then 'Certificado de billetera digital' when 'SEG_SOCIAL' then 'Seguridad social'
    when 'OTRO' then 'Otro documento' else p_tipo end $$;
revoke all on function private.nombre_documento(text) from public, anon, authenticated;

-- 2. Plantillas (editables en Configuración → Plantillas) ---------------------------------------------------------

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('medio.verificado', 'APP', 'Tu medio fue verificado', null,
   '¡Listo! **{{medio}}** quedó verificado en el nivel {{nivel}}. Ya puedes ver y aceptar ofertas.', array['medio', 'nivel']),
  ('medio.rechazado', 'APP', 'Verificación del medio rechazada', null,
   'La verificación de **{{medio}}** fue rechazada: {{motivo}}. Corrige lo indicado y vuelve a enviarla.', array['medio', 'motivo']),
  ('medio.suspendido', 'APP', 'Medio suspendido', null,
   '**{{medio}}** fue suspendido: {{motivo}}. Mientras tanto no verás ofertas nuevas.', array['medio', 'motivo']),
  ('medio.reactivado', 'APP', 'Medio reactivado', null,
   '**{{medio}}** volvió a estar activo. Ya puedes ver y aceptar ofertas.', array['medio']),
  ('medio.nivel_cambiado', 'APP', 'Cambió tu nivel de verificación', null,
   '**{{medio}}** pasó al nivel {{nivel}}. Tu tope anual ahora es {{tope}}.', array['medio', 'nivel', 'tope']),
  ('medio.cerca_tope', 'APP', 'Estás cerca del tope de tu nivel', null,
   'Este año llevas {{consumido}} de {{tope}} ({{porcentaje}}). Sube de nivel para seguir aceptando ofertas sin bloqueos.',
   array['consumido', 'tope', 'porcentaje']),
  ('documento.aprobado', 'APP', 'Documento aprobado', null,
   'Aprobamos tu documento «{{documento}}».', array['documento']),
  ('documento.rechazado', 'APP', 'Documento rechazado', null,
   'Tu documento «{{documento}}» fue rechazado: {{motivo}}. Carga uno nuevo.', array['documento', 'motivo']),
  ('documento.vencido', 'APP', 'Documento vencido', null,
   'Tu documento «{{documento}}» venció el {{fecha}}. Carga uno vigente para conservar tu verificación.', array['documento', 'fecha']),
  ('anunciante.verificado', 'APP', 'Tu empresa fue verificada', null,
   '**{{anunciante}}** quedó verificada. Ya puedes activar campañas y enviar ofertas a revisión.', array['anunciante']),
  ('anunciante.rechazado', 'APP', 'Verificación de la empresa rechazada', null,
   'La verificación de **{{anunciante}}** fue rechazada: {{motivo}}. Corrige lo indicado y vuelve a enviarla.',
   array['anunciante', 'motivo']),
  ('anunciante.suspendido', 'APP', 'Empresa suspendida', null,
   '**{{anunciante}}** fue suspendida: {{motivo}}. Contacta al equipo de AMO.', array['anunciante', 'motivo']),
  ('anunciante.reactivado', 'APP', 'Empresa reactivada', null,
   '**{{anunciante}}** volvió a estar activa.', array['anunciante']),
  ('oferta.rechazada', 'APP', 'Oferta rechazada', null,
   'Tu oferta «{{oferta}}» fue rechazada en la revisión: {{motivo}}', array['oferta', 'motivo']),
  ('oferta.vencida', 'APP', 'Oferta vencida', null,
   'Tu oferta «{{oferta}}» llegó a su fecha límite sin medios que la aceptaran.', array['oferta']),
  ('asignacion.aceptada', 'APP', 'Un medio aceptó tu oferta', null,
   '**{{medio}}** aceptó «{{oferta}}» en {{plataforma}}.', array['medio', 'oferta', 'plataforma']),
  ('asignacion.publicada', 'APP', 'Publicación cargada', null,
   '**{{medio}}** publicó el contenido de «{{oferta}}». Puedes ver la evidencia en el seguimiento de la campaña.',
   array['medio', 'oferta']),
  ('asignacion.verificada', 'APP', 'Publicación verificada', null,
   'Verificamos tu publicación de «{{oferta}}». Entrará en tu próxima liquidación.', array['oferta']),
  ('liquidacion.aprobada', 'APP', 'Liquidación aprobada', null,
   'Aprobamos tu liquidación del {{periodo}} por {{monto_neto}}. Te avisaremos cuando la paguemos.', array['periodo', 'monto_neto']),
  ('liquidacion.anulada', 'APP', 'Liquidación anulada', null,
   'La liquidación del {{periodo}} fue anulada: {{motivo}}. Sus publicaciones volverán a liquidarse.', array['periodo', 'motivo']),
  ('factura.emitida', 'APP', 'Nueva factura', null,
   'Emitimos la factura {{numero}} por {{total}}, con vencimiento el {{vencimiento}}.', array['numero', 'total', 'vencimiento']),
  ('factura.vencida', 'APP', 'Factura vencida', null,
   'La factura {{numero}} está vencida con un saldo de {{saldo}}.', array['numero', 'saldo']),
  ('campana.finalizada', 'APP', 'Campaña finalizada', null,
   'La campaña «{{campana}}» terminó: todas sus ofertas están cerradas. Revisa sus resultados.', array['campana']),
  ('disputa.mensaje', 'APP', 'Nuevo mensaje en una disputa', null,
   'Hay un mensaje nuevo en la disputa sobre «{{oferta}}».', array['oferta']),
  ('cola.vinculacion', 'APP', 'Nueva solicitud de vinculación', null,
   '**{{medio}}** ({{municipio}}) pidió unirse a AMO.', array['medio', 'municipio']),
  ('cola.datos_pago_cambiados', 'APP', 'Datos de pago actualizados', null,
   '**{{medio}}** cambió sus datos de pago. Revisa el certificado antes del próximo pago.', array['medio']),
  ('cola.medio_verificacion', 'APP', 'Medio listo para verificar', null,
   '**{{medio}}** completó su perfil y lo envió a verificación.', array['medio']),
  ('cola.medio_documentos', 'APP', 'Documentos por revisar', null,
   '**{{medio}}** cargó documentos para su verificación.', array['medio']),
  ('cola.cuenta_verificacion', 'APP', 'Cuenta por verificar', null,
   '**{{medio}}** pidió verificar su cuenta de {{plataforma}} ({{handle}}).', array['medio', 'plataforma', 'handle']),
  ('cola.anunciante_documentos', 'APP', 'Documentos de empresa por revisar', null,
   '**{{anunciante}}** cargó documentos para su verificación.', array['anunciante']),
  ('cola.oferta_revision', 'APP', 'Oferta por moderar', null,
   '**{{anunciante}}** envió «{{oferta}}» a revisión.', array['anunciante', 'oferta']),
  ('cola.evidencia', 'APP', 'Evidencia por validar', null,
   '**{{medio}}** cargó la evidencia de «{{oferta}}».', array['medio', 'oferta']),
  ('cola.metricas', 'APP', 'Métricas por validar', null,
   '**{{medio}}** cargó las métricas del corte {{corte}} de «{{oferta}}».', array['medio', 'corte', 'oferta']),
  ('cola.disputa', 'APP', 'Nueva disputa', null,
   'Se abrió una disputa sobre «{{oferta}}» por {{motivo}}.', array['oferta', 'motivo'])
on conflict (clave, canal) do nothing;

-- 3. Transiciones que notifican (redefine la función de la migración 8; misma firma) -------------------------------
create or replace function private.notificar_transicion() returns trigger
language plpgsql security definer set search_path = '' as $$
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
          jsonb_build_object('oferta', new.titulo, 'motivo', coalesce(new.comentario_moderacion, v_motivo, 'sin observaciones')),
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
      elsif old.estado = 'EN_REVISION' and new.estado = 'CANCELADA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.rechazada',
          jsonb_build_object('oferta', new.titulo, 'motivo', coalesce(new.comentario_moderacion, v_motivo, 'sin observaciones')),
          'ofertas', new.id::text, null, 1::smallint);
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
end $$;
revoke all on function private.notificar_transicion() from public, anon, authenticated, service_role;

create trigger trg_medios_z_notificar after update of estado, nivel_verificacion on public.medios
  for each row when (old.estado is distinct from new.estado or old.nivel_verificacion is distinct from new.nivel_verificacion)
  execute function private.notificar_transicion();
create trigger trg_anunciantes_z_notificar after update of estado_verificacion on public.anunciantes
  for each row when (old.estado_verificacion is distinct from new.estado_verificacion)
  execute function private.notificar_transicion();
create trigger trg_documentos_medio_z_notificar after update of estado_validacion on public.documentos_medio
  for each row when (old.estado_validacion is distinct from new.estado_validacion)
  execute function private.notificar_transicion();
create trigger trg_documentos_anunciante_z_notificar after update of estado_validacion on public.documentos_anunciante
  for each row when (old.estado_validacion is distinct from new.estado_validacion)
  execute function private.notificar_transicion();
create trigger trg_campanas_z_notificar after update of estado on public.campanas
  for each row when (old.estado is distinct from new.estado) execute function private.notificar_transicion();
create trigger trg_facturas_z_notificar after update of estado on public.facturas
  for each row when (old.estado is distinct from new.estado) execute function private.notificar_transicion();

-- 4. Avisos a las colas internas cuando llega trabajo nuevo ---------------------------------------------------------

create function private.fn_avisar_cola() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_medio text; v_oferta text; v_cuenta record; v_asig public.asignaciones;
begin
  if private.modo_carga() then return null; end if;
  case tg_table_name
    when 'documentos_medio' then
      if new.metodo = 'ARCHIVO' then
        select m.nombre into v_medio from public.medios m where m.id = new.medio_id;
        perform private.notificar_cola('medios.verificar', 'cola.medio_documentos', jsonb_build_object('medio', v_medio),
                                       'medios', new.medio_id::text);
      end if;
    when 'documentos_anunciante' then
      perform private.notificar_cola('anunciantes.verificar', 'cola.anunciante_documentos',
        jsonb_build_object('anunciante', (select a.nombre_comercial from public.anunciantes a where a.id = new.anunciante_id)),
        'anunciantes', new.anunciante_id::text);
    when 'verificaciones_cuenta' then
      select c.plataforma, c.handle::text as handle, m.nombre into v_cuenta
      from public.cuentas_sociales c join public.medios m on m.id = c.medio_id where c.id = new.cuenta_social_id;
      perform private.notificar_cola('medios.verificar', 'cola.cuenta_verificacion',
        jsonb_build_object('medio', v_cuenta.nombre, 'plataforma', private.nombre_plataforma(v_cuenta.plataforma),
                           'handle', v_cuenta.handle),
        'cuentas_sociales', new.cuenta_social_id::text);
    when 'publicaciones', 'metricas' then
      if tg_op = 'UPDATE' and not (old.estado_validacion = 'RECHAZADA' and new.estado_validacion = 'PENDIENTE') then
        return null;
      end if;
      select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
      select m.nombre into v_medio from public.medios m where m.id = new.medio_id;
      select o.titulo into v_oferta from public.ofertas o where o.id = v_asig.oferta_id;
      if tg_table_name = 'publicaciones' then
        perform private.notificar_cola('evidencias.validar', 'cola.evidencia',
          jsonb_build_object('medio', v_medio, 'oferta', v_oferta), 'asignaciones', new.asignacion_id::text);
      else
        perform private.notificar_cola('metricas.validar', 'cola.metricas',
          jsonb_build_object('medio', v_medio, 'oferta', v_oferta, 'corte', (to_jsonb(new) ->> 'corte')),
          'asignaciones', new.asignacion_id::text);
      end if;
    when 'disputas' then
      select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
      select o.titulo into v_oferta from public.ofertas o where o.id = v_asig.oferta_id;
      perform private.notificar_cola('disputas.resolver', 'cola.disputa',
        jsonb_build_object('oferta', v_oferta,
                           'motivo', case new.motivo when 'INCUMPLIMIENTO' then 'incumplimiento' when 'METRICAS' then 'métricas'
                                       when 'CONTENIDO' then 'contenido' when 'PERMANENCIA' then 'permanencia'
                                       when 'PAGO' then 'pago' else 'otro motivo' end),
        'disputas', new.id::text, 2::smallint);
    else
      null;
  end case;
  return null;
end $$;
revoke all on function private.fn_avisar_cola() from public, anon, authenticated, service_role;

create trigger trg_documentos_medio_z_avisar_cola after insert on public.documentos_medio
  for each row execute function private.fn_avisar_cola();
create trigger trg_documentos_anunciante_z_avisar_cola after insert on public.documentos_anunciante
  for each row execute function private.fn_avisar_cola();
-- La cola de cuentas se avisa cuando hay captura que revisar, no al generar el código de la historia.
create trigger trg_verificaciones_cuenta_z_avisar_cola after insert on public.verificaciones_cuenta
  for each row when (new.captura_path is not null and new.estado_validacion = 'PENDIENTE')
  execute function private.fn_avisar_cola();
create trigger trg_verificaciones_cuenta_z_avisar_cola_captura after update of captura_path on public.verificaciones_cuenta
  for each row when (old.captura_path is null and new.captura_path is not null and new.estado_validacion = 'PENDIENTE')
  execute function private.fn_avisar_cola();
create trigger trg_publicaciones_z_avisar_cola after insert or update of estado_validacion on public.publicaciones
  for each row execute function private.fn_avisar_cola();
create trigger trg_metricas_z_avisar_cola after insert or update of estado_validacion on public.metricas
  for each row execute function private.fn_avisar_cola();
create trigger trg_disputas_z_avisar_cola after insert on public.disputas
  for each row execute function private.fn_avisar_cola();

-- 5. Aceptación de una oferta: aviso al anunciante y alerta del 80 % del tope anual (MED-007) -----------------------
-- asignacion_montos nace en la misma transacción de reservar_cupo_srv, con el precio congelado.

create function private.fn_asignacion_montos_avisar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_asig public.asignaciones;
  v_medio public.medios;
  n public.niveles_verificacion;
  v_anual numeric;
  v_destinos uuid[];
  v_ini_anio timestamptz := private.inicio_dia(make_date(extract(year from private.hoy())::integer, 1, 1));
  v_desde timestamptz;
begin
  if private.modo_carga() then return null; end if;
  select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
  select * into v_medio from public.medios m where m.id = new.medio_id;
  perform private.notificar(private.usuarios_anunciante(v_asig.anunciante_id), 'asignacion.aceptada',
    jsonb_build_object('oferta_id', v_asig.oferta_id, 'medio', v_medio.nombre,
                       'plataforma', (select private.nombre_plataforma(o.plataforma) from public.ofertas o where o.id = v_asig.oferta_id)),
    'asignaciones', v_asig.id::text, null, 1::smallint);

  select * into n from public.niveles_verificacion nv where nv.nivel = v_medio.nivel_verificacion;
  if n.tope_anual is null then return null; end if;
  select coalesce(sum(am.monto_medio), 0) into v_anual
  from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
  where a.medio_id = new.medio_id and a.aceptada_at >= v_ini_anio and private.consume_cupo(a.estado, a.estado_previo_disputa);
  if v_anual < n.porcentaje_alerta * n.tope_anual then return null; end if;
  v_destinos := private.usuarios_medio(new.medio_id);
  -- Una vez por año calendario y nivel: la ventana empieza en el último cambio de nivel (bitácora), no en el texto
  -- del aviso, que sale de una plantilla editable.
  v_desde := greatest(v_ini_anio, coalesce(
    (select max(b.created_at) from public.bitacora b
     where b.entidad = 'medios' and b.entidad_id = new.medio_id::text and b.cambios ? 'nivel_verificacion'),
    v_ini_anio));
  if exists (select 1 from public.notificaciones x
             where x.tipo = 'medio.cerca_tope' and x.entidad_id = new.medio_id::text and x.usuario_id = any (v_destinos)
               and x.created_at >= v_desde) then
    return null;
  end if;
  perform private.notificar(v_destinos, 'medio.cerca_tope',
    jsonb_build_object('consumido', private.formato_cop(v_anual), 'tope', private.formato_cop(n.tope_anual),
                       'porcentaje', round(100 * v_anual / n.tope_anual)::text || ' %'),
    'medios', new.medio_id::text, null, 2::smallint);
  return null;
end $$;
revoke all on function private.fn_asignacion_montos_avisar() from public, anon, authenticated, service_role;

create trigger trg_asignacion_montos_z_avisar after insert on public.asignacion_montos
  for each row execute function private.fn_asignacion_montos_avisar();

-- 6. Mensajes de disputa: a las partes (salvo al autor); las notas internas no avisan a nadie externo ----------------

create function private.fn_disputa_mensajes_avisar() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  return null;
end $$;
revoke all on function private.fn_disputa_mensajes_avisar() from public, anon, authenticated, service_role;

create trigger trg_disputa_mensajes_z_avisar after insert on public.disputa_mensajes
  for each row execute function private.fn_disputa_mensajes_avisar();

-- 7. Verificación --------------------------------------------------------------------------------------------------
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert (select count(*) from public.plantillas_notificacion where canal = 'APP') >= 53,
         'faltan plantillas APP';
  assert private.nombre_documento('CERT_BANCARIA') = 'Certificado bancario', 'nombre de documento';
end $$;
