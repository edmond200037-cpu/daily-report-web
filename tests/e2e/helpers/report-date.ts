export function taipeiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function datesFor(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error(`DAILY_E2E_DATE 必須是有效的 YYYY-MM-DD：${iso}`);
  }
  const contact = new Date(date);
  contact.setUTCDate(contact.getUTCDate() + 2);
  const display = (value: Date) => `${String(value.getUTCMonth() + 1).padStart(2, '0')}/${String(value.getUTCDate()).padStart(2, '0')}(${'日一二三四五六'[value.getUTCDay()]})`;
  return {
    reportISO: iso,
    contactISO: contact.toISOString().slice(0, 10),
    reportText: display(date),
    contactText: display(contact),
    fixedTime: `${iso}T12:00:00+08:00`,
  };
}

export function renderAnswer(template: string, dates: ReturnType<typeof datesFor>): string {
  const answer = template.replaceAll('{{REPORT_DATE}}', dates.reportText).replaceAll('{{CONTACT_DATE}}', dates.contactText);
  if (/\{\{[^}]+\}\}/.test(answer)) throw new Error('標準答案含未知佔位符');
  return answer;
}
