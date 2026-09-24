import { openDatabase, transactionDone } from '../data/db.js';
import { getSupabaseClient } from '../data/remote/supabase-client';
import type { SharedScope } from '../domain/shared';
import { applyFieldMutations, buildFieldMutations, type FieldMutation } from './field-mutations';
import { buildSyncOperation, listAllOperations } from './outbox';
import type { SyncConflict, SyncOperation } from './types';

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
export type ConflictKind = 'daily' | 'water' | 'memory';
export interface ConflictDiff { path: string; kind: '新增' | '修改' | '刪除'; local: unknown; cloud: unknown; }
export interface ConflictReview { id: string; operationId: string; kind: ConflictKind; entity: SyncOperation['entity']; reportDate?: string; createdAt: string; local: Record<string, unknown>; cloud: Record<string, unknown>; cloudRevision: number; cloudEntityId: string; diffs: ConflictDiff[]; }

const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object') : [];
const rowKey = (row: Record<string, unknown>): string | undefined => typeof row.id === 'string' ? row.id : typeof row.pointId === 'string' ? row.pointId : undefined;
const clone = <T>(value: T): T => structuredClone(value);

/** Stable-id aware, human-readable diff. Array positions are never identities. */
export function diffConflict(local: unknown, cloud: unknown, path = ''): ConflictDiff[] {
  if (JSON.stringify(local) === JSON.stringify(cloud)) return [];
  if (Array.isArray(local) && Array.isArray(cloud) && [...records(local), ...records(cloud)].every((row) => rowKey(row))) {
    const locals = new Map(records(local).map((row) => [rowKey(row)!, row])); const clouds = new Map(records(cloud).map((row) => [rowKey(row)!, row]));
    return [...new Set([...locals.keys(), ...clouds.keys()])].flatMap((id) => diffConflict(locals.get(id), clouds.get(id), `${path}/${id}`));
  }
  if (local && cloud && typeof local === 'object' && typeof cloud === 'object' && !Array.isArray(local) && !Array.isArray(cloud)) {
    const left = local as Record<string, unknown>; const right = cloud as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) => diffConflict(left[key], right[key], `${path}/${key}`));
  }
  return [{ path: path || '/', kind: cloud === undefined ? '新增' : local === undefined ? '刪除' : '修改', local, cloud }];
}

function payloadForConflict(operation: SyncOperation, conflict: SyncConflict, cloud: Record<string, unknown>): Record<string, unknown> {
  if (operation.entity === 'daily-patch' || operation.entity === 'water-patch') return applyFieldMutations(cloud, (operation.payload as { changes: FieldMutation[] }).changes);
  return (operation.payload && typeof operation.payload === 'object' ? clone(operation.payload) : conflict.localPayload) as Record<string, unknown>;
}

/** An outbox conflict remains reviewable even if its separate diagnostic row is missing. */
export function conflictRecordForOperation(operation: SyncOperation, conflicts: SyncConflict[]): SyncConflict {
  return conflicts.find((row) => row.operationId === operation.id || row.id === operation.id) ?? {
    id: operation.id, operationId: operation.id, userId: operation.userId, siteId: operation.siteId,
    localPayload: operation.payload, remotePayload: null, remoteRevision: operation.baseRevision,
    createdAt: operation.updatedAt,
  };
}

async function latestCloud(scope: SharedScope, operation: SyncOperation, conflict: SyncConflict): Promise<{ payload: Record<string, unknown>; revision: number; entityId: string; reportDate?: string }> {
  if (operation.entity === 'memory-entry') {
    const { data, error } = await getSupabaseClient().from('memory_entries')
      .select('id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at')
      .eq('site_id', scope.siteId).eq('id', operation.entityId).maybeSingle();
    if (error) throw error;
    const payload = data ? { id: data.id, kind: data.kind, parent_id: data.parent_id, normalized_name: data.normalized_name,
      payload: data.payload, status: data.status, usage_count: data.usage_count, finalized_usage_count: data.finalized_usage_count,
      deleted: Boolean(data.deleted_at) } : {};
    return { payload, revision: Number(data?.revision ?? conflict.remoteRevision), entityId: operation.entityId };
  }
  if (operation.entity.startsWith('daily')) {
    const reportDate = operation.entity === 'daily-patch' ? (operation.payload as { reportDate?: string }).reportDate : (operation.payload as { date?: string }).date;
    if (!reportDate) throw new Error('日報衝突缺少日期，無法安全審核。');
    const { data, error } = await getSupabaseClient().from('daily_drafts').select('id,report_date,payload,revision').eq('site_id', scope.siteId).eq('report_date', reportDate).maybeSingle();
    if (error) throw error;
    return { payload: (data?.payload ?? conflict.remotePayload ?? {}) as Record<string, unknown>, revision: Number(data?.revision ?? conflict.remoteRevision), entityId: String(data?.id ?? operation.entityId), reportDate };
  }
  const table = operation.entity === 'memory' ? 'memory_snapshots' : 'water_snapshots';
  const { data, error } = await getSupabaseClient().from(table).select('payload,revision').eq('site_id', scope.siteId).maybeSingle();
  if (error) throw error;
  return { payload: (data?.payload ?? conflict.remotePayload ?? {}) as Record<string, unknown>, revision: Number(data?.revision ?? conflict.remoteRevision), entityId: scope.siteId };
}

export async function listConflictReviews(scope: SharedScope, knownOperations?: SyncOperation[]): Promise<ConflictReview[]> {
  const database = await openDatabase() as IDBDatabase;
  let operations: SyncOperation[]; let conflicts: SyncConflict[];
  try {
    const tx = database.transaction(knownOperations ? 'sync_conflicts' : ['sync_outbox', 'sync_conflicts']);
    [operations, conflicts] = await Promise.all([
      knownOperations ? Promise.resolve(knownOperations) : request(tx.objectStore('sync_outbox').getAll()) as Promise<SyncOperation[]>,
      request(tx.objectStore('sync_conflicts').getAll()) as Promise<SyncConflict[]>,
    ]);
  } finally { database.close(); }
  const result: ConflictReview[] = [];
  for (const operation of operations.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.status === 'conflict')) {
    const conflict = conflictRecordForOperation(operation, conflicts);
    const kind: ConflictKind | undefined = operation.entity.startsWith('daily') ? 'daily' : operation.entity.startsWith('water') ? 'water' : operation.entity.startsWith('memory') ? 'memory' : undefined;
    if (!kind) continue;
    const latest = await latestCloud(scope, operation, conflict);
    const local = payloadForConflict(operation, conflict, latest.payload);
    result.push({ id: conflict.id, operationId: operation.id, kind, entity: operation.entity, reportDate: latest.reportDate, createdAt: operation.createdAt, local, cloud: latest.payload, cloudRevision: latest.revision, cloudEntityId: latest.entityId, diffs: diffConflict(local, latest.payload) });
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Export keeps the source payloads available even after a later resolution succeeds. */
export async function exportConflictBackups(scope: SharedScope): Promise<unknown[]> {
  const database = await openDatabase() as IDBDatabase;
  try {
    const tx = database.transaction(['sync_outbox', 'sync_conflicts', 'sync_recovery_backups']);
    const [operations, conflicts, backups] = await Promise.all([
      request(tx.objectStore('sync_outbox').getAll()),
      request(tx.objectStore('sync_conflicts').getAll()),
      request(tx.objectStore('sync_recovery_backups').getAll()),
    ]);
    const pendingConflicts = (operations as SyncOperation[]).filter((row) => row.status === 'conflict');
    return [...pendingConflicts, ...(conflicts as Array<Record<string, unknown>>), ...(backups as Array<Record<string, unknown>>)]
      .filter((row) => row.userId === scope.userId && row.siteId === scope.siteId);
  } finally { database.close(); }
}

function child(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) return records(value).find((row) => rowKey(row) === segment);
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[segment] : undefined;
}
function writePath(target: Record<string, unknown>, source: Record<string, unknown>, path: string): void {
  const segments = path.split('/').filter(Boolean); let targetNode: unknown = target; let sourceNode: unknown = source;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]; const last = index === segments.length - 1; const nextSource = child(sourceNode, segment);
    if (last) {
      if (Array.isArray(targetNode)) {
        const rowIndex = records(targetNode).findIndex((row) => rowKey(row) === segment);
        if (nextSource === undefined) { if (rowIndex >= 0) targetNode.splice(rowIndex, 1); }
        else if (rowIndex >= 0) targetNode[rowIndex] = clone(nextSource); else targetNode.push(clone(nextSource));
      } else if (targetNode && typeof targetNode === 'object') {
        if (nextSource === undefined) delete (targetNode as Record<string, unknown>)[segment]; else (targetNode as Record<string, unknown>)[segment] = clone(nextSource);
      }
      return;
    }
    const nextTarget = child(targetNode, segment);
    if (nextTarget === undefined || nextSource === undefined) return; // Parent itself is handled by its own add/delete diff.
    targetNode = nextTarget; sourceNode = nextSource;
  }
}
function mergeReview(review: ConflictReview, localPaths: Set<string>): Record<string, unknown> {
  const merged = clone(review.cloud);
  for (const diff of review.diffs) if (localPaths.has(diff.path)) writePath(merged, review.local, diff.path);
  return merged;
}

export async function queueConflictResolution(scope: SharedScope, reviewed: ConflictReview, localPaths: string[]): Promise<void> {
  const current = (await listConflictReviews(scope, await listAllOperations(scope))).find((item) => item.id === reviewed.id);
  if (!current) throw new Error('此衝突已不存在，請重新載入。');
  if (current.cloudRevision !== reviewed.cloudRevision || current.cloudEntityId !== reviewed.cloudEntityId) throw new Error('雲端版本已更新；差異已重新整理，請重新確認。');
  const merged = mergeReview(current, new Set(localPaths));
  const entity = current.kind === 'daily' ? 'daily-patch' : current.kind === 'water' ? 'water-patch' : current.entity === 'memory-entry' ? 'memory-entry' : 'memory';
  const payload = current.kind === 'daily'
    ? { reportDate: current.reportDate, changes: buildFieldMutations('daily', current.cloud, merged) }
    : current.kind === 'water'
      ? { changes: buildFieldMutations('water', current.cloud, merged) }
      : merged;
  if (entity === 'memory-entry') { delete payload.learning_key; delete payload.base_revision; }
  const operation = buildSyncOperation({ ...scope, entity, entityId: current.cloudEntityId, baseRevision: current.cloudRevision, payload });
  operation.resolvesConflictIds = [current.id, current.operationId];
  const database = await openDatabase() as IDBDatabase;
  try { const tx = database.transaction('sync_outbox', 'readwrite'); tx.objectStore('sync_outbox').put(operation); await transactionDone(tx); }
  finally { database.close(); }
}
