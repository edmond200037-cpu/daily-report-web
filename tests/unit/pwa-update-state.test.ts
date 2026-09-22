import { describe, expect, it } from 'vitest';
import { consumePwaUpdateSuccess, PWA_UPDATE_SUCCESS_MARKER, transitionPwaUpdateState } from '../../src/pwa/update-state';

class MemorySessionStorage {
  private readonly rows = new Map<string, string>();
  getItem(key: string): string | null { return this.rows.get(key) ?? null; }
  removeItem(key: string): void { this.rows.delete(key); }
  setItem(key: string, value: string): void { this.rows.set(key, value); }
}

describe('PWA 更新狀態機', () => {
  it('依序表達 available、applying、success 與一次性完成標記', () => {
    expect(transitionPwaUpdateState('idle', 'available')).toBe('available');
    expect(transitionPwaUpdateState('available', 'apply')).toBe('applying');
    expect(transitionPwaUpdateState('applying', 'completed')).toBe('success');
    const storage = new MemorySessionStorage();
    storage.setItem(PWA_UPDATE_SUCCESS_MARKER, '1');
    expect(consumePwaUpdateSuccess(storage)).toBe(true);
    expect(consumePwaUpdateSuccess(storage)).toBe(false);
  });

  it('套用中拒絕重複觸發，失敗後可以重試', () => {
    expect(transitionPwaUpdateState('applying', 'apply')).toBe('applying');
    expect(transitionPwaUpdateState('applying', 'failed')).toBe('error');
    expect(transitionPwaUpdateState('error', 'apply')).toBe('applying');
  });
});
