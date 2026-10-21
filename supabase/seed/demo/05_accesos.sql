-- Datos demo · paso 05 · accesos con geografía (docs/modelo-datos.md §10.3 «Accesos»)
-- private.demo_accesos(semilla, dias): eventos de autenticación de los últimos `dias` (90 por defecto) de los usuarios demo,
-- con el perfil de conexión estable de private.demo_usuarios (IP, ciudad, dispositivo):
--   · ≈ 92 % de los ingresos desde Colombia, resueltos a departamento/municipio con país, ciudad, lat y lon (su ciudad
--     habitual y, a veces, otra capital);
--   · el resto desde el país del anunciante internacional, de los «viajeros» habituales (demo_usuarios.viajero) y de
--     viajes ocasionales (US, ES, MX, VE, EC, PE, PA, CL, AR, DE, FR, CA, GB, BR). El primer ingreso desde un país nuevo
--     queda marcado PAIS_INUSUAL, igual que haría public.registrar_acceso_srv;
--   · contraseñas equivocadas, bloqueos por olvido, MFA de los roles internos, cierres, expiraciones y revocaciones;
--   · ráfagas de intentos fallidos desde RU, CN y NG contra unas pocas cuentas (MULTIPLES_FALLOS + LOGIN_BLOQUEADO).
-- También fija perfiles.ultimo_acceso_at y deja en private.demo_avisos las alertas de país inusual.
-- Una sola llamada (≈ 12.000 filas, pocos segundos) dentro de una transacción con amo.modo_carga. No se ejecuta dos veces.

create or replace function private.demo_accesos(p_semilla double precision default 0.4242, p_dias integer default 90)
returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_ini timestamptz := private.demo_hoy() - make_interval(days => p_dias);
  r jsonb := '{}';
  v_n integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_accesos exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  if exists (select 1 from public.accesos a where a.es_demo) then
    raise exception 'Ya hay accesos demo: ejecuta la purga antes de volver a generarlos';
  end if;
  perform setseed(private.demo_semilla(p_semilla, 300));
  drop table if exists _ciu, _nac, _u, _viaje, _s, _sg, _atq, _e;

  -- Ciudades reales fuera de Colombia (lat/lon con 2 decimales, como los entrega la geolocalización por IP).
  create temp table _ciu on commit drop as
  select x.pais, x.ciudad, x.lat::numeric as lat, x.lon::numeric as lon, x.w
  from (values
    ('US', 'Miami', 25.76, -80.19, 5), ('US', 'Nueva York', 40.71, -74.01, 3), ('US', 'Houston', 29.76, -95.37, 1), ('US', 'Orlando', 28.54, -81.38, 2),
    ('ES', 'Madrid', 40.42, -3.70, 5), ('ES', 'Barcelona', 41.39, 2.17, 3), ('ES', 'Valencia', 39.47, -0.38, 1),
    ('MX', 'Ciudad de México', 19.43, -99.13, 5), ('MX', 'Guadalajara', 20.67, -103.35, 2), ('MX', 'Monterrey', 25.69, -100.32, 1),
    ('VE', 'Caracas', 10.48, -66.90, 4), ('VE', 'Maracaibo', 10.65, -71.64, 2), ('VE', 'San Cristóbal', 7.77, -72.22, 3),
    ('EC', 'Quito', -0.18, -78.47, 4), ('EC', 'Guayaquil', -2.17, -79.92, 3),
    ('PE', 'Lima', -12.05, -77.04, 5), ('PE', 'Arequipa', -16.41, -71.54, 1),
    ('PA', 'Ciudad de Panamá', 8.98, -79.52, 1),
    ('CL', 'Santiago', -33.45, -70.67, 5), ('CL', 'Valparaíso', -33.05, -71.62, 1),
    ('AR', 'Buenos Aires', -34.60, -58.38, 5), ('AR', 'Córdoba', -31.42, -64.18, 1),
    ('DE', 'Berlín', 52.52, 13.40, 2), ('DE', 'Fráncfort', 50.11, 8.68, 2),
    ('FR', 'París', 48.86, 2.35, 4), ('FR', 'Lyon', 45.76, 4.84, 1),
    ('CA', 'Toronto', 43.65, -79.38, 3), ('CA', 'Montreal', 45.50, -73.57, 2),
    ('GB', 'Londres', 51.51, -0.13, 5), ('GB', 'Mánchester', 53.48, -2.24, 1),
    ('BR', 'São Paulo', -23.55, -46.63, 4), ('BR', 'Río de Janeiro', -22.91, -43.17, 2),
    ('RU', 'Moscú', 55.76, 37.62, 3), ('RU', 'San Petersburgo', 59.93, 30.34, 2),
    ('CN', 'Pekín', 39.90, 116.40, 2), ('CN', 'Shenzhen', 22.54, 114.06, 2),
    ('NG', 'Lagos', 6.52, 3.38, 3), ('NG', 'Abuya', 9.06, 7.49, 1)
  ) x (pais, ciudad, lat, lon, w);

  -- Capitales a las que viaja un usuario colombiano dentro del país.
  create temp table _nac on commit drop as
  select m.codigo, m.departamento_codigo as dep, regexp_replace(m.nombre, ',.*$', '') as ciudad,
         round(m.lat, 2) as lat, round(m.lon, 2) as lon, x.w
  from (values ('11001', 40), ('05001', 20), ('76001', 12), ('08001', 10), ('13001', 8), ('68001', 5), ('66001', 3), ('47001', 2)) x (codigo, w)
  join public.municipios m on m.codigo = x.codigo;

  -- Usuarios con su ventana de actividad dentro del periodo (alta, baja o rechazo de su organización) y sus sesiones.
  create temp table _u on commit drop as
  select u.usuario_id, u.email, u.clase, u.ip, u.pais::text as pais, u.departamento::text as departamento, u.municipio::text as municipio,
         u.ciudad, round(u.lat, 2) as lat, round(u.lon, 2) as lon, u.user_agent, u.navegador, u.sistema_operativo, u.dispositivo,
         u.viajero::text as viajero, u.clase in ('ADMIN', 'OPERACIONES', 'FINANZAS') as mfa,
         encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') as hash, u.alta_at < v_ini as antiguo, x.desde, x.hasta,
         greatest(0, round((u.sesiones_mes * extract(epoch from (x.hasta - x.desde)) / 2592000.0 * x.factor * (0.75 + random() * 0.5))::numeric))::integer as n_ses
  from private.demo_usuarios u
  left join private.demo_medios dm on u.clase = 'MEDIO' and dm.medio_id = u.org_id
  left join private.demo_anunciantes da on u.clase = 'ANUNCIANTE' and da.anunciante_id = u.org_id
  left join public.medios m on m.id = dm.medio_id
  left join public.anunciantes an on an.id = da.anunciante_id
  cross join lateral (
    select greatest(v_ini, u.alta_at + interval '15 minutes') as desde,
           least(v_hoy, dm.baja_at, da.baja_at, coalesce(m.rechazado_at, an.rechazado_at) + interval '10 days') as hasta,
           case coalesce(dm.estado_final, da.estado_final, 'VERIFICADO') when 'PENDIENTE' then 0.6 when 'RECHAZADO' then 0.5 else 1 end as factor) x;

  -- Estancias fuera del país: viajeros habituales (60 % de sus sesiones, con historial previo salvo tres) y 34 viajes
  -- ocasionales de 8 a 24 días.
  create temp table _viaje on commit drop as
  with hab as (
    select u.usuario_id, u.viajero as pais, v_ini - interval '1 day' as ini, v_hoy + interval '1 day' as fin,
           0.6::double precision as prob, row_number() over (order by u.email) > 3 as conocido
    from _u u where u.viajero is not null
  ), oca as (
    select z.usuario_id, p.pais, z.ini, z.ini + (8 + random() * 16) * interval '1 day' as fin, 1.0::double precision as prob, false as conocido
    -- El inicio se sortea fuera de la subconsulta ordenada: dentro, Postgres reutiliza el random() del ORDER BY y todos
    -- los viajes quedarían al comienzo del periodo.
    from (select u.usuario_id, u.desde, u.hasta
          from _u u
          where u.viajero is null and u.pais = 'CO' and u.clase in ('MEDIO', 'ANUNCIANTE') and u.n_ses >= 8
          order by random() limit 34) z0
    cross join lateral (select z0.usuario_id, z0.desde + random() * greatest(z0.hasta - z0.desde - interval '6 days', interval '1 day') as ini) z
    cross join lateral (
      select x.pais
      from (values ('US', 22), ('ES', 14), ('MX', 10), ('PA', 9), ('EC', 9), ('VE', 8), ('PE', 6), ('CL', 5), ('AR', 5), ('BR', 4),
                   ('DE', 2), ('FR', 2), ('CA', 2), ('GB', 2)) x (pais, w)
      order by -ln(greatest(random(), 1e-9)) / x.w + extract(epoch from z.ini) * 0 limit 1) p
  )
  select t.usuario_id, t.pais, t.ini, t.fin, t.prob, t.conocido, c.ciudad, c.lat, c.lon, private.demo_ip(t.pais) as ip
  from (select * from hab union all select * from oca) t
  cross join lateral (select k.ciudad, k.lat, k.lon from _ciu k where k.pais = t.pais
                      order by -ln(greatest(random(), 1e-9)) / k.w + extract(epoch from t.ini) * 0 limit 1) c;

  -- Sesiones: día con el peso semanal de §10.3 (los internos casi no entran el fin de semana) y hora según el rol.
  create temp table _s on commit drop as
  with cand as (
    select u.usuario_id, g as k, u.desde + random() * (u.hasta - u.desde) as t0, random() as r_dow, random() as r_h1, random() as r_h2
    from _u u cross join lateral generate_series(1, ceil(u.n_ses * 1.8)::integer + 2) g
    where u.n_ses > 0 and u.hasta > u.desde
  ), ok as (
    select c.usuario_id, c.t0, c.r_h1, c.r_h2, row_number() over (partition by c.usuario_id order by c.k) as rn
    from cand c join _u u on u.usuario_id = c.usuario_id
    where c.r_dow < (case when u.mfa then array[1.00, 1.00, 1.00, 1.00, 0.95, 0.12, 0.04]
                          else array[0.87, 1.00, 1.00, 0.96, 0.87, 0.61, 0.48] end)[extract(isodow from c.t0 at time zone 'America/Bogota')::integer]
  ), hora as (
    select o.usuario_id,
           (date_trunc('day', o.t0 at time zone 'America/Bogota') + make_interval(secs => 3600 * (case
              when u.mfa then (case when o.r_h1 < 0.45 then 7.5 + 3 * o.r_h2 when o.r_h1 < 0.65 then 10.5 + 2.5 * o.r_h2
                                    when o.r_h1 < 0.93 then 13.5 + 4.5 * o.r_h2 else 18 + 3 * o.r_h2 end)
              when u.clase = 'ANUNCIANTE' then (case when o.r_h1 < 0.40 then 8 + 3 * o.r_h2 when o.r_h1 < 0.60 then 11 + 2 * o.r_h2
                                                     when o.r_h1 < 0.90 then 14 + 4 * o.r_h2 else 18 + 3.5 * o.r_h2 end)
              else (case when o.r_h1 < 0.28 then 6.5 + 3 * o.r_h2 when o.r_h1 < 0.46 then 9.5 + 2.5 * o.r_h2 when o.r_h1 < 0.60 then 12 + 2 * o.r_h2
                         when o.r_h1 < 0.76 then 14 + 4 * o.r_h2 when o.r_h1 < 0.96 then 18.5 + 3.5 * o.r_h2 else 22 + 1.9 * o.r_h2 end)
            end))) at time zone 'America/Bogota' as t
    from ok o join _u u on u.usuario_id = o.usuario_id
    where o.rn <= u.n_ses
  )
  select gen_random_uuid() as sid, h.usuario_id, least(greatest(h.t, u.desde), v_hoy - random() * interval '2 hours') as t,
         random() as r_viaje, random() as r_nac, random() as r_ip, random() as r_fallo, random() as r_mfa, random() as r_fin,
         random() as r_dur, random() as r_pw
  from hora h join _u u on u.usuario_id = h.usuario_id;

  -- Ubicación de cada sesión y marca de país inusual (primer ingreso del usuario desde ese país sin historial previo).
  create temp table _sg on commit drop as
  select q.*, q.pais <> 'CO' and q.nuevo and row_number() over (partition by q.usuario_id, q.pais order by q.t) = 1 as sosp
  from (
    select s.sid, s.usuario_id, s.t, s.r_fallo, s.r_mfa, s.r_fin, s.r_dur, s.r_pw, u.clase, u.mfa, u.hash,
           u.user_agent, u.navegador, u.sistema_operativo, u.dispositivo,
           case when u.mfa then 'aal2' else 'aal1' end as aal_fin,
           case u.clase when 'MEDIO' then 720 when 'ANUNCIANTE' then 120 else 30 end as inactividad,
           coalesce(v.pais, u.pais) as pais,
           case when v.usuario_id is not null then null when n.codigo is not null then n.dep else u.departamento end as dep,
           case when v.usuario_id is not null then null when n.codigo is not null then n.codigo else u.municipio end as mun,
           coalesce(v.ciudad, n.ciudad, u.ciudad) as ciudad,
           coalesce(v.lat, n.lat, u.lat) as lat, coalesce(v.lon, n.lon, u.lon) as lon,
           case when v.usuario_id is not null then v.ip
                when n.codigo is not null or s.r_ip < 0.2 then private.demo_ip(u.pais) else u.ip end as ip,
           case when v.usuario_id is not null then not v.conocido else not u.antiguo end as nuevo
    from _s s join _u u on u.usuario_id = s.usuario_id
    left join _viaje v on v.usuario_id = s.usuario_id and s.t >= v.ini and s.t < v.fin and s.r_viaje < v.prob
    left join lateral (select k.codigo, k.dep, k.ciudad, k.lat, k.lon from _nac k
                       where v.usuario_id is null and u.pais = 'CO' and s.r_nac < 0.045 and k.codigo <> u.municipio
                       order by -ln(greatest(random(), 1e-9)) / k.w + extract(epoch from s.t) * 0 limit 1) n on true
  ) q;

  create temp table _e (
    t timestamptz not null, usuario_id uuid, hash text, evento text not null, sid uuid, aal text, ip inet, pais text, dep text,
    mun text, ciudad text, lat numeric, lon numeric, ua text, nav text, so text, disp text,
    sospechoso boolean not null default false, motivo text
  ) on commit drop;

  -- Eventos de cada sesión. Los intentos fallidos no llevan usuario ni sesión (como los registra la aplicación).
  insert into _e
  select x.t, x.usuario_id, g.hash, x.evento, x.sid, x.aal, g.ip, g.pais, g.dep, g.mun, g.ciudad, g.lat, g.lon,
         g.user_agent, g.navegador, g.sistema_operativo, g.dispositivo, x.sosp, x.motivo
  from _sg g
  cross join lateral (values
    (g.t, g.usuario_id, 'LOGIN_EXITOSO', g.sid, 'aal1', g.sosp, case when g.sosp then 'PAIS_INUSUAL' end, true),
    (g.t + (6 + g.r_dur * 14) * interval '1 second', g.usuario_id, 'MFA_FALLIDO', g.sid, 'aal1', false, null, g.mfa and g.r_mfa < 0.03),
    (g.t + (case when g.r_mfa < 0.03 then 32 else 8 end + g.r_dur * 30) * interval '1 second', g.usuario_id, 'MFA_EXITOSO', g.sid, 'aal2',
     false, null, g.mfa),
    (g.t - (15 + g.r_dur * 65) * interval '1 second', null, 'LOGIN_FALLIDO', null, null, false, null, g.r_fallo < 0.04),
    (g.t - (95 + g.r_dur * 60) * interval '1 second', null, 'LOGIN_FALLIDO', null, null, false, null, g.r_fallo < 0.01),
    (g.t + (4 + g.r_dur * 90) * interval '1 minute', g.usuario_id, 'CIERRE_SESION', g.sid, g.aal_fin, false, null, g.r_fin < 0.32),
    (g.t + (g.inactividad + 5 + g.r_dur * 120) * interval '1 minute', g.usuario_id, 'SESION_EXPIRADA', g.sid, g.aal_fin, false, null,
     g.r_fin >= 0.32 and g.r_fin < 0.42),
    (g.t + (20 + g.r_dur * 280) * interval '1 minute', g.usuario_id, 'SESION_REVOCADA', g.sid, g.aal_fin, false, null,
     g.r_fin >= 0.42 and g.r_fin < 0.4212),
    (g.t + (2 + g.r_dur * 9) * interval '1 minute', g.usuario_id, 'CONTRASENA_CAMBIADA', g.sid, g.aal_fin, false, null, g.r_pw < 0.004)
  ) x (t, usuario_id, evento, sid, aal, sosp, motivo, aplica)
  where x.aplica;

  -- Olvidos de contraseña: cinco fallos, bloqueo, recuperación y cambio de contraseña al volver a entrar.
  insert into _e
  select x.t, x.usuario_id, g.hash, x.evento, x.sid, x.aal, g.ip, g.pais, g.dep, g.mun, g.ciudad, g.lat, g.lon,
         g.user_agent, g.navegador, g.sistema_operativo, g.dispositivo, x.sosp, case when x.sosp then 'MULTIPLES_FALLOS' end
  from _sg g
  cross join lateral (
    select g.t - interval '25 minutes' - k * (18 + g.r_dur * 14) * interval '1 second' as t, null::uuid as usuario_id,
           'LOGIN_FALLIDO' as evento, null::uuid as sid, null::text as aal, false as sosp
    from generate_series(1, 5) k
    union all select g.t - interval '25 minutes' + interval '9 seconds', null, 'LOGIN_BLOQUEADO', null, null, true
    union all select g.t - interval '21 minutes', null, 'RECUPERACION_SOLICITADA', null, null, false
    union all select g.t + interval '50 seconds', g.usuario_id, 'CONTRASENA_CAMBIADA', g.sid, 'aal1', false
  ) x
  where not g.mfa and g.r_pw >= 0.004 and g.r_pw < 0.0055;

  -- Ráfagas de intentos desde RU, CN y NG contra unas pocas cuentas, repartidas por todo el periodo (una cada ~6 días):
  -- del sexto intento en adelante quedan como MULTIPLES_FALLOS y terminan en un bloqueo.
  create temp table _atq on commit drop as
  select i as n, o.hash, c.pais, c.ciudad, c.lat, c.lon, private.demo_ip(c.pais) as ip,
         v_ini + ((i - 1 + random()) / 14.0) * (v_hoy - v_ini - interval '6 hours') as t0,
         6 + floor(random() * 6)::integer as intentos, 4 + random() * 12 as paso, 1 + floor(random() * 3)::integer as k_ua
  from generate_series(1, 14) i
  cross join lateral (select u.hash from _u u
                      where u.email in ('demo.admin@amo.test', 'demo.finanzas@amo.test', 'equipo-operaciones-1@demo.amo.co',
                                        'anunciante-03@demo.amo.co', 'anunciante-04@demo.amo.co', 'demo.medio@amo.test')
                      order by random() + i * 0 limit 1) o
  cross join lateral (select k.pais, k.ciudad, k.lat, k.lon from _ciu k where k.pais in ('RU', 'CN', 'NG')
                      order by random() + i * 0 limit 1) c;
  insert into _e
  select a.t0 + j * a.paso * interval '1 second', null, a.hash, case when j > a.intentos then 'LOGIN_BLOQUEADO' else 'LOGIN_FALLIDO' end,
         null, null, a.ip, a.pais, null, null, a.ciudad, a.lat, a.lon, ua.ua, ua.nav, ua.so, ua.disp, j > 5,
         case when j > 5 then 'MULTIPLES_FALLOS' end
  from _atq a
  cross join lateral generate_series(1, a.intentos + 1) j
  join (values (1, 'python-requests/2.32.3', null, null, 'OTRO'),
               (2, 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36', 'Chrome', 'Linux', 'ESCRITORIO'),
               (3, 'curl/8.7.1', null, null, 'OTRO')) ua (k, ua, nav, so, disp) on ua.k = a.k_ua;

  insert into public.accesos (created_at, usuario_id, email_hash, evento, session_id, aal, ip, pais_iso2, departamento_codigo,
                              municipio_codigo, ciudad, lat, lon, user_agent, navegador, sistema_operativo, dispositivo,
                              es_sospechoso, motivo_sospecha, es_demo)
  select e.t, e.usuario_id, e.hash, e.evento::public.acceso_evento, e.sid, e.aal, e.ip, e.pais, e.dep, e.mun, e.ciudad, e.lat, e.lon,
         left(e.ua, 400), e.nav, e.so, e.disp, e.sospechoso, e.motivo, true
  from _e e
  where e.t <= v_hoy
  order by e.t, e.evento;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('accesos', v_n);

  update public.perfiles p set ultimo_acceso_at = z.t, updated_at = greatest(p.updated_at, z.t)
  from (select e.usuario_id, max(e.t) as t from _e e where e.evento = 'LOGIN_EXITOSO' and e.t <= v_hoy group by e.usuario_id) z
  where p.id = z.usuario_id;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('perfiles_con_ultimo_acceso', v_n);

  -- Alertas de país inusual (private.fn_accesos_alertar): al usuario siempre; al superadministrador, las del último mes.
  insert into private.demo_avisos (t, usuario_id, tipo, datos, entidad, entidad_id, prioridad)
  select a.created_at, a.usuario_id, 'seguridad.pais_inusual',
         jsonb_build_object('pais', pa.nombre, 'fecha', private.formato_fecha(a.created_at)), 'accesos', a.id::text, 2
  from public.accesos a join public.paises pa on pa.iso2 = a.pais_iso2
  where a.es_demo and a.motivo_sospecha = 'PAIS_INUSUAL' and a.usuario_id is not null
  union all
  select a.created_at, sa.id, 'seguridad.alerta_pais_inusual',
         jsonb_build_object('usuario', coalesce(nullif(btrim(p.nombre), ''), 'Un usuario'), 'pais', pa.nombre,
                            'fecha', private.formato_fecha(a.created_at)), 'accesos', a.id::text, 2
  from public.accesos a join public.paises pa on pa.iso2 = a.pais_iso2 join public.perfiles p on p.id = a.usuario_id
  cross join (select x.id from public.perfiles x join public.roles ro on ro.id = x.rol_id
              where ro.clave = 'SUPERADMIN' and x.estado = 'ACTIVO' and x.deleted_at is null and x.email::text not like 'e2e.%') sa
  where a.es_demo and a.motivo_sospecha = 'PAIS_INUSUAL' and a.created_at > v_hoy - interval '30 days';

  return r || (select jsonb_build_object(
      'ingresos', count(*) filter (where a.evento = 'LOGIN_EXITOSO'),
      'ingresos_colombia_pct', round(100.0 * count(*) filter (where a.evento = 'LOGIN_EXITOSO' and a.pais_iso2 = 'CO')
                                     / nullif(count(*) filter (where a.evento = 'LOGIN_EXITOSO'), 0), 1),
      'paises', count(distinct a.pais_iso2) filter (where a.evento = 'LOGIN_EXITOSO'),
      'fallidos', count(*) filter (where a.evento = 'LOGIN_FALLIDO'),
      'bloqueos', count(*) filter (where a.evento = 'LOGIN_BLOQUEADO'),
      'sospechosos', count(*) filter (where a.es_sospechoso),
      'pais_inusual', count(*) filter (where a.motivo_sospecha = 'PAIS_INUSUAL'),
      'desde', min(a.created_at), 'hasta', max(a.created_at))
    from public.accesos a where a.es_demo);
end $fn$;
revoke all on function private.demo_accesos(double precision, integer) from public, anon, authenticated, service_role;
