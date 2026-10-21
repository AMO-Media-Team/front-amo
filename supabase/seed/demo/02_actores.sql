-- Datos demo · paso 02 · actores (docs/modelo-datos.md §10.2 pasos 2–5)
-- 40 anunciantes, 300 medios ponderados por población departamental, cuentas sociales con su verificación inicial,
-- audiencia por país, pertinencia geográfica, documentos y la vinculación de los usuarios demo (creados antes con
-- `pnpm demo:generar usuarios`, Admin API). Ejecutar con amo.modo_carga dentro de una transacción.

create or replace function private.demo_actores(p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_t0 timestamptz := timestamptz '2025-07-01 00:00:00-05';
  v_previo timestamptz := timestamptz '2025-05-02 08:00:00-05';
  v_faltan integer;
  v_ops uuid[];
  v_estrella integer;
  r jsonb := '{}';
  v_n integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_actores exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  if exists (select 1 from private.demo_medios) then
    raise exception 'Los actores demo ya existen: ejecuta la purga antes de volver a generar';
  end if;
  perform setseed(p_semilla);

  -- 1. Usuarios esperados (los crea scripts/demo/generar.ts con la Admin API) -------------------------------------
  create temp table _esp on commit drop as
    select x.email, x.clase, x.n, x.principal, x.nombre
    from (values ('demo.admin@amo.test', 'ADMIN', 0, true, 'Camila Restrepo (Administración)'),
                 ('demo.operaciones@amo.test', 'OPERACIONES', 0, true, 'Andrés Felipe Gómez (Operaciones)'),
                 ('demo.finanzas@amo.test', 'FINANZAS', 0, true, 'Paola Andrea Muñoz (Finanzas)'),
                 ('equipo-operaciones-1@demo.amo.co', 'OPERACIONES', 0, true, 'Juliana Ortiz'),
                 ('equipo-operaciones-2@demo.amo.co', 'OPERACIONES', 0, true, 'Sebastián Cárdenas'),
                 ('equipo-finanzas-1@demo.amo.co', 'FINANZAS', 0, true, 'Mauricio Londoño'),
                 ('demo.anunciante@amo.test', 'ANUNCIANTE', 1, true, 'Valentina Herrera'),
                 ('demo.medio@amo.test', 'MEDIO', 0, true, 'Jorge Iván Castaño')) x (email, clase, n, principal, nombre)
    union all
    select format('anunciante-%s@demo.amo.co', lpad(g::text, 2, '0')), 'ANUNCIANTE', g, g <> 1, null
    from generate_series(1, 40) g
    union all
    select format('anunciante-%s-b@demo.amo.co', lpad(g::text, 2, '0')), 'ANUNCIANTE', g, false, null
    from generate_series(1, 15) g
    union all
    select format('medio-%s@demo.amo.co', lpad(g::text, 3, '0')), 'MEDIO', g, true, null
    from generate_series(1, 300) g;
  select count(*) into v_faltan from _esp e where not exists (select 1 from public.perfiles p where p.email = e.email::citext);
  if v_faltan > 0 then
    raise exception 'Faltan % usuarios demo en Auth: ejecuta `pnpm demo:generar usuarios` antes de este paso', v_faltan;
  end if;

  create temp table _nombres on commit drop as
    select g as k,
           (array['Juan','María','Carlos','Luisa','Andrés','Daniela','Santiago','Laura','Felipe','Natalia','Camilo','Paula',
                  'Julián','Sara','Mateo','Valeria','Diego','Carolina','Esteban','Manuela','Óscar','Tatiana','Ricardo','Lina',
                  'Fabián','Yuliana','Harold','Mónica','Jhon','Angélica','Wilson','Diana','Cristian','Marcela','Edwin','Sandra',
                  'Brayan','Leidy','Germán','Claudia'])[1 + (g * 7) % 40] as nombre,
           (array['Gómez','Rodríguez','Martínez','López','García','Hernández','Ramírez','Torres','Díaz','Moreno','Rojas','Vargas',
                  'Castro','Ortiz','Suárez','Jiménez','Ríos','Mejía','Cardona','Osorio','Quintero','Salazar','Arango','Zapata',
                  'Giraldo','Montoya','Bedoya','Patiño','Valencia','Acosta','Peña','Cuesta','Mosquera','Guerrero','Narváez',
                  'Pacheco','Barrios','Pérez','Sierra','Lozano'])[1 + (g * 13 + g / 40) % 40] as apellido
    from generate_series(0, 400) g;

  -- 2. Equipo interno ------------------------------------------------------------------------------------------------
  insert into private.demo_usuarios (usuario_id, email, clase, org_id, principal, alta_at, pais, departamento, municipio,
                                     sesiones_mes)
  select p.id, p.email::text, e.clase, null, true, v_previo + (row_number() over (order by e.email)) * interval '3 hours',
         'CO', '11', '11001', case e.clase when 'ADMIN' then 22 when 'OPERACIONES' then 20 else 16 end
  from _esp e join public.perfiles p on p.email = e.email::citext
  where e.clase in ('ADMIN', 'OPERACIONES', 'FINANZAS');
  select array_agg(u.usuario_id order by u.email) into v_ops from private.demo_usuarios u where u.clase = 'OPERACIONES';

  -- 3. Anunciantes (32 CO + 8 internacionales) ------------------------------------------------------------------------
  create temp table _an on commit drop as
  select x.n, private.uuid_v7() as id, x.comercial, x.razon, s.id as sector_id, x.pais, x.mun, x.ciudad, x.estado,
         case when x.n <= 12 then v_previo + x.n * interval '2 days 3 hours' + random() * interval '5 hours'
              when x.estado = 'PENDIENTE' then v_hoy - (1 + (x.n % 4)) * interval '1 day' - random() * interval '6 hours'
              else v_t0 + (x.n - 12) * interval '11 days' + random() * interval '4 days' end as alta_at
  from (values
    (1,  'Supermercados La Cosecha', 'Comercializadora La Cosecha S.A.S.', 'Retail y comercio', 'CO', '11001', null, 'VERIFICADO'),
    (2,  'Almacenes El Faro', 'Almacenes El Faro S.A.', 'Retail y comercio', 'CO', '05001', null, 'VERIFICADO'),
    (3,  'Banco Andino del Pacífico', 'Banco Andino del Pacífico S.A.', 'Banca y seguros', 'CO', '11001', null, 'VERIFICADO'),
    (4,  'Conecta Móvil', 'Conecta Móvil Colombia S.A. E.S.P.', 'Telecomunicaciones', 'CO', '11001', null, 'VERIFICADO'),
    (5,  'Lácteos Monteverde', 'Productos Lácteos Monteverde S.A.', 'Alimentos y bebidas', 'CO', '05001', null, 'VERIFICADO'),
    (6,  'Droguerías Vida Sana', 'Droguerías Vida Sana S.A.S.', 'Salud y farmacia', 'CO', '76001', null, 'VERIFICADO'),
    (7,  'Fundación Universitaria Horizonte', 'Fundación Universitaria Horizonte', 'Educación', 'CO', '11001', null, 'VERIFICADO'),
    (8,  'Instituto de Turismo Caribe', 'Instituto Distrital de Turismo Caribe', 'Gobierno y entidades públicas', 'CO', '08001', null, 'VERIFICADO'),
    (9,  'Café Sierra Alta', 'Tostadora Sierra Alta S.A.S.', 'Alimentos y bebidas', 'CO', '17001', null, 'VERIFICADO'),
    (10, 'Moda Trópico', 'Confecciones Trópico S.A.S.', 'Retail y comercio', 'CO', '05001', null, 'VERIFICADO'),
    (11, 'Seguros Cordillera', 'Compañía de Seguros Cordillera S.A.', 'Banca y seguros', 'CO', '11001', null, 'VERIFICADO'),
    (12, 'FibraHogar Internet', 'FibraHogar Telecomunicaciones S.A.S.', 'Telecomunicaciones', 'CO', '76001', null, 'VERIFICADO'),
    (13, 'Clínica Santa Aurora', 'Clínica Santa Aurora S.A.', 'Salud y farmacia', 'CO', '68001', null, 'VERIFICADO'),
    (14, 'Motores del Caribe', 'Motores del Caribe S.A.S.', 'Automotor', 'CO', '08001', null, 'VERIFICADO'),
    (15, 'Constructora Altos del Río', 'Constructora Altos del Río S.A.', 'Construcción e inmobiliario', 'CO', '05001', null, 'VERIFICADO'),
    (16, 'Tiendas Don Chucho', 'Inversiones Don Chucho S.A.S.', 'Retail y comercio', 'CO', '76001', null, 'VERIFICADO'),
    (17, 'Panadería La Espiga Dorada', 'La Espiga Dorada S.A.S.', 'Alimentos y bebidas', 'CO', '11001', null, 'VERIFICADO'),
    (18, 'Instituto Técnico Nuevo Saber', 'Corporación Educativa Nuevo Saber', 'Educación', 'CO', '66001', null, 'VERIFICADO'),
    (19, 'Cooperativa Solidaria del Oriente', 'Cooperativa Financiera Solidaria del Oriente', 'Banca y seguros', 'CO', '68001', null, 'VERIFICADO'),
    (20, 'Red Móvil Llanera', 'Red Móvil Llanera S.A.S.', 'Telecomunicaciones', 'CO', '50001', null, 'VERIFICADO'),
    (21, 'Ferretería El Maestro', 'Ferretería El Maestro S.A.S.', 'Retail y comercio', 'CO', '11001', null, 'SUSPENDIDO'),
    (22, 'Refrescos Costa Azul', 'Embotelladora Costa Azul S.A.', 'Alimentos y bebidas', 'CO', '08001', null, 'VERIFICADO'),
    (23, 'Programa Salud Pública Regional', 'Fondo Regional de Salud Pública', 'Gobierno y entidades públicas', 'CO', '11001', null, 'VERIFICADO'),
    (24, 'EnerSol Energía Solar', 'EnerSol Colombia S.A.S. E.S.P.', 'Energía y servicios públicos', 'CO', '76001', null, 'VERIFICADO'),
    (25, 'Viajes Macondo Travel', 'Macondo Travel S.A.S.', 'Turismo', 'CO', '13001', null, 'VERIFICADO'),
    (26, 'TecnoPlaza', 'TecnoPlaza Colombia S.A.S.', 'Tecnología', 'CO', '11001', null, 'VERIFICADO'),
    (27, 'Cine Estelar', 'Exhibidora Cine Estelar S.A.', 'Entretenimiento', 'CO', '05001', null, 'VERIFICADO'),
    (28, 'Óptica Clara Visión', 'Clara Visión S.A.S.', 'Salud y farmacia', 'CO', '11001', null, 'VERIFICADO'),
    (29, 'Hipermuebles del Norte', 'Hipermuebles del Norte S.A.S.', 'Retail y comercio', 'CO', '54001', null, 'RECHAZADO'),
    (30, 'Avícola Campo Lindo', 'Avícola Campo Lindo S.A.', 'Alimentos y bebidas', 'CO', '73001', null, 'PENDIENTE'),
    (31, 'Inmobiliaria Raíz', 'Inmobiliaria Raíz S.A.S.', 'Construcción e inmobiliario', 'CO', '05266', null, 'VERIFICADO'),
    (32, 'AutoRepuestos Nariño', 'AutoRepuestos Nariño S.A.S.', 'Automotor', 'CO', '52001', null, 'PENDIENTE'),
    (33, 'Remesas Rápidas', 'Remesas Rápidas USA Inc.', 'Banca y seguros', 'US', null, 'Miami', 'VERIFICADO'),
    (34, 'Vuela Azteca', 'Vuela Azteca S.A. de C.V.', 'Turismo', 'MX', null, 'Ciudad de México', 'VERIFICADO'),
    (35, 'Envíos Ibéricos', 'Envíos Ibéricos S.L.', 'Otros', 'ES', null, 'Madrid', 'VERIFICADO'),
    (36, 'Zona Libre Electrónica', 'Zona Libre Electrónica S.A.', 'Retail y comercio', 'PA', null, 'Ciudad de Panamá', 'VERIFICADO'),
    (37, 'Andes Telecom', 'Andes Telecom Ecuador S.A.', 'Telecomunicaciones', 'EC', null, 'Quito', 'VERIFICADO'),
    (38, 'Pisco y Sabor', 'Pisco y Sabor S.A.C.', 'Alimentos y bebidas', 'PE', null, 'Lima', 'VERIFICADO'),
    (39, 'Educación Online Austral', 'Educación Online Austral SpA', 'Educación', 'CL', null, 'Santiago', 'VERIFICADO'),
    (40, 'Banco Digital Verde', 'Banco Digital Verde S.A.', 'Tecnología', 'BR', null, 'São Paulo', 'VERIFICADO')
  ) x (n, comercial, razon, sector, pais, mun, ciudad, estado)
  join public.sectores s on s.nombre = x.sector;

  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, identificacion_extranjera,
    sector_id, pais_iso2, municipio_codigo, ciudad_extranjera, datos_facturacion, estado_verificacion, verificado_por,
    verificado_at, rechazado_at, suspendido_at, motivo_estado, es_demo, created_at, updated_at)
  select a.id, a.razon, a.comercial,
         case when a.pais = 'CO' then (900100000 + a.n * 7919)::text end,
         case when a.pais = 'CO' then private.demo_dv((900100000 + a.n * 7919)::text) end,
         case when a.pais <> 'CO' then a.pais || '-' || (48000000 + a.n * 104729)::text end,
         a.sector_id, a.pais, a.mun, a.ciudad,
         jsonb_build_object('email_facturacion', format('facturacion.anunciante%s@demo.amo.co', lpad(a.n::text, 2, '0')),
                            'regimen', 'RESPONSABLE_IVA', 'responsabilidades_fiscales', jsonb_build_array('O-13', 'O-15'),
                            'es_gran_contribuyente', a.n in (3, 4, 11), 'es_autorretenedor', a.n in (3, 11)),
         case when a.estado = 'SUSPENDIDO' then 'VERIFICADO' else a.estado end::public.anunciante_estado,
         case when a.estado in ('VERIFICADO', 'SUSPENDIDO') then v_ops[1 + a.n % cardinality(v_ops)] end,
         case when a.estado in ('VERIFICADO', 'SUSPENDIDO') then private.demo_habil(a.alta_at, 20 + (a.n % 5) * 9) end,
         case when a.estado = 'RECHAZADO' then private.demo_habil(a.alta_at, 60) end,
         null,
         case when a.estado = 'RECHAZADO' then 'El RUT aportado no corresponde a la razón social registrada.' end,
         true, a.alta_at, a.alta_at
  from _an a;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('anunciantes', v_n);

  insert into private.demo_anunciantes (n, anunciante_id, peso, alta_at, verificado_at, baja_at, estado_final)
  select a.n, a.id, case when a.n = 1 then 2.6 else round((1 / power(a.n, 0.62))::numeric, 4) end, a.alta_at, x.verificado_at,
         case when a.estado = 'SUSPENDIDO' then v_hoy - interval '52 days' end, a.estado
  from _an a join public.anunciantes x on x.id = a.id;

  insert into public.anunciantes_privado (anunciante_id, contacto_nombre, contacto_email, contacto_celular, direccion,
                                          created_at, updated_at)
  select a.id, nm.nombre || ' ' || nm.apellido, format('contacto.anunciante%s@demo.amo.co', lpad(a.n::text, 2, '0')),
         '+57 3' || (10 + a.n % 12)::text || ' ' || lpad(((a.n * 7654321) % 10000000)::text, 7, '0'),
         'Cra ' || (7 + a.n % 60) || ' # ' || (12 + a.n * 3 % 120) || '-' || (10 + a.n % 80), a.alta_at, a.alta_at
  from _an a join _nombres nm on nm.k = 300 + a.n;

  insert into public.documentos_anunciante (anunciante_id, tipo, archivo_path, estado_validacion, validado_por, validado_at,
                                            observaciones, subido_por, created_at, updated_at)
  select a.id, t.tipo, 'anunciante/' || a.id || '/' || t.tipo || '/demo.pdf',
         case a.estado when 'PENDIENTE' then 'PENDIENTE' when 'RECHAZADO' then (case when t.tipo = 'RUT' then 'RECHAZADO' else 'PENDIENTE' end)
                       else 'APROBADO' end::public.documento_estado,
         case when a.estado in ('VERIFICADO', 'SUSPENDIDO') or (a.estado = 'RECHAZADO' and t.tipo = 'RUT') then v_ops[1 + a.n % cardinality(v_ops)] end,
         case when a.estado in ('VERIFICADO', 'SUSPENDIDO') then x.verificado_at - interval '20 minutes'
              when a.estado = 'RECHAZADO' and t.tipo = 'RUT' then x.rechazado_at end,
         case when a.estado = 'RECHAZADO' and t.tipo = 'RUT' then 'El documento no corresponde a la razón social.' end,
         null, a.alta_at + interval '25 minutes', coalesce(x.verificado_at, x.rechazado_at, a.alta_at + interval '25 minutes')
  from _an a join public.anunciantes x on x.id = a.id
  cross join (values ('RUT'::public.documento_anunciante_tipo), ('CAMARA_COMERCIO')) t (tipo);

  -- Excepciones de comisión por anunciante (15 %): los anunciantes 2 y 5.
  insert into public.comisiones_excepcion (anunciante_id, porcentaje, vigente_desde, motivo, creada_por, created_at, updated_at)
  select a.id, 0.15, x.verificado_at + interval '2 hours', 'Acuerdo comercial por volumen (demo)', null,
         x.verificado_at + interval '2 hours', x.verificado_at + interval '2 hours'
  from _an a join public.anunciantes x on x.id = a.id where a.n in (2, 5);

  -- 4. Medios (300) ----------------------------------------------------------------------------------------------------
  create temp table _dep on commit drop as
  with w as (select d.codigo, d.capital_codigo, power(coalesce(d.poblacion, 60000), 0.8) as w,
                    case when d.codigo in ('94', '97', '99') then 1 else 2 end as minimo
             from public.departamentos d where d.activo)
  select w.codigo, w.capital_codigo, greatest(w.minimo, round(300 * w.w / sum(w.w) over ()))::integer as n from w;
  update _dep set n = n + (300 - (select sum(d.n) from _dep d)) where codigo = '11';

  create temp table _m on commit drop as
  with base as (
    select d.codigo as dep, d.capital_codigo, g.k, random() as r_cap, random() as r_tipo, random() as r_estado,
           random() as r_nivel, random() as r_alta, random() as r_orden
    from _dep d cross join lateral generate_series(1, d.n) g (k)
  ), ubicado as (
    select b.*, mu.codigo as mun, mu.nombre as mun_nombre, mu.lon, mu.lat
    from base b
    cross join lateral (
      select m.codigo, m.nombre, m.lon, m.lat
      from public.municipios m
      where m.departamento_codigo = b.dep and m.activo and m.lon is not null
        and (case when left(b.capital_codigo, 2) = b.dep and (b.r_cap < 0.55 or b.k = 1) then m.codigo = b.capital_codigo
                  else m.codigo <> coalesce(b.capital_codigo, '') or b.dep = '11' end)
      order by -ln(greatest(random(), 1e-9)) / (case when m.codigo = any (array[
        '05088','05360','05266','05615','05045','05837','05154','05631','05376',
        '25754','25269','25899','25175','25290','25307','25473','25430','25286','25126',
        '76520','76109','76834','76147','76111','76364','76892','08758','08433','08638','08573',
        '13430','13836','13244','68276','68307','68547','68081','54498','54874','54518','23417','23660','23162',
        '73268','73449','52835','52356','19698','41551','41298','50006','50313','47189','20011','15238','15759','15176',
        '17380','17174','66170','66682','63130','44430','70215','85010']) then 14.0
        when m.tipo = 'MUNICIPIO' then 1.0 else 0.2 end) + b.k * 0
      limit 1) mu
  )
  select row_number() over (order by u.r_orden)::integer as n, private.uuid_v7() as id, u.dep, u.mun,
         regexp_replace(u.mun_nombre, ',.*$', '') as lugar, u.lon, u.lat,
         case when u.r_tipo < 0.45 then 'PAGINA_NOTICIAS' when u.r_tipo < 0.70 then 'CREADOR' when u.r_tipo < 0.82 then 'COMUNITARIO'
              when u.r_tipo < 0.92 then 'EMISORA' when u.r_tipo < 0.97 then 'PERIODICO' else 'CANAL_TV' end as tipo,
         case when u.r_estado < 0.88 then 'VERIFICADO' when u.r_estado < 0.94 then 'PENDIENTE' when u.r_estado < 0.97 then 'RECHAZADO'
              else 'SUSPENDIDO' end as estado,
         case when u.r_nivel < 0.55 then 1 when u.r_nivel < 0.90 then 2 else 3 end as nivel, u.r_alta
  from ubicado u;

  -- El medio «estrella» (demo.medio@amo.test): verificado, nivel 2, en una capital grande y desde antes del periodo.
  select m.n into v_estrella from _m m
  where m.estado = 'VERIFICADO' and m.mun in ('05001', '76001', '08001', '68001', '11001') and m.tipo = 'PAGINA_NOTICIAS'
  order by (m.mun = '05001') desc, m.n limit 1;
  if v_estrella is null then select min(m.n) into v_estrella from _m m where m.estado = 'VERIFICADO'; end if;
  update _m set nivel = 2, r_alta = 0.01 where n = v_estrella;
  -- Departamentos pequeños: su primer medio queda verificado para que todo el país tenga datos.
  update _m m set estado = 'VERIFICADO'
  where m.estado <> 'VERIFICADO'
    and m.n = (select min(x.n) from _m x where x.dep = m.dep)
    and not exists (select 1 from _m x where x.dep = m.dep and x.estado = 'VERIFICADO');

  create temp table _mn on commit drop as
  select m.*, nm.nombre as p_nombre, nm.apellido as p_apellido,
         row_number() over (partition by m.mun, m.tipo order by m.n) - 1 as k
  from _m m join _nombres nm on nm.k = m.n;

  create temp table _mf on commit drop as
  select x.*,
         case when x.estado in ('VERIFICADO', 'SUSPENDIDO')
              then (case when x.r_alta < 0.45 then v_previo + x.r_alta / 0.45 * interval '55 days'
                         else v_t0 + power((x.r_alta - 0.45) / 0.55, 0.85) * (v_hoy - interval '25 days' - v_t0) end)
              when x.estado = 'PENDIENTE' then v_hoy - interval '1 day' - x.r_alta * interval '11 days'
              else v_t0 + x.r_alta * (v_hoy - interval '30 days' - v_t0) end as alta_at
  from (
    select mn.n, mn.id, mn.dep, mn.mun, mn.lon, mn.lat, mn.tipo, mn.estado, mn.nivel, mn.r_alta, mn.p_nombre, mn.p_apellido,
           case mn.tipo
             when 'CREADOR' then mn.p_nombre || ' ' || mn.p_apellido
             else replace((case mn.tipo
                 when 'PAGINA_NOTICIAS' then (array['{L} Noticias', 'Noticias {L}', '{L} al Día', 'El Informador de {L}', '{L} Hoy',
                   'La Voz de {L}', 'Qué Pasa {L}', '{L} en Línea', 'Diario {L} Digital', 'Última Hora {L}', 'Así es {L}', '{L} Informa'])[1 + mn.k % 12]
                 when 'COMUNITARIO' then (array['Vecinos de {L}', 'Comunidad {L}', '{L} Somos Todos', 'Barrio Adentro {L}', 'Gente de {L}'])[1 + mn.k % 5]
                 when 'EMISORA' then (array['{L} Stereo', 'Radio {L}', 'Ondas de {L}', 'La Sabrosa de {L}', '{L} FM'])[1 + mn.k % 5]
                 when 'PERIODICO' then (array['El Pregón de {L}', 'Semanario {L}', 'La Gaceta de {L}', 'El Correo de {L}'])[1 + mn.k % 4]
                 else (array['Canal {L} TV', 'Tele {L}', '{L} Visión'])[1 + mn.k % 3] end), '{L}',
               mn.lugar || case when mn.k >= (case mn.tipo when 'PAGINA_NOTICIAS' then 12 when 'COMUNITARIO' then 5 when 'EMISORA' then 5
                                                         when 'PERIODICO' then 4 else 3 end)
                                then ' ' || (array['Norte', 'Sur', 'Centro', 'Oriente', 'Occidente'])[1 + (mn.k / 12) % 5] else '' end)
           end as nombre
    from _mn mn) x;

  insert into public.medios (id, nombre, tipo, municipio_codigo, descripcion_audiencia, estado, nivel_verificacion, lon, lat,
    verificado_por, verificado_at, rechazado_at, motivo_estado, es_demo, created_at, updated_at)
  select m.id, m.nombre, m.tipo::public.medio_tipo, m.mun,
         'Audiencia local de ' || mu.nombre || ' y municipios vecinos. Contenido propio, publicaciones diarias.',
         case when m.estado = 'SUSPENDIDO' then 'VERIFICADO' else m.estado end::public.medio_estado,
         case when m.estado in ('VERIFICADO', 'SUSPENDIDO') then m.nivel else 0 end,
         round((m.lon + (random() - 0.5) * 0.04)::numeric, 6), round((m.lat + (random() - 0.5) * 0.04)::numeric, 6),
         case when m.estado in ('VERIFICADO', 'SUSPENDIDO') then v_ops[1 + m.n % cardinality(v_ops)] end,
         case when m.estado in ('VERIFICADO', 'SUSPENDIDO') then private.demo_habil(m.alta_at, 24 + (m.n % 6) * 20) end,
         case when m.estado = 'RECHAZADO' then private.demo_habil(m.alta_at, 70) end,
         case when m.estado = 'RECHAZADO' then (array['La prueba de vida no coincide con el documento de identidad.',
           'La cuenta social no supera el umbral mínimo de seguidores.', 'Los documentos aportados son ilegibles.'])[1 + m.n % 3] end,
         true, m.alta_at, m.alta_at
  from _mf m join public.municipios mu on mu.codigo = m.mun;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('medios', v_n);

  insert into private.demo_medios (n, medio_id, alta_at, verificado_at, baja_at, estado_final, nivel, calidad, actividad, fiabilidad)
  select m.n, m.id, m.alta_at, x.verificado_at,
         case when m.estado = 'SUSPENDIDO' then v_hoy - interval '9 days' - random() * interval '80 days' end, m.estado, m.nivel,
         round(private.demo_ln(1, 0.30)::numeric, 4),
         case when m.n = v_estrella then 2.4 else round(least(private.demo_ln(1, 0.55), 3)::numeric, 4) end,
         case when m.n = v_estrella then 0.35 else round(least(private.demo_ln(1, 0.75), 5)::numeric, 4) end
  from _mf m join public.medios x on x.id = m.id;

  insert into public.medios_privado (medio_id, titular_nombre, tipo_documento, numero_documento_resumen, celular, email_contacto,
    direccion, es_declarante, obligado_facturar, responsable_iva, metodo_pago, datos_pago_resumen, created_at, updated_at)
  select m.id, case when m.nivel = 3 and m.tipo <> 'CREADOR' then m.nombre || ' S.A.S.' else m.p_nombre || ' ' || m.p_apellido end,
         case when m.nivel = 3 then 'NIT' else 'CC' end::public.documento_identidad_tipo,
         '•••• ' || lpad(((m.n * 7919) % 10000)::text, 4, '0'),
         '+57 3' || (10 + m.n % 12)::text || ' ' || lpad(((m.n * 4567891) % 10000000)::text, 7, '0'),
         format('contacto.medio%s@demo.amo.co', lpad(m.n::text, 3, '0')),
         'Cll ' || (5 + m.n % 90) || ' # ' || (3 + m.n * 7 % 70) || '-' || (5 + m.n % 90),
         case m.nivel when 1 then m.n % 7 = 0 when 2 then m.n % 5 < 3 else true end,
         m.nivel = 3 and m.n % 5 <> 0, m.nivel = 3 and m.n % 5 <> 0,
         case when m.n % 5 < 3 then 'BANCARIO' else 'BILLETERA' end::public.metodo_pago,
         case when m.n % 5 < 3 then 'Cuenta de ahorros ••• ' else 'Nequi ••• ' end || lpad(((m.n * 3571) % 10000)::text, 4, '0'),
         m.alta_at + interval '10 minutes', m.alta_at + interval '10 minutes'
  from _mf m;

  -- Documentos según nivel + certificado del medio de pago; SEG_SOCIAL para una parte de los verificados.
  insert into public.documentos_medio (medio_id, tipo, archivo_path, estado_validacion, validado_por, validado_at,
                                       fecha_vencimiento, observaciones, subido_por, created_at, updated_at)
  select m.id, t.tipo, 'medio/' || m.id || '/' || t.tipo || '/demo.webp',
         case m.estado when 'PENDIENTE' then 'PENDIENTE'
                       when 'RECHAZADO' then (case when t.tipo = 'PRUEBA_VIDA' then 'RECHAZADO' else 'PENDIENTE' end)
                       else 'APROBADO' end::public.documento_estado,
         case when m.estado in ('VERIFICADO', 'SUSPENDIDO') or (m.estado = 'RECHAZADO' and t.tipo = 'PRUEBA_VIDA')
              then v_ops[1 + m.n % cardinality(v_ops)] end,
         case when m.estado in ('VERIFICADO', 'SUSPENDIDO') then x.verificado_at - interval '15 minutes'
              when m.estado = 'RECHAZADO' and t.tipo = 'PRUEBA_VIDA' then x.rechazado_at end,
         case when t.tipo = 'SEG_SOCIAL' then (date_trunc('month', v_hoy) + interval '2 months')::date end,
         case when m.estado = 'RECHAZADO' and t.tipo = 'PRUEBA_VIDA' then 'La prueba de vida no es válida.' end,
         null, m.alta_at + interval '30 minutes', coalesce(x.verificado_at, x.rechazado_at, m.alta_at + interval '30 minutes')
  from _mf m join public.medios x on x.id = m.id
  cross join lateral (
    select d.tipo from unnest((select nv.documentos_requeridos from public.niveles_verificacion nv
                               where nv.nivel = case when m.estado in ('VERIFICADO', 'SUSPENDIDO') then m.nivel else 1 end)) d (tipo)
    union all
    select case when m.n % 5 < 3 then 'CERT_BANCARIA' else 'CERT_BILLETERA' end::public.documento_medio_tipo
    union all
    select 'SEG_SOCIAL'::public.documento_medio_tipo
    where m.estado in ('VERIFICADO', 'SUSPENDIDO') and (m.nivel >= 2 and m.n % 10 < 8 or m.nivel = 1 and m.n % 10 < 4)) t;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('documentos_medio', v_n);

  -- Categorías (1–3 por medio).
  insert into public.medio_categorias (medio_id, categoria_id, created_at)
  select distinct m.id, c.id, m.alta_at
  from _mf m
  cross join lateral (
    select k.id from public.categorias k
    where k.activo and k.deleted_at is null
    order by case when k.nombre = (case m.tipo when 'PAGINA_NOTICIAS' then 'Noticias generales' when 'PERIODICO' then 'Noticias generales'
                                               when 'CANAL_TV' then 'Noticias generales' when 'COMUNITARIO' then 'Comunidad'
                                               when 'EMISORA' then 'Música' else 'Entretenimiento' end) then 0 else 1 end,
             random() + m.n * 0
    limit 1 + (m.n % 3)) c;

  -- Audiencia por país: Colombia 85–97 % + diáspora (fronteras con más VE o EC).
  insert into public.medio_audiencia_paises (medio_id, pais_iso2, porcentaje, fuente, actualizado_at)
  with co as (
    select m.id, m.n, m.dep, m.alta_at, round((85 + random() * 12)::numeric, 1) as p_co, 1 + floor(random() * 4)::integer as k
    from _mf m
  ), resto as (
    select c.id, c.n, c.alta_at, c.p_co, d.pais, d.w, row_number() over (partition by c.id order by d.orden) as rn, c.k
    from co c
    cross join lateral (
      select x.pais, x.w, -ln(greatest(random(), 1e-9)) / x.w + c.n * 0 as orden
      from (values ('VE', case when c.dep in ('54', '44', '81', '20') then 90 else 26 end), ('US', 25), ('ES', 15),
                   ('EC', case when c.dep in ('52', '86') then 80 else 8 end), ('PA', 6), ('MX', 6), ('CL', 5), ('AR', 3), ('PE', 3)) x (pais, w)) d
  ), top as (
    select t.*, sum(t.w) over (partition by t.id) as sw from resto t where t.rn <= t.k
  )
  select c.id, 'CO', c.p_co, case when c.n % 7 = 0 then 'VERIFICADA_MANUAL' else 'DECLARADA' end::public.audiencia_fuente, c.alta_at
  from co c
  union all
  select t.id, t.pais, greatest(0.1, round(((100 - t.p_co) * 0.93 * t.w / t.sw)::numeric, 1)),
         case when t.n % 7 = 0 then 'VERIFICADA_MANUAL' else 'DECLARADA' end::public.audiencia_fuente, t.alta_at
  from top t;

  -- Pertinencia geográfica (60 % de los verificados): su municipio 1,10–1,30 y 2–3 vecinos 0,90–1,10.
  insert into public.medio_pertinencia_geografica (medio_id, municipio_codigo, multiplicador, clasificado_por, clasificado_at, notas)
  select m.id, m.mun, round((1.10 + random() * 0.20)::numeric, 3), v_ops[1 + m.n % cardinality(v_ops)],
         x.verificado_at + interval '1 day', 'Sede y audiencia principal'
  from _mf m join public.medios x on x.id = m.id
  where m.estado in ('VERIFICADO', 'SUSPENDIDO') and m.n % 5 < 3
  union all
  select m.id, v.codigo, round((0.90 + random() * 0.20)::numeric, 3), v_ops[1 + m.n % cardinality(v_ops)],
         x.verificado_at + interval '1 day', 'Municipio vecino con audiencia compartida'
  from _mf m join public.medios x on x.id = m.id
  cross join lateral (select mu.codigo from public.municipios mu
                      where mu.departamento_codigo = m.dep and mu.codigo <> m.mun and mu.activo
                      order by random() + m.n * 0 limit 2 + m.n % 2) v
  where m.estado in ('VERIFICADO', 'SUSPENDIDO') and m.n % 5 < 3;

  -- 5. Cuentas sociales y verificación inicial --------------------------------------------------------------------------
  create temp table _c on commit drop as
  with base as (
    select m.id as medio_id, m.n, m.estado, m.alta_at, m.nombre, m.tipo, p.plataforma,
           random() as r_tiene, random() as r_verif, random() as r_metodo, random() as r_moroso,
           greatest(private.demo_ln(case p.plataforma when 'INSTAGRAM' then 58000 when 'FACEBOOK' then 72000 else 95000 end, 0.7), 0) as s0
    from _mf m cross join (values ('INSTAGRAM'::public.plataforma, 0.80), ('FACEBOOK', 0.70), ('TIKTOK', 0.45)) p (plataforma, prob)
  ), elegidas as (
    select b.*, (b.r_tiene < case b.plataforma when 'INSTAGRAM' then 0.80 when 'FACEBOOK' then 0.70 else 0.45 end
                 or (b.plataforma = 'INSTAGRAM' and not exists (
                       select 1 from base o where o.medio_id = b.medio_id and o.plataforma <> 'INSTAGRAM'
                         and o.r_tiene < case o.plataforma when 'FACEBOOK' then 0.70 else 0.45 end))
                 or b.n = v_estrella) as tiene
    from base b
  ), slug as (
    select e.*, left(replace(private.normalizar_texto(e.nombre), ' ', ''), 26) as base_handle
    from elegidas e where e.tiene
  )
  select private.uuid_v7() as id, s.medio_id, s.n, s.estado, s.alta_at, s.plataforma,
         s.base_handle || case when row_number() over (partition by s.plataforma, s.base_handle order by s.n) > 1
                               then (row_number() over (partition by s.plataforma, s.base_handle order by s.n))::text else '' end
           || case when s.tipo = 'CREADOR' then (array['', 'oficial', '_co'])[1 + s.n % 3] else '' end as handle,
         -- 5 % de cuentas sin verificar (pueden estar bajo el umbral); el resto, ≥ 30.000.
         (s.estado in ('VERIFICADO', 'SUSPENDIDO') and (s.r_verif >= 0.05 or s.n = v_estrella)) as verificada,
         case when s.s0 < 30000 then (30000 + random() * 9000)::integer else least(s.s0, 2400000)::integer end as seguidores,
         (s.s0 * 0.6)::integer as seguidores_bajos,
         case when s.r_metodo < 0.6 then 'CODIGO_HISTORIA' else 'MANUAL' end::public.metodo_verificacion as metodo,
         s.r_moroso < 0.04 and s.n <> v_estrella as moroso, s.r_verif
  from slug s;
  update _c set seguidores = 88000 + (n % 7) * 1500 where n = v_estrella and plataforma = 'INSTAGRAM';

  insert into public.cuentas_sociales (id, medio_id, plataforma, handle, url, seguidores_verificados, franja_id, verificada,
    metodo_verificacion, fecha_ultima_verificacion, tarifa_referencia, created_at, updated_at)
  select c.id, c.medio_id, c.plataforma, c.handle,
         case c.plataforma when 'INSTAGRAM' then 'https://www.instagram.com/' || c.handle || '/'
                           when 'FACEBOOK' then 'https://www.facebook.com/' || c.handle
                           else 'https://www.tiktok.com/@' || c.handle end,
         case when c.verificada then c.seguidores end,
         case when c.verificada then (select f.id from public.franjas f where f.activa
                                      and c.seguidores between f.seguidores_min and coalesce(f.seguidores_max, 2147483647)) end,
         c.verificada, case when c.verificada then c.metodo end,
         case when c.verificada then x.verificado_at - interval '2 hours' end,
         case when c.n % 10 < 7 then
           round(((select t.valor_base from public.tarifas t join public.formatos fo on fo.id = t.formato_id
                   join public.franjas f on f.id = t.franja_id
                   where t.vigente_hasta is null and fo.plataforma = c.plataforma
                     and fo.clave = case c.plataforma when 'TIKTOK' then 'VIDEO' else 'POST_FEED' end
                     and c.seguidores between f.seguidores_min and coalesce(f.seguidores_max, 2147483647))
                  * (0.7 + random() * 0.8))::numeric, -3) end,
         c.alta_at + interval '20 minutes', coalesce(x.verificado_at - interval '2 hours', c.alta_at + interval '20 minutes')
  from _c c join public.medios x on x.id = c.medio_id;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('cuentas_sociales', v_n);

  insert into public.verificaciones_cuenta (cuenta_social_id, medio_id, metodo, seguidores_reportados, seguidores_verificados,
    captura_path, codigo_hash, codigo_expira_at, estado_validacion, validada_por, validada_at, observaciones, created_at, updated_at)
  select c.id, c.medio_id, c.metodo,
         case when c.verificada then c.seguidores else c.seguidores_bajos end,
         case when c.verificada then c.seguidores end,
         'medio/' || c.medio_id || '/cuenta_social/' || c.id || '/verificacion-inicial.webp',
         case when c.metodo = 'CODIGO_HISTORIA' then encode(sha256(convert_to(c.id::text, 'UTF8')), 'hex') end,
         case when c.metodo = 'CODIGO_HISTORIA' then c.alta_at + interval '80 minutes' end,
         case when c.verificada then 'APROBADA' when c.estado = 'PENDIENTE' or c.r_verif < 0.02 then 'PENDIENTE' else 'RECHAZADA' end::public.validacion_estado,
         case when c.verificada or (c.estado <> 'PENDIENTE' and c.r_verif >= 0.02) then v_ops[1 + c.n % cardinality(v_ops)] end,
         case when c.verificada then x.verificado_at - interval '2 hours'
              when c.estado <> 'PENDIENTE' and c.r_verif >= 0.02 then private.demo_habil(c.alta_at, 30) end,
         case when not c.verificada and c.estado <> 'PENDIENTE' and c.r_verif >= 0.02
              then 'La cuenta no alcanza el umbral mínimo de seguidores exigido.' end,
         c.alta_at + interval '25 minutes', coalesce(x.verificado_at - interval '2 hours', c.alta_at + interval '25 minutes')
  from _c c join public.medios x on x.id = c.medio_id;

  insert into private.demo_cuentas (cuenta_id, medio_id, proxima, detener_at, metodo)
  select c.id, c.medio_id, x.verificado_at - interval '2 hours' + (25 + random() * 10) * interval '1 day',
         case when d.baja_at is not null then d.baja_at when c.moroso then v_hoy - (38 + random() * 30) * interval '1 day' end,
         c.metodo
  from _c c join public.medios x on x.id = c.medio_id join private.demo_medios d on d.medio_id = c.medio_id
  where c.verificada;

  -- ReteICA demo: capitales y municipios con medios (6,9–11,04 por mil; pendiente de contador).
  insert into public.reteica_municipal (municipio_codigo, tarifa_por_mil, base_minima_uvt, vigente_desde, pendiente_validacion,
                                        created_at, updated_at)
  select z.codigo, (array[6.9, 7.0, 8.0, 9.66, 10.0, 11.04])[1 + (z.codigo::integer % 6)], 0, date '2025-01-01', true,
         timestamptz '2025-06-15 00:00:00-05', timestamptz '2025-06-15 00:00:00-05'
  from (select d.capital_codigo as codigo from public.departamentos d where d.capital_codigo is not null
        union select m.mun from _mf m) z
  where not exists (select 1 from public.reteica_municipal x where x.municipio_codigo = z.codigo);

  -- 6. Usuarios de organizaciones y perfiles ------------------------------------------------------------------------------
  insert into private.demo_usuarios (usuario_id, email, clase, org_id, principal, alta_at, pais, departamento, municipio, ciudad,
                                     lat, lon, sesiones_mes)
  select p.id, p.email::text, 'ANUNCIANTE', a.id, e.principal, a.alta_at + case when e.principal then interval '0' else interval '9 days' end,
         a.pais, left(a.mun, 2), a.mun, coalesce(a.ciudad, regexp_replace(mu.nombre, ',.*$', '')),
         coalesce(mu.lat, case a.pais when 'US' then 25.76 when 'MX' then 19.43 when 'ES' then 40.42 when 'PA' then 8.98
                                      when 'EC' then -0.18 when 'PE' then -12.05 when 'CL' then -33.45 else -23.55 end),
         coalesce(mu.lon, case a.pais when 'US' then -80.19 when 'MX' then -99.13 when 'ES' then -3.70 when 'PA' then -79.52
                                      when 'EC' then -78.47 when 'PE' then -77.04 when 'CL' then -70.67 else -46.63 end),
         case when a.n = 1 then 14 else 5 + random() * 6 end
  from _esp e join public.perfiles p on p.email = e.email::citext
  join _an a on a.n = e.n left join public.municipios mu on mu.codigo = a.mun
  where e.clase = 'ANUNCIANTE';

  insert into private.demo_usuarios (usuario_id, email, clase, org_id, principal, alta_at, pais, departamento, municipio, ciudad,
                                     lat, lon, sesiones_mes, viajero)
  select p.id, p.email::text, 'MEDIO', m.id, true, m.alta_at, 'CO', m.dep, m.mun,
         regexp_replace(mu.nombre, ',.*$', ''), mu.lat, mu.lon,
         case when e.email = 'demo.medio@amo.test' then 16 else 2.5 + d.actividad * 2.5 + random() * 2 end,
         case when m.n % 21 = 3 then (array['US', 'ES', 'VE', 'EC', 'PE', 'PA', 'CL', 'AR', 'DE', 'FR', 'CA', 'GB', 'BR', 'MX'])[1 + (m.n / 21) % 14] end
  from _esp e join public.perfiles p on p.email = e.email::citext
  join _mf m on m.n = case when e.email = 'demo.medio@amo.test' then v_estrella else e.n end
  join private.demo_medios d on d.medio_id = m.id
  join public.municipios mu on mu.codigo = m.mun
  where e.clase = 'MEDIO';
  update private.demo_usuarios u set principal = false
  where u.email = format('medio-%s@demo.amo.co', lpad(v_estrella::text, 3, '0'));
  update private.demo_usuarios u set ciudad = 'Bogotá', lat = 4.65, lon = -74.08 where u.clase in ('ADMIN', 'OPERACIONES', 'FINANZAS');

  -- Dispositivo e IP habituales.
  update private.demo_usuarios u
     set ip = private.demo_ip(u.pais), user_agent = d.ua, navegador = d.nav, sistema_operativo = d.so, dispositivo = d.disp
  from (select x.usuario_id, x.movil, 1 + floor(random() * 4)::integer as k
        from (select q.usuario_id, random() < case q.clase when 'MEDIO' then 0.70 when 'ANUNCIANTE' then 0.30 else 0.15 end as movil
              from private.demo_usuarios q) x) s
  join (values
    (true, 1, 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 'Chrome', 'Android', 'MOVIL'),
    (true, 2, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1', 'Safari', 'iOS', 'MOVIL'),
    (true, 3, 'Mozilla/5.0 (Linux; Android 13; moto g54) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36', 'Chrome', 'Android', 'MOVIL'),
    (true, 4, 'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'Chrome', 'Android', 'TABLETA'),
    (false, 1, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'Chrome', 'Windows', 'ESCRITORIO'),
    (false, 2, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15', 'Safari', 'macOS', 'ESCRITORIO'),
    (false, 3, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 'Edge', 'Windows', 'ESCRITORIO'),
    (false, 4, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0', 'Firefox', 'Windows', 'ESCRITORIO')
  ) d (movil, k, ua, nav, so, disp) on d.movil = s.movil and d.k = s.k
  where s.usuario_id = u.usuario_id;

  update public.perfiles p
     set rol_id = (select ro.id from public.roles ro where ro.clave = u.clase),
         anunciante_id = case when u.clase = 'ANUNCIANTE' then u.org_id end,
         medio_id = case when u.clase = 'MEDIO' then u.org_id end,
         nombre = coalesce(e.nombre, nm.nombre || ' ' || nm.apellido),
         celular = '+57 3' || (10 + nm.k % 12)::text || ' ' || lpad(((nm.k * 2718281) % 10000000)::text, 7, '0'),
         estado = 'ACTIVO', debe_cambiar_password = false, es_demo = true, activado_at = u.alta_at + interval '12 minutes',
         created_at = u.alta_at, updated_at = u.alta_at + interval '12 minutes'
  from private.demo_usuarios u
  join _esp e on e.email = u.email
  join (select q.usuario_id, row_number() over (order by q.email) as k from private.demo_usuarios q) o on o.usuario_id = u.usuario_id
  join _nombres nm on nm.k = o.k
  where p.id = u.usuario_id;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('perfiles', v_n);

  -- Bitácora: altas y verificaciones de actores.
  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, motivo, cambios)
  select m.alta_at, u.usuario_id, 'medios', m.id::text, 'INSERT', null, 'PENDIENTE', null,
         jsonb_build_object('nombre', m.nombre, 'tipo', m.tipo, 'municipio_codigo', m.mun)
  from _mf m left join private.demo_usuarios u on u.org_id = m.id and u.principal
  union all
  select x.verificado_at, x.verificado_por, 'medios', x.id::text, 'TRANSICION', 'PENDIENTE', 'VERIFICADO', null,
         jsonb_build_object('estado', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'VERIFICADO'),
                            'nivel_verificacion', jsonb_build_object('antes', 0, 'despues', x.nivel_verificacion))
  from public.medios x join _mf m on m.id = x.id where x.verificado_at is not null
  union all
  select x.rechazado_at, v_ops[1 + m.n % cardinality(v_ops)], 'medios', x.id::text, 'TRANSICION', 'PENDIENTE', 'RECHAZADO', x.motivo_estado,
         jsonb_build_object('estado', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'RECHAZADO'))
  from public.medios x join _mf m on m.id = x.id where x.rechazado_at is not null
  union all
  select a.alta_at, u.usuario_id, 'anunciantes', a.id::text, 'INSERT', null, 'PENDIENTE', null,
         jsonb_build_object('nombre_comercial', a.comercial, 'pais_iso2', a.pais)
  from _an a left join private.demo_usuarios u on u.org_id = a.id and u.principal
  union all
  select x.verificado_at, x.verificado_por, 'anunciantes', x.id::text, 'TRANSICION', 'PENDIENTE', 'VERIFICADO', null,
         jsonb_build_object('estado_verificacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'VERIFICADO'))
  from public.anunciantes x join _an a on a.id = x.id where x.verificado_at is not null
  union all
  select x.rechazado_at, v_ops[1], 'anunciantes', x.id::text, 'TRANSICION', 'PENDIENTE', 'RECHAZADO', x.motivo_estado,
         jsonb_build_object('estado_verificacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', 'RECHAZADO'))
  from public.anunciantes x join _an a on a.id = x.id where x.rechazado_at is not null
  union all
  select v.validada_at, v.validada_por, 'verificaciones_cuenta', v.id::text, 'TRANSICION', 'PENDIENTE', v.estado_validacion::text,
         v.observaciones, jsonb_build_object('estado_validacion', jsonb_build_object('antes', 'PENDIENTE', 'despues', v.estado_validacion),
                                             'seguidores_verificados', jsonb_build_object('antes', null, 'despues', v.seguidores_verificados))
  from public.verificaciones_cuenta v join _c c on c.id = v.cuenta_social_id where v.validada_at is not null;

  return r || jsonb_build_object('medio_estrella', v_estrella,
    'usuarios', (select count(*) from private.demo_usuarios),
    'cuentas_verificadas', (select count(*) from private.demo_cuentas));
end $fn$;
revoke all on function private.demo_actores(double precision) from public, anon, authenticated, service_role;
