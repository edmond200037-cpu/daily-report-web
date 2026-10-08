-- Read-only. Run in the SQL Editor BEFORE and AFTER applying 20261008150000_revoke_anon_function_access.sql.
-- After the migration, anon_execute must be false for every row; authenticated_execute must be
-- unchanged for the functions the app calls.
begin transaction read only;
select p.oid::regprocedure::text as function,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by anon_execute desc, function;

-- Is the maintenance migration already recorded? (If it is, edits to that file do not run;
-- only the new revoke migration takes effect.)
select version, name from supabase_migrations.schema_migrations
where version in ('20261006143609', '20261008150000') order by version;
rollback;
