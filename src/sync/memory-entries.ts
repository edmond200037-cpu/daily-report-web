import type { MemorySnapshotPayload } from '../data/memory-partition';

export const MEMORY_STORE_KINDS = {
  sites: 'site', trade_types: 'trade', trade_vendors: 'vendor', trade_tasks: 'task',
  location_memories: 'location', material_types: 'material-type', material_memory_items: 'material-item',
} as const;
export type MemoryEntryKind = typeof MEMORY_STORE_KINDS[keyof typeof MEMORY_STORE_KINDS] | 'template';
export interface MemoryEntryPayload {
  id: string; kind: MemoryEntryKind; parent_id: string | null; normalized_name: string;
  payload: Record<string, unknown>; status: 'candidate' | 'confirmed';
  usage_count: number; finalized_usage_count: number; deleted?: boolean;
  learning_key?: string;
  learning_delta?: { usage: number; finalized: number };
  base_revision?: number;
}
export interface RemoteMemoryEntry extends MemoryEntryPayload { revision: number; deleted_at?: string | null; }

const entries = Object.entries(MEMORY_STORE_KINDS) as Array<[keyof typeof MEMORY_STORE_KINDS, MemoryEntryKind]>;
const asRecord = (row: unknown): Record<string, unknown> => row as Record<string, unknown>;
export const memoryEntryStore = (kind: MemoryEntryKind): keyof typeof MEMORY_STORE_KINDS | 'app_settings' =>
  kind === 'template' ? 'app_settings' : entries.find(([, value]) => value === kind)![0];

export function snapshotMemoryEntries(snapshot: MemorySnapshotPayload): MemoryEntryPayload[] {
  const result: MemoryEntryPayload[] = [];
  for (const [store, kind] of entries) for (const raw of snapshot.stores[store] ?? []) {
    const row = asRecord(raw);
    if (typeof row.id !== 'string') continue;
    const parent_id = kind === 'vendor' || kind === 'task' ? String(row.tradeTypeId ?? '') || null
      : kind === 'material-item' ? String(row.materialTypeId ?? '') || null : null;
    const normalized_name = kind === 'material-item'
      ? `${row.fieldType ?? ''}:${row.normalizedValue ?? ''}` : String(row.normalizedName ?? '');
    result.push({ id: row.id, kind, parent_id, normalized_name, payload: row,
      status: row.status === 'candidate' ? 'candidate' : 'confirmed',
      usage_count: Number(row.usageCount) || 0, finalized_usage_count: Number(row.finalizedUsageCount) || 0 });
  }
  const setting = (snapshot.stores.app_settings ?? []).map(asRecord).find((row) => row.id === 'daily_special_templates_v1');
  for (const raw of (setting?.templates ?? []) as unknown[]) {
    const row = asRecord(raw);
    if (typeof row.id !== 'string') continue;
    result.push({ id: row.id, kind: 'template', parent_id: null, normalized_name: String(row.normalizedName ?? ''),
      payload: row, status: 'confirmed', usage_count: 0, finalized_usage_count: 0 });
  }
  return result;
}

export function changedMemoryEntries(previous: MemorySnapshotPayload, current: MemorySnapshotPayload): MemoryEntryPayload[] {
  const before = new Map(snapshotMemoryEntries(previous).map((entry) => [entry.id, entry]));
  const after = new Map(snapshotMemoryEntries(current).map((entry) => [entry.id, entry]));
  const changes: MemoryEntryPayload[] = [];
  for (const [id, entry] of after) if (JSON.stringify(before.get(id)) !== JSON.stringify(entry)) changes.push(entry);
  for (const [id, entry] of before) if (!after.has(id)) changes.push({ ...entry, deleted: true });
  return changes;
}

export function memoryIdentity(entry: MemoryEntryPayload): string {
  return `${entry.kind}|${entry.parent_id ?? ''}|${entry.normalized_name}`;
}
