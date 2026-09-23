import type { DailyReportV3 } from '../domain/daily';
import type { SharedScope } from '../domain/shared';
import { getSupabaseClient } from '../data/remote/supabase-client';
import { openDatabase, transactionDone } from '../data/db.js';
import { SHARED_MEMORY_STORES, memoryPayloadHash, type MemoryPartition, type MemorySnapshotPayload } from '../data/memory-partition';
import { waterPayloadHash, type WaterPartition, type WaterSnapshotPayload } from '../data/water-partition';
import { listReadyOperations, markOperationFailed, markOperationSending } from './outbox';
import type { SyncConflict, SyncCursor, SyncOperation } from './types';
import { applyFieldMutations, type FieldMutation } from './field-mutations';

interface MutationResult { status: 'applied' | 'duplicate' | 'conflict'; entity_id: string; revision: number; sequence?: number; remote_payload?: unknown; }
interface ChangeRow { sequence: number; entity: string; entity_id: string; operation: 'upsert' | 'delete'; revision: number; changed_at: string; }
interface RemoteDraftRow { id: string; report_date: string; payload: DailyReportV3; revision: number; }
interface RemoteMemoryRow { site_id: string; payload: MemorySnapshotPayload; revision: number; }
interface RemoteWaterRow { site_id: string; payload: WaterSnapshotPayload; revision: number; }
export interface SyncRunResult { applied: number; pulled: number; memoryPulled: number; waterPulled: number; conflicts: number; failed: number; }

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });

async function pushOperation(operation: SyncOperation): Promise<MutationResult> {
  const request = operation.entity === 'daily-draft'
    ? getSupabaseClient().rpc('apply_daily_draft_mutation', {
        p_site_id: operation.siteId, p_mutation_id: operation.mutationId, p_entity_id: operation.entityId,
        p_base_revision: operation.baseRevision, p_payload: operation.payload,
      })
    : operation.entity === 'daily-patch'
      ? getSupabaseClient().rpc('apply_daily_field_mutation', {
          p_site_id: operation.siteId, p_mutation_id: operation.mutationId, p_entity_id: operation.entityId,
          p_report_date: (operation.payload as { reportDate: string }).reportDate, p_changes: (operation.payload as { changes: FieldMutation[] }).changes,
        })
    : operation.entity === 'memory'
      ? getSupabaseClient().rpc('apply_memory_snapshot_mutation', {
          p_site_id: operation.siteId, p_mutation_id: operation.mutationId,
          p_base_revision: operation.baseRevision, p_payload: operation.payload,
        })
      : operation.entity === 'water-patch'
        ? getSupabaseClient().rpc('apply_water_field_mutation', {
            p_site_id: operation.siteId, p_mutation_id: operation.mutationId,
            p_changes: (operation.payload as { changes: FieldMutation[] }).changes,
          })
      : operation.entity === 'water-snapshot'
        ? getSupabaseClient().rpc('apply_water_snapshot_mutation', {
            p_site_id: operation.siteId, p_mutation_id: operation.mutationId,
            p_base_revision: operation.baseRevision, p_payload: operation.payload,
          })
        : null;
  if (!request) throw new Error(`尚未支援同步實體：${operation.entity}`);
  const { data, error } = await request;
  if (error) throw error;
  return data as MutationResult;
}

async function acceptMutation(operation: SyncOperation, result: MutationResult): Promise<void> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const storeNames = operation.entity === 'memory' || operation.entity === 'water-snapshot' || operation.entity === 'water-patch'
      ? [operation.entity === 'memory' ? 'memory_partitions' : 'water_partitions', 'sync_outbox']
      : ['live_report_draft', 'draft_partitions', 'sync_outbox'];
    const tx = database.transaction(storeNames, 'readwrite');
    const queue = tx.objectStore('sync_outbox');
    if (operation.entity === 'memory') {
      const id = `${operation.userId}:${operation.siteId}`;
      const store = tx.objectStore('memory_partitions');
      const partition = await request(store.get(id)) as MemoryPartition | undefined;
      if (partition) store.put({ ...partition, revision: Math.max(partition.revision, result.revision), updatedAt: new Date().toISOString() });
    } else if (operation.entity === 'water-snapshot' || operation.entity === 'water-patch') {
      const id = `${operation.userId}:${operation.siteId}`;
      const store = tx.objectStore('water_partitions');
      const partition = await request(store.get(id)) as WaterPartition | undefined;
      if (partition) store.put({ ...partition, revision: Math.max(partition.revision, result.revision), updatedAt: new Date().toISOString() });
    } else {
      const draftStore = tx.objectStore('live_report_draft');
      const draft = await request(draftStore.get('current')) as DailyReportV3 | undefined;
      if (draft?.shared?.cloudId === operation.entityId && draft.shared.siteId === operation.siteId) {
        draft.shared.revision = Math.max(draft.shared.revision, result.revision);
        draftStore.put(draft);
        tx.objectStore('draft_partitions').put({ id: `${operation.userId}:${operation.siteId}:${draft.date}`, userId: operation.userId, siteId: operation.siteId, reportDate: draft.date, report: structuredClone(draft), updatedAt: new Date().toISOString() });
      }
    }
    const queued = await request(queue.getAll()) as SyncOperation[];
    queued.filter((row) => row.id !== operation.id && row.entityId === operation.entityId && row.siteId === operation.siteId && row.userId === operation.userId && row.baseRevision === operation.baseRevision)
      .forEach((row) => queue.put({ ...row, baseRevision: result.revision, updatedAt: new Date().toISOString() }));
    queue.delete(operation.id);
    await transactionDone(tx);
  } finally { database.close(); }
}

async function preserveConflict(operation: SyncOperation, result: MutationResult): Promise<void> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['sync_outbox', 'sync_conflicts'], 'readwrite');
    const now = new Date().toISOString();
    tx.objectStore('sync_outbox').put({ ...operation, status: 'conflict', updatedAt: now });
    const conflict: SyncConflict = { id: operation.id, operationId: operation.id, userId: operation.userId, siteId: operation.siteId, localPayload: operation.payload, remotePayload: result.remote_payload, remoteRevision: result.revision, createdAt: now };
    tx.objectStore('sync_conflicts').put(conflict);
    await transactionDone(tx);
  } finally { database.close(); }
}

const cursorId = (scope: SharedScope): string => `${scope.userId}:${scope.siteId}`;

async function loadCursor(scope: SharedScope): Promise<number> {
  const database = await openDatabase() as IDBDatabase;
  try { return ((await request(database.transaction('sync_cursors').objectStore('sync_cursors').get(cursorId(scope))) as SyncCursor | undefined)?.cursor) ?? 0; }
  finally { database.close(); }
}

const hasDraftContent = (draft: DailyReportV3): boolean => Boolean(draft.siteNameSnapshot.trim() || draft.tradeSections.length || draft.standaloneMaterialEntries.length || draft.contacts.length || draft.specialItems.length);

async function applyRemoteDraft(scope: SharedScope, change: ChangeRow, remote: RemoteDraftRow): Promise<'pulled' | 'conflict' | 'skipped'> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['live_report_draft', 'draft_partitions', 'sync_outbox', 'sync_conflicts', 'sync_cursors'], 'readwrite');
    const draftStore = tx.objectStore('live_report_draft');
    const current = await request(draftStore.get('current')) as DailyReportV3 | undefined;
    const queue = await request(tx.objectStore('sync_outbox').getAll()) as SyncOperation[];
    const pending = queue.find((row) => row.userId === scope.userId && row.siteId === scope.siteId && (row.entity === 'daily-draft' || row.entity === 'daily-patch') && (row.entityId === remote.id || (row.payload as DailyReportV3 | undefined)?.date === remote.report_date));
    let outcome: 'pulled' | 'conflict' | 'skipped' = 'skipped';
    if (pending?.entity === 'daily-patch') {
      const next = applyFieldMutations(remote.payload as unknown as Record<string, unknown>, (pending.payload as { changes: FieldMutation[] }).changes) as unknown as DailyReportV3;
      next.id = 'current'; next.shared = { userId: scope.userId, siteId: scope.siteId, cloudId: remote.id, reportDate: remote.report_date, revision: remote.revision };
      draftStore.put(next);
      tx.objectStore('draft_partitions').put({ id: `${scope.userId}:${scope.siteId}:${remote.report_date}`, userId: scope.userId, siteId: scope.siteId, reportDate: remote.report_date, report: structuredClone(next), updatedAt: new Date().toISOString() });
      outcome = 'pulled';
    } else if (pending || (current && current.date === remote.report_date && !current.shared && hasDraftContent(current))) {
      const now = new Date().toISOString();
      const conflictId = pending?.id ?? `pull:${scope.siteId}:${remote.id}`;
      const conflict: SyncConflict = { id: conflictId, operationId: pending?.id ?? '', ...scope, localPayload: pending?.payload ?? current, remotePayload: remote.payload, remoteRevision: remote.revision, createdAt: now };
      tx.objectStore('sync_conflicts').put(conflict);
      if (pending) tx.objectStore('sync_outbox').put({ ...pending, status: 'conflict', updatedAt: now });
      outcome = 'conflict';
    } else {
      const next = structuredClone(remote.payload);
      next.id = 'current'; next.shared = { userId: scope.userId, siteId: scope.siteId, cloudId: remote.id, reportDate: remote.report_date, revision: remote.revision };
      tx.objectStore('draft_partitions').put({ id: `${scope.userId}:${scope.siteId}:${remote.report_date}`, userId: scope.userId, siteId: scope.siteId, reportDate: remote.report_date, report: structuredClone(next), updatedAt: new Date().toISOString() });
      if (!current || current.date === remote.report_date) draftStore.put(next);
      outcome = 'pulled';
    }
    const cursor: SyncCursor = { id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: new Date().toISOString() };
    tx.objectStore('sync_cursors').put(cursor);
    await transactionDone(tx);
    return outcome;
  } finally { database.close(); }
}

async function applyRemoteMemory(scope: SharedScope, change: ChangeRow, remote: RemoteMemoryRow): Promise<'pulled' | 'conflict'> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['memory_partitions', 'sync_outbox', 'sync_conflicts', 'sync_cursors', ...SHARED_MEMORY_STORES], 'readwrite');
    const queueStore = tx.objectStore('sync_outbox');
    const queue = await request(queueStore.getAll()) as SyncOperation[];
    const pending = queue.find((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'memory');
    let outcome: 'pulled' | 'conflict';
    if (pending) {
      const now = new Date().toISOString();
      tx.objectStore('sync_conflicts').put({
        id: pending.id, operationId: pending.id, ...scope,
        localPayload: pending.payload, remotePayload: remote.payload,
        remoteRevision: remote.revision, createdAt: now,
      } satisfies SyncConflict);
      queueStore.put({ ...pending, status: 'conflict', updatedAt: now });
      outcome = 'conflict';
    } else {
      const now = new Date().toISOString();
      const partition: MemoryPartition = {
        id: `${scope.userId}:${scope.siteId}`, ...scope, revision: remote.revision,
        payload: remote.payload, payloadHash: memoryPayloadHash(remote.payload), updatedAt: now,
      };
      tx.objectStore('memory_partitions').put(partition);
      for (const name of SHARED_MEMORY_STORES) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of remote.payload.stores[name] ?? []) store.put(row);
      }
      outcome = 'pulled';
    }
    tx.objectStore('sync_cursors').put({ id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: new Date().toISOString() } satisfies SyncCursor);
    await transactionDone(tx);
    return outcome;
  } finally { database.close(); }
}

async function applyRemoteWater(scope: SharedScope, change: ChangeRow, remote: RemoteWaterRow): Promise<'pulled' | 'conflict'> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['water_partitions', 'water_level_points', 'water_level_logs', 'sync_outbox', 'sync_conflicts', 'sync_cursors'], 'readwrite');
    const queueStore = tx.objectStore('sync_outbox');
    const queue = await request(queueStore.getAll()) as SyncOperation[];
    const pending = queue.find((row) => row.userId === scope.userId && row.siteId === scope.siteId && (row.entity === 'water-snapshot' || row.entity === 'water-patch'));
    let outcome: 'pulled' | 'conflict';
    if (pending?.entity === 'water-patch') {
      const payload = applyFieldMutations(remote.payload as unknown as Record<string, unknown>, (pending.payload as { changes: FieldMutation[] }).changes) as unknown as WaterSnapshotPayload;
      const now = new Date().toISOString();
      tx.objectStore('water_partitions').put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: remote.revision, payload, payloadHash: waterPayloadHash(payload), updatedAt: now } satisfies WaterPartition);
      const points = tx.objectStore('water_level_points'); const logs = tx.objectStore('water_level_logs'); points.clear(); logs.clear();
      for (const row of payload.points) points.put(row); for (const row of payload.logs) logs.put(row);
      outcome = 'pulled';
    } else if (pending) {
      const now = new Date().toISOString();
      tx.objectStore('sync_conflicts').put({ id: pending.id, operationId: pending.id, ...scope, localPayload: pending.payload, remotePayload: remote.payload, remoteRevision: remote.revision, createdAt: now } satisfies SyncConflict);
      queueStore.put({ ...pending, status: 'conflict', updatedAt: now }); outcome = 'conflict';
    } else {
      const now = new Date().toISOString();
      tx.objectStore('water_partitions').put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: remote.revision, payload: remote.payload, payloadHash: waterPayloadHash(remote.payload), updatedAt: now } satisfies WaterPartition);
      const points = tx.objectStore('water_level_points'); const logs = tx.objectStore('water_level_logs');
      points.clear(); logs.clear();
      for (const row of remote.payload.points) points.put(row);
      for (const row of remote.payload.logs) logs.put(row);
      outcome = 'pulled';
    }
    tx.objectStore('sync_cursors').put({ id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: new Date().toISOString() } satisfies SyncCursor);
    await transactionDone(tx); return outcome;
  } finally { database.close(); }
}

async function pullRemoteChanges(scope: SharedScope): Promise<{ pulled: number; memoryPulled: number; waterPulled: number; conflicts: number }> {
  let cursor = await loadCursor(scope); let pulled = 0; let memoryPulled = 0; let waterPulled = 0; let conflicts = 0;
  for (;;) {
    const { data, error } = await getSupabaseClient().rpc('pull_site_changes', { p_site_id: scope.siteId, p_cursor: cursor, p_limit: 100 });
    if (error) throw error;
    const changes = (data ?? []) as ChangeRow[];
    for (const change of changes) {
      if (change.entity === 'daily-draft' && change.operation === 'upsert') {
        const { data: remote, error: remoteError } = await getSupabaseClient().from('daily_drafts').select('id,report_date,payload,revision').eq('id', change.entity_id).single();
        if (remoteError) throw remoteError;
        const outcome = await applyRemoteDraft(scope, change, remote as unknown as RemoteDraftRow);
        if (outcome === 'pulled') pulled += 1; else if (outcome === 'conflict') conflicts += 1;
      } else if (change.entity === 'memory' && change.operation === 'upsert') {
        const { data: remote, error: remoteError } = await getSupabaseClient().from('memory_snapshots').select('site_id,payload,revision').eq('site_id', scope.siteId).single();
        if (remoteError) throw remoteError;
        const outcome = await applyRemoteMemory(scope, change, remote as unknown as RemoteMemoryRow);
        if (outcome === 'pulled') { pulled += 1; memoryPulled += 1; } else conflicts += 1;
      } else if (change.entity === 'water-snapshot' && change.operation === 'upsert') {
        const { data: remote, error: remoteError } = await getSupabaseClient().from('water_snapshots').select('site_id,payload,revision').eq('site_id', scope.siteId).single();
        if (remoteError) throw remoteError;
        const outcome = await applyRemoteWater(scope, change, remote as unknown as RemoteWaterRow);
        if (outcome === 'pulled') { pulled += 1; waterPulled += 1; } else conflicts += 1;
      } else {
        const database = await openDatabase() as IDBDatabase;
        try { const tx = database.transaction('sync_cursors', 'readwrite'); tx.objectStore('sync_cursors').put({ id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: new Date().toISOString() } satisfies SyncCursor); await transactionDone(tx); }
        finally { database.close(); }
      }
      cursor = change.sequence;
    }
    if (changes.length < 100) break;
  }
  return { pulled, memoryPulled, waterPulled, conflicts };
}

async function runSyncOnceUnlocked(scope: SharedScope): Promise<SyncRunResult> {
  const summary: SyncRunResult = { applied: 0, pulled: 0, memoryPulled: 0, waterPulled: 0, conflicts: 0, failed: 0 };
  for (const pending of await listReadyOperations(scope)) {
    const operation = await markOperationSending(pending);
    try {
      const result = await pushOperation(operation);
      if (result.status === 'conflict') { await preserveConflict(operation, result); summary.conflicts += 1; }
      else { await acceptMutation(operation, result); summary.applied += 1; }
    } catch (error) { await markOperationFailed(operation, error); summary.failed += 1; }
  }
  try { const pulled = await pullRemoteChanges(scope); summary.pulled += pulled.pulled; summary.memoryPulled += pulled.memoryPulled; summary.waterPulled += pulled.waterPulled; summary.conflicts += pulled.conflicts; }
  catch { summary.failed += 1; }
  return summary;
}

export async function runSyncOnce(scope: SharedScope): Promise<SyncRunResult> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return runSyncOnceUnlocked(scope);
  return locks.request(`construction-report-sync:${scope.userId}:${scope.siteId}`, () => runSyncOnceUnlocked(scope));
}
