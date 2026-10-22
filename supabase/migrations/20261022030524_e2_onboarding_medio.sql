-- E2 · Alta y verificación (docs/modelo-datos.md §3.6, §4.2, §5.3; requisitos AUT-012, MED-001, MED-003, MED-004,
-- ADM-001 y ADM-003).
--
-- 1) AUT-012: `public.terminos_pendientes()` lista las versiones vigentes que el usuario externo aún no aceptó
--    (términos de su tipo, política de datos y condiciones comerciales); la compuerta del DAL la consulta.
-- 2) MED-001: cola `solicitudes_vinculacion` del formulario público. Solo la escribe el servidor
--    (`crear_solicitud_vinculacion_srv`, con límite por IP y duplicados absorbidos en silencio para no revelar si un
--    correo existe) y la resuelve el equipo AMO (`resolver_solicitud_vinculacion_srv`). Es una cola de entrada, no
--    una entidad del negocio: su ciclo PENDIENTE → INVITADA | DESCARTADA lo impone la RPC (decisión en §11).
-- 3) MED-004: `guardar_datos_pago_medio_srv` para que el medio (o un interno con `datos_sensibles.editar`) guarde su
--    condición tributaria y los datos de pago ya cifrados por el servidor (AES-256-GCM, src/lib/cifrado.ts); las
--    columnas cifradas no tienen GRANT. El CHECK del cifrado admite cualquier versión de llave (`v<n>:`) y base64 o
--    base64url. Un cambio en los datos de pago avisa a quienes verifican medios (sin el valor).
-- 4) MED-003: la prueba de vida puede verificarse por videollamada sin guardar imagen
--    (`documentos_medio.metodo = 'VIDEOLLAMADA'`, `registrar_verificacion_videollamada_srv`), y al aprobar un documento
--    se puede fijar su `fecha_vencimiento` (`p_datos.fecha_vencimiento` en `aplicar_transicion`).
-- 5) ADM-003: un anunciante colombiano solo pasa a VERIFICADO con RUT y Cámara de Comercio aprobados y vigentes; uno
--    extranjero, con al menos un documento aprobado.

-- 0. Utilidades para avisar a las colas internas -------------------------------------------------------------------

-- Usuarios internos activos cuyo rol tiene el permiso (los SUPERADMIN lo tienen todo).
create function private.usuarios_con_permiso(p_permiso text) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id order by p.id), '{}') from public.perfiles p
  join public.roles r on r.id = p.rol_id
  join public.rol_permisos rp on rp.rol_id = p.rol_id and rp.permiso_clave = p_permiso
  where r.tipo = 'ADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null $$;
revoke all on function private.usuarios_con_permiso(text) from public, anon, authenticated, service_role;

-- Aviso a una cola de trabajo interna: a cada usuario con el permiso, una sola vez por (tipo, entidad) cada 12 horas
-- (una ráfaga de cargas del mismo medio no inunda la campana).
create function private.notificar_cola(p_permiso text, p_tipo text, p_datos jsonb, p_entidad text, p_entidad_id text,
                                       p_prioridad smallint default 0)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_destinos uuid[];
begin
  if private.modo_carga() then return 0; end if;
  select coalesce(array_agg(u.id), '{}') into v_destinos
  from unnest(private.usuarios_con_permiso(p_permiso)) u (id)
  where not exists (select 1 from public.notificaciones n
                    where n.tipo = p_tipo and n.entidad_id = p_entidad_id and n.usuario_id = u.id
                      and n.created_at > private.ahora() - interval '12 hours');
  return private.notificar(v_destinos, p_tipo, p_datos, p_entidad, p_entidad_id, null, p_prioridad);
end $$;
revoke all on function private.notificar_cola(text, text, jsonb, text, text, smallint)
  from public, anon, authenticated, service_role;

-- 1. AUT-012 · Términos pendientes ----------------------------------------------------------------------------------

create function public.terminos_pendientes()
returns table (id uuid, tipo public.terminos_tipo, version text, vigente_desde timestamptz, hash_sha256 text,
               contenido_md text)
language sql stable security definer set search_path = '' as $$
  with yo as (
    select p.id, r.tipo from public.perfiles p join public.roles r on r.id = p.rol_id
    where p.id = (select auth.uid()) and p.estado = 'ACTIVO' and p.deleted_at is null
      and (select private.acceso_valido())
  ), exigidos as (
    select yo.id as perfil_id, x.tipo
    from yo cross join lateral unnest(case yo.tipo
      when 'MEDIO' then array['TERMINOS_MEDIO', 'POLITICA_DATOS', 'CONDICIONES_COMERCIALES']::public.terminos_tipo[]
      when 'ANUNCIANTE' then array['TERMINOS_ANUNCIANTE', 'POLITICA_DATOS', 'CONDICIONES_COMERCIALES']::public.terminos_tipo[]
      else '{}'::public.terminos_tipo[] end) as x (tipo)
  ), vigentes as (
    select distinct on (t.tipo) t.id, t.tipo, t.version, t.vigente_desde, t.hash_sha256, t.contenido_md
    from public.terminos_versiones t
    where t.publicada and t.vigente_desde <= private.ahora()
    order by t.tipo, t.vigente_desde desc, t.created_at desc
  )
  select v.id, v.tipo, v.version, v.vigente_desde, v.hash_sha256, v.contenido_md
  from exigidos e join vigentes v on v.tipo = e.tipo
  where not exists (select 1 from public.aceptaciones_terminos a
                    where a.perfil_id = e.perfil_id and a.termino_version_id = v.id)
  order by v.tipo $$;
revoke all on function public.terminos_pendientes() from public, anon;
grant execute on function public.terminos_pendientes() to authenticated;

-- 2. MED-001 · Solicitudes de vinculación ---------------------------------------------------------------------------

create type public.solicitud_vinculacion_estado as enum ('PENDIENTE', 'INVITADA', 'DESCARTADA');

-- Cuentas declaradas: 1 a 6 objetos {plataforma, usuario, seguidores?}.
create function private.cuentas_solicitud_validas(p_cuentas jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_cuentas) = 'array'
     and jsonb_array_length(p_cuentas) between 1 and 6
     and not exists (
       select 1 from jsonb_array_elements(p_cuentas) c
       where jsonb_typeof(c) <> 'object'
          or coalesce(c ->> 'plataforma', '') not in ('FACEBOOK', 'INSTAGRAM', 'TIKTOK')
          or char_length(coalesce(c ->> 'usuario', '')) not between 1 and 120
          or (c ? 'seguidores' and case when jsonb_typeof(c -> 'seguidores') <> 'number' then true
                                        else (c ->> 'seguidores')::numeric not between 0 and 1000000000 end)) $$;
revoke all on function private.cuentas_solicitud_validas(jsonb) from public, anon, authenticated;

create table public.solicitudes_vinculacion (
  id uuid primary key default private.uuid_v7(),
  nombre_medio text not null constraint solicitudes_vinculacion_nombre_medio_chk check (char_length(nombre_medio) between 2 and 120),
  tipo public.medio_tipo,
  contacto_nombre text not null
    constraint solicitudes_vinculacion_contacto_nombre_chk check (char_length(contacto_nombre) between 2 and 120),
  email extensions.citext not null
    constraint solicitudes_vinculacion_email_chk check (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                                                        and char_length(email::text) <= 254),
  celular text constraint solicitudes_vinculacion_celular_chk check (celular ~ '^\+?[0-9 ]{7,20}$'),
  municipio_codigo char(5) not null references public.municipios (codigo),
  cuentas jsonb not null constraint solicitudes_vinculacion_cuentas_chk
    check (private.cuentas_solicitud_validas(cuentas) and pg_column_size(cuentas) < 4096),
  mensaje text constraint solicitudes_vinculacion_mensaje_chk check (char_length(mensaje) <= 1000),
  autoriza_datos boolean not null constraint solicitudes_vinculacion_autoriza_chk check (autoriza_datos),  -- Ley 1581
  estado public.solicitud_vinculacion_estado not null default 'PENDIENTE',
  medio_id uuid references public.medios (id) on delete set null,
  resuelta_por uuid references public.perfiles (id) on delete set null,
  resuelta_at timestamptz,
  motivo_descarte text constraint solicitudes_vinculacion_motivo_chk check (char_length(motivo_descarte) <= 500),
  ip_hash text constraint solicitudes_vinculacion_ip_hash_chk check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint solicitudes_vinculacion_resuelta_chk check ((estado = 'PENDIENTE') = (resuelta_at is null)),
  constraint solicitudes_vinculacion_descartada_chk check (estado <> 'DESCARTADA' or motivo_descarte is not null)
);
create index solicitudes_vinculacion_pendientes_idx on public.solicitudes_vinculacion (created_at)
  where estado = 'PENDIENTE';
create index solicitudes_vinculacion_email_idx on public.solicitudes_vinculacion (email);
create index solicitudes_vinculacion_ip_idx on public.solicitudes_vinculacion (ip_hash, created_at desc);
create index solicitudes_vinculacion_municipio_idx on public.solicitudes_vinculacion (municipio_codigo);
create index solicitudes_vinculacion_medio_idx on public.solicitudes_vinculacion (medio_id);
create index solicitudes_vinculacion_resuelta_por_idx on public.solicitudes_vinculacion (resuelta_por);

create trigger trg_solicitudes_vinculacion_m_updated_at before update on public.solicitudes_vinculacion
  for each row execute function private.fn_set_updated_at();
create trigger trg_solicitudes_vinculacion_z_auditar after insert or update or delete on public.solicitudes_vinculacion
  for each row execute function private.fn_auditar('id');
insert into private.auditoria_columnas (tabla, columna, tratamiento) values
  ('solicitudes_vinculacion', 'email', 'ENMASCARAR'),
  ('solicitudes_vinculacion', 'celular', 'ENMASCARAR'),
  ('solicitudes_vinculacion', 'contacto_nombre', 'ENMASCARAR'),
  ('solicitudes_vinculacion', 'ip_hash', 'OMITIR')
on conflict (tabla, columna) do update set tratamiento = excluded.tratamiento;

alter table public.solicitudes_vinculacion enable row level security;
create policy "solicitudes_vinculacion: acceso válido" on public.solicitudes_vinculacion as restrictive for all
  to authenticated using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "solicitudes_vinculacion: select interno" on public.solicitudes_vinculacion for select to authenticated
  using ((select private.tiene_permiso('medios.verificar')));
grant select on public.solicitudes_vinculacion to authenticated;
grant select, insert, update, delete on public.solicitudes_vinculacion to service_role;

insert into public.configuracion
  (clave, valor, tipo, minimo, maximo, opciones, modulo, descripcion, unidad, es_publica, pendiente_validacion) values
  ('vinculacion.max_solicitudes_ip_dia', '5', 'ENTERO', 1, 100, null, 'medios',
   'Solicitudes de vinculación que acepta el formulario público desde una misma conexión en 24 horas.',
   'solicitudes', false, false)
on conflict (clave) do nothing;

-- Solo la usa la Server Action pública (service_role, contexto confiable). Respuesta siempre genérica: un correo que
-- ya tiene cuenta o una solicitud pendiente se absorbe sin error para no revelar nada.
create function public.crear_solicitud_vinculacion_srv(p_datos jsonb, p_ip_hash text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_datos ->> 'email', '')));
  v_max integer := coalesce(private.config_entero('vinculacion.max_solicitudes_ip_dia'), 5);
  v_id uuid;
  v_municipio text;
begin
  if p_ip_hash is not null and (select count(*) from public.solicitudes_vinculacion s
                                where s.ip_hash = p_ip_hash and s.created_at > private.ahora() - interval '24 hours') >= v_max then
    raise exception using errcode = 'P0001', message = 'AMO_LIMITE_SOLICITUDES',
      detail = 'Recibimos varias solicitudes desde tu conexión. Intenta de nuevo mañana.';
  end if;
  if not exists (select 1 from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                 where m.codigo = p_datos ->> 'municipio_codigo' and m.activo and d.activo) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Elige un municipio habilitado en AMO.';
  end if;
  if exists (select 1 from public.solicitudes_vinculacion s where s.email = v_email::extensions.citext and s.estado = 'PENDIENTE')
     or exists (select 1 from public.perfiles p where lower(p.email::text) = v_email) then
    return;
  end if;
  insert into public.solicitudes_vinculacion (nombre_medio, tipo, contacto_nombre, email, celular, municipio_codigo, cuentas,
                                              mensaje, autoriza_datos, ip_hash)
  values (btrim(p_datos ->> 'nombre_medio'), nullif(p_datos ->> 'tipo', '')::public.medio_tipo, btrim(p_datos ->> 'contacto_nombre'),
          v_email, nullif(btrim(coalesce(p_datos ->> 'celular', '')), ''), p_datos ->> 'municipio_codigo',
          coalesce(p_datos -> 'cuentas', '[]'), nullif(btrim(coalesce(p_datos ->> 'mensaje', '')), ''),
          coalesce((p_datos ->> 'autoriza_datos')::boolean, false), p_ip_hash)
  returning id into v_id;
  select m.nombre into v_municipio from public.municipios m where m.codigo = p_datos ->> 'municipio_codigo';
  perform private.notificar_cola('medios.verificar', 'cola.vinculacion',
    jsonb_build_object('medio', btrim(p_datos ->> 'nombre_medio'), 'municipio', coalesce(v_municipio, '—')),
    'solicitudes_vinculacion', v_id::text, 1::smallint);
end $$;
revoke all on function public.crear_solicitud_vinculacion_srv(jsonb, text) from public, anon, authenticated;
grant execute on function public.crear_solicitud_vinculacion_srv(jsonb, text) to service_role;

create function public.resolver_solicitud_vinculacion_srv(p_id uuid, p_actor_id uuid, p_session_id uuid, p_estado text,
                                                          p_medio_id uuid default null, p_motivo text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_estado public.solicitud_vinculacion_estado; v_motivo text := nullif(btrim(p_motivo), '');
begin
  perform private.validar_actor(p_actor_id, 'medios.verificar', p_session_id);
  select s.estado into v_estado from public.solicitudes_vinculacion s where s.id = p_id for update;
  if v_estado is null then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA', detail = 'La solicitud no existe.';
  end if;
  if v_estado <> 'PENDIENTE' or p_estado not in ('INVITADA', 'DESCARTADA') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'La solicitud ya fue atendida. Actualiza la página.';
  end if;
  if p_estado = 'INVITADA' and (p_medio_id is null or not exists (select 1 from public.medios m where m.id = p_medio_id)) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Registra el medio antes de marcar la solicitud como invitada.';
  end if;
  if p_estado = 'DESCARTADA' and v_motivo is null then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO', detail = 'Indica por qué se descarta la solicitud.';
  end if;
  update public.solicitudes_vinculacion
  set estado = p_estado::public.solicitud_vinculacion_estado, medio_id = case when p_estado = 'INVITADA' then p_medio_id end,
      motivo_descarte = case when p_estado = 'DESCARTADA' then v_motivo end,
      resuelta_por = p_actor_id, resuelta_at = private.ahora()
  where id = p_id;
end $$;
revoke all on function public.resolver_solicitud_vinculacion_srv(uuid, uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolver_solicitud_vinculacion_srv(uuid, uuid, uuid, text, uuid, text) to service_role;

-- 3. MED-004 · Datos de pago y condición tributaria -----------------------------------------------------------------

alter table public.medios_privado drop constraint medios_privado_numero_documento_cifrado_chk;
alter table public.medios_privado add constraint medios_privado_numero_documento_cifrado_chk
  check (numero_documento_cifrado ~ '^v[0-9]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+$');
alter table public.medios_privado drop constraint medios_privado_datos_pago_cifrados_chk;
alter table public.medios_privado add constraint medios_privado_datos_pago_cifrados_chk
  check (datos_pago_cifrados ~ '^v[0-9]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+$');
alter table public.medios_privado add constraint medios_privado_numero_documento_hash_chk
  check (numero_documento_hash ~ '^[0-9a-f]{64}$');
-- Mismo formato en perfiles_privado: sin esto, tras rotar a la llave k2 (prefijo v2) fallaría cada escritura.
alter table public.perfiles_privado drop constraint perfiles_privado_numero_documento_cifrado_chk;
alter table public.perfiles_privado add constraint perfiles_privado_numero_documento_cifrado_chk
  check (numero_documento_cifrado ~ '^v[0-9]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+:[A-Za-z0-9+/=_-]+$');
-- Método y resumen van juntos y no hay cuenta cifrada sin método. Que una escritura real lleve además la cuenta
-- cifrada lo exige el trigger siguiente (authenticated no tiene GRANT sobre estas columnas: escriben
-- `guardar_datos_pago_medio_srv` y `editar_privado_srv`); la carga demo, en modo carga, deja método y resumen sin
-- cuenta porque no conoce la llave de cifrado.
alter table public.medios_privado add constraint medios_privado_pago_completo_chk
  check ((metodo_pago is null) = (datos_pago_resumen is null) and (datos_pago_cifrados is null or metodo_pago is not null));

create function private.fn_medios_privado_pago_completo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if (new.metodo_pago is null) <> (new.datos_pago_cifrados is null) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Los datos de pago van completos: método, cuenta y resumen.';
  end if;
  return new;
end $$;
revoke all on function private.fn_medios_privado_pago_completo() from public, anon, authenticated;

create trigger trg_medios_privado_b_pago_completo
  before insert or update of metodo_pago, datos_pago_cifrados, datos_pago_resumen on public.medios_privado
  for each row execute function private.fn_medios_privado_pago_completo();

-- Cuándo cambió la cuenta de pago por última vez: el certificado del medio de pago debe ser posterior (un
-- certificado de la cuenta anterior no sirve; `private.validar_verificacion_medio`). La fija la RPC.
alter table public.medios_privado add column datos_pago_cambiados_at timestamptz;
grant select (datos_pago_cambiados_at) on public.medios_privado to authenticated;

-- La huella del documento es `tipo:número` (src/lib/cifrado.ts): el tipo solo cambia junto con el número, por la RPC.
revoke insert (tipo_documento), update (tipo_documento) on public.medios_privado from authenticated;

-- p_datos: claves de la lista blanca; una clave ausente conserva el valor actual, una clave en null lo borra (salvo las
-- banderas, que no admiten null). El cifrado y el hash los calcula el servidor; aquí no se ve ningún valor claro salvo
-- el titular y el contacto, que la bitácora enmascara.
create function public.guardar_datos_pago_medio_srv(p_medio_id uuid, p_actor_id uuid, p_session_id uuid, p_datos jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo;
  v_claves constant text[] := array['titular_nombre', 'tipo_documento', 'numero_documento_cifrado', 'numero_documento_hash',
    'numero_documento_resumen', 'metodo_pago', 'datos_pago_cifrados', 'datos_pago_resumen', 'es_declarante',
    'obligado_facturar', 'responsable_iva', 'celular', 'email_contacto', 'direccion'];
  v_extra text;
  v_previo public.medios_privado;
  v_nuevo public.medios_privado;
  v_existe boolean;
  v_nombre text;
begin
  v_tipo := private.validar_actor(p_actor_id, null, p_session_id);
  if v_tipo = 'MEDIO' then
    if not private.tiene_permiso_de(p_actor_id, 'medios.editar_propio')
       or (select p.medio_id from public.perfiles p where p.id = p_actor_id) is distinct from p_medio_id then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
    end if;
  elsif v_tipo = 'ADMIN' then
    if not private.tiene_permiso_de(p_actor_id, 'datos_sensibles.editar') then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
    end if;
  elsif not private.modo_carga() then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select k into v_extra from jsonb_object_keys(coalesce(p_datos, '{}')) k where k <> all (v_claves) limit 1;
  if v_extra is not null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'Dato no admitido: ' || v_extra || '.';
  end if;
  select m.nombre into v_nombre from public.medios m where m.id = p_medio_id and m.deleted_at is null;
  if v_nombre is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El medio no existe.';
  end if;

  select * into v_previo from public.medios_privado mp where mp.medio_id = p_medio_id for update;
  v_existe := found;
  if v_existe then
    v_nuevo := v_previo;
  else
    v_nuevo := jsonb_populate_record(null::public.medios_privado,
      jsonb_build_object('medio_id', p_medio_id, 'es_declarante', false, 'obligado_facturar', false, 'responsable_iva', false));
  end if;
  v_nuevo := jsonb_populate_record(v_nuevo, p_datos - array['es_declarante', 'obligado_facturar', 'responsable_iva']);
  v_nuevo.es_declarante := coalesce((p_datos ->> 'es_declarante')::boolean, v_nuevo.es_declarante);
  v_nuevo.obligado_facturar := coalesce((p_datos ->> 'obligado_facturar')::boolean, v_nuevo.obligado_facturar);
  v_nuevo.responsable_iva := coalesce((p_datos ->> 'responsable_iva')::boolean, v_nuevo.responsable_iva);
  v_nuevo.medio_id := p_medio_id;
  if (v_previo.datos_pago_cifrados, v_previo.metodo_pago) is distinct from (v_nuevo.datos_pago_cifrados, v_nuevo.metodo_pago)
     and v_nuevo.metodo_pago is not null then
    v_nuevo.datos_pago_cambiados_at := private.ahora();
  end if;
  if (v_nuevo.metodo_pago is null) <> (v_nuevo.datos_pago_cifrados is null)
     or (v_nuevo.metodo_pago is null) <> (v_nuevo.datos_pago_resumen is null) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Los datos de pago van completos: método, cuenta y resumen.';
  end if;

  if v_existe then
    update public.medios_privado set
      titular_nombre = v_nuevo.titular_nombre, tipo_documento = v_nuevo.tipo_documento,
      numero_documento_cifrado = v_nuevo.numero_documento_cifrado, numero_documento_hash = v_nuevo.numero_documento_hash,
      numero_documento_resumen = v_nuevo.numero_documento_resumen, metodo_pago = v_nuevo.metodo_pago,
      datos_pago_cifrados = v_nuevo.datos_pago_cifrados, datos_pago_resumen = v_nuevo.datos_pago_resumen,
      es_declarante = v_nuevo.es_declarante, obligado_facturar = v_nuevo.obligado_facturar,
      responsable_iva = v_nuevo.responsable_iva, celular = v_nuevo.celular, email_contacto = v_nuevo.email_contacto,
      direccion = v_nuevo.direccion, datos_pago_cambiados_at = v_nuevo.datos_pago_cambiados_at
    where medio_id = p_medio_id;
  else
    insert into public.medios_privado (medio_id, titular_nombre, tipo_documento, numero_documento_cifrado,
      numero_documento_hash, numero_documento_resumen, metodo_pago, datos_pago_cifrados, datos_pago_resumen, es_declarante,
      obligado_facturar, responsable_iva, celular, email_contacto, direccion, datos_pago_cambiados_at)
    values (p_medio_id, v_nuevo.titular_nombre, v_nuevo.tipo_documento, v_nuevo.numero_documento_cifrado,
      v_nuevo.numero_documento_hash, v_nuevo.numero_documento_resumen, v_nuevo.metodo_pago, v_nuevo.datos_pago_cifrados,
      v_nuevo.datos_pago_resumen, v_nuevo.es_declarante, v_nuevo.obligado_facturar, v_nuevo.responsable_iva,
      v_nuevo.celular, v_nuevo.email_contacto, v_nuevo.direccion, v_nuevo.datos_pago_cambiados_at);
  end if;

  if v_existe and (v_previo.datos_pago_cifrados, v_previo.metodo_pago)
                  is distinct from (v_nuevo.datos_pago_cifrados, v_nuevo.metodo_pago) then
    perform private.notificar_cola('medios.verificar', 'cola.datos_pago_cambiados', jsonb_build_object('medio', v_nombre),
                                   'medios', p_medio_id::text, 1::smallint);
  end if;
end $$;
revoke all on function public.guardar_datos_pago_medio_srv(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_datos_pago_medio_srv(uuid, uuid, uuid, jsonb) to service_role;

-- 4. MED-003 · Prueba de vida por videollamada y vigencia de documentos ----------------------------------------------

alter table public.documentos_medio add column metodo text not null default 'ARCHIVO'
  constraint documentos_medio_metodo_chk check (metodo in ('ARCHIVO', 'VIDEOLLAMADA'));
alter table public.documentos_medio alter column archivo_path drop not null;
alter table public.documentos_medio drop constraint documentos_medio_archivo_path_chk;
alter table public.documentos_medio add constraint documentos_medio_archivo_path_chk check (
  case metodo
    when 'VIDEOLLAMADA' then archivo_path is null and tipo = 'PRUEBA_VIDA'
    else archivo_path is not null
         and archivo_path like 'medio/' || medio_id::text || '/' || tipo::text || '/%'
         and position('..' in archivo_path) = 0
  end);

-- Idempotencia de las subidas: la acción que confirma un archivo se reintenta si pierde la respuesta; con la ruta
-- única, el reintento encuentra la fila (`on conflict`) en vez de duplicarla. El servidor nombra cada objeto con un
-- uuid, así que dos subidas nunca comparten ruta.
create unique index documentos_medio_archivo_path_key on public.documentos_medio (archivo_path)
  where archivo_path is not null;
create unique index documentos_anunciante_archivo_path_key on public.documentos_anunciante (archivo_path);

-- El equipo AMO deja constancia de una verificación de identidad por videollamada (alternativa a la foto, dato
-- biométrico facultativo): nace PENDIENTE y se aprueba en la misma transacción por la máquina de estados.
create function public.registrar_verificacion_videollamada_srv(p_medio_id uuid, p_actor_id uuid, p_session_id uuid,
                                                               p_observaciones text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_obs text := nullif(btrim(p_observaciones), '');
begin
  perform private.validar_actor(p_actor_id, 'medios.verificar', p_session_id);
  if v_obs is null then
    raise exception using errcode = 'P0001', message = 'AMO_MOTIVO_REQUERIDO',
      detail = 'Describe cómo se verificó la identidad (fecha, quién atendió, documento exhibido).';
  end if;
  if not exists (select 1 from public.medios m where m.id = p_medio_id and m.deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El medio no existe.';
  end if;
  insert into public.documentos_medio (medio_id, tipo, metodo, archivo_path, subido_por)
  values (p_medio_id, 'PRUEBA_VIDA', 'VIDEOLLAMADA', null, p_actor_id)
  returning id into v_id;
  perform private.aplicar_transicion('documentos_medio', v_id, 'APROBADO', 'ADMIN', p_actor_id, null,
                                     jsonb_build_object('observaciones', left(v_obs, 1000)));
  return v_id;
end $$;
revoke all on function public.registrar_verificacion_videollamada_srv(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.registrar_verificacion_videollamada_srv(uuid, uuid, uuid, text) to service_role;

-- 4b. MED-002 · «Enviar a verificación» ---------------------------------------------------------------------------
-- El medio completa su perfil y lo envía: entra a la cola del equipo AMO ordenada por `enviado_verificacion_at`. Si
-- venía RECHAZADO, vuelve a PENDIENTE por la máquina de estados (transición del propio medio).

alter table public.medios add column enviado_verificacion_at timestamptz;
create index medios_cola_verificacion_idx on public.medios (enviado_verificacion_at)
  where estado = 'PENDIENTE' and enviado_verificacion_at is not null and deleted_at is null;

create function public.enviar_medio_a_verificacion_srv(p_medio_id uuid, p_actor_id uuid, p_session_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_medio public.medios; v_faltan text[] := '{}';
begin
  perform private.validar_actor(p_actor_id, 'medios.editar_propio', p_session_id);
  if (select p.medio_id from public.perfiles p where p.id = p_actor_id) is distinct from p_medio_id then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  select * into v_medio from public.medios m where m.id = p_medio_id and m.deleted_at is null for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El medio no existe.';
  end if;
  if v_medio.estado not in ('PENDIENTE', 'RECHAZADO') then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Tu medio ya está verificado: para subir de nivel carga los documentos del nivel nuevo.';
  end if;
  -- Una cuenta verificada, o con su verificación en revisión (captura cargada o por API).
  if not exists (select 1 from public.cuentas_sociales c
                 where c.medio_id = p_medio_id and c.deleted_at is null
                   and (c.verificada
                        or exists (select 1 from public.verificaciones_cuenta v
                                   where v.cuenta_social_id = c.id and v.estado_validacion = 'PENDIENTE'
                                     and (v.captura_path is not null or v.metodo = 'API')))) then
    v_faltan := v_faltan || 'verificar una cuenta social'::text;
  end if;
  if not exists (select 1 from public.documentos_medio d
                 where d.medio_id = p_medio_id and d.estado_validacion in ('PENDIENTE', 'APROBADO')) then
    v_faltan := v_faltan || 'los documentos de tu nivel'::text;
  end if;
  if not exists (select 1 from public.medios_privado mp
                 where mp.medio_id = p_medio_id and mp.metodo_pago is not null and mp.datos_pago_cifrados is not null) then
    v_faltan := v_faltan || 'los datos de pago'::text;
  end if;
  if cardinality(v_faltan) > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Antes de enviar completa: ' || array_to_string(v_faltan, ', ') || '.';
  end if;
  if v_medio.estado = 'RECHAZADO' then
    perform private.aplicar_transicion('medios', p_medio_id, 'PENDIENTE', 'MEDIO', p_actor_id, null, '{}');
  end if;
  update public.medios set enviado_verificacion_at = private.ahora() where id = p_medio_id;
  perform private.notificar_cola('medios.verificar', 'cola.medio_verificacion', jsonb_build_object('medio', v_medio.nombre),
                                 'medios', p_medio_id::text, 1::smallint);
end $$;
revoke all on function public.enviar_medio_a_verificacion_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.enviar_medio_a_verificacion_srv(uuid, uuid, uuid) to service_role;

-- 4c. MED-004 · El certificado del medio de pago corresponde a la cuenta vigente -------------------------------------
-- Copia de 20260930234802 con un cambio: el certificado (CERT_BANCARIA / CERT_BILLETERA) debe haberse cargado
-- después del último cambio de cuenta (`medios_privado.datos_pago_cambiados_at`).
create or replace function private.validar_verificacion_medio(p_medio_id uuid, p_nivel smallint, p_exigir_cuenta boolean)
returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_docs public.documento_medio_tipo[];
  v_metodo public.metodo_pago;
  v_cambio timestamptz;
  v_faltan text[];
begin
  if p_nivel is null or p_nivel not between 1 and 3 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Indica un nivel de verificación válido (1, 2 o 3).';
  end if;
  select nv.documentos_requeridos into v_docs from public.niveles_verificacion nv where nv.nivel = p_nivel;
  select mp.metodo_pago, mp.datos_pago_cambiados_at into v_metodo, v_cambio
  from public.medios_privado mp where mp.medio_id = p_medio_id;
  if v_metodo = 'BANCARIO' then
    v_docs := v_docs || 'CERT_BANCARIA'::public.documento_medio_tipo;
  elsif v_metodo = 'BILLETERA' then
    v_docs := v_docs || 'CERT_BILLETERA'::public.documento_medio_tipo;
  end if;
  select coalesce(array_agg(x.tipo::text order by x.tipo), '{}') into v_faltan from unnest(v_docs) as x(tipo)
  where not exists (select 1 from public.documentos_medio d
                    where d.medio_id = p_medio_id and d.tipo = x.tipo and d.estado_validacion = 'APROBADO'
                      and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())
                      and (x.tipo not in ('CERT_BANCARIA', 'CERT_BILLETERA') or v_cambio is null
                           or d.created_at >= v_cambio));
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

-- 4d. MED-005 · El medio quita una cuenta social sin verificar ------------------------------------------------------
-- La política SELECT (`deleted_at is null`) también se exige a la fila nueva, así que el borrado lógico no puede ir
-- por la sesión del medio: va por esta RPC, con actor y sesión validados en la BD.
create function public.quitar_cuenta_social_srv(p_cuenta_id uuid, p_actor_id uuid, p_session_id uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_cuenta public.cuentas_sociales;
begin
  perform private.validar_actor(p_actor_id, 'medios.editar_propio', p_session_id);
  select * into v_cuenta from public.cuentas_sociales c where c.id = p_cuenta_id and c.deleted_at is null for update;
  if not found or v_cuenta.medio_id is distinct from (select p.medio_id from public.perfiles p where p.id = p_actor_id) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La cuenta no existe o no es de tu medio.';
  end if;
  if v_cuenta.verificada then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Una cuenta verificada no se puede quitar desde aquí porque puede tener campañas asociadas. Pídeselo al equipo de AMO.';
  end if;
  if exists (select 1 from public.verificaciones_cuenta v
             where v.cuenta_social_id = p_cuenta_id and v.estado_validacion = 'PENDIENTE' and v.captura_path is not null) then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Espera a que terminemos de revisar la verificación de esta cuenta para quitarla.';
  end if;
  delete from public.verificaciones_cuenta v
  where v.cuenta_social_id = p_cuenta_id and v.estado_validacion = 'PENDIENTE' and v.captura_path is null;
  update public.cuentas_sociales set deleted_at = private.ahora() where id = p_cuenta_id;
end $$;
revoke all on function public.quitar_cuenta_social_srv(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.quitar_cuenta_social_srv(uuid, uuid, uuid) to service_role;

-- 5. ADM-003 · Documentos exigidos para verificar un anunciante -----------------------------------------------------

create function private.validar_verificacion_anunciante(p_anunciante_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_pais char(2); v_faltan text[];
begin
  select a.pais_iso2 into v_pais from public.anunciantes a where a.id = p_anunciante_id;
  if v_pais = 'CO' then
    select coalesce(array_agg(x.tipo::text order by x.tipo), '{}') into v_faltan
    from unnest(array['RUT', 'CAMARA_COMERCIO']::public.documento_anunciante_tipo[]) as x (tipo)
    where not exists (select 1 from public.documentos_anunciante d
                      where d.anunciante_id = p_anunciante_id and d.tipo = x.tipo and d.estado_validacion = 'APROBADO'
                        and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy()));
  elsif not exists (select 1 from public.documentos_anunciante d
                    where d.anunciante_id = p_anunciante_id and d.estado_validacion = 'APROBADO'
                      and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())) then
    v_faltan := array['un documento de existencia de la empresa'];
  end if;
  if cardinality(v_faltan) > 0 then
    raise exception using errcode = 'P0001', message = 'AMO_TRANSICION_INVALIDA',
      detail = 'Faltan documentos aprobados y vigentes: ' || array_to_string(v_faltan, ', ') || '.';
  end if;
end $$;
revoke all on function private.validar_verificacion_anunciante(uuid) from public, anon, authenticated, service_role;


-- 6. Núcleo de transiciones (copia de 20261005174750 con dos cambios marcados: MED-003 y ADM-003) --------------------

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
      if p_actor_tipo = 'ADMIN' and (v_datos ? 'comentario_moderacion' or p_hacia = 'DEVUELTA') then
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
end $$;
revoke all on function private.aplicar_transicion(text, uuid, text, public.transicion_actor, uuid, text, jsonb)
  from public, anon, authenticated;

create or replace function private.validar_condicion_transicion(p_entidad text, p_id uuid, p_desde text, p_hacia text,
                                                     p_actor_tipo public.transicion_actor, p_actor_id uuid,
                                                     p_motivo text, p_datos jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
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
end $$;
revoke all on function private.validar_condicion_transicion(text, uuid, text, text, public.transicion_actor, uuid, text, jsonb)
  from public, anon, authenticated;

-- 7. Verificación --------------------------------------------------------------------------------------------------
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname like '%\_srv' and has_function_privilege('authenticated', p.oid, 'execute')),
         'authenticated tiene EXECUTE sobre una RPC *_srv';
  assert private.cuentas_solicitud_validas('[{"plataforma":"INSTAGRAM","usuario":"@medio","seguidores":45000}]'),
         'cuentas válidas';
  assert not private.cuentas_solicitud_validas('[]') and not private.cuentas_solicitud_validas('[{"plataforma":"X","usuario":"a"}]'),
         'cuentas inválidas';
end $$;
