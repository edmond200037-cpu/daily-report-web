import { beforeEach, describe, expect, it } from 'vitest';
import {
  dailyState as appState,
  resetDaily,
  renderDaily,
  fixtureTrade,
  renderTrade,
} from './helpers/react-daily';
beforeEach(resetDaily);
describe('React 日報資料列', () => {
  it('以穩定識別顯示工種廠商人數代表工項與未完成狀態', () => {
    const trade = fixtureTrade();
    const html = renderTrade(trade);
    expect(html).toContain(trade.id);
    expect(html).toContain('模板工程');
    expect(html).toContain('大成營造');
    expect(html).toContain('12 人');
    expect(html).toContain('柱模組立');
    expect(html).toContain('未完成');
  });
  it('依固定順序保留四個區段與五個操作', () => {
    const html = renderDaily();
    for (const label of ['施工紀錄', '進料', '聯絡事項', '特殊事項'])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html.indexOf('data-daily-section="trade"')).toBeLessThan(
      html.indexOf('data-daily-section="material"'),
    );
    for (const action of [
      'add-trade',
      'add-normal-material',
      'add-contact',
      'add-special',
      'toggle-preview',
    ])
      expect(html).toContain(`data-react-action="${action}"`);
  });
  it('日期工地面板預設不渲染，開關不改草稿', () => {
    const before = JSON.stringify(appState.daily.report);
    expect(renderDaily()).not.toContain('id="daily-basics-panel"');
    appState.dailyBasicsExpanded = true;
    expect(renderDaily()).toContain('id="daily-basics-panel"');
    expect(JSON.stringify(appState.daily.report)).toBe(before);
  });
});
