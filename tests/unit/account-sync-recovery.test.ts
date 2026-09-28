import { describe, expect, it } from 'vitest';
import { renderAccountPage } from '../../src/account/account-view';
import type { SyncOperation } from '../../src/sync/types';

const operation = (code: '23503' | '23505'): SyncOperation => ({
  id: code, mutationId: `mutation-${code}`, userId: 'user-1', siteId: 'site-1', entity: 'memory-entry', entityId: `entry-${code}`,
  baseRevision: 0, payload: { id: `entry-${code}`, kind: code === '23503' ? 'task' : 'trade' }, status: 'blocked', attempts: 1,
  retryable: false, lastErrorCode: code, nextAttemptAt: '2026-09-28T00:00:00.000Z', createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z',
});

describe('共用工地同步修復介面', () => {
  it('顯示可理解的錯誤與預覽、備份入口', () => {
    const rows = [operation('23505'), operation('23503')];
    const html = renderAccountPage({
      auth: { enabled: true, session: null, user: { id: 'user-1', email: 'owner@example.com' } as never },
      sites: [{ id: 'site-1', name: '測試工地', joinCode: 'join', role: 'owner', createdAt: '' }], activeSiteId: 'site-1', pendingCount: 2,
      requests: [], members: [], feedback: '', error: '', operations: rows, diagnostics: rows,
    });
    expect(html).toContain('雲端已有同名記憶');
    expect(html).toContain('等待父層工種完成');
    expect(html).toContain('data-account-action="preview-sync-recovery"');
    expect(html).toContain('data-account-action="export-sync-recovery-backup"');
  });
});
