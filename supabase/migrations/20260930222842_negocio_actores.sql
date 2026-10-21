-- Migración 6 · negocio_actores (docs/modelo-datos.md §2.3, §3.5, §3.8, §5.1, §11)
-- Anunciantes y medios con sus datos privados, documentos, categorías, audiencia por país, pertinencia geográfica,
-- cuentas sociales y su verificación; helpers cuenta_vigente y SRF de visibilidad; FKs perfiles → organizaciones.
-- Los triggers a_validar_transicion de estas tablas llegan con negocio_transacciones (M7), que crea
-- private.transiciones_estado. anunciante_ve_medio / medio_ve_anunciante quedan PROVISIONALES (devuelven false)
-- hasta que M7 cree asignaciones y campañas y las redefina con `create or replace` (misma firma).

-- 1. Enums
create type public.anunciante_estado as enum ('PENDIENTE', 'VERIFICADO', 'RECHAZADO', 'SUSPENDIDO');
create type public.medio_estado as enum ('PENDIENTE', 'VERIFICADO', 'RECHAZADO', 'SUSPENDIDO');
create type public.medio_tipo as enum ('PAGINA_NOTICIAS', 'CREADOR', 'EMISORA', 'PERIODICO', 'CANAL_TV', 'COMUNITARIO', 'OTRO');
create type public.documento_estado as enum ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'VENCIDO');
create type public.documento_anunciante_tipo as enum ('RUT', 'CAMARA_COMERCIO', 'CERT_BANCARIA', 'OTRO');
create type public.metodo_pago as enum ('BANCARIO', 'BILLETERA');
create type public.metodo_verificacion as enum ('MANUAL', 'CODIGO_HISTORIA', 'API');
create type public.audiencia_fuente as enum ('DECLARADA', 'VERIFICADA_MANUAL', 'API');
create type public.validacion_estado as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- 2. Tablas

create table public.anunciantes (
  id uuid primary key default private.uuid_v7(),
  razon_social text not null constraint anunciantes_razon_social_chk check (char_length(razon_social) between 2 and 200),
  nombre_comercial text not null constraint anunciantes_nombre_comercial_chk check (char_length(nombre_comercial) between 2 and 120),
  nombre_normalizado text generated always as (private.normalizar_texto(nombre_comercial || ' ' || razon_social)) stored,
  nit text constraint anunciantes_nit_chk check (nit ~ '^[0-9]{6,15}$'),                 -- sin DV
  digito_verificacion char(1) constraint anunciantes_digito_verificacion_chk check (digito_verificacion ~ '^[0-9]$'),
  identificacion_extranjera text
    constraint anunciantes_identificacion_extranjera_chk check (char_length(identificacion_extranjera) between 2 and 40),
  sector_id uuid not null references public.sectores (id) on delete restrict,
  pais_iso2 char(2) not null default 'CO' references public.paises (iso2),
  municipio_codigo char(5) references public.municipios (codigo),
  ciudad_extranjera text constraint anunciantes_ciudad_extranjera_chk check (char_length(ciudad_extranjera) <= 120),
  logo_path text,
  datos_facturacion jsonb not null default '{}'
    constraint anunciantes_datos_facturacion_chk check (jsonb_typeof(datos_facturacion) = 'object'
                                                        and pg_column_size(datos_facturacion) < 8192),
  estado_verificacion public.anunciante_estado not null default 'PENDIENTE',
  verificado_por uuid references public.perfiles (id) on delete set null,
  verificado_at timestamptz,
  rechazado_at timestamptz,
  suspendido_at timestamptz,
  motivo_estado text constraint anunciantes_motivo_estado_chk check (char_length(motivo_estado) <= 500),
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz,
  constraint anunciantes_nit_co_chk check (pais_iso2 <> 'CO' or nit is not null),
  constraint anunciantes_municipio_co_chk check (pais_iso2 <> 'CO' or municipio_codigo is not null),
  constraint anunciantes_municipio_pais_chk check (pais_iso2 = 'CO' or municipio_codigo is null),
  constraint anunciantes_logo_path_chk check (logo_path is null
    or (logo_path like 'anunciante/' || id::text || '/%' and position('..' in logo_path) = 0))
);
create unique index anunciantes_nit_key on public.anunciantes (nit) where deleted_at is null and nit is not null;
create index anunciantes_sector_id_idx on public.anunciantes (sector_id);
create index anunciantes_pais_iso2_idx on public.anunciantes (pais_iso2);
create index anunciantes_municipio_codigo_idx on public.anunciantes (municipio_codigo);
create index anunciantes_verificado_por_idx on public.anunciantes (verificado_por);
create index anunciantes_estado_verificacion_idx on public.anunciantes (estado_verificacion);
create index anunciantes_nombre_normalizado_trgm_idx on public.anunciantes using gin (nombre_normalizado extensions.gin_trgm_ops);
create index anunciantes_es_demo_idx on public.anunciantes (es_demo) where es_demo;

-- PII de contacto: solo el dueño; los internos, vía revelar_privado_srv / editar_privado_srv (§5.3).
create table public.anunciantes_privado (
  anunciante_id uuid primary key references public.anunciantes (id) on delete cascade,
  contacto_nombre text constraint anunciantes_privado_contacto_nombre_chk check (char_length(contacto_nombre) between 2 and 120),
  contacto_email extensions.citext
    constraint anunciantes_privado_contacto_email_chk check (contacto_email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contacto_celular text constraint anunciantes_privado_contacto_celular_chk check (contacto_celular ~ '^\+?[0-9 ]{7,20}$'),
  direccion text constraint anunciantes_privado_direccion_chk check (char_length(direccion) <= 200),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora()
);

create table public.documentos_anunciante (
  id uuid primary key default private.uuid_v7(),
  anunciante_id uuid not null references public.anunciantes (id) on delete cascade,
  tipo public.documento_anunciante_tipo not null,
  archivo_path text not null,
  estado_validacion public.documento_estado not null default 'PENDIENTE',
  validado_por uuid references public.perfiles (id) on delete set null,
  validado_at timestamptz,
  fecha_vencimiento date,
  observaciones text constraint documentos_anunciante_observaciones_chk check (char_length(observaciones) <= 1000),
  subido_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  -- Ruta ligada a la fila (§3.8): anunciante/{anunciante_id}/{tipo}/{archivo} en el bucket documentos.
  constraint documentos_anunciante_archivo_path_chk check (
    archivo_path like 'anunciante/' || anunciante_id::text || '/' || tipo::text || '/%' and position('..' in archivo_path) = 0)
);
create index documentos_anunciante_anunciante_tipo_idx on public.documentos_anunciante (anunciante_id, tipo);
create index documentos_anunciante_validado_por_idx on public.documentos_anunciante (validado_por);
create index documentos_anunciante_subido_por_idx on public.documentos_anunciante (subido_por);
create index documentos_anunciante_pendientes_idx on public.documentos_anunciante (created_at)
  where estado_validacion = 'PENDIENTE';

create table public.medios (
  id uuid primary key default private.uuid_v7(),
  nombre text not null constraint medios_nombre_chk check (char_length(nombre) between 2 and 120),
  nombre_normalizado text generated always as (private.normalizar_texto(nombre)) stored,
  tipo public.medio_tipo not null,
  municipio_codigo char(5) not null references public.municipios (codigo),
  departamento_codigo char(2) generated always as (left(municipio_codigo, 2)) stored references public.departamentos (codigo),
  descripcion_audiencia text constraint medios_descripcion_audiencia_chk check (char_length(descripcion_audiencia) <= 1000),
  estado public.medio_estado not null default 'PENDIENTE',
  nivel_verificacion smallint not null default 0,
  tasa_cumplimiento numeric(5,4) constraint medios_tasa_cumplimiento_chk check (tasa_cumplimiento between 0 and 1),
  n_cumplimiento integer not null default 0 constraint medios_n_cumplimiento_chk check (n_cumplimiento >= 0),
  calificacion_promedio numeric(3,2) constraint medios_calificacion_chk check (calificacion_promedio between 1 and 5),
  publicaciones_verificadas integer not null default 0 constraint medios_publicaciones_chk check (publicaciones_verificadas >= 0),
  lon numeric(9,6) constraint medios_lon_chk check (lon between -180 and 180),
  lat numeric(9,6) constraint medios_lat_chk check (lat between -90 and 90),
  verificado_por uuid references public.perfiles (id) on delete set null,
  verificado_at timestamptz,
  rechazado_at timestamptz,
  suspendido_at timestamptz,
  motivo_estado text constraint medios_motivo_estado_chk check (char_length(motivo_estado) <= 500),
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz,
  -- D1: estado de 4 valores + nivel 0..3; SUSPENDIDO conserva el nivel.
  constraint medios_nivel_chk check (nivel_verificacion between 0 and 3),
  constraint medios_verificado_nivel_chk check (estado <> 'VERIFICADO' or nivel_verificacion >= 1),
  constraint medios_sin_verificar_nivel_chk check (estado not in ('PENDIENTE', 'RECHAZADO') or nivel_verificacion = 0)
);
create index medios_municipio_codigo_idx on public.medios (municipio_codigo);
create index medios_departamento_codigo_idx on public.medios (departamento_codigo);
create index medios_verificado_por_idx on public.medios (verificado_por);
create index medios_estado_nivel_idx on public.medios (estado, nivel_verificacion) where deleted_at is null;
create index medios_nombre_normalizado_trgm_idx on public.medios using gin (nombre_normalizado extensions.gin_trgm_ops);
create index medios_es_demo_idx on public.medios (es_demo) where es_demo;

-- PII y datos de pago (§12): cifrado AES-256-GCM en servidor (v1:iv:ciphertext:tag); la clave nunca entra a la BD.
create table public.medios_privado (
  medio_id uuid primary key references public.medios (id) on delete cascade,
  titular_nombre text constraint medios_privado_titular_nombre_chk check (char_length(titular_nombre) between 2 and 120),
  tipo_documento public.documento_identidad_tipo,
  numero_documento_cifrado text constraint medios_privado_numero_documento_cifrado_chk
    check (numero_documento_cifrado ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  numero_documento_hash text constraint medios_privado_numero_documento_hash_key unique,   -- HMAC-SHA256 hex
  numero_documento_resumen text constraint medios_privado_numero_documento_resumen_chk check (char_length(numero_documento_resumen) <= 20),
  celular text constraint medios_privado_celular_chk check (celular ~ '^\+?[0-9 ]{7,20}$'),
  email_contacto extensions.citext
    constraint medios_privado_email_contacto_chk check (email_contacto::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  direccion text constraint medios_privado_direccion_chk check (char_length(direccion) <= 200),
  es_declarante boolean not null default false,
  obligado_facturar boolean not null default false,
  responsable_iva boolean not null default false,
  metodo_pago public.metodo_pago,
  datos_pago_cifrados text constraint medios_privado_datos_pago_cifrados_chk
    check (datos_pago_cifrados ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  datos_pago_resumen text constraint medios_privado_datos_pago_resumen_chk check (char_length(datos_pago_resumen) <= 60),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora()
);

create table public.medio_categorias (
  medio_id uuid not null references public.medios (id) on delete cascade,
  categoria_id uuid not null references public.categorias (id) on delete restrict,
  created_at timestamptz not null default private.ahora(),
  primary key (medio_id, categoria_id)
);
create index medio_categorias_categoria_id_idx on public.medio_categorias (categoria_id);

-- Mapa «Origen de audiencia»: la suma por medio no supera 100 (constraint trigger diferido).
create table public.medio_audiencia_paises (
  medio_id uuid not null references public.medios (id) on delete cascade,
  pais_iso2 char(2) not null references public.paises (iso2),
  porcentaje numeric(5,2) not null constraint medio_audiencia_paises_porcentaje_chk check (porcentaje > 0 and porcentaje <= 100),
  fuente public.audiencia_fuente not null default 'DECLARADA',
  actualizado_at timestamptz not null default private.ahora(),
  primary key (medio_id, pais_iso2)
);
create index medio_audiencia_paises_pais_iso2_idx on public.medio_audiencia_paises (pais_iso2);

-- Multiplicador geográfico manual (Fase 1, D15).
create table public.medio_pertinencia_geografica (
  medio_id uuid not null references public.medios (id) on delete cascade,
  municipio_codigo char(5) not null references public.municipios (codigo),
  multiplicador numeric(4,3) not null default 1.000
    constraint medio_pertinencia_geografica_multiplicador_chk check (multiplicador between 0.500 and 1.500),
  clasificado_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  clasificado_at timestamptz not null default private.ahora(),
  notas text constraint medio_pertinencia_geografica_notas_chk check (char_length(notas) <= 500),
  primary key (medio_id, municipio_codigo)
);
create index medio_pertinencia_geografica_municipio_codigo_idx on public.medio_pertinencia_geografica (municipio_codigo);
create index medio_pertinencia_geografica_clasificado_por_idx on public.medio_pertinencia_geografica (clasificado_por);

create table public.documentos_medio (
  id uuid primary key default private.uuid_v7(),
  medio_id uuid not null references public.medios (id) on delete cascade,
  tipo public.documento_medio_tipo not null,
  archivo_path text not null,
  estado_validacion public.documento_estado not null default 'PENDIENTE',
  validado_por uuid references public.perfiles (id) on delete set null,
  validado_at timestamptz,
  fecha_vencimiento date,
  observaciones text constraint documentos_medio_observaciones_chk check (char_length(observaciones) <= 1000),
  subido_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  -- Ruta ligada a la fila (§3.8): medio/{medio_id}/{tipo}/{archivo} en el bucket documentos.
  constraint documentos_medio_archivo_path_chk check (
    archivo_path like 'medio/' || medio_id::text || '/' || tipo::text || '/%' and position('..' in archivo_path) = 0)
);
create index documentos_medio_medio_tipo_idx on public.documentos_medio (medio_id, tipo);
create index documentos_medio_validado_por_idx on public.documentos_medio (validado_por);
create index documentos_medio_subido_por_idx on public.documentos_medio (subido_por);
create index documentos_medio_pendientes_idx on public.documentos_medio (created_at) where estado_validacion = 'PENDIENTE';

create table public.cuentas_sociales (
  id uuid primary key default private.uuid_v7(),
  medio_id uuid not null references public.medios (id) on delete restrict,
  plataforma public.plataforma not null,
  handle extensions.citext not null constraint cuentas_sociales_handle_chk check (handle::text ~ '^[A-Za-z0-9._]{1,60}$'),
  url text not null,
  seguidores_verificados integer constraint cuentas_sociales_seguidores_chk check (seguidores_verificados >= 0),
  franja_id uuid references public.franjas (id) on delete restrict,                 -- derivada por trigger
  verificada boolean not null default false,                                          -- derivado
  metodo_verificacion public.metodo_verificacion,                                     -- derivado
  fecha_ultima_verificacion timestamptz,                                              -- derivado
  tarifa_referencia numeric(14,2) constraint cuentas_sociales_tarifa_referencia_chk check (tarifa_referencia > 0),
  alcance_mediano integer constraint cuentas_sociales_alcance_mediano_chk check (alcance_mediano >= 0),
  indice_calidad numeric(8,6) constraint cuentas_sociales_indice_calidad_chk check (indice_calidad >= 0),
  multiplicador_calidad numeric(4,3) not null default 1.000
    constraint cuentas_sociales_multiplicador_calidad_chk check (multiplicador_calidad between 0.500 and 2.000),
  multiplicador_proximo numeric(4,3)
    constraint cuentas_sociales_multiplicador_proximo_chk check (multiplicador_proximo between 0.500 and 2.000),
  multiplicador_proximo_desde timestamptz,
  multiplicador_calculado_at timestamptz,
  publicaciones_verificadas_count integer not null default 0
    constraint cuentas_sociales_publicaciones_chk check (publicaciones_verificadas_count >= 0),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz,
  constraint cuentas_sociales_url_chk check (char_length(url) <= 300 and (
       (plataforma = 'FACEBOOK' and url ~* '^https://(www\.|m\.|web\.)?facebook\.com/.+')
    or (plataforma = 'INSTAGRAM' and url ~* '^https://(www\.)?instagram\.com/.+')
    or (plataforma = 'TIKTOK' and url ~* '^https://(www\.)?tiktok\.com/@.+'))),
  constraint cuentas_sociales_verificada_chk check (not verificada or (seguidores_verificados is not null
    and metodo_verificacion is not null and fecha_ultima_verificacion is not null)),
  constraint cuentas_sociales_multiplicador_proximo_par_chk
    check ((multiplicador_proximo is null) = (multiplicador_proximo_desde is null))
);
create unique index cuentas_sociales_plataforma_handle_key on public.cuentas_sociales (plataforma, handle) where deleted_at is null;
create index cuentas_sociales_medio_id_idx on public.cuentas_sociales (medio_id);
create index cuentas_sociales_franja_id_idx on public.cuentas_sociales (franja_id);
create index cuentas_sociales_plataforma_franja_idx on public.cuentas_sociales (plataforma, franja_id)
  where verificada and deleted_at is null;
create index cuentas_sociales_reverificacion_idx on public.cuentas_sociales (fecha_ultima_verificacion)
  where verificada and deleted_at is null;

-- Verificación de control de la cuenta (§7.1.1): histórico completo, una fila por intento o reverificación.
create table public.verificaciones_cuenta (
  id uuid primary key default private.uuid_v7(),
  cuenta_social_id uuid not null references public.cuentas_sociales (id) on delete cascade,
  medio_id uuid not null references public.medios (id) on delete cascade,             -- copiado de la cuenta (RLS)
  metodo public.metodo_verificacion not null,
  seguidores_reportados integer not null constraint verificaciones_cuenta_reportados_chk check (seguidores_reportados >= 0),
  seguidores_verificados integer constraint verificaciones_cuenta_verificados_chk check (seguidores_verificados >= 0),
  captura_path text,
  codigo_hash text constraint verificaciones_cuenta_codigo_hash_chk check (codigo_hash ~ '^[0-9a-f]{64}$'),
  codigo_expira_at timestamptz,
  estado_validacion public.validacion_estado not null default 'PENDIENTE',
  validada_por uuid references public.perfiles (id) on delete set null,
  validada_at timestamptz,
  observaciones text constraint verificaciones_cuenta_observaciones_chk check (char_length(observaciones) <= 1000),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  constraint verificaciones_cuenta_captura_path_chk check (captura_path is null
    or (captura_path like 'medio/' || medio_id::text || '/cuenta_social/' || cuenta_social_id::text || '/%'
        and position('..' in captura_path) = 0)),
  constraint verificaciones_cuenta_codigo_chk check (metodo <> 'CODIGO_HISTORIA'
    or (codigo_hash is not null and codigo_expira_at is not null)),
  -- La captura es obligatoria para aprobar (salvo el método API de Fase 2).
  constraint verificaciones_cuenta_aprobada_chk check (estado_validacion <> 'APROBADA'
    or (seguidores_verificados is not null and (metodo = 'API' or captura_path is not null)))
);
create index verificaciones_cuenta_cuenta_idx on public.verificaciones_cuenta (cuenta_social_id, created_at desc);
create index verificaciones_cuenta_medio_id_idx on public.verificaciones_cuenta (medio_id);
create index verificaciones_cuenta_validada_por_idx on public.verificaciones_cuenta (validada_por);
create index verificaciones_cuenta_pendientes_idx on public.verificaciones_cuenta (created_at) where estado_validacion = 'PENDIENTE';
create unique index verificaciones_cuenta_una_pendiente_key on public.verificaciones_cuenta (cuenta_social_id)
  where estado_validacion = 'PENDIENTE';

-- 3. Funciones de trigger

-- Registro y edición de la ubicación: solo municipios (y departamentos) activos; el histórico conserva su código.
create function private.fn_validar_municipio_activo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() or new.municipio_codigo is null then return new; end if;
  if tg_op = 'UPDATE' and new.municipio_codigo is not distinct from old.municipio_codigo then return new; end if;
  if not exists (select 1 from public.municipios m join public.departamentos d on d.codigo = m.departamento_codigo
                 where m.codigo = new.municipio_codigo and m.activo and d.activo) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'El municipio seleccionado no está habilitado en la plataforma.', hint = new.municipio_codigo;
  end if;
  return new;
end $$;
revoke all on function private.fn_validar_municipio_activo() from public, anon, authenticated;

-- Una cuenta no cambia de medio, y una verificada no cambia de usuario, enlace ni plataforma (se registra otra).
create function private.fn_cuentas_sociales_guardar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if new.medio_id is distinct from old.medio_id
     or (old.verificada and (new.handle is distinct from old.handle or new.url is distinct from old.url
                             or new.plataforma is distinct from old.plataforma)) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Una cuenta verificada no puede cambiar de usuario, enlace ni plataforma: registra una cuenta nueva.';
  end if;
  return new;
end $$;
revoke all on function private.fn_cuentas_sociales_guardar() from public, anon, authenticated;

-- Franja derivada de los seguidores verificados (sin franja si está por debajo del umbral).
create function private.fn_cuentas_sociales_franja() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.franja_id := null;
  if new.seguidores_verificados is not null then
    select f.id into new.franja_id from public.franjas f
    where f.activa and new.seguidores_verificados between f.seguidores_min and coalesce(f.seguidores_max, 2147483647)
    order by f.seguidores_min
    limit 1;
  end if;
  return new;
end $$;
revoke all on function private.fn_cuentas_sociales_franja() from public, anon, authenticated;

-- medio_id se copia de la cuenta; toda solicitud nace PENDIENTE; al aprobar, seguidores verificados = reportados
-- (si el verificador no los corrigió), fecha y verificador.
create function private.fn_verificaciones_cuenta_derivar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select c.medio_id into new.medio_id from public.cuentas_sociales c
    where c.id = new.cuenta_social_id and c.deleted_at is null;
    if new.medio_id is null then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'La cuenta social no existe.';
    end if;
    if not private.modo_carga() then
      new.estado_validacion := 'PENDIENTE';
      new.seguidores_verificados := null;
      new.validada_por := null;
      new.validada_at := null;
    end if;
    return new;
  end if;
  if not private.modo_carga()
     and (new.cuenta_social_id is distinct from old.cuenta_social_id or new.medio_id is distinct from old.medio_id
          or new.metodo is distinct from old.metodo) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Una solicitud de verificación no cambia de cuenta ni de método.';
  end if;
  if new.estado_validacion = 'APROBADA' and old.estado_validacion is distinct from 'APROBADA' then
    new.seguidores_verificados := coalesce(new.seguidores_verificados, new.seguidores_reportados);
    new.validada_at := coalesce(new.validada_at, private.ahora());
    new.validada_por := coalesce(new.validada_por, private.actor_id());
  end if;
  return new;
end $$;
revoke all on function private.fn_verificaciones_cuenta_derivar() from public, anon, authenticated;

-- Al aprobar, la cuenta queda verificada con esos seguidores (su franja la recalcula su trigger; los precios ya
-- aceptados no cambian, §10.6). Un rechazo no retira una verificación previa aún vigente.
create function private.fn_verificaciones_cuenta_actualizar_cuenta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado_validacion = 'APROBADA' and old.estado_validacion is distinct from 'APROBADA' then
    update public.cuentas_sociales c set
      verificada = true,
      seguidores_verificados = new.seguidores_verificados,
      metodo_verificacion = new.metodo,
      fecha_ultima_verificacion = new.validada_at
    where c.id = new.cuenta_social_id
      and (c.fecha_ultima_verificacion is null or c.fecha_ultima_verificacion <= new.validada_at);
  end if;
  return null;
end $$;
revoke all on function private.fn_verificaciones_cuenta_actualizar_cuenta() from public, anon, authenticated;

-- Suma de audiencia por país ≤ 100 por medio (se evalúa al final de la transacción).
create function private.fn_medio_audiencia_suma() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select coalesce(sum(a.porcentaje), 0) from public.medio_audiencia_paises a where a.medio_id = new.medio_id) > 100 then
    raise exception using errcode = 'check_violation', constraint = 'medio_audiencia_paises_suma_chk',
      message = 'medio_audiencia_paises_suma_chk',
      detail = 'La suma de la audiencia por país de un medio no puede superar el 100 %.';
  end if;
  return null;
end $$;
revoke all on function private.fn_medio_audiencia_suma() from public, anon, authenticated;

create function private.fn_medio_audiencia_sellar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.modo_carga() then new.actualizado_at := private.ahora(); end if;
  return new;
end $$;
revoke all on function private.fn_medio_audiencia_sellar() from public, anon, authenticated;

-- Quién y cuándo clasificó la pertinencia: siempre el actor efectivo (no se acepta del cliente).
create function private.fn_medio_pertinencia_sellar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not private.modo_carga() then
    new.clasificado_por := private.actor_id();
    new.clasificado_at := private.ahora();
  end if;
  return new;
end $$;
revoke all on function private.fn_medio_pertinencia_sellar() from public, anon, authenticated;

-- 4. Helpers de visibilidad y SRF (§5.1)

-- Vigencia de la verificación de una cuenta (D27): verificada y dentro de reverificación + gracia.
create function private.cuenta_vigente(p_cuenta_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cuentas_sociales c
    where c.id = p_cuenta_id and c.deleted_at is null and c.verificada
      and c.fecha_ultima_verificacion >= private.ahora()
            - make_interval(days => private.config_entero('medios.reverificacion_dias')
                                    + private.config_entero('medios.reverificacion_gracia_dias'))) $$;
revoke all on function private.cuenta_vigente(uuid) from public, anon, authenticated;
grant execute on function private.cuenta_vigente(uuid) to authenticated, service_role;

-- PROVISIONAL hasta negocio_transacciones: sin asignaciones no hay relación anunciante ↔ medio.
create function private.anunciante_ve_medio(p_medio_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select false $$;
revoke all on function private.anunciante_ve_medio(uuid) from public, anon, authenticated;
grant execute on function private.anunciante_ve_medio(uuid) to authenticated, service_role;

-- PROVISIONAL hasta negocio_transacciones (solo se usa dentro de SRF definer: sin grant).
create function private.medio_ve_anunciante(p_anunciante_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select false $$;
revoke all on function private.medio_ve_anunciante(uuid) from public, anon, authenticated;

-- Columnas públicas del anunciante para su contraparte (el medio no lee la tabla base).
create function public.anunciantes_publico(p_ids uuid[] default null)
returns table (id uuid, nombre_comercial text, sector_id uuid, logo_path text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.nombre_comercial, a.sector_id, a.logo_path
  from public.anunciantes a
  where (select private.acceso_valido())
    and (p_ids is null or a.id = any (p_ids))
    and ((select private.tiene_permiso('anunciantes.ver'))
         or a.id = (select private.mi_anunciante_id())
         or private.medio_ve_anunciante(a.id))
  order by a.nombre_comercial, a.id
$$;
revoke all on function public.anunciantes_publico(uuid[]) from public, anon, authenticated;
grant execute on function public.anunciantes_publico(uuid[]) to authenticated;

-- Columnas públicas del medio para su contraparte: sin coordenadas exactas, motivos, verificador,
-- multiplicador ni tarifa de referencia; solo cuentas verificadas no borradas.
create function public.medios_publico(p_ids uuid[] default null)
returns table (id uuid, nombre text, tipo public.medio_tipo, municipio_codigo char(5), departamento_codigo char(2),
               nivel_verificacion smallint, tasa_cumplimiento numeric, n_cumplimiento integer,
               publicaciones_verificadas integer, cuentas jsonb)
language sql stable security definer set search_path = '' as $$
  select m.id, m.nombre, m.tipo, m.municipio_codigo, m.departamento_codigo, m.nivel_verificacion,
         m.tasa_cumplimiento, m.n_cumplimiento, m.publicaciones_verificadas,
         coalesce((select jsonb_agg(jsonb_build_object(
                             'plataforma', c.plataforma, 'handle', c.handle::text, 'url', c.url,
                             'seguidores_verificados', c.seguidores_verificados, 'franja_clave', f.clave,
                             'alcance_mediano', c.alcance_mediano)
                           order by c.plataforma, c.seguidores_verificados desc)
                   from public.cuentas_sociales c
                   left join public.franjas f on f.id = c.franja_id
                   where c.medio_id = m.id and c.deleted_at is null and c.verificada), '[]'::jsonb)
  from public.medios m
  where (select private.acceso_valido())
    and (p_ids is null or m.id = any (p_ids))
    and ((select private.tiene_permiso('medios.ver'))
         or m.id = (select private.mi_medio_id())
         or private.anunciante_ve_medio(m.id))
  order by m.nombre, m.id
$$;
revoke all on function public.medios_publico(uuid[]) from public, anon, authenticated;
grant execute on function public.medios_publico(uuid[]) to authenticated;

-- 5. Triggers
create trigger trg_anunciantes_a_municipio_activo before insert or update of municipio_codigo on public.anunciantes
  for each row execute function private.fn_validar_municipio_activo();
create trigger trg_anunciantes_m_updated_at before update on public.anunciantes
  for each row execute function private.fn_set_updated_at();
create trigger trg_anunciantes_z_auditar after insert or update or delete on public.anunciantes
  for each row execute function private.fn_auditar('id');

create trigger trg_anunciantes_privado_m_updated_at before update on public.anunciantes_privado
  for each row execute function private.fn_set_updated_at();
create trigger trg_anunciantes_privado_z_auditar after insert or update or delete on public.anunciantes_privado
  for each row execute function private.fn_auditar('anunciante_id');

create trigger trg_documentos_anunciante_m_updated_at before update on public.documentos_anunciante
  for each row execute function private.fn_set_updated_at();
create trigger trg_documentos_anunciante_z_auditar after insert or update or delete on public.documentos_anunciante
  for each row execute function private.fn_auditar('id');

create trigger trg_medios_a_municipio_activo before insert or update of municipio_codigo on public.medios
  for each row execute function private.fn_validar_municipio_activo();
create trigger trg_medios_m_updated_at before update on public.medios
  for each row execute function private.fn_set_updated_at();
create trigger trg_medios_z_auditar after insert or update or delete on public.medios
  for each row execute function private.fn_auditar('id');

create trigger trg_medios_privado_m_updated_at before update on public.medios_privado
  for each row execute function private.fn_set_updated_at();
create trigger trg_medios_privado_z_auditar after insert or update or delete on public.medios_privado
  for each row execute function private.fn_auditar('medio_id');

create trigger trg_medio_categorias_z_auditar after insert or update or delete on public.medio_categorias
  for each row execute function private.fn_auditar('medio_id');

create trigger trg_medio_audiencia_paises_m_actualizado before insert or update on public.medio_audiencia_paises
  for each row execute function private.fn_medio_audiencia_sellar();
create constraint trigger trg_medio_audiencia_paises_z_suma after insert or update on public.medio_audiencia_paises
  deferrable initially deferred for each row execute function private.fn_medio_audiencia_suma();
create trigger trg_medio_audiencia_paises_z_auditar after insert or update or delete on public.medio_audiencia_paises
  for each row execute function private.fn_auditar('medio_id');

create trigger trg_medio_pertinencia_geografica_b_sellar before insert or update on public.medio_pertinencia_geografica
  for each row execute function private.fn_medio_pertinencia_sellar();
create trigger trg_medio_pertinencia_geografica_z_auditar after insert or update or delete on public.medio_pertinencia_geografica
  for each row execute function private.fn_auditar('medio_id');

create trigger trg_documentos_medio_m_updated_at before update on public.documentos_medio
  for each row execute function private.fn_set_updated_at();
create trigger trg_documentos_medio_z_auditar after insert or update or delete on public.documentos_medio
  for each row execute function private.fn_auditar('id');

create trigger trg_cuentas_sociales_a_guardar before update on public.cuentas_sociales
  for each row execute function private.fn_cuentas_sociales_guardar();
create trigger trg_cuentas_sociales_b_franja before insert or update of seguidores_verificados on public.cuentas_sociales
  for each row execute function private.fn_cuentas_sociales_franja();
create trigger trg_cuentas_sociales_m_updated_at before update on public.cuentas_sociales
  for each row execute function private.fn_set_updated_at();
create trigger trg_cuentas_sociales_z_auditar after insert or update or delete on public.cuentas_sociales
  for each row execute function private.fn_auditar('id');

create trigger trg_verificaciones_cuenta_b_derivar before insert or update on public.verificaciones_cuenta
  for each row execute function private.fn_verificaciones_cuenta_derivar();
create trigger trg_verificaciones_cuenta_m_updated_at before update on public.verificaciones_cuenta
  for each row execute function private.fn_set_updated_at();
create trigger trg_verificaciones_cuenta_z_auditar after insert or update or delete on public.verificaciones_cuenta
  for each row execute function private.fn_auditar('id');
create trigger trg_verificaciones_cuenta_z_derivar_cuenta after update of estado_validacion on public.verificaciones_cuenta
  for each row execute function private.fn_verificaciones_cuenta_actualizar_cuenta();

-- 6. RLS y políticas
alter table public.anunciantes enable row level security;
alter table public.anunciantes_privado enable row level security;
alter table public.documentos_anunciante enable row level security;
alter table public.medios enable row level security;
alter table public.medios_privado enable row level security;
alter table public.medio_categorias enable row level security;
alter table public.medio_audiencia_paises enable row level security;
alter table public.medio_pertinencia_geografica enable row level security;
alter table public.documentos_medio enable row level security;
alter table public.cuentas_sociales enable row level security;
alter table public.verificaciones_cuenta enable row level security;

do $$
declare t text;
begin
  foreach t in array array['anunciantes', 'anunciantes_privado', 'documentos_anunciante', 'medios', 'medios_privado',
                           'medio_categorias', 'medio_audiencia_paises', 'medio_pertinencia_geografica',
                           'documentos_medio', 'cuentas_sociales', 'verificaciones_cuenta'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated
                      using ((select private.acceso_valido())) with check ((select private.acceso_valido()))',
                   t || ': acceso válido', t);
  end loop;
end $$;

-- 6.1 Anunciantes: interno por permiso, dueño por organización. Sin permisiva para medios (anunciantes_publico).
create policy "anunciantes: select interno o propio" on public.anunciantes for select to authenticated
  using ((select private.tiene_permiso('anunciantes.ver')) or (select private.tiene_permiso('facturas.gestionar'))
         or (id = (select private.mi_anunciante_id()) and deleted_at is null));
create policy "anunciantes: insert interno" on public.anunciantes for insert to authenticated
  with check ((select private.tiene_permiso('anunciantes.editar')));
create policy "anunciantes: update interno o propio" on public.anunciantes for update to authenticated
  using ((select private.tiene_permiso('anunciantes.editar'))
         or (id = (select private.mi_anunciante_id()) and deleted_at is null
             and (select private.tiene_permiso('anunciantes.editar_propio'))))
  with check ((select private.tiene_permiso('anunciantes.editar'))
              or (id = (select private.mi_anunciante_id()) and deleted_at is null
                  and (select private.tiene_permiso('anunciantes.editar_propio'))));

create policy "anunciantes_privado: select propio" on public.anunciantes_privado for select to authenticated
  using (anunciante_id = (select private.mi_anunciante_id()));
create policy "anunciantes_privado: insert propio" on public.anunciantes_privado for insert to authenticated
  with check (anunciante_id = (select private.mi_anunciante_id())
              and (select private.tiene_permiso('anunciantes.editar_propio')));
create policy "anunciantes_privado: update propio" on public.anunciantes_privado for update to authenticated
  using (anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('anunciantes.editar_propio')))
  with check (anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('anunciantes.editar_propio')));

create policy "documentos_anunciante: select propio o verificador" on public.documentos_anunciante for select to authenticated
  using (anunciante_id = (select private.mi_anunciante_id()) or (select private.tiene_permiso('anunciantes.verificar')));
create policy "documentos_anunciante: insert propio" on public.documentos_anunciante for insert to authenticated
  with check (anunciante_id = (select private.mi_anunciante_id())
              and (select private.tiene_permiso('anunciantes.editar_propio')));

-- 6.2 Medios: sin permisiva para anunciantes (medios_publico).
create policy "medios: select interno o propio" on public.medios for select to authenticated
  using ((select private.tiene_permiso('medios.ver')) or (id = (select private.mi_medio_id()) and deleted_at is null));
create policy "medios: insert interno" on public.medios for insert to authenticated
  with check ((select private.tiene_permiso('medios.editar')));
create policy "medios: update interno o propio" on public.medios for update to authenticated
  using ((select private.tiene_permiso('medios.editar'))
         or (id = (select private.mi_medio_id()) and deleted_at is null and (select private.tiene_permiso('medios.editar_propio'))))
  with check ((select private.tiene_permiso('medios.editar'))
              or (id = (select private.mi_medio_id()) and deleted_at is null
                  and (select private.tiene_permiso('medios.editar_propio'))));

create policy "medios_privado: select propio" on public.medios_privado for select to authenticated
  using (medio_id = (select private.mi_medio_id()));
create policy "medios_privado: insert propio" on public.medios_privado for insert to authenticated
  with check (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')));
create policy "medios_privado: update propio" on public.medios_privado for update to authenticated
  using (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')))
  with check (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')));

create policy "medio_categorias: select" on public.medio_categorias for select to authenticated
  using ((select private.tiene_permiso('medios.ver')) or medio_id = (select private.mi_medio_id())
         or private.anunciante_ve_medio(medio_id));
create policy "medio_categorias: insert propio o interno" on public.medio_categorias for insert to authenticated
  with check ((medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')))
              or (select private.tiene_permiso('medios.editar')));
create policy "medio_categorias: delete propio o interno" on public.medio_categorias for delete to authenticated
  using ((medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')))
         or (select private.tiene_permiso('medios.editar')));

-- La audiencia propia solo se declara (fuente DECLARADA); la verificada la registran los internos.
create policy "medio_audiencia_paises: select" on public.medio_audiencia_paises for select to authenticated
  using ((select private.tiene_permiso('medios.ver')) or medio_id = (select private.mi_medio_id())
         or private.anunciante_ve_medio(medio_id));
create policy "medio_audiencia_paises: insert propio o interno" on public.medio_audiencia_paises for insert to authenticated
  with check ((medio_id = (select private.mi_medio_id()) and fuente = 'DECLARADA'
               and (select private.tiene_permiso('medios.editar_propio')))
              or (select private.tiene_permiso('medios.editar')));
create policy "medio_audiencia_paises: update propio o interno" on public.medio_audiencia_paises for update to authenticated
  using ((medio_id = (select private.mi_medio_id()) and fuente = 'DECLARADA'
          and (select private.tiene_permiso('medios.editar_propio')))
         or (select private.tiene_permiso('medios.editar')))
  with check ((medio_id = (select private.mi_medio_id()) and fuente = 'DECLARADA'
               and (select private.tiene_permiso('medios.editar_propio')))
              or (select private.tiene_permiso('medios.editar')));
create policy "medio_audiencia_paises: delete propio o interno" on public.medio_audiencia_paises for delete to authenticated
  using ((medio_id = (select private.mi_medio_id()) and fuente = 'DECLARADA'
          and (select private.tiene_permiso('medios.editar_propio')))
         or (select private.tiene_permiso('medios.editar')));

create policy "medio_pertinencia_geografica: select" on public.medio_pertinencia_geografica for select to authenticated
  using ((select private.tiene_permiso('medios.ver')) or medio_id = (select private.mi_medio_id()));
create policy "medio_pertinencia_geografica: insert interno" on public.medio_pertinencia_geografica for insert to authenticated
  with check ((select private.tiene_permiso('medios.clasificar_pertinencia')));
create policy "medio_pertinencia_geografica: update interno" on public.medio_pertinencia_geografica for update to authenticated
  using ((select private.tiene_permiso('medios.clasificar_pertinencia')))
  with check ((select private.tiene_permiso('medios.clasificar_pertinencia')));
create policy "medio_pertinencia_geografica: delete interno" on public.medio_pertinencia_geografica for delete to authenticated
  using ((select private.tiene_permiso('medios.clasificar_pertinencia')));

-- Documentos de identidad: el verificador los ve solo si además puede revelar datos sensibles.
create policy "documentos_medio: select propio o verificador" on public.documentos_medio for select to authenticated
  using (medio_id = (select private.mi_medio_id())
         or ((select private.tiene_permiso('medios.verificar')) and (select private.tiene_permiso('datos_sensibles.ver'))));
create policy "documentos_medio: insert propio" on public.documentos_medio for insert to authenticated
  with check (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')));

create policy "cuentas_sociales: select interno o propio" on public.cuentas_sociales for select to authenticated
  using ((select private.tiene_permiso('medios.ver')) or (medio_id = (select private.mi_medio_id()) and deleted_at is null));
create policy "cuentas_sociales: insert propio" on public.cuentas_sociales for insert to authenticated
  with check (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio')));
create policy "cuentas_sociales: update interno o propio" on public.cuentas_sociales for update to authenticated
  using ((select private.tiene_permiso('medios.editar'))
         or (medio_id = (select private.mi_medio_id()) and deleted_at is null
             and (select private.tiene_permiso('medios.editar_propio'))))
  with check ((select private.tiene_permiso('medios.editar'))
              or (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('medios.editar_propio'))));

-- El medio pide la verificación MANUAL y corrige su solicitud mientras está PENDIENTE; CODIGO_HISTORIA la crea el
-- servidor (genera el código) y la aprobación/rechazo va por transicionar_srv.
create policy "verificaciones_cuenta: select verificador o propio" on public.verificaciones_cuenta for select to authenticated
  using ((select private.tiene_permiso('medios.verificar')) or medio_id = (select private.mi_medio_id()));
create policy "verificaciones_cuenta: insert propio" on public.verificaciones_cuenta for insert to authenticated
  with check (medio_id = (select private.mi_medio_id()) and metodo = 'MANUAL'
              and (select private.tiene_permiso('medios.editar_propio')));
create policy "verificaciones_cuenta: update propio pendiente" on public.verificaciones_cuenta for update to authenticated
  using (medio_id = (select private.mi_medio_id()) and estado_validacion = 'PENDIENTE'
         and (select private.tiene_permiso('medios.editar_propio')))
  with check (medio_id = (select private.mi_medio_id()) and estado_validacion = 'PENDIENTE'
              and (select private.tiene_permiso('medios.editar_propio')));

-- 7. Grants (mínimos y explícitos; anon no recibe nada)
grant select,
      insert (razon_social, nombre_comercial, nit, digito_verificacion, identificacion_extranjera, sector_id, pais_iso2,
              municipio_codigo, ciudad_extranjera, logo_path, datos_facturacion),
      update (razon_social, nombre_comercial, sector_id, municipio_codigo, ciudad_extranjera, logo_path, datos_facturacion,
              deleted_at)
  on public.anunciantes to authenticated;
grant select, insert (anunciante_id, contacto_nombre, contacto_email, contacto_celular, direccion),
      update (contacto_nombre, contacto_email, contacto_celular, direccion)
  on public.anunciantes_privado to authenticated;
grant select, insert (anunciante_id, tipo, archivo_path, fecha_vencimiento) on public.documentos_anunciante to authenticated;
grant select, insert (nombre, tipo, municipio_codigo, descripcion_audiencia, lon, lat),
      update (nombre, tipo, municipio_codigo, descripcion_audiencia, lon, lat, deleted_at)
  on public.medios to authenticated;
-- Cifrados, hash, pago y banderas tributarias: solo el servidor (Server Action que cifra o registra la verificación).
grant select (medio_id, titular_nombre, tipo_documento, numero_documento_resumen, celular, email_contacto, direccion,
              es_declarante, obligado_facturar, responsable_iva, metodo_pago, datos_pago_resumen, created_at, updated_at),
      insert (medio_id, titular_nombre, tipo_documento, celular, email_contacto, direccion),
      update (titular_nombre, tipo_documento, celular, email_contacto, direccion)
  on public.medios_privado to authenticated;
grant select, insert (medio_id, categoria_id), delete on public.medio_categorias to authenticated;
grant select, insert (medio_id, pais_iso2, porcentaje, fuente), update (porcentaje), delete
  on public.medio_audiencia_paises to authenticated;
grant select, insert (medio_id, municipio_codigo, multiplicador, notas), update (multiplicador, notas), delete
  on public.medio_pertinencia_geografica to authenticated;
grant select, insert (medio_id, tipo, archivo_path, fecha_vencimiento) on public.documentos_medio to authenticated;
grant select, insert (medio_id, plataforma, handle, url, tarifa_referencia), update (handle, url, tarifa_referencia, deleted_at)
  on public.cuentas_sociales to authenticated;
grant select, insert (cuenta_social_id, metodo, seguidores_reportados, captura_path),
      update (seguidores_reportados, captura_path)
  on public.verificaciones_cuenta to authenticated;

grant select, insert, update, delete on public.anunciantes, public.anunciantes_privado, public.documentos_anunciante,
  public.medios, public.medios_privado, public.medio_categorias, public.medio_audiencia_paises,
  public.medio_pertinencia_geografica, public.documentos_medio, public.cuentas_sociales, public.verificaciones_cuenta
  to service_role;

-- 8. Clasificación de columnas auditadas (§3.3; las sensibles de _privado, documentos y verificaciones vienen de M4).
--    Indicadores recalculados por cron: omitidos para no generar una fila de bitácora por medio y día.
insert into private.auditoria_columnas (tabla, columna, tratamiento) values
  ('medios', 'tasa_cumplimiento', 'OMITIR'),
  ('medios', 'n_cumplimiento', 'OMITIR'),
  ('medios', 'publicaciones_verificadas', 'OMITIR'),
  ('cuentas_sociales', 'alcance_mediano', 'OMITIR'),
  ('cuentas_sociales', 'indice_calidad', 'OMITIR'),
  ('cuentas_sociales', 'multiplicador_calculado_at', 'OMITIR'),
  ('cuentas_sociales', 'publicaciones_verificadas_count', 'OMITIR')
on conflict (tabla, columna) do update set tratamiento = excluded.tratamiento;

-- 9. Organización E2E (es_demo): las cuentas E2E ya la referencian en perfiles.anunciante_id, así que se siembra
--    ANTES de crear la FK. NIT ficticio con DV válido (algoritmo DIAN).
insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2,
                                municipio_codigo, estado_verificacion, verificado_at, es_demo)
values ('e2e00000-0000-4000-8000-00000000a001', 'Anunciante E2E S.A.S.', 'Anunciante E2E', '999000001', '2',
        (select s.id from public.sectores s where s.nombre_normalizado = 'otros' and s.deleted_at is null),
        'CO', '11001', 'VERIFICADO', private.ahora(), true)
on conflict (id) do nothing;

alter table public.perfiles add constraint perfiles_anunciante_id_fkey
  foreign key (anunciante_id) references public.anunciantes (id) on delete restrict;
alter table public.perfiles add constraint perfiles_medio_id_fkey
  foreign key (medio_id) references public.medios (id) on delete restrict;

-- 10. Lista blanca de EXECUTE para authenticated en private.
create or replace function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header',
               'modo_carga', 'purga_habilitada',
               'actor_id', 'contexto_confiable', 'mi_rol_id', 'mi_anunciante_id', 'mi_medio_id', 'tiene_permiso',
               'acceso_valido', 'config_entero', 'config_decimal', 'config_texto', 'config_booleano', 'config_lista',
               'cuenta_vigente', 'anunciante_ve_medio']::text[] $$;

-- 11. Verificación
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
  assert not has_column_privilege('authenticated', 'public.medios_privado', 'datos_pago_cifrados', 'select')
     and not has_column_privilege('authenticated', 'public.medios_privado', 'numero_documento_hash', 'select')
     and not has_column_privilege('authenticated', 'public.medios_privado', 'metodo_pago', 'insert'),
         'authenticated no debe leer ni escribir los datos cifrados de medios_privado';
  assert exists (select 1 from public.anunciantes where id = 'e2e00000-0000-4000-8000-00000000a001' and es_demo),
         'falta el anunciante E2E';
  assert (select count(*) from pg_constraint
          where conrelid = 'public.perfiles'::regclass and conname in ('perfiles_anunciante_id_fkey', 'perfiles_medio_id_fkey')) = 2,
         'faltan las FK de perfiles hacia anunciantes y medios';
  assert has_function_privilege('authenticated', 'public.medios_publico(uuid[])', 'execute')
     and has_function_privilege('authenticated', 'public.anunciantes_publico(uuid[])', 'execute')
     and has_function_privilege('authenticated', 'private.cuenta_vigente(uuid)', 'execute')
     and not has_function_privilege('authenticated', 'private.medio_ve_anunciante(uuid)', 'execute'),
         'EXECUTE de helpers y SRF de negocio_actores incorrecto';
end $$;
