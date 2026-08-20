import type { MemoryCandidate, MemoryCandidateKey, MemoryKind } from '../data/daily-repository';
import type { DailyReportV3, MaterialEntry } from '../domain/daily';

export interface MemoryCandidateGroup { kind: MemoryKind; rows: MemoryCandidate[]; }

const kindOrder: MemoryKind[] = ['sites', 'trades', 'vendors', 'tasks', 'locations', 'material-types', 'material-items'];
const normalized = (value: string | undefined): string => (value ?? '').trim().replace(/　/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const candidateOrder = (a: MemoryCandidate, b: MemoryCandidate): number =>
  b.finalizedUsageCount - a.finalizedUsageCount
  || (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '')
  || normalized(a.name).localeCompare(normalized(b.name));

export function groupMemoryCandidates(candidates: MemoryCandidate[]): MemoryCandidateGroup[] {
  const grouped = new Map<MemoryKind, MemoryCandidate[]>();
  candidates.forEach((candidate) => grouped.set(candidate.kind, [...(grouped.get(candidate.kind) ?? []), candidate]));
  return [...grouped.entries()]
    .map(([kind, rows]) => ({ kind, rows: rows.sort(candidateOrder) }))
    .sort((a, b) => candidateOrder(a.rows[0], b.rows[0]) || kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
}

export function confirmationSelection(selectedKeys: MemoryCandidateKey[], candidates: MemoryCandidate[]): { keys: MemoryCandidateKey[]; addedParentCount: number } {
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const explicit = new Set(selectedKeys);
  const selected = new Set(selectedKeys);
  const includeParent = (key: MemoryCandidateKey): void => {
    const parentKey = byKey.get(key)?.parentKey;
    if (!parentKey || selected.has(parentKey) || !byKey.has(parentKey)) return;
    selected.add(parentKey);
    includeParent(parentKey);
  };
  selectedKeys.forEach(includeParent);
  return { keys: [...selected], addedParentCount: [...selected].filter((key) => !explicit.has(key)).length };
}

export function rejectionSelection(selectedKeys: MemoryCandidateKey[], candidates: MemoryCandidate[]): { keys: MemoryCandidateKey[]; addedChildCount: number } {
  const explicit = new Set(selectedKeys); const selected = new Set(selectedKeys);
  const children = new Map<MemoryCandidateKey, MemoryCandidateKey[]>();
  candidates.forEach((candidate) => { if (candidate.parentKey) children.set(candidate.parentKey, [...(children.get(candidate.parentKey) ?? []), candidate.key]); });
  const includeChildren = (key: MemoryCandidateKey): void => { (children.get(key) ?? []).forEach((childKey) => { if (selected.has(childKey)) return; selected.add(childKey); includeChildren(childKey); }); };
  selectedKeys.forEach(includeChildren);
  return { keys: [...selected], addedChildCount: [...selected].filter((key) => !explicit.has(key)).length };
}

const matches = (id: string | null | undefined, snapshot: string | undefined, candidate: MemoryCandidate): boolean =>
  id === candidate.id || normalized(snapshot) === normalized(candidate.name);

export function memoryCandidateImpact(report: DailyReportV3, candidate: MemoryCandidate): number {
  if (candidate.kind === 'sites') return matches(report.siteId, report.siteNameSnapshot, candidate) ? 1 : 0;
  if (candidate.kind === 'trades') return report.tradeSections.filter((row) => matches(row.tradeTypeId, row.tradeNameSnapshot, candidate)).length
    + report.contacts.filter((row) => matches(row.tradeTypeId, row.tradeNameSnapshot, candidate)).length;
  if (candidate.kind === 'vendors') return report.tradeSections.filter((row) => matches(row.vendorId, row.vendorNameSnapshot, candidate)).length
    + report.contacts.filter((row) => matches(row.vendorId, row.vendorNameSnapshot, candidate)).length;
  if (candidate.kind === 'tasks') return report.tradeSections.reduce((total, row) => total + row.workItems.filter((work) => matches(work.taskId, work.taskTextSnapshot, candidate)).length, 0)
    + report.contacts.reduce((total, row) => total + row.items.filter((item) => normalized(item.content) === normalized(candidate.name)).length, 0);
  if (candidate.kind === 'locations') return report.tradeSections.reduce((total, row) => total + row.workItems.filter((work) => matches(work.locationId, work.locationTextSnapshot, candidate)).length, 0);
  if (candidate.kind === 'material-types') return report.standaloneMaterialEntries.filter((entry) => matches(entry.materialTypeId, entry.materialTypeSnapshot, candidate)).length;
  const field: Partial<Record<MemoryCandidate['fieldType'] & string, keyof MaterialEntry>> = { itemName: 'itemName', specification: 'specification', unit: 'unit', supplier: 'supplierNameSnapshot' };
  const fieldName = candidate.fieldType ? field[candidate.fieldType] : undefined;
  if (!fieldName) return 0;
  return report.standaloneMaterialEntries.filter((entry) => normalized(entry.materialTypeSnapshot) === normalized(candidate.parentName) && normalized(String(entry[fieldName] ?? '')) === normalized(candidate.name)).length;
}
