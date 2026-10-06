import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SYNC_CHECK_EMAIL', 'SUPABASE_SYNC_CHECK_PASSWORD', 'SUPABASE_SYNC_CHECK_SITE_ID'];
for (const name of required) assert.ok(process.env[name], `缺少 ${name}；停止發布，未重送使用者資料。`);
const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const siteId = process.env.SUPABASE_SYNC_CHECK_SITE_ID;
const login = await client.auth.signInWithPassword({ email: process.env.SUPABASE_SYNC_CHECK_EMAIL, password: process.env.SUPABASE_SYNC_CHECK_PASSWORD });
assert.ok(!login.error, '同步檢查帳號登入失敗；停止發布。');
try {
  const health = await client.rpc('get_sync_capabilities', { p_site_id: siteId });
  assert.ok(!health.error && health.data?.contract_version === 1, '同步健康 RPC 不可用或契約不符。');
  const specs = [
    ['apply_memory_application', { p_base_revision: 0, p_entry: {} }],
    ['apply_memory_entry_mutation', { p_base_revision: 0, p_entry: {} }],
    ['apply_daily_field_mutation', { p_entity_id: randomUUID(), p_report_date: '2026-10-06', p_changes: null }],
    ['apply_water_field_mutation', { p_changes: null }],
  ];
  for (const [name, args] of specs) {
    assert.ok(health.data.capabilities.includes(name), `${name} 缺少能力或權限。`);
    // Deliberately invalid requests must be rejected BEFORE any write. This
    // verifies actual PostgREST visibility, argument names and edit permission.
    const response = await client.rpc(name, { p_site_id: siteId, p_mutation_id: randomUUID(), ...args });
    assert.equal(response.error?.code, '22023', `${name} 未依契約拒絕無效請求；停止發布。`);
    console.log(`PASS Data API contract ${name}`);
  }
  const pull = await client.rpc('pull_site_changes', { p_site_id: siteId, p_cursor: 0, p_limit: 1 });
  assert.ok(!pull.error, '變更讀取 API 不可用。');
  console.log('PASS authenticated sync capabilities and pull API; no report payload logged.');
} finally { await client.auth.signOut({ scope: 'local' }); }
