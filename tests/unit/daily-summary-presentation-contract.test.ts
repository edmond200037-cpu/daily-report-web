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

  it('讓工程拖曳佔位與有邊框的收合卡同高', () => {
    expect(daily).toContain('trade-card--drag-placeholder');
    expect(dailyCss).toContain('height: calc(var(--summary-height) + 2px)');
  });

  it('讓工項名稱使用輸入框浮水印，並以對齊輸入區的完整新增列承接下一筆', () => {
    expect(daily).toContain('class="work-item__task" data-daily-field="taskTextSnapshot" aria-label="工項" placeholder="工項"');
    expect(daily).toContain('class="work-item-add-row"><button type="button" data-daily-action="add-work"');
    expect(dailyCss).toContain('.work-item-list { display: grid; gap: var(--work-item-stack-gap, var(--space-2)); }');
    expect(dailyCss).toContain('.work-item-add-row { margin: var(--work-item-stack-gap, var(--space-2)) 0 0 calc(32px + .35rem + var(--space-2)); }');
    expect(daily).toContain('data-daily-action="manage-material-connections"');
    expect(daily).toContain('class="daily-output__actions"');
    expect(dialog).toContain('.daily-output__actions { display: grid; gap: var(--space-2); }');
  });

  it('工項拖曳具有浮動預覽、原位佔位、插入提示與操作提醒', () => {
    expect(daily).toContain('class="work-item work-item--drag-placeholder"');
    expect(daily).toContain("placeholder.classList.add('work-item--drag-placeholder')");
    expect(daily).toContain('workItemDrag.placeholderMarkup = placeholder.outerHTML');
    expect(daily).toContain('class="work-item-drop-indicator"');
    expect(daily).toContain('class="work-item-drag-hint" role="status" aria-live="polite">拖曳到目標位置後放開');
    expect(daily).toContain("preview.className = 'work-item-drag-preview'");
    expect(dailyCss).toContain('.work-item-drag-preview > .work-item');
  });
});
