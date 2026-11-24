import { notifyAction } from '../../app/react-confirm';
import { renderApp } from '../../main';
import { app, appState } from '../../app/state';
import { normalizeSearch } from '../../app/shell';
import { scheduleBackgroundSync } from '../../app/sync-runtime';
import { saveMaterialEntry, listMaterialTypes, listMaterialMemory, saveContactEntry, finalizeDailyReport } from '../../data/daily-repository';
import { formatDailyReport } from '../daily-formatter';
import { validateTrade, validateDailyForFinalization } from '../daily-validator';
import { applyContactPlannedDate } from '../entry-workflow';
import { updateDailySaveStatus } from './daily-view';
import { materialValidation } from './material-view';
import { appendPendingContactTask } from './contact-view';
import { persistEntryDraft, showEntrySaveError, commitInputMemories, capturePendingWork } from './daily-entry';
import { escapeHtml } from '../../shared/html';

export function scrollAndFocus(selector: string): void {
  const input = app.querySelector<HTMLElement>(selector);
  input?.scrollIntoView({ block: 'center' });
  input?.focus({ preventScroll: true });
}

export async function handleDailyAction(_target: HTMLElement, actionElement: HTMLElement): Promise<void> {
  const action = actionElement.dataset.dailyAction!;
  const button = actionElement;
  if (action === 'fix-entry') { appState.dailyPreviewOpen = false; appState.daily.expandedId = actionElement.dataset.id!; appState.dailyPreviewOpen = false; await renderApp(); const trade = appState.daily.trade(appState.daily.expandedId)!; const issue = validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id))[0]?.field; const name = issue === 'vendor' ? 'vendorNameSnapshot' : issue === 'workerCount' ? 'workerCount' : issue === 'trade' ? 'tradeNameSnapshot' : ''; const selector = name ? `[data-trade="${CSS.escape(trade.id)}"] [data-daily-field="${name}"]` : `[data-continuous-work="${CSS.escape(trade.id)}"]`; scrollAndFocus(selector); return; }
  if (action === 'save-material' && appState.materialEditor) { const errors = materialValidation(appState.materialEditor.value); if (errors.length) { appState.materialEditor.errors = errors; await renderApp(); app.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); return; } try { const entry = { ...appState.materialEditor.value, id: appState.materialEditor.originalId ?? '' }; const saved = await saveMaterialEntry(appState.daily.report, entry); appState.daily.report = saved.report; await appState.daily.flush(); await commitInputMemories(); appState.materialTypes = await listMaterialTypes(); appState.materialMemory = await listMaterialMemory(); appState.materialEditor = null; await renderApp(); } catch (error) { await notifyAction(error instanceof Error ? error.message : '儲存進料失敗，已保留草稿。'); } return; }
  if ((action === 'save-contact' || action === 'save-contact-next') && appState.contactEditor) { if (appState.entryComposing || appState.contactSearchComposing) return; if (appState.contactEditor.taskDetails?.trim() && !appState.contactEditor.taskQuery.trim()) { await notifyAction('請輸入數量／規格所屬的工作內容，再完成這筆。'); app.querySelector<HTMLInputElement>('#contact-task')?.focus(); return; } appendPendingContactTask(); applyContactPlannedDate(appState.contactEditor); const value = appState.contactEditor.value; const items = value.items.map((item) => ({ ...item, content: item.content.trim() })).filter((item) => item.content); const duplicate = new Set<string>(); const duplicateFound = items.some((item) => { const key = normalizeSearch(item.content); if (duplicate.has(key)) return true; duplicate.add(key); return false; }); const errors = !value.tradeNameSnapshot.trim() ? ['請選擇工種。'] : !value.vendorNameSnapshot.trim() ? ['請選擇廠商。'] : !items.length ? ['請至少加入一個施工項目。'] : duplicateFound ? ['同一筆聯絡事項不可重複施工項目。'] : []; if (errors.length) { appState.contactEditor.errors = errors; appState.activeContactSearch = null; await renderApp(); app.querySelector<HTMLInputElement>(!value.tradeNameSnapshot.trim() ? '#contact-trade' : !value.vendorNameSnapshot.trim() ? '#contact-vendor' : '#contact-task')?.focus(); return; } try { app.inert = true; appState.lastContactDate = appState.contactEditor.plannedDate ?? ''; const saved = await saveContactEntry(appState.daily.report, { ...value, id: appState.contactEditor.originalId ?? appState.contactEditor.id, items }); appState.daily.report = saved.report; await appState.daily.flush(); appState.activeContactSearch = null; appState.contactEditor = null; persistEntryDraft(); if (action === 'save-contact-next') { appState.justAddedEntry = null; appState.entryKind = 'contacts'; appState.tradePickerOpen = true; appState.tradePickerSearch = ''; } await renderApp(); void commitInputMemories(false).catch(showEntrySaveError); } catch (error) { await notifyAction(error instanceof Error ? error.message : '儲存聯絡事項失敗，已保留草稿。'); } finally { app.inert = false; } return; }
  if (action === 'finish-entry' || action === 'next-entry') {
    if (appState.entryComposing || appState.dateSwitching) return;
    const trade = appState.daily.trade(actionElement.dataset.id!); if (!trade) return;
    capturePendingWork();
    const issues = appState.daily.complete(trade.id);
    try { await appState.daily.flush(); persistEntryDraft(); } catch (error) { appState.daily.expandedId = trade.id; showEntrySaveError(error); return; }
    if (issues.length) {
      await renderApp();
      await notifyAction(`尚未完成：\n${issues.join('\n')}`);
      const field = validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id))[0]?.field;
      const name = field === 'vendor' ? 'vendorNameSnapshot' : field === 'workerCount' ? 'workerCount' : field === 'trade' ? 'tradeNameSnapshot' : '';
      app.querySelector<HTMLInputElement>(name ? `[data-trade="${escapeHtml(trade.id)}"] [data-daily-field="${name}"]` : `[data-continuous-work="${escapeHtml(trade.id)}"]`)?.focus();
      return;
    }
    if (action === 'next-entry') { appState.justAddedEntry = null; appState.entryKind = 'engineering'; appState.tradePickerOpen = true; appState.tradePickerSearch = ''; }
    await renderApp();
    void commitInputMemories(false).catch(showEntrySaveError);
    return;
  }

  if (action === 'copy') { if (appState.contactEditor) { await notifyAction('請先完成或取消聯絡草稿。'); return; } await navigator.clipboard.writeText(formatDailyReport(appState.daily.report)); appState.dailyCopyFeedback = '已複製完整日報。'; window.setTimeout(() => { appState.dailyCopyFeedback = ''; void renderApp(); }, 2400); }
  else if (action === 'finalize') {
    if (appState.contactEditor) { await notifyAction('請先完成或取消聯絡草稿，再定稿。'); return; }
    if (appState.finalizeInFlight) return;
    appState.finalizeInFlight = true; button.setAttribute('disabled', ''); button.textContent = '本機定稿中…';
    try {
      capturePendingWork(); await appState.daily.flush();
      const issues = validateDailyForFinalization(appState.daily.report);
      if (issues.length) { await notifyAction('尚未完成：\n' + issues.join('\n')); return; }
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
    } catch (error) { await notifyAction(error instanceof Error ? error.message : '定稿失敗，原草稿已保留。'); }
    finally { appState.finalizeInFlight = false; await renderApp(); }
    return;
  }

}
