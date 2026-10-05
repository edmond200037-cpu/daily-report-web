import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NamedMemory } from '../../src/data/daily-repository';
import { tradePickerChoices } from '../../src/daily/trade-picker';
import { DailyController } from '../../src/daily/daily-controller';
import { duplicateVendorTradeIds, groupOutputTrades } from '../../src/daily/daily-output-model';

const memory = (id: string, name: string, status: NamedMemory['status'] = 'confirmed'): NamedMemory => ({
  id, name, normalizedName: name, status, usageCount: 1, finalizedUsageCount: 0,
  lastUsedAt: null, createdAt: '', updatedAt: '',
});

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('工種選項與施工紀錄分開處理', () => {
  it('同名記憶只顯示一次，以顯示名稱正規化，保留不同工種及原始資料', () => {
    const trades = [memory('a', '鷹架工程'), memory('b', ' 鷹架工程 ', 'candidate'), memory('c', '植筋工程'), memory('d', '植筋工程')];
    trades[1].normalizedName = '過期搜尋欄位';
    const before = structuredClone(trades);
    expect(tradePickerChoices(trades, '').map((row) => row.name)).toEqual(['鷹架工程', '植筋工程']);
    expect(tradePickerChoices(trades, ' 植筋 ')).toHaveLength(1);
    expect(tradePickerChoices(trades, '鷹架工程')[0].id).toBe('a');
    expect(trades).toEqual(before);
    expect(tradePickerChoices([...trades].reverse(), '')).toEqual(tradePickerChoices(trades, ''));
  });

  it('同工種再次新增開啟獨立紀錄，填不同廠商後可共同輸出', () => {
    vi.useFakeTimers(); vi.stubGlobal('window', { setTimeout, clearTimeout });
    const daily = new DailyController();
    const first = daily.addTradeEntry('植筋工程', 'trade', { id: 'vendor-a', name: '甲廠商' });
    const next = daily.addTradeEntry('植筋工程', 'trade', { id: 'vendor-a', name: '甲廠商' });
    const third = daily.addTradeEntry('植筋工程', 'trade');
    expect(new Set([first.id, next.id, third.id]).size).toBe(3);
    expect(next).toMatchObject({ vendorId: null, vendorNameSnapshot: '', workerCount: '', workItems: [] });
    expect(daily.expandedId).toBe(third.id);
    daily.changeVendor(next.id, '乙廠商', 'vendor-b');
    expect(first.vendorNameSnapshot).toBe('甲廠商');
    expect(duplicateVendorTradeIds(daily.report).size).toBe(0);
    expect(groupOutputTrades(daily.report, false)[0].sections).toHaveLength(3);
  });
});
