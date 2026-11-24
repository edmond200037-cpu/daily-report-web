import { describe, expect, it } from 'vitest';
import { dailyMarkup } from './helpers/react-daily';
import { appState } from '../../src/app/state';
import {
  createTrade,
  createMaterialEntry,
  createSpecial,
} from '../../src/domain/daily';

describe('React 新增及刪除入口契約', () => {
  it('空畫面保留四種新增入口', () => {
    const html = dailyMarkup();
    expect((html.match(/data-daily-action="add-/g) ?? []).length).toBe(4);
  });
  it('施工列不顯示取消新增，以刪除入口取代', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('測試', '', 0));
    });
    expect(html).toContain('刪除施工紀錄');
    expect(html).not.toContain('取消新增');
  });
  it('只有目前新增特殊事項顯示取消', () => {
    const html = dailyMarkup((daily) => {
      const item = createSpecial(0);
      daily.report.specialItems.push(item);
      appState.justAddedEntry = { kind: 'special', id: item.id };
    });
    expect(html).toContain('data-daily-action="cancel-new-entry"');
  });
  it('沒有暫態標記時不顯示特殊事項取消', () => {
    const html = dailyMarkup((daily) => {
      daily.report.specialItems.push(createSpecial(0));
      appState.justAddedEntry = null;
    });
    expect(html).not.toContain('cancel-new-entry');
  });
  it('特殊事項保留明確刪除入口', () => {
    const html = dailyMarkup((daily) => {
      daily.report.specialItems.push(createSpecial(0));
    });
    expect(html).toContain('刪除特殊事項');
  });
  it('進料保留明確刪除入口', () => {
    const html = dailyMarkup((daily) => {
      daily.report.standaloneMaterialEntries.push(createMaterialEntry(0));
    });
    expect(html).toContain('刪除進料');
  });
  it('已儲存進料與新增表單分開', () => {
    const html = dailyMarkup((daily) => {
      daily.report.standaloneMaterialEntries.push(createMaterialEntry(0));
    });
    expect(html).toContain('data-material=');
    expect(html).not.toContain('data-material-editor=');
  });
  it('排序識別來自穩定工種 id', () => {
    let id = '';
    const html = dailyMarkup((daily) => {
      const trade = createTrade('測試', '', 0);
      id = trade.id;
      daily.report.tradeSections.push(trade);
    });
    expect(html).toContain(`data-trade="${id}"`);
    expect(html).toContain('astryx-list-item');
  });
  it('使用者文字由 React 跳脫', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('<script>', '&廠商', 0));
    });
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
