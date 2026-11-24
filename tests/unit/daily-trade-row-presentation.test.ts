import { beforeEach, describe, expect, it } from 'vitest';
import {
  dailyState as state,
  resetDaily,
  renderDaily,
  fixtureTrade,
  renderTrade,
} from './helpers/react-daily';
import { createWorkItem } from '../../src/domain/daily';
import { readFileSync } from 'node:fs';
beforeEach(resetDaily);
describe('Astryx 工程資料列呈現', () => {
  it('摘要包含工種廠商人數代表工項與筆數', () => {
    const trade = fixtureTrade();
    const work = createWorkItem(1);
    work.taskTextSnapshot = '樓板模';
    trade.workItems.push(work);
    const html = renderTrade(trade);
    for (const text of ['模板工程', '大成營造', '12 人', '柱模組立', '另 1 項', '未完成'])
      expect(html).toContain(text);
  });
  it('已完成狀態使用資料齊全文字', () => {
    const trade = fixtureTrade();
    trade.status = 'complete';
    expect(renderTrade(trade)).toContain('資料齊全');
  });
  it('共用摘要左對齊、狀態居中，未完成僅有細警告線並保留無障礙展開控制', () => {
    const trade = fixtureTrade();
    const html = renderTrade(trade);
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toContain('border-inline-start:var(--border-width) solid var(--color-warning)');
    expect(html).toContain('justify-content:flex-start');
    const summary = readFileSync(new URL('../../src/daily/react/EntryRow.tsx', import.meta.url), 'utf8');
    expect(summary).toContain('interactiveRef={toggle}');
    expect(summary).toContain('align="center"');
    expect(summary).toContain('description={detail}');
    expect(summary).toContain('suppressTradeSummaryClick');
    state.daily.expandedId = trade.id;
    const expanded = renderTrade(trade);
    expect(expanded).toContain('aria-label="更多操作"');
    expect(expanded).toContain('<svg');
  });
  it('位置不進摘要，空白工項不計入筆數', () => {
    const trade = fixtureTrade();
    trade.workItems[0].locationTextSnapshot = '東側';
    trade.workItems.push(createWorkItem(1));
    const html = renderTrade(trade);
    expect(html).not.toContain('東側');
    expect(html).not.toContain('另 1 項');
  });
  it('只有一個工程編輯器展開，收合不改報告', () => {
    const trade = fixtureTrade();
    const before = JSON.stringify(state.daily.report);
    state.daily.toggle(trade.id);
    expect(renderTrade(trade)).toContain('搜尋或輸入下一個工項');
    state.daily.toggle(trade.id);
    expect(renderTrade(trade)).not.toContain('搜尋或輸入下一個工項');
    expect(JSON.stringify(state.daily.report)).toBe(before);
  });
  it('工項保留穩定識別與握把，文字編輯位置和備註各自獨立', () => {
    const trade = fixtureTrade();
    state.daily.expandedId = trade.id;
    const html = renderTrade(trade);
    expect(html).toContain(`data-work="${trade.workItems[0].id}"`);
    expect(html).toContain('data-work-gesture');
    expect(html).toContain('位置與樓層');
    expect(html).toContain('備註');
    expect(html).not.toContain('上移');
    expect(html).not.toContain('下移');
  });
  it('讀取確認記憶並依使用順序顯示常用晶片', () => {
    const memory = {
      id: 'a',
      name: '模板',
      normalizedName: '模板',
      usageCount: 2,
      lastUsedAt: '2026-11-23',
      status: 'confirmed',
    };
    state.dailyTrades = [
      memory,
      { ...memory, id: 'candidate', name: '待審核', status: 'candidate' },
    ] as typeof state.dailyTrades;
    const html = renderDaily();
    expect(html).toContain('data-trade-chip="a"');
    expect(html).not.toContain('data-trade-chip="candidate"');
  });
  it('唯讀時禁用寫入並保留展開入口', () => {
    const trade = fixtureTrade();
    state.daily.expandedId = trade.id;
    state.accountActiveSiteId = 'read-only-test';
    state.accountActiveSiteRole = 'viewer';
    const html = renderTrade(trade);
    expect(html).toContain('disabled');
    expect(html).toContain('aria-expanded="true"');
  });
});
