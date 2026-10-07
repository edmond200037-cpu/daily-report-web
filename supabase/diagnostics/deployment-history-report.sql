-- Read-only deployment diagnostic. No application records or credentials are selected.
-- A matching function body alone is insufficient to repair migration history.
begin transaction read only;
with expected(name, body_md5) as (values ('collaboration_apply_array','d3a68a72519d57e91d3e37c01da11ece'),
('collaboration_apply_change','46359be77ee8bda15dafcf8082af7640'),
('apply_daily_field_mutation','61524b13467218cb28d3fa19bceb1812'),
('apply_water_field_mutation','c03a0dc81a64f736de47ce1743e4de2b'),
('apply_memory_entry_mutation','12618bb378a3e2463152cb17f067c780'))
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
