// @ts-expect-error Vitest runs this source-contract test with Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('工程資料列呈現契約', () => {
  const daily = source('src/main.ts');
  const styles = source('src/daily/daily.css');

  it('以工程專用摘要列呈現位置、工項、廠商人數與狀態', () => {
    expect(daily).toContain('function tradeRowSummary');
    expect(daily).toContain('trade-row-summary__location');
    expect(daily).toContain('trade-row-summary__task');
    expect(daily).toContain('trade-row-summary__vendor');
    expect(daily).toContain('trade-row-summary__status');
    expect(daily).toContain('function formatWorkLocation');
  });

  it('保留原有拖曳與展開按鈕的分離語意', () => {
    expect(daily).toContain('class="drag-handle" data-drag-trade=');
    expect(daily).toContain('data-daily-action="toggle-trade"');
    expect(daily).toContain('aria-controls="trade-content-');
    expect(daily).toContain("${expanded ? '收合' : '展開'}工程條目");
    expect(daily).toContain('title="${escapeHtml(task)}"');
  });

  it('桌面使用四欄，手機改為三層資料列且狀態不再是膠囊', () => {
    expect(styles).toContain('.daily-page .trade-row-summary__toggle { display: grid; grid-column: 2; grid-row: 1; grid-template-columns: minmax(7rem, 1fr) minmax(8rem, 1.25fr) minmax(8rem, 1fr) auto;');
    expect(styles).toContain('.daily-page .trade-row-summary__status { display: flex; align-items: center; align-self: stretch; border: 0; border-left: 2px solid currentColor; border-radius: 0; background: transparent;');
    expect(styles).toContain('@media (max-width: 639px)');
    expect(styles).toContain('.daily-page .trade-row-summary__toggle { grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: repeat(3, minmax(0, auto)); }');
  });
});
