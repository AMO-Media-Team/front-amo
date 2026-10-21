-- Datos demo · paso 99 · limpieza del andamiaje (docs/modelo-datos.md §10)
-- Borra TODO lo que 00_base.sql … 06_cierre.sql crearon en `private` con prefijo `demo_`: las funciones generadoras y las
-- tablas de plan (demo_control, demo_usuarios, demo_anunciantes, demo_medios, demo_cuentas, demo_eventos, demo_avisos).
-- No toca ningún dato de `public`: los datos demo se borran con la purga (README.md, «Purgar»).
--
-- Cuándo ejecutarlo (MCP execute_sql, como owner):
--   · siempre después de la purga, antes de volver a generar (demo_actores se niega a correr si demo_medios tiene filas);
--   · opcionalmente al terminar una generación, cuando ya no se vayan a ajustar los datos. Mientras exista, el andamiaje
--     conserva el perfil de conexión de cada usuario y los factores latentes de cada medio, y evita generar dos veces.
do $$
declare o record;
begin
  for o in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname like 'demo\_%' loop
    execute format('drop function if exists %s', o.firma);
  end loop;
  for o in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'private' and c.relkind = 'r' and c.relname like 'demo\_%' loop
    execute format('drop table if exists private.%I', o.relname);
  end loop;
end $$;
