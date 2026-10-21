import type { DailyReportV3 } from '../domain/daily';
import type { SharedScope } from '../domain/shared';
import { openDatabase, transactionDone } from '../data/db.js';
import { getSupabaseClient } from '../data/remote/supabase-client';
import { emptyMemoryPayload, memoryPayloadHash, SHARED_MEMORY_STORES, type MemoryPartition, type MemorySnapshotPayload } from '../data/memory-partition';
import { waterPayloadHash, type WaterPartition, type WaterSnapshotPayload } from '../data/water-partition';
import { buildSyncOperation } from './outbox';
import { memoryEntryStore, memoryIdentity, snapshotMemoryEntries, type MemoryEntryPayload, type RemoteMemoryEntry } from './memory-entries';
import type { SyncOperation } from './types';

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
const rank = (kind: MemoryEntryPayload['kind']): number => ['vendor', 'task', 'material-item'].includes(kind) ? 1 : 0;
const active = (row: RemoteMemoryEntry): boolean => !row.deleted_at;
const problemMemory = (row: SyncOperation): boolean => row.entity === 'memory-entry' && row.status === 'blocked' && (row.lastErrorCode === '23503' || row.lastErrorCode === '23505');
const legacyDaily = (row: SyncOperation): boolean => row.entity === 'daily-draft' && (row.status === 'conflict' || row.status === 'blocked');
const legacyWater = (row: SyncOperation): boolean => row.entity === 'water-snapshot' && (row.status === 'conflict' || row.status === 'blocked');
const legacyMemory = (row: SyncOperation): boolean => row.entity === 'memory';

interface RemoteDaily { id: string; report_date: string; payload: DailyReportV3; revision: number; }
interface RemoteWater { site_id: string; payload: WaterSnapshotPayload; revision: number; }
interface MemoryAdoption { localId: string; remote: RemoteMemoryEntry; }

export interface SyncRecoveryPreview {
  fingerprint: string;
  legacyDaily: number;
  legacyWater: number;
  legacyMemory: number;
  memoryProblems: number;
  cloudMemoryMatches: number;
  memoryToResend: number;
  remainingManual: number;
  targetOperationIds: string[];
  dailyRows: RemoteDaily[];
  waterRow: RemoteWater | null;
  memoryRows: RemoteMemoryEntry[];
  memoryAdoptions: MemoryAdoption[];
  memoryToQueue: MemoryEntryPayload[];
}

export interface SyncRecoveryResult {
  archived: number;
  adoptedCloudMemory: number;
  requeued: number;
  remainingManual: number;
}

async function readOperationsAndPartition(scope: SharedScope): Promise<{ operations: SyncOperation[]; partition?: MemoryPartition }> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['sync_outbox', 'memory_partitions']);
    const [operations, partition] = await Promise.all([
      request(tx.objectStore('sync_outbox').getAll()) as Promise<SyncOperation[]>,
      request(tx.objectStore('memory_partitions').get(`${scope.userId}:${scope.siteId}`)) as Promise<MemoryPartition | undefined>,
    ]);
    return { operations: operations.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId), partition };
  } finally { database.close(); }
}

async function readRemoteMemory(siteId: string): Promise<RemoteMemoryEntry[]> {
  const rows: RemoteMemoryEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient().from('memory_entries')
      .select('id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at')
      .eq('site_id', siteId).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []) as RemoteMemoryEntry[]);
    if (!data || data.length < 500) return rows;
  }
}

export function buildMemoryRecovery(entries: MemoryEntryPayload[], remoteRows: RemoteMemoryEntry[]): { adoptions: MemoryAdoption[]; queued: MemoryEntryPayload[]; manual: number } {
  const remote = remoteRows.filter(active);
  const byIdentity = new Map(remote.map((row) => [memoryIdentity(row), row]));
  const remoteIds = new Set(remote.map((row) => row.id));
  const localById = new Map(entries.map((row) => [row.id, row]));
  const idMap = new Map<string, string>();
  const adoptions: MemoryAdoption[] = []; const queued: MemoryEntryPayload[] = []; let manual = 0;
  const ordered = [...entries].sort((a, b) => rank(a.kind) - rank(b.kind));

  for (const entry of ordered.filter((row) => rank(row.kind) === 0)) {
    const match = byIdentity.get(memoryIdentity(entry));
    if (match) { idMap.set(entry.id, match.id); if (entry.id !== match.id) adoptions.push({ localId: entry.id, remote: match }); }
    else { idMap.set(entry.id, entry.id); queued.push(entry); byIdentity.set(memoryIdentity(entry), { ...entry, revision: 0 }); }
  }
  for (const entry of ordered.filter((row) => rank(row.kind) === 1)) {
    const originalParent = entry.parent_id;
    let parentId = originalParent ? idMap.get(originalParent) : undefined;
    if (!parentId && originalParent && remoteIds.has(originalParent)) parentId = originalParent;
    if (!parentId && originalParent) {
      const localParent = localById.get(originalParent);
      const remoteParent = localParent ? byIdentity.get(memoryIdentity(localParent)) : undefined;
      if (remoteParent) { parentId = remoteParent.id; idMap.set(originalParent, remoteParent.id); if (localParent && localParent.id !== remoteParent.id) adoptions.push({ localId: localParent.id, remote: remoteParent }); }
    }
    if (!parentId) { manual += 1; continue; }
    const payload = structuredClone(entry.payload);
    if (entry.kind === 'vendor' || entry.kind === 'task') payload.tradeTypeId = parentId;
    else payload.materialTypeId = parentId;
    const candidate = { ...entry, parent_id: parentId, payload };
    const match = byIdentity.get(memoryIdentity(candidate));
    if (match) { idMap.set(entry.id, match.id); if (entry.id !== match.id) adoptions.push({ localId: entry.id, remote: match }); }
    else { idMap.set(entry.id, entry.id); queued.push(candidate); byIdentity.set(memoryIdentity(candidate), { ...candidate, revision: 0 }); }
  }
  return {
    adoptions: [...new Map(adoptions.map((row) => [row.localId, row])).values()],
    queued: [...new Map(queued.map((row) => [memoryIdentity(row), row])).values()],
    manual,
  };
}

export async function previewSyncRecovery(scope: SharedScope): Promise<SyncRecoveryPreview> {
  const { operations, partition } = await readOperationsAndPartition(scope);
  const daily = operations.filter(legacyDaily); const water = operations.filter(legacyWater);
  const memories = operations.filter(legacyMemory); const broken = operations.filter(problemMemory);
  const dates = [...new Set(daily.map((row) => String((row.payload as { date?: string }).date ?? '')).filter(Boolean))];
  const dailyRequest = dates.length
    ? getSupabaseClient().from('daily_drafts').select('id,report_date,payload,revision').eq('site_id', scope.siteId).in('report_date', dates)
    : Promise.resolve({ data: [], error: null });
  const waterRequest = water.length
    ? getSupabaseClient().from('water_snapshots').select('site_id,payload,revision').eq('site_id', scope.siteId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [dailyResult, waterResult, memoryRows] = await Promise.all([dailyRequest, waterRequest, readRemoteMemory(scope.siteId)]);
  if (dailyResult.error) throw dailyResult.error;
  if (waterResult.error) throw waterResult.error;

  const targetEntries = new Map<string, MemoryEntryPayload>();
  const localEntries = snapshotMemoryEntries(partition?.payload ?? emptyMemoryPayload());
  const localById = new Map(localEntries.map((row) => [row.id, row]));
  for (const operation of broken) {
    const entry = operation.payload as MemoryEntryPayload;
    if (entry?.id) targetEntries.set(entry.id, entry);
    if (entry?.parent_id && localById.has(entry.parent_id)) targetEntries.set(entry.parent_id, localById.get(entry.parent_id)!);
  }
  const latestLegacy = [...memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (latestLegacy?.payload) for (const entry of snapshotMemoryEntries(latestLegacy.payload as MemorySnapshotPayload)) targetEntries.set(entry.id, entry);
  const memoryPlan = buildMemoryRecovery([...targetEntries.values()], memoryRows);
  const targets = [...daily, ...water, ...memories, ...broken];
  const fingerprint = JSON.stringify({
    operations: targets.map((row) => [row.id, row.updatedAt]).sort(),
    daily: (dailyResult.data ?? []).map((row) => [row.id, row.revision]).sort(),
    water: waterResult.data ? [waterResult.data.site_id, waterResult.data.revision] : null,
    memory: memoryRows.map((row) => [row.id, row.revision, row.deleted_at]).sort(),
  });
  return {
    fingerprint, legacyDaily: daily.length, legacyWater: water.length, legacyMemory: memories.length, memoryProblems: broken.length,
    cloudMemoryMatches: memoryPlan.adoptions.length, memoryToResend: memoryPlan.queued.length,
    remainingManual: memoryPlan.manual, targetOperationIds: targets.map((row) => row.id),
    dailyRows: (dailyResult.data ?? []) as RemoteDaily[], waterRow: waterResult.data as RemoteWater | null,
    memoryRows, memoryAdoptions: memoryPlan.adoptions, memoryToQueue: memoryPlan.queued,
  };
}

function replaceMemoryIdentity(payload: MemorySnapshotPayload, adoption: MemoryAdoption): void {
  const remote = adoption.remote; const storeName = memoryEntryStore(remote.kind);
  if (remote.kind === 'template') {
    const settings = payload.stores.app_settings as Array<{ id: string; templates?: Array<Record<string, unknown>> }>;
    let setting = settings.find((row) => row.id === 'daily_special_templates_v1');
    if (!setting) { setting = { id: 'daily_special_templates_v1', templates: [] }; settings.push(setting); }
    setting.templates = (setting.templates ?? []).filter((row) => row.id !== adoption.localId && row.id !== remote.id);
    setting.templates.push(remote.payload);
  } else {
    payload.stores[storeName] = (payload.stores[storeName] ?? []).filter((row) => {
      const id = (row as { id?: string }).id; return id !== adoption.localId && id !== remote.id;
    });
    payload.stores[storeName].push(remote.payload);
  }
  for (const row of payload.stores.trade_vendors as Array<Record<string, unknown>>) if (row.tradeTypeId === adoption.localId) row.tradeTypeId = remote.id;
  for (const row of payload.stores.trade_tasks as Array<Record<string, unknown>>) if (row.tradeTypeId === adoption.localId) row.tradeTypeId = remote.id;
  for (const row of payload.stores.material_memory_items as Array<Record<string, unknown>>) if (row.materialTypeId === adoption.localId) row.materialTypeId = remote.id;
}

function putMemoryEntry(payload: MemorySnapshotPayload, entry: MemoryEntryPayload): void {
  const storeName = memoryEntryStore(entry.kind);
  if (entry.kind === 'template') {
    const settings = payload.stores.app_settings as Array<{ id: string; templates?: Array<Record<string, unknown>> }>;
    let setting = settings.find((row) => row.id === 'daily_special_templates_v1');
    if (!setting) { setting = { id: 'daily_special_templates_v1', templates: [] }; settings.push(setting); }
    setting.templates = (setting.templates ?? []).filter((row) => row.id !== entry.id); setting.templates.push(entry.payload);
  } else {
    payload.stores[storeName] = (payload.stores[storeName] ?? []).filter((row) => (row as { id?: string }).id !== entry.id);
    payload.stores[storeName].push(entry.payload);
  }
}

/** Replace a local import identity with the server-confirmed row and rebind queued children. */
export async function adoptCloudMemoryEntry(scope: SharedScope, localId: string, remote: RemoteMemoryEntry, sourceOperation?: SyncOperation): Promise<void> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const stores = ['memory_partitions', 'memory_entry_versions', 'sync_outbox', 'sync_recovery_backups', ...SHARED_MEMORY_STORES];
    const tx = database.transaction([...new Set(stores)], 'readwrite');
    const partitionStore = tx.objectStore('memory_partitions');
    const partition = await request(partitionStore.get(`${scope.userId}:${scope.siteId}`)) as MemoryPartition | undefined;
    const payload = structuredClone(partition?.payload ?? emptyMemoryPayload());
    replaceMemoryIdentity(payload, { localId, remote });
    partitionStore.put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: partition?.revision ?? 0, payload,
      payloadHash: memoryPayloadHash(payload), updatedAt: new Date().toISOString() } satisfies MemoryPartition);
    for (const name of SHARED_MEMORY_STORES) {
      const store = tx.objectStore(name); store.clear(); for (const row of payload.stores[name] ?? []) store.put(row);
    }
    const versions = tx.objectStore('memory_entry_versions');
    if (localId !== remote.id) versions.delete(`${scope.siteId}:${localId}`);
    versions.put({ id: `${scope.siteId}:${remote.id}`, revision: remote.revision });
    const queue = tx.objectStore('sync_outbox'); const operations = await request(queue.getAll()) as SyncOperation[];
    for (const operation of operations.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'memory-entry')) {
      const entry = structuredClone(operation.payload) as MemoryEntryPayload;
      if (operation.entityId === localId && localId !== remote.id && entry.learning_key?.startsWith('apply:')) {
        const rebound = { ...entry, id: remote.id, payload: { ...entry.payload, id: remote.id } };
        queue.put({ ...operation, entityId: remote.id, payload: rebound, baseRevision: remote.revision, mutationId: crypto.randomUUID(), status: 'pending', attempts: 0, updatedAt: new Date().toISOString() });
        continue;
      }
      if (entry.parent_id !== localId) continue;
      entry.parent_id = remote.id;
      if (entry.kind === 'vendor' || entry.kind === 'task') entry.payload.tradeTypeId = remote.id;
      else if (entry.kind === 'material-item') entry.payload.materialTypeId = remote.id;
      queue.put({ ...operation, mutationId: crypto.randomUUID(), payload: entry,
        dependsOnEntityIds: [remote.id], status: 'pending', attempts: 0, lastError: undefined, lastErrorCode: undefined,
        lastErrorHint: undefined, retryable: true, nextAttemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    if (sourceOperation) {
      tx.objectStore('sync_recovery_backups').put({
        id: `memory-duplicate:${sourceOperation.id}`, ...scope, operation: sourceOperation,
        remotePayload: remote, createdAt: new Date().toISOString(),
      });
      queue.delete(sourceOperation.id);
    }
    await transactionDone(tx);
  } finally { database.close(); }
}

/** Resolve one 23505 operation by its natural key without resending it. */
export async function recoverDuplicateMemoryOperation(scope: SharedScope, operation: SyncOperation): Promise<boolean> {
  if (operation.entity !== 'memory-entry' || operation.lastErrorCode !== '23505') return false;
  const entry = operation.payload as MemoryEntryPayload;
  let query = getSupabaseClient().from('memory_entries')
    .select('id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at')
    .eq('site_id', scope.siteId).eq('kind', entry.kind).eq('normalized_name', entry.normalized_name).is('deleted_at', null);
  query = entry.parent_id ? query.eq('parent_id', entry.parent_id) : query.is('parent_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return false;
  await adoptCloudMemoryEntry(scope, entry.id, data as RemoteMemoryEntry, operation);
  return true;
}

export async function applySyncRecovery(scope: SharedScope, expectedFingerprint: string): Promise<SyncRecoveryResult> {
  const plan = await previewSyncRecovery(scope);
  if (plan.fingerprint !== expectedFingerprint) throw new Error('雲端或本機待同步資料已變更，請重新預覽後再修復。');
  const database = await openDatabase() as IDBDatabase;
  const result: SyncRecoveryResult = { archived: 0, adoptedCloudMemory: 0, requeued: 0, remainingManual: plan.remainingManual };
  try {
    const stores = ['sync_outbox', 'sync_conflicts', 'sync_recovery_backups', 'live_report_draft', 'draft_partitions',
      'water_partitions', 'water_level_points', 'water_level_logs', 'memory_partitions', 'memory_entry_versions', ...SHARED_MEMORY_STORES];
    const tx = database.transaction([...new Set(stores)], 'readwrite');
    const queue = tx.objectStore('sync_outbox'); const conflicts = tx.objectStore('sync_conflicts'); const backups = tx.objectStore('sync_recovery_backups');
    const operations = await request(queue.getAll()) as SyncOperation[];
    const conflictRows = await request(conflicts.getAll()) as Array<{ id: string; operationId?: string; [key: string]: unknown }>;
    const conflictFor = (operation: SyncOperation) => conflictRows.find((row) => row.id === operation.id || row.operationId === operation.id);
    const targets = operations.filter((row) => plan.targetOperationIds.includes(row.id));
    const now = new Date().toISOString();
    const remoteDaily = new Map(plan.dailyRows.map((row) => [row.report_date, row]));
    const dailyGroups = new Map<string, SyncOperation[]>();
    for (const operation of targets.filter(legacyDaily)) {
      const date = String((operation.payload as { date?: string }).date ?? '');
      dailyGroups.set(date, [...(dailyGroups.get(date) ?? []), operation]);
    }
    for (const [date, rows] of dailyGroups) {
      const cloud = remoteDaily.get(date); const latest = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      for (const operation of rows) {
        const conflict = conflictFor(operation);
        backups.put({ id: `sync-recovery:${operation.id}`, ...scope, operation, conflict: conflict ?? null, remotePayload: cloud?.payload ?? null, createdAt: now });
        queue.delete(operation.id); if (conflict) conflicts.delete(conflict.id); result.archived += 1;
      }
      if (cloud) {
        const report = structuredClone(cloud.payload); report.id = 'current'; report.shared = { ...scope, cloudId: cloud.id, reportDate: date, revision: cloud.revision };
        tx.objectStore('draft_partitions').put({ id: `${scope.userId}:${scope.siteId}:${date}`, ...scope, reportDate: date, report, updatedAt: now });
        const current = await request(tx.objectStore('live_report_draft').get('current')) as DailyReportV3 | undefined;
        if (!current || current.date === date) tx.objectStore('live_report_draft').put(report);
      } else if (latest) {
        queue.put({ ...latest, id: crypto.randomUUID(), mutationId: crypto.randomUUID(), baseRevision: 0, status: 'pending', attempts: 0,
          lastError: undefined, lastErrorCode: undefined, lastErrorHint: undefined, retryable: true, nextAttemptAt: now, createdAt: now, updatedAt: now });
        result.requeued += 1;
      }
    }

    const waterRows = targets.filter(legacyWater);
    if (waterRows.length) {
      const latest = [...waterRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      for (const operation of waterRows) {
        const conflict = conflictFor(operation);
        backups.put({ id: `sync-recovery:${operation.id}`, ...scope, operation, conflict: conflict ?? null, remotePayload: plan.waterRow?.payload ?? null, createdAt: now });
        queue.delete(operation.id); if (conflict) conflicts.delete(conflict.id); result.archived += 1;
      }
      if (plan.waterRow) {
        const payload = plan.waterRow.payload;
        tx.objectStore('water_partitions').put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: plan.waterRow.revision, payload, payloadHash: waterPayloadHash(payload), updatedAt: now } satisfies WaterPartition);
        const points = tx.objectStore('water_level_points'); const logs = tx.objectStore('water_level_logs'); points.clear(); logs.clear();
        for (const row of payload.points) points.put(row); for (const row of payload.logs) logs.put(row);
      } else if (latest) {
        queue.put({ ...latest, id: crypto.randomUUID(), mutationId: crypto.randomUUID(), baseRevision: 0, status: 'pending', attempts: 0,
          lastError: undefined, lastErrorCode: undefined, lastErrorHint: undefined, retryable: true, nextAttemptAt: now, createdAt: now, updatedAt: now });
        result.requeued += 1;
      }
    }

    const memoryTargets = targets.filter((row) => legacyMemory(row) || problemMemory(row));
    for (const operation of memoryTargets) {
      const conflict = conflictFor(operation);
      backups.put({ id: `sync-recovery:${operation.id}`, ...scope, operation, conflict: conflict ?? null, createdAt: now });
      queue.delete(operation.id); if (conflict) conflicts.delete(conflict.id); result.archived += 1;
    }
    const partitionStore = tx.objectStore('memory_partitions');
    const partition = await request(partitionStore.get(`${scope.userId}:${scope.siteId}`)) as MemoryPartition | undefined;
    const memoryPayload = structuredClone(partition?.payload ?? emptyMemoryPayload());
    for (const adoption of plan.memoryAdoptions) {
      replaceMemoryIdentity(memoryPayload, adoption);
      const versions = tx.objectStore('memory_entry_versions');
      if (adoption.localId !== adoption.remote.id) versions.delete(`${scope.siteId}:${adoption.localId}`);
      versions.put({ id: `${scope.siteId}:${adoption.remote.id}`, revision: adoption.remote.revision });
      result.adoptedCloudMemory += 1;
    }
    const untouched = operations.filter((row) => !plan.targetOperationIds.includes(row.id));
    for (const entry of plan.memoryToQueue) {
      putMemoryEntry(memoryPayload, entry);
      if (untouched.some((row) => row.entity === 'memory-entry' && row.entityId === entry.id)) continue;
      const operation = buildSyncOperation({ ...scope, entity: 'memory-entry', entityId: entry.id, baseRevision: entry.base_revision ?? 0, payload: entry });
      if (entry.parent_id) operation.dependsOnEntityIds = [entry.parent_id];
      queue.put(operation); result.requeued += 1;
    }
    partitionStore.put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: partition?.revision ?? 0, payload: memoryPayload, payloadHash: memoryPayloadHash(memoryPayload), updatedAt: now } satisfies MemoryPartition);
    for (const name of SHARED_MEMORY_STORES) {
      const store = tx.objectStore(name); store.clear(); for (const row of memoryPayload.stores[name] ?? []) store.put(row);
    }
    await transactionDone(tx);
    return result;
  } finally { database.close(); }
}
