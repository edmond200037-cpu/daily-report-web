import { settingsMarkup, appState, memoryReviewState } from './helpers/react-settings';
import { MemoryReview } from '../../src/app/react-settings';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';
import { confirmationSelection, groupMemoryCandidates, memoryCandidateImpact, rejectionSelection } from '../../src/settings/memory-review';
import { createDailyDraft, createMaterialEntry, createTrade, createWorkItem } from '../../src/domain/daily';
import type { MemoryCandidate } from '../../src/data/daily-repository';

const candidate = (overrides: Partial<MemoryCandidate> = {}): MemoryCandidate => ({
  key: 'tasks:task-1', kind: 'tasks', id: 'task-1', name: '泥作修補', parentName: '泥作',
  parentKey: 'trades:trade-1', usageCount: 2, finalizedUsageCount: 2,
  lastUsedAt: '2026-08-20T08:00:00.000Z', ...overrides,
});

describe('記憶例外收件匣 workflow', () => {
  it('每個分區先排接近自動確認者，再排最近使用者', () => {
    const groups = groupMemoryCandidates([
      candidate({ key: 'tasks:one', id: 'one', usageCount: 1, lastUsedAt: '2026-08-20T10:00:00.000Z' }),
      candidate({ key: 'tasks:old-two', id: 'old-two', usageCount: 2, lastUsedAt: '2026-08-18T10:00:00.000Z' }),
      candidate({ key: 'tasks:new-two', id: 'new-two', usageCount: 2, lastUsedAt: '2026-08-19T10:00:00.000Z' }),
    ]);
    expect(groups[0].rows.map((row) => row.key)).toEqual(['tasks:new-two', 'tasks:old-two', 'tasks:one']);
    expect(groups[0].kind).toBe('tasks');
  });

  it('確認子候選時遞迴加入仍為候選的必要父層', () => {
    const rows = [
      candidate(),
      candidate({ key: 'trades:trade-1', kind: 'trades', id: 'trade-1', name: '泥作', parentName: undefined, parentKey: undefined }),
    ];
    expect(confirmationSelection(['tasks:task-1'], rows)).toEqual({ keys: ['tasks:task-1', 'trades:trade-1'], addedParentCount: 1 });
  });

  it('駁回父候選時將連動刪除的子候選納入批次摘要', () => {
    const rows = [
      candidate(),
      candidate({ key: 'vendors:vendor-1', kind: 'vendors', id: 'vendor-1', name: '甲公司' }),
      candidate({ key: 'trades:trade-1', kind: 'trades', id: 'trade-1', name: '泥作', parentName: undefined, parentKey: undefined }),
    ];
    expect(rejectionSelection(['trades:trade-1'], rows)).toEqual({ keys: ['trades:trade-1', 'tasks:task-1', 'vendors:vendor-1'], addedChildCount: 2 });
  });

  it('草稿影響同時涵蓋 id 關聯與尚未綁定 id 的同名快照', () => {
    const report = createDailyDraft();
    const trade = createTrade('泥作', '甲公司', 0, null, null);
    const work = createWorkItem(0); work.taskTextSnapshot = '泥作修補'; trade.workItems.push(work); report.tradeSections.push(trade);
    expect(memoryCandidateImpact(report, candidate({ kind: 'trades', key: 'trades:trade-1', id: 'trade-1', name: '泥作', parentKey: undefined, parentName: undefined }))).toBe(1);
    expect(memoryCandidateImpact(report, candidate())).toBe(1);
  });

  it('材料欄位影響限定於相同材料父層與欄位', () => {
    const report = createDailyDraft(); const entry = createMaterialEntry(0); entry.materialTypeSnapshot = '混凝土'; entry.itemName = '預拌混凝土'; report.standaloneMaterialEntries.push(entry);
    expect(memoryCandidateImpact(report, candidate({ key: 'material-items:item-1', kind: 'material-items', id: 'item-1', name: '預拌混凝土', parentName: '混凝土', parentKey: 'material-types:type-1', fieldType: 'itemName' }))).toBe(1);
  });
});

describe('React 記憶審核呈現契約', () => {
 const render = (selected = false, expanded = false) => settingsMarkup(MemoryReview, () => { appState.memoryCandidates = [candidate({ parentKey: undefined })]; memoryReviewState.openKind = 'tasks'; if (selected) memoryReviewState.explicitKeys.add('tasks:task-1'); if (expanded) memoryReviewState.expandedKeys.add('tasks:task-1'); });
 it('提供全選全部、全選本區與條件式批次操作', () => { const html = render(true); for (const text of ['全選全部', '全選本區', '批次操作']) expect(html).toContain(text); });
 it('顯示套用進度與按需展開明細', () => { const html = render(false, true); expect(html).toContain('2/4'); expect(html).toContain('目前草稿影響'); expect(html).toContain('data-memory-detail-toggle'); });
 it('寫入失敗保留選取與回饋', () => { const source = appSource(); expect(source).toContain('選取內容已保留'); const html = settingsMarkup(MemoryReview, () => { memoryReviewState.feedback = '確認失敗，選取內容已保留'; memoryReviewState.feedbackTone = 'error'; }); expect(html).toContain('role="alert"'); expect(html).toContain('確認失敗'); });
 it('批次駁回揭露摘要並保留二次確認', () => { expect(render(true)).toContain('已選 1 筆'); expect(appSource()).toContain('再次確認：駁回後無法還原'); });
});
