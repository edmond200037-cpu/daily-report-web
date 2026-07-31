import type { BackupPayload } from '../types/domain';
import { STORE_NAMES } from '../db/database';

export function validateBackup(value: unknown): BackupPayload {
  if (!value || typeof value !== 'object') throw new Error('備份檔案不是有效 JSON 物件。');
  const payload = value as Partial<BackupPayload>;
  if (payload.schemaVersion !== 2) throw new Error('此備份版本不受支援。');
  if (payload.exportType !== 'memory' && payload.exportType !== 'full') throw new Error('備份類型不正確。');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('備份缺少資料內容。');
  for (const [store, rows] of Object.entries(payload.data)) { if (!(STORE_NAMES as readonly string[]).includes(store) || !Array.isArray(rows)) throw new Error(`備份資料表「${store}」格式不正確。`); }
  return payload as BackupPayload;
}
