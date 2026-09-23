import { openDatabase, transactionDone } from './db.js';
import { loadActiveSharedScope } from '../sync/context';
import { buildSyncOperation } from '../sync/outbox';
import type { SharedScope } from '../domain/shared';
import type { SyncOperation } from '../sync/types';
import { changedMemoryEntries, snapshotMemoryEntries, type MemoryEntryPayload } from '../sync/memory-entries';

export const SHARED_MEMORY_STORES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'app_settings'] as const;
export interface MemorySnapshotPayload { schemaVersion: 1; stores: Record<string, unknown[]>; }
export interface MemoryPartition { id: string; userId: string | null; siteId: string | null; revision: number; payload: MemorySnapshotPayload; payloadHash: string; updatedAt: string; }

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const partitionId = (scope: SharedScope | null): string => scope ? `${scope.userId}:${scope.siteId}` : 'local';
export const memoryPayloadHash = (payload: MemorySnapshotPayload): string => JSON.stringify(payload);
export const emptyMemoryPayload = (): MemorySnapshotPayload => ({ schemaVersion: 1, stores: Object.fromEntries(SHARED_MEMORY_STORES.map((name) => [name, []])) });

async function capture(database: IDBDatabase): Promise<MemorySnapshotPayload> {
  const tx = database.transaction([...SHARED_MEMORY_STORES]);
  const rows = await Promise.all(SHARED_MEMORY_STORES.map((name) => request(tx.objectStore(name).getAll()) as Promise<unknown[]>));
  const stores = Object.fromEntries(SHARED_MEMORY_STORES.map((name, index) => [name, rows[index]]));
  return { schemaVersion: 1, stores };
}

export async function persistActiveMemoryPartition(learningKey?: string): Promise<boolean> {
  const scope = await loadActiveSharedScope().catch(() => null);
  const database = await openDatabase() as IDBDatabase;
  try {
    const payload = await capture(database); const hash = memoryPayloadHash(payload); const id = partitionId(scope);
    const existing = await request(database.transaction('memory_partitions').objectStore('memory_partitions').get(id)) as MemoryPartition | undefined;
    if (existing?.payloadHash === hash) return false;
    const stores = scope ? ['memory_partitions', 'sync_outbox', 'memory_entry_versions'] : ['memory_partitions'];
    const tx = database.transaction(stores, 'readwrite'); const now = new Date().toISOString();
    const partition: MemoryPartition = { id, userId: scope?.userId ?? null, siteId: scope?.siteId ?? null, revision: existing?.revision ?? 0, payload, payloadHash: hash, updatedAt: now };
    tx.objectStore('memory_partitions').put(partition);
    if (scope) {
      const queue = tx.objectStore('sync_outbox'); const queued = await request(queue.getAll()) as SyncOperation[];
      const versions = tx.objectStore('memory_entry_versions');
      const priorEntries = new Map(snapshotMemoryEntries(existing?.payload ?? emptyMemoryPayload()).map((entry) => [entry.id, entry]));
      // A newly selected site starts empty. Existing cached partitions are the
      // baseline; local-only memories must go through explicit import.
      for (const entry of changedMemoryEntries(existing?.payload ?? emptyMemoryPayload(), payload)) {
        const old = queued.find((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'memory-entry' && row.entityId === entry.id && row.status === 'pending' && row.attempts === 0);
        if (old) queue.delete(old.id);
        const version = await request(versions.get(`${scope.siteId}:${entry.id}`)) as { revision: number } | undefined;
        const before = priorEntries.get(entry.id);
        const delta = { usage: Math.max(0, entry.usage_count - (before?.usage_count ?? 0)), finalized: Math.max(0, entry.finalized_usage_count - (before?.finalized_usage_count ?? 0)) };
        queue.put(buildSyncOperation({ ...scope, entity: 'memory-entry', entityId: entry.id, baseRevision: version?.revision ?? 0,
          payload: learningKey ? { ...entry, learning_key: learningKey, learning_delta: delta } : entry }));
      }
    }
    await transactionDone(tx);
    if (scope) window.dispatchEvent(new Event('memory-outbox-changed'));
    return true;
  } finally { database.close(); }
}

export async function readLocalMemoryImportSource(): Promise<MemorySnapshotPayload | null> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const row = await request(database.transaction('memory_partitions').objectStore('memory_partitions').get('local')) as MemoryPartition | undefined;
    return row?.payload ?? null;
  } finally { database.close(); }
}

export async function queueMemoryImport(scope: SharedScope, entries: MemoryEntryPayload[], retireLegacySnapshot = false): Promise<void> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['sync_outbox', 'sync_recovery_backups', 'memory_partitions', ...SHARED_MEMORY_STORES], 'readwrite');
    if (retireLegacySnapshot) {
      const queue = tx.objectStore('sync_outbox');
      const old = (await request(queue.getAll()) as SyncOperation[]).filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'memory');
      for (const operation of old) {
        tx.objectStore('sync_recovery_backups').put({ id: `memory-legacy:${operation.id}`, ...scope, operation, createdAt: new Date().toISOString() });
        queue.delete(operation.id);
      }
    }
    const partition = await request(tx.objectStore('memory_partitions').get(partitionId(scope))) as MemoryPartition | undefined;
    const payload = structuredClone(partition?.payload ?? emptyMemoryPayload());
    for (const entry of entries) {
      if (entry.kind === 'template') {
        const setting = payload.stores.app_settings.find((row) => (row as { id: string }).id === 'daily_special_templates_v1') as { id: string; templates: unknown[] } | undefined;
        if (setting) { setting.templates = setting.templates.filter((row) => (row as { id: string }).id !== entry.id); setting.templates.push(entry.payload); }
        else payload.stores.app_settings.push({ id: 'daily_special_templates_v1', templates: [entry.payload] });
      } else {
        const store = ({ site: 'sites', trade: 'trade_types', vendor: 'trade_vendors', task: 'trade_tasks', location: 'location_memories', 'material-type': 'material_types', 'material-item': 'material_memory_items' } as const)[entry.kind];
        payload.stores[store] = payload.stores[store].filter((row) => (row as { id: string }).id !== entry.id);
        payload.stores[store].push(entry.payload);
      }
      const { base_revision, ...payloadEntry } = entry;
      tx.objectStore('sync_outbox').put(buildSyncOperation({ ...scope, entity: 'memory-entry', entityId: entry.id, baseRevision: base_revision ?? 0, payload: payloadEntry }));
    }
    tx.objectStore('memory_partitions').put({ id: partitionId(scope), ...scope, revision: partition?.revision ?? 0, payload, payloadHash: memoryPayloadHash(payload), updatedAt: new Date().toISOString() } satisfies MemoryPartition);
    for (const name of SHARED_MEMORY_STORES) {
      const store = tx.objectStore(name); store.clear();
      for (const row of payload.stores[name] ?? []) store.put(row);
    }
    await transactionDone(tx);
    window.dispatchEvent(new Event('memory-outbox-changed'));
  } finally { database.close(); }
}

export async function restoreActiveMemoryPartition(): Promise<void> {
  const scope = await loadActiveSharedScope().catch(() => null);
  const database = await openDatabase() as IDBDatabase;
  try {
    const partition = await request(database.transaction('memory_partitions').objectStore('memory_partitions').get(partitionId(scope))) as MemoryPartition | undefined;
    if (!partition && !scope) {
      const payload = await capture(database);
      const tx = database.transaction('memory_partitions', 'readwrite');
      tx.objectStore('memory_partitions').put({ id: 'local', userId: null, siteId: null, revision: 0, payload, payloadHash: memoryPayloadHash(payload), updatedAt: new Date().toISOString() } satisfies MemoryPartition);
      await transactionDone(tx);
      return;
    }
    const tx = database.transaction([...SHARED_MEMORY_STORES], 'readwrite');
    for (const name of SHARED_MEMORY_STORES) {
      const store = tx.objectStore(name); store.clear();
      for (const row of partition?.payload.stores[name] ?? []) store.put(row);
    }
    await transactionDone(tx);
  } finally { database.close(); }
}
