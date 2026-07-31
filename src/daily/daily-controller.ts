import { createContact, createSpecial, createSupply, createTrade, createVendor, createWorkItem, timestamp, type DailyReportV3, type SupplyType, type TradeSection } from '../domain/daily';
import { localToday } from '../format/date-format';
import { saveDailyDraft } from '../data/daily-repository';
import { validateTrade } from './daily-validator';

export class DailyController {
  report: DailyReportV3; expandedId: string | null = null; private timer?: number;
  constructor(report?: DailyReportV3) { const now = timestamp(); this.report = { id: 'current', date: localToday(), siteNameSnapshot: '', activeTab: 'engineering', tradeSections: [], supplies: [], contacts: [], specialItems: [], createdAt: now, updatedAt: now, ...report }; this.report.supplies ??= []; this.report.contacts ??= []; this.report.specialItems ??= []; }
  update(mutator: () => void): void { mutator(); this.report.updatedAt = timestamp(); window.clearTimeout(this.timer); this.timer = window.setTimeout(() => this.flush(), 600); }
  async flush(): Promise<void> { window.clearTimeout(this.timer); await saveDailyDraft(this.report); }
  switchTab(tab: DailyReportV3['activeTab']): void { if (this.report.activeTab === tab) return; this.update(() => { if (this.report.activeTab === 'engineering') this.expandedId = null; this.report.activeTab = tab; }); }
  addTrade(name: string): string | null { const trimmed = name.trim(); if (!trimmed) return null; const existing = this.report.tradeSections.find((item) => item.tradeNameSnapshot.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()); if (existing) { this.expandedId = existing.id; existing.status = 'draft'; return existing.id; } const section = createTrade(trimmed, this.report.tradeSections.length); this.update(() => this.report.tradeSections.push(section)); this.expandedId = section.id; return section.id; }
  trade(id: string): TradeSection | undefined { return this.report.tradeSections.find((item) => item.id === id); }
  addVendor(tradeId: string): void { const trade = this.trade(tradeId); if (trade) this.update(() => trade.vendors.push(createVendor(trade.vendors.length))); }
  addWorkItem(tradeId: string, vendorId: string): void { const vendor = this.trade(tradeId)?.vendors.find((item) => item.id === vendorId); if (vendor) this.update(() => vendor.workItems.push(createWorkItem(vendor.workItems.length))); }
  deleteWorkItem(tradeId: string, vendorId: string, workItemId: string): boolean {
    const vendor = this.trade(tradeId)?.vendors.find((item) => item.id === vendorId);
    const work = vendor?.workItems.find((item) => item.id === workItemId);
    if (!vendor || !work) return false;
    const hasContent = Boolean(work.locationText.trim() || work.taskTextSnapshot.trim() || work.note.trim());
    if (hasContent && !window.confirm('確定刪除此工項？刪除後無法復原。')) return false;
    this.update(() => {
      vendor.workItems = vendor.workItems.filter((item) => item.id !== workItemId);
      vendor.workItems.forEach((item, index) => item.sortOrder = index);
    });
    return true;
  }
  addSupply(type: SupplyType): void { this.update(() => this.report.supplies.push(createSupply(this.report.supplies.length, type))); }
  addContact(): void { this.update(() => this.report.contacts.push(createContact(this.report.contacts.length))); }
  addSpecial(): void { this.update(() => this.report.specialItems.push(createSpecial(this.report.specialItems.length))); }
  complete(tradeId: string): string[] { const trade = this.trade(tradeId); if (!trade) return []; const issues = validateTrade(trade); if (!issues.length) this.update(() => { trade.status = 'complete'; this.expandedId = null; }); return issues.map((item) => item.message); }
  toggle(tradeId: string): void { const trade = this.trade(tradeId); if (!trade) return; this.update(() => { if (this.expandedId === tradeId) this.expandedId = null; else { if (trade.status === 'complete') trade.status = 'draft'; this.expandedId = tradeId; } }); }
}
