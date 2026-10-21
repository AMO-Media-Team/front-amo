-- Migración 8 · notificaciones (docs/modelo-datos.md §3.7, §5.8, §9.1, §11)
-- Tabla de notificaciones in-app con RLS propia (solo el destinatario lee y marca), RPC de lectura (bandeja con
-- cursor, contador de no leídas y marcado), private.notificar definitiva (redefine el stub de M7 con la misma
-- firma), triggers de notificación por transición (ofertas, asignaciones, publicaciones, métricas, verificaciones
-- de cuenta, liquidaciones y disputas), alerta de seguridad PAIS_INUSUAL (al usuario y a los SUPERADMIN) y
-- Realtime Broadcast privado por usuario (§9.1, COULD: canal `usuario:<uuid>` con política en realtime.messages;
-- no se crean objetos en el esquema realtime ni se toca su RLS). La bandeja sigue funcionando por sondeo.
-- No auditada (volumen, §3.7): sin z_auditar.

-- 1. Tabla
create table public.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  tipo text not null constraint notificaciones_tipo_chk check (tipo ~ '^[a-z_]+(\.[a-z_]+)+$'),
  titulo text not null constraint notificaciones_titulo_chk check (char_length(titulo) between 1 and 120),
  mensaje text not null constraint notificaciones_mensaje_chk check (char_length(mensaje) between 1 and 500),
  entidad text constraint notificaciones_entidad_chk check (char_length(entidad) <= 60),
  entidad_id text constraint notificaciones_entidad_id_chk check (char_length(entidad_id) <= 80),
  url text constraint notificaciones_url_chk check (url ~ '^/[^/]' and char_length(url) <= 300 and position('..' in url) = 0),
  prioridad smallint not null default 0 constraint notificaciones_prioridad_chk check (prioridad between 0 and 2),
  canal public.notificacion_canal not null default 'APP',
  leida boolean not null default false,
  leida_at timestamptz,
  enviada_email_at timestamptz,
  es_demo boolean not null default false,
  created_at timestamptz not null default private.ahora(),
  constraint notificaciones_leida_chk check (leida or leida_at is null)
);
create index notificaciones_usuario_idx on public.notificaciones (usuario_id, id desc);
create index notificaciones_no_leidas_idx on public.notificaciones (usuario_id) where not leida;
create index notificaciones_created_at_brin on public.notificaciones using brin (created_at);
create index notificaciones_es_demo_idx on public.notificaciones (es_demo) where es_demo;
-- Deduplicación de recordatorios del cron: (tipo, entidad, destinatario) en una ventana.
create index notificaciones_dedupe_idx on public.notificaciones (tipo, entidad_id, usuario_id, created_at desc);

-- 2. Utilidades internas (sin grants: solo las usan funciones definer)

create function private.usuarios_anunciante(p_anunciante_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(p.id order by p.id), '{}') from public.perfiles p
  where p.anunciante_id = p_anunciante_id and p.estado = 'ACTIVO' and p.deleted_at is null $$;
revoke all on function private.usuarios_anunciante(uuid) from public, anon, authenticated;

create function private.formato_fecha(p_t timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_t at time zone 'America/Bogota', 'DD/MM/YYYY HH24:MI') $$;
revoke all on function private.formato_fecha(timestamptz) from public, anon, authenticated;

create function private.formato_cop(p_valor numeric) returns text
language sql immutable set search_path = '' as $$
  select '$ ' || replace(to_char(round(coalesce(p_valor, 0)), 'FM999,999,999,999,990'), ',', '.') $$;
revoke all on function private.formato_cop(numeric) from public, anon, authenticated;

create function private.nombre_plataforma(p_plataforma public.plataforma) returns text
language sql immutable set search_path = '' as $$
  select case p_plataforma when 'INSTAGRAM' then 'Instagram' when 'FACEBOOK' then 'Facebook' when 'TIKTOK' then 'TikTok' end $$;
revoke all on function private.nombre_plataforma(public.plataforma) from public, anon, authenticated;

-- 3. Notificar (redefine el stub de M7; misma firma). Renderiza la plantilla APP activa sustituyendo {{var}} con
-- p_datos (si trae oferta_id y no oferta, completa el título de la oferta); variables ausentes ⇒ «—». Inserta una
-- fila por destinatario ACTIVO (sin duplicados). El correo lo envía la app (cola: enviada_email_at null + plantilla
-- EMAIL activa). Con modo_carga no notifica (§10.1).
create or replace function private.notificar(p_usuarios uuid[], p_tipo text, p_datos jsonb, p_entidad text, p_entidad_id text,
                                             p_url text, p_prioridad smallint default 0)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_plantilla public.plantillas_notificacion;
  v_datos jsonb := coalesce(p_datos, '{}');
  v_titulo text;
  v_mensaje text;
  v_clave text;
  v_valor text;
  v_n integer;
begin
  if private.modo_carga() or coalesce(cardinality(p_usuarios), 0) = 0 then return 0; end if;
  select * into v_plantilla from public.plantillas_notificacion x
  where x.clave = p_tipo and x.canal = 'APP' and x.activa;
  if not found then return 0; end if;
  if v_datos ? 'oferta_id' and not v_datos ? 'oferta' then
    v_datos := v_datos || jsonb_build_object('oferta',
      (select o.titulo from public.ofertas o where o.id = (v_datos ->> 'oferta_id')::uuid));
  end if;
  v_titulo := v_plantilla.nombre;
  v_mensaje := v_plantilla.cuerpo;
  for v_clave, v_valor in select e.key, coalesce(e.value #>> '{}', '—') from jsonb_each(v_datos) e loop
    v_titulo := replace(v_titulo, '{{' || v_clave || '}}', v_valor);
    v_mensaje := replace(v_mensaje, '{{' || v_clave || '}}', v_valor);
  end loop;
  v_titulo := btrim(regexp_replace(v_titulo, '\{\{[a-z_]+\}\}', '—', 'g'));
  v_mensaje := btrim(regexp_replace(v_mensaje, '\{\{[a-z_]+\}\}', '—', 'g'));
  v_titulo := case when char_length(v_titulo) > 120 then left(v_titulo, 119) || '…' else v_titulo end;
  v_mensaje := case when char_length(v_mensaje) > 500 then left(v_mensaje, 499) || '…' else v_mensaje end;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, url, prioridad, es_demo)
  select p.id, p_tipo, v_titulo, v_mensaje, left(p_entidad, 60), left(p_entidad_id, 80),
         case when p_url ~ '^/[^/]' and char_length(p_url) <= 300 and position('..' in p_url) = 0 then p_url end,
         least(greatest(coalesce(p_prioridad, 0), 0), 2)::smallint, p.es_demo
  from public.perfiles p
  where p.id = any (p_usuarios) and p.estado = 'ACTIVO' and p.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.notificar(uuid[], text, jsonb, text, text, text, smallint) from public, anon, authenticated, service_role;

-- 4. Notificaciones por transición (AFTER UPDATE de la columna de estado; disputas también AFTER INSERT).
-- Corre dentro de private.aplicar_transicion: amo.motivo trae el motivo de la transición.
create function private.notificar_transicion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text := nullif(current_setting('amo.motivo', true), '');
  v_asig public.asignaciones;
  v_destinos uuid[];
  v_cuenta record;
begin
  if private.modo_carga() then return null; end if;
  case tg_table_name
    when 'ofertas' then
      if old.estado = 'EN_REVISION' and new.estado = 'DEVUELTA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.devuelta',
          jsonb_build_object('oferta', new.titulo, 'motivo', coalesce(new.comentario_moderacion, v_motivo, 'sin observaciones')),
          'ofertas', new.id::text, null, 1::smallint);
      elsif old.estado = 'EN_REVISION' and new.estado = 'PUBLICADA' then
        perform private.notificar(private.usuarios_anunciante(new.anunciante_id), 'oferta.publicada',
          jsonb_build_object('oferta', new.titulo), 'ofertas', new.id::text, null, 0::smallint);
        select coalesce(array_agg(distinct u.id), '{}') into v_destinos
        from public.medios m
        cross join lateral unnest(private.usuarios_medio(m.id)) u (id)
        where m.estado = 'VERIFICADO' and m.deleted_at is null and private.oferta_visible_para(new.id, m.id);
        perform private.notificar(v_destinos, 'oferta.nueva_elegible',
          jsonb_build_object('anunciante', (select coalesce(a.nombre_comercial, a.razon_social) from public.anunciantes a
                                            where a.id = new.anunciante_id),
                             'oferta', new.titulo, 'plataforma', private.nombre_plataforma(new.plataforma),
                             'fecha_limite', private.formato_fecha(new.fecha_limite_aceptacion)),
          'ofertas', new.id::text, null, 1::smallint);
      end if;
    when 'asignaciones' then
      if new.estado = 'VENCIDA_SIN_PUBLICAR' then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'asignacion.vencida',
          jsonb_build_object('oferta_id', new.oferta_id,
                             'plazo_disputa', private.formato_fecha(coalesce(new.vencida_at, private.ahora())
                               + make_interval(hours => private.config_entero('disputas.plazo_vencida_horas')))),
          'asignaciones', new.id::text, null, 2::smallint);
      elsif new.estado = 'CANCELADA' then
        perform private.notificar(private.usuarios_medio(new.medio_id) || private.usuarios_anunciante(new.anunciante_id),
          'asignacion.cancelada', jsonb_build_object('oferta_id', new.oferta_id, 'motivo', coalesce(new.motivo, v_motivo, 'sin motivo')),
          'asignaciones', new.id::text, null, 1::smallint);
      end if;
    when 'publicaciones' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion = 'RECHAZADA' then
        select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'evidencia.rechazada',
          jsonb_build_object('oferta_id', v_asig.oferta_id, 'motivo', coalesce(new.observaciones, v_motivo, 'sin observaciones')),
          'asignaciones', new.asignacion_id::text, null, 2::smallint);
      end if;
    when 'metricas' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion = 'RECHAZADA' then
        select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'metricas.rechazadas',
          jsonb_build_object('oferta_id', v_asig.oferta_id, 'corte', new.corte::text,
                             'motivo', coalesce(new.observaciones, v_motivo, 'sin observaciones')),
          'asignaciones', new.asignacion_id::text, null, 2::smallint);
      end if;
    when 'verificaciones_cuenta' then
      if old.estado_validacion = 'PENDIENTE' and new.estado_validacion in ('APROBADA', 'RECHAZADA') then
        select c.plataforma, c.handle::text as handle into v_cuenta from public.cuentas_sociales c where c.id = new.cuenta_social_id;
        perform private.notificar(private.usuarios_medio(new.medio_id), 'cuenta.verificacion_resuelta',
          jsonb_build_object('plataforma', private.nombre_plataforma(v_cuenta.plataforma), 'handle', v_cuenta.handle,
                             'resultado', case when new.estado_validacion = 'APROBADA' then 'aprobada'
                                               else 'rechazada (' || coalesce(new.observaciones, v_motivo, 'sin observaciones') || ')' end),
          'cuentas_sociales', new.cuenta_social_id::text, null, 1::smallint);
      end if;
    when 'liquidaciones' then
      if old.estado = 'APROBADA' and new.estado = 'PAGADA' then
        perform private.notificar(private.usuarios_medio(new.medio_id), 'liquidacion.pagada',
          jsonb_build_object('periodo', to_char(new.periodo_inicio, 'DD/MM/YYYY') || ' al ' || to_char(new.periodo_fin, 'DD/MM/YYYY'),
                             'monto_neto', private.formato_cop(new.monto_neto)),
          'liquidaciones', new.id::text, null, 1::smallint);
      end if;
    when 'disputas' then
      select * into v_asig from public.asignaciones a where a.id = new.asignacion_id;
      if tg_op = 'INSERT' then
        v_destinos := case new.parte
          when 'MEDIO' then private.usuarios_anunciante(v_asig.anunciante_id)
          when 'ANUNCIANTE' then private.usuarios_medio(v_asig.medio_id)
          else private.usuarios_medio(v_asig.medio_id) || private.usuarios_anunciante(v_asig.anunciante_id) end;
        perform private.notificar(v_destinos, 'disputa.abierta',
          jsonb_build_object('oferta_id', v_asig.oferta_id,
                             'motivo', case new.motivo when 'INCUMPLIMIENTO' then 'incumplimiento' when 'METRICAS' then 'métricas'
                                         when 'CONTENIDO' then 'contenido' when 'PERMANENCIA' then 'permanencia'
                                         when 'PAGO' then 'pago' else 'otro motivo' end),
          'disputas', new.id::text, null, 2::smallint);
      elsif new.estado in ('RESUELTA', 'DESCARTADA') then
        perform private.notificar(private.usuarios_medio(v_asig.medio_id) || private.usuarios_anunciante(v_asig.anunciante_id),
          'disputa.resuelta',
          jsonb_build_object('oferta_id', v_asig.oferta_id,
                             'resultado', coalesce(new.resolucion, case when new.estado = 'DESCARTADA' then 'descartada' end, v_motivo)),
          'disputas', new.id::text, null, 1::smallint);
      end if;
    else
      null;
  end case;
  return null;
end $$;
revoke all on function private.notificar_transicion() from public, anon, authenticated, service_role;

create trigger trg_ofertas_z_notificar after update of estado on public.ofertas
  for each row when (old.estado is distinct from new.estado) execute function private.notificar_transicion();
create trigger trg_asignaciones_z_notificar after update of estado on public.asignaciones
  for each row when (old.estado is distinct from new.estado) execute function private.notificar_transicion();
create trigger trg_publicaciones_z_notificar after update of estado_validacion on public.publicaciones
  for each row when (old.estado_validacion is distinct from new.estado_validacion) execute function private.notificar_transicion();
create trigger trg_metricas_z_notificar after update of estado_validacion on public.metricas
  for each row when (old.estado_validacion is distinct from new.estado_validacion) execute function private.notificar_transicion();
create trigger trg_verificaciones_cuenta_z_notificar after update of estado_validacion on public.verificaciones_cuenta
  for each row when (old.estado_validacion is distinct from new.estado_validacion) execute function private.notificar_transicion();
create trigger trg_liquidaciones_z_notificar after update of estado on public.liquidaciones
  for each row when (old.estado is distinct from new.estado) execute function private.notificar_transicion();
create trigger trg_disputas_z_notificar after update of estado on public.disputas
  for each row when (old.estado is distinct from new.estado) execute function private.notificar_transicion();
create trigger trg_disputas_z_notificar_alta after insert on public.disputas
  for each row execute function private.notificar_transicion();

-- 5. Alerta de seguridad: LOGIN_EXITOSO marcado PAIS_INUSUAL (registrar_acceso_srv) ⇒ aviso al usuario y a los
-- SUPERADMIN activos (§5.5). Los accesos solo los insertan funciones definer.
insert into public.plantillas_notificacion (clave, canal, nombre, asunto, cuerpo, variables) values
  ('seguridad.alerta_pais_inusual', 'APP', 'Alerta: ingreso desde un país inusual', null,
   '{{usuario}} ingresó a AMO desde {{pais}} el {{fecha}}, un país que no es habitual para su cuenta. Revisa el registro de accesos.',
   array['usuario', 'pais', 'fecha'])
on conflict (clave, canal) do nothing;

create function private.fn_accesos_alertar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pais text; v_fecha text; v_usuario text; v_admins uuid[];
begin
  if private.modo_carga() or new.usuario_id is null then return null; end if;
  select coalesce(pa.nombre, new.pais_iso2) into v_pais from public.paises pa where pa.iso2 = new.pais_iso2;
  v_pais := coalesce(v_pais, new.pais_iso2, 'un país desconocido');
  v_fecha := private.formato_fecha(new.created_at);
  perform private.notificar(array[new.usuario_id], 'seguridad.pais_inusual',
    jsonb_build_object('pais', v_pais, 'fecha', v_fecha), 'accesos', new.id::text, '/cuenta/seguridad', 2::smallint);
  select coalesce(nullif(btrim(p.nombre), ''), private.enmascarar(p.email::text)) into v_usuario
  from public.perfiles p where p.id = new.usuario_id;
  select coalesce(array_agg(p.id), '{}') into v_admins
  from public.perfiles p join public.roles r on r.id = p.rol_id
  where r.clave = 'SUPERADMIN' and p.estado = 'ACTIVO' and p.deleted_at is null;
  perform private.notificar(v_admins, 'seguridad.alerta_pais_inusual',
    jsonb_build_object('usuario', coalesce(v_usuario, 'Un usuario'), 'pais', v_pais, 'fecha', v_fecha),
    'accesos', new.id::text, '/administracion/accesos', 2::smallint);
  return null;
end $$;
revoke all on function private.fn_accesos_alertar() from public, anon, authenticated, service_role;

create trigger trg_accesos_z_alertar after insert on public.accesos
  for each row when (new.es_sospechoso and new.motivo_sospecha = 'PAIS_INUSUAL')
  execute function private.fn_accesos_alertar();

-- 6. Lectura: leida_at lo fija la BD (no el reloj del cliente) y solo cambia con leida.
create function private.fn_notificaciones_lectura() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.modo_carga() then return new; end if;
  if new.leida is distinct from old.leida then
    new.leida_at := case when new.leida then private.ahora() end;
  else
    new.leida_at := old.leida_at;
  end if;
  return new;
end $$;
revoke all on function private.fn_notificaciones_lectura() from public, anon, authenticated, service_role;

create trigger trg_notificaciones_b_lectura before update on public.notificaciones
  for each row execute function private.fn_notificaciones_lectura();

-- 7. Realtime Broadcast privado (§9.1): un mensaje por notificación al tópico del destinatario. realtime.send
-- captura sus propios errores (WARNING), así que nunca aborta la transacción de negocio.
create function private.fn_notificacion_realtime() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.modo_carga() then return null; end if;
  perform realtime.send(
    jsonb_build_object('id', new.id, 'tipo', new.tipo, 'titulo', new.titulo, 'prioridad', new.prioridad,
                       'no_leidas', (select count(*) from public.notificaciones n
                                     where n.usuario_id = new.usuario_id and not n.leida)),
    'notificacion', 'usuario:' || new.usuario_id::text, true);
  return null;
end $$;
revoke all on function private.fn_notificacion_realtime() from public, anon, authenticated, service_role;

create trigger trg_notificaciones_z_realtime after insert on public.notificaciones
  for each row execute function private.fn_notificacion_realtime();

-- Solo lectura del tópico propio (sin política INSERT: los clientes no emiten en el canal).
drop policy if exists "realtime: tópico propio" on realtime.messages;
create policy "realtime: tópico propio" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'usuario:' || (select auth.uid())::text
         and realtime.messages.extension = 'broadcast'
         and (select private.acceso_valido()));

-- 8. RPC del usuario (invoker: la RLS limita a las propias)
create function public.notificaciones_no_leidas() returns integer
language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from public.notificaciones n
  where n.usuario_id = (select auth.uid()) and not n.leida $$;
revoke all on function public.notificaciones_no_leidas() from public, anon, authenticated;
grant execute on function public.notificaciones_no_leidas() to authenticated;

create function public.mis_notificaciones(p_limite integer default 20, p_antes_id bigint default null,
                                          p_solo_no_leidas boolean default false)
returns table (id bigint, tipo text, titulo text, mensaje text, entidad text, entidad_id text, url text,
               prioridad smallint, leida boolean, leida_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select n.id, n.tipo, n.titulo, n.mensaje, n.entidad, n.entidad_id, n.url, n.prioridad, n.leida, n.leida_at, n.created_at
  from public.notificaciones n
  where n.usuario_id = (select auth.uid())
    and (p_antes_id is null or n.id < p_antes_id)
    and (not coalesce(p_solo_no_leidas, false) or not n.leida)
  order by n.id desc
  limit least(greatest(coalesce(p_limite, 20), 1), 100) $$;
revoke all on function public.mis_notificaciones(integer, bigint, boolean) from public, anon, authenticated;
grant execute on function public.mis_notificaciones(integer, bigint, boolean) to authenticated;

-- p_ids null = todas las propias.
create function public.marcar_notificaciones_leidas(p_ids bigint[] default null, p_leida boolean default true)
returns integer
language plpgsql volatile security invoker set search_path = '' as $$
declare v_n integer;
begin
  update public.notificaciones n set leida = coalesce(p_leida, true)
  where n.usuario_id = (select auth.uid())
    and (p_ids is null or n.id = any (p_ids))
    and n.leida is distinct from coalesce(p_leida, true);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.marcar_notificaciones_leidas(bigint[], boolean) from public, anon, authenticated;
grant execute on function public.marcar_notificaciones_leidas(bigint[], boolean) to authenticated;

-- 9. RLS y grants
alter table public.notificaciones enable row level security;
create policy "notificaciones: acceso válido" on public.notificaciones as restrictive for all to authenticated
  using ((select private.acceso_valido())) with check ((select private.acceso_valido()));
create policy "notificaciones: select propio" on public.notificaciones for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy "notificaciones: update propio" on public.notificaciones for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
grant select, update (leida, leida_at) on public.notificaciones to authenticated;
grant select, insert, update, delete on public.notificaciones to service_role;

-- 10. Verificación
do $$ begin
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname in ('public','private') and has_function_privilege('anon', p.oid, 'execute')),
         'anon tiene EXECUTE sobre alguna función de public/private';
  assert not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
                       and p.proname <> all (private.lista_blanca_authenticated())),
         'authenticated tiene EXECUTE sobre una función private fuera de la lista blanca';
  assert not has_function_privilege('service_role', 'private.notificar(uuid[], text, jsonb, text, text, text, smallint)', 'execute')
     and not has_function_privilege('authenticated', 'private.notificar(uuid[], text, jsonb, text, text, text, smallint)', 'execute'),
         'private.notificar no debe ser ejecutable por roles de la API';
  assert (select relrowsecurity from pg_class where oid = 'public.notificaciones'::regclass), 'notificaciones sin RLS';
  assert exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notificaciones' and permissive = 'RESTRICTIVE'),
         'notificaciones sin restrictiva';
  assert not has_table_privilege('anon', 'public.notificaciones', 'select'), 'anon lee notificaciones';
  assert not has_table_privilege('authenticated', 'public.notificaciones', 'insert')
     and not has_table_privilege('authenticated', 'public.notificaciones', 'delete')
     and not has_column_privilege('authenticated', 'public.notificaciones', 'mensaje', 'update')
     and not has_column_privilege('authenticated', 'public.notificaciones', 'usuario_id', 'update'),
         'authenticated con privilegios de escritura indebidos en notificaciones';
  assert exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                   and policyname = 'realtime: tópico propio' and cmd = 'SELECT'),
         'falta la política de realtime.messages';
  assert (select count(*) from pg_trigger where tgname like 'trg\_%\_z\_notificar%' and not tgisinternal) = 8,
         'faltan triggers de notificación por transición';
  assert exists (select 1 from public.plantillas_notificacion where clave = 'seguridad.alerta_pais_inusual' and canal = 'APP'),
         'falta la plantilla de alerta a superadministradores';
end $$;
