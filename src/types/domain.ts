export type Id = string;
export type SectionType = 'construction' | 'material' | 'contact' | 'special';

export interface Entity { id: Id; createdAt: string; updatedAt: string; }
export interface Sortable { sortOrder: number; }
export interface Site extends Entity { name: string; normalizedName: string; usageCount: number; lastUsedAt: string; }
export interface TradeType extends Entity { name: string; normalizedName: string; usageCount: number; lastUsedAt: string; }
export interface TradeVendor extends Entity { tradeTypeId: Id; name: string; normalizedName: string; usageCount: number; lastUsedAt: string; }
export interface Material extends Entity { name: string; normalizedName: string; outputLabel?: string; defaultUnit: string; usageCount: number; lastUsedAt: string; }
export interface MaterialSpecification extends Entity { materialId: Id; specification: string; normalizedName: string; usageCount: number; lastUsedAt: string; }
export interface WorkItem extends Sortable { id: Id; text: string; }
export interface VendorWorkEntry extends Sortable { id: Id; vendorId?: Id; vendorNameSnapshot: string; workerCount: number; workItems: WorkItem[]; }
export interface MaterialEntry extends Sortable { id: Id; materialId?: Id; materialNameSnapshot: string; outputLabelSnapshot: string; vendorId?: Id; vendorNameSnapshot: string; quantity: number; unit: string; specification?: string; note?: string; }
export interface ConstructionSection extends Sortable { id: Id; sectionType: 'construction'; tradeTypeId?: Id; tradeNameSnapshot: string; entries: Array<VendorWorkEntry | MaterialEntry>; }
export interface StandaloneMaterialSection extends Sortable { id: Id; sectionType: 'material'; entry: MaterialEntry; }
export interface ContactItem extends Sortable { id: Id; tradeTypeId?: Id; tradeNameSnapshot: string; vendorId?: Id; vendorNameSnapshot: string; plannedDate: string; content: string; }
export interface ContactSection { id: Id; sectionType: 'contact'; items: ContactItem[]; }
export type SpecialValue = Record<string, string>;
export interface SpecialItem extends Sortable { id: Id; categoryId?: Id; categoryNameSnapshot: string; templateId?: Id; templateTextSnapshot: string; values: SpecialValue; renderedText: string; }
export interface SpecialSection { id: Id; sectionType: 'special'; items: SpecialItem[]; }
export type ReportSection = ConstructionSection | StandaloneMaterialSection | ContactSection | SpecialSection;
export interface DailyReport { id: Id; date: string; siteId?: Id; siteNameSnapshot: string; sections: ReportSection[]; createdAt: string; updatedAt: string; }
export interface ReportSnapshot extends DailyReport { outputText: string; completedAt: string; }
export interface Draft { id: 'current'; report: DailyReport; savedAt: string; }
export interface ValidationIssue { code: string; fieldPath: string; message: string; severity: 'error' | 'warning'; }
export interface SpecialCategory extends Entity, Sortable { name: string; normalizedName: string; }
export type SpecialVariableType = 'text' | 'date' | 'time' | 'number';
export interface SpecialTemplateVariable extends Entity, Sortable { templateId: Id; key: string; label: string; type: SpecialVariableType; required: boolean; }
export interface SpecialTemplate extends Entity { categoryId: Id; templateText: string; normalizedName: string; usageCount: number; lastUsedAt: string; }
export interface BackupPayload { schemaVersion: 2; exportType: 'memory' | 'full'; exportedAt: string; appVersion: string; data: Record<string, unknown[]>; }
