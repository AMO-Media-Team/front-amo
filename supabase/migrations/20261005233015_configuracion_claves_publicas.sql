-- Integración transversal (pendientes 16 y 18): dos parámetros que la aplicación necesita con la sesión de CUALQUIER
-- usuario activo pasan a ser públicos (`es_publica`, docs/modelo-datos.md §3.3 y §7). La política de lectura de
-- `configuracion` es `es_publica or tiene_permiso('configuracion.ver')`: sin ese permiso (anunciantes y medios) la
-- app no veía la clave y aplicaba el valor por defecto aunque un administrador lo hubiera cambiado.
--   · analitica.n_minimo_tasas: umbral de «muestra insuficiente». El anunciante ya lo ve en su panel y en sus
--     reportes («n = 7 · se necesitan 20»); las RPC lo aplican con el valor real y la interfaz debe rotular el mismo.
--   · archivos.vigencia_url_firmada_segundos: vida de las URL firmadas que el servidor genera con la sesión del
--     usuario (su avatar, el logo de su empresa). No es un secreto: cada URL firmada lleva su vencimiento.
-- No cambia valores, tipos ni rangos; la edición sigue exigiendo `configuracion.editar` desde el servidor.
update public.configuracion
set es_publica = true
where clave in ('analitica.n_minimo_tasas', 'archivos.vigencia_url_firmada_segundos')
  and not es_publica;

do $$ begin
  assert (select count(*) from public.configuracion
          where clave in ('analitica.n_minimo_tasas', 'archivos.vigencia_url_firmada_segundos') and es_publica) = 2,
         'analitica.n_minimo_tasas y archivos.vigencia_url_firmada_segundos deben quedar públicas';
end $$;
