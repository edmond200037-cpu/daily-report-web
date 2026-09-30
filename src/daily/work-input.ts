import type { TradeSection } from '../domain/daily';
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

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const drafts = new Map<string, string>();
export function consumeWorkDrafts(): Array<[string, string]> { const result = [...drafts]; drafts.clear(); return result; }
export function workInputView(trade: TradeSection): string {
  return `<div class="continuous-work" aria-label="施工工項，以頓號分隔"><span class="work-token work-token--composer"><input data-continuous-work="${trade.id}" value="${esc(drafts.get(trade.id) ?? '')}" aria-label="搜尋或輸入下一個工項" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="inline-results-${trade.id}" autocomplete="off" placeholder="搜尋工項，可用、一次加入多項"><span class="work-token__results" id="inline-results-${trade.id}" role="listbox" hidden></span><button type="button" class="work-commit" data-work-commit="${trade.id}">加入</button></span><span class="work-duplicate-notice" role="status" aria-live="polite" data-work-duplicate-notice hidden></span>${trade.workItems.map((work, index) => `<span class="work-token work-token--item" data-work="${work.id}" data-sortable-work>
    <span class="work-token__tools" aria-label="工項附加資料"><button type="button" data-work-detail="location">位置／樓層${work.startFloorRaw || work.locationTextSnapshot ? '・已填' : ''}</button><button type="button" data-work-detail="note">備註${work.note ? '・已填' : ''}</button><button type="button" data-work-detail="more" aria-label="排序或刪除工項">更多</button></span>
    <button type="button" class="work-gesture" data-work-gesture aria-label="工項 ${index + 1}：長按上下排序，左滑刪除" title="長按排序・左滑刪除"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1" stroke-linecap="round"/></svg></button><input class="work-token__text" data-daily-field="taskTextSnapshot" data-inline-work="${work.id}" data-work-item-input="${work.id}" aria-label="工項 ${index + 1}" aria-autocomplete="list" role="combobox" aria-expanded="false" aria-controls="inline-results-${work.id}" autocomplete="off" placeholder="輸入工項" value="${esc(work.taskTextSnapshot)}">
    <span class="work-token__results" id="inline-results-${work.id}" role="listbox" hidden></span>
    <span class="work-token__detail" data-work-panel="location" hidden><strong>這個工項做在哪裡？</strong><span class="work-floor-fields"><label>起始樓層<input data-daily-field="startFloorRaw" value="${esc(work.startFloorRaw)}" placeholder="例：3F"></label><label>結束樓層<input data-daily-field="endFloorRaw" value="${esc(work.endFloorRaw)}" placeholder="選填"></label></span><label>位置<input data-daily-field="locationTextSnapshot" value="${esc(work.locationTextSnapshot)}" placeholder="例：東側"></label><button type="button" data-work-detail="close">完成，返回工項</button></span>
    <span class="work-token__detail" data-work-panel="note" hidden><label>有什麼需要交代？<textarea data-daily-field="note" placeholder="例：待監造確認後續作" rows="2">${esc(work.note)}</textarea></label><button type="button" data-work-detail="close">完成，返回工項</button></span>
    <span class="work-token__detail" data-work-panel="more" hidden><button type="button" data-work-move="-1"${index === 0 ? ' disabled' : ''}>向前移</button><button type="button" data-work-move="1"${index === trade.workItems.length - 1 ? ' disabled' : ''}>向後移</button><button type="button" data-daily-action="delete-work-item" data-trade-id="${trade.id}" data-work-item-id="${work.id}">刪除此工項</button></span>
    <span class="work-item-context">${esc([work.startFloorRaw, work.endFloorRaw ? `至 ${work.endFloorRaw}` : '', work.locationTextSnapshot, work.note ? '有備註' : ''].filter(Boolean).join(' · '))}${sameWorkNames(trade, work.taskTextSnapshot, work.id).length ? '<span class="work-same-name">同名工項，請確認位置</span>' : ''}</span><span class="work-separator" aria-hidden="true">、</span></span>`).join('')}
    ${trade.workItems.length ? '' : '<span class="work-empty">從上方加入工項，新增後會排列在這裡。</span>'}</div><p class="hint work-input-hint">左側握把：長按上下排序，左滑刪除。點文字可編輯。</p>`;
}

interface WorkInputActions {
  trade(id: string): TradeSection | undefined;
  tasks(): NamedMemory[];
  add(tradeId: string, text: string, taskId: string | null): void;
  edit(tradeId: string, workId: string, text: string, taskId: string | null): void;
  move(tradeId: string, workId: string, offset: number): void;
  commit(): Promise<void>;
  render(): Promise<void>;
  error(error: unknown): void;
}
export function bindWorkInput(root: HTMLElement, actions: WorkInputActions): void {
  const inputSelector = '[data-continuous-work], [data-inline-work]';
  let composing = false;
  let busy = false;
  const closeDetails = (token: HTMLElement) => {
    token.querySelectorAll<HTMLElement>('.work-token__detail,.work-token__results').forEach((el) => el.hidden = true);
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
  const match = (trade: TradeSection, value: string) => actions.tasks().filter((row) => row.tradeTypeId === trade.tradeTypeId && row.normalizedName.includes(normalizeName(value))).sort((a, b) => b.usageCount - a.usageCount).slice(0, 6);
  const suggestions = (input: HTMLInputElement) => {
    const id = tradeFor(input); const trade = id ? actions.trade(id) : undefined;
    const results = input.parentElement?.querySelector<HTMLElement>('.work-token__results');
    if (!results || !trade) return;
    const rows = match(trade, input.value);
    const duplicate = sameWorkNames(trade, input.value, input.dataset.inlineWork);
    const notice = input.closest('.continuous-work')?.querySelector<HTMLElement>('[data-work-duplicate-notice]');
    if (notice) { notice.hidden = !duplicate.length; notice.textContent = duplicate.length ? `已有相同工項「${duplicate.join('、')}」。若施作位置不同，可加入後補填樓層／位置。` : ''; }
    results.innerHTML = rows.map((row) => `<button type="button" role="option" data-work-suggestion="${row.id}">${esc(row.name)}${row.status === 'candidate' ? '<small>待審核</small>' : ''}</button>`).join('');
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
        const memory = actions.tasks().find((row) => row.tradeTypeId === actions.trade(tradeId)?.tradeTypeId && row.normalizedName === normalizeName(text));
        actions.add(tradeId, text, memory?.id ?? null);
      }
      drafts.set(tradeId, parsed.remainder);
      input.readOnly = true;
      await actions.render();
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
    if (event.key === 'Enter') { event.preventDefault(); void commit(input, true); }
    if (event.key === 'Escape') { input.parentElement?.querySelectorAll<HTMLElement>('.work-token__results,.work-token__detail').forEach((el) => el.hidden = true); input.setAttribute('aria-expanded', 'false'); }
    if (event.key === 'ArrowDown') { const first = input.parentElement?.querySelector<HTMLButtonElement>('[data-work-suggestion]'); if (first) { event.preventDefault(); first.focus(); } }
  });
  root.addEventListener('focusout', (event) => { const target = event.target as HTMLElement; const token = target.closest<HTMLElement>('.work-token'); if (!token || (event.relatedTarget instanceof Node && token.contains(event.relatedTarget))) return;
    closeDetails(token);
  });
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement; const button = target.closest<HTMLButtonElement>('[data-work-suggestion],[data-work-detail],[data-work-commit],[data-work-move]'); if (!button) return;
    const token = button.closest<HTMLElement>('.work-token'); const input = token?.querySelector<HTMLInputElement>(inputSelector); if (!token || !input) return;
    if (button.dataset.workCommit) { void commit(input, true); return; }
    if (button.dataset.workMove && input.dataset.inlineWork) {
      const tradeId = tradeFor(input); if (!tradeId) return;
      actions.move(tradeId, input.dataset.inlineWork, Number(button.dataset.workMove));
      void actions.commit().then(actions.render).catch(actions.error); return;
    }
    if (button.dataset.workSuggestion) { const row = actions.tasks().find((row) => row.id === button.dataset.workSuggestion); if (row) void commit(input, true, row); return; }
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    closeDetails(token);
    if (button.dataset.workDetail === 'close') { input.focus(); closeDetails(token); return; }
    if (wasOpen) return;
    const panel = token.querySelector<HTMLElement>(`[data-work-panel="${button.dataset.workDetail}"]`);
    if (panel) { panel.hidden = false; button.setAttribute('aria-expanded', 'true'); panel.querySelector<HTMLElement>('input,textarea,button')?.focus(); }
  });
}
