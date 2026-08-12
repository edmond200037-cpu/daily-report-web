/**
 * Compatibility adapter for legacy core modules.
 * The only IndexedDB opener lives in ../data/db.js; do not add another here.
 */
import type { BackupPayload, Draft, Entity, ReportSnapshot } from '../types/domain';
import { STORES, get, list, put, remove, withTransaction } from '../data/db.js';

export const STORE_NAMES = STORES as readonly string[];
export type StoreName = 'sites' | 'trade_types' | 'trade_vendors' | 'trade_tasks' | 'location_memories' | 'material_types' | 'material_memory_items' | 'material_memories' | 'supplier_memories' | 'floor_options' | 'daily_reports' | 'daily_memory_commits' | 'app_settings' | 'live_report_draft' | 'water_level_points' | 'water_level_logs' | 'water_level_readings' | 'debug_logs' | 'reports' | 'drafts' | 'vendor_tasks' | 'materials' | 'material_specifications' | 'special_categories' | 'special_templates' | 'special_template_variables' | 'migration_metadata';

export class Database {
  async get<T>(store: StoreName, id: string): Promise<T | undefined> { return get(store, id) as Promise<T | undefined>; }
  async list<T>(store: StoreName): Promise<T[]> { return list(store) as Promise<T[]>; }
  async put<T extends Entity | Draft>(store: StoreName, value: T): Promise<void> { await put(store, value); }
  async delete(store: StoreName, id: string): Promise<void> { await remove(store, id); }
  async clear(store: StoreName): Promise<void> { await withTransaction([store], async (tx: IDBTransaction) => { tx.objectStore(store).clear(); }); }
  async export(type: 'memory' | 'full'): Promise<BackupPayload> {
    const names = type === 'full' ? STORE_NAMES : STORE_NAMES.filter((name) => !['reports', 'drafts', 'migration_metadata', 'live_report_draft', 'daily_reports', 'water_level_points', 'water_level_logs', 'water_level_readings'].includes(name));
    const data: Record<string, unknown[]> = {};
    for (const name of names as StoreName[]) data[name] = await this.list(name);
    return { schemaVersion: 2, exportType: type, exportedAt: new Date().toISOString(), appVersion: '0.1.0', data };
  }
  async replaceFromBackup(payload: BackupPayload): Promise<void> {
    const names = Object.keys(payload.data).filter((name) => STORE_NAMES.includes(name));
    await withTransaction(names, async (tx: IDBTransaction) => { names.forEach((name) => { const store = tx.objectStore(name); store.clear(); payload.data[name].forEach((record) => store.put(record)); }); });
  }
}

export const database = new Database();
export const getReports = async (): Promise<ReportSnapshot[]> => (await database.list<ReportSnapshot>('reports')).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
