import type { DailyReportV3 } from '../domain/daily';
import { validateTrade } from './daily-validator';
import { duplicateVendorTradeIds } from './daily-output-model';
import { applyFieldMutations, buildFieldMutations } from '../sync/field-mutations';

/** Composition events must finish before calling this parser. */
export function splitWorkInput(value: string, commitTail = false): { committed: string[]; remainder: string } {
  const parts = value.split('、');
  const remainder = commitTail ? '' : parts.pop() ?? '';
  return { committed: parts.map((part) => part.trim()).filter(Boolean), remainder };
}

export function refreshCompleteness(report: DailyReportV3): void {
  const duplicates = duplicateVendorTradeIds(report);
  for (const trade of report.tradeSections) {
    const linked = report.standaloneMaterialEntries.filter((entry) => entry.entryType === 'independent' && entry.connectedTradeSectionId === trade.id);
    trade.status = !duplicates.has(trade.id) && !validateTrade(trade, linked).length ? 'complete' : 'draft';
  }
}

/** Compare with the editor's baseline, never with a newer pulled partition. */
export function mergeEditorIntent(latest: DailyReportV3, baseline: DailyReportV3, edited: DailyReportV3): DailyReportV3 {
  const changes = buildFieldMutations('daily', baseline as unknown as Record<string, unknown>, edited as unknown as Record<string, unknown>);
  const result = applyFieldMutations(latest as unknown as Record<string, unknown>, changes) as unknown as DailyReportV3;
  result.activeTab = edited.activeTab;
  result.updatedAt = edited.updatedAt;
  refreshCompleteness(result);
  return result;
}
