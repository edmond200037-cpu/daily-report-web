// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderAccountPage } from '../../src/account/account-view';
import { oauthRedirectUrl } from '../../src/auth/auth-service';

const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const accountCss = readFileSync(new URL('../../src/account/account.css', import.meta.url), 'utf8');

describe('共用工地帳號頁', () => {
  it('OAuth callback 使用 query string，避免與 hash 路由衝突', () => {
    expect(oauthRedirectUrl('http://localhost:5173/#account')).toBe('http://localhost:5173/?auth_callback=1');
    expect(oauthRedirectUrl('https://example.github.io/daily-report-web/#account')).toBe('https://example.github.io/daily-report-web/?auth_callback=1');
  });
  it('未設定後端時清楚維持本機模式', () => {
    const html = renderAccountPage({ auth: { enabled: false, session: null, user: null }, sites: [], activeSiteId: null, pendingCount: 0, requests: [], members: [], feedback: '', error: '' });
    expect(html).toContain('目前使用本機模式');
    expect(html).not.toContain('data-account-action="sign-in"');
    expect(html).not.toContain('<main');
    expect(html).not.toContain('返回日報');
  });

  it('未登入時保留登入操作，但頁面骨架交給路由層', () => {
    const html = renderAccountPage({ auth: { enabled: true, session: null, user: null }, sites: [], activeSiteId: null, pendingCount: 0, requests: [], members: [], feedback: '', error: '' });
    expect(html).toContain('data-account-action="sign-in"');
    expect(html).not.toContain('<header');
  });

  it('登入後沒有工地時保留建立與加入入口', () => {
    const html = renderAccountPage({ auth: { enabled: true, session: null, user: { id: 'user-1', email: 'member@example.com' } as never }, sites: [], activeSiteId: null, pendingCount: 0, requests: [], members: [], feedback: '', error: '' });
    expect(html).toContain('目前還沒有可使用的工地。');
    expect(html).toContain('data-account-form="create-site"');
    expect(html).toContain('data-account-form="request-join"');
  });

  it('已登入時提供工地切換、手動同步與加入流程', () => {
    const html = renderAccountPage({
      auth: { enabled: true, session: null, user: { id: 'user-1', email: 'member@example.com' } as never },
      sites: [{ id: 'site-1', name: '測試工地', role: 'editor', createdAt: '2026-09-21T00:00:00Z' }],
      activeSiteId: 'site-1', pendingCount: 2, requests: [], members: [], feedback: '', error: '',
    });
    expect(html).toContain('待同步 2 筆');
    expect(html).toContain('data-account-form="request-join"');
    expect(html).toContain('account-site active');
  });

  it('管理員保留申請審核與成員角色操作標記', () => {
    const html = renderAccountPage({
      auth: { enabled: true, session: null, user: { id: 'owner-1', email: 'owner@example.com' } as never },
      sites: [{ id: 'site-1', name: '測試工地', role: 'owner', createdAt: '2026-09-21T00:00:00Z' }], activeSiteId: 'site-1', pendingCount: 0,
      requests: [{ id: 'request-1', siteId: 'site-1', siteName: '測試工地', userId: 'member-1', requestedAt: '2026-09-21T00:00:00Z' }],
      members: [{ siteId: 'site-1', userId: 'member-1', role: 'editor', createdAt: '2026-09-21T00:00:00Z' }], feedback: '', error: '',
    });
    expect(html).toContain('data-account-action="approve-editor"');
    expect(html).toContain('data-account-action="role-owner"');
    expect(html).toContain('data-account-action="remove-member"');
    expect(html).toContain(' · 編輯者');
    expect(html).toContain('data-account-action="role-editor"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('共用工地由路由層使用與其他模組一致的頁首與頁籤骨架', () => {
    expect(main).toContain('type ModuleHeaderControl');
    expect(main).toContain("kind: 'link'");
    expect(main).toContain("kind: 'action'");
    expect(main).toContain('多人協作與跨裝置同步');
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
