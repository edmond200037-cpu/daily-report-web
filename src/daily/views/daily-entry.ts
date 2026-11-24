import { entryDraftKey, readEntryDraft } from '../entry-workflow';
import { selectSiteMemory } from '../../data/daily-repository';
import { normalizeName } from '../../format/normalization';
import { persistActiveMemoryPartition } from '../../data/memory-partition';
import { snapshotWorkDrafts, restoreWorkDrafts, consumeWorkDrafts } from '../work-input';
import { recordMemoryApplications } from '../../settings/memory-applications';
import { withWorkspaceLock } from '../../sync/workspace-lock';
import { renderApp } from '../../main';
import { appState, app } from '../../app/state';
import { isReadOnlySite, refreshActiveMemoryCache } from '../../app/sync-runtime';
import { updateDailySaveStatus } from './daily-view';
export async function selectDailySite(value: string): Promise<void> { try { const result = await selectSiteMemory(appState.daily.report, value); appState.justAddedEntry = null; appState.daily.report = result.report; appState.dailySites = [result.site, ...appState.dailySites.filter((site) => site.id !== result.site.id)]; await persistActiveMemoryPartition(); appState.siteSearchOpen = false; appState.siteSearchQuery = ''; await renderApp(); } catch (error) { alert(error instanceof Error ? error.message : '設定工地失敗，請稍後再試。'); } }
export function showEntrySaveError(error: unknown): void {
  appState.dailyCopyFeedback = error instanceof Error ? error.message : '本機保存失敗，請重試。';
  appState.entrySaveError = appState.dailyCopyFeedback;
  updateDailySaveStatus();

}
export function persistEntryDraft(): boolean {
  if (!appState.entryScopeKey || isReadOnlySite() || appState.entryDraftStorageBlocked) return false;
  try { localStorage.setItem(appState.entryScopeKey, JSON.stringify({ contact: appState.contactEditor, work: snapshotWorkDrafts() })); return true; }
  catch (error) { showEntrySaveError(error); return false; }
}
export function restoreEntryScope(): void {
  const key = entryDraftKey(appState.accountAuth.user?.id, appState.accountActiveSiteId ?? appState.daily.report.siteId, appState.daily.report.date);
  if (key === appState.entryScopeKey) return;
  appState.justAddedEntry = null;
  persistEntryDraft(); appState.entryScopeKey = key; appState.entryDraftStorageBlocked = false;
  appState.contactEditor = null; appState.contactEditorCollapsed = false; restoreWorkDrafts([]); appState.lastContactDate = ''; appState.tradePickerOpen = false;
  try { const stored = readEntryDraft(localStorage, key); appState.contactEditor = stored.contact; restoreWorkDrafts(stored.work); }
  catch (error) { appState.entryDraftStorageBlocked = true; showEntrySaveError(error); }
}
export function capturePendingWork(): void {
  for (const [id, text] of consumeWorkDrafts()) { for (const value of text.split('、').map((part) => part.trim()).filter(Boolean)) appState.daily.addWorkItem(id, value); const input = app.querySelector<HTMLInputElement>(`[data-continuous-work="${id}"]`); if (input) input.value = ''; }
}
export async function savePendingDailyInput(): Promise<void> { capturePendingWork(); await appState.daily.flush(); persistEntryDraft(); }
export async function commitInputMemories(capture = true): Promise<void> {
  if (isReadOnlySite()) return;
  if (capture) capturePendingWork(); await appState.daily.flush();
  const report = structuredClone(appState.daily.report);
  const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role;
  if (role === 'viewer') return;
  const commit = async () => withWorkspaceLock(async () => {
    await persistActiveMemoryPartition();
    await recordMemoryApplications(report);
    await refreshActiveMemoryCache();
    appState.daily.update(() => {
      for (const trade of appState.daily.report.tradeSections) {
        trade.tradeTypeId = appState.dailyTrades.find((row) => row.normalizedName === normalizeName(trade.tradeNameSnapshot))?.id ?? null;
        trade.vendorId = appState.dailyVendors.find((row) => row.tradeTypeId === trade.tradeTypeId && row.normalizedName === normalizeName(trade.vendorNameSnapshot))?.id ?? null;
        for (const work of trade.workItems) work.taskId = appState.dailyTasks.find((row) => row.tradeTypeId === trade.tradeTypeId && row.normalizedName === normalizeName(work.taskTextSnapshot))?.id ?? null;
      }
    });
    await appState.daily.flush();
  });
  const next = appState.memoryCommitTail.then(commit, commit); appState.memoryCommitTail = next.catch(() => undefined); return next;
}
