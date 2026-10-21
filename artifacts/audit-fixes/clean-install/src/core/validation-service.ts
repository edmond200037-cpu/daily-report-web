import type { DailyReport, ValidationIssue } from '../types/domain';

export function validateReport(report: DailyReport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!report.siteNameSnapshot.trim()) issues.push({ code: 'site-required', fieldPath: 'site', message: '請填寫工地名稱。', severity: 'error' });
  const main = report.sections.filter((section) => section.sectionType === 'construction' || section.sectionType === 'material');
  const contacts = report.sections.find((section) => section.sectionType === 'contact'); const specials = report.sections.find((section) => section.sectionType === 'special');
  if (!main.length && !contacts?.items.length && !specials?.items.length) issues.push({ code: 'content-required', fieldPath: 'sections', message: '請至少新增一筆日報內容。', severity: 'error' });
  report.sections.forEach((section) => {
    if (section.sectionType === 'construction') {
      if (!section.tradeNameSnapshot.trim()) issues.push({ code: 'trade-required', fieldPath: `sections.${section.id}`, message: '施工紀錄需要工種。', severity: 'error' });
      section.entries.forEach((entry) => {
        if ('workerCount' in entry && (!Number.isFinite(entry.workerCount) || entry.workerCount < 0 || !entry.workItems.some((item) => item.text.trim()))) issues.push({ code: 'work-invalid', fieldPath: `entries.${entry.id}`, message: '施工人數須為 0 以上，並至少填寫一項施工內容。', severity: 'error' });
        if ('quantity' in entry && (!entry.materialNameSnapshot.trim() || !entry.vendorNameSnapshot.trim() || entry.quantity <= 0 || !entry.unit.trim())) issues.push({ code: 'material-invalid', fieldPath: `entries.${entry.id}`, message: '材料名稱、廠商、數量與單位皆為必填。', severity: 'error' });
      });
    }
    if (section.sectionType === 'material' && (!section.entry.materialNameSnapshot.trim() || !section.entry.vendorNameSnapshot.trim() || section.entry.quantity <= 0 || !section.entry.unit.trim())) issues.push({ code: 'material-invalid', fieldPath: `sections.${section.id}`, message: '材料名稱、廠商、數量與單位皆為必填。', severity: 'error' });
    if (section.sectionType === 'contact') section.items.forEach((item) => { if (!item.tradeNameSnapshot || !item.vendorNameSnapshot || !item.plannedDate || !item.content.trim()) issues.push({ code: 'contact-invalid', fieldPath: `contacts.${item.id}`, message: '聯絡事項的工種、廠商、日期與內容皆為必填。', severity: 'error' }); });
  });
  return issues;
}
