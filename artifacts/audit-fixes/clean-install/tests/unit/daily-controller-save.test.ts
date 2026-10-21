import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyController } from '../../src/daily/daily-controller';
import { createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { saveDailyDraft } from '../../src/data/daily-repository';

vi.mock('../../src/data/daily-repository', () => ({ saveDailyDraft: vi.fn() }));
beforeEach(() => { vi.stubGlobal('window', { clearTimeout, setTimeout, dispatchEvent: vi.fn() }); vi.mocked(saveDailyDraft).mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('日報保存期間的編輯', () => {
  it('保存返回時保留後續文字，並保留 repository 合併的遠端人數', async () => {
    const report = createDailyDraft(null, '測試', '2026-09-30');
    const trade = createTrade('水電', '甲公司', 0); trade.workerCount = '2';
    const work = createWorkItem(0); work.taskTextSnapshot = '配管';
    trade.workItems.push(work); report.tradeSections.push(trade);
    const controller = new DailyController(report);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(saveDailyDraft).mockImplementationOnce(async (submitted) => {
      await gate; const result = structuredClone(submitted); result.tradeSections[0].workerCount = '5'; return result;
    });
    const saving = controller.flush(); await Promise.resolve();
    controller.report.tradeSections[0].workItems[0].taskTextSnapshot = '配管與測試';
    release(); await saving;
    expect(controller.report.tradeSections[0].workerCount).toBe('5');
    expect(controller.report.tradeSections[0].workItems[0].taskTextSnapshot).toBe('配管與測試');
    vi.mocked(saveDailyDraft).mockImplementationOnce(async (submitted) => structuredClone(submitted));
    await controller.flush();
    const [submitted, baseline] = vi.mocked(saveDailyDraft).mock.calls[1];
    expect(submitted.tradeSections[0].workItems[0].taskTextSnapshot).toBe('配管與測試');
    expect(baseline?.tradeSections[0].workItems[0].taskTextSnapshot).toBe('配管');
    expect(baseline?.tradeSections[0].workerCount).toBe('5');
  });
});
