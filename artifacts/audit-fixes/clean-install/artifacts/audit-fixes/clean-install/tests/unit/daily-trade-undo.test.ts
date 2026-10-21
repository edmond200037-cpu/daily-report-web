import { afterEach, describe, expect, it, vi } from 'vitest';
import { DailyController } from '../../src/daily/daily-controller';
import type { DailyReportV3, MaterialEntry, TradeSection } from '../../src/domain/daily';

const trade = (id: string, sortOrder: number): TradeSection => ({ id, tradeTypeId: null, tradeNameSnapshot: id, vendorId: null, vendorNameSnapshot: '廠商', workerCount: '', workItems: [], materialEntries: [], status: 'draft', sortOrder, createdAt: '', updatedAt: '' });
const material = (id: string, connectedTradeSectionId: string | null): MaterialEntry => ({ id, entryType: 'independent', connectedTradeSectionId, materialTypeId: null, materialTypeSnapshot: '混凝土', itemName: '混凝土', supplierId: null, supplierNameSnapshot: '供應商', quantity: '1', unit: '方', specification: '', note: '', sortOrder: 0, createdAt: '', updatedAt: '' });
const report = (): DailyReportV3 => ({ id: 'current', date: '2026-08-10', siteId: null, siteNameSnapshot: '', activeTab: 'engineering', tradeSections: [trade('t1', 0), trade('t2', 1)], standaloneMaterialEntries: [material('m1', 't1'), material('m2', 't2')], supplies: [], contacts: [], specialItems: [], createdAt: '', updatedAt: '' });

describe('工程條目左滑刪除復原', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('保留原位置並只重新連接原本已連接且仍未連接的獨立進料', () => {
    vi.stubGlobal('window', { clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    const controller = new DailyController(report());
    const undo = controller.deleteTradeForUndo('t1');

    expect(undo).toMatchObject({ originalIndex: 0, trade: { id: 't1' }, connectedMaterialIds: ['m1'] });
    expect(controller.report.tradeSections.map((item) => item.id)).toEqual(['t2']);
    expect(controller.materialEntry('m1')?.connectedTradeSectionId).toBeNull();
    expect(controller.materialEntry('m2')?.connectedTradeSectionId).toBe('t2');

    expect(controller.restoreDeletedTrade(undo!)).toEqual({ reconnected: 1, skipped: 0 });
    expect(controller.report.tradeSections.map((item) => item.id)).toEqual(['t1', 't2']);
    expect(controller.report.tradeSections.map((item) => item.sortOrder)).toEqual([0, 1]);
    expect(controller.materialEntry('m1')?.connectedTradeSectionId).toBe('t1');
  });

  it('復原時不覆蓋刪除期間已重新連接的材料', () => {
    vi.stubGlobal('window', { clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    const controller = new DailyController(report());
    const undo = controller.deleteTradeForUndo('t1')!;
    controller.materialEntry('m1')!.connectedTradeSectionId = 't2';

    expect(controller.restoreDeletedTrade(undo)).toEqual({ reconnected: 0, skipped: 1 });
    expect(controller.materialEntry('m1')?.connectedTradeSectionId).toBe('t2');
  });

  it('連續刪除時可依最後刪除優先逐筆復原', () => {
    vi.stubGlobal('window', { clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    const controller = new DailyController(report());
    const first = controller.deleteTradeForUndo('t1')!;
    const second = controller.deleteTradeForUndo('t2')!;

    expect(controller.report.tradeSections).toEqual([]);
    controller.restoreDeletedTrade(second);
    expect(controller.report.tradeSections.map((item) => item.id)).toEqual(['t2']);
    controller.restoreDeletedTrade(first);
    expect(controller.report.tradeSections.map((item) => item.id)).toEqual(['t1', 't2']);
  });

  it('進料、聯絡事項與特殊事項都會保留原排序並可復原', () => {
    vi.stubGlobal('window', { clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    const fixture = report();
    fixture.contacts = [
      { id: 'c1', tradeTypeId: null, tradeNameSnapshot: '模板', vendorId: null, vendorNameSnapshot: '甲', items: [], sortOrder: 0, createdAt: '', updatedAt: '' },
      { id: 'c2', tradeTypeId: null, tradeNameSnapshot: '鋼筋', vendorId: null, vendorNameSnapshot: '乙', items: [], sortOrder: 1, createdAt: '', updatedAt: '' },
    ];
    fixture.specialItems = [
      { id: 's1', content: '第一項', sortOrder: 0, createdAt: '', updatedAt: '' },
      { id: 's2', content: '第二項', sortOrder: 1, createdAt: '', updatedAt: '' },
    ];
    const controller = new DailyController(fixture);

    const materialUndo = controller.deleteMaterialForUndo('m1')!;
    const contactUndo = controller.deleteContactForUndo('c1')!;
    const specialUndo = controller.deleteSpecialForUndo('s1')!;

    controller.restoreDeletedItem(specialUndo);
    controller.restoreDeletedItem(contactUndo);
    controller.restoreDeletedItem(materialUndo);

    expect(controller.report.standaloneMaterialEntries.map((item) => item.id)).toEqual(['m1', 'm2']);
    expect(controller.report.contacts.map((item) => item.id)).toEqual(['c1', 'c2']);
    expect(controller.report.specialItems.map((item) => item.id)).toEqual(['s1', 's2']);
  });
});
