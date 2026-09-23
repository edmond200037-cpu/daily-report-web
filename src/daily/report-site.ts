import type { DailyReportV3 } from '../domain/daily';
import type { SiteSummary } from '../domain/shared';

/** The selected shared site owns the report's displayed and finalized name. */
export function withActiveSharedSite(report: DailyReportV3, site: Pick<SiteSummary, 'name'> | undefined): DailyReportV3 {
  if (!site || report.siteNameSnapshot === site.name) return report;
  return { ...report, siteId: null, siteNameSnapshot: site.name };
}
