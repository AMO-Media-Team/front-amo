-- Advisor multiple_permissive_policies (WARN) en perfiles/SELECT: las permisivas «select propio» y
-- «select interno» de identidad_rbac se evalúan por separado en cada consulta. Se unifican en una sola
-- permisiva equivalente (las permisivas se combinan con OR); la restrictiva con excepción no cambia.
drop policy "perfiles: select propio" on public.perfiles;
drop policy "perfiles: select interno" on public.perfiles;

create policy "perfiles: select propio o interno" on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or (select private.tiene_permiso('usuarios.ver')));

do $$ begin
  assert (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'perfiles' and cmd = 'SELECT' and permissive = 'PERMISSIVE') = 1,
         'perfiles: se esperaba una sola permisiva de SELECT';
end $$;
