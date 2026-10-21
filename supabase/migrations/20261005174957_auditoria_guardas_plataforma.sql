-- Migración 12b · auditoria_guardas_plataforma (docs/modelo-datos.md §2.4; PDF §6.2, §10.2, §10.6)
-- La regla de §2.4 («contadores, valores congelados y registros de la cadena de pago: solo procedimientos definer»)
-- valía para authenticated (sin grants) pero no para el servidor: con la secret key (service_role) se podía
--   · insertar una liquidación con montos arbitrarios (y aprobarla y pagarla: un pago sin asignaciones VERIFICADA);
--   · poner en cero oferta_cupos.cupos_ocupados (sobreventa; la columna no deja fila en la bitácora);
--   · reescribir marcas de la asignación (plazo de publicación, fechas de estado, liquidación, es_demo), las
--     verificaciones de la evidencia (etiqueta, permanencia) y las retenciones de una asignación.
-- private.fn_solo_plataforma (invoker): fuera de modo_carga solo pasa el owner o una función definer
-- (current_user = 'postgres'). En INSERT rechaza la fila; en UPDATE rechaza cambios en las columnas de TG_ARGV.
-- No incluye las columnas de estado (las protege fn_validar_transicion con AMO_ESTADO_SOLO_VIA_TRANSICION) ni los
-- valores congelados (fn_asignaciones_congelado / fn_asignacion_montos_congelado). El DELETE no cambia.

create function private.fn_solo_plataforma() returns trigger
language plpgsql set search_path = '' as $$
declare v_cols text[];
begin
  if private.modo_carga() or current_user = 'postgres' then return new; end if;
  if tg_op = 'INSERT' then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Este registro solo lo crea la plataforma.', hint = tg_table_name;
  end if;
  select coalesce(array_agg(tg_argv[i]), '{}') into v_cols from generate_series(0, tg_nargs - 1) i;
  if private.hay_cambios(to_jsonb(old), to_jsonb(new), v_cols) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'Esos datos solo los cambia la plataforma.', hint = tg_table_name;
  end if;
  return new;
end $$;
revoke all on function private.fn_solo_plataforma() from public, anon, authenticated;

-- Registros que solo nacen de un procedimiento (generar_liquidacion_srv, emitir_documento_soporte_srv,
-- preparar_dispersion_srv, registrar_pago_anunciante_srv, registrar_descarga_srv, abrir_disputa_srv,
-- registrar_evidencia_srv).
create trigger trg_liquidaciones_a_solo_plataforma before insert on public.liquidaciones
  for each row execute function private.fn_solo_plataforma();
create trigger trg_documentos_soporte_a_solo_plataforma before insert on public.documentos_soporte
  for each row execute function private.fn_solo_plataforma();
create trigger trg_dispersiones_a_solo_plataforma before insert on public.dispersiones
  for each row execute function private.fn_solo_plataforma();
create trigger trg_pagos_anunciante_a_solo_plataforma before insert on public.pagos_anunciante
  for each row execute function private.fn_solo_plataforma();
create trigger trg_descargas_contenido_a_solo_plataforma before insert on public.descargas_contenido
  for each row execute function private.fn_solo_plataforma();
create trigger trg_disputas_a_solo_plataforma before insert or update on public.disputas
  for each row execute function private.fn_solo_plataforma('asignacion_id', 'abierta_por', 'parte', 'motivo', 'descripcion',
    'estado_asignacion_origen', 'resolucion', 'estado_asignacion_resultante', 'resuelta_por', 'fecha_resolucion', 'created_at');
create trigger trg_publicaciones_a_solo_plataforma before insert or update on public.publicaciones
  for each row execute function private.fn_solo_plataforma('url_post', 'fecha_publicacion', 'captura_path', 'miniatura_path',
    'etiqueta_publicidad_confirmada', 'etiqueta_verificada', 'permanencia_hasta', 'permanencia_verificada_at',
    'retirada_detectada_at', 'validada_por', 'validada_at', 'observaciones', 'created_at');

-- Marcas y contadores que solo mueven los procedimientos.
create trigger trg_asignaciones_a_solo_plataforma before update on public.asignaciones
  for each row execute function private.fn_solo_plataforma('estado_previo_disputa', 'causa_cancelacion',
    'contenido_descargado_at', 'publicada_at', 'evidencia_validada_at', 'metricas_cargadas_at', 'verificada_at',
    'liquidada_at', 'pagada_at', 'rechazada_at', 'vencida_at', 'en_disputa_at', 'cancelada_at', 'metricas_atrasadas_at',
    'fecha_limite_publicacion', 'creativo_descargado_id', 'liquidacion_id', 'factura_id', 'motivo', 'es_demo', 'created_at');
create trigger trg_asignacion_montos_a_solo_plataforma before update on public.asignacion_montos
  for each row execute function private.fn_solo_plataforma('retenciones_aplicadas', 'monto_retenciones', 'monto_neto', 'created_at');
create trigger trg_oferta_cupos_a_solo_plataforma before update on public.oferta_cupos
  for each row execute function private.fn_solo_plataforma('oferta_id', 'franja_id', 'cupos_ocupados', 'created_at');

-- Verificación
do $$ begin
  assert (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where p.proname = 'fn_solo_plataforma' and not t.tgisinternal) = 10, 'faltan triggers de fn_solo_plataforma';
  assert not has_function_privilege('authenticated', 'private.fn_solo_plataforma()', 'execute')
     and not has_function_privilege('service_role', 'private.fn_solo_plataforma()', 'execute')
     and not has_function_privilege('anon', 'private.fn_solo_plataforma()', 'execute'),
         'fn_solo_plataforma no debe tener EXECUTE para roles de la API';
  assert has_function_privilege('service_role', 'private.hay_cambios(jsonb, jsonb, text[])', 'execute')
     and has_function_privilege('service_role', 'private.modo_carga()', 'execute'),
         'un trigger invoker solo llama funciones con EXECUTE para los roles de la API';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
end $$;
