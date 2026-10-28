import { bindTradePickerDialog } from './daily/trade-picker-dialog';
import { bindTabNavigation } from './daily/tab-navigation';
import { registerSW } from 'virtual:pwa-register';
import { transitionPwaUpdateState, PWA_UPDATE_SUCCESS_MARKER } from './pwa/update-state';
import { DailyController } from './daily/daily-controller';
import { databaseSummary, listMemoryCandidates, listRecentFinalizedReports, type MemoryCandidate, type MemoryCandidateKey, confirmMemoryCandidates, exportMemories, clearDebugLogs, deleteTemplate, createMaterialType, deleteMaterialType, confirmMemory, deleteMemory, loadDailyDraft, listMaterialTypes, pruneExpiredReports } from './data/daily-repository';
import type { DailyReportV3 } from './domain/daily';
import { withActiveSharedSite } from './daily/report-site';
import { groupMemoryCandidates, confirmationSelection, rejectionSelection, memoryCandidateImpact } from './settings/memory-review';
import { completeOAuthRedirect } from './auth/auth-service';
import { loadSharedContext } from './data/local/shared-context';
import { loadLastPulledAt } from './sync/engine';
import { loadActiveSharedScope } from './sync/context';
import { persistActiveMemoryPartition, restoreActiveMemoryPartition } from './data/memory-partition';
import { persistActiveWaterPartition, restoreActiveWaterPartition } from './data/water-partition';
import { escapeHtml } from './shared/html';
import { app, appState, type AppRoute, memoryReviewState, settingsState } from './app/state';
import { pwaUpdateNotice, clearPwaUpdateTimeout, normalizeSearch } from './app/shell';
import { bindBackgroundSync, refreshDailySyncStatus, refreshActiveMemoryCache, scheduleBackgroundSync } from './app/sync-runtime';
import { bindWorkspaceEvents } from './app/workspace-events';
import { renderAccountLoading, refreshAccount, renderAccountLoaded, bindAccountEvents } from './account/account-controller';
import { dailyHistoryView, dailyView, applyDailyReadOnly, updateDailySaveStatus } from './daily/views/daily-view';
import { bindMaterialConnectionResize, syncMaterialConnectionCurves, discardMaterialEditor, materialDirty } from './daily/views/material-view';
import { contactDirty } from './daily/views/contact-view';
import { restoreEntryScope, persistEntryDraft, savePendingDailyInput, showEntrySaveError } from './daily/views/daily-entry';
import { bindMaterialSuggestionEvents } from './daily/views/material-suggestions';
import { bindDailyInputEvents, bindContactInputEvents, bindSiteSearchEvents, handleDailyAction, bindBackgroundCollapseEvents, bindDailyKeyEvents } from './daily/views/daily-events';
import { bindDailyGestureEvents } from './daily/views/daily-gestures';
import { refreshSettings, dataSystemView, memoryReviewView, dailySettingsView, settingsHomeView, settingsSectionFromHash, prepareNextMemoryGroup, performMemoryReviewWrite, memoryCandidateLabels, rejectMemoryCandidate } from './settings/views/settings-view';
import { bindSettingsShortcutEvents, bindMaterialDetailEvents, bindSettingsChangeEvents, deleteTradeWithConfirm, bindSettingsFormEvents } from './settings/views/settings-events';
import { mountWater, bindWaterInputEvents } from './water-level/water-shell';
import './styles.css';
import './presentation.css';
import './daily/material.css';
import './daily/dialog.css';
import './daily/daily.css';
import './water-level/water.css';
import './account/account.css';
import './daily/input-workflow.css';
const pickerDialog = bindTradePickerDialog(app, async () => { appState.tradePickerOpen = false; await renderApp(); });
bindTabNavigation(app);
export function parseRoute(hash: string): AppRoute {
  const normalized = hash || '#daily';
  if (normalized === '#settings') return { module: 'settings', page: 'home' };
  if (normalized.startsWith('#settings/daily/')) return { module: 'daily', page: 'settings' };
  if (normalized === '#settings/water') return { module: 'water-level', page: 'settings' };
  if (normalized === '#settings/memory') return { module: 'settings', page: 'memory' };
  if (normalized === '#settings/data') return { module: 'settings', page: 'data' };
  if (normalized === '#settings/debug') return { module: 'account', page: 'debug' };
  if (normalized === '#settings/account') return { module: 'account', page: 'main' };
  if (normalized === '#account') return { module: 'account', page: 'main' };
  if (normalized === '#daily') return { module: 'daily', page: 'main' };
  if (normalized === '#daily/settings') return { module: 'daily', page: 'settings' };
  if (normalized === '#daily/history') return { module: 'daily', page: 'history' };
  if (normalized === '#water-level') return { module: 'water-level', page: 'main' };
  if (normalized === '#water-level/settings') return { module: 'water-level', page: 'settings' };
  return { module: 'daily', page: 'main' };
}
bindMaterialConnectionResize();
export async function renderApp(): Promise<void> {
  if (location.hash === '#settings/daily' || location.hash === '#daily/settings') { history.replaceState(null, '', '#settings'); return renderApp(); }
  if (location.hash === '#water-level/settings') { history.replaceState(null, '', '#settings/water'); return renderApp(); }
  if (location.hash === '#settings/daily/vendors') { history.replaceState(null, '', '#settings/daily/trade-tasks'); return renderApp(); }
  if (location.hash === '#account') { history.replaceState(null, '', '#settings/account'); return renderApp(); }
  const token = ++appState.renderToken; const route = parseRoute(location.hash); const previousRoute = appState.renderedRoute; appState.renderedRoute = route; appState.water = undefined;
  if (route.module === 'settings' && route.page === 'home' && (previousRoute?.module === 'daily' || previousRoute?.module === 'water-level') && previousRoute.page === 'main') appState.settingsReturnModule = previousRoute.module;
  if (route.module === 'account') { if (route.page === 'debug') appState.settingsDebug = await databaseSummary(); if (token !== appState.renderToken) return; renderAccountLoading(); void refreshAccount(() => { if (token !== appState.renderToken || parseRoute(location.hash).module !== 'account') return; if (appState.accountLoadCoreReady) renderAccountLoaded(); else renderAccountLoading(); }); return; }
  if (!appState.accountAuth.enabled) await refreshAccount();
  if (token !== appState.renderToken) return;
  if (route.module === 'settings' && route.page === 'home') { appState.memoryCandidates = await listMemoryCandidates(); if (token !== appState.renderToken) return; app.innerHTML = `${settingsHomeView()}${pwaUpdateNotice()}`; return; }
  if (route.module === 'settings') { if (route.page === 'memory') { appState.memoryCandidates = await listMemoryCandidates(); const keys = new Set(appState.memoryCandidates.map((row) => row.key)); memoryReviewState.explicitKeys = new Set([...memoryReviewState.explicitKeys].filter((key) => keys.has(key))); memoryReviewState.expandedKeys = new Set([...memoryReviewState.expandedKeys].filter((key) => keys.has(key))); const groups = groupMemoryCandidates(appState.memoryCandidates); if (memoryReviewState.openKind === undefined) memoryReviewState.openKind = groups[0]?.kind ?? null; else if (memoryReviewState.openKind !== null && !groups.some((group) => group.kind === memoryReviewState.openKind)) memoryReviewState.openKind = groups.find((group) => group.kind === memoryReviewState.nextKind)?.kind ?? groups[0]?.kind ?? null; memoryReviewState.nextKind = null; } else { settingsState.activeSection = 'backup'; await refreshSettings(); } if (token !== appState.renderToken) return; app.innerHTML = `${route.page === 'data' ? dataSystemView() : memoryReviewView()}${pwaUpdateNotice()}`; return; }
  if (route.module === 'daily') {
    if (!appState.accountAuth.enabled) await refreshAccount();
    if (token !== appState.renderToken) return;
    if (route.page === 'main') {
      // 設定頁改過主檔後回到日報，建議清單要讀到最新記憶
      if (previousRoute && !(previousRoute.module === 'daily' && previousRoute.page === 'main')) { await refreshActiveMemoryCache(); if (token !== appState.renderToken) return; }
      const site = appState.accountAuth.user ? appState.accountSites.find((item) => item.id === appState.accountActiveSiteId) : undefined;
      const aligned = withActiveSharedSite(appState.daily.report, site);
      if (aligned !== appState.daily.report) {
        if (site?.role === 'viewer') appState.daily.report = aligned;
        else appState.daily.update(() => { appState.daily.report = aligned; });
      }
    }
    if (route.page === 'settings') { const section = settingsSectionFromHash(location.hash) ?? 'sites'; if (section !== settingsState.activeSection) Object.assign(settingsState, { activeSection: section, editingId: null, adding: false, dirty: false, selectedTradeTypeId: null, taskSearchKeyword: '', editingKind: null, expandedMaterialTypeId: null, editingMaterialItemId: null }); await refreshSettings(); }
    else if (route.page === 'history') appState.finalizedReports = await listRecentFinalizedReports();
    if (token !== appState.renderToken) return;
    restoreEntryScope(); persistEntryDraft();
    pickerDialog.beforeRender();
    app.innerHTML = `${route.page === 'settings' ? dailySettingsView() : route.page === 'history' ? dailyHistoryView() : dailyView()}${pwaUpdateNotice()}`;
    applyDailyReadOnly();
    pickerDialog.afterRender();
    requestAnimationFrame(syncMaterialConnectionCurves);
    return;
  }
  try { await mountWater(route, token); } catch (error) { if (token !== appState.renderToken) return; const summary = error instanceof Error ? error.message : '無法讀取本機水位資料。'; app.innerHTML = `<main class="app-shell"><section class="form-card"><h1>水位功能暫時無法開啟</h1><p>錯誤摘要：${escapeHtml(summary)}</p><p><a href="#water-level">重新載入</a>　<a href="#daily">返回施工日報</a></p></section></main>${pwaUpdateNotice()}`; }
}
bindDailyInputEvents();
bindSettingsShortcutEvents();
bindWorkspaceEvents();
bindAccountEvents();
bindWaterInputEvents();
bindContactInputEvents();
bindMaterialSuggestionEvents();
bindSettingsChangeEvents();
bindSiteSearchEvents();
app.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement; const route = parseRoute(location.hash);
  const appAction = target.closest<HTMLElement>('[data-app-action]')?.dataset.appAction;
  if (appAction === 'dismiss-pwa-update') { clearPwaUpdateTimeout(); appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'dismiss'); await renderApp(); return; }
  if (appAction === 'apply-pwa-update' && appState.applyPwaUpdate && appState.pwaUpdateState !== 'applying') {
    appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'apply');
    if (appState.pwaUpdateState !== 'applying') return;
    await renderApp();
    try {
      await Promise.all([appState.daily.flush(), persistActiveMemoryPartition(), persistActiveWaterPartition()]);
      appState.pwaUpdateTimeout = window.setTimeout(() => { if (appState.pwaUpdateState === 'applying') { appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'waiting'); void renderApp(); } }, 15_000);
      await appState.applyPwaUpdate();
    } catch {
      clearPwaUpdateTimeout();
      appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'failed');
      await renderApp();
    }
    return;
  }
  if (route.module === 'settings' && route.page === 'memory') {
    const groupToggle = target.closest<HTMLButtonElement>('[data-memory-group-toggle]'); if (groupToggle) { const kind = groupToggle.dataset.memoryGroupToggle as MemoryCandidate['kind']; memoryReviewState.openKind = memoryReviewState.openKind === kind ? null : kind; memoryReviewState.expandedKeys.clear(); await renderApp(); return; }
    const detailToggle = target.closest<HTMLButtonElement>('[data-memory-detail-toggle]'); if (detailToggle) { const key = detailToggle.dataset.memoryDetailToggle as MemoryCandidateKey; if (memoryReviewState.expandedKeys.has(key)) memoryReviewState.expandedKeys.delete(key); else memoryReviewState.expandedKeys.add(key); await renderApp(); return; }
    const confirmButton = target.closest<HTMLButtonElement>('[data-memory-confirm]'); if (confirmButton) { const selected = appState.memoryCandidates.filter((row) => memoryReviewState.explicitKeys.has(row.key)); const confirmation = confirmationSelection(selected.map((row) => row.key), appState.memoryCandidates); if (!confirmation.keys.length) return; prepareNextMemoryGroup(); if (!await performMemoryReviewWrite(() => confirmMemoryCandidates(confirmation.keys), '確認失敗')) return; memoryReviewState.feedback = `已確認 ${confirmation.keys.length} 筆記憶。`; memoryReviewState.feedbackTone = 'success'; memoryReviewState.explicitKeys.clear(); memoryReviewState.expandedKeys.clear(); await renderApp(); return; }
    const rejectSelected = target.closest<HTMLButtonElement>('[data-memory-reject-selected]'); if (rejectSelected) { const explicit = appState.memoryCandidates.filter((row) => memoryReviewState.explicitKeys.has(row.key)); const rejection = rejectionSelection(explicit.map((row) => row.key), appState.memoryCandidates); const selected = rejection.keys.map((key) => appState.memoryCandidates.find((row) => row.key === key)).filter((row): row is MemoryCandidate => Boolean(row)); if (!selected.length || selected.some((row) => memoryCandidateImpact(appState.daily.report, row) > 0)) return; const summary = [...new Set(selected.map((row) => memoryCandidateLabels[row.kind]))].join('、'); if (!window.confirm(`駁回所選與關聯的 ${selected.length} 筆候選？\n\n類型：${summary}\n目前草稿不受影響，定稿資料不會變更。`)) return; if (!window.confirm('再次確認：駁回後無法還原，確定繼續？')) return; prepareNextMemoryGroup(); if (!await performMemoryReviewWrite(async () => { for (const candidate of selected) await rejectMemoryCandidate(candidate); }, '駁回失敗')) return; memoryReviewState.feedback = `已駁回 ${selected.length} 筆候選。`; memoryReviewState.feedbackTone = 'success'; memoryReviewState.explicitKeys.clear(); memoryReviewState.expandedKeys.clear(); await renderApp(); return; }
    const rejectButton = target.closest<HTMLButtonElement>('[data-memory-reject]'); if (rejectButton) { const candidate = appState.memoryCandidates.find((row) => row.key === rejectButton.dataset.memoryReject); if (!candidate) return; const impact = memoryCandidateImpact(appState.daily.report, candidate); if (!window.confirm(`駁回「${candidate.name}」？\n\n目前草稿將連動處理 ${impact} 筆內容；定稿資料不會變更。`)) return; if (impact && !window.confirm('再次確認：此操作會立即改寫目前草稿，確定駁回？')) return; prepareNextMemoryGroup(); if (!await performMemoryReviewWrite(() => rejectMemoryCandidate(candidate), '駁回失敗')) return; memoryReviewState.feedback = `已駁回「${candidate.name}」。`; memoryReviewState.feedbackTone = 'success'; memoryReviewState.explicitKeys.delete(candidate.key); memoryReviewState.expandedKeys.delete(candidate.key); await renderApp(); return; }
  }
  if (route.module === 'settings' && route.page === 'data') { const action = target.closest<HTMLButtonElement>('[data-settings-action]')?.dataset.settingsAction; if (action === 'export-memory-backup') { const payload = await exportMemories(); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `施工日報-記憶備份-${payload.exportedAt.slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); appState.memoryBackupFeedback = '已下載記憶備份。'; await renderApp(); return; } if (action === 'copy-debug') { await navigator.clipboard.writeText(JSON.stringify(appState.settingsDebug, null, 2)); return; } if (action === 'clear-debug' && window.confirm('確定清除偵錯紀錄？')) { await clearDebugLogs(); await renderApp(); return; } }
  // The settings action dispatcher intentionally shares one branch across heterogeneous sections.
  if (route.module === 'daily' && route.page === 'settings' && target.closest('[data-settings-action="add"]')) {
    settingsState.adding = true;
    settingsState.editingId = null;
    settingsState.editingKind = null;
    settingsState.dirty = false;
    await renderApp();
    return;
  }
  if (route.module === 'daily' && route.page === 'settings') { const actionButton = target.closest<HTMLButtonElement>('[data-settings-action]'); if (actionButton) { const action = actionButton.dataset.settingsAction!; const id = actionButton.dataset.id!; const kind = actionButton.dataset.settingsKind as 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations' | undefined; if (action === 'export-memory-backup') { const payload = await exportMemories(); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `施工日報-記憶備份-${payload.exportedAt.slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); appState.memoryBackupFeedback = '已下載記憶備份。'; await renderApp(); return; } if (action === 'add-material-type') { settingsState.adding = true; settingsState.editingId = null; settingsState.editingKind = null; await renderApp(); return; } if (action === 'delete-template') { if (!window.confirm(`確定刪除模板「${actionButton.dataset.name ?? ''}」？`)) return; await deleteTemplate(id); await persistActiveMemoryPartition(); settingsState.editingId = null; await renderApp(); return; } if (action === 'delete-material-type') { const current = appState.materialTypes.find((row) => row.id === id); const entries = appState.daily.report.standaloneMaterialEntries.filter((entry) => entry.materialTypeId === id); const normal = entries.filter((entry) => entry.entryType !== 'independent').length; const independent = entries.length - normal; const linked = entries.filter((entry) => entry.entryType === 'independent' && entry.connectedTradeSectionId).length; if (!window.confirm(`刪除材料類型「${current?.name ?? ''}」？\n\n普通進料 ${normal} 筆\n獨立進料 ${independent} 筆${linked ? `（已連接 ${linked} 筆）` : ''}\n共計刪除 ${entries.length} 筆進料及相關搜尋記憶。\n\n此操作無法復原。`)) return; try { appState.daily.report = await deleteMaterialType(appState.daily.report, id); } catch (error) { alert(error instanceof Error ? error.message : '刪除材料類型失敗。'); } await renderApp(); return; } if (action === 'toggle-trade-tasks') { settingsState.selectedTradeTypeId = settingsState.selectedTradeTypeId === actionButton.dataset.tradeTypeId ? null : actionButton.dataset.tradeTypeId ?? null; settingsState.editingId = null; settingsState.editingKind = null; settingsState.adding = false; settingsState.taskSearchKeyword = ''; await renderApp(); return; } if (action === 'edit-trade') { settingsState.selectedTradeTypeId = actionButton.dataset.tradeTypeId ?? null; settingsState.editingId = actionButton.dataset.tradeTypeId ?? null; settingsState.editingKind = 'trade'; settingsState.adding = false; await renderApp(); return; } if (action === 'delete-trade') { await deleteTradeWithConfirm(actionButton.dataset.tradeTypeId ?? ''); return; } if (action === 'add-trade') { appState.dailyPreviewOpen = false; settingsState.selectedTradeTypeId = null; settingsState.adding = true; settingsState.editingId = null; settingsState.editingKind = 'trade'; } else if (action === 'add-task' || action === 'add-vendor') { settingsState.adding = true; settingsState.editingId = null; settingsState.editingKind = action === 'add-task' ? 'tasks' : 'vendors'; } else if (action === 'clear-task-search') { settingsState.taskSearchKeyword = ''; await renderApp(); app.querySelector<HTMLInputElement>('[data-settings-search="tasks"]')?.focus(); return; } else if (action === 'edit-task' || action === 'edit-vendor' || action === 'edit') { settingsState.editingId = id; settingsState.editingKind = action === 'edit-task' ? 'tasks' : action === 'edit-vendor' ? 'vendors' : null; settingsState.adding = false; } else if (action === 'cancel') { settingsState.editingId = null; settingsState.editingKind = null; settingsState.adding = false; settingsState.dirty = false; } else if (action === 'confirm' && kind) await confirmMemory(kind as 'vendors' | 'tasks' | 'locations', id); else if (action === 'delete' && kind) { if (!window.confirm(`確定刪除「${actionButton.dataset.name ?? ''}」？\n\n此操作將影響設定記憶與目前草稿中的相關內容；既有日報快照與已複製文字不受影響。`)) return; const savedDraft = await deleteMemory(kind, id); if (savedDraft) appState.daily.mergeRemote(savedDraft); settingsState.editingId = null; settingsState.editingKind = null; if (kind === 'trades' && settingsState.selectedTradeTypeId === id) { settingsState.selectedTradeTypeId = null; settingsState.taskSearchKeyword = ''; } } else if (action === 'copy-debug') await navigator.clipboard.writeText(JSON.stringify(appState.settingsDebug, null, 2)); else if (action === 'clear-debug') { if (window.confirm('確定清除偵錯紀錄？')) await clearDebugLogs(); } await renderApp(); return; } }
  const tab = target.closest<HTMLButtonElement>('[data-daily-tab]');
  if (tab && route.module === 'daily') {
    if (appState.tabSwitching) return;
    const previous = appState.daily.report.activeTab;
    const restoreTabFocus = () => {
      app.querySelectorAll<HTMLButtonElement>('[data-daily-tab]').forEach(button => { button.tabIndex = button.dataset.dailyTab === appState.daily.report.activeTab ? 0 : -1; });
      app.querySelector<HTMLButtonElement>(`[data-daily-tab="${appState.daily.report.activeTab}"]`)?.focus();
    };
    if (!discardMaterialEditor()) { restoreTabFocus(); return; }
    appState.tabSwitching = true;
    try {
      await savePendingDailyInput(); persistEntryDraft(); appState.activeContactSearch = null; appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null;
      appState.daily.switchTab(tab.dataset.dailyTab as DailyReportV3['activeTab']);
      await appState.daily.flush(); await renderApp(); restoreTabFocus();
    } catch (error) { appState.daily.update(() => { appState.daily.report.activeTab = previous; }); showEntrySaveError(error); await renderApp(); restoreTabFocus(); }
    finally { appState.tabSwitching = false; }
    return;
  }
  const waterButton = target.closest<HTMLButtonElement>('[data-water-action],[data-water-view]');
  if (waterButton && route.module === 'water-level' && appState.water) { if (waterButton.dataset.waterView) { appState.water.mode = waterButton.dataset.waterView; appState.water.render(); return; } if (waterButton.dataset.waterAction) { await appState.water.handleAction(waterButton.dataset.waterAction, waterButton.dataset.id); if (route.page === 'settings') appState.water.renderSettings(); } return; }
  if (route.module === 'daily' && route.page === 'history') { const finalized = target.closest<HTMLElement>('[data-daily-action="copy-finalized"]'); if (finalized) { const report = appState.finalizedReports.find((item) => item.id === finalized.dataset.finalizedId); if (report) await navigator.clipboard.writeText(report.outputText); return; } }
  if (appState.workAuxMenuId && route.module === 'daily' && route.page === 'main' && !target.closest('[data-work-actions]')) { appState.workAuxMenuId = null; await renderApp(); return; }
  const actionElement = target.closest<HTMLElement>('[data-daily-action]'); if (!actionElement || route.module !== 'daily' || route.page !== 'main') return;
  await handleDailyAction(target, actionElement);
});
bindBackgroundCollapseEvents();
bindDailyGestureEvents();
bindDailyKeyEvents();
bindSettingsFormEvents();
bindMaterialDetailEvents();
window.addEventListener('beforeunload', (event) => { if (settingsState.dirty || materialDirty() || contactDirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('hashchange', () => { const route = parseRoute(location.hash); if (appState.materialEditor && !discardMaterialEditor()) { history.replaceState(null, '', '#daily'); return; } appState.activeContactSearch = null; appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null; if (route.module === 'water-level') void appState.daily.flush(); if (route.module === 'daily' && route.page === 'main') { appState.daily.expandedId = null; appState.dailyBasicsExpanded = false; } void renderApp(); });
bindBackgroundSync();
async function bootstrap(): Promise<void> { try { await completeOAuthRedirect(); } catch (error) { appState.accountError = error instanceof Error ? `登入回傳處理失敗：${error.message}` : '登入回傳處理失敗。'; history.replaceState(null, '', `${location.pathname}#settings/account`); } await Promise.all([restoreActiveMemoryPartition(), restoreActiveWaterPartition()]); appState.daily = new DailyController(await loadDailyDraft(), (state) => { appState.dailySaveState = state; if (state === 'saved') { appState.dailyLastSavedAt = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }); void refreshDailySyncStatus(); } updateDailySaveStatus(); }); appState.materialTypes = await listMaterialTypes(); for (const name of [...new Set(appState.daily.report.standaloneMaterialEntries.filter((entry) => !entry.materialTypeId && entry.materialTypeSnapshot.trim()).map((entry) => entry.materialTypeSnapshot.trim()))]) { try { await createMaterialType(name); } catch { /* existing normalized type is safe to reuse */ } } appState.materialTypes = await listMaterialTypes(); let migrated = false; appState.daily.report.standaloneMaterialEntries.forEach((entry) => { if (!entry.materialTypeId) { const type = appState.materialTypes.find((row) => row.normalizedName === normalizeSearch(entry.materialTypeSnapshot)); if (type) { entry.materialTypeId = type.id; entry.materialTypeSnapshot = type.name; migrated = true; } } }); if (migrated) await appState.daily.flush(); await refreshActiveMemoryCache(); await Promise.all([persistActiveMemoryPartition(), persistActiveWaterPartition()]); await refreshDailySyncStatus(); const initialScope = await loadActiveSharedScope().catch(() => null); appState.accountActiveSiteId = initialScope?.siteId ?? null; appState.accountActiveSiteRole = initialScope ? (await loadSharedContext(initialScope.userId)).activeSiteRole ?? null : null; appState.lastPulledAt = initialScope ? await loadLastPulledAt(initialScope) : null; if (!location.hash) location.hash = '#daily'; await renderApp(); if (appState.pwaUpdateState === 'success') window.setTimeout(() => { appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'dismiss'); void renderApp(); }, 5_000); if (import.meta.env.PROD) appState.applyPwaUpdate = registerSW({ onNeedRefresh: () => { appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'available'); void renderApp(); }, onNeedReload: () => { clearPwaUpdateTimeout(); if (appState.pwaUpdateState === 'applying' || appState.pwaUpdateState === 'waiting') { try { sessionStorage.setItem(PWA_UPDATE_SUCCESS_MARKER, '1'); window.location.reload(); } catch { appState.pwaUpdateState = transitionPwaUpdateState(appState.pwaUpdateState, 'failed'); void renderApp(); } } else window.location.reload(); }, onRegisterError: () => { clearPwaUpdateTimeout(); appState.pwaUpdateState = transitionPwaUpdateState('applying', 'failed'); void renderApp(); } }); }
void pruneExpiredReports();
bootstrap().then(scheduleBackgroundSync).catch(() => { app.innerHTML = '<main class="app-shell"><h1>無法開啟施工日報</h1><p>請確認瀏覽器允許本機資料儲存。</p></main>'; });
