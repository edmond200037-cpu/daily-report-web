import { list } from '../data/db.js';
import { getSupabaseClient } from '../data/remote/supabase-client';
import type { SharedScope } from '../domain/shared';
import type { MemoryEntryPayload, RemoteMemoryEntry } from './memory-entries';

const columns = 'id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at';
async function byId(scope: SharedScope, id: string): Promise<RemoteMemoryEntry | null> {
  const { data, error } = await getSupabaseClient().from('memory_entries').select(columns).eq('site_id', scope.siteId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as RemoteMemoryEntry | null;
}
async function byName(scope: SharedScope, kind: string, name: string, parent: string | null): Promise<RemoteMemoryEntry | null> {
  let query = getSupabaseClient().from('memory_entries').select(columns).eq('site_id', scope.siteId).eq('kind', kind).eq('normalized_name', name).is('deleted_at', null);
  query = parent ? query.eq('parent_id', parent) : query.is('parent_id', null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as RemoteMemoryEntry | null;
}

/** Tombstones are authoritative; only a missing ID falls back to natural identity. */
export async function findCloudMemoryEntry(scope: SharedScope, entry: MemoryEntryPayload): Promise<RemoteMemoryEntry | null> {
  const exact = await byId(scope, entry.id);
  if (exact) return exact;
  let parent = entry.parent_id;
  if (parent) {
    const cloudParent = await byId(scope, parent);
    if (cloudParent?.deleted_at) return null;
    if (!cloudParent) {
      const store = entry.kind === 'material-item' ? 'material_types' : 'trade_types';
      const local = (await list(store) as Array<{ id: string; normalizedName: string }>).find((row) => row.id === parent);
      if (!local) return null;
      const matched = await byName(scope, entry.kind === 'material-item' ? 'material-type' : 'trade', local.normalizedName, null);
      if (!matched) return null;
      parent = matched.id;
    }
  }
  return byName(scope, entry.kind, entry.normalized_name, parent);
}

export function alignMemoryEntryIdentity(local: Record<string, unknown>, cloud: Record<string, unknown>): Record<string, unknown> {
  if (typeof cloud.id !== 'string') return local;
  return { ...local, id: cloud.id, parent_id: cloud.parent_id,
    payload: { ...(local.payload as Record<string, unknown>), id: cloud.id,
      ...(local.kind === 'task' || local.kind === 'vendor' ? { tradeTypeId: cloud.parent_id } : local.kind === 'material-item' ? { materialTypeId: cloud.parent_id } : {}) } };
}

/** Never enqueue an empty or mechanically mixed memory record. */
export function assertMemoryResolution(value: Record<string, unknown>, entityId: string): void {
  const payload = value.payload as Record<string, unknown> | undefined;
  const child = value.kind === 'task' || value.kind === 'vendor' || value.kind === 'material-item';
  const parentField = value.kind === 'material-item' ? 'materialTypeId' : 'tradeTypeId';
  const normalized = value.kind === 'material-item' ? `${payload?.fieldType ?? ''}:${payload?.normalizedValue ?? ''}` : payload?.normalizedName;
  if (value.id !== entityId || !payload || payload.id !== entityId || !['site', 'trade', 'vendor', 'task', 'location', 'material-type', 'material-item', 'template'].includes(String(value.kind)) || typeof value.normalized_name !== 'string' || !value.normalized_name.trim() || value.normalized_name !== normalized ||
    !['confirmed', 'candidate'].includes(String(value.status)) || (value.kind !== 'template' && payload.status !== value.status) ||
    !Number.isSafeInteger(value.usage_count) || Number(value.usage_count) < 0 || !Number.isSafeInteger(value.finalized_usage_count) || Number(value.finalized_usage_count) < 0 ||
    Number(value.finalized_usage_count) > Number(value.usage_count) ||
    (child && (typeof value.parent_id !== 'string' || !value.parent_id || payload[parentField] !== value.parent_id)) || (!child && value.parent_id !== null)) {
    throw new Error('記憶選擇不完整或身分不一致；請保留完整本機或雲端內容，原衝突已保留。');
  }
}
