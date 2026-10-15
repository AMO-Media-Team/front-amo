-- Migración 2 · geo (docs/modelo-datos.md §3.1, docs/geodatos.md)
-- Catálogos geográficos: países (ISO 3166-1), departamentos (DANE) y municipios (DIVIPOLA).
-- La semilla supabase/seed/geo.sql (pnpm geo:build) se reparte por tamaño entre esta migración
-- (departamentos), geo_semilla_paises y geo_semilla_municipios_1..5, sin cambiar su contenido.
-- La FK departamentos.capital_codigo se crea en geo_semilla_municipios_5, con todas las capitales cargadas.
-- La restrictiva «acceso válido», la escritura de `activo` y la auditoría llegan en identidad_rbac y
-- bitacora_accesos (dependen de private.acceso_valido, private.tiene_permiso y private.fn_auditar).

-- 1. Tablas
create table public.paises (
  iso2 char(2) primary key constraint paises_iso2_chk check (iso2 ~ '^[A-Z]{2}$'),
  iso3 char(3) not null constraint paises_iso3_key unique constraint paises_iso3_chk check (iso3 ~ '^[A-Z]{3}$'),
  numerico char(3) constraint paises_numerico_key unique constraint paises_numerico_chk check (numerico ~ '^[0-9]{3}$'),
  nombre text not null,
  nombre_normalizado text not null,
  alias text[] not null default '{}',
  continente text not null
    constraint paises_continente_chk check (continente in ('África', 'América', 'Antártida', 'Asia', 'Europa', 'Oceanía')),
  subregion text,
  con_geometria boolean not null default false,
  lon numeric(9,6) constraint paises_lon_chk check (lon between -180 and 180),
  lat numeric(9,6) constraint paises_lat_chk check (lat between -90 and 90)
);
create index paises_nombre_normalizado_trgm_idx on public.paises using gin (nombre_normalizado extensions.gin_trgm_ops);
create index paises_alias_idx on public.paises using gin (alias);

create table public.departamentos (
  codigo char(2) primary key constraint departamentos_codigo_chk check (codigo ~ '^[0-9]{2}$'),
  nombre text not null,
  nombre_corto text not null,
  nombre_normalizado text not null,
  alias text[] not null default '{}',
  iso_3166_2 text not null
    constraint departamentos_iso_3166_2_key unique
    constraint departamentos_iso_3166_2_chk check (iso_3166_2 ~ '^CO-[A-Z]{2,3}$'),
  region text not null
    constraint departamentos_region_chk check (region in ('Caribe', 'Andina', 'Pacífica', 'Orinoquía', 'Amazonía', 'Insular')),
  capital_codigo char(5),
  poblacion integer constraint departamentos_poblacion_chk check (poblacion >= 0),
  lon numeric(9,6) constraint departamentos_lon_chk check (lon between -180 and 180),
  lat numeric(9,6) constraint departamentos_lat_chk check (lat between -90 and 90),
  bbox numeric[] constraint departamentos_bbox_chk check (bbox is null or array_length(bbox, 1) = 4),
  activo boolean not null default true
);
create index departamentos_nombre_normalizado_trgm_idx on public.departamentos using gin (nombre_normalizado extensions.gin_trgm_ops);
create index departamentos_alias_idx on public.departamentos using gin (alias);
create index departamentos_capital_codigo_idx on public.departamentos (capital_codigo);

create table public.municipios (
  codigo char(5) primary key constraint municipios_codigo_chk check (codigo ~ '^[0-9]{5}$'),
  departamento_codigo char(2) not null references public.departamentos (codigo) on delete restrict,
  nombre text not null,
  nombre_normalizado text not null,
  tipo text not null constraint municipios_tipo_chk check (tipo in ('MUNICIPIO', 'ISLA', 'AREA_NO_MUNICIPALIZADA')),
  es_capital boolean not null default false,
  lon numeric(9,6) constraint municipios_lon_chk check (lon between -180 and 180),
  lat numeric(9,6) constraint municipios_lat_chk check (lat between -90 and 90),
  -- Código cuyo polígono representa al municipio (13490→13600, 19300→19142, 23682→23466, 23815→23670).
  codigo_geometria char(5) not null references public.municipios (codigo) deferrable initially deferred,
  bbox numeric[] constraint municipios_bbox_chk check (bbox is null or array_length(bbox, 1) = 4),
  activo boolean not null default true,
  constraint municipios_departamento_chk check (left(codigo, 2) = departamento_codigo::text)
);
create index municipios_departamento_codigo_idx on public.municipios (departamento_codigo);
create index municipios_codigo_geometria_idx on public.municipios (codigo_geometria);
create index municipios_nombre_normalizado_trgm_idx on public.municipios using gin (nombre_normalizado extensions.gin_trgm_ops);
create unique index municipios_capital_key on public.municipios (departamento_codigo) where es_capital;

-- 2. Trigger: un municipio activo exige su departamento activo (§3.1).
create function private.fn_municipio_activo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.activo then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.activo and new.departamento_codigo = old.departamento_codigo then
      return new;               -- no se está activando nada
    end if;
  end if;
  if not exists (select 1 from public.departamentos d
                 where d.codigo = new.departamento_codigo and d.activo) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'No se puede activar un municipio de un departamento inactivo.';
  end if;
  return new;
end $$;
revoke all on function private.fn_municipio_activo() from public, anon, authenticated;

create trigger trg_municipios_a_activo
  before insert or update of activo, departamento_codigo on public.municipios
  for each row execute function private.fn_municipio_activo();

-- 3. RLS de lectura y grants (la restrictiva «acceso válido» se crea en identidad_rbac).
alter table public.paises enable row level security;
alter table public.departamentos enable row level security;
alter table public.municipios enable row level security;

create policy "paises: select autenticado" on public.paises for select to authenticated using (true);
create policy "departamentos: select autenticado" on public.departamentos for select to authenticated using (true);
create policy "municipios: select autenticado" on public.municipios for select to authenticated using (true);

grant select on public.paises, public.departamentos, public.municipios to authenticated;
grant select, insert, update, delete on public.paises, public.departamentos, public.municipios to service_role;

-- 4. Semilla de departamentos (bloque de supabase/seed/geo.sql, sin cambios).
insert into public.departamentos (codigo, nombre, nombre_corto, nombre_normalizado, alias, iso_3166_2, region, capital_codigo, poblacion, lon, lat, bbox) values
  ('05', 'Antioquia', 'Antioquia', 'antioquia', '{}', 'CO-ANT', 'Andina', '05001', 6928372, -75.474, 6.6679, array[-77.1457, 5.454, -73.8928, 8.8845]::numeric[]),
  ('08', 'Atlántico', 'Atlántico', 'atlantico', '{}', 'CO-ATL', 'Caribe', '08001', 2865034, -74.9823, 10.6642, array[-75.2772, 10.2539, -74.728, 11.0751]::numeric[]),
  ('11', 'Bogotá, D.C.', 'Bogotá', 'bogota', array['capital district', 'distrito capital', 'santa fe de bogota', 'santafe de bogota']::text[], 'CO-DC', 'Andina', '11001', 7942867, -74.1174, 4.5631, array[-74.5135, 3.6517, -74.0067, 4.8134]::numeric[]),
  ('13', 'Bolívar', 'Bolívar', 'bolivar', '{}', 'CO-BOL', 'Caribe', '13001', 2241282, -74.2429, 8.6404, array[-75.6983, 6.9764, -73.7656, 10.7816]::numeric[]),
  ('15', 'Boyacá', 'Boyacá', 'boyaca', '{}', 'CO-BOY', 'Andina', '15001', 1290393, -73.0705, 5.628, array[-74.6709, 4.6397, -71.9852, 7.023]::numeric[]),
  ('17', 'Caldas', 'Caldas', 'caldas', '{}', 'CO-CAL', 'Andina', '17001', 1054450, -75.4326, 5.2883, array[-75.9515, 4.7999, -74.6455, 5.7598]::numeric[]),
  ('18', 'Caquetá', 'Caquetá', 'caqueta', '{}', 'CO-CAQ', 'Amazonía', '18001', 429041, -74.0433, 0.7323, array[-76.3096, -0.733, -71.4936, 2.9412]::numeric[]),
  ('19', 'Cauca', 'Cauca', 'cauca', '{}', 'CO-CAU', 'Pacífica', '19001', 1599148, -76.9318, 2.4903, array[-78.2643, 0.9508, -75.8445, 3.3135]::numeric[]),
  ('20', 'Cesar', 'Cesar', 'cesar', '{}', 'CO-CES', 'Caribe', '20001', 1469159, -73.4495, 9.8362, array[-74.1529, 7.6811, -72.8312, 10.8681]::numeric[]),
  ('23', 'Córdoba', 'Córdoba', 'cordoba', '{}', 'CO-COR', 'Caribe', '23001', 1992907, -75.753, 8.3416, array[-76.5155, 7.3488, -74.7697, 9.4221]::numeric[]),
  ('25', 'Cundinamarca', 'Cundinamarca', 'cundinamarca', '{}', 'CO-CUN', 'Andina', '11001', 3535067, -74.3786, 5.0149, array[-74.915, 3.6627, -73.0643, 5.8178]::numeric[]),
  ('27', 'Chocó', 'Chocó', 'choco', '{}', 'CO-CHO', 'Pacífica', '27001', 593106, -76.7963, 5.6825, array[-77.9132, 3.99, -76.014, 8.6476]::numeric[]),
  ('41', 'Huila', 'Huila', 'huila', '{}', 'CO-HUI', 'Andina', '41001', 1208728, -75.5604, 2.6634, array[-76.6369, 1.4906, -74.502, 3.805]::numeric[]),
  ('44', 'La Guajira', 'La Guajira', 'la guajira', array['guajira']::text[], 'CO-LAG', 'Caribe', '44001', 1066679, -72.8383, 11.1987, array[-73.6811, 10.3784, -71.1954, 12.4333]::numeric[]),
  ('47', 'Magdalena', 'Magdalena', 'magdalena', '{}', 'CO-MAG', 'Caribe', '47001', 1544507, -74.4384, 10.2853, array[-74.9469, 8.954, -73.5865, 11.3377]::numeric[]),
  ('50', 'Meta', 'Meta', 'meta', '{}', 'CO-MET', 'Orinoquía', '50001', 1156405, -73.1667, 3.3543, array[-74.9172, 1.5675, -71.0714, 4.8573]::numeric[]),
  ('52', 'Nariño', 'Nariño', 'narino', '{}', 'CO-NAR', 'Pacífica', '52001', 1713586, -77.9244, 1.5334, array[-79.0699, 0.3337, -76.813, 2.677]::numeric[]),
  ('54', 'Norte de Santander', 'Norte de Santander', 'norte de santander', array['n de santander', 'norte santander', 'nte de santander']::text[], 'CO-NSA', 'Andina', '54001', 1709289, -72.9093, 8.0646, array[-73.6413, 6.8546, -72.0867, 9.2637]::numeric[]),
  ('63', 'Quindío', 'Quindío', 'quindio', '{}', 'CO-QUI', 'Andina', '63001', 557884, -75.7132, 4.4935, array[-75.8986, 4.133, -75.3701, 4.7059]::numeric[]),
  ('66', 'Risaralda', 'Risaralda', 'risaralda', '{}', 'CO-RIS', 'Andina', '66001', 1003225, -76.1138, 5.212, array[-76.3562, 4.6674, -75.4076, 5.4723]::numeric[]),
  ('68', 'Santander', 'Santander', 'santander', '{}', 'CO-SAN', 'Andina', '68001', 2398303, -73.487, 6.6617, array[-74.5484, 5.7029, -72.5126, 8.1177]::numeric[]),
  ('70', 'Sucre', 'Sucre', 'sucre', '{}', 'CO-SUC', 'Caribe', '70001', 1034102, -74.9467, 8.8021, array[-75.701, 8.2467, -74.5554, 10.1173]::numeric[]),
  ('73', 'Tolima', 'Tolima', 'tolima', '{}', 'CO-TOL', 'Andina', '73001', 1386410, -75.2682, 4.0009, array[-76.0973, 2.964, -74.4999, 5.2887]::numeric[]),
  ('76', 'Valle del Cauca', 'Valle del Cauca', 'valle del cauca', array['valle']::text[], 'CO-VAC', 'Pacífica', '76001', 4708393, -76.4622, 3.7173, array[-77.5599, 3.0613, -75.7064, 4.9731]::numeric[]),
  ('81', 'Arauca', 'Arauca', 'arauca', '{}', 'CO-ARA', 'Orinoquía', '81001', 279191, -70.9434, 6.5913, array[-72.4189, 5.9856, -69.439, 7.0693]::numeric[]),
  ('85', 'Casanare', 'Casanare', 'casanare', '{}', 'CO-CAS', 'Orinoquía', '85001', 473165, -71.6231, 5.3684, array[-73.0914, 4.2444, -69.8443, 6.2476]::numeric[]),
  ('86', 'Putumayo', 'Putumayo', 'putumayo', '{}', 'CO-PUT', 'Amazonía', '86001', 390742, -75.7701, 0.4868, array[-77.1572, -0.5908, -73.8802, 1.4242]::numeric[]),
  ('88', 'Archipiélago de San Andrés, Providencia y Santa Catalina', 'San Andrés', 'archipielago de san andres providencia y santa catalina', array['archipielago de san andres', 'san andres', 'san andres islas', 'san andres providencia y santa catalina', 'san andres y providencia']::text[], 'CO-SAP', 'Insular', '88001', 63438, -81.7194, 12.5411, array[-81.7358, 12.4803, -81.3491, 13.3948]::numeric[]),
  ('91', 'Amazonas', 'Amazonas', 'amazonas', '{}', 'CO-AMA', 'Amazonía', '91001', 85057, -71.4415, -1.3178, array[-74.4084, -4.2502, -69.4015, 0.1563]::numeric[]),
  ('94', 'Guainía', 'Guainía', 'guainia', '{}', 'CO-GUA', 'Amazonía', '94001', 59706, -68.8002, 2.6667, array[-70.8563, 1.0981, -66.8704, 3.9848]::numeric[]),
  ('95', 'Guaviare', 'Guaviare', 'guaviare', '{}', 'CO-GUV', 'Amazonía', '95001', 84696, -72.1268, 1.8981, array[-73.6568, 0.6258, -69.9943, 2.873]::numeric[]),
  ('97', 'Vaupés', 'Vaupés', 'vaupes', '{}', 'CO-VAU', 'Amazonía', '97001', 44142, -70.7713, 0.665, array[-72.0387, -1.2651, -69.1402, 2.0298]::numeric[]),
  ('99', 'Vichada', 'Vichada', 'vichada', '{}', 'CO-VID', 'Orinoquía', '99001', 148738, -69.4276, 4.7533, array[-71.0943, 2.7052, -67.4554, 6.2923]::numeric[])
on conflict (codigo) do update set
  nombre = excluded.nombre,
  nombre_corto = excluded.nombre_corto,
  nombre_normalizado = excluded.nombre_normalizado,
  alias = excluded.alias,
  iso_3166_2 = excluded.iso_3166_2,
  region = excluded.region,
  capital_codigo = excluded.capital_codigo,
  poblacion = excluded.poblacion,
  lon = excluded.lon,
  lat = excluded.lat,
  bbox = excluded.bbox;

-- 5. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert (select count(*) from public.departamentos) = 33, 'departamentos: se esperaban 33 filas';
  assert (select bool_and(c.relrowsecurity) from pg_class c
          where c.oid in ('public.paises'::regclass, 'public.departamentos'::regclass, 'public.municipios'::regclass)),
         'geo: RLS deshabilitado';
  assert not has_table_privilege('anon', 'public.paises', 'select')
     and not has_table_privilege('anon', 'public.departamentos', 'select')
     and not has_table_privilege('anon', 'public.municipios', 'select'),
         'geo: anon no debe leer';
end $$;
