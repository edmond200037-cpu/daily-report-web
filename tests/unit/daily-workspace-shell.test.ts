// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const dailyCss = readFileSync(new URL('../../src/daily/daily.css', import.meta.url), 'utf8');

describe('日報共用工作區骨架', () => {
  it('以日報專用頁首呈現儲存狀態，不沿用英文眉標', () => {
    expect(main).toContain('function dailyHeader(saveLabel: string): string');
    expect(main).toContain('class="daily-page__save-status"');
    expect(main).toContain("${dailyHeader(saveLabel)}");
    expect(main).not.toContain("${moduleHeader('施工日報', saveLabel");
  });

  it('把主要功能頁籤與日報分類包在明確的工作區語意中', () => {
    expect(main).toContain('class="module-page__tabs"');
    expect(main).toContain('<section class="daily-workspace" aria-label="日報內容">');
    expect(main).toContain('${dailyTabs()}${activeTabContent()}</section>');
  });

  it('基本資料保留既有展開與欄位行為，但採日報專用欄線區段', () => {
    expect(main).toContain('class="basics daily-basics basics--${dailyBasicsExpanded ? \'expanded\' : \'collapsed\'}"');
    expect(dailyCss).toContain('.daily-page .daily-basics {');
    expect(dailyCss).toContain('border-inline: 0;');
    expect(dailyCss).toContain('border-radius: 0;');
  });

  it('日報與水位共用模組頁首與主要頁籤骨架，保留各自作業色', () => {
    expect(dailyCss).toContain('.daily-page__header');
    expect(dailyCss).toContain('.daily-page .module-page__tabs');
    expect(main).toContain('class="app-shell module-page daily-page"');
    expect(main).toContain("'app-shell module-page water-page-shell'");
    expect(main).toContain("moduleHeader('水位變化', '本機量測資料'");
    expect(main).toContain("function waterShell(settings: boolean)");
  });
});
