import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Pass the exported deployment_history_report JSON file.');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const normalize = value => value.replace(/\r/g, '');
const hash = value => createHash('md5').update(normalize(value)).digest('hex');
const quote = value => `'${value.replace(/'/g, "''")}'`;
const originals = new Map();
for (const file of ['202609230001_field_collaboration.sql', '202609230002_memory_entries_sync.sql', '20260930040002_memory_application_workflow.sql']) {
  const sql = normalize(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  for (const match of sql.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?as \$\$([\s\S]*?)\$\$;/gi)) {
    const accepted = originals.get(match[1]) ?? new Set();
    accepted.add(hash(match[2])); originals.set(match[1], accepted);
  }
}
assert.equal(report.functions.length, 5);
const functionChecks = report.functions.map(f => {
  const body = f.definition.match(/AS \$function\$([\s\S]*?)\$function\$/)?.[1];
  assert.ok(body && originals.get(f.name)?.has(hash(body)), `Unreviewed function body: ${f.name}`);
  assert.equal(f.authenticated_execute, true);
  return `(${quote(`public.${f.signature}`)},${quote(hash(f.definition))})`;
});
const tables = ['collaboration_tombstones', 'memory_learning_events', 'memory_snapshot_migrations'];
const affected = value => tables.includes(value.table ?? value.tablename);
const columns = report.columns.filter(affected);
const constraints = report.constraints.filter(affected);
const indexes = report.indexes.filter(affected);
const policies = report.policies.filter(affected);
assert.equal(columns.length, 16); assert.equal(constraints.length, 8);
assert.equal(indexes.length, 3); assert.equal(policies.length, 3);
assert.ok(report.tables.every(t => t.rls));
assert.equal(report.realtime_site_changes, true);
assert.equal(report.legacy_snapshot_authenticated_execute, false);
// Only these baseline versions are repaired. Later files must still run through CI.
assert.deepEqual(report.migration_history.map(v => v.version), Array.from({ length: 6 }, (_, i) => `20260921000${i + 1}`));
const expected = quote(JSON.stringify({ columns, constraints, indexes, policies }));
const sql = `-- Reviewed baseline repair for construction-daily-report (mhvzvranpywpnawuxina).
-- Execute the ENTIRE file. Guard failure rolls back every change.
-- Does not replay old migrations, overwrite functions, or update application records.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('daily-report:history-repair:20260923',0));
lock table supabase_migrations.schema_migrations in share row exclusive mode;
lock table public.collaboration_tombstones, public.memory_learning_events,
  public.memory_snapshot_migrations, public.memory_snapshots, public.memory_entries in share mode;

do $repair$
declare
  expected jsonb := ${expected}::jsonb;
  actual jsonb; check_row record; snapshot public.memory_snapshots;
  ledger public.memory_snapshot_migrations; store_name text; item jsonb;
  expected_payload jsonb; source_count integer;
begin
  for check_row in select * from (values ${functionChecks.join(',\n')}) as checks(signature,definition_md5) loop
    if to_regprocedure(check_row.signature) is null or
      md5(replace(pg_get_functiondef(to_regprocedure(check_row.signature)),chr(13),'')) is distinct from check_row.definition_md5 then
      raise exception 'Function changed since reviewed report: %',check_row.signature;
    end if;
    if not has_function_privilege('authenticated',check_row.signature,'EXECUTE') then
      raise exception 'Authenticated grant missing: %',check_row.signature;
    end if;
  end loop;
  if exists(select 1 from pg_class c where c.oid in
    ('public.collaboration_tombstones'::regclass,'public.memory_learning_events'::regclass,
     'public.memory_snapshot_migrations'::regclass,'public.memory_entries'::regclass) and not c.relrowsecurity) then
    raise exception 'RLS changed since reviewed report';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable,'default',column_default)),'[]'::jsonb)
    into actual from information_schema.columns where table_schema='public' and table_name in ('collaboration_tombstones','memory_learning_events','memory_snapshot_migrations');
  if not (actual @> (expected->'columns') and actual <@ (expected->'columns')) then raise exception 'Column drift'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))),'[]'::jsonb)
    into actual from pg_constraint c where c.conrelid in ('public.collaboration_tombstones'::regclass,'public.memory_learning_events'::regclass,'public.memory_snapshot_migrations'::regclass);
  if not (actual @> (expected->'constraints') and actual <@ (expected->'constraints')) then raise exception 'Constraint drift (use default public search_path)'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef)),'[]'::jsonb)
    into actual from pg_indexes where schemaname='public' and tablename in ('collaboration_tombstones','memory_learning_events','memory_snapshot_migrations');
  if not (actual @> (expected->'indexes') and actual <@ (expected->'indexes')) then raise exception 'Index drift'; end if;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into actual from pg_policies p where schemaname='public' and tablename in ('collaboration_tombstones','memory_learning_events','memory_snapshot_migrations');
  if not (actual @> (expected->'policies') and actual <@ (expected->'policies')) then raise exception 'Policy drift'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='memory_entries' and indexname='memory_entries_active_name' and indexdef=${quote(report.indexes.find(i => i.name === 'memory_entries_active_name').definition)}) then
    raise exception 'Active memory name index differs';
  end if;
  if exists(select 1 from pg_constraint where conrelid='public.memory_entries'::regclass and conname='memory_entries_site_id_kind_parent_id_normalized_name_key') then
    raise exception 'Legacy memory uniqueness constraint still present';
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='site_changes') then raise exception 'Realtime publication missing'; end if;
  if has_function_privilege('authenticated','public.apply_memory_snapshot_mutation(uuid,uuid,bigint,jsonb)','EXECUTE') then raise exception 'Legacy snapshot writes still enabled'; end if;

  -- Prove old snapshot import was recorded; never rerun the non-idempotent import.
  for snapshot in select * from public.memory_snapshots loop
    source_count := 0; expected_payload := '{}'::jsonb;
    foreach store_name in array array['sites','trade_types','material_types','trade_vendors','trade_tasks','location_memories','material_memory_items','templates'] loop
      for item in select value from jsonb_array_elements(
        case when store_name='templates' then coalesce((select setting->'templates' from jsonb_array_elements(coalesce(snapshot.payload->'stores'->'app_settings','[]'::jsonb)) setting where setting->>'id'='daily_special_templates_v1' limit 1),'[]'::jsonb)
        else coalesce(snapshot.payload->'stores'->store_name,'[]'::jsonb) end
      ) loop
        source_count := source_count+1;
        expected_payload := jsonb_set(expected_payload,array[(item->>'id')::uuid::text],item);
        if not exists(select 1 from public.memory_entries where site_id=snapshot.site_id and id=(item->>'id')::uuid) then
          raise exception 'Imported snapshot identity missing for site %; requires data review',snapshot.site_id;
        end if;
      end loop;
    end loop;
    select * into ledger from public.memory_snapshot_migrations where site_id=snapshot.site_id;
    if not found or ledger.snapshot_revision<>snapshot.revision or ledger.source_count<>source_count
      or ledger.migrated_count<>source_count or ledger.content_hash<>md5(expected_payload::text) then
      raise exception 'Snapshot import ledger mismatch for site %; no history repaired',snapshot.site_id;
    end if;
  end loop;
  if exists(select 1 from public.memory_snapshot_migrations l where not exists(select 1 from public.memory_snapshots s where s.site_id=l.site_id)) then
    raise exception 'Snapshot ledger has no recovery source; requires data review';
  end if;
end $repair$;

-- The reported write functions had direct/default anon grants. Keep member access.
revoke all on function public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb),
  public.apply_water_field_mutation(uuid,uuid,jsonb),
  public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb) from public, anon;

insert into supabase_migrations.schema_migrations(version,name,statements)
values ('202609230001','field_collaboration',array[]::text[]),
       ('202609230002','memory_entries_sync',array[]::text[])
on conflict(version) do nothing;

do $verify$
begin
  if (select count(*) from supabase_migrations.schema_migrations where version in ('202609230001','202609230002'))<>2 then raise exception 'History verification failed'; end if;
  if has_function_privilege('anon','public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.apply_water_field_mutation(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb)','EXECUTE') then raise exception 'Anonymous write grant remains'; end if;
  if not has_function_privilege('authenticated','public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.apply_water_field_mutation(uuid,uuid,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb)','EXECUTE') then raise exception 'Member write access changed'; end if;
end $verify$;
notify pgrst, 'reload schema';
commit;
select 'history_repair_complete' as status,version,name from supabase_migrations.schema_migrations
where version in ('202609230001','202609230002') order by version;
`;
await writeFile(new URL('../supabase/repairs/reconcile-deployment-history.sql', import.meta.url), sql);
console.log('Verified all five reported function bodies against repository migrations. Generated guarded repair for two baseline versions only.');
