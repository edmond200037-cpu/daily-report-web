import type { DailyReportV3 } from '../domain/daily';
import { openDatabase, transactionDone } from '../data/db.js';
import type { SharedScope } from '../domain/shared';
import type { SyncConflict, SyncOperation } from './types';

const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
export interface RecoveryResult { restoredFromCloud: number; resubmitted: number; }

/** One-time cleanup for v1 whole-document conflicts. v2 field mutations are excluded. */
export async function recoverLegacyDailyConflictsCloudFirst(scope: SharedScope): Promise<RecoveryResult> {
  const database = await openDatabase() as IDBDatabase; const result: RecoveryResult = { restoredFromCloud: 0, resubmitted: 0 };
  try {
    const tx = database.transaction(['sync_outbox', 'sync_conflicts', 'sync_recovery_backups', 'live_report_draft', 'draft_partitions'], 'readwrite');
    const queue = tx.objectStore('sync_outbox'); const conflicts = tx.objectStore('sync_conflicts');
    const rows = await request(queue.getAll()) as SyncOperation[];
    for (const operation of rows.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === 'daily-draft' && row.status === 'conflict')) {
      const conflict = await request(conflicts.get(operation.id)) as SyncConflict | undefined;
      const remote = conflict?.remotePayload as DailyReportV3 | null | undefined;
      if (!remote) { queue.put({ ...operation, mutationId: crypto.randomUUID(), baseRevision: 0, status: 'pending', attempts: 0, lastError: undefined, lastErrorCode: undefined, lastErrorHint: undefined, retryable: true, nextAttemptAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); result.resubmitted += 1; continue; }
      tx.objectStore('sync_recovery_backups').put({ id: crypto.randomUUID(), ...scope, operationId: operation.id, entityId: operation.entityId, localPayload: operation.payload, remotePayload: remote, createdAt: new Date().toISOString() });
      const report = structuredClone(remote); report.id = 'current'; report.shared = { userId: scope.userId, siteId: scope.siteId, cloudId: operation.entityId, reportDate: report.date, revision: conflict?.remoteRevision ?? 0 };
      tx.objectStore('live_report_draft').put(report);
      tx.objectStore('draft_partitions').put({ id: `${scope.userId}:${scope.siteId}:${report.date}`, userId: scope.userId, siteId: scope.siteId, reportDate: report.date, report: structuredClone(report), updatedAt: new Date().toISOString() });
      queue.delete(operation.id); conflicts.delete(operation.id); result.restoredFromCloud += 1;
    }
    await transactionDone(tx); return result;
  } finally { database.close(); }
}
