begin;

-- v2 writes fields; v1 snapshot RPCs remain available for queued legacy clients.
create table public.collaboration_tombstones (
  site_id uuid not null references public.sites(id) on delete cascade,
  document_kind text not null check (document_kind in ('daily', 'water')),
  collection text not null,
  entity_id text not null,
  parent_id text not null default '',
  deleted_at timestamptz not null default now(),
  primary key (site_id, document_kind, collection, entity_id, parent_id)
);
alter table public.collaboration_tombstones enable row level security;
create policy collaboration_tombstones_read on public.collaboration_tombstones for select to authenticated using (public.is_site_member(site_id));

create or replace function public.collaboration_apply_array(p_items jsonb, p_collection text, p_change jsonb)
returns jsonb language plpgsql immutable as $$
declare v_id text := p_change->>'id'; v_key text := case when p_collection = 'readings' then 'pointId' else 'id' end;
begin
  p_items := coalesce(p_items, '[]'::jsonb);
  if p_change->>'op' = 'delete' then
    return coalesce((select jsonb_agg(x) from jsonb_array_elements(p_items) x where x->>v_key <> v_id), '[]'::jsonb);
  elsif p_change->>'op' = 'set' then
    return coalesce((select jsonb_agg(case when x->>v_key = v_id then jsonb_set(x, array[p_change->>'field'], p_change->'value', true) else x end)
      from jsonb_array_elements(p_items) x), '[]'::jsonb);
  elsif p_change->>'op' = 'upsert' then
    if exists(select 1 from jsonb_array_elements(p_items) x where x->>v_key = v_id) then
      return (select jsonb_agg(case when x->>v_key = v_id then x || (p_change->'value') else x end) from jsonb_array_elements(p_items) x);
    end if;
    return p_items || jsonb_build_array(p_change->'value');
  elsif p_change->>'op' = 'order' then
    return coalesce((select jsonb_agg(x order by coalesce(array_position(array(select jsonb_array_elements_text(p_change->'ids')), x->>v_key), 2147483647)) from jsonb_array_elements(p_items) x), '[]'::jsonb);
  end if;
  raise exception 'invalid collaboration operation' using errcode = '22023';
end $$;

create or replace function public.collaboration_apply_change(p_payload jsonb, p_kind text, p_change jsonb)
returns jsonb language plpgsql immutable as $$
declare v_collection text := p_change->>'collection'; v_parent text := p_change->>'parentId'; v_parent_collection text; v_result jsonb := p_payload;
begin
  if v_collection = '$document' then
    if p_change->>'op' <> 'set' then raise exception 'document changes must be set' using errcode = '22023'; end if;
    return jsonb_set(v_result, array[p_change->>'field'], p_change->'value', true);
  end if;
  if v_collection in ('workItems', 'readings') then
    v_parent_collection := case when v_collection = 'workItems' then 'tradeSections' else 'logs' end;
    return jsonb_set(v_result, array[v_parent_collection], coalesce((select jsonb_agg(case when x->>'id' = v_parent then jsonb_set(x, array[v_collection], public.collaboration_apply_array(x->v_collection, v_collection, p_change), true) else x end)
      from jsonb_array_elements(coalesce(v_result->v_parent_collection, '[]'::jsonb)) x), '[]'::jsonb), true);
  end if;
  return jsonb_set(v_result, array[v_collection], public.collaboration_apply_array(v_result->v_collection, v_collection, p_change), true);
end $$;

create or replace function public.apply_daily_field_mutation(p_site_id uuid, p_mutation_id uuid, p_entity_id uuid, p_report_date date, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_user uuid := auth.uid(); v_hash text; v_prior public.sync_operations; v_row public.daily_drafts; v_change jsonb; v_payload jsonb; v_sequence bigint; v_result jsonb; v_deleted boolean;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.can_edit_site(p_site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) <> 'array' then raise exception 'invalid changes' using errcode = '22023'; end if;
  v_hash := encode(digest(concat_ws('|',p_site_id::text,p_entity_id::text,p_report_date::text,p_changes::text),'sha256'),'hex');
  select * into v_prior from public.sync_operations where site_id=p_site_id and user_id=v_user and mutation_id=p_mutation_id;
  if found then if v_prior.request_hash <> v_hash then raise exception 'mutation id reused with different payload' using errcode='22023'; end if; return v_prior.result || jsonb_build_object('status','duplicate'); end if;
  select * into v_row from public.daily_drafts where site_id=p_site_id and report_date=p_report_date for update;
  v_payload := coalesce(v_row.payload, jsonb_build_object('date',p_report_date::text,'tradeSections','[]'::jsonb,'standaloneMaterialEntries','[]'::jsonb,'supplies','[]'::jsonb,'contacts','[]'::jsonb,'specialItems','[]'::jsonb));
  for v_change in select value from jsonb_array_elements(p_changes) loop
    select exists(select 1 from public.collaboration_tombstones where site_id=p_site_id and document_kind='daily' and collection=v_change->>'collection' and entity_id=v_change->>'id' and parent_id=coalesce(v_change->>'parentId','')) into v_deleted;
    if v_deleted and v_change->>'op' <> 'delete' then continue; end if;
    if v_change->>'op' = 'delete' then insert into public.collaboration_tombstones(site_id,document_kind,collection,entity_id,parent_id) values(p_site_id,'daily',v_change->>'collection',v_change->>'id',coalesce(v_change->>'parentId','')) on conflict do nothing; end if;
    v_payload := public.collaboration_apply_change(v_payload, 'daily', v_change);
  end loop;
  insert into public.daily_drafts(id,site_id,report_date,payload,revision,updated_by) values(p_entity_id,p_site_id,p_report_date,v_payload,1,v_user)
    on conflict(site_id,report_date) do update set payload=excluded.payload, revision=public.daily_drafts.revision+1, updated_by=v_user, updated_at=now(), deleted_at=null returning * into v_row;
  insert into public.site_sync_state(site_id,last_sequence) values(p_site_id,0) on conflict do nothing; update public.site_sync_state set last_sequence=last_sequence+1 where site_id=p_site_id returning last_sequence into v_sequence;
  insert into public.site_changes(site_id,sequence,entity,entity_id,operation,revision) values(p_site_id,v_sequence,'daily-draft',v_row.id,'upsert',v_row.revision);
  v_result := jsonb_build_object('status','applied','entity_id',v_row.id,'revision',v_row.revision,'sequence',v_sequence);
  insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result) values(p_site_id,v_user,p_mutation_id,v_hash,v_result); return v_result;
end $$;

create or replace function public.apply_water_field_mutation(p_site_id uuid, p_mutation_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_user uuid := auth.uid(); v_hash text; v_prior public.sync_operations; v_row public.water_snapshots; v_change jsonb; v_payload jsonb := jsonb_build_object('schemaVersion',1,'points','[]'::jsonb,'logs','[]'::jsonb); v_sequence bigint; v_result jsonb; v_deleted boolean;
begin
  if v_user is null then raise exception 'authentication required' using errcode='28000'; end if; if not public.can_edit_site(p_site_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_changes) <> 'array' then raise exception 'invalid changes' using errcode='22023'; end if;
  v_hash := encode(digest(concat_ws('|',p_site_id::text,p_changes::text),'sha256'),'hex'); select * into v_prior from public.sync_operations where site_id=p_site_id and user_id=v_user and mutation_id=p_mutation_id;
  if found then if v_prior.request_hash <> v_hash then raise exception 'mutation id reused with different payload' using errcode='22023'; end if; return v_prior.result || jsonb_build_object('status','duplicate'); end if;
  select * into v_row from public.water_snapshots where site_id=p_site_id for update; v_payload := coalesce(v_row.payload,v_payload);
  for v_change in select value from jsonb_array_elements(p_changes) loop
    select exists(select 1 from public.collaboration_tombstones where site_id=p_site_id and document_kind='water' and collection=v_change->>'collection' and entity_id=v_change->>'id' and parent_id=coalesce(v_change->>'parentId','')) into v_deleted;
    if v_deleted and v_change->>'op' <> 'delete' then continue; end if;
    if v_change->>'op' = 'delete' then insert into public.collaboration_tombstones(site_id,document_kind,collection,entity_id,parent_id) values(p_site_id,'water',v_change->>'collection',v_change->>'id',coalesce(v_change->>'parentId','')) on conflict do nothing; end if;
    v_payload := public.collaboration_apply_change(v_payload, 'water', v_change);
  end loop;
  insert into public.water_snapshots(site_id,payload,revision,updated_by) values(p_site_id,v_payload,1,v_user) on conflict(site_id) do update set payload=excluded.payload,revision=public.water_snapshots.revision+1,updated_by=v_user,updated_at=now() returning * into v_row;
  insert into public.site_sync_state(site_id,last_sequence) values(p_site_id,0) on conflict do nothing; update public.site_sync_state set last_sequence=last_sequence+1 where site_id=p_site_id returning last_sequence into v_sequence;
  insert into public.site_changes(site_id,sequence,entity,entity_id,operation,revision) values(p_site_id,v_sequence,'water-snapshot',p_site_id,'upsert',v_row.revision);
  v_result:=jsonb_build_object('status','applied','entity_id',p_site_id,'revision',v_row.revision,'sequence',v_sequence); insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result) values(p_site_id,v_user,p_mutation_id,v_hash,v_result); return v_result;
end $$;

revoke all on function public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb), public.apply_water_field_mutation(uuid,uuid,jsonb) from public;
grant execute on function public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb), public.apply_water_field_mutation(uuid,uuid,jsonb) to authenticated;

do $$ begin alter publication supabase_realtime add table public.site_changes; exception when duplicate_object then null; end $$;
commit;
