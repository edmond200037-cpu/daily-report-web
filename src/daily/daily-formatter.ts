import type { DailyReportV3, MaterialEntry, TradeSection, WorkItem } from '../domain/daily';
import { formatDate } from '../format/date-format';
import { groupOutputTrades, type OutputTradeGroup } from './daily-output-model';

const work = (item: WorkItem): string => `${item.startFloorNormalized || item.startFloorRaw.trim()}${item.endFloorNormalized || item.endFloorRaw.trim() ? `～${item.endFloorNormalized || item.endFloorRaw.trim()}` : ''}${item.locationTextSnapshot.trim()}${item.taskTextSnapshot.trim()}${item.note.trim() ? `；${item.note.trim()}` : ''}`;
const material = (entry: MaterialEntry): string => { const type = entry.materialTypeSnapshot.trim(); const item = entry.itemName.trim(); const supplier = entry.supplierNameSnapshot.trim(); if (!type || !item || !supplier || !entry.quantity.trim() || !entry.unit.trim()) return ''; return `${type}-${supplier}：${item}${entry.quantity.trim()}${entry.unit.trim()}${entry.specification.trim() ? `，${entry.specification.trim()}` : ''}${entry.note.trim() ? `；${entry.note.trim()}` : ''}。`; };
const vendorLine = (section: TradeSection): string => { const construction = section.workItems.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(work).filter(Boolean).join('、'); return construction ? `${section.vendorNameSnapshot.trim()}${section.workerCount}工-${construction}。` : ''; };
const trade = (group: OutputTradeGroup): string => { const construction = group.sections.map(vendorLine).filter(Boolean); const materials = group.materials.map(material).filter(Boolean); if (!construction.length) return ''; if (!materials.length) return construction.length === 1 ? `${group.title}：${construction[0]}` : `${group.title}：\n${construction.join('\n')}`; return `${group.title}：\n${[`1.${construction.join('\n  ')}`, ...materials.map((item, index) => `${index + 2}.${item}`)].join('\n')}`; };
const contact = (item: DailyReportV3['contacts'][number]): string => { const tasks = item.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((task) => task.content.trim()).filter(Boolean); return item.tradeNameSnapshot.trim() && item.vendorNameSnapshot.trim() && tasks.length ? `${item.tradeNameSnapshot.trim()}－${item.vendorNameSnapshot.trim()}：${tasks.join('；')}。` : ''; };

export function formatDailyReport(report: DailyReportV3): string {
  const entries = report.standaloneMaterialEntries ?? [];
  const trades = groupOutputTrades(report).map(trade).filter(Boolean);
  const materials = entries.filter((entry) => entry.entryType !== 'independent').slice().sort((a, b) => a.sortOrder - b.sortOrder).map(material).filter(Boolean);
  const contacts = report.contacts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(contact).filter(Boolean);
  const special = report.specialItems.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.content.trim()).filter(Boolean);
  const content = [...trades, ...materials, contacts.length ? `-----------\n聯絡事項：\n${contacts.join('\n')}` : '', special.length ? `-----------\n特殊事項：\n${special.join('\n')}` : ''].filter(Boolean);
  return report.siteNameSnapshot.trim() ? [`${report.siteNameSnapshot.trim()}：${formatDate(report.date)}`, ...content].join('\n\n').trim() : content.join('\n\n');
}
