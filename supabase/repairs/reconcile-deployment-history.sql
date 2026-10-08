-- Reviewed baseline repair.
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
  expected jsonb := '{"columns":[{"type":"uuid","table":"collaboration_tombstones","column":"site_id","default":null,"nullable":"NO"},{"type":"text","table":"collaboration_tombstones","column":"document_kind","default":null,"nullable":"NO"},{"type":"text","table":"collaboration_tombstones","column":"collection","default":null,"nullable":"NO"},{"type":"text","table":"collaboration_tombstones","column":"entity_id","default":null,"nullable":"NO"},{"type":"text","table":"collaboration_tombstones","column":"parent_id","default":"''''::text","nullable":"NO"},{"type":"timestamp with time zone","table":"collaboration_tombstones","column":"deleted_at","default":"now()","nullable":"NO"},{"type":"uuid","table":"memory_learning_events","column":"site_id","default":null,"nullable":"NO"},{"type":"uuid","table":"memory_learning_events","column":"entry_id","default":null,"nullable":"NO"},{"type":"text","table":"memory_learning_events","column":"learning_key","default":null,"nullable":"NO"},{"type":"timestamp with time zone","table":"memory_learning_events","column":"created_at","default":"now()","nullable":"NO"},{"type":"uuid","table":"memory_snapshot_migrations","column":"site_id","default":null,"nullable":"NO"},{"type":"bigint","table":"memory_snapshot_migrations","column":"snapshot_revision","default":null,"nullable":"NO"},{"type":"integer","table":"memory_snapshot_migrations","column":"source_count","default":null,"nullable":"NO"},{"type":"integer","table":"memory_snapshot_migrations","column":"migrated_count","default":null,"nullable":"NO"},{"type":"text","table":"memory_snapshot_migrations","column":"content_hash","default":null,"nullable":"NO"},{"type":"timestamp with time zone","table":"memory_snapshot_migrations","column":"migrated_at","default":"now()","nullable":"NO"}],"constraints":[{"name":"collaboration_tombstones_document_kind_check","table":"collaboration_tombstones","definition":"CHECK ((document_kind = ANY (ARRAY[''daily''::text, ''water''::text])))"},{"name":"collaboration_tombstones_pkey","table":"collaboration_tombstones","definition":"PRIMARY KEY (site_id, document_kind, collection, entity_id, parent_id)"},{"name":"collaboration_tombstones_site_id_fkey","table":"collaboration_tombstones","definition":"FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE"},{"name":"memory_snapshot_migrations_pkey","table":"memory_snapshot_migrations","definition":"PRIMARY KEY (site_id)"},{"name":"memory_snapshot_migrations_site_id_fkey","table":"memory_snapshot_migrations","definition":"FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE"},{"name":"memory_learning_events_entry_id_fkey","table":"memory_learning_events","definition":"FOREIGN KEY (entry_id) REFERENCES memory_entries(id) ON DELETE CASCADE"},{"name":"memory_learning_events_pkey","table":"memory_learning_events","definition":"PRIMARY KEY (site_id, entry_id, learning_key)"},{"name":"memory_learning_events_site_id_fkey","table":"memory_learning_events","definition":"FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE"}],"indexes":[{"name":"collaboration_tombstones_pkey","table":"collaboration_tombstones","definition":"CREATE UNIQUE INDEX collaboration_tombstones_pkey ON public.collaboration_tombstones USING btree (site_id, document_kind, collection, entity_id, parent_id)"},{"name":"memory_learning_events_pkey","table":"memory_learning_events","definition":"CREATE UNIQUE INDEX memory_learning_events_pkey ON public.memory_learning_events USING btree (site_id, entry_id, learning_key)"},{"name":"memory_snapshot_migrations_pkey","table":"memory_snapshot_migrations","definition":"CREATE UNIQUE INDEX memory_snapshot_migrations_pkey ON public.memory_snapshot_migrations USING btree (site_id)"}],"policies":[{"cmd":"SELECT","qual":"is_site_member(site_id)","roles":["authenticated"],"tablename":"collaboration_tombstones","permissive":"PERMISSIVE","policyname":"collaboration_tombstones_read","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"is_site_member(site_id)","roles":["authenticated"],"tablename":"memory_learning_events","permissive":"PERMISSIVE","policyname":"memory_learning_read","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"is_site_member(site_id)","roles":["authenticated"],"tablename":"memory_snapshot_migrations","permissive":"PERMISSIVE","policyname":"memory_migration_read","schemaname":"public","with_check":null}]}'::jsonb;
  actual jsonb; check_row record; snapshot public.memory_snapshots;
  ledger public.memory_snapshot_migrations; store_name text; item jsonb;
  expected_payload jsonb; source_count integer;
begin
  for check_row in select * from (values ('public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb)','b2fa4febaf843addbcc224e8190105bb'),
('public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb)','314dd5e2076fb5dd8e466d843f769afe'),
('public.apply_water_field_mutation(uuid,uuid,jsonb)','1c74505a6b70d50c7e4a9fd83b443d54'),
('public.collaboration_apply_array(jsonb,text,jsonb)','f15de6b5271b166faf09239bf9d051c2'),
('public.collaboration_apply_change(jsonb,text,jsonb)','ac3acb602c8ec2997f38a76a766bd774')) as checks(signature,definition_md5) loop
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
  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='memory_entries' and indexname='memory_entries_active_name' and indexdef='CREATE UNIQUE INDEX memory_entries_active_name ON public.memory_entries USING btree (site_id, kind, parent_id, normalized_name) NULLS NOT DISTINCT WHERE (deleted_at IS NULL)') then
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
