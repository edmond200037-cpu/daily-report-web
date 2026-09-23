import { describe, expect, it, vi } from 'vitest';
import type { SyncOperation } from '../../src/sync/types';

const records = vi.hoisted(() => ({ rows: [] as SyncOperation[] }));
vi.mock('../../src/data/db.js', () => ({ list: async () => records.rows, put: vi.fn(), remove: vi.fn() }));

import { listReadyOperations } from '../../src/sync/outbox';

describe('手動同步待送佇列', () => {
  it('立即同步可重試尚在退避時間內的失敗操作，仍保留衝突與封鎖操作', async () => {
    const base: SyncOperation = {
      id: 'failed', mutationId: 'mutation-failed', userId: 'user-a', siteId: 'site-a',
      entity: 'daily-patch', entityId: 'draft-a', baseRevision: 0,
      payload: { reportDate: '2026-09-23', changes: [] }, status: 'failed', attempts: 1,
      nextAttemptAt: '2026-09-24T00:00:00.000Z', createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
    };
    records.rows = [base, { ...base, id: 'conflict', status: 'conflict' }, { ...base, id: 'blocked', status: 'blocked' }];
    const scope = { userId: 'user-a', siteId: 'site-a' };
    const at = new Date('2026-09-23T01:00:00.000Z');
    expect(await listReadyOperations(scope, at)).toEqual([]);
    expect((await listReadyOperations(scope, at, true)).map((row) => row.id)).toEqual(['failed']);
  });
});
