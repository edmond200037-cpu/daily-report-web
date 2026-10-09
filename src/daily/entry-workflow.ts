import type { ContactItem } from '../domain/daily';
import { assertSafePayload, assertRenderablePayload } from '../sync/payload-safety';

export interface ContactEditorDraft {
  id: string; originalId: string | null; value: ContactItem; errors: string[];
  tradeQuery: string; vendorQuery: string; taskQuery: string;
  plannedDate?: string;
  plannedDateChanged?: boolean;
  taskDetails?: string;
}
export interface EntryDraft { contact: ContactEditorDraft | null; work: Array<[string, string]>; }

const contactDatePrefix = /^(?:預定\s*)?(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})(?:[（(][日一ㄧ二三四五六][）)])?\s*/;
/** A date without a year that falls in an earlier month than the report belongs to next year (12/30 report, 01/05 task). */
function contactMatchDate(match: RegExpExecArray, reportDate: string): string {
  const reportYear = Number(reportDate.slice(0, 4));
  const reportMonth = Number(reportDate.slice(5, 7));
  const month = Number(match[2]);
  const year = match[1] ? Number(match[1]) : month < reportMonth ? reportYear + 1 : reportYear;
  return `${year}-${String(month).padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}
export function contactTaskParts(content: string, reportDate: string): { date: string; text: string } {
  const value = content.trim();
  const match = contactDatePrefix.exec(value);
  return {
    date: match ? contactMatchDate(match, reportDate) : '',
    text: match ? value.slice(match[0].length) : value,
  };
}

export function editContactEntry(value: ContactItem, reportDate: string): ContactEditorDraft {
  const dates = new Set(value.items.map((item) => contactTaskParts(item.content, reportDate).date));
  return {
    id: value.id, originalId: value.id, value: structuredClone(value), errors: [],
    tradeQuery: value.tradeNameSnapshot, vendorQuery: value.vendorNameSnapshot, taskQuery: '',
    plannedDate: dates.size === 1 ? [...dates][0] : '',
  };
}

/** Keep the stored date prefix out of the editable task text. */
export function updateContactTaskText(editor: ContactEditorDraft, id: string, text: string, reportDate: string): void {
  const item = editor.value.items.find((row) => row.id === id);
  if (!item) return;
  const date = contactTaskParts(item.content, reportDate).date;
  item.content = text.trim() ? (date ? plannedContactPrefix(date) : '') + text : '';
  item.updatedAt = new Date().toISOString();
  editor.errors = [];
}
export function plannedContactPrefix(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `預定${date.slice(5).replace('-', '/')}(${'日一二三四五六'[day]})`;
}
export function formatContactTask(content: string, reportDate: string): string {
  const text = content.trim();
  const match = contactDatePrefix.exec(text);
  const prefix = match ? plannedContactPrefix(contactMatchDate(match, reportDate)) : '';
  const body = (match ? text.slice(match[0].length) : text).replace(/（數量／規格：([^]*)）$/, '$1').replace(/[。.]$/, '');
  return prefix + body;
}

export function contactTaskMemoryText(content: string): string {
  return content.trim().replace(contactDatePrefix, '')
    // Details can also be typed into the task itself or edited after adding it.
    .replace(/[（(]\s*(?:數量\s*[／/]\s*規格|數量|規格)\s*[:：][^）)]*[）)]/g, '')
    .replace(/(?:數量\s*[／/]\s*規格|數量|規格)\s*[:：][^]*/, '')
    .replace(/\d+(?:\.\d+)?\s*(?:kgf\s*\/\s*cm[²2]|kg\s*\/\s*cm[²2]|MPa)(?![A-Za-z])/gi, '')
    .replace(/\d+(?:\.\d+)?\s*(?:[x×*]\s*\d+(?:\.\d+)?\s*){1,2}(?:mm|cm|m|公分|公厘|毫米|公尺)?/gi, '')
    .replace(/[ΦφØ]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m|公分|公厘|毫米|公尺)?/gi, '')
    .replace(/\d+(?:\.\d+)?\s*(?:立方公尺|平方公尺|公尺|公分|公厘|毫米|英吋|吋|公斤|公噸|噸|方|支|根|個|組|台|臺|片|包|車|趟|米|m[²³23]|mm|cm|kg|m)(?![A-Za-z])/gi, '')
    .replace(/[（(]\s*[，,、；;／/]*\s*[）)]/g, '')
    .replace(/\s+/g, ' ').replace(/^[\s，,、；;。]+|[\s，,、；;。]+$/g, '').trim();
}

/** Editor-only text is partitioned independently from validated report data. */
export function entryDraftKey(userId: string | undefined, siteId: string | null, date: string): string {
  return `daily-entry:v1:${JSON.stringify([userId ?? 'local', siteId, date])}`;
}
export function readEntryDraft(storage: Pick<Storage, 'getItem'>, key: string): EntryDraft {
  const raw = storage.getItem(key);
  if (!raw) return { contact: null, work: [] };
  const value = JSON.parse(raw) as EntryDraft;
  assertSafePayload(value);
  if (!Array.isArray(value.work) || value.work.some((item) => !Array.isArray(item) || item.length !== 2 || item.some((part) => typeof part !== 'string')) ||
    (value.contact && (!value.contact.value || !Array.isArray(value.contact.value.items) || typeof value.contact.taskQuery !== 'string'))) {
    throw new Error('本機輸入草稿格式異常，請先匯出備份。');
  }
  for (const [id] of value.work) assertSafePayload({ id });
  if (value.contact) assertRenderablePayload(value.contact.value);
  return value;
}
export function appendContactTask(editor: ContactEditorDraft, text = editor.taskQuery): boolean {
  const content = text.trim();
  if (!content) return false;
  const stamp = new Date().toISOString();
  // Store optional scheduling in the existing content field for all output/sync consumers.
  const prefix = editor.plannedDate ? plannedContactPrefix(editor.plannedDate) : '';
  const detail = editor.taskDetails?.trim();
  editor.value.items.push({ id: crypto.randomUUID(), content: prefix + content + (detail ? `（數量／規格：${detail}）` : ''), sortOrder: editor.value.items.length, createdAt: stamp, updatedAt: stamp });
  editor.taskQuery = ''; editor.taskDetails = ''; editor.errors = [];
  return true;
}

/** Explicit date edits replace old prefixes; untouched entries retain individual dates. */
export function applyContactPlannedDate(editor: ContactEditorDraft): void {
  if (!editor.plannedDate && !editor.plannedDateChanged) return;
  const prefix = editor.plannedDate ? plannedContactPrefix(editor.plannedDate) : '';
  for (const item of editor.value.items) {
    const text = item.content.trim();
    if (!text) continue;
    const existing = contactDatePrefix.exec(text);
    if (editor.plannedDateChanged || !existing) {
      item.content = prefix + (existing ? text.slice(existing[0].length) : text);
      item.updatedAt = new Date().toISOString();
    }
  }
}
