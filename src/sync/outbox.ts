import { list, put, remove } from '../data/db.js';
import { sharedScopeKey, type SharedScope } from '../domain/shared';
import { canRetryAt, retryDelayMs, type SyncEntity, type SyncOperation } from './types';
import { classifySyncError } from './error-diagnostics';

interface EnqueueInput extends SharedScope { entity: SyncEntity; entityId: string; baseRevision: number; payload: unknown; }

export function buildSyncOperation(input: EnqueueInput): SyncOperation {
  const now = new Date().toISOString();
  return { ...input, id: crypto.randomUUID(), mutationId: crypto.randomUUID(), protocolVersion: input.entity.endsWith('-patch') ? 2 : 1, status: 'pending', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now };
}

export async function enqueueSyncOperation(input: EnqueueInput): Promise<SyncOperation> {
  const operation = buildSyncOperation(input);
  await put('sync_outbox', operation);
  return operation;
}

export async function listReadyOperations(scope: SharedScope, now = new Date()): Promise<SyncOperation[]> {
  const key = sharedScopeKey(scope);
  return (await list('sync_outbox') as SyncOperation[])
    .filter((row) => sharedScopeKey(row) === key && canRetryAt(row, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countOperations(scope: SharedScope): Promise<number> {
  const key = sharedScopeKey(scope);
  return (await list('sync_outbox') as SyncOperation[]).filter((row) => sharedScopeKey(row) === key).length;
}

export async function listSyncDiagnostics(scope: SharedScope): Promise<SyncOperation[]> {
  const key = sharedScopeKey(scope);
  return (await list('sync_outbox') as SyncOperation[])
    .filter((row) => sharedScopeKey(row) === key && (row.status === 'failed' || row.status === 'conflict' || row.status === 'blocked'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Re-queues only operations blocked because PostgREST did not know a newly deployed RPC. */
export async function retryMissingRpcOperations(scope: SharedScope): Promise<number> {
  const key = sharedScopeKey(scope); const rows = await list('sync_outbox') as SyncOperation[]; const now = new Date().toISOString(); let retried = 0;
  for (const row of rows) {
    if (sharedScopeKey(row) !== key || row.status !== 'blocked' || row.lastErrorCode !== 'PGRST202') continue;
    await put('sync_outbox', { ...row, status: 'pending', retryable: true, lastError: undefined, lastErrorCode: undefined, lastErrorHint: undefined, nextAttemptAt: now, updatedAt: now }); retried += 1;
  }
  return retried;
}

export async function markOperationSending(operation: SyncOperation): Promise<SyncOperation> {
  const next: SyncOperation = { ...operation, status: 'sending', updatedAt: new Date().toISOString() };
  await put('sync_outbox', next);
  return next;
}

export async function markOperationFailed(operation: SyncOperation, error?: unknown): Promise<SyncOperation> {
  const diagnostic = classifySyncError(error); const attempts = operation.attempts + 1;
  const now = new Date();
  const next: SyncOperation = { ...operation, status: diagnostic.retryable ? 'failed' : 'blocked', attempts, lastError: diagnostic.message, lastErrorCode: diagnostic.code, lastErrorHint: diagnostic.hint ?? diagnostic.guidance, retryable: diagnostic.retryable, nextAttemptAt: diagnostic.retryable ? new Date(now.valueOf() + retryDelayMs(attempts)).toISOString() : now.toISOString(), updatedAt: now.toISOString() };
  await put('sync_outbox', next);
  return next;
}

export async function acknowledgeOperation(id: string): Promise<void> { await remove('sync_outbox', id); }
