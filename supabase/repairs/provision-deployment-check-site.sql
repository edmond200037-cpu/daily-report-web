-- Run the entire file in the project's SQL Editor.
-- Creates/reuses one isolated deployment-check site. No existing site access is granted.
-- Before running, replace the two placeholders below with the real account emails.
-- DO NOT commit the filled-in values: this repository is public.
--   administrator: existing application account (becomes owner)
--   checker:       dedicated application account (editor only)
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtextextended('daily-report:deployment-check-site',0));
do $setup$
declare
  administrator_email constant text := '<ADMINISTRATOR_EMAIL>';
  checker_email constant text := '<CHECKER_EMAIL>';
  administrator uuid;
  checker uuid;
  target_site uuid;
begin
  if administrator_email like '<%' or checker_email like '<%' then
    raise exception 'Replace the email placeholders first; no setup performed';
  end if;
  select id into administrator from auth.users where email=administrator_email;
  if administrator is null then raise exception 'Administrator identity not found; no setup performed'; end if;
  select id into checker from auth.users where email=checker_email
    and email_confirmed_at is not null and coalesce(encrypted_password,'')<>'';
  if checker is null then
    raise exception 'Checker identity, confirmed email, or password missing; no setup performed';
  end if;
  if checker=administrator then raise exception 'Checker must be a different account; no setup performed'; end if;
  if (select count(*) from public.sites where created_by=administrator and name='部署驗證專用工地')>1 then
    raise exception 'Multiple check sites found; requires review';
  end if;
  select id into target_site from public.sites where created_by=administrator and name='部署驗證專用工地' for update;
  if exists(select 1 from public.site_members where user_id=checker and site_id is distinct from target_site) then
    raise exception 'Checker already belongs to another site; requires review';
  end if;
  if target_site is null then
    insert into public.sites(name,created_by) values('部署驗證專用工地',administrator) returning id into target_site;
  elsif exists(select 1 from public.site_members where site_id=target_site and user_id not in (administrator,checker)) then
    raise exception 'Check site has other members; requires review';
  elsif exists(select 1 from public.daily_drafts where site_id=target_site)
    or exists(select 1 from public.water_snapshots where site_id=target_site)
    or exists(select 1 from public.memory_entries where site_id=target_site) then
    raise exception 'Check site contains application records; requires review';
  end if;
  if exists(select 1 from public.site_members where site_id=target_site and
    ((user_id=administrator and role<>'owner') or (user_id=checker and role<>'editor'))) then
    raise exception 'Existing roles differ; no role overwritten';
  end if;
  insert into public.site_members(site_id,user_id,role)
    values(target_site,administrator,'owner'),(target_site,checker,'editor')
    on conflict(site_id,user_id) do nothing;
end $setup$;
commit;
select 'deployment_check_site_ready' as status,
  s.id as "SUPABASE_SYNC_CHECK_SITE_ID",u.email as "SUPABASE_SYNC_CHECK_EMAIL",m.role
from public.sites s join public.site_members m on m.site_id=s.id join auth.users u on u.id=m.user_id
where s.name='部署驗證專用工地' and u.email='<CHECKER_EMAIL>' and m.role='editor';
