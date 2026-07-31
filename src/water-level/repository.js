import { get, list, put, remove, replaceRecords } from '../data/db.js';
import { recalculate } from './calculator.js';
import { localDate, withinRecentThreeDays } from '../shared/date.js';
const stamp = () => new Date().toISOString();

export const loadPoints = async () => (await list('water_level_points')).sort((a, b) => a.sortOrder - b.sortOrder);
export const loadLogs = async () => (await list('water_level_logs')).filter((log) => withinRecentThreeDays(log.measuredAt)).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
export async function savePoint(name, id) { const points = await loadPoints(); const normalizedName = name.trim().replace(/[　\s]+/g, ' ').toLocaleLowerCase('en-US'); if (!normalizedName) throw new Error('請輸入井位名稱。'); if (points.some((point) => point.normalizedName === normalizedName && point.id !== id)) throw new Error('此井位名稱已存在。'); const current = id ? await get('water_level_points', id) : null; const point = { id: id || crypto.randomUUID(), name: name.trim(), normalizedName, sortOrder: current?.sortOrder ?? points.length, createdAt: current?.createdAt ?? stamp(), updatedAt: stamp() }; await put('water_level_points', point); return point; }
export async function deletePoint(id) { await remove('water_level_points', id); }
export async function saveLog(log) { const logs = await loadLogs(); const complete = { ...log, id: log.id || crypto.randomUUID(), createdAt: log.createdAt || stamp(), updatedAt: stamp() }; const recalculated = recalculate([...logs.filter((item) => item.id !== complete.id), complete]); await replaceRecords('water_level_logs', recalculated); await prune(); return recalculated.find((item) => item.id === complete.id); }
export async function deleteLog(id) { const logs = await loadLogs(); await replaceRecords('water_level_logs', recalculate(logs.filter((log) => log.id !== id))); await prune(); }
export async function prune() { const all = await list('water_level_logs'); const expired = all.filter((log) => !withinRecentThreeDays(log.measuredAt)); for (const item of expired) await remove('water_level_logs', item.id); }
export const newLog = (points) => ({ id: '', measuredAt: `${localDate()}T${String(new Date().getHours()).padStart(2, '0')}:00`, battery: '', readings: points.map((point) => ({ pointId: point.id, pointNameSnapshot: point.name, value: '', change: null })) });
