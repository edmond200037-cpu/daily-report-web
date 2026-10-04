import { describe, expect, it } from 'vitest';
import { appendContactTask, contactTaskMemoryText, entryDraftKey, readEntryDraft, type ContactEditorDraft } from '../../src/daily/entry-workflow';
import { createContact } from '../../src/domain/daily';
import { consumeWorkDrafts, restoreWorkDrafts, snapshotWorkDrafts } from '../../src/daily/work-input';

const editor = (): ContactEditorDraft => ({ id: 'editor', originalId: null, value: createContact(0), errors: [], tradeQuery: '鷹架', vendorQuery: '元昌', taskQuery: '上下設備施作' });
describe('逐筆新增草稿與完成', () => {
  it('尚未按加入的文字納入一次，再次完成不重複加入', () => {
    const draft = editor();
    expect(appendContactTask(draft)).toBe(true);
    expect(appendContactTask(draft)).toBe(false);
    expect(draft.value.items.map((item) => item.content)).toEqual(['上下設備施作']);
    expect(draft.taskQuery).toBe('');
  });
  it('日期選填，只有明確選擇才加在內容，下一筆不沿用', () => {
    const draft = editor(); draft.plannedDate = '2026-10-05'; appendContactTask(draft);
    expect(draft.value.items[0].content).toBe('10/05 上下設備施作');
    expect(contactTaskMemoryText(draft.value.items[0].content)).toBe('上下設備施作');
    const next = editor(); appendContactTask(next);
    expect(next.value.items[0].content).toBe('上下設備施作');
  });
  it('附加數量規格保留在輸出，不學成工項名稱或帶到下一項', () => {
    const draft = editor(); draft.taskDetails = '2.5 方，350kgf/cm²';
    appendContactTask(draft);
    expect(draft.value.items[0].content).toContain('2.5 方，350kgf/cm²');
    expect(contactTaskMemoryText(draft.value.items[0].content)).toBe('上下設備施作');
    appendContactTask(draft, '下一項');
    expect(draft.value.items[1].content).toBe('下一項');
  });
  it('工地、日期及帳號分區，恢復未加入文字與穩定 ID', () => {
    const key = entryDraftKey('user-a', 'site-a', '2026-10-04');
    const draft = editor(); const values = new Map([[key, JSON.stringify({ contact: draft, work: [['trade-a', '中文未完成']] })]]);
    const storage = { getItem: (id: string) => values.get(id) ?? null };
    expect(readEntryDraft(storage, key).contact).toEqual(draft);
    for (const other of [entryDraftKey('user-b', 'site-a', '2026-10-04'), entryDraftKey('user-a', 'site-b', '2026-10-04'), entryDraftKey('user-a', 'site-a', '2026-10-05')]) {
      expect(readEntryDraft(storage, other)).toEqual({ contact: null, work: [] });
    }
    restoreWorkDrafts(readEntryDraft(storage, key).work);
    expect(snapshotWorkDrafts()).toEqual([['trade-a', '中文未完成']]);
    expect(consumeWorkDrafts()).toEqual([['trade-a', '中文未完成']]);
    expect(consumeWorkDrafts()).toEqual([]);
  });
  it('異常草稿與讀取失敗必須回報，不當作空草稿', () => {
    expect(() => readEntryDraft({ getItem: () => '{invalid' }, 'key')).toThrow();
    expect(() => readEntryDraft({ getItem: () => JSON.stringify({ work: [[5, null]] }) }, 'key')).toThrow('格式異常');
    expect(() => readEntryDraft({ getItem: () => { throw new Error('storage unavailable'); } }, 'key')).toThrow('storage unavailable');
  });
});
