begin;

create table public.memory_entries (
  id uuid primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  kind text not null check (kind in ('site', 'trade', 'vendor', 'task', 'location', 'material-type', 'material-item', 'template')),
  parent_id uuid references public.memory_entries(id),
  normalized_name text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('candidate', 'confirmed')),
  usage_count integer not null default 0 check (usage_count >= 0),
  finalized_usage_count integer not null default 0 check (finalized_usage_count >= 0),
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique nulls not distinct (site_id, kind, parent_id, normalized_name)
);

create table public.daily_drafts (
  id uuid primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  report_date date not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (site_id, report_date)
);

create table public.daily_reports (
  id uuid primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  draft_id uuid not null references public.daily_drafts(id),
  source_revision bigint not null,
  report_date date not null,
  snapshot jsonb not null,
  output_text text not null,
  output_fingerprint text not null,
  template_version integer not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (site_id, draft_id, output_fingerprint)
);

create table public.water_points (
  id uuid primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null, normalized_name text not null, sort_order integer not null default 0,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (site_id, normalized_name)
);

create table public.water_logs (
  id uuid primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  measured_at timestamptz not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (site_id, measured_at)
);

create table public.site_sync_state (
  site_id uuid primary key references public.sites(id) on delete cascade,
  last_sequence bigint not null default 0,
  minimum_cursor bigint not null default 0
);

create table public.site_changes (
  site_id uuid not null references public.sites(id) on delete cascade,
  sequence bigint not null,
  entity text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete')),
  revision bigint not null,
  changed_at timestamptz not null default now(),
  primary key (site_id, sequence)
);

create table public.sync_operations (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (site_id, user_id, mutation_id)
);

do $$ declare table_name text;
begin
  foreach table_name in array array['memory_entries','daily_drafts','daily_reports','water_points','water_logs','site_sync_state','site_changes','sync_operations']
  loop execute format('alter table public.%I enable row level security', table_name); end loop;
end $$;

create policy memory_read on public.memory_entries for select to authenticated using (public.is_site_member(site_id));
create policy draft_read on public.daily_drafts for select to authenticated using (public.is_site_member(site_id));
create policy report_read on public.daily_reports for select to authenticated using (public.is_site_member(site_id));
create policy water_point_read on public.water_points for select to authenticated using (public.is_site_member(site_id));
create policy water_log_read on public.water_logs for select to authenticated using (public.is_site_member(site_id));
create policy sync_state_read on public.site_sync_state for select to authenticated using (public.is_site_member(site_id));
create policy changes_read on public.site_changes for select to authenticated using (public.is_site_member(site_id));
create policy operations_read_own on public.sync_operations for select to authenticated using (public.is_site_member(site_id) and user_id = auth.uid());

-- 寫入刻意不提供一般 Data API policy；後續 mutation RPC 會以白名單、版本與冪等交易寫入。

commit;
