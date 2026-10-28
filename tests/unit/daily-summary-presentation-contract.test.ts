// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('日報收合摘要高度契約', () => {
  const presentation = source('src/presentation.css');
  const daily = appSource();
  const styles = source('src/styles.css');
  const dialog = source('src/daily/dialog.css');
  const dailyCss = source('src/daily/daily.css');
  const inputCss = source('src/daily/input-workflow.css');

  it('以單一 60px token 固定收合摘要列高度', () => {
    expect(presentation).toContain('--summary-height: 60px');
    expect(presentation).toContain('.collapsed-summary { height: var(--summary-height); min-height: var(--summary-height); max-height: var(--summary-height); overflow: hidden; }');
  });

  it('將四類條目與日報預覽接到共同摘要列', () => {
    // Editors use a plain title and return action; collapsed records share the trade-row summary.
    expect(daily.match(/collapsed-summary/g)).toHaveLength(2);
    expect(daily).toContain('class="entry-editor-header"');
    expect(daily).toContain('function entryRowSummary(row: EntryRow)');
    expect(daily).not.toContain('dailyEntrySummary');
    expect(daily).toContain("return entryRowSummary({ meta: tradeName, primary: taskSummary");
    expect(daily).toContain('entryRowSummary({ meta: entry.materialTypeSnapshot');
    expect(daily).toContain('entryRowSummary({ meta: title, primary: summary, detail: vendor');
    expect(daily).toContain("entryRowSummary({ meta: '現場提醒'");
    expect(styles).toContain('min-height: var(--summary-height)');
    expect(dialog).toContain('min-height: var(--summary-height)');
    expect(dialog).not.toContain('min-height: 58px');
    expect(dialog).not.toContain('min-height: 62px');
  });

  it('讓所有日報摘要使用相同的四欄資訊骨架，四類資料列都不留握把欄', () => {
    expect(daily).toContain("${cell('trade', row.meta)}${cell('task', row.primary)}${cell('vendor', row.detail)}");
    expect(daily).toContain('trade-row-summary__status entry-status--${row.statusTone}');
    expect(daily).toContain('collapsed-summary trade-row-summary--plain">${control}</div>');
    expect(daily).not.toContain('row.handle');
    expect(daily).not.toContain('drag-handle" aria-hidden');
    expect(inputCss).toContain('.daily-page .trade-row-summary.trade-row-summary--plain { grid-template-columns:minmax(0,1fr); }');
    expect(inputCss).toContain('.daily-page .trade-row-summary__mobile-vendor:empty { display:none; }');
  });

  it('以共用字體 token 隔離按鈕預設字重與行高', () => {
    expect(dailyCss).toContain('--daily-summary-font-weight: 400');
    expect(dailyCss).toContain('--daily-summary-line-height: 1.5');
    expect(dailyCss).toContain('--daily-summary-primary-weight: 760');
    expect(dailyCss).toContain('--daily-summary-label-weight: 700');
    expect(dailyCss).toContain('.daily-entry-summary__toggle { font: inherit; font-weight: var(--daily-summary-font-weight); line-height: var(--daily-summary-line-height);');
    expect(dailyCss).toContain('.daily-entry-summary__primary, .entry-copy strong, .trade-card__title, .material-entry__name { font-weight: var(--daily-summary-primary-weight); }');
    expect(dailyCss).toContain('.daily-entry-summary__secondary, .entry-copy > span, .trade-card__details, .material-entry__details { color: var(--ink-soft); font-size: .8125rem; font-weight: var(--daily-summary-font-weight); line-height: var(--daily-summary-line-height); }');
  });

  it('讓工程拖曳佔位與預覽完整沿用收合工程列骨架', () => {
    expect(daily).toContain('trade-card--drag-placeholder');
    expect(daily).toContain('aria-hidden="true">${tradeRowSummary(trade, false, false)}');
    expect(daily).toContain('function entryDragPreview(root: HTMLElement): HTMLElement');
    expect(daily).toContain("surface.className = 'daily-page trade-drag-preview__surface'");
    expect(daily).toContain("removeAttribute('id')");
    expect(daily).toContain("const summaryHeight = card.querySelector<HTMLElement>('.trade-row-summary')?.getBoundingClientRect().height ?? rect.height");
    expect(daily).toContain('preview.style.height = `${summaryHeight + 2}px`');
    expect(daily).toContain('preview.append(entryDragPreview(card))');
    expect(daily).toContain('function positionTradeDragPreview(preview: HTMLElement, pointerX: number, pointerY: number): void');
    expect(daily).toContain('const maxTop = Math.max(edge, window.innerHeight - rect.height - edge)');
    expect(dailyCss).toContain('height: calc(var(--summary-height) + 2px)');
    expect(dailyCss).toContain('.daily-page .trade-card--drag-placeholder { height: 74px; }');
    expect(dailyCss).toContain('.trade-drag-preview { position: fixed; z-index: 1000; pointer-events: none; opacity: .88; box-shadow: 0 4px 12px rgb(24 33 38 / 16%); }');
    expect(dailyCss).toContain('.daily-page .trade-card--drag-placeholder');
  });

  it('四類資料列改為整列長按 400ms 排序，且不與點擊、捲動、左滑刪除衝突', () => {
    expect(daily).not.toContain('[data-drag-trade]');
    for (const kind of ['trade', 'material', 'contact', 'special']) expect(daily).toContain(`sortableAttrs('${kind}'`);
    expect(daily).toContain('data-sortable-entry=\"${kind}\" data-entry-id=');
    expect(daily).toContain(".closest<HTMLElement>('.trade-row-summary__toggle')");
    expect(daily).toContain("toggle.getAttribute('aria-expanded') !== 'false'");
    expect(daily).toContain('isReadOnlySite()');
    expect(daily).toContain('}, 400);');
    expect(daily).toContain('if (moved >= 8) clearTradeDrag(); return;');
    expect(daily).toContain('if (Math.abs(dy) <= Math.abs(dx)) { clearTradeDrag(); return; }');
    expect(daily).toContain('navigator.vibrate?.(10)');
    expect(daily).toContain('clearTradeSwipe(); navigator.vibrate');
    expect(daily).toContain("document.addEventListener('touchmove', guardTouchScroll, { passive: false })");
    expect(daily).toContain('if (tradeDrag.active && event.cancelable) event.preventDefault()');
    expect(dailyCss).toContain('-webkit-touch-callout: none; user-select: none;');
    expect(dailyCss).toContain('.swipe-item, .trade-swipe { position: relative; overflow: hidden; border-radius: var(--radius-md); touch-action: pan-y; }');
  });

  it('排序後重排對應集合、重寫 sortOrder，只有工程列退回草稿，失敗時還原', () => {
    expect(daily).toContain("trade: 'tradeSections', material: 'standaloneMaterialEntries', contact: 'contacts', special: 'specialItems'");
    expect(daily).toContain("item.sortOrder = index; if (draft && kind === 'trade') item.status = 'draft';");
    expect(daily).toContain("apply(original, false); alert('排序儲存失敗，已恢復原順序。')");
    expect(daily).toContain("entryDropIndicator('material'");
    expect(daily).toContain("entryDropIndicator('contact'");
    expect(daily).toContain("entryDropIndicator('special'");
    expect(daily).toContain("sortable = entry.id.startsWith('draft:') || placeholder ? '' : sortableAttrs('material', entry.id)");
  });

  it('以獨立工項輸入元件組成施工紀錄，保留進料與預覽入口', () => {
    expect(daily).toContain('workInputView(trade)');
    expect(daily).toContain('data-daily-action="manage-material-connections"');
    expect(daily).toContain('class="daily-output__actions"');
  });
  it('新工項輸入由可獨立驗證的連續編輯器負責', () => {
    expect(daily).toContain('bindWorkInput(app');
    expect(daily).toContain("from '../work-input'");
  });});
