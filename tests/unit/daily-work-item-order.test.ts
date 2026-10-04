import { beforeAll, describe, expect, it } from 'vitest';
import { DailyController } from '../../src/daily/daily-controller';
import { duplicateWorkItemIds } from '../../src/daily/daily-validator';
import type { DailyReportV3, TradeSection } from '../../src/domain/daily';

beforeAll(() => { Object.assign(globalThis, { window: { clearTimeout, setTimeout } }); });

const work = (id: string, sortOrder: number) => ({ id, startFloorRaw: '', startFloorNormalized: null, endFloorRaw: '', endFloorNormalized: null, locationId: null, locationTextSnapshot: '', taskId: null, taskTextSnapshot: id, note: '', sortOrder, createdAt: '', updatedAt: '' });
const trade = (): TradeSection => ({ id: 't1', tradeTypeId: null, tradeNameSnapshot: '模板工程', vendorId: null, vendorNameSnapshot: '甲廠商', workerCount: '2', workItems: [work('w1', 0), work('w2', 1), work('w3', 2)], materialEntries: [], status: 'complete', sortOrder: 0, createdAt: '', updatedAt: '' });
const report = (): DailyReportV3 => ({ id: 'current', date: '2026-08-17', siteId: null, siteNameSnapshot: '', activeTab: 'engineering', tradeSections: [trade()], standaloneMaterialEntries: [], supplies: [], contacts: [], specialItems: [], createdAt: '', updatedAt: '' });

describe('工項排序', () => {
  it('同一施工卡內重排工項、重編 sortOrder 資料齊全時維持可定稿', () => {
    const controller = new DailyController(report());
    expect(controller.reorderWorkItems('t1', 2, 0)).toBe(true);
    expect(controller.trade('t1')?.workItems.map((item) => item.id)).toEqual(['w3', 'w1', 'w2']);
    expect(controller.trade('t1')?.workItems.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
    expect(controller.trade('t1')?.status).toBe('complete');
  });

  it('同位置或越界移動不寫入資料', () => {
    const controller = new DailyController(report());
    expect(controller.reorderWorkItems('t1', 1, 1)).toBe(false);
    expect(controller.reorderWorkItems('t1', -1, 1)).toBe(false);
    expect(controller.reorderWorkItems('t1', 0, 3)).toBe(false);
    expect(controller.trade('t1')?.status).toBe('complete');
  });

  it('輸入器加入文字與記憶關聯，並只標記後加入的重複工項', () => {
    const controller = new DailyController({ ...report(), tradeSections: [{ ...trade(), workItems: [] }] });
    const first = controller.addWorkItem('t1', '模板組立', 'task-1');
    const second = controller.addWorkItem('t1', ' 模板組立 ', null);
    expect(first?.taskTextSnapshot).toBe('模板組立');
    expect(first?.taskId).toBe('task-1');
    expect(duplicateWorkItemIds(controller.trade('t1')!)).toEqual(new Set([second?.id]));
  });
  it('撤回指定穩定 ID，不觸發確認；復原保留其他新增工項並且只還原一次', () => {
    const controller = new DailyController(report());
    const restore = controller.removeWorkItemForUndo('t1', 'w2');
    const added = controller.addWorkItem('t1', '新增施工', null);
    restore?.(); restore?.();
    expect(controller.trade('t1')!.workItems.map((item) => item.id)).toEqual(['w1', 'w2', 'w3', added!.id]);
    expect(controller.trade('t1')!.workItems.map((item) => item.sortOrder)).toEqual([0, 1, 2, 3]);
  });
  it('工項復原不能跨日期或工地', () => {
    for (const change of ['date', 'siteId'] as const) {
      const controller = new DailyController(report());
      const restore = controller.removeWorkItemForUndo('t1', 'w2');
      controller.report[change] = change === 'date' ? '2026-08-18' : 'another-site';
      restore?.();
      expect(controller.trade('t1')!.workItems.map((item) => item.id)).toEqual(['w1', 'w3']);
    }
  });
});
