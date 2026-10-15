-- Migración 7g · negocio_transacciones_politicas (docs/modelo-datos.md §5.1, §5.2)
-- El advisor de rendimiento marca «multiple_permissive_policies» en el UPDATE de campanas, ofertas y metricas
-- (una política para internos y otra para el dueño). Se fusionan en una sola política permisiva por tabla con
-- USING (a OR b) y WITH CHECK (a' OR b'): la semántica es idéntica (Postgres ya combina con OR las permisivas),
-- pero se evalúa una sola política. La restrictiva «acceso válido» no cambia.

drop policy "campanas: update interno" on public.campanas;
drop policy "campanas: update propio" on public.campanas;
create policy "campanas: update" on public.campanas for update to authenticated
  using ((select private.tiene_permiso('campanas.gestionar'))
         or (anunciante_id = (select private.mi_anunciante_id()) and deleted_at is null
             and estado in ('BORRADOR', 'ACTIVA') and (select private.tiene_permiso('campanas.gestionar_propias'))))
  with check ((select private.tiene_permiso('campanas.gestionar'))
              or (anunciante_id = (select private.mi_anunciante_id())
                  and estado in ('BORRADOR', 'ACTIVA') and (select private.tiene_permiso('campanas.gestionar_propias'))));

drop policy "ofertas: update interno" on public.ofertas;
drop policy "ofertas: update propio" on public.ofertas;
create policy "ofertas: update" on public.ofertas for update to authenticated
  using ((select private.tiene_permiso('ofertas.moderar')) or (select private.tiene_permiso('ofertas.gestionar'))
         or (anunciante_id = (select private.mi_anunciante_id()) and deleted_at is null
             and estado in ('BORRADOR', 'DEVUELTA') and (select private.tiene_permiso('ofertas.gestionar_propias'))))
  with check ((select private.tiene_permiso('ofertas.moderar')) or (select private.tiene_permiso('ofertas.gestionar'))
              or (anunciante_id = (select private.mi_anunciante_id())
                  and estado in ('BORRADOR', 'DEVUELTA') and (select private.tiene_permiso('ofertas.gestionar_propias'))));

drop policy "metricas: update interno" on public.metricas;
drop policy "metricas: update medio" on public.metricas;
create policy "metricas: update" on public.metricas for update to authenticated
  using ((select private.tiene_permiso('metricas.validar')) or (select private.tiene_permiso('metricas.editar_validadas'))
         or (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
             and (select private.tiene_permiso('asignaciones.ejecutar'))))
  with check ((select private.tiene_permiso('metricas.validar')) or (select private.tiene_permiso('metricas.editar_validadas'))
              or (medio_id = (select private.mi_medio_id()) and estado_validacion in ('PENDIENTE', 'RECHAZADA')
                  and (select private.tiene_permiso('asignaciones.ejecutar'))));

-- Verificación: una sola permisiva de UPDATE por tabla y la restrictiva intacta.
do $$ begin
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('campanas', 'ofertas', 'metricas')
            and cmd = 'UPDATE' and permissive = 'PERMISSIVE') = 3, 'políticas UPDATE no fusionadas';
  assert (select count(*) from pg_policies where schemaname = 'public' and tablename in ('campanas', 'ofertas', 'metricas')
            and permissive = 'RESTRICTIVE' and policyname like '%acceso válido') = 3, 'falta la restrictiva acceso válido';
end $$;
