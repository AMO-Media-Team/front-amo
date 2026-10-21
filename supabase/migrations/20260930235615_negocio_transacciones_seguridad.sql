-- Migración 7e · negocio_transacciones_seguridad (docs/modelo-datos.md §2.3, §2.4, §3.6)
-- Políticas RLS (restrictiva acceso_valido en todas; contexto confiable en comisiones_excepcion), GRANTs mínimos y
-- explícitos (authenticated por columna; service_role CRUD, solo select/insert en las append-only), clasificación de
-- columnas auditadas y verificación final de M7.
-- Visibilidad cruzada (§2.3): el medio NO lee campañas, ofertas ni asignaciones en la tabla base (ofertas_para_medio,
-- mis_asignaciones_medio); asignacion_montos solo internos; el anunciante ve sus asignaciones sin montos internos.

-- 1. Restrictivas estándar
do $$
declare t text;
begin
  foreach t in array array['campanas', 'ofertas', 'oferta_cupos', 'oferta_vistas', 'creativos', 'creativo_archivos',
                           'comisiones_excepcion', 'asignaciones', 'asignacion_montos', 'descargas_contenido',
                           'publicaciones', 'metricas', 'dispersiones', 'liquidaciones', 'documentos_soporte', 'facturas',
                           'pagos_anunciante', 'disputas', 'disputa_mensajes'] loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated
                      using ((select private.acceso_valido())) with check ((select private.acceso_valido()))',
                   t || ': acceso válido', t);
  end loop;
end $$;

-- Configuración: comisiones_excepcion solo se escribe desde el servidor (contexto confiable).
create policy "comisiones_excepcion: escritura desde servidor" on public.comisiones_excepcion as restrictive
  for insert to authenticated with check ((select private.contexto_confiable()));
create policy "comisiones_excepcion: actualización desde servidor" on public.comisiones_excepcion as restrictive
  for update to authenticated using ((select private.contexto_confiable())) with check ((select private.contexto_confiable()));
create policy "comisiones_excepcion: borrado desde servidor" on public.comisiones_excepcion as restrictive
  for delete to authenticated using ((select private.contexto_confiable()));

-- 2. Campañas
create policy "campanas: select interno o propio" on public.campanas for select to authenticated
  using ((select private.tiene_permiso('campanas.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and deleted_at is null));
create policy "campanas: insert propio o interno" on public.campanas for insert to authenticated
  with check ((anunciante_id = (select private.mi_anunciante_id())
               and (select private.tiene_permiso('campanas.gestionar_propias')))
              or (select private.tiene_permiso('campanas.gestionar')));
create policy "campanas: update propio" on public.campanas for update to authenticated
  using (anunciante_id = (select private.mi_anunciante_id()) and deleted_at is null and estado in ('BORRADOR', 'ACTIVA')
         and (select private.tiene_permiso('campanas.gestionar_propias')))
  with check (anunciante_id = (select private.mi_anunciante_id()) and estado in ('BORRADOR', 'ACTIVA')
              and (select private.tiene_permiso('campanas.gestionar_propias')));
create policy "campanas: update interno" on public.campanas for update to authenticated
  using ((select private.tiene_permiso('campanas.gestionar')))
  with check ((select private.tiene_permiso('campanas.gestionar')));

-- 3. Ofertas, cupos, vistas y creativos
create policy "ofertas: select interno o propio" on public.ofertas for select to authenticated
  using ((select private.tiene_permiso('ofertas.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and deleted_at is null));
create policy "ofertas: insert propio o interno" on public.ofertas for insert to authenticated
  with check ((anunciante_id = (select private.mi_anunciante_id())
               and (select private.tiene_permiso('ofertas.gestionar_propias')))
              or (select private.tiene_permiso('ofertas.gestionar')));
create policy "ofertas: update propio" on public.ofertas for update to authenticated
  using (anunciante_id = (select private.mi_anunciante_id()) and deleted_at is null and estado in ('BORRADOR', 'DEVUELTA')
         and (select private.tiene_permiso('ofertas.gestionar_propias')))
  with check (anunciante_id = (select private.mi_anunciante_id()) and estado in ('BORRADOR', 'DEVUELTA')
              and (select private.tiene_permiso('ofertas.gestionar_propias')));
create policy "ofertas: update interno" on public.ofertas for update to authenticated
  using ((select private.tiene_permiso('ofertas.moderar')) or (select private.tiene_permiso('ofertas.gestionar')))
  with check ((select private.tiene_permiso('ofertas.moderar')) or (select private.tiene_permiso('ofertas.gestionar')));

create policy "oferta_cupos: select interno o propio" on public.oferta_cupos for select to authenticated
  using ((select private.tiene_permiso('ofertas.ver'))
         or exists (select 1 from public.ofertas o
                    where o.id = oferta_id and o.anunciante_id = (select private.mi_anunciante_id())));
create policy "oferta_cupos: insert propio o interno" on public.oferta_cupos for insert to authenticated
  with check ((select private.tiene_permiso('ofertas.gestionar'))
              or ((select private.tiene_permiso('ofertas.gestionar_propias'))
                  and exists (select 1 from public.ofertas o where o.id = oferta_id
                                and o.anunciante_id = (select private.mi_anunciante_id())
                                and o.estado in ('BORRADOR', 'DEVUELTA'))));
create policy "oferta_cupos: update propio o interno" on public.oferta_cupos for update to authenticated
  using ((select private.tiene_permiso('ofertas.gestionar'))
         or ((select private.tiene_permiso('ofertas.gestionar_propias'))
             and exists (select 1 from public.ofertas o where o.id = oferta_id
                           and o.anunciante_id = (select private.mi_anunciante_id())
                           and o.estado in ('BORRADOR', 'DEVUELTA'))))
  with check ((select private.tiene_permiso('ofertas.gestionar'))
              or ((select private.tiene_permiso('ofertas.gestionar_propias'))
                  and exists (select 1 from public.ofertas o where o.id = oferta_id
                                and o.anunciante_id = (select private.mi_anunciante_id())
                                and o.estado in ('BORRADOR', 'DEVUELTA'))));
create policy "oferta_cupos: delete propio o interno" on public.oferta_cupos for delete to authenticated
  using ((select private.tiene_permiso('ofertas.gestionar'))
         or ((select private.tiene_permiso('ofertas.gestionar_propias'))
             and exists (select 1 from public.ofertas o where o.id = oferta_id
                           and o.anunciante_id = (select private.mi_anunciante_id())
                           and o.estado in ('BORRADOR', 'DEVUELTA'))));

create policy "oferta_vistas: select" on public.oferta_vistas for select to authenticated
  using ((select private.tiene_permiso('ofertas.ver')) or medio_id = (select private.mi_medio_id())
         or exists (select 1 from public.ofertas o
                    where o.id = oferta_id and o.anunciante_id = (select private.mi_anunciante_id())));

-- El medio lee el copy/hashtags/menciones solo con una asignación que consume cupo (§10.3).
create policy "creativos: select" on public.creativos for select to authenticated
  using ((select private.tiene_permiso('ofertas.ver'))
         or exists (select 1 from public.ofertas o
                    where o.id = oferta_id and o.anunciante_id = (select private.mi_anunciante_id()))
         or private.tengo_asignacion_activa_en(oferta_id));
create policy "creativos: insert propio o interno" on public.creativos for insert to authenticated
  with check ((select private.tiene_permiso('ofertas.gestionar'))
              or ((select private.tiene_permiso('ofertas.gestionar_propias'))
                  and exists (select 1 from public.ofertas o where o.id = oferta_id
                                and o.anunciante_id = (select private.mi_anunciante_id()) and o.deleted_at is null
                                and o.estado not in ('CANCELADA', 'CERRADA', 'VENCIDA'))));
create policy "creativos: update propio o interno" on public.creativos for update to authenticated
  using (vigente and ((select private.tiene_permiso('ofertas.gestionar'))
         or ((select private.tiene_permiso('ofertas.gestionar_propias'))
             and exists (select 1 from public.ofertas o where o.id = oferta_id
                           and o.anunciante_id = (select private.mi_anunciante_id())
                           and o.estado in ('BORRADOR', 'DEVUELTA')))))
  with check ((select private.tiene_permiso('ofertas.gestionar'))
              or ((select private.tiene_permiso('ofertas.gestionar_propias'))
                  and exists (select 1 from public.ofertas o where o.id = oferta_id
                                and o.anunciante_id = (select private.mi_anunciante_id())
                                and o.estado in ('BORRADOR', 'DEVUELTA'))));

-- Archivos: la RLS del creativo; en una oferta ya publicada solo se completan versiones que nadie ha descargado.
create policy "creativo_archivos: select" on public.creativo_archivos for select to authenticated
  using (exists (select 1 from public.creativos c where c.id = creativo_id));
create policy "creativo_archivos: insert propio o interno" on public.creativo_archivos for insert to authenticated
  with check ((select private.tiene_permiso('ofertas.gestionar'))
              or ((select private.tiene_permiso('ofertas.gestionar_propias'))
                  and exists (select 1 from public.creativos c join public.ofertas o on o.id = c.oferta_id
                              where c.id = creativo_id and c.vigente and o.deleted_at is null
                                and o.anunciante_id = (select private.mi_anunciante_id())
                                and (o.estado in ('BORRADOR', 'DEVUELTA')
                                     or (o.estado not in ('CANCELADA', 'CERRADA', 'VENCIDA')
                                         and not exists (select 1 from public.descargas_contenido d
                                                         where d.creativo_id = c.id))))));
create policy "creativo_archivos: delete en borrador" on public.creativo_archivos for delete to authenticated
  using (exists (select 1 from public.creativos c join public.ofertas o on o.id = c.oferta_id
                 where c.id = creativo_id and o.estado in ('BORRADOR', 'DEVUELTA')
                   and ((select private.tiene_permiso('ofertas.gestionar'))
                        or (o.anunciante_id = (select private.mi_anunciante_id())
                            and (select private.tiene_permiso('ofertas.gestionar_propias'))))));

create policy "comisiones_excepcion: select" on public.comisiones_excepcion for select to authenticated
  using ((select private.tiene_permiso('configuracion.ver')));
create policy "comisiones_excepcion: insert" on public.comisiones_excepcion for insert to authenticated
  with check ((select private.tiene_permiso('configuracion.comisiones')));
create policy "comisiones_excepcion: update" on public.comisiones_excepcion for update to authenticated
  using ((select private.tiene_permiso('configuracion.comisiones')))
  with check ((select private.tiene_permiso('configuracion.comisiones')));
create policy "comisiones_excepcion: delete" on public.comisiones_excepcion for delete to authenticated
  using ((select private.tiene_permiso('configuracion.comisiones')));

-- 4. Asignaciones y ejecución (sin escritura directa: todo por *_srv)
create policy "asignaciones: select interno o anunciante" on public.asignaciones for select to authenticated
  using ((select private.tiene_permiso('asignaciones.ver'))
         or (anunciante_id = (select private.mi_anunciante_id())
             and (select private.tiene_permiso('asignaciones.ver_propias'))));
create policy "asignacion_montos: select interno" on public.asignacion_montos for select to authenticated
  using ((select private.tiene_permiso('asignaciones.ver')) or (select private.tiene_permiso('liquidaciones.ver')));
create policy "descargas_contenido: select partes o interno" on public.descargas_contenido for select to authenticated
  using (private.puedo_ver_asignacion(asignacion_id));
create policy "publicaciones: select" on public.publicaciones for select to authenticated
  using ((select private.tiene_permiso('asignaciones.ver')) or anunciante_id = (select private.mi_anunciante_id())
         or medio_id = (select private.mi_medio_id()));

create policy "metricas: select" on public.metricas for select to authenticated
  using ((select private.tiene_permiso('asignaciones.ver')) or anunciante_id = (select private.mi_anunciante_id())
         or medio_id = (select private.mi_medio_id()));
create policy "metricas: insert medio" on public.metricas for insert to authenticated
  with check ((select private.tiene_permiso('asignaciones.ejecutar')) and medio_id = (select private.mi_medio_id())
              and private.puedo_cargar_metricas(publicacion_id));
create policy "metricas: update medio" on public.metricas for update to authenticated
  using (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
         and (select private.tiene_permiso('asignaciones.ejecutar')))
  with check (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
              and (select private.tiene_permiso('asignaciones.ejecutar')));
create policy "metricas: update interno" on public.metricas for update to authenticated
  using ((select private.tiene_permiso('metricas.validar')) or (select private.tiene_permiso('metricas.editar_validadas')))
  with check ((select private.tiene_permiso('metricas.validar')) or (select private.tiene_permiso('metricas.editar_validadas')));

-- 5. Finanzas
create policy "dispersiones: select" on public.dispersiones for select to authenticated
  using ((select private.tiene_permiso('liquidaciones.registrar_pago')));
create policy "liquidaciones: select interno o propio" on public.liquidaciones for select to authenticated
  using ((select private.tiene_permiso('liquidaciones.ver'))
         or (medio_id = (select private.mi_medio_id()) and (select private.tiene_permiso('liquidaciones.ver_propias'))));
create policy "liquidaciones: update pago" on public.liquidaciones for update to authenticated
  using ((select private.tiene_permiso('liquidaciones.registrar_pago')))
  with check ((select private.tiene_permiso('liquidaciones.registrar_pago')));
create policy "documentos_soporte: select interno o propio" on public.documentos_soporte for select to authenticated
  using ((select private.tiene_permiso('liquidaciones.ver'))
         or exists (select 1 from public.liquidaciones l
                    where l.id = liquidacion_id and l.medio_id = (select private.mi_medio_id())));
create policy "facturas: select interno o propio" on public.facturas for select to authenticated
  using ((select private.tiene_permiso('facturas.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('facturas.ver_propias'))));
create policy "facturas: insert interno" on public.facturas for insert to authenticated
  with check ((select private.tiene_permiso('facturas.gestionar')));
create policy "facturas: update interno" on public.facturas for update to authenticated
  using ((select private.tiene_permiso('facturas.gestionar')))
  with check ((select private.tiene_permiso('facturas.gestionar')));
create policy "pagos_anunciante: select interno o propio" on public.pagos_anunciante for select to authenticated
  using ((select private.tiene_permiso('facturas.ver'))
         or (anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('facturas.ver_propias'))));

-- 6. Disputas
create policy "disputas: select interno o partes" on public.disputas for select to authenticated
  using ((select private.tiene_permiso('disputas.ver')) or private.puedo_ver_asignacion(asignacion_id));
create policy "disputa_mensajes: select" on public.disputa_mensajes for select to authenticated
  using ((select private.tiene_permiso('disputas.ver'))
         or (not interno and exists (select 1 from public.disputas d
                                     where d.id = disputa_id and private.puedo_ver_asignacion(d.asignacion_id))));
create policy "disputa_mensajes: insert partes o resolutor" on public.disputa_mensajes for insert to authenticated
  with check (autor_id = (select auth.uid())
              and ((select private.tiene_permiso('disputas.resolver'))
                   or (not interno and exists (select 1 from public.disputas d
                                               where d.id = disputa_id and d.estado in ('ABIERTA', 'EN_REVISION')
                                                 and private.puedo_ver_asignacion(d.asignacion_id)))));

-- 7. Grants (mínimos y explícitos; anon no recibe nada)
grant select,
      insert (anunciante_id, nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total),
      update (nombre, objetivo, marca, fecha_inicio, fecha_fin, presupuesto_total, deleted_at)
  on public.campanas to authenticated;
grant select,
      insert (campana_id, titulo, formato_id, plataforma, publicaciones_por_medio, permite_multiples_cupos,
              presupuesto_maximo, tope_porcentaje_por_medio, departamentos_objetivo, municipios_objetivo,
              categorias_objetivo, seguidores_minimos, medios_excluidos, ventana_inicio, ventana_fin,
              fecha_limite_aceptacion, permanencia_minima_dias, exclusividad_dias, cortes_requeridos, instrucciones,
              restricciones),
      update (titulo, formato_id, plataforma, publicaciones_por_medio, permite_multiples_cupos, presupuesto_maximo,
              tope_porcentaje_por_medio, departamentos_objetivo, municipios_objetivo, categorias_objetivo,
              seguidores_minimos, medios_excluidos, ventana_inicio, ventana_fin, fecha_limite_aceptacion,
              permanencia_minima_dias, exclusividad_dias, cortes_requeridos, instrucciones, restricciones, deleted_at)
  on public.ofertas to authenticated;
grant select, insert (oferta_id, franja_id, cupos_totales), update (cupos_totales), delete on public.oferta_cupos to authenticated;
grant select on public.oferta_vistas to authenticated;
grant select, insert (oferta_id, tipo, copy_sugerido, hashtags, menciones, enlace_destino),
      update (copy_sugerido, hashtags, menciones, enlace_destino)
  on public.creativos to authenticated;
grant select, insert (creativo_id, archivo_path, mime, tamano_bytes, ancho, alto, duracion_segundos, orden, sha256), delete
  on public.creativo_archivos to authenticated;
grant select, insert (anunciante_id, campana_id, porcentaje, vigente_desde, vigente_hasta, motivo),
      update (porcentaje, vigente_desde, vigente_hasta, motivo), delete
  on public.comisiones_excepcion to authenticated;
grant select on public.asignaciones, public.asignacion_montos, public.descargas_contenido, public.publicaciones,
  public.dispersiones, public.documentos_soporte, public.pagos_anunciante, public.disputas to authenticated;
grant select,
      insert (publicacion_id, corte, fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones, reproducciones,
              espectadores_unicos, me_gusta, comentarios, compartidos, guardados, clics_enlace, visitas_perfil,
              tiempo_promedio_visualizacion_s, porcentaje_reproduccion_completa, captura_path, miniatura_path),
      update (fecha_corte, periodo_desde, periodo_hasta, alcance, impresiones, reproducciones, espectadores_unicos,
              me_gusta, comentarios, compartidos, guardados, clics_enlace, visitas_perfil,
              tiempo_promedio_visualizacion_s, porcentaje_reproduccion_completa, captura_path, miniatura_path)
  on public.metricas to authenticated;
grant select, update (fecha_pago, referencia_pago, soporte_pago_path, numero_factura_medio, factura_medio_path)
  on public.liquidaciones to authenticated;
grant select, insert (anunciante_id, campana_id, periodo_desde, periodo_hasta, fecha_vencimiento, subtotal, iva),
      update (periodo_desde, periodo_hasta, fecha_vencimiento, subtotal, iva)
  on public.facturas to authenticated;
grant select, insert (disputa_id, mensaje, adjunto_path, interno) on public.disputa_mensajes to authenticated;

grant select, insert, update, delete on public.campanas, public.ofertas, public.oferta_cupos, public.oferta_vistas,
  public.creativos, public.creativo_archivos, public.comisiones_excepcion, public.asignaciones, public.asignacion_montos,
  public.publicaciones, public.metricas, public.liquidaciones, public.documentos_soporte, public.facturas, public.disputas
  to service_role;
-- Append-only: el servidor solo lee e inserta (su trigger rechaza cambios y borrados salvo la purga).
grant select, insert on public.descargas_contenido, public.dispersiones, public.pagos_anunciante, public.disputa_mensajes
  to service_role;

-- 8. Clasificación de columnas auditadas (contadores, huellas y miniaturas: sin fila de bitácora por cada cambio).
insert into private.auditoria_columnas (tabla, columna, tratamiento) values
  ('campanas', 'presupuesto_comprometido', 'OMITIR'),
  ('ofertas', 'cupos_ocupados', 'OMITIR'),
  ('ofertas', 'presupuesto_comprometido', 'OMITIR'),
  ('oferta_cupos', 'cupos_ocupados', 'OMITIR'),
  ('asignaciones', 'clave_idempotencia', 'OMITIR'),
  ('creativo_archivos', 'sha256', 'OMITIR'),
  ('publicaciones', 'miniatura_path', 'OMITIR'),
  ('metricas', 'miniatura_path', 'OMITIR'),
  ('metricas', 'detalle_alertas', 'OMITIR')
on conflict (tabla, columna) do update set tratamiento = excluded.tratamiento;

-- 9. Verificación final de M7
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
  assert not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                       and not exists (select 1 from pg_policies pp
                                       where pp.schemaname = 'public' and pp.tablename = c.relname
                                         and pp.permissive = 'RESTRICTIVE')),
         'hay tablas de public sin política restrictiva';
  assert not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r'
                       and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
                            or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
         'anon tiene privilegios sobre tablas de public';
  -- Contadores, estados y valores congelados: nunca UPDATE para authenticated.
  assert not has_column_privilege('authenticated', 'public.ofertas', 'cupos_ocupados', 'update')
     and not has_column_privilege('authenticated', 'public.ofertas', 'presupuesto_comprometido', 'update')
     and not has_column_privilege('authenticated', 'public.ofertas', 'estado', 'update')
     and not has_column_privilege('authenticated', 'public.campanas', 'presupuesto_comprometido', 'update')
     and not has_column_privilege('authenticated', 'public.campanas', 'estado', 'update')
     and not has_column_privilege('authenticated', 'public.oferta_cupos', 'cupos_ocupados', 'update')
     and not has_table_privilege('authenticated', 'public.asignaciones', 'insert')
     and not has_table_privilege('authenticated', 'public.asignaciones', 'update')
     and not has_table_privilege('authenticated', 'public.asignacion_montos', 'update')
     and not has_column_privilege('authenticated', 'public.metricas', 'estado_validacion', 'update')
     and not has_column_privilege('authenticated', 'public.metricas', 'asignacion_id', 'insert')
     and not has_table_privilege('service_role', 'public.descargas_contenido', 'update')
     and not has_table_privilege('service_role', 'public.pagos_anunciante', 'delete'),
         'privilegios de columna indebidos en tablas transaccionales';
  -- Toda tabla con máquina de estados tiene su trigger de respaldo.
  assert (select count(*) from pg_trigger tg
          where tg.tgname in ('trg_perfiles_a_validar_transicion', 'trg_anunciantes_a_validar_transicion',
            'trg_medios_a_validar_transicion', 'trg_documentos_medio_a_validar_transicion',
            'trg_documentos_anunciante_a_validar_transicion', 'trg_verificaciones_cuenta_a_validar_transicion',
            'trg_campanas_a_validar_transicion', 'trg_ofertas_a_validar_transicion', 'trg_asignaciones_a_validar_transicion',
            'trg_publicaciones_a_validar_transicion', 'trg_metricas_a_validar_transicion',
            'trg_liquidaciones_a_validar_transicion', 'trg_documentos_soporte_a_validar_transicion',
            'trg_facturas_a_validar_transicion', 'trg_disputas_a_validar_transicion')) = 15,
         'falta algún trigger a_validar_transicion';
end $$;
