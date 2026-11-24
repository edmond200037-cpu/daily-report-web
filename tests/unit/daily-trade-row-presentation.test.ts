import { describe, expect, it } from 'vitest';
import { dailyMarkup } from './helpers/react-daily';
import { createTrade, createWorkItem } from '../../src/domain/daily';

const render = (expanded = false) => dailyMarkup((daily) => { const trade = createTrade('鋼筋', '甲公司', 0); trade.workItems.push(createWorkItem(0)); trade.workItems[0].taskTextSnapshot = '綁紮'; daily.report.tradeSections.push(trade); if (expanded) daily.expandedId = trade.id; });
describe('React 工程資料列呈現', () => {
 it('摘要保留工種廠商與完整性', () => { const html = render(); expect(html).toContain('鋼筋｜甲公司｜未完成'); });
 it('排序由 Astryx 握把承接', () => { const html = render(); expect(html).toContain('astryx-list'); expect(html).not.toContain('data-sortable-entry'); });
 it('附加欄位按需展開', () => { expect(render(true)).toContain('位置、樓層與備註'); });
 it('工項搜尋由 Typeahead 承接', () => { expect(render(true)).toContain('astryx-typeahead'); expect(render(true)).toContain('搜尋或輸入下一個工項'); });
 it('工項可直接編輯及刪除', () => { const html = render(true); expect(html).toContain('data-inline-work'); expect(html).toContain('刪除工項'); });
 it('資料列不建立卡片或舊手勢外框', () => { expect(render()).not.toContain('astryx-card'); expect(render()).not.toContain('trade-swipe'); });
});
