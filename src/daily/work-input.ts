import type { TradeSection } from '../domain/daily';
import type { NamedMemory } from '../data/daily-repository';
import { normalizeName } from '../format/normalization';
import { splitWorkInput } from './input-workflow';

const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const drafts = new Map<string, string>();
export function consumeWorkDrafts(): Array<[string, string]> { const result = [...drafts]; drafts.clear(); return result; }
export function workInputView(trade: TradeSection): string {
  return `<div class="continuous-work" aria-label="施工工項，以頓號分隔">${trade.workItems.map((work, index) => `<span class="work-token" data-work="${work.id}" data-sortable-work>
    <span class="work-token__tools" aria-label="工項附加資料"><button type="button" data-work-detail="location">位置／樓層${work.startFloorRaw || work.locationTextSnapshot ? '・已填' : ''}</button><button type="button" data-work-detail="note">備註${work.note ? '・已填' : ''}</button><button type="button" data-work-detail="more" aria-label="排序或刪除工項">更多</button></span>
    <input class="work-token__text" data-daily-field="taskTextSnapshot" data-inline-work="${work.id}" data-work-item-input="${work.id}" aria-label="工項 ${index + 1}" aria-autocomplete="list" role="combobox" aria-expanded="false" aria-controls="inline-results-${work.id}" autocomplete="off" placeholder="輸入工項" value="${esc(work.taskTextSnapshot)}" style="width:${Math.max(6, [...work.taskTextSnapshot].length * 1.8 + 2)}ch">
    <span class="work-token__results" id="inline-results-${work.id}" role="listbox" hidden></span>
    <span class="work-token__detail" data-work-panel="location" hidden><label>起始樓層<input data-daily-field="startFloorRaw" value="${esc(work.startFloorRaw)}" placeholder="例：3F"></label><label>結束樓層<input data-daily-field="endFloorRaw" value="${esc(work.endFloorRaw)}" placeholder="選填"></label><label>位置<input data-daily-field="locationTextSnapshot" value="${esc(work.locationTextSnapshot)}" placeholder="例：東側"></label><button type="button" data-work-detail="close">返回工項</button></span>
    <span class="work-token__detail" data-work-panel="note" hidden><label>備註<textarea data-daily-field="note" rows="2">${esc(work.note)}</textarea></label><button type="button" data-work-detail="close">返回工項</button></span>
    <span class="work-token__detail" data-work-panel="more" hidden><button type="button" data-work-move="-1"${index === 0 ? ' disabled' : ''}>向前移</button><button type="button" data-work-move="1"${index === trade.workItems.length - 1 ? ' disabled' : ''}>向後移</button><button type="button" data-daily-action="delete-work-item" data-trade-id="${trade.id}" data-work-item-id="${work.id}">刪除此工項</button></span>
    <span class="work-separator" aria-hidden="true">、</span></span>`).join('')}
    <span class="work-token work-token--composer"><input data-continuous-work="${trade.id}" value="${esc(drafts.get(trade.id) ?? '')}" aria-label="搜尋或輸入下一個工項" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="inline-results-${trade.id}" autocomplete="off" placeholder="搜尋或輸入工項，以、分隔"><span class="work-token__results" id="inline-results-${trade.id}" role="listbox" hidden></span><button type="button" class="work-commit" data-work-commit="${trade.id}">加入</button></span>
    </div><p class="hint">以「、」或 Enter 加入下一項；點工項可改文字，並設定位置、樓層與備註。</p>`;
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
    results.innerHTML = rows.map((row) => `<button type="button" role="option" data-work-suggestion="${row.id}">${esc(row.name)}${row.status === 'candidate' ? '<small>待審核</small>' : ''}</button>`).join('');
    results.hidden = !rows.length; input.setAttribute('aria-expanded', String(Boolean(rows.length)));
    fit(results); fit(input.parentElement?.querySelector<HTMLElement>('.work-token__tools') ?? null);
    if (input.dataset.inlineWork) input.style.width = `${Math.max(6, [...input.value].length * 1.8 + 2)}ch`;
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
    token.querySelectorAll<HTMLElement>('.work-token__results,.work-token__detail').forEach((el) => el.hidden = true);
    token.querySelector('input')?.setAttribute('aria-expanded', 'false');
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
    token.querySelectorAll<HTMLElement>('.work-token__detail,.work-token__results').forEach((el) => el.hidden = true);
    if (button.dataset.workDetail === 'close') { input.focus(); return; }
    const panel = token.querySelector<HTMLElement>(`[data-work-panel="${button.dataset.workDetail}"]`);
    if (panel) { panel.hidden = false; fit(panel); panel.querySelector<HTMLElement>('input,textarea')?.focus(); }
  });
}
