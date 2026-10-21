begin;

create extension if not exists pgcrypto;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  join_code text not null unique default left(replace(gen_random_uuid()::text, '-', ''), 12),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_members (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  unique (site_id, user_id)
);

create or replace function public.site_role(p_site_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp
as $$ select role from public.site_members where site_id = p_site_id and user_id = auth.uid() $$;

create or replace function public.is_site_member(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select public.site_role(p_site_id) is not null $$;

create or replace function public.can_edit_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.site_role(p_site_id) in ('owner', 'editor'), false) $$;

create or replace function public.can_manage_site(p_site_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.site_role(p_site_id) = 'owner', false) $$;

revoke all on function public.site_role(uuid), public.is_site_member(uuid), public.can_edit_site(uuid), public.can_manage_site(uuid) from public;
grant execute on function public.site_role(uuid), public.is_site_member(uuid), public.can_edit_site(uuid), public.can_manage_site(uuid) to authenticated;

alter table public.sites enable row level security;
alter table public.site_members enable row level security;
alter table public.join_requests enable row level security;

create policy sites_select_member on public.sites for select to authenticated using (public.is_site_member(id));
create policy sites_update_owner on public.sites for update to authenticated using (public.can_manage_site(id)) with check (public.can_manage_site(id));
create policy members_select_member on public.site_members for select to authenticated using (public.is_site_member(site_id));
create policy requests_select_self_or_owner on public.join_requests for select to authenticated using (user_id = auth.uid() or public.can_manage_site(site_id));

create or replace function public.create_site(p_name text)
returns table(site_id uuid, join_code text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_site public.sites;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if char_length(btrim(p_name)) not between 1 and 100 then raise exception 'invalid site name' using errcode = '22023'; end if;
  insert into public.sites(name, created_by) values (btrim(p_name), auth.uid()) returning * into v_site;
  insert into public.site_members(site_id, user_id, role) values (v_site.id, auth.uid(), 'owner');
  return query select v_site.id, v_site.join_code;
end $$;

create or replace function public.request_join(p_join_code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_site_id uuid; v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select id into v_site_id from public.sites where join_code = lower(btrim(p_join_code));
  if v_site_id is null then raise exception 'invalid join code' using errcode = '22023'; end if;
  if exists(select 1 from public.site_members where site_id = v_site_id and user_id = auth.uid()) then return v_site_id; end if;
  insert into public.join_requests(site_id, user_id, status)
    values (v_site_id, auth.uid(), 'pending')
    on conflict (site_id, user_id) do update set status = 'pending', requested_at = now(), resolved_at = null, resolved_by = null
    returning id into v_request_id;
  return v_request_id;
end $$;

create or replace function public.approve_site_member(p_request_id uuid, p_role text default 'editor')
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_request public.join_requests;
begin
  if p_role not in ('editor', 'viewer') then raise exception 'invalid member role' using errcode = '22023'; end if;
  select * into v_request from public.join_requests where id = p_request_id for update;
  if v_request.id is null or not public.can_manage_site(v_request.site_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.site_members(site_id, user_id, role) values (v_request.site_id, v_request.user_id, p_role)
    on conflict (site_id, user_id) do update set role = excluded.role;
  update public.join_requests set status = 'approved', resolved_at = now(), resolved_by = auth.uid() where id = p_request_id;
  return v_request.user_id;
end $$;

revoke all on function public.create_site(text), public.request_join(text), public.approve_site_member(uuid, text) from public;
grant execute on function public.create_site(text), public.request_join(text), public.approve_site_member(uuid, text) to authenticated;

commit;
