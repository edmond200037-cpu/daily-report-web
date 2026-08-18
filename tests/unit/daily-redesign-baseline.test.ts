// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DailyController } from '../../src/daily/daily-controller';
import { formatDailyReport } from '../../src/daily/daily-formatter';
import { validateDailyForFinalization } from '../../src/daily/daily-validator';
import { blockedPopulatedDailyReport, POPULATED_DAILY_OUTPUT, populatedDailyReport } from '../fixtures/populated-daily-report';

beforeAll(() => {
  Object.assign(globalThis, { window: { clearTimeout, setTimeout } });
});

describe('日報紙本表單重整前功能基線', () => {
  it('完整 populated fixture 的 formatter 輸出逐字固定', () => {
    const report = populatedDailyReport();
    const before = structuredClone(report);

    expect(formatDailyReport(report)).toBe(POPULATED_DAILY_OUTPUT);
    expect(report).toEqual(before);
  });

  it('完整 populated fixture 可以定稿，驗證流程不修改原資料', () => {
    const report = populatedDailyReport();
    const before = structuredClone(report);

    expect(validateDailyForFinalization(report)).toEqual([]);
    expect(report).toEqual(before);
  });

  it('草稿工種與未連結獨立進料維持定稿阻擋', () => {
    expect(validateDailyForFinalization(blockedPopulatedDailyReport())).toEqual(expect.arrayContaining([
      '尚有工種草稿，請完成或刪除後再定稿。',
      '尚有未連結的獨立進料，請先連接至施工工種。',
    ]));
  });

  it('單純展開或收合工程條目不更新日報、不排程保存', () => {
    const saveState = vi.fn();
    const controller = new DailyController(populatedDailyReport(), saveState);
    const before = structuredClone(controller.report);

    controller.toggle('trade-formwork-a');
    expect(controller.expandedId).toBe('trade-formwork-a');
    controller.toggle('trade-formwork-a');

    expect(controller.expandedId).toBeNull();
    expect(controller.report).toEqual(before);
    expect(saveState).not.toHaveBeenCalled();
  });

  it('寫入相同施工輸出值不更新時間、不讓完成工種退回草稿', () => {
    const saveState = vi.fn();
    const controller = new DailyController(populatedDailyReport(), saveState);
    const beforeUpdatedAt = controller.report.updatedAt;

    expect(controller.updateTradeOutputData('trade-formwork-a', (trade) => {
      trade.vendorNameSnapshot = '永固營造股份有限公司';
    })).toBe(false);

    expect(controller.report.updatedAt).toBe(beforeUpdatedAt);
    expect(controller.trade('trade-formwork-a')?.status).toBe('complete');
    expect(saveState).not.toHaveBeenCalled();
  });

  it('現行預覽開關只更新 UI 狀態，不呼叫日報 mutation 或 flush', () => {
    // The event handler has no exported seam; keep this source contract until the
    // Phase 5 Bottom Sheet controller exposes a behaviour-level test seam.
    const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
    const branch = source.match(/if \(action === 'toggle-preview'\) \{([^}]+)\}/)?.[1] ?? '';

    expect(branch).toContain('dailyPreviewOpen = !dailyPreviewOpen');
    expect(branch).toContain('await renderApp()');
    expect(branch).toContain('return');
    expect(branch).not.toContain('daily.update');
    expect(branch).not.toContain('daily.flush');
  });

  it('定稿 repository 直接保存呼叫端產生的 outputText', () => {
    // IndexedDB integration is intentionally out of this unit suite; this protects
    // the snapshot ownership boundary while the visual work changes no repository code.
    const source = readFileSync(new URL('../../src/data/daily-repository.ts', import.meta.url), 'utf8');
    const finalize = source.match(/export async function finalizeDailyReport[\s\S]+?return \{ snapshot, nextDraft \}; \}/)?.[0] ?? '';

    expect(finalize).toContain('outputText, templateVersion: DAILY_TEMPLATE_VERSION');
    expect(finalize).toContain("transaction(['daily_reports', 'live_report_draft'], 'readwrite')");
    expect(finalize).toContain("objectStore('daily_reports').put(snapshot)");
    expect(finalize).toContain("objectStore('live_report_draft').put(nextDraft)");
  });
});
