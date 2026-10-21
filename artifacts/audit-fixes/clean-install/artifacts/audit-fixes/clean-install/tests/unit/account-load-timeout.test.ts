import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountLoadTimeoutError, withAccountDeadline } from '../../src/account/load-timeout';

describe('共用工地載入逾時', () => {
  afterEach(() => vi.useRealTimers());

  it('請求永不返回時，15 秒後結束等待並允許畫面顯示重試', async () => {
    vi.useFakeTimers();
    const pending = new Promise<string>(() => {});
    const result = withAccountDeadline(pending, 15_000);
    const rejected = expect(result).rejects.toBeInstanceOf(AccountLoadTimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
  });

  it('請求先完成時回傳資料並取消逾時計時', async () => {
    vi.useFakeTimers();
    await expect(withAccountDeadline(Promise.resolve('工地資料'), 15_000)).resolves.toBe('工地資料');
    expect(vi.getTimerCount()).toBe(0);
  });
});
