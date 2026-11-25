import { describe, expect, it } from 'vitest';
import { dailyMarkup } from './helpers/react-daily';
import { startMaterialEditor } from '../../src/daily/views/material-view';
import { appState } from '../../src/app/state';

import {
  createTrade,
  createWorkItem,
  createMaterialEntry,
  createSpecial,
} from '../../src/domain/daily';

describe('React 日報資料列契約', () => {
  it('施工資料使用 List 而非卡片', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('鋼筋', '甲廠商', 0));
    });
    expect(html).toContain('astryx-list-item');
    expect(html).not.toContain('astryx-card');
  });
  it('施工摘要包含工種及廠商', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('鋼筋', '甲廠商', 0));
    });
    expect(html).toContain('鋼筋｜甲廠商');
  });
  it('空廠商顯示待填提示', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('鋼筋', '', 0));
    });
    expect(html).toContain('待填廠商');
  });
  it('完整性狀態由資料呈現', () => {
    const html = dailyMarkup((daily) => {
      const trade = createTrade('鋼筋', '甲', 0);
      trade.status = 'complete';
      daily.report.tradeSections.push(trade);
    });
    expect(html).toContain('資料齊全');
  });
  it('未完成狀態使用繁體文字', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('鋼筋', '甲', 0));
    });
    expect(html).toContain('未完成');
  });
  it('展開施工編輯器包含廠商及人數', () => {
    const html = dailyMarkup((daily) => {
      const trade = createTrade('鋼筋', '甲', 0);
      daily.report.tradeSections.push(trade);
      daily.expandedId = trade.id;
    });
    expect(html).toContain('data-daily-field="workerCount"');
    expect(html).toContain('data-daily-field="vendorNameSnapshot"');
  });
  it('展開編輯器使用 Typeahead 工項新增列', () => {
    const html = dailyMarkup((daily) => {
      const trade = createTrade('鋼筋', '甲', 0);
      daily.report.tradeSections.push(trade);
      daily.expandedId = trade.id;
    });
    expect(html).toContain('搜尋或輸入下一個工項');
    expect(html).toContain('astryx-typeahead');
  });
  it('已加入工項保留穩定 id 與編輯入口', () => {
    let id = '';
    const html = dailyMarkup((daily) => {
      const trade = createTrade('鋼筋', '甲', 0);
      const work = createWorkItem(0);
      id = work.id;
      work.taskTextSnapshot = '綁紮';
      trade.workItems.push(work);
      daily.report.tradeSections.push(trade);
      daily.expandedId = trade.id;
    });
    expect(html).toContain(`data-inline-work="${id}"`);
    expect(html).toContain('工項選項');
  });
  it('進料使用 Selector 表達單一連接', () => {
    const html = dailyMarkup((daily) => {
      const entry = createMaterialEntry(0, 'independent');
      daily.report.standaloneMaterialEntries.push(entry);
      startMaterialEditor('independent', entry);
    });
    expect(html).toContain('連接工種');
    expect(html).toContain('不連接');
    expect(html).toContain('astryx-selector');
  });
  it('進料編輯 Sheet 兩欄並排，備註預設收合', () => {
    const html = dailyMarkup(() => {
      startMaterialEditor('normal');
    });
    expect(html).toContain('data-material-editor=');
    expect(html).toContain('data-columns="2"');
    expect(html).toContain('＋加備註');
    expect(html).not.toContain('進料備註');
    expect(html).not.toContain('刪除進料');
  });
  it('進料已有備註時預設展開，編輯既有進料才有刪除', () => {
    const html = dailyMarkup((daily) => {
      const entry = createMaterialEntry(0, 'independent');
      entry.note = '備註內容';
      daily.report.standaloneMaterialEntries.push(entry);
      startMaterialEditor('independent', entry);
    });
    expect(html).toContain('進料備註');
    expect(html).not.toContain('＋加備註');
    expect(html).toContain('刪除進料');
  });
  it('沒有編輯狀態時不渲染任何 Sheet 內容，開關不改草稿', () => {
    const html = dailyMarkup((daily) => {
      daily.report.tradeSections.push(createTrade('鋼筋', '甲', 0));
    });
    expect(html).not.toContain('data-trade-editor=');
    expect(html).not.toContain('data-material-editor=');
  });
  it('特殊事項列顯示內容，編輯時以文字輸入開啟 Sheet', () => {
    const html = dailyMarkup((daily) => {
      const item = createSpecial(0);
      item.content = '下雨停工';
      daily.report.specialItems.push(item);
      appState.justAddedEntry = { kind: 'special', id: item.id };
    });
    expect(html).toContain('下雨停工');
    expect(html).toContain('textarea');
  });
  it('工項具備明確刪除按鈕及排序握把', () => {
    const html = dailyMarkup((daily) => {
      const trade = createTrade('鋼筋', '甲', 0);
      trade.workItems.push(createWorkItem(0));
      daily.report.tradeSections.push(trade);
      daily.expandedId = trade.id;
    });
    expect(html).toContain('工項選項');
    expect(html).toMatch(/reorder/i);
  });
});
