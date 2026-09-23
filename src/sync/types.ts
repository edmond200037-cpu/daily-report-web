import type { SharedScope } from '../domain/shared';

export type SyncEntity = 'memory' | 'daily-draft' | 'daily-patch' | 'daily-finalization' | 'water-snapshot' | 'water-patch' | 'water-point' | 'water-log';
export type SyncOperationStatus = 'pending' | 'sending' | 'conflict' | 'failed' | 'blocked';

export interface SyncOperation extends SharedScope {
  id: string;
  entity: SyncEntity;
  entityId: string;
  mutationId: string;
  baseRevision: number;
  payload: unknown;
  status: SyncOperationStatus;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  lastErrorCode?: string;
  lastErrorHint?: string;
  retryable?: boolean;
  /** Missing means a pre-collaboration full-snapshot outbox entry. */
  protocolVersion?: 1 | 2;
}

export interface SyncCursor extends SharedScope { id: string; cursor: number; updatedAt: string; }
export interface SyncConflict extends SharedScope { id: string; operationId: string; localPayload: unknown; remotePayload: unknown; remoteRevision: number; createdAt: string; }

export const retryDelayMs = (attempts: number): number => Math.min(60_000, 1_000 * (2 ** Math.max(0, attempts - 1)));
export const canRetryAt = (operation: SyncOperation, now = new Date()): boolean => {
  if (operation.status === 'conflict' || operation.status === 'blocked') return false;
  if (operation.status === 'sending') return now.valueOf() - Date.parse(operation.updatedAt) >= 60_000;
  return Date.parse(operation.nextAttemptAt) <= now.valueOf();
};
