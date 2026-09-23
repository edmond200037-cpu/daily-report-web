import { memoryIdentity, snapshotMemoryEntries, type MemoryEntryPayload, type RemoteMemoryEntry } from './memory-entries';
import type { MemorySnapshotPayload } from '../data/memory-partition';

export interface MemoryImportPreview { add: MemoryEntryPayload[]; duplicate: MemoryEntryPayload[]; conflict: MemoryEntryPayload[]; }

/** Match parents by kind/name before matching children; never rely on a local ID across sites. */
export function previewMemoryImport(source: MemorySnapshotPayload, remote: RemoteMemoryEntry[]): MemoryImportPreview {
  const add: MemoryEntryPayload[] = []; const duplicate: MemoryEntryPayload[] = []; const conflict: MemoryEntryPayload[] = [];
  const sourceEntries = snapshotMemoryEntries(source);
  const cloud = new Map(remote.filter((row) => !row.deleted_at).map((row) => [memoryIdentity(row), row]));
  const ids = new Map<string, string>();
  const order = { site: 0, trade: 0, 'material-type': 0, location: 0, template: 0, vendor: 1, task: 1, 'material-item': 1 };
  for (const original of sourceEntries.sort((a, b) => order[a.kind] - order[b.kind])) {
    const parent_id = original.parent_id ? ids.get(original.parent_id) ?? null : null;
    if (original.parent_id && !parent_id) { conflict.push(original); continue; }
    const candidate = { ...original, id: crypto.randomUUID(), parent_id, payload: structuredClone(original.payload) };
    candidate.payload.id = candidate.id;
    if (parent_id) {
      if (candidate.kind === 'vendor' || candidate.kind === 'task') candidate.payload.tradeTypeId = parent_id;
      if (candidate.kind === 'material-item') candidate.payload.materialTypeId = parent_id;
    }
    const existing = cloud.get(memoryIdentity(candidate));
    if (existing) {
      ids.set(original.id, existing.id);
      if (JSON.stringify({ ...existing.payload, id: null, tradeTypeId: null, materialTypeId: null }) === JSON.stringify({ ...original.payload, id: null, tradeTypeId: null, materialTypeId: null })) duplicate.push(original);
      else conflict.push({ ...candidate, id: existing.id, base_revision: existing.revision, payload: { ...candidate.payload, id: existing.id } });
    } else {
      ids.set(original.id, candidate.id); add.push(candidate); cloud.set(memoryIdentity(candidate), { ...candidate, revision: 0 });
    }
  }
  return { add, duplicate, conflict };
}
