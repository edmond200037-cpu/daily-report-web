import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGasConfig, gasCall, loadGasConfig, saveGasConfig } from '../../src/data/remote/gas-client';
import { sharedScopeKey } from '../../src/domain/shared';
import { canRetryAt, retryDelayMs, type SyncOperation } from '../../src/sync/types';
import { memoryPayloadHash } from '../../src/data/memory-partition';
import { waterPayloadHash } from '../../src/data/water-partition';

const operation = (overrides: Partial<SyncOperation> = {}): SyncOperation => ({
  id: 'operation-1', mutationId: 'mutation-1', userId: 'shared', siteId: 'shared', entity: 'daily-draft', entityId: '2026-10-21', baseRevision: 1,
  payload: {}, status: 'pending', attempts: 0, nextAttemptAt: '2026-09-21T00:00:00.000Z', createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z', ...overrides,
});

const URL_OK = 'https://script.google.com/macros/s/abc/exec';

describe('共用後端契約', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('沒有設定時維持本機模式；設定後可讀回、可清除', () => {
    expect(loadGasConfig()).toBeNull();
    saveGasConfig(URL_OK, ' secret ');
    expect(loadGasConfig()).toEqual({ url: URL_OK, key: 'secret' });
    clearGasConfig();
    expect(loadGasConfig()).toBeNull();
  });

  it('只接受 script.google.com 的 https 網址與非空金鑰', () => {
    expect(() => saveGasConfig('http://script.google.com/macros/s/a/exec', 'k')).toThrow('必須是');
    expect(() => saveGasConfig('https://evil.example.com/exec', 'k')).toThrow('必須是');
    expect(() => saveGasConfig(URL_OK, '  ')).toThrow('金鑰');
    expect(loadGasConfig()).toBeNull();
  });

  it('呼叫後端使用 text/plain 並帶金鑰；錯誤金鑰轉成可讀訊息', async () => {
    saveGasConfig(URL_OK, 'k1');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'unauthorized' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(gasCall({ action: 'pull', cursor: 0 })).rejects.toThrow('金鑰錯誤');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toContain('text/plain');
    expect(JSON.parse(init.body)).toEqual({ key: 'k1', action: 'pull', cursor: 0 });
  });

  it('未設定時不送出任何請求', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(gasCall({ action: 'pull' })).rejects.toThrow('尚未設定');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('同步佇列依範圍隔離，衝突不自動重試', () => {
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