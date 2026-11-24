import { loadDailyDraftForDate } from '../data/daily-repository';
import { createDailyDraft } from '../domain/daily';
import { renderApp } from '../main';
import { app, appState } from './state';
import { isReadOnlySite, scheduleBackgroundSync, refreshDailySyncStatus } from './sync-runtime';
import { readOnlyDailyActions } from '../daily/views/daily-view';
import { persistEntryDraft, capturePendingWork, showEntrySaveError } from '../daily/views/daily-entry';
import { notifyReact } from './react-store';
export async function switchDailyDate(nextDate: string): Promise<void> {
  if (!nextDate || nextDate === appState.daily.report.date || appState.dateSwitching || appState.workspaceSwitching) return;
  appState.dateSwitching = true; appState.activeSyncEpoch += 1; app.inert = true; notifyReact();
  try {
    persistEntryDraft();
    if (!isReadOnlySite()) { capturePendingWork(); await appState.daily.flush(); }
    appState.daily.replaceReport((await loadDailyDraftForDate(nextDate)) ?? createDailyDraft(null, '', nextDate));
    appState.daily.expandedId = null; appState.dailyBasicsExpanded = false;
    await refreshDailySyncStatus(); await renderApp();
  } catch (error) { showEntrySaveError(error); await renderApp(); }
  finally { appState.dateSwitching = false; app.inert = false; scheduleBackgroundSync(); notifyReact(); }
}
export function bindWorkspaceEvents(): void {
app.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const dailyMutation = target.closest<HTMLElement>('[data-daily-action],[data-work-commit],[data-work-move],[data-work-suggestion]');
    if (isReadOnlySite() && dailyMutation && !readOnlyDailyActions.has(dailyMutation.dataset.dailyAction ?? '')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const mutation = target.closest('[data-memory-confirm],[data-memory-reject],[data-memory-reject-selected],[data-settings-action="confirm"],[data-settings-action="delete"],[data-settings-action="delete-material-type"],[data-settings-action="delete-template"],[data-settings-action="add-material-type"],[data-material-action="delete-item"],[data-site-search-action],[data-daily-action="finalize"]');
    if (!mutation) return;
    const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole;
    if (role === 'viewer') { event.preventDefault(); event.stopImmediatePropagation(); alert('檢視者無法修改或審核工地記憶。'); return; }
    window.setTimeout(scheduleBackgroundSync, 1000);
  }, true);
app.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement) || !(event.target.dataset.settingsForm || event.target.dataset.materialItemForm)) return;
    const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole;
    if (role === 'viewer') { event.preventDefault(); event.stopImmediatePropagation(); alert('檢視者無法修改工地記憶。'); return; }
    window.setTimeout(scheduleBackgroundSync, 1000);
  }, true);
app.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.memoryBackupImport) return;
    const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole;
    if (role === 'viewer') { event.preventDefault(); event.stopImmediatePropagation(); event.target.value = ''; alert('檢視者無法匯入工地記憶。'); }
  }, true);
}
