import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntryPayload, RemoteMemoryEntry } from '../../src/sync/memory-entries';
const state = vi.hoisted(() => ({ remote: [] as Array<RemoteMemoryEntry & { site_id: string }>, local: [] as unknown[] }));
vi.mock('../../src/data/db.js', () => ({ list: async () => state.local }));
vi.mock('../../src/data/remote/supabase-client', () => ({ getSupabaseClient: () => ({ from: () => {
  const filters: Array<[string, unknown]> = [];
  const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, is: (key: string, value: unknown) => { filters.push([key, value]); return chain; }, maybeSingle: async () => ({ data: state.remote.find(row => filters.every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)) ?? null, error: null }) };
  return chain;
} }) }));
import { findCloudMemoryEntry, alignMemoryEntryIdentity, assertMemoryResolution } from '../../src/sync/memory-identity';
const scope = { userId: 'u', siteId: 's' };
const entry = (id: string, kind: MemoryEntryPayload['kind'], name: string, parent: string | null = null): MemoryEntryPayload => ({ id, kind, parent_id: parent, normalized_name: name, payload: { id, name, normalizedName: name, status: 'confirmed', ...(parent ? { tradeTypeId: parent } : {}) }, status: 'confirmed', usage_count: 1, finalized_usage_count: 0 });
const remote = (row: MemoryEntryPayload) => ({ ...row, site_id: 's', revision: 5, deleted_at: null });
beforeEach(() => { state.remote = []; state.local = []; });
describe('衝突記憶身分', () => {
  it('父工種與工項 ID 都不同，仍能依目前工地的自然鍵找到', async () => {
    state.local = [{ id: 'local-parent', normalizedName: '泥作' }];
    state.remote = [remote(entry('cloud-parent', 'trade', '泥作')), remote(entry('cloud-task', 'task', '粉光', 'cloud-parent'))];
    const local = entry('local-task', 'task', '粉光', 'local-parent');
    const cloud = await findCloudMemoryEntry(scope, local);
    expect(cloud?.id).toBe('cloud-task');
    const aligned = alignMemoryEntryIdentity(local as unknown as Record<string, unknown>, cloud as unknown as Record<string, unknown>);
    expect(aligned).toMatchObject({ id: 'cloud-task', parent_id: 'cloud-parent', payload: { id: 'cloud-task', tradeTypeId: 'cloud-parent' } });
    expect(() => assertMemoryResolution(aligned, 'cloud-task')).not.toThrow();
  });
  it('同 ID 已刪除時保留 tombstone，不改採同名活資料', async () => {
    const local = entry('original', 'trade', '泥作');
    state.remote = [{ ...remote(local), deleted_at: '2026-10-06' }, remote(entry('other', 'trade', '泥作'))];
    expect((await findCloudMemoryEntry(scope, local))?.deleted_at).toBe('2026-10-06');
  });
  it('不同工地同名記憶不會被採納；空內容與混合身分不可送出', async () => {
    state.remote = [{ ...remote(entry('other', 'trade', '泥作')), site_id: 'another' }];
    expect(await findCloudMemoryEntry(scope, entry('local', 'trade', '泥作'))).toBeNull();
    expect(() => assertMemoryResolution({}, 'local')).toThrow('不完整');
    expect(() => assertMemoryResolution({ ...entry('local', 'task', '粉光', 'parent'), payload: { id: 'other', tradeTypeId: 'parent', status: 'confirmed' } }, 'local')).toThrow('不完整');
  });
});
