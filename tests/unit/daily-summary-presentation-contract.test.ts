// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('日報收合摘要高度契約', () => {
  const presentation = source('src/presentation.css');
  const daily = source('src/main.ts');
  const styles = source('src/styles.css');
  const dialog = source('src/daily/dialog.css');
  const dailyCss = source('src/daily/daily.css');

  it('以單一 60px token 固定收合摘要列高度', () => {
    expect(presentation).toContain('--summary-height: 60px');
    expect(presentation).toContain('.collapsed-summary { height: var(--summary-height); min-height: var(--summary-height); max-height: var(--summary-height); overflow: hidden; }');
  });

  it('將四類條目、填報資訊與日報預覽接到共同摘要列', () => {
    expect(daily.match(/collapsed-summary/g)).toHaveLength(7);
    expect(daily).toContain('type DailyEntrySummary');
    expect(daily).toContain('function dailyEntrySummary');
    expect(daily).toContain("kind: 'engineering'");
    expect(daily).toContain("kind: 'material'");
    expect(daily).toContain("kind: 'contact'");
    expect(daily).toContain("kind: 'special'");
    expect(styles).toContain('min-height: var(--summary-height)');
    expect(dialog).toContain('min-height: var(--summary-height)');
    expect(dialog).not.toContain('min-height: 58px');
    expect(dialog).not.toContain('min-height: 62px');
  });

  it('讓所有日報摘要使用相同的四欄資訊骨架', () => {
    expect(daily).toContain('summary__leading');
    expect(daily).toContain('summary__primary');
    expect(daily).toContain('summary__secondary');
    expect(daily).toContain('summary__status');
    expect(dailyCss).toContain('.daily-entry-summary');
    expect(dailyCss).toContain('.daily-entry-summary__primary');
    expect(dailyCss).toContain('.daily-entry-summary__secondary');
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
    expect(daily).toContain('aria-hidden="true">${tradeRowSummary(trade, false');
    expect(daily).toContain('function tradeDragPreview(id: string): string');
    expect(daily).toContain('class="daily-page trade-drag-preview__surface"');
    expect(daily).toContain("const summaryHeight = card.querySelector<HTMLElement>('.trade-row-summary')?.getBoundingClientRect().height ?? rect.height");
    expect(daily).toContain('preview.style.height = `${summaryHeight + 2}px`');
    expect(daily).toContain('preview.innerHTML = tradeDragPreview(id)');
    expect(daily).toContain('function positionTradeDragPreview(preview: HTMLElement, pointerX: number, pointerY: number): void');
    expect(daily).toContain('const maxTop = Math.max(edge, window.innerHeight - rect.height - edge)');
    expect(dailyCss).toContain('height: calc(var(--summary-height) + 2px)');
    expect(dailyCss).toContain('.daily-page .trade-card--drag-placeholder { height: 74px; }');
    expect(dailyCss).toContain('.trade-drag-preview { position: fixed; z-index: 1000; pointer-events: none; opacity: .88; box-shadow: 0 4px 12px rgb(24 33 38 / 16%); }');
    expect(dailyCss).toContain('.daily-page .trade-card--drag-placeholder');
  });

  it('將新增工項設為對齊輸入欄的列表尾端操作', () => {
    expect(daily).toContain('class="work-item-list"');
    expect(daily).toContain('data-work-item-input');
    expect(daily).toContain("if (action === 'add-work') {");
    expect(daily).toContain('focusWorkItemId');
    expect(daily).not.toContain('data-daily-action="move-work-item"');
    expect(daily).not.toContain('work-item__order-tools');
    expect(dailyCss).toContain('--work-item-stack-gap: var(--space-2)');
    expect(dailyCss).toContain('grid-template-columns: var(--work-item-leading-column) minmax(0, 1fr) var(--work-item-utility-column) var(--work-item-delete-column)');
    expect(dailyCss).toContain('.work-item-composer { position: relative;');
    expect(dailyCss).toContain('.work-item-composer > button { min-height: 44px;');
    expect(daily).toContain('data-daily-action="manage-material-connections"');
    expect(daily).toContain('class="daily-output__actions"');
    expect(dialog).toContain('.daily-output__actions { display: grid; gap: var(--space-2); }');
  });

  it('將施工工項改為輸入器加已加入清單', () => {
    expect(daily).toContain('data-work-item-composer');
    expect(daily).toContain('placeholder="輸入工項"');
    expect(daily).toContain('data-daily-action="add-work-item"');
    expect(daily).toContain('data-work-item-suggestions');
    expect(daily).not.toContain('class="work-item-add-row"');
    expect(daily).not.toContain('<label class="work-item__task">工項');
    expect(daily).toContain('aria-label="工項 ${index + 1}"');
    expect(daily).toContain('workItemComposerByTrade');
    expect(dailyCss).toContain('.work-item-composer');
    expect(dailyCss).toContain('@media (max-width: 360px)');
  });
});
