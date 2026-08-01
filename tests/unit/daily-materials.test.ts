import { describe, expect, it } from 'vitest';
import { formatDailyReport } from '../../src/daily/daily-formatter';
import { validateMaterialEntry } from '../../src/daily/daily-validator';
import type { DailyReportV3, MaterialEntry } from '../../src/domain/daily';

const material = (overrides: Partial<MaterialEntry> = {}): MaterialEntry => ({ id: 'm1', materialTypeId: null, materialTypeSnapshot: '混凝土', itemName: '一般混凝土', supplierId: null, supplierNameSnapshot: '天誠', quantity: '5', unit: '方', specification: '140kgf/cm²', note: '', sortOrder: 0, createdAt: '', updatedAt: '', ...overrides });
const report = (): DailyReportV3 => ({ id: 'current', date: '2026-07-31', siteId: null, siteNameSnapshot: '鑫天地六期', activeTab: 'engineering', tradeSections: [{ id: 't1', tradeTypeId: null, tradeNameSnapshot: '安全支撐工程', vendorId: null, vendorNameSnapshot: '安暉', workerCount: '10', workItems: [{ id: 'w1', startFloorRaw: '', startFloorNormalized: null, endFloorRaw: '', endFloorNormalized: null, locationId: null, locationTextSnapshot: '', taskId: null, taskTextSnapshot: '支撐材料進場', note: '', sortOrder: 0, createdAt: '', updatedAt: '' }], materialEntries: [material()], status: 'complete', sortOrder: 0, createdAt: '', updatedAt: '' }], standaloneMaterialEntries: [material({ id: 'm2', itemName: '混凝土', quantity: '2.5', specification: '350kgf/cm²' })], supplies: [], contacts: [], specialItems: [], createdAt: '', updatedAt: '' });

describe('叫料格式與驗證', () => {
  it('工種叫料附屬於工種，獨立叫料排在工種之後', () => {
    expect(formatDailyReport(report())).toContain('安全支撐工程：\n1.安暉10工-支撐材料進場。\n2.混凝土-天誠：一般混凝土5方，140kgf/cm²。\n\n混凝土-天誠：混凝土2.5方，350kgf/cm²。');
  });
  it('拒絕不合法的叫料數量與缺少供應商', () => {
    expect(validateMaterialEntry(material({ quantity: '5方', supplierNameSnapshot: '' }))).toEqual(['請填寫供應商。', '數量只能輸入大於 0 的數字。']);
  });
  it('已連接獨立進料只在所屬工種輸出一次', () => {
    const draft = report();
    draft.tradeSections[0].materialEntries = [];
    draft.standaloneMaterialEntries = [material({ id: 'm3', entryType: 'independent', connectedTradeSectionId: 't1', itemName: '泵送混凝土' })];
    const output = formatDailyReport(draft);
    expect(output).toContain('2.混凝土-天誠：泵送混凝土5方，140kgf/cm²。');
    expect(output.match(/泵送混凝土/g)).toHaveLength(1);
  });
  it('聯絡事項依施工項目排序使用全形分號輸出', () => {
    const draft = report();
    draft.contacts = [{ id: 'c1', tradeTypeId: 't1', tradeNameSnapshot: '鋼筋工程', vendorId: 'v1', vendorNameSnapshot: '萬大禾', items: [{ id: 'i2', content: '門窗開口補強', sortOrder: 1, createdAt: '', updatedAt: '' }, { id: 'i1', content: '1FL～3FL門窗角隅補強', sortOrder: 0, createdAt: '', updatedAt: '' }], sortOrder: 0, createdAt: '', updatedAt: '' }];
    expect(formatDailyReport(draft)).toContain('鋼筋工程－萬大禾：1FL～3FL門窗角隅補強；門窗開口補強。');
  });
});
