import { isPositiveDecimal } from '../../shared/decimal';
import type { MaterialEntry } from '../../domain/daily';
import { materialStatusTone } from '../entry-presentation';
import { escapeHtml } from '../../shared/html';
import { renderApp } from '../../main';
import { appState, app, type MaterialConnectionUndoNotice } from '../../app/state';
import { normalizeSearch } from '../../app/shell';
import { dailyEntrySummary } from './daily-view';
const MATERIAL_CONNECTION_NODE_HEIGHT_PX = 68;
const MATERIAL_CONNECTION_NODE_GAP_PX = 8;
export const materialDirty = () => Boolean(appState.materialEditor && (!appState.materialEditor.originalId || JSON.stringify(appState.materialEditor.value) !== JSON.stringify(appState.daily.materialEntry(appState.materialEditor.originalId))));
export type MaterialSuggestField = 'materialTypeSnapshot' | 'itemName' | 'specification' | 'unit' | 'supplierNameSnapshot';
export const materialChoices = (fieldName: MaterialSuggestField, value: string): string[] => {
  const query = normalizeSearch(value); const editing = appState.materialEditor?.value; const typeId = editing?.materialTypeId ?? appState.materialTypes.find((row) => normalizeSearch(row.name) === normalizeSearch(editing?.materialTypeSnapshot ?? ''))?.id; const memoryField = fieldName === 'materialTypeSnapshot' ? undefined : ({ itemName: 'itemName', specification: 'specification', unit: 'unit', supplierNameSnapshot: 'supplier' } as const)[fieldName];
  const candidates = fieldName === 'materialTypeSnapshot' ? appState.materialTypes.map((row) => ({ value: row.name, lastUsedAt: row.lastUsedAt ?? '', usageCount: row.usageCount, sortOrder: row.sortOrder })) : appState.materialMemory.filter((row) => (fieldName === 'unit' || fieldName === 'supplierNameSnapshot' || !typeId || row.materialTypeId === typeId) && row.fieldType === memoryField).map((row) => ({ value: row.value, lastUsedAt: row.lastUsedAt, usageCount: row.usageCount, sortOrder: 0 }));
  return candidates.filter((row) => !query || normalizeSearch(row.value).includes(query)).sort((a, b) => fieldName === 'materialTypeSnapshot' && !query ? a.sortOrder - b.sortOrder : b.lastUsedAt.localeCompare(a.lastUsedAt) || b.usageCount - a.usageCount || a.value.localeCompare(b.value)).map((row) => row.value).filter((value, index, values) => values.indexOf(value) === index).slice(0, 5);
};
function materialInput(label: string, name: 'materialTypeSnapshot' | 'itemName' | 'specification' | 'quantity' | 'unit' | 'supplierNameSnapshot', value: string): string { const suggest = name === 'quantity' ? '' : ' autocomplete="off" role="combobox" aria-autocomplete="list"'; const error = appState.materialEditor?.errors.find((item) => item.startsWith(`${name}:`))?.slice(name.length + 1) ?? ''; return `<label>${label}<input data-material-field="${name}" value="${escapeHtml(value)}"${suggest} aria-invalid="${Boolean(error)}">${error ? `<span class="field-error">${escapeHtml(error)}</span>` : ''}</label>`; }
export function materialEntryView(entry: MaterialEntry): string {
  const editing = appState.materialEditor?.id === entry.id; const trade = entry.connectedTradeSectionId ? appState.daily.trade(entry.connectedTradeSectionId) : undefined; const connectionLabel = entry.entryType === 'independent' ? (trade ? '已連接' : '未連接') : '普通'; const connectionTone = materialStatusTone(entry.entryType, Boolean(trade)); const details = [entry.materialTypeSnapshot, entry.quantity && entry.unit ? `${entry.quantity} ${entry.unit}` : entry.quantity || entry.unit, entry.supplierNameSnapshot].filter(Boolean).join('｜') || '尚未填寫';
  const summary = `<header class="daily-entry-summary collapsed-summary material-entry__summary" data-material-standalone="true" data-daily-action="toggle-material" data-material-id="${escapeHtml(entry.id)}">${dailyEntrySummary({ kind: 'material', primary: entry.itemName || '尚未命名', secondary: details, status: connectionLabel, statusTone: connectionTone })}</header>`;
  // 尚未儲存的表單草稿不屬於日報資料，不能讓它進入刪除／復原流程。
  const swipe = (content: string) => entry.id.startsWith('draft:') ? content : `<div class="swipe-item material-swipe" data-swipe-item="true" data-swipe-kind="material" data-swipe-id="${escapeHtml(entry.id)}"><div class="swipe-item__delete" aria-hidden="true">🗑</div>${content}</div>`;
  if (!editing) return swipe(`<article class="daily-entry material-entry material-entry--summary" data-material="${escapeHtml(entry.id)}" data-material-standalone="true">${summary}</article>`);
  const value = appState.materialEditor!.value; return swipe(`<article class="daily-entry daily-entry--expanded material-entry material-entry--editing" data-material="${escapeHtml(entry.id)}" data-material-editor="${escapeHtml(entry.id)}" data-material-standalone="true">${summary}<div class="material-entry__divider"></div><section class="material-entry__content"><div class="material-form-grid">${materialInput('材料類型', 'materialTypeSnapshot', value.materialTypeSnapshot)}${materialInput('品名', 'itemName', value.itemName)}${materialInput('規格（選填）', 'specification', value.specification)}${materialInput('供應商', 'supplierNameSnapshot', value.supplierNameSnapshot)}${materialInput('數量', 'quantity', value.quantity)}${materialInput('單位', 'unit', value.unit)}</div><label class="material-note">備註（選填）<textarea rows="2" data-material-field="note">${escapeHtml(value.note)}</textarea></label><div class="form-actions form-actions--submit material-form-actions"><button type="button" class="primary" data-daily-action="save-material">儲存</button><button type="button" data-daily-action="cancel-material">取消輸入</button></div><div class="material-data-actions">${entry.entryType === 'independent' && entry.connectedTradeSectionId ? `<button type="button" class="warning-button" data-daily-action="disconnect-material" data-material-id="${escapeHtml(entry.id)}">解除連接</button>` : ''}</div></section></article>`);
}
export function syncMaterialEditor(materialId: string): void { if (appState.materialEditor?.id === materialId) { const entry = appState.daily.materialEntry(materialId); if (entry) appState.materialEditor.value = structuredClone(entry); } }
export function materialConnectionPanel(): string {
  const materials = appState.daily.report.standaloneMaterialEntries;
  const selected = appState.materialConnectionSelectionId ? appState.daily.materialEntry(appState.materialConnectionSelectionId) : undefined;
  const focus = appState.materialConnectionFocusTradeId;
  const query = normalizeSearch(appState.materialConnectionTradeSearch);
  const visibleTrades = appState.daily.report.tradeSections.filter((trade) => !query || normalizeSearch(`${trade.tradeNameSnapshot} ${trade.vendorNameSnapshot}`).includes(query));
  const visibleTradeIds = new Set(visibleTrades.map((trade) => trade.id));
  const linkCount = (tradeId: string) => materials.filter((entry) => entry.connectedTradeSectionId === tradeId).length;
  const mobilePosition = (index: number, total: number) => ((index + .5) / Math.max(total, 1)) * 100;
  const materialNodes = materials.map((entry) => {
    const connected = entry.connectedTradeSectionId ? appState.daily.trade(entry.connectedTradeSectionId) : undefined;
    const title = entry.itemName || entry.materialTypeSnapshot || '未命名進料';
    const connection = connected ? `已接至 ${connected.tradeNameSnapshot}${visibleTradeIds.has(connected.id) ? '' : '（目前未顯示）'}` : '未連接';
    return `<button type="button" class="connection-node connection-node--material ${appState.materialConnectionSelectionId === entry.id ? 'is-selected' : ''}" data-daily-action="select-connection-material" data-material-id="${escapeHtml(entry.id)}" aria-pressed="${appState.materialConnectionSelectionId === entry.id}" title="${escapeHtml(title)}"><span class="connection-port" aria-hidden="true"></span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(connection)}</small></button>`;
  }).join('') || '<p class="empty">先儲存一筆進料，才可建立連接。</p>';
  const tradeNodes = visibleTrades.map((trade) => {
    const count = linkCount(trade.id);
    const title = `${trade.tradeNameSnapshot}${trade.vendorNameSnapshot ? `｜${trade.vendorNameSnapshot}` : ''}`;
    return `<button type="button" class="connection-node connection-node--trade ${focus === trade.id ? 'is-focused' : ''}" data-daily-action="select-connection-trade" data-trade-id="${escapeHtml(trade.id)}" ${selected ? '' : 'disabled'} title="${escapeHtml(title)}"><span class="connection-port" aria-hidden="true"></span><strong>${escapeHtml(trade.tradeNameSnapshot)}</strong><small>${trade.status === 'complete' ? '已完成' : '草稿'}${count ? `｜已連接 ${count} 筆` : ''}</small>${count ? `<b class="connection-count" aria-label="${count} 筆進料已連接">${count}</b>` : ''}</button>`;
  }).join('') || '<p class="empty">找不到符合的工種。</p>';
  const tradeIndex = new Map(visibleTrades.map((trade, index) => [trade.id, index]));
  const curves = materials.flatMap((entry) => {
    const targetIndex = entry.connectedTradeSectionId ? tradeIndex.get(entry.connectedTradeSectionId) : undefined;
    if (targetIndex === undefined) return [];
    const active = entry.id === appState.materialConnectionSelectionId;
    return [`<path class="connection-curve${active ? ' is-active' : ''}" data-connection-curve data-material-id="${escapeHtml(entry.id)}" data-trade-id="${entry.connectedTradeSectionId}" vector-effect="non-scaling-stroke"/>`];
  }).join('');
  const mobileCurves = materials.flatMap((entry, materialIndex) => {
    const targetIndex = entry.connectedTradeSectionId ? tradeIndex.get(entry.connectedTradeSectionId) : undefined;
    if (targetIndex === undefined) return [];
    const active = entry.id === appState.materialConnectionSelectionId;
    const startX = mobilePosition(materialIndex, materials.length);
    const endX = mobilePosition(targetIndex, visibleTrades.length);
    return [`<path class="connection-curve${active ? ' is-active' : ''}" d="M ${startX} 0 C ${startX} 28, ${endX} 52, ${endX} 80" vector-effect="non-scaling-stroke"/>`];
  }).join('');
  const height = Math.max(materials.length, visibleTrades.length, 1) * (MATERIAL_CONNECTION_NODE_HEIGHT_PX + MATERIAL_CONNECTION_NODE_GAP_PX) - MATERIAL_CONNECTION_NODE_GAP_PX;
  const canvas = `<div class="material-connection-canvas" aria-hidden="true" style="--connection-canvas-height:${height}px"><svg class="material-connection-canvas__desktop" viewBox="0 0 1 1" preserveAspectRatio="none">${curves}</svg><svg class="material-connection-canvas__mobile" viewBox="0 0 100 80" preserveAspectRatio="none">${mobileCurves}</svg></div>`;
  return `<section class="material-connection-panel" aria-label="進料接線盤" style="--connection-node-height:${MATERIAL_CONNECTION_NODE_HEIGHT_PX}px;--connection-node-gap:${MATERIAL_CONNECTION_NODE_GAP_PX}px"><header><div><h3>進料接線盤</h3><p class="hint" aria-live="polite">${selected ? `已選取「${escapeHtml(selected.itemName || selected.materialTypeSnapshot || '未命名進料')}」，請點選工種端口。` : '先點選已儲存的進料，再點選工種。'}</p></div>${selected ? '<button type="button" data-daily-action="clear-connection-selection">取消選取</button>' : ''}</header><div class="material-connection-panel__board"><section class="connection-node-section" style="--connection-mobile-count:${Math.max(materials.length, 1)}"><header><h4>獨立進料</h4></header><div class="connection-node-list">${materialNodes}</div></section>${canvas}<section class="connection-node-section connection-node-section--trades" style="--connection-mobile-count:${Math.max(visibleTrades.length, 1)}"><header><h4>工種</h4><input data-material-connection-search aria-label="搜尋工種或廠商" placeholder="搜尋工種或廠商" value="${escapeHtml(appState.materialConnectionTradeSearch)}" autocomplete="off"></header><div class="connection-node-list">${tradeNodes}</div></section></div></section>`;
}
export function syncMaterialConnectionCurves(): void {
  if (window.matchMedia('(max-width: 760px)').matches) return;
  app.querySelectorAll<HTMLElement>('.material-connection-panel__board').forEach((board) => {
    const svg = board.querySelector<SVGSVGElement>('.material-connection-canvas__desktop');
    if (!svg) return;
    const boardRect = board.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;
    svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
    board.querySelectorAll<SVGPathElement>('[data-connection-curve]').forEach((path) => {
      const materialId = path.dataset.materialId; const tradeId = path.dataset.tradeId;
      const sourcePort = [...board.querySelectorAll<HTMLElement>('.connection-node[data-material-id]')].find((node) => node.dataset.materialId === materialId)?.querySelector<HTMLElement>('.connection-port');
      const targetPort = [...board.querySelectorAll<HTMLElement>('.connection-node[data-trade-id]')].find((node) => node.dataset.tradeId === tradeId)?.querySelector<HTMLElement>('.connection-port');
      if (!sourcePort || !targetPort) { path.removeAttribute('d'); return; }
      const source = sourcePort.getBoundingClientRect(); const target = targetPort.getBoundingClientRect();
      const startX = source.left - boardRect.left + source.width / 2; const startY = source.top - boardRect.top + source.height / 2;
      const endX = target.left - boardRect.left + target.width / 2; const endY = target.top - boardRect.top + target.height / 2;
      const control = Math.max(32, Math.abs(endX - startX) * .34);
      path.setAttribute('d', `M ${startX} ${startY} C ${startX + control} ${startY}, ${endX - control} ${endY}, ${endX} ${endY}`);
    });
  });
}
export function startMaterialEditor(entryType: 'normal' | 'independent', existing?: MaterialEntry): void { const value = existing ? structuredClone(existing) : { id: `draft:${crypto.randomUUID()}`, entryType, connectedTradeSectionId: null, materialTypeId: null, materialTypeSnapshot: '', itemName: '', supplierId: null, supplierNameSnapshot: '', quantity: '', unit: '', specification: '', note: '', sortOrder: appState.daily.report.standaloneMaterialEntries.length, createdAt: '', updatedAt: '' }; appState.materialEditor = { id: value.id, originalId: existing?.id ?? null, value, errors: [] }; }
export function discardMaterialEditor(): boolean { if (materialDirty() && !window.confirm('目前進料內容尚未儲存，是否放棄這次修改？')) return false; appState.materialEditor = null; return true; }
export function materialValidation(entry: MaterialEntry): string[] { const errors: string[] = []; if (!entry.materialTypeSnapshot.trim()) errors.push('materialTypeSnapshot:請填寫材料類型。'); if (!entry.itemName.trim()) errors.push('itemName:請填寫品名。'); if (!entry.supplierNameSnapshot.trim()) errors.push('supplierNameSnapshot:請填寫供應商。'); if (!isPositiveDecimal(entry.quantity)) errors.push('quantity:請輸入大於 0 的數量。'); if (!entry.unit.trim()) errors.push('unit:請填寫單位。'); return errors; }
export function refreshMaterialConnectionSearch(target: HTMLInputElement): void { appState.materialConnectionTradeSearch = target.value; void renderApp().then(() => { const search = app.querySelector<HTMLInputElement>('[data-material-connection-search]'); search?.focus(); search?.setSelectionRange(search.value.length, search.value.length); }); }
export function enqueueMaterialConnectionUndo(materialId: string, tradeId: string): void { if (appState.materialConnectionUndo) window.clearTimeout(appState.materialConnectionUndo.timer); const notice: MaterialConnectionUndoNotice = { materialId, tradeId, expiresAt: Date.now() + 6000, timer: 0 }; notice.timer = window.setTimeout(() => { if (appState.materialConnectionUndo === notice) { appState.materialConnectionUndo = null; void renderApp(); } }, 6000); appState.materialConnectionUndo = notice; }
export function bindMaterialConnectionResize(): void {
  window.addEventListener('resize', () => requestAnimationFrame(syncMaterialConnectionCurves));
}
