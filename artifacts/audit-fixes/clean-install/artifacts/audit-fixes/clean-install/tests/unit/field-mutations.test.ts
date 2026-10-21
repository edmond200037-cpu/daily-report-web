import { describe, expect, it } from 'vitest';
import { applyFieldMutations, buildFieldMutations, mergeLegacyDailyWorkItems } from '../../src/sync/field-mutations';

describe('共編欄位 mutation', () => {
  it('不同日報欄位產生可獨立套用的穩定 ID 修改', () => {
    const before = { date: '2026-09-23', tradeSections: [{ id: 'trade-a', workerCount: '2', workItems: [] }], standaloneMaterialEntries: [], supplies: [], contacts: [], specialItems: [] };
    const after = { ...before, siteNameSnapshot: 'A 工地', tradeSections: [{ ...before.tradeSections[0], workerCount: '3' }] };
    const changes = buildFieldMutations('daily', before, after);
    expect(changes).toContainEqual({ op: 'set', collection: 'tradeSections', id: 'trade-a', field: 'workerCount', value: '3' });
    expect(applyFieldMutations(before, changes)).toMatchObject(after);
  });

  it('水位讀值以量測紀錄 ID 與井位 ID 定位，並維持其他讀值', () => {
    const before = { schemaVersion: 1, points: [], logs: [{ id: 'log-a', readings: [{ pointId: 'well-a', value: '1.0' }, { pointId: 'well-b', value: '2.0' }] }] };
    const after = { ...before, logs: [{ id: 'log-a', readings: [{ pointId: 'well-a', value: '1.1' }, { pointId: 'well-b', value: '2.0' }] }] };
    const changes = buildFieldMutations('water', before, after);
    expect(changes).toContainEqual({ op: 'set', collection: 'readings', parentId: 'log-a', id: 'well-a', field: 'value', value: '1.1' });
    expect(applyFieldMutations(before, changes)).toEqual(after);
  });

  it('刪除後的舊欄位 set 不會在客戶端重新建立識別', () => {
    const snapshot = { points: [{ id: 'well-a', name: 'A井' }], logs: [] };
    expect(applyFieldMutations(snapshot, [{ op: 'delete', collection: 'points', id: 'well-a' }, { op: 'set', collection: 'points', id: 'well-a', field: 'name', value: '舊名稱' }])).toEqual({ points: [], logs: [] });
  });

  it('A 新增與刪除工項後，B 以相同工種 ID 套用變更可得到相同結果', () => {
    const before = { date: '2026-09-23', tradeSections: [{ id: 'trade-a', workItems: [{ id: 'old', taskTextSnapshot: '舊工項' }] }], standaloneMaterialEntries: [], supplies: [], contacts: [], specialItems: [] };
    const added = { ...before, tradeSections: [{ id: 'trade-a', workItems: [...before.tradeSections[0].workItems, { id: 'new', taskTextSnapshot: '新工項' }] }] };
    const removed = { ...before, tradeSections: [{ id: 'trade-a', workItems: [{ id: 'new', taskTextSnapshot: '新工項' }] }] };
    const addChanges = buildFieldMutations('daily', before, added);
    const deleteChanges = buildFieldMutations('daily', added, removed);
    expect(addChanges).toContainEqual({ op: 'upsert', collection: 'workItems', parentId: 'trade-a', id: 'new', value: { id: 'new', taskTextSnapshot: '新工項' } });
    expect(deleteChanges).toContainEqual({ op: 'delete', collection: 'workItems', parentId: 'trade-a', id: 'old' });
    expect(applyFieldMutations(applyFieldMutations(before, addChanges), deleteChanges)).toEqual(removed);
  });

  it('重套連續欄位操作時，依建立順序保留不同工項且最後操作覆蓋同欄位', () => {
    const remote = { tradeSections: [{ id: 'trade-a', workerCount: '2', workItems: [{ id: 'cloud-item', taskTextSnapshot: '雲端工項' }] }] };
    const first = [{ op: 'upsert' as const, collection: 'workItems', parentId: 'trade-a', id: 'local-item', value: { id: 'local-item', taskTextSnapshot: '天地六' } }];
    const second = [{ op: 'set' as const, collection: 'tradeSections', id: 'trade-a', field: 'workerCount', value: '4' }];
    const third = [{ op: 'set' as const, collection: 'tradeSections', id: 'trade-a', field: 'workerCount', value: '5' }];
    expect(applyFieldMutations(applyFieldMutations(applyFieldMutations(remote, first), second), third)).toEqual({ tradeSections: [{ id: 'trade-a', workerCount: '5', workItems: [{ id: 'cloud-item', taskTextSnapshot: '雲端工項' }, { id: 'local-item', taskTextSnapshot: '天地六' }] }] });
  });

  it('舊版快照衝突只補入雲端尚無且有固定 ID 的工項', () => {
    const remote = { tradeSections: [{ id: 'trade-a', workerCount: '2', workItems: [{ id: 'cloud-item', taskTextSnapshot: '雲端值' }] }] };
    const legacy = { tradeSections: [{ id: 'trade-a', workerCount: '99', workItems: [{ id: 'cloud-item', taskTextSnapshot: '不覆蓋' }, { id: 'new-item', taskTextSnapshot: '天地六' }, { taskTextSnapshot: '無 ID' }] }] };
    expect(mergeLegacyDailyWorkItems(remote, legacy)).toEqual({ tradeSections: [{ id: 'trade-a', workerCount: '2', workItems: [{ id: 'cloud-item', taskTextSnapshot: '雲端值' }, { id: 'new-item', taskTextSnapshot: '天地六' }] }] });
  });

  it('舊版快照不得復活另一手機已刪除的工項', () => {
    const remote = { tradeSections: [{ id: 'trade-a', workItems: [] }] };
    const legacy = { tradeSections: [{ id: 'trade-a', workItems: [{ id: 'deleted-item', taskTextSnapshot: '已刪除' }, { id: 'new-item', taskTextSnapshot: '可補回' }] }] };
    const tombstones = new Set(['workItems:trade-a:deleted-item']);
    expect(mergeLegacyDailyWorkItems(remote, legacy, tombstones)).toEqual({ tradeSections: [{ id: 'trade-a', workItems: [{ id: 'new-item', taskTextSnapshot: '可補回' }] }] });
  });
});
