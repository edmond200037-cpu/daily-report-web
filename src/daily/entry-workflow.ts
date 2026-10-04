import type { ContactItem } from '../domain/daily';

export interface ContactEditorDraft {
  id: string; originalId: string | null; value: ContactItem; errors: string[];
  tradeQuery: string; vendorQuery: string; taskQuery: string;
  plannedDate?: string;
  taskDetails?: string;
}
export interface EntryDraft { contact: ContactEditorDraft | null; work: Array<[string, string]>; }

export function contactTaskMemoryText(content: string): string {
  return content.replace(/^(?:\d{4}[-/])?(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])\s+/, '').replace(/（數量／規格：[^]*）$/, '').trim();
}

/** Editor-only text is partitioned independently from validated report data. */
export function entryDraftKey(userId: string | undefined, siteId: string | null, date: string): string {
  return `daily-entry:v1:${JSON.stringify([userId ?? 'local', siteId, date])}`;
}
export function readEntryDraft(storage: Pick<Storage, 'getItem'>, key: string): EntryDraft {
  const raw = storage.getItem(key);
  if (!raw) return { contact: null, work: [] };
  const value = JSON.parse(raw) as EntryDraft;
  if (!Array.isArray(value.work) || value.work.some((item) => !Array.isArray(item) || item.length !== 2 || item.some((part) => typeof part !== 'string')) ||
    (value.contact && (!value.contact.value || !Array.isArray(value.contact.value.items) || typeof value.contact.taskQuery !== 'string'))) {
    throw new Error('本機輸入草稿格式異常，請先匯出備份。');
  }
  return value;
}
export function appendContactTask(editor: ContactEditorDraft, text = editor.taskQuery): boolean {
  const content = text.trim();
  if (!content) return false;
  const stamp = new Date().toISOString();
  // Store optional scheduling in the existing content field for all output/sync consumers.
  const prefix = editor.plannedDate ? `${editor.plannedDate.slice(5).replace('-', '/')} ` : '';
  const detail = editor.taskDetails?.trim();
  editor.value.items.push({ id: crypto.randomUUID(), content: prefix + content + (detail ? `（數量／規格：${detail}）` : ''), sortOrder: editor.value.items.length, createdAt: stamp, updatedAt: stamp });
  editor.taskQuery = ''; editor.taskDetails = ''; editor.errors = [];
  return true;
}

/** Apply a newly chosen date to existing undated tasks as well as pending input. */
export function applyContactPlannedDate(editor: ContactEditorDraft): void {
  if (!editor.plannedDate) return;
  const prefix = `${editor.plannedDate.slice(5).replace('-', '/')} `;
  for (const item of editor.value.items) {
    if (!/^(?:\d{4}[-/])?\d{1,2}[-/]\d{1,2}\s+/.test(item.content.trim())) {
      item.content = prefix + item.content.trim();
      item.updatedAt = new Date().toISOString();
    }
  }
}