import { describe, expect, it } from 'vitest';
import { appendContactTask, applyContactPlannedDate, contactTaskMemoryText, contactTaskParts, editContactEntry, updateContactTaskText, type ContactEditorDraft } from '../../src/daily/entry-workflow';
import { createContact, createDailyDraft, createTrade, createWorkItem } from '../../src/domain/daily';
import { collectMemoryApplications } from '../../src/settings/memory-applications';
import { formatDailyReport } from '../../src/daily/daily-formatter';

describe('日期輸出與共用工項記憶', () => {
  const savedEntry = () => {
    const value = createContact(0);
    const editor: ContactEditorDraft = { id: value.id, originalId: null, value, errors: [], tradeQuery: '', vendorQuery: '', taskQuery: '上下設備施作', plannedDate: '2026-10-05' };
    appendContactTask(editor);
    return value;
  };
  it('重新編輯會還原日期，工項輸入不包含日期；更新文字後日期仍保留', () => {
    const original = savedEntry();
    const editor = editContactEntry(original, '2026-10-06');
    expect(editor.plannedDate).toBe('2026-10-05');
    expect(contactTaskParts(editor.value.items[0].content, '2026-10-06').text).toBe('上下設備施作');
    updateContactTaskText(editor, editor.value.items[0].id, '改為設備巡檢', '2026-10-06');
    applyContactPlannedDate(editor);
    expect(editor.value.items[0].content).toBe('預定10/05(一)改為設備巡檢');
    expect(original.items[0].content).toBe('預定10/05(一)上下設備施作');
  });
  it('更改與清除日期可直接替換舊日期，重複完成不會疊加前綴', () => {
    const editor = editContactEntry(savedEntry(), '2026-10-06');
    editor.plannedDate = '2026-10-07'; editor.plannedDateChanged = true;
    applyContactPlannedDate(editor); applyContactPlannedDate(editor);
    expect(editor.value.items[0].content).toBe('預定10/07(三)上下設備施作');
    editor.plannedDate = ''; applyContactPlannedDate(editor);
    expect(editor.value.items[0].content).toBe('上下設備施作');
  });
  it('混合日期只修改文字時保留各自日期', () => {
    const value = savedEntry();
    value.items.push({ ...value.items[0], id: 'other-task', content: '預定10/07(三)巡檢', sortOrder: 1 });
    const editor = editContactEntry(value, '2026-10-06');
    expect(editor.plannedDate).toBe('');
    updateContactTaskText(editor, 'other-task', '巡檢修正', '2026-10-06');
    applyContactPlannedDate(editor);
    expect(editor.value.items.map((item) => item.content)).toEqual(['預定10/05(一)上下設備施作', '預定10/07(三)巡檢修正']);
  });
  it('清空文字不會留下只有日期的有效工項', () => {
    const editor = editContactEntry(savedEntry(), '2026-10-06');
    updateContactTaskText(editor, editor.value.items[0].id, '', '2026-10-06');
    applyContactPlannedDate(editor);
    expect(editor.value.items[0].content).toBe('');
  });
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
