import { describe, expect, it } from 'vitest';
import { createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { nextTabIndex } from '../../src/daily/tab-navigation';
import { canRestoreDetails, snapshotDetails, workUndoScope } from '../../src/daily/work-detail-undo';
import { clearWorkItemDetails, workSuggestions, workInputView } from '../../src/daily/work-input';
import type { NamedMemory } from '../../src/data/daily-repository';

describe('日報介面安全契約', () => {
  it('同名獨立工項保留 ID，第一筆不能上移、最後一筆不能下移', () => {
    const trade = createTrade('水電', '甲', 0);
    const first = createWorkItem(0); const last = createWorkItem(1);
    first.taskTextSnapshot = last.taskTextSnapshot = '配管';
    trade.workItems.push(first, last);
    const original = structuredClone(trade);
    const markup = workInputView(trade);
    const rows = markup.split('data-sortable-work>').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('data-work-move="-1" disabled');
    expect(rows[0]).not.toContain('data-work-move="1" disabled');
    expect(rows[1]).toContain('data-work-move="1" disabled');
    expect(rows[1]).not.toContain('data-work-move="-1" disabled');
    expect(markup).toContain(`data-work="${first.id}"`);
    expect(markup).toContain(`data-work="${last.id}"`);
    expect(trade).toEqual(original);
  });
  it('頁籤方向鍵循環與首末定位，確認鍵不移動焦點', () => {
    expect(nextTabIndex('ArrowLeft', 0, 4)).toBe(3);
    expect(nextTabIndex('ArrowRight', 3, 4)).toBe(0);
    expect(nextTabIndex('Home', 2, 4)).toBe(0);
    expect(nextTabIndex('End', 0, 4)).toBe(3);
    expect(nextTabIndex('Enter', 0, 4)).toBeUndefined();
    expect(nextTabIndex('ArrowRight', 0, 0)).toBeUndefined();
  });
  it('依實際名稱去重，confirmed 優先，去重後取六筆且不變動來源', () => {
    const trade = createTrade('水電', '甲', 0, 'water');
    const memory = (id: string, name: string, usageCount: number, status = 'candidate') => ({ id, name, normalizedName: '過期名稱', tradeTypeId: 'water', usageCount, status } as NamedMemory);
    const tasks = [memory('duplicate', ' 配管 ', 99), memory('confirmed', '配管', 1, 'confirmed'), ...Array.from({ length: 7 }, (_, i) => memory(`item-${i}`, `工作${i}`, 8-i))];
    const original = structuredClone(tasks);
    const results = workSuggestions(trade, tasks, '');
    expect(results).toHaveLength(6);
    expect(new Set(results.map((row) => row.name.trim())).size).toBe(6);
    expect(workSuggestions(trade, tasks, '配管').map((row) => row.id)).toEqual(['confirmed']);
    expect(tasks).toEqual(original);
    const work = createWorkItem(0); work.taskTextSnapshot = '配管'; trade.workItems.push(work);
    expect(workSuggestions(trade, tasks, '配管')).toEqual([]);
    expect(workSuggestions(trade, tasks, '配管', true)).toHaveLength(1);
  });
  it('欄位復原只限同工地日期且欄位仍為清除值；保留其他內容', () => {
    const report = createDailyDraft('site-a', '測試', '2026-10-07');
    const trade = createTrade('水電', '甲', 0); const work = createWorkItem(0);
    Object.assign(work, { taskTextSnapshot: '配管', startFloorRaw: '3F', locationTextSnapshot: '東側', note: '待確認' });
    trade.workItems.push(work); report.tradeSections.push(trade);
    const before = snapshotDetails(work); clearWorkItemDetails(work);
    const undo = { scope: workUndoScope(report), tradeId: trade.id, workId: work.id, before, cleared: snapshotDetails(work) };
    expect(canRestoreDetails(undo, report)).toBe(true);
    work.taskTextSnapshot = '配管及測試';
    expect(canRestoreDetails(undo, report)).toBe(true);
    work.locationTextSnapshot = '西側';
    expect(canRestoreDetails(undo, report)).toBe(false);
    work.locationTextSnapshot = '';
    report.date = '2026-10-08'; expect(canRestoreDetails(undo, report)).toBe(false);
    report.date = '2026-10-07'; report.siteId = 'site-b'; expect(canRestoreDetails(undo, report)).toBe(false);
    report.siteId = 'site-a'; trade.workItems = []; expect(canRestoreDetails(undo, report)).toBe(false);
  });
});
