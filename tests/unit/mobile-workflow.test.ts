import { afterEach, describe, expect, it, vi } from 'vitest';
import { swipeDeletes } from '../../src/daily/work-gestures';
import { DailyController } from '../../src/daily/daily-controller';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('手機工項操作', () => {
  it('只有明確左滑才刪除，垂直移動、右滑與短距離移動不刪除', () => {
    expect(swipeDeletes(-80, 8)).toBe(true);
    expect(swipeDeletes(-30, 0)).toBe(false);
    expect(swipeDeletes(90, 0)).toBe(false);
    expect(swipeDeletes(-80, 100)).toBe(false);
  });
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
