import { describe, expect, it } from 'vitest';
import { isFinalizedReportExpired, outputFingerprint, recentConfirmedVendor, type NamedMemory } from '../../src/data/daily-repository';
import { validateDailyForFinalization } from '../../src/daily/daily-validator';
import type { DailyReportV3 } from '../../src/domain/daily';

const draft = (): DailyReportV3 => ({ id: 'current', date: '2026-08-10', siteId: 'site-1', siteNameSnapshot: '測試工地', activeTab: 'engineering', tradeSections: [{ id: 'trade-1', tradeTypeId: null, tradeNameSnapshot: '模板工程', vendorId: null, vendorNameSnapshot: '廠商', workerCount: '3', workItems: [{ id: 'work-1', startFloorRaw: '', startFloorNormalized: null, endFloorRaw: '', endFloorNormalized: null, locationId: null, locationTextSnapshot: '', taskId: null, taskTextSnapshot: '模板組立', note: '', sortOrder: 0, createdAt: '', updatedAt: '' }], materialEntries: [], status: 'complete', sortOrder: 0, createdAt: '', updatedAt: '' }], standaloneMaterialEntries: [], supplies: [], contacts: [], specialItems: [], createdAt: '', updatedAt: '' });

describe('日報定稿契約', () => {
  it('要求日期、工地及所有工種完成後才能定稿', () => {
    expect(validateDailyForFinalization(draft())).toEqual([]);
    const incomplete = draft(); incomplete.tradeSections[0].status = 'draft';
    expect(validateDailyForFinalization(incomplete)).toContain('尚有工種草稿，請完成或刪除後再定稿。');
    const missingSite = draft(); missingSite.siteNameSnapshot = '';
    expect(validateDailyForFinalization(missingSite)).toContain('請填寫工地名稱。');
  });

  it('在第 7 個日曆日清除已定稿日報', () => {
    const reference = new Date('2026-08-10T12:00:00+08:00');
    expect(isFinalizedReportExpired('2026-08-03T08:00:00+08:00', reference)).toBe(true);
    expect(isFinalizedReportExpired('2026-08-04T08:00:00+08:00', reference)).toBe(false);
  });

  it('以完整輸出產生穩定且內容敏感的 SHA-256 指紋', async () => {
    await expect(outputFingerprint('模板工程：施工。')).resolves.toBe(await outputFingerprint('模板工程：施工。'));
    await expect(outputFingerprint('模板工程：施工。')).resolves.not.toBe(await outputFingerprint('模板工程：進料。'));
  });

  it('最近正式廠商依時間、使用次數與名稱穩定排序，忽略候選', () => {
    const memory = (id: string, name: string, lastUsedAt: string | null, usageCount: number, status: 'candidate' | 'confirmed' = 'confirmed'): NamedMemory => ({ id, name, normalizedName: name.toLowerCase(), tradeTypeId: 'trade-1', lastUsedAt, usageCount, finalizedUsageCount: 0, createdAt: '', updatedAt: '', status });
    expect(recentConfirmedVendor([
      memory('candidate', '候選廠商', '2026-08-12T00:00:00.000Z', 99, 'candidate'),
      memory('beta', 'Beta', '2026-08-11T00:00:00.000Z', 3),
      memory('alpha', 'Alpha', '2026-08-11T00:00:00.000Z', 3),
      memory('old', '舊廠商', '2026-08-10T00:00:00.000Z', 99),
    ], 'trade-1')?.id).toBe('alpha');
  });
});
