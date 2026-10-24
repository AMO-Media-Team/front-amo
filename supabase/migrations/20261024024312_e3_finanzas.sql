-- Migración E3b · e3_finanzas (docs/modelo-datos.md §3.13)
-- Fase 5 de las Entregas 2 y 3: liquidaciones a medios (LIQ-001…003, LIQ-007), documento soporte con CUDS y nota de
-- ajuste (LIQ-004), archivo de dispersión y pago (LIQ-005, LIQ-006), facturas al anunciante expedidas en el software
-- de AMO, notas crédito y cartera (LIQ-008), ganancias del medio (MED-015) y facturas del anunciante (ANU-013).
--   1. Configuración, plantillas y Storage
--   2. Documento soporte: protección, CUDS, archivos, nota de ajuste, numeración del proveedor
--   3. Liquidaciones: periodo cerrado, seguridad social al aprobar, corte por periodicidad, pendientes
--   4. Dispersión en dos pasos y pago con soporte cargado; factura del medio que factura
--   5. Lo que ve el medio: solo por RPC, con la visibilidad de la comisión
--   6. Facturas al anunciante: borrador desde las asignaciones, factura expedida, notas crédito, pagos con retenciones
--   7. Reportes de cartera y finanzas con notas crédito y retenciones
--   8. Transiciones, purga demo y lista blanca

-- 1. Configuración, plantillas y Storage --------------------------------------------------------------------------

insert into public.configuracion (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica,
                                  pendiente_validacion) values
  ('facturacion.esquema', '"COMPRA_REVENTA"', 'TEXTO', null, null, array['COMPRA_REVENTA', 'MANDATO'], 'facturacion',
   'Base del IVA de la factura al anunciante: COMPRA_REVENTA (IVA sobre el total: AMO compra y revende la pauta) o MANDATO (IVA solo sobre la comisión; el valor del medio va como ingreso para terceros). Lo define el contador.',
   null, false, true),
  ('tributario.numeracion_documento_soporte', '"PLATAFORMA"', 'TEXTO', null, null, array['PLATAFORMA', 'PROVEEDOR'],
   'tributario',
   'Quién numera los documentos soporte: la plataforma, con la resolución registrada aquí, o el proveedor tecnológico (la plataforma registra el número que asignó). Un rango se usa en un solo sistema.',
   null, false, true),
  ('tributario.adquiriente_razon_social', '""', 'TEXTO', null, null, null, 'tributario',
   'Razón social de AMO como adquiriente en los documentos soporte (vacío: el PDF lo muestra como pendiente).', null,
   false, true),
  ('tributario.adquiriente_nit', '""', 'TEXTO', null, null, null, 'tributario',
   'NIT de AMO, sin dígito de verificación, para los documentos soporte.', null, false, true),
  ('tributario.adquiriente_dv', '""', 'TEXTO', null, null, null, 'tributario',
   'Dígito de verificación del NIT de AMO.', null, false, true),
  ('tributario.adquiriente_direccion', '""', 'TEXTO', null, null, null, 'tributario',
   'Dirección de AMO como adquiriente en los documentos soporte.', null, false, true)
on conflict (clave) do nothing;

insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('cola.liquidacion_por_aprobar', 'APP', 'Liquidación por aprobar', null,
   'La liquidación de {{medio}} del periodo {{periodo}} por {{monto}} está lista para aprobar.',
   array['medio', 'periodo', 'monto']),
  ('cola.liquidaciones_por_aprobar', 'APP', 'Liquidaciones por aprobar', null,
   'Se generaron {{cantidad}} liquidaciones del periodo {{periodo}}: están listas para aprobar.',
   array['cantidad', 'periodo']),
  ('liquidacion.factura_requerida', 'APP', 'Carga tu factura', null,
   'Tu liquidación del periodo {{periodo}} por {{monto}} está lista: carga tu factura para que podamos pagarte.',
   array['periodo', 'monto']),
  ('factura.nota_credito', 'APP', 'Nota crédito registrada', null,
   'Registramos la nota crédito {{nota}} por {{valor}} a la factura {{numero}}. Saldo: {{saldo}}.',
   array['nota', 'valor', 'numero', 'saldo']),
  ('factura.anulada', 'APP', 'Factura anulada', null,
   'La factura {{numero}} quedó anulada con la nota crédito {{nota}}.', array['numero', 'nota'])
on conflict (clave, canal) do nothing;

-- El archivo para el proveedor tecnológico del documento soporte es JSON (formato genérico hasta tener el suyo).
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'text/csv',
                                                      'application/json']
 where id = 'soportes';

-- 2. Documento soporte -------------------------------------------------------------------------------------------

alter table public.documentos_soporte
  add column archivo_proveedor_path text,
  add column cuds_registrado_at timestamptz,
  add column cuds_registrado_por uuid references public.perfiles (id) on delete set null,
  add column nota_ajuste_numero text,
  add column nota_ajuste_cude text,
  add column nota_ajuste_path text,
  add column nota_ajuste_at timestamptz,
  add column nota_ajuste_por uuid references public.perfiles (id) on delete set null,
  add constraint documentos_soporte_proveedor_path_chk check (archivo_proveedor_path is null
    or (archivo_proveedor_path like 'documento_soporte/' || id::text || '/%' and position('..' in archivo_proveedor_path) = 0)),
  add constraint documentos_soporte_nota_path_chk check (nota_ajuste_path is null
    or (nota_ajuste_path like 'documento_soporte/' || id::text || '/%' and position('..' in nota_ajuste_path) = 0)),
  add constraint documentos_soporte_nota_numero_chk check (char_length(nota_ajuste_numero) between 1 and 60),
  add constraint documentos_soporte_nota_cude_chk check (char_length(nota_ajuste_cude) between 1 and 200),
  add constraint documentos_soporte_cuds_emitido_chk check (cuds is null or consecutivo is not null),
  add constraint documentos_soporte_nota_chk check ((nota_ajuste_numero is null) = (nota_ajuste_at is null)
    and (nota_ajuste_numero is null) = (nota_ajuste_path is null) and (nota_ajuste_numero is null or cuds is not null));
create unique index documentos_soporte_cuds_key on public.documentos_soporte (cuds) where cuds is not null;
create index documentos_soporte_cuds_registrado_por_idx on public.documentos_soporte (cuds_registrado_por);
create index documentos_soporte_nota_ajuste_por_idx on public.documentos_soporte (nota_ajuste_por);

-- Numeración, valor, CUDS y archivos solo los cambian los procedimientos de la plataforma (corren como postgres):
-- ni siquiera la clave secreta reescribe un documento emitido.
create function private.fn_documentos_soporte_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
    detail = 'El documento soporte solo lo cambia la plataforma.', hint = 'documentos_soporte';
end $$;
revoke all on function private.fn_documentos_soporte_guardar() from public, anon, authenticated, service_role;
create trigger trg_documentos_soporte_a_guardar before update or delete on public.documentos_soporte
  for each row execute function private.fn_documentos_soporte_guardar();

-- Comprueba que un objeto exista en el bucket de soportes (lo subió la interfaz antes de registrarlo).
create function private.soporte_cargado(p_ruta text, p_prefijo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_ruta is not null and p_ruta like p_prefijo || '%' and position('..' in p_ruta) = 0
     and exists (select 1 from storage.objects s where s.bucket_id = 'soportes' and s.name = p_ruta)
$$;
revoke all on function private.soporte_cargado(text, text) from public, anon, authenticated, service_role;

-- LIQ-004 · D35 del RF: el borrador del documento soporte de una liquidación aprobada (lo crea si se anuló el anterior).
create function public.preparar_documento_soporte_srv(p_liquidacion_id uuid, p_actor_id uuid, p_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; l public.liquidaciones; ds public.documentos_soporte;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  select * into l from public.liquidaciones x where x.id = p_liquidacion_id for update;
  if l.id is null or l.estado <> 'APROBADA' or not l.requiere_documento_soporte then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La liquidación debe estar aprobada y requerir documento soporte.';
  end if;
  select * into ds from public.documentos_soporte d where d.liquidacion_id = l.id and d.estado <> 'ANULADO' for update;
  if ds.id is null then
    insert into public.documentos_soporte (liquidacion_id, valor_total) values (l.id, l.monto_medio) returning * into ds;
  end if;
  return ds.id;
end $$;
revoke all on function public.preparar_documento_soporte_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.preparar_documento_soporte_srv(uuid, uuid, uuid) to service_role;

-- LIQ-004: la plataforma numera solo si es el sistema que usa el rango (D35 del RF).
CREATE OR REPLACE FUNCTION public.emitir_documento_soporte_srv(p_liquidacion_id uuid, p_actor_id uuid, p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tipo public.rol_tipo; l public.liquidaciones; ds public.documentos_soporte; n record;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if private.config_texto('tributario.numeracion_documento_soporte') = 'PROVEEDOR' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El proveedor tecnológico numera los documentos soporte: registra el número que asignó.',
      hint = 'numeracion_proveedor';
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
end $function$;

-- LIQ-004 con numeración del proveedor: registra el documento que expidió (número dentro de la resolución, fecha,
-- CUDS y PDF). El PDF se sube antes a documento_soporte/{id}/.
create function public.registrar_documento_soporte_externo_srv(p_documento_id uuid, p_prefijo text, p_consecutivo bigint,
  p_fecha_emision date, p_cuds text, p_archivo_path text, p_actor_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; ds public.documentos_soporte; l public.liquidaciones; v_res uuid;
  v_prefijo text := upper(coalesce(btrim(p_prefijo), '')); v_cuds text := lower(btrim(p_cuds)); v_r jsonb;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if private.config_texto('tributario.numeracion_documento_soporte') is distinct from 'PROVEEDOR' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La plataforma numera los documentos soporte: emítelo desde la liquidación.', hint = 'numeracion_plataforma';
  end if;
  perform set_config('lock_timeout', '3s', true);
  select * into ds from public.documentos_soporte d where d.id = p_documento_id for update;
  select * into l from public.liquidaciones x where x.id = ds.liquidacion_id for update;
  if ds.id is null or ds.estado <> 'BORRADOR' or l.estado is distinct from 'APROBADA' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se registra el documento soporte en borrador de una liquidación aprobada.';
  end if;
  if p_consecutivo is null or p_fecha_emision is null or p_fecha_emision > private.hoy()
     or p_fecha_emision < (l.created_at at time zone 'America/Bogota')::date then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Indica el número y una fecha de emisión entre la generación de la liquidación y hoy.';
  end if;
  if v_cuds is null or v_cuds !~ '^[0-9a-f]{96}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El CUDS son 96 caracteres hexadecimales, como lo entrega el proveedor tecnológico.', hint = 'cuds_formato';
  end if;
  select r.id into v_res from public.resoluciones_dian r
  where r.tipo = 'DOCUMENTO_SOPORTE' and r.prefijo = v_prefijo and p_consecutivo between r.rango_desde and r.rango_hasta
    and p_fecha_emision between r.vigente_desde and coalesce(r.vigente_hasta, 'infinity'::date)
  for update;
  if v_res is null then
    raise exception using errcode = 'P0001', message = 'AMO_RESOLUCION_AGOTADA',
      detail = 'El número no pertenece a una resolución de documento soporte vigente en la fecha de emisión.';
  end if;
  if exists (select 1 from public.documentos_soporte d where d.resolucion_id = v_res and d.consecutivo = p_consecutivo)
     or exists (select 1 from public.documentos_soporte d where d.cuds = v_cuds) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Ese número o ese CUDS ya están registrados en otro documento soporte.';
  end if;
  if not private.soporte_cargado(p_archivo_path, 'documento_soporte/' || ds.id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Carga el PDF del documento soporte que expidió el proveedor.', hint = 'archivo_no_cargado';
  end if;
  update public.resoluciones_dian r set consecutivo_actual = greatest(r.consecutivo_actual, p_consecutivo) where r.id = v_res;
  v_r := private.aplicar_transicion('documentos_soporte', ds.id, 'EMITIDO', 'ADMIN', p_actor_id, null,
           jsonb_build_object('resolucion_id', v_res, 'prefijo', v_prefijo, 'consecutivo', p_consecutivo,
                              'fecha_emision', p_fecha_emision));
  update public.documentos_soporte d
     set cuds = v_cuds, cuds_registrado_at = private.ahora(), cuds_registrado_por = p_actor_id, archivo_path = p_archivo_path
   where d.id = ds.id;
  return v_r || jsonb_build_object('numero', v_prefijo || p_consecutivo::text);
end $$;
revoke all on function public.registrar_documento_soporte_externo_srv(uuid, text, bigint, date, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_documento_soporte_externo_srv(uuid, text, bigint, date, text, text, uuid, uuid)
  to service_role;

-- LIQ-004: el CUDS que devolvió el proveedor tras la transmisión (manual mientras no haya integración).
create function public.registrar_cuds_srv(p_documento_id uuid, p_cuds text, p_actor_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; ds public.documentos_soporte; v_cuds text := lower(btrim(p_cuds));
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into ds from public.documentos_soporte d where d.id = p_documento_id for update;
  if ds.id is null or ds.estado <> 'EMITIDO' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo un documento soporte emitido recibe el CUDS.', hint = 'documento_no_emitido';
  end if;
  if v_cuds is null or v_cuds !~ '^[0-9a-f]{96}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El CUDS son 96 caracteres hexadecimales, como lo entrega el proveedor tecnológico.', hint = 'cuds_formato';
  end if;
  if ds.cuds is not null then
    if ds.cuds = v_cuds then return; end if;
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El documento ya tiene CUDS: un error se corrige con una nota de ajuste.', hint = 'cuds_registrado';
  end if;
  if exists (select 1 from public.documentos_soporte d where d.cuds = v_cuds) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Ese CUDS ya está registrado en otro documento soporte.';
  end if;
  update public.documentos_soporte d set cuds = v_cuds, cuds_registrado_at = private.ahora(), cuds_registrado_por = p_actor_id
   where d.id = ds.id;
end $$;
revoke all on function public.registrar_cuds_srv(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_cuds_srv(uuid, text, uuid, uuid) to service_role;

-- LIQ-004: el PDF (generado en el servidor) y el archivo para el proveedor. Se pueden reemplazar mientras el documento
-- siga emitido: el PDF se regenera al registrar el CUDS para que lo muestre (la bitácora guarda cada cambio).
create function public.adjuntar_archivos_documento_soporte_srv(p_documento_id uuid, p_pdf_path text,
  p_archivo_proveedor_path text, p_actor_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; ds public.documentos_soporte; v_prefijo text;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into ds from public.documentos_soporte d where d.id = p_documento_id for update;
  if ds.id is null or ds.estado <> 'EMITIDO' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Los archivos se adjuntan a un documento soporte emitido.';
  end if;
  v_prefijo := 'documento_soporte/' || ds.id::text || '/';
  if (p_pdf_path is null and p_archivo_proveedor_path is null)
     or (p_pdf_path is not null and not private.soporte_cargado(p_pdf_path, v_prefijo))
     or (p_archivo_proveedor_path is not null and not private.soporte_cargado(p_archivo_proveedor_path, v_prefijo)) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Los archivos del documento soporte no están cargados.', hint = 'archivo_no_cargado';
  end if;
  update public.documentos_soporte d
     set archivo_path = coalesce(p_pdf_path, d.archivo_path),
         archivo_proveedor_path = coalesce(p_archivo_proveedor_path, d.archivo_proveedor_path)
   where d.id = ds.id;
end $$;
revoke all on function public.adjuntar_archivos_documento_soporte_srv(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.adjuntar_archivos_documento_soporte_srv(uuid, text, text, uuid, uuid) to service_role;

-- D38 del RF: un documento ya transmitido (con CUDS) no se anula; se registra la nota de ajuste expedida en el
-- proveedor y solo entonces se anula el documento o la liquidación.
create function public.registrar_nota_ajuste_srv(p_documento_id uuid, p_numero text, p_cude text, p_archivo_path text,
  p_actor_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; ds public.documentos_soporte; v_numero text := upper(btrim(p_numero));
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.aprobar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into ds from public.documentos_soporte d where d.id = p_documento_id for update;
  if ds.id is null or ds.estado <> 'EMITIDO' or ds.cuds is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La nota de ajuste aplica a un documento soporte emitido y transmitido (con CUDS).';
  end if;
  if ds.nota_ajuste_numero is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El documento ya tiene una nota de ajuste registrada.';
  end if;
  if v_numero is null or v_numero !~ '^[A-Z0-9][A-Z0-9 -]{0,59}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Indica el número de la nota de ajuste.';
  end if;
  if char_length(btrim(p_cude)) > 200 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El CUDE es demasiado largo.';
  end if;
  if not private.soporte_cargado(p_archivo_path, 'documento_soporte/' || ds.id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Carga el PDF de la nota de ajuste.', hint = 'archivo_no_cargado';
  end if;
  update public.documentos_soporte d
     set nota_ajuste_numero = v_numero, nota_ajuste_cude = nullif(lower(btrim(p_cude)), ''), nota_ajuste_path = p_archivo_path,
         nota_ajuste_at = private.ahora(), nota_ajuste_por = p_actor_id
   where d.id = ds.id;
end $$;
revoke all on function public.registrar_nota_ajuste_srv(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_nota_ajuste_srv(uuid, text, text, text, uuid, uuid) to service_role;

-- LIQ-004: lo que lleva el PDF y el archivo genérico para el proveedor (sin datos reservados del medio: esos se
-- piden con revelar_privado_srv y quedan en la bitácora).
create function public.datos_documento_soporte(p_documento_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.exigir_permiso('liquidaciones.ver');
  select jsonb_build_object(
    'documento', jsonb_build_object('id', d.id, 'estado', d.estado, 'prefijo', d.prefijo, 'consecutivo', d.consecutivo,
       'numero', d.numero, 'fecha_emision', d.fecha_emision, 'valor_total', d.valor_total, 'cuds', d.cuds,
       'archivo_path', d.archivo_path, 'archivo_proveedor_path', d.archivo_proveedor_path),
    'resolucion', case when r.id is not null then jsonb_build_object('numero_resolucion', r.numero_resolucion,
       'fecha_resolucion', r.fecha_resolucion, 'prefijo', r.prefijo, 'rango_desde', r.rango_desde,
       'rango_hasta', r.rango_hasta, 'vigente_desde', r.vigente_desde, 'vigente_hasta', r.vigente_hasta) end,
    'liquidacion', jsonb_build_object('id', l.id, 'periodo_inicio', l.periodo_inicio, 'periodo_fin', l.periodo_fin,
       'monto_medio', l.monto_medio, 'monto_retenciones', l.monto_retenciones, 'monto_neto', l.monto_neto,
       'cantidad_asignaciones', l.cantidad_asignaciones),
    'medio', jsonb_build_object('id', m.id, 'nombre', m.nombre, 'municipio_codigo', m.municipio_codigo),
    'adquiriente', jsonb_build_object('razon_social', private.config_texto('tributario.adquiriente_razon_social'),
       'nit', private.config_texto('tributario.adquiriente_nit'), 'dv', private.config_texto('tributario.adquiriente_dv'),
       'direccion', private.config_texto('tributario.adquiriente_direccion'),
       'municipio_codigo', private.config_texto('tributario.municipio_plataforma')),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('asignacion_id', a.id, 'oferta', o.titulo, 'marca', c.marca,
                 'plataforma', a.plataforma, 'formato', f.nombre, 'publicada_at', a.publicada_at,
                 'verificada_at', a.verificada_at, 'valor', am.monto_medio) order by a.verificada_at, a.id)
               from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
               join public.ofertas o on o.id = a.oferta_id join public.campanas c on c.id = a.campana_id
               join public.formatos f on f.id = o.formato_id
               where a.liquidacion_id = l.id), '[]'),
    'retenciones', coalesce((select jsonb_agg(x order by x.tipo) from (
                 select e ->> 'tipo' as tipo, e ->> 'concepto' as concepto, (e ->> 'tarifa')::numeric as tarifa,
                        e ->> 'municipio_codigo' as municipio_codigo, max((e ->> 'base_pago')::numeric) as base,
                        sum((e ->> 'valor')::numeric) as valor
                 from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
                 cross join jsonb_array_elements(coalesce(am.retenciones_aplicadas, '[]')) e
                 where a.liquidacion_id = l.id group by 1, 2, 3, 4) x), '[]'))
  into v
  from public.documentos_soporte d
  join public.liquidaciones l on l.id = d.liquidacion_id
  join public.medios m on m.id = l.medio_id
  left join public.resoluciones_dian r on r.id = d.resolucion_id
  where d.id = p_documento_id;
  return v;
end $$;
revoke all on function public.datos_documento_soporte(uuid) from public, anon;
grant execute on function public.datos_documento_soporte(uuid) to authenticated;

-- 3. Liquidaciones -----------------------------------------------------------------------------------------------

-- LIQ-007 (D30): ¿el medio supera el umbral del mes de p_fin sin seguridad social aprobada y vigente? Se evalúa al
-- generar y otra vez al aprobar (el medio pudo cargar su soporte entre tanto).
create function private.seg_social_pendiente(p_medio_id uuid, p_fin date, p_adicional numeric, p_excluir uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pt.umbral_seg_social_smlmv * pt.smlmv
                     < coalesce(p_adicional, 0) + (select coalesce(sum(l.monto_medio), 0) from public.liquidaciones l
                                                   where l.medio_id = p_medio_id and l.estado <> 'ANULADA'
                                                     and l.id is distinct from p_excluir
                                                     and l.periodo_fin >= date_trunc('month', p_fin)::date
                                                     and l.periodo_fin < (date_trunc('month', p_fin) + interval '1 month')::date)
                   from public.parametros_tributarios pt where pt.anio = extract(year from p_fin)::smallint), false)
     and not exists (select 1 from public.documentos_medio d
                     where d.medio_id = p_medio_id and d.tipo = 'SEG_SOCIAL' and d.estado_validacion = 'APROBADO'
                       and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy()))
$$;
revoke all on function private.seg_social_pendiente(uuid, date, numeric, uuid) from public, anon, authenticated, service_role;

-- LIQ-001: el periodo de liquidación que contiene una fecha según liquidaciones.periodicidad.
create function private.periodo_liquidacion(p_fecha date, out inicio date, out fin date)
language plpgsql stable set search_path = '' as $$
declare v_mes date := date_trunc('month', p_fecha)::date;
begin
  case private.config_texto('liquidaciones.periodicidad')
    when 'SEMANAL' then
      inicio := date_trunc('week', p_fecha)::date;
      fin := inicio + 6;
    when 'MENSUAL' then
      inicio := v_mes;
      fin := (v_mes + interval '1 month')::date - 1;
    else
      if extract(day from p_fecha) <= 15 then
        inicio := v_mes;
        fin := v_mes + 14;
      else
        inicio := v_mes + 15;
        fin := (v_mes + interval '1 month')::date - 1;
      end if;
  end case;
end $$;
revoke all on function private.periodo_liquidacion(date) from public, anon, authenticated, service_role;

-- El último periodo cerrado (el que termina hoy cuenta como cerrado): lo que la interfaz propone para el corte.
create function public.periodo_liquidacion_sugerido(out inicio date, out fin date, out periodicidad text)
language plpgsql stable security definer set search_path = '' as $$
declare v_hoy date := private.hoy();
begin
  perform private.exigir_permiso('liquidaciones.ver');
  select p.inicio, p.fin into inicio, fin from private.periodo_liquidacion(v_hoy) p;
  if fin > v_hoy then
    select p.inicio, p.fin into inicio, fin from private.periodo_liquidacion(inicio - 1) p;
  end if;
  periodicidad := private.config_texto('liquidaciones.periodicidad');
end $$;
revoke all on function public.periodo_liquidacion_sugerido() from public, anon;
grant execute on function public.periodo_liquidacion_sugerido() to authenticated;

-- LIQ-001/LIQ-007: periodo cerrado, seguridad social con su función y avisos.
CREATE OR REPLACE FUNCTION public.generar_liquidacion_srv(p_medio_id uuid, p_periodo_inicio date, p_periodo_fin date, p_actor_id uuid, p_session_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_rets jsonb; v_ret_asig numeric; v_medio_nombre text; v_periodo text;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.generar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_medio_id is null or p_periodo_inicio is null or p_periodo_fin is null or p_periodo_fin < p_periodo_inicio then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'El periodo de la liquidación no es válido.';
  end if;
  -- LIQ-001: un corte anticipado bloquearía por traslape el resto del periodo.
  if p_periodo_fin > private.hoy() then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El periodo aún no termina: liquídalo desde su último día.', hint = 'periodo_abierto';
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

  -- Seguridad social (§12, §14.2.5, D30): mes calendario de p_periodo_fin (se reevalúa al aprobar).
  v_alerta := private.seg_social_pendiente(p_medio_id, p_periodo_fin, v_medio_total);

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
  -- Avisos: a quienes pueden aprobar (menos quien la generó, D17) y al medio que factura, para que cargue su factura.
  -- El corte por lote manda un solo aviso a la cola (generar_liquidaciones_corte_srv).
  select m.nombre into v_medio_nombre from public.medios m where m.id = p_medio_id;
  v_periodo := to_char(p_periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(p_periodo_fin, 'DD/MM/YYYY');
  if coalesce(current_setting('amo.liquidacion_lote', true), '') <> 'on' then
    perform private.notificar(array(select u.id from unnest(private.usuarios_con_permiso('liquidaciones.aprobar')) u (id)
                                    where u.id <> p_actor_id),
      'cola.liquidacion_por_aprobar',
      jsonb_build_object('medio', v_medio_nombre, 'periodo', v_periodo, 'monto', private.formato_cop(v_medio_total - v_ret_total)),
      'liquidaciones', v_liq::text, null, 0::smallint);
  end if;
  if v_obligado then
    perform private.notificar(private.usuarios_medio(p_medio_id), 'liquidacion.factura_requerida',
      jsonb_build_object('periodo', v_periodo, 'monto', private.formato_cop(v_medio_total)),
      'liquidaciones', v_liq::text, null, 1::smallint);
  end if;
  return v_liq;
end $function$;

-- LIQ-001: corte de un periodo para todos los medios con verificadas por liquidar. Cada medio va en su propia
-- subtransacción: un error (traslape, parámetros) queda en su fila y no detiene a los demás.
create function public.generar_liquidaciones_corte_srv(p_periodo_inicio date, p_periodo_fin date, p_actor_id uuid,
  p_session_id uuid)
returns table (medio_id uuid, medio text, liquidacion_id uuid, error text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_tipo public.rol_tipo; r record; v_liq uuid; v_detalle text; v_mensaje text; v_n integer := 0;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.generar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_periodo_inicio is null or p_periodo_fin is null or p_periodo_fin < p_periodo_inicio or p_periodo_fin > private.hoy() then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Indica un periodo cerrado: liquídalo desde su último día.', hint = 'periodo_abierto';
  end if;
  perform set_config('amo.liquidacion_lote', 'on', true);
  for r in select x.medio_id, m.nombre from (select distinct a.medio_id from public.asignaciones a
                                             where a.estado = 'VERIFICADA' and a.liquidacion_id is null
                                               and a.verificada_at < private.inicio_dia(p_periodo_fin + 1)) x
           join public.medios m on m.id = x.medio_id
           order by m.nombre_normalizado, x.medio_id loop
    begin
      v_liq := public.generar_liquidacion_srv(r.medio_id, p_periodo_inicio, p_periodo_fin, p_actor_id, p_session_id);
      v_n := v_n + 1;
      medio_id := r.medio_id; medio := r.nombre; liquidacion_id := v_liq; error := null;
    exception when others then
      get stacked diagnostics v_detalle = pg_exception_detail, v_mensaje = message_text;
      medio_id := r.medio_id; medio := r.nombre; liquidacion_id := null;
      error := coalesce(nullif(v_detalle, ''), v_mensaje);
    end;
    return next;
  end loop;
  perform set_config('amo.liquidacion_lote', '', true);
  if v_n > 0 then
    perform private.notificar(array(select u.id from unnest(private.usuarios_con_permiso('liquidaciones.aprobar')) u (id)
                                    where u.id <> p_actor_id),
      'cola.liquidaciones_por_aprobar',
      jsonb_build_object('cantidad', v_n::text,
                         'periodo', to_char(p_periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(p_periodo_fin, 'DD/MM/YYYY')),
      'liquidaciones', null, null, 0::smallint);
  end if;
end $$;
revoke all on function public.generar_liquidaciones_corte_srv(date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.generar_liquidaciones_corte_srv(date, date, uuid, uuid) to service_role;

-- LIQ-005: el medio tiene sus datos de pago completos y la certificación de esa cuenta aprobada después del último
-- cambio (la misma regla de la verificación del medio: protege contra el fraude por cambio de cuenta).
create function private.datos_pago_listos(p_medio_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.medios_privado mp
    where mp.medio_id = p_medio_id and mp.metodo_pago is not null and mp.datos_pago_cifrados is not null
      and mp.numero_documento_cifrado is not null and nullif(btrim(mp.titular_nombre), '') is not null
      and exists (select 1 from public.documentos_medio d
                  where d.medio_id = p_medio_id
                    and d.tipo = case mp.metodo_pago when 'BANCARIO' then 'CERT_BANCARIA'::public.documento_medio_tipo
                                                     else 'CERT_BILLETERA'::public.documento_medio_tipo end
                    and d.estado_validacion = 'APROBADO'
                    and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())
                    and (mp.datos_pago_cambiados_at is null or d.created_at >= mp.datos_pago_cambiados_at)))
$$;
revoke all on function private.datos_pago_listos(uuid) from public, anon, authenticated, service_role;

-- Medios con verificadas por liquidar (Finanzas no lee medios_privado: aquí ve si factura y si su cuenta está lista,
-- sin datos reservados).
create function public.pendientes_liquidacion(p_hasta date default null)
returns table (medio_id uuid, medio text, municipio_codigo character(5), asignaciones integer, monto_medio numeric,
               primera_verificada timestamptz, ultima_verificada timestamptz, ultima_liquidacion_fin date,
               requiere_documento_soporte boolean, datos_pago_listos boolean, seg_social_pendiente boolean)
language sql stable security definer set search_path = '' as $$
  with base as (
    select a.medio_id, count(*)::integer as n, sum(am.monto_medio) as monto, min(a.verificada_at) as primera,
           max(a.verificada_at) as ultima
    from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
    where a.estado = 'VERIFICADA' and a.liquidacion_id is null
      and (p_hasta is null or a.verificada_at < private.inicio_dia(p_hasta + 1))
    group by a.medio_id
  )
  select b.medio_id, m.nombre, m.municipio_codigo, b.n, b.monto, b.primera, b.ultima,
         (select max(l.periodo_fin) from public.liquidaciones l where l.medio_id = b.medio_id and l.estado <> 'ANULADA'),
         not coalesce(mp.obligado_facturar, false), private.datos_pago_listos(b.medio_id),
         private.seg_social_pendiente(b.medio_id, coalesce(p_hasta, private.hoy()), b.monto)
  from base b
  join public.medios m on m.id = b.medio_id
  left join public.medios_privado mp on mp.medio_id = b.medio_id
  where (select private.acceso_valido()) and (select private.tiene_permiso('liquidaciones.ver'))
  order by b.monto desc, m.nombre
$$;
revoke all on function public.pendientes_liquidacion(date) from public, anon;
grant execute on function public.pendientes_liquidacion(date) to authenticated;

-- 4. Dispersión, pago y factura del medio ------------------------------------------------------------------------

-- Validaciones comunes de la dispersión (bloquea las liquidaciones en orden).
create function private.validar_dispersion(p_liquidacion_ids uuid[], p_repetir boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_lista text;
begin
  if p_liquidacion_ids is null or cardinality(p_liquidacion_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Selecciona al menos una liquidación.';
  end if;
  if cardinality(p_liquidacion_ids) > 500 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Un archivo de pagos admite hasta 500 liquidaciones.';
  end if;
  perform 1 from public.liquidaciones l where l.id = any (p_liquidacion_ids) order by l.id for update;
  select count(*) into v_n from public.liquidaciones l where l.id = any (p_liquidacion_ids) and l.estado = 'APROBADA';
  if v_n <> (select count(distinct x.id) from unnest(p_liquidacion_ids) x (id)) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Todas las liquidaciones deben estar aprobadas.', hint = 'no_aprobada';
  end if;
  if not coalesce(p_repetir, false)
     and exists (select 1 from public.liquidaciones l where l.id = any (p_liquidacion_ids) and l.dispersion_id is not null) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Alguna liquidación ya está en un archivo de pagos: confirma que el banco no la pagó antes de incluirla otra vez.',
      hint = 'ya_dispersada';
  end if;
  select string_agg(x.nombre, ', ' order by x.nombre) into v_lista
  from (select distinct m.nombre from public.liquidaciones l join public.medios m on m.id = l.medio_id
        where l.id = any (p_liquidacion_ids)
          and ((l.requiere_documento_soporte
                and not exists (select 1 from public.documentos_soporte d where d.liquidacion_id = l.id and d.estado = 'EMITIDO'))
               or (not l.requiere_documento_soporte and (l.numero_factura_medio is null or l.factura_medio_path is null)))
        limit 5) x;
  if v_lista is not null then
    raise exception using errcode = 'P0001', message = 'AMO_DOCUMENTO_SOPORTE_REQUERIDO',
      detail = 'Falta el documento soporte o la factura de: ' || v_lista || '.', hint = 'documento_soporte_requerido';
  end if;
  select string_agg(x.nombre, ', ' order by x.nombre) into v_lista
  from (select distinct m.nombre from public.liquidaciones l join public.medios m on m.id = l.medio_id
        where l.id = any (p_liquidacion_ids) and not private.datos_pago_listos(l.medio_id) limit 5) x;
  if v_lista is not null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Estos medios no tienen datos de pago completos con su certificación aprobada: ' || v_lista || '.',
      hint = 'datos_pago_incompletos';
  end if;
end $$;
revoke all on function private.validar_dispersion(uuid[], boolean) from public, anon, authenticated, service_role;

drop function public.preparar_dispersion_srv(uuid[], text, uuid, uuid);

-- LIQ-005, paso 1: valida, revela los datos de pago (cifrados; el servidor los descifra) y deja un REVELAR_DATO por
-- medio. Exige registrar pagos y ver datos sensibles, y dice cuál falta.
create function public.datos_dispersion_srv(p_liquidacion_ids uuid[], p_actor_id uuid, p_session_id uuid,
  p_repetir boolean default false)
returns table (liquidacion_id uuid, medio_id uuid, medio text, periodo_inicio date, periodo_fin date, titular_nombre text,
               tipo_documento public.documento_identidad_tipo, numero_documento_cifrado text,
               metodo_pago public.metodo_pago, datos_pago_cifrados text, monto_neto numeric)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_tipo public.rol_tipo; r record;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.registrar_pago', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if not private.tiene_permiso_de(p_actor_id, 'datos_sensibles.ver') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'El archivo de pagos exige también el permiso «Ver datos sensibles»: revela los datos bancarios de cada medio.',
      hint = 'datos_sensibles.ver';
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform private.validar_dispersion(p_liquidacion_ids, p_repetir);
  for r in select distinct l.medio_id from public.liquidaciones l where l.id = any (p_liquidacion_ids) order by l.medio_id loop
    perform private.registrar_en_bitacora('REVELAR_DATO', 'medios_privado', r.medio_id::text, null,
              jsonb_build_object('tabla', 'medios_privado', 'id', r.medio_id, 'origen', 'dispersion',
                                 'campos', jsonb_build_array('titular_nombre', 'tipo_documento', 'numero_documento_cifrado',
                                                             'metodo_pago', 'datos_pago_cifrados')));
  end loop;
  return query
    select l.id, l.medio_id, m.nombre, l.periodo_inicio, l.periodo_fin, mp.titular_nombre, mp.tipo_documento,
           mp.numero_documento_cifrado, mp.metodo_pago, mp.datos_pago_cifrados, l.monto_neto
    from public.liquidaciones l join public.medios m on m.id = l.medio_id
    join public.medios_privado mp on mp.medio_id = l.medio_id
    where l.id = any (p_liquidacion_ids) order by m.nombre_normalizado, l.id;
end $$;
revoke all on function public.datos_dispersion_srv(uuid[], uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.datos_dispersion_srv(uuid[], uuid, uuid, boolean) to service_role;

-- LIQ-005, paso 2: con el CSV ya subido a dispersion/{id}/, registra la dispersión (EXPORTAR en la bitácora). Es
-- idempotente: repetir la llamada con la misma dispersión devuelve su id.
create function public.registrar_dispersion_srv(p_dispersion_id uuid, p_liquidacion_ids uuid[], p_archivo_path text,
  p_actor_id uuid, p_session_id uuid, p_repetir boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; v_n integer; v_total numeric; v_demo boolean;
begin
  v_tipo := private.validar_actor(p_actor_id, 'liquidaciones.registrar_pago', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if not private.tiene_permiso_de(p_actor_id, 'datos_sensibles.ver') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'El archivo de pagos exige también el permiso «Ver datos sensibles»: revela los datos bancarios de cada medio.',
      hint = 'datos_sensibles.ver';
  end if;
  if p_dispersion_id is null or p_archivo_path is null
     or p_archivo_path !~ ('^dispersion/' || p_dispersion_id::text || '/[^/]+\.csv$') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'La ruta del archivo de pagos no es válida.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  if exists (select 1 from public.dispersiones d where d.id = p_dispersion_id) then
    if (select count(*) from public.liquidaciones l where l.dispersion_id = p_dispersion_id)
       = (select count(distinct x.id) from unnest(p_liquidacion_ids) x (id))
       and not exists (select 1 from unnest(p_liquidacion_ids) x (id) join public.liquidaciones l on l.id = x.id
                       where l.dispersion_id is distinct from p_dispersion_id) then
      return p_dispersion_id;
    end if;
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Esa dispersión ya está registrada.';
  end if;
  if not private.soporte_cargado(p_archivo_path, 'dispersion/' || p_dispersion_id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El archivo de pagos no está cargado: genéralo de nuevo.', hint = 'archivo_no_cargado';
  end if;
  perform private.validar_dispersion(p_liquidacion_ids, p_repetir);
  select count(*), sum(l.monto_neto), bool_or(l.es_demo) into v_n, v_total, v_demo
  from public.liquidaciones l where l.id = any (p_liquidacion_ids);
  insert into public.dispersiones (id, archivo_path, cantidad_liquidaciones, monto_total, generada_por, es_demo)
  values (p_dispersion_id, p_archivo_path, v_n, v_total, p_actor_id, coalesce(v_demo, false));
  update public.liquidaciones l set dispersion_id = p_dispersion_id where l.id = any (p_liquidacion_ids);
  perform private.registrar_en_bitacora('EXPORTAR', 'dispersiones', p_dispersion_id::text, null,
            jsonb_build_object('liquidaciones', to_jsonb(p_liquidacion_ids), 'filas', v_n, 'formato', 'csv',
                               'repetida', coalesce(p_repetir, false)));
  return p_dispersion_id;
end $$;
revoke all on function public.registrar_dispersion_srv(uuid, uuid[], text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.registrar_dispersion_srv(uuid, uuid[], text, uuid, uuid, boolean) to service_role;

-- LIQ-004: el medio que factura aporta el número y el archivo de su factura (también puede hacerlo Finanzas).
create function private.puedo_subir_factura_medio(p_liquidacion_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.tiene_permiso('liquidaciones.ver_propias'))
     and exists (select 1 from public.liquidaciones l
                 where l.id = p_liquidacion_id and l.medio_id = (select private.mi_medio_id())
                   and not l.requiere_documento_soporte and l.estado in ('BORRADOR', 'APROBADA'))
$$;
revoke all on function private.puedo_subir_factura_medio(uuid) from public, anon, service_role;
grant execute on function private.puedo_subir_factura_medio(uuid) to authenticated;

create policy "storage: soportes insert factura medio" on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and private.seg(name, 1) = 'liquidacion' and private.seg(name, 3) = 'factura'
              and private.puedo_subir_factura_medio(private.seg_uuid(name, 2)));

create function public.registrar_factura_medio_srv(p_liquidacion_id uuid, p_numero text, p_archivo_path text,
  p_actor_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; l public.liquidaciones; v_numero text := upper(btrim(p_numero));
begin
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);
  perform set_config('lock_timeout', '3s', true);
  select * into l from public.liquidaciones x where x.id = p_liquidacion_id for update;
  if l.id is null
     or (v_tipo = 'MEDIO' and (not private.tiene_permiso_de(p_actor_id, 'liquidaciones.ver_propias')
                               or l.medio_id is distinct from (select p.medio_id from public.perfiles p where p.id = p_actor_id)))
     or (v_tipo = 'ADMIN' and not private.tiene_permiso_de(p_actor_id, 'liquidaciones.registrar_pago'))
     or v_tipo is null or v_tipo not in ('MEDIO', 'ADMIN') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if l.requiere_documento_soporte then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Este medio no factura: su pago lleva documento soporte.';
  end if;
  if l.estado not in ('BORRADOR', 'APROBADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La liquidación ya no admite cambios.';
  end if;
  if v_numero is null or v_numero !~ '^[A-Z0-9][A-Z0-9 -]{0,59}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Indica el número de la factura.';
  end if;
  if not private.soporte_cargado(p_archivo_path, 'liquidacion/' || l.id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Carga el PDF de la factura.', hint = 'archivo_no_cargado';
  end if;
  update public.liquidaciones x set numero_factura_medio = v_numero, factura_medio_path = p_archivo_path where x.id = l.id;
end $$;
revoke all on function public.registrar_factura_medio_srv(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.registrar_factura_medio_srv(uuid, text, text, uuid, uuid) to service_role;

-- Los datos de pago y de la factura del medio solo entran por sus procedimientos (con el archivo comprobado): ni la
-- sesión ni la clave secreta editan una liquidación.
revoke update on public.liquidaciones from authenticated;
drop policy "liquidaciones: update pago" on public.liquidaciones;
create or replace function private.fn_liquidaciones_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
    detail = 'La liquidación solo la cambia la plataforma.', hint = 'liquidaciones';
end $$;

-- Finanzas sube el PDF del proveedor y el de la nota de ajuste a documento_soporte/{id}/ con su sesión.
drop policy "storage: soportes insert interno" on storage.objects;
create policy "storage: soportes insert interno" on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and (
    (private.seg(name, 1) = 'liquidacion' and (select private.tiene_permiso('liquidaciones.registrar_pago'))
     and exists (select 1 from public.liquidaciones l where l.id = private.seg_uuid(name, 2)))
    or (private.seg(name, 1) = 'documento_soporte' and (select private.tiene_permiso('liquidaciones.aprobar'))
        and exists (select 1 from public.documentos_soporte d where d.id = private.seg_uuid(name, 2)))
    or (private.seg(name, 1) = 'factura' and (select private.tiene_permiso('facturas.gestionar'))
        and exists (select 1 from public.facturas f where f.id = private.seg_uuid(name, 2)))
    or (private.seg(name, 1) = 'pago' and (select private.tiene_permiso('pagos.registrar'))
        and exists (select 1 from public.facturas f where f.id = private.seg_uuid(name, 2)))));

-- LIQ-002 (D29): un solo concepto vigente por tipo y condición de declarante (el cálculo aplica todos los vigentes:
-- dos conceptos a la vez duplicarían la retención).
alter table public.retenciones_config drop constraint retenciones_config_vigencia_excl,
  add constraint retenciones_config_vigencia_excl exclude using gist
    (tipo with =, aplica_declarante with =, daterange(vigente_desde, vigente_hasta, '[)') with &&);

-- 5. Lo que ve el medio (MED-015) ----------------------------------------------------------------------------------

-- CFG-004: con comision.visible_para_medio apagada el medio solo ve lo que recibe; la lectura directa de la tabla se
-- saltaba ese enmascarado. El medio lee sus liquidaciones y documentos por RPC; sus archivos, por soy_dueno_soporte.
alter policy "liquidaciones: select interno o propio" on public.liquidaciones
  using ((select private.tiene_permiso('liquidaciones.ver')));
alter policy "liquidaciones: select interno o propio" on public.liquidaciones rename to "liquidaciones: select interno";
alter policy "documentos_soporte: select interno o propio" on public.documentos_soporte
  using ((select private.tiene_permiso('liquidaciones.ver')));
alter policy "documentos_soporte: select interno o propio" on public.documentos_soporte
  rename to "documentos_soporte: select interno";

create function public.mis_liquidaciones_medio(p_limite integer default 24, p_antes_id uuid default null,
  p_id uuid default null)
returns table (id uuid, periodo_inicio date, periodo_fin date, estado public.liquidacion_estado,
               cantidad_asignaciones integer, monto_bruto numeric, monto_comision numeric, monto_medio numeric,
               retefuente numeric, reteica numeric, reteiva numeric, monto_retenciones numeric, monto_neto numeric,
               created_at timestamptz, aprobada_at timestamptz, enviada_banco_at timestamptz, fecha_pago date,
               fecha_pago_estimada date, referencia_pago text, soporte_pago_path text, requiere_documento_soporte boolean,
               documento_id uuid, documento_numero text, documento_fecha date,
               documento_estado public.documento_soporte_estado, cuds text, documento_path text,
               numero_factura_medio text, factura_medio_path text, alerta_seg_social boolean, bloquea_seg_social boolean)
language sql stable security definer set search_path = '' as $$
  with cfg as (select private.config_booleano('comision.visible_para_medio') as visible,
                      private.config_entero('liquidaciones.dias_pago') as dias,
                      private.config_texto('tributario.politica_seg_social') = 'BLOQUEAR' as bloquea)
  select l.id, l.periodo_inicio, l.periodo_fin, l.estado, l.cantidad_asignaciones,
         case when cfg.visible then l.monto_bruto end, case when cfg.visible then l.monto_comision end, l.monto_medio,
         coalesce(ret.rf, 0), coalesce(ret.ica, 0), coalesce(ret.iva, 0), l.monto_retenciones, l.monto_neto,
         l.created_at, l.aprobada_at, dp.created_at, l.fecha_pago,
         case when l.estado in ('BORRADOR', 'APROBADA') then l.periodo_fin + cfg.dias end,
         l.referencia_pago, l.soporte_pago_path, l.requiere_documento_soporte,
         ds.id, ds.numero, ds.fecha_emision, ds.estado, ds.cuds, ds.archivo_path,
         l.numero_factura_medio, l.factura_medio_path, l.alerta_seg_social, cfg.bloquea
  from public.liquidaciones l
  cross join cfg
  left join public.dispersiones dp on dp.id = l.dispersion_id
  left join lateral (select d.* from public.documentos_soporte d
                     where d.liquidacion_id = l.id and d.estado <> 'ANULADO' order by d.created_at desc limit 1) ds on true
  left join lateral (select sum((e ->> 'valor')::numeric) filter (where e ->> 'tipo' = 'RETEFUENTE') as rf,
                            sum((e ->> 'valor')::numeric) filter (where e ->> 'tipo' = 'RETEICA') as ica,
                            sum((e ->> 'valor')::numeric) filter (where e ->> 'tipo' = 'RETEIVA') as iva
                     from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
                     cross join jsonb_array_elements(coalesce(am.retenciones_aplicadas, '[]')) e
                     where a.liquidacion_id = l.id) ret on true
  where (select private.acceso_valido()) and (select private.tiene_permiso('liquidaciones.ver_propias'))
    and l.medio_id = (select private.mi_medio_id()) and l.estado <> 'ANULADA'
    and (p_id is null or l.id = p_id) and (p_antes_id is null or l.id < p_antes_id)
  order by l.id desc
  limit least(greatest(coalesce(p_limite, 24), 1), 100)
$$;
revoke all on function public.mis_liquidaciones_medio(integer, uuid, uuid) from public, anon;
grant execute on function public.mis_liquidaciones_medio(integer, uuid, uuid) to authenticated;

-- Detalle por asignación de una liquidación del medio (bruto y comisión según la visibilidad configurada).
create function public.lineas_liquidacion_medio(p_liquidacion_id uuid)
returns table (asignacion_id uuid, oferta_id uuid, campana_id uuid, oferta text, marca text, anunciante text,
               plataforma public.plataforma, formato text, publicada_at timestamptz, verificada_at timestamptz,
               monto_bruto numeric, monto_comision numeric, monto_medio numeric, retenciones_aplicadas jsonb,
               monto_retenciones numeric, monto_neto numeric)
language sql stable security definer set search_path = '' as $$
  with cfg as (select private.config_booleano('comision.visible_para_medio') as visible)
  select a.id, a.oferta_id, a.campana_id, o.titulo, c.marca, an.nombre_comercial, a.plataforma, f.nombre, a.publicada_at,
         a.verificada_at, case when cfg.visible then am.monto_bruto end, case when cfg.visible then am.monto_comision end,
         am.monto_medio, am.retenciones_aplicadas, am.monto_retenciones, am.monto_neto
  from public.liquidaciones l
  join public.asignaciones a on a.liquidacion_id = l.id
  join public.asignacion_montos am on am.asignacion_id = a.id
  join public.ofertas o on o.id = a.oferta_id
  join public.campanas c on c.id = a.campana_id
  join public.anunciantes an on an.id = a.anunciante_id
  join public.formatos f on f.id = o.formato_id
  cross join cfg
  where (select private.acceso_valido()) and (select private.tiene_permiso('liquidaciones.ver_propias'))
    and l.id = p_liquidacion_id and l.medio_id = (select private.mi_medio_id()) and l.estado <> 'ANULADA'
  order by a.verificada_at, a.id
$$;
revoke all on function public.lineas_liquidacion_medio(uuid) from public, anon;
grant execute on function public.lineas_liquidacion_medio(uuid) to authenticated;

-- MED-015: resumen de ganancias (lo verificado sin liquidar es un estimado antes de retenciones).
create function public.resumen_ganancias_medio(out ganado_mes numeric, out por_liquidar numeric,
  out asignaciones_por_liquidar integer, out por_pagar numeric, out liquidaciones_por_pagar integer,
  out pagado_historico numeric, out retenciones_historicas numeric, out proximo_pago_estimado date,
  out periodicidad text, out dias_pago integer, out comision_visible boolean, out requiere_documento_soporte boolean,
  out seg_social_pendiente boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := private.mi_medio_id(); v_hoy date := private.hoy();
begin
  perform private.exigir_permiso('liquidaciones.ver_propias');
  if v_me is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  dias_pago := private.config_entero('liquidaciones.dias_pago');
  periodicidad := private.config_texto('liquidaciones.periodicidad');
  comision_visible := private.config_booleano('comision.visible_para_medio');
  select coalesce(sum(am.monto_medio), 0) into ganado_mes
  from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
  where a.medio_id = v_me and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    and a.verificada_at >= private.inicio_dia(date_trunc('month', v_hoy)::date);
  select coalesce(sum(am.monto_medio), 0), count(*)::integer into por_liquidar, asignaciones_por_liquidar
  from public.asignaciones a join public.asignacion_montos am on am.asignacion_id = a.id
  where a.medio_id = v_me and a.estado = 'VERIFICADA' and a.liquidacion_id is null;
  select coalesce(sum(l.monto_neto), 0), count(*)::integer, min(l.periodo_fin + dias_pago)
    into por_pagar, liquidaciones_por_pagar, proximo_pago_estimado
  from public.liquidaciones l where l.medio_id = v_me and l.estado in ('BORRADOR', 'APROBADA');
  select coalesce(sum(l.monto_neto), 0), coalesce(sum(l.monto_retenciones), 0) into pagado_historico, retenciones_historicas
  from public.liquidaciones l where l.medio_id = v_me and l.estado = 'PAGADA';
  select not coalesce(mp.obligado_facturar, false) into requiere_documento_soporte
  from public.medios_privado mp where mp.medio_id = v_me;
  requiere_documento_soporte := coalesce(requiere_documento_soporte, true);
  seg_social_pendiente := private.seg_social_pendiente(v_me, v_hoy, por_liquidar);
end $$;
revoke all on function public.resumen_ganancias_medio() from public, anon;
grant execute on function public.resumen_ganancias_medio() to authenticated;

-- 6. Facturas al anunciante (LIQ-008, ANU-013) ---------------------------------------------------------------------

-- D16/D37 del RF: el esquema define la base del IVA; cada factura guarda el suyo y el porcentaje con que se calculó.
alter table public.facturas
  add column esquema text not null default 'COMPRA_REVENTA'
    constraint facturas_esquema_chk check (esquema in ('COMPRA_REVENTA', 'MANDATO')),
  add column porcentaje_iva numeric(5,4) constraint facturas_porcentaje_iva_chk check (porcentaje_iva between 0 and 0.5),
  add column valor_terceros numeric(14,2) not null default 0
    constraint facturas_valor_terceros_chk check (valor_terceros >= 0),
  add column valor_notas_credito numeric(14,2) not null default 0;
alter table public.facturas alter column total set expression as (subtotal + iva + valor_terceros);
alter table public.facturas alter column saldo set expression as (subtotal + iva + valor_terceros - pagado - valor_notas_credito);
alter table public.facturas drop constraint facturas_pagado_chk,
  add constraint facturas_pagado_chk check (pagado >= 0 and valor_notas_credito >= 0
                                            and pagado + valor_notas_credito <= subtotal + iva + valor_terceros);

-- Los importes salen de las asignaciones (generar_factura_srv) y la numeración del software de AMO
-- (registrar_factura_expedida_srv): la sesión ya no inserta ni edita facturas.
revoke insert, update on public.facturas from authenticated;
drop policy "facturas: insert interno" on public.facturas;
drop policy "facturas: update interno" on public.facturas;

-- ANU-013: el anunciante ve sus facturas expedidas (con número), no los borradores.
alter policy "facturas: select interno o propio" on public.facturas
  using ((select private.tiene_permiso('facturas.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and consecutivo is not null
             and (select private.tiene_permiso('facturas.ver_propias'))));

-- Retenciones que el anunciante practica sobre la factura de AMO: cuentan para el saldo con el pago.
alter table public.pagos_anunciante
  add column valor_retenciones numeric(14,2) not null default 0
    constraint pagos_anunciante_retenciones_chk check (valor_retenciones >= 0),
  drop constraint pagos_anunciante_monto_chk,
  add constraint pagos_anunciante_monto_chk check (monto >= 0 and monto + valor_retenciones > 0);

CREATE OR REPLACE FUNCTION private.fn_facturas_guardar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.modo_carga() then return new; end if;
  -- D38 del RF: una factura expedida solo se anula con notas crédito que cubran todo su valor y sin pagos (también
  -- para los procedimientos: en BEFORE las columnas generadas aún no están calculadas, por eso se repite la suma).
  if new.estado = 'ANULADA' and old.estado not in ('BORRADOR', 'ANULADA')
     and not (new.pagado = 0 and new.valor_notas_credito = new.subtotal + new.iva + new.valor_terceros) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Una factura expedida no se anula: registra la nota crédito emitida en el software de facturación.',
      hint = 'requiere_nota_credito';
  end if;
  if current_user = 'postgres' then return new; end if;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), array['anunciante_id', 'campana_id', 'resolucion_id', 'prefijo',
       'consecutivo', 'fecha_emision', 'subtotal', 'iva', 'valor_terceros', 'esquema', 'porcentaje_iva', 'pagado',
       'valor_notas_credito', 'cufe', 'archivo_path', 'emitida_at', 'pagada_at', 'vencida_at', 'anulada_at', 'es_demo',
       'created_at']) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Esos datos de la factura solo los cambia la plataforma.';
  end if;
  if old.estado <> 'BORRADOR'
     and private.hay_cambios(to_jsonb(old), to_jsonb(new), array['periodo_desde', 'periodo_hasta', 'fecha_vencimiento']) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'Solo se edita una factura en borrador.';
  end if;
  return new;
end $function$;

-- D38 del RF: VENCIDA → ANULADA con su nota crédito (una vencida sin pagos también se corrige así).
insert into private.transiciones_estado (entidad, desde, hacia, actor, permiso, requiere_motivo, columna_at, modo_at, descripcion)
values ('facturas', 'VENCIDA', 'ANULADA', 'ADMIN', 'facturas.gestionar', true, 'anulada_at', 'SIEMPRE',
        'Anular con nota crédito');
update private.transiciones_estado set descripcion = 'Anular con nota crédito'
 where entidad = 'facturas' and desde = 'EMITIDA' and hacia = 'ANULADA';

-- Al anular (el borrador o la expedida con su nota crédito), las asignaciones quedan libres para otra factura.
create function private.fn_facturas_desvincular() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.asignaciones a set factura_id = null where a.factura_id = new.id;
  return null;
end $$;
revoke all on function private.fn_facturas_desvincular() from public, anon, authenticated, service_role;
create trigger trg_facturas_y_desvincular after update of estado on public.facturas
  for each row when (new.estado = 'ANULADA' and old.estado is distinct from 'ANULADA')
  execute function private.fn_facturas_desvincular();

-- D38 del RF: notas crédito expedidas en el software de AMO y registradas aquí (solo inserción).
create table public.notas_credito (
  id uuid primary key default private.uuid_v7(),
  factura_id uuid not null references public.facturas (id) on delete restrict,
  anunciante_id uuid not null references public.anunciantes (id) on delete restrict,
  numero text not null constraint notas_credito_numero_chk check (numero ~ '^[A-Z0-9][A-Z0-9 -]{0,39}$'),
  cude text not null constraint notas_credito_cude_chk check (cude ~ '^[0-9a-f]{96}$'),
  fecha_emision date not null,
  valor numeric(14,2) not null constraint notas_credito_valor_chk check (valor > 0),
  anula_factura boolean not null,
  motivo text not null constraint notas_credito_motivo_chk check (char_length(btrim(motivo)) between 10 and 1000),
  archivo_path text not null constraint notas_credito_archivo_path_chk
    check (archivo_path like 'factura/' || factura_id::text || '/%' and position('..' in archivo_path) = 0),
  registrado_por uuid references public.perfiles (id) on delete set null,
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora()
);
create unique index notas_credito_numero_key on public.notas_credito (numero);
create unique index notas_credito_cude_key on public.notas_credito (cude);
create index notas_credito_factura_id_idx on public.notas_credito (factura_id);
create index notas_credito_anunciante_fecha_idx on public.notas_credito (anunciante_id, fecha_emision);
create index notas_credito_registrado_por_idx on public.notas_credito (registrado_por);
create index notas_credito_es_demo_idx on public.notas_credito (es_demo) where es_demo;
alter table public.notas_credito enable row level security;
create policy "notas_credito: acceso válido" on public.notas_credito as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "notas_credito: select interno o propio" on public.notas_credito for select to authenticated
  using ((select private.tiene_permiso('facturas.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('facturas.ver_propias'))));
revoke all on public.notas_credito from public, anon, authenticated, service_role;
grant select on public.notas_credito to authenticated;
grant select on public.notas_credito to service_role;
create trigger trg_notas_credito_a_inmutable before update or delete on public.notas_credito
  for each row execute function private.fn_solo_insercion();
create trigger trg_notas_credito_a_inmutable_truncate before truncate on public.notas_credito
  for each statement execute function private.fn_solo_insercion();
create trigger trg_notas_credito_a_solo_plataforma before insert on public.notas_credito
  for each row execute function private.fn_solo_plataforma();
create trigger trg_notas_credito_z_auditar after insert on public.notas_credito
  for each row execute function private.fn_auditar('id');

drop function public.emitir_factura_srv(uuid, uuid, uuid);

-- LIQ-008: borrador por campaña o consolidado desde las asignaciones verificadas sin facturar hasta la fecha (como la
-- liquidación, arrastra las de periodos anteriores). Los importes siguen el esquema vigente.
create function public.generar_factura_srv(p_anunciante_id uuid, p_campana_id uuid, p_periodo_desde date,
  p_periodo_hasta date, p_actor_id uuid, p_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; v_esquema text := private.config_texto('facturacion.esquema');
  v_pct numeric := private.config_decimal('facturacion.iva'); v_ids uuid[]; v_bruto numeric; v_comision numeric;
  v_medio numeric; v_primera date; v_base numeric; v_id uuid;
begin
  v_tipo := private.validar_actor(p_actor_id, 'facturas.gestionar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  if p_anunciante_id is null or p_periodo_desde is null or p_periodo_hasta is null
     or p_periodo_hasta < p_periodo_desde or p_periodo_hasta > private.hoy() then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Indica un periodo válido que no termine en el futuro.';
  end if;
  if v_esquema is null or v_esquema not in ('COMPRA_REVENTA', 'MANDATO') or v_pct is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Revisa el esquema y el IVA de facturación en la configuración.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(hashtextextended('amo.factura:' || p_anunciante_id::text, 0));
  select array_agg(a.id order by a.id), sum(m.monto_bruto), sum(m.monto_comision), sum(m.monto_medio),
         min((a.verificada_at at time zone 'America/Bogota')::date)
    into v_ids, v_bruto, v_comision, v_medio, v_primera
  from (select x.id from public.asignaciones x
        where x.anunciante_id = p_anunciante_id and (p_campana_id is null or x.campana_id = p_campana_id)
          and x.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA') and x.factura_id is null
          and x.verificada_at < private.inicio_dia(p_periodo_hasta + 1)
        order by x.id for update) b
  join public.asignaciones a on a.id = b.id
  join public.asignacion_montos m on m.asignacion_id = a.id;
  if v_ids is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'No hay asignaciones verificadas sin facturar hasta esa fecha.', hint = 'sin_asignaciones';
  end if;
  v_base := case v_esquema when 'MANDATO' then v_comision else v_bruto end;
  insert into public.facturas (anunciante_id, campana_id, periodo_desde, periodo_hasta, esquema, porcentaje_iva,
                               subtotal, iva, valor_terceros)
  values (p_anunciante_id, p_campana_id, least(p_periodo_desde, v_primera), p_periodo_hasta, v_esquema, v_pct, v_base,
          round(v_base * v_pct, 2), case v_esquema when 'MANDATO' then v_medio else 0 end)
  returning id into v_id;
  update public.asignaciones a set factura_id = v_id where a.id = any (v_ids);
  return v_id;
end $$;
revoke all on function public.generar_factura_srv(uuid, uuid, date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.generar_factura_srv(uuid, uuid, date, date, uuid, uuid) to service_role;

-- LIQ-008: registra la factura que se expidió en el software de AMO (número dentro de su resolución de facturación,
-- CUFE, fecha, vencimiento y PDF). El valor debe ser el del borrador.
create function public.registrar_factura_expedida_srv(p_factura_id uuid, p_prefijo text, p_consecutivo bigint,
  p_cufe text, p_fecha_emision date, p_fecha_vencimiento date, p_total numeric, p_archivo_path text,
  p_actor_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; f public.facturas; v_res uuid; v_vence date; v_prefijo text := upper(coalesce(btrim(p_prefijo), ''));
  v_cufe text := lower(btrim(p_cufe)); v_r jsonb;
begin
  v_tipo := private.validar_actor(p_actor_id, 'facturas.gestionar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  select * into f from public.facturas x where x.id = p_factura_id for update;
  if f.id is null or f.estado <> 'BORRADOR' then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Solo se registra la expedición de una factura en borrador.';
  end if;
  if not exists (select 1 from public.asignaciones a where a.factura_id = f.id)
     or exists (select 1 from public.asignaciones a where a.factura_id = f.id
                and a.estado not in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Alguna asignación del borrador ya no está verificada (en disputa o cancelada): anúlalo y genéralo de nuevo.',
      hint = 'borrador_desactualizado';
  end if;
  if p_total is distinct from f.total then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El valor de la factura expedida no coincide con el del borrador.', hint = 'total_distinto';
  end if;
  if p_consecutivo is null or p_fecha_emision is null or p_fecha_emision > private.hoy() then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Indica el número y una fecha de emisión que no sea futura.';
  end if;
  if v_cufe is null or v_cufe !~ '^[0-9a-f]{96}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El CUFE son 96 caracteres hexadecimales, como lo muestra el software de facturación.', hint = 'cufe_formato';
  end if;
  select r.id into v_res from public.resoluciones_dian r
  where r.tipo = 'FACTURA_VENTA' and r.prefijo = v_prefijo and p_consecutivo between r.rango_desde and r.rango_hasta
    and p_fecha_emision between r.vigente_desde and coalesce(r.vigente_hasta, 'infinity'::date)
  for update;
  if v_res is null then
    raise exception using errcode = 'P0001', message = 'AMO_RESOLUCION_AGOTADA',
      detail = 'El número no pertenece a una resolución de facturación vigente en la fecha de emisión.';
  end if;
  if exists (select 1 from public.facturas x where x.resolucion_id = v_res and x.consecutivo = p_consecutivo)
     or exists (select 1 from public.facturas x where x.cufe = v_cufe) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Ese número o ese CUFE ya están registrados en otra factura.';
  end if;
  if not private.soporte_cargado(p_archivo_path, 'factura/' || f.id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Carga el PDF de la factura expedida.', hint = 'archivo_no_cargado';
  end if;
  v_vence := coalesce(p_fecha_vencimiento, p_fecha_emision + private.config_entero('facturacion.dias_vencimiento'));
  if v_vence < p_fecha_emision then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El vencimiento no puede ser anterior a la emisión.';
  end if;
  update public.resoluciones_dian r set consecutivo_actual = greatest(r.consecutivo_actual, p_consecutivo) where r.id = v_res;
  v_r := private.aplicar_transicion('facturas', f.id, 'EMITIDA', 'ADMIN', p_actor_id, null,
           jsonb_build_object('resolucion_id', v_res, 'prefijo', v_prefijo, 'consecutivo', p_consecutivo,
                              'fecha_emision', p_fecha_emision, 'fecha_vencimiento', v_vence));
  update public.facturas x set cufe = v_cufe, archivo_path = p_archivo_path where x.id = f.id;
  return v_r || jsonb_build_object('numero', v_prefijo || p_consecutivo::text, 'fecha_vencimiento', v_vence);
end $$;
revoke all on function public.registrar_factura_expedida_srv(uuid, text, bigint, text, date, date, numeric, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_factura_expedida_srv(uuid, text, bigint, text, date, date, numeric, text, uuid, uuid)
  to service_role;
create unique index facturas_cufe_key on public.facturas (cufe) where cufe is not null;

-- D38 del RF: nota crédito sobre una factura expedida con saldo. Si cubre todo el saldo de una factura sin pagos, la
-- factura queda ANULADA (fuera de la cartera); si es parcial rebaja el saldo y libera las asignaciones indicadas.
create function public.registrar_nota_credito_srv(p_factura_id uuid, p_numero text, p_cude text, p_fecha_emision date,
  p_valor numeric, p_motivo text, p_archivo_path text, p_asignacion_ids uuid[], p_actor_id uuid, p_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; f public.facturas; v_id uuid; v_anula boolean; v_numero text := upper(btrim(p_numero));
  v_cude text := lower(btrim(p_cude)); v_motivo text := btrim(p_motivo);
begin
  v_tipo := private.validar_actor(p_actor_id, 'facturas.gestionar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  select * into f from public.facturas x where x.id = p_factura_id for update;
  if f.id is null or f.estado not in ('EMITIDA', 'PAGADA_PARCIAL', 'VENCIDA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La nota crédito aplica a una factura expedida con saldo.';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > f.saldo then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El valor de la nota crédito debe ser positivo y no superar el saldo de la factura.';
  end if;
  if v_numero is null or v_numero !~ '^[A-Z0-9][A-Z0-9 -]{0,39}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Indica el número de la nota crédito.';
  end if;
  if v_cude is null or v_cude !~ '^[0-9a-f]{96}$' then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El CUDE son 96 caracteres hexadecimales, como lo muestra el software de facturación.', hint = 'cude_formato';
  end if;
  if v_motivo is null or char_length(v_motivo) not between 10 and 1000 then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica el motivo de la nota crédito.';
  end if;
  if p_fecha_emision is null or p_fecha_emision < f.fecha_emision or p_fecha_emision > private.hoy() then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La fecha de la nota crédito va entre la emisión de la factura y hoy.';
  end if;
  if exists (select 1 from public.notas_credito n where n.numero = v_numero or n.cude = v_cude) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Ese número o ese CUDE ya están registrados en otra nota crédito.';
  end if;
  if exists (select 1 from unnest(coalesce(p_asignacion_ids, '{}')) x (id)
             where not exists (select 1 from public.asignaciones a where a.id = x.id and a.factura_id = f.id)) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Alguna asignación indicada no pertenece a la factura.';
  end if;
  if not private.soporte_cargado(p_archivo_path, 'factura/' || f.id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Carga el PDF de la nota crédito.', hint = 'archivo_no_cargado';
  end if;
  v_anula := f.pagado = 0 and p_valor = f.saldo;
  insert into public.notas_credito (factura_id, anunciante_id, numero, cude, fecha_emision, valor, anula_factura, motivo,
                                    archivo_path, registrado_por, es_demo)
  values (f.id, f.anunciante_id, v_numero, v_cude, p_fecha_emision, p_valor, v_anula, v_motivo, p_archivo_path, p_actor_id,
          f.es_demo)
  returning id into v_id;
  update public.facturas x set valor_notas_credito = x.valor_notas_credito + p_valor where x.id = f.id returning * into f;
  if v_anula then
    perform private.aplicar_transicion('facturas', f.id, 'ANULADA', 'ADMIN', p_actor_id,
                                       left('Nota crédito ' || v_numero || ': ' || v_motivo, 1000));
    perform private.notificar(private.usuarios_anunciante(f.anunciante_id), 'factura.anulada',
      jsonb_build_object('numero', f.numero, 'nota', v_numero), 'facturas', f.id::text, null, 1::smallint);
  else
    if f.saldo = 0 then
      perform private.aplicar_transicion('facturas', f.id, 'PAGADA', 'SISTEMA', null);
    end if;
    update public.asignaciones a set factura_id = null where a.factura_id = f.id and a.id = any (coalesce(p_asignacion_ids, '{}'));
    perform private.notificar(private.usuarios_anunciante(f.anunciante_id), 'factura.nota_credito',
      jsonb_build_object('nota', v_numero, 'valor', private.formato_cop(p_valor), 'numero', f.numero,
                         'saldo', private.formato_cop(f.saldo)),
      'facturas', f.id::text, null, 1::smallint);
  end if;
  return v_id;
end $$;
revoke all on function public.registrar_nota_credito_srv(uuid, text, text, date, numeric, text, text, uuid[], uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_nota_credito_srv(uuid, text, text, date, numeric, text, text, uuid[], uuid, uuid)
  to service_role;

drop function public.registrar_pago_anunciante_srv(uuid, date, numeric, text, text, text, uuid, uuid);

-- LIQ-008: pago parcial o total con su soporte; las retenciones que practicó el anunciante cuentan para el saldo.
create function public.registrar_pago_anunciante_srv(p_factura_id uuid, p_fecha date, p_monto numeric, p_medio_pago text,
  p_referencia text, p_soporte_path text, p_actor_id uuid, p_session_id uuid, p_retenciones numeric default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_tipo public.rol_tipo; f public.facturas; v_id uuid; v_ret numeric := coalesce(p_retenciones, 0);
begin
  v_tipo := private.validar_actor(p_actor_id, 'pagos.registrar', p_session_id);
  if v_tipo is distinct from 'ADMIN' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform set_config('lock_timeout', '3s', true);
  select * into f from public.facturas x where x.id = p_factura_id for update;
  if f.id is null or f.estado not in ('EMITIDA', 'PAGADA_PARCIAL', 'VENCIDA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La factura no admite pagos en su estado actual.';
  end if;
  if p_monto is null or p_monto < 0 or v_ret < 0 or p_monto + v_ret <= 0 or p_monto + v_ret > f.saldo then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'El pago más las retenciones debe ser positivo y no superar el saldo de la factura.', hint = 'monto_invalido';
  end if;
  if p_fecha is null or p_fecha > private.hoy() or p_fecha < f.fecha_emision then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La fecha del pago va entre la emisión de la factura y hoy.', hint = 'fecha_pago';
  end if;
  if not private.soporte_cargado(p_soporte_path, 'pago/' || f.id::text || '/') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Carga el soporte del pago.', hint = 'soporte_no_cargado';
  end if;
  insert into public.pagos_anunciante (factura_id, anunciante_id, fecha_pago, monto, valor_retenciones, medio_pago, referencia,
                                       soporte_path, registrado_por, es_demo)
  values (f.id, f.anunciante_id, p_fecha, p_monto, v_ret, p_medio_pago, nullif(btrim(p_referencia), ''), p_soporte_path,
          p_actor_id, f.es_demo)
  returning id into v_id;
  update public.facturas x set pagado = x.pagado + p_monto + v_ret where x.id = f.id returning * into f;
  if f.saldo = 0 then
    perform private.aplicar_transicion('facturas', f.id, 'PAGADA', 'SISTEMA', null);
  elsif f.estado in ('EMITIDA', 'VENCIDA') then
    perform private.aplicar_transicion('facturas', f.id, 'PAGADA_PARCIAL', 'SISTEMA', null);
  end if;
  return v_id;
end $$;
revoke all on function public.registrar_pago_anunciante_srv(uuid, date, numeric, text, text, text, uuid, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.registrar_pago_anunciante_srv(uuid, date, numeric, text, text, text, uuid, uuid, numeric)
  to service_role;

-- ANU-013: el anunciante no descarga archivos de un borrador.
CREATE OR REPLACE FUNCTION private.soy_dueno_soporte(p_tipo text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case p_tipo
    when 'liquidacion' then (select private.tiene_permiso('liquidaciones.ver_propias'))
      and exists (select 1 from public.liquidaciones l where l.id = p_id and l.medio_id = (select private.mi_medio_id()))
    when 'documento_soporte' then (select private.tiene_permiso('liquidaciones.ver_propias'))
      and exists (select 1 from public.documentos_soporte ds join public.liquidaciones l on l.id = ds.liquidacion_id
                  where ds.id = p_id and l.medio_id = (select private.mi_medio_id()))
    when 'factura' then (select private.tiene_permiso('facturas.ver_propias'))
      and exists (select 1 from public.facturas f where f.id = p_id and f.anunciante_id = (select private.mi_anunciante_id())
                    and f.consecutivo is not null)
    when 'pago' then (select private.tiene_permiso('facturas.ver_propias'))
      and exists (select 1 from public.facturas f where f.id = p_id and f.anunciante_id = (select private.mi_anunciante_id())
                    and f.consecutivo is not null)
    else false end $function$;

-- 7. Reportes (ADM-004): notas crédito y retenciones del anunciante en la cartera y en lo facturado ----------------
CREATE OR REPLACE FUNCTION public.reporte_cartera(p_corte date)
 RETURNS TABLE(anunciante_id uuid, anunciante text, facturado numeric, pagado numeric, saldo numeric, saldo_0_30 numeric, saldo_31_60 numeric, saldo_61_90 numeric, saldo_90_mas numeric, facturas_vencidas integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET "TimeZone" TO 'America/Bogota'
AS $function$
begin
  perform private.exigir_permiso('reportes.finanzas');
  if p_corte is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Indica la fecha de corte.';
  end if;
  return query
  with f as (
    select x.id, x.anunciante_id as aid,
           x.total - coalesce((select sum(n.valor) from public.notas_credito n
                               where n.factura_id = x.id and n.fecha_emision <= p_corte), 0) as total,
           x.fecha_vencimiento,
           coalesce((select sum(pg.monto + pg.valor_retenciones) from public.pagos_anunciante pg
                     where pg.factura_id = x.id and pg.fecha_pago <= p_corte), 0) as pagos
    from public.facturas x
    -- Las anuladas con nota crédito cuentan hasta la fecha de la nota (un borrador anulado no tiene fecha de emisión).
    where x.fecha_emision <= p_corte and x.estado <> 'BORRADOR'
  ), s as (
    select f.*, greatest(f.total - f.pagos, 0) as sal, p_corte - f.fecha_vencimiento as mora from f
  )
  select s.aid, an.nombre_comercial, sum(s.total), sum(s.pagos), sum(s.sal),
         coalesce(sum(s.sal) filter (where s.mora is null or s.mora <= 30), 0),
         coalesce(sum(s.sal) filter (where s.mora between 31 and 60), 0),
         coalesce(sum(s.sal) filter (where s.mora between 61 and 90), 0),
         coalesce(sum(s.sal) filter (where s.mora > 90), 0),
         (count(*) filter (where s.sal > 0 and s.fecha_vencimiento < p_corte))::integer
  from s
  left join public.anunciantes an on an.id = s.aid
  group by s.aid, an.nombre_comercial
  having sum(s.sal) > 0
  order by sum(s.sal) desc, an.nombre_comercial;
end $function$;

CREATE OR REPLACE FUNCTION public.reporte_finanzas(p_desde date, p_hasta date, p_agrupacion text)
 RETURNS TABLE(grupo_id text, grupo text, gmv_comprometido numeric, gmv_verificado numeric, comision numeric, take_rate numeric, pagado_medios numeric, facturado numeric, recaudado numeric, cartera numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET "TimeZone" TO 'America/Bogota'
AS $function$
declare g record;
begin
  perform private.exigir_permiso('reportes.finanzas');
  if p_agrupacion is null or p_agrupacion not in ('anunciante', 'sector', 'mes') then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La agrupación debe ser anunciante, sector o mes.';
  end if;
  select * into g from private.rango_kpi(p_desde, p_hasta);
  return query
  with meses as (
    select m::date as mes from generate_series(date_trunc('month', p_desde::timestamp), p_hasta::timestamp, interval '1 month') m
  ), cortes as (
    select case when p_agrupacion = 'mes' then least((ms.mes + interval '1 month' - interval '1 day')::date, p_hasta)
                else p_hasta end as corte
    from meses ms
    where p_agrupacion = 'mes' or ms.mes = (select min(x.mes) from meses x)
  ), hechos (anunciante_id, fecha, metrica, valor) as (
    select a.anunciante_id, a.aceptada_at::date, 'gmv_comprometido', a.monto_bruto
    from public.asignaciones a
    where a.aceptada_at >= g.ini and a.aceptada_at < g.fin and private.consume_cupo(a.estado, a.estado_previo_disputa)
    union all
    select a.anunciante_id, a.verificada_at::date, k.metrica,
           case when k.metrica = 'gmv_verificado' then a.monto_bruto else am.monto_comision end
    from public.asignaciones a
    left join public.asignacion_montos am on am.asignacion_id = a.id
    cross join (values ('gmv_verificado'), ('comision')) k (metrica)
    where a.verificada_at >= g.ini and a.verificada_at < g.fin and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA')
    union all
    select a.anunciante_id, a.pagada_at::date, 'pagado_medios', am.monto_neto
    from public.asignaciones a
    join public.asignacion_montos am on am.asignacion_id = a.id
    where a.estado = 'PAGADA' and a.pagada_at >= g.ini and a.pagada_at < g.fin
    union all
    select f.anunciante_id, f.fecha_emision, 'facturado', f.total
    from public.facturas f
    where f.fecha_emision between p_desde and p_hasta and f.estado <> 'BORRADOR'
    union all
    select n.anunciante_id, n.fecha_emision, 'facturado', -n.valor
    from public.notas_credito n
    where n.fecha_emision between p_desde and p_hasta
    union all
    select pg.anunciante_id, pg.fecha_pago, 'recaudado', pg.monto
    from public.pagos_anunciante pg
    where pg.fecha_pago between p_desde and p_hasta
    union all
    select f.anunciante_id, c.corte, 'cartera',
           greatest(f.total - coalesce((select sum(pg.monto + pg.valor_retenciones) from public.pagos_anunciante pg
                                        where pg.factura_id = f.id and pg.fecha_pago <= c.corte), 0)
                    - coalesce((select sum(n.valor) from public.notas_credito n
                                where n.factura_id = f.id and n.fecha_emision <= c.corte), 0), 0)
    from cortes c
    join public.facturas f on f.fecha_emision <= c.corte and f.estado <> 'BORRADOR'
    union all
    select null::uuid, ms.mes, 'facturado', 0 from meses ms where p_agrupacion = 'mes'
  ), agrupado as (
    select case p_agrupacion
             when 'anunciante' then h.anunciante_id::text
             when 'sector' then an.sector_id::text
             else to_char(date_trunc('month', h.fecha::timestamp), 'YYYY-MM') end as gid,
           case p_agrupacion
             when 'anunciante' then an.nombre_comercial
             when 'sector' then se.nombre
             else (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
                         'noviembre', 'diciembre'])[extract(month from h.fecha)::integer] || ' ' || extract(year from h.fecha)::integer
           end as gnombre,
           h.metrica, h.valor
    from hechos h
    left join public.anunciantes an on an.id = h.anunciante_id
    left join public.sectores se on se.id = an.sector_id
  )
  select x.gid, max(x.gnombre),
         coalesce(sum(x.valor) filter (where x.metrica = 'gmv_comprometido'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'gmv_verificado'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'comision'), 0),
         round(sum(x.valor) filter (where x.metrica = 'comision')
               / nullif(sum(x.valor) filter (where x.metrica = 'gmv_verificado'), 0), 6),
         coalesce(sum(x.valor) filter (where x.metrica = 'pagado_medios'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'facturado'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'recaudado'), 0),
         coalesce(sum(x.valor) filter (where x.metrica = 'cartera'), 0)
  from agrupado x
  where x.gid is not null
  group by x.gid
  order by case when p_agrupacion = 'mes' then x.gid end,
           coalesce(sum(x.valor) filter (where x.metrica = 'gmv_verificado'), 0) desc, x.gid;
end $function$;

-- 8. Condiciones de transición, transicionar_srv, purga demo y lista blanca ---------------------------------------
CREATE OR REPLACE FUNCTION private.validar_condicion_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text, p_actor_tipo transicion_actor, p_actor_id uuid, p_motivo text, p_datos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_clave text := p_entidad || ':' || p_desde || '→' || p_hacia; r record; v_dest text; v_previo text;
  v_n integer; v_suma numeric; v_fuera integer; v_alerta boolean; v_soporte text; v_fecha date;
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
      select l.creada_por, l.alerta_seg_social, l.medio_id, l.periodo_fin, l.monto_medio into r
      from public.liquidaciones l where l.id = p_id;
      if r.creada_por = p_actor_id
         and not exists (select 1 from public.perfiles p join public.roles ro on ro.id = p.rol_id
                         where p.id = p_actor_id and ro.clave = 'SUPERADMIN') then
        raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
          detail = 'Quien genera una liquidación no puede aprobarla.';
      end if;
      -- LIQ-007: la alerta se reevalúa al aprobar (el medio pudo cargar su seguridad social o sumar otra liquidación).
      v_alerta := private.seg_social_pendiente(r.medio_id, r.periodo_fin, r.monto_medio, p_id);
      if v_alerta is distinct from r.alerta_seg_social then
        update public.liquidaciones l set alerta_seg_social = v_alerta where l.id = p_id;
      end if;
      if v_alerta and private.config_texto('tributario.politica_seg_social') = 'BLOQUEAR' then
        raise exception using errcode = 'P0001', message = 'AMO_SEG_SOCIAL_PENDIENTE',
          detail = 'El medio supera el umbral mensual y no tiene la seguridad social aprobada.';
      end if;
    when v_clave = 'liquidaciones:APROBADA→PAGADA' then
      select l.soporte_pago_path, l.fecha_pago, l.requiere_documento_soporte, l.numero_factura_medio, l.factura_medio_path,
             l.created_at
        into r from public.liquidaciones l where l.id = p_id;
      v_soporte := coalesce(p_datos ->> 'soporte_pago_path', r.soporte_pago_path);
      v_fecha := coalesce((p_datos ->> 'fecha_pago')::date, r.fecha_pago);
      if v_soporte is null or v_fecha is null then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'Registra la fecha y el soporte del pago.';
      end if;
      -- LIQ-006: el soporte ya está en Storage y la fecha va entre la generación de la liquidación y hoy.
      if v_fecha > private.hoy() or v_fecha < (r.created_at at time zone 'America/Bogota')::date then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'La fecha del pago va entre la generación de la liquidación y hoy.', hint = 'fecha_pago';
      end if;
      if not private.soporte_cargado(v_soporte, 'liquidacion/' || p_id::text || '/') then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'El soporte del pago no está cargado: súbelo de nuevo.', hint = 'soporte_no_cargado';
      end if;
      if r.requiere_documento_soporte then
        if not exists (select 1 from public.documentos_soporte d where d.liquidacion_id = p_id and d.estado = 'EMITIDO') then
          raise exception using errcode = 'P0001', message = 'AMO_DOCUMENTO_SOPORTE_REQUERIDO',
            detail = 'Emite el documento soporte antes de registrar el pago.';
        end if;
      elsif r.numero_factura_medio is null or r.factura_medio_path is null
            or not private.soporte_cargado(r.factura_medio_path, 'liquidacion/' || p_id::text || '/') then
        raise exception using errcode = 'P0001', message = 'AMO_DOCUMENTO_SOPORTE_REQUERIDO',
          detail = 'Registra el número y el archivo de la factura del medio.';
      end if;
    when v_clave in ('liquidaciones:BORRADOR→ANULADA', 'liquidaciones:APROBADA→ANULADA',
                     'documentos_soporte:EMITIDO→ANULADO') then
      -- D38 del RF: un documento soporte transmitido (con CUDS) se corrige con nota de ajuste antes de anularlo.
      if exists (select 1 from public.documentos_soporte d
                 where (case p_entidad when 'liquidaciones' then d.liquidacion_id else d.id end) = p_id
                   and d.estado = 'EMITIDO' and d.cuds is not null and d.nota_ajuste_numero is null) then
        raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
          detail = 'El documento soporte ya se transmitió a la DIAN: registra su nota de ajuste antes de anular.',
          hint = 'requiere_nota_ajuste';
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
      if exists (select 1 from public.metricas m
                 where m.id = p_id and (m.alerta_desviacion or m.alerta_multiplo or m.detalle_alertas ? 'alerta_previa'))
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

-- D38 del RF: una factura expedida solo se anula con su nota crédito (registrar_nota_credito_srv).
CREATE OR REPLACE FUNCTION public.transicionar_srv(p_entidad text, p_id uuid, p_hacia text, p_actor_id uuid, p_session_id uuid, p_motivo text DEFAULT NULL::text, p_datos jsonb DEFAULT '{}'::jsonb)
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
                          'facturas:EMITIDA→ANULADA', 'facturas:VENCIDA→ANULADA',
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

CREATE OR REPLACE FUNCTION private.purgar_demo()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  delete from public.notas_credito n where n.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('notas_credito', v_n);
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
  -- Los cupos se borran en cascada con la oferta: borrarlos antes deja ofertas.cupos_totales por debajo de
  -- cupos_ocupados (trg_oferta_cupos_z_total + CHECK ofertas_cupos_ocupados_chk) en toda oferta con cupos ocupados.
  select count(*) into v_n from public.oferta_cupos oc where oc.oferta_id = any (v_ofe);
  r := r || jsonb_build_object('oferta_cupos', v_n);
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
               'alertas_metricas_por_medio', 'puedo_subir_metrica_en_disputa',
               -- E3 fase 5
               'puedo_subir_factura_medio']::text[]
$$;
