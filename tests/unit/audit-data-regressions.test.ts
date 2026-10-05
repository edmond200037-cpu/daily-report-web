import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, get, list, put } from '../../src/data/db.js';
import { createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { DailyController } from '../../src/daily/daily-controller';
import { saveDailyDraft, saveMemory, loadDailyDraft } from '../../src/data/daily-repository';
import { saveLog, loadLogs, deleteLog, importLog } from '../../src/water-level/repository.js';
import { recalculate } from '../../src/water-level/calculator.js';
import { WaterLevelController } from '../../src/water-level/controller.js';
import { parseWaterText } from '../../src/water-level/parser.js';
import { isPositiveDecimal } from '../../src/shared/decimal';
import { escapeHtml } from '../../src/shared/html';
import { assertRenderablePayload } from '../../src/sync/payload-safety';
import type { SharedScope } from '../../src/domain/shared';

const context = vi.hoisted(() => ({ scope: null as SharedScope | null }));
vi.mock('../../src/sync/context', () => ({ loadActiveSharedScope: async () => context.scope }));
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn(), dispatchEvent: vi.fn() }); vi.stubGlobal('document', { activeElement: null }); context.scope = null; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('audit data regressions', () => {
  it.each([1, 7, 8, 17])('repairs old v%s installs without losing source or repeating data', async (version) => {
    const legacy = { id: 'legacy', date: '2026-10-04', siteNameSnapshot: '舊工地', sections: [{ sectionType: 'construction', tradeNameSnapshot: '模板', entries: [{ id: 'vendor', vendorNameSnapshot: '甲', workerCount: 2, workItems: [{ id: 'work', text: '組立' }] }] }], outputText: '原文', completedAt: '2026-10-04T01:00:00Z' };
    await new Promise<void>((resolve, reject) => { const request = indexedDB.open('construction-daily-report', version); request.onupgradeneeded = () => {
      request.result.createObjectStore('reports', { keyPath: 'id' }).put(legacy);
      request.result.createObjectStore('drafts', { keyPath: 'id' }).put({ id: 'current', report: legacy });
      request.result.createObjectStore('sites', { keyPath: 'id' }).put({ id: 's', name: 'site' });
    }; request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error); });
    (await openDatabase()).close();
    const draft = await loadDailyDraft();
    expect(draft?.tradeSections[0].workItems[0].taskTextSnapshot).toBe('組立');
    expect(draft?.tradeSections[0].workerCount).toBe('2');
    expect((await get('daily_reports', 'legacy')).outputText).toBe('原文');
    expect((await get('migration_metadata', 'repair-v18:reports:legacy')).original).toEqual(legacy);
    expect(await get('sites', 's')).toMatchObject({ status: 'confirmed', finalizedUsageCount: 0 });
    (await openDatabase()).close(); expect(await list('daily_reports')).toHaveLength(1);
  });

  it('shared undo recreates child identities and reconnects material', () => {
    const report = createDailyDraft(); report.shared = { userId: 'u', siteId: 's', cloudId: 'd', reportDate: report.date, revision: 1 };
    const trade = createTrade('模板', '甲', 0); const work = createWorkItem(0); trade.workItems.push(work); report.tradeSections.push(trade);
    const controller = new DailyController(report); const undo = controller.deleteTradeForUndo(trade.id)!;
    controller.restoreDeletedTrade(undo); controller.restoreDeletedTrade(undo);
    expect(controller.report.tradeSections).toHaveLength(1);
    expect(controller.report.tradeSections[0].id).not.toBe(trade.id);
    expect(controller.report.tradeSections[0].workItems[0].id).not.toBe(work.id);
  });

  it('master rename survives partition reload and a stale editor flush', async () => {
    const report = createDailyDraft(); const trade = createTrade('old', '甲', 0, 't'); report.tradeSections.push(trade);
    await put('trade_types', { id: 't', name: 'old', normalizedName: 'old' }); await saveDailyDraft(report);
    const controller = new DailyController(structuredClone(report));
    await saveMemory('trades', 'new', undefined, 't'); await controller.flush();
    expect((await loadDailyDraft())?.tradeSections[0].tradeNameSnapshot).toBe('new');
    expect((await get('live_report_draft', 'current')).tradeSections[0].tradeNameSnapshot).toBe('new');
  });

  it('three-day display never deletes the shared base; explicit delete does', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
    context.scope = { userId: 'u', siteId: 's' };
    const old = { id: 'old', measuredAt: '2026-09-01T08:00', battery: '', readings: [] };
    await put('water_level_logs', old);
    await put('water_partitions', { id: 'u:s', ...context.scope, payload: { schemaVersion: 1, points: [], logs: [old] }, revision: 1 });
    await saveLog({ id: 'new', measuredAt: '2026-10-04T08:00', battery: '', readings: [] });
    expect(await list('water_level_logs')).toHaveLength(2); expect(await loadLogs()).toHaveLength(1);
    expect((await list('sync_outbox')).flatMap((op: any) => op.payload.changes).some((c: any) => c.op === 'delete')).toBe(false);
    await deleteLog('old'); expect(await get('water_level_logs', 'old')).toBeUndefined();
  });

  it('remote refresh keeps an unsaved measurement', async () => {
    const controller = new WaterLevelController({ innerHTML: '' }); await controller.initialize();
    controller.editing.battery = '2.798'; await controller.refresh(); expect(controller.editing.battery).toBe('2.798');
  });
  it('derived change uses canonical history, clearing missing values', () => {
    const logs = [{ measuredAt: '1', readings: [{ pointId: 'p', value: 9, change: 7 }] }, { measuredAt: '2', readings: [{ pointId: 'p', value: 11, change: 1 }] }];
    expect(recalculate(logs)[1].readings[0].change).toBe(2);
    expect(recalculate([{ measuredAt: '1', readings: [{ pointId: 'p', value: '', change: 7 }] }])[0].readings[0].change).toBeNull();
  });
  it('invalid import creates neither a point nor a log', async () => {
    const controller = new WaterLevelController({ innerHTML: '', querySelector: () => ({ value: '10/4-8點\n電池電量：invalid\n新井：1.2' }) }); await controller.initialize(); await controller.importText();
    expect(await list('water_level_points')).toEqual([]); expect(await list('water_level_logs')).toEqual([]);
    expect(parseWaterText('10/4-8點\n井：1.2.3')[0].ok).toBe(false);
  });
  it('valid import atomically creates one well and one measurement', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00'));
    const segment = parseWaterText('10/4-8點\n電池電量：2.798\n新井：1.2')[0];
    const saved = await importLog(segment);
    expect(await list('water_level_points')).toHaveLength(1);
    expect(await list('water_level_logs')).toEqual([saved]);
    expect(saved.readings[0].value).toBe(1.2);
    await expect(importLog({ ...segment, readings: [...segment.readings, ...segment.readings] })).rejects.toThrow('重複井位');
    expect(await list('water_level_logs')).toHaveLength(1);
  });
  it.each(['0.1', '0.5', '1', '1.25'])('accepts positive decimal %s', value => expect(isPositiveDecimal(value)).toBe(true));
  it.each(['0', '-1', 'NaN', 'Infinity', '1e3', '1.2.3', ''])('rejects invalid quantity %s', value => expect(isPositiveDecimal(value)).toBe(false));
  it('escapes both kinds of quotes in attributes', () => expect(escapeHtml('\"\'><img onerror=x>')).toBe('&quot;&#39;&gt;&lt;img onerror=x&gt;'));
  it.each([
    { tradeSections: [{ id: 'bad\"', workItems: [] }] },
    { tradeSections: [{ id: 'ok', workItems: {} }] },
    { contacts: [{ id: 'ok', items: [null] }] },
    { specialItems: [{ id: 'ok', content: {} }] },
    { logs: [{ id: 'ok', readings: [{ pointId: 'p', value: 'NaN' }] }] },
  ])('quarantines malformed renderer payload %j', payload => expect(() => assertRenderablePayload(payload)).toThrow());
});
