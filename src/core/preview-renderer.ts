import { formatDate } from '../format/date-format';
import type { ConstructionSection, DailyReport, MaterialEntry, ReportSection, VendorWorkEntry } from '../types/domain';

const isMaterial = (entry: VendorWorkEntry | MaterialEntry): entry is MaterialEntry => 'materialNameSnapshot' in entry;
const renderMaterial = (entry: MaterialEntry) => `${entry.outputLabelSnapshot || entry.materialNameSnapshot}-${entry.vendorNameSnapshot}：${entry.materialNameSnapshot}${entry.quantity}${entry.unit}${entry.specification ? `，${entry.specification}` : ''}${entry.note ? `，${entry.note}` : ''}。`;
const renderVendor = (entry: VendorWorkEntry) => `${entry.vendorNameSnapshot}${entry.workerCount}工-${entry.workItems.sort((a,b) => a.sortOrder-b.sortOrder).map((item) => item.text.trim()).filter(Boolean).join('、')}。`;

function renderConstruction(section: ConstructionSection): string {
  const children = section.entries.sort((a,b) => a.sortOrder-b.sortOrder).map((entry) => isMaterial(entry) ? renderMaterial(entry) : renderVendor(entry)).filter((item) => item !== '。');
  if (!section.tradeNameSnapshot.trim() || children.length === 0) return '';
  return children.length === 1 ? `${section.tradeNameSnapshot}：${children[0]}` : `${section.tradeNameSnapshot}：\n${children.map((item, index) => `${index + 1}.${item}`).join('\n')}`;
}

function renderSection(section: ReportSection): string {
  if (section.sectionType === 'construction') return renderConstruction(section);
  if (section.sectionType === 'material') return renderMaterial(section.entry);
  if (section.sectionType === 'contact') {
    const items = section.items.sort((a,b) => a.sortOrder-b.sortOrder).filter((item) => item.tradeNameSnapshot && item.vendorNameSnapshot && item.plannedDate && item.content);
    return items.length ? `-----------\n聯絡事項：\n${items.map((item) => `${item.tradeNameSnapshot}-${item.vendorNameSnapshot}預定${formatDate(item.plannedDate)}${item.content.trim()}。`).join('\n')}` : '';
  }
  const items = section.items.sort((a,b) => a.sortOrder-b.sortOrder).map((item) => item.renderedText.trim()).filter(Boolean);
  return items.length ? `-----------\n特殊事項：\n${items.map((item) => item.endsWith('。') ? item : `${item}。`).join('\n')}` : '';
}

export function renderReport(report: DailyReport): string {
  const body = report.sections.filter((section) => section.sectionType === 'construction' || section.sectionType === 'material').sort((a,b) => a.sortOrder-b.sortOrder).map(renderSection).filter(Boolean);
  const suffix = report.sections.filter((section) => section.sectionType === 'contact' || section.sectionType === 'special').map(renderSection).filter(Boolean);
  const title = report.siteNameSnapshot.trim() ? `${report.siteNameSnapshot.trim()}：${formatDate(report.date)}` : '';
  return [title, ...body, ...suffix].filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
