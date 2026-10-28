import { entryDraftKey, readEntryDraft } from '../entry-workflow';
import { listMemories, selectSiteMemory } from '../../data/daily-repository';
import { normalizeName } from '../../format/normalization';
import { persistActiveMemoryPartition } from '../../data/memory-partition';
import { snapshotWorkDrafts, restoreWorkDrafts, consumeWorkDrafts } from '../work-input';
import { recordMemoryApplications } from '../../settings/memory-applications';
import { withWorkspaceLock } from '../../sync/workspace-lock';
import { renderApp } from '../../main';
import { appState, app } from '../../app/state';
import { isReadOnlySite, refreshActiveMemoryCache } from '../../app/sync-runtime';
import { tradePickerResults, updateDailySaveStatus } from './daily-view';
export function updateDailyInput(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  if (isReadOnlySite()) return;
  const name = target.dataset.dailyField; if (!name || name === 'date') return;

  const tradeId = target.closest<HTMLElement>('[data-trade]')?.dataset.trade; const workId = target.closest<HTMLElement>('[data-work]')?.dataset.work; const materialId = target.closest<HTMLElement>('[data-material]')?.dataset.material; const standalone = Boolean(target.closest<HTMLElement>('[data-material-standalone]')); const contactId = target.closest<HTMLElement>('[data-contact]')?.dataset.contact; const specialId = target.closest<HTMLElement>('[data-special]')?.dataset.special;
  const trade = tradeId ? appState.daily.trade(tradeId) : undefined; const work = trade?.workItems.find((item) => item.id === workId); const material = materialId && standalone ? appState.daily.materialEntry(materialId) : undefined; const contact = appState.daily.report.contacts.find((item) => item.id === contactId); const special = appState.daily.report.specialItems.find((item) => item.id === specialId); const destination = work ?? material ?? trade ?? contact ?? special ?? appState.daily.report;
  if (trade) appState.daily.updateTradeOutputData(trade.id, () => { (destination as unknown as Record<string, string>)[name] = target.value; if (name === 'taskTextSnapshot' && work) work.taskId = null; if (name === 'tradeNameSnapshot') trade.tradeTypeId = appState.dailyTrades.find((row) => row.normalizedName === normalizeName(target.value))?.id ?? null; if (name === 'vendorNameSnapshot') trade.vendorId = appState.dailyVendors.find((row) => row.tradeTypeId === trade.tradeTypeId && row.normalizedName === normalizeName(target.value))?.id ?? null; });
  else appState.daily.update(() => { (destination as unknown as Record<string, string>)[name] = target.value; });
}
export function refreshTradePickerSearch(target: HTMLInputElement): void { appState.tradePickerSearch = target.value; const results = app.querySelector<HTMLElement>('[data-trade-picker-results]'); if (results) results.innerHTML = tradePickerResults(); const clear = app.querySelector<HTMLButtonElement>('[data-daily-action="clear-trade-search"]'); if (clear) clear.hidden = !appState.tradePickerSearch; }
export function refreshSiteSearch(target: HTMLInputElement): void { appState.siteSearchQuery = target.value; appState.siteSearchOpen = true; appState.daily.update(() => { appState.daily.report.siteId = null; appState.daily.report.siteNameSnapshot = target.value; }); void renderApp().then(() => { const input = app.querySelector<HTMLInputElement>('[data-site-search]'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); }
export async function activateSiteSearch(target: HTMLInputElement): Promise<void> { if (appState.siteSearchOpen) return; appState.siteSearchOpen = true; appState.siteSearchQuery = target.value; appState.dailySites = await listMemories('sites'); await renderApp(); const input = app.querySelector<HTMLInputElement>('[data-site-search]'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }
export async function selectDailySite(value: string): Promise<void> { try { const result = await selectSiteMemory(appState.daily.report, value); appState.daily.report = result.report; appState.dailySites = [result.site, ...appState.dailySites.filter((site) => site.id !== result.site.id)]; await persistActiveMemoryPartition(); appState.siteSearchOpen = false; appState.siteSearchQuery = ''; await renderApp(); } catch (error) { alert(error instanceof Error ? error.message : '設定工地失敗，請稍後再試。'); } }
export function showEntrySaveError(error: unknown): void {
  appState.dailyCopyFeedback = error instanceof Error ? error.message : '本機保存失敗，請重試。';
  appState.entrySaveError = appState.dailyCopyFeedback;
  updateDailySaveStatus();
  let notice = app.querySelector<HTMLElement>('[data-entry-save-error]');
  if (!notice) { notice = document.createElement('p'); notice.dataset.entrySaveError = ''; notice.setAttribute('role', 'alert'); app.prepend(notice); }
  notice.textContent = appState.dailyCopyFeedback;
}
export function persistEntryDraft(): void {
  if (!appState.entryScopeKey || isReadOnlySite() || appState.entryDraftStorageBlocked) return;
  try { localStorage.setItem(appState.entryScopeKey, JSON.stringify({ contact: appState.contactEditor, work: snapshotWorkDrafts() })); }
  catch (error) { showEntrySaveError(error); }
}
export function restoreEntryScope(): void {
  const key = entryDraftKey(appState.accountAuth.user?.id, appState.accountActiveSiteId ?? appState.daily.report.siteId, appState.daily.report.date);
  if (key === appState.entryScopeKey) return;
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
