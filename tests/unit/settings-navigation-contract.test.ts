// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';

const main = appSource();
const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');

describe('設定端直達導覽契約', () => {
  it('不同內容高度切換時保留穩定的頁面中心線', () => {
    expect(css).toContain('scrollbar-gutter: stable;');
  });

  it('設定首頁四層：狀態列、待辦列、主檔單行列、頁尾連結', () => {
    expect(main).toContain("if (normalized === '#settings') return { module: 'settings', page: 'home' };");
    expect(main).toContain('function settingsHomeView(): string');
    expect(main).toContain('class="settings-home__group"');
    expect(main).not.toContain('settings-context-tabs');
    expect(main).not.toContain('data-settings-area');
    expect(css).not.toContain('.settings-context-tabs');
    expect(css).not.toContain('.settings-area-switch');
    expect(main).toContain("group('主檔'");
    expect(main).toContain('class="settings-status" href="#settings/account"');
    expect(main).toContain('本機模式');
    expect(main).toContain('登入後可共用工地');
    expect(main).toContain('class="settings-attention" href="#settings/memory"');
    expect(main).toContain('pending ? `<a class="settings-attention"');
    expect(main).toContain('<p class="settings-home__footer">');
    for (const href of ['#settings/data', '#settings/debug', '#settings/memory']) expect(main).toContain(`class="settings-home__link" href="${href}"`);
    expect(main).toContain("settingsRow('#settings/water', '水位井位')");
    expect(main).not.toContain('settingsRow(`#settings/daily/${key}`, label, hint)');
    expect(css).toMatch(/.settings-home__link {[^}]*min-height: 44px/);
  });

  it('日報主檔每個區段是獨立子頁，舊網址導回設定首頁', () => {
    expect(main).toContain("if (normalized.startsWith('#settings/daily/')) return { module: 'daily', page: 'settings' };");
    expect(main).toContain("if (location.hash === '#settings/daily' || location.hash === '#daily/settings') { history.replaceState(null, '', '#settings'); return renderApp(); }");
    expect(main).toContain('settingsRow(`#settings/daily/${key}`, label)');
    expect(main).toContain("if (location.hash === '#settings/daily/vendors') { history.replaceState(null, '', '#settings/daily/trade-tasks'); return renderApp(); }");
    expect(main).not.toContain("['vendors', '廠商'");
    expect(main).toContain('<a href="#settings/daily/sites">管理工地</a>');
  });

  it('首頁保留來源返回操作，子頁一律返回設定首頁', () => {
    expect(main).toContain("settingsReturnModule: SettingsReturnModule = 'daily';");
    expect(main).toContain('function settingsReturnLink(): string');
    expect(main).toContain("if (route.module === 'settings' && route.page === 'home' && (previousRoute?.module === 'daily' || previousRoute?.module === 'water-level') && previousRoute.page === 'main') appState.settingsReturnModule = previousRoute.module;");
    expect(main).toContain('<a class="settings-button" href="#settings" aria-label="返回設定">‹ 設定</a>');
  });

  it('設定頁共用紙質淡黃色工作台，不影響填報模組容器', () => {
    expect(css).toContain('.settings-page { background: var(--daily-paper); color: var(--daily-ink); }');
    expect(css).toContain('.settings-page .settings-work-area { border-color: var(--daily-line-strong); background: transparent; }');
  });

  it('材料類型改用頁內表單與 IME 安全搜尋，不再跳出瀏覽器提示框', () => {
    expect(main).not.toContain("window.prompt('材料類型名稱'");
    expect(main).toContain("addButton('add-material-type', '新增材料類型')");
    expect(main).toContain("nameForm('add', '材料類型名稱'");
    expect(main).toContain('<input data-settings-search="tasks" type="search" enterkeyhint="search" aria-label="搜尋${label}"');
  });

  it('材料類型詳情面板有品名、規格、供應商、單位四區塊並就地更新記憶值', () => {
    expect(main).toContain("[['itemName', '品名'], ['specification', '規格'], ['supplier', '供應商'], ['unit', '單位']]");
    expect(main).toContain('updateMaterialMemoryItem(appState.daily.report');
    expect(main).toContain('重新命名類型');
    expect(main).toContain('刪除類型');
    expect(css).toContain('.settings-page .material-detail__grid');
  });

  it('位置表單標題與提示文字對齊日報', () => {
    expect(main).toContain("placeholder=\"例：東側\"");
    expect(main).toContain("'工地名稱' : '位置'");
  });

  it('備份頁直接呈現內容，偵錯以獨立路由集中處理同步問題', () => {
    expect(main).toContain('function dataSystemView(): string');
    expect(main).not.toContain('data-data-system-section');
    expect(main).toContain("if (normalized === '#settings/debug') return { module: 'account', page: 'debug' };");
    expect(main).not.toContain('data-settings-action="toggle-debug"');
  });

  it('水位設定使用設定端容器，水位填報才保留模組紙色容器', () => {
    expect(main).toContain("const shellClass = settings ? 'app-shell settings-page water-settings-shell' : 'app-shell module-page water-page-shell';");
    expect(main).toContain("const header = settings ? settingsHeader('水位井位')");
    expect(main).toContain('<main class="${shellClass}">');
  });
  it('清單子頁共用語言：工具列、單行列、行內表單，列上不放編輯／刪除按鈕', () => {
    expect(main).toContain('class="settings-toolbar"');
    expect(main).toContain('class="settings-add" data-settings-action');
    expect(main).toContain('class="settings-row" ${attrs}');
    expect(main).toContain('settings-edit-form__delete');
    expect(main).not.toContain('settings-item-actions');
    expect(main).not.toContain('data-settings-action="rename-material-type"');
    expect(css).toMatch(/.settings-page .settings-row {[^}]*min-height: 52px/);
    expect(css).toMatch(/.settings-page .settings-add {[^}]*min-height: 44px/);
    expect(css).not.toContain('.settings-page .settings-item-actions');
    expect(css).toContain('.settings-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto;');
  });

  it('其他設定頁外框改為透明並只留上下細線', () => {
    expect(css).toContain('.settings-page :is(.form-card, .manage, .backup, .settings-management-panel, .memory-review__overview) { border: 0; border-block: 1px solid var(--daily-line);');
  });

});
