-- Pruebas de humo de 20261001053648_roles_permisos_aplicables (requisito 1 de la Fase 4a): un rol externo
-- personalizado no recibe permisos internos, un permiso no se reasigna con UPDATE y un rol con permisos no aplicables
-- no cambia de tipo. Se ejecuta como owner (MCP execute_sql o psql) en una transacción que SIEMPRE se revierte; la
-- preparación simula el servidor (service_role con actor SUPERADMIN). Cada prueba deja `true` si pasa o lo observado.
begin;

do $p$
declare
  r jsonb := '{}';
  v_sup uuid := (select p.id from public.perfiles p join public.roles x on x.id = p.rol_id
                 where x.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and not p.es_demo limit 1);
  v_rol_anu uuid := '00000000-0000-4000-a000-00000000f001';
  v_rol_adm uuid := '00000000-0000-4000-a000-00000000f002';
  v_n int;
begin
  insert into public.roles (id, clave, nombre, tipo, requiere_mfa) values
    (v_rol_anu, 'PRUEBA_ANU_EXT', 'Prueba externo', 'ANUNCIANTE', false),
    (v_rol_adm, 'PRUEBA_INT', 'Prueba interno', 'ADMIN', true);
  perform set_config('amo.actor_id', v_sup::text, true);
  execute 'set local role service_role';
  begin
    insert into public.rol_permisos (rol_id, permiso_clave) values (v_rol_anu, 'usuarios.ver');
    r := r || jsonb_build_object('r1_externo_no_recibe_permiso_interno', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('r1_externo_no_recibe_permiso_interno', sqlerrm = 'AMO_PERMISO_NO_APLICABLE');
  end;
  insert into public.rol_permisos (rol_id, permiso_clave) values (v_rol_anu, 'campanas.gestionar_propias');
  r := r || jsonb_build_object('r2_externo_recibe_permiso_de_su_portal', true);
  insert into public.rol_permisos (rol_id, permiso_clave) values (v_rol_adm, 'usuarios.ver'), (v_rol_adm, 'campanas.ver');
  r := r || jsonb_build_object('r3_interno_recibe_permisos', true);
  begin
    update public.rol_permisos set rol_id = v_rol_anu where rol_id = v_rol_adm and permiso_clave = 'usuarios.ver';
    r := r || jsonb_build_object('r4_no_se_reasigna_un_permiso', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('r4_no_se_reasigna_un_permiso', sqlerrm = 'AMO_NO_AUTORIZADO');
  end;
  update public.rol_permisos set otorgado_por = null where rol_id = v_rol_adm;
  get diagnostics v_n = row_count;
  r := r || jsonb_build_object('r5_otorgado_por_a_null_permitido', v_n = 2);
  begin
    update public.roles set tipo = 'MEDIO', requiere_mfa = false where id = v_rol_adm;
    r := r || jsonb_build_object('r6_no_cambia_tipo_con_permisos_no_aplicables', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('r6_no_cambia_tipo_con_permisos_no_aplicables', sqlerrm = 'AMO_PERMISO_NO_APLICABLE');
  end;
  execute 'reset role';
  begin
    insert into public.rol_permisos (rol_id, permiso_clave) values (v_rol_anu, 'pagos.registrar');
    r := r || jsonb_build_object('r7_tampoco_el_owner', 'NO FALLÓ');
  exception when others then
    r := r || jsonb_build_object('r7_tampoco_el_owner', sqlerrm = 'AMO_PERMISO_NO_APLICABLE');
  end;
  perform set_config('prueba.roles', r::text, true);
end $p$;
select count(*) filter (where value = 'true'::jsonb) pasan, count(*) total,
       coalesce(jsonb_object_agg(key, value) filter (where value <> 'true'::jsonb), '{}') fallan
from jsonb_each(current_setting('prueba.roles')::jsonb);

rollback;
