import { describe, expect, it } from 'vitest';
import { conflictRecordForOperation, diffConflict } from '../../src/sync/conflict-review';
import type { SyncOperation } from '../../src/sync/types';

describe('同步衝突逐項比較', () => {
  it('以穩定 ID 顯示新增、修改與刪除，不使用陣列位置', () => {
    const cloud = { tradeSections: [{ id: 'trade-a', workerCount: '2', workItems: [{ id: 'old', taskTextSnapshot: '保留' }, { id: 'deleted', taskTextSnapshot: '雲端新增' }] }] };
    const local = { tradeSections: [{ id: 'trade-a', workerCount: '3', workItems: [{ id: 'old', taskTextSnapshot: '本機修改' }, { id: 'added', taskTextSnapshot: '天地六' }] }] };
    expect(diffConflict(local, cloud)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/tradeSections/trade-a/workerCount', kind: '修改', local: '3', cloud: '2' }),
      expect.objectContaining({ path: '/tradeSections/trade-a/workItems/added', kind: '新增' }),
      expect.objectContaining({ path: '/tradeSections/trade-a/workItems/deleted', kind: '刪除' }),
      expect.objectContaining({ path: '/tradeSections/trade-a/workItems/old/taskTextSnapshot', kind: '修改' }),
    ]));
  });

  it('相同內容不建立需要使用者確認的差異', () => {
    expect(diffConflict({ points: [{ id: 'a', name: 'A井' }] }, { points: [{ id: 'a', name: 'A井' }] })).toEqual([]);
  });

  it('診斷紀錄遺失時仍能用本機佇列衝突建立審核來源', () => {
    const operation: SyncOperation = {
      id: 'op-1', mutationId: 'mutation-1', userId: 'user-1', siteId: 'site-1',
      entity: 'memory-entry', entityId: 'task-1', baseRevision: 1, payload: { kind: 'task', payload: { name: '本機工項' } },
      status: 'conflict', attempts: 1, nextAttemptAt: '', createdAt: '', updatedAt: '2026-09-24T00:00:00Z',
    };
    expect(conflictRecordForOperation(operation, [])).toMatchObject({
      id: operation.id, operationId: operation.id, localPayload: operation.payload,
      remoteRevision: operation.baseRevision,
    });
  });
});
