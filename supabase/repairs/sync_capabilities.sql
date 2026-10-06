-- Included in the sync maintenance migration after audit hardening.
-- Read-only capability discovery, restricted to members of the requested site.
create or replace function public.get_sync_capabilities(p_site_id uuid)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
declare v_capabilities jsonb;
begin
  if auth.uid() is null or not public.is_site_member(p_site_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_capabilities
  from (values
    ('apply_memory_application', 'public.apply_memory_application(uuid,uuid,bigint,jsonb)', array['p_site_id','p_mutation_id','p_base_revision','p_entry']),
    ('apply_memory_entry_mutation', 'public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb)', array['p_site_id','p_mutation_id','p_base_revision','p_entry']),
    ('apply_daily_draft_mutation', 'public.apply_daily_draft_mutation(uuid,uuid,uuid,bigint,jsonb)', array['p_site_id','p_mutation_id','p_entity_id','p_base_revision','p_payload']),
    ('apply_daily_field_mutation', 'public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb)', array['p_site_id','p_mutation_id','p_entity_id','p_report_date','p_changes']),
    ('apply_water_field_mutation', 'public.apply_water_field_mutation(uuid,uuid,jsonb)', array['p_site_id','p_mutation_id','p_changes']),
    ('apply_water_snapshot_mutation', 'public.apply_water_snapshot_mutation(uuid,uuid,bigint,jsonb)', array['p_site_id','p_mutation_id','p_base_revision','p_payload'])
  ) as required(name, signature, arguments)
  join pg_proc p on p.oid = to_regprocedure(signature)
  where p.proargnames = arguments::text[] and has_function_privilege(current_user, p.oid, 'EXECUTE');
  return jsonb_build_object('contract_version', 1, 'capabilities', v_capabilities);
end;
$$;
revoke all on function public.get_sync_capabilities(uuid) from public, anon;
grant execute on function public.get_sync_capabilities(uuid) to authenticated;
notify pgrst, 'reload schema';
