-- Migración 4 · bitacora_accesos (docs/modelo-datos.md §3.3, §5.3, §5.5, §11)
-- Bitácora append-only con diff redactado, registro de accesos, limitador de login y RPC de sesiones y
-- datos sensibles. Adjunta la auditoría (z_auditar) a las tablas de identidad_rbac y a departamentos/municipios.

-- 1. Enums
create type public.bitacora_origen as enum ('APP', 'DB', 'API_DIRECTA', 'DEMO');
create type public.acceso_evento as enum ('LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGIN_BLOQUEADO', 'MFA_EXITOSO', 'MFA_FALLIDO',
  'CIERRE_SESION', 'SESION_EXPIRADA', 'SESION_REVOCADA', 'USUARIO_SUSPENDIDO', 'RECUPERACION_SOLICITADA', 'CONTRASENA_CAMBIADA');
create type public.auditoria_tratamiento as enum ('OMITIR', 'HASH', 'ENMASCARAR');

-- 2. Tablas

create table public.bitacora (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default private.ahora(),
  actor_id uuid,                                   -- sin FK: un `set null` sería un UPDATE prohibido
  actor_email text,                                -- snapshot enmascarado
  actor_rol text,                                  -- snapshot de roles.clave
  entidad text not null,
  entidad_id text,
  accion text not null constraint bitacora_accion_chk check (accion in ('INSERT', 'UPDATE', 'DELETE', 'TRANSICION',
    'EXPORTAR', 'REVELAR_DATO', 'URL_FIRMADA', 'INVITAR', 'GENERAR_ENLACE', 'SUSPENDER', 'REACTIVAR',
    'CERRAR_SESIONES', 'CAMBIAR_ROL', 'BORRADO_DEFINITIVO', 'CONFIGURAR', 'OTRO')),
  estado_anterior text,
  estado_nuevo text,
  cambios jsonb,
  metadatos jsonb not null default '{}',
  motivo text,
  origen public.bitacora_origen not null,
  ip inet,
  pais_iso2 char(2) references public.paises (iso2),
  ciudad text,
  user_agent text constraint bitacora_user_agent_chk check (char_length(user_agent) <= 400),
  es_demo boolean not null default false
);
create index bitacora_created_at_brin on public.bitacora using brin (created_at);
create index bitacora_entidad_idx on public.bitacora (entidad, entidad_id, id desc);
create index bitacora_actor_idx on public.bitacora (actor_id, id desc) where actor_id is not null;
create index bitacora_accion_idx on public.bitacora (accion, id desc);
create index bitacora_pais_iso2_idx on public.bitacora (pais_iso2) where pais_iso2 is not null;
create index bitacora_es_demo_idx on public.bitacora (es_demo) where es_demo;

-- Clasificación de columnas auditadas (tabla '*' = todas); cada migración posterior agrega las suyas.
create table private.auditoria_columnas (
  tabla text not null,
  columna text not null,
  tratamiento public.auditoria_tratamiento not null,
  primary key (tabla, columna)
);

create table public.accesos (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default private.ahora(),
  usuario_id uuid references public.perfiles (id) on delete set null,
  email_hash text,                                 -- sha256(lower(email)) hex: correlación sin PII
  evento public.acceso_evento not null,
  session_id uuid,
  aal text constraint accesos_aal_chk check (aal in ('aal1', 'aal2')),
  ip inet,
  pais_iso2 char(2) references public.paises (iso2),
  departamento_codigo char(2) references public.departamentos (codigo),
  municipio_codigo char(5) references public.municipios (codigo),
  ciudad text,
  lat numeric(9,6) constraint accesos_lat_chk check (lat between -90 and 90),
  lon numeric(9,6) constraint accesos_lon_chk check (lon between -180 and 180),
  user_agent text constraint accesos_user_agent_chk check (char_length(user_agent) <= 400),
  navegador text,
  sistema_operativo text,
  dispositivo text constraint accesos_dispositivo_chk check (dispositivo in ('ESCRITORIO', 'MOVIL', 'TABLETA', 'OTRO')),
  es_sospechoso boolean not null default false,
  motivo_sospecha text,
  es_demo boolean not null default false
);
create index accesos_created_at_brin on public.accesos using brin (created_at);
create index accesos_usuario_idx on public.accesos (usuario_id, created_at desc);
create index accesos_pais_idx on public.accesos (pais_iso2, created_at);
create index accesos_departamento_idx on public.accesos (departamento_codigo) where departamento_codigo is not null;
create index accesos_municipio_idx on public.accesos (municipio_codigo) where municipio_codigo is not null;
create index accesos_sospechoso_idx on public.accesos (created_at desc) where es_sospechoso;
create index accesos_es_demo_idx on public.accesos (es_demo) where es_demo;

-- Limitador de login: sin RLS ni grants (solo funciones definer).
create table private.intentos_login (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip inet,
  exito boolean not null,
  created_at timestamptz not null default private.ahora()
);
create index intentos_login_email_hash_idx on private.intentos_login (email_hash, created_at desc);
create index intentos_login_ip_idx on private.intentos_login (ip, created_at desc) where ip is not null;
create index intentos_login_created_at_brin on private.intentos_login using brin (created_at);

-- 3. Auditoría

-- Redacción de un valor según su clasificación (HASH: 16 hex de sha256; ENMASCARAR: private.enmascarar).
create function private.redactar_valor(p_valor jsonb, p_tratamiento public.auditoria_tratamiento) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_valor is null or jsonb_typeof(p_valor) = 'null' then p_valor
    when p_tratamiento = 'HASH'
      then to_jsonb('sha256:' || left(encode(sha256(convert_to(p_valor #>> '{}', 'UTF8')), 'hex'), 16))
    when p_tratamiento = 'ENMASCARAR' then to_jsonb(private.enmascarar(p_valor #>> '{}'))
    else p_valor
  end $$;
revoke all on function private.redactar_valor(jsonb, public.auditoria_tratamiento) from public, anon, authenticated;

-- Única vía de escritura en bitácora desde la BD: actor efectivo, snapshot de email/rol, origen y, solo con
-- contexto confiable, IP/país/ciudad/UA de los headers x-amo-* (si no, pueden ser falsificados).
create function private.registrar_en_bitacora(
  p_accion text, p_entidad text, p_entidad_id text,
  p_cambios jsonb default null, p_metadatos jsonb default '{}', p_motivo text default null,
  p_estado_anterior text default null, p_estado_nuevo text default null, p_es_demo boolean default false)
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := private.actor_id();
  v_app boolean := private.contexto_confiable();
  v_email text; v_rol text; v_ip inet; v_id bigint;
begin
  if v_actor is not null then
    select private.enmascarar(p.email::text), r.clave into v_email, v_rol
    from public.perfiles p left join public.roles r on r.id = p.rol_id
    where p.id = v_actor;
  end if;
  if v_app then
    begin
      v_ip := nullif(btrim(private.header('x-amo-ip')), '')::inet;
    exception when others then
      v_ip := null;                                -- una IP malformada no debe impedir la operación auditada
    end;
  end if;
  insert into public.bitacora as b (actor_id, actor_email, actor_rol, entidad, entidad_id, accion, estado_anterior,
                                    estado_nuevo, cambios, metadatos, motivo, origen, ip, pais_iso2, ciudad, user_agent, es_demo)
  values (v_actor, v_email, v_rol, p_entidad, p_entidad_id, p_accion, p_estado_anterior, p_estado_nuevo, p_cambios,
          coalesce(p_metadatos, '{}'), p_motivo,
          case when v_app then 'APP'
               when nullif(current_setting('request.jwt.claims', true), '') is not null then 'API_DIRECTA'
               else 'DB' end::public.bitacora_origen,
          v_ip,
          case when v_app then (select pa.iso2 from public.paises pa where pa.iso2 = upper(btrim(private.header('x-amo-pais')))) end,
          case when v_app then left(private.header('x-amo-ciudad'), 120) end,
          case when v_app then left(private.header('x-amo-ua'), 400) end,
          coalesce(p_es_demo, false))
  returning b.id into v_id;
  return v_id;
end $$;
revoke all on function private.registrar_en_bitacora(text, text, text, jsonb, jsonb, text, text, text, boolean)
  from public, anon, authenticated;

-- Trigger AFTER INSERT/UPDATE/DELETE genérico. TG_ARGV[0] = columna PK (default 'id').
create function private.fn_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
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
    '{}'::jsonb,
    nullif(current_setting('amo.motivo', true), ''),
    v_old ->> v_estado_col,
    v_new ->> v_estado_col,
    coalesce((coalesce(v_new, v_old) ->> 'es_demo')::boolean, false));
  return null;
end $$;
revoke all on function private.fn_auditar() from public, anon, authenticated;

-- Bitácora append-only: UPDATE/DELETE/TRUNCATE solo con la purga del owner (amo.purga).
create function private.fn_bitacora_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.purga_habilitada() then
    if tg_level = 'STATEMENT' then return null; end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception using errcode = 'P0001', message = 'AMO_BITACORA_INMUTABLE',
    detail = 'La bitácora es de solo inserción: no admite cambios ni borrados.';
end $$;
revoke all on function private.fn_bitacora_inmutable() from public, anon, authenticated;

-- Sella bitácora y accesos: el historial no se fecha hacia atrás ni se marca como demo desde la API.
create function private.fn_sellar_registro() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  new.created_at := private.ahora();
  new.es_demo := false;
  if tg_table_name = 'bitacora' then
    if new.origen = 'DEMO' then
      raise exception using errcode = 'P0001', message = 'AMO_BITACORA_INMUTABLE',
        detail = 'El origen DEMO solo se admite en la carga de datos demo.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.fn_sellar_registro() from public, anon, authenticated;

-- Snapshot mínimo del borrado definitivo de un usuario (id, rol, sha256(email), fechas).
create function private.fn_perfiles_borrado_definitivo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return old; end if;
  perform private.registrar_en_bitacora(
    'BORRADO_DEFINITIVO', 'perfiles', old.id::text,
    jsonb_build_object(
      'id', old.id,
      'rol', (select r.clave from public.roles r where r.id = old.rol_id),
      'email_sha256', encode(sha256(convert_to(lower(old.email::text), 'UTF8')), 'hex'),
      'created_at', old.created_at,
      'desactivado_at', old.desactivado_at),
    '{}'::jsonb, null, null, null, old.es_demo);
  return old;
end $$;
revoke all on function private.fn_perfiles_borrado_definitivo() from public, anon, authenticated;

-- 4. Login y accesos (§5.5; EXECUTE solo service_role)

-- Limitador: ¿está bloqueado este email o esta IP?
-- Tres umbrales independientes: (email, IP) contra fuerza bruta dirigida; IP sola contra password spraying;
-- email global (alto) para que nadie pueda bloquear a un SUPERADMIN desde cualquier IP con pocos intentos.
create function public.login_bloqueado_srv(p_email text, p_ip inet)
returns table (bloqueado boolean, reintentar_en_s integer) language plpgsql stable security definer set search_path = '' as $$
declare h text := encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex');
        v_ventana interval := make_interval(mins => private.config_entero('seguridad.login_ventana_minutos'));
        v_bloqueo interval := make_interval(mins => private.config_entero('seguridad.login_bloqueo_minutos'));
        v_desde timestamptz;
        v_ult_ok timestamptz;
        v_n_email_ip int; v_ult_email_ip timestamptz;
        v_n_ip int;       v_ult_ip timestamptz;
        v_n_email int;    v_ult_email timestamptz;
        v_hasta timestamptz;
begin
  v_desde := now() - v_ventana;
  select max(created_at) into v_ult_ok from private.intentos_login where email_hash = h and exito;
  -- (email, IP): se reinicia con un éxito
  select count(*), max(created_at) into v_n_email_ip, v_ult_email_ip from private.intentos_login
   where email_hash = h and ip is not distinct from p_ip and not exito
     and created_at > greatest(v_desde, coalesce(v_ult_ok, '-infinity'));
  -- IP sola (todas las cuentas)
  select count(*), max(created_at) into v_n_ip, v_ult_ip from private.intentos_login
   where p_ip is not null and ip = p_ip and not exito and created_at > v_desde;
  -- email global (todas las IP)
  select count(*), max(created_at) into v_n_email, v_ult_email from private.intentos_login
   where email_hash = h and not exito and created_at > greatest(v_desde, coalesce(v_ult_ok, '-infinity'));
  v_hasta := greatest(
    case when v_n_email_ip >= private.config_entero('seguridad.login_max_fallos_email')        then v_ult_email_ip + v_bloqueo end,
    case when v_n_ip       >= private.config_entero('seguridad.login_max_fallos_ip')           then v_ult_ip       + v_bloqueo end,
    case when v_n_email    >= private.config_entero('seguridad.login_max_fallos_email_global') then v_ult_email    + v_bloqueo end);
  -- greatest ignora los null; si todos son null, v_hasta es null ⇒ no bloqueado (nunca devuelve null)
  return query select coalesce(v_hasta > now(), false),
                      coalesce(greatest(0, ceil(extract(epoch from (v_hasta - now()))))::int, 0);
end $$;
revoke all on function public.login_bloqueado_srv(text, inet) from public, anon, authenticated;
grant execute on function public.login_bloqueado_srv(text, inet) to service_role;

create function public.registrar_intento_login_srv(p_email text, p_ip inet, p_exito boolean) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.intentos_login (email_hash, ip, exito)
  values (encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex'), p_ip, p_exito) $$;
revoke all on function public.registrar_intento_login_srv(text, inet, boolean) from public, anon, authenticated;
grant execute on function public.registrar_intento_login_srv(text, inet, boolean) to service_role;

-- Registra un evento de autenticación con geolocalización resuelta y marca de sospecha.
create function public.registrar_acceso_srv(
  p_usuario_id uuid, p_email text, p_evento public.acceso_evento, p_session_id uuid, p_aal text,
  p_ip inet, p_pais char(2), p_region text, p_ciudad text, p_lat numeric, p_lon numeric,
  p_ua text, p_navegador text, p_so text, p_dispositivo text)
returns table (id bigint, es_sospechoso boolean, motivo text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text;
  v_pais char(2);
  v_depto char(2);
  v_muni char(5);
  v_motivo text;
  v_id bigint;
begin
  if nullif(btrim(p_email), '') is not null then
    v_hash := encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
  end if;
  select pa.iso2 into v_pais from public.paises pa where pa.iso2 = upper(btrim(p_pais));
  if v_pais = 'CO' and nullif(btrim(p_region), '') is not null then
    select d.codigo into v_depto from public.departamentos d where d.iso_3166_2 = 'CO-' || upper(btrim(p_region));
  end if;
  if v_depto is not null and nullif(btrim(p_ciudad), '') is not null then
    select m.codigo into v_muni from public.municipios m
    where m.departamento_codigo = v_depto and m.nombre_normalizado = private.normalizar_texto(p_ciudad)
    order by m.es_capital desc, m.codigo
    limit 1;
  end if;

  if p_evento = 'LOGIN_EXITOSO' and p_usuario_id is not null and v_pais is not null
     and v_pais <> all (private.config_lista('seguridad.paises_habituales'))
     and not exists (select 1 from public.accesos a
                     where a.usuario_id = p_usuario_id and a.evento = 'LOGIN_EXITOSO' and a.pais_iso2 = v_pais
                       and a.created_at > private.ahora() - interval '90 days') then
    v_motivo := 'PAIS_INUSUAL';
  elsif v_hash is not null
        and (select count(*) from private.intentos_login i
             where i.email_hash = v_hash and not i.exito
               and i.created_at > now() - make_interval(mins => private.config_entero('seguridad.login_ventana_minutos')))
            >= private.config_entero('seguridad.login_max_fallos_email') then
    v_motivo := 'MULTIPLES_FALLOS';
  end if;

  insert into public.accesos as a (usuario_id, email_hash, evento, session_id, aal, ip, pais_iso2, departamento_codigo,
                                   municipio_codigo, ciudad, lat, lon, user_agent, navegador, sistema_operativo,
                                   dispositivo, es_sospechoso, motivo_sospecha)
  values (p_usuario_id, v_hash, p_evento, p_session_id, p_aal, p_ip, v_pais, v_depto,
          v_muni, left(nullif(btrim(p_ciudad), ''), 120), round(p_lat, 2), round(p_lon, 2), left(p_ua, 400),
          left(p_navegador, 80), left(p_so, 80), p_dispositivo, v_motivo is not null, v_motivo)
  returning a.id into v_id;

  if p_evento = 'LOGIN_EXITOSO' and p_usuario_id is not null then
    update public.perfiles p set ultimo_acceso_at = private.ahora() where p.id = p_usuario_id;
    if p_session_id is not null then
      insert into private.sesiones_actividad as s (session_id, usuario_id)
      values (p_session_id, p_usuario_id)
      on conflict (session_id) do update set ultima_actividad_at = private.ahora()
      where s.usuario_id = p_usuario_id;
    end if;
  end if;

  return query select v_id, v_motivo is not null, v_motivo;
end $$;
revoke all on function public.registrar_acceso_srv(uuid, text, public.acceso_evento, uuid, text, inet, char, text, text,
  numeric, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_acceso_srv(uuid, text, public.acceso_evento, uuid, text, inet, char, text, text,
  numeric, numeric, text, text, text, text) to service_role;

-- Eventos de aplicación (exportaciones, revelados, URL firmadas, invitaciones, enlaces —sin el token—, …).
create function public.registrar_evento_srv(
  p_actor_id uuid, p_accion text, p_entidad text, p_entidad_id text, p_metadatos jsonb,
  p_ip inet, p_pais char(2), p_ciudad text, p_ua text, p_motivo text default null)
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_rol text; v_id bigint;
begin
  if p_actor_id is not null then
    select private.enmascarar(p.email::text), r.clave into v_email, v_rol
    from public.perfiles p left join public.roles r on r.id = p.rol_id
    where p.id = p_actor_id;
  end if;
  -- accion se valida con bitacora_accion_chk; created_at y origen no los fija el llamador.
  insert into public.bitacora as b (actor_id, actor_email, actor_rol, entidad, entidad_id, accion, metadatos, motivo,
                                    origen, ip, pais_iso2, ciudad, user_agent)
  values (p_actor_id, v_email, v_rol, p_entidad, p_entidad_id, p_accion, coalesce(p_metadatos, '{}'), p_motivo,
          'APP', p_ip, (select pa.iso2 from public.paises pa where pa.iso2 = upper(btrim(p_pais))),
          left(p_ciudad, 120), left(p_ua, 400))
  returning b.id into v_id;
  return v_id;
end $$;
revoke all on function public.registrar_evento_srv(uuid, text, text, text, jsonb, inet, char, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_evento_srv(uuid, text, text, text, jsonb, inet, char, text, text, text)
  to service_role;

-- 5. Datos sensibles de terceros (§2.4.6): un id por llamada, siempre con bitácora.

create function public.revelar_privado_srv(p_tabla text, p_id uuid, p_actor_id uuid, p_session_id uuid, p_campos text[])
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_pk text; v_permitidos text[]; v_resultado jsonb;
begin
  case p_tabla
    when 'perfiles_privado' then
      v_pk := 'perfil_id';
      v_permitidos := array['tipo_documento', 'numero_documento_cifrado', 'numero_documento_resumen',
                            'fecha_nacimiento', 'direccion', 'notas_internas'];
    when 'anunciantes_privado' then
      v_pk := 'anunciante_id';
      v_permitidos := array['contacto_nombre', 'contacto_email', 'contacto_celular', 'direccion'];
    when 'medios_privado' then
      v_pk := 'medio_id';
      v_permitidos := array['titular_nombre', 'tipo_documento', 'numero_documento_cifrado', 'numero_documento_resumen',
                            'celular', 'email_contacto', 'direccion', 'es_declarante', 'obligado_facturar',
                            'responsable_iva', 'metodo_pago', 'datos_pago_cifrados', 'datos_pago_resumen'];
    else
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Tabla de datos privados no permitida.', hint = p_tabla;
  end case;
  if p_campos is null or cardinality(p_campos) = 0 or not (p_campos <@ v_permitidos) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Alguno de los campos solicitados no se puede revelar.';
  end if;
  perform private.validar_actor(p_actor_id, 'datos_sensibles.ver', p_session_id);
  execute format('select (select jsonb_object_agg(e.key, e.value) from jsonb_each(to_jsonb(t)) e where e.key = any($2))
                  from public.%I t where t.%I = $1', p_tabla, v_pk)
    into v_resultado using p_id, p_campos;
  perform private.registrar_en_bitacora('REVELAR_DATO', p_tabla, p_id::text, null,
    jsonb_build_object('tabla', p_tabla, 'id', p_id, 'campos', to_jsonb(p_campos)));
  return v_resultado;
end $$;
revoke all on function public.revelar_privado_srv(text, uuid, uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.revelar_privado_srv(text, uuid, uuid, uuid, text[]) to service_role;

-- Los valores cifrados llegan ya cifrados (con hash y resumen) desde la Server Action; fn_auditar registra el cambio.
create function public.editar_privado_srv(p_tabla text, p_id uuid, p_actor_id uuid, p_session_id uuid, p_cambios jsonb)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_pk text; v_permitidos text[]; v_cols text[];
begin
  case p_tabla
    when 'perfiles_privado' then
      v_pk := 'perfil_id';
      v_permitidos := array['tipo_documento', 'numero_documento_cifrado', 'numero_documento_hash',
                            'numero_documento_resumen', 'fecha_nacimiento', 'direccion', 'notas_internas'];
    when 'anunciantes_privado' then
      v_pk := 'anunciante_id';
      v_permitidos := array['contacto_nombre', 'contacto_email', 'contacto_celular', 'direccion'];
    when 'medios_privado' then
      v_pk := 'medio_id';
      v_permitidos := array['titular_nombre', 'tipo_documento', 'numero_documento_cifrado', 'numero_documento_hash',
                            'numero_documento_resumen', 'celular', 'email_contacto', 'direccion', 'es_declarante',
                            'obligado_facturar', 'responsable_iva', 'metodo_pago', 'datos_pago_cifrados',
                            'datos_pago_resumen'];
    else
      raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
        detail = 'Tabla de datos privados no permitida.', hint = p_tabla;
  end case;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO', detail = 'Cambios inválidos.';
  end if;
  select array_agg(k order by k) into v_cols from jsonb_object_keys(p_cambios) k;
  if v_cols is null or not (v_cols <@ v_permitidos) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Alguno de los campos no se puede editar.';
  end if;
  perform private.validar_actor(p_actor_id, 'datos_sensibles.editar', p_session_id);
  execute format(
    'insert into public.%1$I as t (%2$I, %3$s) select $1, %4$s from jsonb_populate_record(null::public.%1$I, $2) r
     on conflict (%2$I) do update set (%3$s) = row(%5$s)',
    p_tabla, v_pk,
    (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
    (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c),
    (select string_agg(format('excluded.%I', c), ', ') from unnest(v_cols) c))
  using p_id, p_cambios;
end $$;
revoke all on function public.editar_privado_srv(text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.editar_privado_srv(text, uuid, uuid, uuid, jsonb) to service_role;

-- 6. Sesiones

-- Cierra sesiones borrando auth.sessions (cascada a refresh tokens): acceso_valido() pasa a false de inmediato.
create function public.cerrar_sesiones_usuario_srv(
  p_usuario_id uuid, p_actor_id uuid, p_session_id uuid, p_excepto_session uuid default null, p_motivo text default null)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_cerradas integer;
begin
  if p_actor_id is not distinct from p_usuario_id then
    perform private.validar_actor(p_actor_id, null, p_session_id);          -- «cerrar mis otras sesiones»
  else
    perform private.validar_actor(p_actor_id, 'usuarios.cerrar_sesiones', p_session_id);
    if not private.puede_gestionar(p_actor_id, p_usuario_id,
                                   (select p.rol_id from public.perfiles p where p.id = p_usuario_id)) then
      raise exception using errcode = 'P0001', message = 'AMO_ESCALADA_PERMISOS',
        detail = 'No puedes gestionar a un usuario con permisos que no tienes.';
    end if;
  end if;
  delete from auth.sessions s where s.user_id = p_usuario_id and s.id is distinct from p_excepto_session;
  get diagnostics v_cerradas = row_count;
  delete from private.sesiones_actividad a
   where a.usuario_id = p_usuario_id and a.session_id is distinct from p_excepto_session;
  perform private.registrar_en_bitacora('CERRAR_SESIONES', 'perfiles', p_usuario_id::text, null,
    jsonb_build_object('sesiones_cerradas', v_cerradas, 'conserva_sesion', p_excepto_session is not null), p_motivo);
  return v_cerradas;
end $$;
revoke all on function public.cerrar_sesiones_usuario_srv(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cerrar_sesiones_usuario_srv(uuid, uuid, uuid, uuid, text) to service_role;

-- ACTIVO → SUSPENDIDO vía transicionar_srv (negocio_transacciones: valida actor, permiso y puede_gestionar)
-- + cierre de sesiones. La Server Action además aplica ban_duration con la Admin API.
create function public.suspender_usuario_srv(p_usuario_id uuid, p_actor_id uuid, p_session_id uuid, p_motivo text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.transicionar_srv('perfiles', p_usuario_id, 'SUSPENDIDO', p_actor_id, p_session_id, p_motivo);
  perform public.cerrar_sesiones_usuario_srv(p_usuario_id, p_actor_id, p_session_id, null, p_motivo);
end $$;
revoke all on function public.suspender_usuario_srv(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.suspender_usuario_srv(uuid, uuid, uuid, text) to service_role;

-- SRF (§5.1): actividad propia sin `cambios` ni `metadatos`; keyset por id desc.
create function public.mi_actividad(p_limite int default 50, p_antes_id bigint default null)
returns table (id bigint, created_at timestamptz, accion text, entidad text, entidad_id text, ip inet,
               pais_iso2 char(2), ciudad text, user_agent text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.created_at, b.accion, b.entidad, b.entidad_id, b.ip, b.pais_iso2, b.ciudad, b.user_agent
  from public.bitacora b
  where (select private.acceso_valido())
    and b.actor_id = (select auth.uid())
    and (p_antes_id is null or b.id < p_antes_id)
  order by b.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;
revoke all on function public.mi_actividad(int, bigint) from public, anon, authenticated;
grant execute on function public.mi_actividad(int, bigint) to authenticated;

-- 7. Triggers
create trigger trg_bitacora_a_inmutable before update or delete on public.bitacora
  for each row execute function private.fn_bitacora_inmutable();
create trigger trg_bitacora_a_inmutable_truncate before truncate on public.bitacora
  for each statement execute function private.fn_bitacora_inmutable();
create trigger trg_bitacora_a_sellar before insert on public.bitacora
  for each row execute function private.fn_sellar_registro();
create trigger trg_accesos_a_sellar before insert on public.accesos
  for each row execute function private.fn_sellar_registro();

create trigger trg_perfiles_z_borrado_definitivo before delete on public.perfiles
  for each row execute function private.fn_perfiles_borrado_definitivo();

create trigger trg_roles_z_auditar after insert or update or delete on public.roles
  for each row execute function private.fn_auditar('id');
create trigger trg_permisos_z_auditar after insert or update or delete on public.permisos
  for each row execute function private.fn_auditar('clave');
create trigger trg_rol_permisos_z_auditar after insert or update or delete on public.rol_permisos
  for each row execute function private.fn_auditar('rol_id');
create trigger trg_perfiles_z_auditar after insert or update or delete on public.perfiles
  for each row execute function private.fn_auditar('id');
create trigger trg_perfiles_privado_z_auditar after insert or update or delete on public.perfiles_privado
  for each row execute function private.fn_auditar('perfil_id');
create trigger trg_sectores_z_auditar after insert or update or delete on public.sectores
  for each row execute function private.fn_auditar('id');
create trigger trg_categorias_z_auditar after insert or update or delete on public.categorias
  for each row execute function private.fn_auditar('id');
create trigger trg_configuracion_z_auditar after insert or update or delete on public.configuracion
  for each row execute function private.fn_auditar('clave');
create trigger trg_departamentos_z_auditar after insert or update or delete on public.departamentos
  for each row execute function private.fn_auditar('codigo');
create trigger trg_municipios_z_auditar after insert or update or delete on public.municipios
  for each row execute function private.fn_auditar('codigo');

-- 8. RLS y grants
alter table public.bitacora enable row level security;
alter table public.accesos enable row level security;

create policy "bitacora: acceso válido" on public.bitacora as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "bitacora: select interno" on public.bitacora for select to authenticated
  using ((select private.tiene_permiso('auditoria.ver')));

create policy "accesos: acceso válido" on public.accesos as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "accesos: select" on public.accesos for select to authenticated
  using ((select private.tiene_permiso('accesos.ver')) or usuario_id = (select auth.uid()));

grant select on public.bitacora, public.accesos to authenticated, service_role;
-- Solo las funciones definer escriben historial; service_role nunca inserta, modifica ni borra.
revoke insert, update, delete, truncate on public.bitacora, public.accesos from service_role;

-- 9. Semilla de clasificación de columnas auditadas (§3.3)
insert into private.auditoria_columnas (tabla, columna, tratamiento) values
  ('*', 'updated_at', 'OMITIR'),
  ('perfiles', 'preferencias', 'OMITIR'),
  ('perfiles', 'avatar_path', 'OMITIR'),
  ('perfiles', 'ultimo_acceso_at', 'OMITIR'),
  ('perfiles', 'email', 'ENMASCARAR'),
  ('perfiles', 'celular', 'ENMASCARAR'),
  ('perfiles_privado', 'notas_internas', 'OMITIR'),
  ('perfiles_privado', 'numero_documento_cifrado', 'OMITIR'),
  ('perfiles_privado', 'numero_documento_hash', 'HASH'),
  ('perfiles_privado', 'tipo_documento', 'ENMASCARAR'),
  ('perfiles_privado', 'numero_documento_resumen', 'ENMASCARAR'),
  ('perfiles_privado', 'fecha_nacimiento', 'ENMASCARAR'),
  ('perfiles_privado', 'direccion', 'ENMASCARAR'),
  ('anunciantes_privado', 'contacto_nombre', 'ENMASCARAR'),
  ('anunciantes_privado', 'contacto_email', 'ENMASCARAR'),
  ('anunciantes_privado', 'contacto_celular', 'ENMASCARAR'),
  ('anunciantes_privado', 'direccion', 'ENMASCARAR'),
  ('anunciantes', 'datos_facturacion', 'OMITIR'),
  ('medios_privado', 'datos_pago_cifrados', 'OMITIR'),
  ('medios_privado', 'numero_documento_cifrado', 'OMITIR'),
  ('medios_privado', 'numero_documento_hash', 'HASH'),
  ('medios_privado', 'titular_nombre', 'ENMASCARAR'),
  ('medios_privado', 'numero_documento_resumen', 'ENMASCARAR'),
  ('medios_privado', 'celular', 'ENMASCARAR'),
  ('medios_privado', 'email_contacto', 'ENMASCARAR'),
  ('medios_privado', 'direccion', 'ENMASCARAR'),
  ('medios_privado', 'datos_pago_resumen', 'ENMASCARAR'),
  ('documentos_medio', 'archivo_path', 'HASH'),
  ('documentos_anunciante', 'archivo_path', 'HASH'),
  ('verificaciones_cuenta', 'codigo_hash', 'HASH'),
  ('verificaciones_cuenta', 'captura_path', 'HASH'),
  ('resoluciones_dian', 'numero_resolucion', 'ENMASCARAR');

-- 10. Verificación
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
  assert not has_table_privilege('service_role', 'public.bitacora', 'insert')
     and not has_table_privilege('service_role', 'public.bitacora', 'update')
     and not has_table_privilege('service_role', 'public.bitacora', 'delete')
     and not has_table_privilege('service_role', 'public.accesos', 'insert'),
         'service_role no debe escribir bitácora ni accesos directamente';
  assert (select count(*) from pg_trigger t
          where t.tgrelid = 'public.bitacora'::regclass and not t.tgisinternal and t.tgname like 'trg_bitacora_a_%') = 3,
         'bitácora: faltan los triggers de inmutabilidad y sellado';
  assert (select count(*) from pg_trigger t
          where not t.tgisinternal and t.tgname like 'trg\_%\_z\_auditar') = 10,
         'se esperaban 10 triggers z_auditar (identidad_rbac + departamentos/municipios)';
end $$;
