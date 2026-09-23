import { list, put, remove } from '../data/db.js';
import { sharedScopeKey, type SharedScope } from '../domain/shared';
import { canRetryAt, retryDelayMs, type SyncEntity, type SyncOperation } from './types';

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

export async function markOperationSending(operation: SyncOperation): Promise<SyncOperation> {
  const next: SyncOperation = { ...operation, status: 'sending', updatedAt: new Date().toISOString() };
  await put('sync_outbox', next);
  return next;
}

export async function markOperationFailed(operation: SyncOperation): Promise<SyncOperation> {
  const attempts = operation.attempts + 1;
  const now = new Date();
  const next: SyncOperation = { ...operation, status: 'failed', attempts, nextAttemptAt: new Date(now.valueOf() + retryDelayMs(attempts)).toISOString(), updatedAt: now.toISOString() };
  await put('sync_outbox', next);
  return next;
}

export async function acknowledgeOperation(id: string): Promise<void> { await remove('sync_outbox', id); }
