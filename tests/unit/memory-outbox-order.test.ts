import { describe, expect, it, vi } from 'vitest';
import type { SyncOperation } from '../../src/sync/types';

const records = vi.hoisted(() => ({ rows: [] as SyncOperation[] }));
vi.mock('../../src/data/db.js', () => ({ list: async () => records.rows, put: vi.fn(), remove: vi.fn() }));

import { listReadyOperations } from '../../src/sync/outbox';

describe('記憶同步父子順序', () => {
  it('父層工種固定排在 task 前面', async () => {
    const child: SyncOperation = {
      id: 'child', mutationId: 'mutation-child', userId: 'user-a', siteId: 'site-a', entity: 'memory-entry', entityId: 'task-a', baseRevision: 0,
      payload: { id: 'task-a', kind: 'task' }, status: 'pending', attempts: 0, nextAttemptAt: '2026-09-23T00:00:00.000Z', createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z',
    };
    records.rows = [child, { ...child, id: 'parent', entityId: 'trade-a', payload: { id: 'trade-a', kind: 'trade' } }];
    const rows = await listReadyOperations({ userId: 'user-a', siteId: 'site-a' }, new Date('2026-09-24T00:00:00.000Z'));
    expect(rows.map((row) => row.id)).toEqual(['parent', 'child']);
  });
});
