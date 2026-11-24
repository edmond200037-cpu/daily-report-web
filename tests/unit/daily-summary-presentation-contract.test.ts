import { beforeEach, describe, expect, it } from 'vitest';
import {
  dailyState as state,
  resetDaily,
  renderDaily,
  fixtureTrade,
  renderTrade,
} from './helpers/react-daily';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
beforeEach(resetDaily);
describe('React 日報摘要與互動契約', () => {
  it('四類條目依序使用 List 資料列而非卡片', () => {
    const src =
      read('src/daily/react/DailyPage.tsx') +
      read('src/daily/react/MaterialRows.tsx') +
      read('src/daily/react/ContactRows.tsx') +
      read('src/daily/react/TradeRow.tsx');
    expect(src).toContain('ListItem');
    expect(src).not.toMatch(/<Card|<div|<span/);
    for (const kind of ['trade', 'material', 'contact', 'special'])
      expect(renderDaily()).toContain(`data-daily-section="${kind}"`);
  });
  it('人數摘要只接受通過驗證的整數，輸入器提供無鍵盤加減', () => {
    const trade = fixtureTrade();
    state.daily.expandedId = trade.id;
    const html = renderTrade(trade);
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('增加人數');
    expect(html).toContain('減少人數');
    expect(read('src/daily/react/TradeRow.tsx')).toContain(
      'validateWorkerCount(trade.workerCount)',
    );
  });
  it('摘要長文字由元件換行，不注入 nowrap 固定尺寸', () => {
    const trade = fixtureTrade();
    trade.workItems[0].taskTextSnapshot = '長工項'.repeat(200);
    expect(renderTrade(trade)).toContain('長工項');
    expect(read('src/daily/react/TradeRow.tsx')).not.toContain('whiteSpace');
  });
  it('只有 UI 展開時渲染編輯欄位，狀態文字不更改領域狀態', () => {
    const trade = fixtureTrade();
    expect(renderTrade(trade)).toContain('未完成');
    expect(trade.status).toBe('draft');
    expect(renderTrade(trade)).not.toContain('搜尋或輸入下一個工項');
    state.daily.expandedId = trade.id;
    expect(renderTrade(trade)).toContain('搜尋或輸入下一個工項');
  });
  it('預覽採官方 formatter 並有底部面板與定稿檢查', () => {
    const src = read('src/daily/react/DailyPage.tsx');
    expect(src).toContain('BottomSheet');
    expect(src).toContain('validateDailyForFinalization(report)');
    expect(src).toContain('formatDailyReport(report)');
    expect(src).toContain('action="finalize"');
    expect(src).toContain('action="copy"');
  });
  it('排序使用既有拖曳意圖插槽與自動捲動，沒有新儲存路徑', () => {
    const src = read('src/daily/views/daily-gestures.ts');
    for (const name of [
      'dragIntent',
      'resolveDropSlotIndex',
      'scrollDragEdge',
      'positionDragPreview',
      '400',
      'reorderWorkItems',
      'apply(original, false)',
    ])
      expect(src).toContain(name);
    expect(read('src/daily/react/TradeRow.tsx')).toContain('data-sortable-work');
  });
  it('左滑使用72門檻純邏輯與六秒復原', () => {
    const src = read('src/daily/views/daily-gestures.ts');
    expect(src).toContain(
      'swipeDeletes(event.clientX - tradeSwipe.startX, event.clientY - tradeSwipe.startY)',
    );
    expect(src).toContain('Date.now() + 6000');
    expect(read('src/daily/work-gestures.ts')).toContain('dx <= -72');
  });
  it('未提交工項和組字為暫態，Enter 有組字與229防護', () => {
    const src = read('src/daily/react/TradeRow.tsx');
    expect(src).toContain('workComposerDrafts');
    expect(src).toContain('event.nativeEvent.isComposing');
    expect(src).toContain('event.keyCode !== 229');
    expect(src).toContain('sameWorkNames(trade, query)');
    expect(src).toContain('splitWorkInput(text, true)');
  });
});
