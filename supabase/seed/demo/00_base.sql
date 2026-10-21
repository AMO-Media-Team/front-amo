-- Datos demo · paso 00 · tablas de plan y utilidades (docs/modelo-datos.md §10)
-- Se ejecuta UNA vez como owner (MCP execute_sql). Todo vive en `private` con prefijo `demo_` y se borra al final
-- con 99_limpieza.sql. Nada de esto es alcanzable por la API: `private` no está expuesto y las funciones nacen sin
-- EXECUTE para PUBLIC (default privileges de la migración 1); además se revocan explícitamente.

create table if not exists private.demo_control (clave text primary key, valor text not null);

-- Usuarios demo: perfil de conexión estable (IP, ciudad, dispositivo) que comparten accesos y bitácora.
create table if not exists private.demo_usuarios (
  usuario_id uuid primary key,
  email text not null,
  clase text not null check (clase in ('ADMIN', 'OPERACIONES', 'FINANZAS', 'ANUNCIANTE', 'MEDIO')),
  org_id uuid,
  principal boolean not null default true,
  alta_at timestamptz not null,
  ip inet, pais char(2), departamento char(2), municipio char(5), ciudad text, lat numeric(9,6), lon numeric(9,6),
  user_agent text, navegador text, sistema_operativo text, dispositivo text,
  sesiones_mes numeric not null default 4,
  viajero char(2)
);
create index if not exists demo_usuarios_org_idx on private.demo_usuarios (org_id);

create table if not exists private.demo_anunciantes (
  n integer primary key, anunciante_id uuid not null unique, peso numeric not null,
  alta_at timestamptz not null, verificado_at timestamptz, baja_at timestamptz, estado_final text not null
);

create table if not exists private.demo_medios (
  n integer primary key, medio_id uuid not null unique, alta_at timestamptz not null, verificado_at timestamptz,
  baja_at timestamptz, estado_final text not null, nivel smallint not null,
  calidad numeric not null, actividad numeric not null, fiabilidad numeric not null
);

create table if not exists private.demo_cuentas (
  cuenta_id uuid primary key, medio_id uuid not null, proxima timestamptz not null, detener_at timestamptz,
  metodo public.metodo_verificacion not null
);

-- Staging de bitácora y notificaciones: se vuelcan al final en orden cronológico (ids crecientes con la fecha).
create table if not exists private.demo_eventos (
  t timestamptz not null, actor_id uuid, entidad text not null, entidad_id text, accion text not null,
  anterior text, nuevo text, motivo text, cambios jsonb, metadatos jsonb
);
create index if not exists demo_eventos_t_idx on private.demo_eventos (t);

create table if not exists private.demo_avisos (
  t timestamptz not null, usuario_id uuid not null, tipo text not null, datos jsonb not null,
  entidad text, entidad_id text, prioridad smallint not null default 0
);

-- «Hoy» de la generación (se fija una vez; todo evento posterior no se materializa).
create or replace function private.demo_hoy() returns timestamptz
language sql stable set search_path = '' as $$
  select c.valor::timestamptz from private.demo_control c where c.clave = 'hoy' $$;

-- Semilla por mes: determinista y distinta en cada mes (misma semilla ⇒ misma serie).
create or replace function private.demo_semilla(p_semilla double precision, p_indice integer) returns double precision
language sql immutable set search_path = '' as $$
  select (p_semilla + p_indice * 0.0618033988)::numeric % 1.0 $$;

create or replace function private.demo_ln(p_mediana double precision, p_sigma double precision) returns double precision
language sql volatile set search_path = '' as $$
  select p_mediana * exp(random_normal(0, p_sigma)) $$;

-- Primera corrida de un job de pg_cron posterior a p_t (p_base = minuto de arranque: 0 para */15, 5 para 5-59/15).
create or replace function private.demo_tick(p_t timestamptz, p_base integer) returns timestamptz
language sql volatile set search_path = '' as $$
  select date_bin('15 minutes', p_t - make_interval(mins => p_base), timestamptz '2025-01-01 00:00:00+00')
         + make_interval(mins => p_base + 15) + make_interval(secs => 1 + random() * 20) $$;

-- p_t + p_horas, llevado a horario de oficina de Bogotá (07–19 h, sin domingos). Nunca devuelve antes de p_t + p_horas.
create or replace function private.demo_habil(p_t timestamptz, p_horas double precision) returns timestamptz
language plpgsql volatile set search_path = '' as $$
declare r timestamp := (p_t + make_interval(secs => p_horas * 3600)) at time zone 'America/Bogota';
begin
  if extract(hour from r) < 7 then
    r := date_trunc('day', r) + interval '7 hours' + random() * interval '4 hours';
  elsif extract(hour from r) >= 19 then
    r := date_trunc('day', r) + interval '1 day 7 hours' + random() * interval '4 hours';
  end if;
  if extract(isodow from r) = 7 then r := r + interval '1 day'; end if;
  return r at time zone 'America/Bogota';
end $$;

-- Hora pico de publicación (07–09, 12–13:30, 19–22) dentro del día civil de Bogotá.
create or replace function private.demo_pico(p_dia date) returns timestamptz
language sql volatile set search_path = '' as $$
  select (p_dia::timestamp + make_interval(secs => 3600 * case when x.u < 0.25 then 7 + 2 * x.v
                                                               when x.u < 0.45 then 12 + 1.5 * x.v
                                                               when x.u < 0.80 then 19 + 3 * x.v
                                                               else 9 + 10 * x.v end)) at time zone 'America/Bogota'
  from (select random() as u, random() as v) x $$;

-- Instante al azar del periodo con el peso por día de la semana de §10.3 (lun 1,00 … dom 0,55) y horario diurno.
create or replace function private.demo_instante(p_ini timestamptz, p_fin timestamptz) returns timestamptz
language plpgsql volatile set search_path = '' as $$
declare t timestamptz; w numeric; i integer := 0;
begin
  loop
    i := i + 1;
    t := p_ini + random() * (p_fin - p_ini);
    w := (array[1.00, 1.15, 1.15, 1.10, 1.00, 0.70, 0.55])[extract(isodow from t at time zone 'America/Bogota')::integer];
    exit when random() * 1.15 < w or i > 20;
  end loop;
  return least(greatest(private.demo_habil(date_trunc('day', t at time zone 'America/Bogota') at time zone 'America/Bogota',
                                           7 + random() * 11), p_ini), p_fin - interval '1 minute');
end $$;

-- Dígito de verificación del NIT (algoritmo DIAN).
create or replace function private.demo_dv(p_nit text) returns char(1)
language sql immutable set search_path = '' as $$
  select (case when s.r in (0, 1) then s.r else 11 - s.r end)::text::char(1)
  from (select sum(substr(reverse(p_nit), i, 1)::integer
                   * (array[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71])[i]) % 11 as r
        from generate_series(1, length(p_nit)) i) s $$;

-- IP verosímil por país (rangos de ejemplo; no identifican a nadie).
create or replace function private.demo_ip(p_pais text) returns inet
language sql volatile set search_path = '' as $$
  select ((case p_pais when 'CO' then (array['181.48', '181.56', '186.84', '190.24', '190.85', '200.118', '191.95', '152.202'])[1 + floor(random() * 8)::integer]
                       when 'US' then '73.' || (20 + floor(random() * 200))::integer when 'ES' then '83.' || (30 + floor(random() * 60))::integer
                       when 'MX' then '187.' || (130 + floor(random() * 100))::integer when 'VE' then '190.' || (198 + floor(random() * 10))::integer
                       when 'EC' then '186.' || (3 + floor(random() * 60))::integer when 'PE' then '190.' || (232 + floor(random() * 6))::integer
                       when 'PA' then '190.' || (32 + floor(random() * 4))::integer when 'CL' then '190.' || (160 + floor(random() * 4))::integer
                       when 'AR' then '181.' || (1 + floor(random() * 40))::integer when 'DE' then '91.' || (1 + floor(random() * 60))::integer
                       when 'FR' then '90.' || (1 + floor(random() * 120))::integer when 'CA' then '99.' || (224 + floor(random() * 30))::integer
                       when 'GB' then '86.' || (1 + floor(random() * 180))::integer when 'BR' then '177.' || (1 + floor(random() * 250))::integer
                       when 'RU' then '95.' || (24 + floor(random() * 8))::integer when 'CN' then '116.' || (1 + floor(random() * 30))::integer
                       when 'NG' then '105.' || (112 + floor(random() * 8))::integer else '45.' || (1 + floor(random() * 200))::integer end)
          || '.' || floor(random() * 256)::integer || '.' || (1 + floor(random() * 254))::integer)::inet $$;

-- Corrige el cuerpo de una función demo ya creada sin reenviar el archivo completo por MCP (solo el owner).
-- Uso: select private.demo_parche('private.demo_mes(date,double precision)', $v$texto viejo$v$, $n$texto nuevo$n$);
-- El mismo cambio se aplica al archivo .sql del repositorio para que ambos queden iguales.
create or replace function private.demo_parche(p_funcion regprocedure, p_viejo text, p_nuevo text) returns text
language plpgsql set search_path = '' as $$
declare v_def text := pg_get_functiondef(p_funcion); v_n integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / greatest(length(p_viejo), 1);
  if v_n <> 1 then
    raise exception 'El texto a reemplazar aparece % veces en % (debe aparecer una sola)', v_n, p_funcion;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
  return 'ok';
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname like 'demo\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.firma);
  end loop;
end $$;
