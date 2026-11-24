import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { scenarios } from '../tests/e2e/fixtures/daily-scenarios.ts';
import { datesFor, renderAnswer } from '../tests/e2e/helpers/report-date.ts';

// Input must be a completed old-UI Playwright run, never the new UI's output.
const [runPath, sourceRevision, reportISO] = process.argv.slice(2);
if (!runPath || !sourceRevision || !reportISO) throw new Error('用法：node --experimental-strip-types scripts/capture-baseline-output.ts <舊 UI results> <HEAD SHA> <執行日期>');
const input = resolve(runPath);
const output = resolve('tests/e2e/fixtures/baseline-output');
await mkdir(output, { recursive: true });
const directories = await readdir(input, { withFileTypes: true });
const captures = new Map<string, string>();
for (const entry of directories) {
  if (!entry.isDirectory()) continue;
  try {
    const metrics = JSON.parse(await readFile(join(input, entry.name, 'metrics.json'), 'utf8')) as { scenario?: string; complete?: boolean };
    if (metrics.scenario && !metrics.complete) throw new Error(`舊 UI 未完成填報與歷史驗證：${metrics.scenario}`);
    if (metrics.scenario) captures.set(metrics.scenario, entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
const records = [];
for (const scenario of scenarios) {
  const directory = captures.get(scenario.id);
  if (!directory) throw new Error(`缺少情境：${scenario.id}`);
  const actual = await readFile(join(input, directory, 'actual.txt'), 'utf8');
  let template = actual;
  if (!scenario.reportDate) {
    const dates = datesFor(reportISO);
    const headerDate = dates.reportText.replace(/^0/, '').replace('/0', '/').replace('(', '（').replace(')', '）');
    if (!actual.startsWith(`鑫天地六期：${headerDate}`)) throw new Error(`${scenario.id} 首行日期與執行日期不符`);
    template = template.replace(headerDate, '{{REPORT_DATE}}').replaceAll(dates.contactText, '{{CONTACT_DATE}}');
  }
  const dates = datesFor(scenario.reportDate ?? reportISO);
  const restored = renderAnswer(template, { ...dates, reportText: dates.reportText.replace(/^0/, '').replace('/0', '/').replace('(', '（').replace(')', '）') });
  if (restored !== actual) throw new Error(`${scenario.id} 佔位符還原後不等於舊 UI 原始輸出`);
  await writeFile(join(output, `${scenario.id}.txt`), template);
  records.push({ id: scenario.id, sha256: createHash('sha256').update(actual).digest('hex') });
}
await writeFile(join(output, 'provenance.json'), JSON.stringify({ sourceRevision, reportISO, source: '改版前 HEAD 隔離舊 UI，真實剪貼簿輸出；未以 formatter 生成答案', platform: process.platform, newline: '保留原始剪貼簿位元組', records }, null, 2) + '\n');
console.log(`已擷取 ${records.length} 個舊 UI 基準`);
