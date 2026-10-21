// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderAccountPage } from '../../src/account/account-view';

const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const accountCss = readFileSync(new URL('../../src/account/account.css', import.meta.url), 'utf8');

const base = { configured: false, url: '', pendingCount: 0, conflicts: [], feedback: '', error: '' };

describe('共用同步設定頁', () => {
  it('未設定後端時維持本機模式並提供連線表單', () => {
    const html = renderAccountPage(base);
    expect(html).toContain('目前使用本機模式');
    expect(html).toContain('data-account-form="save-config"');
    expect(html).not.toContain('<main');
    expect(html).not.toContain('data-account-action="disconnect"');
  });

  it('已啟用時顯示待同步數量與停用入口，金鑰欄不預填', () => {
    const html = renderAccountPage({ ...base, configured: true, url: 'https://script.google.com/macros/s/x/exec', pendingCount: 2 });
    expect(html).toContain('待同步 2 筆');
    expect(html).toContain('data-account-action="disconnect"');
    expect(html).toContain('type="password"');
    expect(html).not.toMatch(/name="key"[^>]*value=/);
  });

  it('衝突可選用雲端或本機；沒有本機操作的衝突不提供按鈕', () => {
    const html = renderAccountPage({ ...base, configured: true, conflicts: [{ id: 'c1', label: '記憶主檔', resolvable: true }, { id: 'c2', label: '雲端日報', resolvable: false }] });
    expect(html).toContain('data-account-action="resolve-theirs" data-conflict-id="c1"');
    expect(html).toContain('data-account-action="resolve-mine" data-conflict-id="c1"');
    expect(html).not.toContain('data-conflict-id="c2"');
  });

  it('使用者輸入會被跳脫', () => {
    const html = renderAccountPage({ ...base, configured: true, url: '"><script>', error: '<b>x</b>' });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x</b>');
  });
  it('共用工地由路由層使用與其他模組一致的頁首與頁籤骨架', () => {
    expect(main).toContain('type ModuleHeaderControl');
    expect(main).toContain("kind: 'link'");
    expect(main).toContain("kind: 'action'");
    expect(main).toContain('跨裝置共用同一份資料');
    expect(main).toContain('data-account-action="sync-now"');
    expect(main).toContain('class="app-shell module-page account-page-shell"');
    expect(main).toContain('<div class="module-page__tabs">${moduleTabs(\'account\')}</div>');
  });

  it('模組頁與共用工地保留紙張色、危險訊息與 daily orange 互動契約', () => {
    expect(styles).toContain('.module-page { min-height: 100vh; min-height: 100dvh; background: var(--daily-paper); color: var(--daily-ink); }');
    expect(styles).toContain('.module-page button:focus-visible');
    expect(styles).toContain('outline-color: var(--daily-orange)');
    expect(accountCss).toContain('.account-page-shell label, .account-page-shell .empty { color: var(--daily-ink-soft); }');
    expect(accountCss).toContain('.account-page-shell small { color: var(--daily-ink-faint); }');
    expect(accountCss).toContain('.account-page-shell .issues { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }');
    expect(accountCss).toContain('.account-page-shell .primary { border-color: var(--daily-orange); background: var(--daily-orange); }');
  });

});
