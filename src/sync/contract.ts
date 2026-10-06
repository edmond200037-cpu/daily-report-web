import type { SyncOperation } from './types';

export const SYNC_CONTRACT_VERSION = 1;
export const MEMORY_APPLICATION_RPC = 'apply_memory_application';
export const MEMORY_MUTATION_RPC = 'apply_memory_entry_mutation';
export const MISSING_RPC_CODES = new Set(['PGRST202', '42883']);

export function operationRpc(operation: SyncOperation): string | undefined {
  if (operation.entity === 'memory-entry') return (operation.payload as { learning_key?: string })?.learning_key?.startsWith('apply:') ? MEMORY_APPLICATION_RPC : MEMORY_MUTATION_RPC;
  return ({ 'daily-draft': 'apply_daily_draft_mutation', 'daily-patch': 'apply_daily_field_mutation', memory: 'apply_memory_snapshot_mutation', 'water-patch': 'apply_water_field_mutation', 'water-snapshot': 'apply_water_snapshot_mutation' } as Partial<Record<SyncOperation['entity'], string>>)[operation.entity];
}

export function missingRpcOperation(operation: SyncOperation): boolean {
  return operation.status === 'blocked' && MISSING_RPC_CODES.has(operation.lastErrorCode ?? '');
}
