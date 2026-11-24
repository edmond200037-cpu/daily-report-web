import { appState } from '../../app/state';
import { notifyReact } from '../../app/react-store';
export function dailySyncLabel(): string {
  const label = appState.dailySaveState === 'saving' ? '儲存中…' : appState.dailySaveState === 'error' ? '儲存失敗，請勿關閉頁面' : appState.dailySyncConflictCount ? `衝突 ${appState.dailySyncConflictCount} 筆${appState.dailySyncPendingCount ? `・待同步 ${appState.dailySyncPendingCount} 筆` : ''}` : appState.dailySyncPendingCount ? `已存本機・待同步 ${appState.dailySyncPendingCount} 筆` : appState.dailySyncStatusUnknown ? '已存本機・同步狀態待確認' : appState.daily.report.shared && appState.lastPulledAt ? '已存本機・目前日報無待送項目' : appState.dailyLastSavedAt ? `已保存本機 ${appState.dailyLastSavedAt}` : '本機自動儲存';
  return label + appState.memoryQueueSummary;
}
export const readOnlyDailyActions = new Set(['toggle-basics', 'toggle-trade', 'toggle-preview', 'toggle-contact', 'toggle-special', 'toggle-material', 'toggle-material-type', 'copy', 'copy-finalized', 'fix-entry']);
export function updateDailySaveStatus(): void { notifyReact(); }
