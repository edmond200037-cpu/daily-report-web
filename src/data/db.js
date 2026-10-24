const DB_NAME = 'construction-daily-report';
// 日報草稿與水位模組必須使用同一個資料庫版本；若以較低版本開啟，
// 已升級的瀏覽器會直接回傳 VersionError，造成水位頁初始化失敗。
export const DB_VERSION = 9;
export const STORES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'material_memories', 'supplier_memories', 'floor_options', 'daily_reports', 'daily_memory_commits', 'app_settings', 'live_report_draft', 'water_level_points', 'water_level_logs', 'water_level_readings', 'debug_logs', 'reports', 'drafts', 'vendor_tasks', 'materials', 'material_specifications', 'special_categories', 'special_templates', 'special_template_variables', 'migration_metadata'];

export function openDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, DB_VERSION); request.onupgradeneeded = () => { const db = request.result; STORES.forEach((name) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' }); }); const tx = request.transaction; if (!db.objectStoreNames.contains('daily_reports')) return; if (request.oldVersion < 2 && db.objectStoreNames.contains('reports')) { const oldReports = tx.objectStore('reports'); const target = tx.objectStore('daily_reports'); oldReports.getAll().onsuccess = (event) => { event.target.result.forEach((report) => target.put({ ...report, migratedFrom: 'reports' })); }; } if (request.oldVersion < 2 && db.objectStoreNames.contains('drafts')) { tx.objectStore('drafts').get('current').onsuccess = (event) => { if (event.target.result) tx.objectStore('live_report_draft').put({ ...event.target.result, id: 'current', migratedFrom: 'drafts' }); }; }
    if (request.oldVersion < 8) {
      ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items'].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) return;
        const store = tx.objectStore(name);
        store.getAll().onsuccess = (event) => { event.target.result.forEach((row) => { if (!row.status) store.put({ ...row, status: 'confirmed', manuallyConfirmed: true }); }); };
      });
    }
    if (request.oldVersion < 9) {
      ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items'].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) return;
        const store = tx.objectStore(name);
        store.getAll().onsuccess = (event) => { event.target.result.forEach((row) => {
          if (typeof row.finalizedUsageCount !== 'number') store.put({ ...row, finalizedUsageCount: 0 });
        }); };
      });
    }
    tx.objectStore('migration_metadata').put({ id: `schema-${request.oldVersion}-to-${DB_VERSION}`, fromVersion: request.oldVersion, toVersion: DB_VERSION, completedAt: new Date().toISOString() }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('無法開啟本機資料庫，請確認瀏覽器允許此網站儲存資料。')); }); }
/** All IndexedDB callers must enter through this module so upgrades run once. */
export async function runMigration() { const db = await openDatabase(); db.close(); }
const result = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
export async function get(store, id) { const db = await openDatabase(); try { return await result(db.transaction(store).objectStore(store).get(id)); } finally { db.close(); } }
export async function list(store) { const db = await openDatabase(); try { return await result(db.transaction(store).objectStore(store).getAll()); } finally { db.close(); } }
export async function put(store, value) { const db = await openDatabase(); try { await result(db.transaction(store, 'readwrite').objectStore(store).put(value)); } finally { db.close(); } }
export async function remove(store, id) { const db = await openDatabase(); try { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); await transactionDone(tx); } finally { db.close(); } }
export async function replaceRecords(store, records) { const db = await openDatabase(); try { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).clear(); records.forEach((record) => tx.objectStore(store).put(record)); await transactionDone(tx); } finally { db.close(); } }
export const transactionDone = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error || new Error('資料寫入失敗。')); tx.onabort = () => reject(tx.error || new Error('資料寫入失敗。')); });
export async function withTransaction(storeNames, operation) { const db = await openDatabase(); try { const tx = db.transaction(storeNames, 'readwrite'); await operation(tx); await transactionDone(tx); } finally { db.close(); } }
