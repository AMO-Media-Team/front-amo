-- Migración 12c · auditoria_recordatorios_idempotentes (docs/modelo-datos.md §5.8, §9.2)
-- private.generar_recordatorios deduplicaba el recordatorio de métricas buscando «corte <X> » en el TEXTO de las
-- notificaciones ya enviadas. Ese texto sale de una plantilla editable (configuracion.catalogos) y del título de la
-- oferta (lo escribe el anunciante):
--   · con la plantilla editada, cada corrida horaria reenviaba el mismo recordatorio a todos los usuarios del medio;
--   · un título con «corte D7 » suprimía para siempre el recordatorio de ese corte.
-- Ahora «una vez por asignación y corte» se registra en private.recordatorios_metricas (clave primaria), sin depender
-- del texto. Tabla interna como las demás de private: sin grants ni exposición por la API; se borra en cascada con la
-- asignación (purga demo). Solo se marca como enviado si la notificación llegó a alguien.

create table private.recordatorios_metricas (
  asignacion_id uuid not null references public.asignaciones (id) on delete cascade,
  corte public.corte_metrica not null,
  enviado_at timestamptz not null default private.ahora(),
  constraint recordatorios_metricas_pkey primary key (asignacion_id, corte)
);
comment on table private.recordatorios_metricas is
  'Recordatorio de métricas ya enviado por asignación y corte (idempotencia de private.generar_recordatorios).';
revoke all on table private.recordatorios_metricas from public, anon, authenticated, service_role;

-- Recordatorios (§5.8, SHOULD): publicación que vence en 24 h (uno por asignación cada 24 h) y corte de métricas ya
-- alcanzado sin fila (uno por asignación y corte, desde PUBLICADA; registrado en private.recordatorios_metricas).
create or replace function private.generar_recordatorios() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer := 0;
  v_env integer;
  v_ahora timestamptz := private.ahora();
  v_plazo interval := make_interval(hours => private.config_entero('metricas.plazo_carga_horas'));
  x record;
begin
  for x in select a.id, a.oferta_id, a.medio_id, a.fecha_limite_publicacion
           from public.asignaciones a
           where a.estado in ('ACEPTADA', 'CONTENIDO_ENTREGADO')
             and a.fecha_limite_publicacion > v_ahora and a.fecha_limite_publicacion <= v_ahora + interval '24 hours'
             and not exists (select 1 from public.notificaciones n
                             where n.tipo = 'asignacion.recordatorio_publicacion' and n.entidad_id = a.id::text
                               and n.created_at > v_ahora - interval '24 hours') loop
    v_n := v_n + private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.recordatorio_publicacion',
      jsonb_build_object('oferta_id', x.oferta_id, 'fecha_fin', private.formato_fecha(x.fecha_limite_publicacion)),
      'asignaciones', x.id::text, null, 1::smallint);
  end loop;

  for x in select y.id, y.oferta_id, y.medio_id, y.corte, y.vence
           from (select a.id, a.oferta_id, a.medio_id, k.corte,
                        min(p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours'
                                                               when 'H72' then interval '72 hours'
                                                               else interval '7 days' end) as vence
                 from public.asignaciones a
                 join public.ofertas o on o.id = a.oferta_id
                 join public.publicaciones p on p.asignacion_id = a.id and p.estado_validacion <> 'RECHAZADA'
                 cross join unnest(o.cortes_requeridos) k (corte)
                 where a.estado in ('PUBLICADA', 'EVIDENCIA_VALIDADA')
                   and p.fecha_publicacion + case k.corte when 'H24' then interval '24 hours'
                                                          when 'H72' then interval '72 hours'
                                                          else interval '7 days' end <= v_ahora
                   and not exists (select 1 from public.metricas m
                                   where m.publicacion_id = p.id and m.corte = k.corte and m.estado_validacion <> 'RECHAZADA')
                 group by a.id, a.oferta_id, a.medio_id, k.corte) y
           where not exists (select 1 from private.recordatorios_metricas e
                             where e.asignacion_id = y.id and e.corte = y.corte) loop
    v_env := private.notificar(private.usuarios_medio(x.medio_id), 'asignacion.recordatorio_metricas',
      jsonb_build_object('oferta_id', x.oferta_id, 'corte', x.corte::text, 'fecha_limite', private.formato_fecha(x.vence + v_plazo)),
      'asignaciones', x.id::text, null, 1::smallint);
    if v_env > 0 then
      insert into private.recordatorios_metricas (asignacion_id, corte) values (x.id, x.corte)
      on conflict (asignacion_id, corte) do nothing;
    end if;
    v_n := v_n + v_env;
  end loop;
  return v_n;
end $$;
revoke all on function private.generar_recordatorios() from public, anon, authenticated, service_role;

-- Verificación
do $$ begin
  assert not has_table_privilege('anon', 'private.recordatorios_metricas', 'select, insert, update, delete')
     and not has_table_privilege('authenticated', 'private.recordatorios_metricas', 'select, insert, update, delete')
     and not has_table_privilege('service_role', 'private.recordatorios_metricas', 'select, insert, update, delete'),
         'private.recordatorios_metricas no debe tener grants para roles de la API';
  assert not has_function_privilege('authenticated', 'private.generar_recordatorios()', 'execute')
     and not has_function_privilege('service_role', 'private.generar_recordatorios()', 'execute')
     and not has_function_privilege('anon', 'private.generar_recordatorios()', 'execute'),
         'generar_recordatorios no debe tener EXECUTE para roles de la API';
end $$;
