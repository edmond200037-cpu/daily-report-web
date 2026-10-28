import { type MaterialMemoryField, type MaterialMemoryItem, type MaterialType, listMaterialMemory, type MemoryCandidate, type DailySettingsSection, type NamedMemory, listMemories, listMaterialTypes, listTemplates, deleteMaterialType, rejectMaterialMemoryItem, deleteMemory } from '../../data/daily-repository';
import { searchTradeManagement } from '../trade-management';
import { groupMemoryCandidates, confirmationSelection, memoryCandidateImpact, rejectionSelection } from '../memory-review';
import { DB_VERSION } from '../../data/db.js';
import { persistActiveMemoryPartition } from '../../data/memory-partition';
import { APP_VERSION } from '../../version';
import { escapeHtml } from '../../shared/html';
import { renderApp } from '../../main';
import { settingsState, appState, memoryReviewState, app } from '../../app/state';
import { normalizeSearch, settingsHeader } from '../../app/shell';
export const memoryCandidateLabels: Record<MemoryCandidate['kind'], string> = { sites: '工地', trades: '工種', vendors: '廠商', tasks: '工項', locations: '位置', 'material-types': '材料類型', 'material-items': '材料欄位' };
export const sectionLabels: Array<[DailySettingsSection, string]> = [['trade-tasks', '工種、工項與廠商'], ['locations', '位置'], ['materials', '材料類型'], ['sites', '工地'], ['templates', '特殊事項模板']];
const searchBox = (label: string) => `<input data-settings-search="tasks" type="search" enterkeyhint="search" aria-label="搜尋${label}" placeholder="搜尋${label}" value="${escapeHtml(settingsState.taskSearchKeyword)}">`;
const addButton = (action: string, label: string) => settingsState.adding ? '' : `<button type="button" class="settings-add" data-settings-action="${action}">＋ ${label}</button>`;
const rowButton = (attrs: string, name: string, meta: string) => `<button type="button" class="settings-row" ${attrs}><span class="settings-row__name">${escapeHtml(name)}</span><span class="settings-row__meta">${escapeHtml(meta)}</span></button>`;
const deleteButton = (attrs: string) => `<button type="button" class="danger-text settings-edit-form__delete" ${attrs}>刪除</button>`;
type ManagedRow = { id: string; name: string; meta: string; rowAttrs?: string; formExtra: string };
function managedList(searchLabel: string, addAction: string, formLabel: string, maxlength: number, rows: ManagedRow[]): string {
  const keyword = normalizeSearch(settingsState.taskSearchKeyword);
  const items = rows.filter((row) => !keyword || normalizeSearch(row.name).includes(keyword)).map((row) => settingsState.editingId === row.id ? nameForm('edit', formLabel, row.name, row.formExtra, maxlength) : rowButton(`data-settings-action="edit" data-id="${escapeHtml(row.id)}"${row.rowAttrs ?? ''}`, row.name, row.meta)).join('') || `<p class="empty">尚無${searchLabel}。</p>`;
  return `<section class="settings-list-page"><div class="settings-toolbar">${searchBox(searchLabel)}${addButton(addAction, `新增${searchLabel}`)}</div>${settingsState.adding ? nameForm('add', formLabel, '', '', maxlength) : ''}<div class="settings-rows">${items}</div></section>`;
}
function settingsItems(): string {
  const section = settingsState.activeSection;
  if (section === 'materials') return materialsSettings();
  if (section === 'backup') return `<section class="form-card"><p class="hint">只包含工地、工種、工項、廠商、位置、材料類型、材料候選與特殊事項模板；不包含日報草稿、定稿日報或水位資料。</p><div class="action-row"><button type="button" class="primary" data-settings-action="export-memory-backup">下載記憶備份</button><label class="button-like">匯入記憶備份<input type="file" accept="application/json,.json" data-memory-backup-import hidden></label></div>${appState.memoryBackupFeedback ? `<p class="hint" role="status">${escapeHtml(appState.memoryBackupFeedback)}</p>` : ''}</section>`;
  if (section === 'trade-tasks') return tradeTasksSettings();
  if (section === 'templates') return managedList('特殊事項模板', 'add', '模板內容', 500, appState.settingsTemplates.map((row) => ({ id: row.id, name: row.text, meta: '編輯', formExtra: deleteButton(`data-settings-action="delete-template" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.text)}"`) })));
  const kind = section === 'sites' ? 'sites' : 'locations'; const label = section === 'sites' ? '工地' : '位置';
  return managedList(label, 'add', section === 'sites' ? '工地名稱' : '位置', 50, appState.settingsRows.map((row) => ({ id: row.id, name: row.name, meta: '編輯', formExtra: `${row.status === 'candidate' ? `<button type="button" data-settings-action="confirm" data-settings-kind="${kind}" data-id="${escapeHtml(row.id)}">確認</button>` : ''}${deleteButton(`data-settings-action="delete" data-settings-kind="${kind}" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.name)}"`)}` })));
}
const materialFields: Array<[MaterialMemoryField, string]> = [['itemName', '品名'], ['specification', '規格'], ['supplier', '供應商'], ['unit', '單位']];
function materialItemForm(row: MaterialMemoryItem, label: string): string { return `<form class="settings-edit-form" data-material-item-form="${escapeHtml(row.id)}"><label>${label}<input name="value" maxlength="50" value="${escapeHtml(row.value)}" autocomplete="off" autofocus></label><div class="form-actions form-actions--submit"><button class="primary" type="submit">儲存</button><button type="button" data-material-action="cancel-item">取消</button><button type="button" class="danger-text settings-edit-form__delete" data-material-action="delete-item" data-id="${escapeHtml(row.id)}">刪除</button></div></form>`; }
function materialDetail(type: MaterialType): string {
  const groups = materialFields.map(([field, label]) => {
    const rows = appState.settingsMaterialMemory.filter((row) => row.materialTypeId === type.id && row.fieldType === field).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
    const items = rows.map((row) => settingsState.editingMaterialItemId === row.id ? materialItemForm(row, label) : `<button type="button" class="settings-row settings-row--compact" data-material-action="edit-item" data-id="${escapeHtml(row.id)}"><span class="settings-row__name">${escapeHtml(row.value)}</span>${row.status === 'candidate' ? '<span class="settings-row__meta">候選</span>' : ''}</button>`).join('') || `<p class="empty">尚無記住的${label}。</p>`;
    return `<section class="material-detail__group" aria-label="${label}"><header class="trade-subgroup__bar"><h3>${label}</h3></header><div class="settings-rows">${items}</div></section>`;
  }).join('');
  const rename = settingsState.editingId === type.id ? nameForm('edit', '材料類型名稱', type.name, '') : `<button type="button" class="settings-text-action" data-settings-action="edit" data-id="${escapeHtml(type.id)}">重新命名類型</button>`;
  return `<div class="material-detail" data-material-detail="${escapeHtml(type.id)}"><header class="material-detail__head"><strong>${escapeHtml(type.name)}</strong><button type="button" class="settings-text-action" data-material-action="toggle-type" data-id="${escapeHtml(type.id)}">收合</button></header><div class="material-detail__grid">${groups}</div><div class="material-detail__foot">${rename}<button type="button" class="settings-text-action danger-text" data-settings-action="delete-material-type" data-id="${escapeHtml(type.id)}">刪除類型</button></div></div>`;
}
function materialsSettings(): string {
  const keyword = normalizeSearch(settingsState.taskSearchKeyword);
  const items = appState.materialTypes.filter((row) => !keyword || normalizeSearch(row.name).includes(keyword)).map((row) => settingsState.expandedMaterialTypeId === row.id ? materialDetail(row) : `<button type="button" class="settings-row" draggable="true" data-material-type-id="${escapeHtml(row.id)}" data-material-action="toggle-type" data-id="${escapeHtml(row.id)}"><span class="settings-row__name">${escapeHtml(row.name)}</span><span class="settings-row__meta">使用 ${row.usageCount} 次</span></button>`).join('') || '<p class="empty">尚無材料類型。</p>';
  return `<section class="settings-list-page"><div class="settings-toolbar">${searchBox('材料類型')}${addButton('add-material-type', '新增材料類型')}</div>${settingsState.adding ? nameForm('add', '材料類型名稱', '', '', 50) : ''}<div class="settings-rows">${items}</div></section>`;
}
function tradeTasksSettings(): string {
  const expandedId = settingsState.selectedTradeTypeId; const keyword = appState.tradeSearchKeyword; const results = searchTradeManagement(appState.settingsTrades, appState.settingsAllTasks, keyword);
  const subGroup = (kind: 'tasks' | 'vendors', title: string, rows: NamedMemory[]) => {
    const adding = settingsState.adding && settingsState.editingKind === kind; const suffix = kind === 'tasks' ? 'task' : 'vendor';
    const items = rows.map((row) => settingsState.editingId === row.id && settingsState.editingKind === kind ? nameForm('edit', `${title}名稱`, row.name, `${kind === 'vendors' && row.status === 'candidate' ? `<button type="button" data-settings-action="confirm" data-settings-kind="vendors" data-id="${escapeHtml(row.id)}">確認</button>` : ''}${deleteButton(`data-settings-action="delete" data-settings-kind="${kind}" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.name)}"`)}`) : rowButton(`data-settings-action="edit-${suffix}" data-id="${escapeHtml(row.id)}"`, row.name, '編輯')).join('') || `<p class="empty">尚無${title}。</p>`;
    return `<section class="trade-subgroup" aria-label="${title}"><header class="trade-subgroup__bar"><h3>${title}</h3>${adding ? '' : `<button type="button" class="settings-text-action" data-settings-action="add-${suffix}">＋ 新增</button>`}</header>${adding ? nameForm('add', `${title}名稱`) : ''}<div class="settings-rows">${items}</div></section>`;
  };
  const panel = ({ trade, nameMatches, matchingTasks }: typeof results[number]) => {
    if (expandedId !== trade.id) return '';
    const tasks = keyword && !nameMatches ? matchingTasks : appState.settingsAllTasks.filter((task) => task.tradeTypeId === trade.id);
    const vendors = appState.settingsAllVendors.filter((vendor) => vendor.tradeTypeId === trade.id);
    const tradeEdit = settingsState.editingKind === 'trade' && settingsState.editingId === trade.id ? nameForm('edit', '工種名稱', trade.name, deleteButton(`data-settings-action="delete-trade" data-trade-type-id="${escapeHtml(trade.id)}"`)) : `<button type="button" class="settings-text-action" data-settings-action="edit-trade" data-trade-type-id="${escapeHtml(trade.id)}">編輯工種名稱</button>`;
    return `<div class="trade-task-panel">${subGroup('tasks', '工項', tasks)}${subGroup('vendors', '廠商', vendors)}${tradeEdit}</div>`;
  };
  const trades = results.map((result) => { const { trade, matchingTasks, nameMatches } = result; const open = expandedId === trade.id; const meta = keyword && !nameMatches ? `符合 ${matchingTasks.length} 個` : `${appState.settingsAllTasks.filter((task) => task.tradeTypeId === trade.id).length} 工項 · ${appState.settingsAllVendors.filter((vendor) => vendor.tradeTypeId === trade.id).length} 廠商`; return `<div class="trade-item" data-trade-type-id="${escapeHtml(trade.id)}"><button type="button" class="settings-row trade-toggle" aria-expanded="${open}" data-settings-action="toggle-trade-tasks" data-trade-type-id="${escapeHtml(trade.id)}"><span class="settings-row__name">${escapeHtml(trade.name)}</span><span class="settings-row__meta">${escapeHtml(meta)}</span><span class="trade-toggle__chevron" aria-hidden="true">${open ? '▾' : '▸'}</span></button>${panel(result)}</div>`; }).join('') || '<p class="empty">找不到符合的工種或工項。</p>';
  return `<section class="settings-list-page trade-management"><div class="settings-toolbar"><input data-trade-search type="search" enterkeyhint="search" aria-label="搜尋工種或工項" placeholder="搜尋工種或工項" value="${escapeHtml(keyword)}">${addButton('add-trade', '新增工種')}</div>${settingsState.adding && settingsState.editingKind === 'trade' && !settingsState.editingId ? nameForm('add', '工種名稱') : ''}<div class="settings-rows">${trades}</div></section>`;
}
function nameForm(mode: 'add' | 'edit', label: string, value = '', extra = '', maxlength = 50): string { return `<form class="settings-edit-form" data-settings-form="${mode}"><label>${label}<input name="name" maxlength="${maxlength}" value="${escapeHtml(value)}"${label === '位置' ? ' placeholder="例：東側"' : ''} autofocus></label><div class="form-actions form-actions--submit"><button class="primary" type="submit">儲存</button><button type="button" data-settings-action="cancel">取消</button>${extra}</div></form>`; }
export function settingsReturnLink(): string { const href = appState.settingsReturnModule === 'water-level' ? '#water-level' : '#daily'; const label = appState.settingsReturnModule === 'water-level' ? '返回水位' : '返回日報'; return `<a class="settings-button" href="${href}">${label}</a>`; }
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
export function debugPanel(): string {
  return `<section id="settings-debug-panel" class="settings-debug-panel" data-debug-panel aria-label="偵錯資訊"><h2>偵錯資訊</h2><p>僅包含狀態與安全錯誤碼，不包含登入憑證、加入碼或日報內容。</p><pre data-debug-output>${escapeHtml(JSON.stringify({ ...debugSnapshot(), stores: appState.settingsDebug }, null, 2))}</pre><div class="action-row"><button type="button" data-settings-action="copy-debug">複製偵錯資訊</button><button type="button" class="danger-text" data-settings-action="clear-debug">清除偵錯紀錄</button></div></section>`;
}
export function memoryReviewView(): string {
  const groups = groupMemoryCandidates(appState.memoryCandidates);
  const effectiveKeys = new Set(confirmationSelection([...memoryReviewState.explicitKeys], appState.memoryCandidates).keys);
  const allSelected = appState.memoryCandidates.length > 0 && appState.memoryCandidates.every((row) => memoryReviewState.explicitKeys.has(row.key));
  const sections = groups.map((group) => {
    const open = memoryReviewState.openKind === group.kind;
    const groupSelected = group.rows.every((row) => memoryReviewState.explicitKeys.has(row.key));
    const rows = group.rows.map((row) => {
      const impact = memoryCandidateImpact(appState.daily.report, row); const expanded = memoryReviewState.expandedKeys.has(row.key);
      const detailId = `memory-detail-${row.kind}-${escapeHtml(row.id)}`;
      const recent = row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString('zh-TW') : '尚無日期';
      return `<article class="memory-candidate${expanded ? ' expanded' : ''}"><div class="memory-candidate__summary"><label class="memory-candidate__select"><input type="checkbox" data-memory-candidate value="${escapeHtml(row.key)}" aria-label="選取${escapeHtml(row.name)}" ${effectiveKeys.has(row.key) ? 'checked' : ''}></label><button type="button" class="memory-candidate__toggle" data-memory-detail-toggle="${escapeHtml(row.key)}" aria-expanded="${expanded}" aria-controls="${detailId}"><strong>${escapeHtml(row.name)}</strong><span>${memoryCandidateLabels[row.kind]}</span><b>${Math.min(row.usageCount, 4)}/4</b></button></div>${expanded ? `<div class="memory-candidate__detail" id="${detailId}"><dl>${row.parentName ? `<div><dt>所屬資料</dt><dd>${escapeHtml(row.parentName)}</dd></div>` : ''}<div><dt>最近使用</dt><dd>${escapeHtml(recent)}</dd></div><div><dt>目前草稿影響</dt><dd>${impact} 筆</dd></div></dl><button type="button" class="danger-text" data-memory-reject="${escapeHtml(row.key)}">${impact ? '逐筆駁回' : '駁回此候選'}</button></div>` : ''}</article>`;
    }).join('');
    return `<section class="settings-work-area memory-review__group${open ? ' expanded' : ''}"><button type="button" class="settings-work-area__toggle memory-review__group-toggle" data-memory-group-toggle="${group.kind}" aria-expanded="${open}"><span><strong>${memoryCandidateLabels[group.kind]}</strong><small>待處理 ${group.rows.length} 筆</small></span><span aria-hidden="true">›</span></button>${open ? `<div class="settings-work-area__content memory-review__group-content"><label class="memory-review__select-all"><input type="checkbox" data-memory-select-group="${group.kind}" ${groupSelected ? 'checked' : ''}>全選本區</label><div class="settings-management-list memory-review__list">${rows}</div></div>` : ''}</section>`;
  }).join('');
  const selected = appState.memoryCandidates.filter((row) => memoryReviewState.explicitKeys.has(row.key));
  const confirmation = confirmationSelection(selected.map((row) => row.key), appState.memoryCandidates);
  const rejection = rejectionSelection(selected.map((row) => row.key), appState.memoryCandidates); const rejectionRows = appState.memoryCandidates.filter((row) => rejection.keys.includes(row.key));
  const safeReject = rejectionRows.length > 0 && rejectionRows.every((row) => memoryCandidateImpact(appState.daily.report, row) === 0);
  const selectionSummary = groups.map((group) => { const count = group.rows.filter((row) => memoryReviewState.explicitKeys.has(row.key)).length; return count ? `${memoryCandidateLabels[group.kind]} ${count} 筆` : ''; }).filter(Boolean).join('、');
  const actionBar = selected.length ? `<aside class="settings-management-panel memory-review__action-bar" aria-label="批次操作"><div><strong>已選 ${selected.length} 筆</strong><small>${selectionSummary}</small>${confirmation.addedParentCount ? `<small>確認時另包含 ${confirmation.addedParentCount} 筆必要資料</small>` : ''}${rejection.addedChildCount ? `<small>駁回時另包含 ${rejection.addedChildCount} 筆關聯候選</small>` : ''}${!safeReject ? '<small>含有草稿影響，請展開後逐筆駁回</small>' : ''}</div><div><button type="button" class="danger-text" data-memory-reject-selected ${safeReject ? '' : 'disabled'}>駁回 ${rejection.keys.length} 筆</button><button type="button" class="primary" data-memory-confirm>確認 ${confirmation.keys.length} 筆</button></div></aside>` : '';
  const overview = `<section class="settings-management-panel memory-review__overview"><div><strong>待處理 ${appState.memoryCandidates.length} 筆</strong><span>待審核也會同步共用；累計 4 次有效套用後自動成為正式記憶。</span></div>${appState.memoryCandidates.length ? `<label class="memory-review__select-all"><input type="checkbox" data-memory-select-all ${allSelected ? 'checked' : ''}>全選全部</label>` : ''}</section>`;
  return `<main class="app-shell settings-page memory-review${selected.length ? ' has-selection' : ''}">${settingsHeader('記憶審核')}${overview}${memoryReviewState.feedback ? `<p class="memory-review__feedback memory-review__feedback--${memoryReviewState.feedbackTone}" role="${memoryReviewState.feedbackTone === 'error' ? 'alert' : 'status'}">${escapeHtml(memoryReviewState.feedback)}</p>` : ''}${appState.memoryCandidates.length ? `<div class="settings-work-areas memory-review__areas">${sections}</div>` : '<p class="empty memory-review__empty">目前沒有待審核的記憶。</p>'}${actionBar}</main>`;
}
const settingsRow = (href: string, title: string) => `<a class="settings-management-list__item" href="${href}"><span><strong>${title}</strong></span><span aria-hidden="true">›</span></a>`;
export function settingsHomeView(): string {
  const pending = appState.memoryCandidates.length; const site = appState.accountSites.find((item) => item.id === appState.accountActiveSiteId);
  const [statusMain, statusSub] = !appState.accountAuth.user ? ['本機模式', '登入後可共用工地'] : !appState.accountActiveSiteId ? ['尚未選擇共用工地', ''] : [site?.name ?? '共用工地', appState.accountPendingCount ? `待同步 ${appState.accountPendingCount} 筆` : '已同步'];
  const status = `<a class="settings-status" href="#settings/account"><span class="settings-status__main">${escapeHtml(statusMain)}</span>${statusSub ? `<span class="settings-status__sub">${escapeHtml(statusSub)}</span>` : ''}<span aria-hidden="true">›</span></a>`;
  const attention = pending ? `<a class="settings-attention" href="#settings/memory">${pending} 筆候選記憶待審核 ›</a>` : '';
  const group = (title: string, rows: string) => `<section class="settings-home__group" aria-label="${title}"><h2>${title}</h2><div class="settings-management-list">${rows}</div></section>`;
  return `<main class="app-shell settings-page settings-home">${settingsHeader('設定', true)}${status}${attention}${group('主檔', sectionLabels.map(([key, label]) => settingsRow(`#settings/daily/${key}`, label)).join('') + settingsRow('#settings/water', '水位井位'))}<p class="settings-home__footer"><a class="settings-home__link" href="#settings/data">備份與還原</a> · <a class="settings-home__link" href="#settings/debug">同步診斷</a> · <a class="settings-home__link" href="#settings/memory">記憶審核</a><br><span>版本 ${escapeHtml(APP_VERSION)}</span></p></main>`;
}
export function settingsSectionFromHash(hash: string): DailySettingsSection | null { const key = hash.slice('#settings/daily/'.length); return sectionLabels.find(([section]) => section === key)?.[0] ?? null; }
export function dailySettingsView(): string { const title = sectionLabels.find(([key]) => key === settingsState.activeSection)?.[1] ?? ''; return `<main class="app-shell settings-page">${settingsHeader(title)}<div class="settings-management-panel">${settingsItems()}</div></main>`; }
export function dataSystemView(): string { return `<main class="app-shell settings-page">${settingsHeader('記憶備份與還原')}<div class="settings-management-panel">${settingsItems()}</div></main>`; }
export async function refreshSettings(): Promise<void> { const section = settingsState.activeSection; appState.settingsTrades = await listMemories('trades', undefined, 'all'); if (section === 'materials') { appState.materialTypes = await listMaterialTypes(); appState.settingsMaterialMemory = await listMaterialMemory('all'); } else if (section === 'templates') appState.settingsTemplates = await listTemplates(); else if (section === 'trade-tasks') { appState.settingsAllTasks = await listMemories('tasks', undefined, 'all'); appState.settingsAllVendors = await listMemories('vendors', undefined, 'all'); } else if (section !== 'backup') appState.settingsRows = await listMemories(section); }
export function refreshTaskSearch(target: HTMLInputElement): void { settingsState.taskSearchKeyword = target.value; void renderApp().then(() => { const search = app.querySelector<HTMLInputElement>('[data-settings-search="tasks"]'); search?.focus(); search?.setSelectionRange(search.value.length, search.value.length); }); }
export function refreshTradeSearch(target: HTMLInputElement): void { appState.tradeSearchKeyword = target.value; void renderApp().then(() => { const search = app.querySelector<HTMLInputElement>('[data-trade-search]'); search?.focus(); search?.setSelectionRange(search.value.length, search.value.length); }); }
export async function rejectMemoryCandidate(candidate: MemoryCandidate): Promise<void> { if (candidate.kind === 'material-types') appState.daily.report = await deleteMaterialType(appState.daily.report, candidate.id); else if (candidate.kind === 'material-items') appState.daily.report = await rejectMaterialMemoryItem(appState.daily.report, candidate.id); else { const next = await deleteMemory(candidate.kind, candidate.id); if (next) appState.daily.report = next; } }
export async function performMemoryReviewWrite(action: () => Promise<void>, failureLabel: string): Promise<boolean> { try { await action(); await persistActiveMemoryPartition(); return true; } catch (error) { const detail = error instanceof Error ? error.message : '本機資料寫入失敗。'; memoryReviewState.feedback = `${failureLabel}：${detail} 選取內容已保留，請確認後再試。`; memoryReviewState.feedbackTone = 'error'; await renderApp(); return false; } }
export function prepareNextMemoryGroup(): void { const groups = groupMemoryCandidates(appState.memoryCandidates); const current = groups.findIndex((group) => group.kind === memoryReviewState.openKind); memoryReviewState.nextKind = current >= 0 ? groups[current + 1]?.kind ?? groups.find((_, index) => index !== current)?.kind ?? null : groups[0]?.kind ?? null; }
