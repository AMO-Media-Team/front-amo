-- E2 · Desbloqueo de la operación (docs/modelo-datos.md §5.4 y §3.5).
--
-- 1) RF-ROL-008: el Administrador gestiona a los usuarios de anunciantes y medios. La anti-escalada
--    (`private.puede_gestionar`) exigía al actor TODOS los permisos del rol actual y del destino; los roles
--    externos llevan permisos «propios» (campañas propias, ejecutar asignaciones propias, inicio del medio…)
--    que ningún rol interno tiene, así que solo el SUPERADMIN podía invitar o editar a un anunciante o medio.
--    Ahora la comparación ignora los permisos propios cuando el rol comparado es externo. Sigue intacto todo
--    lo demás: nadie salvo un SUPERADMIN toca a un SUPERADMIN, los roles internos (p. ej. Finanzas) siguen
--    exigiendo el subconjunto completo y `private.permiso_aplicable` ya impide que un rol externo lleve
--    permisos internos. Lo heredan sin cambios fn_guardar_perfil, transicionar_srv (perfiles),
--    autorizar_gestion_usuario_srv, cerrar_sesiones_usuario_srv y roles_asignables.
-- 2) RF-ANU-001: el NIT colombiano se valida con el dígito de verificación de la DIAN y la identificación
--    tributaria (NIT, DV, identificación extranjera, país) solo la corrige el equipo AMO (`anunciantes.editar`);
--    el propio anunciante no puede cambiarla.

-- 1. RF-ROL-008 ------------------------------------------------------------------------------------------

-- Permiso «propio»: lo lleva algún rol de sistema externo y ningún rol de sistema interno salvo el SUPERADMIN
-- (que los tiene todos). Hoy: inicio.anunciante/medio, *_propio(s), ofertas.marketplace/aceptar,
-- asignaciones.ejecutar. Se deriva de la semilla para que un permiso nuevo quede bien clasificado solo.
create function private.es_permiso_propio(p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rol_permisos rp join public.roles r on r.id = rp.rol_id
                 where r.es_sistema and r.tipo in ('ANUNCIANTE', 'MEDIO') and rp.permiso_clave = p_clave)
     and not exists (select 1 from public.rol_permisos rp join public.roles r on r.id = rp.rol_id
                     where r.es_sistema and r.tipo = 'ADMIN' and r.clave <> 'SUPERADMIN'
                       and rp.permiso_clave = p_clave) $$;
revoke all on function private.es_permiso_propio(text) from public, anon, authenticated, service_role;

create or replace function private.puede_gestionar(p_actor uuid, p_objetivo uuid, p_rol_destino uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.perfiles p join public.roles r on r.id = p.rol_id
                 where p.id = p_actor and r.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null) then true
    when exists (select 1 from public.perfiles o join public.roles r on r.id = o.rol_id
                 where o.id = p_objetivo and r.clave = 'SUPERADMIN') then false            -- nadie salvo SUPERADMIN toca a un SUPERADMIN
    else not exists (select 1 from public.rol_permisos rp join public.roles r on r.id = rp.rol_id
                     where rp.rol_id in (p_rol_destino, (select o.rol_id from public.perfiles o where o.id = p_objetivo))
                       and not private.tiene_permiso_de(p_actor, rp.permiso_clave)        -- el actor tiene todo permiso del rol actual y del destino…
                       and not (r.tipo in ('ANUNCIANTE', 'MEDIO')                          -- …salvo los propios de un rol externo (ROL-008)
                                and private.es_permiso_propio(rp.permiso_clave)))
  end $$;

-- 2. RF-ANU-001 ------------------------------------------------------------------------------------------

-- Dígito de verificación del NIT (DIAN, módulo 11 con los pesos oficiales sobre los dígitos de derecha a izquierda).
create function private.digito_verificacion_nit(p_nit text) returns char(1)
language sql immutable strict set search_path = '' as $$
  select case when x.residuo in (0, 1) then x.residuo::text else (11 - x.residuo)::text end
  from (select sum(substr(reverse(p_nit), i, 1)::integer
                   * (array[3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71])[i]) % 11 as residuo
        from generate_series(1, char_length(p_nit)) as i) x
  where p_nit ~ '^[0-9]{1,15}$' $$;
revoke all on function private.digito_verificacion_nit(text) from public, anon, authenticated;

-- Valida el DV de un anunciante colombiano y reserva la identificación tributaria al equipo AMO. Definer
-- para no ampliar la lista blanca de EXECUTE de `authenticated`; el rol de la petición se lee del JWT.
-- Las filas históricas no se revalidan: solo se comprueba lo que cambia.
create function private.fn_anunciantes_identificacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;

  if tg_op = 'UPDATE'
     and (new.nit, new.digito_verificacion, new.identificacion_extranjera, new.pais_iso2)
         is distinct from (old.nit, old.digito_verificacion, old.identificacion_extranjera, old.pais_iso2)
     and coalesce((select auth.role()), '') = 'authenticated'
     and not private.tiene_permiso('anunciantes.editar') then
    raise exception using errcode = 'P0001', message = 'AMO_NO_AUTORIZADO',
      detail = 'La identificación tributaria de la empresa solo la corrige el equipo de AMO.';
  end if;

  if new.pais_iso2 = 'CO'
     and (tg_op = 'INSERT'
          or (new.nit, new.digito_verificacion, new.pais_iso2)
             is distinct from (old.nit, old.digito_verificacion, old.pais_iso2)) then
    if new.digito_verificacion is null then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'Indica el dígito de verificación del NIT.';
    end if;
    if new.digito_verificacion is distinct from private.digito_verificacion_nit(new.nit) then
      raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
        detail = 'El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.fn_anunciantes_identificacion() from public, anon, authenticated;

create trigger trg_anunciantes_b_identificacion
  before insert or update of nit, digito_verificacion, identificacion_extranjera, pais_iso2 on public.anunciantes
  for each row execute function private.fn_anunciantes_identificacion();

-- El equipo AMO corrige la identificación por la política de UPDATE interna (`anunciantes.editar`); la del
-- propio anunciante también alcanza estas columnas, pero el trigger anterior lo impide.
grant update (nit, digito_verificacion, identificacion_extranjera, pais_iso2) on public.anunciantes to authenticated;

-- 3. RF-MED-001 · Categorías del medio --------------------------------------------------------------------------
-- Una categoría archivada o borrada no se asigna a un medio (las que ya tenía se conservan). Definer: la RLS de
-- `categorias` oculta las inactivas a quien no tiene `configuracion.ver`.
create function private.fn_medio_categorias_activa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if not exists (select 1 from public.categorias c
                 where c.id = new.categoria_id and c.activo and c.deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'AMO_CONFIG_INVALIDA',
      detail = 'Una de las categorías elegidas ya no está disponible.';
  end if;
  return new;
end $$;
revoke all on function private.fn_medio_categorias_activa() from public, anon, authenticated;

create trigger trg_medio_categorias_b_activa before insert on public.medio_categorias
  for each row execute function private.fn_medio_categorias_activa();

-- Comprobación en la propia migración (como las demás): el algoritmo coincide con NIT conocidos.
do $$
begin
  assert private.digito_verificacion_nit('999000001') = '2', 'DV de 999000001';
  assert private.digito_verificacion_nit('900123456') = '8', 'DV de 900123456';
  assert private.digito_verificacion_nit('860002183') = '9', 'DV de 860002183';
  assert private.digito_verificacion_nit('12a') is null, 'NIT no numérico';
  assert private.es_permiso_propio('ofertas.aceptar'), 'ofertas.aceptar es propio';
  assert not private.es_permiso_propio('reportes.ver'), 'reportes.ver no es propio';
  assert not private.es_permiso_propio('usuarios.invitar'), 'usuarios.invitar no es propio';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
end $$;
