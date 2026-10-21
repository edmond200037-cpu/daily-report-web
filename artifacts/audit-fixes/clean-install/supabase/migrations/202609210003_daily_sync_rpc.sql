begin;

create or replace function public.apply_daily_draft_mutation(
  p_site_id uuid,
  p_mutation_id uuid,
  p_entity_id uuid,
  p_base_revision bigint,
  p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_hash text;
  v_prior public.sync_operations;
  v_current public.daily_drafts;
  v_sequence bigint;
  v_result jsonb;
  v_report_date date;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.can_edit_site(p_site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_report_date := (p_payload ->> 'date')::date;
  if v_report_date is null then raise exception 'missing report date' using errcode = '22023'; end if;
  v_request_hash := encode(digest(concat_ws('|', p_site_id::text, p_entity_id::text, p_base_revision::text, p_payload::text), 'sha256'), 'hex');

  select * into v_prior from public.sync_operations
    where site_id = p_site_id and user_id = v_user_id and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash <> v_request_hash then raise exception 'mutation id reused with different payload' using errcode = '22023'; end if;
    return v_prior.result || jsonb_build_object('status', 'duplicate');
  end if;

  select * into v_current from public.daily_drafts
    where site_id = p_site_id and (id = p_entity_id or report_date = v_report_date)
    order by (id = p_entity_id) desc limit 1 for update;

  if found and v_current.revision <> p_base_revision then
    v_result := jsonb_build_object('status', 'conflict', 'entity_id', v_current.id, 'revision', v_current.revision, 'remote_payload', v_current.payload);
    insert into public.sync_operations(site_id, user_id, mutation_id, request_hash, result)
      values (p_site_id, v_user_id, p_mutation_id, v_request_hash, v_result);
    return v_result;
  end if;
  if not found and p_base_revision <> 0 then
    v_result := jsonb_build_object('status', 'conflict', 'entity_id', p_entity_id, 'revision', 0, 'remote_payload', null);
    insert into public.sync_operations(site_id, user_id, mutation_id, request_hash, result)
      values (p_site_id, v_user_id, p_mutation_id, v_request_hash, v_result);
    return v_result;
  end if;

  if found then
    update public.daily_drafts set payload = p_payload, revision = revision + 1, updated_by = v_user_id, updated_at = now(), deleted_at = null
      where id = v_current.id returning * into v_current;
  else
    insert into public.daily_drafts(id, site_id, report_date, payload, revision, updated_by)
      values (p_entity_id, p_site_id, v_report_date, p_payload, 1, v_user_id) returning * into v_current;
  end if;

  insert into public.site_sync_state(site_id, last_sequence) values (p_site_id, 0) on conflict (site_id) do nothing;
  update public.site_sync_state set last_sequence = last_sequence + 1 where site_id = p_site_id returning last_sequence into v_sequence;
  insert into public.site_changes(site_id, sequence, entity, entity_id, operation, revision)
    values (p_site_id, v_sequence, 'daily-draft', v_current.id, 'upsert', v_current.revision);

  v_result := jsonb_build_object('status', 'applied', 'entity_id', v_current.id, 'revision', v_current.revision, 'sequence', v_sequence);
  insert into public.sync_operations(site_id, user_id, mutation_id, request_hash, result)
    values (p_site_id, v_user_id, p_mutation_id, v_request_hash, v_result);
  return v_result;
end $$;

create or replace function public.pull_site_changes(p_site_id uuid, p_cursor bigint default 0, p_limit integer default 100)
returns table(sequence bigint, entity text, entity_id uuid, operation text, revision bigint, changed_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_minimum bigint;
begin
  if not public.is_site_member(p_site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_limit < 1 or p_limit > 500 then raise exception 'invalid page size' using errcode = '22023'; end if;
  select minimum_cursor into v_minimum from public.site_sync_state where site_id = p_site_id;
  if p_cursor < coalesce(v_minimum, 0) then raise exception 'full_resync_required' using errcode = 'P0001'; end if;
  return query select c.sequence, c.entity, c.entity_id, c.operation, c.revision, c.changed_at
    from public.site_changes c where c.site_id = p_site_id and c.sequence > p_cursor
    order by c.sequence limit p_limit;
end $$;

revoke all on function public.apply_daily_draft_mutation(uuid, uuid, uuid, bigint, jsonb), public.pull_site_changes(uuid, bigint, integer) from public;
grant execute on function public.apply_daily_draft_mutation(uuid, uuid, uuid, bigint, jsonb), public.pull_site_changes(uuid, bigint, integer) to authenticated;

commit;
