import { describe, expect, it } from 'vitest';
import { applyFieldMutations, buildFieldMutations } from '../../src/sync/field-mutations';

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
});
