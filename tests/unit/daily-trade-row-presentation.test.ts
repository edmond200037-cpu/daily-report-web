// @ts-expect-error Vitest runs this source-contract test with Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('工程資料列呈現契約', () => {
  const daily = source('src/main.ts');
  const styles = source('src/daily/daily.css');
  const tokens = source('src/styles.css');

  it('以工程專用摘要列呈現工種、代表工項、廠商人數與狀態', () => {
    expect(daily).toContain('function tradeRowSummary');
    expect(daily).toContain('trade-row-summary__trade');
    expect(daily).toContain('trade-row-summary__task');
    expect(daily).toContain('trade-row-summary__vendor');
    expect(daily).toContain('trade-row-summary__status');
    expect(daily).toContain('const nonEmptyWorkItems = trade.workItems.slice().sort((a, b) => a.sortOrder - b.sortOrder).filter');
    expect(daily).toContain('另 ${nonEmptyWorkItems.length - 1} 項');
    expect(daily).toContain("trade.status === 'complete' ? '已完成' : '未完成'");
  });

  it('保留原有拖曳與展開按鈕的分離語意', () => {
    expect(daily).toContain('class="drag-handle" data-drag-trade=');
    expect(daily).toContain('data-daily-action="toggle-trade"');
    expect(daily).toContain('aria-controls="trade-content-');
    expect(daily).toContain("${expanded ? '收合' : '展開'}工程條目");
    expect(daily).toContain('title="${escapeHtml(taskSummary)}"');
  });

  it('桌面使用四欄，手機改為三層資料列，紅色僅存在未完成狀態欄', () => {
    expect(tokens).toContain('--daily-incomplete: #c14f46');
    expect(styles).toContain('.daily-page .trade-card { border-inline: 1px solid var(--daily-line);');
    expect(styles).toContain('.daily-page .trade-row-summary__toggle { display: grid; grid-column: 2; grid-row: 1; grid-template-columns: minmax(7rem, 1fr) minmax(8rem, 1.25fr) minmax(8rem, 1fr) auto;');
    expect(styles).toContain('.daily-page .trade-row-summary__status.entry-status--attention { border-color: var(--daily-incomplete); background: var(--daily-incomplete); color: #fff; }');
    expect(styles).toContain('@media (max-width: 639px)');
    expect(styles).toContain('.daily-page .trade-row-summary__trade { grid-column: 1; grid-row: 1; border-bottom: 1px solid var(--daily-line); }');
    expect(styles).toContain('.daily-page .trade-row-summary__status { grid-column: 2; grid-row: 1;');
  });
});
