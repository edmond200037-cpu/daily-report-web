import { describe, expect, it } from 'vitest';
import { buildMemoryRecovery } from '../../src/sync/recovery';
import type { MemoryEntryPayload, RemoteMemoryEntry } from '../../src/sync/memory-entries';

const entry = (id: string, kind: MemoryEntryPayload['kind'], name: string, parent: string | null = null): MemoryEntryPayload => ({
  id, kind, parent_id: parent, normalized_name: name,
  payload: { id, normalizedName: name, status: 'confirmed', ...(kind === 'vendor' || kind === 'task' ? { tradeTypeId: parent } : {}) },
  status: 'confirmed', usage_count: 0, finalized_usage_count: 0,
});

describe('舊同步記憶修復規劃', () => {
  it('同名父工種採雲端 ID，子工項改綁後重新排送', () => {
    const localTrade = entry('local-trade', 'trade', '泥作');
    const localTask = entry('local-task', 'task', '粉光', localTrade.id);
    const remoteTrade = { ...entry('cloud-trade', 'trade', '泥作'), revision: 4 } satisfies RemoteMemoryEntry;
    const plan = buildMemoryRecovery([localTask, localTrade], [remoteTrade]);
    expect(plan.adoptions).toMatchObject([{ localId: 'local-trade', remote: { id: 'cloud-trade', revision: 4 } }]);
    expect(plan.queued).toMatchObject([{ id: 'local-task', parent_id: 'cloud-trade', payload: { tradeTypeId: 'cloud-trade' } }]);
    expect(plan.manual).toBe(0);
  });

  it('父子都已有同名雲端資料時全部接管，不建立第二批操作', () => {
    const localTrade = entry('local-trade', 'trade', '泥作');
    const localTask = entry('local-task', 'task', '粉光', localTrade.id);
    const remoteTrade = { ...entry('cloud-trade', 'trade', '泥作'), revision: 4 } satisfies RemoteMemoryEntry;
    const remoteTask = { ...entry('cloud-task', 'task', '粉光', remoteTrade.id), revision: 2 } satisfies RemoteMemoryEntry;
    const plan = buildMemoryRecovery([localTrade, localTask], [remoteTrade, remoteTask]);
    expect(plan.adoptions.map((row) => row.localId)).toEqual(['local-trade', 'local-task']);
    expect(plan.queued).toEqual([]);
  });
});
