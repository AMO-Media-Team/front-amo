-- Migración 10 · storage (docs/modelo-datos.md §8, §3.8 regla 2)
-- Cinco buckets privados con límite de tamaño y MIME, helpers de ruta (private.seg / seg_uuid) y de propiedad
-- (definer, filtrados por la identidad del JWT), restrictivas globales sobre storage.objects (sesión válida y ruta sin
-- '..') y políticas por bucket y carpeta ligadas a filas y permisos. No se ejecuta `enable row level security` sobre
-- storage.objects (ya la tiene; esquema de Supabase). Sin políticas UPDATE (no hay upsert desde el cliente) y DELETE
-- solo del avatar propio: el resto lo borra el servidor (service_role).
-- Endurece además perfiles.avatar_path: sin '..' y con la forma perfil/<uuid>/<archivo> (pendiente de la auditoría).

-- 1. Buckets (todos privados; lectura con URL firmada de corta duración generada en el servidor)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatares', 'avatares', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('documentos', 'documentos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('creativos', 'creativos', false, 52428800,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime']),
  ('evidencias', 'evidencias', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('soportes', 'soportes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'text/csv'])
on conflict (id) do update
  set name = excluded.name, public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Helpers de ruta (puros)
create function private.seg(p_name text, p_n integer) returns text
language sql immutable set search_path = '' as $$
  select (storage.foldername(p_name))[p_n] $$;
revoke all on function private.seg(text, integer) from public, anon, authenticated;
grant execute on function private.seg(text, integer) to authenticated, service_role;

-- Segmento como uuid; null si no es un uuid válido (evita errores de cast en las políticas).
create function private.seg_uuid(p_name text, p_n integer) returns uuid
language sql immutable set search_path = '' as $$
  select case when (storage.foldername(p_name))[p_n] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_name))[p_n])::uuid end $$;
revoke all on function private.seg_uuid(text, integer) from public, anon, authenticated;
grant execute on function private.seg_uuid(text, integer) to authenticated, service_role;

-- 3. Helpers de propiedad (definer: leen filas que la RLS del usuario no muestra, p. ej. asignaciones al medio).
-- Todos filtran por la identidad del JWT (mi_medio_id / mi_anunciante_id / tiene_permiso): no revelan nada ajeno.

create function private.es_mi_oferta(p_oferta_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ofertas o
                 where o.id = p_oferta_id and o.deleted_at is null and o.anunciante_id = (select private.mi_anunciante_id())) $$;
revoke all on function private.es_mi_oferta(uuid) from public, anon, authenticated;
grant execute on function private.es_mi_oferta(uuid) to authenticated, service_role;

-- Subida de creativos: el creativo pertenece a la oferta y (anunciante dueño con ofertas.gestionar_propias, o interno
-- con ofertas.gestionar) y la oferta está en BORRADOR/DEVUELTA o el creativo es la versión vigente (nueva versión).
create function private.puedo_subir_creativo(p_oferta_id uuid, p_creativo_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ofertas o
    join public.creativos c on c.oferta_id = o.id and c.id = p_creativo_id
    where o.id = p_oferta_id and o.deleted_at is null
      and ((o.anunciante_id = (select private.mi_anunciante_id()) and (select private.tiene_permiso('ofertas.gestionar_propias')))
           or (select private.tiene_permiso('ofertas.gestionar')))
      and (o.estado in ('BORRADOR', 'DEVUELTA') or c.vigente)) $$;
revoke all on function private.puedo_subir_creativo(uuid, uuid) from public, anon, authenticated;
grant execute on function private.puedo_subir_creativo(uuid, uuid) to authenticated, service_role;

-- Evidencias de la asignación: medio dueño con asignaciones.ejecutar y la asignación en ejecución.
create function private.puedo_subir_evidencia(p_asignacion_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.tiene_permiso('asignaciones.ejecutar'))
     and exists (select 1 from public.asignaciones a
                 where a.id = p_asignacion_id and a.medio_id = (select private.mi_medio_id())
                   and a.estado in ('CONTENIDO_ENTREGADO', 'PUBLICADA', 'EVIDENCIA_VALIDADA', 'METRICAS_CARGADAS')) $$;
revoke all on function private.puedo_subir_evidencia(uuid) from public, anon, authenticated;
grant execute on function private.puedo_subir_evidencia(uuid) to authenticated, service_role;

-- Parte (medio o anunciante) de la asignación en disputa; p_abierta exige ABIERTA o EN_REVISION.
create function private.soy_parte_disputa(p_disputa_id uuid, p_abierta boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.disputas d join public.asignaciones a on a.id = d.asignacion_id
                 where d.id = p_disputa_id
                   and (a.medio_id = (select private.mi_medio_id()) or a.anunciante_id = (select private.mi_anunciante_id()))
                   and (not p_abierta or d.estado in ('ABIERTA', 'EN_REVISION'))) $$;
revoke all on function private.soy_parte_disputa(uuid, boolean) from public, anon, authenticated;
grant execute on function private.soy_parte_disputa(uuid, boolean) to authenticated, service_role;

-- Soportes: liquidacion/documento_soporte → medio dueño (liquidaciones.ver_propias); factura/pago (id de factura) →
-- anunciante dueño (facturas.ver_propias).
create function private.soy_dueno_soporte(p_tipo text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_tipo
    when 'liquidacion' then (select private.tiene_permiso('liquidaciones.ver_propias'))
      and exists (select 1 from public.liquidaciones l where l.id = p_id and l.medio_id = (select private.mi_medio_id()))
    when 'documento_soporte' then (select private.tiene_permiso('liquidaciones.ver_propias'))
      and exists (select 1 from public.documentos_soporte ds join public.liquidaciones l on l.id = ds.liquidacion_id
                  where ds.id = p_id and l.medio_id = (select private.mi_medio_id()))
    when 'factura' then (select private.tiene_permiso('facturas.ver_propias'))
      and exists (select 1 from public.facturas f where f.id = p_id and f.anunciante_id = (select private.mi_anunciante_id()))
    when 'pago' then (select private.tiene_permiso('facturas.ver_propias'))
      and exists (select 1 from public.facturas f where f.id = p_id and f.anunciante_id = (select private.mi_anunciante_id()))
    else false end $$;
revoke all on function private.soy_dueno_soporte(text, uuid) from public, anon, authenticated;
grant execute on function private.soy_dueno_soporte(text, uuid) to authenticated, service_role;

create or replace function private.lista_blanca_authenticated() returns text[]
language sql immutable set search_path = '' as $$
  select array['ahora', 'hoy', 'inicio_dia', 'normalizar_texto', 'uuid_v7', 'enmascarar', 'header',
               'modo_carga', 'purga_habilitada',
               'actor_id', 'contexto_confiable', 'mi_rol_id', 'mi_anunciante_id', 'mi_medio_id', 'tiene_permiso',
               'acceso_valido', 'config_entero', 'config_decimal', 'config_texto', 'config_booleano', 'config_lista',
               'cuenta_vigente', 'anunciante_ve_medio',
               'hay_cambios', 'estados_con_cupo', 'consume_cupo', 'oferta_visible_para_mi', 'tengo_asignacion_en',
               'tengo_asignacion_activa_en', 'puedo_descargar_creativos_de', 'puedo_ver_asignacion',
               'puedo_cargar_metricas', 'calcular_precio', 'registrar_vista_oferta', 'estimar_oferta_agregado',
               -- M9 analítica
               'exigir_permiso', 'rango_kpi', 'cubeta', 'cubetas', 'kpi_ensamblar', 'desempeno_verificadas',
               'cumplimiento_aplica', 'cumplimiento_ok', 'medios_en_riesgo_al', 'geo_valores', 'geo_validar',
               -- M10 storage
               'seg', 'seg_uuid', 'es_mi_oferta', 'puedo_subir_creativo', 'puedo_subir_evidencia', 'soy_parte_disputa',
               'soy_dueno_soporte']::text[] $$;

-- 4. Políticas sobre storage.objects (todas to authenticated)
drop policy if exists "storage: acceso válido" on storage.objects;
create policy "storage: acceso válido" on storage.objects as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
drop policy if exists "storage: ruta segura" on storage.objects;
create policy "storage: ruta segura" on storage.objects as restrictive for insert to authenticated
  with check (position('..' in name) = 0 and left(name, 1) <> '/' and position('//' in name) = 0);

-- avatares: perfil/{perfil_id}/{archivo} · anunciante/{id}/logo-{uuid}.webp · medio/{id}/logo-{uuid}.webp
drop policy if exists "storage: avatares select" on storage.objects;
create policy "storage: avatares select" on storage.objects for select to authenticated
  using (bucket_id = 'avatares'
         and ((private.seg(name, 1) = 'perfil'
               and (private.seg_uuid(name, 2) = (select auth.uid()) or (select private.tiene_permiso('usuarios.ver'))))
              or private.seg(name, 1) in ('anunciante', 'medio')));
drop policy if exists "storage: avatares insert" on storage.objects;
create policy "storage: avatares insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and private.seg(name, 3) is null
              and ((private.seg(name, 1) = 'perfil' and private.seg_uuid(name, 2) = (select auth.uid()))
                   or (private.seg(name, 1) = 'anunciante'
                       and ((private.seg_uuid(name, 2) = (select private.mi_anunciante_id())
                             and (select private.tiene_permiso('anunciantes.editar_propio')))
                            or (select private.tiene_permiso('anunciantes.editar'))))
                   or (private.seg(name, 1) = 'medio'
                       and ((private.seg_uuid(name, 2) = (select private.mi_medio_id())
                             and (select private.tiene_permiso('medios.editar_propio')))
                            or (select private.tiene_permiso('medios.editar'))))));
drop policy if exists "storage: avatares delete propio" on storage.objects;
create policy "storage: avatares delete propio" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and private.seg(name, 1) = 'perfil' and private.seg_uuid(name, 2) = (select auth.uid()));

-- documentos: solo el dueño (los internos acceden por Server Action, regla de firma 2)
drop policy if exists "storage: documentos select dueño" on storage.objects;
create policy "storage: documentos select dueño" on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and ((private.seg(name, 1) = 'medio' and private.seg_uuid(name, 2) = (select private.mi_medio_id()))
              or (private.seg(name, 1) = 'anunciante' and private.seg_uuid(name, 2) = (select private.mi_anunciante_id()))));
drop policy if exists "storage: documentos insert dueño" on storage.objects;
create policy "storage: documentos insert dueño" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos'
              and ((private.seg(name, 1) = 'medio' and private.seg_uuid(name, 2) = (select private.mi_medio_id())
                    and (select private.tiene_permiso('medios.editar_propio'))
                    and (private.seg(name, 3) = any (enum_range(null::public.documento_medio_tipo)::text[])
                         or (private.seg(name, 3) = 'cuenta_social'
                             and exists (select 1 from public.cuentas_sociales c
                                         where c.id = private.seg_uuid(name, 4)
                                           and c.medio_id = (select private.mi_medio_id()) and c.deleted_at is null))))
                   or (private.seg(name, 1) = 'anunciante' and private.seg_uuid(name, 2) = (select private.mi_anunciante_id())
                       and (select private.tiene_permiso('anunciantes.editar_propio'))
                       and private.seg(name, 3) = any (enum_range(null::public.documento_anunciante_tipo)::text[]))));

-- creativos: oferta/{oferta_id}/{creativo_id}/{orden}-{nombre}.{ext}
drop policy if exists "storage: creativos select" on storage.objects;
create policy "storage: creativos select" on storage.objects for select to authenticated
  using (bucket_id = 'creativos' and private.seg(name, 1) = 'oferta'
         and (private.es_mi_oferta(private.seg_uuid(name, 2))
              or (select private.tiene_permiso('ofertas.ver'))
              or private.puedo_descargar_creativos_de(private.seg_uuid(name, 2))));
drop policy if exists "storage: creativos insert" on storage.objects;
create policy "storage: creativos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'creativos' and private.seg(name, 1) = 'oferta'
              and private.puedo_subir_creativo(private.seg_uuid(name, 2), private.seg_uuid(name, 3)));

-- evidencias: asignacion/{id}/publicacion|metrica/... · disputa/{id}/... · disputa/{id}/interno/... · muestras/ (nadie)
drop policy if exists "storage: evidencias select" on storage.objects;
create policy "storage: evidencias select" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias'
         and ((private.seg(name, 1) = 'asignacion' and private.puedo_ver_asignacion(private.seg_uuid(name, 2)))
              or (private.seg(name, 1) = 'disputa'
                  and ((select private.tiene_permiso('disputas.ver'))
                       or (private.soy_parte_disputa(private.seg_uuid(name, 2), false)
                           and private.seg(name, 3) is distinct from 'interno')))));
drop policy if exists "storage: evidencias insert" on storage.objects;
create policy "storage: evidencias insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias'
              and ((private.seg(name, 1) = 'asignacion' and private.seg(name, 3) in ('publicacion', 'metrica')
                    and private.puedo_subir_evidencia(private.seg_uuid(name, 2)))
                   or (private.seg(name, 1) = 'disputa'
                       and ((private.seg(name, 3) is distinct from 'interno'
                             and private.soy_parte_disputa(private.seg_uuid(name, 2), true))
                            or ((select private.tiene_permiso('disputas.resolver'))
                                and exists (select 1 from public.disputas d where d.id = private.seg_uuid(name, 2)))))));

-- soportes: lectura solo del dueño (internos por Server Action); subidas internas por permiso; documento_soporte y
-- dispersion solo desde el servidor.
drop policy if exists "storage: soportes select dueño" on storage.objects;
create policy "storage: soportes select dueño" on storage.objects for select to authenticated
  using (bucket_id = 'soportes'
         and private.seg(name, 1) in ('liquidacion', 'documento_soporte', 'factura', 'pago')
         and private.soy_dueno_soporte(private.seg(name, 1), private.seg_uuid(name, 2)));
drop policy if exists "storage: soportes insert interno" on storage.objects;
create policy "storage: soportes insert interno" on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes'
              and ((private.seg(name, 1) = 'liquidacion' and (select private.tiene_permiso('liquidaciones.registrar_pago'))
                    and exists (select 1 from public.liquidaciones l where l.id = private.seg_uuid(name, 2)))
                   or (private.seg(name, 1) = 'factura' and (select private.tiene_permiso('facturas.gestionar'))
                       and exists (select 1 from public.facturas f where f.id = private.seg_uuid(name, 2)))
                   or (private.seg(name, 1) = 'pago' and (select private.tiene_permiso('pagos.registrar'))
                       and exists (select 1 from public.facturas f where f.id = private.seg_uuid(name, 2)))));

-- 5. perfiles.avatar_path endurecido (además de perfiles_avatar_path_chk: prefijo perfil/<id propio>/)
alter table public.perfiles add constraint perfiles_avatar_path_seguro_chk
  check (avatar_path is null
         or (position('..' in avatar_path) = 0
             and avatar_path ~ '^perfil/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$'));

-- 6. Verificación
do $$ begin
  assert (select count(*) from storage.buckets
          where id in ('avatares', 'documentos', 'creativos', 'evidencias', 'soportes') and not public
            and file_size_limit <= 52428800 and cardinality(allowed_mime_types) >= 3) = 5,
         'faltan buckets privados con límites';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                       and ('anon' = any (roles) or 'public' = any (roles))),
         'hay políticas de storage para anon o public';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'UPDATE'),
         'no debe haber políticas UPDATE en storage.objects';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and permissive = 'RESTRICTIVE') = 2, 'faltan las restrictivas globales de storage';
end $$;
