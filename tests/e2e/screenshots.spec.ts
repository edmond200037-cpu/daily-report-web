import { test } from '@playwright/test';
import { DailyUI } from './helpers/daily-ui';
import { Metrics } from './helpers/metrics';
import { datesFor } from './helpers/report-date';
import { scenarios } from './fixtures/daily-scenarios';

// 改版前後截圖：SHOT_LABEL=before|after npx playwright test screenshots
const label = process.env.SHOT_LABEL ?? 'after';
const routes = ['daily', 'daily/history', 'water-level', 'settings', 'settings/memory', 'settings/data', 'settings/account', 'settings/water', 'settings/daily/sites', 'settings/daily/trades', 'settings/daily/locations', 'settings/daily/materials'];

for (const scheme of ['light', 'dark'] as const) {
  test(`截圖 ${label} ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const scenario = scenarios.find((item) => item.id === 'standard')!;
    await page.goto('/#daily');
    await new DailyUI(page, new Metrics(page, info)).fill(scenario, datesFor(process.env.DAILY_E2E_DATE!));
    for (const route of routes) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/${route.replace(/\//g, '_')}.png`, fullPage: true });
    }
  });
}
