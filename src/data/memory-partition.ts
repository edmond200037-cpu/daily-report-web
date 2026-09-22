import { openDatabase, transactionDone } from './db.js';
import { loadActiveSharedScope } from '../sync/context';
import { buildSyncOperation } from '../sync/outbox';
import type { SharedScope } from '../domain/shared';
import type { SyncOperation } from '../sync/types';

export const SHARED_MEMORY_STORES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'app_settings'] as const;
export interface MemorySnapshotPayload { schemaVersion: 1; stores: Record<string, unknown[]>; }
export interface MemoryPartition { id: string; userId: string | null; siteId: string | null; revision: number; payload: MemorySnapshotPayload; payloadHash: string; updatedAt: string; }

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const partitionId = (scope: SharedScope | null): string => scope ? `${scope.userId}:${scope.siteId}` : 'local';
export const memoryPayloadHash = (payload: MemorySnapshotPayload): string => JSON.stringify(payload);

async function capture(database: IDBDatabase): Promise<MemorySnapshotPayload> {
  const tx = database.transaction([...SHARED_MEMORY_STORES]);
  const rows = await Promise.all(SHARED_MEMORY_STORES.map((name) => request(tx.objectStore(name).getAll()) as Promise<unknown[]>));
  const stores = Object.fromEntries(SHARED_MEMORY_STORES.map((name, index) => [name, rows[index]]));
  return { schemaVersion: 1, stores };
}

export async function persistActiveMemoryPartition(): Promise<boolean> {
  const scope = await loadActiveSharedScope().catch(() => null);
  const database = await openDatabase() as IDBDatabase;
  try {
    const payload = await capture(database); const hash = memoryPayloadHash(payload); const id = partitionId(scope);
    const existing = await request(database.transaction('memory_partitions').objectStore('memory_partitions').get(id)) as MemoryPartition | undefined;
    if (existing?.payloadHash === hash) return false;
    const stores = scope ? ['memory_partitions', 'sync_outbox'] : ['memory_partitions'];
    const tx = database.transaction(stores, 'readwrite'); const now = new Date().toISOString();
    const partition: MemoryPartition = { id, userId: scope?.userId ?? null, siteId: scope?.siteId ?? null, revision: existing?.revision ?? 0, payload, payloadHash: hash, updatedAt: now };
    tx.objectStore('memory_partitions').put(partition);
    const hasContent = Object.values(payload.stores).some((rows) => rows.length > 0);
    if (scope && (existing || hasContent)) {
      const queue = tx.objectStore('sync_outbox'); const queued = await request(queue.getAll()) as SyncOperation[];
      queued.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'memory' && row.status === 'pending' && row.attempts === 0).forEach((row) => queue.delete(row.id));
      queue.put(buildSyncOperation({ ...scope, entity: 'memory', entityId: scope.siteId, baseRevision: partition.revision, payload }));
    }
    await transactionDone(tx); return true;
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
