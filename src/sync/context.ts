import { loadGasConfig } from '../data/remote/gas-client';
import type { SharedScope } from '../domain/shared';

// 一個試算表就是一個工地、沒有帳號：固定範圍，設定了後端才啟用同步。
export const SHARED_SCOPE: SharedScope = { userId: 'shared', siteId: 'shared' };

export async function loadActiveSharedScope(): Promise<SharedScope | null> {
  return loadGasConfig() ? SHARED_SCOPE : null;
}
