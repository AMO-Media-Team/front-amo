-- Migración 5 · configuracion (docs/modelo-datos.md §2.3, §3.4, §5.6, §7, §11)
-- Catálogos de precio (franjas, formatos, tarifas versionadas), niveles de verificación, esqueleto tributario,
-- plantillas de notificación y términos (Ley 1581). `public.configuracion` y `private.fn_validar_configuracion`
-- ya existen desde identidad_rbac (M3): aquí no se recrean. Las semillas van en `configuracion_semillas`.

-- 1. Enums
create type public.plataforma as enum ('FACEBOOK', 'INSTAGRAM', 'TIKTOK');
create type public.documento_medio_tipo as enum ('CEDULA_FRENTE', 'CEDULA_REVERSO', 'PRUEBA_VIDA', 'RUT', 'RUT_SOCIEDAD',
  'CAMARA_COMERCIO', 'CERT_BANCARIA', 'CERT_BILLETERA', 'SEG_SOCIAL');
create type public.retencion_tipo as enum ('RETEFUENTE', 'RETEICA', 'RETEIVA');
create type public.documento_electronico_tipo as enum ('FACTURA_VENTA', 'DOCUMENTO_SOPORTE');
create type public.notificacion_canal as enum ('APP', 'EMAIL', 'WHATSAPP', 'PUSH');
create type public.terminos_tipo as enum ('TERMINOS_MEDIO', 'TERMINOS_ANUNCIANTE', 'POLITICA_DATOS', 'CONDICIONES_COMERCIALES');

-- 2. Tablas

-- Franjas de seguidores, comunes a las tres plataformas (D3).
create table public.franjas (
  id uuid primary key default private.uuid_v7(),
  clave text not null constraint franjas_clave_key unique constraint franjas_clave_chk check (clave ~ '^F[0-9]$'),
  nombre text not null constraint franjas_nombre_chk check (char_length(nombre) between 2 and 60),
  seguidores_min integer not null constraint franjas_seguidores_min_chk check (seguidores_min >= 0),
  seguidores_max integer,                                                  -- null = sin límite
  orden smallint not null,
  activa boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint franjas_seguidores_max_chk check (seguidores_max is null or seguidores_max > seguidores_min),
  constraint franjas_rango_excl exclude using gist (int4range(seguidores_min, seguidores_max, '[]') with &&) where (activa)
);

create table public.formatos (
  id uuid primary key default private.uuid_v7(),
  plataforma public.plataforma not null,
  clave text not null constraint formatos_clave_chk check (clave in ('POST_FEED', 'REEL', 'HISTORIA', 'CARRUSEL', 'VIDEO')),
  nombre text not null constraint formatos_nombre_chk check (char_length(nombre) between 2 and 60),
  requisitos jsonb not null default '{}'
    constraint formatos_requisitos_chk check (jsonb_typeof(requisitos) = 'object' and pg_column_size(requisitos) < 8192),
  activo boolean not null default true,
  orden smallint not null default 0,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint formatos_plataforma_clave_key unique (plataforma, clave),
  constraint formatos_id_plataforma_key unique (id, plataforma)            -- destino de la FK compuesta de tarifas/ofertas
);

-- Versionada: nunca se sobrescribe (trigger a_inmutable); nueva vigencia = public.programar_tarifa.
create table public.tarifas (
  id uuid primary key default private.uuid_v7(),
  formato_id uuid not null,
  plataforma public.plataforma not null,
  franja_id uuid not null references public.franjas (id) on delete restrict,
  valor_base numeric(14,2) not null constraint tarifas_valor_base_chk check (valor_base > 0),
  vigente_desde timestamptz not null,
  vigente_hasta timestamptz,
  pendiente_validacion boolean not null default false,                     -- cifra sugerida pendiente de negocio
  creada_por uuid default private.actor_id(),                              -- sin FK (§3.8): tabla inmutable
  created_at timestamptz not null default private.ahora(),
  constraint tarifas_formato_plataforma_fkey foreign key (formato_id, plataforma)
    references public.formatos (id, plataforma) on delete restrict,
  constraint tarifas_vigencia_chk check (vigente_hasta is null or vigente_hasta > vigente_desde),
  constraint tarifas_vigencia_excl exclude using gist
    (formato_id with =, franja_id with =, tstzrange(vigente_desde, vigente_hasta, '[)') with &&)
);
create index tarifas_franja_id_idx on public.tarifas (franja_id);
create index tarifas_creada_por_idx on public.tarifas (creada_por);
create index tarifas_formato_plataforma_idx on public.tarifas (formato_id, plataforma);

create table public.niveles_verificacion (
  nivel smallint primary key constraint niveles_verificacion_nivel_chk check (nivel between 1 and 3),
  nombre text not null constraint niveles_verificacion_nombre_chk check (char_length(nombre) between 2 and 80),
  requisitos text[] not null,
  documentos_requeridos public.documento_medio_tipo[] not null
    constraint niveles_verificacion_documentos_chk check (cardinality(documentos_requeridos) >= 1),
  tope_anual numeric(14,2) constraint niveles_verificacion_tope_chk check (tope_anual is null or tope_anual > 0),
  porcentaje_alerta numeric(5,4) not null default 0.8000,
  porcentaje_bloqueo numeric(5,4) not null default 0.9500,
  pendiente_validacion boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint niveles_verificacion_porcentajes_chk
    check (porcentaje_alerta > 0 and porcentaje_alerta <= porcentaje_bloqueo and porcentaje_bloqueo <= 1)
);

-- Esqueleto tributario (no público; escritura configuracion.tributario).
create table public.parametros_tributarios (
  anio smallint primary key constraint parametros_tributarios_anio_chk check (anio between 2020 and 2100),
  uvt numeric(12,2) not null constraint parametros_tributarios_uvt_chk check (uvt > 0),
  smlmv numeric(14,2) not null constraint parametros_tributarios_smlmv_chk check (smlmv > 0),
  umbral_seg_social_smlmv numeric(6,2)
    constraint parametros_tributarios_umbral_chk check (umbral_seg_social_smlmv is null or umbral_seg_social_smlmv > 0),
  pendiente_validacion boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora()
);

create table public.retenciones_config (
  id uuid primary key default private.uuid_v7(),
  tipo public.retencion_tipo not null,
  concepto text not null constraint retenciones_config_concepto_chk check (concepto in ('SERVICIOS', 'PUBLICIDAD', 'HONORARIOS')),
  aplica_declarante boolean not null,
  tarifa numeric(7,6) not null constraint retenciones_config_tarifa_chk check (tarifa between 0 and 1),
  base_minima_uvt numeric(10,2) not null default 0 constraint retenciones_config_base_chk check (base_minima_uvt >= 0),
  vigente_desde date not null,
  vigente_hasta date,
  pendiente_validacion boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint retenciones_config_vigencia_chk check (vigente_hasta is null or vigente_hasta > vigente_desde),
  constraint retenciones_config_vigencia_excl exclude using gist
    (tipo with =, concepto with =, aplica_declarante with =, daterange(vigente_desde, vigente_hasta, '[)') with &&)
);

create table public.reteica_municipal (
  id uuid primary key default private.uuid_v7(),
  municipio_codigo char(5) not null references public.municipios (codigo) on delete restrict,
  tarifa_por_mil numeric(8,4) not null constraint reteica_municipal_tarifa_chk check (tarifa_por_mil between 0 and 20),
  base_minima_uvt numeric(10,2) not null default 0 constraint reteica_municipal_base_chk check (base_minima_uvt >= 0),
  vigente_desde date not null,
  vigente_hasta date,
  pendiente_validacion boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint reteica_municipal_vigencia_chk check (vigente_hasta is null or vigente_hasta > vigente_desde),
  constraint reteica_municipal_vigencia_excl exclude using gist
    (municipio_codigo with =, daterange(vigente_desde, vigente_hasta, '[)') with &&)
);
create index reteica_municipal_municipio_codigo_idx on public.reteica_municipal (municipio_codigo);

-- Numeración DIAN: el consecutivo lo toma private.siguiente_consecutivo al emitir (sin huecos).
create table public.resoluciones_dian (
  id uuid primary key default private.uuid_v7(),
  tipo public.documento_electronico_tipo not null,
  prefijo text not null constraint resoluciones_dian_prefijo_chk check (prefijo ~ '^[A-Z0-9]{0,4}$'),
  numero_resolucion text not null constraint resoluciones_dian_numero_chk check (char_length(numero_resolucion) between 1 and 40),
  fecha_resolucion date not null,
  rango_desde bigint not null constraint resoluciones_dian_rango_desde_chk check (rango_desde >= 1),
  rango_hasta bigint not null,
  consecutivo_actual bigint not null,
  vigente_desde date not null,
  vigente_hasta date,
  activa boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint resoluciones_dian_rango_chk check (rango_hasta >= rango_desde),
  constraint resoluciones_dian_consecutivo_chk check (consecutivo_actual between rango_desde - 1 and rango_hasta),
  constraint resoluciones_dian_vigencia_chk check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint resoluciones_dian_rango_excl exclude using gist
    (tipo with =, prefijo with =, int8range(rango_desde, rango_hasta, '[]') with &&)
);
create unique index resoluciones_dian_tipo_activa_key on public.resoluciones_dian (tipo) where activa;

create table public.plantillas_notificacion (
  clave text not null constraint plantillas_notificacion_clave_chk check (clave ~ '^[a-z_]+(\.[a-z_]+)+$'),
  canal public.notificacion_canal not null,
  nombre text not null constraint plantillas_notificacion_nombre_chk check (char_length(nombre) between 2 and 120),
  asunto text constraint plantillas_notificacion_asunto_chk check (char_length(asunto) <= 200),
  cuerpo text not null constraint plantillas_notificacion_cuerpo_chk check (char_length(cuerpo) between 1 and 5000),
  variables text[] not null default '{}',
  activa boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  primary key (clave, canal),
  constraint plantillas_notificacion_asunto_email_chk check (canal <> 'EMAIL' or asunto is not null)
);

create table public.terminos_versiones (
  id uuid primary key default private.uuid_v7(),
  tipo public.terminos_tipo not null,
  version text not null constraint terminos_versiones_version_chk check (version ~ '^[0-9A-Za-z._-]{1,20}$'),
  contenido_md text not null constraint terminos_versiones_contenido_chk check (char_length(contenido_md) between 1 and 200000),
  -- digest (pgcrypto) es immutable; convert_to no lo es y no sirve en una columna generada.
  hash_sha256 text generated always as (encode(extensions.digest(contenido_md, 'sha256'), 'hex')) stored,
  publicada boolean not null default false,
  vigente_desde timestamptz,
  creada_por uuid default private.actor_id(),                              -- sin FK (§3.8)
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint terminos_versiones_tipo_version_key unique (tipo, version),
  constraint terminos_versiones_publicada_chk check (not publicada or vigente_desde is not null)
);
create index terminos_versiones_vigentes_idx on public.terminos_versiones (tipo, vigente_desde desc) where publicada;
create index terminos_versiones_creada_por_idx on public.terminos_versiones (creada_por);

-- Evidencia de la autorización de datos (Ley 1581): append-only; sobrevive al borrado del usuario (sin FK, §3.8).
create table public.aceptaciones_terminos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null,
  email_sha256 text not null,                                              -- snapshot, lo fija el trigger
  termino_version_id uuid not null references public.terminos_versiones (id) on delete restrict,
  aceptada_at timestamptz not null default private.ahora(),
  ip inet,
  user_agent text constraint aceptaciones_terminos_user_agent_chk check (char_length(user_agent) <= 400),
  constraint aceptaciones_terminos_perfil_version_key unique (perfil_id, termino_version_id)
);
create index aceptaciones_terminos_termino_version_id_idx on public.aceptaciones_terminos (termino_version_id);

-- 3. Funciones

-- Tarifas históricas inmutables. Se permite: insertar vigencias que empiezan ahora o después; cambiar
-- vigente_hasta solo en su tramo futuro (cerrar o reabrir una vigencia que aún no ha terminado); marcar una cifra
-- como validada (pendiente_validacion true → false); borrar una tarifa programada que no ha entrado en vigor.
create function private.fn_tarifas_inmutable() returns trigger
language plpgsql set search_path = '' as $$
declare v_ahora timestamptz := private.ahora();
begin
  if private.modo_carga() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.vigente_desde < v_ahora then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'Una tarifa no puede empezar en el pasado: programa una nueva vigencia.';
    end if;
    new.creada_por := private.actor_id();
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.vigente_desde <= v_ahora then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'Solo se puede eliminar una tarifa programada que aún no ha entrado en vigor.';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - '{vigente_hasta,pendiente_validacion}'::text[])
       is distinct from (to_jsonb(old) - '{vigente_hasta,pendiente_validacion}'::text[])
     or (new.pendiente_validacion and not old.pendiente_validacion)
     or (new.vigente_hasta is distinct from old.vigente_hasta
         and ((old.vigente_hasta is not null and old.vigente_hasta <= v_ahora)
              or (new.vigente_hasta is not null and new.vigente_hasta < v_ahora))) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Las tarifas son históricas: no se modifican; programa una nueva vigencia.';
  end if;
  return new;
end $$;
revoke all on function private.fn_tarifas_inmutable() from public, anon, authenticated;

-- Consecutivo DIAN: nadie fija el inicial; una resolución con números emitidos no cambia tipo, prefijo ni inicio.
create function private.fn_resoluciones_dian_consecutivo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if tg_op = 'INSERT' then
    new.consecutivo_actual := new.rango_desde - 1;
    return new;
  end if;
  if old.consecutivo_actual >= old.rango_desde then
    if new.tipo is distinct from old.tipo or new.prefijo is distinct from old.prefijo
       or new.rango_desde is distinct from old.rango_desde then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'La resolución ya tiene números emitidos: no se puede cambiar su tipo, prefijo ni el inicio del rango.';
    end if;
  elsif new.rango_desde is distinct from old.rango_desde and new.consecutivo_actual = old.consecutivo_actual then
    new.consecutivo_actual := new.rango_desde - 1;                          -- sin emitir: el consecutivo acompaña al rango
  end if;
  return new;
end $$;
revoke all on function private.fn_resoluciones_dian_consecutivo() from public, anon, authenticated;

-- Términos: una versión publicada es inmutable (solo la carga del owner); publicar fija la vigencia.
create function private.fn_terminos_versiones_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.publicada then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Una versión publicada no se puede modificar ni eliminar: publica una versión nueva.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    new.creada_por := private.actor_id();
  end if;
  if new.publicada then
    new.vigente_desde := coalesce(new.vigente_desde, private.ahora());
    if new.vigente_desde < private.ahora() then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'La vigencia de una versión no puede empezar en el pasado.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.fn_terminos_versiones_guardar() from public, anon, authenticated;

-- Aceptación: snapshot del email (sha256), solo versiones publicadas, fecha del servidor e IP/UA solo desde
-- headers confiables (authenticated no tiene GRANT sobre ip/user_agent/aceptada_at).
create function private.fn_aceptaciones_terminos_sellar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  select p.email::text into v_email from public.perfiles p where p.id = new.perfil_id;
  if v_email is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'El usuario no existe.';
  end if;
  if not exists (select 1 from public.terminos_versiones t where t.id = new.termino_version_id and t.publicada) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Solo se puede aceptar una versión publicada de los términos.';
  end if;
  new.email_sha256 := encode(sha256(convert_to(lower(v_email), 'UTF8')), 'hex');
  if not private.modo_carga() then
    new.aceptada_at := private.ahora();
    if private.contexto_confiable() then
      if new.ip is null then
        begin
          new.ip := nullif(btrim(private.header('x-amo-ip')), '')::inet;
        exception when others then
          new.ip := null;                                                  -- una IP malformada no impide aceptar
        end;
      end if;
      new.user_agent := coalesce(new.user_agent, private.header('x-amo-ua'));
    end if;
  end if;
  new.user_agent := left(new.user_agent, 400);
  return new;
end $$;
revoke all on function private.fn_aceptaciones_terminos_sellar() from public, anon, authenticated;

-- Tablas append-only distintas de la bitácora (aceptaciones de términos): UPDATE/DELETE/TRUNCATE solo en la purga.
create function private.fn_solo_insercion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.purga_habilitada() then
    if tg_level = 'STATEMENT' then return null; end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'AMO_BITACORA_INMUTABLE',
    detail = format('La tabla %s es de solo inserción: no admite cambios ni borrados.', tg_table_name);
end $$;
revoke all on function private.fn_solo_insercion() from public, anon, authenticated;

-- Siguiente número de una resolución DIAN activa y vigente (§5.6). Bloquea la fila: se llama SOLO al emitir,
-- dentro de la transacción que fija el número en el documento (un rollback revierte ambos: sin huecos).
create function private.siguiente_consecutivo(p_tipo public.documento_electronico_tipo)
returns table (resolucion_id uuid, prefijo text, consecutivo bigint)
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_actual bigint; v_hasta bigint;
begin
  select r.id, r.consecutivo_actual, r.rango_hasta into v_id, v_actual, v_hasta
  from public.resoluciones_dian r
  where r.tipo = p_tipo and r.activa
    and private.hoy() between r.vigente_desde and coalesce(r.vigente_hasta, 'infinity'::date)
  for update;
  if v_id is null or v_actual >= v_hasta then
    raise exception using errcode = 'P0001', message = 'AMO_RESOLUCION_AGOTADA',
      detail = 'No hay una resolución de numeración DIAN vigente con consecutivos disponibles.', hint = p_tipo::text;
  end if;
  update public.resoluciones_dian r set consecutivo_actual = r.consecutivo_actual + 1
  where r.id = v_id
  returning r.id, r.prefijo, r.consecutivo_actual into resolucion_id, prefijo, consecutivo;
  return next;
end $$;
revoke all on function private.siguiente_consecutivo(public.documento_electronico_tipo) from public, anon, authenticated;

-- Nueva vigencia de una tarifa (§5.6). INVOKER: aplican la RLS y la restrictiva de contexto confiable, así que solo
-- funciona desde el servidor (x-amo-srv) con el JWT de un usuario con configuracion.tarifas.
create function public.programar_tarifa(p_formato_id uuid, p_franja_id uuid, p_valor numeric, p_desde timestamptz)
returns uuid
language plpgsql volatile security invoker set search_path = '' as $$
declare v_plataforma public.plataforma; v_programada timestamptz; v_id uuid;
begin
  if not (select private.tiene_permiso('configuracion.tarifas')) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para programar tarifas.';
  end if;
  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El valor de la tarifa debe ser mayor que cero.';
  end if;
  if p_desde is null or p_desde < private.ahora() then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'La nueva vigencia no puede empezar en el pasado.';
  end if;
  select f.plataforma into v_plataforma from public.formatos f where f.id = p_formato_id;
  if v_plataforma is null or not exists (select 1 from public.franjas fr where fr.id = p_franja_id) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'El formato o la franja no existen.';
  end if;
  select min(t.vigente_desde) into v_programada from public.tarifas t
  where t.formato_id = p_formato_id and t.franja_id = p_franja_id and t.vigente_desde >= p_desde;
  if v_programada is not null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = format('Ya hay una tarifa programada desde el %s: cancélala antes de programar otra.',
                      to_char(v_programada at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI'));
  end if;
  -- Cierra la vigencia que cubre p_desde (a lo sumo una fila, por la exclusión) e inserta la nueva.
  update public.tarifas t set vigente_hasta = p_desde
  where t.formato_id = p_formato_id and t.franja_id = p_franja_id and t.vigente_desde < p_desde
    and (t.vigente_hasta is null or t.vigente_hasta > p_desde);
  insert into public.tarifas (formato_id, plataforma, franja_id, valor_base, vigente_desde)
  values (p_formato_id, v_plataforma, p_franja_id, round(p_valor, 2), p_desde)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.programar_tarifa(uuid, uuid, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.programar_tarifa(uuid, uuid, numeric, timestamptz) to authenticated;

-- Cancela una tarifa programada que aún no entra en vigor y devuelve su tramo a la vigencia anterior. INVOKER.
create function public.cancelar_tarifa_programada(p_tarifa_id uuid) returns void
language plpgsql volatile security invoker set search_path = '' as $$
declare v public.tarifas;
begin
  if not (select private.tiene_permiso('configuracion.tarifas')) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para cancelar tarifas.';
  end if;
  select * into v from public.tarifas t where t.id = p_tarifa_id;
  if v.id is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA', detail = 'La tarifa no existe.';
  end if;
  if v.vigente_desde <= private.ahora() then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Solo se puede cancelar una tarifa que aún no ha entrado en vigor.';
  end if;
  delete from public.tarifas t where t.id = v.id;
  if not found then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para cancelar tarifas.';
  end if;
  update public.tarifas t set vigente_hasta = v.vigente_hasta
  where t.formato_id = v.formato_id and t.franja_id = v.franja_id and t.vigente_hasta = v.vigente_desde;
end $$;
revoke all on function public.cancelar_tarifa_programada(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_tarifa_programada(uuid) to authenticated;

-- 4. Triggers
create trigger trg_franjas_m_updated_at before update on public.franjas
  for each row execute function private.fn_set_updated_at();
create trigger trg_franjas_z_auditar after insert or update or delete on public.franjas
  for each row execute function private.fn_auditar('id');

create trigger trg_formatos_m_updated_at before update on public.formatos
  for each row execute function private.fn_set_updated_at();
create trigger trg_formatos_z_auditar after insert or update or delete on public.formatos
  for each row execute function private.fn_auditar('id');

create trigger trg_tarifas_a_inmutable before insert or update or delete on public.tarifas
  for each row execute function private.fn_tarifas_inmutable();
create trigger trg_tarifas_z_auditar after insert or update or delete on public.tarifas
  for each row execute function private.fn_auditar('id');

create trigger trg_niveles_verificacion_m_updated_at before update on public.niveles_verificacion
  for each row execute function private.fn_set_updated_at();
create trigger trg_niveles_verificacion_z_auditar after insert or update or delete on public.niveles_verificacion
  for each row execute function private.fn_auditar('nivel');

create trigger trg_parametros_tributarios_m_updated_at before update on public.parametros_tributarios
  for each row execute function private.fn_set_updated_at();
create trigger trg_parametros_tributarios_z_auditar after insert or update or delete on public.parametros_tributarios
  for each row execute function private.fn_auditar('anio');

create trigger trg_retenciones_config_m_updated_at before update on public.retenciones_config
  for each row execute function private.fn_set_updated_at();
create trigger trg_retenciones_config_z_auditar after insert or update or delete on public.retenciones_config
  for each row execute function private.fn_auditar('id');

create trigger trg_reteica_municipal_m_updated_at before update on public.reteica_municipal
  for each row execute function private.fn_set_updated_at();
create trigger trg_reteica_municipal_z_auditar after insert or update or delete on public.reteica_municipal
  for each row execute function private.fn_auditar('id');

create trigger trg_resoluciones_dian_b_consecutivo before insert or update on public.resoluciones_dian
  for each row execute function private.fn_resoluciones_dian_consecutivo();
create trigger trg_resoluciones_dian_m_updated_at before update on public.resoluciones_dian
  for each row execute function private.fn_set_updated_at();
create trigger trg_resoluciones_dian_z_auditar after insert or update or delete on public.resoluciones_dian
  for each row execute function private.fn_auditar('id');

create trigger trg_plantillas_notificacion_m_updated_at before update on public.plantillas_notificacion
  for each row execute function private.fn_set_updated_at();
create trigger trg_plantillas_notificacion_z_auditar after insert or update or delete on public.plantillas_notificacion
  for each row execute function private.fn_auditar('clave');

create trigger trg_terminos_versiones_a_guardar before insert or update or delete on public.terminos_versiones
  for each row execute function private.fn_terminos_versiones_guardar();
create trigger trg_terminos_versiones_m_updated_at before update on public.terminos_versiones
  for each row execute function private.fn_set_updated_at();
create trigger trg_terminos_versiones_z_auditar after insert or update or delete on public.terminos_versiones
  for each row execute function private.fn_auditar('id');

create trigger trg_aceptaciones_terminos_a_inmutable before update or delete on public.aceptaciones_terminos
  for each row execute function private.fn_solo_insercion();
create trigger trg_aceptaciones_terminos_a_inmutable_truncate before truncate on public.aceptaciones_terminos
  for each statement execute function private.fn_solo_insercion();
create trigger trg_aceptaciones_terminos_b_sellar before insert on public.aceptaciones_terminos
  for each row execute function private.fn_aceptaciones_terminos_sellar();

-- 5. RLS y políticas
alter table public.franjas enable row level security;
alter table public.formatos enable row level security;
alter table public.tarifas enable row level security;
alter table public.niveles_verificacion enable row level security;
alter table public.parametros_tributarios enable row level security;
alter table public.retenciones_config enable row level security;
alter table public.reteica_municipal enable row level security;
alter table public.resoluciones_dian enable row level security;
alter table public.plantillas_notificacion enable row level security;
alter table public.terminos_versiones enable row level security;
alter table public.aceptaciones_terminos enable row level security;

-- 5.1 Restrictivas estándar (acceso válido) y de contexto confiable (§2.3) en las tablas de configuración.
do $$
declare t text;
begin
  foreach t in array array['franjas', 'formatos', 'tarifas', 'niveles_verificacion', 'parametros_tributarios',
                           'retenciones_config', 'reteica_municipal', 'resoluciones_dian', 'plantillas_notificacion'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated
                      using ((select private.acceso_valido())) with check ((select private.acceso_valido()))',
                   t || ': acceso válido', t);
  end loop;
  foreach t in array array['franjas', 'formatos', 'tarifas', 'niveles_verificacion', 'parametros_tributarios',
                           'retenciones_config', 'reteica_municipal', 'resoluciones_dian', 'plantillas_notificacion',
                           'terminos_versiones'] loop
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
                      with check ((select private.contexto_confiable()))', t || ': escritura desde servidor', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated
                      using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()))',
                   t || ': actualización desde servidor', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated
                      using ((select private.contexto_confiable()))', t || ': borrado desde servidor', t);
  end loop;
end $$;

-- 5.2 Catálogos públicos (cualquier usuario activo los lee).
create policy "franjas: select autenticado" on public.franjas for select to authenticated using (true);
create policy "franjas: insert interno" on public.franjas for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "franjas: update interno" on public.franjas for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));

create policy "formatos: select autenticado" on public.formatos for select to authenticated using (true);
create policy "formatos: insert interno" on public.formatos for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "formatos: update interno" on public.formatos for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));

create policy "tarifas: select autenticado" on public.tarifas for select to authenticated using (true);
create policy "tarifas: insert interno" on public.tarifas for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.tarifas')));
create policy "tarifas: update interno" on public.tarifas for update to authenticated
  using ((select private.tiene_permiso('configuracion.tarifas')))
  with check ((select private.tiene_permiso('configuracion.tarifas')));
create policy "tarifas: delete interno" on public.tarifas for delete to authenticated
  using ((select private.tiene_permiso('configuracion.tarifas')));

create policy "niveles_verificacion: select autenticado" on public.niveles_verificacion for select to authenticated
  using (true);
create policy "niveles_verificacion: update interno" on public.niveles_verificacion for update to authenticated
  using ((select private.tiene_permiso('configuracion.editar')))
  with check ((select private.tiene_permiso('configuracion.editar')));

-- 5.3 Tributario (no público).
do $$
declare t text;
begin
  foreach t in array array['parametros_tributarios', 'retenciones_config', 'reteica_municipal', 'resoluciones_dian'] loop
    execute format('create policy %I on public.%I for select to authenticated
                      using ((select private.tiene_permiso(''configuracion.ver'')))', t || ': select interno', t);
    execute format('create policy %I on public.%I for insert to authenticated
                      with check ((select private.tiene_permiso(''configuracion.tributario'')))', t || ': insert interno', t);
    execute format('create policy %I on public.%I for update to authenticated
                      using ((select private.tiene_permiso(''configuracion.tributario'')))
                      with check ((select private.tiene_permiso(''configuracion.tributario'')))', t || ': update interno', t);
  end loop;
end $$;

-- 5.4 Plantillas de notificación.
create policy "plantillas_notificacion: select interno" on public.plantillas_notificacion for select to authenticated
  using ((select private.tiene_permiso('configuracion.ver')));
create policy "plantillas_notificacion: update interno" on public.plantillas_notificacion for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));

-- 5.5 Términos: restrictivas por operación con excepción SELECT de versiones publicadas (§2.3).
create policy "terminos_versiones: acceso válido select" on public.terminos_versiones as restrictive for select
  to authenticated using ((select private.acceso_valido()) or publicada);
create policy "terminos_versiones: acceso válido insert" on public.terminos_versiones as restrictive for insert
  to authenticated with check ((select private.acceso_valido()));
create policy "terminos_versiones: acceso válido update" on public.terminos_versiones as restrictive for update
  to authenticated using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "terminos_versiones: acceso válido delete" on public.terminos_versiones as restrictive for delete
  to authenticated using ((select private.acceso_valido()));
create policy "terminos_versiones: select" on public.terminos_versiones for select to authenticated
  using (publicada or (select private.tiene_permiso('configuracion.ver')));
create policy "terminos_versiones: insert interno" on public.terminos_versiones for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "terminos_versiones: update interno" on public.terminos_versiones for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));

-- 5.6 Aceptaciones: el usuario acepta antes de quedar operativo (excepción de SELECT e INSERT propios).
create policy "aceptaciones_terminos: acceso válido select" on public.aceptaciones_terminos as restrictive for select
  to authenticated using ((select private.acceso_valido()) or perfil_id = (select auth.uid()));
create policy "aceptaciones_terminos: acceso válido insert" on public.aceptaciones_terminos as restrictive for insert
  to authenticated with check ((select private.acceso_valido()) or perfil_id = (select auth.uid()));
create policy "aceptaciones_terminos: acceso válido update" on public.aceptaciones_terminos as restrictive for update
  to authenticated using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "aceptaciones_terminos: acceso válido delete" on public.aceptaciones_terminos as restrictive for delete
  to authenticated using ((select private.acceso_valido()));
create policy "aceptaciones_terminos: select propio o interno" on public.aceptaciones_terminos for select to authenticated
  using (perfil_id = (select auth.uid()) or (select private.tiene_permiso('usuarios.ver')));
create policy "aceptaciones_terminos: insert propio" on public.aceptaciones_terminos for insert to authenticated
  with check (perfil_id = (select auth.uid())
              and exists (select 1 from public.terminos_versiones t where t.id = termino_version_id and t.publicada));

-- 6. Grants (mínimos y explícitos; anon no recibe nada)
grant select, insert (clave, nombre, seguidores_min, seguidores_max, orden, activa),
      update (nombre, seguidores_min, seguidores_max, orden, activa) on public.franjas to authenticated;
grant select, insert (plataforma, clave, nombre, requisitos, activo, orden),
      update (nombre, requisitos, activo, orden) on public.formatos to authenticated;
grant select, insert (formato_id, plataforma, franja_id, valor_base, vigente_desde, vigente_hasta),
      update (vigente_hasta, pendiente_validacion), delete on public.tarifas to authenticated;
grant select, update (nombre, requisitos, documentos_requeridos, tope_anual, porcentaje_alerta, porcentaje_bloqueo,
                      pendiente_validacion) on public.niveles_verificacion to authenticated;
grant select, insert (anio, uvt, smlmv, umbral_seg_social_smlmv, pendiente_validacion),
      update (uvt, smlmv, umbral_seg_social_smlmv, pendiente_validacion) on public.parametros_tributarios to authenticated;
grant select, insert (tipo, concepto, aplica_declarante, tarifa, base_minima_uvt, vigente_desde, vigente_hasta, pendiente_validacion),
      update (tipo, concepto, aplica_declarante, tarifa, base_minima_uvt, vigente_desde, vigente_hasta, pendiente_validacion)
  on public.retenciones_config to authenticated;
grant select, insert (municipio_codigo, tarifa_por_mil, base_minima_uvt, vigente_desde, vigente_hasta, pendiente_validacion),
      update (municipio_codigo, tarifa_por_mil, base_minima_uvt, vigente_desde, vigente_hasta, pendiente_validacion)
  on public.reteica_municipal to authenticated;
grant select, insert (tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta, vigente_desde, vigente_hasta, activa),
      update (numero_resolucion, fecha_resolucion, rango_desde, rango_hasta, vigente_desde, vigente_hasta, activa)
  on public.resoluciones_dian to authenticated;
grant select, update (nombre, asunto, cuerpo, activa) on public.plantillas_notificacion to authenticated;
grant select, insert (tipo, version, contenido_md), update (contenido_md, publicada, vigente_desde)
  on public.terminos_versiones to authenticated;
grant select, insert (perfil_id, termino_version_id) on public.aceptaciones_terminos to authenticated;

grant select, insert, update, delete on public.franjas, public.formatos, public.tarifas, public.niveles_verificacion,
  public.parametros_tributarios, public.retenciones_config, public.reteica_municipal, public.resoluciones_dian,
  public.plantillas_notificacion, public.terminos_versiones to service_role;
-- Append-only: el servidor inserta (con IP) y lee; nunca modifica ni borra evidencia.
grant select, insert on public.aceptaciones_terminos to service_role;

-- 7. Clasificación de columnas auditadas (§3.3)
insert into private.auditoria_columnas (tabla, columna, tratamiento) values
  ('terminos_versiones', 'contenido_md', 'OMITIR'),                        -- el cambio queda en hash_sha256
  ('resoluciones_dian', 'consecutivo_actual', 'OMITIR')                   -- cada emisión lo avanza; el número queda en el documento
on conflict (tabla, columna) do update set tratamiento = excluded.tratamiento;

-- 8. Verificación
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
  assert not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
         'hay tablas de public sin RLS';
  assert not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                       and not exists (select 1 from pg_policies pp
                                       where pp.schemaname = 'public' and pp.tablename = c.relname
                                         and pp.permissive = 'RESTRICTIVE')),
         'hay tablas de public sin política restrictiva';
  assert not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
                            or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
         'anon tiene privilegios sobre tablas de public';
  assert (select count(*) from pg_policies where schemaname = 'public'
            and policyname like '%: escritura desde servidor'
            and tablename in ('franjas', 'formatos', 'tarifas', 'niveles_verificacion', 'parametros_tributarios',
                              'retenciones_config', 'reteica_municipal', 'resoluciones_dian', 'plantillas_notificacion',
                              'terminos_versiones')) = 10,
         'faltan restrictivas de contexto confiable en tablas de configuración';
  assert not has_table_privilege('service_role', 'public.aceptaciones_terminos', 'update')
     and not has_table_privilege('service_role', 'public.aceptaciones_terminos', 'delete'),
         'service_role no debe modificar aceptaciones de términos';
  assert has_function_privilege('authenticated', 'public.programar_tarifa(uuid, uuid, numeric, timestamptz)', 'execute')
     and not has_function_privilege('authenticated', 'private.siguiente_consecutivo(public.documento_electronico_tipo)', 'execute')
     and not has_function_privilege('service_role', 'private.siguiente_consecutivo(public.documento_electronico_tipo)', 'execute'),
         'EXECUTE de programar_tarifa / siguiente_consecutivo incorrecto';
end $$;
