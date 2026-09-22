begin;

create or replace function public.reject_site_join_request(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_request public.join_requests;
begin
  select * into v_request from public.join_requests where id = p_request_id for update;
  if v_request.id is null or not public.can_manage_site(v_request.site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.join_requests set status = 'rejected', resolved_at = now(), resolved_by = auth.uid() where id = p_request_id;
  return v_request.user_id;
end $$;

create or replace function public.update_site_member_role(p_site_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_current text; v_owner_count integer;
begin
  if not public.can_manage_site(p_site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('owner', 'editor', 'viewer') then raise exception 'invalid member role' using errcode = '22023'; end if;
  select role into v_current from public.site_members where site_id = p_site_id and user_id = p_user_id for update;
  if v_current is null then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_current = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count from public.site_members where site_id = p_site_id and role = 'owner';
    if v_owner_count <= 1 then raise exception 'cannot demote last owner' using errcode = '23514'; end if;
  end if;
  update public.site_members set role = p_role where site_id = p_site_id and user_id = p_user_id;
end $$;

create or replace function public.remove_site_member(p_site_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_role text; v_owner_count integer;
begin
  if not public.can_manage_site(p_site_id) and auth.uid() <> p_user_id then raise exception 'forbidden' using errcode = '42501'; end if;
  select role into v_role from public.site_members where site_id = p_site_id and user_id = p_user_id for update;
  if v_role is null then return; end if;
  if v_role = 'owner' then
    select count(*) into v_owner_count from public.site_members where site_id = p_site_id and role = 'owner';
    if v_owner_count <= 1 then raise exception 'cannot remove last owner' using errcode = '23514'; end if;
  end if;
  delete from public.site_members where site_id = p_site_id and user_id = p_user_id;
end $$;

revoke all on function public.reject_site_join_request(uuid), public.update_site_member_role(uuid, uuid, text), public.remove_site_member(uuid, uuid) from public;
grant execute on function public.reject_site_join_request(uuid), public.update_site_member_role(uuid, uuid, text), public.remove_site_member(uuid, uuid) to authenticated;

commit;
