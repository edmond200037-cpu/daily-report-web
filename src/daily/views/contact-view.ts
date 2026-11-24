import { appState } from '../../app/state';
import { appendContactTask } from '../entry-workflow';
import { persistEntryDraft } from './daily-entry';
export const contactDirty = () => { const editor = appState.contactEditor; return Boolean(editor && (!editor.originalId || editor.plannedDateChanged || JSON.stringify(editor.value) !== JSON.stringify(appState.daily.report.contacts.find((item) => item.id === editor.originalId)))); };
export function startContactEntry(name: string, vendor = '', tradeId: string | null = null, vendorId: string | null = null): void {
  appState.justAddedEntry = null;
  const id = crypto.randomUUID(); const stamp = new Date().toISOString();
  appState.contactEditor = { id, originalId: null, value: { id, tradeTypeId: tradeId, tradeNameSnapshot: name, vendorId, vendorNameSnapshot: vendor, items: [], sortOrder: appState.daily.report.contacts.length, createdAt: stamp, updatedAt: stamp }, errors: [], tradeQuery: name, vendorQuery: vendor, taskQuery: '', plannedDate: '' };
  appState.activeContactSearch = null; appState.contactEditorCollapsed = false; persistEntryDraft();
}
export function appendPendingContactTask(): void { if (appState.contactEditor) { appendContactTask(appState.contactEditor); persistEntryDraft(); } }
