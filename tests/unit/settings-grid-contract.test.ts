// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../../src/styles.css');
const material = read('../../src/daily/material.css');
const rule = (selector: string) => { const start = css.indexOf(`
${selector} {`); expect(start, selector).toBeGreaterThanOrEqual(0); return css.slice(start, css.indexOf('}', start)); };

describe('設定頁格線契約', () => {
  it('列與外框容器左右內距為 0，文字落在頁面外距', () => {
    expect(rule('.settings-page .settings-row')).toContain('padding: var(--space-2) 0;');
    expect(rule('.settings-management-list__item')).toContain('padding: var(--space-3) 0;');
    expect(rule('.settings-work-area__toggle')).toContain('padding: var(--space-3) 0;');
    expect(rule('.settings-status')).toMatch(/padding: var\(--space-2\) 0;[^}]*border-inline: 0;/);
    expect(rule('.settings-management-panel > .form-card')).toContain('padding: var(--space-4) 0;');
    expect(css).toContain('.settings-page :is(.form-card, .manage, .backup, .memory-review__overview, .settings-debug-panel) { padding-inline: 0; border-inline: 0; }');
  });

  it('行內編輯表單內距 12px，頁首下方固定 space-4', () => {
    expect(rule('.settings-page .settings-edit-form')).toContain('padding: var(--space-3);');
    expect(css).toContain('.settings-page .top + * { margin-top: var(--space-4); }');
  });

  it('設定與日報進料編輯器共用同一組雙欄格線變數', () => {
    expect(css).toContain('--field-grid-columns: minmax(0, 1fr) minmax(0, 1fr);');
    expect(css).toContain('--field-grid-gap: var(--space-3) var(--space-2);');
    expect(rule('.settings-page .material-detail__grid')).toContain('grid-template-columns: var(--field-grid-columns); gap: var(--field-grid-gap);');
    expect(material).toContain('grid-template-columns: var(--field-grid-columns); gap: var(--field-grid-gap);');
  });
});
