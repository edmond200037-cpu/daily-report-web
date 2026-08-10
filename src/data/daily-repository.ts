import { createDailyDraft, DAILY_TEMPLATE_VERSION, timestamp, type DailyReportV3, type FinalizedDailyReport, type TradeSection, type WorkItem, type MaterialEntry, type ContactItem } from '../domain/daily';
import { localToday } from '../format/date-format';
import { openDatabase, STORES } from './db.js';

export type MemoryStatus = 'candidate' | 'confirmed';
export interface NamedMemory { id: string; name: string; normalizedName: string; usageCount: number; lastUsedAt: string | null; createdAt: string; updatedAt: string; status?: MemoryStatus; manuallyCreated?: boolean; manuallyConfirmed?: boolean; firstUsedAt?: string | null; tradeTypeId?: string; }
export type DailySettingsSection = 'sites' | 'trade-tasks' | 'trades' | 'tasks' | 'vendors' | 'locations' | 'materials' | 'templates' | 'backup' | 'debug';
export interface SpecialTemplate { id: string; text: string; normalizedName: string; createdAt: string; updatedAt: string; }
const TEMPLATE_KEY = 'daily_special_templates_v1';
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const txDone = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
export const normalizeName = (value: string): string => value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const cleanName = (value: string): string => value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ');
const now = () => new Date().toISOString();

export interface MaterialType { id: string; name: string; normalizedName: string; sortOrder: number; usageCount: number; lastUsedAt: string | null; recentUnit: string; recentSupplierName: string; createdAt: string; updatedAt: string; }
export type MaterialMemoryField = 'itemName' | 'specification' | 'unit' | 'supplier';
export interface MaterialMemoryItem { id: string; materialTypeId: string; fieldType: MaterialMemoryField; value: string; normalizedValue: string; usageCount: number; lastUsedAt: string; createdAt: string; updatedAt: string; }
async function db(): Promise<IDBDatabase> { return openDatabase() as Promise<IDBDatabase>; }
function normalizeDraft(value: DailyReportV3 | undefined): DailyReportV3 | undefined {
  if (!value) return value;
  value.siteId ??= null;
  value.tradeSections ??= [];
  const legacySections = value.tradeSections as Array<TradeSection & { vendors?: Array<{ id: string; vendorId?: string | null; vendorNameSnapshot?: string; workerCount?: string; sortOrder?: number; workItems?: WorkItem[]; createdAt?: string; updatedAt?: string }> }>;
  value.tradeSections = legacySections.flatMap((trade, tradeIndex) => {
    if (!trade.vendors) return [trade];
    return trade.vendors.map((vendor, vendorIndex) => ({ id: vendor.id || crypto.randomUUID(), tradeTypeId: trade.tradeTypeId ?? null, tradeNameSnapshot: trade.tradeNameSnapshot ?? '', vendorId: vendor.vendorId ?? null, vendorNameSnapshot: vendor.vendorNameSnapshot ?? '', workerCount: vendor.workerCount ?? '', workItems: vendor.workItems ?? [], materialEntries: [], status: trade.status ?? 'draft', sortOrder: tradeIndex + vendorIndex / 1000, createdAt: vendor.createdAt ?? trade.createdAt ?? timestamp(), updatedAt: vendor.updatedAt ?? trade.updatedAt ?? timestamp() }));
  });
  value.tradeSections.sort((a, b) => a.sortOrder - b.sortOrder).forEach((trade, index) => { trade.sortOrder = index; trade.tradeTypeId ??= null; trade.vendorId ??= null; trade.vendorNameSnapshot ??= ''; trade.workerCount ??= ''; trade.workItems ??= []; trade.workItems.forEach((work: WorkItem & { locationText?: string }, workIndex) => { work.sortOrder ??= workIndex; work.startFloorRaw ??= ''; work.startFloorNormalized ??= null; work.endFloorRaw ??= ''; work.endFloorNormalized ??= null; work.locationId ??= null; work.locationTextSnapshot ??= work.locationText ?? ''; work.taskId ??= null; delete work.locationText; delete (work as unknown as { locationMode?: unknown }).locationMode; }); });
  value.tradeSections.forEach((trade) => { trade.materialEntries ??= []; });
  value.standaloneMaterialEntries ??= (value.supplies ?? []).map((supply, index): MaterialEntry => ({ id: supply.id || crypto.randomUUID(), entryType: 'normal', connectedTradeSectionId: null, materialTypeId: null, materialTypeSnapshot: supply.type === 'concrete' ? '混凝土' : supply.type === 'clsm' ? 'CLSM' : supply.type === 'rebar' ? '鋼筋' : supply.name, itemName: supply.name || (supply.type === 'concrete' ? '混凝土' : ''), supplierId: null, supplierNameSnapshot: '', quantity: supply.quantity ?? '', unit: supply.unit || (supply.type === 'concrete' ? 'm3' : supply.type === 'clsm' ? '立方' : supply.type === 'rebar' ? '噸' : ''), specification: supply.strength ?? '', note: '', sortOrder: index, createdAt: supply.createdAt ?? timestamp(), updatedAt: supply.updatedAt ?? timestamp() }));
  value.standaloneMaterialEntries.forEach((entry) => { entry.entryType ??= 'normal'; entry.connectedTradeSectionId ??= null; });
  const existingMaterialIds = new Set(value.standaloneMaterialEntries.map((entry) => entry.id));
  value.tradeSections.forEach((trade) => { const legacyEntries = trade.materialEntries ?? []; legacyEntries.forEach((entry) => { if (!existingMaterialIds.has(entry.id)) { value.standaloneMaterialEntries.push({ ...entry, entryType: 'independent', connectedTradeSectionId: trade.id, sortOrder: value.standaloneMaterialEntries.length }); existingMaterialIds.add(entry.id); } }); trade.materialEntries = []; });
  value.standaloneMaterialEntries.forEach((entry, index) => entry.sortOrder = index);
  const legacyContacts = value.contacts as Array<ContactItem & { plannedDate?: string; content?: string }> | undefined;
  value.contacts = (legacyContacts ?? []).map((contact, contactIndex) => {
    const stamp = contact.updatedAt ?? contact.createdAt ?? timestamp();
    const items = contact.items?.length ? contact.items : (contact.content?.trim() ? [{ id: crypto.randomUUID(), content: contact.content.trim(), sortOrder: 0, createdAt: stamp, updatedAt: stamp }] : []);
    return { ...contact, tradeTypeId: contact.tradeTypeId ?? null, vendorId: contact.vendorId ?? null, items: items.map((item, index) => ({ ...item, id: item.id || crypto.randomUUID(), content: item.content?.trim() ?? '', sortOrder: index, createdAt: item.createdAt ?? stamp, updatedAt: item.updatedAt ?? stamp })), sortOrder: contact.sortOrder ?? contactIndex, createdAt: contact.createdAt ?? stamp, updatedAt: stamp };
  });
  return value;
}
export async function loadDailyDraft(): Promise<DailyReportV3 | undefined> { const database = await db(); try { return normalizeDraft(await request(database.transaction('live_report_draft').objectStore('live_report_draft').get('current')) as DailyReportV3 | undefined); } finally { database.close(); } }
export async function saveDailyDraft(report: DailyReportV3): Promise<void> { const database = await db(); try { const tx = database.transaction('live_report_draft', 'readwrite'); tx.objectStore('live_report_draft').put(report); await txDone(tx); } finally { database.close(); } }

function touchNamedMemory(store: IDBObjectStore, rows: NamedMemory[], value: string, stamp: string, tradeTypeId?: string): NamedMemory {
  const name = cleanName(value); const normalizedName = normalizeName(name);
  const current = rows.find((row) => row.normalizedName === normalizedName && (tradeTypeId === undefined || row.tradeTypeId === tradeTypeId));
  const row: NamedMemory = current ? { ...current, name, usageCount: current.usageCount + 1, lastUsedAt: stamp, updatedAt: stamp } : { id: crypto.randomUUID(), name, normalizedName, usageCount: 1, lastUsedAt: stamp, createdAt: stamp, updatedAt: stamp, ...(tradeTypeId ? { tradeTypeId, status: 'confirmed' as const, manuallyCreated: false, manuallyConfirmed: false, firstUsedAt: stamp } : {}) };
  store.put(row); return row;
}

/** Commits a contact and its reusable memories as one all-or-nothing transaction. */
export async function saveContactEntry(report: DailyReportV3, contact: ContactItem): Promise<{ report: DailyReportV3; contact: ContactItem }> {
  const database = await db();
  try {
    const tx = database.transaction(['live_report_draft', 'trade_types', 'trade_vendors', 'trade_tasks'], 'readwrite');
    const trades = await request(tx.objectStore('trade_types').getAll()) as NamedMemory[];
    const stamp = now(); const trade = touchNamedMemory(tx.objectStore('trade_types'), trades, contact.tradeNameSnapshot, stamp);
    const vendors = await request(tx.objectStore('trade_vendors').getAll()) as NamedMemory[];
    const vendor = touchNamedMemory(tx.objectStore('trade_vendors'), vendors, contact.vendorNameSnapshot, stamp, trade.id);
    const tasks = await request(tx.objectStore('trade_tasks').getAll()) as NamedMemory[];
    const items = contact.items.map((item, index) => ({ ...item, content: cleanName(item.content), sortOrder: index, updatedAt: stamp, createdAt: item.createdAt || stamp }));
    items.forEach((item) => touchNamedMemory(tx.objectStore('trade_tasks'), tasks, item.content, stamp, trade.id));
    const saved: ContactItem = { ...contact, id: contact.id || crypto.randomUUID(), tradeTypeId: trade.id, tradeNameSnapshot: trade.name, vendorId: vendor.id, vendorNameSnapshot: vendor.name, items, updatedAt: stamp, createdAt: contact.createdAt || stamp };
    const next = structuredClone(report); const index = next.contacts.findIndex((item) => item.id === saved.id); if (index >= 0) next.contacts[index] = saved; else { saved.sortOrder = next.contacts.length; next.contacts.push(saved); } next.contacts.forEach((item, itemIndex) => item.sortOrder = itemIndex); next.updatedAt = stamp;
    tx.objectStore('live_report_draft').put(next); await txDone(tx); return { report: next, contact: saved };
  } finally { database.close(); }
}

export async function listMaterialTypes(): Promise<MaterialType[]> { const database = await db(); try { return (await request(database.transaction('material_types').objectStore('material_types').getAll()) as MaterialType[]).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); } finally { database.close(); } }
export async function createMaterialType(value: string): Promise<void> { const database = await db(); try { const tx = database.transaction('material_types', 'readwrite'); const store = tx.objectStore('material_types'); const types = await request(store.getAll()) as MaterialType[]; const name = materialTypeName(value); const error = materialTypeError(name, types); if (error) throw new Error(error); const stamp = now(); store.put({ id: crypto.randomUUID(), name, normalizedName: normalizeName(name), sortOrder: types.length, usageCount: 0, lastUsedAt: null, recentUnit: '', recentSupplierName: '', createdAt: stamp, updatedAt: stamp } satisfies MaterialType); await txDone(tx); } finally { database.close(); } }
export async function listMaterialMemory(): Promise<MaterialMemoryItem[]> { const database = await db(); try { return await request(database.transaction('material_memory_items').objectStore('material_memory_items').getAll()) as MaterialMemoryItem[]; } finally { database.close(); } }
const materialTypeName = (value: string) => cleanName(value);
const materialTypeError = (name: string, rows: MaterialType[], exceptId?: string): string | null => { if (!name) return '請填寫材料類型。'; return rows.some((row) => row.id !== exceptId && row.normalizedName === normalizeName(name)) ? '此材料類型已存在，請使用其他名稱。' : null; };
function putMemory(store: IDBObjectStore, all: MaterialMemoryItem[], materialTypeId: string, fieldType: MaterialMemoryField, value: string, stamp: string): void { const cleaned = cleanName(value); if (!cleaned) return; const normalizedValue = normalizeName(cleaned); const current = all.find((row) => row.materialTypeId === materialTypeId && row.fieldType === fieldType && row.normalizedValue === normalizedValue); const row: MaterialMemoryItem = current ? { ...current, value: cleaned, usageCount: current.usageCount + 1, lastUsedAt: stamp, updatedAt: stamp } : { id: crypto.randomUUID(), materialTypeId, fieldType, value: cleaned, normalizedValue, usageCount: 1, lastUsedAt: stamp, createdAt: stamp, updatedAt: stamp }; store.put(row); }

/** Saves the canonical material row and all discovery memories atomically. */
export async function saveMaterialEntry(report: DailyReportV3, entry: MaterialEntry): Promise<{ report: DailyReportV3; types: MaterialType[] }> {
  const database = await db();
  try {
    const tx = database.transaction(['live_report_draft', 'material_types', 'material_memory_items'], 'readwrite');
    const typesStore = tx.objectStore('material_types'); const memoryStore = tx.objectStore('material_memory_items');
    const types = await request(typesStore.getAll()) as MaterialType[]; const memories = await request(memoryStore.getAll()) as MaterialMemoryItem[];
    const name = materialTypeName(entry.materialTypeSnapshot); const error = materialTypeError(name, types);
    if (error && !types.some((row) => row.id === entry.materialTypeId && row.normalizedName === normalizeName(name))) throw new Error(error);
    const stamp = now(); let type = types.find((row) => row.id === entry.materialTypeId) ?? types.find((row) => row.normalizedName === normalizeName(name));
    if (!type) { type = { id: crypto.randomUUID(), name, normalizedName: normalizeName(name), sortOrder: types.length, usageCount: 0, lastUsedAt: null, recentUnit: '', recentSupplierName: '', createdAt: stamp, updatedAt: stamp }; types.push(type); }
    const normalizedEntry: MaterialEntry = { ...entry, id: entry.id || crypto.randomUUID(), materialTypeId: type.id, materialTypeSnapshot: type.name, itemName: cleanName(entry.itemName), supplierNameSnapshot: cleanName(entry.supplierNameSnapshot), quantity: entry.quantity.trim(), unit: cleanName(entry.unit), specification: cleanName(entry.specification), note: entry.note.trim(), updatedAt: stamp, createdAt: entry.createdAt || stamp };
    type = { ...type, usageCount: type.usageCount + 1, lastUsedAt: stamp, recentUnit: normalizedEntry.unit || type.recentUnit, recentSupplierName: normalizedEntry.supplierNameSnapshot || type.recentSupplierName, updatedAt: stamp };
    typesStore.put(type); putMemory(memoryStore, memories, type.id, 'itemName', normalizedEntry.itemName, stamp); putMemory(memoryStore, memories, type.id, 'specification', normalizedEntry.specification, stamp); putMemory(memoryStore, memories, type.id, 'unit', normalizedEntry.unit, stamp); putMemory(memoryStore, memories, type.id, 'supplier', normalizedEntry.supplierNameSnapshot, stamp);
    const next: DailyReportV3 = structuredClone(report); const index = next.standaloneMaterialEntries.findIndex((row) => row.id === normalizedEntry.id); if (index >= 0) next.standaloneMaterialEntries[index] = normalizedEntry; else { normalizedEntry.sortOrder = next.standaloneMaterialEntries.length; next.standaloneMaterialEntries.push(normalizedEntry); } next.updatedAt = stamp; tx.objectStore('live_report_draft').put(next);
    await txDone(tx); return { report: next, types: types.map((row) => row.id === type!.id ? type! : row).sort((a, b) => a.sortOrder - b.sortOrder) };
  } finally { database.close(); }
}
export async function renameMaterialType(report: DailyReportV3, id: string, value: string): Promise<DailyReportV3> { const database = await db(); try { const tx = database.transaction(['live_report_draft', 'material_types', 'material_memory_items'], 'readwrite'); const store = tx.objectStore('material_types'); const types = await request(store.getAll()) as MaterialType[]; const current = types.find((row) => row.id === id); if (!current) throw new Error('找不到材料類型。'); const name = materialTypeName(value); const error = materialTypeError(name, types, id); if (error) throw new Error(error); const stamp = now(); const updated = { ...current, name, normalizedName: normalizeName(name), updatedAt: stamp }; store.put(updated); const next: DailyReportV3 = structuredClone(report); next.standaloneMaterialEntries.forEach((entry) => { if (entry.materialTypeId === id) { entry.materialTypeSnapshot = name; entry.updatedAt = stamp; } }); next.updatedAt = stamp; tx.objectStore('live_report_draft').put(next); await txDone(tx); return next; } finally { database.close(); } }
export async function deleteMaterialType(report: DailyReportV3, id: string): Promise<DailyReportV3> { const database = await db(); try { const tx = database.transaction(['live_report_draft', 'material_types', 'material_memory_items'], 'readwrite'); const next: DailyReportV3 = structuredClone(report); next.standaloneMaterialEntries = next.standaloneMaterialEntries.filter((entry) => entry.materialTypeId !== id); next.standaloneMaterialEntries.forEach((entry, index) => entry.sortOrder = index); next.updatedAt = now(); tx.objectStore('material_types').delete(id); const memoryStore = tx.objectStore('material_memory_items'); const memories = await request(memoryStore.getAll()) as MaterialMemoryItem[]; memories.filter((row) => row.materialTypeId === id).forEach((row) => memoryStore.delete(row.id)); tx.objectStore('live_report_draft').put(next); await txDone(tx); return next; } finally { database.close(); } }
export async function reorderMaterialTypes(ids: string[]): Promise<void> { const database = await db(); try { const tx = database.transaction('material_types', 'readwrite'); const store = tx.objectStore('material_types'); const rows = await request(store.getAll()) as MaterialType[]; ids.forEach((id, index) => { const row = rows.find((item) => item.id === id); if (row) store.put({ ...row, sortOrder: index, updatedAt: now() }); }); await txDone(tx); } finally { database.close(); } }
export async function listMemories(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', tradeTypeId?: string): Promise<NamedMemory[]> { const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const database = await db(); try { const rows = await request(database.transaction(store).objectStore(store).getAll()) as NamedMemory[]; return rows.filter((row) => !tradeTypeId || row.tradeTypeId === tradeTypeId).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName)); } finally { database.close(); } }
export async function listTemplates(): Promise<SpecialTemplate[]> { const database = await db(); try { const value = await request(database.transaction('app_settings').objectStore('app_settings').get(TEMPLATE_KEY)) as { id: string; templates?: SpecialTemplate[] } | undefined; return (value?.templates ?? []).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName)); } finally { database.close(); } }
export function validateText(value: string, max: number, template = false): string | null { const cleaned = cleanName(value); if (!cleaned) return template ? '請輸入特殊事項模板。' : '請輸入名稱。'; if (cleaned.length > max) return template ? '特殊事項模板最多只能輸入 500 個字。' : '名稱最多只能輸入 50 個字。'; return null; }
export async function saveMemory(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', value: string, tradeTypeId?: string, editingId?: string): Promise<void> {
  const error = validateText(value, 50); if (error) throw new Error(error); const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const normalizedName = normalizeName(value); const database = await db();
  try { const tx = database.transaction([store, 'live_report_draft'], 'readwrite'); const records = await request(tx.objectStore(store).getAll()) as NamedMemory[]; if (records.some((row) => row.id !== editingId && row.normalizedName === normalizedName && (!tradeTypeId || row.tradeTypeId === tradeTypeId))) throw new Error('此名稱已存在。'); const current = editingId ? records.find((row) => row.id === editingId) : undefined; const stamp = now(); const row: NamedMemory = current ? { ...current, name: cleanName(value), normalizedName, updatedAt: stamp } : { id: crypto.randomUUID(), name: cleanName(value), normalizedName, usageCount: 0, lastUsedAt: null, createdAt: stamp, updatedAt: stamp, ...(tradeTypeId ? { tradeTypeId } : {}), ...(kind === 'vendors' || kind === 'tasks' || kind === 'locations' ? { status: 'confirmed' as const, manuallyCreated: true, manuallyConfirmed: true, firstUsedAt: null } : {}) }; tx.objectStore(store).put(row);
    if (current) { const draft = normalizeDraft(await request(tx.objectStore('live_report_draft').get('current')) as DailyReportV3 | undefined); if (draft) { syncRename(draft, kind, current.id, row.name); tx.objectStore('live_report_draft').put(draft); } }
    await txDone(tx);
  } finally { database.close(); }
}
function syncRename(draft: DailyReportV3, kind: string, id: string, name: string): void { if (kind === 'sites' && draft.siteId === id) draft.siteNameSnapshot = name; draft.tradeSections.forEach((trade) => { if (kind === 'trades' && trade.tradeTypeId === id) trade.tradeNameSnapshot = name; if (kind === 'vendors' && trade.vendorId === id) trade.vendorNameSnapshot = name; trade.workItems.forEach((work) => { if (kind === 'tasks' && work.taskId === id) work.taskTextSnapshot = name; if (kind === 'locations' && work.locationId === id) work.locationTextSnapshot = name; }); }); }
export async function confirmMemory(kind: 'vendors' | 'tasks' | 'locations', id: string): Promise<void> { const store = kind === 'vendors' ? 'trade_vendors' : kind === 'tasks' ? 'trade_tasks' : 'location_memories'; const database = await db(); try { const tx = database.transaction(store, 'readwrite'); const row = await request(tx.objectStore(store).get(id)) as NamedMemory | undefined; if (!row) return; tx.objectStore(store).put({ ...row, status: 'confirmed', manuallyConfirmed: true, updatedAt: now() }); await txDone(tx); } finally { database.close(); } }
export async function deleteMemory(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', id: string): Promise<void> { const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const stores = kind === 'trades' ? [store, 'trade_vendors', 'trade_tasks', 'live_report_draft'] : [store, 'live_report_draft']; const database = await db(); try { const tx = database.transaction(stores, 'readwrite'); tx.objectStore(store).delete(id); if (kind === 'trades') { const vendors = await request(tx.objectStore('trade_vendors').getAll()) as NamedMemory[]; vendors.filter((item) => item.tradeTypeId === id).forEach((item) => tx.objectStore('trade_vendors').delete(item.id)); const tasks = await request(tx.objectStore('trade_tasks').getAll()) as NamedMemory[]; tasks.filter((item) => item.tradeTypeId === id).forEach((item) => tx.objectStore('trade_tasks').delete(item.id)); }
    const draft = normalizeDraft(await request(tx.objectStore('live_report_draft').get('current')) as DailyReportV3 | undefined); if (draft) { applyDelete(draft, kind, id); tx.objectStore('live_report_draft').put(draft); } await txDone(tx);
  } finally { database.close(); } }
function applyDelete(draft: DailyReportV3, kind: string, id: string): void { if (kind === 'sites' && draft.siteId === id) { draft.siteId = null; draft.siteNameSnapshot = ''; } if (kind === 'trades') draft.tradeSections = draft.tradeSections.filter((trade) => trade.tradeTypeId !== id); if (kind === 'vendors') draft.tradeSections = draft.tradeSections.filter((trade) => trade.vendorId !== id); draft.tradeSections.forEach((trade) => { if (kind === 'tasks') { trade.workItems = trade.workItems.filter((work) => work.taskId !== id); trade.workItems.forEach((work, index) => work.sortOrder = index); } if (kind === 'locations') trade.workItems.forEach((work) => { if (work.locationId === id) { work.locationId = null; work.locationTextSnapshot = ''; trade.status = 'draft'; } }); }); draft.tradeSections.forEach((trade, index) => trade.sortOrder = index); }
export async function saveTemplate(value: string, editingId?: string): Promise<void> { const error = validateText(value, 500, true); if (error) throw new Error(error); const database = await db(); try { const tx = database.transaction('app_settings', 'readwrite'); const current = await request(tx.objectStore('app_settings').get(TEMPLATE_KEY)) as { id: string; templates?: SpecialTemplate[] } | undefined; const templates = current?.templates ?? []; const normalizedName = normalizeName(value); if (templates.some((item) => item.id !== editingId && item.normalizedName === normalizedName)) throw new Error('此名稱已存在。'); const stamp = now(); const next = editingId ? templates.map((item) => item.id === editingId ? { ...item, text: cleanName(value), normalizedName, updatedAt: stamp } : item) : [...templates, { id: crypto.randomUUID(), text: cleanName(value), normalizedName, createdAt: stamp, updatedAt: stamp }]; tx.objectStore('app_settings').put({ id: TEMPLATE_KEY, templates: next }); await txDone(tx); } finally { database.close(); } }
export async function deleteTemplate(id: string): Promise<void> { const database = await db(); try { const tx = database.transaction('app_settings', 'readwrite'); const current = await request(tx.objectStore('app_settings').get(TEMPLATE_KEY)) as { id: string; templates?: SpecialTemplate[] } | undefined; tx.objectStore('app_settings').put({ id: TEMPLATE_KEY, templates: (current?.templates ?? []).filter((item) => item.id !== id) }); await txDone(tx); } finally { database.close(); } }
export async function databaseSummary(): Promise<Record<string, number>> { const database = await db(); try { const output: Record<string, number> = {}; for (const store of STORES as string[]) output[store] = await request(database.transaction(store).objectStore(store).count()); return output; } finally { database.close(); } }
export async function clearDebugLogs(): Promise<void> { const database = await db(); try { const tx = database.transaction('debug_logs', 'readwrite'); tx.objectStore('debug_logs').clear(); await txDone(tx); } finally { database.close(); } }

export interface MemoryBackupPayload { schemaVersion: 1; exportType: 'memories'; exportedAt: string; appVersion: string; data: Record<string, unknown[]>; }
export interface MemoryMergeSummary { added: number; skipped: number; invalid: number; }
const MEMORY_STORES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'app_settings'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** Validates the portable, memory-only backup boundary before any write begins. */
export function validateMemoryBackup(value: unknown): MemoryBackupPayload {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.exportType !== 'memories' || !isRecord(value.data)) throw new Error('此檔案不是支援的記憶備份。');
  for (const [store, records] of Object.entries(value.data)) {
    if (!(MEMORY_STORES as readonly string[]).includes(store) || !Array.isArray(records)) throw new Error(`記憶備份資料表「${store}」格式不正確。`);
  }
  return value as unknown as MemoryBackupPayload;
}

export async function exportMemories(): Promise<MemoryBackupPayload> {
  const database = await db();
  try {
    const data: Record<string, unknown[]> = {};
    for (const store of MEMORY_STORES) data[store] = await request(database.transaction(store).objectStore(store).getAll()) as unknown[];
    return { schemaVersion: 1, exportType: 'memories', exportedAt: now(), appVersion: '0.1.0', data };
  } finally { database.close(); }
}

function validNamedMemory(row: unknown): row is NamedMemory { return isRecord(row) && typeof row.name === 'string' && Boolean(cleanName(row.name)); }
function validMaterialType(row: unknown): row is MaterialType { return isRecord(row) && typeof row.name === 'string' && Boolean(cleanName(row.name)); }
function normalized(row: object, field = 'name'): string { const value = (row as Record<string, unknown>)[field]; return typeof value === 'string' ? normalizeName(value) : ''; }
function copyNamedMemory(row: NamedMemory, id: string, stamp: string, tradeTypeId?: string): NamedMemory { return { ...row, id, name: cleanName(row.name), normalizedName: normalizeName(row.name), tradeTypeId, usageCount: Number(row.usageCount) || 0, lastUsedAt: row.lastUsedAt ?? null, createdAt: row.createdAt || stamp, updatedAt: stamp }; }

/** Merges memory master data only; daily drafts, final reports, and water rows are never opened. */
export async function mergeMemoryBackup(raw: unknown): Promise<MemoryMergeSummary> {
  const payload = validateMemoryBackup(raw); const summary: MemoryMergeSummary = { added: 0, skipped: 0, invalid: 0 }; const database = await db();
  try {
    const tx = database.transaction(MEMORY_STORES as unknown as string[], 'readwrite'); const stamp = now();
    const storeRows = await Promise.all(MEMORY_STORES.map(async (store) => [store, await request(tx.objectStore(store).getAll()) as Record<string, unknown>[]] as const));
    const existing = Object.fromEntries(storeRows) as Record<string, Record<string, unknown>[]>;
    const tradeIdMap = new Map<string, string>(); const materialTypeIdMap = new Map<string, string>();
    const mergeNamed = (store: 'sites' | 'trade_types' | 'location_memories', incoming: unknown[]) => incoming.forEach((candidate) => {
      if (!validNamedMemory(candidate)) { summary.invalid += 1; return; }
      const key = normalizeName(candidate.name); const match = existing[store].find((row) => normalized(row) === key);
      if (match) { summary.skipped += 1; if (store === 'trade_types') tradeIdMap.set(candidate.id, String(match.id)); return; }
      const id = crypto.randomUUID(); const saved = copyNamedMemory(candidate, id, stamp); tx.objectStore(store).put(saved); existing[store].push(saved as unknown as Record<string, unknown>); summary.added += 1; if (store === 'trade_types') tradeIdMap.set(candidate.id, id);
    });
    mergeNamed('sites', rows(payload.data.sites)); mergeNamed('trade_types', rows(payload.data.trade_types)); mergeNamed('location_memories', rows(payload.data.location_memories));
    (['trade_vendors', 'trade_tasks'] as const).forEach((store) => rows(payload.data[store]).forEach((candidate) => {
      if (!validNamedMemory(candidate) || !candidate.tradeTypeId) { summary.invalid += 1; return; }
      const tradeTypeId = tradeIdMap.get(candidate.tradeTypeId) ?? candidate.tradeTypeId; if (!existing.trade_types.some((row) => row.id === tradeTypeId)) { summary.invalid += 1; return; }
      const match = existing[store].find((row) => normalized(row) === normalizeName(candidate.name) && row.tradeTypeId === tradeTypeId);
      if (match) { summary.skipped += 1; return; }
      const saved = copyNamedMemory(candidate, crypto.randomUUID(), stamp, tradeTypeId); tx.objectStore(store).put(saved); existing[store].push(saved as unknown as Record<string, unknown>); summary.added += 1;
    }));
    rows(payload.data.material_types).forEach((candidate) => {
      if (!validMaterialType(candidate)) { summary.invalid += 1; return; }
      const key = normalizeName(candidate.name); const match = existing.material_types.find((row) => normalized(row) === key);
      if (match) { summary.skipped += 1; materialTypeIdMap.set(String(candidate.id), String(match.id)); return; }
      const id = crypto.randomUUID(); const saved: MaterialType = { id, name: cleanName(candidate.name), normalizedName: key, sortOrder: existing.material_types.length, usageCount: Number(candidate.usageCount) || 0, lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : null, recentUnit: typeof candidate.recentUnit === 'string' ? candidate.recentUnit : '', recentSupplierName: typeof candidate.recentSupplierName === 'string' ? candidate.recentSupplierName : '', createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : stamp, updatedAt: stamp }; tx.objectStore('material_types').put(saved); existing.material_types.push(saved as unknown as Record<string, unknown>); materialTypeIdMap.set(String(candidate.id), id); summary.added += 1;
    });
    rows(payload.data.material_memory_items).forEach((candidate) => {
      if (!isRecord(candidate) || typeof candidate.materialTypeId !== 'string' || typeof candidate.fieldType !== 'string' || typeof candidate.value !== 'string' || !cleanName(candidate.value)) { summary.invalid += 1; return; }
      const materialTypeId = materialTypeIdMap.get(candidate.materialTypeId) ?? candidate.materialTypeId; if (!existing.material_types.some((row) => row.id === materialTypeId)) { summary.invalid += 1; return; }
      const value = cleanName(candidate.value); const fieldType = candidate.fieldType as MaterialMemoryField; const match = existing.material_memory_items.find((row) => row.materialTypeId === materialTypeId && row.fieldType === fieldType && normalized(row, 'value') === normalizeName(value));
      if (match) { summary.skipped += 1; return; }
      const saved: MaterialMemoryItem = { id: crypto.randomUUID(), materialTypeId, fieldType, value, normalizedValue: normalizeName(value), usageCount: Number(candidate.usageCount) || 0, lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : stamp, createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : stamp, updatedAt: stamp }; tx.objectStore('material_memory_items').put(saved); existing.material_memory_items.push(saved as unknown as Record<string, unknown>); summary.added += 1;
    });
    const importedTemplates = rows(payload.data.app_settings).find((row) => isRecord(row) && row.id === TEMPLATE_KEY) as { templates?: unknown[] } | undefined;
    if (importedTemplates?.templates) { const current = existing.app_settings.find((row) => row.id === TEMPLATE_KEY) as { id: string; templates?: SpecialTemplate[] } | undefined; const templates = current?.templates ?? []; const additions = importedTemplates.templates.filter((template): template is SpecialTemplate => isRecord(template) && typeof template.text === 'string' && Boolean(cleanName(template.text))).filter((template) => !templates.some((currentTemplate) => currentTemplate.normalizedName === normalizeName(template.text))).map((template) => ({ ...template, id: crypto.randomUUID(), text: cleanName(template.text), normalizedName: normalizeName(template.text), createdAt: template.createdAt || stamp, updatedAt: stamp }));
      additions.forEach((template) => { templates.push(template); summary.added += 1; }); if (additions.length) tx.objectStore('app_settings').put({ id: TEMPLATE_KEY, templates });
    }
    await txDone(tx); return summary;
  } finally { database.close(); }
}

const calendarStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).valueOf();
export function isFinalizedReportExpired(finalizedAt: string, reference = new Date()): boolean { const cutoff = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - 7).valueOf(); return calendarStart(new Date(finalizedAt)) <= cutoff; }
export async function pruneExpiredReports(reference = new Date()): Promise<number> { const database = await db(); try { const tx = database.transaction('daily_reports', 'readwrite'); const reports = await request(tx.objectStore('daily_reports').getAll()) as FinalizedDailyReport[]; const expired = reports.filter((report) => isFinalizedReportExpired(report.finalizedAt, reference)); expired.forEach((report) => tx.objectStore('daily_reports').delete(report.id)); await txDone(tx); return expired.length; } finally { database.close(); } }
export async function listRecentFinalizedReports(): Promise<FinalizedDailyReport[]> { await pruneExpiredReports(); const database = await db(); try { return (await request(database.transaction('daily_reports').objectStore('daily_reports').getAll()) as FinalizedDailyReport[]).filter((report) => !isFinalizedReportExpired(report.finalizedAt)).sort((a, b) => b.finalizedAt.localeCompare(a.finalizedAt)); } finally { database.close(); } }
export async function finalizeDailyReport(report: DailyReportV3, outputText: string): Promise<{ snapshot: FinalizedDailyReport; nextDraft: DailyReportV3 }> { const stamp = now(); const snapshot: FinalizedDailyReport = { ...structuredClone(report), id: crypto.randomUUID(), outputText, templateVersion: DAILY_TEMPLATE_VERSION, finalizedAt: stamp, updatedAt: stamp }; const nextDraft = createDailyDraft(report.siteId, report.siteNameSnapshot, localToday()); const database = await db(); try { const tx = database.transaction(['daily_reports', 'live_report_draft'], 'readwrite'); tx.objectStore('daily_reports').put(snapshot); tx.objectStore('live_report_draft').put(nextDraft); await txDone(tx); } finally { database.close(); } await pruneExpiredReports(); return { snapshot, nextDraft }; }
