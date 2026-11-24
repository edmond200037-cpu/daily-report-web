import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyController } from '../../src/daily/daily-controller';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('手機工項操作', () => {
  it('新工程不繼承前一筆工種、廠商或人數，保留舊工程', () => {
    vi.useFakeTimers(); vi.stubGlobal('window', { setTimeout, clearTimeout });
    const controller = new DailyController();
    controller.addTrade('水電', '甲公司', 'memory-trade');
    const next = controller.addBlankTrade();
    expect(next).toMatchObject({ tradeNameSnapshot: '', vendorNameSnapshot: '', workerCount: '', tradeTypeId: null, vendorId: null });
    expect(controller.report.tradeSections).toHaveLength(2);
    expect(controller.expandedId).toBe(next.id);
  });
});
