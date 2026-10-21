import { describe, expect, it } from 'vitest';
import { resolveRuntimeConfig } from '../../src/config/runtime-config';
import { canEditSite, canManageSite, sharedScopeKey } from '../../src/domain/shared';
import { canRetryAt, retryDelayMs, type SyncOperation } from '../../src/sync/types';
import { memoryPayloadHash } from '../../src/data/memory-partition';
import { waterPayloadHash } from '../../src/data/water-partition';

const operation = (overrides: Partial<SyncOperation> = {}): SyncOperation => ({
  id: 'operation-1', mutationId: 'mutation-1', userId: 'user-1', siteId: 'site-1', entity: 'daily-draft', entityId: 'draft-1', baseRevision: 1,
  payload: {}, status: 'pending', attempts: 0, nextAttemptAt: '2026-09-21T00:00:00.000Z', createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z', ...overrides,
});

describe('共享後端契約', () => {
  it('沒有雲端設定時維持本機模式，避免破壞既有使用者', () => {
    expect(resolveRuntimeConfig({})).toEqual({ mode: 'local' });
  });

  it('共享模式必須同時提供 URL 與 publishable key', () => {
    expect(() => resolveRuntimeConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toThrow('設定不完整');
    expect(resolveRuntimeConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toMatchObject({ mode: 'shared', supabaseUrl: 'https://example.supabase.co' });
  });

  it('角色權限由領域規則明確區分', () => {
    expect(canEditSite('owner')).toBe(true); expect(canManageSite('owner')).toBe(true);
    expect(canEditSite('editor')).toBe(true); expect(canManageSite('editor')).toBe(false);
    expect(canEditSite('viewer')).toBe(false);
  });

  it('同步佇列依帳號與工地隔離，衝突不自動重試', () => {
    expect(sharedScopeKey({ userId: 'u', siteId: 's' })).toBe('u:s');
    expect(canRetryAt(operation(), new Date('2026-09-21T00:00:01Z'))).toBe(true);
    expect(canRetryAt(operation({ status: 'conflict' }), new Date('2026-09-21T00:00:01Z'))).toBe(false);
    expect(canRetryAt(operation({ status: 'sending' }), new Date('2026-09-21T00:00:01Z'))).toBe(false);
    expect(canRetryAt(operation({ status: 'sending' }), new Date('2026-09-21T00:01:01Z'))).toBe(true);
    expect(retryDelayMs(1)).toBe(1000); expect(retryDelayMs(20)).toBe(60000);
  });

  it('記憶與水位快照以完整內容判斷是否需要建立新 mutation', () => {
    expect(memoryPayloadHash({ schemaVersion: 1, stores: { sites: [] } })).not.toBe(memoryPayloadHash({ schemaVersion: 1, stores: { sites: [{ id: 's1' }] } }));
    expect(waterPayloadHash({ schemaVersion: 1, points: [], logs: [] })).not.toBe(waterPayloadHash({ schemaVersion: 1, points: [{ id: 'p1' }], logs: [] }));
  });
});
