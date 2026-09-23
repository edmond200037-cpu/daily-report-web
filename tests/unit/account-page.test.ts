// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderAccountPage } from '../../src/account/account-view';
import { oauthRedirectUrl } from '../../src/auth/auth-service';
import type { SyncOperation } from '../../src/sync/types';

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
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'a1b2c3d4e5f6', role: 'editor', createdAt: '2026-09-21T00:00:00Z' }],
      activeSiteId: 'site-1', pendingCount: 2, requests: [], members: [], feedback: '', error: '',
    });
    expect(html).toContain('待同步 2 筆');
    expect(html).toContain('data-account-form="request-join"');
    expect(html).toContain('account-site active');
    expect(html).toContain('<div class="account-join-code"><span>加入碼</span><code>a1b2c3d4e5f6</code>');
    expect(html).toContain('data-account-action="copy-join-code" data-site-id="site-1"');
    expect(html).not.toContain('data-join-code=');
  });

  it('同步佇列仍在載入或讀取失敗時，不把未知筆數顯示為零', () => {
    const state = {
      auth: { enabled: true, session: null, user: { id: 'user-1', email: 'member@example.com' } as never },
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'a1b2c3d4e5f6', role: 'editor' as const, createdAt: '' }],
      activeSiteId: 'site-1', pendingCount: 0, requests: [], members: [], feedback: '', error: '',
    };
    const loading = renderAccountPage({ ...state, operationsStatus: 'loading' });
    expect(loading).toContain('待同步讀取中');
    expect(loading).not.toContain('待同步 0 筆');
    const failed = renderAccountPage({ ...state, operationsStatus: 'error' });
    expect(failed).toContain('待同步無法讀取');
    expect(failed).toContain('資料未被清除');
  });

  it.each(['owner', 'editor', 'viewer'] as const)('%s 都能查看與複製自己已加入工地的加入碼', (role) => {
    const html = renderAccountPage({
      auth: { enabled: true, session: null, user: { id: 'user-1', email: 'member@example.com' } as never },
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'a1b2c3d4e5f6', role, createdAt: '2026-09-21T00:00:00Z' }],
      activeSiteId: null, pendingCount: 0, requests: [], members: [], feedback: '', error: '',
    });
    expect(html).toContain('a1b2c3d4e5f6');
    expect(html).toContain('data-account-action="copy-join-code" data-site-id="site-1"');
  });

  it('管理員保留申請審核與成員角色操作標記', () => {
    const html = renderAccountPage({
      auth: { enabled: true, session: null, user: { id: 'owner-1', email: 'owner@example.com' } as never },
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'a1b2c3d4e5f6', role: 'owner', createdAt: '2026-09-21T00:00:00Z' }], activeSiteId: 'site-1', pendingCount: 0,
      requests: [{ id: 'request-1', siteId: 'site-1', siteName: '測試工地', userId: 'member-1', requestedAt: '2026-09-21T00:00:00Z' }],
      members: [{ siteId: 'site-1', userId: 'member-1', role: 'editor', createdAt: '2026-09-21T00:00:00Z' }], feedback: '', error: '',
    });
    expect(html).toContain('data-account-action="approve-editor"');
    expect(html).toContain('data-account-action="role-owner"');
    expect(html).toContain('data-account-action="remove-member"');
    expect(html).toContain('<small>編輯者</small>');
    expect(html).toContain('data-account-action="role-editor"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('共用工地使用設定頁首與第五個設定入口', () => {
    expect(main).toContain('data-account-action="sync-now"');
    expect(main).toContain('class="app-shell settings-page account-page-shell"');
    expect(main).toContain("settingsContextTabs('account')");
    expect(main).toContain("['account', '#settings/account', '共用工地']");
    expect(main).toContain("if (location.hash === '#account') { history.replaceState(null, '', '#settings/account'); return renderApp(); }");
  });

  it('模組頁與共用工地保留紙張色、危險訊息與 daily orange 互動契約', () => {
    expect(styles).toContain('.module-page { min-height: 100vh; min-height: 100dvh; background: var(--daily-paper); color: var(--daily-ink); }');
    expect(styles).toContain('.module-page button:focus-visible');
    expect(styles).toContain('outline-color: var(--daily-orange)');
    expect(accountCss).toContain('.account-page-shell label, .account-page-shell .empty { color: var(--daily-ink-soft); }');
    expect(accountCss).toContain('.account-page-shell small { color: var(--daily-ink-faint); }');
    expect(accountCss).toContain('.account-page-shell .issues { border-color: var(--danger); background: var(--danger-soft); color: var(--danger); }');
    expect(accountCss).toContain('.account-page-shell .primary { border-color: var(--daily-orange); background: var(--daily-orange); }');
    expect(accountCss).toContain('.account-join-code code');
    expect(accountCss).toContain('min-height: 44px');
    expect(accountCss).toContain('border-left: 1px solid var(--daily-line-strong)');
  });

  it('點共用工地先渲染載入骨架，背景讀取完成才替換資料', () => {
    expect(main).toContain("if (route.module === 'account') { renderAccountLoading(); void refreshAccount(() =>");
    expect(main).toContain('正在載入共用工地…');
    expect(main).toContain('token !== renderToken || parseRoute(location.hash).module !== \'account\'');
    expect(main).toContain("button.dataset.accountAction === 'retry-load-account'");
    expect(main).toContain('15_000 - (started - accountLoadStartedAt)');
    expect(main).toContain('accountLoadCoreReady = true;');
  });

  it('頁首與明細使用同一批全部狀態的八筆待同步操作', () => {
    const rows = Array.from({ length: 8 }, (_, index): SyncOperation => ({
      id: `op-${index}`, mutationId: `mutation-${index}`, userId: 'user-1', siteId: 'site-1', entity: index < 3 ? 'daily-patch' : index < 6 ? 'water-patch' : 'memory', entityId: 'entity-1', baseRevision: 0,
      payload: index < 3 ? { reportDate: '2026-09-23', changes: [{ collection: 'tradeSections', field: 'workerCount' }] } : index < 6 ? { changes: [{ collection: 'points', field: 'name' }] } : { stores: {} }, status: index === 6 ? 'failed' : index === 7 ? 'conflict' : 'pending', attempts: 0, nextAttemptAt: '', createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '',
    }));
    const html = renderAccountPage({ auth: { enabled: true, session: null, user: { id: 'user-1' } as never }, sites: [{ id: 'site-1', name: '測試工地', joinCode: 'code', role: 'editor', createdAt: '' }], activeSiteId: 'site-1', pendingCount: rows.length, requests: [], members: [], feedback: '', error: '', operations: rows, diagnostics: rows });
    expect(html).toContain('待同步 8 筆');
    expect(html).toContain('共 8 筆；此明細與頁首待同步數量相同');
    expect((html.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(html).toContain('日報日期 2026-09-23');
    expect(html).toContain('tradeSections.workerCount');
  });

  it('複製操作只用工地 ID 從記憶體查找加入碼，並保留成功與失敗回饋', () => {
    expect(main).toContain("button.dataset.accountAction === 'copy-join-code'");
    expect(main).toContain('accountSites.find((row) => row.id === button.dataset.siteId)');
    expect(main).toContain('navigator.clipboard.writeText(site.joinCode)');
    expect(main).toContain('已複製「${site.name}」加入碼');
    expect(main).toContain('無法自動複製，請手動選取加入碼');
  });

  it('管理員依工地分組申請與成員，群組內不重複工地名稱', () => {
    const html = renderAccountPage({
      auth: { enabled: true, session: null, user: { id: 'owner-1', email: 'owner@example.com' } as never },
      sites: [
        { id: 'site-1', name: '甲工地', joinCode: 'a1b2c3d4e5f6', role: 'owner', createdAt: '' },
        { id: 'site-2', name: '乙工地', joinCode: 'f6e5d4c3b2a1', role: 'owner', createdAt: '' },
      ],
      activeSiteId: null, pendingCount: 0,
      requests: [{ id: 'request-1', siteId: 'site-1', siteName: '甲工地', userId: 'requester-1', requestedAt: '' }],
      members: [
        { siteId: 'site-1', userId: 'member-1', role: 'editor', createdAt: '' },
        { siteId: 'site-2', userId: 'member-2', role: 'viewer', createdAt: '' },
      ], feedback: '', error: '',
    });
    expect(html).toContain('<h2>甲工地</h2>');
    expect(html).toContain('<h2>乙工地</h2>');
    expect(html).toContain('requester-1');
    expect(html).toContain('member-1');
    expect(html).toContain('member-2');
    expect(html).not.toContain('甲工地 · 編輯者');
    expect(html).not.toContain('乙工地 · 檢視者');
    expect(html).toContain('data-site-id="site-1" data-user-id="member-1"');
    expect(html).toContain('data-site-id="site-2" data-user-id="member-2"');
  });

});
