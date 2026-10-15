-- Migración 1 · extensiones_y_esquemas (docs/modelo-datos.md §1.1, §1.5, §11)
-- Esquema privado, extensiones, privilegios por defecto y utilidades comunes.

-- 1. Esquema privado (no expuesto por PostgREST). El usage es necesario para que las políticas
--    invoquen los helpers de private.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- 2. Extensiones (fuera de public). Van antes de los privilegios por defecto para que sus
--    funciones conserven el EXECUTE de PUBLIC (citext, trigram y unaccent lo necesitan).
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- 3. Privilegios por defecto: nada queda expuesto sin un GRANT explícito.
-- Global (sin IN SCHEMA): el EXECUTE de PUBLIC es un default global y un REVOKE por esquema no lo quita.
alter default privileges for role postgres revoke execute on functions from public;
-- Por esquema: revierte los GRANT por esquema que Supabase trae en public.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;

-- 4. Utilidades (§1.5)

-- Reloj de la aplicación: permite fechar datos demo en el pasado SIN que un cliente API pueda hacerlo.
create function private.ahora() returns timestamptz
language plpgsql stable set search_path = '' as $$
begin
  if session_user = 'postgres' and coalesce(current_setting('amo.reloj', true), '') <> '' then
    return current_setting('amo.reloj', true)::timestamptz;
  end if;
  return now();   -- inicio de la transacción, igual que el default habitual
end $$;
revoke all on function private.ahora() from public, anon, authenticated;
grant execute on function private.ahora() to authenticated, service_role;

-- Interruptores de carga/purga: solo efectivos para el owner conectado directamente.
create function private.modo_carga() returns boolean language sql stable set search_path = '' as $$
  select session_user = 'postgres' and coalesce(current_setting('amo.modo_carga', true), '') = 'on' $$;
revoke all on function private.modo_carga() from public, anon, authenticated;

create function private.purga_habilitada() returns boolean language sql stable set search_path = '' as $$
  select session_user = 'postgres' and coalesce(current_setting('amo.purga', true), '') = 'on' $$;
revoke all on function private.purga_habilitada() from public, anon, authenticated;

-- Normalización canónica = normalizarNombreGeo() de src/lib/geo/normalizar.ts (sin quitarArticulos).
-- Pasos: ¥→ñ, &→' y ', minúsculas, sin diacríticos (ñ→n), elimina . ' ’ ‘ ` ´ sin dejar espacio,
-- todo lo no alfanumérico → espacio, colapsa espacios, quita "distrito capital" / "d c" / "dc" como palabra
-- (salvo que deje la cadena vacía).
create function private.normalizar_texto(t text) returns text
language sql immutable parallel safe strict set search_path = '' as $$
  with base as (
    select btrim(regexp_replace(
             regexp_replace(
               lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                     replace(replace(t, '¥', 'ñ'), '&', ' y '))),
               '[.''’‘`´]', '', 'g'),
             '[^[:alnum:]]+', ' ', 'g')) as b
  ), sin_capital as (
    select b, btrim(regexp_replace(regexp_replace(b, '(^| )(distrito capital|d c|dc)(?= |$)', ' ', 'g'), '\s+', ' ', 'g')) as r
    from base
  )
  select case when r = '' then b else r end from sin_capital
$$;
revoke all on function private.normalizar_texto(text) from public, anon, authenticated;
grant execute on function private.normalizar_texto(text) to authenticated, service_role;

create function private.uuid_v7() returns uuid language sql volatile set search_path = '' as $$
  select encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
         placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
         from 1 for 6), 52, 1), 53, 1), 'hex')::uuid
$$;
revoke all on function private.uuid_v7() from public, anon, authenticated;
grant execute on function private.uuid_v7() to authenticated, service_role;

create function private.fn_set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() and new.updated_at is distinct from old.updated_at then
    return new;             -- la carga demo fija updated_at explícito
  end if;
  new.updated_at := private.ahora();
  return new;
end $$;
revoke all on function private.fn_set_updated_at() from public, anon, authenticated;

-- Fecha civil de Bogotá según el reloj de la aplicación. La BD corre en UTC: NUNCA usar current_date ni now()::date.
create function private.hoy() returns date language sql stable set search_path = '' as $$
  select (private.ahora() at time zone 'America/Bogota')::date $$;
revoke all on function private.hoy() from public, anon, authenticated;
grant execute on function private.hoy() to authenticated, service_role;

-- Instante (timestamptz) de las 00:00 de Bogotá de una fecha civil.
create function private.inicio_dia(d date) returns timestamptz language sql stable set search_path = '' as $$
  select d::timestamp at time zone 'America/Bogota' $$;
revoke all on function private.inicio_dia(date) from public, anon, authenticated;
grant execute on function private.inicio_dia(date) to authenticated, service_role;

-- Enmascarado para auditoría y vistas: conserva los 4 últimos caracteres; emails a***@dominio.
create function private.enmascarar(t text) returns text language sql immutable set search_path = '' as $$
  select case
    when t is null then null
    when position('@' in t) > 1 then left(t, 1) || '***@' || split_part(t, '@', 2)
    when char_length(t) <= 4 then '••••'
    else '••••' || right(t, 4) end
$$;
revoke all on function private.enmascarar(text) from public, anon, authenticated;
grant execute on function private.enmascarar(text) to authenticated, service_role;

-- Encabezado HTTP de la petición PostgREST en curso (§5.1). Sin security definer.
create function private.header(p_nombre text) returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::json ->> lower(p_nombre) $$;
revoke all on function private.header(text) from public, anon, authenticated;
grant execute on function private.header(text) to authenticated, service_role;

-- Lista blanca de funciones de private con EXECUTE para authenticated (se amplía en cada migración).
create function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header']::text[] $$;
revoke all on function private.lista_blanca_authenticated() from public, anon, authenticated;

-- 5. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert (select count(*) from pg_extension
          where extname in ('citext','pg_trgm','unaccent','btree_gist')
            and extnamespace = 'extensions'::regnamespace) = 4,
         'extensiones fuera del esquema extensions';
  assert private.normalizar_texto('Bogotá, D.C.') = 'bogota'
     and private.normalizar_texto('NARI¥O') = 'narino'
     and private.normalizar_texto('Côte d’Ivoire') = 'cote divoire'
     and private.normalizar_texto('Distrito Capital') = 'distrito capital',
         'normalizar_texto no coincide con normalizarNombreGeo';
end $$;
