-- Corrección de extensiones_y_esquemas (no se edita una migración aplicada).
-- Los triggers invoker (p. ej. private.fn_set_updated_at) llaman a private.modo_carga() con el rol de la
-- sesión: sin EXECUTE, todo UPDATE de authenticated o service_role sobre una tabla con trg_*_m_updated_at
-- fallaba con 42501. Los interruptores son predicados inofensivos (solo devuelven true para el owner
-- conectado directamente, session_user = 'postgres') y private no está expuesto por PostgREST.
grant execute on function private.modo_carga(), private.purga_habilitada() to authenticated, service_role;

create or replace function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header',
               'modo_carga', 'purga_habilitada',
               'actor_id', 'contexto_confiable', 'mi_rol_id', 'mi_anunciante_id', 'mi_medio_id', 'tiene_permiso',
               'acceso_valido', 'config_entero', 'config_decimal', 'config_texto', 'config_booleano', 'config_lista']::text[] $$;

do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert has_function_privilege('service_role', 'private.modo_carga()', 'execute')
     and has_function_privilege('authenticated', 'private.modo_carga()', 'execute'),
         'los roles API deben poder ejecutar private.modo_carga() desde triggers invoker';
end $$;
