import { loadDailyDraftForDate } from '../data/daily-repository';
import { createDailyDraft } from '../domain/daily';
import { renderApp, parseRoute } from '../main';
import { app, appState } from './state';
import { isReadOnlySite, scheduleBackgroundSync, syncActiveSiteNow, refreshDailySyncStatus } from './sync-runtime';
import { selectSharedSiteFromWorkspace } from '../account/account-controller';
import { readOnlyDailyActions } from '../daily/views/daily-view';
import { persistEntryDraft, capturePendingWork, showEntrySaveError } from '../daily/views/daily-entry';
export function bindWorkspaceEvents(): void {
  app.addEventListener('click', (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-shared-site-select]'); if (button?.dataset.sharedSiteSelect) { event.preventDefault(); void selectSharedSiteFromWorkspace(button.dataset.sharedSiteSelect); } });
  app.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const dailyMutation = target.closest<HTMLElement>('[data-daily-action],[data-work-commit],[data-work-move],[data-work-suggestion]');
    if (isReadOnlySite() && dailyMutation && !readOnlyDailyActions.has(dailyMutation.dataset.dailyAction ?? '')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const mutation = target.closest('[data-memory-confirm],[data-memory-reject],[data-memory-reject-selected],[data-settings-action="confirm"],[data-settings-action="delete"],[data-settings-action="delete-material-type"],[data-settings-action="rename-material-type"],[data-settings-action="add-material-type"],[data-site-search-action],[data-daily-action="finalize"]');
    if (!mutation) return;
    const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole;
    if (role === 'viewer') { event.preventDefault(); event.stopImmediatePropagation(); alert('檢視者無法修改或審核工地記憶。'); return; }
    window.setTimeout(scheduleBackgroundSync, 1000);
  }, true);
  app.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || appState.entryComposing || event.keyCode === 229) return;
    const target = event.target as HTMLInputElement;
    if (target.dataset.dailyField === 'workerCount' || target.dataset.dailyField === 'vendorNameSnapshot') {
      const card = target.closest('[data-trade]');
      const next = card?.querySelector<HTMLInputElement>(target.dataset.dailyField === 'workerCount' ? '[data-continuous-work]' : '[data-daily-field="workerCount"]');
      if (next) { event.preventDefault(); next.focus(); }
    }
  });
  app.addEventListener('submit', (event) => {
    if (!(event.target instanceof HTMLFormElement) || !event.target.dataset.settingsForm) return;
    const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole;
    if (role === 'viewer') { event.preventDefault(); event.stopImmediatePropagation(); alert('檢視者無法修改工地記憶。'); return; }
    window.setTimeout(scheduleBackgroundSync, 1000);
  }, true);
  app.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.dataset.memoryBackupImport) return;
    const role = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? appState.accountActiveSiteRole;
    if (role === 'viewer') { event.preventDefault(); event.stopImmediatePropagation(); event.target.value = ''; alert('檢視者無法匯入工地記憶。'); }
  }, true);
  app.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-sync-now]');
    if (!button || appState.syncInFlight) return;
    event.stopImmediatePropagation();
    button.disabled = true; button.textContent = '同步中…';
    await syncActiveSiteNow();
    await renderApp();
  });
  app.addEventListener('change', async (event) => {
    const target = event.target;
    const route = parseRoute(location.hash);
    if (!(target instanceof HTMLInputElement) || route.module !== 'daily' || route.page !== 'main' || target.dataset.dailyField !== 'date') return;
    event.stopImmediatePropagation();
    const nextDate = target.value;
    if (!nextDate || nextDate === appState.daily.report.date) return;
    if (appState.dateSwitching) return;
    appState.dateSwitching = true; appState.activeSyncEpoch += 1; app.inert = true;
    try {
    persistEntryDraft();
    if (!isReadOnlySite()) { capturePendingWork(); await appState.daily.flush(); }
    appState.daily.replaceReport((await loadDailyDraftForDate(nextDate)) ?? createDailyDraft(null, '', nextDate));
    appState.daily.expandedId = null; appState.dailyBasicsExpanded = false;
    await refreshDailySyncStatus(); await renderApp();
    } catch (error) { showEntrySaveError(error); await renderApp(); } finally { appState.dateSwitching = false; app.inert = false; scheduleBackgroundSync(); }
  }, true);
}
