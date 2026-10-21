import type { DailyReportV3 } from '../domain/daily';
import { contactTaskMemoryText } from '../daily/entry-workflow';
import { normalizeName } from '../format/normalization';
import { openDatabase, transactionDone } from '../data/db.js';
import { emptyMemoryPayload, memoryPayloadHash, SHARED_MEMORY_STORES, type MemoryPartition } from '../data/memory-partition';
import { loadActiveSharedScope } from '../sync/context';
import { buildSyncOperation } from '../sync/outbox';
import { snapshotMemoryEntries } from '../sync/memory-entries';

export const AUTO_CONFIRM_USAGE = 4;
export interface MemoryApplication { store: string; name: string; parent?: string; fieldType?: string; source: string; }
export function collectMemoryApplications(report: DailyReportV3): MemoryApplication[] {
  const result: MemoryApplication[] = [];
  const add = (store: string, name: string, source: string, parent?: string, fieldType?: string) => {
    if (name.trim() && (!parent || parent.trim())) result.push({ store, name: name.trim(), source, parent, fieldType });
  };
  for (const trade of report.tradeSections) {
    if (!trade.tradeNameSnapshot.trim()) continue;
    add('trade_types', trade.tradeNameSnapshot, `trade:${trade.id}`);
    add('trade_vendors', trade.vendorNameSnapshot, `vendor:${trade.id}`, trade.tradeNameSnapshot);
    for (const work of trade.workItems) {
      add('trade_tasks', work.taskTextSnapshot, `task:${work.id}`, trade.tradeNameSnapshot);

    }
  }
  for (const contact of report.contacts) {
    if (!contact.tradeNameSnapshot.trim()) continue;
    add('trade_types', contact.tradeNameSnapshot, `trade:${contact.id}`);
    add('trade_vendors', contact.vendorNameSnapshot, `vendor:${contact.id}`, contact.tradeNameSnapshot);
    for (const task of contact.items) add('trade_tasks', contactTaskMemoryText(task.content), `task:${task.id}`, contact.tradeNameSnapshot);
  }
  for (const item of report.standaloneMaterialEntries) {
    if (!item.materialTypeSnapshot.trim()) continue;
    add('material_types', item.materialTypeSnapshot, `type:${item.id}`);
    for (const [field, value] of [['itemName', item.itemName], ['specification', item.specification], ['unit', item.unit], ['supplier', item.supplierNameSnapshot]]) {
      add('material_memory_items', value, `${field}:${item.id}`, item.materialTypeSnapshot, field);
    }
  }
  return result;
}

export function applicationIdentity(date: string, item: MemoryApplication): string {
  // The same shared record on two devices is one application, not two retries.
  return JSON.stringify([date, item.source, item.store, normalizeName(item.parent ?? ''), item.fieldType ?? '', normalizeName(item.name)]);
}
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const hash = async (value: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((n) => n.toString(16).padStart(2, '0')).join('');

/** Called at explicit input boundaries, never by autosave, preview or sync. */
export async function recordMemoryApplications(report: DailyReportV3): Promise<void> {
  const scope = await loadActiveSharedScope();
  if (report.shared && (!scope || scope.userId !== report.shared.userId || scope.siteId !== report.shared.siteId)) throw new Error('工地已切換，請回到原工地完成輸入。');
  const partitionId = scope ? `${scope.userId}:${scope.siteId}` : 'local';
  const items = await Promise.all(collectMemoryApplications(report).map(async (item) => ({ item, key: `apply:${await hash(applicationIdentity(report.date, item))}` })));
  const db = await openDatabase() as IDBDatabase;
  try {
    const tx = db.transaction([...SHARED_MEMORY_STORES, 'memory_partitions', 'memory_entry_versions', 'memory_application_events', 'sync_outbox'], 'readwrite');
    const stores: Record<string, Array<Record<string, any>>> = {};
    for (const name of SHARED_MEMORY_STORES) stores[name] = await request(tx.objectStore(name).getAll());
    const ledger = tx.objectStore('memory_application_events');
    const stamp = new Date().toISOString();
    const ensure = (store: string, name: string, parentId?: string, fieldType?: string): Record<string, any> => {
      const normalized = normalizeName(name);
      let row = stores[store].find((row) => (store === 'material_memory_items' ? row.normalizedValue : row.normalizedName) === normalized && (row.tradeTypeId ?? row.materialTypeId) === parentId && row.fieldType === fieldType);
      if (!row) {
        row = { id: crypto.randomUUID(), name: name.trim(), normalizedName: normalized, status: 'candidate', usageCount: 0, finalizedUsageCount: 0, createdAt: stamp, updatedAt: stamp, lastUsedAt: null };
        if (parentId) row[store === 'material_memory_items' ? 'materialTypeId' : 'tradeTypeId'] = parentId;
        if (fieldType) Object.assign(row, { fieldType, value: name.trim(), normalizedValue: normalized });
        if (store === 'material_types') Object.assign(row, { sortOrder: stores[store].length, recentUnit: '', recentSupplierName: '' });
        stores[store].push(row);
      }
      return row;
    };
    for (const { item, key } of items) {
      const ledgerId = `${partitionId}:${key}`;
      if (await request(ledger.get(ledgerId))) continue;
      const parentStore = item.store === 'material_memory_items' ? 'material_types' : 'trade_types';
      const parent = item.parent ? ensure(parentStore, item.parent) : undefined;
      const row = ensure(item.store, item.name, parent?.id, item.fieldType);
      row.usageCount = (row.usageCount ?? 0) + 1;
      row.status = row.status === 'confirmed' || row.usageCount >= AUTO_CONFIRM_USAGE ? 'confirmed' : 'candidate';
      row.lastUsedAt = stamp; row.updatedAt = stamp;
      tx.objectStore(item.store).put(row);
      ledger.put({ id: ledgerId, eventKey: key, entryId: row.id, createdAt: stamp });
      if (scope) {
        const snapshot = { schemaVersion: 1 as const, stores: { [item.store]: [row] } };
        const entry = snapshotMemoryEntries(snapshot)[0];
        const version = await request(tx.objectStore('memory_entry_versions').get(`${scope.siteId}:${row.id}`)) as { revision: number } | undefined;
        const operation = buildSyncOperation({ ...scope, entity: 'memory-entry', entityId: row.id, baseRevision: version?.revision ?? 0,
          payload: { ...entry, learning_key: key, learning_delta: { usage: 1, finalized: 0 } } });
        if (parent) operation.dependsOnEntityIds = [parent.id];
        tx.objectStore('sync_outbox').put(operation);
      }
    }
    const previous = await request(tx.objectStore('memory_partitions').get(partitionId)) as MemoryPartition | undefined;
    const payload = { ...emptyMemoryPayload(), stores };
    tx.objectStore('memory_partitions').put({ id: partitionId, userId: scope?.userId ?? null, siteId: scope?.siteId ?? null, revision: previous?.revision ?? 0, payload, payloadHash: memoryPayloadHash(payload), updatedAt: stamp });
    await transactionDone(tx);
    if (scope) window.dispatchEvent(new Event('memory-outbox-changed'));
  } finally { db.close(); }
}
