import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncOperation } from '../../src/sync/types';
const state = vi.hoisted(() => ({ rows: [] as SyncOperation[], capabilities: [] as string[], error: null as unknown, put: vi.fn(), rpc: vi.fn() }));
vi.mock('../../src/data/db.js', () => ({ list: async () => state.rows, put: (...args: unknown[]) => state.put(...args), remove: vi.fn() }));
vi.mock('../../src/data/remote/supabase-client', () => ({ getSupabaseClient: () => ({ rpc: (...args: unknown[]) => { state.rpc(...args); return Promise.resolve({ data: { contract_version: 1, capabilities: state.capabilities }, error: state.error }); } }) }));
import { retryMissingRpcOperations } from '../../src/sync/outbox';
import { operationRpc } from '../../src/sync/contract';
const scope = { userId: 'u', siteId: 's' };
const operation = (code = 'PGRST202'): SyncOperation => ({ ...scope, id: 'op', mutationId: 'original-mutation', entity: 'memory-entry', entityId: 'trade', baseRevision: 3, payload: { learning_key: 'apply:event' }, status: 'blocked', attempts: 1, lastErrorCode: code, nextAttemptAt: '', createdAt: '', updatedAt: '' });
beforeEach(() => { state.rows = []; state.capabilities = []; state.error = null; state.put.mockClear(); state.rpc.mockClear(); });
describe('缺 RPC 的操作僅在雲端能力恢復後重排', () => {
  it('能力尚未恢復不修改任何原始操作', async () => {
    state.rows = [operation()];
    await expect(retryMissingRpcOperations(scope)).rejects.toThrow('仍缺少');
    expect(state.put).not.toHaveBeenCalled();
  });
  it('重新排入保留事件識別與原請求，只處理此工地及已恢復的 RPC', async () => {
    state.capabilities = ['apply_memory_application'];
    state.rows = [operation(), { ...operation('42883'), id: 'general', payload: {} }, { ...operation(), id: 'other', siteId: 'other' }];
    expect(await retryMissingRpcOperations(scope)).toBe(1);
    expect(state.put).toHaveBeenCalledWith('sync_outbox', expect.objectContaining({ id: 'op', mutationId: 'original-mutation', baseRevision: 3, payload: { learning_key: 'apply:event' }, status: 'pending' }));
    expect(operationRpc(state.rows[0])).toBe('apply_memory_application');
  });
  it('42883 使用相同的恢復入口；健康 RPC 失敗不重排', async () => {
    state.rows = [operation('42883')]; state.error = { code: 'PGRST202' };
    await expect(retryMissingRpcOperations(scope)).rejects.toThrow('檢查尚未可用');
    expect(state.put).not.toHaveBeenCalled();
    state.error = null; state.capabilities = ['apply_memory_application'];
    expect(await retryMissingRpcOperations(scope)).toBe(1);
  });
});
describe('檢視者重送', () => {
  it('檢視者直接得到提示，不呼叫能力檢查也不修改操作', async () => {
    state.rows = [operation()];
    await expect(retryMissingRpcOperations(scope, { readOnly: true })).rejects.toThrow('檢視者無法重送');
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.put).not.toHaveBeenCalled();
  });
});
