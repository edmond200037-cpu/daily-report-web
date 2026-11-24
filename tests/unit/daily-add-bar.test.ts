import { describe, expect, it } from 'vitest';
import { dailyMarkup } from './helpers/react-daily';
describe('React 日報區段新增入口', () => {
 it('空白日報保留四區入口', () => { expect((dailyMarkup().match(/class="astryx-heading/g) ?? []).length).toBeGreaterThanOrEqual(4); });
 it('施工與進料新增順序不變', () => { const html = dailyMarkup(); expect(html.indexOf('新增施工紀錄')).toBeLessThan(html.indexOf('新增進料')); });
 it('聯絡與特殊事項維持獨立新增', () => { const html = dailyMarkup(); expect(html).toContain('data-daily-action="add-contact"'); expect(html).toContain('data-daily-action="add-special"'); });
});
