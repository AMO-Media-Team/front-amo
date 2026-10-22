-- Pruebas de humo de 20261022024336_e2_desbloqueo: RF-ROL-008 (el ADMIN gestiona usuarios de anunciantes y
-- medios, pero sigue sin escalar a roles internos ni tocar a un SUPERADMIN) y RF-ANU-001 (dígito de verificación
-- del NIT y corrección de la identificación tributaria solo por el equipo AMO), más RF-MED-001 (solo se asignan
-- categorías activas).
-- Se ejecuta como owner (pnpm db:suites o psql) en una transacción que SIEMPRE se revierte. Cada prueba deja
-- `true` si pasa o lo observado si falla.
begin;

do $humo$
declare
  r jsonb := '{}';
  v_e text;
  v_n bigint;
  v_t text;
  u_adm constant uuid := '00000000-0000-4000-a000-00000000e201';   -- ADMIN ACTIVO (actor)
  u_inv constant uuid := '00000000-0000-4000-a000-00000000e202';   -- INVITADO sin rol
  u_anu constant uuid := '00000000-0000-4000-a000-00000000e203';   -- usuario ACTIVO del anunciante
  u_ope constant uuid := '00000000-0000-4000-a000-00000000e204';   -- OPERACIONES ACTIVO
  an_id constant uuid := '00000000-0000-4000-a000-00000000e2a1';
  me_id constant uuid := '00000000-0000-4000-a000-00000000e2b1';
  v_rol_admin uuid := (select id from public.roles where clave = 'ADMIN');
  v_rol_ope uuid := (select id from public.roles where clave = 'OPERACIONES');
  v_rol_fin uuid := (select id from public.roles where clave = 'FINANZAS');
  v_rol_anu uuid := (select id from public.roles where clave = 'ANUNCIANTE');
  v_rol_med uuid := (select id from public.roles where clave = 'MEDIO');
  v_sector uuid := (select id from public.sectores order by nombre limit 1);
  v_mun char(5) := (select codigo from public.municipios where activo order by codigo limit 1);
begin
  -- ── Preparación (owner) ────────────────────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (u_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e2.admin@amo.test', now(), now(), now()),
         (u_inv, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e2.invitado@amo.test', now(), now(), now()),
         (u_anu, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e2.anunciante@amo.test', now(), now(), now()),
         (u_ope, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'humo.e2.operaciones@amo.test', now(), now(), now());
  insert into public.anunciantes (id, razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2, municipio_codigo)
  values (an_id, 'Humo E2 S.A.S.', 'Humo E2', '900123456', '8', v_sector, 'CO', v_mun);
  insert into public.medios (id, nombre, tipo, municipio_codigo) values (me_id, 'Medio Humo E2', 'PAGINA_NOTICIAS', v_mun);
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.perfiles set rol_id = v_rol_admin, estado = 'ACTIVO', debe_cambiar_password = false where id = u_adm;
  update public.perfiles set rol_id = v_rol_ope, estado = 'ACTIVO', debe_cambiar_password = false where id = u_ope;
  update public.perfiles set rol_id = v_rol_anu, anunciante_id = an_id, estado = 'ACTIVO', debe_cambiar_password = false
  where id = u_anu;
  perform set_config('amo.transicion_autorizada', '', true);

  -- ── (r) RF-ROL-008: anti-escalada con actor ADMIN declarado por el servidor ───────────────────────────
  r := r || jsonb_build_object('r00_doce_permisos_propios',
    (select count(*) from public.permisos p where private.es_permiso_propio(p.clave)) = 12);
  r := r || jsonb_build_object('r01_puede_gestionar_anunciante', private.puede_gestionar(u_adm, u_inv, v_rol_anu));
  r := r || jsonb_build_object('r02_puede_gestionar_medio', private.puede_gestionar(u_adm, u_inv, v_rol_med));
  r := r || jsonb_build_object('r03_no_escala_a_finanzas', not private.puede_gestionar(u_adm, u_inv, v_rol_fin));
  r := r || jsonb_build_object('r04_externo_a_interno_tampoco', not private.puede_gestionar(u_adm, u_anu, v_rol_fin));

  perform set_config('amo.actor_id', u_adm::text, true);
  execute 'set local role service_role';
  begin
    update public.perfiles set rol_id = v_rol_anu, anunciante_id = an_id where id = u_inv;
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('r05_admin_asigna_rol_anunciante', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    update public.perfiles set rol_id = v_rol_med, anunciante_id = null, medio_id = me_id where id = u_inv;
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('r06_admin_cambia_a_rol_medio', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    update public.perfiles set rol_id = v_rol_fin, medio_id = null where id = u_inv;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('r07_admin_no_asigna_finanzas', case when v_e = 'AMO_ESCALADA_PERMISOS' then 'true'::jsonb else to_jsonb(v_e) end);
  execute 'reset role';
  perform set_config('amo.actor_id', '', true);

  -- r08: los roles que el ADMIN puede asignar ahora incluyen Anunciante y Medio (no Finanzas ni Superadmin).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  select string_agg(r.clave, ',' order by r.clave) into v_t
  from public.roles r where r.es_sistema and private.puede_gestionar(u_adm, null, r.id);
  r := r || jsonb_build_object('r08_roles_asignables_admin',
    case when v_t = 'ADMIN,ANUNCIANTE,MEDIO,OPERACIONES' then 'true'::jsonb else to_jsonb(v_t) end);

  -- ── (n) RF-ANU-001: dígito de verificación ────────────────────────────────────────────────────────────
  begin
    insert into public.anunciantes (razon_social, nombre_comercial, nit, digito_verificacion, sector_id, pais_iso2, municipio_codigo)
    values ('DV Errado S.A.S.', 'DV Errado', '900123456', '3', v_sector, 'CO', v_mun);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n01_dv_errado_rechazado', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    insert into public.anunciantes (razon_social, nombre_comercial, nit, sector_id, pais_iso2, municipio_codigo)
    values ('Sin DV S.A.S.', 'Sin DV', '900123456', v_sector, 'CO', v_mun);
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n02_sin_dv_rechazado', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    insert into public.anunciantes (razon_social, nombre_comercial, identificacion_extranjera, sector_id, pais_iso2, ciudad_extranjera)
    values ('Extranjera Ltda.', 'Extranjera', 'BR-123456', v_sector, 'BR', 'São Paulo');
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n03_extranjero_sin_dv', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);

  -- n04: el usuario del anunciante (JWT authenticated, sin anunciantes.editar) corrige su NIT mientras la empresa no
  -- está verificada (fase 2: atiende un rechazo), pero no después.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_anu, 'role', 'authenticated')::text, true);
  begin
    update public.anunciantes set nit = '987650001', digito_verificacion = private.digito_verificacion_nit('987650001')
    where id = an_id;
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n04_propietario_corrige_nit_sin_verificar', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);
  perform set_config('amo.transicion_autorizada', 'on', true);
  update public.anunciantes set estado_verificacion = 'VERIFICADO' where id = an_id;
  perform set_config('amo.transicion_autorizada', '', true);
  begin
    update public.anunciantes set nit = '860002183', digito_verificacion = '9' where id = an_id;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n04_propietario_no_cambia_nit_verificado', case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    update public.anunciantes set razon_social = 'Otra Razón S.A.S.' where id = an_id;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n04_propietario_no_cambia_razon_verificada', case when v_e = 'AMO_NO_AUTORIZADO' then 'true'::jsonb else to_jsonb(v_e) end);
  -- n05: …pero sí su nombre comercial (la guarda solo mira la identificación).
  begin
    update public.anunciantes set nombre_comercial = 'Humo E2 Renovado' where id = an_id;
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n05_propietario_cambia_nombre', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);
  -- n06: Operaciones (anunciantes.editar) corrige el NIT con DV correcto; con DV errado no.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u_ope, 'role', 'authenticated')::text, true);
  begin
    update public.anunciantes set nit = '860002183', digito_verificacion = '9' where id = an_id;
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n06_operaciones_corrige_nit', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    update public.anunciantes set digito_verificacion = '1' where id = an_id;
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('n07_operaciones_no_guarda_dv_errado', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  perform set_config('request.jwt.claims', '', true);

  -- n08: authenticated no ejecuta el cálculo del DV ni la guarda (se usan dentro del trigger definer).
  r := r || jsonb_build_object('n08_sin_execute_authenticated',
    not has_function_privilege('authenticated', 'private.digito_verificacion_nit(text)', 'execute')
    and not has_function_privilege('authenticated', 'private.es_permiso_propio(text)', 'execute'));

  select count(*) into v_n from public.bitacora where entidad = 'anunciantes' and entidad_id = an_id::text;
  r := r || jsonb_build_object('n09_cambios_en_bitacora', v_n >= 3);

  -- ── (c) RF-MED-001: solo categorías activas se asignan a un medio ────────────────────────────────────
  insert into public.categorias (id, nombre, activo) values
    ('00000000-0000-4000-a000-00000000e2c1', 'Humo E2 activa', true),
    ('00000000-0000-4000-a000-00000000e2c2', 'Humo E2 archivada', false);
  begin
    insert into public.medio_categorias (medio_id, categoria_id) values (me_id, '00000000-0000-4000-a000-00000000e2c1');
    v_e := 'ok';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('c01_categoria_activa_se_asigna', case when v_e = 'ok' then 'true'::jsonb else to_jsonb(v_e) end);
  begin
    insert into public.medio_categorias (medio_id, categoria_id) values (me_id, '00000000-0000-4000-a000-00000000e2c2');
    v_e := 'NO FALLÓ';
  exception when others then v_e := sqlerrm;
  end;
  r := r || jsonb_build_object('c02_categoria_archivada_rechazada', case when v_e = 'AMO_CONFIG_INVALIDA' then 'true'::jsonb else to_jsonb(v_e) end);
  -- Archivar una categoría ya asignada no toca al medio: la conserva.
  update public.categorias set activo = false where id = '00000000-0000-4000-a000-00000000e2c1';
  r := r || jsonb_build_object('c03_asignada_se_conserva_al_archivar',
    exists (select 1 from public.medio_categorias where medio_id = me_id and categoria_id = '00000000-0000-4000-a000-00000000e2c1'));

  perform set_config('humo.resultado', r::text, true);
end
$humo$;

select count(*) filter (where value = 'true'::jsonb) as pasan, count(*) as total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') as fallan
from jsonb_each(current_setting('humo.resultado')::jsonb);

rollback;
