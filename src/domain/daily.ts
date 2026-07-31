export type TradeStatus = 'draft' | 'complete';
export type LocationMode = 'none' | 'single-floor' | 'floor-range' | 'free-text';
export interface WorkItem { id: string; locationMode: LocationMode; locationText: string; taskTextSnapshot: string; note: string; sortOrder: number; createdAt: string; updatedAt: string; }
export interface VendorEntry { id: string; vendorNameSnapshot: string; workerCount: string; sortOrder: number; workItems: WorkItem[]; createdAt: string; updatedAt: string; }
export interface TradeSection { id: string; tradeNameSnapshot: string; status: TradeStatus; sortOrder: number; vendors: VendorEntry[]; createdAt: string; updatedAt: string; }
export type SupplyType = 'concrete' | 'clsm' | 'rebar' | 'other';
export interface SupplyItem { id: string; type: SupplyType; name: string; strength: string; quantity: string; unit: string; sortOrder: number; createdAt: string; updatedAt: string; }
export interface ContactItem { id: string; tradeNameSnapshot: string; vendorNameSnapshot: string; plannedDate: string; content: string; sortOrder: number; createdAt: string; updatedAt: string; }
export interface SpecialItem { id: string; content: string; sortOrder: number; createdAt: string; updatedAt: string; }
export interface DailyReportV3 { id: 'current'; date: string; siteNameSnapshot: string; activeTab: 'engineering' | 'supplies' | 'contacts' | 'special'; tradeSections: TradeSection[]; supplies: SupplyItem[]; contacts: ContactItem[]; specialItems: SpecialItem[]; createdAt: string; updatedAt: string; }
export const timestamp = (): string => new Date().toISOString();
export const createWorkItem = (sortOrder: number): WorkItem => ({ id: crypto.randomUUID(), locationMode: 'none', locationText: '', taskTextSnapshot: '', note: '', sortOrder, createdAt: timestamp(), updatedAt: timestamp() });
export const createVendor = (sortOrder: number): VendorEntry => ({ id: crypto.randomUUID(), vendorNameSnapshot: '', workerCount: '', sortOrder, workItems: [createWorkItem(0)], createdAt: timestamp(), updatedAt: timestamp() });
export const createTrade = (name: string, sortOrder: number): TradeSection => ({ id: crypto.randomUUID(), tradeNameSnapshot: name.trim(), status: 'draft', sortOrder, vendors: [createVendor(0)], createdAt: timestamp(), updatedAt: timestamp() });
export const createSupply = (sortOrder: number, type: SupplyType = 'concrete'): SupplyItem => ({ id: crypto.randomUUID(), type, name: '', strength: '', quantity: '', unit: '', sortOrder, createdAt: timestamp(), updatedAt: timestamp() });
export const createContact = (sortOrder: number): ContactItem => ({ id: crypto.randomUUID(), tradeNameSnapshot: '', vendorNameSnapshot: '', plannedDate: '', content: '', sortOrder, createdAt: timestamp(), updatedAt: timestamp() });
export const createSpecial = (sortOrder: number): SpecialItem => ({ id: crypto.randomUUID(), content: '', sortOrder, createdAt: timestamp(), updatedAt: timestamp() });
