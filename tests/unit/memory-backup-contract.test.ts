import { describe, expect, it } from 'vitest';
import { validateMemoryBackup } from '../../src/data/daily-repository';

const data = { sites: [], trade_types: [], trade_vendors: [], trade_tasks: [], location_memories: [], material_types: [], material_memory_items: [], app_settings: [] };

describe('記憶備份契約', () => {
  it('接受舊 memories@1，讓既有備份可以繼續還原', () => {
    expect(validateMemoryBackup({ schemaVersion: 1, exportType: 'memories', exportedAt: '', appVersion: '', data }).schemaVersion).toBe(1);
  });

  it('接受 memories@2，保留候選與正式記憶的狀態欄位', () => {
    expect(validateMemoryBackup({ schemaVersion: 2, exportType: 'memories', exportedAt: '', appVersion: '', data }).schemaVersion).toBe(2);
  });

  it('拒絕把水位資料混入記憶備份', () => {
    expect(() => validateMemoryBackup({ schemaVersion: 2, exportType: 'memories', exportedAt: '', appVersion: '', data: { ...data, water_level_logs: [] } })).toThrow('格式不正確');
  });
});
