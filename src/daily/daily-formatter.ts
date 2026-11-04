import type { DailyReportV3, MaterialEntry, TradeSection, WorkItem } from '../domain/daily';
import { isPositiveDecimal } from '../shared/decimal';
import { formatDate } from '../format/date-format';
import { groupOutputTrades, type OutputTradeGroup } from './daily-output-model';
import { formatContactTask } from './entry-workflow';

const work = (item: WorkItem): string => `${item.startFloorNormalized || item.startFloorRaw.trim()}${item.endFloorNormalized || item.endFloorRaw.trim() ? `～${item.endFloorNormalized || item.endFloorRaw.trim()}` : ''}${item.locationTextSnapshot.trim()}${item.taskTextSnapshot.trim()}${item.note.trim() ? `；${item.note.trim()}` : ''}`;
// Sum decimal strings exactly so exported totals never contain floating point tails.
function sumQuantities(quantities: string[]): string {
  const scale = Math.max(...quantities.map((value) => value.split('.')[1]?.length ?? 0));
  const total = quantities.reduce((sum, value) => {
    const [whole, fraction = ''] = value.split('.');
    return sum + BigInt(whole + fraction.padEnd(scale, '0'));
  }, 0n).toString().padStart(scale + 1, '0');
  return scale ? `${total.slice(0, -scale)}.${total.slice(-scale)}`.replace(/\.?0+$/, '') : total;
}

function materialLines(entries: MaterialEntry[]): string[] {
  const groups = new Map<string, MaterialEntry[]>();
  for (const entry of entries) {
    if (!entry.materialTypeSnapshot.trim() || !entry.itemName.trim() || !entry.supplierNameSnapshot.trim() || !entry.quantity.trim() || !entry.unit.trim()) continue;
    const key = JSON.stringify([entry.materialTypeSnapshot.trim(), entry.supplierNameSnapshot.trim()]);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const first = group[0];
    const details = group.map((entry) => `${entry.itemName.trim()}${entry.quantity.trim()}${entry.unit.trim()}${entry.specification.trim() ? `，${entry.specification.trim()}` : ''}${entry.note.trim() ? `；${entry.note.trim()}` : ''}`).join('、');
    const units = new Map<string, string[]>();
    for (const entry of group) {
      const unit = entry.unit.trim();
      const quantities = units.get(unit) ?? [];
      quantities.push(entry.quantity.trim());
      units.set(unit, quantities);
    }
    const totals = group.length > 1 ? [...units].flatMap(([unit, quantities]) => quantities.every(isPositiveDecimal) ? [`${sumQuantities(quantities)}${unit}`] : []) : [];
    return `${first.materialTypeSnapshot.trim()}-${first.supplierNameSnapshot.trim()}：${details}${totals.length ? `，合計${totals.join('、')}` : ''}。`;
  });
}
const vendorLine = (section: TradeSection): string => { const construction = section.workItems.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(work).filter(Boolean).join('、'); return construction ? `${section.vendorNameSnapshot.trim()}${section.workerCount}工-${construction}。` : ''; };
const trade = (group: OutputTradeGroup): string => { const construction = group.sections.map(vendorLine).filter(Boolean); const materials = materialLines(group.materials); if (!construction.length) return ''; if (!materials.length) return construction.length === 1 ? `${group.title}：${construction[0]}` : `${group.title}：\n${construction.join('\n')}`; return `${group.title}：\n${[`1.${construction.join('\n  ')}`, ...materials.map((item, index) => `${index + 2}.${item}`)].join('\n')}`; };
const contact = (item: DailyReportV3['contacts'][number], date: string): string => { const tasks = item.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((task) => formatContactTask(task.content, date)).filter(Boolean); return item.tradeNameSnapshot.trim() && item.vendorNameSnapshot.trim() && tasks.length ? `${item.tradeNameSnapshot.trim()}-${item.vendorNameSnapshot.trim()}${tasks.join('；')}。` : ''; };

export function formatDailyReport(report: DailyReportV3): string {
  const entries = report.standaloneMaterialEntries ?? [];
  const trades = groupOutputTrades(report).map(trade).filter(Boolean);
  const materials = materialLines(entries.filter((entry) => entry.entryType !== 'independent').slice().sort((a, b) => a.sortOrder - b.sortOrder));
  const contacts = report.contacts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => contact(item, report.date)).filter(Boolean).map((line, index) => `${index + 1}.${line}`);
  const special = report.specialItems.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.content.trim()).filter(Boolean);
  const content = [...trades, ...materials, contacts.length ? `-----------\n聯絡事項：\n${contacts.join('\n')}` : '', special.length ? `-----------\n特殊事項：\n${special.join('\n')}` : ''].filter(Boolean);
  return report.siteNameSnapshot.trim() ? [`${report.siteNameSnapshot.trim()}：${formatDate(report.date)}`, ...content].join('\n\n').trim() : content.join('\n\n');
}
