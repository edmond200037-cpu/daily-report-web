import { getSupabaseClient } from '../data/remote/supabase-client';
import type { SharedScope } from '../domain/shared';
import { SYNC_CONTRACT_VERSION } from './contract';

/** Always check fresh capabilities before requeuing stopped operations. */
export async function checkSyncCapabilities(scope: SharedScope): Promise<ReadonlySet<string>> {
  const { data, error } = await getSupabaseClient().rpc('get_sync_capabilities', { p_site_id: scope.siteId });
  if (error) throw new Error('雲端同步檢查尚未可用；待同步資料已保留，請完成資料庫更新後再試。');
  if (!data || data.contract_version !== SYNC_CONTRACT_VERSION || !Array.isArray(data.capabilities) || data.capabilities.some((name: unknown) => typeof name !== 'string')) {
    throw new Error('雲端同步契約不相容；待同步資料已保留，請更新系統。');
  }
  return new Set(data.capabilities as string[]);
}
