-- Remove direct anonymous (and PUBLIC) EXECUTE from every function in the public schema.
--
-- Supabase grants EXECUTE on new functions straight to anon/authenticated via default
-- privileges, so earlier `revoke ... from public` statements never removed anon access.
-- Anonymous callers could therefore reach the write RPCs (which take a per-site advisory
-- lock) and `pull_site_changes`. The application only calls these as a signed-in member.
--
-- Authenticated access is preserved exactly as it is today; extension-owned functions are
-- left alone. Safe to run more than once. No explicit transaction: the CLI wraps the file.
do $$
declare
  f record;
  authenticated_had_access boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    -- Read before revoking: access inherited through PUBLIC counts for authenticated too.
    authenticated_had_access := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    execute format('revoke all on function %s from public, anon', f.signature);
    if authenticated_had_access then
      execute format('grant execute on function %s to authenticated', f.signature);
    end if;
  end loop;
end $$;

-- Functions created from now on must not become anonymously callable by default.
-- PostgreSQL grants EXECUTE to PUBLIC on every new function; that global default can only be
-- removed without `in schema` (a schema-scoped revoke cannot cancel a global default). New
-- functions must now be granted to `authenticated` explicitly, as the existing migrations do.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

notify pgrst, 'reload schema';
