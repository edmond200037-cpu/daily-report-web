import { settingsMarkup, settingsState, appState } from './helpers/react-settings';
import { dailyMarkup } from './helpers/react-daily';
import { MasterSettings } from '../../src/app/react-settings';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase } from '../../src/data/db.js';
import { createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { saveLocationMemory, listMemories, exportMemories, mergeMemoryBackup, finalizeDailyReport } from '../../src/data/daily-repository';
import { applyLocationMemory } from '../../src/daily/floor';


beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn(), dispatchEvent: vi.fn() }); vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('位置記憶手動樓層', () => {
  it('存位置帶樓層並讀回（正規化字串）', async () => {
    (await openDatabase()).close();
    await saveLocationMemory('東側', '3f', '5');
    expect((await listMemories('locations'))[0]).toMatchObject({ name: '東側', startFloorRaw: '3FL', endFloorRaw: '5FL' });
  });
  it('樓層格式錯誤拒絕、起訖顛倒自動交換', async () => {
    (await openDatabase()).close();
    await expect(saveLocationMemory('東側', '三樓', '')).rejects.toThrow('樓層格式不正確');
    await saveLocationMemory('西側', '5F', 'B1');
    expect((await listMemories('locations'))[0]).toMatchObject({ startFloorRaw: 'B1F', endFloorRaw: '5FL' });
  });
  it('改名保留樓層；定稿記憶提交後手動樓層仍在；備份匯出再匯入仍在', async () => {
    (await openDatabase()).close();
    await saveLocationMemory('東側', '3F', '5F');
    const id = (await listMemories('locations'))[0].id;
    await saveLocationMemory('東棟', '3F', '5F', id);
    const report = createDailyDraft('2026-10-28'); const trade = createTrade('鋼筋', '甲', 0); const work = createWorkItem(0); work.taskTextSnapshot = '綁筋'; work.locationTextSnapshot = '東棟'; trade.workItems.push(work); report.tradeSections.push(trade);
    await finalizeDailyReport(report, '定稿文字');
    expect((await listMemories('locations'))[0]).toMatchObject({ id, name: '東棟', startFloorRaw: '3FL', endFloorRaw: '5FL' });
    const backup = await exportMemories();
    expect((backup.data.location_memories as Array<{ startFloorRaw?: string }>)[0].startFloorRaw).toBe('3FL');
    vi.stubGlobal('indexedDB', new IDBFactory()); (await openDatabase()).close();
    await mergeMemoryBackup(JSON.parse(JSON.stringify(backup)));
    expect((await listMemories('locations'))[0]).toMatchObject({ name: '東棟', startFloorRaw: '3FL', endFloorRaw: '5FL' });
  });
});

describe('日報選定位置帶入樓層', () => {
  const memory = { id: 'l1', name: '東側', startFloorRaw: '3FL', endFloorRaw: '5FL' };
  it('樓層空白才帶入，已有樓層不覆蓋', () => {
    const blank = createWorkItem(0); applyLocationMemory(blank, memory);
    expect(blank).toMatchObject({ locationId: 'l1', locationTextSnapshot: '東側', startFloorRaw: '3FL', startFloorNormalized: '3FL', endFloorRaw: '5FL', endFloorNormalized: '5FL' });
    const filled = createWorkItem(0); filled.startFloorRaw = '8FL'; filled.startFloorNormalized = '8FL'; applyLocationMemory(filled, memory);
    expect(filled).toMatchObject({ locationId: 'l1', startFloorRaw: '8FL', endFloorRaw: '' });
  });
  it('不符合任何記憶時解除連結並保留輸入', () => {
    const work = createWorkItem(0); work.locationId = 'l1'; work.locationTextSnapshot = '自訂'; applyLocationMemory(work, undefined);
    expect(work).toMatchObject({ locationId: null, locationTextSnapshot: '自訂' });
  });
  it('位置設定以 React 跳脫使用者字串', () => {
    const html = settingsMarkup(MasterSettings, () => { settingsState.activeSection = 'locations'; appState.settingsRows = [{ id: 'east', name: '東<側', startFloorRaw: '3FL', endFloorRaw: '', status: 'confirmed' }] as never; });
    expect(html).toContain('東&lt;側'); expect(html).not.toContain('東<側'); expect(html).toContain('3FL');
  });
});

describe('位置樓層 React 版面契約', () => {
 it('設定位置表單順序為起始、結束與位置', () => { const html = settingsMarkup(MasterSettings, () => { settingsState.activeSection = 'locations'; settingsState.adding = true; }); expect(html.indexOf('name="startFloor"')).toBeLessThan(html.indexOf('name="endFloor"')); expect(html.indexOf('name="endFloor"')).toBeLessThan(html.indexOf('name="name"')); });
 it('日報附加欄位使用按需編輯入口', () => { const html = dailyMarkup((daily) => { const trade = createTrade('水電', '甲', 0); trade.workItems.push(createWorkItem(0)); daily.report.tradeSections.push(trade); daily.expandedId = trade.id; }); expect(html).toMatch(/reorder/i); expect(html).not.toContain('<datalist'); });
});
