// @ts-expect-error Vitest runs this source-contract test with Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('工程資料列呈現契約', () => {
  const daily = source('src/main.ts');
  const styles = source('src/daily/daily.css');
  const presentation = source('src/presentation.css');
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

  it('輔助編輯器可明確收合，且工項輸入欄與上方搜尋欄使用同一內容欄', () => {
    expect(daily).toContain('data-daily-action="close-work-aux"');
    expect(daily).toContain('class="work-item__actions"');
    expect(daily).toContain('const closeEditor =');
    expect(daily).toContain("if (action === 'close-work-aux')");
    expect(styles).toContain('.work-item__main-row { display: grid; grid-template-columns: var(--work-item-leading-column) minmax(0, 1fr) var(--work-item-utility-column);');
    expect(styles).toContain('.work-item__actions { position: relative; grid-column: 3;');
    expect(styles).toContain('--work-item-utility-column: 4.5rem');
  });

  it('搜尋建議只在輸入非空文字時顯示，加入後清空即可收合建議', () => {
    expect(daily).toContain('active && trade.tradeTypeId && composer.query.trim() ?');
    expect(daily).toContain('composer.query = \'\'; composer.taskId = null;');
  });

  it('所有尺寸共用單一工項操作入口，選單包含位置、備註與刪除', () => {
    expect(daily).toContain('aria-label="工項操作"');
    expect(daily).toContain('>⋯</button>');
    expect(daily).toContain('>刪除工項</button>');
    expect(daily).not.toContain('work-item__desktop-tools');
    expect(daily).not.toContain('work-item__mobile-tools');
  });

  it('使用與聯絡事項一致的外框卡片；桌面使用四欄，手機改為兩層資料列，淡紅提示僅存在未完成狀態欄', () => {
    expect(tokens).toContain('--daily-incomplete-bg: #f5deda');
    expect(tokens).toContain('--daily-incomplete-ink: #7a302b');
    expect(tokens).toContain('--daily-incomplete-border: #d7a29b');
    expect(styles).toContain('.daily-page .trade-card { background: var(--daily-paper-raised); }');
    expect(presentation).toContain('.daily-entry, .compact-entry { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-md);');
    expect(styles).toContain('.daily-page .trade-row-summary__toggle { display: grid; grid-column: 2; grid-row: 1; grid-template-columns: minmax(7rem, 1fr) minmax(8rem, 1.25fr) minmax(8rem, 1fr) auto;');
    expect(styles).toContain('.daily-page .trade-row-summary__status.entry-status--attention { border-color: transparent; background: var(--daily-incomplete-bg); box-shadow: inset 0 0 0 1px var(--daily-incomplete-border); color: var(--daily-incomplete-ink); }');
    expect(styles).toContain('@media (max-width: 639px)');
    expect(styles).toContain('.daily-page .trade-row-summary { height: 72px; min-height: 72px; max-height: 72px; }');
    expect(daily).toContain('trade-row-summary__mobile-meta');
    expect(styles).toContain('.daily-page .trade-row-summary__mobile-meta { display: flex; grid-column: 1; grid-row: 1; align-items: center; min-width: 0;');
    expect(styles).toContain('.daily-page .trade-row-summary__status { grid-column: 2; grid-row: 1;');
  });
});
