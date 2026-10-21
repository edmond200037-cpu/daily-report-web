import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { splitWorkInput, refreshCompleteness, mergeEditorIntent } from '../../src/daily/input-workflow';
import { recordMemoryApplications } from '../../src/settings/memory-applications';
import { get, list, put } from '../../src/data/db.js';
import { saveDailyDraft, listRecentFinalizedReports } from '../../src/data/daily-repository';
import { restoreActiveMemoryPartition } from '../../src/data/memory-partition';
import type { SharedScope } from '../../src/domain/shared';

const context = vi.hoisted(() => ({ scope: null as SharedScope | null }));
vi.mock('../../src/sync/context', () => ({ loadActiveSharedScope: async () => context.scope }));
const makeReport = () => {
  const report = createDailyDraft(null, '測試工地', '2026-09-30');
  const trade = createTrade('水電', '甲公司', 0); trade.workerCount = '2';
  const work = createWorkItem(0); work.taskTextSnapshot = '配管'; work.note = '保留備註';
  trade.workItems.push(work); report.tradeSections.push(trade); refreshCompleteness(report);
  return report;
};
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('window', { dispatchEvent: vi.fn() }); context.scope = { userId: 'user-a', siteId: 'site-a' }; });
afterEach(() => vi.unstubAllGlobals());

describe('連續工項與自動完整性', () => {
  it('多個頓號、空段與尚未完成的尾端文字正確分離', () => {
    expect(splitWorkInput('配管、、設備安裝、線路')).toEqual({ committed: ['配管', '設備安裝'], remainder: '線路' });
    expect(splitWorkInput('配管、設備安裝', true)).toEqual({ committed: ['配管', '設備安裝'], remainder: '' });
  });
  it('填齊即完整，清空人數立即回報不完整，改備註不需再次確認', () => {
    const report = makeReport(); expect(report.tradeSections[0].status).toBe('complete');
    report.tradeSections[0].workerCount = ''; refreshCompleteness(report); expect(report.tradeSections[0].status).toBe('draft');
    report.tradeSections[0].workerCount = '3'; report.tradeSections[0].workItems[0].note = '更改備註'; refreshCompleteness(report); expect(report.tradeSections[0].status).toBe('complete');
  });
  it('本機改工項文字時保留遠端人數、工項 ID、位置與備註', () => {
    const baseline = makeReport(); const latest = structuredClone(baseline); const edited = structuredClone(baseline);
    latest.tradeSections[0].workerCount = '5'; edited.tradeSections[0].workItems[0].taskTextSnapshot = '新配管';
    const merged = mergeEditorIntent(latest, baseline, edited);
    expect(merged.tradeSections[0].workerCount).toBe('5');
    expect(merged.tradeSections[0].workItems[0]).toMatchObject({ id: baseline.tradeSections[0].workItems[0].id, taskTextSnapshot: '新配管', note: '保留備註' });
  });
});

describe('IndexedDB 整合：意圖保存與記憶套用', () => {
  it('保存舊畫面的其他欄位不產生覆蓋遠端人數的 patch', async () => {
    const baseline = await saveDailyDraft(makeReport());
    const remote = structuredClone(baseline); remote.tradeSections[0].workerCount = '5';
    await put('draft_partitions', { id: `user-a:site-a:${remote.date}`, userId: 'user-a', siteId: 'site-a', reportDate: remote.date, report: remote });
    const edited = structuredClone(baseline); edited.siteNameSnapshot = '新工地名稱';
    const saved = await saveDailyDraft(edited, baseline);
    expect(saved.tradeSections[0].workerCount).toBe('5');
    const queue = await list('sync_outbox') as Array<{ payload: { changes: Array<{ field?: string; value?: string }> } }>;
    expect(queue.at(-1)?.payload.changes.some((change) => change.field === 'workerCount')).toBe(false);
  });
  it('同一套用重送不加次數；第 4 筆不同工項套用後自動晉升', async () => {
    const report = makeReport();
    await recordMemoryApplications(report); await recordMemoryApplications(report);
    let rows = await list('trade_tasks') as Array<{ id: string; status: string; usageCount: number }>;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ status: 'candidate', usageCount: 1 });
    for (let i = 0; i < 3; i++) { const work = createWorkItem(i + 1); work.taskTextSnapshot = '配管'; report.tradeSections[0].workItems.push(work); await recordMemoryApplications(report); }
    rows = await list('trade_tasks') as typeof rows;
    expect(rows[0]).toMatchObject({ status: 'confirmed', usageCount: 4 });
    const queue = await list('sync_outbox') as Array<{ entityId: string; payload: { learning_key: string; learning_delta: { usage: number } } }>;
    const taskEvents = queue.filter((row) => row.entityId === rows[0].id);
    expect(taskEvents).toHaveLength(4); expect(new Set(taskEvents.map((row) => row.payload.learning_key)).size).toBe(4);
    expect(taskEvents.every((row) => row.payload.learning_delta.usage === 1)).toBe(true);
  });
  it('待審核同步進 outbox，切換工地會載入各自記憶', async () => {
    await recordMemoryApplications(makeReport());
    context.scope = { userId: 'user-a', siteId: 'site-b' }; await restoreActiveMemoryPartition();
    expect(await list('trade_tasks')).toHaveLength(0);
    const other = makeReport(); other.tradeSections[0].workItems[0].taskTextSnapshot = '澆置'; await recordMemoryApplications(other);
    context.scope = { userId: 'user-a', siteId: 'site-a' }; await restoreActiveMemoryPartition();
    expect((await list('trade_tasks') as Array<{ name: string }>).map((row) => row.name)).toEqual(['配管']);
    const partition = await get('memory_partitions', 'user-a:site-b') as { payload: { stores: Record<string, unknown[]> } };
    expect(partition.payload.stores.trade_tasks).toHaveLength(1);
  });
  it('舊工地的日報在切換後不得被重新標記成新工地', async () => {
    const report = await saveDailyDraft(makeReport()); context.scope = { userId: 'user-a', siteId: 'site-b' };
    await expect(saveDailyDraft(report)).rejects.toThrow('工地已切換');
    expect(await get('draft_partitions', `user-a:site-b:${report.date}`)).toBeUndefined();
  });
  it('歷史依工地過濾，登出後不展示共用工地定稿', async () => {
    const report = makeReport(); const finalizedAt = new Date().toISOString();
    await put('daily_reports', { ...report, id: 'a', finalizedAt, shared: { userId: 'user-a', siteId: 'site-a' } });
    await put('daily_reports', { ...report, id: 'b', finalizedAt, shared: { userId: 'user-a', siteId: 'site-b' } });
    expect((await listRecentFinalizedReports()).map((row) => row.id)).toEqual(['a']);
    context.scope = null; expect(await listRecentFinalizedReports()).toHaveLength(0);
  });
});
