/**
 * Protocol v2: collection members are addressed by stable ids, never array
 * positions.  This module is deliberately dependency-free so the outbox,
 * remote merge and tests share one representation.
 */
export type FieldMutation =
  | { op: 'set'; collection: string; id: string; field: string; value: unknown; parentId?: string }
  | { op: 'upsert'; collection: string; id: string; value: Record<string, unknown>; parentId?: string }
  | { op: 'delete'; collection: string; id: string; parentId?: string }
  | { op: 'order'; collection: string; ids: string[]; parentId?: string };

const ignored = new Set(['id', 'createdAt', 'updatedAt', 'change']);
const collections: Record<string, string[]> = {
  daily: ['tradeSections', 'standaloneMaterialEntries', 'supplies', 'contacts', 'specialItems'],
  water: ['points', 'logs'],
};
const nested: Record<string, string[]> = { tradeSections: ['workItems'], logs: ['readings'] };
const stableId = (row: Record<string, unknown>, collection: string): string =>
  String(collection === 'readings' ? row.pointId : row.id);

function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }

function diffCollection(before: Record<string, unknown>[], after: Record<string, unknown>[], collection: string, parentId: string | undefined, output: FieldMutation[]): void {
  const previous = new Map(before.map((row) => [stableId(row, collection), row]));
  const next = new Map(after.map((row) => [stableId(row, collection), row]));
  for (const [id, row] of next) {
    const old = previous.get(id);
    if (!old) { output.push({ op: 'upsert', collection, id, value: structuredClone(row), ...(parentId ? { parentId } : {}) }); continue; }
    for (const [field, value] of Object.entries(row)) {
      if (ignored.has(field) || nested[collection]?.includes(field) || JSON.stringify(old[field]) === JSON.stringify(value)) continue;
      output.push({ op: 'set', collection, id, field, value: structuredClone(value), ...(parentId ? { parentId } : {}) });
    }
    for (const child of nested[collection] ?? []) diffCollection(records(old[child]), records(row[child]), child, id, output);
  }
  for (const id of previous.keys()) if (!next.has(id)) output.push({ op: 'delete', collection, id, ...(parentId ? { parentId } : {}) });
  const beforeOrder = before.map((row) => stableId(row, collection)); const afterOrder = after.map((row) => stableId(row, collection));
  if (JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder)) output.push({ op: 'order', collection, ids: afterOrder, ...(parentId ? { parentId } : {}) });
}

export function buildFieldMutations(kind: 'daily' | 'water', before: Record<string, unknown> | undefined, after: Record<string, unknown>): FieldMutation[] {
  const result: FieldMutation[] = []; const old = before ?? {};
  for (const [field, value] of Object.entries(after)) {
    if (field === 'shared' || ignored.has(field) || collections[kind].includes(field) || JSON.stringify(old[field]) === JSON.stringify(value)) continue;
    result.push({ op: 'set', collection: '$document', id: kind, field, value: structuredClone(value) });
  }
  for (const collection of collections[kind]) diffCollection(records(old[collection]), records(after[collection]), collection, undefined, result);
  return result;
}

function findCollection(root: Record<string, unknown>, collection: string, parentId?: string): Record<string, unknown>[] {
  if (collection === '$document') return [];
  const top = collection === 'workItems' ? 'tradeSections' : collection === 'readings' ? 'logs' : collection;
  const rootList = records(root[top]);
  if (!parentId) return rootList;
  const parent = rootList.find((row) => String(row.id) === parentId);
  if (!parent) return [];
  parent[collection] ??= [];
  return records(parent[collection]);
}

/** Applies accepted/pending mutations locally. A delete tombstone wins over a stale set. */
export function applyFieldMutations(snapshot: Record<string, unknown>, changes: FieldMutation[]): Record<string, unknown> {
  const result = structuredClone(snapshot);
  const deleted = new Set<string>();
  for (const change of changes) {
    if (change.collection === '$document' && change.op === 'set') { result[change.field] = structuredClone(change.value); continue; }
    const rows = findCollection(result, change.collection, change.parentId);
    if (change.op === 'order') {
      const byId = new Map(rows.map((row) => [stableId(row, change.collection), row]));
      const ordered = change.ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
      rows.splice(0, rows.length, ...ordered, ...rows.filter((row) => !change.ids.includes(stableId(row, change.collection))));
      continue;
    }
    const tombstoneKey = `${change.collection}:${change.parentId ?? ''}:${change.id}`;
    const index = rows.findIndex((row) => stableId(row, change.collection) === change.id);
    if (change.op === 'delete') { if (index >= 0) rows.splice(index, 1); deleted.add(tombstoneKey); continue; }
    if (deleted.has(tombstoneKey)) continue;
    if (change.op === 'upsert') { if (index < 0) rows.push(structuredClone(change.value)); else rows[index] = { ...rows[index], ...structuredClone(change.value) }; continue; }
    if (change.op === 'set') { if (index >= 0) rows[index][change.field] = structuredClone(change.value); continue; }
  }
  return result;
}

/**
 * Legacy snapshots have no field-level intent.  On a conflict, retain the
 * cloud values and recover only local work items which the cloud cannot yet
 * know about.  Stable ids are the proof that an item is safe to add.
 */
export function mergeLegacyDailyWorkItems(remote: Record<string, unknown>, legacy: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(remote);
  const remoteTrades = records(result.tradeSections);
  const byTradeId = new Map(remoteTrades.filter((row) => Boolean(row.id)).map((row) => [String(row.id), row]));

  for (const localTrade of records(legacy.tradeSections)) {
    const tradeId = typeof localTrade.id === 'string' ? localTrade.id : '';
    if (!tradeId) continue;
    const safeItems = records(localTrade.workItems).filter((item) => typeof item.id === 'string' && item.id.length > 0);
    if (!safeItems.length) continue;
    const remoteTrade = byTradeId.get(tradeId);
    if (!remoteTrade) {
      // This trade itself is absent remotely, so its identified work items are
      // safe additions.  No remote field is overwritten.
      remoteTrades.push({ ...structuredClone(localTrade), workItems: structuredClone(safeItems) });
      continue;
    }
    const remoteItems = records(remoteTrade.workItems);
    const itemIds = new Set(remoteItems.filter((item) => Boolean(item.id)).map((item) => String(item.id)));
    for (const item of safeItems) if (!itemIds.has(String(item.id))) remoteItems.push(structuredClone(item));
    remoteTrade.workItems = remoteItems;
  }
  result.tradeSections = remoteTrades;
  return result;
}
