import type { TradeSection, WorkItem } from '../domain/daily';
import type { NamedMemory } from '../data/daily-repository';
import { normalizeName } from '../format/normalization';
import { splitWorkInput } from './input-workflow';

export function sameWorkNames(trade: TradeSection, value: string, exceptId?: string): string[] {
  const names = splitWorkInput(value, true).committed;
  const seen = new Set(trade.workItems.filter((work) => work.id !== exceptId).map((work) => normalizeName(work.taskTextSnapshot)));
  const duplicates = new Set<string>();
  for (const name of names) { const key = normalizeName(name); if (seen.has(key)) duplicates.add(name); seen.add(key); }
  return [...duplicates];
}
export function clearWorkItemDetails(work: WorkItem): void {
  work.startFloorRaw = ''; work.endFloorRaw = '';
  work.startFloorNormalized = null; work.endFloorNormalized = null;
  work.locationId = null; work.locationTextSnapshot = ''; work.note = '';
}

/** Recommendations hide added items; explicit typed duplicates remain available via commit. */
export function workSuggestions(trade: TradeSection, tasks: NamedMemory[], value: string, editing = false): NamedMemory[] {
  const added = new Set(trade.workItems.map((work) => normalizeName(work.taskTextSnapshot)));
  const choices = new Map<string, NamedMemory>();
  const ranked = tasks.slice().sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed')
    || b.usageCount - a.usageCount || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.id.localeCompare(b.id));
  for (const row of ranked) {
    const name = normalizeName(row.name);
    if (row.tradeTypeId === trade.tradeTypeId && name && name.includes(normalizeName(value))
      && (editing || !added.has(name)) && !choices.has(name)) choices.set(name, row);
  }
  return [...choices.values()].sort((a, b) => b.usageCount - a.usageCount
    || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.id.localeCompare(b.id)).slice(0, 6);
}

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const drafts = new Map<string, string>();
export function snapshotWorkDrafts(): Array<[string, string]> { return [...drafts]; }
export function restoreWorkDrafts(values: Array<[string, string]>): void { drafts.clear(); for (const [id, text] of values) drafts.set(id, text); }
export function consumeWorkDrafts(): Array<[string, string]> { const result = [...drafts]; drafts.clear(); return result; }
export function workInputView(trade: TradeSection): string {
  return `<div class="continuous-work" aria-label="施工工項，以頓號分隔"><span class="work-token work-token--composer"><input data-continuous-work="${trade.id}" value="${esc(drafts.get(trade.id) ?? '')}" aria-label="搜尋或輸入下一個工項" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="inline-results-${trade.id}" autocomplete="off" placeholder="搜尋或輸入工項"><span class="work-token__results" id="inline-results-${trade.id}" role="listbox" hidden></span><button type="button" class="work-commit" data-work-commit="${trade.id}">加入</button></span><span class="work-duplicate-notice" role="status" aria-live="polite" data-work-duplicate-notice hidden></span>${trade.workItems.map((work, index) => `<span class="work-token work-token--item" data-work="${work.id}" data-sortable-work>
    <span class="work-token__tools" hidden role="group" aria-label="工項操作"><button type="button" data-work-detail="location"><span>位置／樓層${work.startFloorRaw || work.locationTextSnapshot ? '・已填' : ''}</span></button><button type="button" data-work-detail="note"><span>備註${work.note ? '・已填' : ''}</span></button><button type="button" data-work-clear-details="${work.id}" aria-label="移除位置與備註"><span>移除位置與備註</span></button><button type="button" data-work-move="-1" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-work-move="1" ${index === trade.workItems.length - 1 ? 'disabled' : ''}>下移</button><button type="button" data-work-delete>刪除工項</button></span>
    <button type="button" class="work-gesture" data-work-gesture aria-expanded="false" aria-label="工項 ${index + 1}：點一下開選單，長按排序" title="點一下開選單・長按排序"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1" stroke-linecap="round"/></svg></button><input class="work-token__text" data-daily-field="taskTextSnapshot" data-inline-work="${work.id}" data-work-item-input="${work.id}" aria-label="工項 ${index + 1}" aria-autocomplete="list" role="combobox" aria-expanded="false" aria-controls="inline-results-${work.id}" autocomplete="off" placeholder="輸入工項" value="${esc(work.taskTextSnapshot)}">
    <span class="work-token__results" id="inline-results-${work.id}" role="listbox" hidden></span>
    <span class="work-token__detail" data-work-panel="location" hidden><strong>這個工項做在哪裡？</strong><span class="work-floor-fields"><label>起始樓層<input data-daily-field="startFloorRaw" value="${esc(work.startFloorRaw)}" placeholder="例：3F"></label><label>結束樓層<input data-daily-field="endFloorRaw" value="${esc(work.endFloorRaw)}" placeholder="選填"></label></span><label>位置<input data-daily-field="locationTextSnapshot" value="${esc(work.locationTextSnapshot)}" placeholder="例：東側"></label><button type="button" data-work-detail="close">完成，返回工項</button></span>
    <span class="work-token__detail" data-work-panel="note" hidden><label>有什麼需要交代？<textarea data-daily-field="note" placeholder="例：待監造確認後續作" rows="2">${esc(work.note)}</textarea></label><button type="button" data-work-detail="close">完成，返回工項</button></span>
    <span class="work-item-context" hidden>${esc([work.startFloorRaw, work.endFloorRaw ? `至 ${work.endFloorRaw}` : '', work.locationTextSnapshot, work.note ? '有備註' : ''].filter(Boolean).join(' · '))}${sameWorkNames(trade, work.taskTextSnapshot, work.id).length ? '<span class="work-same-name">同名工項，請確認位置</span>' : ''}</span><span class="work-separator" aria-hidden="true">、</span></span>`).join('')}
    ${trade.workItems.length ? '' : '<span class="work-empty">從上方加入工項，新增後會排列在這裡。</span>'}</div><p class="hint work-input-hint">整列左滑刪除；握把點一下開選單、長按排序。點文字可編輯。</p>`;
}

interface WorkInputActions {
  trade(id: string): TradeSection | undefined;
  tasks(): NamedMemory[];
  add(tradeId: string, text: string, taskId: string | null): void;
  edit(tradeId: string, workId: string, text: string, taskId: string | null): void;
  commit(): Promise<void>;
  render(): Promise<void>;
  error(error: unknown): void;
  draft(): void;
  remove(tradeId: string, workId: string, undoAddition: boolean): boolean;
  clearDetails(tradeId: string, workId: string): void;
}
export function bindWorkInput(root: HTMLElement, actions: WorkInputActions): void {
  const inputSelector = '[data-continuous-work], [data-inline-work]';
  let composing = false;
  let busy = false;
  const closeDetails = (token: HTMLElement) => {
    token.querySelectorAll<HTMLElement>('.work-token__detail,.work-token__results,.work-token__tools').forEach((el) => el.hidden = true);
    token.querySelectorAll<HTMLElement>('[aria-expanded]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
  };
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    const token = (event.target as HTMLElement).closest<HTMLElement>('.work-token');
    if (!token) return;
    event.preventDefault(); event.stopImmediatePropagation();
    token.querySelector<HTMLInputElement>(inputSelector)?.focus(); closeDetails(token);
  });
  const fit = (element: HTMLElement | null) => {
    if (!element) return;
    element.style.left = '0px';
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.min(0, window.innerWidth - 16 - rect.right)}px`;
  };
  const tradeFor = (input: HTMLElement) => input.closest<HTMLElement>('[data-trade]')?.dataset.trade;
  const suggestions = (input: HTMLInputElement) => {
    const id = tradeFor(input); const trade = id ? actions.trade(id) : undefined;
    const results = input.parentElement?.querySelector<HTMLElement>('.work-token__results');
    if (!results || !trade) return;
    const rows = workSuggestions(trade, actions.tasks(), input.value, Boolean(input.dataset.inlineWork));
    const duplicate = sameWorkNames(trade, input.value, input.dataset.inlineWork);
    const notice = input.closest('.continuous-work')?.querySelector<HTMLElement>('[data-work-duplicate-notice]');
    if (notice) { notice.hidden = !duplicate.length; notice.textContent = duplicate.length ? `已有相同工項「${duplicate.join('、')}」。確認後仍可加入。` : ''; }
    results.innerHTML = rows.map((row) => `<button type="button" role="option" data-work-suggestion="${row.id}">${esc(row.name)}</button>`).join('');
    results.hidden = !rows.length; input.setAttribute('aria-expanded', String(Boolean(rows.length)));
    fit(results); fit(input.parentElement?.querySelector<HTMLElement>('.work-token__tools') ?? null);
    if (input.dataset.inlineWork) input.style.width = '100%';
  };
  const commit = async (input: HTMLInputElement, tail: boolean, selected?: NamedMemory) => {
    if (composing || busy) return;
    const tradeId = tradeFor(input); if (!tradeId) return;
    const parsed = splitWorkInput(selected?.name ?? input.value, tail);
    if (!parsed.committed.length) return;
    busy = true;
    try {
      const workId = input.dataset.inlineWork;
      if (workId) {
        actions.edit(tradeId, workId, parsed.committed.shift()!, selected?.id ?? null);
      }
      for (const text of parsed.committed) {
      const memory = actions.tasks().find((row) => row.tradeTypeId === actions.trade(tradeId)?.tradeTypeId && normalizeName(row.name) === normalizeName(text));
        actions.add(tradeId, text, memory?.id ?? null);
      }
      drafts.set(tradeId, parsed.remainder);
      const container = input.closest<HTMLElement>('.continuous-work');
      const trade = actions.trade(tradeId)!;
      if (container) {
        const template = document.createElement('template'); template.innerHTML = workInputView(trade);
        for (const row of template.content.querySelectorAll<HTMLElement>('.work-token--item')) {
          if (!container.querySelector(`[data-work="${row.dataset.work}"]`)) container.append(row);
        }
        container.querySelector('.work-empty')?.remove();
        const itemRows = [...container.querySelectorAll<HTMLElement>('.work-token--item')];
        itemRows.forEach((row, index) => row.querySelectorAll<HTMLButtonElement>('[data-work-move]').forEach((button) => {
          button.disabled = Number(button.dataset.workMove) < 0 ? index === 0 : index === itemRows.length - 1;
        }));
        if (workId) input.value = trade.workItems.find((work) => work.id === workId)?.taskTextSnapshot ?? input.value;
        const newest = trade.workItems.at(-1);
        container.querySelector('.work-add-feedback')?.remove();
        if (!workId && newest) {
          const undo = document.createElement('button'); undo.type = 'button'; undo.dataset.workUndo = newest.id;
          undo.textContent = '撤銷'; const feedback = document.createElement('span'); feedback.className = 'work-add-feedback'; feedback.setAttribute('role', 'status'); const message = document.createElement('span'); message.textContent = `已加入「${newest.taskTextSnapshot}」`; feedback.append(message, undo); container.querySelector('.work-token--composer')?.insertAdjacentElement('afterend', feedback);
        }
      }
      actions.draft();
      const next = root.querySelector<HTMLInputElement>(`[data-continuous-work="${tradeId}"]`);
      if (next) { next.value = parsed.remainder; next.focus(); suggestions(next); }
      busy = false;
      await actions.commit();
    } catch (error) { actions.error(error); } finally { busy = false; }
  };
  root.addEventListener('compositionstart', (event) => { if ((event.target as HTMLElement).matches(inputSelector)) composing = true; });
  root.addEventListener('compositionend', (event) => { const input = event.target as HTMLInputElement; if (!input.matches(inputSelector)) return; composing = false; suggestions(input); if (input.value.includes('、')) { event.stopImmediatePropagation(); void commit(input, false); } });
  root.addEventListener('focusin', (event) => { const input = event.target as HTMLInputElement; if (input.matches(inputSelector)) suggestions(input); });
  root.addEventListener('input', (event) => { const input = event.target as HTMLInputElement; if (!input.matches(inputSelector)) return; if (input.dataset.continuousWork) drafts.set(input.dataset.continuousWork, input.value); if (composing || (event as InputEvent).isComposing) return; suggestions(input); if (input.value.includes('、')) { event.stopImmediatePropagation(); void commit(input, false); } });
  root.addEventListener('keydown', (event) => { const input = event.target as HTMLInputElement; if (!input.matches(inputSelector) || event.isComposing || composing) return;
    if (event.key === 'Enter' && event.keyCode !== 229) { event.preventDefault(); void commit(input, true); }
    if (event.key === 'Escape') { input.parentElement?.querySelectorAll<HTMLElement>('.work-token__results,.work-token__detail').forEach((el) => el.hidden = true); input.setAttribute('aria-expanded', 'false'); }
    if (event.key === 'ArrowDown') { const first = input.parentElement?.querySelector<HTMLButtonElement>('[data-work-suggestion]'); if (first) { event.preventDefault(); first.focus(); } }
  });
  root.addEventListener('focusout', (event) => { const target = event.target as HTMLElement; const token = target.closest<HTMLElement>('.work-token'); if (!token || (event.relatedTarget instanceof Node && token.contains(event.relatedTarget))) return;
    closeDetails(token);
  });
  root.addEventListener('click', (event) => {
    const clicked = event.target as HTMLElement;
    const selectedToken = clicked.closest<HTMLElement>('.work-token');
    root.querySelectorAll<HTMLElement>('.work-token--item').forEach((token) => { if (token !== selectedToken) closeDetails(token); });
    const grip = clicked.closest<HTMLButtonElement>('[data-work-gesture]');
    if (grip && selectedToken) {
      const menu = selectedToken.querySelector<HTMLElement>('.work-token__tools');
      const open = menu?.hidden;
      closeDetails(selectedToken);
      if (menu && open) {
        menu.hidden = false; menu.style.top = ''; menu.style.bottom = ''; fit(menu);
        if (menu.getBoundingClientRect().bottom > window.innerHeight - 88) { menu.style.top = 'auto'; menu.style.bottom = '100%'; }
        grip.setAttribute('aria-expanded', 'true'); menu.querySelector<HTMLButtonElement>('button')?.focus();
      }
      return;
    }
    const clear = clicked.closest<HTMLButtonElement>('[data-work-clear-details]');
    if (clear && selectedToken) {
      const tradeId = tradeFor(clear); const workId = clear.dataset.workClearDetails;
      if (!tradeId || !workId) return;
      actions.clearDetails(tradeId, workId);
      selectedToken.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.work-token__detail input,.work-token__detail textarea').forEach((input) => input.value = '');
      const location = selectedToken.querySelector('[data-work-detail="location"] span');
      const note = selectedToken.querySelector('[data-work-detail="note"] span');
      if (location) location.textContent = '位置／樓層'; if (note) note.textContent = '備註';
      closeDetails(selectedToken); selectedToken.querySelector<HTMLButtonElement>('[data-work-gesture]')?.focus();
      actions.draft(); void actions.render().then(() => {
        root.querySelector<HTMLElement>(`[data-work="${CSS.escape(workId)}"] [data-work-gesture]`)?.focus();
        return actions.commit();
      }).catch(actions.error); return;
    }
    const remove = (event.target as HTMLElement).closest<HTMLElement>('[data-work-remove],[data-work-undo]');
    if (remove) {
      const tradeId = tradeFor(remove); const workId = remove.dataset.workRemove ?? remove.dataset.workUndo;
      if (tradeId && workId) {
        if (!actions.remove(tradeId, workId, Boolean(remove.dataset.workUndo))) return;
        const container = remove.closest('.continuous-work');
        container?.querySelector(`[data-work="${workId}"]`)?.remove();
        container?.querySelector('.work-add-feedback')?.remove();
        container?.querySelector<HTMLInputElement>('[data-continuous-work]')?.focus();
        void actions.commit().catch(actions.error);
      }
      return;
    }
    const target = event.target as HTMLElement; const button = target.closest<HTMLButtonElement>('[data-work-suggestion],[data-work-detail],[data-work-commit]'); if (!button) return;
    const token = button.closest<HTMLElement>('.work-token'); const input = token?.querySelector<HTMLInputElement>(inputSelector); if (!token || !input) return;
    if (button.dataset.workCommit) { void commit(input, true); return; }
    if (button.dataset.workSuggestion) { const row = actions.tasks().find((row) => row.id === button.dataset.workSuggestion); if (row) void commit(input, true, row); return; }
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    closeDetails(token);
    if (button.dataset.workDetail === 'close') { input.focus(); closeDetails(token); return; }
    if (wasOpen) return;
    const panel = token.querySelector<HTMLElement>(`[data-work-panel="${button.dataset.workDetail}"]`);
    if (panel) { panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector<HTMLElement>('input,textarea,button')?.focus(); }
  });
}
