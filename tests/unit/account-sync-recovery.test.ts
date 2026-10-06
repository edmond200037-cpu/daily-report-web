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
    const html = renderAccountPage({ ...ownerState, operations: [], diagnostics: [], operationsStatus: 'loading' });
    expect(html).toContain('修復舊同步項目');
    expect(html).toContain('此工具固定顯示');
    expect(html).toContain('data-account-action="preview-sync-recovery"');
  });

  it('顯示可理解的錯誤與預覽、備份入口', () => {
    const rows = [operation('23505'), operation('23503')];
    const html = renderAccountPage({
      ...ownerState, pendingCount: 2, operations: rows, diagnostics: rows,
    });
    expect(html).toContain('雲端已有同名記憶');
    expect(html).toContain('等待父層工種完成');
    expect(html).toContain('data-account-action="preview-sync-recovery"');
    expect(html).toContain('data-account-action="export-sync-recovery-backup"');
  });

  it('非管理員仍看得到修復區與權限原因', () => {
    const html = renderAccountPage({
      ...ownerState,
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'join', role: 'editor', createdAt: '' }],
    });
    expect(html).toContain('修復舊同步項目');
    expect(html).toContain('目前帳號不是此工地管理員');
    expect(html).not.toContain('data-account-action="preview-sync-recovery"');
  });
  it('雲端沒有記憶時整筆採用本機，不能拼接空欄位', () => {
    const html = renderAccountPage({ ...ownerState, conflicts: [{ id: 'conflict', operationId: 'operation', kind: 'memory', entity: 'memory-entry', createdAt: '', local: { id: 'task', kind: 'task', normalized_name: '粉光', payload: { name: '粉光' }, usage_count: 1, status: 'confirmed' }, cloud: {}, cloudRevision: 0, cloudEntityId: 'task', diffs: [{ path: '/id', kind: '新增', local: 'task', cloud: undefined }] }] });
    expect(html).toContain('粉光');
    expect(html).toContain('data-conflict-choice="/"');
    expect(html).toContain('value="cloud" disabled');
    expect(html).toContain('value="local" selected');
    expect(html).not.toContain('data-conflict-choice="/id"');
  });
});
