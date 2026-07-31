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
