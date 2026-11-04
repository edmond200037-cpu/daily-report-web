import { beforeAll, describe, expect, it } from 'vitest';
import { formatDailyReport } from '../../src/daily/daily-formatter';
import { validateMaterialEntry } from '../../src/daily/daily-validator';
import type { DailyReportV3, MaterialEntry } from '../../src/domain/daily';
import { DailyController } from '../../src/daily/daily-controller';

const material = (overrides: Partial<MaterialEntry> = {}): MaterialEntry => ({ id: 'm1', materialTypeId: null, materialTypeSnapshot: '混凝土', itemName: '一般混凝土', supplierId: null, supplierNameSnapshot: '天誠', quantity: '5', unit: '方', specification: '140kgf/cm²', note: '', sortOrder: 0, createdAt: '', updatedAt: '', ...overrides });
beforeAll(() => { Object.assign(globalThis, { window: { clearTimeout, setTimeout } }); });
const report = (): DailyReportV3 => ({ id: 'current', date: '2026-07-31', siteId: null, siteNameSnapshot: '鑫天地六期', activeTab: 'engineering', tradeSections: [{ id: 't1', tradeTypeId: null, tradeNameSnapshot: '安全支撐工程', vendorId: null, vendorNameSnapshot: '安暉', workerCount: '10', workItems: [{ id: 'w1', startFloorRaw: '', startFloorNormalized: null, endFloorRaw: '', endFloorNormalized: null, locationId: null, locationTextSnapshot: '', taskId: null, taskTextSnapshot: '支撐材料進場', note: '', sortOrder: 0, createdAt: '', updatedAt: '' }], materialEntries: [], status: 'complete', sortOrder: 0, createdAt: '', updatedAt: '' }], standaloneMaterialEntries: [material({ id: 'm1', entryType: 'independent', connectedTradeSectionId: 't1' }), material({ id: 'm2', itemName: '混凝土', quantity: '2.5', specification: '350kgf/cm²' })], supplies: [], contacts: [], specialItems: [], createdAt: '', updatedAt: '' });

describe('叫料格式與驗證', () => {
  it('工種叫料附屬於工種，獨立叫料排在工種之後', () => {
    expect(formatDailyReport(report())).toContain('安全支撐工程：\n1.安暉10工-支撐材料進場。\n2.混凝土-天誠：一般混凝土5方，140kgf/cm²。\n\n混凝土-天誠：混凝土2.5方，350kgf/cm²。');
  });
  it('同材料類型與供應商合併明細並精確加總，單筆保留規格', () => {
    const draft = report();
    draft.tradeSections = [];
    draft.standaloneMaterialEntries = [
      ...['7.37', '11.17', '16.45', '23.55'].map((quantity, index) => material({ id: `steel-${index}`, materialTypeSnapshot: '鋼筋', supplierNameSnapshot: '萬大禾', itemName: `#${[4, 5, 10, 11][index]}鋼筋`, quantity, unit: '噸', specification: '', sortOrder: index })),
      material({ id: 'concrete', quantity: '187', specification: '140kgf/cm2', sortOrder: 4 }),
    ];
    expect(formatDailyReport(draft)).toContain('鋼筋-萬大禾：#4鋼筋7.37噸、#5鋼筋11.17噸、#10鋼筋16.45噸、#11鋼筋23.55噸，合計58.54噸。\n\n混凝土-天誠：一般混凝土187方，140kgf/cm2。');
  });
  it('供應商分開輸出，混合單位分別加總並保留規格與備註', () => {
    const draft = report();
    draft.tradeSections = [];
    draft.standaloneMaterialEntries = [
      material({ quantity: '0.1', note: '上午', sortOrder: 0 }),
      material({ id: 'm2', quantity: '0.2', specification: '350kgf/cm²', sortOrder: 1 }),
      material({ id: 'm3', quantity: '10', unit: '噸', sortOrder: 2 }),
      material({ id: 'm4', supplierNameSnapshot: '其他供應商', sortOrder: 3 }),
    ];
    const output = formatDailyReport(draft);
    expect(output).toContain('混凝土-天誠：一般混凝土0.1方，140kgf/cm²；上午、一般混凝土0.2方，350kgf/cm²、一般混凝土10噸，140kgf/cm²，合計0.3方、10噸。');
    expect(output).toContain('混凝土-其他供應商：一般混凝土5方，140kgf/cm²。');
  });
  it('工種內連接進料合併，普通進料仍各自在所屬區塊輸出', () => {
    const draft = report();
    draft.standaloneMaterialEntries.push(material({ id: 'm3', entryType: 'independent', connectedTradeSectionId: 't1', quantity: '15', sortOrder: 2 }));
    const output = formatDailyReport(draft);
    expect(output).toContain('2.混凝土-天誠：一般混凝土5方，140kgf/cm²、一般混凝土15方，140kgf/cm²，合計20方。');
    expect(output).toContain('\n\n混凝土-天誠：混凝土2.5方，350kgf/cm²。');
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
  it('普通進料連接工程條目時轉為獨立進料，解除連接後回到普通進料', () => {
    const controller = new DailyController(report());
    controller.report.standaloneMaterialEntries = [material({ id: 'm9', entryType: 'normal' })];
    controller.connectMaterial('t1', 'm9');
    expect(controller.materialEntry('m9')).toMatchObject({ entryType: 'independent', connectedTradeSectionId: 't1' });
    const undo = controller.disconnectMaterial('m9')!;
    expect(controller.materialEntry('m9')).toMatchObject({ entryType: 'normal', connectedTradeSectionId: null });
    controller.undoDisconnectMaterial(undo);
    expect(controller.materialEntry('m9')).toMatchObject({ entryType: 'independent', connectedTradeSectionId: 't1' });
  });
  it('聯絡事項依施工項目排序使用全形分號輸出', () => {
    const draft = report();
    draft.contacts = [{ id: 'c1', tradeTypeId: 't1', tradeNameSnapshot: '鋼筋工程', vendorId: 'v1', vendorNameSnapshot: '萬大禾', items: [{ id: 'i2', content: '門窗開口補強', sortOrder: 1, createdAt: '', updatedAt: '' }, { id: 'i1', content: '1FL～3FL門窗角隅補強', sortOrder: 0, createdAt: '', updatedAt: '' }], sortOrder: 0, createdAt: '', updatedAt: '' }];
    expect(formatDailyReport(draft)).toContain('1.鋼筋工程-萬大禾1FL～3FL門窗角隅補強；門窗開口補強。');
  });
  it('連接、改接與解除不改變已完成工項狀態，且一筆進料只保留一個工種', () => {
    const draft = report();
    draft.tradeSections.push({ ...draft.tradeSections[0], id: 't2', tradeNameSnapshot: '土方工程', status: 'complete', sortOrder: 1 });
    draft.standaloneMaterialEntries = [material({ id: 'm4', entryType: 'independent', connectedTradeSectionId: null })];
    const controller = new DailyController(draft);
    controller.connectMaterial('t1', 'm4');
    expect(controller.materialEntry('m4')?.connectedTradeSectionId).toBe('t1');
    expect(controller.trade('t1')?.status).toBe('complete');
    controller.connectMaterial('t2', 'm4');
    expect(controller.materialEntry('m4')?.connectedTradeSectionId).toBe('t2');
    expect(controller.trade('t1')?.status).toBe('complete');
    expect(controller.trade('t2')?.status).toBe('complete');
    const undo = controller.disconnectMaterial('m4');
    expect(undo).toEqual({ materialId: 'm4', tradeId: 't2' });
    expect(controller.materialEntry('m4')?.connectedTradeSectionId).toBeNull();
    expect(controller.trade('t2')?.status).toBe('complete');
    expect(controller.undoDisconnectMaterial(undo!)).toBe(true);
    const editorSnapshot = structuredClone(controller.materialEntry('m4')!);
    expect(editorSnapshot.connectedTradeSectionId).toBe('t2');
  });
  it('轉為普通進料會同步解除連接，且建構時修正無效關聯', () => {
    const draft = report();
    draft.standaloneMaterialEntries = [material({ id: 'm5', entryType: 'independent', connectedTradeSectionId: 'missing' })];
    const controller = new DailyController(draft);
    expect(controller.materialEntry('m5')?.connectedTradeSectionId).toBeNull();
    controller.connectMaterial('t1', 'm5');
    controller.convertMaterialType('m5');
    expect(controller.materialEntry('m5')).toMatchObject({ entryType: 'normal', connectedTradeSectionId: null });
  });
});
