import type { ContactItem } from '../domain/daily';
import { assertSafePayload, assertRenderablePayload } from '../sync/payload-safety';

export interface ContactEditorDraft {
  id: string; originalId: string | null; value: ContactItem; errors: string[];
  tradeQuery: string; vendorQuery: string; taskQuery: string;
  plannedDate?: string;
  taskDetails?: string;
}
export interface EntryDraft { contact: ContactEditorDraft | null; work: Array<[string, string]>; }

const contactDatePrefix = /^(?:預定\s*)?(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})(?:[（(][日一ㄧ二三四五六][）)])?\s*/;
export function plannedContactPrefix(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `預定${date.slice(5).replace('-', '/')}(${'日一二三四五六'[day]})`;
}
export function formatContactTask(content: string, reportDate: string): string {
  const text = content.trim();
  const match = contactDatePrefix.exec(text);
  const prefix = match ? plannedContactPrefix(`${match[1] ?? reportDate.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`) : '';
  const body = (match ? text.slice(match[0].length) : text).replace(/（數量／規格：([^]*)）$/, '$1').replace(/[。.]$/, '');
  return prefix + body;
}

export function contactTaskMemoryText(content: string): string {
  return content.trim().replace(contactDatePrefix, '').replace(/（數量／規格：[^]*）$/, '').trim();
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

/** Apply a newly chosen date to existing undated tasks as well as pending input. */
export function applyContactPlannedDate(editor: ContactEditorDraft): void {
  if (!editor.plannedDate) return;
  const prefix = plannedContactPrefix(editor.plannedDate);
  for (const item of editor.value.items) {
    if (!contactDatePrefix.test(item.content.trim())) {
      item.content = prefix + item.content.trim();
      item.updatedAt = new Date().toISOString();
    }
  }
}
