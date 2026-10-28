import { applyLocationMemory } from '../floor';
import { normalizeName } from '../../format/normalization';
import { editContactEntry, appendContactTask, applyContactPlannedDate } from '../entry-workflow';
import { bindWorkGestures } from '../work-gestures';
import { workDetailFields, snapshotDetails, workUndoScope, canRestoreDetails } from '../work-detail-undo';
import { recentTradeVendor } from '../trade-picker';
import { formatDailyReport } from '../daily-formatter';
import { saveMaterialEntry, listMaterialTypes, listMaterialMemory, saveContactEntry, finalizeDailyReport } from '../../data/daily-repository';
import { validateTrade, duplicateWorkItemIds, validateDailyForFinalization } from '../daily-validator';
import { selectActiveSharedSite } from '../../data/local/shared-context';
import { bindWorkInput, clearWorkItemDetails } from '../work-input';
import { escapeHtml } from '../../shared/html';
import { renderApp, parseRoute } from '../../main';
import { app, appState, tradeDrag, workItemDrag, tradeSwipe } from '../../app/state';
import { memoryOrder, normalizeSearch } from '../../app/shell';
import { isReadOnlySite, switchActiveDataPartition, scheduleBackgroundSync } from '../../app/sync-runtime';
import { selectSharedSiteFromWorkspace, refreshAccount } from '../../account/account-controller';
import { updateDailySaveStatus, refreshWorkItemComposer, focusWorkItemComposer, workItemComposerState, focusWorkAuxMenu, focusWorkActionsTrigger } from './daily-view';
import { refreshMaterialConnectionSearch, discardMaterialEditor, startMaterialEditor, materialValidation, syncMaterialEditor, enqueueMaterialConnectionUndo } from './material-view';
import { refreshContactSearch, activateContactSearch, contactDirty, refreshContactTaskList, appendPendingContactTask, startContactEntry, refreshContactSuggestions } from './contact-view';
import { persistEntryDraft, showEntrySaveError, commitInputMemories, refreshTradePickerSearch, refreshSiteSearch, activateSiteSearch, selectDailySite, savePendingDailyInput, capturePendingWork } from './daily-entry';
import { deleteItemBySwipe, pruneTradeUndoQueue, clearWorkItemDrag, clearTradeDrag, clearTradeSwipe } from './daily-gestures';
import { refreshTaskSearch, refreshTradeSearch } from '../../settings/views/settings-view';
const backgroundCollapseExclusions = '.trade-card,.contact-card,.app-header,.top-tabs,.basics,.daily-tabs,.settings-button,.floating-add-trade,.preview,.form-card,button,input,textarea,select,label,a,[role="dialog"],.dialog-backdrop,.trade-picker,[data-ignore-background-collapse]';
export async function handleDailyAction(target: HTMLElement, actionElement: HTMLElement): Promise<void> {
  const action = actionElement.dataset.dailyAction!;
  if (appState.suppressTradeSummaryClick && actionElement.closest('.trade-row-summary__toggle')) { appState.suppressTradeSummaryClick = false; return; }
  if (action === 'undo-trade-delete') {
    pruneTradeUndoQueue();
    const entry = appState.tradeUndoQueue.pop();
    if (!entry) return;
    window.clearTimeout(entry.timer);
    const result = appState.daily.restoreDeletedItem(entry.undo);
    try { await appState.daily.flush(); } catch { alert('復原儲存失敗，請勿關閉頁面後再試。'); }
    if (result.skipped) appState.dailyCopyFeedback = `已復原工程條目；${result.skipped} 筆獨立進料已改連其他工種，未覆蓋。`;
    await renderApp(); return;
  }
  if (action === 'fix-entry') { appState.dailyPreviewOpen = false; appState.daily.expandedId = actionElement.dataset.id!; appState.daily.report.activeTab = 'engineering'; appState.dailyPreviewOpen = false; await renderApp(); const trade = appState.daily.trade(appState.daily.expandedId)!; const issue = validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id))[0]?.field; const name = issue === 'vendor' ? 'vendorNameSnapshot' : issue === 'workerCount' ? 'workerCount' : issue === 'trade' ? 'tradeNameSnapshot' : ''; const selector = name ? `[data-trade="${escapeHtml(trade.id)}"] [data-daily-field="${name}"]` : `[data-continuous-work="${escapeHtml(trade.id)}"]`; app.querySelector<HTMLInputElement>(selector)?.focus(); return; }
  if (action === 'keep-trade') { if (appState.entryComposing) return; try { await savePendingDailyInput(); appState.daily.expandedId = null; await renderApp(); } catch (error) { showEntrySaveError(error); } return; }
  if (action === 'finish-entry' || action === 'next-entry') {
    if (appState.entryComposing || appState.dateSwitching) return;
    const trade = appState.daily.trade(actionElement.dataset.id!); if (!trade) return;
    capturePendingWork();
    const issues = appState.daily.complete(trade.id);
    try { await appState.daily.flush(); persistEntryDraft(); } catch (error) { appState.daily.expandedId = trade.id; showEntrySaveError(error); return; }
    if (issues.length) {
      await renderApp();
      alert(`尚未完成：\n${issues.join('\n')}`);
      const field = validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id))[0]?.field;
      const name = field === 'vendor' ? 'vendorNameSnapshot' : field === 'workerCount' ? 'workerCount' : field === 'trade' ? 'tradeNameSnapshot' : '';
      app.querySelector<HTMLInputElement>(name ? `[data-trade="${escapeHtml(trade.id)}"] [data-daily-field="${name}"]` : `[data-continuous-work="${escapeHtml(trade.id)}"]`)?.focus();
      return;
    }
    if (action === 'next-entry') { appState.entryKind = 'engineering'; appState.tradePickerOpen = true; appState.tradePickerSearch = ''; }
    await renderApp();
    void commitInputMemories(false).catch(showEntrySaveError);
    return;
  }
  if (action === 'toggle-basics') { appState.dailyBasicsExpanded = !appState.dailyBasicsExpanded; await renderApp(); return; }
  if (action === 'toggle-preview') { if (!isReadOnlySite()) await savePendingDailyInput(); appState.dailyPreviewOpen = !appState.dailyPreviewOpen; await renderApp(); return; }
  if (action === 'toggle-material') { const id = actionElement.dataset.materialId!; if (appState.materialEditor?.id === id) { if (!discardMaterialEditor()) return; await renderApp(); return; } const entry = appState.daily.materialEntry(id); if (!entry || (appState.materialEditor && !discardMaterialEditor())) return; startMaterialEditor(entry.entryType ?? 'normal', entry); await renderApp(); return; }
  if (action === 'edit-material') { const entry = appState.daily.materialEntry(actionElement.dataset.materialId!); if (!entry) return; if (appState.materialEditor && appState.materialEditor.id !== entry.id && !discardMaterialEditor()) return; startMaterialEditor(entry.entryType ?? 'normal', entry); await renderApp(); app.querySelector<HTMLInputElement>('[data-material-field="materialTypeSnapshot"]')?.focus(); return; }
  if (action === 'add-normal-material' || action === 'add-trade-material') { if (appState.materialEditor && !discardMaterialEditor()) return; const tradeId = action === 'add-trade-material' ? actionElement.dataset.tradeId ?? null : null; startMaterialEditor('normal'); if (tradeId && appState.daily.trade(tradeId)) { appState.materialEditor!.value.entryType = 'independent'; appState.materialEditor!.value.connectedTradeSectionId = tradeId; } appState.daily.switchTab('supplies'); await renderApp(); app.querySelector<HTMLInputElement>('[data-material-field="materialTypeSnapshot"]')?.focus(); return; }
  if (action === 'cancel-material') { if (!discardMaterialEditor()) return; await renderApp(); return; }
  if (action === 'save-material' && appState.materialEditor) { const errors = materialValidation(appState.materialEditor.value); if (errors.length) { appState.materialEditor.errors = errors; await renderApp(); app.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; } try { const entry = { ...appState.materialEditor.value, id: appState.materialEditor.originalId ?? '' }; const saved = await saveMaterialEntry(appState.daily.report, entry); appState.daily.report = saved.report; await appState.daily.flush(); await commitInputMemories(); appState.materialTypes = await listMaterialTypes(); appState.materialMemory = await listMaterialMemory(); appState.materialEditor = null; await renderApp(); } catch (error) { alert(error instanceof Error ? error.message : '儲存進料失敗，已保留草稿。'); } return; }
  if (action === 'toggle-contact') { appState.dailyPreviewOpen = false; const id = actionElement.dataset.contactId!; if (appState.contactEditor?.id === id) { appState.activeContactSearch = null; appState.contactEditorCollapsed = !appState.contactEditorCollapsed; persistEntryDraft(); await renderApp(); return; } const current = appState.daily.report.contacts.find((item) => item.id === id); if (!current || (appState.contactEditor && contactDirty() && !window.confirm('目前聯絡事項尚未儲存，是否放棄這次修改？'))) return; appState.activeContactSearch = null; appState.contactEditorCollapsed = false; appState.contactEditor = editContactEntry(current, appState.daily.report.date); await renderApp(); return; }
  if (action === 'edit-contact') { const current = appState.daily.report.contacts.find((item) => item.id === actionElement.dataset.contactId); if (!current) return; if (appState.contactEditor && appState.contactEditor.id !== current.id && contactDirty() && !window.confirm('目前聯絡事項尚未儲存，是否放棄這次修改？')) return; appState.activeContactSearch = null; appState.contactEditorCollapsed = false; appState.contactEditor = editContactEntry(current, appState.daily.report.date); await renderApp(); return; }
  if (action === 'add-contact') { appState.dailyPreviewOpen = false; if (appState.contactEditor) { alert('請先完成或取消目前的聯絡草稿。'); return; } appState.entryKind = 'contacts'; appState.tradePickerOpen = true; appState.tradePickerSearch = ''; await renderApp(); return; }
  if (action === 'keep-contact') { appState.contactEditorCollapsed = true; appState.activeContactSearch = null; persistEntryDraft(); await renderApp(); return; }
  if (action === 'cancel-contact') { if (contactDirty() && !window.confirm('放棄未儲存的聯絡事項變更？')) return; appState.activeContactSearch = null; appState.contactEditor = null; await renderApp(); return; }
  if (action === 'pick-work-item-memory') { const tradeId = actionElement.dataset.tradeId!; const memory = appState.dailyTasks.find((item) => item.id === actionElement.dataset.memoryId); if (!memory) return; const composer = workItemComposerState(tradeId); composer.query = memory.name; composer.taskId = memory.id; appState.activeWorkItemComposerTradeId = tradeId; await renderApp(); focusWorkItemComposer(tradeId); return; }
  if (action === 'add-work-item') { const tradeId = actionElement.dataset.tradeId!; const trade = appState.daily.trade(tradeId); const composer = workItemComposerState(tradeId); const value = composer.query.trim(); if (!trade || !value) return; const work = appState.daily.addWorkItem(tradeId, value, composer.taskId); composer.query = ''; composer.taskId = null; appState.activeWorkItemComposerTradeId = tradeId; if (work && duplicateWorkItemIds(appState.daily.trade(tradeId)! ).has(work.id)) { appState.activeWorkItemComposerTradeId = null; appState.activeWorkAuxEditor = { workItemId: work.id, kind: 'location' }; appState.focusWorkItemId = work.id; appState.focusWorkAuxField = 'start'; } else { appState.focusWorkItemId = null; appState.focusWorkAuxField = null; } await appState.daily.flush(); await renderApp(); if (appState.focusWorkAuxField === 'start') { app.querySelector<HTMLInputElement>(`[data-work="${work?.id}"] [data-daily-field="startFloorRaw"]`)?.focus(); appState.focusWorkAuxField = null; } else focusWorkItemComposer(tradeId); return; }
  if (action === 'contact-pick-memory' && appState.contactEditor) { const id = actionElement.dataset.memoryId!; const trade = appState.dailyTrades.find((item) => item.id === id); const vendor = appState.dailyVendors.find((item) => item.id === id); const task = appState.dailyTasks.find((item) => item.id === id); if (trade) { const changedTrade = appState.contactEditor.value.tradeTypeId !== trade.id; if (appState.contactEditor.value.items.length && changedTrade && !window.confirm('切換工種會清除目前已加入的施工項目，是否繼續？')) return; appState.contactEditor.value.tradeTypeId = trade.id; appState.contactEditor.value.tradeNameSnapshot = trade.name; if (changedTrade) appState.contactEditor.value.items = []; const recent = memoryOrder(appState.dailyVendors.filter((item) => item.tradeTypeId === trade.id))[0]; appState.contactEditor.value.vendorId = recent?.id ?? null; appState.contactEditor.value.vendorNameSnapshot = recent?.name ?? ''; appState.contactEditor.tradeQuery = trade.name; appState.contactEditor.vendorQuery = appState.contactEditor.value.vendorNameSnapshot; } else if (vendor) { appState.contactEditor.value.vendorId = vendor.id; appState.contactEditor.value.vendorNameSnapshot = vendor.name; appState.contactEditor.vendorQuery = vendor.name; } else if (task) { appendContactTask(appState.contactEditor, task.name); refreshContactTaskList(); return; } appState.activeContactSearch = null; await renderApp(); return; }
  if (action === 'contact-reuse-date' && appState.contactEditor) { appState.contactEditor.plannedDate = appState.lastContactDate; appState.contactEditor.plannedDateChanged = true; persistEntryDraft(); const input = app.querySelector<HTMLInputElement>('[data-contact-date]'); if (input) input.value = appState.lastContactDate; return; }
  if (action === 'contact-add-task' && appState.contactEditor) { if (appState.contactSearchComposing) return; appendPendingContactTask(); refreshContactTaskList(); return; }
  if (action === 'contact-remove-task' && appState.contactEditor) { appState.contactEditor.value.items = appState.contactEditor.value.items.filter((item) => item.id !== actionElement.dataset.taskId).map((item, index) => ({ ...item, sortOrder: index })); await renderApp(); return; }
  if ((action === 'save-contact' || action === 'save-contact-next') && appState.contactEditor) { if (appState.entryComposing || appState.contactSearchComposing) return; if (appState.contactEditor.taskDetails?.trim() && !appState.contactEditor.taskQuery.trim()) { alert('請輸入數量／規格所屬的工作內容，再完成這筆。'); app.querySelector<HTMLInputElement>('#contact-task')?.focus(); return; } appendPendingContactTask(); applyContactPlannedDate(appState.contactEditor); const value = appState.contactEditor.value; const items = value.items.map((item) => ({ ...item, content: item.content.trim() })).filter((item) => item.content); const duplicate = new Set<string>(); const duplicateFound = items.some((item) => { const key = normalizeSearch(item.content); if (duplicate.has(key)) return true; duplicate.add(key); return false; }); const errors = !value.tradeNameSnapshot.trim() ? ['請選擇工種。'] : !value.vendorNameSnapshot.trim() ? ['請選擇廠商。'] : !items.length ? ['請至少加入一個施工項目。'] : duplicateFound ? ['同一筆聯絡事項不可重複施工項目。'] : []; if (errors.length) { appState.contactEditor.errors = errors; appState.activeContactSearch = null; await renderApp(); app.querySelector<HTMLInputElement>(!value.tradeNameSnapshot.trim() ? '#contact-trade' : !value.vendorNameSnapshot.trim() ? '#contact-vendor' : '#contact-task')?.focus(); return; } try { app.inert = true; appState.lastContactDate = appState.contactEditor.plannedDate ?? ''; const saved = await saveContactEntry(appState.daily.report, { ...value, id: appState.contactEditor.originalId ?? appState.contactEditor.id, items }); appState.daily.report = saved.report; await appState.daily.flush(); appState.activeContactSearch = null; appState.contactEditor = null; persistEntryDraft(); if (action === 'save-contact-next') { appState.entryKind = 'contacts'; appState.tradePickerOpen = true; appState.tradePickerSearch = ''; } await renderApp(); void commitInputMemories(false).catch(showEntrySaveError); } catch (error) { alert(error instanceof Error ? error.message : '儲存聯絡事項失敗，已保留草稿。'); } finally { app.inert = false; } return; }
  if (action === 'toggle-trade') { appState.dailyPreviewOpen = false;
    if (target.closest('.trade-card__status')) return;
    if (appState.suppressTradeSummaryClick) { appState.suppressTradeSummaryClick = false; return; }
    appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null;
    appState.daily.toggle(actionElement.dataset.id!);
    await renderApp(); return;
  }
  if (action === 'toggle-work-aux-menu') { const id = actionElement.dataset.workItemId!; const open = appState.workAuxMenuId !== id; appState.workAuxMenuId = open ? id : null; await renderApp(); if (open) focusWorkAuxMenu(id); else focusWorkActionsTrigger(id); return; }
  if (action === 'open-work-aux') { appState.activeWorkAuxEditor = { workItemId: actionElement.dataset.workItemId!, kind: actionElement.dataset.workAuxKind as 'location' | 'note' }; appState.workAuxMenuId = null; await renderApp(); return; }
  if (action === 'close-work-aux') { appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null; await renderApp(); return; }
  if (action === 'toggle-special') { appState.expandedSpecialId = appState.expandedSpecialId === actionElement.dataset.id ? null : actionElement.dataset.id ?? null; await renderApp(); return; }
  if (action === 'delete-trade') { const id = actionElement.dataset.id!; const trade = appState.daily.trade(id); if (!trade) return; if (!appState.daily.deleteTrade(id)) return; appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null; await appState.daily.flush(); await renderApp(); return; }
  const button = actionElement;
  if (action === 'add-trade') { appState.entryKind = 'engineering'; appState.tradePickerOpen = true; appState.tradePickerSearch = ''; await renderApp(); return; }
  if (action === 'undo-work-details') {
    if (appState.detailsRestoreBusy || !appState.workDetailUndo || !canRestoreDetails(appState.workDetailUndo, appState.daily.report)) return;
    const undo = appState.workDetailUndo;
    appState.detailsRestoreBusy = true;
    try {
      appState.daily.updateTradeOutputData(undo.tradeId, (trade) => {
        const work = trade.workItems.find((row) => row.id === undo.workId);
        if (work) Object.assign(work, undo.before);
      });
      await appState.daily.flush(); appState.workDetailUndo = undefined; await renderApp();
      app.querySelector<HTMLElement>(`[data-work="${CSS.escape(undo.workId)}"] [data-work-gesture]`)?.focus();
    } catch (error) {
      const work = appState.daily.trade(undo.tradeId)?.workItems.find((row) => row.id === undo.workId);
      if (work && workUndoScope(appState.daily.report) === undo.scope && JSON.stringify(snapshotDetails(work)) === JSON.stringify(undo.before)) {
        appState.daily.updateTradeOutputData(undo.tradeId, () => Object.assign(work, undo.cleared));
        appState.workDetailUndo = undo;
      }
      showEntrySaveError(error); await renderApp();
    } finally { appState.detailsRestoreBusy = false; }
    return;
  }
  if (action === 'close-trade-picker') { appState.tradePickerOpen = false; await renderApp(); return; }
  if (action === 'clear-trade-search') { const search = app.querySelector<HTMLInputElement>('[data-trade-picker-search]'); if (search) { search.value = ''; refreshTradePickerSearch(search); search.focus(); } return; }
  if (action === 'select-trade') {
    appState.dailyPreviewOpen = false;
    const trade = appState.dailyTrades.find((item) => item.id === button.dataset.tradeId);
    if (!trade) return;
    const vendor = recentTradeVendor(appState.dailyVendors, trade.id);
    if (appState.entryKind === 'contacts') {
      startContactEntry(trade.name, vendor?.name ?? '', trade.id, vendor?.id ?? null);
      appState.tradePickerOpen = false; await renderApp();
      app.querySelector<HTMLInputElement>('#contact-vendor')?.focus(); return;
    }
    const created = appState.daily.addTradeEntry(trade.name, trade.id, vendor);
    appState.tradePickerOpen = false; await appState.daily.flush(); await renderApp();
    app.querySelector<HTMLInputElement>(`[data-trade="${CSS.escape(created.id)}"] [data-daily-field="${created.vendorNameSnapshot ? 'workerCount' : 'vendorNameSnapshot'}"]`)?.focus(); return;
  }
  if (action === 'create-trade-from-search') {
    appState.dailyPreviewOpen = false;
    const name = appState.tradePickerSearch.trim(); if (!name) return;
    if (appState.entryKind === 'contacts') {
      startContactEntry(name); appState.tradePickerOpen = false; await renderApp();
      app.querySelector<HTMLInputElement>('#contact-vendor')?.focus(); return;
    }
    const created = appState.daily.addTradeEntry(name, null);
    appState.tradePickerOpen = false; await appState.daily.flush(); await renderApp();
    app.querySelector<HTMLInputElement>(`[data-trade="${CSS.escape(created.id)}"] [data-daily-field="vendorNameSnapshot"]`)?.focus(); return;
  }
  if (action === 'add-work') {
    const tradeId = button.dataset.tradeId!;
    appState.daily.addWorkItem(tradeId);
    appState.focusWorkItemId = appState.daily.trade(tradeId)?.workItems.at(-1)?.id ?? null;
  }
  else if (action === 'undo-material-disconnect') { const undo = appState.materialConnectionUndo; if (!undo || !appState.daily.undoDisconnectMaterial(undo)) return; syncMaterialEditor(undo.materialId); window.clearTimeout(undo.timer); appState.materialConnectionUndo = null; }
  else if (action === 'disconnect-material') { const undo = appState.daily.disconnectMaterial(button.dataset.materialId!); if (undo) { syncMaterialEditor(undo.materialId); enqueueMaterialConnectionUndo(undo.materialId, undo.tradeId); } }
  else if (action === 'toggle-material-type') { const entry = appState.daily.materialEntry(button.dataset.materialId!); if (!entry) return; const previousTradeId = entry.entryType === 'independent' ? entry.connectedTradeSectionId ?? null : null; const trade = previousTradeId ? appState.daily.trade(previousTradeId) : undefined; if (previousTradeId && !window.confirm(`轉為普通進料將解除與「${trade?.tradeNameSnapshot ?? '原工種'}」的連接。確定繼續？`)) return; appState.daily.convertMaterialType(entry.id); if (appState.materialEditor?.id === entry.id) appState.materialEditor.value = structuredClone(appState.daily.materialEntry(entry.id)!); }
  else if (action === 'manage-material-connections') { appState.materialConnectionFocusTradeId = button.dataset.tradeId!; appState.materialConnectionSelectionId = null; appState.daily.switchTab('supplies'); await appState.daily.flush(); await renderApp(); return; }
  else if (action === 'select-connection-material') { appState.materialConnectionSelectionId = button.dataset.materialId!; await renderApp(); return; }
  else if (action === 'clear-connection-selection') { appState.materialConnectionSelectionId = null; await renderApp(); return; }
  else if (action === 'select-connection-trade') { const materialId = appState.materialConnectionSelectionId; const tradeId = button.dataset.tradeId!; if (!materialId) return; const entry = appState.daily.materialEntry(materialId); if (!entry) return; const previous = entry.connectedTradeSectionId ? appState.daily.trade(entry.connectedTradeSectionId) : undefined; if (previous && previous.id !== tradeId && !window.confirm(`改接「${entry.itemName || entry.materialTypeSnapshot || '未命名進料'}」？\n\n${previous.tradeNameSnapshot} → ${appState.daily.trade(tradeId)?.tradeNameSnapshot ?? '新工種'}\n\n兩個工種都會退回草稿。`)) return; appState.daily.connectMaterial(tradeId, materialId); syncMaterialEditor(materialId); appState.materialConnectionSelectionId = null; appState.materialConnectionFocusTradeId = null; }
  else if (action === 'delete-material') appState.daily.deleteMaterial(button.dataset.materialId!);
  else if (action === 'delete-work-item') { if (appState.activeWorkAuxEditor?.workItemId === button.dataset.workItemId) appState.activeWorkAuxEditor = null; if (appState.workAuxMenuId === button.dataset.workItemId) appState.workAuxMenuId = null; appState.daily.deleteWorkItem(button.dataset.tradeId!, button.dataset.workItemId!); }
  else if (action === 'delete-trade') appState.daily.deleteTrade(button.dataset.id!);
  else if (action === 'complete') { const issues = appState.daily.complete(button.dataset.id!); if (issues.length) alert(`尚未完成：\n${issues.join('\n')}`); }
  else if (action === 'copy') { if (appState.contactEditor) { alert('請先完成或取消聯絡草稿。'); return; } await navigator.clipboard.writeText(formatDailyReport(appState.daily.report)); appState.dailyCopyFeedback = '已複製完整日報。'; window.setTimeout(() => { appState.dailyCopyFeedback = ''; void renderApp(); }, 2400); }
  else if (action === 'finalize') {
    if (appState.contactEditor) { alert('請先完成或取消聯絡草稿，再定稿。'); return; }
    if (appState.finalizeInFlight) return;
    appState.finalizeInFlight = true; button.setAttribute('disabled', ''); button.textContent = '本機定稿中…';
    try {
      capturePendingWork(); await appState.daily.flush();
      const issues = validateDailyForFinalization(appState.daily.report);
      if (issues.length) { alert('尚未完成：\n' + issues.join('\n')); return; }
      const finalized = await finalizeDailyReport(appState.daily.report, formatDailyReport(appState.daily.report));
      appState.daily.report = finalized.retainedDraft;
      try {
        await navigator.clipboard.writeText(finalized.outputText);
        appState.dailyCopyFeedback = finalized.created ? '已在本機定稿並複製；草稿已保留。' : '內容未變，已再次複製。';
      } catch {
        appState.dailyCopyFeedback = '本機已定稿，但剪貼簿未允許寫入；請再按「複製」。';
      }
      appState.dailyCopyFeedback += ' 記憶與草稿同步於背景處理，定稿快照保存在此裝置。';
      appState.dailyPreviewOpen = true;
      void commitInputMemories().then(scheduleBackgroundSync).catch((error) => {
        appState.dailyCopyFeedback = '本機定稿已保留；記憶更新待重試：' + (error instanceof Error ? error.message : '保存失敗');
        updateDailySaveStatus();
      });
    } catch (error) { alert(error instanceof Error ? error.message : '定稿失敗，原草稿已保留。'); }
    finally { appState.finalizeInFlight = false; await renderApp(); }
    return;
  }
  else if (action === 'delete-contact') { appState.activeContactSearch = null; appState.contactEditor = null; await deleteItemBySwipe('contact', button.dataset.id!); return; }
  else if (action === 'add-special') { appState.daily.addSpecial(); appState.expandedSpecialId = appState.daily.report.specialItems.at(-1)?.id ?? null; }
  else if (action === 'delete-special') appState.daily.update(() => appState.daily.report.specialItems = appState.daily.report.specialItems.filter((item) => item.id !== button.dataset.id));
  await appState.daily.flush(); await renderApp();
  if (appState.focusWorkItemId) {
    app.querySelector<HTMLInputElement>(`[data-work-item-input="${appState.focusWorkItemId}"]`)?.focus();
    appState.focusWorkItemId = null;
  }
}
export function bindDailyInputEvents(): void {
  bindWorkGestures(app, {
    editable: () => !isReadOnlySite() && !appState.workspaceSwitching,
    move: (id, workId, offset) => { const index = appState.daily.trade(id)?.workItems.findIndex((row) => row.id === workId) ?? -1; return appState.daily.reorderWorkItems(id, index, index + offset) ? () => { appState.daily.reorderWorkItems(id, index + offset, index); } : undefined; },
    remove: (id, workId) => appState.daily.removeWorkItemForUndo(id, workId),
    save: () => appState.daily.flush(), render: renderApp,
    error: (error) => { appState.dailyCopyFeedback = error instanceof Error ? error.message : '儲存失敗，請重試。'; updateDailySaveStatus(); },
  });
  bindWorkGestures(app, {
    target: {
      row: '.contact-work-item[data-contact-task]', grip: '[data-contact-gesture]',
      owner: (row) => row.closest<HTMLElement>('[data-contact-card]')?.dataset.contactCard,
      item: (row) => row.dataset.contactTask,
    },
    editable: () => Boolean(appState.contactEditor) && !isReadOnlySite() && !appState.workspaceSwitching,
    move: (id, taskId, offset) => {
      if (appState.contactEditor?.id !== id) return;
      const items = appState.contactEditor.value.items;
      const from = items.findIndex((task) => task.id === taskId);
      const to = Math.max(0, Math.min(items.length - 1, from + offset));
      if (from < 0 || from === to) return;
      const [task] = items.splice(from, 1); items.splice(to, 0, task);
      items.forEach((task, index) => task.sortOrder = index);
      return () => {
        if (appState.contactEditor?.id !== id) return;
        const current = appState.contactEditor.value.items;
        const at = current.findIndex((row) => row.id === taskId);
        if (at < 0) return;
        const [moved] = current.splice(at, 1); current.splice(Math.min(from, current.length), 0, moved);
        current.forEach((row, order) => row.sortOrder = order);
      };
    },
    remove: (id, taskId) => {
      if (appState.contactEditor?.id !== id) return;
      const items = appState.contactEditor.value.items;
      const index = items.findIndex((task) => task.id === taskId);
      if (index < 0) return;
      const [task] = items.splice(index, 1);
      items.forEach((item, order) => item.sortOrder = order);
      return () => {
        if (appState.contactEditor?.id !== id || appState.contactEditor.value.items.some((item) => item.id === taskId)) return;
        appState.contactEditor.value.items.splice(Math.min(index, appState.contactEditor.value.items.length), 0, task);
        appState.contactEditor.value.items.forEach((item, order) => item.sortOrder = order);
      };
    },
    save: async () => { persistEntryDraft(); }, render: renderApp,
    error: showEntrySaveError,
  });
  app.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (!appState.workDetailUndo || !workDetailFields.some((field) => field === target.dataset.dailyField)) return;
    if (target.closest<HTMLElement>('[data-work]')?.dataset.work === appState.workDetailUndo.workId) {
      appState.workDetailUndo = undefined; app.querySelector('.work-detail-undo')?.remove();
    }
  });
  bindWorkInput(app, {
    trade: (id) => appState.daily.trade(id), tasks: () => appState.dailyTasks,
    add: (id, text, taskId) => { appState.daily.addWorkItem(id, text, taskId); },
    edit: (id, workId, text, taskId) => { appState.daily.updateTradeOutputData(id, (trade) => { const work = trade.workItems.find((item) => item.id === workId); if (work) { work.taskTextSnapshot = text; work.taskId = taskId; } }); },
    clearDetails: (id, workId) => {
      if (isReadOnlySite() || appState.workspaceSwitching) return;
      appState.daily.updateTradeOutputData(id, (trade) => {
        const work = trade.workItems.find((row) => row.id === workId);
        if (!work) return;
        const before = snapshotDetails(work);
        clearWorkItemDetails(work);
        appState.workDetailUndo = { scope: workUndoScope(appState.daily.report), tradeId: id, workId, before, cleared: snapshotDetails(work) };
      });
    },
    draft: persistEntryDraft, remove: (id, workId, undoAddition) => {
      if (!undoAddition) return appState.daily.deleteWorkItem(id, workId);
      const removed = Boolean(appState.daily.removeWorkItemForUndo(id, workId));
      if (removed) persistEntryDraft();
      return removed;
    },
    commit: async () => { await appState.daily.flush(); void commitInputMemories(false).catch(showEntrySaveError); }, render: renderApp,
    error: (error) => { appState.dailyCopyFeedback = error instanceof Error ? error.message : '儲存失敗，內容已保留。'; updateDailySaveStatus(); },
  });
  app.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches('[data-workspace-site]')) {
      try {
        if (target.value) await selectSharedSiteFromWorkspace(target.value);
        else if (appState.accountAuth.user) { await switchActiveDataPartition(() => selectActiveSharedSite(appState.accountAuth.user!.id, null).then(() => undefined)); await refreshAccount(); await renderApp(); }
      } catch (error) { alert(error instanceof Error ? error.message : '切換失敗，請稍後重試。'); await renderApp(); }
    }
    if (target instanceof HTMLInputElement && target.matches('[data-daily-field="locationTextSnapshot"]') && !isReadOnlySite()) {
      const work = appState.daily.report.tradeSections.flatMap((trade) => trade.workItems).find((item) => item.id === target.closest<HTMLElement>('[data-work]')?.dataset.work);
      const memory = appState.dailyLocations.find((row) => row.normalizedName === normalizeName(target.value)); if (work && (memory || work.locationId)) { appState.daily.update(() => applyLocationMemory(work, memory)); if (memory) { await appState.daily.flush(); await renderApp(); return; } }
    }
    if (target.matches('[data-inline-work], [data-daily-field="vendorNameSnapshot"], [data-daily-field="locationTextSnapshot"]')) {
      try { if (!isReadOnlySite()) await appState.daily.flush(); } catch { appState.dailySaveState = 'error'; updateDailySaveStatus(); }
    }
  });
  app.addEventListener('compositionstart', () => { appState.entryComposing = true; }, true);
  app.addEventListener('compositionend', () => { appState.entryComposing = false; }, true);
  app.addEventListener('compositionstart', (event) => { const target = event.target as HTMLElement; if (target.matches('[data-settings-search="tasks"]')) appState.settingsSearchComposing = true; if (target.matches('[data-trade-search]')) appState.tradeSearchComposing = true; if (target.matches('[data-trade-picker-search]')) appState.tradePickerSearchComposing = true; if (target.matches('[data-material-connection-search]')) appState.materialConnectionSearchComposing = true; if (target.matches('[data-contact-field]')) appState.contactSearchComposing = true; if (target.matches('[data-work-item-composer-input]')) appState.workItemComposerComposing = true; });
  app.addEventListener('compositionend', (event) => { const target = event.target as HTMLInputElement; if (target.matches('[data-settings-search="tasks"]')) { appState.settingsSearchComposing = false; refreshTaskSearch(target); } if (target.matches('[data-trade-search]')) { appState.tradeSearchComposing = false; refreshTradeSearch(target); } if (target.matches('[data-trade-picker-search]')) { appState.tradePickerSearchComposing = false; refreshTradePickerSearch(target); } if (target.matches('[data-material-connection-search]')) { appState.materialConnectionSearchComposing = false; refreshMaterialConnectionSearch(target); } if (target.matches('[data-contact-field]')) { appState.contactSearchComposing = false; refreshContactSearch(target); } if (target.matches('[data-work-item-composer-input]')) { appState.workItemComposerComposing = false; refreshWorkItemComposer(target); } });
  app.addEventListener('focusin', (event) => { const target = event.target; if (target instanceof HTMLInputElement && target.matches('[data-contact-field]')) activateContactSearch(target); if (target instanceof HTMLInputElement && target.matches('[data-work-item-composer-input]')) { const tradeId = target.dataset.workItemComposerInput ?? null; if (tradeId && appState.activeWorkItemComposerTradeId !== tradeId) { appState.activeWorkItemComposerTradeId = tradeId; void renderApp().then(() => focusWorkItemComposer(tradeId)); } } });
  app.addEventListener('focusout', (event) => { const target = event.target as HTMLElement; const editor = target.closest<HTMLElement>('[data-work-aux-editor]'); if (!editor || !appState.activeWorkAuxEditor) return; const next = event.relatedTarget; if (next instanceof Node && editor.contains(next)) return; const work = appState.daily.report.tradeSections.flatMap((trade) => trade.workItems).find((item) => item.id === appState.activeWorkAuxEditor?.workItemId); const empty = appState.activeWorkAuxEditor.kind === 'location' ? Boolean(work && !work.startFloorRaw.trim() && !work.endFloorRaw.trim() && !work.locationTextSnapshot.trim()) : Boolean(work && !work.note.trim()); if (empty) { appState.activeWorkAuxEditor = null; void renderApp(); } });
  app.addEventListener('pointerdown', (event) => { if ((event.target as HTMLElement).closest('[data-contact-suggestions] [data-daily-action="contact-pick-memory"]')) event.preventDefault(); });
  app.addEventListener('input', (event) => { const target = event.target as HTMLInputElement; const route = parseRoute(location.hash); if (route.module === 'daily' && route.page === 'settings' && target.dataset.tradeSearch !== undefined && !appState.tradeSearchComposing && !(event as InputEvent).isComposing) refreshTradeSearch(target); });
}
export function bindContactInputEvents(): void {
  app.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (appState.contactEditor) {
      if (target.dataset.contactField === 'task') appState.contactEditor.taskQuery = target.value;
      if (target.dataset.contactField === 'trade') { appState.contactEditor.value.tradeNameSnapshot = target.value; appState.contactEditor.tradeQuery = target.value; }
      if (target.dataset.contactField === 'vendor') { appState.contactEditor.value.vendorNameSnapshot = target.value; appState.contactEditor.vendorQuery = target.value; }
      if (target.matches('[data-contact-date]')) { appState.contactEditor.plannedDate = target.value; appState.contactEditor.plannedDateChanged = true; }
      if (target.matches('[data-contact-details]')) appState.contactEditor.taskDetails = target.value;
    }
    persistEntryDraft();
  });
}
export function bindSiteSearchEvents(): void {
  app.addEventListener('compositionstart', (event) => { if ((event.target as HTMLElement).matches('[data-site-search]')) appState.siteSearchComposing = true; });
  app.addEventListener('compositionend', (event) => { const target = event.target as HTMLInputElement; if (target.matches('[data-site-search]')) { appState.siteSearchComposing = false; refreshSiteSearch(target); } });
  app.addEventListener('focusin', (event) => { const target = event.target; if (target instanceof HTMLInputElement && target.matches('[data-site-search]')) activateSiteSearch(target); });
  app.addEventListener('input', (event) => { const target = event.target as HTMLInputElement; if (target.matches('[data-site-search]') && !appState.siteSearchComposing && !(event as InputEvent).isComposing) refreshSiteSearch(target); });
  app.addEventListener('keydown', (event) => { const target = event.target as HTMLInputElement; if (!target.matches('[data-site-search]')) return; if (event.key === 'Escape') { appState.siteSearchOpen = false; void renderApp(); return; } if (event.key === 'Enter') { event.preventDefault(); void selectDailySite(target.value); } });
  app.addEventListener('click', async (event) => { const target = event.target as HTMLElement; const action = target.closest<HTMLButtonElement>('[data-site-search-action]'); if (!action) return; event.stopImmediatePropagation(); const site = appState.dailySites.find((item) => item.id === action.dataset.siteId); if (action.dataset.siteSearchAction === 'select' && site) await selectDailySite(site.name); else if (action.dataset.siteSearchAction === 'create') await selectDailySite(appState.siteSearchQuery); });
}
export function bindBackgroundCollapseEvents(): void {
  document.addEventListener('click', (event) => {
    if (tradeDrag.active || tradeDrag.pending || appState.suppressTradeSummaryClick || !appState.daily?.expandedId) return;
    const route = parseRoute(location.hash); if (route.module !== 'daily' || route.page !== 'main' || appState.daily.report.activeTab !== 'engineering') return;
    const target = event.target; if (!(target instanceof Element) || target.closest(backgroundCollapseExclusions)) return;
    appState.daily.expandedId = null; appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null;
    void renderApp();
  });
  document.addEventListener('click', (event) => {
    if (!appState.contactEditor || !appState.activeContactSearch) return;
    const target = event.target; if (!(target instanceof Element)) return;
    if (target.closest('[data-contact-field], [data-contact-suggestions], [data-daily-action="contact-add-task"]')) return;
    appState.activeContactSearch = null; refreshContactSuggestions();
  });
  document.addEventListener('click', (event) => {
    if (!appState.contactEditor) return;
    const route = parseRoute(location.hash); if (route.module !== 'daily' || route.page !== 'main' || appState.daily.report.activeTab !== 'contacts') return;
    const target = event.target; if (!(target instanceof Element) || target.closest(backgroundCollapseExclusions)) return;
    persistEntryDraft(); appState.activeContactSearch = null; refreshContactSuggestions();
  });
}
export function bindDailyKeyEvents(): void {
  window.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (workItemDrag.active || workItemDrag.pending) { clearWorkItemDrag(); event.preventDefault(); void renderApp(); return; } if (appState.workAuxMenuId) { const id = appState.workAuxMenuId; appState.workAuxMenuId = null; event.preventDefault(); void renderApp().then(() => focusWorkActionsTrigger(id)); return; } if (tradeDrag.active || tradeDrag.pending) { clearTradeDrag(); void renderApp(); } if (tradeSwipe.active) clearTradeSwipe(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && appState.activeContactSearch) { appState.activeContactSearch = null; void renderApp(); } });
  app.addEventListener('keydown', (event) => { const target = event.target as HTMLElement; if (event.key !== 'Enter' || !(target instanceof HTMLInputElement) || event.isComposing) return; if (target.matches('[data-contact-field="task"]')) { if (appState.contactSearchComposing || event.keyCode === 229) return; event.preventDefault(); target.closest('.contact-card')?.querySelector<HTMLElement>('[data-daily-action="contact-add-task"]')?.click(); } else if (target.matches('[data-work-item-composer-input]')) { if (appState.workItemComposerComposing) return; event.preventDefault(); const tradeId = target.dataset.workItemComposerInput; if (tradeId) app.querySelector<HTMLButtonElement>(`[data-daily-action="add-work-item"][data-trade-id="${tradeId}"]`)?.click(); } });
}
