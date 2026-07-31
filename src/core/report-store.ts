import { localToday } from '../format/date-format';
import { database } from '../db/database';
import type { DailyReport, Draft, ReportSnapshot } from '../types/domain';

export const id = (): string => crypto.randomUUID();
const stamp = (): string => new Date().toISOString();
export function createReport(siteName = ''): DailyReport { const now = stamp(); return { id: id(), date: localToday(), siteNameSnapshot: siteName, sections: [], createdAt: now, updatedAt: now }; }
export class ReportStore {
  report: DailyReport; private saveTimer?: number;
  constructor(report: DailyReport) { this.report = report; }
  static async restore(): Promise<ReportStore> { const draft = await database.get<Draft>('drafts', 'current'); return new ReportStore(draft?.report ?? createReport()); }
  update(mutator: (report: DailyReport) => void): void { mutator(this.report); this.report.updatedAt = stamp(); this.scheduleSave(); }
  scheduleSave(): void { window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => database.put('drafts', { id: 'current', report: this.report, savedAt: stamp() }).catch(() => undefined), 1000); }
  async clear(siteName = ''): Promise<void> { this.report = createReport(siteName); await database.delete('drafts', 'current'); }
  async complete(outputText: string): Promise<ReportSnapshot> { const snapshot: ReportSnapshot = { ...structuredClone(this.report), id: id(), outputText, completedAt: stamp(), createdAt: stamp(), updatedAt: stamp() }; await database.put('reports', snapshot); await this.clear(this.report.siteNameSnapshot); return snapshot; }
}
