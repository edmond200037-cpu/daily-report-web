import { formatMeasurementTime } from '../shared/date.js';
import { changeLabel } from './calculator.js';
export function formatWaterLog(log) { const lines = [formatMeasurementTime(log.measuredAt)]; log.readings.forEach((reading) => lines.push(`${reading.pointNameSnapshot}：${reading.value === '' ? '無數據' : `${Number(reading.value).toFixed(3)}${changeLabel(reading.change) ? `(${changeLabel(reading.change)})` : ''}`}`)); if (log.battery !== '') lines.push(`電池電量：${Number(log.battery).toFixed(3)}`); return lines.join('\n'); }
export const formatWaterLogs = (logs) => [...logs].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).map(formatWaterLog).join('\n\n');
