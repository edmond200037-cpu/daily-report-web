import { escapeHtml } from '../shared/html';
import type { WorkItem } from '../domain/daily';
import type { NamedMemory } from '../data/daily-repository';
export function normalizeFloor(value: string): string | null {
  const raw = value.trim().toUpperCase();
  if (!raw || /\s|[^A-Z0-9-]/.test(raw)) return raw ? null : '';
  if (/^[1-9]\d*(?:F|FL)?$/.test(raw)) return `${Number.parseInt(raw, 10)}FL`;
  const basement = raw.match(/^(?:B|-)([1-9]\d*)(?:F|FL)?$/); if (basement) return `B${Number.parseInt(basement[1], 10)}F`;
  if (raw === 'RF' || raw === 'PH' || raw === 'MF' || /^R[1-9]$/.test(raw)) return raw;
  return null;
}
export function comparableFloor(value: string | null): number | null { if (!value) return null; const above = value.match(/^(\d+)FL$/); if (above) return Number(above[1]); const below = value.match(/^B(\d+)F$/); return below ? -Number(below[1]) : null; }
export const floorRange = (start: string, end: string): string => start && end ? `${start}～${end}` : start || end;
/** 選定位置記憶：連結位置；樓層兩欄皆空白才帶入記憶的樓層（單日事實不覆蓋）。無符合記憶時只解除連結。 */
export function applyLocationMemory(work: WorkItem, memory?: Pick<NamedMemory, 'id' | 'name' | 'startFloorRaw' | 'endFloorRaw'>): void {
  if (!memory) { work.locationId = null; return; }
  work.locationId = memory.id; work.locationTextSnapshot = memory.name;
  if (work.startFloorRaw.trim() || work.endFloorRaw.trim()) return;
  const start = normalizeFloor(memory.startFloorRaw ?? '') || ''; const end = normalizeFloor(memory.endFloorRaw ?? '') || '';
  work.startFloorRaw = start; work.startFloorNormalized = start || null; work.endFloorRaw = end; work.endFloorNormalized = end || null;
}

export const locationOptions = (rows: NamedMemory[]): string => rows.filter((row) => (row.status ?? 'confirmed') === 'confirmed').map((row) => `<option value="${escapeHtml(row.name)}">${escapeHtml([row.startFloorRaw, row.endFloorRaw].filter(Boolean).join('～'))}</option>`).join('');
