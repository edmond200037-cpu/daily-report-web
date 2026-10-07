import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Compare original migration function bodies without executing migration DDL.
const files = [
  '202609230001_field_collaboration.sql',
  '202609230002_memory_entries_sync.sql',
];
const expected = [];
for (const file of files) {
  const sql = (await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')).replace(/\r/g, '');
  const pattern = /create or replace function public\.([a-z_]+)\([\s\S]*?as \$\$([\s\S]*?)\$\$;/gi;
  for (const match of sql.matchAll(pattern)) {
    expected.push(`('${match[1]}','${createHash('md5').update(match[2]).digest('hex')}')`);
  }
}
if (expected.length !== 5) throw new Error('Expected five original migration functions; inspect parser before using report.');
const query = `-- Read-only deployment diagnostic. No application records or credentials are selected.
-- A matching function body alone is insufficient to repair migration history.
begin transaction read only;
with expected(name, body_md5) as (values ${expected.join(',\n')})
select jsonb_pretty(jsonb_build_object(
  'migration_history', (select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations),
  'functions', (select jsonb_agg(jsonb_build_object(
    'name',e.name,'signature',p.oid::regprocedure::text,
    'matches_original_body',md5(replace(p.prosrc,chr(13),''))=e.body_md5,
    'definition',pg_get_functiondef(p.oid),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE')
  ) order by e.name) from expected e left join (pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public') on p.proname=e.name),
  'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('collaboration_tombstones','memory_snapshot_migrations','memory_learning_events','memory_entries')),
  'columns', (select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by table_name,ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('collaboration_tombstones','memory_snapshot_migrations','memory_learning_events')),
  'constraints', (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c where c.conrelid in (to_regclass('public.collaboration_tombstones'),to_regclass('public.memory_snapshot_migrations'),to_regclass('public.memory_learning_events'),to_regclass('public.memory_entries'))),
  'indexes', (select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef)) from pg_indexes where schemaname='public' and tablename in ('collaboration_tombstones','memory_snapshot_migrations','memory_learning_events','memory_entries')),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('collaboration_tombstones','memory_snapshot_migrations','memory_learning_events','memory_entries')),
  'realtime_site_changes',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='site_changes'),
  'legacy_snapshot_authenticated_execute',has_function_privilege('authenticated','public.apply_memory_snapshot_mutation(uuid,uuid,bigint,jsonb)','EXECUTE')
)) as deployment_history_report;
rollback;
`;
await writeFile(new URL('../supabase/diagnostics/deployment-history-report.sql', import.meta.url), query);
console.log('Prepared read-only deployment-history-report.sql with five expected function hashes.');
