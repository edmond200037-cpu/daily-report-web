import { describe, expect, it } from 'vitest';
import { dailyMarkup, reviewMarkup } from './helpers/react-daily';
import { createTrade } from '../../src/domain/daily';

describe('React 日報表單基礎', () => {
 it('四個輸入區使用統一元件', () => { expect((dailyMarkup().match(/class="astryx-heading/g) ?? []).length).toBeGreaterThanOrEqual(4); });
 it('控制採大型尺寸，實際觸控尺寸由瀏覽器驗證', () => { expect(dailyMarkup()).toContain('data-size="lg"'); });
 it('資料以 List 呈現', () => { expect(dailyMarkup()).toContain('astryx-list'); expect(dailyMarkup()).not.toContain('astryx-card'); });
 it('主要新增控制有繁體中文標籤', () => { for (const text of ['新增施工紀錄', '新增進料', '新增聯絡事項', '新增特殊事項']) expect(dailyMarkup()).toContain(text); });
 it('使用者文字由 React 跳脫', () => { const html = dailyMarkup((daily) => daily.report.tradeSections.push(createTrade('<script>測試</script>', '甲', 0))); expect(html).toContain('&lt;script&gt;測試&lt;/script&gt;'); expect(html).not.toContain('<script>測試'); });
 it('主操作集中於 BottomSheet 入口', () => { expect(reviewMarkup()).toContain('檢查與預覽'); expect(reviewMarkup()).toContain('定稿並複製'); });
});
