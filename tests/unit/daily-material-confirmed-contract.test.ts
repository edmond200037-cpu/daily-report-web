import { beforeEach, describe, expect, it } from 'vitest';
import { dailyState as state, resetDaily, renderMaterials } from './helpers/react-daily';
import { createMaterialEntry } from '../../src/domain/daily';
beforeEach(resetDaily);
describe('React 材料建議的正式記憶邊界', () => {
  it('其他欄位同名的正式記憶不會放行候選規格', () => {
    state.materialEditor = {
      id: 'draft:test',
      originalId: null,
      value: { ...createMaterialEntry(0), materialTypeId: 'steel' },
      errors: [],
    };
    const memory = {
      id: 'candidate',
      materialTypeId: 'steel',
      fieldType: 'specification',
      value: '候選規格',
      normalizedValue: '候選規格',
      usageCount: 1,
      finalizedUsageCount: 0,
      lastUsedAt: '',
      createdAt: '',
      updatedAt: '',
      status: 'candidate',
    };
    state.materialMemory = [
      memory,
      { ...memory, id: 'confirmed-unit', fieldType: 'unit', status: 'confirmed' },
    ] as typeof state.materialMemory;
    const html = renderMaterials();
    const start = html.indexOf('規格（選填）');
    const end = html.indexOf('供應商', start);
    expect(html.slice(start, end)).not.toContain('候選規格');
    expect(html).toContain('候選規格');
  });
  it('其他材料類型的同名正式規格不會放行目前類型的候選', () => {
    state.materialEditor = {
      id: 'draft:test',
      originalId: null,
      value: { ...createMaterialEntry(0), materialTypeId: 'steel' },
      errors: [],
    };
    const memory = {
      id: 'candidate',
      materialTypeId: 'steel',
      fieldType: 'specification',
      value: '候選規格',
      normalizedValue: '候選規格',
      usageCount: 1,
      finalizedUsageCount: 0,
      lastUsedAt: '',
      createdAt: '',
      updatedAt: '',
      status: 'candidate',
    };
    state.materialMemory = [
      memory,
      { ...memory, id: 'confirmed-other', materialTypeId: 'cement', status: 'confirmed' },
    ] as typeof state.materialMemory;
    const html = renderMaterials();
    const start = html.indexOf('規格（選填）');
    const end = html.indexOf('供應商', start);
    expect(html.slice(start, end)).not.toContain('候選規格');
  });
});
