import type { DailyReportV3, TradeSection, WorkItem, MaterialEntry } from '../domain/daily';
import { normalizeName } from '../format/normalization';
import { floorRange, normalizeFloor } from './floor';
export interface DailyIssue { field: string; message: string; }
export function validateWorkerCount(value: string): boolean { return /^[1-9]\d*$/.test(value); }
export function validateMaterialEntry(entry: MaterialEntry): string[] { const issues: string[] = []; if (!entry.materialTypeSnapshot.trim()) issues.push('請填寫材料類型。'); if (!entry.itemName.trim()) issues.push('請填寫品名。'); if (!entry.supplierNameSnapshot.trim()) issues.push('請填寫供應商。'); if (!/^((?:[1-9]\d*)(?:\.\d+)?)$/.test(entry.quantity.trim())) issues.push('數量只能輸入大於 0 的數字。'); if (!entry.unit.trim()) issues.push('請填寫單位。'); return issues; }
const workKey = (item: WorkItem): string => `${normalizeName(floorRange(item.startFloorNormalized ?? '', item.endFloorNormalized ?? ''))}|${normalizeName(item.locationTextSnapshot)}|${normalizeName(item.taskTextSnapshot)}`;
export function validateTrade(trade: TradeSection, linkedMaterials: MaterialEntry[] = []): DailyIssue[] {
  const issues: DailyIssue[] = [];
  if (!trade.tradeNameSnapshot.trim()) issues.push({ field: 'trade', message: '請填寫工種。' });
  if (!trade.vendorNameSnapshot.trim()) issues.push({ field: 'vendor', message: '請選擇廠商。' });
  if (!trade.workerCount) issues.push({ field: 'workerCount', message: '請輸入施工人數。' });
  else if (!validateWorkerCount(trade.workerCount)) issues.push({ field: 'workerCount', message: '施工人數只能輸入大於 0 的整數。' });
  if (!trade.workItems.some((item) => item.taskTextSnapshot.trim())) issues.push({ field: 'workItems', message: '請至少新增一筆工項。' });
  const keys = new Set<string>();
  trade.workItems.forEach((item) => {
    if (!item.taskTextSnapshot.trim()) issues.push({ field: item.id, message: '工項不可空白。' });
    if (item.startFloorRaw && !normalizeFloor(item.startFloorRaw)) issues.push({ field: item.id, message: '樓層格式不正確，請輸入數字、B格式，或 RF／PH／MF／R1～R9。' });
    if (item.endFloorRaw && !normalizeFloor(item.endFloorRaw)) issues.push({ field: item.id, message: '樓層格式不正確，請輸入數字、B格式，或 RF／PH／MF／R1～R9。' });
    if (item.endFloorRaw && !item.startFloorRaw) issues.push({ field: item.id, message: '結束樓層有值時，請填寫起始樓層。' });
    const key = workKey(item); if (item.taskTextSnapshot.trim() && keys.has(key)) issues.push({ field: item.id, message: '同一工種與廠商不可重複相同樓層、位置與工項。' }); keys.add(key);
  });
  [...trade.materialEntries, ...linkedMaterials].forEach((entry) => validateMaterialEntry(entry).forEach((message) => issues.push({ field: entry.id, message })));
  return issues;
}

export function validateDailyForFinalization(report: DailyReportV3): string[] {
  const issues: string[] = [];
  if (!report.date) issues.push('請填寫日報日期。');
  if (!report.siteNameSnapshot.trim()) issues.push('請填寫工地名稱。');
  if (!report.tradeSections.length) issues.push('請至少完成一個工種。');
  if (report.tradeSections.some((trade) => trade.status !== 'complete')) issues.push('尚有工種草稿，請完成或刪除後再定稿。');
  if (!report.tradeSections.some((trade) => trade.status === 'complete')) issues.push('請至少完成一個工種。');
  report.tradeSections.filter((trade) => trade.status === 'complete').forEach((trade) => validateTrade(trade, report.standaloneMaterialEntries.filter((entry) => entry.entryType === 'independent' && entry.connectedTradeSectionId === trade.id)).forEach((issue) => issues.push(`${trade.tradeNameSnapshot || '工種'}：${issue.message}`)));
  return [...new Set(issues)];
}
