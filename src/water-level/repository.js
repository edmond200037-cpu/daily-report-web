import { list } from '../data/db.js';
import { recalculate, validateLog, normalize } from './calculator.js';
import { localDate, withinRecentThreeDays } from '../shared/date.js';
import { commitActiveWaterPartition } from '../data/water-partition';
const stamp = () => new Date().toISOString();

export const loadPoints = async () => (await list('water_level_points')).sort((a, b) => a.sortOrder - b.sortOrder);
export const loadLogs = async () => recalculate(await list('water_level_logs')).filter((log) => withinRecentThreeDays(log.measuredAt));

function pointForName(points, name, id) {
  const normalizedName = normalize(name);
  if (!normalizedName) throw new Error('請輸入井位名稱。');
  if (points.some((point) => normalize(point.name) === normalizedName && point.id !== id)) throw new Error('此井位名稱已存在。');
  const current = id ? points.find((point) => point.id === id) : undefined;
  return { id: id || crypto.randomUUID(), name: name.trim(), normalizedName, sortOrder: current?.sortOrder ?? points.length, createdAt: current?.createdAt ?? stamp(), updatedAt: stamp() };
}

export async function savePoint(name, id) {
  return commitActiveWaterPartition((payload) => {
    const point = pointForName(payload.points, name, id);
    payload.points = [...payload.points.filter((row) => row.id !== point.id), point]; return point;
  });
}
export async function deletePoint(id) { await commitActiveWaterPartition((payload) => { payload.points = payload.points.filter((row) => row.id !== id); }); }

function saveInto(payload, log) {
  const complete = { ...log, id: log.id || crypto.randomUUID(), createdAt: log.createdAt || stamp(), updatedAt: stamp() };
  payload.logs = recalculate([...payload.logs.filter((item) => item.id !== complete.id), complete]);
  return payload.logs.find((item) => item.id === complete.id);
}
export async function saveLog(log) {
  const errors = validateLog(log); if (errors.length) throw new Error(errors.join('；'));
  return commitActiveWaterPartition((payload) => saveInto(payload, log));
}
/** Validate the entire segment before any well/log/outbox write. */
export async function importLog(segment, existingId) {
  const errors = validateLog(segment, true); if (errors.length) throw new Error(errors.join('；'));
  return commitActiveWaterPartition((payload) => {
    const readings = segment.readings.map((reading) => {
      let point = payload.points.find((row) => normalize(row.name) === normalize(reading.pointNameSnapshot));
      if (!point) { point = pointForName(payload.points, reading.pointNameSnapshot); payload.points.push(point); }
      return { ...reading, pointId: point.id, pointNameSnapshot: point.name };
    });
    return saveInto(payload, { id: existingId || '', measuredAt: segment.measuredAt, battery: segment.battery, readings });
  });
}
export async function deleteLog(id) { await commitActiveWaterPartition((payload) => { payload.logs = recalculate(payload.logs.filter((log) => log.id !== id)); }); }
// Retention is a read filter. Only deleteLog emits a shared deletion.
export async function prune() {}
export const newLog = (points) => ({ id: '', measuredAt: `${localDate()}T${String(new Date().getHours()).padStart(2, '0')}:00`, battery: '', readings: points.map((point) => ({ pointId: point.id, pointNameSnapshot: point.name, value: '', change: null })) });
