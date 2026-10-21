-- Migración 13 · purga_demo_cupos_en_cascada (docs/modelo-datos.md §5.8, §10.5)
-- private.purgar_demo() fallaba con cualquier oferta demo que tuviera cupos ocupados (es decir, con cualquier juego
-- de datos demo real): borraba primero public.oferta_cupos y, por cada fila, trg_oferta_cupos_z_total recalculaba
-- ofertas.cupos_totales = Σ de los cupos que quedan, que cae por debajo de ofertas.cupos_ocupados y viola el CHECK
-- ofertas_cupos_ocupados_chk (23514). La prueba de M11 (humo_cron e3) solo purgaba una oferta demo sin cupos
-- ocupados, por eso no lo detectó; se vio al ejecutar la suite con los datos demo cargados (2026-10-06).
-- Corrección: los cupos se van con la oferta (FK oferta_cupos.oferta_id → ofertas on delete cascade, el caso que
-- fn_oferta_cupos_guardar ya prevé como «borrado en cascada de la oferta»); con la oferta ya borrada el recálculo de
-- trg_oferta_cupos_z_total no encuentra fila. El resultado conserva la clave `oferta_cupos` (filas que se van en la
-- cascada). El resto de la función es idéntico al de la migración 20261001045506_cron.

create or replace function private.purgar_demo() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r jsonb := '{}'; v_n integer; v_asig uuid[]; v_ofe uuid[]; v_medios uuid[]; v_anunciantes uuid[];
begin
  if not (private.purga_habilitada() and private.modo_carga()) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La purga demo exige amo.purga y amo.modo_carga (solo el owner).';
  end if;
  v_asig := array(select a.id from public.asignaciones a where a.es_demo);
  v_ofe := array(select o.id from public.ofertas o join public.campanas c on c.id = o.campana_id where c.es_demo);

  delete from public.disputa_mensajes dm using public.disputas d
   where dm.disputa_id = d.id and d.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('disputa_mensajes', v_n);
  delete from public.disputas d where d.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('disputas', v_n);
  delete from public.metricas m where m.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('metricas', v_n);
  delete from public.publicaciones p where p.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('publicaciones', v_n);
  delete from public.descargas_contenido d where d.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('descargas_contenido', v_n);
  delete from public.pagos_anunciante p where p.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('pagos_anunciante', v_n);
  delete from public.documentos_soporte ds using public.liquidaciones l where ds.liquidacion_id = l.id and l.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('documentos_soporte', v_n);
  delete from public.asignacion_montos am where am.asignacion_id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('asignacion_montos', v_n);
  delete from public.asignaciones a where a.id = any (v_asig);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('asignaciones', v_n);
  delete from public.liquidaciones l where l.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('liquidaciones', v_n);
  delete from public.dispersiones d where d.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('dispersiones', v_n);
  delete from public.facturas f where f.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('facturas', v_n);
  delete from public.oferta_vistas v where v.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('oferta_vistas', v_n);
  delete from public.creativo_archivos ca using public.creativos c
   where ca.creativo_id = c.id and c.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('creativo_archivos', v_n);
  delete from public.creativos c where c.oferta_id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('creativos', v_n);
  -- Los cupos se borran en cascada con la oferta: borrarlos antes deja ofertas.cupos_totales por debajo de
  -- cupos_ocupados (trg_oferta_cupos_z_total + CHECK ofertas_cupos_ocupados_chk) en toda oferta con cupos ocupados.
  select count(*) into v_n from public.oferta_cupos oc where oc.oferta_id = any (v_ofe);
  r := r || jsonb_build_object('oferta_cupos', v_n);
  delete from public.ofertas o where o.id = any (v_ofe);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('ofertas', v_n);
  delete from public.comisiones_excepcion ce
   where ce.anunciante_id in (select an.id from public.anunciantes an where an.es_demo)
      or ce.campana_id in (select c.id from public.campanas c where c.es_demo);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('comisiones_excepcion', v_n);
  delete from public.campanas c where c.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('campanas', v_n);

  update public.perfiles p set medio_id = null, anunciante_id = null
   where p.es_demo and (p.medio_id is not null or p.anunciante_id is not null);
  v_medios := array(select m.id from public.medios m
                    where m.es_demo and not exists (select 1 from public.perfiles p where p.medio_id = m.id));
  v_anunciantes := array(select an.id from public.anunciantes an
                         where an.es_demo and not exists (select 1 from public.perfiles p where p.anunciante_id = an.id));

  delete from public.verificaciones_cuenta v where v.medio_id = any (v_medios);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('verificaciones_cuenta', v_n);
  delete from public.cuentas_sociales c where c.medio_id = any (v_medios);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('cuentas_sociales', v_n);
  delete from public.medio_categorias x where x.medio_id = any (v_medios);
  delete from public.medio_audiencia_paises x where x.medio_id = any (v_medios);
  delete from public.medio_pertinencia_geografica x where x.medio_id = any (v_medios);
  delete from public.documentos_medio x where x.medio_id = any (v_medios);
  delete from public.medios_privado x where x.medio_id = any (v_medios);
  delete from public.documentos_anunciante x where x.anunciante_id = any (v_anunciantes);
  delete from public.anunciantes_privado x where x.anunciante_id = any (v_anunciantes);
  delete from public.medios m where m.id = any (v_medios);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('medios', v_n);
  delete from public.anunciantes an where an.id = any (v_anunciantes);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('anunciantes', v_n);
  r := r || jsonb_build_object('organizaciones_conservadas',
    (select count(*) from public.medios m where m.es_demo) + (select count(*) from public.anunciantes an where an.es_demo));

  delete from public.aceptaciones_terminos a where a.perfil_id in (select p.id from public.perfiles p where p.es_demo);
  get diagnostics v_n = row_count; r := r || jsonb_build_object('aceptaciones_terminos', v_n);
  delete from public.perfiles_privado pp where pp.perfil_id in (select p.id from public.perfiles p where p.es_demo);
  delete from public.notificaciones n where n.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('notificaciones', v_n);
  delete from public.accesos a where a.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('accesos', v_n);
  delete from public.bitacora b where b.es_demo;
  get diagnostics v_n = row_count; r := r || jsonb_build_object('bitacora', v_n);
  return r;
end $$;
revoke all on function private.purgar_demo() from public, anon, authenticated, service_role;

-- Verificación
do $$ begin
  assert (select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_proc p
          where p.oid = 'private.purgar_demo()'::regprocedure), 'purgar_demo debe seguir siendo definer con search_path vacío';
  assert not has_function_privilege('authenticated', 'private.purgar_demo()', 'execute')
     and not has_function_privilege('service_role', 'private.purgar_demo()', 'execute')
     and not has_function_privilege('anon', 'private.purgar_demo()', 'execute'),
         'purgar_demo no debe tener EXECUTE para roles de la API';
end $$;
