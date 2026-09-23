import type { DailyReportV3 } from '../domain/daily';
import { openDatabase, transactionDone } from '../data/db.js';
import { getSupabaseClient } from '../data/remote/supabase-client';
import type { SharedScope } from '../domain/shared';
import type { SyncOperation } from './types';

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
export interface RecoveryResult { restoredFromCloud: number; resubmitted: number; }

/** One-time cleanup for v1 whole-document conflicts. v2 field mutations are excluded. */
export async function recoverLegacyDailyConflictsCloudFirst(scope: SharedScope): Promise<RecoveryResult> {
  // Resolve the live cloud row before opening an IndexedDB transaction. Older
  // conflicts only stored the payload, not the cloud row id, and that payload
  // may have changed since the conflict was recorded.
  const conflictsToRecover = (await (async () => {
    const database = await openDatabase() as IDBDatabase;
    try {
      const rows = await request(database.transaction('sync_outbox').objectStore('sync_outbox').getAll()) as SyncOperation[];
      return rows.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'daily-draft' && row.status === 'conflict');
    } finally { database.close(); }
  })());
  if (!conflictsToRecover.length) return { restoredFromCloud: 0, resubmitted: 0 };
  const dates = [...new Set(conflictsToRecover.map((row) => (row.payload as DailyReportV3).date))];
  if (dates.some((date) => !date)) throw new Error('舊版日報缺少日期，無法安全處理衝突。');
  const { data: cloudRows, error } = await getSupabaseClient().from('daily_drafts')
    .select('id,report_date,payload,revision').eq('site_id', scope.siteId).in('report_date', dates);
  if (error) throw error;
  const byDate = new Map((cloudRows ?? []).map((row) => [String(row.report_date), row]));
  const database = await openDatabase() as IDBDatabase; const result: RecoveryResult = { restoredFromCloud: 0, resubmitted: 0 };
  try {
    const tx = database.transaction(['sync_outbox', 'sync_conflicts', 'sync_recovery_backups', 'live_report_draft', 'draft_partitions'], 'readwrite');
    const queue = tx.objectStore('sync_outbox'); const conflicts = tx.objectStore('sync_conflicts');
    const rows = await request(queue.getAll()) as SyncOperation[];
    for (const operation of rows.filter((row) => conflictsToRecover.some((item) => item.id === row.id) && row.status === 'conflict')) {
      const cloud = byDate.get((operation.payload as DailyReportV3).date);
      if (!cloud) { queue.put({ ...operation, mutationId: crypto.randomUUID(), baseRevision: 0, status: 'pending', attempts: 0, lastError: undefined, lastErrorCode: undefined, lastErrorHint: undefined, retryable: true, nextAttemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); result.resubmitted += 1; continue; }
      const remote = cloud.payload as DailyReportV3;
      tx.objectStore('sync_recovery_backups').put({ id: crypto.randomUUID(), ...scope, operationId: operation.id, entityId: operation.entityId, localPayload: operation.payload, remotePayload: remote, createdAt: new Date().toISOString() });
      // Keep A's current draft intact: it may contain later v2 field mutations.
      // Both versions remain available in the recovery backup for review.
      queue.delete(operation.id); conflicts.delete(operation.id); result.restoredFromCloud += 1;
    }
    await transactionDone(tx); return result;
  } finally { database.close(); }
}
