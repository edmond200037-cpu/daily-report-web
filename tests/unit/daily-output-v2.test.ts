import { describe, expect, it } from 'vitest';
import { formatDailyReport } from '../../src/daily/daily-formatter';
import { validateDailyForFinalization } from '../../src/daily/daily-validator';
import { DailyController } from '../../src/daily/daily-controller';
import type { DailyReportV3, MaterialEntry, TradeSection } from '../../src/domain/daily';

const work = (text: string, overrides: Partial<TradeSection['workItems'][number]> = {}) => ({ id: crypto.randomUUID(), startFloorRaw: '', startFloorNormalized: null, endFloorRaw: '', endFloorNormalized: null, locationId: null, locationTextSnapshot: '', taskId: null, taskTextSnapshot: text, note: '', sortOrder: 0, createdAt: '', updatedAt: '', ...overrides });
const trade = (id: string, vendor: string, order: number, overrides: Partial<TradeSection> = {}): TradeSection => ({ id, tradeTypeId: 'support', tradeNameSnapshot: '安全支撐工程', vendorId: vendor, vendorNameSnapshot: vendor, workerCount: '2', workItems: [work('支撐施作')], materialEntries: [], status: 'complete', sortOrder: order, createdAt: '', updatedAt: '', ...overrides });
const material = (id: string, owner: string | null, order: number): MaterialEntry => ({ id, entryType: 'independent', connectedTradeSectionId: owner, materialTypeId: null, materialTypeSnapshot: '混凝土', itemName: id, supplierId: null, supplierNameSnapshot: '天誠', quantity: '2.5', unit: '方', specification: '', note: '', sortOrder: order, createdAt: '', updatedAt: '' });
const report = (trades = [trade('t1', '安暉', 0)]): DailyReportV3 => ({ id: 'current', date: '2026-08-13', siteId: 'site', siteNameSnapshot: '測試工地', activeTab: 'engineering', tradeSections: trades, standaloneMaterialEntries: [], supplies: [], contacts: [], specialItems: [], createdAt: '', updatedAt: '' });

describe('日報輸出模板 v2', () => {
  it('單一廠商無進料時採緊湊單行，位置與備註直接組合', () => {
    const draft = report();
    draft.tradeSections[0].workItems = [work('第五層支撐施作', { startFloorRaw: 'B2F', startFloorNormalized: 'B2F', endFloorRaw: 'B1F', endFloorNormalized: 'B1F', locationTextSnapshot: 'A區', note: '夜間施工' })];
    expect(formatDailyReport(draft)).toContain('安全支撐工程：安暉2工-B2F～B1FA區第五層支撐施作；夜間施工。');
  });

  it('相同工種多廠商合併成一個標題，同類供應商進料依施工卡順序合併', () => {
    const draft = report([trade('t1', '安暉', 0), trade('t2', '永盛', 2), trade('t3', '土方', 1, { tradeTypeId: 'earth', tradeNameSnapshot: '土方工程' })]);
    draft.standaloneMaterialEntries = [material('鋼筋', 't2', 0), material('混凝土', 't1', 9)];
    const output = formatDailyReport(draft);
    expect(output).toContain('安全支撐工程：\n1.安暉2工-支撐施作。\n  永盛2工-支撐施作。\n2.混凝土-天誠：混凝土2.5方、鋼筋2.5方，合計5方。');
    expect(output.indexOf('安全支撐工程：')).toBeLessThan(output.indexOf('土方工程：'));
  });

  it('鋼筋依號數排序、同規格先加總，基準案例合計107.12噸', () => {
    const draft = report();
    const steel = (id: string, name: string, quantity: string): MaterialEntry => ({ ...material(id, 't1', 0), materialTypeSnapshot: '鋼筋', supplierNameSnapshot: '萬大禾', itemName: name, quantity, unit: '噸' });
    draft.standaloneMaterialEntries = [
      steel('s11', '#11鋼筋', '44.51'), steel('plain', '續接器', '20'), steel('s4a', '#4鋼筋', '7.37'),
      steel('s10', '#10鋼筋', '30'), steel('s5', '#5鋼筋', '12.62'), steel('s4b', '#4鋼筋', '12.62'),
    ];
    draft.standaloneMaterialEntries[1].unit = '支';
    const before = structuredClone(draft);
    // 人工核算：7.37 + 12.62 = 19.99；19.99 + 12.62 + 30 + 44.51 = 107.12。
    expect(formatDailyReport(draft)).toContain('2.鋼筋-萬大禾：#4鋼筋19.99噸、#5鋼筋12.62噸、#10鋼筋30噸、#11鋼筋44.51噸、續接器20支，合計107.12噸。');
    expect(draft).toEqual(before);
  });

  it('規格欄數值排序，合併後保留各筆備註並隔離不同供應商與工種', () => {
    const draft = report([trade('t1', '安暉', 0), trade('t2', '土方', 1, { tradeTypeId: 'earth', tradeNameSnapshot: '土方工程' })]);
    const row = (id: string, specification: string, quantity: string, note = ''): MaterialEntry => ({ ...material(id, 't1', 0), itemName: '鋼筋', materialTypeSnapshot: '鋼筋', supplierNameSnapshot: '萬大禾', specification, quantity, unit: '噸', note });
    draft.standaloneMaterialEntries = [row('s10', '#10', '10'), row('s4a', '#4', '0.1', '上午'), row('s4b', '#4', '0.2', '下午'), { ...row('other', '#4', '5'), supplierNameSnapshot: '其他' }, { ...row('earth', '#4', '7'), connectedTradeSectionId: 't2' }];
    const output = formatDailyReport(draft);
    expect(output).toContain('2.鋼筋-萬大禾：鋼筋0.3噸，#4；上午；下午、鋼筋10噸，#10，合計10.3噸。\n3.鋼筋-其他：鋼筋5噸，#4。');
    expect(output).toContain('土方工程：\n1.土方2工-支撐施作。\n2.鋼筋-萬大禾：鋼筋7噸，#4。');
  });

  it('規格欄同為SD420時仍按品名鋼筋號數排序', () => {
    const draft = report();
    draft.standaloneMaterialEntries = [11, 5, 10, 4].map((size) => ({ ...material(`s${size}`, 't1', 0), materialTypeSnapshot: '鋼筋', supplierNameSnapshot: '萬大禾', itemName: `#${size}鋼筋`, specification: 'SD420', quantity: '1', unit: '噸' }));
    expect(formatDailyReport(draft)).toContain('鋼筋-萬大禾：#4鋼筋1噸，SD420、#5鋼筋1噸，SD420、#10鋼筋1噸，SD420、#11鋼筋1噸，SD420，合計4噸。');
  });

  it('無效數量可預覽、不併入有效同規格明細且不產生誤導合計', () => {
    const draft = report();
    draft.standaloneMaterialEntries = ['0.10', '錯誤', '0.20'].map((quantity, index) => ({ ...material(`m${index}`, 't1', index), itemName: '一般混凝土', quantity }));
    const output = formatDailyReport(draft);
    expect(output).toContain('混凝土-天誠：一般混凝土0.3方、一般混凝土錯誤方。');
    expect(output).not.toContain('合計');
  });

  it('混合單位各自合計，同單位只有一筆時不重複列合計', () => {
    const draft = report();
    const row = (id: string, unit: string, quantity: string): MaterialEntry => ({ ...material(id, 't1', 0), itemName: '材料', unit, quantity });
    draft.standaloneMaterialEntries = [row('a', '噸', '1.10'), row('b', '支', '20')];
    expect(formatDailyReport(draft)).toContain('混凝土-天誠：材料1.10噸、材料20支。');
    draft.standaloneMaterialEntries.push(row('c', '噸', '2.20'), row('d', '支', '30'));
    expect(formatDailyReport(draft)).toContain('混凝土-天誠：材料3.3噸、材料50支，合計3.3噸、50支。');
  });

  it('未連結獨立進料不輸出且阻止定稿，普通進料仍可輸出', () => {
    const draft = report();
    draft.standaloneMaterialEntries = [material('未連結', null, 0), { ...material('普通', null, 1), entryType: 'normal' }];
    expect(formatDailyReport(draft)).toContain('混凝土-天誠：普通2.5方。');
    expect(formatDailyReport(draft)).not.toContain('未連結');
    expect(validateDailyForFinalization(draft)).toContain('尚有未連結的獨立進料，請先連接至施工工種。');
  });

  it('相同工種的重複廠商保持預覽可見但阻止定稿', () => {
    const draft = report([trade('t1', '安暉', 0), trade('t2', '安暉', 1)]);
    expect(formatDailyReport(draft)).toContain('安全支撐工程：\n安暉2工-支撐施作。\n安暉2工-支撐施作。');
    expect(validateDailyForFinalization(draft)).toContain('同一工種不可有重複廠商施工卡，請整理後再定稿。');
  });

  it('施工異動後自動重新檢查完整性，UI 收合不影響資料', () => {
    Object.assign(globalThis, { window: { clearTimeout, setTimeout } });
    const controller = new DailyController(report());
    controller.toggle('t1');
    expect(controller.trade('t1')?.status).toBe('complete');
    controller.updateTradeOutputData('t1', (section) => { section.workItems[0].locationTextSnapshot = 'A區'; });
    expect(controller.trade('t1')?.status).toBe('complete');
  });
});
