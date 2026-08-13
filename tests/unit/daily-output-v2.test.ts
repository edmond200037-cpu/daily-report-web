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

  it('相同工種多廠商合併成一個標題，進料以施工卡順序編號', () => {
    const draft = report([trade('t1', '安暉', 0), trade('t2', '永盛', 2), trade('t3', '土方', 1, { tradeTypeId: 'earth', tradeNameSnapshot: '土方工程' })]);
    draft.standaloneMaterialEntries = [material('鋼筋', 't2', 0), material('混凝土', 't1', 9)];
    const output = formatDailyReport(draft);
    expect(output).toContain('安全支撐工程：\n1.安暉2工-支撐施作。\n  永盛2工-支撐施作。\n2.混凝土-天誠：混凝土2.5方。\n3.混凝土-天誠：鋼筋2.5方。');
    expect(output.indexOf('安全支撐工程：')).toBeLessThan(output.indexOf('土方工程：'));
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

  it('實際施工輸出異動會讓完成施工卡退回草稿，UI 收合不會', () => {
    Object.assign(globalThis, { window: { clearTimeout, setTimeout } });
    const controller = new DailyController(report());
    controller.toggle('t1');
    expect(controller.trade('t1')?.status).toBe('complete');
    controller.updateTradeOutputData('t1', (section) => { section.workItems[0].locationTextSnapshot = 'A區'; });
    expect(controller.trade('t1')?.status).toBe('draft');
  });
});
