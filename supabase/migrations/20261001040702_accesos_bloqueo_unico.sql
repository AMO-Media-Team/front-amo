-- Corrección pendiente de la auditoría (docs/modelo-datos.md §5.5, §11.2): un intento bloqueado por el limitador
-- ya no deja una fila de `accesos` por cada reintento. registrar_acceso_srv (misma firma) registra solo el PRIMER
-- LOGIN_BLOQUEADO de la misma identidad (hash del correo o clave del limitador; si no hay, usuario; si tampoco, solo
-- IP) y la misma IP dentro de `seguridad.login_bloqueo_minutos`; los siguientes devuelven la fila ya registrada
-- (sin marca de sospecha). El resto de eventos no cambia.

create index accesos_bloqueos_idx on public.accesos (email_hash, created_at desc) where evento = 'LOGIN_BLOQUEADO';

create or replace function public.registrar_acceso_srv(
  p_usuario_id uuid, p_email text, p_evento public.acceso_evento, p_session_id uuid, p_aal text,
  p_ip inet, p_pais char(2), p_region text, p_ciudad text, p_lat numeric, p_lon numeric,
  p_ua text, p_navegador text, p_so text, p_dispositivo text)
returns table (id bigint, es_sospechoso boolean, motivo text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hash text;
  v_pais char(2);
  v_depto char(2);
  v_muni char(5);
  v_motivo text;
  v_id bigint;
begin
  if nullif(btrim(p_email), '') is not null then
    v_hash := encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex');
  end if;

  -- Un bloqueo por ventana: los reintentos bloqueados no inflan el registro (ni las métricas de accesos).
  if p_evento = 'LOGIN_BLOQUEADO' then
    select a.id into v_id from public.accesos a
    where a.evento = 'LOGIN_BLOQUEADO'
      and a.created_at > private.ahora() - make_interval(mins => private.config_entero('seguridad.login_bloqueo_minutos'))
      and a.ip is not distinct from p_ip
      and case when v_hash is not null then a.email_hash = v_hash
               when p_usuario_id is not null then a.usuario_id = p_usuario_id
               else a.email_hash is null and a.usuario_id is null end
    order by a.created_at desc
    limit 1;
    if v_id is not null then
      return query select v_id, false, null::text;
      return;
    end if;
  end if;

  select pa.iso2 into v_pais from public.paises pa where pa.iso2 = upper(btrim(p_pais));
  if v_pais = 'CO' and nullif(btrim(p_region), '') is not null then
    select d.codigo into v_depto from public.departamentos d where d.iso_3166_2 = 'CO-' || upper(btrim(p_region));
  end if;
  if v_depto is not null and nullif(btrim(p_ciudad), '') is not null then
    select m.codigo into v_muni from public.municipios m
    where m.departamento_codigo = v_depto and m.nombre_normalizado = private.normalizar_texto(p_ciudad)
    order by m.es_capital desc, m.codigo
    limit 1;
  end if;

  if p_evento = 'LOGIN_EXITOSO' and p_usuario_id is not null and v_pais is not null
     and v_pais <> all (private.config_lista('seguridad.paises_habituales'))
     and not exists (select 1 from public.accesos a
                     where a.usuario_id = p_usuario_id and a.evento = 'LOGIN_EXITOSO' and a.pais_iso2 = v_pais
                       and a.created_at > private.ahora() - interval '90 days') then
    v_motivo := 'PAIS_INUSUAL';
  elsif v_hash is not null
        and (select count(*) from private.intentos_login i
             where i.email_hash = v_hash and not i.exito
               and i.created_at > now() - make_interval(mins => private.config_entero('seguridad.login_ventana_minutos')))
            >= private.config_entero('seguridad.login_max_fallos_email') then
    v_motivo := 'MULTIPLES_FALLOS';
  end if;

  insert into public.accesos as a (usuario_id, email_hash, evento, session_id, aal, ip, pais_iso2, departamento_codigo,
                                   municipio_codigo, ciudad, lat, lon, user_agent, navegador, sistema_operativo,
                                   dispositivo, es_sospechoso, motivo_sospecha)
  values (p_usuario_id, v_hash, p_evento, p_session_id, p_aal, p_ip, v_pais, v_depto,
          v_muni, left(nullif(btrim(p_ciudad), ''), 120), round(p_lat, 2), round(p_lon, 2), left(p_ua, 400),
          left(p_navegador, 80), left(p_so, 80), p_dispositivo, v_motivo is not null, v_motivo)
  returning a.id into v_id;

  if p_evento = 'LOGIN_EXITOSO' and p_usuario_id is not null then
    update public.perfiles p set ultimo_acceso_at = private.ahora() where p.id = p_usuario_id;
    if p_session_id is not null then
      insert into private.sesiones_actividad as s (session_id, usuario_id)
      values (p_session_id, p_usuario_id)
      on conflict (session_id) do update set ultima_actividad_at = private.ahora()
      where s.usuario_id = p_usuario_id;
    end if;
  end if;

  return query select v_id, v_motivo is not null, v_motivo;
end $$;
revoke all on function public.registrar_acceso_srv(uuid, text, public.acceso_evento, uuid, text, inet, char, text, text,
  numeric, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_acceso_srv(uuid, text, public.acceso_evento, uuid, text, inet, char, text, text,
  numeric, numeric, text, text, text, text) to service_role;

do $$ begin
  assert not has_function_privilege('authenticated', 'public.registrar_acceso_srv(uuid, text, public.acceso_evento, uuid, text, inet, char, text, text, numeric, numeric, text, text, text, text)', 'execute')
     and has_function_privilege('service_role', 'public.registrar_acceso_srv(uuid, text, public.acceso_evento, uuid, text, inet, char, text, text, numeric, numeric, text, text, text, text)', 'execute'),
         'registrar_acceso_srv: EXECUTE indebido';
end $$;
