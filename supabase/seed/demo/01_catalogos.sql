-- Datos demo · paso 01 · catálogos y parámetros demo (docs/modelo-datos.md §10.2 paso 1 y §10.3)
-- Ejecutar dentro de:  begin; set local amo.modo_carga = 'on'; set local statement_timeout = '110s'; … commit;
-- Idempotente. No toca filas de configuración existentes: solo agrega las vigencias y parámetros que la demo necesita.

create or replace function private.demo_catalogos() returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_inicio timestamptz := timestamptz '2025-06-15 00:00:00-05';
  v_semilla timestamptz;
  r jsonb := '{}';
  v_n integer;
begin
  if not private.modo_carga() then
    raise exception 'demo_catalogos exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  insert into private.demo_control (clave, valor)
  values ('hoy', date_trunc('minute', now())::text), ('inicio', '2025-07-01')
  on conflict (clave) do nothing;

  -- Tarifas: la semilla de la migración rige desde el 1-ene-2026. La demo agrega la vigencia ANTERIOR (15-jun-2025 →
  -- 1-ene-2026) con valores 6 % menores: así la semilla hace de «revisión de tarifas (+6 %)» a mitad del periodo.
  select min(t.vigente_desde) into v_semilla from public.tarifas t where t.vigente_hasta is null;
  if v_semilla is null or v_semilla <= v_inicio then
    raise exception 'No se encontró la vigencia semilla de tarifas posterior al inicio de la demo';
  end if;
  insert into public.tarifas (formato_id, plataforma, franja_id, valor_base, vigente_desde, vigente_hasta,
                              pendiente_validacion, creada_por, created_at)
  select t.formato_id, t.plataforma, t.franja_id, round(t.valor_base / 1.06, -3), v_inicio, v_semilla, true, null, v_inicio
  from public.tarifas t
  where t.vigente_desde = v_semilla and t.vigente_hasta is null
    and not exists (select 1 from public.tarifas x
                    where x.formato_id = t.formato_id and x.franja_id = t.franja_id and x.vigente_desde = v_inicio);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('tarifas', v_n);

  -- Retención en la fuente demo: 4 % declarante / 6 % no declarante, base mínima 4 UVT (por pago, D29).
  insert into public.retenciones_config (tipo, concepto, aplica_declarante, tarifa, base_minima_uvt, vigente_desde,
                                         pendiente_validacion, created_at, updated_at)
  select 'RETEFUENTE', 'SERVICIOS', x.declarante, x.tarifa, 4, date '2025-01-01', true, v_inicio, v_inicio
  from (values (true, 0.04), (false, 0.06)) x (declarante, tarifa)
  where not exists (select 1 from public.retenciones_config rc
                    where rc.tipo = 'RETEFUENTE' and rc.concepto = 'SERVICIOS' and rc.aplica_declarante = x.declarante);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('retenciones_config', v_n);

  -- Resoluciones DIAN demo (prefijo DEMO). El consecutivo lo avanza la generación de finanzas, sin huecos.
  insert into public.resoluciones_dian (tipo, prefijo, numero_resolucion, fecha_resolucion, rango_desde, rango_hasta,
                                        consecutivo_actual, vigente_desde, vigente_hasta, activa, created_at, updated_at)
  select x.tipo::public.documento_electronico_tipo, 'DEMO', x.numero, date '2025-06-01', 1, x.hasta, 0, date '2025-06-01',
         date '2027-06-01', not exists (select 1 from public.resoluciones_dian a where a.tipo::text = x.tipo and a.activa),
         v_inicio, v_inicio
  from (values ('FACTURA_VENTA', '18764000000001', 50000), ('DOCUMENTO_SOPORTE', '18764000000002', 90000)) x (tipo, numero, hasta)
  where not exists (select 1 from public.resoluciones_dian d where d.tipo::text = x.tipo and d.prefijo = 'DEMO');
  get diagnostics v_n = row_count; r := r || jsonb_build_object('resoluciones_dian', v_n);
  update public.resoluciones_dian d set consecutivo_actual = 0
  where d.prefijo = 'DEMO' and d.consecutivo_actual <> 0
    and not exists (select 1 from public.facturas f where f.resolucion_id = d.id)
    and not exists (select 1 from public.documentos_soporte s where s.resolucion_id = d.id);

  return r || jsonb_build_object('hoy', private.demo_hoy());
end $fn$;
revoke all on function private.demo_catalogos() from public, anon, authenticated, service_role;
