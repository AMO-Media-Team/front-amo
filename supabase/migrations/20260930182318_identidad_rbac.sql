-- Migración 3 · identidad_rbac (docs/modelo-datos.md §2.3, §3.1, §3.2, §5.1, §5.2, §5.4, §6, §7)
-- Roles, permisos, perfiles, catálogos base, configuración de seguridad, helpers de política y guardas.
-- Orden interno (§11): enums → funciones plpgsql (no se validan contra tablas al crearse) → tablas →
-- funciones sql → triggers → RLS/políticas → grants → semillas → verificación.
-- El secreto de Vault `amo_servidor_secret` se crea FUERA de este archivo (nunca se versiona).

-- 1. Enums
create type public.rol_tipo as enum ('ADMIN', 'ANUNCIANTE', 'MEDIO');
create type public.perfil_estado as enum ('INVITADO', 'ACTIVO', 'SUSPENDIDO', 'DESACTIVADO');
create type public.config_tipo as enum ('ENTERO', 'DECIMAL', 'PORCENTAJE', 'BOOLEANO', 'TEXTO', 'LISTA_TEXTO', 'MAPA_DECIMAL');
create type public.documento_identidad_tipo as enum ('CC', 'CE', 'PPT', 'PASAPORTE', 'NIT');

-- 2. Funciones plpgsql previas a las tablas (defaults de columnas y helpers de sesión)

-- Procedencia confiable: compara x-amo-srv con el secreto en Vault. Cachea el resultado por transacción.
create function private.contexto_confiable() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_cache text := current_setting('amo.ctx_confiable', true); v_hdr text; v_sec text; v_ok boolean;
begin
  if v_cache in ('si', 'no') then return v_cache = 'si'; end if;
  v_hdr := private.header('x-amo-srv');
  if v_hdr is null then v_ok := false;
  else
    select ds.decrypted_secret into v_sec from vault.decrypted_secrets ds where ds.name = 'amo_servidor_secret';
    v_ok := v_sec is not null and sha256(convert_to(v_hdr, 'UTF8')) = sha256(convert_to(v_sec, 'UTF8'));
  end if;
  perform set_config('amo.ctx_confiable', case when v_ok then 'si' else 'no' end, true);
  return v_ok;
end $$;
revoke all on function private.contexto_confiable() from public, anon, authenticated;
grant execute on function private.contexto_confiable() to authenticated, service_role;

-- Actor efectivo: usuario del JWT o, en llamadas del servidor con secret key y contexto confiable, x-amo-actor / amo.actor_id.
create function private.actor_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is not null then return v; end if;
  v := nullif(current_setting('amo.actor_id', true), '')::uuid;         -- fijado por *_srv (set_config local)
  if v is not null then return v; end if;
  if private.contexto_confiable() then
    return nullif(private.header('x-amo-actor'), '')::uuid;
  end if;
  return null;
end $$;
revoke all on function private.actor_id() from public, anon, authenticated;
grant execute on function private.actor_id() to authenticated, service_role;

-- Lectura tipada de public.configuracion; si falta la clave lanza AMO_CONFIG_INVALIDA (§5.1).
create function private.config_valor(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select c.valor into v from public.configuracion c where c.clave = p_clave;
  if v is null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = format('Falta la clave de configuración «%s».', p_clave);
  end if;
  return v;
end $$;
revoke all on function private.config_valor(text) from public, anon, authenticated;

-- Núcleo compartido por acceso_valido() (políticas) y validar_actor() (*_srv): sesión viva del usuario,
-- perfil ACTIVO con rol, AAL2 si el rol lo exige (según auth.sessions.aal, fuente de verdad) e inactividad.
create function private.sesion_valida(p_uid uuid, p_sid uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tipo public.rol_tipo; v_mfa boolean; v_estado public.perfil_estado;
  v_aal text; v_creada timestamptz; v_ult timestamptz; v_max_min integer;
begin
  if p_uid is null or p_sid is null then return false; end if;
  -- 1) La sesión existe, es del usuario (cerrar sesión / suspender borra la fila) y no expiró.
  select s.aal::text, s.created_at into v_aal, v_creada from auth.sessions s
   where s.id = p_sid and s.user_id = p_uid and (s.not_after is null or s.not_after > now());
  if not found then return false; end if;
  -- 2) Perfil ACTIVO con rol.
  select p.estado, r.tipo, r.requiere_mfa into v_estado, v_tipo, v_mfa
  from public.perfiles p join public.roles r on r.id = p.rol_id
  where p.id = p_uid and p.deleted_at is null;
  if v_estado is distinct from 'ACTIVO' then return false; end if;
  -- 3) AAL2 si el rol lo exige.
  if v_mfa and coalesce(v_aal, 'aal1') <> 'aal2' then return false; end if;
  -- 4) Inactividad máxima por tipo de rol.
  v_max_min := private.config_entero('seguridad.inactividad_minutos_' || lower(v_tipo::text));
  select a.ultima_actividad_at into v_ult from private.sesiones_actividad a
   where a.session_id = p_sid and a.usuario_id = p_uid;
  return coalesce(v_ult, v_creada) > now() - make_interval(mins => v_max_min);   -- sin fila: sesión recién creada
end $$;
-- EXECUTE solo para el owner (la usan funciones definer); no se concede a authenticated.
revoke all on function private.sesion_valida(uuid, uuid) from public, anon, authenticated;

-- Revalida en BD al actor que el servidor declara (§5.2): perfil ACTIVO, permiso y SESIÓN (viva, del actor,
-- AAL e inactividad). Se crea aquí (y no en negocio_transacciones) porque la usan los *_srv de M3/M4.
create function private.validar_actor(p_actor uuid, p_permiso text, p_session uuid) returns public.rol_tipo
language plpgsql volatile security definer set search_path = '' as $$
declare v_tipo public.rol_tipo;
begin
  if private.modo_carga() then return null; end if;
  select r.tipo into v_tipo from public.perfiles p join public.roles r on r.id = p.rol_id
  where p.id = p_actor and p.estado = 'ACTIVO' and p.deleted_at is null;
  if v_tipo is null
     or (p_permiso is not null and not private.tiene_permiso_de(p_actor, p_permiso))
     or not private.sesion_valida(p_actor, p_session) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'No tienes permiso para esta acción.';
  end if;
  perform set_config('amo.actor_id', p_actor::text, true);
  return v_tipo;
end $$;
revoke all on function private.validar_actor(uuid, text, uuid) from public, anon, authenticated;

-- 3. Tablas

create table public.roles (
  id uuid primary key default private.uuid_v7(),
  clave text not null constraint roles_clave_key unique
    constraint roles_clave_chk check (clave ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  nombre text not null constraint roles_nombre_chk check (char_length(nombre) between 2 and 60),
  descripcion text constraint roles_descripcion_chk check (char_length(descripcion) <= 300),
  tipo public.rol_tipo not null,
  es_sistema boolean not null default false,
  requiere_mfa boolean not null default false,
  color text not null default '#8C66EE' constraint roles_color_chk check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  -- Todo rol interno exige MFA (§12).
  constraint roles_mfa_interno_chk check (tipo <> 'ADMIN' or requiere_mfa)
);

create table public.permisos (
  clave text primary key constraint permisos_clave_chk check (clave ~ '^[a-z_]+\.[a-z_]+$'),
  modulo text not null,
  descripcion text not null,
  es_sensible boolean not null default false,
  orden smallint not null default 0,
  constraint permisos_modulo_chk check (modulo = split_part(clave, '.', 1))
);

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null constraint perfiles_email_key unique,
  nombre text constraint perfiles_nombre_chk check (char_length(nombre) between 2 and 120),
  celular text constraint perfiles_celular_chk check (celular ~ '^\+?[0-9 ]{7,20}$'),
  avatar_path text,
  preferencias jsonb not null default '{}'
    constraint perfiles_preferencias_chk check (jsonb_typeof(preferencias) = 'object' and pg_column_size(preferencias) < 8192),
  rol_id uuid references public.roles (id) on delete restrict,            -- null = sin acceso
  anunciante_id uuid,                                                      -- FK → anunciantes en negocio_actores
  medio_id uuid,                                                           -- FK → medios en negocio_actores
  estado public.perfil_estado not null default 'INVITADO',
  debe_cambiar_password boolean not null default true,
  invitado_por uuid references public.perfiles (id) on delete set null,
  activado_at timestamptz,
  suspendido_at timestamptz,
  desactivado_at timestamptz,
  ultimo_acceso_at timestamptz,
  motivo_estado text constraint perfiles_motivo_estado_chk check (char_length(motivo_estado) <= 500),
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz,
  constraint perfiles_avatar_path_chk check (avatar_path like ('perfil/' || id::text || '/%')),
  constraint perfiles_organizacion_chk check (num_nonnulls(anunciante_id, medio_id) <= 1),
  constraint perfiles_desactivado_chk check (estado <> 'DESACTIVADO' or deleted_at is not null)
);
create index perfiles_rol_id_idx on public.perfiles (rol_id);
create index perfiles_anunciante_id_idx on public.perfiles (anunciante_id) where anunciante_id is not null;
create index perfiles_medio_id_idx on public.perfiles (medio_id) where medio_id is not null;
create index perfiles_invitado_por_idx on public.perfiles (invitado_por);
create index perfiles_estado_idx on public.perfiles (estado);
create index perfiles_email_trgm_idx on public.perfiles using gin ((email::text) extensions.gin_trgm_ops);
create index perfiles_nombre_trgm_idx on public.perfiles using gin (private.normalizar_texto(nombre) extensions.gin_trgm_ops);
create index perfiles_es_demo_idx on public.perfiles (es_demo) where es_demo;

create table public.rol_permisos (
  rol_id uuid not null references public.roles (id) on delete cascade,
  permiso_clave text not null references public.permisos (clave) on update cascade on delete cascade,
  otorgado_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  primary key (rol_id, permiso_clave)
);
create index rol_permisos_permiso_clave_idx on public.rol_permisos (permiso_clave);
create index rol_permisos_otorgado_por_idx on public.rol_permisos (otorgado_por);

create table public.perfiles_privado (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  tipo_documento public.documento_identidad_tipo,
  -- AES-256-GCM en servidor con AMO_CIFRADO_KEY (v1:iv:ciphertext:tag); la clave nunca entra a la BD.
  numero_documento_cifrado text constraint perfiles_privado_numero_documento_cifrado_chk
    check (numero_documento_cifrado ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  numero_documento_hash text,                                              -- HMAC-SHA256 hex
  numero_documento_resumen text,                                           -- '•••• 1234'
  fecha_nacimiento date,
  direccion text constraint perfiles_privado_direccion_chk check (char_length(direccion) <= 200),
  notas_internas text,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora()
);
create index perfiles_privado_numero_documento_hash_idx on public.perfiles_privado (numero_documento_hash)
  where numero_documento_hash is not null;

create table public.sectores (
  id uuid primary key default private.uuid_v7(),
  nombre text not null constraint sectores_nombre_chk check (char_length(nombre) between 2 and 80),
  nombre_normalizado text generated always as (private.normalizar_texto(nombre)) stored,
  descripcion text,
  orden smallint not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz
);
create unique index sectores_nombre_normalizado_key on public.sectores (nombre_normalizado) where deleted_at is null;

create table public.categorias (
  id uuid primary key default private.uuid_v7(),
  nombre text not null constraint categorias_nombre_chk check (char_length(nombre) between 2 and 80),
  nombre_normalizado text generated always as (private.normalizar_texto(nombre)) stored,
  descripcion text,
  orden smallint not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora(),
  deleted_at timestamptz
);
create unique index categorias_nombre_normalizado_key on public.categorias (nombre_normalizado) where deleted_at is null;

-- Se crea aquí porque acceso_valido() y el limitador la leen; configuracion (M5) siembra las claves de negocio.
create table public.configuracion (
  clave text primary key constraint configuracion_clave_chk check (clave ~ '^[a-z_]+(\.[a-z_]+)+$'),
  valor jsonb not null,
  tipo public.config_tipo not null,
  minimo numeric,
  maximo numeric,
  opciones text[],
  modulo text not null,
  descripcion text not null,
  unidad text,
  es_publica boolean not null default false,
  pendiente_validacion boolean not null default false,
  actualizado_por uuid default private.actor_id() references public.perfiles (id) on delete set null,
  created_at timestamptz not null default private.ahora(),
  updated_at timestamptz not null default private.ahora()
);
create index configuracion_actualizado_por_idx on public.configuracion (actualizado_por);

-- Inactividad real (auth.sessions.refreshed_at avanza aunque el usuario esté inactivo). No expuesta; sin RLS ni grants.
create table private.sesiones_actividad (
  session_id uuid primary key,                                             -- id de auth.sessions (sin FK: esquema ajeno)
  usuario_id uuid not null,
  ultima_actividad_at timestamptz not null default private.ahora(),
  created_at timestamptz not null default private.ahora()
);
create index sesiones_actividad_usuario_id_idx on private.sesiones_actividad (usuario_id);

-- 4. Funciones sql (se validan contra las tablas ya creadas)

create function private.mi_rol_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.rol_id from public.perfiles p where p.id = (select auth.uid()) $$;          -- sin exigir ACTIVO (excepciones §2.3)
revoke all on function private.mi_rol_id() from public, anon, authenticated;
grant execute on function private.mi_rol_id() to authenticated, service_role;

create function private.mi_anunciante_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.anunciante_id from public.perfiles p
  where p.id = (select auth.uid()) and p.estado = 'ACTIVO' and p.deleted_at is null $$;
revoke all on function private.mi_anunciante_id() from public, anon, authenticated;
grant execute on function private.mi_anunciante_id() to authenticated, service_role;

create function private.mi_medio_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.medio_id from public.perfiles p
  where p.id = (select auth.uid()) and p.estado = 'ACTIVO' and p.deleted_at is null $$;
revoke all on function private.mi_medio_id() from public, anon, authenticated;
grant execute on function private.mi_medio_id() to authenticated, service_role;

create function private.tiene_permiso(p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles p
    join public.rol_permisos rp on rp.rol_id = p.rol_id
    where p.id = (select auth.uid()) and p.estado = 'ACTIVO' and p.deleted_at is null
      and rp.permiso_clave = p_clave) $$;
revoke all on function private.tiene_permiso(text) from public, anon, authenticated;
grant execute on function private.tiene_permiso(text) to authenticated, service_role;

-- Variante para procedimientos *_srv (actor explícito). SIN grant a authenticated.
create function private.tiene_permiso_de(p_actor uuid, p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles p join public.rol_permisos rp on rp.rol_id = p.rol_id
                 where p.id = p_actor and p.estado = 'ACTIVO' and p.deleted_at is null and rp.permiso_clave = p_clave) $$;
revoke all on function private.tiene_permiso_de(uuid, text) from public, anon, authenticated;

create function private.acceso_valido() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sesion_valida((select auth.uid()), nullif((select auth.jwt()) ->> 'session_id', '')::uuid) $$;
revoke all on function private.acceso_valido() from public, anon, authenticated;
grant execute on function private.acceso_valido() to authenticated, service_role;

create function private.config_entero(p_clave text) returns integer
language sql stable security definer set search_path = '' as $$
  select (private.config_valor(p_clave) #>> '{}')::integer $$;
revoke all on function private.config_entero(text) from public, anon, authenticated;
grant execute on function private.config_entero(text) to authenticated, service_role;

create function private.config_decimal(p_clave text) returns numeric
language sql stable security definer set search_path = '' as $$
  select (private.config_valor(p_clave) #>> '{}')::numeric $$;
revoke all on function private.config_decimal(text) from public, anon, authenticated;
grant execute on function private.config_decimal(text) to authenticated, service_role;

create function private.config_texto(p_clave text) returns text
language sql stable security definer set search_path = '' as $$
  select private.config_valor(p_clave) #>> '{}' $$;
revoke all on function private.config_texto(text) from public, anon, authenticated;
grant execute on function private.config_texto(text) to authenticated, service_role;

create function private.config_booleano(p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (private.config_valor(p_clave) #>> '{}')::boolean $$;
revoke all on function private.config_booleano(text) from public, anon, authenticated;
grant execute on function private.config_booleano(text) to authenticated, service_role;

create function private.config_lista(p_clave text) returns text[]
language sql stable security definer set search_path = '' as $$
  select array(select jsonb_array_elements_text(private.config_valor(p_clave))) $$;
revoke all on function private.config_lista(text) from public, anon, authenticated;
grant execute on function private.config_lista(text) to authenticated, service_role;

-- Anti-escalada en la administración de usuarios (§5.4). Sin EXECUTE para API.
create function private.puede_gestionar(p_actor uuid, p_objetivo uuid, p_rol_destino uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id
                 where p.id = p_actor and r.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null) then true
    when exists (select 1 from public.perfiles o join public.roles r on r.id = o.rol_id
                 where o.id = p_objetivo and r.clave = 'SUPERADMIN') then false            -- nadie salvo SUPERADMIN toca a un SUPERADMIN
    else not exists (select 1 from public.rol_permisos rp
                     where rp.rol_id in (p_rol_destino, (select o.rol_id from public.perfiles o where o.id = p_objetivo))
                       and not private.tiene_permiso_de(p_actor, rp.permiso_clave))       -- el actor tiene todo permiso del rol actual y del destino
  end $$;
revoke all on function private.puede_gestionar(uuid, uuid, uuid) from public, anon, authenticated;

-- SRF de visibilidad (§5.1): compañeros de la misma organización con columnas públicas.
create function public.miembros_organizacion()
returns table (id uuid, nombre text, email text, avatar_path text, rol_clave text,
               estado public.perfil_estado, ultimo_acceso_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, p.email::text, p.avatar_path, r.clave, p.estado, p.ultimo_acceso_at
  from public.perfiles p
  left join public.roles r on r.id = p.rol_id
  where (select private.acceso_valido())
    and p.deleted_at is null
    and ((p.anunciante_id is not null and p.anunciante_id = (select private.mi_anunciante_id()))
      or (p.medio_id is not null and p.medio_id = (select private.mi_medio_id())))
  order by p.nombre nulls last, p.email
$$;
revoke all on function public.miembros_organizacion() from public, anon, authenticated;
grant execute on function public.miembros_organizacion() to authenticated;

-- 5. Funciones de trigger

-- Roles de sistema inmutables salvo color/descripcion (D20); es_sistema solo lo fija el owner.
create function private.fn_guardar_roles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if session_user = 'postgres' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.es_sistema then
      raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
        detail = 'Solo una migración puede crear roles de sistema.';
    end if;
    return new;
  end if;
  if old.es_sistema then
    if tg_op = 'DELETE' then
      raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
        detail = 'Los roles de sistema no se pueden eliminar.';
    end if;
    if (to_jsonb(new) - '{color,descripcion,updated_at}'::text[])
       is distinct from (to_jsonb(old) - '{color,descripcion,updated_at}'::text[]) then
      raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
        detail = 'De un rol de sistema solo se pueden cambiar el color y la descripción.';
    end if;
  elsif tg_op = 'UPDATE' and new.es_sistema then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
      detail = 'Solo una migración puede marcar un rol como de sistema.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.fn_guardar_roles() from public, anon, authenticated;

-- Permisos de roles: rol de sistema solo por migración; anti-escalada; nadie edita su propio rol.
create function private.fn_guardar_rol_permisos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rol uuid; v_clave text; v_actor uuid;
begin
  if session_user = 'postgres' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then v_rol := old.rol_id; v_clave := old.permiso_clave;
  else v_rol := new.rol_id; v_clave := new.permiso_clave; end if;
  if exists (select 1 from public.roles r where r.id = v_rol and r.es_sistema) then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_SISTEMA',
      detail = 'Los permisos de los roles de sistema solo cambian por migración.';
  end if;
  v_actor := private.actor_id();
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Cambiar permisos de un rol requiere un actor identificado.';
  end if;
  if exists (select 1 from public.perfiles p where p.id = v_actor and p.rol_id = v_rol) then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_PROPIO',
      detail = 'No puedes cambiar los permisos de tu propio rol.';
  end if;
  -- SUPERADMIN tiene todos los permisos, así que la comprobación también lo cubre.
  if not private.tiene_permiso_de(v_actor, v_clave) then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes otorgar ni retirar un permiso que no tienes.', hint = v_clave;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.fn_guardar_rol_permisos() from public, anon, authenticated;

-- SUPERADMIN siempre tiene todos los permisos (§6).
create function private.fn_permisos_superadmin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rol_permisos (rol_id, permiso_clave)
  select r.id, new.clave from public.roles r where r.clave = 'SUPERADMIN'
  on conflict (rol_id, permiso_clave) do nothing;
  return null;
end $$;
revoke all on function private.fn_permisos_superadmin() from public, anon, authenticated;

-- Guardas de perfiles (§5.4): actor desconocido, rol propio, SUPERADMIN, anti-escalada, último SUPERADMIN,
-- coherencia rol ↔ organización y debe_cambiar_password.
create function private.fn_guardar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner constant boolean := session_user = 'postgres';
  v_old public.perfiles;
  v_new public.perfiles;
  v_actor uuid;
  v_super uuid;
  v_objetivo uuid;
  v_rol_destino uuid;
  v_rol_cambia boolean;
  v_toca_super boolean;
  v_era_super boolean;
  v_sera_super boolean;
  v_hay_super boolean;
  v_tipo public.rol_tipo;
begin
  if private.modo_carga() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op <> 'INSERT' then v_old := old; end if;
  if tg_op <> 'DELETE' then v_new := new; end if;

  v_actor := private.actor_id();
  select r.id into v_super from public.roles r where r.clave = 'SUPERADMIN';
  v_objetivo := coalesce(v_new.id, v_old.id);
  v_rol_destino := case when tg_op = 'DELETE' then v_old.rol_id else v_new.rol_id end;
  v_rol_cambia := case tg_op
                    when 'INSERT' then v_new.rol_id is not null
                    when 'UPDATE' then v_new.rol_id is distinct from v_old.rol_id
                    else v_old.rol_id is not null end;
  v_toca_super := v_rol_cambia
                  and (v_new.rol_id is not distinct from v_super or v_old.rol_id is not distinct from v_super);
  v_era_super := coalesce(v_old.rol_id = v_super and v_old.estado = 'ACTIVO' and v_old.deleted_at is null, false);
  v_sera_super := coalesce(v_new.rol_id = v_super and v_new.estado = 'ACTIVO' and v_new.deleted_at is null, false);
  v_hay_super := exists (select 1 from public.perfiles p
                         where p.rol_id = v_super and p.estado = 'ACTIVO' and p.deleted_at is null);

  -- 0) Actor desconocido: solo (a) el INSERT de handle_new_user, (b) INVITADO → ACTIVO sin otros cambios
  --    con amo.actor_tipo = 'SISTEMA' (activar_perfil_srv), (c) bootstrap del primer SUPERADMIN,
  --    (d) owner conectado directamente y (e) el borrado en cascada de auth.admin.deleteUser (Auth).
  if v_actor is null and not v_owner then
    if not coalesce(
         (tg_op = 'INSERT' and v_new.rol_id is null and v_new.estado = 'INVITADO')
      or (tg_op = 'UPDATE' and v_old.estado = 'INVITADO' and v_new.estado = 'ACTIVO'
          and coalesce(current_setting('amo.actor_tipo', true), '') = 'SISTEMA'
          and v_new.rol_id is not distinct from v_old.rol_id
          and v_new.anunciante_id is not distinct from v_old.anunciante_id
          and v_new.medio_id is not distinct from v_old.medio_id
          and v_new.debe_cambiar_password = v_old.debe_cambiar_password
          and v_new.deleted_at is not distinct from v_old.deleted_at)
      or (tg_op <> 'DELETE' and v_new.rol_id is not distinct from v_super and not v_hay_super)
      or (tg_op = 'DELETE' and session_user = 'supabase_auth_admin'), false) then
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'La operación sobre el perfil requiere un actor identificado.';
    end if;
  end if;

  -- 1) Nadie cambia su propio rol.
  if tg_op = 'UPDATE' and v_rol_cambia and v_actor = v_old.id then
    raise exception using errcode = 'P0001', message = 'AMO_ROL_PROPIO',
      detail = 'No puedes cambiar tu propio rol.';
  end if;

  -- 2) Solo SUPERADMIN asigna o quita SUPERADMIN (sin actor: solo el bootstrap o el owner).
  if v_toca_super then
    if v_actor is null then
      if not v_owner and v_hay_super then
        raise exception using errcode = 'P0001', message = 'AMO_SOLO_SUPERADMIN',
          detail = 'Solo un superadministrador puede asignar o quitar ese rol.';
      end if;
    elsif not exists (select 1 from public.perfiles p
                      where p.id = v_actor and p.rol_id = v_super and p.estado = 'ACTIVO' and p.deleted_at is null) then
      raise exception using errcode = 'P0001', message = 'AMO_SOLO_SUPERADMIN',
        detail = 'Solo un superadministrador puede asignar o quitar ese rol.';
    end if;
  end if;

  -- 2b) Anti-escalada sobre terceros.
  if v_actor is not null and v_actor <> v_objetivo
     and (tg_op = 'DELETE'
          or (tg_op = 'INSERT' and v_new.rol_id is not null)
          or (tg_op = 'UPDATE' and (v_rol_cambia
                or v_new.estado is distinct from v_old.estado
                or v_new.anunciante_id is distinct from v_old.anunciante_id
                or v_new.medio_id is distinct from v_old.medio_id
                or v_new.deleted_at is distinct from v_old.deleted_at
                or v_new.debe_cambiar_password is distinct from v_old.debe_cambiar_password)))
     and not private.puede_gestionar(v_actor, v_objetivo, v_rol_destino) then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes gestionar a un usuario con permisos que no tienes.';
  end if;

  -- 3) Siempre queda al menos un SUPERADMIN activo.
  if v_era_super and not v_sera_super then
    perform pg_advisory_xact_lock(hashtext('amo.superadmins'));
    if not exists (select 1 from public.perfiles p
                   where p.rol_id = v_super and p.estado = 'ACTIVO' and p.deleted_at is null and p.id <> v_old.id) then
      raise exception using errcode = 'P0001', message = 'AMO_ULTIMO_SUPERADMIN',
        detail = 'Debe quedar al menos un superadministrador activo.';
    end if;
  end if;

  -- 4) Coherencia tipo de rol ↔ organización de un perfil ACTIVO.
  if tg_op <> 'DELETE' and v_new.estado = 'ACTIVO' then
    select r.tipo into v_tipo from public.roles r where r.id = v_new.rol_id;
    if v_tipo is null
       or (v_tipo = 'ADMIN' and num_nonnulls(v_new.anunciante_id, v_new.medio_id) > 0)
       or (v_tipo = 'ANUNCIANTE' and v_new.anunciante_id is null)
       or (v_tipo = 'MEDIO' and v_new.medio_id is null) then
      raise exception using errcode = 'check_violation', constraint = 'perfiles_rol_organizacion_chk',
        message = 'perfiles_rol_organizacion_chk',
        detail = 'Un perfil activo necesita un rol y la organización que exige su tipo de rol.';
    end if;
  end if;

  -- 5) debe_cambiar_password solo pasa a false desde el servidor.
  if tg_op = 'UPDATE' and v_old.debe_cambiar_password and not v_new.debe_cambiar_password
     and not (v_owner or private.contexto_confiable()
              or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'El cambio obligatorio de contraseña solo lo cierra el servidor.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.fn_guardar_perfil() from public, anon, authenticated;

-- Alta de perfil denegado por defecto. Nunca lee raw_user_meta_data (editable por el usuario).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, email, estado, rol_id, debe_cambiar_password)
  values (new.id, new.email, 'INVITADO', null, true)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create function private.fn_sincronizar_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.perfiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
revoke all on function private.fn_sincronizar_email() from public, anon, authenticated;

-- Valida valor contra tipo/mínimo/máximo/opciones (§5.6). Se crea con la tabla que valida.
create function private.fn_validar_configuracion() returns trigger
language plpgsql set search_path = '' as $$
declare
  v jsonb := new.valor;
  v_error text;
begin
  case new.tipo
    when 'ENTERO' then
      if jsonb_typeof(v) <> 'number' then v_error := 'debe ser un número entero';
      elsif (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then v_error := 'debe ser un número entero';
      end if;
    when 'DECIMAL' then
      if jsonb_typeof(v) <> 'number' then v_error := 'debe ser un número'; end if;
    when 'PORCENTAJE' then
      if jsonb_typeof(v) <> 'number' then v_error := 'debe ser una fracción entre 0 y 1';
      elsif (v #>> '{}')::numeric not between 0 and 1 then v_error := 'debe ser una fracción entre 0 y 1';
      end if;
    when 'BOOLEANO' then
      if jsonb_typeof(v) <> 'boolean' then v_error := 'debe ser verdadero o falso'; end if;
    when 'TEXTO' then
      if jsonb_typeof(v) <> 'string' then v_error := 'debe ser un texto';
      elsif new.opciones is not null and (v #>> '{}') <> all (new.opciones) then v_error := 'no es una opción permitida';
      end if;
    when 'LISTA_TEXTO' then
      if jsonb_typeof(v) <> 'array' then v_error := 'debe ser una lista de textos';
      elsif exists (select 1 from jsonb_array_elements(v) e(x) where jsonb_typeof(e.x) <> 'string') then
        v_error := 'debe ser una lista de textos';
      elsif new.opciones is not null
            and exists (select 1 from jsonb_array_elements_text(v) e(x) where e.x <> all (new.opciones)) then
        v_error := 'contiene opciones no permitidas';
      end if;
    when 'MAPA_DECIMAL' then
      if jsonb_typeof(v) <> 'object' then v_error := 'debe ser un mapa de valores numéricos';
      elsif exists (select 1 from jsonb_each(v) e where jsonb_typeof(e.value) <> 'number') then
        v_error := 'debe ser un mapa de valores numéricos';
      elsif new.opciones is not null and exists (select 1 from jsonb_object_keys(v) k(x) where k.x <> all (new.opciones)) then
        v_error := 'contiene claves no permitidas';
      end if;
  end case;

  if v_error is null and new.tipo in ('ENTERO', 'DECIMAL', 'PORCENTAJE')
     and ((new.minimo is not null and (v #>> '{}')::numeric < new.minimo)
          or (new.maximo is not null and (v #>> '{}')::numeric > new.maximo)) then
    v_error := format('debe estar entre %s y %s', coalesce(new.minimo::text, '−∞'), coalesce(new.maximo::text, '∞'));
  elsif v_error is null and new.tipo = 'MAPA_DECIMAL'
        and exists (select 1 from jsonb_each_text(v) e
                    where (new.minimo is not null and e.value::numeric < new.minimo)
                       or (new.maximo is not null and e.value::numeric > new.maximo)) then
    v_error := format('tiene valores fuera del rango %s a %s', coalesce(new.minimo::text, '−∞'), coalesce(new.maximo::text, '∞'));
  end if;

  -- Opciones que viven en otras tablas (§7).
  if v_error is null and new.clave = 'seguridad.paises_habituales'
     and exists (select 1 from jsonb_array_elements_text(v) e(x)
                 where not exists (select 1 from public.paises p where p.iso2 = e.x)) then
    v_error := 'contiene códigos de país que no existen';
  elsif v_error is null and new.clave = 'tributario.municipio_plataforma'
        and not exists (select 1 from public.municipios m where m.codigo = (v #>> '{}')) then
    v_error := 'no es un código DIVIPOLA existente';
  end if;

  if v_error is not null then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = format('El valor de «%s» %s.', new.clave, v_error);
  end if;
  return new;
end $$;
revoke all on function private.fn_validar_configuracion() from public, anon, authenticated;

-- 6. RPC solo-servidor (EXECUTE solo service_role)

-- Registra actividad real de la sesión (el DAL la llama con throttle); alimenta la inactividad de sesion_valida.
create function public.tocar_sesion_srv(p_usuario_id uuid, p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_usuario_id) then
    return;
  end if;
  insert into private.sesiones_actividad as a (session_id, usuario_id)
  values (p_session_id, p_usuario_id)
  on conflict (session_id) do update set ultima_actividad_at = private.ahora()
  where a.usuario_id = p_usuario_id
    and a.ultima_actividad_at < private.ahora() - interval '30 seconds';
end $$;
revoke all on function public.tocar_sesion_srv(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tocar_sesion_srv(uuid, uuid) to service_role;

-- Autoriza acciones de Admin API sin trigger (generateLink, ban, signOut de terceros) ANTES de llamar a Auth.
create function public.autorizar_gestion_usuario_srv(p_actor_id uuid, p_session_id uuid, p_objetivo uuid, p_accion text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_permiso text;
begin
  v_permiso := case p_accion
    when 'GENERAR_ENLACE' then 'usuarios.generar_enlace'
    when 'CERRAR_SESIONES' then 'usuarios.cerrar_sesiones'
    when 'SUSPENDER' then 'usuarios.suspender'
    when 'EDITAR' then 'usuarios.editar'
    when 'INVITAR' then 'usuarios.invitar'
  end;
  if v_permiso is null then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Acción de gestión de usuarios desconocida.', hint = p_accion;
  end if;
  perform private.validar_actor(p_actor_id, v_permiso, p_session_id);
  if not private.puede_gestionar(p_actor_id, p_objetivo,
                                 (select p.rol_id from public.perfiles p where p.id = p_objetivo)) then
    raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
      detail = 'No puedes gestionar a un usuario con permisos que no tienes.';
  end if;
end $$;
revoke all on function public.autorizar_gestion_usuario_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.autorizar_gestion_usuario_srv(uuid, uuid, uuid, text) to service_role;

-- 7. Triggers
create trigger trg_roles_a_guardar before insert or update or delete on public.roles
  for each row execute function private.fn_guardar_roles();
create trigger trg_roles_m_updated_at before update on public.roles
  for each row execute function private.fn_set_updated_at();

create trigger trg_permisos_b_superadmin after insert on public.permisos
  for each row execute function private.fn_permisos_superadmin();

create trigger trg_rol_permisos_a_guardar before insert or delete on public.rol_permisos
  for each row execute function private.fn_guardar_rol_permisos();

create trigger trg_perfiles_a_guardar
  before insert or update of rol_id, estado, anunciante_id, medio_id, debe_cambiar_password, deleted_at or delete
  on public.perfiles for each row execute function private.fn_guardar_perfil();
create trigger trg_perfiles_m_updated_at before update on public.perfiles
  for each row execute function private.fn_set_updated_at();

create trigger trg_perfiles_privado_m_updated_at before update on public.perfiles_privado
  for each row execute function private.fn_set_updated_at();
create trigger trg_sectores_m_updated_at before update on public.sectores
  for each row execute function private.fn_set_updated_at();
create trigger trg_categorias_m_updated_at before update on public.categorias
  for each row execute function private.fn_set_updated_at();

create trigger trg_configuracion_a_validar before insert or update on public.configuracion
  for each row execute function private.fn_validar_configuracion();
create trigger trg_configuracion_m_updated_at before update on public.configuracion
  for each row execute function private.fn_set_updated_at();

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_email_updated after update of email on auth.users
  for each row execute function private.fn_sincronizar_email();

-- 8. RLS y políticas
alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.rol_permisos enable row level security;
alter table public.perfiles enable row level security;
alter table public.perfiles_privado enable row level security;
alter table public.sectores enable row level security;
alter table public.categorias enable row level security;
alter table public.configuracion enable row level security;

-- 8.1 geo (lectura creada en `geo`): restrictiva estándar, contexto confiable y escritura de `activo`.
create policy "paises: acceso válido" on public.paises as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "departamentos: acceso válido" on public.departamentos as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "municipios: acceso válido" on public.municipios as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));

create policy "departamentos: escritura desde servidor" on public.departamentos as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "departamentos: actualización desde servidor" on public.departamentos as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "departamentos: borrado desde servidor" on public.departamentos as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "departamentos: update interno" on public.departamentos for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));

create policy "municipios: escritura desde servidor" on public.municipios as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "municipios: actualización desde servidor" on public.municipios as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "municipios: borrado desde servidor" on public.municipios as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "municipios: update interno" on public.municipios for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));

-- 8.2 roles: restrictivas por operación con excepción SELECT del rol propio (§2.3) + contexto confiable.
create policy "roles: acceso válido select" on public.roles as restrictive for select to authenticated
  using ((select private.acceso_valido()) or id = (select private.mi_rol_id()));
create policy "roles: acceso válido insert" on public.roles as restrictive for insert to authenticated
  with check ((select private.acceso_valido()));
create policy "roles: acceso válido update" on public.roles as restrictive for update to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "roles: acceso válido delete" on public.roles as restrictive for delete to authenticated
  using ((select private.acceso_valido()));
create policy "roles: escritura desde servidor" on public.roles as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "roles: actualización desde servidor" on public.roles as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "roles: borrado desde servidor" on public.roles as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "roles: select" on public.roles for select to authenticated
  using ((select private.tiene_permiso('roles.ver')) or (select private.tiene_permiso('usuarios.ver'))
         or id = (select private.mi_rol_id()));
create policy "roles: insert interno" on public.roles for insert to authenticated
  with check ((select private.tiene_permiso('roles.gestionar')));
create policy "roles: update interno" on public.roles for update to authenticated
  using ((select private.tiene_permiso('roles.gestionar'))) with check ((select private.tiene_permiso('roles.gestionar')));
create policy "roles: delete interno" on public.roles for delete to authenticated
  using ((select private.tiene_permiso('roles.gestionar')));

-- 8.3 permisos: excepción SELECT de los permisos del rol propio; sin escritura para authenticated.
create policy "permisos: acceso válido select" on public.permisos as restrictive for select to authenticated
  using ((select private.acceso_valido())
         or clave in (select rp.permiso_clave from public.rol_permisos rp where rp.rol_id = (select private.mi_rol_id())));
create policy "permisos: acceso válido insert" on public.permisos as restrictive for insert to authenticated
  with check ((select private.acceso_valido()));
create policy "permisos: acceso válido update" on public.permisos as restrictive for update to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "permisos: acceso válido delete" on public.permisos as restrictive for delete to authenticated
  using ((select private.acceso_valido()));
create policy "permisos: select" on public.permisos for select to authenticated
  using ((select private.tiene_permiso('roles.ver'))
         or clave in (select rp.permiso_clave from public.rol_permisos rp where rp.rol_id = (select private.mi_rol_id())));

-- 8.4 rol_permisos: excepción SELECT del rol propio + contexto confiable.
create policy "rol_permisos: acceso válido select" on public.rol_permisos as restrictive for select to authenticated
  using ((select private.acceso_valido()) or rol_id = (select private.mi_rol_id()));
create policy "rol_permisos: acceso válido insert" on public.rol_permisos as restrictive for insert to authenticated
  with check ((select private.acceso_valido()));
create policy "rol_permisos: acceso válido update" on public.rol_permisos as restrictive for update to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "rol_permisos: acceso válido delete" on public.rol_permisos as restrictive for delete to authenticated
  using ((select private.acceso_valido()));
create policy "rol_permisos: escritura desde servidor" on public.rol_permisos as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "rol_permisos: actualización desde servidor" on public.rol_permisos as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "rol_permisos: borrado desde servidor" on public.rol_permisos as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "rol_permisos: select" on public.rol_permisos for select to authenticated
  using ((select private.tiene_permiso('roles.ver')) or rol_id = (select private.mi_rol_id()));
create policy "rol_permisos: insert interno" on public.rol_permisos for insert to authenticated
  with check ((select private.tiene_permiso('roles.gestionar')));
create policy "rol_permisos: delete interno" on public.rol_permisos for delete to authenticated
  using ((select private.tiene_permiso('roles.gestionar')));

-- 8.5 perfiles: excepción SELECT de la fila propia; sin permisiva «misma organización» (SRF miembros_organizacion).
create policy "perfiles: acceso válido select" on public.perfiles as restrictive for select to authenticated
  using ((select private.acceso_valido()) or id = (select auth.uid()));
create policy "perfiles: acceso válido insert" on public.perfiles as restrictive for insert to authenticated
  with check ((select private.acceso_valido()));
create policy "perfiles: acceso válido update" on public.perfiles as restrictive for update to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "perfiles: acceso válido delete" on public.perfiles as restrictive for delete to authenticated
  using ((select private.acceso_valido()));
create policy "perfiles: select propio" on public.perfiles for select to authenticated
  using (id = (select auth.uid()));
create policy "perfiles: select interno" on public.perfiles for select to authenticated
  using ((select private.tiene_permiso('usuarios.ver')));
create policy "perfiles: update propio" on public.perfiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 8.6 perfiles_privado: solo el dueño; los internos usan revelar_privado_srv / editar_privado_srv.
create policy "perfiles_privado: acceso válido" on public.perfiles_privado as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "perfiles_privado: select propio" on public.perfiles_privado for select to authenticated
  using (perfil_id = (select auth.uid()));
create policy "perfiles_privado: insert propio" on public.perfiles_privado for insert to authenticated
  with check (perfil_id = (select auth.uid()));
create policy "perfiles_privado: update propio" on public.perfiles_privado for update to authenticated
  using (perfil_id = (select auth.uid())) with check (perfil_id = (select auth.uid()));

-- 8.7 sectores y categorías
create policy "sectores: acceso válido" on public.sectores as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "sectores: escritura desde servidor" on public.sectores as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "sectores: actualización desde servidor" on public.sectores as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "sectores: borrado desde servidor" on public.sectores as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "sectores: select" on public.sectores for select to authenticated
  using ((activo and deleted_at is null) or (select private.tiene_permiso('configuracion.ver')));
create policy "sectores: insert interno" on public.sectores for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "sectores: update interno" on public.sectores for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "sectores: delete interno" on public.sectores for delete to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')));

create policy "categorias: acceso válido" on public.categorias as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "categorias: escritura desde servidor" on public.categorias as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "categorias: actualización desde servidor" on public.categorias as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "categorias: borrado desde servidor" on public.categorias as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "categorias: select" on public.categorias for select to authenticated
  using ((activo and deleted_at is null) or (select private.tiene_permiso('configuracion.ver')));
create policy "categorias: insert interno" on public.categorias for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "categorias: update interno" on public.categorias for update to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')))
  with check ((select private.tiene_permiso('configuracion.catalogos')));
create policy "categorias: delete interno" on public.categorias for delete to authenticated
  using ((select private.tiene_permiso('configuracion.catalogos')));

-- 8.8 configuracion
create policy "configuracion: acceso válido" on public.configuracion as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "configuracion: escritura desde servidor" on public.configuracion as restrictive for insert to authenticated
  with check ((select private.contexto_confiable()));
create policy "configuracion: actualización desde servidor" on public.configuracion as restrictive for update to authenticated
  using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "configuracion: borrado desde servidor" on public.configuracion as restrictive for delete to authenticated
  using ((select private.contexto_confiable()));
create policy "configuracion: select" on public.configuracion for select to authenticated
  using (es_publica or (select private.tiene_permiso('configuracion.ver')));
create policy "configuracion: update interno" on public.configuracion for update to authenticated
  using ((select private.tiene_permiso('configuracion.editar'))
         and (clave not like 'comision.%' or (select private.tiene_permiso('configuracion.comisiones'))))
  with check ((select private.tiene_permiso('configuracion.editar'))
              and (clave not like 'comision.%' or (select private.tiene_permiso('configuracion.comisiones'))));

-- 9. Grants (mínimos y explícitos; anon no recibe nada)
grant update (activo) on public.departamentos, public.municipios to authenticated;

grant select, insert, update (nombre, descripcion, requiere_mfa, color), delete on public.roles to authenticated;
grant select, insert, update, delete on public.roles to service_role;

grant select on public.permisos to authenticated, service_role;

grant select, insert (rol_id, permiso_clave), delete on public.rol_permisos to authenticated;
grant select, insert, update, delete on public.rol_permisos to service_role;

grant select, update (nombre, celular, preferencias, avatar_path) on public.perfiles to authenticated;
grant select, insert, update, delete on public.perfiles to service_role;

grant select (perfil_id, tipo_documento, numero_documento_resumen, fecha_nacimiento, direccion, created_at, updated_at),
      insert (perfil_id, tipo_documento, fecha_nacimiento, direccion),
      update (tipo_documento, fecha_nacimiento, direccion)
  on public.perfiles_privado to authenticated;
grant select, insert, update, delete on public.perfiles_privado to service_role;

grant select, insert, update (nombre, descripcion, orden, activo, deleted_at) on public.sectores to authenticated;
grant select, insert, update, delete on public.sectores to service_role;
grant select, insert, update (nombre, descripcion, orden, activo, deleted_at) on public.categorias to authenticated;
grant select, insert, update, delete on public.categorias to service_role;

grant select, update (valor) on public.configuracion to authenticated;
grant select, insert, update, delete on public.configuracion to service_role;

-- 10. Semillas

-- 10.1 Roles de sistema (= ROLES_SISTEMA de src/lib/auth/permisos.ts).
insert into public.roles (clave, nombre, descripcion, tipo, es_sistema, requiere_mfa, color) values
  ('SUPERADMIN', 'Superadministrador', 'Control total de la plataforma, incluidos roles y superadministradores.', 'ADMIN', true, true, '#A788F6'),
  ('ADMIN', 'Administrador', 'Administra usuarios, configuración y la operación de la plataforma.', 'ADMIN', true, true, '#7549DE'),
  ('OPERACIONES', 'Operaciones', 'Verifica medios y anunciantes, modera ofertas y valida ejecución.', 'ADMIN', true, true, '#5B6CF0'),
  ('FINANZAS', 'Finanzas', 'Gestiona liquidaciones, facturas, pagos y parámetros tributarios.', 'ADMIN', true, true, '#C77DFF'),
  ('ANUNCIANTE', 'Anunciante', 'Empresa que crea campañas y ofertas de pauta.', 'ANUNCIANTE', true, false, '#3FB8AF'),
  ('MEDIO', 'Medio', 'Medio hiperlocal que acepta ofertas y publica contenido.', 'MEDIO', true, false, '#F2A65A')
on conflict (clave) do nothing;

-- 10.2 Catálogo de permisos (supabase/seed/permisos.sql, generado por pnpm db:permisos, sin cambios).
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
  ('cuenta.gestionar', 'cuenta', 'Gestionar el perfil, la seguridad y las preferencias propias', false, 70)
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
  ('MEDIO', 'cuenta.gestionar')
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

-- 10.3 Sectores (industria del anunciante) y categorías (temática del medio).
insert into public.sectores (nombre, orden) values
  ('Alimentos y bebidas', 1), ('Retail y comercio', 2), ('Banca y seguros', 3), ('Telecomunicaciones', 4),
  ('Salud y farmacia', 5), ('Educación', 6), ('Gobierno y entidades públicas', 7), ('Automotor', 8),
  ('Construcción e inmobiliario', 9), ('Entretenimiento', 10), ('Tecnología', 11),
  ('Energía y servicios públicos', 12), ('Turismo', 13), ('Otros', 14);

insert into public.categorias (nombre, orden) values
  ('Noticias generales', 1), ('Deportes', 2), ('Entretenimiento', 3), ('Comunidad', 4), ('Política', 5),
  ('Cultura', 6), ('Economía local', 7), ('Humor', 8), ('Música', 9), ('Otros', 10);

-- 10.4 Claves de configuración de seguridad (§7; el resto se siembra en `configuracion`).
insert into public.configuracion (clave, valor, tipo, minimo, maximo, modulo, descripcion, unidad, es_publica) values
  ('seguridad.inactividad_minutos_admin', '30', 'ENTERO', 5, 480, 'seguridad',
   'Minutos sin actividad tras los que se invalida la sesión de un usuario interno (tipo de rol ADMIN).', 'min', false),
  ('seguridad.inactividad_minutos_anunciante', '120', 'ENTERO', 5, 1440, 'seguridad',
   'Minutos sin actividad tras los que se invalida la sesión de un anunciante.', 'min', false),
  ('seguridad.inactividad_minutos_medio', '720', 'ENTERO', 5, 10080, 'seguridad',
   'Minutos sin actividad tras los que se invalida la sesión de un medio (uso móvil).', 'min', false),
  ('seguridad.aviso_inactividad_segundos', '120', 'ENTERO', 30, 600, 'seguridad',
   'Segundos de cuenta regresiva que muestra el cliente antes de cerrar la sesión por inactividad.', 's', true),
  ('seguridad.sesion_actividad_throttle_segundos', '60', 'ENTERO', 15, 600, 'seguridad',
   'Intervalo mínimo entre dos registros de actividad de la misma sesión.', 's', false),
  ('seguridad.login_max_fallos_email', '5', 'ENTERO', 3, 20, 'seguridad',
   'Intentos fallidos permitidos por par correo e IP dentro de la ventana antes del bloqueo temporal.', 'intentos', false),
  ('seguridad.login_max_fallos_ip', '20', 'ENTERO', 5, 200, 'seguridad',
   'Intentos fallidos permitidos desde una IP, para todas las cuentas, dentro de la ventana (password spraying).', 'intentos', false),
  ('seguridad.login_max_fallos_email_global', '30', 'ENTERO', 10, 500, 'seguridad',
   'Intentos fallidos permitidos para un correo desde cualquier IP; alto para que nadie pueda bloquear cuentas ajenas.', 'intentos', false),
  ('seguridad.login_ventana_minutos', '15', 'ENTERO', 1, 1440, 'seguridad',
   'Ventana de tiempo en la que se cuentan los intentos fallidos de ingreso.', 'min', false),
  ('seguridad.login_bloqueo_minutos', '15', 'ENTERO', 1, 1440, 'seguridad',
   'Duración del bloqueo temporal de ingreso tras superar un umbral.', 'min', false),
  ('seguridad.paises_habituales', '["CO"]', 'LISTA_TEXTO', null, null, 'seguridad',
   'Países (ISO 3166-1 alfa-2) desde los que un ingreso exitoso no se marca como país inusual.', null, false)
on conflict (clave) do nothing;

-- 11. Lista blanca de EXECUTE para authenticated en private (se amplía en cada migración).
create or replace function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header',
               'actor_id', 'contexto_confiable', 'mi_rol_id', 'mi_anunciante_id', 'mi_medio_id', 'tiene_permiso',
               'acceso_valido', 'config_entero', 'config_decimal', 'config_texto', 'config_booleano', 'config_lista']::text[] $$;

-- 12. Verificación
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
  assert (select count(*) from public.roles where es_sistema) = 6, 'roles: se esperaban 6 roles de sistema';
  assert (select count(*) from public.rol_permisos rp join public.roles r on r.id = rp.rol_id where r.clave = 'SUPERADMIN')
         = (select count(*) from public.permisos), 'SUPERADMIN debe tener todos los permisos';
  assert (select count(*) from public.configuracion where clave like 'seguridad.%') = 11,
         'configuracion: se esperaban 11 claves de seguridad';
  assert has_table_privilege('postgres', 'auth.sessions', 'select')
     and has_table_privilege('postgres', 'auth.sessions', 'delete'),
         'el owner de las funciones definer debe poder leer y borrar auth.sessions';
end $$;
