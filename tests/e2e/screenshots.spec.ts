import { test } from '@playwright/test';
import { DailyUI } from './helpers/daily-ui';
import { Metrics } from './helpers/metrics';
import { datesFor } from './helpers/report-date';
import { scenarios } from './fixtures/daily-scenarios';

// 改版前後截圖：SHOT_LABEL=before|after npx playwright test screenshots
const label = process.env.SHOT_LABEL ?? 'after';
const routes = ['daily', 'daily/history', 'water-level', 'settings', 'settings/memory', 'settings/data', 'settings/account', 'settings/water', 'settings/daily/sites', 'settings/daily/trade-tasks', 'settings/daily/locations', 'settings/daily/materials', 'settings/daily/templates', 'settings/debug'];

for (const scheme of ['light', 'dark'] as const) {
  test(`截圖 ${label} ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const scenario = scenarios.find((item) => item.id === 'standard')!;
    await page.goto('/#daily');
    await new DailyUI(page, new Metrics(page, info)).fill(scenario, datesFor(process.env.DAILY_E2E_DATE!));
    await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/daily-preview.png`, fullPage: true });
    await page.getByRole('button', { name: '關閉預覽' }).click();
    for (const route of routes) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/${route.replace(/\//g, '_')}.png`, fullPage: true });
    }
  });
}
