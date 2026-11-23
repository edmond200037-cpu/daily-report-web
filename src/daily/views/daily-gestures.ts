import { dragIntent, inertDragClone, dragSurface, positionDragPreview, resolveDropSlotIndex, scrollDragEdge, dropIndicatorMarkup } from '../drag-presentation';
import { persistEntryDraft } from './daily-entry';
import type { DailyDeleteUndo } from '../daily-controller';
import { renderApp } from '../../main';
import { appState, tradeSwipe, workItemDrag, app, type TradeUndoEntry, tradeDrag, type EntryDragKind } from '../../app/state';
import { isReadOnlySite } from '../../app/sync-runtime';
import { discardMaterialEditor } from './material-view';
import { discardContactEditor } from './contact-view';
const TRADE_DELETE_REVEAL_PX = 88;
// ADR-010／015：預覽由被拖曳的收合列複製而來，外層 .daily-page 保留樣式範圍；移除 id 與 data-* 避免重複與誤觸發。
function entryDragPreview(root: HTMLElement): HTMLElement { const article = document.createElement('article'); article.className = root.className.replace('daily-entry--expanded', '').trim(); article.append(inertDragClone(root.querySelector<HTMLElement>('.trade-row-summary')!)); return dragSurface(article); }
const ENTRY_COLLECTION = { trade: 'tradeSections', material: 'standaloneMaterialEntries', contact: 'contacts', special: 'specialItems' } as const satisfies Record<EntryDragKind, string>;
type OrderedEntry = { id: string; sortOrder: number; status?: string };
const entryList = (kind: EntryDragKind): OrderedEntry[] => appState.daily.report[ENTRY_COLLECTION[kind]] as unknown as OrderedEntry[];
const guardTouchScroll = (event: TouchEvent): void => { if ((tradeDrag.active || workItemDrag.active) && event.cancelable) event.preventDefault(); };
export function clearTradeSwipe(restorePosition = true): void { if (restorePosition) tradeSwipe.root?.style.setProperty('--trade-swipe-offset', '0px'); if (tradeSwipe.root?.hasPointerCapture(tradeSwipe.pointerId ?? -1)) tradeSwipe.root.releasePointerCapture(tradeSwipe.pointerId ?? -1); tradeSwipe.active = false; tradeSwipe.eligible = false; tradeSwipe.id = null; tradeSwipe.kind = null; tradeSwipe.pointerId = null; tradeSwipe.offset = 0; tradeSwipe.root = null; }
async function persistWorkItemReorder(tradeId: string, from: number, to: number): Promise<boolean> { const trade = appState.daily.trade(tradeId); if (!trade) return false; const originalWorkItems = structuredClone(trade.workItems); const originalStatus = trade.status; if (!appState.daily.reorderWorkItems(tradeId, from, to)) return false; try { await appState.daily.flush(); return true; } catch { trade.workItems = originalWorkItems; trade.status = originalStatus; try { await appState.daily.flush(); } catch { /* preserve restored in-memory data for the next automatic save */ } alert('工項排序儲存失敗，已恢復原順序。'); return false; } }
// 握把拖曳只更新 DOM，放開前不重繪輸入器、不更新資料或 dirty。
export function clearWorkItemDrag(): void {
  if (workItemDrag.holdTimer !== null) window.clearTimeout(workItemDrag.holdTimer);
  const { row, placeholder, handle, pointerId } = workItemDrag;
  if (handle?.hasPointerCapture(pointerId ?? -1)) handle.releasePointerCapture(pointerId ?? -1);
  if (app.hasPointerCapture(pointerId ?? -1)) app.releasePointerCapture(pointerId ?? -1);
  if (row && placeholder?.isConnected) placeholder.replaceWith(row);
  workItemDrag.preview?.remove(); workItemDrag.indicator?.remove();
  Object.assign(workItemDrag, { active: false, pending: false, holdTimer: null, row: null, placeholder: null, indicator: null, preview: null, handle: null, pointerId: null, tradeId: null, workItemId: null, originalOrder: [], activeDropSlotIndex: null });
}
function workDragRows(): HTMLElement[] {
  const container = workItemDrag.placeholder?.parentElement ?? workItemDrag.row?.parentElement;
  return container ? [...container.querySelectorAll<HTMLElement>(workItemDrag.contact ? '[data-contact-task]' : '[data-sortable-work]')] : [];
}
function updateWorkItemDragTarget(): void {
  if (!workItemDrag.active || !workItemDrag.placeholder?.isConnected) return;
  const rows = workDragRows();
  const nextSlot = resolveDropSlotIndex(workItemDrag.clientY, rows);
  workItemDrag.activeDropSlotIndex = nextSlot;
  workItemDrag.indicator?.remove();
  const template = document.createElement('template'); template.innerHTML = dropIndicatorMarkup(nextSlot === rows.length);
  const indicator = template.content.firstElementChild as HTMLElement;
  // Overlay avoids changing row geometry while resolving slots.
  indicator.style.position = 'fixed'; indicator.style.margin = '0'; indicator.style.zIndex = '1000';
  const anchor = rows[nextSlot] ?? rows.at(-1) ?? workItemDrag.placeholder;
  const rect = anchor.getBoundingClientRect();
  indicator.style.left = rect.left + 'px'; indicator.style.width = rect.width + 'px';
  indicator.style.top = (rows[nextSlot] ? rect.top : rect.bottom) + 'px';
  document.body.append(indicator); workItemDrag.indicator = indicator;
}
function startWorkItemDrag(row: HTMLElement): void {
  if (!row.isConnected || isReadOnlySite() || appState.workspaceSwitching) { clearWorkItemDrag(); return; }
  if (workItemDrag.holdTimer !== null) window.clearTimeout(workItemDrag.holdTimer);
  workItemDrag.holdTimer = null; clearTradeSwipe(); navigator.vibrate?.(10);
  const rows = workDragRows();
  workItemDrag.originalOrder = rows.map((item) => (workItemDrag.contact ? item.dataset.contactTask : item.dataset.work)!);
  const rect = row.getBoundingClientRect();
  const placeholder = inertDragClone(row);
  placeholder.classList.add('work-item--drag-placeholder'); placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.width = rect.width + 'px'; placeholder.style.height = rect.height + 'px';
  const preview = document.createElement('div'); preview.className = 'trade-drag-preview work-item-drag-preview';
  preview.style.width = rect.width + 'px'; preview.style.height = rect.height + 'px';
  const content = document.createElement('div'); content.className = 'continuous-work'; content.append(inertDragClone(row));
  preview.append(dragSurface(content)); document.body.append(preview);
  workItemDrag.offsetX = workItemDrag.startX - rect.left; workItemDrag.offsetY = workItemDrag.startY - rect.top;
  workItemDrag.pending = false; workItemDrag.active = true; workItemDrag.preview = preview; workItemDrag.placeholder = placeholder;
  app.setPointerCapture(workItemDrag.pointerId!);
  row.replaceWith(placeholder);
  positionDragPreview(preview, workItemDrag.clientX, workItemDrag.clientY, workItemDrag.offsetX, workItemDrag.offsetY);
  updateWorkItemDragTarget();
}
export function pruneTradeUndoQueue(now = Date.now()): void { const active: TradeUndoEntry[] = []; appState.tradeUndoQueue.forEach((entry) => { if (entry.expiresAt > now) active.push(entry); else window.clearTimeout(entry.timer); }); appState.tradeUndoQueue = active; }
function enqueueTradeUndo(undo: DailyDeleteUndo): void { const entry: TradeUndoEntry = { undo, expiresAt: Date.now() + 6000, timer: 0 }; entry.timer = window.setTimeout(() => { appState.tradeUndoQueue = appState.tradeUndoQueue.filter((item) => item !== entry); void renderApp(); }, 6000); appState.tradeUndoQueue.push(entry); }
export async function deleteItemBySwipe(kind: NonNullable<typeof tradeSwipe.kind>, id: string): Promise<void> { const undo = kind === 'trade' ? appState.daily.deleteTradeForUndo(id) : kind === 'material' ? appState.daily.deleteMaterialForUndo(id) : kind === 'contact' ? appState.daily.deleteContactForUndo(id) : appState.daily.deleteSpecialForUndo(id); if (!undo) return; try { await appState.daily.flush(); } catch { appState.daily.restoreDeletedItem(undo); try { await appState.daily.flush(); } catch { /* preserve the restored in-memory draft for the next automatic save */ } alert('刪除儲存失敗，已復原項目。'); await renderApp(); return; } enqueueTradeUndo(undo); await renderApp(); }
export function clearTradeDrag(): void { if (tradeDrag.frame) cancelAnimationFrame(tradeDrag.frame); if (tradeDrag.holdTimer !== null) window.clearTimeout(tradeDrag.holdTimer); tradeDrag.holdTimer = null; tradeDrag.preview?.remove(); tradeDrag.active = false; tradeDrag.pending = false; tradeDrag.id = null; tradeDrag.kind = null; tradeDrag.activeDropSlotIndex = null; tradeDrag.pointerId = null; }
function updateTradeDragTarget(): void { if (!tradeDrag.active || !tradeDrag.kind) return; const cards = [...app.querySelectorAll<HTMLElement>(`[data-sortable-entry="${tradeDrag.kind}"]`)].filter((card) => card.dataset.entryId !== tradeDrag.id); const nextSlot = resolveDropSlotIndex(tradeDrag.clientY, cards); if (nextSlot === tradeDrag.activeDropSlotIndex) return; tradeDrag.activeDropSlotIndex = nextSlot; void renderApp(); }
function positionTradeDragPreview(preview: HTMLElement, pointerX: number, pointerY: number): void { positionDragPreview(preview, pointerX, pointerY, tradeDrag.offsetX, tradeDrag.offsetY); }
function startEntryDrag(): void { const { id, kind } = tradeDrag; const card = id && kind ? app.querySelector<HTMLElement>(`[data-sortable-entry="${kind}"][data-entry-id="${CSS.escape(id)}"]`) : null; if (!id || !kind || !card || isReadOnlySite()) { clearTradeDrag(); return; } if (tradeDrag.holdTimer !== null) window.clearTimeout(tradeDrag.holdTimer); tradeDrag.holdTimer = null; clearTradeSwipe(); navigator.vibrate?.(10); const rect = card.getBoundingClientRect(); const summaryHeight = card.querySelector<HTMLElement>('.trade-row-summary')?.getBoundingClientRect().height ?? rect.height; tradeDrag.pending = false; tradeDrag.active = true; tradeDrag.originalOrder = entryList(kind).map((item) => item.id); tradeDrag.offsetX = tradeDrag.startX - rect.left; tradeDrag.offsetY = tradeDrag.startY - rect.top; appState.daily.expandedId = null; appState.activeWorkAuxEditor = null; appState.workAuxMenuId = null; const preview = document.createElement('div'); preview.className = 'trade-drag-preview'; preview.style.width = `${rect.width}px`; preview.style.height = `${summaryHeight + 2}px`; preview.append(entryDragPreview(card)); document.body.append(preview); positionTradeDragPreview(preview, tradeDrag.startX, tradeDrag.startY); tradeDrag.preview = preview; void renderApp(); }
export function bindDailyGestureEvents(): void {
  // 整列長按排序（ADR-015）：觸控／筆按住 400ms（位移 < 8px）啟動；滑鼠垂直移動 ≥ 6px 啟動。啟動前的位移一律交還捲動與左滑刪除。
  document.addEventListener('touchmove', guardTouchScroll, { passive: false });
  app.addEventListener('contextmenu', (event) => { if (tradeDrag.active || tradeDrag.pending) event.preventDefault(); });
  app.addEventListener('pointerdown', (event) => { const toggle = (event.target as HTMLElement).closest<HTMLElement>('.trade-row-summary__toggle'); const root = toggle?.closest<HTMLElement>('[data-sortable-entry]'); const id = root?.dataset.entryId; const kind = root?.dataset.sortableEntry as EntryDragKind | undefined; if (!toggle || !id || !kind || toggle.getAttribute('aria-expanded') !== 'false' || (event.pointerType === 'mouse' && event.button !== 0) || isReadOnlySite() || tradeDrag.active || tradeDrag.pending || tradeSwipe.active || workItemDrag.active || workItemDrag.pending) return; tradeDrag.pending = true; tradeDrag.id = id; tradeDrag.kind = kind; tradeDrag.pointerType = event.pointerType; tradeDrag.pointerId = event.pointerId; tradeDrag.startX = tradeDrag.clientX = event.clientX; tradeDrag.startY = tradeDrag.clientY = event.clientY; if (event.pointerType !== 'mouse') { toggle.addEventListener('touchmove', guardTouchScroll, { passive: false }); tradeDrag.holdTimer = window.setTimeout(() => { tradeDrag.holdTimer = null; if (tradeDrag.pending) startEntryDrag(); }, 400); } });
  app.addEventListener('pointerdown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-work-gesture],[data-contact-gesture]');
    if (!handle || !event.isPrimary || event.button !== 0 || isReadOnlySite() || appState.workspaceSwitching || tradeDrag.active || tradeDrag.pending || tradeSwipe.active || workItemDrag.active || workItemDrag.pending) return;
    const contact = handle.hasAttribute('data-contact-gesture');
    const row = handle.closest<HTMLElement>(contact ? '[data-contact-task]' : '[data-sortable-work]');
    const tradeId = row?.closest<HTMLElement>(contact ? '[data-contact-card]' : '[data-trade]')?.getAttribute(contact ? 'data-contact-card' : 'data-trade');
    const workItemId = contact ? row?.dataset.contactTask : row?.dataset.work;
    if (!row || !tradeId || !workItemId) return;
    Object.assign(workItemDrag, { pending: true, contact, row, tradeId, workItemId, pointerId: event.pointerId, pointerType: event.pointerType, handle, startX: event.clientX, clientX: event.clientX, startY: event.clientY, clientY: event.clientY });
    handle.addEventListener('touchmove', guardTouchScroll, { passive: false });
    if (event.pointerType !== 'mouse') workItemDrag.holdTimer = window.setTimeout(() => { if (workItemDrag.pending) startWorkItemDrag(row); }, 400);
  });
  app.addEventListener('click', (event) => { if (workItemDrag.suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  app.addEventListener('pointerdown', (event) => { const target = event.target as HTMLElement; const root = target.closest<HTMLElement>('[data-swipe-item]'); if (!root || tradeDrag.active || tradeSwipe.active || target.closest('.work-item__drag-handle,.trade-card__content,.material-entry__content,.contact-card__content,input,textarea,select,label')) return; const id = root.dataset.swipeId; const kind = root.dataset.swipeKind as typeof tradeSwipe.kind; if (!id || !kind) return; tradeSwipe.active = true; tradeSwipe.eligible = false; tradeSwipe.id = id; tradeSwipe.kind = kind; tradeSwipe.pointerId = event.pointerId; tradeSwipe.startX = event.clientX; tradeSwipe.startY = event.clientY; tradeSwipe.offset = 0; tradeSwipe.root = root; });
  app.addEventListener('pointermove', (event) => { if ((!tradeDrag.active && !tradeDrag.pending) || event.pointerId !== tradeDrag.pointerId) return; tradeDrag.clientX = event.clientX; tradeDrag.clientY = event.clientY; if (tradeDrag.pending) { const dx = event.clientX - tradeDrag.startX; const dy = event.clientY - tradeDrag.startY; const intent = dragIntent(tradeDrag.pointerType, dx, dy); if (intent === 'cancel') { clearTradeDrag(); return; } if (intent === 'pending') return; startEntryDrag(); if (!tradeDrag.active) return; } if (tradeDrag.preview) positionTradeDragPreview(tradeDrag.preview, event.clientX, event.clientY); scrollDragEdge(event.clientY); updateTradeDragTarget(); });
  window.addEventListener('pointermove', (event) => {
    if ((!workItemDrag.active && !workItemDrag.pending) || event.pointerId !== workItemDrag.pointerId) return;
    workItemDrag.clientX = event.clientX; workItemDrag.clientY = event.clientY;
    if (workItemDrag.pending) {
      const intent = dragIntent(workItemDrag.pointerType, event.clientX - workItemDrag.startX, event.clientY - workItemDrag.startY);
      if (intent === 'cancel') { clearWorkItemDrag(); return; }
      if (intent === 'pending') return;
      startWorkItemDrag(workItemDrag.row!);
      if (!workItemDrag.active) return;
    }
    event.preventDefault();
    if (workItemDrag.preview) positionDragPreview(workItemDrag.preview, event.clientX, event.clientY, workItemDrag.offsetX, workItemDrag.offsetY);
    scrollDragEdge(event.clientY); updateWorkItemDragTarget();
  });
  app.addEventListener('pointermove', (event) => { if (!tradeSwipe.active || event.pointerId !== tradeSwipe.pointerId) return; const deltaX = event.clientX - tradeSwipe.startX; const deltaY = event.clientY - tradeSwipe.startY; if (!tradeSwipe.eligible) { if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) { clearTradeSwipe(); return; } if (deltaX > -8) return; tradeSwipe.eligible = true; tradeSwipe.root?.setPointerCapture(event.pointerId); } event.preventDefault(); tradeSwipe.offset = Math.max(-TRADE_DELETE_REVEAL_PX, Math.min(0, deltaX)); tradeSwipe.root?.style.setProperty('--trade-swipe-offset', `${tradeSwipe.offset}px`); });
  app.addEventListener('pointerup', async (event) => { if ((!tradeDrag.active && !tradeDrag.pending) || event.pointerId !== tradeDrag.pointerId) return; if (tradeDrag.pending) { clearTradeDrag(); return; } appState.suppressTradeSummaryClick = true; window.setTimeout(() => { appState.suppressTradeSummaryClick = false; }, 0); const dragged = tradeDrag.id; const kind = tradeDrag.kind; const slot = tradeDrag.activeDropSlotIndex; const original = [...tradeDrag.originalOrder]; if (dragged && kind && slot !== null) { const ids = original.filter((id) => id !== dragged); ids.splice(Math.max(0, Math.min(slot, ids.length)), 0, dragged); const changed = ids.length !== original.length || ids.some((id, index) => id !== original[index]); if (changed) { const old = entryList(kind).slice(); const apply = (order: string[], draft: boolean) => { const next = order.map((id) => old.find((item) => item.id === id)!).filter(Boolean); next.forEach((item, index) => { item.sortOrder = index; if (draft && kind === 'trade') item.status = 'draft'; }); (appState.daily.report as unknown as Record<string, OrderedEntry[]>)[ENTRY_COLLECTION[kind]] = next; }; appState.daily.update(() => apply(ids, true)); try { await appState.daily.flush(); } catch { apply(original, false); alert('排序儲存失敗，已恢復原順序。'); } } } clearTradeDrag(); await renderApp(); });
  window.addEventListener('pointerup', async (event) => {
    if ((!workItemDrag.active && !workItemDrag.pending) || event.pointerId !== workItemDrag.pointerId) return;
    if (workItemDrag.pending) { clearWorkItemDrag(); return; }
    workItemDrag.suppressClick = true; window.setTimeout(() => { workItemDrag.suppressClick = false; }, 0);
    const { tradeId, workItemId, activeDropSlotIndex: slot, contact } = workItemDrag;
    const original = [...workItemDrag.originalOrder];
    clearWorkItemDrag();
    if (!tradeId || !workItemId || slot === null || isReadOnlySite() || appState.workspaceSwitching) return;
    const from = original.indexOf(workItemId); const to = Math.max(0, Math.min(slot, original.length - 1));
    if (from < 0 || from === to) return;
    if (contact) {
      const editor = appState.contactEditor;
      if (editor?.id !== tradeId) return;
      const old = structuredClone(editor.value.items);
      const items = original.filter((id) => id !== workItemId); items.splice(to, 0, workItemId);
      editor.value.items = items.map((id, sortOrder) => ({ ...old.find((item) => item.id === id)!, sortOrder }));
      try { if (!persistEntryDraft()) throw new Error('儲存失敗'); } catch { editor.value.items = old; alert('工項排序儲存失敗，已恢復原順序。'); }
    } else await persistWorkItemReorder(tradeId, from, to);
    await renderApp();
  });
  window.addEventListener('pointerup', (event) => { if (!tradeSwipe.active || event.pointerId !== tradeSwipe.pointerId) return; const shouldDelete = tradeSwipe.offset <= -TRADE_DELETE_REVEAL_PX; const id = tradeSwipe.id; const kind = tradeSwipe.kind; const root = tradeSwipe.root; const draft = root?.dataset.swipeDraft; const suppressClick = tradeSwipe.eligible; clearTradeSwipe(!shouldDelete); if (suppressClick) { appState.suppressTradeSummaryClick = true; window.setTimeout(() => { appState.suppressTradeSummaryClick = false; }, 0); } if (shouldDelete && draft) { if (draft === 'material' ? discardMaterialEditor() : discardContactEditor()) void renderApp(); else root?.style.setProperty('--trade-swipe-offset', '0px'); return; } if (shouldDelete && id && kind) void deleteItemBySwipe(kind, id); });
  window.addEventListener('blur', () => { clearWorkItemDrag(); });
  window.addEventListener('pointercancel', () => { if (tradeDrag.active || tradeDrag.pending) { const wasActive = tradeDrag.active; clearTradeDrag(); if (wasActive) void renderApp(); } if (workItemDrag.active || workItemDrag.pending) { clearWorkItemDrag(); void renderApp(); } if (tradeSwipe.active) clearTradeSwipe(); });
}
