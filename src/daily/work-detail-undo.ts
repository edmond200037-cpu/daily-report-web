import type { DailyReportV3, WorkItem } from '../domain/daily';

export const workDetailFields = ['startFloorRaw', 'endFloorRaw', 'startFloorNormalized', 'endFloorNormalized', 'locationId', 'locationTextSnapshot', 'note'] as const;
type Details = Pick<WorkItem, typeof workDetailFields[number]>;
export interface WorkDetailUndo { scope: string; tradeId: string; workId: string; before: Details; cleared: Details; }
export const workUndoScope = (report: DailyReportV3): string => JSON.stringify([report.id, report.date, report.siteId, report.shared?.userId, report.shared?.siteId]);
export function snapshotDetails(work: WorkItem): Details {
  return Object.fromEntries(workDetailFields.map((key) => [key, work[key]])) as Details;
}
export function canRestoreDetails(undo: WorkDetailUndo, report: DailyReportV3): boolean {
  const work = report.tradeSections.find((trade) => trade.id === undo.tradeId)?.workItems.find((row) => row.id === undo.workId);
  return undo.scope === workUndoScope(report) && !!work && JSON.stringify(snapshotDetails(work)) === JSON.stringify(undo.cleared);
}
