import { describe, expect, it } from 'vitest';
import { appendContactTask, applyContactPlannedDate, contactTaskMemoryText, type ContactEditorDraft } from '../../src/daily/entry-workflow';
import { createContact, createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { collectMemoryApplications } from '../../src/settings/memory-applications';
import { formatDailyReport } from '../../src/daily/daily-formatter';

describe('日期輸出與共用工項記憶', () => {
  it('先加入再選日期，完成時仍輸出日期；记憶只保留工項', () => {
    const value = createContact(0);
    value.tradeNameSnapshot = '鷹架工程'; value.vendorNameSnapshot = '元昌';
    const editor: ContactEditorDraft = { id: value.id, originalId: null, value, errors: [], tradeQuery: '', vendorQuery: '', taskQuery: '上下設備施作' };
    appendContactTask(editor); editor.plannedDate = '2026-10-05';
    applyContactPlannedDate(editor); applyContactPlannedDate(editor);
    expect(value.items[0].content).toBe('預定10/05(一)上下設備施作');
    const report = createDailyDraft(null, '', '2026-10-04'); report.contacts.push(value);
    expect(formatDailyReport(report)).toContain('1.鷹架工程-元昌預定10/05(一)上下設備施作。');
    expect(collectMemoryApplications(report).filter(row => row.store === 'trade_tasks').map(row => row.name)).toEqual(['上下設備施作']);
  });
  it('不同日期格式及數量規格不進入共用記憶', () => {
    for (const date of ['10/05', '10/5', '2026-10-05', '預定10/05(一)', '預定10/05(ㄧ)']) {
      expect(contactTaskMemoryText(`${date} 配管（數量／規格：2.5 方）`)).toBe('配管');
    }
  });
  it('位置、樓層、備註只屬於當筆施工紀錄', () => {
    const report = createDailyDraft(); const trade = createTrade('土方工程', '廠商', 0);
    const work = createWorkItem(0);
    Object.assign(work, { taskTextSnapshot: '開挖', startFloorRaw: 'B8', locationTextSnapshot: '東側', note: '待監造確認' });
    trade.workItems.push(work); report.tradeSections.push(trade);
    expect(collectMemoryApplications(report).map(row => row.name)).toEqual(['土方工程', '廠商', '開挖']);
  });
});
