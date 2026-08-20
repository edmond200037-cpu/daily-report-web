// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const dailyCss = readFileSync(new URL('../../src/daily/daily.css', import.meta.url), 'utf8');

// These are intentional source-level guardrails: CSS tokens have no runtime export,
// so a visual-only refactor must explicitly update this contract alongside the design spec.
describe('日報紙本表單基礎 tokens', () => {
  it('定義日報限定的紙面、欄線、文字與施工橘 tokens', () => {
    expect(styles).toContain('--daily-paper: #f6f3ec');
    expect(styles).toContain('--daily-paper-raised: #fcfaf5');
    expect(styles).toContain('--daily-ink: #2b2925');
    expect(styles).toContain('--daily-line: #d7d0c4');
    expect(styles).toContain('--daily-orange: #b84e16');
    expect(styles).toContain('--daily-orange-strong: #8f380e');
  });

  it('將日報文字層級與觸控尺寸集中為可重用 tokens', () => {
    expect(styles).toContain('--daily-title-size: 1.125rem');
    expect(styles).toContain('--daily-body-size: .9375rem');
    expect(styles).toContain('--daily-meta-size: .8125rem');
    expect(styles).toContain('--daily-touch-target: 44px');
  });

  it('只在日報範圍套用紙面與欄線語言', () => {
    expect(dailyCss).toContain('.daily-page { background: var(--daily-paper);');
    expect(dailyCss).toContain('.daily-page .daily-entry, .daily-page .compact-entry {');
    expect(dailyCss).toContain('border-color: var(--daily-line);');
    expect(dailyCss).toContain('.daily-page .daily-section__header h2, .daily-page .work-section__header h2 {');
  });

  it('讓日報表單與主要觸控控制至少達 44px', () => {
    expect(dailyCss).toContain('.daily-page input, .daily-page select, .daily-page textarea {');
    expect(dailyCss).toContain('min-height: var(--daily-touch-target);');
    expect(dailyCss).toContain('.daily-page .work-item__drag-handle');
    expect(dailyCss).toContain('.daily-page .work-item__desktop-tools button');
    expect(dailyCss).toContain('.daily-page .contact-task__handle, .daily-page .contact-suggestions__option { min-height: var(--daily-touch-target); }');
  });

  it('把正文 token 實際套用到日報資料內容', () => {
    expect(dailyCss).toContain('.daily-page .daily-entry-summary__primary, .daily-page .entry-copy strong { font-size: var(--daily-body-size); }');
  });

  it('主操作按鈕覆蓋日報通用按鈕文字色，維持橘底白字對比', () => {
    expect(dailyCss).toContain('.daily-page button.primary { border-color: var(--daily-orange); background: var(--daily-orange); color: #fff; }');
    expect(dailyCss).toContain('.daily-page button.primary:hover { border-color: var(--daily-orange-strong); background: var(--daily-orange-strong); color: #fff; }');
  });
});
