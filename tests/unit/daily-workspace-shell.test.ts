import { readFileSync } from 'node:fs';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';

const main = appSource();
const dailyCss = readFileSync(new URL('../../src/daily/daily.css', import.meta.url), 'utf8');

describe('日報共用工作區骨架', () => {
  it('以日報專用頁首呈現儲存狀態，不沿用英文眉標', () => {
    expect(main).toContain('function dailyHeader(saveLabel: string): string');
    expect(main).toContain('class="daily-page__save-status"');
    expect(main).toContain("${dailyHeader(saveLabel)}");
    expect(main).not.toContain("${moduleHeader('施工日報', saveLabel");
  });

  it('主要模組頁籤保留，四類日報內容連續呈現', () => {
    expect(main).toContain('class="module-page__tabs"');
    expect(main).toContain('<section class="daily-workspace" aria-label="日報內容">${dailySections()}');
    expect(main).not.toContain('role="tabpanel"');
  });

  it('工地與日期只在頁首面板展開時渲染', () => {
    expect(main).toContain("if (!appState.dailyBasicsExpanded) return '';");
    expect(main).toContain('id="daily-basics-panel"');
    expect(dailyCss).toContain('.daily-basics-panel {');
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
