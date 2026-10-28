import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, get, put } from '../../src/data/db.js';
import { createDailyDraft } from '../../src/domain/daily';
import type { MaterialEntry } from '../../src/domain/daily';
import { updateMaterialMemoryItem } from '../../src/data/daily-repository';

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn(), dispatchEvent: vi.fn() }); vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { vi.unstubAllGlobals(); });

const memory = (id: string, value: string) => ({ id, materialTypeId: 'mt', fieldType: 'supplier', value, normalizedValue: value, usageCount: 3, finalizedUsageCount: 1, lastUsedAt: 'x', createdAt: 'c', updatedAt: 'u', status: 'candidate' });
async function seed() {
  (await openDatabase()).close();
  await put('material_types', { id: 'mt', name: '混凝土', normalizedName: '混凝土', sortOrder: 0, usageCount: 1, finalizedUsageCount: 0, lastUsedAt: null, recentUnit: '', recentSupplierName: '天誠', createdAt: 'c', updatedAt: 'u', status: 'confirmed' });
  await put('material_memory_items', memory('m1', '天誠')); await put('material_memory_items', memory('m2', '其他'));
  await put('daily_reports', { id: 'snap', outputText: '天誠' });
  const report = createDailyDraft('2026-10-28');
  report.standaloneMaterialEntries = [{ id: 'e1', materialTypeId: 'mt', materialTypeSnapshot: '混凝土', supplierNameSnapshot: '天誠', sortOrder: 0, updatedAt: 'old' } as unknown as MaterialEntry];
  return report;
}

describe('updateMaterialMemoryItem', () => {
  it('就地改值、id 不變、草稿同值被改寫、定稿不變', async () => {
    const next = await updateMaterialMemoryItem(await seed(), 'm1', ' 新供應商 ');
    expect(await get('material_memory_items', 'm1')).toMatchObject({ id: 'm1', value: '新供應商', usageCount: 3, status: 'candidate', createdAt: 'c' });
    expect((await get('material_types', 'mt')).recentSupplierName).toBe('新供應商');
    expect(next.standaloneMaterialEntries[0].supplierNameSnapshot).toBe('新供應商');
    expect((await get('daily_reports', 'snap')).outputText).toBe('天誠');
  });
  it('拒絕空值與同類型重複值', async () => {
    const report = await seed();
    await expect(updateMaterialMemoryItem(report, 'm1', '  ')).rejects.toThrow('請輸入名稱。');
    await expect(updateMaterialMemoryItem(report, 'm1', '其他')).rejects.toThrow('此材料類型已有相同的供應商。');
    expect((await get('material_memory_items', 'm1')).value).toBe('天誠');
  });
});
