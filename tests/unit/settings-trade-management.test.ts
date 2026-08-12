import { describe, expect, it } from 'vitest';
import { searchTradeManagement, settingsTradeSwipeRelease } from '../../src/settings/trade-management';
import type { NamedMemory } from '../../src/data/daily-repository';
const row = (id: string, name: string, tradeTypeId?: string): NamedMemory => ({ id, name, normalizedName: name.trim().toLowerCase(), usageCount: 0, lastUsedAt: null, createdAt: '', updatedAt: '', status: 'confirmed', tradeTypeId });
describe('工種管理搜尋與滑動', () => {
  const trades = [row('t1', '土方工程'), row('t2', '連續壁工程')]; const tasks = [row('w1', '開挖作業', 't1'), row('w2', '導牆施作', 't2')];
  it('以工種或子工項命中父工種，並正規化空白與英文大小寫', () => { expect(searchTradeManagement(trades, tasks, ' 導牆 ').map((item) => item.trade.id)).toEqual(['t2']); expect(searchTradeManagement([row('t3', 'Main   Site')], [], 'main site')).toHaveLength(1); });
  it('空搜尋保留全部工種', () => expect(searchTradeManagement(trades, tasks, '').map((item) => item.trade.id)).toEqual(['t1', 't2']));
  it('右滑與左滑達 88px 分別為編輯與刪除', () => { expect(settingsTradeSwipeRelease(88, false)).toBe('edit'); expect(settingsTradeSwipeRelease(-88, false)).toBe('delete'); });
  it('未達門檻或垂直滑動不執行操作', () => { expect(settingsTradeSwipeRelease(87, false)).toBeNull(); expect(settingsTradeSwipeRelease(-120, true)).toBeNull(); });
});
