import { describe, expect, it } from 'vitest';
import { renderAccountPage } from '../../src/account/account-view';
import type { SyncOperation } from '../../src/sync/types';

const operation = (code: '23503' | '23505'): SyncOperation => ({
  id: code, mutationId: `mutation-${code}`, userId: 'user-1', siteId: 'site-1', entity: 'memory-entry', entityId: `entry-${code}`,
  baseRevision: 0, payload: { id: `entry-${code}`, kind: code === '23503' ? 'task' : 'trade' }, status: 'blocked', attempts: 1,
  retryable: false, lastErrorCode: code, nextAttemptAt: '2026-09-28T00:00:00.000Z', createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
});

describe('共用工地同步修復介面', () => {
  const ownerState = {
    auth: { enabled: true, session: null, user: { id: 'user-1', email: 'owner@example.com' } as never },
    sites: [{ id: 'site-1', name: '測試工地', joinCode: 'join', role: 'owner' as const, createdAt: '' }],
    activeSiteId: 'site-1', pendingCount: 0, requests: [], members: [], feedback: '', error: '',
  };

  it('管理員選定工地後固定顯示修復入口，不依賴診斷載入結果', () => {
    const html = renderAccountPage({ view: 'debug', ...ownerState, operations: [], diagnostics: [], operationsStatus: 'loading' });
    expect(html).toContain('修復舊同步項目');
    expect(html).toContain('此工具固定顯示');
    expect(html).toContain('data-account-action="preview-sync-recovery"');
  });

  it('顯示可理解的錯誤與預覽、備份入口', () => {
    const rows = [operation('23505'), operation('23503')];
    const html = renderAccountPage({ view: 'debug',
      ...ownerState, pendingCount: 2, operations: rows, diagnostics: rows,
    });
    expect(html).toContain('雲端已有同名記憶');
    expect(html).toContain('等待父層工種完成');
    expect(html).toContain('data-account-action="preview-sync-recovery"');
    expect(html).toContain('data-account-action="export-sync-recovery-backup"');
  });

  it('非管理員仍看得到修復區與權限原因', () => {
    const html = renderAccountPage({ view: 'debug',
      ...ownerState,
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'join', role: 'editor', createdAt: '' }],
    });
    expect(html).toContain('修復舊同步項目');
    expect(html).toContain('目前帳號不是此工地管理員');
    expect(html).not.toContain('data-account-action="preview-sync-recovery"');
  });
  it('雲端沒有記憶時整筆採用本機，不能拼接空欄位', () => {
    const html = renderAccountPage({ view: 'debug', ...ownerState, conflicts: [{ id: 'conflict', operationId: 'operation', kind: 'memory', entity: 'memory-entry', createdAt: '', local: { id: 'task', kind: 'task', normalized_name: '粉光', payload: { name: '粉光' }, usage_count: 1, status: 'confirmed' }, cloud: {}, cloudRevision: 0, cloudEntityId: 'task', diffs: [{ path: '/id', kind: '新增', local: 'task', cloud: undefined }] }] });
    expect(html).toContain('粉光');
    expect(html).toContain('data-conflict-choice="/"');
    expect(html).toContain('value="cloud" disabled');
    expect(html).toContain('value="local" selected');
    expect(html).not.toContain('data-conflict-choice="/id"');
  });
  it('共用工地頁保留管理操作，診斷改由獨立頁簽承接', () => {
    const rows = [operation('23505')];
    const html = renderAccountPage({ ...ownerState, view: 'account', operations: rows, diagnostics: rows, pendingCount: 1 });
    expect(html).toContain('href="#settings/debug"');
    expect(html).toContain('data-account-form="create-site"');
    expect(html).not.toContain('<h2>待同步項目</h2>');
    expect(html).not.toContain('data-account-action="preview-sync-recovery"');
  });

  it('偵錯頁集中診斷，渲染不修改原始待送操作且不帶入工地管理', () => {
    const rows = [operation('23505')];
    const original = JSON.stringify(rows);
    const html = renderAccountPage({ ...ownerState, view: 'debug', operations: rows, diagnostics: rows, pendingCount: 1 });
    expect(html).toContain('<h2>待同步項目</h2>');
    expect(html).toContain('<h2>同步診斷</h2>');
    expect(html).not.toContain('<summary>工地與成員管理</summary>');
    expect(html).not.toContain('data-account-action="sign-out"');
    expect(html).not.toContain('data-account-action="copy-join-code"');
    expect(html).not.toContain('data-account-action="select-site"');
    expect(html).not.toContain('data-account-action="role-owner"');
    expect(html).toContain('data-account-action="sync-now"');
    expect(html).toContain('href="#settings/account"');
    expect(html).not.toContain('data-account-form="request-join"');
    expect(html).not.toContain('data-account-form="create-site"');
    expect(html).toContain('data-account-action="preview-sync-recovery"');
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('尚未登入或未選工地時只引導回共用工地，不重複建立與登入表單', () => {
    const signedOut = renderAccountPage({ ...ownerState, view: 'debug', auth: { enabled: true, session: null, user: null } });
    expect(signedOut).toContain('前往共用工地登入');
    expect(signedOut).not.toContain('data-account-action="sign-in"');
    const noSite = renderAccountPage({ ...ownerState, view: 'debug', activeSiteId: null });
    expect(noSite).toContain('請先選擇要診斷的工地');
    expect(noSite).not.toContain('<h2>待同步項目</h2>');
    expect(noSite).not.toContain('data-account-form="create-site"');
  });

  it('診斷僅顯示目前工地，不洩露其他工地加入碼或成員，同步中禁止重複操作', () => {
    const html = renderAccountPage({ ...ownerState, view: 'debug', syncing: true,
      sites: [...ownerState.sites, { id: 'other', name: '其他工地', joinCode: 'other-secret', role: 'owner', createdAt: '' }],
      members: [{ siteId: 'site-1', userId: 'private-member', role: 'editor', createdAt: '' }],
    });
    expect(html).toContain('<h2>測試工地</h2>');
    expect(html).not.toContain('其他工地');
    expect(html).not.toContain('other-secret');
    expect(html).not.toContain('private-member');
    expect(html).toContain('data-account-action="sync-now" disabled');
  });

});
