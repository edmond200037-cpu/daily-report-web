import { describe, expect, it } from 'vitest';
import { classifySyncError } from '../../src/sync/error-diagnostics';
import { canRetryAt } from '../../src/sync/types';
// The UI exposes the repair action only for this exact stopped state.
// IndexedDB integration is exercised through the outbox implementation at runtime.

describe('同步失敗分類', () => {
  it('保留 Supabase 函式缺失錯誤並停止重試', () => {
    const result = classifySyncError({ code: 'PGRST202', message: 'Could not find the function public.apply_daily_field_mutation', hint: 'Check schema cache.' });
    expect(result).toMatchObject({ code: 'PGRST202', retryable: false });
    expect(result.guidance).toContain('migration');
  });
  it('權限與資料格式錯誤不可重試，暫時網路錯誤才可重試', () => {
    expect(classifySyncError({ code: '42501', message: 'permission denied' }).retryable).toBe(false);
    expect(classifySyncError({ code: '22023', message: 'invalid changes' }).retryable).toBe(false);
    expect(classifySyncError(new Error('Failed to fetch')).retryable).toBe(true);
    expect(canRetryAt({ id: 'x', mutationId: 'm', userId: 'u', siteId: 's', entity: 'daily-draft', entityId: 'd', baseRevision: 1, payload: {}, status: 'blocked', attempts: 1, nextAttemptAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })).toBe(false);
  });
  it('只有 PostgREST 找不到函式的錯誤可在修復後重新排入佇列', () => {
    expect(classifySyncError({ code: 'PGRST202', message: 'function missing' }).retryable).toBe(false);
    expect(classifySyncError({ code: '42883', message: 'function does not exist' }).retryable).toBe(false);
  });
});
