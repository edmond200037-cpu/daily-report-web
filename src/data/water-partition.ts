import { openDatabase, transactionDone } from './db.js';
import { loadActiveSharedScope } from '../sync/context';
import { buildSyncOperation } from '../sync/outbox';
import type { SharedScope } from '../domain/shared';
import { buildFieldMutations } from '../sync/field-mutations';

export interface WaterSnapshotPayload { schemaVersion: 1; points: unknown[]; logs: unknown[]; }
export interface WaterPartition extends SharedScope { id: string; revision: number; payload: WaterSnapshotPayload; payloadHash: string; updatedAt: string; }

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const partitionId = (scope: SharedScope | null): string => scope ? `${scope.userId}:${scope.siteId}` : 'local';
export const waterPayloadHash = (payload: WaterSnapshotPayload): string => JSON.stringify(payload);

/** A user edit and its shared intent commit together; retention never enters here. */
export async function commitActiveWaterPartition<T>(mutate: (payload: WaterSnapshotPayload) => T): Promise<T> {
  const scope = await loadActiveSharedScope();
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['water_level_points', 'water_level_logs', 'water_partitions', 'sync_outbox'], 'readwrite');
    const done = transactionDone(tx);
    try {
      const id = partitionId(scope);
      const [points, logs, existing] = await Promise.all([
        request(tx.objectStore('water_level_points').getAll()), request(tx.objectStore('water_level_logs').getAll()),
        request(tx.objectStore('water_partitions').get(id)) as Promise<WaterPartition | undefined>,
      ]);
      const payload: WaterSnapshotPayload = { schemaVersion: 1, points, logs };
      const result = mutate(payload);
      for (const [store, rows] of [['water_level_points', payload.points], ['water_level_logs', payload.logs]] as const) {
        const target = tx.objectStore(store); target.clear(); for (const row of rows) target.put(row);
      }
      const partition: WaterPartition = { id, userId: scope?.userId ?? '', siteId: scope?.siteId ?? '', revision: existing?.revision ?? 0, payload, payloadHash: waterPayloadHash(payload), updatedAt: new Date().toISOString() };
      tx.objectStore('water_partitions').put(partition);
      if (scope) {
        const changes = buildFieldMutations('water', existing?.payload as unknown as Record<string, unknown> | undefined, payload as unknown as Record<string, unknown>);
        if (changes.length) tx.objectStore('sync_outbox').put(buildSyncOperation({ ...scope, entity: 'water-patch', entityId: scope.siteId, baseRevision: partition.revision, payload: { changes } }));
      }
      await done; return result;
    } catch (error) {
      try { tx.abort(); } catch { /* A failed transaction may already be aborted. */ }
      await done.catch(() => undefined); throw error;
    }
  } finally { database.close(); }
}

async function capture(database: IDBDatabase): Promise<WaterSnapshotPayload> {
  const tx = database.transaction(['water_level_points', 'water_level_logs']);
  const [points, logs] = await Promise.all([
    request(tx.objectStore('water_level_points').getAll()) as Promise<unknown[]>,
    request(tx.objectStore('water_level_logs').getAll()) as Promise<unknown[]>,
  ]);
  return { schemaVersion: 1, points, logs };
}

export async function persistActiveWaterPartition(): Promise<boolean> {
  const scope = await loadActiveSharedScope().catch(() => null);
  const database = await openDatabase() as IDBDatabase;
  try {
    const payload = await capture(database); const payloadHash = waterPayloadHash(payload); const id = partitionId(scope);
    const existing = await request(database.transaction('water_partitions').objectStore('water_partitions').get(id)) as WaterPartition | undefined;
    if (existing?.payloadHash === payloadHash) return false;
    const tx = database.transaction(scope ? ['water_partitions', 'sync_outbox'] : ['water_partitions'], 'readwrite');
    const partition: WaterPartition = { id, userId: scope?.userId ?? '', siteId: scope?.siteId ?? '', revision: existing?.revision ?? 0, payload, payloadHash, updatedAt: new Date().toISOString() };
    tx.objectStore('water_partitions').put(partition);
    const hasContent = payload.points.length > 0 || payload.logs.length > 0;
    if (scope && (existing || hasContent)) {
      const queue = tx.objectStore('sync_outbox');
      // v2 changes are incremental. Do not coalesce them against a local
      // partition: doing so would silently drop an earlier offline edit.
      const changes = buildFieldMutations('water', existing?.payload as unknown as Record<string, unknown> | undefined, payload as unknown as Record<string, unknown>);
      if (changes.length) queue.put(buildSyncOperation({ ...scope, entity: 'water-patch', entityId: scope.siteId, baseRevision: partition.revision, payload: { changes } }));
    }
    await transactionDone(tx); return true;
  } finally { database.close(); }
}

export async function restoreActiveWaterPartition(): Promise<void> {
  const scope = await loadActiveSharedScope().catch(() => null);
  const database = await openDatabase() as IDBDatabase;
  try {
    const id = partitionId(scope);
    const partition = await request(database.transaction('water_partitions').objectStore('water_partitions').get(id)) as WaterPartition | undefined;
    if (!partition && !scope) {
      const payload = await capture(database); const tx = database.transaction('water_partitions', 'readwrite');
      tx.objectStore('water_partitions').put({ id, userId: '', siteId: '', revision: 0, payload, payloadHash: waterPayloadHash(payload), updatedAt: new Date().toISOString() } satisfies WaterPartition);
      await transactionDone(tx); return;
    }
    const tx = database.transaction(['water_level_points', 'water_level_logs'], 'readwrite');
    const points = tx.objectStore('water_level_points'); const logs = tx.objectStore('water_level_logs');
    points.clear(); logs.clear();
    for (const row of partition?.payload.points ?? []) points.put(row);
    for (const row of partition?.payload.logs ?? []) logs.put(row);
    await transactionDone(tx);
  } finally { database.close(); }
}
