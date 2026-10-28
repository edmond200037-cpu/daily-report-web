import { listMemories, listMaterialTypes, listMaterialMemory, loadDailyDraftForDate } from '../data/daily-repository';
import { createDailyDraft } from '../domain/daily';
import { listAccessibleSites } from '../data/remote/site-repository';
import { cacheActiveSiteRole } from '../data/local/shared-context';
import { dailyOperationStatusSummary, listAllOperations } from '../sync/outbox';
import type { SyncOperation } from '../sync/types';
import { loadLastPulledAt, type SyncRunResult, runSyncOnce } from '../sync/engine';
import { loadActiveSharedScope } from '../sync/context';
import { persistActiveMemoryPartition, restoreActiveMemoryPartition } from '../data/memory-partition';
import { getSupabaseClient } from '../data/remote/supabase-client';
import type { RemoteMemoryEntry } from '../sync/memory-entries';
import { persistActiveWaterPartition, restoreActiveWaterPartition } from '../data/water-partition';
import { subscribeToSiteChanges } from '../sync/realtime';
import { withWorkspaceLock } from '../sync/workspace-lock';
import { parseRoute, renderApp } from '../main';
import { appState, settingsState, workItemComposerByTrade } from './state';
import { updateDailySaveStatus } from '../daily/views/daily-view';
import { materialDirty } from '../daily/views/material-view';
import { contactDirty } from '../daily/views/contact-view';
import { capturePendingWork, commitInputMemories } from '../daily/views/daily-entry';
export async function refreshDailySyncStatus(): Promise<void> {
  appState.dailySyncStatusUnknown = false;
  const scope = await loadActiveSharedScope().catch(() => { appState.dailySyncStatusUnknown = true; return null; });
  const summary = scope ? await dailyOperationStatusSummary(scope, appState.daily.report.date).catch(() => { appState.dailySyncStatusUnknown = true; return { pending: appState.dailySyncPendingCount, conflict: appState.dailySyncConflictCount }; }) : { pending: 0, conflict: 0 };
  const operations = scope ? await listAllOperations(scope).catch(() => { appState.dailySyncStatusUnknown = true; return null; }) : [];
  if (operations) { const memories = operations.filter((row) => row.entity === 'memory' || row.entity === 'memory-entry'); const problems = memories.filter((row) => ['blocked', 'failed', 'conflict'].includes(row.status)).length; appState.memoryQueueSummary = memories.length ? `・工地記憶待同步 ${memories.length} 筆${problems ? `（${problems} 筆需處理）` : ''}` : ''; }
  appState.dailySyncPendingCount = summary.pending;
  appState.dailySyncConflictCount = summary.conflict;
  updateDailySaveStatus();
}
export async function refreshActiveMemoryCache(): Promise<void> {
  [appState.dailySites, appState.dailyTrades, appState.dailyVendors, appState.dailyTasks, appState.materialTypes, appState.materialMemory] = await Promise.all([
    listMemories('sites'), listMemories('trades', undefined, 'all'), listMemories('vendors', undefined, 'all'), listMemories('tasks', undefined, 'all'), listMaterialTypes(), listMaterialMemory(),
  ]);
}
export async function switchActiveDataPartition(changeContext: () => Promise<void>): Promise<void> {
  if (appState.workspaceSwitching) throw new Error('工地切換中，請稍候。');
  if (materialDirty() || contactDirty() || settingsState.dirty) throw new Error('請先儲存目前表單，再切換工地。');
  appState.workspaceSwitching = true; appState.activeSyncEpoch += 1;
  try {
    if (!isReadOnlySite()) { capturePendingWork(); await appState.daily.flush(); await commitInputMemories(); }
    await appState.memoryCommitTail;
    await withWorkspaceLock(async () => {
      await Promise.all([persistActiveMemoryPartition(), persistActiveWaterPartition()]);
      const date = appState.daily.report.date;
      await changeContext();
      await Promise.all([restoreActiveMemoryPartition(), restoreActiveWaterPartition()]);
      appState.daily.replaceReport((await loadDailyDraftForDate(date)) ?? createDailyDraft(null, '', date));
      appState.daily.expandedId = null; appState.activeWorkAuxEditor = null; workItemComposerByTrade.clear();
      await refreshActiveMemoryCache();
      const scope = await loadActiveSharedScope(); appState.lastPulledAt = scope ? await loadLastPulledAt(scope) : null;
      appState.syncFeedback = '';
    });
  } finally { appState.workspaceSwitching = false; scheduleBackgroundSync(); }
}
export function isReadOnlySite(): boolean {
  return Boolean(appState.accountActiveSiteId) && (appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole) === 'viewer';
}
function formatSyncFeedback(result: SyncRunResult, operations: SyncOperation[]): string {
  const pending = operations.length; const blocked = operations.filter((row) => ['blocked', 'failed', 'conflict'].includes(row.status)).length;
  return `日報：送出 ${result.dailyApplied}／接收 ${result.dailyPulled}；水位：送出 ${result.waterApplied}／接收 ${result.waterPulled}；工地記憶：送出 ${result.memoryApplied}／接收 ${result.memoryPulled}；本輪衝突 ${result.conflicts}、失敗 ${result.failed}；尚未送達 ${pending} 筆，其中 ${blocked} 筆需處理。${result.pullError ? ` 接收失敗：${result.pullError}` : ''}`;
}
export async function syncActiveSiteNow(): Promise<SyncRunResult | null> {
  if (appState.workspaceSwitching || appState.dateSwitching || appState.syncInFlight) return null;
  const route = parseRoute(location.hash);
  if ((route.module === 'daily' && route.page === 'settings' && settingsState.dirty) || (route.module === 'daily' && route.page === 'main' && (materialDirty() || contactDirty()))) {
    appState.syncFeedback = '請先儲存目前編輯中的表單，再按立即同步。';
    return null;
  }
  const epoch = appState.activeSyncEpoch;
  appState.syncInFlight = true;
  try {
    await appState.daily.flush();
    const scope = await loadActiveSharedScope();
    if (!scope) { appState.syncFeedback = '請先登入並選擇共用工地。'; return null; }
    await Promise.all([persistActiveMemoryPartition(), persistActiveWaterPartition()]);
    const result = await runSyncOnce(scope);
    if (epoch !== appState.activeSyncEpoch) return null;
    appState.lastPulledAt = await loadLastPulledAt(scope);
    await refreshDailySyncStatus();
    if (result.memoryPulled) await refreshActiveMemoryCache();
    if (result.waterPulled && appState.water) await appState.water.refresh();
    if (result.dailyPulled) {
      const refreshed = await loadDailyDraftForDate(appState.daily.report.date);
      if (refreshed) appState.daily.mergeRemote(refreshed);
    }
    appState.syncFeedback = formatSyncFeedback(result, await listAllOperations(scope));
    appState.accountFeedback = `同步結果：${appState.syncFeedback}`;
    return result;
  } catch (error) {
    appState.syncFeedback = error instanceof Error ? `同步失敗：${error.message}` : '同步失敗，請查看共用工地的診斷資訊。';
    appState.accountError = appState.syncFeedback;
    return null;
  } finally { appState.syncInFlight = false; }
}
export function scheduleBackgroundSync(): void {
  if (appState.backgroundSyncTimer) window.clearTimeout(appState.backgroundSyncTimer);
  appState.backgroundSyncTimer = window.setTimeout(() => { appState.backgroundSyncTimer = undefined; void runBackgroundSync(); }, 350);
}
async function runBackgroundSync(): Promise<void> {
  if (appState.workspaceSwitching || appState.dateSwitching || appState.syncInFlight || !navigator.onLine || document.hidden) return;
  const epoch = appState.activeSyncEpoch;
  const scope = await loadActiveSharedScope().catch(() => null);
  if (!scope) { appState.unsubscribeSiteChanges?.(); appState.unsubscribeSiteChanges = null; appState.subscribedSiteId = null; return; }
  if (epoch !== appState.activeSyncEpoch) return;
  if (!appState.accountSites.length) {
    try {
      appState.accountSites = await listAccessibleSites(scope.userId);
      appState.accountActiveSiteId = scope.siteId;
      appState.accountActiveSiteRole = appState.accountSites.find((site) => site.id === scope.siteId)?.role ?? null;
      await cacheActiveSiteRole(scope.userId, appState.accountActiveSiteRole);
    } catch { /* Cached role remains available while offline. */ }
  }
  if (appState.subscribedSiteId !== scope.siteId) {
    appState.unsubscribeSiteChanges?.(); appState.subscribedSiteId = scope.siteId;
    appState.unsubscribeSiteChanges = subscribeToSiteChanges(scope, scheduleBackgroundSync);
  }
  appState.syncInFlight = true;
  try {
    await persistActiveMemoryPartition();
    const result = await runSyncOnce(scope, false);
    if (epoch !== appState.activeSyncEpoch) return;
    appState.lastPulledAt = await loadLastPulledAt(scope);
    if (result.memoryPulled) await refreshActiveMemoryCache();
    if (result.dailyPulled) { const report = await loadDailyDraftForDate(appState.daily.report.date); if (report) appState.daily.mergeRemote(report); }
    if (result.waterPulled && appState.water) await appState.water.refresh();
    await refreshDailySyncStatus();
    const focused = document.activeElement;
    if ((result.memoryPulled || result.dailyPulled) && !(focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) && !(parseRoute(location.hash).module === 'account' && appState.memoryImportPreview) && !appState.daily.expandedId && !appState.tradePickerOpen && !settingsState.dirty && !materialDirty() && !contactDirty()) await renderApp();
  } catch (error) {
    console.warn('背景同步失敗；本機佇列保留供重試。', error);
  } finally { appState.syncInFlight = false; }
}
export async function readCloudMemoryEntries(siteId: string): Promise<RemoteMemoryEntry[]> {
  const all: RemoteMemoryEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient().from('memory_entries')
      .select('id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at')
      .eq('site_id', siteId).order('id').range(offset, offset + 499);
    if (error) throw error;
    all.push(...(data ?? []) as RemoteMemoryEntry[]);
    if (!data || data.length < 500) return all;
  }
}
export const cloudMemorySignature = (rows: RemoteMemoryEntry[]): string => JSON.stringify(rows.map((row) => [row.id, row.revision, row.deleted_at]));
export function bindBackgroundSync(): void {
  window.addEventListener('memory-outbox-changed', scheduleBackgroundSync);
  window.addEventListener('online', scheduleBackgroundSync);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { void appState.daily.flush(); void persistActiveMemoryPartition(); void persistActiveWaterPartition(); } else scheduleBackgroundSync(); });
  window.setInterval(scheduleBackgroundSync, 30_000);
}
