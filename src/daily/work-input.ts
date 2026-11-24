import type { TradeSection, WorkItem } from '../domain/daily';
import type { NamedMemory } from '../data/daily-repository';
import { normalizeName } from '../format/normalization';
import { splitWorkInput } from './input-workflow';
export function sameWorkNames(trade: TradeSection, value: string, exceptId?: string): string[] {
  const names = splitWorkInput(value, true).committed;
  const seen = new Set(trade.workItems.filter((work) => work.id !== exceptId).map((work) => normalizeName(work.taskTextSnapshot)));
  const duplicates = new Set<string>();
  for (const name of names) { const key = normalizeName(name); if (seen.has(key)) duplicates.add(name); seen.add(key); }
  return [...duplicates];
}
export function clearWorkItemDetails(work: WorkItem): void {
  work.startFloorRaw = ''; work.endFloorRaw = '';
  work.startFloorNormalized = null; work.endFloorNormalized = null;
  work.locationId = null; work.locationTextSnapshot = ''; work.note = '';
}
export function workSuggestions(trade: TradeSection, tasks: NamedMemory[], value: string, editing = false): NamedMemory[] {
  const added = new Set(trade.workItems.map((work) => normalizeName(work.taskTextSnapshot)));
  const choices = new Map<string, NamedMemory>();
  const ranked = tasks.slice().sort((a, b) => Number(b.status === 'confirmed') - Number(a.status === 'confirmed')
    || b.usageCount - a.usageCount || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.id.localeCompare(b.id));
  for (const row of ranked) {
    const name = normalizeName(row.name);
    if (row.tradeTypeId === trade.tradeTypeId && name && name.includes(normalizeName(value))
      && (editing || !added.has(name)) && !choices.has(name)) choices.set(name, row);
  }
  return [...choices.values()].sort((a, b) => b.usageCount - a.usageCount
    || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.id.localeCompare(b.id)).slice(0, 6);
}
export function locationChipText(start: string, end: string, location: string): string {
  const floors = start && end && end !== start ? `${start}–${end}` : start || end;
  return [floors, location].filter((part) => part.trim()).join('・') || '＋位置';
}
const drafts = new Map<string, string>();
export function snapshotWorkDrafts(): Array<[string, string]> { return [...drafts]; }
export function restoreWorkDrafts(values: Array<[string, string]>): void { drafts.clear(); for (const [id, text] of values) drafts.set(id, text); }
export function consumeWorkDrafts(): Array<[string, string]> { const result = [...drafts]; drafts.clear(); return result; }
