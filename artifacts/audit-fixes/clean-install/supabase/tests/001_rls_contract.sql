begin;

select plan(18);
select has_table('public', 'site_members', 'site_members exists');
select has_table('public', 'daily_drafts', 'daily_drafts exists');
select has_table('public', 'memory_entries', 'memory_entries exists');
select has_table('public', 'water_logs', 'water_logs exists');
select has_table('public', 'memory_snapshots', 'memory_snapshots exists');
select has_table('public', 'memory_snapshot_migrations', 'memory migration audit exists');
select has_table('public', 'memory_learning_events', 'learning events exist');
select has_table('public', 'water_snapshots', 'water_snapshots exists');
select policies_are('public', 'sites', array['sites_select_member', 'sites_update_owner'], 'sites policies are explicit');
select policies_are('public', 'daily_drafts', array['draft_read'], 'draft writes are RPC-only');
select policies_are('public', 'memory_snapshots', array['memory_snapshot_read'], 'memory snapshot writes are RPC-only');
select policies_are('public', 'memory_entries', array['memory_read'], 'entry writes are RPC-only');
select policies_are('public', 'water_snapshots', array['water_snapshot_read'], 'water snapshot writes are RPC-only');
select function_privs_are('public', 'create_site', array['text'], 'authenticated', array['EXECUTE'], 'authenticated can create a site');
select function_privs_are('public', 'approve_site_member', array['uuid','text'], 'anon', array[]::text[], 'anonymous users cannot approve members');
select function_privs_are('public', 'apply_memory_entry_mutation', array['uuid','uuid','bigint','jsonb'], 'authenticated', array['EXECUTE'], 'members can invoke entry RPC; RPC checks role');
select function_privs_are('public', 'apply_memory_entry_mutation', array['uuid','uuid','bigint','jsonb'], 'anon', array[]::text[], 'anonymous users cannot invoke entry RPC');
select function_privs_are('public', 'apply_memory_snapshot_mutation', array['uuid','uuid','bigint','jsonb'], 'authenticated', array[]::text[], 'old snapshot writes are disabled');

select * from finish();
rollback;
