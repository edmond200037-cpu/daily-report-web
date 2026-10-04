import { describe, expect, it } from 'vitest';
import { createTrade, createWorkItem } from '../../src/domain/daily';
import { sameWorkNames, workInputView, workSuggestions, clearWorkItemDetails } from '../../src/daily/work-input';
import type { NamedMemory } from '../../src/data/daily-repository';

describe('手機連續工項與同名提醒', () => {
  const trade = createTrade('水電', '甲公司', 0);
  const work = createWorkItem(0); work.taskTextSnapshot = '配管'; trade.workItems.push(work);
  it('比對既有工項與同批輸入，忽略空段和前後空白', () => {
    expect(sameWorkNames(trade, ' 配管 、、安裝、安裝')).toEqual(['配管', '安裝']);
    expect(sameWorkNames(trade, '澆置')).toEqual([]);
  });
  it('編輯本身不當成重複，不同位置的同名項仍給提醒但不修改資料', () => {
    expect(sameWorkNames(trade, '配管', work.id)).toEqual([]);
    const other = createWorkItem(1); other.taskTextSnapshot = '配管'; other.startFloorRaw = '3F';
    const differentFloor = { ...trade, workItems: [...trade.workItems, other] };
    expect(sameWorkNames(differentFloor, '配管', work.id)).toEqual(['配管']);
    expect(differentFloor.workItems).toHaveLength(2);
  });
  it('搜尋加入區在工項之前，提醒可由輔助工具讀取', () => {
    const html = workInputView(trade);
    expect(html.indexOf('data-continuous-work')).toBeLessThan(html.indexOf('data-inline-work'));
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-work-panel="location"');
    expect(html).toContain('class="work-token__tools" hidden');
  });
  it('新增推薦排除既有工項後再取六筆，待審核工項仍可選用', () => {
    const current = { ...trade, tradeTypeId: 'water' };
    const tasks = Array.from({ length: 8 }, (_, index) => ({ id: `task-${index}`, name: index === 0 ? '配管' : `工作${index}`, normalizedName: index === 0 ? '配管' : `工作${index}`, tradeTypeId: 'water', usageCount: 10 - index, status: 'candidate' } as NamedMemory));
    const other = { ...tasks[0], id: 'other', tradeTypeId: 'other', name: '其他', normalizedName: '其他' };
    expect(workSuggestions(current, [...tasks, other], '').map((row) => row.name)).toEqual(['工作1', '工作2', '工作3', '工作4', '工作5', '工作6']);
    expect(workSuggestions(current, tasks, '配管')).toEqual([]);
    expect(workSuggestions(current, tasks, '配管', true)).toEqual([tasks[0]]);
    expect(tasks).toHaveLength(8);
  });
  it('輪盤移除只清空位置、樓層與備註，保留工項與穩定 ID', () => {
    const item = createWorkItem(2);
    Object.assign(item, { taskTextSnapshot: '配管', taskId: 'task-1', startFloorRaw: '3F', endFloorRaw: '4F', locationId: 'location-1', locationTextSnapshot: '東側', note: '待確認' });
    const before = structuredClone(item);
    clearWorkItemDetails(item);
    expect(item).toEqual({ ...before, startFloorRaw: '', endFloorRaw: '', startFloorNormalized: null, endFloorNormalized: null, locationId: null, locationTextSnapshot: '', note: '' });
    clearWorkItemDetails(item);
    expect(item.taskTextSnapshot).toBe('配管');
    expect(item.id).toBe(before.id);
  });
});
