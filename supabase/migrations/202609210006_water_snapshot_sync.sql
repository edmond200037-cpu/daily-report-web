begin;

create table public.water_snapshots (
  site_id uuid primary key references public.sites(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.water_snapshots enable row level security;
create policy water_snapshot_read on public.water_snapshots for select to authenticated using (public.is_site_member(site_id));

create or replace function public.apply_water_snapshot_mutation(
  p_site_id uuid, p_mutation_id uuid, p_base_revision bigint, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_hash text; v_prior public.sync_operations; v_current public.water_snapshots; v_sequence bigint; v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.can_edit_site(p_site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_payload ->> 'schemaVersion','') <> '1' or coalesce(jsonb_typeof(p_payload -> 'points'),'') <> 'array' or coalesce(jsonb_typeof(p_payload -> 'logs'),'') <> 'array' then
    raise exception 'invalid water snapshot' using errcode = '22023';
  end if;
  v_hash := encode(digest(concat_ws('|',p_site_id::text,p_base_revision::text,p_payload::text),'sha256'),'hex');
  select * into v_prior from public.sync_operations where site_id=p_site_id and user_id=v_user_id and mutation_id=p_mutation_id;
  if found then
    if v_prior.request_hash <> v_hash then raise exception 'mutation id reused with different payload' using errcode = '22023'; end if;
    return v_prior.result || jsonb_build_object('status','duplicate');
  end if;
  select * into v_current from public.water_snapshots where site_id=p_site_id for update;
  if found and v_current.revision <> p_base_revision then
    v_result := jsonb_build_object('status','conflict','entity_id',p_site_id,'revision',v_current.revision,'remote_payload',v_current.payload);
    insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result) values(p_site_id,v_user_id,p_mutation_id,v_hash,v_result); return v_result;
  end if;
  if not found and p_base_revision <> 0 then
    v_result := jsonb_build_object('status','conflict','entity_id',p_site_id,'revision',0,'remote_payload',null);
    insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result) values(p_site_id,v_user_id,p_mutation_id,v_hash,v_result); return v_result;
  end if;
  insert into public.water_snapshots(site_id,payload,revision,updated_by) values(p_site_id,p_payload,1,v_user_id)
    on conflict(site_id) do update set payload=excluded.payload,revision=public.water_snapshots.revision+1,updated_by=v_user_id,updated_at=now()
    returning * into v_current;
  insert into public.site_sync_state(site_id,last_sequence) values(p_site_id,0) on conflict(site_id) do nothing;
  update public.site_sync_state set last_sequence=last_sequence+1 where site_id=p_site_id returning last_sequence into v_sequence;
  insert into public.site_changes(site_id,sequence,entity,entity_id,operation,revision)
    values(p_site_id,v_sequence,'water-snapshot',p_site_id,'upsert',v_current.revision);
  v_result := jsonb_build_object('status','applied','entity_id',p_site_id,'revision',v_current.revision,'sequence',v_sequence);
  insert into public.sync_operations(site_id,user_id,mutation_id,request_hash,result) values(p_site_id,v_user_id,p_mutation_id,v_hash,v_result);
  return v_result;
end $$;

revoke all on function public.apply_water_snapshot_mutation(uuid,uuid,bigint,jsonb) from public;
grant execute on function public.apply_water_snapshot_mutation(uuid,uuid,bigint,jsonb) to authenticated;
commit;
