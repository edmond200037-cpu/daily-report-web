import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { DailyController } from '../../src/daily/daily-controller';
import { createDailyDraft, createTrade, type DailyReportV3 } from '../../src/domain/daily';
import { deleteMemory, listMemories, loadDailyDraft, loadDailyDraftForDate, saveDailyDraft, saveMemory } from '../../src/data/daily-repository';
import { get, list, put } from '../../src/data/db.js';

vi.mock('../../src/config/runtime-config', () => ({ runtimeConfig: { mode: 'local' } }));

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', { setTimeout: vi.fn(() => 0), clearTimeout: vi.fn(), dispatchEvent: vi.fn() });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T01:00:00.000Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const reportFor = (date: string, names: string[]): DailyReportV3 => {
  const report = createDailyDraft(null, '測試工地', date);
  report.tradeSections = names.map((name, index) => createTrade(name, '', index));
  return report;
};
const tradeNames = (report: DailyReportV3 | undefined) => report?.tradeSections.map((row) => row.tradeNameSnapshot);
const partitionFor = (id: string, report: DailyReportV3, updatedAt = '2026-10-28T00:00:00.000Z') => ({ id, userId: null, siteId: null, reportDate: report.date, report, updatedAt });

describe('本機日報依日期隔離草稿', () => {
  it('10/28 存兩工種後，10/19 新增水電並 flush 不會跳日或混入其他日期內容', async () => {
    await saveDailyDraft(reportFor('2026-10-28', ['泥作', '鋼筋']));
    const editor = new DailyController(await loadDailyDraftForDate('2026-10-19') ?? reportFor('2026-10-19', []));
    vi.setSystemTime(new Date('2026-10-28T01:00:01.000Z'));
    editor.addTrade('水電');
    await editor.flush();

    expect(editor.report.date).toBe('2026-10-19');
    expect((await loadDailyDraft())?.date).toBe('2026-10-19');
    expect(tradeNames(await loadDailyDraftForDate('2026-10-19'))).toEqual(['水電']);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(['泥作', '鋼筋']);
  });

  it('舊 local 列可載入，編輯另一日期後仍逐欄保留原始列', async () => {
    const legacy = partitionFor('local', reportFor('2026-10-28', ['泥作', '鋼筋']));
    await put('draft_partitions', legacy);
    expect(tradeNames(await loadDailyDraft())).toEqual(['泥作', '鋼筋']);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(['泥作', '鋼筋']);
    const editor = new DailyController(reportFor('2026-10-19', []));
    editor.addTrade('水電'); await editor.flush();
    expect(tradeNames(await loadDailyDraft())).toEqual(['水電']);
    expect(await get('draft_partitions', 'local')).toEqual(legacy);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(['泥作', '鋼筋']);
  });

  it.each([true, false])('同日期 legacy 與日期分區並存時選最新版本（legacy 較新：%s）', async (legacyNewer) => {
    const older = '2026-10-28T00:00:00.000Z'; const newer = '2026-10-28T00:01:00.000Z';
    const legacy = partitionFor('local', reportFor('2026-10-28', ['舊格式']), legacyNewer ? newer : older);
    const dated = partitionFor('local:2026-10-28', reportFor('2026-10-28', ['日期格式']), legacyNewer ? older : newer);
    await put('draft_partitions', legacy); await put('draft_partitions', dated);
    const expected = legacyNewer ? ['舊格式'] : ['日期格式'];
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(expected);
    expect(tradeNames(await loadDailyDraft())).toEqual(expected);
    const baseline = (await loadDailyDraftForDate('2026-10-28'))!;
    const edited = structuredClone(baseline); edited.siteNameSnapshot = '編輯工地';
    await saveDailyDraft(edited, baseline);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(expected);
    expect(await get('draft_partitions', 'local')).toEqual(legacy);
  });

  it('同日期反覆 flush 僅保留一份日期分區', async () => {
    const editor = new DailyController(reportFor('2026-10-19', ['水電']));
    await editor.flush();
    editor.update(() => { editor.report.tradeSections[0].workerCount = '3'; }); await editor.flush();
    editor.update(() => { editor.report.siteNameSnapshot = '新工地'; }); await editor.flush();
    expect(await list('draft_partitions')).toHaveLength(1);
    expect(await get('draft_partitions', 'local:2026-10-19')).toMatchObject({ reportDate: '2026-10-19', report: { date: '2026-10-19', siteNameSnapshot: '新工地' } });
    expect((await loadDailyDraftForDate('2026-10-19'))?.tradeSections[0].workerCount).toBe('3');
  });

  it('既有分區 reportDate 不符時不得拿來合併編輯意圖', async () => {
    const wrongDate = partitionFor('local:2026-10-19', reportFor('2026-10-28', ['泥作']));
    await put('draft_partitions', wrongDate);
    const baseline = reportFor('2026-10-19', []); const edited = structuredClone(baseline);
    edited.tradeSections.push(createTrade('水電', '', 0));
    const saved = await saveDailyDraft(edited, baseline);
    expect(saved.date).toBe('2026-10-19'); expect(tradeNames(saved)).toEqual(['水電']);
  });

  it('saveMemory 改名只同步目前日期草稿，不改 legacy 或其他日期', async () => {
    await saveMemory('trades', '水電'); const memory = (await listMemories('trades'))[0];
    const legacyReport = reportFor('2026-10-28', ['水電']); legacyReport.tradeSections[0].tradeTypeId = memory.id;
    const legacy = partitionFor('local', legacyReport); await put('draft_partitions', legacy);
    const active = reportFor('2026-10-19', ['水電']); active.tradeSections[0].tradeTypeId = memory.id;
    await saveDailyDraft(active);
    await saveMemory('trades', '機電', undefined, memory.id);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-19'))).toEqual(['機電']);
    expect(tradeNames(await loadDailyDraft())).toEqual(['機電']);
    expect(await get('draft_partitions', 'local')).toEqual(legacy);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(['水電']);
    expect(await list('draft_partitions')).toHaveLength(2);
  });

  it('只有 legacy 草稿時，記憶改名建立同日期分區並完整保留 legacy 原始列', async () => {
    await saveMemory('trades', '水電'); const memory = (await listMemories('trades'))[0];
    const report = reportFor('2026-10-28', ['水電']); report.tradeSections[0].tradeTypeId = memory.id;
    const legacy = partitionFor('local', report); await put('draft_partitions', legacy);
    await saveMemory('trades', '機電', undefined, memory.id);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-28'))).toEqual(['機電']);
    expect(await get('draft_partitions', 'local')).toEqual(legacy);
    expect(await get('draft_partitions', 'local:2026-10-28')).toMatchObject({ reportDate: '2026-10-28', report: { date: '2026-10-28' } });
    expect(await list('draft_partitions')).toHaveLength(2);
  });

  it('記憶刪除依目前 live 草稿日期處理，不因另一日期 updatedAt 較新而改錯份', async () => {
    await saveMemory('trades', '水電'); const memory = (await listMemories('trades'))[0];
    const active = reportFor('2026-10-19', ['水電']); active.tradeSections[0].tradeTypeId = memory.id;
    const other = structuredClone(active); other.date = '2026-10-28';
    await put('draft_partitions', partitionFor('local:2026-10-19', active));
    const otherPartition = partitionFor('local:2026-10-28', other, '2026-10-28T00:01:00.000Z');
    await put('draft_partitions', otherPartition); await put('live_report_draft', active);
    const result = await deleteMemory('trades', memory.id);
    expect(result?.date).toBe('2026-10-19'); expect(tradeNames(result)).toEqual([]);
    expect(tradeNames(await loadDailyDraftForDate('2026-10-19'))).toEqual([]);
    expect(await get('draft_partitions', 'local:2026-10-28')).toEqual(otherPartition);
    expect(await list('draft_partitions')).toHaveLength(2);
  });
});
