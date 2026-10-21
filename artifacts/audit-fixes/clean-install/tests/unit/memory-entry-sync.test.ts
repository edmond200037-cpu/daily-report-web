import { describe, expect, it, vi } from 'vitest';
import { changedMemoryEntries, snapshotMemoryEntries } from '../../src/sync/memory-entries';
import { previewMemoryImport } from '../../src/sync/memory-import';
import type { MemorySnapshotPayload } from '../../src/data/memory-partition';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = (stores: Record<string, unknown[]>): MemorySnapshotPayload => ({ schemaVersion: 1, stores });
const trade = { id: id(1), name: '泥作', normalizedName: '泥作', status: 'confirmed', usageCount: 2, finalizedUsageCount: 2 };
const task = { id: id(2), tradeTypeId: id(1), name: '粉光', normalizedName: '粉光', status: 'candidate', usageCount: 1, finalizedUsageCount: 1 };

describe('逐筆工地記憶', () => {
  it('只排變動的單筆，刪除保留墓碑；不將其他 app_settings 偏好送往雲端', () => {
    const before = snapshot({ trade_types: [trade], trade_tasks: [task], app_settings: [{ id: 'theme', value: 'dark' }] });
    const after = snapshot({ trade_types: [{ ...trade, name: '泥作工程' }], trade_tasks: [], app_settings: [{ id: 'theme', value: 'light' }] });
    const changes = changedMemoryEntries(before, after);
    expect(changes).toHaveLength(2);
    expect(changes.find((row) => row.id === trade.id)?.payload.name).toBe('泥作工程');
    expect(changes.find((row) => row.id === task.id)?.deleted).toBe(true);
  });

  it('特殊事項模板拆成獨立共用記憶', () => {
    const entries = snapshotMemoryEntries(snapshot({ app_settings: [
      { id: 'theme', value: 'dark' },
      { id: 'daily_special_templates_v1', templates: [{ id: id(3), text: '豪雨', normalizedName: '豪雨' }] },
    ] }));
    expect(entries).toMatchObject([{ id: id(3), kind: 'template', normalized_name: '豪雨' }]);
  });

  it('匯入時依類型、名稱和父層比對，並重映射子項目父 ID', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce(id(8)).mockReturnValueOnce(id(9)) });
    const source = snapshot({ trade_types: [trade], trade_tasks: [task] });
    const cloudTrade = { ...snapshotMemoryEntries(snapshot({ trade_types: [{ ...trade, id: id(7) }] }))[0], revision: 1 };
    const result = previewMemoryImport(source, [cloudTrade]);
    expect(result.duplicate).toHaveLength(1);
    expect(result.add).toHaveLength(1);
    expect(result.add[0].parent_id).toBe(id(7));
    expect(result.add[0].payload.tradeTypeId).toBe(id(7));
    vi.unstubAllGlobals();
  });

  it('同名內容不同時列為衝突，保留雲端 ID 與版本供管理員逐筆決定', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue(id(8)) });
    const source = snapshot({ trade_types: [trade] });
    const remote = { ...snapshotMemoryEntries(snapshot({ trade_types: [{ ...trade, id: id(7), usageCount: 5 }] }))[0], revision: 4 };
    const result = previewMemoryImport(source, [remote]);
    expect(result.add).toHaveLength(0);
    expect(result.conflict).toMatchObject([{ id: id(7), base_revision: 4, payload: { id: id(7), usageCount: 2 } }]);
    vi.unstubAllGlobals();
  });
});
