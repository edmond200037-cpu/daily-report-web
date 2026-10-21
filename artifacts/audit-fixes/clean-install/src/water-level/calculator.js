import { withinRecentThreeDays } from '../shared/date.js';
export const normalize = (text) => text.trim().replace(/[　\s]+/g, ' ').toLocaleLowerCase('en-US');
export const hourlyNow = (date = new Date()) => { date.setMinutes(0, 0, 0); return date.toISOString().slice(0, 16); };
export function validateLog(log, importMode = false) {
  const issues = [];
  if (!log || typeof log !== 'object') return ['量測資料格式錯誤。'];
  const date = new Date(log.measuredAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(log.measuredAt ?? '') || Number.isNaN(date.getTime()) || date.getDate() !== Number(log.measuredAt.slice(8, 10)) || !withinRecentThreeDays(log.measuredAt)) issues.push('量測時間只能是今天、昨天或前天。');
  const numeric = (value) => (typeof value === 'number' || typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value)) && Number.isFinite(Number(value));
  if (log.battery !== '' && !numeric(log.battery)) issues.push('電池電量必須是數字。');
  if (!Array.isArray(log.readings)) return [...issues, '井位資料格式錯誤。'];
  const seen = new Set();
  for (const reading of log.readings) {
    if (!reading || (!importMode && typeof reading.pointId !== 'string') || typeof reading.pointNameSnapshot !== 'string' || !reading.pointNameSnapshot.trim()) { issues.push('井位資料格式錯誤。'); continue; }
    const identity = importMode ? normalize(reading.pointNameSnapshot) : reading.pointId;
    if (seen.has(identity)) issues.push('同一量測不可重複井位。');
    seen.add(identity);
    if (reading.value !== '' && (!numeric(reading.value) || Number(reading.value) <= 0)) issues.push(`${reading.pointNameSnapshot} 的水位必須大於 0。`);
    if (reading.sourceChange != null && !numeric(reading.sourceChange)) issues.push('水位變化量必須是數字。');
  }
  return issues;
}
export function recalculate(logs) { const chronological = [...logs].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)); const last = new Map(); return chronological.map((log) => ({ ...log, readings: log.readings.map((reading) => { const value = reading.value === '' ? null : Number(reading.value); const previous = last.get(reading.pointId); const change = value !== null && previous !== undefined ? Number((value - previous).toFixed(3)) : value === null ? null : reading.sourceChange ?? null; if (value !== null) last.set(reading.pointId, value); return { ...reading, value: value ?? '', change }; }) })); }
export const changeLabel = (change) => change === null || change === undefined ? '' : change >= 0 ? `下降${Math.abs(change).toFixed(3)}` : `上升${Math.abs(change).toFixed(3)}`;
