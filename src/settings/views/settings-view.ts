import { type MemoryCandidate, type DailySettingsSection, type NamedMemory, listMaterialMemory, listMemories, listMaterialTypes, listTemplates, deleteMaterialType, rejectMaterialMemoryItem, deleteMemory } from '../../data/daily-repository';
import { groupMemoryCandidates } from '../memory-review';
import { DB_VERSION } from '../../data/db.js';
import { persistActiveMemoryPartition } from '../../data/memory-partition';
import { APP_VERSION } from '../../version';
import { renderApp } from '../../main';
import { settingsState, appState, memoryReviewState } from '../../app/state';
export const memoryCandidateLabels: Record<MemoryCandidate['kind'], string> = { sites: '工地', trades: '工種', vendors: '廠商', tasks: '工項', locations: '位置', 'material-types': '材料類型', 'material-items': '材料欄位' };
export const sectionLabels: Array<[DailySettingsSection, string]> = [['trade-tasks', '工種、工項與廠商'], ['locations', '位置'], ['materials', '材料類型'], ['sites', '工地'], ['templates', '特殊事項模板']];
export const floorRangeText = (row: Pick<NamedMemory, 'startFloorRaw' | 'endFloorRaw'>): string => [row.startFloorRaw, row.endFloorRaw].filter(Boolean).join('～');
export function debugSnapshot(): Record<string, unknown> {
  const counts = { pending: 0, sending: 0, failed: 0, blocked: 0, conflict: 0 };
  for (const operation of appState.accountSyncOperations) counts[operation.status] += 1;
  return {
    appVersion: APP_VERSION, databaseVersion: DB_VERSION, route: location.hash,
    online: navigator.onLine, serviceWorker: navigator.serviceWorker?.controller ? 'active' : 'not active',
    authEnabled: appState.accountAuth.enabled, signedIn: Boolean(appState.accountAuth.user), activeSiteSelected: Boolean(appState.accountActiveSiteId),
    accountLoad: { stage: appState.accountLoadStage, elapsedMs: appState.accountLoadStartedAt ? Date.now() - appState.accountLoadStartedAt : 0, coreReady: appState.accountLoadCoreReady, detailsPending: appState.accountLoadExtrasPending, events: appState.accountLoadEvents },
    syncQueue: { status: appState.accountQueueStatus, counts }, lastPulledAt: appState.lastPulledAt,
  };
}
export function settingsSectionFromHash(hash: string): DailySettingsSection | null { const key = hash.slice('#settings/daily/'.length); return sectionLabels.find(([section]) => section === key)?.[0] ?? null; }
export async function refreshSettings(): Promise<void> { const section = settingsState.activeSection; appState.settingsTrades = await listMemories('trades', undefined, 'all'); if (section === 'materials') { appState.materialTypes = await listMaterialTypes(); appState.settingsMaterialMemory = await listMaterialMemory('all'); } else if (section === 'templates') appState.settingsTemplates = await listTemplates(); else if (section === 'trade-tasks') { appState.settingsAllTasks = await listMemories('tasks', undefined, 'all'); appState.settingsAllVendors = await listMemories('vendors', undefined, 'all'); } else if (section !== 'backup') appState.settingsRows = await listMemories(section); }
export async function rejectMemoryCandidate(candidate: MemoryCandidate): Promise<void> { if (candidate.kind === 'material-types') appState.daily.report = await deleteMaterialType(appState.daily.report, candidate.id); else if (candidate.kind === 'material-items') appState.daily.report = await rejectMaterialMemoryItem(appState.daily.report, candidate.id); else { const next = await deleteMemory(candidate.kind, candidate.id); if (next) appState.daily.report = next; } }
export async function performMemoryReviewWrite(action: () => Promise<void>, failureLabel: string): Promise<boolean> { try { await action(); await persistActiveMemoryPartition(); return true; } catch (error) { const detail = error instanceof Error ? error.message : '本機資料寫入失敗。'; memoryReviewState.feedback = `${failureLabel}：${detail} 選取內容已保留，請確認後再試。`; memoryReviewState.feedbackTone = 'error'; await renderApp(); return false; } }
export function prepareNextMemoryGroup(): void { const groups = groupMemoryCandidates(appState.memoryCandidates); const current = groups.findIndex((group) => group.kind === memoryReviewState.openKind); memoryReviewState.nextKind = current >= 0 ? groups[current + 1]?.kind ?? groups.find((_, index) => index !== current)?.kind ?? null : groups[0]?.kind ?? null; }
