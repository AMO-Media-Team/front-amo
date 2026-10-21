-- Datos demo · paso 04 · finanzas de un mes (docs/modelo-datos.md §10.3 «Finanzas»)
-- Se ejecuta DESPUÉS de generar la operación de todos los meses (03_mes.sql) y en orden cronológico, un mes por
-- transacción con amo.modo_carga:
--   demo_fin_liquidaciones(mes, semilla): liquidaciones de las dos quincenas que cierran en el mes (retenciones, alerta
--     de seguridad social y documento soporte con la misma lógica de generar_liquidacion_srv), aprobación, documento
--     soporte emitido (o factura del medio), dispersión y pago, hasta el «hoy» de la demo.
--   demo_fin_facturas(mes, semilla): factura mensual por anunciante (IVA 19 %, vence a 30 días) y sus pagos
--     (70 % a tiempo, 20 % con mora, 5 % parciales, 5 % sin pagar).
--   demo_finanzas(mes, semilla) las llama en orden.

-- Misma lógica que public.generar_liquidacion_srv (que exige un actor con sesión y por eso no corre en modo carga):
-- verificadas sin liquidar hasta el fin del periodo, retenciones por pago prorrateadas, seguridad social y borrador
-- del documento soporte. La fecha de los hechos la da amo.reloj.
create or replace function private.demo_liquidar(p_medio_id uuid, p_periodo_inicio date, p_periodo_fin date, p_actor_id uuid)
returns uuid
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_ids uuid[] := '{}'; r record; v_n integer;
  v_bruto numeric; v_comision numeric; v_medio_total numeric;
  v_declarante boolean; v_obligado boolean; v_resp_iva boolean; v_municipio_medio char(5);
  v_uvt numeric; v_smlmv numeric; v_umbral numeric;
  v_reglas jsonb := '[]'; v_regla jsonb; v_base numeric; v_mun text; ri public.reteica_municipal;
  v_por_asig jsonb := '{}'; v_total_regla numeric; v_acum numeric; v_i integer; v_valor numeric; v_ret_total numeric := 0;
  v_mes_inicio date; v_mes_total numeric; v_alerta boolean := false;
  v_liq uuid := private.uuid_v7(); v_rets jsonb; v_ret_asig numeric;
begin
  if not private.modo_carga() then
    raise exception 'demo_liquidar exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  select coalesce(array_agg(a.id order by a.id), '{}') into v_ids from public.asignaciones a
  where a.medio_id = p_medio_id and a.estado = 'VERIFICADA' and a.liquidacion_id is null
    and a.verificada_at < private.inicio_dia(p_periodo_fin + 1);
  v_n := cardinality(v_ids);
  if v_n = 0 then return null; end if;
  select sum(m.monto_bruto), sum(m.monto_comision), sum(m.monto_medio) into v_bruto, v_comision, v_medio_total
  from public.asignacion_montos m where m.asignacion_id = any (v_ids);
  select coalesce(mp.es_declarante, false), coalesce(mp.obligado_facturar, false), coalesce(mp.responsable_iva, false)
    into v_declarante, v_obligado, v_resp_iva
  from public.medios_privado mp where mp.medio_id = p_medio_id;
  select m.municipio_codigo into v_municipio_medio from public.medios m where m.id = p_medio_id;
  select pt.uvt, pt.smlmv, pt.umbral_seg_social_smlmv into v_uvt, v_smlmv, v_umbral
  from public.parametros_tributarios pt where pt.anio = extract(year from p_periodo_fin)::smallint;

  for r in select rc.* from public.retenciones_config rc
           where rc.tipo in ('RETEFUENTE', 'RETEIVA') and rc.aplica_declarante = coalesce(v_declarante, false)
             and rc.vigente_desde <= p_periodo_fin and (rc.vigente_hasta is null or rc.vigente_hasta > p_periodo_fin)
           order by rc.tipo, rc.concepto loop
    continue when r.tipo = 'RETEIVA' and not coalesce(v_resp_iva, false);
    v_base := case when r.tipo = 'RETEIVA' then round(v_medio_total * private.config_decimal('facturacion.iva'), 2) else v_medio_total end;
    if v_base >= r.base_minima_uvt * v_uvt then
      v_reglas := v_reglas || jsonb_build_object('tipo', r.tipo, 'concepto', r.concepto, 'base_pago', v_base,
                                                 'tarifa', r.tarifa, 'config_id', r.id, 'municipio_codigo', null);
    end if;
  end loop;
  v_mun := case private.config_texto('tributario.reteica_municipio_base')
             when 'PLATAFORMA' then private.config_texto('tributario.municipio_plataforma') else v_municipio_medio end;
  select * into ri from public.reteica_municipal x
  where x.municipio_codigo = v_mun and x.vigente_desde <= p_periodo_fin and (x.vigente_hasta is null or x.vigente_hasta > p_periodo_fin);
  if ri.id is not null and v_medio_total >= ri.base_minima_uvt * v_uvt then
    v_reglas := v_reglas || jsonb_build_object('tipo', 'RETEICA', 'concepto', 'ICA', 'base_pago', v_medio_total,
                                               'tarifa', round(ri.tarifa_por_mil / 1000, 8), 'config_id', ri.id, 'municipio_codigo', v_mun);
  end if;
  for v_regla in select e.value from jsonb_array_elements(v_reglas) e loop
    v_total_regla := round((v_regla ->> 'base_pago')::numeric * (v_regla ->> 'tarifa')::numeric);
    v_ret_total := v_ret_total + v_total_regla;
    v_acum := 0; v_i := 0;
    for r in select m.asignacion_id, m.monto_medio from public.asignacion_montos m
             where m.asignacion_id = any (v_ids) order by m.asignacion_id loop
      v_i := v_i + 1;
      v_valor := case when v_i = v_n then v_total_regla - v_acum else round(v_total_regla * r.monto_medio / v_medio_total) end;
      v_acum := v_acum + v_valor;
      v_por_asig := jsonb_set(v_por_asig, array[r.asignacion_id::text],
        coalesce(v_por_asig -> r.asignacion_id::text, '[]'::jsonb)
        || jsonb_build_array((v_regla - 'base_pago') || jsonb_build_object(
             'base', round((v_regla ->> 'base_pago')::numeric * r.monto_medio / v_medio_total, 2),
             'base_pago', v_regla -> 'base_pago', 'valor', v_valor)));
    end loop;
  end loop;

  v_mes_inicio := date_trunc('month', p_periodo_fin)::date;
  select coalesce(sum(l.monto_medio), 0) into v_mes_total from public.liquidaciones l
  where l.medio_id = p_medio_id and l.estado <> 'ANULADA'
    and l.periodo_fin >= v_mes_inicio and l.periodo_fin < (v_mes_inicio + interval '1 month')::date;
  if v_umbral is not null and v_mes_total + v_medio_total > v_umbral * v_smlmv
     and not exists (select 1 from public.documentos_medio d
                     where d.medio_id = p_medio_id and d.tipo = 'SEG_SOCIAL' and d.estado_validacion = 'APROBADO'
                       and (d.fecha_vencimiento is null or d.fecha_vencimiento >= private.hoy())) then
    v_alerta := true;
  end if;

  insert into public.liquidaciones (id, medio_id, periodo_inicio, periodo_fin, cantidad_asignaciones, monto_bruto,
    monto_comision, monto_medio, monto_retenciones, monto_neto, estado, requiere_documento_soporte, alerta_seg_social,
    creada_por, es_demo)
  values (v_liq, p_medio_id, p_periodo_inicio, p_periodo_fin, v_n, v_bruto, v_comision, v_medio_total, v_ret_total,
          v_medio_total - v_ret_total, 'BORRADOR', not coalesce(v_obligado, false), v_alerta, p_actor_id, true);
  if not coalesce(v_obligado, false) then
    insert into public.documentos_soporte (liquidacion_id, valor_total) values (v_liq, v_medio_total);
  end if;
  for r in select m.asignacion_id, m.monto_medio from public.asignacion_montos m
           where m.asignacion_id = any (v_ids) order by m.asignacion_id loop
    v_rets := coalesce(v_por_asig -> r.asignacion_id::text, '[]'::jsonb);
    select coalesce(sum((e.value ->> 'valor')::numeric), 0) into v_ret_asig from jsonb_array_elements(v_rets) e;
    update public.asignaciones a set liquidacion_id = v_liq where a.id = r.asignacion_id;
    update public.asignacion_montos m set retenciones_aplicadas = v_rets, monto_retenciones = v_ret_asig,
           monto_neto = r.monto_medio - v_ret_asig
    where m.asignacion_id = r.asignacion_id;
    perform private.aplicar_transicion('asignaciones', r.asignacion_id, 'LIQUIDADA', 'ADMIN', p_actor_id);
  end loop;
  return v_liq;
end $fn$;
revoke all on function private.demo_liquidar(uuid, date, date, uuid) from public, anon, authenticated, service_role;

create or replace function private.demo_fin_liquidaciones(p_mes date, p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_idx integer := (extract(year from p_mes)::integer - 2025) * 12 + extract(month from p_mes)::integer - 7;
  v_fin_mes date := (p_mes + interval '1 month')::date;
  v_gen uuid; v_apr uuid; v_res uuid; v_base bigint;
  q record; m record; v_t timestamptz; v_k integer := 0; v_n integer;
  r jsonb := '{}';
begin
  if not private.modo_carga() then
    raise exception 'demo_fin_liquidaciones exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  perform setseed(private.demo_semilla(p_semilla, v_idx + 100));
  -- Segregación (D17): quien genera no aprueba. Genera y paga demo.finanzas; aprueba el segundo usuario de Finanzas.
  select u.usuario_id into v_gen from private.demo_usuarios u where u.email = 'demo.finanzas@amo.test';
  select u.usuario_id into v_apr from private.demo_usuarios u where u.clase = 'FINANZAS' and u.usuario_id <> v_gen order by u.email limit 1;
  select d.id, d.consecutivo_actual into v_res, v_base from public.resoluciones_dian d
  where d.prefijo = 'DEMO' and d.tipo = 'DOCUMENTO_SOPORTE';

  drop table if exists _liq, _pag;
  create temp table _liq (id uuid primary key, medio_id uuid, t_gen timestamptz) on commit drop;
  for q in select x.ini, x.fin, private.demo_habil(private.inicio_dia(x.fin + 1), 8 + random() * 30) as t_gen
           from (values (p_mes, p_mes + 14), (p_mes + 15, v_fin_mes - 1)) x (ini, fin) loop
    continue when q.t_gen > v_hoy;
    for m in select a.medio_id from public.asignaciones a
             where a.es_demo and a.estado = 'VERIFICADA' and a.liquidacion_id is null
               and a.verificada_at < private.inicio_dia(q.fin + 1)
             group by a.medio_id order by min(a.verificada_at) loop
      v_k := v_k + 1;
      v_t := q.t_gen + v_k * interval '9 seconds';
      continue when v_t > v_hoy;
      perform set_config('amo.reloj', v_t::text, true);
      insert into _liq select private.demo_liquidar(m.medio_id, q.ini, q.fin, v_gen), m.medio_id, v_t;
    end loop;
  end loop;
  perform set_config('amo.reloj', '', true);

  -- Aprobación, documento soporte o factura del medio, pago (8 días el 90 %, 15 el resto) y dispersión.
  create temp table _pag on commit drop as
  select c.*, case when c.t_pago <= v_hoy then (c.t_pago at time zone 'America/Bogota')::date end as fecha_pago
  from (select b.*, private.inicio_dia((b.t_apr at time zone 'America/Bogota')::date + case when b.r1 < 0.90 then 8 else 15 end)
                    + (8 + b.r2 * 8) * interval '1 hour' as t_pago
        from (select l.id, l.medio_id, l.t_gen, x.requiere_documento_soporte as con_ds, x.monto_neto, x.periodo_inicio, x.periodo_fin,
                     random() as r1, random() as r2, private.demo_habil(l.t_gen, 4 + random() * 26) as t_apr
              from _liq l join public.liquidaciones x on x.id = l.id
              offset 0) b) c;

  update public.liquidaciones l
     set estado = case when p.t_pago <= v_hoy then 'PAGADA' else 'APROBADA' end::public.liquidacion_estado,
         aprobada_por = v_apr, aprobada_at = p.t_apr,
         numero_factura_medio = case when not p.con_ds then 'FE-' || to_char(p.t_apr, 'YYMM') || '-' || lpad((abs(hashtext(l.id::text)) % 10000)::text, 4, '0') end,
         factura_medio_path = case when not p.con_ds then 'liquidacion/' || l.id || '/factura-medio.pdf' end,
         pagada_at = case when p.t_pago <= v_hoy then p.t_pago end, fecha_pago = p.fecha_pago,
         referencia_pago = case when p.t_pago <= v_hoy then 'TRF-' || to_char(p.fecha_pago, 'YYYYMMDD') || '-' || lpad((abs(hashtext(l.id::text)) % 100000)::text, 5, '0') end,
         soporte_pago_path = case when p.t_pago <= v_hoy then 'liquidacion/' || l.id || '/soporte-pago.pdf' end,
         updated_at = case when p.t_pago <= v_hoy then p.t_pago else p.t_apr end
  from _pag p where l.id = p.id and p.t_apr <= v_hoy;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('liquidaciones', (select count(*) from _liq), 'aprobadas', v_n);

  update public.documentos_soporte ds
     set estado = 'EMITIDO', resolucion_id = v_res, prefijo = 'DEMO', consecutivo = v_base + z.n,
         fecha_emision = (z.t_emi at time zone 'America/Bogota')::date, emitido_at = z.t_emi,
         archivo_path = 'documento_soporte/' || ds.id || '/DEMO' || (v_base + z.n) || '.pdf', updated_at = z.t_emi
  from (select d.id, p.t_apr + interval '12 minutes' as t_emi, row_number() over (order by p.t_apr, d.id) as n
        from public.documentos_soporte d join _pag p on p.id = d.liquidacion_id
        where p.t_apr + interval '12 minutes' <= v_hoy) z
  where ds.id = z.id;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('documentos_soporte', v_n);
  update public.resoluciones_dian d set consecutivo_actual = v_base + v_n, updated_at = v_hoy where d.id = v_res and v_n > 0;

  update public.asignaciones a set estado = 'PAGADA', pagada_at = p.t_pago, updated_at = p.t_pago
  from _pag p where a.liquidacion_id = p.id and p.t_pago <= v_hoy and a.estado = 'LIQUIDADA';
  get diagnostics v_n = row_count; r := r || jsonb_build_object('asignaciones_pagadas', v_n);

  with d as (
    insert into public.dispersiones (id, archivo_path, cantidad_liquidaciones, monto_total, generada_por, es_demo, created_at)
    select z.id, 'dispersion/' || z.id || '/dispersion-' || to_char(z.fecha_pago, 'YYYYMMDD') || '.csv', z.n, z.total, v_gen, true, z.t
    from (select private.uuid_v7() as id, p.fecha_pago, count(*) as n, sum(p.monto_neto) as total, min(p.t_pago) - interval '2 hours' as t
          from _pag p where p.fecha_pago is not null and p.monto_neto > 0 group by p.fecha_pago) z
    returning id, created_at, (regexp_match(archivo_path, 'dispersion-(\d{8})'))[1] as dia
  )
  update public.liquidaciones l set dispersion_id = d.id, updated_at = p.t_pago + interval '1 millisecond'
  from d join _pag p on to_char(p.fecha_pago, 'YYYYMMDD') = d.dia
  where l.id = p.id and p.monto_neto > 0;

  -- Bitácora y avisos.
  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, motivo, cambios, metadatos)
  select l.t_gen, v_gen, 'liquidaciones', l.id::text, 'INSERT', null, 'BORRADOR', null::text,
         jsonb_build_object('medio_id', l.medio_id, 'periodo_inicio', p.periodo_inicio, 'periodo_fin', p.periodo_fin, 'monto_neto', p.monto_neto), null::jsonb
  from _liq l join _pag p on p.id = l.id
  union all select a.liquidada_at, v_gen, 'asignaciones', a.id::text, 'TRANSICION', 'VERIFICADA', 'LIQUIDADA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'VERIFICADA', 'despues', 'LIQUIDADA')), null
  from public.asignaciones a join _liq l on l.id = a.liquidacion_id
  union all select p.t_apr, v_apr, 'liquidaciones', p.id::text, 'TRANSICION', 'BORRADOR', 'APROBADA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'BORRADOR', 'despues', 'APROBADA')), null
  from _pag p where p.t_apr <= v_hoy
  union all select d.emitido_at, v_apr, 'documentos_soporte', d.id::text, 'TRANSICION', 'BORRADOR', 'EMITIDO', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'BORRADOR', 'despues', 'EMITIDO'), 'numero', jsonb_build_object('antes', null, 'despues', d.numero)), null
  from public.documentos_soporte d join _pag p on p.id = d.liquidacion_id where d.estado = 'EMITIDO'
  union all select p.t_pago, v_gen, 'liquidaciones', p.id::text, 'TRANSICION', 'APROBADA', 'PAGADA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'APROBADA', 'despues', 'PAGADA'), 'fecha_pago', jsonb_build_object('antes', null, 'despues', p.fecha_pago)), null
  from _pag p where p.t_pago <= v_hoy
  union all select a.pagada_at, v_gen, 'asignaciones', a.id::text, 'TRANSICION', 'LIQUIDADA', 'PAGADA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'LIQUIDADA', 'despues', 'PAGADA')), null
  from public.asignaciones a join _pag p on p.id = a.liquidacion_id where a.estado = 'PAGADA'
  union all select x.created_at, v_gen, 'dispersiones', x.id::text, 'EXPORTAR', null, null, null, null,
                   jsonb_build_object('liquidaciones', x.cantidad_liquidaciones, 'monto_total', x.monto_total, 'formato', 'csv')
  from public.dispersiones x where x.id in (select l.dispersion_id from public.liquidaciones l join _pag p on p.id = l.id)
  union all select x.created_at, v_gen, 'medios_privado', l.medio_id::text, 'REVELAR_DATO', null, null, null, null,
                   jsonb_build_object('campos', jsonb_build_array('titular_nombre', 'metodo_pago', 'datos_pago_resumen'), 'dispersion_id', x.id)
  from public.liquidaciones l join _pag p on p.id = l.id join public.dispersiones x on x.id = l.dispersion_id;
  insert into private.demo_avisos (t, usuario_id, tipo, datos, entidad, entidad_id, prioridad)
  select p.t_pago, u.usuario_id, 'liquidacion.pagada',
         jsonb_build_object('periodo', to_char(p.periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(p.periodo_fin, 'DD/MM/YYYY'),
                            'monto_neto', private.formato_cop(p.monto_neto)), 'liquidaciones', p.id::text, 1
  from _pag p join private.demo_usuarios u on u.org_id = p.medio_id where p.t_pago <= v_hoy;

  return r || jsonb_build_object('alertas_seg_social', (select count(*) from public.liquidaciones l join _liq q2 on q2.id = l.id where l.alerta_seg_social));
end $fn$;
revoke all on function private.demo_fin_liquidaciones(date, double precision) from public, anon, authenticated, service_role;

create or replace function private.demo_fin_facturas(p_mes date, p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare
  v_hoy timestamptz := private.demo_hoy();
  v_idx integer := (extract(year from p_mes)::integer - 2025) * 12 + extract(month from p_mes)::integer - 7;
  v_ini timestamptz := private.inicio_dia(p_mes);
  v_fin timestamptz := private.inicio_dia((p_mes + interval '1 month')::date);
  v_fz uuid; v_res uuid; v_base bigint; v_iva numeric := private.config_decimal('facturacion.iva');
  v_dias integer := private.config_entero('facturacion.dias_vencimiento');
  v_n integer;
  r jsonb := '{}';
begin
  if not private.modo_carga() then
    raise exception 'demo_fin_facturas exige amo.modo_carga (solo el owner por conexión directa)';
  end if;
  perform setseed(private.demo_semilla(p_semilla, v_idx + 200));
  select u.usuario_id into v_fz from private.demo_usuarios u where u.email = 'demo.finanzas@amo.test';
  select d.id, d.consecutivo_actual into v_res, v_base from public.resoluciones_dian d where d.prefijo = 'DEMO' and d.tipo = 'FACTURA_VENTA';

  -- Una factura consolidada por anunciante con lo verificado en el mes (GMV verificado, docs/kpis.md §1.2).
  drop table if exists _fac, _pg;
  create temp table _fac on commit drop as
  select g.*, g.t_emi + (5 + g.r3 * 80) * interval '1 minute' as t_emitida,
         (((g.t_emi + (5 + g.r3 * 80) * interval '1 minute') at time zone 'America/Bogota')::date + v_dias) as vence,
         v_base + row_number() over (order by g.t_emi, g.anunciante_id) as consecutivo
  from (select private.uuid_v7() as id, a.anunciante_id, sum(a.monto_bruto) as subtotal, round(sum(a.monto_bruto) * v_iva, 2) as iva,
               array_agg(a.id) as asignaciones, random() as r1, random() as r2, random() as r3, random() as r4,
               private.demo_habil(v_fin, 8 + random() * 40) as t_emi
        from public.asignaciones a
        where a.es_demo and a.verificada_at >= v_ini and a.verificada_at < v_fin
          and a.estado in ('VERIFICADA', 'LIQUIDADA', 'PAGADA') and a.factura_id is null
        group by a.anunciante_id
        offset 0) g
  where g.t_emi + interval '90 minutes' <= v_hoy;

  -- Pagos: 70 % a tiempo; 20 % con 10–40 días de mora; 5 % parcial (la mitad completa después); 5 % sin pagar.
  create temp table _pg on commit drop as
  select private.uuid_v7() as id, x.factura, x.anunciante_id, x.orden, x.t, round(x.monto::numeric, 2) as monto
  from (select f.id as factura, f.anunciante_id, 1 as orden,
               private.inicio_dia((f.t_emitida at time zone 'America/Bogota')::date + case when f.r1 < 0.70 then 8 + floor(f.r2 * 21)::integer
                                    when f.r1 < 0.90 then v_dias + 10 + floor(f.r2 * 31)::integer else 10 + floor(f.r2 * 18)::integer end)
                 + (9 + f.r4 * 8) * interval '1 hour' as t,
               case when f.r1 < 0.90 then f.subtotal + f.iva else round((f.subtotal + f.iva) * (0.40 + f.r4 * 0.30)) end as monto
        from _fac f where f.r1 < 0.95
        union all
        select f.id, f.anunciante_id, 2, private.inicio_dia(f.vence + 5 + floor(f.r2 * 26)::integer) + (9 + f.r3 * 8) * interval '1 hour',
               (f.subtotal + f.iva) - round((f.subtotal + f.iva) * (0.40 + f.r4 * 0.30))
        from _fac f where f.r1 >= 0.90 and f.r1 < 0.95 and f.r3 < 0.5) x
  where x.t <= v_hoy;

  insert into public.facturas (id, anunciante_id, resolucion_id, prefijo, consecutivo, periodo_desde, periodo_hasta, fecha_emision,
    fecha_vencimiento, subtotal, iva, pagado, estado, cufe, archivo_path, emitida_at, pagada_at, vencida_at, es_demo, created_at, updated_at)
  select f.id, f.anunciante_id, v_res, 'DEMO', f.consecutivo, p_mes, (p_mes + interval '1 month')::date - 1,
         (f.t_emitida at time zone 'America/Bogota')::date, f.vence, f.subtotal, f.iva, coalesce(s.pagado, 0),
         (case when coalesce(s.pagado, 0) >= f.subtotal + f.iva then 'PAGADA'
               when z.t_vence <= v_hoy then 'VENCIDA'
               when coalesce(s.pagado, 0) > 0 then 'PAGADA_PARCIAL' else 'EMITIDA' end)::public.factura_estado,
         encode(sha256(convert_to(f.id::text, 'UTF8')), 'hex'), 'factura/' || f.id || '/DEMO' || f.consecutivo || '.pdf',
         f.t_emitida, case when coalesce(s.pagado, 0) >= f.subtotal + f.iva then s.ultimo end,
         case when z.t_vence <= v_hoy and coalesce(s.pagado_al_vencer, 0) < f.subtotal + f.iva then z.t_vence end,
         true, f.t_emi, greatest(f.t_emitida, coalesce(s.ultimo, f.t_emitida))
  from _fac f
  cross join lateral (select private.demo_tick(private.inicio_dia(f.vence + 1), 5) as t_vence) z
  left join lateral (select sum(p.monto) as pagado, max(p.t) as ultimo, sum(p.monto) filter (where p.t < z.t_vence) as pagado_al_vencer
                     from _pg p where p.factura = f.id) s on true
  order by f.consecutivo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('facturas', v_n);
  update public.resoluciones_dian d set consecutivo_actual = v_base + v_n, updated_at = v_hoy where d.id = v_res and v_n > 0;
  update public.asignaciones a set factura_id = f.id, updated_at = greatest(a.updated_at, f.t_emitida) + interval '1 millisecond' from _fac f where a.id = any (f.asignaciones);

  insert into public.pagos_anunciante (id, factura_id, anunciante_id, fecha_pago, monto, medio_pago, referencia, soporte_path,
                                       registrado_por, es_demo, created_at)
  select p.id, p.factura, p.anunciante_id, (p.t at time zone 'America/Bogota')::date, p.monto,
         (array['TRANSFERENCIA', 'PSE', 'TRANSFERENCIA', 'CONSIGNACION'])[1 + abs(hashtext(p.id::text)) % 4],
         'REF-' || to_char(p.t, 'YYYYMMDD') || '-' || lpad((abs(hashtext(p.id::text)) % 100000)::text, 5, '0'),
         'pago/' || p.factura || '/soporte-' || p.orden || '.pdf', v_fz, true, p.t
  from _pg p order by p.t;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('pagos', v_n);

  insert into private.demo_eventos (t, actor_id, entidad, entidad_id, accion, anterior, nuevo, motivo, cambios, metadatos)
  select f.t_emi, v_fz, 'facturas', f.id::text, 'INSERT', null, 'BORRADOR', null::text,
         jsonb_build_object('anunciante_id', f.anunciante_id, 'subtotal', f.subtotal, 'iva', f.iva), null::jsonb
  from _fac f
  union all select f.t_emitida, v_fz, 'facturas', f.id::text, 'TRANSICION', 'BORRADOR', 'EMITIDA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'BORRADOR', 'despues', 'EMITIDA'), 'numero', jsonb_build_object('antes', null, 'despues', 'DEMO' || f.consecutivo)), null
  from _fac f
  union all select x.vencida_at, null, 'facturas', x.id::text, 'TRANSICION', 'EMITIDA', 'VENCIDA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', 'EMITIDA', 'despues', 'VENCIDA')), null
  from public.facturas x join _fac f on f.id = x.id where x.vencida_at is not null
  union all select p.t, v_fz, 'pagos_anunciante', p.id::text, 'INSERT', null, null, null,
                   jsonb_build_object('factura_id', p.factura, 'monto', p.monto), null
  from _pg p
  union all select x.pagada_at, null, 'facturas', x.id::text, 'TRANSICION', case when x.vencida_at is not null then 'VENCIDA' else 'EMITIDA' end, 'PAGADA', null,
                   jsonb_build_object('estado', jsonb_build_object('antes', case when x.vencida_at is not null then 'VENCIDA' else 'EMITIDA' end, 'despues', 'PAGADA')), null
  from public.facturas x join _fac f on f.id = x.id where x.pagada_at is not null;

  return r || jsonb_build_object('estados', (select jsonb_object_agg(z.e, z.n) from (select x.estado::text as e, count(*) as n
                                             from public.facturas x join _fac f on f.id = x.id group by 1) z));
end $fn$;
revoke all on function private.demo_fin_facturas(date, double precision) from public, anon, authenticated, service_role;

create or replace function private.demo_finanzas(p_mes date, p_semilla double precision default 0.4242) returns jsonb
language plpgsql set search_path = pg_catalog, public, private, extensions, pg_temp as $fn$
declare r jsonb;
begin
  r := jsonb_build_object('mes', p_mes, 'liq', private.demo_fin_liquidaciones(p_mes, p_semilla));
  if private.inicio_dia((p_mes + interval '1 month')::date) <= private.demo_hoy() then
    r := r || jsonb_build_object('fac', private.demo_fin_facturas(p_mes, p_semilla));
  end if;
  return r;
end $fn$;
revoke all on function private.demo_finanzas(date, double precision) from public, anon, authenticated, service_role;
