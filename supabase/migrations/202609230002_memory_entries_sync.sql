begin;

alter table public.memory_entries drop constraint if exists memory_entries_site_id_kind_parent_id_normalized_name_key;
create unique index memory_entries_active_name on public.memory_entries(site_id,kind,parent_id,normalized_name) nulls not distinct where deleted_at is null;

-- Keep the original memory_snapshots table as a permanent recovery source.
create table public.memory_snapshot_migrations (
  site_id uuid primary key references public.sites(id) on delete cascade,
  snapshot_revision bigint not null,
  source_count integer not null,
  migrated_count integer not null,
  content_hash text not null,
  migrated_at timestamptz not null default now()
);
alter table public.memory_snapshot_migrations enable row level security;
create policy memory_migration_read on public.memory_snapshot_migrations for select to authenticated using (public.is_site_member(site_id));

create table public.memory_learning_events (
  site_id uuid not null references public.sites(id) on delete cascade,
  entry_id uuid not null references public.memory_entries(id) on delete cascade,
  learning_key text not null,
  created_at timestamptz not null default now(),
  primary key(site_id,entry_id,learning_key)
);
alter table public.memory_learning_events enable row level security;
create policy memory_learning_read on public.memory_learning_events for select to authenticated using (public.is_site_member(site_id));

do $$
declare s public.memory_snapshots; v_store text; v_kind text; v_item jsonb; v_id uuid; v_parent uuid;
  v_name text; v_source integer; v_before integer; v_after integer; v_seq bigint;
  v_expected jsonb; v_actual jsonb;
begin
  for s in select * from public.memory_snapshots order by site_id loop
    select count(*) into v_before from public.memory_entries where site_id=s.site_id;
    if v_before <> 0 then raise exception 'memory migration requires empty target site %', s.site_id; end if;
    v_source := 0; v_expected := '{}'::jsonb;
    foreach v_store in array array['sites','trade_types','material_types','trade_vendors','trade_tasks','location_memories','material_memory_items','templates'] loop
      v_kind := case v_store when 'sites' then 'site' when 'trade_types' then 'trade'
        when 'trade_vendors' then 'vendor' when 'trade_tasks' then 'task'
        when 'location_memories' then 'location' when 'material_types' then 'material-type'
        when 'material_memory_items' then 'material-item' else 'template' end;
      for v_item in select value from jsonb_array_elements(
        case when v_store='templates' then
          coalesce((select setting->'templates' from jsonb_array_elements(coalesce(s.payload->'stores'->'app_settings','[]'::jsonb)) setting where setting->>'id'='daily_special_templates_v1' limit 1),'[]'::jsonb)
        else coalesce(s.payload->'stores'->v_store,'[]'::jsonb) end
      ) loop
        v_source := v_source+1; v_id := (v_item->>'id')::uuid;
        v_expected := jsonb_set(v_expected,array[v_id::text],v_item);
        v_parent := case when v_kind in ('vendor','task') then nullif(v_item->>'tradeTypeId','')::uuid
          when v_kind='material-item' then nullif(v_item->>'materialTypeId','')::uuid else null end;
        v_name := case when v_kind='material-item' then coalesce(v_item->>'fieldType','')||':'||coalesce(v_item->>'normalizedValue','')
          else coalesce(v_item->>'normalizedName','') end;
        insert into public.memory_entries(id,site_id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,updated_by)
        values(v_id,s.site_id,v_kind,v_parent,v_name,v_item,case when v_item->>'status'='candidate' then 'candidate' else 'confirmed' end,
          greatest(coalesce((v_item->>'usageCount')::integer,0),0),greatest(coalesce((v_item->>'finalizedUsageCount')::integer,0),0),1,s.updated_by);
        insert into public.site_sync_state(site_id,last_sequence) values(s.site_id,0) on conflict(site_id) do nothing;
        update public.site_sync_state set last_sequence=last_sequence+1 where site_id=s.site_id returning last_sequence into v_seq;
        insert into public.site_changes(site_id,sequence,entity,entity_id,operation,revision)
          values(s.site_id,v_seq,'memory-entry',v_id,'upsert',1);
      end loop;
    end loop;
    select count(*) into v_after from public.memory_entries where site_id=s.site_id;
    if v_after <> v_source then raise exception 'memory migration count mismatch for site %: % / %', s.site_id,v_after,v_source; end if;
    select coalesce(jsonb_object_agg(id::text,payload),'{}'::jsonb) into v_actual from public.memory_entries where site_id=s.site_id;
    if v_actual<>v_expected then raise exception 'memory migration content mismatch for site %',s.site_id; end if;
    insert into public.memory_snapshot_migrations(site_id,snapshot_revision,source_count,migrated_count,content_hash)
      values(s.site_id,s.revision,v_source,v_after,md5(v_expected::text));
  end loop;
end $$;

-- Old clients can still read their original snapshot, but must upgrade before writing.
revoke execute on function public.apply_memory_snapshot_mutation(uuid,uuid,bigint,jsonb) from authenticated;

create or replace function public.apply_memory_entry_mutation(
  p_site_id uuid, p_mutation_id uuid, p_base_revision bigint, p_entry jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare v_user uuid := auth.uid(); v_id uuid; v_parent uuid; v_kind text; v_name text;
  v_status text; v_payload jsonb; v_hash text; v_prior public.sync_operations;
  v_current public.memory_entries; v_result jsonb; v_revision bigint; v_sequence bigint;
  v_deleted boolean; v_usage integer; v_finalized integer;
  v_learning_key text; v_delta_usage integer; v_delta_finalized integer;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
  if not public.can_edit_site(p_site_id) then raise exception 'forbidden' using errcode='42501'; end if;
  v_id := (p_entry->>'id')::uuid;
  v_kind := p_entry->>'kind'; v_parent := nullif(p_entry->>'parent_id','')::uuid;
  v_name := p_entry->>'normalized_name'; v_status := p_entry->>'status';
  v_payload := p_entry->'payload'; v_deleted := coalesce((p_entry->>'deleted')::boolean,false);
  v_learning_key := nullif(p_entry->>'learning_key','');
  v_delta_usage := coalesce((p_entry->'learning_delta'->>'usage')::integer,0);
  v_delta_finalized := coalesce((p_entry->'learning_delta'->>'finalized')::integer,0);
  v_usage := (p_entry->>'usage_count')::integer; v_finalized := (p_entry->>'finalized_usage_count')::integer;
  if v_id is null or v_kind not in ('site','trade','vendor','task','location','material-type','material-item','template')
    or v_name is null or v_name='' or v_status not in ('candidate','confirmed')
    or jsonb_typeof(v_payload)<>'object' or v_payload->>'id'<>v_id::text
    or v_usage<0 or v_finalized<0 or v_finalized>v_usage
    or p_base_revision<0 or length(coalesce(v_learning_key,''))>128
    or v_delta_usage<0 or v_delta_finalized<0 or v_delta_finalized>v_delta_usage
    or (v_learning_key is null and p_entry ? 'learning_delta')
    then raise exception 'invalid memory entry' using errcode='22023'; end if;
  if v_name is distinct from (case when v_kind='material-item' then coalesce(v_payload->>'fieldType','')||':'||coalesce(v_payload->>'normalizedValue','')
    else v_payload->>'normalizedName' end)
    or (v_kind<>'template' and coalesce(v_payload->>'status','confirmed')<>v_status)
    or (v_kind in ('vendor','task') and nullif(v_payload->>'tradeTypeId','')::uuid is distinct from v_parent)
    or (v_kind='material-item' and nullif(v_payload->>'materialTypeId','')::uuid is distinct from v_parent)
    then raise exception 'memory entry fields mismatch' using errcode='22023'; end if;
  if (v_kind in ('vendor','task','material-item')) <> (v_parent is not null) then
    raise exception 'invalid memory parent' using errcode='22023'; end if;
  v_hash := encode(digest(concat_ws('|',p_site_id::text,p_base_revision::text,p_entry::text),'sha256'),'hex');
  select * into v_prior from public.sync_operations where site_id=p_site_id and user_id=v_user and mutation_id=p_mutation_id;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'mutation id reused with different payload' using errcode='22023'; end if;
    return v_prior.result || jsonb_build_object('status','duplicate');
  end if;
  select * into v_current from public.memory_entries where id=v_id and site_id=p_site_id for update;
  if v_learning_key is not null and exists(select 1 from public.memory_learning_events
    where site_id=p_site_id and entry_id=v_id and learning_key=v_learning_key) then
    select revision into v_revision from public.memory_entries where id=v_id and site_id=p_site_id;
    v_result:=jsonb_build_object('status','duplicate','entity_id',v_id,'revision',v_revision);
    insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result)
      values(p_site_id,v_user,p_mutation_id,v_hash,v_result);
    return v_result;
  end if;
  if v_parent is not null and not exists(
    select 1 from public.memory_entries where id=v_parent and site_id=p_site_id and deleted_at is null
      and kind=case when v_kind='material-item' then 'material-type' else 'trade' end
  ) then raise exception 'memory parent missing' using errcode='23503'; end if;
  if v_current.id is not null then
    if v_current.deleted_at is not null and v_learning_key is not null then
      v_result:=jsonb_build_object('status','conflict','entity_id',v_id,'revision',v_current.revision,'remote_payload',to_jsonb(v_current));
    elsif v_learning_key is not null then
      v_usage := v_current.usage_count+v_delta_usage;
      v_finalized := v_current.finalized_usage_count+v_delta_finalized;
      v_status := case when v_current.status='confirmed' or v_finalized>=3 then 'confirmed' else 'candidate' end;
      v_payload := v_current.payload || jsonb_build_object('usageCount',v_usage,'finalizedUsageCount',v_finalized,
        'status',v_status,'lastUsedAt',greatest(coalesce(v_current.payload->>'lastUsedAt',''),coalesce(v_payload->>'lastUsedAt','')));
      update public.memory_entries set payload=v_payload,status=v_status,usage_count=v_usage,finalized_usage_count=v_finalized,
        revision=revision+1,updated_by=v_user,updated_at=now() where id=v_id returning revision into v_revision;
    elsif v_current.revision<>p_base_revision then
      v_result:=jsonb_build_object('status','conflict','entity_id',v_id,'revision',v_current.revision,'remote_payload',to_jsonb(v_current));
    else
      update public.memory_entries set kind=v_kind,parent_id=v_parent,normalized_name=v_name,payload=v_payload,status=v_status,
        usage_count=v_usage,finalized_usage_count=v_finalized,revision=revision+1,updated_by=v_user,updated_at=now(),
        deleted_at=case when v_deleted then now() else null end where id=v_id returning revision into v_revision;
    end if;
  elsif p_base_revision<>0 then
    v_result:=jsonb_build_object('status','conflict','entity_id',v_id,'revision',0,'remote_payload',null);
  else
    insert into public.memory_entries(id,site_id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,updated_by,deleted_at)
      values(v_id,p_site_id,v_kind,v_parent,v_name,v_payload,v_status,v_usage,v_finalized,v_user,case when v_deleted then now() else null end)
      returning revision into v_revision;
  end if;
  if v_result is null then
    if v_learning_key is not null then
      insert into public.memory_learning_events(site_id,entry_id,learning_key) values(p_site_id,v_id,v_learning_key);
    end if;
    insert into public.site_sync_state(site_id,last_sequence) values(p_site_id,0) on conflict(site_id) do nothing;
    update public.site_sync_state set last_sequence=last_sequence+1 where site_id=p_site_id returning last_sequence into v_sequence;
    insert into public.site_changes(site_id,sequence,entity,entity_id,operation,revision)
      values(p_site_id,v_sequence,'memory-entry',v_id,case when v_deleted then 'delete' else 'upsert' end,v_revision);
    v_result:=jsonb_build_object('status','applied','entity_id',v_id,'revision',v_revision,'sequence',v_sequence);
  end if;
  insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result)
    values(p_site_id,v_user,p_mutation_id,v_hash,v_result);
  return v_result;
end $$;
revoke all on function public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb) from public;
grant execute on function public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb) to authenticated;
commit;
