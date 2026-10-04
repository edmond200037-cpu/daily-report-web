// src/sync/workspace-lock.ts
var tail = Promise.resolve();
function withWorkspaceLock(work) {
  const run = async () => typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request("construction-report-workspace", work) : await work();
  const next = tail.then(run, run);
  tail = next.catch(() => void 0);
  return next;
}

// audit:context
var loadActiveSharedScope = async () => globalThis.__auditScope;

// audit:client
var getSupabaseClient = () => ({ rpc: (...args) => globalThis.__auditRpc(...args) });

// src/data/db.js
var DB_NAME = "construction-daily-report";
var DB_VERSION = 17;
var STORES = ["sites", "trade_types", "trade_vendors", "trade_tasks", "location_memories", "material_types", "material_memory_items", "material_memories", "supplier_memories", "floor_options", "daily_reports", "daily_memory_commits", "app_settings", "live_report_draft", "water_level_points", "water_level_logs", "water_level_readings", "debug_logs", "reports", "drafts", "vendor_tasks", "materials", "material_specifications", "special_categories", "special_templates", "special_template_variables", "migration_metadata", "shared_context", "sync_outbox", "sync_cursors", "sync_conflicts", "sync_recovery_backups", "draft_partitions", "memory_partitions", "memory_entry_versions", "water_partitions", "memory_application_events"];
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request3 = indexedDB.open(DB_NAME, DB_VERSION);
    request3.onupgradeneeded = () => {
      const db = request3.result;
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      });
      const tx = request3.transaction;
      if (!db.objectStoreNames.contains("daily_reports")) return;
      if (request3.oldVersion < 2 && db.objectStoreNames.contains("reports")) {
        const oldReports = tx.objectStore("reports");
        const target = tx.objectStore("daily_reports");
        oldReports.getAll().onsuccess = (event) => {
          event.target.result.forEach((report) => target.put({ ...report, migratedFrom: "reports" }));
        };
      }
      if (request3.oldVersion < 2 && db.objectStoreNames.contains("drafts")) {
        tx.objectStore("drafts").get("current").onsuccess = (event) => {
          if (event.target.result) tx.objectStore("live_report_draft").put({ ...event.target.result, id: "current", migratedFrom: "drafts" });
        };
      }
      if (request3.oldVersion < 8) {
        ["sites", "trade_types", "trade_vendors", "trade_tasks", "location_memories", "material_types", "material_memory_items"].forEach((name) => {
          if (!db.objectStoreNames.contains(name)) return;
          const store = tx.objectStore(name);
          store.getAll().onsuccess = (event) => {
            event.target.result.forEach((row) => {
              if (!row.status) store.put({ ...row, status: "confirmed", manuallyConfirmed: true });
            });
          };
        });
      }
      if (request3.oldVersion < 9) {
        ["sites", "trade_types", "trade_vendors", "trade_tasks", "location_memories", "material_types", "material_memory_items"].forEach((name) => {
          if (!db.objectStoreNames.contains(name)) return;
          const store = tx.objectStore(name);
          store.getAll().onsuccess = (event) => {
            event.target.result.forEach((row) => {
              if (typeof row.finalizedUsageCount !== "number") store.put({ ...row, finalizedUsageCount: 0 });
            });
          };
        });
      }
      tx.objectStore("migration_metadata").put({ id: `schema-${request3.oldVersion}-to-${DB_VERSION}`, fromVersion: request3.oldVersion, toVersion: DB_VERSION, completedAt: (/* @__PURE__ */ new Date()).toISOString() });
    };
    request3.onsuccess = () => resolve(request3.result);
    request3.onerror = () => reject(new Error("\u7121\u6CD5\u958B\u555F\u672C\u6A5F\u8CC7\u6599\u5EAB\uFF0C\u8ACB\u78BA\u8A8D\u700F\u89BD\u5668\u5141\u8A31\u6B64\u7DB2\u7AD9\u5132\u5B58\u8CC7\u6599\u3002"));
  });
}
var result = (request3) => new Promise((resolve, reject) => {
  request3.onsuccess = () => resolve(request3.result);
  request3.onerror = () => reject(request3.error);
});
async function list(store) {
  const db = await openDatabase();
  try {
    return await result(db.transaction(store).objectStore(store).getAll());
  } finally {
    db.close();
  }
}
async function put(store, value) {
  const db = await openDatabase();
  try {
    await result(db.transaction(store, "readwrite").objectStore(store).put(value));
  } finally {
    db.close();
  }
}
var transactionDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error || new Error("\u8CC7\u6599\u5BEB\u5165\u5931\u6557\u3002"));
  tx.onabort = () => reject(tx.error || new Error("\u8CC7\u6599\u5BEB\u5165\u5931\u6557\u3002"));
});

// src/domain/shared.ts
var sharedScopeKey = (scope) => `${scope.userId}:${scope.siteId}`;

// src/sync/types.ts
var retryDelayMs = (attempts) => Math.min(6e4, 1e3 * 2 ** Math.max(0, attempts - 1));
var canRetryAt = (operation, now = /* @__PURE__ */ new Date()) => {
  if (operation.status === "conflict" || operation.status === "blocked") return false;
  if (operation.status === "sending") return now.valueOf() - Date.parse(operation.updatedAt) >= 6e4;
  return Date.parse(operation.nextAttemptAt) <= now.valueOf();
};

// src/sync/error-diagnostics.ts
var clean = (value, max = 240) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/https?:\/\/\S+/g, "[\u7DB2\u5740]").trim().slice(0, max);
function classifySyncError(error) {
  const row = error && typeof error === "object" ? error : {};
  const code = clean(row.code, 32) || void 0;
  const message = clean(row.message) || clean(error) || "\u672A\u53D6\u5F97\u96F2\u7AEF\u932F\u8AA4\u8A0A\u606F\u3002";
  const hint = clean(row.hint ?? row.details) || void 0;
  const text = `${code ?? ""} ${message}`.toLowerCase();
  if (code === "40001" || code === "40P01") return { code, message, hint, retryable: true, guidance: "\u540C\u6642\u5BEB\u5165\uFF0C\u5C07\u4F7F\u7528\u539F\u4E8B\u4EF6\u8B58\u5225\u81EA\u52D5\u91CD\u8A66\u3002" };
  if (code === "42501" || /forbidden|permission|not authorized|row-level security/.test(text)) return { code, message, hint, retryable: false, guidance: "\u76EE\u524D\u5E33\u865F\u6C92\u6709\u6B64\u5DE5\u5730\u7684\u7DE8\u8F2F\u6B0A\u9650\uFF1B\u8ACB\u78BA\u8A8D\u6210\u54E1\u89D2\u8272\u3002" };
  if (code === "42883" || code === "PGRST202" || /function .* does not exist|could not find the function/.test(text)) return { code, message, hint, retryable: false, guidance: "\u7DDA\u4E0A\u8CC7\u6599\u5EAB\u7F3A\u5C11\u540C\u6B65\u51FD\u5F0F\uFF1B\u8ACB\u5957\u7528\u6700\u65B0\u7248 Supabase migration\u3002" };
  if (/^22/.test(code ?? "") || /invalid|malformed|schema|json/.test(text)) return { code, message, hint, retryable: false, guidance: "\u672C\u6A5F\u8CC7\u6599\u683C\u5F0F\u4E0D\u7B26\u5408\u96F2\u7AEF\u5354\u5B9A\uFF1B\u8ACB\u4FDD\u7559\u8CC7\u6599\u4E26\u66F4\u65B0\u524D\u7AEF\u5F8C\u518D\u8655\u7406\u3002" };
  if (/network|fetch|timeout|temporar|connection|failed to fetch/.test(text) || /^5\d\d$/.test(code ?? "")) return { code, message, hint, retryable: true, guidance: "\u7DB2\u8DEF\u6216\u670D\u52D9\u66AB\u6642\u4E0D\u53EF\u7528\uFF0C\u5C07\u4F9D\u9000\u907F\u6642\u9593\u81EA\u52D5\u91CD\u8A66\u3002" };
  return { code, message, hint, retryable: false, guidance: "\u6B64\u64CD\u4F5C\u5DF2\u505C\u6B62\u91CD\u8A66\uFF1B\u8ACB\u4F9D\u932F\u8AA4\u78BC\u8207\u6458\u8981\u6AA2\u67E5\u96F2\u7AEF\u8A2D\u5B9A\u3002" };
}

// src/sync/outbox.ts
function buildSyncOperation(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return { ...input, id: crypto.randomUUID(), mutationId: crypto.randomUUID(), protocolVersion: input.entity.endsWith("-patch") ? 2 : 1, status: "pending", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now };
}
async function listReadyOperations(scope, now = /* @__PURE__ */ new Date(), manual = false) {
  const key = sharedScopeKey(scope);
  const memoryRank = (row) => {
    if (row.entity !== "memory-entry") return 0;
    const kind = row.payload?.kind;
    return kind === "vendor" || kind === "task" || kind === "material-item" ? 2 : 1;
  };
  return (await list("sync_outbox")).filter((row) => sharedScopeKey(row) === key && (canRetryAt(row, now) || manual && (row.status === "failed" || row.status === "pending"))).sort((a, b) => memoryRank(a) - memoryRank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
async function listAllOperations(scope) {
  const key = sharedScopeKey(scope);
  return (await list("sync_outbox")).filter((row) => sharedScopeKey(row) === key).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
async function markOperationSending(operation) {
  const next = { ...operation, status: "sending", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await put("sync_outbox", next);
  return next;
}
async function markOperationFailed(operation, error) {
  const diagnostic = classifySyncError(error);
  const attempts = operation.attempts + 1;
  const now = /* @__PURE__ */ new Date();
  const next = { ...operation, status: diagnostic.retryable ? "failed" : "blocked", attempts, lastError: diagnostic.message, lastErrorCode: diagnostic.code, lastErrorHint: diagnostic.hint ?? diagnostic.guidance, retryable: diagnostic.retryable, nextAttemptAt: diagnostic.retryable ? new Date(now.valueOf() + retryDelayMs(attempts)).toISOString() : now.toISOString(), updatedAt: now.toISOString() };
  await put("sync_outbox", next);
  return next;
}

// src/sync/memory-entries.ts
var MEMORY_STORE_KINDS = {
  sites: "site",
  trade_types: "trade",
  trade_vendors: "vendor",
  trade_tasks: "task",
  location_memories: "location",
  material_types: "material-type",
  material_memory_items: "material-item"
};
var entries = Object.entries(MEMORY_STORE_KINDS);
var memoryEntryStore = (kind) => kind === "template" ? "app_settings" : entries.find(([, value]) => value === kind)[0];

// src/data/memory-partition.ts
var SHARED_MEMORY_STORES = ["sites", "trade_types", "trade_vendors", "trade_tasks", "location_memories", "material_types", "material_memory_items", "app_settings"];
var memoryPayloadHash = (payload) => JSON.stringify(payload);
var emptyMemoryPayload = () => ({ schemaVersion: 1, stores: Object.fromEntries(SHARED_MEMORY_STORES.map((name) => [name, []])) });

// src/sync/field-mutations.ts
var ignored = /* @__PURE__ */ new Set(["id", "createdAt", "updatedAt", "change"]);
var collections = {
  daily: ["tradeSections", "standaloneMaterialEntries", "supplies", "contacts", "specialItems"],
  water: ["points", "logs"]
};
var nested = { tradeSections: ["workItems"], logs: ["readings"] };
var stableId = (row, collection) => String(collection === "readings" ? row.pointId : row.id);
function records(value) {
  return Array.isArray(value) ? value : [];
}
function diffCollection(before, after, collection, parentId, output) {
  const previous = new Map(before.map((row) => [stableId(row, collection), row]));
  const next = new Map(after.map((row) => [stableId(row, collection), row]));
  for (const [id, row] of next) {
    const old = previous.get(id);
    if (!old) {
      output.push({ op: "upsert", collection, id, value: structuredClone(row), ...parentId ? { parentId } : {} });
      continue;
    }
    for (const [field, value] of Object.entries(row)) {
      if (ignored.has(field) || nested[collection]?.includes(field) || JSON.stringify(old[field]) === JSON.stringify(value)) continue;
      output.push({ op: "set", collection, id, field, value: structuredClone(value), ...parentId ? { parentId } : {} });
    }
    for (const child of nested[collection] ?? []) diffCollection(records(old[child]), records(row[child]), child, id, output);
  }
  for (const id of previous.keys()) if (!next.has(id)) output.push({ op: "delete", collection, id, ...parentId ? { parentId } : {} });
  const beforeOrder = before.map((row) => stableId(row, collection));
  const afterOrder = after.map((row) => stableId(row, collection));
  if (JSON.stringify(beforeOrder) !== JSON.stringify(afterOrder)) output.push({ op: "order", collection, ids: afterOrder, ...parentId ? { parentId } : {} });
}
function buildFieldMutations(kind, before, after) {
  const result2 = [];
  const old = before ?? {};
  for (const [field, value] of Object.entries(after)) {
    if (field === "shared" || ignored.has(field) || collections[kind].includes(field) || JSON.stringify(old[field]) === JSON.stringify(value)) continue;
    result2.push({ op: "set", collection: "$document", id: kind, field, value: structuredClone(value) });
  }
  for (const collection of collections[kind]) diffCollection(records(old[collection]), records(after[collection]), collection, void 0, result2);
  return result2;
}
function findCollection(root, collection, parentId) {
  if (collection === "$document") return [];
  const top = collection === "workItems" ? "tradeSections" : collection === "readings" ? "logs" : collection;
  const rootList = records(root[top]);
  if (!parentId) return rootList;
  const parent = rootList.find((row) => String(row.id) === parentId);
  if (!parent) return [];
  parent[collection] ??= [];
  return records(parent[collection]);
}
function applyFieldMutations(snapshot, changes) {
  const result2 = structuredClone(snapshot);
  const deleted = /* @__PURE__ */ new Set();
  for (const change of changes) {
    if (change.collection === "$document" && change.op === "set") {
      result2[change.field] = structuredClone(change.value);
      continue;
    }
    const rows = findCollection(result2, change.collection, change.parentId);
    if (change.op === "order") {
      const byId = new Map(rows.map((row) => [stableId(row, change.collection), row]));
      const ordered = change.ids.flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
      rows.splice(0, rows.length, ...ordered, ...rows.filter((row) => !change.ids.includes(stableId(row, change.collection))));
      continue;
    }
    const tombstoneKey = `${change.collection}:${change.parentId ?? ""}:${change.id}`;
    const index = rows.findIndex((row) => stableId(row, change.collection) === change.id);
    if (change.op === "delete") {
      if (index >= 0) rows.splice(index, 1);
      deleted.add(tombstoneKey);
      continue;
    }
    if (deleted.has(tombstoneKey)) continue;
    if (change.op === "upsert") {
      if (index < 0) rows.push(structuredClone(change.value));
      else rows[index] = { ...rows[index], ...structuredClone(change.value) };
      continue;
    }
    if (change.op === "set") {
      if (index >= 0) rows[index][change.field] = structuredClone(change.value);
      continue;
    }
  }
  return result2;
}
function mergeLegacyDailyWorkItems(remote, legacy, tombstones = /* @__PURE__ */ new Set()) {
  const result2 = structuredClone(remote);
  const remoteTrades = records(result2.tradeSections);
  const byTradeId = new Map(remoteTrades.filter((row) => Boolean(row.id)).map((row) => [String(row.id), row]));
  for (const localTrade of records(legacy.tradeSections)) {
    const tradeId = typeof localTrade.id === "string" ? localTrade.id : "";
    if (!tradeId || tombstones.has(`tradeSections::${tradeId}`)) continue;
    const safeItems = records(localTrade.workItems).filter((item) => typeof item.id === "string" && item.id.length > 0 && !tombstones.has(`workItems:${tradeId}:${item.id}`));
    if (!safeItems.length) continue;
    const remoteTrade = byTradeId.get(tradeId);
    if (!remoteTrade) {
      remoteTrades.push({ ...structuredClone(localTrade), workItems: structuredClone(safeItems) });
      continue;
    }
    const remoteItems = records(remoteTrade.workItems);
    const itemIds = new Set(remoteItems.filter((item) => Boolean(item.id)).map((item) => String(item.id)));
    for (const item of safeItems) if (!itemIds.has(String(item.id))) remoteItems.push(structuredClone(item));
    remoteTrade.workItems = remoteItems;
  }
  result2.tradeSections = remoteTrades;
  return result2;
}

// src/data/water-partition.ts
var waterPayloadHash = (payload) => JSON.stringify(payload);

// src/sync/recovery.ts
var request = (value) => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
function replaceMemoryIdentity(payload, adoption) {
  const remote = adoption.remote;
  const storeName = memoryEntryStore(remote.kind);
  if (remote.kind === "template") {
    const settings = payload.stores.app_settings;
    let setting = settings.find((row) => row.id === "daily_special_templates_v1");
    if (!setting) {
      setting = { id: "daily_special_templates_v1", templates: [] };
      settings.push(setting);
    }
    setting.templates = (setting.templates ?? []).filter((row) => row.id !== adoption.localId && row.id !== remote.id);
    setting.templates.push(remote.payload);
  } else {
    payload.stores[storeName] = (payload.stores[storeName] ?? []).filter((row) => {
      const id = row.id;
      return id !== adoption.localId && id !== remote.id;
    });
    payload.stores[storeName].push(remote.payload);
  }
  for (const row of payload.stores.trade_vendors) if (row.tradeTypeId === adoption.localId) row.tradeTypeId = remote.id;
  for (const row of payload.stores.trade_tasks) if (row.tradeTypeId === adoption.localId) row.tradeTypeId = remote.id;
  for (const row of payload.stores.material_memory_items) if (row.materialTypeId === adoption.localId) row.materialTypeId = remote.id;
}
async function adoptCloudMemoryEntry(scope, localId, remote, sourceOperation) {
  const database = await openDatabase();
  try {
    const stores = ["memory_partitions", "memory_entry_versions", "sync_outbox", "sync_recovery_backups", ...SHARED_MEMORY_STORES];
    const tx = database.transaction([...new Set(stores)], "readwrite");
    const partitionStore = tx.objectStore("memory_partitions");
    const partition = await request(partitionStore.get(`${scope.userId}:${scope.siteId}`));
    const payload = structuredClone(partition?.payload ?? emptyMemoryPayload());
    replaceMemoryIdentity(payload, { localId, remote });
    partitionStore.put({
      id: `${scope.userId}:${scope.siteId}`,
      ...scope,
      revision: partition?.revision ?? 0,
      payload,
      payloadHash: memoryPayloadHash(payload),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    for (const name of SHARED_MEMORY_STORES) {
      const store = tx.objectStore(name);
      store.clear();
      for (const row of payload.stores[name] ?? []) store.put(row);
    }
    const versions = tx.objectStore("memory_entry_versions");
    if (localId !== remote.id) versions.delete(`${scope.siteId}:${localId}`);
    versions.put({ id: `${scope.siteId}:${remote.id}`, revision: remote.revision });
    const queue = tx.objectStore("sync_outbox");
    const operations = await request(queue.getAll());
    for (const operation of operations.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === "memory-entry")) {
      const entry = structuredClone(operation.payload);
      if (operation.entityId === localId && localId !== remote.id && entry.learning_key?.startsWith("apply:")) {
        const rebound = { ...entry, id: remote.id, payload: { ...entry.payload, id: remote.id } };
        queue.put({ ...operation, entityId: remote.id, payload: rebound, baseRevision: remote.revision, mutationId: crypto.randomUUID(), status: "pending", attempts: 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
        continue;
      }
      if (entry.parent_id !== localId) continue;
      entry.parent_id = remote.id;
      if (entry.kind === "vendor" || entry.kind === "task") entry.payload.tradeTypeId = remote.id;
      else if (entry.kind === "material-item") entry.payload.materialTypeId = remote.id;
      queue.put({
        ...operation,
        mutationId: crypto.randomUUID(),
        payload: entry,
        dependsOnEntityIds: [remote.id],
        status: "pending",
        attempts: 0,
        lastError: void 0,
        lastErrorCode: void 0,
        lastErrorHint: void 0,
        retryable: true,
        nextAttemptAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (sourceOperation) {
      tx.objectStore("sync_recovery_backups").put({
        id: `memory-duplicate:${sourceOperation.id}`,
        ...scope,
        operation: sourceOperation,
        remotePayload: remote,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      queue.delete(sourceOperation.id);
    }
    await transactionDone(tx);
  } finally {
    database.close();
  }
}
async function recoverDuplicateMemoryOperation(scope, operation) {
  if (operation.entity !== "memory-entry" || operation.lastErrorCode !== "23505") return false;
  const entry = operation.payload;
  let query = getSupabaseClient().from("memory_entries").select("id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at").eq("site_id", scope.siteId).eq("kind", entry.kind).eq("normalized_name", entry.normalized_name).is("deleted_at", null);
  query = entry.parent_id ? query.eq("parent_id", entry.parent_id) : query.is("parent_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return false;
  await adoptCloudMemoryEntry(scope, entry.id, data, operation);
  return true;
}

// src/sync/engine.ts
var request2 = (value) => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});
async function loadDailyTombstones(scope) {
  const { data, error } = await getSupabaseClient().from("collaboration_tombstones").select("collection,entity_id,parent_id").eq("site_id", scope.siteId).eq("document_kind", "daily");
  if (error) return null;
  return new Set((data ?? []).map((row) => `${row.collection}:${row.parent_id}:${row.entity_id}`));
}
async function pushOperation(operation) {
  const request3 = operation.entity === "daily-draft" ? getSupabaseClient().rpc("apply_daily_draft_mutation", {
    p_site_id: operation.siteId,
    p_mutation_id: operation.mutationId,
    p_entity_id: operation.entityId,
    p_base_revision: operation.baseRevision,
    p_payload: operation.payload
  }) : operation.entity === "daily-patch" ? getSupabaseClient().rpc("apply_daily_field_mutation", {
    p_site_id: operation.siteId,
    p_mutation_id: operation.mutationId,
    p_entity_id: operation.entityId,
    p_report_date: operation.payload.reportDate,
    p_changes: operation.payload.changes
  }) : operation.entity === "memory" ? getSupabaseClient().rpc("apply_memory_snapshot_mutation", {
    p_site_id: operation.siteId,
    p_mutation_id: operation.mutationId,
    p_base_revision: operation.baseRevision,
    p_payload: operation.payload
  }) : operation.entity === "memory-entry" ? getSupabaseClient().rpc(operation.payload.learning_key?.startsWith("apply:") ? "apply_memory_application" : "apply_memory_entry_mutation", {
    p_site_id: operation.siteId,
    p_mutation_id: operation.mutationId,
    p_base_revision: operation.baseRevision,
    p_entry: operation.payload
  }) : operation.entity === "water-patch" ? getSupabaseClient().rpc("apply_water_field_mutation", {
    p_site_id: operation.siteId,
    p_mutation_id: operation.mutationId,
    p_changes: operation.payload.changes
  }) : operation.entity === "water-snapshot" ? getSupabaseClient().rpc("apply_water_snapshot_mutation", {
    p_site_id: operation.siteId,
    p_mutation_id: operation.mutationId,
    p_base_revision: operation.baseRevision,
    p_payload: operation.payload
  }) : null;
  if (!request3) throw new Error(`\u5C1A\u672A\u652F\u63F4\u540C\u6B65\u5BE6\u9AD4\uFF1A${operation.entity}`);
  const { data, error } = await request3;
  if (error) throw error;
  return data;
}
async function acceptMutation(operation, result2) {
  const database = await openDatabase();
  try {
    const storeNames = operation.entity === "memory-entry" ? ["memory_entry_versions", "sync_outbox", "sync_conflicts"] : operation.entity === "memory" || operation.entity === "water-snapshot" || operation.entity === "water-patch" ? [operation.entity === "memory" ? "memory_partitions" : "water_partitions", "sync_outbox", "sync_conflicts"] : ["live_report_draft", "draft_partitions", "sync_outbox", "sync_conflicts"];
    const tx = database.transaction(storeNames, "readwrite");
    const queue = tx.objectStore("sync_outbox");
    if (operation.entity === "memory-entry") {
      tx.objectStore("memory_entry_versions").put({ id: `${operation.siteId}:${result2.entity_id}`, revision: result2.revision });
    } else if (operation.entity === "memory") {
      const id = `${operation.userId}:${operation.siteId}`;
      const store = tx.objectStore("memory_partitions");
      const partition = await request2(store.get(id));
      if (partition) store.put({ ...partition, revision: Math.max(partition.revision, result2.revision), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    } else if (operation.entity === "water-snapshot" || operation.entity === "water-patch") {
      const id = `${operation.userId}:${operation.siteId}`;
      const store = tx.objectStore("water_partitions");
      const partition = await request2(store.get(id));
      if (partition) store.put({ ...partition, revision: Math.max(partition.revision, result2.revision), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    } else {
      const draftStore = tx.objectStore("live_report_draft");
      const draft = await request2(draftStore.get("current"));
      const reportDate = dailyOperationDate(operation);
      if (reportDate) {
        const partitions = tx.objectStore("draft_partitions");
        const partitionId = `${operation.userId}:${operation.siteId}:${reportDate}`;
        const partition = await request2(partitions.get(partitionId));
        const local = partition?.report ?? (draft?.date === reportDate ? draft : void 0);
        if (local) {
          const previousRevision = local.shared?.revision ?? 0;
          local.shared = { userId: operation.userId, siteId: operation.siteId, cloudId: result2.entity_id, reportDate, revision: Math.max(previousRevision, result2.revision) };
          partitions.put({ id: partitionId, userId: operation.userId, siteId: operation.siteId, reportDate, report: structuredClone(local), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
          if (draft?.date === reportDate && (!draft.shared || draft.shared.userId === operation.userId && draft.shared.siteId === operation.siteId)) {
            draft.shared = structuredClone(local.shared);
            draftStore.put(draft);
          }
        }
      }
    }
    const queued = await request2(queue.getAll());
    queued.filter((row) => row.id !== operation.id && row.entityId === operation.entityId && row.siteId === operation.siteId && row.userId === operation.userId && row.baseRevision === operation.baseRevision && row.attempts === 0 && row.status === "pending").forEach((row) => queue.put({ ...row, baseRevision: result2.revision, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }));
    if (operation.resolvesConflictIds?.length) {
      const conflicts = tx.objectStore("sync_conflicts");
      for (const id of operation.resolvesConflictIds) {
        queue.delete(id);
        conflicts.delete(id);
      }
    }
    queue.delete(operation.id);
    await transactionDone(tx);
  } finally {
    database.close();
  }
}
async function preserveConflict(operation, result2) {
  const tombstones = operation.entity === "daily-draft" ? await loadDailyTombstones(operation) : null;
  const database = await openDatabase();
  try {
    const tx = database.transaction(["sync_outbox", "sync_conflicts"], "readwrite");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const rebaseable = operation.entity === "daily-patch";
    tx.objectStore("sync_outbox").put({ ...operation, status: rebaseable ? "pending" : "conflict", baseRevision: rebaseable ? result2.revision : operation.baseRevision, nextAttemptAt: rebaseable ? now : operation.nextAttemptAt, updatedAt: now });
    const conflict = { id: operation.id, operationId: operation.id, userId: operation.userId, siteId: operation.siteId, localPayload: operation.payload, remotePayload: result2.remote_payload, remoteRevision: result2.revision, createdAt: now };
    tx.objectStore("sync_conflicts").put(conflict);
    if (operation.entity === "daily-draft" && tombstones && result2.remote_payload && typeof result2.remote_payload === "object") {
      const remote = result2.remote_payload;
      const reportDate = typeof remote.date === "string" ? remote.date : "";
      const recovered = mergeLegacyDailyWorkItems(remote, operation.payload, tombstones);
      const changes = reportDate ? buildFieldMutations("daily", remote, recovered) : [];
      if (changes.length) tx.objectStore("sync_outbox").put({
        id: crypto.randomUUID(),
        mutationId: crypto.randomUUID(),
        userId: operation.userId,
        siteId: operation.siteId,
        entity: "daily-patch",
        entityId: result2.entity_id,
        baseRevision: result2.revision,
        payload: { reportDate, changes },
        protocolVersion: 2,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now
      });
    }
    await transactionDone(tx);
  } finally {
    database.close();
  }
}
var cursorId = (scope) => `${scope.userId}:${scope.siteId}`;
async function loadCursor(scope) {
  const database = await openDatabase();
  try {
    return (await request2(database.transaction("sync_cursors").objectStore("sync_cursors").get(cursorId(scope))))?.cursor ?? 0;
  } finally {
    database.close();
  }
}
var hasDraftContent = (draft) => Boolean(draft.siteNameSnapshot.trim() || draft.tradeSections.length || draft.standaloneMaterialEntries.length || draft.contacts.length || draft.specialItems.length);
var dailyOperationDate = (operation) => operation.entity === "daily-patch" ? operation.payload.reportDate : operation.entity === "daily-draft" ? operation.payload?.date : void 0;
var matchingDailyOperations = (queue, scope, reportDate) => queue.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && (row.entity === "daily-draft" || row.entity === "daily-patch") && row.status !== "blocked" && !(row.entity === "daily-draft" && row.status === "conflict") && dailyOperationDate(row) === reportDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
async function applyRemoteDraft(scope, change, remote) {
  const probe = await openDatabase();
  let hasLegacy = false;
  try {
    const rows = await request2(probe.transaction("sync_outbox").objectStore("sync_outbox").getAll());
    hasLegacy = rows.some((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === "daily-draft" && row.status !== "conflict" && row.status !== "blocked" && dailyOperationDate(row) === remote.report_date);
  } finally {
    probe.close();
  }
  const tombstones = hasLegacy ? await loadDailyTombstones(scope) : null;
  const database = await openDatabase();
  try {
    const tx = database.transaction(["live_report_draft", "draft_partitions", "sync_outbox", "sync_conflicts", "sync_cursors"], "readwrite");
    const draftStore = tx.objectStore("live_report_draft");
    const current = await request2(draftStore.get("current"));
    const queue = await request2(tx.objectStore("sync_outbox").getAll());
    const pending = matchingDailyOperations(queue, scope, remote.report_date);
    const pendingPatches = pending.filter((row) => row.entity === "daily-patch");
    const pendingLegacy = pending.filter((row) => row.entity === "daily-draft");
    let outcome = "skipped";
    if (pendingPatches.length) {
      let next = structuredClone(remote.payload);
      for (const operation of pendingPatches) next = applyFieldMutations(next, operation.payload.changes);
      if (pendingLegacy.length && tombstones) for (const operation of pendingLegacy) next = mergeLegacyDailyWorkItems(next, operation.payload, tombstones);
      const report = next;
      report.id = "current";
      report.shared = { userId: scope.userId, siteId: scope.siteId, cloudId: remote.id, reportDate: remote.report_date, revision: remote.revision };
      if (!current || current.date === remote.report_date) draftStore.put(report);
      tx.objectStore("draft_partitions").put({ id: `${scope.userId}:${scope.siteId}:${remote.report_date}`, userId: scope.userId, siteId: scope.siteId, reportDate: remote.report_date, report: structuredClone(report), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      outcome = "pulled";
    } else if (pendingLegacy.length) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const legacy = pendingLegacy[0];
      const conflict = { id: legacy.id, operationId: legacy.id, ...scope, localPayload: legacy.payload, remotePayload: remote.payload, remoteRevision: remote.revision, createdAt: now };
      tx.objectStore("sync_conflicts").put(conflict);
      for (const operation of pendingLegacy) tx.objectStore("sync_outbox").put({ ...operation, status: "conflict", updatedAt: now });
      let recovered = structuredClone(remote.payload);
      if (tombstones) for (const operation of pendingLegacy) recovered = mergeLegacyDailyWorkItems(recovered, operation.payload, tombstones);
      const changes = buildFieldMutations("daily", remote.payload, recovered);
      if (changes.length) {
        const recoveryOperation = {
          id: crypto.randomUUID(),
          mutationId: crypto.randomUUID(),
          ...scope,
          entity: "daily-patch",
          entityId: remote.id,
          baseRevision: remote.revision,
          payload: { reportDate: remote.report_date, changes },
          protocolVersion: 2,
          status: "pending",
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now
        };
        tx.objectStore("sync_outbox").put(recoveryOperation);
        const report = recovered;
        report.id = "current";
        report.shared = { userId: scope.userId, siteId: scope.siteId, cloudId: remote.id, reportDate: remote.report_date, revision: remote.revision };
        tx.objectStore("draft_partitions").put({ id: `${scope.userId}:${scope.siteId}:${remote.report_date}`, userId: scope.userId, siteId: scope.siteId, reportDate: remote.report_date, report: structuredClone(report), updatedAt: now });
        if (!current || current.date === remote.report_date) draftStore.put(report);
      }
      outcome = "conflict";
    } else if (current && current.date === remote.report_date && !current.shared && hasDraftContent(current)) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const conflictId = `pull:${scope.siteId}:${remote.id}`;
      const conflict = { id: conflictId, operationId: "", ...scope, localPayload: current, remotePayload: remote.payload, remoteRevision: remote.revision, createdAt: now };
      tx.objectStore("sync_conflicts").put(conflict);
      outcome = "conflict";
    } else {
      const next = structuredClone(remote.payload);
      next.id = "current";
      next.shared = { userId: scope.userId, siteId: scope.siteId, cloudId: remote.id, reportDate: remote.report_date, revision: remote.revision };
      tx.objectStore("draft_partitions").put({ id: `${scope.userId}:${scope.siteId}:${remote.report_date}`, userId: scope.userId, siteId: scope.siteId, reportDate: remote.report_date, report: structuredClone(next), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      if (!current || current.date === remote.report_date) draftStore.put(next);
      outcome = "pulled";
    }
    const cursor = { id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    tx.objectStore("sync_cursors").put(cursor);
    await transactionDone(tx);
    return outcome;
  } finally {
    database.close();
  }
}
async function applyRemoteMemoryEntry(scope, change, remote) {
  const database = await openDatabase();
  try {
    const storeName = memoryEntryStore(remote.kind);
    const tx = database.transaction(["memory_partitions", "memory_entry_versions", "sync_outbox", "sync_conflicts", "sync_cursors", storeName], "readwrite");
    const queue = await request2(tx.objectStore("sync_outbox").getAll());
    const pending = queue.find((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === "memory-entry" && row.entityId === remote.id);
    const legacy = queue.find((row) => row.userId === scope.userId && row.siteId === scope.siteId && row.entity === "memory");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let outcome = "pulled";
    if (legacy) {
      tx.objectStore("sync_outbox").put({ ...legacy, status: "blocked", lastError: "\u820A\u7248\u6574\u4EFD\u8A18\u61B6\u5FEB\u7167\u9700\u8981\u9810\u89BD\u4E26\u8F49\u6210\u9010\u7B46\u8CC7\u6599\u3002", updatedAt: now });
      outcome = "conflict";
    } else if (pending) {
      outcome = "skipped";
    } else {
      const store = tx.objectStore(storeName);
      const partitionStore = tx.objectStore("memory_partitions");
      const partition = await request2(partitionStore.get(`${scope.userId}:${scope.siteId}`));
      const payload = structuredClone(partition?.payload ?? { schemaVersion: 1, stores: Object.fromEntries(SHARED_MEMORY_STORES.map((name) => [name, []])) });
      if (remote.kind === "template") {
        const setting = await request2(store.get("daily_special_templates_v1")) ?? { id: "daily_special_templates_v1", templates: [] };
        setting.templates = (setting.templates ?? []).filter((row) => row.id !== remote.id);
        if (!remote.deleted_at) setting.templates.push(remote.payload);
        store.put(setting);
        payload.stores.app_settings = payload.stores.app_settings.filter((row) => row.id !== setting.id);
        payload.stores.app_settings.push(setting);
      } else {
        if (remote.deleted_at) store.delete(remote.id);
        else store.put(remote.payload);
        payload.stores[storeName] = (payload.stores[storeName] ?? []).filter((row) => row.id !== remote.id);
        if (!remote.deleted_at) payload.stores[storeName].push(remote.payload);
      }
      partitionStore.put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: partition?.revision ?? 0, payload, payloadHash: memoryPayloadHash(payload), updatedAt: now });
      tx.objectStore("memory_entry_versions").put({ id: `${scope.siteId}:${remote.id}`, revision: remote.revision });
    }
    tx.objectStore("sync_cursors").put({ id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: now });
    await transactionDone(tx);
    return outcome;
  } finally {
    database.close();
  }
}
async function applyRemoteWater(scope, change, remote) {
  const database = await openDatabase();
  try {
    const tx = database.transaction(["water_partitions", "water_level_points", "water_level_logs", "sync_outbox", "sync_conflicts", "sync_cursors"], "readwrite");
    const queueStore = tx.objectStore("sync_outbox");
    const queue = await request2(queueStore.getAll());
    const pendingRows = queue.filter((row) => row.userId === scope.userId && row.siteId === scope.siteId && (row.entity === "water-snapshot" || row.entity === "water-patch")).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const pending = pendingRows[0];
    let outcome;
    if (pending?.entity === "water-patch") {
      let payload = structuredClone(remote.payload);
      for (const row of pendingRows.filter((item) => item.entity === "water-patch")) payload = applyFieldMutations(payload, row.payload.changes);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      tx.objectStore("water_partitions").put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: remote.revision, payload, payloadHash: waterPayloadHash(payload), updatedAt: now });
      const points = tx.objectStore("water_level_points");
      const logs = tx.objectStore("water_level_logs");
      points.clear();
      logs.clear();
      for (const row of payload.points) points.put(row);
      for (const row of payload.logs) logs.put(row);
      outcome = "pulled";
    } else if (pending) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      tx.objectStore("sync_conflicts").put({ id: pending.id, operationId: pending.id, ...scope, localPayload: pending.payload, remotePayload: remote.payload, remoteRevision: remote.revision, createdAt: now });
      queueStore.put({ ...pending, status: "conflict", updatedAt: now });
      outcome = "conflict";
    } else {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      tx.objectStore("water_partitions").put({ id: `${scope.userId}:${scope.siteId}`, ...scope, revision: remote.revision, payload: remote.payload, payloadHash: waterPayloadHash(remote.payload), updatedAt: now });
      const points = tx.objectStore("water_level_points");
      const logs = tx.objectStore("water_level_logs");
      points.clear();
      logs.clear();
      for (const row of remote.payload.points) points.put(row);
      for (const row of remote.payload.logs) logs.put(row);
      outcome = "pulled";
    }
    tx.objectStore("sync_cursors").put({ id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    await transactionDone(tx);
    return outcome;
  } finally {
    database.close();
  }
}
async function pullRemoteChanges(scope) {
  let cursor = await loadCursor(scope);
  let pulled = 0;
  let dailyPulled = 0;
  let memoryPulled = 0;
  let waterPulled = 0;
  let conflicts = 0;
  for (; ; ) {
    const { data, error } = await getSupabaseClient().rpc("pull_site_changes", { p_site_id: scope.siteId, p_cursor: cursor, p_limit: 100 });
    if (error) throw error;
    const changes = data ?? [];
    for (const change of changes) {
      if (change.entity === "daily-draft" && change.operation === "upsert") {
        const { data: remote, error: remoteError } = await getSupabaseClient().from("daily_drafts").select("id,report_date,payload,revision").eq("id", change.entity_id).single();
        if (remoteError) throw remoteError;
        const outcome = await applyRemoteDraft(scope, change, remote);
        if (outcome === "pulled") {
          pulled += 1;
          dailyPulled += 1;
        } else if (outcome === "conflict") conflicts += 1;
      } else if (change.entity === "memory-entry") {
        const { data: remote, error: remoteError } = await getSupabaseClient().from("memory_entries").select("id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at").eq("site_id", scope.siteId).eq("id", change.entity_id).single();
        if (remoteError) throw remoteError;
        const outcome = await applyRemoteMemoryEntry(scope, change, remote);
        if (outcome === "pulled") {
          pulled += 1;
          memoryPulled += 1;
        } else if (outcome === "conflict") conflicts += 1;
      } else if (change.entity === "water-snapshot" && change.operation === "upsert") {
        const { data: remote, error: remoteError } = await getSupabaseClient().from("water_snapshots").select("site_id,payload,revision").eq("site_id", scope.siteId).single();
        if (remoteError) throw remoteError;
        const outcome = await applyRemoteWater(scope, change, remote);
        if (outcome === "pulled") {
          pulled += 1;
          waterPulled += 1;
        } else conflicts += 1;
      } else {
        const database2 = await openDatabase();
        try {
          const tx = database2.transaction("sync_cursors", "readwrite");
          tx.objectStore("sync_cursors").put({ id: cursorId(scope), ...scope, cursor: change.sequence, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
          await transactionDone(tx);
        } finally {
          database2.close();
        }
      }
      cursor = change.sequence;
    }
    if (changes.length < 100) break;
  }
  const database = await openDatabase();
  try {
    const tx = database.transaction("sync_cursors", "readwrite");
    const store = tx.objectStore("sync_cursors");
    const previous = await request2(store.get(cursorId(scope)));
    const stamp = (/* @__PURE__ */ new Date()).toISOString();
    store.put({ ...previous, id: cursorId(scope), ...scope, cursor, updatedAt: stamp, lastPulledAt: stamp });
    await transactionDone(tx);
  } finally {
    database.close();
  }
  return { pulled, dailyPulled, memoryPulled, waterPulled, conflicts };
}
function recordApplied(summary, operation) {
  summary.applied += 1;
  if (operation.entity === "daily-draft" || operation.entity === "daily-patch") summary.dailyApplied += 1;
  else if (operation.entity === "memory" || operation.entity === "memory-entry") summary.memoryApplied += 1;
  else if (operation.entity === "water-snapshot" || operation.entity === "water-patch") summary.waterApplied += 1;
}
async function runSyncOnceUnlocked(scope, manual) {
  const summary = { applied: 0, pulled: 0, dailyApplied: 0, dailyPulled: 0, memoryApplied: 0, memoryPulled: 0, waterApplied: 0, waterPulled: 0, conflicts: 0, failed: 0 };
  try {
    const pulled = await pullRemoteChanges(scope);
    summary.pulled += pulled.pulled;
    summary.dailyPulled += pulled.dailyPulled;
    summary.memoryPulled += pulled.memoryPulled;
    summary.waterPulled += pulled.waterPulled;
    summary.conflicts += pulled.conflicts;
  } catch (error) {
    summary.failed += 1;
    summary.pullError = error instanceof Error ? error.message : String(error);
    return summary;
  }
  const beforeRecovery = await listAllOperations(scope);
  for (const operation of beforeRecovery.filter((row) => row.entity === "memory-entry" && row.status === "blocked" && row.lastErrorCode === "23505")) {
    try {
      if (await recoverDuplicateMemoryOperation(scope, operation)) recordApplied(summary, operation);
    } catch {
      summary.failed += 1;
    }
  }
  const unresolvedMemory = new Set((await listAllOperations(scope)).filter((row) => row.entity === "memory-entry").map((row) => row.entityId));
  for (const captured of await listReadyOperations(scope, /* @__PURE__ */ new Date(), manual)) {
    const pending = (await listAllOperations(scope)).find((row) => row.id === captured.id);
    if (!pending) continue;
    if (pending.entity === "memory") continue;
    if (pending.dependsOnEntityIds?.some((id) => unresolvedMemory.has(id))) continue;
    const operation = await markOperationSending(pending);
    try {
      const result2 = await pushOperation(operation);
      if (result2.status === "conflict") {
        await preserveConflict(operation, result2);
        summary.conflicts += 1;
      } else {
        await acceptMutation(operation, result2);
        recordApplied(summary, operation);
        const identityChanged = operation.entity === "memory-entry" && result2.entity_id !== operation.entityId;
        if (operation.entity === "memory-entry" && !identityChanged) unresolvedMemory.delete(operation.entityId);
        if (operation.entity === "memory-entry" && (result2.status === "duplicate" || result2.entity_id !== operation.entityId)) {
          const { data: remote, error } = await getSupabaseClient().from("memory_entries").select("id,kind,parent_id,normalized_name,payload,status,usage_count,finalized_usage_count,revision,deleted_at").eq("site_id", scope.siteId).eq("id", result2.entity_id).single();
          if (error) throw error;
          await adoptCloudMemoryEntry(scope, operation.entityId, remote);
        }
      }
    } catch (error) {
      const duplicate = operation.entity === "memory-entry" && error?.code === "23505";
      try {
        if (duplicate && await recoverDuplicateMemoryOperation(scope, { ...operation, lastErrorCode: "23505" })) {
          recordApplied(summary, operation);
          unresolvedMemory.delete(operation.entityId);
          continue;
        }
      } catch {
      }
      await markOperationFailed(operation, error);
      summary.failed += 1;
    }
  }
  if (summary.applied) {
    try {
      const pulled = await pullRemoteChanges(scope);
      summary.pulled += pulled.pulled;
      summary.dailyPulled += pulled.dailyPulled;
      summary.memoryPulled += pulled.memoryPulled;
      summary.waterPulled += pulled.waterPulled;
      summary.conflicts += pulled.conflicts;
    } catch (error) {
      summary.failed += 1;
      summary.pullError = error instanceof Error ? error.message : String(error);
    }
  }
  return summary;
}
async function runSyncOnce(scope, manual = true) {
  return withWorkspaceLock(async () => {
    const active = await loadActiveSharedScope();
    if (!active || active.userId !== scope.userId || active.siteId !== scope.siteId) throw new Error("\u5DE5\u5730\u5DF2\u5207\u63DB\uFF0C\u53D6\u6D88\u820A\u5DE5\u5730\u540C\u6B65\u3002");
    return runSyncOnceUnlocked(scope, manual);
  });
}
export {
  buildSyncOperation,
  list,
  put,
  runSyncOnce
};
