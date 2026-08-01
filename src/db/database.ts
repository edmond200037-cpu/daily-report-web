import type { BackupPayload, Draft, Entity, ReportSnapshot } from '../types/domain';

export const STORE_NAMES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'floor_options', 'daily_reports', 'daily_memory_commits', 'app_settings', 'live_report_draft', 'water_level_points', 'water_level_logs', 'water_level_readings', 'debug_logs', 'reports', 'drafts', 'vendor_tasks', 'materials', 'material_types', 'material_memory_items', 'material_memories', 'supplier_memories', 'material_specifications', 'special_categories', 'special_templates', 'special_template_variables', 'migration_metadata'] as const;
export type StoreName = typeof STORE_NAMES[number];
const DB_NAME = 'construction-daily-report'; const DB_VERSION = 6;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORE_NAMES.forEach((name) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' }); });
      const transaction = request.transaction!;
      ['sites', 'trade_types', 'materials', 'special_categories'].forEach((name) => {
        const store = transaction.objectStore(name);
        if (!store.indexNames.contains('normalizedName')) store.createIndex('normalizedName', 'normalizedName', { unique: true });
      });
      const vendors = transaction.objectStore('trade_vendors');
      if (!vendors.indexNames.contains('tradeAndName')) vendors.createIndex('tradeAndName', ['tradeTypeId', 'normalizedName'], { unique: true });
      const reports = transaction.objectStore('reports');
      if (!reports.indexNames.contains('completedAt')) reports.createIndex('completedAt', 'completedAt');
    };
    request.onerror = () => reject(new Error('無法開啟本機資料庫，請確認瀏覽器未禁止網站儲存資料。'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function requestValue<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

export class Database {
  async get<T>(store: StoreName, id: string): Promise<T | undefined> { const db = await openDatabase(); try { return await requestValue(db.transaction(store).objectStore(store).get(id)); } finally { db.close(); } }
  async list<T>(store: StoreName): Promise<T[]> { const db = await openDatabase(); try { return await requestValue(db.transaction(store).objectStore(store).getAll()); } finally { db.close(); } }
  async put<T extends Entity | Draft>(store: StoreName, value: T): Promise<void> { const db = await openDatabase(); try { await requestValue(db.transaction(store, 'readwrite').objectStore(store).put(value)); } finally { db.close(); } }
  async delete(store: StoreName, id: string): Promise<void> { const db = await openDatabase(); try { await requestValue(db.transaction(store, 'readwrite').objectStore(store).delete(id)); } finally { db.close(); } }
  async clear(store: StoreName): Promise<void> { const db = await openDatabase(); try { await requestValue(db.transaction(store, 'readwrite').objectStore(store).clear()); } finally { db.close(); } }
  async export(type: 'memory' | 'full'): Promise<BackupPayload> {
    const names = type === 'full' ? STORE_NAMES : STORE_NAMES.filter((name) => !['reports', 'drafts', 'migration_metadata'].includes(name));
    const data: Record<string, unknown[]> = {};
    for (const name of names) data[name] = await this.list(name);
    return { schemaVersion: 2, exportType: type, exportedAt: new Date().toISOString(), appVersion: '0.1.0', data };
  }
  async replaceFromBackup(payload: BackupPayload): Promise<void> {
    const db = await openDatabase();
    try {
      const names = Object.keys(payload.data).filter((name): name is StoreName => (STORE_NAMES as readonly string[]).includes(name));
      const tx = db.transaction(names, 'readwrite');
      for (const name of names) { const store = tx.objectStore(name); store.clear(); payload.data[name].forEach((record) => store.put(record)); }
      await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('匯入未完成，原始資料已保留。')); });
    } finally { db.close(); }
  }
}

export const database = new Database();
export const getReports = async (): Promise<ReportSnapshot[]> => (await database.list<ReportSnapshot>('reports')).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
