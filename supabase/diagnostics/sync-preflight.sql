-- 唯讀同步契約檢查。可於 Supabase SQL Editor 執行。
-- 不寫資料、不修復函式、不修改權限、不重送佇列。
-- 本檔的 catalog 檢查通過，仍須驗證 PostgREST 與登入角色的實際 API。
with expected(name, signature, arguments) as (
  values
    ('apply_memory_application', 'public.apply_memory_application(uuid,uuid,bigint,jsonb)', array['p_site_id','p_mutation_id','p_base_revision','p_entry']),
    ('apply_memory_entry_mutation', 'public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb)', array['p_site_id','p_mutation_id','p_base_revision','p_entry']),
    ('apply_daily_field_mutation', 'public.apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb)', array['p_site_id','p_mutation_id','p_entity_id','p_report_date','p_changes']),
    ('apply_water_field_mutation', 'public.apply_water_field_mutation(uuid,uuid,jsonb)', array['p_site_id','p_mutation_id','p_changes'])
)
select e.name, e.signature,
  p.oid is not null as function_exists,
  p.proargnames as actual_arguments,
  p.proargnames = e.arguments::text[] as arguments_match,
  case when p.oid is not null then has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_can_execute,
  case when p.oid is not null then has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_can_execute,
  p.prosecdef as security_definer, p.proconfig as function_settings
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.signature);

select name, to_regclass('public.' || name) is not null as table_exists
from (values ('memory_entries'), ('memory_learning_events'), ('sync_operations'),
  ('site_sync_state'), ('site_changes'), ('collaboration_tombstones')) as required(name);

select to_regclass('supabase_migrations.schema_migrations') is not null as migration_history_exists;
-- 若上一查詢為 true，再另行執行：
-- select version from supabase_migrations.schema_migrations order by version;

-- 只檢查關鍵寫入 RPC。完整發布門檻另需檢查 pull_site_changes、
-- 舊客戶端仍使用的 RPC、RLS、實際 Data API 與事件去重行為。
