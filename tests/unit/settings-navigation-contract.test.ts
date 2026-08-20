// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');

describe('設定端直達導覽契約', () => {
  it('舊設定網址直接導向日報主檔，不再渲染設定中心', () => {
    expect(main).toContain("if (location.hash === '#settings') { history.replaceState(null, '', '#settings/daily'); return renderApp(); }");
    expect(main).not.toContain('function settingsHubView()');
  });

  it('設定頁保留來源返回操作與四區 2×2 導覽', () => {
    expect(main).toContain('let settingsReturnModule: SettingsReturnModule = \'daily\';');
    expect(main).toContain('function settingsReturnLink(): string');
    expect(main).toContain('class="settings-context-tabs"');
    expect(css).toContain('.settings-context-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('.settings-context-tabs a.active { border-color: var(--accent); background: var(--surface-raised); color: var(--ink); box-shadow: inset 0 -3px 0 var(--accent); }');
  });

  it('四個設定領域共用紙質淡黃色工作台，不影響填報模組容器', () => {
    expect(css).toContain('.settings-page { background: var(--daily-paper); color: var(--daily-ink); }');
    expect(css).toContain('.settings-page .settings-context-tabs a { border-color: var(--daily-line-strong); background: var(--daily-paper-raised); color: var(--daily-ink); }');
    expect(css).toContain('.settings-page .settings-work-area { border-color: var(--daily-line-strong); background: var(--daily-paper-raised); }');
  });

  it('日報主檔以兩個暫態工作面與直列管理清單呈現既有內容', () => {
    expect(main).toContain("type DailySettingsArea = 'foundation' | 'materials';");
    expect(main).toContain("const dailySettingsAreas: Array<{ id: DailySettingsArea;");
    expect(main).toContain('data-settings-area="${area.id}"');
    expect(main).toContain('class="settings-management-list"');
    expect(main).toContain('class="settings-management-panel"');
    expect(main).not.toContain('class="settings-section-grid"');
  });

  it('備份與偵錯只由資料與系統頁承接', () => {
    expect(main).toContain('function dataSystemView(): string');
    expect(main).toContain('data-data-system-section="backup"');
    expect(main).toContain('data-data-system-section="debug"');
    expect(main).not.toContain("['backup', '備份與還原']");
    expect(main).not.toContain("['debug', '偵錯資訊']");
  });

  it('水位設定使用設定端容器，水位填報才保留模組紙色容器', () => {
    expect(main).toContain("const shellClass = settings ? 'app-shell settings-page water-settings-shell' : 'app-shell module-page water-page-shell';");
    expect(main).toContain("const header = settings ? settingsHeader('WATER SETTINGS', '水位設定')");
    expect(main).toContain('<main class="${shellClass}">');
  });
});
