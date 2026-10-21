-- Prueba de humo del índice cronológico de la bitácora (migración 14 bitacora_indice_cronologico,
-- docs/modelo-datos.md §3.3). La consulta de la línea de tiempo y de «Actividad reciente» (paginación por conjunto
-- sobre `created_at desc, id desc` con LIMIT) debe recorrer `bitacora_created_at_id_idx`: sin él, el plan lee la
-- tabla entera con el BRIN «lossy» y ordena (4,7 s con 95 mil filas; ANTES: Sort + Bitmap Heap Scan).
-- Se ejecuta como owner (MCP execute_sql o psql) dentro de una transacción que SIEMPRE se revierte; no escribe datos.
-- Cada prueba deja `true` si pasa o lo observado.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_plan jsonb;
  v_texto text;
begin
  -- a01: primer tramo (los 30 días más recientes).
  execute $q$explain (format json)
    select id, created_at, accion, cambios from public.bitacora
    where created_at >= now() - interval '30 days' and created_at < now()
    order by created_at desc, id desc limit 31$q$ into v_plan;
  v_texto := v_plan::text;
  r := r || jsonb_build_object('a01_primer_tramo_por_indice',
    case when v_texto like '%bitacora_created_at_id_idx%' and v_texto not like '%"Node Type": "Sort"%'
              and v_texto not like '%Bitmap Heap Scan%'
         then 'true'::jsonb else v_plan -> 0 -> 'Plan' end);

  -- a02: tramo siguiente (cursor `(created_at, id)` como lo envía PostgREST: `or=(created_at.lt…,and(…))`).
  execute $q$explain (format json)
    select id, created_at, accion, cambios from public.bitacora
    where created_at >= now() - interval '30 days' and created_at < now()
      and (created_at < now() - interval '1 day' or (created_at = now() - interval '1 day' and id < 1000))
    order by created_at desc, id desc limit 31$q$ into v_plan;
  v_texto := v_plan::text;
  r := r || jsonb_build_object('a02_tramo_siguiente_por_indice',
    case when v_texto like '%bitacora_created_at_id_idx%' and v_texto not like '%"Node Type": "Sort"%'
         then 'true'::jsonb else v_plan -> 0 -> 'Plan' end);

  -- a03: el índice existe con el orden de la paginación.
  r := r || jsonb_build_object('a03_definicion',
    coalesce((select to_jsonb(indexdef like '%(created_at DESC, id DESC)') from pg_indexes
              where schemaname = 'public' and indexname = 'bitacora_created_at_id_idx'), '"no existe"'::jsonb));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
