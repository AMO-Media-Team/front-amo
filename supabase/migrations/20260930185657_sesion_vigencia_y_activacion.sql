-- Integración de autenticación (DAL, docs/modelo-datos.md §2.6, §5.4, §5.5).
-- 1) tocar_sesion_srv informa la vigencia de la sesión y ya NO reactiva una sesión revocada o vencida por
--    inactividad: el DAL la llama al navegar y, si la reactivara, el cierre por inactividad nunca ocurriría.
-- 2) activar_perfil_srv (§5.4) se adelanta desde negocio_transacciones: la necesita la confirmación del
--    enlace de invitación. Hasta que exista private.aplicar_transicion escribe el estado directamente con
--    amo.actor_tipo = 'SISTEMA' (vía (b) de fn_guardar_perfil); M7 debe redefinirla con `create or replace`.

drop function public.tocar_sesion_srv(uuid, uuid);

create function public.tocar_sesion_srv(p_usuario_id uuid, p_session_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.sessions s
                 where s.id = p_session_id and s.user_id = p_usuario_id
                   and (s.not_after is null or s.not_after > now())) then
    return 'REVOCADA';
  end if;
  -- El DAL ya verificó perfil ACTIVO y AAL: si la sesión no es válida, la causa es la inactividad.
  if not private.sesion_valida(p_usuario_id, p_session_id) then
    return 'INACTIVA';
  end if;
  insert into private.sesiones_actividad as a (session_id, usuario_id)
  values (p_session_id, p_usuario_id)
  on conflict (session_id) do update set ultima_actividad_at = private.ahora()
  where a.usuario_id = p_usuario_id
    and a.ultima_actividad_at < private.ahora() - interval '30 seconds';
  return 'VIGENTE';
end $$;
revoke all on function public.tocar_sesion_srv(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tocar_sesion_srv(uuid, uuid) to service_role;

create function public.activar_perfil_srv(p_usuario_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_actor_tipo text := current_setting('amo.actor_tipo', true);
begin
  if not exists (select 1 from auth.users u where u.id = p_usuario_id and u.email_confirmed_at is not null) then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La invitación todavía no se ha confirmado.';
  end if;
  perform set_config('amo.actor_tipo', 'SISTEMA', true);
  -- Idempotente: si el perfil ya no está INVITADO (o no tiene rol), no hace nada.
  update public.perfiles p set estado = 'ACTIVO', activado_at = private.ahora()
  where p.id = p_usuario_id and p.estado = 'INVITADO' and p.rol_id is not null and p.deleted_at is null;
  perform set_config('amo.actor_tipo', coalesce(v_actor_tipo, ''), true);
end $$;
revoke all on function public.activar_perfil_srv(uuid) from public, anon, authenticated;
grant execute on function public.activar_perfil_srv(uuid) to service_role;
