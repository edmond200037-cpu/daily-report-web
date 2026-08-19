import { DAILY_TEMPLATE_VERSION, timestamp, type DailyReportV3, type FinalizedDailyReport, type TradeSection, type WorkItem, type MaterialEntry, type ContactItem } from '../domain/daily';
import { openDatabase, STORES } from './db.js';

export type MemoryStatus = 'candidate' | 'confirmed';
export interface NamedMemory { id: string; name: string; normalizedName: string; usageCount: number; finalizedUsageCount: number; lastUsedAt: string | null; createdAt: string; updatedAt: string; status: MemoryStatus; manuallyCreated?: boolean; manuallyConfirmed?: boolean; firstUsedAt?: string | null; tradeTypeId?: string; }
export type DailySettingsSection = 'sites' | 'trade-tasks' | 'trades' | 'tasks' | 'vendors' | 'locations' | 'materials' | 'templates' | 'backup' | 'debug';
export interface SpecialTemplate { id: string; text: string; normalizedName: string; createdAt: string; updatedAt: string; }
const TEMPLATE_KEY = 'daily_special_templates_v1';
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const txDone = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
export const normalizeName = (value: string): string => value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const cleanName = (value: string): string => value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ');
const now = () => new Date().toISOString();

export interface MaterialType { id: string; name: string; normalizedName: string; sortOrder: number; usageCount: number; finalizedUsageCount: number; lastUsedAt: string | null; recentUnit: string; recentSupplierName: string; createdAt: string; updatedAt: string; status: MemoryStatus; }
export type MaterialMemoryField = 'itemName' | 'specification' | 'unit' | 'supplier';
export interface MaterialMemoryItem { id: string; materialTypeId: string; fieldType: MaterialMemoryField; value: string; normalizedValue: string; usageCount: number; finalizedUsageCount: number; lastUsedAt: string; createdAt: string; updatedAt: string; status: MemoryStatus; }
export interface DailyMemoryCommit { id: 'current'; fingerprint: string; snapshotId: string; outputText: string; committedAt: string; }
export interface FinalizeResult { snapshot: FinalizedDailyReport; retainedDraft: DailyReportV3; outputText: string; created: boolean; }
export type MemoryKind = 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations' | 'material-types' | 'material-items';
export interface MemoryCandidate { key: string; kind: MemoryKind; id: string; name: string; parentName?: string; usageCount: number; lastUsedAt: string | null; }
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

/** A normal contact save changes only the live draft; automatic learning happens on finalization. */
export async function saveContactEntry(report: DailyReportV3, contact: ContactItem): Promise<{ report: DailyReportV3; contact: ContactItem }> {
  const database = await db();
  try {
    const tx = database.transaction('live_report_draft', 'readwrite');
    const stamp = now();
    const items = contact.items.map((item, index) => ({ ...item, content: cleanName(item.content), sortOrder: index, updatedAt: stamp, createdAt: item.createdAt || stamp }));
    const saved: ContactItem = { ...contact, id: contact.id || crypto.randomUUID(), tradeNameSnapshot: cleanName(contact.tradeNameSnapshot), vendorNameSnapshot: cleanName(contact.vendorNameSnapshot), items, updatedAt: stamp, createdAt: contact.createdAt || stamp };
    const next = structuredClone(report); const index = next.contacts.findIndex((item) => item.id === saved.id); if (index >= 0) next.contacts[index] = saved; else { saved.sortOrder = next.contacts.length; next.contacts.push(saved); } next.contacts.forEach((item, itemIndex) => item.sortOrder = itemIndex); next.updatedAt = stamp;
    tx.objectStore('live_report_draft').put(next); await txDone(tx); return { report: next, contact: saved };
  } finally { database.close(); }
}

export async function listMaterialTypes(status: MemoryStatus | 'all' = 'confirmed'): Promise<MaterialType[]> { const database = await db(); try { return (await request(database.transaction('material_types').objectStore('material_types').getAll()) as MaterialType[]).filter((row) => status === 'all' || (row.status ?? 'confirmed') === status).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); } finally { database.close(); } }
export async function createMaterialType(value: string): Promise<void> { const database = await db(); try { const tx = database.transaction('material_types', 'readwrite'); const store = tx.objectStore('material_types'); const types = await request(store.getAll()) as MaterialType[]; const name = materialTypeName(value); const error = materialTypeError(name, types); if (error) throw new Error(error); const stamp = now(); store.put({ id: crypto.randomUUID(), name, normalizedName: normalizeName(name), sortOrder: types.length, usageCount: 0, finalizedUsageCount: 0, lastUsedAt: null, recentUnit: '', recentSupplierName: '', createdAt: stamp, updatedAt: stamp, status: 'confirmed' } satisfies MaterialType); await txDone(tx); } finally { database.close(); } }
export async function listMaterialMemory(status: MemoryStatus | 'all' = 'confirmed'): Promise<MaterialMemoryItem[]> { const database = await db(); try { return (await request(database.transaction('material_memory_items').objectStore('material_memory_items').getAll()) as MaterialMemoryItem[]).filter((row) => status === 'all' || (row.status ?? 'confirmed') === status); } finally { database.close(); } }
export async function listMemoryCandidates(): Promise<MemoryCandidate[]> { const [sites, trades, vendors, tasks, locations, types, items] = await Promise.all([listMemories('sites', undefined, 'candidate'), listMemories('trades', undefined, 'candidate'), listMemories('vendors', undefined, 'candidate'), listMemories('tasks', undefined, 'candidate'), listMemories('locations', undefined, 'candidate'), listMaterialTypes('candidate'), listMaterialMemory('candidate')]); const tradeNames = new Map(trades.map((row) => [row.id, row.name])); const typeNames = new Map(types.map((row) => [row.id, row.name])); const named = (kind: Extract<MemoryKind, 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations'>, values: NamedMemory[]) => values.map((row) => ({ key: `${kind}:${row.id}`, kind, id: row.id, name: row.name, parentName: row.tradeTypeId ? tradeNames.get(row.tradeTypeId) : undefined, usageCount: row.usageCount, lastUsedAt: row.lastUsedAt })); return [...named('sites', sites), ...named('trades', trades), ...named('vendors', vendors), ...named('tasks', tasks), ...named('locations', locations), ...types.map((row) => ({ key: `material-types:${row.id}`, kind: 'material-types' as const, id: row.id, name: row.name, usageCount: row.usageCount, lastUsedAt: row.lastUsedAt })), ...items.map((row) => ({ key: `material-items:${row.id}`, kind: 'material-items' as const, id: row.id, name: row.value, parentName: typeNames.get(row.materialTypeId), usageCount: row.usageCount, lastUsedAt: row.lastUsedAt }))].sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.usageCount - a.usageCount); }
export async function confirmMemoryCandidates(keys: string[]): Promise<void> { const database = await db(); try { const stores = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items']; const tx = database.transaction(stores, 'readwrite'); const lookup: Record<MemoryKind, string> = { sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories', 'material-types': 'material_types', 'material-items': 'material_memory_items' }; for (const key of keys) { const [kind, id] = key.split(':') as [MemoryKind, string]; const store = lookup[kind]; if (!store || !id) continue; const row = await request(tx.objectStore(store).get(id)) as Record<string, unknown> | undefined; if (row) tx.objectStore(store).put({ ...row, status: 'confirmed', manuallyConfirmed: true, updatedAt: now() }); } await txDone(tx); } finally { database.close(); } }
const materialTypeName = (value: string) => cleanName(value);
const materialTypeError = (name: string, rows: MaterialType[], exceptId?: string): string | null => { if (!name) return '請填寫材料類型。'; return rows.some((row) => row.id !== exceptId && row.normalizedName === normalizeName(name)) ? '此材料類型已存在，請使用其他名稱。' : null; };
/** A normal material save changes only the live draft; free text remains a snapshot until finalization. */
export async function saveMaterialEntry(report: DailyReportV3, entry: MaterialEntry): Promise<{ report: DailyReportV3 }> {
  const database = await db();
  try {
    const tx = database.transaction('live_report_draft', 'readwrite');
    const stamp = now();
    const connectedTradeSectionId = entry.entryType === 'independent' && report.tradeSections.some((trade) => trade.id === entry.connectedTradeSectionId) ? entry.connectedTradeSectionId : null;
    const normalizedEntry: MaterialEntry = { ...entry, id: entry.id || crypto.randomUUID(), entryType: entry.entryType ?? 'normal', connectedTradeSectionId, materialTypeSnapshot: cleanName(entry.materialTypeSnapshot), itemName: cleanName(entry.itemName), supplierNameSnapshot: cleanName(entry.supplierNameSnapshot), quantity: entry.quantity.trim(), unit: cleanName(entry.unit), specification: cleanName(entry.specification), note: entry.note.trim(), updatedAt: stamp, createdAt: entry.createdAt || stamp };
    const next: DailyReportV3 = structuredClone(report); const index = next.standaloneMaterialEntries.findIndex((row) => row.id === normalizedEntry.id); if (index >= 0) next.standaloneMaterialEntries[index] = normalizedEntry; else { normalizedEntry.sortOrder = next.standaloneMaterialEntries.length; next.standaloneMaterialEntries.push(normalizedEntry); } next.updatedAt = stamp; tx.objectStore('live_report_draft').put(next);
    await txDone(tx); return { report: next };
  } finally { database.close(); }
}
export async function renameMaterialType(report: DailyReportV3, id: string, value: string): Promise<DailyReportV3> { const database = await db(); try { const tx = database.transaction(['live_report_draft', 'material_types', 'material_memory_items'], 'readwrite'); const store = tx.objectStore('material_types'); const types = await request(store.getAll()) as MaterialType[]; const current = types.find((row) => row.id === id); if (!current) throw new Error('找不到材料類型。'); const name = materialTypeName(value); const error = materialTypeError(name, types, id); if (error) throw new Error(error); const stamp = now(); const updated = { ...current, name, normalizedName: normalizeName(name), updatedAt: stamp }; store.put(updated); const next: DailyReportV3 = structuredClone(report); next.standaloneMaterialEntries.forEach((entry) => { if (entry.materialTypeId === id) { entry.materialTypeSnapshot = name; entry.updatedAt = stamp; } }); next.updatedAt = stamp; tx.objectStore('live_report_draft').put(next); await txDone(tx); return next; } finally { database.close(); } }
export async function deleteMaterialType(report: DailyReportV3, id: string): Promise<DailyReportV3> { const database = await db(); try { const tx = database.transaction(['live_report_draft', 'material_types', 'material_memory_items'], 'readwrite'); const next: DailyReportV3 = structuredClone(report); next.standaloneMaterialEntries = next.standaloneMaterialEntries.filter((entry) => entry.materialTypeId !== id); next.standaloneMaterialEntries.forEach((entry, index) => entry.sortOrder = index); next.updatedAt = now(); tx.objectStore('material_types').delete(id); const memoryStore = tx.objectStore('material_memory_items'); const memories = await request(memoryStore.getAll()) as MaterialMemoryItem[]; memories.filter((row) => row.materialTypeId === id).forEach((row) => memoryStore.delete(row.id)); tx.objectStore('live_report_draft').put(next); await txDone(tx); return next; } finally { database.close(); } }
export async function rejectMaterialMemoryItem(report: DailyReportV3, id: string): Promise<DailyReportV3> { const database = await db(); try { const tx = database.transaction(['live_report_draft', 'material_memory_items'], 'readwrite'); const memory = await request(tx.objectStore('material_memory_items').get(id)) as MaterialMemoryItem | undefined; if (!memory) return report; const field: Record<MaterialMemoryField, keyof MaterialEntry> = { itemName: 'itemName', specification: 'specification', unit: 'unit', supplier: 'supplierNameSnapshot' }; const key = field[memory.fieldType]; const next = structuredClone(report); next.standaloneMaterialEntries.forEach((entry) => { if (entry.materialTypeId === memory.materialTypeId && normalizeName(String(entry[key] ?? '')) === memory.normalizedValue) (entry as unknown as Record<string, string>)[key] = ''; }); next.updatedAt = now(); tx.objectStore('material_memory_items').delete(id); tx.objectStore('live_report_draft').put(next); await txDone(tx); return next; } finally { database.close(); } }
export async function reorderMaterialTypes(ids: string[]): Promise<void> { const database = await db(); try { const tx = database.transaction('material_types', 'readwrite'); const store = tx.objectStore('material_types'); const rows = await request(store.getAll()) as MaterialType[]; ids.forEach((id, index) => { const row = rows.find((item) => item.id === id); if (row) store.put({ ...row, sortOrder: index, updatedAt: now() }); }); await txDone(tx); } finally { database.close(); } }
export async function listMemories(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', tradeTypeId?: string, status: MemoryStatus | 'all' = 'confirmed'): Promise<NamedMemory[]> { const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const database = await db(); try { const rows = await request(database.transaction(store).objectStore(store).getAll()) as NamedMemory[]; return rows.filter((row) => (!tradeTypeId || row.tradeTypeId === tradeTypeId) && (status === 'all' || (row.status ?? 'confirmed') === status)).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName)); } finally { database.close(); } }
export async function listTemplates(): Promise<SpecialTemplate[]> { const database = await db(); try { const value = await request(database.transaction('app_settings').objectStore('app_settings').get(TEMPLATE_KEY)) as { id: string; templates?: SpecialTemplate[] } | undefined; return (value?.templates ?? []).sort((a, b) => a.normalizedName.localeCompare(b.normalizedName)); } finally { database.close(); } }
export function validateText(value: string, max: number, template = false): string | null { const cleaned = cleanName(value); if (!cleaned) return template ? '請輸入特殊事項模板。' : '請輸入名稱。'; if (cleaned.length > max) return template ? '特殊事項模板最多只能輸入 500 個字。' : '名稱最多只能輸入 50 個字。'; return null; }
export async function saveMemory(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', value: string, tradeTypeId?: string, editingId?: string): Promise<void> {
  const error = validateText(value, 50); if (error) throw new Error(error); const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const normalizedName = normalizeName(value); const database = await db();
  try { const tx = database.transaction([store, 'live_report_draft'], 'readwrite'); const records = await request(tx.objectStore(store).getAll()) as NamedMemory[]; if (records.some((row) => row.id !== editingId && row.normalizedName === normalizedName && (!tradeTypeId || row.tradeTypeId === tradeTypeId))) throw new Error('此名稱已存在。'); const current = editingId ? records.find((row) => row.id === editingId) : undefined; const stamp = now(); const row: NamedMemory = current ? { ...current, status: 'confirmed', name: cleanName(value), normalizedName, manuallyConfirmed: true, updatedAt: stamp } : { id: crypto.randomUUID(), name: cleanName(value), normalizedName, usageCount: 0, finalizedUsageCount: 0, lastUsedAt: null, createdAt: stamp, updatedAt: stamp, status: 'confirmed', manuallyCreated: true, manuallyConfirmed: true, firstUsedAt: null, ...(tradeTypeId ? { tradeTypeId } : {}) }; tx.objectStore(store).put(row);
    if (current) { const draft = normalizeDraft(await request(tx.objectStore('live_report_draft').get('current')) as DailyReportV3 | undefined); if (draft) { syncRename(draft, kind, current.id, row.name); tx.objectStore('live_report_draft').put(draft); } }
    await txDone(tx);
  } finally { database.close(); }
}
/** Selects a confirmed site when available; free daily input remains a draft snapshot. */
export async function selectSiteMemory(report: DailyReportV3, value: string): Promise<{ report: DailyReportV3; site: NamedMemory }> {
  const error = validateText(value, 50); if (error) throw new Error(error);
  const database = await db();
  try {
    const tx = database.transaction(['sites', 'live_report_draft'], 'readwrite');
    const store = tx.objectStore('sites'); const records = await request(store.getAll()) as NamedMemory[];
    const normalizedName = normalizeName(value); const stamp = now(); const current = records.find((row) => row.normalizedName === normalizedName && (row.status ?? 'confirmed') === 'confirmed');
    const site: NamedMemory = current
      ? current
      : { id: '', name: cleanName(value), normalizedName, usageCount: 0, finalizedUsageCount: 0, lastUsedAt: null, createdAt: stamp, updatedAt: stamp, status: 'candidate' };
    const next = structuredClone(report); next.siteId = site.id || null; next.siteNameSnapshot = site.name; next.updatedAt = stamp;
    tx.objectStore('live_report_draft').put(next);
    await txDone(tx); return { report: next, site };
  } finally { database.close(); }
}
function syncRename(draft: DailyReportV3, kind: string, id: string, name: string): void { if (kind === 'sites' && draft.siteId === id) draft.siteNameSnapshot = name; draft.tradeSections.forEach((trade) => { if (kind === 'trades' && trade.tradeTypeId === id) trade.tradeNameSnapshot = name; if (kind === 'vendors' && trade.vendorId === id) trade.vendorNameSnapshot = name; trade.workItems.forEach((work) => { if (kind === 'tasks' && work.taskId === id) work.taskTextSnapshot = name; if (kind === 'locations' && work.locationId === id) work.locationTextSnapshot = name; }); }); }
export async function confirmMemory(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', id: string): Promise<void> { const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const database = await db(); try { const tx = database.transaction(store, 'readwrite'); const row = await request(tx.objectStore(store).get(id)) as NamedMemory | undefined; if (!row) return; tx.objectStore(store).put({ ...row, status: 'confirmed', manuallyConfirmed: true, updatedAt: now() }); await txDone(tx); } finally { database.close(); } }
export async function deleteMemory(kind: 'sites' | 'trades' | 'vendors' | 'tasks' | 'locations', id: string): Promise<DailyReportV3 | undefined> { const store = ({ sites: 'sites', trades: 'trade_types', vendors: 'trade_vendors', tasks: 'trade_tasks', locations: 'location_memories' } as const)[kind]; const stores = kind === 'trades' ? [store, 'trade_vendors', 'trade_tasks', 'live_report_draft'] : [store, 'live_report_draft']; const database = await db(); try { const tx = database.transaction(stores, 'readwrite'); const removed = await request(tx.objectStore(store).get(id)) as NamedMemory | undefined; tx.objectStore(store).delete(id); if (kind === 'trades') { const vendors = await request(tx.objectStore('trade_vendors').getAll()) as NamedMemory[]; vendors.filter((item) => item.tradeTypeId === id).forEach((item) => tx.objectStore('trade_vendors').delete(item.id)); const tasks = await request(tx.objectStore('trade_tasks').getAll()) as NamedMemory[]; tasks.filter((item) => item.tradeTypeId === id).forEach((item) => tx.objectStore('trade_tasks').delete(item.id)); }
    const draft = normalizeDraft(await request(tx.objectStore('live_report_draft').get('current')) as DailyReportV3 | undefined); if (draft) { applyDelete(draft, kind, id, removed?.name); tx.objectStore('live_report_draft').put(draft); } await txDone(tx); return draft;
  } finally { database.close(); } }
function applyDelete(draft: DailyReportV3, kind: string, id: string, name?: string): void { if (kind === 'sites' && draft.siteId === id) { draft.siteId = null; draft.siteNameSnapshot = ''; } if (kind === 'trades') { draft.tradeSections = draft.tradeSections.filter((trade) => trade.tradeTypeId !== id); draft.contacts = draft.contacts.filter((contact) => contact.tradeTypeId !== id); } if (kind === 'vendors') { draft.tradeSections = draft.tradeSections.filter((trade) => trade.vendorId !== id); draft.contacts = draft.contacts.filter((contact) => contact.vendorId !== id); } draft.tradeSections.forEach((trade) => { if (kind === 'tasks') { trade.workItems = trade.workItems.filter((work) => work.taskId !== id); trade.workItems.forEach((work, index) => work.sortOrder = index); } if (kind === 'locations') trade.workItems.forEach((work) => { if (work.locationId === id) { work.locationId = null; work.locationTextSnapshot = ''; trade.status = 'draft'; } }); }); if (kind === 'tasks' && name) { draft.contacts.forEach((contact) => { contact.items = contact.items.filter((item) => normalizeName(item.content) !== normalizeName(name)); contact.items.forEach((item, index) => item.sortOrder = index); }); draft.contacts = draft.contacts.filter((contact) => contact.items.length); } draft.tradeSections.forEach((trade, index) => trade.sortOrder = index); draft.contacts.forEach((contact, index) => contact.sortOrder = index); }
export async function saveTemplate(value: string, editingId?: string): Promise<void> { const error = validateText(value, 500, true); if (error) throw new Error(error); const database = await db(); try { const tx = database.transaction('app_settings', 'readwrite'); const current = await request(tx.objectStore('app_settings').get(TEMPLATE_KEY)) as { id: string; templates?: SpecialTemplate[] } | undefined; const templates = current?.templates ?? []; const normalizedName = normalizeName(value); if (templates.some((item) => item.id !== editingId && item.normalizedName === normalizedName)) throw new Error('此名稱已存在。'); const stamp = now(); const next = editingId ? templates.map((item) => item.id === editingId ? { ...item, text: cleanName(value), normalizedName, updatedAt: stamp } : item) : [...templates, { id: crypto.randomUUID(), text: cleanName(value), normalizedName, createdAt: stamp, updatedAt: stamp }]; tx.objectStore('app_settings').put({ id: TEMPLATE_KEY, templates: next }); await txDone(tx); } finally { database.close(); } }
export async function deleteTemplate(id: string): Promise<void> { const database = await db(); try { const tx = database.transaction('app_settings', 'readwrite'); const current = await request(tx.objectStore('app_settings').get(TEMPLATE_KEY)) as { id: string; templates?: SpecialTemplate[] } | undefined; tx.objectStore('app_settings').put({ id: TEMPLATE_KEY, templates: (current?.templates ?? []).filter((item) => item.id !== id) }); await txDone(tx); } finally { database.close(); } }
export async function databaseSummary(): Promise<Record<string, number>> { const database = await db(); try { const output: Record<string, number> = {}; for (const store of STORES as string[]) output[store] = await request(database.transaction(store).objectStore(store).count()); return output; } finally { database.close(); } }
export async function clearDebugLogs(): Promise<void> { const database = await db(); try { const tx = database.transaction('debug_logs', 'readwrite'); tx.objectStore('debug_logs').clear(); await txDone(tx); } finally { database.close(); } }

export interface MemoryBackupPayload { schemaVersion: 1 | 2; exportType: 'memories'; exportedAt: string; appVersion: string; data: Record<string, unknown[]>; }
export interface MemoryMergeSummary { added: number; skipped: number; invalid: number; }
const MEMORY_STORES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'app_settings'] as const;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

/** Validates the portable, memory-only backup boundary before any write begins. */
export function validateMemoryBackup(value: unknown): MemoryBackupPayload {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || value.exportType !== 'memories' || !isRecord(value.data)) throw new Error('此檔案不是支援的記憶備份。');
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
    return { schemaVersion: 2, exportType: 'memories', exportedAt: now(), appVersion: '0.1.0', data };
  } finally { database.close(); }
}

function validNamedMemory(row: unknown): row is NamedMemory { return isRecord(row) && typeof row.name === 'string' && Boolean(cleanName(row.name)); }
function validMaterialType(row: unknown): row is MaterialType { return isRecord(row) && typeof row.name === 'string' && Boolean(cleanName(row.name)); }
function normalized(row: object, field = 'name'): string { const value = (row as Record<string, unknown>)[field]; return typeof value === 'string' ? normalizeName(value) : ''; }
function importedStatus(row: object, schemaVersion: 1 | 2): MemoryStatus { return schemaVersion === 1 ? 'confirmed' : (row as { status?: unknown }).status === 'candidate' ? 'candidate' : 'confirmed'; }
function copyNamedMemory(row: NamedMemory, id: string, stamp: string, schemaVersion: 1 | 2, tradeTypeId?: string): NamedMemory { return { ...row, id, name: cleanName(row.name), normalizedName: normalizeName(row.name), tradeTypeId, status: importedStatus(row, schemaVersion), usageCount: Number(row.usageCount) || 0, finalizedUsageCount: Number(row.finalizedUsageCount) || 0, lastUsedAt: row.lastUsedAt ?? null, createdAt: row.createdAt || stamp, updatedAt: stamp }; }

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
      const id = crypto.randomUUID(); const saved = copyNamedMemory(candidate, id, stamp, payload.schemaVersion); tx.objectStore(store).put(saved); existing[store].push(saved as unknown as Record<string, unknown>); summary.added += 1; if (store === 'trade_types') tradeIdMap.set(candidate.id, id);
    });
    mergeNamed('sites', rows(payload.data.sites)); mergeNamed('trade_types', rows(payload.data.trade_types)); mergeNamed('location_memories', rows(payload.data.location_memories));
    (['trade_vendors', 'trade_tasks'] as const).forEach((store) => rows(payload.data[store]).forEach((candidate) => {
      if (!validNamedMemory(candidate) || !candidate.tradeTypeId) { summary.invalid += 1; return; }
      const tradeTypeId = tradeIdMap.get(candidate.tradeTypeId) ?? candidate.tradeTypeId; if (!existing.trade_types.some((row) => row.id === tradeTypeId)) { summary.invalid += 1; return; }
      const match = existing[store].find((row) => normalized(row) === normalizeName(candidate.name) && row.tradeTypeId === tradeTypeId);
      if (match) { summary.skipped += 1; return; }
      const saved = copyNamedMemory(candidate, crypto.randomUUID(), stamp, payload.schemaVersion, tradeTypeId); tx.objectStore(store).put(saved); existing[store].push(saved as unknown as Record<string, unknown>); summary.added += 1;
    }));
    rows(payload.data.material_types).forEach((candidate) => {
      if (!validMaterialType(candidate)) { summary.invalid += 1; return; }
      const key = normalizeName(candidate.name); const match = existing.material_types.find((row) => normalized(row) === key);
      if (match) { summary.skipped += 1; materialTypeIdMap.set(String(candidate.id), String(match.id)); return; }
      const id = crypto.randomUUID(); const saved: MaterialType = { id, name: cleanName(candidate.name), normalizedName: key, sortOrder: existing.material_types.length, usageCount: Number(candidate.usageCount) || 0, finalizedUsageCount: Number(candidate.finalizedUsageCount) || 0, lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : null, recentUnit: typeof candidate.recentUnit === 'string' ? candidate.recentUnit : '', recentSupplierName: typeof candidate.recentSupplierName === 'string' ? candidate.recentSupplierName : '', createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : stamp, updatedAt: stamp, status: importedStatus(candidate, payload.schemaVersion) }; tx.objectStore('material_types').put(saved); existing.material_types.push(saved as unknown as Record<string, unknown>); materialTypeIdMap.set(String(candidate.id), id); summary.added += 1;
    });
    rows(payload.data.material_memory_items).forEach((candidate) => {
      if (!isRecord(candidate) || typeof candidate.materialTypeId !== 'string' || typeof candidate.fieldType !== 'string' || typeof candidate.value !== 'string' || !cleanName(candidate.value)) { summary.invalid += 1; return; }
      const materialTypeId = materialTypeIdMap.get(candidate.materialTypeId) ?? candidate.materialTypeId; if (!existing.material_types.some((row) => row.id === materialTypeId)) { summary.invalid += 1; return; }
      const value = cleanName(candidate.value); const fieldType = candidate.fieldType as MaterialMemoryField; const match = existing.material_memory_items.find((row) => row.materialTypeId === materialTypeId && row.fieldType === fieldType && normalized(row, 'value') === normalizeName(value));
      if (match) { summary.skipped += 1; return; }
      const saved: MaterialMemoryItem = { id: crypto.randomUUID(), materialTypeId, fieldType, value, normalizedValue: normalizeName(value), usageCount: Number(candidate.usageCount) || 0, finalizedUsageCount: Number(candidate.finalizedUsageCount) || 0, lastUsedAt: typeof candidate.lastUsedAt === 'string' ? candidate.lastUsedAt : stamp, createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : stamp, updatedAt: stamp, status: importedStatus(candidate, payload.schemaVersion) }; tx.objectStore('material_memory_items').put(saved); existing.material_memory_items.push(saved as unknown as Record<string, unknown>); summary.added += 1;
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

export async function outputFingerprint(outputText: string): Promise<string> {
  const bytes = new TextEncoder().encode(outputText);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function recentConfirmedVendor(rows: NamedMemory[], tradeTypeId: string): NamedMemory | undefined {
  return rows.filter((row) => row.tradeTypeId === tradeTypeId && (row.status ?? 'confirmed') === 'confirmed').slice().sort((a, b) =>
    (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.usageCount - a.usageCount || a.normalizedName.localeCompare(b.normalizedName),
  )[0];
}

function incrementNamed(rows: NamedMemory[], store: IDBObjectStore, value: string, stamp: string, tradeTypeId?: string): NamedMemory | undefined {
  const name = cleanName(value); if (!name) return undefined;
  const normalizedName = normalizeName(name);
  const current = rows.find((row) => row.normalizedName === normalizedName && (tradeTypeId === undefined || row.tradeTypeId === tradeTypeId));
  const finalizedUsageCount = (current?.finalizedUsageCount ?? 0) + 1;
  const row: NamedMemory = current
    ? { ...current, name, usageCount: (current.usageCount ?? 0) + 1, finalizedUsageCount, lastUsedAt: stamp, updatedAt: stamp, status: finalizedUsageCount >= 3 ? 'confirmed' : (current.status ?? 'confirmed') }
    : { id: crypto.randomUUID(), name, normalizedName, usageCount: 1, finalizedUsageCount: 1, lastUsedAt: stamp, createdAt: stamp, updatedAt: stamp, status: 'candidate', manuallyCreated: false, manuallyConfirmed: false, firstUsedAt: stamp, ...(tradeTypeId ? { tradeTypeId } : {}) };
  store.put(row); if (!current) rows.push(row); else rows.splice(rows.indexOf(current), 1, row);
  return row;
}

function incrementMaterialType(rows: MaterialType[], store: IDBObjectStore, value: string, stamp: string): MaterialType | undefined {
  const name = cleanName(value); if (!name) return undefined;
  const current = rows.find((row) => row.normalizedName === normalizeName(name)); const finalizedUsageCount = (current?.finalizedUsageCount ?? 0) + 1;
  const row: MaterialType = current
    ? { ...current, name, usageCount: (current.usageCount ?? 0) + 1, finalizedUsageCount, lastUsedAt: stamp, updatedAt: stamp, status: finalizedUsageCount >= 3 ? 'confirmed' : (current.status ?? 'confirmed') }
    : { id: crypto.randomUUID(), name, normalizedName: normalizeName(name), sortOrder: rows.length, usageCount: 1, finalizedUsageCount: 1, lastUsedAt: stamp, recentUnit: '', recentSupplierName: '', createdAt: stamp, updatedAt: stamp, status: 'candidate' };
  store.put(row); if (!current) rows.push(row); else rows.splice(rows.indexOf(current), 1, row);
  return row;
}

function incrementMaterialItem(rows: MaterialMemoryItem[], store: IDBObjectStore, materialTypeId: string, fieldType: MaterialMemoryField, value: string, stamp: string): void {
  const cleaned = cleanName(value); if (!cleaned) return;
  const normalizedValue = normalizeName(cleaned); const current = rows.find((row) => row.materialTypeId === materialTypeId && row.fieldType === fieldType && row.normalizedValue === normalizedValue); const finalizedUsageCount = (current?.finalizedUsageCount ?? 0) + 1;
  const row: MaterialMemoryItem = current
    ? { ...current, value: cleaned, usageCount: (current.usageCount ?? 0) + 1, finalizedUsageCount, lastUsedAt: stamp, updatedAt: stamp, status: finalizedUsageCount >= 3 ? 'confirmed' : (current.status ?? 'confirmed') }
    : { id: crypto.randomUUID(), materialTypeId, fieldType, value: cleaned, normalizedValue, usageCount: 1, finalizedUsageCount: 1, lastUsedAt: stamp, createdAt: stamp, updatedAt: stamp, status: 'candidate' };
  store.put(row); if (!current) rows.push(row); else rows.splice(rows.indexOf(current), 1, row);
}

/** Builds the finalization-only memory set, deduplicating each normalized value in one output. */
function distinct<T>(values: T[], key: (value: T) => string): T[] { const seen = new Set<string>(); return values.filter((value) => { const valueKey = key(value); return Boolean(valueKey) && !seen.has(valueKey) && (seen.add(valueKey), true); }); }

export async function finalizeDailyReport(report: DailyReportV3, outputText: string): Promise<FinalizeResult> {
  const fingerprint = await outputFingerprint(outputText); const database = await db();
  try {
    const current = await request(database.transaction('daily_memory_commits').objectStore('daily_memory_commits').get('current')) as DailyMemoryCommit | undefined;
    if (current?.fingerprint === fingerprint) {
      const snapshot = await request(database.transaction('daily_reports').objectStore('daily_reports').get(current.snapshotId)) as FinalizedDailyReport | undefined;
      return { snapshot: snapshot ?? { ...structuredClone(report), id: current.snapshotId, outputText: current.outputText, templateVersion: DAILY_TEMPLATE_VERSION, finalizedAt: current.committedAt, updatedAt: current.committedAt }, retainedDraft: structuredClone(report), outputText: current.outputText, created: false };
    }
    const stores = ['daily_reports', 'live_report_draft', 'daily_memory_commits', 'sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items'];
    const tx = database.transaction(stores, 'readwrite'); const stamp = now(); const retainedDraft = structuredClone(report);
    const [sites, trades, vendors, tasks, locations, types, materialItems] = await Promise.all([
      request(tx.objectStore('sites').getAll()) as Promise<NamedMemory[]>, request(tx.objectStore('trade_types').getAll()) as Promise<NamedMemory[]>, request(tx.objectStore('trade_vendors').getAll()) as Promise<NamedMemory[]>, request(tx.objectStore('trade_tasks').getAll()) as Promise<NamedMemory[]>, request(tx.objectStore('location_memories').getAll()) as Promise<NamedMemory[]>, request(tx.objectStore('material_types').getAll()) as Promise<MaterialType[]>, request(tx.objectStore('material_memory_items').getAll()) as Promise<MaterialMemoryItem[]>,
    ]);
    const site = incrementNamed(sites, tx.objectStore('sites'), retainedDraft.siteNameSnapshot, stamp); if (site) { retainedDraft.siteId = site.id; retainedDraft.siteNameSnapshot = site.name; }
    for (const trade of distinct(retainedDraft.tradeSections, (item) => normalizeName(item.tradeNameSnapshot))) incrementNamed(trades, tx.objectStore('trade_types'), trade.tradeNameSnapshot, stamp);
    retainedDraft.tradeSections.forEach((trade) => { const memory = trades.find((item) => item.normalizedName === normalizeName(trade.tradeNameSnapshot)); if (memory) { trade.tradeTypeId = memory.id; trade.tradeNameSnapshot = memory.name; } });
    const allTradeRows = [...retainedDraft.tradeSections, ...retainedDraft.contacts.map((contact) => ({ ...contact, workItems: contact.items.map((item) => ({ taskTextSnapshot: item.content, locationTextSnapshot: '' })) }))];
    for (const row of distinct(allTradeRows, (item) => `${normalizeName(item.tradeNameSnapshot)}\u0000${normalizeName(item.vendorNameSnapshot)}`)) { const trade = trades.find((item) => item.normalizedName === normalizeName(row.tradeNameSnapshot)); if (!trade) continue; const vendor = incrementNamed(vendors, tx.objectStore('trade_vendors'), row.vendorNameSnapshot, stamp, trade.id); if (vendor && 'vendorId' in row) { row.vendorId = vendor.id; row.vendorNameSnapshot = vendor.name; } }
    const taskValues = [
      ...retainedDraft.tradeSections.flatMap((trade) => trade.workItems.map((work) => ({ tradeName: trade.tradeNameSnapshot, value: work.taskTextSnapshot }))),
      ...retainedDraft.contacts.flatMap((contact) => contact.items.map((item) => ({ tradeName: contact.tradeNameSnapshot, value: item.content }))),
    ];
    for (const taskValue of distinct(taskValues, (item) => `${normalizeName(item.tradeName)}\u0000${normalizeName(item.value)}`)) { const trade = trades.find((item) => item.normalizedName === normalizeName(taskValue.tradeName)); if (trade) incrementNamed(tasks, tx.objectStore('trade_tasks'), taskValue.value, stamp, trade.id); }
    for (const locationValue of distinct(retainedDraft.tradeSections.flatMap((trade) => trade.workItems.map((work) => work.locationTextSnapshot)), normalizeName)) incrementNamed(locations, tx.objectStore('location_memories'), locationValue, stamp);
    for (const trade of retainedDraft.tradeSections) { const tradeMemory = trades.find((item) => item.normalizedName === normalizeName(trade.tradeNameSnapshot)); if (!tradeMemory) continue; for (const work of trade.workItems) { const task = tasks.find((item) => item.tradeTypeId === tradeMemory.id && item.normalizedName === normalizeName(work.taskTextSnapshot)); if (task) { work.taskId = task.id; work.taskTextSnapshot = task.name; } const location = locations.find((item) => item.normalizedName === normalizeName(work.locationTextSnapshot)); if (location) { work.locationId = location.id; work.locationTextSnapshot = location.name; } } }
    for (const contact of retainedDraft.contacts) { const trade = trades.find((item) => item.normalizedName === normalizeName(contact.tradeNameSnapshot)); if (!trade) continue; contact.tradeTypeId = trade.id; const vendor = vendors.find((item) => item.tradeTypeId === trade.id && item.normalizedName === normalizeName(contact.vendorNameSnapshot)); if (vendor) contact.vendorId = vendor.id; }
    for (const entry of distinct(retainedDraft.standaloneMaterialEntries, (item) => normalizeName(item.materialTypeSnapshot))) { const type = incrementMaterialType(types, tx.objectStore('material_types'), entry.materialTypeSnapshot, stamp); if (!type) continue; type.recentUnit = entry.unit || type.recentUnit; type.recentSupplierName = entry.supplierNameSnapshot || type.recentSupplierName; tx.objectStore('material_types').put(type); }
    retainedDraft.standaloneMaterialEntries.forEach((entry) => { const type = types.find((item) => item.normalizedName === normalizeName(entry.materialTypeSnapshot)); if (type) { entry.materialTypeId = type.id; entry.materialTypeSnapshot = type.name; } });
    const materialFields: Array<[MaterialEntry, MaterialMemoryField, string]> = retainedDraft.standaloneMaterialEntries.flatMap((entry): Array<[MaterialEntry, MaterialMemoryField, string]> => ([['itemName', entry.itemName], ['specification', entry.specification], ['unit', entry.unit], ['supplier', entry.supplierNameSnapshot]] as Array<[MaterialMemoryField, string]>).map(([fieldType, value]) => [entry, fieldType, value]));
    for (const [entry, fieldType, value] of distinct(materialFields, ([material, field, fieldValue]) => `${material.materialTypeId ?? ''}\u0000${field}\u0000${normalizeName(fieldValue)}`)) { if (entry.materialTypeId) incrementMaterialItem(materialItems, tx.objectStore('material_memory_items'), entry.materialTypeId, fieldType, value, stamp); }
    retainedDraft.updatedAt = stamp; const snapshot: FinalizedDailyReport = { ...structuredClone(retainedDraft), id: crypto.randomUUID(), outputText, templateVersion: DAILY_TEMPLATE_VERSION, finalizedAt: stamp, updatedAt: stamp };
    tx.objectStore('daily_reports').put(snapshot); tx.objectStore('live_report_draft').put(retainedDraft); tx.objectStore('daily_memory_commits').put({ id: 'current', fingerprint, snapshotId: snapshot.id, outputText, committedAt: stamp } satisfies DailyMemoryCommit);
    await txDone(tx); await pruneExpiredReports(); return { snapshot, retainedDraft, outputText, created: true };
  } finally { database.close(); }
}
