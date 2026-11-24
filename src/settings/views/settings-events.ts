import { confirmAction } from '../../app/react-confirm';
import { clearDebugLogs, mergeMemoryBackup, listMemories, deleteMemory, saveMemory, saveLocationMemory, saveTemplate, loadDailyDraft, createMaterialType, renameMaterialType, updateMaterialMemoryItem, rejectMaterialMemoryItem } from '../../data/daily-repository';
import { persistActiveMemoryPartition } from '../../data/memory-partition';
import { renderApp, parseRoute } from '../../main';
import { app, appState, settingsState } from '../../app/state';
import { normalizeSearch } from '../../app/shell';
import { debugSnapshot, refreshSettings } from './settings-view';
export async function deleteTradeWithConfirm(id: string): Promise<void> { const trade = appState.settingsTrades.find((item) => item.id === id); if (!trade) return; const [vendors, tasks] = await Promise.all([listMemories('vendors', id), listMemories('tasks', id)]); const sections = appState.daily.report.tradeSections.filter((item) => item.tradeTypeId === id).length; const contacts = appState.daily.report.contacts.filter((item) => item.tradeTypeId === id).length; if (!await confirmAction(`刪除工種「${trade.name}」？\n\n將刪除主檔：${vendors.length} 個廠商、${tasks.length} 個工項\n目前草稿：${sections} 筆工程、${contacts} 筆聯絡事項\n定稿不會變更。`)) return; if (!await confirmAction('再次確認：確定刪除工種及上述目前草稿關聯資料？')) return; const next = await deleteMemory('trades', id); if (next) appState.daily.report = next; if (settingsState.selectedTradeTypeId === id) settingsState.selectedTradeTypeId = null; settingsState.editingId = null; settingsState.editingKind = null; await renderApp(); }
export function bindSettingsShortcutEvents(): void {
  app.addEventListener('click', async (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-settings-action]')?.dataset.settingsAction;
    if (action === 'copy-debug') {
      event.stopImmediatePropagation();
      void navigator.clipboard.writeText(JSON.stringify({ ...debugSnapshot(), stores: appState.settingsDebug }, null, 2));
    } else if (action === 'clear-debug' && parseRoute(location.hash).page === 'debug') {
      event.stopImmediatePropagation();
      if (await confirmAction('確定清除偵錯紀錄？')) void clearDebugLogs().then(() => renderApp());
    }
  });
}
export function bindSettingsChangeEvents(): void {
  app.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.memoryBackupImport) return;
    const file = target.files?.[0]; if (!file) return;
    try { const summary = await mergeMemoryBackup(JSON.parse(await file.text())); await persistActiveMemoryPartition(); appState.memoryBackupFeedback = `匯入完成：新增 ${summary.added} 筆、略過 ${summary.skipped} 筆、無效 ${summary.invalid} 筆。`; }
    catch (error) { appState.memoryBackupFeedback = error instanceof Error ? `匯入失敗：${error.message}` : '匯入失敗。'; }
    target.value = ''; await refreshSettings(); await renderApp();
  });
}
export function bindMaterialDetailEvents(): void {
  app.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-material-action]'); if (!button || settingsState.activeSection !== 'materials') return;
    const action = button.dataset.materialAction; const id = button.dataset.id ?? '';
    if (action === 'toggle-type') { settingsState.expandedMaterialTypeId = settingsState.expandedMaterialTypeId === id ? null : id; settingsState.editingMaterialItemId = null; settingsState.editingId = null; settingsState.adding = false; }
    else if (action === 'edit-item') settingsState.editingMaterialItemId = id;
    else if (action === 'cancel-item') settingsState.editingMaterialItemId = null;
    else if (action === 'delete-item') { const row = appState.settingsMaterialMemory.find((item) => item.id === id); if (!row || !await confirmAction(`刪除「${row.value}」？

目前草稿中使用此值的進料欄位會被清空；既有定稿不受影響。`)) return; try { appState.daily.report = await rejectMaterialMemoryItem(appState.daily.report, id); await persistActiveMemoryPartition(); settingsState.editingMaterialItemId = null; } catch (error) { alert(error instanceof Error ? error.message : '刪除失敗。'); } await refreshSettings(); }
    else return;
    await renderApp();
  });
  app.addEventListener('submit', async (event) => {
    const form = event.target as HTMLFormElement; const id = form.dataset.materialItemForm; if (!id) return; event.preventDefault();
    try { appState.daily.report = await updateMaterialMemoryItem(appState.daily.report, id, String(new FormData(form).get('value') ?? '')); await persistActiveMemoryPartition(); settingsState.editingMaterialItemId = null; await refreshSettings(); await renderApp(); } catch (error) { alert(error instanceof Error ? error.message : '儲存失敗。'); }
  });
}
export function bindSettingsFormEvents(): void {
  app.addEventListener('submit', async (event) => { const form = event.target as HTMLFormElement; if (form.dataset.settingsForm) { event.preventDefault(); try { const name = String(new FormData(form).get('name') ?? ''); const section = settingsState.activeSection; const mode = form.dataset.settingsForm; if (section === 'trade-tasks') { const kind = settingsState.editingKind ?? 'trade'; const editId = mode === 'edit' ? settingsState.editingId ?? undefined : undefined; if (kind === 'trade') await saveMemory('trades', name, undefined, editId); else await saveMemory(kind, name, settingsState.selectedTradeTypeId ?? undefined, editId); if (kind === 'trade' && !editId) { const created = (await listMemories('trades', undefined, 'all')).find((item) => item.normalizedName === normalizeSearch(name)); settingsState.selectedTradeTypeId = created?.id ?? null; } } else if (section === 'materials') { if (mode === 'edit' && settingsState.editingId) appState.daily.report = await renameMaterialType(appState.daily.report, settingsState.editingId, name); else await createMaterialType(name); } else if (section === 'templates') await saveTemplate(name, mode === 'edit' ? settingsState.editingId ?? undefined : undefined); else if (section === 'locations') { const values = new FormData(form); await saveLocationMemory(name, String(values.get('startFloor') ?? ''), String(values.get('endFloor') ?? ''), mode === 'edit' ? settingsState.editingId ?? undefined : undefined); } else await saveMemory(section as 'sites', name, undefined, mode === 'edit' ? settingsState.editingId ?? undefined : undefined); const savedDraft = await loadDailyDraft(); if (savedDraft) appState.daily.mergeRemote(savedDraft); await persistActiveMemoryPartition(); settingsState.adding = false; settingsState.editingId = null; settingsState.editingKind = null; settingsState.dirty = false; await renderApp(); } catch (error) { alert(error instanceof Error ? error.message : '儲存設定失敗。'); } return; } });
}
