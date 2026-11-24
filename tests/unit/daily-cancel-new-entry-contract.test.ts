import { beforeEach, describe, expect, it } from 'vitest';
import {
  dailyState as state,
  resetDaily,
  fixtureTrade,
  renderTrade,
  renderDaily,
} from './helpers/react-daily';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');
beforeEach(resetDaily);
describe('React 新增取消契約', () => {
  it('搜尋新增與晶片新增都記錄目前條目的暫態識別', () => {
    const source = read('daily/react/DailyPage.tsx');
    expect(source.match(/justAddedEntry = \{ kind: 'trade', id: created.id \}/g)).toHaveLength(2);
    expect(
      read('daily/views/daily-entry.ts')
        .split('export function persistEntryDraft()')[1]
        .split('export function restoreEntryScope()')[0],
    ).not.toContain('justAddedEntry');
  });
  it('只在對應新增工程顯示取消入口', () => {
    const trade = fixtureTrade();
    state.daily.expandedId = trade.id;
    expect(renderTrade(trade)).not.toContain('取消新增');
    state.justAddedEntry = { kind: 'trade', id: trade.id };
    expect(renderTrade(trade)).toContain('取消新增');
    state.justAddedEntry = { kind: 'trade', id: 'other' };
    expect(renderTrade(trade)).not.toContain('取消新增');
  });
  it('取消沿用既有刪除與復原路徑且檢查唯讀與識別', () => {
    const source = read('daily/views/daily-events.ts')
      .split("if (action === 'cancel-new-entry') {")[1]
      .split('\n  }')[0];
    for (const value of [
      'isReadOnlySite()',
      'entry.id !== actionElement.dataset.id',
      'entry.kind !== actionElement.dataset.entryKind',
      'await deleteItemBySwipe(entry.kind, entry.id)',
    ])
      expect(source).toContain(value);
    expect(source).not.toMatch(/confirm\(|flush\(|update\(/);
  });
  it('聯絡新增與修改分別保留取消新增和放棄修改', () => {
    const source = read('daily/react/ContactRows.tsx');
    expect(source).toContain("editor.originalId ? '放棄修改' : '取消新增'");
    expect(source).toContain('action="cancel-contact"');
  });
  it('日期工地或路由改變會清除新增標記', () => {
    expect(read('daily/views/daily-entry.ts')).toContain('appState.justAddedEntry = null;');
    expect(read('main.ts')).toContain(
      "if (route.module !== 'daily' || route.page !== 'main') appState.justAddedEntry = null;",
    );
  });
  it('草稿編輯器可左滑取消，保存條目可刪除及復原', () => {
    expect(read('daily/views/daily-gestures.ts')).toContain('shouldDelete && draft');
    expect(read('daily/views/daily-gestures.ts')).toContain('discardContactEditor()');
    expect(renderDaily()).toContain('data-react-action="add-normal-material"');
  });
});
