import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { scenarios } from './fixtures/daily-scenarios';
import { datesFor, renderAnswer } from './helpers/report-date';
import { compareOutput } from './helpers/compare-output';
import { DailyUI } from './helpers/daily-ui';
import { Metrics } from './helpers/metrics';

for (const scenario of scenarios) {
  test(`${scenario.id}：從零填報、定稿與標準答案逐字比對`, async ({ page, context, browser }, info) => {
    const dates = datesFor(process.env.DAILY_E2E_DATE!);
    const metrics = new Metrics(page, info);
    const ui = new DailyUI(page, metrics);
    const errors: string[] = [];
    let complete = false;
    let textMatch: boolean | null = null;
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('dialog', async (dialog) => { errors.push(`非預期 ${dialog.type()}：${dialog.message()}`); await dialog.dismiss(); });
    // Requests to any other origin are blocked, including accidental auth/backend access.
    const externalRequests: string[] = [];
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5317') await route.continue();
      else { externalRequests.push(route.request().url()); await route.abort(); }
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5317' });
    await page.clock.setFixedTime(new Date(dates.fixedTime));
    try {
      await page.goto('/__e2e_blank');
      const pristine = await page.evaluate(async () => ({ databases: await indexedDB.databases(), localStorage: localStorage.length, sessionStorage: sessionStorage.length }));
      await writeFile(info.outputPath('initial-storage.json'), JSON.stringify(pristine, null, 2));
      expect(pristine).toEqual({ databases: [], localStorage: 0, sessionStorage: 0 });
      await page.goto('/#daily');
      await expect(page.getByRole('heading', { name: '施工日報', exact: true })).toBeVisible();
      const initialMemories = await page.evaluate(async () => {
        // Read through the app's sole DB entry; never seed or mutate test data.
        const modulePath = '/src/data/db.js';
        const { list } = await import(/* @vite-ignore */ modulePath);
        const configPath = '/src/config/runtime-config.ts';
        const { runtimeConfig } = await import(/* @vite-ignore */ configPath);
        if (runtimeConfig.mode !== 'local') throw new Error('E2E 伺服器必須為本機模式');
        const stores = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'material_memories', 'supplier_memories', 'floor_options', 'special_categories', 'special_templates', 'special_template_variables', 'vendor_tasks', 'materials', 'material_specifications', 'daily_reports'];
        return Object.fromEntries(await Promise.all(stores.map(async (store) => [store, (await list(store)).length])));
      });
      await writeFile(info.outputPath('initial-memories.json'), JSON.stringify(initialMemories, null, 2));
      expect(Object.values(initialMemories)).toEqual(Array(Object.keys(initialMemories).length).fill(0));
      const template = await readFile(new URL(`./fixtures/expected/${scenario.id}.txt`, import.meta.url), 'utf8');
      const expected = renderAnswer(template, dates);
      await writeFile(info.outputPath('expected.txt'), expected);
      await ui.fill(scenario, dates);
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await ui.click(ui.action('finalize'), '定稿並複製');
      await expect(page.locator('.daily-output__feedback')).toContainText('已在本機定稿並複製');
      const actual = await page.evaluate(() => navigator.clipboard.readText());
      await writeFile(info.outputPath('actual.txt'), actual);
      const comparison = compareOutput(expected, actual);
      textMatch = comparison.equal;
      await writeFile(info.outputPath('comparison.json'), JSON.stringify(comparison, null, 2));
      await writeFile(info.outputPath('output.diff'), comparison.diff);
      await info.attach('output.diff', { path: info.outputPath('output.diff'), contentType: 'text/plain' });
      // Validation navigation is outside the filling action counter.
      await page.getByRole('link', { name: '查看近 7 天' }).click();
      await expect(page.locator('.history-list article')).toHaveCount(1);
      expect(await page.locator('.history-list pre').textContent()).toBe(actual);
      await writeFile(info.outputPath('history.txt'), (await page.locator('.history-list pre').textContent())!);
      complete = true;
      expect(externalRequests, '測試不得向外部服務發出請求').toEqual([]);
      expect(errors, '瀏覽器錯誤或非預期對話框').toEqual([]);
      expect(actual, `逐字不符：${JSON.stringify(comparison.firstDifference)}；請檢查 output.diff`).toBe(expected);
    } finally {
      await metrics.finish(scenario.id, complete, { dates, browser: browser.version(), textMatch, errors, externalRequests, runId: process.env.DAILY_E2E_RUN_ID });
    }
  });
}
