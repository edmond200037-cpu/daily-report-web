// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
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
      candidate({ key: 'tasks:one', id: 'one', finalizedUsageCount: 1, lastUsedAt: '2026-08-20T10:00:00.000Z' }),
      candidate({ key: 'tasks:old-two', id: 'old-two', finalizedUsageCount: 2, lastUsedAt: '2026-08-18T10:00:00.000Z' }),
      candidate({ key: 'tasks:new-two', id: 'new-two', finalizedUsageCount: 2, lastUsedAt: '2026-08-19T10:00:00.000Z' }),
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

describe('記憶審核呈現契約', () => {
  const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
  it('沿用設定中心工作區骨架，提供全選全部、區內全選與條件式批次操作列', () => {
    expect(main).toContain('data-memory-group-toggle');
    expect(main).toContain('data-memory-select-group');
    expect(main).toContain('data-memory-select-all');
    expect(main).toContain('settings-work-area memory-review__group');
    expect(main).toContain('settings-work-area__toggle');
    expect(main).toContain('memory-review__action-bar');
    expect(css).toContain('.memory-review__action-bar { position: fixed;');
    expect(css).toContain('background: var(--daily-paper-raised);');
  });
  it('候選列顯示定稿進度並可按需展開詳細資料', () => {
    expect(main).toContain('data-memory-detail-toggle');
    expect(main).toContain('finalizedUsageCount');
    expect(css).toContain('.memory-candidate__detail');
    expect(main).toContain('class="memory-candidate__select"');
    expect(css).toContain('min-width: var(--daily-touch-target);');
  });
  it('寫入失敗保留選取並顯示繁體中文回饋', () => {
    expect(main).toContain('performMemoryReviewWrite');
    expect(main).toContain('選取內容已保留');
    expect(main).toContain("memoryReviewState.feedbackTone === 'error' ? 'alert' : 'status'");
    expect(css).toContain('.memory-review__feedback--error');
  });

  it('批次駁回會先揭露選取摘要，再要求第二次確認', () => {
    expect(main).toContain('已選 ${selected.length} 筆');
    expect(main).toContain('再次確認：駁回後無法還原');
  });
});
