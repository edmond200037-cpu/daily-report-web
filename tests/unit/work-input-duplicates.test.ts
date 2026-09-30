import { describe, expect, it } from 'vitest';
import { createTrade, createWorkItem } from '../../src/domain/daily';
import { sameWorkNames, workInputView } from '../../src/daily/work-input';

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
  });
});
